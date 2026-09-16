// موصّل OpenRouter — تشغيل خطوات خط التحليل آليًّا بدل النسخ واللصق ثماني مرات.
//
// **لماذا دالّة على الحافة لا دالّة عادية؟** نداء النموذج يستغرق عشرات الثواني،
// وحدّ الدوالّ العادية عشر ثوانٍ. والحافة تبثّ الردّ تدفّقًا، فيصل أوّله في
// ثانية ويبقى المجرى مفتوحًا حتى ينتهي — ويرى المستخدم النموذج يكتب أمامه.
//
// **والمفتاح لا يصل المتصفح**: النداء كلّه هنا، ومفتاح OPENROUTER_KEY في بيئة
// Netlify وحدها.
//
// **ولا يُبدَّل نموذجٌ خفيةً**: ما يُشغَّل فعلًا يُعلَن في ترويسة `x-rabih-model`،
// فتُسجَّل درجته في لوحة الأداء باسمه هو لا باسمٍ طُلب ولم يُستجَب.

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

// سقفٌ يمنع ردًّا لا ينتهي، وهو أوسع من أطول تقرير نحتاجه.
const MAX_TOKENS = 8000;

const err = (msg, status = 400, extra = {}) => new Response(
  JSON.stringify({ error: msg, ...extra }),
  { status, headers: { 'content-type': 'application/json; charset=utf-8' } },
);

export default async (request) => {
  if (request.method !== 'POST') return err('الطريقة غير مدعومة.', 405);

  const key = (Deno.env.get('OPENROUTER_KEY') || '').trim();
  if (!key) {
    return err('لا مفتاح OpenRouter. أضف OPENROUTER_KEY في متغيّرات البيئة على Netlify.', 503, { needsKey: true });
  }
  if (!/^[\x21-\x7e]+$/.test(key)) {
    return err('مفتاح OpenRouter فيه مسافة أو حرف غير لاتيني — انسخه من لوحة المزوّد بلا زيادة.', 400);
  }

  let body;
  try { body = await request.json(); } catch { return err('الطلب ليس JSON.'); }

  const model = String(body?.model || '').trim();
  const prompt = String(body?.prompt || '');
  const temperature = Number.isFinite(body?.temperature) ? body.temperature : 0.2;

  if (!model) return err('لا نموذج.');
  if (!prompt.trim()) return err('لا رسالة.');
  // حدٌّ يحمي من طلبٍ ضخم يُرفَض عند المزوّد بعد استهلاك الوقت.
  if (prompt.length > 400000) return err('الرسالة أكبر من أن تُرسَل (أكثر من ٤٠٠ ألف حرف).');

  let upstream;
  try {
    upstream = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${key}`,
        'content-type': 'application/json',
        'x-title': 'Rabih',
      },
      body: JSON.stringify({
        model,
        stream: true,
        temperature,
        max_tokens: MAX_TOKENS,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
  } catch (e) {
    return err('تعذّر الوصول إلى OpenRouter: ' + (e?.message || ''), 502);
  }

  if (!upstream.ok || !upstream.body) {
    let detail = '';
    try {
      const t = await upstream.text();
      detail = (JSON.parse(t)?.error?.message) || t.slice(0, 200);
    } catch { /* الردّ ليس JSON */ }
    // ٤٢٩ تعني بلوغ حدّ النموذج المجاني: تُعاد كما هي ليُجرَّب البديل.
    return err(`OpenRouter ردّ بخطأ (${upstream.status}): ${detail || 'بلا تفصيل'}`, upstream.status === 429 ? 429 : 502,
      { rateLimited: upstream.status === 429, model });
  }

  /* يُحوَّل تدفّق SSE إلى نصٍّ صِرف: المتصفح يكتبه في المربع كما يصل. */
  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = '';

  const stream = new ReadableStream({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) { controller.close(); return; }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';            // السطر الأخير قد يكون ناقصًا

      for (const line of lines) {
        const s = line.trim();
        if (!s.startsWith('data:')) continue;
        const data = s.slice(5).trim();
        if (data === '[DONE]') { controller.close(); return; }
        try {
          const piece = JSON.parse(data)?.choices?.[0]?.delta?.content;
          if (piece) controller.enqueue(encoder.encode(piece));
        } catch { /* نبضة إبقاءٍ أو جزءٌ غير مكتمل */ }
      }
    },
    cancel() { reader.cancel().catch(() => {}); },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
      'x-rabih-model': model,
    },
  });
};

export const config = { path: '/api/model' };
