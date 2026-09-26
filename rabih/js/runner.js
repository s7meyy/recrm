// تشغيل خطوات خط التحليل آليًّا عبر OpenRouter.
//
// والقواعد التي يقوم عليها:
//
// 1. **لا يُبتلَع خطأ**: كل خطوة تُعيد ما جرى — أي نموذجٍ شُغِّل، وكم حاول،
//    ولماذا فشل. ولا تُكتب إجابةٌ فارغة على أنها نجاح.
// 2. **البديل عند الحدّ**: النماذج المجانية لها حدّ يومي، فإذا ردّ النموذج
//    بـ٤٢٩ جُرِّب الذي يليه في `MODEL_PICKS` — وهي مرتّبة بالأفضلية أصلًا.
// 3. **الاختراع يوقف الخطوة**: إن جاء في الإجابة معرّفٌ لا وجود له في بياناتك
//    أُعيدت بنموذجٍ آخر مرّةً واحدة، فإن تكرّر وقف ورُفع الأمر إليك. وقبول
//    إجابةٍ مخترِعة آليًّا يهدم الميثاق كلّه.
// 4. **التتابع لا التوازي**: النماذج المجانية تُحدّ بالطلبات في الدقيقة،
//    والتوازي يستنزف الحدّ فيُفشل ما كان سينجح.

import { STEPS, MODEL_PICKS, batchCount, promptNormalizeBatch, promptMergeNormalized, splitBatches } from './prompts.js';
import { resolvePicks, retire, retiredFrom } from './catalog.js';
import { verify } from './verify.js';

/** نداءٌ واحد لنموذجٍ واحد، يُسلّم النصّ قطعةً قطعةً كما يصل. */
export async function callModel(model, prompt, { onChunk, signal } = {}) {
  /* **عطبُ الشبكة يُعاد لا يُرمى.**
     كان `fetch` وقراءةُ البثّ بلا حارس، فانقطاعُ الإنترنت يخرج استثناءً من
     `callModel` ثم من `runStep` إلى الواجهة: لا رسالةَ للمستخدم، **ولا
     يعمل البديلُ من النماذج أصلًا** — وهو موجودٌ لهذا بعينه. جُرِّبت ثلاث
     حالات (شبكة ساقطة، وبثّ ينقطع في منتصفه، وجسمٌ فارغ) فرمت ثلاثتها. */
  let res;
  try {
    res = await fetch('/api/model', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model, prompt }),
      signal,
    });
  } catch (e) {
    // الإلغاءُ بطلب المستخدم ليس عطبًا، ولا يُجرَّب له بديل.
    if (e?.name === 'AbortError') throw e;
    return { ok: false, status: 0, network: true, error: `تعذّر الوصول إلى الخادم (${e?.message || 'انقطاع'}).` };
  }

  if (!res.ok) {
    let data = {};
    try { data = await res.json(); } catch { /* ليس JSON */ }
    return {
      ok: false,
      status: res.status,
      rateLimited: res.status === 429 || !!data.rateLimited,
      needsKey: !!data.needsKey,
      error: data.error || `تعذّر النداء (${res.status}).`,
    };
  }

  if (!res.body) return { ok: false, status: res.status, network: true, error: 'جاء ردٌّ بلا محتوى.' };

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const piece = decoder.decode(value, { stream: true });
      text += piece;
      if (onChunk) onChunk(piece, text);
    }
  } catch (e) {
    if (e?.name === 'AbortError') throw e;
    /* انقطاعٌ في منتصف البثّ: ما وصل ناقصٌ بالضرورة، ولا يُسلَّم نصفُ تحليلٍ
       على أنه تحليل. ويُعاد ما وصل ليُعرَض للمستخدم لا ليُبنى عليه. */
    return { ok: false, status: 0, network: true, partial: text.trim(), error: `انقطع البثّ قبل تمامه (${e?.message || 'انقطاع'}).` };
  }
  return { ok: true, text: text.trim(), model: res.headers.get('x-rabih-model') || model };
}

/**
 * خطوة واحدة: يُجرَّب لها نموذجٌ بعد نموذج حتى تنجح أو تنفد البدائل.
 *
 * @returns {{ok, text?, model?, attempts, error?, needsKey?, invented?}}
 */
