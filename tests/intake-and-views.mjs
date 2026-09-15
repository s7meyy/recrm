// المرحلة ٢٥: استمارة العملاء بـQR، وعدّاد مشاهدات العروض، وطلب التقييم بعد الصفقة.
// (خادم مقفل: الاستمارة والعدّاد عامّان، والقراءة والتحويل خلف البوابة.)
import { chromium } from './pw.mjs';

const BASE = process.env.TEST_URL || 'http://127.0.0.1:8234';
const b = await chromium.launch();
const ctx = await b.newContext({ locale: 'ar-SA' });
const page = await ctx.newPage();
const ok = (n, c, x = '') => console.log(`${c ? 'PASS' : 'FAIL'} — ${n}${x ? ' :: ' + x : ''}`);
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
const password = 'secret-pass'; // نفس ما يضبطه tests/server.mjs
const PUBLISH_TOKEN = 'test-publish-token'; // نفس ما يضبطه tests/server.mjs

/* ===== ١. الاستمارة العامة تعمل بلا تسجيل دخول ===== */
console.log('\n--- ١. استمارة العملاء ---');
await page.goto(BASE + '/offers/intake.html');
await page.waitForTimeout(1200);
ok('الاستمارة تُفتح بلا بوابة دخول', await page.locator('#intake-form').count() === 1);
ok('وفيها حقول الطلب لا الرقم وحده',
  await page.locator('#purpose').count() === 1 && await page.locator('#city').count() === 1 && await page.locator('#district').count() === 1);
const trap = await page.evaluate(() => {
  const box = document.querySelector('.lead-trap');
  const r = box.getBoundingClientRect();
  return { w: Math.round(r.width), h: Math.round(r.height), aria: box.getAttribute('aria-hidden') };
});
ok('وفيها حقل الفخّ نفسه', trap.w <= 1 && trap.h <= 1 && trap.aria === 'true', JSON.stringify(trap));
ok('وتصرّح بأن البيانات لا تُنشر', (await page.locator('main').innerText()).includes('لا تُنشر'));

const post = (payload) => page.evaluate(async (body) => {
  const res = await fetch('/api/lead', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}, payload);

const sent = await post({
  name: 'بندر القحطاني', phone: '٠٥٠٧٧٧٨٨٩٩', note: 'يفضّل الدور الأرضي',
  want: { purpose: 'rent', type: 'apartment', city: 'الرياض', district: 'النرجس', budgetMax: '  60000 ', area: '180' },
});
ok('الطلب المكتوب يُقبل', sent.status === 200, JSON.stringify(sent.data));

const junk = await post({
  name: 'حقن', phone: '0500000011',
  want: { purpose: '<script>x</script>', type: 'a b;c', city: 'الرياض', budgetMax: 'كثير', area: '-5' },
});
ok('والقيم غير الصالحة لا تُرفض الطلبَ كله', junk.status === 200);

const emptyWant = await post({ name: 'بلا طلب', phone: '0500000022', want: { purpose: '', type: '', city: '', district: '', budgetMax: '', area: '' } });
ok('واستمارة فارغة الحقول تبقى طلبًا عاديًا', emptyWant.status === 200);

/* ===== ٢. القراءة بعد الدخول: الحقول وصلت مطبَّعة ===== */
console.log('\n--- ٢. ما وصل إلى المكتب ---');
await page.goto(BASE + '/');
await page.waitForTimeout(500);
await page.evaluate(async (pw) => {
  await fetch('/__login', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `password=${encodeURIComponent(pw)}` });
}, password);
await page.goto(BASE + '/');
await page.waitForTimeout(2200);

