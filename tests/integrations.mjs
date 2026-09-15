// المرحلة ٣٧ في متصفح حقيقي: التكاملات لا تدّعي، والحقول الجديدة تُحفظ، وحزمة إيجار تعمل الآن.
import { chromium } from './pw.mjs';

const BASE = process.env.TEST_URL || 'http://127.0.0.1:8235';
const b = await chromium.launch();
const ctx = await b.newContext({ locale: 'ar-SA', viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !t.includes('ERR_') && !t.includes('Failed to load resource')) errors.push(t); });
const ok = (n, c, x = '') => console.log(`${c ? 'PASS' : 'FAIL'} — ${n}${x ? ' :: ' + x : ''}`);

await page.goto(BASE + '/');
await page.waitForTimeout(2400);

/* ===== ١. الدليل كامل ولا يَعِد بما لا يفي ===== */
console.log('\n--- ١. دليل التكاملات ---');
const guide = await page.evaluate(async () => {
  const { INTEGRATION_GUIDE } = await import('/js/data/integrations.js');
  const keys = Object.keys(INTEGRATION_GUIDE);
  return {
    keys,
    allHaveSteps: keys.every((k) => (INTEGRATION_GUIDE[k].steps || []).length > 0),
    allHaveWhat: keys.every((k) => !!INTEGRATION_GUIDE[k].what),
    allHaveReality: keys.every((k) => !!INTEGRATION_GUIDE[k].reality),
    arabic: keys.every((k) => /[؀-ۿ]/.test(INTEGRATION_GUIDE[k].label)),
    ejarHonest: /لا تفتح واجهة برمجية عامة/.test(INTEGRATION_GUIDE.ejar.reality),
    ejarFree: INTEGRATION_GUIDE.ejar.freeNow === true,
  };
});
ok('السبعة في الدليل', guide.keys.length === 7, guide.keys.join(','));
ok('ولكلٍّ خطواتٌ بأسمائها', guide.allHaveSteps);
ok('ولكلٍّ ما يفعله', guide.allHaveWhat);
ok('ولكلٍّ ما يجب أن تعرفه قبل الاعتماد عليه', guide.allHaveReality);
ok('وكلّها بالعربية', guide.arabic);
ok('وإيجار تصرّح بأنها بلا واجهة عامة', guide.ejarHonest, guide.ejarHonest ? '' : 'وعدٌ لا يُوفى');
ok('وتُوسم بأنها تعمل جزئيًّا بلا اشتراك', guide.ejarFree);

/* ===== ٢. الصفحة تُفتح وتقول الحقيقة ===== */
console.log('\n--- ٢. الصفحة ---');
await page.evaluate(() => { location.hash = '#/integrations'; });
await page.waitForTimeout(2200);
const text = await page.locator('#page').innerText();
ok('صفحة التكاملات تُفتح', text.includes('التكاملات'), text.split('\n')[0]);
// على خادم الاختبار لا بوابة، فتُردّ القراءة — والصفحة تقول ذلك ولا تنهار
ok('وتقول إن الحالة تحتاج جلسة مالك', text.includes('جلسة مالك') || text.includes('جاهزة'),
  text.split('\n').slice(0, 3).join(' | '));
ok('ولا null نصًّا', !text.includes('null') && !text.includes('undefined'));

/* ===== ٣. التنفيذ بلا مفاتيح يقول ما ينقص ===== */
console.log('\n--- ٣. التنفيذ بلا مفاتيح ---');
const attempt = await page.evaluate(async () => {
  const { runIntegration, explain } = await import('/js/data/integrations.js');
  const res = await runIntegration('payments', 'link.create', { amount: 100 });
  return { ok: res.ok, status: res.status, message: explain(res, 'payments') };
});
ok('لا ينجح بلا تهيئة', attempt.ok === false, JSON.stringify(attempt));
ok('ورسالته تقول ما ينقص أو لماذا', /غير مُهيَّأ|تسجيل الدخول|للمالك|لا اتصال|\d{3}/.test(attempt.message),
  attempt.message);
