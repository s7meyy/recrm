// اختبار وحدة (المرحلة ٢٦): كشف العملاء المكرّرين واقتراح السجل الباقي.
import { findDuplicates, suggestKeeper } from '../js/util/duplicates.js';

const ok = (n, c, x = '') => console.log(`${c ? 'PASS' : 'FAIL'} — ${n}${x ? ' :: ' + x : ''}`);

const c = (id, name, phone, extra = {}) => ({ id, name, phone, phone2: '', contacts: [], tags: [], createdAt: '2026-01-01', ...extra });

/* ===== الجوال حكمٌ قاطع ===== */
const byPhone = findDuplicates([
  c('a', 'محمد العتيبي', '0501234567'),
  c('b', 'ابو فهد', '٠٥٠١٢٣٤٥٦٧'), // الصيغة نفسها بأرقام عربية
  c('z', 'خالد الشمري', '0559999999'),
]);
ok('الجوال نفسه بصيغتين يُكشف', byPhone.length === 1, JSON.stringify(byPhone.map((p) => [p.a.id, p.b.id])));
ok('وسببه معلن ويقينه قاطع', byPhone[0].sure === true && byPhone[0].reason === 'phone');
ok('ومن لا شبيه له لا يظهر', !byPhone.some((p) => p.a.id === 'z' || p.b.id === 'z'));

const cross = findDuplicates([
  c('a', 'سعد', '0501112222'),
  c('b', 'سعد آخر', '0503334444', { phone2: '0501112222' }),
]);
ok('جوال أحدهما هو الثاني للآخر يُكشف', cross.length === 1 && cross[0].sure === true, JSON.stringify(cross[0]?.reason));

/* ===== الاسم ظنٌّ لا يقين ===== */
const byName = findDuplicates([
  c('a', 'عبدالله الدوسري', '0500000001'),
  c('b', 'عبد الله الدوسري', '0500000002'),
]);
ok('الاسم نفسه باختلاف المسافة يُكشف', byName.length === 1, JSON.stringify(byName.map((p) => p.reason)));
ok('ولا يُعدّ يقينًا', byName[0].sure === false);

ok('اسم من كلمة واحدة ليس دليلًا', findDuplicates([c('a', 'محمد', '0500000001'), c('b', 'محمد', '0500000002')]).length === 0);
ok('وبلا اسم ولا جوال لا تكرار', findDuplicates([c('a', '', ''), c('b', '', '')]).length === 0);

/* ===== الأقوى يبقى في العرض ===== */
const both = findDuplicates([
  c('a', 'ناصر المطيري', '0507777777'),
  c('b', 'ناصر المطيري', '0507777777'),
]);
ok('اجتماع الاسم والجوال يُعرض بالجوال', both.length === 1 && both[0].reason === 'phone', both[0]?.reason);

const mixed = findDuplicates([
  c('a', 'عبدالله الدوسري', '0500000001'),
  c('b', 'عبد الله الدوسري', '0500000002'),
  c('x', 'ناصر المطيري', '0507777777'),
  c('y', 'ناصر آخر', '0507777777'),
]);
ok('اليقيني يُعرض قبل الظنّي', mixed[0].sure === true && mixed.at(-1).sure === false, JSON.stringify(mixed.map((p) => p.reason)));

/* ===== أيّهما يبقى ===== */
const rich = c('a', 'فهد', '0501111111', { contacts: [{ id: '1' }, { id: '2' }], notes: 'مهم' });
const poor = c('b', 'فهد الشمري', '0501111111');
ok('الأغنى سجلًّا هو المقترح', suggestKeeper(rich, poor).id === 'a');
ok('والترتيب لا يغيّر النتيجة', suggestKeeper(poor, rich).id === 'a');
const older = c('a', 'سعد المالكي', '0502222222', { createdAt: '2025-01-01' });
const newer = c('b', 'سعد المالكي', '0502222222', { createdAt: '2026-01-01' });
ok('وعند التعادل يبقى الأقدم', suggestKeeper(newer, older).id === 'a');

/* ===== من المعلن؟ (المرحلة ٤٥) ===== */
import { externalDuplicates } from '../js/util/duplicates.js';

const mine = { id: 'p1', captureStatus: 'approved', city: 'الرياض', district: 'الياسمين', type: 'villa', area: 400, price: 2500000 };
const ext = (id, phone, extra = {}) => ({ id, status: 'active', city: 'الرياض', district: 'الياسمين', type: 'villa', area: 400, price: 2500000, advertiserPhone: phone, ...extra });

const me = externalDuplicates({ properties: [mine], externals: [ext('e1', '0501234567')], myPhones: ['٠٥٠١٢٣٤٥٦٧'] });
ok('جوّال المعلن جوّالك = رصدُك أنت', me.length === 1 && me[0].advertiser === 'me', me[0]?.advertiser);

const other = externalDuplicates({ properties: [mine], externals: [ext('e2', '0559999999')], myPhones: ['0501234567'] });
ok('وجوّالٌ غيره = معلنٌ آخر', other[0].advertiser === 'other', other[0]?.advertiser);

const blank = externalDuplicates({ properties: [mine], externals: [ext('e3', '')], myPhones: ['0501234567'] });
ok('وبلا جوّالٍ للمعلن لا يُدَّعى علم', blank[0].advertiser === 'unknown', blank[0]?.advertiser);

const noMine = externalDuplicates({ properties: [mine], externals: [ext('e4', '0559999999')] });
ok('ومن لم يسجّل جوّاله لا يُقال له «معلنٌ آخر»', noMine[0].advertiser === 'unknown', noMine[0]?.advertiser);

