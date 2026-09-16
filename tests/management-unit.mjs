// المرحلة ٣٨ — إدارة الأملاك: الأجر، وحالة العقد، والمتأخّر.
import { monthlyFee, daysToEnd, contractState, managedRows, managementAlerts, monthlyFeeTotal } from '../js/util/management.js';
const ok = (n, c, x = '') => console.log(`${c ? 'PASS' : 'FAIL'} — ${n}${x ? ' :: ' + x : ''}`);
const DAY = 86400000;
const NOW = Date.parse('2026-09-15T00:00:00Z');
const iso = (days) => new Date(NOW + days * DAY).toISOString();

/* الأجر */
ok('نسبةٌ من الإيجار السنويّ تصير أجرًا شهريًّا (٦٠٠٠٠ × ٥٪ ÷ ١٢)',
  monthlyFee({ feeType: 'percent', feeValue: 5 }, 60000) === 250, String(monthlyFee({ feeType: 'percent', feeValue: 5 }, 60000)));
ok('والمبلغ الثابت يبقى كما هو', monthlyFee({ feeType: 'fixed', feeValue: 800 }, 60000) === 800);
ok('والثابت لا يتأثّر بغياب الإيجار', monthlyFee({ feeType: 'fixed', feeValue: 800 }, null) === 800);
ok('ونسبةٌ بلا إيجارٍ معلوم = غير معلوم، لا صفرًا يُضلّل المجموع',
  monthlyFee({ feeType: 'percent', feeValue: 5 }, null) === null);
ok('وعقدٌ بلا أجرٍ مُدخل = غير معلوم', monthlyFee({ feeType: 'percent', feeValue: null }, 60000) === null);
ok('ولا عقد = لا أجر', monthlyFee(null, 60000) === null);

/* حالة العقد */
ok('بلا نهايةٍ محدَّدة: سارٍ مفتوح', contractState({ endAt: null }, NOW) === 'open');
ok('نهايةٌ بعد سنة: سارٍ', contractState({ endAt: iso(365) }, NOW) === 'active');
ok('نهايةٌ بعد عشرة أيام: ينتهي قريبًا', contractState({ endAt: iso(10) }, NOW) === 'ending');
ok('نهايةٌ أمس: انتهى', contractState({ endAt: iso(-1) }, NOW) === 'expired');
ok('وحدّ الشهر هو الفاصل', contractState({ endAt: iso(31) }, NOW) === 'active' && contractState({ endAt: iso(29) }, NOW) === 'ending');
ok('وتاريخٌ فاسد لا ينفجر', daysToEnd({ endAt: 'ليس تاريخًا' }, NOW) === null);

/* الصفوف: العقار + صفقته */
const properties = [
  { id: 'p1', type: 'apartment', city: 'الرياض', district: 'النرجس', ownerId: 'c1', price: 60000, management: { feeType: 'percent', feeValue: 5, endAt: iso(10) } },
  { id: 'p2', type: 'villa', city: 'الرياض', district: 'الملقا', ownerId: 'c1', price: 200000, management: { feeType: 'fixed', feeValue: 1500, endAt: iso(-5) } },
  { id: 'p3', type: 'land', city: 'الرياض', district: 'العارض', management: null }, // ليس تحت الإدارة
];
const deals = [
  { id: 'd-old', propertyId: 'p1', clientId: 'c2', date: '2024-01-01', finalPrice: 50000, payments: [] },
  {
    id: 'd1', propertyId: 'p1', clientId: 'c2', date: '2026-01-01', finalPrice: 60000, leaseEndAt: iso(200),
    payments: [
      { id: 'x1', dueAt: iso(-40), amount: 15000, paidAt: iso(-39) },
      { id: 'x2', dueAt: iso(-10), amount: 15000, paidAt: null },
      { id: 'x3', dueAt: iso(50), amount: 15000, paidAt: null },
      { id: 'x4', dueAt: iso(140), amount: 15000, paidAt: null },
    ],
  },
];
const clientMap = new Map([['c1', { id: 'c1', name: 'المالك' }], ['c2', { id: 'c2', name: 'المستأجر' }]]);
const rows = managedRows({ properties, deals, clientMap, now: NOW });

