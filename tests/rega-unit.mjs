// المرحلة ٤٠ — عقود الوساطة وتراخيص الإعلانات: القواعد كما يوجبها النظام.
import {
  contractState, adLicenseState, adBlockers, canAdvertise, complianceRows,
  byUrgency, summary, adDisclosure, falState, spanState, REGA_LINKS, DEFAULT_CONTRACT_DAYS,
} from '../js/util/rega.js';
const ok = (n, c, x = '') => console.log(`${c ? 'PASS' : 'FAIL'} — ${n}${x ? ' :: ' + x : ''}`);
const DAY = 86400000;
const NOW = Date.parse('2026-09-15T00:00:00Z');
const ago = (d) => new Date(NOW - d * DAY).toISOString();
const inD = (d) => new Date(NOW + d * DAY).toISOString();
const at = { now: NOW };

/* ===== مدّة العقد: تسعون يومًا حين لا تُذكر ===== */
console.log('--- ٤٠. مدّة العقد ---');
ok('المدّة النظامية حين لا تُذكر = ٩٠ يومًا', DEFAULT_CONTRACT_DAYS === 90, String(DEFAULT_CONTRACT_DAYS));
const noDays = contractState({ agreementSignedAt: ago(10) }, at);
ok('عقدٌ بلا مدّةٍ مسجَّلة يُحسب بتسعين', noDays.span === 90 && noDays.days === 80, `${noDays.span} · ${noDays.days}`);
const own = contractState({ agreementSignedAt: ago(10), agreementDays: 30 }, at);
ok('ومدّةُ العقد نفسه تسبق الافتراضية', own.span === 30 && own.days === 20, `${own.span} · ${own.days}`);
ok('وعقدٌ مضى عليه أكثر من مدّته: انتهى', contractState({ agreementSignedAt: ago(120) }, at).state === 'expired');
ok('وينتهي تلقائيًّا ولو لم تتمّ الصفقة', contractState({ agreementSignedAt: ago(91) }, at).days === -1,
  String(contractState({ agreementSignedAt: ago(91) }, at).days));
ok('وما قارب يُسمّى «ينتهي قريبًا»', contractState({ agreementSignedAt: ago(80) }, at).state === 'soon');
ok('ولا توقيع = لا عقد', contractState({}, at).state === 'none');
ok('وتاريخٌ فاسد لا ينفجر', contractState({ agreementSignedAt: 'ليس تاريخًا' }, at).state === 'none');

/* ===== ترخيص الإعلان ===== */
console.log('\n--- ٤٠. ترخيص الإعلان ---');
ok('لا رقم = لا ترخيص', adLicenseState({ adLicense: { number: '' } }, at).state === 'none');
ok('ترخيصٌ سارٍ', adLicenseState({ adLicense: { number: 'A1', expiresAt: inD(60) } }, at).state === 'active');
ok('ومنتهٍ', adLicenseState({ adLicense: { number: 'A1', expiresAt: ago(1) } }, at).state === 'expired');
const undated = adLicenseState({ adLicense: { number: 'A1' } }, at);
ok('وترخيصٌ بلا تاريخ انتهاء يُعدّ ساريًا ويُوسَم بأنّ مدّته غير مسجَّلة', undated.state === 'active' && undated.undated === true);

/* ===== ما يمنع الإعلان — بترتيب النظام ===== */
console.log('\n--- ٤٠. ما يمنع الإعلان ---');
const clean = {
  captureStatus: 'approved', status: 'agreed',
  agreementSignedAt: ago(5), agreementDays: 90, agreementNumber: 'WS-1001',
  agreementScopes: ['sell', 'market'],
  adLicense: { number: 'AD-7788', expiresAt: inD(60) },
};
ok('عقارٌ مستوفٍ: لا مانع', adBlockers(clean, at).length === 0, adBlockers(clean, at).map((b) => b.key).join('، '));
ok('ويُسمح بالإعلان عنه', canAdvertise(clean, at));

