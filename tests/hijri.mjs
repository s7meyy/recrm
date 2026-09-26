// المرحلة ٣٨ — الهجري في الصفحات: التقويم، والجولات، وكلّ تاريخٍ يمرّ بـformatDate.
import { chromium } from './pw.mjs';
const BASE = process.env.TEST_URL || 'http://127.0.0.1:8235';
const b = await chromium.launch();
const page = await (await b.newContext({ locale: 'ar-SA' })).newPage();
const errors = [];
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
page.on('console', m => { const t = m.text(); if (m.type() === 'error' && !t.includes('ERR_') && !t.includes('Failed to load resource')) errors.push(t); });
const ok = (n, c, x = '') => console.log(`${c ? 'PASS' : 'FAIL'} — ${n}${x ? ' :: ' + x : ''}`);

await page.goto(BASE + '/');
await page.waitForTimeout(2000);

/* ===== التقويم ===== */
console.log('\n--- ٣٨. التقويم بالتقويمين ---');
await page.evaluate(() => { location.hash = '#/calendar'; });
await page.waitForTimeout(1200);
const title = (await page.locator('#page .section-title').first().innerText()).trim();
ok('عنوان الشهر يحمل الميلادي والهجري', /\d{4}/.test(title) && /14\d\d/.test(title), title);
const cells = await page.$$eval('.cal-num', (ns) => ns.slice(0, 5).map((n) => n.textContent.trim()));
ok('كل خانةٍ فيها يومان: ميلاديّ وهجريّ', cells.every((t) => (t.match(/\d+/g) || []).length === 2), JSON.stringify(cells));
ok('والرقمان مفصولان بنصٍّ يُنسخ ويُقرأ، لا بزخرفةٍ تسقط', cells.every((t) => t.includes('·')), JSON.stringify(cells));
const firstHijri = await page.locator('.cal-num-hijri').first().getAttribute('title');
ok('ورقم اليوم الهجري يشرح نفسه كاملًا تحت المؤشّر', /14\d\d/.test(firstHijri || ''), firstHijri);

/* ===== الجولات الميدانية ===== */
console.log('\n--- ٣٨. الجولات الميدانية ---');
await page.evaluate(async () => {
  const { repo } = await import('/js/data/repository.js');
  await repo.tours.create({ date: '2026-09-15', city: 'الرياض', districts: ['النرجس'], notes: 'جولة اختبار الهجري' });
});
await page.evaluate(() => { location.hash = '#/tours'; });
await page.waitForTimeout(1200);
const tourCard = page.locator('.card', { hasText: 'جولة اختبار الهجري' }).first();
const tourDate = (await tourCard.locator('.card-type').innerText()).trim();
ok('تاريخ الجولة بالتقويمين', tourDate.includes('2026') && /14\d\d/.test(tourDate), tourDate);

await page.locator('#page button:has-text("+ جولة جديدة"), #page button:has-text("جولة جديدة")').first().click();
await page.waitForTimeout(600);
const modal = page.locator('.modal').last();
await modal.locator('input[type="date"]').fill('2026-09-15');
await page.waitForTimeout(400);
const hint = (await modal.innerText()).includes('الموافق');
ok('اختيار تاريخٍ في النموذج يُري ما يوافقه هجريًّا قبل الحفظ', hint, (await modal.innerText()).split('\n').find((l) => l.includes('الموافق')) || '—');
await modal.locator('button:has-text("إلغاء")').click();
await page.waitForTimeout(400);

/* ===== الإطفاء من الإعدادات يعمّ الصفحات كلّها ===== */
console.log('\n--- ٣٨. الإطفاء والتشغيل ---');
await page.evaluate(() => { localStorage.setItem('kassab:settings-open', '"*"'); location.hash = '#/settings'; });
await page.waitForTimeout(1000);
const panel = page.locator('.panel', { hasText: 'المظهر والتاريخ' }).first();
ok('الإعدادات فيها مفتاح للهجري', await panel.locator('input[type="checkbox"]').count() === 1);
ok('ومعه مثالٌ حيّ يُري الأثر قبل الضغط', (await panel.innerText()).includes('مثال:'));
await panel.locator('input[type="checkbox"]').uncheck();
await page.waitForTimeout(600);
ok('الإطفاء يغيّر المثال في مكانه بلا إعادة تحميل', !/14\d\d/.test(await panel.innerText()), (await panel.innerText()).split('\n').find((l) => l.includes('مثال')) || '—');

await page.evaluate(() => { location.hash = '#/clients'; });
await page.waitForTimeout(300);
await page.evaluate(() => { location.hash = '#/tours'; });
await page.waitForTimeout(1200);
const offDate = (await page.locator('.card', { hasText: 'جولة اختبار الهجري' }).first().locator('.card-type').innerText()).trim();
ok('والأثر يعمّ الصفحات: الجولة عادت ميلاديّةً وحدها', !/14\d\d/.test(offDate) && offDate.includes('2026'), offDate);

await page.evaluate(() => { location.hash = '#/calendar'; });
await page.waitForTimeout(1000);
ok('والتقويم كذلك: لا رقم هجريّ في الخانات', await page.locator('.cal-num-hijri').count() === 0);

// والاختيار يبقى بعد إعادة التحميل — إعدادٌ محفوظ لا حالةُ جلسة
await page.reload();
await page.waitForTimeout(2200);
await page.evaluate(() => { location.hash = '#/calendar'; });
await page.waitForTimeout(1200);
ok('والاختيار محفوظٌ بعد إعادة التحميل', await page.locator('.cal-num-hijri').count() === 0);

await page.evaluate(async () => {
  const { setUI } = await import('/js/data/settings.js');
  await setUI({ hijri: true });
});
await page.reload();
await page.waitForTimeout(2200);
await page.evaluate(() => { location.hash = '#/calendar'; });
await page.waitForTimeout(1200);
ok('وإعادة تشغيله تعيده', await page.locator('.cal-num-hijri').count() > 0);

console.log('\n' + (errors.length ? 'FAIL — أخطاء وحدة التحكّم :: ' + errors.join(' | ') : 'PASS — لا أخطاء في وحدة التحكّم'));
await b.close();
