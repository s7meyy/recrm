// فهرس صفحات القائمة الجانبية وترتيبها المحفوظ (المرحلة ٨).
// الروابط نفسها مكتوبة في index.html (فتظهر القائمة كاملة ولو تعطّلت الجافاسكربت)،
// وهذا الملف يعيد ترتيب عناصرها في الـDOM بحسب ما حُفظ في الإعدادات — لا يخفي شيئًا ولا ينشئ رابطًا.

import { getSidebarOrder, orderedPageKeys } from '../data/settings.js';

/** الترتيب الافتراضي = ترتيب الروابط في index.html نفسه. المفتاح هو اسم المسار في ROUTES. */
export const SIDEBAR_PAGES = [
  { key: 'today', label: 'يومي', icon: '☀️' },
  { key: 'dashboard', label: 'الداشبورد', icon: '📊' },
  { key: 'opportunities', label: 'الفرص', icon: '🎯' },
  { key: 'properties', label: 'العقارات', icon: '🏠' },
  { key: 'map', label: 'خريطة العقارات', icon: '🗺️' },
  { key: 'clients', label: 'العملاء', icon: '👤' },
  { key: 'tours', label: 'الجولات الميدانية', icon: '🚗' },
  { key: 'requests', label: 'الطلبات', icon: '📋' },
  { key: 'matches', label: 'المطابقات', icon: '🔗' },
  { key: 'external', label: 'العروض الخارجية', icon: '🌐' },
  { key: 'pricing', label: 'تقدير السعر', icon: '⚖️' },
  { key: 'invoices', label: 'الفواتير وعروض الأسعار', icon: '🧾' },
  { key: 'expenses', label: 'المصاريف', icon: '💸' },
  { key: 'publish', label: 'الصفحة العامة للعروض', icon: '🌍' },
  { key: 'tasks', label: 'المهام', icon: '✅' },
  { key: 'calendar', label: 'التقويم', icon: '📆' },
  { key: 'notes', label: 'الأفكار والملاحظات', icon: '💡' },
  { key: 'health', label: 'صحة البيانات', icon: '🩺' },
  { key: 'settings', label: 'الإعدادات', icon: '⚙️' },
];

export const DEFAULT_PAGE_KEYS = SIDEBAR_PAGES.map((p) => p.key);

/** عنوان صفحة بمفتاحها (للوحة الترتيب في الإعدادات). */
export function pageLabel(key) {
  return SIDEBAR_PAGES.find((p) => p.key === key)?.label ?? key;
}

/**
 * يعيد ترتيب روابط القائمة الجانبية في الـDOM حسب الترتيب المحفوظ.
 * يُستدعى عند التشغيل وبعد الحفظ من الإعدادات. غياب أي رابط لا يعطّل البقية.
 */
export async function applySidebarOrder(order = null) {
  const nav = document.querySelector('.sidebar-nav');
  if (!nav) return;
  const saved = order ?? (await getSidebarOrder());
  const byKey = new Map([...nav.querySelectorAll('a[data-route]')].map((a) => [a.dataset.route, a]));
  for (const key of orderedPageKeys(DEFAULT_PAGE_KEYS, saved)) {
    const link = byKey.get(key);
    if (link) nav.append(link); // append ينقل العنصر الموجود (لا ينسخه) فيصير آخر القائمة
  }
}