export async function runStep(stepKey, state, { onChunk, onModel, signal } = {}) {
  const step = STEPS.find((s) => s.key === stepKey);
  if (!step) return { ok: false, attempts: [], error: 'خطوة غير معروفة.' };

  /* لا تُشغَّل خطوةٌ ينقص ما تعتمد عليه: رسالتها تُبنى بعبارةٍ نائبة
     «(يُلصَق هنا)»، فيجيب النموذج عن فراغٍ إجابةً تبدو سليمة. */
  const missing = STEPS.filter((x) => x.stage < step.stage && !(state.out?.[x.key] || '').trim());
  if (missing.length) {
    return {
      ok: false,
      attempts: [],
      error: `تنقص خطواتٌ قبلها: ${missing.map((m) => m.title).join('، ')}. شغّلها أولًا — وإلا حلّل النموذجُ فراغًا.`,
    };
  }

  /* التوحيد على دفعات حين تكثر التعليقات: نافذة النموذج المجاني تضيق عن مئات
     التعليقات، وتجاوزها صامتٌ — يقتطع ما زاد ويجيب كأنه قرأ الكل. */
  const total = step.role === 'normalize' ? batchCount(state.place?.reviews?.length || 0) : 1;
  if (total > 1) return runBatched(step, state, total, { onChunk, onModel, signal });

  // والدمج يُقسَّم مثلها: مخرجات ثلاثة نماذج مضروبةً في عدد الدفعات لا تسعها
  // رسالةٌ واحدة — قسّمتُ التوحيد ونسيت الدمج، فكانت رسالته تبلغ ٥٤ ألف حرف.
  if (step.role === 'mergeNormalized') {
    const parts = batchCount(state.place?.reviews?.length || 0);
    if (parts > 1) return runMergeBatched(step, state, parts, { onChunk, onModel, signal });
  }

  let prompt;
  try { prompt = step.build(state); }
  catch (e) { return { ok: false, attempts: [], error: 'تعذّر بناء الرسالة: ' + e.message }; }
  if (!prompt || !prompt.trim()) return { ok: false, attempts: [], error: 'الرسالة فارغة — أكمل ما قبلها.' };

  /* الترشيحُ حيٌّ: ما نفضّله إن بقي مجانيًّا، وإلا قريبُه، وإلا أفضلُ المتاح اليوم. */
  const picks = await resolvePicks(step.role);
  if (!picks.length) return { ok: false, attempts: [], error: 'لا نموذجَ مجانيًّا متاحًا اليوم في قائمة OpenRouter — ولا يُشغَّل مدفوعٌ بلا إذنك. افتح باب «النماذج التي ستُجرَّب اليوم» لتأذن بالمدفوع إن شئت.' };
  const attempts = [];

  for (const pick of picks) {
    if (signal?.aborted) return { ok: false, attempts, error: 'أُوقف بأمرك.' };
    if (onModel) onModel(pick);

    let r = await callModel(pick.slug, prompt, { onChunk, signal });
    /* انقطاعُ البثّ عابرٌ عند المزوّد أكثر مما هو عند النموذج: تُعاد المحاولةُ
       مرةً بعد مهلةٍ قبل هجره. أمّا ٤٢٩ فحدٌّ بلغه هذا النموذج، والبديلُ أولى. */
    if (!r.ok && r.network && !retiredFrom(r.error) && !signal?.aborted) {
      await new Promise((res) => setTimeout(res, 2500));
      r = await callModel(pick.slug, prompt, { onChunk, signal });
    }

    if (!r.ok) {
      attempts.push({ model: pick.name, error: r.error });
      if (r.needsKey) return { ok: false, attempts, error: r.error, needsKey: true };
      if (retiredFrom(r.error)) retire(pick.slug);   // لم يعد مجانيًّا: لا يُجرَّب ثانيةً
      if (r.rateLimited) continue;             // البديل
      if (signal?.aborted) return { ok: false, attempts, error: 'أُوقف بأمرك.' };
      continue;                                 // خطأ عابر: يُجرَّب البديل أيضًا
    }
    if (!r.text) { attempts.push({ model: pick.name, error: 'ردّ فارغ.' }); continue; }

    /* لا يُقبَل اختراعٌ ولا تحريف: معرّفٌ لا وجود له في بياناتك، أو اقتباسٌ
       غُيِّر نصُّه — ومن لطّف ذمًّا فقد زوّر شهادة صاحبه. */
    const v = verify(r.text, state.place);
    if (v.badIds.length) {
      attempts.push({ model: pick.name, error: `اخترع معرّفات: ${v.badIds.join('، ')}` });
      continue;
    }
    if (v.misquotes?.length) {
      attempts.push({ model: pick.name, error: `غيّر نصّ اقتباس: «${v.misquotes[0]}»` });
      continue;
    }

    attempts.push({ model: pick.name, ok: true, score: v.score, level: v.level });
    return { ok: true, text: r.text, model: pick.name, slug: pick.slug, attempts, verdict: v };
  }

  const invented = attempts.every((a) => /اخترع|غيّر نصّ/.test(a.error || ''));
  return {
    ok: false,
    attempts,
    invented,
    error: invented
      ? 'كل النماذج المتاحة اخترعت معرّفًا أو غيّرت نصّ اقتباس — ولا يُقبَل ذلك. راجع الخطوة بنفسك.'
      : 'تعذّرت الخطوة بعد تجربة كل البدائل: ' + attempts.map((a) => `${a.model} (${a.error})`).join('، '),
  };
}

