// محرك المطابقة (المرحلة ٣): يقابل الطلب العقاري بالمخزون،
// وبالعروض الخارجية معه بالمعايير والأوزان نفسها (إضافة المرحلة ٤ — لا محرك ثانيًا لها).
//
// فواصل قاطعة (عدم تطابقها يلغي المطابقة أصلًا): نوع العقار · الغرض · المدينة.
// معايير مرجّحة تؤثر في النسبة: الحي · السعر · المساحة (أوزانها من الإعدادات).
// السعر في اتجاه واحد: الأرخص من الميزانية لا يُخصم منه أبدًا، والأغلى يتدرّج هبوطًا
// حتى يبلغ حدّ المرونة فتسقط المطابقة. والمساحة بالمنطق نفسه: المساحة المطلوبة حدٌّ أدنى،
// فالأكبر لا يُخصم منه، والأصغر يتدرّج حتى حدّ المرونة فيسقط.
// أي قيمة غير معروفة (سعر العقار، مساحته، حيّه) تُرفع من مقام الحساب وتُوسَم، ولا تُسقط العقار.
//
// لا يُخزَّن شيء هنا: المطابقة تُحسب لحظة العرض، ولا يُكتب سجل في مخزن matches
// إلا عند تصرّف المستخدم (صفحة المطابقات). فما لم يُتصرَّف فيه = "جديدة" ضمنًا.

import { repo } from './repository.js';
import { getMatchingSettings, getZonesFor, expandZones } from './settings.js';
import { normalizeArabic } from '../util/arabic.js';

/** حالات العقار المستبعدة تلقائيًا من كل مطابقة. */
export const EXCLUDED_STATUSES = ['rented', 'sold', 'refused'];

/** حالات العرض الخارجي المستبعدة تلقائيًا من كل مطابقة (المرحلة ٤). */
export const EXCLUDED_EXTERNAL_STATUSES = ['unavailable', 'archived'];

const norm = (s) => normalizeArabic(String(s ?? ''));
const round = (n) => Math.round(n);

/* ===== حدود المرونة ===== */

/** الحدّ الأدنى لمرونة السعر بحسب غرض الطلب. */
function priceFloorFor(purpose, settings) {
  if (purpose === 'rent') return settings.price.minRent;
  if (purpose === 'investment') return settings.price.minInvestment;
  return settings.price.minSale;
}

/**
 * مرونة السعر بالريال لهذا الطلب:
 * مبلغ الطلب إن حُدد، وإلا max(السقف × النسبة، الحدّ الأدنى بحسب الغرض).
 * @returns {{ value: number, source: 'amount'|'percent'|'floor', percent: number, floor: number }}
 */
export function priceFlexFor(request, settings) {
  const floor = priceFloorFor(request.purpose, settings);
  const percent = request.priceFlexibility ?? settings.price.percent;
  if (request.priceFlexAmount != null) {
    return { value: Math.max(0, request.priceFlexAmount), source: 'amount', percent, floor };
  }
  const byPercent = (request.budgetMax ?? 0) * (percent / 100);
  return byPercent >= floor
    ? { value: byPercent, source: 'percent', percent, floor }
    : { value: floor, source: 'floor', percent, floor };
}

/**
 * مرونة المساحة بالمتر لهذا الطلب: مساحة الطلب إن حُددت،
 * وإلا max(المساحة المطلوبة × النسبة، الحدّ الأدنى بالمتر).
 */
export function areaFlexFor(request, settings) {
  const floor = settings.area.minSqm;
  const percent = request.areaFlexibility ?? settings.area.percent;
  if (request.areaFlexAmount != null) {
    return { value: Math.max(0, request.areaFlexAmount), source: 'amount', percent, floor };
  }
  const byPercent = (request.area ?? 0) * (percent / 100);
  return byPercent >= floor
    ? { value: byPercent, source: 'percent', percent, floor }
    : { value: floor, source: 'floor', percent, floor };
}

/* ===== الأحياء ===== */

/**
 * أحياء الطلب = الأحياء المفردة + أحياء نطاقاته موسَّعة.
 * النطاق يُحفظ في الطلب بمفتاحه لا بأحيائه، فتعديل النطاق في الإعدادات يسري على الطلب تلقائيًا.
 */