ok('ولا يدّعي نجاحًا صامتًا', !/تمّ|نجح/.test(attempt.message), attempt.message);

/* ===== ٤. الحقول الجديدة تُحفظ ===== */
console.log('\n--- ٤. حقول العقد ---');
const saved = await page.evaluate(async () => {
  const { repo } = await import('/js/data/repository.js');
  const owner = await repo.clients.create({ name: 'مالك العقد', phone: '0501112222', nationalId: '1012345678' });
  const tenant = await repo.clients.create({ name: 'مستأجر العقد', phone: '0503334444', nationalId: '2098765432' });
  const property = await repo.properties.create({
    type: 'apartment', city: 'جدة', district: 'الحمراء', area: 180, price: 90000,
    captureStatus: 'approved', purposes: ['rent'], status: 'agreed',
    ownerId: owner.id, deedNumber: '310104012345',
  });
  const deal = await repo.deals.create({
    date: new Date().toISOString(), finalPrice: 90000, commission: 4500,
    clientId: tenant.id, propertyId: property.id,
    leaseEndAt: new Date(Date.now() + 365 * 86400000).toISOString(),
  });
  const back = await repo.properties.get(property.id);
  return { deed: back.deedNumber, ownerId: owner.id, nationalId: (await repo.clients.get(owner.id)).nationalId, dealId: deal.id, tenantId: tenant.id };
});
ok('رقم الصك يُحفظ على العقار', saved.deed === '310104012345', String(saved.deed));
ok('ورقم الهوية على العميل', saved.nationalId === '1012345678', String(saved.nationalId));

/* ===== ٥. حزمة عقد إيجار تعمل الآن ===== */
console.log('\n--- ٥. حزمة عقد إيجار ---');
const pkg = await page.evaluate(async (ids) => {
  const { repo } = await import('/js/data/repository.js');
  const { ejarPackage, ejarText, leaseMonths } = await import('/js/util/ejar-package.js');
  const { getCompany } = await import('/js/data/settings.js');
  const deal = await repo.deals.get(ids.dealId);
  const property = await repo.properties.get(deal.propertyId);
  const owner = await repo.clients.get(property.ownerId);
  const tenant = await repo.clients.get(ids.tenantId);
  const p = ejarPackage({ deal, property, tenant, owner, company: await getCompany() });
  return { filled: p.filled.length, missing: p.missing, text: ejarText(p), months: leaseMonths(deal) };
}, saved);
ok('الحزمة تملأ ما في السجلات', pkg.filled >= 12, String(pkg.filled));
ok('وتذكر المستأجر والمالك', pkg.text.includes('مالك العقد') && pkg.text.includes('مستأجر العقد'));
ok('ورقم الصك والهوية', pkg.text.includes('310104012345') && pkg.text.includes('1012345678'));
ok('ومدّة العقد محسوبة', pkg.months === 12, String(pkg.months));
ok('وما ينقص يُقال لا يُخمَّن', pkg.text.includes('ينقص من سجلاتك'), pkg.missing.join('، '));

/* ===== ٦. الفاتورة: زرّ السداد يقول ما ينقص ===== */
console.log('\n--- ٦. رابط السداد ---');
await page.evaluate(async () => {
  const { repo } = await import('/js/data/repository.js');
  await repo.invoices.create({
    type: 'invoice', number: 'PAY-1', date: new Date().toISOString(), clientName: 'عميل السداد',
    vatRate: 15, items: [{ id: 'i1', description: 'عمولة', qty: 1, unitPrice: 10000 }],
  });
});
await page.evaluate(() => { location.hash = '#/invoices'; });
await page.waitForTimeout(2200);
await page.locator('tbody tr').filter({ hasText: 'PAY-1' }).first().click();
await page.waitForTimeout(1200);
const invText = await page.locator('.modal').last().innerText();
ok('نافذة الفاتورة تُفتح', invText.length > 20, invText.split('\n')[0]);

ok('لا أخطاء في الصفحة', errors.length === 0, errors.slice(0, 3).join(' | '));
await b.close();
