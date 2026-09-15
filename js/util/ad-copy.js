// نصّ إعلان جاهز لكل قناة (المرحلة ٢٨).
//
// PropSpace تبيع النشر إلى ثمانين بوّابة عبر واجهاتها، ولا واجهات عامة في السعودية —
// لكن **سبعين بالمئة من الوجع صياغة الإعلان** لا رفعه: عنوان ووصف ومواصفات بصيغة تناسب
// كل قناة، جاهزة للنسخ واللصق.
//
// **قاعدة واحدة تحكم الملف كله: لا يُكتب إلا ما هو مسجَّل.** لا «موقع مميز» ولا «فرصة لا
// تُعوَّض» ولا مساحة تُقرَّب ولا سعر يُجمَّل. النصّ الذي يَعِد بما ليس في السجل يكسر ثقة
// المشتري بك حين يرى العقار — وهو أغلى مما يجلبه إعلان.
//
// دوال خالصة: لا تخزين ولا شبكة.

import { labelFor, ENUMS, TYPE_FIELD_GROUPS } from '../data/schema.js';

export const AD_CHANNELS = [
  { key: 'portal', label: 'بوّابة إعلانية', hint: 'عنوان ووصف ومواصفات مرتّبة — لحراج وعقار ونظائرهما', limit: null },
  { key: 'social', label: 'انستقرام وسناب', hint: 'قصير بأسطر مفصولة ووسوم', limit: null },
  { key: 'short', label: 'منشور قصير (X)', hint: 'يُقصّ عند ٢٨٠ حرفًا', limit: 280 },
];

const nf = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
const money = (n) => (n == null ? null : `${nf.format(n)} ريال`);
const areaText = (n) => (n == null ? null : `${nf.format(n)} م²`);

/** وسوم من بيانات العقار نفسها — لا وسوم عامة تجلب متابعين ولا تجلب مشتريًا. */
function hashtags(property, { lists, typeLabel }) {
  return [property.city, property.district, typeLabel, ...(property.purposes || []).map((k) => labelFor(ENUMS.purposes, k))]
    .filter(Boolean)
    .map((t) => `#${String(t).trim().replace(/\s+/g, '_')}`);
}

/** مواصفات النوع المسجَّلة فعلًا (غرف، أدوار، واجهة…) — تُقرأ من مجموعة حقول النوع. */
function typeSpecs(property, group) {
  return (TYPE_FIELD_GROUPS[group] || [])
    .map((def) => {
      const raw = property.typeFields?.[def.key];
      if (raw == null || raw === '') return null;
      const value = def.input === 'select' ? labelFor(def.options || [], raw) : String(raw);
      return value ? [def.label, value] : null;
    })
    .filter(Boolean);
}

/**
 * يبني نصوص الإعلان لكل قناة.
 *
 * @param {object} property
 * @param {{ typeLabel, group, company, ref }} ctx `typeLabel` مسمّى النوع كما في قوائمك
 * @returns {{ title, channels: [{ key, label, hint, text, chars, over }] }}
 */
export function adCopy(property, { typeLabel = 'عقار', group = null, company = {}, ref = '' } = {}) {
  const where = [property.district, property.city].filter(Boolean).join('، ');
  const purposes = (property.purposes || []).map((k) => labelFor(ENUMS.purposes, k));
  const purposeWord = purposes.includes('rent') && !purposes.includes('sale') ? 'للإيجار' : 'للبيع';
  const title = [typeLabel, purposeWord, where ? `في ${where}` : ''].filter(Boolean).join(' ');

  const specs = [
    ['النوع', typeLabel],
    ['الغرض', purposes.join(' / ') || null],
    ['الموقع', where || null],
    ['المساحة', areaText(property.area)],
    ['السعر', money(property.price)],
    ...typeSpecs(property, group),
  ].filter(([, v]) => v);

  const contact = company.phone ? `للتواصل: ${company.phone}${company.name ? ` — ${company.name}` : ''}` : '';
  const notes = String(property.notes || '').trim();

  const portal = [
    title,
    '',
    ...specs.map(([k, v]) => `• ${k}: ${v}`),
    notes ? '' : null,
    notes || null,
    '',
    contact || null,
    ref ? `رقم العرض: ${ref}` : null,
  ].filter((line) => line !== null).join('\n').trim();

  const social = [
    `${title} 🏡`,
    areaText(property.area) ? `المساحة: ${areaText(property.area)}` : null,
    money(property.price) ? `السعر: ${money(property.price)}` : null,
    notes ? notes.split('\n')[0] : null,
    contact ? `📞 ${company.phone}` : null,
    '',
    hashtags(property, { typeLabel }).join(' '),
  ].filter((line) => line !== null).join('\n').trim();

  const shortLine = [
    title,
    areaText(property.area),
    money(property.price),
    company.phone ? `📞 ${company.phone}` : null,
  ].filter(Boolean).join(' · ');

  return {
    title,
    channels: AD_CHANNELS.map((c) => {
      const text = c.key === 'portal' ? portal : c.key === 'social' ? social : shortLine;
      return {
        ...c,
        text,
        chars: [...text].length,
        // لا يُقصّ النصّ تلقائيًا: القصّ الآلي يبتر جملةً في منتصفها. يُقال لك إنه تجاوز.
        over: c.limit != null && [...text].length > c.limit,
      };
    }),
  };
}

/** ما ينقص الإعلانَ ليكون مقنعًا — يُعرض قبل النسخ لا بعد النشر. */
export function adGaps(property) {
  const gaps = [];
  if (property.price == null) gaps.push('لا سعر — الإعلان بلا سعر يُتجاهَل غالبًا');
  if (property.area == null) gaps.push('لا مساحة');
  if (!property.district) gaps.push('لا حي — والحي أول ما يبحث به المشتري');
  if (!(property.images || []).length) gaps.push('لا صور — أضفها قبل النشر');
  if (!String(property.notes || '').trim()) gaps.push('لا وصف مكتوب: سطرٌ بخطّك يفرّقك عن إعلانٍ آلي');
  return gaps;
}
