// المرحلة ٤٧ — «الموقع بخمس أعين» في المتصفّح: الرسوم، وبطاقة البدء، والمحفظة،
// والصيانة وكشف المالك والمتأخّرون بالشخص، وحالاتُ الفراغ التي تفعل، والمدى في التصدير.
import { chromium } from './pw.mjs';
const BASE = process.env.TEST_URL || 'http://127.0.0.1:8235';
const b = await chromium.launch();
const page = await (await b.newContext({ locale: 'ar-SA' })).newPage();
const errors = [];
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
page.on('console', m => { const t = m.text(); if (m.type() === 'error' && !t.includes('ERR_') && !t.includes('Failed to load resource')) errors.push(t); });
const ok = (n, c, x = '') => console.log(`${c ? 'PASS' : 'FAIL'} — ${n}${x ? ' :: ' + x : ''}`);
const go = async (hash, ms = 1400) => { await page.evaluate((h) => { location.hash = h; }, hash); await page.waitForTimeout(ms); };

await page.goto(BASE + '/');
await page.waitForTimeout(2200);

/* ===== حالاتُ الفراغ تُرشد وتفعل (١٩) ===== */
// البذرةُ التجريبيّة تُدرج في أوّل تشغيل، فالقوائمُ ليست فارغة — والفراغُ الذي يُبتلى به
// صاحبُ النظام كلَّ يوم هو **فراغُ الفرز**: «لا نتائج» تقول العدمَ ولا تقول أنّ الفرزَ سببُه.
console.log('\n--- ٤٧. الفراغ يفعل ---');
await go('#/clients');
await page.locator('#page .page-head input[type="search"]').fill('لا أحد يحمل هذا الاسم قطّ');
await page.waitForTimeout(600);
const emptyClients = page.locator('#page .empty');
ok('فراغُ الفرز يقول كم استُبعد لا «لا نتائج» وحدها',
  (await emptyClients.count()) === 1 && /من \d/.test(await emptyClients.innerText()),
  (await emptyClients.innerText()).split('\n')[0]);
ok('ويحمل الفعلَ الذي يملؤه زرًّا',
  (await emptyClients.locator('.empty-actions button').count()) === 1);
await emptyClients.locator('.empty-actions button').click();
await page.waitForTimeout(700);
ok('والزرُّ يفعلُها: يمسح البحث فتعود القائمة',
  (await page.locator('#page .empty').count()) === 0
  && (await page.locator('#page .page-head input[type="search"]').inputValue()) === '');

await go('#/properties');
await page.locator('#page input.search').fill('لا عقار بهذا الوصف قطّ');
await page.waitForTimeout(600);
const emptyProps = page.locator('#page .empty');
ok('والعقاراتُ كذلك', (await emptyProps.count()) === 1
  && (await emptyProps.locator('.empty-actions > *').count()) >= 1);
await emptyProps.locator('.empty-actions button').first().click();
await page.waitForTimeout(700);
ok('ومسحُها يعيد المخزون', (await page.locator('#page .empty').count()) === 0);

// وحالُ «لا شيء بعد» تُفحص في بانيها نفسِه: أفعالٌ لا فعلٌ واحد.
const emptyShape = await page.evaluate(async () => {
  const { emptyState } = await import('/js/util/dom.js');
  const two = emptyState('نصّ', document.createElement('button'), document.createElement('a'));
  const none = emptyState('نصّ');
  return {
    actions: two.querySelectorAll('.empty-actions > *').length,
    bare: none.querySelectorAll('.empty-actions').length,
    lines: two.querySelector('p').className,
  };
});
ok('وبانيها يقبل أكثرَ من فعل', emptyShape.actions === 2, String(emptyShape.actions));
ok('وبلا أفعالٍ لا يُرسم صفٌّ فارغ', emptyShape.bare === 0);
ok('ونصُّه يُعرض بأسطره كما كُتب', emptyShape.lines.includes('pre-line'));

