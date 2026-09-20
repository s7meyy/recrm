import { chromium } from './pw.mjs';
import fs from 'node:fs/promises';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const BASE = process.env.TEST_URL || 'http://127.0.0.1:8234';
const b = await chromium.launch();
const ok = (n,c,x='') => console.log(`${c?'PASS':'FAIL'} — ${n}${x?' :: '+x:''}`);

/**
 * بوّابةُ ترخيص الإعلان (المرحلة ٤٧): عقارٌ بلا عقد وساطةٍ ولا ترخيصِ إعلان يُسأل عنه
 * قبل النشر. وبياناتُ الاختبار بلا عقودٍ ولا تراخيص — فيُجاب السؤالُ صراحةً كما يُجيبه
 * المستخدم: **«انشر الكلّ وأنا أعلم»**. والسؤالُ نفسُه مفحوصٌ في `publish-gate-unit`.
 */
async function answerLicenseGate(page) {
  const btn = page.locator('.modal button:has-text("انشر الكلّ وأنا أعلم")');
  try { await btn.waitFor({ timeout: 2500 }); await btn.click(); } catch (_) { /* لا مانعَ فلا سؤال */ }
}

const ctx = await b.newContext({ locale: 'ar-SA' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));

console.log('--- ٣: صفحة العرض الواحد ومعاينة واتساب ---');
// ننشر عبر واجهة النشر نفسها
await page.goto(BASE + '/');
await page.fill('input[type="password"]', 'secret-pass');
await page.click('button[type="submit"]');
await page.waitForTimeout(2500);
await page.evaluate(async () => {
  const { repo } = await import('/js/data/repository.js');
  const { setCompany, setPublishSettings } = await import('/js/data/settings.js');
  const { storeImage } = await import('/js/data/images.js');
  await setCompany({ name: 'مكتب كسّاب العقاري', phone: '0551234567' });
  // المرحلة ٥٢: الملاحظةُ داخليّةٌ لا تُنشر، والوصفُ التسويقيُّ هو ما يخرج.
  const p1 = await repo.properties.create({ city: 'الرياض', district: 'الياسمين', type: 'villa', purposes: ['sale'], area: 420, price: 2700000, notes: 'المالك يرفض التعاون حاليًا', publicDesc: 'فلة زاوية' });
  const png = 'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAJElEQVR42u3NMQEAAAgDoC251a3gLzSgOXeqAAAAAAAAAAAAvAxJlwGBMRUXtAAAAABJRU5ErkJggg==';
  const bytes = Uint8Array.from(atob(png), c => c.charCodeAt(0));
  const img = await storeImage(new File([bytes], 'a.png', { type: 'image/png' }), { entity: 'property', entityId: p1.id });
  await repo.properties.update(p1.id, { images: [img.id] });
  await setPublishSettings({ token: 'test-publish-token', contactPhone: '0551234567', listingIds: [p1.id] });
});
await page.evaluate(() => { location.hash = '#/publish'; });
await page.waitForTimeout(1200);
await page.locator('button:has-text("نشر الآن")').click();
await answerLicenseGate(page);
await page.waitForTimeout(3500);
// **جدولُ العروض بعينه لا «أوّل جدول»**: صفحة النشر فيها جدولان — «طلبات وصلت من الصفحة
// العامة» ثم العروض. وكان الفحصُ يأخذ أوّلَهما فيصيب العروضَ ما دام جدولُ الطلبات فارغًا،
// ويخطئ متى وصل طلبٌ واحد (وخزنُ الطلبات على الخادم يبقى بين الحزم). فيُطلب بعمودِه.
const listingsTable = page.locator('.table:has(th:text("الرابط"))');
ok('جدول العروض موجودٌ في صفحة النشر', await listingsTable.count() === 1, String(await listingsTable.count()));
const shareCell = await listingsTable.locator('tbody tr').first().innerText();
ok('زر مشاركة رابط العرض يظهر بعد النشر', shareCell.includes('↗') || shareCell.includes('📋'), shareCell.replace(/\n/g,' | ').slice(0,90));

