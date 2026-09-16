// اختبار ما يصحّح دقّة ما تقوله الأداة: الهامش، والانحياز، والمقام،
// والخصوصية، واللغة، ومعيار الرسائل.
//
//   node tests/precision.mjs

import { wilson, pretty, significant } from '../js/interval.js';
import { sampleBias } from '../js/bias.js';
import { pseudonymize, shield, isOn } from '../js/privacy.js';
import { bilingual, bi } from '../js/i18n.js';
import { grade, fixture } from '../js/eval.js';
import { reviewsCsv } from '../js/export.js';
import { emptyPlace, emptyReview, assignReviewIds, stats } from '../js/schema.js';

const fails = [];
const ok = (t) => console.log('  ✓', t);
const bad = (t, e) => { fails.push(t + (e ? ' :: ' + e : '')); console.log('  ✗', t, e || ''); };

console.log('١) هامش الخطأ');
const a = wilson(9, 40, 310);
(a.low < 22.5 && a.high > 22.5) ? ok(`٩ من ٤٠ → ${pretty(a)} (بين ${a.low}٪ و${a.high}٪)`) : bad('الفترة', JSON.stringify(a));
a.wide ? ok('وهامشٌ بهذا الاتّساع يُعلَن مؤشّرًا لا قياسًا') : bad('وسم الاتّساع');
wilson(80, 310, 310).margin === 0 ? ok('وعيّنةٌ تساوي المجتمع: هامشها صفر (تصحيح المجتمع المحدود)') : bad('fpc', wilson(80, 310, 310).margin);
wilson(0, 30).low === 0 ? ok('وصفرٌ من ثلاثين لا يُخرِج فترةً سالبة') : bad('الحدّ الأدنى');
wilson(30, 30).high === 100 ? ok('والكلُّ لا يتجاوز مئة') : bad('الحدّ الأعلى');
wilson(5, 0) === null && wilson(10, 5) === null ? ok('ومدخلٌ فاسد يردّ null لا رقمًا مخترَعًا') : bad('المدخل الفاسد');

// الخطر الحقيقي: «تحسّن» هو ضجيج
const s1 = significant(wilson(11, 40), wilson(7, 40));
!s1.decided && /ضمن هامش الخطأ/.test(s1.reason) ? ok('و٢٨٪ مقابل ١٨٪ في عيّنة ٤٠: لا يُعتدّ به') : bad('المقارنة الصغيرة', JSON.stringify(s1));
significant(wilson(110, 400), wilson(70, 400)).decided ? ok('وفي عيّنة ٤٠٠ يُعتدّ به') : bad('المقارنة الكبيرة');

console.log('٢) انحياز العيّنة');
const mk = (r) => ({ ...emptyReview(), rating: r, text: 'نصّ التعليق هنا', date: 'قبل شهر' });
const p = emptyPlace();
p.ratings = { average: 4.3, count: 310, withText: 87, distribution: { 5: 200, 4: 60, 3: 20, 2: 15, 1: 15 } };
p.reviews = [mk(1), mk(1), mk(2), mk(1), mk(5), mk(5), mk(4), mk(2)];
assignReviewIds(p);
const b = sampleBias(p);
b.verdict === 'منحازة' ? ok(`كُشف الانحياز: ${b.negGap} نقطة في السلبي`) : bad('الحكم', b.verdict);
b.sampleAvg < b.declaredAvg ? ok(`ومتوسط العيّنة ${b.sampleAvg} دون المعلَن ${b.declaredAvg}`) : bad('المتوسطان');
/ليست ممثِّلة/.test(b.note) ? ok('ويُقال صراحةً إن النسب نسب عيّنتك لا منشأتك') : bad('النصّ');

// عيّنةٌ تشبه المعلَن: ٦٥٪ خمسة، ٢٠٪ أربعة، ١٠٪ سلبي — كنسب قوقل تقريبًا.
const fair = { ...p, reviews: [mk(5), mk(5), mk(5), mk(5), mk(5), mk(5), mk(5), mk(4), mk(4), mk(3), mk(3), mk(2), mk(1), mk(5), mk(5), mk(5), mk(4), mk(4), mk(5), mk(5)] };
sampleBias(fair).verdict === 'ممثِّلة' ? ok('وعيّنةٌ مشابهة للمعلَن: ممثِّلة') : bad('الممثِّلة', sampleBias(fair).verdict);
sampleBias({ ...p, ratings: { ...p.ratings, distribution: {} } }) === null
  ? ok('وبلا توزيعٍ معلن: لا يُدَّعى تمثيلٌ ولا انحياز') : bad('بلا توزيع');

