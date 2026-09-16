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
