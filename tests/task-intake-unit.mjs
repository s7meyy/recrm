// المرحلة ٤٠ — إدخال دفعة مهام: قراءة الموعد والأولوية، واختيار القائمة بسببٍ معلن.
import { proposeTasks, readDue, readPriority, pickList, TOPICS } from '../js/util/task-intake.js';
const ok = (n, c, x = '') => console.log(`${c ? 'PASS' : 'FAIL'} — ${n}${x ? ' :: ' + x : ''}`);
const NOW = Date.parse('2026-09-15T08:00:00'); // ثلاثاء
const LISTS = [
  { id: 'L1', title: 'اتصالات' },
  { id: 'L2', title: 'معاينات' },
  { id: 'L3', title: 'عقود وتراخيص' },
  { id: 'L4', title: 'تسويق' },
];
const one = (line, lists = LISTS) => proposeTasks(line, lists, { now: NOW })[0];
const hhmm = (iso) => { const d = new Date(iso); return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`; };
const ymd = (iso) => new Date(iso).toLocaleDateString('en-CA');

/* ===== الموعد ===== */
console.log('--- ٤٠. قراءة الموعد ---');
ok('«اليوم»', ymd(one('اتصل اليوم').dueAt) === '2026-09-15', ymd(one('اتصل اليوم').dueAt));
ok('«بكرة»', ymd(one('اتصل بكرة').dueAt) === '2026-09-16');
ok('«بعد بكرة» ليست «بكرة» (الأطولُ يُقرأ أوّلًا)', ymd(one('اتصل بعد بكرة').dueAt) === '2026-09-17', ymd(one('اتصل بعد بكرة').dueAt));
ok('«بعد ٣ أيام»', ymd(one('اجتماع بعد 3 أيام').dueAt) === '2026-09-18');
ok('«بعد أسبوعين»', ymd(one('راجع بعد 2 اسابيع').dueAt) === '2026-09-29', ymd(one('راجع بعد 2 اسابيع').dueAt));
ok('«الخميس» = القادم', ymd(one('معاينة الخميس').dueAt) === '2026-09-17', ymd(one('معاينة الخميس').dueAt));
ok('ويومُ اليوم نفسه يعني الأسبوع القادم لا الآن', ymd(one('مهمة الثلاثاء').dueAt) === '2026-09-22', ymd(one('مهمة الثلاثاء').dueAt));
ok('بلا موعد: null لا تاريخٌ مخترَع', one('اتصل على نورة').dueAt === null);

console.log('\n--- ٤٠. الوقت ---');
ok('موعدٌ بلا وقتٍ يكون ٩ صباحًا لا منتصف الليل', hhmm(one('معاينة بكرة').dueAt) === '9:00', hhmm(one('معاينة بكرة').dueAt));
ok('«الساعة ٤» بالأرقام العربية تُقرأ وتُقصّ', one('اتصل بكرة الساعة ٤').title === 'اتصل' && hhmm(one('اتصل بكرة الساعة ٤').dueAt) === '16:00',
  `${one('اتصل بكرة الساعة ٤').title} · ${hhmm(one('اتصل بكرة الساعة ٤').dueAt)}`);
ok('«10 ص» صباحًا', hhmm(one('راجع اليوم 10 ص').dueAt) === '10:00', hhmm(one('راجع اليوم 10 ص').dueAt));
ok('«5 م» مساءً', hhmm(one('معاينة الخميس 5 م').dueAt) === '17:00', hhmm(one('معاينة الخميس 5 م').dueAt));
ok('ورقمٌ بين ١ و٧ بلا ص/م يُفهم مساءً — لا أحد يواعد الرابعة فجرًا', hhmm(one('اتصل بكرة الساعة 4').dueAt) === '16:00');
ok('و«الساعة 10» تبقى صباحًا', hhmm(one('اتصل بكرة الساعة 10').dueAt) === '10:00', hhmm(one('اتصل بكرة الساعة 10').dueAt));

/* ===== العنوان يُنظَّف ===== */
console.log('\n--- ٤٠. العنوان ---');
ok('كلماتُ الموعد تخرج من العنوان', one('اتصل على سعد بكرة الساعة ٤').title === 'اتصل على سعد', one('اتصل على سعد بكرة الساعة ٤').title);
ok('وشُرَط القوائم وأرقامها ليست منه', one('- اتصل على سعد').title === 'اتصل على سعد' && one('1) اتصل على سعد').title === 'اتصل على سعد',
  `${one('- اتصل على سعد').title} · ${one('1) اتصل على سعد').title}`);
ok('والسطر كما قُرئ محفوظٌ ليُراجَع — بكلمات الموعد والأولوية التي خرجت من العنوان',
  one('- !! اتصل على سعد بكرة').source === '!! اتصل على سعد بكرة', one('- !! اتصل على سعد بكرة').source);

/* ===== الأولوية ===== */
console.log('\n--- ٤٠. الأولوية ---');
ok('«!!» عاجل', readPriority('!! جدّد الترخيص').priority === 'urgent');
ok('«عاجل» كلمةً', readPriority('عاجل: كلّم المالك').priority === 'urgent');
ok('«!» مرتفعة', readPriority('! راجع الفاتورة').priority === 'high');
ok('«مهم» مرتفعة', readPriority('مهم تجديد العقد').priority === 'high');
ok('«لاحقًا» منخفضة', readPriority('صوّر الشقة لاحقًا').priority === 'low');
ok('وبلا علامة: عادية', readPriority('اتصل على سعد').priority === 'normal');
ok('وعلامةُ الأولوية تخرج من العنوان', one('!! جدّد الترخيص').title === 'جدّد الترخيص', one('!! جدّد الترخيص').title);

/* ===== اختيار القائمة — بسببٍ يُعرض ===== */
console.log('\n--- ٤٠. اختيار القائمة ---');
ok('اسمُ القائمة في السطر يسبق كلّ شيء', pickList('ضعها في معاينات', LISTS).listId === 'L2');
ok('والأطولُ يسبق عند التزاحم',
  pickList('عقود وتراخيص', [{ id: 'A', title: 'عقود' }, { id: 'B', title: 'عقود وتراخيص' }]).listId === 'B');
ok('ثم كلمةٌ من اسمها', pickList('راجع عقود المالك', LISTS).listId === 'L3', pickList('راجع عقود المالك', LISTS).why);
ok('ثم الموضوع المدمج', pickList('اتصل على سعد', LISTS).listId === 'L1', pickList('اتصل على سعد', LISTS).why);
ok('وترخيصٌ يذهب إلى العقود', pickList('جدّد ترخيص إعلان', LISTS).listId === 'L3');
ok('وتصويرٌ يذهب إلى التسويق', pickList('صوّر الشقة', LISTS).listId === 'L4');
const unknown = pickList('شيء غامض', LISTS);
ok('وما لم يُعرف يُقال صراحةً، ولا يُدَّعى فهمٌ لم يقع', unknown.why.includes('لم يُعرف'), unknown.why);
ok('ولكلّ اختيارٍ سببٌ مكتوب — فالتوزيع يُراجَع لا يُقبل على عماه',
  LISTS.length && ['اتصل على سعد', 'صوّر', 'شيء غامض'].every((t) => pickList(t, LISTS).why.length > 3));
ok('وبلا قوائم: لا اختيار ولا انفجار', pickList('أيّ شيء', []).listId === null);

/* ===== الدفعة ===== */
console.log('\n--- ٤٠. الدفعة ---');
const batch = proposeTasks(['اتصل على سعد بكرة', '', '  ', 'معاينة النرجس الخميس', 'اتصل على سعد بكرة'].join('\n'), LISTS, { now: NOW });
ok('الأسطر الفارغة تُهمَل', batch.length === 2, String(batch.length));
ok('والمكرَّر في اللصقة نفسها لا يصير مهمّتين', batch.filter((t) => t.title === 'اتصل على سعد').length === 1);
ok('ولا شيء يُحفظ من هنا — اقتراحٌ محض', batch.every((t) => !t.id));
ok('ونصٌّ فارغ يعيد لا شيء', proposeTasks('', LISTS).length === 0 && proposeTasks(null, LISTS).length === 0);

/* ===== الموضوعات المدمجة ===== */
ok('لكل موضوعٍ كلماتُه وأسماءُ القوائم التي تُشبهه', TOPICS.every((t) => t.words.length && t.listWords.length && t.label));
