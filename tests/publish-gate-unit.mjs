// اختبار وحدة (المرحلة ٤٧): موانعُ الإعلان النظاميّة كما تراها صفحةُ النشر.
//
// **الحدُّ المحروس:** المنطقُ مبنيٌّ منذ المرحلة ٤٠ ولم يكن يُسأل عند النشر. وهذه تثبت
// أنّ ما يُسأل عنه هو ما يوجبه النظام، وأنّ العقارَ السليم لا يُمنع.
import { adBlockers, canAdvertise, adDisclosure } from '../js/util/rega.js';

const ok = (n, c, x = '') => console.log(`${c ? 'PASS' : 'FAIL'} — ${n}${x ? ' :: ' + x : ''}`);
const YEAR = 365 * 86400000;
const soon = (d) => new Date(Date.now() + d * 86400000).toISOString();

const good = {
  agreementSignedAt: new Date(Date.now() - 10 * 86400000).toISOString(),
  agreementDays: 90,
  agreementNumber: 'ع-١٢٣',
  agreementScopes: ['sell', 'market'],
  adLicense: { number: '7200123456', expiresAt: soon(120) },
};

ok('العقار المستوفي لا مانعَ له', adBlockers(good).length === 0 && canAdvertise(good) === true);

const keys = (p) => adBlockers(p).map((b) => b.key);
ok('بلا عقدٍ: يُمنع ويُقال السبب', keys({ ...good, agreementSignedAt: null }).includes('noContract'));
ok('وعقدٌ انتهت مدّته يُكشف', keys({ ...good, agreementSignedAt: new Date(Date.now() - YEAR).toISOString(), agreementDays: 30 }).includes('contractExpired'));
ok('ونطاقٌ بلا تسويق يمنع الإعلان', keys({ ...good, agreementScopes: ['sell'] }).includes('noMarketScope'));
ok('وبلا رقم عقدٍ موثَّق', keys({ ...good, agreementNumber: '' }).includes('noContractNumber'));
ok('وبلا ترخيص إعلان', keys({ ...good, adLicense: null }).includes('noLicense'));
ok('وترخيصٌ منتهٍ', keys({ ...good, adLicense: { number: '72001', expiresAt: soon(-5) } }).includes('licenseExpired'));

// الترخيصُ بلا تاريخِ انتهاء لا يُعدّ منتهيًا — غيابُ التاريخ ليس انتهاءً.
ok('وترخيصٌ بلا تاريخٍ لا يُعدّ منتهيًا', !keys({ ...good, adLicense: { number: '72001' } }).includes('licenseExpired'));

// لكلّ مانعٍ اسمٌ قصير يُقرأ في جدول، وجملةٌ كاملةٌ تشرح.
const all = adBlockers({});
ok('لكلّ مانعٍ مفتاحٌ وقصيرٌ وجملة', all.length > 0 && all.every((b) => b.key && b.short && b.text));
ok('والقصيرُ قصيرٌ فعلًا', all.every((b) => b.short.length <= 20), JSON.stringify(all.map((b) => b.short)));

/* ===== سطرُ الإفصاح ===== */
ok('بلا ترخيصٍ لا يُكتب سطرٌ يوهم به', adDisclosure({ adLicense: null }, { name: 'مكتبي' }) === '');
const line = adDisclosure(good, { name: 'مكتب كسّاب', licenseNumber: '1100' });
ok('ويذكر رقم ترخيص الإعلان', line.includes('7200123456'), line);
ok('ورخصة فال إن وُجدت', line.includes('1100') && line.includes('فال'), line);
ok('واسم المكتب', line.includes('مكتب كسّاب'), line);
ok('وبلا فال يبقى صحيحًا', adDisclosure(good, { name: 'مكتبي' }).includes('7200123456'));
