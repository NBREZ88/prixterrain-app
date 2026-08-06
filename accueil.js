// PrixTerrain — écran d'accueil.
// Une recherche unique sur les produits et les fournisseurs, un bouton de
// saisie, et les derniers prix relevés par l'équipe.

(function (global) {
  'use strict';

  var A = global.PrixTerrain;
  var CARTES_ACCUEIL = 20;

  function afficherAccueil(zone, compte) {
    var C = A.calculs;
    var element = C.element;
    var bouton = C.bouton;
    var contexte = null;

    zone.innerHTML = '';

    // ---- Recherche ----
    var recherche = element('div', 'recherche');
    var champ = element('input', 'champ-recherche');
    champ.type = 'search';
    champ.placeholder = 'Un produit, un fournisseur…';
    recherche.appendChild(champ);
    var resultats = element('div', 'resultats');
    resultats.style.display = 'none';
    recherche.appendChild(resultats);
    zone.appendChild(recherche);

    // ---- Saisir ----
    zone.appendChild(bouton('action-large', 'Saisir un prix', function () {
      A.naviguer('saisie');
    }));

    // ---- Résumé ----
    var resume = element('div', 'resume');
    zone.appendChild(resume);

    // ---- Derniers prix ----
    var titre = element('p', 'titre-section', 'Derniers prix relevés');
    zone.appendChild(titre);
    var cartes = element('div');
    cartes.appendChild(element('p', 'appui', 'Lecture…'));
    zone.appendChild(cartes);

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

    Promise.all([C.chargerContexte(), A.relevesRetenus(), A.nombreEnAttente(), A.bd.produit.count()])
      .then(function (r) {
        contexte = r[0];
        var releves = r[1];

        resume.appendChild(bloc(String(releves.length), releves.length > 1 ? 'relevés' : 'relevé'));
        resume.appendChild(bloc(String(r[3]), 'produits'));
        if (r[2]) resume.appendChild(bloc(String(r[2]), 'à renvoyer', true));

        cartes.innerHTML = '';
        if (!releves.length) {
          cartes.appendChild(element('p', 'vide',
            'Aucun prix relevé pour l\'instant. Touchez « Saisir un prix » pour commencer.'));
          return;
        }

        // Relevé précédent du même produit, fournisseur et unité.
        var series = {};
        releves.forEach(function (x) {
          var p = C.ficheConservee(contexte.produits, x.produit_id);
          var f = C.ficheConservee(contexte.fournisseurs, x.fournisseur_id);
          var cle = (p ? p.id : '?') + '|' + (f ? f.id : '?') + '|' + x.unite_code;
          if (!series[cle]) series[cle] = [];
          series[cle].push(x);
        });
        Object.keys(series).forEach(function (cle) {
          series[cle].sort(function (a, b) { return String(a.date_prix).localeCompare(String(b.date_prix)); });
        });

        releves.slice()
          .sort(function (a, b) { return String(b.saisi_le).localeCompare(String(a.saisi_le)); })
          .slice(0, CARTES_ACCUEIL)
          .forEach(function (x) {
            cartes.appendChild(carte(x, series));
          });
      });

    function bloc(valeur, libelle, alerte) {
      var b = element('div', alerte ? 'bloc-resume bloc-alerte' : 'bloc-resume');
      b.appendChild(element('span', 'bloc-valeur', valeur));
      b.appendChild(element('span', 'bloc-libelle', libelle));
      return b;
    }

    function carte(x, series) {
      var p = C.ficheConservee(contexte.produits, x.produit_id);
      var f = C.ficheConservee(contexte.fournisseurs, x.fournisseur_id);
      var u = contexte.unites[x.unite_code];
      var famille = p ? contexte.familles[p.famille_code] : null;

      var c = bouton('carte', '', function () {
        if (p) A.naviguer('produit', { fiche: p });
      });

      var haut = element('div', 'carte-haut');
      haut.appendChild(element('span', 'carte-titre', p ? p.nom : 'Produit non retrouvé'));
      haut.appendChild(element('span', 'carte-prix',
        C.nombreFrancais(x.prix_unitaire_ht) + ' ' + (u ? u.libelle : x.unite_code)));
      c.appendChild(haut);

      var bas = element('div', 'carte-bas');
      bas.appendChild(element('span', 'carte-fournisseur', f ? f.nom : 'Fournisseur non retrouvé'));
      bas.appendChild(element('span', 'carte-date', C.dateFrancaise(x.date_prix)));
      c.appendChild(bas);

      if (famille) {
        var etiquette = element('span', 'pastille-famille ' + p.famille_code, famille.libelle);
        c.appendChild(etiquette);
      }

      var cle = (p ? p.id : '?') + '|' + (f ? f.id : '?') + '|' + x.unite_code;
      var serie = series[cle] || [];
      var precedent = null;
      serie.forEach(function (autre) {
        if (String(autre.date_prix) >= String(x.date_prix)) return;
        if (!precedent || String(autre.date_prix) > String(precedent.date_prix)) precedent = autre;
      });

      if (!precedent) {
        c.appendChild(element('span', 'evolution neutre', 'premier relevé de ce couple'));
      } else {
        var avant = Number(precedent.prix_unitaire_ht);
        var ecart = (Number(x.prix_unitaire_ht) - avant) / avant * 100;
        var sens = ecart > 0.05 ? 'hausse' : (ecart < -0.05 ? 'baisse' : 'stable');
        var fleche = sens === 'hausse' ? '▲' : (sens === 'baisse' ? '▼' : '=');
        c.appendChild(element('span', 'evolution ' + sens,
          fleche + ' ' + (ecart > 0 ? '+' : '') + C.nombreFrancais(ecart, 1) + ' % depuis le ' +
          C.dateFrancaise(precedent.date_prix)));
      }

      return c;
    }
  }

  A.afficherAccueil = afficherAccueil;
})(window);
