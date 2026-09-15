// المرحلة ٤٠ — المهام: الدفعة، والتثبيت، والجدول، وربط التقويم.
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

// قوائم معلومة نبني عليها
await page.evaluate(async () => {
  const { repo } = await import('/js/data/repository.js');
  for (const t of await repo.tasks.list()) await repo.tasks.remove(t.id);
  for (const l of await repo.taskLists.list()) await repo.taskLists.remove(l.id);
  for (const [i, title] of ['اتصالات', 'معاينات', 'عقود وتراخيص'].entries()) {
    await repo.taskLists.create({ title, order: i });
  }
});
await page.evaluate(() => { location.hash = '#/tasks'; });
await page.waitForTimeout(1400);

/* ===== ١. الإضافة الجماعية ===== */
console.log('\n--- ٤٠. إضافة دفعة ---');
const area = page.locator('.bulk-area');
ok('حقل الإضافة الجماعية في أعلى الصفحة', await area.count() === 1);
ok('ويقول إنّها مطابقةُ كلماتٍ لا فهمُ كلام', (await page.locator('.bulk-add').innerText()).includes('مطابقةُ كلمات'));

await area.fill('اتصل على سعد بكرة الساعة ٤\n!! جدّد ترخيص إعلان الملقا\nمعاينة النرجس الخميس');
await area.press('Enter');
await page.waitForTimeout(600);
const previewRows = page.locator('.bulk-table tbody tr');
ok('إنتر يقترح توزيعًا، مهمّةً في كل سطر', await previewRows.count() === 3, String(await previewRows.count()));
const preview = await page.locator('.bulk-preview').innerText();
ok('ويُقال إنّه لا يُحفظ قبل الاعتماد', preview.includes('لا يُحفظ شيءٌ قبل ذلك'));
ok('ولكل سطرٍ سببُ وقوعه هنا', (await page.locator('.bulk-why').allInnerTexts()).every((t) => t.trim().length > 3));

// لا شيء حُفظ بعد
const beforeApprove = await page.evaluate(async () => (await (await import('/js/data/repository.js')).repo.tasks.list()).length);
ok('ولا مهمة كُتبت قبل الاعتماد', beforeApprove === 0, String(beforeApprove));

// التوزيع صحيح
const proposed = await page.evaluate(() => [...document.querySelectorAll('.bulk-table tbody tr')].map((tr) => ({
  title: tr.querySelector('input[type="text"]').value,
  list: tr.querySelectorAll('select')[0].selectedOptions[0].textContent,
  priority: tr.querySelectorAll('select')[1].selectedOptions[0].textContent,
  due: tr.querySelector('input[type="datetime-local"]').value,
})));
ok('«اتصل على سعد» ← اتصالات، وموعدُه قُرئ، وخرجت كلماته من العنوان',
  proposed[0].title === 'اتصل على سعد' && proposed[0].list === 'اتصالات' && proposed[0].due.length > 0,
  JSON.stringify(proposed[0]));
ok('«!! جدّد ترخيص» ← عقود وتراخيص، وأولويتُه عاجل',
  proposed[1].list === 'عقود وتراخيص' && proposed[1].priority === 'عاجل', JSON.stringify(proposed[1]));
ok('«معاينة النرجس الخميس» ← معاينات', proposed[2].list === 'معاينات', JSON.stringify(proposed[2]));

// التعديل قبل الاعتماد يُحترم
await page.locator('.bulk-table tbody tr').nth(2).locator('select').first().selectOption({ label: 'اتصالات' });
await page.waitForTimeout(300);
ok('وتغييرُ القائمة يدويًّا يُسجَّل سببًا «اخترتَها بنفسك»',
  (await page.locator('.bulk-table tbody tr').nth(2).locator('.bulk-why').innerText()).includes('اخترتَها'),
  await page.locator('.bulk-table tbody tr').nth(2).locator('.bulk-why').innerText());

await page.locator('button:has-text("اعتمد وأضِف")').click();
await page.waitForTimeout(1400);
const made = await page.evaluate(async () => {
  const { repo } = await import('/js/data/repository.js');
  const lists = await repo.taskLists.list();
  const tasks = await repo.tasks.list();
  const name = (id) => lists.find((l) => l.id === id)?.title;
  return tasks.map((t) => ({ title: t.title, list: name(t.listId), priority: t.priority, hasDue: !!t.dueAt }));
});
ok('الاعتماد يحفظ الثلاث', made.length === 3, String(made.length));
ok('بأولويّاتها', made.some((t) => t.priority === 'urgent') && made.filter((t) => t.priority === 'normal').length === 2,
  JSON.stringify(made.map((t) => t.priority)));
