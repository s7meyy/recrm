// فهرس صفحات القائمة الجانبية وترتيبها المحفوظ (المرحلة ٨).
// الروابط نفسها مكتوبة في index.html (فتظهر القائمة كاملة ولو تعطّلت الجافاسكربت)،
// وهذا الملف يعيد ترتيب عناصرها في الـDOM بحسب ما حُفظ في الإعدادات — لا يخفي شيئًا ولا ينشئ رابطًا.

import { getSidebarOrder, orderedPageKeys } from '../data/settings.js';

/** الترتيب الافتراضي = ترتيب الروابط في index.html نفسه. المفتاح هو اسم المسار في ROUTES. */
export const SIDEBAR_PAGES = [
  { key: 'today', label: 'يومي', icon: '☀️' , group: 'work' },
  { key: 'dashboard', label: 'الداشبورد', icon: '📊' , group: 'work' },
  { key: 'opportunities', label: 'الفرص', icon: '🎯' , group: 'work' },
  { key: 'properties', label: 'العقارات', icon: '🏠' , group: 'work' },
  { key: 'map', label: 'خريطة العقارات', icon: '🗺️' , group: 'work' },
  { key: 'clients', label: 'العملاء', icon: '👤' , group: 'work' },
  { key: 'tours', label: 'الجولات الميدانية', icon: '🚗' , group: 'work' },
  { key: 'requests', label: 'الطلبات', icon: '📋' , group: 'work' },
  { key: 'matches', label: 'المطابقات', icon: '🔗' , group: 'work' },
  { key: 'external', label: 'العروض الخارجية', icon: '🌐' , group: 'work' },
  { key: 'pricing', label: 'تقدير السعر', icon: '⚖️' , group: 'work' },
  { key: 'inbox', label: 'الوارد', icon: '📥', group: 'work' },
  { key: 'market', label: 'السوق', icon: '📈' , group: 'work' },
  { key: 'management', label: 'إدارة الأملاك', icon: '🔑' , group: 'duty' },
  { key: 'rega', label: 'العقود والتراخيص', icon: '📜' , group: 'duty' },
  { key: 'stamp', label: 'ختم الصور والمقاطع', icon: '🖼️' , group: 'tools' },
  { key: 'extract', label: 'تفريغ المستندات', icon: '📄' , group: 'tools' },
  { key: 'invoices', label: 'الفواتير وعروض الأسعار', icon: '🧾' , group: 'money' },
  { key: 'deals', label: 'الصفقات', icon: '🤝' , group: 'money' },
  { key: 'expenses', label: 'المالية', icon: '💸' , group: 'money' },
  { key: 'publish', label: 'الصفحة العامة للعروض', icon: '🌍' , group: 'duty' },
  { key: 'prospects', label: 'الفرص العقاريّة', icon: '💎' , group: 'work' },
  { key: 'tasks', label: 'المهام', icon: '✅' , group: 'work' },
  { key: 'calendar', label: 'التقويم', icon: '📆' , group: 'work' },
  { key: 'notes', label: 'الأفكار والملاحظات', icon: '💡' , group: 'tools' },
  { key: 'trash', label: 'سلة المحذوفات', icon: '🗑️' , group: 'tools' },
  { key: 'health', label: 'صحة البيانات', icon: '🩺' , group: 'tools' },
  { key: 'whatsapp', label: 'واتساب', icon: '💬' , group: 'duty' },
  { key: 'integrations', label: 'التكاملات', icon: '🔌' , group: 'tools' },
  { key: 'settings', label: 'الإعدادات', icon: '⚙️' , group: 'tools' },
];

/**
 * **المجموعاتُ الأربع** (المرحلة ٤٨).
 *
 * كانت القائمةُ ثمانيةَ عشرَ بابًا يوم المراجعة الأولى، **وصارت سبعةً وعشرين** — مسطّحةً
 * بلا عنوانٍ واحدٍ يجمع. والترتيبُ قابلٌ للتخصيص منذ المرحلة ٨ وهذا حسن، **لكنّ التخصيص
 * لا يعالج الطول**: أربعةٌ منها أدواتٌ تُفتح مرّةً في الشهر تزاحم ما يُفتح كلَّ يوم.
 *
 * **ولا صفحةَ تُحذف ولا يتغيّر مسار.** وترتيبُك المحفوظ يبقى محفوظًا — **داخل مجموعته**.
 */
export const SIDEBAR_GROUPS = [
  { key: 'work', label: 'العمل' },
  { key: 'money', label: 'المال' },
  { key: 'duty', label: 'الإدارة والالتزام' },
  { key: 'tools', label: 'الأدوات' },
];

export const groupOf = (key) => SIDEBAR_PAGES.find((p) => p.key === key)?.group || 'tools';

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

  // عناوينُ المجموعات تُعاد بناؤها في كلّ ترتيب — فلا تتكرّر ولا تبقى فوق مجموعةٍ فرغت.
  for (const old of nav.querySelectorAll('.nav-group')) old.remove();

  const ordered = orderedPageKeys(DEFAULT_PAGE_KEYS, saved);
  for (const g of SIDEBAR_GROUPS) {
    // ترتيبُك المحفوظ يبقى محفوظًا — **داخل مجموعته**.
    const keys = ordered.filter((k) => groupOf(k) === g.key && byKey.has(k));
    if (!keys.length) continue;   // مجموعةٌ بلا روابط لا عنوانَ لها
    const head = document.createElement('div');
    head.className = 'nav-group';
    head.textContent = g.label;
    head.setAttribute('aria-hidden', 'true'); // عنوانٌ بصريّ؛ الروابطُ نفسُها تُقرأ
    nav.append(head);
    for (const key of keys) nav.append(byKey.get(key));
  }
}
