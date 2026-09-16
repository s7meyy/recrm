// مدقّق السند — يفحص إجابة كل نموذج برمجيًّا بدل الاكتفاء بوصيّته في الميثاق.
// ثلاثة فحوص: معرّف لا وجود له، وحكم بلا سند، ورقم يخالف الإحصاءات المحسوبة.

import { stats } from './schema.js';
import { normalizeDigits } from './parse.js';

const RID = /\bR\d{3}\b/g;

/** يقطّع النص إلى جُمل مع مواضعها، متجاوزًا العناوين والجداول والأسطر الفارغة. */
function sentences(text) {
  const out = [];
  const lines = String(text || '').split('\n');
  let offset = 0;

  for (const line of lines) {
    const t = line.trim();
    const isHeading = /^#{1,6}\s/.test(t);
    const isTableRule = /^\s*\|?[\s:|-]+\|?\s*$/.test(t) && t.includes('-');
    const isRule = /^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(t);

    if (t && !isHeading && !isTableRule && !isRule) {
      // الجداول تُعامَل صفًّا صفًّا لا خليةً خلية: الصف وحدةُ حُكم.
      const parts = t.startsWith('|') ? [t] : t.split(/(?<=[.!؟])\s+/);
      let local = 0;
      for (const part of parts) {
        const idx = line.indexOf(part, local);
        if (part.trim().length > 1) out.push({ text: part, start: offset + (idx < 0 ? 0 : idx), end: offset + (idx < 0 ? 0 : idx) + part.length });
        local = (idx < 0 ? local : idx) + part.length;
      }
    }
    offset += line.length + 1;
  }
  return out;
}

// جمل لا تحتاج سندًا: التمهيد، وإقرار غياب البيانات، والعناوين الضمنية.
const NO_SOURCE_NEEDED = [
  /غير متوفّ?ر في البيانات/, /غير متوفّ?ر/, /لا يوجد في البيانات/,
  /لم (?:يرد|تَرِد|ترد|يُذكر|تُذكر)/, /تعذّ?ر الحكم/, /العيّ?نة (?:صغيرة|محدودة|غير كافية)/,
  /^\s*[-*•]?\s*(?:مقدمة|تمهيد|ملاحظة|خلاصة)\s*:?\s*$/,
];

// جمل تحمل حكمًا وتستوجب سندًا.
// بلا \b: حدود الكلمات في JavaScript تقوم على الحروف اللاتينية، فلا تعمل مع العربية.
const CLAIM_MARKERS = [
  /(?:يشكو|شكا|أشاد|امتدح|تكرر|متكرر|يتكرر|لوحظ|يلاحظ|يتضح|يظهر|يدل|يرجّ?ح|يميل|أفاد|ذكر)/,
  /(?:نقطة قوة|نقطة ضعف|أبرز|أكثر|أقل|معظم|غالب|أغلب|كثير من|عدد من|عدّة)/,
  /(?:العملاء|الزبائن|الزوّ?ار|المراجعون|التعليقات|الرواد)/,
  /(?:ضعف|قوة|بطء|سرعة|جودة|رداءة|نظافة|ارتفاع|انخفاض|تحسّ?ن|تراجع)/,
];

const isExempt = (s) => NO_SOURCE_NEEDED.some((re) => re.test(s));
const isClaim  = (s) => CLAIM_MARKERS.some((re) => re.test(s));

/** الأرقام الواردة في النص، مع سياق سطرها. */
function numbersIn(text) {
  const out = [];
  const norm = normalizeDigits(text);
  const re = /(\d+(?:[.,]\d+)?)\s*(%|٪|من\s*5|تعليق|تقييم|مراجع)?/g;
  let m;
  while ((m = re.exec(norm))) {
    const value = parseFloat(m[1].replace(',', '.'));
    if (Number.isNaN(value)) continue;
    const lineStart = norm.lastIndexOf('\n', m.index) + 1;
    let lineEnd = norm.indexOf('\n', m.index);
    if (lineEnd < 0) lineEnd = norm.length;
    out.push({ value, unit: m[2] || '', context: norm.slice(lineStart, lineEnd).trim() });
  }
  return out;
}

/**
 * يفحص مخرج نموذج في ضوء بيانات المنشأة.
 * @returns {{score:number, cited:number, claims:number, badIds:string[], usedIds:string[],
 *            unsupported:Array<{text:string}>, numberIssues:Array<{value:number,context:string,why:string}>,
 *            coverage:number, summary:string, level:'ok'|'warn'|'err'}}
 */