ok('ما ليس تحت الإدارة لا يظهر', rows.length === 2 && !rows.some((r) => r.property.id === 'p3'), String(rows.length));
const r1 = rows.find((r) => r.property.id === 'p1');
ok('المالك والمستأجر يُقرآن من سجلّيهما', r1.owner?.name === 'المالك' && r1.tenant?.name === 'المستأجر');
ok('وأحدث صفقةٍ للعقار هي عقده الساري لا أوّلها', r1.deal.id === 'd1', r1.deal.id);
ok('الأجر محسوبٌ من سعر الصفقة لا من سعر العرض', r1.fee === 250, String(r1.fee));
ok('دفعةٌ فات موعدها ولم تُدفع = متأخّرة', r1.overdueCount === 1 && r1.overdueAmount === 15000, JSON.stringify([r1.overdueCount, r1.overdueAmount]));
ok('ودفعةٌ فاتت لكن دُفعت لا تُحسب متأخّرة', r1.collected === 15000, String(r1.collected));
ok('والقادمة أقربُ ما لم يُدفع مستقبلًا', r1.nextDue?.id === 'x3', r1.nextDue?.id);
ok('ومجموع المستحقّ كامل الجدول', r1.due === 60000, String(r1.due));

const r2 = rows.find((r) => r.property.id === 'p2');
ok('عقارٌ بلا صفقة: لا مستأجر ولا دفعات، والأجر الثابت يبقى معلومًا',
  r2.tenant === null && r2.overdueCount === 0 && r2.fee === 1500);

/* التنبيهات والمجموع */
const alerts = managementAlerts(rows);
ok('التنبيهات تشمل المنتهي والمقارب والمتأخّر', alerts.length === 3, alerts.map((a) => a.kind).join('، '));
ok('والمنتهي يُسمّى انتهاءً لا اقترابًا', alerts.some((a) => a.kind === 'expired' && a.row.property.id === 'p2'));
ok('مجموع الأجور الشهرية = ٢٥٠ + ١٥٠٠', monthlyFeeTotal(rows) === 1750, String(monthlyFeeTotal(rows)));

/* الفراغ لا ينفجر */
ok('بلا عقاراتٍ ولا صفقات: صفوفٌ فارغة لا خطأ',
  managedRows({}).length === 0 && managementAlerts([]).length === 0 && monthlyFeeTotal([]) === 0);

/* ===== المرحلة ٤٧ — الصيانة، وكشف المالك، والمتأخّرات بالمستأجر، والتجديد ===== */
const M = await import('../js/util/management.js');

/* الصيانة المفتوحة */
const propM = {
  id: 'pm', management: { feeType: 'percent', feeValue: 5 },
  maintenance: [
    { what: 'تسريب', status: 'open', bearer: 'owner', cost: 500, at: '2026-08-03T00:00:00Z' },
    { what: 'مكيّف', status: 'done', bearer: 'owner', cost: 1200, at: '2026-08-01T00:00:00Z', doneAt: '2026-08-20T00:00:00Z' },
    { what: 'مصباح', status: 'done', bearer: 'tenant', cost: 300, at: '2026-08-02T00:00:00Z', doneAt: '2026-08-21T00:00:00Z' },
    { what: 'دهان', status: 'done', bearer: 'office', cost: 900, at: '2026-08-04T00:00:00Z', doneAt: '2026-08-22T00:00:00Z' },
  ],
};
ok('المفتوحُ ما لم يُنجَز — وما أُنجز لا ينتظر عملًا', M.openMaintenance(propM).length === 1, String(M.openMaintenance(propM).length));
ok('وعقارٌ بلا صيانة لا ينفجر', M.openMaintenance({}).length === 0 && M.openMaintenance(null).length === 0);
ok('ومن يتحمّل الكلفة يُسمّى بالعربية', M.bearerLabel('tenant') === 'المستأجر' && M.bearerLabel('office') === 'المكتب');
ok('ومفتاحٌ مجهولٌ يقع على المالك لا على فراغ', M.bearerLabel('???') === 'المالك' && M.maintenanceLabel('???') === 'مفتوح');

