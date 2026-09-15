// تحويل نصٍّ ملصوق من صفحة قوقل مابز إلى تعليقات مطابقة للعقد.
// ثلاث صيغ مدعومة، والكشف تلقائي:
//   1) مُرقَّمة صريحة:  5 | أحمد | قبل شهر  ثم سطر/أسطر النص  ثم فاصل ---
//   2) لصق خام من صفحة قوقل مابز (تُستنتَج النجوم والتاريخ من الأنماط المعروفة).
//   3) JSON جاهز (من مزوّد أو تصدير سابق).

import { emptyReview } from './schema.js';

const AR_DIGITS = { '٠':'0','١':'1','٢':'2','٣':'3','٤':'4','٥':'5','٦':'6','٧':'7','٨':'8','٩':'9',
                    '۰':'0','۱':'1','۲':'2','۳':'3','۴':'4','۵':'5','۶':'6','۷':'7','۸':'8','۹':'9' };

export const normalizeDigits = (s) => String(s).replace(/[٠-٩۰-۹]/g, (d) => AR_DIGITS[d]);

const SEPARATOR = /^\s*(-{3,}|={3,}|\*{3,}|_{3,})\s*$/;

// أنماط تدلّ على عدد النجوم داخل سطر.
const RATING_PATTERNS = [
  /(\d(?:[.,]\d)?)\s*(?:\/|من)\s*5/i,                    // 4/5 أو 4 من 5
  /rated\s*(\d(?:\.\d)?)\s*out\s*of\s*5/i,               // Rated 4.0 out of 5
  /(\d)\s*(?:نجوم|نجمة|نجمتان|نجمتين|star|stars)/i,      // 3 نجوم
];

const STAR_CHARS = /[★☆⭐✩✪✭✮]/g;

/** يستخرج عدد النجوم من سطر، أو null. */
export function extractRating(line) {
  const s = normalizeDigits(line);
  for (const re of RATING_PATTERNS) {
    const m = s.match(re);
    if (m) {
      const n = Math.round(parseFloat(m[1].replace(',', '.')));
      if (n >= 1 && n <= 5) return n;
    }
  }
  const filled = (s.match(/[★⭐✪✭]/g) || []).length;
  if (filled >= 1 && filled <= 5 && s.replace(STAR_CHARS, '').trim().length < 30) return filled;
  return null;
}

const DATE_PATTERNS = [
  /(?:قبل|منذ)\s+[^\n،.]{1,20}/,                          // قبل شهرين
  /\b(?:a|an|\d+)\s+(?:minute|hour|day|week|month|year)s?\s+ago\b/i,
  /\b\d{4}-\d{2}-\d{2}\b/,
  /\b\d{1,2}\/\d{1,2}\/\d{4}\b/,
];

export function extractDate(line) {
  const s = normalizeDigits(line);
  for (const re of DATE_PATTERNS) {
    const m = s.match(re);
    if (m) return m[0].trim();
  }
  return '';
}

const OWNER_REPLY = /^\s*(?:رد\s*(?:المالك|صاحب\s*العمل|المنشأة)|Response\s*from\s*the\s*owner|ردّ\s*المالك)\s*[:：-]?\s*/i;

// أسطر ضجيج شائعة في لصق قوقل مابز.
const NOISE = [
  /^Local\s*Guide/i, /^مرشد\s*محلي/, /^\d+\s*(?:مراجع|تقييم|review)/i,
  /^(?:مفيد|Helpful|Share|مشاركة|Like|إعجاب|More|المزيد|إبلاغ|Report)\s*$/i,
  /^\s*·\s*$/, /^صور?\s*$/, /^\d+\s*صور?\s*$/i, /^Photos?$/i,
  /^See\s*(?:more|less)$/i, /^عرض\s*(?:المزيد|أقل)$/,
  /^New$/i, /^جديد$/,
];

const isNoise = (l) => NOISE.some((re) => re.test(l.trim()));

/** الصيغة 1: أسطر رأس مفصولة بـ | ثم نص ثم فاصل. */
function parseStructured(raw) {
  const blocks = raw.split(/\n(?=\s*(?:-{3,}|={3,}))/).length > 1
    ? raw.split(/^\s*(?:-{3,}|={3,}|\*{3,}|_{3,})\s*$/m)
    : raw.split(/\n{2,}/);

  const out = [];
  for (const block of blocks) {
    const lines = block.split('\n').map((l) => l.trimEnd()).filter((l) => l.trim() !== '');
    if (!lines.length) continue;

    const head = lines[0];
    if (!head.includes('|')) continue;
    const parts = head.split('|').map((p) => p.trim());
    const rating = extractRating(parts[0]) ?? (/^\d$/.test(normalizeDigits(parts[0])) ? Number(normalizeDigits(parts[0])) : null);
    if (rating === null) continue;

    const r = emptyReview();
    r.rating = rating;
    r.author = parts[1] || '';
    r.date = parts[2] || '';

    const body = [];
    for (const line of lines.slice(1)) {
      if (OWNER_REPLY.test(line)) { r.ownerReply = line.replace(OWNER_REPLY, '').trim(); continue; }
      if (r.ownerReply) { r.ownerReply += '\n' + line.trim(); continue; }
      body.push(line.trim());
    }
    r.text = body.join('\n').trim();
    out.push(r);
  }
  return out;
}

