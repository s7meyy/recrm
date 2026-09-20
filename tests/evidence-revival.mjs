// المرحلة ٣٥ في متصفح حقيقي: شهادة السوق، والطلبات العائدة، وسبب الخسارة، ووقت الاتصال،
// وكلفة المصدر، ورحلة السعر.
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

/* ===== ١. شهادة السوق على العقار ===== */
console.log('\n--- ١. شهادة السوق ---');
const seed = await page.evaluate(async () => {
  const { repo } = await import('/js/data/repository.js');
  const day = 86400000;
  const property = await repo.properties.create({
    type: 'villa', city: 'الرياض', district: 'الشهادة', area: 450, price: 2500000,
    captureStatus: 'approved', purposes: ['sale'], status: 'agreed',
  });
  // تخفيضان في السجل — رحلة السعر
  await repo.properties.update(property.id, { price: 2400000 });
  await repo.properties.update(property.id, { price: 2250000 });

  const names = ['سلمان الدوسري', 'ريما الحربي', 'ماجد العنزي', 'هدى السبيعي'];
  const ids = [];
  for (const name of names) ids.push((await repo.clients.create({ name, phone: '05' + Math.floor(10000000 + Math.random() * 89999999) })).id);

  // ثلاثة رأوه ثم قالوا «السعر مرتفع»، وواحد أعجبه
  for (let i = 0; i < 3; i++) {
    await repo.showings.create({
      at: new Date(Date.now() - (i + 2) * day).toISOString(), clientId: ids[i], propertyId: property.id,
      status: 'done', impression: 'disliked', reason: 'price',
    });
  }
  await repo.showings.create({
    at: new Date(Date.now() - day).toISOString(), clientId: ids[3], propertyId: property.id,
    status: 'done', impression: 'liked',
  });
  // وواحد رفضه قبل أن يراه — شهادةٌ على الإعلان لا على العقار
  const other = await repo.clients.create({ name: 'خالد بلا معاينة', phone: '0590000001' });
  const request = await repo.requests.create({
    clientId: other.id, type: 'villa', purpose: 'sale', city: 'الرياض',
    districts: ['الشهادة'], budgetMax: 2600000, area: 450, status: 'active',
  });
  await repo.matches.create({
    requestId: request.id, propertyId: property.id, status: 'not_interested', rejectReason: 'price', score: 80,
  });
  return { propertyId: property.id, district: 'الشهادة' };
});

await page.evaluate(() => { location.hash = '#/properties'; });
await page.waitForTimeout(2200);
await page.locator('.seg-btn:has-text("جدول")').first().click().catch(() => {});
await page.waitForTimeout(900);
await page.locator('tbody tr').filter({ hasText: 'الشهادة' }).first().click();
await page.waitForTimeout(1600);
/* **النقرةُ صارت تفتح الملفّ لا الاستمارة** (المرحلة ٥٢): من يريد أن يرى لا يريد أن
   يعدّل. فيُفحص الملفُّ أوّلًا — وفيه شهادةُ السوق ورحلةُ السعر — ثمّ تُفتح الاستمارةُ
   من زرّها كما يفتحها صاحبُها، فتبقى لوحتُها مفحوصةً كما كانت. */
const profile = await page.locator('#page').innerText();
ok('**النقرةُ تفتح ملفَّ العقار لا استمارة التعديل**', /#\/property\//.test(await page.evaluate(() => location.hash)),
  await page.evaluate(() => location.hash));
ok('والملفُّ يحمل شهادةَ السوق ورحلةَ السعر', profile.includes('ماذا قال السوق') && profile.includes('رحلة السعر'),
  profile.split('\n').filter((l) => l.includes('السوق') || l.includes('رحلة')).join(' | '));
await page.locator('#page a:has-text("تعديل البيانات"), #page button:has-text("تعديل البيانات")').first().click();
await page.waitForTimeout(1600);
const form = await page.locator('.modal').last().innerText();
ok('لوحة شهادة السوق تظهر في نموذج العقار', form.includes('ماذا قال السوق عن هذا العقار؟'),
  form.split('\n').find((l) => l.includes('السوق')) || '');
ok('والحكم يذكر العدد من العدد', /\d+ من \d+/.test(form) && form.includes('السعر مرتفع'),
  form.split('\n').find((l) => l.includes('السعر مرتفع')) || '');
ok('وتفصل من رآه عمّن لم يره',
  form.includes('رأوه ثم لم يعجبهم') && form.includes('رفضوه قبل أن يروه'));
