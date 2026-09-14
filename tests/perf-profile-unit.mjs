// اختبار وحدة (المرحلة ٢٠): فهرس القواطع، والخروج المبكر، وحاسبة التمويل.
import { buildMatchIndex, candidatesFor, hasCandidate, preparePer } from '../js/data/matching.js';
import { monthlyInstallment, affordablePrice } from '../js/util/finance.js';

const ok = (n, c, x = '') => console.log(`${c ? 'PASS' : 'FAIL'} — ${n}${x ? ' :: ' + x : ''}`);

const settings = {
  weights: { district: 40, price: 35, area: 25 },
  price: { percent: 12, minSale: 100000, minRent: 10000, minInvestment: 100000 },
  area: { percent: 15, minSqm: 50 },
  minScore: 50, excludeOwnProperties: true,
};
const prop = (o) => ({ captureStatus: 'approved', status: 'not_contacted', city: 'الرياض', purposes: ['sale'], ...o });
const properties = [
  prop({ id: 'p1', district: 'النرجس', type: 'villa', price: 2000000, area: 400 }),
  prop({ id: 'p2', district: 'حطين', type: 'villa', price: 3000000, area: 500 }),
  prop({ id: 'p3', district: 'النرجس', type: 'land', price: 900000, area: 600 }),
  prop({ id: 'p4', district: 'النرجس', type: 'villa', price: 2100000, area: 410, purposes: ['rent'] }),
  prop({ id: 'p5', district: 'النرجس', type: 'villa', price: 2050000, area: 400, city: 'جدة' }),
];
const externals = [{ id: 'x1', status: 'active', city: 'الرياض', district: 'النرجس', type: 'villa', purposes: ['sale'], price: 2100000, area: 410 }];
const ctx = { settings, properties, externals, zonesByCity: {}, matchIndex: buildMatchIndex({ properties, externals }) };
const bare = { ...ctx, matchIndex: null };
const request = { id: 'r1', city: 'الرياض', districts: ['النرجس'], type: 'villa', purpose: 'sale', budgetMax: 2200000, area: 380, status: 'active' };

/* ===== الفهرس ===== */
ok('الدلو يجمع ما يجتاز القواطع الثلاثة', ctx.matchIndex.properties.get('الرياض|villa|sale').length === 2,
  String(ctx.matchIndex.properties.get('الرياض|villa|sale')?.length));
ok('العقار بغرضين يدخل دلوين', buildMatchIndex({ properties: [prop({ id: 'z', type: 'villa', purposes: ['sale', 'rent'] })] }).properties.size === 2);
ok('الناقص (بلا نوع أو غرض) لا يدخل أي دلو', buildMatchIndex({ properties: [prop({ id: 'z', type: '', purposes: [] })] }).properties.size === 0);

const withIndex = candidatesFor(request, ctx, { minScore: settings.minScore });
const without = candidatesFor(request, bare, { minScore: settings.minScore });
ok('النتيجة مطابقة بالفهرس وبدونه',
  JSON.stringify(withIndex.map((r) => r.listing.id + ':' + r.score)) === JSON.stringify(without.map((r) => r.listing.id + ':' + r.score)),
  withIndex.map((r) => r.listing.id).join(','));
ok('العرض الخارجي يدخل من دلوه', withIndex.some((r) => r.kind === 'external'));
ok('مدينة أخرى لا تدخل', !withIndex.some((r) => r.listing.id === 'p5'));

/* ===== الخروج المبكر ===== */
ok('«أله مرشح» يوافق «عدد المرشحين > صفر»', hasCandidate(request, ctx, { minScore: settings.minScore }) === (withIndex.length > 0));
const impossible = { ...request, budgetMax: 100000 };
ok('وطلب بلا مرشح يُقرأ كذلك',
  hasCandidate(impossible, ctx, { minScore: settings.minScore }) === (candidatesFor(impossible, ctx, { minScore: settings.minScore }).length > 0));
ok('ويعمل بلا فهرس كذلك', hasCandidate(request, bare, { minScore: settings.minScore }) === true);

/* ===== التهيئة لكل طلب ===== */
const pre = preparePer(request, settings, ['النرجس']);
ok('التهيئة تحمل الأحياء والمرونتين', pre.wanted.size === 1 && pre.priceFlex.value > 0 && pre.areaFlex.value > 0);

/* ===== حاسبة التمويل ===== */
const m = monthlyInstallment({ price: 1000000, downPayment: 100000, annualRate: 5, years: 20 });
ok('القسط بمعادلة القسط الثابت', Math.round(m.monthly) === 5940, String(Math.round(m.monthly)));
ok('مبلغ التمويل = السعر − الدفعة', m.principal === 900000);
ok('كلفة التمويل = الإجمالي − الأصل', Math.round(m.cost) === Math.round(m.total - m.principal));
ok('بلا هامش قسمة بسيطة', monthlyInstallment({ price: 120000, annualRate: 0, years: 10 }).monthly === 1000);
ok('دفعة أولى ≥ السعر مرفوضة', monthlyInstallment({ price: 100000, downPayment: 100000 }) === null);
ok('سعر أو مدة صفر مرفوضة', monthlyInstallment({ price: 0 }) === null && monthlyInstallment({ price: 100, years: 0 }) === null);
const a = affordablePrice({ monthlyIncome: 15000, ratio: 33, downPayment: 100000, annualRate: 5, years: 20 });
ok('قدرة الشراء تعكس المعادلة', Math.round(a.capacity) === 4950 && a.price > a.principal, JSON.stringify({ c: Math.round(a.capacity), p: Math.round(a.price) }));
ok('دخل صفر لا قدرة', affordablePrice({ monthlyIncome: 0 }) === null);
