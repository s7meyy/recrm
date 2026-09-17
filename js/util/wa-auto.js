/**
 * **نافذةُ الأربع والعشرين ساعة، والردُّ التلقائيّ** (المرحلة ٥٠).
 *
 * قاعدةُ واتساب التي تحكم الصفحةَ كلَّها: **المكتبُ لا يبدأ رسالةً حرّة**. يبدؤها بقالبٍ
 * تعتمده Meta ويُحاسَب عليه. فإن ردّ العميلُ انفتحت **نافذةُ خدمةٍ مدّتها أربعٌ وعشرون
 * ساعة** من آخر رسالةٍ له، يُراسَل فيها بنصٍّ حرٍّ بلا قالبٍ ولا كلفةِ قالب.
 *
 * وكانت الصفحةُ لا تقول هذا ولا تعرضه: صندوقُ واردٍ يُقرأ ولا يُردّ عليه، **ومن أراد
 * الردّ فتح واتساب في جهازه**. وأسوأُ من ذلك أنّ النافذة تُغلق بصمت — فتفتح الصفحةَ
 * بعد يومين وتظنّ أنّك ما زلت تستطيع الردّ.
 *
 * وهذا الملفّ **حسابٌ خالص**: لا شبكة ولا DOM ولا تخزين. تستعمله الصفحةُ لتعرض،
 * وتستعمله دالّةُ الوِبهوك لتقرّر أتردّ آليًّا أم لا — **فالقاعدةُ واحدةٌ في الموضعين**،
 * ولا تختلف الشاشةُ عمّا يقع فعلًا.
 */

const HOUR = 3600000;

/** مدّةُ نافذة الخدمة: أربعٌ وعشرون ساعةً من آخر رسالةٍ للعميل — قاعدةُ Meta لا اجتهادُنا. */
export const WINDOW_MS = 24 * HOUR;

/**
 * حالُ النافذة لرسالةٍ واردةٍ وصلت في `at`.
 *
 * @returns {{ open, msLeft, hoursLeft, soon }} و`soon` متى بقي أقلُّ من ساعتين —
 *   وهي التي تستحقّ أن تُلوَّن: بابٌ يوشك أن يُغلق خبرٌ، وبابٌ مفتوحٌ اثنتين وعشرين ساعة لا.
 */
export function windowState(at, now = Date.now()) {
  const t = new Date(at || '').getTime();
  if (!Number.isFinite(t)) return { open: false, msLeft: 0, hoursLeft: 0, soon: false };
  const left = t + WINDOW_MS - now;
  if (left <= 0) return { open: false, msLeft: 0, hoursLeft: 0, soon: false };
  return {
    open: true,
    msLeft: left,
    // تُقرَّب لأعلى: «بقيت ساعة» أصدقُ من «بقي صفر» وأمامك تسعٌ وخمسون دقيقة.
    hoursLeft: Math.ceil(left / HOUR),
    soon: left <= 2 * HOUR,
  };
}

/** جملةٌ تُقرأ تحت الرسالة — ولا تُخترع صيغةٌ لما لا يُعرف وقتُه. */
export function windowLabel(state, { countOf } = {}) {
  if (!state) return '';
  if (!state.open) return 'أُغلقت نافذة الردّ — لا يُراسَل إلا بقالبٍ معتمَد';
  const count = countOf || ((n, w) => `${n} ${w}`);
  return state.hoursLeft <= 1
    ? 'أقلّ من ساعةٍ على إغلاق نافذة الردّ'
    : `يبقى ${count(state.hoursLeft, 'ساعة')} على إغلاق نافذة الردّ`;
}

/**
 * قاعدةُ ردٍّ تلقائيّ: `{ id, when, text, reply, enabled }`.
 *
 * `when` طريقةُ المطابقة:
 *   • `contains` — الرسالةُ تحوي الكلمات (أيَّ واحدةٍ منها، مفصولةً بفاصلة)
 *   • `first`    — أوّلُ رسالةٍ من هذا الرقم (لا سابقَ له)
 *   • `always`   — كلُّ رسالةٍ تصل
 *
 * **و«خارج الدوام» ليست قاعدةً بل شرطٌ على الردّ كلِّه** (`outsideHoursOnly`): من يريد
 * ردًّا ليليًّا وحدَه لا يريد قاعدةً ثانيةً تُكرّر نصَّه.
 */
export const MATCH_KINDS = [
  { key: 'first', label: 'أوّلُ رسالةٍ من هذا الرقم', hint: 'ترحيبٌ يُقال مرّةً واحدةً لكلّ عميلٍ جديد.' },
  { key: 'contains', label: 'الرسالةُ تحوي كلمةً', hint: 'كلماتٌ تفصلها فاصلة — تكفي واحدةٌ منها.' },
  { key: 'always', label: 'كلُّ رسالةٍ تصل', hint: 'إشعارُ استلامٍ لا أكثر — واجعله آخرَ القواعد.' },
];

