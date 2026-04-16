// Blueprint Map — Service Worker (stale-while-revalidate)
// Serves cached assets instantly, fetches fresh copies in background,
// notifies the page when an update is ready.

const CACHE_NAME = 'bp-v2';

const LOCAL_ASSETS = [
  '/',
  '/index.html',
  '/css/style.css',
  '/js/auth.js',
  '/js/type-library.js',
  '/js/parser.js',
  '/js/renderer.js',
  '/js/ai.js',
  '/js/app.js',
];

// Install: pre-cache the app shell so first offline visit works
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(LOCAL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate: clean old caches, take control immediately
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch: stale-while-revalidate for local assets, network-first for everything else
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Only intercept same-origin GET requests
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;

  // Strip ?v= cache-bust param for cache key matching
  const cleanUrl = url.pathname;
  const isLocalAsset = LOCAL_ASSETS.includes(cleanUrl);

  if (isLocalAsset) {
    e.respondWith(staleWhileRevalidate(e.request, cleanUrl));
  }
  // Let everything else (CDN scripts, fonts, API calls) go to network normally
});

async function staleWhileRevalidate(request, cleanUrl) {
  const cache = await caches.open(CACHE_NAME);

  // Try cache first for instant load
  const cached = await cache.match(cleanUrl);

  // Fetch fresh copy in background
  const networkPromise = fetch(request).then(async (response) => {
    if (!response.ok) return response;

    // Compare with cached version — if different, store and notify
    const freshBody = await response.clone().text();

    if (cached) {
      const cachedBody = await cached.clone().text();
      if (freshBody !== cachedBody) {
        // Store the new version
        await cache.put(cleanUrl, response.clone());
        // Notify all clients that an update landed
        const clients = await self.clients.matchAll();
        clients.forEach(client => client.postMessage({ type: 'UPDATE_AVAILABLE' }));
        return response;
      }
    }

    // First visit or same content — just update cache silently
    await cache.put(cleanUrl, response.clone());
    return response;
  }).catch(() => null); // Network failure — cached version still served

  if (cached) {
    // Serve stale immediately, revalidate in background
    networkPromise; // fire-and-forget
    return cached;
  }

  // No cache — wait for network
  const response = await networkPromise;
  return response || new Response('Offline', { status: 503 });
}
