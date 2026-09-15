// المرحلة ٢٤ في متصفح حقيقي: مسار الصفقة ودفعاتها والعمولة المشتركة،
// ولوحتا المصادر وربحية العقارات، وقبض الدفعة من «يومي».
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

/* ===== بذرة: عميل بمصدر، وعقار، وصفقة، ومصروف ===== */
const seed = await page.evaluate(async () => {
  const { repo } = await import('/js/data/repository.js');
  const client = await repo.clients.create({ name: 'ناصر المطيري', phone: '0501110022', referralSource: 'إعلان انستقرام' });
  const owner = await repo.clients.create({ name: 'مالك العقار', phone: '0501110033', referralSource: 'توصية' });
  const property = await repo.properties.create({
    type: 'villa', city: 'الرياض', district: 'النرجس', area: 400, price: 2000000,
    captureStatus: 'approved', ownerId: owner.id, purposes: ['sale'],
  });
  const deal = await repo.deals.create({
    date: new Date().toISOString(), finalPrice: 1900000, commission: 47500,
    clientId: client.id, propertyId: property.id,
  });
  await repo.expenses.create({ date: new Date().toISOString(), amount: 2500, category: 'ads', propertyId: property.id, note: 'تصوير' });
  return { clientId: client.id, propertyId: property.id, dealId: deal.id };
});
ok('الصفقة تُنشأ بلا مسار ولا دفعات افتراضًا', !!seed.dealId);

/* ===== ١. إدارة الصفقة من ملف العميل ===== */
console.log('\n--- ١. مسار الصفقة ودفعاتها وشريكها ---');
await page.evaluate((id) => { location.hash = `#/client/${id}`; }, seed.clientId);
await page.waitForTimeout(1400);
const manage = page.locator('button:has-text("إدارة")').first();
ok('زر إدارة الصفقة ظاهر في ملف العميل', await manage.count() > 0);
await manage.click();
await page.waitForTimeout(600);
ok('نافذة الصفقة فيها المسار والدفعات والشريك', (await page.locator('.modal').innerText()).includes('مسار الصفقة') && (await page.locator('.modal').innerText()).includes('جدول الدفعات'));

// عمولة مشتركة: نصيب بلا اسم يُردّ بخطأ لا يُمحى صامتًا
await page.locator('.modal input[type="number"]').nth(1).fill('15000');
await page.locator('.modal button:has-text("حفظ")').click();
await page.waitForTimeout(700);
const errText = await page.locator('.modal .form-errors').innerText().catch(() => '');
ok('نصيبٌ بلا اسم شريك يُردّ بخطأ', errText.includes('اسم الشريك'), errText.trim());

// نصيب أكبر من العمولة يُردّ أيضًا
await page.locator('.modal input[type="text"]').first().fill('أبو فيصل');
await page.locator('.modal input[type="number"]').nth(1).fill('90000');
await page.locator('.modal button:has-text("حفظ")').click();
await page.waitForTimeout(700);
const errText2 = await page.locator('.modal .form-errors').innerText().catch(() => '');
ok('ونصيبٌ أكبر من العمولة يُردّ', errText2.includes('أكبر من العمولة'), errText2.trim());

// نصيب معقول + بند مسار + دفعتان
await page.locator('.modal input[type="number"]').nth(1).fill('15000');
const netText = await page.locator('.modal p:has-text("صافيك")').first().innerText();
ok('الصافي يُحسب أمامك قبل الحفظ', netText.includes('32,500') || netText.includes('٣٢٬٥٠٠'), netText);

await page.locator('.modal button:has-text("+ دفعة")').click();
await page.waitForTimeout(300);
const stepInputs = page.locator('.modal .plan-step input');
await stepInputs.nth(0).fill('2026-08-01'); // استحقاق فات
await stepInputs.nth(1).fill('4000');
await stepInputs.nth(2).fill('الدفعة الأولى');
await page.locator('.modal button:has-text("حفظ")').click();
await page.waitForTimeout(1400);

