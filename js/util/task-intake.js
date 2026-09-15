// إدخال دفعة مهام وتوزيعها (المرحلة ٤٠).
//
// تكتب مهامك سطرًا سطرًا كما تخطر لك، فتُوزَّع على قوائمك بحسب موضوعها، ويُقرأ من كل سطرٍ
// موعدُه وأولويّتُه. **ثم لا يُحفظ شيء حتى تراجع الاقتراح وتعتمده** — وهذا شرطُ المستخدم،
// وهو الصواب: توزيعٌ آليٌّ يُحفظ بلا نظرةٍ يخلط مهامك بدل أن يرتّبها.
//
// **وما هذا وما ليس هو:** مطابقةُ كلماتٍ تجري في جهازك، لا نموذجًا لغويًّا يفهم ما تقصد.
// وترتيبُها مقصود:
//   ١) اسمُ قائمةٍ عندك ذُكر في السطر — أنت سمّيتها، فذكرُها أصدقُ دليل.
//   ٢) كلماتُ القائمة نفسها (كلمةٌ من اسمها طولها ثلاثة أحرف فأكثر).
//   ٣) موضوعاتٌ مدمجة: اتصال، معاينة، عقود وتراخيص، مالية، تسويق، متابعة.
//   ٤) وإلّا فالقائمة الأولى — ويُقال إنّه لم يُعرف موضوعُه، فلا يُدَّعى فهمٌ لم يقع.
//
// دوال خالصة: لا تخزين ولا شبكة.

import { normalizeArabic } from './arabic.js';

const norm = (s) => normalizeArabic(s);
const DAY = 86400000;

/**
 * **`\b` في جافاسكربت حدُّ كلمةٍ لاتينيّ**: يُعرَّف بـ`\w` وهي `[A-Za-z0-9_]` وحدها.
 * فـ`/\bبكره\b/` لا تطابق «بكره» أبدًا — لا لأنّ الكلمة غائبة، بل لأنّ الحدّ لا يقع
 * بين حرفين عربيَّين. وهذا خطأٌ **صامت**: التعبير صحيحُ الصياغة ولا يطابق شيئًا.
 * فالحدّ هنا يُكتب صراحةً: بدايةُ النصّ أو فراغٌ أو علامةُ ترقيم.
 */
// والأرقامُ كذلك: `\\d` لاتينيّةٌ وحدها، والسطرُ يُكتب بالعربية «الساعة ٤» — فالقصّ
// الذي لا يعرفها يترك «الساعة ٤» في عنوان المهمة.
const D = '[\\d\\u0660-\\u0669\\u06F0-\\u06F9]';
const B = '(?:^|[\\s،؛.,:!؟\\-])';
const E = '(?:$|[\\s،؛.,:!؟\\-])';
const word = (w, flags = '') => new RegExp(`${B}${w}${E}`, flags);

/** موضوعاتٌ مدمجة تُستعمل حين لا يدلّ اسمُ قائمةٍ على السطر. */
export const TOPICS = [
  { key: 'calls', label: 'اتصالات', words: ['اتصل', 'اتصال', 'كلم', 'مكالمه', 'رد على', 'اسال'], listWords: ['اتصال', 'مكالمات', 'تواصل'] },
  { key: 'showings', label: 'معاينات', words: ['معاينه', 'اعرض', 'عرض العقار', 'زياره', 'زيارة', 'جوله', 'موعد مع'], listWords: ['معاينات', 'جولات', 'مواعيد'] },
  { key: 'papers', label: 'عقود وتراخيص', words: ['عقد', 'اتفاقيه', 'ترخيص', 'رخصه', 'صك', 'توثيق', 'ايجار الكتروني', 'فال'], listWords: ['عقود', 'تراخيص', 'اوراق', 'توثيق'] },
  { key: 'money', label: 'مالية', words: ['فاتوره', 'عموله', 'حوّل', 'حول', 'دفعه', 'سداد', 'تحصيل', 'مصروف', 'ايراد'], listWords: ['ماليه', 'فواتير', 'محاسبه'] },
  { key: 'marketing', label: 'تسويق', words: ['اعلان', 'انشر', 'نشر', 'تصوير', 'صور', 'تسويق', 'ختم', 'سوشال'], listWords: ['تسويق', 'اعلانات', 'نشر'] },
  { key: 'followup', label: 'متابعات', words: ['تابع', 'متابعه', 'ذكّر', 'ذكر', 'راجع'], listWords: ['متابعه', 'متابعات'] },
];

