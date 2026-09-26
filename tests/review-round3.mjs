// المرحلة ٥٩ — الدفعة الثالثة من المراجعة (ج/د): البنود ٢٠–٢٢ و٢٤–٣٠. تُقاس بالبكسل وبالعدّ.
import { chromium } from './pw.mjs';
const BASE = process.env.TEST_URL || 'http://127.0.0.1:8235';
const b = await chromium.launch();
const ok = (n, c, x = '') => console.log(`${c ? 'PASS' : 'FAIL'} — ${n}${x ? ' :: ' + x : ''}`);

async function open(viewport) {
  const ctx = await b.newContext({ locale: 'ar-SA', viewport, isMobile: viewport.width < 500, hasTouch: viewport.width < 500 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(BASE + '/');
  await page.waitForTimeout(2400);
  const go = async (h, ms = 1400) => { await page.evaluate((x) => { location.hash = x; }, h); await page.waitForTimeout(ms); };
  return { page, errors, go };
}

/* ===== الحاسوب ===== */
const d = await open({ width: 1366, height: 900 });

console.log('--- ٢٥: تنبيه البيانات التجريبية لا يبقى ---');
await d.page.waitForTimeout(5000);
ok('بعد سبع ثوانٍ لا تنبيهَ عالقًا أسفل الشاشة', await d.page.locator('.toast').count() === 0, String(await d.page.locator('.toast').count()));

console.log('--- ٢١: الإعدادات مطويّة على الحاسوب وتتذكّر ---');
await d.go('#/settings', 1600);
const panelsAll = await d.page.locator('#page .set-fold').count();
const openCount = await d.page.locator('#page .set-fold.set-open').count();
const height = await d.page.evaluate(() => document.documentElement.scrollHeight);
ok('اللوحة الأولى وحدها مفتوحة', panelsAll > 20 && openCount === 1, `${openCount}/${panelsAll}`);
ok('وطول الصفحة دون ٤٠٠٠ بكسل (كان ١٦٬٠٠٠)', height < 4000, `${height}px`);
const second = d.page.locator('#page .set-fold').nth(1);
await second.locator('.set-fold-toggle').click();
await d.page.waitForTimeout(300);
ok('الضغط على العنوان يفتح اللوحة', await second.evaluate((n) => n.classList.contains('set-open')));
await d.page.reload();
await d.page.waitForTimeout(2400);
await d.go('#/settings', 1600);
ok('وتبقى مفتوحةً بعد إعادة التحميل', await d.page.locator('#page .set-fold').nth(1).evaluate((n) => n.classList.contains('set-open')));
await d.page.locator('.settings-nav button:has-text("افتح الكل")').click();
await d.page.waitForTimeout(300);
ok('«افتح الكل» يفتح الكل', await d.page.locator('#page .set-fold:not(.set-open)').count() === 0);
await d.page.locator('.settings-nav button:has-text("اطوِ الكل")').click();
await d.page.waitForTimeout(300);
ok('و«اطوِ الكل» يطويها', await d.page.locator('#page .set-fold.set-open').count() === 0);
await d.page.fill('.settings-nav input[type="search"]', 'الفريق');
await d.page.waitForTimeout(500);
ok('والبحث يفتح ما يوافقه', await d.page.locator('#page .set-fold.set-open:not([hidden])').count() >= 1);

console.log('--- ٢٦: المطابقات أعلى ثلاثٍ ثم الباقي ---');
await d.go('#/matches', 1800);
const block = d.page.locator('.match-block').filter({ has: d.page.locator('.match-more') }).first();
ok('طلبٌ فيه أكثر من ثلاث مطابقات يعرض ثلاثًا وزرًّا', await block.count() === 1 && await block.locator('.match-row:visible').count() === 3, String(await block.locator('.match-row:visible').count()));
const moreBtn = block.locator('.match-more');
const moreText = await moreBtn.innerText();
await moreBtn.click();
await d.page.waitForTimeout(300);
ok('والزرّ يعدّ الباقي ويُظهره', /أخرى/.test(moreText) && await block.locator('.match-row:visible').count() > 3, moreText);

console.log('--- ٢٧: الوارد والتكاملات سطرٌ والشرحُ مطويّ ---');
await d.go('#/inbox');
const inboxNotice = d.page.locator('#page .notice').first();
const nh = await inboxNotice.evaluate((n) => n.getBoundingClientRect().height);
ok('تنبيه الوارد بارتفاع سطرين لا خمسة، وفيه «كيف يعمل؟» مطويًّا', nh < 130 && await inboxNotice.locator('details').count() === 1 && !(await inboxNotice.locator('details').first().evaluate((n) => n.open)), `${Math.round(nh)}px`);
await d.go('#/integrations');
ok('وتنبيه التكاملات كذلك', (await d.page.locator('#page .notice').first().evaluate((n) => n.getBoundingClientRect().height)) < 110);

console.log('--- ٢٨: العروض الخارجية «أكمل الآن» ---');
await d.go('#/external');
const fix = d.page.locator('#page tbody button:has-text("أكمل الآن")');
ok('الصفّ الناقص فيه زرّ «أكمل الآن»', await fix.count() >= 1, String(await fix.count()));
await fix.first().click();
await d.page.waitForTimeout(500);
ok('والزرّ يفتح استمارة العرض', await d.page.locator('.modal').count() === 1);
await d.page.keyboard.press('Escape');

console.log('--- ٢٩: الأفكار تعرف الوارد ---');
await d.go('#/notes');
ok('سطرٌ يربط الصفحة بالوارد', await d.page.locator('#page .notes-inbox-hint a[href="#/inbox"]').count() === 1);

console.log('--- ٣٠: المالية بلا أشهرٍ صفريّة ---');
await d.go('#/expenses');
const quiet = d.page.locator('#page tr.month-quiet');
const quietBtn = d.page.locator('#page button:has-text("بلا حركة")');
ok('الأشهر الصفريّة مخفيّة وزرٌّ يعدّها', await quiet.count() >= 3 && await quiet.first().isHidden() && await quietBtn.count() === 1, `${await quiet.count()} · ${await quietBtn.innerText().catch(() => '')}`);
ok('والشهر الذي فيه رقم ظاهر', await d.page.locator('#page tbody tr:visible').filter({ hasText: '110,000' }).count() === 1);
await quietBtn.click();
await d.page.waitForTimeout(200);
ok('والزرّ يُظهرها', await quiet.first().isVisible());

/* ===== الجوّال ===== */
const m = await open({ width: 390, height: 844 });

console.log('--- ٢٠: الداشبورد أربعُ لوحاتٍ ثم «المزيد» ---');
await m.go('#/dashboard', 2000);
const visiblePanels = await m.page.locator('#page .dashboard-grid > .panel:visible').count();
const h0 = await m.page.evaluate(() => document.documentElement.scrollHeight);
const more = m.page.locator('#page .dash-more');
ok('أربع لوحاتٍ ظاهرة وزرّ «المزيد» يعدّ الباقي', visiblePanels <= 5 && await more.count() === 1 && /لوحة|لوحات/.test(await more.innerText()), `${visiblePanels} · ${await more.innerText().catch(() => '')}`);
ok('وطول الصفحة دون ٣٥٠٠ بكسل (كان ٨٠٠٠)', h0 < 3500, `${h0}px`);
await more.click();
await m.page.waitForTimeout(300);
ok('والضغط يُظهر الباقي', await m.page.locator('#page .dashboard-grid > .panel:visible').count() > visiblePanels);

console.log('--- ٢٢: التقويم قائمةً على الجوّال ---');
await m.go('#/calendar', 1600);
ok('أيامٌ فيها شيء فقط، لا شبكة', await m.page.locator('#page .agenda-day').count() >= 1 && await m.page.locator('#page .calendar-table').count() === 0, String(await m.page.locator('#page .agenda-day').count()));
const agendaH = await m.page.evaluate(() => document.documentElement.scrollHeight);
ok('وطولها دون ٢٠٠٠ بكسل (كان ٣٣٠٠)', agendaH < 2000, `${agendaH}px`);
ok('وكل موعدٍ هدفُ لمسٍ ٤٤', (await m.page.locator('#page .agenda-item').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height))).every((h) => h >= 44));

