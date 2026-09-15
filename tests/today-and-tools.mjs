// المرحلة ١١: صفحة «يومي»، قراءة الطلب من رسالة، القوالب، سعر المتر، التكرار، vCard/CSV، المظهر.
import { chromium } from './pw.mjs';

const BASE = process.env.TEST_URL || 'http://127.0.0.1:8235';
const b = await chromium.launch();
const ctx = await b.newContext({ locale: 'ar-SA' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !t.includes('ERR_') && !t.includes('Failed to load resource') && !t.includes('favicon')) errors.push(t); });
const ok = (n, c, x = '') => console.log(`${c ? 'PASS' : 'FAIL'} — ${n}${x ? ' :: ' + x : ''}`);

await page.goto(BASE + '/');
await page.waitForTimeout(2200);

/* ===== ١) صفحة «يومي» ===== */
console.log('--- صفحة يومي ---');
ok('الصفحة الافتراضية صارت «يومي»', (location => location)(await page.evaluate(() => location.hash)) === '#/today', await page.evaluate(() => location.hash));

const seeded = await page.evaluate(async () => {
  const { repo } = await import('/js/data/repository.js');
  const past = new Date(Date.now() - 3 * 86400000).toISOString();
  const c = await repo.clients.create({ name: 'عميل المتابعة', phone: '0561110001' });
  await repo.clients.addContact(c.id, { type: 'call', date: past, note: 'اتصال', followUpAt: past });
  const lists = await repo.taskLists.list();
  const list = lists[0] || await repo.taskLists.create({ title: 'اليوم', order: 0 });
  await repo.tasks.create({ listId: list.id, title: 'مهمة متأخرة للاختبار', dueAt: past });
  return { clientId: c.id, listId: list.id };
});
await page.evaluate(() => { location.hash = '#/dashboard'; });
await page.waitForTimeout(600);
await page.evaluate(() => { location.hash = '#/today'; });
await page.waitForTimeout(1800);
const todayText = await page.locator('#page').innerText();
ok('متابعة اليوم تظهر في «يومي»', todayText.includes('عميل المتابعة'), todayText.split('\n').slice(0, 3).join(' | '));
ok('المهمة المتأخرة تظهر', todayText.includes('مهمة متأخرة للاختبار'));
ok('لوحات «يومي» الخمس موجودة', ['متابعات اليوم', 'مهام مستحقة', 'مطابقات جديدة', 'عملاء لم يُتواصل', 'يحتاج إكمالًا'].every((t) => todayText.includes(t)));

/* ===== ٢) قراءة طلب من رسالة واتساب ===== */
console.log('\n--- طلب من رسالة ---');
await page.evaluate(() => { location.hash = '#/requests'; });
await page.waitForTimeout(1200);
await page.locator('button:has-text("لصق رسالة عميل")').click();
await page.waitForTimeout(400);
const msg = 'السلام عليكم انا سعد، ابغى فلة للبيع في الياسمين او النرجس، ميزانيتي ٢ مليون ومساحة ٤٠٠ متر تقريبا. جوالي 0551112233';
await page.locator('.modal textarea').fill(msg);
await page.locator('.modal button:has-text("اقرأ الحقول")').click();
await page.waitForTimeout(500);
const chips = await page.locator('.modal .parse-result').innerText();
ok('قرأ النوع والغرض والأحياء والميزانية والمساحة',
  chips.includes('فلة') && chips.includes('بيع') && chips.includes('الياسمين') && chips.includes('2,000,000') && chips.includes('400'),
  chips.replace(/\n/g, ' | ').slice(0, 160));
