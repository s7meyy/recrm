// المرحلة ٤٤ في متصفّح حقيقي: حارس المدخلات، والرقائق الصفريّة، والتبويب الآخر.
import { chromium } from './pw.mjs';

const BASE = process.env.TEST_URL || 'http://127.0.0.1:8235';
const b = await chromium.launch();
const ctx = await b.newContext({ locale: 'ar-SA', viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !t.includes('ERR_') && !t.includes('Failed to load resource')) errors.push(t); });
const ok = (n, c, x = '') => console.log(`${c ? 'PASS' : 'FAIL'} — ${n}${x ? ' :: ' + x : ''}`);

await page.goto(BASE + '/');
await page.waitForTimeout(2400);

/* ===== ١. ما لا يُقرأ يُقال ===== */
console.log('\n--- ٤٤. حارس المدخلات ---');
const r = await page.evaluate(async () => {
  const { repo } = await import('/js/data/repository.js');
  const out = {};
  const go = async (k, fn) => { try { await fn(); out[k] = 'قُبل'; } catch (e) { out[k] = (e.errors || [e.message]).join(' · '); } };
  await go('negPrice', () => repo.properties.create({ type: 'villa', city: 'الرياض', price: -5000, captureStatus: 'approved' }));
  await go('negArea', () => repo.properties.create({ type: 'villa', city: 'الرياض', area: -10, captureStatus: 'approved' }));
  await go('textPrice', () => repo.properties.create({ type: 'villa', city: 'الرياض', price: 'مليونين', captureStatus: 'approved' }));
  await go('goodPrice', () => repo.properties.create({ type: 'villa', city: 'الرياض', price: 2000000, area: 400, captureStatus: 'approved' }));
  await go('emptyPrice', () => repo.properties.create({ type: 'villa', city: 'الرياض', price: '', captureStatus: 'approved' }));
  await go('textPhone', () => repo.clients.create({ name: 'حروف', phone: 'جوالي عندك' }));
  await go('goodPhone', () => repo.clients.create({ name: 'سليم', phone: '0551119988' }));
  await go('noPhone', () => repo.clients.create({ name: 'بلا جوال' }));
  await go('negCommission', () => repo.deals.create({ date: new Date().toISOString(), finalPrice: 100000, commission: -500 }));
  await go('badKey', async () => {
    const p = (await repo.properties.list())[0];
    return repo.properties.update(p.id, { management: { contractEnd: '2026-10-01', feeType: 'percent', feeValue: 5 } });
  });
  await go('endBeforeStart', async () => {
    const p = (await repo.properties.list())[0];
    return repo.properties.update(p.id, { management: { startAt: '2026-10-01', endAt: '2026-01-01', feeType: 'percent', feeValue: 5 } });
  });
  await go('goodMgmt', async () => {
    const p = (await repo.properties.list())[0];
    return repo.properties.update(p.id, { management: { active: true, startAt: '2026-01-01', endAt: '2026-10-01', feeType: 'percent', feeValue: 5, notes: '' } });
  });
  return out;
});
ok('سعرٌ سالبٌ يُرفض', r.negPrice.includes('بالسالب'), r.negPrice);
ok('ومساحةٌ سالبة', r.negArea.includes('بالسالب'), r.negArea);
ok('وعمولةٌ سالبة', r.negCommission.includes('بالسالب'), r.negCommission);
ok('**ونصٌّ في حقل رقمٍ لا يُبتلع صامتًا**', r.textPrice.includes('لم يُقرأ') && r.textPrice.includes('مليونين'), r.textPrice);
ok('**وجوالٌ كُتب فيه ولم يُقرأ يُقال**', r.textPhone.includes('لم يُقرأ') && r.textPhone.includes('جوالي عندك'), r.textPhone);
ok('والسليمُ يمرّ', r.goodPrice === 'قُبل' && r.goodPhone === 'قُبل', `${r.goodPrice} · ${r.goodPhone}`);
ok('والفراغُ فراغٌ لا خطأ', r.emptyPrice === 'قُبل' && r.noPhone === 'قُبل', `${r.emptyPrice} · ${r.noPhone}`);
ok('ومفتاحٌ مجهولٌ في عقد الإدارة يُقال', r.badKey.includes('مجهول') && r.badKey.includes('contractEnd'), r.badKey);
ok('ونهايةٌ قبل بداية تُرفض', r.endBeforeStart.includes('قبل بدايته'), r.endBeforeStart);
ok('والشكلُ الصحيح يمرّ', r.goodMgmt === 'قُبل', r.goodMgmt);

