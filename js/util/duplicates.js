// كشف العملاء المكرّرين (المرحلة ٢٦).
//
// التكرار يدخل من أبواب مشروعة كلها: العميل نفسه يتصل مرّتين، ويصل من الصفحة العامة ومن
// استمارة الـQR، وتلصق رسالته مرّة وتسجّله يدويًا مرّة. والنتيجة سجلّان لشخصٍ واحد، فتاريخه
// مقطوع ومطابقاته مكرّرة و«لم يُتواصل معه» يكذب عليك.
//
// دوال خالصة: تكشف ولا تدمج — الدمج قرارٌ يُتخذ في الشاشة بعد معاينة ما سينتقل.

import { normalizeArabic } from './arabic.js';
import { normalizePhone } from './phone.js';

/** درجات اليقين: الجوال حكمٌ قاطع، والاسم وحده ظنٌّ يحتاج نظرك. */
export const CERTAINTY = {
  phone: { key: 'phone', label: 'الجوال نفسه', sure: true },
  phone2: { key: 'phone2', label: 'جوال أحدهما هو جوال الآخر الثاني', sure: true },
  name: { key: 'name', label: 'الاسم نفسه', sure: false },
};

const nameKey = (client) => {
  const words = normalizeArabic(String(client?.name || '')).split(/\s+/).filter(Boolean);
  // اسمٌ من كلمة واحدة («محمد») ليس دليلًا على شيء — يُستبعد من مطابقة الأسماء.
  if (words.length < 2) return '';
  // المسافات تُزال في المفتاح: «عبدالله» و«عبد الله» اسمٌ واحد يكتبه صاحبه بالطريقتين،
  // وقد يُسجَّل عندك بكلتيهما. والحروف نفسها بترتيبها هي الدليل، لا مواضع المسافات.
  return words.join('');
};

const phones = (client) => [normalizePhone(client?.phone), normalizePhone(client?.phone2)].filter(Boolean);

/**
 * أزواج مرشّحة للدمج.
 *
 * **زوجٌ لا مجموعة، ومرتَّبة باليقين:** ثلاثة سجلات لشخص واحد تظهر أزواجًا يُدمج بعضها ثم
 * يُعاد الكشف — أوضح من مجموعةٍ تُدمج دفعةً واحدة بلا أن ترى ما يحدث.
 *
 * @returns {[{ a, b, reason, sure }]}
 */
export function findDuplicates(clients = []) {
  const pairs = new Map();
  const add = (a, b, reason) => {
    if (a.id === b.id) return;
    const [x, y] = [a, b].sort((m, n) => String(m.id).localeCompare(String(n.id)));
    const key = `${x.id}|${y.id}`;
    const current = pairs.get(key);
    // الأقوى يبقى: زوجٌ اجتمع فيه الجوال والاسم يُعرض بالجوال.
    if (current && (current.sure || !CERTAINTY[reason].sure)) return;
    pairs.set(key, { a: x, b: y, reason, sure: CERTAINTY[reason].sure, label: CERTAINTY[reason].label });
  };

  const byPhone = new Map();
  const byName = new Map();
  for (const client of clients) {
    for (const phone of phones(client)) {
      const list = byPhone.get(phone) || [];
      for (const other of list) add(other, client, phone === normalizePhone(client.phone) && phone === normalizePhone(other.phone) ? 'phone' : 'phone2');
      list.push(client);
      byPhone.set(phone, list);
    }
    const name = nameKey(client);
    if (!name) continue;
    const list = byName.get(name) || [];
    for (const other of list) add(other, client, 'name');
    list.push(client);
    byName.set(name, list);
  }

  return [...pairs.values()].sort((x, y) => Number(y.sure) - Number(x.sure));
}

/**
 * أيّهما يُبقى افتراضيًا؟ الأغنى سجلًّا لا الأقدم: من له تواصل وبيانات أكثر هو الملف الحقيقي.
 * **اقتراحٌ لا حكم** — الشاشة تتيح قلبه.
 */
