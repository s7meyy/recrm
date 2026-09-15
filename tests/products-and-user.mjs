// المرحلة ٣٨ — البنود الجاهزة ونسبة الوساطة في المستند، واليوزر بدل المعرّف الطويل.
import { chromium } from './pw.mjs';
const BASE = process.env.TEST_URL || 'http://127.0.0.1:8235';
const b = await chromium.launch();
const page = await (await b.newContext({ locale: 'ar-SA' })).newPage();
const errors = [];
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
page.on('console', m => { const t = m.text(); if (m.type() === 'error' && !t.includes('ERR_') && !t.includes('Failed to load resource')) errors.push(t); });
const ok = (n, c, x = '') => { console.log(`${c ? 'PASS' : 'FAIL'} — ${n}${x ? ' :: ' + x : ''}`); };

await page.goto(BASE);
await page.waitForTimeout(1400);

/* ===== اليوزر في الإعدادات ===== */
console.log('\n--- ٣٨. اليوزر بدل المعرّف ---');
await page.evaluate(() => { location.hash = '#/settings'; });
await page.waitForTimeout(1000);
const handleBtn = page.locator('#page button:has-text("يوزر:")').first();
ok('الإعدادات تعرض «يوزر» لا «المعرّف»', await handleBtn.count() === 1);
ok('لا أثر لكلمة «المعرّف» في الصفحة', !(await page.locator('#page').innerText()).includes('المعرّف:'));
const handleTxt = (await handleBtn.innerText()).trim();
const shown = handleTxt.replace('يوزر:', '').trim();
ok('اليوزر قصير يُقرأ (٧ محارف)', /^u[a-z0-9]{6}$/.test(shown), shown);
const full = await page.evaluate(async () => (await import('/js/data/repository.js')).getCurrentUser().id);
ok('المعرّف الكامل ما زال محفوظًا بلا تغيير', typeof full === 'string' && full.length >= 32, String(full).slice(0, 12) + '…');
const title = await handleBtn.getAttribute('title');
ok('المعرّف الكامل متاح تحت الضغط', title.includes(full), title.slice(0, 40) + '…');
const derived = await page.evaluate(async (id) => (await import('/js/data/settings.js')).userHandle({ id }), full);
ok('الاشتقاق ثابت: اليوزر المعروض هو اشتقاق المعرّف نفسه', derived === shown, `${derived} = ${shown}`);

/* ===== البنود الجاهزة ونسبة الوساطة ===== */
console.log('\n--- ٣٨. البنود الجاهزة ونسبة الوساطة ---');
await page.evaluate(() => { location.hash = '#/invoices'; });
await page.waitForTimeout(900);
await page.locator('button:has-text("+ فاتورة جديدة")').click();
await page.waitForTimeout(600);
const modal = page.locator('.modal').last();

// القائمة الجاهزة تُبنى من الإعدادات
const optionCount = await modal.locator('.product-picker option').count();
ok('قائمة البنود الجاهزة فيها الافتراضيّات', optionCount >= 6, String(optionCount));
const productSelect = modal.locator('.product-picker');
const consultValue = await productSelect.locator('option', { hasText: 'استشارة عقارية' }).getAttribute('value');
await productSelect.selectOption(consultValue);
await page.waitForTimeout(300);
let rows = modal.locator('.invoice-items tbody tr');
ok('اختيار بندٍ جاهز يضيف سطرًا', await rows.count() === 2, String(await rows.count()));
ok('الوصف جاء من القائمة لا مكتوبًا باليد', (await rows.nth(1).locator('input[type="text"]').inputValue()) === 'استشارة عقارية');
ok('القائمة ترجع فارغة بعد الاختيار (فتُستعمل ثانيةً)', (await productSelect.inputValue()) === '');

// البند الجاهز يبقى قابلًا للتعديل في المستند
await rows.nth(1).locator('input[type="number"]').nth(1).fill('900');
await page.waitForTimeout(200);
ok('البند الجاهز قابل للتعديل هنا (القالب لا يحبس مستندًا)', (await rows.nth(1).locator('input[type="number"]').nth(1).inputValue()) === '900');

// العمولة: سعر الصفقة × النسبة
const priceInput = modal.locator('.commission-price');
const percentInput = modal.locator('.commission-percent');
ok('النسبة تبدأ من الإعدادات', (await percentInput.inputValue()) === '2.5', await percentInput.inputValue());
await priceInput.fill('1200000');
await percentInput.fill('2.5');
await modal.locator('button:has-text("أضف بند العمولة")').click();
await page.waitForTimeout(300);
rows = modal.locator('.invoice-items tbody tr');
ok('بند العمولة أُضيف', await rows.count() === 3, String(await rows.count()));
const commDesc = await rows.nth(2).locator('input[type="text"]').inputValue();
ok('الوصف يذكر النسبة والأصل الذي حُسبت منه', commDesc.includes('2.5') && commDesc.replace(/[^\d]/g, '').includes('1200000'), commDesc);
const commValue = await rows.nth(2).locator('input[type="number"]').nth(1).inputValue();
ok('القيمة = 1,200,000 × 2.5٪ = 30,000', Number(commValue) === 30000, commValue);

// نسبة مختلفة لفاتورة واحدة لا تُغيّر الإعدادات
await percentInput.fill('1.5');
await priceInput.fill('800000');
await modal.locator('button:has-text("أضف بند العمولة")').click();
await page.waitForTimeout(300);
rows = modal.locator('.invoice-items tbody tr');
const second = await rows.nth(3).locator('input[type="number"]').nth(1).inputValue();
ok('نسبة أخرى في المستند نفسه تُحسب بها (800,000 × 1.5٪)', Number(second) === 12000, second);
const companyAfter = await page.evaluate(async () => (await import('/js/data/settings.js')).getCompany());
ok('تغيير النسبة هنا لا يُغيّر الإعدادات (فتعديل فاتورةٍ لا يغيّر ما بعدها)',
  Number(companyAfter.commissionPercent) === 2.5, String(companyAfter.commissionPercent));

// الحماية من سعرٍ فارغ
await priceInput.fill('');
await modal.locator('button:has-text("أضف بند العمولة")').click();
await page.waitForTimeout(300);
ok('بلا سعرٍ لا يُضاف بندٌ صفريّ', await modal.locator('.invoice-items tbody tr').count() === 4);

console.log('\n' + (errors.length ? 'FAIL — أخطاء وحدة التحكّم :: ' + errors.join(' | ') : 'PASS — لا أخطاء في وحدة التحكّم'));
await b.close();
