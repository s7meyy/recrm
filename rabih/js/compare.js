// المقارنات — الزمنية (منشأة واحدة عبر تقريرين) والتنافسية (منشآت في نفس الحي والتصنيف).
// كلتاهما تُحسَبان برمجيًّا من الأرشيف، فلا نموذج يُستشار ولا رقم يُقدَّر.

import { stats } from './schema.js';
import { topicStats } from './lexicon.js';
import { wilson, significant } from './interval.js';
import { recentVsOlder, topicAges } from './recency.js';

const key = (job) => `${job.mapsUrl || ''}|${(job.place?.identity?.name || '').trim()}`;

/** يجمع تقارير كل منشأة على حدة، مرتّبةً من الأقدم إلى الأحدث. */
export function groupByPlace(jobs) {
  const map = new Map();
  for (const j of jobs) {
    const k = key(j);
    map.set(k, [...(map.get(k) || []), j]);
  }
  for (const list of map.values()) {
    list.sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
  }
  return map;
}

/** المنشآت التي لها تقريران فأكثر — وهي وحدها القابلة للمقارنة الزمنية. */
export function comparablePlaces(jobs) {
  return [...groupByPlace(jobs).entries()]
    .filter(([, list]) => list.length >= 2)
    .map(([k, list]) => ({ key: k, name: list[0].place?.identity?.name || 'بلا اسم', count: list.length, jobs: list }));
}

const delta = (now, before) => {
  if (now === null || now === undefined || before === null || before === undefined) return null;
  return Number((now - before).toFixed(2));
};

/**
 * ماذا تغيّر بين تقريرين لنفس المنشأة.
 * @returns {{from,to,days,ratings,topics:{worse,better,gone,new:Array},plan}}
 */
export function timeline(oldJob, newJob) {
  const a = stats(oldJob.place);
  const b = stats(newJob.place);

  const ta = new Map(topicStats(oldJob.place).map((t) => [t.id, t]));
  const tb = new Map(topicStats(newJob.place).map((t) => [t.id, t]));

  const worse = [], better = [], gone = [], fresh = [];
  for (const [id, now] of tb) {
    const before = ta.get(id);
    if (!before) {
      if (now.neg > 0) fresh.push({ name: now.name, neg: now.neg, ids: now.negIds });
      continue;
    }
    const d = now.neg - before.neg;
    if (d > 0) worse.push({ name: now.name, from: before.neg, to: now.neg, diff: d });
    else if (d < 0) better.push({ name: now.name, from: before.neg, to: now.neg, diff: d });
  }
  for (const [id, before] of ta) {
    if (!tb.has(id) && before.neg > 0) gone.push({ name: before.name, was: before.neg });
  }

  const days = (() => {
    const d1 = Date.parse(oldJob.createdAt || '');
    const d2 = Date.parse(newJob.createdAt || '');
    return Number.isFinite(d1) && Number.isFinite(d2) ? Math.round((d2 - d1) / 86400000) : null;
  })();

  // المهام التي كانت في خطة التقرير السابق وأُنجزت.
  const doneTasks = (oldJob.plan || []).filter((t) => t.status === 'done');

  return {
    from: oldJob, to: newJob, days,
    ratings: {
      googleAverage: { before: a.googleAverage, now: b.googleAverage, diff: delta(b.googleAverage, a.googleAverage) },
      googleCount:   { before: a.googleCount,   now: b.googleCount,   diff: delta(b.googleCount, a.googleCount) },
      sampleAverage: { before: a.sampleAverage, now: b.sampleAverage, diff: delta(b.sampleAverage, a.sampleAverage) },
      negativeShare: {
        before: a.rated ? Number(((a.negative / a.rated) * 100).toFixed(1)) : null,
        now:    b.rated ? Number(((b.negative / b.rated) * 100).toFixed(1)) : null,
        get diff() { return delta(this.now, this.before); },
      },
      replyRate: { before: a.replyRate, now: b.replyRate, diff: delta(b.replyRate, a.replyRate) },
    },
    topics: {
      worse:  worse.sort((x, y) => y.diff - x.diff),
      better: better.sort((x, y) => x.diff - y.diff),
      gone, new: fresh,
    },
    plan: { total: (oldJob.plan || []).length, done: doneTasks.length, tasks: doneTasks },
  };
}

