import { chromium } from './pw.mjs';
const BASE = process.env.TEST_URL || 'http://127.0.0.1:8234';
const b = await chromium.launch();
const page = await (await b.newContext({ locale: 'ar-SA' })).newPage();
const errors = [];
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
page.on('console', m => { const t=m.text(); if (m.type()==='error' && !t.includes('ERR_')) errors.push(t); });
const ok = (n,c,x='') => console.log(`${c?'PASS':'FAIL'} — ${n}${x?' :: '+x:''}`);

await page.goto(BASE);
await page.waitForTimeout(1200);

/* ===== البند ٣ + ٥: المصدر والأولوية عبر الواجهة ===== */
console.log('\n--- ٣. تاق المصدر (عبر نموذج العميل) + ٥. الأولوية ---');
await page.evaluate(() => { location.hash = '#/clients'; });
await page.waitForTimeout(900);

async function addClient(name, phone, tag, source) {
  await page.locator('button:has-text("إضافة عميل")').first().click();
  await page.waitForTimeout(400);
  const modal = page.locator('.modal').last();
  await modal.locator('.form-grid input[type="text"]').first().fill(name);
  await modal.locator('.form-grid input[type="tel"]').first().fill(phone);
  if (tag) await modal.locator(`.chips button:text-is("${tag}")`).first().click();
  if (source) await modal.locator('.form-grid input[list^="source-options"]').first().fill(source);
  await modal.locator('button:has-text("إضافة العميل")').click();
  await page.waitForTimeout(700);
}
await addClient('عميل عادي ز', '0500000001', null, 'وسيط أحمد');
await addClient('عميل مهم ب', '0500000002', 'مهم', '');
await addClient('عميل جاد أ', '0500000003', 'جادّ', 'وسيط أحمد');

const names = await page.$$eval('.table tbody tr td:first-child', tds => tds.map(td => td.textContent.trim()));
ok('العميل «جادّ» أولًا ثم «مهم» ثم البقية', names[0].startsWith('عميل جاد') && names[1].startsWith('عميل مهم'), names.slice(0,3).join(' | '));

const cls = await page.$$eval('.table tbody tr', trs => trs.slice(0,3).map(t => t.className));
ok('صفوف الأولوية موسومة بصنفها', cls[0].includes('row-priority-2') && cls[1].includes('row-priority-1'), cls.join(' / '));

const tagCls = await page.$$eval('.table tbody tr .badge', bs => bs.map(x=>x.className+':'+x.textContent));
ok('لونا التصنيفين ثابتان (tag-serious / tag-important)',
   tagCls.some(x=>x.includes('tag-serious')) && tagCls.some(x=>x.includes('tag-important')), tagCls.slice(0,4).join(' | '));

ok('شارة المصدر تظهر للمعبّأ فقط',
   names[0].includes('المصدر: وسيط أحمد') && !names[1].includes('المصدر'), `${names[0]} // ${names[1]}`);

// الاقتراح: فتح نموذج عميل جديد والتحقق أن «وسيط أحمد» صار خيارًا في datalist
await page.locator('button:has-text("إضافة عميل")').first().click();
await page.waitForTimeout(500);
const opts = await page.locator('.modal').last().locator('datalist option').evaluateAll(os => os.map(o => o.value));
ok('القيمة المستعملة صارت اقتراحًا تلقائيًا', opts.includes('وسيط أحمد'), JSON.stringify(opts));
await page.keyboard.press('Escape');
await page.waitForTimeout(300);

/* الطلبات: ترتيب طلبات العملاء ذوي الأولوية */
console.log('\n--- ٥. الأولوية في الطلبات والمطابقات ---');
const made = await page.evaluate(async () => {
  const { repo } = await import('/js/data/repository.js');
  const cs = await repo.clients.list();
  const find = (n) => cs.find(c => c.name === n);
  const mk = (c) => repo.requests.create({ clientId: c.id, type: 'villa', purpose: 'sale', city: 'الرياض', budgetMax: 2000000 });
  // تُنشأ بترتيب عكسي عمدًا: العادي آخر تعديل، فلولا الأولوية لتصدّر
  await mk(find('عميل جاد أ')); await mk(find('عميل مهم ب')); await mk(find('عميل عادي ز'));
  return true;
});
await page.evaluate(() => { location.hash = '#/requests'; });
await page.waitForTimeout(1200);
const reqNames = await page.$$eval('.table tbody tr td:first-child', tds => tds.map(td => td.textContent.trim()));
ok('الطلبات: طلب «جادّ» أولًا ثم «مهم» رغم أن العادي أحدث تعديلًا',
   reqNames[0].startsWith('عميل جاد') && reqNames[1].startsWith('عميل مهم'), reqNames.slice(0,3).join(' | '));

await page.evaluate(() => { location.hash = '#/matches'; });
await page.waitForTimeout(1800);
const blocks = await page.$$eval('.match-block h2', hs => hs.map(h => h.textContent.trim()));
ok('المطابقات: كتلة «جادّ» أولًا ثم «مهم»',
   blocks[0].startsWith('عميل جاد') && blocks[1].startsWith('عميل مهم'), blocks.slice(0,3).join(' | '));
ok('شارة التصنيف ظاهرة في رأس كتلة المطابقات', blocks[0].includes('جادّ'), blocks[0]);

console.log('\nERRORS:', errors.length ? JSON.stringify(errors.slice(0,4)) : 'none');
await b.close();
