// اختبار المزامنة والرابط الخاص — أول مرة تغادر فيها بياناتك جهازك.
//
//   node tests/cloud.mjs
//
// والسؤال الذي يجيب عنه: لو سُرِّب المخزن كلّه، هل يُقرأ منه حرف؟

import { createServer } from 'node:http';

// crypto عالميّ في Node الحديث؛ btoa/atob قد لا يكونان.
globalThis.btoa = (s) => Buffer.from(s, 'binary').toString('base64');
globalThis.atob = (s) => Buffer.from(s, 'base64').toString('binary');

const fails = [];
const ok = (t) => console.log('  ✓', t);
const bad = (t, e) => { fails.push(t + (e ? ' :: ' + e : '')); console.log('  ✗', t, e || ''); };

const { encryptPayload, decryptPayload, newBoxId } = await import('../js/cloud.js');

console.log('١) التشفير في جهازك');
const SECRET = { jobs: [{ id: 'a', place: { identity: { name: 'مقهى الدرب' } }, reviews: ['المكان زفت'] }] };
const PASS = 'kalimat-sirr-tawila-2026';
const payload = await encryptPayload(SECRET, PASS);

const blob = JSON.stringify(payload);
!blob.includes('مقهى الدرب') && !blob.includes('زفت')
  ? ok('لا يظهر من بياناتك حرفٌ في الحمولة المرفوعة') : bad('تسرّب نصّ', blob.slice(0, 120));
(payload.cipher && payload.iv && payload.salt) ? ok('والحمولة تحمل ملحها ومتّجهها ونصّها المعمّى') : bad('بنية الحمولة');
payload.iter >= 310000 ? ok(`ودورات الاشتقاق ${payload.iter}`) : bad('الدورات', payload.iter);

const back = await decryptPayload(payload, PASS);
back.jobs[0].place.identity.name === 'مقهى الدرب' ? ok('وتُفكّ بالكلمة الصحيحة كما كانت') : bad('فكّ التشفير', JSON.stringify(back).slice(0, 80));

let opened = false;
try { await decryptPayload(payload, PASS + 'x'); opened = true; } catch { /* المتوقَّع */ }
opened ? bad('كلمة خاطئة فتحت النسخة') : ok('وكلمة خاطئة لا تفتح شيئًا');

const p2 = await encryptPayload(SECRET, PASS);
p2.cipher !== payload.cipher ? ok('وتشفيرتان للنصّ نفسه تختلفان (ملح ومتّجه جديدان)') : bad('تكرار التشفير');

console.log('٢) المعرّف');
const id = newBoxId();
/^[a-f0-9]{48}$/.test(id) ? ok(`معرّف عشوائيّ (${id.length} حرفًا) لا يُشتقّ من اسمٍ ولا كلمة`) : bad('المعرّف', id);
newBoxId() !== id ? ok('ولا يتكرّر') : bad('تكرار المعرّف');

console.log('٣) المخزن يرفض غير المشفَّر');
// مخزن Blobs مزيّف في الذاكرة
const mem = new Map();
const fakeStore = {
  get: async (k) => (mem.has(k) ? mem.get(k) : null),
  set: async (k, v) => { mem.set(k, v); },
  delete: async (k) => { mem.delete(k); },
  getMetadata: async () => null,
};
globalThis.__blobsStub = { getStore: () => fakeStore };

// يُحقَن الاستيراد عبر مُحمِّل وهمي: الدالّة تستورد '@netlify/blobs' ديناميكيًّا.
const storeSrc = (await import('node:fs')).readFileSync(new URL('../netlify/functions/store.js', import.meta.url), 'utf8')
  .replace("await import('@netlify/blobs')", 'globalThis.__blobsStub');
const mod = await import('data:text/javascript;base64,' + Buffer.from(storeSrc).toString('base64'));
const handler = mod.default;

const call = (method, key, body) => handler(new Request(
  `https://x/api/store?key=${key}&slot=archive`,
  method === 'GET' ? {} : { method, body },
));

const KEY = 'a'.repeat(48);
let res = await call('PUT', KEY, JSON.stringify({ plain: 'نصّ صريح' }));
res.status === 400 ? ok('حمولةٌ غير مشفَّرة مرفوضة — ولو طُلب خزنها') : bad('قبول الصريح', res.status);

res = await call('PUT', KEY, blob);
res.status === 200 ? ok('والمشفَّرة تُقبَل') : bad('رفض المشفَّر', res.status + ' ' + await res.text());

res = await call('GET', KEY);
const got = await res.json();
got.found && got.data === blob ? ok('وتُستعاد كما هي') : bad('الاستعادة', JSON.stringify(got).slice(0, 90));

res = await call('GET', 'short');
res.status === 400 ? ok('ومعرّفٌ قصير مرفوض — فلا يُعَدّ على الصناديق') : bad('المعرّف القصير', res.status);

res = await call('PUT', KEY, JSON.stringify({ ...payload, cipher: 'x'.repeat(6 * 1024 * 1024) }));
res.status === 413 ? ok('وما جاوز الحدّ مرفوض') : bad('حدّ الحجم', res.status);

res = await call('DELETE', KEY);
res.status === 200 ? ok('والحذف يعمل') : bad('الحذف', res.status);
(await (await call('GET', KEY)).json()).found === false ? ok('ولا يبقى بعده شيء') : bad('بقي بعد الحذف');

console.log('ح) الحقولُ محصورةٌ بأسمائها');
/* رأسُ الملف يَعِد: «لا يُخزَّن إلا مشفَّرًا». وكان الحارس يشترط وجودَ
   المشفَّر ولا يمنع ما جاوره، فتمرّ حمولةٌ فيها cipher ومعها مئتا كيلوبايت
   نصًّا صريحًا — فالوعدُ كان أوسعَ من حارسه. */
const put = (payload) => call('PUT', KEY, JSON.stringify(payload));

{
  const good = { v: 1, iter: 310000, salt: 's', iv: 'i', cipher: 'c' };
  const r = await (await put(good)).json();
  r.ok ? ok('الحمولة المشفَّرة تُقبَل') : bad('رُفضت السليمة', JSON.stringify(r));

  const labelled = await (await put({ ...good, label: 'مكتب الرياض' })).json();
  labelled.ok ? ok('ومعها عنوانُ صفحة الاستقبال') : bad('رُفض العنوان', JSON.stringify(labelled));

  const smuggled = await (await put({ ...good, junk: 'ن'.repeat(2000) })).json();
  smuggled.error && /غير مسموحة/.test(smuggled.error)
    ? ok('ونصٌّ صريح يتسلّل بجوار المشفَّر: مرفوض') : bad('تسلّل نصٌّ صريح', JSON.stringify(smuggled));

  const longLabel = await (await put({ ...good, label: 'x'.repeat(200) })).json();
  longLabel.error ? ok('وعنوانٌ يجاوز ستّين حرفًا: مرفوض') : bad('عنوانٌ طويل مرّ');

  const wrongType = await (await put({ ...good, cipher: { a: 1 } })).json();
  wrongType.error ? ok('وحقلٌ ليس نصًّا: مرفوض') : bad('نوعٌ خاطئ مرّ');
}

console.log('\n' + (fails.length ? `فشل ${fails.length}:\n` + fails.map((f) => ' - ' + f).join('\n') : '✅ نجحت كل الاختبارات'));
process.exit(fails.length ? 1 : 0);
