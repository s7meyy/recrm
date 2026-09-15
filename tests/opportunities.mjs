// المرحلة ١٢: صفحة «الفرص» في متصفح حقيقي — الأرقام، التفصيل بالنقر، والملخّص في «يومي».
import { chromium } from './pw.mjs';

const BASE = process.env.TEST_URL || 'http://127.0.0.1:8235';
const b = await chromium.launch();
const page = await (await b.newContext({ locale: 'ar-SA' })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !t.includes('ERR_') && !t.includes('Failed to load resource') && !t.includes('favicon')) errors.push(t); });
const ok = (n, c, x = '') => console.log(`${c ? 'PASS' : 'FAIL'} — ${n}${x ? ' :: ' + x : ''}`);

await page.goto(BASE + '/');
await page.waitForTimeout(2200);

/* بيانات مضبوطة: حي «حي الفرصة» فيه طلبان بلا مخزون، وحي «حي التخمة» فيه مخزون بلا طلب */
await page.evaluate(async () => {
  const { repo } = await import('/js/data/repository.js');
  const c1 = await repo.clients.create({ name: 'طالب الفرصة', phone: '0577770001' });
  const c2 = await repo.clients.create({ name: 'طالب ثانٍ', phone: '0577770002' });
  await repo.requests.create({ clientId: c1.id, type: 'villa', purpose: 'sale', city: 'الرياض', districts: ['حي الفرصة'], budgetMax: 1500000, area: 300 });
  await repo.requests.create({ clientId: c2.id, type: 'villa', purpose: 'sale', city: 'الرياض', districts: ['حي الفرصة'], budgetMax: 1600000, area: 320 });
  await repo.properties.create({ city: 'الرياض', district: 'حي التخمة', type: 'villa', purposes: ['sale'], price: 2000000, area: 400 });
  await repo.properties.create({ city: 'الرياض', district: 'حي التخمة', type: 'villa', purposes: ['sale'], price: 2100000, area: 420 });
});

await page.evaluate(() => { location.hash = '#/opportunities'; });
await page.waitForTimeout(2000);
const text = await page.locator('#page').innerText();
ok('الصفحة تفتح وتشرح قاعدة القياس', text.includes('الطلب غير الملبّى لا عدد الطلبات'), text.split('\n')[0]);
ok('حي الفرصة يظهر في جدول العجز', text.includes('حي الفرصة'));
ok('حي التخمة يظهر في جدول التخمة', text.includes('تخمة') && text.includes('حي التخمة'));

const opportunityRow = await page.locator('.table tbody tr:has-text("حي الفرصة")').first().innerText();
ok('الصف يعرض طلبين بلا مطابقة وصفر مخزون', /\b2\b/.test(opportunityRow) && /\b0\b/.test(opportunityRow), opportunityRow.replace(/\n/g, ' | '));

/* التفصيل بالنقر: من يطلب هذا الحي؟ */
await page.locator('.table tbody tr:has-text("حي الفرصة")').first().locator('button:has-text("من يطلبه؟")').click();
await page.waitForTimeout(700);
const modalText = await page.locator('.modal').last().innerText();
ok('التفصيل يكشف أصحاب الطلبات بأسمائهم وجوالاتهم',
  modalText.includes('طالب الفرصة') && modalText.includes('طالب ثانٍ') && modalText.includes('057'),
  modalText.replace(/\n/g, ' | ').slice(0, 140));
ok('وميزانياتهم تظهر للتفاوض', modalText.includes('1,500,000') && modalText.includes('1,600,000'));
await page.keyboard.press('Escape');
await page.waitForTimeout(300);

/* التشخيص: بلا مخزون ← اقتنص */
const diag = await page.locator('.table tbody tr:has-text("حي الفرصة")').first().innerText();
ok('التشخيص يقول «لا مخزون لك» حين لا تملك شيئًا هناك', diag.includes('لا مخزون لك'), diag.replace(/\n/g, ' | '));

/* الدمج بالحي */
await page.locator('.toolbar input[type="checkbox"]').uncheck();
await page.waitForTimeout(800);
const collapsed = await page.locator('#page').innerText();
ok('إلغاء الفصل بالنوع يدمج الصفوف', collapsed.includes('كل الأنواع'), collapsed.split('\n').find((l) => l.includes('كل الأنواع')) || '');

/* الملخّص في «يومي» */
await page.evaluate(() => { location.hash = '#/today'; });
await page.waitForTimeout(2000);
const todayText = await page.locator('#page').innerText();
ok('«يومي» يعرض أعلى الأحياء عجزًا', todayText.includes('أحياء يطلبها عملاؤك ولا تملك فيها') && todayText.includes('حي الفرصة'),
  todayText.split('\n').filter((l) => l.includes('حي الفرصة')).join(' | '));

/* الاتساق مع المحرك: عقار يسدّ العجز يُسقطه من القائمة */
await page.evaluate(async () => {
  const { repo } = await import('/js/data/repository.js');
  await repo.properties.create({ city: 'الرياض', district: 'حي الفرصة', type: 'villa', purposes: ['sale'], price: 1450000, area: 310 });
});
await page.evaluate(() => { location.hash = '#/properties'; });
await page.waitForTimeout(600);
await page.evaluate(() => { location.hash = '#/opportunities'; });
await page.waitForTimeout(2000);
const after = await page.locator('#page').innerText();
const stillHot = await page.locator('.table tbody tr:has-text("حي الفرصة")').count();
ok('إضافة عقار مطابق تُسقط الحي من قائمة العجز فورًا',
  !after.split('تخمة')[0].includes('حي الفرصة') || stillHot === 0,
  `صفوف متبقية: ${stillHot}`);

console.log('\nERRORS:', errors.length ? JSON.stringify(errors.slice(0, 4)) : 'none');
await b.close();
