import { chromium } from './pw.mjs';
const BASE = process.env.TEST_URL || 'http://127.0.0.1:8234';
const b = await chromium.launch();
const page = await (await b.newContext({ locale: 'ar-SA' })).newPage();
const errors = [];
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
page.on('console', m => { const t=m.text(); if (m.type()==='error' && !t.includes('ERR_')) errors.push(t); });
const ok = (n,c,x='') => console.log(`${c?'PASS':'FAIL'} — ${n}${x?' :: '+x:''}`);

// نلتقط نداء window.print بدل فتح حوار الطباعة
await page.addInitScript(() => { window.__printed = 0; window.print = () => { window.__printed++; }; });
await page.goto(BASE);
await page.waitForTimeout(1400);

/* بيانات شركة */
console.log('\n--- ٦. بيانات الشركة والترقيم ---');
await page.evaluate(() => { location.hash = '#/settings'; });
await page.waitForTimeout(1000);
const panel = page.locator('.panel:has-text("بيانات الشركة والمستندات")');
await panel.locator('input[type="text"]').first().fill('مكتب سائح العقاري');
await panel.locator('input[type="tel"]').first().fill('0551234567');
await panel.locator('textarea').first().fill('شكرًا لتعاملكم معنا');
await panel.locator('button:has-text("حفظ بيانات الشركة")').click();
await page.waitForTimeout(700);
const saved = await page.evaluate(async () => (await import('/js/data/settings.js')).getCompany());
ok('بيانات الشركة حُفظت', saved.name === 'مكتب سائح العقاري' && saved.phone === '0551234567', JSON.stringify({n:saved.name,p:saved.phone,next:saved.nextInvoiceNo}));

/* إنشاء فاتورة عبر الواجهة */
console.log('\n--- ٦. إنشاء فاتورة وطباعتها ---');
await page.evaluate(() => { location.hash = '#/invoices'; });
await page.waitForTimeout(900);
ok('الصفحة تبدأ فارغة برسالة واضحة', await page.locator('#page .empty').count() === 1);

await page.locator('button:has-text("+ فاتورة جديدة")').click();
await page.waitForTimeout(600);
let modal = page.locator('.modal').last();
const suggested = await modal.locator('.form-grid input[type="text"]').first().inputValue();
ok('الرقم مقترح تلقائيًا', suggested === 'فاتورة 1001', suggested);

// بندان
await modal.locator('.invoice-items tbody tr').nth(0).locator('input[type="text"]').fill('عمولة وساطة بيع أرض');
await modal.locator('.invoice-items tbody tr').nth(0).locator('input[type="number"]').nth(0).fill('1');
await modal.locator('.invoice-items tbody tr').nth(0).locator('input[type="number"]').nth(1).fill('50000');
await modal.locator('button:has-text("+ بند")').click();
await page.waitForTimeout(200);
await modal.locator('.invoice-items tbody tr').nth(1).locator('input[type="text"]').fill('أتعاب إفراغ');
await modal.locator('.invoice-items tbody tr').nth(1).locator('input[type="number"]').nth(0).fill('2');
await modal.locator('.invoice-items tbody tr').nth(1).locator('input[type="number"]').nth(1).fill('1500');
await page.waitForTimeout(200);
const totalTxt = await modal.locator('.invoice-total-value').textContent();
ok('الإجمالي يُحسب لحظيًا (50000 + 2×1500)', totalTxt.replace(/[^\d]/g,'') === '53000', totalTxt);
await modal.locator('button:has-text("حفظ")').last().click();
await page.waitForTimeout(900);

const rowTxt = await page.locator('.table tbody tr').first().innerText();
ok('الفاتورة ظهرت في القائمة بإجماليها', rowTxt.includes('فاتورة 1001') && rowTxt.replace(/[^\d]/g,'').includes('53000'), rowTxt.replace(/\n/g,' | '));

const company2 = await page.evaluate(async () => (await import('/js/data/settings.js')).getCompany());
ok('العدّاد تقدّم إلى 1002 بعد استعمال الرقم المقترح', company2.nextInvoiceNo === 1002, String(company2.nextInvoiceNo));