/**
 * خطوة توحيدٍ مقسَّمة على دفعات: تُشغَّل كلٌّ على حدة ثم تُوصَل مخرجاتها.
 *
 * ولا تُبتَر النتيجة عند فشل دفعة: الخطوة كلها تفشل ويُقال أي دفعةٍ سقطت،
 * لأن توحيدًا ناقصًا يبدو تامًّا أخطرُ من توحيدٍ لم يتمّ.
 */
async function runBatched(step, state, total, { onChunk, onModel, signal } = {}) {
  /* الترشيحُ حيٌّ: ما نفضّله إن بقي مجانيًّا، وإلا قريبُه، وإلا أفضلُ المتاح اليوم. */
  const picks = await resolvePicks(step.role);
  if (!picks.length) return { ok: false, attempts: [], error: 'لا نموذجَ مجانيًّا متاحًا اليوم في قائمة OpenRouter — ولا يُشغَّل مدفوعٌ بلا إذنك.' };
  const parts = [];
  const attempts = [];
  let whole = '';

  for (let i = 0; i < total; i += 1) {
    if (signal?.aborted) return { ok: false, attempts, error: 'أُوقف بأمرك.' };
    const prompt = promptNormalizeBatch(state.place, state.ctx, i, total);
    let done = null;

    for (const pick of picks) {
      if (signal?.aborted) return { ok: false, attempts, error: 'أُوقف بأمرك.' };
      if (onModel) onModel({ ...pick, name: `${pick.name} — دفعة ${i + 1} من ${total}` });

      const head = `\n\n---\n## دفعة ${i + 1} من ${total}\n`;
      const r = await callModel(pick.slug, prompt, {
        signal,
        onChunk: (piece) => { whole += piece; if (onChunk) onChunk(piece, whole); },
      });

      if (!r.ok) {
        attempts.push({ model: pick.name, batch: i + 1, error: r.error });
        if (r.needsKey) return { ok: false, attempts, error: r.error, needsKey: true };
        if (retiredFrom(r.error)) retire(pick.slug);
        continue;
      }
      if (!r.text) { attempts.push({ model: pick.name, batch: i + 1, error: 'ردّ فارغ.' }); continue; }

      const v = verify(r.text, state.place);
      const wrong = v.badIds.length
        ? `اخترع معرّفات: ${v.badIds.join('، ')}`
        : (v.misquotes?.length ? `غيّر نصّ اقتباس: «${v.misquotes[0]}»` : '');
      if (wrong) {
        attempts.push({ model: pick.name, batch: i + 1, error: wrong });
        whole = parts.join('');                 // يُمحى ما بثّه المخترِع
        if (onChunk) onChunk('', whole);
        continue;
      }
      done = (i ? head : '') + r.text;
      parts.push(done);
      whole = parts.join('');
      if (onChunk) onChunk('', whole);
      attempts.push({ model: pick.name, batch: i + 1, ok: true, score: v.score });
      break;
    }

    if (!done) {
      return {
        ok: false,
        attempts,
        invented: attempts.some((a) => /اخترع/.test(a.error || '')),
        error: `سقطت الدفعة ${i + 1} من ${total} بعد تجربة كل النماذج — والتوحيد الناقص لا يُقبَل.`,
      };
    }
  }

  const text = parts.join('');
  const v = verify(text, state.place);
  const used = attempts.filter((a) => a.ok).map((a) => a.model);
  return {
    ok: true,
    text,
    model: [...new Set(used)].join(' + '),
    batches: total,
    attempts,
    verdict: v,
  };
}

