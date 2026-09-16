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
      months: perMonth > 0 && fives ? fives / perMonth : null,
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
/**
 * مدةٌ تُقرأ.
 *
 * كان الجدول يقول «0 شهرًا» و«0.1 شهرًا» و«0.8 شهرًا» — وعُشرُ الشهر ثلاثة
 * أيام، و«صفر شهر» كذبٌ صريح عن واحدٍ وعشرين تقييمًا لا تأتي في يوم.
 * فما دون الشهر يُقال بالأيام، والشهران فما فوق يُجبَران.
 */
function durationLabel(months) {
  if (months === null || months === undefined) return '—';
  const days = Math.round(months * 30);
  if (days <= 0) return 'أقلّ من يوم';
  if (days === 1) return 'يوم واحد';
  if (days === 2) return 'يومان';
  // ما دون الشهرين يُقال بالأيام: «36 يومًا» أوضح من «1.2 أشهر».
  if (days <= 10) return `${days} أيام`;
  if (days < 60) return `${days} يومًا`;

  const m = Math.round(months);
  if (m < 24) return m === 2 ? 'شهران' : (m <= 10 ? `${m} أشهر` : `${m} شهرًا`);

  const y = Math.round(months / 12 * 10) / 10;
  return y === 2 ? 'سنتان' : `${y} سنة`;
}

export function starsBlock(place, { perMonth = 0 } = {}) {
  const avg = place?.ratings?.average;
  const count = place?.ratings?.count;
  const l = ladder(avg, count, { perMonth });
  if (!l || !l.rows.length) return '';

  /* **حارسٌ على معدّل التقييمات.**
     الحقلان متجاوران في الشاشة: «عدد العملاء شهريًّا» و«كم تقييمًا جديدًا
     تتلقّى شهريًّا». فإن كُتب في الثاني عددُ العملاء (900 بدل 8) قال الجدول
     بثقة: «تبلغ 4.25 في يوم واحد» — ورقمٌ سخيفٌ واحد يُسقط الثقة بما حوله.
     والمحال بيّنٌ: لا يأتيك في شهرٍ تقييماتٌ أكثر مما جمعتَه في عمر محلّك. */
  const implausible = perMonth > 0 && Number.isFinite(count) && count > 0 && perMonth > count / 3;
  const rateNote = implausible
    ? `<div class="msg warn"><b>راجع «معدّل التقييمات الجديدة»: ${perMonth.toLocaleString('ar-SA-u-nu-latn')} شهريًّا</b>
        — وعندك ${count.toLocaleString('ar-SA-u-nu-latn')} تقييمًا في عمر محلّك كلِّه، فهذا المعدّل يجمعها في أقلّ من ثلاثة أشهر.
        ولعلّه عددُ عملائك لا عددُ تقييماتك؛ والحقلان متجاوران. وعمودُ «المدة» أدناه مبنيٌّ عليه، فصحِّحه ليصحّ.</div>`
    : '';

  // عمود الأربع نجوم لا يُعرَض إلا إن كان يبلغ هدفًا: فوق أربعٍ لا يرفعها شيء دونها.
  const showFours = l.rows.some((r) => r.fours !== null);
  const rows = l.rows.map((r) => `<tr>
      <td><b>${r.target}</b></td>
      <td>${r.fives === null ? '—' : r.fives.toLocaleString('ar-SA-u-nu-latn')}</td>
      ${showFours ? `<td>${r.fours === null ? '—' : r.fours.toLocaleString('ar-SA-u-nu-latn')}</td>` : ''}
      ${perMonth > 0 ? `<td>${durationLabel(r.months)}</td>` : ''}
    </tr>`).join('');

  return `<section class="stars-calc">
    <h2>ما الذي يلزم لرفع التقييم</h2>
    ${rateNote}
    <p class="note">حسابٌ مباشر من متوسطك (${l.avg}) وعدد تقييماتك (${l.count.toLocaleString('ar-SA-u-nu-latn')}): المتوسط مجموعُ النجوم على عددها، فكل رقم أدناه مشتقٌّ منه لا مُقدَّر.</p>
    <table><thead><tr>
      <th>الهدف</th><th>تقييمات بخمس نجوم</th>${showFours ? '<th>أو بأربع نجوم</th>' : ''}${perMonth > 0 ? '<th>المدة بمعدّلك</th>' : ''}
    </tr></thead><tbody>${rows}</tbody></table>
    ${showFours ? '' : `<p class="fine">ولا يُبلَغ أيٌّ من هذه الأهداف بتقييمات أربع نجوم: متوسطك ${l.avg} فوقها أو قريبٌ منها، فالرافع خمسٌ وحدها.</p>`}
    <p class="fine">وتقييمٌ واحد بنجمة يُنزل متوسطك <b>${Math.abs(l.drop.one).toFixed(3)}</b>، وعشرةٌ تُنزله <b>${Math.abs(l.drop.ten).toFixed(2)}</b>.
    فالمحافظة على ما عندك أرخص من تعويضه.</p>
  </section>`;
}