ok('وتقول إن الثانية حكمٌ على الإعلان', form.includes('حكمٌ على إعلانك'));
ok('ورحلة السعر تظهر بتخفيضيها', form.includes('رحلة السعر') && form.includes('٪'),
  form.split('\n').find((l) => l.includes('←')) || '');
ok('ولا null نصًّا', !form.includes('null') && !form.includes('undefined'));
await page.evaluate(() => { document.getElementById('modal-root')?.replaceChildren(); });

/* ===== ٢. طلبات عادت ===== */
console.log('\n--- ٢. طلبات عادت ---');
await page.evaluate(async () => {
  const { repo } = await import('/js/data/repository.js');
  const day = 86400000;
  const client = await repo.clients.create({ name: 'عبدالعزيز العائد', phone: '0590000002' });
  const request = await repo.requests.create({
    clientId: client.id, type: 'apartment', purpose: 'rent', city: 'الرياض',
    districts: ['العودة'], budgetMax: 90000, area: 160, status: 'active',
  });
  // نوقفه ثم ندخل مخزونًا بعده
  await repo.requests.update(request.id, { status: 'paused', closeReason: 'slow' });
  await new Promise((r) => setTimeout(r, 60));
  await repo.properties.create({
    type: 'apartment', city: 'الرياض', district: 'العودة', area: 160, price: 85000,
    captureStatus: 'approved', purposes: ['rent'], status: 'agreed',
  });
  void day;
});
await page.evaluate(() => { location.hash = '#/opportunities'; });
await page.waitForTimeout(2600);
const opp = await page.locator('#page').innerText();
ok('لوحة الطلبات العائدة تظهر', opp.includes('طلبات عادت'),
  opp.split('\n').find((l) => l.includes('عادت')) || '');
ok('وفيها صاحب الطلب الموقوف', opp.includes('عبدالعزيز العائد'));
ok('وتصرّح بقاعدتها', opp.includes('بعد إيقاف الطلب') && opp.includes('الطلب الموقوف وحده'));

/* ===== ٣. سبب خسارة الطلب ===== */
console.log('\n--- ٣. سبب الخسارة ---');
await page.evaluate(() => { location.hash = '#/requests'; });
await page.waitForTimeout(2200);
await page.locator('tbody tr').filter({ hasText: 'عبدالعزيز العائد' }).first().click();
await page.waitForTimeout(1300);
const reqForm = page.locator('.modal').last();
ok('حقل السبب يظهر لطلبٍ موقوف', await reqForm.locator('text=لماذا أُوقف؟').isVisible(),
  (await reqForm.innerText()).split('\n').find((l) => l.includes('لماذا')) || '');
// والحقل يختفي إن أُعيد الطلب نشطًا
// نُحدّد قائمة الحالة بتسميتها لا بترتيبها: أول select في النموذج هو العميل.
const statusSel = reqForm.locator('label.field').filter({ hasText: 'الحالة' }).locator('select').first();
await statusSel.selectOption('active');
await page.waitForTimeout(400);
ok('ويختفي إن أُعيد نشطًا', !(await reqForm.locator('text=لماذا أُوقف؟').isVisible()));
await statusSel.selectOption('paused');
await page.waitForTimeout(400);
ok('ويعود إن أُوقف', await reqForm.locator('text=لماذا أُوقف؟').isVisible());
// و«مُنجز» صفقةٌ تمّت لا خسارة، فلا يُسأل صاحبها
await statusSel.selectOption('done');
await page.waitForTimeout(400);
ok('ولا يُسأل صاحب طلبٍ مُنجز', !(await reqForm.locator('text=لماذا أُوقف؟').isVisible()));
await page.evaluate(() => { document.getElementById('modal-root')?.replaceChildren(); });

/* ===== ٤. المصروف بمصدره ===== */
console.log('\n--- ٤. كلفة المصدر ---');
await page.evaluate(async () => {
  const { repo } = await import('/js/data/repository.js');
  const client = await repo.clients.create({ name: 'عميل سناب', phone: '0590000003', referralSource: 'سناب' });
  const property = await repo.properties.create({
    type: 'villa', city: 'الرياض', district: 'المصدر', area: 400, price: 1000000,
    captureStatus: 'approved', purposes: ['sale'], status: 'agreed',
  });
  await repo.deals.create({ date: new Date().toISOString(), finalPrice: 1000000, commission: 25000, clientId: client.id, propertyId: property.id });
  await repo.expenses.create({ date: new Date().toISOString(), amount: 40000, category: 'ads', source: 'سناب' });
});
await page.evaluate(() => { location.hash = '#/expenses'; });
await page.waitForTimeout(2000);
const expText = await page.locator('#page').innerText();
ok('صفحة المصاريف تُفتح', expText.includes('المصاريف'));
await page.locator('button:has-text("مصروف")').first().click();
await page.waitForTimeout(1100);
ok('حقل المصدر في نموذج المصروف', (await page.locator('.modal').last().innerText()).includes('المصدر الذي صُرف عليه'));
await page.evaluate(() => { document.getElementById('modal-root')?.replaceChildren(); });