await page.locator('.modal button:has-text("افتح الاستمارة معبّأة")').click();
await page.waitForTimeout(1000);
const formValues = await page.evaluate(() => {
  const modal = document.querySelector('.modal');
  const selects = [...modal.querySelectorAll('select')].map((s) => s.value);
  const numbers = [...modal.querySelectorAll('input[type="number"]')].map((i) => i.value);
  // أحياء الطلب تُعرض شرائحَ ثابتة (chip-static)، والنطاقات وحدها تُعلَّم active
  const chipsActive = [...modal.querySelectorAll('.chips .chip')].map((c) => c.textContent.trim());
  return { selects, numbers, chipsActive };
});
ok('الاستمارة فُتحت معبّأة بالميزانية والمساحة',
  formValues.numbers.includes('2000000') && formValues.numbers.includes('400'), JSON.stringify(formValues.numbers));
ok('الأحياء المقروءة مختارة في الاستمارة',
  formValues.chipsActive.some((c) => c.includes('الياسمين')) && formValues.chipsActive.some((c) => c.includes('النرجس')),
  formValues.chipsActive.join(' | '));
await page.keyboard.press('Escape');
await page.waitForTimeout(300);

/* ===== ٣) قوالب الرسائل ===== */
console.log('\n--- قوالب الرسائل ---');
const tpl = await page.evaluate(async () => {
  const { renderTemplate, templateValues, DEFAULT_TEMPLATES, whatsappLink } = await import('/js/util/templates.js');
  const values = templateValues({
    client: { name: 'سعد', phone: '0551112233' },
    property: { district: 'الياسمين', city: 'الرياض', price: 2500000, area: 400, type: 'villa' },
    lists: { propertyTypes: [{ key: 'villa', label: 'فلة' }] },
    user: { name: 'الوسيط' }, company: { name: 'مكتب كسّاب' },
  });
  const text = renderTemplate(DEFAULT_TEMPLATES[0].body, values);
  const noPrice = renderTemplate('السعر: {السعر}\nثابت', { ...values, السعر: '' });
  return { text, noPrice, link: whatsappLink(text, '0551112233') };
});
ok('القالب يُعبَّأ ببيانات العقار والعميل', tpl.text.includes('سعد') && tpl.text.includes('فلة') && tpl.text.includes('2,500,000'), tpl.text.split('\n')[0]);
ok('السطر بلا قيمة يُحذف من الرسالة', tpl.noPrice === 'ثابت', JSON.stringify(tpl.noPrice));
ok('رابط واتساب يحمل رقم العميل الدولي', tpl.link.includes('wa.me/966551112233'));

/* ===== ٤) سعر المتر ===== */
console.log('\n--- سعر المتر ---');
const ppm = await page.evaluate(async () => {
  const { buildPriceIndex, comparePrice } = await import('/js/util/price-stats.js');
  const properties = [
    { id: 'a', captureStatus: 'approved', city: 'الرياض', district: 'حي الاختبار', type: 'villa', price: 2000000, area: 400 },
    { id: 'b', captureStatus: 'approved', city: 'الرياض', district: 'حي الاختبار', type: 'villa', price: 2400000, area: 400 },
    { id: 'x', captureStatus: 'captured', city: 'الرياض', district: 'حي الاختبار', type: 'villa', price: 90000000, area: 400 },
  ];
  const idx = buildPriceIndex({ properties, externals: [], deals: [{ propertyId: 'a', finalPrice: 1800000 }] });
  const stat = idx.get('الرياض', 'حي الاختبار', 'villa');
  const high = comparePrice({ city: 'الرياض', district: 'حي الاختبار', type: 'villa', price: 3200000, area: 400 }, idx);
  const noSample = comparePrice({ city: 'الرياض', district: 'حي بلا عيّنة', type: 'villa', price: 1, area: 1 }, idx);
  return { stat, high, noSample };
});
ok('غير المعتمد لا يدخل المؤشر', ppm.stat.count === 3, JSON.stringify({ count: ppm.stat.count, median: ppm.stat.median }));
ok('الصفقة تدخل بسعرها النهائي', ppm.stat.sources.deal === 1);
ok('المقارنة تكشف السعر المرتفع', ppm.high.diffPct > 8 && ppm.high.label.includes('أعلى'), ppm.high.label);
ok('بلا عيّنة كافية لا يُصدر حكمًا', ppm.noSample.median === null, ppm.noSample.label);

