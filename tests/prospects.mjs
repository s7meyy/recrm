// المرحلة ٥٣ — الفرص العقاريّة: الصفحةُ والقوائمُ والبطاقةُ والمآلُ والتحويل، ثمّ الوارد بستّة أبواب.
import { chromium } from './pw.mjs';
import { createHmac } from 'node:crypto';

const BASE = process.env.TEST_URL || 'http://127.0.0.1:8235';
const SECRET = 'test-tg-secret';
const CHAT = '8471122557';

function gateCookie(secret = 'topsecret') {
  const expires = Date.now() + 3600000;
  const role = 'owner';
  const mac = createHmac('sha256', secret).update(`${expires}.${role}`).digest('hex');
  return { name: 'kassab_gate', value: `${expires}.${role}.${mac}`, url: BASE };
}

const b = await chromium.launch();
const ctx = await b.newContext({ locale: 'ar-SA' });
await ctx.addCookies([gateCookie()]);
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => {
  const t = m.text();
  if (m.type() === 'error' && !t.includes('ERR_') && !t.includes('Failed to load resource')) errors.push(t);
});
const ok = (n, c, x = '') => console.log(`${c ? 'PASS' : 'FAIL'} — ${n}${x ? ' :: ' + x : ''}`);

await page.goto(BASE + '/');
await page.waitForTimeout(2400);

/* ===== ١. المخزنان موجودان والقاعدةُ مُرقّاة ===== */
console.log('--- ١. القاعدة ---');
const db = await page.evaluate(() => new Promise((res) => {
  const rq = indexedDB.open('motabiq');
  rq.onsuccess = () => { const d = rq.result; res({ v: d.version, stores: [...d.objectStoreNames] }); d.close(); };
}));
ok('**مخزنا الفرص أُنشئا بالترقية** ولم تُمسّ البيانات',
  db.stores.includes('prospects') && db.stores.includes('prospectLists'), `v${db.v}`);
ok('وبقيت المخازنُ القديمة كما هي',
  ['properties', 'clients', 'tasks', 'taskLists', 'marketDeals'].every((s) => db.stores.includes(s)));

/* ===== ٢. الصفحة تفتح وتُفرّق نفسَها عن «الفرص» ===== */
console.log('\n--- ٢. الصفحة ---');
await page.evaluate(() => { location.hash = '#/prospects'; });
await page.waitForTimeout(1600);
const head = await page.locator('#page h1').innerText();
ok('الصفحةُ تفتح بعنوانها', head.includes('الفرص العقاريّة'), head);
ok('وفي القائمة الجانبيّة بابُها', await page.evaluate(() => !!document.querySelector('a[data-route="prospects"]')));
const intro = await page.locator('#page').innerText();
ok('**وتقول صراحةً أنّها ليست مخزونك**', intro.includes('بابٌ لم يُفتح بعد'), intro.split('\n').slice(0, 5).join(' | '));
ok('وتُفرّق نفسَها عن صفحة «الفرص» القديمة', intro.includes('وهي غيرُ صفحة'));
ok('**ولا قوائمَ تُنشأ في صمت** — بل بزرٍّ تضغطه',
  await page.locator('#page button:has-text("أنشئ المراحل الأربع")').count() === 1);

/* ===== ٣. المراحلُ تُنشأ بضغطة ===== */
console.log('\n--- ٣. المراحل ---');
await page.locator('#page button:has-text("أنشئ المراحل الأربع")').click();
await page.waitForTimeout(1400);
const cols = await page.locator('#page .task-list-col').count();
ok('أربعةُ أعمدةٍ ظهرت', cols === 4, `${cols} عمود`);

/* ===== ٤. الإضافةُ السريعة والبطاقة ===== */
console.log('\n--- ٤. الإضافة ---');
await page.locator('#page .task-list-col').first().locator('.task-quick-add input').fill('أرض ورثة في الملقا');
await page.locator('#page .task-list-col').first().locator('.task-quick-add button:has-text("+")').click();
await page.waitForTimeout(1300);
ok('الفرصةُ ظهرت بطاقةً', (await page.locator('#page .task-card').count()) >= 1);
// **وتُحفظ في مخزنها لا في المهامّ** — والبذرةُ التجريبيّة تملأ المهامّ، فيُقاس الفرق لا العدد.
ok('وتُحفظ في مخزنها لا في المهامّ', await page.evaluate(async () => {
  const { repo } = await import('/js/data/repository.js');
  const rows = await repo.prospects.list();
  return rows.length === 1 && !(await repo.tasks.list()).some((t) => t.title === 'أرض ورثة في الملقا');
}));

