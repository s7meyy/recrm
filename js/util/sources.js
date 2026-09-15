// تقرير مصادر العملاء وربحية العقار (المرحلة ٢٤).
//
// تاق «المصدر» يُخزَّن منذ المرحلة ٨ ولا يُقرأ. وهذا يقرؤه: أي مصدر أعطاك **صفقات**
// لا مجرد أسماء. والفرق جوهري — مصدرٌ يعطيك خمسين عميلًا بلا صفقة واحدة تكلفةٌ لا مورد.
//
// دوال خالصة: لا تخزين ولا شبكة.

import { netCommission } from '../data/schema.js';

const UNKNOWN = 'بلا مصدر';

/**
 * أداء كل مصدر: كم عميلًا، وكم طلبًا، وكم صفقة، وكم عمولة صافية.
 * @returns {{ rows: [], totals: object }} مرتَّبة بالعمولة تنازليًا — المال أصدق ترتيبٍ هنا.
 */
export function sourceReport({ clients = [], requests = [], deals = [], expenses = [] } = {}) {
  const rows = new Map();
  const touch = (name) => {
    const key = String(name || '').trim() || UNKNOWN;
    if (!rows.has(key)) rows.set(key, { source: key, clients: 0, requests: 0, deals: 0, commission: 0, active: 0, spent: 0 });
    return rows.get(key);
  };

  const sourceOf = new Map();
  for (const c of clients) {
    const row = touch(c.referralSource);
    row.clients++;
    sourceOf.set(c.id, row.source);
  }
  for (const r of requests) {
    const row = touch(sourceOf.get(r.clientId));
    row.requests++;
    if (r.status === 'active') row.active++;
  }
  for (const d of deals) {
    const row = touch(sourceOf.get(d.clientId));
    row.deals++;
    row.commission += netCommission(d);
  }

  // ما صُرف على كل مصدر (المرحلة ٣٥): المصروف الموسوم بمصدره وحده — والمصروف بلا وسم
  // لا يُقسَّم على المصادر تخمينًا، فرقمٌ مخمَّن أسوأ من فراغٍ معلن.
  for (const e of expenses) {
    const name = String(e?.source || '').trim();
    if (!name) continue;
    touch(name).spent += Number(e.amount) || 0;
  }

  const list = [...rows.values()].map((r) => ({
    ...r,
    // نسبة التحويل من عميل إلى صفقة — الرقم الذي يقرّر أين تضع جهدك القادم.
    conversion: r.clients > 0 ? r.deals / r.clients : null,
    perClient: r.clients > 0 ? r.commission / r.clients : null,
    // الصافي هو الحكم: مصدرٌ بعمولةٍ كبيرة وكلفةٍ أكبر خسارةٌ تلبس ثوب نجاح.
    net: r.commission - r.spent,
    costPerClient: r.spent > 0 && r.clients > 0 ? r.spent / r.clients : null,
    costPerDeal: r.spent > 0 && r.deals > 0 ? r.spent / r.deals : null,
  })).sort((a, b) => b.net - a.net || b.deals - a.deals || b.clients - a.clients);

  return {
    rows: list,
    totals: {
      clients: list.reduce((s, r) => s + r.clients, 0),
      deals: list.reduce((s, r) => s + r.deals, 0),
      commission: list.reduce((s, r) => s + r.commission, 0),
      spent: list.reduce((s, r) => s + r.spent, 0),
      net: list.reduce((s, r) => s + r.net, 0),
      sources: list.filter((r) => r.source !== UNKNOWN).length,
    },
  };
}

/**
 * ربحية كل عقار: عمولاته الصافية ناقص ما صُرف عليه.
 * المصاريف مرتبطة بالعقار أصلًا (المرحلة ١٣)، فهذا حسابٌ لا تخزين.
 */
export function propertyProfit({ properties = [], deals = [], expenses = [] } = {}) {
  const byId = new Map(properties.map((p) => [p.id, p]));
  const rows = new Map();
  const touch = (id) => {
    if (!rows.has(id)) rows.set(id, { propertyId: id, property: byId.get(id) || null, commission: 0, spent: 0, deals: 0 });
    return rows.get(id);
  };

  for (const d of deals) {
    if (!d.propertyId) continue;
    const row = touch(d.propertyId);
    row.commission += netCommission(d);
    row.deals++;
  }
  for (const e of expenses) {
    if (!e.propertyId) continue;
    touch(e.propertyId).spent += Number(e.amount) || 0;
  }

  return [...rows.values()]
    .map((r) => ({ ...r, net: r.commission - r.spent }))
    .sort((a, b) => b.net - a.net);
}