/* ===== بذرةٌ نعمل عليها ===== */
const seeded = await page.evaluate(async () => {
  const { repo } = await import('/js/data/repository.js');
  const { setCompany, setTemplates, getTemplates } = await import('/js/data/settings.js');
  const DAY = 86400000;
  const iso = (d) => new Date(Date.now() + d * DAY).toISOString();
  await setCompany({ name: 'مكتب كسّاب' });
  await setTemplates(await getTemplates());

  const owner = await repo.clients.create({ name: 'مالك المحفظة', phone: '0501111111' });
  const tenant = await repo.clients.create({ name: 'مستأجر متأخّر', phone: '0502222222' });
  const stale = await repo.clients.create({ name: 'عميل منقطع', phone: '0503333333' });

  const p1 = await repo.properties.create({
    type: 'apartment', city: 'الرياض', district: 'النرجس', captureStatus: 'approved',
    purposes: ['investment'], status: 'available', price: 1200000, area: 200, ownerId: owner.id,
    management: { active: true, feeType: 'percent', feeValue: 5, endAt: iso(10) },
    maintenance: [
      { what: 'تسريب في المطبخ', status: 'open', bearer: 'owner', cost: 500 },
      { what: 'مكيّف', status: 'done', bearer: 'owner', cost: 1200, doneAt: new Date().toISOString() },
      { what: 'مصباح', status: 'done', bearer: 'tenant', cost: 300, doneAt: new Date().toISOString() },
    ],
  });
  const p2 = await repo.properties.create({
    type: 'villa', city: 'الرياض', district: 'الملقا', captureStatus: 'approved',
    purposes: ['sale'], status: 'available', price: 3000000, area: 400, ownerId: owner.id,
  });

  const month = new Date().toISOString().slice(0, 7);
  await repo.deals.create({
    clientId: tenant.id, propertyId: p1.id, date: iso(-200), finalPrice: 60000, commission: 3000,
    leaseEndAt: iso(120),
    payments: [
      { dueAt: iso(-60), paidAt: `${month}-02T00:00:00.000Z`, amount: 20000, note: 'الدفعة الأولى' },
      { dueAt: iso(-30), paidAt: null, amount: 20000, note: 'متأخّرة' },
      { dueAt: iso(30), paidAt: null, amount: 20000, note: 'القادمة' },
    ],
  });
  // صفقاتٌ في شهورٍ ماضية لتمتلئ الرسوم
  for (let i = 1; i <= 4; i++) {
    await repo.deals.create({ clientId: stale.id, date: iso(-i * 32), finalPrice: 500000, commission: 10000 * i });
  }
  return { owner: owner.id, tenant: tenant.id, p1: p1.id, p2: p2.id, month };
});
await page.waitForTimeout(400);

/* ===== الرسوم الثلاثة (١٧) ===== */
console.log('\n--- ٤٧. ثلاثةُ رسومٍ بلا مكتبة ---');
await go('#/dashboard', 2200);
const charts = page.locator('#page figure.chart');
ok('ثلاثةُ أشكالٍ في الداشبورد', (await charts.count()) >= 3, String(await charts.count()));
ok('وكلُّها SVG مرسومٌ بيدها لا مكتبةٌ محمَّلة',
  (await page.locator('#page figure.chart svg').count()) >= 3);
ok('وأعمدةُ الصفقات ستّةٌ — شهرٌ لكلّ عمود',
  (await page.locator('#page .chart-bar').count()) === 6, String(await page.locator('#page .chart-bar').count()));
const label = await page.locator('#page figure.chart svg').first().getAttribute('aria-label');
ok('ولكلّ رسمٍ وصفٌ منطوقٌ فيه أرقامُه — فمن لا يراه يقرؤه',
  !!label && /\d/.test(label) && label.length > 20, (label || '').slice(0, 60));
ok('والرقمُ مكتوبٌ نصًّا تحت الرسم أيضًا',
  (await page.locator('#page .chart-values, #page .chart-legend').count()) >= 2);
ok('والحلقةُ تدور بأقواسٍ لا بصور', (await page.locator('#page .chart-donut path').count()) >= 1);
ok('وحدُّ مؤشّر السعر مقولٌ حيث يُستشهد به',
  (await page.locator('#page').innerText()).includes('من بياناتك أنت لا من السوق'));

/* ===== بطاقة «ابدأ من هنا» (١٨) ===== */
console.log('\n--- ٤٧. ابدأ من هنا ---');
await go('#/today', 2400);
const card = page.locator('#page .start-card');
ok('البطاقةُ تظهر ما بقيت خطوة', (await card.count()) === 1);
ok('وخطواتُها خمس', (await card.locator('.start-step').count()) === 5, String(await card.locator('.start-step').count()));
ok('والمنجزُ منها مقروءٌ من البيانات لا من نقرة — واسمُ المكتب كُتب فتمّت الأولى',
  (await card.locator('.start-step.done').count()) >= 2, String(await card.locator('.start-step.done').count()));
ok('ولكلّ خطوةٍ لم تتمّ زرٌّ يمضي بها',
  (await card.locator('.start-step:not(.done) a.btn').count()) >= 1);
