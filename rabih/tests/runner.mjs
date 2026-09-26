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

  console.log('٦) لا تُشغَّل خطوة ينقص ما قبلها');
  // رسالتها تُبنى بعبارة نائبة، فيجيب النموذج عن فراغٍ إجابةً تبدو سليمة.
  const early = await runStep('a1', { ...state, out: {} }, {});
  !early.ok ? ok('رُفض تشغيل التحليل قبل التوحيد') : bad('تشغيل مبكر', JSON.stringify(early).slice(0, 90));
  /تنقص خطوات/.test(early.error || '') ? ok('السبب مذكور: ' + early.error.slice(0, 55)) : bad('سبب الرفض', early.error);
  const ready = await runStep('a1', { ...state, out: { n1: 'x', n2: 'y', n3: 'z', nm: 'موحَّد (R001)' } }, {});
  ready.ok ? ok('وتمضي حين يكتمل ما قبلها') : bad('بعد الاكتمال', JSON.stringify(ready).slice(0, 90));

console.log('٧) الدفعات: التوحيد والدمج معًا');
  const { batchCount, splitBatches } = await import('../js/prompts.js');
  batchCount(150) === 3 ? ok('١٥٠ تعليقًا = ٣ دفعات') : bad('عدد الدفعات', batchCount(150));
  batchCount(60) === 1 ? ok('٦٠ تعليقًا = دفعة واحدة') : bad('دفعة واحدة', batchCount(60));

  const joined = 'أول\n---\n## دفعة 2 من 3\nثانٍ\n---\n## دفعة 3 من 3\nثالث';
  const back = splitBatches(joined, 3);
  back.length === 3 ? ok('المخرج المقسَّم يُفصَل إلى دفعاته') : bad('الفصل', back.length);
  back[0] === 'أول' ? ok('الدفعة الأولى سليمة') : bad('الأولى', JSON.stringify(back[0]));
  /ثالث/.test(back[2]) ? ok('والأخيرة سليمة') : bad('الأخيرة', JSON.stringify(back[2]));
  splitBatches('سطر واحد فقط', 3).length === 3 ? ok('ولصقٌ بلا علامات يُقسَّم بالتساوي') : bad('قسمة بلا علامات');

  // التوحيد المقسَّم يجب أن يُتبَع بدمجٍ مقسَّم: وإلا انفجر حجم رسالة الدمج.
  const big = { ...state, place: { ...state.place,
    reviews: Array.from({ length: 150 }, (_, i) => ({ id: 'R' + String(i + 1).padStart(3, '0'), rating: (i % 5) + 1, author: 'ز' + i, date: 'قبل شهر', text: 'تعليق رقم ' + i + ' عن الخدمة والانتظار.', ownerReply: '', language: '', likes: null })) } };
  calls = []; mode = 'ok';
  const norm = await runStep('n1', big, {});
  (norm.ok && norm.batches === 3) ? ok('التوحيد جرى على ٣ دفعات') : bad('دفعات التوحيد', JSON.stringify({ ok: norm.ok, b: norm.batches }));
  calls.length === 3 ? ok('ثلاثة نداءات لا واحد') : bad('نداءات التوحيد', calls.length);

  calls = [];
  const merged = await runStep('nm', { ...big, out: { n1: norm.text, n2: norm.text, n3: norm.text } }, {});
  merged.ok ? ok('الدمج تمّ') : bad('الدمج', JSON.stringify(merged).slice(0, 100));
  merged.batches === 3 ? ok('والدمج أيضًا على ٣ دفعات') : bad('دفعات الدمج', merged.batches);
  const maxLen = Math.max(...calls.map((c) => c.promptLen));
  maxLen < 60000 ? ok(`أكبر رسالة دمج ${Math.round(maxLen / 1000)}ك حرف — دون الحدّ`) : bad('حجم رسالة الدمج', maxLen);

console.log('٨) بصمة البيانات');
  const { dataStamp, staleSteps } = await import('../js/stamp.js');
  const p1 = { ...state.place };
  const s1 = dataStamp(p1);
  const p2 = { ...state.place, reviews: [{ ...state.place.reviews[0], text: 'نصٌّ آخر تمامًا' }, state.place.reviews[1]] };
  dataStamp(p2) !== s1 ? ok('تبدّل نصّ تعليق يغيّر البصمة') : bad('البصمة عند التبدّل');
  dataStamp({ ...state.place }) === s1 ? ok('وتثبت إن لم يتبدّل شيء') : bad('ثبات البصمة');
  staleSteps({ n1: 'x', n2: '' }, { n1: s1 }, dataStamp(p2)).join() === 'n1'
    ? ok('الخطوة المبنيّة على بياناتٍ قديمة تُكشَف') : bad('كشف القديم');
  staleSteps({ n1: 'x' }, { n1: s1 }, s1).length === 0 ? ok('ولا يُنبَّه على ما بُني على الحالية') : bad('إنذار كاذب');