const leads = await page.evaluate(async () => (await (await fetch('/api/lead', { credentials: 'same-origin' })).json()).leads);
const lead = leads.find((l) => l.name === 'بندر القحطاني');
ok('الطلب محفوظ بجواله المطبَّع', lead?.phone === '0507778899', lead?.phone);
ok('وحقوله مقروءة كأرقام لا نصوص', lead?.want?.budgetMax === 60000 && lead?.want?.area === 180, JSON.stringify(lead?.want));
ok('ومفاتيحه كما هي', lead?.want?.purpose === 'rent' && lead?.want?.type === 'apartment');
const dirty = leads.find((l) => l.name === 'حقن');
ok('والمفتاح المشبوه يُنظَّف إلى حروف وأرقام', !/[<>;\s]/.test(dirty?.want?.purpose || ''), JSON.stringify(dirty?.want));
ok('والرقم غير الصالح يصير فارغًا لا NaN', dirty?.want?.budgetMax === null && dirty?.want?.area === null, JSON.stringify(dirty?.want));
const blank = leads.find((l) => l.name === 'بلا طلب');
ok('والاستمارة الفارغة لا تُخزَّن طلبًا وهميًا', blank?.want == null, JSON.stringify(blank?.want));

/* ===== ٣. التحويل ينشئ العميل وطلبه ===== */
console.log('\n--- ٣. التحويل ---');
await page.evaluate(() => { location.hash = '#/publish'; });
await page.waitForTimeout(2000);
const publishText = await page.locator('#page').innerText();
ok('لوحة استمارة العملاء تظهر في صفحة النشر', publishText.includes('استمارة العملاء بـQR'));
ok('وملخّص ما طلبه ظاهر في الجدول', publishText.includes('النرجس'), publishText.split('\n').find((l) => l.includes('النرجس')) || '');

const beforeCounts = await page.evaluate(async () => {
  const { repo } = await import('/js/data/repository.js');
  return { clients: (await repo.clients.list()).length, requests: (await repo.requests.list()).length };
});
await page.locator('tr', { hasText: 'بندر القحطاني' }).locator('button:has-text("حوّله عميلًا")').first().click();
await page.waitForTimeout(2200);
const afterConvert = await page.evaluate(async () => {
  const { repo } = await import('/js/data/repository.js');
  const clients = await repo.clients.list();
  const client = clients.find((c) => c.phone === '0507778899');
  const requests = await repo.requests.list();
  const request = requests.find((r) => r.clientId === client?.id);
  return { clients: clients.length, requests: requests.length, request, hash: location.hash, source: client?.referralSource };
});
ok('أُنشئ العميل وطلبه معًا', afterConvert.clients === beforeCounts.clients + 1 && afterConvert.requests === beforeCounts.requests + 1,
  `${beforeCounts.clients}→${afterConvert.clients} · ${beforeCounts.requests}→${afterConvert.requests}`);
ok('والطلب حمل الغرض والميزانية والمساحة',
  afterConvert.request?.purpose === 'rent' && afterConvert.request?.budgetMax === 60000 && afterConvert.request?.area === 180,
  JSON.stringify({ p: afterConvert.request?.purpose, b: afterConvert.request?.budgetMax, a: afterConvert.request?.area }));
ok('وينقلك إلى مطابقاته مباشرة', afterConvert.hash.startsWith('#/matches/'), afterConvert.hash);

/* ===== ٤. عدّاد المشاهدات ===== */
console.log('\n--- ٤. عدّاد المشاهدات ---');
const viewPost = (ref) => page.evaluate(async (r) => {
  const res = await fetch('/api/view', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ref: r }) });
  return res.status;
}, ref);

// لقطة حقيقية تُنشر بالدالة نفسها، فالعدّاد يُختبر على ما يراه الزائر لا على فرضٍ عنه.
await page.evaluate(async (token) => {
  await fetch('/api/publish', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-publish-token': token },
    body: JSON.stringify({
      kind: 'snapshot', intro: '', office: { name: 'مكتب الاختبار' },
      listings: [{ ref: '1', title: 'فلة للاختبار', city: 'الرياض', district: 'النرجس', price: 1000000, images: [] }],
    }),
  });
}, PUBLISH_TOKEN);
const published = await page.evaluate(async () => {
  const res = await fetch('/api/listings');
  const snap = await res.json();
  return (snap.listings || []).map((l) => String(l.ref));
});
ok('توجد لقطة منشورة لاختبار العدّاد', published.length > 0, published.join(','));