await card.locator('button:has-text("أخفِ")').click();
await page.waitForTimeout(1600);
ok('وإخفاؤها قرارُ صاحبها ويُحفظ', (await page.locator('#page .start-card').count()) === 0);
await go('#/dashboard', 800);
await go('#/today', 2000);
ok('ولا تعود بعد الإخفاء ولو أُعيد فتحُ الصفحة', (await page.locator('#page .start-card').count()) === 0);

/* ===== إدارة الأملاك: الصيانة والكشف والمتأخّرون بالشخص (٠٦–٠٩) ===== */
console.log('\n--- ٤٧. إدارة الأملاك ---');
await go('#/management', 1800);
const mtext = await page.locator('#page').innerText();
ok('بلاغُ الصيانة المفتوح ينبّه كما تنبّه الدفعةُ الفائتة', mtext.includes('بلاغ صيانة'),
  mtext.split('\n').find((l) => l.includes('بلاغ')) || '—');
ok('والمتأخّراتُ تُجمع بالشخص لا بالوحدة', mtext.includes('المتأخّرات بحسب المستأجر'));
ok('وباسم المستأجر وجواله', mtext.includes('مستأجر متأخّر') && mtext.includes('050 222 2222'),
  mtext.split('\n').find((l) => l.includes('مستأجر متأخّر')) || '—');
ok('والصيانةُ عمودٌ في الجدول', mtext.includes('الصيانة'));
ok('وزرُّ كشف المالك موجود', (await page.locator('#page button[title*="كشف حساب المالك"]').count()) === 1);
ok('وزرُّ التجديد بنقرة', (await page.locator('#page button[title*="جدِّد"]').count()) === 1);
ok('وشهرُ الكشف يُختار مرّةً ويُطبع لأيّ مالك',
  (await page.locator('#page input[type="month"]').count()) === 1);
// التجديد يُعرض قبل أن يُنفَّذ — وتُسأل زيادةُ الأجرة أوّلًا (المرحلة ٤٨)
await page.locator('#page button[title*="جدِّد"]').click();
await page.waitForTimeout(700);
const askText = await page.locator('.modal').last().innerText();
ok('ويُسأل عن زيادة الأجرة أوّلًا وافتراضُها صفر',
  askText.includes('زيادة الأجرة') && askText.includes('افتراضُها صفر'), askText.slice(0, 80).replace(/\n/g, ' · '));
ok('ويُعرض أثرُ الزيادة على الدفعة قبل اعتمادها', askText.includes('الدفعة الشهرية'));
await page.locator('.modal').last().locator('button:has-text("اعرض الخطّة")').click();
await page.waitForTimeout(700);
const renewText = await page.locator('.modal').last().innerText();
ok('والتجديدُ يُعرض قبل أن يُعتمد — عقدان لا عقد',
  renewText.includes('عقد الإدارة يمتدّ') && renewText.includes('عقد الإيجار يمتدّ'), renewText.slice(0, 120).replace(/\n/g, ' · '));
ok('ويقول كم دفعةً ستُضاف وبكم', renewText.includes('دفعات') || renewText.includes('دفعة'));
await page.keyboard.press('Escape');
await page.waitForTimeout(400);

/* كشفُ المالك يُحسب صحيحًا: ٢٠٠٠٠ مقبوض − ١٠٠٠ أجر − ١٢٠٠ صيانة المالك = ١٧٨٠٠ */
const statement = await page.evaluate(async ({ p1, month }) => {
  const { repo } = await import('/js/data/repository.js');
  const { ownerStatement } = await import('/js/util/management.js');
  const property = await repo.properties.get(p1);
  const deal = (await repo.deals.list()).find((d) => d.propertyId === p1);
  return ownerStatement({ property, deal, month });
}, seeded);
ok('والكشفُ يقرأ المقبوض في شهره', statement.collected === 20000, String(statement.collected));
ok('والأجرُ على ما قُبض فعلًا (٥٪)', statement.fee === 1000, String(statement.fee));
ok('ولا يُخصم إلّا ما أُنجز وكان على المالك (١٢٠٠ لا ٢٠٠٠)', statement.maintenance === 1200, String(statement.maintenance));
ok('فالصافي ١٧٨٠٠', statement.net === 17800, String(statement.net));

/* ===== محفظة المستثمر (١٠–١١) ===== */
console.log('\n--- ٤٧. المحفظة: المتوقَّع والواقع ---');
await go(`#/client/${seeded.owner}`, 1800);
const ctext = await page.locator('#page').innerText();
ok('لوحةُ المحفظة تظهر لمن يملك', ctext.includes('محفظته: المتوقَّع والواقع'));
ok('وفيها عمودان متقابلان لا عمودٌ واحد', ctext.includes('العائد المتوقَّع') && ctext.includes('العائد الواقع'));
ok('وقيمةُ ما عُرف مجموعةٌ (١٢٠٠٠٠٠ + ٣٠٠٠٠٠٠)', ctext.includes('4,200,000'),
  ctext.split('\n').find((l) => l.includes('4,2')) || '—');
