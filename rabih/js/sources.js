// مصادر غير قوقل — والتناقض بينها يستحقّ تقريرًا وحده.
//
// **صدقٌ واجب**: هنقرستيشن وجاهز وطلبات وTripAdvisor لا تفتح واجهاتٍ عامة
// لجلب تقييماتها، ولا نكشط صفحاتها (مخالفٌ لشروطها كما هو مخالفٌ لقوقل).
// فالمبنيّ هنا هو **ما يعمل فعلًا**: تُلصَق تعليقات كل منصّة على حدة، وتُوسَم
// بمصدرها، ويُبنى منها فرقٌ يقارن بينها.
//
// وقيمته أن الفارق نفسه تشخيص: «قوقل ٤٫٢ وهنقرستيشن ٣٫٦» يعني أن العطب في
// التوصيل لا في المطعم — وهذا لا يظهر في مصدرٍ واحد أبدًا.

import { stats } from './schema.js';
import { topicStats } from './lexicon.js';

export const PLATFORMS = [
  { id: 'google',   name: 'خرائط قوقل' },
  { id: 'hunger',   name: 'هنقرستيشن' },
  { id: 'jahez',    name: 'جاهز' },
  { id: 'talabat',  name: 'طلبات' },
  { id: 'tripadv',  name: 'TripAdvisor' },
  { id: 'other',    name: 'مصدر آخر' },
];

export const platformName = (id) => PLATFORMS.find((p) => p.id === id)?.name || id || 'غير محدَّد';

/** تعليقات منصّةٍ واحدة كمنشأةٍ مستقلة، ليُعاد استعمال كل الحسابات عليها. */
const asPlace = (place, list) => ({ ...place, reviews: list, ratings: { ...place.ratings } });

/**
 * يقارن المنصّات الحاضرة في العيّنة.
 * @returns {{platforms:Array, gaps:Array, ok:boolean}}
 */
export function compareSources(place) {
  const reviews = place?.reviews || [];
  const groups = new Map();
  for (const r of reviews) {
    const p = r.platform || 'google';
    if (!groups.has(p)) groups.set(p, []);
    groups.get(p).push(r);
  }
  if (groups.size < 2) return { platforms: [], gaps: [], ok: false };

  const platforms = [...groups.entries()].map(([id, list]) => {
    const s = stats(asPlace(place, list));
    return {
      id,
      name: platformName(id),
      count: list.length,
      average: s.sampleAverage,
      negShare: s.rated ? Number(((s.negative / s.rated) * 100).toFixed(1)) : null,
      topics: topicStats(asPlace(place, list)).filter((t) => t.neg > 0),
    };
  }).sort((a, b) => (b.average ?? 0) - (a.average ?? 0));

  /* الفجوة: موضوعٌ تكثر شكواه في منصّةٍ وتقلّ في أخرى — وهي موضع التشخيص. */
  const gaps = [];
  const ids = new Set(platforms.flatMap((p) => p.topics.map((t) => t.id)));
  for (const tid of ids) {
    const row = platforms.map((p) => {
      const t = p.topics.find((x) => x.id === tid);
      return { platform: p.name, count: p.count, neg: t ? t.neg : 0, share: p.count ? (t ? t.neg : 0) / p.count : 0 };
    });
    const hi = row.reduce((a, b) => (b.share > a.share ? b : a));
    const lo = row.reduce((a, b) => (b.share < a.share ? b : a));
    const diff = hi.share - lo.share;
    if (diff >= 0.15 && hi.neg >= 2) {
      const name = platforms.flatMap((p) => p.topics).find((t) => t.id === tid)?.name || tid;
      gaps.push({
        id: tid,
        name,
        high: hi.platform,
        highShare: Number((hi.share * 100).toFixed(1)),
        low: lo.platform,
        lowShare: Number((lo.share * 100).toFixed(1)),
      });
    }
  }
  gaps.sort((a, b) => (b.highShare - b.lowShare) - (a.highShare - a.lowShare));

  return { platforms, gaps, ok: true };
}

/** كتلة HTML للتقرير — لا تظهر إلا إذا كان في العيّنة أكثر من مصدر. */
export function sourcesBlock(place) {
  const c = compareSources(place);
  if (!c.ok) return '';
  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const rows = c.platforms.map((p) => `<tr>
      <td><b>${esc(p.name)}</b></td>
      <td>${p.count}</td>
      <td>${p.average ?? '—'}</td>
      <td>${p.negShare === null ? '—' : p.negShare + '%'}</td>
    </tr>`).join('');

  const gaps = c.gaps.length
    ? `<ul>${c.gaps.slice(0, 5).map((g) => `<li><b>${esc(g.name)}</b>: شكواه في ${esc(g.high)} ${g.highShare}% مقابل ${g.lowShare}% في ${esc(g.low)}.</li>`).join('')}</ul>`
    : '<p class="fine">لا فجوة ظاهرة بين المصادر في هذه العيّنة.</p>';

  return `<section class="sources">
    <h2>مقارنة المصادر</h2>
    <table><thead><tr><th>المصدر</th><th>التعليقات</th><th>متوسط العيّنة</th><th>نسبة السلبي</th></tr></thead><tbody>${rows}</tbody></table>
    <h3 class="no-count">أين يختلف المصدران؟</h3>
    ${gaps}
    <p class="fine">الفارق بين منصّةٍ وأخرى تشخيصٌ بنفسه: ما يكثر في منصّات التوصيل ويقلّ في قوقل مردُّه غالبًا إلى مسار الطلب الخارجي لا إلى المكان.</p>
  </section>`;
}