/* ===== ٥. الموقعُ والسعرُ يظهران على البطاقة ===== */
console.log('\n--- ٥. حقولُ العقار ---');
await page.evaluate(async () => {
  const { repo } = await import('/js/data/repository.js');
  const [row] = await repo.prospects.list();
  await repo.prospects.update(row.id, { city: 'الرياض', district: 'الملقا', price: 2400000, area: 600 });
});
await page.evaluate(() => { location.hash = '#/today'; });
await page.waitForTimeout(400);
await page.evaluate(() => { location.hash = '#/prospects'; });
await page.waitForTimeout(1500);
const cardText = await page.locator('#page .task-card').first().innerText();
ok('**الموقعُ والمساحةُ والسعرُ على البطاقة** — وهي ما يُميّز فرصةً عن مهمّة',
  cardText.includes('الملقا') && cardText.includes('600') && /2,400,000|٢٬٤٠٠٬٠٠٠/.test(cardText),
  cardText.replace(/\n/g, ' | '));

/* ===== ٦. لا تُغلق فرصةٌ بلا مآل ===== */
console.log('\n--- ٦. المآل ---');
const refused = await page.evaluate(async () => {
  const { repo } = await import('/js/data/repository.js');
  const [row] = await repo.prospects.list();
  try { await repo.prospects.update(row.id, { done: true }); return 'قُبل'; } catch (e) { return (e.errors || [e.message]).join(' · '); }
});
ok('**الإغلاقُ بلا مآلٍ مرفوض** في المخزن نفسِه لا في الشاشة وحدها',
  refused.includes('ماذا صارت إليه'), refused);

await page.locator('#page .task-card').first().locator('input[type=checkbox]').check();
await page.waitForTimeout(700);
ok('والشاشةُ تسأل قبل الإغلاق', await page.locator('.modal:has-text("إغلاق")').count() > 0,
  await page.locator('.modal').last().innerText().catch(() => '—'));
await page.selectOption('.modal select', 'lost');
await page.locator('.modal input.input').fill('تأخّرت');
await page.locator('.modal button:has-text("أغلقها")').click();
await page.waitForTimeout(1500);
const closed = await page.evaluate(async () => {
  const { repo } = await import('/js/data/repository.js');
  const [row] = await repo.prospects.list();
  return { done: row.done, outcome: row.outcome, why: row.outcomeReason };
});
ok('**والسببُ يُحفظ** فيُقرأ بعد سنةٍ ما يفوتك ولماذا',
  closed.done && closed.outcome === 'lost' && closed.why === 'تأخّرت', JSON.stringify(closed));

/* ===== ٧. التحويلُ إلى عرضٍ يمرّ بالمسار القائم ===== */
console.log('\n--- ٧. حوّلها عرضًا ---');
const propsBefore = await page.evaluate(async () => {
  const { repo } = await import('/js/data/repository.js');
  const lists = await repo.prospectLists.list();
  await repo.prospects.create({ listId: lists[0].id, title: 'عمارة السليمانية', city: 'الرياض', district: 'السليمانية', price: 9000000 });
  return (await repo.properties.list()).length;
});
await page.evaluate(() => { location.hash = '#/today'; });
await page.waitForTimeout(400);
await page.evaluate(() => { location.hash = '#/prospects'; });
await page.waitForTimeout(1500);
await page.locator('#page button:has-text("حوّلها عرضًا")').first().click();
await page.waitForTimeout(2200);
ok('**يفتح لصقَ العقارات** لا يُنشئ عقارًا في صمت',
  /#\/properties/.test(await page.evaluate(() => location.hash)), await page.evaluate(() => location.hash));
ok('ولا عقارَ دخل مخزونك بلا حفظك', await page.evaluate(async (n) => {
  const { repo } = await import('/js/data/repository.js');
  return (await repo.properties.list()).length === n;
}, propsBefore));
await page.keyboard.press('Escape');
await page.waitForTimeout(600);

/* ===== ٨. البحثُ العامّ يصل الفرص ===== */
console.log('\n--- ٨. البحث ---');
await page.evaluate(async () => {
  const { openGlobalSearch } = await import('/js/util/global-search.js');
  openGlobalSearch();
});
await page.waitForTimeout(500);
await page.locator('.modal input.search').fill('السليمانية');
await page.waitForTimeout(900);
const found = await page.locator('.modal .search-results').innerText();
ok('**بابٌ جديدٌ لا يُفتح بلا بحثٍ يصله**', found.includes('الفرص العقاريّة') && found.includes('عمارة السليمانية'),
  found.split('\n').slice(0, 6).join(' | '));
await page.keyboard.press('Escape');
await page.waitForTimeout(500);

/* ===== ٩. الوارد: ستّةُ أبوابٍ لا بابان ===== */
console.log('\n--- ٩. الوارد بستّة أبواب ---');
/**
 * **وصندوقُ الوارد مشتركٌ بين الحزم** (تخزينٌ واحدٌ في الذاكرة على خادم الاختبار).
 * فتُفصل الرابطةُ قبل البدء وبعده، **وتُصرَف رسائلُ هذه الحزمة** — وإلّا ورّثت الحزمةَ
 * التاليةَ بوتًا مربوطًا بمحادثةٍ غير محادثتها فتُرفض رسائلُها كلُّها.
 */
const unbind = () => page.evaluate(async () => {
  await fetch('/api/telegram', {
    method: 'DELETE', credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ unbind: true }),
  });
});
const clearInbox = () => page.evaluate(async () => {
  const data = await (await fetch('/api/telegram', { credentials: 'same-origin' })).json();
  for (const m of data.messages || []) {
    await fetch('/api/telegram', {
      method: 'DELETE', credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ key: m.key }),
    });
  }
});
await unbind();
await clearInbox();

