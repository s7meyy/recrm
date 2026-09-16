// السبب الجذري بالتلازم — ما يجتمع من الشكاوى في التعليق الواحد.
//
// الشكاوى تُعَدّ مفرَّقة، فيظنّ المالك أنها عللٌ مستقلّة فيعالج كلًّا وحده.
// والأهمّ **ما يجتمع**: إذا جاء «الانتظار» مع «الموظفين» في سبعةٍ من تسعة،
// فالعلّة نقص كادرٍ لا بطء أفراد — ومعالجة الموظفين وحدها تضيع جهدًا.
//
// وكل ما هنا عدٌّ مجرَّد: كم مرة وردا معًا، وكم مرة انفرد كلٌّ منهما. ولا
// يُدَّعى سببٌ حيث لا يكون: التلازم اقترانٌ، والتقرير يقوله اقترانًا.

import { topicsOf, topicSentiment, TOPICS } from './lexicon.js';

const nameOf = (id) => TOPICS.find((t) => t.id === id)?.name || id;

/**
 * @returns {{pairs:Array<{a,b,aName,bName,both,aOnly,bOnly,rate,ids}>, singles:Map}}
 */
export function cooccurrence(place, { minBoth = 2, minRate = 0.4 } = {}) {
  const reviews = place?.reviews || [];
  const singles = new Map();
  const pairs = new Map();

  for (const r of reviews) {
    // الشكوى وحدها تُحسَب هنا: تلازم مدحين لا يشخّص علّة.
    const negs = topicsOf(r.text).filter((id) => topicSentiment(r, id) === 'neg');
    for (const id of negs) singles.set(id, (singles.get(id) || 0) + 1);

    for (let i = 0; i < negs.length; i += 1) {
      for (let j = i + 1; j < negs.length; j += 1) {
        const [a, b] = [negs[i], negs[j]].sort();
        const k = `${a}|${b}`;
        if (!pairs.has(k)) pairs.set(k, { a, b, both: 0, ids: [] });
        const row = pairs.get(k);
        row.both += 1;
        if (row.ids.length < 10) row.ids.push(r.id);
      }
    }
  }

  const out = [...pairs.values()]
    .map((p) => {
      const aTotal = singles.get(p.a) || 0;
      const bTotal = singles.get(p.b) || 0;
      // النسبة إلى الأقلّ ورودًا: «كلما ورد هذا ورد معه ذاك».
      const base = Math.min(aTotal, bTotal) || 1;
      return {
        ...p,
        aName: nameOf(p.a),
        bName: nameOf(p.b),
        aOnly: aTotal - p.both,
        bOnly: bTotal - p.both,
        rate: Number((p.both / base).toFixed(2)),
      };
    })
    .filter((p) => p.both >= minBoth && p.rate >= minRate)
    .sort((a, b) => b.both - a.both || b.rate - a.rate);

  return { pairs: out, singles };
}

/** جملةٌ واحدة تُغني عن صفحة — وتقول اقترانًا لا سببًا. */
export function cooccurSentence(p) {
  return `شكاوى «${p.aName}» تأتي مع شكاوى «${p.bName}» في ${Math.round(p.rate * 100)}% من مواضعها `
    + `(${p.both} تعليقًا معًا${p.aOnly || p.bOnly ? `، و${p.aOnly + p.bOnly} منفردًا` : ''}).`;
}

export function cooccurBlock(place) {
  const { pairs } = cooccurrence(place);
  if (!pairs.length) return '';
  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  return `<section class="cooccur">
    <h2>ما يجتمع من الشكاوى</h2>
    <p class="note">عدٌّ مجرَّد لما ورد في التعليق الواحد. والاجتماع <b>اقتران لا سبب</b> — لكنه يدلّ على موضع النظر: ما يجتمع دائمًا يُعالَج معًا.</p>
    <ul>${pairs.slice(0, 5).map((p) => `<li>${esc(cooccurSentence(p))}
      <span class="fine">${p.ids.slice(0, 6).map((x) => `<span class="rid">${esc(x)}</span>`).join(' ')}</span></li>`).join('')}</ul>
  </section>`;
}
