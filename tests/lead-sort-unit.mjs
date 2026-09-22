// المرحلة ٥١: فارزُ الوارد — طلبٌ أم عرضٌ أم ملتبس؟ (دوالُّ خالصة، بلا متصفّح ولا خادم)
import {
  sortIncoming, sortReason, fingerprintText, KIND_LABELS, KIND_ACC, KINDS, MIN_EDGE,
  WANT_SIGNS, OFFER_SIGNS, PROSPECT_SIGNS, TASK_SIGNS, SUGGEST_SIGNS, IDEA_SIGNS,
} from '../js/util/lead-sort.js';
import { extractUpdate } from '../netlify/functions/telegram.js';

let pass = 0; let fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log(`PASS — ${n}`); } else { fail++; console.log(`FAIL — ${n}${x ? ' :: ' + x : ''}`); } };

console.log('--- ١. الطلب يُعرف بفعله ---');
const wants = [
  'ابحث عن فلة في حطين ميزانيتي ٣ مليون',
  'أبي شقة بالياسمين للإيجار',
  'مطلوب دور في شمال الرياض',
  'عندكم أرض بالعارض؟',
  'محتاج مستودع في الصناعية',
  'أدور على أرض للشراء بحدود مليون',
];
for (const t of wants) {
  const v = sortIncoming(t);
  ok(`«${t.slice(0, 26)}…» ← طلب`, v.kind === 'request', `${v.kind} (طلب ${v.want} · عرض ${v.offer})`);
}

console.log('\n--- ٢. العرض يُعرف بما لا يذكره الطالب ---');
const offers = [
  'للبيع أرض في النرجس ٦٠٠م الصك إلكتروني واجهة شمالية',
  'فرصة: فلة الملقا ٤٠٠م زاوية شارعين رقم الترخيص ١٢٣',
  'معروض للبيع دور أرضي في الرمال، عمر البناء ٣ سنوات، تشطيب ممتاز',
];
for (const t of offers) {
  const v = sortIncoming(t);
  ok(`«${t.slice(0, 26)}…» ← عرض`, v.kind === 'offer', `${v.kind} (طلب ${v.want} · عرض ${v.offer})`);
}

console.log('\n--- ٣. والملتبسُ يُوسَم ولا يُخمَّن ---');
ok('**نصٌّ بلا شاهدٍ لا يُرجَّح طلبًا افتراضًا**', sortIncoming('فلة حطين ٣ مليون').kind === 'unsure');
ok('والتحيّةُ وحدها ملتبسة', sortIncoming('السلام عليكم').kind === 'unsure');
ok('والفراغُ ملتبسٌ لا ينهار', sortIncoming('').kind === 'unsure' && sortIncoming(null).kind === 'unsure');
const mixed = sortIncoming('مطلوب للبيع أرض');
ok('**وتقاربُ الشاهدين التباسٌ** لا ترجيحٌ بفارقٍ ضئيل', Math.abs(mixed.edge) < MIN_EDGE ? mixed.kind === 'unsure' : true,
  `${mixed.kind} فارق ${mixed.edge}`);

console.log('\n--- ٤. الحكمُ يُبيّن حجّته ---');
const v = sortIncoming('ابحث عن فلة ميزانيتي ٣ مليون');
ok('الحجّةُ تُذكر بالعربيّة', sortReason(v).includes('فعلُ بحثٍ صريح'), sortReason(v));
ok('وبلا شاهدٍ يُقال ذلك صراحةً', sortReason(sortIncoming('السلام عليكم')).includes('الحكمُ لك'));
ok('**ولا تُكرَّر حجّةٌ مرّتين**', (() => {
  // وشاهدٌ مميَّزٌ لا يقع في صدر الجملة — فعدُّ حرفٍ شائعٍ يعدّ «لأنّ» معه.
  const r = sortReason({ kind: 'request', why: ['زقزقة', 'زقزقة', 'همهمة'] });
  return r.split('زقزقة').length - 1 === 1;
})());
ok('ولكلّ حكمٍ عنوانٌ عربيّ', Object.values(KIND_LABELS).every((x) => x && x.length > 2));

