// قاموس الموضوعات — تصنيف التعليقات برمجيًّا قبل أن تراها النماذج.
// الفائدة: أرقام مضمونة الصحة تُسلَّم للنموذج جاهزة، فيفقد فرصة التقدير والاختراع.
// اللهجات السعودية مقصودة هنا: «واجد»، «مرة»، «زحمة»، «طفشت»، «ما ينلام».

/** تطبيع عربي: يزيل التشكيل والتطويل، ويوحّد الألف والياء والهاء والهمزات. */
export function normalizeAr(text) {
  return String(text || '')
    .replace(/[ً-ٰٟـ]/g, '')   // تشكيل وتطويل
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// كل موضوع: مفاتيحه (تُطابَق بعد التطبيع)، وقطبيته الافتراضية إن لم يُحسم من التعليق.
// `neg` كلمات تقلب المعنى، و`pos` كلمات تثبّته إيجابيًّا.
export const TOPICS = [
  { id: 'wait',      name: 'الانتظار وسرعة الخدمة',
    keys: ['انتظار','انتظرت','تاخير','تاخر','متاخر','بطيء','بطيئه','بطء','بطي','طال','طولوا','ساعه','دقيقه','دقيقة','سريع','سريعه','سرعه','فوري','ما تاخرو','الطابور','طابور','ينتظر','استنيت','استنينا'] },
  { id: 'quality',   name: 'جودة المنتج والطعم',
    keys: ['طعم','الطعم','لذيذ','لذيذه','طيب','ممتاز','ممتازه','رائع','زاكي','حلو','جوده','جودة','طازج','طازه','بايت','قديم','محروق','ني','مالح','سكر','باهت','خفيف','ثقيل','نكهه','نكهة','مقادير','وصفه'] },
  { id: 'price',     name: 'الأسعار والقيمة',
    keys: ['سعر','اسعار','غالي','غاليه','مرتفع','رخيص','مناسب','معقول','مبالغ','يستاهل','ما يستاهل','قيمه','قيمة','فاتوره','فاتورة','ريال','تسعير','عرض','خصم','حرامي'] },
  { id: 'service',   name: 'تعامل الموظفين',
    keys: ['موظف','موظفه','موظفين','عامل','عمال','خدمه','خدمة','تعامل','معامله','معاملة','لطيف','لطفاء','محترم','محترمين','ذوق','بشوش','عبوس','قليل الادب','وقح','ما رحب','رحب','ابتسامه','متعاون','اهمال','تجاهل','صراخ','باريستا','كاشير','النادل','نادل','مدير'] },
  { id: 'clean',     name: 'النظافة',
    keys: ['نظافه','نظافة','نظيف','نظيفه','وسخ','متسخ','قذر','رائحه','رائحة','ريحه','ذباب','صراصير','حشرات','دورات المياه','الحمام','الحمامات','معقم','تعقيم','اوساخ','بقع'] },
  { id: 'place',     name: 'المكان والأجواء',
    keys: ['المكان','اجواء','جو','جلسات','جلسه','كراسي','طاوله','طاولات','ديكور','اضاءه','اضاءة','هادي','هادئ','هدوء','ضوضاء','صوت عالي','موسيقى','مريح','ضيق','واسع','تكييف','رايق','رايقه','عائلي','عوائل','خاص','قسم النساء'] },
  { id: 'crowd',     name: 'الازدحام',
    keys: ['زحمه','زحمة','مزدحم','زحام','ازدحام','مليان','فاضي','ماكو مكان','ما في مكان','حجز','موعد','الذروه','الذروة','ناس واجد','طفشت من الزحمه'] },
  { id: 'parking',   name: 'المواقف',
    keys: ['مواقف','موقف','باركنق','ركن','اركن','صف السياره','مكان للسياره','ممنوع الوقوف','ساهر','ضيق المواقف'] },
  { id: 'delivery',  name: 'الطلبات الخارجية والتوصيل',
    keys: ['توصيل','دليفري','طلب خارجي','سفري','تيك اواي','التطبيق','هنقرستيشن','جاهز','ناقص','نسوا','الطلب خطا','خطا في الطلب','التغليف','تغليف','كيس','وصل بارد'] },
  { id: 'wifi',      name: 'الإنترنت والمرافق التقنية',
    keys: ['انترنت','واي فاي','وايفاي','شبكه','شبكة','نت','بطء النت','كهرباء','قابس','شاحن','فيش','مقبس'] },
  { id: 'hygiene_staff', name: 'الالتزام والانضباط',
    keys: ['مواعيد','الدوام','مفتوح','مغلق','سكروا','ما فتحو','التزام','وعدوني','ما التزمو','اخلفوا','موعد التسليم'] },
  { id: 'money',     name: 'الدفع والفوترة',
    keys: ['الدفع','كاش','شبكه بنكيه','مدى','ابل باي','فيزا','فاتوره غلط','ما عطوني فاتوره','ضريبه','الضريبة','باقي','الباقي','خصم زايد'] },
  { id: 'kids',      name: 'الأطفال والعائلات',
    keys: ['اطفال','طفل','العاب','منطقه العاب','كرسي اطفال','عائله','عوائل','مناسب للعائله','حضانه'] },
  { id: 'access',    name: 'الوصول وذوو الاحتياجات',
    keys: ['الموقع','صعب الوصول','سهل الوصول','لوحه','لوحة','ما لقيته','الخرايط','المدخل','درج','منحدر','كرسي متحرك','ذوي الاعاقه','مصعد'] },
];

// كلمات القطبية العامة — تُستعمل حين لا يحسم عدد النجوم الاتجاه.
const NEG_WORDS = ['سيء','سيئه','زفت','فاشل','زباله','ما انصح','لا انصح','مخيب','مزعج','تعبان','رديء','اسوا','ندمت','مره سيء','ما عجبني','ما ينلام','مقرف','طفشت','خايس'];
const POS_WORDS = ['ممتاز','رائع','جميل','افضل','انصح','يستاهل','مبدع','راقي','محترم','نظيف','سريع','لذيذ','حلو','تحفه','وايد حلو','مره حلو','ما شاء الله'];

const INTENSIFIERS = ['جدا','مره','مرره','واجد','كثير','بشده','للغايه','فوق العاده'];

/* ───── مفاتيح يضيفها المستخدم ─────
   القاموس أوّليّ بطبعه، ولهجات السعودية أوسع من أي قائمة تُكتَب مرة.
   ما يضيفه المستخدم يُحفَظ في متصفحه ويندمج مع الأصل عند كل مطابقة. */

const CUSTOM_KEY = 'rabih:lexicon';

function readCustom() {
  try { return JSON.parse(localStorage.getItem(CUSTOM_KEY) || '{}'); }
  catch { return {}; }
}

function writeCustom(map) {
  try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(map)); return true; }
  catch { return false; }
}

