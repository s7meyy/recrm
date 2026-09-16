// المرحلة ٤٨ — المتكرّر: ما يُقترح قيدُه، وما لا يُقترح.
import { dueRecurring, nextEntry, currentMonth } from '../js/util/recurring.js';
import { buildingGroups } from '../js/util/management.js';
import { normalizeArabic } from '../js/util/arabic.js';
const ok = (n, c, x = '') => console.log(`${c ? 'PASS' : 'FAIL'} — ${n}${x ? ' :: ' + x : ''}`);

const rows = [
  { id: 'a', repeatMonthly: true, category: 'ads', note: 'اشتراك سناب', amount: 1500, date: '2026-08-05T00:00:00Z' },
  { id: 'b', repeatMonthly: true, category: 'rent', note: 'إيجار المكتب', amount: 8000, date: '2026-08-01T00:00:00Z' },
  { id: 'c', repeatMonthly: false, category: 'fuel', note: 'وقود', amount: 300, date: '2026-08-10T00:00:00Z' },
  // قُيِّد بالفعل في سبتمبر
  { id: 'd', repeatMonthly: true, category: 'rent', note: 'إيجار المكتب', amount: 8000, date: '2026-09-01T00:00:00Z' },
];
const due = dueRecurring(rows, { month: '2026-09' });
ok('المتكرّرُ الذي لم يُقيَّد يُقترح', due.length === 1 && due[0].draft.note === 'اشتراك سناب', String(due.length));
ok('وما قُيِّد نظيرُه هذا الشهر لا يُقترح', !due.some((d) => d.draft.note === 'إيجار المكتب'));
ok('وغيرُ المتكرّر لا يُقترح أصلًا', !due.some((d) => d.draft.category === 'fuel'));
ok('**واليومُ من الشهر يُحفظ**: ما دُفع في الخامس يبقى في الخامس',
  due[0].draft.date.slice(0, 10) === '2026-09-05', due[0].draft.date);
ok('والمبلغُ من آخر مرّة', due[0].draft.amount === 1500);
ok('ويبقى موسومًا متكرّرًا فلا تنقطع السلسلة', due[0].draft.repeatMonthly === true);

/* أحدثُ نسخةٍ هي التي تُنسخ */
const grew = dueRecurring([
  { repeatMonthly: true, category: 'ads', note: 'سناب', amount: 1000, date: '2026-06-05T00:00:00Z' },
  { repeatMonthly: true, category: 'ads', note: 'سناب', amount: 1800, date: '2026-08-05T00:00:00Z' },
], { month: '2026-09' });
ok('وآخرُ ما دفعتَه أقربُ إلى ما ستدفعه', grew[0].draft.amount === 1800, String(grew[0].draft.amount));

/* لا يُقترح لشهرٍ قبل أوّل مرّة */
const early = dueRecurring([{ repeatMonthly: true, category: 'ads', note: 'سناب', amount: 100, date: '2026-08-05T00:00:00Z' }], { month: '2026-05' });
ok('ولا يُقترح لشهرٍ سابقٍ لأوّل مرّةٍ سُجِّل فيها — لم يكن قائمًا بعد', early.length === 0);

/* اختلافُ البيان اختلافُ بند */
const twoNames = dueRecurring([
  { repeatMonthly: true, category: 'ads', note: 'سناب', amount: 100, date: '2026-08-01T00:00:00Z' },
  { repeatMonthly: true, category: 'ads', note: 'انستقرام', amount: 200, date: '2026-08-01T00:00:00Z' },
], { month: '2026-09' });
ok('وبيانان مختلفان بندان — ولا يُدمجان بتخمين', twoNames.length === 2);

/* آخرُ الشهر */
ok('و٣١ يُردّ إلى ٣٠ في شهرٍ من ثلاثين، ولا يقفز شهرًا',
  nextEntry({ date: '2026-08-31T00:00:00Z', amount: 5 }, '2026-09').date.slice(0, 10) === '2026-09-30');
ok('وإلى ٢٨ في فبراير', nextEntry({ date: '2026-01-31T00:00:00Z', amount: 5 }, '2026-02').date.slice(0, 10) === '2026-02-28');
ok('والفراغُ لا ينفجر', dueRecurring().length === 0 && dueRecurring([], {}).length === 0);
ok('ومفتاحُ الشهر الحاليّ بصيغته', /^\d{4}-\d{2}$/.test(currentMonth()));

/* ===== المباني ===== */
const mk = (id, building, opts = {}) => ({
  property: { id, building },
  tenant: opts.tenant || null, deal: opts.deal || null, leaseEndAt: opts.leaseEndAt || null,
  fee: opts.fee || 0, overdueCount: opts.overdue || 0, overdueAmount: opts.overdueAmount || 0,
  openMaintenance: opts.maint || [],
});
const groups = buildingGroups([
  mk('1', 'عمارة الياسمين', { tenant: { id: 't1' }, fee: 250, leaseEndAt: '2027-01-10' }),
  mk('2', 'عماره الياسمين', { tenant: { id: 't2' }, fee: 250, overdue: 1, overdueAmount: 20000, leaseEndAt: '2026-11-01' }),
  mk('3', 'عمارة الياسمين', { maint: [{ what: 'مكيّف' }] }),
  mk('4', 'برج النخيل', { tenant: { id: 't3' }, fee: 500 }),
  mk('5', ''),
], { normalize: normalizeArabic });
ok('الوحداتُ تُجمع في مبانيها', groups.length === 2, String(groups.length));
ok('**والإملاءُ المتقارب مبنًى واحد**: «عمارة» و«عماره»',
  groups[0].units === 3, String(groups[0].units));
ok('ويُعرض بأوّل إملاءٍ كتبتَه لا بصيغةٍ مخترَعة', groups[0].name === 'عمارة الياسمين', groups[0].name);
ok('والمؤجَّرُ ما له عقدٌ ومستأجر', groups[0].leased === 2 && groups[0].vacant === 1);
ok('والأجورُ تُجمع', groups[0].monthlyFee === 500, String(groups[0].monthlyFee));
ok('والمتأخّراتُ كذلك', groups[0].overdueCount === 1 && groups[0].overdueAmount === 20000);
ok('والصيانةُ المفتوحة', groups[0].openMaintenance === 1);
ok('وأوّلُ عقدٍ ينتهي أقربُها', groups[0].nextVacancy === '2026-11-01', String(groups[0].nextVacancy));
ok('ووحدةٌ بلا مبنًى لا يُخترع لها مبنًى', !groups.some((g) => g.rows.some((r) => r.property.id === '5')));
ok('والأكثرُ وحداتٍ أوّلًا', groups[0].units >= groups[1].units);
ok('وبلا صفوفٍ لا ينفجر', buildingGroups().length === 0 && buildingGroups([]).length === 0);
