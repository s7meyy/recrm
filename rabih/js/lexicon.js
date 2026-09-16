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
    keys: ['انتظار','انتظرت','تاخير','تاخر','متاخر','بطيء','بطيئه','بطء','بطي','طال','طولوا','ساعه','دقيقه','دقيقة','سريع','سريعه','سرعه','فوري','ما تاخرو','الطابور','طابور','ينتظر','استنيت','استنينا',
      // الإنجليزية: تعليقات الوافدين والزوّار تُصنَّف كما تُصنَّف العربية.
      'wait','waited','waiting','slow','delay','delayed','late','queue','line','quick','fast','prompt','minutes','hour'],
    neg: ['طويل','طويله','طول','يطول','بطي','بطيء','بطيئه','بطء','تاخير','تاخر','متاخر','استنيت','استنينا','طابور','نص ساعه','ساعه كامله','long','slow','forever'],
    pos: ['سريع','سريعه','سرعه','فوري','فوريه','ما تاخرو','مباشره','quick','fast','prompt','instant'] },
  { id: 'quality',   name: 'جودة المنتج والطعم',
    keys: ['طعم','الطعم','لذيذ','لذيذه','طيب','ممتاز','ممتازه','رائع','زاكي','حلو','جوده','جودة','طازج','طازه','بايت','قديم','محروق','ني','مالح','سكر','باهت','خفيف','ثقيل','نكهه','نكهة','مقادير','وصفه',
      // الإنجليزية: تعليقات الوافدين والزوّار تُصنَّف كما تُصنَّف العربية.
      'taste','tasty','delicious','flavor','flavour','fresh','stale','burnt','undercooked','overcooked','bland','quality','food','coffee','drink','dessert'],
    neg: ['بايت','قديم','محروق','ني','مالح','باهت','بارد','مقرف','رديء','stale','burnt','bland','cold','undercooked'],
    pos: ['لذيذ','لذيذه','طازج','طازه','طيب','ممتاز','زاكي','delicious','fresh','tasty','excellent'] },
  { id: 'price',     name: 'الأسعار والقيمة',
    keys: ['سعر','اسعار','غالي','غاليه','مرتفع','رخيص','مناسب','معقول','مبالغ','يستاهل','ما يستاهل','قيمه','قيمة','فاتوره','فاتورة','ريال','تسعير','عرض','خصم','حرامي',
      // الإنجليزية: تعليقات الوافدين والزوّار تُصنَّف كما تُصنَّف العربية.
      'price','prices','expensive','pricey','cheap','affordable','overpriced','value','worth','bill','cost'],
    neg: ['غالي','غاليه','غاليه','مبالغ','مرتفع','مرتفعه','ما يستاهل','حرامي','مبالغه','فوق سعره','expensive','pricey','overpriced','rip off'],
    pos: ['رخيص','رخيصه','مناسب','مناسبه','معقول','معقوله','يستاهل','قيمه ممتازه','affordable','cheap','worth','value'] },
  { id: 'service',   name: 'تعامل الموظفين',
    keys: ['موظف','موظفه','موظفين','عامل','عمال','خدمه','خدمة','تعامل','معامله','معاملة','لطيف','لطفاء','محترم','محترمين','ذوق','بشوش','عبوس','قليل الادب','وقح','ما رحب','رحب','ابتسامه','متعاون','اهمال','تجاهل','صراخ','باريستا','كاشير','النادل','نادل','مدير',
      // الإنجليزية: تعليقات الوافدين والزوّار تُصنَّف كما تُصنَّف العربية.
      'staff','waiter','waitress','employee','service','rude','polite','friendly','helpful','manager','barista','cashier','attitude','ignored'],
    neg: ['وقح','قليل الادب','عبوس','ما رحب','اهمال','تجاهل','صراخ','سيء','بارد','متعجرف','rude','ignored','unfriendly','careless'],
    pos: ['لطيف','لطفاء','محترم','محترمين','ذوق','بشوش','متعاون','راقي','friendly','polite','helpful','attentive'] },
  { id: 'clean',     name: 'النظافة',
    keys: ['نظافه','نظافة','نظيف','نظيفه','وسخ','متسخ','قذر','رائحه','رائحة','ريحه','ذباب','صراصير','حشرات','دورات المياه','الحمام','الحمامات','معقم','تعقيم','اوساخ','بقع',
      // الإنجليزية: تعليقات الوافدين والزوّار تُصنَّف كما تُصنَّف العربية.
      'clean','cleanliness','dirty','filthy','smell','smelly','hygiene','restroom','toilet','bathroom','flies','insects'],
    neg: ['وسخ','متسخ','قذر','اوساخ','بقع','ذباب','صراصير','حشرات','ريحه','رائحه','كريهه','dirty','filthy','smelly','flies'],
    pos: ['نظيف','نظيفه','نظافه','معقم','مرتب','clean','spotless','hygienic'] },
  { id: 'place',     name: 'المكان والأجواء',
    keys: ['المكان','اجواء','جو','جلسات','جلسه','كراسي','طاوله','طاولات','ديكور','اضاءه','اضاءة','هادي','هادئ','هدوء','ضوضاء','صوت عالي','موسيقى','مريح','ضيق','واسع','تكييف','رايق','رايقه','عائلي','عوائل','خاص','قسم النساء',
      // الإنجليزية: تعليقات الوافدين والزوّار تُصنَّف كما تُصنَّف العربية.
      'place','ambience','ambiance','atmosphere','decor','seating','seats','cozy','comfortable','noisy','noise','quiet','music','lighting','crowded space','spacious'],
    neg: ['ضيق','ضيقه','ضوضاء','صوت عالي','مزعج','حار','بارد','اضاءه ضعيفه','noisy','cramped','uncomfortable'],
    pos: ['هادي','هادئ','هدوء','مريح','مريحه','واسع','رايق','جميل','cozy','comfortable','quiet','spacious'] },
  { id: 'crowd',     name: 'الازدحام',
    keys: ['زحمه','زحمة','مزدحم','زحام','ازدحام','مليان','فاضي','ماكو مكان','ما في مكان','حجز','موعد','الذروه','الذروة','ناس واجد','طفشت من الزحمه',
      // الإنجليزية: تعليقات الوافدين والزوّار تُصنَّف كما تُصنَّف العربية.
      'crowded','busy','packed','full','rush','peak','no seats','reservation','booking'],
    neg: ['زحمه','مزدحم','زحام','ازدحام','مليان','ما في مكان','ماكو مكان','طفشت','crowded','packed','busy','full'],
    pos: ['فاضي','هادي','واسع','ما فيه زحمه','quiet','empty','spacious'] },
  { id: 'parking',   name: 'المواقف',
    keys: ['مواقف','موقف','باركنق','ركن','اركن','صف السياره','مكان للسياره','ممنوع الوقوف','ساهر','ضيق المواقف',
      // الإنجليزية: تعليقات الوافدين والزوّار تُصنَّف كما تُصنَّف العربية.
      'parking','park','valet','car park','no parking'],
    neg: ['مافي','ما في','ماكو','ضيق','ضيقه','قليل','قليله','صعب','بعيد','ممنوع','مزدحم','no parking','hard to park','far'],
    pos: ['واسع','واسعه','متوفر','متوفره','كثيره','قريب','سهل','plenty','easy','free'] },
  { id: 'delivery',  name: 'الطلبات الخارجية والتوصيل',
    keys: ['توصيل','دليفري','طلب خارجي','سفري','تيك اواي','التطبيق','هنقرستيشن','جاهز','ناقص','نسوا','الطلب خطا','خطا في الطلب','التغليف','تغليف','كيس','وصل بارد',
      // الإنجليزية: تعليقات الوافدين والزوّار تُصنَّف كما تُصنَّف العربية.
      'delivery','deliver','takeaway','take away','takeout','pickup','order','app','packaging','cold when it arrived','missing items','wrong order'],
    neg: ['ناقص','نسوا','بارد','متاخر','خطا','تالف','مسكوب','cold','missing','wrong','late'],
    pos: ['كامل','سريع','مغلف','ساخن','مرتب','hot','complete','fast','well packed'] },
  { id: 'wifi',      name: 'الإنترنت والمرافق التقنية',
    keys: ['انترنت','واي فاي','وايفاي','شبكه','شبكة','نت','بطء النت','كهرباء','قابس','شاحن','فيش','مقبس',
      // الإنجليزية: تعليقات الوافدين والزوّار تُصنَّف كما تُصنَّف العربية.
      'wifi','wi-fi','internet','network','connection','charger','socket','outlet','plug'],
    neg: ['ضعيف','ضعيفه','بطي','منقطع','ما يشتغل','مقطوع','سيء','weak','slow','down','not working'],
    pos: ['قوي','قويه','سريع','ممتاز','متوفر','strong','fast','reliable'] },
  { id: 'hygiene_staff', name: 'الالتزام والانضباط',
    keys: ['مواعيد','الدوام','مفتوح','مغلق','سكروا','ما فتحو','التزام','وعدوني','ما التزمو','اخلفوا','موعد التسليم',
      // الإنجليزية: تعليقات الوافدين والزوّار تُصنَّف كما تُصنَّف العربية.
      'opening hours','closed','opened','hours','schedule','on time','promised'],
    neg: ['ما التزمو','اخلفوا','مغلق','سكروا','ما فتحو','تاخروا','closed','late','broke the promise'],
    pos: ['التزام','في الموعد','مفتوح','on time','punctual'] },
  { id: 'money',     name: 'الدفع والفوترة',
    keys: ['الدفع','كاش','شبكه بنكيه','مدى','ابل باي','فيزا','فاتوره غلط','ما عطوني فاتوره','ضريبه','الضريبة','باقي','الباقي','خصم زايد',
      // الإنجليزية: تعليقات الوافدين والزوّار تُصنَّف كما تُصنَّف العربية.
      'payment','cash','card','apple pay','visa','mastercard','receipt','invoice','vat','tax','change'],
    neg: ['ما عطوني فاتوره','فاتوره غلط','خصم زايد','ما فيه شبكه','معطل','wrong bill','no receipt'],
    pos: ['فاتوره واضحه','كل الطرق','سهل','clear receipt'] },
  { id: 'kids',      name: 'الأطفال والعائلات',
    keys: ['اطفال','طفل','العاب','منطقه العاب','كرسي اطفال','عائله','عوائل','مناسب للعائله','حضانه',
      // الإنجليزية: تعليقات الوافدين والزوّار تُصنَّف كما تُصنَّف العربية.
      'kids','children','child','family','families','play area','high chair'],
    neg: ['ما فيه','مافي','ضيق','غير مناسب','no kids area','not family friendly'],
    pos: ['مناسب للعائله','فيه العاب','كرسي اطفال','family friendly','play area'] },
  { id: 'access',    name: 'الوصول وذوو الاحتياجات',
    keys: ['الموقع','صعب الوصول','سهل الوصول','لوحه','لوحة','ما لقيته','الخرايط','المدخل','درج','منحدر','كرسي متحرك','ذوي الاعاقه','مصعد',
      // الإنجليزية: تعليقات الوافدين والزوّار تُصنَّف كما تُصنَّف العربية.
      'location','hard to find','easy to find','entrance','stairs','ramp','wheelchair','accessible','elevator','lift','sign'],
    neg: ['صعب الوصول','ما لقيته','بعيد','مخفي','بلا لوحه','hard to find','hidden','far'],
    pos: ['سهل الوصول','واضح','قريب','easy to find','clear','close'] },
];

