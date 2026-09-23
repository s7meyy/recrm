// المرحلة ٥٤ — المرافقُ والإدارةُ والأقسام: صفحةٌ جديدة، وإضافةٌ من مكانها، وأقسامٌ بيدك.
import { chromium } from './pw.mjs';

const BASE = process.env.TEST_URL || 'http://127.0.0.1:8235';
const b = await chromium.launch();
const ctx = await b.newContext({ locale: 'ar-SA', viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => {
  const t = m.text();
  if (m.type() === 'error' && !t.includes('ERR_') && !t.includes('Failed to load resource')) errors.push(t);
});
const ok = (n, c, x = '') => console.log(`${c ? 'PASS' : 'FAIL'} — ${n}${x ? ' :: ' + x : ''}`);

await page.goto(BASE + '/');
await page.waitForTimeout(2400);

/* ===== ١. مخزنُ المرافق أُنشئ بالترقية ===== */
console.log('--- ١. القاعدة ---');
const db = await page.evaluate(() => new Promise((res) => {
  const rq = indexedDB.open('motabiq');
  rq.onsuccess = () => { const d = rq.result; res({ v: d.version, stores: [...d.objectStoreNames] }); d.close(); };
}));
ok('**مخزنُ المرافق أُنشئ ولم تُمسّ البيانات**', db.stores.includes('facilities'), `v${db.v}`);
ok('وبقيت المخازنُ القديمة', ['properties', 'prospects', 'tasks', 'marketDeals'].every((s) => db.stores.includes(s)));

/* ===== ٢. صفحةُ المرافق ===== */
console.log('\n--- ٢. إدارة المرافق ---');
await page.evaluate(() => { location.hash = '#/facilities'; });
await page.waitForTimeout(1600);
ok('الصفحةُ تفتح', (await page.locator('#page h1').innerText()).includes('إدارة المرافق'));
ok('وفي القائمة بابُها', await page.evaluate(() => !!document.querySelector('a[data-route="facilities"]')));
const intro = await page.locator('#page').innerText();
ok('**وتقول صراحةً أنّها أوّلُ صورةٍ تُوسَّع** — فلا يُخترع عملٌ لم يُطلب', intro.includes('أوّلُ صورةٍ للصفحة'));
ok('وفيها لوحةُ إضافةٍ من مكانها', await page.locator('#page h2:has-text("أضِف مرفقًا")').count() === 1);
ok('**وزرُّ عقارٍ جديدٍ يفتح استمارةَ العقارات القائمة** لا استمارةً ثانية',
  await page.locator('#page a[href="#/properties?new=1"]').count() >= 1);

await page.locator('#page button:has-text("+ مرفق عامّ")').click();
await page.waitForTimeout(700);
await page.locator('.modal input.input').first().fill('مصعد المبنى أ');
await page.locator('.modal button:has-text("حفظ")').click();
await page.waitForTimeout(1500);
ok('المرفقُ يُضاف ويظهر في الجدول', (await page.locator('#page').innerText()).includes('مصعد المبنى أ'));
ok('ويُحفظ في مخزنه', await page.evaluate(async () => {
  const { repo } = await import('/js/data/repository.js');
  return (await repo.facilities.list()).length === 1;
}));

/* ===== ٣. إدارة الأملاك: الإضافةُ من مكانها ===== */
console.log('\n--- ٣. إدارة الأملاك ---');
const seed = await page.evaluate(async () => {
  const { repo } = await import('/js/data/repository.js');
  const p = await repo.properties.create({ city: 'الرياض', district: 'الملقا', type: 'villa', price: 2000000 });
  return p.id;
});
await page.evaluate(() => { location.hash = '#/management'; });
await page.waitForTimeout(1600);
ok('**لوحةُ «أضِف عقارًا إلى الإدارة» في الصفحة نفسِها**',
  await page.locator('#page h2:has-text("أضِف عقارًا إلى الإدارة")').count() === 1);
ok('وفيها زرُّ عقارٍ جديد', await page.locator('#page a[href="#/properties?new=1"]').count() >= 1);
await page.selectOption('#page .panel select', seed);
await page.locator('#page button:has-text("أضِفه إلى الإدارة")').click();
await page.waitForTimeout(800);
ok('وتُسأل عن عقده وأجره قبل الإضافة', await page.locator('.modal:has-text("إدارة")').count() > 0);
await page.locator('.modal button:has-text("أضِفه")').click();
await page.waitForTimeout(1800);
ok('**والعقارُ يدخل الإدارة من هنا** لا من أربع خطوات', await page.evaluate(async (id) => {
  const { repo } = await import('/js/data/repository.js');
  return !!(await repo.properties.get(id))?.management;
}, seed));

/* ===== ٤. الأقسام: تسميةٌ وإضافةٌ وسحب ===== */
console.log('\n--- ٤. أقسامُ القائمة ---');
await page.evaluate(() => { location.hash = '#/settings'; });
await page.waitForTimeout(1600);
const boxes = await page.locator('.section-box').count();
ok('لوحةُ الأقسام تُعرض أقسامًا لا قائمةً مسطّحة', boxes >= 4, `${boxes} قسم`);
ok('ولكلّ صفحةٍ صفٌّ فيها',
  await page.locator('.page-order-row').count() === await page.evaluate(() => document.querySelectorAll('.sidebar-nav a[data-route]').length));
/* **والسحبُ من المقبض وحدَه، وبالمؤشّر لا بسحب المتصفّح** (المرحلة ٥٥).
   شكا صاحبُ المكتب: «إذا ضغطتُ يبقى الزرُّ معلّقًا ولا يتحرّك». فلا `draggable` بعد اليوم. */
ok('**ولا `draggable` في اللوحة** — فسحبُ المتصفّح لا يعمل باللمس ويعلق',
  await page.locator('.section-editor [draggable]').count() === 0);
const gripCss = await page.locator('.page-order-row .drag-grip').first().evaluate((g) => {
  const cs = getComputedStyle(g); const r = g.getBoundingClientRect();
  return { touch: cs.touchAction, w: Math.round(r.width), h: Math.round(r.height) };
});
ok('**والمقبضُ لا يُمرِّر الصفحةَ تحت الإصبع** (`touch-action: none`)', gripCss.touch === 'none', JSON.stringify(gripCss));
ok('ومساحتُه ٤٤ بكسلًا على الأقلّ', gripCss.w >= 44 && gripCss.h >= 44, JSON.stringify(gripCss));

/* ضغطةٌ على المقبض بلا حركة — **وهو عينُ ما علق عنده**: يجب ألّا يبقى شيءٌ معلّقًا */
{
  const g = page.locator('.page-order-row .drag-grip').nth(2);
  // **الفأرةُ المحاكاة لا تُمرِّر** — فمقبضٌ خارج الشاشة يُضغط الفراغُ مكانه ويمرّ الفحصُ كاذبًا.
  await g.scrollIntoViewIfNeeded();
  const b = await g.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(400);
}
ok('**ضغطةٌ على المقبض بلا حركة لا تترك شيئًا معلّقًا**',
  await page.locator('.dragging').count() === 0 && await page.locator('.drop-over').count() === 0
  && !(await page.evaluate(() => document.body.classList.contains('is-dragging'))));

// إعادةُ التسمية
const nameInput = page.locator('.section-box .section-name').first();
await nameInput.fill('الإدارة');
await nameInput.press('Enter');
await page.waitForTimeout(1200);
ok('**وإعادةُ التسمية تصل القائمةَ فورًا**',
  await page.evaluate(() => [...document.querySelectorAll('.sidebar-nav .nav-group')].some((h) => h.getAttribute('aria-label') === 'الإدارة')));

// **سحبٌ حقيقيّ**: أوّلُ صفحةٍ في القسم الثاني تُسحب فوق آخرِ صفحةٍ في الأوّل
// — قسمان متجاوران كما يسحب إنسانٌ يرى الاثنين، لا قفزةٌ عبر ثلاث شاشات.
let moving = null;
{
  const first = page.locator('.section-box').first().locator('.page-order-row');
  const n1 = await first.count();
  const lastOfFirst = await first.nth(n1 - 1).getAttribute('data-page');
  const src = page.locator('.section-box').nth(1).locator('.page-order-row').first();
  moving = await src.getAttribute('data-page');
  await src.scrollIntoViewIfNeeded();
  const from = await src.locator('.drag-grip').boundingBox();
  const to = await first.nth(n1 - 1).boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  // خطواتٌ متعدّدة كما تتحرّك يدٌ حقيقيّة — لا قفزةٌ واحدة
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 14 });
  const mid = await page.evaluate(() => ({
    dragging: document.querySelectorAll('.page-order-row.dragging').length,
    over: document.querySelectorAll('.page-order-row.drop-over').length,
  }));
  ok('وأثناء السحب يُرى المسحوبُ باهتًا والهدفُ مؤشَّرًا', mid.dragging === 1 && mid.over === 1, JSON.stringify(mid));
  await page.mouse.up();
  await page.waitForTimeout(1300);
  const keys = await page.locator('.section-box').first().locator('.page-order-row').evaluateAll((rs) => rs.map((r) => r.dataset.page));
  const at = keys.indexOf(moving);
  ok('**السحبُ ينقل الصفحةَ إلى قسمٍ آخر وفي موضعٍ بعينه** (قبل ما أُفلتت عليه)',
    at >= 0 && keys[at + 1] === lastOfFirst, `${moving} في الموضع ${at} · بعده ${keys[at + 1]}`);
  ok('ويصل القائمةَ الجانبيّةَ فورًا', await page.evaluate((k) => {
    const heads = [...document.querySelectorAll('.sidebar-nav .nav-group')];
    const a = document.querySelector(`.sidebar-nav a[data-route="${k}"]`);
    return heads.length && a && a.dataset.group === heads[0].dataset.group;
  }, moving));
  ok('ولا يبقى بعده شيءٌ معلّق', await page.locator('.dragging, .drop-over').count() === 0);
  // والسهمُ يعمل بعد السحب — فالسحبُ لا يأسر الصفحة
  const row = page.locator(`.section-box .page-order-row[data-page="${moving}"]`);
  const before = await page.locator('.section-box').first().locator('.page-order-row').evaluateAll((rs) => rs.map((r) => r.dataset.page));
  await row.locator('button[title="أعلى"]').click();
  await page.waitForTimeout(1100);
  const after = await page.locator('.section-box').first().locator('.page-order-row').evaluateAll((rs) => rs.map((r) => r.dataset.page));
  ok('**والسهمُ يعمل بعد السحب** — فلا يأسر السحبُ الصفحة',
    after.indexOf(moving) === before.indexOf(moving) - 1, `${before.indexOf(moving)} → ${after.indexOf(moving)}`);
}

