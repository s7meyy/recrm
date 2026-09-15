// تفريغ المستندات إلى حقول (المرحلة ٤١).
//
// النصّ يصل من مصدرين: تلصقه بنفسك (من «النص المباشر» في جوالك، أو من PDF يُنسخ منه)،
// أو يأتي من قراءة المستندات وتفريغ الصوت حين يُعتمدان. **والقراءة واحدة في الحالين** —
// فلا منطقَ قراءةٍ ثانٍ يُكتب ثم ينحرف عن أخيه.
//
// وما يُقرأ من الصكّ السعودي: رقمه وتاريخه، والمالك وهويّته، والمساحة، ورقم المخطط
// والقطعة، والحدود والأطوال. **وكلُّ حقلٍ يحمل النصّ الذي قُرئ منه** — فترى بعينك من
// أين جاء، وتصحّح ما أُسيء فهمه بدل أن تثق على عماك.
//
// **ولا يُخمَّن حقل**: ما لم يُقرأ لا يظهر، ورقمُ صكٍّ مخترَع في عقدٍ أسوأ من حقلٍ فارغ.
//
// دوال خالصة: لا تخزين ولا شبكة.

const TASHKEEL = /[ؐ-ًؚ-ٰٟۖ-ۭ]/g;
const INVISIBLE = /[­؜​-‏‪-‮⁦-⁩﻿]/g;
const AR_DIGITS = /[٠-٩۰-۹]/g;
const TASHKEEL_1 = new RegExp(TASHKEEL.source);
const INVISIBLE_1 = new RegExp(INVISIBLE.source);

/** تطبيعٌ يحفظ الترقيم والأسطر: الصكّ يُقرأ سطرًا سطرًا، ودمجُ الأسطر يخلط حقوله. */
function prep(value) {
  let s = String(value ?? '');
  if (!s) return '';
  try { s = s.normalize('NFKC'); } catch (_) { /* متصفّح لا يدعم normalize */ }
  s = s.replace(INVISIBLE, '').replace(TASHKEEL, '').replace(/ـ/g, '');
  s = s.replace(AR_DIGITS, (d) => {
    const c = d.charCodeAt(0);
    return String(c >= 0x06f0 ? c - 0x06f0 : c - 0x0660);
  });
  return s
    .replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/[ىی]/g, 'ي')
    .replace(/ؤ/g, 'و').replace(/ئ/g, 'ي').replace(/ک/g, 'ك')
    .replace(/[\t\r]+/g, ' ')
    .replace(/[ ]{2,}/g, ' ');
}

/**
 * مثلُ `prep` تمامًا، لكنّه يحتفظ بخريطةٍ من كل حرفٍ مطبَّعٍ إلى موضعه في الأصل.
 *
 * **ولماذا؟** التطبيع صوابٌ للمطابقة وخطأٌ للتخزين. فـ«قطعة رقم ٤٨» في حدّ الصكّ كانت
 * تُحفظ «قطعه رقم 48» — بخطأٍ إملائيّ ليس في الصكّ، ثم تُنسخ إلى عقد. وهو العطب نفسه
 * الذي أُصلح لاسم المرسِل في المرحلة ٤١، وكان باقيًا في الحدود والحيّ والمدينة.
 * فالقراءة تجري على المطبَّع، **والقيمة تُقتطع من الأصل**.
 */
function prepMapped(value) {
  let src = String(value ?? '');
  try { src = src.normalize('NFKC'); } catch (_) { /* متصفّح لا يدعم normalize */ }
  let t = '';
  const map = [];
  let lastSpace = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    // نُسخٌ بلا `g`: الأصليّتان عامّتان، و`test` عليهما تحرّك `lastIndex` فتُخطئ بالتناوب.
    if (INVISIBLE_1.test(ch) || TASHKEEL_1.test(ch) || ch === 'ـ') continue;
    const code = ch.charCodeAt(0);
    let out = ch;
    if (code >= 0x0660 && code <= 0x0669) out = String(code - 0x0660);
    else if (code >= 0x06f0 && code <= 0x06f9) out = String(code - 0x06f0);
    else if ('أإآٱ'.includes(ch)) out = 'ا';
    else if (ch === 'ة') out = 'ه';
    else if ('ىی'.includes(ch)) out = 'ي';
    else if (ch === 'ؤ') out = 'و';
    else if (ch === 'ئ') out = 'ي';
    else if (ch === 'ک') out = 'ك';
    else if (ch === '\t' || ch === '\r') out = ' ';
    if (out === ' ') { if (lastSpace) continue; lastSpace = true; } else lastSpace = false;
    t += out;
    map.push(i);
  }
  return { t, map, src };
}

