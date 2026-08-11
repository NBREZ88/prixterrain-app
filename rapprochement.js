// PrixTerrain — recherche des fiches et rapprochement des doublons.
//
// Les cinq paliers de score et la tolérance ci-dessous ordonnent des
// propositions à l'écran. Ils n'entrent dans aucun calcul de prix, et
// <parametres> ne comporte aucune ligne les concernant.

(function (global) {
  'use strict';

  var A = global.PrixTerrain;

  var SCORE_EXACT = 100;
  var SCORE_DEBUT = 90;
  var SCORE_MOT = 70;
  var SCORE_CONTIENT = 50;
  var SCORE_APPROCHANT = 30;
  var LONGUEUR_BLOC = 4;

  function tolerance(texte) {
    if (texte.length <= 5) return 1;
    if (texte.length <= 9) return 2;
    return 3;
  }

  // Nombre minimal d'ajouts, retraits ou remplacements d'un caractère.
  // Le calcul s'arrête dès que la limite est dépassée.
  function distance(a, b, limite) {
    if (a === b) return 0;
    if (Math.abs(a.length - b.length) > limite) return limite + 1;
    var precedente = [];
    var courante = [];
    var i, j;
    for (j = 0; j <= b.length; j++) precedente[j] = j;
    for (i = 1; i <= a.length; i++) {
      courante[0] = i;
      var meilleure = courante[0];
      for (j = 1; j <= b.length; j++) {
        var cout = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;
        courante[j] = Math.min(courante[j - 1] + 1, precedente[j] + 1, precedente[j - 1] + cout);
        if (courante[j] < meilleure) meilleure = courante[j];
      }
      if (meilleure > limite) return limite + 1;
      for (j = 0; j <= b.length; j++) precedente[j] = courante[j];
    }
    return precedente[b.length];
  }

  function score(normalise, cherche) {
    if (normalise === cherche) return SCORE_EXACT;
    if (normalise.indexOf(cherche) === 0) return SCORE_DEBUT;
    var mots = normalise.split(' ');
    for (var i = 0; i < mots.length; i++) {
      if (mots[i].indexOf(cherche) === 0) return SCORE_MOT;
    }
    if (normalise.indexOf(cherche) >= 0) return SCORE_CONTIENT;
    var limite = tolerance(cherche);
    var d = distance(normalise, cherche, limite);
    if (d <= limite) return SCORE_APPROCHANT - d;
    return 0;
  }

  // -------------------------------------------------------------------------
  // Index en mémoire, reconstruit quand le nombre de fiches change
  // -------------------------------------------------------------------------
  var index = {};

  function chargerIndex(table) {
    return A.bd.table(table).count().then(function (nombre) {
      var connu = index[table];
      if (connu && connu.nombre === nombre) return connu.fiches;
      return A.bd.table(table).toArray().then(function (lignes) {
        var fiches = lignes.map(function (l) {
          return {
            id: l.id,
            nom: l.nom,
            normalise: A.normaliserLibelle(l.nom),
            fusionne_vers: l.fusionne_vers || null,
            ligne: l
          };
        });
        index[table] = { nombre: nombre, fiches: fiches };
        return fiches;
      });
    });
  }

  function oublierIndex(table) {
    if (table) delete index[table];
    else index = {};
  }

  function rechercherFiches(table, texte, combien) {
    var cherche = A.normaliserLibelle(texte);
    if (!cherche) return Promise.resolve([]);
    return chargerIndex(table).then(function (fiches) {
      var retenues = [];
      fiches.forEach(function (f) {
        if (f.fusionne_vers) return;
        var s = score(f.normalise, cherche);
        if (s > 0) retenues.push({ fiche: f, score: s });
      });
      retenues.sort(function (a, b) {
        if (b.score !== a.score) return b.score - a.score;
        if (a.fiche.nom.length !== b.fiche.nom.length) return a.fiche.nom.length - b.fiche.nom.length;
        return a.fiche.nom.localeCompare(b.fiche.nom, 'fr');
      });
      return retenues.slice(0, combien || 8).map(function (r) { return r.fiche.ligne; });
    });
  }

  // -------------------------------------------------------------------------
  // Fiches en double
  // -------------------------------------------------------------------------
  function chercherDoublons(table) {
    return chargerIndex(table).then(function (fiches) {
      var vivantes = fiches.filter(function (f) { return !f.fusionne_vers && f.normalise; });
      var blocs = {};
      vivantes.forEach(function (f) {
        var cle = f.normalise.slice(0, LONGUEUR_BLOC);
        if (!blocs[cle]) blocs[cle] = [];
        blocs[cle].push(f);
      });

      var groupes = [];
      Object.keys(blocs).forEach(function (cle) {
        var lot = blocs[cle];
        if (lot.length < 2) return;
        var deja = {};
        for (var i = 0; i < lot.length; i++) {
          if (deja[lot[i].id]) continue;
          var groupe = [lot[i]];
          for (var j = i + 1; j < lot.length; j++) {
            if (deja[lot[j].id]) continue;
            var a = lot[i].normalise;
            var b = lot[j].normalise;
            var court = a.length <= b.length ? a : b;
            var limite = tolerance(court);
            var proches = a.indexOf(b) === 0 || b.indexOf(a) === 0 || distance(a, b, limite) <= limite;
            if (proches) { groupe.push(lot[j]); deja[lot[j].id] = true; }
          }
          if (groupe.length > 1) { deja[lot[i].id] = true; groupes.push(groupe); }
        }
      });

      // Les fiches les plus utilisées d'abord : ce sont celles qu'un conseiller
      // reconnaît, et le rattachement se décide plus vite.
      return compterRelevesParFiche(table).then(function (compte) {
        groupes.forEach(function (groupe) {
          groupe.forEach(function (f) { f.releves = compte[f.id] || 0; });
          groupe.sort(function (x, y) { return y.releves - x.releves; });
        });
        groupes.sort(function (g1, g2) {
          var t1 = g1.reduce(function (t, f) { return t + f.releves; }, 0);
          var t2 = g2.reduce(function (t, f) { return t + f.releves; }, 0);
          return t2 - t1;
        });
        return groupes;
      });
    });
  }

  var COLONNE_RELEVE = {
    fournisseur: 'fournisseur_id',
    produit: 'produit_id'
  };

  function compterRelevesParFiche(table) {
    var colonne = COLONNE_RELEVE[table];
    return A.bd.releve.toArray().then(function (releves) {
      var compte = {};
      releves.forEach(function (r) {
        if (r.type !== 'prix') return;
        var id = r[colonne];
        if (id) compte[id] = (compte[id] || 0) + 1;
      });
      return compte;
    });
  }

  // Le rattachement écrit la colonne fusionne_vers de la fiche écartée.
  // Aucun relevé n'est touché : ils restent attachés à leur fiche d'origine,
  // les écrans de consultation suivront le rattachement pour les regrouper.
  function rattacher(table, idsEcartes, idConserve) {
    if (!global.navigator.onLine) {
      return Promise.reject(new Error("L'équipe n'est pas joignable pour l'instant."));
    }
    return A.base.from(table)
      .update({ fusionne_vers: idConserve })
      .in('id', idsEcartes)
      .then(function (reponse) {
        if (reponse.error) throw reponse.error;
        return Promise.all(idsEcartes.map(function (id) {
          return A.bd.table(table).get(id).then(function (ligne) {
            if (ligne) return A.bd.table(table).put(Object.assign({}, ligne, { fusionne_vers: idConserve }));
          });
        }));
      })
      .then(function () { oublierIndex(table); });
  }

  // -------------------------------------------------------------------------
  // Écran
  // -------------------------------------------------------------------------
  function element(balise, classe, texte) {
    var e = global.document.createElement(balise);
    if (classe) e.className = classe;
    if (texte !== undefined) e.textContent = texte;
    return e;
  }

  function bouton(classe, texte, action) {
    var b = element('button', classe, texte);
    b.type = 'button';
    b.addEventListener('click', action);
    return b;
  }

  var LIBELLE_TABLE = {
    produit: 'Produits',
    fournisseur: 'Fournisseurs'
  };

  // ---------------------------------------------------------------------------
  // Écran des fiches en double
  // ---------------------------------------------------------------------------

  function afficherRapprochement(zone, compte) {
    var C = A.calculs;
    var element = C.element;
    var bouton = C.bouton;
    var responsable = compte && compte.role === 'administrateur';

    var sur = 'fournisseur';
    var contexte = null, releves = [], fiches = {}, ecartes = {};

    zone.innerHTML = '';
    zone.appendChild(element('p', 'appui', 'Lecture…'));

    function charger() {
      return Promise.all([C.chargerContexte(), A.relevesRetenus(),
                          A.bd.produit.toArray(), A.bd.fournisseur.toArray(),
                          A.bd.ecartement_doublon.toArray()])
        .then(function (r) {
          contexte = r[0];
          releves = r[1];
          fiches = { produit: r[2], fournisseur: r[3] };
          ecartes = {};
          r[4].forEach(function (e) {
            ecartes[e.table_visee + '|' + e.fiche_a + '|' + e.fiche_b] = true;
            ecartes[e.table_visee + '|' + e.fiche_b + '|' + e.fiche_a] = true;
          });
        });
    }

    charger().then(dessiner);

    function comptes(fiche) {
      var siens = releves.filter(function (x) {
        var id = sur === 'fournisseur' ? x.fournisseur_id : x.produit_id;
        return id === fiche.id;
      });
      if (!siens.length) return { nombre: 0, depuis: null };
      return { nombre: siens.length,
               depuis: siens.map(function (x) { return String(x.date_prix); }).sort()[0] };
    }

    function candidats() {
      var lot = fiches[sur].filter(function (f) { return !f.fusionne_vers; });
      var out = [];
      for (var i = 0; i < lot.length; i++) {
        for (var j = i + 1; j < lot.length; j++) {
          var a = lot[i], b = lot[j];
          if (ecartes[sur + '|' + a.id + '|' + b.id]) continue;
          var na = A.normaliserFiche(a.nom), nb = A.normaliserFiche(b.nom);
          var raison = null, force = null;
          if (na === nb) { raison = 'même nom, écrit autrement'; force = 'fort'; }
          else if (A.distanceLibelle(na, nb) <= 2 && Math.min(na.length, nb.length) >= 4) {
            raison = 'deux caractères de différence'; force = 'fort';
          } else if (na.length && nb.length && (na.indexOf(nb) === 0 || nb.indexOf(na) === 0)) {
            raison = 'l\'un commence par l\'autre'; force = 'moyen';
          }
          if (!raison) continue;
          var ca = comptes(a), cb = comptes(b);
          out.push({ a: ca.nombre >= cb.nombre ? a : b,
                     b: ca.nombre >= cb.nombre ? b : a,
                     ca: ca.nombre >= cb.nombre ? ca : cb,
                     cb: ca.nombre >= cb.nombre ? cb : ca,
                     raison: raison, force: force });
        }
      }
      out.sort(function (x, y) { return x.force === 'fort' ? -1 : 1; });
      return out;
    }

    function dessiner() {
      zone.innerHTML = '';

      var onglets = element('div', 'sel-onglets');
      [['fournisseur', 'Fournisseurs'], ['produit', 'Produits']].forEach(function (e) {
        onglets.appendChild(bouton(sur === e[0] ? 'on' : '', e[1], function () {
          sur = e[0];
          dessiner();
        }));
      });
      zone.appendChild(onglets);

      if (!responsable) {
        zone.appendChild(element('div', 'encart-manquant',
          'Seul un responsable peut réunir deux fiches. Signalez-lui celles que vous repérez.'));
      }

      zone.appendChild(element('p', 'appui',
        'Fiches dont les noms se ressemblent. Vérifiez avant de décider : deux noms proches ' +
        'désignent souvent deux choses différentes.'));

      var liste = element('div');
      zone.appendChild(liste);
      A.suivreHauteur(liste);
      poser();

      function poser() {
        liste.innerHTML = '';
        var lot = candidats();

        if (!lot.length) {
          liste.appendChild(element('p', 'vide',
            'Aucune fiche ne ressemble à une autre. ' +
            'Les fiches jugées distinctes ne réapparaissent plus ici.'));
        } else {
          var tableau = element('div', 'table-doublons');

          var entete = element('div', 'doublon entete');
          entete.appendChild(element('span', 'doublon-a', 'Fiche la plus fournie'));
          entete.appendChild(element('span', 'doublon-b', 'Fiche proche'));
          entete.appendChild(element('span', 'doublon-raison', 'Ressemblance'));
          entete.appendChild(element('span', 'doublon-actions', ''));
          tableau.appendChild(entete);

          lot.forEach(function (p) {
            var ligne = element('div', 'doublon');
            ligne.appendChild(bloc('doublon-a', p.a, p.ca, true));
            ligne.appendChild(bloc('doublon-b', p.b, p.cb, false));

            var raison = element('span', 'doublon-raison');
            raison.appendChild(element('span',
              p.force === 'fort' ? 'age rouge' : 'age ocre', p.raison));
            ligne.appendChild(raison);

            var actions = element('span', 'doublon-actions');
            if (responsable) {
              actions.appendChild(bouton('mini-bouton', 'C\'est la même', function () {
                ouvrirReunion(p);
              }));
              actions.appendChild(bouton('mini-bouton clair', 'Fiches différentes', function () {
                ecarter(p);
              }));
            }
            ligne.appendChild(actions);
            tableau.appendChild(ligne);
          });
          liste.appendChild(tableau);

          var pied = element('div', 'pied-liste');
          pied.appendChild(element('span', null,
            lot.length + (lot.length > 1 ? ' paires à examiner' : ' paire à examiner')));
          liste.appendChild(pied);
        }

        poserReunies();
        A.ajusterHauteurs();

        function bloc(classe, fiche, compte, principal) {
          var c = element('span', classe);
          var nom = element('span', 'doublon-nom');
          if (!principal) nom.appendChild(element('span', 'doublon-lien', '↔ '));
          nom.appendChild(element('span', null, fiche.nom));
          c.appendChild(nom);
          c.appendChild(element('span', 'doublon-appui', compte.nombre
            ? compte.nombre + (compte.nombre > 1 ? ' relevés depuis ' : ' relevé depuis ') +
              C.dateFrancaise(compte.depuis)
            : 'aucun relevé'));
          return c;
        }

        function poserReunies() {
          var reunies = fiches[sur].filter(function (f) { return f.fusionne_vers; });
          if (!reunies.length) return;

          liste.appendChild(element('p', 'titre-section', 'Fiches réunies'));
          var bloc2 = element('div', 'table-doublons');

          reunies.forEach(function (f) {
            var vers = fiches[sur].filter(function (g) { return g.id === f.fusionne_vers; })[0];
            var ligne = element('div', 'doublon');

            var g = element('span', 'doublon-a');
            g.appendChild(element('span', 'doublon-nom', f.nom));
            g.appendChild(element('span', 'doublon-appui',
              'réunie à ' + (vers ? vers.nom : 'une autre fiche')));
            ligne.appendChild(g);

            ligne.appendChild(element('span', 'doublon-b', ''));
            ligne.appendChild(element('span', 'doublon-raison', ''));

            var actions = element('span', 'doublon-actions');
            if (responsable) {
              actions.appendChild(bouton('mini-bouton clair', 'Séparer', function () {
                separer(f);
              }));
            }
            ligne.appendChild(actions);
            bloc2.appendChild(ligne);
          });
          liste.appendChild(bloc2);
          liste.appendChild(element('p', 'note-perimes',
            'Séparer rend à la fiche ses relevés et la retire des rapprochements proposés.'));
        }
      }
    }

    // -----------------------------------------------------------------------
    // Écritures : un rattachement engage l'équipe, il passe par la base.
    // -----------------------------------------------------------------------
    function ouvrirReunion(p) {
      var voile = element('div', 'voile');
      var boite = element('div', 'boite');
      var garde = p.a;
      var cartes = {};

      var tete = element('div', 'boite-tete');
      var textes = element('div');
      textes.appendChild(element('p', 'boite-titre', 'Réunir ces deux fiches'));
      textes.appendChild(element('p', 'boite-sous',
        sur === 'fournisseur' ? 'Fournisseurs' : 'Produits'));
      tete.appendChild(textes);
      tete.appendChild(bouton('boite-fermer', '✕', function () { voile.remove(); }));
      boite.appendChild(tete);

      var corps = element('div', 'boite-corps');
      corps.appendChild(element('p', 'boite-appui', 'Quel nom garder ?'));

      [p.a, p.b].forEach(function (f) {
        var c = comptes(f);
        var carte = bouton('carte-fiche', '', function () { garde = f; majCartes(); });
        carte.appendChild(element('span', 'cf-nom', f.nom));
        carte.appendChild(element('span', 'cf-appui', c.nombre
          ? c.nombre + (c.nombre > 1 ? ' relevés depuis ' : ' relevé depuis ') +
            C.dateFrancaise(c.depuis)
          : 'aucun relevé'));
        cartes[f.id] = carte;
        corps.appendChild(carte);
      });

      var consequence = element('p', 'consequence');
      corps.appendChild(consequence);
      var alerte = element('p', 'alerte');
      alerte.style.display = 'none';
      corps.appendChild(alerte);
      boite.appendChild(corps);

      function majCartes() {
        [p.a, p.b].forEach(function (f) {
          cartes[f.id].className = 'carte-fiche' + (garde.id === f.id ? ' choisie' : '');
        });
        var autre = garde.id === p.a.id ? p.b : p.a;
        var cg = comptes(garde), ca = comptes(autre);
        consequence.textContent =
          'Les ' + ca.nombre + ' relevés de ' + autre.nom + ' compteront désormais pour ' +
          garde.nom + ', qui en aura ' + (cg.nombre + ca.nombre) + '. La fiche ' + autre.nom +
          ' n\'apparaîtra plus dans les recherches. Aucun relevé n\'est effacé.';
      }
      majCartes();

      var pied = element('div', 'boite-pied');
      pied.appendChild(bouton('principal pleine', 'Réunir', function () {
        var autre = garde.id === p.a.id ? p.b : p.a;
        if (!global.navigator.onLine) {
          alerte.textContent = 'Sans réseau, ce rattachement ne peut pas être enregistré : ' +
                               'il engage toute l\'équipe.';
          alerte.style.display = 'block';
          return;
        }
        A.base.from(sur).update({ fusionne_vers: garde.id }).eq('id', autre.id)
          .then(function (reponse) {
            if (reponse.error) throw reponse.error;
            return A.bd[sur].update(autre.id, { fusionne_vers: garde.id });
          })
          .then(function () { voile.remove(); return charger(); })
          .then(dessiner)
          .catch(function (e) {
            alerte.textContent = A.messageSimple(e);
            alerte.style.display = 'block';
          });
      }));
      pied.appendChild(bouton('bouton-neutre', 'Revenir', function () { voile.remove(); }));
      boite.appendChild(pied);

      voile.appendChild(boite);
      voile.addEventListener('click', function (e) { if (e.target === voile) voile.remove(); });
      document.body.appendChild(voile);
    }

    function ecarter(p) {
      // La paire est rangée dans un ordre stable, pour ne l'écrire qu'une fois.
      var a = p.a.id < p.b.id ? p.a.id : p.b.id;
      var b = p.a.id < p.b.id ? p.b.id : p.a.id;
      var ligne = { table_visee: sur, fiche_a: a, fiche_b: b,
                    ecarte_par: compte.id, ecarte_le: new Date().toISOString() };
      A.base.from('ecartement_doublon').insert(ligne)
        .then(function (reponse) {
          if (reponse.error) throw reponse.error;
          return A.bd.ecartement_doublon.put(ligne);
        })
        .then(charger)
        .then(dessiner)
        .catch(function () { charger().then(dessiner); });
    }

    function separer(fiche) {
      var vers = fiche.fusionne_vers;
      A.base.from(sur).update({ fusionne_vers: null }).eq('id', fiche.id)
        .then(function (reponse) {
          if (reponse.error) throw reponse.error;
          return A.bd[sur].update(fiche.id, { fusionne_vers: null });
        })
        .then(function () {
          var a = fiche.id < vers ? fiche.id : vers;
          var b = fiche.id < vers ? vers : fiche.id;
          var ligne = { table_visee: sur, fiche_a: a, fiche_b: b,
                        ecarte_par: compte.id, ecarte_le: new Date().toISOString() };
          return A.base.from('ecartement_doublon').insert(ligne).then(function () {
            return A.bd.ecartement_doublon.put(ligne);
          });
        })
        .then(charger)
        .then(dessiner)
        .catch(function () { charger().then(dessiner); });
    }
  }

  A.afficherRapprochement = afficherRapprochement;
})(window);
