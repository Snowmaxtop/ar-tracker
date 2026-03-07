// ═══════════════════════════════════════════════════════════════════════════
// SERVICE WORKER — Pokémon AR/SAR Tracker PWA  v6
// ═══════════════════════════════════════════════════════════════════════════

const CACHE_VERSION = 'ar-tracker-v8';

// Tout ce qui est externe → toujours réseau, jamais mis en cache par le SW
// (images, APIs, polices, flags…)
const NETWORK_ONLY_HOSTS = [
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'flagcdn.com',
  'www.cardmarket.com',
  'api.anthropic.com',
  'api.github.com',
  'generativelanguage.googleapis.com',   // Gemini API (scan)
  'limitlesstcg.nyc3.cdn.digitaloceanspaces.com', // images cartes
  'www.serebii.net',                     // images cartes (fallback)
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

  // Laisser passer toutes les requêtes non-GET sans interception
  if (event.request.method !== 'GET') return;

  // Domaines externes → réseau direct, sans cache SW
  if (NETWORK_ONLY_HOSTS.some(function(h) { return url.hostname.includes(h); })) {
    event.respondWith(fetch(event.request));
    return;
  }    return;
  }

  // index.html → network-first (toujours la version la plus récente)
  if (url.pathname.endsWith('/') || url.pathname.endsWith('index.html') || url.pathname === '/ar-tracker/') {
    event.respondWith(
      fetch(event.request).then(function(response) {
        var clone = response.clone();
        caches.open(CACHE_VERSION).then(function(cache) { cache.put(event.request, clone); });
        return response;
      }).catch(function() { return caches.match(event.request); })
    );
    return;
  }

  // sw.js, manifest → toujours réseau (jamais mis en cache)
  if (url.pathname.includes('sw.js') || url.pathname.includes('manifest')) {
    event.respondWith(fetch(event.request).catch(function() { return new Response('', {status: 503}); }));
    return;
  }

  // Autres assets locaux (sw.js exclu) → cache-first
  event.respondWith(
    caches.match(event.request).then(function(cached) {
      if (cached) return cached;
      return fetch(event.request).then(function(response) {
        if (!response || response.status !== 200) return response;
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