console.log('--- ٢٤: أهداف اللمس ---');
await m.go('#/tasks', 1600);
const arrows = await m.page.locator('#page .task-card-actions .btn:visible').evaluateAll((els) => els.map((e) => Math.round(Math.min(e.getBoundingClientRect().width, e.getBoundingClientRect().height))));
ok('أسهم المهامّ ٤٤ فأكثر', arrows.length > 0 && arrows.every((v) => v >= 44), arrows.slice(0, 5).join(','));
await m.go('#/rega', 1600);
const regaLinks = await m.page.locator('#page .rega-link a.strong').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
ok('روابط الهيئة ٤٤ فأكثر', regaLinks.length > 0 && regaLinks.every((v) => v >= 44), regaLinks.join(','));
await m.go('#/publish', 1600);
const bare = await m.page.locator('#page .table .check-bare').first().evaluate((e) => { const r = e.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; });
ok('مربّع الاختيار في جدول النشر بغلاف ٤٤', bare[0] >= 44 && bare[1] >= 44, bare.join('×'));
await m.go('#/map', 2200);
const zoom = await m.page.locator('.leaflet-control-zoom a').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().width)));
ok('أزرار تكبير الخريطة ٤٤', zoom.length === 2 && zoom.every((v) => v >= 44), zoom.join(','));

ok('بلا أخطاء صفحة', !d.errors.length && !m.errors.length, [...d.errors, ...m.errors].slice(0, 3).join(' | '));
await b.close();
