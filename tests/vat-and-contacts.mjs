// المرحلة ١٩ في متصفح حقيقي: الفاتورة الضريبية، تسجيل المكالمة، تاريخ السعر، تحذير الميزانية.
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

/* ===== ١) الفاتورة الضريبية ===== */
console.log('\n--- ١. الفاتورة الضريبية ---');
const setup = await page.evaluate(async () => {
  const { setCompany } = await import('/js/data/settings.js');
  await setCompany({ name: 'مكتب كسّاب العقاري', vatNumber: '300000000000003', vatRate: 15 });
  const { repo } = await import('/js/data/repository.js');
  const made = await repo.invoices.create({
    type: 'invoice', number: 'VAT-1', date: new Date().toISOString(),
    items: [{ description: 'عمولة وساطة', qty: 1, unitPrice: 10000 }], vatRate: 15,
  });
  const { invoiceGrandTotal, invoiceVat } = await import('/js/data/schema.js');
  return { id: made.id, vat: invoiceVat(made), grand: invoiceGrandTotal(made) };
});
ok('الضريبة تُحفظ وتُحسب على المستند', setup.vat === 1500 && setup.grand === 11500, JSON.stringify(setup));

const overpay = await page.evaluate(async (id) => {
  const { repo } = await import('/js/data/repository.js');
  let tooMuch = 'قُبل';
  try { await repo.invoices.update(id, { paidAmount: 11600 }); } catch (e) { tooMuch = e.message; }
  const partial = await repo.invoices.update(id, { paidAmount: 10000 });
  const { invoiceCollection } = await import('/js/data/schema.js');
  return { tooMuch, afterNet: invoiceCollection(partial) };
}, setup.id);
ok('الحدّ الأعلى للقبض صار شاملًا الضريبة', overpay.tooMuch.includes('أكبر من إجمالي'), overpay.tooMuch);
ok('دفع البنود دون الضريبة يبقى جزئيًا', overpay.afterNet === 'partial', overpay.afterNet);

await page.evaluate(() => { location.hash = '#/invoices'; });
await page.waitForTimeout(1300);
const listText = await page.locator('.table tbody tr', { hasText: 'VAT-1' }).first().innerText();
ok('القائمة تعرض الإجمالي شاملًا الضريبة', listText.includes('11,500'), listText.replace(/\s+/g, ' '));

// الطباعة: سطور الضريبة والرمز
const printed = await page.evaluate(async (id) => {
  const { repo } = await import('/js/data/repository.js');
  const { getCompany } = await import('/js/data/settings.js');
  const { printInvoice } = await import('/js/pages/invoices.js');
  await printInvoice(await repo.invoices.get(id), await getCompany(), null);
  await new Promise((r) => setTimeout(r, 300));
  const root = document.getElementById('print-root');
  return {
    title: root.querySelector('.print-title')?.textContent,
    text: root.textContent,
    hasQr: !!root.querySelector('.print-zatca svg'),
    qrCells: (root.querySelector('.print-zatca svg')?.innerHTML.match(/M\d+,\d+l/g) || []).length,
  };
}, setup.id);
ok('العنوان يصير «فاتورة ضريبية مبسّطة»', printed.title === 'فاتورة ضريبية مبسّطة', printed.title);
ok('سطر الضريبة ومبلغها في المطبوع', printed.text.includes('ضريبة القيمة المضافة (15٪)') && printed.text.includes('1,500'), '');
ok('والرقم الضريبي مطبوع', printed.text.includes('300000000000003'));
ok('ورمز الفاتورة الضريبية مرسوم', printed.hasQr && printed.qrCells > 100, String(printed.qrCells));

// بلا رقم ضريبي: لا رمز ولا عنوان ضريبي
const noVat = await page.evaluate(async (id) => {
  const { repo } = await import('/js/data/repository.js');
  const { printInvoice } = await import('/js/pages/invoices.js');
  await printInvoice(await repo.invoices.get(id), { name: 'مكتب بلا تسجيل' }, null);
  await new Promise((r) => setTimeout(r, 300));
  const root = document.getElementById('print-root');
  return { title: root.querySelector('.print-title')?.textContent, hasQr: !!root.querySelector('.print-zatca') };
}, setup.id);
ok('بلا رقم ضريبي لا رمز ولا ادّعاء', !noVat.hasQr && noVat.title !== 'فاتورة ضريبية مبسّطة', JSON.stringify(noVat));

