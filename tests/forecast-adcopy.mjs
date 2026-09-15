// المرحلة ٢٨ في متصفح حقيقي: لوحة التوقّع، ونافذة نصّ الإعلان، ونقاط المكالمة.
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

/* ===== ١. لوحة التوقّع ===== */
console.log('\n--- ١. العمولة المتوقَّعة ---');
await page.evaluate(() => { location.hash = '#/dashboard'; });
await page.waitForTimeout(2200);
let dashText = await page.locator('#page').innerText();
ok('اللوحة ظاهرة', dashText.includes('العمولة المتوقَّعة'));
ok('وتقول إنها تقدير لا وعد', dashText.includes('تقدير لا وعد'));

// نبني تاريخًا كافيًا وأنبوبًا معلومًا، فنقرأ رقمًا محسوبًا لا شعارًا.
const seeded = await page.evaluate(async () => {
  const { repo } = await import('/js/data/repository.js');
  const { setCompany } = await import('/js/data/settings.js');
  await setCompany({ commissionPercent: 2.5 });
  const client = await repo.clients.create({ name: 'عميل التوقّع', phone: '0561110000' });
  // المطابقة تحتاج عقارًا حقيقيًا (قاعدة المخزن منذ المرحلة ٣) — فنُنشئ واحدًا تُبنى عليه.
  const prop = await repo.properties.create({
    type: 'villa', city: 'الرياض', district: 'النرجس', area: 400, price: 1000000,
    captureStatus: 'approved', purposes: ['sale'],
  });
  const mk = async (status, budgetMax) => repo.requests.create({
    clientId: client.id, type: 'villa', purpose: 'sale', city: 'الرياض', status, budgetMax,
  });
  // تاريخ: ثلاثة منتهية بصفقاتها
  for (let i = 0; i < 3; i++) {
    const r = await mk('done', 1000000);
    await repo.matches.create({ requestId: r.id, propertyId: prop.id, status: 'won', score: 90 });
    await repo.deals.create({ date: new Date().toISOString(), finalPrice: 1000000, commission: 25000, clientId: client.id });
  }
  // أنبوب: طلبان نشطان بميزانية وثالث بلا ميزانية
  const a1 = await mk('active', 2000000);
  await repo.matches.create({ requestId: a1.id, propertyId: prop.id, status: 'interested', score: 80 });
  await mk('active', 1000000);
  await mk('active', null);
  return { clientId: client.id };
});
await page.evaluate(() => { location.hash = '#/today'; });
await page.waitForTimeout(600);
await page.evaluate(() => { location.hash = '#/dashboard'; });
await page.waitForTimeout(2200);
dashText = await page.locator('#page').innerText();
ok('وبعد بناء تاريخ كافٍ يظهر جدول المراحل', dashText.includes('أبدى اهتمامًا') && dashText.includes('احتمالك'),
  dashText.split('\n').filter((l) => l.includes('اهتمام')).join(' | '));
ok('والطلب بلا ميزانية يُذكر أنه خارج الحساب', /بلا ميزانية/.test(dashText),
  dashText.split('\n').find((l) => l.includes('ميزانية')) || '');
ok('ولا null نصًّا في اللوحة', !dashText.includes('null') && !dashText.includes('undefined'));

const forecast = await page.evaluate(async () => {
  const { repo } = await import('/js/data/repository.js');
  const { revenueForecast } = await import('/js/util/forecast.js');
  const [requests, matches, deals] = await Promise.all([repo.requests.list(), repo.matches.list(), repo.deals.list()]);
  return revenueForecast({ requests, matches, deals, commissionPercent: 2.5 });
});
ok('والمدى يحوي وسطه على بيانات حقيقية',
  forecast.ok && forecast.low <= forecast.expected && forecast.expected <= forecast.high,
  JSON.stringify([Math.round(forecast.low), Math.round(forecast.expected), Math.round(forecast.high)]));

