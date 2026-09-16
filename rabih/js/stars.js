// حاسبة النجوم — الجواب الحسابي على سؤال كل صاحب محل: «كيف أرفع تقييمي؟»
//
// لا رأي هنا ولا تقدير: متوسط قوقل يُحسَب من مجموع النجوم على عددها، فمنه
// يُشتقّ كل ما يلي اشتقاقًا. وقيمته أنه يُري المالك أن التقييم لا يُرفَع
// بالتمنّي: قد يحتاج مئةً وستين تقييمًا ممتازًا ليتحرّك من ٤٫١ إلى ٤٫٥.
//
//   المطلوب لبلوغ هدفٍ H بتقييماتٍ من فئة S:
//     (avg·n + S·x) / (n + x) = H   ⟵   x = n·(H − avg) / (S − H)

/** كم تقييمًا من فئة `star` يلزم لبلوغ `target`؟ أو null إن تعذّر. */
export function needed(avg, count, target, star = 5) {
  const a = Number(avg);
  const n = Number(count);
  const h = Number(target);
  if (!Number.isFinite(a) || !Number.isFinite(n) || n <= 0 || !Number.isFinite(h)) return null;
  if (h <= a) return 0;                    // بلغتَه أصلًا
  if (h >= star) return null;              // لا يُبلَغ بفئةٍ دونه مهما كثرت
  const x = (n * (h - a)) / (star - h);
  return Math.ceil(x);
}

/** أثر تقييمٍ واحد جديد على المتوسط. */
export function impactOfOne(avg, count, star) {
  const a = Number(avg);
  const n = Number(count);
  if (!Number.isFinite(a) || !Number.isFinite(n) || n <= 0) return null;
  const after = (a * n + Number(star)) / (n + 1);
  return Number((after - a).toFixed(4));
}

/** كم تقييمًا بنجمة يُنزلك إلى `floor`؟ */
export function harmToReach(avg, count, floor, star = 1) {
  const a = Number(avg);
  const n = Number(count);
  const f = Number(floor);
  if (!Number.isFinite(a) || !Number.isFinite(n) || n <= 0 || !Number.isFinite(f)) return null;
  if (f >= a) return 0;
  if (f <= star) return null;
  return Math.ceil((n * (a - f)) / (f - star));
}

/**
 * جدول الأهداف: ما فوق متوسطك الحالي بأرباع النجمة، حتى ٤٫٩.
 * @returns {{avg,count,rows:Array<{target,fives,fours,months}>,drop:{one,ten},reachable:boolean}}
 */
export function ladder(avg, count, { perMonth = 0 } = {}) {
  const a = Number(avg);
  const n = Number(count);
  if (!Number.isFinite(a) || !Number.isFinite(n) || n <= 0) return null;

  const targets = [];
  for (let t = Math.ceil((a + 0.05) * 20) / 20; t <= 4.9; t = Number((t + 0.1).toFixed(2))) {
    targets.push(Number(t.toFixed(2)));
    if (targets.length >= 6) break;
  }

  const rows = targets.map((t) => {
    const fives = needed(a, n, t, 5);
    const fours = needed(a, n, t, 4);
    return {
      target: t,
      fives,
      fours,
      // الشهور المتوقَّعة بمعدّل التقييمات الذي يُدخله المالك — لا بتقديرٍ منّا.
      months: perMonth > 0 && fives ? Number((fives / perMonth).toFixed(1)) : null,
    };
  });

  return {
    avg: a,
    count: n,
    rows,
    drop: { one: impactOfOne(a, n, 1), ten: Number(((a * n + 10) / (n + 10) - a).toFixed(3)) },
    gain: { one: impactOfOne(a, n, 5) },
    reachable: rows.some((r) => r.fives !== null),
  };
}

/** كتلة HTML للتقرير. */
export function starsBlock(place, { perMonth = 0 } = {}) {
  const avg = place?.ratings?.average;
  const count = place?.ratings?.count;
  const l = ladder(avg, count, { perMonth });
  if (!l || !l.rows.length) return '';

  // عمود الأربع نجوم لا يُعرَض إلا إن كان يبلغ هدفًا: فوق أربعٍ لا يرفعها شيء دونها.
  const showFours = l.rows.some((r) => r.fours !== null);
  const rows = l.rows.map((r) => `<tr>
      <td><b>${r.target}</b></td>
      <td>${r.fives === null ? '—' : r.fives.toLocaleString('ar-SA')}</td>
      ${showFours ? `<td>${r.fours === null ? '—' : r.fours.toLocaleString('ar-SA')}</td>` : ''}
      ${perMonth > 0 ? `<td>${r.months === null ? '—' : r.months + ' شهرًا'}</td>` : ''}
    </tr>`).join('');

  return `<section class="stars-calc">
    <h2>ما الذي يلزم لرفع التقييم</h2>
    <p class="note">حسابٌ مباشر من متوسطك (${l.avg}) وعدد تقييماتك (${l.count.toLocaleString('ar-SA')}): المتوسط مجموعُ النجوم على عددها، فكل رقم أدناه مشتقٌّ منه لا مُقدَّر.</p>
    <table><thead><tr>
      <th>الهدف</th><th>تقييمات بخمس نجوم</th>${showFours ? '<th>أو بأربع نجوم</th>' : ''}${perMonth > 0 ? '<th>المدة بمعدّلك</th>' : ''}
    </tr></thead><tbody>${rows}</tbody></table>
    ${showFours ? '' : `<p class="fine">ولا يُبلَغ أيٌّ من هذه الأهداف بتقييمات أربع نجوم: متوسطك ${l.avg} فوقها أو قريبٌ منها، فالرافع خمسٌ وحدها.</p>`}
    <p class="fine">وتقييمٌ واحد بنجمة يُنزل متوسطك <b>${Math.abs(l.drop.one).toFixed(3)}</b>، وعشرةٌ تُنزله <b>${Math.abs(l.drop.ten).toFixed(2)}</b>.
    فالمحافظة على ما عندك أرخص من تعويضه.</p>
  </section>`;
}
