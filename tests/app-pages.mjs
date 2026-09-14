import { chromium } from './pw.mjs';
const BASE = process.env.TEST_URL || 'http://127.0.0.1:8234';
const b = await chromium.launch();
const ctx = await b.newContext({ locale: 'ar-SA' });
const page = await ctx.newPage();
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

const ok = (name, cond, extra='') => console.log(`${cond ? 'PASS' : 'FAIL'} — ${name}${extra ? ' :: ' + extra : ''}`);

await page.goto(BASE);
await page.waitForSelector('#page .page-head, #page .card, #page .empty', { timeout: 15000 });
await page.waitForTimeout(800);

// 1) كل الصفحات تُفتح بلا أخطاء
const routes = ['today','dashboard','opportunities','properties','map','clients','tours','requests','matches','external','invoices','expenses','publish','tasks','notes','settings'];
for (const r of routes) {
  await page.evaluate(h => { location.hash = h; }, `#/${r}`);
  await page.waitForTimeout(600);
  const err = await page.$('#page .error-box');
  ok(`فتح صفحة ${r}`, !err, err ? await page.textContent('#page .error-box') : '');
}

// 2) قاعدة البيانات: الإصدار ٣ ومخزن invoices موجود
const dbInfo = await page.evaluate(async () => {
  const dbs = await indexedDB.databases();
  return new Promise(res => {
    const rq = indexedDB.open('motabiq');
    rq.onsuccess = () => { const d = rq.result; res({ version: d.version, stores: [...d.objectStoreNames] }); d.close(); };
  });
});
ok('DB_VERSION = 4', dbInfo.version === 4, 'version=' + dbInfo.version);
ok('مخزنا invoices وexpenses أُنشئا', dbInfo.stores.includes('invoices') && dbInfo.stores.includes('expenses'), dbInfo.stores.join(','));

// 3) تصنيفا العميل المدمجان حاضران من أول تشغيل
const tags = await page.evaluate(async () => (await import('/js/data/settings.js')).getLists().then(l => l.clientTags));
ok('«جادّ» و«مهم» مدمجان من أول تشغيل', tags[0] === 'جادّ' && tags[1] === 'مهم', JSON.stringify(tags));

console.log('CONSOLE ERRORS:', errors.length ? JSON.stringify(errors.slice(0,5)) : 'none');
await b.close();
