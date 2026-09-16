// المرحلة ٣١ في متصفح حقيقي: تنبيه الاتفاقية، وتصدير vCard، وملخّص الضريبة، وحاسبة العائد.
import { chromium } from './pw.mjs';

const BASE = process.env.TEST_URL || 'http://127.0.0.1:8235';
const b = await chromium.launch();
const ctx = await b.newContext({ locale: 'ar-SA', acceptDownloads: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !t.includes('ERR_') && !t.includes('Failed to load resource')) errors.push(t); });
const ok = (n, c, x = '') => console.log(`${c ? 'PASS' : 'FAIL'} — ${n}${x ? ' :: ' + x : ''}`);

await page.goto(BASE + '/');
await page.waitForTimeout(2400);

/* ===== ١. اتفاقية الوساطة ===== */
console.log('\n--- ١. الاتفاقية ---');
const seed = await page.evaluate(async () => {
  const { repo } = await import('/js/data/repository.js');
  const soon = await repo.properties.create({
    type: 'villa', city: 'الرياض', district: 'قرطبة', area: 500, price: 2500000,
    captureStatus: 'approved', purposes: ['sale'], status: 'agreed',
    agreementSignedAt: new Date(Date.now() - 85 * 86400000).toISOString(),
  });
  const gone = await repo.properties.create({
    type: 'villa', city: 'الرياض', district: 'الياسمين', area: 450, price: 2200000,
    captureStatus: 'approved', purposes: ['sale'], status: 'agreed',
    agreementSignedAt: new Date(Date.now() - 120 * 86400000).toISOString(),
  });
  return { soonId: soon.id, goneId: gone.id, signed: soon.agreementSignedAt, days: soon.agreementDays };
});
ok('حقلا الاتفاقية يُحفظان في العقار', !!seed.signed && seed.days === null, JSON.stringify([!!seed.signed, seed.days]));

// المسار الافتراضي هو «يومي» أصلًا، والموجّه لا يعيد بناء المسار نفسه — فننتقل ونعود.
await page.evaluate(() => { location.hash = '#/clients'; });
await page.waitForTimeout(1200);
await page.evaluate(() => { location.hash = '#/today'; });
await page.waitForTimeout(2200);
const todayText = await page.locator('#page').innerText();
// المرحلة ٤٨: صارت لوحةً واحدةً تجمع الرخصةَ والتراخيصَ والاتفاقيّات — سؤالٌ واحد:
// ما الذي يسقط عنّي قريبًا؟ والاتفاقيّةُ تُسمّى باسمها داخلها.
ok('لوحة «ما ينتهي قريبًا» في «يومي»', todayText.includes('ما ينتهي قريبًا'), todayText.split('\n').find((l) => l.includes('ينتهي')) || '');
ok('والاتفاقيّةُ تُسمّى باسمها داخلها', todayText.includes('اتفاقية وساطة'), todayText.split('\n').find((l) => l.includes('اتفاقية')) || '');
ok('والمنتهية تقول منذ متى', /انتهت منذ/.test(todayText), todayText.split('\n').find((l) => l.includes('انتهت')) || '');
ok('والتي توشك تقول متى', /تنتهي بعد/.test(todayText), todayText.split('\n').find((l) => l.includes('تنتهي بعد')) || '');
ok('والأقرب انتهاءً أولًا (الياسمين قبل قرطبة)',
  todayText.indexOf('الياسمين') < todayText.indexOf('قرطبة'),
  `${todayText.indexOf('الياسمين')} < ${todayText.indexOf('قرطبة')}`);

// استمارة العقار فيها الحقلان
await page.evaluate((id) => { location.hash = `#/properties/${id}`; }, seed.soonId);
await page.waitForTimeout(1800);
const formText = await page.locator('.modal').last().innerText().catch(() => '');
ok('والاستمارة فيها حقل التوقيع ومدّته', formText.includes('توقيع اتفاقية الوساطة') && formText.includes('مدّة الاتفاقية'));
await page.evaluate(() => { document.getElementById('modal-root')?.replaceChildren(); });

/* ===== ٢. تصدير vCard ===== */
console.log('\n--- ٢. vCard ---');
await page.evaluate(async () => {
  const { repo } = await import('/js/data/repository.js');
  await repo.clients.create({ name: 'تركي الحارثي', phone: '0512223344', tags: ['جادّ'], notes: 'ملاحظة داخلية لا تُصدَّر' });
  location.hash = '#/settings';
});
await page.waitForTimeout(2400);
const settingsText = await page.locator('#page').innerText();
ok('لوحة التصدير موجودة', settingsText.includes('تصدير جهات الاتصال إلى جوالك'));
ok('وتصرّح بأن الملاحظات لا تُكتب', settingsText.includes('لا تُكتب فيه ملاحظاتك الداخلية'));

