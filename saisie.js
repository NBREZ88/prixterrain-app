// PrixTerrain — saisie en série.
// Le fournisseur reste d'une ligne à l'autre, le produit et le prix se vident.
// Un produit inconnu se crée sur place, en donnant sa famille et son type.

(function (global) {
  'use strict';

  var A = global.PrixTerrain;

  // Vocabulaire fermé, écrit dans la colonne segment de la fiche produit.
  var TYPES = {
    PHYTO: ['Herbicide', 'Fongicide', 'Insecticide', 'Molluscicide', 'Régulateur',
            'Adjuvant', 'Traitement de semence', 'Moyen biologique', 'Non classé'],
    SEMENCE: ['Blé', 'Orge', 'Colza', 'Maïs', 'Tournesol', 'Protéagineux', 'Fourragère'],
    ENGRAIS: []
  };

  function aujourdhui() {
    var d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }

  function afficherSaisie(zone, compte) {
    var C = A.calculs;
    var element = C.element;
    var bouton = C.bouton;

    var contexte = null;
    var unites = [];
    var familles = [];
    var fournisseurChoisi = null;
    var produitChoisi = null;
    var session = [];

    zone.innerHTML = '';

    // ---- barre de saisie ----
    var barre = element('div', 'barre-rapide');

    var caseF = element('div', 'case-large');
    caseF.appendChild(element('span', 'etiquette', 'Fournisseur'));
    var champF = element('input', 'saisie');
    champF.type = 'text';
    champF.placeholder = 'Nom du fournisseur';
    var listeF = element('div', 'propositions');
    listeF.style.display = 'none';
    caseF.appendChild(champF);
    caseF.appendChild(listeF);
    barre.appendChild(caseF);

    var caseP = element('div', 'case-large');
    caseP.appendChild(element('span', 'etiquette', 'Produit'));
    var champP = element('input', 'saisie');
    champP.type = 'text';
    champP.placeholder = 'Nom du produit';
    var listeP = element('div', 'propositions');
    listeP.style.display = 'none';
    caseP.appendChild(champP);
    caseP.appendChild(listeP);
    barre.appendChild(caseP);

    var casePrix = element('div');
    casePrix.appendChild(element('span', 'etiquette', 'Prix'));
    var champPrix = element('input', 'saisie');
    champPrix.type = 'text';
    champPrix.inputMode = 'decimal';
    champPrix.placeholder = '0,00';
    casePrix.appendChild(champPrix);
    barre.appendChild(casePrix);

    var caseU = element('div');
    caseU.appendChild(element('span', 'etiquette', 'Unité'));
    var champU = element('select', 'saisie');
    caseU.appendChild(champU);
    barre.appendChild(caseU);

    barre.appendChild(bouton('ajouter', 'Ajouter', ajouter));
    zone.appendChild(barre);

    var rappel = element('p', 'rappel');
    rappel.style.display = 'none';
    zone.appendChild(rappel);

    // ---- encart de création d'un produit ----
    var creation = element('div', 'creation-produit');
    creation.style.display = 'none';
    var titreCreation = element('p', 'creation-titre');
    creation.appendChild(titreCreation);
    var lignesCreation = element('div', 'creation-lignes');

    var caseFam = element('div');
    caseFam.appendChild(element('span', 'etiquette', 'Famille'));
    var champFam = element('select', 'saisie');
    caseFam.appendChild(champFam);
    lignesCreation.appendChild(caseFam);

    var caseType = element('div');
    caseType.appendChild(element('span', 'etiquette', 'Type'));
    var champType = element('select', 'saisie');
    caseType.appendChild(champType);
    lignesCreation.appendChild(caseType);
    creation.appendChild(lignesCreation);
    zone.appendChild(creation);

    var alerte = element('p', 'alerte');
    alerte.style.display = 'none';
    zone.appendChild(alerte);

    var titreSession = element('p', 'titre-section', 'Saisis à l\'instant');
    titreSession.style.display = 'none';
    var tableau = element('div', 'tableau-prix');
    zone.appendChild(titreSession);
    zone.appendChild(tableau);

    var pied = element('div', 'actions');
    pied.appendChild(bouton('fin-session', 'Terminer et revenir à l\'accueil', function () {
      A.naviguer('accueil');
    }));
    zone.appendChild(pied);

    // ---- chargement ----
    Promise.all([C.chargerContexte(), A.bd.unite_prix.orderBy('ordre').toArray(),
                 A.bd.famille_produit.orderBy('ordre').toArray()])
      .then(function (r) {
        contexte = r[0];
        unites = r[1];
        familles = r[2];

        unites.forEach(function (u) { champU.appendChild(new Option(u.libelle, u.code)); });
        if (unites.some(function (u) { return u.code === 'L'; })) champU.value = 'L';

        champFam.appendChild(new Option('à choisir', ''));
        familles.forEach(function (f) { champFam.appendChild(new Option(f.libelle, f.code)); });
        majTypes();
      });

    champFam.addEventListener('change', majTypes);
    function majTypes() {
      var liste = TYPES[champFam.value] || [];
      champType.innerHTML = '';
      if (!liste.length) { caseType.style.display = 'none'; return; }
      caseType.style.display = 'block';
      champType.appendChild(new Option('à choisir', ''));
      liste.forEach(function (t) { champType.appendChild(new Option(t, t)); });
    }

    // ---- propositions ----
    function brancherPropositions(champ, liste, table, surChoix) {
      champ.addEventListener('input', function () {
        var texte = champ.value.trim();
        surChoix(null);
        if (texte.length < 2) { liste.style.display = 'none'; liste.innerHTML = ''; return; }
        A.rechercherFiches(table, texte, 6).then(function (lignes) {
          if (champ.value.trim() !== texte) return;
          liste.innerHTML = '';
          var exact = null;
          lignes.forEach(function (l) {
            if (A.normaliserLibelle(l.nom) === A.normaliserLibelle(texte)) exact = l;
          });
          if (exact) { surChoix(exact); liste.style.display = 'none'; return; }
          if (!lignes.length) { liste.style.display = 'none'; return; }
          liste.style.display = 'block';
          lignes.forEach(function (l) {
            liste.appendChild(bouton('proposition', l.nom, function () {
              champ.value = l.nom;
              surChoix(l);
              liste.style.display = 'none';
              liste.innerHTML = '';
            }));
          });
        });
      });
    }

    brancherPropositions(champF, listeF, 'fournisseur', function (f) {
      fournisseurChoisi = f;
      majRappel();
    });
    brancherPropositions(champP, listeP, 'produit', function (p) {
      produitChoisi = p;
      majRappel();
      majCreation();
    });

    function majCreation() {
      var texte = champP.value.trim();
      if (produitChoisi || texte.length < 3) { creation.style.display = 'none'; return; }
      titreCreation.innerHTML = '';
      titreCreation.appendChild(element('span', null, '« '));
      titreCreation.appendChild(element('b', null, texte));
      titreCreation.appendChild(element('span', null,
        ' » n\'existe pas encore. Dites de quoi il s\'agit, une seule fois.'));
      creation.style.display = 'block';
    }

    function majRappel() {
      if (!produitChoisi) { rappel.style.display = 'none'; return; }
      A.relevesRetenus().then(function (tous) {
        var siens = tous.filter(function (x) {
          var p = C.ficheConservee(contexte.produits, x.produit_id);
          if (!p || p.id !== produitChoisi.id) return false;
          if (!fournisseurChoisi) return true;
          var f = C.ficheConservee(contexte.fournisseurs, x.fournisseur_id);
          return f && f.id === fournisseurChoisi.id;
        }).sort(function (a, b) { return String(b.date_prix).localeCompare(String(a.date_prix)); });

        rappel.innerHTML = '';
        if (!siens.length) {
          rappel.appendChild(element('span', null, 'Premier relevé de '));
          rappel.appendChild(element('b', null, produitChoisi.nom));
          if (fournisseurChoisi) {
            rappel.appendChild(element('span', null, ' chez '));
            rappel.appendChild(element('b', null, fournisseurChoisi.nom));
          }
          rappel.appendChild(element('span', null, '.'));
        } else {
          var d = siens[0];
          var u = contexte.unites[d.unite_code];
          rappel.appendChild(element('span', null, 'Dernier prix connu'));
          if (fournisseurChoisi) {
            rappel.appendChild(element('span', null, ' chez '));
            rappel.appendChild(element('b', null, fournisseurChoisi.nom));
          }
          rappel.appendChild(element('span', null, ' : '));
          rappel.appendChild(element('b', null,
            C.nombreFrancais(d.prix_unitaire_ht) + ' ' + (u ? u.libelle : d.unite_code)));
          rappel.appendChild(element('span', null, ' le ' + C.dateFrancaise(d.date_prix) + '.'));
          if (d.unite_code) champU.value = d.unite_code;
        }
        rappel.style.display = 'block';
      });
    }

    function signaler(texte) {
      alerte.textContent = texte;
      alerte.style.display = 'block';
    }

    // ---- ajout d'une ligne ----
    function ajouter() {
      alerte.style.display = 'none';
      var nomF = champF.value.trim();
      var nomP = champP.value.trim();
      if (!nomF) return signaler('Indiquez le fournisseur.');
      if (!nomP) return signaler('Indiquez le produit.');
      var valeur = Number(String(champPrix.value).replace(',', '.'));
      if (!isFinite(valeur) || valeur <= 0) {
        return signaler('Indiquez un prix, remise déduite, hors taxes.');
      }
      if (!champU.value) return signaler('Indiquez à quoi correspond ce prix.');
      if (!produitChoisi && !champFam.value) {
        return signaler('Indiquez la famille de ce nouveau produit.');
      }
      if (!produitChoisi && (TYPES[champFam.value] || []).length && !champType.value) {
        return signaler('Indiquez le type de ce nouveau produit.');
      }

      var attente = Promise.resolve();

      if (!fournisseurChoisi) {
        attente = attente.then(function () {
          return A.enregistrerFiche('fournisseur', { nom: nomF }).then(function (f) {
            fournisseurChoisi = f;
            A.oublierIndex('fournisseur');
          });
        });
      }
      if (!produitChoisi) {
        attente = attente.then(function () {
          return A.enregistrerFiche('produit', {
            nom: nomP,
            famille_code: champFam.value,
            segment: champType.value || null,
            unite_code: champU.value
          }).then(function (p) {
            produitChoisi = p;
            A.oublierIndex('produit');
          });
        });
      }

      attente.then(function () {
        return A.enregistrerReleve({
          date_prix: aujourdhui(),
          fournisseur_id: fournisseurChoisi.id,
          produit_id: produitChoisi.id,
          prix_unitaire_ht: valeur,
          unite_code: champU.value,
          commentaire: null
        });
      }).then(function (ligne) {
        session.unshift({
          produit: produitChoisi.nom,
          fournisseur: fournisseurChoisi.nom,
          date: ligne.date_prix,
          prix: valeur,
          unite: champU.value
        });
        champP.value = '';
        champPrix.value = '';
        produitChoisi = null;
        rappel.style.display = 'none';
        creation.style.display = 'none';
        champFam.value = '';
        majTypes();
        listeP.style.display = 'none';
        champP.focus();
        return C.chargerContexte();
      }).then(function (ctx) {
        contexte = ctx;
        poserSession();
      }).catch(function (erreur) {
        signaler(A.messageSimple(erreur));
      });
    }

    function poserSession() {
      tableau.innerHTML = '';
      titreSession.style.display = session.length ? 'block' : 'none';
      if (!session.length) return;

      var entete = element('div', 'rangee entete');
      entete.appendChild(element('span', 'col-produit', 'Produit'));
      var m = element('span', 'col-meta');
      m.appendChild(element('span', 'col-fournisseur', 'Fournisseur'));
      m.appendChild(element('span', 'col-date', 'Date'));
      entete.appendChild(m);
      entete.appendChild(element('span', 'col-prix', 'Prix'));
      entete.appendChild(element('span', 'col-evolution', 'État'));
      tableau.appendChild(entete);

      session.forEach(function (x) {
        var u = contexte.unites[x.unite];
        var ligne = element('div', 'rangee');
        ligne.appendChild(element('span', 'col-produit', x.produit));
        var mm = element('span', 'col-meta');
        mm.appendChild(element('span', 'col-fournisseur', x.fournisseur));
        mm.appendChild(element('span', 'col-date', C.dateFrancaise(x.date)));
        ligne.appendChild(mm);
        var prix = element('span', 'col-prix');
        prix.appendChild(element('span', null, C.nombreFrancais(x.prix)));
        prix.appendChild(element('span', 'unite-discrete', ' ' + (u ? u.libelle : x.unite)));
        ligne.appendChild(prix);
        ligne.appendChild(element('span', 'col-evolution neutre', 'enregistré'));
        tableau.appendChild(ligne);
      });
    }
  }

  A.afficherSaisie = afficherSaisie;
})(window);
