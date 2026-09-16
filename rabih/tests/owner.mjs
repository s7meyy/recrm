// اختبار التقرير بعين صاحب المحل: الخلاصة، وحدود التغطية، والهوامش،
// وأن ما لا يُحسم لا يُسمّى تحسّنًا.
//
//   node tests/owner.mjs

import { brief, briefBlock } from '../js/brief.js';
import { coverage, coverageBlock } from '../js/coverage.js';
import { actions, actionsBlock, checklistBlock, commitBlock, draftsBlock, keepBlock, unansweredBlock } from '../js/action.js';
import { impact } from '../js/impact.js';
import { topicStats } from '../js/lexicon.js';
import { selfCompareBlock, trendWithinBlock } from '../js/compare.js';
import { buildReportHtml } from '../js/report.js';
import { TEMPLATES, DEFAULT_TEMPLATE } from '../js/templates.js';
import { build as buildMessage } from '../js/messages.js';
import { topicCoverage, topicSentimentDetail } from '../js/lexicon.js';
import { priorities, priorityBlock } from '../js/priority.js';
import { recentVsOlder } from '../js/recency.js';
import { voice, cardBlock } from '../js/voice.js';
import { topicIcon } from '../js/lexicon.js';
import { extract } from '../js/entities.js';
import { emptyPlace, emptyReview, assignReviewIds } from '../js/schema.js';
import { readFileSync, readdirSync } from 'node:fs';

const fails = [];
const ok = (t) => console.log('  ✓', t);
const bad = (t, e) => { fails.push(t + (e ? ' :: ' + e : '')); console.log('  ✗', t, e || ''); };

const mk = (r, t, d) => ({ ...emptyReview(), rating: r, text: t, date: d === undefined ? 'قبل شهر' : d });
const build = (list, ratings = null) => {
  const p = emptyPlace();
  p.identity.name = 'مقهى الاختبار';
  p.ratings = ratings || { average: 4.2, count: 310, distribution: null };
  p.reviews = list;
  assignReviewIds(p);
  return p;
};

console.log('١) لوحة «في سطور»');
const p1 = build([
  mk(1, 'الانتظار طويل جدا ووقفت نص ساعة', 'قبل أسبوع'),
  mk(2, 'انتظرت كثير والخدمة بطيئة', 'قبل أسبوعين'),
  mk(5, 'القهوة ممتازة والمكان هادئ', 'قبل شهر'),
  mk(4, 'المكان جميل والجلسات مريحة', 'قبل شهرين'),
]);
const b1 = brief(p1, { assume: { ticket: 30, monthly: 900, loss: 25 } });
b1 ? ok('اللوحة تُبنى') : bad('لا لوحة');
b1.worst?.id === 'wait' ? ok(`أكبر شكوى: ${b1.worst.name}`) : bad('أكبر شكوى', b1.worst?.id);
b1.ci && b1.ci.margin > 0 ? ok(`ومعها هامشها: ±${b1.ci.margin}`) : bad('بلا هامش');
b1.action.includes('الانتظار') ? ok('وفعلٌ أول مشتقٌّ منها') : bad('الفعل الأول', b1.action);
brief(build([])) === null ? ok('وبلا تعليقات لا لوحة') : bad('لوحة بلا بيانات');

const html1 = briefBlock(p1, { assume: { ticket: 30, monthly: 900, loss: 25 } });
html1.includes('من 5') ? ok('«من 5» بأرقام لاتينية — والخمسة العربية تُقرأ صفرًا') : bad('أرقام الغلاف');
!/[٠-٩]/.test(html1) ? ok('ولا رقم عربيَّ الشكل في اللوحة') : bad('أرقام مختلطة', (html1.match(/[٠-٩]+/g) || []).join());