export function verify(output, place) {
  const text = String(output || '');
  const known = new Set((place?.reviews || []).map((r) => r.id));
  const s = stats(place);

  const found = [...new Set(text.match(RID) || [])];
  const badIds = found.filter((id) => !known.has(id));
  const usedIds = found.filter((id) => known.has(id));

  const sents = sentences(text);
  const claims = sents.filter((x) => isClaim(x.text) && !isExempt(x.text));
  // المطابقة لا الاختبار: RID تحمل علم g فيتنقّل lastIndex بين النداءات ويُفسد النتيجة.
  const unsupported = claims.filter((x) => (x.text.match(RID) || []).length === 0);

  const cited = claims.length - unsupported.length;
  const score = claims.length ? Math.round((cited / claims.length) * 100) : 100;

  // الأرقام: كل رقم يدّعي أنه متوسط أو عدد تعليقات أو نسبة، يُقارَن بالمحسوب.
  const numberIssues = [];
  const tolerance = 0.06;
  for (const n of numbersIn(text)) {
    const c = n.context;
    if (/متوسط|تقييم عام|من\s*5/.test(c) && n.value >= 1 && n.value <= 5) {
      const expected = s.googleAverage ?? s.sampleAverage;
      if (expected !== null && Math.abs(n.value - expected) > tolerance)
        numberIssues.push({ value: n.value, context: c, why: `المتوسط المحسوب ${expected}` });
    } else if (/عدد التعليقات|التعليقات المُحلَّ?لة|عيّ?نة/.test(c) && Number.isInteger(n.value) && n.value > 5) {
      if (n.value !== s.total && n.value !== s.googleCount)
        numberIssues.push({ value: n.value, context: c, why: `العيّنة ${s.total}${s.googleCount ? ` وإجمالي قوقل ${s.googleCount}` : ''}` });
    }
  }

  const coverage = known.size ? Number(((usedIds.length / known.size) * 100).toFixed(1)) : 0;

  const misquotes = checkQuotes(text, place);

  const problems = badIds.length + unsupported.length + numberIssues.length + misquotes.length;
  const level = badIds.length || numberIssues.length || misquotes.length ? 'err' : (unsupported.length ? 'warn' : 'ok');

  const summary = problems === 0
    ? `مطابق: ${cited} حكمًا مسنودًا، واستُشهد بـ${usedIds.length} تعليقًا (${coverage}% من العيّنة).`
    : `${score}% من الأحكام مسنودة — ${[
        badIds.length ? `${badIds.length} معرّفًا لا وجود له` : '',
        unsupported.length ? `${unsupported.length} حكمًا بلا سند` : '',
        numberIssues.length ? `${numberIssues.length} رقمًا يخالف المحسوب` : '',
        misquotes.length ? `${misquotes.length} اقتباسًا غُيِّر نصُّه` : '',
      ].filter(Boolean).join('، ')}.`;

  return { score, cited, claims: claims.length, badIds, usedIds, unsupported, numberIssues, misquotes, coverage, summary, level };
}

/** يُسوّى النصّ للمقارنة: علامات الاتجاه والفراغات والتنصيص لا تُغيّر الكلام. */
function plain(t) {
  return String(t || '')
    .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '')
    .replace(/[«»"'\u201c\u201d\u2018\u2019]/g, '')
    .replace(/[…]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * الاقتباسات: هل نُقل كلام العميل كما كتبه؟
 *
 * الميثاق يأمر بالنقل الحرفي، والأمر وحده لا يكفي. فكل ما بين قوسي اقتباس
 * في مخرج النموذج يُبحَث عنه في نصوص التعليقات: فإن لم يوجد فقد أُعيدت صياغته
 * أو لُطِّف — ومن لطّف ذمًّا فقد زوّر شهادة صاحبه، وهذا خرقٌ لشرط الأداة لا
 * مجرّد ركاكة. والقصير (أقل من ١٥ حرفًا) يُترك: قد يكون كلمةً عامة لا اقتباسًا.
 */
export function checkQuotes(output, place) {
  const text = String(output || '');
  const hay = (place?.reviews || []).map((r) => plain(r.text)).join('\n');
  if (!hay) return [];

  const out = [];
  const seen = new Set();
  for (const m of text.matchAll(/[«"\u201c]([^»"\u201d\n]{15,200})[»"\u201d]/g)) {
    const q = plain(m[1]);
    if (!q || seen.has(q)) continue;
    seen.add(q);
    if (!hay.includes(q)) out.push(q.slice(0, 90));
  }
  return out;
}

/** التعليقات التي لم يستشهد بها المخرج — قد تكون أُهملت. */
export function unusedReviews(output, place) {
  const used = new Set(String(output || '').match(RID) || []);
  RID.lastIndex = 0;
  return (place?.reviews || []).filter((r) => !used.has(r.id)).map((r) => r.id);
}
