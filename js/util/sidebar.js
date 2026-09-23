// فهرس صفحات القائمة الجانبية وترتيبها المحفوظ (المرحلة ٨).
// الروابط نفسها مكتوبة في index.html (فتظهر القائمة كاملة ولو تعطّلت الجافاسكربت)،
// وهذا الملف يعيد ترتيب عناصرها في الـDOM بحسب ما حُفظ في الإعدادات — لا يخفي شيئًا ولا ينشئ رابطًا.

import { getSidebarOrder, orderedPageKeys, getNavSections, setNavSections, getUI, setUI } from '../data/settings.js';

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
  { key: 'facilities', label: 'إدارة المرافق', icon: '🏗️' , group: 'duty' },
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

export const DEFAULT_PAGE_KEYS_RAW = SIDEBAR_PAGES.map((p) => p.key);

/**
 * **الأقسامُ صارت بيدك** (المرحلة ٥٤).
 *
 * كانت أربعةً مكتوبةً في الشيفرة، ومكتبُ كلِّ أحدٍ غيرُ مكتب غيره: من يعمل في الإدارة
 * يريد «الإدارة» أوّلًا وفيها الأملاكُ والمرافقُ والعقودُ والمالية، ومن يعمل في الوساطة
 * يريد غيرَها. فصارت **بيانات**: تُسمّى وتُعاد تسميتُها وتُضاف وتُحذف، وتُرتَّب هي
 * وصفحاتُها بالسحب والإفلات.
 *
 * والبناءُ الافتراضيُّ هو التجميعُ القديم نفسُه — **فمن لم يمسّها لم يتغيّر عنده شيء**.
 * ويُحترم ترتيبُك المحفوظ من المرحلة ٨ عند أوّل بناء، فلا يضيع ما رتّبتَه.
 */
export function buildDefaultSections(savedOrder = []) {
  const ordered = orderedPageKeys(DEFAULT_PAGE_KEYS_RAW, savedOrder);
  return SIDEBAR_GROUPS.map((g) => ({
    id: g.key,
    label: g.label,
    pages: ordered.filter((k) => SIDEBAR_PAGES.find((p) => p.key === k)?.group === g.key),
  })).filter((sec) => sec.pages.length);
}

/**
 * الأقسامُ الفعليّة — محفوظةً أو افتراضيّةً، **مُصانةً دائمًا**:
 * صفحةٌ تُضاف في تحديثٍ لاحقٍ تلحق بقسمها الافتراضيّ (أو بالأخير)، وصفحةٌ حُذفت تسقط،
 * ومفتاحٌ مكرَّرٌ يُبقى أوّلَ موضعٍ له. **فلا يسقط بابٌ لأنّ المستخدم رتّب قائمتَه قديمًا.**
 */
export async function getSections() {
  const saved = await getNavSections();
  const fallback = buildDefaultSections(await getSidebarOrder());
  if (!saved) return fallback;

  const known = new Set(DEFAULT_PAGE_KEYS_RAW);
  const seen = new Set();
  const sections = saved
    .filter((sec) => sec && typeof sec.id === 'string')
    .map((sec) => ({
      id: sec.id,
      label: String(sec.label || '').trim() || 'قسم',
      pages: (Array.isArray(sec.pages) ? sec.pages : [])
        .filter((k) => known.has(k) && !seen.has(k) && seen.add(k) !== false),
    }));
  if (!sections.length) return fallback;

  // ما لم يُذكر في المحفوظ يلحق بقسمه الافتراضيّ إن وُجد، وإلّا بالأخير.
  for (const key of DEFAULT_PAGE_KEYS_RAW) {
    if (seen.has(key)) continue;
    const home = SIDEBAR_PAGES.find((p) => p.key === key)?.group;
    (sections.find((sec) => sec.id === home) || sections[sections.length - 1]).pages.push(key);
  }
  /**
   * **والقسمُ الفارغ يبقى** — وهذا عطبٌ كشفه الفحص: كنتُ أُسقط ما لا صفحةَ فيه، فقسمٌ
   * تُنشئه ليس فيه شيءٌ بعدُ **يُمحى قبل أن تسحب إليه أوّلَ صفحة**. وهو لا يظهر في
   * القائمة الجانبيّة حتى يمتلئ (`applySidebarOrder` يتخطّى الفارغ)، فلا عنوانَ بلا روابط.
   */
  return sections;
}

export const saveSections = (sections) => setNavSections(sections);

/** قسمُ صفحةٍ بحسب ما رتّبتَه — ويُستعمل في الطيّ. غيرُ متزامنةٍ لأنّها تقرأ المحفوظ. */
export async function sectionOf(pageKey) {
  const sections = await getSections();
  return sections.find((sec) => sec.pages.includes(pageKey))?.id
    || SIDEBAR_PAGES.find((p) => p.key === pageKey)?.group
    || sections[sections.length - 1]?.id
    || 'tools';
}

/** القسمُ الافتراضيُّ لصفحة — يبقى للفحوص وللبناء الأوّل. */
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

