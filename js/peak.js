// أوقات الذروة ولغة التعليقات والأسئلة — ثلاثة حقول كانت في العقد بلا استعمال.
// فائدتها العملية: ربط الشكوى بساعتها يحوّل التوصية من «حسّن الخدمة»
// إلى «باريستا ثانٍ من ٧م إلى ١٠م».

import { topicsOf, topicSentiment, normalizeAr } from './lexicon.js';

export const DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

/**
 * يحلّل نصًّا ملصوقًا من «الأوقات الشائعة» في قوقل.
 * الصيغة المقبولة: سطر لكل يوم — «الخميس: 8ص=20, 9ص=45, 10م=90»
 * أو أرقام مفصولة بفواصل تُسنَد إلى الساعات ٦ص فما بعد.
 */
export function parsePopularTimes(raw) {
  const out = [];
  for (const line of String(raw || '').split('\n')) {
    const t = line.trim();
    if (!t) continue;
    const [head, rest] = t.includes(':') ? [t.slice(0, t.indexOf(':')), t.slice(t.indexOf(':') + 1)] : ['', t];
    const day = DAYS.find((d) => head.includes(d)) || head.trim() || '';
    if (!day) continue;

    const hours = [];
    const pairs = rest.split(/[,،]/).map((x) => x.trim()).filter(Boolean);
    let auto = 6;
    for (const pair of pairs) {
      const m = pair.match(/(\d{1,2})\s*(ص|م|am|pm)?\s*=\s*(\d{1,3})/i);
      if (m) {
        let h = parseInt(m[1], 10);
        const mer = (m[2] || '').toLowerCase();
        if ((mer === 'م' || mer === 'pm') && h < 12) h += 12;
        if ((mer === 'ص' || mer === 'am') && h === 12) h = 0;
        hours.push({ hour: h, level: Math.min(100, parseInt(m[3], 10)) });
      } else if (/^\d{1,3}$/.test(pair)) {
        hours.push({ hour: auto, level: Math.min(100, parseInt(pair, 10)) });
        auto += 1;
      }
    }
    if (hours.length) out.push({ day, hours: hours.sort((a, b) => a.hour - b.hour) });
  }
  return out;
}

const fmtHour = (h) => {
  const am = h < 12;
  const v = h % 12 === 0 ? 12 : h % 12;
  return `${v}${am ? 'ص' : 'م'}`;
};

/** ساعات الذروة: ما بلغ ٧٠٪ من أعلى قيمة في اليوم. */
export function peakWindows(popularTimes = []) {
  const out = [];
  for (const d of popularTimes) {
    if (!d.hours?.length) continue;
    const max = Math.max(...d.hours.map((h) => h.level));
    if (!max) continue;
    const hot = d.hours.filter((h) => h.level >= max * 0.7).map((h) => h.hour).sort((a, b) => a - b);
    if (!hot.length) continue;

    // نجمع الساعات المتلاصقة في نافذة واحدة.
    const windows = [];
    let start = hot[0], prev = hot[0];
    for (const h of hot.slice(1)) {
      if (h === prev + 1) { prev = h; continue; }
      windows.push([start, prev]); start = h; prev = h;
    }
    windows.push([start, prev]);
    out.push({
      day: d.day, max,
      windows: windows.map(([a, b]) => ({ from: a, to: b + 1, label: `${fmtHour(a)} – ${fmtHour(b + 1)}` })),
    });
  }
  return out;
}

/** الشكاوى المرتبطة بالازدحام، لتُربَط بنوافذ الذروة. */
const CROWD_TOPICS = ['crowd', 'wait', 'parking', 'service'];

/**
 * يربط شكاوى الازدحام والانتظار بنوافذ الذروة، فتصير التوصية محدَّدة الساعة.
 * @returns {{peaks:Array, related:Array, suggestion:string|null}}
 */
export function peakInsight(place) {
  const peaks = peakWindows(place?.popularTimes || []);
  const related = [];
  for (const r of place?.reviews || []) {
    const hits = topicsOf(r.text).filter((t) => CROWD_TOPICS.includes(t));
    for (const id of hits) {
      if (topicSentiment(r, id) === 'neg') { related.push({ id: r.id, topic: id }); break; }
    }
  }
  if (!peaks.length || !related.length) return { peaks, related, suggestion: null };

  const busiest = peaks.reduce((a, b) => (b.max > a.max ? b : a));
  const w = busiest.windows[0];
  return {
    peaks, related,
    suggestion: `${related.length} شكوى تتعلق بالازدحام أو الانتظار، وأعلى ذروة يوم ${busiest.day} ${w.label} — وجّه التعزيز إلى هذه النافذة تحديدًا (${related.map((x) => x.id).join('، ')}).`,
  };
}