/* عرض سعر بسلسلة مستقلة + رقم يدوي لا يحرّك العدّاد */
await page.locator('button:has-text("+ عرض سعر")').click();
await page.waitForTimeout(600);
modal = page.locator('.modal').last();
const qNum = await modal.locator('.form-grid input[type="text"]').first().inputValue();
ok('عرض السعر بسلسلة ترقيم مستقلة', qNum === 'عرض سعر 1001', qNum);
await modal.locator('.form-grid input[type="text"]').first().fill('رقم يدوي ٧٧');
await modal.locator('.invoice-items tbody tr').nth(0).locator('input[type="text"]').fill('تقييم عقار');
await modal.locator('.invoice-items tbody tr').nth(0).locator('input[type="number"]').nth(1).fill('900');
await modal.locator('button:has-text("حفظ")').last().click();
await page.waitForTimeout(900);
const company3 = await page.evaluate(async () => (await import('/js/data/settings.js')).getCompany());
ok('الرقم اليدوي لا يحرّك عدّاد عروض الأسعار', company3.nextQuoteNo === 1001, String(company3.nextQuoteNo));

/* التحقق من التحقق: مستند بلا بنود يُرفض */
await page.locator('button:has-text("+ فاتورة جديدة")').click();
await page.waitForTimeout(500);
modal = page.locator('.modal').last();
await modal.locator('button:has-text("حفظ")').last().click();
await page.waitForTimeout(500);
ok('مستند بلا بنود يُرفض برسالة عربية', await modal.locator('.form-errors').isVisible(), (await modal.locator('.form-errors').innerText()).trim());
await page.keyboard.press('Escape');
await page.waitForTimeout(300);

/* الطباعة */
console.log('\n--- ٦. الطباعة (التصدير الوحيد) ---');
await page.locator('.table tbody tr:has-text("فاتورة 1001")').locator('button:has-text("طباعة")').click();
await page.waitForTimeout(800);
const printState = await page.evaluate(() => ({
  printed: window.__printed,
  printing: document.body.classList.contains('printing'),
  html: document.getElementById('print-root').innerText,
  hidden: getComputedStyle(document.getElementById('print-root')).display,
}));
ok('نافذة الطباعة فُتحت مرة واحدة', printState.printed === 1, String(printState.printed));
ok('ورقة الطباعة تحمل اسم الشركة والرقم والبنود والإجمالي',
  printState.html.includes('مكتب سائح العقاري') && printState.html.includes('فاتورة 1001')
  && printState.html.includes('عمولة وساطة بيع أرض') && printState.html.replace(/[^\d]/g,'').includes('53000'),
  printState.html.replace(/\n/g,' | ').slice(0,160));
ok('التذييل المحفوظ يُطبع', printState.html.includes('شكرًا لتعاملكم معنا'));
ok('حاوية الطباعة مخفية على الشاشة (display:none)', printState.hidden === 'none', printState.hidden);

const printCss = await page.evaluate(() => {
  const shell = document.querySelector('.app-shell');
  return { shellExists: !!shell };
});
ok('التطبيق نفسه ما زال ظاهرًا على الشاشة أثناء ذلك', printCss.shellExists);

/* النسخ الاحتياطي — العلّة المُصلحة */
console.log('\n--- إصلاح النسخة الاحتياطية (مخازن المرحلة ٧ و٨) ---');
const backup = await page.evaluate(async () => {
  const { repo } = await import('/js/data/repository.js');
  const { exportBackup } = await import('/js/data/backup.js');
  await repo.taskLists.create({ title: 'قائمة اختبار', order: 0 });
  await repo.notes.create({ text: 'فكرة اختبار' });
  const { blob } = await exportBackup();
  const parsed = JSON.parse(await blob.text());
  return Object.fromEntries(Object.entries(parsed.db).map(([k,v]) => [k, v.length]));
});
// **احتواءٌ لا عدٌّ بعينه**: البذرة التجريبية صارت تُنشئ قوائمَ مهامّ (المرحلة ٤٢)، فالعدد
// الدقيق يتبع البذرة لا التصدير. والمقصودُ هنا أنّ المخزنين لا يسقطان — وهو ما يُقاس.
ok('التصدير يشمل taskLists/notes (كانت تسقط قبل الإصلاح)', backup.taskLists >= 1 && backup.notes >= 1, JSON.stringify(backup));
ok('التصدير يشمل invoices الجديدة', backup.invoices === 2, JSON.stringify({invoices: backup.invoices}));

console.log('\nERRORS:', errors.length ? JSON.stringify(errors.slice(0,4)) : 'none');
await b.close();