/* كشف المالك */
const dealM = {
  id: 'dm',
  payments: [
    { id: 'a', dueAt: '2026-08-01T00:00:00Z', paidAt: '2026-08-05T00:00:00Z', amount: 20000, note: 'الشهر ١' },
    { id: 'b', dueAt: '2026-09-01T00:00:00Z', paidAt: '2026-09-02T00:00:00Z', amount: 20000, note: 'الشهر ٢' },
    { id: 'c', dueAt: '2026-08-15T00:00:00Z', paidAt: null, amount: 20000, note: 'لم تُقبض' },
  ],
};
const st = M.ownerStatement({ property: propM, deal: dealM, month: '2026-08' });
ok('الكشف يقرأ المقبوض في شهره لا المستحقّ فيه', st.collected === 20000 && st.rows.length === 1, JSON.stringify([st.collected, st.rows.length]));
ok('ودفعةُ شهرٍ آخر لا تدخل كشفَ هذا الشهر', !st.rows.some((r) => r.id === 'b'));
ok('ودفعةٌ لم تُقبض لا تدخل الكشف ولو استُحقّت فيه', !st.rows.some((r) => r.id === 'c'));
ok('الأجرُ نسبةً يُحسب على ما قُبض فعلًا (٢٠٠٠٠ × ٥٪)', st.fee === 1000, String(st.fee));
ok('ولا يُخصم من المالك إلا ما كان عليه هو (١٢٠٠ لا ٢٤٠٠)', st.maintenance === 1200 && st.maintenanceRows.length === 1, JSON.stringify([st.maintenance, st.maintenanceRows.length]));
ok('وصيانةُ المستأجر والمكتب خارج كشف المالك',
  !st.maintenanceRows.some((m) => m.bearer !== 'owner'));
ok('وبلاغٌ مفتوحٌ لم يُنجَز لا يُخصم بعد', !st.maintenanceRows.some((m) => m.what === 'تسريب'));
ok('الصافي = المقبوض − الأجر − صيانة المالك', st.net === 20000 - 1000 - 1200, String(st.net));

const stFixed = M.ownerStatement({ property: { management: { feeType: 'fixed', feeValue: 800 } }, deal: dealM, month: '2026-08' });
ok('والأجرُ الثابت لا يتبع المقبوض', stFixed.fee === 800, String(stFixed.fee));
const stEmpty = M.ownerStatement({ property: propM, deal: dealM, month: '2026-01' });
ok('شهرٌ بلا قبضٍ: صفرٌ صادقٌ لا أجرَ فيه بالنسبة', stEmpty.collected === 0 && stEmpty.fee === 0 && stEmpty.net === 0);
ok('وكشفٌ بلا عقارٍ ولا صفقةٍ لا ينفجر', M.ownerStatement({}).collected === 0 && M.ownerStatement().net === 0);