/* ===== قراءة الموعد من السطر ===== */

const WEEKDAYS = [
  ['الاحد', 0], ['الاثنين', 1], ['الثلاثاء', 2], ['الاربعاء', 3], ['الخميس', 4], ['الجمعه', 5], ['السبت', 6],
];

/** ينقل التاريخ إلى الساعة المطلوبة (٩ صباحًا افتراضًا) — موعدٌ بلا وقتٍ ينبّه فجرًا. */
function atHour(d, hour = 9, minute = 0) {
  const x = new Date(d);
  x.setHours(hour, minute, 0, 0);
  return x;
}

/**
 * يقرأ موعدًا من نصٍّ حرّ: «اليوم»، «بكرة»، «بعد بكرة»، «الأحد»، «بعد ٣ أيام»،
 * «الساعة ٤»، «٥م». ويعيد { dueAt, rest } — و`rest` السطرُ بلا كلمات الموعد، فلا يبقى
 * عنوانُ المهمة «اتصل على سعد بكرة الساعة ٤».
 */
export function readDue(line, now = Date.now()) {
  let rest = String(line ?? '');
  let day = null;
  const base = new Date(now);

  const n = norm(rest);
  if (word('اليوم').test(n)) { day = new Date(base); rest = stripWord(rest, 'اليوم'); }
  else if (/بعد\s+(بكره|بكرة|غد)/.test(n)) { day = new Date(base.getTime() + 2 * DAY); rest = stripPattern(rest, /بعد\s+(بكرة|بكره|غدٍ|غد)/); }
  else if (word('(بكره|غدا|غد)').test(n)) { day = new Date(base.getTime() + DAY); rest = stripPattern(rest, /(بكرة|بكره|غدًا|غدا|غد)/); }
  else {
    const after = /بعد\s+(\d+)\s*(يوم|ايام|اسبوع|اسابيع)/.exec(n); // `n` مطبَّعٌ فأرقامُه لاتينية
    if (after) {
      const count = Number(after[1]);
      const mult = after[2].startsWith('اسبوع') || after[2].startsWith('اسابيع') ? 7 : 1;
      day = new Date(base.getTime() + count * mult * DAY);
      rest = stripPattern(rest, new RegExp(`بعد\\s+${D}+\\s*\\S+`));
    } else {
      for (const [dayName, idx] of WEEKDAYS) {
        if (!word(dayName).test(n)) continue;
        const d = new Date(base);
        const diff = (idx - d.getDay() + 7) % 7 || 7; // «الأحد» يعني القادم لا اليوم
        day = new Date(d.getTime() + diff * DAY);
        rest = stripPattern(rest, new RegExp(`(يوم\\s+)?${dayName}`));
        break;
      }
    }
  }

  let hour = 9;
  let minute = 0;
  const timeM = /(?:الساعه|الساعة)?\s*(\d{1,2})(?::(\d{2}))?\s*(ص|صباحا|م|مساء|مساءً)?/.exec(norm(rest));
  const explicitTime = (word('(ص|م|مساء|صباحا)').test(norm(rest)) || /الساعه|الساعة/.test(norm(rest))) && timeM;
  if (explicitTime) {
    let h = Number(timeM[1]);
    const pm = /م|مساء/.test(timeM[3] || '');
    if (pm && h < 12) h += 12;
    if (!pm && /ص|صباحا/.test(timeM[3] || '') && h === 12) h = 0;
    // رقمٌ بلا «ص/م» بين ١ و٧ يُفهم مساءً: لا أحد يواعد الرابعة فجرًا.
    if (!timeM[3] && h >= 1 && h <= 7) h += 12;
    if (h >= 0 && h <= 23) { hour = h; minute = Number(timeM[2] || 0) || 0; }
    rest = stripPattern(rest, new RegExp(`(الساعة|الساعه)?\\s*${D}{1,2}(:${D}{2})?\\s*(ص|صباحًا|صباحا|م|مساءً|مساء)?`));
    if (!day) day = new Date(base); // وقتٌ بلا يوم = اليوم
  }

  if (!day) return { dueAt: null, rest: tidy(rest) };
  return { dueAt: atHour(day, hour, minute).toISOString(), rest: tidy(rest) };
}

