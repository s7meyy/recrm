// صوت العميل — كلام الناس كما كتبوه، مرتّبًا لا مُعادًا صياغته.
//
// المالك يجادل في الاستنتاج ولا يجادل في كلام زبونه. فهذه صفحةٌ تُسلّمه
// **النصوص نفسها**: أقسى ما قيل وأصدق ما قيل في كل محور، بحروفها ولهجتها.
//
// وهي أوفق ما في الأداة لشرطها: لا تلخيص ولا تهذيب ولا حذف كلمةٍ قاسية.
// ما يُعرَض هنا مأخوذٌ من `review.text` حرفًا بحرف، ومعرّفه بجانبه.

import { topicStats, isIntense } from './lexicon.js';

const clip = (s, n) => {
  const t = String(s || '').trim();
  return t.length <= n ? t : t.slice(0, n).replace(/\s+\S*$/, '') + '…';
};

/**
 * يختار الاقتباسات: الأدلّ لا الأطول.
 *
 * والترتيب: شدّة اللفظ أولًا (فهي أصدق تعبيرًا عن الأثر)، ثم تطرّف التقييم،
 * ثم الحداثة. ولا يُقتطَع نصٌّ إلا إذا جاوز الحدّ، ويُعلَّم بعلامة القطع.
 */
function pick(reviews, ids, want, limit) {
  const byId = new Map(reviews.map((r) => [r.id, r]));
  return ids
    .map((id) => byId.get(id))
    .filter((r) => r && (r.text || '').trim().length >= 12)
    .sort((a, b) => {
      const ia = isIntense(a.text) ? 1 : 0;
      const ib = isIntense(b.text) ? 1 : 0;
      if (ia !== ib) return ib - ia;
      const ra = a.rating ?? 3;
      const rb = b.rating ?? 3;
      return want === 'neg' ? ra - rb : rb - ra;
    })
    .slice(0, limit);
}

/**
 * @returns {Array<{id,name,neg:Array,pos:Array}>}
 */
export function voice(place, { perSide = 3, limit = 6 } = {}) {
  const reviews = place?.reviews || [];
  if (!reviews.length) return [];

  /* **لكل تعليقٍ ظهورٌ واحد**: التعليق يقع في عدة محاور، فكان يتكرّر نصُّه
     ثلاث مرات في صفحةٍ واحدة — فيملّ القارئ ويظنّ البيانات شحيحة. فيُحجَز
     لأدلّ محاوره: المحور الأكثر ورودًا يأخذ حاجته أولًا. */
  const used = new Set();
  const take = (ids, want, n) => {
    const out = pick(reviews, ids.filter((id) => !used.has(id)), want, n);
    for (const r of out) used.add(r.id);
    return out;
  };

  return topicStats(place)
    .filter((t) => t.total > 0)
    .sort((a, b) => (b.neg + b.pos) - (a.neg + a.pos))
    .slice(0, limit)
    .map((t) => ({
      id: t.id,
      name: t.name,
      neg: take(t.negIds, 'neg', perSide),
      pos: take(t.posIds, 'pos', perSide),
    }))
    .filter((t) => t.neg.length || t.pos.length);
}

/** كتلة HTML للتقرير — النصّ كما ورد، ومعرّفه ونجومه بجانبه. */
export function voiceBlock(place, { maxChars = 220 } = {}) {
  const groups = voice(place);
  if (!groups.length) return '';
  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const quote = (r, cls) => `<blockquote class="q ${cls}">
      <p>${esc(clip(r.text, maxChars))}</p>
      <footer><span class="rid">${esc(r.id)}</span>${r.rating ? ` · ${r.rating} من 5` : ' · بلا تقييم'}${r.date ? ` · ${esc(r.date)}` : ''}</footer>
    </blockquote>`;

  const body = groups.map((g) => `<div class="voice-topic">
      <h3 class="no-count">${esc(g.name)}</h3>
      <div class="voice-cols${g.neg.length && g.pos.length ? '' : ' one'}">
        ${g.neg.length ? `<div>${g.neg.map((r) => quote(r, 'neg')).join('')}</div>` : ''}
        ${g.pos.length ? `<div>${g.pos.map((r) => quote(r, 'pos')).join('')}</div>` : ''}
      </div>
    </div>`).join('');

  return `<section class="voice">
    <h2>صوت العميل — بنصّه</h2>
    <p class="note">منقولٌ حرفًا بحرف كما كتبه أصحابه: بلهجتهم وإملائهم، بلا تهذيب ولا تلخيص. وما جاوز ${maxChars} حرفًا قُطِع وعُلِّم بـ«…»، ولم يُغيَّر منه شيء.</p>
    ${body}
  </section>`;
}