/* المتأخّرات بحسب المستأجر */
const t1 = { id: 'c1', name: 'سعد', phone: '0500000000' };
const arRows = [
  { property: { id: 'p1' }, tenant: t1, overdueCount: 2, overdueAmount: 30000, deal: { payments: [
    { dueAt: iso(-40), paidAt: null }, { dueAt: iso(-10), paidAt: null }, { dueAt: iso(-90), paidAt: iso(-89) }, { dueAt: iso(30), paidAt: null },
  ] } },
  { property: { id: 'p2' }, tenant: t1, overdueCount: 1, overdueAmount: 5000, deal: { payments: [{ dueAt: iso(-70), paidAt: null }] } },
  { property: { id: 'p3' }, tenant: null, overdueCount: 1, overdueAmount: 90000, deal: { payments: [{ dueAt: iso(-5), paidAt: null }] } },
  { property: { id: 'p4' }, tenant: { id: 'c9', name: 'بلا تأخّر' }, overdueCount: 0, overdueAmount: 0, deal: { payments: [] } },
];
const ar = M.arrearsByTenant(arRows, NOW);
ok('المتأخّرات تُجمع بالشخص لا بالوحدة', ar.length === 2, String(ar.length));
const saad = ar.find((a) => a.tenantId === 'c1');
ok('وعقاراتُه تُضمّ في صفٍّ واحد بمجموعها', saad.count === 3 && saad.amount === 35000 && saad.rows.length === 2, JSON.stringify([saad.count, saad.amount]));
ok('وأقدمُ دفعةٍ فاتت هي أقدمُ ما لم يُدفع لا أقدمُ ما دُفع', saad.oldestDueAt === iso(-70), String(saad.oldestDueAt));
ok('ودفعةٌ لم يَحِن موعدُها ليست متأخّرة', new Date(saad.oldestDueAt).getTime() < NOW);
ok('والأكبر مبلغًا أوّلًا', ar[0].amount === 90000, String(ar[0].amount));
ok('ومن لا مستأجرَ له يُفرَد ولا يُنسب إلى أحد', ar[0].tenantId === null && ar[0].tenant === null);
ok('ومن لا تأخّرَ عليه لا يظهر أصلًا', !ar.some((a) => a.tenantId === 'c9'));
ok('وأيامُ التأخّر تُحسب، وتاريخٌ غائبٌ = غير معلوم', M.lateDays(iso(-70), NOW) === 70 && M.lateDays(null) === null, String(M.lateDays(iso(-70), NOW)));
ok('ولا تأخّرَ سالبًا لموعدٍ لم يحِن', M.lateDays(iso(30), NOW) === 0);

/* التجديد */
const renewRow = {
  property: { id: 'p1', management: { feeType: 'percent', feeValue: 5, endAt: '2026-12-31T00:00:00Z' } },
  deal: { id: 'd1', leaseEndAt: '2026-12-31T00:00:00Z', payments: [
    { dueAt: '2026-11-01T00:00:00Z', amount: 5000 }, { dueAt: '2026-12-01T00:00:00Z', amount: 5500 },
  ] },
};
const plan = M.renewalPlan({ row: renewRow, now: NOW });
ok('التجديد يمتدّ سنةً من نهاية العقد القائم لا من اليوم', plan.management.endAt.slice(0, 10) === '2027-12-31', plan.management.endAt);
ok('ويمتدّ عقدُ الإيجار كذلك', plan.lease.leaseEndAt.slice(0, 10) === '2027-12-31', plan.lease.leaseEndAt);
ok('ويقترح اثنتي عشرة دفعة', plan.lease.payments.length === 12, String(plan.lease.payments.length));
ok('بقيمة آخرِ دفعةٍ مجدوَلة لا بأوّلها ولا بمخترَع', plan.lease.payments.every((p) => p.amount === 5500), String(plan.lease.payments[0].amount));
ok('وأوّلُها بعد آخرِ دفعةٍ قائمة بشهر', plan.lease.payments[0].dueAt.slice(0, 10) === '2027-01-01', plan.lease.payments[0].dueAt);
ok('وآخرُها بعدها باثني عشر شهرًا', plan.lease.payments[11].dueAt.slice(0, 10) === '2027-12-01', plan.lease.payments[11].dueAt);
ok('وخطّةٌ سليمةٌ بلا تنبيهات', plan.warnings.length === 0, plan.warnings.join('، '));

const noAmount = M.renewalPlan({ row: { property: renewRow.property, deal: { id: 'd2', payments: [{ dueAt: '2026-12-01T00:00:00Z', amount: null }] } }, now: NOW });
ok('ودفعةٌ بلا مبلغٍ معلوم لا تُولّد مبالغَ مخترَعة', noAmount.lease.payments.length === 0);
ok('وتُقال العلّة صراحةً', noAmount.warnings.some((w) => w.includes('لا دفعةٌ سابقة')), noAmount.warnings.join('، '));