// والكتابةُ في اسم القسم لا تبدأ سحبًا
{
  const ni = page.locator('.section-box .section-name').first();
  await ni.click();
  await page.mouse.down(); await page.mouse.move(10, 10, { steps: 3 }); await page.mouse.up();
  ok('والكتابةُ في اسم القسم لا تبدأ سحبًا', await page.locator('.dragging').count() === 0);
}

// قسمٌ جديد
await page.locator('#page button:has-text("+ قسم جديد")').click();
await page.waitForTimeout(500);
await page.locator('.modal input').first().fill('قسمي الخاصّ');
await page.locator('.modal button:has-text("أضِف")').click();
await page.waitForTimeout(1300);
/* **واسمُ القسم في حقلٍ لا في نصّ**، فلا يُبحث عنه بـ`has-text` — وهذا ما أخفق فيه أوّلُ
   صوغٍ لهذا الفحص: الحقلُ قيمتُه ليست محتوًى نصّيًّا، فالمِحدِّدةُ لا تراه أبدًا. */
const sectionNamed = (label) => page.evaluate((l) => {
  const box = [...document.querySelectorAll('.section-box')]
    .find((b) => b.querySelector('.section-name')?.value === l);
  return box ? { found: true, text: box.innerText } : { found: false, text: '' };
}, label);

