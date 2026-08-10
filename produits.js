// PrixTerrain — liste des produits, colonne de gauche de la disposition
// liste et détail. Les produits relevés d'abord, le catalogue ensuite.

(function (global) {
  'use strict';

  var A = global.PrixTerrain;

  function afficherListeProduits(zone, compte, surChoix, choisi) {
    var C = A.calculs;
    var element = C.element;
    var bouton = C.bouton;

    zone.innerHTML = '';
    var recherche = element('div', 'recherche');
    var champ = element('input', 'champ-recherche');
    champ.type = 'search';
    champ.placeholder = 'Chercher un produit';
    recherche.appendChild(champ);
    zone.appendChild(recherche);

    var compteur = element('p', 'surtitre');
    zone.appendChild(compteur);

    var liste = element('div', 'liste-panneau');
    liste.appendChild(element('p', 'appui', 'Lecture…'));
    zone.appendChild(liste);

    Promise.all([C.chargerContexte(), A.relevesRetenus()]).then(function (r) {
      var contexte = r[0];

      var nombre = {};
      var fournisseurs = {};
      var dernier = {};
      r[1].forEach(function (x) {
        var p = C.ficheConservee(contexte.produits, x.produit_id);
        if (!p) return;
        nombre[p.id] = (nombre[p.id] || 0) + 1;
        if (!fournisseurs[p.id]) fournisseurs[p.id] = {};
        var f = C.ficheConservee(contexte.fournisseurs, x.fournisseur_id);
        if (f) fournisseurs[p.id][f.id] = true;
        if (!dernier[p.id] || String(x.date_prix) > String(dernier[p.id])) dernier[p.id] = x.date_prix;
      });

      var releves = [];
      Object.keys(contexte.produits).forEach(function (id) {
        var p = contexte.produits[id];
        if (p.fusionne_vers) return;
        if (nombre[p.id]) releves.push(p);
      });

      function dessiner(filtre) {
        liste.innerHTML = '';
        var visibles;
        if (filtre && filtre.length >= 2) {
          visibles = null;   // rempli par la recherche tolérante
        } else {
          visibles = releves.slice().sort(function (a, b) {
            if (nombre[b.id] !== nombre[a.id]) return nombre[b.id] - nombre[a.id];
            return a.nom.localeCompare(b.nom, 'fr');
          });
          compteur.textContent = visibles.length +
            (visibles.length > 1 ? ' produits relevés' : ' produit relevé') +
            ' · ' + Object.keys(contexte.produits).length + ' au catalogue';
          poser(visibles);
          return;
        }

        A.rechercherFiches('produit', filtre, 40).then(function (trouves) {
          if (champ.value.trim() !== filtre) return;
          compteur.textContent = trouves.length +
            (trouves.length > 1 ? ' produits trouvés' : ' produit trouvé');
          poser(trouves);
        });
      }

      function poser(produits) {
        liste.innerHTML = '';
        if (!produits.length) {
          liste.appendChild(element('p', 'vide', 'Rien de connu sous ce nom.'));
          return;
        }
        produits.forEach(function (p) {
          var n = nombre[p.id] || 0;
          var nbFournisseurs = fournisseurs[p.id] ? Object.keys(fournisseurs[p.id]).length : 0;
          var famille = contexte.familles[p.famille_code];
          var b = bouton(choisi && choisi.id === p.id ? 'ligne-panneau actif' : 'ligne-panneau', '',
            function () { surChoix(p); });
          b.appendChild(element('span', 'ligne-panneau-nom', p.nom));
          b.appendChild(element('span', 'ligne-panneau-appui', n
            ? nbFournisseurs + (nbFournisseurs > 1 ? ' fournisseurs · ' : ' fournisseur · ') +
              n + (n > 1 ? ' relevés' : ' relevé') +
              ' · dernier le ' + C.dateFrancaise(dernier[p.id])
            : (famille ? famille.libelle : '') + ' · aucun relevé'));
          liste.appendChild(b);
        });
      }

      dessiner('');
      champ.addEventListener('input', function () { dessiner(champ.value.trim()); });
    });
  }

  A.afficherListeProduits = afficherListeProduits;
})(window);
