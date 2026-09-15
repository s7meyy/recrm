// المرحلة ٣٩ — لصق عرض المالك: القراءة، والكسور المنطوقة، والفاصلة العشرية العربية.
import { parseOfferText, parseRequestText, parseListingText, parseSenderName } from '../js/data/listing-parse.js';
const ok = (n, c, x = '') => console.log(`${c ? 'PASS' : 'FAIL'} — ${n}${x ? ' :: ' + x : ''}`);

const OPTS = {
  districts: ['النرجس', 'الياسمين', 'الملقا', 'حطين'],
  types: [{ key: 'villa', label: 'فلة' }, { key: 'land', label: 'أرض' }, { key: 'apartment', label: 'شقة' }],
  cities: ['الرياض', 'جدة'],
};
const offer = (t) => parseOfferText(t, OPTS);

/* ===== رسالة مالكٍ كاملة ===== */
console.log('--- ٣٩. قراءة عرض المالك ---');
const full = offer('السلام عليكم، انا سعد التميمي، عندي فلة في حي النرجس بالرياض للبيع، '
  + 'المساحة ٤٥٠ متر والسعر مليونين ونص، رقم الصك ٣١٠٢٠٤٥٦٧٨٩، جوالي ٠٥٥١٢٣٤٥٦٧');
ok('النوع', full.fields.type === 'villa', String(full.fields.type));
ok('المدينة', full.fields.city === 'الرياض', String(full.fields.city));
ok('الحي', full.fields.district === 'النرجس', String(full.fields.district));
ok('المساحة', full.fields.area === 450, String(full.fields.area));
ok('السعر «مليونين ونص» = ٢٬٥٠٠٬٠٠٠ لا ٢٬٠٠٠٬٠٠٠', full.fields.price === 2500000, String(full.fields.price));
ok('الغرض بيع', JSON.stringify(full.fields.purposes) === '["sale"]', JSON.stringify(full.fields.purposes));
ok('جوال المالك محلّيًّا', full.fields.phone === '0551234567', String(full.fields.phone));
ok('اسم المالك يتوقّف عند فعل العرض', full.fields.name === 'سعد التميمي', String(full.fields.name));
ok('رقم الصك يُقرأ (وكان يضيع في الملاحظات)', full.fields.deedNumber === '31020456789', String(full.fields.deedNumber));
ok('ولا تحذير على رسالةٍ مكتملة', full.warnings.length === 0, full.warnings.join(' | '));

/* ===== المعاني تختلف عن الطلب ولو تشابهت الحقول ===== */
console.log('\n--- ٣٩. العرض ليس طلبًا ---');
const req = parseRequestText('ابغى فلة للبيع في النرجس او الياسمين ميزانيتي مليونين ونص', OPTS);
ok('الطلب: أحياءٌ جمعًا', Array.isArray(req.fields.districts) && req.fields.districts.length === 2, JSON.stringify(req.fields.districts));
ok('والعرض: حيٌّ واحد (العقار في حيٍّ واحد)', typeof full.fields.district === 'string', typeof full.fields.district);
ok('الطلب: سقف ميزانية', req.fields.budgetMax === 2500000, String(req.fields.budgetMax));
ok('والعرض: سعرٌ مطلوب', full.found.find((f) => f.key === 'price')?.label === 'السعر المطلوب', full.found.find((f) => f.key === 'price')?.label);
ok('الطلب: غرضٌ واحد', req.fields.purpose === 'sale', String(req.fields.purpose));
ok('والعرض: أغراضٌ مجموعة (قد يبيع أو يؤجّر)', Array.isArray(full.fields.purposes));
const both = offer('عندي شقة في حطين للبيع او للايجار، جوالي ٠٥٠١١١٢٢٢٢');
ok('وعرضٌ بغرضين يُقرأ بغرضين', (both.fields.purposes || []).length === 2, JSON.stringify(both.fields.purposes));

