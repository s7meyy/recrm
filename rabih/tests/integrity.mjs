// اختبار شرط الأداة: لا يُعدَّل تعليق ولا تقييم، ولو كان ذمًّا.
//
//   node tests/integrity.mjs
//
// وهذا الاختبار أوثق ما في المستودع: إن سقط فالأداة فقدت سبب وجودها.

import { parseReviews } from '../js/parse.js';
import { checkSource, exclusionNote } from '../js/integrity.js';
import { verify, checkQuotes } from '../js/verify.js';
import { emptyPlace, emptyReview, assignReviewIds, stats } from '../js/schema.js';
import { orderedForBatches, sliceForBatch, batchCount } from '../js/prompts.js';

const fails = [];
const ok = (t) => console.log('  ✓', t);
const bad = (t, e) => { fails.push(t + (e ? ' :: ' + e : '')); console.log('  ✗', t, e || ''); };

const place = (reviews) => {
  const p = emptyPlace();
  p.identity.name = 'مقهى الاختبار';
  p.ratings = { average: 4.1, count: 200, distribution: null };
  p.reviews = reviews;
  assignReviewIds(p);
  return p;
};

console.log('١) النصّ يمرّ كما كُتب — بلهجته وقسوته');
// ذمٌّ عاميّ بإملاءٍ غير قياسي: لا يُصحَّح ولا يُلطَّف ولا يُختصَر.
const HARSH = 'المكان زفت والخدمه سيئه للغايه ومارح ارجعله ابد، ضيعت وقتي وفلوسي';
const raw = `1 | سعود | قبل يومين\n${HARSH}\n---\n5 | نورة | قبل شهر\nالقهوة ممتازة والموظفين ذوقهم عالي`;
const { reviews } = parseReviews(raw);
reviews.length === 2 ? ok('التعليقان استُخرجا') : bad('العدد', reviews.length);
reviews[0].text === HARSH ? ok('نصّ الذمّ كما كُتب حرفًا بحرف') : bad('تغيّر نصّ الذمّ', JSON.stringify(reviews[0].text));
reviews[0].rating === 1 ? ok('والتقييم كما هو (نجمة واحدة)') : bad('التقييم', reviews[0].rating);
reviews.every((r) => r.source === 'paste') ? ok('ومصدر كلٍّ موسومٌ به') : bad('وسم المصدر', reviews.map((r) => r.source).join());

console.log('٢) فحص المطابقة بالمصدر');
const p1 = place(reviews);
const c1 = checkSource(p1, raw);
(c1.ok && c1.verbatim === 2) ? ok('الفحص يشهد بالمطابقة: ' + c1.summary.slice(0, 60)) : bad('الفحص', JSON.stringify(c1).slice(0, 120));

// تحريفٌ مُفتعَل: يجب أن يُكشَف لا أن يمرّ.
const tampered = place([{ ...reviews[0], text: 'المكان غير جيد والخدمة تحتاج تحسينًا' }, reviews[1]]);
const c2 = checkSource(tampered, raw);
(!c2.ok && c2.altered === 1) ? ok('التحريف يُكشَف ويُسمّى') : bad('كشف التحريف', JSON.stringify(c2).slice(0, 120));
c2.offenders[0]?.id === 'R001' ? ok('ويُحدَّد أي تعليق') : bad('تحديد المُحرَّف', JSON.stringify(c2.offenders));

// ما جاء من جلبٍ آلي لا يُدَّعى فحصه
const fetched = place([{ ...emptyReview(), id: 'R001', rating: 4, text: 'جيد', source: 'provider' }]);
const c3 = checkSource(fetched, '');
c3.unverifiable === 1 && c3.checked === 0
  ? ok('ما لا مصدر نصّي له: يُصرَّح بعدم فحصه ولا يُدَّعى') : bad('غير القابل للفحص', JSON.stringify(c3).slice(0, 100));

