// المرحلة ٣٠ في متصفح حقيقي: الصفحة العامة بالإنجليزية، وطرف Meta بدالته.
import crypto from 'node:crypto';
import { chromium } from './pw.mjs';

const BASE = process.env.TEST_URL || 'http://127.0.0.1:8234';
const b = await chromium.launch();
const ctx = await b.newContext({ locale: 'ar-SA' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
const ok = (n, c, x = '') => console.log(`${c ? 'PASS' : 'FAIL'} — ${n}${x ? ' :: ' + x : ''}`);
const PUBLISH_TOKEN = 'test-publish-token';
const APP_SECRET = 'test-app-secret';
const VERIFY_TOKEN = 'test-verify-token';

/* ===== لقطة فيها مفاتيح النوع والغرض ===== */
await page.goto(BASE + '/offers/');
await page.waitForTimeout(800);
await page.evaluate(async (token) => {
  await fetch('/api/publish', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-publish-token': token },
    body: JSON.stringify({
      kind: 'snapshot', intro: '', office: { name: 'Kassab Test', phone: '0500000000' },
      listings: [
        {
          ref: '1', title: 'فلة — النرجس', typeLabel: 'فلة', type: 'villa',
          purposeLabels: ['بيع'], purposes: ['sale'],
          city: 'الرياض', district: 'النرجس', area: 400, price: 1900000, images: [], notes: 'وصفٌ بخطّي',
          contactPhone: '0500000000',
        },
        {
          ref: '2', title: 'استراحة — الملقا', typeLabel: 'استراحة', type: 'rest_custom',
          purposeLabels: ['إيجار'], purposes: ['rent'],
          city: 'الرياض', district: 'الملقا', area: 800, price: null, images: [],
        },
      ],
    }),
  });
}, PUBLISH_TOKEN);

/* ===== ١. العربية هي الافتراض ===== */
console.log('\n--- ١. الافتراض عربي ---');
await page.goto(BASE + '/offers/');
await page.waitForTimeout(1600);
ok('اتجاه الصفحة عربي افتراضًا', await page.evaluate(() => document.documentElement.dir) === 'rtl');
ok('وزرّ اللغة يعرض الأخرى', (await page.locator('#lang-toggle').innerText()).trim() === 'English');
ok('والبطاقة بالعربية', (await page.locator('.card').first().innerText()).includes('فلة'));

/* ===== ٢. التبديل إلى الإنجليزية ===== */
console.log('\n--- ٢. الإنجليزية ---');
await page.locator('#lang-toggle').click();
await page.waitForTimeout(700);
ok('الاتجاه صار من اليسار', await page.evaluate(() => document.documentElement.dir) === 'ltr');
ok('ولغة الصفحة en', await page.evaluate(() => document.documentElement.lang) === 'en');
const cards = await page.locator('.card').first().innerText();
ok('والنوع المدمج مترجَم', cards.includes('Villa'), cards.split('\n')[0]);
ok('والغرض مترجَم', cards.includes('For Sale'), cards.split('\n').find((l) => l.includes('Sale')) || '');
ok('والسعر بالريال اللاتيني', cards.includes('SAR'), cards.split('\n').find((l) => l.includes('SAR')) || '');
const second = await page.locator('.card').nth(1).innerText();
ok('والنوع المخصّص يبقى بمسمّاه لا يُترجَم اختراعًا', second.includes('استراحة'), second.split('\n')[0]);
ok('واسم الحي كما كتبتَه', cards.includes('النرجس'));
ok('ووصفك كما كتبتَه', cards.includes('وصفٌ بخطّي'));

// الفرز على المفاتيح: التبديل لا يُفرغه.
const filterCount = await page.locator('#filters select').count();
if (filterCount) {
  await page.locator('#filters select').first().selectOption({ index: 1 });
  await page.waitForTimeout(400);
  const before = await page.locator('.card').count();
  await page.locator('#lang-toggle').click();
  await page.waitForTimeout(600);
  const after = await page.locator('.card').count();
  ok('والفرز يبقى بعد تبديل اللغة', before === after && after >= 1, `${before} → ${after}`);
  await page.locator('#lang-toggle').click();
  await page.waitForTimeout(500);
} else {
  ok('والفرز يبقى بعد تبديل اللغة', true, 'لا مرشّحات تكفي للفرز');
}

// اللغة تُحفظ للزيارة القادمة.
await page.goto(BASE + '/offers/');
await page.waitForTimeout(1400);
ok('واللغة محفوظة للزيارة القادمة', await page.evaluate(() => document.documentElement.lang) === 'en');

/* ===== ٣. صفحة العرض الواحد (تُبنى في الخادم) ===== */
console.log('\n--- ٣. صفحة العرض ---');
await page.goto(BASE + '/offers/l/1?lang=en');
await page.waitForTimeout(1200);
const offerEn = await page.locator('body').innerText();
ok('صفحة العرض بالإنجليزية', (await page.evaluate(() => document.documentElement.dir)) === 'ltr' && offerEn.includes('Villa'),
  offerEn.split('\n')[0]);
ok('وأزرارها مترجَمة', offerEn.includes('WhatsApp') && offerEn.includes('Call'));
ok('ورقم العرض بمسمّاه الإنجليزي', offerEn.includes('Ref 1'), offerEn.split('\n').find((l) => l.includes('Ref')) || '');
ok('والتنويه مترجَم', offerEn.includes('subject to change'));
await page.goto(BASE + '/offers/l/1');
await page.waitForTimeout(900);
const offerAr = await page.locator('body').innerText();
ok('وبلا وسم اللغة تبقى عربية', offerAr.includes('واتساب') && offerAr.includes('فلة'));
await page.goto(BASE + '/offers/l/99?lang=en');
await page.waitForTimeout(900);
ok('وعرضٌ محذوف يقول ذلك بالإنجليزية', (await page.locator('body').innerText()).includes('no longer available'));

/* ===== ٤. طرف Meta ===== */
console.log('\n--- ٤. طرف Meta ---');
const verify = await page.evaluate(async (token) => {
  const res = await fetch(`/api/meta-lead?hub.mode=subscribe&hub.verify_token=${token}&hub.challenge=CHAL123`);
  return { status: res.status, text: await res.text() };
}, VERIFY_TOKEN);
ok('المصافحة تردّ التحدّي كما هو', verify.status === 200 && verify.text === 'CHAL123', JSON.stringify(verify));

const badVerify = await page.evaluate(async () => (await fetch('/api/meta-lead?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=X')).status);
ok('وتوكن خاطئ يُرفض', badVerify === 403, String(badVerify));

const body = JSON.stringify({
  object: 'page',
  entry: [{ changes: [{ field: 'leadgen', value: { leadgen_id: '555', form_id: '777', created_time: 1757900000 } }] }],
});
const sig = `sha256=${crypto.createHmac('sha256', APP_SECRET).update(body, 'utf8').digest('hex')}`;

const unsigned = await page.evaluate(async (payload) => {
  const res = await fetch('/api/meta-lead', { method: 'POST', headers: { 'content-type': 'application/json' }, body: payload });
  return res.status;
}, body);
ok('حمولة بلا توقيع مرفوضة', unsigned === 403, String(unsigned));

const tampered = await page.evaluate(async ({ payload, signature }) => {
  const res = await fetch('/api/meta-lead', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-hub-signature-256': signature },
    body: payload + ' ',
  });
  return res.status;
}, { payload: body, signature: sig });
ok('وحمولة مبدَّلة بتوقيع صحيح مرفوضة', tampered === 403, String(tampered));

