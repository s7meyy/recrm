// اختبار موصّل OpenRouter والمُشغِّل — بلا مفتاح ولا حساب ولا شبكة.
//
//   node tests/runner.mjs
//
// يُنصَب «OpenRouter» مزيّف يبثّ SSE كما يبثّ الحقيقي، فيُختبَر التدفّق
// والبديل عند بلوغ الحدّ، ورفض الإجابة المخترِعة، ورسائل المفتاح.

import { createServer } from 'node:http';

const fails = [];
const ok = (t) => console.log('  ✓', t);
const bad = (t, e) => { fails.push(t + (e ? ' :: ' + e : '')); console.log('  ✗', t, e || ''); };

/* ── OpenRouter مزيّف ── */
let calls = [];
let mode = 'ok';
const srv = createServer(async (req, res) => {
  let body = '';
  for await (const c of req) body += c;
  const parsed = JSON.parse(body || '{}');
  calls.push({ model: parsed.model, auth: req.headers.authorization, promptLen: (parsed.messages?.[0]?.content || '').length });

  if (mode === 'rate' && calls.length === 1) {
    res.statusCode = 429;
    res.setHeader('content-type', 'application/json');
    return res.end(JSON.stringify({ error: { message: 'Rate limit exceeded' } }));
  }
  const text = mode === 'invent'
    ? '## ملخص\nالتحليل يستند إلى (R999) و(R001).'
    : '## ملخص\nالتحليل يستند إلى (R001) و(R002).';

  res.setHeader('content-type', 'text/event-stream');
  for (const ch of text.match(/.{1,12}/gs)) {
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: ch } }] })}\n\n`);
  }
  res.write('data: [DONE]\n\n');
  res.end();
});
await new Promise((r) => srv.listen(0, r));
const port = srv.address().port;

// بيئة Deno التي تتوقّعها دالّة الحافة
globalThis.Deno = { env: { get: (k) => process.env[k] } };

const realFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const u = new URL(input instanceof URL ? input.href : (typeof input === 'string' ? input : input.url));
  if (u.hostname === 'openrouter.ai') {
    return realFetch(`http://127.0.0.1:${port}${u.pathname}`, init);
  }
  return realFetch(input, init);
};

const { default: edge } = await import('../netlify/edge-functions/model.js');
const call = async (payload, env = {}) => {
  const saved = { ...process.env };
  Object.assign(process.env, env);
  const res = await edge(new Request('https://x/api/model', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
  }));
  process.env = saved;
  return res;
};
const readAll = async (res) => {
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let out = '';
  for (;;) { const { done, value } = await reader.read(); if (done) break; out += dec.decode(value, { stream: true }); }
  return out;
};

