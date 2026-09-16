// عامل الخدمة — رابح يعمل بلا إنترنت. لا شيء يُرسَل إلى أي خادم أصلًا،
// فالاتصال إنما يلزم لتحميل الملفات أول مرة.

const CACHE = 'rabih-v11';
const ASSETS = [
  './', './index.html', './manifest.webmanifest', './icon.svg',
  './css/rabih.css',
  './js/app.js', './js/schema.js', './js/parse.js', './js/prompts.js', './js/report.js',
  './js/maps.js', './js/store.js', './js/lexicon.js', './js/verify.js', './js/anomaly.js',
  './js/compare.js', './js/plan.js', './js/export.js', './js/templates.js',
  './js/persist.js', './js/recency.js', './js/group.js', './js/brand.js',
  './js/messages.js', './js/lock.js', './js/queue.js',
  './js/completeness.js', './js/entities.js', './js/replies.js', './js/models.js',
  './js/peak.js', './js/agreement.js', './js/history.js', './js/tour.js', './js/places.js', './js/confidence.js', './js/reviews.js', './js/runner.js', './js/stamp.js',
  './js/data/cities.js', './js/data/categories.js', './js/data/districts.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE)
    .then((c) => c.addAll(ASSETS))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// الشبكة أولًا ثم المخزن: كي يصل التحديث فور نشره، ويبقى العمل قائمًا بلا اتصال.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html'))),
  );
});
