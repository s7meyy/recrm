// المرحلة ٣٨ — معاني ألوان الخريطة وفرزها من الدليل، والتجميع عند التصغير.
import { chromium } from './pw.mjs';
const BASE = process.env.TEST_URL || 'http://127.0.0.1:8235';
const b = await chromium.launch();
const page = await (await b.newContext({ locale: 'ar-SA' })).newPage();
const errors = [];
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
page.on('console', m => { const t = m.text(); if (m.type() === 'error' && !t.includes('ERR_') && !t.includes('Failed to load resource')) errors.push(t); });
const ok = (n, c, x = '') => console.log(`${c ? 'PASS' : 'FAIL'} — ${n}${x ? ' :: ' + x : ''}`);

await page.goto(BASE + '/');
await page.waitForTimeout(2200);

/* مخزون متنوّع: أراضٍ للبيع، شقق للإيجار، فلل للاثنين — ومتباعدةٌ حتى لا تتجمّع */
await page.evaluate(async () => {
  const { repo } = await import('/js/data/repository.js');
  // البذرة التجريبية تُدرَج في أول تشغيل؛ نمسحها حتى تكون الأعداد هنا معلومةً بيقين.
  for (const d of await repo.deals.list()) await repo.deals.remove(d.id);
  for (const p of await repo.properties.list()) await repo.properties.remove(p.id);
  for (const x of await repo.externalListings.list()) await repo.externalListings.remove(x.id);
  const base = { city: 'الرياض', captureStatus: 'approved', status: 'agreed', area: 400, price: 1000000 };
  const mk = (type, purposes, district, lat, lng) =>
    repo.properties.create({ ...base, type, purposes, district, location: { lat, lng } });
  await mk('land', ['sale'], 'النرجس', 24.83, 46.62);
  await mk('land', ['sale'], 'الياسمين', 24.82, 46.65);
  await mk('land', ['sale'], 'العارض', 24.90, 46.70);
  await mk('apartment', ['rent'], 'الملقا', 24.78, 46.58);
  await mk('apartment', ['rent'], 'حطين', 24.75, 46.60);
  await mk('villa', ['sale', 'rent'], 'قرطبة', 24.80, 46.80);
  await mk('floor', ['investment'], 'المونسية', 24.77, 46.78);
});
await page.evaluate(() => { location.hash = '#/clients'; });
await page.waitForTimeout(400);
await page.evaluate(() => { location.hash = '#/map'; });
await page.waitForTimeout(2200);

/* ===== مبدّل معنى اللون ===== */
console.log('\n--- ٣٨. معنى اللون ---');
ok('المبدّل فيه المعاني الثلاثة', await page.locator('.map-scheme .seg-btn').count() === 3);
ok('اللون يبدأ بالحالة', (await page.locator('.map-scheme .seg-btn.active').innerText()).trim() === 'الحالة');

const colorsOf = () => page.$$eval('.map-canvas path.leaflet-interactive', (ps) => ps.map((p) => p.getAttribute('fill')));
const statusColors = new Set(await colorsOf());
ok('بالحالة: كلّها لونٌ واحد (كلّها «موافق للتعاون»)', statusColors.size === 1, [...statusColors].join(','));

await page.locator('.map-scheme .seg-btn', { hasText: 'الغرض' }).click();
await page.waitForTimeout(700);
const purposeColors = await colorsOf();
ok('بالغرض: بيعٌ وإيجارٌ واستثمارٌ تتفرّق ألوانها', new Set(purposeColors).size === 3, [...new Set(purposeColors)].join(','));

await page.locator('.map-scheme .seg-btn', { hasText: 'النوع' }).click();
await page.waitForTimeout(700);
ok('بالنوع: أرضٌ وشقّةٌ وفلّةٌ ودورٌ أربعة ألوان', new Set(await colorsOf()).size === 4, [...new Set(await colorsOf())].join(','));

/* ===== الدليل يُقرأ ويُفرز به ===== */
console.log('\n--- ٣٨. دليل الألوان ---');
const legend = page.locator('.map-legend');
ok('الدليل يسمّي كل لون بكلمة لا بلونٍ وحده', (await legend.innerText()).includes('أرض') && (await legend.innerText()).includes('شقة'));
const landBtn = legend.locator('.map-legend-btn', { hasText: 'أرض' }).first();
ok('عدد الأراضي مكتوب في الدليل (٣)', (await landBtn.innerText()).includes('3'), (await landBtn.innerText()).trim());

