// المرحلة ٤٧ — «ابدأ من هنا»: خطواتٌ تُقرأ من البيانات لا من علامةٍ تُرفع بالنقر.
import { startSteps, startProgress, shouldShowStart } from '../js/util/onboarding.js';
const ok = (n, c, x = '') => console.log(`${c ? 'PASS' : 'FAIL'} — ${n}${x ? ' :: ' + x : ''}`);

const approved = (n) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, captureStatus: 'approved' }));

const empty = startSteps({});
ok('خمسُ خطوات', empty.length === 5, String(empty.length));
ok('وكلُّها غيرُ منجزةٍ في حسابٍ فارغ', empty.every((s) => !s.done));
ok('ولكلٍّ عنوانٌ وشرحٌ ورابطٌ وزرّ', empty.every((s) => s.title && s.hint && s.href && s.cta));
ok('وكلُّ رابطٍ داخليٌّ يبدأ بـ#/', empty.every((s) => s.href.startsWith('#/')));
ok('ولا مفتاحَ مكرَّر', new Set(empty.map((s) => s.key)).size === 5);

const p0 = startProgress(empty);
ok('صفرٌ من خمس، وأوّلُ ما ينتظرك اسمُ مكتبك', p0.done === 0 && p0.next.key === 'company', p0.next?.key);
ok('ولا تكتمل', !p0.complete && p0.pct === 0);

/* حالُ كل خطوةٍ تُقرأ من البيانات */
const at = (steps, key) => steps.find((s) => s.key === key);
ok('اسمٌ مكتوبٌ يُنجز الأولى', at(startSteps({ company: { name: 'كسّاب' } }), 'company').done);
ok('واسمٌ من فراغاتٍ لا يُنجزها', !at(startSteps({ company: { name: '   ' } }), 'company').done);

ok('عقارٌ معتمدٌ يُنجز الثانية', at(startSteps({ properties: approved(1) }), 'property').done);
ok('وعقارٌ بانتظار الاعتماد لا يُنجزها — ما لم يدخل المخزون لا يُطابَق',
  !at(startSteps({ properties: [{ id: 'x', captureStatus: 'pending' }] }), 'property').done);

ok('عميلٌ بلا طلبٍ لا يُنجز الثالثة — الطلبُ هو ما يُطابَق',
  !at(startSteps({ clients: [{ id: 'c' }] }), 'client').done);
ok('وعميلٌ وطلبُه يُنجزانها',
  at(startSteps({ clients: [{ id: 'c' }], requests: [{ id: 'r' }] }), 'client').done);

ok('ولا مطابقةَ محفوظةً = الرابعةُ لم تُنجَز — وهي الخطوةُ التي تُري النظامَ يعمل',
  !at(startSteps({ matches: [] }), 'match').done);
ok('وأوّلُ مطابقةٍ تُنجزها', at(startSteps({ matches: [{ id: 'm' }] }), 'match').done);

ok('نسخةٌ أُخذت تُنجز الخامسة', at(startSteps({ backup: { lastExportAt: '2026-01-01' } }), 'backup').done);
ok('ولا نسخةَ = لم تُنجَز', !at(startSteps({ backup: { lastExportAt: null } }), 'backup').done);

/* التقدّم */
const half = startSteps({ company: { name: 'كسّاب' }, properties: approved(3) });
const ph = startProgress(half);
ok('اثنتان من خمس', ph.done === 2 && ph.pct === 40, JSON.stringify([ph.done, ph.pct]));
ok('والتاليةُ أوّلُ ما لم يُنجَز بالترتيب', ph.next.key === 'client', ph.next.key);

const all = startSteps({
  company: { name: 'كسّاب' }, properties: approved(1),
  clients: [{ id: 'c' }], requests: [{ id: 'r' }],
  matches: [{ id: 'm' }],
  backup: { lastExportAt: '2026-01-01' },
});
const pa = startProgress(all);
ok('وخمسٌ من خمسٍ تكتمل', pa.complete && pa.pct === 100 && pa.next === null);
ok('وتقدّمٌ بلا خطواتٍ أصلًا لا ينفجر ولا يدّعي الاكتمال',
  startProgress([]).pct === 0 && startProgress([]).complete === false && startProgress().done === 0);

/* متى تُعرض البطاقة */
ok('تُعرض ما بقيت خطوة', shouldShowStart(empty, {}));
ok('وتختفي وحدها متى تمّت كلُّها — بلا إخفاءٍ يدويّ', !shouldShowStart(all, {}));
ok('ويُخفيها صاحبُها ولو بقيت خطوات — قرارُه لا قرارُنا', !shouldShowStart(empty, { startCardHidden: true }));
ok('وتُجيب دائمًا بنعم أو لا، لا بـundefined', typeof shouldShowStart() === 'boolean' && typeof shouldShowStart(all) === 'boolean');
