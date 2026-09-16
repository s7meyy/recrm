// المرحلة ٤٧ — هندسةُ الرسوم: الأعمدة والخطّ والحلقة، بلا مكتبة وبلا DOM.
import { columnLayout, linePoints, donutArcs, monthsBack } from '../js/util/charts.js';
const ok = (n, c, x = '') => console.log(`${c ? 'PASS' : 'FAIL'} — ${n}${x ? ' :: ' + x : ''}`);
const near = (a, b, eps = 0.51) => Math.abs(a - b) <= eps;

/* الأعمدة */
const cols = columnLayout([10, 20, 5], { width: 300, height: 140, pad: 20 });
ok('عمودٌ لكل قيمة', cols.length === 3);
ok('الأوّلُ إلى اليمين لا إلى اليسار — فالزمن في العربيّة يمينًا فيسارًا',
  cols[0].cx > cols[1].cx && cols[1].cx > cols[2].cx, cols.map((c) => c.cx).join('،'));
ok('وأعلى قيمةٍ أطولُ عمود', cols[1].h > cols[0].h && cols[0].h > cols[2].h);
ok('والأطولُ يملأ المساحة المتاحة', near(cols[1].h, 140 - 20 - 20), String(cols[1].h));
ok('والارتفاعُ نسبيّ: نصفُ القيمة نصفُ العمود', near(cols[0].h, cols[1].h / 2), `${cols[0].h}/${cols[1].h}`);
ok('وقاعُ الأعمدة واحد', cols.every((c) => near(c.y + c.h, 140 - 20)));
ok('ولا يخرج عمودٌ عن الإطار', cols.every((c) => c.x >= 0 && c.x + c.w <= 300));

const zero = columnLayout([0, 0], { width: 300, height: 140 });
ok('كلُّ القيم صفرٌ: لا ارتفاعَ ولا قسمةٌ على صفر', zero.every((c) => c.h === 0));
const tiny = columnLayout([1, 1000], { width: 300, height: 140 });
ok('وقيمةٌ صغيرةٌ جدًّا تبقى مرئيّةً لا تختفي', tiny[0].h >= 2, String(tiny[0].h));
ok('لكن الصفرَ يبقى صفرًا — لا شعرةَ تكذب', columnLayout([0, 1000])[0].h === 0);
ok('والسالبُ يُقصّ إلى الصفر: هذا شكلُ مقاديرَ لا ميزان', columnLayout([-5, 10])[0].h === 0);
ok('ولا قيمَ = لا أعمدة', columnLayout([]).length === 0);
ok('وقيمةٌ واحدةٌ لا تنفجر', columnLayout([7]).length === 1);
ok('وقيمةٌ فاسدةٌ تُقرأ صفرًا لا NaN',
  columnLayout(['كلام', 5]).every((c) => Number.isFinite(c.h)), JSON.stringify(columnLayout(['كلام', 5]).map((c) => c.h)));

/* الخطّ */
const ln = linePoints([1, 2, 3, 4], { width: 300, height: 140, pad: 20 });
ok('نقطةٌ لكل قيمة', ln.points.length === 4);
ok('والزمنُ يسير من اليمين إلى اليسار', ln.points[0].x > ln.points[3].x, `${ln.points[0].x} > ${ln.points[3].x}`);
ok('وطرفاه يلامسان حافّتي الإطار الداخليّتين', near(ln.points[0].x, 280) && near(ln.points[3].x, 20));
ok('والأعلى قيمةً أعلى موضعًا (y أصغر)', ln.points[3].y < ln.points[0].y);
ok('والمسارُ يبدأ بـM ثم L', ln.d.startsWith('M') && ln.d.includes('L'));
ok('والمساحةُ تُغلق بـZ', ln.area.endsWith('Z'));
ok('ويُذكر الأدنى والأعلى', ln.min === 0 && ln.max === 4, JSON.stringify([ln.min, ln.max]));
const flat = linePoints([5, 5, 5], { width: 300, height: 140 });
ok('وخطٌّ مستوٍ لا يقسم على صفر', flat.points.every((p) => Number.isFinite(p.y)));
ok('ونقطةٌ واحدةٌ لا تنفجر', linePoints([3]).points.length === 1);
ok('ولا نقاطَ = مسارٌ فارغ', linePoints([]).d === '' && linePoints([]).area === '');
ok('والقاعُ يبدأ من الصفر لا من أصغر قيمة — فلا يُضخَّم فرقٌ صغير',
  linePoints([100, 101], { width: 300, height: 140 }).min === 0);

/* الحلقة */
const d1 = donutArcs([50, 30, 20], { size: 150, thickness: 26 });
ok('قوسٌ لكل حصّة', d1.arcs.length === 3);
ok('والمجموعُ محفوظ', d1.total === 100);
ok('والحصصُ نسبٌ من الكلّ', near(d1.arcs[0].share, 0.5, 0.001) && near(d1.arcs[2].share, 0.2, 0.001));
ok('ومجموعُ الحصص واحدٌ صحيح', near(d1.arcs.reduce((a, x) => a + x.share, 0), 1, 0.0001));
ok('وكلُّ قوسٍ مسارٌ صالح', d1.arcs.every((a) => a.d.startsWith('M') && a.d.includes('A')));
ok('وحصّةٌ أكبرُ من نصفٍ تُرسم بقوسٍ كبير', donutArcs([70, 30]).arcs[0].d.includes(' 1 1 '));
const whole = donutArcs([9]);
ok('وحصّةٌ واحدةٌ تملأ الحلقة بدائرتين — فالقوسُ لا يُغلق على ٣٦٠',
  whole.arcs[0].d.split('A').length === 3, whole.arcs[0].d);
ok('ولا قيمَ = لا أقواس ولا قسمةٌ على صفر', donutArcs([]).arcs.length === 0 && donutArcs([]).total === 0);
ok('وكلُّها أصفار = لا شيء يُرسم', donutArcs([0, 0]).arcs.length === 0);
ok('والسالبُ يُقصّ', donutArcs([-5, 5]).total === 5);

/* محور الأشهر */
const ms = monthsBack(3, Date.parse('2026-03-15T00:00:00Z'));
ok('ثلاثةُ أشهرٍ إلى الوراء', ms.length === 3);
ok('والأحدثُ أوّلًا', ms[0].key === '2026-03' && ms[2].key === '2026-01', ms.map((m) => m.key).join('،'));
ok('وأسماؤها عربيّة', ms[0].label === 'مارس' && ms[2].label === 'يناير', ms.map((m) => m.label).join('،'));
const cross = monthsBack(3, Date.parse('2026-01-15T00:00:00Z'));
ok('ويعبر رأس السنة إلى ما قبلها', cross[2].key === '2025-11', cross.map((m) => m.key).join('،'));
const endOfMonth = monthsBack(2, Date.parse('2026-03-31T12:00:00Z'));
ok('و٣١ مارس لا يقفز إلى مارس مرّتين', endOfMonth[0].key === '2026-03' && endOfMonth[1].key === '2026-02', endOfMonth.map((m) => m.key).join('،'));