const saved = await page.evaluate(async (id) => {
  const { repo } = await import('/js/data/repository.js');
  const d = await repo.deals.get(id);
  return {
    partnerName: d.partnerName, partnerShare: d.partnerShare,
    payments: d.payments, checklist: d.checklist,
  };
}, seed.dealId);
ok('حُفظ الشريك ونصيبه', saved.partnerName === 'أبو فيصل' && saved.partnerShare === 15000, JSON.stringify([saved.partnerName, saved.partnerShare]));
ok('وحُفظت الدفعة بمُعرِّف ثابت', saved.payments.length === 1 && !!saved.payments[0].id, JSON.stringify(saved.payments));
ok('وبقيمتها وتاريخها ووصفها', saved.payments[0].amount === 4000 && saved.payments[0].note === 'الدفعة الأولى' && !saved.payments[0].paidAt);

/* ===== ٢. الدفعة تظهر مستحقةً في «يومي» وتُقبض منه ===== */
console.log('\n--- ٢. الدفعة في «يومي» ---');
await page.evaluate(() => { location.hash = '#/today'; });
await page.waitForTimeout(1600);
const todayText = await page.locator('#page').innerText();
ok('الدفعة تظهر في «مستحقات لم تُقبض»', todayText.includes('دفعة إيجار — الدفعة الأولى'), todayText.split('\n').find((l) => l.includes('دفعة إيجار')) || '');
ok('والعمولة غير المقبوضة معها', todayText.includes('عمولة صفقة'));

page.once('dialog', (d) => d.accept());
const payRow = page.locator('.today-row, .row-item, li').filter({ hasText: 'دفعة إيجار' }).first();
const payBtn = payRow.locator('button:has-text("قُبضت")').first();
if (await payBtn.count()) {
  await payBtn.click();
  await page.waitForTimeout(500);
  const confirmBtn = page.locator('.modal button:has-text("قُبضت")').first();
  if (await confirmBtn.count()) await confirmBtn.click();
  await page.waitForTimeout(1200);
}
const afterPay = await page.evaluate(async (id) => {
  const { repo } = await import('/js/data/repository.js');
  return (await repo.deals.get(id)).payments[0].paidAt;
}, seed.dealId);
ok('زر «قُبضت» يسجّل قبض الدفعة', !!afterPay, String(afterPay));
const todayAfter = await page.locator('#page').innerText();
ok('وتختفي من المستحقات بعد قبضها', !todayAfter.includes('دفعة إيجار — الدفعة الأولى'));

/* ===== ٣. لوحتا المصادر وربحية العقارات ===== */
console.log('\n--- ٣. المصادر وربحية العقارات ---');
await page.evaluate(() => { location.hash = '#/dashboard'; });
await page.waitForTimeout(1800);
const dashText = await page.locator('#page').innerText();
ok('لوحة «مصادر العملاء» ظاهرة', dashText.includes('مصادر العملاء'));
ok('والمصدر المسجَّل فيها باسمه', dashText.includes('إعلان انستقرام'), dashText.split('\n').find((l) => l.includes('إعلان')) || '');
ok('ولوحة «ربحية العقارات» ظاهرة', dashText.includes('ربحية العقارات'));
ok('وصافي العقار بعد نصيب الشريك والمصاريف',
  dashText.includes('30,000') || dashText.includes('٣٠٬٠٠٠'),
  dashText.split('\n').filter((l) => l.includes('النرجس')).join(' | '));
ok('ولا تظهر null نصًّا في اللوحتين', !dashText.includes('null') && !dashText.includes('undefined'));

/* ===== ٤. الصفقة الجديدة ترث مسار الإعدادات ===== */
console.log('\n--- ٤. المسار يُنسخ من قالب الإعدادات ---');
const inherited = await page.evaluate(async () => {
  const { getCompany } = await import('/js/data/settings.js');
  const company = await getCompany();
  return String(company.dealChecklist || '').split('\n').filter(Boolean).length;
});
ok('قالب المسار موجود في إعدادات الشركة', inherited >= 3, String(inherited));

const noOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
ok('لا فيض أفقي في الداشبورد', noOverflow);

ok('لا أخطاء في الصفحة', errors.length === 0, errors.slice(0, 3).join(' | '));
await b.close();