/* ===== رسالةٌ ليست عرضًا: يُقال لا يُخمَّن ===== */
console.log('\n--- ٣٩. تمييز الرسالة ---');
const notOffer = offer('ابغى فلة في النرجس ميزانيتي ٢ مليون');
ok('رسالة باحثٍ تُنبَّه وتُحال إلى مكانها', notOffer.warnings.some((w) => w.includes('لصق رسالة عميل')), notOffer.warnings.join(' | '));
ok('ورسالة مالكٍ لا تُنبَّه', !full.warnings.some((w) => w.includes('لصق رسالة عميل')));

/* ===== النواقص تُسمّى بأسمائها ===== */
console.log('\n--- ٣٩. النواقص ---');
const bare = offer('عندي شي في الرياض ابي ابيعه');
ok('لا نوع ← يُقال', bare.warnings.some((w) => w.includes('نوع العقار')), bare.warnings.join(' | '));
ok('لا سعر ← يُقال، ولا يُخترع', bare.fields.price == null && bare.warnings.some((w) => w.includes('سعر')));
const noCity = offer('عندي فلة في النرجس للبيع');
ok('لا مدينة ← يُقال', noCity.warnings.some((w) => w.includes('المدينة')), noCity.warnings.join(' | '));
ok('والفراغ لا ينفجر', offer('').found.length === 0 && offer(null).warnings.length === 0);

/* ===== الأرقام: عطبان كانا يقعان صامتَين ===== */
console.log('\n--- ٣٩. قراءة المبالغ ---');
const price = (t) => parseListingText(`فلة في النرجس بالرياض ${t}`, OPTS).fields.price;
ok('«١٫٥ مليون» = ١٬٥٠٠٬٠٠٠ — وكانت تُقرأ ٥ ملايين', price('السعر ١٫٥ مليون') === 1500000, String(price('السعر ١٫٥ مليون')));
ok('«٢ مليون ونصف» = ٢٬٥٠٠٬٠٠٠ — وكان النصف يسقط', price('السعر ٢ مليون ونصف') === 2500000, String(price('السعر ٢ مليون ونصف')));
ok('«٣ ملايين وربع»', price('السعر ٣ ملايين وربع') === 3250000, String(price('السعر ٣ ملايين وربع')));
ok('«مليون» بلا رقم', price('السعر مليون') === 1000000, String(price('السعر مليون')));
ok('«مليونين» بلا رقم', price('السعر مليونين') === 2000000, String(price('السعر مليونين')));
ok('«نص مليون»', price('السعر نص مليون') === 500000, String(price('السعر نص مليون')));
ok('وفاصلُ الآلاف يبقى فاصلَ آلاف', price('السعر 1,500,000') === 1500000 && price('السعر ٢٬٤٠٠٬٠٠٠') === 2400000,
  `${price('السعر 1,500,000')} · ${price('السعر ٢٬٤٠٠٬٠٠٠')}`);
ok('ورقمٌ صريح يسبق المنطوق فلا يزاحمه', price('السعر 850000 وفيه مليون ذكرى') === 850000, String(price('السعر 850000 وفيه مليون ذكرى')));

/* ===== قارئ الاسم مشتركٌ لا مكرَّر ===== */
console.log('\n--- ٣٩. اسم المرسِل ---');
ok('«انا سعد ابغى فلة» = سعد', parseSenderName('انا سعد ابغى فلة') === 'سعد', parseSenderName('انا سعد ابغى فلة'));
ok('«انا سعد عندي فلة» = سعد (فعل العرض يوقف الاسم كفعل الطلب)', parseSenderName('انا سعد عندي فلة') === 'سعد', parseSenderName('انا سعد عندي فلة'));
ok('«اسمي ريما الحربي» ثنائيٌّ كامل', parseSenderName('اسمي ريما الحربي') === 'ريما الحربي', parseSenderName('اسمي ريما الحربي'));
ok('ولا اسم يُخترع حين لا يُذكر', parseSenderName('عندي فلة للبيع') === '', JSON.stringify(parseSenderName('عندي فلة للبيع')));
