const CACHE_NAME = 'happy-corner-v3';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/styles.css',
  '/loguito.png',
  '/happyfavicon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(ASSETS_TO_CACHE);
      })
      .catch((err) => console.warn('Cache addAll error (continuing anyway):', err))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME) {
            return caches.delete(name);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;
  
  // Skip API calls and external services
  if (!event.request.url.startsWith(self.location.origin)) {
    return;
  }
  
  if (event.request.url.includes('/api/')) {
    return;
  }

  // Network-First strategy
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Check if we received a valid response
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }

        // Clone and cache the new response
        var responseToCache = response.clone();
        caches.open(CACHE_NAME)
          .then(function(cache) {
            cache.put(event.request, responseToCache);
          });

        return response;
      })
      .catch(async () => {
        // If network fails, try to return from cache
        try {
          const cached = await caches.match(event.request);
          if (cached) return cached;
        } catch (e) {}

        // Fallback response so Service Worker doesn't throw TypeError
        return new Response('Network error and not found in offline cache.', {
          status: 503,
          statusText: 'Service Unavailable',
          headers: { 'Content-Type': 'text/plain' }
        });
      })
  );
});
