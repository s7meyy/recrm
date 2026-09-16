// معيار الرسائل — تحويل جودة الميثاق من ظنٍّ إلى رقم.
//
// `tools/eval-prompts.mjs` مبنيٌّ ولم يُشغَّل قطّ، وهو أداة سطرِ أوامر تحتاج
// مفتاحًا في يد مشغّلها. وهذه نسختُه داخل المنصّة: تُشغَّل بزرّ، وتنادي
// النماذج عبر الدالّة الخادمية نفسها، وتقيس إجاباتها بمخرجٍ مرجعي.
//
// **وقيمته أنه اختبار انحدار**: أيّ تعديلٍ في الرسائل بعده يُكشَف أثره
// بالرقم لا بالظنّ. وبلا هذا تبقى جودة الرسائل ظنًّا مهما كثرت الاختبارات
// البرمجية — فتلك تفحص شيفرتنا لا استجابة النماذج.

import { promptNormalize, promptAnalyze, MODEL_PICKS } from './prompts.js';
import { verify } from './verify.js';
import { callModel } from './runner.js';
import { emptyPlace, emptyReview, assignReviewIds, stats } from './schema.js';

/** حالةٌ ثابتة: لا تتغيّر بين تشغيلين، فالدرجات قابلة للمقارنة عبر الزمن. */
export function fixture() {
  const p = emptyPlace();
  p.identity.name = 'مقهى المعيار';
  p.identity.category = 'مقهى';
  p.ratings = { average: 4.2, count: 240, withText: 60, distribution: {} };
  const rows = [
    [5, 'القهوة ممتازة والباريستا محترف، والمكان هادئ للعمل', 'قبل أسبوع'],
    [2, 'انتظرت ٢٥ دقيقة على طلب بسيط، والموظف لم يعتذر', 'قبل أسبوعين'],
    [4, 'المكان جميل والأسعار معقولة لكن المواقف قليلة', 'قبل شهر'],
    [1, 'الطلب وصل بارد والخدمة سيئة، لن أعيد التجربة', 'قبل شهرين'],
    [5, 'أفضل كوفي في الحي، الحلى طازج والجلسات مريحة', 'قبل ٣ أيام'],
    [3, 'عادي، لا مميز ولا سيئ. الأسعار مرتفعة قليلًا', 'قبل ٤ أشهر'],
    [2, 'الزحمة في المساء لا تطاق والانتظار طويل', 'قبل ١٠ أيام'],
    [5, 'الموظفين ذوقهم عالي والنظافة ممتازة', 'قبل شهر'],
  ];
  p.reviews = rows.map(([rating, text, date]) => ({ ...emptyReview(), rating, text, date, source: 'paste' }));
  assignReviewIds(p);
  return p;
}

export const CTX = { cityName: 'الرياض', categoryName: 'مقهى', districtName: 'العليا' };

/**
 * درجةُ مخرجٍ واحد. والاختراع فاتلٌ مهما حسُن ما سواه: إجابةٌ تخترع معرّفًا
 * أو تُحرّف اقتباسًا مرفوضةٌ ولو استوفت كل شيء.
 */
export function grade(output, place) {
  const v = verify(output, place);
  const fatal = v.badIds.length > 0 || (v.misquotes?.length || 0) > 0 || v.numberIssues.length > 0;

  const cited = v.claims ? Math.round((v.cited / v.claims) * 100) : 0;
  const coverage = v.coverage;
  const total = fatal ? 0 : Math.round(cited * 0.6 + Math.min(coverage, 100) * 0.4);

  return {
    total,
    fatal,
    verdict: fatal ? 'مرفوض' : (total >= 70 ? 'مقبول' : 'ضعيف'),
    cited,
    coverage,
    invented: v.badIds.length,
    misquoted: v.misquotes?.length || 0,
    badNumbers: v.numberIssues.length,
    chars: output.length,
    summary: v.summary,
  };
}

/**
 * يشغّل المعيار: لكل نموذجٍ مرحلتان.
 * @param {(msg:string)=>void} onProgress
 */
export async function runEval({ models = null, onProgress = null, signal = null } = {}) {
  const place = fixture();
  const picks = models || [...new Set([...MODEL_PICKS.normalize, ...MODEL_PICKS.analyze].map((m) => m.slug))].slice(0, 3);
  const rows = [];

  for (const slug of picks) {
    for (const [stage, build] of [
      ['التوحيد', () => promptNormalize(place, CTX)],
      ['التحليل', () => promptAnalyze('', place, CTX)],
    ]) {
      if (signal?.aborted) return { rows, place, stopped: true };
      if (onProgress) onProgress(`${slug} · ${stage}…`);

      const r = await callModel(slug, build(), { signal });
      if (!r.ok) {
        rows.push({ model: slug, stage, error: r.error, needsKey: r.needsKey });
        if (r.needsKey) return { rows, place, needsKey: true };
        continue;
      }
      rows.push({ model: slug, stage, ...grade(r.text, place) });
    }
  }

  const scored = rows.filter((r) => typeof r.total === 'number');
  return {
    rows,
    place,
    at: new Date().toISOString(),
    average: scored.length ? Math.round(scored.reduce((a, r) => a + r.total, 0) / scored.length) : null,
    rejected: scored.filter((r) => r.fatal).length,
    sample: stats(place),
  };
}

const KEY = 'rabih:eval-history';

/** يُحفَظ كل تشغيل، فيُقارَن بما قبله — وهذا هو الانحدار. */
export function saveRun(result) {
  try {
    const hist = history();
    hist.unshift({
      at: result.at,
      average: result.average,
      rejected: result.rejected,
      rows: result.rows.map((r) => ({ model: r.model, stage: r.stage, total: r.total ?? null, verdict: r.verdict || 'خطأ' })),
    });
    localStorage.setItem(KEY, JSON.stringify(hist.slice(0, 20)));
    return true;
  } catch { return false; }
}

export function history() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
}
