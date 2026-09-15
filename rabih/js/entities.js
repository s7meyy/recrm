// استخراج الكيانات — القاموس يقول «جودة المنتج: ٦ مرات»، ولا يقول أي منتج.
// وصاحب المحل لا ينفعه «الطعم جيد»، بل «اللاتيه ذُكر ٧ مرات إيجابًا، والكيك ٣ سلبًا».
// كل هذا من تكرار العبارات في النصوص نفسها، بلا نموذج ولا معجم خارجي.

import { normalizeAr, sentimentOf, TOPICS, allKeywords } from './lexicon.js';

// كلمات وظيفية عربية لا تصلح كيانًا بحال.
const STOP = new Set(`
من الى على في عن مع عند بعد قبل تحت فوق بين هذا هذه ذلك تلك هناك هنا
انا انت هو هي نحن هم كان كانت يكون تكون ما لا لم لن قد لقد الا اذا
كل بعض جدا مره مرة جدًا واجد كثير قليل شي شيء الي التي الذي
لكن بس او و ثم حتى اي ايضا فقط سوف راح بدون بلا غير سوى
عندهم عندي لهم لنا لك له لها يوجد فيه فيها ماكو اكو
شكرا الله يعطيهم العافيه ان انه انها لان لانه حيث بحيث
يعني تقريبا دايما احيانا ابدا نهائيا بصراحه صراحه والله
مكان محل مطعم مقهى كوفي فرع زيارة تجربه تجربة مره اخرى
افضل احسن اسوا اكثر اقل اروع اجمل ازكى الاحسن الافضل
اوصي انصح جربت طلبت اخذت شربت اكلت تذوقت طلبنا جربنا اخذنا
يستاهل تستاهل عجبني عجبتني حبيت ودي ابغى ابي تحس تلاقي
موجود متوفر متوفره ينفع يصير صار صارت راح رحت رحنا زرت زرنا
`.trim().split(/\s+/));

// كلمات القاموس كلها مستبعدة: هي مواضيع لا كيانات.
// وتُقرأ عند كل استخراج لا عند التحميل، كي تدخل فيها إضافات المستخدم:
// كلمةٌ يضيفها للقاموس كانت تبقى كيانًا أيضًا، فتُعدّ مرتين بوجهين.
let TOPIC_WORDS = new Set();

// سوابق أسماء الأشخاص في التعليقات العربية: «الموظف فهد»، «الاستاذ سعد»، «الكابتن».
// تُقارَن بعد تجريد السوابق، فلا حاجة لأداة التعريف هنا.
const NAME_CUES = ['موظف', 'موظفه', 'استاذ', 'استاذه', 'مهندس', 'دكتور', 'دكتوره', 'كابتن',
  'شيف', 'باريستا', 'مدير', 'مديره', 'اخ', 'اخت', 'كاشير', 'نادل', 'مشرف', 'اسمه', 'اسمها'];

// سوابق تدلّ على منتج: «طلبت»، «جربت»، «أخذت».
const PRODUCT_CUES = ['طلبت', 'طلبنا', 'جربت', 'جربنا', 'اخذت', 'اخذنا', 'تذوقت', 'شربت', 'اكلت', 'اوصي', 'انصح'];
// الكلمة الدالّة نفسها ليست كيانًا، فهي في STOP أعلاه.

// سوابق عربية تُخفي الكلمة عن المطابقة: «والموظف»، «بالقهوة»، «اللاتيه».
const PREFIXES = ['وبال', 'فبال', 'وال', 'فال', 'بال', 'كال', 'لل', 'ال', 'و', 'ف', 'ب', 'ك', 'ل'];

function stripPrefix(token) {
  for (const p of PREFIXES) {
    if (token.length >= p.length + 3 && token.startsWith(p)) return token.slice(p.length);
  }
  return token;
}

const tokenize = (text) => normalizeAr(text).split(' ').filter(Boolean).map(stripPrefix);

const usable = (w) => w.length >= 3 && !STOP.has(w) && !TOPIC_WORDS.has(w) && !/^\d+$/.test(w);

/** يُنعش قائمة الاستبعاد من القاموس الحيّ. يُستدعى في مطلع كل استخراج. */
function refreshTopicWords() {
  TOPIC_WORDS = allKeywords();
}

/** يبني عبارات من كلمة وكلمتين، ويستبعد الوظيفي والموضوعي. */
function phrases(tokens) {
  const out = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const w = tokens[i];
    if (usable(w)) out.push(w);
    const next = tokens[i + 1];
    if (next && usable(w) && usable(next)) out.push(`${w} ${next}`);
  }
  return out;
}

