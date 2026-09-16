// اختبار وحدة (المرحلة ٤٧): ما تغيّر في عروضك بعد نشرها، وأوقاتُك المشغولة.
import { publishDrift, publishFingerprint, busyTimes } from '../js/util/publish-drift.js';

const ok = (n, c, x = '') => console.log(`${c ? 'PASS' : 'FAIL'} — ${n}${x ? ' :: ' + x : ''}`);
const P = (id, extra = {}) => ({ id, type: 'villa', district: 'الياسمين', city: 'الرياض', status: 'agreed', price: 2000000, ...extra });

/* ===== البصمة: الحالةُ والسعرُ وحدهما ===== */
const fp = publishFingerprint([P('a'), P('b', { price: null })]);
ok('البصمةُ تحفظ الحالة والسعر', fp[0][1].status === 'agreed' && fp[0][1].price === 2000000);
ok('والسعرُ الغائب يُحفظ غيابًا لا صفرًا', fp[1][1].price === null);
ok('ولا تحفظ سواهما', Object.keys(fp[0][1]).sort().join(',') === 'price,status');

/* ===== لا انحرافَ بلا تغيير ===== */
ok('ما لم يتغيّر لا يُذكر', publishDrift([P('a'), P('b', { price: null })], fp).length === 0);

/* ===== أُقفل بعد النشر — أخطرُها ===== */
const closed = publishDrift([P('a', { status: 'sold' })], publishFingerprint([P('a')]));
ok('المبيع بعد النشر يُكشف', closed.length === 1 && closed[0].kind === 'closed', JSON.stringify(closed[0]?.kind));
ok('والمؤجَّر مثلُه', publishDrift([P('a', { status: 'rented' })], publishFingerprint([P('a')]))[0].kind === 'closed');
ok('ومن نُشر مبيعًا وبقي مبيعًا لا يُكرَّر',
  publishDrift([P('a', { status: 'sold' })], publishFingerprint([P('a', { status: 'sold' })])).length === 0);

/* ===== السعر ===== */
const priced = publishDrift([P('a', { price: 1800000 })], publishFingerprint([P('a')]));
ok('تغيّرُ السعر يُكشف بقيمتيه', priced[0].kind === 'price' && priced[0].from === 2000000 && priced[0].to === 1800000);
ok('وإزالةُ السعر تُكشف', publishDrift([P('a', { price: null })], publishFingerprint([P('a')]))[0].to === null);
ok('وإضافتُه كذلك', publishDrift([P('a')], publishFingerprint([P('a', { price: null })]))[0].from === null);

// «بِيع» يُنهي العرض، فلا يُزاحمه «تغيّر سعره».
const both = publishDrift([P('a', { status: 'sold', price: 1 })], publishFingerprint([P('a')]));
ok('المبيعُ يغني عن تغيّر سعره', both.length === 1 && both[0].kind === 'closed');

/* ===== حُذف أو دُمج ===== */
const gone = publishDrift([], publishFingerprint([P('a')]));
ok('المحذوفُ يُكشف ورابطُه يُقال إنه معطّل', gone.length === 1 && gone[0].kind === 'gone' && gone[0].property === null);

/* ===== الترتيب: المنتهي أوّلًا ===== */
const mixed = publishDrift(
  [P('a', { price: 9 }), P('c', { status: 'sold' })],
  publishFingerprint([P('a'), P('b'), P('c')]),
);
ok('المنتهي قبل المحذوف قبل السعر', mixed.map((r) => r.kind).join(',') === 'closed,gone,price', mixed.map((r) => r.kind).join(','));

/* ===== الأوقات المشغولة ===== */
const now = Date.parse('2026-09-16T08:00:00Z');
const at = (h) => new Date(now + h * 3600000).toISOString();
const busy = busyTimes([
  { at: at(2), status: 'scheduled' },
  { at: at(1), status: 'scheduled' },
  { at: at(3), status: 'done' },          // تمّت: لا تشغل شيئًا
  { at: at(4), status: 'cancelled' },     // أُلغيت
  { at: at(-5), status: 'scheduled' },    // مضت
  { at: at(24 * 30), status: 'scheduled' }, // خارج الأفق
  { at: null, status: 'scheduled' },      // بلا موعد
], { horizonDays: 14, now });
ok('المجدولةُ وحدها تشغل الوقت', busy.length === 2, JSON.stringify(busy.map((b) => b.at)));
ok('ومرتَّبةٌ زمنيًّا', busy[0].at < busy[1].at);
ok('ولكلٍّ امتدادُه', busy.every((b) => b.minutes === 60));
ok('والامتدادُ يُضبط', busyTimes([{ at: at(1), status: 'scheduled' }], { visitMinutes: 90, now })[0].minutes === 90);
ok('ولا يخرج منها إلا وقتٌ وامتداد', busy.every((b) => Object.keys(b).sort().join(',') === 'at,minutes'));
ok('وقائمةٌ فارغة تردّ فارغة', busyTimes([], { now }).length === 0 && busyTimes(undefined, { now }).length === 0);
