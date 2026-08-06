// PrixTerrain — export tableur.
//
// Deux fichiers, produits sur l'appareil à partir des données déjà présentes :
// les relevés un par un, et les moyennes calculées avec les mêmes règles qu'à
// l'écran. Aucun réseau n'est nécessaire.
//
// Séparateur point-virgule et virgule décimale : c'est ce qu'attend un tableur
// réglé en français. Le fichier commence par une marque d'encodage sans
// laquelle les accents sortent abîmés.

(function (global) {
  'use strict';

  var A = global.PrixTerrain;
  var SEPARATEUR = ';';
  var MARQUE_ENCODAGE = '\uFEFF';

  function cellule(valeur) {
    if (valeur === null || valeur === undefined) return '';
    var texte = String(valeur);
    if (texte.indexOf(SEPARATEUR) >= 0 || texte.indexOf('"') >= 0 || texte.indexOf('\n') >= 0) {
      return '"' + texte.replace(/"/g, '""') + '"';
    }
    return texte;
  }

  function nombreTableur(valeur, decimales) {
    if (valeur === null || valeur === undefined) return '';
    return Number(valeur).toFixed(decimales === undefined ? 2 : decimales).replace('.', ',');
  }

  function construireFichier(entetes, lignes) {
    var contenu = [entetes.map(cellule).join(SEPARATEUR)];
    lignes.forEach(function (ligne) { contenu.push(ligne.map(cellule).join(SEPARATEUR)); });
    return MARQUE_ENCODAGE + contenu.join('\r\n') + '\r\n';
  }

  function telecharger(nom, contenu) {
    var fichier = new Blob([contenu], { type: 'text/csv;charset=utf-8' });
    var adresse = URL.createObjectURL(fichier);
    var lien = global.document.createElement('a');
    lien.href = adresse;
    lien.download = nom;
    global.document.body.appendChild(lien);
    lien.click();
    global.document.body.removeChild(lien);
    setTimeout(function () { URL.revokeObjectURL(adresse); }, 2000);
  }

  function dateFichier() {
    var d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }

  function afficherExport(zone, compte) {
    var C = A.calculs;
    var element = C.element;
    var bouton = C.bouton;

    var contexte = null;
    var reglages = null;

    zone.innerHTML = '';
    var bandeau = element('header', 'bandeau');
    bandeau.appendChild(element('h1', null, 'Export tableur'));
    zone.appendChild(bandeau);
    zone.appendChild(element('p', null, 'Préparation…'));

    Promise.all([C.chargerContexte(), C.chargerReglages(), A.bd.releve.toArray()])
      .then(function (r) {
        contexte = r[0];
        reglages = r[1];
        dessiner(r[2]);
      });

    function dessiner(tousReleves) {
      zone.innerHTML = '';
      var bandeau = element('header', 'bandeau');
      bandeau.appendChild(element('h1', null, 'Export tableur'));
      zone.appendChild(bandeau);

      zone.appendChild(element('p', 'appui',
        'Les fichiers s\'ouvrent dans un tableur. Ils sont produits sur cet appareil ' +
        'à partir des relevés déjà reçus : sans réseau, ils reflètent le dernier échange avec l\'équipe.'));

      // Choix de la famille
      var champFamille = element('div', 'champ');
      champFamille.appendChild(element('span', 'etiquette', 'Famille de produits'));
      var listeFamille = element('select', 'saisie');
      listeFamille.appendChild(new Option('toutes les familles', ''));
      Object.keys(contexte.familles).forEach(function (code) {
        listeFamille.appendChild(new Option(contexte.familles[code].libelle, code));
      });
      champFamille.appendChild(listeFamille);
      zone.appendChild(champFamille);

      // Bornes de dates
      var champDebut = element('div', 'champ');
      champDebut.appendChild(element('span', 'etiquette', 'Relevés à partir du'));
      var saisieDebut = element('input', 'saisie');
      saisieDebut.type = 'date';
      champDebut.appendChild(saisieDebut);
      zone.appendChild(champDebut);

      var champFin = element('div', 'champ');
      champFin.appendChild(element('span', 'etiquette', "Jusqu'au"));
      var saisieFin = element('input', 'saisie');
      saisieFin.type = 'date';
      champFin.appendChild(saisieFin);
      zone.appendChild(champFin);

      var champAnnules = element('div', 'champ');
      var caseAnnules = element('input');
      caseAnnules.type = 'checkbox';
      caseAnnules.id = 'inclure-annules';
      var etiquetteAnnules = element('label', 'etiquette-case', ' Faire figurer aussi les relevés annulés');
      etiquetteAnnules.setAttribute('for', 'inclure-annules');
      champAnnules.appendChild(caseAnnules);
      champAnnules.appendChild(etiquetteAnnules);
      zone.appendChild(champAnnules);

      var message = element('p', 'confirmation');
      message.style.display = 'none';
      zone.appendChild(message);

      function annonce(texte) {
        message.textContent = texte;
        message.style.display = 'block';
      }

      function selection() {
        var annules = {};
        tousReleves.forEach(function (r) {
          if (r.type === 'annulation') annules[r.releve_annule_id] = r;
        });
        var famille = listeFamille.value;
        var debut = saisieDebut.value;
        var fin = saisieFin.value;

        return tousReleves.filter(function (r) {
          if (r.type !== 'prix') return false;
          if (!caseAnnules.checked && annules[r.id]) return false;
          if (debut && r.date_prix < debut) return false;
          if (fin && r.date_prix > fin) return false;
          if (famille) {
            var p = C.ficheConservee(contexte.produits, r.produit_id);
            if (!p || p.famille_code !== famille) return false;
          }
          return true;
        }).map(function (r) {
          return { releve: r, annule: Boolean(annules[r.id]) };
        });
      }

      zone.appendChild(element('p', 'titre-section', 'Les relevés un par un'));
      zone.appendChild(element('p', 'manquant-suite',
        'Une ligne par relevé : date, fournisseur, produit, prix, unité, ' +
        'conseiller ayant saisi, remarque.'));
      zone.appendChild(bouton('enregistrer', 'Obtenir le fichier des relevés', function () {
        var choisis = selection();
        if (!choisis.length) { annonce('Aucun relevé ne correspond à ce choix.'); return; }
        telecharger('prixterrain-releves-' + dateFichier() + '.csv', fichierReleves(choisis));
        annonce(choisis.length + (choisis.length > 1 ? ' relevés exportés.' : ' relevé exporté.'));
      }));

      zone.appendChild(element('p', 'titre-section', 'Les prix moyens'));
      zone.appendChild(element('p', 'manquant-suite',
        'Une ligne par produit, fournisseur et unité. Chaque moyenne sort avec le nombre de ' +
        'relevés qui la composent, la date du plus ancien et la mention de pondération.'));
      zone.appendChild(bouton('enregistrer', 'Obtenir le fichier des prix moyens', function () {
        var choisis = selection().filter(function (c) { return !c.annule; });
        if (!choisis.length) { annonce('Aucun relevé ne correspond à ce choix.'); return; }
        var lignes = fichierMoyennes(choisis.map(function (c) { return c.releve; }));
        if (!lignes) { annonce('Aucune moyenne à produire pour ce choix.'); return; }
        telecharger('prixterrain-prix-moyens-' + dateFichier() + '.csv', lignes);
        annonce('Fichier des prix moyens produit.');
      }));
    }

    // -----------------------------------------------------------------------
    // Fichier 1 : les relevés
    // -----------------------------------------------------------------------
    function fichierReleves(choisis) {
      var entetes = ['Date du prix', 'Fournisseur', 'Produit', 'Famille', 'Segment',
                     'Prix hors taxes', 'Unité', 'Saisi par', 'Saisi le', 'Remarque', 'État'];

      var lignes = choisis.map(function (c) {
        var r = c.releve;
        var fournisseur = C.ficheConservee(contexte.fournisseurs, r.fournisseur_id);
        var produit = C.ficheConservee(contexte.produits, r.produit_id);
        var famille = produit ? contexte.familles[produit.famille_code] : null;
        var unite = contexte.unites[r.unite_code];
        var auteur = contexte.profils ? contexte.profils[r.saisi_par] : null;

        return [
          C.dateFrancaise(r.date_prix),
          fournisseur ? fournisseur.nom : 'fiche non retrouvée',
          produit ? produit.nom : 'fiche non retrouvée',
          famille ? famille.libelle : '',
          produit && produit.segment ? produit.segment : '',
          nombreTableur(r.prix_unitaire_ht),
          unite ? unite.libelle : r.unite_code,
          auteur ? auteur.nom : '',
          C.dateFrancaise(r.saisi_le),
          r.commentaire || '',
          c.annule ? 'annulé' : 'retenu'
        ];
      });

      lignes.sort(function (a, b) {
        if (a[2] !== b[2]) return a[2].localeCompare(b[2], 'fr');
        return a[0].split('/').reverse().join('').localeCompare(b[0].split('/').reverse().join(''));
      });

      return construireFichier(entetes, lignes);
    }

    // -----------------------------------------------------------------------
    // Fichier 2 : les prix moyens
    // -----------------------------------------------------------------------
    function fichierMoyennes(releves) {
      var entetes = ['Produit', 'Famille', 'Fournisseur', 'Unité', 'Prix moyen', 'Pondération',
                     'Nombre de relevés', 'Plus ancien relevé', 'Observation'];

      var parProduit = {};
      releves.forEach(function (r) {
        var p = C.ficheConservee(contexte.produits, r.produit_id);
        var id = p ? p.id : 'inconnu';
        if (!parProduit[id]) parProduit[id] = { produit: p, releves: [] };
        parProduit[id].releves.push(r);
      });

      var lignes = [];
      Object.keys(parProduit).forEach(function (id) {
        var bloc = parProduit[id];
        var famille = bloc.produit ? bloc.produit.famille_code : '';
        var resultat = C.calculerAgregats(bloc.releves, contexte, reglages, famille);

        resultat.lignes.forEach(function (ligne) {
          var observation = '';
          if (!ligne.calculable) {
            if (resultat.validiteAbsente) observation = 'moyenne non calculable : durée de validité non paramétrée';
            else if (resultat.minimumAbsent) observation = 'moyenne non calculable : nombre minimal de relevés non paramétré';
            else observation = 'moyenne non calculable : moins de relevés que le minimum exigé';
          }
          lignes.push([
            bloc.produit ? bloc.produit.nom : 'fiche non retrouvée',
            famille && contexte.familles[famille] ? contexte.familles[famille].libelle : '',
            ligne.nomGroupe,
            ligne.unite.libelle,
            ligne.calculable ? nombreTableur(ligne.moyenne) : '',
            ligne.calculable ? (ligne.pondere ? 'pondérée' : 'non pondérée') : '',
            ligne.nombre,
            C.dateFrancaise(ligne.plusAncien),
            observation
          ]);
        });
      });

      if (!lignes.length) return null;

      lignes.sort(function (a, b) {
        if (a[0] !== b[0]) return a[0].localeCompare(b[0], 'fr');
        return a[2].localeCompare(b[2], 'fr');
      });

      return construireFichier(entetes, lignes);
    }
  }

  A.afficherExport = afficherExport;
})(window);
