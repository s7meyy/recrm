// المدن والمناطق الإدارية في المملكة العربية السعودية.
// المصدر المرجعي: التقسيم الإداري الرسمي (13 منطقة).
// القائمة تُغطّي المدن التي يُرجَّح وجود منشآت تجارية فيها على قوقل مابز.

export const REGIONS = [
  { id: 'riyadh',        name: 'منطقة الرياض' },
  { id: 'makkah',        name: 'منطقة مكة المكرمة' },
  { id: 'madinah',       name: 'منطقة المدينة المنورة' },
  { id: 'qassim',        name: 'منطقة القصيم' },
  { id: 'eastern',       name: 'المنطقة الشرقية' },
  { id: 'asir',          name: 'منطقة عسير' },
  { id: 'tabuk',         name: 'منطقة تبوك' },
  { id: 'hail',          name: 'منطقة حائل' },
  { id: 'northern',      name: 'منطقة الحدود الشمالية' },
  { id: 'jazan',         name: 'منطقة جازان' },
  { id: 'najran',        name: 'منطقة نجران' },
  { id: 'baha',          name: 'منطقة الباحة' },
  { id: 'jawf',          name: 'منطقة الجوف' },
];

export const CITIES = [
  // الرياض
  { id: 'riyadh',        name: 'الرياض',           region: 'riyadh' },
  { id: 'diriyah',       name: 'الدرعية',          region: 'riyadh' },
  { id: 'kharj',         name: 'الخرج',            region: 'riyadh' },
  { id: 'majmaah',       name: 'المجمعة',          region: 'riyadh' },
  { id: 'zulfi',         name: 'الزلفي',           region: 'riyadh' },
  { id: 'dawadmi',       name: 'الدوادمي',         region: 'riyadh' },
  { id: 'afif',          name: 'عفيف',             region: 'riyadh' },
  { id: 'wadi-dawasir',  name: 'وادي الدواسر',     region: 'riyadh' },
  { id: 'quwaiiyah',     name: 'القويعية',         region: 'riyadh' },
  { id: 'shaqra',        name: 'شقراء',            region: 'riyadh' },
  { id: 'huraymila',     name: 'حريملاء',          region: 'riyadh' },
  { id: 'thadiq',        name: 'ثادق',             region: 'riyadh' },
  { id: 'hotat-bani-tamim', name: 'حوطة بني تميم', region: 'riyadh' },
  { id: 'aflaj',         name: 'الأفلاج',          region: 'riyadh' },
  { id: 'sulayyil',      name: 'السليل',           region: 'riyadh' },
  { id: 'rumah',         name: 'رماح',             region: 'riyadh' },
  { id: 'muzahimiyah',   name: 'المزاحمية',        region: 'riyadh' },

  // مكة المكرمة
  { id: 'makkah',        name: 'مكة المكرمة',      region: 'makkah' },
  { id: 'jeddah',        name: 'جدة',              region: 'makkah' },
  { id: 'taif',          name: 'الطائف',           region: 'makkah' },
  { id: 'rabigh',        name: 'رابغ',             region: 'makkah' },
  { id: 'qunfudhah',     name: 'القنفذة',          region: 'makkah' },
  { id: 'lith',          name: 'الليث',            region: 'makkah' },
  { id: 'khulais',       name: 'خليص',             region: 'makkah' },
  { id: 'jumum',         name: 'الجموم',           region: 'makkah' },
  { id: 'kamil',         name: 'الكامل',           region: 'makkah' },
  { id: 'turubah',       name: 'تربة',             region: 'makkah' },
  { id: 'ranyah',        name: 'رنية',             region: 'makkah' },
  { id: 'khurmah',       name: 'الخرمة',           region: 'makkah' },
  { id: 'adham',         name: 'أضم',              region: 'makkah' },

  // المدينة المنورة
  { id: 'madinah',       name: 'المدينة المنورة',  region: 'madinah' },
  { id: 'yanbu',         name: 'ينبع',             region: 'madinah' },
  { id: 'ula',           name: 'العلا',            region: 'madinah' },
  { id: 'badr',          name: 'بدر',              region: 'madinah' },
  { id: 'khaybar',       name: 'خيبر',             region: 'madinah' },
  { id: 'mahd',          name: 'مهد الذهب',        region: 'madinah' },
  { id: 'henakiyah',     name: 'الحناكية',         region: 'madinah' },

  // القصيم
  { id: 'buraydah',      name: 'بريدة',            region: 'qassim' },
  { id: 'unaizah',       name: 'عنيزة',            region: 'qassim' },
  { id: 'rass',          name: 'الرس',             region: 'qassim' },
  { id: 'mithnab',       name: 'المذنب',           region: 'qassim' },
  { id: 'bukayriyah',    name: 'البكيرية',         region: 'qassim' },
  { id: 'badayea',       name: 'البدائع',          region: 'qassim' },
  { id: 'khabra',        name: 'الخبراء',          region: 'qassim' },
  { id: 'riyadh-khabra', name: 'رياض الخبراء',     region: 'qassim' },
  { id: 'uyun-jiwa',     name: 'عيون الجواء',      region: 'qassim' },
  { id: 'nabhaniyah',    name: 'النبهانية',        region: 'qassim' },
  { id: 'shimasiyah',    name: 'الشماسية',         region: 'qassim' },

  // الشرقية
  { id: 'dammam',        name: 'الدمام',           region: 'eastern' },
  { id: 'khobar',        name: 'الخبر',            region: 'eastern' },
  { id: 'dhahran',       name: 'الظهران',          region: 'eastern' },
  { id: 'qatif',         name: 'القطيف',           region: 'eastern' },
  { id: 'jubail',        name: 'الجبيل',           region: 'eastern' },
  { id: 'hofuf',         name: 'الهفوف (الأحساء)', region: 'eastern' },
  { id: 'mubarraz',      name: 'المبرز',           region: 'eastern' },
  { id: 'hafr-batin',    name: 'حفر الباطن',       region: 'eastern' },
  { id: 'khafji',        name: 'الخفجي',           region: 'eastern' },
  { id: 'nairyah',       name: 'النعيرية',         region: 'eastern' },
  { id: 'ras-tanura',    name: 'رأس تنورة',        region: 'eastern' },
  { id: 'abqaiq',        name: 'بقيق',             region: 'eastern' },
  { id: 'safwa',         name: 'صفوى',             region: 'eastern' },
  { id: 'saihat',        name: 'سيهات',            region: 'eastern' },
  { id: 'tarut',         name: 'تاروت',            region: 'eastern' },

  // عسير
  { id: 'abha',          name: 'أبها',             region: 'asir' },
  { id: 'khamis',        name: 'خميس مشيط',        region: 'asir' },
  { id: 'bisha',         name: 'بيشة',             region: 'asir' },
  { id: 'mahayel',       name: 'محايل عسير',       region: 'asir' },
  { id: 'nemas',         name: 'النماص',           region: 'asir' },
  { id: 'sarat-abidah',  name: 'سراة عبيدة',       region: 'asir' },
  { id: 'ahad-rufaidah', name: 'أحد رفيدة',        region: 'asir' },
  { id: 'tathleeth',     name: 'تثليث',            region: 'asir' },
  { id: 'rijal-almaa',   name: 'رجال ألمع',        region: 'asir' },
  { id: 'dhahran-janoub',name: 'ظهران الجنوب',     region: 'asir' },

  // تبوك
  { id: 'tabuk',         name: 'تبوك',             region: 'tabuk' },
  { id: 'duba',          name: 'ضباء',             region: 'tabuk' },
  { id: 'umluj',         name: 'أملج',             region: 'tabuk' },
  { id: 'haql',          name: 'حقل',              region: 'tabuk' },
  { id: 'taima',         name: 'تيماء',            region: 'tabuk' },
  { id: 'wajh',          name: 'الوجه',            region: 'tabuk' },
  { id: 'neom',          name: 'نيوم',             region: 'tabuk' },

  // حائل
  { id: 'hail',          name: 'حائل',             region: 'hail' },
  { id: 'baqaa',         name: 'بقعاء',            region: 'hail' },
  { id: 'ghazalah',      name: 'الغزالة',          region: 'hail' },
  { id: 'shinan',        name: 'الشنان',           region: 'hail' },

  // الحدود الشمالية
  { id: 'arar',          name: 'عرعر',             region: 'northern' },
  { id: 'rafha',         name: 'رفحاء',            region: 'northern' },
  { id: 'turaif',        name: 'طريف',             region: 'northern' },

  // جازان
  { id: 'jazan',         name: 'جازان',            region: 'jazan' },
  { id: 'sabya',         name: 'صبيا',             region: 'jazan' },
  { id: 'abu-arish',     name: 'أبو عريش',         region: 'jazan' },
  { id: 'samtah',        name: 'صامطة',            region: 'jazan' },
  { id: 'farasan',       name: 'فرسان',            region: 'jazan' },
  { id: 'ahad-masarha',  name: 'أحد المسارحة',     region: 'jazan' },
  { id: 'baish',         name: 'بيش',              region: 'jazan' },

  // نجران
  { id: 'najran',        name: 'نجران',            region: 'najran' },
  { id: 'sharurah',      name: 'شرورة',            region: 'najran' },
  { id: 'habuna',        name: 'حبونا',            region: 'najran' },

  // الباحة
  { id: 'baha',          name: 'الباحة',           region: 'baha' },
  { id: 'baljurashi',    name: 'بلجرشي',           region: 'baha' },
  { id: 'mandaq',        name: 'المندق',           region: 'baha' },
  { id: 'qilwah',        name: 'قلوة',             region: 'baha' },
  { id: 'aqiq',          name: 'العقيق',           region: 'baha' },

  // الجوف
  { id: 'sakaka',        name: 'سكاكا',            region: 'jawf' },
  { id: 'qurayyat',      name: 'القريات',          region: 'jawf' },
  { id: 'dumat-jandal',  name: 'دومة الجندل',      region: 'jawf' },
];

export const cityById = (id) => CITIES.find((c) => c.id === id) || null;
export const regionById = (id) => REGIONS.find((r) => r.id === id) || null;
export const citiesOfRegion = (regionId) => CITIES.filter((c) => c.region === regionId);
