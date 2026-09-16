// اختبار الأفكار العشر — ما يُحسَب برمجيًّا وما يُخزَّن مشفَّرًا.
//
//   node tests/features.mjs

import { priorities } from '../js/priority.js';
import { needed, impactOfOne, ladder } from '../js/stars.js';
import { voice } from '../js/voice.js';
import { impact } from '../js/impact.js';
import { compareSources } from '../js/sources.js';
import { summarize, diffSnapshots } from '../netlify/functions/watch.js';
import { emptyPlace, emptyReview, assignReviewIds } from '../js/schema.js';

const fails = [];
const ok = (t) => console.log('  ✓', t);
const bad = (t, e) => { fails.push(t + (e ? ' :: ' + e : '')); console.log('  ✗', t, e || ''); };

const mk = (r, t, d, pl) => ({ ...emptyReview(), rating: r, text: t, date: d || 'قبل شهر', platform: pl || 'google' });
const build = (list, avg = 4.1, count = 200) => {
  const p = emptyPlace();
  p.identity.name = 'مقهى الاختبار';
  p.ratings = { average: avg, count, distribution: null };
  p.reviews = list;
  assignReviewIds(p);
  return p;
};

console.log('١) أولويات الإصلاح');
const p1 = build([
  mk(1, 'الانتظار طويل جدا ووقفت نص ساعة', 'قبل أسبوع'),
  mk(1, 'انتظرت كثير والخدمة بطيئة', 'قبل ٣ أيام'),
  mk(2, 'الانتظار في الذروة لا يطاق', 'قبل شهر'),
  mk(2, 'مافي مواقف ابدا', 'قبل سنتين'),
  mk(5, 'القهوة ممتازة', 'قبل شهر'),
]);
const pr = priorities(p1);
pr.length ? ok(`رُتِّبت ${pr.length} أولويات`) : bad('لا أولويات');
pr[0]?.id === 'wait' ? ok('الانتظار أولًا — أكثر وأحدث وأقسى') : bad('الترتيب', pr[0]?.id);
pr[0].weight > (pr[pr.length - 1]?.weight ?? 0) ? ok('والوزن يتناقص') : bad('الأوزان');
/شكوى/.test(pr[0].why) && /90 يومًا/.test(pr[0].why) ? ok('والسبب مكتوب بالأرقام: ' + pr[0].why.slice(0, 48)) : bad('نصّ السبب', pr[0].why);
pr.every((r) => r.ids.length) ? ok('ولكل بندٍ شواهده') : bad('بلا شواهد');

// القديم لا يتصدّر الحديث عند تساوي العدد
const p2 = build([mk(1, 'الانتظار طويل', 'قبل سنتين'), mk(1, 'مافي مواقف', 'قبل يومين')]);
const pr2 = priorities(p2);
pr2[0].id === 'parking' ? ok('وشكوى اليوم تتقدّم شكوى السنة الماضية') : bad('ترجيح الحداثة', pr2.map((x) => x.id).join());

console.log('٢) حاسبة النجوم');
needed(4.1, 200, 4.5, 5) === 161 ? ok('من ٤٫١ إلى ٤٫٥ عند ٢٠٠: ١٦١ تقييمًا') : bad('الحساب', needed(4.1, 200, 4.5, 5));
needed(4.1, 200, 4.0) === 0 ? ok('وهدفٌ دون متوسطك: صفر') : bad('هدف أدنى', needed(4.1, 200, 4.0));
needed(4.1, 200, 4.5, 4) === null ? ok('ولا يُبلَغ ٤٫٥ بأربع نجوم مهما كثرت') : bad('حدّ الفئة', needed(4.1, 200, 4.5, 4));
Math.abs(impactOfOne(4.1, 200, 1) + 0.0154) < 0.001 ? ok('وأثر تقييمٍ بنجمة محسوب') : bad('أثر الواحد', impactOfOne(4.1, 200, 1));
(ladder(4.1, 200, { perMonth: 8 })?.rows?.[0]?.months ?? null) !== null ? ok('والمدة بمعدّل التقييمات الذي يُدخله المالك') : bad('المدة');
ladder(null, null) === null ? ok('وبلا متوسطٍ لا يُخمَّن شيء') : bad('بلا بيانات');

