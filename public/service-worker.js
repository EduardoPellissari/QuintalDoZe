const CACHE_VERSION = 'qz-pwa-v7';
const APP_SHELL = [
  '/',
  '/?app=pwa',
  '/index.html',
  '/admin.html',
  '/garcom.html',
  '/cozinha.html',
  '/caixa.html',
  '/pdf-viewer.html',
  '/styles.css',
  '/manifest.webmanifest',
  '/offline.html',
  '/js/textos.js',
  '/js/common.js',
  '/js/login.js',
  '/js/admin.js',
  '/js/garcom.js',
  '/js/cozinha.js',
  '/js/caixa.js',
  '/js/pdf-viewer.js',
  '/assets/logo.jpg',
  '/assets/background.jpg',
  '/assets/sidebar-bg.jpg',
  '/assets/icons/icon-192.png',
  '/assets/icons/icon-512.png',
  '/assets/icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  // Dados de pedidos, caixa e usuários precisam ser sempre em tempo real.
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(request));
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, '/offline.html'));
    return;
  }

  event.respondWith(staleWhileRevalidate(request));
});

async function networkFirst(request, fallbackUrl) {
  const cache = await caches.open(CACHE_VERSION);

  try {
    const fresh = await fetch(request);
    if (fresh.ok) cache.put(request, fresh.clone());
    return fresh;
  } catch (error) {
    return (await cache.match(request)) || cache.match(fallbackUrl);
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_VERSION);
  const cached = await cache.match(request);
  const freshPromise = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached);

  return cached || freshPromise;
}
