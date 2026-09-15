// اتفاق النماذج — اليوم ثلاثة يكتبون ورابعٌ يدمج، وأنت لا ترى أين اتفقوا
// وأين انفرد واحد، فتثق بالدامج ثقةً عمياء. هذا يجعل الدمج مراجَعةً لا تفويضًا.

import { similarity } from './anomaly.js';
import { normalizeAr } from './lexicon.js';
import { normalizeDigits } from './parse.js';

const RID = /\bR\d{3}\b/g;

/** يقطّع مخرج نموذج إلى جُمل حُكم، متجاوزًا العناوين والفواصل. */
function claims(text) {
  const out = [];
  for (const raw of String(text || '').split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (/^#{1,6}\s/.test(line)) continue;
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) continue;
    if (/^\s*\|?[\s:|-]+\|?\s*$/.test(line) && line.includes('-')) continue;

    const body = line.replace(/^\s*[-*•]\s*/, '').replace(/^\s*\d+[.)-]\s*/, '');
    if (body.replace(/\s/g, '').length < 12) continue;
    out.push(body);
  }
  return out;
}

const idsOf = (s) => {
  const m = String(s).match(RID) || [];
  RID.lastIndex = 0;
  return [...new Set(m)];
};

/** تشابه جملتين: تقارب اللفظ، ويُعزَّز إن اشتركتا في معرّفات التعليقات نفسها. */
function claimSimilarity(a, b) {
  const lex = similarity(a, b);
  const ia = idsOf(a), ib = idsOf(b);
  if (!ia.length || !ib.length) return lex;
  const shared = ia.filter((x) => ib.includes(x)).length;
  const bonus = shared / Math.max(ia.length, ib.length);
  return Math.min(1, lex * 0.7 + bonus * 0.3);
}

const AGREE = 0.45;

/**
 * يقارن مخرجات النماذج.
 * @param {string[]} outputs ثلاثة مخرجات (أو أقل)
 * @param {string[]} labels أسماء النماذج
 * @returns {{all:Array, some:Array, alone:Array, numbers:Array, stats:object}}
 */
export function compare(outputs = [], labels = []) {
  const sets = outputs.map((o, i) => ({
    label: labels[i] || `النموذج ${i + 1}`,
    claims: claims(o),
  })).filter((s) => s.claims.length);

  if (sets.length < 2) return { all: [], some: [], alone: [], numbers: [], stats: { sources: sets.length, groups: 0 } };

  // كل جملة تُضمّ إلى مجموعة إن شابهت جملةً فيها.
  const groups = [];
  sets.forEach((set, si) => {
    for (const c of set.claims) {
      const hit = groups.find((g) => g.members.some((m) => claimSimilarity(m.text, c) >= AGREE));
      if (hit) {
        if (!hit.sources.has(si)) hit.sources.add(si);
        hit.members.push({ text: c, source: si, label: set.label });
      } else {
        groups.push({ members: [{ text: c, source: si, label: set.label }], sources: new Set([si]) });
      }
    }
  });

  const shaped = groups.map((g) => {
    // الأطول عادةً أوفى، والأكثر استشهادًا أوثق.
    const best = g.members.reduce((a, b) =>
      (idsOf(b.text).length > idsOf(a.text).length
        || (idsOf(b.text).length === idsOf(a.text).length && b.text.length > a.text.length)) ? b : a);
    return {
      text: best.text,
      ids: idsOf(best.text),
      sources: [...g.sources].map((i) => sets[i].label),
      count: g.sources.size,
      variants: g.members.length,
    };
  });

  const n = sets.length;
  const all = shaped.filter((g) => g.count === n).sort((a, b) => b.ids.length - a.ids.length);
  const some = shaped.filter((g) => g.count > 1 && g.count < n);
  const alone = shaped.filter((g) => g.count === 1).sort((a, b) => b.ids.length - a.ids.length);

  // أرقام متعارضة: القيمة نفسها المذكورة بسياق متقارب واختلفت.
  const numbers = [];
  const byContext = new Map();
  sets.forEach((set) => {
    for (const c of set.claims) {
      const norm = normalizeDigits(c);
      const m = norm.match(/(\d+(?:[.,]\d+)?)\s*(%|٪|من\s*5)?/);
      if (!m) continue;
      const key = normalizeAr(norm.replace(/\d+(?:[.,]\d+)?/g, '#')).slice(0, 60);
      const row = byContext.get(key) || [];
      row.push({ label: set.label, value: parseFloat(m[1].replace(',', '.')), text: c });
      byContext.set(key, row);
    }
  });
  for (const [, rows] of byContext) {
    const vals = [...new Set(rows.map((r) => r.value))];
    if (rows.length > 1 && vals.length > 1) numbers.push({ values: rows });
  }

  return {
    all, some, alone, numbers,
    stats: {
      sources: n,
      groups: shaped.length,
      agreedAll: all.length,
      agreedSome: some.length,
      unique: alone.length,
      consensus: shaped.length ? Math.round((all.length / shaped.length) * 100) : 0,
    },
  };
}

/** توجيه يُضاف إلى رسالة الدمج، فيعرف الدامج ما اتُّفق عليه وما انفرد. */
export function mergeHint(result) {
  if (!result || result.stats.sources < 2) return '';
  const L = ['\n## خلاصة المقارنة الآلية بين المخرجات (استرشد بها ولا تنقلها)'];
  L.push(`- اتفقت المصادر كلها على ${result.stats.agreedAll} حكمًا (${result.stats.consensus}% من الأحكام).`);
  if (result.stats.agreedSome) L.push(`- اتفق بعضها على ${result.stats.agreedSome} حكمًا.`);
  if (result.stats.unique) L.push(`- انفرد مصدرٌ واحد بـ${result.stats.unique} حكمًا — أبقِها موسومةً إن كان لها سند، واحذفها إن لم يكن.`);
  if (result.numbers.length) {
    L.push(`- أرقام متعارضة بين المصادر (${result.numbers.length}) — ارجع إلى «الإحصاءات المحسوبة» ولا ترجّح بينها:`);
    for (const n of result.numbers.slice(0, 5)) {
      L.push(`  - ${n.values.map((v) => `${v.label}: ${v.value}`).join(' · ')}`);
    }
  }
  return L.join('\n');
}
