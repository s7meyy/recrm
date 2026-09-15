// اختبار وحدة (المرحلة ٢٧): المعاينات القادمة، وما ينتظر انطباعًا، ونسبة المعاينة للصفقة.
import { upcomingShowings, needFeedback, showingStats } from '../js/util/showings.js';

const ok = (n, c, x = '') => console.log(`${c ? 'PASS' : 'FAIL'} — ${n}${x ? ' :: ' + x : ''}`);
const HOUR = 3600000;
const DAY = 86400000;
const now = Date.parse('2026-09-15T08:00:00.000Z');
const at = (ms) => new Date(now + ms).toISOString();

/* ===== القادمة ===== */
const list = [
  { id: 'a', status: 'scheduled', at: at(3 * HOUR) },
  { id: 'b', status: 'scheduled', at: at(30 * HOUR) },
  { id: 'c', status: 'scheduled', at: at(80 * HOUR) }, // أبعد من النافذة
  { id: 'd', status: 'done', at: at(2 * HOUR) }, // تمّت فليست موعدًا قادمًا
  { id: 'e', status: 'scheduled', at: at(-1 * HOUR) }, // فات بساعة: ما زال «حان موعدها»
  { id: 'f', status: 'scheduled', at: at(-5 * HOUR) }, // مضى أكثر من المهلة: صار ينتظر رأيًا
];
const up = upcomingShowings(list, { now });
ok('القادمة خلال النافذة فقط', up.map((x) => x.showing.id).join(',') === 'e,a,b', up.map((x) => x.showing.id).join(','));
ok('والأقرب موعدًا أولًا', up[0].showing.id === 'e');
ok('والتي تمّت ليست موعدًا', !up.some((x) => x.showing.id === 'd'));
// لا يظهر صفٌّ واحد في لوحتين: ما تجاوز المهلة يخرج من «قادمة» ويدخل «ما رأيه؟».
ok('وما مضى أكثر من المهلة ليس قادمًا', !up.some((x) => x.showing.id === 'f'));
ok('ولا تقاطع بين اللوحتين',
  !upcomingShowings(list, { now }).some((u) => needFeedback(list, { now }).some((n) => n.showing.id === u.showing.id)));
ok('والنافذة تُضبط', upcomingShowings(list, { now, withinHours: 4 }).length === 2, String(upcomingShowings(list, { now, withinHours: 4 }).length));

/* ===== ما ينتظر انطباعًا ===== */
const pending = [
  { id: 'p1', status: 'scheduled', at: at(-5 * HOUR) }, // مضت بلا انطباع
  { id: 'p2', status: 'scheduled', at: at(-1 * HOUR) }, // مضت ساعة فقط — سؤال مبكر
  { id: 'p3', status: 'done', impression: 'liked', at: at(-5 * HOUR) }, // سُجّل رأيه
  { id: 'p4', status: 'cancelled', at: at(-5 * HOUR) }, // أُلغيت فلا رأي
  { id: 'p5', status: 'done', at: at(-30 * DAY) }, // قديمة جدًا
  { id: 'p6', status: 'no_show', at: at(-6 * HOUR) }, // لم يحضر — ما زال يُسأل عمّا جرى
];
const need = needFeedback(pending, { now });
ok('المعاينة التي مضت بلا انطباع تُسأل', need.some((x) => x.showing.id === 'p1'));
ok('ولا تُسأل قبل ساعتين', !need.some((x) => x.showing.id === 'p2'));
ok('ومن سُجّل رأيه لا يُسأل', !need.some((x) => x.showing.id === 'p3'));
ok('والملغاة لا رأي لها', !need.some((x) => x.showing.id === 'p4'));
ok('والقديمة جدًا لا تصير أرشيف ذنوب', !need.some((x) => x.showing.id === 'p5'));
ok('والأقدم أولًا', need[0].showing.id === 'p6', need.map((x) => x.showing.id).join(','));

/* ===== الإحصاء ===== */
const showings = [
  { id: 's1', status: 'done', impression: 'liked', clientId: 'c1', propertyId: 'p1', at: at(-20 * DAY) },
  { id: 's2', status: 'done', impression: 'disliked', reason: 'price', clientId: 'c2', propertyId: 'p2', at: at(-15 * DAY) },
  { id: 's3', status: 'done', impression: 'disliked', reason: 'price', clientId: 'c3', propertyId: 'p3', at: at(-10 * DAY) },
  { id: 's4', status: 'done', impression: 'maybe', clientId: 'c4', propertyId: 'p4', at: at(-5 * DAY) },
  { id: 's5', status: 'no_show', clientId: 'c5', propertyId: 'p5', at: at(-4 * DAY) },
  { id: 's6', status: 'cancelled', clientId: 'c6', propertyId: 'p6', at: at(-3 * DAY) },
  { id: 's7', status: 'scheduled', clientId: 'c7', propertyId: 'p7', at: at(2 * DAY) },
];
const deals = [
  { id: 'd1', clientId: 'c1', propertyId: 'p1', date: new Date(now - 18 * DAY).toISOString() }, // بعد المعاينة ✓
  { id: 'd2', clientId: 'c4', propertyId: 'p9', date: new Date(now - 1 * DAY).toISOString() }, // عقار آخر ✗
  { id: 'd3', clientId: 'c2', propertyId: 'p2', date: new Date(now - 40 * DAY).toISOString() }, // قبل المعاينة ✗
];
const stats = showingStats({ showings, deals });
ok('تُعدّ التي تمّت وحدها', stats.done === 4, String(stats.done));
ok('والموعد القادم ليس معاينة', stats.scheduled === 1);
ok('ونسبة الحضور من المواعيد التي مضت', Math.round(stats.showRate * 100) === 67, String(stats.showRate));
ok('والصفقة بعد المعاينة على العقار نفسه تُنسب إليها', stats.converted === 1, String(stats.converted));
ok('وصفقة عقارٍ آخر لا تُنسب', !deals.some(() => stats.converted > 1));
ok('وصفقة سبقت المعاينة لا تُنسب', stats.converted === 1);
ok('ونسبة الإغلاق من التي تمّت', Math.round(stats.closeRate * 100) === 25, String(stats.closeRate));
ok('وعدد المعاينات لكل صفقة', stats.perDeal === 4, String(stats.perDeal));
ok('والانطباعات تُعدّ', stats.liked === 1 && stats.maybe === 1 && stats.disliked === 2);
ok('وأسباب عدم الإعجاب مجموعة مرتّبة', stats.reasons[0][0] === 'price' && stats.reasons[0][1] === 2, JSON.stringify(stats.reasons));
const empty = showingStats({});
ok('بلا معاينات: لا قسمة على صفر', empty.closeRate === null && empty.perDeal === null && empty.total === 0);
