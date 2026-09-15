// اختبار وحدة (المرحلة ٣٥): شهادة السوق، ورحلة السعر، والطلبات العائدة، وفتحات القوائم،
// ووقت الاتصال، وكلفة المصدر.
import { propertyEvidence, priceDrops, discountEffect, MIN_SAMPLE } from '../js/util/property-evidence.js';
import { revivedRequests } from '../js/util/revived-requests.js';
import { openedNotCalled } from '../js/util/list-opens.js';
import { callFit, orderByCallTime, noShowCounts, windowAt } from '../js/util/call-timing.js';
import { sourceReport } from '../js/util/sources.js';
import { buildMatchIndex } from '../js/data/matching.js';

const ok = (n, c, x = '') => console.log(`${c ? 'PASS' : 'FAIL'} — ${n}${x ? ' :: ' + x : ''}`);
const DAY = 86400000;
const NOW = Date.parse('2026-09-15T12:00:00.000Z');
const ago = (d) => new Date(NOW - d * DAY).toISOString();

/* ===== ١. شهادة السوق على العقار ===== */
console.log('\n--- ١. شهادة السوق ---');
const property = { id: 'p1', createdAt: ago(120), price: 2000000 };
const showings = [
  { id: 's1', propertyId: 'p1', clientId: 'c1', status: 'done', impression: 'disliked', reason: 'price' },
  { id: 's2', propertyId: 'p1', clientId: 'c2', status: 'done', impression: 'disliked', reason: 'price' },
  { id: 's3', propertyId: 'p1', clientId: 'c3', status: 'done', impression: 'liked' },
  { id: 's4', propertyId: 'p1', clientId: 'c4', status: 'no_show' },
  { id: 's5', propertyId: 'p2', clientId: 'c5', status: 'done', impression: 'disliked', reason: 'area' }, // عقار آخر
];
const matches = [
  { id: 'm1', propertyId: 'p1', clientId: 'c6', status: 'not_interested', rejectReason: 'price' },
  { id: 'm2', propertyId: 'p1', clientId: 'c7', status: 'not_interested', rejectReason: 'location' },
  // هذا رآه (له معاينة) فلا يُحسب مرّتين
  { id: 'm3', propertyId: 'p1', clientId: 'c1', status: 'not_interested', rejectReason: 'condition' },
  { id: 'm4', propertyId: 'p1', clientId: 'c8', status: 'interested' }, // ليس رفضًا
  { id: 'm5', propertyId: 'p2', clientId: 'c9', status: 'not_interested', rejectReason: 'price' }, // عقار آخر
];
const ev = propertyEvidence({ property, showings, matches, now: NOW });
ok('المعاينات تُرشَّح بالعقار', ev.showings.done === 3, String(ev.showings.done));
ok('و«لم يحضر» يُحصى وحده', ev.showings.noShow === 1, String(ev.showings.noShow));
ok('والانطباعات تُعدّ', ev.showings.liked === 1 && ev.showings.disliked === 2,
  `${ev.showings.liked}/${ev.showings.disliked}`);
ok('من رآه ثم رفض شهادةٌ على العقار', ev.seenReasons[0]?.[0] === 'price' && ev.seenReasons[0][1] === 2,
  JSON.stringify(ev.seenReasons));
ok('ومن رفض قبل أن يرى شهادةٌ على الإعلان', ev.unseenReasons.length === 2,
  JSON.stringify(ev.unseenReasons));
ok('ومن رآه لا يُحسب في الثانية', !ev.unseenReasons.some(([k]) => k === 'condition'),
  JSON.stringify(ev.unseenReasons));
ok('والاعتراض الغالب هو الأكثر', ev.dominant?.key === 'price' && ev.dominant.count === 3,
  JSON.stringify(ev.dominant));
ok('والعيّنة تكفي للحكم', ev.enough === true, String(ev.opinions));
ok('وأيام السوق محسوبة', ev.daysListed === 120, String(ev.daysListed));

