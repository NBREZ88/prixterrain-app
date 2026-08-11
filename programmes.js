// PrixTerrain — coût d'un programme.
// Un programme contient des passages ; un passage contient des solutions
// comparées, dont une est retenue. Le coût du programme est la somme des
// solutions retenues, aux prix moyens de l'équipe.
// Les programmes sont personnels : ils vivent sur l'appareil, jamais partagés.

(function (global) {
  'use strict';

  var A = global.PrixTerrain;
  var MEMO = 'programmes';
  var SEUIL_RECHERCHE = 7;

  var DOSES = { L: 'L', KG: 'kg', T: 't', DOSE: 'dose', UNITE: 'unité', QUINTAL: 'q' };

  function lireProgrammes() {
    return A.bd.memo.get(MEMO).then(function (m) {
      if (!m) return [];
      try { return JSON.parse(m.valeur) || []; } catch (e) { return []; }
    });
  }

  function ecrireProgrammes(liste) {
    return A.bd.memo.put({ nom: MEMO, valeur: JSON.stringify(liste) });
  }

  function solutionRetenue(passage) {
    var r = null;
    passage.solutions.forEach(function (s) { if (s.retenue) r = s; });
    return r || passage.solutions[0];
  }

  // ---------------------------------------------------------------------------
  // Prix d'un produit, et raison quand il n'y en a pas
  // ---------------------------------------------------------------------------

  function fabriquerCalcul(contexte, reglages, releves) {
    var C = A.calculs;
    var JOURS_PAR_MOIS = 30.4375;

    function ageEnMois(date) {
      return (Date.now() - new Date(String(date) + 'T00:00:00').getTime()) / 86400000 / JOURS_PAR_MOIS;
    }

    function moyenneProduit(idProduit) {
      var p = contexte.produits[idProduit];
      if (!p) return null;
      var validite = reglages.valeur('duree_validite', p.famille_code);
      if (validite === null) return null;

      var siens = releves.filter(function (x) {
        var q = C.ficheConservee(contexte.produits, x.produit_id);
        return q && q.id === idProduit && ageEnMois(x.date_prix) <= validite;
      });
      if (!siens.length) return null;

      var compte = {}, dominante = null;
      siens.forEach(function (x) {
        compte[x.unite_code] = (compte[x.unite_code] || 0) + 1;
        if (!dominante || compte[x.unite_code] > compte[dominante]) dominante = x.unite_code;
      });
      var duBloc = siens.filter(function (x) { return x.unite_code === dominante; });
      var somme = 0;
      duBloc.forEach(function (x) { somme += Number(x.prix_unitaire_ht); });
      return { valeur: somme / duBloc.length, unite: dominante, nombre: duBloc.length };
    }

    function examinerLigne(ligne) {
      if (!ligne.produit) return { cout: null, raison: 'vide', nom: null, unite: null };
      var p = contexte.produits[ligne.produit];
      if (!p) return { cout: null, raison: 'inconnu', nom: '?', unite: null };

      var tous = releves.filter(function (x) {
        var q = C.ficheConservee(contexte.produits, x.produit_id);
        return q && q.id === ligne.produit;
      });
      if (!tous.length) return { cout: null, raison: 'jamais', nom: p.nom, unite: null };

      var m = moyenneProduit(ligne.produit);
      if (!m) return { cout: null, raison: 'ancien', nom: p.nom, unite: null };
      if (!ligne.dose) return { cout: null, raison: 'dose', nom: p.nom, unite: m.unite };
      return { cout: m.valeur * ligne.dose, raison: null, nom: p.nom, unite: m.unite };
    }

    function phraseAbsence(examen) {
      if (examen.raison === 'jamais') return examen.nom + ' n\'a jamais été relevé';
      if (examen.raison === 'ancien') return examen.nom + ' n\'a aucun relevé assez récent';
      if (examen.raison === 'dose') return examen.nom + ' attend sa dose à l\'hectare';
      return examen.nom + ' n\'est pas reconnu';
    }

    function coutSolution(sol) {
      var total = 0, manquants = [], raisons = [];
      sol.lignes.forEach(function (l) {
        var e = examinerLigne(l);
        if (e.raison === 'vide') return;
        if (e.cout === null) { manquants.push(e.nom); raisons.push(phraseAbsence(e)); }
        else total += e.cout;
      });
      return { total: total, manquants: manquants, raisons: raisons };
    }

    function coutProgramme(prog) {
      var total = 0, manquants = [], raisons = [];
      prog.passages.forEach(function (pa) {
        var c = coutSolution(solutionRetenue(pa));
        total += c.total;
        c.manquants.forEach(function (m) { if (manquants.indexOf(m) < 0) manquants.push(m); });
        c.raisons.forEach(function (r) { if (raisons.indexOf(r) < 0) raisons.push(r); });
      });
      return { total: total, manquants: manquants, raisons: raisons };
    }

    return {
      examinerLigne: examinerLigne,
      phraseAbsence: phraseAbsence,
      coutSolution: coutSolution,
      coutProgramme: coutProgramme
    };
  }

  // ---------------------------------------------------------------------------
  // Écran 1 : mes programmes
  // ---------------------------------------------------------------------------

  function afficherProgrammes(zone, compte) {
    var C = A.calculs;
    var element = C.element;
    var bouton = C.bouton;
    var filtre = '';
    var programmes = [], calcul = null, contexte = null;

    zone.innerHTML = '';
    zone.appendChild(element('p', 'appui', 'Lecture…'));

    Promise.all([C.chargerContexte(), C.chargerReglages(), A.relevesRetenus(), lireProgrammes()])
      .then(function (r) {
        contexte = r[0];
        calcul = fabriquerCalcul(r[0], r[1], r[2]);
        programmes = r[3];
        dessiner();
      });

    function dessiner() {
      zone.innerHTML = '';

      var fraicheur = element('p', 'fraicheur-calcul');
      fraicheur.appendChild(element('span', 'point-frais'));
      fraicheur.appendChild(element('span', null,
        'Coûts recalculés à l\'instant, sur les prix moyens du jour.'));
      zone.appendChild(fraicheur);

      if (programmes.length >= SEUIL_RECHERCHE) {
        var champ = element('input', 'champ-recherche');
        champ.type = 'search';
        champ.placeholder = 'Chercher un programme, un passage ou un produit';
        champ.style.marginBottom = '.9rem';
        champ.addEventListener('input', function () { filtre = champ.value.trim(); poser(); });
        zone.appendChild(champ);
      }

      zone.appendChild(bouton('ajouter-programme', '+ Nouveau programme', function () {
        var neuf = { id: Date.now(), nom: 'Programme sans nom', passages: [
          { nom: 'Passage 1', solutions: [{ nom: 'Solution', retenue: true, lignes: [] }] }] };
        programmes.push(neuf);
        ecrireProgrammes(programmes).then(function () {
          A.naviguer('programme-detail', { programme: neuf });
        });
      }));

      var liste = element('div', 'liste-programmes');
      zone.appendChild(liste);
      A.suivreHauteur(liste);
      poser();

      function poser() {
        liste.innerHTML = '';
        var vus = programmes.filter(correspond);

        if (!programmes.length) {
          liste.appendChild(element('p', 'vide',
            'Aucun programme. Créez-en un pour chiffrer un itinéraire.'));
          A.ajusterHauteurs();
          return;
        }
        if (!vus.length) {
          liste.appendChild(element('p', 'vide', 'Aucun programme sous ce nom.'));
          A.ajusterHauteurs();
          return;
        }

        vus.forEach(function (prog) {
          var c = calcul.coutProgramme(prog);
          var nb = 0;
          prog.passages.forEach(function (pa) { nb += solutionRetenue(pa).lignes.length; });

          var b = bouton('ligne-programme', '', function () {
            A.naviguer('programme-detail', { programme: prog });
          });
          var g = element('span', 'lp-gauche');
          g.appendChild(element('b', null, prog.nom));
          g.appendChild(element('span', null,
            prog.passages.length + (prog.passages.length > 1 ? ' passages · ' : ' passage · ') +
            nb + (nb > 1 ? ' produits' : ' produit') +
            (c.manquants.length ? ' · ' + c.manquants.join(', ') + ' non chiffré' +
              (c.manquants.length > 1 ? 's' : '') : '')));
          var detail = element('span', 'lp-passages');
          prog.passages.forEach(function (pa, i) {
            detail.appendChild(element('span', null, (i + 1) + '. ' + pa.nom));
          });
          g.appendChild(detail);
          b.appendChild(g);

          var droite = element('span', 'lp-droite');
          droite.appendChild(element('span', c.manquants.length ? 'lp-cout partiel' : 'lp-cout',
            C.nombreFrancais(c.total) + ' €/ha'));
          if (c.manquants.length) droite.appendChild(element('span', 'lp-mention', 'coût partiel'));
          b.appendChild(droite);

          liste.appendChild(b);
        });
        A.ajusterHauteurs();
      }

      function correspond(prog) {
        if (!filtre) return true;
        var t = filtre.toUpperCase();
        if (prog.nom.toUpperCase().indexOf(t) >= 0) return true;
        var trouve = false;
        prog.passages.forEach(function (pa) {
          if (pa.nom.toUpperCase().indexOf(t) >= 0) trouve = true;
          pa.solutions.forEach(function (sol) {
            sol.lignes.forEach(function (l) {
              var p = contexte.produits[l.produit];
              if (p && p.nom.toUpperCase().indexOf(t) >= 0) trouve = true;
            });
          });
        });
        return trouve;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Éditeur des produits d'une solution
  // ---------------------------------------------------------------------------

  function editeurLignes(sol, contexte, calcul, rafraichir) {
    var C = A.calculs;
    var element = C.element;
    var bouton = C.bouton;
    var zone = element('div', 'lignes-solution');

    sol.lignes.forEach(function (l, rang) {
      var examen = calcul.examinerLigne(l);
      var bloc = element('div', 'ligne-produit');

      var cNom = element('div', 'case-large');
      cNom.appendChild(element('span', 'etiquette', 'Produit'));
      var iNom = element('input', 'saisie');
      iNom.type = 'text';
      iNom.placeholder = 'Nom du produit';
      iNom.value = contexte.produits[l.produit] ? contexte.produits[l.produit].nom : '';
      cNom.appendChild(iNom);
      var choix = element('div', 'propositions');
      choix.style.display = 'none';
      cNom.appendChild(choix);
      bloc.appendChild(cNom);

      iNom.addEventListener('input', function () {
        var texte = iNom.value.trim();
        choix.innerHTML = '';
        if (!texte) l.produit = null;
        if (texte.length < 2) { choix.style.display = 'none'; return; }
        A.rechercherFiches('produit', texte, 6).then(function (trouves) {
          if (iNom.value.trim() !== texte) return;
          choix.innerHTML = '';
          var exact = null;
          trouves.forEach(function (p) {
            if (A.normaliserLibelle(p.nom) === A.normaliserLibelle(texte)) exact = p;
          });
          if (exact) { l.produit = exact.id; choix.style.display = 'none'; rafraichir(); return; }
          if (!trouves.length) { choix.style.display = 'none'; return; }
          choix.style.display = 'block';
          trouves.forEach(function (p) {
            choix.appendChild(bouton('proposition', p.nom, function () {
              l.produit = p.id;
              iNom.value = p.nom;
              choix.style.display = 'none';
              rafraichir();
            }));
          });
        });
      });
      iNom.addEventListener('blur', function () {
        setTimeout(function () { choix.style.display = 'none'; }, 150);
      });

      var cDose = element('div');
      cDose.appendChild(element('span', 'etiquette', 'Dose à l\'hectare'));
      var groupe = element('div', 'groupe-dose');
      var iDose = element('input', 'saisie');
      iDose.type = 'text';
      iDose.inputMode = 'decimal';
      iDose.placeholder = '0,00';
      iDose.value = l.dose ? C.nombreFrancais(l.dose, 2) : '';
      iDose.addEventListener('change', function () {
        var v = Number(String(iDose.value).replace(',', '.'));
        l.dose = (isFinite(v) && v > 0) ? v : null;
        rafraichir();
      });
      groupe.appendChild(iDose);
      groupe.appendChild(element('span', 'unite-dose',
        examen.unite ? DOSES[examen.unite] + '/ha' : '—'));
      cDose.appendChild(groupe);
      bloc.appendChild(cDose);

      var cCout = element('div');
      cCout.appendChild(element('span', 'etiquette', 'Coût'));
      cCout.appendChild(element('div', 'cout-produit',
        examen.cout === null ? '—' : C.nombreFrancais(examen.cout) + ' €/ha'));
      bloc.appendChild(cCout);

      var pied = element('div', 'ligne-pied');
      if (examen.raison && examen.raison !== 'vide') {
        pied.appendChild(element('span', 'ligne-souci', calcul.phraseAbsence(examen)));
      }
      pied.appendChild(bouton('retirer-produit', 'Retirer', function () {
        sol.lignes.splice(rang, 1);
        rafraichir();
      }));
      bloc.appendChild(pied);
      zone.appendChild(bloc);
    });

    zone.appendChild(bouton('ajouter-ligne petit', '+ Ajouter un produit', function () {
      sol.lignes.push({ produit: null, dose: null });
      rafraichir();
    }));
    return zone;
  }

  // ---------------------------------------------------------------------------
  // Écran 2 : un programme et ses passages
  // ---------------------------------------------------------------------------

  function afficherProgrammeDetail(zone, compte, parametres) {
    var C = A.calculs;
    var element = C.element;
    var bouton = C.bouton;
    var prog = parametres.programme;
    var programmes = [], calcul = null, contexte = null;

    zone.innerHTML = '';
    zone.appendChild(element('p', 'appui', 'Lecture…'));

    Promise.all([C.chargerContexte(), C.chargerReglages(), A.relevesRetenus(), lireProgrammes()])
      .then(function (r) {
        contexte = r[0];
        calcul = fabriquerCalcul(r[0], r[1], r[2]);
        programmes = r[3];
        dessiner();
      });

    function garder() { return ecrireProgrammes(programmes); }
    function rafraichir() { garder().then(dessiner); }

    function dessiner() {
      zone.innerHTML = '';

      var casNom = element('div', 'case-titre');
      casNom.appendChild(element('span', 'etiquette', 'Nom du programme'));
      var nom = element('input', 'champ-titre');
      nom.type = 'text';
      nom.placeholder = 'Blé tendre, conduite classique';
      nom.value = prog.nom === 'Programme sans nom' ? '' : prog.nom;
      nom.addEventListener('input', function () {
        prog.nom = nom.value.trim() || 'Programme sans nom';
        garder();
      });
      casNom.appendChild(nom);
      zone.appendChild(casNom);

      var c = calcul.coutProgramme(prog);
      var partiel = c.manquants.length > 0;
      var total = element('div', partiel ? 'total-programme partiel' : 'total-programme');
      total.appendChild(element('p', 'tp-etq',
        partiel ? 'Coût partiel du programme' : 'Coût du programme'));
      var v = element('p', 'tp-valeur');
      v.appendChild(element('span', null, C.nombreFrancais(c.total)));
      v.appendChild(element('span', 'tp-unite', ' €/ha'));
      total.appendChild(v);
      var past = element('div', 'tp-pastilles');
      var nbLignes = 0;
      prog.passages.forEach(function (pa) { nbLignes += solutionRetenue(pa).lignes.length; });
      past.appendChild(element('span', 'tp-pastille',
        prog.passages.length + (prog.passages.length > 1 ? ' passages' : ' passage')));
      past.appendChild(element('span', 'tp-pastille',
        (nbLignes - c.manquants.length) + ' produits sur ' + nbLignes + ' chiffrés'));
      past.appendChild(element('span', 'tp-pastille', 'prix moyens, toutes offres'));
      total.appendChild(past);
      zone.appendChild(total);

      if (c.raisons.length) {
        var alerte = element('div', 'alerte-programme');
        c.raisons.forEach(function (r) {
          alerte.appendChild(element('p', 'alerte-raison', r + '.'));
        });
        alerte.appendChild(element('p', 'alerte-raison', c.raisons.length > 1
          ? 'Le coût affiché ne comprend pas ces produits.'
          : 'Le coût affiché ne comprend pas ce produit.'));
        zone.appendChild(alerte);
      }

      // Un seul passage sans comparaison : ses produits sont montrés directement.
      if (prog.passages.length === 1 && prog.passages[0].solutions.length === 1) {
        zone.appendChild(element('p', 'titre-section', 'Produits'));
        zone.appendChild(editeurLignes(prog.passages[0].solutions[0], contexte, calcul, rafraichir));
        zone.appendChild(bouton('ajouter-ligne', '+ Comparer avec une autre solution', function () {
          prog.passages[0].solutions.push({ nom: 'Autre solution', retenue: false, lignes: [] });
          garder().then(function () {
            A.naviguer('programme-passage', { programme: prog, passage: prog.passages[0] });
          });
        }));
        zone.appendChild(bouton('ajouter-ligne', '+ Ajouter un passage', ajouterPassage));
        zone.appendChild(bouton('fin-session', 'Supprimer ce programme', confirmerSuppression));
        return;
      }

      prog.passages.forEach(function (pa, i) {
        var retenue = solutionRetenue(pa);
        var cs = calcul.coutSolution(retenue);
        var bloc = element('div', 'passage');

        var tete = bouton('passage-tete', '', function () {
          A.naviguer('programme-passage', { programme: prog, passage: pa });
        });
        tete.appendChild(element('span', 'passage-numero', String(i + 1)));
        tete.appendChild(element('span', 'passage-nom', pa.nom));
        tete.appendChild(element('span', 'passage-cout',
          cs.manquants.length && !cs.total ? '—' : C.nombreFrancais(cs.total) + ' €/ha'));
        bloc.appendChild(tete);

        var corps = element('div', 'passage-corps');
        if (!retenue.lignes.length) {
          corps.appendChild(element('p', 'passage-vide', 'Aucun produit dans ce passage.'));
        }
        retenue.lignes.forEach(function (l) {
          var p = contexte.produits[l.produit];
          var examen = calcul.examinerLigne(l);
          var ligne = element('div', 'passage-ligne');
          ligne.appendChild(element('span', null,
            (p ? p.nom : '?') + ' · ' + C.nombreFrancais(l.dose || 0, 2) +
            ' ' + (examen.unite ? DOSES[examen.unite] : '')));
          ligne.appendChild(element('b', null,
            examen.cout === null ? '—' : C.nombreFrancais(examen.cout) + ' €'));
          corps.appendChild(ligne);
        });

        if (pa.solutions.length > 1) {
          var couts = pa.solutions.map(function (s) { return calcul.coutSolution(s).total; })
            .filter(function (x) { return x > 0; });
          var mini = couts.length ? Math.min.apply(null, couts) : 0;
          var ecart = cs.total - mini;
          var note = element('p', 'passage-note');
          note.appendChild(element('span', null, pa.solutions.length + ' solutions comparées'));
          if (ecart > 0.005) {
            note.appendChild(element('span', null, ' · '));
            note.appendChild(element('b', null, C.nombreFrancais(ecart) + ' €/ha d\'écart'));
            note.appendChild(element('span', null, ' avec la moins chère'));
          } else {
            note.appendChild(element('span', null, ' · la moins chère est retenue'));
          }
          corps.appendChild(note);
        }
        bloc.appendChild(corps);
        zone.appendChild(bloc);
      });

      zone.appendChild(bouton('ajouter-ligne', '+ Ajouter un passage', ajouterPassage));
      zone.appendChild(bouton('fin-session', 'Supprimer ce programme', confirmerSuppression));
    }

    function ajouterPassage() {
      prog.passages.push({ nom: 'Passage ' + (prog.passages.length + 1),
                           solutions: [{ nom: 'Solution', retenue: true, lignes: [] }] });
      rafraichir();
    }

    function confirmerSuppression() {
      var voile = element('div', 'voile');
      var boite = element('div', 'boite');

      var tete = element('div', 'boite-tete');
      var textes = element('div');
      textes.appendChild(element('p', 'boite-titre danger', 'Supprimer ce programme ?'));
      textes.appendChild(element('p', 'boite-sous', prog.nom));
      tete.appendChild(textes);
      tete.appendChild(bouton('boite-fermer', '✕', function () { voile.remove(); }));
      boite.appendChild(tete);

      var corps = element('div', 'boite-corps');
      corps.appendChild(element('p', 'boite-appui',
        'Il sera effacé de cet appareil. Les relevés de prix ne sont pas touchés.'));
      boite.appendChild(corps);

      var pied = element('div', 'boite-pied');
      pied.appendChild(bouton('bouton-danger', 'Supprimer ce programme', function () {
        var i = programmes.findIndex(function (p) { return p.id === prog.id; });
        if (i >= 0) programmes.splice(i, 1);
        ecrireProgrammes(programmes).then(function () {
          voile.remove();
          A.naviguer('programme');
        });
      }));
      pied.appendChild(bouton('bouton-neutre', 'Revenir', function () { voile.remove(); }));
      boite.appendChild(pied);

      voile.appendChild(boite);
      voile.addEventListener('click', function (e) { if (e.target === voile) voile.remove(); });
      document.body.appendChild(voile);
    }
  }

  // ---------------------------------------------------------------------------
  // Écran 3 : un passage et ses solutions
  // ---------------------------------------------------------------------------

  function afficherProgrammePassage(zone, compte, parametres) {
    var C = A.calculs;
    var element = C.element;
    var bouton = C.bouton;
    var prog = parametres.programme;
    var passage = parametres.passage;
    var programmes = [], calcul = null, contexte = null;

    zone.innerHTML = '';
    zone.appendChild(element('p', 'appui', 'Lecture…'));

    Promise.all([C.chargerContexte(), C.chargerReglages(), A.relevesRetenus(), lireProgrammes()])
      .then(function (r) {
        contexte = r[0];
        calcul = fabriquerCalcul(r[0], r[1], r[2]);
        programmes = r[3];
        dessiner();
      });

    function garder() { return ecrireProgrammes(programmes); }
    function rafraichir() { garder().then(dessiner); }

    function dessiner() {
      zone.innerHTML = '';

      var casNom = element('div', 'case-titre');
      casNom.appendChild(element('span', 'etiquette', 'Nom du passage'));
      var nom = element('input', 'champ-titre');
      nom.type = 'text';
      nom.placeholder = 'Désherbage sortie hiver';
      nom.value = /^Passage \d+$/.test(passage.nom) ? '' : passage.nom;
      nom.addEventListener('input', function () {
        passage.nom = nom.value.trim() || 'Passage sans nom';
        garder();
      });
      casNom.appendChild(nom);
      zone.appendChild(casNom);

      zone.appendChild(element('p', 'appui', passage.solutions.length > 1
        ? 'Solutions comparées aux prix moyens de l\'équipe. Retenez celle que vous conseillez.'
        : 'Une seule solution. Ajoutez-en une seconde pour comparer.'));

      var couts = passage.solutions.map(function (s) { return calcul.coutSolution(s).total; });
      var valides = couts.filter(function (x) { return x > 0; });
      var mini = valides.length ? Math.min.apply(null, valides) : null;

      var grille = element('div', 'solutions' +
        (passage.solutions.length === 2 ? ' deux'
          : passage.solutions.length >= 3 ? ' trois' : ''));

      passage.solutions.forEach(function (sol, i) {
        var cs = calcul.coutSolution(sol);
        var carte = element('div', sol.retenue ? 'solution retenue' : 'solution');

        var tete = element('div', 'solution-tete');
        var titreSol = element('input', 'solution-nom');
        titreSol.type = 'text';
        titreSol.placeholder = 'Nom de la solution';
        titreSol.value = (sol.nom === 'Solution' || sol.nom === 'Autre solution') ? '' : sol.nom;
        titreSol.addEventListener('input', function () {
          sol.nom = titreSol.value.trim() || 'Solution sans nom';
          garder();
        });
        tete.appendChild(titreSol);
        if (sol.retenue) tete.appendChild(element('span', 'solution-badge', 'retenue'));
        carte.appendChild(tete);

        var corps = element('div', 'solution-corps');
        corps.appendChild(editeurLignes(sol, contexte, calcul, rafraichir));

        var total = element('div', 'solution-total');
        total.appendChild(element('b', null, C.nombreFrancais(cs.total) + ' €/ha'));
        if (mini !== null && cs.total > 0) {
          if (Math.abs(cs.total - mini) < 0.005) {
            total.appendChild(element('span', 'solution-ecart ref', 'la moins chère'));
          } else {
            total.appendChild(element('span', 'solution-ecart',
              '+' + C.nombreFrancais((cs.total - mini) / mini * 100, 1) + ' %'));
          }
        }
        corps.appendChild(total);

        cs.raisons.forEach(function (r) {
          corps.appendChild(element('p', 'solution-manquant', r));
        });
        carte.appendChild(corps);

        var pied = element('div', 'solution-pied');
        pied.appendChild(bouton(sol.retenue ? 'solution-choisir on' : 'solution-choisir',
          sol.retenue ? 'Retenue' : 'Retenir celle-ci', function () {
            passage.solutions.forEach(function (autre) { autre.retenue = false; });
            sol.retenue = true;
            rafraichir();
          }));
        if (passage.solutions.length > 1) {
          pied.appendChild(bouton('solution-retirer', 'Retirer', function () {
            passage.solutions.splice(i, 1);
            if (!passage.solutions.some(function (a) { return a.retenue; })) {
              passage.solutions[0].retenue = true;
            }
            rafraichir();
          }));
        }
        carte.appendChild(pied);
        grille.appendChild(carte);
      });
      zone.appendChild(grille);

      zone.appendChild(bouton('ajouter-ligne', '+ Ajouter une solution à comparer', function () {
        passage.solutions.push({ nom: 'Autre solution', retenue: false, lignes: [] });
        rafraichir();
      }));

      var retenue = solutionRetenue(passage);
      var cr = calcul.coutSolution(retenue).total;
      if (mini !== null && cr - mini > 0.005) {
        zone.appendChild(element('div', 'alerte-programme',
          'La solution retenue n\'est pas la moins chère. Le programme coûte ' +
          C.nombreFrancais(cr - mini) + ' €/ha de plus.'));
      }

      if (prog.passages.length > 1) {
        zone.appendChild(bouton('fin-session', 'Retirer ce passage', function () {
          var i = prog.passages.indexOf(passage);
          if (i >= 0) prog.passages.splice(i, 1);
          garder().then(function () {
            A.naviguer('programme-detail', { programme: prog });
          });
        }));
      }
    }
  }

  A.afficherProgrammes = afficherProgrammes;
  A.afficherProgrammeDetail = afficherProgrammeDetail;
  A.afficherProgrammePassage = afficherProgrammePassage;
})(window);
