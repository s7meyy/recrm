// ترتيب أولويات الإصلاح: «بماذا أبدأ؟»
//
// التقرير يقول ما في المنشأة من عيوب، ولا يقول أيَّها أولًا — فيقرؤه المالك
// فيعجز عن الفعل. وهذا يرتّبها برقمٍ محسوبٍ من بياناتك وحدها، بلا نموذج:
//
//   الوزن = التكرار × الحدّة × الحداثة
//
// **التكرار**: كم تعليقًا اشتكى من هذا الموضوع.
// **الحدّة**: كم كانت نجوم من اشتكى — شكوى بنجمةٍ ليست كشكوى بأربع.
// **الحداثة**: شكوى هذا الشهر ليست كشكوى السنة الماضية؛ الأولى تصف حالك
//             اليوم، والثانية قد تكون عولجت.
//
// ولا يُخترَع شيء: كل عنصرٍ في الوزن مأخوذٌ من التعليقات نفسها، ومعرّفاتها
// مذكورة بجانبه ليُراجَع.

import { topicStats } from './lexicon.js';
import { relativeDays } from './anomaly.js';

/** حدّةٌ من التقييم: النجمة الواحدة ضعف الأربع في الأثر. */
function severityOf(rating) {
  if (rating === null || rating === undefined) return 0.6;   // بلا تقييم: وسط، ولا يُخمَّن
  if (rating <= 1) return 1;
  if (rating === 2) return 0.85;
  if (rating === 3) return 0.55;
  return 0.3;                                                 // شكوى داخل تقييمٍ مرتفع
}

/** حداثةٌ متدرّجة: اليوم ١، وبعد سنة ٠٫٢٥، وبلا تاريخ ٠٫٦. */
function recencyOf(days) {
  if (days === null || days === undefined) return 0.6;
  if (days <= 30) return 1;
  if (days <= 90) return 0.85;
  if (days <= 180) return 0.65;
  if (days <= 365) return 0.45;
  return 0.25;
}

/**
 * @returns {Array<{id,name,count,ids,severity,recency,weight,share,recentCount,worst,why}>}
 */
export function priorities(place, { limit = 8 } = {}) {
  const reviews = place?.reviews || [];
  if (!reviews.length) return [];

  const byId = new Map(reviews.map((r) => [r.id, r]));
  const rows = [];

  for (const t of topicStats(place)) {
    if (!t.negIds.length) continue;

    const items = t.negIds.map((id) => byId.get(id)).filter(Boolean);
    const sev = items.reduce((a, r) => a + severityOf(r.rating), 0) / items.length;
    const ages = items.map((r) => relativeDays(r.date));
    const rec = ages.reduce((a, d) => a + recencyOf(d), 0) / items.length;
    const recentCount = ages.filter((d) => d !== null && d <= 90).length;

    const rated = items.filter((r) => r.rating !== null);
    const worst = rated.length ? Math.min(...rated.map((r) => r.rating)) : null;

    rows.push({
      id: t.id,
      name: t.name,
      count: items.length,
      ids: t.negIds.slice(0, 12),
      severity: Number(sev.toFixed(2)),
      recency: Number(rec.toFixed(2)),
      recentCount,
      worst,
      share: Number(((items.length / reviews.length) * 100).toFixed(1)),
      weight: Number((items.length * sev * rec).toFixed(2)),
    });
  }

  rows.sort((a, b) => b.weight - a.weight);

  // سببٌ مكتوب بلغة صاحب المحل، مبنيّ على الأرقام نفسها لا على رأي.
  for (const r of rows) {
    const bits = [`${r.count} شكوى (${r.share}% من العيّنة)`];
    if (r.worst !== null) bits.push(`أدناها ${r.worst} من 5`);
    if (r.recentCount) bits.push(`${r.recentCount} منها في آخر 90 يومًا`);
    r.why = bits.join('، ') + '.';
  }

  return rows.slice(0, limit);
}

/** كتلة HTML للتقرير — الصدارة لما يستحقّها. */
export function priorityBlock(place) {
  const rows = priorities(place);
  if (!rows.length) return '';
  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const max = rows[0].weight || 1;

  const body = rows.map((r, i) => `<tr>
      <td>${i + 1}</td>
      <td><b>${esc(r.name)}</b><div class="fine">${esc(r.why)}</div></td>
      <td><span class="w-track"><span class="w-fill" style="width:${Math.round((r.weight / max) * 100)}%"></span></span></td>
      <td class="rid-cell">${r.ids.slice(0, 6).map((x) => `<span class="rid">${esc(x)}</span>`).join(' ')}</td>
    </tr>`).join('');

  return `<section class="priority">
    <h2>أولويات الإصلاح — بماذا تبدأ</h2>
    <p class="note">مرتَّبة بوزنٍ محسوب من بياناتك: تكرار الشكوى × حدّة تقييمها × حداثتها. والمعرّفات بجانب كل بند لتراجعها بنفسك.</p>
    <table class="prio"><thead><tr><th>#</th><th>الموضوع</th><th>الوزن</th><th>الشواهد</th></tr></thead>
    <tbody>${body}</tbody></table>
  </section>`;
}
