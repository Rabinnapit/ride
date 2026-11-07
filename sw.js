// RideHQ service worker — offline app shell + Web Share Target for .fit files.
const VERSION = 'ridehq-v2';
const SHELL = [
  './', './index.html', './manifest.webmanifest', './css/app.css',
  './vendor/uplot.min.js', './vendor/uplot.min.css', './vendor/chart.umd.js', './vendor/leaflet.js', './vendor/leaflet.css', './vendor/fitsdk.js',
  './vendor/images/marker-icon.png', './vendor/images/marker-icon-2x.png', './vendor/images/marker-shadow.png', './vendor/images/layers.png', './vendor/images/layers-2x.png',
  './fonts/barlow-latin-400-normal.woff2', './fonts/barlow-latin-500-normal.woff2', './fonts/barlow-latin-600-normal.woff2',
  './fonts/barlow-condensed-latin-500-normal.woff2', './fonts/barlow-condensed-latin-600-normal.woff2', './fonts/barlow-condensed-latin-700-normal.woff2',
  './icons/icon-192.png', './icons/icon-512.png', './icons/maskable-512.png',
  './js/main.js', './js/theme-init.js', './js/app.js', './js/db.js', './js/settings.js', './js/fit/parse.js', './js/fit/worker.js',
  './js/metrics/compute.js', './js/metrics/zones.js', './js/metrics/aggregate.js', './js/metrics/readiness.js',
  './js/coach/workouts.js', './js/coach/gym.js', './js/coach/figures.js', './js/ui/demo.js', './js/coach/planner.js', './js/coach/focus.js', './js/ai/ai.js', './js/sync/github.js', './js/modules/extras.js',
  './js/ui/dom.js', './js/ui/charts.js',
  './js/views/home.js', './js/views/rides.js', './js/views/ride.js', './js/views/analyze.js', './js/views/train.js', './js/views/gym.js', './js/views/wellness.js', './js/views/more.js', './js/views/settings.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

function openInbox() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('ridehq', 1);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onupgradeneeded = () => { const db = req.result; if (!db.objectStoreNames.contains('inbox')) db.createObjectStore('inbox', { keyPath: 'id' }); };
  });
}
async function storeShared(files) {
  const db = await openInbox();
  for (const f of files) {
    const buffer = await f.arrayBuffer();
    await new Promise((resolve, reject) => { const t = db.transaction('inbox', 'readwrite'); t.objectStore('inbox').put({ id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, name: f.name || 'shared.fit', buffer, ts: Date.now() }); t.oncomplete = resolve; t.onerror = () => reject(t.error); });
  }
}

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method === 'POST' && url.pathname.endsWith('/share-target')) {
    e.respondWith((async () => {
      try {
        const fd = await e.request.formData();
        const files = fd.getAll('fit').filter(f => f && f.size);
        await storeShared(files);
        const clients = await self.clients.matchAll({ type: 'window' });
        for (const c of clients) c.postMessage({ type: 'shared-files', count: files.length });
      } catch (err) { console.error('share-target', err); }
      return Response.redirect('./index.html?share-target=1#/rides', 303);
    })());
    return;
  }
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(hit => {
    const fetched = fetch(e.request).then(res => { if (res.ok) caches.open(VERSION).then(c => c.put(e.request, res.clone())); return res; }).catch(() => hit);
    return hit || fetched;
  }));
});
