// تنسيق الأرقام والريال والمساحة والتواريخ (ميلادي، أرقام إنجليزية).

const numberFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

let dateFormat = null;
let dateTimeFormat = null;
try {
  dateFormat = new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', { year: 'numeric', month: 'long', day: 'numeric' });
  dateTimeFormat = new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
} catch (_) { /* يُستعمل البديل أدناه */ }

export function formatNumber(n) {
  if (n == null || n === '' || Number.isNaN(Number(n))) return '';
  return numberFormat.format(Number(n));
}

export function formatSAR(n) {
  return n == null || n === '' ? 'السعر غير معروف' : `${formatNumber(n)} ريال`;
}

export function formatArea(n) {
  return n == null || n === '' ? '—' : `${formatNumber(n)} م²`;
}

function toDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * الهجري مع الميلادي (المرحلة ٣٨).
 *
 * التاريخ يُقرأ في هذا البلد هجريًّا وميلاديًّا معًا، وكان المشروع كلّه ميلاديًّا وحده.
 * وبدل تعديل واحدٍ وخمسين موضعًا يستدعي `formatDate` — وينسى الواحدُ منها فيبقى نصفُ
 * البرنامج بتقويمٍ ونصفُه بآخر — يُضاف الهجري هنا، في المصدر، فيصل إلى الجميع دفعةً.
 * ومن لا يريده يُطفئه من الإعدادات، فيعود كلُّ شيء كما كان بلا استثناء.
 */
let hijriOn = true;
let hijriFmt = null;
let hijriShortFmt = null;
try {
  hijriFmt = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura-nu-latn', { year: 'numeric', month: 'long', day: 'numeric' });
  hijriShortFmt = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura-nu-latn', { month: 'short', day: 'numeric' });
} catch (_) { /* متصفّح لا يعرف أمّ القرى — يبقى الميلادي وحده */ }

export function setHijriMode(on) { hijriOn = !!on && !!hijriFmt; }
export function hijriMode() { return hijriOn && !!hijriFmt; }

export function formatDate(iso) {
  const d = toDate(iso);
  if (!d) return '—';
  const greg = dateFormat ? dateFormat.format(d) : d.toLocaleDateString();
  if (!hijriOn || !hijriFmt) return greg;
  return `${greg} · ${hijriFmt.format(d)}`;
}

export function formatDateTime(iso) {
  const d = toDate(iso);
  if (!d) return '—';
  const greg = dateTimeFormat ? dateTimeFormat.format(d) : d.toLocaleString();
  // في التاريخ والوقت معًا يُختصر الهجري إلى اليوم والشهر: السنة مكرَّرة في الميلادي
  // بجانبه، والسطر يطول فيُقطع في الجداول. واسم الشهر وحده يدلّ على التقويم، فلا يُلحق
  // بـ«هـ» بلا سنة — «٤ ربيع الآخر هـ» ليست عربيّة.
  if (!hijriOn || !hijriShortFmt) return greg;
  return `${greg} · ${hijriShortFmt.format(d)}`;
}

const pad = (x) => String(x).padStart(2, '0');

