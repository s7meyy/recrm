// المرحلة ١٧ في متصفح حقيقي: قبض الفاتورة، المتابعة التلقائية، صحة البيانات، القمع، البحوث المحفوظة.
import { chromium } from './pw.mjs';

const BASE = process.env.TEST_URL || 'http://127.0.0.1:8235';
const b = await chromium.launch();
const ctx = await b.newContext({ locale: 'ar-SA' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !t.includes('ERR_') && !t.includes('Failed to load resource')) errors.push(t); });
const ok = (n, c, x = '') => console.log(`${c ? 'PASS' : 'FAIL'} — ${n}${x ? ' :: ' + x : ''}`);

await page.goto(BASE + '/');
await page.waitForTimeout(2400);

/* ===== ١) التحصيل: القبض يُحفظ ويُرفض الزائد ===== */
console.log('\n--- ١. تحصيل الفواتير ---');
const money = await page.evaluate(async () => {
  const { repo } = await import('/js/data/repository.js');
  const { invoiceCollection } = await import('/js/data/schema.js');
  const made = await repo.invoices.create({
    type: 'invoice', number: 'TEST-1', date: new Date().toISOString(),
    items: [{ description: 'عمولة وساطة', qty: 1, unitPrice: 10000 }],
  });
  let tooMuch = 'قُبل';
  try { await repo.invoices.update(made.id, { paidAmount: 99999 }); } catch (e) { tooMuch = e.message; }
  const partial = await repo.invoices.update(made.id, { paidAmount: 4000 });
  const full = await repo.invoices.update(made.id, { paidAmount: 10000 });
  let quotePaid = 'قُبل';
  const quote = await repo.invoices.create({ type: 'quote', date: new Date().toISOString(), items: [{ description: 'عرض', qty: 1, unitPrice: 5 }] });
  try { await repo.invoices.update(quote.id, { paidAmount: 5 }); } catch (e) { quotePaid = e.message; }
  return {
    id: made.id, tooMuch, quotePaid,
    partialState: invoiceCollection(partial), fullState: invoiceCollection(full),
    paidAtSet: !!partial.paidAt,
  };
});
ok('القبض الجزئي يُحفظ ويُقرأ جزئيًا', money.partialState === 'partial', money.partialState);
ok('القبض الكامل يُقرأ مقبوضًا', money.fullState === 'paid');
ok('تاريخ القبض يُملأ تلقائيًا', money.paidAtSet);
ok('المقبوض الأكبر من الإجمالي مرفوض', money.tooMuch.includes('أكبر من إجمالي'), money.tooMuch);
ok('عرض السعر لا يُقبض', money.quotePaid.includes('عرض السعر لا يُقبض'), money.quotePaid);

// الصفر يُخزَّن فراغًا فلا يبقى أثر قبضٍ لم يحدث
const zeroed = await page.evaluate(async (id) => {
  const { repo } = await import('/js/data/repository.js');
  const r = await repo.invoices.update(id, { paidAmount: 0 });
  return { paidAmount: r.paidAmount, paidAt: r.paidAt };
}, money.id);
ok('إلغاء القبض يمسح المبلغ وتاريخه', zeroed.paidAmount === null && zeroed.paidAt === null, JSON.stringify(zeroed));