let mine = await sectionNamed('قسمي الخاصّ');
ok('ويُضاف قسمٌ باسمٍ تختاره', mine.found);
ok('**والقسمُ الفارغ يقول أنّه ينتظر صفحة**', mine.text.includes('اسحب إليه صفحةً'), mine.text.slice(0, 60));

// السهمُ يعبر حدَّ القسم
const firstSecPages = await page.locator('.section-box').first().locator('.page-order-row').count();
await page.locator('.section-box').nth(1).locator('.page-order-row').first()
  .locator('button[title="أعلى"]').click();
await page.waitForTimeout(1200);
ok('**والسهمُ يعبر حدَّ القسم** — فالصفحةُ في رأس قسمها تصعد إلى ذيل الذي قبله',
  await page.locator('.section-box').first().locator('.page-order-row').count() === firstSecPages + 1,
  `${firstSecPages} → ${await page.locator('.section-box').first().locator('.page-order-row').count()}`);

// يبقى بعد إعادة التحميل
await page.reload();
await page.waitForTimeout(2400);
await page.evaluate(() => { location.hash = '#/settings'; });
await page.waitForTimeout(1600);
mine = await sectionNamed('قسمي الخاصّ');
ok('وما رتّبتَه يبقى بعد إعادة التحميل', mine.found);

