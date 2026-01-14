const CACHE_NAME = 'jmri-roster-browser-v1';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icon-192.png',
  './roster/roster.xml',
  'https://unpkg.com/dexie/dist/dexie.js'
];

// Install: Cache all the core app files
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
});

// Activate: Clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      );
    })
  );
});

// Fetch: Serve files from cache if offline
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});

self.addEventListener('fetch', (event) => {
  // If we are requesting XML data, try Network First
  if (event.request.url.includes('.xml')) {
    event.respondWith(
      fetch(event.request)
        .catch(() => caches.match(event.request))
    );
  } else {
    // For images/css/js, use Cache First
    event.respondWith(
      caches.match(event.request).then((res) => res || fetch(event.request))
    );
  }
});