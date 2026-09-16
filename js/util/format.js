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


/**
 * فرقُ رقمٍ عن سابقه — **حسابًا خالصًا بلا عرض** (المرحلة ٤٦).
 *
 * ورقمٌ بلا مقارنةٍ لا يقول شيئًا: «١٢٠ ألفًا هذا الشهر» ليست خبرًا؛ خبرُها أنها أعلى من
 * الشهر الماضي بالثلث أو أدنى منه بالنصف.
 *
 * **وحالتان تُقالان ولا تُحسبان نسبةً** — وهما ما يكسر لوحةَ أرقام: سابقٌ بصفرٍ (القسمة
 * عليه لا تُعطي «∞٪»)، وتساوٍ (لا فرقَ يُذكر).
 *
 * @param {boolean} lowerIsBetter للمصاريف: نزولُها خبرٌ سارّ لا سيّئ — فينقلب **الحكم**
 *   وحده، والسهمُ يتبع الرقم لا الحكم.
 * @returns {{ kind: 'same'|'noBase'|'change', pct: number, up: boolean, good: boolean }}
 */
export function deltaOf(current, previous, { lowerIsBetter = false } = {}) {
  const cur = Number(current) || 0;
  const prev = Number(previous) || 0;
  if (cur === prev) return { kind: 'same', pct: 0, up: false, good: true };
  const up = cur > prev;
  const good = lowerIsBetter ? !up : up;
  if (prev === 0) return { kind: 'noBase', pct: 0, up, good };
  return { kind: 'change', pct: Math.round(((cur - prev) / Math.abs(prev)) * 100), up, good };
}

/* ===== تفقيط المبلغ (المرحلة ٤٦) ===== */