/** أقصى ما يُرسَل آليًّا لرقمٍ واحدٍ في اليوم — سدٌّ أمام حلقةٍ لا تنتهي. */
export const MAX_AUTO_PER_DAY = 3;

/**
 * تطبيعُ العربيّة للمطابقة: الألفُ بأشكالها، والتاءُ المربوطة، والياءُ المقصورة،
 * والتشكيل. **ولا تُستورَد `arabic.js` هنا**: هذا الملفّ يُحمَّل داخل دالّةِ الوِبهوك،
 * وكلُّ استيرادٍ زائدٍ يكبّر حزمتَها — والمطلوبُ منه سطران.
 */
const DIACRITICS = /[ً-ْـ]/g;
const norm = (s) => String(s || '')
  .replace(DIACRITICS, '')
  .replace(/[أإآٱ]/g, 'ا')
  .replace(/ى/g, 'ي')
  .replace(/ة/g, 'ه')
  .toLowerCase()
  .trim();

/**
 * أيُّ قاعدةٍ تنطبق على هذه الرسالة؟ — **أوّلُ منطبقةٍ تفوز**، فترتيبُ القواعد معنًى لا شكل.
 *
 * @param {object} msg الرسالة `{ text, from }`
 * @param {Array} rules القواعد بترتيبها
 * @param {object} ctx
 *   `isFirst` أهي أوّلُ رسالةٍ من هذا الرقم · `sentToday` كم رُدّ عليه آليًّا اليوم
 *   `outsideHours` أخارجَ الدوام نحن الآن · `outsideHoursOnly` أيُقتصر الردُّ على خارج الدوام
 * @returns {object|null} القاعدة، أو `null` — **و`null` تعني لا تردّ**، لا «ردّ بالافتراضيّ».
 */
export function matchAuto(msg, rules = [], {
  isFirst = false, sentToday = 0, outsideHours = false, outsideHoursOnly = false,
} = {}) {
  // **السدُّ قبل المطابقة**: رقمٌ رُدّ عليه ثلاثًا اليوم لا يُردّ عليه رابعةً مهما طابق.
  if (sentToday >= MAX_AUTO_PER_DAY) return null;
  if (outsideHoursOnly && !outsideHours) return null;

  const text = norm(msg?.text);
  for (const rule of rules) {
    if (!rule || rule.enabled === false || !String(rule.reply || '').trim()) continue;
    if (rule.when === 'first') { if (isFirst) return rule; continue; }
    if (rule.when === 'always') return rule;
    if (rule.when === 'contains') {
      // رسالةٌ بلا نصّ (صورةٌ أو صوت) لا تُطابَق بكلمة — ولا تُعدّ مطابِقةً لفراغها.
      if (!text) continue;
      const words = String(rule.text || '').split(/[,،]/).map(norm).filter(Boolean);
      if (words.length && words.some((w) => text.includes(w))) return rule;
    }
  }
  return null;
}

/**
 * أخارجَ الدوام نحن؟ — بتوقيت الرياض (UTC+3) بلا مكتبة: المملكة لا تطبّق توقيتًا صيفيًّا،
 * فالإزاحةُ ثابتة. **ويُذكر ذلك هنا لأنّ أيّ تغيّرٍ فيه يُبطل الحساب.**
 *
 * و`from >= to` تعني مدًى يعبر منتصف الليل (٢٢ ← ٨) — وهو الغالبُ في «خارج الدوام».
 */
export function outsideWorkHours({ from = 9, to = 22 } = {}, now = Date.now()) {
  const riyadhHour = new Date(now + 3 * HOUR).getUTCHours();
  const start = Number(from);
  const end = Number(to);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return false;
  if (start === end) return false; // دوامٌ لا طول له لا معنى لتقسيمه
  const inside = start < end
    ? riyadhHour >= start && riyadhHour < end
    : riyadhHour >= start || riyadhHour < end;
  return !inside;
}

/**
 * يُطبّع قائمةَ القواعد قبل الحفظ — **ويُسقط ما لا ردَّ فيه**: قاعدةٌ بلا نصٍّ تُطابق
 * ولا تُرسل شيئًا، فتبدو معطَّلةً وهي مشتغلة.
 */
export function cleanRules(rules = []) {
  const kinds = new Set(MATCH_KINDS.map((k) => k.key));
  return (Array.isArray(rules) ? rules : [])
    .map((r, i) => ({
      id: String(r?.id || `r${i + 1}`).replace(/[^\w-]/g, '').slice(0, 24) || `r${i + 1}`,
      when: kinds.has(r?.when) ? r.when : 'contains',
      text: String(r?.text ?? '').trim().slice(0, 200),
      reply: String(r?.reply ?? '').trim().slice(0, 900),
      enabled: r?.enabled !== false,
    }))
    .filter((r) => r.reply)
    .slice(0, 12); // اثنتا عشرةَ قاعدةً أكثرُ ممّا يضبطه أحد، وما زاد يصير متاهة
}
