// ═══════════════════════════════════════════════════════════════════════════
// SERVICE WORKER — AR Tracker  v3  (offline-first + précache images trackées)
// ═══════════════════════════════════════════════════════════════════════════

const CACHE_SHELL   = 'ar-shell-v3';
const CACHE_IMAGES  = 'ar-images-v3';

const SHELL_FILES = [
  './',
  './index.html',
  'https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Mono:wght@400;500&family=DM+Sans:wght@300;400;500&display=swap',
];

// ── INSTALL ──────────────────────────────────────────────────────────────
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_SHELL).then(function(cache) {
      return Promise.allSettled(
        SHELL_FILES.map(function(url) {
          return cache.add(url).catch(function(e) {
            console.warn('[SW] Cache shell failed:', url, e.message);
          });
        })
      );
    }).then(function() { return self.skipWaiting(); })
  );
});

// ── ACTIVATE ─────────────────────────────────────────────────────────────
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) {
          return k !== CACHE_SHELL && k !== CACHE_IMAGES;
        }).map(function(k) { return caches.delete(k); })
      );
    }).then(function() { return self.clients.claim(); })
  );
});

// ── MESSAGE : précache une liste d'URLs d'images ─────────────────────────
self.addEventListener('message', function(event) {
  if (!event.data || event.data.type !== 'CACHE_IMAGES') return;
  var urls = event.data.urls || [];
  if (!urls.length) return;

  caches.open(CACHE_IMAGES).then(function(cache) {
    return Promise.allSettled(
      urls.map(function(url) {
        return cache.match(url).then(function(cached) {
          if (cached) return;
          return fetch(url).then(function(response) {
            if (response && response.status === 200) cache.put(url, response);
          }).catch(function() {});
        });
      })
    );
  }).then(function() {
    console.log('[SW] Précache images terminé (' + urls.length + ' URLs)');
  });
});

// ── FETCH ─────────────────────────────────────────────────────────────────
self.addEventListener('fetch', function(event) {
  var url = event.request.url;

  if (url.includes('api.github.com') || url.includes('cardmarket.com')) {
    event.respondWith(fetch(event.request));
    return;
  }

  if (
    url.includes('limitlesstcg.nyc3.cdn') ||
    url.includes('efour.b-cdn.net') ||
    url.includes('pokemoncardcn.com') ||
    url.includes('flagcdn.com')
  ) {
    event.respondWith(
      caches.open(CACHE_IMAGES).then(function(cache) {
        return cache.match(event.request).then(function(cached) {
          if (cached) return cached;
          return fetch(event.request).then(function(response) {
            if (response && response.status === 200) cache.put(event.request, response.clone());
            return response;
          }).catch(function() { return new Response('', { status: 404 }); });
        });
      })
    );
    return;
  }

  if (url.includes('fonts.googleapis.com') || url.includes('fonts.gstatic.com')) {
    event.respondWith(
      caches.open(CACHE_SHELL).then(function(cache) {
        return cache.match(event.request).then(function(cached) {
          if (cached) return cached;
          return fetch(event.request).then(function(response) {
            if (response && response.status === 200) cache.put(event.request, response.clone());
            return response;
          }).catch(function() { return new Response('', { status: 404 }); });
        });
      })
    );
    return;
  }

  event.respondWith(
    caches.open(CACHE_SHELL).then(function(cache) {
      return cache.match(event.request).then(function(cached) {
        var networkFetch = fetch(event.request).then(function(response) {
          if (response && response.status === 200) cache.put(event.request, response.clone());
          return response;
        }).catch(function() {
          return cached || new Response('App hors ligne — ouvre d\'abord avec une connexion.', {
            status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' }
          });
        });
        return cached || networkFetch;
      });
    })
  );
});
