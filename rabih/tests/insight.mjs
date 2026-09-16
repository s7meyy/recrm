// اختبار الأفكار العشر الثانية — العمق التحليلي وما بعد التسليم.
//
//   node tests/insight.mjs

import { cooccurrence, cooccurSentence } from '../js/cooccur.js';
import { timing } from '../js/timing.js';
import { promises } from '../js/promises.js';
import { planEffect, taskTopics } from '../js/effect.js';
import { scanNetwork } from '../js/network.js';
import { sign, verifyFile, fingerprint } from '../js/signature.js';
import { sectorFor, SECTOR_PRESETS } from '../js/templates.js';
import { emptyPlace, emptyReview, assignReviewIds } from '../js/schema.js';

const fails = [];
const ok = (t) => console.log('  ✓', t);
const bad = (t, e) => { fails.push(t + (e ? ' :: ' + e : '')); console.log('  ✗', t, e || ''); };

const mk = (r, t, d, rep) => ({ ...emptyReview(), rating: r, text: t, date: d || 'قبل شهر', ownerReply: rep || '' });
const build = (list) => {
  const p = emptyPlace();
  p.identity.name = 'مقهى الاختبار';
  p.ratings = { average: 4.1, count: 200, distribution: null };
  p.reviews = list;
  assignReviewIds(p);
  return p;
};

console.log('١) التلازم — اقترانٌ لا سبب');
const p1 = build([
  mk(1, 'الانتظار طويل والموظف ما اهتم'),
  mk(1, 'انتظرت كثير والموظفين مشغولين'),
  mk(2, 'الخدمه بطيئه والعامل ما رد'),
  mk(2, 'الانتظار طويل جدا'),
  mk(5, 'القهوة ممتازة'),
]);
const co = cooccurrence(p1);
co.pairs.length ? ok(`رُصد ${co.pairs.length} تلازمًا`) : bad('لا تلازم');
co.pairs[0].both >= 2 ? ok('ولا يُرصَد ما دون مرتين — فلا استنتاج من حالة') : bad('العتبة', co.pairs[0].both);
/في \d+% من مواضعها/.test(cooccurSentence(co.pairs[0])) ? ok('والجملة تقول نسبةً لا سببًا: ' + cooccurSentence(co.pairs[0]).slice(0, 55)) : bad('الجملة');
cooccurrence(build([mk(1, 'الانتظار طويل والموظف سيء')])).pairs.length === 0
  ? ok('وحالةٌ واحدة لا تُنتج تلازمًا') : bad('حالة واحدة');

console.log('٢) وقت الشكوى — ممّا ذُكر لا ممّا وقع');
const p2 = build([
  mk(1, 'الانتظار طويل في المساء خصوصا الجمعة'),
  mk(1, 'وقفت نص ساعة يوم الخميس مساء'),
  mk(2, 'الزحمه لا تطاق نهاية الاسبوع'),
  mk(5, 'ممتاز في الصباح هادي'),
  mk(1, 'الانتظار طويل'),
]);
const t2 = timing(p2);
t2.mentioned === 4 ? ok('أربعة تعليقات ذكرت وقتها من خمسة') : bad('العدّ', t2.mentioned);
t2.mentioned < t2.total ? ok('ولا يُدَّعى أن الكل ذكر وقته') : bad('الادّعاء');
t2.slots[0]?.name === 'المساء' ? ok('والمساء أكثر ما ذُكر') : bad('الأوقات', JSON.stringify(t2.slots));
t2.byTopic.some((x) => x.topSlot?.name === 'المساء') ? ok('والشكوى مقاطَعة بوقتها — قرار جدولة') : bad('التقاطع');
timing(build([mk(1, 'الانتظار طويل')])).mentioned === 0 ? ok('وبلا ذكرٍ للوقت لا جدول') : bad('بلا وقت');

console.log('٣) وعود المالك');
const p3 = build([
  mk(1, 'مافي مواقف ابدا', 'قبل ٧ أشهر', 'شكرا لك، نعمل على زيادة المواقف قريبا'),
  mk(2, 'المواقف قليلة جدا', 'قبل ٣ أشهر'),
  mk(1, 'ما لقيت موقف', 'قبل ١١ يوم'),
  mk(2, 'الخدمه بطيئه', 'قبل ٦ أشهر', 'نعتذر عن ذلك'),
]);
const pr = promises(p3);
pr.promises.length === 1 ? ok('رُصد وعدٌ واحد') : bad('عدد الوعود', pr.promises.length);
pr.promises[0].repeats === 2 ? ok('وشكويان وردتا بعده في موضوعه') : bad('ما بعد الوعد', pr.promises[0].repeats);
pr.promises[0].latest?.date === 'قبل ١١ يوم' ? ok('وآخرها مؤرَّخة: قبل ١١ يوم') : bad('آخر شكوى', JSON.stringify(pr.promises[0].latest));
pr.apologiesOnly === 1 ? ok('والاعتذار المجرّد يُميَّز عن الوعد') : bad('الاعتذار', pr.apologiesOnly);
// ما ورد قبل الوعد لا يُحسَب عليه
const p3b = build([mk(1, 'مافي مواقف', 'قبل شهر', 'نعمل على زيادة المواقف'), mk(1, 'مافي مواقف', 'قبل سنة')]);
promises(p3b).promises[0].repeats === 0 ? ok('وما سبق الوعد لا يُحسَب عليه') : bad('ما قبل الوعد', promises(p3b).promises[0].repeats);