// عيّنة لا تكفي: لا حكم
const thin = propertyEvidence({
  property, now: NOW,
  showings: [{ propertyId: 'p1', clientId: 'x', status: 'done', impression: 'disliked', reason: 'price' }],
  matches: [],
});
ok('ولا حكمَ دون العيّنة', thin.enough === false && thin.opinions < MIN_SAMPLE, String(thin.opinions));

// لا اعتراض غالب حين تتفرّق الأسباب
const split = propertyEvidence({
  property, now: NOW, showings: [], matches: [
    { propertyId: 'p1', clientId: 'a', status: 'not_interested', rejectReason: 'price' },
    { propertyId: 'p1', clientId: 'b', status: 'not_interested', rejectReason: 'area' },
    { propertyId: 'p1', clientId: 'c', status: 'not_interested', rejectReason: 'location' },
    { propertyId: 'p1', clientId: 'd', status: 'not_interested', rejectReason: 'condition' },
  ],
});
ok('وأسبابٌ متفرّقة لا تعطي حكمًا', split.dominant === null, JSON.stringify(split.allReasons));
ok('وعقارٌ بلا شيء لا ينفجر', propertyEvidence({ property: { id: 'z' } }).opinions === 0);

/* ===== ٢. رحلة السعر ===== */
console.log('\n--- ٢. رحلة السعر ---');
const withHistory = {
  id: 'p9',
  priceHistory: [
    { at: ago(90), price: 2000000 },
    { at: ago(60), price: 1900000 }, // تخفيض ٥٪
    { at: ago(40), price: 2100000 }, // ارتفاع — ليس تخفيضًا
    { at: ago(20), price: 1800000 }, // تخفيض
  ],
};
const drops = priceDrops(withHistory);
ok('الارتفاع ليس تخفيضًا', drops.length === 2, String(drops.length));
ok('ونسبة التخفيض محسوبة', Math.round(drops[0].cut * 100) === 5, String(drops[0].cut));
ok('وبلا تاريخ لا تخفيض', priceDrops({ id: 'x' }).length === 0);

const eff = discountEffect({
  properties: [
    withHistory,
    { id: 'p10', priceHistory: [{ at: ago(50), price: 1000000 }, { at: ago(30), price: 900000 }] },
    { id: 'p11', priceHistory: [{ at: ago(50), price: 1000000 }, { at: ago(5), price: 900000 }] }, // التخفيض بعد الصفقة
    { id: 'p12', priceHistory: [] }, // بيع بلا تخفيض
  ],
  deals: [
    { propertyId: 'p9', date: ago(10) },
    { propertyId: 'p10', date: ago(20) },
    { propertyId: 'p11', date: ago(10) },
    { propertyId: 'p12', date: ago(10) },
  ],
});
ok('كل المبيع يُحصى', eff.sold === 4, String(eff.sold));
// المحتسَب اثنان: p9 وp10 خُفّضا قبل صفقتهما. وp11 خُفّض **بعد** صفقته فيسقط،
// وp12 بيع بلا تخفيض أصلًا. والأربعة كلها في `sold`.
ok('ولا يُنسب إلى تخفيضٍ جاء بعد الصفقة', eff.soldAfterCut === 2, String(eff.soldAfterCut));
ok('ووسيط الأيام محسوب', Number.isFinite(eff.medianDays), String(eff.medianDays));
ok('ووسيط النسبة محسوب', Number.isFinite(eff.medianCut), String(eff.medianCut));
ok('وبلا صفقات لا رقم', discountEffect({ properties: [withHistory], deals: [] }).sample === 0);

