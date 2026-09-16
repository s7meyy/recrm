// المرحلة ٤٣: صفحة الصفقات، والمسار المجهول، والسلّة مسارًا، وفهرس الإعدادات، وصدى التاريخ.
import { chromium } from './pw.mjs';

const BASE = process.env.TEST_URL || 'http://127.0.0.1:8235';
const b = await chromium.launch();
const ctx = await b.newContext({ locale: 'ar-SA', viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !t.includes('ERR_') && !t.includes('Failed to load resource')) errors.push(t); });
const ok = (n, c, x = '') => console.log(`${c ? 'PASS' : 'FAIL'} — ${n}${x ? ' :: ' + x : ''}`);
const closeModals = async () => { await page.evaluate(() => document.getElementById('modal-root')?.replaceChildren()); await page.waitForTimeout(200); };

await page.goto(BASE + '/');
await page.waitForTimeout(2400);

/* ===== ١. الصفقة تُسجَّل بلا مطابقة ===== */
console.log('\n--- ٤٣. تسجيل صفقة مباشرةً ---');
await page.evaluate(() => { location.hash = '#/deals'; });
await page.waitForTimeout(1700);
const head = await page.locator('#page').innerText();
ok('صفحة الصفقات تُفتح', head.includes('الصفقات'), head.split('\n')[0]);
ok('وتقول متى تُستعمل', head.includes('بلا طلبٍ مسجَّل'));

const before = await page.evaluate(async () => (await (await import('/js/data/repository.js')).repo.deals.list()).length);
await page.locator('button:has-text("+ صفقة جديدة")').click();
await page.waitForTimeout(700);
ok('الاستمارة تقول إنّ العميل والعقار اختياريّان',
  (await page.locator('.modal').last().innerText()).includes('اختياريّان'));

// حفظٌ بلا سعر: مرفوض برسالة
await page.locator('.modal button:has-text("تسجيل الصفقة")').click();
await page.waitForTimeout(600);
ok('صفقةٌ بلا سعرٍ نهائيّ تُرفض برسالة عربية',
  await page.locator('.modal .form-errors').isVisible(),
  (await page.locator('.modal .form-errors').innerText()).trim());

await page.locator('.modal input[type="number"]').first().fill('1850000');
await page.locator('.modal input[type="number"]').nth(1).fill('46250');
await page.locator('.modal button:has-text("تسجيل الصفقة")').click();
await page.waitForTimeout(1800);
const after = await page.evaluate(async () => {
  const { repo } = await import('/js/data/repository.js');
  const list = await repo.deals.list();
  const mine = list.find((d) => d.finalPrice === 1850000);
  return { n: list.length, mine };
});
ok('الصفقة تُسجَّل بلا عميلٍ ولا عقارٍ ولا مطابقة', after.n === before + 1 && !!after.mine, `${before}→${after.n}`);
ok('وبعمولتها', after.mine?.commission === 46250, String(after.mine?.commission));
ok('ومسارُها يُنسخ من القالب لحظة الإنشاء', Array.isArray(after.mine?.checklist));
const rowTxt = await page.locator('.table tbody tr').first().innerText();
ok('وتظهر في الجدول بحالة عمولتها', rowTxt.includes('1,850,000') && rowTxt.includes('لم تُقبض'), rowTxt.replace(/\n/g, ' | ').slice(0, 90));

/* ===== ٢. المسار المجهول ===== */
console.log('\n--- ٤٣. مسارٌ لا وجود له ---');
await page.evaluate(() => { location.hash = '#/zzz-not-a-page'; });
await page.waitForTimeout(1000);
const nf = await page.locator('#page').innerText();
ok('يقول «لا صفحة بهذا العنوان» ولا يبتلع صامتًا', nf.includes('لا صفحة بهذا العنوان'), nf.split('\n')[0]);
ok('ويعرض ما كُتب في شريط العنوان', nf.includes('zzz-not-a-page'));
ok('وعنوان التبويب يقولها', (await page.evaluate(() => document.title)).includes('غير موجودة'));
ok('ولا رابطَ في القائمة يبدو نشطًا', await page.locator('.sidebar-nav a.active').count() === 0);
await page.evaluate(() => { location.hash = '#'; });
await page.waitForTimeout(900);
ok('والهاش الفارغ صفحتُك الأولى لا خطأ', (await page.locator('#page').innerText()).includes('ينتظرك اليوم'));

