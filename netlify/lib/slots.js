// توليد أوقات الحجز المتاحة (المرحلة ٢٩).
//
// **الخادم وحده يولّد الأوقات ويقبلها.** الصفحة العامة تعرض ما يعطيها ولا تحسب شيئًا:
// لو حسبت المتصفح لأمكن حجز وقتٍ خارج دوامك بتعديل الصفحة. والقبول يتحقّق من أن الوقت
// المطلوب **من نفس المجموعة المولَّدة** لا من شكله فقط.
//
// والتوقيت كله بتوقيت الرياض (UTC+3) بلا مكتبة: المملكة لا تطبّق توقيتًا صيفيًا، فالإزاحة
// ثابتة — وهذا يُذكر هنا لأن أي تغيّر في ذلك يُبطل الحساب.

const OFFSET_MINUTES = 180; // UTC+3
const DAY = 86400000;

const pad = (n) => String(n).padStart(2, '0');

/** دقائق من منتصف الليل من نصّ «HH:MM»، أو null. */
export function minutesOf(text) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(text || '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** لحظة UTC من يوم محلي (بتوقيت الرياض) ودقائقه. */
function utcFor(localMidnightUtc, minutes) {
  return localMidnightUtc + minutes * 60000;
}

/** منتصف ليل اليوم المحلي الذي تقع فيه لحظة `ms`، معبَّرًا عنه بلحظة UTC. */
function localMidnight(ms) {
  const shifted = ms + OFFSET_MINUTES * 60000;
  const dayStart = Math.floor(shifted / DAY) * DAY;
  return dayStart - OFFSET_MINUTES * 60000;
}

/** رقم يوم الأسبوع محليًا (الأحد ٠). */
function localDow(ms) {
  return new Date(ms + OFFSET_MINUTES * 60000).getUTCDay();
}

/** نصّ اليوم «YYYY-MM-DD» والوقت «HH:MM» محليًا — للعرض لا للحساب. */
export function localParts(ms) {
  const d = new Date(ms + OFFSET_MINUTES * 60000);
  return {
    date: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`,
    time: `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`,
    dow: d.getUTCDay(),
  };
}

export const DAY_NAMES = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

/**
 * كل الأوقات المتاحة ضمن الأفق، ناقصةً المحجوز.
 *
 * @param {object} booking إعدادات الحجز كما نُشرت
 * @param {string[]} taken لحظات ISO محجوزة
 * @returns {[{ iso, date, time, dow, dayLabel }]}
 */
/**
 * أوقاتُك المشغولة كما تصل من النشرة (المرحلة ٤٧) — طوابعُ زمنيّةٌ لا غير.
 *
 * **والعطبُ الذي تُصلحه:** صفحةُ الحجز كانت تستبعد ما حُجز **عبرها وحدها**، ومواعيدُك
 * المسجَّلة في التطبيق لا يراها الخادم إطلاقًا (هي في متصفّح جهازك). فيحجز عميلٌ الخامسةَ
 * الثلاثاء وعندك معاينةٌ في الخامسة الثلاثاء، **ويصلك الاثنان**.
 *
 * **والتداخلُ لا التطابق:** معاينةٌ في ٥:١٥ لا تساوي بدايةَ فتحةِ ٥:٠٠، لكنّها تشغلها.
 * فيُحسب لكلّ موعدٍ امتدادُه (`minutes`، وافتراضُه ساعة) ويُستبعد ما تقاطع معه.
 * والمحجوزُ عبر الصفحة يبقى على المطابقة التامّة كما كان — فهو يشغل فتحتَه وحدها.
 */
function busyRanges(busy = [], fallbackMinutes = 60) {
  const out = [];
  for (const b of busy) {
    const at = new Date(typeof b === 'string' ? b : b?.at).getTime();
    if (!Number.isFinite(at)) continue;
    const mins = Math.max(5, Math.min(600, Number(typeof b === 'object' ? b?.minutes : 0) || fallbackMinutes));
    out.push([at, at + mins * 60000]);
  }
  return out;
}

export function buildSlots(booking = {}, taken = [], now = Date.now(), busy = []) {
  const from = minutesOf(booking.from) ?? 16 * 60;
  const to = minutesOf(booking.to) ?? 21 * 60;
  const step = Math.max(10, Math.min(240, Math.round(Number(booking.slotMinutes) || 30)));
  const days = Array.isArray(booking.days) && booking.days.length ? booking.days.map(Number) : [0, 1, 2, 3, 4];
  const horizon = Math.max(1, Math.min(60, Math.round(Number(booking.horizonDays) || 14)));
  const lead = Math.max(0, Number(booking.leadHours) || 0) * 3600000;
  if (to <= from) return [];

  const bookedExact = new Set(taken.map((t) => new Date(t).getTime()).filter(Number.isFinite));
  const ranges = busyRanges(busy, Math.max(step, Number(booking.visitMinutes) || 60));
  const out = [];
  const firstMidnight = localMidnight(now);

  for (let d = 0; d < horizon; d++) {
    const midnight = firstMidnight + d * DAY;
    if (!days.includes(localDow(midnight))) continue;
    for (let m = from; m + step <= to; m += step) {
      const at = utcFor(midnight, m);
      if (at - now < lead) continue; // مهلة الإشعار: لا يُحجز عليك موعد بعد دقائق
      if (bookedExact.has(at)) continue;
      // الفتحةُ [at, at+step) تُستبعد إن تقاطعت مع أيّ موعدٍ لك.
      if (ranges.some(([a, b]) => at < b && a < at + step * 60000)) continue;
      const parts = localParts(at);
      out.push({ iso: new Date(at).toISOString(), ...parts, dayLabel: DAY_NAMES[parts.dow] });
    }
  }
  return out;
}

/** هل هذا الوقت من المجموعة المولَّدة فعلًا؟ (شرط القبول) */
export function slotAllowed(iso, booking, taken, now = Date.now(), busy = []) {
  const target = new Date(iso).getTime();
  if (!Number.isFinite(target)) return false;
  return buildSlots(booking, taken, now, busy).some((s) => new Date(s.iso).getTime() === target);
}