/* ===== ٣. طلبات عادت ===== */
console.log('\n--- ٣. طلبات عادت ---');
const settings = {
  weights: { district: 40, price: 35, area: 25 },
  price: { percent: 12, minSale: 100000, minRent: 10000, minInvestment: 100000 },
  area: { percent: 15, minSqm: 50 },
  minScore: 50, excludeOwnProperties: false,
};
const listing = (id, createdAt) => ({
  id, createdAt, captureStatus: 'approved', status: 'available',
  city: 'الرياض', district: 'النرجس', type: 'villa', purposes: ['sale'], area: 400, price: 2000000,
});
const fresh = listing('new1', ago(10));   // دخل بعد الإغلاق
const oldOne = listing('old1', ago(300)); // كان موجودًا قبل الإغلاق
const mkCtx = (properties) => ({
  settings, properties, externals: [], clients: [], requests: [], zonesByCity: {},
  matchIndex: buildMatchIndex({ properties, externals: [] }),
});
const closedReq = {
  id: 'r1', clientId: 'c1', status: 'paused', city: 'الرياض', districts: ['النرجس'],
  type: 'villa', purpose: 'sale', budgetMax: 2100000, area: 400, updatedAt: ago(60),
};
const revived = revivedRequests({ requests: [closedReq], ctx: mkCtx([fresh, oldOne]), now: NOW });
ok('الطلب الموقوف يُطابَق', revived.length === 1, String(revived.length));
ok('ولا يُحتسب إلا الجديد بعد الإغلاق', revived[0]?.candidates.every((c) => c.listing.id === 'new1'),
  revived[0]?.candidates.map((c) => c.listing.id).join(',') || '');
ok('وشهور الغياب محسوبة', revived[0]?.monthsAgo === 2, String(revived[0]?.monthsAgo));
ok('والطلب النشط ليس من هؤلاء',
  revivedRequests({ requests: [{ ...closedReq, status: 'active' }], ctx: mkCtx([fresh]), now: NOW }).length === 0);
ok('وما تجاوز النافذة يسقط',
  revivedRequests({ requests: [{ ...closedReq, updatedAt: ago(500) }], ctx: mkCtx([fresh]), now: NOW }).length === 0);
ok('ومخزونٌ قديم وحده لا يوقظ طلبًا',
  revivedRequests({ requests: [closedReq], ctx: mkCtx([oldOne]), now: NOW }).length === 0);
// «مُنجز» صفقةٌ تمّت: صاحبه اشترى، ومكالمةٌ تعرض عليه ما اشتراه مثله إساءةٌ لا فرصة.
ok('والمُنجز لا يُوقَظ — صاحبه اشترى',
  revivedRequests({ requests: [{ ...closedReq, status: 'done' }], ctx: mkCtx([fresh]), now: NOW }).length === 0);
ok('وبلا سياق لا ينفجر', revivedRequests({ requests: [closedReq] }).length === 0);

/* ===== ٤. فتح قائمته ولم يتصل ===== */
console.log('\n--- ٤. فتحات القوائم ---');
const clients = [
  { id: 'c1', name: 'فهد' },
  { id: 'c2', name: 'نورة' },
  { id: 'c3', name: 'ممنوع', doNotContact: true },
];
const opened = openedNotCalled({
  lists: [
    { clientId: 'c1', opens: 4, lastOpenAt: ago(1) },
    { clientId: 'c2', opens: 2, lastOpenAt: ago(2) },  // كلّمتَه بعدها
    { clientId: 'c3', opens: 9, lastOpenAt: ago(1) },  // لا تتصل
    { clientId: 'c1', opens: 0, lastOpenAt: null },    // لم يُفتح
    { clientId: 'c2', opens: 3, lastOpenAt: ago(40) }, // خارج النافذة
  ],
  clients,
  contactsByClient: new Map([['c2', ago(1)]]),
  now: NOW,
});
ok('من فتح ولم تكلّمه يظهر', opened.length === 1 && opened[0].client.id === 'c1',
  opened.map((o) => o.client?.id).join(','));
ok('ومن كلّمتَه بعد فتحه لا يظهر', !opened.some((o) => o.client?.id === 'c2'));
ok('ومن طلب ألّا تتصل لا يظهر', !opened.some((o) => o.client?.id === 'c3'));
ok('والأكثر فتحًا أولًا', openedNotCalled({
  lists: [{ clientId: 'c2', opens: 1, lastOpenAt: ago(1) }, { clientId: 'c1', opens: 7, lastOpenAt: ago(3) }],
  clients, now: NOW,
})[0].client.id === 'c1');
ok('وبلا قوائم لا ينفجر', openedNotCalled({}).length === 0);

