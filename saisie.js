// PrixTerrain — écran de saisie d'un prix.
// Trois champs visibles : fournisseur, produit, prix accompagné de son unité.
// Date et remarque sont derrière le bouton « Détails », replié au départ.

(function (global) {
  'use strict';

  var A = global.PrixTerrain;
  var CARACTERES_AVANT_PROPOSITIONS = 3;

  function aujourdhui() {
    var d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }

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

  // -------------------------------------------------------------------------
  // Champ à propositions : les fiches déjà connues s'affichent d'abord,
  // le bouton d'ajout n'apparaît qu'en dessous de la liste.
  // -------------------------------------------------------------------------
  function creerChampRecherche(options) {
    var conteneur = element('div', 'champ');
    var valeur = null;

    function definir(nouvelle, avecFocus) {
      valeur = nouvelle;
      dessiner(avecFocus);
      if (options.surChangement) options.surChangement(valeur);
    }

    function dessiner(avecFocus) {
      conteneur.innerHTML = '';
      conteneur.appendChild(element('span', 'etiquette', options.libelle));

      if (valeur) {
        var fait = element('div', 'choix-fait');
        fait.appendChild(element('span', 'choix-nom', valeur.nom));
        fait.appendChild(bouton('lien', 'Changer', function () { definir(null, true); }));
        conteneur.appendChild(fait);
        return;
      }

      var champ = element('input', 'saisie');
      champ.type = 'text';
      champ.placeholder = options.exemple;
      var liste = element('div', 'propositions');
      liste.style.display = 'none';
      conteneur.appendChild(champ);
      conteneur.appendChild(liste);

      champ.addEventListener('input', function () {
        var texte = champ.value.trim();
        if (texte.length < CARACTERES_AVANT_PROPOSITIONS) {
          liste.style.display = 'none';
          liste.innerHTML = '';
          return;
        }
        A.rechercherFiches(options.table, texte, 8)
          .then(function (lignes) {
            if (champ.value.trim() !== texte) return;
            liste.innerHTML = '';
            liste.style.display = 'block';
            lignes.forEach(function (ligne) {
              liste.appendChild(bouton('proposition', ligne.nom, function () { definir(ligne, false); }));
            });
            if (!lignes.length) liste.appendChild(element('p', 'aucune', 'Rien de connu sous ce nom.'));
            liste.appendChild(bouton('lien creation', 'Ajouter « ' + texte + ' »', function () {
              options.surCreation(texte, function (fiche) { definir(fiche, false); });
            }));
          });
      });

      if (avecFocus) champ.focus();
    }

    dessiner(false);
    return {
      element: conteneur,
      lire: function () { return valeur; },
      vider: function () { definir(null, false); }
    };
  }

  // -------------------------------------------------------------------------
  // Fenêtre d'ajout d'une fiche
  // -------------------------------------------------------------------------
  function ouvrirAjout(table, nom, unites, familles, surAjout) {
    var fenetre = element('div', 'fenetre');
    var contenu = element('div', 'fenetre-contenu');
    contenu.appendChild(element('h2', null, 'Ajouter « ' + nom + ' »'));

    var choixFamille = null;
    var choixUnite = null;
    var alerte = element('p', 'alerte');
    alerte.style.display = 'none';

    if (table === 'produit') {
      var champFamille = element('div', 'champ');
      champFamille.appendChild(element('span', 'etiquette', 'Famille'));
      choixFamille = element('select', 'saisie');
      choixFamille.appendChild(new Option('à choisir', ''));
      familles.forEach(function (f) { choixFamille.appendChild(new Option(f.libelle, f.code)); });
      champFamille.appendChild(choixFamille);
      contenu.appendChild(champFamille);

      var champUnite = element('div', 'champ');
      champUnite.appendChild(element('span', 'etiquette', 'Prix habituellement exprimé'));
      choixUnite = element('select', 'saisie');
      choixUnite.appendChild(new Option('à préciser plus tard', ''));
      unites.forEach(function (u) { choixUnite.appendChild(new Option(u.libelle_long, u.code)); });
      champUnite.appendChild(choixUnite);
      contenu.appendChild(champUnite);
    }

    contenu.appendChild(alerte);

    var boutons = element('div', 'boutons-fenetre');
    boutons.appendChild(bouton('lien', 'Annuler', function () { fenetre.remove(); }));
    boutons.appendChild(bouton('enregistrer', 'Ajouter', function () {
      var donnees = { nom: nom };
      if (table === 'produit') {
        if (!choixFamille.value) {
          alerte.textContent = 'Choisissez la famille du produit.';
          alerte.style.display = 'block';
          return;
        }
        donnees.famille_code = choixFamille.value;
        donnees.unite_code = choixUnite.value || null;
        donnees.segment = null;
      }
      A.enregistrerFiche(table, donnees).then(function (fiche) {
        A.oublierIndex(table);
        fenetre.remove();
        surAjout(fiche);
      });
    }));
    contenu.appendChild(boutons);

    fenetre.appendChild(contenu);
    global.document.body.appendChild(fenetre);
  }

  // -------------------------------------------------------------------------
  // Écran
  // -------------------------------------------------------------------------
  function afficherSaisie(zone, compte) {
    Promise.all([
      A.bd.unite_prix.orderBy('ordre').toArray(),
      A.bd.famille_produit.orderBy('ordre').toArray(),
      A.nombreEnAttente()
    ]).then(function (charge) {
      var unites = charge[0];
      var familles = charge[1];

      zone.innerHTML = '';

      var bandeau = element('header', 'bandeau');
      bandeau.appendChild(element('h1', null, 'Relevé de prix'));
      var attente = element('p', 'attente');
      bandeau.appendChild(attente);
      zone.appendChild(bandeau);

      function afficherAttente(n) {
        if (!n) { attente.style.display = 'none'; return; }
        attente.style.display = 'block';
        attente.textContent = n + (n > 1 ? ' relevés à renvoyer' : ' relevé à renvoyer');
      }
      afficherAttente(charge[2]);
      A.surChangementFileAttente(afficherAttente);

      var champFournisseur = creerChampRecherche({
        libelle: 'Fournisseur', table: 'fournisseur', exemple: 'Nom du fournisseur',
        surCreation: function (nom, retour) { ouvrirAjout('fournisseur', nom, unites, familles, retour); }
      });
      var champProduit = creerChampRecherche({
        libelle: 'Produit', table: 'produit', exemple: 'Nom du produit',
        surCreation: function (nom, retour) { ouvrirAjout('produit', nom, unites, familles, retour); },
        surChangement: function () {
          uniteChoisie = '';
          if (listeUnites) listeUnites.value = uniteRetenue();
          majUnite();
        }
      });

      zone.appendChild(champFournisseur.element);
      zone.appendChild(champProduit.element);

      var champPrix = element('div', 'champ');
      champPrix.appendChild(element('span', 'etiquette', 'Prix hors taxes, remise déduite'));
      var lignePrix = element('div', 'ligne-prix');
      var saisiePrix = element('input', 'saisie');
      saisiePrix.type = 'text';
      saisiePrix.inputMode = 'decimal';
      saisiePrix.placeholder = '0,00';
      var listeUnites = element('select', 'saisie choix-unite');
      listeUnites.appendChild(new Option('unité…', ''));
      unites.forEach(function (u) { listeUnites.appendChild(new Option(u.libelle, u.code)); });
      listeUnites.addEventListener('change', function () { uniteChoisie = listeUnites.value; });
      lignePrix.appendChild(saisiePrix);
      lignePrix.appendChild(listeUnites);
      champPrix.appendChild(lignePrix);
      zone.appendChild(champPrix);

      var uniteChoisie = '';
      function uniteRetenue() {
        var p = champProduit.lire();
        return uniteChoisie || (p && p.unite_code) || '';
      }
      function majUnite() {
        listeUnites.value = uniteRetenue();
      }

      var repli = element('div', 'repli');
      repli.style.display = 'none';

      var champDate = element('div', 'champ');
      champDate.appendChild(element('span', 'etiquette', 'Date du prix'));
      var saisieDate = element('input', 'saisie');
      saisieDate.type = 'date';
      saisieDate.value = aujourdhui();
      saisieDate.max = aujourdhui();
      champDate.appendChild(saisieDate);
      repli.appendChild(champDate);

      var champRemarque = element('div', 'champ');
      champRemarque.appendChild(element('span', 'etiquette', 'Remarque'));
      var saisieRemarque = element('input', 'saisie');
      saisieRemarque.type = 'text';
      saisieRemarque.placeholder = 'facultatif';
      champRemarque.appendChild(saisieRemarque);
      repli.appendChild(champRemarque);

      var boutonDetails = bouton('lien details', 'Détails', function () {
        var ouvert = repli.style.display !== 'none';
        repli.style.display = ouvert ? 'none' : 'block';
        boutonDetails.textContent = ouvert ? 'Détails' : 'Masquer les détails';
      });
      zone.appendChild(boutonDetails);
      zone.appendChild(repli);

      var alerte = element('p', 'alerte');
      alerte.style.display = 'none';
      var confirmation = element('p', 'confirmation');
      confirmation.style.display = 'none';
      zone.appendChild(alerte);
      zone.appendChild(confirmation);

      function signaler(texte) {
        confirmation.style.display = 'none';
        alerte.textContent = texte;
        alerte.style.display = 'block';
      }

      var boutonEnregistrer = bouton('enregistrer', 'Enregistrer ce relevé', function () {
        var fournisseur = champFournisseur.lire();
        var produit = champProduit.lire();
        if (!fournisseur) return signaler('Indiquez le fournisseur.');
        if (!produit) return signaler('Indiquez le produit.');
        var valeur = Number(String(saisiePrix.value).replace(',', '.'));
        if (!isFinite(valeur) || valeur <= 0) return signaler('Indiquez un prix, remise déduite, hors taxes.');
        if (!uniteRetenue()) return signaler('Indiquez à quoi correspond ce prix : au litre, au kilo, à la tonne.');
        if (saisieDate.value > aujourdhui()) return signaler("La date indiquée est postérieure à aujourd'hui.");

        A.enregistrerReleve({
          date_prix: saisieDate.value,
          fournisseur_id: fournisseur.id,
          produit_id: produit.id,
          prix_unitaire_ht: valeur,
          unite_code: uniteRetenue(),
          commentaire: saisieRemarque.value.trim() || null
        }).then(function () {
          alerte.style.display = 'none';
          confirmation.textContent = "Enregistré sur votre téléphone. Sera envoyé à l'équipe dès le retour du réseau.";
          confirmation.style.display = 'block';
          champProduit.vider();
          saisiePrix.value = '';
          saisieRemarque.value = '';
          uniteChoisie = '';
          listeUnites.value = '';
          majUnite();
        }).catch(function (erreur) { signaler(A.messageSimple(erreur)); });
      });
      zone.appendChild(boutonEnregistrer);
      zone.appendChild(bouton('lien', 'Revenir à l\'accueil', function () { A.naviguer('accueil'); }));

      majUnite();
    });
  }

  A.afficherSaisie = afficherSaisie;
})(window);
