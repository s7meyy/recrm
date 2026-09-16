// المرحلة ١٨ في متصفح حقيقي: استيراد CSV بمعاينته، وجولة اليوم، ورمز QR.
import { chromium } from './pw.mjs';

const BASE = process.env.TEST_URL || 'http://127.0.0.1:8235';
const b = await chromium.launch();
const ctx = await b.newContext({ locale: 'ar-SA' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !t.includes('ERR_') && !t.includes('Failed to load resource')) errors.push(t); });
const ok = (n, c, x = '') => console.log(`${c ? 'PASS' : 'FAIL'} — ${n}${x ? ' :: ' + x : ''}`);

await page.addInitScript(() => { window.print = () => { window.__printed = (window.__printed || 0) + 1; }; });
await page.goto(BASE + '/');
await page.waitForTimeout(2400);

/* ===== ١) استيراد CSV ===== */
console.log('\n--- ١. استيراد CSV ---');
const before = await page.evaluate(async () => (await (await import('/js/data/repository.js')).repo.clients.list()).length);
await page.evaluate(() => { location.hash = '#/settings'; });
await page.waitForTimeout(1600);

const csv = '﻿الاسم,الجوال,ملاحظات\nعميل مستورد أول,0512345001,من ملف إكسل\nعميل مستورد ثانٍ,0512345002,\nبلا بيانات,,\nمكرر,0512345001,نفس جوال الأول\n';
await page.locator('input[type="file"][accept*="csv"]').setInputFiles({ name: 'clients.csv', mimeType: 'text/csv', buffer: Buffer.from(csv, 'utf8') });
await page.waitForTimeout(900);
const modalText = await page.locator('.modal').innerText();
ok('نافذة الربط تُفتح بعدد الصفوف', modalText.includes('قُرئ 4') || modalText.includes('4 صفًا'), modalText.split('\n')[1]);
// «بلا بيانات» له اسم فيُقبل (الاسم وحده يكفي)، و«مكرر» يُتخطّى لتطابق جواله.
ok('المعاينة تسبق أي كتابة', modalText.includes('سيُضاف 3') && modalText.includes('يُتخطّى 1'), modalText.split('\n').find((l) => l.includes('سيُضاف')));
ok('وتُبيّن سبب التخطّي', modalText.includes('موجود عندك أصلًا') || modalText.includes('ينقصه الحد الأدنى'), '');
const stillBefore = await page.evaluate(async () => (await (await import('/js/data/repository.js')).repo.clients.list()).length);
ok('لا كتابة قبل الضغط على «استيراد»', stillBefore === before, `${before} → ${stillBefore}`);

await page.locator('.modal button:has-text("استيراد")').click();
await page.waitForTimeout(1200);
const after = await page.evaluate(async () => {
  const { repo } = await import('/js/data/repository.js');
  const list = await repo.clients.list();
  const one = list.find((c) => c.name === 'عميل مستورد أول');
  return { count: list.length, phone: one?.phone, notes: one?.notes };
});
ok('أُضيف الجديد وحده', after.count === before + 3, `${before} → ${after.count}`);
ok('والحقول وصلت صحيحة', after.phone === '0512345001' && after.notes === 'من ملف إكسل', JSON.stringify(after));

// إعادة الملف نفسه: لا شيء جديد
await page.locator('input[type="file"][accept*="csv"]').setInputFiles({ name: 'clients.csv', mimeType: 'text/csv', buffer: Buffer.from(csv, 'utf8') });
await page.waitForTimeout(900);
const secondText = await page.locator('.modal').innerText();
ok('إعادة استيراد الملف نفسه لا تُكرّر شيئًا', secondText.includes('سيُضاف 0'), secondText.split('\n').find((l) => l.includes('سيُضاف')));
await page.locator('.modal button:has-text("إلغاء")').click();
await page.waitForTimeout(400);

/* ===== ٢) جولة اليوم ===== */
console.log('\n--- ٢. جولة اليوم ---');
await page.evaluate(() => { location.hash = '#/map'; });
await page.waitForTimeout(2600);
await page.locator('button:has-text("خطّط جولة اليوم")').click();
await page.waitForTimeout(700);
const routeModal = page.locator('.modal');
// الصيغةُ تتبع العدد: «٣ عقارات ظاهرة» أو «١١ عقارًا ظاهرًا» (المرحلة ٤٤).
ok('نافذة الجولة تُفتح بالمحطات الظاهرة', /عقار(ات ظاهرة|ًا ظاهرًا|ين ظاهرين)|عقارٍ واحدٍ ظاهر/.test(await routeModal.innerText()), (await routeModal.innerText()).split('\n')[1]);
ok('زر الفتح معطَّل قبل الاختيار', await routeModal.locator('button:has-text("افتح في خرائط جوجل")').isDisabled());
const boxes = routeModal.locator('.route-list input[type="checkbox"]');
const n = await boxes.count();
if (n >= 3) {
  for (let i = 0; i < 3; i++) await boxes.nth(i).check();
  await page.waitForTimeout(600);
  const routeText = await routeModal.innerText();
  ok('الترتيب يُعرض مرقّمًا', /1\..+←.+2\./.test(routeText.replace(/\n/g, ' ')), routeText.split('\n').find((l) => l.includes('الترتيب')));
  ok('المسافة تُوصف تقديرية ومسافةَ هواء', routeText.includes('مسافة هواء لا طريق'), '');
  ok('زر الفتح صار مفعَّلًا', !(await routeModal.locator('button:has-text("افتح في خرائط جوجل")').isDisabled()));
} else {
  ok('الترتيب يُعرض مرقّمًا', false, `محطات ظاهرة: ${n}`);
}
await routeModal.locator('button:has-text("إغلاق")').click();
await page.waitForTimeout(300);

/* ===== ٣) رمز QR ===== */
console.log('\n--- ٣. رمز QR ---');
const qr = await page.evaluate(async () => {
  const { qrSvg, qrBlock } = await import('/js/util/qr.js');
  const svg = await qrSvg('https://example.com/offers/l/3');
  const block = await qrBlock('https://example.com/offers/l/3');
  let empty = 'قُبل';
  try { await qrSvg('   '); } catch (e) { empty = e.message; }
  const cells = (svg.match(/M\d+,\d+l/g) || []).length; // كل وحدة سوداء رسمة في المسار
  return { isSvg: svg.startsWith('<svg'), scalable: svg.includes('viewBox'), cells, caption: block.querySelector('.qr-caption')?.textContent, empty };
});
ok('الرمز يُبنى SVG قابلًا للتحجيم', qr.isSvg && qr.scalable);
ok('وفيه وحدات فعلية لا مربع فارغ', qr.cells > 100, String(qr.cells));
ok('والرابط مكتوب تحته نصًّا', qr.caption === 'https://example.com/offers/l/3', qr.caption);
ok('النص الفارغ مرفوض بوضوح', qr.empty.includes('لا نصّ'), qr.empty);
const lib = await page.evaluate(async () => {
  const res = await fetch('/vendor/qrcode/qrcode.mjs', { credentials: 'same-origin' });
  return { ok: res.ok, type: res.headers.get('content-type') };
});
ok('المكتبة محلّية في المستودع لا من CDN', lib.ok && /javascript/.test(lib.type), JSON.stringify(lib));

ok('لا أخطاء جافاسكربت في الصفحة', errors.length === 0, errors.slice(0, 2).join(' | '));
await b.close();
