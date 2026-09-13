// سعر المتر ومؤشر السوق من بياناتك أنت (المرحلة ١١).
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

const key = (city, district, type) => `${city || ''}|${district || ''}|${type || ''}`;

/**
 * يبني مؤشر أسعار المتر لكل (مدينة، حي، نوع).
 * @param {{ properties: [], externals: [], deals: [], minSample?: number }} input
 * @returns {{ get(city, district, type): { median, count, sources } | null, rows: [] }}
 */
export function buildPriceIndex({ properties = [], externals = [], deals = [], minSample = 2 } = {}) {
  const buckets = new Map();
  const push = (item, source) => {
    const ppm = pricePerSqm(item);
    if (ppm == null) return;
    const k = key(item.city, item.district, item.type);
    if (!buckets.has(k)) buckets.set(k, { city: item.city || '', district: item.district || '', type: item.type || '', values: [], sources: { inventory: 0, external: 0, deal: 0 } });
    const bucket = buckets.get(k);
    bucket.values.push(ppm);
    bucket.sources[source]++;
  };

  for (const p of properties) if (p.captureStatus === 'approved') push(p, 'inventory');
  for (const x of externals) if (x.status === 'active') push(x, 'external');
  // الصفقة أصدق من أي عرض: سعرها نهائي لا مطلوب — تُحسب بسعرها النهائي ومساحة عقارها.
  for (const d of deals) {
    const property = properties.find((p) => p.id === d.propertyId);
    if (!property) continue;
    push({ price: d.finalPrice, area: property.area, city: property.city, district: property.district, type: property.type }, 'deal');
  }

  const rows = [...buckets.values()]
    .map((b) => ({ city: b.city, district: b.district, type: b.type, median: median(b.values), count: b.values.length, sources: b.sources }))
    .filter((b) => b.median != null && b.count >= minSample)
    .sort((a, b) => b.count - a.count || (b.median - a.median));

  const byKey = new Map(rows.map((r) => [key(r.city, r.district, r.type), r]));
  return { rows, get: (city, district, type) => byKey.get(key(city, district, type)) || null };
}

/**
 * موضع عقار من وسيط حيّه: نسبة الفرق ووصف قصير.
 * @returns {{ ppm, median, diffPct, label, tone } | null}
 */
export function comparePrice(item, index) {
  const ppm = pricePerSqm(item);
  if (ppm == null) return null;
  const stat = index.get(item.city, item.district, item.type);
  if (!stat || stat.count < 2) return { ppm, median: null, diffPct: null, label: 'لا عيّنة كافية للمقارنة', tone: '' };
  const diffPct = Math.round(((ppm - stat.median) / stat.median) * 100);
  const label = diffPct > 8 ? `أعلى من وسيط الحي بـ${diffPct}٪`
    : diffPct < -8 ? `أقل من وسيط الحي بـ${Math.abs(diffPct)}٪`
      : 'قريب من وسيط الحي';
  const tone = diffPct > 8 ? 'price-high' : diffPct < -8 ? 'price-low' : 'price-mid';
  return { ppm, median: stat.median, diffPct, label, tone, count: stat.count };
}