/* ───── لغة التعليقات ───── */

const AR = /[؀-ۿ]/;
const LATIN = /[A-Za-z]/;

/** يحدّد لغة نصّ بالحروف لا بالمعجم: عربي، لاتيني، مختلط. */
export function detectLanguage(text) {
  const t = String(text || '');
  const ar = (t.match(/[؀-ۿ]/g) || []).length;
  const la = (t.match(/[A-Za-z]/g) || []).length;
  if (!ar && !la) return '';
  if (ar && la) return ar >= la * 2 ? 'ar' : (la >= ar * 2 ? 'en' : 'mixed');
  return ar ? 'ar' : 'en';
}

/** يملأ حقل اللغة في كل تعليق، ويُرجع التوزيع. */
export function tagLanguages(place) {
  const counts = { ar: 0, en: 0, mixed: 0, unknown: 0 };
  for (const r of place?.reviews || []) {
    r.language = detectLanguage(r.text);
    counts[r.language || 'unknown'] += 1;
  }
  const total = (place?.reviews || []).length;
  const share = (n) => (total ? Number(((n / total) * 100).toFixed(1)) : 0);
  return {
    counts, total,
    arabic: share(counts.ar), english: share(counts.en), mixed: share(counts.mixed),
    note: counts.en + counts.mixed >= Math.max(2, total * 0.2)
      ? `${share(counts.en + counts.mixed)}% من التعليقات بغير العربية — جمهور المكان ليس محليًّا بالكامل.`
      : null,
  };
}

/* ───── الأسئلة والأجوبة ───── */

/** يحلّل لصقًا من قسم الأسئلة في قوقل: سؤال ثم جواب ثم سطر فارغ أو ---. */
export function parseQna(raw) {
  const blocks = String(raw || '').split(/\n{2,}|^\s*-{3,}\s*$/m);
  const out = [];
  for (const b of blocks) {
    const lines = b.split('\n').map((l) => l.trim()).filter(Boolean);
    if (!lines.length) continue;
    const q = lines[0].replace(/^(?:س|سؤال|Q)\s*[:：.-]?\s*/i, '');
    const answers = lines.slice(1).map((l) => l.replace(/^(?:ج|جواب|إجابة|A)\s*[:：.-]?\s*/i, ''));
    if (q.length < 3) continue;
    out.push({ question: q, answer: answers.join(' ').trim(), date: '' });
  }
  return out;
}

/** أسئلة بلا جواب = معلومة يجهلها العميل قبل الزيارة. */
export function qnaInsight(place) {
  const qna = place?.qna || [];
  const unanswered = qna.filter((q) => !(q.answer || '').trim());
  const topics = new Map();
  for (const q of qna) {
    for (const id of topicsOf(q.question)) topics.set(id, (topics.get(id) || 0) + 1);
  }
  return {
    total: qna.length,
    unanswered: unanswered.length,
    unansweredQuestions: unanswered.map((q) => q.question),
    topics: [...topics.entries()].map(([id, n]) => ({ id, n })).sort((a, b) => b.n - a.n),
    note: unanswered.length
      ? `${unanswered.length} سؤالًا بلا جواب على صفحة المنشأة — كل من يقرؤها يبقى بلا إجابة.`
      : null,
  };
}

/** كتلة تُضاف إلى رسائل النماذج. */
export function contextBlock(place) {
  const L = [];
  const p = peakInsight(place);
  if (p.peaks.length) {
    L.push('\n## أوقات الذروة (كما أدخلها صاحب التقرير)');
    for (const d of p.peaks) L.push(`- ${d.day}: ${d.windows.map((w) => w.label).join('، ')}`);
    if (p.suggestion) L.push(`- ربط آليّ: ${p.suggestion}`);
  }

  const lang = tagLanguages(place);
  if (lang.note) L.push(`\n## لغة التعليقات\n- عربي ${lang.arabic}% · إنجليزي ${lang.english}% · مختلط ${lang.mixed}%\n- ${lang.note}`);

  const q = qnaInsight(place);
  if (q.total) {
    L.push('\n## الأسئلة والأجوبة على صفحة المنشأة');
    L.push(`- ${q.total} سؤالًا، منها ${q.unanswered} بلا جواب.`);
    if (q.note) L.push(`- ${q.note}`);
    for (const t of q.unansweredQuestions.slice(0, 8)) L.push(`  - بلا جواب: ${t}`);
  }
  return L.join('\n');
}
