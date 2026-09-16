// كشف التزييف عبر منشآت أرشيفك — ما لا يُرى من منشأةٍ واحدة.
//
// الكاشف القائم ينظر داخل المنشأة الواحدة: نصوصٌ متشابهة، ومدحٌ عام، وتكدّس
// متطرّف. وثمّ نمطٌ لا يظهر إلا من الأرشيف مجتمعًا:
//
// - **كاتبٌ واحد** يمدح منشآت متنافسة، أو يذمّ واحدة ويمدح منافستها.
// - **نصٌّ واحد** يتكرّر حرفًا بحرف في منشأتين — وهو أقوى دليل.
//
// **ولا يُتَّهم أحد**: المُخرَج إشاراتٌ تُعرَض عليك، والحكم حكمُك. وتشابهُ
// الاسم ليس تطابقًا للشخص: «محمد» كثير، فلا يُبنى على الاسم وحده حكم.

import { normalizeAr } from './lexicon.js';

const canon = (s) => normalizeAr(String(s || '')).replace(/\s+/g, ' ').trim();

/** الأسماء الشائعة جدًّا لا تدلّ وحدها. */
const COMMON = new Set(['محمد', 'احمد', 'عبدالله', 'علي', 'سعود', 'خالد', 'فهد', 'نوره', 'ساره', 'a', 'user']);

/**
 * @param {Array} jobs كل وظائف الأرشيف
 * @returns {{authors:Array, texts:Array, checked:number}}
 */
export function scanNetwork(jobs = []) {
  const byAuthor = new Map();
  const byText = new Map();
  let checked = 0;

  for (const j of jobs) {
    const placeName = j?.place?.identity?.name || 'بلا اسم';
    for (const r of j?.place?.reviews || []) {
      checked += 1;
      const a = canon(r.author);
      // الاسم يُشترَط أن يكون مميَّزًا: كلمتان فأكثر، وليس من الشائع جدًّا.
      if (a && a.length >= 6 && a.includes(' ') && !COMMON.has(a)) {
        if (!byAuthor.has(a)) byAuthor.set(a, []);
        byAuthor.get(a).push({ place: placeName, jobId: j.id, id: r.id, rating: r.rating, date: r.date, text: r.text });
      }

      const t = canon(r.text);
      if (t.length >= 25) {
        if (!byText.has(t)) byText.set(t, []);
        byText.get(t).push({ place: placeName, jobId: j.id, id: r.id, rating: r.rating });
      }
    }
  }

  const authors = [...byAuthor.entries()]
    .map(([name, rows]) => {
      const places = [...new Set(rows.map((r) => r.place))];
      if (places.length < 2) return null;
      const rated = rows.filter((r) => Number(r.rating) >= 1);
      const high = rated.filter((r) => r.rating >= 4).length;
      const low = rated.filter((r) => r.rating <= 2).length;
      return {
        name: rows[0].text ? rows[0].placeAuthor || name : name,
        places,
        rows,
        count: rows.length,
        // النمط الأدلّ: مدحٌ هنا وذمٌّ هناك من الشخص نفسه.
        mixed: high > 0 && low > 0,
      };
    })
    .filter(Boolean)
    .sort((a, b) => (b.mixed - a.mixed) || b.places.length - a.places.length);

  const texts = [...byText.entries()]
    .map(([text, rows]) => {
      const places = [...new Set(rows.map((r) => r.place))];
      if (places.length < 2) return null;
      return { text: text.slice(0, 90), places, rows, count: rows.length };
    })
    .filter(Boolean)
    .sort((a, b) => b.places.length - a.places.length);

  return { authors, texts, checked };
}

export function networkBlock(jobs) {
  const n = scanNetwork(jobs);
  if (!n.authors.length && !n.texts.length) return '';
  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const t = n.texts.slice(0, 5).map((x) => `<li><b>نصٌّ متطابق</b> في ${x.places.length} منشآت (${esc(x.places.join('، '))}): «${esc(x.text)}…»</li>`).join('');
  const a = n.authors.slice(0, 6).map((x) => `<li><b>${esc(x.name)}</b> — ${x.count} تعليقًا في ${x.places.length} منشآت${x.mixed ? ' <b class="err-text">(مدحٌ هنا وذمٌّ هناك)</b>' : ''}: ${esc(x.places.join('، '))}</li>`).join('');

  return `<section class="network">
    <h2>إشارات عبر الأرشيف</h2>
    <p class="note">فُحص ${n.checked} تعليقًا في أرشيفك كلّه. وهذه <b>إشارات لا اتهامات</b>: تشابه الاسم ليس تطابقًا للشخص، والحكم حكمك.</p>
    ${t ? `<ul>${t}</ul>` : ''}
    ${a ? `<ul>${a}</ul>` : ''}
  </section>`;
}
