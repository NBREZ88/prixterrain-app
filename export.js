// PrixTerrain — export tableur.
// Un produit par ligne, un fournisseur par colonne, plus la moyenne toutes
// offres. Le fichier est un classeur Excel mis en forme.
// Réservé à l'ordinateur : une colonne par fournisseur ne se lit pas sur
// un écran de téléphone, et il faut un tableur pour l'ouvrir.

(function (global) {
  'use strict';

  var A = global.PrixTerrain;

  var VERT       = '2F6F4F';
  var VERT_CLAIR = 'EEF2EF';
  var VERT_FONCE = '1F4D38';
  var GRIS       = '78807F';
  var TRAIT      = 'E4E6E2';
  var PANNEAU    = 'FBFBFA';

  var bibliotheque = null;

  // La bibliothèque pèse près d'un mégaoctet : elle n'est chargée qu'ici,
  // au moment où l'on ouvre l'écran, et jamais sur un téléphone.
  function chargerBibliotheque() {
    if (bibliotheque) return bibliotheque;
    bibliotheque = new Promise(function (resoudre, rejeter) {
      if (global.ExcelJS) return resoudre(global.ExcelJS);
      var balise = document.createElement('script');
      balise.src = 'exceljs.min.js';
      balise.onload = function () {
        global.ExcelJS ? resoudre(global.ExcelJS)
                       : rejeter(new Error('bibliothèque tableur illisible'));
      };
      balise.onerror = function () {
        rejeter(new Error('La bibliothèque tableur n\'a pas pu être chargée. ' +
                          'Il faut du réseau la première fois.'));
      };
      document.head.appendChild(balise);
    });
    return bibliotheque;
  }

  function afficherExport(zone, compte) {
    var C = A.calculs;
    var element = C.element;
    var bouton = C.bouton;

    zone.innerHTML = '';

    if (window.innerWidth < 900) {
      zone.appendChild(element('div', 'encart-manquant',
        'L\'export se fait depuis un ordinateur. Le fichier compte une colonne par ' +
        'fournisseur : il ne se lit pas sur un écran de téléphone, et il faut un ' +
        'tableur pour l\'ouvrir.'));
      zone.appendChild(element('p', 'vide',
        'Ouvrez PrixTerrain sur votre poste pour exporter les prix moyens.'));
      return;
    }

    var familleActive = '';
    var avecNombres = false;
    var contexte = null, reglages = null, releves = [], fournisseurs = [];

    zone.appendChild(element('p', 'appui',
      'Un produit par ligne, un fournisseur par colonne, et la moyenne toutes offres. ' +
      'Les moyennes suivent les réglages de l\'application.'));

    var onglets = element('div', 'sel-onglets');
    zone.appendChild(onglets);

    var option = document.createElement('label');
    option.className = 'option-export';
    var caseAcocher = document.createElement('input');
    caseAcocher.type = 'checkbox';
    caseAcocher.addEventListener('change', function () {
      avecNombres = caseAcocher.checked;
      poser();
    });
    option.appendChild(caseAcocher);
    option.appendChild(element('span', null,
      'Ajouter le nombre de relevés derrière chaque fournisseur'));
    zone.appendChild(option);

    var boutonExport = bouton('action-large', 'Exporter le fichier', exporter);
    boutonExport.style.marginBottom = '1rem';
    zone.appendChild(boutonExport);

    var message = element('p', 'alerte');
    message.style.display = 'none';
    zone.appendChild(message);

    zone.appendChild(element('p', 'titre-section', 'Aperçu du fichier'));
    var apercu = element('div', 'zone-apercu-export');
    apercu.appendChild(element('p', 'appui', 'Lecture…'));
    zone.appendChild(apercu);
    A.suivreHauteur(apercu);

    Promise.all([C.chargerContexte(), C.chargerReglages(), A.relevesRetenus(),
                 A.bd.fournisseur.toArray()])
      .then(function (r) {
        contexte = r[0];
        reglages = r[1];
        releves = r[2];
        fournisseurs = r[3].filter(function (f) { return !f.fusionne_vers; })
          .sort(function (a, b) { return a.nom.localeCompare(b.nom, 'fr'); });
        poserOnglets();
        poser();
      });

    function poserOnglets() {
      onglets.innerHTML = '';
      var entrees = [['', 'Tout']];
      Object.keys(contexte.familles).forEach(function (k) {
        entrees.push([k, contexte.familles[k].libelle]);
      });
      entrees.forEach(function (e) {
        onglets.appendChild(bouton(familleActive === e[0] ? 'on' : '', e[1], function () {
          familleActive = e[0];
          poserOnglets();
          poser();
        }));
      });
    }

    // Une ligne par produit et par unité : deux unités ne se mélangent jamais.
    function lignesExport() {
      var parProduit = {};
      releves.forEach(function (x) {
        var p = C.ficheConservee(contexte.produits, x.produit_id);
        if (!p) return;
        if (familleActive && p.famille_code !== familleActive) return;
        (parProduit[p.id] = parProduit[p.id] || { produit: p, lignes: [] }).lignes.push(x);
      });

      var out = [];
      Object.keys(parProduit).forEach(function (id) {
        var lot = parProduit[id];
        var parUnite = {};
        lot.lignes.forEach(function (x) {
          (parUnite[x.unite_code] = parUnite[x.unite_code] || []).push(x);
        });

        Object.keys(parUnite).forEach(function (u) {
          var duBloc = parUnite[u];
          var cases = {};
          fournisseurs.forEach(function (f) {
            var siens = duBloc.filter(function (x) {
              var g = C.ficheConservee(contexte.fournisseurs, x.fournisseur_id);
              return g && g.id === f.id;
            });
            cases[f.id] = siens.length ? { prix: moyenne(siens), nombre: siens.length } : null;
          });

          out.push({
            produit: lot.produit,
            unite: contexte.unites[u] || { code: u, libelle: u },
            cases: cases,
            globale: moyenne(duBloc),
            nombre: duBloc.length,
            plusAncien: duBloc.map(function (x) { return String(x.date_prix); }).sort()[0]
          });
        });
      });
      out.sort(function (a, b) { return a.produit.nom.localeCompare(b.produit.nom, 'fr'); });
      return out;

      function moyenne(lot) {
        var somme = 0;
        lot.forEach(function (x) { somme += Number(x.prix_unitaire_ht); });
        return somme / lot.length;
      }
    }

    function entetes() {
      var t = ['Produit', 'Famille', 'Type', 'Unité'];
      fournisseurs.forEach(function (f) {
        t.push(f.nom);
        if (avecNombres) t.push('Relevés ' + f.nom);
      });
      return t.concat(['Moyenne toutes offres', 'Relevés retenus', 'Plus ancien relevé']);
    }

    function poser() {
      apercu.innerHTML = '';
      var lignes = lignesExport();

      if (!lignes.length) {
        apercu.appendChild(element('p', 'vide', 'Aucun produit relevé dans cette famille.'));
        A.ajusterHauteurs();
        return;
      }

      var colonnes = entetes();
      var enveloppe = element('div', 'enveloppe-export');
      var table = document.createElement('table');
      table.className = 'tableau-export';

      var tr = document.createElement('tr');
      colonnes.forEach(function (t, i) {
        var th = document.createElement('th');
        if (i === 0) th.className = 'col-nom';
        th.textContent = t;
        tr.appendChild(th);
      });
      table.appendChild(tr);

      lignes.forEach(function (l) {
        var r = document.createElement('tr');
        cellule(r, l.produit.nom, 'col-nom');
        cellule(r, contexte.familles[l.produit.famille_code]
          ? contexte.familles[l.produit.famille_code].libelle : l.produit.famille_code);
        cellule(r, l.produit.type_code && contexte.types[l.produit.type_code]
          ? contexte.types[l.produit.type_code].libelle : '');
        cellule(r, l.unite.libelle);
        fournisseurs.forEach(function (f) {
          var c = l.cases[f.id];
          cellule(r, c ? C.nombreFrancais(c.prix) : '', c ? 'nombre' : 'rien');
          if (avecNombres) cellule(r, c ? String(c.nombre) : '', c ? 'nombre' : 'rien');
        });
        cellule(r, C.nombreFrancais(l.globale), 'nombre globale');
        cellule(r, String(l.nombre), 'nombre');
        cellule(r, C.dateFrancaise(l.plusAncien));
        table.appendChild(r);
      });

      enveloppe.appendChild(table);
      apercu.appendChild(enveloppe);

      var pied = element('div', 'pied-liste');
      pied.appendChild(element('span', null,
        lignes.length + (lignes.length > 1 ? ' lignes' : ' ligne') + ' · ' +
        colonnes.length + ' colonnes'));
      pied.appendChild(element('span', 'pied-appui', rappelReglages()));
      apercu.appendChild(pied);
      A.ajusterHauteurs();

      function cellule(ligne, texte, classe) {
        var td = document.createElement('td');
        if (classe) td.className = classe;
        td.textContent = texte;
        ligne.appendChild(td);
      }
    }

    function rappelReglages() {
      return 'Un prix est retenu tant qu\'il a moins de : ' +
        Object.keys(contexte.familles).map(function (k) {
          var v = reglages.valeur('duree_validite', k);
          return contexte.familles[k].libelle + ' ' +
                 (v === null ? 'non réglée' : C.nombreFrancais(v, 0) + ' mois');
        }).join(' · ');
    }

    // -----------------------------------------------------------------------
    // Fabrication du classeur
    // -----------------------------------------------------------------------
    function exporter() {
      var lignes = lignesExport();
      if (!lignes.length) return;

      message.textContent = 'Préparation du fichier…';
      message.style.display = 'block';

      chargerBibliotheque().then(function (ExcelJS) {
        var classeur = new ExcelJS.Workbook();
        var feuille = classeur.addWorksheet('Prix moyens', {
          views: [{ state: 'frozen', xSplit: 1, ySplit: 5, showGridLines: false }],
          pageSetup: { orientation: 'landscape' }
        });

        var colonnes = entetes();
        var aujourdhui = new Date();
        var dateTexte = C.dateFrancaise(
          new Date(aujourdhui.getTime() - aujourdhui.getTimezoneOffset() * 60000)
            .toISOString().slice(0, 10));

        titre(1, 'PrixTerrain — prix moyens par fournisseur', 14, true, VERT_FONCE);
        titre(2, 'Édité le ' + dateTexte +
                 (familleActive ? ' · ' + contexte.familles[familleActive].libelle
                                : ' · toutes familles'), 10, false, GRIS);
        titre(3, rappelReglages() + ' · moyennes non pondérées', 10, false, GRIS);

        var ligneEntete = feuille.getRow(5);
        colonnes.forEach(function (t, i) {
          var c = ligneEntete.getCell(i + 1);
          c.value = t;
          c.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF' + VERT_FONCE } };
          c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + VERT_CLAIR } };
          c.alignment = { horizontal: i === 0 ? 'left' : 'center',
                          vertical: 'middle', wrapText: true };
          c.border = bordure();
        });
        ligneEntete.height = 32;

        lignes.forEach(function (l, rang) {
          var r = feuille.getRow(6 + rang);
          var zebre = rang % 2 ? PANNEAU : null;
          var prix = [];
          fournisseurs.forEach(function (f) {
            if (l.cases[f.id]) prix.push(l.cases[f.id].prix);
          });
          var mini = prix.length > 1 ? Math.min.apply(null, prix) : null;

          var col = 1;
          poserCellule(r, col++, l.produit.nom, { gras: true, gauche: true, fond: zebre });
          poserCellule(r, col++, contexte.familles[l.produit.famille_code]
            ? contexte.familles[l.produit.famille_code].libelle : l.produit.famille_code,
            { gauche: true, couleur: GRIS, fond: zebre });
          poserCellule(r, col++, l.produit.type_code && contexte.types[l.produit.type_code]
            ? contexte.types[l.produit.type_code].libelle : '',
            { gauche: true, couleur: GRIS, fond: zebre });
          poserCellule(r, col++, l.unite.libelle, { couleur: GRIS, fond: zebre });

          fournisseurs.forEach(function (f) {
            var c = l.cases[f.id];
            var moinsCher = c && mini !== null && c.prix === mini;
            poserCellule(r, col++, c ? c.prix : null, {
              format: '# ##0.00 €',
              gras: moinsCher,
              couleur: moinsCher ? VERT_FONCE : null,
              fond: moinsCher ? VERT_CLAIR : zebre
            });
            if (avecNombres) {
              poserCellule(r, col++, c ? c.nombre : null, { fond: zebre });
            }
          });

          poserCellule(r, col++, l.globale,
            { format: '# ##0.00 €', gras: true, couleur: VERT_FONCE, fond: zebre });
          poserCellule(r, col++, l.nombre, { fond: zebre });
          poserCellule(r, col++, C.dateFrancaise(l.plusAncien), { couleur: GRIS, fond: zebre });
          r.height = 20;
        });

        var legende = 6 + lignes.length + 1;
        titre(legende, 'Lecture du tableau', 10, true, null);
        [
          'Une ligne par produit et par unité : un produit relevé au litre et au kilo occupe deux lignes.',
          'Cellule verte : le fournisseur le moins cher de la ligne. Cellule vide : aucun relevé de ce produit chez lui.',
          'La moyenne toutes offres réunit les relevés de tous les fournisseurs, sans pondération.',
          'Les colonnes « Relevés retenus » et « Plus ancien relevé » disent sur quoi repose cette moyenne.'
        ].forEach(function (texte, i) {
          titre(legende + 1 + i, texte, 9, false, GRIS);
        });

        largeurs(colonnes.length);
        feuille.autoFilter = {
          from: { row: 5, column: 1 },
          to: { row: 5 + lignes.length, column: colonnes.length }
        };

        return classeur.xlsx.writeBuffer().then(function (tampon) {
          var nom = 'prixterrain-prix-moyens-' +
            new Date().toISOString().slice(0, 10).replace(/-/g, '') + '.xlsx';
          var lien = document.createElement('a');
          lien.href = URL.createObjectURL(new Blob([tampon], {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          }));
          lien.download = nom;
          document.body.appendChild(lien);
          lien.click();
          document.body.removeChild(lien);
          setTimeout(function () { URL.revokeObjectURL(lien.href); }, 1000);
          message.style.display = 'none';
        });

        function bordure() {
          var fin = { style: 'thin', color: { argb: 'FF' + TRAIT } };
          return { left: fin, right: fin, top: fin, bottom: fin };
        }

        function titre(rang, texte, taille, gras, couleur) {
          var c = feuille.getRow(rang).getCell(1);
          c.value = texte;
          c.font = { name: 'Arial', size: taille, bold: !!gras,
                     color: { argb: 'FF' + (couleur || '16181A') } };
        }

        function poserCellule(ligne, colonne, valeur, options) {
          options = options || {};
          var c = ligne.getCell(colonne);
          if (valeur !== null && valeur !== undefined && valeur !== '') c.value = valeur;
          c.font = { name: 'Arial', size: 10, bold: !!options.gras,
                     color: { argb: 'FF' + (options.couleur || '16181A') } };
          if (options.fond) {
            c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + options.fond } };
          }
          c.alignment = { horizontal: options.gauche ? 'left' : 'center', vertical: 'middle' };
          if (options.format) c.numFmt = options.format;
          c.border = bordure();
        }

        function largeurs(nombre) {
          feuille.getColumn(1).width = 26;
          feuille.getColumn(2).width = 20;
          feuille.getColumn(3).width = 18;
          feuille.getColumn(4).width = 8;
          for (var i = 5; i <= nombre - 3; i++) feuille.getColumn(i).width = 13;
          feuille.getColumn(nombre - 2).width = 15;
          feuille.getColumn(nombre - 1).width = 11;
          feuille.getColumn(nombre).width = 14;
        }
      }).catch(function (e) {
        message.textContent = A.messageSimple(e);
        message.style.display = 'block';
      });
    }
  }

  A.afficherExport = afficherExport;
})(window);