console.log('٢) ما لا يغطّيه التقرير');
const p2 = build([
  mk(5, 'القهوة ممتازة', 'قبل شهر'),
  mk(4, 'زرته أمس مع ابن عمي وكان يوما لطيفا', null),
  mk(null, 'الانتظار طويل', 'قبل شهر'),
], { average: 4.2, count: 310, withText: 87, distribution: null });
const c2 = coverage(p2, { excluded: [{ id: 'R009' }] });
const row = (label) => c2.rows.find((r) => r.label.includes(label));
row('صامتة')?.count === 223 ? ok('التقييمات الصامتة معدودة: 310 − 87 = 223') : bad('الصامتة', JSON.stringify(row('صامتة')));
row('لم تُصنَّف')?.count >= 1 ? ok(`وما لم يعرفه القاموس معدود: ${row('لم تُصنَّف').count}`) : bad('غير المصنَّف');
row('بلا تاريخ')?.count === 1 ? ok('وما لا تاريخ له لا يدخل القراءة الزمنية — ويُقال') : bad('بلا تاريخ');
row('بلا تقييم نجمي')?.count === 1 ? ok('وما لا نجوم له لا يدخل المتوسط — ولم يُخمَّن') : bad('بلا تقييم');
row('بقرارك')?.count === 1 ? ok('والمستبعَد بقرار المالك معلنٌ لا مخفيّ') : bad('المستبعَد');
coverageBlock(p2, {}).includes('لم يُحذف من التعليقات شيء') ? ok('والكتلة تصرّح أن شيئًا لم يُحذف') : bad('نصّ الكتلة');
topicCoverage(build([mk(5, 'القهوة ممتازة')])).unclassified === 0 ? ok('وما عرفه القاموس كلُّه: صفرٌ غير مصنَّف') : bad('تغطية كاملة');

console.log('٣) الهامش مع كل نسبة');
const pr = priorities(p1);
/±/.test(pr[0].why) ? ok(`النسبة لا تُذكر بلا هامشها: ${pr[0].why.slice(0, 52)}`) : bad('نسبة بلا هامش', pr[0].why);

console.log('٤) ما لا يُحسم لا يُسمّى تحسّنًا');
const small = build([mk(1, 'نص', 'قبل أسبوع'), mk(5, 'نص', 'قبل أسبوع'), mk(5, 'نص', 'قبل أسبوع'),
  mk(5, 'نص', 'قبل سنة'), mk(5, 'نص', 'قبل سنة'), mk(5, 'نص', 'قبل سنة')]);
const rs = recentVsOlder(small);
rs.verdict === 'غير كافٍ' ? ok('فرقُ نجمةٍ ونيّف على ثلاثة تعليقات: غير كافٍ') : bad('حكم متسرّع', `${rs.verdict} (${rs.diff})`);
rs.note.includes('هامش') ? ok('ويُقال سببُ الامتناع لا يُسكَت عنه') : bad('بلا سبب', rs.note);

const big = build([...Array(20)].map(() => mk(1, 'نص', 'قبل أسبوع'))
  .concat([...Array(20)].map(() => mk(5, 'نص', 'قبل سنة'))));
recentVsOlder(big).verdict === 'انحدار' ? ok('وانهيارٌ حقيقي على أربعين تعليقًا: انحدار') : bad('حكم متحفّظ', recentVsOlder(big).verdict);

console.log('٥) الاقتباس مرةً واحدة، والكيان بقرينة');
const HARSH = 'الانتظار طويل والخدمه سيئه والمكان وسخ والاسعار غاليه';
const pv = build([mk(1, HARSH, 'قبل أسبوع'), mk(5, 'القهوة ممتازة والموظفين ذوقهم عالي', 'قبل شهر')]);
const quotes = voice(pv).flatMap((g) => [...g.neg, ...g.pos]);
new Set(quotes.map((q) => q.id)).size === quotes.length
  ? ok(`لا تكرار: ${quotes.length} اقتباسًا في ${new Set(quotes.map((q) => q.id)).size} تعليقًا`) : bad('اقتباس مكرَّر', quotes.map((q) => q.id).join());
quotes.some((q) => q.text === HARSH) ? ok('والذمّ بنصّه لم يُهذَّب') : bad('تغيّر نصّ الذمّ');

