// المرحلة ٢٣ في متصفح حقيقي: اللصق ينشئ عميلًا وطلبًا، والخطة تُنشئ مهامها، والأولوية تظهر.
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

/* ===== الخطة مفعَّلة قبل اللصق ===== */
await page.evaluate(async () => {
  const { setPlans } = await import('/js/data/settings.js');
  await setPlans([{
    name: 'متابعة عميل جديد', trigger: 'new_client', enabled: true,
    steps: [
      { day: 0, type: 'call', title: 'اتصال تعارف' },
      { day: 3, type: 'whatsapp', title: 'إرسال عروض' },
    ],
  }]);
});

/* ===== اللصق ينشئ العميل والطلب ===== */
console.log('\n--- ١. اللصق ينشئ عميلًا وطلبًا ---');
const before = await page.evaluate(async () => {
  const { repo } = await import('/js/data/repository.js');
  return { clients: (await repo.clients.list()).length, requests: (await repo.requests.list()).length, tasks: (await repo.tasks.list()).length };
});

await page.evaluate(() => { location.hash = '#/requests'; });
await page.waitForTimeout(1600);
await page.locator('button:has-text("لصق رسالة عميل")').click();
await page.waitForTimeout(600);
await page.locator('.modal textarea').fill('السلام عليكم انا فهد الشهري جوالي 0555123456، ابغى فلة للبيع في النرجس ميزانيتي 2 مليون ومساحة 400 متر');
await page.locator('.modal button:has-text("اقرأ الحقول من النص")').click();
await page.waitForTimeout(700);
const parsedText = await page.locator('.modal').innerText();
ok('القارئ يلتقط الجوال والاسم', parsedText.includes('0555123456') && parsedText.includes('فهد'), parsedText.split('\n').find((l) => l.includes('جوال')) || '');
ok('زر الإنشاء المباشر صار مفعَّلًا', !(await page.locator('.modal button:has-text("أنشئ العميل والطلب")').isDisabled()));

await page.locator('.modal button:has-text("أنشئ العميل والطلب")').click();
await page.waitForTimeout(1800);
const after = await page.evaluate(async () => {
  const { repo } = await import('/js/data/repository.js');
  const clients = await repo.clients.list();
  const client = clients.find((c) => c.phone === '0555123456');
  const requests = await repo.requests.list();
  const tasks = await repo.tasks.list();
  return {
    clients: clients.length, requests: requests.length, tasks: tasks.length,
    name: client?.name, source: client?.referralSource, contacts: (client?.contacts || []).length,
    request: requests.find((r) => r.clientId === client?.id),
    planTasks: tasks.filter((t) => String(t.notes || '').includes('[خطة:')).length,
    hash: location.hash,
  };
});
ok('أُنشئ عميل واحد وطلب واحد', after.clients === before.clients + 1 && after.requests === before.requests + 1, `${before.clients}→${after.clients} · ${before.requests}→${after.requests}`);
ok('واسمه مقروء من الرسالة', after.name === 'فهد الشهري', after.name);
ok('وسُجّل التواصل تلقائيًا', after.contacts === 1);
ok('والطلب حمل الحي والميزانية والمساحة',
  after.request && (after.request.districts || []).includes('النرجس') && after.request.budgetMax === 2000000 && after.request.area === 400,
  JSON.stringify({ d: after.request?.districts, b: after.request?.budgetMax, a: after.request?.area }));
ok('وينقلك إلى مطابقات الطلب فورًا', after.hash.startsWith('#/matches/'), after.hash);

