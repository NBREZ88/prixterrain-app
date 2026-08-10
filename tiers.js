// PrixTerrain — consultation par fournisseur.
//
// Mêmes règles de calcul qu'à l'écran des prix par produit : seul le
// regroupement change. Un bloc par produit, une moyenne par unité à
// l'intérieur du bloc, l'autre tiers figurant dans la liste des relevés.

(function (global) {
  'use strict';

  var A = global.PrixTerrain;

  var TIERS = {
    fournisseur: {
      libelle: 'Fournisseur',
      titre: 'Prix par fournisseur',
      exemple: 'Nom du fournisseur',
      table: 'fournisseurs',
      colonne: 'fournisseur_id',
      autreTable: 'profils',
      autreColonne: 'saisi_par',
      autreLibelle: 'Relevés saisis par'
    }
  };

  function afficherListeFournisseurs(zone, compte, surChoix, choisi) {
    var C = A.calculs;
    var element = C.element;
    var bouton = C.bouton;

    zone.innerHTML = '';
    var recherche = element('div', 'recherche');
    var champ = element('input', 'champ-recherche');
    champ.type = 'search';
    champ.placeholder = 'Chercher un fournisseur';
    recherche.appendChild(champ);
    zone.appendChild(recherche);

    var compteur = element('p', 'surtitre');
    zone.appendChild(compteur);

    var liste = element('div', 'liste-panneau');
    liste.appendChild(element('p', 'appui', 'Lecture…'));
    zone.appendChild(liste);

    Promise.all([C.chargerContexte(), A.relevesRetenus(), A.bd.fournisseur.toArray()])
      .then(function (r) {
        var contexte = r[0];
        var nombre = {};
        var produits = {};
        var dernier = {};
        r[1].forEach(function (x) {
          var f = C.ficheConservee(contexte.fournisseurs, x.fournisseur_id);
          if (!f) return;
          nombre[f.id] = (nombre[f.id] || 0) + 1;
          if (!produits[f.id]) produits[f.id] = {};
          var p = C.ficheConservee(contexte.produits, x.produit_id);
          if (p) produits[f.id][p.id] = true;
          if (!dernier[f.id] || String(x.date_prix) > String(dernier[f.id])) dernier[f.id] = x.date_prix;
        });

        var fiches = r[2].filter(function (f) { return !f.fusionne_vers; });

        function dessiner(filtre) {
          liste.innerHTML = '';
          var visibles = fiches.filter(function (f) {
            if (!filtre) return true;
            return A.normaliserLibelle(f.nom).indexOf(A.normaliserLibelle(filtre)) >= 0;
          });
          visibles.sort(function (a, b) {
            var ca = nombre[a.id] || 0, cb = nombre[b.id] || 0;
            if (ca !== cb) return cb - ca;
            return a.nom.localeCompare(b.nom, 'fr');
          });
          compteur.textContent = visibles.length +
            (visibles.length > 1 ? ' fournisseurs' : ' fournisseur');

          if (!visibles.length) {
            liste.appendChild(element('p', 'vide', fiches.length
              ? 'Rien de connu sous ce nom.'
              : 'Aucun fournisseur pour l\'instant. Ils se créent à la saisie d\'un prix.'));
            return;
          }

          visibles.forEach(function (f) {
            var n = nombre[f.id] || 0;
            var nbProduits = produits[f.id] ? Object.keys(produits[f.id]).length : 0;
            var b = bouton(choisi && choisi.id === f.id ? 'ligne-panneau actif' : 'ligne-panneau', '',
              function () { surChoix(f); });
            b.appendChild(element('span', 'ligne-panneau-nom', f.nom));
            b.appendChild(element('span', 'ligne-panneau-appui', n
              ? nbProduits + (nbProduits > 1 ? ' produits · ' : ' produit · ') +
                n + (n > 1 ? ' relevés' : ' relevé') +
                ' · dernier le ' + C.dateFrancaise(dernier[f.id])
              : 'aucun relevé'));
            liste.appendChild(b);
          });
        }

        dessiner('');
        champ.addEventListener('input', function () { dessiner(champ.value.trim()); });
      });
  }

  function afficherFicheFournisseur(zone, compte, parametres) {
    var C = A.calculs;
    var detail = C.element('div');
    zone.innerHTML = '';
    zone.appendChild(detail);
    detail.appendChild(C.element('p', 'appui', 'Lecture des relevés…'));

    Promise.all([C.chargerContexte(), C.chargerReglages()]).then(function (r) {
      contexteGlobal = r[0];
      reglagesGlobal = r[1];
      afficherFiche(parametres.fiche, TIERS.fournisseur, detail);
    });
  }

  var contexteGlobal = null;
  var reglagesGlobal = null;

  function afficherFiche(fiche, reglage, detail) {
      var C = A.calculs;
      var element = C.element;

      detail.innerHTML = '';
      detail.appendChild(element('p', null, 'Lecture des relevés…'));

      A.relevesRetenus().then(function (tous) {
        var siens = tous.filter(function (r) {
          var t = C.ficheConservee(contexteGlobal[reglage.table], r[reglage.colonne]);
          return t && t.id === fiche.id;
        });

        detail.innerHTML = '';
        var entete = element('div', 'entete-fiche');
        entete.appendChild(element('p', 'surtitre', 'Fournisseur'));
        entete.appendChild(element('h2', null, fiche.nom));
        detail.appendChild(entete);

        if (!siens.length) {
          detail.appendChild(element('p', 'confirmation', 'Aucun relevé rattaché à cette fiche.'));
          return;
        }

        // Tiers d'en face rencontrés, et période couverte.
        var autres = {};
        var datePlusAncienne = null;
        siens.forEach(function (r) {
          var a = C.ficheConservee(contexteGlobal[reglage.autreTable], r[reglage.autreColonne]);
          if (a) autres[a.nom] = true;
          if (!datePlusAncienne || r.date_prix < datePlusAncienne) datePlusAncienne = r.date_prix;
        });
        entete.appendChild(element('p', 'sous-titre',
          siens.length + (siens.length > 1 ? ' relevés' : ' relevé') +
          ' depuis le ' + C.dateFrancaise(datePlusAncienne)));
        entete.appendChild(element('p', 'appui',
          reglage.autreLibelle + ' : ' + Object.keys(autres).sort(function (a, b) {
            return a.localeCompare(b, 'fr');
          }).join(', ')));

        // Un bloc par produit conservé.
        var parProduit = {};
        siens.forEach(function (r) {
          var p = C.ficheConservee(contexteGlobal.produits, r.produit_id);
          var id = p ? p.id : 'inconnu';
          if (!parProduit[id]) parProduit[id] = { produit: p, releves: [] };
          parProduit[id].releves.push(r);
        });

        var blocs = Object.keys(parProduit).map(function (id) { return parProduit[id]; });
        blocs.sort(function (a, b) {
          if (b.releves.length !== a.releves.length) return b.releves.length - a.releves.length;
          var na = a.produit ? a.produit.nom : '';
          var nb = b.produit ? b.produit.nom : '';
          return na.localeCompare(nb, 'fr');
        });

        var reglagesSignales = {};
        var ecartes = 0;

        blocs.forEach(function (bloc) {
          var famille = bloc.produit ? bloc.produit.famille_code : '';
          var resultat = C.calculerAgregats(bloc.releves, contexteGlobal, reglagesGlobal, famille,
            { grouper: function () { return null; } });

          ecartes += bloc.releves.length - resultat.retenus.length;
          if (!resultat.retenus.length) return;

          var carte = element('div', 'groupe');
          carte.appendChild(element('p', 'titre-bloc',
            bloc.produit ? bloc.produit.nom : 'Produit non retrouvé'));

          resultat.lignes.forEach(function (ligne) {
            if (ligne.calculable) {
              carte.appendChild(element('p', 'valeur-moyenne',
                C.nombreFrancais(ligne.moyenne) + ' ' + ligne.unite.libelle +
                ' — moyenne ' + (ligne.pondere ? 'pondérée' : 'non pondérée') +
                ' de ' + ligne.nombre + (ligne.nombre > 1 ? ' relevés' : ' relevé') +
                ' — plus ancien : ' + C.dateFrancaise(ligne.plusAncien)));
            } else {
              carte.appendChild(element('p', 'valeur-absente',
                'Moyenne non calculable en ' + ligne.unite.libelle + ' — ' +
                ligne.nombre + (ligne.nombre > 1 ? ' relevés' : ' relevé') +
                ' — plus ancien : ' + C.dateFrancaise(ligne.plusAncien)));
            }

            var liste = element('ul', 'liste-releves');
            ligne.releves.forEach(function (r) {
              var autre = C.ficheConservee(contexteGlobal[reglage.autreTable], r[reglage.autreColonne]);
              var item = element('li', null,
                C.dateFrancaise(r.date_prix) + ' — ' +
                C.nombreFrancais(r.prix_unitaire_ht) + ' ' + ligne.unite.libelle +
                ' — ' + (autre ? autre.nom : 'fiche non retrouvée'));

              if (ligne.calculable && resultat.seuilAtypique !== null) {
                var med = resultat.medianes[ligne.unite.code];
                if (med) {
                  var ecart = Math.abs(Number(r.prix_unitaire_ht) - med) / med * 100;
                  if (ecart > resultat.seuilAtypique) {
                    item.className = 'atypique';
                    item.appendChild(element('span', 'marque',
                      ' à vérifier : ' + C.nombreFrancais(ecart, 0) + ' % d\'écart au prix médian'));
                  }
                }
              }
              if (r.commentaire) item.appendChild(element('span', 'appui', r.commentaire));
              liste.appendChild(item);
            });
            carte.appendChild(liste);
          });

          detail.appendChild(carte);

          // Un seul encart par réglage manquant, quel que soit le nombre de blocs.
          [['duree_validite', famille], ['anciennete_exclusion', famille],
           ['nombre_minimal_releves', ''], ['decote_mensuelle', ''], ['ecart_atypique', '']]
            .forEach(function (paire) {
              if (reglagesGlobal.valeur(paire[0], paire[1]) !== null) return;
              var cle = paire[0] + '|' + paire[1];
              if (reglagesSignales[cle]) return;
              reglagesSignales[cle] = true;
              detail.insertBefore(C.encartReglageManquant(reglagesGlobal, paire[0], paire[1]),
                                  detail.children[1]);
            });
        });

        if (ecartes) {
          entete.appendChild(element('p', 'appui',
            ecartes + (ecartes > 1 ? ' relevés écartés' : ' relevé écarté') + ' pour ancienneté'));
        }
      });
    }

  A.afficherListeFournisseurs = afficherListeFournisseurs;
  A.afficherFicheFournisseur = afficherFicheFournisseur;
})(window);