const pe = build([mk(5, 'طلبت اللاتيه صباحا وكان ممتازا', 'قبل شهر'), mk(4, 'طلبت اللاتيه مساء وكان جيدا', 'قبل شهر')]);
const ents = extract(pe).products.map((x) => x.name);
!ents.includes('صباحا') && !ents.includes('مساء') ? ok('وظرفُ الزمان ليس صنفًا') : bad('ضجيج الكيانات', ents.join('، '));

console.log('٦) خطة العمل — الفعل ومن يفعله');
const jb = { assume: { ticket: 30, monthly: 900, loss: 25 } };
const act = actions(p1, jb);
act.rows.length ? ok(`${act.rows.length} خطوات مرتَّبة`) : bad('بلا خطوات');
act.rows[0].owner && act.rows[0].first && act.rows[0].metric
  ? ok(`ولكلٍّ مسؤولٌ وأول فعلٍ ومؤشّر: ${act.rows[0].owner}`) : bad('بيانات ناقصة', JSON.stringify(act.rows[0]));
act.rows[0].money > 0 && act.rows[0].yearly === act.rows[0].money * 12
  ? ok(`والكسب محسوبٌ من فرض المالك: ${act.rows[0].money} ريال/شهر`) : bad('الكسب', act.rows[0].money);
act.rows.every((r) => r.ids.length) ? ok('ولكل خطوةٍ شواهدُها بمعرّفاتها') : bad('خطوة بلا سند');

// بلا أرقام المالك لا يُخترَع مبلغ.
actions(p1, {}).rows.every((r) => r.money === null)
  ? ok('وبلا فرضك لا يُقدَّر كسبٌ — ولا يُخمَّن') : bad('مبلغ بلا فرض');

const ah = actionsBlock(p1, jb);
ah.includes('عُرفُ القطاع لا قياسُ محلّك')
  ? ok('والكلفة والمدة موسومتان بأنهما عُرفٌ لا قياس — فلا تُخلَطان بالمحسوب') : bad('بلا وسم');
!/كلفة الإصلاح [0-9,]+ ريال/.test(ah) ? ok('ولا مبلغَ كلفةٍ مخترَع بجوار مبلغٍ محسوب') : bad('كلفة مخترعة');

console.log('٧) ما يُطبَع ويُكتَب فيه');
checklistBlock(p1, jb).includes('class="box"') ? ok('قائمةُ متابعةٍ بمربّعاتٍ تُؤشَّر') : bad('بلا قائمة');
commitBlock(p1, jb).includes('class="write"') ? ok('وفراغٌ يكتب فيه المالك بيده') : bad('بلا فراغ');
checklistBlock(build([]), jb) === '' ? ok('وبلا أولويات لا قائمة' ) : bad('قائمة فارغة');

console.log('٨) مسوّدات الردود ملحقًا');
const dh = draftsBlock({ replyDrafts: 'R002: نعتذر عن الانتظار، وقد أضفنا موظفًا في الذروة.' });
dh.includes('مسوّدات تُراجَع لا ردودٌ تُنشَر') ? ok('تُلحَق موسومةً بأنها مسوّدة لا قرار') : bad('وسم المسوّدات');
dh.includes('R002') ? ok('ومسنودةً إلى معرّف الشكوى') : bad('بلا سند');
draftsBlock({}) === '' ? ok('وبلا مسوّدات لا ملحق') : bad('ملحق فارغ');

console.log('٩) أنت مقابل نفسك');
const weak = build([mk(1, 'الانتظار طويل'), mk(1, 'انتظرت كثير'), mk(1, 'مافي مواقف'), mk(2, 'الخدمه بطيئه'),
  mk(1, 'وسخ'), mk(5, 'ممتاز')], { average: 3.9, count: 280, distribution: null });
const strongNow = build([...Array(18)].map(() => mk(5, 'القهوة ممتازة والموظفين لطفاء'))
  .concat([...Array(2)].map(() => mk(1, 'الانتظار طويل'))), { average: 4.6, count: 340, distribution: null });
const sc = selfCompareBlock({ place: weak, createdAt: '2026-06-01T00:00:00Z', plan: [{ text: 'تقليل الانتظار', status: 'done' }] },
  { place: strongNow, createdAt: '2026-09-16T00:00:00Z' });