/* ===== ٣. السلّة مسارًا ===== */
console.log('\n--- ٤٣. سلة المحذوفات ---');
ok('لها رابطٌ في الشريط الجانبي', await page.locator('.sidebar-nav a[data-route="trash"]').count() === 1);
await page.evaluate(() => { location.hash = '#/trash'; });
await page.waitForTimeout(1500);
ok('وتُفتح بعنوانها', (await page.evaluate(() => document.title)).includes('سلة المحذوفات'));
// احذف شيئًا ثم استرجعه
await page.evaluate(async () => {
  const { repo } = await import('/js/data/repository.js');
  const c = await repo.clients.create({ name: 'عميل للحذف', phone: '0599000111' });
  await repo.clients.remove(c.id);
  location.hash = '#/dashboard';
});
await page.waitForTimeout(500);
await page.evaluate(() => { location.hash = '#/trash'; });
await page.waitForTimeout(1500);
ok('والمحذوف يظهر فيها', (await page.locator('#page').innerText()).includes('عميل للحذف'));
await page.locator('#page button:has-text("استرجاع")').first().click();
await page.waitForTimeout(1200);
const back = await page.evaluate(async () => (await (await import('/js/data/repository.js')).repo.clients.list()).some((c) => c.phone === '0599000111'));
ok('والاسترجاع يُعيده فعلًا', back);

/* ===== ٤. فهرس الإعدادات ===== */
console.log('\n--- ٤٣. فهرس الإعدادات وبحثه ---');
await page.evaluate(() => { location.hash = '#/settings'; });
await page.waitForTimeout(2200);
const chips = await page.locator('.settings-nav-chips .chip').count();
ok('لكلّ لوحٍ رقيقةٌ في الفهرس', chips >= 20, String(chips));
const tallBefore = await page.evaluate(() => document.documentElement.scrollHeight);
await page.locator('.settings-nav input[type="search"]').fill('أوزان');
await page.waitForTimeout(600);
const narrowed = await page.evaluate(() => ({
  shown: [...document.querySelectorAll('.settings-grid > .panel')].filter((p) => !p.hidden).length,
  tall: document.documentElement.scrollHeight,
}));
ok('والبحث يُضيّق إلى اللوح المقصود', narrowed.shown === 1, String(narrowed.shown));
ok('فيقصر الصفحة قصرًا حقيقيًّا', narrowed.tall < tallBefore / 3, `${tallBefore} → ${narrowed.tall}`);
await page.locator('.settings-nav input[type="search"]').fill('');
await page.waitForTimeout(500);
ok('وتفريغُ البحث يُعيدها كلَّها', (await page.evaluate(() => [...document.querySelectorAll('.settings-grid > .panel')].filter((p) => !p.hidden).length)) >= 20);

/* ===== ٥. صدى التاريخ داخل النوافذ ===== */
console.log('\n--- ٤٣. صدى التاريخ ---');
await page.evaluate(() => { location.hash = '#/properties'; });
await page.waitForTimeout(1600);
await page.locator('button:has-text("إضافة عقار")').first().click();
await page.waitForTimeout(800);
const echo = await page.evaluate(() => {
  const d = [...document.querySelectorAll('#modal-root input[type="date"], #modal-root input[type="datetime-local"]')];
  return { n: d.length, echoed: d.filter((x) => x.nextElementSibling?.classList.contains('date-echo')).length };
});
ok('كلُّ حقل تاريخٍ في النافذة له صدًى', echo.n > 0 && echo.n === echo.echoed, `${echo.echoed}/${echo.n}`);
await page.locator('#modal-root input[type="date"]').first().fill('2026-11-03');
await page.waitForTimeout(400);
const echoText = await page.evaluate(() => document.querySelector('#modal-root .date-echo')?.textContent || '');
ok('والصدى بالعربية وبالتقويمين', echoText.includes('نوفمبر') && echoText.includes('هـ'), echoText);
await closeModals();

/* ===== ٦. ترقيم الخريطة ===== */
await page.evaluate(() => { location.hash = '#/map'; });
await page.waitForTimeout(1700);
const mapLine = (await page.locator('#page').innerText()).split('\n').find((l) => l.includes('بلا موقع')) || '';
ok('سطرُ الخريطة يُجمع جمعًا عربيًّا صحيحًا', !/\d+ عرضًا خارجيًا/.test(mapLine), mapLine.slice(0, 70));

ok('لا أخطاء جافاسكربت في الجولة كلّها', errors.length === 0, errors.slice(0, 3).join(' | '));
await b.close();
