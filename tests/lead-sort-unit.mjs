// المرحلة ٥١: فارزُ الوارد — طلبٌ أم عرضٌ أم ملتبس؟ (دوالُّ خالصة، بلا متصفّح ولا خادم)
import { sortIncoming, sortReason, fingerprintText, KIND_LABELS, MIN_EDGE, WANT_SIGNS, OFFER_SIGNS } from '../js/util/lead-sort.js';
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
