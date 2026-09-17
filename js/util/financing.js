/**
 * **التمويل** (المرحلة ٤٩) — الصفقةُ لا تموت عند السعر، تموت عند البنك.
 *
 * كان النظام كلُّه يخلو من كلمة «تمويل»: بحثٌ في `schema.js` و`deals.js` عن
 * `تمويل|financ|بنك` يعيد صفرًا. والموجودُ حاسبةُ قسطٍ في صفحة التقدير — **رقمٌ يُحسب
 * لزائرٍ، لا حالةٌ تُتابَع لعميلٍ بعينه**. وأكثرُ المشترين في السعودية يشترون بتمويل،
 * والسؤالُ اليوميُّ في كلّ مكتب — «وين وصل تمويله؟» — لم يكن له جوابٌ إلا الملاحظات.
 *
 * وهذا الملفّ **حسابٌ خالص**: لا تخزين ولا شبكة ولا DOM. يقرأ الصفقات ويقول أيُّها
 * وقف عند البنك، وكم مضى عليه.
 */

import { daysWord } from './format.js';

const DAY = 86400000;

/**
 * مراحلُ التمويل مرتَّبةً بترتيب الواقع لا بترتيب الحروف.
 *
 * و`rank` ليس تجميلًا: يُرتَّب به عرضُ الصفقات ويُقاس به التقدّم. و`open` يقول
 * أهي مرحلةٌ ما زالت تنتظر شيئًا من البنك — فالمرفوضُ والمُفرَغ لا ينتظران أحدًا،
 * ولا معنى لتنبيهك عنهما.
 *
 * و**«نقدًا» مرحلةٌ من هذه القائمة** لا حقلٌ ثانٍ: من يشتري نقدًا لا تمويل له،
 * وجعلُها مرحلةً يعني أن سؤالًا واحدًا يكفي في الاستمارة بدل سؤالين.
 */
export const FINANCE_STAGES = [
  { key: 'cash', label: 'نقدًا — بلا تمويل', rank: 0, open: false },
  { key: 'not_applied', label: 'لم يُقدَّم للبنك', rank: 1, open: true },
  { key: 'applied', label: 'قُدّم للبنك', rank: 2, open: true },
  { key: 'preapproved', label: 'موافقةٌ مبدئيّة', rank: 3, open: true },
  { key: 'valuation', label: 'تقييمٌ عقاريّ', rank: 4, open: true },
  { key: 'approved', label: 'موافقةٌ نهائيّة', rank: 5, open: true },
  { key: 'disbursed', label: 'أُفرِغ وصُرف', rank: 6, open: false },
  { key: 'rejected', label: 'رُفض', rank: 7, open: false },
];

/** طريقةُ دفع صاحب الطلب — أقوى مؤهِّلٍ للمشتري، وكان الطلبُ يخلو منه. */
export const PAY_METHODS = [
  { key: 'cash', label: 'نقدًا', rank: 0 },
  { key: 'preapproved', label: 'تمويلٌ معتمَدٌ مسبقًا', rank: 1 },
  { key: 'finance', label: 'يحتاج تمويلًا', rank: 2 },
];

const STAGE_BY_KEY = Object.fromEntries(FINANCE_STAGES.map((s) => [s.key, s]));
const PAY_BY_KEY = Object.fromEntries(PAY_METHODS.map((p) => [p.key, p]));

/** مرحلةُ التمويل بمفتاحها، أو `null` لغير المعروف — ولا يُخترع افتراضٌ صامت. */
export const financeStage = (key) => STAGE_BY_KEY[key] || null;
export const payMethod = (key) => PAY_BY_KEY[key] || null;

/** أما زالت هذه المرحلةُ تنتظر البنك؟ والمجهولةُ لا تنتظر شيئًا: لم يُقل عنها شيءٌ بعد. */
export const isOpenStage = (key) => !!STAGE_BY_KEY[key]?.open;

