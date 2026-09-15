// المرحلة ٣٩ — لصق عرض العميل في صفحة العقارات: الاستمارة، والإنشاء، وعدم التكرار.
import { chromium } from './pw.mjs';
const BASE = process.env.TEST_URL || 'http://127.0.0.1:8235';
const b = await chromium.launch();
const page = await (await b.newContext({ locale: 'ar-SA' })).newPage();
const errors = [];
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
page.on('console', m => { const t = m.text(); if (m.type() === 'error' && !t.includes('ERR_') && !t.includes('Failed to load resource')) errors.push(t); });
const ok = (n, c, x = '') => console.log(`${c ? 'PASS' : 'FAIL'} — ${n}${x ? ' :: ' + x : ''}`);

/** يغلق كل نافذة مفتوحة وينتظر اختفاءها — الافتراض أنّها أُغلقت يُعطّل بقيّة الحزمة. */
const closeModals = async () => {
  for (let i = 0; i < 6 && (await page.locator('.modal-overlay').count()); i++) {
    await page.locator('.modal-overlay').last().locator('button[aria-label="إغلاق"]').click({ force: true });
    await page.waitForTimeout(300);
  }
  return page.locator('.modal-overlay').count();
};

const MSG = 'السلام عليكم، انا سعد التميمي، عندي فلة في حي النرجس بالرياض للبيع، '
  + 'المساحة ٤٥٠ متر والسعر مليونين ونص، رقم الصك ٣١٠٢٠٤٥٦٧٨٩، جوالي ٠٥٥٧٧٧٨٨٩٩';

await page.goto(BASE + '/');
await page.waitForTimeout(2200);
await page.evaluate(() => { location.hash = '#/properties'; });
await page.waitForTimeout(1400);

/* ===== الزرّ ومكانه ===== */
console.log('\n--- ٣٩. الزرّ ---');
const btn = page.locator('#page .page-head button:has-text("لصق عرض عميل")');
ok('الزرّ في رأس صفحة العقارات', await btn.count() === 1);
ok('وبجانب «إضافة عقار» لا بدلًا منه', await page.locator('#page .page-head button:has-text("إضافة عقار")').count() === 1);

/* ===== القراءة تُعرض قبل أي حفظ ===== */
console.log('\n--- ٣٩. القراءة ---');
await btn.click();
await page.waitForTimeout(600);
let modal = page.locator('.modal').last();
ok('النافذة تقول إنّ القراءة في المتصفّح وحده', (await modal.innerText()).includes('متصفحك فقط'));
const quick = modal.locator('button:has-text("أنشئ المالك والعقار")');
const openForm = modal.locator('button:has-text("افتح الاستمارة معبّأة")');
ok('الزرّان معطَّلان قبل القراءة', await quick.isDisabled() && await openForm.isDisabled());

await modal.locator('textarea').fill(MSG);
await modal.locator('button:has-text("اقرأ الحقول من النص")').click();
await page.waitForTimeout(500);
const chips = (await modal.locator('.chip-static').allInnerTexts()).join(' | ');
ok('الحقول المقروءة تُعرض قبل الحفظ', chips.includes('فلة') && chips.includes('النرجس'), chips);
ok('والسعر «مليونين ونص» قُرئ ٢٬٥٠٠٬٠٠٠', chips.includes('2,500,000'), chips);
ok('ورقم الصك', chips.includes('31020456789'));
ok('واسم المالك وجواله', chips.includes('سعد التميمي') && chips.includes('0557778899'));
ok('والزرّان صارا فعّالَين', !(await quick.isDisabled()) && !(await openForm.isDisabled()));

