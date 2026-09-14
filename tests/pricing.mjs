// المرحلة ١٤: صفحة تقدير السعر في متصفح حقيقي — الملء من عقار، والتقدير، والصمت عند قلّة العيّنة.
import { chromium } from './pw.mjs';

const BASE = process.env.TEST_URL || 'http://127.0.0.1:8235';
const b = await chromium.launch();
const ctx = await b.newContext({ locale: 'ar-SA' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !t.includes('ERR_') && !t.includes('favicon')) errors.push(t); });
const ok = (n, c, x = '') => console.log(`${c ? 'PASS' : 'FAIL'} — ${n}${x ? ' :: ' + x : ''}`);

await page.goto(BASE + '/');
await page.waitForTimeout(2200);

/* بذرة: أربعة فلل في «النرجس» بأسعار معلومة + فيلا بلا سعر تُقدَّر */
const seeded = await page.evaluate(async () => {
  const { repo } = await import('/js/data/repository.js');
  const base = { city: 'الرياض', district: 'النرجس', type: 'villa', purposes: ['sale'], captureStatus: 'approved' };
  for (const [price, area] of [[2000000, 400], [2200000, 400], [2400000, 400], [2600000, 400]]) {
    await repo.properties.create({ ...base, price, area });
  }
  const target = await repo.properties.create({ ...base, price: null, area: 400, notes: 'عقار التقدير' });
  await repo.externalListings.create({ ...base, status: 'active', price: 2800000, area: 400 });
  return { targetId: target.id };
});

await page.evaluate(() => { location.hash = '#/pricing'; });
await page.waitForTimeout(1200);

/* الرابط في القائمة الجانبية */
ok('رابط «تقدير السعر» في القائمة الجانبية', await page.locator('.sidebar-nav a[data-route="pricing"]').count() === 1);

/* لا تقدير قبل المساحة */
const empty = await page.locator('#page').innerText();
ok('لا رقم قبل إدخال المساحة', empty.includes('اكتب المساحة'), empty.split('\n').slice(-1)[0]);

/* الملء من عقار عندك: العقار بلا سعر أول الخيارات */
const firstOption = await page.locator('.page-head select option:nth-child(2)').innerText();
ok('العقار بلا سعر يتصدّر قائمة الملء السريع', firstOption.includes('بلا سعر'), firstOption);
await page.locator('.page-head select').selectOption(seeded.targetId);
await page.waitForTimeout(700);

const text = await page.locator('#page').innerText();
// الرقم نفسه من عنصره لا من نصّ الصفحة كلها (ففي قائمة الاختيار أرقام أيضًا)
const shown = await page.locator('.estimate-main').innerText();
const num = (t) => Number(String(t).replace(/[^\d.]/g, '')) || 0;
const rangeLine = text.split('\n').find((l) => l.includes('النطاق المعقول')) || '';
const bounds = rangeLine.split('—').map(num).filter(Boolean);
ok('التقدير رقم موجب ظاهر في بطاقته', num(shown) > 0, shown);
ok('التقدير يقع داخل النطاق المعروض', bounds.length === 2 && bounds[0] <= num(shown) && num(shown) <= bounds[1],
  `${bounds.join(' – ')} / ${num(shown)}`);
ok('النطاق معروض', text.includes('النطاق المعقول'));
ok('حجم العيّنة معروض', text.includes('حجم العيّنة'));
ok('وسيط المتر معروض', text.includes('وسيط سعر المتر'));
ok('التحذير من أنه ليس تثمينًا معتمدًا ظاهر', text.includes('ليس تثمينًا معتمدًا'));
ok('جدول المقارَنات يشرح من أين جاء الرقم', text.includes('من أين جاء الرقم') && text.includes('السوق'));
ok('العقار المقدَّر نفسه لا يُحسب ضمن عيّنته (لا سعر له)', !text.includes('عقار التقدير'));

/* تغيير الغرض إلى الإيجار: لا عيّنة إيجار أصلًا فيجب أن يصمت */
await page.locator('.form-grid select').first().selectOption('rent');
await page.waitForTimeout(600);
const rentText = await page.locator('#page').innerText();
ok('لا تقدير للإيجار بلا عيّنة إيجار', rentText.includes('لا عيّنة كافية'), rentText.split('\n').slice(-2).join(' | '));

/* حي بلا بيانات: صمت كذلك أو تراجع مصرَّح به */
await page.locator('.form-grid select').first().selectOption('sale');
await page.waitForTimeout(400);
const districtSelect = page.locator('.form-grid select').nth(2);
await districtSelect.selectOption({ index: 1 });
await page.waitForTimeout(600);
const otherText = await page.locator('#page').innerText();
ok('حي آخر: إمّا صمت وإمّا تصريح بالتراجع إلى المدينة',
  otherText.includes('لا عيّنة كافية') || otherText.includes('تراجع الحساب إلى مستوى المدينة'),
  otherText.split('\n').slice(-2).join(' | '));

/* عقار مُسعَّر بمبالغة: يُستبعد من عيّنته، ويُقال لك إن سعره أعلى من التقدير */
const priced = await page.evaluate(async () => {
  const { repo } = await import('/js/data/repository.js');
  const p = await repo.properties.create({
    city: 'الرياض', district: 'النرجس', type: 'villa', purposes: ['sale'],
    captureStatus: 'approved', price: 9000000, area: 400,
  });
  return p.id;
});
await page.evaluate(() => { location.hash = '#/properties'; });
await page.waitForTimeout(500);
await page.evaluate(() => { location.hash = '#/pricing'; });
await page.waitForTimeout(1000);
await page.locator('.page-head select').selectOption(priced);
await page.waitForTimeout(800);
const pricedText = await page.locator('#page').innerText();
ok('السعر المطلوب المبالَغ يُوصف بأنه أعلى من التقدير', /السعر المطلوب .*أعلى من التقدير/.test(pricedText),
  (pricedText.split('\n').find((l) => l.includes('السعر المطلوب')) || '').slice(0, 90));
const comparables = await page.locator('.table tbody tr').allInnerTexts();
ok('العقار المقدَّر لا يقارن بنفسه', !comparables.some((r) => r.includes('22,500')), comparables.slice(0, 2).join(' | '));

ok('لا أخطاء جافاسكربت في الصفحة', errors.length === 0, errors.slice(0, 2).join(' | '));
await b.close();
