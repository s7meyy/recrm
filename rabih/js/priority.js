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
import { wilson, significant } from './interval.js';

/** تمييزٌ عربيّ سليم: «شكوى واحدة» و«شكويان» و«6 شكاوى» و«12 شكوى». */
function countWord(n) {
  if (n === 1) return 'شكوى واحدة';
  if (n === 2) return 'شكويان';
  if (n >= 3 && n <= 10) return `${n} شكاوى`;
  return `${n} شكوى`;
}

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
  // مقام الهامش: العيّنة، ومجتمعُها المنصوصةُ متى عُرفت وإلا فإجمالي قوقل.
  const sampleSize = reviews.length;
  const pop = place?.ratings?.withText || place?.ratings?.count || null;
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
    /* النسبة وحدها تُقرأ حكمًا قاطعًا على المنشأة، وهي وصفٌ للعيّنة له هامش.
       فيُذكر الهامش معها حيثما ذُكرت، لا في قسمٍ منفصل يُقرأ بعدها أو لا يُقرأ. */
    r.ci = wilson(r.count, sampleSize, pop);
    /* ذكرٌ مفرد أو ذكران لا يُرتَّبان: العيّنة لا تحمل ترتيبًا بينهما وبين غيرهما،
       فيُعرَضان للعلم بلا رقمِ أولوية — كما يمتنع التقرير عن الحكم عليهما. */
    r.lone = r.count < 3;
    const share = r.ci ? `${r.share}% من العيّنة ±${r.ci.margin}` : `${r.share}% من العيّنة`;
    const bits = [`${countWord(r.count)} (${share})`];
    if (r.worst !== null) bits.push(`أدناها ${r.worst} من 5`);
    if (r.recentCount) bits.push(`${r.recentCount} منها في آخر 90 يومًا`);
    r.why = bits.join('، ') + '.';
  }

  return rows.slice(0, limit);
}


/** رقمُ الأولوية — ويمتنع عمّا لا ترتّبه العيّنة. */
export function rankOf(rows, i) {
  if (rows[i].lone) return '·';
  return String(rows.slice(0, i + 1).filter((r) => !r.lone).length);
}

/** وسمُ الذكر المفرد — يُكتب بجانب اسم الموضوع في الجدولين معًا. */
export function loneTag(r) {
  if (!r.lone) return '';
  return `<span class="lone-tag">${r.count === 1 ? 'ذكرٌ مفرد' : 'ذكران'} — لا يُرتَّب</span>`;
}

/**
 * ملاحظتا الصدق فوق أي جدول أولويات: تقاربُ الأولى والثانية، ووجودُ ما لا يُرتَّب.
 * وهي مشتركةٌ بين معاينة التطبيق وجدول التقرير عمدًا، فلا يقول أحدهما ما ينفيه الآخر.
 */
export function priorityNotes(rows) {
  const out = [];
  const solid = rows.filter((r) => !r.lone);
  if (solid.length >= 2) {
    const a = solid[0].ci;
    const b = solid[1].ci;
    if (a && b && !significant(a, b).decided) {
      out.push(`<div class="msg-tie"><b>الأولى والثانية متقاربتان بقدر لا تفصله عيّنتك</b>
        (${solid[0].name}: ${solid[0].share}% ±${a.margin} · ${solid[1].name}: ${solid[1].share}% ±${b.margin}).
        فابدأ بأيسرهما عليك، أو بهما معًا — والترتيب بينهما ترجيحُ وزنٍ لا حكمُ فرق.</div>`);
    }
  }
  const lone = rows.filter((r) => r.lone);
  if (lone.length) {
    out.push(`<div class="msg-tie">${lone.length === 1 ? 'بندٌ واحد' : `${lone.length} بنود`} هنا بذكرٍ مفرد أو ذكرين
      (${lone.map((r) => r.name).join('، ')}) — تُعرَض للعلم بلا رقمِ أولوية، فعيّنتك لا تكفي لترتيبها.
      وقد تكون حادثةً عابرة، وقد تكون أول ظهورٍ لعيبٍ متكرّر، ولا يُعرَف ذلك إلا بتعليقاتٍ أكثر.</div>`);
  }
  if (!solid.length) {
    out.push('<div class="msg-tie"><b>لا يُرتَّب شيءٌ هنا</b> — كلّ ما ورد ذكرٌ مفرد أو ذكران، ولا تحمل عيّنتك ترتيبًا بينها.</div>');
  }
  return out.join('');
}

/** كتلة HTML للتقرير — الصدارة لما يستحقّها. */
export function priorityBlock(place) {
  const rows = priorities(place);
  if (!rows.length) return '';
  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const max = rows[0].weight || 1;

  const body = rows.map((r, i) => `<tr${r.lone ? ' class="lone-row"' : ''}>
      <td>${rankOf(rows, i)}</td>
      <td><b>${esc(r.name)}</b> ${loneTag(r)}<div class="fine">${esc(r.why)}</div></td>
      <td><span class="w-track"><span class="w-fill" style="width:${Math.round((r.weight / max) * 100)}%"></span></span></td>
      <td class="rid-cell">${r.ids.slice(0, 6).map((x) => `<span class="rid">${esc(x)}</span>`).join(' ')}</td>
    </tr>`).join('');

  const notes = priorityNotes(rows);

  return `<section class="priority">
    <h2>أولويات الإصلاح — بماذا تبدأ</h2>
    ${notes}
    <p class="note">مرتَّبة بوزنٍ محسوب من بياناتك: تكرار الشكوى × حدّة تقييمها × حداثتها. والمعرّفات بجانب كل بند لتراجعها بنفسك.</p>
    <table class="prio"><thead><tr><th>#</th><th>الموضوع</th><th>الوزن</th><th>الشواهد</th></tr></thead>
    <tbody>${body}</tbody></table>
  </section>`;
}
