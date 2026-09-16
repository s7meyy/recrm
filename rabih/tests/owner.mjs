// اختبار التقرير بعين صاحب المحل: الخلاصة، وحدود التغطية، والهوامش،
// وأن ما لا يُحسم لا يُسمّى تحسّنًا.
//
//   node tests/owner.mjs

import { brief, briefBlock } from '../js/brief.js';
import { coverage, coverageBlock } from '../js/coverage.js';
import { topicCoverage } from '../js/lexicon.js';
import { priorities } from '../js/priority.js';
import { recentVsOlder } from '../js/recency.js';
import { voice } from '../js/voice.js';
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

console.log('\n' + (fails.length ? `فشل ${fails.length}:\n` + fails.map((f) => ' - ' + f).join('\n') : '✅ نجحت كل الاختبارات'));
process.exit(fails.length ? 1 : 0);
