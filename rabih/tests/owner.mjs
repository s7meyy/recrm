// اختبار التقرير بعين صاحب المحل: الخلاصة، وحدود التغطية، والهوامش،
// وأن ما لا يُحسم لا يُسمّى تحسّنًا.
//
//   node tests/owner.mjs

import { brief, briefBlock } from '../js/brief.js';
import { coverage, coverageBlock } from '../js/coverage.js';
import { actions, actionsBlock, checklistBlock, commitBlock, draftsBlock, keepBlock, unansweredBlock, nextBlock } from '../js/action.js';
import { impact } from '../js/impact.js';
import { topicStats } from '../js/lexicon.js';
import { selfCompareBlock, trendWithinBlock } from '../js/compare.js';
import { buildReportHtml, buildGroupReportHtml } from '../js/report.js';
import { TEMPLATES, DEFAULT_TEMPLATE } from '../js/templates.js';
import { build as buildMessage } from '../js/messages.js';
import { topicCoverage, topicSentimentDetail } from '../js/lexicon.js';
import { priorities, priorityBlock } from '../js/priority.js';
import { recentVsOlder } from '../js/recency.js';
import { voice, cardBlock, voiceBlock } from '../js/voice.js';
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
  mk(1, 'الخدمه بطيئه والانتظار لا يطاق', 'قبل شهر'),
  mk(2, 'استنيت طويلا على طلب بسيط', 'قبل شهر'),
  mk(5, 'القهوة ممتازة والمكان هادئ', 'قبل شهر'),
  mk(4, 'المكان جميل والجلسات مريحة', 'قبل شهرين'),
  mk(5, 'الحلى طازج والموظفين لطفاء', 'قبل شهرين'),
  mk(4, 'أسعار معقولة وقهوة طيبة', 'قبل 3 أشهر'),
]);
const b1 = brief(p1, { assume: { ticket: 30, monthly: 900, loss: 25 } });
b1 ? ok('اللوحة تُبنى') : bad('لا لوحة');
b1.worst?.id === 'wait' ? ok(`أكبر شكوى: ${b1.worst.name}`) : bad('أكبر شكوى', b1.worst?.id);
b1.ci && b1.ci.margin > 0 ? ok(`ومعها هامشها: ±${b1.ci.margin}`) : bad('بلا هامش');
b1.solid && b1.action.includes('الانتظار')
  ? ok('وشكوى يحملها العدد: فعلٌ أول مشتقٌّ منها') : bad('الفعل الأول', b1.action);
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
/* المالُ لا يُدرَج إلا بإذنٍ صريح (٤٤). وهذه الفِخاخُ تقيس صحّةَ الرقم متى
   ظهر، لا شرطَ ظهوره — فتمنحه إذنَه صراحةً كما يفعل المالك بيده. */
const jb = { assume: { ticket: 30, monthly: 900, loss: 25, show: true } };
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
const tiedHtml = priorityBlock(tied);
/* عيّنةٌ كهذه لا تُرتَّب أصلًا: كلُّ موضوعٍ فيها ذكرٌ مفرد أو ذكران. فالامتناع
   عن الترتيب أصدقُ من ملاحظةِ تقاربٍ بين رقمين لا يصحّ صفُّهما ابتداءً. */
tiedHtml.includes('متقاربتان بقدر لا تفصله عيّنتك') || tiedHtml.includes('لا يُرتَّب شيءٌ هنا')
  ? ok('يُقال حين لا تفصل العيّنةُ بين أوّلٍ وثانٍ') : bad('ترتيبٌ موهِم');
!/<td>1<\/td>/.test(tiedHtml)
  ? ok('ولا يُعطى رقمُ أولويةٍ لما لا ترتّبه العيّنة') : bad('رقمٌ على ذكرٍ مفرد');
tiedHtml.includes('لا يُرتَّب')
  ? ok('ويُوسَم الذكرُ المفرد في الجدول نفسه، لا في حاشيةٍ تُقرأ أو لا تُقرأ') : bad('بلا وسم');

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

console.log('٢٥) الاستيراد الكسول لا يسقط من النسخة الخاصة');
/* `import('./card.js')` كان يفوت رسمَ التبعيات فتقع وحدته خارج الترتيب:
   لا تُخزَّن ولا يُستبدَل مُعرِّفها، فتنكسر النسخة الخاصة عند أول استدعاء. */