const keys = (p) => adBlockers(p, at).map((b) => b.key);
ok('بلا عقد: يُمنع ويُقال لماذا', keys({ ...clean, agreementSignedAt: null }).includes('noContract'));
ok('بعقدٍ منتهٍ: يُمنع', keys({ ...clean, agreementSignedAt: ago(200) }).includes('contractExpired'));
ok('**ونطاقٌ بلا تسويق يمنع الترخيص** — وهذا نصّ النظام',
  keys({ ...clean, agreementScopes: ['sell'] }).includes('noMarketScope'));
ok('ورقم العقد الموثَّق إن غاب يُقال (النظام يوجب إيداع نسخته)',
  keys({ ...clean, agreementNumber: '' }).includes('noContractNumber'));
ok('وبلا ترخيص: مخالفة', keys({ ...clean, adLicense: null }).includes('noLicense'));
ok('وبترخيصٍ منتهٍ: يُمنع', keys({ ...clean, adLicense: { number: 'A', expiresAt: ago(2) } }).includes('licenseExpired'));
ok('ولا يُقال «نطاقه لا يشمل التسويق» لمن لا عقد له أصلًا (سببٌ واحد لا اثنان)',
  !keys({ ...clean, agreementSignedAt: null }).includes('noMarketScope'));

ok('ولكل مانعٍ اسمٌ قصير وجملةٌ كاملة — القصيرُ للجدول والكاملُ للشرح',
  adBlockers({ ...clean, agreementSignedAt: null }, at).every((b) => b.short && b.text && b.short.length < b.text.length),
  JSON.stringify(adBlockers({ ...clean, agreementSignedAt: null }, at).map((b) => b.short)));

/* ===== الصفوف والخلاصة ===== */
console.log('\n--- ٤٠. الخلاصة ---');
const props = [
  clean,
  { captureStatus: 'approved', status: 'agreed' }, // لا عقد ولا ترخيص
  { captureStatus: 'approved', status: 'agreed', agreementSignedAt: ago(85), agreementNumber: 'W2', agreementScopes: ['market'], adLicense: { number: 'L2', expiresAt: inD(3) } },
  { captureStatus: 'approved', status: 'sold', agreementSignedAt: ago(300) }, // مستقرّ
  { captureStatus: 'extracted', status: 'agreed' }, // غير معتمد
];
const rows = complianceRows(props, at);
ok('غير المعتمد لا يدخل أصلًا', rows.length === 4, String(rows.length));
const s = summary(rows);
ok('والمستقرّ (مبيع) خارج كل عدّ', s.total === 3 && s.settled === 1, JSON.stringify([s.total, s.settled]));
ok('بلا عقد: واحد', s.noContract === 1, String(s.noContract));
ok('عقدٌ يوشك: واحد', s.contractExpiring === 1, String(s.contractExpiring));
ok('ترخيصٌ يوشك: واحد', s.licenseExpiring === 1, String(s.licenseExpiring));
ok('بلا ترخيص: واحد', s.noLicense === 1, String(s.noLicense));
// ما «يوشك» ما زال ساريًا، فالإعلان به نظاميٌّ اليوم — التنبيه تذكيرٌ لا منع.
ok('والصالح للإعلان: اثنان (والمقارب انتهاؤه منهما — سريانه لم ينقضِ بعد)', s.advertisable === 2, String(s.advertisable));
ok('لكنّه يُنبَّه عليه في «يوشك» فلا يفاجئك انتهاؤه', s.contractExpiring + s.licenseExpiring === 2,
  `${s.contractExpiring} + ${s.licenseExpiring}`);

const urgent = byUrgency(rows);
ok('الأعجل أوّلًا: ما يوشك قبل ما هو سارٍ', urgent[0].contract.state !== 'active', urgent.map((r) => r.contract.state).join('، '));

