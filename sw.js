// PrixTerrain — copie de l'application conservée sur l'appareil.
// Permet d'ouvrir l'application sans réseau, y compris après fermeture complète.
// À chaque lot livré, changer le numéro de VERSION ci-dessous : c'est ce qui
// déclenche le remplacement de la copie sur les appareils des conseillers.

var VERSION = 'prixterrain-27';

var FICHIERS = [
  './',
  './configuration.js',
  './base.js',
  './saisie.js',
  './accueil.js',
  './rapprochement.js',
  './consultation.js',
  './tiers.js',
  './reglages.js',
  './export.js',
  './comptes.js',
  './outils.js',
  './programmes.js',
  './dexie.min.js',
  './supabase.js',
  './manifeste.json',
  './icone-192.png',
  './icone-512.png'
];

self.addEventListener('install', function (evenement) {
  evenement.waitUntil(
    caches.open(VERSION)
      .then(function (copie) { return copie.addAll(FICHIERS); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (evenement) {
  evenement.waitUntil(
    caches.keys()
      .then(function (noms) {
        return Promise.all(noms.map(function (nom) {
          if (nom !== VERSION) return caches.delete(nom);
        }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (evenement) {
  var demande = evenement.request;

  // Les échanges avec la base d'équipe ne sont jamais conservés : un prix
  // rapatrié doit être le prix réel, jamais une copie d'hier.
  if (demande.method !== 'GET' || demande.url.indexOf('supabase.co') >= 0) return;

  // Fichiers de l'application : la copie de l'appareil d'abord, ce qui rend
  // l'ouverture immédiate et possible sans réseau.
  evenement.respondWith(
    caches.match(demande).then(function (trouve) {
      if (trouve) return trouve;
      return fetch(demande)
        .then(function (reponse) {
          if (reponse && reponse.status === 200 && reponse.type === 'basic') {
            var double = reponse.clone();
            caches.open(VERSION).then(function (copie) { copie.put(demande, double); });
          }
          return reponse;
        })
        .catch(function () {
          if (demande.mode === 'navigate') return caches.match('./index.html');
          throw new Error('Ressource indisponible sans réseau.');
        });
    })
  );
});
