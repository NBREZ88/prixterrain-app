// PrixTerrain — écran Outils et les écrans qu'il ouvre.
// Relevés à vérifier et à corriger, produits à relever, fiches en double,
// coût d'un programme, vider l'appareil, activité de l'équipe.

(function (global) {
  'use strict';

  var A = global.PrixTerrain;

  var MOIS_PAR_AN = 12;
  var JOURS_PAR_MOIS = 30.4375;
  var PEU_DE_RELEVES = 3;

  function ageEnMois(date) {
    if (!date) return null;
    return (Date.now() - new Date(String(date) + 'T00:00:00').getTime()) / 86400000 / JOURS_PAR_MOIS;
  }

  function aujourdhui() {
    var d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }

  function normaliser(nom) {
    return String(nom || '').toUpperCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Z0-9]/g, '');
  }

  // Regroupe les fiches par début de nom : deux fiches qui ne partagent pas
  // leurs premières lettres ne peuvent pas être un doublon de frappe.
  function pairesProches(fiches) {
    var casiers = {};
    fiches.forEach(function (f) {
      if (f.fusionne_vers) return;
      var n = normaliser(f.nom);
      if (!n) return;
      var clef = n.slice(0, 3);
      (casiers[clef] = casiers[clef] || []).push({ fiche: f, nom: n });
    });

    var out = [];
    Object.keys(casiers).forEach(function (clef) {
      var lot = casiers[clef];
      if (lot.length > 60) return;   // casier trop gros : comparaison inutile
      for (var i = 0; i < lot.length; i++) {
        for (var j = i + 1; j < lot.length; j++) {
          var a = lot[i], b = lot[j];
          var raison = null, force = null;
          if (a.nom === b.nom) { raison = 'même nom, écrit autrement'; force = 'fort'; }
          else if (Math.abs(a.nom.length - b.nom.length) <= 2 &&
                   distance(a.nom, b.nom) <= 2 &&
                   Math.min(a.nom.length, b.nom.length) >= 4) {
            raison = 'deux caractères de différence'; force = 'fort';
          } else if (a.nom.indexOf(b.nom) === 0 || b.nom.indexOf(a.nom) === 0) {
            raison = 'l\'un commence par l\'autre'; force = 'moyen';
          }
          if (raison) out.push({ a: a.fiche, b: b.fiche, raison: raison, force: force });
        }
      }
    });
    return out;
  }

  function distance(a, b) {
    var d = [], i, j;
    for (i = 0; i <= a.length; i++) d[i] = [i];
    for (j = 0; j <= b.length; j++) d[0][j] = j;
    for (i = 1; i <= a.length; i++) {
      for (j = 1; j <= b.length; j++) {
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1,
                           d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
    }
    return d[a.length][b.length];
  }

  // ---------------------------------------------------------------------------
  // Relevés dont l'écart au prix médian dépasse le seuil réglé
  // ---------------------------------------------------------------------------

  function relevesSuspects(releves, contexte, reglages, confirmes) {
    var seuil = reglages.valeur('ecart_atypique', '');
    if (seuil === null) return [];

    var C = A.calculs;

    // Médiane par produit et par unité, sur les seuls relevés encore valables.
    var groupes = {};
    releves.forEach(function (x) {
      if (confirmes && confirmes[x.id]) return;
      var p = C.ficheConservee(contexte.produits, x.produit_id);
      if (!p) return;
      var clef = p.id + '|' + x.unite_code;
      if (!groupes[clef]) groupes[clef] = { produit: p, lignes: [] };
      groupes[clef].lignes.push(x);
    });

    var out = [];
    Object.keys(groupes).forEach(function (clef) {
      var g = groupes[clef];
      var prix = g.lignes.map(function (x) { return Number(x.prix_unitaire_ht); })
        .sort(function (a, b) { return a - b; });
      var milieu = Math.floor(prix.length / 2);
      var med = prix.length % 2 ? prix[milieu] : (prix[milieu - 1] + prix[milieu]) / 2;
      if (!med) return;

      g.lignes.forEach(function (x) {
        var ecart = (Number(x.prix_unitaire_ht) - med) / med * 100;
        if (Math.abs(ecart) > seuil) {
          out.push({ releve: x, produit: g.produit, mediane: med, ecart: ecart });
        }
      });
    });
    out.sort(function (a, b) { return Math.abs(b.ecart) - Math.abs(a.ecart); });
    return out;
  }

  // ---------------------------------------------------------------------------
  // Écran Outils
  // ---------------------------------------------------------------------------

  function afficherOutils(zone, compte) {
    var C = A.calculs;
    var element = C.element;
    var bouton = C.bouton;
    var responsable = compte && compte.role === 'administrateur';

    zone.innerHTML = '';
    zone.appendChild(element('p', 'appui', 'Lecture…'));

    Promise.all([C.chargerContexte(), C.chargerReglages(), A.relevesRetenus(),
                 A.bd.verification_releve.toArray(), A.bd.ecartement_doublon.toArray(),
                 A.bd.produit.toArray(), A.bd.fournisseur.toArray()])
      .then(function (r) {
        var contexte = r[0], reglages = r[1], releves = r[2];
        var confirmes = {};
        r[3].forEach(function (v) { confirmes[v.releve_id] = true; });
        var ecartes = {};
        r[4].forEach(function (e) {
          ecartes[e.table_visee + '|' + e.fiche_a + '|' + e.fiche_b] = true;
          ecartes[e.table_visee + '|' + e.fiche_b + '|' + e.fiche_a] = true;
        });

        var aVerifier = relevesSuspects(releves, contexte, reglages, confirmes).length;

        var aRelever = 0;
        var derniers = {};
        releves.forEach(function (x) {
          var p = C.ficheConservee(contexte.produits, x.produit_id);
          if (!p) return;
          if (!derniers[p.id] || x.date_prix > derniers[p.id].date) {
            derniers[p.id] = { date: x.date_prix, famille: p.famille_code };
          }
        });
        Object.keys(derniers).forEach(function (id) {
          var v = reglages.valeur('duree_validite', derniers[id].famille);
          if (v !== null && ageEnMois(derniers[id].date) > v) aRelever++;
        });

        var doublons = pairesProches(r[5]).filter(function (p) {
                         return !ecartes['produit|' + p.a.id + '|' + p.b.id];
                       }).length +
                       pairesProches(r[6]).filter(function (p) {
                         return !ecartes['fournisseur|' + p.a.id + '|' + p.b.id];
                       }).length;

        var reglagesManquants = 0;
        Object.keys(contexte.familles).forEach(function (k) {
          if (reglages.valeur('duree_validite', k) === null) reglagesManquants++;
        });
        if (reglages.valeur('ecart_atypique', '') === null) reglagesManquants++;

        zone.innerHTML = '';

        // Ce qui appelle une action vient en tête ; le dépannage ferme la marche.
        var entrees = [
          ['releves', 'Relevés à vérifier et à corriger',
           'Vérifier un prix qui s\'écarte de la moyenne, ou corriger une saisie.',
           aVerifier || null],
          ['a-relever', 'Produits à relever',
           'Ceux dont le dernier prix dépasse la durée de validité.', aRelever || null],
          ['doublons', 'Fiches en double',
           'Réunir deux fiches qui désignent la même chose.', doublons || null]
        ];
        if (responsable) {
          entrees.push(['reglages', 'Réglages',
            'Les durées et seuils qui commandent les prix moyens.',
            reglagesManquants ? reglagesManquants + ' à régler' : null]);
        }
        entrees.push(['programme', 'Coût d\'un programme',
          'Composer un itinéraire et obtenir son coût à l\'hectare.', null]);
        entrees.push(['export', 'Export tableur',
          'Les prix moyens par fournisseur dans un fichier pour votre tableur.',
          null, 'ordinateur']);
        if (responsable) {
          entrees.push(['activite', 'Activité de l\'équipe',
            'Nombre de relevés par conseiller et par mois.', null]);
        }

        entrees.forEach(function (e) {
          if (e[4] === 'ordinateur' && window.innerWidth < 900) return;
          var b = bouton('carte-outil', '', function () { A.naviguer(e[0]); });
          var haut = element('div', 'co-haut');
          haut.appendChild(element('span', 'co-titre', e[1]));
          if (e[3]) haut.appendChild(element('span', 'co-compteur', String(e[3])));
          else haut.appendChild(element('span', 'co-fleche', '›'));
          b.appendChild(haut);
          b.appendChild(element('span', 'co-appui', e[2]));
          zone.appendChild(b);
        });
      });

  }

  // ---------------------------------------------------------------------------
  // Fenêtre de correction d'un relevé, partagée par les écrans
  // ---------------------------------------------------------------------------

  function ouvrirCorrection(releve, contexte, apres) {
    var C = A.calculs;
    var element = C.element;
    var bouton = C.bouton;

    var voile = element('div', 'voile');
    var boite = element('div', 'boite');

    var produit = C.ficheConservee(contexte.produits, releve.produit_id);
    var fournisseur = C.ficheConservee(contexte.fournisseurs, releve.fournisseur_id);

    var tete = element('div', 'boite-tete');
    var textes = element('div');
    textes.appendChild(element('p', 'boite-titre', 'Corriger ce relevé'));
    textes.appendChild(element('p', 'boite-sous',
      (produit ? produit.nom : '?') + ' chez ' + (fournisseur ? fournisseur.nom : '?') +
      ', saisi le ' + C.dateFrancaise(releve.date_prix)));
    tete.appendChild(textes);
    tete.appendChild(bouton('boite-fermer', '✕', function () { voile.remove(); }));
    boite.appendChild(tete);

    var corps = element('div', 'boite-corps');

    function champ(libelle, valeur, type) {
      var c = element('div', 'champ-fenetre');
      c.appendChild(element('span', 'lab', libelle));
      var i = element('input', 'ch');
      i.type = type || 'text';
      i.value = valeur;
      c.appendChild(i);
      var rappel = element('p', 'avant');
      rappel.style.display = 'none';
      c.appendChild(rappel);
      i.addEventListener('input', function () {
        var change = i.value !== valeur;
        i.className = change ? 'ch modifie' : 'ch';
        rappel.innerHTML = '';
        if (change) {
          rappel.appendChild(element('span', null, 'était '));
          rappel.appendChild(element('b', null, valeur));
        }
        rappel.style.display = change ? 'block' : 'none';
      });
      corps.appendChild(c);
      return i;
    }

    var champProduit = champ('Produit', produit ? produit.nom : '');
    var champFournisseur = champ('Fournisseur', fournisseur ? fournisseur.nom : '');

    var ligne = element('div', 'ligne-fenetre');
    var cPrix = element('div', 'champ-fenetre');
    cPrix.appendChild(element('span', 'lab', 'Prix hors taxes'));
    var champPrix = element('input', 'ch');
    champPrix.type = 'text';
    champPrix.inputMode = 'decimal';
    var prixInitial = C.nombreFrancais(releve.prix_unitaire_ht);
    champPrix.value = prixInitial;
    cPrix.appendChild(champPrix);
    var rappelPrix = element('p', 'avant');
    rappelPrix.style.display = 'none';
    cPrix.appendChild(rappelPrix);
    champPrix.addEventListener('input', function () {
      var change = champPrix.value !== prixInitial;
      champPrix.className = change ? 'ch modifie' : 'ch';
      rappelPrix.innerHTML = '';
      if (change) {
        rappelPrix.appendChild(element('span', null, 'était '));
        rappelPrix.appendChild(element('b', null, prixInitial));
      }
      rappelPrix.style.display = change ? 'block' : 'none';
    });
    ligne.appendChild(cPrix);

    var cUnite = element('div', 'champ-fenetre court');
    cUnite.appendChild(element('span', 'lab', 'Unité'));
    var champUnite = element('select', 'ch');
    Object.keys(contexte.unites).forEach(function (u) {
      champUnite.appendChild(new Option(contexte.unites[u].libelle, u));
    });
    champUnite.value = releve.unite_code;
    cUnite.appendChild(champUnite);
    ligne.appendChild(cUnite);
    corps.appendChild(ligne);

    var champDate = champ('Date du prix', String(releve.date_prix), 'date');

    corps.appendChild(element('p', 'note',
      'Le relevé d\'origine sera marqué annulé et restera dans l\'historique. ' +
      'Un relevé neuf sera enregistré avec ces valeurs.'));
    boite.appendChild(corps);

    var alerte = element('p', 'alerte');
    alerte.style.display = 'none';
    corps.appendChild(alerte);

    var pied = element('div', 'boite-pied');
    pied.appendChild(bouton('principal pleine', 'Enregistrer la correction', function () {
      var valeur = Number(String(champPrix.value).replace(',', '.'));
      if (!isFinite(valeur) || valeur <= 0) {
        alerte.textContent = 'Indiquez un prix, remise déduite, hors taxes.';
        alerte.style.display = 'block';
        return;
      }
      A.enregistrerAnnulation(releve.id, 'correction')
        .then(function () {
          return A.enregistrerReleve({
            date_prix: champDate.value || releve.date_prix,
            fournisseur_id: releve.fournisseur_id,
            produit_id: releve.produit_id,
            prix_unitaire_ht: valeur,
            unite_code: champUnite.value,
            commentaire: null
          });
        })
        .then(function () { voile.remove(); if (apres) apres(); })
        .catch(function (e) {
          alerte.textContent = A.messageSimple(e);
          alerte.style.display = 'block';
        });
    }));
    pied.appendChild(bouton('lien-danger', 'Supprimer sans remplacer', function () {
      A.enregistrerAnnulation(releve.id, 'suppression')
        .then(function () { voile.remove(); if (apres) apres(); })
        .catch(function (e) {
          alerte.textContent = A.messageSimple(e);
          alerte.style.display = 'block';
        });
    }));
    boite.appendChild(pied);

    voile.appendChild(boite);
    voile.addEventListener('click', function (e) { if (e.target === voile) voile.remove(); });
    document.body.appendChild(voile);
  }

  // ---------------------------------------------------------------------------
  // Relevés à vérifier et à corriger
  // ---------------------------------------------------------------------------

  function afficherReleves(zone, compte) {
    var C = A.calculs;
    var element = C.element;
    var bouton = C.bouton;
    var responsable = compte && compte.role === 'administrateur';

    var vue = 'verifier';
    var filtre = '';
    var contexte = null, reglages = null, releves = [], confirmes = {};

    zone.innerHTML = '';
    var onglets = element('div', 'sel-onglets');
    zone.appendChild(onglets);
    var explication = element('p', 'appui', 'Lecture…');
    zone.appendChild(explication);

    var recherche = element('div', 'recherche');
    var champ = element('input', 'champ-recherche');
    champ.type = 'search';
    champ.placeholder = 'Chercher un produit ou un fournisseur';
    champ.addEventListener('input', function () { filtre = champ.value.trim(); poser(); });
    recherche.appendChild(champ);
    recherche.style.marginBottom = '.9rem';
    zone.appendChild(recherche);

    var liste = element('div');
    zone.appendChild(liste);
    A.suivreHauteur(liste);

    function charger() {
      return Promise.all([C.chargerContexte(), C.chargerReglages(), A.relevesRetenus(),
                          A.bd.verification_releve.toArray()])
        .then(function (r) {
          contexte = r[0]; reglages = r[1]; releves = r[2];
          confirmes = {};
          r[3].forEach(function (v) { confirmes[v.releve_id] = true; });
        });
    }

    charger().then(poser);

    function annulable(x) {
      return responsable || (compte && x.saisi_par === compte.id);
    }

    function correspond(x) {
      if (!filtre) return true;
      var f = filtre.toUpperCase();
      var p = C.ficheConservee(contexte.produits, x.produit_id);
      var g = C.ficheConservee(contexte.fournisseurs, x.fournisseur_id);
      return (p && p.nom.toUpperCase().indexOf(f) >= 0) ||
             (g && g.nom.toUpperCase().indexOf(f) >= 0);
    }

    function poserOnglets(nb) {
      onglets.innerHTML = '';
      [['verifier', 'À vérifier' + (nb ? ' (' + nb + ')' : '')],
       ['tous', 'Tous les relevés']].forEach(function (o) {
        onglets.appendChild(bouton(vue === o[0] ? 'on' : '', o[1], function () {
          vue = o[0]; poser();
        }));
      });
    }

    function poser() {
      liste.innerHTML = '';
      var suspects = relevesSuspects(releves, contexte, reglages, confirmes);
      poserOnglets(suspects.length);

      var seuil = reglages.valeur('ecart_atypique', '');
      explication.textContent = vue === 'verifier'
        ? (seuil === null
            ? 'L\'écart au prix médian n\'est pas réglé : aucun relevé ne peut être signalé.'
            : 'Relevés qui s\'écartent de plus de ' + C.nombreFrancais(seuil, 0) +
              ' % du prix médian de leur produit. Vérifiez, puis corrigez ou confirmez.')
        : 'Tous les relevés, du plus récent au plus ancien. Touchez-en un pour le corriger.';

      if (vue === 'verifier') poserSuspects(suspects); else poserTous();
      A.ajusterHauteurs();
    }

    function poserSuspects(suspects) {
      var lot = suspects.filter(function (o) { return correspond(o.releve); });
      if (!lot.length) {
        liste.appendChild(element('p', 'vide',
          'Aucun relevé ne s\'écarte anormalement du prix médian. ' +
          'Les relevés confirmés justes ne réapparaissent pas ici.'));
        return;
      }

      var tableau = element('div', 'tableau-prix');
      var entete = element('div', 'rangee entete');
      entete.appendChild(element('span', 'col-produit', 'Produit'));
      var m = element('span', 'col-meta');
      m.appendChild(element('span', 'col-fournisseur', 'Prix relevé'));
      m.appendChild(element('span', 'col-date', 'Prix médian'));
      entete.appendChild(m);
      entete.appendChild(element('span', 'col-prix', 'Écart'));
      entete.appendChild(element('span', 'col-evolution', ''));
      tableau.appendChild(entete);

      lot.forEach(function (o) {
        var x = o.releve;
        var f = C.ficheConservee(contexte.fournisseurs, x.fournisseur_id);
        var auteur = contexte.profils[x.saisi_par];
        var u = contexte.unites[x.unite_code];

        var ligne = element('div', 'rangee attention');
        var nom = element('span', 'col-produit');
        nom.appendChild(element('span', 'ligne-nom', o.produit.nom));
        nom.appendChild(element('span', 'ligne-appui',
          (f ? f.nom : '?') + ' · ' + C.dateFrancaise(x.date_prix) +
          (auteur ? ' · ' + auteur.nom : '')));
        ligne.appendChild(nom);

        var meta = element('span', 'col-meta');
        meta.appendChild(element('span', 'col-fournisseur',
          C.nombreFrancais(x.prix_unitaire_ht) + ' ' + (u ? u.libelle : x.unite_code)));
        meta.appendChild(element('span', 'col-date',
          'médian ' + C.nombreFrancais(o.mediane) + ' ' + (u ? u.libelle : x.unite_code)));
        ligne.appendChild(meta);

        var cellEcart = element('span', 'col-prix');
        cellEcart.appendChild(element('span', 'ec',
          (o.ecart > 0 ? '+' : '') + C.nombreFrancais(o.ecart, 1) + ' %'));
        ligne.appendChild(cellEcart);

        var actions = element('span', 'col-evolution cellule-action');
        if (annulable(x)) {
          actions.appendChild(bouton('mini-bouton', 'Corriger', function () {
            ouvrirCorrection(x, contexte, function () { charger().then(poser); });
          }));
          actions.appendChild(bouton('mini-bouton clair', 'C\'est juste', function () {
            A.bd.verification_releve.put({
              releve_id: x.id,
              confirme_par: compte ? compte.id : null,
              confirme_le: new Date().toISOString(),
              etat: 'a_envoyer'
            }).then(function () { charger().then(poser); });
          }));
        } else {
          actions.appendChild(element('span', 'ligne-appui',
            'saisi par ' + (auteur ? auteur.nom.split(' ')[0] : 'un collègue')));
        }
        ligne.appendChild(actions);
        tableau.appendChild(ligne);
      });
      liste.appendChild(tableau);

      var pied = element('div', 'pied-liste');
      pied.appendChild(element('span', null,
        lot.length + (lot.length > 1 ? ' relevés à vérifier' : ' relevé à vérifier')));
      liste.appendChild(pied);
    }

    function poserTous() {
      var lot = releves.filter(correspond)
        .sort(function (a, b) { return String(b.date_prix).localeCompare(String(a.date_prix)); })
        .slice(0, 30);

      if (!lot.length) {
        liste.appendChild(element('p', 'vide', 'Aucun relevé sous ce nom.'));
        return;
      }

      var tableau = element('div', 'tableau-prix');
      var entete = element('div', 'rangee entete');
      entete.appendChild(element('span', 'col-produit', 'Produit'));
      var m = element('span', 'col-meta');
      m.appendChild(element('span', 'col-fournisseur', 'Fournisseur'));
      m.appendChild(element('span', 'col-date', 'Date'));
      entete.appendChild(m);
      entete.appendChild(element('span', 'col-prix', 'Prix'));
      entete.appendChild(element('span', 'col-evolution', 'Action'));
      tableau.appendChild(entete);

      lot.forEach(function (x) {
        var p = C.ficheConservee(contexte.produits, x.produit_id);
        var f = C.ficheConservee(contexte.fournisseurs, x.fournisseur_id);
        var u = contexte.unites[x.unite_code];
        var auteur = contexte.profils[x.saisi_par];
        var permis = annulable(x);

        var ligne = permis
          ? bouton('rangee', '', function () {
              ouvrirCorrection(x, contexte, function () { charger().then(poser); });
            })
          : element('div', 'rangee sans-action');
        ligne.appendChild(element('span', 'col-produit', p ? p.nom : 'produit non retrouvé'));
        var meta = element('span', 'col-meta');
        meta.appendChild(element('span', 'col-fournisseur', f ? f.nom : '?'));
        meta.appendChild(element('span', 'col-date', C.dateFrancaise(x.date_prix)));
        ligne.appendChild(meta);
        var prix = element('span', 'col-prix');
        prix.appendChild(element('span', null, C.nombreFrancais(x.prix_unitaire_ht)));
        prix.appendChild(element('span', 'unite-discrete', ' ' + (u ? u.libelle : x.unite_code)));
        ligne.appendChild(prix);
        ligne.appendChild(element('span',
          permis ? 'col-evolution action-annuler' : 'col-evolution neutre',
          permis ? 'Corriger' : 'saisi par ' + (auteur ? auteur.nom.split(' ')[0] : 'un collègue')));
        tableau.appendChild(ligne);
      });
      liste.appendChild(tableau);
    }
  }

  // ---------------------------------------------------------------------------
  // Produits à relever
  // ---------------------------------------------------------------------------

  function afficherARelever(zone, compte) {
    var C = A.calculs;
    var element = C.element;
    var bouton = C.bouton;

    zone.innerHTML = '';
    zone.appendChild(element('p', 'appui', 'Lecture…'));

    Promise.all([C.chargerContexte(), C.chargerReglages(), A.relevesRetenus(),
                 A.bd.produit.toArray()])
      .then(function (r) {
        var contexte = r[0], reglages = r[1], releves = r[2], produits = r[3];
        zone.innerHTML = '';

        var manquantes = Object.keys(contexte.familles).filter(function (k) {
          return reglages.valeur('duree_validite', k) === null;
        });
        if (manquantes.length === Object.keys(contexte.familles).length) {
          zone.appendChild(element('div', 'encart-manquant',
            'La durée de validité d\'un relevé n\'est pas renseignée dans les Réglages. ' +
            'Sans elle, l\'application ne peut pas dire quel prix est périmé.'));
          zone.appendChild(element('p', 'vide',
            'Rien à afficher pour l\'instant. Un responsable doit renseigner la durée de validité.'));
          return;
        }

        zone.appendChild(element('p', 'appui',
          'Produits dont le dernier prix dépasse la durée de validité : ' +
          Object.keys(contexte.familles).map(function (k) {
            var v = reglages.valeur('duree_validite', k);
            return contexte.familles[k].libelle + ' ' +
                   (v === null ? 'non réglée' : C.nombreFrancais(v, 0) + ' mois');
          }).join(' · ') + '.'));

        var derniers = {}, fournisseurs = {};
        releves.forEach(function (x) {
          var p = C.ficheConservee(contexte.produits, x.produit_id);
          if (!p) return;
          if (!derniers[p.id] || x.date_prix > derniers[p.id].date_prix) derniers[p.id] = x;
          (fournisseurs[p.id] = fournisseurs[p.id] || {})[x.fournisseur_id] = true;
        });

        var aRelever = [], bientot = [], jamais = 0;
        produits.forEach(function (p) {
          if (p.fusionne_vers) return;
          var d = derniers[p.id];
          if (!d) { jamais++; return; }
          var validite = reglages.valeur('duree_validite', p.famille_code);
          if (validite === null) return;
          var mois = ageEnMois(d.date_prix);
          var entree = { produit: p, dernier: d, mois: mois, validite: validite,
                         fournisseurs: Object.keys(fournisseurs[p.id] || {}).length };
          if (mois > validite) aRelever.push(entree);
          else if (mois > validite - 3) bientot.push(entree);
        });
        aRelever.sort(function (a, b) { return b.mois - a.mois; });
        bientot.sort(function (a, b) { return b.mois - a.mois; });

        if (!aRelever.length && !bientot.length) {
          zone.appendChild(element('p', 'vide',
            'Aucun produit à relever. Tous les prix suivis sont récents.'));
          if (jamais) zone.appendChild(element('p', 'appui',
            jamais + ' produits du catalogue n\'ont jamais été relevés.'));
          return;
        }

        var liste = element('div');
        zone.appendChild(liste);
        A.suivreHauteur(liste);

        [['Périmés depuis plus de six mois', function (x) { return x.mois > x.validite + 6; }],
         ['Périmés récemment', function (x) { return x.mois > x.validite && x.mois <= x.validite + 6; }]
        ].forEach(function (section) {
          var lot = aRelever.filter(section[1]);
          if (!lot.length) return;
          liste.appendChild(element('p', 'titre-section', section[0]));
          liste.appendChild(tableau(lot));
        });

        if (bientot.length) {
          liste.appendChild(element('p', 'titre-section', 'Bientôt périmés'));
          liste.appendChild(tableau(bientot));
        }

        var pied = element('div', 'pied-liste');
        pied.appendChild(element('span', null, aRelever.length +
          (aRelever.length > 1 ? ' produits suivis à relever' : ' produit suivi à relever')));
        if (jamais) pied.appendChild(element('span', 'pied-appui',
          jamais + ' produits du catalogue jamais relevés'));
        liste.appendChild(pied);
        A.ajusterHauteurs();

        function tableau(lot) {
          var t = element('div', 'tableau-prix');
          var entete = element('div', 'rangee entete');
          entete.appendChild(element('span', 'col-produit', 'Produit'));
          var m = element('span', 'col-meta');
          m.appendChild(element('span', 'col-fournisseur', 'Fournisseurs'));
          m.appendChild(element('span', 'col-date', 'Dernier relevé'));
          entete.appendChild(m);
          entete.appendChild(element('span', 'col-prix', 'Dernier prix'));
          entete.appendChild(element('span', 'col-evolution', 'Depuis'));
          t.appendChild(entete);

          lot.forEach(function (x) {
            var u = contexte.unites[x.dernier.unite_code];
            var ligne = bouton('rangee', '', function () {
              A.naviguer('produit', { fiche: x.produit });
            });
            ligne.appendChild(element('span', 'col-produit', x.produit.nom));

            var meta = element('span', 'col-meta');
            meta.appendChild(element('span', 'col-fournisseur',
              x.fournisseurs + (x.fournisseurs > 1 ? ' fournisseurs' : ' fournisseur')));
            meta.appendChild(element('span', 'col-date', C.dateFrancaise(x.dernier.date_prix)));
            ligne.appendChild(meta);

            var prix = element('span', 'col-prix');
            prix.appendChild(element('span', null, C.nombreFrancais(x.dernier.prix_unitaire_ht)));
            prix.appendChild(element('span', 'unite-discrete',
              ' ' + (u ? u.libelle : x.dernier.unite_code)));
            ligne.appendChild(prix);

            var mois = Math.round(x.mois);
            var teinte = x.mois > x.validite + 6 ? 'age rouge'
                       : (x.mois > x.validite ? 'age ocre' : 'age vert');
            var cell = element('span', 'col-evolution cellule-action');
            cell.appendChild(element('span', teinte, mois + ' mois'));
            var saisir = element('span', 'mini-bouton', 'Saisir');
            saisir.addEventListener('click', function (e) {
              e.stopPropagation();
              A.naviguer('saisie', { produit: x.produit });
            });
            cell.appendChild(saisir);
            ligne.appendChild(cell);

            t.appendChild(ligne);
          });
          return t;
        }
      });
  }

  // ---------------------------------------------------------------------------
  // Vider les données de cet appareil
  // ---------------------------------------------------------------------------

  function afficherVider(zone, compte) {
    var C = A.calculs;
    var element = C.element;
    var bouton = C.bouton;

    zone.innerHTML = '';
    zone.appendChild(element('p', 'appui',
      'Cette action efface la copie locale des données, puis la reprend depuis l\'équipe. ' +
      'Rien n\'est perdu de ce qui a déjà été envoyé : tout reste sur le serveur.'));

    Promise.all([A.bd.releve.count(), A.bd.produit.count(), A.bd.fournisseur.count(),
                 A.nombreEnAttente(), A.bd.memo.get('programmes')])
      .then(function (r) {
        var programmes = [];
        try { programmes = r[4] ? JSON.parse(r[4].valeur) : []; } catch (e) { programmes = []; }

        zone.appendChild(element('p', 'titre-section', 'Ce que contient cet appareil'));
        var chiffres = element('div', 'etat-appareil');
        [[String(r[0]), 'relevés en copie'], [String(r[1]), 'produits'],
         [String(r[2]), 'fournisseurs'],
         [String(programmes.length), programmes.length > 1 ? 'programmes' : 'programme']
        ].forEach(function (c) {
          var carte = element('div', 'etat-carte');
          carte.appendChild(element('b', null, c[0]));
          carte.appendChild(element('span', null, c[1]));
          chiffres.appendChild(carte);
        });
        zone.appendChild(chiffres);

        var encadre = element('div', 'encadre-etat');
        function ligneEtat(libelle, valeur, teinte) {
          var l = element('div', 'ligne-etat');
          l.appendChild(element('span', null, libelle));
          l.appendChild(element('b', teinte || null, valeur));
          encadre.appendChild(l);
        }
        ligneEtat('Saisies en attente d\'envoi',
          r[3] ? r[3] + (r[3] > 1 ? ' relevés' : ' relevé') : 'aucune',
          r[3] ? 'en-retard' : null);
        ligneEtat('Réseau', navigator.onLine ? 'disponible' : 'absent',
          navigator.onLine ? null : 'en-retard');
        zone.appendChild(encadre);

        var bloque = false;
        if (r[3]) {
          bloque = true;
          var rouge = element('div', 'avertissement rouge');
          rouge.appendChild(element('b', null,
            r[3] + (r[3] > 1 ? ' relevés ne sont pas encore partis' :
                               ' relevé n\'est pas encore parti') + ' à l\'équipe. '));
          rouge.appendChild(element('span', null,
            'Ils n\'existent que sur cet appareil : les vider les perdrait définitivement. ' +
            'Attendez le retour du réseau.'));
          zone.appendChild(rouge);
        } else if (!navigator.onLine) {
          bloque = true;
          zone.appendChild(element('div', 'avertissement ocre',
            'Sans réseau, les données ne pourraient pas être reprises après le vidage. ' +
            'L\'application resterait vide jusqu\'au prochain échange.'));
        } else if (programmes.length) {
          var vert = element('div', 'avertissement vert');
          vert.appendChild(element('span', null, 'Vos ' + programmes.length +
            (programmes.length > 1 ? ' programmes sont enregistrés' :
                                     ' programme est enregistré') +
            ' sur cet appareil seulement. '));
          vert.appendChild(element('b', null, 'Ils seront effacés et ne pourront pas être repris.'));
          zone.appendChild(vert);
        }

        var b = bouton('bouton-danger', 'Vider et recharger depuis l\'équipe', function () {
          if (!bloque) confirmer();
        });
        if (bloque) b.disabled = true;
        zone.appendChild(b);

        function confirmer() {
          var voile = element('div', 'voile');
          var boite = element('div', 'boite');

          var tete = element('div', 'boite-tete');
          var textes = element('div');
          textes.appendChild(element('p', 'boite-titre danger', 'Vider cet appareil ?'));
          textes.appendChild(element('p', 'boite-sous',
            'L\'application se rechargera depuis l\'équipe'));
          tete.appendChild(textes);
          tete.appendChild(bouton('boite-fermer', '✕', function () { voile.remove(); }));
          boite.appendChild(tete);

          var corps = element('div', 'boite-corps');
          corps.appendChild(element('p', 'boite-appui',
            'Les ' + r[0] + ' relevés, ' + r[1] + ' produits et ' + r[2] +
            ' fournisseurs seront repris du serveur dans quelques instants.'));
          if (programmes.length) {
            var p = element('p', 'boite-appui perte');
            p.appendChild(element('b', null, 'Vos ' + programmes.length +
              (programmes.length > 1 ? ' programmes seront perdus' :
                                       ' programme sera perdu') + ' : '));
            p.appendChild(element('span', null, 'ils ne sont enregistrés que sur cet appareil.'));
            corps.appendChild(p);
          }
          boite.appendChild(corps);

          var pied = element('div', 'boite-pied');
          pied.appendChild(bouton('bouton-danger', 'Vider cet appareil', function () {
            voile.remove();
            zone.innerHTML = '';
            zone.appendChild(element('p', 'appui', 'Vidage en cours…'));
            A.bd.delete()
              .then(function () { location.reload(); })
              .catch(function (e) {
                zone.appendChild(element('p', 'alerte', A.messageSimple(e)));
              });
          }));
          pied.appendChild(bouton('bouton-neutre', 'Revenir', function () { voile.remove(); }));
          boite.appendChild(pied);

          voile.appendChild(boite);
          voile.addEventListener('click', function (e) { if (e.target === voile) voile.remove(); });
          document.body.appendChild(voile);
        }
      });
  }

  // ---------------------------------------------------------------------------
  // Activité de l'équipe
  // ---------------------------------------------------------------------------

  function afficherActivite(zone, compte) {
    var C = A.calculs;
    var element = C.element;

    zone.innerHTML = '';
    if (!compte || compte.role !== 'administrateur') {
      zone.appendChild(element('p', 'vide', 'Cet écran est réservé aux responsables.'));
      return;
    }

    zone.appendChild(element('p', 'appui', 'Lecture…'));

    Promise.all([C.chargerContexte(), A.relevesRetenus()]).then(function (r) {
      var contexte = r[0], releves = r[1];
      zone.innerHTML = '';

      if (!releves.length) {
        zone.appendChild(element('p', 'vide', 'Aucun relevé pour l\'instant.'));
        return;
      }

      var dates = releves.map(function (x) { return String(x.date_prix); }).sort();
      zone.appendChild(element('p', 'appui',
        'Depuis la mise en service, en ' + moisEnClair(dates[0]) + '.'));

      var moisCourant = aujourdhui().slice(0, 7);
      var ceMois = releves.filter(function (x) {
        return String(x.date_prix).slice(0, 7) === moisCourant;
      }).length;

      var parConseiller = {};
      Object.keys(contexte.profils).forEach(function (id) {
        parConseiller[id] = { nom: contexte.profils[id].nom, nombre: 0,
                              produits: {}, dernier: null, mois: {} };
      });
      releves.forEach(function (x) {
        var c = parConseiller[x.saisi_par];
        if (!c) return;
        c.nombre++;
        c.produits[x.produit_id] = true;
        if (!c.dernier || x.date_prix > c.dernier) c.dernier = x.date_prix;
        var m = String(x.date_prix).slice(0, 7);
        c.mois[m] = (c.mois[m] || 0) + 1;
      });

      var actifs = 0, endormis = 0;
      Object.keys(parConseiller).forEach(function (id) {
        var d = parConseiller[id].dernier;
        if (d && ageEnMois(d) <= 1) actifs++; else endormis++;
      });

      var chiffres = element('div', 'chiffres-activite');
      [[String(releves.length), 'relevés en tout', true],
       [String(ceMois), 'ce mois-ci', false],
       [String(actifs), actifs > 1 ? 'conseillers actifs' : 'conseiller actif', false],
       [String(endormis), 'sans relevé depuis un mois', false]
      ].forEach(function (c) {
        var carte = element('div', c[2] ? 'chiffre-activite vif' : 'chiffre-activite');
        carte.appendChild(element('b', null, c[0]));
        carte.appendChild(element('span', null, c[1]));
        chiffres.appendChild(carte);
      });
      zone.appendChild(chiffres);

      var moisRecents = [];
      var maintenant = new Date();
      for (var i = 5; i >= 0; i--) {
        var d = new Date(maintenant.getFullYear(), maintenant.getMonth() - i, 1);
        moisRecents.push(d.toISOString().slice(0, 7));
      }

      zone.appendChild(element('p', 'titre-section', 'Par conseiller'));
      var liste = element('div');
      zone.appendChild(liste);
      A.suivreHauteur(liste);

      var tableau = element('div', 'tableau-prix');
      var entete = element('div', 'rangee entete');
      entete.appendChild(element('span', 'col-produit', 'Conseiller'));
      var m = element('span', 'col-meta');
      m.appendChild(element('span', 'col-fournisseur', 'Relevés'));
      m.appendChild(element('span', 'col-date', 'Produits couverts'));
      entete.appendChild(m);
      entete.appendChild(element('span', 'col-prix', 'Six derniers mois'));
      entete.appendChild(element('span', 'col-evolution', 'Dernier relevé'));
      tableau.appendChild(entete);

      Object.keys(parConseiller).sort(function (a, b) {
        return parConseiller[b].nombre - parConseiller[a].nombre;
      }).forEach(function (id) {
        var bloc = parConseiller[id];
        var ligne = element('div', 'rangee');
        ligne.appendChild(element('span', 'col-produit', bloc.nom));

        var meta = element('span', 'col-meta');
        meta.appendChild(element('span', 'col-fournisseur',
          bloc.nombre + (bloc.nombre > 1 ? ' relevés' : ' relevé')));
        meta.appendChild(element('span', 'col-date',
          Object.keys(bloc.produits).length + ' produits'));
        ligne.appendChild(meta);

        var courbe = element('span', 'col-prix');
        courbe.appendChild(barresMois(moisRecents.map(function (mm) {
          return bloc.mois[mm] || 0;
        })));
        ligne.appendChild(courbe);

        var quand = element('span', 'col-evolution');
        if (!bloc.dernier) {
          quand.appendChild(element('span', 'depuis vieux', 'aucun relevé'));
        } else {
          quand.appendChild(element('span',
            'depuis' + (ageEnMois(bloc.dernier) > 1 ? ' vieux' : ''),
            depuisQuand(bloc.dernier)));
        }
        ligne.appendChild(quand);
        tableau.appendChild(ligne);
      });
      liste.appendChild(tableau);

      liste.appendChild(element('p', 'note-activite',
        'Ces chiffres servent à voir si l\'outil est utilisé et où la base manque de prix. ' +
        'Ils ne mesurent pas le travail de chacun : un conseiller sur un secteur à peu de ' +
        'fournisseurs relèvera mécaniquement moins.'));
      A.ajusterHauteurs();

      function barresMois(valeurs) {
        var maxi = Math.max.apply(null, valeurs) || 1;
        var e = element('span', 'barres-mois');
        valeurs.forEach(function (v) {
          var b = element('i');
          b.style.height = Math.max(2, v / maxi * 18) + 'px';
          if (!v) b.className = 'creux';
          e.appendChild(b);
        });
        return e;
      }
    });

    function moisEnClair(date) {
      var noms = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août',
                  'septembre', 'octobre', 'novembre', 'décembre'];
      var p = String(date).split('-');
      return noms[Number(p[1]) - 1] + ' ' + p[0];
    }

    function depuisQuand(date) {
      var jours = Math.round((Date.now() - new Date(String(date) + 'T00:00:00').getTime()) / 86400000);
      if (jours <= 0) return 'aujourd\'hui';
      if (jours === 1) return 'hier';
      if (jours < 31) return 'il y a ' + jours + ' jours';
      return 'il y a ' + Math.round(ageEnMois(date)) + ' mois';
    }
  }

  A.afficherOutils = afficherOutils;
  A.afficherReleves = afficherReleves;
  A.afficherARelever = afficherARelever;
  A.afficherVider = afficherVider;
  A.afficherActivite = afficherActivite;
  A.ouvrirCorrection = ouvrirCorrection;
  A.relevesSuspects = relevesSuspects;
  A.normaliserFiche = normaliser;
  A.distanceLibelle = distance;
  A.pairesProches = pairesProches;
})(window);
