// المرحلة ١١: القوائم المخصّصة لعميل — الإنشاء، الرابط العام، عدّاد الفتح، والحماية.
import { chromium } from './pw.mjs';

const BASE = process.env.TEST_URL || 'http://127.0.0.1:8234';
const b = await chromium.launch();
const page = await (await b.newContext({ locale: 'ar-SA' })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const ok = (n, c, x = '') => console.log(`${c ? 'PASS' : 'FAIL'} — ${n}${x ? ' :: ' + x : ''}`);

/**
 * بوّابةُ ترخيص الإعلان (المرحلة ٤٧): عقارٌ بلا عقد وساطةٍ ولا ترخيصِ إعلان يُسأل عنه
 * قبل النشر. وبياناتُ الاختبار بلا عقودٍ ولا تراخيص — فيُجاب السؤالُ صراحةً كما يُجيبه
 * المستخدم: **«انشر الكلّ وأنا أعلم»**. والسؤالُ نفسُه مفحوصٌ في `publish-gate-unit`.
 */
async function answerLicenseGate(page) {
  const btn = page.locator('.modal button:has-text("انشر الكلّ وأنا أعلم")');
  try { await btn.waitFor({ timeout: 2500 }); await btn.click(); } catch (_) { /* لا مانعَ فلا سؤال */ }
}


await page.goto(BASE + '/');
await page.fill('input[type="password"]', 'secret-pass');
await page.click('button[type="submit"]');
await page.waitForTimeout(2500);

/* تجهيز: عقاران منشوران */
await page.evaluate(async () => {
  const { repo } = await import('/js/data/repository.js');
  const { setCompany, setPublishSettings } = await import('/js/data/settings.js');
  await setCompany({ name: 'مكتب كسّاب', phone: '0551234567' });
  const a = await repo.properties.create({ city: 'الرياض', district: 'الياسمين', type: 'villa', purposes: ['sale'], area: 400, price: 2500000, notes: 'فلة أ' });
  const c = await repo.properties.create({ city: 'الرياض', district: 'النرجس', type: 'land', purposes: ['sale'], area: 600, price: 1800000, notes: 'أرض ب' });
  await setPublishSettings({ token: 'test-publish-token', contactPhone: '0551234567', listingIds: [a.id, c.id] });
});
await page.evaluate(() => { location.hash = '#/publish'; });
await page.waitForTimeout(1500);
await page.locator('button:has-text("نشر الآن")').click();
await answerLicenseGate(page);
await page.waitForTimeout(3500);

/* إنشاء قائمة لعميل */
await page.locator('button:has-text("+ قائمة لعميل")').click();
await page.waitForTimeout(700);
const modal = page.locator('.modal').last();
await modal.locator('.form-grid input[type="text"]').first().fill('سعد التميمي');
await modal.locator('.form-grid textarea').first().fill('هذه العروض التي اخترتها لك.');
await modal.locator('.check-group input[type="checkbox"]').first().check();
await modal.locator('button:has-text("أنشئ الرابط")').click();
await page.waitForTimeout(1800);

const listRow = await page.locator('.panel:has-text("قوائم مخصّصة") .table tbody tr').first().innerText();
ok('القائمة أُنشئت وظهرت في الجدول', listRow.includes('سعد التميمي') && listRow.includes('لم يُفتح بعد'), listRow.replace(/\n/g, ' | '));

const slug = await page.evaluate(async () => {
  const res = await fetch('/api/client-list', { credentials: 'same-origin' });
  const data = await res.json();
  return data.lists[0]?.slug || '';
});
ok('للقائمة رمز عشوائي طويل يصعب تخمينه', slug.length >= 12, slug);

/* الفتح من متصفح آخر بلا تسجيل دخول */
const pubCtx = await b.newContext({ locale: 'ar-SA' });
const pub = await pubCtx.newPage();
await pub.goto(`${BASE}/offers/list.html?c=${slug}`);
await pub.waitForTimeout(1500);
const pubText = await pub.locator('body').innerText();
ok('الرابط يُفتح بلا تسجيل دخول', pubText.includes('سعد التميمي') || pubText.includes('عروض مختارة'), pubText.split('\n')[0]);
ok('يعرض العرض المختار وحده لا كل المنشور', (await pub.locator('.card').count()) === 1, `${await pub.locator('.card').count()} بطاقة`);
ok('السطر الترحيبي يظهر للعميل', pubText.includes('هذه العروض التي اخترتها لك'));

/* عدّاد الفتح */
await pub.reload();
await pub.waitForTimeout(1200);
const opens = await page.evaluate(async () => {
  const res = await fetch('/api/client-list', { credentials: 'same-origin' });
  return (await res.json()).lists[0]?.opens || 0;
});
ok('عدّاد الفتح يتقدّم مع كل فتحة', opens >= 2, String(opens));

/* الحماية */
const anon = await (await b.newContext()).newPage();
await anon.goto(BASE + '/');
const anonWrite = await anon.evaluate(async () => (await fetch('/api/client-list', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ slug: 'abcdefghij', refs: ['1'] }),
})).status);
ok('إنشاء قائمة بلا تسجيل دخول مرفوض', anonWrite === 401, String(anonWrite));
const badSlug = await anon.evaluate(async () => (await fetch('/api/client-list?slug=zzzzzzzzzzzz')).status);
ok('رمز غير موجود يعيد 404 لا بيانات', badSlug === 404, String(badSlug));

/* الحذف يوقف الرابط فورًا */
await page.evaluate(async (s) => {
  await fetch('/api/client-list', {
    method: 'DELETE', credentials: 'same-origin',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify({ slug: s }),
  });
}, slug);
const afterDelete = await pub.evaluate(async (s) => (await fetch(`/api/client-list?slug=${s}`)).status, slug);
ok('حذف القائمة يوقف الرابط فورًا', afterDelete === 404, String(afterDelete));

console.log('\nERRORS:', errors.length ? JSON.stringify(errors.slice(0, 3)) : 'none');
await b.close();
