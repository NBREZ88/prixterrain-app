// PrixTerrain — écran d'accueil.
// Une recherche unique, un bouton de saisie, et les derniers prix relevés
// par l'équipe présentés en tableau, filtrables par famille.

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
    var series = {};
    var familleActive = '';

    zone.innerHTML = '';

    // ---- Recherche et saisie ----
    var haute = element('div', 'barre-haute');
    var recherche = element('div', 'recherche');
    var champ = element('input', 'champ-recherche');
    champ.type = 'search';
    champ.placeholder = 'Un produit, un fournisseur…';
    recherche.appendChild(champ);
    var resultats = element('div', 'resultats');
    resultats.style.display = 'none';
    recherche.appendChild(resultats);
    haute.appendChild(recherche);
    haute.appendChild(bouton('action-large', 'Saisir un prix', function () {
      A.naviguer('saisie');
    }));
    zone.appendChild(haute);

    champ.addEventListener('input', function () {
      var texte = champ.value.trim();
      if (texte.length < 2) {
        resultats.style.display = 'none';
        resultats.innerHTML = '';
        return;
      }
      Promise.all([
        A.rechercherFiches('produit', texte, 6),
        A.rechercherFiches('fournisseur', texte, 4)
      ]).then(function (r) {
        if (champ.value.trim() !== texte) return;
        resultats.innerHTML = '';
        resultats.style.display = 'block';
        if (!r[0].length && !r[1].length) {
          resultats.appendChild(element('p', 'aucune', 'Rien de connu sous ce nom.'));
          return;
        }
        r[1].forEach(function (f) {
          resultats.appendChild(entree('Fournisseur', f.nom, function () {
            A.naviguer('fournisseur', { fiche: f });
          }));
        });
        r[0].forEach(function (p) {
          var famille = contexte && contexte.familles[p.famille_code];
          resultats.appendChild(entree(famille ? famille.libelle : 'Produit', p.nom, function () {
            A.naviguer('produit', { fiche: p });
          }));
        });
      });
    });

    function entree(categorie, nom, action) {
      var e = bouton('resultat', '', action);
      e.appendChild(element('span', 'resultat-categorie', categorie));
      e.appendChild(element('span', 'resultat-nom', nom));
      return e;
    }

    // ---- Alerte, onglets, tableau ----
    var alerte = element('div');
    zone.appendChild(alerte);
    zone.appendChild(element('p', 'titre-section', 'Derniers prix relevés'));
    var onglets = element('div', 'sel-onglets');
    zone.appendChild(onglets);
    var tableau = element('div', 'tableau-prix');
    tableau.appendChild(element('p', 'appui', 'Lecture…'));
    zone.appendChild(tableau);

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

        releves.forEach(function (x) {
          var p = C.ficheConservee(contexte.produits, x.produit_id);
          var f = C.ficheConservee(contexte.fournisseurs, x.fournisseur_id);
          var cle = (p ? p.id : '?') + '|' + (f ? f.id : '?') + '|' + x.unite_code;
          if (!series[cle]) series[cle] = [];
          series[cle].push(x);
        });

        poserOnglets();
        poserTableau();
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
          poserTableau();
        }));
      });
    }

    function poserTableau() {
      tableau.innerHTML = '';

      var choisis = releves.filter(function (x) {
        if (!familleActive) return true;
        var p = C.ficheConservee(contexte.produits, x.produit_id);
        return p && p.famille_code === familleActive;
      }).sort(function (a, b) {
        return String(b.date_prix).localeCompare(String(a.date_prix));
      }).slice(0, LIGNES_ACCUEIL);

      if (!choisis.length) {
        tableau.appendChild(element('p', 'vide', releves.length
          ? 'Aucun relevé dans cette famille.'
          : 'Aucun prix relevé pour l\'instant. Touchez « Saisir un prix » pour commencer.'));
        return;
      }

      var entete = element('div', 'rangee entete');
      entete.appendChild(element('span', 'col-produit', 'Produit'));
      var meta = element('span', 'col-meta');
      meta.appendChild(element('span', 'col-fournisseur', 'Fournisseur'));
      meta.appendChild(element('span', 'col-date', 'Date'));
      entete.appendChild(meta);
      entete.appendChild(element('span', 'col-prix', 'Prix'));
      entete.appendChild(element('span', 'col-evolution', 'Évolution'));
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

        var cle = (p ? p.id : '?') + '|' + (f ? f.id : '?') + '|' + x.unite_code;
        var serie = series[cle] || [];
        var precedent = null;
        serie.forEach(function (autre) {
          if (String(autre.date_prix) >= String(x.date_prix)) return;
          if (!precedent || String(autre.date_prix) > String(precedent.date_prix)) precedent = autre;
        });

        if (!precedent) {
          ligne.appendChild(element('span', 'col-evolution neutre', 'premier relevé'));
        } else {
          var avant = Number(precedent.prix_unitaire_ht);
          var ecart = (Number(x.prix_unitaire_ht) - avant) / avant * 100;
          var sens = ecart > 0.05 ? 'hausse' : (ecart < -0.05 ? 'baisse' : 'stable');
          var fleche = sens === 'hausse' ? '▲ ' : (sens === 'baisse' ? '▼ ' : '= ');
          ligne.appendChild(element('span', 'col-evolution ' + sens,
            fleche + (ecart > 0 ? '+' : '') + C.nombreFrancais(ecart, 1) + ' %'));
        }
        tableau.appendChild(ligne);
      });
    }
  }

  A.afficherAccueil = afficherAccueil;
})(window);