/** يلتقط اسمًا بعد سابقة دالّة: «الموظف فهد» → فهد. */
function namedPeople(tokens) {
  const found = [];
  for (let i = 0; i < tokens.length - 1; i += 1) {
    if (!NAME_CUES.includes(tokens[i])) continue;
    const cand = tokens[i + 1];
    if (cand && cand.length >= 3 && !STOP.has(cand) && !TOPIC_WORDS.has(cand)) found.push(cand);
  }
  return found;
}

function cuedProducts(tokens) {
  const found = [];
  for (let i = 0; i < tokens.length - 1; i += 1) {
    if (!PRODUCT_CUES.includes(tokens[i])) continue;
    const one = tokens[i + 1];
    const two = tokens[i + 2];
    if (one && usable(one)) {
      found.push(two && usable(two) ? `${one} ${two}` : one);
    }
  }
  return found;
}

/**
 * يستخرج الكيانات المتكررة مع اتجاهها.
 * @param {object} place
 * @param {{minCount?:number, limit?:number}} opts
 * @returns {{people:Array, products:Array}}
 */
export function extract(place, { minCount = 2, limit = 12 } = {}) {
  refreshTopicWords();
  const reviews = place?.reviews || [];
  const people = new Map();
  const products = new Map();

  const bump = (map, key, review, kind) => {
    if (!key) return;
    const row = map.get(key) || { name: key, total: 0, pos: 0, neg: 0, neu: 0, ids: [], kind };
    if (row.ids.includes(review.id)) return;      // لا يُحسب التعليق مرتين للكيان نفسه
    row.total += 1;
    row.ids.push(review.id);
    row[sentimentOf(review)] += 1;
    map.set(key, row);
  };

  for (const r of reviews) {
    const tokens = tokenize(r.text);
    if (!tokens.length) continue;

    for (const n of namedPeople(tokens)) bump(people, n, r, 'person');
    for (const p of cuedProducts(tokens)) bump(products, p, r, 'product');
    // العبارات المتكررة عمومًا: مرشّحة للمنتجات والأصناف.
    for (const p of new Set(phrases(tokens))) bump(products, p, r, 'phrase');
  }

  const shape = (map) => [...map.values()]
    .filter((e) => e.total >= minCount)
    .map((e) => ({ ...e, verdict: e.neg > e.pos ? 'سلبي' : (e.pos > e.neg ? 'إيجابي' : 'مختلط') }))
    .sort((a, b) => b.total - a.total || b.neg - a.neg);

  // العبارة المركّبة تبتلع مفردتها: «قهوة مختصه» تُغني عن «مختصه».
  const prods = shape(products);
  const compound = prods.filter((p) => p.name.includes(' '));
  const filtered = prods.filter((p) => {
    if (p.name.includes(' ')) return true;
    return !compound.some((c) => c.name.split(' ').includes(p.name) && c.total >= p.total);
  });

  // من عُرف شخصًا لا يُعاد عدّه صنفًا.
  const peopleOut = shape(people).slice(0, limit);
  const names = new Set(peopleOut.map((p) => p.name));

  return {
    people: peopleOut,
    products: filtered.filter((p) => !p.name.split(' ').some((w) => names.has(w))).slice(0, limit),
  };
}

/** كتلة تُضاف إلى رسائل النماذج — كيانات محسوبة لا مُقدَّرة. */
export function entitiesBlock(place) {
  const { people, products } = extract(place);
  if (!people.length && !products.length) return '';
  const L = ['\n## الكيانات المتكررة (مرصودة آليًّا من نصوص التعليقات)'];
  if (products.length) {
    L.push('| الصنف أو العبارة | مرات | إيجابي | سلبي | المعرّفات |');
    L.push('|---|---|---|---|---|');
    for (const p of products) L.push(`| ${p.name} | ${p.total} | ${p.pos} | ${p.neg} | ${p.ids.join('، ')} |`);
  }
  if (people.length) {
    L.push('\n### أشخاص ذُكروا بالاسم');
    for (const p of people) L.push(`- ${p.name}: ${p.total} مرات (${p.verdict}) — ${p.ids.join('، ')}`);
  }
  L.push('\nهذه عبارات خامّ من التعليقات؛ اذكر منها ما يفيد صاحب المنشأة ولا تُفسّر ما لا يُفهم.');
  return L.join('\n');
}