/** الصيغة 2: لصق خام — يُقسَّم عند كل سطر يحمل نجومًا/تقييمًا. */
function parseLoose(raw) {
  const lines = raw.split('\n').map((l) => l.replace(/‏|‎/g, '').trimEnd());
  const out = [];
  let current = null;
  let prevLine = '';

  const flush = () => {
    if (current) {
      current.text = current.text.trim();
      if (current.rating !== null || current.text) out.push(current);
    }
    current = null;
  };

  for (const line of lines) {
    const t = line.trim();
    if (!t) { prevLine = ''; continue; }
    if (isNoise(t)) continue;  // لا يُحدَّث prevLine: اسم الكاتب قد يسبق سطر الضجيج.

    const rating = extractRating(t);
    const looksLikeHeader = rating !== null && t.replace(STAR_CHARS, '').replace(/[\d\s\/.,]/g, '').length < 40;

    if (looksLikeHeader) {
      // اسم الكاتب غالبًا السطر السابق مباشرةً، وقد يكون التُقط خطأً في نصّ التعليق السابق.
      const author = (prevLine && prevLine.length <= 40 && extractRating(prevLine) === null) ? prevLine : '';
      if (author && current && current.text.trimEnd().endsWith(author)) {
        current.text = current.text.trimEnd().slice(0, -author.length).trimEnd();
      }
      flush();
      current = emptyReview();
      current.rating = rating;
      current.date = extractDate(t);
      current.author = author;
      prevLine = t;
      continue;
    }

    if (!current) { prevLine = t; continue; }

    if (OWNER_REPLY.test(t)) { current.ownerReply = t.replace(OWNER_REPLY, '').trim(); prevLine = t; continue; }
    if (current.ownerReply) { current.ownerReply += '\n' + t; prevLine = t; continue; }

    if (!current.date) {
      const d = extractDate(t);
      if (d && t.length <= 30) { current.date = d; prevLine = t; continue; }
    }
    current.text += (current.text ? '\n' : '') + t;
    prevLine = t;
  }
  flush();
  return out;
}

/** الصيغة 3: JSON — مصفوفة تعليقات أو كائن فيه reviews. */
function parseJson(raw) {
  let data;
  try { data = JSON.parse(raw); } catch { return null; }
  const arr = Array.isArray(data) ? data : (Array.isArray(data?.reviews) ? data.reviews : null);
  if (!arr) return null;
  return arr.map((item) => {
    const r = emptyReview();
    r.author = item.author || item.author_name || item.name || item.reviewer || '';
    const rate = item.rating ?? item.stars ?? item.score ?? item.review_rating;
    r.rating = rate !== undefined && rate !== null ? Math.round(Number(rate)) || null : null;
    r.date = item.date || item.relative_time_description || item.published_at || item.review_datetime_utc || '';
    r.text = item.text || item.review_text || item.snippet || item.comment || '';
    r.ownerReply = item.ownerReply || item.owner_answer || item.response || item.reply || '';
    r.likes = item.likes ?? item.review_likes ?? null;
    return r;
  }).filter((r) => r.text || r.rating);
}

/**
 * الواجهة الموحّدة.
 * @returns {{reviews: object[], format: 'json'|'structured'|'loose', dropped: number}}
 */
export function parseReviews(raw) {
  const text = String(raw || '').trim();
  if (!text) return { reviews: [], format: 'loose', dropped: 0 };

  const asJson = parseJson(text);
  if (asJson && asJson.length) return { reviews: asJson, format: 'json', dropped: 0 };

  const structured = parseStructured(text);
  if (structured.length >= 2) return { reviews: structured, format: 'structured', dropped: 0 };

  const loose = parseLoose(text);
  const usable = loose.filter((r) => (r.text || '').length > 1 || r.rating !== null);
  return { reviews: usable, format: 'loose', dropped: loose.length - usable.length };
}

/** استخلاص بيانات الهوية من كتلة رأس صفحة قوقل مابز إن لُصقت. */
export function parseHeader(raw) {
  const lines = normalizeDigits(String(raw || '')).split('\n').map((l) => l.trim()).filter(Boolean);
  const out = { name: '', average: null, count: null, category: '', address: '', phone: '' };
  if (!lines.length) return out;

  out.name = lines[0];
  for (const l of lines) {
    const avg = l.match(/(\d[.,]\d)\s*(?:\(|★|نجم|$)/);
    if (avg && out.average === null) out.average = parseFloat(avg[1].replace(',', '.'));
    const cnt = l.match(/\(?\s*([\d,٬]{2,})\s*\)?\s*(?:تقييم|مراجع|review)/i);
    if (cnt && out.count === null) out.count = parseInt(cnt[1].replace(/[,٬]/g, ''), 10);
    const phone = l.match(/(?:\+?966|0)\s?5\d[\s-]?\d{3}[\s-]?\d{4}/);
    if (phone && !out.phone) out.phone = phone[0].replace(/\s|-/g, '');
    if (/(?:الرياض|جدة|مكة|المدينة|الدمام|الخبر|طريق|شارع|حي\s)/.test(l) && !out.address && l.length > 10) out.address = l;
  }
  return out;
}
