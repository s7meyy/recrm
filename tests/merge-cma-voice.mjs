// المرحلة ٢٦ في متصفح حقيقي: دمج المكرّرين، وتقرير المقارنة السوقية، والملاحظة الصوتية.
//
// الميكروفون: كروم يشغَّل بجهاز صوتٍ وهمي وإذنٍ ممنوح مسبقًا، فيعمل MediaRecorder فعلًا
// ويُختبر المسار كاملًا (تسجيل ⇐ حفظ في مخزن audio ⇐ قراءة من سجل التواصل).
import { chromium } from './pw.mjs';

const BASE = process.env.TEST_URL || 'http://127.0.0.1:8235';
const b = await chromium.launch({
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
});
const ctx = await b.newContext({ locale: 'ar-SA', permissions: ['microphone'] });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !t.includes('ERR_') && !t.includes('Failed to load resource')) errors.push(t); });
const ok = (n, c, x = '') => console.log(`${c ? 'PASS' : 'FAIL'} — ${n}${x ? ' :: ' + x : ''}`);

await page.goto(BASE + '/');
await page.waitForTimeout(2400);

/* ===== ٠. نسخة قاعدة البيانات ===== */
const dbVersion = await page.evaluate(() => new Promise((resolve) => {
  const req = indexedDB.open('motabiq');
  req.onsuccess = () => { const v = req.result.version; const has = req.result.objectStoreNames.contains('audio'); req.result.close(); resolve({ v, has }); };
  req.onerror = () => resolve({ v: 0, has: false });
}));
ok('نسخة قاعدة البيانات ٦ ومخزن audio موجود', dbVersion.v === 6 && dbVersion.has, JSON.stringify(dbVersion));

/* ===== ١. دمج العملاء المكرّرين ===== */
console.log('\n--- ١. الدمج ---');
const seed = await page.evaluate(async () => {
  const { repo } = await import('/js/data/repository.js');
  const keep = await repo.clients.create({
    name: 'سلطان الحربي', phone: '0551234567', notes: 'يبحث عن فلة', tags: ['جادّ'], roles: ['seeker'],
  });
  await repo.clients.addContact(keep.id, { type: 'call', date: '2026-08-01T10:00:00.000Z', note: 'مكالمة أولى' });
  const dup = await repo.clients.create({
    name: 'سلطان الحربي', phone: '0551234567', phone2: '0569998888', notes: 'جاء من إعلان',
    roles: ['owner'], referralSource: 'إعلان',
  });
  await repo.clients.addContact(dup.id, { type: 'whatsapp', date: '2026-08-10T10:00:00.000Z', note: 'أرسلت له عروضًا' });
  const property = await repo.properties.create({
    type: 'villa', city: 'الرياض', district: 'الملقا', area: 350, price: 1800000,
    captureStatus: 'approved', ownerId: dup.id, purposes: ['sale'],
  });
  const request = await repo.requests.create({ clientId: dup.id, type: 'villa', purpose: 'sale', city: 'الرياض', status: 'active' });
  const deal = await repo.deals.create({ date: '2026-08-20', finalPrice: 1750000, commission: 43750, clientId: dup.id });
  return { keepId: keep.id, dupId: dup.id, propertyId: property.id, requestId: request.id, dealId: deal.id };
});

await page.evaluate(() => { location.hash = '#/clients'; });
await page.waitForTimeout(1800);
const dupBtn = page.locator('.page-head button:has-text("عملاء مكرّرون")');
ok('زرّ المكرّرين يظهر لأن التكرار موجود', await dupBtn.count() === 1);
await dupBtn.click();
await page.waitForTimeout(900);
const modalText = await page.locator('.modal').innerText();
ok('الزوج معروض بسببه', modalText.includes('الجوال نفسه'), modalText.split('\n').find((l) => l.includes('الجوال')) || '');
ok('ومعاينة ما سينتقل قبل التأكيد', /سينتقل/.test(modalText), modalText.split('\n').find((l) => l.includes('سينتقل')) || '');

