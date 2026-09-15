// نحو الأوامر الصوتية (المرحلة ٣٨).
//
// **ما هذا وما ليس هو**: هذا نحوٌ ثابتٌ يفهم صيغًا معدودةً بالضبط — «افتح العقارات»،
// «عميل جديد»، «ابحث عن سعد». وليس مساعدًا يفهم كلَّ ما تقول: فهمُ الكلام الحرّ يحتاج
// نموذجًا لغويًّا يُستدعى من الشبكة باشتراك، وهو مُعدٌّ في صفحة التكاملات ولم يُوصَل بعد.
// وحتى يُوصَل، الأصدق أن يقول البرنامج «لم أفهم — قل: افتح العقارات» من أن يخمّن فيفتح
// صفحةً لم تُرِدها.
//
// وكلُّ ما هنا **يجري في جهازك**: التعرّف على الصوت من المتصفّح، والفهم من هذا الملف.
// ولا يُرسَل صوتُك ولا نصُّه إلى خادمنا.

import { normalizeArabic } from './arabic.js';

/** مرادفات كل صفحة كما ينطقها الناس، لا كما كُتبت في القائمة. */
export const ROUTE_WORDS = [
  ['today', ['يومي', 'اليوم', 'الصفحه الرئيسيه', 'الرئيسيه']],
  ['dashboard', ['الداشبورد', 'لوحه التحكم', 'اللوحه', 'الاحصاءات', 'الاحصائيات']],
  ['opportunities', ['الفرص', 'فرص']],
  ['properties', ['العقارات', 'عقارات', 'المخزون']],
  ['map', ['الخريطه', 'خريطه']],
  ['clients', ['العملاء', 'عملاء', 'الزباين']],
  ['tours', ['الجولات', 'الجولات الميدانيه', 'جوله ميدانيه']],
  ['requests', ['الطلبات', 'طلبات']],
  ['matches', ['المطابقات', 'مطابقات']],
  ['external', ['العروض الخارجيه', 'عروض خارجيه']],
  ['pricing', ['تقدير السعر', 'التسعير', 'السعر']],
  ['management', ['اداره الاملاك', 'الاداره', 'ادارة الاملاك']],
  ['stamp', ['الختم', 'ختم الصور', 'ختم الصور والمقاطع']],
  ['rega', ['العقود والتراخيص', 'العقود', 'التراخيص', 'عقود الوساطه', 'تراخيص الاعلانات']],
  ['extract', ['تفريغ المستندات', 'التفريغ', 'المستندات', 'تفريغ الوسائط']],
  ['whatsapp', ['واتساب', 'الواتس', 'واتس اب', 'الرسايل', 'الرسائل']],
  ['invoices', ['الفواتير', 'فواتير', 'عروض الاسعار']],
  ['expenses', ['الماليه', 'المصاريف', 'الايرادات', 'الحسابات']],
  ['publish', ['الصفحه العامه', 'النشر']],
  ['tasks', ['المهام', 'مهام']],
  ['calendar', ['التقويم', 'المواعيد']],
  ['notes', ['الافكار', 'الملاحظات']],
  ['health', ['صحه البيانات']],
  ['integrations', ['التكاملات']],
  ['settings', ['الاعدادات', 'الضبط']],
];

const OPEN_VERBS = ['افتح', 'اذهب الى', 'اذهب', 'روح', 'روح الى', 'ودني', 'ودني الى', 'انتقل الى', 'انتقل', 'وريني', 'اعرض', 'صفحه'];
const SEARCH_VERBS = ['ابحث عن', 'ابحث', 'دور على', 'دور', 'وين', 'فين'];
const NEW_WORDS = [
  ['properties', ['عقار جديد', 'اضف عقار', 'اضافه عقار', 'سجل عقار']],
  ['clients', ['عميل جديد', 'اضف عميل', 'اضافه عميل', 'سجل عميل']],
  ['requests', ['طلب جديد', 'اضف طلب', 'اضافه طلب']],
  ['tasks', ['مهمه جديده', 'اضف مهمه', 'اضافه مهمه']],
  ['notes', ['فكره جديده', 'اضف فكره', 'ملاحظه جديده']],
  ['invoices', ['فاتوره جديده', 'اضف فاتوره', 'عرض سعر جديد']],
  ['tours', ['جوله جديده', 'اضف جوله']],
];

/** ما يُعرض في ورقة «ماذا أقول؟» — أمثلةٌ لا شرحًا. */
export const EXAMPLES = [
  'افتح العقارات',
  'روح للعملاء',
  'ابحث عن سعد',
  'عقار جديد',
  'مهمّة جديدة',
  'الوضع الليلي',
  'ارجع',
];