ok('والحقول القديمة باقية كما هي', typeof noMine[0].priceGap === 'number' && noMine[0].samePrice === true);

/* ===== عقارٌ مكرَّر في مخزونك أنت (المرحلة ٤٦) ===== */
import { propertyDuplicates, suggestPropertyKeeper, SAME_SPOT_METERS } from '../js/util/duplicates.js';

const P = (id, extra = {}) => ({
  id, city: 'الرياض', district: 'الياسمين', type: 'villa', area: 400, price: 2500000,
  status: 'agreed', archivedAt: null, deedNumber: '', location: null, createdAt: '2026-01-01', ...extra,
});

const specs = propertyDuplicates([P('a'), P('b'), P('z', { district: 'النرجس' })]);
ok('المواصفات المتقاربة تُكشف', specs.length === 1 && specs[0].reason === 'specs', JSON.stringify(specs.map((x) => x.reason)));
ok('وتُعدّ ظنًّا لا يقينًا', specs[0].sure === false);
ok('وحيٌّ آخر ليس تكرارًا', !specs.some((x) => x.a.id === 'z' || x.b.id === 'z'));

const deed = propertyDuplicates([
  P('a', { deedNumber: '٣١٠١٠٢٠٤٥٦٧٨', district: 'الياسمين', area: 400 }),
  P('b', { deedNumber: '310102045678', district: 'النرجس', area: 900, price: 9000000 }),
]);
ok('الصكّ نفسه يقينٌ ولو اختلف كل شيء', deed.length === 1 && deed[0].reason === 'deed' && deed[0].sure === true);
ok('والصكّ يُطبَّع من الفواصل', propertyDuplicates([P('a', { deedNumber: '123/أ' }), P('b', { deedNumber: '123 / أ', district: 'حطين' })])[0]?.reason === 'deed');

const spot = propertyDuplicates([
  P('a', { location: { lat: 24.7600, lng: 46.6000 }, district: 'الياسمين' }),
  P('b', { location: { lat: 24.76005, lng: 46.60005 }, district: 'النرجس', type: 'land', area: 900 }),
]);
ok('الموقع نفسه ضمن ٢٠ مترًا يقين', spot.length === 1 && spot[0].reason === 'spot' && spot[0].sure === true, JSON.stringify(spot[0]?.meters));
ok('والمسافة تُقال بالأمتار', typeof spot[0].meters === 'number' && spot[0].meters <= SAME_SPOT_METERS);

const far = propertyDuplicates([
  P('a', { location: { lat: 24.7600, lng: 46.6000 }, district: 'الياسمين', type: 'villa' }),
  P('b', { location: { lat: 24.7700, lng: 46.6100 }, district: 'النرجس', type: 'land', area: 900 }),
]);
ok('وموقعان متباعدان ليسا تكرارًا', far.length === 0, JSON.stringify(far.map((x) => x.reason)));

/* ما انتهى أمرُه خارج الفحص — تاريخٌ يُحفظ لا تكرارٌ يُدمج */
ok('المبيع لا يُقارَن', propertyDuplicates([P('a', { status: 'sold' }), P('b')]).length === 0);
ok('والمؤجَّر لا يُقارَن', propertyDuplicates([P('a', { status: 'rented' }), P('b')]).length === 0);
ok('والمؤرشف لا يُقارَن', propertyDuplicates([P('a', { archivedAt: '2026-01-01' }), P('b')]).length === 0);

/* اليقينيّ أوّلًا، ولا يُكرَّر الزوج */
const pmixed = propertyDuplicates([
  P('a'), P('b'),
  P('x', { district: 'حطين', deedNumber: '555' }),
  P('y', { district: 'قرطبة', deedNumber: '555', area: 1200, price: 8000000 }),
]);
ok('اليقينيّ يُعرض قبل الظنّي', pmixed[0].sure === true && pmixed.at(-1).sure === false, pmixed.map((x) => x.reason).join(','));
ok('والزوج الواحد لا يظهر مرّتين', new Set(pmixed.map((x) => [x.a.id, x.b.id].sort().join('|'))).size === pmixed.length);

/* حدودٌ لا تنهار */
ok('السعر الغائب في أحدهما لا يمنع الشبهة', propertyDuplicates([P('a', { price: null }), P('b')]).length === 1);
ok('والسعر البعيد يمنعها', propertyDuplicates([P('a', { price: 900000 }), P('b')]).length === 0);
ok('وبلا حيٍّ لا شبهة بالمواصفات', propertyDuplicates([P('a', { district: '' }), P('b', { district: '' })]).length === 0);
ok('وقائمة فارغة تردّ فارغة', propertyDuplicates([]).length === 0 && propertyDuplicates().length === 0);

/* أيّهما يبقى */
const pRich = P('a', { deedNumber: '1', ownerId: 'o1', images: ['i1', 'i2'], notes: 'مهم' });
const pPoor = P('b', { price: null, area: null });
ok('الأغنى سجلًّا هو المقترح', suggestPropertyKeeper(pRich, pPoor).id === 'a');
ok('والترتيب لا يغيّر النتيجة', suggestPropertyKeeper(pPoor, pRich).id === 'a');
ok('وعند التعادل يبقى الأقدم',
  suggestPropertyKeeper(P('b', { createdAt: '2026-05-01' }), P('a', { createdAt: '2025-01-01' })).id === 'a');