// كلمات القطبية العامة — تُستعمل حين لا يحسم عدد النجوم الاتجاه.
// والإنجليزية معها: تعليقٌ لا يُصنَّف يسقط من الأرقام كلها بلا أن يُعلَن.
const NEG_WORDS_EN = ['bad','terrible','awful','worst','horrible','disappointing','disappointed','never again','not recommend','poor','rude','dirty','overpriced','waste'];
const POS_WORDS_EN = ['great','excellent','amazing','best','wonderful','perfect','love','lovely','recommend','fantastic','friendly','delicious','clean','cozy','good'];

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
    negN: (t.neg || []).map(normalizeAr).filter(Boolean),
    posN: (t.pos || []).map(normalizeAr).filter(Boolean),
  }));
}
rebuild();
const NEG_N = [...NEG_WORDS, ...NEG_WORDS_EN].map(normalizeAr);
const POS_N = [...POS_WORDS, ...POS_WORDS_EN].map(normalizeAr);
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

/* ألفاظُ نقصٍ وغياب: لا تُعَدّ ذمًّا للمنشأة كلها فتبقى خارج NEG_WORDS،
   وهي حاسمةٌ إذا جاورت موضوعًا: «مافي مواقف»، «المواقف ضيّقة»، «النت ضعيف».
   وكانت تسقط كلُّها، فيُؤخَذ حكمُ الموضوع من نجوم التعليق: «المواقف ضيّقة»
   في تعليقٍ بخمس نجوم كانت تُسجَّل ثناءً على المواقف. */
