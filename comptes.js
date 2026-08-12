// PrixTerrain — mon compte, l'équipe, l'installation sur l'appareil.
//
// La création d'un compte d'accès reste au responsable, depuis le tableau de
// bord de la base. Ce qui se fait ici : voir qui est connecté sur cet appareil,
// changer le rôle d'un conseiller, et installer l'application.

(function (global) {
  'use strict';

  var A = global.PrixTerrain;

  function plateforme() {
    var u = global.navigator.userAgent;
    if (/iPhone|iPad|iPod/i.test(u)) return 'ios';
    if (/Android/i.test(u)) return 'android';
    return 'ordinateur';
  }

  function dejaInstallee() {
    return global.matchMedia('(display-mode: standalone)').matches ||
           global.navigator.standalone === true;
  }

  var ETAPES = {
    ios: ['Ouvrez cette page dans Safari, pas dans un autre navigateur.',
          'Touchez le bouton de partage, le carré avec une flèche vers le haut.',
          'Faites défiler et choisissez « Sur l\'écran d\'accueil ».',
          'Touchez « Ajouter ». Une icône PrixTerrain apparaît.'],
    android: ['Touchez les trois points en haut à droite du navigateur.',
              'Choisissez « Installer l\'application » ou « Ajouter à l\'écran d\'accueil ».',
              'Confirmez. Une icône PrixTerrain apparaît.'],
    ordinateur: ['Dans la barre d\'adresse, cherchez la petite icône d\'installation, à droite.',
                 'Ou ouvrez le menu du navigateur et choisissez « Installer PrixTerrain ».',
                 'L\'application s\'ouvre alors dans sa propre fenêtre.']
  };

  function afficherComptes(zone, compte) {
    var C = A.calculs;
    var element = C.element;
    var bouton = C.bouton;
    var responsable = compte && compte.role === 'administrateur';
    var vue = 'moi';
    var equipe = [];
    var invitations = [];

    zone.innerHTML = '';
    zone.className = 'ecran-compte';

    // ---- identité, toujours visible ----
    var identite = element('div', 'identite');
    identite.appendChild(element('span', 'jeton', initiales(compte ? compte.nom : '')));
    var textes = element('span');
    var nom = element('span', 'id-nom');
    nom.appendChild(element('span', null, compte ? compte.nom : 'Compte inconnu'));
    nom.appendChild(element('span', 'role', responsable ? 'Responsable' : 'Conseiller'));
    textes.appendChild(nom);
    textes.appendChild(element('span', 'id-appui', compte ? compte.courriel : ''));
    identite.appendChild(textes);
    zone.appendChild(identite);

    var onglets = element('div', 'sel-onglets');
    zone.appendChild(onglets);
    var corps = element('div');
    zone.appendChild(corps);

    charger().then(function () {
      poserOnglets();
      poser();
    });

    function charger() {
      // Les invitations vivent en base, pas dans la copie locale : elles
      // doivent être vues par les deux responsables en même temps.
      var enAttente = global.navigator.onLine
        ? A.base.from('invitation').select('*').then(function (r) { return r.data || []; })
        : Promise.resolve([]);

      return Promise.all([A.bd.profil.toArray(), enAttente]).then(function (r) {
        equipe = r[0].sort(function (a, b) { return a.nom.localeCompare(b.nom, 'fr'); });
        invitations = (r[1] || []).sort(function (a, b) {
          return a.nom.localeCompare(b.nom, 'fr');
        });
      });
    }

    function initiales(texte) {
      return String(texte || '?').split(/\s+/).slice(0, 2)
        .map(function (m) { return m.charAt(0).toUpperCase(); }).join('');
    }

    function poserOnglets() {
      onglets.innerHTML = '';
      [['moi', 'Mon compte'], ['equipe', 'L\'équipe'], ['appareil', 'Cet appareil']]
        .forEach(function (o) {
          onglets.appendChild(bouton(vue === o[0] ? 'on' : '', o[1], function () {
            vue = o[0];
            poserOnglets();
            poser();
          }));
        });
    }

    function ligne(parent, libelle, valeur, teinte) {
      var l = element('div', 'ligne-compte');
      l.appendChild(element('span', null, libelle));
      l.appendChild(element('b', teinte || null, valeur));
      parent.appendChild(l);
      return l;
    }

    function poser() {
      corps.innerHTML = '';
      if (vue === 'moi') poserMoi();
      else if (vue === 'equipe') poserEquipe();
      else poserAppareil();
      A.ajusterHauteurs();
    }

    // ---- mon compte ----
    function poserMoi() {
      var e = element('div', 'encadre-compte');
      ligne(e, 'Nom', compte ? compte.nom : '');
      ligne(e, 'Courriel', compte ? compte.courriel : '');
      ligne(e, 'Rôle', responsable ? 'Responsable de l\'application' : 'Conseiller');
      corps.appendChild(e);

      corps.appendChild(element('p', 'titre-section', 'Mot de passe'));
      corps.appendChild(element('p', 'appui',
        'Changez-le si vous utilisez encore celui qu\'on vous a communiqué.'));
      corps.appendChild(bouton('action-compte clair', 'Changer mon mot de passe',
        ouvrirMotDePasse));

      corps.appendChild(element('p', 'titre-section', 'Sortir'));
      corps.appendChild(bouton('action-compte clair', 'Se déconnecter de cet appareil',
        function () {
          A.base.auth.signOut().then(function () {
            return A.oublierCompte();
          }).then(function () { location.reload(); });
        }));
      corps.appendChild(element('p', 'appui',
        'Les saisies déjà envoyées restent dans l\'équipe. Celles en attente seront perdues.'));
    }

    function ouvrirMotDePasse() {
      var voile = element('div', 'voile');
      var boite = element('div', 'boite');

      var tete = element('div', 'boite-tete');
      var t = element('div');
      t.appendChild(element('p', 'boite-titre', 'Changer mon mot de passe'));
      t.appendChild(element('p', 'boite-sous', compte ? compte.courriel : ''));
      tete.appendChild(t);
      tete.appendChild(bouton('boite-fermer', '✕', function () { voile.remove(); }));
      boite.appendChild(tete);

      var dedans = element('div', 'boite-corps');
      var champs = [];
      ['Nouveau mot de passe', 'Le retaper'].forEach(function (libelle) {
        var champ = element('div', 'champ-fenetre');
        champ.appendChild(element('span', 'lab', libelle));
        var i = element('input', 'ch');
        i.type = 'password';
        champ.appendChild(i);
        dedans.appendChild(champ);
        champs.push(i);
      });
      dedans.appendChild(element('p', 'note',
        'Huit caractères au minimum. Vous resterez connecté sur cet appareil.'));
      var message = element('p', 'alerte');
      message.style.display = 'none';
      dedans.appendChild(message);
      boite.appendChild(dedans);

      var pied = element('div', 'boite-pied');
      pied.appendChild(bouton('principal pleine', 'Enregistrer', function () {
        var a = champs[0].value, b = champs[1].value;
        if (a.length < 8) return dire('Huit caractères au minimum.');
        if (a !== b) return dire('Les deux saisies ne concordent pas.');
        if (!global.navigator.onLine) return dire('Sans réseau, le mot de passe ne peut pas être changé.');
        message.textContent = 'Enregistrement…';
        message.style.display = 'block';
        A.base.auth.updateUser({ password: a }).then(function (reponse) {
          if (reponse.error) return dire(A.messageSimple(reponse.error));
          voile.remove();
        });
      }));
      pied.appendChild(bouton('bouton-neutre', 'Revenir', function () { voile.remove(); }));
      boite.appendChild(pied);

      function dire(texte) {
        message.textContent = texte;
        message.style.display = 'block';
      }

      voile.appendChild(boite);
      voile.addEventListener('click', function (e) { if (e.target === voile) voile.remove(); });
      document.body.appendChild(voile);
    }

    // ---- l'équipe ----
    function poserEquipe() {
      if (responsable) {
        corps.appendChild(bouton('action-compte', '+ Inviter un conseiller', ouvrirInvitation));
      }
      if (!equipe.length) {
        corps.appendChild(element('p', 'vide', 'Aucun conseiller enregistré.'));
        return;
      }
      if (!responsable) {
        corps.appendChild(element('p', 'appui',
          equipe.length + ' conseillers utilisent PrixTerrain. ' +
          'Seul un responsable peut modifier les comptes.'));
      }

      var e = element('div', 'encadre-compte');
      equipe.forEach(function (m) {
        var gele = m.actif === false;
        var l = element('div', 'membre' + (gele ? ' suspendu' : ''));
        l.appendChild(element('span', 'm-jeton', initiales(m.nom)));

        var textes = element('span', 'm-textes');
        var nomMembre = element('span', 'm-nom');
        nomMembre.appendChild(element('span', null, m.nom));
        if (gele) nomMembre.appendChild(element('span', 'etat-membre gele', 'suspendu'));
        textes.appendChild(nomMembre);
        textes.appendChild(element('span', 'm-appui',
          (m.role === 'administrateur' ? 'Responsable' : 'Conseiller') + ' · ' + m.courriel));
        l.appendChild(textes);

        if (responsable) {
          var actions = element('span', 'm-actions');
          if (compte && m.id === compte.id) {
            actions.appendChild(element('span', 'm-appui', 'vous'));
          } else if (gele) {
            actions.appendChild(bouton('mini-bouton clair', 'Réactiver', function () {
              modifier(m, { actif: true });
            }));
          } else {
            if (m.role !== 'administrateur') {
              actions.appendChild(bouton('mini-bouton clair', 'En faire un responsable',
                function () { modifier(m, { role: 'administrateur' }); }));
            }
            actions.appendChild(bouton('mini-bouton clair rouge', 'Suspendre', function () {
              modifier(m, { actif: false });
            }));
          }
          l.appendChild(actions);
        }
        e.appendChild(l);
      });

      // Invitations envoyées, pas encore acceptées.
      invitations.forEach(function (inv) {
        var l = element('div', 'membre invite');
        l.appendChild(element('span', 'm-jeton', initiales(inv.nom)));

        var textes = element('span', 'm-textes');
        var nomInvite = element('span', 'm-nom');
        nomInvite.appendChild(element('span', null, inv.nom));
        nomInvite.appendChild(element('span', 'etat-membre invite', 'invité'));
        textes.appendChild(nomInvite);
        textes.appendChild(element('span', 'm-appui',
          (inv.role === 'administrateur' ? 'Responsable' : 'Conseiller') + ' · ' + inv.courriel));
        l.appendChild(textes);

        if (responsable) {
          var actions = element('span', 'm-actions');
          actions.appendChild(bouton('mini-bouton clair', 'Renvoyer l\'invitation', function () {
            envoyerInvitation(inv.nom, inv.courriel, inv.role, null);
          }));
          actions.appendChild(bouton('mini-bouton clair rouge', 'Annuler', function () {
            A.base.from('invitation').delete().eq('courriel', inv.courriel)
              .then(function () { return charger(); })
              .then(poser);
          }));
          l.appendChild(actions);
        }
        e.appendChild(l);
      });

      corps.appendChild(e);

      if (responsable) {
        corps.appendChild(element('p', 'appui',
          'Un compte suspendu ne peut plus se connecter. Ses relevés restent en place. ' +
          'Un conseiller invité reçoit un courriel avec un lien pour choisir son mot de passe.'));
      }
    }

    // -----------------------------------------------------------------------
    // Inviter un conseiller
    //
    // L'invitation passe par une fonction hébergée : elle exige la clé
    // d'administration de la base, qui ne peut pas vivre dans une page web.
    // -----------------------------------------------------------------------
    function ouvrirInvitation() {
      var voile = element('div', 'voile');
      var boite = element('div', 'boite');

      var tete = element('div', 'boite-tete');
      var t = element('div');
      t.appendChild(element('p', 'boite-titre', 'Inviter un conseiller'));
      t.appendChild(element('p', 'boite-sous',
        'Il recevra un courriel pour choisir son mot de passe'));
      tete.appendChild(t);
      tete.appendChild(bouton('boite-fermer', '✕', function () { voile.remove(); }));
      boite.appendChild(tete);

      var dedans = element('div', 'boite-corps');
      var champs = {};
      [['nom', 'Nom et prénom', 'text', 'Marie Dupont'],
       ['courriel', 'Courriel professionnel', 'email', 'prenom.nom@meuse.chambagri.fr']
      ].forEach(function (c) {
        var champ = element('div', 'champ-fenetre');
        champ.appendChild(element('span', 'lab', c[1]));
        var i = element('input', 'ch');
        i.type = c[2];
        i.placeholder = c[3];
        champ.appendChild(i);
        dedans.appendChild(champ);
        champs[c[0]] = i;
      });

      var champRole = element('div', 'champ-fenetre');
      champRole.appendChild(element('span', 'lab', 'Rôle'));
      var choixRole = element('select', 'ch');
      choixRole.appendChild(new Option('Conseiller', 'conseiller'));
      choixRole.appendChild(new Option('Responsable', 'administrateur'));
      champRole.appendChild(choixRole);
      dedans.appendChild(champRole);

      dedans.appendChild(element('p', 'note',
        'Un conseiller saisit des prix et consulte tout. Un responsable peut en plus ' +
        'modifier les réglages, réunir les fiches et gérer l\'équipe.'));

      var message = element('p', 'alerte');
      message.style.display = 'none';
      dedans.appendChild(message);
      boite.appendChild(dedans);

      var pied = element('div', 'boite-pied');
      var envoyer = bouton('principal pleine', 'Envoyer l\'invitation', function () {
        var nom = champs.nom.value.trim();
        var courriel = champs.courriel.value.trim();

        if (nom.length < 2) return dire('Indiquez le nom et le prénom du conseiller.');
        if (courriel.indexOf('@') < 1) return dire('Le courriel ne semble pas valide.');
        if (!global.navigator.onLine) {
          return dire('Sans réseau, l\'invitation ne peut pas être envoyée.');
        }

        envoyer.disabled = true;
        dire('Envoi en cours…');
        envoyerInvitation(nom, courriel, choixRole.value, function (erreur) {
          envoyer.disabled = false;
          if (erreur) return dire(erreur);
          voile.remove();
        });
      });
      pied.appendChild(envoyer);
      pied.appendChild(bouton('bouton-neutre', 'Revenir', function () { voile.remove(); }));
      boite.appendChild(pied);

      function dire(texte) {
        message.textContent = texte;
        message.style.display = 'block';
      }

      voile.appendChild(boite);
      voile.addEventListener('click', function (e) { if (e.target === voile) voile.remove(); });
      document.body.appendChild(voile);
      champs.nom.focus();
    }

    function envoyerInvitation(nom, courriel, role, apres) {
      A.base.functions.invoke('inviter-conseiller', {
        body: { nom: nom, courriel: courriel, role: role }
      }).then(function (reponse) {
        if (reponse.data && reponse.data.erreur) {
          if (apres) apres(reponse.data.erreur);
          return;
        }
        if (reponse.error) return direErreurFonction(reponse.error, apres);

        return charger().then(function () {
          poser();
          if (apres) apres(null);
        });
      }).catch(function (e) {
        return direErreurFonction(e, apres);
      });
    }

    // La fonction hébergée renvoie son motif dans le corps de la réponse, pas
    // dans l'objet d'erreur : sans le lire, on n'afficherait qu'« erreur ».
    function direErreurFonction(erreur, apres) {
      var reponse = erreur && erreur.context;

      if (reponse && typeof reponse.json === 'function') {
        return reponse.json().then(function (corps) {
          if (apres) apres(corps && corps.erreur ? corps.erreur : motif(reponse.status));
        }).catch(function () {
          if (apres) apres(motif(reponse.status));
        });
      }
      if (apres) apres(erreur && erreur.message ? erreur.message : 'Envoi impossible.');
    }

    function motif(code) {
      if (code === 401) return 'Session expirée. Reconnectez-vous.';
      if (code === 403) return 'Seul un responsable peut inviter un conseiller.';
      if (code === 404) {
        return 'La fonction « inviter-conseiller » est introuvable sur le serveur.';
      }
      return 'Le serveur a refusé l\'invitation (code ' + code + ').';
    }

    function modifier(membre, changements) {
      A.base.from('profil').update(changements).eq('id', membre.id)
        .then(function (reponse) {
          if (reponse.error) throw reponse.error;
          return A.bd.profil.update(membre.id, changements);
        })
        .then(function () { return A.bd.profil.toArray(); })
        .then(function (r) {
          equipe = r.sort(function (a, b) { return a.nom.localeCompare(b.nom, 'fr'); });
          poser();
        })
        .catch(function (e) {
          corps.appendChild(element('p', 'alerte', A.messageSimple(e)));
        });
    }

    // ---- cet appareil ----
    function poserAppareil() {
      var e = element('div', 'encadre-compte');
      var attente = element('b', null, 'lecture…');
      var l = element('div', 'ligne-compte');
      l.appendChild(element('span', null, 'Saisies en attente d\'envoi'));
      l.appendChild(attente);
      e.appendChild(l);
      ligne(e, 'Réseau', global.navigator.onLine ? 'disponible' : 'absent',
        global.navigator.onLine ? null : 'en-retard');
      ligne(e, 'Installation', dejaInstallee() ? 'installée sur cet appareil' : 'ouverte dans le navigateur');
      corps.appendChild(e);

      var envoi = element('div');
      corps.appendChild(envoi);

      A.nombreEnAttente().then(function (n) {
        attente.textContent = n ? n + (n > 1 ? ' relevés' : ' relevé') : 'aucune';
        if (n) {
          attente.className = 'en-retard';
          envoi.appendChild(bouton('action-compte', 'Envoyer maintenant', function () {
            A.synchroniser().then(function () { poser(); });
          }));
        }
      });

      corps.appendChild(element('p', 'titre-section', 'Installer sur un autre appareil'));
      var aide = element('div', 'aide-installation');
      var choisie = plateforme();
      [['ios', 'iPhone'], ['android', 'Android'], ['ordinateur', 'Ordinateur']]
        .forEach(function (p) {
          var bloc = element('p', 'ligne-aide' + (p[0] === choisie ? ' vôtre' : ''));
          bloc.appendChild(element('b', null, p[1] + ' : '));
          bloc.appendChild(element('span', null, ETAPES[p[0]].join(' ')));
          aide.appendChild(bloc);
        });
      corps.appendChild(aide);

      corps.appendChild(element('p', 'titre-section', 'Repartir à neuf'));
      corps.appendChild(bouton('action-compte clair', 'Vider les données de cet appareil',
        function () { A.naviguer('vider'); }));
      corps.appendChild(element('p', 'appui',
        'Efface la copie locale et la reprend depuis l\'équipe. ' +
        'À utiliser si quelque chose se coince.'));
    }
  }

  A.afficherComptes = afficherComptes;
})(window);