console.log('٩) ترتيب الخطوات');
  pendingSteps({}).length === 8 ? ok('ثماني خطوات معلّقة في البداية') : bad('المعلّق', pendingSteps({}).length);
  pendingSteps({ n1: 'x', n2: 'y' }).length === 6 ? ok('ما تمّ لا يُعاد') : bad('المعلّق بعد خطوتين', pendingSteps({ n1: 'x', n2: 'y' }).length);
  pendingSteps({})[0] === 'n1' ? ok('يبدأ من الأولى') : bad('البداية', pendingSteps({})[0]);
} catch (e) {
  bad('استثناء', e.message + ' :: ' + (e.stack || '').split('\n')[1]);
} finally {
  srv.close();
}

console.log('١٠) عطبُ الشبكة يُعاد لا يُرمى');
/* كان `fetch` وقراءةُ البثّ بلا حارس، فانقطاعُ الإنترنت يخرج استثناءً من
   callModel ثم من runStep إلى الواجهة: لا رسالةَ للمستخدم، **ولا يعمل
   البديلُ من النماذج أصلًا** — وهو موجودٌ لهذا بعينه. */
{
  const { callModel, runStep } = await import('../js/runner.js');
  const { emptyPlace, emptyReview, assignReviewIds } = await import('../js/schema.js');
  const saved = globalThis.fetch;
  const enc = (t) => new TextEncoder().encode(t);

  globalThis.fetch = async () => { throw new TypeError('Failed to fetch'); };
  const down = await callModel('m', 'p').catch((e) => ({ threw: e.message }));
  down.ok === false && down.network ? ok('شبكةٌ ساقطة: يُعاد عطبٌ موصوف') : bad('شبكة ساقطة', JSON.stringify(down));

  globalThis.fetch = async () => ({ ok: true, headers: { get: () => 'm' },
    body: { getReader() { let n = 0; return { read() {
      n += 1;
      if (n === 1) return Promise.resolve({ done: false, value: enc('نصف ') });
      return Promise.reject(new TypeError('network error'));
    } }; } } });
  const cut = await callModel('m', 'p').catch((e) => ({ threw: e.message }));
  cut.ok === false && cut.partial === 'نصف'
    ? ok('وبثٌّ ينقطع: يُعاد ما وصل موسومًا ناقصًا — ولا يُسلَّم نصفُ تحليل') : bad('بثّ منقطع', JSON.stringify(cut));

  globalThis.fetch = async () => ({ ok: true, headers: { get: () => 'm' }, body: null });
  const hollow = await callModel('m', 'p').catch((e) => ({ threw: e.message }));
  hollow.ok === false ? ok('وجسمٌ فارغ: لا ينهار') : bad('جسم فارغ', JSON.stringify(hollow));

  globalThis.fetch = async () => { const e = new Error('aborted'); e.name = 'AbortError'; throw e; };
  let aborted = false;
  try { await callModel('m', 'p'); } catch (e) { aborted = e.name === 'AbortError'; }
  aborted ? ok('والإلغاءُ يمرّ كما هو — لا يُحسَب عطبًا فيُجرَّب له بديل') : bad('الإلغاء ابتُلع');

  const pl = emptyPlace();
  pl.identity.name = 'مقهى';
  pl.ratings = { average: 4.2, count: 310, distribution: null };
  pl.reviews = [
    { ...emptyReview(), rating: 1, text: 'الانتظار طويل', date: 'قبل شهر' },
    { ...emptyReview(), rating: 5, text: 'القهوة ممتازة', date: 'قبل شهر' },
  ];
  assignReviewIds(pl);
  let tries = 0;
  globalThis.fetch = async () => {
    tries += 1;
    if (tries === 1) throw new TypeError('Failed to fetch');
    return { ok: true, headers: { get: () => 'model-b' },
      body: { getReader() { let d = false; return { read() {
        if (d) return Promise.resolve({ done: true });
        d = true;
        return Promise.resolve({ done: false, value: enc('شكا العميل من الانتظار (R001).') });
      } }; } } };
  };
  const step = await runStep('n1', { place: pl, ctx: {}, out: {}, assume: {} }, {});
  step.ok && tries === 2
    ? ok('والبديلُ يعمل: يسقط الأول بالشبكة فينجح الثاني') : bad('البديل لا يعمل', `نداءات ${tries} · ${step.error || ''}`);

  globalThis.fetch = saved;
}

