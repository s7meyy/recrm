// تحويل نصٍّ ملصوق من صفحة قوقل مابز إلى تعليقات مطابقة للعقد.
// ثلاث صيغ مدعومة، والكشف تلقائي:
//   1) مُرقَّمة صريحة:  5 | أحمد | قبل شهر  ثم سطر/أسطر النص  ثم فاصل ---
//   2) لصق خام من صفحة قوقل مابز.
//
//      ونجومُ قوقل صورةٌ لا نصّ، فالنسخ من الصفحة يخرج **بلا تقييمات** غالبًا.
//      ولذلك يُرسى التعليق على **تاريخه** حين تغيب نجومه، ويبقى `rating` فارغًا
//      ولا يُخمَّن: العقد يحتمل التعليق بلا تقييم (`sampleAverage` يصير null)،
//      والواجهة تقول لك كم تعليقًا بلا تقييم. ورقمٌ مخترَع أسوأ من رقمٍ غائب.
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

/**
 * العدد بالكلمات — وقوقل العربي يكتب الواحدة والاثنتين هكذا لا بالأرقام.
 * وهذه تحديدًا تعليقات الغضب التي يقوم عليها التقرير، فسقوطها يُفقده أثمن ما فيه.
 */
const WORD_RATINGS = [
  [/(?:نجمة|نجمه)\s*(?:واحدة|واحده)?\s*$/i, 1],
  [/^\s*(?:نجمة|نجمه)\s*(?:واحدة|واحده)/i, 1],
  [/(?:نجمتان|نجمتين|نجمتا)/i, 2],
  [/(?:ثلاث|ثلاثة)\s*نجوم/i, 3],
  [/(?:أربع|اربع|أربعة|اربعة)\s*نجوم/i, 4],
  [/(?:خمس|خمسة)\s*نجوم/i, 5],
  [/\bone\s*star\b/i, 1],
  [/\btwo\s*stars?\b/i, 2],
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

  // الكلمات لا تُقبَل إلا في سطرٍ قصير، لئلا تُقرأ عبارةٌ داخل تعليق تقييمًا.
  if (s.trim().length <= 30) {
    for (const [re, n] of WORD_RATINGS) if (re.test(s)) return n;
  }
  return null;
}

// أسماء الأشهر كما تكتبها واجهة قوقل العربية بصيغتيها.
const AR_MONTHS = 'يناير|فبراير|مارس|أبريل|ابريل|مايو|يونيو|يوليو|أغسطس|اغسطس|سبتمبر|أكتوبر|اكتوبر|نوفمبر|ديسمبر'
  + '|كانون\\s*الثاني|شباط|آذار|اذار|نيسان|أيار|ايار|حزيران|تموز|آب|اب|أيلول|ايلول|تشرين\\s*الأول|تشرين\\s*الثاني|كانون\\s*الأول';