sc.includes('متوسط قوقل') ? ok('يُقارَن التقرير بسابقه') : bad('بلا مقارنة');
sc.includes('لا عيّنة فيه ولا هامش')
  ? ok('ومتوسط قوقل يُقرأ بلا هامش — فهو مُعلَنٌ على التقييمات كلها') : bad('هامش على رقم معلن');
sc.includes('ولا يُقارَن محلُّك بمحلٍّ آخر')
  ? ok('ويُصرَّح بالامتناع عن مقارنة المنافسين') : bad('بلا تصريح');
!/←/.test(sc) ? ok('ولا سهمَ بين رقمين يُقلَب في العربية فيُقرأ ضدّ معناه') : bad('سهم ملتبس');
selfCompareBlock(null, { place: strongNow }) === '' ? ok('وبلا تقريرٍ سابق لا مقارنة') : bad('مقارنة بلا سابق');

console.log('١٠) الغلاف والطباعة');
const html = buildReportHtml({ place: p1, markdown: '## تحليل\nنصّ.', job: {}, ctx: {} });
const coverHtml = html.slice(html.indexOf('<header class="cover">'), html.indexOf('</header>'));
!coverHtml.includes('<span>—</span>')
  ? ok('لا حقلَ فارغًا على الغلاف — والشرطةُ تُقرأ تقريرًا ناقصًا') : bad('غلاف بشرطات');
coverHtml.includes('التعليقات المحلَّلة') ? ok('ويُملأ بما هو معلومٌ دائمًا') : bad('غلاف خالٍ');
html.includes('class="running"') ? ok('وترويسةٌ جاريةٌ تتكرّر في كل صفحةٍ مطبوعة') : bad('بلا ترويسة');
!/text-align:justify/.test(html) ? ok('ولا ضبطَ يفتح فجواتٍ بيضاء في العربية') : bad('الضبط باقٍ');
/break-inside:avoid/.test(html) ? ok('والأقسام لا تنكسر بين صفحتين') : bad('بلا قواعد كسر');

console.log('١١) بطاقة النشر ورموز المواضيع');
const PRAISE = 'القهوة ممتازة والباريستا محترف جدا والمكان هادئ مريح للعمل والجلسات واسعة';
const pc = build([mk(5, PRAISE), mk(1, 'الانتظار طويل')]);
const card = cardBlock(pc);
card.includes(PRAISE) ? ok('الثناء منقولٌ بنصّه حرفًا بحرف') : bad('نصّ محرَّف');
/R\d{3}/.test(card) ? ok('ومعه معرّفه ليُراجَع في مصدره') : bad('بلا معرّف');
card.includes('بنصّها لا تُهذَّب') ? ok('ومشروطٌ ألّا تُهذَّب — وإلا صارت شهادةً منسوبةً إلى من لم يقلها') : bad('بلا شرط');
cardBlock(build([mk(1, 'سيء جدا والخدمة بطيئة ولا انصح به ابدا')])) === ''
  ? ok('وبلا ثناءٍ لا تُختلَق بطاقة') : bad('بطاقة من لا شيء');
topicIcon('wait') !== topicIcon('clean') && topicIcon('لا يوجد') === '•'
  ? ok('ولكل موضوعٍ رمزُه، والمجهولُ نقطةٌ محايدة') : bad('الرموز');

console.log('١٢) الحكم المنصوص والحكم المستنبَط');
const judge = (t, r, id) => topicSentimentDetail({ rating: r, text: t }, id);
// ألفاظٌ قطبيّتها تابعةٌ لموضوعها — والحقلان neg/pos كانا موصوفين ولم يملآ.
judge('الاسعار غالية جدا', 5, 'price').s === 'neg'
  ? ok('«الأسعار غالية» شكوى — وإن كانت النجوم خمسًا') : bad('الغلاء ثناءً');
