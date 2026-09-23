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
ok('**والصفوفُ تُسحب** — والمقبضُ علامةٌ تقول ذلك',
  await page.locator('.page-order-row[draggable="true"]').count() > 0
  && await page.locator('.drag-grip').count() > 0);

// إعادةُ التسمية
const nameInput = page.locator('.section-box .section-name').first();
await nameInput.fill('الإدارة');
await nameInput.press('Enter');
await page.waitForTimeout(1200);
ok('**وإعادةُ التسمية تصل القائمةَ فورًا**',
  await page.evaluate(() => [...document.querySelectorAll('.sidebar-nav .nav-group')].some((h) => h.getAttribute('aria-label') === 'الإدارة')));

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

ok('لا أخطاء في الصفحة', errors.length === 0, errors.slice(0, 3).join(' | '));
await b.close();
