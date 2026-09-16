// المصاريفُ والإيراداتُ المتكرّرة (المرحلة ٤٨).
//
// المهمّةُ لها `repeat` منذ المرحلة ١١، **والمصروفُ والإيرادُ لم يكن لهما**. ورسومُ
// الخدمات والنظافةُ والحارسُ واشتراكُ الإعلان وإيجارُ مكتبك أرقامٌ ثابتةٌ تُعاد كتابتُها
// شهرًا بشهر — أو تُنسى، فيخرج صافي ربحك أعلى ممّا هو، وهو أسوأُ الخطأين.
//
// **ولا يُكتب القيدُ التالي وحده.** يُقترح ويُعتمد بضغطة، لسببين: المبلغُ قد يتغيّر
// (رسمٌ يُزاد، اشتراكٌ يُلغى)، **وقيدٌ يقع في دفترك بلا علمك أسوأُ من قيدٍ يُنسى** —
// فالمنسيُّ تكتشفه وتُضيفه، والواقعُ بلا علمك تبني عليه قرارًا.

/** مفتاحُ الشهر من تاريخٍ نصّيّ — `YYYY-MM` تكفي وتصدُق بلا `new Date`. */
const monthKey = (iso) => String(iso || '').slice(0, 7);

/** الشهرُ الحاليّ بمفتاحه. */
export function currentMonth(now = Date.now()) {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * **ما يُقترح قيدُه هذا الشهر**: كلُّ متكرّرٍ لم يُقيَّد نظيرُه في الشهر المطلوب.
 *
 * والنظيرُ يُعرف بـ **التصنيف والبيان معًا** لا بالمبلغ: المبلغُ قد يتغيّر وهو المصروفُ
 * نفسُه، والبيانُ هو اسمُه عندك. ومن كتب بيانين مختلفين لشيءٍ واحدٍ يراهما اقتراحين —
 * وذلك أصدقُ من دمجٍ يُخمَّن.
 *
 * **ويُؤخذ أحدثُ نسخةٍ من كلّ متكرّر** مبلغًا: آخرُ ما دفعتَه أقربُ إلى ما ستدفعه.
 *
 * @returns {[{ from, draft }]} `from` السجلُّ المصدر، و`draft` القيدُ المقترَح
 */
export function dueRecurring(rows = [], { month = currentMonth(), now = Date.now() } = {}) {
  const key = String(month).slice(0, 7);
  const byName = new Map();
  for (const r of rows) {
    if (!r?.repeatMonthly) continue;
    const name = `${r.category || 'other'}|${String(r.note || '').trim()}`;
    const prev = byName.get(name);
    if (!prev || String(r.date || '') > String(prev.date || '')) byName.set(name, r);
  }

  const posted = new Set();
  for (const r of rows) {
    if (monthKey(r.date) !== key) continue;
    posted.add(`${r.category || 'other'}|${String(r.note || '').trim()}`);
  }

  const out = [];
  for (const [name, from] of byName) {
    if (posted.has(name)) continue;
    // ولا يُقترح متكرّرٌ لشهرٍ **قبل** أوّل مرّةٍ سُجِّل فيها: لم يكن قائمًا بعد.
    if (monthKey(from.date) > key) continue;
    out.push({ from, draft: nextEntry(from, key) });
  }
  return out.sort((a, b) => String(a.draft.note).localeCompare(String(b.draft.note), 'ar'));
}

/**
 * القيدُ التالي من قيدٍ سابق — **بتاريخ اليوم نفسِه من الشهر المطلوب**.
 *
 * ورسمٌ يُدفع في الخامس يبقى في الخامس. وما كان في الحادي والثلاثين يقع على آخر أيّام
 * شهرٍ أقصر بدل أن يقفز إلى الشهر الذي بعده.
 */
export function nextEntry(from, month) {
  const [y, m] = String(month).split('-').map(Number);
  const src = new Date(from?.date || Date.now());
  const day = Number.isFinite(src.getDate()) ? src.getDate() : 1;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const at = new Date(Date.UTC(y, m - 1, Math.min(day, lastDay), 12));
  return {
    date: at.toISOString(),
    amount: from?.amount ?? null,
    category: from?.category || 'other',
    note: from?.note || '',
    propertyId: from?.propertyId || null,
    clientId: from?.clientId || null,
    source: from?.source || '',
    repeatMonthly: true,
  };
}