/* ===== ٢. نصّ الإعلان ===== */
console.log('\n--- ٢. نصّ الإعلان ---');
const propId = await page.evaluate(async () => {
  const { repo } = await import('/js/data/repository.js');
  const p = await repo.properties.create({
    type: 'villa', city: 'الرياض', district: 'الملقا', area: 350, price: 2300000,
    captureStatus: 'approved', purposes: ['sale'], notes: 'واجهة شمالية ومصعد.',
  });
  location.hash = `#/properties/${p.id}`;
  return p.id;
});
await page.waitForTimeout(1800);
const shareBtn = page.locator('button:has-text("مشاركة")').first();
ok('استمارة العقار مفتوحة', await shareBtn.count() >= 1);
await shareBtn.click();
await page.waitForTimeout(700);
ok('زرّ نصّ الإعلان في قائمة المشاركة', await page.locator('button:has-text("نصّ إعلان جاهز")').count() >= 1);
await page.locator('button:has-text("نصّ إعلان جاهز")').first().click();
await page.waitForTimeout(900);
const adModal = page.locator('.modal').last();
const adText = await adModal.innerText();
ok('القنوات الثلاث معروضة', adText.includes('بوّابة إعلانية') && adText.includes('انستقرام') && adText.includes('منشور قصير'));
// المانع النظاميّ والنقص التسويقيّ يُعرضان منفصلَين (المرحلة ٤٠): الأوّل يمنع، والثاني يُضعف.
ok('وتنبّه إلى المانع النظاميّ أوّلًا', adText.includes('مانعٌ نظاميّ') && adText.includes('ترخيص'),
  adText.split('\n').find((l) => l.includes('نظاميّ')) || '—');
ok('وتنبّه إلى النواقص قبل النشر', adText.includes('قبل أن تنشر') && adText.includes('صور'),
  adText.split('\n').find((l) => l.includes('قبل أن تنشر')) || '');
const firstBox = await adModal.locator('textarea').first().inputValue();
ok('ونصّ البوّابة مبنيّ من الحقول المسجَّلة', firstBox.includes('الملقا') && firstBox.includes('2,300,000') && firstBox.includes('واجهة شمالية'),
  firstBox.split('\n')[0]);
ok('ولا عبارات مخترعة', !/مميز|فرصة لا|استثنائي/.test(firstBox));
ok('وعدّاد الحروف ظاهر', /حرفًا/.test(adText));
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
await page.keyboard.press('Escape');
await page.waitForTimeout(600);

/* ===== ٣. نقاط المكالمة ===== */
console.log('\n--- ٣. نقاط المكالمة ---');
await page.evaluate(() => { document.getElementById('modal-root')?.replaceChildren(); location.hash = '#/settings'; });
await page.waitForTimeout(2200);
const settingsText = await page.locator('#page').innerText();
ok('لوحة النقاط في الإعدادات', settingsText.includes('نقاط المكالمات'));
ok('وتصرّح بأنها نصّ محض', settingsText.includes('لا يُنشئ مهمة'));

const books = await page.evaluate(async () => (await import('/js/data/settings.js')).getPlaybooks());
ok('نصوص جاهزة من أول تشغيل', books.length >= 3 && books[0].points.length >= 3, String(books.length));
ok('وفيها نصّ ما بعد المعاينة', books.some((b) => b.name.includes('بعد المعاينة')));

const saved = await page.evaluate(async () => {
  const { setPlaybooks, getPlaybooks } = await import('/js/data/settings.js');
  await setPlaybooks([{ name: 'نصّي', points: ['نقطة أولى', '', '  نقطة ثانية '] }, { name: 'فارغ', points: [] }]);
  return getPlaybooks();
});
ok('الحفظ ينظّف السطور الفارغة', saved.length === 1 && saved[0].points.length === 2, JSON.stringify(saved.map((b) => b.points)));
ok('والنصّ بلا نقاط لا يُحفظ', !saved.some((b) => b.name === 'فارغ'));

await page.evaluate(() => { location.hash = '#/today'; });
await page.waitForTimeout(2000);
const callBtn = page.locator('.today-row a[href^="tel:"], .today-row button:has-text("📞")').first();
if (await callBtn.count()) {
  await callBtn.click();
  await page.waitForTimeout(1400);
  const modalText = await page.locator('.modal').last().innerText().catch(() => '');
  ok('النقاط تظهر داخل نافذة تسجيل التواصل', modalText.includes('نقاط تقولها'), modalText.split('\n').find((l) => l.includes('نقاط')) || '');
  ok('ومطويّة افتراضيًا', !(await page.locator('.modal .playbook-box[open]').count()));
} else {
  ok('النقاط تظهر داخل نافذة تسجيل التواصل', false, 'لا صفّ فيه زرّ اتصال');
  ok('ومطويّة افتراضيًا', false, '');
}

ok('لا أخطاء في الصفحة', errors.length === 0, errors.slice(0, 3).join(' | '));
await b.close();
