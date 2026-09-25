// تقرير المجموعة — مالكٌ له عدة فروع أو محلات تحت علامة واحدة.
// السؤال الذي يجيب عنه: أي فرع الأضعف؟ وأي شكوى مشتركة بين الفروع كلها
// (فهي مشكلة نظام لا مشكلة فرع)؟ وأيّها انفردت بفرع (فهي مشكلة إدارته)؟

import { stats } from './schema.js';
import { topicStats } from './lexicon.js';
import { recentVsOlder } from './recency.js';
import { wilson } from './interval.js';

/** العلامات الموجودة في الأرشيف، مع عدد فروع كل واحدة. */
export function brands(jobs) {
  const map = new Map();
  for (const j of jobs) {
    const b = (j.ctx?.brand || '').trim();
    if (!b) continue;
    map.set(b, [...(map.get(b) || []), j]);
  }
  return [...map.entries()]
    .map(([name, list]) => ({ name, jobs: latestPerBranch(list), all: list }))
    .filter((b) => b.jobs.length >= 2)
    .sort((a, b) => b.jobs.length - a.jobs.length);
}

/** أحدث تقرير لكل فرع — فلا يُحسب الفرع مرتين إن كان له تقريران. */
function latestPerBranch(list) {
  const map = new Map();
  for (const j of list) {
    const k = j.mapsUrl || j.place?.identity?.name || j.id;
    const prev = map.get(k);
    if (!prev || String(j.createdAt || '') > String(prev.createdAt || '')) map.set(k, j);
  }
  return [...map.values()].sort((a, b) =>
    String(a.place?.identity?.name || '').localeCompare(String(b.place?.identity?.name || ''), 'ar'));
}

const branchLabel = (j) =>
  (j.ctx?.branch || '').trim() || j.ctx?.districtName || j.place?.identity?.name || 'فرع';

/**
 * تحليل المجموعة.
 * @returns {{branches, shared, mentioned, unique, ranking, totals, gap}}
 */
export function analyze(jobs) {
  const branches = jobs.map((j) => {
    const s = stats(j.place);
    const r = recentVsOlder(j.place);
    return {
      id: j.id,
      name: j.place?.identity?.name || 'بلا اسم',
      label: branchLabel(j),
      city: j.ctx?.cityName || '',
      district: j.ctx?.districtName || '',
      googleAverage: s.googleAverage,
      googleCount: s.googleCount,
      sampleAverage: s.sampleAverage,
      negativeShare: s.rated ? Number(((s.negative / s.rated) * 100).toFixed(1)) : null,
      /* النسبةُ وحدها تُقرأ حكمًا على الفرع وهي وصفٌ لعيّنته: فيُذكر هامشُها
         معها، ويُوسَم الفرعُ الذي دون ثلاثة تعليقات بأن عيّنته لا تُقاس. */
      negMargin: s.rated ? (wilson(s.negative, s.rated, s.googleCount || null)?.margin ?? null) : null,
      thin: s.rated < 3,
      replyRate: s.replyRate,
      total: s.total,
      trend: r.verdict,
      trendDiff: r.diff,
      topics: topicStats(j.place),
    };
  });

  const n = branches.length;

  // الشكوى المشتركة: وردت سلبيةً في كل الفروع أو أغلبها (الثلثين فأكثر).
  const threshold = Math.max(2, Math.ceil(n * 0.66));
  const counter = new Map();
  for (const b of branches) {
    for (const t of b.topics) {
      if (!t.neg) continue;
      const row = counter.get(t.id) || { id: t.id, name: t.name, branches: [], totalNeg: 0 };
      /* «مشكلةُ نظام» حكمٌ ثقيل: لا يُبنى على ذكرٍ أو ذكرين في كل فرع. فما دون
         ثلاثٍ في فرعٍ يُعدّ فيه ذكرًا لا نمطًا، ولا يُحسَب في الاشتراك. */
      row.branches.push({ label: b.label, neg: t.neg, ids: t.negIds, solid: t.neg >= 3 });
      row.totalNeg += t.neg;
      counter.set(t.id, row);
    }
  }

  const shared = [];
  const unique = [];
  const mentioned = [];
  for (const row of counter.values()) {
    const solidBranches = row.branches.filter((x) => x.solid);
    if (solidBranches.length >= threshold) shared.push(row);
    else if (row.branches.length >= threshold) mentioned.push(row);   // مشتركةٌ ذِكرًا لا نمطًا
    else if (row.branches.length === 1) unique.push(row);
  }
  shared.sort((a, b) => b.branches.length - a.branches.length || b.totalNeg - a.totalNeg);
  unique.sort((a, b) => b.totalNeg - a.totalNeg);

  const rated = branches.filter((b) => b.googleAverage !== null)
    .sort((a, b) => b.googleAverage - a.googleAverage);
  const ranking = rated.map((b, i) => ({ ...b, rank: i + 1 }));

  const gap = rated.length >= 2
    ? { best: rated[0], worst: rated[rated.length - 1], diff: Number((rated[0].googleAverage - rated[rated.length - 1].googleAverage).toFixed(2)) }
    : null;

  const sumCount = branches.reduce((a, b) => a + (b.googleCount || 0), 0);
  const weighted = sumCount
    ? Number((branches.reduce((a, b) => a + (b.googleAverage || 0) * (b.googleCount || 0), 0) / sumCount).toFixed(2))
    : null;

  return {
    branches, shared, mentioned, unique, ranking, gap,
    totals: {
      branches: n,
      reviews: branches.reduce((a, b) => a + b.total, 0),
      googleCount: sumCount,
      weightedAverage: weighted,
      declining: branches.filter((b) => b.trend === 'انحدار').map((b) => b.label),
      improving: branches.filter((b) => b.trend === 'تحسّن').map((b) => b.label),
    },
  };
}

