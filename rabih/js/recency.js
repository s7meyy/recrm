// ترجيح الحداثة — متوسط 4.2 قد يخفي أن آخر ثلاثة أشهر كانت 2.8.
// كل ما هنا محسوب من تواريخ التعليقات نفسها، بلا نموذج ولا تقدير.

import { relativeDays } from './anomaly.js';
import { wilson, significant } from './interval.js';
import { topicsOf, topicSentiment, TOPICS } from './lexicon.js';

export const WINDOW_DAYS = 90;

/** يُرجع التعليقات مع عمرها بالأيام (أو null إن لم يُفهَم التاريخ). */
export function aged(place) {
  return (place?.reviews || []).map((r) => ({ ...r, ageDays: relativeDays(r.date) }));
}

const avg = (list) => {
  const rated = list.filter((r) => Number(r.rating) >= 1 && Number(r.rating) <= 5);
  if (!rated.length) return null;
  return Number((rated.reduce((a, r) => a + Number(r.rating), 0) / rated.length).toFixed(2));
};

/**
 * مقارنة نافذة حديثة بما قبلها.
 * @returns {{window:number, recent:{n,avg,neg}, older:{n,avg,neg}, diff:number|null,
 *            undated:number, verdict:'انحدار'|'تحسّن'|'ثبات'|'غير كافٍ'}}
 */
export function recentVsOlder(place, windowDays = WINDOW_DAYS) {
  const all = aged(place);
  const dated = all.filter((r) => r.ageDays !== null);
  const undated = all.length - dated.length;

  const recent = dated.filter((r) => r.ageDays <= windowDays);
  const older = dated.filter((r) => r.ageDays > windowDays);

  const share = (list) => {
    const rated = list.filter((r) => Number(r.rating) >= 1 && Number(r.rating) <= 5);
    if (!rated.length) return null;
    return Number(((rated.filter((r) => r.rating <= 2).length / rated.length) * 100).toFixed(1));
  };

  const a = { n: recent.length, avg: avg(recent), neg: share(recent) };
  const b = { n: older.length, avg: avg(older), neg: share(older) };

  const enough = a.n >= 3 && b.n >= 3;
  const diff = enough && a.avg !== null && b.avg !== null ? Number((a.avg - b.avg).toFixed(2)) : null;

  /* الحكم بعتبةٍ ثابتة (٠٫٣ نجمة) عند ثلاثة تعليقات يُسمّي الصدفة انحدارًا:
     تعليقٌ واحد بنجمة يهوي بمتوسط الثلاثة نصفَ نجمة. فيُشترط مع فرقِ النجوم
     أن تنفصل فترتا الثقة في نصيب السلبي بين الفترتين؛ وإلا فالقول: غير كافٍ.
     وهذا يُسقط أحكامًا كانت تُقال، وإسقاطُها أصدق من قولها. */
  const negRecent = wilson(recent.filter((r) => Number(r.rating) >= 1 && r.rating <= 2).length,
    recent.filter((r) => Number(r.rating) >= 1 && Number(r.rating) <= 5).length);
  const negOlder = wilson(older.filter((r) => Number(r.rating) >= 1 && r.rating <= 2).length,
    older.filter((r) => Number(r.rating) >= 1 && Number(r.rating) <= 5).length);
  const sig = significant(negRecent, negOlder);

  let verdict = 'غير كافٍ';
  let note = enough ? '' : 'يلزم ثلاثة تعليقات مؤرَّخة في كل فترة على الأقل.';
  if (diff !== null) {
    const moved = diff <= -0.3 ? 'انحدار' : (diff >= 0.3 ? 'تحسّن' : 'ثبات');
    if (moved === 'ثبات') { verdict = 'ثبات'; note = 'فرق المتوسط دون ثلاثة أعشار النجمة.'; }
    else if (sig.decided) { verdict = moved; note = sig.reason; }
    else { verdict = 'غير كافٍ'; note = `فرق المتوسط ${diff} نجمة، غير أنه ${sig.reason || 'لا يتجاوز هامش العيّنة'}`; }
  }

  return { window: windowDays, recent: a, older: b, diff, undated, verdict, note, decided: sig.decided };
}

/** تسمية عربية سليمة العدد: شهرين لا «2 أشهر»، وشهرًا لا «أشهر» بعد العشرة. */
function monthLabel(n) {
  if (n === 0) return 'هذا الشهر';
  if (n === 1) return 'قبل شهر';
  if (n === 2) return 'قبل شهرين';
  if (n <= 10) return `قبل ${n} أشهر`;
  return `قبل ${n} شهرًا`;
}