/* صفحة الفواتير: الشارة وزر القبض */
await page.evaluate(() => { location.hash = '#/invoices'; });
await page.waitForTimeout(1200);
const invText = await page.locator('#page').innerText();
ok('عمود التحصيل ظاهر في القائمة', invText.includes('التحصيل') && invText.includes('لم يُقبض'), invText.split('\n').slice(0, 3).join(' | '));
ok('شريط المستحق أعلى الصفحة', invText.includes('مستحق لم يُقبض'));
await page.locator('button:has-text("💰 قبض")').first().click();
await page.waitForTimeout(500);
const collectText = await page.locator('.modal').innerText();
ok('نافذة القبض تعرض المتبقّي وزر القبض الكامل', collectText.includes('المتبقّي') && collectText.includes('قُبض كاملًا'), collectText.split('\n')[0]);
await page.locator('.modal button:has-text("قُبض كاملًا")').click();
await page.waitForTimeout(800);
const afterCollect = await page.evaluate(async (id) => {
  const { repo } = await import('/js/data/repository.js');
  const { invoiceCollection } = await import('/js/data/schema.js');
  const inv = await repo.invoices.get(id);
  return { state: invoiceCollection(inv), paid: inv.paidAmount };
}, money.id);
ok('زر «قُبض كاملًا» يسجّل المبلغ كله', afterCollect.state === 'paid' && afterCollect.paid === 10000, JSON.stringify(afterCollect));
const rowText = await page.locator('.table tbody tr', { hasText: 'TEST-1' }).first().innerText();
ok('وصفّها في القائمة صار «مقبوض»', rowText.includes('مقبوض') && !rowText.includes('لم يُقبض'), rowText.replace(/\s+/g, ' '));

/* ===== ٢) المتابعة التلقائية بعد المعاينة ===== */
console.log('\n--- ٢. متابعة تلقائية بعد المعاينة ---');
const followUp = await page.evaluate(async () => {
  const { repo } = await import('/js/data/repository.js');
  const { getFollowUpSettings, setFollowUpSettings } = await import('/js/data/settings.js');
  const before = (await getFollowUpSettings()).afterShowingDays;
  await setFollowUpSettings({ afterShowingDays: 0 });
  const off = (await getFollowUpSettings()).afterShowingDays;
  await setFollowUpSettings({ afterShowingDays: 3 });
  return { before, off, after: (await getFollowUpSettings()).afterShowingDays, tasks: (await repo.tasks.list()).length };
});
ok('الإعداد الافتراضي ثلاثة أيام', followUp.before === 3, String(followUp.before));
ok('الصفر يُحفظ صفرًا (تعطيل مقصود)', followUp.off === 0);

await page.evaluate(() => { location.hash = '#/matches'; });
await page.waitForTimeout(1600);
const statusSelect = page.locator('#page select').filter({ hasText: 'عُرضت على العميل' }).first();
const hasMatch = await statusSelect.count();
if (hasMatch) {
  await statusSelect.selectOption('presented');
  await page.waitForTimeout(1200);
  const made = await page.evaluate(async () => {
    const { repo } = await import('/js/data/repository.js');
    const tasks = await repo.tasks.list();
    const t = tasks.find((x) => x.title.includes('متابعة بعد المعاينة'));
    return t ? { title: t.title, dueAt: t.dueAt, linkType: t.linkType, days: Math.round((new Date(t.dueAt) - Date.now()) / 86400000) } : null;
  });
  ok('تعليم «عُرضت» ينشئ مهمة متابعة', !!made, JSON.stringify(made));
  ok('موعدها بعد المدة المضبوطة', made && made.days >= 2 && made.days <= 3, String(made?.days));
  ok('المهمة مربوطة بالعميل', made && made.linkType === 'client');
} else {
  ok('تعليم «عُرضت» ينشئ مهمة متابعة', false, 'لا مطابقات في البيانات التجريبية');
}

/* ===== ٣) صحة البيانات ===== */
console.log('\n--- ٣. صحة البيانات ---');
await page.evaluate(async () => {
  const { repo } = await import('/js/data/repository.js');
  await repo.clients.create({ name: 'بلا جوال', phone: '' });
  await repo.properties.create({ city: 'الرياض', type: '', purposes: [], captureStatus: 'approved' });
});
await page.evaluate(() => { location.hash = '#/health'; });
await page.waitForTimeout(1200);
const healthText = await page.locator('#page').innerText();
ok('رابط صحة البيانات في القائمة', await page.locator('.sidebar-nav a[data-route="health"]').count() === 1);
ok('الصفحة ترصد عقارًا لا يدخل المطابقة', healthText.includes('لا تدخل المطابقة إطلاقًا'), healthText.split('\n').slice(0, 4).join(' | '));
ok('وترصد عميلًا بلا جوال', healthText.includes('عملاء بلا جوال'));
ok('وتقول ماذا يتعطّل لا «ناقص» فقط', healthText.includes('لا اتصال ولا واتساب'));
ok('وتصرّح بأنها لا تُصلح شيئًا', healthText.includes('تدلّ ولا تُصلح'));
const firstItem = page.locator('.health-item').first();
ok('كل ملاحظة رابط يفتح سجلها', (await firstItem.getAttribute('href') || '').startsWith('#/'), await firstItem.getAttribute('href'));

