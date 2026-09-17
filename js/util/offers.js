/**
 * **العروضُ المقدَّمة على العقار** (المرحلة ٤٩).
 *
 * مراحلُ العميل خمس: جديد ← تمّ التواصل ← **مهتمّ/تفاوض** ← أُبرمت ← مغلق. وبين الثالثة
 * والرابعة يقع كلُّ عملِ الوسيط الحقيقيّ: **عرضٌ قُدّم بمبلغ، وردٌّ من المالك، وعرضٌ
 * مقابل، ومهلةٌ تنتهي** — وكان هذا كلُّه ملاحظاتٍ نصّيّة.
 *
 * فلا يُعرف: كم عرضًا قُدّم على هذا العقار؟ وبكم؟ ومتى؟ ومن رفض؟ — **وهي أصدقُ إشارةٍ
 * عن سعرٍ لا يمشي، أصدقُ من أيّ تقدير**. وتاريخُ العروض المرفوضة على عقارٍ هو أقوى ما
 * تُقنع به مالكًا متمسّكًا بسعره: لا رأيَك، بل أرقامَ من رفضوه.
 *
 * دوالُّ خالصة: لا تخزين ولا DOM.
 */

/**
 * حالاتُ العرض. و«انتهت مهلته» حالةٌ قائمةٌ بذاتها لا رفضٌ: المشتري لم يسحب عرضَه —
 * **المالكُ هو الذي لم يردّ**، والفرقُ بينهما هو الفرقُ بين لوم السوق ولوم البائع.
 */
export const OFFER_STATUSES = [
  { key: 'open', label: 'قائم', cls: 'badge-accent' },
  { key: 'accepted', label: 'قُبل', cls: 'badge-ok' },
  { key: 'rejected', label: 'رُفض', cls: 'badge-danger' },
  { key: 'expired', label: 'انتهت مهلته', cls: 'badge-warn' },
];

const BY_KEY = Object.fromEntries(OFFER_STATUSES.map((s) => [s.key, s]));

/** الحالةُ بمفتاحها — والمجهولةُ تُردّ إلى «قائم»: عرضٌ سُجّل ولم يُقل عن مصيره شيء. */
export const offerStatus = (key) => BY_KEY[key] || BY_KEY.open;

const num = (v) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : null);

/**
 * خلاصةُ العروض على عقار.
 *
 * `best` **أعلى مبلغٍ عُرض مهما كان مصيرُه**: المرفوضُ الأعلى هو بيت القصيد في الحوار
 * مع المالك. و`bestRejected` يفصله وحده، و`gap` الفرقُ بينه وبين السعر المطلوب —
 * `null` إن لم يكن للعقار سعرٌ مكتوب، فلا تُقاس مسافةٌ إلى نقطةٍ مجهولة.
 *
 * @returns {{ rows, total, open, accepted, rejected, expired, best, bestRejected, gap, gapPct, last }}
 */
export function offerSummary(property) {
  const rows = (property?.offers || [])
    .map((o) => ({ ...o, amount: num(o.amount), status: offerStatus(o.status).key }))
    // الأحدثُ أوّلًا، وما لا تاريخ له في الآخر — فلا يتقدّم المجهولُ على المعلوم.
    .sort((a, b) => (a.at ? 0 : 1) - (b.at ? 0 : 1) || String(b.at || '').localeCompare(String(a.at || '')));

  const count = (key) => rows.filter((r) => r.status === key).length;
  const amounts = rows.map((r) => r.amount).filter((a) => a != null);
  const rejectedAmounts = rows.filter((r) => r.status === 'rejected').map((r) => r.amount).filter((a) => a != null);
  const best = amounts.length ? Math.max(...amounts) : null;
  const bestRejected = rejectedAmounts.length ? Math.max(...rejectedAmounts) : null;
  const price = num(property?.price);
  const gap = best != null && price != null ? price - best : null;
  const gapPct = gap != null && price > 0 ? Math.round((gap / price) * 1000) / 10 : null;

  return {
    rows,
    total: rows.length,
    open: count('open'),
    accepted: count('accepted'),
    rejected: count('rejected'),
    expired: count('expired'),
    best,
    bestRejected,
    gap,
    gapPct,
    last: rows[0] || null,
  };
}

/**
 * جملةٌ تُقال للمالك — **من أرقامٍ لا من رأي**.
 * تُعاد `''` لعقارٍ بلا عروض: سطرٌ فارغٌ أصدقُ من «لا عروض بعد» في عقارٍ عُرض أمس.
 */
export function ownerTalkingPoint(summary, { formatSAR, countOf } = {}) {
  if (!summary?.total) return '';
  const money = formatSAR || ((n) => String(n));
  const count = countOf || ((n, w) => `${n} ${w}`);
  const parts = [`قُدّم على العقار ${count(summary.total, 'عرض')}`];
  if (summary.rejected) parts.push(`رُفض منها ${count(summary.rejected, 'عرض')}`);
  if (summary.bestRejected != null) parts.push(`وأعلى مرفوضٍ ${money(summary.bestRejected)}`);
  else if (summary.best != null) parts.push(`وأعلاها ${money(summary.best)}`);
  if (summary.gap != null && summary.gap > 0) {
    parts.push(`أي أقلّ من المطلوب بـ${money(summary.gap)}${summary.gapPct != null ? ` (${summary.gapPct}٪)` : ''}`);
  }
  return `${parts.join('، ')}.`;
}
