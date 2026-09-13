import { chromium } from './pw.mjs';
const BASE = process.env.TEST_URL || 'http://127.0.0.1:8234';
const b = await chromium.launch();
const ctx = await b.newContext({ locale: 'ar-SA' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
page.on('console', m => { const t = m.text(); if (m.type()==='error' && !t.includes('ERR_TUNNEL') && !t.includes('ERR_NAME')) errors.push(t); });
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
ok('القائمة الجانبية تحرّكت فورًا بعد ↑', after[after.length-1] === 'notes' && after[after.length-2] === 'settings', after.slice(-3).join(','));

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

console.log('\nERRORS:', errors.length ? JSON.stringify(errors.slice(0,4)) : 'none');
await b.close();
