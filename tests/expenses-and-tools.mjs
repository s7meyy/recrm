// المرحلة ١٣: المصاريف وصافي الربح، سبب الرفض، الأهداف، التجديد، العرض البائت،
// وضع العرض للعميل، المقارنة والكتالوج، الغلاف، والإرسال للمطابقين.
import { chromium } from './pw.mjs';

const BASE = process.env.TEST_URL || 'http://127.0.0.1:8235';
const b = await chromium.launch();
const ctx = await b.newContext({ locale: 'ar-SA' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !t.includes('ERR_') && !t.includes('favicon')) errors.push(t); });
const ok = (n, c, x = '') => console.log(`${c ? 'PASS' : 'FAIL'} — ${n}${x ? ' :: ' + x : ''}`);

await page.addInitScript(() => { window.print = () => { window.__printed = (window.__printed || 0) + 1; }; });
await page.goto(BASE + '/');
await page.waitForTimeout(2200);

/* ===== قاعدة البيانات ===== */
const db = await page.evaluate(async () => new Promise((res) => {
  const rq = indexedDB.open('motabiq');
  rq.onsuccess = () => { const d = rq.result; res({ v: d.version, stores: [...d.objectStoreNames] }); d.close(); };
}));
ok('ترقية القاعدة إلى ٤ مع مخزن المصاريف', db.v === 4 && db.stores.includes('expenses'), `v${db.v}`);

/* ===== ٣) المصاريف وصافي الربح ===== */
console.log('\n--- المصاريف وصافي الربح ---');
const profit = await page.evaluate(async () => {
  const { repo } = await import('/js/data/repository.js');
  const { monthlySummary } = await import('/js/pages/expenses.js');
  const now = new Date().toISOString();
  const deal = await repo.deals.create({ date: now, finalPrice: 1000000, commission: 30000 });
  await repo.expenses.create({ date: now, amount: 1200, category: 'fuel', note: 'وقود الجولة', dealId: deal.id });
  await repo.expenses.create({ date: now, amount: 800, category: 'ads', note: 'إعلان' });
  let rejected = 'قُبل';
  try { await repo.expenses.create({ date: now, amount: 0, category: 'fuel' }); } catch (e) { rejected = e.message; }
  let badCat = 'قُبل';
  try { await repo.expenses.create({ date: now, amount: 10, category: 'nope' }); } catch (e) { badCat = e.message; }
  const rows = monthlySummary({ expenses: await repo.expenses.list(), deals: await repo.deals.list(), months: 3 });
  return { rows: rows[0], rejected, badCat, dealId: deal.id };
});
ok('صافي الربح = العمولات − المصاريف', profit.rows.commission >= 30000 && profit.rows.expenses >= 2000
  && profit.rows.net === profit.rows.commission - profit.rows.expenses, JSON.stringify(profit.rows));
ok('مبلغ صفر مرفوض', profit.rejected.includes('أكبر من صفر'), profit.rejected);
ok('تصنيف غير معروف مرفوض', profit.badCat.includes('تصنيف'), profit.badCat);

await page.evaluate(() => { location.hash = '#/expenses'; });
await page.waitForTimeout(1500);
const expText = await page.locator('#page').innerText();
ok('صفحة المصاريف تعرض الملخّص الشهري', expText.includes('صافي ربح هذا الشهر') && expText.includes('وقود الجولة'), expText.split('\n').slice(0, 3).join(' | '));

/* حذف الصفقة يفكّ ربط المصروف ولا يحذفه */
const detach = await page.evaluate(async (dealId) => {
  const { repo } = await import('/js/data/repository.js');
  const before = (await repo.expenses.list()).length;
  await repo.deals.remove(dealId);
  const after = await repo.expenses.list();
  return { before, after: after.length, linked: after.filter((e) => e.dealId).length };
}, profit.dealId);
ok('حذف الصفقة يُبقي المصروف ويفكّ ربطه', detach.before === detach.after && detach.linked === 0, JSON.stringify(detach));

