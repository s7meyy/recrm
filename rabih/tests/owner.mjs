// اختبار التقرير بعين صاحب المحل: الخلاصة، وحدود التغطية، والهوامش،
// وأن ما لا يُحسم لا يُسمّى تحسّنًا.
//
//   node tests/owner.mjs

import { brief, briefBlock } from '../js/brief.js';
import { coverage, coverageBlock } from '../js/coverage.js';
import { actions, actionsBlock, checklistBlock, commitBlock, draftsBlock } from '../js/action.js';
import { selfCompareBlock } from '../js/compare.js';
import { buildReportHtml } from '../js/report.js';
import { topicCoverage, topicSentimentDetail } from '../js/lexicon.js';
import { priorities } from '../js/priority.js';
import { recentVsOlder } from '../js/recency.js';
import { voice, cardBlock } from '../js/voice.js';
import { topicIcon } from '../js/lexicon.js';
import { extract } from '../js/entities.js';
import { emptyPlace, emptyReview, assignReviewIds } from '../js/schema.js';

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

console.log('\n' + (fails.length ? `فشل ${fails.length}:\n` + fails.map((f) => ' - ' + f).join('\n') : '✅ نجحت كل الاختبارات'));
process.exit(fails.length ? 1 : 0);
