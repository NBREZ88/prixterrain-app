// PrixTerrain — consultation par produit : relevés, moyenne, évolution.
//
// Aucun seuil, aucune durée, aucun coefficient n'est écrit ici : chacun est lu
// dans la table des réglages. Quand une ligne de réglage est vide, l'écran
// affiche le nom du réglage manquant et la conduite tenue à défaut.

(function (global) {
  'use strict';

  var A = global.PrixTerrain;
  var JOURS_PAR_MOIS = 30.4375;

  var COULEURS = ['#2f6f3e', '#b35c00', '#2b5c8a', '#7a3b7a', '#8a6f00', '#8a2f2f'];

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

  function dateFrancaise(iso) {
    if (!iso) return '';
    var p = String(iso).slice(0, 10).split('-');
    return p[2] + '/' + p[1] + '/' + p[0];
  }

  function nombreFrancais(valeur, decimales) {
    return Number(valeur).toLocaleString('fr-FR', {
      minimumFractionDigits: decimales === undefined ? 2 : decimales,
      maximumFractionDigits: decimales === undefined ? 2 : decimales
    });
  }

  function ageEnMois(datePrix, aujourdhui) {
    var jours = (aujourdhui - new Date(String(datePrix).slice(0, 10) + 'T00:00:00')) / 86400000;
    return jours / JOURS_PAR_MOIS;
  }

  function mediane(valeurs) {
    if (!valeurs.length) return null;
    var triees = valeurs.slice().sort(function (a, b) { return a - b; });
    var milieu = Math.floor(triees.length / 2);
    if (triees.length % 2) return triees[milieu];
    return (triees[milieu - 1] + triees[milieu]) / 2;
  }

  // -------------------------------------------------------------------------
  // Réglages
  // -------------------------------------------------------------------------
  function chargerReglages() {
    return A.bd.reglage.toArray().then(function (lignes) {
      var table = {};
      lignes.forEach(function (l) {
        table[l.cle + '|' + (l.famille_code || '')] = l;
      });
      return {
        lire: function (cle, famille) {
          return table[cle + '|' + (famille || '')] || null;
        },
        valeur: function (cle, famille) {
          var l = table[cle + '|' + (famille || '')];
          if (!l || l.valeur === null || l.valeur === undefined) return null;
          return Number(l.valeur);
        }
      };
    });
  }

  function encartReglageManquant(reglages, cle, famille) {
    var ligne = reglages.lire(cle, famille);
    var encart = element('div', 'manquant');
    encart.appendChild(element('p', 'manquant-nom',
      'Réglage non renseigné : ' + (ligne ? ligne.libelle : cle)));
    if (ligne) encart.appendChild(element('p', 'manquant-suite', ligne.conduite_si_vide));
    return encart;
  }

  // -------------------------------------------------------------------------
  // Relevés d'un produit
  // -------------------------------------------------------------------------
  function chargerContexte() {
    return Promise.all([
      A.bd.produit.toArray(),
      A.bd.fournisseur.toArray(),
      A.bd.agriculteur.toArray(),
      A.bd.unite_prix.toArray(),
      A.bd.famille_produit.toArray(),
      A.bd.profil.toArray()
    ]).then(function (r) {
      function parIdentifiant(lignes, cle) {
        var t = {};
        lignes.forEach(function (l) { t[l[cle || 'id']] = l; });
        return t;
      }
      return {
        produits: parIdentifiant(r[0]),
        fournisseurs: parIdentifiant(r[1]),
        agriculteurs: parIdentifiant(r[2]),
        unites: parIdentifiant(r[3], 'code'),
        familles: parIdentifiant(r[4], 'code'),
        profils: parIdentifiant(r[5])
      };
    });
  }

  // Suit fusionne_vers jusqu'à la fiche conservée.
  function ficheConservee(table, id) {
    var vue = {};
    var courante = table[id];
    while (courante && courante.fusionne_vers && !vue[courante.id]) {
      vue[courante.id] = true;
      courante = table[courante.fusionne_vers];
    }
    return courante || null;
  }

  function relevesDuProduit(produitId, contexte) {
    return A.relevesRetenus().then(function (tous) {
      return tous.filter(function (r) {
        var p = ficheConservee(contexte.produits, r.produit_id);
        return p && p.id === produitId;
      });
    });
  }

  // -------------------------------------------------------------------------
  // Agrégats
  // -------------------------------------------------------------------------
  function calculerAgregats(releves, contexte, reglages, famille, options) {
    var grouper = (options && options.grouper) || function (r, ctx) {
      var f = ficheConservee(ctx.fournisseurs, r.fournisseur_id);
      return { id: f ? f.id : 'inconnu', nom: f ? f.nom : 'Fournisseur non retrouvé' };
    };
    var aujourdhui = new Date();
    var validite = reglages.valeur('duree_validite', famille);
    var exclusion = reglages.valeur('anciennete_exclusion', famille);
    var minimum = reglages.valeur('nombre_minimal_releves', '');
    var decote = reglages.valeur('decote_mensuelle', '');

    var retenus = releves.filter(function (r) {
      var age = ageEnMois(r.date_prix, aujourdhui);
      if (validite !== null && age > validite) return false;
      if (exclusion !== null && age > exclusion) return false;
      return true;
    });

    // Médiane par unité, tous fournisseurs confondus, pour le signalement.
    var parUnite = {};
    retenus.forEach(function (r) {
      if (!parUnite[r.unite_code]) parUnite[r.unite_code] = [];
      parUnite[r.unite_code].push(Number(r.prix_unitaire_ht));
    });
    var medianes = {};
    Object.keys(parUnite).forEach(function (u) { medianes[u] = mediane(parUnite[u]); });

    // Regroupement par fournisseur conservé puis par unité.
    var groupes = {};
    retenus.forEach(function (r) {
      var g = grouper(r, contexte) || { id: '*', nom: '' };
      var cle = g.id + '|' + r.unite_code;
      if (!groupes[cle]) {
        groupes[cle] = {
          nomGroupe: g.nom,
          unite: contexte.unites[r.unite_code] || { code: r.unite_code, libelle: r.unite_code },
          releves: []
        };
      }
      groupes[cle].releves.push(r);
    });

    var lignes = Object.keys(groupes).map(function (cle) {
      var g = groupes[cle];
      var n = g.releves.length;
      var plusAncien = g.releves.reduce(function (m, r) {
        return (!m || r.date_prix < m) ? r.date_prix : m;
      }, null);

      var calculable = validite !== null && minimum !== null && n >= minimum && n > 0 && plusAncien;
      var moyenne = null;
      if (calculable) {
        var sommePoids = 0;
        var sommeValeurs = 0;
        g.releves.forEach(function (r) {
          var poids = decote === null ? 1 : Math.pow(1 - decote, ageEnMois(r.date_prix, aujourdhui));
          sommePoids += poids;
          sommeValeurs += Number(r.prix_unitaire_ht) * poids;
        });
        moyenne = sommePoids > 0 ? sommeValeurs / sommePoids : null;
        if (moyenne === null) calculable = false;
      }

      return {
        nomGroupe: g.nomGroupe,
        unite: g.unite,
        nombre: n,
        plusAncien: plusAncien,
        moyenne: moyenne,
        calculable: calculable,
        pondere: decote !== null,
        releves: g.releves.slice().sort(function (a, b) {
          return String(b.date_prix).localeCompare(String(a.date_prix));
        })
      };
    });

    lignes.sort(function (a, b) {
      if (a.nomGroupe !== b.nomGroupe) return a.nomGroupe.localeCompare(b.nomGroupe, 'fr');
      return a.unite.code.localeCompare(b.unite.code);
    });

    return {
      retenus: retenus,
      lignes: lignes,
      medianes: medianes,
      validiteAbsente: validite === null,
      minimumAbsent: minimum === null,
      seuilAtypique: reglages.valeur('ecart_atypique', ''),
      decote: decote
    };
  }

  // -------------------------------------------------------------------------
  // Courbe d'évolution, une par unité, une ligne par fournisseur
  // -------------------------------------------------------------------------
  function courbe(releves, contexte, unite) {
    var points = releves.filter(function (r) { return r.unite_code === unite.code; });
    if (points.length < 2) return null;

    var largeur = 700, hauteur = 260;
    var marge = { haut: 16, droite: 12, bas: 34, gauche: 62 };

    var dates = points.map(function (r) { return new Date(String(r.date_prix).slice(0, 10)).getTime(); });
    var prix = points.map(function (r) { return Number(r.prix_unitaire_ht); });
    var dateMin = Math.min.apply(null, dates), dateMax = Math.max.apply(null, dates);
    var prixMin = Math.min.apply(null, prix), prixMax = Math.max.apply(null, prix);
    if (dateMax === dateMin) dateMax = dateMin + 86400000;
    if (prixMax === prixMin) { prixMax = prixMin + 1; prixMin = Math.max(0, prixMin - 1); }

    function x(t) {
      return marge.gauche + (t - dateMin) / (dateMax - dateMin) * (largeur - marge.gauche - marge.droite);
    }
    function y(p) {
      return hauteur - marge.bas - (p - prixMin) / (prixMax - prixMin) * (hauteur - marge.haut - marge.bas);
    }

    var svg = global.document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 ' + largeur + ' ' + hauteur);
    svg.setAttribute('class', 'courbe');
    svg.setAttribute('role', 'img');

    function tracer(balise, attributs, texte) {
      var e = global.document.createElementNS('http://www.w3.org/2000/svg', balise);
      Object.keys(attributs).forEach(function (a) { e.setAttribute(a, attributs[a]); });
      if (texte !== undefined) e.textContent = texte;
      svg.appendChild(e);
      return e;
    }

    tracer('line', { x1: marge.gauche, y1: hauteur - marge.bas, x2: largeur - marge.droite,
                     y2: hauteur - marge.bas, stroke: '#999' });
    tracer('line', { x1: marge.gauche, y1: marge.haut, x2: marge.gauche,
                     y2: hauteur - marge.bas, stroke: '#999' });
    tracer('text', { x: 4, y: y(prixMax) + 4, 'font-size': 12, fill: '#444' }, nombreFrancais(prixMax));
    tracer('text', { x: 4, y: y(prixMin) + 4, 'font-size': 12, fill: '#444' }, nombreFrancais(prixMin));
    tracer('text', { x: marge.gauche, y: hauteur - 10, 'font-size': 12, fill: '#444' },
           dateFrancaise(new Date(dateMin).toISOString()));
    tracer('text', { x: largeur - marge.droite, y: hauteur - 10, 'font-size': 12, fill: '#444',
                     'text-anchor': 'end' }, dateFrancaise(new Date(dateMax).toISOString()));

    var parFournisseur = {};
    points.forEach(function (r) {
      var f = ficheConservee(contexte.fournisseurs, r.fournisseur_id);
      var nom = f ? f.nom : 'Fournisseur non retrouvé';
      if (!parFournisseur[nom]) parFournisseur[nom] = [];
      parFournisseur[nom].push(r);
    });

    var noms = Object.keys(parFournisseur).sort(function (a, b) { return a.localeCompare(b, 'fr'); });
    var legende = element('div', 'legende');

    noms.forEach(function (nom, rang) {
      var couleur = COULEURS[rang % COULEURS.length];
      var serie = parFournisseur[nom].slice().sort(function (a, b) {
        return String(a.date_prix).localeCompare(String(b.date_prix));
      });
      var chemin = serie.map(function (r, i) {
        var t = new Date(String(r.date_prix).slice(0, 10)).getTime();
        return (i ? 'L' : 'M') + x(t).toFixed(1) + ' ' + y(Number(r.prix_unitaire_ht)).toFixed(1);
      }).join(' ');
      if (serie.length > 1) {
        tracer('path', { d: chemin, fill: 'none', stroke: couleur, 'stroke-width': 2 });
      }
      serie.forEach(function (r) {
        var t = new Date(String(r.date_prix).slice(0, 10)).getTime();
        tracer('circle', { cx: x(t).toFixed(1), cy: y(Number(r.prix_unitaire_ht)).toFixed(1),
                           r: 4, fill: couleur });
      });
      var entree = element('span', 'legende-entree');
      var pastille = element('span', 'pastille');
      pastille.style.background = couleur;
      entree.appendChild(pastille);
      entree.appendChild(element('span', null, nom));
      legende.appendChild(entree);
    });

    var bloc = element('div', 'bloc-courbe');
    bloc.appendChild(element('p', 'titre-bloc', 'Évolution des relevés en ' + unite.libelle));
    bloc.appendChild(svg);
    bloc.appendChild(legende);
    return bloc;
  }

  // -------------------------------------------------------------------------
  // Écran
  // -------------------------------------------------------------------------
  function afficherFicheProduit(zone, compte, parametres) {
    var produit = parametres.fiche;
    var contexte = null;
    var reglages = null;

    var detail = element('div');
    zone.innerHTML = '';
    zone.appendChild(detail);
    detail.appendChild(element('p', 'appui', 'Lecture des relevés…'));

    Promise.all([chargerContexte(), chargerReglages()]).then(function (r) {
      contexte = r[0];
      reglages = r[1];
      afficherProduit(produit);
    });

    function afficherProduit(produit) {
      detail.innerHTML = '';
      detail.appendChild(element('p', null, 'Lecture des relevés…'));

      relevesDuProduit(produit.id, contexte).then(function (releves) {
        detail.innerHTML = '';

        var famille = contexte.familles[produit.famille_code];
        var entete = element('div', 'entete-produit');
        entete.appendChild(element('h2', null, produit.nom));
        entete.appendChild(element('p', 'appui',
          (famille ? famille.libelle : produit.famille_code) +
          (produit.segment ? ' — ' + produit.segment : '')));
        detail.appendChild(entete);

        if (!releves.length) {
          detail.appendChild(element('p', 'confirmation',
            'Aucun relevé pour ce produit. Il figure au catalogue, son prix n\'a pas encore été relevé.'));
          return;
        }

        var resultat = calculerAgregats(releves, contexte, reglages, produit.famille_code);

        if (resultat.validiteAbsente) {
          detail.appendChild(encartReglageManquant(reglages, 'duree_validite', produit.famille_code));
        }
        if (resultat.minimumAbsent) {
          detail.appendChild(encartReglageManquant(reglages, 'nombre_minimal_releves', ''));
        }
        if (reglages.valeur('anciennete_exclusion', produit.famille_code) === null) {
          detail.appendChild(encartReglageManquant(reglages, 'anciennete_exclusion', produit.famille_code));
        }
        if (resultat.decote === null) {
          detail.appendChild(encartReglageManquant(reglages, 'decote_mensuelle', ''));
        }
        if (resultat.seuilAtypique === null) {
          detail.appendChild(encartReglageManquant(reglages, 'ecart_atypique', ''));
        }

        resultat.lignes.forEach(function (ligne) {
          detail.appendChild(carteGroupe(ligne, resultat, contexte, 'profils', 'saisi_par'));
        });

        var unitesVues = {};
        resultat.retenus.forEach(function (r) { unitesVues[r.unite_code] = true; });
        Object.keys(unitesVues).forEach(function (code) {
          var unite = contexte.unites[code] || { code: code, libelle: code };
          var bloc = courbe(resultat.retenus, contexte, unite);
          if (bloc) detail.appendChild(bloc);
        });
      });
    }

    function carteGroupe(ligne, resultat, contexte, tableTiers, colonneTiers) {
      var carte = element('div', 'groupe');
      if (ligne.nomGroupe) carte.appendChild(element('p', 'titre-bloc', ligne.nomGroupe));

      if (ligne.calculable) {
        carte.appendChild(element('p', 'valeur-moyenne',
          nombreFrancais(ligne.moyenne) + ' ' + ligne.unite.libelle +
          ' — moyenne ' + (ligne.pondere ? 'pondérée' : 'non pondérée') +
          ' de ' + ligne.nombre + (ligne.nombre > 1 ? ' relevés' : ' relevé') +
          ' — plus ancien : ' + dateFrancaise(ligne.plusAncien)));
      } else {
        carte.appendChild(element('p', 'valeur-absente',
          'Moyenne non calculable en ' + ligne.unite.libelle + ' — ' +
          ligne.nombre + (ligne.nombre > 1 ? ' relevés' : ' relevé') +
          ' — plus ancien : ' + dateFrancaise(ligne.plusAncien)));
      }

      var liste = element('ul', 'liste-releves');
      ligne.releves.forEach(function (r) {
        var tiers = ficheConservee(contexte[tableTiers], r[colonneTiers]);
        var texte = dateFrancaise(r.date_prix) + ' — ' +
                    nombreFrancais(r.prix_unitaire_ht) + ' ' + ligne.unite.libelle +
                    ' — relevé par ' + (tiers ? tiers.nom : 'compte non retrouvé');
        var item = element('li', null, texte);

        if (ligne.calculable && resultat.seuilAtypique !== null) {
          var med = resultat.medianes[ligne.unite.code];
          if (med) {
            var ecart = Math.abs(Number(r.prix_unitaire_ht) - med) / med * 100;
            if (ecart > resultat.seuilAtypique) {
              item.className = 'atypique';
              item.appendChild(element('span', 'marque',
                ' à vérifier : ' + nombreFrancais(ecart, 0) + ' % d\'écart au prix médian'));
            }
          }
        }
        if (r.commentaire) item.appendChild(element('span', 'appui', r.commentaire));
        liste.appendChild(item);
      });
      carte.appendChild(liste);
      return carte;
    }
  }

  A.calculs = {
    chargerContexte: chargerContexte,
    chargerReglages: chargerReglages,
    calculerAgregats: calculerAgregats,
    encartReglageManquant: encartReglageManquant,
    ficheConservee: ficheConservee,
    dateFrancaise: dateFrancaise,
    nombreFrancais: nombreFrancais,
    element: element,
    bouton: bouton
  };

  A.afficherFicheProduit = afficherFicheProduit;
})(window);
