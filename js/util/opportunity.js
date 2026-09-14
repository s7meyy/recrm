// فرص الاقتناص: الطلب مقابل العرض لكل حي (المرحلة ١٢).
//
// **القياس الصادق للطلب ليس عدد الطلبات.** طلبٌ عنده تسع مطابقات ليس فرصة؛ والفرصة الحقيقية
// هي **الطلب غير الملبّى**: طلب نشط يشمل الحي ولا يجد عندك (ولا في العروض الخارجية) مرشحًا
// واحدًا — بمحرك المطابقة نفسه، بسعره ومساحته وقواطعه لا بالحي وحده.
//
// دوال خالصة: تأخذ سياق المطابقة الجاهز ولا تلمس التخزين ولا تعيد حساب شيء يخص المحرك.

import { hasCandidate, requestDistricts } from '../data/matching.js';

const norm = (s) => String(s ?? '').trim();
const key = (city, district, type) => `${city}|${district}|${type}`;

/**
 * يبني صفوف الفرص لكل (مدينة، حي، نوع).
 *
 * @param {object} ctx مخرج loadMatchingContext
 * @param {{ minScore?: number }} options الحدّ المستعمل في صفحة المطابقات نفسه
 * @returns {{ rows: Array, cities: string[], totals: object }}
 *   كل صف: { city, district, type, demand, unmet, supply, market, gap, requests: [] }
 *   - demand: طلبات نشطة تشمل هذا الحي بهذا النوع
 *   - unmet: منها ما لا مرشح له إطلاقًا ← **الفرصة**
 *   - supply: عقاراتك المعتمدة في الحي بهذا النوع
 *   - market: عروض خارجية نشطة هناك (سوق متاح، ليس ملكك — وسيطٌ قد يوصلك له)
 *   - gap: unmet − supply (موجب = عجز يستحق جولة ميدانية)
 */
export function buildOpportunityIndex(ctx, { minScore = 0 } = {}) {
  const rows = new Map();
  const touch = (city, district, type) => {
    const k = key(city, district, type);
    if (!rows.has(k)) {
      rows.set(k, { city, district, type, demand: 0, unmet: 0, supply: 0, market: 0, requests: [] });
    }
    return rows.get(k);
  };

  /* الطلب: كل طلب نشط يُوزَّع على أحيائه (المفردة + الموسَّعة من النطاقات) */
  for (const request of ctx.requests || []) {
    if (request.status !== 'active') continue;
    const city = norm(request.city);
    const districts = requestDistricts(request, ctx.zonesByCity?.[city] || []);
    // طلب بلا حي محدَّد يعني «أي حي»، فلا يُنسب إلى حي بعينه ولا يفتعل عجزًا وهميًا.
    if (!districts.length) continue;
    // السؤال هنا «أله مرشح أصلًا» لا «كم مرشحًا»، فالخروج عند الأول يكفي (المرحلة ٢٠).
    const unmet = !hasCandidate(request, ctx, { minScore });
    for (const district of districts) {
      const row = touch(city, norm(district), norm(request.type));
      row.demand++;
      if (unmet) {
        row.unmet++;
        row.requests.push({ id: request.id, clientId: request.clientId, budgetMax: request.budgetMax, area: request.area });
      }
    }
  }

  /* العرض: مخزونك المعتمد، والسوق: العروض الخارجية النشطة */
  for (const p of ctx.properties || []) {
    if (p.captureStatus !== 'approved') continue;
    const district = norm(p.district);
    if (!district) continue;
    touch(norm(p.city), district, norm(p.type)).supply++;
  }
  for (const x of ctx.externals || []) {
    if (x.status !== 'active') continue;
    const district = norm(x.district);
    if (!district) continue;
    touch(norm(x.city), district, norm(x.type)).market++;
  }

  const list = [...rows.values()]
    .map((r) => ({ ...r, gap: r.unmet - r.supply }))
    // الأولوية للطلب غير الملبّى، ثم للطلب الكلي، ثم لقلّة المخزون
    .sort((a, b) => b.unmet - a.unmet || b.demand - a.demand || a.supply - b.supply);

  const cities = [...new Set(list.map((r) => r.city).filter(Boolean))];
  const totals = {
    unmet: list.reduce((s, r) => s + r.unmet, 0),
    demand: list.reduce((s, r) => s + r.demand, 0),
    hotDistricts: list.filter((r) => r.unmet > 0).length,
    surplus: list.filter((r) => r.supply >= 3 && r.demand === 0).length,
  };
  return { rows: list, cities, totals };
}

/** يدمج صفوف الأنواع في صف واحد لكل حي (عرض «الحي فقط»). */
export function collapseByDistrict(rows) {
  const out = new Map();
  for (const r of rows) {
    const k = `${r.city}|${r.district}`;
    if (!out.has(k)) out.set(k, { city: r.city, district: r.district, type: '', demand: 0, unmet: 0, supply: 0, market: 0, requests: [] });
    const row = out.get(k);
    row.demand += r.demand;
    row.unmet += r.unmet;
    row.supply += r.supply;
    row.market += r.market;
    row.requests.push(...r.requests);
  }
  return [...out.values()]
    .map((r) => ({ ...r, gap: r.unmet - r.supply }))
    .sort((a, b) => b.unmet - a.unmet || b.demand - a.demand || a.supply - b.supply);
}

/** أعلى الأحياء عجزًا — لملخّص صفحة «يومي». */
export function topOpportunities(rows, limit = 3) {
  return collapseByDistrict(rows).filter((r) => r.unmet > 0).slice(0, limit);
}

/** أحياء التخمة: مخزون راكد بلا أي طلب نشط يشمله. */
export function surplusRows(rows, { minSupply = 2 } = {}) {
  return rows
    .filter((r) => r.demand === 0 && r.supply >= minSupply)
    .sort((a, b) => b.supply - a.supply);
}