judge('الانتظار طويل', 4, 'wait').s === 'neg' ? ok('و«الانتظار طويل» شكوى') : bad('الطول ثناءً');
judge('الجلسات ضيقة', 5, 'place').s === 'neg' ? ok('و«الجلسات ضيقة» شكوى') : bad('الضيق ثناءً');
judge('المواقف واسعة ومريحة', 5, 'parking').s === 'pos' ? ok('و«المواقف واسعة» ثناء') : bad('السعة شكوى');
judge('الطلب وصل بارد', 1, 'delivery').stated
  ? ok('والمفتاح المركّب يُعرَف موضعُه فيُقرأ جوارُه') : bad('المفتاح المركّب');

// والمصدر يُعلَن: أمن لفظ صاحبه أم من نجومه؟
judge('المواقف ضيقة', 5, 'parking').stated ? ok('ما نصّ عليه صاحبه: منصوص') : bad('وسم المنصوص');
!judge('القهوة ممتازة', 5, 'parking').stated
  ? ok('وما لم يُذكر فيه لفظٌ يحسمه: مستنبَطٌ من النجوم، ويُعلَن') : bad('وسم المستنبَط');

const pin = build([mk(5, 'القهوة ممتازة وفيه مواقف'), mk(5, 'المواقف واسعة ومريحة')]);
const park = (await import('../js/lexicon.js')).topicStats(pin).find((t) => t.id === 'parking');
park.posStated <= park.pos ? ok(`والمنصوص جزءٌ من الكل: ${park.posStated} من ${park.pos}`) : bad('عدٌّ مختلّ');

console.log('١٣) القوالب تضبط الطول، ولا تُسقط ما يُقيّد الأرقام');
DEFAULT_TEMPLATE === 'owner' ? ok('الافتراضي قالبُ صاحب المنشأة') : bad('الافتراضي', DEFAULT_TEMPLATE);
const keys = [...new Set(Object.values(TEMPLATES).flatMap((t) => Object.keys(t.show)))];
Object.values(TEMPLATES).every((t) => keys.every((k) => k in t.show))
  ? ok(`ولكل قالبٍ خريطةٌ كاملة (${keys.length} قسمًا) — وما لم يُذكر كان يرث «نعم» فيفيض`) : bad('خريطة ناقصة');
// أربعةٌ لا تسقط: الخلاصة، وحدود التغطية، ومقياس الثقة، والمنهجية.
Object.entries(TEMPLATES).every(([, t]) => t.show.brief && t.show.coverage && t.show.confidence)
  ? ok('ولا يسقط من قالبٍ: «في سطور» ولا حدودُ التغطية ولا مقياسُ الثقة') : bad('قالبٌ بلا حدود');

const sizeOf = (tpl) => (buildReportHtml({ place: p1, markdown: '## تحليل\nنصّ.', job: jb, ctx: {}, show: tpl.show })
  .match(/<h2/g) || []).length;
sizeOf(TEMPLATES.full) > sizeOf(TEMPLATES.owner) && sizeOf(TEMPLATES.owner) > sizeOf(TEMPLATES.brief)
  ? ok(`والطول يتدرّج: كامل ${sizeOf(TEMPLATES.full)} ← مالك ${sizeOf(TEMPLATES.owner)} ← صفحة ${sizeOf(TEMPLATES.brief)}`)
  : bad('لا تدرّج', [TEMPLATES.full, TEMPLATES.owner, TEMPLATES.brief].map(sizeOf).join('/'));

// والقالبُ المختار يغلب تفضيل القطاع، لا العكس.
const sectored = buildReportHtml({ place: p1, markdown: '## تحليل\nنصّ.', job: jb, ctx: {},
  show: TEMPLATES.brief.show, sector: { show: { photos: true, sources: true, timing: true } } });
!sectored.includes('class="sources"') && !/class="timing"/.test(sectored)
  ? ok('واختيارُك أولى من تفضيلِ قطاعك — وكان القطاع يُعيد ما حذفتَه') : bad('القطاع يغلب القالب');

console.log('١٤) سطرُ التسليم يتبع وسيلته');
const jm = { place: p1, plan: [] };
buildMessage(jm, 'short').includes('مرفق بصيغة PDF') ? ok('بلا رابط: مرفق') : bad('سطر المرفق');
const withLink = buildMessage(jm, 'short', 'https://x.test/r/abc');
withLink.includes('https://x.test/r/abc') && !withLink.includes('مرفق بصيغة PDF')
  ? ok('وبرابط: الرابط — ولا يُقال «مرفق» فيُبحَث عن مرفقٍ لا وجود له') : bad('سطر الرابط', withLink);

