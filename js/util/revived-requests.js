// طلبات عادت (المرحلة ٣٥): أدفأ اسمٍ عندك، وكان مخفيًّا.
//
// صفحة المطابقات ترشّح الطلبات بـ`status === 'active'` وحدها. فالعميل الذي طلب فلّةً في
// النرجس قبل ثمانية أشهر، فأوقفتَ طلبه لأنك لم تجد له، **لا يُخطرك النظام أبدًا** حين
// تُدخل اليوم فلّةً في النرجس بمواصفاته.
//
// وهو أدفأ اسمٍ في قاعدتك كلّها: عرفتَه، وتعرف ميزانيته وحيّه، ووثق بك مرّة. لا يحتاج
// إعلانًا ولا وسيطًا — يحتاج مكالمة.
//
// **وثلاثة قيود تمنعها أن تصير ضجيجًا:**
//   ١) **مخزونٌ جديد فقط**: عرضٌ كان موجودًا يوم أغلقتَ الطلب ليس خبرًا — قد تكون عرضتَه
//      عليه ورفضه. فلا يُحتسب إلا ما دخل مخزونك **بعد** إغلاق الطلب.
//   ٢) **نافذة زمنية**: طلبٌ مضى عليه عامان صاحبُه اشترى غالبًا. الافتراض اثنا عشر شهرًا.
//   ٣) **درجةٌ أعلى من عتبة المطابقة المعتادة**: تتصل بمن أغلقتَ طلبه بعرضٍ ممتاز لا
//      بعرضٍ مقبول. وإلا صارت المكالمة إزعاجًا يفسد ما بقي من ثقة.
//
// دالة خالصة: تأخذ سياق المطابقة الجاهز ولا تلمس التخزين.

import { candidatesFor } from '../data/matching.js';

const DAY = 86400000;

/**
 * الحالة الوحيدة التي تُوقَظ: **«موقوف»**.
 *
 * وحالات الطلب ثلاث: `active` له صفحة المطابقات، و`done` **صفقةٌ تمّت** فلا يُوقَظ صاحبها
 * (اشترى وانتهى، ومكالمةٌ تعرض عليه ما اشتراه مثله إساءة)، و`paused` هو الموقوف الذي لم
 * يجد — وهو وحده من ينتظر.
 */
export const REVIVABLE_STATUSES = ['paused'];

/**
 * @param {{ requests, ctx, now, withinMonths, minScore, includeExternal }} input
 *   `ctx` سياق المطابقة من `loadMatchingContext`.
 * @returns {Array<{ request, candidates, best, closedAt, monthsAgo }>} مرتَّبة بالأعلى درجة.
 */
export function revivedRequests({
  requests = [], ctx = null, now = Date.now(),
  withinMonths = 12, minScore = 70, includeExternal = false,
} = {}) {
  if (!ctx) return [];
  const since = now - withinMonths * 30 * DAY;
  const out = [];

  for (const request of requests) {
    if (!REVIVABLE_STATUSES.includes(request?.status)) continue;
    // وقت الإيقاف أقرب ما نملك: آخر تعديلٍ على الطلب هو الذي أوقفه.
    const closedAt = new Date(request.updatedAt || request.createdAt || 0).getTime();
    if (!Number.isFinite(closedAt) || closedAt < since) continue;

    // المرشّح لا يُحتسب إلا إن دخل المخزون بعد الإغلاق — وإلا فليس بجديد عليه.
    const candidates = candidatesFor(request, ctx, { minScore, includeExternal })
      .filter((c) => {
        const at = new Date(c.listing?.createdAt || 0).getTime();
        return Number.isFinite(at) && at > closedAt;
      });
    if (!candidates.length) continue;

    out.push({
      request,
      candidates,
      best: candidates[0],
      closedAt,
      monthsAgo: Math.max(0, Math.round((now - closedAt) / (30 * DAY))),
    });
  }

  return out.sort((a, b) => (b.best?.score || 0) - (a.best?.score || 0));
}