/**
 * حالُ الطيّ لكلّ قسمٍ **بمعرّفه**، والغائبُ يأخذ افتراضيَّه: الأوّلُ مفتوحٌ وما بعده مطويّ.
 * **وقسمٌ يُنشئه صاحبُ المكتب لا افتراضيَّ له في الشيفرة**، فالقاعدةُ هي الموضعُ لا الاسم.
 */
export async function getNavFolds() {
  const saved = (await getUI()).navFolds || {};
  const sections = await getSections();
  return Object.fromEntries(sections.map((sec, i) => [
    sec.id,
    saved[sec.id] ?? DEFAULT_FOLDS[sec.id] ?? i > 0,
  ]));
}

/**
 * يطبّق الطيَّ على الـDOM. **والإخفاءُ بصنفٍ على الرابط لا بقاعدةٍ لكلّ قسم**: معرّفاتُ
 * الأقسام صارت بيد صاحب المكتب، ولا تُكتب لها قواعدُ CSS لا تُعرف أسماؤها.
 *
 * **والعددُ ليس زخرفًا**: مجموعةٌ مطويّةٌ بلا عددٍ بابٌ مغلقٌ لا يُعرف ما خلفه.
 * ويُعدّ الظاهرُ وحدَه — فرابطٌ أخفاه «وضع عرض للعميل» لا يُحسب لك.
 */
export function applyNavFolds(folds = null) {
  const nav = document.querySelector('.sidebar-nav');
  if (!nav) return;
  for (const head of nav.querySelectorAll('.nav-group')) {
    const id = head.dataset.group;
    const folded = folds ? !!folds[id] : head.getAttribute('aria-expanded') === 'false';
    head.setAttribute('aria-expanded', folded ? 'false' : 'true');
    const links = [...nav.querySelectorAll(`a[data-group="${CSS.escape(id)}"]`)];
    for (const a of links) {
      // **و«الإعدادات» مستثناةٌ دائمًا**: هي المثبَّتة في الأسفل، ومنها يُصلَح الترتيبُ
      // نفسُه، فطيُّ قسمِها لا يبتلعها وإلّا عاد العطبُ الذي عولج في المرحلة ٥٣.
      a.classList.toggle('nav-hidden', folded && a.dataset.route !== 'settings');
    }
    const inside = links.filter((a) => !a.hidden && a.dataset.route !== 'settings').length;
    const count = head.querySelector('.nav-group-count');
    if (count) {
      count.textContent = folded ? String(inside) : '';
      count.hidden = !folded || !inside;
    }
  }
}

/** يطوي قسمًا أو يفتحه ويحفظ الاختيار — فما طويتَه يبقى مطويًّا غدًا. */
export async function toggleNavGroup(key) {
  const folds = await getNavFolds();
  folds[key] = !folds[key];
  await setUI({ navFolds: folds });
  applyNavFolds(folds);
  return folds[key];
}

/**
 * **ولا يُخفى البابُ الذي أنت فيه**: من فتح صفحةً بعنوانها المباشر وقسمُها مطويّ
 * لم يرَ أين هو من القائمة. فيُفتح قسمُه ويُحفظ ذلك — فالبابُ الذي دخلتَه مفتوح.
 */
export async function revealGroupOf(routeKey) {
  const id = await sectionOf(routeKey);
  const folds = await getNavFolds();
  if (!folds[id]) return false;
  folds[id] = false;
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
  const sections = await getSections();
  const byKey = new Map([...nav.querySelectorAll('a[data-route]')].map((a) => [a.dataset.route, a]));

  // عناوينُ الأقسام تُعاد بناؤها في كلّ ترتيب — فلا تتكرّر ولا تبقى فوق قسمٍ فرغ.
  for (const old of nav.querySelectorAll('.nav-group')) old.remove();

  for (const sec of sections) {
    const keys = sec.pages.filter((k) => byKey.has(k));
    if (!keys.length) continue;   // قسمٌ بلا روابط لا عنوانَ له
    /* **والعنوانُ زرٌّ لا سطرٌ** (المرحلة ٥٣): كان `div` بـ`aria-hidden` لأنّه زينةٌ
       بصريّة، وصار أداةً تُضغط — فهو `button` يصله التركيز ويقرؤه قارئُ الشاشة بحاله
       (`aria-expanded`). وفي حال الطيّ لا يُقرأ نصُّه فيبقى عنوانُه في `aria-label`. */
    const head = document.createElement('button');
    head.type = 'button';
    head.className = 'nav-group';
    head.dataset.group = sec.id;
    head.setAttribute('aria-label', sec.label);
    head.append(
      Object.assign(document.createElement('span'), { className: 'nav-group-label', textContent: sec.label }),
      Object.assign(document.createElement('span'), { className: 'nav-group-count', hidden: true }),
      Object.assign(document.createElement('span'), { className: 'nav-group-caret', textContent: '⌄', ariaHidden: 'true' }),
    );
    head.addEventListener('click', () => { toggleNavGroup(sec.id); });
    nav.append(head);
    for (const key of keys) {
      const link = byKey.get(key);
      link.dataset.group = sec.id;   // الطيُّ يعرف كلَّ رابطٍ بقسمه
      nav.append(link);
    }
  }
  applyNavFolds(await getNavFolds());
  void order;
}
