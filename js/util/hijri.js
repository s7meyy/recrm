// التاريخ الهجري (المرحلة ٣٨).
//
// التقويم المعتمد في السعودية أمُّ القرى، وهو ما تحسبه المتصفّحات تحت اسم
// `islamic-umalqura` — لا `islamic` المجرّد ولا `islamic-civil`، فهذان حسابيّان يفارقان
// تقويم أمّ القرى يومًا أو يومين، والفرقُ يومٌ في موعدٍ أو عقد.
//
// التحويل من المتصفّح نفسه (Intl)، بلا جدولٍ مكتوبٍ باليد وبلا مكتبة: الجدول يشيخ
// ويحتاج تحديثًا كلَّ سنة، وIntl يأتي محدَّثًا مع المتصفّح.
//
// وهذا **عرضٌ** لا تخزين: كل ما يُحفظ يبقى ISO ميلاديًّا كما كان، فلا يتغيّر شيء في
// البيانات ولا في النسخ الاحتياطية، ولا يُحسب فارقٌ مرّتين.

const CAL = 'ar-SA-u-ca-islamic-umalqura-nu-latn';

let fullFmt = null;
let shortFmt = null;
let dayFmt = null;
let monthYearFmt = null;
let supported = false;
try {
  fullFmt = new Intl.DateTimeFormat(CAL, { year: 'numeric', month: 'long', day: 'numeric' });
  shortFmt = new Intl.DateTimeFormat(CAL, { year: 'numeric', month: 'short', day: 'numeric' });
  dayFmt = new Intl.DateTimeFormat(CAL, { day: 'numeric' });
  monthYearFmt = new Intl.DateTimeFormat(CAL, { year: 'numeric', month: 'long' });
  // تحقّقٌ فعليّ لا ادّعاء: متصفّحٌ لا يعرف أمّ القرى يعيد تاريخًا ميلاديًّا صامتًا،
  // فنتأكّد أن السنة الراجعة هجريّة (١٣٠٠–١٦٠٠) قبل أن نعد بشيء.
  const y = Number(new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', { year: 'numeric' }).format(new Date()).replace(/\D/g, ''));
  supported = y >= 1300 && y <= 1600;
} catch { supported = false; }

export function hijriSupported() { return supported; }

function toDate(iso) {
  if (!iso) return null;
  const d = iso instanceof Date ? iso : new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** «٤ ربيع الآخر ١٤٤٨ هـ» */
export function formatHijri(iso) {
  const d = toDate(iso);
  if (!d || !supported) return '';
  return fullFmt.format(d);
}

/** صيغة مختصرة تصلح للجداول: «٤ ربيع الآخر ١٤٤٨ هـ» بأسماء أشهر مختصرة. */
export function formatHijriShort(iso) {
  const d = toDate(iso);
  if (!d || !supported) return '';
  return shortFmt.format(d);
}

/** رقم اليوم الهجري وحده — لخانات التقويم، حيث لا يتّسع أكثر. */
export function hijriDay(iso) {
  const d = toDate(iso);
  if (!d || !supported) return '';
  return dayFmt.format(d);
}

/** «ربيع الآخر ١٤٤٨ هـ» — لعنوان الشهر. */
export function hijriMonthYear(iso) {
  const d = toDate(iso);
  if (!d || !supported) return '';
  return monthYearFmt.format(d);
}

/**
 * عنوان الشهر حين يمتدّ الشهر الميلادي على شهرين هجريَّين — وهو الغالب.
 * «ربيع الأول – ربيع الآخر ١٤٤٨ هـ» لا «ربيع الأول ١٤٤٨ هـ» وحده، فالنصف الثاني من
 * الشهر ليس فيه.
 */
export function hijriRange(startIso, endIso) {
  const a = hijriMonthYear(startIso);
  const b = hijriMonthYear(endIso);
  if (!a) return '';
  if (a === b) return a;
  // حذف السنة من الطرف الأول إن اتّفقت السنتان: «ربيع الأول – ربيع الآخر ١٤٤٨ هـ»
  const yearA = a.match(/\d+/)?.[0];
  const yearB = b.match(/\d+/)?.[0];
  if (yearA && yearA === yearB) return `${a.replace(/\s*\d+\s*هـ\s*$/, '')} – ${b}`;
  return `${a} – ${b}`;
}
