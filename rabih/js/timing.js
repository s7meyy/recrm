// متى تقع الشكوى؟ — من نصّ التعليق نفسه.
//
// التعليقات تذكر أوقاتها: «الجمعة»، «الصباح»، «بعد العشاء»، «وقت الذروة».
// فتُستخرج هذه الإشارات وتُقاطَع بالمواضيع، فيتحوّل «حسّن الخدمة» إلى قرار
// جدولة: كادرٌ إضافي الخميس والجمعة من السابعة إلى العاشرة.
//
// **وحدُّه مُعلَن**: ليس كل تعليقٍ يذكر وقته، وأكثرها لا يذكره. فالمعروض
// نسبةٌ ممّا **ذكر** لا ممّا وقع، ويُقال ذلك بالرقم لا يُخفى.

import { normalizeAr } from './lexicon.js';
import { topicsOf, topicSentiment, TOPICS } from './lexicon.js';

/** إشارات الوقت كما تُكتب بالعامية والفصحى. */
const SLOTS = [
  { id: 'morning', name: 'الصباح',        keys: ['الصباح', 'صباحا', 'صباحًا', 'الفطور', 'بواكير', 'الصبح', 'الضحى'] },
  { id: 'noon',    name: 'الظهيرة',       keys: ['الظهر', 'ظهرا', 'ظهرًا', 'الغداء', 'الظهيره'] },
  { id: 'evening', name: 'المساء',        keys: ['المساء', 'مساء', 'العشاء', 'الليل', 'ليلا', 'ليلًا', 'بعد المغرب', 'العشا'] },
  { id: 'peak',    name: 'وقت الذروة',    keys: ['الذروه', 'الذروة', 'وقت الزحمه', 'اوقات الزحام', 'وقت الزحام'] },
];

const DAYS = [
  { id: 'fri',  name: 'الجمعة',    keys: ['الجمعه', 'الجمعة'] },
  { id: 'thu',  name: 'الخميس',    keys: ['الخميس'] },
  { id: 'sat',  name: 'السبت',     keys: ['السبت'] },
  { id: 'sun',  name: 'الأحد',     keys: ['الاحد'] },
  { id: 'mon',  name: 'الاثنين',   keys: ['الاثنين', 'الإثنين'] },
  { id: 'tue',  name: 'الثلاثاء',  keys: ['الثلاثاء'] },
  { id: 'wed',  name: 'الأربعاء',  keys: ['الاربعاء'] },
  { id: 'weekend', name: 'نهاية الأسبوع', keys: ['نهايه الاسبوع', 'نهاية الاسبوع', 'الويكند', 'الاجازه', 'الإجازة'] },
];

const norm = (list) => list.map((x) => ({ ...x, n: x.keys.map(normalizeAr) }));
const SLOTS_N = norm(SLOTS);
const DAYS_N = norm(DAYS);

const hit = (text, table) => {
  const t = normalizeAr(text);
  return table.filter((row) => row.n.some((k) => k && t.includes(k))).map((row) => row.id);
};

/** ساعةٌ صريحة: «الساعة ٨» أو «٨ مساءً». */
function explicitHours(text) {
  const t = normalizeAr(text).replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
  const out = [];
  for (const m of t.matchAll(/(?:الساعه|الساعة)?\s*(\d{1,2})\s*(?:م|مساء|صباحا|ص)?/g)) {
    const h = Number(m[1]);
    if (h >= 1 && h <= 12 && /الساعه|الساعة|مساء|صباحا/.test(m[0])) out.push(h);
  }
  return out;
}

/**
 * @returns {{mentioned, total, slots:Array, days:Array, byTopic:Array, hours:Array}}
 */