export function requestDistricts(request, cityZones) {
  const fromZones = expandZones(cityZones, request.districtZones || []);
  return [...new Set([...(request.districts || []), ...fromZones])];
}

/* ===== التسجيل ===== */

const HARD_REASONS = {
  type: 'نوع العقار مختلف',
  purpose: 'الغرض مختلف',
  city: 'المدينة مختلفة',
  capture: 'لم يُعتمد بعد',
  status: 'حالته تستبعده (مؤجَّر أو مبيع أو رفض التعاون)',
  external_status: 'العرض الخارجي لم يعد متاحًا أو مؤرشف',
  own: 'العقار مملوك لصاحب الطلب نفسه',
  price: 'السعر يتجاوز حدّ المرونة',
  area: 'المساحة أصغر من حدّ المرونة',
};

export function hardReasonLabel(key) {
  return HARD_REASONS[key] || 'غير مطابق';
}

/** ما يُحسب مرة لكل طلب: مجموعة أحيائه المطبَّعة، ومرونتا السعر والمساحة. */
export function preparePer(request, settings, districts = []) {
  return {
    wanted: new Set(districts.map(norm).filter(Boolean)),
    priceFlex: priceFlexFor(request, settings),
    areaFlex: areaFlexFor(request, settings),
  };
}

function hardFilter(request, listing, settings, kind) {
  if (!listing.type || listing.type !== request.type) return 'type';
  if (!Array.isArray(listing.purposes) || !listing.purposes.includes(request.purpose)) return 'purpose';
  if (norm(listing.city) !== norm(request.city)) return 'city';
  if (kind === 'external') {
    // العرض الخارجي بلا captureStatus وبلا مالك مربوط؛ استبعاده بحالته الخاصة (المرحلة ٤).
    if (EXCLUDED_EXTERNAL_STATUSES.includes(listing.status)) return 'external_status';
    return null;
  }
  if (listing.captureStatus && listing.captureStatus !== 'approved') return 'capture';
  if (EXCLUDED_STATUSES.includes(listing.status)) return 'status';
  if (settings.excludeOwnProperties && listing.ownerId && request.clientId && listing.ownerId === request.clientId) return 'own';
  return null;
}

/* ===== جاهزية العرض للمطابقة (المرحلة ٤) ===== */

/** الحقول التي تلزم أي معروض ليدخل المطابقة أصلًا (هي الفواصل القاطعة نفسها). */
export const MATCH_REQUIRED_FIELDS = [
  { key: 'type', label: 'النوع' },
  { key: 'purposes', label: 'الغرض' },
  { key: 'city', label: 'المدينة' },
];

/**
 * هل هذا المعروض جاهز للمطابقة؟ يُستعمل لتصنيف العروض الخارجية الناقصة
 * ("بانتظار الإكمال") في صفحتها، لأن الناقص لا يطابق أي طلب أبدًا.
 * @returns {{ ready: boolean, missing: Array<{ key, label }> }}
 */
export function matchReadiness(listing) {
  const missing = MATCH_REQUIRED_FIELDS.filter((f) => {
    const value = listing?.[f.key];
    return Array.isArray(value) ? value.length === 0 : !String(value ?? '').trim();
  });
  return { ready: missing.length === 0, missing };
}

/**
 * نسبة مطابقة عقار أو عرض خارجي لطلب.
 * @param {object} request الطلب
 * @param {object} listing العقار أو العرض الخارجي
 * @param {{ settings: object, districts: string[], kind?: 'property'|'external' }} ctx
 *        إعدادات المطابقة وأحياء الطلب موسَّعة، ونوع المعروض (الافتراضي عقار من المخزون)
 * @returns {{ ok: boolean, reason?: string, score: number, priceUnknown: boolean,
 *            tags: string[], parts: Array<{ key, label, weight, state, ratio, detail }> }}
 */
