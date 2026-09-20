// المرحلة ٣٨ — واتساب في المتصفّح والخادم: المصافحة، والتوقيع، والصفحة.
import { chromium } from './pw.mjs';
import { createHmac } from 'node:crypto';
const BASE = process.env.TEST_URL || 'http://127.0.0.1:8234';
const b = await chromium.launch();
const page = await (await b.newContext({ locale: 'ar-SA' })).newPage();
const errors = [];
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
page.on('console', m => { const t = m.text(); if (m.type() === 'error' && !t.includes('ERR_') && !t.includes('Failed to load resource')) errors.push(t); });
const ok = (n, c, x = '') => console.log(`${c ? 'PASS' : 'FAIL'} — ${n}${x ? ' :: ' + x : ''}`);

const sign = (body) => `sha256=${createHmac('sha256', 'wa-app-secret').update(body).digest('hex')}`;
const post = (body, sig) => fetch(`${BASE}/api/whatsapp`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', ...(sig ? { 'x-hub-signature-256': sig } : {}) },
  body,
});

/* ===== مصافحة التحقّق ===== */
console.log('\n--- ٣٨. مصافحة الوِبهوك ---');
const good = await fetch(`${BASE}/api/whatsapp?hub.mode=subscribe&hub.verify_token=wa-verify-token&hub.challenge=12345`);
ok('الرمز الصحيح يعيد التحدّي كما هو', good.status === 200 && (await good.text()) === '12345');
const bad = await fetch(`${BASE}/api/whatsapp?hub.mode=subscribe&hub.verify_token=خطأ&hub.challenge=12345`);
ok('والرمز الخاطئ يُرفض ٤٠٣ (لا يربط أحدٌ وِبهوكه بموقعك)', bad.status === 403, String(bad.status));

/* ===== التوقيع: لا رسالة بلا تحقّق ===== */
console.log('\n--- ٣٨. توقيع الوارد ---');
const body = JSON.stringify({
  entry: [{ changes: [{ value: {
    contacts: [{ wa_id: '966551234567', profile: { name: 'سعد التميمي' } }],
    messages: [{ id: 'wamid.T1', from: '966551234567', timestamp: '1789000000', type: 'text', text: { body: 'أبغى أشوف فلة النرجس' } }],
  } }] }],
});
const noSig = await post(body, null);
ok('رسالة بلا توقيع تُرفض ٤٠٣', noSig.status === 403, String(noSig.status));
const wrongSig = await post(body, 'sha256=' + '0'.repeat(64));
ok('وبتوقيع خاطئ تُرفض كذلك', wrongSig.status === 403, String(wrongSig.status));
const tampered = await post(body.replace('النرجس', 'الياسمين'), sign(body));
ok('وجسمٌ عُبث به بعد التوقيع يُرفض (التوقيع على المحتوى لا على الاسم)', tampered.status === 403, String(tampered.status));
const okPost = await post(body, sign(body));
ok('والتوقيع الصحيح يُقبل وتُحفظ الرسالة', okPost.status === 200 && (await okPost.json()).stored === 1, String(okPost.status));

/* ===== السرد للمالك وحده ===== */
console.log('\n--- ٣٨. السرد ---');
const anonPage = await (await b.newContext()).newPage();
await anonPage.goto(BASE + '/');
const anonList = await anonPage.evaluate(async () => (await fetch('/api/whatsapp', { credentials: 'same-origin' })).status);
ok('بلا تسجيل دخول: السرد مرفوض ٤٠١ (أرقام عملائك وكلامهم)', anonList === 401, String(anonList));

await page.goto(BASE + '/');
await page.fill('input[type="password"]', 'secret-pass');
await page.click('button[type="submit"]');
await page.waitForTimeout(2400);

/* ===== الصفحة ===== */
console.log('\n--- ٣٨. الصفحة ---');
await page.evaluate(() => { location.hash = '#/whatsapp'; });
await page.waitForTimeout(1600);
const text = await page.locator('#page').innerText();
ok('الصفحة تفتح', (await page.locator('#page h1').innerText()).includes('واتساب'));
// المرحلة ٥٢: خطواتُ الربط صارت مطويّةً خلف سطرٍ يُنقر — **والعنوانُ يبقى موجودًا**
// ولا يُحذف: من يربط أوّلَ مرّةٍ يجده بنقرة، ومن ربط لا يقرؤه كلّ يوم.
ok('وسطرُ «كيف أربطه؟» ظاهرٌ في الصفحة', text.includes('كيف أربطه'), text.split('\n').slice(0, 8).join(' | '));
await page.locator('#page summary:has-text("كيف أربطه")').first().click();
await page.waitForTimeout(400);
ok('وتُري عنوان الوِبهوك لينسخه إلى Meta', (await page.locator('#page').innerText()).includes('/api/whatsapp'));
ok('وتشرح قيد واتساب: لا رسالة حرّة يبدؤها المكتب', text.includes('قالب'));
ok('الرسالة الواردة ظهرت في الوارد', text.includes('أبغى أشوف فلة النرجس'), text.split('\n').find((l) => l.includes('أبغى')) || '—');
ok('ورقم المرسِل بالصيغة المحلّية', text.includes('0551234567') || text.includes('055 123 4567'), text.split('\n').find((l) => l.includes('055')) || '—');

/* غير المعروف يُضاف عميلًا بضغطة */
const addBtn = page.locator('button:has-text("+ أضفه عميلًا")').first();
ok('ومن ليس في عملائك يُضاف بضغطة', await addBtn.count() === 1);
await addBtn.click();
await page.waitForTimeout(1200);
const added = await page.evaluate(async () => {
  const { repo } = await import('/js/data/repository.js');
  return (await repo.clients.list()).some((c) => c.phone === '0551234567');
});
ok('وأُضيف فعلًا برقمه', added);

/* الحملة */
await page.evaluate(() => { location.hash = '#/clients'; });
await page.waitForTimeout(400);
await page.evaluate(() => { location.hash = '#/whatsapp'; });
await page.waitForTimeout(1600);
ok('قائمة الجمهور فيها فلتر «الكل»', await page.locator('#page .chip-all').count() === 1);
ok('وتقول كم ستصل الرسالة', (await page.locator('#page').innerText()).includes('كل من له جوال'), '');
await page.locator('#page button:has-text("أرسل الحملة")').click();
await page.waitForTimeout(500);
ok('الإرسال بلا اسم قالب يُرفض برسالة واضحة', (await page.locator('.toast').innerText()).includes('القالب'), await page.locator('.toast').innerText());

/* الصفحة للمالك وحده */
ok('«واتساب» في قائمة صفحات المالك وحده', await page.evaluate(() => !!document.querySelector('a[data-route="whatsapp"][data-owner-only]')));

console.log('\n' + (errors.length ? 'FAIL — أخطاء وحدة التحكّم :: ' + errors.join(' | ') : 'PASS — لا أخطاء في وحدة التحكّم'));
await b.close();