export function suggestKeeper(a, b) {
  const score = (c) => (c.contacts || []).length * 3
    + (c.name ? 2 : 0) + (c.phone ? 2 : 0) + (c.phone2 ? 1 : 0)
    + (c.notes ? 1 : 0) + (c.tags || []).length + (c.referralSource ? 1 : 0);
  const [sa, sb] = [score(a), score(b)];
  if (sa !== sb) return sa > sb ? a : b;
  return String(a.createdAt || '') <= String(b.createdAt || '') ? a : b; // تعادلا: الأقدم
}

/* ===== عرضٌ خارجي يطابق مخزونك (المرحلة ٣٢) ===== */

/**
 * عروض خارجية يُشتبه أنها **عقارك أنت** معلنًا في السوق.
 *
 * معناه أحد أمرين وكلاهما يستحق أن تعرفه: وسيطٌ آخر يسوّق عرضك (وربما بسعرٍ غير سعرك)،
 * أو أنك رصدتَ عرضًا خارجيًا لعقارٍ عندك أصلًا فتحسبه مرّتين في مؤشر السعر.
 *
 * **الشرط ضيّق بقصد:** المدينة والحي والنوع نفسها، والمساحة والسعر ضمن هامشٍ صغير.
 * وتوسيعه يُنتج تنبيهات كاذبة تُفقد اللوحة قيمتها — والتنبيه الكاذب أسوأ من لا تنبيه.
 */
export function externalDuplicates({ properties = [], externals = [], areaPct = 5, pricePct = 5, myPhones = [] } = {}) {
  // **من المعلن؟** (المرحلة ٤٥) التطابق وحده لا يفرّق بين حالتين علاجُهما مختلف تمامًا:
  // إمّا أنك رصدتَ عقارك مرّتين — فالعلاج حذفُ أحدهما كي لا يُحسب مرّتين في مؤشّر السعر؛
  // وإمّا أنّ **غيرك يسوّق عقارك** — والعلاج مكالمةٌ للمالك اليوم. وجوّالُ المعلن يفرّق
  // بينهما: إن كان جوّالك فهو رصدُك، وإن كان غيره فهو وسيطٌ آخر، وإن غاب فلا يُدَّعى علمٌ.
  const myNorm = new Set(myPhones.map((p) => normalizePhone(p)).filter(Boolean));
  const near = (a, b, pct) => {
    const x = Number(a);
    const y = Number(b);
    if (!Number.isFinite(x) || !Number.isFinite(y) || x <= 0 || y <= 0) return false;
    return Math.abs(x - y) / Math.max(x, y) * 100 <= pct;
  };
  const norm = (v) => normalizeArabic(String(v ?? '')).trim();
  const mine = properties.filter((p) => p.captureStatus === 'approved' && p.district && p.type);
  const out = [];

  for (const ext of externals) {
    if (ext.status !== 'active' || !ext.district || !ext.type) continue;
    for (const p of mine) {
      if (norm(p.city) !== norm(ext.city) || norm(p.district) !== norm(ext.district)) continue;
      if (p.type !== ext.type) continue;
      if (!near(p.area, ext.area, areaPct)) continue;
      // السعر قد يغيب في أحدهما: غيابه لا يمنع الشبهة، لكن اختلافه الكبير يمنعها.
      const bothPriced = Number(p.price) > 0 && Number(ext.price) > 0;
      if (bothPriced && !near(p.price, ext.price, pricePct)) continue;
      const advPhone = normalizePhone(ext.advertiserPhone);
      out.push({
        property: p,
        external: ext,
        samePrice: bothPriced && Number(p.price) === Number(ext.price),
        priceGap: bothPriced ? Number(ext.price) - Number(p.price) : null,
        // `'unknown'` حين لا جوّالَ للمعلن، أو حين لم تُسجَّل أرقامك — لا تخمين.
        advertiser: !advPhone || !myNorm.size ? 'unknown' : (myNorm.has(advPhone) ? 'me' : 'other'),
        advertiserPhone: advPhone,
      });
    }
  }
  return out;
}
