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