/* ===== ٨) سبب الرفض ===== */
console.log('\n--- سبب الرفض ---');
const reason = await page.evaluate(async () => {
  const { repo } = await import('/js/data/repository.js');
  const c = await repo.clients.create({ name: 'رافض', phone: '0588880001' });
  const r = await repo.requests.create({ clientId: c.id, type: 'villa', purpose: 'sale', city: 'الرياض' });
  const p = await repo.properties.create({ city: 'الرياض', district: 'الياسمين', type: 'villa', purposes: ['sale'], price: 1, area: 1 });
  const m = await repo.matches.create({ requestId: r.id, propertyId: p.id, status: 'not_interested', rejectReason: 'price' });
  let bad = 'قُبل';
  try { await repo.matches.update(m.id, { rejectReason: 'nonsense' }); } catch (e) { bad = e.message; }
  return { saved: (await repo.matches.get(m.id)).rejectReason, bad };
});
ok('سبب الرفض يُحفظ على المطابقة', reason.saved === 'price', reason.saved);
ok('سبب غير معروف مرفوض', reason.bad.includes('سبب الرفض'), reason.bad);

await page.evaluate(() => { location.hash = '#/dashboard'; });
await page.waitForTimeout(1800);
const dash = await page.locator('#page').innerText();
ok('الداشبورد يعرض صافي الربح', dash.includes('صافي الربح') && dash.includes('صافي هذا الشهر'));
ok('ولوحة لماذا تضيع الصفقات بالسبب', dash.includes('لماذا تضيع الصفقات') && dash.includes('السعر مرتفع'), dash.split('\n').filter((l) => l.includes('السعر مرتفع')).join());

/* ===== ١٠+٩+١١) الأهداف والتجديد والعرض البائت في «يومي» ===== */
console.log('\n--- الأهداف والتجديد والبائت ---');
await page.evaluate(async () => {
  const { repo } = await import('/js/data/repository.js');
  const { setGoals } = await import('/js/data/settings.js');
  await setGoals({ dealsPerMonth: 3, commissionPerMonth: 60000, staleListingDays: 30 });
  const soon = new Date(Date.now() + 20 * 86400000).toISOString();
  await repo.deals.create({ date: new Date().toISOString(), finalPrice: 500000, commission: 15000, leaseEndAt: soon });
  const old = await repo.properties.create({ city: 'الرياض', district: 'حي بائت', type: 'villa', purposes: ['rent'], price: 90000, area: 300 });
  // إقدام تاريخ التحديث مباشرةً في المخزن (تجاوز مقصود للطبقة لتهيئة حالة قديمة)
  const { getAdapter } = await import('/js/data/repository.js');
  const rec = await getAdapter().get('properties', old.id);
  await getAdapter().put('properties', { ...rec, updatedAt: new Date(Date.now() - 90 * 86400000).toISOString() });
});
await page.evaluate(() => { location.hash = '#/today'; });
await page.waitForTimeout(2200);
const today = await page.locator('#page').innerText();
ok('شريط هدف الشهر يظهر بنسبته', today.includes('هدف الشهر') && today.includes('٪'), today.split('\n').filter((l) => l.includes('من')).slice(0, 2).join(' | '));
ok('تنبيه تجديد عقد الإيجار يظهر', today.includes('عقود إيجار تقترب نهايتها'));
ok('العرض البائت يظهر بمدّته', today.includes('عروض بائتة') && today.includes('حي بائت'), today.split('\n').filter((l) => l.includes('بائت')).slice(0, 2).join(' | '));

/* ===== ٥) وضع العرض للعميل ===== */
console.log('\n--- وضع العرض للعميل ---');
const bannerOffFirst = await page.evaluate(() => {
  const bar = document.getElementById('client-mode-banner');
  return { hidden: bar.hidden, display: getComputedStyle(bar).display };
});
ok('شريط الوضع مخفي فعلًا قبل التفعيل (لا تكفي سمة hidden وحدها)',
  bannerOffFirst.hidden && bannerOffFirst.display === 'none', JSON.stringify(bannerOffFirst));
const clientMode = await page.evaluate(async () => {
  const { toggleClientMode, clientModeOn } = await import('/js/util/client-mode.js');
  toggleClientMode();
  const hiddenLinks = [...document.querySelectorAll('.sidebar-nav a[data-route]')].filter((a) => a.hidden).map((a) => a.dataset.route);
  const on = clientModeOn();
  const bannerShown = !document.getElementById('client-mode-banner').hidden;
  const bodyClass = document.body.classList.contains('client-mode');
  return { on, hiddenLinks, bannerShown, bodyClass };
});
ok('الوضع يُفعَّل ويظهر شريطه', clientMode.on && clientMode.bannerShown && clientMode.bodyClass);
ok('روابط الصفحات الإدارية تُخفى', clientMode.hiddenLinks.includes('clients') && clientMode.hiddenLinks.includes('expenses'), clientMode.hiddenLinks.join(','));