/** رسالة تُرسَل للنموذج لكتابة تقرير المجموعة — بالميثاق نفسه وبأرقام محسوبة. */
export function groupPrompt(brandName, jobs, charter) {
  const a = analyze(jobs);
  const L = [];

  L.push(charter);
  L.push(`\n# مهمتك: تقرير عن مجموعة «${brandName}» لا عن فرع واحد`);
  L.push(`المجموعة ${a.totals.branches} فروع. اكتب تقريرًا موجَّهًا إلى مالك المجموعة، بالأقسام التالية:`);
  L.push(`1. **صورة المجموعة** — أين تقف ككل، وما مقدار التفاوت بين فروعها.`);
  L.push(`2. **ترتيب الفروع** — من الأقوى إلى الأضعف، وبمَ استحق كلٌّ موضعه.`);
  L.push(`3. **مشكلات النظام** — الشكاوى المشتركة بين الفروع؛ هذه مسؤولية الإدارة المركزية لا الفرع.`);
  L.push(`4. **مشكلات الفروع** — ما انفرد به فرعٌ واحد؛ هذه مسؤولية إدارته.`);
  L.push(`5. **الفرع الذي يحتاج تدخّلًا عاجلًا** — واحدٌ فقط، ولماذا هو دون غيره.`);
  L.push(`6. **ما ينبغي نقله من الأقوى إلى الأضعف** — ممارسة ناجحة في فرع يمكن تعميمها، مسنودةً بتعليقات.`);
  L.push(`7. **خطة موحّدة للمجموعة** ثم **خطة خاصة بكل فرع**.`);
  L.push(`\n## صيغة المخرج\n- نصٌّ عربي بعناوين Markdown.\n- كل نقطة تنتهي بمعرّفاتها بين قوسين، مع ذكر الفرع، مثل: (الملقا: R003، R011).`);

  L.push(`\n## أرقام المجموعة (نهائية — محسوبة برمجيًّا)`);
  L.push(`- عدد الفروع: ${a.totals.branches}`);
  L.push(`- إجمالي تقييمات قوقل: ${a.totals.googleCount || 'غير متوفّر'}`);
  L.push(`- المتوسط الموزون للمجموعة: ${a.totals.weightedAverage ?? 'غير متوفّر'}`);
  L.push(`- التعليقات المُحلَّلة: ${a.totals.reviews}`);
  if (a.gap) L.push(`- الفجوة: ${a.gap.best.label} (${a.gap.best.googleAverage}) ← ${a.gap.worst.label} (${a.gap.worst.googleAverage}) = ${a.gap.diff}`);
  if (a.totals.declining.length) L.push(`- فروع في انحدار حديث: ${a.totals.declining.join('، ')}`);
  if (a.totals.improving.length) L.push(`- فروع في تحسّن حديث: ${a.totals.improving.join('، ')}`);

  L.push(`\n## الفروع`);
  L.push('| الفرع | المدينة | الحي | متوسط قوقل | التقييمات | العيّنة | السلبي % | ردود % | الاتجاه الحديث |');
  L.push('|---|---|---|---|---|---|---|---|---|');
  for (const b of a.branches) {
    L.push(`| ${b.label} | ${b.city} | ${b.district} | ${b.googleAverage ?? '—'} | ${b.googleCount ?? '—'} | ${b.total} | ${b.negativeShare ?? '—'} | ${b.replyRate ?? '—'} | ${b.trend} |`);
  }

  if (a.shared.length) {
    L.push(`\n## شكاوى مشتركة (مشكلة نظام)`);
    for (const t of a.shared) {
      L.push(`- **${t.name}** — في ${t.branches.length} فروع: ${t.branches.map((x) => `${x.label} (${x.neg}: ${x.ids.join('، ')})`).join(' · ')}`);
    }
  } else {
    L.push(`\n## شكاوى مشتركة\nلا شكوى تتكرر في أغلب الفروع.`);
  }

  if (a.unique.length) {
    L.push(`\n## شكاوى منفردة (مشكلة فرع)`);
    for (const t of a.unique) {
      const b = t.branches[0];
      L.push(`- **${t.name}** — في ${b.label} وحده: ${b.neg} مرات (${b.ids.join('، ')})`);
    }
  }

  L.push(`\n## تعليقات الفروع (السند)`);
  for (const j of jobs) {
    L.push(`\n### فرع ${branchLabel(j)}`);
    for (const r of j.place?.reviews || []) {
      const head = [`[${r.id}]`, r.rating ? `${r.rating}★` : 'بلا تقييم', r.date || 'بلا تاريخ'].join(' · ');
      L.push(`${head} ${(r.text || '(بلا نص)').trim()}`);
    }
  }

  return L.join('\n');
}