/* ===== لا شيء يُحفظ بلا ضغطك ===== */
const beforeCount = await page.evaluate(async () => (await (await import('/js/data/repository.js')).repo.properties.list()).length);
await modal.locator('button:has-text("إلغاء")').click();
await page.waitForTimeout(500);
const afterCancel = await page.evaluate(async () => (await (await import('/js/data/repository.js')).repo.properties.list()).length);
ok('الإلغاء لا يحفظ شيئًا (القراءة اقتراحٌ لا حكم)', beforeCount === afterCancel, `${beforeCount} = ${afterCancel}`);

/* ===== الاستمارة تُفتح معبّأة ===== */
console.log('\n--- ٣٩. الاستمارة معبّأة ---');
await btn.click();
await page.waitForTimeout(500);
modal = page.locator('.modal').last();
await modal.locator('textarea').fill(MSG);
await modal.locator('button:has-text("اقرأ الحقول من النص")').click();
await page.waitForTimeout(400);
await modal.locator('button:has-text("افتح الاستمارة معبّأة")').click();
await page.waitForTimeout(900);
const form = page.locator('.modal').last();
ok('استمارة العقار فُتحت', (await form.innerText()).includes('عقار جديد'));
const priceVal = await form.locator('input[type="number"]').nth(1).inputValue();
ok('والسعر معبّأ فيها', priceVal === '2500000', priceVal);
const deedVal = await form.locator('input[placeholder*="الصك"]').inputValue();
ok('ورقم الصك معبّأ', deedVal === '31020456789', deedVal);
await closeModals();

/* ===== الإنشاء بضغطة ===== */
console.log('\n--- ٣٩. أنشئ المالك والعقار ---');
await btn.click();
await page.waitForTimeout(500);
modal = page.locator('.modal').last();
await modal.locator('textarea').fill(MSG);
await modal.locator('button:has-text("اقرأ الحقول من النص")').click();
await page.waitForTimeout(400);
await modal.locator('button:has-text("أنشئ المالك والعقار")').click();
await page.waitForTimeout(1600);

const made = await page.evaluate(async () => {
  const { repo } = await import('/js/data/repository.js');
  const clients = await repo.clients.list();
  const owner = clients.find((c) => c.phone === '0557778899');
  const props = await repo.properties.list();
  const p = props.find((x) => x.ownerId === owner?.id);
  return {
    ownerName: owner?.name, roles: owner?.roles, contacts: (owner?.contacts || []).length,
    price: p?.price, area: p?.area, district: p?.district, type: p?.type,
    deed: p?.deedNumber, status: p?.status, capture: p?.captureStatus,
    purposes: p?.purposes, notes: (p?.notes || '').slice(0, 20),
  };
});
ok('أُنشئ المالك باسمه', made.ownerName === 'سعد التميمي', String(made.ownerName));
ok('ودورُه «مالك عرض»', (made.roles || []).includes('owner'), JSON.stringify(made.roles));
ok('وسُجِّل تواصلٌ في ملفّه', made.contacts === 1, String(made.contacts));
ok('وأُنشئ عقارُه مربوطًا به', made.type === 'villa' && made.district === 'النرجس', `${made.type} · ${made.district}`);
ok('بسعره ومساحته', made.price === 2500000 && made.area === 450, `${made.price} · ${made.area}`);
ok('ورقم صكّه', made.deed === '31020456789', String(made.deed));
ok('وحالتُه «موافق للتعاون» — عرضه علينا بنفسه', made.status === 'agreed', String(made.status));
ok('ومعتمدٌ لا ينتظر معالجة', made.capture === 'approved', String(made.capture));
ok('ونصّ الرسالة محفوظٌ في الملاحظات', made.notes.includes('السلام'), made.notes);
ok('والصفحة انتقلت إلى العقار', (await page.evaluate(() => location.hash)).startsWith('#/properties/'), await page.evaluate(() => location.hash));
// واستمارتُه تُفتح: أنت لتوّك أنشأته من رسالة، فتُضيف صوره وموقعه قبل أن تنساه.
ok('واستمارة العقار الجديد مفتوحةٌ لإكماله', (await page.locator('.modal').last().innerText()).includes('تعديل العقار'),
  (await page.locator('.modal').last().locator('h2, .modal-title').first().innerText()));