const send = (text) => page.evaluate(async ({ t, s, chat }) => {
  const res = await fetch('/api/telegram', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': s },
    body: JSON.stringify({ update_id: Math.floor(Math.random() * 1e9), message: { chat: { id: chat }, date: Math.floor(Date.now() / 1000), text: t } }),
  });
  return res.json();
}, { t: text, s: SECRET, chat: CHAT });

await send('السلام عليكم');
const sorted = await send('مزاد على أرض ورثة في الملقا الخميس');
ok('**الخادمُ يفرز الصنفَ الجديد** بالفارز نفسِه لا بنسخةٍ ثانية',
  sorted.kind === 'prospect', JSON.stringify(sorted));
await send('ذكرني أتصل على سعد بكرة الساعة ٤');
await send('فكرة: تقرير شهري نرسله للملاك');

await page.evaluate(() => { location.hash = '#/inbox'; });
await page.waitForTimeout(2200);
const inbox = await page.locator('#page').innerText();
ok('وسمُ «فرصة عقاريّة» يظهر', inbox.includes('فرصة عقاريّة'), '');
ok('ووسمُ «مهمّة» يظهر', inbox.includes('مهمّة'), '');
ok('ووسمُ «فكرة» يظهر', inbox.includes('فكرة'), '');
const btns = await page.locator('#page .inbox-actions button[data-kind]').count();
ok('**وستّةُ أزرارِ اعتمادٍ على كلّ بطاقة** — فالفرزُ يرفع بابًا ولا يقفل الخمسة',
  btns > 0 && btns % 6 === 0, `${btns} زر`);
ok('ولا يُكتب «فكرةًا» ولا «مهمّةًا»', !inbox.includes('ةًا'), '');

/* ===== ١٠. اعتمادُ الفرصة يبذر في صفحتها ولا يحفظ ===== */
console.log('\n--- ١٠. الاعتماد ---');
const before = await page.evaluate(async () => {
  const { repo } = await import('/js/data/repository.js');
  return (await repo.prospects.list()).length;
});
await page.locator('#page button[data-kind="prospect"]').first().click();
await page.waitForTimeout(2400);
ok('**ينتقل إلى «الفرص العقاريّة»**', /#\/prospects/.test(await page.evaluate(() => location.hash)),
  await page.evaluate(() => location.hash));
const seeded = await page.locator('#page .bulk-area').inputValue();
ok('ونصُّ الرسالة في صندوق الإضافة', seeded.includes('مزاد'), seeded.slice(0, 40));
ok('**ولا شيءَ دخل قاعدتَك بلا ضغطتك**', await page.evaluate(async (n) => {
  const { repo } = await import('/js/data/repository.js');
  return (await repo.prospects.list()).length === n;
}, before));

await clearInbox();
await unbind();

ok('لا أخطاء في الصفحة', errors.length === 0, errors.slice(0, 3).join(' | '));
await b.close();