const LACK_N = ['مافي', 'ما في', 'مافيه', 'ما فيه', 'ماكو', 'بدون', 'ينقص', 'ناقص', 'مفقود',
  'ضيق', 'ضيقه', 'قليل', 'قليله', 'شحيح', 'ضعيف', 'ضعيفه', 'محدود', 'محدوده', 'صعب', 'صعبه',
  'مزعج', 'مزعجه', 'عالي', 'عاليه', 'مرتفع', 'مرتفعه', 'بعيد', 'بعيده', 'مغلق', 'معطل'].map(normalizeAr);

/* الكلمةُ الحاسمة تخصّ الموضوعَ إن جاورته. و«و» في العربية تصل الجملتين
   بلا فاصل («القهوة ممتازة وفيه مواقف»)، فتقطيعُ الجُمل وحده يُسرِّب ثناءَ
   القهوة إلى المواقف. والجوارُ أضبط: ما بَعُد عن الموضوع لا يصفه. */
const NEAR = 4;

function nearbyPolarity(tokens, stripped, keyIdx, topic) {
  /* ألفاظُ الموضوع نفسِه تتقدّم العامَّ: «طويل» ذمٌّ للانتظار ومدحٌ للجلسة،
     و«غالي» ذمٌّ للسعر لا لسواه. والحقلان `neg`/`pos` كانا موصوفين في رأس
     هذا الملف منذ كُتب ولم يملأهما أحد، فكان حكمُ كل موضوعٍ يُؤخَذ من ألفاظ
     الذمّ العامة وحدها — و«الاسعار غالية» ليس فيها لفظُ ذمٍّ عام. */
  const clause = (from, to) => {
    const wide = [];
    for (let i = Math.max(0, from); i <= Math.min(tokens.length - 1, to); i += 1) wide.push(tokens[i]);
    return wide.join(' ');
  };
  const window = clause(keyIdx - NEAR, keyIdx + NEAR);
  const own = (list) => list.some((x) => x && window.includes(x));
  if (topic) {
    const n = own(topic.negN);
    const p = own(topic.posN);
    if (n && !p) return 'neg';
    if (p && !n) return 'pos';
  }

  let neg = 0;
  let pos = 0;
  for (let i = 0; i < tokens.length; i += 1) {
    if (Math.abs(i - keyIdx) > NEAR) continue;
    const w = tokens[i];
    const b = stripped[i];
    const hit = (list) => list.some((x) => x && (w === x || b === x || w.startsWith(x) || b.startsWith(x)));
    if (hit(NEG_N) || hit(LACK_N)) neg += 1;
    else if (hit(POS_N)) pos += 1;
  }
  if (neg > pos) return 'neg';
  if (pos > neg) return 'pos';
  return null;
}

