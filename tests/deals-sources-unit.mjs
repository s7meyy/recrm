// اختبار وحدة (المرحلة ٢٤): العمولة الصافية، ودفعات الإيجار، ومسار الصفقة،
// وتقرير المصادر، وربحية العقار.
import { netCommission, duePayments, checklistProgress } from '../js/data/schema.js';
import { sourceReport, propertyProfit } from '../js/util/sources.js';
import { paymentReceivables, receivables } from '../js/util/receivables.js';

const ok = (n, c, x = '') => console.log(`${c ? 'PASS' : 'FAIL'} — ${n}${x ? ' :: ' + x : ''}`);
const DAY = 86400000;
const now = new Date('2026-09-15T08:00:00.000Z');

/* ===== العمولة الصافية ===== */
ok('بلا شريك: الصافي هو العمولة', netCommission({ commission: 30000 }) === 30000);
ok('مع شريك: يُطرح نصيبه', netCommission({ commission: 30000, partnerShare: 12000 }) === 18000);
ok('العمولة الفارغة صفر لا NaN', netCommission({ commission: null }) === 0);
ok('ولا ينزل الصافي تحت الصفر', netCommission({ commission: 1000, partnerShare: 5000 }) === 0);
ok('وصفقة بلا حقول أصلًا صفر', netCommission(undefined) === 0);

/* ===== دفعات الإيجار ===== */
const deal = {
  id: 'd1', clientId: 'c1', propertyId: 'p1', date: '2026-01-10', commission: 20000, partnerShare: 5000,
  payments: [
    { id: 'y1', dueAt: '2026-08-01', amount: 4000, paidAt: '2026-08-02' },
    { id: 'y2', dueAt: '2026-09-01', amount: 4000, paidAt: null },
    { id: 'y3', dueAt: '2026-07-01', amount: 4000, paidAt: null },
    { id: 'y4', dueAt: '2026-12-01', amount: 4000, paidAt: null },
  ],
};
const due = duePayments(deal, now.getTime());
ok('المقبوضة لا تُستحقّ', !due.some((p) => p.id === 'y1'));
ok('والمستقبلية ليست مستحقّة بعد', !due.some((p) => p.id === 'y4'));
ok('والمستحقّ يُرتَّب بالأقدم أولًا', due.map((p) => p.id).join(',') === 'y3,y2', due.map((p) => p.id).join(','));
ok('دفعة بلا تاريخ لا تُحسب', duePayments({ payments: [{ id: 'x', amount: 10 }] }, now.getTime()).length === 0);

/* ===== مسار الصفقة ===== */
ok('صفقة بلا مسار: null لا صفر من صفر', checklistProgress({ checklist: [] }) === null);
const half = checklistProgress({ checklist: [{ done: true }, { done: false }, { done: false }] });
ok('التقدّم يُعدّ المنجز', half.done === 1 && half.total === 3, JSON.stringify(half));
ok('وغير مكتمل ما دام بندٌ باقيًا', half.complete === false);
ok('واكتماله حين تكتمل بنوده', checklistProgress({ checklist: [{ done: true }] }).complete === true);

/* ===== الدفعات في المستحقات ===== */
const payRows = paymentReceivables([deal], now);
ok('غير المقبوضة وحدها تدخل المستحقات', payRows.length === 3, String(payRows.length));
ok('والأقدم استحقاقًا أولًا', payRows[0].payment.id === 'y3', payRows[0].payment.id);
ok('والمستقبلية بعمرٍ سالب فلا تُعدّ متأخرة', payRows.at(-1).days < 0, String(payRows.at(-1).days));
ok('والدفعة تحمل صفقتها وعميلها', payRows[0].dealId === 'd1' && payRows[0].clientId === 'c1');

const all = receivables({ invoices: [], deals: [deal] }, now);
ok('المستحقات تجمع العمولة والدفعات معًا', all.rows.some((r) => r.kind === 'commission') && all.rows.some((r) => r.kind === 'payment'));
ok('وإجماليها مجموع الباقي', all.total === 20000 + 12000, String(all.total));
ok('والمتأخر منها يستثني المستقبلي', all.overdueTotal === 20000 + 8000, String(all.overdueTotal));

/* ===== تقرير المصادر ===== */
const clients = [
  { id: 'c1', referralSource: 'إعلان' },
  { id: 'c2', referralSource: 'إعلان' },
  { id: 'c3', referralSource: 'توصية' },
  { id: 'c4', referralSource: '' },
];
const requests = [
  { id: 'r1', clientId: 'c1', status: 'active' },
  { id: 'r2', clientId: 'c2', status: 'done' },
  { id: 'r3', clientId: 'c3', status: 'active' },
];
const deals = [
  { id: 'd1', clientId: 'c1', propertyId: 'p1', commission: 20000, partnerShare: 5000 },
  { id: 'd2', clientId: 'c3', propertyId: 'p2', commission: 40000 },
  { id: 'd3', clientId: 'c4', propertyId: null, commission: 9000 },
];
const report = sourceReport({ clients, requests, deals });
const row = (name) => report.rows.find((r) => r.source === name);
ok('الترتيب بالعمولة الصافية تنازليًا', report.rows[0].source === 'توصية', report.rows[0].source);
ok('ونصيب الشريك مطروح من عمولة المصدر', row('إعلان').commission === 15000, String(row('إعلان').commission));
ok('وعملاء المصدر تُعدّ', row('إعلان').clients === 2);
ok('وطلباته النشطة وحدها', row('إعلان').active === 1, String(row('إعلان').active));
ok('ونسبة التحويل عميل ← صفقة', row('إعلان').conversion === 0.5, String(row('إعلان').conversion));
ok('وبلا مصدر تُجمع تحت اسم صريح', !!row('بلا مصدر'), report.rows.map((r) => r.source).join(','));
ok('ولا تُحسب مصدرًا مسمّى', report.totals.sources === 2, String(report.totals.sources));
ok('والإجمالي يجمع الكل', report.totals.commission === 15000 + 40000 + 9000, String(report.totals.commission));
ok('تقرير بلا بيانات لا ينفجر', sourceReport({}).rows.length === 0);

/* ===== ربحية العقار ===== */
const properties = [
  { id: 'p1', type: 'villa', city: 'الرياض', district: 'النرجس' },
  { id: 'p2', type: 'apartment', city: 'الرياض', district: 'الملقا' },
  { id: 'p3', type: 'land', city: 'الرياض', district: 'العارض' },
];
const expenses = [
  { id: 'e1', propertyId: 'p1', amount: 3000 },
  { id: 'e2', propertyId: 'p3', amount: 2000 },
  { id: 'e3', propertyId: null, amount: 900 },
];
const profit = propertyProfit({ properties, deals, expenses });
const pRow = (id) => profit.find((r) => r.propertyId === id);
ok('الصافي عمولةً ناقص مصاريف', pRow('p1').net === 15000 - 3000, String(pRow('p1').net));
ok('وعقار بمصروف بلا صفقة يظهر سالبًا', pRow('p3').net === -2000, String(pRow('p3').net));
ok('والترتيب بالصافي تنازليًا', profit.map((r) => r.propertyId).join(',') === 'p2,p1,p3', profit.map((r) => r.propertyId).join(','));
ok('وصفقة العرض الخارجي لا تُنسب لعقار', !profit.some((r) => r.propertyId == null));
ok('ومصروف بلا عقار لا يدخل', profit.reduce((s, r) => s + r.spent, 0) === 5000);
ok('والعقار يُرفق بصفّه للعرض', pRow('p1').property?.district === 'النرجس');
