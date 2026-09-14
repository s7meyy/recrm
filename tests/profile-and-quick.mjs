// المرحلة ٢٠ في متصفح حقيقي: ملف العميل، والبحث السريع، وحاسبة القسط.
import { chromium } from './pw.mjs';

const BASE = process.env.TEST_URL || 'http://127.0.0.1:8235';
const b = await chromium.launch();
const ctx = await b.newContext({ locale: 'ar-SA' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !t.includes('ERR_') && !t.includes('Failed to load resource')) errors.push(t); });
const ok = (n, c, x = '') => console.log(`${c ? 'PASS' : 'FAIL'} — ${n}${x ? ' :: ' + x : ''}`);

await page.goto(BASE + '/');
await page.waitForTimeout(2400);

/* ===== ١) ملف العميل ===== */
console.log('\n--- ١. ملف العميل ---');
const seeded = await page.evaluate(async () => {
  const { repo } = await import('/js/data/repository.js');
  const client = await repo.clients.create({ name: 'عبدالله الملف', phone: '0511111222', stage: 'negotiating', notes: 'ملاحظة داخلية' });
  await repo.clients.addContact(client.id, { type: 'call', date: new Date().toISOString(), note: 'مكالمة أولى' });
  const req = await repo.requests.create({ clientId: client.id, city: 'الرياض', districts: ['النرجس'], type: 'villa', purpose: 'sale', budgetMax: 3000000, area: 300, status: 'active' });
  const deal = await repo.deals.create({ date: new Date().toISOString(), finalPrice: 2000000, commission: 50000, clientId: client.id });
  await repo.invoices.create({ type: 'invoice', number: 'PRF-1', date: new Date().toISOString(), clientId: client.id, items: [{ description: 'عمولة', qty: 1, unitPrice: 50000 }] });
  return { id: client.id, req: req.id, deal: deal.id };
});
await page.evaluate((id) => { location.hash = `#/client/${id}`; }, seeded.id);
await page.waitForTimeout(1600);
const profile = await page.locator('#page').innerText();
ok('الملف يعرض اسم العميل ومرحلته', profile.includes('عبدالله الملف') && profile.includes('مهتم / تفاوض'), profile.split('\n')[0]);
ok('ويجمع طلباته', profile.includes('طلباته') && profile.includes('النرجس'));
ok('وسجل تواصله', profile.includes('مكالمة أولى'));
ok('وصفقاته وعمولتها غير المقبوضة', profile.includes('صفقاته') && profile.includes('لم تُقبض'));
ok('وفواتيره وحالة تحصيلها', profile.includes('PRF-1') && profile.includes('لم يُقبض'));
ok('ويجمع المستحق عليه في رأس الصفحة', profile.includes('مستحق لك عليه'));
ok('وملاحظاتك الداخلية موسومة حسّاسة', await page.locator('#page [data-sensitive]').count() > 0);
const bad = await page.evaluate(async () => { location.hash = '#/client/غير-موجود'; await new Promise((r) => setTimeout(r, 900)); return document.getElementById('page').innerText; });
ok('معرّف مجهول يعطي رسالة لا خطأ', bad.includes('غير موجود'), bad.split('\n')[0]);

/* ===== ٢) البحث السريع ===== */
console.log('\n--- ٢. البحث السريع ---');
await page.evaluate(() => { location.hash = '#/matches'; });
await page.waitForTimeout(1800);
await page.locator('button:has-text("بحث سريع")').click();
await page.waitForTimeout(800);
const modal = page.locator('.modal');
ok('النافذة تصرّح بأنها لا تحفظ شيئًا', (await modal.innerText()).includes('لا يُحفظ شيء'), '');
const beforeReqs = await page.evaluate(async () => (await (await import('/js/data/repository.js')).repo.requests.list()).length);
await modal.locator('input[type="number"]').first().fill('5000000');
await page.waitForTimeout(700);
const withResults = await modal.innerText();
ok('النتائج تظهر فورًا بلا إنشاء طلب', /مرشّحًا بالمحرك نفسه/.test(withResults), withResults.split('\n').find((l) => l.includes('مرشّح')) || '');
const afterReqs = await page.evaluate(async () => (await (await import('/js/data/repository.js')).repo.requests.list()).length);
ok('ولا سجل طلب يُكتب', beforeReqs === afterReqs, `${beforeReqs} → ${afterReqs}`);

// «احفظه طلبًا» ينقل المسودّة إلى الاستمارة
await modal.locator('button:has-text("احفظه طلبًا")').click();
await page.waitForTimeout(1800);
const formText = await page.locator('.modal').innerText().catch(() => '');
ok('«احفظه طلبًا» يفتح الاستمارة معبّأة', formText.includes('طلب') && (await page.locator('.modal').count()) === 1, formText.split('\n')[0] || 'لا نافذة');
const budgetValue = await page.locator('.modal input[type="number"]').first().inputValue().catch(() => '');
ok('والميزانية منقولة كما كتبتها', budgetValue === '5000000' || formText.includes('5000000'), budgetValue);
const hashNow = await page.evaluate(() => location.hash);
ok('والعنوان نُظّف فلا تُفتح الاستمارة في كل زيارة لاحقة', !hashNow.includes('new=quick'), hashNow);
const draftGone = await page.evaluate(() => sessionStorage.getItem('kassab:quick-request'));
ok('والمسودّة تُستهلك مرة واحدة', draftGone === null, String(draftGone));

/* ===== ٣) حاسبة القسط ===== */
console.log('\n--- ٣. حاسبة القسط ---');
// عيّنة كافية أولًا، وإلا صمتت الصفحة بحقّ ولم تظهر لوحة القسط أصلًا
const target = await page.evaluate(async () => {
  const { repo } = await import('/js/data/repository.js');
  const base = { city: 'الرياض', district: 'النرجس', type: 'villa', purposes: ['sale'], captureStatus: 'approved' };
  for (const [price, area] of [[2000000, 400], [2200000, 400], [2400000, 400], [2600000, 400]]) await repo.properties.create({ ...base, price, area });
  const t = await repo.properties.create({ ...base, price: null, area: 400 });
  return t.id;
});
await page.evaluate(() => { location.hash = '#/pricing'; });
await page.waitForTimeout(1600);
await page.locator('.page-head select').selectOption(target);
await page.waitForTimeout(900);
const pricingText = await page.locator('#page').innerText();
const hasPanel = pricingText.includes('وكم قسطه؟');
ok('لوحة القسط تظهر مع التقدير', hasPanel, hasPanel ? '' : pricingText.split('\n').slice(-2).join(' | '));
if (hasPanel) {
  ok('وتعرض القسط الشهري ومبلغ التمويل', pricingText.includes('القسط الشهري') && pricingText.includes('مبلغ التمويل'));
  ok('وتصرّح بأنها ليست عرض تمويل', pricingText.includes('ليس عرض تمويل'));
}

ok('لا أخطاء جافاسكربت في الصفحة', errors.length === 0, errors.slice(0, 2).join(' | '));
await b.close();