/** @returns {{ok:boolean, reason?:string}} */
export function addKeyword(topicId, word) {
  const clean = normalizeAr(word);
  if (!clean || clean.length < 2) return { ok: false, reason: 'الكلمة قصيرة جدًّا.' };
  if (!TOPICS.some((t) => t.id === topicId)) return { ok: false, reason: 'الموضوع غير معروف.' };

  const existing = TOPICS.find((t) => t.normKeysCache?.includes(clean)
    || t.keys.map(normalizeAr).includes(clean));
  if (existing) return { ok: false, reason: `الكلمة موجودة أصلًا في «${existing.name}».` };

  const custom = readCustom();
  const list = custom[topicId] || [];
  if (list.includes(clean)) return { ok: false, reason: 'أضفتها من قبل.' };
  custom[topicId] = [...list, clean];
  if (!writeCustom(custom)) return { ok: false, reason: 'تعذّر الحفظ في المتصفح.' };
  rebuild();
  return { ok: true };
}

export function removeKeyword(topicId, word) {
  const custom = readCustom();
  const clean = normalizeAr(word);
  custom[topicId] = (custom[topicId] || []).filter((w) => w !== clean);
  writeCustom(custom);
  rebuild();
}

export const customKeywords = () => readCustom();

/**
 * كل كلمات القاموس الحيّة مفرَّقةً — الأصل وما أضافه المستخدم.
 *
 * يحتاجها مستخرج الكيانات ليستبعدها: كلمةٌ صارت موضوعًا لا تُعدّ كيانًا أيضًا.
 * وكان يبنيها من الأصل الساكن مرة واحدة عند التحميل، فتظهر الكلمة المضافة
 * موضوعًا وكيانًا في آنٍ واحد.
 */