const impact = await page.evaluate(async ({ keepId, dupId }) => {
  const { repo } = await import('/js/data/repository.js');
  return repo.clients.mergeImpact(keepId, dupId);
}, seed);
ok('المعاينة تعدّ المرتبطات كلها',
  impact.properties === 1 && impact.requests === 1 && impact.deals === 1 && impact.contacts === 1,
  JSON.stringify(impact));

const merged = await page.evaluate(async ({ keepId, dupId, propertyId, requestId, dealId }) => {
  const { repo } = await import('/js/data/repository.js');
  const keep = await repo.clients.merge(keepId, dupId);
  return {
    keep,
    gone: await repo.clients.get(dupId),
    property: (await repo.properties.get(propertyId))?.ownerId,
    request: (await repo.requests.get(requestId))?.clientId,
    deal: (await repo.deals.get(dealId))?.clientId,
  };
}, seed);
ok('المرتبطات انتقلت لا حُذفت',
  merged.property === seed.keepId && merged.request === seed.keepId && merged.deal === seed.keepId,
  JSON.stringify([merged.property === seed.keepId, merged.request === seed.keepId, merged.deal === seed.keepId]));
ok('وسجل التواصل اندمج مرتَّبًا بالتاريخ',
  merged.keep.contacts.length === 2 && merged.keep.contacts[0].note === 'مكالمة أولى',
  JSON.stringify(merged.keep.contacts.map((c) => c.note)));
ok('والأدوار والتصنيفات تتّحد بلا تكرار',
  merged.keep.roles.includes('seeker') && merged.keep.roles.includes('owner') && merged.keep.tags.length === 1,
  JSON.stringify({ r: merged.keep.roles, t: merged.keep.tags }));
ok('والحقل المملوء لا يُمسّ', merged.keep.notes.startsWith('يبحث عن فلة'), merged.keep.notes.slice(0, 40));
ok('وملاحظة المحذوف تُلحق بمصدرها', merged.keep.notes.includes('من السجل المدموج') && merged.keep.notes.includes('جاء من إعلان'));
ok('والمصدر الفارغ يُملأ من المحذوف', merged.keep.referralSource === 'إعلان', merged.keep.referralSource);
ok('والجوال الثاني لا يضيع', merged.keep.phone2 === '0569998888', merged.keep.phone2);
ok('والسجل المكرّر حُذف', !merged.gone);

const selfMerge = await page.evaluate(async (id) => {
  const { repo } = await import('/js/data/repository.js');
  try { await repo.clients.merge(id, id); return 'لم يُرفض'; } catch (e) { return e.message; }
}, seed.keepId);
ok('ودمج السجل في نفسه مرفوض', selfMerge.includes('نفسه'), selfMerge);

/* ===== ٢. تقرير المقارنة السوقية ===== */
console.log('\n--- ٢. تقرير المالك ---');
const cmaProperty = await page.evaluate(async () => {
  const { repo } = await import('/js/data/repository.js');
  const owner = await repo.clients.create({ name: 'مالك النرجس', phone: '0533332222' });
  const make = (price, area, district = 'النرجس') => repo.properties.create({
    type: 'villa', city: 'الرياض', district, area, price, captureStatus: 'approved', purposes: ['sale'],
  });
  for (const [price, area] of [[2000000, 400], [2200000, 420], [1900000, 380], [2100000, 410], [2050000, 400]]) {
    await make(price, area);
  }
  const target = await repo.properties.create({
    type: 'villa', city: 'الرياض', district: 'النرجس', area: 400, price: 2600000,
    captureStatus: 'approved', purposes: ['sale'], ownerId: owner.id,
  });
  return target.id;
});

