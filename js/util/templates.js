// قوالب رسائل واتساب (المرحلة ١١): رسائل جاهزة بمتغيّرات تُعبَّأ من السجل الذي أنت فيه.
//
// القوالب نصوص يملكها المستخدم ويعدّلها من الإعدادات؛ المتغيّرات تُستبدل بقيمها وقت الإرسال،
// وأي متغيّر بلا قيمة يُحذف سطره **إن كان السطر كله متغيّرًا** (فلا تُرسل «السعر: » فارغة).

import { formatSAR, formatArea } from './format.js';
import { toInternational } from './phone.js';

/** المتغيّرات المتاحة للعرض في واجهة الإعدادات (ولتوليد القيم). */
export const TEMPLATE_VARS = [
  { key: 'اسم_العميل', desc: 'اسم العميل أو جواله' },
  { key: 'اسمي', desc: 'اسمك أنت (من الإعدادات)' },
  { key: 'المكتب', desc: 'اسم الشركة/المكتب' },
  { key: 'نوع_العقار', desc: 'فلة، أرض…' },
  { key: 'الحي', desc: 'حي العقار' },
  { key: 'المدينة', desc: 'مدينة العقار' },
  { key: 'السعر', desc: 'سعر العقار منسّقًا' },
  { key: 'المساحة', desc: 'مساحة العقار منسّقة' },
  { key: 'الرابط', desc: 'رابط العرض العام إن وُجد' },
];

export const DEFAULT_TEMPLATES = [
  { key: 'offer', label: 'عرض عقار', body: 'السلام عليكم {اسم_العميل}\nلديّ {نوع_العقار} في {الحي} بـ{المدينة}\nالمساحة: {المساحة}\nالسعر: {السعر}\n{الرابط}\nإن ناسبك أرتّب لك معاينة.\n{اسمي} — {المكتب}' },
  { key: 'followup', label: 'متابعة بعد المعاينة', body: 'السلام عليكم {اسم_العميل}\nأتابع معك بخصوص {نوع_العقار} في {الحي}.\nهل لك رأي فيه؟ وإن كان غير مناسب أخبرني بما تفضّله لأبحث لك.\n{اسمي}' },
  { key: 'reminder', label: 'تذكير بموعد', body: 'السلام عليكم {اسم_العميل}\nتذكير بموعدنا للمعاينة. هل الوقت ما زال مناسبًا لك؟\n{اسمي} — {المكتب}' },
  { key: 'thanks', label: 'شكر بعد الصفقة', body: 'مبارك عليك {اسم_العميل}\nسعدت بخدمتك، وأي احتياج عقاري لاحقًا أنا في الخدمة.\n{اسمي} — {المكتب}' },
];

/** يبني قيم المتغيّرات من عميل/عقار/إعدادات — الغائب يبقى فارغًا لا `undefined`. */
export function templateValues({ client = null, property = null, lists = null, user = null, company = null, link = '' } = {}) {
  const typeLabel = property && lists ? (lists.propertyTypes.find((t) => t.key === property.type)?.label || '') : '';
  return {
    اسم_العميل: client ? (client.name || client.phone || '') : '',
    اسمي: user?.name || '',
    المكتب: company?.name || '',
    نوع_العقار: typeLabel,
    الحي: property?.district || '',
    المدينة: property?.city || '',
    السعر: property ? (property.price == null ? '' : formatSAR(property.price)) : '',
    المساحة: property?.area != null ? formatArea(property.area) : '',
    الرابط: link || '',
  };
}

/**
 * يستبدل المتغيّرات. السطر الذي يصير فارغًا بعد الاستبدال يُحذف كاملًا،
 * والسطر الذي كان «عنوان: {متغيّر}» بلا قيمة يُحذف أيضًا (لا يُرسل نصف سطر).
 */
export function renderTemplate(body, values) {
  return String(body ?? '')
    .split('\n')
    .map((line) => {
      const hadVar = /\{[^}]+\}/.test(line);
      const filled = line.replace(/\{([^}]+)\}/g, (_, name) => values[name.trim()] ?? '');
      if (!hadVar) return filled;
      const withoutLabel = filled.replace(/^[^:：]*[:：]\s*/, '').trim();
      return withoutLabel ? filled : null;
    })
    .filter((line) => line !== null)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** رابط واتساب جاهز للإرسال لعميل (أو بلا رقم لاختيار المستلم داخل واتساب). */
export function whatsappLink(text, phone = '') {
  const to = phone ? toInternational(phone) : '';
  return `https://wa.me/${to}?text=${encodeURIComponent(text)}`;
}

/* ===== القالبُ في موضع الحاجة (المرحلة ٤٧) ===== */

