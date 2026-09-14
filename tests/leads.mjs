// المرحلة ٢٢: استقبال طلبات الصفحة العامة (دالة حقيقية على تخزين Blobs مزدوج).
import { chromium } from './pw.mjs';

const BASE = process.env.TEST_URL || 'http://127.0.0.1:8234';
const b = await chromium.launch();
const ctx = await b.newContext({ locale: 'ar-SA' });
const page = await ctx.newPage();
const ok = (n, c, x = '') => console.log(`${c ? 'PASS' : 'FAIL'} — ${n}${x ? ' :: ' + x : ''}`);

await page.goto(BASE + '/offers/');
await page.waitForTimeout(900);

// `x-forwarded-for` يضعه Netlify في الإنتاج؛ نُرسله هنا لأن الخادم المحلي لا يضعه،
// فيُختبر الحدّ المعدّل بمنطقه الحقيقي لا بفرضٍ عنه.
const post = (body, ip = null) => page.evaluate(async ({ payload, clientIp }) => {
  const headers = { 'content-type': 'application/json' };
  if (clientIp) headers['x-forwarded-for'] = clientIp;
  const res = await fetch('/api/lead', { method: 'POST', headers, body: JSON.stringify(payload) });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}, { payload: body, clientIp: ip });

/* ===== النموذج ظاهر على الصفحة العامة ===== */
ok('نموذج «اطلب معاينة» في الصفحة العامة', await page.locator('#lead-form').count() === 1);
const trap = await page.evaluate(() => {
  const box = document.querySelector('.lead-trap');
  const r = box.getBoundingClientRect();
  return { w: Math.round(r.width), h: Math.round(r.height), aria: box.getAttribute('aria-hidden'), tab: box.querySelector('input').tabIndex };
});
ok('حقل الفخّ خارج العين وقارئ الشاشة ومسار التنقل', trap.w <= 1 && trap.h <= 1 && trap.aria === 'true' && trap.tab === -1, JSON.stringify(trap));
ok('ويصرّح بأن الرقم لا يُنشر', (await page.locator('.lead-box').innerText()).includes('لا يُنشر رقمك'));

/* ===== التحقق من المدخلات ===== */
ok('جوال غير صالح مرفوض', (await post({ name: 'أ', phone: '123' })).status === 400);
const arabicDigits = await post({ name: 'سعد', phone: '٠٥٠١٢٣٤٥٦٧', note: 'أبحث عن فلة في النرجس' });
ok('جوال بأرقام عربية يُقبل ويُطبَّع', arabicDigits.status === 200, JSON.stringify(arabicDigits.data));
const trapped = await post({ name: 'آلة', phone: '0501111111', website: 'http://spam' });
ok('الفخّ يردّ بنجاح صامت', trapped.status === 200 && trapped.data.ok === true);

/* ===== القراءة تحتاج تسجيل دخول ===== */
const anon = await page.evaluate(async () => {
  const res = await fetch('/api/lead', { method: 'GET' });
  return res.status;
});
ok('قراءة الطلبات ممنوعة بلا جلسة', anon === 401, String(anon));

/* ===== بعد الدخول ===== */
await page.goto(BASE + '/');
await page.waitForTimeout(600);
const password = 'secret-pass'; // نفس ما يضبطه tests/server.mjs للخادم المقفل
await page.evaluate(async (pw) => {
  await fetch('/__login', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `password=${encodeURIComponent(pw)}` });
}, password);
await page.goto(BASE + '/');
await page.waitForTimeout(2200);

const listed = await page.evaluate(async () => {
  const res = await fetch('/api/lead', { credentials: 'same-origin' });
  return { status: res.status, data: await res.json().catch(() => ({})) };
});
ok('المالك يقرأ الطلبات', listed.status === 200 && Array.isArray(listed.data.leads), JSON.stringify(listed.status));
const saved = (listed.data.leads || []).find((l) => l.name === 'سعد');
ok('الجوال العربي خُزِّن بصيغة محلية', saved && saved.phone === '0501234567', saved?.phone);
ok('ونصّ الطلب محفوظ كما كُتب', saved && saved.note === 'أبحث عن فلة في النرجس');
ok('وطلب الفخّ لم يُحفظ', !(listed.data.leads || []).some((l) => l.name === 'آلة'));

/* ===== الحدّ المعدّل ===== */
let blocked = 0;
for (let i = 0; i < 8; i++) {
  const r = await post({ name: `مكرر ${i}`, phone: '0509999999' }, '203.0.113.9');
  if (r.status === 429) blocked++;
}
ok('الحدّ المعدّل يوقف الإرسال المتكرر', blocked > 0, `${blocked} مرفوضة`);

/* ===== الحذف ===== */
if (saved) {
  const del = await page.evaluate(async (id) => {
    const res = await fetch('/api/lead', { method: 'DELETE', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id }) });
    return res.status;
  }, saved.id);
  const after = await page.evaluate(async () => (await (await fetch('/api/lead', { credentials: 'same-origin' })).json()).leads);
  ok('حذف الطلب يعمل', del === 200 && !after.some((l) => l.id === saved.id));
}

/* ===== اللوحة في التطبيق ===== */
await page.evaluate(() => { location.hash = '#/publish'; });
await page.waitForTimeout(1800);
const publishText = await page.locator('#page').innerText();
ok('لوحة الطلبات تظهر في صفحة النشر', publishText.includes('طلبات من الصفحة العامة'), '');

await b.close();
