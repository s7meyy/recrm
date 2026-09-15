// الأداء عند الكِبَر (المرحلة ٣٥): يُقاس ولا يُظنّ.
//
// **ما قِيسَ قبل العلاج** على ٥٠٠٠ عقار و٢٠٠٠ عميل و٣٠٠ طلب نشط:
//   • العقارات: ٣٦٣٨ مِلّي ثانية و**٩٥٬٣٥٣ عنصرًا** في الصفحة
//   • العملاء:  ٢١٦٨ مِلّي ثانية و٢٨٬١٩٤ عنصرًا
//   • يومي:     ٨٩٥٥ مِلّي ثانية — تبني ٦١١٬٨٠٧ مرشّحًا لتعرض ثمانية
// وبعده: ١٢٠ · ٨٣ · ١٤٩. والعلاج ثلاثة: حدّ الرسم في القوائم، وحدّ الطلبات المفحوصة في
// «يومي»، وحدّ الصفوف في المطابقات — والفرز والبحث والعدّ تبقى على المجموعة كاملة.
//
// **وبيانات هذا الفحص متنوّعة بقصد** (أربع مدن وخمسة أنواع وثلاثة أغراض): ذلك مخزون مكتبٍ
// حقيقي. وخمسة آلاف عقارٍ متطابقة في المدينة والنوع والغرض تُفشل فهرس القواطع (المرحلة ٢٠)
// فيصير كل طلبٍ يمرّ على الخمسة آلاف — وقد قِيست تلك الحال أيضًا: ٩٫٩ ثانية للمطابقات.
// وهي حالٌ لا تقع في مكتبٍ حقيقي، والحدود أعلاه تُبقي الصفحة قابلةً للاستعمال فيها.
//
// والقياس **من داخل الصفحة** (`performance.now` حول `render`) لا عبر الموجّه: الوسيط
// والاستطلاع يضيفان ثوانيَ ليست من التطبيق.
import { chromium } from './pw.mjs';

const BASE = process.env.TEST_URL || 'http://127.0.0.1:8235';
const ok = (n, c, x = '') => console.log(`${c ? 'PASS' : 'FAIL'} — ${n}${x ? ' :: ' + x : ''}`);

// حدٌّ سخيّ: الغرض منع الانهيار (ثوانٍ) لا ملاحقة عشرات المِلّي على آلةٍ مشتركة.
const BUDGET_MS = 3000;
const NODE_BUDGET = 12000;

const b = await chromium.launch();
const ctx = await b.newContext({ locale: 'ar-SA', viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
await page.goto(BASE + '/');
await page.waitForTimeout(2400);

const result = await page.evaluate(async () => {
  const { repo } = await import('/js/data/repository.js');
  const cities = ['الرياض', 'جدة', 'الدمام', 'الخبر'];
  const types = ['villa', 'apartment', 'land', 'floor', 'shop'];
  const purposes = [['sale'], ['rent'], ['investment']];
  const districts = ['النرجس', 'الملقا', 'العارض', 'الياسمين', 'الرمال', 'حطين', 'الروضة', 'القيروان'];
  const now = new Date().toISOString();
  const props = [];
  const clients = [];
  const requests = [];
  for (let i = 0; i < 5000; i++) {
    props.push({
      id: `scale-p${i}`, type: types[i % 5], city: cities[i % 4], district: districts[i % 8],
      area: 200 + (i % 800), price: 500000 + (i % 100) * 50000, captureStatus: 'approved',
      purposes: purposes[i % 3], status: 'agreed', images: [], typeFields: {}, extra: {},
      createdAt: now, updatedAt: now,
    });
  }
  for (let i = 0; i < 2000; i++) {
    clients.push({
      id: `scale-c${i}`, name: `عميل ${i}`, phone: `05${10000000 + i}`,
      tags: [], contacts: [], stage: 'new', createdAt: now, updatedAt: now,
    });
  }
  for (let i = 0; i < 300; i++) {
    requests.push({
      id: `scale-r${i}`, clientId: `scale-c${i}`, type: types[i % 5], purpose: purposes[i % 3][0],
      city: cities[i % 4], districts: [districts[i % 8]], budgetMax: 2000000, area: 350,
      status: 'active', districtZones: [], createdAt: now, updatedAt: now,
    });
  }
  await repo.raw.putMany('properties', props);
  await repo.raw.putMany('clients', clients);
  await repo.raw.putMany('requests', requests);

  const out = {};
  for (const name of ['properties', 'clients', 'matches', 'today', 'dashboard', 'opportunities', 'health']) {
    const mod = await import(`/js/pages/${name}.js`);
    const host = document.createElement('div');
    document.body.appendChild(host);
    await mod.render(host);          // تسخين: أول رسمةٍ تحمّل الوحدات وتترجمها
    host.replaceChildren();
    const started = performance.now();
    await mod.render(host);
    out[name] = { ms: Math.round(performance.now() - started), nodes: host.querySelectorAll('*').length };
    host.remove();
  }
  return out;
});

for (const [name, r] of Object.entries(result)) {
  ok(`${name}: الرسم تحت ${BUDGET_MS} مِلّي`, r.ms < BUDGET_MS, `${r.ms} مِلّي · ${r.nodes} عنصرًا`);
}
// القوائم الطويلة وحدها هي التي كانت تفيض بالعناصر
for (const name of ['properties', 'clients', 'matches']) {
  ok(`${name}: عناصر الصفحة محدودة`, result[name].nodes < NODE_BUDGET, String(result[name].nodes));
}
ok('لا أخطاء أثناء القياس', errors.length === 0, errors.slice(0, 2).join(' | '));

await b.close();
