// شهادة السوق على عقارٍ واحد (المرحلة ٣٥): لماذا لا يُباع؟
//
// النظام يسأل بعد كل معاينة «ما رأيه؟» ويحفظ الجواب وسببه، ويسأل عند رفض المطابقة «لماذا؟»
// ويحفظه كذلك. **ثم لا يعرض ذلك مجموعًا على العقار أبدًا** — تُستدعى `showingStats` في
// مكانٍ واحد من المشروع كلّه (الداشبورد) على المعاينات كلّها مجتمعة، فتقول لك كيف تعمل
// أنت، ولا تقول لك ما عيبُ هذه الفلّة.
//
// وهذا يجمعها للعقار الواحد. وفائدته ليست تقريرًا يُقرأ: هي **المحادثة مع المالك**.
// رأيُك وحدك أن سعره مرتفع جدالٌ بين رأيين؛ وأن تقول «تسعة من اثني عشر قالوا السعر مرتفع»
// شهادةُ سوقٍ لا تُردّ. ولذلك تُطبع في تقرير المالك.
//
// **وفصلٌ لا بدّ منه بين شهادتين:**
//   • **من رآه ثم قال** — يحكم على العقار نفسه: حالته، غرفه، رائحته، شارعه.
//   • **من رفض قبل أن يراه** — يحكم على **إعلانك**: سعرك المكتوب، صورك، وصفك.
// وخلطهما يضيّع الدلالة: عشرة رفضوا السعر قبل المعاينة تعني أن الرقم يطرد الناس من الباب،
// وعشرة رأوه ثم قالوا «مرتفع» تعني أن العقار لا يساوي رقمه. والعلاج مختلف.
//
// دوال خالصة: لا تخزين ولا شبكة.

const DAY = 86400000;

/** أدنى عدد آراء يُعطى عنده حكم. ثلاثةٌ ليست سوقًا، لكنها أول ما يُلتفت إليه. */
export const MIN_SAMPLE = 3;

/** حصّة السبب الواحد التي تجعله «الاعتراض الغالب» لا مجرّد أكثرها ورودًا. */
export const DOMINANT_SHARE = 0.5;

const tally = (rows, key) => {
  const map = new Map();
  for (const r of rows) {
    const k = r?.[key];
    if (k) map.set(k, (map.get(k) || 0) + 1);
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
};

/**
 * شهادة السوق على عقار واحد.
 *
 * @param {{ property, showings, matches, now }} input
 *   `showings` و`matches` كل ما في المخزن — تُرشَّح هنا بمعرّف العقار، فلا يحتاج المستدعي
 *   أن يعرف كيف تُربط.
 * @returns {{
 *   showings: { booked, done, noShow, liked, maybe, disliked },
 *   seenReasons: [[key, count]],   أسباب من رأى ثم لم يعجبه
 *   unseenReasons: [[key, count]], أسباب من رفض قبل أن يرى
 *   allReasons: [[key, count]],    مجموعهما — للحكم الغالب
 *   opinions: number,              عدد الآراء المسجَّلة كلّها
 *   dominant: { key, count, share } | null,
 *   enough: boolean,               هل بلغت العيّنة حدّ الحكم
 *   daysListed: number | null,
 *   priceDrops: number,
 * }}
 */
export function propertyEvidence({ property, showings = [], matches = [], now = Date.now() } = {}) {
  const id = property?.id;
  const mine = id ? showings.filter((s) => s.propertyId === id) : [];
  const done = mine.filter((s) => s.status === 'done');

  // من رأى ثم لم يعجبه: شهادةٌ على العقار.
  const seen = done.filter((s) => s.impression === 'disliked' && s.reason);

  // من رفض المطابقة ولم يحضر معاينةً لهذا العقار: شهادةٌ على الإعلان.
  const attended = new Set(done.map((s) => s.clientId).filter(Boolean));
  const unseen = (id ? matches.filter((m) => m.propertyId === id) : [])
    .filter((m) => m.status === 'not_interested' && m.rejectReason && !attended.has(m.clientId));

  const seenReasons = tally(seen, 'reason');
  const unseenReasons = tally(unseen, 'rejectReason');

  const merged = new Map();
  for (const [k, n] of seenReasons) merged.set(k, (merged.get(k) || 0) + n);
  for (const [k, n] of unseenReasons) merged.set(k, (merged.get(k) || 0) + n);
  const allReasons = [...merged.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));

  // الآراء = كل من أبدى رأيًا في هذا العقار (أحبّه أو تردّد أو رفضه، رآه أو لم يره).
  const opinions = done.filter((s) => s.impression).length + unseen.length;
  const total = allReasons.reduce((sum, [, n]) => sum + n, 0);
  const top = allReasons[0] || null;
  const dominant = top && total > 0 && top[1] / total >= DOMINANT_SHARE
    ? { key: top[0], count: top[1], share: top[1] / total }
    : null;

  const listedAt = property?.agreementSignedAt || property?.createdAt;
  const listedMs = listedAt ? new Date(listedAt).getTime() : NaN;

  return {
    showings: {
      booked: mine.length,
      done: done.length,
      noShow: mine.filter((s) => s.status === 'no_show').length,
      liked: done.filter((s) => s.impression === 'liked').length,
      maybe: done.filter((s) => s.impression === 'maybe').length,
      disliked: done.filter((s) => s.impression === 'disliked').length,
    },
    seenReasons,
    unseenReasons,
    allReasons,
    opinions,
    dominant,
    enough: opinions >= MIN_SAMPLE,
    daysListed: Number.isFinite(listedMs) ? Math.max(0, Math.floor((now - listedMs) / DAY)) : null,
    priceDrops: priceDrops(property).length,
  };
}