console.log('\n--- ٥. حدودُ الكلمات تفهم العربيّة ---');
// **العطبُ الذي وقع فعلًا**: `\b` في جافاسكربت لا تطابق العربيّة، فكان الفارزُ يعيد صفرًا دائمًا.
ok('**الشواهدُ تُصيب أصلًا** — وهو ما أخفقَ أوّل مرّة', sortIncoming('ابحث عن فلة').want > 0);
ok('ولا تُصيب داخلَ كلمةٍ أطول', sortIncoming('المطلوبات المحاسبية').want === 0, String(sortIncoming('المطلوبات المحاسبية').want));
ok('والشواهدُ كلُّها مبنيّةٌ لا نصوص', [...WANT_SIGNS, ...OFFER_SIGNS].every((s) => s.re instanceof RegExp && s.w > 0 && s.why));

console.log('\n--- ٥ب. الأصنافُ الأربعة الجديدة (المرحلة ٥٣) ---');
const newKinds = [
  ['prospect', 'مزاد على أرض ورثة في الملقا الخميس'],
  ['prospect', 'أبو سعد ينوي البيع لفلته قبل الإعلان'],
  ['prospect', 'فرصة استثمارية: مشروع شراكة بعائد جيّد'],
  ['task', 'ذكرني أتصل على سعد بكرة الساعة ٤'],
  ['task', 'لا تنسى تجهز عقد الوساطة اليوم'],
  ['suggestion', 'أقترح تضيفون حقل للتمويل في الطلب'],
  ['suggestion', 'يا ليت البرنامج يرسل الفاتورة تلقائيًّا'],
  ['idea', 'فكرة: تقرير شهري نرسله للملاك'],
  ['idea', 'خطرت لي خاطرة نجمع فيها أرقام الملاك'],
];
for (const [want, text] of newKinds) {
  const got = sortIncoming(text);
  ok(`«${text.slice(0, 28)}…» ← ${KIND_LABELS[want]}`, got.kind === want,
    `${got.kind} · ${JSON.stringify(got.scores)}`);
}
ok('**ولكلّ صنفٍ درجةٌ في `scores`** فيُرى على أيّ شيءٍ تردّدَ الفارز',
  KINDS.every((k) => typeof sortIncoming('للبيع أرض').scores[k.key] === 'number'));
ok('والأصنافُ ستّةٌ لا حكمان', KINDS.length === 6, String(KINDS.length));
ok('ولكلّ صنفٍ شواهدُ مبنيّة',
  [...PROSPECT_SIGNS, ...TASK_SIGNS, ...SUGGEST_SIGNS, ...IDEA_SIGNS].every((x) => x.re instanceof RegExp && x.w > 0 && x.why));

/**
 * **حارسٌ يمنع الشاهدَ الميّت**: النصُّ يُطبَّع قبل المطابقة (ى←ي، ة←ه، أ←ا، ؤ←و، ئ←ي)،
 * فشاهدٌ مكتوبٌ بحرفٍ غيرِ مطبَّعٍ **لا يطابق شيئًا أبدًا وهو ساكتٌ لا يشتكي**. وقد وُجد
 * منها خمسةٌ يوم المرحلة ٥٣: ثلاثةٌ جديدة واثنتان قديمتان بلا بديلٍ حيّ.
 */
const deadSigns = KINDS.flatMap((k) => k.signs
  .filter((x) => /[أإآٱىةؤئ]/.test(x.re.source))
  .map((x) => `${k.key}/${x.why}`));
ok('**ولا شاهدَ ميّتًا**: كلُّ الشواهد مكتوبةٌ مطبَّعةً كما يُطبَّع النصّ',
  deadSigns.length === 0, deadSigns.join(' · '));