// الإرجاع
await page.locator('#page button:has-text("إرجاع الترتيب الافتراضي")').click();
await page.waitForTimeout(1400);
mine = await sectionNamed('قسمي الخاصّ');
ok('**والإرجاعُ يُعيد الأقسامَ الأربعة** فلا يبقى صاحبُها حبيسَ تجربته',
  !mine.found && await page.locator('.section-box').count() === 4,
  `${await page.locator('.section-box').count()} قسم`);

/* ===== ٥. السحبُ بإصبعٍ على الجوّال (المرحلة ٥٥) ===== */
console.log('\n--- ٥. السحبُ باللمس ---');
/**
 * **وهذا جهازُ صاحب المكتب**، والفأرةُ وحدَها لا تشهد له. فيُسحب بلمسٍ حقيقيّ عبر
 * بروتوكول Chrome — الأحداثُ نفسُها التي يُطلقها الإصبع.
 *
 * **والعطبُ الذي كشفه هذا الفحصُ وحده**: شريطُ أقسام الإعدادات لاصقٌ فوق القائمة على
 * الجوّال، فمن سحب صفحةً إلى أعلى أفلتها عليه لا على الصفّ — **فلا يتحرّك شيء**. وفحصُ
 * الفأرة على شاشة الحاسب مرّ ناجحًا، لأنّ الشريطَ هناك لا يغطّي الهدف.
 */
{
  const mctx = await b.newContext({ locale: 'ar-SA', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const mp = await mctx.newPage();
  mp.on('pageerror', (e) => errors.push('PAGEERROR(جوّال): ' + e.message));
  await mp.goto(BASE + '/');
  await mp.waitForTimeout(2300);
  await mp.evaluate(async () => { const { resetSidebarOrder } = await import('/js/data/settings.js'); await resetSidebarOrder(); });
  await mp.evaluate(() => { location.hash = '#/settings'; });
  await mp.waitForTimeout(1700);
  await mp.locator('#page input.search').fill('ترتيب');   // الألواحُ مطويّةٌ على الجوّال
  await mp.waitForTimeout(900);

  const first = mp.locator('.section-box').first().locator('.page-order-row');
  const n1 = await first.count();
  const target = await first.nth(n1 - 1).getAttribute('data-page');
  const src = mp.locator('.section-box').nth(1).locator('.page-order-row').first();
  const moving = await src.getAttribute('data-page');
  await src.scrollIntoViewIfNeeded();
  const from = await src.locator('.drag-grip').boundingBox();
  const to = await first.nth(n1 - 1).boundingBox();
  const covered = await mp.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest?.('.settings-nav') != null,
    { x: to.x + to.width / 2, y: to.y + to.height / 2 });

  const cdp = await mctx.newCDPSession(mp);
  const pt = (x, y) => [{ x: Math.round(x), y: Math.round(y) }];
  const sx = from.x + from.width / 2; const sy = from.y + from.height / 2;
  const tx = to.x + to.width / 2; const ty = to.y + to.height / 2;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(sx, sy) });
  for (let i = 1; i <= 16; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(sx + (tx - sx) * i / 16, sy + (ty - sy) * i / 16) });
    await mp.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await mp.waitForTimeout(1400);

  const keys = await mp.locator('.section-box').first().locator('.page-order-row').evaluateAll((rs) => rs.map((r) => r.dataset.page));
  const at = keys.indexOf(moving);
  ok('**السحبُ بالإصبع ينقل الصفحة** — وهو جهازُ صاحب المكتب',
    at >= 0 && keys[at + 1] === target, `${moving} في ${at} · بعده ${keys[at + 1]} · الهدف ${target}${covered ? ' (تحت الشريط اللاصق)' : ''}`);
  ok('ولا يبقى بعد اللمس شيءٌ معلّق', await mp.locator('.dragging, .drop-over').count() === 0
    && !(await mp.evaluate(() => document.body.classList.contains('is-dragging'))));
  await mctx.close();
}

ok('لا أخطاء في الصفحة', errors.length === 0, errors.slice(0, 3).join(' | '));
await b.close();
