// PrixTerrain — stockage sur l'appareil et file d'envoi vers la base d'équipe.
// Règle tenue de bout en bout : l'enregistrement d'une saisie ne dépend jamais
// d'une réponse de l'équipe. On écrit sur l'appareil, on marque « à envoyer »,
// on tente ensuite, et on retente tant que ce n'est pas parti.

(function (global) {
  'use strict';

  var bd = new Dexie('prixterrain');

  bd.version(1).stores({
    releve:             'id, etat, saisi_le, date_prix, produit_id, fournisseur_id, agriculteur_id, releve_annule_id',
    agriculteur:        'id, etat, nom_normalise',
    fournisseur:        'id, etat, nom_normalise',
    produit:            'id, etat, nom_normalise, famille_code',
    facteur_conversion: 'id, etat, produit_id',
    unite_prix:         'code, ordre',
    famille_produit:    'code, ordre',
    reglage:            'cle_complete, ordre',
    profil:             'id, courriel',
    memo:               'nom'
  });

  // Ordre d'envoi : une fiche part avant le relevé qui la cite, et un relevé de
  // prix avant l'annulation qui le vise. La base refuse l'inverse.
  var TABLES_FILE = ['fournisseur', 'produit', 'facteur_conversion', 'releve'];

  // Référentiels rechargés en entier à chaque échange : ils sont courts et
  // doivent rester disponibles hors réseau.
  // agriculteur reste rapatrié : les relevés antérieurs au retrait de
  // l'agriculteur le citent encore, et leur affichage doit rester lisible.
  var REFERENTIELS = ['famille_produit', 'unite_prix', 'reglage', 'profil',
                      'agriculteur', 'fournisseur', 'produit', 'facteur_conversion'];

  // Colonnes réellement transmises. Les colonnes calculées par la base
  // et l'état local ne sont jamais envoyés.
  var CHAMPS_ENVOI = {
    agriculteur:        ['id', 'nom', 'commune', 'conseiller_id', 'cree_par', 'appareil_emetteur', 'cree_le'],
    fournisseur:        ['id', 'nom', 'cree_par', 'appareil_emetteur', 'cree_le'],
    produit:            ['id', 'nom', 'famille_code', 'segment', 'unite_code', 'origine', 'cree_par', 'appareil_emetteur', 'cree_le'],
    facteur_conversion: ['id', 'produit_id', 'unite_source', 'unite_cible', 'facteur', 'saisi_par', 'appareil_emetteur', 'saisi_le'],
    releve:             ['id', 'type', 'date_prix', 'fournisseur_id', 'produit_id',
                         'prix_unitaire_ht', 'unite_code', 'commentaire', 'releve_annule_id',
                         'saisi_par', 'appareil_emetteur', 'saisi_le']
  };

  var CLE_TABLE = {
    releve: 'id', agriculteur: 'id', fournisseur: 'id', produit: 'id', facteur_conversion: 'id',
    unite_prix: 'code', famille_produit: 'code', reglage: 'cle_complete', profil: 'id'
  };

  // Même règle que la fonction normaliser_libelle de la base d'équipe :
  // accents retirés, majuscules, tout signe autre qu'une lettre ou un chiffre
  // remplacé par une espace.
  function normaliserLibelle(v) {
    return (v == null ? '' : String(v))
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, ' ')
      .trim();
  }

  function nouvelIdentifiant() {
    if (global.crypto && global.crypto.randomUUID) return global.crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      var v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  // -------------------------------------------------------------------------
  // Base d'équipe
  // -------------------------------------------------------------------------
  var reglages = global.CONFIGURATION || {};
  var configurationComplete = Boolean(reglages.adresse && reglages.clePublique);

  var base = configurationComplete
    ? global.supabase.createClient(reglages.adresse, reglages.clePublique, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
      })
    : null;

  // Traduction des refus de la base en phrases lisibles par un conseiller.
  function messageSimple(erreur) {
    var texte = String((erreur && erreur.message) || erreur || '');
    if (texte.indexOf('Invalid login') >= 0 || texte.indexOf('Email not confirmed') >= 0)
      return "Cette adresse ou ce mot de passe ne correspond à aucun compte de l'équipe.";
    if (!global.navigator.onLine)
      return "Pas de réseau pour l'instant. Vos saisies sont conservées sur l'appareil.";
    if (texte.indexOf('JWT') >= 0 || texte.indexOf('401') >= 0 || texte.indexOf('Invalid API key') >= 0)
      return 'Votre connexion a expiré. Entrez de nouveau votre adresse et votre mot de passe.';
    if (texte.indexOf('row-level security') >= 0)
      return "Votre compte n'a pas le droit d'enregistrer cet élément.";
    if (texte.indexOf('Failed to fetch') >= 0 || texte.indexOf('NetworkError') >= 0)
      return "L'équipe n'est pas joignable pour l'instant. Vos saisies sont conservées sur l'appareil.";
    if (texte.indexOf('déjà annulé') >= 0 || texte.indexOf('ne se modifie pas') >= 0) return texte;
    return "L'envoi n'a pas abouti. Vos saisies sont conservées et seront renvoyées.";
  }

  // -------------------------------------------------------------------------
  // Mémo : identifiant de l'appareil, compte en cours, date du dernier échange
  // -------------------------------------------------------------------------
  function lireMemo(nom) {
    return bd.memo.get(nom).then(function (l) { return l ? l.valeur : null; });
  }

  function ecrireMemo(nom, valeur) {
    return bd.memo.put({ nom: nom, valeur: valeur });
  }

  function identifiantAppareil() {
    return lireMemo('appareil').then(function (id) {
      if (id) return id;
      var neuf = nouvelIdentifiant();
      return ecrireMemo('appareil', neuf).then(function () { return neuf; });
    });
  }

  function memoriserCompte(profil) {
    return ecrireMemo('compte', {
      id: profil.id, nom: profil.nom, courriel: profil.courriel, role: profil.role
    });
  }

  function compteLocal() { return lireMemo('compte'); }
  function oublierCompte() { return bd.memo.delete('compte'); }

  // -------------------------------------------------------------------------
  // Écriture et lecture des lignes
  // -------------------------------------------------------------------------
  function ecrireLigneLocale(table, ligne) {
    var copie = Object.assign({}, ligne, { etat: 'a_envoyer' });
    return bd.table(table).put(copie).then(function () { return ligne; });
  }

  function ecrireLignesRecues(table, lignes) {
    if (!lignes.length) return Promise.resolve();
    return bd.table(table).bulkPut(lignes.map(function (l) {
      return Object.assign({}, l, { etat: 'envoye' });
    }));
  }

  function lignesAEnvoyer(table) {
    return bd.table(table).where('etat').equals('a_envoyer').toArray().then(function (lignes) {
      if (table !== 'releve') {
        return lignes.sort(function (a, b) {
          return String(a.cree_le || a.saisi_le).localeCompare(String(b.cree_le || b.saisi_le));
        });
      }
      return lignes.sort(function (a, b) {
        var rangA = a.type === 'annulation' ? 1 : 0;
        var rangB = b.type === 'annulation' ? 1 : 0;
        if (rangA !== rangB) return rangA - rangB;
        return String(a.saisi_le).localeCompare(String(b.saisi_le));
      });
    });
  }

  function marquerEnvoye(table, identifiants) {
    return bd.transaction('rw', bd.table(table), function () {
      return Promise.all(identifiants.map(function (id) {
        return bd.table(table).get(id).then(function (ligne) {
          if (ligne) return bd.table(table).put(Object.assign({}, ligne, { etat: 'envoye' }));
        });
      }));
    });
  }

  function nombreEnAttente() {
    return Promise.all(TABLES_FILE.map(function (table) {
      return bd.table(table).where('etat').equals('a_envoyer').count();
    })).then(function (comptes) {
      return comptes.reduce(function (t, n) { return t + n; }, 0);
    });
  }

  // Relevés retenus pour les calculs : de type prix et non annulés.
  function relevesRetenus() {
    return bd.releve.toArray().then(function (tous) {
      var annules = {};
      tous.forEach(function (r) {
        if (r.type === 'annulation') annules[r.releve_annule_id] = true;
      });
      return tous.filter(function (r) { return r.type === 'prix' && !annules[r.id]; });
    });
  }

  // -------------------------------------------------------------------------
  // Envoi et rapatriement
  // -------------------------------------------------------------------------
  function reduireAuxChampsEnvoyes(table, lignes) {
    var champs = CHAMPS_ENVOI[table];
    return lignes.map(function (ligne) {
      var reduite = {};
      champs.forEach(function (champ) {
        if (ligne[champ] !== undefined) reduite[champ] = ligne[champ];
      });
      return reduite;
    });
  }

  function envoyerLignes(table, lignes) {
    if (!base) return Promise.reject(new Error("L'adresse de la base d'équipe n'est pas renseignée."));
    if (!lignes.length) return Promise.resolve([]);
    var paquets = [];
    for (var i = 0; i < lignes.length; i += 100) paquets.push(lignes.slice(i, i + 100));
    var envoyees = [];
    return paquets.reduce(function (chaine, paquet) {
      return chaine.then(function () {
        return base.from(table)
          .upsert(reduireAuxChampsEnvoyes(table, paquet), { onConflict: CLE_TABLE[table], ignoreDuplicates: true })
          .then(function (reponse) {
            if (reponse.error) throw reponse.error;
            paquet.forEach(function (ligne) { envoyees.push(ligne[CLE_TABLE[table]]); });
          });
      });
    }, Promise.resolve()).then(function () { return envoyees; });
  }

  function telechargerTout(table, filtre) {
    var lignes = [];
    function page(debut) {
      var requete = base.from(table).select('*').range(debut, debut + 999);
      if (filtre) requete = filtre(requete);
      return requete.then(function (reponse) {
        if (reponse.error) throw reponse.error;
        lignes = lignes.concat(reponse.data);
        if (reponse.data.length < 1000) return lignes;
        return page(debut + 1000);
      });
    }
    return page(0);
  }

  // -------------------------------------------------------------------------
  // Enregistrement des saisies
  // -------------------------------------------------------------------------
  var auditeurs = [];
  var envoiEnCours = false;
  var minuterie = null;

  function surChangementFileAttente(auditeur) {
    auditeurs.push(auditeur);
    return function () {
      auditeurs = auditeurs.filter(function (a) { return a !== auditeur; });
    };
  }

  function prevenir() {
    return nombreEnAttente().then(function (attente) {
      auditeurs.forEach(function (a) { a(attente); });
    });
  }

  function contexteSaisie() {
    return Promise.all([compteLocal(), identifiantAppareil()]).then(function (r) {
      if (!r[0]) throw new Error('Aucun compte ouvert sur cet appareil.');
      return { compte: r[0], appareil: r[1] };
    });
  }

  function enregistrerReleve(saisie) {
    return contexteSaisie().then(function (ctx) {
      var ligne = {
        id: nouvelIdentifiant(),
        type: 'prix',
        date_prix: saisie.date_prix,
        fournisseur_id: saisie.fournisseur_id,
        produit_id: saisie.produit_id,
        prix_unitaire_ht: saisie.prix_unitaire_ht,
        unite_code: saisie.unite_code,
        commentaire: saisie.commentaire || null,
        releve_annule_id: null,
        saisi_par: ctx.compte.id,
        appareil_emetteur: ctx.appareil,
        saisi_le: new Date().toISOString()
      };
      return ecrireLigneLocale('releve', ligne)
        .then(prevenir).then(function () { synchroniser(); return ligne; });
    });
  }

  function enregistrerAnnulation(releveId, motif) {
    return contexteSaisie().then(function (ctx) {
      var ligne = {
        id: nouvelIdentifiant(),
        type: 'annulation',
        date_prix: null, fournisseur_id: null, produit_id: null,
        prix_unitaire_ht: null, unite_code: null,
        commentaire: motif || null,
        releve_annule_id: releveId,
        saisi_par: ctx.compte.id,
        appareil_emetteur: ctx.appareil,
        saisi_le: new Date().toISOString()
      };
      return ecrireLigneLocale('releve', ligne)
        .then(prevenir).then(function () { synchroniser(); return ligne; });
    });
  }

  function enregistrerFiche(table, donnees) {
    return contexteSaisie().then(function (ctx) {
      var ligne = Object.assign({}, donnees, {
        id: nouvelIdentifiant(),
        nom_normalise: normaliserLibelle(donnees.nom),
        cree_par: ctx.compte.id,
        appareil_emetteur: ctx.appareil,
        cree_le: new Date().toISOString()
      });
      if (table === 'produit') ligne.origine = 'saisie';
      return ecrireLigneLocale(table, ligne)
        .then(prevenir).then(function () { synchroniser(); return ligne; });
    });
  }

  function enregistrerFacteurConversion(donnees) {
    return contexteSaisie().then(function (ctx) {
      var ligne = Object.assign({}, donnees, {
        id: nouvelIdentifiant(),
        saisi_par: ctx.compte.id,
        appareil_emetteur: ctx.appareil,
        saisi_le: new Date().toISOString()
      });
      return ecrireLigneLocale('facteur_conversion', ligne)
        .then(prevenir).then(function () { synchroniser(); return ligne; });
    });
  }

  // -------------------------------------------------------------------------
  // File d'envoi puis rapatriement
  // -------------------------------------------------------------------------
  function synchroniser() {
    if (envoiEnCours || !configurationComplete || !global.navigator.onLine) {
      return Promise.resolve({ etat: 'reporte' });
    }
    return base.auth.getSession().then(function (session) {
      if (!session.data || !session.data.session) return { etat: 'reporte' };
      envoiEnCours = true;

      var chaine = TABLES_FILE.reduce(function (suite, table) {
        return suite.then(function () {
          return lignesAEnvoyer(table).then(function (lignes) {
            if (!lignes.length) return null;
            return envoyerLignes(table, lignes)
              .then(function (envoyees) { return marquerEnvoye(table, envoyees); })
              .then(prevenir);
          });
        });
      }, Promise.resolve());

      chaine = REFERENTIELS.reduce(function (suite, table) {
        return suite.then(function () {
          return telechargerTout(table).then(function (lignes) {
            var preparees = table === 'reglage'
              ? lignes.map(function (l) {
                  return Object.assign({}, l, { cle_complete: l.cle + '|' + (l.famille_code || '') });
                })
              : lignes;
            return ecrireLignesRecues(table, preparees);
          });
        });
      }, chaine);

      return chaine
        .then(function () { return lireMemo('echange:releve'); })
        .then(function (depuis) {
          return telechargerTout('releve', function (requete) {
            var r = requete.order('recu_le', { ascending: true });
            return depuis ? r.gt('recu_le', depuis) : r;
          });
        })
        .then(function (releves) {
          return ecrireLignesRecues('releve', releves).then(function () {
            if (releves.length) return ecrireMemo('echange:releve', releves[releves.length - 1].recu_le);
          });
        })
        .then(prevenir)
        .then(function () { envoiEnCours = false; return { etat: 'fait' }; })
        .catch(function (erreur) {
          envoiEnCours = false;
          return { etat: 'reporte', message: messageSimple(erreur) };
        });
    });
  }

  // Reprise automatique : au retour du réseau, au retour sur l'application,
  // et toutes les minutes tant qu'il reste des saisies à envoyer.
  function demarrerSynchronisation() {
    if (minuterie) return;
    global.addEventListener('online', function () { synchroniser(); });
    global.document.addEventListener('visibilitychange', function () {
      if (global.document.visibilityState === 'visible') synchroniser();
    });
    minuterie = global.setInterval(function () {
      nombreEnAttente().then(function (n) { if (n > 0) synchroniser(); });
    }, 60000);
    synchroniser();
  }

  global.PrixTerrain = {
    bd: bd,
    base: base,
    configurationComplete: configurationComplete,
    normaliserLibelle: normaliserLibelle,
    nouvelIdentifiant: nouvelIdentifiant,
    messageSimple: messageSimple,
    identifiantAppareil: identifiantAppareil,
    memoriserCompte: memoriserCompte,
    compteLocal: compteLocal,
    oublierCompte: oublierCompte,
    nombreEnAttente: nombreEnAttente,
    relevesRetenus: relevesRetenus,
    surChangementFileAttente: surChangementFileAttente,
    enregistrerReleve: enregistrerReleve,
    enregistrerAnnulation: enregistrerAnnulation,
    enregistrerFiche: enregistrerFiche,
    enregistrerFacteurConversion: enregistrerFacteurConversion,
    synchroniser: synchroniser,
    demarrerSynchronisation: demarrerSynchronisation
  };
})(window);