console.log('١١) الترشيحُ حيٌّ لا محفور — القائمةُ المجانية تتبدّل ولا يتوقّف الخطّ');
/* ماتت ثلاثةُ بدائلَ مجانيةٍ في يومٍ واحد فتوقّف خطُّ التحليل عند أول خطوة:
   «تعذّرت بعد تجربة كل البدائل». فالترشيحُ يُقرأ من القائمة الحيّة ويُطابَق
   بالعائلة، وما ردّ بأنه «لم يعد مجانيًّا» لا يُجرَّب ثانية. */
{
  const saved = globalThis.fetch;
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  const live = { free: [
    { id: 'deepseek/deepseek-chat-v3.1:free', name: 'DeepSeek V3.1', context: 64000, text: true },
    { id: 'meta-llama/llama-4-maverick:free', name: 'Llama 4 Maverick', context: 128000, text: true },
    { id: 'qwen/qwen3-235b-a22b:free', name: 'Qwen3 235B', context: 40000, text: true },
    { id: 'google/gemini-2.0-flash-exp:free', name: 'Gemini 2.0 Flash', context: 1000000, text: true },
    { id: 'tiny/model:free', name: 'Tiny', context: 4000, text: true },
    { id: 'google/lyria-3:free', name: 'Lyria 3 Pro Preview', context: 200000 },
    { id: 'google/lyria-3-clip:free', name: 'Lyria 3 Clip Preview', context: 200000, text: true },
  ] };
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.endsWith('/api/models')) return new Response(JSON.stringify(live), { status: 200, headers: { 'content-type': 'application/json' } });
    return new Response('nope', { status: 500 });
  };
  const { resolvePicks, retire, retiredFrom, freeModels } = await import('../js/catalog.js?live');
  const n = await resolvePicks('normalize');
  n.length >= 3 ? ok(`التوحيد له ${n.length} مرشَّحين رغم موت أسمائه الثابتة`) : bad('لا مرشَّح', n.length);
  n[0].slug === 'deepseek/deepseek-chat-v3.1:free'
    ? ok('DeepSeek V3 الميت ← DeepSeek V3.1 الحيّ من العائلة نفسها') : bad('مطابقة العائلة', n[0].slug);
  n.some((p) => p.slug.startsWith('meta-llama/')) && n.some((p) => p.slug.startsWith('qwen/'))
    ? ok('وLlama وQwen كلٌّ إلى قريبه') : bad('العائلات', n.map((p) => p.slug).join(' | '));
  !n.some((p) => p.slug === 'tiny/model:free') ? ok('ولا يُرشَّح نموذجٌ نافذتُه أضيق من تقرير') : bad('نافذة ضيقة رُشِّحت');
  const all = [...n, ...(await resolvePicks('mergeNormalized')), ...(await resolvePicks('analyze'))];
  !all.some((p) => p.slug.includes('lyria')) ? ok('ولا نموذجٌ يُخرج موسيقى — رُشِّح مرةً لتوحيد التعليقات') : bad('نموذجٌ غير نصّيّ رُشِّح', all.map((p) => p.slug).join(' | '));
  const a = await resolvePicks('analyze');
  a[0].slug === 'google/gemini-2.0-flash-exp:free' || a.some((p) => p.slug === 'google/gemini-2.0-flash-exp:free')
    ? ok('وما بقي مجانيًّا يبقى كما هو') : bad('المفضَّل الحيّ أُسقط', a.map((p) => p.slug).join(' | '));

  const r = retiredFrom('OpenRouter ردّ بخطأ (404): This model is unavailable for free. The paid version is available now - use this slug instead: deepseek/deepseek-chat-v3');
  r && r.paid === 'deepseek/deepseek-chat-v3' ? ok('ردُّ «لم يعد مجانيًّا» يُفهَم — ولا مدفوعَ يُشغَّل') : bad('فهم الردّ', JSON.stringify(r));
  retiredFrom('OpenRouter ردّ بخطأ (429): rate limited') === null ? ok('و٤٢٩ ليس تقاعدًا') : bad('٤٢٩ عُدَّ تقاعدًا');
  retire('deepseek/deepseek-chat-v3.1:free');
  const n2 = await resolvePicks('normalize');
  !n2.some((p) => p.slug === 'deepseek/deepseek-chat-v3.1:free') ? ok('المتقاعدُ لا يُجرَّب ثانية') : bad('متقاعدٌ عاد');

  retiredFrom('OpenRouter ردّ بخطأ (403): x:free is only available on agentic harnesses.')?.why === 'harness'
    ? ok('و«للأدوات البرمجية فقط» تقاعدٌ فلا يُجرَّب غدًا') : bad('٤٠٣ الأدوات');

  globalThis.fetch = async () => { throw new Error('offline'); };
  store.delete('rabih:free-models:v2');
  const off = await resolvePicks('normalize');
  off.length >= 2 && off.every((p) => p.slug.endsWith(':free'))
    ? ok('وبلا قائمةٍ حيّة يعود إلى الثابت فلا يُكسَر ما كان') : bad('انقطاع القائمة أسقط كل شيء', off.length);
  globalThis.fetch = saved;
  delete globalThis.localStorage;
}

console.log('\n' + (fails.length ? `فشل ${fails.length}:\n` + fails.map((f) => ' - ' + f).join('\n') : '✅ نجحت كل الاختبارات'));
process.exit(fails.length ? 1 : 0);
