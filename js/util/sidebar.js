// فهرس صفحات القائمة الجانبية وترتيبها المحفوظ (المرحلة ٨).
// الروابط نفسها مكتوبة في index.html (فتظهر القائمة كاملة ولو تعطّلت الجافاسكربت)،
// وهذا الملف يعيد ترتيب عناصرها في الـDOM بحسب ما حُفظ في الإعدادات — لا يخفي شيئًا ولا ينشئ رابطًا.

import { getSidebarOrder, orderedPageKeys, getUI, setUI } from '../data/settings.js';

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

/**
 * **طيُّ المجموعات** (المرحلة ٥٣) — ثلاثون بابًا لا تُقرأ دفعةً واحدة.
 *
 * صارت القائمةُ ١٦٣٣ بكسلًا في شاشةٍ ارتفاعُها ٨٠٠، فثلثُها الأخير تحت الطيّ. والتمريرُ
 * يعالج الوصولَ ولا يعالج **الزحام**: من يفتح القائمة يريد بابًا واحدًا، فتُعرض عليه
 * ثلاثون. فصار عنوانُ المجموعة زرًّا يطويها ويفتحها.
 *
 * **و«العمل» وحدَها مفتوحةٌ افتراضًا**: هي ما يُفتح كلَّ يوم، والثلاثُ الباقية تُفتح
 * عند الحاجة — ولا شيء يُحذف ولا يتغيّر مسار.
 */
export const DEFAULT_FOLDS = { work: false, money: true, duty: true, tools: true };

/** حالُ الطيّ المحفوظة، والغائبُ يأخذ افتراضيَّه فلا تبقى مجموعةٌ تُضاف لاحقًا بلا حال. */
export async function getNavFolds() {
  const saved = (await getUI()).navFolds || {};
  return Object.fromEntries(SIDEBAR_GROUPS.map((g) => [g.key, saved[g.key] ?? DEFAULT_FOLDS[g.key] ?? false]));
}

/**
 * يطبّق الطيَّ على الـDOM: صنفٌ على القائمة تتكفّل به قواعدُ CSS، وعددٌ يُقال على العنوان.
 *
 * **والعددُ ليس زخرفًا**: مجموعةٌ مطويّةٌ بلا عددٍ بابٌ مغلقٌ لا يُعرف ما خلفه.
 * ويُعدّ الظاهرُ وحدَه — فرابطٌ أخفاه «وضع عرض للعميل» لا يُحسب لك.
 */
export function applyNavFolds(folds = null) {
  const nav = document.querySelector('.sidebar-nav');
  if (!nav) return;
  for (const g of SIDEBAR_GROUPS) {
    // بلا وسيطٍ تُقرأ الحالُ من الأصناف نفسِها — فيُعاد حسابُ الأعداد بعد إخفاءٍ
    // طارئ («وضع عرض للعميل») بلا قراءةٍ ثانيةٍ من التخزين ولا سباقِ توقيتات.
    const folded = folds ? !!folds[g.key] : nav.classList.contains(`fold-${g.key}`);
    nav.classList.toggle(`fold-${g.key}`, folded);
    const head = nav.querySelector(`.nav-group[data-group="${g.key}"]`);
    if (!head) continue;
    head.setAttribute('aria-expanded', folded ? 'false' : 'true');
    const links = [...nav.querySelectorAll(`a[data-group="${g.key}"]`)].filter((a) => !a.hidden);
    const count = head.querySelector('.nav-group-count');
    if (count) {
      count.textContent = folded ? String(links.length) : '';
      count.hidden = !folded || !links.length;
    }
  }
}

/** يطوي مجموعةً أو يفتحها ويحفظ الاختيار — فما طويتَه يبقى مطويًّا غدًا. */
export async function toggleNavGroup(key) {
  const folds = await getNavFolds();
  folds[key] = !folds[key];
  await setUI({ navFolds: folds });
  applyNavFolds(folds);
  return folds[key];
}

/**
 * **ولا يُخفى البابُ الذي أنت فيه**: من فتح صفحةً بعنوانها المباشر ومجموعتُها مطويّة
 * لم يرَ أين هو من القائمة. فتُفتح مجموعتُه ويُحفظ ذلك — فالبابُ الذي دخلتَه مفتوح.
 */
export async function revealGroupOf(routeKey) {
  const g = groupOf(routeKey);
  const folds = await getNavFolds();
  if (!folds[g]) return false;
  folds[g] = false;
  await setUI({ navFolds: folds });
  applyNavFolds(folds);
  return true;
}

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
    /* **والعنوانُ صار زرًّا لا سطرًا** (المرحلة ٥٣): كان `div` بـ`aria-hidden` لأنّه زينةٌ
       بصريّة، وصار أداةً تُضغط — فهو `button` يصله التركيز ويقرؤه قارئُ الشاشة بحاله
       (`aria-expanded`). وفي حال الطيّ لا يُقرأ نصُّه فيبقى عنوانُه في `aria-label`. */
    const head = document.createElement('button');
    head.type = 'button';
    head.className = 'nav-group';
    head.dataset.group = g.key;
    head.setAttribute('aria-label', g.label);
    head.append(
      Object.assign(document.createElement('span'), { className: 'nav-group-label', textContent: g.label }),
      Object.assign(document.createElement('span'), { className: 'nav-group-count', hidden: true }),
      Object.assign(document.createElement('span'), { className: 'nav-group-caret', textContent: '⌄', ariaHidden: 'true' }),
    );
    head.addEventListener('click', () => { toggleNavGroup(g.key); });
    nav.append(head);
    for (const key of keys) {
      const link = byKey.get(key);
      link.dataset.group = g.key;   // الطيُّ يعرف كلَّ رابطٍ بمجموعته، فيُطوى بقاعدةٍ واحدة
      nav.append(link);
    }
  }
  applyNavFolds(await getNavFolds());
}
