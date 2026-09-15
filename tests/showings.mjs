// المرحلة ٢٧ في متصفح حقيقي: جدولة معاينة من المطابقات، وتسجيل رأي العميل، ولوحاتها.
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

const dbInfo = await page.evaluate(() => new Promise((resolve) => {
  const req = indexedDB.open('motabiq');
  req.onsuccess = () => { const d = req.result; resolve({ v: d.version, has: d.objectStoreNames.contains('showings') }); d.close(); };
  req.onerror = () => resolve({ v: 0, has: false });
}));
ok('القاعدة مُرقّاة ومخزن المعاينات موجود', dbInfo.v >= 7 && dbInfo.has, JSON.stringify(dbInfo));

/* ===== بذرة: عميل وعقار وطلب يطابقه ===== */
const seed = await page.evaluate(async () => {
  const { repo } = await import('/js/data/repository.js');
  const client = await repo.clients.create({ name: 'ماجد العنزي', phone: '0544445555' });
  const property = await repo.properties.create({
    type: 'villa', city: 'الرياض', district: 'النرجس', area: 400, price: 1900000,
    captureStatus: 'approved', purposes: ['sale'], status: 'available',
  });
  const request = await repo.requests.create({
    clientId: client.id, type: 'villa', purpose: 'sale', city: 'الرياض',
    districts: ['النرجس'], budgetMax: 2100000, area: 400, status: 'active',
  });
  return { clientId: client.id, propertyId: property.id, requestId: request.id };
});

/* ===== ١. الجدولة من المطابقات ===== */
console.log('\n--- ١. جدولة معاينة ---');
await page.evaluate((id) => { location.hash = `#/matches/${id}`; }, seed.requestId);
await page.waitForTimeout(2200);
const showBtn = page.locator('.match-row', { hasText: 'النرجس' }).first().locator('button:has-text("معاينة")');
ok('زرّ المعاينة على صفّ المطابقة', await showBtn.count() >= 1);
await showBtn.first().click();
await page.waitForTimeout(700);
ok('النافذة تشرح ماذا يحدث بعد الموعد', (await page.locator('.modal').innerText()).includes('يسألك «يومي» عن رأي العميل'));
await page.locator('.modal button:has-text("احفظ الموعد")').click();
await page.waitForTimeout(1800);

const after = await page.evaluate(async ({ requestId, propertyId }) => {
  const { repo } = await import('/js/data/repository.js');
  const showings = await repo.showings.list();
  const matches = await repo.matches.list();
  const s = showings.find((x) => x.requestId === requestId);
  const m = matches.find((x) => x.requestId === requestId && x.propertyId === propertyId);
  return { showing: s, matchStatus: m?.status, count: showings.length };
}, seed);
ok('حُفظت المعاينة مربوطةً بطلبها وعميلها',
  after.showing?.clientId === seed.clientId && after.showing?.propertyId === seed.propertyId,
  JSON.stringify({ c: after.showing?.clientId === seed.clientId, p: after.showing?.propertyId === seed.propertyId }));
ok('وحالتها «مجدولة» بلا انطباع', after.showing?.status === 'scheduled' && !after.showing?.impression);
ok('والجدولة ترفع المطابقة إلى «عُرض»', after.matchStatus === 'presented', String(after.matchStatus));

/* ===== ٢. لوحة «معاينات قادمة» ===== */
console.log('\n--- ٢. لوحات «يومي» ---');
await page.evaluate(() => { location.hash = '#/today'; });
await page.waitForTimeout(2000);
let todayText = await page.locator('#page').innerText();
ok('الموعد يظهر في «معاينات قادمة»', todayText.includes('معاينات قادمة') && todayText.includes('النرجس'),
  todayText.split('\n').find((l) => l.includes('معاينات')) || '');

/* ===== ٣. السؤال عن الرأي بعد الموعد ===== */
// نُرجع الموعد خمس ساعات إلى الوراء فتصير المعاينة مستحقّة السؤال بمنطقها الحقيقي.
await page.evaluate(async (id) => {
  const { repo } = await import('/js/data/repository.js');
  const showings = await repo.showings.list();
  const s = showings.find((x) => x.requestId === id);
  await repo.showings.update(s.id, { at: new Date(Date.now() - 5 * 3600000).toISOString() });
}, seed.requestId);
await page.evaluate(() => { location.hash = '#/dashboard'; });
await page.waitForTimeout(700);
await page.evaluate(() => { location.hash = '#/today'; });
await page.waitForTimeout(2000);
todayText = await page.locator('#page').innerText();
ok('وبعد مضيّها تنتقل إلى «ما رأيه؟»', todayText.includes('ما رأيه؟'), todayText.split('\n').find((l) => l.includes('ما رأيه')) || '');
ok('ولم تعد في «معاينات قادمة»', !todayText.includes('معاينات قادمة'));

