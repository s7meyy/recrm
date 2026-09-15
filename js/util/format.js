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
  if (x <= 10) return `${x} أيام`;
  return `${x} يومًا`;
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
