// المرحلة ٥٠ في متصفح حقيقي: صفحةُ السوق — الاستيرادُ والمؤشّرُ والمقارنةُ والصدق.
import { chromium } from './pw.mjs';

const BASE = process.env.TEST_URL || 'http://127.0.0.1:8235';
const b = await chromium.launch();
const page = await (await b.newContext({ locale: 'ar-SA' })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => {
  const t = m.text();
  if (m.type() === 'error' && !t.includes('ERR_') && !t.includes('Failed to load resource')) errors.push(t);
});
const ok = (n, c, x = '') => console.log(`${c ? 'PASS' : 'FAIL'} — ${n}${x ? ' :: ' + x : ''}`);

await page.goto(BASE + '/');
await page.waitForTimeout(2400);

/* ===== ١. المخزن الجديد يعمل ===== */
console.log('--- ١. مخزن صفقات السوق ---');
const stored = await page.evaluate(async () => {
  const { repo } = await import('/js/data/repository.js');
  const rec = await repo.marketDeals.create({
    source: 'moj', date: '2026-08-01', city: 'الرياض', district: 'قرطبة',
    type: 'فيلا', purpose: 'sale', area: 400, price: 2000000,
  });
  return { perM: rec.pricePerM, fp: rec.fingerprint };
});
ok('سعرُ المتر يُحسب عند الحفظ لا عند العرض', stored.perM === 5000, String(stored.perM));
ok('والبصمةُ تُبنى من حقول الصفقة', stored.fp.includes('قرطبة') && stored.fp.includes('2026-08-01'), stored.fp);

const guarded = await page.evaluate(async () => {
  const { repo } = await import('/js/data/repository.js');
  const r = await repo.marketDeals.create({ date: '2026-08-02', city: 'الرياض', area: 0, price: 500000 });
  let rejected = false;
  try { await repo.marketDeals.create({ date: '', city: '' }); } catch (_) { rejected = true; }
  return { perM: r.pricePerM, rejected };
});
ok('**ومساحةٌ صفرٌ لا تُقسَم عليها** — `null` لا لا نهاية', guarded.perM === null, String(guarded.perM));
ok('وصفقةٌ بلا تاريخٍ ولا مدينةٍ تُرفض', guarded.rejected === true);

/* ===== ٢. الصفحة: الصدق أوّلًا ===== */
console.log('\n--- ٢. الصفحة ---');
await page.evaluate(() => { location.hash = '#/market'; });
await page.waitForTimeout(2200);
const text = await page.locator('#page').innerText();
ok('الصفحةُ تفتح', (await page.locator('#page h1').innerText()).includes('السوق'));
ok('وفي القائمة الجانبيّة بابُها', await page.evaluate(() => !!document.querySelector('a[data-route="market"]')));

await page.locator('#page details summary').first().click();
await page.waitForTimeout(400);
const sources = await page.locator('#page').innerText();
ok('وتُصنّف المصادرَ بصدق: مفتوحٌ ومجّانيّ', sources.includes('مفتوحٌ ومجّانيّ'));
ok('**ويُعرض ولا يُصدِّر آليًّا** — للبورصة والسجل', sources.includes('يُعرض ولا يُصدِّر'));
ok('**وباشتراك** — لسهيل وبسيطة', sources.includes('باشتراك') && sources.includes('سهيل') && sources.includes('بسيطة'));
ok('وتقول صراحةً أنّ لا سحبَ آليًّا اليوم', sources.includes('لا يُسحب شيءٌ آليًّا'));
ok('وتذكر المتغيّرات اللازمة للمدفوع', sources.includes('SUHAIL_API_KEY'), '');

/* ===== ٣. الاستيراد يقرأ ويقول ما تخطّى ===== */
console.log('\n--- ٣. الاستيراد ---');
await page.locator('#page button:has-text("استورد ملف صفقات")').first().click();
await page.waitForTimeout(800);
const modal = page.locator('.modal').last();
ok('نافذةُ الاستيراد تفتح', await modal.count() === 1);

const csv = [
  'تاريخ الصفقة,المدينة,الحي,نوع العقار,المساحة,قيمة الصفقة',
  '2026-08-01,الرياض,قرطبة,فيلا,400,2000000',
  '2026-08-02,الرياض,قرطبة,فيلا,410,2100000',
  '2026-08-03,الرياض,قرطبة,فيلا,390,1950000',
  '2026-08-04,الرياض,قرطبة,فيلا,400,2050000',
  '2026-08-05,الرياض,قرطبة,فيلا,420,2150000',
  '2026-03-01,الرياض,قرطبة,فيلا,400,1800000',
  '2026-03-02,الرياض,قرطبة,فيلا,400,1820000',
  '2026-03-03,الرياض,قرطبة,فيلا,400,1780000',
  '2026-08-06,الرياض,النرجس,شقة,150,1200000',
  '03/04/2026,الرياض,قرطبة,فيلا,400,2000000',
  '2026-08-07,,قرطبة,فيلا,400,2000000',
].join('\n');
await modal.locator('input[type="file"]').setInputFiles({ name: 'deals.csv', mimeType: 'text/csv', buffer: Buffer.from(csv, 'utf8') });
await page.waitForTimeout(900);
const preview = await modal.innerText();
ok('يقرأ الصفوفَ الصحيحة', /9\s*صفقات|٩/.test(preview) || preview.includes('9'), preview.split('\n').find((l) => l.includes('تُقرأ')) || '');
ok('**ويقول كم تخطّى ولماذا** لا يُسقط صامتًا',
  preview.includes('يُتخطّى') && preview.includes('لماذا'), preview.split('\n').find((l) => l.includes('يُتخطّى')) || '');

