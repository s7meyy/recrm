// فحص شامل على مقاس الجوال (المرحلة ٣٣): كل صفحة تُفتح، بلا خطأ وبلا فيض أفقي.
//
// **يمرّ على كل المسارات لا على عيّنة منها:** الصفحات تتكاثر مرحلةً بعد مرحلة، وعطبٌ في
// صفحة لا تفتحها كل يوم يبقى مختبئًا حتى تحتاجها. وهذا الفحص هو ما يجعل «انظر إلى الموقع»
// جوابًا موثوقًا لا أملًا.
//
// والعرض ٣٩٠ بكسلًا: مقاس جوالٍ شائع، وعليه يُستعمل النظام فعلًا لا على شاشة مكتب.
import { chromium } from './pw.mjs';

const BASE = process.env.TEST_URL || 'http://127.0.0.1:8235';
const b = await chromium.launch();
const ctx = await b.newContext({ locale: 'ar-SA', viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
const ok = (n, c, x = '') => console.log(`${c ? 'PASS' : 'FAIL'} — ${n}${x ? ' :: ' + x : ''}`);

const errors = [];
page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`));
page.on('console', (m) => {
  const t = m.text();
  if (m.type() === 'error' && !t.includes('ERR_') && !t.includes('Failed to load resource')) errors.push(t);
});

await page.goto(BASE + '/');
await page.waitForTimeout(2600);

// نبذر ما يكفي كي تُرسم اللوحات على بيانات لا على فراغ — الصفحة الفارغة لا تكشف عطبًا.
await page.evaluate(async () => {
  const { repo } = await import('/js/data/repository.js');
  const client = await repo.clients.create({ name: 'عميل الفحص', phone: '0500001111' });
  const property = await repo.properties.create({
    type: 'villa', city: 'الرياض', district: 'النرجس', area: 400, price: 2000000,
    captureStatus: 'approved', purposes: ['sale'], status: 'agreed',
    agreementSignedAt: new Date(Date.now() - 85 * 86400000).toISOString(),
  });
  await repo.requests.create({
    clientId: client.id, type: 'villa', purpose: 'sale', city: 'الرياض',
    districts: ['النرجس'], budgetMax: 2200000, area: 400, status: 'active',
  });
  const deal = await repo.deals.create({
    date: new Date(Date.now() - 366 * 86400000).toISOString(),
    finalPrice: 1950000, commission: 48750, clientId: client.id, propertyId: property.id,
    payments: [{ dueAt: new Date(Date.now() - 3 * 86400000).toISOString(), amount: 4000 }],
  });
  await repo.showings.create({
    at: new Date(Date.now() + 86400000).toISOString(), clientId: client.id, propertyId: property.id,
  });
  await repo.invoices.create({
    type: 'invoice', number: 'SMOKE-1', date: new Date().toISOString(), clientName: 'عميل الفحص',
    vatRate: 15, items: [{ id: 'i1', description: 'عمولة', qty: 1, unitPrice: 48750 }],
  });
  await repo.expenses.create({ date: new Date().toISOString(), amount: 1500, category: 'ads', propertyId: property.id });
  return deal.id;
});

const ROUTES = [
  'today', 'dashboard', 'opportunities', 'properties', 'map', 'clients', 'tours',
  'requests', 'matches', 'external', 'pricing', 'calendar', 'invoices', 'expenses',
  'publish', 'tasks', 'notes', 'health', 'settings',
];

let overflowing = [];
let empty = [];

for (const route of ROUTES) {
  const before = errors.length;
  // ننتقل عبر صفحة وسيطة كي يُعاد البناء دائمًا (الموجّه لا يعيد بناء المسار نفسه).
  await page.evaluate(() => { location.hash = '#/__none'; });
  await page.waitForTimeout(150);
  await page.evaluate((r) => { location.hash = `#/${r}`; }, route);
  await page.waitForTimeout(1500);

  const state = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    inner: window.innerWidth,
    text: (document.getElementById('page')?.innerText || '').trim().length,
  }));
  if (state.scroll > state.inner + 1) overflowing.push(`${route} (${state.scroll}px)`);
  if (state.text < 20) empty.push(route);
  const fresh = errors.slice(before);
  if (fresh.length) console.log(`   ↳ ${route}: ${fresh[0].slice(0, 120)}`);
}

ok(`كل الصفحات (${ROUTES.length}) تُرسم محتوى`, empty.length === 0, empty.join(', '));
ok('ولا فيض أفقي على ٣٩٠ بكسلًا', overflowing.length === 0, overflowing.join(', '));
ok('ولا أخطاء في أي صفحة', errors.length === 0, errors.slice(0, 4).join(' | '));

// القائمة الجانبية تشمل الصفحات الجديدة، فلا تبقى صفحةٌ لا يُوصل إليها إلا بالعنوان.
const links = await page.evaluate(() => [...document.querySelectorAll('.sidebar-nav a')].map((a) => a.dataset.route));
const missing = ROUTES.filter((r) => !links.includes(r));
ok('وكل صفحة لها رابط في القائمة', missing.length === 0, missing.join(', '));

await b.close();
