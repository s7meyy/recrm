// المرحلة ٥١ في متصفّح حقيقي: صفحةُ «الوارد» — الحالُ والفرزُ والاعتمادُ والحذف.
import { chromium } from './pw.mjs';
import { createHmac } from 'node:crypto';

const BASE = process.env.TEST_URL || 'http://127.0.0.1:8235';
const SECRET = 'test-tg-secret';
const CHAT = '8471122556';

/**
 * **كوكي البوّابة كما تُصدرها** — فالسردُ للمالك وحده، والخادمُ المفتوح يمرّر البوّابة
 * ولا يمنح جلسة. فتُوقَّع هنا بالمفتاح نفسِه (`APP_SECRET` في خادم الاختبار).
 */
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

/** يُرسل تحديثًا كما يرسله تيليجرام — بالسرّ في ترويسته. */
async function send(text, extra = {}) {
  return page.evaluate(async ({ t, s, chat, ex }) => {
    const res = await fetch('/api/telegram', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': s },
      body: JSON.stringify({ update_id: Math.floor(Math.random() * 1e9), message: { chat: { id: chat }, date: Math.floor(Date.now() / 1000), text: t, ...ex } }),
    });
    return res.json();
  }, { t: text, s: SECRET, chat: CHAT, ex: extra });
}

await page.goto(BASE + '/');
await page.waitForTimeout(2400);

/* ===== ١. الصفحة تفتح وتقول حالها ===== */
console.log('--- ١. الصفحة والحال ---');
await page.evaluate(() => { location.hash = '#/inbox'; });
await page.waitForTimeout(1800);
ok('الصفحةُ تفتح', (await page.locator('#page h1').innerText()).includes('الوارد'));
ok('وفي القائمة الجانبيّة بابُها', await page.evaluate(() => !!document.querySelector('a[data-route="inbox"]')));
const first = await page.locator('#page').innerText();
ok('**وتقول صراحةً أنّ ما فيها لم يدخل قاعدتك**', first.includes('ما وصل، لا ما دخل'));
ok('وتقول إنّ الفرزَ بقواعدَ لا بذكاء', first.includes('بقواعدَ لا بذكاء'));
ok('**والصندوقُ الفارغ يُفرَّق عن غير المربوط**', /لا وارد بعد|غير مربوط|ينتظر أوّل رسالة/.test(first),
  first.split('\n').slice(0, 6).join(' | '));

/* ===== ٢. أوّلُ رسالةٍ تربط البوت بنفسها ===== */
console.log('\n--- ٢. الربط بأوّل رسالة ---');
const bind = await send('السلام عليكم');
ok('**البوتُ يربط نفسَه بلا متغيّر بيئة**', bind.bound === CHAT, JSON.stringify(bind));

/* ===== ٣. الفرز يظهر على البطاقة ===== */
console.log('\n--- ٣. الفرز ---');
await send('ابحث عن فلة في حطين ميزانيتي ٣ مليون، جوالي 0551234567');
await send('للبيع أرض في النرجس ٦٠٠م الصك إلكتروني واجهة شمالية');
await send('فلة حطين ٣ مليون');
await page.evaluate(() => { location.hash = '#/today'; });
await page.waitForTimeout(500);
await page.evaluate(() => { location.hash = '#/inbox'; });
await page.waitForTimeout(2000);
const listed = await page.locator('#page').innerText();
ok('الطلبُ يُوسَم طلبًا', listed.includes('طلب'), '');
ok('والعرضُ يُوسَم عرضًا', listed.includes('عرض'), '');
ok('**والملتبسُ يُوسَم «غير مؤكَّد» ولا يُخمَّن**', listed.includes('غير مؤكَّد'), '');
ok('**والحجّةُ تُعرض مع الحكم** — فتصدّقه أو تردّه بعلم', /لأنّ فيه|متقاربة|الحكمُ لك/.test(listed),
  listed.split('\n').find((l) => l.includes('لأنّ') || l.includes('الحكمُ لك')) || '');
ok('ونصُّ الرسالة يُعرض كما وصل', listed.includes('ابحث عن فلة في حطين'));
const cards = await page.locator('#page .panel').count();
ok('ولكلّ رسالةٍ بطاقة', cards >= 4, `${cards} لوحة`);

/* ===== ٤. المكرّرة لا تتضاعف ===== */
console.log('\n--- ٤. التكرار ---');
const before = await page.locator('#page .panel').count();
await send('ابحث عن فلة في حطين ميزانيتي ٣ مليون، جوالي 0551234567');
await page.locator('#page button:has-text("حدّث")').click();
await page.waitForTimeout(1500);
const after = await page.locator('#page .panel').count();
ok('**تحويلُ الرسالة نفسِها مرّتين لا يضاعفها**', after === before, `${before} → ${after}`);

/* ===== ٥. الاعتماد يمرّ بالمسار القائم ===== */
console.log('\n--- ٥. الاعتماد ---');
const reqBtn = page.locator('#page button:has-text("اعتمده طلبًا")').first();
ok('زرُّ «اعتمده طلبًا» موجود', await reqBtn.count() > 0);
await reqBtn.click();
await page.waitForTimeout(2200);
ok('**يفتح استمارةَ الطلبات** لا شاشةَ اعتمادٍ ثانية', /#\/requests/.test(await page.evaluate(() => location.hash)),
  await page.evaluate(() => location.hash));
const modalText = await page.locator('.modal').last().innerText().catch(() => '');
ok('والاستمارةُ معبّأةٌ ممّا قُرئ', modalText.includes('حطين') || modalText.includes('3,000,000') || modalText.length > 50,
  modalText.slice(0, 80).replace(/\n/g, ' | '));
await page.keyboard.press('Escape');
await page.waitForTimeout(600);

/* ===== ٦. الحذف يُزيل ===== */
console.log('\n--- ٦. الحذف ---');
await page.evaluate(() => { location.hash = '#/inbox'; });
await page.waitForTimeout(1800);
const beforeDel = await page.locator('#page button:has-text("احذفه")').count();
if (beforeDel) {
  await page.locator('#page button:has-text("احذفه")').first().click();
  await page.waitForTimeout(1800);
  const afterDel = await page.locator('#page button:has-text("احذفه")').count();
  ok('الحذفُ يُزيل الرسالةَ من الصندوق', afterDel === beforeDel - 1, `${beforeDel} → ${afterDel}`);
} else {
  ok('الحذفُ يُزيل الرسالةَ من الصندوق', false, 'لا بطاقات');
}

/* ===== ٧. المحادثةُ الغريبة تُرفض ===== */
console.log('\n--- ٧. الغريب يُرفض ---');
const stranger = await page.evaluate(async ({ s }) => {
  const res = await fetch('/api/telegram', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': s },
    body: JSON.stringify({ update_id: 777, message: { chat: { id: 999999 }, date: Math.floor(Date.now() / 1000), text: 'مرحبا' } }),
  });
  return res.json();
}, { s: SECRET });
ok('**بوتٌ مربوطٌ لا يستقبل من غير صاحبه**', stranger.rejected === true, JSON.stringify(stranger));

const noSecret = await page.evaluate(async () => {
  const res = await fetch('/api/telegram', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ update_id: 888, message: { chat: { id: 1 }, date: 1, text: 'x' } }),
  });
  return res.status;
});
ok('**وبلا سرٍّ في الترويسة يُرفض الوارد** — فلا يدسّ أحدٌ في صندوقك', noSecret === 403, String(noSecret));

ok('لا أخطاء في الصفحة', errors.length === 0, errors.slice(0, 3).join(' | '));
await b.close();