console.log('١٥) عاملُ الخدمة يعرف كل وحدة');
/* رابح يعمل بلا إنترنت، والوحدةُ التي لا يسردها عامل الخدمة لا تُخزَّن،
   فيسقط التطبيق عند أول انقطاع. وثلاثُ وحداتٍ أُضيفت اليوم سقطت من قائمته
   صامتةً — وهذا عيبٌ لا يظهر إلا عند من لا إنترنت عنده. */
const swSrc = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
const listed = [...swSrc.matchAll(/'\.\/js\/([\w.-]+\.js)'/g)].map((m) => m[1]);
const onDisk = readdirSync(new URL('../js', import.meta.url)).filter((f) => f.endsWith('.js'));
const gone = onDisk.filter((f) => !listed.includes(f));
gone.length === 0 ? ok(`كل وحدات js مسرودةٌ في عامل الخدمة (${onDisk.length})`) : bad('وحدات لا تُخزَّن', gone.join('، '));
const dupes = listed.filter((f, i) => listed.indexOf(f) !== i);
dupes.length === 0 ? ok('ولا تكرار في القائمة') : bad('تكرار', dupes.join('، '));

console.log('١٦) الترتيب لا يُوهِم فرقًا لا تحمله العيّنة');
// عيّنةٌ صغيرة: الأولى والثانية متساويتان تقريبًا وهامشُهما يبتلع الفرق.
const tied = build([mk(1, 'الانتظار طويل'), mk(1, 'انتظرت كثير'), mk(1, 'الموظف وقح'),
  mk(2, 'الخدمه سيئه والتعامل بارد'), mk(5, 'ممتاز')]);
priorityBlock(tied).includes('متقاربتان بقدر لا تفصله عيّنتك')
  ? ok('يُقال حين لا تفصل العيّنةُ بين أوّلٍ وثانٍ') : bad('ترتيبٌ موهِم');

// وعيّنةٌ تفصل: شكوى غالبة مقابل شكوى نادرة.
const clear = build([...Array(25)].map(() => mk(1, 'الانتظار طويل جدا'))
  .concat([mk(2, 'مافي مواقف')]).concat([...Array(14)].map(() => mk(5, 'ممتاز'))));
!priorityBlock(clear).includes('متقاربتان')
  ? ok('ولا يُقال حين تفصل — فلا يُبطَل الترتيب حيث يصحّ') : bad('تحفّظ في غير موضعه');

console.log('١٧) المجموع المالي يُعَدّ بالشاكين لا بالشكاوى');
/* التعليق الواحد يقع في موضوعين، وجمعُ صفوف الجدول يشحنه مرتين. قِيس
   فبلغ الضعف في شاكٍ واحد من عشرة — وهو رقمٌ يُبنى عليه قرار إنفاق. */
const dbl = build([mk(1, 'انتظرت طويلا والموظف وقح')]
  .concat([...Array(9)].map(() => mk(5, 'ممتاز'))));
const im = impact(dbl, { ticket: 30, monthly: 900, lossRate: 0.25 });
im.complainers === 1 ? ok('الشاكون يُعَدّون مرةً واحدة وإن تعدّدت شكاواهم') : bad('عدّ الشاكين', im.complainers);
im.totalRiyals === 675 ? ok(`والمجموع ${im.totalRiyals} لا ${im.sumOfRows} — وجمعُ الصفوف يضاعفه`) : bad('المجموع', im.totalRiyals);
im.overlap === 675 ? ok('وقدرُ التقاطع مُعلَنٌ لا مسكوتٌ عنه') : bad('التقاطع', im.overlap);
im.sumOfRows > im.totalRiyals && !impact(build([mk(1, 'الانتظار طويل')].concat([...Array(9)].map(() => mk(5, 'ممتاز')))), { ticket: 30, monthly: 900 }).overlap
  ? ok('وبلا تقاطعٍ لا يُذكر تقاطع') : bad('تقاطع موهوم');

