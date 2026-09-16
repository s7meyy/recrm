// تقريرُ نشاطٍ للمالك (المرحلة ٤٨).
//
// «ماذا فعلتم لعقاري؟» سؤالُ المالك كلَّ شهر، **وجوابُه عندك كاملًا** — متفرّقًا في خمسة
// مواضع: كم مرّةً فُتحت صفحةُ عرضه، وكم معاينةً جرت وما انطباعُ كلٍّ منها، وكم طلبًا
// طابقه ومن رفضه ولماذا، ورحلةُ سعره، ومتى نُشر. **ولا ورقةَ تجمعه**، فجوابُك اليوم كلامٌ
// في الهاتف يُنسى قبل أن يُقفل الخطّ.
//
// وتقريرُ المقارنة السوقيّة (CMA) يجيب سؤالًا آخر: **بكم يُعرض؟** لا: **ماذا جرى له؟**
//
// **وأصدقُ ما في هذه الورقة أنّها تُظهر الصمتَ أيضًا**: «لا معاينةَ منذ ٤٠ يومًا» جملةٌ
// تفتح حديثَ خفض السعر خيرًا من أن تبدأه أنت — وهي في صالح الطرفين.

import { propertyEvidence, priceDrops } from './property-evidence.js';

const DAY = 86400000;

/** كم يومًا مضى على آخر معاينةٍ تمّت — و`null` إن لم تجرِ معاينةٌ قطّ. */
function daysSinceLastShowing(showings, now) {
  const times = showings
    .filter((s) => s.status === 'done' && s.at)
    .map((s) => new Date(s.at).getTime())
    .filter(Number.isFinite);
  if (!times.length) return null;
  return Math.floor((now - Math.max(...times)) / DAY);
}

/**
 * **ما جرى لهذا العقار** في مدّةٍ بعينها.
 *
 * @param {number|null} o.views مشاهداتُ صفحة العرض — و`null` **حين لا تصل من الخادم**،
 *   فتُقال «غير متاحة» ولا تُكتب صفرًا. وصفرٌ مكذوبٌ في ورقةٍ تُسلَّم بيد المالك أسوأُ من
 *   فراغٍ مُعلَّل: يقرؤه إهمالًا منك.
 * @param {number} o.days نافذةُ التقرير — ثلاثون يومًا افتراضًا، وهي دورةُ سؤاله.
 */
export function ownerActivity({
  property, showings = [], matches = [], views = null, days = 30, now = Date.now(),
} = {}) {
  const id = property?.id;
  const since = now - days * DAY;
  const inWindow = (iso) => {
    const t = new Date(iso || '').getTime();
    return Number.isFinite(t) && t >= since && t <= now;
  };

  const mine = id ? showings.filter((s) => s.propertyId === id) : [];
  const windowShowings = mine.filter((s) => inWindow(s.at));
  const evidence = propertyEvidence({ property, showings, matches, now });
  const drops = priceDrops(property);

  const quietDays = daysSinceLastShowing(mine, now);
  return {
    days,
    // كلُّ الوقت وما في النافذة معًا: المالكُ يسأل عن الشهر، ويطمئنّ بمجموع الشهور.
    showings: {
      window: windowShowings.length,
      total: mine.length,
      done: mine.filter((s) => s.status === 'done').length,
      noShow: mine.filter((s) => s.status === 'no_show').length,
      upcoming: mine.filter((s) => s.status === 'scheduled' && new Date(s.at).getTime() > now).length,
    },
    impressions: evidence.showings,
    reasons: evidence.allReasons,
    // ولا يُبنى حكمٌ على عيّنةٍ صغيرة — الحدُّ نفسُه المستعمل في لوحة الأدلّة.
    reasonsEnough: evidence.enough,
    opinions: evidence.opinions,
    matched: id ? matches.filter((m) => m.propertyId === id).length : 0,
    views,
    daysListed: evidence.daysListed,
    priceDrops: drops,
    // **الصمتُ خبر**: لا معاينةَ منذ كذا، أو لا معاينةَ قطّ منذ الإدراج.
    quietDays,
    silent: quietDays == null ? (evidence.daysListed ?? 0) >= days : quietDays >= days,
  };
}

/**
 * جملةٌ واحدةٌ تصف الحال — تُطبع في رأس التقرير فيُقرأ قبل الجداول.
 *
 * **ولا تُجمّل ولا تُقسّي**: تقول ما وقع بعدده، وتقول الصمتَ صمتًا.
 */
export function activityHeadline(activity, { countOf, daysWord }) {
  if (!activity) return '';
  const s = activity.showings;
  if (s.window > 0) {
    return `جرت ${countOf(s.window, 'معاينة')} خلال ${daysWord(activity.days)}`
      + (s.upcoming ? `، و${countOf(s.upcoming, 'موعد')} قادمة.` : '.');
  }
  if (activity.quietDays != null) {
    return `لا معاينةَ منذ ${daysWord(activity.quietDays)} — وآخرُ ما جرى قبل ذلك.`;
  }
  return activity.daysListed != null
    ? `لم تجرِ معاينةٌ واحدةٌ منذ إدراجه قبل ${daysWord(activity.daysListed)}.`
    : 'لم تجرِ معاينةٌ بعد.';
}
