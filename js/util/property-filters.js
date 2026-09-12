// فرز مشترك (المدينة، الحي، النوع، الغرض) بين صفحة العقارات (المرحلة ١) وخريطة العقارات
// (المرحلة ٥) — يضمن أن الخريطة تستعمل التعريف نفسه حرفيًا (نفس القيم، نفس القوائم، نفس
// منطق تقييد الحي بالمدينة المختارة) لا نسخة موازية قد تنحرف عنها لاحقًا.
// "الحالة" ليست هنا: هي خاصة بالعقارات (لا معنى لها للعروض الخارجية)، وتبقى معرَّفة محليًا
// في كل صفحة تحتاجها.

import { ENUMS } from '../data/schema.js';

export const LISTING_GROUPS = [
  ['city', 'المدينة'], ['district', 'الحي'], ['type', 'النوع'], ['purpose', 'الغرض'],
];

export const LISTING_VALUES = {
  city: (p) => [p.city],
  district: (p) => [p.district],
  type: (p) => [p.type],
  purpose: (p) => p.purposes || [],
};

export function uniqValues(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ar')).map((v) => ({ value: v, label: v }));
}

/**
 * خيارات مجموعة فرز واحدة من المجموعات الأربع أعلاه.
 * `items`: السجلات المعروضة حاليًا (تُبنى منها خيارات المدينة/الحي فعليًا الموجودة).
 * `lists`: نتيجة getLists() (لأنواع العقار المعرَّفة كلها، حتى ما لا سجل له بعد).
 * `filters`: فلاتر الصفحة الحالية (تُستعمل لتقييد خيارات "الحي" بالمدينة المختارة).
 */
export function listingFilterOptions(group, { items, lists, filters }) {
  switch (group) {
    case 'type': return lists.propertyTypes.map((t) => ({ value: t.key, label: t.label }));
    case 'purpose': return ENUMS.purposes.map((p) => ({ value: p.key, label: p.label }));
    case 'city': return uniqValues(items.map((p) => p.city));
    case 'district': {
      const cities = filters.city;
      const source = cities.size ? items.filter((p) => cities.has(p.city)) : items;
      return uniqValues(source.map((p) => p.district));
    }
    default: return [];
  }
}
