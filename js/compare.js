// المقارنات — الزمنية (منشأة واحدة عبر تقريرين) والتنافسية (منشآت في نفس الحي والتصنيف).
// كلتاهما تُحسَبان برمجيًّا من الأرشيف، فلا نموذج يُستشار ولا رقم يُقدَّر.

import { stats } from './schema.js';
import { topicStats } from './lexicon.js';

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