await page.locator('.today-panel').filter({ hasText: 'ما رأيه؟' }).locator('button:has-text("سجّل رأيه")').first().click();
await page.waitForTimeout(700);
ok('سبب الرفض مخفيّ حتى تختار «لم يعجبه»', await page.locator('.modal .field:has-text("لماذا؟")').isHidden());
await page.locator('.modal select').first().selectOption('disliked');
await page.waitForTimeout(300);
ok('ويظهر عند اختيارها', await page.locator('.modal .field:has-text("لماذا؟")').isVisible());
await page.locator('.modal select').nth(1).selectOption('price');
await page.locator('.modal textarea').fill('قال إن السعر أعلى من جاره بمئتي ألف');
await page.locator('.modal button:has-text("احفظ")').click();
await page.waitForTimeout(1800);

const feedback = await page.evaluate(async ({ requestId, propertyId }) => {
  const { repo } = await import('/js/data/repository.js');
  const s = (await repo.showings.list()).find((x) => x.requestId === requestId);
  const m = (await repo.matches.list()).find((x) => x.requestId === requestId && x.propertyId === propertyId);
  return { status: s?.status, impression: s?.impression, reason: s?.reason, notes: s?.notes, matchStatus: m?.status, matchReason: m?.rejectReason };
}, seed);
ok('الانطباع يرفع الحالة إلى «تمّت»', feedback.status === 'done' && feedback.impression === 'disliked', JSON.stringify(feedback.status));
ok('والسبب محفوظ مع ما قاله', feedback.reason === 'price' && feedback.notes.includes('مئتي ألف'), feedback.notes);
ok('و«لم يعجبه» يغلق المطابقة بالسبب نفسه',
  feedback.matchStatus === 'not_interested' && feedback.matchReason === 'price',
  JSON.stringify([feedback.matchStatus, feedback.matchReason]));

/* ===== ٤. اللوحة في الداشبورد وملف العميل ===== */
console.log('\n--- ٤. الأرقام ---');
await page.evaluate(() => { location.hash = '#/dashboard'; });
await page.waitForTimeout(2000);
const dashText = await page.locator('#page').innerText();
ok('لوحة المعاينات في الداشبورد', dashText.includes('المعاينات') && dashText.includes('معاينة ← صفقة'));
ok('وتذكر أن العيّنة صغيرة', dashText.includes('العيّنة صغيرة'));
ok('وسبب عدم الإعجاب مجموع', dashText.includes('لماذا لم يعجبهم'), dashText.split('\n').find((l) => l.includes('يعجبهم')) || '');
ok('ولا null نصًّا', !dashText.includes('null') && !dashText.includes('undefined'));

await page.evaluate((id) => { location.hash = `#/client/${id}`; }, seed.clientId);
await page.waitForTimeout(1800);
const clientText = await page.locator('#page').innerText();
ok('ومعايناته في ملفه', clientText.includes('معايناته') && clientText.includes('لم يعجبه'),
  clientText.split('\n').find((l) => l.includes('معاينات')) || '');

/* ===== ٥. التحقق يرفض ما لا معنى له ===== */
const invalid = await page.evaluate(async () => {
  const { repo } = await import('/js/data/repository.js');
  const out = {};
  try { await repo.showings.create({ at: new Date().toISOString() }); out.noClient = 'قُبلت'; }
  catch (e) { out.noClient = (e.errors || [e.message]).join('، '); }
  try { await repo.showings.create({ at: new Date().toISOString(), clientId: 'x' }); out.noProperty = 'قُبلت'; }
  catch (e) { out.noProperty = (e.errors || [e.message]).join('، '); }
  return out;
});
ok('معاينة بلا عميل مرفوضة', invalid.noClient.includes('عميل'), invalid.noClient);
ok('ومعاينة بلا عقار مرفوضة', invalid.noProperty.includes('عقار'), invalid.noProperty);

ok('لا أخطاء في الصفحة', errors.length === 0, errors.slice(0, 3).join(' | '));
await b.close();
