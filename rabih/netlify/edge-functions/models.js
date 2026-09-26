// قائمةُ النماذج المتاحة اليوم — تُقرأ من OpenRouter لا تُحفَظ في الشيفرة.
//
// كانت أسماءُ النماذج المجانية محفورةً في `prompts.js`، فلمّا أوقف OpenRouter
// نسخها المجانية توقّف خطُّ التحليل كلُّه عند أول خطوة: «تعذّرت بعد تجربة كل
// البدائل»، والبدائلُ الثلاثة ميتةٌ معًا. والقائمةُ المجانية تتبدّل كل بضعة
// أسابيع، فما يُحفَر اليوم يموت غدًا.
//
// فتُقرأ القائمةُ من مصدرها عند الحاجة، وتُصفّى إلى ما سعرُه صفر، وتُخبَّأ ساعةً.
// والمفتاحُ لا يلزم لهذه القراءة، لكنه يُرسَل إن وُجد كي تطابق القائمةُ حسابك.

const ENDPOINT = 'https://openrouter.ai/api/v1/models';
const TTL = 60 * 60 * 1000;

let cache = { at: 0, body: null };

export default async () => {
  const now = Date.now();
  if (cache.body && now - cache.at < TTL) {
    return new Response(cache.body, { headers: { 'content-type': 'application/json; charset=utf-8', 'x-rabih-cache': 'hit' } });
  }

  const key = (Deno.env.get('OPENROUTER_KEY') || '').trim();
  let upstream;
  try {
    upstream = await fetch(ENDPOINT, { headers: key ? { authorization: `Bearer ${key}` } : {} });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'تعذّر الوصول إلى OpenRouter: ' + (e?.message || '') }), { status: 502, headers: { 'content-type': 'application/json; charset=utf-8' } });
  }
  if (!upstream.ok) {
    return new Response(JSON.stringify({ error: `OpenRouter ردّ بخطأ (${upstream.status})` }), { status: 502, headers: { 'content-type': 'application/json; charset=utf-8' } });
  }

  let data;
  try { data = (await upstream.json())?.data || []; } catch { data = []; }

  const isFree = (m) => m?.pricing && Number(m.pricing.prompt) === 0 && Number(m.pricing.completion) === 0;
  /* **نصٌّ يدخل ونصٌّ يخرج** — لا غير. القائمةُ المجانية فيها ما يُولّد موسيقى
     أو صورًا (Lyria، وأشباهها)، وقد رُشِّح أحدُها لتوحيد التعليقات فانقطع
     البثّ. فيُشترط أن يقبل نصًّا ويُخرج نصًّا، بالحقلين الحديثين أو بالقديم. */
  const isText = (m) => {
    const a = m?.architecture || {};
    const ins = a.input_modalities, outs = a.output_modalities;
    if (Array.isArray(ins) && Array.isArray(outs)) return ins.includes('text') && outs.includes('text');
    const mod = String(a.modality || '');
    return mod === '' ? true : /(^|\+)text(\+|->)/.test(mod) && /->.*text/.test(mod);
  };
  const free = data.filter((m) => isFree(m) && isText(m)).map((m) => ({
    id: m.id,
    name: m.name || m.id,
    context: Number(m.context_length) || 0,
    text: true,
  })).sort((a, b) => b.context - a.context);

  const body = JSON.stringify({ at: new Date(now).toISOString(), count: free.length, free });
  cache = { at: now, body };
  return new Response(body, { headers: { 'content-type': 'application/json; charset=utf-8', 'x-rabih-cache': 'miss' } });
};

export const config = { path: '/api/models' };
