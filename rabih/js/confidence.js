// مقياس الثقة — رقمٌ واحد يقول لصاحب التقرير كم يزن ما بين يديه.
//
// المنصّة تحسب ستّ إشارات متفرّقة ولا أحد يجمعها، فيخرج تقريرٌ من ثمانية تعليقات
// بنبرة تقريرٍ من مئتين. وهذا أمانةٌ مع العميل قبل أن يكون ميزة.
//
// كل مكوّناته محسوب برمجيًّا؛ لا نموذج يُستشار ولا رقم يُقدَّر.

import { stats } from './schema.js';
import { recentVsOlder } from './recency.js';
import { scan } from './anomaly.js';
import { verify } from './verify.js';
import { audit } from './completeness.js';
import { checkSource, exclusionNote } from './integrity.js';
import { wilson, pretty as ciPretty } from './interval.js';
import { sampleBias } from './bias.js';

/** درجة خطّية بين حدّين، مقصوصة في [0,1]. */
const ramp = (v, lo, hi) => {
  if (v === null || v === undefined || Number.isNaN(v)) return null;
  if (hi === lo) return v >= hi ? 1 : 0;
  return Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
};

const pct = (x) => Math.round(x * 100);

/**
 * @param {object} job التقرير كاملًا (place + out + reportMd)
 * @returns {{score:number, level:'قوية'|'متوسطة'|'ضعيفة', parts:Array, summary:string, caveats:string[]}}
 */
export function score(job) {
  const place = job?.place || {};
  const s = stats(place);
  const parts = [];
  const caveats = [];

  // ١) حجم العيّنة: عشرة تعليقات حدُّ الكفاية الأدنى، وأربعون تُريح.
  const sizeScore = ramp(s.total, 5, 40);
  parts.push({
    key: 'size', name: 'حجم العيّنة', weight: 3, score: sizeScore,
    detail: `${s.total} تعليقًا`,
  });
  if (s.total < 10) caveats.push(`العيّنة ${s.total} تعليقًا فقط — الاستنتاجات محدودة الدلالة.`);

  // ٢) نسبتها من إجمالي تقييمات قوقل.
  // التغطية تُقاس على المنصوصة متى عُرفت: «٤٠ من ٨٧» لا «٤٠ من ٣١٠».
  const covBase = s.textCoverage ?? s.coverage;
  const covScore = covBase === null ? null : ramp(covBase, 2, 25);
  parts.push({
    key: 'coverage', name: 'نسبة العيّنة', weight: 2, score: covScore,
    // المقام الصحيح المنصوصة إن عُرفت: الصامتة لا تُحلَّل فلا تُحسَب علينا.
    detail: s.textCoverage !== null
      ? `${s.textCoverage}% من ${s.declaredWithText} منصوصة`
      : (s.coverage === null ? 'إجمالي التقييمات غير مُدخَل' : `${s.coverage}% من ${s.googleCount}`),
  });
  if (s.coverage === null) caveats.push('إجمالي تقييمات قوقل غير مُدخَل — لا يُعرف قدر ما فات.');
  else if (s.textCoverage === null) caveats.push(`العيّنة ${s.coverage}% من الإجمالي — وأكثره تقييماتٌ صامتة بلا نصّ لا تُحلَّل، فأدخل عدد المنصوصة ليصحّ المقام.`);
  else if (covBase < 5) caveats.push(`العيّنة ${covBase}% من التعليقات المنصوصة — قد لا تمثّلها.`);

  /* هامش الخطأ: نسبٌ من عيّنةٍ صغيرة تُقرأ أحكامًا، وبينهما فرق. */
  const pop = job?.place?.ratings?.withText || s.googleCount || null;
  const ci = s.total ? wilson(Math.max(1, s.negative), s.total, pop) : null;
  if (ci) {
    caveats.push(ci.wide
      ? `هامش الخطأ واسع: نسبةٌ في هذه العيّنة تحمل ±${ci.margin} نقطة — فالنسب مؤشّرات لا قياسات.`
      : `هامش الخطأ نحو ±${ci.margin} نقطة لكل نسبة.`);
  }

  /* الانحياز: عيّنةٌ لا تشبه المُعلَن تُفسد كل نسبةٍ بُنيت عليها. */
  const bias = sampleBias(job?.place);
  if (bias && bias.verdict !== 'ممثِّلة') {
    caveats.push(`عيّنتك ${bias.verdict}: توزيعها يفارق المُعلَن في قوقل بـ${Math.abs(bias.negGap)} نقطة في السلبي.`);
  }

  // ٣) تغطية التواريخ: بلا تواريخ لا قراءة زمنية.
  const rec = recentVsOlder(place);
  const dated = s.total ? (s.total - rec.undated) / s.total : null;
  parts.push({
    key: 'dates', name: 'تغطية التواريخ', weight: 2, score: dated,
    detail: dated === null ? '—' : `${pct(dated)}% مؤرَّخة`,
  });
  if (dated !== null && dated < 0.5) caveats.push('أكثر من نصف التعليقات بلا تاريخ مفهوم — الحكم الزمني ناقص.');

  // ٤) سلامة العيّنة من الإشارات المريبة.
  const an = scan(place);
  const cleanScore = s.total ? Math.max(0, 1 - (an.ratio / 100) * 1.5) : null;
  parts.push({
    key: 'clean', name: 'سلامة العيّنة', weight: 2, score: cleanScore,
    detail: an.flagged.length ? `${an.flagged.length} تعليقًا يحمل إشارة` : 'لا إشارات',
  });
  if (an.level === 'err') caveats.push(an.summary);

  // ٥) سند التقرير: نسبة الأحكام المسنودة.
  const text = (job?.reportMd || job?.out?.am || '').trim();
  const v = text ? verify(text, place) : null;
  parts.push({
    key: 'cited', name: 'سند الأحكام', weight: 3, score: v ? v.score / 100 : null,
    detail: v ? `${v.score}% مسنودة` : 'لا تقرير بعد',
  });
  if (v?.badIds?.length) caveats.push(`${v.badIds.length} معرّفًا لا وجود له في التقرير — راجعه قبل التسليم.`);

  // ٦) اكتمال التقرير: هل ذكر ما رُصد؟
  const a = text ? audit(text, place) : null;
  parts.push({
    key: 'complete', name: 'اكتمال التقرير', weight: 2, score: a ? a.coverage / 100 : null,
    detail: a ? `${a.coverage}% من المرصود مذكور` : 'لا تقرير بعد',
  });
  if (a?.missedAlerts?.length) caveats.push(`${a.missedAlerts.length} إنذارًا زمنيًّا لم يُذكر في التقرير.`);

  // المتوسط موزون بالأهمية، والإشارة الغائبة تُسقَط ولا تُحسَب صفرًا:
  // «غير معلوم» ليس «سيّئًا»، وعدّه سيّئًا يظلم تقريرًا لم يُكتب بعد.
  const known = parts.filter((p) => p.score !== null);
  const totalWeight = known.reduce((x, p) => x + p.weight, 0);
  const raw = totalWeight ? known.reduce((x, p) => x + p.score * p.weight, 0) / totalWeight : 0;
  const final = pct(raw);

  const level = final >= 70 ? 'قوية' : (final >= 45 ? 'متوسطة' : 'ضعيفة');

  const bits = [`${s.total} تعليقًا`];
  if (s.coverage !== null) bits.push(`${s.coverage}% من ${s.googleCount} تقييمًا`);
  if (dated !== null) bits.push(`${pct(dated)}% مؤرَّخة`);
  if (v) bits.push(`${v.score}% من الأحكام مسنودة`);

  return {
    score: final,
    level,
    parts,
    caveats,
    measured: known.length,
    total: parts.length,
    summary: `ثقة ${level} (${final}%) — مبنيّ على ${bits.join('، ')}.`,
  };
}

