// فحص الأمانة: هل نصوص التعليقات كما وردت من مصدرها، حرفًا بحرف؟
//
// الشرط الذي تقوم عليه الأداة: **لا يُعدَّل تعليق ولا تقييم، ولو كان ذمًّا.**
// ونفيُ التحريف وعدٌ، وإثباتُه فحص. فيُقارَن نصّ كل تعليق بالمصدر الذي جاء
// منه: اللصق الأصلي محفوظ كما لُصق (`job.rawPaste`)، فإن لم يوجد نصُّ تعليقٍ
// فيه حرفًا بحرف فذلك خللٌ يُعلَن ولا يُسكَت عنه.
//
// وما جاء من مزوّد أو من قوقل لا مصدر نصّي عندنا نقارنه به، فيُصرَّح بمصدره
// ولا يُدَّعى فحصه — ودعوى فحصٍ لم يقع أسوأ من الإقرار بعدمه.

/** يُزيل ما لا يغيّر النصّ: علامات الاتجاه، وتطبيع الفراغات. */
function canon(s) {
  return String(s || '')
    .replace(/[‎‏‪-‮⁦-⁩]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * @returns {{total, checked, verbatim, altered, unverifiable, bySource, ok, summary, offenders}}
 */
export function checkSource(place, rawPaste = '') {
  const reviews = place?.reviews || [];
  const hay = canon(rawPaste);
  const bySource = {};
  const offenders = [];
  let verbatim = 0;
  let unverifiable = 0;

  for (const r of reviews) {
    const src = r.source || (hay ? 'paste' : '');
    bySource[src || 'غير معروف'] = (bySource[src || 'غير معروف'] || 0) + 1;

    const text = canon(r.text);
    if (!text) { unverifiable += 1; continue; }        // تقييمٌ بلا نصّ: لا شيء يُقارَن

    // ما لم يأتِ من اللصق لا مصدر نصّي عندنا، فلا يُفحَص ولا يُدَّعى فحصه.
    if (src && src !== 'paste') { unverifiable += 1; continue; }
    if (!hay) { unverifiable += 1; continue; }

    if (hay.includes(text)) verbatim += 1;
    else offenders.push({ id: r.id, text: r.text.slice(0, 80) });
  }

  const altered = offenders.length;
  const checked = verbatim + altered;
  const ok = altered === 0;

  return {
    total: reviews.length,
    checked,
    verbatim,
    altered,
    unverifiable,
    bySource,
    ok,
    offenders,
    summary: checked
      ? (ok
        ? `${verbatim} من ${reviews.length} تعليقًا نصُّها مطابقٌ لمصدرك حرفًا بحرف${unverifiable ? `، و${unverifiable} لا مصدر نصّي عندنا لفحصها` : ''}.`
        : `${altered} تعليقًا لا يطابق نصُّه المصدر — وهذا خلل يجب أن يُبحَث قبل التسليم.`)
      : `لا نصّ للمقارنة: ${reviews.length} تعليقًا مصدرها الجلب الآلي أو بلا نصّ.`,
  };
}

/**
 * سطرٌ يُدرَج في التقرير يُقرّ بما استُبعد — إن استُبعد شيء.
 *
 * والاستبعاد لا يمحو: التعليق يُنقَل إلى `job.excluded` ويُعلَن عدده ومعرّفاته
 * في التقرير، فلا يظنّ قارئُه أن العيّنة كاملة وقد نُقِّيت من نقدٍ لم يعجب.
 */
export function exclusionNote(excluded = []) {
  if (!excluded.length) return '';
  const ids = excluded.map((r) => r.id).filter(Boolean).join('، ');
  return `استُبعد من التحليل ${excluded.length} تعليقًا بقرار مُعِدّ التقرير لا تلقائيًّا${ids ? ` (${ids})` : ''}. `
    + 'ونصوصها محفوظة ويمكن إعادتها، ولم يُحذف منها شيء.';
}