/**
 * التخفيضات وحدها من تاريخ السعر — والارتفاع ليس تخفيضًا (وقد يقع: مالكٌ رفع سعره).
 * @returns {Array<{ at, from, to, cut }>} `cut` نسبة التخفيض (٠–١).
 */
export function priceDrops(property) {
  const history = Array.isArray(property?.priceHistory) ? property.priceHistory.filter((h) => h?.at) : [];
  const sorted = [...history].sort((a, b) => String(a.at).localeCompare(String(b.at)));
  const out = [];
  for (let i = 1; i < sorted.length; i++) {
    const from = Number(sorted[i - 1].price);
    const to = Number(sorted[i].price);
    if (!Number.isFinite(from) || !Number.isFinite(to) || from <= 0 || to >= from) continue;
    out.push({ at: sorted[i].at, from, to, cut: (from - to) / from });
  }
  return out;
}

/**
 * هل ينفع التخفيض معك؟ — من تاريخك أنت لا من قاعدةٍ عامة (المرحلة ٣٥، البند أ٤).
 *
 * `priceHistory` يُكتب في كل تغيير سعر منذ زمن، ولا يُقرأ إلا داخل حسابات السعر. وفيه
 * جوابٌ لا يملكه غيرك: **كم يومًا بِعتَ بعد التخفيض، وأي نسبة تخفيضٍ هي التي باعت؟**
 * فتكفّ عن اقتراح خمسة بالمئة وأنت تعرف أن ما باع عندك كان اثني عشر.
 *
 * والقاعدة الصادقة هنا: **لا تُنسب صفقة إلى تخفيضٍ جاء بعدها.** يُؤخذ آخر تخفيضٍ سبق
 * الصفقة، وما بعده لا شأن له بها.
 *
 * @returns {{ sold, soldAfterCut, medianDays, medianCut, sample }}
 *   `sample` عدد الصفقات التي دخلت الحساب — ودونه لا يُعرض رقم.
 */
export function discountEffect({ properties = [], deals = [] } = {}) {
  const byProperty = new Map();
  for (const d of deals) {
    if (!d?.propertyId || !d.date) continue;
    const at = new Date(d.date).getTime();
    if (!Number.isFinite(at)) continue;
    // الأقدم صفقةً لكل عقار: البيعة الأولى هي التي أنهت التسويق.
    const prev = byProperty.get(d.propertyId);
    if (!prev || at < prev) byProperty.set(d.propertyId, at);
  }

  const rows = [];
  let sold = 0;
  for (const p of properties) {
    const dealAt = byProperty.get(p?.id);
    if (!Number.isFinite(dealAt)) continue;
    sold++;
    const before = priceDrops(p)
      .map((c) => ({ ...c, ms: new Date(c.at).getTime() }))
      .filter((c) => Number.isFinite(c.ms) && c.ms <= dealAt);
    if (!before.length) continue;
    const last = before[before.length - 1];
    rows.push({ days: Math.max(0, Math.round((dealAt - last.ms) / DAY)), cut: last.cut });
  }

  return {
    sold,
    soldAfterCut: rows.length,
    medianDays: median(rows.map((r) => r.days)),
    medianCut: median(rows.map((r) => r.cut)),
    sample: rows.length,
  };
}

function median(nums) {
  const arr = nums.filter(Number.isFinite).sort((a, b) => a - b);
  if (!arr.length) return null;
  const mid = Math.floor(arr.length / 2);
  return arr.length % 2 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2;
}