console.log('\n--- ٥ج. العربيّةُ في الحجّة: «فكرةً» لا «فكرةًا» ---');
// **العطبُ الذي كاد يقع**: الصيغةُ كانت `${label}ًا` فتخرج «فكرةًا» و«مهمّةًا».
ok('الصيغةُ المنصوبةُ مكتوبةٌ لكلّ صنف', KINDS.every((k) => k.acc && !k.acc.endsWith('ةًا')));
ok('والحجّةُ تستعملها', sortReason(sortIncoming('فكرة: تقرير شهري نرسله للملاك')).startsWith('حُكم فكرةً'),
  sortReason(sortIncoming('فكرة: تقرير شهري نرسله للملاك')));
ok('ولا يبقى صنفٌ بلا صيغةٍ منصوبة', Object.keys(KIND_ACC).length === KINDS.length);

console.log('\n--- ٥د. والصنفُ الجديد لا يسرق القديم ---');
ok('«للبيع أرض … الصك … واجهة» يبقى عرضًا', sortIncoming('للبيع أرض في النرجس ٦٠٠م الصك إلكتروني واجهة شمالية').kind === 'offer');
ok('و«فرصة: فلة … زاوية … رقم الترخيص» يبقى عرضًا لا فرصة',
  sortIncoming('فرصة: فلة الملقا ٤٠٠م زاوية شارعين رقم الترخيص ١٢٣').kind === 'offer',
  sortIncoming('فرصة: فلة الملقا ٤٠٠م زاوية شارعين رقم الترخيص ١٢٣').kind);
ok('و«ابحث عن فلة … ميزانيتي» يبقى طلبًا', sortIncoming('ابحث عن فلة في حطين ميزانيتي ٣ مليون').kind === 'request');

console.log('\n--- ٦. البصمةُ تمنع التضاعف ---');
ok('النصُّ نفسُه بصمةٌ واحدة', fingerprintText('ابحث عن فلة') === fingerprintText('ابحث عن فلة'));
ok('**واختلافُ التشكيل والمسافات لا يُنشئ بصمةً ثانية**',
  fingerprintText('ابحث  عن فلة') === fingerprintText('ابحث عن فلة'));
ok('ونصّان مختلفان بصمتان', fingerprintText('ابحث عن فلة') !== fingerprintText('ابحث عن أرض'));

console.log('\n--- ٧. قراءةُ تحديث تيليجرام ---');
ok('الرسالةُ النصّيّة تُقرأ', extractUpdate({ update_id: 1, message: { chat: { id: 5 }, date: 1758100000, text: 'مرحبا' } })?.text === 'مرحبا');
ok('**وتعليقُ الصورة نصٌّ أيضًا** — فمن حوّل إعلانًا بصورةٍ وتعليق لا يضيع تعليقُه',
  extractUpdate({ update_id: 2, message: { chat: { id: 5 }, date: 1, photo: [{}], caption: 'للبيع أرض' } })?.text === 'للبيع أرض');
ok('والمرفقُ بلا نصٍّ يُوسَم بنوعه',
  extractUpdate({ update_id: 3, message: { chat: { id: 5 }, date: 1, voice: {} } })?.mediaKind === 'رسالة صوتية');
ok('**واسمُ من حُوِّلت عنه هو صاحبُ الطلب لا أنت**',
  extractUpdate({ update_id: 4, message: { chat: { id: 5 }, date: 1, text: 'x', from: { first_name: 'أنا' }, forward_sender_name: 'أبو سعد' } })?.forwardedFrom === 'أبو سعد');
ok('ومن أخفى ملفَّه يُترك فارغًا ولا يُخمَّن',
  extractUpdate({ update_id: 5, message: { chat: { id: 5 }, date: 1, text: 'x', from: { first_name: 'أنا' } } })?.forwardedFrom === '');
ok('وتحديثٌ لا رسالةَ فيه يُعاد `null`', extractUpdate({ update_id: 6, my_chat_member: {} }) === null);

console.log(`\n${pass} PASS · ${fail} FAIL`);
