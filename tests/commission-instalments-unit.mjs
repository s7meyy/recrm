// اختبار وحدة (المرحلة ٤٥): أقساط العمولة — نصفٌ عند التوقيع ونصفٌ عند الإفراغ.
//
// **الحدُّ الذي يُحرَس هنا:** الصفقة القديمة لا تتغيّر. بلا أقساط يبقى `commissionPaidAt`
// هو الحَكَم كما كان منذ المرحلة ١٧، فلا تحتاج آلافُ السجلّات إلى هجرة.
import { commissionState, commissionReceivables } from '../js/util/receivables.js';

const ok = (n, c, x = '') => console.log(`${c ? 'PASS' : 'FAIL'} — ${n}${x ? ' :: ' + x : ''}`);
const NOW = new Date('2026-09-16T00:00:00Z');
const deal = (extra = {}) => ({ id: 'd1', date: '2026-08-16T00:00:00Z', commission: 100000, clientId: 'c1', ...extra });

/* ===== بلا أقساط: كما كان تمامًا ===== */
const plainUnpaid = commissionState(deal());
ok('بلا أقساط وبلا تاريخ = لم يُقبض شيء', plainUnpaid.paid === 0 && plainUnpaid.remaining === 100000 && plainUnpaid.split === false);
const plainPaid = commissionState(deal({ commissionPaidAt: '2026-09-01T00:00:00Z' }));
ok('وبتاريخٍ = قُبضت كلّها', plainPaid.paid === 100000 && plainPaid.remaining === 0 && plainPaid.done === true);
ok('وبلا عمولةٍ لا مستحَقّ', commissionState(deal({ commission: null })).total === 0);

const oldRows = commissionReceivables([deal()], NOW);
ok('الصفقة القديمة تعطي صفًّا واحدًا', oldRows.length === 1 && oldRows[0].remaining === 100000);
ok('وعمرُها من تاريخ الصفقة، غير مؤرَّخة', oldRows[0].dated === false && oldRows[0].days === 31, String(oldRows[0].days));
ok('والمقبوضة لا تظهر', commissionReceivables([deal({ commissionPaidAt: '2026-09-01T00:00:00Z' })], NOW).length === 0);

/* ===== بالأقساط ===== */
const split = deal({
  commissionPayments: [
    { id: 'a', dueAt: '2026-08-16T00:00:00Z', amount: 50000, paidAt: '2026-08-17T00:00:00Z', note: 'عند التوقيع' },
    { id: 'b', dueAt: '2026-10-16T00:00:00Z', amount: 50000, paidAt: null, note: 'عند الإفراغ' },
  ],
});
const st = commissionState(split);
ok('المقبوض مجموعُ ما وُسم مقبوضًا', st.paid === 50000 && st.remaining === 50000 && st.split === true);
ok('ولا تُعدّ مكتملة', st.done === false && st.paidAt === null);

const rows = commissionReceivables([split], NOW);
ok('القسط غير المقبوض وحده يظهر', rows.length === 1 && rows[0].remaining === 50000);
ok('وعمرُه من موعده هو لا من تاريخ الصفقة', rows[0].dated === true && rows[0].days === -30, String(rows[0].days));
ok('ويحمل قسطه ليُقبض وحده', rows[0].instalment?.id === 'b' && rows[0].dealId === 'd1');

const allPaid = commissionState(deal({ commissionPayments: [
  { id: 'a', dueAt: '2026-08-16T00:00:00Z', amount: 60000, paidAt: '2026-08-17T00:00:00Z' },
  { id: 'b', dueAt: '2026-09-01T00:00:00Z', amount: 40000, paidAt: '2026-09-05T00:00:00Z' },
] }));
ok('اكتمال الأقساط = اكتمال العمولة', allPaid.done === true && allPaid.remaining === 0);
ok('وتاريخُها آخرُ قسطٍ قُبض', allPaid.paidAt === '2026-09-05T00:00:00Z', String(allPaid.paidAt));
ok('فلا تظهر في المستحقات', commissionReceivables([deal({ commissionPayments: allPaid.rows })], NOW).length === 0);

/* ===== ما لم يُجدول لا يضيع ===== */
const partial = deal({ commissionPayments: [{ id: 'a', dueAt: '2026-08-16T00:00:00Z', amount: 40000, paidAt: null }] });
const pst = commissionState(partial);
ok('المجدول ٤٠ من ١٠٠ يترك ٦٠ غير مجدولة', pst.scheduled === 40000 && pst.unscheduled === 60000);
const prows = commissionReceivables([partial], NOW);
ok('فيظهر صفّان: القسط وما لم يُجدول', prows.length === 2, JSON.stringify(prows.map((r) => r.remaining)));
ok('ومجموعُهما العمولةُ كلّها', prows.reduce((a, r) => a + r.remaining, 0) === 100000);
const un = prows.find((r) => r.unscheduled);
ok('وغيرُ المجدول يُعلَن كذلك وغيرَ مؤرَّخ', !!un && un.dated === false && un.remaining === 60000);

/* ===== القسط بلا موعد لا يُمحى ===== */
const undated = deal({ commissionPayments: [
  { id: 'a', dueAt: null, amount: 100000, paidAt: null, note: 'عند الإفراغ' },
] });
const urows = commissionReceivables([undated], NOW);
ok('قسطٌ بلا موعد يظهر على تاريخ الصفقة', urows.length === 1 && urows[0].dated === false && urows[0].days === 31);
ok('ولا يُعدّ غيرَ مجدول', urows[0].unscheduled !== true);
