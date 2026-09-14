// سعر المتر ومؤشر السوق من بياناتك أنت (المرحلة ١١، ووُسِّع في المرحلة ١٤).
//
// **لا مصدر خارجي ولا تقدير آلي:** كل رقم هنا وسيطٌ حسابي لما عندك فعلًا — مخزونك المعتمد،
// والعروض الخارجية النشطة، وصفقاتك المنجزة. وهذا يجعل الرقم صادقًا وضيّقًا في آن: يفيدك في
// حيٍّ عندك فيه عيّنة كافية، ولا يُعتمد عليه في حي بعيّنة واحدة (ولذلك يُذكر حجم العيّنة دومًا).
//
// دوال خالصة كلها — تُستدعى في الصفحات ولا تلمس التخزين.

/** سعر المتر لسجل واحد (عقار أو عرض خارجي)، أو null إن نقص سعر أو مساحة. */
export function pricePerSqm(item) {
  const price = Number(item?.price);
  const area = Number(item?.area);
  if (!Number.isFinite(price) || !Number.isFinite(area) || price <= 0 || area <= 0) return null;
  return price / area;
}

/** الوسيط (median) — أمتن من المتوسط أمام عرضٍ شاذّ واحد يفسد الحساب. */
export function median(values) {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** شريحة مئوية بالاستيفاء الخطي (q بين ٠ و١) — تُستعمل للربيعين في نطاق التقدير. */
export function quantile(values, q) {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!sorted.length) return null;
  if (sorted.length === 1) return sorted[0];
  const pos = (sorted.length - 1) * Math.min(Math.max(q, 0), 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/**
 * بيع أم إيجار؟ خلط الاثنين في وسيطٍ واحد يفسده تمامًا (مليون ريال بجانب أربعين ألفًا)،
 * والحقل `price` رقم واحد فلا يحتمل الغرضين معًا. القاعدة: إيجارٌ إن ذُكر الإيجار ولم يُذكر البيع،
 * وما عدا ذلك (بيع، استثمار، أو بلا غرض) يُحسب في كفّة البيع.
 */
export function purposeKey(item) {
  const purposes = Array.isArray(item?.purposes) ? item.purposes : [];
  return purposes.includes('rent') && !purposes.includes('sale') ? 'rent' : 'sale';
}

const key = (city, district, type, purpose) => `${city || ''}|${district || ''}|${type || ''}|${purpose || 'sale'}`;

/**
 * عيّنة أسعار المتر الخام: كل سجل صالح للحساب بمصدره، لتُبنى فوقها المؤشرات والتقديرات.
 * الفلترة نفسها في كل مكان: مخزونك المعتمد فقط، والعروض الخارجية النشطة فقط، والصفقات بسعرها النهائي.
 */
export function priceSamples({ properties = [], externals = [], deals = [] } = {}) {
  const out = [];
  const push = (item, source, extra) => {
    const ppm = pricePerSqm(item);
    if (ppm == null) return;
    out.push({
      source,
      city: item.city || '',
      district: item.district || '',
      type: item.type || '',
      purpose: purposeKey(item),
      price: Number(item.price),
      area: Number(item.area),
      ppm,
      ...extra,
    });
  };

  for (const p of properties) {
    if (p.captureStatus !== 'approved') continue;
    push(p, 'inventory', { id: p.id, at: p.updatedAt || p.createdAt || '' });
  }
  for (const x of externals) {
    if (x.status !== 'active') continue;
    push(x, 'external', { id: x.id, at: x.postedAt || x.createdAt || '' });
  }
  // الصفقة أصدق من أي عرض: سعرها نهائي لا مطلوب — تُحسب بسعرها النهائي ومساحة عقارها.
  for (const d of deals) {
    const property = properties.find((p) => p.id === d.propertyId);
    if (!property) continue;
    push(
      { price: d.finalPrice, area: property.area, city: property.city, district: property.district, type: property.type, purposes: property.purposes },
      'deal',
      { id: d.id, propertyId: property.id, at: d.date || '' },
    );
  }
  return out;
}

/**
 * يبني مؤشر أسعار المتر لكل (مدينة، حي، نوع، غرض).
 * @param {{ properties: [], externals: [], deals: [], minSample?: number }} input
 * @returns {{ get(city, district, type, purpose): { median, count, sources } | null, rows: [] }}
 */
export function buildPriceIndex({ properties = [], externals = [], deals = [], minSample = 2 } = {}) {
  const buckets = new Map();
  for (const s of priceSamples({ properties, externals, deals })) {
    const k = key(s.city, s.district, s.type, s.purpose);
    if (!buckets.has(k)) {
      buckets.set(k, { city: s.city, district: s.district, type: s.type, purpose: s.purpose, values: [], sources: { inventory: 0, external: 0, deal: 0 } });
    }
    const bucket = buckets.get(k);
    bucket.values.push(s.ppm);
    bucket.sources[s.source]++;
  }

  const rows = [...buckets.values()]
    .map((b) => ({ city: b.city, district: b.district, type: b.type, purpose: b.purpose, median: median(b.values), count: b.values.length, sources: b.sources }))
    .filter((b) => b.median != null && b.count >= minSample)
    .sort((a, b) => b.count - a.count || (b.median - a.median));

  const byKey = new Map(rows.map((r) => [key(r.city, r.district, r.type, r.purpose), r]));
  return { rows, get: (city, district, type, purpose = 'sale') => byKey.get(key(city, district, type, purpose)) || null };
}

/**
 * موضع عقار من وسيط حيّه: نسبة الفرق ووصف قصير.
 * @returns {{ ppm, median, diffPct, label, tone } | null}
 */
export function comparePrice(item, index) {
  const ppm = pricePerSqm(item);
  if (ppm == null) return null;
  const stat = index.get(item.city, item.district, item.type, purposeKey(item));
  if (!stat || stat.count < 2) return { ppm, median: null, diffPct: null, label: 'لا عيّنة كافية للمقارنة', tone: '' };
  const diffPct = Math.round(((ppm - stat.median) / stat.median) * 100);
  const label = diffPct > 8 ? `أعلى من وسيط الحي بـ${diffPct}٪`
    : diffPct < -8 ? `أقل من وسيط الحي بـ${Math.abs(diffPct)}٪`
      : 'قريب من وسيط الحي';
  const tone = diffPct > 8 ? 'price-high' : diffPct < -8 ? 'price-low' : 'price-mid';
  return { ppm, median: stat.median, diffPct, label, tone, count: stat.count };
}

/**
 * تقدير سعر عقارٍ لم يُسعَّر بعد (المرحلة ١٤): وسيط سعر المتر في حيّه × مساحته، ومعه نطاق الربيعين.
 *
 * ليس تثمينًا معتمدًا ولا يدّعي ذلك: لا يرى عمر المبنى ولا موقعه من الشارع ولا تشطيبه،
 * إنما يقول «هذا ما تبيع به أنت والسوق حولك في هذا الحي». ولذلك:
 *  - يفصل البيع عن الإيجار (خلطهما يفسد الوسيط تمامًا)،
 *  - ويتراجع إلى مستوى المدينة إن لم تكفِ عيّنة الحي، **ويصرّح بأنه تراجع**،
 *  - ويرفض التقدير أصلًا إن قلّت العيّنة عن الحد، فالصمت أصدق من رقمٍ من عيّنة واحدة.
 *
 * @param {{ city, district, type, purpose, area, excludeId? }} target
 *   `excludeId`: معرّف العقار المقدَّر نفسه — يُستبعد من عيّنته فلا يقارن العقار بنفسه.
 * @param {[]} samples ناتج priceSamples
 * @returns {{ ok, basis, count, ppm: {median, low, high}, estimate, low, high, confidence, spread, comparables, excluded? }}
 */
export function estimatePrice(target, samples = [], { minSample = 3, comparables = 8 } = {}) {
  const area = Number(target?.area);
  const purpose = target?.purpose || 'sale';
  const base = { ok: false, basis: null, count: 0, purpose, comparables: [] };
  if (!Number.isFinite(area) || area <= 0) return { ...base, reason: 'area' };

  // العقار المقدَّر لا يدخل عيّنته: سعره المطلوب هو ما نختبره، فإدخاله يجعل الرقم يصدّق نفسه.
  const pool0 = target.excludeId ? samples.filter((s) => s.id !== target.excludeId && s.propertyId !== target.excludeId) : samples;
  const sameKind = pool0.filter((s) => s.purpose === purpose && (!target.type || s.type === target.type) && (!target.city || s.city === target.city));
  const inDistrict = target.district ? sameKind.filter((s) => s.district === target.district) : [];

  let pool = inDistrict;
  let basis = 'district';
  if (pool.length < minSample) { pool = sameKind; basis = 'city'; }
  if (pool.length < minSample) {
    return { ...base, count: pool.length, reason: 'sample', minSample, comparables: pool.slice(0, comparables) };
  }

  const values = pool.map((s) => s.ppm);
  const mid = median(values);
  const low = quantile(values, 0.25);
  const high = quantile(values, 0.75);
  const spread = mid > 0 ? (high - low) / mid : 0;
  // الثقة من شيئين لا من واحد: قرب العيّنة (حي أم مدينة) وتشتّتها. عيّنة واسعة متفرّقة ليست ثقة.
  const confidence = basis === 'district' && pool.length >= 8 && spread <= 0.35 ? 'high'
    : basis === 'district' && spread <= 0.6 ? 'medium'
      : 'low';

  const near = [...pool].sort((a, b) => Math.abs(a.area - area) - Math.abs(b.area - area) || String(b.at).localeCompare(String(a.at)));

  return {
    ok: true,
    basis,
    purpose,
    count: pool.length,
    area,
    ppm: { median: mid, low, high },
    estimate: mid * area,
    low: low * area,
    high: high * area,
    spread,
    confidence,
    sources: pool.reduce((acc, s) => { acc[s.source]++; return acc; }, { inventory: 0, external: 0, deal: 0 }),
    comparables: near.slice(0, comparables),
  };
}

/**
 * حركة سعر عقار من سجلّه (المرحلة ١٩).
 *
 * سؤالان يسألهما الوسيط قبل كل تفاوض: **كم خفّض المالك؟** و**كم مضى على هذا السعر؟**
 * والثاني ورقة تفاوض بذاته: سعرٌ لم يتحرك تسعة أشهر يقول إن المالك متمسّك أو السوق رفضه.
 *
 * @returns {{ changes, since, days, dropPct } | null} null إن لم يتغيّر السعر قط.
 */
export function priceTrend(property, now = Date.now()) {
  const history = Array.isArray(property?.priceHistory) ? property.priceHistory.filter((h) => h?.at) : [];
  if (!history.length) return null;
  if (history.length < 2) return null; // نقطة واحدة = سعرٌ لم يتحرك بعد
  const last = history[history.length - 1];
  const current = Number(property.price);
  const firstRecorded = Number(history[0].price); // أول نقطة = السعر قبل أول تعديل
  const dropPct = Number.isFinite(firstRecorded) && firstRecorded > 0 && Number.isFinite(current)
    ? Math.round(((firstRecorded - current) / firstRecorded) * 100)
    : null;
  const days = Math.max(0, Math.floor((now - new Date(last.at).getTime()) / 86400000));
  return { changes: history.length - 1, since: last.at, days, dropPct }; // النقاط ناقصَ واحدة = عدد التغييرات
}

/**
 * فجوة ميزانية طلب عن المتوقَّع في حيّه (المرحلة ١٩) — دالة خالصة ليست في الصفحة.
 *
 * تشترط: حيًّا واحدًا محددًا (الطلب على خمسة أحياء لا يُحاسَب على أغلاها)، ومساحة، وسقف
 * ميزانية، وعيّنة **على مستوى الحي** لا المدينة. وتصمت فيما دون ١٥٪ لأن ذلك يبتلعه التفاوض.
 *
 * @returns {{ gapPct, expected, count, district } | null}
 */
export function budgetRealityGap(request, samples, { minGapPct = 15 } = {}) {
  const districts = request?.districts || [];
  if (!request?.budgetMax || !request?.area || !request?.type || districts.length !== 1) return null;
  const est = estimatePrice({
    city: request.city,
    district: districts[0],
    type: request.type,
    purpose: request.purpose === 'rent' ? 'rent' : 'sale',
    area: request.area,
  }, samples);
  if (!est.ok || est.basis !== 'district') return null;
  const gapPct = Math.round(((est.estimate - request.budgetMax) / est.estimate) * 100);
  if (gapPct < minGapPct) return null;
  return { gapPct, expected: est.estimate, count: est.count, district: districts[0] };
}
