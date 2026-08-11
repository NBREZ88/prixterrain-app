// PrixTerrain — écran Réglages, réservé aux responsables.
// Quatre valeurs commandent les prix moyens de toute l'équipe.
// Chacune est présentée par une question, un exemple chiffré, et l'effet
// qu'elle produit sur les relevés du moment.

(function (global) {
  'use strict';

  var A = global.PrixTerrain;
  var JOURS_PAR_MOIS = 30.4375;

  function ageEnMois(date) {
    return (Date.now() - new Date(String(date) + 'T00:00:00').getTime()) / 86400000 / JOURS_PAR_MOIS;
  }

  function afficherReglages(zone, compte) {
    var C = A.calculs;
    var element = C.element;
    var bouton = C.bouton;

    zone.innerHTML = '';
    if (!compte || compte.role !== 'administrateur') {
      zone.appendChild(element('p', 'vide', 'Cet écran est réservé aux responsables.'));
      return;
    }

    zone.appendChild(element('p', 'appui', 'Lecture…'));

    var contexte = null, lignes = [], releves = [], types = [];
    var brouillon = {};

    Promise.all([C.chargerContexte(), A.bd.reglage.orderBy('ordre').toArray(),
                 A.relevesRetenus(), A.bd.type_produit.orderBy('ordre').toArray(),
                 A.bd.releve.toArray()])
      .then(function (r) {
        contexte = r[0];
        lignes = r[1];
        // Tous les relevés de prix, périmés compris : l'effet d'un réglage se
        // mesure sur l'ensemble, pas seulement sur ce qui est retenu aujourd'hui.
        releves = r[4].filter(function (x) {
          return x.type === 'prix' && x.etat !== 'annule';
        });
        types = r[3];
        lignes.forEach(function (l) {
          brouillon[cle(l)] = (l.valeur === null || l.valeur === undefined)
            ? null : Number(l.valeur);
        });
        dessiner();
      });

    function cle(l) { return l.cle + '|' + (l.famille_code || ''); }

    function dessiner() {
      zone.innerHTML = '';

      var barre = element('div');
      zone.appendChild(barre);

      zone.appendChild(element('p', 'intro-reglages',
        'Ces valeurs commandent tous les prix moyens de l\'application, et s\'appliquent à ' +
        'toute l\'équipe. Chaque réglage est expliqué avec un exemple.'));

      var corps = element('div');
      zone.appendChild(corps);

      var manquants = 0;
      lignes.forEach(function (l) { if (brouillon[cle(l)] === null) manquants++; });

      var etat = element('div', manquants ? 'barre-reglages' : 'barre-reglages ok');
      etat.appendChild(element('b', null, manquants ? String(manquants) : '✓'));
      etat.appendChild(element('span', null, manquants
        ? (manquants > 1 ? 'valeurs à renseigner. ' : 'valeur à renseigner. ') +
          'Tant qu\'elles sont vides, les prix moyens ne s\'affichent pas.'
        : 'Tous les réglages sont renseignés. Les prix moyens sont calculés.'));
      barre.appendChild(etat);

      // --- durée de validité, une par famille ---
      var duree = lignes.filter(function (l) { return l.cle === 'duree_validite'; });
      var ecartes = 0, total = 0;
      releves.forEach(function (x) {
        var p = C.ficheConservee(contexte.produits, x.produit_id);
        if (!p) return;
        total++;
        var v = brouillon['duree_validite|' + p.famille_code];
        if (v === null || ageEnMois(x.date_prix) > v) ecartes++;
      });

      corps.appendChild(carte(
        'Combien de temps un prix reste-t-il valable ?',
        'Au-delà de cette durée, le relevé n\'entre plus dans les prix moyens. ' +
        'Il reste affiché dans l\'historique du produit, en gris.',
        'Avec <b>18 mois</b> pour les phytos : un prix relevé en <b>mars 2025</b> compte ' +
        '<span class="oui">encore</span>. Un prix de <b>décembre 2024</b> ' +
        '<span class="non">ne compte plus</span> dans la moyenne, mais il reste visible ' +
        'dans la fiche du produit.',
        duree.map(function (l) {
          var f = contexte.familles[l.famille_code];
          return { ligne: l, libelle: f ? f.libelle : l.famille_code, unite: 'mois' };
        }),
        { texte: ecartes
            ? 'Aujourd\'hui, ' + ecartes + ' relevés sur ' + total +
              ' n\'entreraient pas dans les moyennes.'
            : 'Aujourd\'hui, les ' + total + ' relevés entreraient tous dans les moyennes.',
          absent: manquants > 0 }));

      // --- écart atypique ---
      var atypique = lignes.filter(function (l) { return l.cle === 'ecart_atypique'; });
      var seuil = brouillon['ecart_atypique|'];
      var signales = seuil === null ? 0 : compterSignales(seuil);

      corps.appendChild(carte(
        'À partir de quel écart un prix est-il suspect ?',
        'Un relevé qui s\'écarte de plus que cette part du prix médian de son produit ' +
        'apparaît dans « Relevés à vérifier ».',
        'Avec <b>30 %</b> : sur un produit dont le prix médian est <b>150 €</b>, un relevé ' +
        'à <b>200 €</b> est <span class="non">signalé</span>, un relevé à <b>180 €</b> ne ' +
        'l\'est <span class="oui">pas</span>.',
        atypique.map(function (l) {
          return { ligne: l, libelle: 'Écart au prix médian', unite: '%' };
        }),
        { texte: seuil === null
            ? 'Tant que cette valeur est vide, aucun relevé n\'est signalé.'
            : 'Aujourd\'hui, ' + signales +
              (signales > 1 ? ' relevés seraient signalés.' : ' relevé serait signalé.'),
          absent: seuil === null }));

      // --- vocabulaire des types ---
      corps.appendChild(element('p', 'titre-section', 'Types de produit'));
      corps.appendChild(element('p', 'reglage-role',
        'Le type est demandé une seule fois, à la création d\'un produit. ' +
        'Il sert à filtrer les listes. Les engrais n\'en ont pas.'));

      var alerteType = element('p', 'alerte-type');
      alerteType.style.display = 'none';

      Object.keys(contexte.familles).forEach(function (code) {
        var liste = types.filter(function (t) { return t.famille_code === code; });
        var bloc = element('div', 'reglage');

        var tete = element('div', 'reglage-tete');
        tete.appendChild(element('p', 'reglage-question', contexte.familles[code].libelle));
        tete.appendChild(element('p', 'reglage-role', liste.length
          ? liste.length + (liste.length > 1 ? ' types proposés' : ' type proposé') +
            ' à la création d\'un produit de cette famille.'
          : 'Aucun type : la question ne sera pas posée.'));
        bloc.appendChild(tete);

        var dedans = element('div', 'reglage-corps');
        var puces = element('div', 'liste-types');
        liste.forEach(function (t) {
          var puce = element('span', 'puce-type');
          puce.appendChild(element('span', null, t.libelle));
          puce.appendChild(bouton('puce-retirer', '✕', function () {
            retirerType(t, alerteType);
          }));
          puces.appendChild(puce);
        });
        if (!liste.length) puces.appendChild(element('span', 'aucun-type', 'Aucun type'));
        dedans.appendChild(puces);

        var ajout = element('div', 'ajout-type');
        var champ = element('input', 'saisie');
        champ.type = 'text';
        champ.placeholder = 'Nouveau type';
        ajout.appendChild(champ);
        ajout.appendChild(bouton('mini-bouton', 'Ajouter', function () {
          ajouterType(code, champ.value.trim(), alerteType);
        }));
        dedans.appendChild(ajout);
        bloc.appendChild(dedans);
        corps.appendChild(bloc);
      });
      corps.appendChild(alerteType);

      // --- pied ---
      var pied = element('div', 'pied-reglages');
      var message = element('p', 'alerte');
      message.style.display = 'none';
      pied.appendChild(bouton('principal pleine', 'Enregistrer les réglages', function () {
        enregistrer(message);
      }));
      pied.appendChild(message);

      var derniere = lignes.filter(function (l) { return l.modifie_le; })
        .sort(function (a, b) { return String(b.modifie_le).localeCompare(String(a.modifie_le)); })[0];
      if (derniere) {
        var qui = contexte.profils[derniere.modifie_par];
        pied.appendChild(element('p', 'journal-reglages',
          'Dernière modification : ' + (qui ? qui.nom : 'un responsable') +
          ', le ' + C.dateFrancaise(String(derniere.modifie_le).slice(0, 10)) + '.'));
      }
      zone.appendChild(pied);

      function carte(question, role, exemple, champs, effet) {
        var c = element('div', 'reglage');
        var tete = element('div', 'reglage-tete');
        tete.appendChild(element('p', 'reglage-question', question));
        tete.appendChild(element('p', 'reglage-role', role));
        c.appendChild(tete);

        var dedans = element('div', 'reglage-corps');
        var ex = element('div', 'reglage-exemple');
        ex.innerHTML = exemple;
        dedans.appendChild(ex);

        var grille = element('div', 'reglage-champs' + (champs.length === 1 ? ' un' : ''));
        champs.forEach(function (ch) {
          var valeur = brouillon[cle(ch.ligne)];
          var bloc = element('div', 'reglage-champ' + (valeur === null ? ' vide' : ''));
          bloc.appendChild(element('label', null, ch.libelle));
          var mesure = element('div', 'reglage-mesure');
          var i = element('input');
          i.type = 'text';
          i.inputMode = 'numeric';
          i.value = valeur === null ? '' : C.nombreFrancais(valeur, 0);
          i.placeholder = '—';
          i.addEventListener('change', function () {
            var brut = String(i.value).replace(',', '.').trim();
            var v = Number(brut);
            brouillon[cle(ch.ligne)] = (brut && isFinite(v) && v > 0) ? v : null;
            dessiner();
          });
          mesure.appendChild(i);
          mesure.appendChild(element('span', null, ch.unite));
          bloc.appendChild(mesure);
          grille.appendChild(bloc);
        });
        dedans.appendChild(grille);

        if (effet) {
          dedans.appendChild(element('p', 'reglage-effet' + (effet.absent ? ' absent' : ''),
            effet.texte));
        }
        c.appendChild(dedans);
        return c;
      }
    }

    function compterSignales(seuil) {
      var parProduit = {};
      releves.forEach(function (x) {
        var p = C.ficheConservee(contexte.produits, x.produit_id);
        if (!p) return;
        var v = brouillon['duree_validite|' + p.famille_code];
        if (v === null || ageEnMois(x.date_prix) > v) return;
        var clef = p.id + '|' + x.unite_code;
        (parProduit[clef] = parProduit[clef] || []).push(Number(x.prix_unitaire_ht));
      });
      var n = 0;
      Object.keys(parProduit).forEach(function (k) {
        var prix = parProduit[k].slice().sort(function (a, b) { return a - b; });
        var m = prix.length % 2
          ? prix[(prix.length - 1) / 2]
          : (prix[prix.length / 2 - 1] + prix[prix.length / 2]) / 2;
        if (!m) return;
        prix.forEach(function (v) {
          if (Math.abs((v - m) / m * 100) > seuil) n++;
        });
      });
      return n;
    }

    // -----------------------------------------------------------------------
    // Écriture : un réglage engage l'équipe, il passe par la base et non par
    // la file d'attente d'un seul appareil.
    // -----------------------------------------------------------------------
    function enregistrer(message) {
      var aEcrire = lignes.filter(function (l) {
        var avant = (l.valeur === null || l.valeur === undefined) ? null : Number(l.valeur);
        return brouillon[cle(l)] !== avant;
      });

      if (!aEcrire.length) {
        message.textContent = 'Aucun changement à enregistrer.';
        message.style.display = 'block';
        return;
      }
      if (!global.navigator.onLine) {
        message.textContent = 'Sans réseau, les réglages ne peuvent pas être enregistrés : ' +
                              'ils engagent toute l\'équipe.';
        message.style.display = 'block';
        return;
      }

      message.textContent = 'Enregistrement…';
      message.style.display = 'block';

      var suite = Promise.resolve();
      aEcrire.forEach(function (l) {
        suite = suite.then(function () { return ecrire(l, brouillon[cle(l)]); });
      });
      suite.then(function () { return A.bd.reglage.orderBy('ordre').toArray(); })
        .then(function (r) {
          lignes = r;
          message.style.display = 'none';
          dessiner();
        })
        .catch(function (e) {
          message.textContent = A.messageSimple(e);
          message.style.display = 'block';
        });
    }

    function ecrire(ligne, valeur) {
      var requete = A.base.from('reglage')
        .update({ valeur: valeur, modifie_par: compte.id, modifie_le: new Date().toISOString() })
        .eq('cle', ligne.cle);
      requete = ligne.famille_code
        ? requete.eq('famille_code', ligne.famille_code)
        : requete.is('famille_code', null);
      return requete.then(function (reponse) {
        if (reponse.error) throw reponse.error;
        return A.bd.reglage.put(Object.assign({}, ligne, { valeur: valeur }));
      });
    }

    function ajouterType(famille, libelle, alerte) {
      alerte.style.display = 'none';
      if (!libelle) return;
      var code = libelle.toUpperCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^A-Z0-9]+/g, '_');
      if (types.some(function (t) { return t.code === code; })) {
        alerte.textContent = libelle + ' figure déjà dans la liste.';
        alerte.style.display = 'block';
        return;
      }
      var ordre = types.filter(function (t) { return t.famille_code === famille; }).length + 1;
      var ligne = { code: code, libelle: libelle, famille_code: famille, ordre: ordre, actif: true };

      A.base.from('type_produit').insert(ligne).then(function (reponse) {
        if (reponse.error) {
          alerte.textContent = A.messageSimple(reponse.error);
          alerte.style.display = 'block';
          return;
        }
        return A.bd.type_produit.put(ligne).then(function () {
          types.push(ligne);
          dessiner();
        });
      });
    }

    function retirerType(type, alerte) {
      alerte.style.display = 'none';
      A.bd.produit.where('famille_code').equals(type.famille_code).toArray()
        .then(function (produits) {
          var utilises = produits.filter(function (p) { return p.type_code === type.code; }).length;
          if (utilises) {
            alerte.textContent = type.libelle + ' est utilisé par ' + utilises +
              (utilises > 1 ? ' produits' : ' produit') + ' : il ne peut pas être retiré.';
            alerte.style.display = 'block';
            return;
          }
          return A.base.from('type_produit').delete().eq('code', type.code)
            .then(function (reponse) {
              if (reponse.error) throw reponse.error;
              return A.bd.type_produit.delete(type.code);
            })
            .then(function () {
              types = types.filter(function (t) { return t.code !== type.code; });
              dessiner();
            });
        })
        .catch(function (e) {
          alerte.textContent = A.messageSimple(e);
          alerte.style.display = 'block';
        });
    }
  }

  A.afficherReglages = afficherReglages;
})(window);