console.log('٣) مقام التغطية');
const st = stats(p);
st.declaredWithText === 87 ? ok('عدد المنصوصة المُعلَن محفوظ') : bad('المنصوصة', st.declaredWithText);
st.textCoverage > st.coverage ? ok(`والتغطية ${st.textCoverage}٪ من المنصوصة لا ${st.coverage}٪ من الإجمالي`) : bad('المقام', JSON.stringify({ t: st.textCoverage, c: st.coverage }));
stats({ ...p, ratings: { ...p.ratings, withText: null } }).textCoverage === null
  ? ok('وبلا عددٍ للمنصوصة لا يُخترَع مقام') : bad('بلا منصوصة');

console.log('٤) الخصوصية');
const named = [
  { ...emptyReview(), id: 'R001', author: 'أحمد الزهراني', text: 'المكان زفت', rating: 1 },
  { ...emptyReview(), id: 'R002', author: 'أحمد الزهراني', text: 'مرة ثانية', rating: 2 },
  { ...emptyReview(), id: 'R003', author: 'نورة', text: 'ممتاز', rating: 5 },
];
const ps = pseudonymize(named);
!JSON.stringify(ps).includes('الزهراني') ? ok('الاسم الحقيقي لا يظهر') : bad('تسرّب الاسم');
ps[0].author === ps[1].author ? ok('والكاتب نفسه يأخذ الاسم المستعار نفسه') : bad('ثبات البديل');
ps[0].text === 'المكان زفت' && ps[0].rating === 1 ? ok('والنصّ والتقييم كما وردا — لا يُمسّان') : bad('مسّ النصّ');
ps[0].id === 'R001' ? ok('والمعرّف باقٍ فيظلّ التحقّق ممكنًا') : bad('المعرّف');
isOn() === false ? ok('والوضع مطفأ ابتداءً') : bad('الوضع الافتراضي');
shield({ reviews: named }).reviews[0].author === 'أحمد الزهراني'
  ? ok('ومطفأً لا يُغيَّر شيء') : bad('الدرع وهو مطفأ');

console.log('٥) البيانات الخام');
const csv = reviewsCsv({ place: { reviews: named } });
csv.includes('المعرّف') && csv.includes('R001') ? ok('CSV فيه المعرّفات') : bad('CSV', csv.slice(0, 60));
csv.includes('المكان زفت') ? ok('والنصوص كما وردت — ليتحقّق عميلك بنفسه') : bad('نصوص CSV');
csv.startsWith('﻿') ? ok('وبعلامة ترتيب البايتات فتفتحه Excel بالعربية') : bad('BOM');

console.log('٦) اللغة');
const html = '<main><h2>صوت العميل — بنصّه</h2><blockquote><p>المكان زفت والخدمه سيئه</p></blockquote><table><tr><th>الموضوع</th></tr></table></main>';
const en = bilingual(html, 'en');
en.includes('Customer voice') ? ok('العناوين تُترجَم') : bad('ترجمة العنوان');
en.includes('<span class="ar-sub">صوت العميل — بنصّه</span>') ? ok('والعربية تبقى تحتها لا تُمحى') : bad('العربية تحت العنوان');
en.includes('المكان زفت والخدمه سيئه') ? ok('وكلام العميل لا يُترجَم ولا يُمسّ') : bad('ترجمة الشهادة');
en.includes('verbatim') ? ok('ويُقال للقارئ الأجنبي لماذا') : bad('الإشعار');
bilingual(html, 'ar') === html ? ok('وبالعربية لا يتغيّر شيء') : bad('العربية');

console.log('٧) معيار الرسائل');
const fx = fixture();
fx.reviews.length === 8 ? ok('حالةٌ ثابتة من ٨ تعليقات') : bad('الحالة', fx.reviews.length);
const good = grade('## الخلاصة\nجودة القهوة متكررة (R001، R005، R008). والانتظار شكوى بارزة (R002، R007).', fx);
good.verdict === 'مقبول' ? ok(`مخرجٌ مسنود: ${good.total}/100`) : bad('المقبول', JSON.stringify(good));
const inv = grade('## الخلاصة\nجودة القهوة (R001) والخدمة (R999).', fx);
(inv.total === 0 && inv.fatal) ? ok('ومخرجٌ يخترع معرّفًا: صفر مهما حسُن سواه') : bad('الاختراع', JSON.stringify(inv));
const mis = grade('ورد في (R002): «انتظرت قليلا وكان الموظف لطيفا جدا معي».', fx);
mis.total === 0 ? ok('ومخرجٌ يُحرّف اقتباسًا: صفر') : bad('التحريف', JSON.stringify(mis));

console.log('\n' + (fails.length ? `فشل ${fails.length}:\n` + fails.map((f) => ' - ' + f).join('\n') : '✅ نجحت كل الاختبارات'));
process.exit(fails.length ? 1 : 0);
