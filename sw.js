// ═══════════════════════════════════════════════════════════════════════════
// SERVICE WORKER — AR Tracker  v2  (offline-first)
// ═══════════════════════════════════════════════════════════════════════════

const CACHE_SHELL   = 'ar-shell-v2';
const CACHE_IMAGES  = 'ar-images-v2';

// Fichiers de l'app à mettre en cache immédiatement à l'installation
const SHELL_FILES = [
  './',
  './index.html',
  'https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Mono:wght@400;500&family=DM+Sans:wght@300;400;500&display=swap',
  'https://fonts.gstatic.com/s/bebasneue/v14/JTUSjIg69CK48gW7PXooxW5rygbi49c.woff2',
];

// ── INSTALL : met en cache les fichiers de l'app ─────────────────────────
self.addEventListener('install', function(event) {
  console.log('[SW] Install');
  event.waitUntil(
    caches.open(CACHE_SHELL).then(function(cache) {
      // On ajoute un par un pour ne pas bloquer si une font échoue
      return Promise.allSettled(
        SHELL_FILES.map(function(url) {
          return cache.add(url).catch(function(e) {
            console.warn('[SW] Impossible de cacher:', url, e.message);
          });
        })
      );
    }).then(function() {
      return self.skipWaiting();
    })
  );
});

// ── ACTIVATE : supprime les vieux caches ─────────────────────────────────
self.addEventListener('activate', function(event) {
  console.log('[SW] Activate');
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) {
          return k !== CACHE_SHELL && k !== CACHE_IMAGES;
        }).map(function(k) {
          console.log('[SW] Suppression ancien cache:', k);
          return caches.delete(k);
        })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

// ── FETCH : stratégie selon le type de requête ────────────────────────────
self.addEventListener('fetch', function(event) {
  var url = event.request.url;

  // 1. API GitHub Gist → toujours réseau (données cloud), jamais mis en cache
  if (url.includes('api.github.com')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // 2. CardMarket → toujours réseau (extension gère ça)
  if (url.includes('cardmarket.com')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // 3. Images cartes (Limitless CDN, efour, pokemoncardcn) → cache-first
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
            if (response && response.status === 200) {
              cache.put(event.request, response.clone());
            }
            return response;
          }).catch(function() {
            // Offline + image pas encore cachée → retourne rien (placeholder CSS prend le relais)
            return new Response('', { status: 404 });
          });
        });
      })
    );
    return;
  }

  // 4. Polices Google Fonts → cache-first
  if (url.includes('fonts.googleapis.com') || url.includes('fonts.gstatic.com')) {
    event.respondWith(
      caches.open(CACHE_SHELL).then(function(cache) {
        return cache.match(event.request).then(function(cached) {
          if (cached) return cached;
          return fetch(event.request).then(function(response) {
            if (response && response.status === 200) {
              cache.put(event.request, response.clone());
            }
            return response;
          }).catch(function() {
            return new Response('', { status: 404 });
          });
        });
      })
    );
    return;
  }

  // 5. App shell (index.html et assets) → cache-first, réseau en fallback
  event.respondWith(
    caches.open(CACHE_SHELL).then(function(cache) {
      return cache.match(event.request).then(function(cached) {
        var networkFetch = fetch(event.request).then(function(response) {
          if (response && response.status === 200) {
            cache.put(event.request, response.clone());
          }
          return response;
        }).catch(function() {
          return cached || new Response('App hors ligne — ouvre d\'abord avec une connexion.', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          });
        });
        // Retourne le cache immédiatement si dispo, met à jour en arrière-plan
        return cached || networkFetch;
      });
    })
  );
});
