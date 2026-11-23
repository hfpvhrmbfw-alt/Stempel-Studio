// Service Worker: App-Dateien für die Offline-Nutzung zwischenspeichern.
const VERSION = 'v1';
const SHELL = [
  './', 'index.html', 'styles.css', 'manifest.webmanifest',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
  'src/main.js', 'src/ui.js', 'src/texts.js', 'src/storage.js', 'src/model.js', 'src/geometry.js',
  'src/layout.js', 'src/bitmap.js', 'src/prepress.js', 'src/vectorize.js', 'src/export.js',
  'src/services/fonts.js', 'src/vendor/potrace.js', 'src/vendor/opentype.module.js',
  'fonts/roboto-slab-400.woff', 'fonts/roboto-slab-700.woff', 'fonts/work-sans-400.woff', 'fonts/work-sans-700.woff',
];
const CACHE = `stempel-studio-${VERSION}`;

self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('stempel-studio-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()),
));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
    if (res.ok && new URL(e.request.url).origin !== location.origin) {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy)); // Webfonts der Oberfläche für offline merken
    }
    return res;
  })));
});