/** المنشآت المنافسة في الأرشيف: نفس المدينة والتصنيف، وتُفضَّل نفس الحي. */
export function competitors(jobs, target) {
  const c = target.ctx || {};
  const targetKey = key(target);
  const same = jobs.filter((j) =>
    j.id !== target.id &&
    key(j) !== targetKey &&          // تقرير أقدم للمنشأة نفسها ليس منافسًا لها

    j.ctx?.cityId === c.cityId &&
    j.ctx?.categoryId === c.categoryId &&
    (j.place?.reviews?.length || 0) > 0);

  // أحدث تقرير لكل منشأة فقط، كي لا تُقارَن منشأة بنفسها مرتين.
  const latest = new Map();
  for (const j of same) {
    const k = key(j);
    const prev = latest.get(k);
    if (!prev || String(j.createdAt || '') > String(prev.createdAt || '')) latest.set(k, j);
  }

  return [...latest.values()].sort((a, b) => {
    const sameDistrict = (x) => (x.ctx?.districtName === c.districtName ? 0 : 1);
    return sameDistrict(a) - sameDistrict(b) ||
      String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
  });
}

/**
 * جدول مقارنة بين منشأة ومنافسيها على المحاور نفسها.
 * @returns {{rows:Array, topics:Array<{id,name,cells:Array}>, rank:{by:string,position:number,of:number}|null}}
 */
export function benchmark(target, rivals) {
  const all = [target, ...rivals];
  const rows = all.map((j) => {
    const s = stats(j.place);
    return {
      id: j.id,
      isTarget: j.id === target.id,
      name: j.place?.identity?.name || 'بلا اسم',
      district: j.ctx?.districtName || '—',
      googleAverage: s.googleAverage,
      googleCount: s.googleCount,
      sampleAverage: s.sampleAverage,
      negativeShare: s.rated ? Number(((s.negative / s.rated) * 100).toFixed(1)) : null,
      replyRate: s.replyRate,
      total: s.total,
    };
  });

  // المواضيع المشتركة: ما ورد عند اثنين فأكثر، كي تكون المقارنة ذات معنى.
  const perJob = all.map((j) => new Map(topicStats(j.place).map((t) => [t.id, t])));
  const counts = new Map();
  for (const m of perJob) for (const [id, t] of m) counts.set(id, { name: t.name, n: (counts.get(id)?.n || 0) + 1 });

  const topics = [...counts.entries()]
    .filter(([, v]) => v.n >= 2)
    .map(([id, v]) => ({
      id, name: v.name,
      cells: perJob.map((m, i) => {
        const t = m.get(id);
        return { name: rows[i].name, isTarget: rows[i].isTarget, total: t?.total ?? 0, neg: t?.neg ?? 0, pos: t?.pos ?? 0, verdict: t?.verdict || '—' };
      }),
    }))
    .sort((a, b) => b.cells.reduce((s, c) => s + c.neg, 0) - a.cells.reduce((s, c) => s + c.neg, 0));

  const ranked = rows.filter((r) => r.googleAverage !== null)
    .sort((a, b) => b.googleAverage - a.googleAverage);
  const pos = ranked.findIndex((r) => r.isTarget);
  const rank = pos >= 0 ? { by: 'متوسط تقييم قوقل', position: pos + 1, of: ranked.length } : null;

  return { rows, topics, rank };
}

/**
 * معيار داخلي من أرشيفك: متوسط المنشآت المشابهة (نفس التصنيف، ثم نفس المدينة).
 * لا يحتاج بيانات خارجية، ويتحسّن كلما كبر أرشيفك.
 * @returns {{n, byCategory, byCity, target, verdicts}|null}
 */
export function internalBenchmark(jobs, target) {
  const c = target.ctx || {};
  const targetKey = key(target);

  // أحدث تقرير لكل منشأة، مع استبعاد المنشأة نفسها.
  const latest = new Map();
  for (const j of jobs) {
    if (key(j) === targetKey) continue;
    if (!(j.place?.reviews?.length)) continue;
    const k = key(j);
    const prev = latest.get(k);
    if (!prev || String(j.createdAt || '') > String(prev.createdAt || '')) latest.set(k, j);
  }
  const pool = [...latest.values()];
  if (pool.length < 2) return null;   // معيارٌ من منشأة واحدة ليس معيارًا

  const summarize = (list) => {
    const rows = list.map((j) => {
      const s = stats(j.place);
      return {
        avg: s.googleAverage,
        neg: s.rated ? (s.negative / s.rated) * 100 : null,
        reply: s.replyRate,
      };
    });
    const mean = (f) => {
      const vals = rows.map(f).filter((v) => v !== null && v !== undefined && Number.isFinite(v));
      return vals.length ? Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2)) : null;
    };
    return { n: list.length, avg: mean((r) => r.avg), neg: mean((r) => r.neg), reply: mean((r) => r.reply) };
  };

  const sameCategory = pool.filter((j) => j.ctx?.categoryId === c.categoryId);
  const sameCity = pool.filter((j) => j.ctx?.cityId === c.cityId && j.ctx?.categoryId === c.categoryId);

  const ts = stats(target.place);
  const me = {
    avg: ts.googleAverage,
    neg: ts.rated ? Number(((ts.negative / ts.rated) * 100).toFixed(1)) : null,
    reply: ts.replyRate,
  };

  const byCategory = sameCategory.length >= 2 ? summarize(sameCategory) : null;
  const byCity = sameCity.length >= 2 ? summarize(sameCity) : null;
  const base = byCity || byCategory;

  const verdicts = [];
  if (base) {
    const cmp = (label, mine, theirs, goodIsUp, unit = '') => {
      if (mine === null || theirs === null) return;
      const d = Number((mine - theirs).toFixed(2));
      const good = goodIsUp ? d >= 0 : d <= 0;
      verdicts.push({ label, mine, theirs, diff: d, good, unit });
    };
    cmp('متوسط التقييم', me.avg, base.avg, true);
    cmp('نسبة السلبي', me.neg, base.neg, false, '%');
    cmp('ردود المالك', me.reply, base.reply, true, '%');
  }

  return { n: pool.length, byCategory, byCity, target: me, verdicts, scope: byCity ? 'المدينة والتصنيف' : 'التصنيف' };
}

