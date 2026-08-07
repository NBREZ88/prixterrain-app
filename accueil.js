// PrixTerrain — écran d'accueil.
// Deux états : la page au repos, et les résultats de recherche qui la remplacent.
// Le tableau des derniers prix défile seul, la page ne bouge pas.

(function (global) {
  'use strict';

  var A = global.PrixTerrain;
  var LIGNES_ACCUEIL = 15;

  function afficherAccueil(zone, compte) {
    var C = A.calculs;
    var element = C.element;
    var bouton = C.bouton;

    var contexte = null;
    var releves = [];
    var familleActive = '';
    var tri = { colonne: 'date', sens: -1 };
    var enRecherche = false;

    zone.innerHTML = '';
    zone.className = 'ecran-accueil';

    // ---- recherche ----
    var haute = element('div', 'barre-haute');
    var recherche = element('div', 'recherche');
    var champ = element('input', 'champ-recherche');
    champ.type = 'search';
    champ.placeholder = 'Chercher un produit ou un fournisseur';
    recherche.appendChild(champ);
    recherche.appendChild(bouton('annuler', 'Annuler', function () {
      champ.value = '';
      champ.blur();
      quitterRecherche();
    }));
    haute.appendChild(recherche);
    haute.appendChild(bouton('action-large', 'Saisir un prix', function () {
      A.naviguer('saisie');
    }));
    zone.appendChild(haute);

    var resultats = element('div', 'ecran-resultats');
    resultats.style.display = 'none';
    var page = element('div', 'page-accueil');
    zone.appendChild(resultats);
    zone.appendChild(page);

    function entrerRecherche() {
      if (enRecherche) return;
      enRecherche = true;
      zone.classList.add('en-recherche');
      page.style.display = 'none';
      resultats.style.display = 'block';
      poserResultats();
      A.ajusterHauteurs();
    }
    function quitterRecherche() {
      enRecherche = false;
      zone.classList.remove('en-recherche');
      page.style.display = '';
      resultats.style.display = 'none';
      A.ajusterHauteurs();
    }
    champ.addEventListener('focus', entrerRecherche);
    champ.addEventListener('input', function () { entrerRecherche(); poserResultats(); });

    function poserResultats() {
      resultats.innerHTML = '';
      var texte = champ.value.trim();
      if (texte.length < 2) {
        resultats.appendChild(element('p', 'appui',
          'Tapez au moins deux lettres pour chercher un produit ou un fournisseur.'));
        return;
      }
      Promise.all([
        A.rechercherFiches('produit', texte, 12),
        A.rechercherFiches('fournisseur', texte, 6)
      ]).then(function (r) {
        if (champ.value.trim() !== texte) return;
        resultats.innerHTML = '';

        if (!r[0].length && !r[1].length) {
          resultats.appendChild(element('p', 'vide', 'Rien de connu sous ce nom.'));
          resultats.appendChild(bouton('acces', 'Saisir un prix pour « ' + texte + ' »',
            function () { A.naviguer('saisie'); }));
          return;
        }

        if (r[1].length) {
          resultats.appendChild(element('p', 'titre-section',
            r[1].length + (r[1].length > 1 ? ' fournisseurs' : ' fournisseur')));
          r[1].forEach(function (f) {
            var siens = releves.filter(function (x) {
              var g = C.ficheConservee(contexte.fournisseurs, x.fournisseur_id);
              return g && g.id === f.id;
            });
            var ps = {};
            var dernier = null;
            siens.forEach(function (x) {
              var p = C.ficheConservee(contexte.produits, x.produit_id);
              if (p) ps[p.id] = true;
              if (!dernier || x.date_prix > dernier) dernier = x.date_prix;
            });
            var b = bouton('ligne-resultat', '', function () {
              A.naviguer('fournisseur', { fiche: f });
            });
            var g = element('span', 'res-gauche');
            g.appendChild(element('span', 'res-nom', f.nom));
            g.appendChild(element('span', 'res-appui', siens.length
              ? Object.keys(ps).length + ' produits · ' + siens.length + ' relevés'
              : 'aucun relevé'));
            b.appendChild(g);
            if (dernier) {
              var d = element('span', 'res-droite');
              d.appendChild(element('span', 'res-appui', 'dernier le ' + C.dateFrancaise(dernier)));
              b.appendChild(d);
            }
            resultats.appendChild(b);
          });
        }

        if (r[0].length) {
          resultats.appendChild(element('p', 'titre-section',
            r[0].length + (r[0].length > 1 ? ' produits' : ' produit')));
          r[0].forEach(function (p) {
            var siens = releves.filter(function (x) {
              var q = C.ficheConservee(contexte.produits, x.produit_id);
              return q && q.id === p.id;
            });
            var fs = {};
            siens.forEach(function (x) {
              var f = C.ficheConservee(contexte.fournisseurs, x.fournisseur_id);
              if (f) fs[f.id] = true;
            });
            var famille = contexte.familles[p.famille_code];

            var b = bouton('ligne-resultat', '', function () {
              A.naviguer('produit', { fiche: p });
            });
            var g = element('span', 'res-gauche');
            g.appendChild(element('span', 'res-nom', p.nom));
            g.appendChild(element('span', 'res-appui',
              (famille ? famille.libelle : '') +
              (siens.length
                ? ' · ' + Object.keys(fs).length + ' fournisseurs · ' + siens.length + ' relevés'
                : ' · aucun relevé')));
            b.appendChild(g);

            if (siens.length) {
              var recent = siens.slice().sort(function (x, y) {
                return String(y.date_prix).localeCompare(String(x.date_prix));
              })[0];
              var u = contexte.unites[recent.unite_code];
              var d = element('span', 'res-droite');
              d.appendChild(element('span', 'res-prix',
                C.nombreFrancais(recent.prix_unitaire_ht) + ' ' + (u ? u.libelle : recent.unite_code)));
              d.appendChild(element('span', 'res-appui', 'dernier relevé'));
              b.appendChild(d);
            }
            resultats.appendChild(b);
          });
        }
        A.ajusterHauteurs();
      });
    }

    // ---- page au repos ----
    var alerte = element('div');
    page.appendChild(alerte);
    page.appendChild(element('p', 'titre-section', 'Derniers prix relevés'));
    var onglets = element('div', 'sel-onglets');
    page.appendChild(onglets);
    var tableau = element('div', 'tableau-prix');
    tableau.appendChild(element('p', 'appui', 'Lecture…'));
    page.appendChild(tableau);
    A.suivreHauteur(tableau);
    A.suivreHauteur(resultats);

    Promise.all([C.chargerContexte(), A.relevesRetenus(), A.nombreEnAttente()])
      .then(function (r) {
        contexte = r[0];
        releves = r[1];

        if (r[2]) {
          var a = element('div', 'alerte-attente');
          a.appendChild(element('span', 'alerte-attente-nombre', String(r[2])));
          a.appendChild(element('span', null,
            (r[2] > 1 ? 'saisies ne sont pas encore parties' : 'saisie n\'est pas encore partie') +
            ' à l\'équipe. Elles partiront au retour du réseau.'));
          alerte.appendChild(a);
        }
        poserOnglets();
        poser();
      });

    function familles() {
      var vues = {};
      releves.forEach(function (x) {
        var p = C.ficheConservee(contexte.produits, x.produit_id);
        if (p) vues[p.famille_code] = true;
      });
      return Object.keys(contexte.familles)
        .filter(function (code) { return vues[code]; })
        .sort(function (a, b) { return contexte.familles[a].ordre - contexte.familles[b].ordre; });
    }

    function poserOnglets() {
      onglets.innerHTML = '';
      var codes = familles();
      if (codes.length < 2) return;
      var entrees = [['', 'Tout']];
      codes.forEach(function (code) { entrees.push([code, contexte.familles[code].libelle]); });
      entrees.forEach(function (e) {
        onglets.appendChild(bouton(familleActive === e[0] ? 'on' : '', e[1], function () {
          familleActive = e[0];
          poserOnglets();
          poser();
        }));
      });
    }

    function chevron(actif, sens) {
      var d = sens > 0 ? 'M2.5 8.5 6 4.5 9.5 8.5' : 'M2.5 4.5 6 8.5 9.5 4.5';
      return '<svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">' +
             '<path d="' + d + '" fill="none" stroke="' + (actif ? '#2f6f4f' : '#b6bcb7') +
             '" stroke-width="' + (actif ? 2.4 : 1.7) +
             '" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    }

    function enTete(libelle, colonne, classe) {
      var actif = tri.colonne === colonne;
      var cellule = element('span', (classe || '') + (actif ? ' actif' : ''));
      var t = element('span', 'tri');
      t.appendChild(element('span', null, libelle));
      var ic = element('span', 'tri-ic');
      ic.innerHTML = chevron(actif, actif ? tri.sens : -1);
      t.appendChild(ic);
      t.addEventListener('click', function () {
        if (tri.colonne === colonne) tri.sens = -tri.sens;
        else { tri.colonne = colonne; tri.sens = colonne === 'produit' ? 1 : -1; }
        poser();
      });
      cellule.appendChild(t);
      return cellule;
    }

    function precedentDe(x) {
      var p = C.ficheConservee(contexte.produits, x.produit_id);
      var f = C.ficheConservee(contexte.fournisseurs, x.fournisseur_id);
      var trouve = null;
      releves.forEach(function (b) {
        var pb = C.ficheConservee(contexte.produits, b.produit_id);
        var fb = C.ficheConservee(contexte.fournisseurs, b.fournisseur_id);
        if (!p || !f || !pb || !fb) return;
        if (pb.id !== p.id || fb.id !== f.id || b.unite_code !== x.unite_code) return;
        if (String(b.date_prix) >= String(x.date_prix)) return;
        if (!trouve || String(b.date_prix) > String(trouve.date_prix)) trouve = b;
      });
      return trouve;
    }

    function poser() {
      tableau.innerHTML = '';

      function ecartDe(x) {
        var p = precedentDe(x);
        if (!p) return null;
        var avant = Number(p.prix_unitaire_ht);
        return (Number(x.prix_unitaire_ht) - avant) / avant * 100;
      }
      function cle(x) {
        var p, f;
        if (tri.colonne === 'produit') {
          p = C.ficheConservee(contexte.produits, x.produit_id);
          return p ? p.nom : '';
        }
        if (tri.colonne === 'fournisseur') {
          f = C.ficheConservee(contexte.fournisseurs, x.fournisseur_id);
          return f ? f.nom : '';
        }
        if (tri.colonne === 'prix') return Number(x.prix_unitaire_ht);
        if (tri.colonne === 'evolution') {
          var e = ecartDe(x);
          return e === null ? -1e9 : e;
        }
        return String(x.date_prix);
      }

      var choisis = releves.filter(function (x) {
        if (!familleActive) return true;
        var p = C.ficheConservee(contexte.produits, x.produit_id);
        return p && p.famille_code === familleActive;
      }).sort(function (a, b) {
        var ka = cle(a), kb = cle(b);
        if (typeof ka === 'string') return tri.sens * ka.localeCompare(kb, 'fr');
        return tri.sens * (ka - kb);
      }).slice(0, LIGNES_ACCUEIL);

      if (!choisis.length) {
        tableau.appendChild(element('p', 'vide', releves.length
          ? 'Aucun relevé dans cette famille.'
          : 'Aucun prix relevé pour l\'instant. Touchez « Saisir un prix » pour commencer.'));
        A.ajusterHauteurs();
        return;
      }

      var entete = element('div', 'rangee entete');
      entete.appendChild(enTete('Produit', 'produit', 'col-produit'));
      var meta = element('span', 'col-meta');
      meta.appendChild(enTete('Fournisseur', 'fournisseur', 'col-fournisseur'));
      meta.appendChild(enTete('Date', 'date', 'col-date'));
      entete.appendChild(meta);
      entete.appendChild(enTete('Prix', 'prix', 'col-prix'));
      entete.appendChild(enTete('Évolution', 'evolution', 'col-evolution'));
      tableau.appendChild(entete);

      choisis.forEach(function (x) {
        var p = C.ficheConservee(contexte.produits, x.produit_id);
        var f = C.ficheConservee(contexte.fournisseurs, x.fournisseur_id);
        var u = contexte.unites[x.unite_code];

        var ligne = bouton('rangee', '', function () {
          if (p) A.naviguer('produit', { fiche: p });
        });
        ligne.appendChild(element('span', 'col-produit', p ? p.nom : 'Produit non retrouvé'));

        var m = element('span', 'col-meta');
        m.appendChild(element('span', 'col-fournisseur', f ? f.nom : 'non retrouvé'));
        m.appendChild(element('span', 'col-date', C.dateFrancaise(x.date_prix)));
        ligne.appendChild(m);

        var prix = element('span', 'col-prix');
        prix.appendChild(element('span', null, C.nombreFrancais(x.prix_unitaire_ht)));
        prix.appendChild(element('span', 'unite-discrete', ' ' + (u ? u.libelle : x.unite_code)));
        ligne.appendChild(prix);

        var ecart = ecartDe(x);
        if (ecart === null) {
          ligne.appendChild(element('span', 'col-evolution neutre', 'premier relevé'));
        } else {
          var sens = ecart > 0.05 ? 'hausse' : (ecart < -0.05 ? 'baisse' : 'stable');
          var fleche = sens === 'hausse' ? '▲ ' : (sens === 'baisse' ? '▼ ' : '= ');
          ligne.appendChild(element('span', 'col-evolution ' + sens,
            fleche + (ecart > 0 ? '+' : '') + C.nombreFrancais(ecart, 1) + ' %'));
        }
        tableau.appendChild(ligne);
      });

      A.ajusterHauteurs();
    }
  }

  A.afficherAccueil = afficherAccueil;
})(window);
