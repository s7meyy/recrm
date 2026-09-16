// أثر الخطة مقيسًا — إثبات أن العمل السابق نفع.
//
// خطة العمل موجودة والمقارنة الزمنية موجودة، ولا شيء يربطهما. فالعميل يرى
// تشخيصًا جديدًا كل مرة ولا يرى **دليلًا أن الأول نفع** — وهذا ما يجدّد به
// الاشتراك أو يتركه.
//
// فتُربط كل مهمة بمواضيعها (من سندها ونصّها)، ويُقاس ما تغيّر في تلك المواضيع
// بين التقريرين. والقياس صريح: عدد الشكاوى قبل وبعد، ونصيبها من العيّنة —
// لأن العيّنتين قد تختلفان حجمًا فالعدد المجرّد يخدع.
//
// **ولا يُدَّعى سبب**: تحسّنٌ بعد المهمة اقترانٌ لا برهان، ويُقال كذلك.

import { topicsOf, topicSentiment, TOPICS } from './lexicon.js';

const nameOf = (id) => TOPICS.find((t) => t.id === id)?.name || id;

/** عدّ الشكاوى لكل موضوع في منشأة. */
function negCounts(place) {
  const map = new Map();
  const reviews = place?.reviews || [];
  for (const r of reviews) {
    for (const id of topicsOf(r.text)) {
      if (topicSentiment(r, id) !== 'neg') continue;
      map.set(id, (map.get(id) || 0) + 1);
    }
  }
  return { map, total: reviews.length };
}

/** مواضيع المهمة: من نصّها وسندها معًا. */
export function taskTopics(task) {
  const text = `${task?.text || ''} ${task?.metric || ''}`;
  return [...new Set(topicsOf(text))];
}

/**
 * @param {object} oldJob التقرير الأقدم (الذي وُضعت خطته)
 * @param {object} newJob التقرير الأحدث
 * @returns {{rows:Array, measured:number, improved:number, worsened:number}}
 */
export function planEffect(oldJob, newJob) {
  const tasks = oldJob?.plan || [];
  if (!tasks.length) return { rows: [], measured: 0, improved: 0, worsened: 0 };

  const before = negCounts(oldJob.place);
  const after = negCounts(newJob.place);

  const rows = tasks.map((t) => {
    const ids = taskTopics(t);
    const b = ids.reduce((a, id) => a + (before.map.get(id) || 0), 0);
    const a2 = ids.reduce((a, id) => a + (after.map.get(id) || 0), 0);

    // النصيب لا العدد: عيّنة ٨ ليست كعيّنة ٨٠.
    const bShare = before.total ? b / before.total : null;
    const aShare = after.total ? a2 / after.total : null;
    const deltaShare = (bShare !== null && aShare !== null) ? Number(((aShare - bShare) * 100).toFixed(1)) : null;

    return {
      text: t.text,
      status: t.status,
      topics: ids.map(nameOf),
      measurable: ids.length > 0 && b > 0,
      before: b,
      after: a2,
      beforeShare: bShare === null ? null : Number((bShare * 100).toFixed(1)),
      afterShare: aShare === null ? null : Number((aShare * 100).toFixed(1)),
      deltaShare,
      direction: deltaShare === null ? null : (deltaShare < -1 ? 'تحسّن' : (deltaShare > 1 ? 'تراجع' : 'ثبات')),
    };
  });

  const measured = rows.filter((r) => r.measurable).length;
  return {
    rows,
    measured,
    improved: rows.filter((r) => r.measurable && r.direction === 'تحسّن').length,
    worsened: rows.filter((r) => r.measurable && r.direction === 'تراجع').length,
    beforeTotal: before.total,
    afterTotal: after.total,
  };
}

export function effectBlock(oldJob, newJob) {
  const e = planEffect(oldJob, newJob);
  if (!e.rows.length) return '';
  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const arrow = (r) => {
    if (!r.measurable) return '<span class="fine">لا يُقاس من التعليقات</span>';
    if (r.direction === 'تحسّن') return `<span class="delta up">▼ ${Math.abs(r.deltaShare)}٪</span>`;
    if (r.direction === 'تراجع') return `<span class="delta down">▲ ${r.deltaShare}٪</span>`;
    return '<span class="fine">بلا تغيّر</span>';
  };

  const rows = e.rows.map((r) => `<tr>
      <td>${esc(r.text)}<div class="fine">${esc(r.topics.join('، ') || '—')}</div></td>
      <td>${r.before} <span class="fine">(${r.beforeShare ?? '—'}٪)</span></td>
      <td>${r.after} <span class="fine">(${r.afterShare ?? '—'}٪)</span></td>
      <td>${arrow(r)}</td>
    </tr>`).join('');

  return `<section class="effect">
    <h2>أثر الخطة السابقة — مقيسًا</h2>
    <p class="note">لكل مهمة من خطة التقرير السابق: كم شكوى كانت في موضوعها، وكم صارت. والمقارنة <b>بالنصيب من العيّنة</b> لا بالعدد المجرّد، لأن العيّنتين تختلفان حجمًا (${e.beforeTotal} ← ${e.afterTotal}).</p>
    <table><thead><tr><th>المهمة</th><th>شكاوى قبل</th><th>شكاوى بعد</th><th>الفرق</th></tr></thead><tbody>${rows}</tbody></table>
    <p class="fine">قِيست ${e.measured} مهمة من ${e.rows.length}${e.improved ? `، تحسّن ${e.improved}` : ''}${e.worsened ? `، وتراجع ${e.worsened}` : ''}.
    <b>والتحسّن بعد المهمة اقترانٌ لا برهان</b>: قد يكون للمهمة، وقد يكون لغيرها.</p>
  </section>`;
}