ok('وتُغلق فتبقى الصفحة نظيفة', (await closeModals()) === 0);

/* ===== لا تكرار: نفس الجوال ===== */
console.log('\n--- ٣٩. لا مالك مكرَّر ---');
await page.evaluate(() => { location.hash = '#/clients'; });
await page.waitForTimeout(400);
await page.evaluate(() => { location.hash = '#/properties'; });
await page.waitForTimeout(1200);
await page.locator('#page .page-head button:has-text("لصق عرض عميل")').click();
await page.waitForTimeout(500);
modal = page.locator('.modal').last();
await modal.locator('textarea').fill('انا سعد التميمي، عندي ارض في الملقا بالرياض للبيع، المساحة ٩٠٠ متر والسعر ٣ ملايين، جوالي ٠٥٥٧٧٧٨٨٩٩');
await modal.locator('button:has-text("اقرأ الحقول من النص")').click();
await page.waitForTimeout(400);
await modal.locator('button:has-text("أنشئ المالك والعقار")').click();
await page.waitForTimeout(1600);
await closeModals();
const dedupe = await page.evaluate(async () => {
  const { repo } = await import('/js/data/repository.js');
  const clients = (await repo.clients.list()).filter((c) => c.phone === '0557778899');
  const props = await repo.properties.list();
  return { owners: clients.length, owned: props.filter((p) => p.ownerId === clients[0]?.id).length };
});
ok('الجوال المسجَّل لا يُنشئ مالكًا ثانيًا', dedupe.owners === 1, String(dedupe.owners));
ok('والعقار الثاني يُضاف إلى سجلّه نفسه', dedupe.owned === 2, String(dedupe.owned));

/* ===== باحثٌ صار مالكًا: دورٌ يُضاف لا سجلٌّ يُنافس ===== */
console.log('\n--- ٣٩. باحثٌ يعرض عقاره ---');
await page.evaluate(async () => {
  const { repo } = await import('/js/data/repository.js');
  await repo.clients.create({ name: 'نورة القحطاني', phone: '0559990011', roles: ['seeker'], stage: 'new' });
});
await page.evaluate(() => { location.hash = '#/clients'; });
await page.waitForTimeout(400);
await page.evaluate(() => { location.hash = '#/properties'; });
await page.waitForTimeout(1200);
await page.locator('#page .page-head button:has-text("لصق عرض عميل")').click();
await page.waitForTimeout(500);
modal = page.locator('.modal').last();
await modal.locator('textarea').fill('عندي شقة في حطين بالرياض للايجار، المساحة ١٦٠ متر والسعر ٧٠ الف، جوالي ٠٥٥٩٩٩٠٠١١');
await modal.locator('button:has-text("اقرأ الحقول من النص")').click();
await page.waitForTimeout(400);
await modal.locator('button:has-text("أنشئ المالك والعقار")').click();
await page.waitForTimeout(1600);
await closeModals();
const roles = await page.evaluate(async () => {
  const { repo } = await import('/js/data/repository.js');
  const c = (await repo.clients.list()).filter((x) => x.phone === '0559990011');
  return { count: c.length, roles: c[0]?.roles, name: c[0]?.name };
});
ok('لا سجلّ ثانٍ لمن كان باحثًا', roles.count === 1, String(roles.count));
ok('واسمه المسجَّل لم يُمسّ', roles.name === 'نورة القحطاني', String(roles.name));
ok('وصار الاثنين: باحثًا ومالكًا', (roles.roles || []).includes('seeker') && (roles.roles || []).includes('owner'), JSON.stringify(roles.roles));

console.log('\n' + (errors.length ? 'FAIL — أخطاء وحدة التحكّم :: ' + errors.join(' | ') : 'PASS — لا أخطاء في وحدة التحكّم'));
await b.close();