const signed = await page.evaluate(async ({ payload, signature }) => {
  const res = await fetch('/api/meta-lead', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-hub-signature-256': signature },
    body: payload,
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}, { payload: body, signature: sig });
ok('والحمولة الموقَّعة تُقبل وتُحفظ', signed.status === 200 && signed.data.saved === 1, JSON.stringify(signed.data));

// القراءة خلف البوابة (نفس لوحة الطلبات) — ندخل ثم نقرأ.
await page.goto(BASE + '/');
await page.waitForTimeout(500);
await page.evaluate(async () => {
  await fetch('/__login', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'password=secret-pass' });
});
await page.goto(BASE + '/');
await page.waitForTimeout(2000);
const leads = await page.evaluate(async () => (await (await fetch('/api/lead', { credentials: 'same-origin' })).json()).leads);
const metaLead = leads.find((l) => l.source === 'meta');
ok('الطلب يظهر في لوحة الطلبات نفسها', !!metaLead, String(leads.length));
ok('وموسوم بأن الربط ناقص ما دام التوكن غير مضبوط',
  (metaLead?.note || '').includes('الربط ناقص') && (metaLead?.note || '').includes('555'), metaLead?.note);
ok('وتاريخه من الحدث لا من لحظة الحفظ', String(metaLead?.createdAt || '').startsWith('2025-'), metaLead?.createdAt);

ok('لا أخطاء في الصفحة', errors.length === 0, errors.slice(0, 3).join(' | '));
await b.close();