/* ===== ٥) المهام المتكررة ===== */
console.log('\n--- المهام المتكررة ---');
const repeat = await page.evaluate(async (listId) => {
  const { repo } = await import('/js/data/repository.js');
  const before = (await repo.tasks.list()).length;
  const t = await repo.tasks.create({ listId, title: 'متابعة ملاك العمائر', dueAt: new Date(Date.now() - 86400000).toISOString(), repeat: 'weekly' });
  return { before, id: t.id, repeat: t.repeat };
}, seeded.listId);
await page.evaluate(() => { location.hash = '#/tasks'; });
await page.waitForTimeout(1200);
await page.locator('.task-card:has-text("متابعة ملاك العمائر") input[type="checkbox"]').first().check();
await page.waitForTimeout(1200);
const after = await page.evaluate(async (title) => {
  const { repo } = await import('/js/data/repository.js');
  const all = await repo.tasks.list();
  const same = all.filter((t) => t.title === title);
  return { count: same.length, done: same.filter((t) => t.done).length, pendingDue: same.find((t) => !t.done)?.dueAt || null };
}, 'متابعة ملاك العمائر');
ok('إنجاز المهمة المتكررة يُنشئ التالية', after.count === 2 && after.done === 1, JSON.stringify(after));
ok('موعد التالية في المستقبل لا في الماضي', after.pendingDue && new Date(after.pendingDue).getTime() > Date.now(), String(after.pendingDue));

/* ===== ٦) vCard وCSV ===== */
console.log('\n--- الاستيراد والتصدير ---');
const exch = await page.evaluate(async () => {
  const { parseVCards, importContacts, toCsv } = await import('/js/data/exchange.js');
  const vcf = 'BEGIN:VCARD\nVERSION:3.0\nFN:مستورد أول\nTEL:0571110001\nEND:VCARD\nBEGIN:VCARD\nFN:مكرر\nTEL:0561110001\nEND:VCARD';
  const parsed = parseVCards(vcf);
  const stats = await importContacts(parsed);
  const again = await importContacts(parsed);
  const csv = toCsv([{ n: 'نص, بفاصلة' }], [{ label: 'الاسم', get: (r) => r.n }]);
  return { parsed: parsed.length, stats, again, csvHasBom: csv.charCodeAt(0) === 0xFEFF, csvQuoted: csv.includes('"نص, بفاصلة"') };
});
ok('vCard يُقرأ بالعربية', exch.parsed === 2);
ok('الجوال المسجَّل مسبقًا يُتخطّى لا يُكرَّر', exch.stats.added === 1 && exch.stats.skipped === 1, JSON.stringify(exch.stats));
ok('إعادة الاستيراد لا تضيف شيئًا', exch.again.added === 0, JSON.stringify(exch.again));
ok('CSV بترميز يفتحه إكسل عربيًا ويقتبس الفواصل', exch.csvHasBom && exch.csvQuoted);

/* ===== ٧) المظهر ===== */
console.log('\n--- المظهر ---');
const theme = await page.evaluate(async () => {
  const { applyTheme } = await import('/js/util/theme.js');
  const read = () => getComputedStyle(document.documentElement).backgroundColor; // الخلفية على html لا body
  applyTheme('dark');
  const dark = { attr: document.documentElement.getAttribute('data-theme'), bg: read() };
  applyTheme('light');
  const light = { attr: document.documentElement.getAttribute('data-theme'), bg: read() };
  applyTheme('system');
  const system = { attr: document.documentElement.getAttribute('data-theme') };
  applyTheme('light');
  return { dark, light, system };
});
ok('الوضع الداكن يغيّر الخلفية فعلًا', theme.dark.attr === 'dark' && theme.dark.bg !== theme.light.bg, `${theme.dark.bg} ≠ ${theme.light.bg}`);
ok('«يتبع الجهاز» يزيل السمة', theme.system.attr === null);

console.log('\nERRORS:', errors.length ? JSON.stringify(errors.slice(0, 4)) : 'none');
await b.close();