await page.evaluate(() => { location.hash = '#/properties'; });
await page.waitForTimeout(1600);
const ownerHidden = await page.evaluate(() => {
  const cells = [...document.querySelectorAll('[data-sensitive]')];
  return { count: cells.length, allHidden: cells.every((c) => getComputedStyle(c).display === 'none') };
});
ok('بيانات المالك والمصدر مخفية فعليًا في الصفحة', ownerHidden.count > 0 && ownerHidden.allHidden, JSON.stringify(ownerHidden));

const restored = await page.evaluate(async () => {
  const { setClientMode } = await import('/js/util/client-mode.js');
  setClientMode(false);
  const cells = [...document.querySelectorAll('[data-sensitive]')];
  return cells.length === 0 || cells.some((c) => getComputedStyle(c).display !== 'none');
});
ok('إنهاء الوضع يُعيد كل شيء (إخفاء عرض لا حذف)', restored);

/* ===== ٦+٧) المقارنة والكتالوج والغلاف ===== */
console.log('\n--- المقارنة والكتالوج والغلاف ---');
await page.evaluate(() => { location.hash = '#/properties'; });
await page.waitForTimeout(1600);
const picks = page.locator('.card-pick');
await picks.nth(0).check();
await picks.nth(1).check();
await page.waitForTimeout(500);
ok('شريط التحديد يظهر بعدد المختار', (await page.locator('.selection-bar').innerText()).includes('2'), await page.locator('.selection-bar').innerText());
await page.locator('.selection-bar button:has-text("قارن")').click();
await page.waitForTimeout(700);
const compare = await page.locator('.modal').last().innerText();
ok('المقارنة تعرض المعايير جنبًا إلى جنب', compare.includes('سعر المتر') && compare.includes('المساحة') && compare.includes('الحالة'), compare.split('\n').slice(0, 4).join(' | '));
await page.locator('.modal button:has-text("اطبع الكتالوج")').click();
await page.waitForTimeout(1500);
const printed = await page.evaluate(() => ({ n: window.__printed || 0, txt: document.getElementById('print-root').innerText }));
ok('الكتالوج يُطبع بعقارين', printed.n >= 1 && printed.txt.includes('عروض مختارة'), `طبعات: ${printed.n}`);
await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));

const cover = await page.evaluate(async () => {
  const { repo } = await import('/js/data/repository.js');
  const p = await repo.properties.create({ city: 'الرياض', district: 'الغلاف', type: 'villa', purposes: ['sale'], images: ['img-a', 'img-b', 'img-c'] });
  const reordered = await repo.properties.update(p.id, { images: ['img-c', 'img-a', 'img-b'] });
  return reordered.images;
});
ok('ترتيب الصور يُحفظ كما رتّبته (الأولى هي الغلاف)', cover[0] === 'img-c', JSON.stringify(cover));

/* ===== ٤) اتفاقية الوساطة ===== */
console.log('\n--- اتفاقية الوساطة ---');
const agreement = await page.evaluate(async () => {
  const { printAgreement } = await import('/js/util/property-print.js');
  const { getLists, setCompany, getCompany } = await import('/js/data/settings.js');
  await setCompany({ name: 'مكتب كسّاب', phone: '0551234567', commissionPercent: 2.5, agreementDurationDays: 60, agreementTerms: 'بند تجريبي للاختبار.' });
  const lists = await getLists();
  await printAgreement({ type: 'villa', district: 'الياسمين', city: 'الرياض', area: 400, price: 2000000 },
    { lists, company: await getCompany(), owner: { name: 'مالك العقار', phone: '0509998887' } });
  const txt = document.getElementById('print-root').innerText;
  window.dispatchEvent(new Event('afterprint'));
  return txt;
});
ok('الاتفاقية تُملأ بالطرفين والعمولة والمدة',
  agreement.includes('مالك العقار') && agreement.includes('2.5٪') && agreement.includes('60 يومًا') && agreement.includes('بند تجريبي'),
  agreement.replace(/\n/g, ' | ').slice(0, 150));
ok('وفيها مكانا التوقيع', agreement.includes('الطرف الأول') && agreement.includes('الطرف الثاني'));

console.log('\nERRORS:', errors.length ? JSON.stringify(errors.slice(0, 4)) : 'none');
await b.close();