/* ===== ٢) تسجيل المكالمة ===== */
console.log('\n--- ٢. تسجيل المكالمة ---');
await page.evaluate(() => { location.hash = '#/today'; });
await page.waitForTimeout(1600);
const before = await page.evaluate(async () => {
  const { repo } = await import('/js/data/repository.js');
  const c = (await repo.clients.list()).find((x) => x.phone);
  return { id: c.id, contacts: (c.contacts || []).length };
});
const waBtn = page.locator('#page a[title="واتساب"]').first();
if (await waBtn.count()) {
  await waBtn.click({ modifiers: [] }).catch(() => {});
  await page.waitForTimeout(1400);
  const modalSeen = await page.locator('.modal').count();
  ok('نافذة التسجيل تظهر بعد التواصل', modalSeen === 1, String(modalSeen));
  if (modalSeen) {
    await page.locator('.modal input[type="text"]').fill('اتفقنا على معاينة الخميس');
    await page.locator('.modal button:has-text("سجّل")').click();
    await page.waitForTimeout(1200);
    const after = await page.evaluate(async () => {
      const { repo } = await import('/js/data/repository.js');
      const list = await repo.clients.list();
      const withNote = list.find((c) => (c.contacts || []).some((x) => x.note === 'اتفقنا على معاينة الخميس'));
      return withNote ? { count: withNote.contacts.length, type: withNote.contacts.at(-1).type, last: repo.clients.lastContactAt(withNote) } : null;
    });
    ok('التواصل يُحفظ بنوعه وملاحظته', after && after.type === 'whatsapp', JSON.stringify(after));
    ok('و«آخر تواصل» يتحدّث فلا يبقى العميل متأخرًا', after && after.last && Date.now() - new Date(after.last) < 60000);
  }
} else {
  ok('نافذة التسجيل تظهر بعد التواصل', false, 'لا عملاء بجوال في «يومي»');
}

/* «لم أتواصل» لا يسجّل شيئًا */
const callBtn = page.locator('#page a[title="اتصال"]').first();
if (await callBtn.count()) {
  const countBefore = await page.evaluate(async () => (await (await import('/js/data/repository.js')).repo.clients.list()).reduce((n, c) => n + (c.contacts || []).length, 0));
  await callBtn.click().catch(() => {});
  await page.waitForTimeout(1300);
  await page.locator('.modal button:has-text("لم أتواصل")').click();
  await page.waitForTimeout(500);
  const countAfter = await page.evaluate(async () => (await (await import('/js/data/repository.js')).repo.clients.list()).reduce((n, c) => n + (c.contacts || []).length, 0));
  ok('«لم أتواصل» لا يُسجّل شيئًا', countBefore === countAfter, `${countBefore} → ${countAfter}`);
}

/* ===== ٣) تاريخ السعر ===== */
console.log('\n--- ٣. تاريخ السعر ---');
const trend = await page.evaluate(async () => {
  const { repo } = await import('/js/data/repository.js');
  const { priceTrend } = await import('/js/util/price-stats.js');
  const p = await repo.properties.create({ city: 'الرياض', district: 'النرجس', type: 'villa', purposes: ['sale'], captureStatus: 'approved', price: 2000000, area: 400 });
  const noHistory = (await repo.properties.get(p.id)).priceHistory.length;
  await repo.properties.update(p.id, { notes: 'لمسة بلا سعر' });
  const stillNone = (await repo.properties.get(p.id)).priceHistory.length;
  await repo.properties.update(p.id, { price: 1800000 });
  const after = await repo.properties.get(p.id);
  await repo.properties.update(p.id, { price: 1700000 });
  const after2 = await repo.properties.get(p.id);
  return { noHistory, stillNone, count: after.priceHistory.length, points: after2.priceHistory.map((h) => h.price), trend: priceTrend(after2) };
});
ok('العقار الجديد بلا تاريخ سعر', trend.noHistory === 0 && trend.stillNone === 0, JSON.stringify(trend));
ok('أول تغيير يزرع السعر السابق ثم الجديد', trend.count === 2, String(trend.count));
ok('النقاط بالترتيب من الأصل', JSON.stringify(trend.points) === '[2000000,1800000,1700000]', JSON.stringify(trend.points));
ok('والشارة تقول نسبة الخفض من الأصل', trend.trend && trend.trend.dropPct === 15 && trend.trend.changes === 2, JSON.stringify(trend.trend));

ok('لا أخطاء جافاسكربت في الصفحة', errors.length === 0, errors.slice(0, 2).join(' | '));
await b.close();
