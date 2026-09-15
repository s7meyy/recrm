// المرحلة ٢٩ في متصفح حقيقي: صفحة حجز الموعد بدالتها، والتحويل إلى مهمة.
// (خادم مقفل: الحجز عامّ، والقراءة والتحويل خلف البوابة.)
import { chromium } from './pw.mjs';

const BASE = process.env.TEST_URL || 'http://127.0.0.1:8234';
const b = await chromium.launch();
const ctx = await b.newContext({ locale: 'ar-SA' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
const ok = (n, c, x = '') => console.log(`${c ? 'PASS' : 'FAIL'} — ${n}${x ? ' :: ' + x : ''}`);
const password = 'secret-pass';
const PUBLISH_TOKEN = 'test-publish-token';

/* ===== ١. الحجز مغلق حتى يُفتح ===== */
console.log('\n--- ١. مغلق افتراضيًا ---');
await page.goto(BASE + '/offers/book.html');
await page.waitForTimeout(1400);
const closed = await page.evaluate(async () => (await (await fetch('/api/book')).json()));
ok('الحجز مغلق ما لم يُفتح في الإعدادات', closed.enabled === false && closed.slots.length === 0, JSON.stringify(closed.enabled));
ok('والصفحة تقول ذلك بلا خطأ', (await page.locator('#status').innerText()).includes('مغلق'), await page.locator('#status').innerText());
const blocked = await page.evaluate(async () => {
  const res = await fetch('/api/book', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ phone: '0501234567', at: new Date().toISOString() }) });
  return { status: res.status, data: await res.json().catch(() => ({})) };
});
ok('والحجز عليه مرفوض', blocked.status === 400, JSON.stringify(blocked.data));

/* ===== ٢. بعد النشر بأوقات مفتوحة ===== */
console.log('\n--- ٢. أوقات متاحة ---');
await page.evaluate(async (token) => {
  await fetch('/api/publish', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-publish-token': token },
    body: JSON.stringify({
      kind: 'snapshot', intro: '', office: { name: 'مكتب الاختبار', phone: '0500000000' },
      booking: {
        enabled: true, days: [0, 1, 2, 3, 4, 5, 6], from: '09:00', to: '21:00',
        slotMinutes: 60, leadHours: 1, horizonDays: 3, place: 'المكتب',
      },
      listings: [{ ref: '1', title: 'فلة', city: 'الرياض', district: 'النرجس', price: 1000000, images: [] }],
    }),
  });
}, PUBLISH_TOKEN);

await page.goto(BASE + '/offers/book.html');
await page.waitForTimeout(1600);
const open = await page.evaluate(async () => (await (await fetch('/api/book')).json()));
ok('الأوقات تُولَّد بعد الفتح', open.enabled === true && open.slots.length > 0, String(open.slots.length));
ok('والمكان ومدّة الموعد معروضان', (await page.locator('#status').innerText()).includes('المكتب'), await page.locator('#status').innerText());
ok('والأوقات مجمَّعة بالأيام', await page.locator('.booking-day').count() >= 1, String(await page.locator('.booking-day').count()));

const trap = await page.evaluate(() => {
  const box = document.querySelector('.lead-trap');
  const r = box.getBoundingClientRect();
  return { w: Math.round(r.width), h: Math.round(r.height) };
});
ok('وفيها حقل الفخّ نفسه', trap.w <= 1 && trap.h <= 1, JSON.stringify(trap));

/* ===== ٣. الحجز من الصفحة ===== */
console.log('\n--- ٣. الحجز ---');
ok('الاستمارة مخفية قبل اختيار وقت', await page.locator('#book-form').isHidden());
await page.locator('.slot-btn').first().click();
await page.waitForTimeout(400);
ok('واختيار الوقت يُظهرها بالموعد', (await page.locator('#chosen').innerText()).includes('الموعد المختار'), await page.locator('#chosen').innerText());
await page.locator('input[name="phone"]').fill('0533221100');
await page.locator('input[name="name"]').fill('راكان السبيعي');
await page.locator('textarea[name="note"]').fill('أبغى أعاين فلة النرجس');
await page.locator('#book-send').click();
await page.waitForTimeout(1600);
ok('والتأكيد يُعلن الموعد', (await page.locator('#status').innerText()).includes('تم الحجز'), await page.locator('#status').innerText());