console.log('١٨) لا حكمَ على ذكرٍ مفرد، ولا ترتيبَ لا تحمله العيّنة');
const one = build([mk(1, 'مافي مواقف')].concat([...Array(9)].map(() => mk(5, 'القهوة ممتازة'))));
const solo = topicStats(one).find((t) => t.id === 'parking');
solo.verdict === 'ذكرٌ مفرد' && solo.decided === false
  ? ok('«سلبي» عن تعليقٍ واحد صارت «ذكرٌ مفرد»') : bad('حكم على واحد', solo.verdict);
solo.sharePct === 10 ? ok(`ونصيبُ الموضوع من العيّنة مذكور: ${solo.sharePct}%`) : bad('بلا نصيب');

const smallPlan = actions(build([mk(1, 'الانتظار طويل'), mk(1, 'مافي مواقف'), mk(5, 'ممتاز'), mk(5, 'رائع')]), {});
smallPlan.rankable === false && smallPlan.rows.length
  ? ok('وبعيّنةٍ لا ترتّب: الخطة تبقى ويسقط ترتيبُها وحده') : bad('الخطة سقطت', JSON.stringify(smallPlan.rows.length));
smallPlan.rows.every((r) => r.rank === null) ? ok('فبطاقاتها بلا أرقام') : bad('أرقام بلا سند');
actionsBlock(build([mk(1, 'الانتظار طويل'), mk(1, 'مافي مواقف'), mk(5, 'ممتاز')]), {}).includes('وعيّنتك لا ترتّبها')
  ? ok('ويُقال ذلك صراحةً') : bad('ترتيب صامت');

const bigPlan = actions(build([...Array(6)].map(() => mk(1, 'الانتظار طويل جدا'))
  .concat([mk(1, 'مافي مواقف')]).concat([...Array(8)].map(() => mk(5, 'ممتاز')))), {});
bigPlan.rankable && bigPlan.rows[0].rank === 1
  ? ok('وبعيّنةٍ ترتّب: تُرقَّم') : bad('لم تُرقَّم');
bigPlan.singles.some((r) => r.id === 'parking')
  ? ok('والمفردةُ تُفرَد بلا ترقيم — ولا تُهمَل') : bad('أُهملت المفردة');

console.log('١٩) الترقيم والفهرس من مصدرٍ واحد');
const rep = buildReportHtml({ place: p1, markdown: '## تحليل\nنصّ.', job: jb, ctx: {} });
const nums = [...rep.matchAll(/<span class="secno">(\d+)<\/span>/g)].map((m) => Number(m[1]));
nums.length && nums.every((n, i) => n === i + 1)
  ? ok(`ترقيمٌ متصل بلا قفزات (1…${nums.length})`) : bad('ترقيم مخروم', nums.join());
const tocItems = (rep.match(/<li><span class="tn">/g) || []).length;
tocItems === nums.length
  ? ok(`والفهرس يفهرس ما في التقرير فعلًا (${tocItems} بندًا)`) : bad('فهرس مخالف', `${tocItems}/${nums.length}`);
tocItems > 1 ? ok('لا بندًا واحدًا يُسمّى «المحتويات»') : bad('فهرس ببند');

console.log('٢٠) المدد تُقرأ');
const dur = (await import('../js/stars.js')).starsBlock(
  (() => { const q = emptyPlace(); q.ratings = { average: 4.2, count: 310, distribution: null }; q.reviews = []; return q; })(),
  { perMonth: 900 });
!/0 شهرًا|0\.\d+ شهرًا/.test(dur) ? ok('لا «0 شهرًا» ولا «0.1 شهرًا»') : bad('كسورُ شهر', (dur.match(/[\d.]+ شهرًا/g) || []).join());
/يوم|أيام/.test(dur) ? ok('وما دون الشهرين يُقال بالأيام') : bad('بلا أيام');

