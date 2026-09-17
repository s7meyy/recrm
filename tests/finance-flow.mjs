// المرحلة ٤٩ في متصفح حقيقي: التمويل، وطريقة الدفع، والعروض، والإضافة السريعة،
// والبحوث المحفوظة، والمطالبة، والاختصارات، والأسماء المقروءة.
import { chromium } from './pw.mjs';

const BASE = process.env.TEST_URL || 'http://127.0.0.1:8235';
const b = await chromium.launch();
const ctx = await b.newContext({ locale: 'ar-SA' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => {
  const t = m.text();
  if (m.type() === 'error' && !t.includes('ERR_') && !t.includes('Failed to load resource')) errors.push(t);
});
const ok = (n, c, x = '') => console.log(`${c ? 'PASS' : 'FAIL'} — ${n}${x ? ' :: ' + x : ''}`);
const closeModals = () => page.evaluate(() => document.getElementById('modal-root')?.replaceChildren());

await page.goto(BASE + '/');
await page.waitForTimeout(2400);

/* ===== ١. التمويل على الصفقة ===== */
console.log('--- ١. التمويل ---');
const seed = await page.evaluate(async () => {
  const { repo } = await import('/js/data/repository.js');
  const client = await repo.clients.create({ name: 'فهد التمويلي', phone: '0551112233' });
  const property = await repo.properties.create({
    type: 'villa', city: 'الرياض', district: 'قرطبة', area: 400, price: 2500000,
    captureStatus: 'approved', purposes: ['sale'], status: 'agreed',
  });
  const deal = await repo.deals.create({
    date: new Date().toISOString().slice(0, 10), finalPrice: 2400000, commission: 60000,
    clientId: client.id, propertyId: property.id,
  });
  return { clientId: client.id, propertyId: property.id, dealId: deal.id };
});

// الحقلُ يُحفظ، والتاريخُ يُختم وحدَه عند تغيّر المرحلة.
const saved = await page.evaluate(async (id) => {
  const { repo } = await import('/js/data/repository.js');
  const before = await repo.deals.get(id);
  const after = await repo.deals.update(id, { financeStage: 'applied', financeBank: 'الراجحي' });
  // حفظٌ ثانٍ بلا تغيير مرحلةٍ لا يُحرّك التاريخ
  await new Promise((r) => setTimeout(r, 20));
  const again = await repo.deals.update(id, { notes: 'ملاحظة' });
  return {
    beforeStage: before.financeStage, stage: after.financeStage, bank: after.financeBank,
    stamped: !!after.financeAt, unchanged: again.financeAt === after.financeAt,
    tracked: (again.history || []).some((h) => 'financeStage' in (h.changes || {})),
  };
}, seed.dealId);
ok('حالةُ التمويل تُحفظ على الصفقة', saved.stage === 'applied' && saved.bank === 'الراجحي', JSON.stringify(saved));
ok('وكانت فارغةً قبلها — لا يُخترع لها افتراض', saved.beforeStage === '');
ok('**والتاريخُ يُختم عند تغيّر المرحلة وحدها**', saved.stamped === true);
ok('**ولا يتحرّك بحفظٍ لا يمسّها** — وإلّا لأسكت التنبيهَ كلَّما فتحتَ الصفقة', saved.unchanged === true);
ok('والمرحلةُ تدخل سجلّ «ماذا تغيّر»', saved.tracked === true);

// مرحلةٌ مجهولةٌ تُردّ إلى الفراغ، ولا تُحفظ نصًّا لا يُفرز به
const guard = await page.evaluate(async (id) => {
  const { repo } = await import('/js/data/repository.js');
  const r = await repo.deals.update(id, { financeStage: 'وين وصل' });
  const cleared = await repo.deals.update(id, { financeStage: '' });
  return { stage: r.financeStage, at: cleared.financeAt };
}, seed.dealId);
ok('ومرحلةٌ مجهولةٌ تُردّ إلى الفراغ', guard.stage === '');
ok('وتاريخٌ بلا مرحلةٍ يُمحى فلا يبقى معلَّقًا', guard.at === null);

// الجدولُ يعرض عمودَ التمويل
await page.evaluate(async (id) => {
  const { repo } = await import('/js/data/repository.js');
  await repo.deals.update(id, { financeStage: 'valuation', financeBank: 'الأهلي' });
  location.hash = '#/deals';
}, seed.dealId);
await page.waitForTimeout(1800);
const dealsText = await page.locator('#page').innerText();
ok('عمودُ التمويل في جدول الصفقات', dealsText.includes('التمويل'));
ok('والمرحلةُ تُقرأ باسمها', dealsText.includes('تقييمٌ عقاريّ'), dealsText.split('\n').find((l) => l.includes('تقييم')) || '');

// الاستمارة فيها القسم
await page.locator('button:has-text("تعديل")').first().click();
await page.waitForTimeout(900);
const dealForm = await page.locator('.modal').last().innerText();
ok('واستمارةُ الصفقة فيها قسمُ التمويل', dealForm.includes('حالة التمويل') && dealForm.includes('البنك'));
ok('وتقول متى تُنبَّه', dealForm.includes('سكت البنكُ'), dealForm.split('\n').find((l) => l.includes('البنك')) || '');
await closeModals();

/* ===== ٢. طريقة الدفع في الطلب ===== */
console.log('\n--- ٢. كيف يدفع؟ ---');
const req = await page.evaluate(async (ids) => {
  const { repo } = await import('/js/data/repository.js');
  const r = await repo.requests.create({
    clientId: ids.clientId, type: 'villa', purpose: 'sale', city: 'الرياض', budgetMax: 2500000,
    payMethod: 'cash',
  });
  const bad = await repo.requests.update(r.id, { payMethod: 'شيك' });
  return { saved: r.payMethod, guarded: bad.payMethod };
}, seed);
ok('طريقةُ الدفع تُحفظ في الطلب', req.saved === 'cash');
ok('والمجهولةُ تُردّ إلى الفراغ — «لم يُسأل» ليست جوابًا', req.guarded === '');

await page.evaluate(async (id) => {
  const { repo } = await import('/js/data/repository.js');
  const all = await repo.requests.list();
  await repo.requests.update(all[all.length - 1].id, { payMethod: 'cash' });
  location.hash = '#/requests';
}, seed.clientId);
await page.waitForTimeout(1800);
const reqText = await page.locator('#page').innerText();
ok('و«نقدًا» تُقرأ حيث تُقرأ الميزانية', reqText.includes('نقدًا'), reqText.split('\n').find((l) => l.includes('نقدًا')) || '');

/* ===== ٣. العروض المقدَّمة ===== */
console.log('\n--- ٣. العروض ---');
await page.evaluate(async (id) => {
  const { repo } = await import('/js/data/repository.js');
  await repo.properties.update(id, {
    offers: [
      { amount: 2300000, status: 'rejected', at: '2026-08-01T00:00:00Z', from: 'أبو فهد' },
      { amount: 2200000, status: 'rejected', at: '2026-07-01T00:00:00Z' },
      { amount: 0, status: 'open' }, // يُسقط
    ],
  });
  location.hash = `#/properties/${id}`;
}, seed.propertyId);
await page.waitForTimeout(2000);
const propForm = await page.locator('.modal').last().innerText();
ok('قسمُ العروض في استمارة العقار', propForm.includes('العروض المقدَّمة'));
ok('**وجملةُ المالك من أرقامٍ لا من رأي**',
  /رُفض/.test(propForm) && /أعلى مرفوض/.test(propForm), propForm.split('\n').find((l) => l.includes('رُفض')) || '');
ok('وتُقرأ في لوحة «ماذا قال السوق»', propForm.includes('ماذا قال السوق'));
const kept = await page.evaluate(async (id) => {
  const { repo } = await import('/js/data/repository.js');
  return (await repo.properties.get(id)).offers.length;
}, seed.propertyId);
ok('وعرضٌ بلا مبلغٍ يُسقط — لا يُحاجَّ به مالك', kept === 2, String(kept));
await closeModals();

/* ===== ٤. على الخارطة ===== */
console.log('\n--- ٤. على الخارطة ---');
const offPlan = await page.evaluate(async (id) => {
  const { repo } = await import('/js/data/repository.js');
  const on = await repo.properties.update(id, { offPlan: true, deliveryAt: '2027-06-01T00:00:00Z', wafiLicense: 'W-1' });
  const off = await repo.properties.update(id, { offPlan: false });
  const back = await repo.properties.update(id, { offPlan: true, deliveryAt: '2027-06-01T00:00:00Z', wafiLicense: 'W-1' });
  const found = await repo.properties.search('وافي');
  return { on: on.offPlan, delivery: on.deliveryAt, cleared: off.deliveryAt, wafi: off.wafiLicense, searchable: found.some((p) => p.id === back.id) };
}, seed.propertyId);
ok('العلمُ وتاريخُ التسليم يُحفظان', offPlan.on === true && !!offPlan.delivery);
ok('**وإطفاءُ العلم يمحو ما لا معنى له** — فلا يبقى تسليمٌ في عقارٍ قائم',
  offPlan.cleared === null && offPlan.wafi === '');
ok('و«وافي» كلمةٌ يُبحث بها', offPlan.searchable === true);

/* ===== ٥. الإضافة السريعة ===== */
console.log('\n--- ٥. الإضافة السريعة ---');
await page.evaluate(() => { location.hash = '#/clients'; });
await page.waitForTimeout(1800);
ok('صفُّ الإضافة السريعة فوق قائمة العملاء', await page.locator('.quick-add').count() === 1);
const qa = page.locator('.quick-add');
await qa.locator('input').nth(0).fill('سريعٌ بلا استمارة');
await qa.locator('input').nth(1).fill('0509998877');
await qa.locator('input').nth(1).press('Enter');
await page.waitForTimeout(1400);
const quickAdded = await page.evaluate(async () => {
  const { repo } = await import('/js/data/repository.js');
  return (await repo.clients.list()).some((c) => c.name === 'سريعٌ بلا استمارة' && c.phone === '0509998877');
});
ok('واسمٌ وجوّالٌ و«إدخال» يكفيان', quickAdded === true);
ok('والحقولُ تُفرَّغ للسجلّ التالي', (await qa.locator('input').nth(0).inputValue()) === '');

/* ===== ٦. البحوث المحفوظة في العملاء ===== */
console.log('\n--- ٦. البحث المحفوظ ---');
await page.locator('#page .input.search').first().fill('سريع');
await page.waitForTimeout(600);
ok('و«احفظ هذا البحث» يظهر متى كان في اليد ما يُحفظ',
  await page.locator('.saved-row button:has-text("احفظ هذا البحث")').count() === 1);
page.once('dialog', () => {});
await page.evaluate(() => {
  // نحفظ مباشرةً عبر الطبقة نفسِها التي يستعملها الزرّ — النافذةُ مُختبَرةٌ في مكانٍ آخر.
  return import('/js/data/settings.js').then((m) => m.addSavedSearch('clients', 'الجادّون', { query: 'سريع', filters: {} }));
});
await page.evaluate(() => { location.hash = '#/properties'; });
await page.waitForTimeout(900);
await page.evaluate(() => { location.hash = '#/clients'; });
await page.waitForTimeout(1800);
ok('والمحفوظُ يظهر رقاقةً فوق القائمة',
  await page.locator('.saved-chip:has-text("الجادّون")').count() === 1);
await page.locator('.saved-chip .saved-apply').first().click();
await page.waitForTimeout(900);
ok('وضغطةٌ تُعيد البحثَ كما كان',
  (await page.locator('#page .input.search').first().inputValue()) === 'سريع');
ok('والرقاقةُ تُنادى باسمها لقارئ الشاشة',
  (await page.locator('.saved-chip .saved-apply').first().getAttribute('aria-label') || '').includes('الجادّون'));

/* ===== ٧. المطالبة بالمتأخّر ===== */
console.log('\n--- ٧. المطالبة ---');
await page.evaluate(async (ids) => {
  const { repo } = await import('/js/data/repository.js');
  const old = new Date(Date.now() - 70 * 86400000).toISOString().slice(0, 10);
  await repo.invoices.create({
    type: 'invoice', number: 'DUN-1', date: old, dueAt: old,
    clientId: ids.clientId, clientName: 'فهد التمويلي', clientPhone: '0551112233',
    items: [{ description: 'عمولة', qty: 1, unitPrice: 20000 }],
  });
  location.hash = '#/invoices';
}, seed);
await page.waitForTimeout(2200);
ok('زرُّ المطالبة يظهر مع وجود متأخّر',
  await page.locator('button:has-text("طالِب بالمتأخّر")').count() === 1);
await page.locator('button:has-text("طالِب بالمتأخّر")').click();
await page.waitForTimeout(900);
const dun = page.locator('.modal').last();
const dunText = await dun.innerText();
ok('والنصُّ مملوءٌ بالاسم والمبلغ', /فهد التمويلي/.test(dunText) && /20/.test(dunText), dunText.slice(0, 120));
ok('**والنبرةُ تتبع طولَ التأخّر**', /متابعة|مطالبة/.test(dunText));
ok('ويُقال إنّ النصّ يُعدَّل قبل الإرسال', dunText.includes('يُعدَّل داخل واتساب'));
ok('وزرُّ المحادثة حاضر', await dun.locator('button:has-text("افتح المحادثة")').count() >= 1);
await page.keyboard.press('Escape');
await page.waitForTimeout(500);

/* ===== ٨. الاختصارات والأسماء المقروءة ===== */
console.log('\n--- ٨. لوحة المفاتيح والوصولية ---');
await page.evaluate(() => { location.hash = '#/today'; });
await page.waitForTimeout(1600);
await page.keyboard.press('Alt+KeyC');
await page.waitForTimeout(1800);
ok('Alt+C يفتح استمارةَ عميلٍ جديد من أي صفحة',
  await page.locator('.modal').count() === 1, (await page.locator('.modal-title').textContent().catch(() => '')) || '');
ok('**والعلامةُ تُمحى من العنوان** فلا تُفتح في كل زيارةٍ بعدها',
  !/new=1/.test(await page.evaluate(() => location.hash)), await page.evaluate(() => location.hash));

const modalA11y = await page.evaluate(() => {
  const box = document.querySelector('.modal');
  const labelledBy = box?.getAttribute('aria-labelledby');
  const title = labelledBy ? document.getElementById(labelledBy) : null;
  return {
    role: box?.getAttribute('role'),
    modal: box?.getAttribute('aria-modal'),
    named: !!title && !!title.textContent.trim(),
    focusInside: !!box?.contains(document.activeElement),
  };
});
ok('والنافذةُ حوارٌ له اسمٌ يُنطَق',
  modalA11y.role === 'dialog' && modalA11y.modal === 'true' && modalA11y.named, JSON.stringify(modalA11y));
ok('والتركيزُ يبدأ داخلها لا في الصفحة تحتها', modalA11y.focusInside === true);

// حبسُ التركيز: Shift+Tab من أوّل عنصرٍ يعود إلى آخره لا يخرج إلى الصفحة
const trapped = await page.evaluate(() => {
  const box = document.querySelector('.modal');
  const items = [...box.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select, textarea')]
    .filter((n) => !n.hidden && n.offsetParent !== null);
  items[0]?.focus();
  return items.length > 1;
});
if (trapped) {
  await page.keyboard.press('Shift+Tab');
  await page.waitForTimeout(200);
  ok('والتنقّلُ بـTab لا يخرج منها إلى صفحةٍ محجوبة',
    await page.evaluate(() => !!document.querySelector('.modal')?.contains(document.activeElement)));
}
await page.keyboard.press('Escape');
await page.waitForTimeout(600);

await page.evaluate(() => { location.hash = '#/deals'; });
await page.waitForTimeout(1600);
const named = await page.evaluate(() => {
  const btns = [...document.querySelectorAll('#page button, #page a')];
  const symbolOnly = /^[^\p{L}\p{N}]+$/u;
  const icons = btns.filter((b) => {
    const t = (b.textContent || '').trim();
    return t && symbolOnly.test(t);
  });
  return { total: icons.length, unnamed: icons.filter((b) => !b.getAttribute('aria-label') && !b.getAttribute('title')).length };
});
ok('**وكلُّ زرٍّ رمزيٍّ له اسمٌ يُقرأ** — لا «زر» مجرَّدة',
  named.unnamed === 0, `${named.unnamed} بلا اسم من ${named.total}`);

const live = await page.evaluate(async () => {
  const { toast } = await import('/js/util/dom.js');
  toast('اختبار', 'error');
  const n = document.querySelector('#toast-root .toast');
  return { role: n?.getAttribute('role'), live: n?.getAttribute('aria-live') };
});
ok('والخطأُ يُعلَن لا يُرى فقط', live.role === 'alert' && live.live === 'assertive', JSON.stringify(live));

ok('لا أخطاء في الصفحة', errors.length === 0, errors.slice(0, 3).join(' | '));
await b.close();