await page.evaluate(() => { location.hash = '#/dashboard'; });
await page.waitForTimeout(3000);
const dash = await page.locator('#page').innerText();
ok('جدول المصادر يعرض الكلفة والصافي', dash.includes('كلفة') && dash.includes('الصافي'),
  dash.split('\n').find((l) => l.includes('كلفة')) || '');
ok('ولوحة «لماذا يتركك الناس» تظهر', dash.includes('لماذا يتركك الناس'));
ok('وتذكر السبب الذي بيدك', dash.includes('بسببٍ بيدك'));

/* ===== ٥. وقت الاتصال وعدم الحضور ===== */
console.log('\n--- ٥. وقت الاتصال ---');
const hour = await page.evaluate(async () => {
  const { repo } = await import('/js/data/repository.js');
  const day = 86400000;
  // من يفضّل فترةً غير الحالية — تظهر له شارة
  const h = new Date().getHours();
  const current = h >= 6 && h < 12 ? 'morning' : (h >= 12 && h < 17 ? 'afternoon' : 'evening');
  const other = current === 'morning' ? 'evening' : 'morning';
  const c = await repo.clients.create({
    name: 'ليلى المؤجَّلة', phone: '0590000004', bestTime: other,
    contacts: [{
      id: 'x1', type: 'call', date: new Date(Date.now() - 2 * day).toISOString(), note: '',
      followUpAt: new Date(Date.now() - 3600000).toISOString(), // متابعةٌ حلّ موعدها
    }],
  });
  const p = await repo.properties.create({
    type: 'villa', city: 'الرياض', district: 'الغياب', area: 400, price: 1000000,
    captureStatus: 'approved', purposes: ['sale'], status: 'agreed',
  });
  // موعدان لم يحضرهما
  for (let i = 0; i < 2; i++) {
    await repo.showings.create({
      at: new Date(Date.now() - (i + 3) * day).toISOString(), clientId: c.id, propertyId: p.id,
      status: 'no_show', impression: 'maybe',
    });
  }
  return { other, current };
});
await page.evaluate(() => { location.hash = '#/clients'; });
await page.waitForTimeout(1000);
await page.evaluate(() => { location.hash = '#/today'; });
await page.waitForTimeout(3000);
const today = await page.locator('#page').innerText();
// **ويُقبل «خارج أوقات الاتصال»**: الفتراتُ الثلاث تنتهي عند العاشرة ليلًا، فبعدها لا فترة
// — وكان الفحصُ يطلبها دائمًا فيسقط كلّ ليلةٍ بعد العاشرة لا لعطبٍ بل لساعة التشغيل.
// والصفحةُ صارت تقولها في الحالين (المرحلة ٤٣)، فالمقيسُ أنّها **لا تسكت**.
ok('الفترة الحالية معلَنة في لوحة المتابعات', /الفترة الآن: (صباحًا|بعد الظهر|مساءً|خارج أوقات الاتصال)/.test(today),
  today.split('\n').find((l) => l.includes('الفترة الآن')) || '');
// نفحص في صفّها هي لا في نصّ الصفحة كلّه: اللوحات تعرض ثمانية، والبذور كثيرة.
const herRow = page.locator('.today-row').filter({ hasText: 'ليلى المؤجَّلة' }).first();
const herText = await herRow.innerText().catch(() => '');
ok('صفّها يظهر في «يومي»', !!herText, herText.split('\n')[0] || 'لم يظهر');
ok('وعليه شارة «أخلف مواعيد»', herText.includes('أخلف'), herText.replace(/\n/g, ' | '));
ok('وعليه شارة الوقت المفضَّل', /يفضّل (صباحًا|بعد الظهر|مساءً)/.test(herText), herText.replace(/\n/g, ' | '));
void hour;

ok('لا أخطاء في الصفحة', errors.length === 0, errors.slice(0, 3).join(' | '));
await b.close();
