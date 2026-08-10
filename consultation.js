// PrixTerrain — consultation par produit : relevés, moyenne, évolution.
//
// Aucun seuil, aucune durée, aucun coefficient n'est écrit ici : chacun est lu
// dans la table des réglages. Quand une ligne de réglage est vide, l'écran
// affiche le nom du réglage manquant et la conduite tenue à défaut.

(function (global) {
  'use strict';

  var A = global.PrixTerrain;
  var JOURS_PAR_MOIS = 30.4375;

  var COULEURS = ['#2f6f3e', '#b35c00', '#2b5c8a', '#7a3b7a', '#8a6f00', '#8a2f2f'];

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

  function dateFrancaise(iso) {
    if (!iso) return '';
    var p = String(iso).slice(0, 10).split('-');
    return p[2] + '/' + p[1] + '/' + p[0];
  }

  function nombreFrancais(valeur, decimales) {
    return Number(valeur).toLocaleString('fr-FR', {
      minimumFractionDigits: decimales === undefined ? 2 : decimales,
      maximumFractionDigits: decimales === undefined ? 2 : decimales
    });
  }

  function ageEnMois(datePrix, aujourdhui) {
    var jours = (aujourdhui - new Date(String(datePrix).slice(0, 10) + 'T00:00:00')) / 86400000;
    return jours / JOURS_PAR_MOIS;
  }

  function mediane(valeurs) {
    if (!valeurs.length) return null;
    var triees = valeurs.slice().sort(function (a, b) { return a - b; });
    var milieu = Math.floor(triees.length / 2);
    if (triees.length % 2) return triees[milieu];
    return (triees[milieu - 1] + triees[milieu]) / 2;
  }

  // -------------------------------------------------------------------------
  // Réglages
  // -------------------------------------------------------------------------
  function chargerReglages() {
    return A.bd.reglage.toArray().then(function (lignes) {
      var table = {};
      lignes.forEach(function (l) {
        table[l.cle + '|' + (l.famille_code || '')] = l;
      });
      return {
        lire: function (cle, famille) {
          return table[cle + '|' + (famille || '')] || null;
        },
        valeur: function (cle, famille) {
          var l = table[cle + '|' + (famille || '')];
          if (!l || l.valeur === null || l.valeur === undefined) return null;
          return Number(l.valeur);
        }
      };
    });
  }

  function encartReglageManquant(reglages, cle, famille) {
    var ligne = reglages.lire(cle, famille);
    var encart = element('div', 'manquant');
    encart.appendChild(element('p', 'manquant-nom',
      'Réglage non renseigné : ' + (ligne ? ligne.libelle : cle)));
    if (ligne) encart.appendChild(element('p', 'manquant-suite', ligne.conduite_si_vide));
    return encart;
  }

  // -------------------------------------------------------------------------
  // Relevés d'un produit
  // -------------------------------------------------------------------------
  function chargerContexte() {
    return Promise.all([
      A.bd.produit.toArray(),
      A.bd.fournisseur.toArray(),
      A.bd.agriculteur.toArray(),
      A.bd.unite_prix.toArray(),
      A.bd.famille_produit.toArray(),
      A.bd.profil.toArray(),
      A.bd.type_produit.toArray()
    ]).then(function (r) {
      function parIdentifiant(lignes, cle) {
        var t = {};
        lignes.forEach(function (l) { t[l[cle || 'id']] = l; });
        return t;
      }
      return {
        produits: parIdentifiant(r[0]),
        fournisseurs: parIdentifiant(r[1]),
        agriculteurs: parIdentifiant(r[2]),
        unites: parIdentifiant(r[3], 'code'),
        familles: parIdentifiant(r[4], 'code'),
        profils: parIdentifiant(r[5]),
        types: parIdentifiant(r[6], 'code'),
        listeTypes: r[6].slice().sort(function (a, b) { return a.ordre - b.ordre; })
      };
    });
  }

  // Suit fusionne_vers jusqu'à la fiche conservée.
  function ficheConservee(table, id) {
    var vue = {};
    var courante = table[id];
    while (courante && courante.fusionne_vers && !vue[courante.id]) {
      vue[courante.id] = true;
      courante = table[courante.fusionne_vers];
    }
    return courante || null;
  }

  function relevesDuProduit(produitId, contexte) {
    return A.relevesRetenus().then(function (tous) {
      return tous.filter(function (r) {
        var p = ficheConservee(contexte.produits, r.produit_id);
        return p && p.id === produitId;
      });
    });
  }

  // -------------------------------------------------------------------------
  // Agrégats
  // -------------------------------------------------------------------------
  function calculerAgregats(releves, contexte, reglages, famille, options) {
    var grouper = (options && options.grouper) || function (r, ctx) {
      var f = ficheConservee(ctx.fournisseurs, r.fournisseur_id);
      return { id: f ? f.id : 'inconnu', nom: f ? f.nom : 'Fournisseur non retrouvé' };
    };
    var aujourdhui = new Date();
    var validite = reglages.valeur('duree_validite', famille);

    // Un relevé compte tant qu'il est plus récent que la durée de validité de
    // sa famille. Au-delà, il reste affiché mais n'entre plus dans la moyenne.
    var retenus = releves.filter(function (r) {
      if (validite === null) return false;
      return ageEnMois(r.date_prix, aujourdhui) <= validite;
    });

    // Médiane par unité, tous fournisseurs confondus, pour le signalement.
    var parUnite = {};
    retenus.forEach(function (r) {
      if (!parUnite[r.unite_code]) parUnite[r.unite_code] = [];
      parUnite[r.unite_code].push(Number(r.prix_unitaire_ht));
    });
    var medianes = {};
    Object.keys(parUnite).forEach(function (u) { medianes[u] = mediane(parUnite[u]); });

    // Regroupement par fournisseur conservé puis par unité.
    var groupes = {};
    retenus.forEach(function (r) {
      var g = grouper(r, contexte) || { id: '*', nom: '' };
      var cle = g.id + '|' + r.unite_code;
      if (!groupes[cle]) {
        groupes[cle] = {
          nomGroupe: g.nom,
          unite: contexte.unites[r.unite_code] || { code: r.unite_code, libelle: r.unite_code },
          releves: []
        };
      }
      groupes[cle].releves.push(r);
    });

    var lignes = Object.keys(groupes).map(function (cle) {
      var g = groupes[cle];
      var n = g.releves.length;
      var plusAncien = g.releves.reduce(function (m, r) {
        return (!m || r.date_prix < m) ? r.date_prix : m;
      }, null);

      // Un seul relevé suffit : la moyenne est la moyenne simple des retenus.
      var calculable = validite !== null && n > 0 && plusAncien;
      var moyenne = null;
      if (calculable) {
        var somme = 0;
        g.releves.forEach(function (r) { somme += Number(r.prix_unitaire_ht); });
        moyenne = somme / n;
      }

      return {
        nomGroupe: g.nomGroupe,
        unite: g.unite,
        nombre: n,
        plusAncien: plusAncien,
        moyenne: moyenne,
        calculable: calculable,
        releves: g.releves.slice().sort(function (a, b) {
          return String(b.date_prix).localeCompare(String(a.date_prix));
        })
      };
    });

    lignes.sort(function (a, b) {
      if (a.nomGroupe !== b.nomGroupe) return a.nomGroupe.localeCompare(b.nomGroupe, 'fr');
      return a.unite.code.localeCompare(b.unite.code);
    });

    return {
      retenus: retenus,
      lignes: lignes,
      medianes: medianes,
      validite: validite,
      validiteAbsente: validite === null,
      seuilAtypique: reglages.valeur('ecart_atypique', '')
    };
  }

  // -------------------------------------------------------------------------
  // Courbe d'évolution, une par unité, une ligne par fournisseur
  // -------------------------------------------------------------------------
  function courbe(releves, contexte, unite) {
    var points = releves.filter(function (r) { return r.unite_code === unite.code; });
    if (points.length < 2) return null;

    var largeur = 700, hauteur = 260;
    var marge = { haut: 16, droite: 12, bas: 34, gauche: 62 };

    var dates = points.map(function (r) { return new Date(String(r.date_prix).slice(0, 10)).getTime(); });
    var prix = points.map(function (r) { return Number(r.prix_unitaire_ht); });
    var dateMin = Math.min.apply(null, dates), dateMax = Math.max.apply(null, dates);
    var prixMin = Math.min.apply(null, prix), prixMax = Math.max.apply(null, prix);
    if (dateMax === dateMin) dateMax = dateMin + 86400000;
    if (prixMax === prixMin) { prixMax = prixMin + 1; prixMin = Math.max(0, prixMin - 1); }

    function x(t) {
      return marge.gauche + (t - dateMin) / (dateMax - dateMin) * (largeur - marge.gauche - marge.droite);
    }
    function y(p) {
      return hauteur - marge.bas - (p - prixMin) / (prixMax - prixMin) * (hauteur - marge.haut - marge.bas);
    }

    var svg = global.document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 ' + largeur + ' ' + hauteur);
    svg.setAttribute('class', 'courbe');
    svg.setAttribute('role', 'img');

    function tracer(balise, attributs, texte) {
      var e = global.document.createElementNS('http://www.w3.org/2000/svg', balise);
      Object.keys(attributs).forEach(function (a) { e.setAttribute(a, attributs[a]); });
      if (texte !== undefined) e.textContent = texte;
      svg.appendChild(e);
      return e;
    }

    tracer('line', { x1: marge.gauche, y1: hauteur - marge.bas, x2: largeur - marge.droite,
                     y2: hauteur - marge.bas, stroke: '#999' });
    tracer('line', { x1: marge.gauche, y1: marge.haut, x2: marge.gauche,
                     y2: hauteur - marge.bas, stroke: '#999' });
    tracer('text', { x: 4, y: y(prixMax) + 4, 'font-size': 12, fill: '#444' }, nombreFrancais(prixMax));
    tracer('text', { x: 4, y: y(prixMin) + 4, 'font-size': 12, fill: '#444' }, nombreFrancais(prixMin));
    tracer('text', { x: marge.gauche, y: hauteur - 10, 'font-size': 12, fill: '#444' },
           dateFrancaise(new Date(dateMin).toISOString()));
    tracer('text', { x: largeur - marge.droite, y: hauteur - 10, 'font-size': 12, fill: '#444',
                     'text-anchor': 'end' }, dateFrancaise(new Date(dateMax).toISOString()));

    var parFournisseur = {};
    points.forEach(function (r) {
      var f = ficheConservee(contexte.fournisseurs, r.fournisseur_id);
      var nom = f ? f.nom : 'Fournisseur non retrouvé';
      if (!parFournisseur[nom]) parFournisseur[nom] = [];
      parFournisseur[nom].push(r);
    });

    var noms = Object.keys(parFournisseur).sort(function (a, b) { return a.localeCompare(b, 'fr'); });
    var legende = element('div', 'legende');

    noms.forEach(function (nom, rang) {
      var couleur = COULEURS[rang % COULEURS.length];
      var serie = parFournisseur[nom].slice().sort(function (a, b) {
        return String(a.date_prix).localeCompare(String(b.date_prix));
      });
      var chemin = serie.map(function (r, i) {
        var t = new Date(String(r.date_prix).slice(0, 10)).getTime();
        return (i ? 'L' : 'M') + x(t).toFixed(1) + ' ' + y(Number(r.prix_unitaire_ht)).toFixed(1);
      }).join(' ');
      if (serie.length > 1) {
        tracer('path', { d: chemin, fill: 'none', stroke: couleur, 'stroke-width': 2 });
      }
      serie.forEach(function (r) {
        var t = new Date(String(r.date_prix).slice(0, 10)).getTime();
        tracer('circle', { cx: x(t).toFixed(1), cy: y(Number(r.prix_unitaire_ht)).toFixed(1),
                           r: 4, fill: couleur });
      });
      var entree = element('span', 'legende-entree');
      var pastille = element('span', 'pastille');
      pastille.style.background = couleur;
      entree.appendChild(pastille);
      entree.appendChild(element('span', null, nom));
      legende.appendChild(entree);
    });

    var bloc = element('div', 'bloc-courbe');
    bloc.appendChild(element('p', 'titre-bloc', 'Évolution des relevés en ' + unite.libelle));
    bloc.appendChild(svg);
    bloc.appendChild(legende);
    return bloc;
  }

  // -------------------------------------------------------------------------
  // Écran
  // -------------------------------------------------------------------------
  function afficherFicheProduit(zone, compte, parametres) {
    var produit = parametres.fiche;
    var contexte = null;
    var reglages = null;

    zone.innerHTML = '';
    zone.className = 'ecran-fiche';
    zone.appendChild(element('p', 'appui', 'Lecture des relevés…'));

    Promise.all([chargerContexte(), chargerReglages()]).then(function (r) {
      contexte = r[0];
      reglages = r[1];
      relevesDuProduit(produit.id, contexte).then(dessiner);
    });

    function dessiner(releves) {
      zone.innerHTML = '';
      var dates = releves.map(function (x) { return x.date_prix; }).sort();
      var res = releves.length
        ? calculerAgregats(releves, contexte, reglages, produit.famille_code)
        : { lignes: [], retenus: [], medianes: {}, seuilAtypique: null };

      // --- en-tête ---
      var famille = contexte.familles[produit.famille_code];
      var entete = element('div', 'entete-fiche');
      entete.appendChild(element('p', 'surtitre',
        (famille ? famille.libelle : produit.famille_code) +
        (produit.type_code && contexte.types && contexte.types[produit.type_code]
          ? ' · ' + contexte.types[produit.type_code].libelle : '')));
      entete.appendChild(element('h2', null, produit.nom));
      entete.appendChild(element('p', 'sous-titre', releves.length
        ? 'Dernier relevé le ' + dateFrancaise(dates[dates.length - 1])
        : 'Aucun relevé'));
      zone.appendChild(entete);

      // --- moyenne globale et meilleur prix récent ---
      var compteUnite = {}, uniteDominante = null;
      res.retenus.forEach(function (x) {
        compteUnite[x.unite_code] = (compteUnite[x.unite_code] || 0) + 1;
        if (!uniteDominante || compteUnite[x.unite_code] > compteUnite[uniteDominante]) {
          uniteDominante = x.unite_code;
        }
      });
      var duBloc = res.retenus.filter(function (x) { return x.unite_code === uniteDominante; });

      var aujourdhui = new Date();

      var globale = null, plusAncienGlobal = null;
      if (duBloc.length) {
        var somme = 0;
        duBloc.forEach(function (x) { somme += Number(x.prix_unitaire_ht); });
        globale = somme / duBloc.length;
        plusAncienGlobal = duBloc.map(function (x) { return x.date_prix; }).sort()[0];
      }

      var derniers = {}, meilleur = null;
      duBloc.forEach(function (x) {
        var f = ficheConservee(contexte.fournisseurs, x.fournisseur_id);
        var idf = f ? f.id : 'inconnu';
        if (!derniers[idf] || x.date_prix > derniers[idf].date_prix) derniers[idf] = x;
      });
      Object.keys(derniers).forEach(function (idf) {
        if (!meilleur || Number(derniers[idf].prix_unitaire_ht) < Number(meilleur.prix_unitaire_ht)) {
          meilleur = derniers[idf];
        }
      });

      var bloc = element('div', globale !== null ? 'chiffre-principal' : 'chiffre-principal absent');
      bloc.appendChild(element('p', 'cp-question', 'Ce produit coûte en moyenne'));
      if (globale !== null) {
        var u = contexte.unites[uniteDominante];
        var v = element('p', 'cp-valeur');
        v.appendChild(element('span', null, nombreFrancais(globale)));
        v.appendChild(element('span', 'cp-unite', ' ' + (u ? u.libelle : uniteDominante)));
        bloc.appendChild(v);
        var pastilles = element('div', 'cp-pastilles');
        pastilles.appendChild(element('span',
          'cp-pastille' + (duBloc.length < 3 ? ' peu' : ''),
          duBloc.length + (duBloc.length > 1 ? ' relevés' : ' relevé')));
        pastilles.appendChild(element('span', 'cp-pastille',
          'depuis ' + dateFrancaise(plusAncienGlobal)));
        bloc.appendChild(pastilles);
      } else {
        bloc.appendChild(element('p', 'cp-valeur-absente', releves.length
          ? 'Pas encore assez de relevés' : 'Aucun relevé pour ce produit'));
        bloc.appendChild(element('p', 'cp-appui', releves.length
          ? (res.validiteAbsente
             ? 'La durée de validité n\'est pas renseignée dans les Réglages.'
             : 'Tous ses relevés ont plus de ' + nombreFrancais(res.validite, 0) + ' mois.')
          : 'Il figure au catalogue, son prix n\'a pas encore été relevé.'));
      }
      if (meilleur) {
        var f2 = ficheConservee(contexte.fournisseurs, meilleur.fournisseur_id);
        var um = contexte.unites[meilleur.unite_code];
        var ligne = element('p', 'cp-meilleur');
        ligne.appendChild(element('span', 'cp-meilleur-etq', 'Le moins cher récemment '));
        ligne.appendChild(element('b', null,
          nombreFrancais(meilleur.prix_unitaire_ht) + ' ' + (um ? um.libelle : meilleur.unite_code)));
        ligne.appendChild(element('span', null,
          ' chez ' + (f2 ? f2.nom : 'fournisseur non retrouvé') +
          ', le ' + dateFrancaise(meilleur.date_prix)));
        bloc.appendChild(ligne);
      }
      zone.appendChild(bloc);

      // --- réglages manquants ---
      [['duree_validite', produit.famille_code], ['ecart_atypique', '']]
        .forEach(function (paire) {
          if (reglages.valeur(paire[0], paire[1]) === null) {
            zone.appendChild(encartReglageManquant(reglages, paire[0], paire[1]));
          }
        });

      // --- onglets ---
      var actions = element('div', 'actions-fiche');
      actions.appendChild(bouton('action-fiche', 'Saisir un prix pour ce produit', function () {
        A.naviguer('saisie', { produit: produit });
      }));
      zone.appendChild(actions);

      var ongletCourant = 'comparaison';
      var onglets = element('div', 'onglets-fiche');
      var contenu = element('div');
      zone.appendChild(onglets);
      zone.appendChild(contenu);
      A.suivreHauteur(contenu);

      function poserOnglets() {
        onglets.innerHTML = '';
        [['comparaison', 'Comparaison'], ['releves', 'Relevés']].forEach(function (o) {
          onglets.appendChild(bouton(ongletCourant === o[0] ? 'on' : '', o[1], function () {
            ongletCourant = o[0];
            poserOnglets();
            poserContenu();
          }));
        });
      }

      function poserContenu() {
        contenu.innerHTML = '';
        if (ongletCourant === 'comparaison') poserComparaison();
        else poserReleves();
        A.ajusterHauteurs();
      }

      function poserComparaison() {
        if (!res.lignes.length) {
          contenu.appendChild(element('p', 'vide', 'Aucun relevé pour ce produit.'));
          return;
        }
        var moinsCher = null;
        res.lignes.forEach(function (l) {
          if (l.calculable && (moinsCher === null || l.moyenne < moinsCher)) moinsCher = l.moyenne;
        });

        var tableau = element('div', 'tableau-prix');
        var entete = element('div', 'rangee entete');
        entete.appendChild(element('span', 'col-produit', 'Fournisseur'));
        var m = element('span', 'col-meta');
        m.appendChild(element('span', 'col-fournisseur', 'Relevés'));
        m.appendChild(element('span', 'col-date', 'Plus ancien'));
        entete.appendChild(m);
        entete.appendChild(element('span', 'col-prix', 'Prix moyen'));
        entete.appendChild(element('span', 'col-evolution', 'Écart'));
        tableau.appendChild(entete);

        res.lignes.slice().sort(function (a, b) {
          if (a.calculable !== b.calculable) return a.calculable ? -1 : 1;
          return (a.moyenne || 0) - (b.moyenne || 0);
        }).forEach(function (l) {
          var ligne = element('div', 'rangee');
          ligne.appendChild(element('span', 'col-produit', l.nomGroupe));
          var meta = element('span', 'col-meta');
          meta.appendChild(element('span', 'col-fournisseur',
            l.nombre + (l.nombre > 1 ? ' relevés' : ' relevé')));
          meta.appendChild(element('span', 'col-date', dateFrancaise(l.plusAncien)));
          ligne.appendChild(meta);

          var prix = element('span', 'col-prix');
          if (l.calculable) {
            prix.appendChild(element('span', null, nombreFrancais(l.moyenne)));
            prix.appendChild(element('span', 'unite-discrete', ' ' + l.unite.libelle));
          } else {
            prix.appendChild(element('span', 'unite-discrete', 'non calculable'));
          }
          ligne.appendChild(prix);

          if (!l.calculable) {
            ligne.className = 'rangee attention';
            ligne.appendChild(element('span', 'col-evolution neutre', 'non calculable'));
          } else if (l.moyenne === moinsCher) {
            ligne.className = 'rangee mieux';
            ligne.appendChild(element('span', 'col-evolution baisse', '▼ le moins cher'));
          } else {
            ligne.appendChild(element('span', 'col-evolution hausse',
              '▲ +' + nombreFrancais((l.moyenne - moinsCher) / moinsCher * 100, 1) + ' %'));
          }
          tableau.appendChild(ligne);
        });
        contenu.appendChild(tableau);
      }

      function poserReleves() {
        if (!releves.length) { contenu.appendChild(element('p', 'vide', 'Aucun relevé.')); return; }

        var tableau = element('div', 'tableau-prix');
        var entete = element('div', 'rangee entete');
        entete.appendChild(element('span', 'col-produit', 'Fournisseur'));
        var m = element('span', 'col-meta');
        m.appendChild(element('span', 'col-fournisseur', 'Relevé par'));
        m.appendChild(element('span', 'col-date', 'Date'));
        entete.appendChild(m);
        entete.appendChild(element('span', 'col-prix', 'Prix'));
        entete.appendChild(element('span', 'col-evolution', 'Écart au médian'));
        tableau.appendChild(entete);

        var aujourdhui = new Date();
        var perimes = 0;

        // L'historique montre tout. Un relevé périmé reste visible, en gris.
        releves.slice().sort(function (a, b) {
          return String(b.date_prix).localeCompare(String(a.date_prix));
        }).forEach(function (x) {
          var perime = res.validite === null ||
                       ageEnMois(x.date_prix, aujourdhui) > res.validite;
          if (perime) perimes++;

          var med = res.medianes[x.unite_code];
          var ecart = (!perime && med)
            ? (Number(x.prix_unitaire_ht) - med) / med * 100 : null;
          var atypique = ecart !== null && res.seuilAtypique !== null &&
                         Math.abs(ecart) > res.seuilAtypique;

          var f = ficheConservee(contexte.fournisseurs, x.fournisseur_id);
          var auteur = contexte.profils ? contexte.profils[x.saisi_par] : null;
          var u = contexte.unites[x.unite_code];

          var ligne = element('div', 'rangee' + (atypique ? ' attention' : '') +
                                     (perime ? ' perime' : ''));
          ligne.appendChild(element('span', 'col-produit',
            f ? f.nom : 'fiche non retrouvée'));

          var meta = element('span', 'col-meta');
          meta.appendChild(element('span', 'col-fournisseur', auteur ? auteur.nom : ''));
          meta.appendChild(element('span', 'col-date', dateFrancaise(x.date_prix)));
          ligne.appendChild(meta);

          var prix = element('span', 'col-prix');
          prix.appendChild(element('span', null, nombreFrancais(x.prix_unitaire_ht)));
          prix.appendChild(element('span', 'unite-discrete',
            ' ' + (u ? u.libelle : x.unite_code)));
          ligne.appendChild(prix);

          if (perime) {
            ligne.appendChild(element('span', 'col-evolution neutre', 'ne compte plus'));
          } else if (ecart === null) {
            ligne.appendChild(element('span', 'col-evolution neutre', '—'));
          } else if (atypique) {
            ligne.appendChild(element('span', 'col-evolution hausse',
              '⚠ ' + (ecart > 0 ? '+' : '') + nombreFrancais(ecart, 1) + ' %'));
          } else {
            var sens = ecart > 0.05 ? 'hausse' : (ecart < -0.05 ? 'baisse' : 'neutre');
            var fleche = sens === 'hausse' ? '▲ ' : (sens === 'baisse' ? '▼ ' : '= ');
            ligne.appendChild(element('span', 'col-evolution ' + sens,
              fleche + (ecart > 0 ? '+' : '') + nombreFrancais(ecart, 1) + ' %'));
          }
          tableau.appendChild(ligne);
        });

        contenu.appendChild(tableau);

        if (perimes && res.validite !== null) {
          contenu.appendChild(element('p', 'note-perimes',
            perimes + (perimes > 1 ? ' relevés ont ' : ' relevé a ') + 'plus de ' +
            nombreFrancais(res.validite, 0) +
            ' mois : ils restent visibles mais n\'entrent plus dans le prix moyen.'));
        }
      }

      poserOnglets();
      poserContenu();
    }
  }

  A.calculs = {
    chargerContexte: chargerContexte,
    chargerReglages: chargerReglages,
    calculerAgregats: calculerAgregats,
    encartReglageManquant: encartReglageManquant,
    ficheConservee: ficheConservee,
    dateFrancaise: dateFrancaise,
    nombreFrancais: nombreFrancais,
    element: element,
    bouton: bouton
  };

  A.afficherFicheProduit = afficherFicheProduit;
})(window);
