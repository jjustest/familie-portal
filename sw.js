// Service worker: gør appen installerbar og lader den starte uden net.
// Hæv VERSION, når filerne ændres, så alle enheder henter de nye.
const VERSION = 'v10';
const CACHE = `familie-${VERSION}`;
const SHELL = [
  './',
  'index.html',
  'css/style.css',
  'js/app.js',
  'js/config.js',
  'js/util.js',
  'js/icons.js',
  'js/weather.js',
  'js/db.js',
  'js/sky.js',
  'js/sun.js',
  'js/demo.js',
  'js/extras.js',
  'js/lock.js',
  'fonts/outfit-latin-wght-normal.woff2',
  'js/vendor/supabase.js',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // Kun egne filer caches; vejr- og database-kald går altid direkte på nettet.
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;

  // Netværk først (så ændringer slår igennem med det samme), cache som reserve.
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' })   // spørg altid serveren, så ændringer slår igennem
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
