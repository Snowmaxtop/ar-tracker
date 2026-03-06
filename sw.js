// ═══════════════════════════════════════════════════════════════════════════
// SERVICE WORKER — Pokémon AR/SAR Tracker PWA
// Stratégie : Cache-first pour les assets locaux, Network-first pour l'externe
// ═══════════════════════════════════════════════════════════════════════════

const CACHE_NAME   = 'ar-tracker-v1';
const CACHE_STATIC = 'ar-tracker-static-v1';

// Assets locaux à mettre en cache immédiatement
const PRECACHE = [
  './index.html',
  './manifest.json',
  './icons/icon-192x192.png',
  './icons/icon-512x512.png',
];

// Domaines externes — Network-first (flags, fonts, CardMarket)
const NETWORK_FIRST_HOSTS = [
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'flagcdn.com',
  'www.cardmarket.com',
  'api.anthropic.com',
];

// ── Install : pré-cache les assets locaux ──
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_STATIC).then(function(cache) {
      return cache.addAll(PRECACHE);
    }).then(function() {
      return self.skipWaiting();
    })
  );
});

// ── Activate : supprime les vieux caches ──
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE_STATIC && k !== CACHE_NAME; })
            .map(function(k) { return caches.delete(k); })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

// ── Fetch : stratégie hybride ──
self.addEventListener('fetch', function(event) {
  const url = new URL(event.request.url);

  // Toujours réseau pour les domaines externes
  if (NETWORK_FIRST_HOSTS.some(function(h) { return url.hostname.includes(h); })) {
    event.respondWith(
      fetch(event.request).catch(function() {
        return caches.match(event.request);
      })
    );
    return;
  }

  // Cache-first pour les assets locaux
  event.respondWith(
    caches.match(event.request).then(function(cached) {
      if (cached) return cached;
      return fetch(event.request).then(function(response) {
        // Ne pas cacher les réponses non-OK ou les requêtes POST
        if (!response || response.status !== 200 || event.request.method !== 'GET') {
          return response;
        }
        const clone = response.clone();
        caches.open(CACHE_NAME).then(function(cache) {
          cache.put(event.request, clone);
        });
        return response;
      });
    })
  );
});