await modal.locator('button:has-text("استورد")').first().click();
await page.waitForTimeout(2500);
const after = await page.locator('#page').innerText();
ok('والمؤشّرُ يظهر بعد الاستيراد', after.includes('وسيطُ سعر المتر'), '');
ok('وفيه الحيُّ وعددُ صفقاته', after.includes('قرطبة'), '');
ok('**والعيّنةُ الصغيرةُ تُوسَم ولا تُحجب**', after.includes('عيّنة صغيرة'), '');
ok('ومدى البيانات يُقال', /البيانات من/.test(after), after.split('\n').find((l) => l.includes('البيانات من')) || '');

/* ===== ٤. التكرار لا يتضاعف ===== */
console.log('\n--- ٤. التكرار ---');
const before = await page.evaluate(async () => (await (await import('/js/data/repository.js')).repo.marketDeals.list()).length);
await page.locator('#page button:has-text("استورد ملف صفقات")').first().click();
await page.waitForTimeout(700);
const m2 = page.locator('.modal').last();
await m2.locator('input[type="file"]').setInputFiles({ name: 'deals.csv', mimeType: 'text/csv', buffer: Buffer.from(csv, 'utf8') });
await page.waitForTimeout(900);
await m2.locator('button:has-text("استورد")').first().click();
await page.waitForTimeout(2500);
const after2 = await page.evaluate(async () => (await (await import('/js/data/repository.js')).repo.marketDeals.list()).length);
ok('**إعادةُ استيراد الملفّ نفسِه لا تضاعف العدّ** — والبوّابات تُصدِّر مدًى يشمل ما سبق',
  after2 === before, `${before} → ${after2}`);

/* ===== ٥. مخزونك مقابل السوق ===== */
console.log('\n--- ٥. المقارنة ---');
await page.evaluate(async () => {
  const { repo } = await import('/js/data/repository.js');
  // **أربعةُ عقاراتٍ لا واحد**: بطاقةُ التقدير لا تُبنى دون حدِّ العيّنة من مخزونك أنت
  // (٣)، والقسمُ السادسُ يفحص سطرَ السوق داخلها — فلو صُنع عقارٌ واحدٌ لَغاب السطرُ
  // بسبب غياب البطاقة لا بسبب السوق.
  for (const price of [2600000, 2450000, 2500000, 2550000]) {
    await repo.properties.create({
      type: 'فيلا', city: 'الرياض', district: 'قرطبة', area: 400, price,
      captureStatus: 'approved', purposes: ['sale'], status: 'agreed',
    });
  }
  location.hash = '#/today';
});
await page.waitForTimeout(900);
await page.evaluate(() => { location.hash = '#/market'; });
await page.waitForTimeout(2400);
const cmpText = await page.locator('#page').innerText();
ok('لوحةُ «مخزونك مقابل السوق» تظهر', cmpText.includes('مخزونك مقابل السوق'));
ok('وفيها سعرُ مترك ووسيطُ الحي', cmpText.includes('سعر مترك') && cmpText.includes('وسيط الحي'));

const sentenceBtn = page.locator('#page button:has-text("الجملة للمالك")').first();
if (await sentenceBtn.count()) {
  await sentenceBtn.click();
  await page.waitForTimeout(700);
  const line = await page.locator('.modal').last().locator('textarea').inputValue();
  ok('**والجملةُ للمالك من أرقامٍ لا من رأي**',
    line.includes('بِيع فعلًا') && /صفقات|صفقة|صفقتين/.test(line), line);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
} else {
  ok('**والجملةُ للمالك من أرقامٍ لا من رأي**', false, 'لم يظهر الزرّ');
}

/* ===== ٦. التقدير يذكر ما بِيع فعلًا ===== */
console.log('\n--- ٦. وصلُه بالتقدير ---');
await page.evaluate(() => { location.hash = '#/pricing'; });
await page.waitForTimeout(2200);
const fill = page.locator('.head-actions select').first();
// **ويُنتقى عقارٌ مسعَّر**: بطاقةُ التقدير لا تُبنى لعقارٍ «بلا سعر»، فاختيارُ أوّلِ
// قرطبةٍ في القائمة قد يقع على عقارٍ بلا سعرٍ فيُتَّهم سطرُ السوق بغيابٍ سببُه غيرُه.
const target = await fill.evaluate((sel) => {
  const o = [...sel.options].find((x) => x.textContent.includes('قرطبة') && !x.textContent.includes('بلا سعر'));
  return o ? o.value : '';
});
if (target) {
  await fill.selectOption(target);
  await page.waitForTimeout(1500);
  const pricing = await page.locator('#page').innerText();
  // **والسطرُ لا يظهر بلا تقدير**: هو داخل بطاقة التقدير، والتقديرُ لا يُعطى لعيّنةٍ
  // دون الحدّ من **مخزونك أنت**. فيُفحص الشرطُ أوّلًا كي لا يُتَّهم السطرُ بغياب سببُه غيرُه.
  const estimated = pricing.includes('وسيط سعر المتر');
  ok('التقديرُ نفسُه ظهر (شرطُ ظهور سطر السوق)', estimated,
    pricing.split('\n').slice(0, 4).join(' | '));
  if (estimated) {
    ok('صفحةُ التقدير تذكر ما بِيع فعلًا بجانب تقديرها',
      pricing.includes('وما بِيع فعلًا'), pricing.split('\n').find((l) => l.includes('بِيع')) || '');
  }
} else {
  ok('صفحةُ التقدير تذكر ما بِيع فعلًا بجانب تقديرها', false, 'لا عقار قرطبة في قائمة الملء');
}

ok('لا أخطاء في الصفحة', errors.length === 0, errors.slice(0, 3).join(' | '));
await b.close();