ok('وعقارٌ بلا عقد إيجارٍ يُقال عنه ذلك ولا يُخترع له متوقَّع', ctext.includes('لا عقد إيجارٍ مربوط'));
ok('وحدُّ الحساب مقولٌ تحت الجدول', ctext.includes('لا يدخل هنا تغيّرُ قيمة العقار'));

/* ===== أعمدة العائد في المقارنة (١٢) ===== */
console.log('\n--- ٤٧. المقارنة تقارن بالعائد ---');
await go('#/properties', 2000);
const picks = page.locator('#page .card-pick');
if (await picks.count() >= 2) {
  await picks.nth(0).check();
  await picks.nth(1).check();
  await page.waitForTimeout(500);
  await page.locator('#page .selection-bar button:has-text("قارن")').first().click();
  await page.waitForTimeout(800);
  const cmp = await page.locator('.modal').last().innerText();
  ok('المقارنةُ فيها الإيجار السنويّ', cmp.includes('الإيجار السنوي'));
  ok('وفيها العائد الإجمالي', cmp.includes('العائد الإجمالي'));
  ok('وما لا يُعرف يُقال «غير معلوم» ولا يُكتب صفرًا', cmp.includes('غير معلوم') || cmp.includes('لا إيجارٌ معلوم'));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
} else {
  ok('المقارنةُ تحتاج عقارين', false, `وُجد ${await picks.count()}`);
}

/* ===== التواصلُ المستنتَج (٢٣) ===== */
console.log('\n--- ٤٧. ما يصل العميل ---');
const inferred = await page.evaluate(async ({ tenant }) => {
  const { repo } = await import('/js/data/repository.js');
  await repo.clients.addContact(tenant, { type: 'whatsapp', note: 'فُتحت المحادثة', inferred: true });
  const c = await repo.clients.get(tenant);
  return c.contacts.map((x) => ({ inferred: x.inferred, note: x.note }));
}, seeded);
ok('التواصلُ يُحفظ موسومًا بأنّه مستنتَج', inferred.some((x) => x.inferred === true), JSON.stringify(inferred));
await go(`#/client/${seeded.tenant}`, 1600);
ok('والوسمُ يُعرض في سجلّ التواصل حيث يُقرأ',
  (await page.locator('#page').innerText()).includes('مُستنتَج'));
ok('وزرُّ واتساب صار زرًّا يسجّل لا رابطًا صامتًا',
  (await page.locator('#page button[title*="مُستنتَج"]').count()) >= 1,
  String(await page.locator('#page button[title*="مُستنتَج"]').count()));

/* ===== المدى في التصدير (٢١) ===== */
console.log('\n--- ٤٧. ملفُّ الربع لا ملفُّ العمر ---');
await page.evaluate(() => localStorage.setItem('kassab:settings-open', '"*"'));
await go('#/settings', 2600);
const settingsText = await page.locator('#page').innerText();
ok('المصاريفُ والإيرادات صارتا في التصدير', settingsText.includes('تصدير إلى إكسل'));
const exportPanel = page.locator('#page .panel-block:has-text("تصدير إلى إكسل")');
ok('وزرٌّ للمصاريف', (await exportPanel.locator('button:text-is("المصاريف")').count()) === 1);
ok('وزرٌّ للإيرادات', (await exportPanel.locator('button:text-is("الإيرادات")').count()) === 1);
ok('ومدًى بطرفين', (await exportPanel.locator('input[type="date"]').count()) === 2);
ok('وزرُّ «الربع الماضي» يملؤه', (await exportPanel.locator('button:has-text("الربع الماضي")').count()) === 1);
await exportPanel.locator('button:has-text("الربع الماضي")').click();
await page.waitForTimeout(300);
const from = await exportPanel.locator('input[type="date"]').first().inputValue();
ok('فيُملأ الطرفان بربعٍ منقضٍ', /^\d{4}-\d{2}-\d{2}$/.test(from), from);
ok('وحدُّ المزامنة لفريقك مقولٌ في لوحتها',
  settingsText.includes('عملاءَ متفرّقين') && settingsText.includes('الإسنادُ شرطُها'));

console.log('\n' + (errors.length ? 'FAIL — أخطاء وحدة التحكّم :: ' + errors.join(' | ') : 'PASS — لا أخطاء في وحدة التحكّم'));
await b.close();
