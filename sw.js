// ═══════════════════════════════════════════════════════════════════════════
// SERVICE WORKER — Pokémon AR/SAR Tracker PWA
// Network-first pour index.html, cache-first pour les assets
// ═══════════════════════════════════════════════════════════════════════════

const CACHE_VERSION = 'ar-tracker-v3';

const NETWORK_ONLY_HOSTS = [
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'flagcdn.com',
  'www.cardmarket.com',
  'api.anthropic.com',
];

self.addEventListener('install', function() {
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE_VERSION; })
            .map(function(k) { return caches.delete(k); })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', function(event) {
  const url = new URL(event.request.url);

  if (NETWORK_ONLY_HOSTS.some(function(h) { return url.hostname.includes(h); })) {
    event.respondWith(fetch(event.request).catch(function() { return caches.match(event.request); }));
    return;
  }

  // Network-first pour index.html
  if (url.pathname.endsWith('/') || url.pathname.endsWith('index.html')) {
    event.respondWith(
      fetch(event.request).then(function(response) {
        var clone = response.clone();
        caches.open(CACHE_VERSION).then(function(cache) { cache.put(event.request, clone); });
        return response;
      }).catch(function() { return caches.match(event.request); })
    );
    return;
  }

  // Cache-first pour les autres assets
  event.respondWith(
    caches.match(event.request).then(function(cached) {
      if (cached) return cached;
      return fetch(event.request).then(function(response) {
        if (!response || response.status !== 200 || event.request.method !== 'GET') return response;
        var clone = response.clone();
        caches.open(CACHE_VERSION).then(function(cache) { cache.put(event.request, clone); });
        return response;
      });
    })
  );
});

self.addEventListener('message', function(event) {
  if (event.data === 'skipWaiting') self.skipWaiting();
});