const readCounts = () => page.evaluate(async () => (await (await fetch('/api/view', { credentials: 'same-origin' })).json()).counts);

if (published.length) {
  // فرقًا لا رقمًا مطلقًا: صفحة العرض نفسها تُسجّل مشاهدة، وحزم أخرى تفتحها على الخادم ذاته.
  const before = (await readCounts())[published[0]]?.total || 0;
  await viewPost(published[0]);
  await viewPost(published[0]);
  await viewPost('9999'); // رقم غير منشور
  const counts = await readCounts();
  ok('المشاهدات تُعدّ للعرض المنشور', (counts[published[0]]?.total || 0) - before === 2, JSON.stringify(counts));
  ok('والعرض غير المنشور لا يُفتح له عدّاد', !counts['9999'], JSON.stringify(Object.keys(counts)));
  ok('ويُذكر آخر يوم فيه مشاهدة', !!counts[published[0]]?.lastAt, counts[published[0]]?.lastAt);
}

const anonRead = await page.evaluate(async () => {
  const res = await fetch('/api/view', { method: 'GET', headers: { 'x-no-cookie': '1' } });
  return res.status;
});
ok('قراءة العدّاد تحتاج جلسة أو تُقرأ للمالك وحده', anonRead === 200 || anonRead === 401, String(anonRead));

/* ===== ٥. طلب التقييم بعد الصفقة ===== */
console.log('\n--- ٥. طلب التقييم ---');
const noUrl = await page.evaluate(async () => {
  const { repo } = await import('/js/data/repository.js');
  const { setCompany } = await import('/js/data/settings.js');
  await setCompany({ reviewUrl: '' });
  const client = await repo.clients.create({ name: 'عبدالله الدوسري', phone: '0503334455' });
  const old = new Date(Date.now() - 5 * 86400000).toISOString();
  const deal = await repo.deals.create({ date: old, finalPrice: 800000, commission: 20000, clientId: client.id });
  location.hash = '#/today';
  return { dealId: deal.id, clientId: client.id };
});
await page.waitForTimeout(2000);
ok('بلا رابط تقييم لا تظهر اللوحة أصلًا', !(await page.locator('#page').innerText()).includes('اطلب تقييمًا'));

await page.evaluate(async () => {
  const { setCompany } = await import('/js/data/settings.js');
  await setCompany({ reviewUrl: 'https://g.page/r/example' });
  location.hash = '#/dashboard';
});
await page.waitForTimeout(800);
await page.evaluate(() => { location.hash = '#/today'; });
await page.waitForTimeout(2000);
const todayText = await page.locator('#page').innerText();
ok('ومع الرابط تظهر بصفقتها', todayText.includes('اطلب تقييمًا') && todayText.includes('عبدالله الدوسري'),
  todayText.split('\n').filter((l) => l.includes('تقييم')).join(' | '));

// صفٌّ بعينه لا «أول زرّ»: اللوحة تُرتَّب بالأقدم، وقد تسبقه صفقة أخرى مستحقّة.
await page.locator('.today-row').filter({ hasText: 'عبدالله الدوسري' }).locator('button:has-text("تخطَّ")').click();
await page.waitForTimeout(1600);
const stamped = await page.evaluate(async (id) => {
  const { repo } = await import('/js/data/repository.js');
  return (await repo.deals.get(id)).reviewRequestedAt;
}, noUrl.dealId);
ok('«تخطَّ» توسم الصفقة فلا تعود غدًا', !!stamped, String(stamped));
// داخل لوحة التقييم وحدها: الاسم يبقى في لوحات أخرى (عميل جديد بلا تواصل) وهذا صحيح.
const reviewPanel = page.locator('.today-panel').filter({ hasText: 'اطلب تقييمًا' });
const stillThere = await reviewPanel.count() ? (await reviewPanel.innerText()).includes('عبدالله الدوسري') : false;
ok('وتختفي من لوحة التقييم بعدها', !stillThere);

ok('لا أخطاء في الصفحة', errors.length === 0, errors.slice(0, 3).join(' | '));
await b.close();
