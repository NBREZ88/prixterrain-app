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

  function afficherRapprochement(zone, compte) {
    var tableCourante = 'produit';

    function dessiner() {
      zone.innerHTML = '';
      var bandeau = element('header', 'bandeau');
      bandeau.appendChild(element('h1', null, 'Fiches qui se ressemblent'));
      zone.appendChild(bandeau);

      if (compte.role !== 'administrateur') {
        zone.appendChild(element('p', 'alerte',
          'Seul un responsable peut rattacher deux fiches. Signalez-lui les doublons que vous repérez.'));
      }

      var onglets = element('div', 'onglets');
      Object.keys(LIBELLE_TABLE).forEach(function (table) {
        var actif = table === tableCourante;
        onglets.appendChild(bouton(actif ? 'onglet actif' : 'onglet', LIBELLE_TABLE[table], function () {
          tableCourante = table;
          dessiner();
        }));
      });
      zone.appendChild(onglets);

      var resultat = element('div');
      resultat.appendChild(element('p', null, 'Recherche en cours…'));
      zone.appendChild(resultat);

      chercherDoublons(tableCourante).then(function (groupes) {
        resultat.innerHTML = '';
        if (!groupes.length) {
          resultat.appendChild(element('p', 'confirmation',
            'Aucune fiche en double repérée pour le moment.'));
          return;
        }
        resultat.appendChild(element('p', null,
          groupes.length + (groupes.length > 1 ? ' rapprochements possibles' : ' rapprochement possible')));
        groupes.forEach(function (groupe) {
          resultat.appendChild(carteGroupe(tableCourante, groupe, dessiner));
        });
      });
    }

    function carteGroupe(table, groupe, redessiner) {
      var carte = element('div', 'groupe');
      var alerte = element('p', 'alerte');
      alerte.style.display = 'none';

      groupe.forEach(function (fiche) {
        var ligne = element('div', 'ligne-fiche');
        var texte = element('div');
        texte.appendChild(element('span', 'choix-nom', fiche.nom));
        texte.appendChild(element('span', 'appui',
          fiche.releves + (fiche.releves > 1 ? ' relevés' : ' relevé')));
        ligne.appendChild(texte);

        if (compte.role === 'administrateur') {
          ligne.appendChild(bouton('lien', 'Garder celle-ci', function () {
            var ecartes = groupe.filter(function (f) { return f.id !== fiche.id; })
                                .map(function (f) { return f.id; });
            rattacher(table, ecartes, fiche.id)
              .then(redessiner)
              .catch(function (erreur) {
                alerte.textContent = A.messageSimple(erreur);
                alerte.style.display = 'block';
              });
          }));
        }
        carte.appendChild(ligne);
      });

      carte.appendChild(alerte);
      return carte;
    }

    dessiner();
  }

  A.rechercherFiches = rechercherFiches;
  A.chercherDoublons = chercherDoublons;
  A.oublierIndex = oublierIndex;
  A.afficherRapprochement = afficherRapprochement;
})(window);
