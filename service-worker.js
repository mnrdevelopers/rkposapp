/**
 * RK FASHIONS — PWA Service Worker
 * Offline application shell caching with Stale-While-Revalidate strategy.
 */

const CACHE_NAME = 'rk-fashions-pos-v1.2';

const PRECACHE_ASSETS = [
  './',
  './index.html',
  './login.html',
  './dashboard.html',
  './products.html',
  './product-form.html',
  './barcode.html',
  './sale.html',
  './sales-history.html',
  './reports.html',
  './settings.html',
  './manifest.json',
  './css/bootstrap.min.css',
  './css/fontawesome.min.css',
  './css/style.css',
  './css/print.css',
  './webfonts/fa-solid-900.woff2',
  './webfonts/fa-brands-400.woff2',
  './webfonts/fa-regular-400.woff2',
  './js/lib/bootstrap.bundle.min.js',
  './js/lib/jsbarcode.min.js',
  './js/lib/html5-qrcode.min.js',
  './js/db.js',
  './js/firebase-config.js',
  './js/store.js',
  './js/auth.js',
  './js/barcode.js',
  './js/scanner.js',
  './js/cart.js',
  './js/sales.js',
  './js/inventory.js',
  './js/sync.js',
  './js/printing.js',
  './js/reports.js',
  './js/settings.js',
  './js/app.js',
  './assets/icons/icon.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Precaching app shell...');
      return cache.addAll(PRECACHE_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME) {
            console.log('[SW] Clearing old cache:', name);
            return caches.delete(name);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Ignore non-GET or chrome-extension schemes
  if (event.request.method !== 'GET' || !event.request.url.startsWith('http')) {
    return;
  }

  // Handle Firebase and Google font calls network-first or pass-through
  if (event.request.url.includes('firestore.googleapis.com') || event.request.url.includes('identitytoolkit')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Fetch fresh copy in background
        fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkResponse));
          }
        }).catch(() => { });
        return cachedResponse;
      }

      return fetch(event.request).then((response) => {
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }
        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });
        return response;
      }).catch(() => {
        // Fallback for navigation requests to offline shell
        if (event.request.mode === 'navigate') {
          return caches.match('./sale.html');
        }
      });
    })
  );
});