export function allKeywords() {
  const out = new Set();
  for (const t of INDEX) {
    for (const k of t.normKeys) for (const w of k.split(' ')) if (w) out.add(w);
  }
  return out;
}

export function resetCustom() {
  writeCustom({});
  rebuild();
}

/** يبني فهرسًا مطبَّعًا لتسريع المطابقة، ويُعاد بناؤه كلما تغيّر قاموس المستخدم. */
let INDEX = [];
function rebuild() {
  const custom = readCustom();
  INDEX = TOPICS.map((t) => ({
    ...t,
    normKeys: [...new Set([...t.keys.map(normalizeAr), ...(custom[t.id] || [])])].filter(Boolean),
  }));
}
rebuild();
const NEG_N = NEG_WORDS.map(normalizeAr);
const POS_N = POS_WORDS.map(normalizeAr);
const INT_N = INTENSIFIERS.map(normalizeAr);

// سوابق عربية تلتصق بالكلمة فتخفيها عن المطابقة: «الانتظار»، «وبالسعر»، «للموظف».
const PREFIXES = ['وبال', 'فبال', 'وال', 'فال', 'بال', 'كال', 'لل', 'ال', 'و', 'ف', 'ب', 'ك', 'ل'];

function stripPrefix(token) {
  for (const p of PREFIXES) {
    if (token.length >= p.length + 2 && token.startsWith(p)) return token.slice(p.length);
  }
  return token;
}

/**
 * مطابقة كلمة لا حرف: «انتظرت» لا تُطابِق «نت»، و«الانتظار» تُطابِق «انتظار».
 * المفاتيح متعددة الكلمات تُطابَق كعبارة داخل النص.
 */
function matchesKey(tokens, stripped, norm, key) {
  if (key.includes(' ')) return norm.includes(key);
  if (tokens.includes(key) || stripped.includes(key)) return true;
  // لواحق الجمع والتأنيث والضمائر: «موظفين» تُطابِق «موظف»، بشرط ألا يكون المفتاح قصيرًا فيتوسّع.
  if (key.length >= 4) return stripped.some((t) => t.startsWith(key) && t.length - key.length <= 3);
  return false;
}

const tokenize = (norm) => norm.split(' ').filter(Boolean);

/** يُرجع معرّفات المواضيع الواردة في نص واحد. */
export function topicsOf(text) {
  const n = normalizeAr(text);
  if (!n) return [];
  const tokens = tokenize(n);
  const stripped = tokens.map(stripPrefix);
  const hits = [];
  for (const t of INDEX) {
    if (t.normKeys.some((k) => matchesKey(tokens, stripped, n, k))) hits.push(t.id);
  }
  return hits;
}

// فواصل الاستدراك: ما بعدها حكم مستقل عمّا قبلها.
const CLAUSE_SPLIT = /\s(?:بس|لكن|لاكن|الا ان|غير ان|مع ان|اما)\s|[،.؛!؟\n]/;

/** يقطّع النص إلى جُمل حُكم مستقلة. */
function clausesOf(norm) {
  return norm.split(CLAUSE_SPLIT).map((c) => c.trim()).filter(Boolean);
}

function clauseSentiment(clause) {
  const neg = NEG_N.filter((w) => w && clause.includes(w)).length;
  const pos = POS_N.filter((w) => w && clause.includes(w)).length;
  if (neg > pos) return 'neg';
  if (pos > neg) return 'pos';
  return null;
}

