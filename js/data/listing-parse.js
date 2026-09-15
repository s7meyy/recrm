// محلّل نصي محلي لنص العرض الخارجي الملصوق (المرحلة ٤).
//
// مجاني تمامًا: لا شبكة ولا مفتاح ولا مكتبة خارجية، ويعمل دون اتصال ولا تخرج البيانات من الجهاز.
// قراءته تقريبية: يُعبّئ الحقول الفارغة في النموذج وتبقى كلها قابلة للتعديل،
// والاعتماد اليدوي شرط دائم (القسم ٥ من الوثيقة) — فلا يُحفظ شيء بلا مراجعتك.
//
// لا يقرأ الصور: استخرج نص صورة الشاشة بأداة جهازك (النص المباشر في آيفون، أو عدسة جوجل)
// ثم الصقه هنا. وتفعيل مزوّد رؤية (Gemini أو غيره) يبقى مكانه ملف extraction.js وحده.

/* تطبيع يحافظ على علامات الترقيم (تلزم لقراءة الأرقام: 820,000 و1.500.000).
   لهذا لا يُستعمل normalizeArabic هنا: هو يستبدل الترقيم بمسافات عن قصد. */
const TASHKEEL = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g;
const INVISIBLE = /[\u00AD\u061C\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g;
const ARABIC_INDIC_DIGITS = /[\u0660-\u0669\u06F0-\u06F9]/g;

function prep(value) {
  let s = String(value ?? '');
  if (!s) return '';
  try { s = s.normalize('NFKC'); } catch (_) { /* متصفح لا يدعم normalize */ }
  s = s.replace(INVISIBLE, '').replace(TASHKEEL, '').replace(/\u0640/g, '');
  s = s.replace(ARABIC_INDIC_DIGITS, (d) => {
    const code = d.charCodeAt(0);
    return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);
  });
  return s
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/[ىی]/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ک/g, 'ك')
    .replace(/[\t\r]+/g, ' ');
}

const loose = (s) => prep(s).replace(/ا/g, '').replace(/\s+/g, '');

/* ===== الأرقام ===== */

// الفاصلة العشرية العربية `٫` (U+066B) **ليست** فاصل آلاف — فاصلُ الآلاف `٬` (U+066C).
// وكانت مُدرَجةً في فواصل الآلاف، فيفشل النمط الأول على «١٫٥ مليون» ثم يلتقط الثاني
// «5» وحدها فتصير خمسة ملايين بدل مليونٍ ونصف. خطأٌ بثلاثة ملايين ونصف، صامت.
const NUM = String.raw`\d{1,3}(?:[.,\u060C\u066C ]\d{3})+|\d+(?:[.,\u066B]\d+)?`;