const download = page.waitForEvent('download', { timeout: 15000 }).catch(() => null);
await page.locator('button:has-text("نزّل ملف vCard")').click();
const file = await download;
ok('الملف يُنزَّل باسمه', !!file && file.suggestedFilename().endsWith('.vcf'), file?.suggestedFilename() || 'لا تنزيل');
if (file) {
  const path = await file.path();
  const text = path ? await (await import('node:fs/promises')).readFile(path, 'utf8') : '';
  ok('وفيه العميل بجواله', text.includes('تركي الحارثي') && text.includes('0512223344'));
  ok('وبلا ملاحظاتك الداخلية', !text.includes('ملاحظة داخلية'));
  ok('وبصيغة vCard صحيحة', text.startsWith('BEGIN:VCARD') && text.includes('VERSION:3.0') && text.trimEnd().endsWith('END:VCARD'));
}

/* ===== ٣. ملخّص الضريبة ===== */
console.log('\n--- ٣. ملخّص الضريبة ---');
await page.evaluate(async () => {
  const { repo } = await import('/js/data/repository.js');
  const y = new Date().getFullYear();
  await repo.invoices.create({
    type: 'invoice', number: 'VAT-1', date: `${y}-01-15`, clientName: 'عميل الضريبة', vatRate: 15,
    items: [{ id: 'i1', description: 'عمولة', qty: 1, unitPrice: 40000 }],
  });
  await repo.invoices.create({
    type: 'quote', number: 'Q-1', date: `${y}-01-16`, clientName: 'عرض', vatRate: 15,
    items: [{ id: 'i1', description: 'عمولة', qty: 1, unitPrice: 99000 }],
  });
  location.hash = '#/invoices';
});
await page.waitForTimeout(2400);
ok('زرّ ملخّص الضريبة في صفحة الفواتير', await page.locator('button:has-text("ملخّص الضريبة")').count() === 1);
await page.locator('button:has-text("ملخّص الضريبة")').click();
await page.waitForTimeout(900);
const vatModal = page.locator('.modal').last();
const vatText = await vatModal.innerText();
ok('ويصرّح بأنه ليس إقرارًا ضريبيًا', vatText.includes('لا إقرار ضريبي'));
ok('ويقول لماذا لا يشمل المدخلات', vatText.includes('ضريبة المدخلات'));
await vatModal.locator('select').nth(1).selectOption('1');
await page.waitForTimeout(600);
const q1Text = await vatModal.innerText();
ok('وفاتورة الربع تظهر بضريبتها', q1Text.includes('VAT-1') && (q1Text.includes('6,000') || q1Text.includes('٦٬٠٠٠')),
  q1Text.split('\n').find((l) => l.includes('ضريبة المخرجات')) || '');
ok('وعرض السعر لا يظهر', !q1Text.includes('Q-1'));
await page.keyboard.press('Escape');
await page.waitForTimeout(500);

/* ===== ٤. حاسبة العائد ===== */
console.log('\n--- ٤. العائد ---');
// عيّنة كافية في حيّ واحد كي يُنتج المحرك تقديرًا، فتظهر لوحتا القسط والعائد تحته.
await page.evaluate(async () => {
  const { repo } = await import('/js/data/repository.js');
  for (const [price, area] of [[2000000, 400], [2100000, 410], [1950000, 390], [2050000, 400], [2150000, 420], [1900000, 380]]) {
    await repo.properties.create({
      type: 'villa', city: 'الرياض', district: 'الصحافة', area, price,
      captureStatus: 'approved', purposes: ['sale'], status: 'agreed',
    });
  }
  document.getElementById('modal-root')?.replaceChildren();
  location.hash = '#/pricing';
});
await page.waitForTimeout(2400);
// نختار عقار الحيّ الذي بذرناه بعينه: القائمة تضمّ عقارات حِزَمٍ أخرى، وأولها قد يكون بلا عيّنة.
const fill = page.locator('.head-actions select').first();
const target = await fill.evaluate((sel) => {
  const opt = [...sel.options].find((o) => o.textContent.includes('الصحافة'));
  return opt ? opt.value : '';
});
ok('عقار العيّنة موجود في قائمة الملء', !!target, target ? 'نعم' : 'لا');
await fill.selectOption(target);
await page.waitForTimeout(1400);
const pricingText = await page.locator('#page').innerText();
ok('لوحة العائد تظهر مع التقدير', pricingText.includes('وكم يعود عليّ؟'),
  pricingText.split('\n').find((l) => l.includes('يعود')) || pricingText.split('\n').slice(0, 3).join(' | '));
ok('وتصرّح بأنها استرشادية', pricingText.includes('حساب استرشادي'));

const panel = page.locator('.panel').filter({ hasText: 'وكم يعود عليّ؟' });
const inputs = panel.locator('input');
await inputs.nth(0).fill('1000000');
await inputs.nth(1).fill('60000');
await inputs.nth(2).fill('6000');
await page.waitForTimeout(600);
const out = await panel.innerText();
ok('والعائد الصافي محسوب', out.includes('5.4') || out.includes('٥٫٤'), out.replace(/\n/g, ' | ').slice(0, 160));
ok('ومدّة الاسترداد معروضة', /سنة/.test(out), out.split('\n').find((l) => l.includes('سنة')) || '');

ok('لا أخطاء في الصفحة', errors.length === 0, errors.slice(0, 3).join(' | '));
await b.close();
