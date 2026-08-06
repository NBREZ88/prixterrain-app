// PrixTerrain — écran Réglages.
//
// Les neuf lignes de réglage vivent en base. Cet écran les lit et les écrit,
// il n'en invente aucune et n'en calcule aucune. Les bornes acceptées viennent
// des colonnes valeur_min et valeur_max de la table.

(function (global) {
  'use strict';

  var A = global.PrixTerrain;

  var AIDES = {
    decote_mensuelle: 'Par exemple 0,05 : un relevé perd 5 % de son poids par mois d\'ancienneté. ' +
                      'Laissez vide pour que tous les relevés pèsent pareil.',
    ecart_atypique: 'Par exemple 30 : un relevé qui s\'écarte de plus de 30 % du prix médian est signalé.'
  };

  function afficherReglages(zone, compte) {
    var C = A.calculs;
    var element = C.element;
    var bouton = C.bouton;

    function dessiner() {
      zone.innerHTML = '';

      var bandeau = element('header', 'bandeau');
      bandeau.appendChild(element('h1', null, 'Réglages'));
      zone.appendChild(bandeau);

      zone.appendChild(element('p', 'appui',
        'Ces valeurs commandent le calcul des prix moyens affichés dans les écrans Prix et Qui. ' +
        'Une valeur laissée vide n\'empêche rien : la conduite tenue à défaut est indiquée sous chaque ligne.'));

      var liste = element('div');
      liste.appendChild(element('p', null, 'Lecture des réglages…'));
      zone.appendChild(liste);

      A.bd.reglage.toArray().then(function (lignes) {
        lignes.sort(function (a, b) { return (a.ordre || 0) - (b.ordre || 0); });
        liste.innerHTML = '';

        var champs = [];
        var familleCourante = '@';
        lignes.forEach(function (ligne) {
          var famille = ligne.famille_code || '';
          if (famille !== familleCourante) {
            familleCourante = famille;
            liste.appendChild(element('p', 'titre-section',
              famille ? libelleFamille(famille) : 'Valables pour toutes les familles'));
          }
          var carte = carteReglage(ligne, champs);
          liste.appendChild(carte);
        });

        liste.appendChild(blocEnregistrement(champs));
        liste.appendChild(blocJournal());
      });
    }

    var libellesFamille = {};
    function libelleFamille(code) {
      return libellesFamille[code] || code;
    }

    function decimales(ligne) {
      return ligne.cle === 'decote_mensuelle' ? 2 : 0;
    }

    function carteReglage(ligne, champs) {
      var carte = element('div', 'groupe');
      carte.appendChild(element('p', 'titre-bloc', ligne.libelle));

      var renseigne = ligne.valeur !== null && ligne.valeur !== undefined;
      var etat = element('p', renseigne ? 'valeur-moyenne' : 'valeur-absente');
      etat.textContent = renseigne
        ? C.nombreFrancais(ligne.valeur, decimales(ligne)) + ' ' + ligne.unite_reglage
        : 'Non renseigné';
      carte.appendChild(etat);

      if (!renseigne) carte.appendChild(element('p', 'manquant-suite', ligne.conduite_si_vide));
      if (AIDES[ligne.cle]) carte.appendChild(element('p', 'manquant-suite', AIDES[ligne.cle]));
      if (ligne.valeur_min !== null && ligne.valeur_max !== null) {
        carte.appendChild(element('p', 'manquant-suite',
          'Valeur acceptée entre ' + C.nombreFrancais(ligne.valeur_min, decimales(ligne)) +
          ' et ' + C.nombreFrancais(ligne.valeur_max, decimales(ligne)) +
          ', ou vide pour ne rien imposer.'));
      }

      var saisie = element('input', 'saisie');
      saisie.type = 'text';
      saisie.inputMode = 'decimal';
      saisie.placeholder = 'à renseigner';
      if (renseigne) saisie.value = C.nombreFrancais(ligne.valeur, decimales(ligne));
      carte.appendChild(saisie);

      var alerte = element('p', 'alerte');
      alerte.style.display = 'none';
      carte.appendChild(alerte);

      champs.push({ ligne: ligne, saisie: saisie, alerte: alerte });
      return carte;
    }

    // Contrôle de toutes les lignes avant la moindre écriture : rien ne part
    // tant qu'une valeur est refusée, pour ne pas laisser un écran à moitié
    // enregistré.
    function verifier(champs) {
      var retenus = [];
      var refus = 0;

      champs.forEach(function (champ) {
        champ.alerte.style.display = 'none';
        var ligne = champ.ligne;
        var brut = champ.saisie.value.trim().replace(',', '.');
        var valeur = brut === '' ? null : Number(brut);

        if (brut !== '' && !isFinite(valeur)) {
          champ.alerte.textContent = 'Cette valeur n\'est pas un nombre.';
          champ.alerte.style.display = 'block';
          refus++;
          return;
        }
        if (valeur !== null && ligne.valeur_min !== null && valeur < ligne.valeur_min) {
          champ.alerte.textContent = 'Valeur trop basse : le minimum est ' +
            C.nombreFrancais(ligne.valeur_min, decimales(ligne)) + '.';
          champ.alerte.style.display = 'block';
          refus++;
          return;
        }
        if (valeur !== null && ligne.valeur_max !== null && valeur > ligne.valeur_max) {
          champ.alerte.textContent = 'Valeur trop haute : le maximum est ' +
            C.nombreFrancais(ligne.valeur_max, decimales(ligne)) + '.';
          champ.alerte.style.display = 'block';
          refus++;
          return;
        }

        var actuelle = (ligne.valeur === null || ligne.valeur === undefined) ? null : Number(ligne.valeur);
        if (valeur !== actuelle) retenus.push({ ligne: ligne, valeur: valeur });
      });

      return { refus: refus, retenus: retenus };
    }

    function blocEnregistrement(champs) {
      var bloc = element('div', 'pied-reglages');
      var message = element('p', 'confirmation');
      message.style.display = 'none';
      var alerte = element('p', 'alerte');
      alerte.style.display = 'none';

      bloc.appendChild(message);
      bloc.appendChild(alerte);
      bloc.appendChild(bouton('enregistrer', 'Enregistrer les réglages', function () {
        var bouton = this;
        message.style.display = 'none';
        alerte.style.display = 'none';

        var controle = verifier(champs);
        if (controle.refus) {
          alerte.textContent = controle.refus > 1
            ? controle.refus + ' valeurs sont refusées. Rien n\'a été enregistré.'
            : 'Une valeur est refusée. Rien n\'a été enregistré.';
          alerte.style.display = 'block';
          return;
        }
        if (!controle.retenus.length) {
          message.textContent = 'Aucun changement à enregistrer.';
          message.style.display = 'block';
          return;
        }
        if (!global.navigator.onLine) {
          alerte.textContent = "L'équipe n'est pas joignable pour l'instant. Les réglages se modifient avec du réseau.";
          alerte.style.display = 'block';
          return;
        }

        bouton.disabled = true;
        bouton.textContent = 'Un instant…';

        controle.retenus.reduce(function (chaine, item) {
          return chaine.then(function () { return ecrire(item.ligne, item.valeur); });
        }, Promise.resolve())
          .then(function () { return A.synchroniser(); })
          .then(function () {
            dessiner();
            zone.scrollIntoView({ block: 'start' });
          })
          .catch(function (erreur) {
            bouton.disabled = false;
            bouton.textContent = 'Enregistrer les réglages';
            alerte.textContent = A.messageSimple(erreur);
            alerte.style.display = 'block';
          });
      }));
      return bloc;
    }

    // L'écriture passe par la base d'équipe : un réglage engage les dix
    // conseillers, il ne se met pas en file d'attente sur un seul appareil.
    function ecrire(ligne, valeur) {
      var requete = A.base.from('reglage').update({ valeur: valeur }).eq('cle', ligne.cle);
      requete = ligne.famille_code
        ? requete.eq('famille_code', ligne.famille_code)
        : requete.is('famille_code', null);

      return requete.then(function (reponse) {
        if (reponse.error) throw reponse.error;
        return A.bd.reglage.put(Object.assign({}, ligne, { valeur: valeur }));
      });
    }

    // -----------------------------------------------------------------------
    // Journal des changements
    // -----------------------------------------------------------------------
    function blocJournal() {
      var bloc = element('div');
      bloc.appendChild(bouton('lien', 'Voir qui a changé quoi', function () {
        bloc.innerHTML = '';
        bloc.appendChild(element('p', 'titre-section', 'Derniers changements'));
        var corps = element('div');
        corps.appendChild(element('p', null, 'Lecture en cours…'));
        bloc.appendChild(corps);

        if (!global.navigator.onLine) {
          corps.innerHTML = '';
          corps.appendChild(element('p', 'alerte',
            "L'équipe n'est pas joignable pour l'instant. Le journal se consulte avec du réseau."));
          return;
        }

        Promise.all([
          A.base.from('reglage_historique').select('*').order('modifie_le', { ascending: false }).limit(20),
          A.bd.profil.toArray(),
          A.bd.reglage.toArray()
        ]).then(function (r) {
          if (r[0].error) throw r[0].error;
          var noms = {};
          r[1].forEach(function (p) { noms[p.id] = p.nom; });
          var libelles = {};
          r[2].forEach(function (l) { libelles[l.cle + '|' + (l.famille_code || '')] = l.libelle; });

          corps.innerHTML = '';
          if (!r[0].data.length) {
            corps.appendChild(element('p', 'confirmation', 'Aucun réglage n\'a encore été modifié.'));
            return;
          }
          var liste = element('ul', 'liste-releves');
          r[0].data.forEach(function (h) {
            var libelle = libelles[h.cle + '|' + (h.famille_code || '')] || h.cle;
            var avant = h.ancienne_valeur === null ? 'vide' : C.nombreFrancais(h.ancienne_valeur, 2);
            var apres = h.nouvelle_valeur === null ? 'vide' : C.nombreFrancais(h.nouvelle_valeur, 2);
            liste.appendChild(element('li', null,
              C.dateFrancaise(h.modifie_le) + ' — ' + libelle +
              ' : ' + avant + ' devient ' + apres +
              ' — ' + (noms[h.modifie_par] || 'compte non retrouvé')));
          });
          corps.appendChild(liste);
        }).catch(function (erreur) {
          corps.innerHTML = '';
          corps.appendChild(element('p', 'alerte', A.messageSimple(erreur)));
        });
      }));
      return bloc;
    }

    A.bd.famille_produit.toArray().then(function (familles) {
      familles.forEach(function (f) { libellesFamille[f.code] = f.libelle; });
      dessiner();
    });
  }

  A.afficherReglages = afficherReglages;
})(window);