/** كتلة تُوضَع في صدر التقرير المطبوع. */
/**
 * إقرار أمانة النقل — يُطبَع في التقرير الذي يصل العميل، لا في شاشةٍ عندك.
 *
 * فالقارئ من حقّه أن يعرف: هل النصوص كما كُتبت؟ وهل استُبعد شيء؟ وكم تعليقًا
 * بلا تقييم؟ وإخفاء ذلك — ولو بحسن نيّة — يجعل التقرير أدقّ شكلًا وأكذب معنًى.
 */
function honesty(job) {
  const place = job?.place || {};
  const reviews = place.reviews || [];
  const esc2 = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const lines = [];

  const chk = checkSource(place, job?.rawPaste || '');
  if (chk.checked) {
    lines.push(chk.ok
      ? `نصوص التعليقات مطابقة لمصدرها حرفًا بحرف (${chk.verbatim} من ${reviews.length} فُحصت بالمقارنة).`
      : `<b>تنبيه: ${chk.altered} تعليقًا لا يطابق نصُّه المصدر.</b>`);
  }
  if (chk.unverifiable) {
    lines.push(`${chk.unverifiable} تعليقًا جاء من جلبٍ آلي أو بلا نصّ، فلا مصدر نصّي لمقارنته.`);
  }

  const unrated = reviews.filter((r) => r.rating === null).length;
  if (unrated) lines.push(`${unrated} تعليقًا بلا عدد نجوم — نصُّه محلَّل، ولا يدخل متوسط العيّنة ولا توزيعها.`);

  const note = exclusionNote(job?.excluded || []);
  if (note) lines.push(`<b>${esc2(note)}</b>`);

  lines.push('لم يُعدَّل نصّ تعليق ولا تقييمه، ولم يُحذف شيء تلقائيًّا — والسلبي منقولٌ كما ورد.');

  return `<div class="honesty"><b>أمانة النقل</b><ul>${lines.map((l) => `<li>${l}</li>`).join('')}</ul></div>`;
}

export function block(job) {
  const c = score(job);
  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const tone = c.level === 'قوية' ? 'up' : (c.level === 'ضعيفة' ? 'down' : '');

  const bars = c.parts.filter((p) => p.score !== null).map((p) => `
    <div class="conf-row">
      <span class="conf-name">${esc(p.name)}</span>
      <span class="conf-track"><span class="conf-fill" style="width:${pct(p.score)}%"></span></span>
      <span class="conf-val">${esc(p.detail)}</span>
    </div>`).join('');

  return `<section class="confidence">
    <h2 class="no-count">مقياس الثقة في هذا التقرير</h2>
    <div class="conf-head ${tone}">
      <span class="conf-score">${c.score}%</span>
      <span class="conf-level">ثقة ${esc(c.level)}</span>
    </div>
    <div class="conf-bars">${bars}</div>
    ${c.caveats.length ? `<div class="alerts"><b>ما ينبغي أن يُقرأ معه</b><ul>${
      c.caveats.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
    <p class="fine">المقياس محسوب من البيانات نفسها: حجم العيّنة، ونسبتها من إجمالي التقييمات، وتغطية تواريخها، وسلامتها من الإشارات المريبة، ونسبة الأحكام المسنودة بمعرّفات، واكتمال التقرير مقابل ما رُصد.</p>
    ${honesty(job)}
  </section>`;
}
