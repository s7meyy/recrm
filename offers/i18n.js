// الصفحة العامة بالعربية والإنجليزية (المرحلة ٣٠).
//
// للمشتري غير الناطق بالعربية — وهو موجود في الرياض أكثر مما يُظن. والقاعدة الحاكمة:
// **تُترجَم واجهة الصفحة، ولا تُترجَم بياناتك.** اسم الحي وملاحظاتك تبقى كما كتبتَها،
// لأن ترجمتها الآلية تُنتج أسماء لا يعرفها أحد ووصفًا قد يخالف ما تقصده.
//
// والأنواع والأغراض تُترجَم **بمفاتيحها المدمجة وحدها**؛ ونوعٌ أضفتَه أنت يبقى بمسمّاه
// العربي — أصدق من ترجمة تُخترع له.

export const LANGS = ['ar', 'en'];

const BUILTIN_TYPES = {
  land: 'Land', villa: 'Villa', floor: 'Floor', apartment: 'Apartment',
};

const PURPOSES = {
  sale: 'For Sale', rent: 'For Rent', investment: 'Investment',
};

export const STRINGS = {
  ar: {
    dir: 'rtl', lang: 'ar', other: 'English', title: 'العروض المتاحة',
    loading: 'جارٍ تحميل العروض…', empty: 'لا توجد عروض منشورة حاليًا.',
    error: 'تعذر تحميل العروض حاليًا. حدّث الصفحة بعد قليل.',
    priceOnRequest: 'السعر عند الطلب', updated: 'آخر تحديث للعروض',
    all: 'الكل', ofCount: 'من', listing: 'عرض', photos: 'صور',
    whatsapp: 'واتساب', call: 'اتصال', location: 'الموقع', allOffers: 'كل العروض',
    disclaimer: 'الأسعار والتفاصيل قابلة للتغيير — للتأكد تواصل معنا مباشرة.',
    ref: 'رقم',
    // حقائقُ النوع (المرحلة ٤٨) — تُترجَم هنا لأنّ الصفحة تُعرض بلغتين.
    facts: {
      rooms: 'غرفة', baths: 'دورة مياه', floor: 'الدور', floorsCount: 'أدوار',
      buildingAge: 'عمر البناء', buildingCondition: 'الحالة',
      plotDimensions: 'الأطوال', streetWidth: 'عرض الشارع', streetsCount: 'شوارع', facades: 'الواجهات',
    },
    factUnits: { buildingAge: 'سنة', streetWidth: 'م' },
    listedNew: 'مُدرَجٌ حديثًا',
    listedMonths: (n) => (n === 1 ? 'مُدرَجٌ منذ شهر' : n === 2 ? 'مُدرَجٌ منذ شهرين' : n <= 10 ? `مُدرَجٌ منذ ${n} أشهر` : `مُدرَجٌ منذ ${n} شهرًا`),
    listedYears: (n) => (n === 1 ? 'مُدرَجٌ منذ سنة' : n === 2 ? 'مُدرَجٌ منذ سنتين' : `مُدرَجٌ منذ ${n} سنوات`),
  },
  en: {
    dir: 'ltr', lang: 'en', other: 'العربية', title: 'Available Listings',
    loading: 'Loading listings…', empty: 'No listings published at the moment.',
    error: 'Could not load listings. Please refresh in a moment.',
    priceOnRequest: 'Price on request', updated: 'Last updated',
    all: 'All', ofCount: 'of', listing: 'listing', photos: 'photos',
    whatsapp: 'WhatsApp', call: 'Call', location: 'Location', allOffers: 'All listings',
    disclaimer: 'Prices and details are subject to change — please contact us to confirm.',
    ref: 'Ref',
    facts: {
      rooms: 'rooms', baths: 'baths', floor: 'Floor', floorsCount: 'floors',
      buildingAge: 'Age', buildingCondition: 'Condition',
      plotDimensions: 'Dimensions', streetWidth: 'Street width', streetsCount: 'streets', facades: 'Facades',
    },
    factUnits: { buildingAge: 'yrs', streetWidth: 'm' },
    listedNew: 'Newly listed',
    listedMonths: (n) => `Listed ${n} month${n === 1 ? '' : 's'} ago`,
    listedYears: (n) => `Listed ${n} year${n === 1 ? '' : 's'} ago`,
  },
};

/** اللغة المختارة: من الرابط أولًا، ثم من ذاكرة المتصفح، ثم العربية. */
export function currentLang() {
  const fromUrl = new URLSearchParams(location.search).get('lang');
  if (LANGS.includes(fromUrl)) return fromUrl;
  try {
    const stored = localStorage.getItem('kassab-offers-lang');
    if (LANGS.includes(stored)) return stored;
  } catch (_) { /* التخزين قد يكون ممنوعًا — لا يعطّل الصفحة */ }
  return 'ar';
}

export function rememberLang(lang) {
  try { localStorage.setItem('kassab-offers-lang', lang); } catch (_) { /* لا يضرّ */ }
}

/** مسمّى النوع بلغة العرض: المدمج يُترجَم، والمخصّص يبقى كما سمّيتَه. */
export function typeName(listing, lang) {
  if (lang === 'en' && listing.type && BUILTIN_TYPES[listing.type]) return BUILTIN_TYPES[listing.type];
  return listing.typeLabel || '';
}

/** الأغراض بلغة العرض — وما ليس مدمجًا يبقى بمسمّاه. */
export function purposeNames(listing, lang) {
  if (lang !== 'en') return listing.purposeLabels || [];
  const keys = listing.purposes || [];
  if (!keys.length) return listing.purposeLabels || [];
  return keys.map((k, i) => PURPOSES[k] || (listing.purposeLabels || [])[i] || k);
}

/** العنوان المعروض للعرض الواحد. */
export function listingTitle(listing, lang) {
  const type = typeName(listing, lang);
  const where = [listing.district, listing.city].filter(Boolean).join(lang === 'en' ? ', ' : '، ');
  if (!where) return type || listing.title || '';
  return lang === 'en' ? `${type} — ${where}` : `${type} — ${where}`;
}


/**
 * وسمُ حقيقةٍ من حقائق النوع: «٤ غرفة» أو «Floor 3» (المرحلة ٤٨).
 *
 * والعربيةُ تضع العددَ قبل معدوده والإنجليزيةُ بعده في بعضها — فيُفرَّق بين ما هو معدودٌ
 * (غرف، دورات مياه) وما هو وصفٌ بعنوانٍ وقيمة (الدور، الحالة، الواجهات).
 */
const COUNTED = new Set(['rooms', 'baths', 'floorsCount', 'streetsCount']);

export function factLabel(key, value, strings, nf) {
  const name = strings.facts?.[key];
  if (!name) return null;
  const unit = strings.factUnits?.[key];
  const shown = typeof value === 'number' ? nf.format(value) : String(value);
  if (COUNTED.has(key)) return `${shown} ${name}`;
  return `${name}: ${shown}${unit ? ` ${unit}` : ''}`;
}

/** «مُدرَجٌ منذ…» — والشهرُ الأوّل «حديثًا»، فرقمٌ صفرٌ لا يُقال. */
export function listedLabel(months, strings) {
  if (months == null) return null;
  if (months < 1) return strings.listedNew;
  if (months < 12) return strings.listedMonths(months);
  return strings.listedYears(Math.floor(months / 12));
}