// الطباعة تُبنى في #print-root ثم تُطبع؛ نعترض window.print لنقرأ الورقة بلا فتح حوار.
await page.evaluate(() => { window.__printed = 0; window.print = () => { window.__printed++; }; });
await page.evaluate(() => { location.hash = '#/properties'; });
await page.waitForTimeout(2200);
const cma = await page.evaluate(async (id) => {
  const { repo } = await import('/js/data/repository.js');
  const { getLists, getCompany } = await import('/js/data/settings.js');
  const { priceSamples, estimatePrice, priceTrend } = await import('/js/util/price-stats.js');
  const { printCma } = await import('/js/util/property-print.js');
  const [properties, externals, deals, lists, company] = await Promise.all([
    repo.properties.list(), repo.externalListings.list(), repo.deals.list(), getLists(), getCompany(),
  ]);
  const p = await repo.properties.get(id);
  const samples = priceSamples({ properties, externals, deals });
  const estimate = estimatePrice({ area: p.area, type: p.type, city: p.city, district: p.district, purpose: 'sale', excludeId: p.id }, samples);
  await printCma(p, { lists, company, owner: null, estimate, trend: priceTrend(p) });
  await new Promise((r) => setTimeout(r, 120)); // printNode يستدعي window.print بـsetTimeout
  return { text: document.getElementById('print-root').innerText, printed: window.__printed, estimate };
}, cmaProperty);
ok('التقرير يُبنى ويُطبع', cma.printed >= 1 && cma.text.includes('تقرير مقارنة سوقية'), String(cma.printed));
ok('العقار نفسه مستثنى من عيّنته', cma.estimate.count === 5, String(cma.estimate.count));
ok('والنطاق معروض لا رقم واحد', cma.text.includes('النطاق المقترح') && cma.text.includes('—'));
ok('وحجم العيّنة ومصادرها مذكورة', /٥|5/.test(cma.text) && cma.text.includes('من مخزونك'), cma.text.split('\n').find((l) => l.includes('العيّنة')) || '');
ok('ودرجة الثقة معلنة', cma.text.includes('درجة الثقة'));
ok('والمقارنات معروضة صفًّا صفًّا', (cma.text.match(/النرجس/g) || []).length >= 4, String((cma.text.match(/النرجس/g) || []).length));
ok('والتذييل ينفي أنه تقييم معتمد', cma.text.includes('ليس تقييمًا عقاريًا معتمدًا'));
ok('ولا تظهر null نصًّا', !cma.text.includes('null') && !cma.text.includes('undefined'));

// الزرّ في قائمة مشاركة العقار — من هناك يُطبع التقرير في الاستعمال الحقيقي.
await page.evaluate(async (id) => {
  const { repo } = await import('/js/data/repository.js');
  location.hash = `#/properties/${id}`;
  await repo.properties.get(id);
}, cmaProperty);
await page.waitForTimeout(1800);
const shareBtn = page.locator('button:has-text("مشاركة")').first();
if (await shareBtn.count()) {
  await shareBtn.click();
  await page.waitForTimeout(700);
  ok('وزرّ التقرير في قائمة مشاركة العقار', await page.locator('button:has-text("تقرير مقارنة سوقية")').count() >= 1);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);
} else {
  ok('وزرّ التقرير في قائمة مشاركة العقار', false, 'لم تُفتح استمارة العقار');
}

const thin = await page.evaluate(async () => {
  const { repo } = await import('/js/data/repository.js');
  const { getLists, getCompany } = await import('/js/data/settings.js');
  const { priceSamples, estimatePrice } = await import('/js/util/price-stats.js');
  const { printCma } = await import('/js/util/property-print.js');
  const p = await repo.properties.create({
    type: 'land', city: 'مدينة بلا عيّنة', district: 'حيّ لا عيّنة له', area: 600, price: 900000,
    captureStatus: 'approved', purposes: ['sale'],
  });
  const [properties, externals, deals, lists, company] = await Promise.all([
    repo.properties.list(), repo.externalListings.list(), repo.deals.list(), getLists(), getCompany(),
  ]);
  const estimate = estimatePrice({ area: p.area, type: p.type, city: p.city, district: p.district, purpose: 'sale', excludeId: p.id },
    priceSamples({ properties, externals, deals }));
  await printCma(p, { lists, company, estimate });
  return document.getElementById('print-root').innerText;
});
ok('والعيّنة الصغيرة تُقال صراحةً لا تُخمَّن', thin.includes('لا تكفي'), thin.split('\n').find((l) => l.includes('لا تكفي'))?.slice(0, 80) || '');

/* ===== ٣. الملاحظة الصوتية ===== */
console.log('\n--- ٣. الملاحظة الصوتية ---');
const supported = await page.evaluate(async () => {
  const { recordingSupported } = await import('/js/data/audio.js');
  return recordingSupported();
});
ok('المتصفح يدعم التسجيل في هذه البيئة', supported);