/**
 * **مواضعُ الحاجة** ومفاتيحُ القوالب التي تناسب كلًّا منها، مرتّبةً بالأولى فالأولى.
 *
 * القوالبُ مبنيّةٌ بمتغيّراتها منذ المرحلة ١١، وتُقرأ في صفحة الإعدادات، وتُختار من قائمةٍ
 * في شاشةٍ أو شاشتين. **وما ينقصها أن تُقترح حيث تُحتاج**: لا يُفتح الوسيطُ صفحةَ القوالب
 * ليختار، بل يرى الحالة فيريد الرسالة الآن.
 *
 * ولا تُخترع قوالب: يُبحث في قوالب المستخدم عن المفتاح، فإن غيّر مفاتيحها فبالكلمات في
 * عنوانها — ومن حذفها كلَّها لا يُقترح له شيءٌ ولا يُدسّ في إعداداته قالبٌ لم يكتبه.
 */
export const TEMPLATE_CONTEXTS = {
  /** عميلٌ طال انقطاعُه: تُفتح بمتابعةٍ لا بعرضٍ جديد. */
  stale: { keys: ['followup'], words: ['متابعة'], label: 'متابعة' },
  /** معاينةٌ مضت بلا انطباع: «كيف كانت المعاينة؟». */
  showingFeedback: { keys: ['followup'], words: ['معاينة', 'متابعة'], label: 'رأيه في المعاينة' },
  /** موعدٌ قادم: تذكيرٌ يسبقه. */
  upcoming: { keys: ['reminder'], words: ['تذكير', 'موعد'], label: 'تذكير بالموعد' },
  /** مطابقةٌ جديدة: عرضُ العقار. */
  match: { keys: ['offer'], words: ['عرض'], label: 'عرض العقار' },
  /** صفقةٌ أُبرمت: شكر. */
  won: { keys: ['thanks'], words: ['شكر', 'مبارك'], label: 'شكر بعد الصفقة' },
};

/**
 * يختار قالبًا يناسب موضعًا — **أو `null`** إن لم يكن في قوالب المستخدم ما يناسبه.
 *
 * والترتيب: مفتاحٌ مطابق، ثم عنوانٌ يحمل كلمةً من كلمات الموضع، ثم لا شيء. **ولا يُرجَع
 * أوّلُ قالبٍ وُجد** حين لا يناسب: رسالةُ «مبارك عليك» إلى عميلٍ منقطعٍ أسوأ من لا رسالة.
 */
export function suggestTemplate(templates = [], context = '') {
  const ctx = TEMPLATE_CONTEXTS[context];
  if (!ctx || !templates.length) return null;
  for (const key of ctx.keys) {
    const hit = templates.find((t) => t.key === key);
    if (hit) return hit;
  }
  for (const word of ctx.words) {
    const hit = templates.find((t) => String(t.label || '').includes(word));
    if (hit) return hit;
  }
  return null;
}

/**
 * **متغيّراتُ قالب واتساب المعتمَد** (المرحلة ٥٠).
 *
 * قوالبُ Meta تستعمل مواضعَ مرقّمة: `{{1}}` و`{{2}}` — لا أسماءَ عربيّةً كقوالبنا
 * الداخليّة. فالمكتبُ يقول مرّةً واحدة: «الموضعُ الأوّل اسمُ العميل، والثاني الحيّ،
 * والثالث السعر»، ثم تُملأ لكلّ مُرسَلٍ إليه بقيمه هو.
 *
 * **وقالبٌ بلا متغيّراتٍ يرسل النصَّ نفسَه لمئة عميل**، وقالبٌ بها يرسل لكلٍّ اسمَه.
 *
 * @param {string[]} varNames أسماءُ المتغيّرات بترتيب مواضعها — من `TEMPLATE_VARS`
 * @param {object} values قيمُها لهذا المُرسَل إليه — من `templateValues`
 * @returns {Array} مكوّنات Meta، أو `[]` إن لم يكن للقالب متغيّرات
 */
export function templateComponents(varNames = [], values = {}) {
  const names = (varNames || []).map((v) => String(v || '').trim()).filter(Boolean);
  if (!names.length) return [];
  return [{
    type: 'body',
    parameters: names.map((name) => ({
      type: 'text',
      // **ولا يُمرَّر فراغ**: Meta ترفض متغيّرًا فارغًا وتردّ بخطأٍ غامض، فيُوضع
      // شَرطةٌ مكانَ ما لم يُملأ — ويُقال ذلك في المعاينة قبل الإرسال لا بعده.
      text: String(values[name] ?? '').trim() || '—',
    })),
  }];
}

/** أيُّ المتغيّرات لم تُملأ لهذا السجل؟ — تُعرض قبل الإرسال لا بعده. */
export function missingVars(varNames = [], values = {}) {
  return (varNames || []).filter((name) => !String(values[name] ?? '').trim());
}
