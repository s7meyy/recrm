// كشف انحياز العيّنة — خللٌ يُفسد كل تقريرٍ مبنيٍّ على لصقٍ منحاز.
//
// قوقل يعرض توزيع النجوم كاملًا (كم خمسة وكم واحد)، ويرتّب التعليقات
// بـ«الأكثر صلة» لا بالعشوائية — فيقدّم المتطرّف. فعيّنتك التي لصقتَها قد
// لا تشبه منشأتك: تحمل سلبيًّا أكثر أو مدحًا أكثر.
//
// فيُقارَن توزيع عيّنتك بالتوزيع المُعلَن، ويُقال الفرق بالنقاط. ومن لم
// يُدخل التوزيع لا يُدَّعى له تمثيلٌ ولا انحياز — يُقال إنه غير معلوم.

import { computeDistribution } from './schema.js';

const pct = (n, total) => (total ? Number(((n / total) * 100).toFixed(1)) : null);

/**
 * @returns {{ok, rows, maxGap, verdict, note, sampleAvg, declaredAvg, avgGap}|null}
 */
export function sampleBias(place) {
  const declared = place?.ratings?.distribution || {};
  const total = [5, 4, 3, 2, 1].reduce((a, k) => a + (Number(declared[k]) || 0), 0);
  if (!total) return null;                       // لا توزيع معلن: لا حكم

  const sample = computeDistribution(place);
  if (!sample || !sample.counted) return null;

  const rows = [5, 4, 3, 2, 1].map((star) => {
    const d = pct(Number(declared[star]) || 0, total);
    const s = pct(sample.dist[star] || 0, sample.counted);
    return { star, declared: d, sample: s, gap: Number((s - d).toFixed(1)) };
  });

  const maxGap = rows.reduce((a, r) => (Math.abs(r.gap) > Math.abs(a.gap) ? r : a), rows[0]);

  // متوسطٌ من كل توزيع: فرقٌ في المتوسط أدلّ من فرقٍ في خانة واحدة.
  const avgOf = (get, n) => (n ? Number(([5, 4, 3, 2, 1].reduce((a, k) => a + k * get(k), 0) / n).toFixed(2)) : null);
  const declaredAvg = avgOf((k) => Number(declared[k]) || 0, total);
  const sampleAvg = avgOf((k) => sample.dist[k] || 0, sample.counted);
  const avgGap = (sampleAvg !== null && declaredAvg !== null) ? Number((sampleAvg - declaredAvg).toFixed(2)) : null;

  const negSample = rows.filter((r) => r.star <= 2).reduce((a, r) => a + (r.sample || 0), 0);
  const negDeclared = rows.filter((r) => r.star <= 2).reduce((a, r) => a + (r.declared || 0), 0);
  const negGap = Number((negSample - negDeclared).toFixed(1));

  let verdict = 'ممثِّلة';
  if (Math.abs(negGap) >= 15 || Math.abs(avgGap ?? 0) >= 0.5) verdict = 'منحازة';
  else if (Math.abs(negGap) >= 8 || Math.abs(avgGap ?? 0) >= 0.25) verdict = 'مائلة';

  const note = verdict === 'ممثِّلة'
    ? 'توزيع عيّنتك قريبٌ من المعلَن، فنسبها تصلح مؤشّرًا على المنشأة.'
    : `عيّنتك تحمل سلبيًّا ${negGap > 0 ? 'أكثر' : 'أقلّ'} من المعلَن بـ${Math.abs(negGap)} نقطة`
      + `${avgGap !== null ? `، ومتوسطها ${sampleAvg} مقابل ${declaredAvg} معلنًا` : ''}`
      + ' — فهي **ليست ممثِّلة**، والنسب في هذا التقرير نسب عيّنتك لا نسب منشأتك.';

  return { ok: true, rows, maxGap, negGap, verdict, note, sampleAvg, declaredAvg, avgGap, declaredTotal: total, sampleTotal: sample.counted };
}

export function biasBlock(place) {
  const b = sampleBias(place);
  if (!b) return '';
  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const cls = b.verdict === 'منحازة' ? 'err' : (b.verdict === 'مائلة' ? 'warn' : 'ok');

  return `<section class="bias">
    <h2>هل عيّنتك تمثّل منشأتك؟</h2>
    <table><thead><tr><th>النجوم</th><th>المعلَن في قوقل</th><th>في عيّنتك</th><th>الفرق</th></tr></thead>
    <tbody>${b.rows.map((r) => `<tr>
      <td>${r.star} ★</td><td>${r.declared}%</td><td>${r.sample}%</td>
      <td class="${Math.abs(r.gap) >= 8 ? 'err-text' : ''}">${r.gap > 0 ? '+' : ''}${r.gap}</td>
    </tr>`).join('')}</tbody></table>
    <p class="verdict ${cls}"><b>الحكم: ${esc(b.verdict)}.</b> ${esc(b.note).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')}</p>
  </section>`;
}
