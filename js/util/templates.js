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