/**
 * «أنت مقابل نفسك» — الفارق الوحيد الصادق.
 *
 * والمقارنة بالمنافسين ممتنعةٌ هنا: لا تُجمَع تعليقاتهم بإذنٍ منهم، ولا
 * تُقاس عيّناتهم بمثل ما تُقاس عيّنتك، فالرقم المُخرَج منها يُوهِم تفوّقًا
 * أو تخلّفًا لا يسنده شيء. وأمّا تقريرُك السابق فمقياسٌ سليم: المنهج واحد
 * والمصدر واحد، والفرق بينهما يخصّك وحدك.
 *
 * ويُفرَّق بين رقمين لا يُقاسان بمقياسٍ واحد:
 *   • **متوسط قوقل** رقمٌ مُعلَن على تقييماتك كلها، لا عيّنة فيه ولا هامش.
 *   • **نصيب السلبي** محسوبٌ من عيّنتك، فله هامشٌ ولا يُقال فيه تحسّنٌ
 *     حتى تنفصل فترتاه.
 */
export function selfCompareBlock(oldJob, newJob) {
  if (!oldJob || !newJob) return '';
  const t = timeline(oldJob, newJob);
  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const a = stats(oldJob.place);
  const b = stats(newJob.place);
  const negBefore = wilson(a.negative, a.rated);
  const negNow = wilson(b.negative, b.rated);
  const negSig = significant(negNow, negBefore);

  const arrow = (diff, goodIsUp) => {
    if (diff === null || diff === undefined || diff === 0) return '<span class="fine">بلا تغيّر</span>';
    const good = goodIsUp ? diff > 0 : diff < 0;
    return `<span class="delta ${good ? 'up' : 'down'}">${diff > 0 ? '▲' : '▼'} ${Math.abs(diff)}</span>`;
  };

  const rows = [];
  const r = t.ratings;
  if (r.googleAverage.before !== null && r.googleAverage.now !== null) {
    rows.push(`<tr><td>متوسط قوقل</td><td>${r.googleAverage.before}</td><td>${r.googleAverage.now}</td>
      <td>${arrow(r.googleAverage.diff, true)}</td>
      <td class="fine">رقمٌ مُعلَن على تقييماتك كلها — لا عيّنة فيه ولا هامش.</td></tr>`);
  }
  if (r.negativeShare.before !== null && r.negativeShare.now !== null) {
    rows.push(`<tr><td>نصيب السلبي من العيّنة</td><td>${r.negativeShare.before}%</td><td>${r.negativeShare.now}%</td>
      <td>${negSig.decided ? arrow(r.negativeShare.diff, false) : '<span class="fine">لا يُحسم</span>'}</td>
      <td class="fine">${esc(negSig.reason || '')}</td></tr>`);
  }
  if (r.replyRate.before !== null && r.replyRate.now !== null) {
    rows.push(`<tr><td>نسبة الرد على التعليقات</td><td>${r.replyRate.before}%</td><td>${r.replyRate.now}%</td>
      <td>${arrow(r.replyRate.diff, true)}</td>
      <td class="fine">فعلُك أنت، لا رأيُ عميل — فيُقاس بلا هامش.</td></tr>`);
  }
  if (!rows.length) return '';

  const list = (items, label, cls) => items.length
    ? `<div class="sc-col ${cls}"><b>${label}</b><ul>${
        items.slice(0, 6).map((x) => `<li>${esc(x.name)}${
          x.from !== undefined ? ` <span class="fine">(من ${x.from} إلى ${x.to})</span>` : ''}${
          x.neg !== undefined ? ` <span class="fine">(${x.neg} شكوى)</span>` : ''}${
          x.was !== undefined ? ` <span class="fine">(كانت ${x.was})</span>` : ''}</li>`).join('')
      }</ul></div>` : '';

  return `<section class="selfcompare">
    <h2>أنت مقابل نفسك — ما تغيّر منذ التقرير السابق</h2>
    <p class="note">${t.days !== null ? `بين التقريرين ${t.days} يومًا. ` : ''}${
      t.plan.total ? `وأُنجز ${t.plan.done} من ${t.plan.total} مهمة في خطة التقرير السابق.` : ''}</p>
    <table><thead><tr><th>المقياس</th><th>سابقًا</th><th>الآن</th><th>الفرق</th><th>كيف يُقرأ</th></tr></thead>
    <tbody>${rows.join('')}</tbody></table>
    <div class="sc-cols">
      ${list(t.topics.better, 'شكاوى تراجعت', 'good')}
      ${list(t.topics.worse, 'شكاوى زادت', 'bad')}
      ${list(t.topics.new, 'شكاوى جديدة لم تكن', 'bad')}
      ${list(t.topics.gone, 'شكاوى اختفت', 'good')}
    </div>
    <p class="fine"><b>ولا يُقارَن محلُّك بمحلٍّ آخر في هذا التقرير</b>: عيّنته لا تُقاس بمثل ما تُقاس
    عيّنتك، فالفارق المُخرَج منها يُوهِم تفوّقًا أو تخلّفًا لا يسنده شيء. وتقريرُك السابق
    مقياسٌ سليم: المنهج واحد والمصدر واحد.</p>
  </section>`;
}

