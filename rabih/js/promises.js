// وعود المالك ومتابعتها — أصدق فقرةٍ يمكن أن تُكتب في تقرير.
//
// ردود المالك محفوظة بتواريخها، وفيها وعودٌ صريحة: «نعمل على زيادة المواقف»،
// «سيُعالَج»، «وعد بتحسين الخدمة». فيُستخرج الوعد، ويُنظَر: هل تكرّرت الشكوى
// **بعد تاريخ الوعد**؟
//
// وهذا يُري المالك أن الاعتذار الذي لا يُتبَع بفعلٍ يُسجَّل عليه علنًا.
// ومأخوذٌ كلّه من بياناته — لا حكم منّا ولا تخمين: نذكر الوعد بنصّه، وتاريخه،
// وعدد الشكاوى التي وردت بعده في موضوعه، وتاريخ آخرها. والقارئ يحكم.

import { normalizeAr, topicsOf, topicSentiment, TOPICS } from './lexicon.js';
import { relativeDays } from './anomaly.js';

/** صيغُ الوعد في ردود المُلّاك — فعلٌ مستقبليّ لا اعتذارٌ مجرّد. */
const PROMISE = [
  'نعمل على', 'سنعمل', 'سوف نعمل', 'سيتم', 'سوف يتم', 'سنقوم', 'نعد ب', 'نعدكم',
  'جار العمل', 'جاري العمل', 'سنحرص', 'سنراعي', 'سيُعالج', 'سيعالج', 'سنعالج',
  'سنضيف', 'سنوفر', 'سنزيد', 'سنحسن', 'سنطور', 'سنتدارك', 'رفعنا الملاحظه',
  'تم رفع', 'سنتواصل', 'سنراجع', 'سنتخذ',
];
const PROMISE_N = PROMISE.map(normalizeAr);

/** اعتذارٌ مجرّد: يُميَّز عن الوعد، فالفرق بينهما هو بيت القصيد. */
const APOLOGY = ['نعتذر', 'اسف', 'آسف', 'نأسف', 'المعذره', 'المعذرة', 'نتاسف'];
const APOLOGY_N = APOLOGY.map(normalizeAr);

const hasAny = (text, list) => {
  const t = normalizeAr(text);
  return list.some((k) => k && t.includes(k));
};

const nameOf = (id) => TOPICS.find((t) => t.id === id)?.name || id;

/**
 * @returns {{promises:Array, apologiesOnly:number, total:number}}
 */
export function promises(place) {
  const reviews = place?.reviews || [];
  const withReply = reviews.filter((r) => (r.ownerReply || '').trim());
  const out = [];
  let apologiesOnly = 0;

  for (const r of withReply) {
    const reply = r.ownerReply;
    const isPromise = hasAny(reply, PROMISE_N);
    if (!isPromise) {
      if (hasAny(reply, APOLOGY_N)) apologiesOnly += 1;
      continue;
    }

    // موضوع الوعد: مواضيع الشكوى التي رُدّ عليها.
    const topics = topicsOf(r.text).filter((id) => topicSentiment(r, id) === 'neg');
    const age = relativeDays(r.date);

    // ما ورد بعد الوعد في موضوعه: أحدثُ عمرًا، أي أقلُّ أيامًا.
    const after = reviews.filter((x) => {
      if (x.id === r.id) return false;
      const xa = relativeDays(x.date);
      if (xa === null || age === null || xa >= age) return false;
      const xt = topicsOf(x.text).filter((id) => topicSentiment(x, id) === 'neg');
      return xt.some((id) => topics.includes(id));
    });

    const latest = after.reduce((a, x) => {
      const xa = relativeDays(x.date);
      return a === null || (xa !== null && xa < a.age) ? { id: x.id, age: xa, date: x.date } : a;
    }, null);

    out.push({
      id: r.id,
      date: r.date,
      ageDays: age,
      reply: reply.trim(),
      topics: topics.map(nameOf),
      topicIds: topics,
      repeats: after.length,
      repeatIds: after.slice(0, 8).map((x) => x.id),
      latest,
      // الوفاء لا يُدَّعى: غيابُ شكوى بعد الوعد ليس دليلَ وفاءٍ قاطعًا.
      kept: topics.length > 0 && after.length === 0,
    });
  }

  out.sort((a, b) => b.repeats - a.repeats || (a.ageDays ?? 0) - (b.ageDays ?? 0));
  return { promises: out, apologiesOnly, total: withReply.length };
}

export function promisesBlock(place) {
  const p = promises(place);
  if (!p.promises.length && !p.apologiesOnly) return '';
  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const clip = (s, n) => (s.length <= n ? s : s.slice(0, n).replace(/\s+\S*$/, '') + '…');

  const rows = p.promises.slice(0, 6).map((x) => {
    const head = `ردّ المالك على <span class="rid">${esc(x.id)}</span>${x.date ? ` (${esc(x.date)})` : ''}`;
    const body = `<blockquote class="q"><p>${esc(clip(x.reply, 180))}</p></blockquote>`;
    const verdict = x.repeats
      ? `<p class="after err-text">ومنذ ذلك الردّ وردت <b>${x.repeats}</b> شكوى في ${esc(x.topics.join('، ') || 'الموضوع نفسه')}${
          x.latest?.date ? `، آخرها ${esc(x.latest.date)}` : ''}. ${x.repeatIds.map((i) => `<span class="rid">${esc(i)}</span>`).join(' ')}</p>`
      : `<p class="after ok-text">ولم ترد بعده شكوى في ${esc(x.topics.join('، ') || 'الموضوع نفسه')} ضمن هذه العيّنة.</p>`;
    return `<div class="promise">${head}${body}${verdict}</div>`;
  }).join('');

  return `<section class="promises">
    <h2>وعودٌ سابقة — وما جرى بعدها</h2>
    <p class="note">مأخوذٌ من ردود المنشأة نفسها بتواريخها: يُنقَل الوعد بنصّه، ثم يُعَدّ ما ورد بعده من شكاوى في موضوعه. ولا حكم هنا — العدّ يتكلّم.</p>
    ${rows}
    ${p.apologiesOnly ? `<p class="fine"><b>${p.apologiesOnly}</b> ردًّا اكتفى بالاعتذار بلا وعدٍ بفعل. والاعتذار المجرّد يحفظ ماء الوجه ولا يُصلح شيئًا.</p>` : ''}
  </section>`;
}
