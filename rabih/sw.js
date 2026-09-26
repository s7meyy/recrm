// عامل الخدمة — رابح يعمل بلا إنترنت. لا شيء يُرسَل إلى أي خادم أصلًا،
// فالاتصال إنما يلزم لتحميل الملفات أول مرة.

const CACHE = 'rabih-v25';
const ASSETS = [
  './', './index.html', './manifest.webmanifest', './icon.svg', './assets/rabeh-logo.png',
  './css/rabih.css',
  './js/app.js', './js/schema.js', './js/parse.js', './js/prompts.js', './js/report.js',
  './js/maps.js', './js/store.js', './js/lexicon.js', './js/verify.js', './js/anomaly.js',
  './js/compare.js', './js/plan.js', './js/export.js', './js/templates.js',
  './js/persist.js', './js/recency.js', './js/group.js', './js/brand.js',
  './js/messages.js', './js/lock.js', './js/queue.js',
  './js/completeness.js', './js/entities.js', './js/replies.js', './js/models.js',
  './js/peak.js', './js/agreement.js', './js/history.js', './js/tour.js', './js/places.js', './js/confidence.js', './js/reviews.js', './js/runner.js', './js/stamp.js', './js/integrity.js', './js/priority.js', './js/stars.js', './js/voice.js', './js/impact.js', './js/sources.js', './js/clients.js', './js/cloud.js', './js/share.js', './js/cooccur.js', './js/timing.js', './js/promises.js', './js/effect.js', './js/network.js', './js/signature.js', './js/interval.js', './js/bias.js', './js/privacy.js', './js/eval.js', './js/i18n.js',
  './js/action.js', './js/brief.js', './js/coverage.js', './js/card.js', './js/logo.js', './js/catalog.js',
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