const pub = await (await b.newContext({ locale: 'ar-SA' })).newPage();
const res = await pub.goto(BASE + '/offers/l/1');
ok('صفحة العرض الواحد تُفتح بلا تسجيل دخول', res.status() === 200, String(res.status()));
const head = await pub.evaluate(() => ({
  title: document.title,
  og: Object.fromEntries([...document.querySelectorAll('meta[property^="og:"]')].map(m => [m.getAttribute('property'), m.content])),
}));
ok('وسوم المعاينة (OG) مكتملة للواتساب', !!head.og['og:title'] && !!head.og['og:description'] && !!head.og['og:image'], JSON.stringify(head.og).slice(0,150));
ok('العنوان يحمل اسم المكتب', head.title.includes('مكتب كسّاب العقاري'), head.title);
const imgLoaded = await pub.locator('.offer-gallery img').first().evaluate(el => el.complete && el.naturalWidth > 0);
ok('صورة العرض تُحمَّل', imgLoaded);
const body = await pub.locator('body').innerText();
ok('السعر والتفاصيل تظهر', body.includes('2,700,000') && body.includes('فلة زاوية'));
// **وهذا هو العطب الذي أُصلح** (المرحلة ٥٢): كان المنشورُ حقلَ «الملاحظات» نفسَه،
// فيقرأ من تفاوضه «المالك يرفض التعاون حاليًا» — والصفحةُ تَعِد بخلاف ذلك بالحرف.
ok('**وملاحظتُك الداخليّة لا تخرج إلى الصفحة العامّة**', !body.includes('يرفض التعاون'),
  body.split('\n').find((l) => l.includes('يرفض')) || '—');
const notFound = await pub.goto(BASE + '/offers/l/999');
ok('رقم غير منشور يعيد 404 برسالة مفهومة', notFound.status() === 404 && (await pub.locator('body').innerText()).includes('لم يعد متاحًا'), String(notFound.status()));

console.log('\n--- ٦: التثبيت على الجوال والعمل دون اتصال ---');
const maniJson = await page.evaluate(async () => (await fetch('/manifest.webmanifest', { credentials: 'same-origin' })).json());
ok('ملف التثبيت يُخدَم ويحمل الاسم الجديد', maniJson.short_name === 'كسّاب', maniJson.name);
const iconsOk = await page.evaluate(async (icons) => {
  const res = await Promise.all(icons.map((i) => fetch(i.src, { credentials: 'same-origin' }).then((r) => r.ok && r.headers.get('content-type')?.includes('image'))));
  return res.every(Boolean);
}, maniJson.icons);
ok('الأيقونات الثلاث موجودة فعليًا كصور', iconsOk);
ok('رابط الأيقونة مربوط في الصفحة', await page.locator('link[rel="manifest"]').count() === 1);
const swState = await page.evaluate(async () => {
  const reg = await navigator.serviceWorker.getRegistration();
  return { registered: !!reg, scope: reg?.scope, active: !!reg?.active };
});
ok('عامل الخدمة مُسجَّل وفعّال', swState.registered && swState.active, JSON.stringify(swState));
// العمل دون اتصال: نقطع الشبكة ونعيد التحميل
await ctx.setOffline(true);
const offline = await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' }).then(r => r?.status()).catch(() => 'FAILED');
const offlineHasApp = await page.locator('.app-shell').count();
await ctx.setOffline(false);
ok('التطبيق يفتح دون اتصال من المخزن', offlineHasApp === 1, `status=${offline}`);
const cached = await page.evaluate(async () => {
  const keys = await caches.keys();
  const c = await caches.open(keys[0]);
  const reqs = await c.keys();
  return { version: keys[0], urls: reqs.map(r => new URL(r.url).pathname) };
});
ok('لا يُخزَّن شيء من الدوال أو الصفحة العامة أو الدخول',
  !cached.urls.some(u => u.startsWith('/api/') || u.startsWith('/offers') || u.startsWith('/__')),
  cached.urls.slice(0, 8).join(' '));