export function timing(place) {
  const reviews = place?.reviews || [];
  const slots = new Map(SLOTS.map((s) => [s.id, { ...s, count: 0, ids: [] }]));
  const days = new Map(DAYS.map((d) => [d.id, { ...d, count: 0, ids: [] }]));
  const byTopic = new Map();
  const hours = new Map();
  let mentioned = 0;

  for (const r of reviews) {
    const text = r.text || '';
    const s = hit(text, SLOTS_N);
    const d = hit(text, DAYS_N);
    if (!s.length && !d.length) continue;
    mentioned += 1;

    for (const id of s) { const row = slots.get(id); row.count += 1; if (row.ids.length < 10) row.ids.push(r.id); }
    for (const id of d) { const row = days.get(id); row.count += 1; if (row.ids.length < 10) row.ids.push(r.id); }
    for (const h of explicitHours(text)) hours.set(h, (hours.get(h) || 0) + 1);

    // الشكوى وحدها: ذكرُ وقتٍ في مدحٍ لا يوجّه جدولة.
    const negTopics = topicsOf(text).filter((id) => topicSentiment(r, id) === 'neg');
    for (const t of negTopics) {
      if (!byTopic.has(t)) byTopic.set(t, { id: t, name: TOPICS.find((x) => x.id === t)?.name || t, slots: {}, days: {}, total: 0, ids: [] });
      const row = byTopic.get(t);
      row.total += 1;
      if (row.ids.length < 10) row.ids.push(r.id);
      for (const x of s) row.slots[x] = (row.slots[x] || 0) + 1;
      for (const x of d) row.days[x] = (row.days[x] || 0) + 1;
    }
  }

  const clean = (m) => [...m.values()].filter((x) => x.count > 0).sort((a, b) => b.count - a.count);

  return {
    total: reviews.length,
    mentioned,
    slots: clean(slots),
    days: clean(days),
    hours: [...hours.entries()].sort((a, b) => b[1] - a[1]).map(([h, n]) => ({ hour: h, count: n })),
    byTopic: [...byTopic.values()]
      .map((t) => {
        const topSlot = Object.entries(t.slots).sort((a, b) => b[1] - a[1])[0] || null;
        const topDay = Object.entries(t.days).sort((a, b) => b[1] - a[1])[0] || null;
        return {
          ...t,
          topSlot: topSlot ? { name: SLOTS.find((s) => s.id === topSlot[0])?.name, count: topSlot[1] } : null,
          topDay: topDay ? { name: DAYS.find((d) => d.id === topDay[0])?.name, count: topDay[1] } : null,
        };
      })
      .filter((t) => t.topSlot || t.topDay)
      .sort((a, b) => b.total - a.total),
  };
}

export function timingBlock(place) {
  const t = timing(place);
  if (!t.mentioned) return '';
  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const lines = t.byTopic.slice(0, 5).map((x) => {
    const bits = [];
    if (x.topSlot) bits.push(`${x.topSlot.count} منها تذكر ${x.topSlot.name}`);
    if (x.topDay) bits.push(`${x.topDay.count} تذكر ${x.topDay.name}`);
    return `<li><b>${esc(x.name)}</b>: ${esc(bits.join('، '))}.</li>`;
  }).join('');

  return `<section class="timing">
    <h2>متى تقع الشكوى؟</h2>
    <p class="note"><b>${t.mentioned}</b> من ${t.total} تعليقًا ذكرت وقتها صراحةً — والنسب أدناه <b>ممّا ذُكر لا ممّا وقع</b>، فما لم يُذكر وقته لا يدخل الحساب ولا يُخمَّن.</p>
    ${lines ? `<ul>${lines}</ul>` : ''}
    ${t.slots.length ? `<p class="fine">الأوقات الأكثر ذكرًا: ${t.slots.slice(0, 3).map((s) => `${esc(s.name)} (${s.count})`).join(' · ')}.</p>` : ''}
    ${t.days.length ? `<p class="fine">الأيام: ${t.days.slice(0, 3).map((d) => `${esc(d.name)} (${d.count})`).join(' · ')}.</p>` : ''}
  </section>`;
}