/* ===== ٥. وقت الاتصال وعدم الحضور ===== */
console.log('\n--- ٥. وقت الاتصال ---');
const at = (h) => new Date(2026, 8, 15, h, 0, 0).getTime();
ok('الفترة تُعرف من الساعة', windowAt(at(9)) === 'morning' && windowAt(at(14)) === 'afternoon' && windowAt(at(19)) === 'evening',
  `${windowAt(at(9))}/${windowAt(at(14))}/${windowAt(at(19))}`);
ok('وخارج الفترات لا فترة', windowAt(at(3)) === null, String(windowAt(at(3))));
ok('من وقتُه الآن', callFit({ bestTime: 'evening' }, at(19)) === 'now');
ok('ومن ليس وقته', callFit({ bestTime: 'morning' }, at(19)) === 'later');
ok('ومن لا تفضيل له لا يُقدَّم ولا يُؤخَّر', callFit({}, at(19)) === 'unknown');
ok('وخارج الساعات كلّها لا أحد وقته', callFit({ bestTime: 'evening' }, at(3)) === 'later');

const rows = [
  { client: { id: 'a', bestTime: 'morning' } },
  { client: { id: 'b' } },
  { client: { id: 'c', bestTime: 'evening' } },
  { client: { id: 'd' } },
];
const ordered = orderByCallTime(rows, (r) => r.client, at(19)).map((r) => r.client.id);
ok('من وقتُه الآن يتقدّم', ordered[0] === 'c', ordered.join(','));
// ولا يُؤخَّر أحد: «a» يفضّل الصباح والوقت مساء، ومع ذلك يبقى في موضعه الأصلي — فاللوحة
// تعرض ثمانية من قائمةٍ أطول، وتأخيرُ من «ليس وقته» قد يُسقط أشدّ الناس تأخّرًا.
ok('ولا يُؤخَّر من ليس وقته', ordered.join(',') === 'c,a,b,d', ordered.join(','));

const misses = noShowCounts([
  { clientId: 'c1', status: 'no_show' }, { clientId: 'c1', status: 'no_show' },
  { clientId: 'c2', status: 'done' }, { clientId: null, status: 'no_show' },
]);
ok('عدم الحضور يُحصى لكل عميل', misses.get('c1') === 2 && !misses.has('c2'), JSON.stringify([...misses]));

/* ===== ٦. كلفة المصدر ===== */
console.log('\n--- ٦. كلفة المصدر ---');
const rep = sourceReport({
  clients: [
    { id: 'c1', referralSource: 'سناب' }, { id: 'c2', referralSource: 'سناب' },
    { id: 'c3', referralSource: 'إحالة' },
  ],
  requests: [],
  deals: [
    { clientId: 'c1', commission: 50000 },
    { clientId: 'c3', commission: 30000 },
  ],
  expenses: [
    { source: 'سناب', amount: 40000 },
    { source: 'سناب', amount: 5000 },
    { source: '', amount: 9999 }, // بلا وسم: لا يُقسَّم تخمينًا
  ],
});
const snap = rep.rows.find((r) => r.source === 'سناب');
const ref = rep.rows.find((r) => r.source === 'إحالة');
ok('المصروف الموسوم يُجمع', snap.spent === 45000, String(snap.spent));
ok('والصافي عمولة ناقص كلفة', snap.net === 5000, String(snap.net));
ok('والمصدر بلا صرف صافيه عمولته', ref.spent === 0 && ref.net === 30000, `${ref.spent}/${ref.net}`);
ok('والترتيب بالصافي لا بالعمولة', rep.rows[0].source === 'إحالة', rep.rows.map((r) => r.source).join(','));
ok('وكلفة الصفقة محسوبة', snap.costPerDeal === 45000, String(snap.costPerDeal));
ok('والمصروف بلا وسم لا يدخل مصدرًا', rep.totals.spent === 45000, String(rep.totals.spent));