/* ===== ٤) قمع التحويل في الداشبورد ===== */
console.log('\n--- ٤. قمع التحويل ---');
await page.evaluate(() => { location.hash = '#/dashboard'; });
await page.waitForTimeout(1800);
const dashText = await page.locator('#page').innerText();
ok('لوحة القمع ظاهرة', dashText.includes('أين تضيع: قمع التحويل'));
ok('ومعها التصريح بوحدة القياس', dashText.includes('الطلبات الموقوفة مستثناة'));
const funnelCounts = await page.evaluate(() => [...document.querySelectorAll('.funnel-num .strong')].map((n) => Number(n.textContent.replace(/[^\d]/g, ''))));
ok('أرقام القمع لا تصعد', funnelCounts.length === 5 && funnelCounts.every((c, i) => i === 0 || c <= funnelCounts[i - 1]), funnelCounts.join('→'));

/* ===== ٥) البحوث المحفوظة ===== */
console.log('\n--- ٥. بحوث محفوظة ---');
await page.evaluate(() => { location.hash = '#/properties'; });
await page.waitForTimeout(1500);
ok('لا زر حفظ قبل أي فرز', await page.locator('button:has-text("احفظ هذا البحث")').count() === 0);
// رقاقة «الكل» (المرحلة ٣٨) صارت أوّل الصفّ، وهي لا تُضيّق النتيجة — فالمجموعة الفارغة
// تعني «الكل» أصلًا. فنختار أوّل **خيار** حقيقي كي يضيق العدد فعلًا.
await page.locator('.filters .chip:not(.chip-all)').first().click();
await page.waitForTimeout(500);
ok('زر الحفظ يظهر بعد الفرز', await page.locator('button:has-text("احفظ هذا البحث")').count() === 1);
const beforeCount = (await page.locator('#page .count').innerText());
await page.locator('button:has-text("احفظ هذا البحث")').click();
await page.waitForTimeout(400);
await page.locator('.modal input').fill('فرزي المحفوظ');
await page.locator('.modal button:has-text("حفظ")').click();
await page.waitForTimeout(600);
ok('البحث المحفوظ يظهر كشريحة', await page.locator('.saved-apply:has-text("فرزي المحفوظ")').count() === 1);

// امسح الفرز ثم استدعِ المحفوظ: يجب أن يعود العدد نفسه
await page.locator('button:has-text("مسح الفرز")').click();
await page.waitForTimeout(500);
const clearedCount = await page.locator('#page .count').innerText();
await page.locator('.saved-apply:has-text("فرزي المحفوظ")').click();
await page.waitForTimeout(600);
const restored = await page.locator('#page .count').innerText();
ok('استدعاء البحث يعيد الفرز نفسه', restored === beforeCount && restored !== clearedCount, `${beforeCount} → ${clearedCount} → ${restored}`);

await page.reload();
await page.waitForTimeout(2200);
await page.evaluate(() => { location.hash = '#/properties'; });
await page.waitForTimeout(1400);
ok('البحث المحفوظ يبقى بعد إعادة التحميل', await page.locator('.saved-apply:has-text("فرزي المحفوظ")').count() === 1);

ok('لا أخطاء جافاسكربت في الصفحة', errors.length === 0, errors.slice(0, 2).join(' | '));
await b.close();
