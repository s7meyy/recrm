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

/**
 * **جمعُ العربيّة على قاعدتها** — نسخةٌ صغيرةٌ محليّة (المرحلة ٥٢).
 *
 * والصفحةُ العامّة مستقلّةٌ عن `js/` عمدًا: تُخدَم لغريبٍ لا يحمّل وحداتِ التطبيق.
 * فتُكتب هنا في ستّة أسطرٍ بدل استيراد وحدةٍ كاملة.
 *
 * `withNum` تُلحق العددَ حين يلزم: العربيّةُ تُفرد الواحدَ والاثنين بصيغتهما بلا عدد
 * («غرفة» لا «١ غرفة»)، وتُظهره فيما فوق.
 */
export function countAr(n, [one, two, few, many], shown = null) {
  const x = Math.abs(Math.round(Number(n) || 0));
  if (x === 1) return one;
  if (x === 2) return two;
  const word = (x % 100 >= 3 && x % 100 <= 10) ? few : many;
  return shown == null ? word : `${shown} ${word}`;
}

export const STRINGS = {
  ar: {
    dir: 'rtl', lang: 'ar', other: 'English', title: 'العروض المتاحة',
    loading: 'جارٍ تحميل العروض…', empty: 'لا توجد عروض منشورة حاليًا.',
    error: 'تعذر تحميل العروض حاليًا. حدّث الصفحة بعد قليل.',
    priceOnRequest: 'السعر عند الطلب', updated: 'آخر تحديث للعروض',
    all: 'الكل', ofCount: 'من', listing: 'عرض', photos: 'صور',
    // العدّادُ يُجمع (المرحلة ٥٧): «٤ عرض» لحنٌ يقرؤه كلُّ عميلٍ في أوّل سطر.
    listings: (n, shown) => countAr(n, ['عرضٌ واحد', 'عرضان', 'عروض', 'عرضًا'], shown),
    // المرحلة ٥٨ — بعين العميل
    noPhotos: 'بلا صور بعد', askAbout: 'اطلب معاينة', favs: 'المفضّلة', favAdd: 'أضف إلى المفضّلة', favRemove: 'أزل من المفضّلة',
    priceUpTo: 'السعر: الكل', priceOpt: (s) => `حتى ${s}`, areaFrom: 'المساحة: الكل', areaOpt: (s) => `${s} فأكثر`,
    onlyFavs: 'المفضّلة فقط', noFavs: 'لم تحفظ عرضًا بعد — اضغط ♡ على أيّ عرض.',
    million: (n) => `${n} مليون`, thousand: (n) => `${n} ألف`, sar: 'ريال', m2: 'م²',
    whatsapp: 'واتساب', call: 'اتصال', location: 'الموقع', allOffers: 'كل العروض',
    disclaimer: 'الأسعار والتفاصيل قابلة للتغيير — للتأكد تواصل معنا مباشرة.',
    ref: 'رقم',
    // حقائقُ النوع (المرحلة ٤٨) — تُترجَم هنا لأنّ الصفحة تُعرض بلغتين.
    facts: {
      // **المعدوداتُ دوالُّ لا نصوص** (المرحلة ٥٢): كان يخرج «6 غرفة» و«2 أدوار»
      // و«1 شوارع» — لحنٌ يقرؤه الغريبُ في أوّل ما يرى من مكتبك.
      rooms: (n, shown) => countAr(n, ['غرفة', 'غرفتان', 'غرف', 'غرفة'], shown),
      baths: (n, shown) => countAr(n, ['دورة مياه', 'دورتا مياه', 'دورات مياه', 'دورة مياه'], shown),
      floor: 'الدور',
      floorsCount: (n, shown) => countAr(n, ['دور واحد', 'دوران', 'أدوار', 'دورًا'], shown),
      buildingAge: 'عمر البناء', buildingCondition: 'الحالة',
      plotDimensions: 'الأطوال', streetWidth: 'عرض الشارع',
      streetsCount: (n, shown) => countAr(n, ['شارع واحد', 'شارعان', 'شوارع', 'شارعًا'], shown),
      facades: 'الواجهات',
    },
    // **والوحدةُ تُجمع أيضًا**: «عمر البناء: 3 سنة» لحنٌ كالأوّل.
    factUnits: { buildingAge: (n) => countAr(n, ['سنة', 'سنتان', 'سنوات', 'سنة']), streetWidth: 'م' },
    listedNew: 'مُدرَجٌ حديثًا',
    listedMonths: (n) => (n === 1 ? 'مُدرَجٌ منذ شهر' : n === 2 ? 'مُدرَجٌ منذ شهرين' : n <= 10 ? `مُدرَجٌ منذ ${n} أشهر` : `مُدرَجٌ منذ ${n} شهرًا`),
    listedYears: (n) => (n === 1 ? 'مُدرَجٌ منذ سنة' : n === 2 ? 'مُدرَجٌ منذ سنتين' : `مُدرَجٌ منذ ${n} سنوات`),
    // على الخارطة (المرحلة ٤٩): لا يُباع تحت الإنشاء كأنّه جاهز.
    offPlan: 'على الخارطة — تحت الإنشاء',
    delivery: (d) => `التسليم المتوقَّع: ${d}`,
  },
  en: {
    dir: 'ltr', lang: 'en', other: 'العربية', title: 'Available Listings',
    loading: 'Loading listings…', empty: 'No listings published at the moment.',
    error: 'Could not load listings. Please refresh in a moment.',
    priceOnRequest: 'Price on request', updated: 'Last updated',
    all: 'All', ofCount: 'of', listing: 'listing', photos: 'photos',
    listings: (n, shown) => `${shown ?? n} ${n === 1 ? 'listing' : 'listings'}`,
    noPhotos: 'No photos yet', askAbout: 'Request a viewing', favs: 'Favourites', favAdd: 'Add to favourites', favRemove: 'Remove from favourites',
    priceUpTo: 'Price: any', priceOpt: (s) => `Up to ${s}`, areaFrom: 'Area: any', areaOpt: (s) => `${s} or more`,
    onlyFavs: 'Favourites only', noFavs: 'No saved listings yet — tap ♡ on any listing.',
    million: (n) => `${n}M`, thousand: (n) => `${n}K`, sar: 'SAR', m2: 'm²',
    whatsapp: 'WhatsApp', call: 'Call', location: 'Location', allOffers: 'All listings',
    disclaimer: 'Prices and details are subject to change — please contact us to confirm.',
    ref: 'Ref',
    facts: {
      // والإنجليزيّةُ مفردٌ وجمعٌ لا أكثر — فـ«1 rooms» لحنٌ عندها كذلك.
      rooms: (n, shown) => `${shown} ${n === 1 ? 'room' : 'rooms'}`,
      baths: (n, shown) => `${shown} ${n === 1 ? 'bath' : 'baths'}`,
      floor: 'Floor',
      floorsCount: (n, shown) => `${shown} ${n === 1 ? 'floor' : 'floors'}`,
      buildingAge: 'Age', buildingCondition: 'Condition',
      plotDimensions: 'Dimensions', streetWidth: 'Street width',
      streetsCount: (n, shown) => `${shown} ${n === 1 ? 'street' : 'streets'}`,
      facades: 'Facades',
    },
    factUnits: { buildingAge: (n) => (n === 1 ? 'yr' : 'yrs'), streetWidth: 'm' },
    listedNew: 'Newly listed',
    listedMonths: (n) => `Listed ${n} month${n === 1 ? '' : 's'} ago`,
    listedYears: (n) => `Listed ${n} year${n === 1 ? '' : 's'} ago`,
    offPlan: 'Off-plan — under construction',
    delivery: (d) => `Expected handover: ${d}`,
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
  const raw = strings.facts?.[key];
  if (!raw) return null;
  const num = Number(value);
  /* **والاسمُ قد يكون دالّةً تعرف عددَها** (المرحلة ٥٢) — فتُجمع على قاعدة العربيّة. */
  const rawUnit = strings.factUnits?.[key];
  const unit = typeof rawUnit === 'function' ? rawUnit(num) : rawUnit;
  const shown = typeof value === 'number' ? nf.format(value) : String(value);
  /* **والدالّةُ تُنتج العبارةَ كاملةً** — فالعربيّةُ تُفرد «غرفتان» بلا عدد،
     والإنجليزيّةُ تُقدّم العددَ دائمًا. وكلُّ لغةٍ تملك ترتيبَها ولا تُفرض عليها. */
  const name = typeof raw === 'function' ? raw(num, shown) : raw;
  if (COUNTED.has(key)) return typeof raw === 'function' ? name : `${shown} ${name}`;
  return `${name}: ${shown}${unit ? ` ${unit}` : ''}`;
}

/** «مُدرَجٌ منذ…» — والشهرُ الأوّل «حديثًا»، فرقمٌ صفرٌ لا يُقال. */
export function listedLabel(months, strings) {
  if (months == null) return null;
  if (months < 1) return strings.listedNew;
  if (months < 12) return strings.listedMonths(months);
  return strings.listedYears(Math.floor(months / 12));
}