console.log('٣) النموذج لا يُلطّف ذمًّا');
const softened = `الخلاصة: ورد في (R001): «المكان غير جيد والخدمة تحتاج إلى تحسين بسيط».`;
const honest = `الخلاصة: ورد في (R001): «${HARSH}».`;
checkQuotes(softened, p1).length === 1 ? ok('الاقتباس المُلطَّف يُكشَف') : bad('كشف التلطيف', JSON.stringify(checkQuotes(softened, p1)));
checkQuotes(honest, p1).length === 0 ? ok('والحرفيّ يمرّ') : bad('رفض الحرفي', JSON.stringify(checkQuotes(honest, p1)));
verify(softened, p1).level === 'err' ? ok('والمدقّق يحكم عليه بالخطأ لا بالتنبيه') : bad('درجة الحكم', verify(softened, p1).level);
/غُيِّر نصُّه/.test(verify(softened, p1).summary) ? ok('ويُسمّى العيب في الخلاصة') : bad('الخلاصة', verify(softened, p1).summary);

console.log('٤) الأرقام لا تُجمَّل');
const s = stats(p1);
s.sampleAverage === 3 ? ok('متوسط العيّنة محسوب لا مُقدَّر: ' + s.sampleAverage) : bad('المتوسط', s.sampleAverage);
s.negative === 1 ? ok('السلبي معدود كما هو') : bad('عدد السلبي', s.negative);
const overstated = 'متوسط التقييم 4.9 من 5 وهو ممتاز (R001).';
verify(overstated, p1).numberIssues.length >= 1 ? ok('رقمٌ يخالف المحسوب يُردّ') : bad('رد الرقم', JSON.stringify(verify(overstated, p1).numberIssues));

console.log('٥) الاستبعاد إقرارٌ لا محو');
exclusionNote([]) === '' ? ok('بلا استبعاد: لا سطر زائد') : bad('إقرار بلا سبب');
const note = exclusionNote([{ id: 'R003' }, { id: 'R007' }]);
(/2 تعليقًا/.test(note) && /R003/.test(note) && /لم يُحذف/.test(note))
  ? ok('وبالاستبعاد: عددٌ ومعرّفات وإقرارٌ بأن شيئًا لم يُحذف') : bad('نصّ الإقرار', note);

console.log('٦) التقسيم على دفعات لا يُسقط تعليقًا ولا يكرّره');
const many = place(Array.from({ length: 150 }, (_, i) => ({
  ...emptyReview(),
  rating: (i % 5) + 1,
  text: ['الانتظار طويل', 'القهوة لذيذة', 'مافي مواقف', 'الخدمة سيئة', 'المكان نظيف'][i % 5] + ' رقم ' + i,
})));
const parts = batchCount(150);
const all = [];
for (let i = 0; i < parts; i += 1) all.push(...sliceForBatch(many, i).reviews.map((r) => r.id));
all.length === 150 ? ok(`الدفعات الثلاث تحمل ١٥٠ تعليقًا`) : bad('مجموع الدفعات', all.length);
new Set(all).size === 150 ? ok('بلا تكرار') : bad('تكرار', 150 - new Set(all).size);
many.reviews.every((r) => all.includes(r.id)) ? ok('ولم يسقط أحد') : bad('سقوط تعليق');
orderedForBatches(many).length === 150 ? ok('والترتيب بالموضوع يحفظ العدد') : bad('ترتيب الموضوع', orderedForBatches(many).length);

// حارس: لو اختلّ الترتيب لسببٍ ما رُدَّ الأصل ولم يُخاطَر
const broken = { reviews: many.reviews.slice(0, 3) };
orderedForBatches(broken).length === 3 ? ok('والحارس يردّ الأصل عند أي اختلال') : bad('الحارس');

console.log('\n' + (fails.length ? `فشل ${fails.length}:\n` + fails.map((f) => ' - ' + f).join('\n') : '✅ نجحت كل الاختبارات'));
process.exit(fails.length ? 1 : 0);
