// المرحلة ٥٢: مرجّحاتُ الترتيب — لماذا لم تعد القائمةُ كلُّها ١٠٠٪؟
import { scoreListing, tiebreakersFor, TIEBREAKS, TIEBREAK_MAX } from '../js/data/matching.js';

let pass = 0; let fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log(`PASS — ${n}`); } else { fail++; console.log(`FAIL — ${n}${x ? ' :: ' + x : ''}`); } };

const settings = {
  weights: { district: 30, price: 40, area: 30, rooms: 0 },
  price: { minSale: 50000, minRent: 2000, minInvestment: 50000, percent: 10 },
  area: { minSqm: 50, percent: 10 },
  minScore: 50, excludeOwnProperties: false,
};
const request = { type: 'villa', purpose: 'buy', city: 'الرياض', districts: ['حطين'], budgetMax: 3000000, area: 400 };
const districts = ['حطين'];
const NOW = Date.parse('2026-09-20T00:00:00Z');
const villa = (o) => ({ id: o.id || 'x', type: 'villa', purposes: ['buy'], city: 'الرياض', district: 'حطين', images: ['i1'], updatedAt: '2026-09-15', ...o });
const score = (o) => scoreListing(request, villa(o), { settings, districts, now: NOW });

console.log('--- ١. ما كان يستوي صار يترتّب ---');
const perfect = score({ price: 2900000, area: 420 });
const cheap = score({ price: 1200000, area: 420 });
const huge = score({ price: 2900000, area: 900 });
const blind = score({ price: 2900000, area: 420, images: [] });
const stale = score({ price: 2900000, area: 420, updatedAt: '2026-01-15' });
ok('المعروضُ الموافقُ تمامًا يبقى ١٠٠٪', perfect.score === 100, String(perfect.score));
ok('**والأربعةُ التي كانت تساويه صارت دونه**',
  [cheap, huge, blind, stale].every((r) => r.base === 100 && r.score < 100),
  [cheap, huge, blind, stale].map((r) => `${r.base}→${r.score}`).join(' · '));
ok('ولا يتساوى اثنان منها إلا بسببٍ واحد',
  new Set([cheap.score, huge.score, stale.score]).size >= 2,
  [cheap.score, huge.score, stale.score].join(' · '));

console.log('\n--- ٢. لكلّ حسمٍ سببٌ مكتوب ---');
ok('السببُ يُذكر مع المقدار', cheap.nudges[0]?.detail?.length > 5 && cheap.nudges[0].lost > 0, JSON.stringify(cheap.nudges));
ok('«بلا صورة» تُقال صراحةً', blind.nudges.some((n) => n.key === 'media' && n.detail.includes('صورة')), JSON.stringify(blind.nudges));
ok('والقديمُ يُقال كم مضى عليه', stale.nudges.some((n) => n.key === 'fresh' && /يوم/.test(n.detail)), JSON.stringify(stale.nudges));
ok('والموافقُ تمامًا بلا حسمٍ أصلًا', perfect.nudges.length === 0, JSON.stringify(perfect.nudges));
ok('ولكلّ مرجّحٍ اسمٌ عربيٌّ وسقفٌ موجب', TIEBREAKS.every((t) => t.label && t.max > 0) && TIEBREAK_MAX === 12, String(TIEBREAK_MAX));

console.log('\n--- ٣. ترتّبُ ولا تُسقط ---');
// **العطبُ الذي تُحرسه هذه الحزمة**: لو حُسمت النقاطُ بلا حدّ لاختفى من قائمتك معروضٌ
// مناسبٌ لأنّه بلا صورة. فالحسمُ يقف عند حدّ العرض ولا يتجاوزه.
const weak = { ...request, districts: [] };
const borderline = scoreListing({ ...weak, budgetMax: 3000000, area: 400 },
  villa({ price: 3200000, area: 300, images: [], updatedAt: '2025-01-01' }),
  { settings: { ...settings, price: { ...settings.price, percent: 40 }, area: { ...settings.area, percent: 40 } }, districts: [], now: NOW });
ok('**لا يهبط معروضٌ تحت حدّ العرض بسبب مرجّح**',
  !borderline.ok || borderline.score >= Math.min(borderline.base, settings.minScore),
  `${borderline.base} → ${borderline.score}`);
const already = scoreListing(request, villa({ price: 2900000, area: 300, images: [] }),
  { settings, districts: ['النرجس'], now: NOW });
ok('وما كان تحت الحدّ أصلًا يُترك كما هو', already.ok ? (already.base > settings.minScore || already.score === already.base) : true,
  `${already.base} → ${already.score}`);

console.log('\n--- ٤. ما لا يميّز لا يُحسب ---');
ok('الزيادةُ اليسيرةُ في المساحة لا تُحسم',
  tiebreakersFor(request, villa({ price: 2900000, area: 440 }), { now: NOW }).every((n) => n.key !== 'area'));
ok('**ومن حدّ أرضيّةً فبيانُه أصدقُ من ظنّنا** — فما فوقها كاملٌ',
  tiebreakersFor({ ...request, budgetMin: 1000000 }, villa({ price: 1200000, area: 420 }), { now: NOW }).every((n) => n.key !== 'price'));
ok('ولقطةُ شاشة العرض الخارجيّ صورتُه',
  tiebreakersFor(request, { ...villa({ price: 2900000, area: 420 }), images: [], screenshotImageId: 's1' }, { kind: 'external', now: NOW })
    .every((n) => n.key !== 'media'));
ok('والمعروضُ بلا تاريخٍ لا ينهار ولا يُحسم لحداثته',
  tiebreakersFor(request, { ...villa({ price: 2900000, area: 420 }), updatedAt: null, createdAt: null }, { now: NOW })
    .every((n) => n.key !== 'fresh'));
ok('وبلا ميزانيةٍ ولا مساحةٍ في الطلب لا ينهار الحساب',
  Array.isArray(tiebreakersFor({ type: 'villa', purpose: 'buy', city: 'الرياض' }, villa({ price: null, area: null }), { now: NOW })));

console.log(`\n${pass} PASS · ${fail} FAIL`);