/**
 * «أنت مقابل نفسك» بلا تقريرٍ سابق.
 *
 * القسم كان يختفي كليًّا عند أول تقرير — وهو أول تقريرٍ لكل عميل، فلا يراه
 * أحدٌ إلا في الثاني. والمقارنة ممكنةٌ من العيّنة نفسها: آخر تسعين يومًا
 * مقابل ما قبلها. وهي أضعفُ من مقارنة تقريرين (العيّنتان من مصدرٍ واحد
 * ومتداخلتان في الزمن لا في الأفراد)، فتُقال بوصفها كذلك.
 */
export function trendWithinBlock(place) {
  const r = recentVsOlder(place);
  if (!r.recent.n || !r.older.n) return '';
  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const negNow = wilson(r.recent.neg === null ? 0 : Math.round((r.recent.neg / 100) * r.recent.n), r.recent.n);
  const negOld = wilson(r.older.neg === null ? 0 : Math.round((r.older.neg / 100) * r.older.n), r.older.n);
  const sig = significant(negNow, negOld);

  const ages = topicAges(place).filter((t) => t.state === 'ناشئة' || t.state === 'متفاقمة');
  const fresh = ages.length
    ? `<div class="sc-col bad"><b>شكاوى ناشئة أو متفاقمة</b><ul>${
        ages.slice(0, 5).map((t) => `<li>${esc(t.name)} <span class="fine">(${t.state} — ${t.recentNeg} حديثة مقابل ${t.olderNeg} قديمة)</span></li>`).join('')
      }</ul></div>` : '';

  return `<section class="selfcompare">
    <h2>أنت مقابل نفسك — من داخل هذه العيّنة</h2>
    <p class="note">لا تقرير سابق يُقارَن به بعد، فالمقارنة من عيّنتك نفسها:
    آخر ${r.window} يومًا مقابل ما قبلها.</p>
    <table><thead><tr><th>المقياس</th><th>ما قبل ${r.window} يومًا</th><th>آخر ${r.window} يومًا</th><th>كيف يُقرأ</th></tr></thead>
    <tbody>
      <tr><td>متوسط التعليقات</td><td>${r.older.avg ?? '—'}</td><td>${r.recent.avg ?? '—'}</td>
        <td class="fine">${esc(r.note || (r.diff === null ? 'لا يُقاس' : `فرق ${r.diff} نجمة`))}</td></tr>
      <tr><td>نصيب السلبي</td><td>${r.older.neg === null ? '—' : `${r.older.neg}%`}</td>
        <td>${r.recent.neg === null ? '—' : `${r.recent.neg}%`}</td>
        <td class="fine">${esc(sig.reason || '')}</td></tr>
      <tr><td>عدد التعليقات</td><td>${r.older.n}</td><td>${r.recent.n}</td>
        <td class="fine">عددٌ مرصود لا عيّنة منه.</td></tr>
    </tbody></table>
    ${fresh ? `<div class="sc-cols">${fresh}</div>` : ''}
    <p class="fine"><b>وهذه أضعفُ من مقارنة تقريرين</b>: الفترتان من عيّنةٍ واحدة جُمعت مرةً واحدة،
    فما وصل منها عن الأشهر القديمة أقلُّ مما وصل عن القريبة — والقديم يُنسى ولا يُكتَب.
    ${r.undated ? `و${r.undated} تعليقًا بلا تاريخ لم يدخل هذه المقارنة.` : ''}</p>
  </section>`;
}