/* ===== الخطة أنشأت مهامها ===== */
console.log('\n--- ٢. خطة المتابعة ---');
ok('الخطة أنشأت مهمتين', after.planTasks === 2, String(after.planTasks));
const timing = await page.evaluate(async () => {
  const { repo } = await import('/js/data/repository.js');
  const tasks = (await repo.tasks.list()).filter((t) => String(t.notes || '').includes('[خطة:'));
  const sorted = tasks.sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  return {
    first: Math.round((new Date(sorted[0].dueAt) - Date.now()) / 60000),
    second: Math.round((new Date(sorted[1].dueAt) - Date.now()) / 3600000),
    linked: sorted[0].linkType,
  };
});
ok('أولى الخطوات بعد ساعة تقريبًا', timing.first > 50 && timing.first < 70, String(timing.first));
// **الحدُّ يتبع ساعةَ التشغيل لا الخطة**: الخطوةُ الثانية = «بعد ثلاثة أيام، العاشرة
// صباحًا»، فبُعدُها بالساعات هو ٨٢ ناقصَ ساعةِ اليوم — أي من ٥٩ ساعةً (لو شُغّل الفحص
// عند ٢٣) إلى ٨٢ (لو شُغّل عند منتصف الليل). وكان الحدُّ الأدنى ٦٠، فتسقط الحزمةُ كلَّ
// ليلةٍ بعد التاسعة لا لعطبٍ في الخطة بل لساعةِ الفحص.
ok('والثانية بعد نحو ثلاثة أيام', timing.second >= 59 && timing.second <= 82, `${timing.second} ساعة`);
ok('والمهام مربوطة بالعميل', timing.linked === 'client');

// لا تتكرر الخطة على العميل نفسه
const repeat = await page.evaluate(async () => {
  const { repo } = await import('/js/data/repository.js');
  const { runPlans } = await import('/js/util/plans.js');
  const client = (await repo.clients.list()).find((c) => c.phone === '0555123456');
  const out = await runPlans('new_client', { title: 'فهد', linkType: 'client', linkId: client.id });
  return { created: out.created, total: (await repo.tasks.list()).filter((t) => String(t.notes || '').includes('[خطة:')).length };
});
ok('لا تتكرر الخطة على السجل نفسه', repeat.created === 0 && repeat.total === 2, JSON.stringify(repeat));

// الخطة المعطَّلة لا تعمل
const disabled = await page.evaluate(async () => {
  const { setPlans, getPlans } = await import('/js/data/settings.js');
  const { runPlans } = await import('/js/util/plans.js');
  await setPlans((await getPlans()).map((p) => ({ ...p, enabled: false })));
  return (await runPlans('new_client', { linkId: 'someone-else' })).created;
});
ok('الخطة المعطَّلة لا تُنشئ شيئًا', disabled === 0, String(disabled));

/* ===== درجة الأولوية و«ينتظرون ردّك» ===== */
console.log('\n--- ٣. الأولوية وسرعة الردّ ---');
await page.evaluate(() => { location.hash = '#/clients'; });
await page.waitForTimeout(1600);
const clientsText = await page.locator('#page').innerText();
ok('عمود الأولوية ظاهر', clientsText.includes('الأولوية'), clientsText.split('\n').slice(0, 2).join(' | '));
const badgeTitle = await page.locator('.table tbody tr .badge').first().getAttribute('title');
ok('والدرجة تشرح سببها في التلميح', !!badgeTitle && badgeTitle.length > 3, (badgeTitle || '').slice(0, 60));

await page.evaluate(async () => {
  const { repo } = await import('/js/data/repository.js');
  const c = await repo.clients.create({ name: 'ينتظر الرد', phone: '0533000111' });
  // نُقدّم تاريخ إنشائه ساعتين ليتجاوز الحدّ
  const { indexedDbAdapter } = await import('/js/data/adapters/indexeddb.js');
  await indexedDbAdapter.put('clients', { ...c, createdAt: new Date(Date.now() - 2 * 3600000).toISOString() });
  location.hash = '#/today';
});
await page.waitForTimeout(1900);
const todayText = await page.locator('#page').innerText();
ok('لوحة «ينتظرون ردّك» تظهر', todayText.includes('ينتظرون ردّك') && todayText.includes('ينتظر الرد'),
  todayText.split('\n').find((l) => l.includes('ينتظرون')) || '');
ok('وتقول كيف يخرجون منها', todayText.includes('سجّل المكالمة بعدها'));

ok('لا أخطاء جافاسكربت في الصفحة', errors.length === 0, errors.slice(0, 2).join(' | '));
await b.close();