const NUM = String.raw`\d{1,3}(?:[.,،٬ ]\d{3})+|\d+(?:[.,٫]\d+)?`;
const rx = (body, flags = '') => new RegExp(body.replace(/NUM/g, NUM), flags);

function toNumber(text) {
  let s = String(text ?? '').replace(/[\s،٬,]/g, '');
  if ((s.match(/\./g) || []).length > 1 || /^\d+\.\d{3}$/.test(s)) s = s.replace(/\./g, '');
  s = s.replace(/٫/g, '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** الجهات الأربع في الصكّ — حدودٌ وأطوال. */
// فراغٌ **أفقيّ** لا يشمل السطر الجديد: `\s` تشمله، فيلتقط الحقلُ كلمةً من السطر التالي
// («الحي: النرجس» ثم سطرٌ يبدأ بـ«رقم» فيصير الحيّ «النرجس رقم»). والصكّ يُقرأ سطرًا سطرًا.
const H = '[^\\S\\n]';
// **و`\\w` لاتينيّةٌ كذلك** (`[A-Za-z0-9_]`): فرقمُ بلكٍ اسمُه «ب» لا يطابق `[\\w\\d]`.
// وهو الفخّ نفسه في `\\b` و`\\d` — كلُّ صنفٍ مختصرٍ في جافاسكربت لاتينيُّ المولد.
// فالرمز هنا يُكتب صريحًا: حرفٌ عربيّ أو لاتينيّ أو رقمٌ أو مائلة أو شرطة.
const TOKEN = '[\\u0600-\\u06FFA-Za-z0-9/\\-]';
/** كلماتٌ لا تكون اسمًا ولا حيًّا — تقف القراءة عندها. */
const STOP_WORDS = ['رقم', 'هويه', 'الهويه', 'تاريخ', 'بتاريخ', 'المساحه', 'مساحه', 'الحي', 'المدينه', 'المخطط', 'القطعه', 'البلك', 'وبموجب', 'الشمال', 'الجنوب', 'الشرق', 'الغرب'];

/**
 * أدواتُ وصلٍ في الاسم السعوديّ. واسمٌ ينتهي بإحداها **مبتورٌ يبدو تامًّا** — وذلك أسوأ
 * من ناقصٍ معلَن: «عبدالعزيز بن محمد بن» يُقرأ اسمًا كاملًا وليس كذلك. وأسماء الصكوك
 * رباعيّةٌ وخماسيّةٌ بـ«بن»، فحدُّ أربع كلماتٍ كان يبترها كلَّها.
 */
const NAME_CONNECTORS = ['بن', 'بنت', 'ابن', 'ابنه', 'عبد', 'ال', 'ال', 'ابو', 'ام'];

/** يقرأ اسمًا كاملًا: يقف عند كلمةٍ واقفة، ويحدّ بثماني كلمات، ولا يترك أداةَ وصلٍ آخرَه. */
function takeName(text, max = 8) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  const out = [];
  let truncated = false;
  for (const w of words) {
    if (STOP_WORDS.includes(prep(w))) break;
    if (out.length >= max) { truncated = true; break; }
    out.push(w);
  }
  while (out.length && NAME_CONNECTORS.includes(prep(out[out.length - 1]))) { out.pop(); truncated = true; }
  return { text: out.join(' ').replace(/[،؛.:]+$/, '').trim(), truncated };
}

/** يقصّ عند أوّل كلمةٍ واقفة، ويحدّ العدد — فلا يبتلع الحقلُ ما بعده. */
function takeWords(text, max) {
  const out = [];
  for (const w of String(text || '').trim().split(/\s+/)) {
    if (STOP_WORDS.includes(w)) break;
    out.push(w);
    if (out.length === max) break;
  }
  return out.join(' ').replace(/[،؛.:]+$/, '').trim();
}

const SIDES = [['الشمال', 'شمالا'], ['الجنوب', 'جنوبا'], ['الشرق', 'شرقا'], ['الغرب', 'غربا']];
const SIDE_LABEL = { الشمال: 'الحدّ الشمالي', الجنوب: 'الحدّ الجنوبي', الشرق: 'الحدّ الشرقي', الغرب: 'الحدّ الغربي' };

/** ما يُعرف من أنواع المستندات — يُقال للمستخدم ما ظنّه النظام، ويبقى تعديلُه بيده. */
export const DOC_KINDS = [
  { key: 'deed', label: 'صك ملكية', words: ['صك', 'صكوك', 'وثيقه ملكيه', 'كتابة عدل', 'سجل عقاري'] },
  { key: 'id', label: 'هوية أو إقامة', words: ['الهويه الوطنيه', 'بطاقه احوال', 'رقم الهويه', 'اقامه نظاميه'] },
  { key: 'permit', label: 'رخصة بناء', words: ['رخصه بناء', 'رخصه انشاء', 'الامانه', 'البلديه'] },
  { key: 'lease', label: 'عقد إيجار', words: ['عقد ايجار', 'ايجار', 'المؤجر', 'المستاجر'] },
  { key: 'voice', label: 'طلب أو رسالة', words: ['ابغي', 'ابي', 'اريد', 'عندي', 'السلام عليكم'] },
];

/** يخمّن نوع المستند من نصّه — ويعيد null إن لم يتبيّن، فلا يُدَّعى تمييزٌ لم يقع. */
export function guessKind(text) {
  const t = prep(text);
  if (!t.trim()) return null;
  let best = null;
  for (const kind of DOC_KINDS) {
    const hits = kind.words.filter((w) => t.includes(prep(w))).length;
    if (hits && (!best || hits > best.hits)) best = { key: kind.key, label: kind.label, hits };
  }
  return best ? { key: best.key, label: best.label } : null;
}

/**
 * يفرّغ نصّ مستندٍ إلى حقول.
 * @returns {{ kind, fields: object, found: Array<{key,label,value,text,snippet}>, warnings: string[] }}
 *          `snippet` السطرُ الذي قُرئ منه الحقل — شاهدُك على القراءة.
 */
export function parseDocument(text) {
  const raw = String(text ?? '');
  const found = [];
  const fields = {};
  const warnings = [];
  if (!raw.trim()) return { kind: null, fields, found, warnings };

  const { t, map, src } = prepMapped(raw);
  const lines = t.split('\n').map((l) => l.trim()).filter(Boolean);
  // سطورٌ خام بإزاء المطبَّعة: `prep` لا يمسّ `\n`، فترتيبُ السطور واحد.
  const rawLines = src.split('\n').map((l) => l.trim());

  /** يقتطع من **الأصل** ما يقابل مدى المطابقة في المطبَّع — فيُخزَّن كما كُتب. */
  const rawSlice = (start, end) => {
    if (start == null || end == null || end <= start) return '';
    const a = map[start];
    const b = map[Math.min(end, map.length) - 1];
    return a == null || b == null ? '' : src.slice(a, b + 1);
  };
  /** قيمةُ المجموعة الأولى كما كُتبت في الأصل (تحتاج راية `d`). */
  const rawGroup = (m, i = 1) => {
    const span = m?.indices?.[i];
    return span ? rawSlice(span[0], span[1]) : '';
  };

  /** يجد السطر الذي وقعت فيه المطابقة — ليُعرض شاهدًا (من الأصل، لا من المطبَّع). */
  const lineOf = (needle) => {
    const i = lines.findIndex((l) => l.includes(prep(needle)));
    if (i < 0) return '';
    const rawLine = rawLines.filter(Boolean)[i];
    return rawLine || lines[i];
  };

  /**
   * **سطورُ الحدود تُحجب عن حقول المخطط والقطعة والبلك.** «الشمال: قطعة رقم ٤٨» رقمُ
   * قطعةِ **الجار** لا قطعتِك، وكان يُخزَّن `plotNumber` بلا سطرٍ صريحٍ يذكره — وهذا
   * تخمينٌ تنفيه الصفحةُ عن نفسها.
   */
  const SIDE_ANY = SIDES.flat().join('|');
  const boundLine = new RegExp(`^(?:و)?(?:${SIDE_ANY})\\s*[:：]|(?:${SIDE_ANY})[\\s\\S]*?(?:${SIDE_ANY})`);
  const tNoBounds = t.split('\n').map((l) => (boundLine.test(l.trim()) ? '' : l)).join('\n');
  const add = (key, label, value, display, snippet) => {
    if (value == null || value === '') return;
    fields[key] = value;
    found.push({ key, label, value, text: display ?? String(value), snippet: snippet || '' });
  };

  /* رقم الصك */
  const deed = /(?:رقم\s*)?(?:الصك|صك|الوثيقه|وثيقه)\s*(?:رقم)?\s*[:：]?\s*([\d/\-]{6,25})/.exec(t);
  if (deed) add('deedNumber', 'رقم الصك', deed[1].replace(/[^\d/-]/g, ''), null, lineOf(deed[1]));

  /* تاريخ الصك — هجريّ غالبًا، ويُحفظ نصًّا كما كُتب لا يُحوَّل */
  // «تاريخ **الصك**: ١٤٤٥/٠٦/١٢ هـ» هي صيغةُ الصكّ الإلكترونيّ، وكانت لا تُقرأ لأمرين:
  // كلمةٌ بين «تاريخ» والنقطتين، وسنةٌ من أربعة أرقام **أوّلًا** لا آخرًا. والنقطةُ فاصلًا كذلك.
  const deedDate = new RegExp(`(?:تاريخ|بتاريخ)(?:${H}*(?:الصك|صك|الوثيقه|وثيقه|الاصدار|اصداره|الصدور|ه))?${H}*[:：]?${H}*(\\d{1,4}${H}*[/\\-.]${H}*\\d{1,2}${H}*[/\\-.]${H}*\\d{1,4})${H}*(هـ|ه|م)?`).exec(t);
  if (deedDate) {
    const hijri = /هـ|ه/.test(deedDate[2] || '');
    add('deedDate', 'تاريخ الصك', deedDate[1].replace(/\s/g, ''),
      `${deedDate[1].replace(/\s/g, '')}${hijri ? ' هـ' : deedDate[2] ? ' م' : ''}`, lineOf(deedDate[1]));
    if (!deedDate[2]) warnings.push('تاريخ الصك بلا «هـ» أو «م» — تأكّد أهو هجريّ أم ميلاديّ');
  }

  /* المالك */
  const owner = new RegExp(`(?:اسم${H}*)?(?:المالك|مالك العقار|الملاك|باسم)${H}*[:：]?${H}*([؀-ۿ]{2,}(?:${H}+[؀-ۿ]{2,}){0,9})`, 'd').exec(t);
  if (owner) {
    const name = takeName(rawGroup(owner) || owner[1]);
    add('ownerName', 'اسم المالك', name.text, null, lineOf(owner[1].trim().split(/\s+/)[0]));
    if (name.truncated && name.text) warnings.push('اسم المالك قد يكون أطولَ ممّا قُرئ — قابِلْه بالصكّ قبل أن يدخل عقدًا');
  }

  /* رقم الهوية — عشرة أرقام تبدأ بـ١ أو ٢ */
  const nid = /(?:رقم\s*)?(?:الهويه|هويه رقم|السجل المدني|الاقامه)\s*[:：]?\s*([12]\d{9})/.exec(t)
    || /\b([12]\d{9})\b/.exec(t);
  if (nid) add('nationalId', 'رقم الهوية', nid[1], null, lineOf(nid[1]));

  /* المساحة */
  const areaM = rx(String.raw`(?:المساحه|مساحه|مساحتها)\s*(?:الاجماليه|الكليه)?\s*[:：]?\s*(NUM)`).exec(t)
    || rx(String.raw`(NUM)\s*(?:م2|متر مربع|مترمربع)`).exec(t);
  if (areaM) {
    const v = toNumber(areaM[1]);
    if (v != null && v >= 20 && v <= 1e7) add('area', 'المساحة', v, `${v.toLocaleString('en-US')} م²`, lineOf(areaM[1]));
  }

  /* المخطط والقطعة والبلك */
  const plan = new RegExp(`(?:رقم${H}*)?(?:المخطط|مخطط)${H}*(?:رقم)?${H}*[:：]?${H}*(${TOKEN}{1,20})`).exec(tNoBounds);
  if (plan) add('planNumber', 'رقم المخطط', plan[1], null, lineOf(plan[1]));
  const plot = new RegExp(`(?:رقم${H}*)?(?:القطعه|قطعه ارض رقم|قطعه رقم)${H}*[:：]?${H}*(${TOKEN}{1,20})`).exec(tNoBounds);
  if (plot) add('plotNumber', 'رقم القطعة', plot[1], null, lineOf(plot[1]));
  const block = new RegExp(`(?:البلك|بلك)${H}*(?:رقم)?${H}*[:：]?${H}*(${TOKEN}{1,10})`).exec(tNoBounds);
  if (block) add('blockNumber', 'رقم البلك', block[1], null, lineOf(block[1]));

  /* الحي والمدينة */
  const district = new RegExp(`(?:الحي|حي)${H}*[:：]?${H}*([؀-ۿ]{3,}(?:${H}+[؀-ۿ]{2,})?)`, 'd').exec(t);
  if (district) add('district', 'الحي', takeWords(rawGroup(district) || district[1], 2), null, lineOf(takeWords(district[1], 2)));
  const city = new RegExp(`(?:المدينه|مدينه|بمدينه)${H}*[:：]?${H}*([؀-ۿ]{3,})`, 'd').exec(t);
  if (city) add('city', 'المدينة', takeWords(rawGroup(city) || city[1], 1), null, lineOf(takeWords(city[1], 1)));

  /* الحدود والأطوال */
  const bounds = [];
  for (const [side, alt] of SIDES) {
    const re = new RegExp(`(?:${side}|${alt})\\s*[:：]?\\s*([^\\n]{2,60}?)(?=\\s*(?:${SIDES.flat().join('|')})\\s*[:：]|$|\\n)`, 'd');
    const m = re.exec(t);
    if (!m) continue;
    // من الأصل لا من المطبَّع: «قطعة رقم ٤٨» تبقى كما كُتبت، لا «قطعه رقم 48».
    const value = (rawGroup(m) || m[1]).replace(/[،؛.]+$/, '').trim();
    if (!value || value.length < 2) continue;
    bounds.push({ side, label: SIDE_LABEL[side], value });
    add(`bound_${side}`, SIDE_LABEL[side], value, null, lineOf(value.slice(0, 20)));
  }
  if (bounds.length) fields.bounds = bounds;

  const kind = guessKind(raw);
  if (!found.length) warnings.push('لم يُقرأ حقلٌ معروف من النص — راجعه، أو انسخ منه ما تحتاج يدويًّا');
  if (kind?.key === 'deed' && !fields.deedNumber) warnings.push('يبدو صكًّا ولم يُقرأ رقمُه — اكتبه بنفسك قبل الاعتماد');
  return { kind, fields, found, warnings };
}

/** حقولُ عقارٍ من مستندٍ مفرَّغ — تُملأ منها استمارة العقار. */
export function toPropertyFields(parsed, { city = '' } = {}) {
  const f = parsed?.fields || {};
  const typeFields = {};
  if (f.planNumber) typeFields.planNumber = f.planNumber;
  if (f.plotNumber) typeFields.plotNumber = f.plotNumber;
  return {
    city: f.city || city || '',
    district: f.district || '',
    area: f.area ?? null,
    deedNumber: f.deedNumber || '',
    typeFields,
  };
}