export function scoreListing(request, listing, { settings, districts = [], kind = 'property', pre = null }) {
  const fail = hardFilter(request, listing, settings, kind);
  if (fail) return { ok: false, reason: fail, score: 0, priceUnknown: listing.price == null, tags: [], parts: [] };

  const parts = [];
  const tags = [];
  const w = settings.weights;
  // تهيئة الطلب (`pre`) تُحسب مرة لكل طلب لا مرة لكل معروض. وبالقياس: بناء مجموعة الأحياء
  // وحساب المرونتين داخل الحلقة كان يلتهم أكثر الزمن عند ١٥٠٠ عقار × ٣٠٠ طلب.
  const ready = pre || preparePer(request, settings, districts);

  /* الحي */
  const wanted = ready.wanted;
  if (wanted.size) {
    if (!listing.district) {
      parts.push({ key: 'district', label: 'الحي', weight: w.district, state: 'unknown', ratio: null, detail: 'الحي غير معروف' });
      tags.push('الحي غير معروف');
    } else {
      const hit = wanted.has(norm(listing.district));
      parts.push({
        key: 'district', label: 'الحي', weight: w.district, state: 'known', ratio: hit ? 1 : 0,
        detail: hit ? listing.district : `${listing.district} — خارج الأحياء المطلوبة`,
      });
    }
  }

  /* السعر */
  const priceFlex = ready.priceFlex;
  if (request.budgetMax != null) {
    if (listing.price == null) {
      parts.push({ key: 'price', label: 'السعر', weight: w.price, state: 'unknown', ratio: null, detail: 'السعر غير معروف' });
      tags.push('السعر غير معروف');
    } else {
      const over = listing.price - request.budgetMax;
      if (over <= 0) {
        parts.push({ key: 'price', label: 'السعر', weight: w.price, state: 'known', ratio: 1, detail: 'داخل الميزانية' });
      } else if (priceFlex.value <= 0 || over >= priceFlex.value) {
        return { ok: false, reason: 'price', score: 0, priceUnknown: false, tags, parts };
      } else {
        parts.push({
          key: 'price', label: 'السعر', weight: w.price, state: 'known', ratio: 1 - over / priceFlex.value,
          detail: `يزيد ${Math.round(over).toLocaleString('en-US')} ريال على السقف`,
        });
      }
    }
  } else if (listing.price == null) {
    tags.push('السعر غير معروف');
  }

  /* المساحة */
  const areaFlex = ready.areaFlex;
  if (request.area != null) {
    if (listing.area == null) {
      parts.push({ key: 'area', label: 'المساحة', weight: w.area, state: 'unknown', ratio: null, detail: 'المساحة غير معروفة' });
      tags.push('المساحة غير معروفة');
    } else {
      const under = request.area - listing.area;
      if (under <= 0) {
        parts.push({ key: 'area', label: 'المساحة', weight: w.area, state: 'known', ratio: 1, detail: 'تساوي المطلوب أو تزيد' });
      } else if (areaFlex.value <= 0 || under >= areaFlex.value) {
        return { ok: false, reason: 'area', score: 0, priceUnknown: listing.price == null, tags, parts };
      } else {
        parts.push({
          key: 'area', label: 'المساحة', weight: w.area, state: 'known', ratio: 1 - under / areaFlex.value,
          detail: `أصغر بـ ${Math.round(under).toLocaleString('en-US')} م² من المطلوب`,
        });
      }
    }
  }

  /* الغرف (المرحلة ٤٢) — معيارٌ **مرجّحٌ لا قاطع**.
     كان يُقرأ من رسالة العميل ثم يضيع لعدم وجود حقلٍ يحمله. وجُعل مرجّحًا لا قاطعًا عمدًا:
     عرضٌ لم يُسجَّل عدد غرفه ليس عرضًا بغرفةٍ واحدة، وقطعُه لأجل حقلٍ ناقصٍ عندك يُخفي
     عنك ما يناسب عميلك. فالناقصُ يُوسَم، والأقلُّ يهبط في الترتيب ولا يختفي. */
  if (request.rooms != null && w.rooms > 0) {
    const raw = listing.typeFields?.rooms;
    const asNum = Number(raw);
    const has = raw == null || raw === '' || !Number.isFinite(asNum) ? null : asNum;
    if (has == null) {
      parts.push({ key: 'rooms', label: 'الغرف', weight: w.rooms, state: 'unknown', ratio: null, detail: 'عدد الغرف غير مسجَّل' });
      tags.push('عدد الغرف غير مسجَّل');
    } else {
      const short = request.rooms - has;
      const ratio = short <= 0 ? 1 : short === 1 ? 0.5 : 0;
      const detail = short <= 0 ? `${has} غرفة — يكفي المطلوب` : `${has} غرفة، والمطلوب ${request.rooms}`;
      parts.push({ key: 'rooms', label: 'الغرف', weight: w.rooms, state: 'known', ratio, detail });
      if (short >= 2) tags.push('غرفُه أقلّ ممّا طُلب بكثير');
    }
  }

  /* أرضيّةُ الميزانية — **وسمٌ لا حسم**: الأرخصُ ليس عيبًا في نفسه، لكنّ من قال «من ٤٥»
     غالبًا يعني أنّ ما دونها ليس من سوقه. فيُقال له ولا يُحجب عنه. */
  if (request.budgetMin != null && listing.price != null && listing.price < request.budgetMin) {
    tags.push(`أقلّ من أرضيّتك (${Math.round(request.budgetMin).toLocaleString('en-US')} ريال)`);
  }

  const known = parts.filter((p) => p.state === 'known');
  const total = known.reduce((s, p) => s + p.weight, 0);
  const score = total > 0
    ? round((known.reduce((s, p) => s + p.weight * p.ratio, 0) / total) * 100)
    : 100; // اجتاز الفواصل القاطعة ولا معيار مرجّح صالحًا للحساب

  if (total === 0 && parts.length === 0) tags.push('لا معايير مرجّحة في هذا الطلب');

  return { ok: true, score, priceUnknown: listing.price == null, tags, parts };
}