/* ===== ٢. سقفُ المعقول يُسأل عنه ولا يُمنع ===== */
console.log('\n--- ٤٤. سقف المعقول ---');
await page.evaluate(() => { location.hash = '#/properties'; });
await page.waitForTimeout(1700);
await page.locator('button:has-text("إضافة عقار")').first().click();
await page.waitForTimeout(800);
const modal = page.locator('.modal').last();
await modal.locator('select').first().selectOption({ index: 1 }); // المدينة
const typeSel = modal.locator('select').nth(1);
await typeSel.selectOption({ index: 1 });
const nums = modal.locator('input[type="number"]');
await nums.nth(0).fill('400');            // المساحة
await nums.nth(1).fill('999999999999');   // السعر
await modal.locator('button:has-text("إضافة العقار")').click();
await page.waitForTimeout(900);
const ask = await page.locator('.modal').last().innerText();
ok('سعرٌ خرافيّ يُسأل عنه قبل الحفظ', ask.includes('تأكَّد من السعر') && ask.includes('للمتر'),
  ask.split('\n').find((l) => l.includes('للمتر')) || ask.slice(0, 80));
ok('ويُقال إنّه بعيدٌ عن السوق ولا يُمنع', ask.includes('أهذا صحيح') && ask.includes('نعم، السعر صحيح'));
await page.evaluate(() => document.getElementById('modal-root')?.replaceChildren());
await page.waitForTimeout(300);

/* ===== ٣. الرقائق الصفريّة تُطوى ولا تُحذف ===== */
console.log('\n--- ٤٤. الرقائق الصفريّة ---');
await page.evaluate(() => { location.hash = '#/dashboard'; });
await page.waitForTimeout(500);
await page.evaluate(() => { location.hash = '#/properties'; });
await page.waitForTimeout(1800);
const typeRow = () => page.evaluate(() => {
  const r = [...document.querySelectorAll('.filter-row')].find((x) => /النوع/.test(x.querySelector('.filter-label')?.textContent || ''));
  return r ? r.innerText.replace(/\n/g, ' · ') : '';
});
const folded = await typeRow();
ok('الأنواعُ بلا نتائجَ مطويّةٌ خلف رقيقة', /بلا نتائج/.test(folded) && !/عمارة/.test(folded), folded.slice(0, 80));
await page.locator('.chip.zero:has-text("بلا نتائج")').click();
await page.waitForTimeout(400);
const opened = await typeRow();
ok('والنقرُ يفتحها — فلا شيءَ يُحذف', /عمارة/.test(opened) && /مستودع/.test(opened), opened.slice(0, 90));

/* ===== ٤. تبويبٌ آخر يُنبَّه عليه ===== */
console.log('\n--- ٤٤. تبويبٌ آخر ---');
const p2 = await ctx.newPage();
await p2.goto(BASE + '/');
await p2.waitForTimeout(2600);
const warned = await Promise.race([
  p2.locator('.toast:has-text("تبويبٌ آخر")').first().waitFor({ timeout: 4000 }).then(() => true).catch(() => false),
  page.locator('.toast:has-text("تبويبٌ آخر")').first().waitFor({ timeout: 4000 }).then(() => true).catch(() => false),
]);
ok('فتحُ تبويبٍ ثانٍ يُنبّه أنّ آخرَ حفظٍ يغلب', warned);
await p2.close();

ok('لا أخطاء جافاسكربت', errors.length === 0, errors.slice(0, 3).join(' | '));
await b.close();
