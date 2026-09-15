// الاتصال في وقته، ومن لا يحضر (المرحلة ٣٥).
//
// `bestTime` يُسأل عنه في نموذج العميل ويُحفظ ويُعرض **شارةً** — ولا شيء يستعمله. فقائمة
// «يومي» لا تعرف أن الساعة الثامنة مساءً وأن خمسةً من هؤلاء كتبتَ عنهم «يفضّل مساءً».
// وهذه تجعل الترتيب يعرف: من وقتُه الآن أولًا، ومن ليس وقته يبقى في مكانه بشارةٍ هادئة —
// **لا يُخفى**، فقد تكون مكالمتُك عاجلة، والقرار قرارك.
//
// ومعها عدّاد «لم يحضر»: من أخلف موعدين يستحق أن تعرف قبل أن تقطع نصف الرياض إليه ثالثةً.
//
// دوال خالصة: لا تخزين ولا شبكة.

/** حدود الفترات بالساعة (٢٤): الصباح [٦،١٢)، وبعد الظهر [١٢،١٧)، والمساء [١٧،٢٢). */
export const WINDOWS = {
  morning: [6, 12],
  afternoon: [12, 17],
  evening: [17, 22],
};

/** الفترة التي تقع فيها ساعة معيّنة، أو null خارج الفترات الثلاث (بعد العاشرة وقبل السادسة). */
export function windowAt(now = Date.now()) {
  const hour = new Date(now).getHours();
  for (const [key, [from, to]] of Object.entries(WINDOWS)) {
    if (hour >= from && hour < to) return key;
  }
  return null;
}

/**
 * هل الآن وقتُه؟
 * @returns {'now'|'later'|'unknown'} `unknown` لمن لا تفضيل له — فلا يُقدَّم ولا يُؤخَّر.
 */
export function callFit(client, now = Date.now()) {
  const pref = client?.bestTime;
  if (!pref || !WINDOWS[pref]) return 'unknown';
  const current = windowAt(now);
  if (!current) return 'later'; // خارج ساعات الاتصال كلّها: لا أحد وقته الآن
  return current === pref ? 'now' : 'later';
}

/**
 * ترتيب قائمة اتصال بوقت اليوم — **يُقدَّم من وقتُه الآن، ولا يُؤخَّر أحد**.
 *
 * وهذا القيد مقصود: اللوحات تعرض ثمانية من قائمةٍ أطول، فلو أُخِّر من «ليس وقته» لسقط من
 * المعروض — وقد يكون أشدّ الناس تأخّرًا وأحقّهم بمكالمة. فالتفضيل إشارةٌ لا تُلغي إلحاحًا:
 * من وقتُه الآن يُرفع، ومن عداه يبقى على ترتيبه الذي حسبته اللوحة.
 *
 * والترتيب **مستقرّ**: المتساوون يبقون على ترتيبهم الأصلي.
 *
 * @param {Array} rows الصفوف
 * @param {(row) => object} pick دالة تستخرج العميل من الصف
 */
export function orderByCallTime(rows = [], pick = (r) => r?.client, now = Date.now()) {
  return rows
    .map((row, i) => ({ row, i, now: callFit(pick(row), now) === 'now' }))
    .sort((a, b) => (Number(b.now) - Number(a.now)) || (a.i - b.i))
    .map((x) => x.row);
}

/**
 * من أخلف مواعيده: عدد مرّات «لم يحضر» لكل عميل.
 * @returns {Map<string, number>} لا تُذكر فيها إلا من له مرّة فأكثر.
 */
export function noShowCounts(showings = []) {
  const map = new Map();
  for (const s of showings) {
    if (s?.status !== 'no_show' || !s.clientId) continue;
    map.set(s.clientId, (map.get(s.clientId) || 0) + 1);
  }
  return map;
}