/* ===== التشغيل ===== */

/**
 * يحمّل ما يحتاجه المحرك مرة واحدة للصفحة كلها (لا يُستدعى داخل حلقة).
 * @returns {Promise<{ settings, properties, clients, requests, zonesByCity, matches }>}
 */
export async function loadMatchingContext({ withMatches = true } = {}) {
  const [settings, properties, externals, clients, requests, matches] = await Promise.all([
    getMatchingSettings(), repo.properties.list(), repo.externalListings.list(),
    repo.clients.list(), repo.requests.list(),
    withMatches ? repo.matches.list() : Promise.resolve([]),
  ]);
  const zonesByCity = {};
  for (const city of new Set(requests.map((r) => r.city).filter(Boolean))) {
    zonesByCity[city] = await getZonesFor(city);
  }
  // الفهرس يُبنى مرة مع السياق فتستفيد منه كل الصفحات بلا تغيير فيها (المرحلة ٢٠).
  const matchIndex = buildMatchIndex({ properties, externals });
  return { settings, properties, externals, clients, requests, zonesByCity, matches, matchIndex };
}

/**
 * مرشحو طلب واحد من المخزون والعروض الخارجية معًا، مرتّبين تنازليًّا بالنسبة.
 * العرض الخارجي يمرّ على المعايير والأوزان نفسها؛ ولا يميّزه إلا `kind`.
 * @param {object} request
 * @param {object} ctx مخرج loadMatchingContext (أو ما يكافئه)
 * @param {{ minScore?: number, includeExternal?: boolean }} options
 * @returns {Array<{ listing, kind: 'property'|'external', score, tags, parts, priceUnknown }>}
 */
/**
 * فهرس القواطع القاطعة (المرحلة ٢٠): (مدينة | نوع | غرض) ← المعروضات الموافقة.
 *
 * كان كل طلب يمرّ على **كل** معروض ليُسقطه بأول قاطع. وبقياس حقيقي على ١٥٠٠ عقار و٣٠٠ طلب
 * نشط: ٦٦٦ ملّي ثانية لحساب المرشحين كلهم، و٦٤٤ لمؤشر «الفرص» — أي تجمّدٌ محسوس على الجوال
 * في كل فتحة لصفحة «يومي». والفهرس يقصر المرور على الدلو المعني وحده.
 *
 * **النتيجة مطابقة تمامًا** لأن الدلو يضمّ بالضبط ما يجتاز القواطع الثلاثة المتساوية،
 * وبقية القواطع (الاعتماد، الحالة، عقارك أنت) تبقى في `scoreListing` كما هي.
 */