const W_ONES = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة'];
const W_TEENS = ['عشرة', 'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر', 'ستة عشر', 'سبعة عشر', 'ثمانية عشر', 'تسعة عشر'];
const W_TENS = ['', '', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'];
const W_HUNDREDS = ['', 'مائة', 'مائتان', 'ثلاثمائة', 'أربعمائة', 'خمسمائة', 'ستمائة', 'سبعمائة', 'ثمانمائة', 'تسعمائة'];

/** ما دون الألف — الأساسُ الذي تُبنى عليه الآلافُ والملايين. */
function wordsUnder1000(n) {
  const parts = [];
  const h = Math.floor(n / 100);
  const r = n % 100;
  if (h) parts.push(W_HUNDREDS[h]);
  if (r) {
    if (r < 10) parts.push(W_ONES[r]);
    else if (r < 20) parts.push(W_TEENS[r - 10]);
    else {
      const ones = r % 10;
      const tens = Math.floor(r / 10);
      // «واحدٌ وعشرون» — الآحادُ قبل العشرات في العربية، بعكس الإنجليزية.
      parts.push(ones ? `${W_ONES[ones]} و${W_TENS[tens]}` : W_TENS[tens]);
    }
  }
  return parts.join(' و');
}

/**
 * صيغةُ التمييز بعد عددٍ ما — **تتبع آخرَ لفظٍ في العدد لا مقدارَه**.
 *
 * وهذا موضعُ الخطأ الشائع: «٣ ريال» و«٥٠٠ ألفًا» كلاهما غلط. الصواب «ثلاثة ريالات»
 * و«خمسمائة ألف»، لأن المائةَ وما فوقها تُمَيَّز بمفردٍ مجرور، والأحدَ عشرَ إلى التسعةِ
 * والتسعين بمفردٍ منصوب، والثلاثةَ إلى العشرةِ بجمعِ قلّة.
 *
 * @param {[string,string,string,string]} forms مفردٌ · مثنًّى · جمعُ قلّة · مفردٌ منصوب
 */
function tamyeez(n, [one, two, few, many]) {
  const v = Math.abs(Math.round(n));
  if (v === 1) return one;
  if (v === 2) return two;
  if (v >= 3 && v <= 10) return few;
  if (v >= 11 && v <= 99) return many;
  const tail = v % 100;
  // «مائة ريال» و«ثلاثمائة ريال»: آخرُ اللفظ مائةٌ، فالتمييزُ مفرد.
  return tail === 0 ? one : tamyeez(tail, [one, two, few, many]);
}

/**
 * مجموعةُ مرتبةٍ (ألفٌ أو مليون) بلفظها الصحيح.
 *
 * **والمئاتُ تُفصل عمّا دونها**: «٥٢٥ ألفًا» تُقرأ «خمسمائة ألف وخمسة وعشرون ألفًا»،
 * لا «خمسمائة وخمسة وعشرون ألفًا» — إذ لكلِّ عددٍ تمييزُه. وهذا الفصلُ يجعلها صحيحةً
 * في كلّ الحالات بلا استثناءات.
 */
function scaleGroup(count, forms) {
  const hundreds = Math.floor(count / 100) * 100;
  const rest = count % 100;
  const out = [];
  // «مائتا ألف» لا «مائتان ألف»: المئةُ هنا مضافةٌ إلى المرتبة بعدها.
  if (hundreds) out.push(`${toConstruct(W_HUNDREDS[hundreds / 100])} ${forms[0]}`);
  if (rest === 1) out.push(forms[0]);
  else if (rest === 2) out.push(forms[1]);
  else if (rest) out.push(`${wordsUnder1000(rest)} ${tamyeez(rest, forms)}`);
  return out.join(' و');
}

/**
 * المضافُ إلى تمييزه تسقط نونُه وتنوينُه: «ألفان ريال» ← «ألفا ريال»، و«أحد عشر ألفًا
 * ريال» ← «أحد عشر ألف ريال». وهذا أكثرُ ما يُغفَل في التفقيط الآليّ.
 */
function toConstruct(text) {
  return String(text)
    .replace(/مائتان$/, 'مائتا')
    .replace(/ألفان$/, 'ألفا')
    .replace(/مليونان$/, 'مليونا')
    .replace(/ألفًا$/, 'ألف')
    .replace(/مليونًا$/, 'مليون');
}

const RIYAL = ['ريال', 'ريالان', 'ريالات', 'ريالًا'];
const HALALA = ['هللة', 'هللتان', 'هللات', 'هللةً'];

/**
 * تفقيط مبلغ: «٢٥٬٥٠٠٫٥٠» ← «خمسة وعشرون ألفًا وخمسمائة ريال وخمسون هللةً».
 *
 * **ولماذا يُحتاج:** سندُ القبض يُكتب فيه المبلغ رقمًا وكتابةً، لأن الرقم وحده يُزاد عليه
 * صفرٌ بقلم. والكتابةُ حارسٌ للرقم لا بديلٌ عنه — ولذلك يُطبعان معًا في السند.
 *
 * **وحدُّه معلَن:** يبلغ ما دون المليار. وما فوقه يُردّ رقمًا كما هو، فلا يُكتب نصٌّ خاطئ
 * عن مبلغ — وخطأٌ في سندِ قبضٍ أسوأ من فراغ.
 */
export function amountInWords(value, { currency = RIYAL, fraction = HALALA } = {}) {
  // **حارسٌ صارم قبل التحويل:** `Number(null)` و`Number('')` و`Number([])` كلُّها صفر في
  // جافاسكربت — فمبلغٌ غائبٌ كان يُطبع «صفر ريال» في سند قبض. وفراغٌ في السند أصدقُ من
  // صفرٍ لم يُكتب. والصفرُ الصريح وحده يُقال صفرًا.
  const ok = typeof value === 'number' || (typeof value === 'string' && value.trim() !== '');
  const total = ok ? Number(value) : NaN;
  if (!Number.isFinite(total) || total < 0) return '';
  const whole = Math.floor(total);
  const cents = Math.round((total - whole) * 100);
  if (whole >= 1_000_000_000) return `${formatNumber(total)} ${currency[0]}`;
  if (whole === 0 && cents === 0) return `صفر ${currency[0]}`;

  const parts = [];
  const millions = Math.floor(whole / 1_000_000);
  const thousands = Math.floor((whole % 1_000_000) / 1000);
  const rest = whole % 1000;
  if (millions) parts.push(scaleGroup(millions, ['مليون', 'مليونان', 'ملايين', 'مليونًا']));
  if (thousands) parts.push(scaleGroup(thousands, ['ألف', 'ألفان', 'آلاف', 'ألفًا']));

  // تمييزُ العملة يتبع آخرَ لفظٍ: إن انتهى المبلغ بمرتبةٍ (ألفٍ أو مليون) فهو مفرد،
  // وإن انتهى بعددٍ صريح فبصيغة ذلك العدد. و«ريالٌ واحد» و«ريالان» لا يُسبقان برقم.
  let head = '';
  if (rest === 0) {
    if (parts.length) head = `${toConstruct(parts.join(' و'))} ${currency[0]}`;
  } else if (rest === 1 || rest === 2) {
    const word = rest === 1 ? `${currency[0]} واحد` : currency[1];
    head = parts.length ? `${parts.join(' و')} و${word}` : word;
  } else {
    const body = [...parts, wordsUnder1000(rest)].join(' و');
    head = `${toConstruct(body)} ${tamyeez(rest, currency)}`;
  }

  if (!cents) return head;
  const tail = cents === 1 ? `${fraction[0]} واحدة`
    : cents === 2 ? fraction[1]
      : `${toConstruct(wordsUnder1000(cents))} ${tamyeez(cents, fraction)}`;
  // مبلغٌ دون الريال: الهللاتُ وحدها، بلا «ريال» مُعلَّقة في أوّله.
  return head ? `${head} و${tail}` : tail;
}
