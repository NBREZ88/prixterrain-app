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

    function dessiner() {
      zone.innerHTML = '';

      var bandeau = element('header', 'bandeau');
      bandeau.appendChild(element('h1', null, 'Mon compte'));
      zone.appendChild(bandeau);

      // ---- Qui est connecté sur cet appareil ----
      var carte = element('div', 'groupe');
      carte.appendChild(element('p', 'titre-bloc', compte.nom));
      carte.appendChild(element('p', 'appui', compte.courriel));
      carte.appendChild(element('p', 'appui',
        compte.role === 'administrateur' ? 'Responsable de l\'application' : 'Conseiller'));

      var etat = element('p', 'appui', 'Lecture en cours…');
      carte.appendChild(etat);
      Promise.all([A.nombreEnAttente(), A.bd.releve.count(), A.bd.produit.count()])
        .then(function (r) {
          etat.textContent = r[1] + ' relevés et ' + r[2] + ' produits connus de cet appareil. ' +
            (r[0] ? r[0] + ' saisie(s) encore à renvoyer.' : 'Tout est envoyé à l\'équipe.');
        });

      carte.appendChild(bouton('lien', 'Envoyer maintenant', function () {
        etat.textContent = 'Envoi en cours…';
        A.synchroniser().then(function (retour) {
          if (retour.etat === 'fait') { dessiner(); return; }
          etat.textContent = retour.message ||
            "Pas de réseau pour l'instant. Vos saisies sont conservées sur l'appareil.";
        });
      }));
      zone.appendChild(carte);

      // ---- Installation ----
      zone.appendChild(element('p', 'titre-section', 'Installer l\'application sur cet appareil'));
      if (dejaInstallee()) {
        zone.appendChild(element('p', 'confirmation',
          'L\'application est déjà installée sur cet appareil. Elle s\'ouvre sans réseau.'));
      } else {
        var invite = global.PrixTerrainInstallation && global.PrixTerrainInstallation.invite;
        if (invite) {
          zone.appendChild(element('p', 'manquant-suite',
            'Une fois installée, l\'application s\'ouvre par son icône, même sans réseau.'));
          var boutonInstaller = bouton('enregistrer', 'Installer PrixTerrain', function () {
            invite.prompt();
            invite.userChoice.then(function () {
              global.PrixTerrainInstallation.invite = null;
              dessiner();
            });
          });
          zone.appendChild(boutonInstaller);
        } else {
          var liste = element('ol', 'liste-releves');
          ETAPES[plateforme()].forEach(function (etape) {
            liste.appendChild(element('li', null, etape));
          });
          zone.appendChild(liste);
          zone.appendChild(element('p', 'manquant-suite',
            'Une fois installée, l\'application s\'ouvre par son icône, même sans réseau. ' +
            'Les relevés saisis hors couverture partent au retour du réseau.'));
        }
      }

      // ---- L'équipe ----
      zone.appendChild(element('p', 'titre-section', 'L\'équipe'));
      var equipe = element('div');
      equipe.appendChild(element('p', null, 'Lecture en cours…'));
      zone.appendChild(equipe);

      A.bd.profil.toArray().then(function (profils) {
        equipe.innerHTML = '';
        profils.sort(function (a, b) { return String(a.nom).localeCompare(String(b.nom), 'fr'); });

        if (compte.role !== 'administrateur') {
          profils.forEach(function (p) {
            equipe.appendChild(element('p', null, p.nom +
              (p.role === 'administrateur' ? ' — responsable' : '') +
              (p.actif === false ? ' — compte suspendu' : '')));
          });
          return;
        }

        profils.forEach(function (p) {
          var ligne = element('div', 'groupe');
          ligne.appendChild(element('p', 'titre-bloc', p.nom));
          ligne.appendChild(element('p', 'appui', p.courriel));
          ligne.appendChild(element('p', 'appui',
            (p.role === 'administrateur' ? 'Responsable' : 'Conseiller') +
            (p.actif === false ? ', compte suspendu' : '')));

          var alerte = element('p', 'alerte');
          alerte.style.display = 'none';

          if (p.id !== compte.id) {
            ligne.appendChild(bouton('lien',
              p.role === 'administrateur' ? 'Retirer le rôle de responsable' : 'En faire un responsable',
              function () {
                modifier(p, { role: p.role === 'administrateur' ? 'conseiller' : 'administrateur' }, alerte);
              }));
            ligne.appendChild(bouton('lien',
              p.actif === false ? 'Rétablir ce compte' : 'Suspendre ce compte',
              function () {
                modifier(p, { actif: p.actif === false }, alerte);
              }));
          } else {
            ligne.appendChild(element('p', 'manquant-suite',
              'Vous ne pouvez pas modifier votre propre compte, pour éviter de vous retirer l\'accès.'));
          }

          ligne.appendChild(alerte);
          equipe.appendChild(ligne);
        });

        equipe.appendChild(element('p', 'manquant-suite',
          'Un compte suspendu ne peut plus enregistrer de relevé. Pour lui retirer aussi la lecture, ' +
          'supprimez son accès depuis le tableau de bord de la base.'));
        equipe.appendChild(element('p', 'manquant-suite',
          'Pour ajouter un conseiller : créez-lui un accès depuis le tableau de bord de la base, ' +
          'puis communiquez-lui l\'adresse de l\'application. Sa fiche se crée toute seule à sa première ouverture.'));
      });

      // ---- Sortie ----
      zone.appendChild(element('p', 'titre-section', 'Quitter'));
      var attenteSortie = element('p', 'alerte');
      attenteSortie.style.display = 'none';
      zone.appendChild(attenteSortie);
      zone.appendChild(bouton('lien', 'Fermer la session sur cet appareil', function () {
        A.nombreEnAttente().then(function (n) {
          if (n > 0) {
            attenteSortie.textContent = n + ' saisie(s) ne sont pas encore parties. ' +
              'Retrouvez du réseau et touchez « Envoyer maintenant » avant de fermer la session.';
            attenteSortie.style.display = 'block';
            return;
          }
          A.base.auth.signOut().then(A.oublierCompte).then(function () {
            global.location.reload();
          });
        });
      }));
    }

    function modifier(profil, changements, alerte) {
      if (!global.navigator.onLine) {
        alerte.textContent = "L'équipe n'est pas joignable pour l'instant. Ces changements demandent du réseau.";
        alerte.style.display = 'block';
        return;
      }
      A.base.from('profil').update(changements).eq('id', profil.id)
        .then(function (reponse) {
          if (reponse.error) throw reponse.error;
          return A.bd.profil.put(Object.assign({}, profil, changements));
        })
        .then(function () { return A.synchroniser(); })
        .then(dessiner)
        .catch(function (erreur) {
          alerte.textContent = A.messageSimple(erreur);
          alerte.style.display = 'block';
        });
    }

    dessiner();
  }

  A.afficherComptes = afficherComptes;
})(window);