/* التحديث يصل فعلًا: ملف يُطلب مرتين ويتغيّر على الخادم بينهما.
   تحت «المخزن أولًا» القديمة كانت القراءة الثانية تُعيد النسخة القديمة أبدًا. */
const probePath = `${ROOT}/css/__cache-probe.css`;
await fs.writeFile(probePath, '.probe { color: red; } /* A */');
const first = await page.evaluate(async () => (await fetch('/css/__cache-probe.css', { credentials: 'same-origin' })).text());
ok('الملف يُقرأ أول مرة ويُخزَّن', first.includes('/* A */'), first.trim());
await fs.writeFile(probePath, '.probe { color: blue; } /* B */');
const second = await page.evaluate(async () => (await fetch('/css/__cache-probe.css', { credentials: 'same-origin' })).text());
ok('**التحديث يصل بعد تغيّر الملف على الخادم**', second.includes('/* B */'), second.trim());
const cachedProbe = await page.evaluate(async () => {
  const keys = await caches.keys();
  const c = await caches.open(keys[0]);
  const hit = await c.match('/css/__cache-probe.css');
  return hit ? await hit.text() : 'غير مخزَّن';
});
ok('المخزن نفسه تحدّث للعمل دون اتصال', cachedProbe.includes('/* B */'), cachedProbe.trim());
// ودون اتصال يُخدَم من المخزن رغم أن القاعدة صارت «الشبكة أولًا»
await ctx.setOffline(true);
const offlineProbe = await page.evaluate(async () => {
  try { return await (await fetch('/css/__cache-probe.css', { credentials: 'same-origin' })).text(); } catch (e) { return 'فشل: ' + e.message; }
});
await ctx.setOffline(false);
ok('الملف يُخدَم من المخزن عند انقطاع الشبكة', offlineProbe.includes('/* B */'), offlineProbe.trim());
await fs.rm(probePath, { force: true });

console.log('\n--- ٧: تنبيهات الخلفية ---');
const pushFlow = await page.evaluate(async () => {
  const { remindersFrom } = await import('/js/util/push.js');
  const tasks = [
    { id: 't1', done: false, dueAt: '2026-01-01T10:00:00.000Z', title: 'سرّي جدًا', notes: 'ملاحظة خاصة' },
    { id: 't2', done: true, dueAt: '2026-01-01T10:00:00.000Z', title: 'منجزة' },
    { id: 't3', done: false, dueAt: null, title: 'بلا موعد' },
  ];
  const out = remindersFrom(tasks);
  return { out, leaks: JSON.stringify(out).includes('سرّي') || JSON.stringify(out).includes('ملاحظة') };
});
ok('المرفوع مواعيد فقط: لا عناوين ولا ملاحظات', pushFlow.out.length === 1 && !pushFlow.leaks, JSON.stringify(pushFlow.out));

// اشتراك وهمي ثم تشغيل الدالة المجدولة فعليًا
const subResult = await page.evaluate(async () => {
  const fake = { endpoint: 'https://push.example.test/sub-1', keys: { p256dh: 'x', auth: 'y' } };
  const res = await fetch('/api/push', {
    method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ subscription: fake, reminders: [
      { id: 'due-1', dueAt: new Date(Date.now() - 60000).toISOString(), title: 'يجب ألا يُرفع' },
      { id: 'later-1', dueAt: new Date(Date.now() + 86400000).toISOString() },
      { id: 'ancient', dueAt: new Date(Date.now() - 60 * 3600000).toISOString() },
    ] }),
  });
  return { status: res.status, body: await res.json() };
});
ok('الاشتراك يُحفظ على الخادم', subResult.status === 200 && subResult.body.reminders === 3, JSON.stringify(subResult.body));
const tick = await page.evaluate(async () => (await fetch('/api/push-tick', { credentials: 'same-origin' })).json());
ok('الدالة المجدولة تعمل وتصل إلى الاشتراك', tick && tick.ok === true && tick.subscriptions >= 1, JSON.stringify(tick));

console.log('\nERRORS:', errors.length ? JSON.stringify(errors.slice(0,3)) : 'none');
await b.close();