// تنظيف الحزمة: استمارة العقار فتحناها بالمسار ولم نغلقها، وغطاؤها يعترض النقر التالي.
await page.evaluate(() => { document.getElementById('modal-root')?.replaceChildren(); });
await page.evaluate(() => { location.hash = '#/clients'; });
await page.waitForTimeout(1800);
// سجل التواصل في نافذة التفاصيل التي يفتحها النقر على صفّ العميل (لا في استمارة التعديل).
await page.locator('tbody tr').filter({ hasText: 'سلطان الحربي' }).first().click();
await page.waitForTimeout(1400);
const clientModal = page.locator('.modal').last();
// موقعٌ ثابت لا يعتمد على النص: نصّ الزرّ نفسه يتغيّر إلى «أوقف» أثناء التسجيل.
const recBtn = clientModal.locator('.audio-note button').first();
ok('زرّ التسجيل ظاهر في استمارة التواصل',
  await recBtn.count() === 1 && (await recBtn.innerText()).includes('ملاحظة صوتية'), await recBtn.innerText().catch(() => ''));
ok('ويُصرَّح بأن الصوت لا يغادر الجهاز', (await clientModal.innerText()).includes('لا تُرفع'));

if (await recBtn.count()) {
  await recBtn.click();
  await page.waitForTimeout(1500);
  ok('الزرّ يتحوّل إلى «أوقف» أثناء التسجيل', (await recBtn.innerText()).includes('أوقف'), await recBtn.innerText());
  await recBtn.click();
  await page.waitForTimeout(1200);
  ok('وبعد الإيقاف يظهر مشغّل المسجَّل', await clientModal.locator('.audio-note audio').count() === 1);

  const before = await page.evaluate(async () => (await (await import('/js/data/audio.js')).audioSummary()).count);
  ok('ولا يُحفظ شيء قبل «تسجيل التواصل»', before === 0, String(before));

  await clientModal.locator('button:has-text("تسجيل التواصل")').click();
  await page.waitForTimeout(1800);
  const after = await page.evaluate(async ({ keepId }) => {
    const { repo } = await import('/js/data/repository.js');
    const { audioSummary } = await import('/js/data/audio.js');
    const client = await repo.clients.get(keepId);
    const withAudio = (client.contacts || []).filter((c) => c.audioId);
    const summary = await audioSummary();
    const rec = withAudio.length ? await repo.audio.get(withAudio[0].audioId) : null;
    return {
      contacts: client.contacts.length, withAudio: withAudio.length, count: summary.count, bytes: summary.bytes,
      seconds: withAudio[0]?.audioSeconds, mime: rec?.mime, entityId: rec?.entityId, hasBlob: !!rec?.blob,
    };
  }, seed);
  ok('التسجيل حُفظ في مخزن audio', after.count === 1 && after.hasBlob && after.bytes > 0, JSON.stringify({ c: after.count, b: after.bytes }));
  ok('وسجل التواصل يشير إليه بمدّته', after.withAudio === 1 && after.seconds >= 1, JSON.stringify({ w: after.withAudio, s: after.seconds }));
  ok('والتسجيل مربوط بصاحبه', after.entityId === seed.keepId);
  ok('وصيغته مما يدعمه المتصفح', String(after.mime).startsWith('audio/'), after.mime);

  // حذف سجل التواصل يحذف تسجيله — لا ملف يبقى بلا سجلّ يشير إليه.
  const cleaned = await page.evaluate(async ({ keepId }) => {
    const { repo } = await import('/js/data/repository.js');
    const { audioSummary } = await import('/js/data/audio.js');
    const client = await repo.clients.get(keepId);
    const target = (client.contacts || []).find((c) => c.audioId);
    await repo.clients.removeContact(keepId, target.id);
    return (await audioSummary()).count;
  }, seed);
  ok('وحذف التواصل يحذف تسجيله', cleaned === 0, String(cleaned));
}

ok('لا أخطاء في الصفحة', errors.length === 0, errors.slice(0, 3).join(' | '));
await b.close();