await landBtn.click();
await page.waitForTimeout(800);
ok('الضغط على لونٍ يعرضه وحده', (await colorsOf()).length === 3, String((await colorsOf()).length));
ok('اللون المضغوط يُعلَّم مضغوطًا', await legend.locator('.map-legend-btn.active').count() === 1);
const chipActive = await page.locator('.filters .chip.active').allInnerTexts();
ok('والفرز نفسه ظهر في شريط الفلاتر (مصدرٌ واحد لا اثنان)', chipActive.some((t) => t.includes('أرض')), chipActive.join(' | '));

await landBtn.click();
await page.waitForTimeout(800);
ok('الضغط ثانيةً يمسح الفرز', (await colorsOf()).length === 7, String((await colorsOf()).length));

/* ===== «الكل» في فلاتر الخريطة ===== */
console.log('\n--- ٣٨. فلتر «الكل» ---');
const typeRow = page.locator('.filter-row', { hasText: 'النوع' }).first();
await typeRow.locator('.chip-all').click();
await page.waitForTimeout(700);
ok('«الكل» يحدّد كل الأنواع', (await typeRow.locator('.chip.active:not(.chip-all)').count()) >= 4);
await typeRow.locator('.chip-all').click();
await page.waitForTimeout(700);
ok('وضغطه ثانيةً يمسحها', (await typeRow.locator('.chip.active:not(.chip-all)').count()) === 0);

/* ===== التجميع عند التصغير ===== */
console.log('\n--- ٣٨. تجميع النقاط ---');
// التجميع لا يعمل إلا فوق ١٥ علامة (عتبة مقصودة)، فنُدخل عشرين نقطةً متلاصقة.
await page.evaluate(async () => {
  const { repo } = await import('/js/data/repository.js');
  for (let i = 0; i < 20; i++) {
    await repo.properties.create({
      city: 'الرياض', district: 'المتلاصقة', type: 'villa', purposes: ['sale'],
      captureStatus: 'approved', status: 'agreed', area: 300, price: 900000,
      location: { lat: 24.7100 + i * 0.0004, lng: 46.6700 + i * 0.0004 },
    });
  }
});
await page.evaluate(() => { location.hash = '#/clients'; });
await page.waitForTimeout(400);
await page.evaluate(() => { location.hash = '#/map'; });
await page.waitForTimeout(2200);

const dots = () => page.locator('.map-canvas path.leaflet-interactive').count();
const badges = () => page.locator('.map-cluster-badge').count();
const sumBadges = () => page.$$eval('.map-cluster-badge', (ns) => ns.reduce((s, n) => s + Number(n.textContent), 0));

const zoomOut = page.locator('.leaflet-control-zoom-out');
for (let i = 0; i < 7; i++) { await zoomOut.click(); await page.waitForTimeout(280); }
const clustered = await badges();
ok('عند التصغير تلتئم النقاط المتلاصقة في نقاطٍ مجمَّعة', clustered >= 1, `${clustered} تجمّع`);
ok('ولا تضيع نقطة: مجموع ما في التجمّعات + المفردة = ٢٧', (await sumBadges()) + (await dots()) === 27,
  `${await sumBadges()} + ${await dots()}`);

const biggestBefore = await page.$$eval('.map-cluster-badge', (ns) => Math.max(...ns.map((n) => Number(n.textContent))));
const zoomIn = page.locator('.leaflet-control-zoom-in');
for (let i = 0; i < 10; i++) { await zoomIn.click(); await page.waitForTimeout(280); }
const biggestAfter = await page.$$eval('.map-cluster-badge', (ns) => (ns.length ? Math.max(...ns.map((n) => Number(n.textContent))) : 0));
ok('وعند التكبير ينفرط التجمّع: أكبرُه يصغر', biggestAfter < biggestBefore, `${biggestBefore} ← ${biggestAfter}`);
ok('ونقاطٌ تقف وحدها بعد أن كانت مضمومة', (await dots()) > 0, String(await dots()));
ok('والمجموع لا يزال ٢٧', (await sumBadges()) + (await dots()) === 27, `${await sumBadges()} + ${await dots()}`);

console.log('\n' + (errors.length ? 'FAIL — أخطاء وحدة التحكّم :: ' + errors.join(' | ') : 'PASS — لا أخطاء في وحدة التحكّم'));
await b.close();