function toNumber(text) {
  let s = String(text ?? '').replace(/[\s\u060C\u066C,]/g, '');
  if ((s.match(/\./g) || []).length > 1 || /^\d+\.\d{3}$/.test(s)) s = s.replace(/\./g, '');
  s = s.replace(/\u066B/g, '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const rx = (body, flags = '') => new RegExp(body.replace(/NUM/g, NUM), flags);

/**
 * الكسر المنطوق بعد المضاعِف: «مليون **ونصف**» و«ثلاثة ملايين **وربع**» (المرحلة ٣٩).
 *
 * كان يُهمَل، فتُقرأ «٢ مليون ونصف» مليونين — نصفُ مليونٍ يسقط صامتًا في سجلّ عقار.
 * والخطأ الصامت في السعر أسوأ من حقلٍ فارغ: الفارغُ يُسأل عنه، والخطأُ يُبنى عليه.
 */
const FRACTION_WORDS = String.raw`النصف|نصف|النص|نص|الربع|ربع|الثلثين|ثلثين|الثلث|ثلث|ثلاثه ارباع`;

function fractionValue(word) {
  const w = prep(word || '').replace(/^ال/, '');
  if (w === 'نصف' || w === 'نص') return 0.5;
  if (w === 'ربع') return 0.25;
  if (w === 'ثلث') return 1 / 3;
  if (w === 'ثلثين') return 2 / 3;
  if (w === 'ثلاثه ارباع') return 0.75;
  return 0;
}

/** المضاعِف المنطوق: مليون أو ألف. يعيد ١ لما ليس مضاعِفًا. */
function unitScale(word) {
  const u = prep(word || '');
  if (u.startsWith('مليون') || u.startsWith('ملايين')) return 1e6;
  if (u.startsWith('الف') || u.startsWith('الاف')) return 1000;
  return 1;
}

/** «٢ مليون ونصف» = (٢ + ٠٫٥) × مليون. والكسر من المضاعِف لا من العدد. */
function scaled(count, unitWord, fractionWord) {
  return (Number(count) + (fractionWord ? fractionValue(fractionWord) : 0)) * unitScale(unitWord);
}

/**
 * مبلغٌ منطوقٌ بلا رقم: «مليون» و«مليونين ونص» و«نص مليون».
 * لا يُقال «٢ مليون» دائمًا — يُقال «مليونين»، والرقم لا يظهر في النص أصلًا.
 */
const WORD_AMOUNT_RE = new RegExp(
  String.raw`(?:^|[\s،:؛(])(?:(نصف|نص)\s+)?(مليونين|مليون|الفين|الف)(?:\s*و\s*(${FRACTION_WORDS}))?`,
);

function wordAmount(body) {
  const m = WORD_AMOUNT_RE.exec(body);
  if (!m) return null;
  const [, lead, unit, frac] = m;
  const u = prep(unit);
  const base = (u === 'مليونين' || u === 'الفين') ? 2 : 1;
  const scale = u.startsWith('مليون') ? 1e6 : 1000;
  const count = lead ? 0.5 : base; // «نص مليون» — الكسر قبل المضاعِف لا بعده
  return (count + (frac ? fractionValue(frac) : 0)) * scale;
}

/* ===== المنصات ===== */

const PLATFORM_HOSTS = [
  [/aqar\.fm|sa\.aqar/i, 'عقار'],
  [/wasalt/i, 'وصلت'],
  [/bayut/i, 'بيوت'],
  [/haraj/i, 'حراج'],
  [/opensooq/i, 'السوق المفتوح'],
  [/aqarmap/i, 'عقارماب'],
  [/dari\.sa|sakani/i, 'ساكني'],
  [/t\.me|telegram/i, 'تيليجرام'],
  [/wa\.me|whatsapp/i, 'واتساب'],
  [/snapchat/i, 'سناب شات'],
  [/instagram/i, 'إنستغرام'],
  [/twitter|x\.com/i, 'منصة X'],
  [/tiktok/i, 'تيك توك'],
];

const PLATFORM_WORDS = [
  ['حراج', 'حراج'], ['عقار', 'عقار'], ['وصلت', 'وصلت'], ['بيوت', 'بيوت'],
  ['السوق المفتوح', 'السوق المفتوح'], ['تيليجرام', 'تيليجرام'], ['تلجرام', 'تيليجرام'],
  ['سناب', 'سناب شات'], ['انستقرام', 'إنستغرام'], ['انستغرام', 'إنستغرام'], ['تيك توك', 'تيك توك'],
];

function platformFromUrl(url) {
  for (const [re, label] of PLATFORM_HOSTS) if (re.test(url)) return label;
  const m = /^(?:https?:\/\/)?(?:www\.)?([^/?#\s]+)/i.exec(url);
  return m ? m[1] : '';
}

/* ===== النوع والغرض ===== */

// مرادفات الأنواع المدمجة (land · villa · floor · apartment). ما لا يوافق نوعًا معروفًا
// يُترك فارغًا ويُنبَّه عليه، فتضيف النوع بنفسك من زر "+" في النموذج.
const TYPE_WORDS = [
  ['دوبلكس', 'villa'], ['فيلا', 'villa'], ['فله', 'villa'], ['فلتين', 'villa'],
  ['قطعه ارض', 'land'], ['قطعة', 'land'], ['ارض', 'land'], ['اراضي', 'land'],
  ['شقه', 'apartment'], ['استوديو', 'apartment'], ['ستوديو', 'apartment'],
  ['دور علوي', 'floor'], ['دور ارضي', 'floor'], ['دور كامل', 'floor'], ['دور', 'floor'],
  // صارت أنواعًا مدمجة في المرحلة ٤٢، فتُقرأ الآن بدل أن تُذكر ولا يُعرف نوعُها.
  ['عماره', 'building'], ['عمارتين', 'building'], ['برج', 'building'],
  ['محل', 'shop'], ['محلات', 'shop'], ['معرض', 'shop'],
  ['مكتب', 'office'], ['مكاتب', 'office'],
  ['مستودع', 'warehouse'], ['مستودعات', 'warehouse'],
  ['استراحه', 'rest_house'], ['شاليه', 'rest_house'],
  ['مزرعه', 'farm'], ['مزارع', 'farm'],
];

/** ما يُذكر ولا نوعَ له عندنا — يُقال «ذُكر … ولا نوع يوافقه» ولا يُخمَّن. */
const UNKNOWN_TYPE_WORDS = ['مخطط', 'حوش', 'بلوك'];

const PURPOSE_WORDS = [
  [/للبيع|للبيــع|بيع |مطلوب البيع|للتنازل/, 'sale'],
  [/للايجار|ايجار|يوجد للايجار|للتاجير/, 'rent'],
  [/استثمار|استثماري|دخل سنوي|عائد سنوي|عائد استثماري/, 'investment'],
];

/* ===== المحلّل ===== */

/**
 * قراءة تقريبية لحقول العرض الخارجي من نص ملصوق.
 * @param {string} text النص كما لصقه المستخدم
 * @param {{ districts?: string[], types?: Array<{key,label}>, cities?: string[] }} options
 *        القوائم من settings.js (الأحياء المعروفة، أنواع العقار بما أضافه المستخدم، المدن)
 * @returns {{ fields: object, found: Array<{ key, label, text }>, warnings: string[] }}
 *          `fields` الحقول التي قُرئت فقط (ما لم يُقرأ لا يظهر)، و`found` للعرض، و`warnings` ما يحتاج نظرك
 */
export function parseListingText(text, { districts = [], types = [], cities = [] } = {}) {
  const fields = {};
  const found = [];
  const warnings = [];
  const raw = String(text ?? '');
  if (!raw.trim()) return { fields, found, warnings };

  const t = prep(raw);
  const add = (key, label, value, display) => {
    fields[key] = value;
    found.push({ key, label, text: display });
  };

  /* الروابط: رابط العرض، ورابط خرائط إن وُجد (يُقرأ منه الموقع) */
  const urls = t.match(/(?:https?:\/\/|www\.)[^\s"'<>،؛)]+/gi) || [];
  let mapsUrl = '';
  let listingUrl = '';
  for (const u of urls) {
    if (/google\.[a-z.]+\/maps|maps\.google|maps\.app\.goo\.gl|goo\.gl\/maps/i.test(u)) { if (!mapsUrl) mapsUrl = u; } else if (!listingUrl) listingUrl = u;
  }
  if (listingUrl) {
    const url = listingUrl.startsWith('http') ? listingUrl : `https://${listingUrl}`;
    add('sourceUrl', 'الرابط', url, url);
    const platform = platformFromUrl(url);
    if (platform) add('platform', 'المنصة', platform, platform);
  }
  if (mapsUrl) {
    add('mapsText', 'رابط الموقع', mapsUrl, mapsUrl);
    if (/maps\.app\.goo\.gl|goo\.gl\/maps/i.test(mapsUrl)) {
      warnings.push('رابط الخرائط مختصر ولا يحمل الإحداثيات — افتحه وانسخ الرابط الكامل ليُقرأ الموقع');
    }
  }
  if (!fields.platform) {
    for (const [word, label] of PLATFORM_WORDS) {
      if (t.includes(prep(word))) { add('platform', 'المنصة', label, label); break; }
    }
  }

  /* الأرقام تُقرأ بعد إزالة الروابط: الروابط مليئة بالأرقام */
  const body = t.replace(/(?:https?:\/\/|www\.)[^\s"'<>،؛)]+/gi, ' ');

  /* جوال المعلن */
  const phoneCandidates = body.match(/(?:\+?966|00966)?[\s-]?0?5[\d\s-]{8,13}/g) || [];
  for (const cand of phoneCandidates) {
    const digits = cand.replace(/[^\d+]/g, '');
    const normalized = digits.startsWith('966') ? `0${digits.slice(3)}` : digits.startsWith('0') ? digits : `0${digits}`;
    if (/^05\d{8}$/.test(normalized)) { add('advertiserPhone', 'جوال المعلن', normalized, normalized); break; }
  }
  const phoneDigits = fields.advertiserPhone || '';

  /* السعر: المضاعفات (مليون/ألف) أولًا، ثم ما بعد كلمة سعر، ثم ما قبل "ريال" */
  // كل نمطٍ يحمل مضاعِفَه وكسرَه معًا: «٢ مليون ونصف» تُقرأ ٢٫٥ مليون لا مليونين.
  const UNIT = String.raw`(مليون|ملايين|الف|الاف)`;
  const FRAC = String.raw`(?:\s*و\s*(FRACTIONS))?`.replace('FRACTIONS', FRACTION_WORDS);
  const pricePatterns = [
    [rx(String.raw`(?:السعر|المطلوب|بسعر|السوم|سعر|قيمه|مطلوب)\D{0,14}(NUM)\s*${UNIT}${FRAC}`), 'keyword+unit'],
    [rx(String.raw`(NUM)\s*${UNIT}${FRAC}`), 'unit'],
    [rx(String.raw`(?:السعر|المطلوب|بسعر|السوم|سعر|قيمه|مطلوب)\D{0,14}(NUM)`), 'keyword'],
    [rx(String.raw`(NUM)\s*(?:ريال|ر\.?س|sar)`, 'i'), 'currency'],
  ];
  for (const [re, kind] of pricePatterns) {
    const m = re.exec(body);
    if (!m) continue;
    const count = toNumber(m[1]);
    if (count == null) continue;
    let value = m[2] ? scaled(count, m[2], m[3]) : count;
    if (value < 1000 || value > 2e9) continue;
    if (phoneDigits && String(Math.round(value)) === phoneDigits.replace(/^0/, '')) continue;
    if (/سعر المتر|سعر متر/.test(body) && kind !== 'unit') warnings.push('يبدو أن النص يذكر سعر المتر — تأكّد أن السعر المقروء هو سعر العقار كاملًا');
    add('price', 'السعر', Math.round(value), `${Math.round(value).toLocaleString('en-US')} ريال`);
    break;
  }
  // «مليونين ونص» بلا رقمٍ في النص — يُجرَّب بعد الأنماط الرقمية فلا يزاحم رقمًا صريحًا.
  if (fields.price == null) {
    const spoken = wordAmount(body);
    if (spoken != null && spoken >= 1000 && spoken <= 2e9) {
      add('price', 'السعر', Math.round(spoken), `${Math.round(spoken).toLocaleString('en-US')} ريال`);
    }
  }

  /* المساحة */
  const areaPatterns = [
    rx(String.raw`(?:المساحه|مساحه|مساحتها|مساحتة)\D{0,10}(NUM)`),
    rx(String.raw`(NUM)\s*(?:م2|متر مربع|مترمربع|sqm)`, 'i'),
  ];
  for (const re of areaPatterns) {
    const m = re.exec(body);
    if (!m) continue;
    const value = toNumber(m[1]);
    if (value == null || value < 20 || value > 1e6) continue;
    if (fields.price != null && value === fields.price) continue;
    add('area', 'المساحة', value, `${value.toLocaleString('en-US')} م²`);
    break;
  }

  /* الحي: أطول اسم مطابق من قائمة الأحياء المعروفة (بمطابقة متسامحة بلا ألف) */
  const bodyLoose = loose(body);
  let bestDistrict = '';
  for (const d of districts) {
    if (!d || d.length < 3) continue;
    const nd = prep(d);
    const hit = body.includes(nd) || (nd.length >= 4 && bodyLoose.includes(loose(d)));
    if (hit && d.length > bestDistrict.length) bestDistrict = d;
  }
  if (bestDistrict) add('district', 'الحي', bestDistrict, bestDistrict);

  /* المدينة */
  for (const city of cities) {
    if (city && body.includes(prep(city))) { add('city', 'المدينة', city, city); break; }
  }

  /* النوع: الإعلان يبدأ بنوعه عادةً، فتُقدَّم أول كلمة نوع تظهر في النص
     (وإلا صار «عمارة فيها 12 شقة» شقةً). وأنواعك المسجَّلة تُقدَّم على المرادفات المدمجة عند التساوي. */
  const typeHits = [];
  for (const item of types) {
    const label = prep(item.label || '');
    if (label.length < 3) continue;
    const at = body.indexOf(label);
    if (at >= 0) typeHits.push({ at, key: item.key, own: true });
  }
  for (const [word, key] of TYPE_WORDS) {
    if (!types.some((x) => x.key === key)) continue;
    const at = body.indexOf(prep(word));
    if (at >= 0) typeHits.push({ at, key, own: false });
  }
  for (const word of UNKNOWN_TYPE_WORDS) {
    const at = body.indexOf(prep(word));
    if (at >= 0) typeHits.push({ at, key: null, word, own: false });
  }
  typeHits.sort((a, b) => a.at - b.at || (a.own === b.own ? 0 : a.own ? -1 : 1) || (a.key ? -1 : 1));
  const first = typeHits[0];
  if (first?.key) {
    const label = types.find((x) => x.key === first.key)?.label || first.key;
    add('type', 'النوع', first.key, label);
  } else if (first) {
    warnings.push(`النص يذكر «${first.word}» وليس في أنواع العقار عندك — أضِفه من الإعدادات (أنواع العقار) ثم اختره هنا`);
  }

  /* الغرض */
  const purposes = [];
  for (const [re, key] of PURPOSE_WORDS) if (re.test(body) && !purposes.includes(key)) purposes.push(key);
  if (purposes.length) {
    const labels = { sale: 'بيع', rent: 'إيجار', investment: 'استثمار' };
    add('purposes', 'الغرض', purposes, purposes.map((p) => labels[p]).join('، '));
  }

  return { fields, found, warnings };
}

/* ===== اسم المرسِل: مشتركٌ بين الطلب والعرض (المرحلة ٣٩) ===== */

/**
 * أفعالٌ يتوقّف الاسم عندها. من يكتب «انا سعد ابغى فلة» اسمُه سعد لا «سعد ابغى فلة».
 * وفيها أفعال الطلب وأفعال العرض معًا: المرسِل قد يكون باحثًا وقد يكون مالكًا، والجملة
 * تُقرأ بالقاعدة نفسها.
 */
const NAME_STOP = [
  'ابغي', 'ابي', 'اريد', 'احتاج', 'ودي', 'ابحث', 'مطلوب', 'اسال', 'حاب', 'ابا',
  'عندي', 'لدي', 'املك', 'معي', 'ابيع', 'اعرض', 'للبيع', 'للايجار', 'صاحب', 'مالك',
];

/**
 * اسم المرسِل من نصٍّ حرّ: «انا سعد» و«معك أبو خالد» و«اسمي ريما الحربي».
 * يعيد '' إن لم يُقرأ — ولا يُخمَّن: اسمٌ مخترَع في سجلّ عميل أسوأ من حقلٍ فارغ.
 */
export function parseSenderName(text) {
  const raw = String(text ?? '');
  // **الاسم يُؤخذ من النصّ الأصليّ لا من المطبَّع**: التطبيع يحوّل «نورة» إلى «نوره»
  // و«إيمان» إلى «ايمان» — وهو صوابٌ للمطابقة، وخطأٌ للتخزين. فاسمٌ يُكتب في سجلّ عميل
  // ثم يُطبع في عقد يجب أن يكون كما كتبه صاحبُه.
  const TRIGGER = String.raw`(?:[أا]نا|اسمي|مع[كي]|معاك)`;
  const WORD = String.raw`[\u0600-\u06FF]{2,}`;
  const m = new RegExp(`${TRIGGER}\\s+(${WORD}(?:\\s+${WORD}){0,2})`).exec(raw)
    // وإن لم يقع على الأصل (تشكيلٌ أو تطويل)، فالمطبَّعُ أولى من لا شيء.
    || new RegExp(`(?:انا|اسمي|معك|معاك|معي)\\s+(${WORD}(?:\\s+${WORD}){0,2})`).exec(prep(raw));
  if (!m) return '';
  const words = [];
  for (const w of m[1].trim().split(/\s+/)) {
    if (NAME_STOP.includes(prep(w))) break; // الوقوف يُقارَن مطبَّعًا، والمحفوظ يبقى أصلًا
    words.push(w);
    if (words.length === 2) break; // اسم ثنائي يكفي
  }
  return words.join(' ').replace(/[،؛,.:]+$/, '').trim(); // علامة ترقيم لاصقة ليست من الاسم
}

/* ===== قراءة طلب عميل من رسالة واتساب (المرحلة ١١) ===== */

const BUDGET_WORDS = String.raw`الميزانيه|ميزانيتي|ميزانيه|بحدود|حدود|ما يتجاوز|لا يتجاوز|الى|حتى|بحد اقصى|سقف|المبلغ|عندي`;

/**
 * يقرأ طلب عميل من نص حرّ (رسالة واتساب غالبًا): النوع والغرض والمدينة **وعدة أحياء**
 * وسقف الميزانية والمساحة، مع اسم المرسل وجواله إن ذُكرا.
 *
 * يعيد استعمال `parseListingText` نفسه (لا منطق قراءة ثانٍ) ثم يعدّل ما يختلف في الطلب:
 * الأحياء جمع لا مفرد، والسعر سقفٌ لا سعرَ عرض، والغرض واحد لا مجموعة.
 * **دالة خالصة تعمل محليًا**: بلا شبكة ولا مفتاح ولا خروج بيانات من الجهاز.
 *
 * @returns {{ fields: object, found: Array, warnings: string[] }}
 */
export function parseRequestText(text, { districts = [], types = [], cities = [] } = {}) {
  const base = parseListingText(text, { districts, types, cities });
  const fields = {};
  const found = [];
  const warnings = [...base.warnings.filter((w) => !w.includes('رابط الخرائط'))];
  const raw = String(text ?? '');
  if (!raw.trim()) return { fields, found, warnings };

  const t = prep(raw);
  const body = t.replace(/(?:https?:\/\/|www\.)[^\s"'<>،؛)]+/gi, ' ');
  const add = (key, label, value, display) => { fields[key] = value; found.push({ key, label, text: display }); };

  if (base.fields.type) add('type', 'النوع', base.fields.type, base.found.find((f) => f.key === 'type')?.text || '');
  if (base.fields.city) add('city', 'المدينة', base.fields.city, base.fields.city);
  if (base.fields.purposes?.length) {
    const key = base.fields.purposes[0];
    const label = { sale: 'بيع', rent: 'إيجار', investment: 'استثمار' }[key];
    add('purpose', 'الغرض', key, label);
    if (base.fields.purposes.length > 1) warnings.push('النص يذكر أكثر من غرض — الطلب يقبل غرضًا واحدًا، فاختر الصحيح');
  }

  /* الأحياء: كلها لا أطولها (العميل يذكر عدة أحياء عادةً: «الياسمين أو النرجس») */
  const bodyLoose = loose(body);
  const hits = [];
  for (const d of districts) {
    if (!d || d.length < 3) continue;
    const nd = prep(d);
    if (body.includes(nd) || (nd.length >= 4 && bodyLoose.includes(loose(d)))) hits.push(d);
  }
  // إسقاط الاسم المتضمَّن في اسم أطول («النرجس» داخل «النرجس الشمالي») فلا يتكرر الحي مرتين
  const picked = hits.filter((d) => !hits.some((o) => o !== d && prep(o).includes(prep(d))));
  if (picked.length) add('districts', 'الأحياء', picked, picked.join('، '));

  /* سقف الميزانية: كلمة ميزانية أولًا، وإلا السعر الذي قرأه المحلّل العام */
  // الكسر المنطوق هنا كذلك: «ميزانيتي مليونين ونص» سقفُها ٢٫٥ لا ٢ — والفرقُ نصفُ مليون
  // في مطابقةٍ تُقصي عروضًا تناسبه.
  const budgetRe = rx(String.raw`(?:${BUDGET_WORDS})\D{0,12}(NUM)\s*(مليون|ملايين|الف|الاف)?(?:\s*و\s*(${FRACTION_WORDS}))?`);
  const m = budgetRe.exec(body);
  let budget = null;
  if (m) {
    const count = toNumber(m[1]);
    if (count != null) {
      const value = m[2] ? scaled(count, m[2], m[3]) : count;
      if (value >= 1000 && value <= 2e9) budget = Math.round(value);
    }
  }
  if (budget == null && base.fields.price != null) budget = base.fields.price;

  /* أرضيّةُ الميزانية: «من ٤٥ إلى ٦٠ ألف» — كان يُحفظ سقفُها وحده، والأرضيّةُ تمنع أن
     يُعرض عليه ما هو دون سوقه. والوحدةُ («ألف»/«مليون») تلحق الرقمَ الثاني غالبًا وتعمّ
     الأوّل: «من ٤٥ إلى ٦٠ ألف» أي ٤٥٬٠٠٠ لا ٤٥. */
  // **الفاصلُ يُكتب بصيغته بعد التطبيع.** `prep` يردّ «ى» إلى «ي»، فـ«الى» تصير «الي»
  // و«حتى» تصير «حتي» — ونمطٌ يبحث عن «الى» لا يجدها أبدًا وإن كانت في الرسالة.
  const rangeRe = rx(String.raw`(?:من|بين)\s*(NUM)\s*(مليون|ملايين|الف|الاف)?\s*(?:ال[يى]|حت[يى]|لغايه|-|–|و)\s*(NUM)\s*(مليون|ملايين|الف|الاف)?`);
  const rm = rangeRe.exec(body);
  let budgetMin = null;
  if (rm) {
    const unit = rm[2] || rm[4] || null; // وحدةُ الطرف الثاني تعمّ الأوّل إن أُهمل
    const lo = toNumber(rm[1]);
    const hi = toNumber(rm[3]);
    const loV = lo != null ? (unit ? scaled(lo, unit, null) : lo) : null;
    const hiV = hi != null ? (rm[4] || unit ? scaled(hi, rm[4] || unit, null) : hi) : null;
    if (loV != null && hiV != null && loV < hiV && loV >= 1000) {
      budgetMin = Math.round(loV);
      budget = Math.round(hiV);
    }
  }
  /* طرفٌ أعلى منطوقٌ بلا رقم: «من ٨٠٠ ألف **حتى مليون ونص**». وبلا هذا كان السقف يُقرأ
     ٨٠٠ ألف — أي أرضيّتَه — فتُقصى كلُّ عروضه بين ٨٠٠ ألفٍ ومليونٍ ونصف. */
  if (budgetMin == null) {
    const lead = rx(String.raw`(?:من|بين)\s*(NUM)\s*(مليون|ملايين|الف|الاف)?\s*(?:ال[يى]|حت[يى]|لغايه)\s*(.{0,30})`).exec(body);
    if (lead) {
      const lo = toNumber(lead[1]);
      const loV = lo != null ? (lead[2] ? scaled(lo, lead[2], null) : lo) : null;
      const hiV = wordAmount(` ${lead[3]}`);
      if (loV != null && hiV != null && loV < hiV && loV >= 1000) { budgetMin = Math.round(loV); budget = Math.round(hiV); }
    }
  }

  if (budget != null) add('budgetMax', 'سقف الميزانية', budget, `${budget.toLocaleString('en-US')} ريال`);
  if (budgetMin != null) add('budgetMin', 'أدنى الميزانية', budgetMin, `${budgetMin.toLocaleString('en-US')} ريال`);

  /* دورةُ الإيجار: «٦٠ ألف سنوي» غيرُ «٦٠ ألف شهري» — والفرق اثنا عشر ضعفًا، فيُقرأ ولا
     يُخمَّن. وإن لم تُذكر بقي الحقل فارغًا ولم يُفترض شيء. */
  if (fields.purpose === 'rent') {
    if (/\b(?:سنوي|سنويا|بالسنه|في السنه|سنه|شامل السنه)\b/.test(body) || /سنوي/.test(body)) add('rentCycle', 'دورة الإيجار', 'yearly', 'سنويّ');
    else if (/شهري|بالشهر|في الشهر|كل شهر/.test(body)) add('rentCycle', 'دورة الإيجار', 'monthly', 'شهريّ');
  }

  /* الغرف ودورات المياه — أوّلُ ما يسأل عنه المستأجر، وكان يُقرأ ثم يضيع لعدم وجود حقل. */
  const roomsRe = rx(String.raw`(NUM)\s*(?:غرف|غرفه|غرفتين|غرفتان)|(?:غرف|غرفه)\s*(?:نوم)?\s*(NUM)`);
  const roomsM = roomsRe.exec(body);
  const roomsDual = /غرفتين|غرفتان/.test(body) ? 2 : null;
  const rooms = roomsM ? toNumber(roomsM[1] ?? roomsM[2]) : roomsDual;
  if (rooms != null && rooms >= 1 && rooms <= 30) add('rooms', 'عدد الغرف', rooms, String(rooms));

  const bathsDual = /دورتين|حمامين|دورتي مياه/.test(body) ? 2 : null;
  const bathsM = rx(String.raw`(NUM)\s*(?:دورات مياه|دوره مياه|دورات|حمامات|حمام)`).exec(body);
  const baths = bathsM ? toNumber(bathsM[1]) : bathsDual;
  if (baths != null && baths >= 1 && baths <= 20) add('baths', 'دورات المياه', baths, String(baths));

  if (base.fields.area != null) add('area', 'المساحة المطلوبة', base.fields.area, `${base.fields.area.toLocaleString('en-US')} م²`);

  /* جوال المرسل واسمه (للبحث عن عميل موجود أو إنشائه) */
  if (base.fields.advertiserPhone) add('phone', 'جوال العميل', base.fields.advertiserPhone, base.fields.advertiserPhone);
  const name = parseSenderName(raw);
  if (name) add('name', 'اسم العميل', name, name);

  if (!fields.type) warnings.push('لم يُعرف نوع العقار من النص — اختره بنفسك');
  if (!fields.purpose) warnings.push('لم يُعرف الغرض (بيع/إيجار/استثمار) من النص — اختره بنفسك');
  return { fields, found, warnings };
}

/* ===== قراءة عرض المالك من رسالة واتساب (المرحلة ٣٩) ===== */

/** ما يقوله المالك حين يعرض ملكه — تُميّز رسالته عن رسالة الباحث. */
const OWNER_WORDS = /عندي|لدي|املك|امتلك|معي|ابيع|للبيع عندي|اعرض|عرض|صاحب|مالك|ورثه|ورثنا/;

/** كلماتُ رقم الصك، وهي أشكالٌ يكتبها الناس فعلًا لا صيغةٌ واحدة رسمية. */
const DEED_RE = /(?:رقم\s*)?(?:الصك|صك|الصكوك)\D{0,12}([0-9]{6,20}|[0-9/\-]{8,25})/;

/**
 * يقرأ **عرض مالكٍ** من نصٍّ حرّ: رسالةُ من يعرض عقاره عليك، لا إعلانُ منصّة ولا طلبُ باحث.
 *
 * وهو مقابلُ `parseRequestText`: ذاك يقرأ من **يطلب** فيُنشئ باحثًا وطلبًا، وهذا يقرأ من
 * **يعرض** فيُنشئ مالكًا وعقارًا. والفرقُ بينهما ليس في الحقول وحدها بل في معناها: السعر
 * هنا **سعرُ عرضٍ** لا سقفَ ميزانية، والحي **واحدٌ** لا عدّة (العقار في حيٍّ واحد، والباحث
 * يقبل عدّة)، والغرضُ **مجموعة** (قد يبيع أو يؤجّر) لا واحدًا.
 *
 * يعيد استعمال `parseListingText` نفسه — لا منطقَ قراءةٍ ثالث يُكتب ثم ينحرف عن أخوَيه.
 * **دالة خالصة تعمل محليًا**: بلا شبكة ولا مفتاح ولا خروج بيانات من الجهاز.
 *
 * @returns {{ fields: object, found: Array<{key,label,text}>, warnings: string[] }}
 */
export function parseOfferText(text, { districts = [], types = [], cities = [] } = {}) {
  const base = parseListingText(text, { districts, types, cities });
  const fields = {};
  const found = [];
  const warnings = [...base.warnings];
  const raw = String(text ?? '');
  if (!raw.trim()) return { fields, found, warnings };

  const add = (key, label, value, display) => { fields[key] = value; found.push({ key, label, text: display }); };
  const t = prep(raw);
  const body = t.replace(/(?:https?:\/\/|www\.)[^\s"'<>،؛)]+/gi, ' ');

  /* حقول العقار كما قرأها المحلّل العام — بمعانيها هنا لا بمعانيها هناك */
  const carry = ['type', 'city', 'district', 'area', 'price', 'purposes'];
  for (const key of carry) {
    if (base.fields[key] == null) continue;
    if (Array.isArray(base.fields[key]) && !base.fields[key].length) continue;
    const src = base.found.find((f) => f.key === key);
    const label = key === 'price' ? 'السعر المطلوب' : src?.label || key;
    add(key, label, base.fields[key], src?.text ?? String(base.fields[key]));
  }
  if (base.fields.mapsText) add('mapsText', 'رابط الموقع', base.fields.mapsText, base.fields.mapsText);

  /* صاحب العرض: جوالُه واسمه — بهما يُنشأ المالك أو يُوجد سجلُّه */
  if (base.fields.advertiserPhone) add('phone', 'جوال المالك', base.fields.advertiserPhone, base.fields.advertiserPhone);
  const name = parseSenderName(raw);
  if (name) add('name', 'اسم المالك', name, name);

  /* رقم الصك: يكتبه المالك كثيرًا، وكان يضيع في الملاحظات فلا يُبحث ولا يدخل عقدًا */
  const deed = DEED_RE.exec(body);
  if (deed) {
    const value = deed[1].replace(/[^\d/-]/g, '');
    if (value.length >= 6) add('deedNumber', 'رقم الصك', value, value);
  }

  /* هل هذه رسالةُ مالكٍ أصلًا؟ */
  if (!OWNER_WORDS.test(body)) {
    warnings.push('لا يبدو أنّ النص عرضُ مالك — إن كان طلبَ باحثٍ فاستعمل «لصق رسالة عميل» في صفحة الطلبات');
  }
  if (!fields.type) warnings.push('لم يُعرف نوع العقار من النص — اختره بنفسك');
  if (!fields.city) warnings.push('لم تُعرف المدينة من النص — اخترها بنفسك');
  if (fields.price == null) warnings.push('لم يُقرأ سعر — العقار بلا سعر يُحفظ، لكن السعر يُغيّر كلّ مطابقة');

  return { fields, found, warnings };
}
