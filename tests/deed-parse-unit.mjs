// المرحلة ٤١ — تفريغ المستندات: قراءة الصكّ حقلًا حقلًا، بلا تخمين.
import { parseDocument, guessKind, toPropertyFields, DOC_KINDS } from '../js/util/deed-parse.js';
const ok = (n, c, x = '') => console.log(`${c ? 'PASS' : 'FAIL'} — ${n}${x ? ' :: ' + x : ''}`);

const DEED = [
  'صك إلكتروني — سجل عقاري',
  'رقم الصك: ٣١٠١٠٢٠٤٥٦٧٨٩ بتاريخ ١٢/٠٣/١٤٤٥ هـ',
  'اسم المالك: سعد بن عبدالله التميمي',
  'رقم الهوية: ١٠٢٣٤٥٦٧٨٩',
  'المدينة: الرياض الحي: النرجس',
  'رقم المخطط: ٢٧٤٥ رقم القطعة: ١١٨ البلك: ب',
  'المساحة: ٤٥٠ م٢',
  'الحدود والأطوال: الشمال: شارع عرض ١٥م بطول ١٥ الجنوب: قطعة رقم ١١٧ بطول ١٥ الشرق: قطعة ١١٩ بطول ٣٠ الغرب: شارع عرض ٢٠م بطول ٣٠',
].join('\n');

const r = parseDocument(DEED);
console.log('--- ٤١. حقول الصك ---');
ok('نوعُ المستند يُميَّز صكًّا', r.kind?.key === 'deed', JSON.stringify(r.kind));
ok('رقم الصك بالأرقام اللاتينية', r.fields.deedNumber === '3101020456789', r.fields.deedNumber);
ok('وتاريخه كما كُتب — هجريًّا لا يُحوَّل', r.fields.deedDate === '12/03/1445', r.fields.deedDate);
ok('واسم المالك كاملًا بلا ما بعده', r.fields.ownerName === 'سعد بن عبدالله التميمي', r.fields.ownerName);
ok('ورقم الهوية', r.fields.nationalId === '1023456789', r.fields.nationalId);
ok('والمساحة رقمًا يُحسب به', r.fields.area === 450, String(r.fields.area));
ok('ورقما المخطط والقطعة', r.fields.planNumber === '2745' && r.fields.plotNumber === '118',
  `${r.fields.planNumber} · ${r.fields.plotNumber}`);
ok('والبلك', r.fields.blockNumber === 'ب', r.fields.blockNumber);

console.log('\n--- ٤١. الحقول لا تتجاوز أسطرها ---');
ok('**الحيّ لا يبتلع كلمةً من السطر التالي** — `\\s` تشمل السطر الجديد',
  r.fields.district === 'النرجس', JSON.stringify(r.fields.district));
ok('والمدينة كذلك', r.fields.city === 'الرياض', JSON.stringify(r.fields.city));

console.log('\n--- ٤١. الحدود الأربعة ---');
ok('الجهات الأربع تُقرأ', (r.fields.bounds || []).length === 4, JSON.stringify((r.fields.bounds || []).map((b) => b.side)));
ok('وكلٌّ بنصّه لا مختلطًا بما بعده',
  r.fields.bounds[0].value.includes('شارع عرض ١٥') && !r.fields.bounds[0].value.includes('الجنوب'),
  r.fields.bounds[0].value);
// المرحلة ٤٢: الحدّ يُخزَّن **كما كُتب في الصكّ** لا مطبَّعًا. كان يُحفظ «قطعه رقم 117»
// بأرقامٍ لاتينيّةٍ وتاءٍ مربوطةٍ محذوفة، ثم يُنسخ إلى عقدٍ بخطأٍ ليس في الصكّ.
ok('والحدُّ بحروف الصكّ وأرقامه لا بالمطبَّعة',
  r.fields.bounds[1].value.includes('قطعة') && r.fields.bounds[1].value.includes('١١٧'),
  r.fields.bounds[1].value);

console.log('\n--- ٤١. الشاهد على القراءة ---');
ok('كلُّ حقلٍ يحمل السطر الذي قُرئ منه', r.found.filter((f) => f.snippet).length >= 6,
  String(r.found.filter((f) => f.snippet).length));
ok('وشاهدُ رقم الصك هو سطرُه', r.found.find((f) => f.key === 'deedNumber').snippet.includes('رقم الصك'));

console.log('\n--- ٤١. لا تخمين ---');
const bare = parseDocument('ورقة بلا شيء معروف');
ok('نصٌّ بلا حقولٍ معروفة: لا حقل يُخترع', Object.keys(bare.fields).length === 0, JSON.stringify(bare.fields));
ok('ويُقال إنّه لم يُقرأ شيء', bare.warnings.some((w) => w.includes('لم يُقرأ')), bare.warnings.join(' | '));
const deedNoNum = parseDocument('صك ملكية باسم سعد التميمي');
ok('وصكٌّ بلا رقمٍ يُنبَّه عليه', deedNoNum.warnings.some((w) => w.includes('رقمُه')), deedNoNum.warnings.join(' | '));
const noEra = parseDocument('رقم الصك: 123456789 بتاريخ 01/01/1445');
ok('وتاريخٌ بلا «هـ» أو «م» يُسأل عنه', noEra.warnings.some((w) => w.includes('هجريّ')), noEra.warnings.join(' | '));
ok('والفراغ لا ينفجر', parseDocument('').found.length === 0 && parseDocument(null).warnings.length === 0);

console.log('\n--- ٤١. تمييز الأنواع ---');
ok('رسالة طلبٍ تُميَّز', guessKind('السلام عليكم ابغى فلة في النرجس')?.key === 'voice');
ok('وعقد إيجار', guessKind('عقد ايجار بين المؤجر والمستأجر')?.key === 'lease');
ok('ورخصة بناء', guessKind('رخصة بناء صادرة من الأمانة')?.key === 'permit');
ok('وما لا يُميَّز يعيد null لا نوعًا مخترَعًا', guessKind('نصّ عاديّ جدًّا') === null);
ok('ولكل نوعٍ اسمٌ وكلماتُه', DOC_KINDS.every((k) => k.label && k.words.length));

console.log('\n--- ٤١. التحويل إلى عقار ---');
const pf = toPropertyFields(r);
ok('المدينة والحي والمساحة ورقم الصك تنتقل', pf.city === 'الرياض' && pf.district === 'النرجس' && pf.area === 450 && pf.deedNumber === '3101020456789',
  JSON.stringify(pf));
ok('ورقما المخطط والقطعة يذهبان إلى حقول النوع حيث مكانهما',
  pf.typeFields.planNumber === '2745' && pf.typeFields.plotNumber === '118', JSON.stringify(pf.typeFields));
ok('ومن لا مدينة له يأخذ الافتراضية لا فراغًا', toPropertyFields({ fields: {} }, { city: 'جدة' }).city === 'جدة');

console.log('\n--- ٤١. الأرقام العربية والتشكيل ---');
const mixed = parseDocument('رقم الصّك: 310102 المساحة: ١٬٢٥٠ م٢');
ok('الفاصلة العربية للآلاف تُقرأ', mixed.fields.area === 1250, String(mixed.fields.area));
ok('والتشكيل لا يمنع المطابقة', mixed.fields.deedNumber === '310102', mixed.fields.deedNumber);