console.log('٤) أثر الخطة — بالنصيب لا بالعدد');
const before = build([mk(1, 'الانتظار طويل'), mk(1, 'انتظرت كثير'), mk(2, 'الخدمه بطيئه'), mk(2, 'مافي مواقف'), mk(5, 'ممتاز')]);
const after = build([mk(5, 'الخدمة سريعة'), mk(4, 'جيد'), mk(2, 'مافي مواقف'), mk(5, 'ممتاز'), mk(1, 'الانتظار طويل')]);
const eff = planEffect({ place: before, plan: [
  { text: 'تقليل زمن الانتظار بإضافة باريستا', status: 'done' },
  { text: 'ترتيب مواقف مع الجار', status: 'open' },
  { text: 'مراجعة الخطة الإدارية', status: 'done' },
] }, { place: after });
eff.rows.length === 3 ? ok('ثلاث مهام') : bad('المهام', eff.rows.length);
eff.rows[0].direction === 'تحسّن' ? ok(`الانتظار تحسّن: ${eff.rows[0].beforeShare}٪ ← ${eff.rows[0].afterShare}٪`) : bad('الاتجاه', JSON.stringify(eff.rows[0]));
eff.rows[1].direction === 'ثبات' ? ok('والمواقف ثابتة — ولم تُنجَز أصلًا') : bad('المواقف', eff.rows[1].direction);
eff.rows[2].measurable === false ? ok('ومهمةٌ لا تُقاس من التعليقات يُقال ذلك فيها') : bad('غير القابلة للقياس');
taskTopics({ text: 'تقليل الانتظار' }).includes('wait') ? ok('ومواضيع المهمة تُستخرج من نصّها') : bad('مواضيع المهمة');
planEffect({ place: before, plan: [] }, { place: after }).rows.length === 0 ? ok('وبلا خطة لا جدول') : bad('بلا خطة');

console.log('٥) إشارات عبر الأرشيف');
const jobs = [
  { id: 'a', place: build([{ ...mk(5, 'أفضل مكان جربته في حياتي وأنصح الجميع به بشدة'), author: 'فيصل العتيبي' }]) },
  { id: 'b', place: build([{ ...mk(1, 'أسوأ تجربة على الإطلاق ولا أنصح به أبدا'), author: 'فيصل العتيبي' },
                           { ...mk(5, 'أفضل مكان جربته في حياتي وأنصح الجميع به بشدة'), author: 'سعد المالكي' }]) },
];
jobs[0].place.identity.name = 'مقهى الدرب';
jobs[1].place.identity.name = 'كوفي النخبة';
const net = scanNetwork(jobs);
net.authors.length === 1 ? ok('كاتبٌ واحد في منشأتين') : bad('الكتّاب', net.authors.length);
net.authors[0].mixed ? ok('ومدحٌ هنا وذمٌّ هناك — أدلّ الأنماط') : bad('النمط المختلط');
net.texts.length === 1 ? ok('ونصٌّ متطابق حرفيًّا في منشأتين') : bad('النصوص', net.texts.length);
// الاسم الشائع وحده لا يدلّ
const common = scanNetwork([
  { id: 'a', place: build([{ ...mk(5, 'جيد جدا'), author: 'محمد' }]) },
  { id: 'b', place: build([{ ...mk(5, 'جيد جدا'), author: 'محمد' }]) },
]);
common.authors.length === 0 ? ok('واسمٌ شائع مفردٌ لا يُبنى عليه حكم') : bad('الاسم الشائع', common.authors.length);

console.log('٦) توقيع التقرير');
const html = '<html><body><main><h1>تقرير</h1><p>المتوسط 4.1 من 5</p></main></body></html>';
const signed = await sign(html, { office: 'مكتب رابح' });
signed.hash.length === 64 ? ok('بصمة SHA-256') : bad('البصمة', signed.hash.length);
signed.html.includes('توقيع التقرير') ? ok('وتُطبَع في التقرير') : bad('كتلة التوقيع');
(await verifyFile(signed.html)).ok ? ok('والتحقّق من الأصل يمرّ') : bad('التحقّق');
const tampered = signed.html.replace('4.1', '4.9');
const v = await verifyFile(tampered);
!v.ok && /غُيِّر/.test(v.reason) ? ok('وتغييرُ رقمٍ واحد يُكشَف') : bad('كشف التغيير', JSON.stringify(v));
(await verifyFile('<html><body>بلا توقيع</body></html>')).ok === false ? ok('وملفٌ بلا بصمة يُقال فيه ذلك') : bad('بلا بصمة');
(await fingerprint(html)) === (await fingerprint(html)) ? ok('والبصمة ثابتة للنصّ نفسه') : bad('ثبات البصمة');

console.log('٧) قوالب القطاعات');
sectorFor('health').lead[0] === 'wait' ? ok('العيادة يتصدّرها الانتظار') : bad('قطاع الصحة', JSON.stringify(sectorFor('health')));
sectorFor('food').lead[0] === 'quality' ? ok('والمقهى يتصدّره الطعم') : bad('قطاع الطعام');
sectorFor('nope').lead.length === 0 ? ok('وقطاعٌ غير معروف يرجع إلى العام') : bad('القطاع المجهول');
Object.keys(SECTOR_PRESETS).length >= 6 ? ok(`${Object.keys(SECTOR_PRESETS).length} قطاعات معرَّفة`) : bad('عدد القطاعات');

console.log('\n' + (fails.length ? `فشل ${fails.length}:\n` + fails.map((f) => ' - ' + f).join('\n') : '✅ نجحت كل الاختبارات'));
process.exit(fails.length ? 1 : 0);
