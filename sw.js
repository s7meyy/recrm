// عامل الخدمة (المرحلة ١٠): يتيح تثبيت التطبيق على شاشة الجوال وفتحه دون اتصال.
//
// قاعدتان تحكمانه:
// ١) **لا يُخزَّن شيء يتعلق بالبوابة أو الدوال أو الصفحة العامة** — فلا تُسلَّم صفحة مخزَّنة
//    لزائر غير مسجَّل دخوله، ولا تُعرض بيانات نشر قديمة.
// ٢) ملفات التطبيق (JS/CSS/الخط/الخريطة) تُخدَم من المخزن أولًا لسرعة الفتح وللعمل دون اتصال،
//    وصفحة HTML تُطلب من الشبكة أولًا كي يصل أي تحديث فورًا (وتعود للمخزن إن انقطعت).
//
// البيانات نفسها في IndexedDB ولا علاقة لعامل الخدمة بها إطلاقًا.

const VERSION = 'kassab-v1';
const SHELL = [
  '/', '/index.html',
  '/css/base.css', '/css/components.css',
  '/js/app.js',
  '/manifest.webmanifest',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    // addAll يفشل كله لو فشل ملف؛ نضيف واحدًا واحدًا فلا يُعطّل التثبيتَ ملفٌّ واحد.
    await Promise.all(SHELL.map((url) => cache.add(url).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== VERSION) await caches.delete(key);
    await self.clients.claim();
  })());
});

const BYPASS = [/^\/api\//, /^\/offers(\/|$)/, /^\/__login/, /^\/__logout/, /^\/\.netlify\//];

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (BYPASS.some((re) => re.test(url.pathname))) return; // تمرّ للشبكة بلا تدخّل

  const isDocument = request.mode === 'navigate' || (request.headers.get('accept') || '').includes('text/html');

  event.respondWith((async () => {
    const cache = await caches.open(VERSION);
    if (isDocument) {
      try {
        const fresh = await fetch(request);
        // لا تُخزَّن صفحة الدخول (تأتي بـ200 من البوابة) — تُميَّز بأنها ليست من ملفات التطبيق.
        if (fresh.ok && !fresh.headers.get('cache-control')?.includes('no-store')) cache.put(request, fresh.clone());
        return fresh;
      } catch (_) {
        return (await cache.match(request)) || (await cache.match('/index.html')) || Response.error();
      }
    }
    const hit = await cache.match(request);
    if (hit) return hit;
    try {
      const fresh = await fetch(request);
      if (fresh.ok) cache.put(request, fresh.clone());
      return fresh;
    } catch (_) {
      return Response.error();
    }
  })());
});


/* ===== تنبيهات الخلفية (المرحلة ١٠) ===== */

self.addEventListener('push', (event) => {
  // الحمولة عامة بقصد: الخادم لا يعرف عنوان المهمة (انظر push-tick.js).
  let data = { title: 'كسّاب', body: 'لديك تذكير مستحق.', url: '/#/tasks', tag: 'kassab-reminder' };
  try { if (event.data) data = { ...data, ...event.data.json() }; } catch (_) { /* نص غير JSON */ }
  event.waitUntil(self.registration.showNotification(data.title, {
    body: data.body,
    tag: data.tag,
    dir: 'rtl',
    lang: 'ar',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { url: data.url },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data?.url || '/#/tasks';
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    // تبويب مفتوح أصلًا: ركّز عليه وانقله للسجل بدل فتح نافذة ثانية.
    for (const client of all) {
      if (client.url.includes(self.location.origin)) {
        await client.focus();
        if ('navigate' in client) await client.navigate(target).catch(() => {});
        return;
      }
    }
    await self.clients.openWindow(target);
  })());
});
