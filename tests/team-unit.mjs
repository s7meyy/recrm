// اختبار وحدة (المرحلة ٤٧): الفريق — النسبةُ والإسنادُ والأداء.
//
// **الحدُّ المحروس:** هذا تمييزٌ وتنسيق لا تصريحٌ وحجب. والاختبارُ يثبت أنّ الحسابَ صادقٌ،
// لا أنّ أحدًا يُمنع من شيء — فالمنعُ لا تملكه هذه البنية أصلًا.
import { memberName, activeMembers, assignOptions, roundRobin, memberStats, unassigned, passesAssign } from '../js/util/team.js';

const ok = (n, c, x = '') => console.log(`${c ? 'PASS' : 'FAIL'} — ${n}${x ? ' :: ' + x : ''}`);
const TEAM = [
  { id: 'm1', name: 'ناصر', active: true },
  { id: 'm2', name: 'سارة', active: true },
  { id: 'm3', name: 'خالد', active: false },
];

/* ===== الأسماء ===== */
ok('المعرّف يُترجَم اسمًا', memberName(TEAM, 'm2') === 'سارة');
ok('و«أنا» لصاحب الجهاز', memberName(TEAM, 'm1', { me: 'm1' }) === 'أنا');
ok('ومن لا يُعرف يُقال غيرَ معروف لا يُخترع له اسم', memberName(TEAM, 'zz') === 'غير معروف');
ok('وبلا معرّفٍ لا نصّ', memberName(TEAM, null) === '' && memberName(TEAM, '') === '');

/* ===== العاملون ===== */
ok('المعطَّل ليس عاملًا', activeMembers(TEAM).map((m) => m.id).join(',') === 'm1,m2');
ok('ومن بلا حقل «عامل» يُعدّ عاملًا', activeMembers([{ id: 'x', name: 'ي' }]).length === 1);

/* المعطَّلُ لا يختفي من سجلٍّ أُسند إليه — وإلا بدا السجلُّ بلا مسند وهو مسند. */
const opts = assignOptions(TEAM, 'm3');
ok('المعطَّل يظهر خيارًا لمن أُسند إليه', opts.some((o) => o.value === 'm3'), JSON.stringify(opts.map((o) => o.label)));
ok('ويُقال إنه معطَّل', opts.find((o) => o.value === 'm3').label.includes('معطَّل'));
ok('ولا يظهر لغيره', !assignOptions(TEAM, '').some((o) => o.value === 'm3'));

/* ===== التناوب ===== */
const rr = roundRobin([{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }], TEAM);
ok('التوزيع يتناوب بين العاملين', rr.map((x) => x.memberId).join(',') === 'm1,m2,m1,m2', rr.map((x) => x.memberId).join(','));
ok('ولا يُسند إلى معطَّل', rr.every((x) => x.memberId !== 'm3'));
const rr2 = roundRobin([{ id: 'a' }], TEAM, { startAfter: 'm1' });
ok('ويبدأ من بعد آخر من أُسند إليه', rr2[0].memberId === 'm2');
ok('وبلا فريقٍ لا توزيع', roundRobin([{ id: 'a' }], []).length === 0);
ok('وبلا عناصرَ لا توزيع', roundRobin([], TEAM).length === 0);

/* ===== الأداء: الإسنادُ يغلب الإنشاء ===== */
const stats = memberStats({
  team: TEAM,
  clients: [
    { id: 'c1', createdBy: 'm1', assignedTo: 'm2' },   // أدخله ناصر وأُسند لسارة → لسارة
    { id: 'c2', createdBy: 'm1' },                      // بلا إسناد → لناصر
  ],
  properties: [{ id: 'p1', assignedTo: 'm2' }],
  requests: [],
  deals: [{ id: 'd1', createdBy: 'm2', commission: 50000 }, { id: 'd2', createdBy: 'm1', commission: 20000 }],
});
const by = (id) => stats.find((r) => r.member.id === id);
ok('الإسنادُ يغلب الإنشاء', by('m2').clients === 1 && by('m1').clients === 1);
ok('والعمولةُ تُجمع لصاحبها', by('m2').commission === 50000 && by('m1').commission === 20000);
ok('و«أدخله بيده» يفرّق بين من يُدخل ومن يُتابع', by('m1').entered === 2 && by('m2').entered === 0);
ok('والأكثرُ عمولةً أوّلًا', stats[0].member.id === 'm2', stats.map((r) => r.member.id).join(','));
ok('والمعطَّلُ لا يُحسب في الأداء', !stats.some((r) => r.member.id === 'm3'));