/**
 * **كم يومًا مضى بلا حركةٍ في التمويل؟** — `null` إن لم يُسجَّل تاريخٌ أصلًا.
 *
 * ويُقاس من `financeAt` (آخرِ تحديثٍ لحالة التمويل) لا من `updatedAt`: تعديلُ ملاحظةٍ
 * في الصفقة ليس حركةً عند البنك، **ولو قِيس به لأسكت التنبيهَ كلَّ مرّةٍ تفتح فيها
 * الصفقةَ وتحفظها** — وهو أسوأُ ما يُصنع بتنبيه.
 */
export function idleDays(deal, now = Date.now()) {
  const at = deal?.financeAt ? new Date(deal.financeAt).getTime() : null;
  if (at == null || !Number.isFinite(at)) return null;
  const days = Math.floor((now - at) / DAY);
  return days < 0 ? 0 : days; // تاريخٌ في المستقبل خطأُ إدخال، لا سالبٌ يُعرض
}

/** الحدُّ الافتراضيُّ لسكوت البنك: أسبوعٌ بلا حركةٍ يستحقّ سؤالًا. */
export const STALL_DAYS = 7;

/**
 * الصفقاتُ التي وقفت عند البنك: مرحلةٌ مفتوحةٌ ومضى عليها أكثرُ من الحدّ.
 *
 * ومن لا تاريخَ له يدخل القائمة أيضًا **بـ`days: null`**: حالةٌ سُجّلت ولم يُعرف
 * متى — وهي أحقُّ بالسؤال لا أقلّ. وترتيبُها: الأطولُ سكوتًا أوّلًا، والمجهولُ آخرًا
 * فلا يتقدّم على معلوم.
 */
export function stalledFinancing(deals = [], { days = STALL_DAYS, now = Date.now() } = {}) {
  return deals
    .filter((d) => isOpenStage(d?.financeStage))
    .map((d) => ({ deal: d, days: idleDays(d, now), stage: financeStage(d.financeStage) }))
    .filter((r) => r.days == null || r.days >= days)
    .sort((a, b) => (a.days == null ? 1 : 0) - (b.days == null ? 1 : 0) || (b.days ?? 0) - (a.days ?? 0));
}

/**
 * خلاصةُ تمويل مجموعةِ صفقات: كم منها نقدًا، وكم ما زال عند البنك، وكم رُفض.
 * `unknown` من لم يُقل عن تمويلها شيء — **وتُعدّ ولا تُخبَّأ**: الصمتُ ليس نقدًا.
 */
export function financeSummary(deals = []) {
  const out = { cash: 0, open: 0, disbursed: 0, rejected: 0, unknown: 0, total: deals.length };
  for (const d of deals) {
    const s = financeStage(d?.financeStage);
    if (!s) out.unknown += 1;
    else if (s.key === 'cash') out.cash += 1;
    else if (s.key === 'rejected') out.rejected += 1;
    else if (s.key === 'disbursed') out.disbursed += 1;
    else out.open += 1;
  }
  return out;
}

/**
 * جملةٌ واحدةٌ تُقرأ تحت الصفقة: أين وصل تمويلُها ومنذ متى.
 * تُعاد `''` لمن لا تمويلَ مذكورٌ لها — **ولا تُكتب «غير معروف»**: سطرٌ فارغٌ أصدقُ
 * من سطرٍ يقول لا شيء.
 */
export function financeLine(deal, { daysWord: wordOf = daysWord, now = Date.now() } = {}) {
  const s = financeStage(deal?.financeStage);
  if (!s) return '';
  const bank = (deal.financeBank || '').trim();
  const head = bank && s.key !== 'cash' ? `${s.label} · ${bank}` : s.label;
  if (!s.open) return head;
  const d = idleDays(deal, now);
  if (d == null) return `${head} — بلا تاريخ`;
  // **ولا صيغةَ احتياطيّةٍ تلصق العددَ بالاسم**: «3 يوم» خطأٌ عربيّ، و`daysWord`
  // هي المعجمُ الوحيد — تُستورَد افتراضًا بدل أن يُخترع بديلٌ أعجميّ عند غيابها.
  const word = wordOf(d);
  return d === 0 ? `${head} — حُدِّث اليوم` : `${head} — منذ ${word}`;
}
