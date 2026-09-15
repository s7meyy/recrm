// المرحلة ٣٨ — التاريخ الهجري: وحدةٌ بلا متصفّح.
import { formatHijri, formatHijriShort, hijriDay, hijriMonthYear, hijriRange, hijriSupported } from '../js/util/hijri.js';
import { formatDate, formatDateTime, setHijriMode, hijriMode } from '../js/util/format.js';
const ok = (n, c, x = '') => console.log(`${c ? 'PASS' : 'FAIL'} — ${n}${x ? ' :: ' + x : ''}`);

ok('البيئة تعرف تقويم أمّ القرى', hijriSupported());

/* التقويم المعتمد أمُّ القرى لا الحسابيّ المجرَّد */
const d = '2026-09-15T12:00:00Z';
ok('١٥ سبتمبر ٢٠٢٦ = ٤ ربيع الآخر ١٤٤٨', formatHijri(d).includes('4') && formatHijri(d).includes('ربيع الآخر') && formatHijri(d).includes('1448'), formatHijri(d));
ok('يوم الشهر وحده رقمٌ مجرَّد', hijriDay(d) === '4', hijriDay(d));
ok('الشهر والسنة بلا يوم', hijriMonthYear(d).includes('ربيع الآخر') && hijriMonthYear(d).includes('1448'), hijriMonthYear(d));

/* أمّ القرى تفارق الحسابيَّ المجرَّد — فلو خُلط لظهر الفرق هنا */
const civil = new Intl.DateTimeFormat('en-u-ca-islamic-civil', { day: 'numeric', month: 'numeric', year: 'numeric' }).format(new Date(d));
const umm = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', { day: 'numeric', month: 'numeric', year: 'numeric' }).format(new Date(d));
ok('الفرق بين أمّ القرى والحسابيّ ملحوظٌ فعلًا (فالاختيار له معنى)', civil !== umm, `${umm} ≠ ${civil}`);

/* الشهر الميلادي يقع على شهرين هجريَّين — والعنوان يذكرهما */
const range = hijriRange('2026-09-01', '2026-09-30');
ok('عنوان الشهر يجمع الشهرين لا أوّلهما وحده', range.includes('–') && range.includes('ربيع الأول') && range.includes('ربيع الآخر'), range);
ok('وسنةٌ واحدة لا تُكرَّر مرّتين في العنوان', (range.match(/1448/g) || []).length === 1, range);
const cross = hijriRange('2026-06-01', '2026-06-30');
ok('وشهرٌ لا يمتدّ يُكتب مفردًا أو ممتدًّا بحسب الواقع', cross.length > 0, cross);

/* الوصل بالتنسيق العام: الهجري مع الميلادي لا بدلًا منه */
console.log('');
setHijriMode(true);
ok('الوضع مُشغَّل', hijriMode());
const both = formatDate(d);
ok('التاريخ العام يحمل التقويمين معًا', both.includes('2026') && both.includes('1448'), both);
ok('والميلادي أوّلًا (هو الأصل المخزَّن)', both.indexOf('2026') < both.indexOf('1448'), both);
const dt = formatDateTime(d);
ok('التاريخ والوقت: الهجري مختصرٌ بلا سنةٍ مكرَّرة', dt.includes('ربيع الآخر') && (dt.match(/1448/g) || []).length === 0, dt);

setHijriMode(false);
ok('الإطفاء يعيد الميلادي وحده', !formatDate(d).includes('1448') && formatDate(d).includes('2026'), formatDate(d));
ok('والإطفاء يُطفئ التاريخ والوقت كذلك', !formatDateTime(d).includes('ربيع'), formatDateTime(d));
setHijriMode(true);

/* لا يُخزَّن شيءٌ هجريًّا: ما يُحفظ يبقى ISO */
const { toInputDate, fromInputDate } = await import('../js/util/format.js');
const round = fromInputDate('2026-09-15');
ok('التحويل ذهابًا وإيابًا يبقى ميلاديًّا كما كان (عرضٌ لا تخزين)', toInputDate(round) === '2026-09-15', `${round} → ${toInputDate(round)}`);

/* المدخلات الفارغة والفاسدة لا تنفجر */
ok('تاريخٌ فارغ يعيد فراغًا لا خطأً', formatHijri(null) === '' && hijriDay('') === '' && formatHijriShort(undefined) === '');
ok('وتاريخٌ فاسد كذلك', formatHijri('ليس تاريخًا') === '', JSON.stringify(formatHijri('ليس تاريخًا')));