/**
 * دمج التوحيد على دفعات: تُدمَج مخرجات النماذج الثلاثة **لكل دفعة على حدة**،
 * ثم تُوصَل. فتبقى كل رسالةٍ في حدود ما تحتمله النافذة، ولا يُدمَج ما لا يلتقي.
 */
async function runMergeBatched(step, state, parts, { onChunk, onModel, signal } = {}) {
  /* الترشيحُ حيٌّ: ما نفضّله إن بقي مجانيًّا، وإلا قريبُه، وإلا أفضلُ المتاح اليوم. */
  const picks = await resolvePicks(step.role);
  if (!picks.length) return { ok: false, attempts: [], error: 'لا نموذجَ مجانيًّا متاحًا اليوم في قائمة OpenRouter — ولا يُشغَّل مدفوعٌ بلا إذنك.' };
  const cols = ['n1', 'n2', 'n3'].map((k) => splitBatches(state.out?.[k] || '', parts));
  const out = [];
  const attempts = [];
  let whole = '';

  for (let i = 0; i < parts; i += 1) {
    if (signal?.aborted) return { ok: false, attempts, error: 'أُوقف بأمرك.' };

    const slice = { ...state.place, reviews: state.place.reviews.slice(i * 60, i * 60 + 60) };
    const prompt = promptMergeNormalized(slice, state.ctx, cols.map((c) => c[i] || ''));
    let done = null;

    for (const pick of picks) {
      if (signal?.aborted) return { ok: false, attempts, error: 'أُوقف بأمرك.' };
      if (onModel) onModel({ ...pick, name: `${pick.name} — دمج الدفعة ${i + 1} من ${parts}` });

      const r = await callModel(pick.slug, prompt, {
        signal,
        onChunk: (piece) => { whole += piece; if (onChunk) onChunk(piece, whole); },
      });
      if (!r.ok) {
        attempts.push({ model: pick.name, batch: i + 1, error: r.error });
        if (r.needsKey) return { ok: false, attempts, error: r.error, needsKey: true };
        if (retiredFrom(r.error)) retire(pick.slug);
        continue;
      }
      if (!r.text) { attempts.push({ model: pick.name, batch: i + 1, error: 'ردّ فارغ.' }); continue; }

      const v = verify(r.text, state.place);
      const wrong = v.badIds.length
        ? `اخترع معرّفات: ${v.badIds.join('، ')}`
        : (v.misquotes?.length ? `غيّر نصّ اقتباس: «${v.misquotes[0]}»` : '');
      if (wrong) {
        attempts.push({ model: pick.name, batch: i + 1, error: wrong });
        whole = out.join('');
        if (onChunk) onChunk('', whole);
        continue;
      }
      done = (i ? `\n\n---\n## دفعة ${i + 1} من ${parts}\n` : '') + r.text;
      out.push(done);
      whole = out.join('');
      if (onChunk) onChunk('', whole);
      attempts.push({ model: pick.name, batch: i + 1, ok: true, score: v.score });
      break;
    }
    if (!done) {
      return { ok: false, attempts, error: `سقط دمج الدفعة ${i + 1} من ${parts} بعد تجربة كل النماذج.` };
    }
  }

  const text = out.join('');
  const used = [...new Set(attempts.filter((a) => a.ok).map((a) => a.model))];
  return { ok: true, text, model: used.join(' + '), batches: parts, attempts, verdict: verify(text, state.place) };
}

/** ترتيب التشغيل: خطوةٌ خطوة، ولا تبدأ مرحلةٌ قبل تمام ما قبلها. */
export function pendingSteps(out) {
  return STEPS.filter((s) => !(out?.[s.key] || '').trim()).map((s) => s.key);
}
