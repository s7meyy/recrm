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
 * **الطلبُ الوارد: أهو غريبٌ أم عميلُك؟** (المرحلة ٤٩)
 *
 * «يومي» كان يسحب الطلبات من صفحتك العامة ويعرضها بأسمائها وأرقامها **بلا أن يقارنها
 * بعملائك**. فالعميلُ الذي تتابعه منذ شهرين يترك رقمَه في صفحتك فيظهر عندك غريبًا
 * جديدًا — فتكلّمه من الصفر وهو يعرفك. والأداةُ التي تكشفه مكتوبةٌ هنا منذ المرحلة ٢٦،
 * ولم تكن تلمس الوارد.
 *
 * **والجوالُ وحده هو الحَكَم هنا** — لا الاسم. الوارد يكتبه زائرٌ بيده في استمارةٍ عامّة،
 * و«محمد العتيبي» يكتبه عشرة. وادّعاءُ معرفةٍ خاطئةٍ أسوأُ من لا ادّعاء: تفتح ملفًّا
 * لرجلٍ وتكلّم آخر.
 *
 * @returns {object|null} العميل المطابق، أو `null` إن كان غريبًا فعلًا.
 */
export function matchLead(lead, clients = []) {
  const phone = normalizePhone(lead?.phone);
  if (!phone) return null;
  return clients.find((c) => phones(c).includes(phone)) || null;
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


/* ===== عقارٌ مكرَّر في مخزونك أنت (المرحلة ٤٦) ===== */

const norm = (v) => normalizeArabic(String(v ?? '')).trim();
// الصكّ يُطبَّع أرقامًا لا غير: «١٢٣/أ» و«123 / أ» صكٌّ واحد بخطَّين.
const deedKey = (v) => norm(v).replace(/[^0-9\u0600-\u06FF]+/g, '');

/** مسافةٌ تقريبية بالأمتار بين نقطتين — تكفي للتمييز بين «هذا هو» و«جارُه». */
function metersBetween(a, b) {
  if (!a || !b || !Number.isFinite(a.lat) || !Number.isFinite(b.lat)) return null;
  const R = 6371000;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** كم مترًا بين نقطتين يُعدّ «الموقع نفسه». عشرون: دقّةُ GPS في الجوّال بهذا القدر. */
export const SAME_SPOT_METERS = 20;

/**
 * عقاران في **مخزونك أنت** يُشتبه أنهما عقارٌ واحد دخل مرّتين.
 *
 * **ولم يكن لها كاشف.** `findDuplicates` للعملاء وحدهم، و`externalDuplicates` تقارن
 * مخزونك بعروض **غيرك**. أمّا مخزونك بنفسه فلا شيء يمسّه — وأنت تجول الأحياء وتُدخل
 * العقارات، فالفلّةُ تدخل من جولتين، أو من جولةٍ ومن لصق عرض.
 *
 * **والأثر ليس سطرًا زائدًا في قائمة:**
 *   • يُحسب مرّتين في مؤشّر سعر الحي — وصفحةُ الصحّة تقول هذا بنفسها عن العروض الخارجية.
 *   • يُطابَق مرّتين، فيصل العميلَ العرضُ نفسه مرّتين.
 *   • يُنشر مرّتين في صفحتك العامة.
 *
 * **ودرجتان من اليقين:**
 *   • **يقينيّ** — رقمُ صكٍّ واحد (الصكّ يُعرّف القطعة)، أو موقعٌ واحد ضمن عشرين مترًا.
 *   • **ظنّيّ** — المدينة والحي والنوع نفسها، والمساحةُ والسعر متقاربان. وهذه يقرّرها بصرُك.
 *
 * **ولا يُقارَن ما أُقفل ولا ما أُرشف:** سجلٌّ بِيع ليس تكرارًا يُدمج، هو تاريخٌ يُحفظ.
 * ودمجُ منجزٍ بحيٍّ يُفسد صفقةً مسجَّلة.
 *
 * @returns {[{ a, b, reason: 'deed'|'spot'|'specs', sure: boolean, meters: number|null }]}
 */
export function propertyDuplicates(properties = [], { areaPct = 5, pricePct = 5 } = {}) {
  const live = properties.filter((p) => p && !p.archivedAt && !['sold', 'rented'].includes(p.status));

  // **التهيئةُ مرّةً لكلّ سجلّ لا مرّةً لكلّ مقارنة.** أوّلُ صيغةٍ من هذه الدالة كانت
  // تقارن كلَّ عقارٍ بكلّ عقار وتُطبّع النصوصَ داخل الحلقة — فصارت صفحةُ العقارات على
  // خمسة آلاف سجلّ **٣٣ ثانية** بدل ثلاث. كشفتها حزمةُ `scale-perf`، ولولاها لشُحن.
  const prep = live.map((p) => ({
    p,
    deed: deedKey(p.deedNumber),
    bucket: `${norm(p.city)}|${norm(p.district)}|${p.type}`,
    area: Number(p.area) || 0,
    price: Number(p.price) || 0,
    lat: Number(p.location?.lat),
    lng: Number(p.location?.lng),
  }));

  const out = [];
  const seen = new Set();
  const push = (a, b, reason, sure, meters = null) => {
    const [x, y] = [a, b].sort((m, n) => String(m.id).localeCompare(String(n.id)));
    const key = `${x.id}|${y.id}`;
    if (seen.has(key)) return;   // اليقينيُّ يُفحص أوّلًا، فلا يزحمه ظنّيٌّ على الزوج نفسه
    seen.add(key);
    out.push({ a: x, b: y, reason, sure, meters });
  };

  /* ١) الصكّ: خريطةٌ واحدة — لا مقارنةَ أصلًا */
  const byDeed = new Map();
  for (const r of prep) {
    if (!r.deed) continue;
    if (!byDeed.has(r.deed)) byDeed.set(r.deed, []);
    byDeed.get(r.deed).push(r);
  }
  for (const group of byDeed.values()) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) push(group[i].p, group[j].p, 'deed', true);
    }
  }

  /* ٢) الموقع: خلايا شبكةٍ بحجم عتبة التقارب، ولا يُقارَن إلا الجوار */
  const CELL = 0.0002; // نحو ٢٠ مترًا عند خطوط عرض الجزيرة
  const byCell = new Map();
  for (const r of prep) {
    if (!Number.isFinite(r.lat) || !Number.isFinite(r.lng)) continue;
    const key = `${Math.round(r.lat / CELL)}|${Math.round(r.lng / CELL)}`;
    if (!byCell.has(key)) byCell.set(key, []);
    byCell.get(key).push(r);
  }
  for (const [key, group] of byCell) {
    const [cx, cy] = key.split('|').map(Number);
    // الخلايا التسع: نقطتان متجاورتان قد تقعان على طرفَي حدٍّ بين خليتين.
    const neighbours = [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const other = byCell.get(`${cx + dx}|${cy + dy}`);
        if (other && (dx || dy)) neighbours.push(...other);
      }
    }
    for (let i = 0; i < group.length; i++) {
      const rest = [...group.slice(i + 1), ...neighbours];
      for (const other of rest) {
        if (other.p.id === group[i].p.id) continue;
        const m = metersBetween(group[i].p.location, other.p.location);
        if (m != null && m <= SAME_SPOT_METERS) push(group[i].p, other.p, 'spot', true, Math.round(m));
      }
    }
  }

  /* ٣) المواصفات: دلوٌ بالمدينة والحي والنوع، ثم فرزٌ بالمساحة ووقوفٌ عند أوّل بعيد */
  const byBucket = new Map();
  for (const r of prep) {
    if (!r.p.district || !r.p.type || r.area <= 0) continue;
    if (!byBucket.has(r.bucket)) byBucket.set(r.bucket, []);
    byBucket.get(r.bucket).push(r);
  }
  for (const group of byBucket.values()) {
    group.sort((a, b) => a.area - b.area);
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        // المساحاتُ مرتَّبةٌ تصاعديًّا، والفرقُ النسبيّ يزداد بازدياد `j` —
        // فأوّلُ بعيدٍ يعني أنّ ما بعده أبعد، ولا حاجة إلى إكمال الحلقة.
        const gap = ((group[j].area - group[i].area) / group[j].area) * 100;
        if (gap > areaPct) break;
        const bothPriced = group[i].price > 0 && group[j].price > 0;
        if (bothPriced) {
          const pGap = (Math.abs(group[i].price - group[j].price) / Math.max(group[i].price, group[j].price)) * 100;
          if (pGap > pricePct) continue;
        }
        push(group[i].p, group[j].p, 'specs', false);
      }
    }
  }

  // اليقينيُّ أوّلًا: ما لا يحتاج نظرك يُحسم قبل ما يحتاجه.
  return out.sort((x, y) => Number(y.sure) - Number(x.sure));
}

/** أيُّ السجلّين يُبقى: الأغنى بياناتٍ، وعند التعادل الأقدم (كما في العملاء). */
export function suggestPropertyKeeper(a, b) {
  const score = (p) => [p.price, p.area, p.district, p.type, p.deedNumber, p.ownerId, p.location,
    p.notes, p.agreementSignedAt, p.adLicense].filter(Boolean).length
    + (p.images || []).length + (p.priceHistory || []).length;
  const sa = score(a);
  const sb = score(b);
  if (sa !== sb) return sa > sb ? a : b;
  return String(a.createdAt || '') <= String(b.createdAt || '') ? a : b;
}