/* ===== سطر الإفصاح في الإعلان ===== */
console.log('\n--- ٤٠. سطر الإعلان ---');
const line = adDisclosure(clean, { licenseNumber: 'FAL-5', name: 'مكتب كسّاب' });
ok('يذكر رقم الترخيص', line.includes('AD-7788'), line);
ok('ورخصة فال واسم المكتب', line.includes('FAL-5') && line.includes('مكتب كسّاب'), line);
ok('**ولا يُكتب سطرٌ يوهم بترخيصٍ لا وجود له**', adDisclosure({ adLicense: null }, { name: 'مكتب' }) === '');

/* ===== رخصة فال للمنشأة ===== */
console.log('\n--- ٤٠. رخصة فال ---');
ok('بلا رقم: غير مسجَّلة', falState({}).state === 'none');
ok('ومنتهيةٌ تُعرف', falState({ licenseNumber: 'F1', licenseExpiresAt: ago(1) }, at).state === 'expired');
ok('وبلا تاريخ انتهاء تُعدّ سارية وتُوسَم', falState({ licenseNumber: 'F1' }).undated === true);

/* ===== الروابط الرسمية ===== */
console.log('\n--- ٤٠. الروابط ---');
ok('كل رابطٍ على نطاق الهيئة وبـhttps', REGA_LINKS.every((l) => /^https:\/\/[^/]*rega\.gov\.sa\//.test(l.url)),
  REGA_LINKS.map((l) => l.url).find((u) => !/^https:\/\/[^/]*rega\.gov\.sa\//.test(u)) || '');
ok('ولكلٍّ اسمٌ وشرحٌ لما يفعله', REGA_LINKS.every((l) => l.label && l.what));
ok('وفيها الإصدار والاستعلام معًا', REGA_LINKS.some((l) => l.key === 'issueAd') && REGA_LINKS.some((l) => l.key === 'checkAd'));

/* ===== انتهاء الترخيص في التقويم ===== */
console.log('\n--- ٤٠. الترخيص في التقويم ---');
const { monthEvents, EVENT_KINDS } = await import('../js/util/calendar.js');
ok('التقويم يعرف نوع «نهاية ترخيص إعلان»', !!EVENT_KINDS.adLicense, Object.keys(EVENT_KINDS).join('، '));
const ev = monthEvents({
  properties: [{ id: 'p1', adLicense: { number: 'AD-1', expiresAt: '2026-09-20T00:00:00Z' } }],
  propertyLabel: () => 'فلة النرجس',
  agreementEnd: () => null,
}, { year: 2026, month: 8 });
const licEv = ev.events.find((e) => e.kind === 'adLicense');
ok('وترخيصٌ ينتهي في الشهر يظهر فيه', !!licEv, JSON.stringify(ev.events.map((e) => e.kind)));
ok('باسم عقاره ورقمه', licEv.title.includes('فلة النرجس') && licEv.meta.includes('AD-1'), `${licEv.title} · ${licEv.meta}`);
ok('ورابطُه إلى صفحة العقود والتراخيص', licEv.href === '#/rega', String(licEv.href));
ok('وترخيصٌ بلا تاريخ انتهاء لا يُخترع له موعد',
  monthEvents({ properties: [{ id: 'p', adLicense: { number: 'X' } }], agreementEnd: () => null }, { year: 2026, month: 8 })
    .events.filter((e) => e.kind === 'adLicense').length === 0);

/* الفراغ */
ok('لا عقارات: خلاصةٌ صفريّة لا خطأ', summary([]).total === 0 && complianceRows().length === 0 && spanState(null).state === 'none');

/* ===== المرحلة ٤٨ — ما ينتهي خلال شهر ===== */
const R48 = await import('../js/util/rega.js');
const NOW48 = Date.parse('2026-09-15T00:00:00Z');
const at48 = (d) => new Date(NOW48 + d * 86400000).toISOString();
const prop = (id, days, extra = {}) => ({
  id, captureStatus: 'approved', status: 'available',
  adLicense: days == null ? null : { number: `L${id}`, expiresAt: at48(days) },
  ...extra,
});

const base = { properties: [prop('a', 5), prop('b', -3), prop('c', 200), prop('d', null)], now: NOW48 };
const e1 = R48.expiryAlerts(base);
ok('ما يوشك وما انتهى وحدهما يدخلان التنبيه', e1.rows.length === 2, e1.rows.map((r) => r.property.id).join('،'));
ok('وما بقي له مئتا يوم لا ينبّه', !e1.rows.some((r) => r.property.id === 'c'));
ok('وبلا ترخيصٍ أصلًا ليس انتهاءً — تلك ثغرةٌ تُعرض لا تنبيهٌ يوميّ', !e1.rows.some((r) => r.property.id === 'd'));
ok('والمنتهي أوّلًا', e1.rows[0].property.id === 'b', e1.rows[0].property.id);
ok('ويُعدّ المنتهي والموشك كلٌّ على حدة', e1.expired === 1 && e1.soon === 1, JSON.stringify([e1.expired, e1.soon]));

const settled = R48.expiryAlerts({ properties: [prop('s', -3, { status: 'sold' }), prop('r', -3, { status: 'rented' })], now: NOW48 });
ok('والمبيعُ والمؤجَّر لا يُلاحَقان', settled.rows.length === 0);
const pending = R48.expiryAlerts({ properties: [prop('p', -3, { captureStatus: 'pending' })], now: NOW48 });
ok('وما لم يُعتمد بعد كذلك', pending.rows.length === 0);

/* المنشورُ بترخيصٍ منتهٍ مخالفةٌ قائمةٌ لا خطرٌ مستقبليّ */
const pub = R48.expiryAlerts({ ...base, publishedIds: new Set(['b', 'c']) });
ok('والمنشورُ يُعلَّم', pub.rows.find((r) => r.property.id === 'b').published === true);
ok('وغيرُ المنشور لا', pub.rows.find((r) => r.property.id === 'a').published === false);
ok('ويُعدّ المنشورُ بترخيصٍ منتهٍ وحده', pub.publishedExpired === 1, String(pub.publishedExpired));

/* فال */
const falSoon = R48.expiryAlerts({ company: { licenseNumber: '123', licenseExpiresAt: at48(9) }, now: NOW48 });
ok('فالٌ توشك تدخل التنبيه', falSoon.fal?.state === 'soon', String(falSoon.fal?.state));
const falOk = R48.expiryAlerts({ company: { licenseNumber: '123', licenseExpiresAt: at48(300) }, now: NOW48 });
ok('وفالٌ بعيدةُ الأجل لا تُزعج', falOk.fal === null);
const falNone = R48.expiryAlerts({ company: {}, now: NOW48 });
ok('وبلا تاريخٍ مسجَّلٍ لا يُخمَّن أجل', falNone.fal === null && falNone.worst === 'none');
const falDead = R48.expiryAlerts({ company: { licenseNumber: '1', licenseExpiresAt: at48(-1) }, properties: [prop('a', 200)], now: NOW48 });
ok('وفالٌ منتهيةٌ تجعل الحالَ أشدَّ ولو كانت التراخيص سارية', falDead.worst === 'expired', falDead.worst);
ok('وموشكٌ بلا منتهٍ = تنبيهٌ لا إنذار', R48.expiryAlerts(base).worst === 'expired'
  && R48.expiryAlerts({ properties: [prop('a', 5)], now: NOW48 }).worst === 'soon');
ok('ولا شيء = لا شيء', R48.expiryAlerts({}).worst === 'none' && R48.expiryAlerts({}).rows.length === 0);

/* الموشك قبل النشر */
ok('ترخيصٌ يوشك يُقال قبل النشر', R48.expiringSoon(prop('x', 4), { now: NOW48 })?.days === 4);
ok('والساري لا يُقال', R48.expiringSoon(prop('x', 200), { now: NOW48 }) === null);
ok('والمنتهي ليس «يوشك» — ذاك مانعٌ لا تنبيه', R48.expiringSoon(prop('x', -1), { now: NOW48 }) === null);
ok('وبلا ترخيصٍ لا شيء', R48.expiringSoon(prop('x', null), { now: NOW48 }) === null);