const toolSrc = readFileSync(new URL('../tools/build-private.mjs', import.meta.url), 'utf8');
/import\\s\*\\\(/.test(toolSrc) || toolSrc.includes('import\\s*\\(')
  ? ok('باني النسخة الخاصة يعرف الاستيراد الكسول') : bad('استيراد كسول مجهول');
const appSrc = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const lazy = [...appSrc.matchAll(/import\(['"]\.\/([\w.-]+)['"]\)/g)].map((m) => m[1]);
const swList = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
lazy.every((f) => swList.includes(`./js/${f}`))
  ? ok(`وكلُّ ما يُستورَد كسولًا مخزَّنٌ للعمل بلا إنترنت (${lazy.length})`) : bad('وحدة كسولة لا تُخزَّن', lazy.join('، '));

console.log('٢٦) لا رقمَ يُخصَّص ثم يُخفى');
/* العنوان الموسوم no-count كان يأخذ رقمَه ثم يُخفيه التنسيق، فيرى القارئ
   5 ثم 7 ثم 9، ويذكر الفهرسُ أرقامًا لا يجد لها أثرًا في المتن. */
const rep2 = buildReportHtml({ place: p1, markdown: '## تحليل\nنصّ.', job: jb, ctx: {} });
const body2 = rep2.slice(rep2.indexOf('<main'));
const hidden = [...body2.matchAll(/<h2([^>]*)>(?:<span class="secno">(\d+)<\/span>)?/g)]
  .filter((m) => m[2] && /no-count/.test(m[1]));
hidden.length === 0 ? ok('لا عنوانَ يأخذ رقمًا ثم يُخفيه') : bad('أرقام مخفيّة', hidden.length);
const shown = [...body2.matchAll(/<span class="secno">(\d+)<\/span>/g)].map((m) => Number(m[1]));
shown.every((n, i) => n === i + 1) ? ok(`وأرقامٌ متصلة (1…${shown.length})`) : bad('قفزات', shown.join());
const tocNums = [...body2.matchAll(/<li><span class="tn">(\d+)<\/span>/g)].map((m) => Number(m[1]));
JSON.stringify(tocNums) === JSON.stringify(shown)
  ? ok('والفهرس لا يذكر رقمًا لا يجده القارئ') : bad('فهرس مخالف', `${tocNums.length}/${shown.length}`);

console.log('٢٧) لا ترتيبَ يناقض تحفّظَه');
!rep2.includes('class="priority"')
  ? ok('جدول الأولويات مطفأٌ افتراضًا — وكان يرقّم سبعًا بينما تقول الخطة إنها لا تُرتَّب') : bad('تناقض باقٍ');

console.log('٢٨) بطاقاتُ الكسب لا تُجمَع');
// التنبيه لا يلزم إلا إذا كانت البطاقات أكثر من واحدة — فالواحدة لا تُجمَع.
const twoIssues = build([mk(1, 'الانتظار طويل والموظف وقح'), mk(1, 'انتظرت كثير والتعامل سيء'),
  mk(2, 'الخدمه بطيئه والموظفين ما يرحبون'), mk(1, 'استنيت طويلا والموظف تجاهلني'),
  mk(5, 'القهوة ممتازة'), mk(4, 'المكان جميل')]);
const ah2 = actionsBlock(twoIssues, jb);
const a2 = actions(twoIssues, jb);
a2.rows.length > 1 && ah2.includes('ولا تُجمَع أرقام')
  ? ok('يُقال إن أرقام البطاقات تتقاطع') : bad('دعوةٌ إلى جمعٍ خاطئ', `${a2.rows.length} بطاقة`);
a2.sumOfCards >= a2.totalRiyals
  ? ok(`ويُذكَر الصوابُ معها: ${a2.totalRiyals} لا ${a2.sumOfCards}`) : bad('حساب مقلوب');

console.log('٢٩) الرسمُ لا يكذب بمقياسه');
const flat = build([...Array(4)].map(() => mk(4, 'جيد', 'قبل شهر'))
  .concat([...Array(4)].map(() => mk(4, 'جيد جدا', 'قبل 3 أشهر')))
  .concat([...Array(4)].map(() => mk(4, 'ممتاز', 'قبل 5 أشهر'))));
const bf = briefBlock(flat, jb);
!bf.includes('<div class="spark">') || /spark-scale/.test(bf)
  ? ok('الخطُّ يحمل مداه مكتوبًا، فلا تُقرأ الهزّةُ انهيارًا') : bad('رسمٌ بلا مقياس');
bf.includes('الاتجاه لم يُحسَم') || bf.includes('انحدار') || bf.includes('تحسّن') || bf.includes('ثابت')
  ? ok('والشارة تُسمّى بما هي — لا «لا يُقاس» بجوار خطٍّ يرسم خمسة أشهر') : bad('تناقض الشارة');

console.log('٣٠) حارسُ معدّل التقييمات');
const q = emptyPlace(); q.ratings = { average: 4.2, count: 310, distribution: null }; q.reviews = [];
const st = await import('../js/stars.js');
st.starsBlock(q, { perMonth: 900 }).includes('راجع «معدّل')
  ? ok('رقمٌ محال في معدّل التقييمات يُنبَّه إليه — وكان يُنتج «تبلغ 4.25 في يوم واحد»') : bad('بلا حارس');
!st.starsBlock(q, { perMonth: 8 }).includes('راجع «معدّل')
  ? ok('ومعدّلٌ معقول يمضي بلا إزعاج') : bad('تنبيه في غير موضعه');

console.log('٣١) الصياغة تتبع العدد');
const un1 = unansweredBlock(build([mk(1, 'الانتظار طويل ولا احد يعتذر')]));
un1.includes('ولا ردّ عليها') && !un1.includes('كلُّها')
  ? ok('الواحدة: «ولا ردّ عليها» لا «كلُّها»') : bad('صياغة المفرد');
unansweredBlock(build([mk(1, 'الانتظار طويل'), mk(1, 'الخدمه بطيئه')])).includes('شكويان')
  ? ok('والاثنتان: «شكويان»') : bad('صياغة المثنّى');
unansweredBlock(build([...Array(4)].map(() => mk(1, 'الانتظار طويل')))).includes('4 شكاوى')
  ? ok('وجمعُ القلّة: «4 شكاوى»') : bad('صياغة الجمع');

console.log('٣٢) الشكوى المُجاب عنها تُميَّز، ووقتُها يدخل بطاقتها');
const answered = build([
  { ...mk(1, 'الانتظار طويل جدا في المساء'), ownerReply: 'نعتذر، وقد أضفنا موظفًا' },
  mk(1, 'الخدمه بطيئه مساء'), mk(1, 'انتظرت كثير في المساء'), mk(5, 'ممتاز')]);
voiceBlock(answered).includes('رُدَّ عليها')
  ? ok('شكوى رُدَّ عليها تُوسَم — ولا تُقرأ كشكوى الأمس') : bad('بلا تمييز');
voiceBlock(answered).includes('لا أن العطب زال')
  ? ok('والوسمُ وصفٌ لا حكم: الردُّ ليس إصلاحًا') : bad('وسمٌ يُوهِم الإصلاح');
const withWhen = actions(answered, {}).rows.find((r) => r.when);
withWhen ? ok(`ووقتُ الشكوى في بطاقتها: ${withWhen.when.label}`) : bad('الوقت منفصل');

console.log('٣٣) ما بعد التقرير');
const nb = nextBlock(p2, {});
nb.includes('30 يومًا') ? ok('يُقال متى المراجعة القادمة') : bad('بلا موعد');
nb.includes('ما يجعل التقرير القادم أدقّ') ? ok('وما يلزم لإعدادها') : bad('بلا تهيئة');
nb.includes('لا تجيب عنها تعليقاتك') ? ok('وأسئلةٌ لا تجيب عنها التعليقات — حدودُ الأداة لا اعتذارُها') : bad('بلا حدود');

console.log('٣٤) وضعُ «أنت بخير» — ولا يُختلَق عطبٌ لمن لا عطب عنده');
/* قِيس على مقهًى بـ4.8 و520 تقييمًا: كان يجعل شكوى مواقفَ واحدةً، من رجلٍ
   أعطاه أربع نجوم، «أكبرَ شكوى» و«ابدأ بهذا» ويُسند إليها 750 ريالًا.
   وصاحبُه يعرف أن المواقف ليست مشكلته، فيحكم أن التحليل سطحيّ ولا يعود. */
const thriving = build([...Array(14)].map((_, i) => mk(5, ['القهوة ممتازة والموظفين ذوقهم عالي',
  'المكان نظيف وهادئ', 'أفضل مكان في الحي والحلى طازج', 'الجلسات مريحة والخدمة سريعة'][i % 4]))
  .concat([mk(4, 'جيد جدا لكن المواقف قليلة'), mk(3, 'عادي')]),
  { average: 4.8, count: 520, distribution: null });
const bt = brief(thriving, { assume: { ticket: 40, monthly: 1200, loss: 25 } });
bt.solid === false ? ok('شكوى واحدة لا تُسمّى «أكبر شكوى»') : bad('ضجيجٌ صار عنوانًا');
bt.money === null && bt.totalRiyals === null
  ? ok('ولا يُسعَّر عطبٌ لم يثبت — وكان يقول «750 ريالًا» لمحلٍّ بـ4.8') : bad('تسعيرُ ضجيج', bt.totalRiyals);
bt.action.includes('لا شكوى بارزة') && bt.action.includes('احفظ ما ينجح')
  ? ok('والفعلُ الأول يتحوّل إلى حفظ ما ينجح وزيادة من يكتب') : bad('فعلٌ مختلَق', bt.action);
const bth = briefBlock(thriving, { assume: { ticket: 40, monthly: 1200, loss: 25 } });
bth.includes('أكثر ما وقع') && !bth.includes('<b>أكبر شكوى</b>')
  ? ok('والبطاقة تُسمّى «أكثر ما وقع» لا «أكبر شكوى»') : bad('عنوانٌ مبالغ');
bth.includes('ليس هذا مجاملة')
  ? ok('ويُقال إن هذا ليس مجاملةً بل ما يحمله العدد') : bad('بلا تصريح');

// وشكوى يحملها العدد تبقى شكوى.
brief(build([...Array(6)].map(() => mk(1, 'الانتظار طويل جدا'))
  .concat([...Array(6)].map(() => mk(5, 'ممتاز'))), { average: 3.6, count: 200, distribution: null }),
  { assume: { ticket: 40, monthly: 1200, loss: 25 } }).solid
  ? ok('وستُّ شكاوى من اثنتي عشرة: تُسمّى وتُسعَّر') : bad('تحفّظ في غير موضعه');

console.log('٣٥) العيّنة الصغيرة تُعلَن لا تُسلَّم فارغة');
const three = build([mk(5, 'ممتاز'), mk(3, 'عادي'), mk(4, 'جيد')], { average: 4.0, count: 6, distribution: null });
const b3 = brief(three, {});
b3.tiny ? ok('ثلاثة تعليقات: العيّنة موسومةٌ بالصِّغَر') : bad('بلا وسم');
b3.action.includes('اجمع تعليقاتٍ أكثر')
  ? ok('والفعلُ الأول: اجمع أكثر قبل أي قرار') : bad('فعلٌ بلا سند', b3.action);
briefBlock(three, {}).includes('أصغرُ من أن يُبنى عليها حكم')
  ? ok('ويُقال في اللوحة صراحةً — وكانت تُسلَّم بطاقاتٍ فارغة بلا كلمة') : bad('لوحة صامتة');

console.log('٣٦) ما يكسبه لا ما يخسره وحده');
briefBlock(p1, jb).includes('وما تكسبه إن عالجت')
  ? ok('يُقال ما يكسبه إن عالج، لا ما يخسره فقط') : bad('بلا مكسب');
briefBlock(p1, jb).includes('ما تخسره اليوم')
  ? ok('والخسارةُ إجماليٌّ على الشاكين لا كلفةَ شكوى واحدة') : bad('مبلغٌ جزئيّ');

console.log('٣٧) الحجّةُ في الصدر لا في الثلث');
briefBlock(p1, jb).includes('تستطيع مراجعته بنفسك')
  ? ok('«كلُّ رقمٍ تستطيع مراجعته» في الخلاصة — وكان أول معرّف يظهر عند 30%') : bad('حجّةٌ مدفونة');

console.log('٣٨) العيّنة تقول إنها عيّنة، وتُسمّي ما تمنع');
/* الراية `teaser` كانت معرَّفةً في القوالب ولا يستعملها أحد — بحثتُ فلم أجد
   لها استعمالًا واحدًا. فتخرج العيّنة كالتقرير المدفوع سواءً بسواء. */
const tz = buildReportHtml({ place: p1, markdown: '## تحليل\nنصّ.', job: jb, ctx: {}, show: TEMPLATES.teaser.show });
tz.includes('هذه عيّنة') ? ok('العيّنة موسومةٌ بأنها عيّنة') : bad('عيّنة بلا وسم');
tz.includes('ولم يُنقَص منه شيء ولم يُهوَّن')
  ? ok('ويُصرَّح بأن ما فيها صحيحٌ كامل — لا تُجوَّع لتُغري') : bad('بلا تصريح');
tz.includes('خطة العمل') && tz.includes('مسوّدات الردود')
  ? ok('وتُسمّي بدقّةٍ ما لا يراه فيها') : bad('نقصٌ مكتوم');
!tz.includes('ما بعد هذا التقرير')
  ? ok('ولا تُخاطبه بـ«المراجعة القادمة» وهو لم يطلب بعد') : bad('خطابُ عميلٍ لم يشترِ');
const tf = buildReportHtml({ place: p1, markdown: '## تحليل\nنصّ.', job: jb, ctx: {}, show: TEMPLATES.owner.show });
!tf.includes('هذه عيّنة') ? ok('والتقرير الكامل ليس عيّنة') : bad('وسمٌ في غير موضعه');

console.log('٣٩) رسالةُ التسليم تحمل رقمًا وفعلًا وحجّة');
const pm = build([...Array(6)].map(() => mk(1, 'الانتظار طويل جدا'))
  .concat([...Array(6)].map(() => mk(5, 'ممتاز'))), { average: 3.9, count: 310, distribution: null });
const msg = buildMessage({ place: pm, plan: [], assume: { ticket: 30, monthly: 900, loss: 25, show: true } }, 'whatsapp');
/تكلّفك الشكاوى: [\d,]+ ريال/.test(msg) ? ok('فيها المبلغ — وكانت تصف بلا رقم') : bad('بلا مبلغ');
msg.includes('ابدأ بهذا') ? ok('وفعلٌ واحد يبدأ به') : bad('بلا فعل');
msg.includes('معرّفُ التعليق') ? ok('وما يميّزها: كلُّ رقمٍ مسنودٌ يُراجَع') : bad('بلا حجّة');

console.log('٤٠) فاصلٌ بين ما يُعمَل به وما يُرجَع إليه');
const rep3 = buildReportHtml({ place: p1, markdown: '## تحليل\nنصّ.', job: jb, ctx: {} });
rep3.includes('ما سبق هو ما تعمل به')
  ? ok('يُفصَل ما يُعمَل به عن تفصيله') : bad('بلا فاصل');
rep3.includes('وكيف تعرف أنّ هذا نفع؟') && rep3.includes('اقترانٌ لا برهان')
  ? ok('ويُقال كيف يُقاس النفع — بلا ادّعاء برهان') : bad('بلا التزام مقيس');

console.log('٤١) تمييزُ عدد الشكاوى');
const w = (n) => priorities(build([...Array(n)].map(() => mk(1, 'الانتظار طويل جدا'))
  .concat([...Array(14)].map(() => mk(5, 'ممتاز')))))[0].why;
w(1).startsWith('شكوى واحدة') && w(2).startsWith('شكويان') && w(6).startsWith('6 شكاوى') && w(12).startsWith('12 شكوى')
  ? ok('«شكوى واحدة» · «شكويان» · «6 شكاوى» · «12 شكوى»') : bad('تمييز مختلّ', [w(1), w(2), w(6), w(12)].map((x) => x.slice(0, 12)).join(' | '));

console.log('٤٢) تقرير المجموعة كالتقرير الفردي');
/* كان على الحال التي أُصلحت في الفردي: فهرسٌ يُبنى من عناوين النموذج وحدها
   فلا يذكر «ترتيب الفروع» وهو أول أقسامه، وأقسامٌ بلا ترقيم. */
const gh = buildGroupReportHtml({
  brand: 'مقهى الدرب',
  markdown: '## تحليل المجموعة\nنصّ.\n\n## الفروع المتعثّرة\nنصّ.',
  analysis: {
    totals: { branches: 3, reviews: 42 },
    ranking: [{ rank: 1, label: 'الملقا', district: 'الملقا', googleAverage: 4.5, googleCount: 120, negativeShare: 8, replyRate: 40, trend: 'ثابت' }],
    branches: [], gap: { diff: 0.4 },
    shared: [{ name: 'الانتظار', branches: [{ label: 'الملقا', neg: 5 }, { label: 'العليا', neg: 4 }], totalNeg: 9 }],
    unique: [{ name: 'المواقف', branches: [{ label: 'الملقا', neg: 4 }], totalNeg: 4 }],
  },
});
const gNums = [...gh.matchAll(/<span class="secno">(\d+)<\/span>/g)].map((m) => Number(m[1]));
gNums.length >= 4 && gNums.every((n, i) => n === i + 1)
  ? ok(`أقسامُ المجموعة مرقَّمةٌ متصلة (1…${gNums.length})`) : bad('ترقيم المجموعة', gNums.join());
const gToc = (gh.match(/<li><span class="tn">/g) || []).length;
gToc === gNums.length
  ? ok('وفهرسُها يفهرس أقسامها لا عناوين النموذج وحدها') : bad('فهرس المجموعة', `${gToc}/${gNums.length}`);
gh.includes('ترتيب الفروع') && /<span class="tn">1<\/span><a[^>]*>ترتيب الفروع/.test(gh.replace(/\s+/g, ' '))
  ? ok('و«ترتيب الفروع» أول بنوده — وكان غائبًا عن فهرس نفسه') : bad('أول قسمٍ غائب');

console.log('٤٣) ما قاله المالك عن نفسه لا يعود إليه شهادةً من عملائه');
/* الخانة تَعِد المالك بأن ملاحظاته «تُعامَل كبيانات موثوقة»، وهي تدخل النموذج
   بهذا الوصف. فإن لم يَبِنْ ذلك في التقرير اختلط قولُه عن نفسه بما استُخرج من
   تعليقات الناس — وهو أخطر من غلطٍ في رقم، لأنه يقلب الدعوى شهادة. */
const withNotes = buildReportHtml({
  place: { ...p1, notes: 'جدّدنا المواقف في رجب، ووظّفنا اثنين للمساء.' },
  markdown: '## تحليل\nنصّ.', job: {}, ctx: {},
});
withNotes.includes('ما أضفتَه أنت')
  ? ok('نصُّ المالك يُفرَد بقسمٍ باسمه') : bad('ملاحظات المالك مبتلعة');
withNotes.includes('جدّدنا المواقف في رجب')
  ? ok('ويُنقَل بحروفه لا مُعاد صياغته') : bad('نصّ المالك محرَّف');
withNotes.includes('قولُك عن منشأتك، لا استنتاجٌ من تعليقات عملائك')
  ? ok('ويُقال صراحةً إنه ليس من التعليقات ولم يُراجَع') : bad('بلا تمييز');
!buildReportHtml({ place: p1, markdown: '## تحليل\nنصّ.', job: {}, ctx: {} }).includes('ما أضفتَه أنت')
  ? ok('وبلا ملاحظاتٍ لا يظهر قسمٌ فارغ') : bad('قسمٌ بلا محتوى');

console.log('٤٤) المالُ لا يدخل التقرير إلا بإذنٍ صريح');
/* الأثرُ الماليّ مبنيٌّ على ثلاثة ظنونٍ للمالك يضرب بعضُها في بعض، ويُقرأ عند
   مَن يُسلَّم إليه التقرير قياسًا لا فرضًا. فالأصلُ ألّا يظهر. والحارسُ يمسك
   المنافذَ الأربعة: قسمُه، والخلاصة، وبطاقاتُ الفعل، ورسالةُ التسليم. */
const moneyJob = { assume: { ticket: 30, monthly: 900, loss: 25 } };
const mdOnly = '## تحليل\nنصّ.';
const offHtml = buildReportHtml({ place: p1, markdown: mdOnly, job: moneyJob, ctx: {} });
!/ريال/.test(offHtml)
  ? ok('مطفأً: لا ريالَ في التقرير كلِّه') : bad('مالٌ بلا إذن');
const offBrief = brief(p1, moneyJob);
offBrief.totalRiyals === null && offBrief.money === null
  ? ok('ولا في الخلاصة — فلا يُمنَع من قسمه ويُسرَّب في أول صفحة') : bad('مالٌ في الخلاصة', offBrief.totalRiyals);
actions(p1, moneyJob).hasMoney === false
  ? ok('ولا في بطاقات الفعل') : bad('مالٌ في البطاقات');
const onJob = { assume: { ticket: 30, monthly: 900, loss: 25, show: true } };
/ريال/.test(buildReportHtml({ place: p1, markdown: mdOnly, job: onJob, ctx: {} }))
  ? ok('ومشغَّلًا يظهر — فالخيارُ يفتح ولا يُعطّل') : bad('الخيار لا يفتح');
brief(p1, onJob).totalRiyals !== null
  ? ok('ويعود إلى الخلاصة معه') : bad('الخلاصة لا تتبع الخيار');

console.log('\n' + (fails.length ? `فشل ${fails.length}:\n` + fails.map((f) => ' - ' + f).join('\n') : '✅ نجحت كل الاختبارات'));
process.exit(fails.length ? 1 : 0);