const DATE_PATTERNS = [
  /(?:قبل|منذ)\s+[^\n،.]{1,20}/,                          // قبل شهرين
  new RegExp(`\\d{1,2}\\s+(?:${AR_MONTHS})\\s+\\d{4}`),         // ١٥ سبتمبر ٢٠٢٦
  new RegExp(`(?:${AR_MONTHS})\\s+\\d{4}`),                      // سبتمبر ٢٠٢٦
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

/**
 * ردّ المالك — وصيغة قوقل الفعلية «الرد من المالك»، وكانت تفوت النمط القديم.
 *
 * وفوتُها ليس تجميلًا: الردّ يلتصق بنصّ العميل فيصير اعتذار المالك من كلامه،
 * ويُحلَّل على أنه رأيه، ويُقتبس منسوبًا إليه. وهو تلويثٌ لا يراه مدقّق السند
 * لأنه يقع قبله. ويُقبَل بعده تاريخٌ في السطر نفسه («الرد من المالك قبل ٥ أيام»).
 */
/** تاريخٌ يتصدّر سطرًا: يُنزع من نصّ الردّ ولا يُعدّ من كلام المالك. */
const LEADING_DATE = /^\s*(?:(?:قبل|منذ)\s+[^\n،.]{1,20}|(?:a|an|\d+)\s+(?:minute|hour|day|week|month|year)s?\s+ago)\s*[:：-]?\s*/i;

const OWNER_REPLY = new RegExp(
  '^\\s*(?:'
  + 'ال?رد{1,2}\\s*(?:من\\s*)?(?:المالك|صاحب\\s*(?:العمل|النشاط)(?:\\s*التجاري)?|المنشأة|الشركة)'
  + '|ردّ?\\s*(?:من\\s*)?(?:المالك|صاحب\\s*العمل)'
  + '|Response\\s*from\\s*(?:the\\s*)?owner'
  + ')\\s*(?:\\(.*?\\))?\\s*[:：-]?\\s*', 'i');   // والتاريخ بعده يتولّاه LEADING_DATE

// أسطر ضجيج شائعة في لصق قوقل مابز.
const NOISE = [
  /^Local\s*Guide/i, /^مرشد\s*محلي/, /^\d+\s*(?:مراجع|تقييم|review)/i,
  /^(?:مفيد|Helpful|Share|مشاركة|شارك|Like|إعجاب|أعجبني|اعجبني|تم\s*الإعجاب|More|المزيد|إبلاغ|Report)\s*$/i,
  /^(?:ترجمة|الترجمة|عرض\s*الترجمة|ترجمة\s*إلى\s*العربية|Translate|See\s*translation|Translated\s*by\s*Google)\s*$/i,
  /^\(?(?:تمت\s*الترجمة\s*بواسطة\s*Google|النص\s*الأصلي)\)?\s*$/i,
  /^(?:رد|الرد|Reply)\s*$/i,
  /^\s*·\s*$/, /^صور?\s*$/, /^\d+\s*صور?\s*$/i, /^Photos?$/i,
  /^See\s*(?:more|less)$/i, /^عرض\s*(?:المزيد|أقل)$/,
  /^New$/i, /^جديد$/,
];

// الأرقام تُطبَّع قبل الفحص: «٣ مراجعات» بأرقام قوقل العربية كانت تفوت النمط،
// فتُعامَل سطرًا ذا معنًى، فتصير اسمَ كاتب التعليق التالي.
const isNoise = (l) => {
  const t = normalizeDigits(l.trim());
  return NOISE.some((re) => re.test(t));
};

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
  let replyOpen = false;   // هل نحن داخل ردّ المالك؟

  const flush = () => {
    if (current) {
      current.text = current.text.trim();
      if (current.rating !== null || current.text) out.push(current);
    }
    current = null;
  };

  for (const line of lines) {
    const t = line.trim();
    if (!t) { prevLine = ''; replyOpen = false; continue; }   // الفراغ يفصل بين تعليقين

    // فاصل الصيغة الصريحة قد يرد في لصقٍ مختلط: يُنهي التعليق ولا يدخل نصّه.
    if (SEPARATOR.test(t)) { flush(); replyOpen = false; prevLine = ''; continue; }
    if (isNoise(t)) continue;  // لا يُحدَّث prevLine: اسم الكاتب قد يسبق سطر الضجيج.

    // رأسٌ بالصيغة الصريحة «4 | الاسم | قبل شهر» قد يرد داخل لصقٍ خام حين
    // يُكمل المستخدم بيده ما نقص. وكان يُقرأ نصًّا فيضيع تعليقُه صامتًا.
    const explicit = t.match(/^\s*([1-5])\s*\|\s*([^|\n]{0,40}?)\s*(?:\|\s*([^|\n]{0,30}?)\s*)?$/);

    const rating = explicit ? Number(explicit[1]) : extractRating(t);
    const ratingHeader = explicit !== null
      || (rating !== null && t.replace(STAR_CHARS, '').replace(/[\d\s\/.,]/g, '').length < 40);

    // سطرُ تاريخٍ قائم بذاته: مرساة التعليق حين لا نجوم — وهي الحال الغالبة.
    const dateOnly = (() => {
      if (ratingHeader || t.length > 30) return false;
      const d = extractDate(t);
      if (!d) return false;
      // يُقارَن بالسطر مُطبَّع الأرقام: extractDate يُعيد «قبل 3 أيام» بأرقام
      // لاتينية، والسطر «قبل ٣ أيام» بأرقام عربية، فلا يُحذف منه شيء فيُظنّ
      // السطرُ كلامًا لا تاريخًا — فيسقط التعليق كلّه ومعه ردّ المالك عليه.
      // وأكثر ما يقع في أحدث التعليقات («قبل ٣ أيام»، «قبل ٢٠ ساعة»).
      return normalizeDigits(t).replace(d, '').replace(/[|·•\-—,،\s]/g, '').length === 0;
    })();

    // ويبدأ تعليقًا جديدًا إن لم يكن تاريخَ التعليق المفتوح نفسه.
    const dateHeader = dateOnly && (!current || (current.date && current.text));

    if (ratingHeader || dateHeader) {
      // اسم الكاتب غالبًا السطر السابق مباشرةً، وقد يكون التُقط خطأً في نصّ التعليق السابق.
      const author = explicit
        ? (explicit[2] || '').trim()
        : ((prevLine && prevLine.length <= 40 && extractRating(prevLine) === null) ? prevLine : '');
      if (!explicit && author && current && current.text.trimEnd().endsWith(author)) {
        current.text = current.text.trimEnd().slice(0, -author.length).trimEnd();
      }
      flush();
      replyOpen = false;
      current = emptyReview();
      current.rating = rating;          // يبقى null إن لم يرد — ولا يُخمَّن
      current.date = explicit ? extractDate(explicit[3] || '') : extractDate(t);
      current.author = author;
      prevLine = t;
      continue;
    }

    if (!current) { prevLine = t; continue; }

    if (OWNER_REPLY.test(t)) {
      // «الرد من المالك قبل ٥ أيام» — التاريخ من بيانات الردّ لا من كلامه.
      current.ownerReply = t.replace(OWNER_REPLY, '').replace(LEADING_DATE, '').trim();
      replyOpen = true;
      prevLine = t;
      continue;
    }
    if (replyOpen) { current.ownerReply += (current.ownerReply ? '\n' : '') + t; prevLine = t; continue; }

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

  // يُوسَم كل تعليق بمصدره، فيُعرَف ما يمكن فحص نصّه بالمقارنة وما لا يمكن.
  const tag = (list, src) => list.map((r) => ({ ...r, source: src }));

  const asJson = parseJson(text);
  if (asJson && asJson.length) return { reviews: tag(asJson, 'json'), format: 'json', dropped: 0 };

  const structured = parseStructured(text);
  if (structured.length >= 2) return { reviews: tag(structured, 'paste'), format: 'structured', dropped: 0 };

  const loose = parseLoose(text);
  const usable = loose.filter((r) => (r.text || '').length > 1 || r.rating !== null);
  return { reviews: tag(usable, 'paste'), format: 'loose', dropped: loose.length - usable.length };
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