export function buildMatchIndex({ properties = [], externals = [] } = {}) {
  const add = (map, listing) => {
    const purposes = Array.isArray(listing.purposes) ? listing.purposes : [];
    if (!listing.type || !purposes.length) return; // ناقصٌ لا يطابق شيئًا أصلًا
    for (const purpose of purposes) {
      const key = `${norm(listing.city)}|${listing.type}|${purpose}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(listing);
    }
  };
  const propertyMap = new Map();
  const externalMap = new Map();
  for (const p of properties) add(propertyMap, p);
  for (const x of externals) add(externalMap, x);
  return { properties: propertyMap, externals: externalMap };
}

const bucketOf = (map, request) => map?.get(`${norm(request.city)}|${request.type}|${request.purpose}`) || [];

export function candidatesFor(request, ctx, { minScore = 0, includeExternal = true, limit = 0 } = {}) {
  const districts = requestDistricts(request, ctx.zonesByCity?.[request.city] || []);
  const pre = preparePer(request, ctx.settings, districts);
  const out = [];
  // أدنى درجةٍ داخل الحصيلة حين تمتلئ — تُرفع كلما دخل أفضل منها، فتصير قاطعًا يمنع
  // بناء كائنٍ لمرشّحٍ لن يبقى. وهذا كل مكسب `limit` (المرحلة ٣٥): الترتيب لا يتغيّر،
  // وإنما **لا تُخصَّص ذاكرةٌ لما سيُرمى**.
  let floor = minScore;
  const collect = (listings, kind) => {
    for (const listing of listings || []) {
      const result = scoreListing(request, listing, { settings: ctx.settings, districts, kind, pre });
      if (!result.ok || result.score < minScore) continue;
      if (limit && out.length >= limit && result.score <= floor) continue;
      out.push({ listing, kind, score: result.score, tags: result.tags, parts: result.parts, priceUnknown: result.priceUnknown });
      // لا نرتّب في كل إدخال: نقصّ على مِثلَي الحدّ فيبقى القصّ نادرًا والنتيجة مضبوطة.
      if (limit && out.length >= limit * 2) {
        out.sort(byScore);
        out.length = limit;
        floor = out[out.length - 1].score;
      }
    }
  };
  // الفهرس إن بُني (loadMatchingContext تبنيه)، وإلا فالمرور الكامل — فالسياق المبنيّ يدويًا يعمل كما كان.
  const index = ctx.matchIndex;
  collect(index ? bucketOf(index.properties, request) : ctx.properties, 'property');
  if (includeExternal) collect(index ? bucketOf(index.externals, request) : ctx.externals, 'external');
  out.sort(byScore);
  return limit ? out.slice(0, limit) : out;
}

const byScore = (a, b) => b.score - a.score
  || (b.listing.updatedAt || '').localeCompare(a.listing.updatedAt || '');

/**
 * هل لهذا الطلب مرشّح واحد على الأقل؟ (المرحلة ٢٠)
 *
 * سؤال «الفرص» ليس «كم مرشحًا» بل «أله مرشح أصلًا» — وحسابُ كل المرشحين لطرح هذا السؤال
 * إسرافٌ قِيس: ٦٧٧ ملّي ثانية مقابل **٨** بالخروج عند أول مرشح. والنتيجة واحدة بالضبط.
 */
export function hasCandidate(request, ctx, { minScore = 0, includeExternal = true } = {}) {
  const districts = requestDistricts(request, ctx.zonesByCity?.[request.city] || []);
  const pre = preparePer(request, ctx.settings, districts);
  const index = ctx.matchIndex;
  const scan = (listings, kind) => {
    for (const listing of listings || []) {
      const result = scoreListing(request, listing, { settings: ctx.settings, districts, kind, pre });
      if (result.ok && result.score >= minScore) return true;
    }
    return false;
  };
  if (scan(index ? bucketOf(index.properties, request) : ctx.properties, 'property')) return true;
  if (!includeExternal) return false;
  return scan(index ? bucketOf(index.externals, request) : ctx.externals, 'external');
}

/** نسبة معروض بعينه لطلب بعينه (لعرض المطابقات المحفوظة التي ربما خرجت من الترشيح). */
export function scoreOne(request, listing, ctx, kind = 'property') {
  const districts = requestDistricts(request, ctx.zonesByCity?.[request.city] || []);
  return scoreListing(request, listing, { settings: ctx.settings, districts, kind });
}