/**
 * قطبية موضوع بعينه داخل تعليق.
 * تُحسم من الجملة التي ورد فيها الموضوع أولًا — فتعليقٌ بأربع نجوم يشكو المواقف
 * تُسجَّل مواقفُه سلبيةً كما هي، لا إيجابيةً تبعًا لنجومه.
 */
export function topicSentiment(review, topicId) {
  const t = INDEX.find((x) => x.id === topicId);
  const n = normalizeAr(review?.text);
  if (t && n) {
    for (const clause of clausesOf(n)) {
      const tokens = tokenize(clause);
      const stripped = tokens.map(stripPrefix);
      if (!t.normKeys.some((k) => matchesKey(tokens, stripped, clause, k))) continue;
      const s = clauseSentiment(clause);
      if (s) return s;
    }
  }
  return sentimentOf(review);
}

/**
 * اتجاه التعليق: يُحسم بعدد النجوم أولًا لأنه أصدق من الكلمات،
 * فإن غاب فبالكلمات، فإن تعادلت فمحايد.
 * @returns {'pos'|'neg'|'neu'}
 */
export function sentimentOf(review) {
  const r = Number(review?.rating);
  if (r >= 4) return 'pos';
  if (r >= 1 && r <= 2) return 'neg';

  const n = normalizeAr(review?.text);
  if (!n) return 'neu';
  const neg = NEG_N.filter((w) => w && n.includes(w)).length;
  const pos = POS_N.filter((w) => w && n.includes(w)).length;
  if (neg > pos) return 'neg';
  if (pos > neg) return 'pos';
  return 'neu';
}

/** هل في النص مبالغة لفظية؟ يُستعمل في ترتيب الاقتباسات الدالّة. */
export const isIntense = (text) => {
  const n = normalizeAr(text);
  return INT_N.some((w) => w && n.includes(w));
};

/**
 * إحصاء المواضيع عبر كل التعليقات.
 * @returns {Array<{id,name,total,pos,neg,neu,ids:string[],negIds:string[],share:number,verdict:string}>}
 */
export function topicStats(place) {
  const reviews = place?.reviews || [];
  const map = new Map(TOPICS.map((t) => [t.id, {
    id: t.id, name: t.name, total: 0, pos: 0, neg: 0, neu: 0, ids: [], negIds: [], posIds: [],
  }]));

  for (const r of reviews) {
    const hits = topicsOf(r.text);
    if (!hits.length) continue;
    for (const id of hits) {
      const row = map.get(id);
      if (!row) continue;
      const ts = topicSentiment(r, id);   // قطبية هذا الموضوع تحديدًا، لا قطبية التعليق كلّه
      row.total += 1;
      row.ids.push(r.id);
      row[ts] += 1;
      if (ts === 'neg') row.negIds.push(r.id);
      if (ts === 'pos') row.posIds.push(r.id);
    }
  }

  const total = reviews.length || 1;
  return [...map.values()]
    .filter((t) => t.total > 0)
    .map((t) => ({
      ...t,
      share: Number(((t.total / total) * 100).toFixed(1)),
      verdict: t.neg > t.pos ? 'سلبي' : (t.pos > t.neg ? 'إيجابي' : 'مختلط'),
    }))
    .sort((a, b) => b.total - a.total || b.neg - a.neg);
}

/** التعليقات التي لم يلتقطها القاموس — مؤشّر على نقص فيه لا على خلوّها من المعنى. */
export function uncovered(place) {
  return (place?.reviews || [])
    .filter((r) => (r.text || '').trim().length > 8 && topicsOf(r.text).length === 0)
    .map((r) => r.id);
}

/** أبرز الشكاوى: المواضيع السلبية مرتّبة بعدد مرات ورودها. */
export function topComplaints(place, limit = 5) {
  return topicStats(place)
    .filter((t) => t.neg > 0)
    .sort((a, b) => b.neg - a.neg)
    .slice(0, limit);
}
