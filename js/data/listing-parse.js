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

const NUM = String.raw`\d{1,3}(?:[.,\u060C\u066B\u066C ]\d{3})+|\d+(?:[.,]\d+)?`;

function toNumber(text) {
  let s = String(text ?? '').replace(/[\s\u060C\u066C,]/g, '');
  if ((s.match(/\./g) || []).length > 1 || /^\d+\.\d{3}$/.test(s)) s = s.replace(/\./g, '');
  s = s.replace(/\u066B/g, '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const rx = (body, flags = '') => new RegExp(body.replace(/NUM/g, NUM), flags);

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
];

const UNKNOWN_TYPE_WORDS = ['عماره', 'برج', 'محل', 'معرض', 'مستودع', 'مكتب', 'استراحه', 'مزرعه', 'شاليه', 'مخطط'];

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
  const pricePatterns = [
    [rx(String.raw`(?:السعر|المطلوب|بسعر|السوم|سعر|قيمه|مطلوب)\D{0,14}(NUM)\s*(مليون|ملايين|الف|الاف)`), 'keyword+unit'],
    [rx(String.raw`(NUM)\s*(مليون|ملايين|الف|الاف)`), 'unit'],
    [rx(String.raw`(?:السعر|المطلوب|بسعر|السوم|سعر|قيمه|مطلوب)\D{0,14}(NUM)`), 'keyword'],
    [rx(String.raw`(NUM)\s*(?:ريال|ر\.?س|sar)`, 'i'), 'currency'],
  ];
  for (const [re, kind] of pricePatterns) {
    const m = re.exec(body);
    if (!m) continue;
    let value = toNumber(m[1]);
    if (value == null) continue;
    const unit = m[2] ? prep(m[2]) : '';
    if (unit.startsWith('مليون') || unit.startsWith('ملايين')) value *= 1e6;
    else if (unit.startsWith('الف') || unit.startsWith('الاف')) value *= 1000;
    if (value < 1000 || value > 2e9) continue;
    if (phoneDigits && String(Math.round(value)) === phoneDigits.replace(/^0/, '')) continue;
    if (/سعر المتر|سعر متر/.test(body) && kind !== 'unit') warnings.push('يبدو أن النص يذكر سعر المتر — تأكّد أن السعر المقروء هو سعر العقار كاملًا');
    add('price', 'السعر', Math.round(value), `${Math.round(value).toLocaleString('en-US')} ريال`);
    break;
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
  const budgetRe = rx(String.raw`(?:${BUDGET_WORDS})\D{0,12}(NUM)\s*(مليون|ملايين|الف|الاف)?`);
  const m = budgetRe.exec(body);
  let budget = null;
  if (m) {
    let value = toNumber(m[1]);
    if (value != null) {
      const unit = m[2] ? prep(m[2]) : '';
      if (unit.startsWith('مليون') || unit.startsWith('ملايين')) value *= 1e6;
      else if (unit.startsWith('الف') || unit.startsWith('الاف')) value *= 1000;
      if (value >= 1000 && value <= 2e9) budget = Math.round(value);
    }
  }
  if (budget == null && base.fields.price != null) budget = base.fields.price;
  if (budget != null) add('budgetMax', 'سقف الميزانية', budget, `${budget.toLocaleString('en-US')} ريال`);

  if (base.fields.area != null) add('area', 'المساحة المطلوبة', base.fields.area, `${base.fields.area.toLocaleString('en-US')} م²`);

  /* جوال المرسل واسمه (للبحث عن عميل موجود أو إنشائه) */
  if (base.fields.advertiserPhone) add('phone', 'جوال العميل', base.fields.advertiserPhone, base.fields.advertiserPhone);
  const nameMatch = /(?:انا|اسمي|معك|معاك)\s+([\u0600-\u06FF]{2,}(?:\s+[\u0600-\u06FF]{2,}){0,2})/.exec(prep(raw));
  if (nameMatch) {
    // الاسم يتوقف عند أول فعل طلب («انا سعد ابغى فلة» = سعد، لا «سعد ابغى فلة»)
    const STOP = ['ابغي', 'ابي', 'اريد', 'احتاج', 'ودي', 'ابحث', 'مطلوب', 'عندي', 'اسال', 'حاب'];
    const words = [];
    for (const w of nameMatch[1].trim().split(/\s+/)) {
      if (STOP.includes(w)) break;
      words.push(w);
      if (words.length === 2) break; // اسم ثنائي يكفي
    }
    const name = words.join(' ').replace(/[،؛,.:]+$/, '').trim(); // علامة ترقيم لاصقة ليست من الاسم
    if (name) add('name', 'اسم العميل', name, name);
  }

  if (!fields.type) warnings.push('لم يُعرف نوع العقار من النص — اختره بنفسك');
  if (!fields.purpose) warnings.push('لم يُعرف الغرض (بيع/إيجار/استثمار) من النص — اختره بنفسك');
  return { fields, found, warnings };
}