/** توزيع التعليقات على شهور مضت — خطٌّ زمني داخل التقرير الواحد. */
export function monthly(place, months = 12) {
  const dated = aged(place).filter((r) => r.ageDays !== null);
  if (!dated.length) return [];

  const buckets = new Map();
  for (const r of dated) {
    const m = Math.min(months - 1, Math.floor(r.ageDays / 30));
    const row = buckets.get(m) || { monthsAgo: m, n: 0, sum: 0, rated: 0, neg: 0 };
    row.n += 1;
    const v = Number(r.rating);
    if (v >= 1 && v <= 5) { row.sum += v; row.rated += 1; if (v <= 2) row.neg += 1; }
    buckets.set(m, row);
  }

  return [...buckets.values()]
    .map((b) => ({
      monthsAgo: b.monthsAgo,
      label: monthLabel(b.monthsAgo),
      n: b.n, neg: b.neg,
      avg: b.rated ? Number((b.sum / b.rated).toFixed(2)) : null,
    }))
    .sort((a, b) => b.monthsAgo - a.monthsAgo);   // الأقدم أولًا، فيُقرأ الخط من اليمين
}

/**
 * عمر كل موضوع: هل هو شكوى نشطة أم قديمة انتهت؟
 * @returns {Array<{id,name,recentNeg,olderNeg,lastSeenDays,state}>}
 */
export function topicAges(place, windowDays = WINDOW_DAYS) {
  const all = aged(place);
  const rows = new Map(TOPICS.map((t) => [t.id, {
    id: t.id, name: t.name, recentNeg: 0, olderNeg: 0, recentTotal: 0, olderTotal: 0, lastSeenDays: null, ids: [],
  }]));

  for (const r of all) {
    for (const id of topicsOf(r.text)) {
      const row = rows.get(id);
      if (!row) continue;
      const neg = topicSentiment(r, id) === 'neg';
      const recent = r.ageDays !== null && r.ageDays <= windowDays;
      if (recent) { row.recentTotal += 1; if (neg) { row.recentNeg += 1; row.ids.push(r.id); } }
      else if (r.ageDays !== null) { row.olderTotal += 1; if (neg) row.olderNeg += 1; }
      if (neg && r.ageDays !== null && (row.lastSeenDays === null || r.ageDays < row.lastSeenDays)) {
        row.lastSeenDays = r.ageDays;
      }
    }
  }

  return [...rows.values()]
    .filter((t) => t.recentNeg + t.olderNeg > 0)
    .map((t) => ({
      ...t,
      state: t.recentNeg && !t.olderNeg ? 'ناشئة'
        : (t.recentNeg && t.olderNeg ? (t.recentNeg > t.olderNeg ? 'متفاقمة' : 'مستمرة')
        : 'قديمة'),
    }))
    .sort((a, b) => b.recentNeg - a.recentNeg || b.olderNeg - a.olderNeg);
}

/** إنذارات صريحة تُوضَع في صدر التقرير وفي رسائل النماذج. */
export function alerts(place, windowDays = WINDOW_DAYS) {
  const out = [];
  const r = recentVsOlder(place, windowDays);

  if (r.verdict === 'انحدار') {
    out.push(`انحدار: متوسط آخر ${windowDays} يومًا ${r.recent.avg} مقابل ${r.older.avg} قبلها (${r.diff}).`);
  } else if (r.verdict === 'تحسّن') {
    out.push(`تحسّن: متوسط آخر ${windowDays} يومًا ${r.recent.avg} مقابل ${r.older.avg} قبلها (+${r.diff}).`);
  }
  if (r.recent.neg !== null && r.older.neg !== null && r.recent.neg - r.older.neg >= 15) {
    out.push(`نسبة السلبي ارتفعت من ${r.older.neg}% إلى ${r.recent.neg}% في آخر ${windowDays} يومًا.`);
  }

  for (const t of topicAges(place, windowDays)) {
    if (t.state === 'ناشئة' && t.recentNeg >= 2) {
      out.push(`شكوى ناشئة: «${t.name}» — ${t.recentNeg} مرات في آخر ${windowDays} يومًا ولم تَرِد قبلها (${t.ids.join('، ')}).`);
    } else if (t.state === 'متفاقمة' && t.recentNeg >= 2) {
      out.push(`شكوى متفاقمة: «${t.name}» — ${t.recentNeg} حديثة مقابل ${t.olderNeg} قديمة (${t.ids.join('، ')}).`);
    }
  }

  if (r.undated >= Math.max(3, Math.ceil((place?.reviews?.length || 0) * 0.4))) {
    out.push(`${r.undated} تعليقًا بلا تاريخ مفهوم — الحكم الزمني ناقص بقدرها.`);
  }
  return out;
}