console.log('٢١) ما ينجح، وما ينتظر ردًّا');
const mixed = build([mk(5, 'القهوة ممتازة والباريستا محترف'), mk(5, 'القهوة لذيذة جدا'),
  mk(4, 'القهوة طيبة والمكان هادئ'), mk(1, 'الانتظار طويل')]);
const keep = keepBlock(mixed);
keep.includes('لا تمسّه') ? ok('يُقال لصاحب المحل ما ينجح عنده') : bad('بلا قسم قوّة');
keep.includes('بألفاظهم') ? ok('ومبنيٌّ على الثناء المنصوص لا المستنبَط من النجوم') : bad('ثناء مستنبَط');
keepBlock(build([mk(1, 'سيء'), mk(1, 'رديء جدا والخدمة بطيئة')])) === ''
  ? ok('وبلا ثناءٍ متكرّر لا يُختلَق قسم') : bad('قوّة من لا شيء');

const noReply = build([mk(1, 'الانتظار طويل جدا ولا احد يعتذر'), mk(5, 'ممتاز')]);
const un = unansweredBlock(noReply);
un.includes('تنتظر ردًّا') && /R\d{3}/.test(un)
  ? ok('والشكاوى بلا ردّ تُفرَد بمعرّفاتها — أسرعُ فعلٍ وأرخصُه') : bad('بلا قسم ردود');
un.includes('يراه <b>كل من يقرأ صفحتك في قوقل</b>') ? ok('ويُقال لماذا يستحقّ العجلة') : bad('بلا سبب');
const allReplied = build([{ ...mk(1, 'الانتظار طويل'), ownerReply: 'نعتذر، وأضفنا موظفًا' }]);
unansweredBlock(allReplied) === '' ? ok('وإن رُدّ على الكلّ لا يُعرَض القسم') : bad('قسم بلا حاجة');

console.log('٢٢) المقارنة بالنفس لا تنتظر تقريرًا ثانيًا');
const dated = build([...Array(6)].map(() => mk(1, 'الانتظار طويل', 'قبل أسبوع'))
  .concat([...Array(6)].map(() => mk(5, 'ممتاز', 'قبل سنة'))));
const tw = trendWithinBlock(dated);
tw.includes('من داخل هذه العيّنة') ? ok('تُقارَن العيّنة بنفسها في أول تقرير') : bad('بلا مقارنة داخلية');
tw.includes('أضعفُ من مقارنة تقريرين') ? ok('ويُقال إنها أضعفُ من مقارنة تقريرين وسببُ ضعفها') : bad('بلا تحفّظ');

console.log('٢٣) أهمّ تحفّظ: العيّنة ليست عشوائية');
const cov = coverageBlock(p2, {});
cov.includes('ليست عشوائية') ? ok('يُقال صراحةً أن العيّنة ليست عشوائية') : bad('تحفّظ غائب');
cov.includes('<b>من كتب</b> لا <b>من زار</b>') ? ok('وأن النسب تصف من كتب لا من زار') : bad('بلا تفريق');
cov.includes('لا يُصلح هذا حسابٌ ولا هامش') ? ok('وأنه لا يُصلَح بحسابٍ ولا هامش') : bad('وهمُ الإصلاح');
cov.includes('تراه مزيَّفًا') ? ok('ويُدَلّ المالك كيف يُصحّح ما أخطأنا فيه') : bad('بلا تصحيح');

console.log('٢٤) تاريخ البيانات لا تاريخ الطبع');
const stamped = buildReportHtml({ place: p1, markdown: '## تحليل\nنصّ.', ctx: {},
  job: { place: p1, fetchedAt: '2026-01-15T00:00:00Z' } });
stamped.includes('جُمعت في') ? ok('يُذكر متى جُمعت التعليقات') : bad('بلا تاريخ بيانات');
/بيانات [^<·]*·/.test(stamped) ? ok('وفي ترويسة كل صفحةٍ مطبوعة') : bad('بلا ترويسة');

console.log('\n' + (fails.length ? `فشل ${fails.length}:\n` + fails.map((f) => ' - ' + f).join('\n') : '✅ نجحت كل الاختبارات'));
process.exit(fails.length ? 1 : 0);