/** قيمة لحقل <input type="date"> بالتوقيت المحلي. */
export function toInputDate(iso = null) {
  const d = iso ? toDate(iso) : new Date();
  if (!d) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** قيمة لحقل <input type="datetime-local"> بالتوقيت المحلي. */
export function toInputDateTime(iso = null) {
  const d = iso ? toDate(iso) : new Date();
  if (!d) return '';
  return `${toInputDate(d.toISOString())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** من 'YYYY-MM-DD' إلى ISO (منتصف الليل بالتوقيت المحلي). */
export function fromInputDate(value) {
  if (!value) return null;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** من 'YYYY-MM-DDTHH:MM' إلى ISO. */
export function fromInputDateTime(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** عدد الأيام الكاملة من fromIso إلى toIso (موجب إن كان toIso لاحقًا). */
export function daysBetween(fromIso, toIso = new Date().toISOString()) {
  const a = toDate(fromIso);
  const b = toDate(toIso);
  if (!a || !b) return null;
  return Math.round((startOfDay(b) - startOfDay(a)) / 86400000);
}

/** صيغة العدد مع كلمة "يوم" بحسب قواعد العربية. */
export function daysWord(n) {
  const x = Math.abs(n);
  if (x === 0) return 'اليوم';
  if (x === 1) return 'يوم واحد';
  if (x === 2) return 'يومين';
  if (x <= 10) return `${countOf(x, 'يوم')}`;
  return `${countOf(x, 'يوم')}`;
}

/**
 * معجمُ المعدودات (المرحلة ٤٤): [مفرد، مثنّى، جمعُ قلّة ٣–١٠، تمييزٌ مفردٌ منصوب ١١+].
 *
 * **ولماذا معجمٌ لا أربعُ صيغٍ عند كل نداء؟** وُجد في المشروع مئةٌ وتسعةَ عشرَ موضعًا
 * يُلصق فيها العددُ باسمٍ مفرد — «٣ عقار مختار» و«٢ التقاط» و«١١ عقار ناقص» — لأنّ كتابة
 * أربع صيغٍ في كل موضعٍ عبءٌ يُترك. فالصيغُ تُكتب **مرّةً واحدةً مراجَعة**، ويصير النداء
 * `countOf(n, 'عقار')`، فلا يبقى للإهمال عذر.
 */
export const NOUNS = {
  عقار: ['عقارٌ واحد', 'عقاران', 'عقارات', 'عقارًا'],
  عرض: ['عرضٌ واحد', 'عرضان', 'عروض', 'عرضًا'],
  طلب: ['طلبٌ واحد', 'طلبان', 'طلبات', 'طلبًا'],
  صفقة: ['صفقةٌ واحدة', 'صفقتان', 'صفقات', 'صفقة'],
  عميل: ['عميلٌ واحد', 'عميلان', 'عملاء', 'عميلًا'],
  مهمة: ['مهمّةٌ واحدة', 'مهمّتان', 'مهامّ', 'مهمّة'],
  حي: ['حيٌّ واحد', 'حيّان', 'أحياء', 'حيًّا'],
  صورة: ['صورةٌ واحدة', 'صورتان', 'صور', 'صورة'],
  مقطع: ['مقطعٌ واحد', 'مقطعان', 'مقاطع', 'مقطعًا'],
  فاتورة: ['فاتورةٌ واحدة', 'فاتورتان', 'فواتير', 'فاتورة'],
  موعد: ['موعدٌ واحد', 'موعدان', 'مواعيد', 'موعدًا'],
  معاينة: ['معاينةٌ واحدة', 'معاينتان', 'معاينات', 'معاينة'],
  مطابقة: ['مطابقةٌ واحدة', 'مطابقتان', 'مطابقات', 'مطابقة'],
  مرشح: ['مرشّحٌ واحد', 'مرشّحان', 'مرشّحين', 'مرشّحًا'], // «٥ مرشّحين» لا «مرشّحون»: جمعُ المذكر السالم بعد العدد منصوبٌ
  سجل: ['سجلٌّ واحد', 'سجلّان', 'سجلّات', 'سجلًّا'],
  جهة: ['جهةٌ واحدة', 'جهتان', 'جهات', 'جهة'],
  مصدر: ['مصدرٌ واحد', 'مصدران', 'مصادر', 'مصدرًا'],
  دفعة: ['دفعةٌ واحدة', 'دفعتان', 'دفعات', 'دفعة'],
  رأي: ['رأيٌ واحد', 'رأيان', 'آراء', 'رأيًا'],
  تغيير: ['تغييرٌ واحد', 'تغييران', 'تغييرات', 'تغييرًا'],
  التقاط: ['التقاطٌ واحد', 'التقاطان', 'التقاطات', 'التقاطًا'],
  تسجيل: ['تسجيلٌ واحد', 'تسجيلان', 'تسجيلات', 'تسجيلًا'],
  حرف: ['حرفٌ واحد', 'حرفان', 'أحرف', 'حرفًا'],
  صف: ['صفٌّ واحد', 'صفّان', 'صفوف', 'صفًّا'],
  عمود: ['عمودٌ واحد', 'عمودان', 'أعمدة', 'عمودًا'],
  زوج: ['زوجٌ واحد', 'زوجان', 'أزواج', 'زوجًا'],
  إعداد: ['إعدادٌ واحد', 'إعدادان', 'إعدادات', 'إعدادًا'],
  كتلة: ['كتلةٌ واحدة', 'كتلتان', 'كتل', 'كتلة'],
  محطة: ['محطةٌ واحدة', 'محطتان', 'محطات', 'محطة'],
  فتحة: ['فتحةٌ واحدة', 'فتحتان', 'فتحات', 'فتحة'],
  تواصل: ['تواصلٌ واحد', 'تواصلان', 'اتصالات', 'تواصلًا'],
  يوم: ['يومٌ واحد', 'يومان', 'أيام', 'يومًا'],
  شهر: ['شهرٌ واحد', 'شهران', 'أشهر', 'شهرًا'],
  سنة: ['سنةٌ واحدة', 'سنتان', 'سنوات', 'سنة'],
  دقيقة: ['دقيقةٌ واحدة', 'دقيقتان', 'دقائق', 'دقيقة'],
  ثانية: ['ثانيةٌ واحدة', 'ثانيتان', 'ثوانٍ', 'ثانية'],
  عمولة: ['عمولةٌ واحدة', 'عمولتان', 'عمولات', 'عمولة'],
  مستند: ['مستندٌ واحد', 'مستندان', 'مستندات', 'مستندًا'],

  // **ومركَّباتٌ يلزم فيها وصفٌ يوافق معدودَه**: «٣ عقارات ناقص» ليست عربيّة كما أنّ
  // «٣ عقار» ليست — فالوصفُ يتبع المعدود في عدده وجنسه. فتُكتب مع اسمها لا تُلصق به.
  'عقار ناقص': ['عقارٌ واحدٌ ناقصُ البيانات', 'عقاران ناقصا البيانات', 'عقارات ناقصة البيانات', 'عقارًا ناقصَ البيانات'],
  'عقار مختار': ['عقارٌ واحدٌ مختار', 'عقاران مختاران', 'عقارات مختارة', 'عقارًا مختارًا'],
  'عقار ظاهر': ['عقارٍ واحدٍ ظاهر', 'عقارين ظاهرين', 'عقارات ظاهرة', 'عقارًا ظاهرًا'],
  'حي مختار': ['حيٌّ واحدٌ مختار', 'حيّان مختاران', 'أحياء مختارة', 'حيًّا مختارًا'],
  'عرض خارجي': ['عرضٌ خارجيٌّ واحد', 'عرضان خارجيّان', 'عروض خارجية', 'عرضًا خارجيًّا'],
  'طلب نشط': ['طلبٌ نشطٌ واحد', 'طلبان نشطان', 'طلبات نشطة', 'طلبًا نشطًا'],
  'مصدر مسمى': ['مصدرٌ واحدٌ مسمّى', 'مصدران مسمَّيان', 'مصادر مسمّاة', 'مصدرًا مسمّى'],
  'صفقة مكتملة': ['صفقةٍ واحدةٍ مكتملة', 'صفقتين مكتملتين', 'صفقات مكتملة', 'صفقةً مكتملة'],
  'دفعة مستحقة': ['دفعةٌ واحدةٌ مستحقّة', 'دفعتان مستحقّتان', 'دفعات مستحقّة', 'دفعةً مستحقّة'],
};

/**
 * عددٌ ومعدودُه من المعجم: `countOf(3, 'عقار')` ← «٣ عقارات».
 * واسمٌ ليس في المعجم يُعاد كما هو بعد العدد — **ولا يُخترع له جمع**.
 */
export function countOf(n, noun) {
  const forms = NOUNS[noun];
  if (!forms) return `${formatNumber(Math.abs(Math.round(Number(n) || 0)))} ${noun}`;
  return countWord(n, forms);
}

/**
 * عدد معدودًا بالعربية الصحيحة (المرحلة ١٧): «٦ طلبات» لا «6 طلب».
 * @param {number} n العدد
 * @param {[string, string, string, string]} forms [مفرد، مثنّى، جمع قلّة (٣–١٠)، تمييز مفرد منصوب (١١+)]
 */
export function countWord(n, [one, two, few, many]) {
  const x = Math.abs(Math.round(Number(n) || 0));
  if (x === 1) return one;
  if (x === 2) return two;
  if (x % 100 >= 3 && x % 100 <= 10) return `${formatNumber(x)} ${few}`;
  return `${formatNumber(x)} ${many}`;
}

/** "اليوم" / "أمس" / "قبل 3 أيام" / "غدًا" / "بعد 5 أيام" */
export function relativeDays(iso) {
  const diff = daysBetween(iso);
  if (diff == null) return '—';
  if (diff === 0) return 'اليوم';
  if (diff === 1) return 'أمس';
  if (diff === -1) return 'غدًا';
  return diff > 0 ? `قبل ${daysWord(diff)}` : `بعد ${daysWord(diff)}`;
}