ok('وباختيارك اليدويّ لا بالاقتراح', made.find((t) => t.title.includes('معاينة'))?.list === 'اتصالات',
  made.find((t) => t.title.includes('معاينة'))?.list);
ok('وحقل الإدخال يُفرَغ بعد الاعتماد', (await page.locator('.bulk-area').inputValue()) === '');

/* ===== ٢. تثبيت القوائم ===== */
console.log('\n--- ٤٠. التثبيت ---');
let titles = await page.locator('.task-list-title').allInnerTexts();
ok('الترتيب قبل التثبيت كما أُنشئت', titles[0] === 'اتصالات', titles.join(' | '));
await page.locator('.task-list-col', { hasText: 'عقود وتراخيص' }).first().locator('.pin-btn').click();
await page.waitForTimeout(900);
titles = await page.locator('.task-list-title').allInnerTexts();
ok('المثبَّتة تتقدّم إلى الأعلى', titles[0] === 'عقود وتراخيص', titles.join(' | '));
ok('وتُعلَّم بصريًّا', await page.locator('.task-list-pinned').count() === 1);
await page.reload();
await page.waitForTimeout(2200);
await page.evaluate(() => { location.hash = '#/tasks'; });
await page.waitForTimeout(1400);
titles = await page.locator('.task-list-title').allInnerTexts();
ok('والتثبيت محفوظٌ بعد إعادة التحميل', titles[0] === 'عقود وتراخيص', titles.join(' | '));
await page.locator('.task-list-col', { hasText: 'عقود وتراخيص' }).first().locator('.pin-btn').click();
await page.waitForTimeout(800);
ok('وضغطُه ثانيةً يُزيله', (await page.locator('.task-list-title').allInnerTexts())[0] === 'اتصالات');

/* ===== ٣. عرض الجدول ===== */
console.log('\n--- ٤٠. الجدول ---');
await page.locator('.seg-btn[data-view="table"]').click();
await page.waitForTimeout(900);
const headers = await page.locator('.tasks-table thead th').allInnerTexts();
ok('الجدول بأعمدة أدوات إدارة المهام',
  ['المهمة', 'الأولوية', 'الموعد', 'القائمة', 'التكرار', 'مرتبطة'].every((h) => headers.some((x) => x.includes(h))),
  headers.join(' | '));
ok('وفيه ثلاث مهام', await page.locator('.tasks-table tbody tr').count() === 3);

// الترتيب بالضغط على العمود
await page.locator('.th-sort', { hasText: 'الأولوية' }).click();
await page.waitForTimeout(500);
let first = await page.locator('.tasks-table tbody tr').first().innerText();
ok('الضغط على «الأولوية» يرتّب — والعاجل أوّلًا', first.includes('عاجل'), first.replace(/\n/g, ' | ').slice(0, 60));
await page.locator('.th-sort', { hasText: 'الأولوية' }).click();
await page.waitForTimeout(500);
first = await page.locator('.tasks-table tbody tr').first().innerText();
ok('وضغطُه ثانيةً يعكس الاتجاه', !first.includes('عاجل'), first.replace(/\n/g, ' | ').slice(0, 60));

// الفلاتر
ok('وفلتر الأولوية فيه «الكل»', await page.locator('.filters .chip-all').count() === 1);
await page.locator('.filters .chip:not(.chip-all)', { hasText: 'عاجل' }).first().click();
await page.waitForTimeout(600);
ok('وفرزٌ بأولوية يُضيّق النتائج', await page.locator('.tasks-table tbody tr').count() === 1,
  String(await page.locator('.tasks-table tbody tr').count()));
await page.locator('.filters .chip:not(.chip-all)', { hasText: 'عاجل' }).first().click();
await page.waitForTimeout(600);

await page.locator('.filters input[type="search"]').fill('النرجس');
await page.waitForTimeout(600);
ok('والبحث النصّي يعمل', await page.locator('.tasks-table tbody tr').count() === 1,
  String(await page.locator('.tasks-table tbody tr').count()));