console.log('٣) صوت العميل — حرفيّ');
const HARSH = 'المكان زفت والخدمه سيئه للغايه ومارح ارجعله ابد';
const p3 = build([mk(1, HARSH, 'قبل أسبوع'), mk(5, 'القهوة ممتازة والموظفين ذوقهم عالي', 'قبل شهر')]);
const v = voice(p3);
const all = v.flatMap((g) => [...g.neg, ...g.pos]);
all.some((r) => r.text === HARSH) ? ok('الذمّ منقولٌ بنصّه بلا تهذيب') : bad('تغيّر النصّ', JSON.stringify(all.map((r) => r.text)));
all.every((r) => r.id) ? ok('ولكل اقتباسٍ معرّفه') : bad('بلا معرّف');

console.log('٤) الأثر المالي — بفرض المالك');
const p4 = build([mk(1, 'الانتظار طويل'), mk(2, 'الخدمة بطيئة والانتظار'), mk(5, 'ممتاز'), mk(4, 'جيد')]);
const im = impact(p4, { ticket: 100, monthly: 1000, lossRate: 0.5 });
im.rows[0].share === 50 ? ok('نسبة الشاكين محسوبة من العيّنة: 50%') : bad('النسبة', im.rows[0].share);
im.rows[0].riyals === 25000 ? ok('والأثر = 1000 × 50% × 50% × 100 = 25,000') : bad('الحساب', im.rows[0].riyals);
impact(p4, {}) && impact(p4, {}).totalRiyals === 0 ? ok('وبلا أرقامك لا يُقدَّر مبلغ') : bad('بلا فروض', JSON.stringify(impact(p4, {})?.totalRiyals));
impact(build([]), { ticket: 100, monthly: 100 }) === null ? ok('وبلا تعليقات لا جدول') : bad('بلا تعليقات');

console.log('٥) مقارنة المصادر');
const p5 = build([
  mk(5, 'القهوة ممتازة والمكان جميل', 'قبل شهر', 'google'),
  mk(4, 'خدمة جيدة', 'قبل شهر', 'google'),
  mk(1, 'الطلب وصل بارد ومتأخر', 'قبل شهر', 'hunger'),
  mk(2, 'التوصيل تأخر والطلب ناقص', 'قبل شهر', 'hunger'),
  mk(2, 'نسوا نص الطلب', 'قبل شهر', 'hunger'),
]);
const cs = compareSources(p5);
cs.ok ? ok('قُورن المصدران') : bad('المقارنة');
cs.platforms.length === 2 ? ok('منصّتان') : bad('العدد', cs.platforms.length);
cs.platforms[0].average > cs.platforms[1].average ? ok('ورُتِّبتا بالمتوسط') : bad('الترتيب');
cs.gaps.some((g) => g.id === 'delivery') ? ok('والفجوة مُسمّاة: التوصيل في منصّته لا في قوقل') : bad('الفجوة', JSON.stringify(cs.gaps));
compareSources(build([mk(5, 'ممتاز')])).ok === false ? ok('وبمصدرٍ واحد لا تُعرَض مقارنة') : bad('مصدر واحد');

console.log('٦) الرصد: اللقطة أرقامٌ لا نصوص');
const snap = summarize([{ rating: 5, text: 'سرّي' }, { rating: 1, text: 'سرّي' }, { rating: 2 }, { rating: 4 }]);
!JSON.stringify(snap).includes('سرّي') ? ok('لا نصّ تعليقٍ في اللقطة المرفوعة') : bad('تسرّب نصّ', JSON.stringify(snap));
snap.average === 3 && snap.negShare === 50 ? ok('والأرقام صحيحة: متوسط 3 وسلبي 50%') : bad('اللقطة', JSON.stringify(snap));
diffSnapshots({ average: 4.2, negShare: 10, count: 4 }, snap).alerts.length === 2
  ? ok('والتدهور يُنذَر به (متوسط + سلبي)') : bad('الإنذار', JSON.stringify(diffSnapshots({ average: 4.2, negShare: 10, count: 4 }, snap)));
diffSnapshots({ average: 4.2, negShare: 10, count: 4 }, { average: 4.19, negShare: 11, count: 4 }).alerts.length === 0
  ? ok('وتغيّرٌ طفيف لا يُزعج صاحبه') : bad('عتبة الإنذار');
diffSnapshots(null, snap).alerts.length === 0 ? ok('وأول لقطة لا إنذار فيها') : bad('اللقطة الأولى');

console.log('\n' + (fails.length ? `فشل ${fails.length}:\n` + fails.map((f) => ' - ' + f).join('\n') : '✅ نجحت كل الاختبارات'));
process.exit(fails.length ? 1 : 0);