/** موضعُ أول مطابقةٍ لمفتاحٍ من مفاتيح الموضوع في الجملة، أو -1. */
function keyIndex(tokens, stripped, normKeys) {
  for (let i = 0; i < tokens.length; i += 1) {
    if (normKeys.some((k) => !k.includes(' ') && (tokens[i] === k || stripped[i] === k
      || (k.length >= 4 && stripped[i].startsWith(k) && stripped[i].length - k.length <= 3)))) return i;
  }
  /* والمفتاحُ المركّب يُطابَق نصًّا لا كلمةً («وصل بارد»، «طلب خارجي»)،
     فكان لا يُعرَف موضعُه فيسقط الجوارُ كلُّه ويُؤخَذ الحكم من النجوم. */
  for (const k of normKeys) {
    if (!k.includes(' ')) continue;
    const parts = k.split(' ');
    for (let i = 0; i + parts.length <= tokens.length; i += 1) {
      if (parts.every((w, j) => tokens[i + j] === w || stripped[i + j] === w)) return i;
    }
  }
  return -1;
}

/**
 * قطبية موضوع بعينه داخل تعليق.
 * تُحسم من الجملة التي ورد فيها الموضوع أولًا — فتعليقٌ بأربع نجوم يشكو المواقف
 * تُسجَّل مواقفُه سلبيةً كما هي، لا إيجابيةً تبعًا لنجومه.
 */