await page.locator('.filters input[type="search"]').fill('');
await page.waitForTimeout(600);

const listFilter = page.locator('.filters select').last();
await listFilter.selectOption({ label: 'معاينات' });
await page.waitForTimeout(600);
ok('وفرزٌ بالقائمة (ومعاينات صارت فارغة بعد نقلنا مهمّتها)', await page.locator('.tasks-table tbody tr').count() === 0,
  String(await page.locator('.tasks-table tbody tr').count()));
await listFilter.selectOption('');
await page.waitForTimeout(600);

const statusSeg = page.locator('.filters .seg-btn', { hasText: 'المنجزة' });
await statusSeg.click();
await page.waitForTimeout(600);
ok('وفرزُ المنجزة يبدأ فارغًا', await page.locator('.tasks-table tbody tr').count() === 0);
await page.locator('.filters .seg-btn', { hasText: 'المتبقية' }).click();
await page.waitForTimeout(600);

// الإنجاز من الجدول
await page.locator('.tasks-table tbody tr').first().locator('input[type="checkbox"]').check();
await page.waitForTimeout(1200);
ok('وتُنجَز المهمة من الجدول نفسه', await page.locator('.tasks-table tbody tr').count() === 2,
  String(await page.locator('.tasks-table tbody tr').count()));

// العرض محفوظ
await page.reload();
await page.waitForTimeout(2200);
await page.evaluate(() => { location.hash = '#/tasks'; });
await page.waitForTimeout(1400);
ok('وعرضُ الجدول محفوظٌ تفضيلًا', await page.locator('.tasks-table').count() === 1);

/* ===== ٤. ربط التقويم بالمهام ===== */
console.log('\n--- ٤٠. التقويم والمهام ---');
const made2 = await page.evaluate(async () => {
  const { repo } = await import('/js/data/repository.js');
  const list = (await repo.taskLists.list()).find((l) => l.title === 'اتصالات');
  const t = await repo.tasks.create({
    listId: list.id, title: 'مهمة التقويم', dueAt: new Date(Date.now() + 2 * 3600000).toISOString(),
  });
  return { id: t.id, list: list.title };
});
const taskId = made2.id;
await page.evaluate(() => { location.hash = '#/calendar'; });
await page.waitForTimeout(1600);
const calEvent = page.locator('.cal-event', { hasText: 'مهمة التقويم' }).first();
ok('المهمة بموعدها تظهر في التقويم', await calEvent.count() === 1);
const href = await calEvent.getAttribute('href');
ok('ورابطُها يفتح المهمة نفسها لا صفحة المهام', href === `#/tasks/${taskId}`, String(href));
ok('ويُذكر اسم قائمتها في التلميح', (await calEvent.getAttribute('title')).includes(made2.list),
  await calEvent.getAttribute('title'));

await calEvent.click();
await page.waitForTimeout(1600);
// العنوان في قيمة حقلٍ لا في نصّ النافذة — فيُقرأ من الحقل.
const openedTitle = await page.locator('.modal').last().locator('input[type="text"]').first().inputValue();
ok('والنقر يفتح نموذجها فعلًا معبّأً بها', openedTitle === 'مهمة التقويم', openedTitle);
const dlg = page.locator('.modal').last();
ok('وفيه حقل الأولوية', (await dlg.innerText()).includes('الأولوية'));
await dlg.locator('button[aria-label="إغلاق"]').click();
await page.waitForTimeout(500);

// المنجزة لا تزدحم في التقويم
await page.evaluate(async (id) => {
  const { repo } = await import('/js/data/repository.js');
  await repo.tasks.update(id, { done: true, doneAt: new Date().toISOString() });
}, taskId);
await page.evaluate(() => { location.hash = '#/tasks'; });
await page.waitForTimeout(400);
await page.evaluate(() => { location.hash = '#/calendar'; });
await page.waitForTimeout(1600);
ok('والمنجزة تخرج من التقويم فلا تزدحم بما فرغتَ منه',
  await page.locator('.cal-event', { hasText: 'مهمة التقويم' }).count() === 0);

console.log('\n' + (errors.length ? 'FAIL — أخطاء وحدة التحكّم :: ' + errors.join(' | ') : 'PASS — لا أخطاء في وحدة التحكّم'));
await b.close();
