import { chromium } from './pw.mjs';
const BASE = process.env.TEST_URL || 'http://127.0.0.1:8234';
const b = await chromium.launch();
const ctx = await b.newContext({ locale: 'ar-SA' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
// «Failed to load resource» ضجيج شبكة لا خطأ صفحة: دوال /api ترد 401 بلا جلسة على خادم الاختبار المفتوح.
page.on('console', m => { const t = m.text(); if (m.type()==='error' && !t.includes('ERR_') && !t.includes('Failed to load resource')) errors.push(t); });
const ok = (n,c,x='') => console.log(`${c?'PASS':'FAIL'} — ${n}${x?' :: '+x:''}`);

await page.goto(BASE);
await page.waitForTimeout(1200);

/* ===== البند ١: ترتيب صفحات القائمة الجانبية ===== */
console.log('\n--- ١. ترتيب القائمة الجانبية ---');
const navOrder = () => page.$$eval('.sidebar-nav a', as => as.map(a => a.dataset.route));
const before = await navOrder();
ok('الترتيب الافتراضي يطابق index.html', before[0] === 'today' && before[1] === 'dashboard', before.join(','));

await page.evaluate(() => { location.hash = '#/settings'; });
await page.waitForTimeout(900);
// اللوحة الثانية = ترتيب الصفحات. نرفع «الإعدادات» (الأخيرة) خطوتين بزر ↑
const rows = page.locator('.page-order-row');
ok('اللوحة تعرض كل الصفحات', await rows.count() === before.length, `${await rows.count()} صف`);
const lastIdx = await rows.count() - 1;
await rows.nth(lastIdx).locator('button[title="أعلى"]').click();
await page.waitForTimeout(500);
const after = await navOrder();
// التحقق بالإزاحة لا بأسماء بعينها: إضافة صفحة جديدة لا تكسر الاختبار (كسرَته «صحة البيانات» مرة).
const wasLast = before[before.length - 1];
const wasBeforeLast = before[before.length - 2];
ok('القائمة الجانبية تحرّكت فورًا بعد ↑',
  after[after.length - 2] === wasLast && after[after.length - 1] === wasBeforeLast,
  `${before.slice(-2).join(',')} → ${after.slice(-2).join(',')}`);

// زر ↑ في الصف الأول معطّل وزر ↓ في الأخير معطّل
ok('↑ معطّل في أول صف', await rows.nth(0).locator('button[title="أعلى"]').isDisabled());
ok('↓ معطّل في آخر صف', await rows.nth(lastIdx).locator('button[title="أسفل"]').isDisabled());

// يبقى بعد إعادة التحميل
await page.reload();
await page.waitForTimeout(1500);
const afterReload = await navOrder();
ok('الترتيب محفوظ بعد إعادة التحميل', JSON.stringify(afterReload) === JSON.stringify(after), afterReload.slice(-3).join(','));

// إرجاع الافتراضي
await page.evaluate(() => { location.hash = '#/settings'; });
await page.waitForTimeout(900);
await page.locator('button:has-text("إرجاع الترتيب الافتراضي")').click();
await page.waitForTimeout(600);
const reset = await navOrder();
ok('إرجاع الترتيب الافتراضي يعمل', JSON.stringify(reset) === JSON.stringify(before), reset.slice(-3).join(','));

/* ===== المرحلة ١٥: جهة القائمة، والأسماء، والطيّ الذي يُبقي الأيقونات ===== */
console.log('\n--- ٢. جهة القائمة وطيّها ---');
await page.evaluate(() => { location.hash = '#/today'; });
await page.waitForTimeout(900);

const geo = () => page.evaluate(() => {
  const s = document.querySelector('.sidebar').getBoundingClientRect();
  const link = document.querySelector('.sidebar-nav a');
  const a = link.getBoundingClientRect();
  const label = link.querySelector('.sidebar-label');
  const lb = label.getBoundingClientRect();
  const btn = document.querySelector('.sidebar-expand-btn').getBoundingClientRect();
  const icon = link.querySelector('.sidebar-icon').getBoundingClientRect();
  return {
    onRight: Math.abs(s.right - window.innerWidth) < 2 && s.left > window.innerWidth / 2,
    width: Math.round(s.width),
    labelShown: getComputedStyle(label).display !== 'none',
    labelText: label.textContent,
    labelInside: lb.width > 0 && lb.right <= a.right + 1 && lb.left >= a.left - 1,
    iconShown: icon.width > 0,
    btnInside: btn.width > 0 && btn.right <= s.right + 1 && btn.left >= s.left - 1,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  };
});

const open1 = await geo();
ok('القائمة على يمين الشاشة', open1.onRight, `width ${open1.width}`);
ok('الأسماء ظاهرة مع الأيقونات', open1.labelShown && open1.labelText === 'يومي' && open1.iconShown, open1.labelText);
ok('الاسم لا يتجاوز حدود الرابط', open1.labelInside);
ok('لا تمرير أفقي والقائمة مفتوحة', open1.overflow === 0, String(open1.overflow));

// التنقّل لا يطوي القائمة على الحاسوب (كانت تُطوى بعد كل صفحة)
await page.locator('.sidebar-nav a[data-route="properties"]').click();
await page.waitForTimeout(800);
ok('القائمة تبقى مفتوحة بعد التنقّل', (await geo()).labelShown);

// الزر يطوي الأسماء ويُبقي الأيقونات
await page.locator('.sidebar-expand-btn').click();
await page.waitForTimeout(400);
const folded = await geo();
ok('الزر يخفي الأسماء', !folded.labelShown);
ok('الأيقونات لا تختفي عند الطيّ', folded.iconShown && folded.width > 40, `width ${folded.width}`);
ok('زر الطيّ نفسه يبقى ظاهرًا داخل الرفّ', folded.btnInside);

// الاختيار يُحفظ بين الجلسات
await page.reload();
await page.waitForTimeout(1600);
ok('الطيّ محفوظ بعد إعادة التحميل', !(await geo()).labelShown);

// والضغطة الثانية تعيد الأسماء
await page.locator('.sidebar-expand-btn').click();
await page.waitForTimeout(400);
const open2 = await geo();
ok('الضغطة الثانية تعيد الأسماء', open2.labelShown && open2.width > folded.width, `${folded.width}→${open2.width}`);

/* الجوال: درج يفتح من اليمين كاملًا، ويُطوى بعد اختيار صفحة، بلا تمرير أفقي */
console.log('\n--- ٣. درج الجوال ---');
const m = await ctx.newPage();
await m.setViewportSize({ width: 390, height: 780 });
await m.goto(BASE);
await m.waitForTimeout(1800);
const mgeo = () => m.evaluate(() => {
  const s = document.querySelector('.sidebar').getBoundingClientRect();
  return { w: Math.round(s.width), left: Math.round(s.left), right: Math.round(s.right),
    vw: window.innerWidth, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
});
const mClosed = await mgeo();
ok('الدرج مطويّ عند الفتح على الجوال', mClosed.w === 0, JSON.stringify(mClosed));
ok('لا تمرير أفقي على الجوال', mClosed.overflow === 0, String(mClosed.overflow));
await m.locator('.sidebar-open-btn').click();
await m.waitForTimeout(500);
const mOpen = await mgeo();
ok('الدرج يفتح من اليمين وداخل الشاشة كاملًا',
  mOpen.w > 200 && Math.abs(mOpen.right - mOpen.vw) < 2 && mOpen.left >= 0, JSON.stringify(mOpen));
ok('لا تمرير أفقي والدرج مفتوح', mOpen.overflow === 0, String(mOpen.overflow));
await m.locator('.sidebar-nav a[data-route="clients"]').click();
await m.waitForTimeout(800);
ok('الدرج يُطوى بعد اختيار صفحة على الجوال', (await mgeo()).w === 0);

/* ===== المرحلة ٥٣: القائمةُ صارت أطولَ من الشاشة — فلا يسقط بابٌ تحت الطيّ ===== */
console.log('\n--- ٣. بابٌ لا يُرى بابٌ غيرُ موجود ---');
// **العطبُ الذي وقع فعلًا**: ثلاثون بابًا = ١٦٣٣ بكسلًا في شاشةٍ ارتفاعُها ٨٠٠. وكان
// الشريطُ يُمرَّر، **لكنّ رفًّا من أيقوناتٍ لا يقول إنّه يُمرَّر** — فلم تُوجد «الإعدادات».
for (const vp of [{ width: 1280, height: 800 }, { width: 1366, height: 768 }]) {
  const d = await ctx.newPage();
  await d.setViewportSize(vp);
  await d.goto(BASE);
  await d.waitForTimeout(1600);
  const seen = await d.evaluate(() => {
    const bar = document.querySelector('.sidebar');
    const nav = document.querySelector('.sidebar-nav');
    const a = document.querySelector('.sidebar-nav a[data-route="settings"]');
    const r = a.getBoundingClientRect();
    const br = bar.getBoundingClientRect();
    return {
      navScrolls: nav.scrollHeight > nav.clientHeight,
      navIsScroller: getComputedStyle(nav).overflowY === 'auto',
      visible: r.top >= br.top - 1 && r.bottom <= br.bottom + 1 && r.width > 0 && r.height > 0,
      pinned: getComputedStyle(a).position === 'sticky',
    };
  });
  ok(`«الإعدادات» تُرى بلا تمريرٍ على ${vp.width}×${vp.height}`, seen.visible, JSON.stringify(seen));
  ok(`والقائمةُ وحدَها هي المِمرّ على ${vp.width}×${vp.height}`, seen.navIsScroller && seen.navScrolls, JSON.stringify(seen));
  // **وتُنقر وهي مثبَّتة** — فالتثبيتُ الذي لا يُنقر زينةٌ لا باب.
  await d.locator('.sidebar-nav a[data-route="settings"]').click({ timeout: 5000 });
  await d.waitForTimeout(900);
  ok(`وتُنقر فتفتح على ${vp.width}×${vp.height}`, /#\/settings/.test(await d.evaluate(() => location.hash)),
    await d.evaluate(() => location.hash));
  await d.close();
}

console.log('\nERRORS:', errors.length ? JSON.stringify(errors.slice(0,4)) : 'none');
ok('لا أخطاء جافاسكربت في الصفحة', errors.length === 0, errors.slice(0, 2).join(' | '));
await b.close();
