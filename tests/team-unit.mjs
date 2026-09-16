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