function stripWord(text, ...words) {
  let out = text;
  for (const w of words) out = out.split(w).join(' ');
  return out;
}
function stripPattern(text, re) {
  return text.replace(new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`), ' ');
}
const tidy = (s) => String(s).replace(/\s+/g, ' ').replace(/^[\s،:\-–—]+|[\s،:\-–—]+$/g, '').trim();

/* ===== قراءة الأولوية ===== */

/** «!!» أو «عاجل» = عاجل · «!» أو «مهم» = مرتفعة · «لاحقًا» = منخفضة. */
export function readPriority(line) {
  const raw = String(line ?? '');
  const n = norm(raw);
  if (/!{2,}/.test(raw) || word('(عاجل|ضروري|مستعجل)').test(n)) {
    return { priority: 'urgent', rest: tidy(stripPattern(raw, /!{1,}/).replace(/عاجل|ضروري|مستعجل/g, ' ')) };
  }
  if (/!/.test(raw) || word('مهم').test(n)) {
    return { priority: 'high', rest: tidy(stripPattern(raw, /!{1,}/).replace(/مهم/g, ' ')) };
  }
  if (word('لاحقا').test(n) || /وقت فاضي|متى ما تقدر/.test(n)) {
    return { priority: 'low', rest: tidy(raw.replace(/لاحقًا|لاحقا/g, ' ')) };
  }
  return { priority: 'normal', rest: tidy(raw) };
}

/* ===== اختيار القائمة ===== */

/**
 * @returns {{ listId, why }} `why` سببُ الاختيار بالعربية — يُعرض للمستخدم ليراجعه،
 *          فتوزيعٌ لا يُعرف سببُه لا يُراجَع وإنما يُقبل على عماه.
 */
export function pickList(text, lists = []) {
  if (!lists.length) return { listId: null, why: '' };
  const n = norm(text);

  // ١) اسمُ قائمةٍ كاملًا في السطر — أصدقُ دليل، والأطولُ أولى عند التزاحم
  const named = lists
    .filter((l) => norm(l.title).length >= 3 && n.includes(norm(l.title)))
    .sort((a, b) => norm(b.title).length - norm(a.title).length)[0];
  if (named) return { listId: named.id, why: `ذُكر اسم «${named.title}»` };

  // ٢) كلمةٌ من اسم القائمة
  for (const l of lists) {
    for (const w of norm(l.title).split(/\s+/)) {
      if (w.length >= 3 && new RegExp(`${B}${w}`).test(n)) return { listId: l.id, why: `يوافق «${l.title}»` };
    }
  }

  // ٣) موضوعٌ مدمج، إن كان لك قائمةٌ تُشبهه
  for (const topic of TOPICS) {
    if (!topic.words.some((w) => n.includes(norm(w)))) continue;
    const match = lists.find((l) => topic.listWords.some((lw) => norm(l.title).includes(norm(lw))));
    if (match) return { listId: match.id, why: `موضوعه ${topic.label}` };
  }

  // ٤) لم يُعرف — ويُقال
  return { listId: lists[0].id, why: 'لم يُعرف موضوعه — راجعه' };
}

/**
 * يقرأ نصًّا متعدّد الأسطر ويقترح لكل سطرٍ مهمّةً موزَّعة.
 * **اقتراحٌ يُراجَع**: لا يُكتب شيءٌ في قاعدة البيانات من هنا.
 */
export function proposeTasks(text, lists = [], { now = Date.now() } = {}) {
  const lines = String(text ?? '')
    .split('\n')
    .map((l) => l.replace(/^\s*[-*••\d]+[.)\s]*/, '').trim()) // شُرَط القوائم وأرقامها ليست من العنوان
    .filter(Boolean);

  const seen = new Set();
  const out = [];
  for (const line of lines) {
    const pr = readPriority(line);
    const due = readDue(pr.rest, now);
    const title = due.rest || pr.rest || line;
    const key = norm(title);
    // سطرٌ مكرَّر في اللصقة نفسها لا يصير مهمّتين
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const { listId, why } = pickList(line, lists);
    // `source` السطرُ كما قُرئ (بلا شُرَط القوائم وأرقامها، فهي ليست من كلامك) — يُعرض
    // بجانب الاقتراح لترى **ممّا** قُرئ الموعدُ والأولوية، فتصحّح ما أُسيء فهمه.
    out.push({ title, listId, why, priority: pr.priority, dueAt: due.dueAt, source: line });
  }
  return out;
}
