// كاشف التعليقات المشبوهة — لا يتّهم، بل يرفع إشارات ليقرّر صاحب التقرير.
// الغرض: ألّا يُبنى تحليل على حملة تقييمات مفتعلة (مدحًا كانت أو ذمًّا).

import { normalizeAr } from './lexicon.js';
import { normalizeDigits } from './parse.js';

/** تشابه جاكار على مستوى الكلمات — كافٍ لكشف النسخ واللصق وإعادة الصياغة السطحية. */
export function similarity(a, b) {
  const A = new Set(normalizeAr(a).split(' ').filter((w) => w.length > 2));
  const B = new Set(normalizeAr(b).split(' ').filter((w) => w.length > 2));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter += 1;
  return inter / (A.size + B.size - inter);
}

/** تحويل تاريخ نسبي («قبل شهرين») إلى عدد أيام تقريبي، أو null. */
export function relativeDays(dateText) {
  const t = normalizeAr(normalizeDigits(dateText));
  if (!t) return null;
  const units = [
    { re: /(?:يوم|ايام)/, days: 1 }, { re: /(?:اسبوع|اسابيع)/, days: 7 },
    { re: /(?:شهر|اشهر|شهور)/, days: 30 }, { re: /(?:سنه|سنوات|عام|اعوام)/, days: 365 },
    { re: /(?:ساعه|ساعات|دقيقه|دقائق)/, days: 0 },
  ];
  const unit = units.find((u) => u.re.test(t));
  if (!unit) return null;
  const num = t.match(/(\d+)/);
  if (num) return parseInt(num[1], 10) * unit.days;
  if (/(?:ين|تين)\b/.test(t) || /(?:شهرين|اسبوعين|يومين|سنتين|عامين)/.test(t)) return unit.days * 2;
  return unit.days;
}

const FLAGS = {
  noText:      { label: 'تقييم بلا نص',              weight: 1, note: 'نجوم بلا كلمة واحدة — لا يحمل معلومة، وكثرتها تشوّه المتوسط.' },
  veryShort:   { label: 'نص شديد القِصَر',           weight: 1, note: 'كلمة أو كلمتان لا تكفيان لحكم.' },
  duplicate:   { label: 'نصّ شبه مكرر',              weight: 3, note: 'يتشابه مع تعليق آخر تشابهًا يفوق 70٪.' },
  extremeOnly: { label: 'تطرّف في نفس اليوم',        weight: 2, note: 'عدة تعليقات متطرفة (5 أو 1) في مدى زمني ضيّق.' },
  noName:      { label: 'بلا اسم كاتب',              weight: 1, note: 'قد يكون نقص لصق لا تزويرًا.' },
  genericPraise:{ label: 'مدح عام بلا تفصيل',        weight: 2, note: 'ثناء مطلق لا يذكر منتجًا ولا خدمة ولا موقفًا.' },
};

const GENERIC = ['ممتاز', 'رائع', 'جميل', 'حلو', 'افضل مكان', 'انصح به', 'خدمه ممتازه', 'تمام', 'شكرا', 'الله يعطيهم العافيه'];

/**
 * يفحص تعليقات المنشأة ويُرجع الإشارات.
 * @returns {{flagged:Array<{id:string,flags:string[],score:number,reasons:string[]}>,
 *            clusters:Array<{ids:string[],sample:string}>, summary:string, level:'ok'|'warn'|'err', ratio:number}}
 */
export function scan(place) {
  const reviews = place?.reviews || [];
  const byId = new Map(reviews.map((r) => [r.id, { id: r.id, flags: [], score: 0, reasons: [] }]));

  const add = (id, key) => {
    const row = byId.get(id);
    if (!row || row.flags.includes(key)) return;
    row.flags.push(key);
    row.score += FLAGS[key].weight;
    row.reasons.push(`${FLAGS[key].label}: ${FLAGS[key].note}`);
  };

  for (const r of reviews) {
    const text = (r.text || '').trim();
    const words = normalizeAr(text).split(' ').filter(Boolean);

    if (!text) add(r.id, 'noText');
    else if (words.length <= 2) add(r.id, 'veryShort');
    if (!(r.author || '').trim()) add(r.id, 'noName');

    if (text && Number(r.rating) === 5 && words.length <= 6) {
      const n = normalizeAr(text);
      if (GENERIC.some((g) => n.includes(normalizeAr(g)))) add(r.id, 'genericPraise');
    }
  }

  // التشابه: مقارنة ثنائية على التعليقات ذات النصّ المعتبر.
  const clusters = [];
  const withText = reviews.filter((r) => (r.text || '').trim().length > 12);
  const seen = new Set();
  for (let i = 0; i < withText.length; i += 1) {
    if (seen.has(withText[i].id)) continue;
    const group = [withText[i].id];
    for (let j = i + 1; j < withText.length; j += 1) {
      if (seen.has(withText[j].id)) continue;
      if (similarity(withText[i].text, withText[j].text) >= 0.7) {
        group.push(withText[j].id);
        seen.add(withText[j].id);
      }
    }
    if (group.length > 1) {
      group.forEach((id) => add(id, 'duplicate'));
      clusters.push({ ids: group, sample: withText[i].text.slice(0, 90) });
    }
  }

  // التكدّس الزمني: ثلاثة تعليقات متطرفة فأكثر داخل نافذة أسبوع.
  const dated = reviews
    .map((r) => ({ id: r.id, rating: Number(r.rating), days: relativeDays(r.date) }))
    .filter((r) => r.days !== null && (r.rating === 5 || r.rating === 1));
  const buckets = new Map();
  for (const r of dated) {
    const key = `${r.rating}:${Math.floor(r.days / 7)}`;
    buckets.set(key, [...(buckets.get(key) || []), r.id]);
  }
  for (const ids of buckets.values()) {
    if (ids.length >= 3) ids.forEach((id) => add(id, 'extremeOnly'));
  }

  const flagged = [...byId.values()].filter((r) => r.flags.length).sort((a, b) => b.score - a.score);
  const ratio = reviews.length ? Number(((flagged.length / reviews.length) * 100).toFixed(1)) : 0;
  const serious = flagged.filter((r) => r.score >= 3).length;

  const level = serious >= 2 || ratio >= 40 ? 'err' : (flagged.length ? 'warn' : 'ok');
  const summary = !flagged.length
    ? 'لا إشارات مريبة في العيّنة.'
    : `${flagged.length} من ${reviews.length} تعليقًا تحمل إشارة (${ratio}%)` +
      (clusters.length ? `، منها ${clusters.length} مجموعة نصوص متشابهة` : '') +
      (serious ? `، و${serious} تستحق النظر قبل اعتمادها` : '') + '.';

  return { flagged, clusters, summary, level, ratio };
}

/** يستبعد التعليقات المُعلَّمة بدرجة خطورة معيّنة فأعلى — بقرار المستخدم لا تلقائيًّا. */
export function withoutFlagged(place, minScore = 3) {
  const { flagged } = scan(place);
  const drop = new Set(flagged.filter((f) => f.score >= minScore).map((f) => f.id));
  return { ...place, reviews: (place.reviews || []).filter((r) => !drop.has(r.id)) };
}

export { FLAGS };