const norm = (s) => normalizeArabic(s);

function stripPrefix(text, prefixes) {
  for (const p of [...prefixes].sort((a, b) => b.length - a.length)) {
    const pn = norm(p);
    if (text === pn) return '';
    if (text.startsWith(`${pn} `)) return text.slice(pn.length + 1).trim();
  }
  return null;
}

/**
 * صورٌ محتملةٌ لاسم الصفحة كما يُنطق: بأل وبغيرها، ومسبوقًا بحرف جرٍّ موصولٍ أو منفصل.
 * «روح للعملاء» تُقال أكثر من «اذهب إلى صفحة العملاء» — واللام موصولةٌ بالكلمة لا منفصلة،
 * فلا يكفي حذف كلمةٍ مستقلّة.
 */
function routeForms(rest) {
  const base = rest.replace(/^(صفحه|الى|على)\s+/, '').trim();
  const forms = new Set();
  const add = (x) => { const t = String(x || '').trim(); if (t) { forms.add(t); forms.add(`ال${t}`); } };
  add(base);
  // حروف الجرّ تُوصل بالكلمة في الكلام: «للعملاء» و«بالمهام» و«وللخريطة».
  // فتُقشَّر طبقةً طبقةً حتى يبقى الاسم مجرَّدًا.
  let peeled = base;
  for (let i = 0; i < 3; i++) {
    const next = peeled.replace(/^(?:لل|بال|فال|كال|وال|وللـ?|ال|و|ل|ب|ف|ك)/, '');
    if (next === peeled) break;
    peeled = next;
    add(peeled);
  }
  return [...forms].filter(Boolean);
}

function matchRoute(rest) {
  const forms = routeForms(rest);
  if (!forms.length) return null;
  for (const [key, words] of ROUTE_WORDS) {
    for (const w of words) {
      const wn = norm(w);
      const wnBare = wn.replace(/^ال/, '');
      if (forms.some((f) => f === wn || f === wnBare || f === `ال${wnBare}`)) return key;
    }
  }
  return null;
}

/**
 * يفهم الجملة المسموعة.
 * @returns {null|{kind:'route',route:string}|{kind:'search',query:string}
 *   |{kind:'new',route:string}|{kind:'theme',theme:string}|{kind:'back'}|{kind:'help'}}
 */
export function parseCommand(raw) {
  const text = norm(raw);
  if (!text) return null;

  if (['ارجع', 'رجوع', 'السابق', 'ارجع للخلف'].includes(text)) return { kind: 'back' };
  if (['ماذا اقول', 'ايش اقول', 'مساعده', 'الاوامر', 'وش اقول'].includes(text)) return { kind: 'help' };
  if (['الوضع الليلي', 'الوضع الداكن', 'داكن', 'ليلي'].includes(text)) return { kind: 'theme', theme: 'dark' };
  if (['الوضع النهاري', 'الوضع الفاتح', 'فاتح', 'نهاري'].includes(text)) return { kind: 'theme', theme: 'light' };

  // الإنشاء قبل الفتح: «عقار جديد» ليست «افتح العقارات»
  for (const [route, words] of NEW_WORDS) {
    if (words.some((w) => text === norm(w))) return { kind: 'new', route };
  }

  const searchRest = stripPrefix(text, SEARCH_VERBS);
  if (searchRest) return { kind: 'search', query: searchRest };

  const openRest = stripPrefix(text, OPEN_VERBS);
  if (openRest != null) {
    const route = matchRoute(openRest);
    if (route) return { kind: 'route', route };
  }

  // اسم الصفحة وحده أمرٌ كافٍ: «العقارات».
  const bare = matchRoute(text);
  if (bare) return { kind: 'route', route: bare };

  return null;
}

/** وصفٌ عربيّ لما سيُفعل — يُعرض قبل التنفيذ فلا يُفاجأ أحد. */
export function describe(cmd) {
  if (!cmd) return '';
  const routeLabel = (key) => ROUTE_WORDS.find(([k]) => k === key)?.[1][0] || key;
  switch (cmd.kind) {
    case 'route': return `أفتح «${routeLabel(cmd.route)}»`;
    case 'search': return `أبحث عن «${cmd.query}»`;
    case 'new': return `أفتح نموذج إضافةٍ جديد في «${routeLabel(cmd.route)}»`;
    case 'theme': return cmd.theme === 'dark' ? 'أحوّل إلى الوضع الليلي' : 'أحوّل إلى الوضع النهاري';
    case 'back': return 'أرجع للصفحة السابقة';
    case 'help': return 'أعرض أمثلة ما يمكن قوله';
    default: return '';
  }
}