/* ===== بلا مسند ===== */
ok('غيرُ المسند يُحصر', unassigned([{ id: 'a' }, { id: 'b', assignedTo: 'm1' }]).length === 1);

/* ===== المرشّح ===== */
ok('بلا اختيارٍ يمرّ الكلّ', passesAssign({ assignedTo: 'm1' }, '', 'm2') === true);
ok('و«إليّ» تمرّ ما أُسند إليّ', passesAssign({ assignedTo: 'm2' }, 'me', 'm2') === true);
ok('ولا تمرّ ما أُسند لغيري', passesAssign({ assignedTo: 'm1' }, 'me', 'm2') === false);
ok('و«بلا مسند» تمرّ الفارغ وحده', passesAssign({}, 'none', 'm1') === true && passesAssign({ assignedTo: 'm1' }, 'none', 'm1') === false);
ok('وعضوٌ بعينه يمرّ سجلّاته', passesAssign({ assignedTo: 'm2' }, 'm2', 'm1') === true);

/* ===== المرحلة ٤٨ — حصّةُ الوسيط وهدفُه ===== */
const T48 = await import('../js/util/team.js');
const team48 = [{ id: 'u1', name: 'ناصر', active: true }, { id: 'u2', name: 'سارة', active: true }];
const deals48 = [
  { id: 'd1', assignedTo: 'u1', commission: 10000, agentShare: 50 },
  { id: 'd2', assignedTo: 'u1', commission: 20000 },            // بلا نسبةٍ مكتوبة → نسبةُ الإعدادات
  { id: 'd3', createdBy: 'u2', commission: 8000, agentShare: 0 }, // صفرٌ صريح = لا حصّة
  { id: 'd4', assignedTo: 'u2', commission: 5000, agentShare: 100 },
];

const st = T48.memberStats({ team: team48, deals: deals48, defaultShare: 25 });
const n = st.find((r) => r.member.id === 'u1');
const sa = st.find((r) => r.member.id === 'u2');
ok('عمولةُ المكتب تُجمع كما كانت', n.commission === 30000, String(n.commission));
ok('وحصّتُه: نسبةُ الصفقة حيث كُتبت، ونسبةُ الإعدادات حيث لم تُكتب (٥٠٠٠ + ٥٠٠٠)',
  n.earned === 10000, String(n.earned));
ok('وصفرٌ صريحٌ يُحترم ولا يُستبدل بنسبة الإعدادات', sa.earned === 5000, String(sa.earned));
ok('والإسنادُ يغلب الإنشاء في الصفقة أيضًا', n.deals === 2 && sa.deals === 2);
ok('وبلا نسبةٍ ولا إعداداتٍ لا يُخترع مال',
  T48.memberStats({ team: team48, deals: [{ assignedTo: 'u1', commission: 9000 }] })[0].earned === 0);
ok('ونسبةٌ خارج الحدّ تُقصّ لا تُضخّم',
  T48.memberStats({ team: team48, deals: [{ assignedTo: 'u1', commission: 100, agentShare: 500 }] })[0].earned === 100);

/* الهدف */
const goals48 = { dealsPerMonth: 10, commissionPerMonth: 100000, perMember: { u1: { dealsPerMonth: 3, commissionPerMonth: 60000 } } };
const withGoal = T48.memberStats({ team: team48, deals: deals48, goals: goals48 });
const gn = withGoal.find((r) => r.member.id === 'u1');
const gs = withGoal.find((r) => r.member.id === 'u2');
ok('ونسبةُ بلوغ الهدف تُحسب لمن وُضع له هدف', gn.goalPct === 50, String(gn.goalPct));
ok('ولا نسبةَ لمن لا هدفَ له — لا «٠٪» تُقرأ حكمًا', gs.goalPct === null);

ok('وهدفُ الجهاز هدفُ صاحبه إن وُجد', T48.goalFor(goals48, 'u1').commissionPerMonth === 60000
  && T48.goalFor(goals48, 'u1').scope === 'member');
ok('وإلّا فهدفُ المكتب كما كان', T48.goalFor(goals48, 'u2').commissionPerMonth === 100000
  && T48.goalFor(goals48, 'u2').scope === 'office');
ok('وهدفٌ بصفرين ليس هدفًا',
  T48.goalFor({ dealsPerMonth: 4, perMember: { u1: { dealsPerMonth: 0, commissionPerMonth: 0 } } }, 'u1').scope === 'office');
ok('وبلا أهدافٍ أصلًا لا ينفجر', T48.goalFor().dealsPerMonth === 0 && T48.goalFor({}, '').scope === 'office');
