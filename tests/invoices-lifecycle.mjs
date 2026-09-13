import { chromium } from './pw.mjs';
const b = await chromium.launch();
const page = await (await b.newContext({ locale: 'ar-SA', viewport: { width: 390, height: 780 } })).newPage();
const errors = []; page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { const t=m.text(); if (m.type()==='error' && !t.includes('ERR_')) errors.push(t); });
const ok = (n,c,x='') => console.log(`${c?'PASS':'FAIL'} — ${n}${x?' :: '+x:''}`);
await page.addInitScript(() => { window.print = () => { window.__printed = (window.__printed||0)+1; }; });
await page.goto((process.env.TEST_URL || 'http://127.0.0.1:8234') + '/index.html');
await page.waitForTimeout(1400);

console.log('--- الشعار والرابط العميق والتعديل والحذف ---');
// شعار حقيقي (PNG صغير) عبر مسار الرفع نفسه المستعمل في الإعدادات
const logoOk = await page.evaluate(async () => {
  const { storeImage } = await import('/js/data/images.js');
  const { setCompany, getCompany } = await import('/js/data/settings.js');
  const png = 'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAJElEQVR42u3NMQEAAAgDoC251a3gLzSgOXeqAAAAAAAAAAAAvAxJlwGBMRUXtAAAAABJRU5ErkJggg==';
  const bytes = Uint8Array.from(atob(png), c => c.charCodeAt(0));
  const file = new File([bytes], 'logo.png', { type: 'image/png' });
  const rec = await storeImage(file, { entity: 'company', entityId: 'company' });
  await setCompany({ name: 'مكتب سائح', logoImageId: rec.id });
  return (await getCompany()).logoImageId === rec.id;
});
ok('رفع الشعار وحفظه في مخزن الصور', logoOk);

const invId = await page.evaluate(async () => {
  const { repo } = await import('/js/data/repository.js');
  const c = await repo.clients.create({ name: 'نورة العتيبي', phone: '0501112223' });
  const inv = await repo.invoices.create({ type: 'quote', number: 'عرض سعر 3001', date: new Date().toISOString(),
    clientId: c.id, clientName: 'نورة العتيبي', clientPhone: '0501112223',
    items: [{ description: 'تسويق عقار', qty: 1, unitPrice: 12000 }] });
  return inv.id;
});
await page.evaluate(id => { location.hash = `#/invoices/${id}`; }, invId);
await page.waitForTimeout(1200);
ok('الرابط العميق #/invoices/<id> يفتح المستند مباشرة', await page.locator('.modal').count() === 1,
   (await page.locator('.modal-title').textContent().catch(()=>'')) || '');

// الشعار يظهر في ورقة الطباعة
await page.locator('.modal').last().locator('button:has-text("طباعة")').click();
await page.waitForTimeout(900);
const hasLogo = await page.evaluate(() => !!document.querySelector('#print-root .print-logo'));
ok('الشعار يُطبع أعلى المستند', hasLogo);
await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
await page.waitForTimeout(300);

// تعديل ثم حذف
await page.evaluate(id => { location.hash = '#/invoices'; location.hash = `#/invoices/${id}`; }, invId);
await page.waitForTimeout(1200);
let modal = page.locator('.modal').last();
await modal.locator('.invoice-items tbody tr').nth(0).locator('input[type="number"]').nth(1).fill('15000');
await modal.locator('button:has-text("حفظ التعديلات")').click();
await page.waitForTimeout(900);
const edited = await page.evaluate(async id => {
  const { repo } = await import('/js/data/repository.js');
  const { invoiceTotal } = await import('/js/data/schema.js');
  return invoiceTotal(await repo.invoices.get(id));
}, invId);
ok('التعديل يُحفظ ويُعاد حساب الإجمالي', edited === 15000, String(edited));

// حذف العميل قسريًا: الفاتورة تبقى واسم العميل فيها كما طُبع
const detach = await page.evaluate(async id => {
  const { repo } = await import('/js/data/repository.js');
  const inv = await repo.invoices.get(id);
  const impact = await repo.clients.deleteImpact(inv.clientId);
  await repo.clients.remove(inv.clientId, { force: true });
  const after = await repo.invoices.get(id);
  return { impact, kept: !!after, clientId: after?.clientId, name: after?.clientName };
}, invId);
ok('أثر الحذف يعدّ الفواتير المرتبطة', detach.impact.invoices === 1, JSON.stringify(detach.impact));
ok('حذف العميل لا يمحو المستند ويُبقي الاسم المطبوع', detach.kept && detach.clientId === null && detach.name === 'نورة العتيبي', JSON.stringify(detach));

// حذف المستند من نموذجه
await page.evaluate(id => { location.hash = '#/invoices'; location.hash = `#/invoices/${id}`; }, invId);
await page.waitForTimeout(1200);
await page.locator('.modal').last().locator('button:has-text("حذف")').click();
await page.waitForTimeout(500);
await page.locator('.modal').last().locator('button:has-text("حذف")').last().click();
await page.waitForTimeout(800);
const gone = await page.evaluate(async id => !(await (await import('/js/data/repository.js')).repo.invoices.get(id)), invId);
ok('حذف المستند يعمل مع تأكيد', gone);

console.log('\n--- الجوال (عرض 390px) ---');
const layout = await page.evaluate(() => ({
  overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  sidebarHidden: getComputedStyle(document.querySelector('.sidebar')).transform,
}));
ok('لا تجاوز أفقي للصفحة على الجوال', layout.overflow <= 1, 'زيادة=' + layout.overflow);
const tableScrolls = await page.evaluate(() => {
  const w = document.querySelector('.table-wrap');
  return w ? getComputedStyle(w).overflowX : 'n/a';
});
ok('جدول المستندات داخل حاوية قابلة للتمرير أفقيًا', ['auto','scroll'].includes(tableScrolls), tableScrolls);

console.log('\nERRORS:', errors.length ? JSON.stringify(errors.slice(0,4)) : 'none');
await b.close();