try {
  console.log('١) الدالّة على الحافة');
  let r = await call({ model: 'm', prompt: 'س' }, {});
  let j = await r.json();
  (r.status === 503 && j.needsKey) ? ok('بلا مفتاح: يُرشد ولا ينهار') : bad('بلا مفتاح', r.status);

  r = await call({ model: 'm', prompt: 'س' }, { OPENROUTER_KEY: 'مفتاح عربي' });
  j = await r.json();
  (r.status === 400 && /غير لاتيني/.test(j.error)) ? ok('مفتاح فيه حرف غير لاتيني: رسالة واضحة') : bad('فحص المفتاح', JSON.stringify(j));

  r = await call({ model: '', prompt: 'س' }, { OPENROUTER_KEY: 'K' });
  r.status === 400 ? ok('بلا نموذج: مرفوض') : bad('بلا نموذج', r.status);

  r = await call({ model: 'm', prompt: '' }, { OPENROUTER_KEY: 'K' });
  r.status === 400 ? ok('رسالة فارغة: مرفوضة') : bad('رسالة فارغة', r.status);

  r = await call({ model: 'm', prompt: 'x'.repeat(400001) }, { OPENROUTER_KEY: 'K' });
  r.status === 400 ? ok('رسالة أضخم من الحدّ: مرفوضة قبل النداء') : bad('حدّ الحجم', r.status);

  console.log('٢) التدفّق');
  calls = []; mode = 'ok';
  r = await call({ model: 'deepseek/x:free', prompt: 'حلّل' }, { OPENROUTER_KEY: 'K-REAL' });
  r.status === 200 ? ok('الردّ يبدأ فورًا') : bad('حالة التدفّق', r.status);
  r.headers.get('x-rabih-model') === 'deepseek/x:free' ? ok('النموذج المُشغَّل معلن في الترويسة') : bad('ترويسة النموذج', r.headers.get('x-rabih-model'));
  const text = await readAll(r);
  text.includes('(R001)') && text.includes('## ملخص') ? ok('النصّ يصل كاملًا مجمَّعًا من القطع') : bad('النصّ', text.slice(0, 60));
  calls[0].auth === 'Bearer K-REAL' ? ok('المفتاح يُرسل في الترويسة ولا يمرّ بالمتصفح') : bad('ترويسة المفتاح', calls[0].auth);

  console.log('٣) المُشغِّل: البديل عند بلوغ الحدّ');
  // المتصفح ينادي /api/model، فيُوجَّه إلى دالّة الحافة مباشرةً.
  // يُحفظ توجيه openrouter.ai إلى الخادم المزيّف: دالّة الحافة تنادي به من داخلها.
  const toFake = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    const u = String(input instanceof URL ? input.href : (typeof input === 'string' ? input : input.url));
    if (u.includes('/api/model')) return call(JSON.parse(init.body), { OPENROUTER_KEY: 'K-REAL' });
    return toFake(input, init);
  };
  const { runStep, pendingSteps } = await import('../js/runner.js');
  const { emptyPlace, emptyReview } = await import('../js/schema.js');
  const place = emptyPlace();
  place.identity.name = 'مقهى الاختبار';
  place.ratings = { average: 4.2, count: 100, distribution: null };
  place.reviews = [
    { ...emptyReview(), id: 'R001', rating: 5, text: 'القهوة ممتازة.', author: 'أ' },
    { ...emptyReview(), id: 'R002', rating: 2, text: 'الانتظار طويل.', author: 'ب' },
  ];
  const state = { place, ctx: { cityName: 'الرياض', categoryName: 'مقهى', districtName: 'العليا' }, out: {} };

  calls = []; mode = 'rate';
  let step = await runStep('n1', state, {});
  step.ok ? ok('نجحت الخطوة رغم رفض الأول') : bad('البديل', JSON.stringify(step).slice(0, 120));
  step.attempts.length === 2 ? ok('جُرِّب البديل بعد ٤٢٩ (محاولتان)') : bad('عدد المحاولات', step.attempts.length);
  calls.length === 2 ? ok('نموذجان مختلفان نُوديا: ' + calls.map((c) => c.model).join(' ← ')) : bad('النداءات', calls.length);

  console.log('٤) المُشغِّل: الإجابة المخترِعة تُرفض');
  calls = []; mode = 'invent';
  step = await runStep('n1', state, {});
  !step.ok ? ok('لم تُقبل إجابةٌ فيها معرّف مخترَع') : bad('قبول الاختراع', JSON.stringify(step).slice(0, 100));
  step.invented ? ok('السبب مُصرَّح به: الاختراع') : bad('سبب الرفض', step.error?.slice(0, 80));
  step.attempts.length === 3 ? ok('جُرِّبت النماذج الثلاثة كلها قبل الاستسلام') : bad('محاولات الاختراع', step.attempts.length);
  /R999/.test(step.attempts[0].error) ? ok('المعرّف المخترَع مذكور في السبب') : bad('تفصيل الاختراع', step.attempts[0].error);

  console.log('٥) التدفّق يصل المستخدم قطعةً قطعةً');
  calls = []; mode = 'ok';
  const chunks = [];
  step = await runStep('n1', state, { onChunk: (piece) => chunks.push(piece) });
  chunks.length > 1 ? ok(`وصل النصّ على ${chunks.length} دفعات لا دفعةً واحدة`) : bad('التدفّق للمستخدم', chunks.length);
  step.model ? ok('اسم النموذج الذي شُغِّل يُعاد: ' + step.model) : bad('اسم النموذج');

  console.log('٦) ترتيب الخطوات');
  pendingSteps({}).length === 8 ? ok('ثماني خطوات معلّقة في البداية') : bad('المعلّق', pendingSteps({}).length);
  pendingSteps({ n1: 'x', n2: 'y' }).length === 6 ? ok('ما تمّ لا يُعاد') : bad('المعلّق بعد خطوتين', pendingSteps({ n1: 'x', n2: 'y' }).length);
  pendingSteps({})[0] === 'n1' ? ok('يبدأ من الأولى') : bad('البداية', pendingSteps({})[0]);
} catch (e) {
  bad('استثناء', e.message + ' :: ' + (e.stack || '').split('\n')[1]);
} finally {
  srv.close();
}

console.log('\n' + (fails.length ? `فشل ${fails.length}:\n` + fails.map((f) => ' - ' + f).join('\n') : '✅ نجحت كل الاختبارات'));
process.exit(fails.length ? 1 : 0);
