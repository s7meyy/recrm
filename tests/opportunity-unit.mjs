// اختبار وحدة لحساب الفرص: الطلب غير الملبّى مقابل المخزون (دوال خالصة، بلا متصفح).
import { buildOpportunityIndex, collapseByDistrict, topOpportunities, surplusRows } from '../js/util/opportunity.js';

const ok = (n, c, x = '') => console.log(`${c ? 'PASS' : 'FAIL'} — ${n}${x ? ' :: ' + x : ''}`);

const settings = {
  weights: { district: 40, price: 35, area: 25 },
  price: { percent: 12, minSale: 100000, minRent: 10000, minInvestment: 100000 },
  area: { percent: 15, minSqm: 50 },
  minScore: 50, excludeOwnProperties: true,
};
const approved = (o) => ({ captureStatus: 'approved', source: 'manual', status: 'not_contacted', purposes: ['sale'], city: 'الرياض', ...o });
const request = (o) => ({ status: 'active', purpose: 'sale', city: 'الرياض', districtZones: [], ...o });

/* الياسمين: طلبان (أحدهما ملبّى بعقار مطابق، والآخر ميزانيته أقل بكثير فلا مرشح له) */
const ctx = {
  settings,
  clients: [{ id: 'c1', name: 'أ' }, { id: 'c2', name: 'ب' }, { id: 'c3', name: 'ج' }],
  zonesByCity: { الرياض: [{ key: 'north', label: 'شمال', districts: ['النرجس', 'العارض'] }] },
  matches: [],
  properties: [
    approved({ id: 'p1', district: 'الياسمين', type: 'villa', price: 2000000, area: 400 }),
    approved({ id: 'p2', district: 'حطين', type: 'villa', price: 3000000, area: 500 }),
    approved({ id: 'p3', district: 'حطين', type: 'villa', price: 3100000, area: 520 }),
    { ...approved({ id: 'p4', district: 'الياسمين', type: 'villa', price: 1000000, area: 300 }), captureStatus: 'captured' },
  ],
  externals: [
    { id: 'x1', status: 'active', city: 'الرياض', district: 'الياسمين', type: 'villa', purposes: ['sale'], price: 2100000, area: 410 },
    { id: 'x2', status: 'archived', city: 'الرياض', district: 'الياسمين', type: 'villa', purposes: ['sale'], price: 900000, area: 300 },
  ],
  requests: [
    request({ id: 'r1', clientId: 'c1', districts: ['الياسمين'], type: 'villa', budgetMax: 2200000, area: 380 }),
    request({ id: 'r2', clientId: 'c2', districts: ['الياسمين'], type: 'villa', budgetMax: 600000, area: 380 }),
    request({ id: 'r3', clientId: 'c3', districts: [], districtZones: ['north'], type: 'land', budgetMax: 900000, area: 500 }),
    request({ ...request({ id: 'r4', clientId: 'c1', districts: ['حطين'], type: 'villa', budgetMax: 3200000, area: 480 }), status: 'paused' }),
  ],
};

const { rows, totals, cities } = buildOpportunityIndex(ctx, { minScore: settings.minScore });
const find = (d, t) => rows.find((r) => r.district === d && r.type === t);

ok('المدن تُستخرج من البيانات', cities.includes('الرياض'), cities.join(','));

const yasmin = find('الياسمين', 'villa');
ok('الياسمين: طلبان محسوبان', yasmin.demand === 2, JSON.stringify({ demand: yasmin.demand }));
ok('الطلب الملبّى لا يُحسب فرصة، وغير الملبّى يُحسب', yasmin.unmet === 1, JSON.stringify({ unmet: yasmin.unmet }));
ok('المخزون يعدّ المعتمد فقط (الالتقاط غير المعتمد مستبعد)', yasmin.supply === 1, String(yasmin.supply));
ok('العرض الخارجي النشط يُعدّ سوقًا، والمؤرشف لا', yasmin.market === 1, String(yasmin.market));
ok('الفجوة = غير الملبّى − المخزون', yasmin.gap === 0, String(yasmin.gap));
ok('صف الفرصة يحمل الطلبات نفسها للاتصال بأصحابها', yasmin.requests.length === 1 && yasmin.requests[0].id === 'r2', JSON.stringify(yasmin.requests.map((r) => r.id)));

/* النطاق يُوسَّع إلى أحيائه: طلب أرض بلا مخزون في النرجس والعارض */
const narjis = find('النرجس', 'land');
const arid = find('العارض', 'land');
ok('نطاق الأحياء يُوسَّع فيظهر العجز في كل حي فيه', narjis?.unmet === 1 && arid?.unmet === 1, JSON.stringify({ n: narjis?.unmet, a: arid?.unmet }));

/* الطلب الموقوف لا يُحسب */
ok('الطلب الموقوف لا يدخل الحساب إطلاقًا', !find('حطين', 'villa')?.demand, JSON.stringify(find('حطين', 'villa')));

/* التخمة: حطين فيها عقاران بلا طلب نشط */
const surplus = surplusRows(rows);
ok('التخمة تكشف المخزون الراكد بلا طلب', surplus.some((r) => r.district === 'حطين' && r.supply === 2), JSON.stringify(surplus.map((r) => `${r.district}:${r.supply}`)));

/* الإجماليات والدمج */
ok('إجمالي الطلب غير الملبّى صحيح', totals.unmet === 3, JSON.stringify(totals));
const collapsed = collapseByDistrict(rows);
const yasminAll = collapsed.find((r) => r.district === 'الياسمين');
ok('الدمج بالحي يجمع الأنواع في صف واحد', yasminAll.demand === 2 && yasminAll.supply === 1 && yasminAll.type === '');
const top = topOpportunities(rows, 2);
ok('أعلى الفرص مرتّبة بالعجز تنازليًا', top.length === 2 && top.every((r) => r.unmet > 0), JSON.stringify(top.map((r) => `${r.district}:${r.unmet}`)));

/* حالة فارغة */
const empty = buildOpportunityIndex({ settings, clients: [], requests: [], properties: [], externals: [], zonesByCity: {} }, { minScore: 50 });
ok('قاعدة فارغة لا تُخرج صفوفًا ولا تنهار', empty.rows.length === 0 && empty.totals.unmet === 0);

/* طلب بلا حي محدَّد («أي حي») لا يفتعل عجزًا */
const anyDistrict = buildOpportunityIndex({
  ...ctx, requests: [request({ id: 'r9', clientId: 'c1', districts: [], type: 'villa', budgetMax: 100000 })],
}, { minScore: settings.minScore });
ok('طلب بلا حي محدَّد لا يُنسب إلى حي ولا يفتعل عجزًا',
  anyDistrict.rows.every((r) => r.unmet === 0), JSON.stringify(anyDistrict.rows.map((r) => `${r.district}:${r.unmet}`)));