export function topicSentiment(review, topicId) {
  return topicSentimentDetail(review, topicId).s;
}

/**
 * القطبية ومصدرُها — وبينهما فرقٌ يُغيّر قراءة الجدول.
 *
 * «stated»: في جملة الموضوع نفسها لفظٌ يحسمه — «المواقف ضيّقة»، «القهوة لذيذة».
 * «inferred»: لا لفظ فيها، فأُخذت من نجوم التعليق كلّه. وهذا موضع الوهم:
 * تعليقٌ بخمس نجوم يقول «القهوة ممتازة وفيه مواقف» كان يُسجَّل ثناءً على
 * المواقف، وصاحبُه إنما ذكر واقعًا. فيتضخّم عمود «إيجابي» بذكرٍ مجرَّد،
 * ويقرأ صاحب المحل قوّةً ليست له.
 *
 * ولا يُطرَح المستنبَط من العدّ — طرحُه يُخفي ذكرًا وقع فعلًا — بل يُفصَل
 * ويُعلَن، ويُبنى ما يُبنى على المنصوص وحده.
 *
 * @returns {{s:'pos'|'neg'|'neu', stated:boolean}}
 */
export function topicSentimentDetail(review, topicId) {
  const t = INDEX.find((x) => x.id === topicId);
  const n = normalizeAr(review?.text);
  if (t && n) {
    for (const clause of clausesOf(n)) {
      const tokens = tokenize(clause);
      const stripped = tokens.map(stripPrefix);
      if (!t.normKeys.some((k) => matchesKey(tokens, stripped, clause, k))) continue;
      /* الجوارُ أولًا: ما لاصق الموضوع يصفه. فإن لم يكن حوله شيء فالجملةُ
         كلها — وهي جملةٌ واحدة قُطِعت عند الاستدراك، فحكمُها يخصّ ما فيها. */
      const idx = keyIndex(tokens, stripped, t.normKeys);
      const near = idx >= 0 ? nearbyPolarity(tokens, stripped, idx, t) : null;
      if (near) return { s: near, stated: true };
      const s = clauseSentiment(clause);
      if (s) return { s, stated: true };
    }
  }
  return { s: sentimentOf(review), stated: false };
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
/**
 * ما لم يقع تحت أي موضوع.
 *
 * كان `topicStats` يتخطّى التعليق الذي لا يطابق كلمةً من القاموس بلا أثر،
 * فيقرأ صاحبُ المحل جدول المواضيع ويحسبه وصفًا لتعليقاته كلّها — وهو وصفٌ
 * لما عرفه القاموس منها وحده. والصدق أن يُقال كم تعليقًا لم يُصنَّف.
 *
 * @returns {{classified:number, unclassified:number, ids:string[], share:number}}
 */
export function topicCoverage(place) {
  const reviews = place?.reviews || [];
  const ids = [];
  for (const r of reviews) {
    if (!topicsOf(r.text).length) ids.push(r.id);
  }
  const total = reviews.length;
  return {
    classified: total - ids.length,
    unclassified: ids.length,
    ids,
    share: total ? Number(((ids.length / total) * 100).toFixed(1)) : 0,
  };
}

/* رمزٌ لكل موضوع — يُعين العين على التقاط الصف في جدولٍ طويل.
   ومقصودٌ أن تكون رموزًا خطّيّةً هادئة لا ملوّنة: التقرير يُطبَع بالأبيض
   والأسود عند كثيرين، وتقريرُ عملٍ لا يليق به زخرف. */
const TOPIC_ICONS = {
  wait: '⏱', quality: '★', price: '◈', service: '☺', clean: '✦',
  place: '⌂', crowd: '▦', parking: '⊞', delivery: '➤', wifi: '≋',
  hygiene_staff: '⌛', money: '▤', kids: '☗', access: '⚑',
};

/** @returns {string} رمز الموضوع، أو نقطةٌ محايدة إن لم يُعرَف. */
export const topicIcon = (id) => TOPIC_ICONS[id] || '•';

/* لونٌ ثابت لكل موضوع، يتبعه في الرسم والخطة و«ما ينجح» — فتُتَتبَّع الشكوى
   بالعين عبر التقرير بلا قراءةِ اسمها في كل موضع. وهي ألوانٌ خافتة تصلح
   للطباعة، ولا تحمل معنى القطبية: الأخضر والأحمر محجوزان لها وحدها. */
const TOPIC_COLORS = {
  wait: '#8c6d1f', quality: '#7d5ba6', price: '#1f6f8b', service: '#a34a28',
  clean: '#2d7d6f', place: '#4a6fa5', crowd: '#8b5a3c', parking: '#5c6b73',
  delivery: '#96622d', wifi: '#3f7d8c', hygiene_staff: '#6b5b95',
  money: '#4a7c59', kids: '#a8577e', access: '#556b2f',
};

/** @returns {string} لون الموضوع. */
export const topicColor = (id) => TOPIC_COLORS[id] || '#6b7683';

export function topicStats(place) {
  const reviews = place?.reviews || [];
  const map = new Map(TOPICS.map((t) => [t.id, {
    id: t.id, name: t.name, total: 0, pos: 0, neg: 0, neu: 0, ids: [], negIds: [], posIds: [],
    posStated: 0, negStated: 0, neuStated: 0, inferred: 0,
  }]));

  for (const r of reviews) {
    const hits = topicsOf(r.text);
    if (!hits.length) continue;
    for (const id of hits) {
      const row = map.get(id);
      if (!row) continue;
      // قطبية هذا الموضوع تحديدًا، لا قطبية التعليق كلّه — ومعها: أمنصوصةٌ أم مستنبَطة؟
      const { s: ts, stated } = topicSentimentDetail(r, id);
      row.total += 1;
      row.ids.push(r.id);
      row[ts] += 1;
      if (stated) row[`${ts}Stated`] += 1; else row.inferred += 1;
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
      /* حكمٌ على ذكرٍ واحد ليس حكمًا: «سلبي» عن تعليقٍ فردٍ يُقرأ صفةً
         للمنشأة، وهو خبرُ واحدٍ لا غير. فما دون ثلاثة يُقال فيه «ذكرٌ مفرد». */
      verdict: t.total < 3 ? (t.total === 1 ? 'ذكرٌ مفرد' : 'ذكران')
        : (t.neg > t.pos ? 'سلبي' : (t.pos > t.neg ? 'إيجابي' : 'مختلط')),
      decided: t.total >= 3,
      // نصيبُ الموضوع من العيّنة — محسوبٌ وكان غائبًا عن الجدول.
      sharePct: total ? Number(((t.total / total) * 100).toFixed(1)) : 0,
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