const noDeal = M.renewalPlan({ row: { property: renewRow.property, deal: null }, now: NOW });
ok('وبلا عقد إيجار: يُجدَّد عقدُ الإدارة وحده وتُذكر العلّة', noDeal.lease === null && noDeal.management && noDeal.warnings.length === 1, noDeal.warnings.join('، '));

const expiredRow = { property: { id: 'p9', management: { endAt: '2020-01-01T00:00:00Z' } }, deal: null };
const expiredPlan = M.renewalPlan({ row: expiredRow, now: NOW });
ok('وعقدٌ انتهى منذ سنين يُجدَّد من اليوم لا من ماضٍ سحيق',
  expiredPlan.management.startAt.slice(0, 10) === new Date(NOW).toISOString().slice(0, 10), expiredPlan.management.startAt);

const openEnded = M.renewalPlan({ row: { property: { management: { endAt: null } }, deal: null }, now: NOW });
ok('وعقدٌ بلا نهايةٍ محدَّدة يُنبَّه صاحبُه أنّ التجديد يبدأ اليوم',
  openEnded.warnings.some((w) => w.includes('بلا نهاية محدَّدة')), openEnded.warnings.join('، '));

/* آخرُ يومٍ في الشهر لا يقفز إلى الشهر الذي بعده */
const jan31 = M.renewalPlan({ row: { property: { management: { endAt: '2027-01-31T12:00:00Z' } }, deal: null }, now: NOW });
ok('و٣١ يناير + سنة = ٣١ يناير، والحسابُ لا يقفز شهرًا',
  jan31.management.endAt.slice(0, 10) === '2028-01-31', jan31.management.endAt);

/* الصيانة في صفوف الإدارة وتنبيهاتها */
const mRows = managedRows({ properties: [propM], deals: [], clientMap: new Map(), now: NOW });
ok('الصفُّ يحمل بلاغاتِه المفتوحة', mRows[0].openMaintenance.length === 1, String(mRows[0].openMaintenance.length));
ok('وبلاغٌ مفتوحٌ ينبّه كما تنبّه الدفعةُ الفائتة',
  managementAlerts(mRows).some((a) => a.kind === 'maintenance'), managementAlerts(mRows).map((a) => a.kind).join('، '));

/* ===== المرحلة ٤٨ — زيادةُ التجديد ===== */
const up = M.renewalPlan({ row: renewRow, increasePct: 10, now: NOW });
ok('الزيادةُ تُطبَّق على كل دفعة (٥٥٠٠ + ١٠٪)', up.lease.payments.every((p) => p.amount === 6050), String(up.lease.payments[0].amount));
ok('وتُجبَر إلى ريالٍ صحيح — لا هللاتٍ في جدولٍ يُقرأ',
  M.renewalPlan({ row: renewRow, increasePct: 3, now: NOW }).lease.payments[0].amount === 5665,
  String(M.renewalPlan({ row: renewRow, increasePct: 3, now: NOW }).lease.payments[0].amount));
ok('وافتراضُها صفرٌ فالتجديدُ بالأجرة نفسِها', M.renewalPlan({ row: renewRow, now: NOW }).lease.payments[0].amount === 5500);
ok('والنسبةُ تُعاد في الخطّة ليُقال بها', up.increasePct === 10);
ok('ونسبةٌ خارج الحدّ تُقصّ', M.renewalPlan({ row: renewRow, increasePct: 900, now: NOW }).increasePct === 100);
ok('ونسبةٌ سالبةٌ تُردّ إلى صفر — التجديدُ لا يُخفّض بهذا الحقل',
  M.renewalPlan({ row: renewRow, increasePct: -20, now: NOW }).lease.payments[0].amount === 5500);
ok('ولا تُخترع زيادةٌ حيث لا دفعةَ معلومة',
  M.renewalPlan({ row: { property: renewRow.property, deal: { payments: [] } }, increasePct: 10, now: NOW }).lease.payments.length === 0);