const afterBook = await page.evaluate(async () => (await (await fetch('/api/book')).json()));
ok('والوقت المحجوز يختفي من المتاح', afterBook.slots.length === open.slots.length - 1,
  `${open.slots.length} → ${afterBook.slots.length}`);

const retake = await page.evaluate(async (iso) => {
  const res = await fetch('/api/book', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone: '0509998877', at: iso }),
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}, open.slots[0].iso);
ok('وحجزه مرة أخرى مرفوض', retake.status === 409, JSON.stringify(retake.data));

const outside = await page.evaluate(async () => {
  const at = new Date(Date.now() + 2 * 86400000);
  at.setUTCHours(1, 0, 0, 0); // الرابعة فجرًا بالرياض — خارج الدوام
  const res = await fetch('/api/book', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone: '0509998877', at: at.toISOString() }),
  });
  return res.status;
});
ok('ووقتٌ خارج الدوام مرفوض ولو أُرسل مباشرة', outside === 409, String(outside));

const trapped = await page.evaluate(async (iso) => {
  const res = await fetch('/api/book', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone: '0501112233', at: iso, website: 'http://spam' }),
  });
  return res.status;
}, afterBook.slots[0].iso);
ok('والفخّ يردّ بنجاح صامت', trapped === 200, String(trapped));

const anon = await page.evaluate(async () => (await fetch('/api/book?admin=1')).status);
ok('وقراءة المحجوز ممنوعة بلا جلسة', anon === 401, String(anon));

/* ===== ٤. التحويل إلى مهمة ===== */
console.log('\n--- ٤. التحويل ---');
await page.goto(BASE + '/');
await page.waitForTimeout(500);
await page.evaluate(async (pw) => {
  await fetch('/__login', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `password=${encodeURIComponent(pw)}` });
}, password);
await page.goto(BASE + '/');
await page.waitForTimeout(2200);
await page.evaluate(() => { location.hash = '#/publish'; });
await page.waitForTimeout(2400);
const publishText = await page.locator('#page').innerText();
ok('لوحتا الحجز في صفحة النشر', publishText.includes('حجز المواعيد') && publishText.includes('مواعيد محجوزة'));
ok('وتحذّر أن الأوقات لا تصل إلا بنشرة', publishText.includes('انشر') || publishText.includes('اضغط «نشر»'),
  publishText.split('\n').find((l) => l.includes('نشر')) || '');
ok('والموعد المحجوز معروض باسمه', publishText.includes('راكان السبيعي'),
  publishText.split('\n').find((l) => l.includes('راكان')) || '');

const before = await page.evaluate(async () => {
  const { repo } = await import('/js/data/repository.js');
  return { clients: (await repo.clients.list()).length, tasks: (await repo.tasks.list()).length };
});
await page.locator('tr', { hasText: 'راكان السبيعي' }).locator('button:has-text("حوّله")').first().click();
await page.waitForTimeout(2400);
const afterConvert = await page.evaluate(async () => {
  const { repo } = await import('/js/data/repository.js');
  const clients = await repo.clients.list();
  const client = clients.find((c) => c.phone === '0533221100');
  const tasks = await repo.tasks.list();
  const task = tasks.find((t) => t.linkId === client?.id && t.title.includes('موعد'));
  return { clients: clients.length, tasks: tasks.length, task, source: client?.referralSource, contacts: (client?.contacts || []).length };
});
ok('أُنشئ العميل ومهمته', afterConvert.clients === before.clients + 1 && afterConvert.tasks === before.tasks + 1,
  `${before.clients}→${afterConvert.clients} · ${before.tasks}→${afterConvert.tasks}`);
ok('والمهمة بموعد الحجز نفسه', !!afterConvert.task?.dueAt, String(afterConvert.task?.dueAt));
ok('ومصدره «حجز موعد»', afterConvert.source === 'حجز موعد', afterConvert.source);
ok('وسُجّل التواصل', afterConvert.contacts === 1, String(afterConvert.contacts));

const left = await page.evaluate(async () => (await (await fetch('/api/book?admin=1', { credentials: 'same-origin' })).json()).bookings);
ok('والموعد يُزال بعد تحويله', !left.some((x) => x.phone === '0533221100'), String(left.length));

ok('لا أخطاء في الصفحة', errors.length === 0, errors.slice(0, 3).join(' | '));
await b.close();
