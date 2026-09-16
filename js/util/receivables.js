// المستحقات: ما كسبته ولم تقبضه بعد (المرحلة ١٧).
//
// دوال خالصة تُقرأ من الفواتير والصفقات ولا تلمس التخزين. وقاعدتان تحكمانها:
//
// ١) **عرض السعر ليس مستحقًا.** ما لم يصر فاتورة فهو عرضٌ قد يُرفض؛ إدخاله في المستحقات
//    يعطيك رقمًا يسرّك ولا وجود له. (الشرط في `invoiceCollection` نفسها.)
// ٢) **التقادم من تاريخ الاستحقاق لا من تاريخ الإصدار** حين يُذكر، فالفاتورة المؤجَّلة
//    باتفاقٍ ليست متأخرة. وبغياب الاستحقاق يُحسب على تاريخ المستند — أقرب المتاح.

import { invoiceGrandTotal, invoiceRemaining, invoiceCollection } from '../data/schema.js';

const DAY = 86400000;

/** الشرائح بالأيام: كلما طال العمر ضعُف الاحتمال — والترتيب هو ترتيب إلحاح المكالمة. */
export const AGE_BUCKETS = [
  { key: 'current', label: 'لم يستحق بعد', max: 0 },
  { key: 'd30', label: 'حتى ٣٠ يومًا', max: 30 },
  { key: 'd60', label: '٣١–٦٠ يومًا', max: 60 },
  { key: 'd90', label: '٦١–٩٠ يومًا', max: 90 },
  { key: 'older', label: 'أكثر من ٩٠ يومًا', max: Infinity },
];

/** عمر المستحق بالأيام: موجبٌ إن مضى الاستحقاق، وسالبٌ إن لم يحن بعد. */
export function ageDays(iso, now = new Date()) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 0;
  return Math.floor((now.getTime() - d.getTime()) / DAY);
}

export function bucketFor(days) {
  if (days <= 0) return 'current';
  return AGE_BUCKETS.find((b) => days <= b.max)?.key || 'older';
}

/**
 * صفوف المستحقات من الفواتير: كل فاتورة لم تُقبض كاملةً، بعمرها وشريحتها.
 * @returns {[]} مرتَّبة بالأقدم استحقاقًا أولًا — وهو ترتيب من تتصل به أولًا.
 */
export function invoiceReceivables(invoices = [], now = new Date()) {
  return invoices
    .map((inv) => {
      const state = invoiceCollection(inv);
      if (state === 'quote' || state === 'paid') return null;
      const basis = inv.dueAt || inv.date || null;
      if (!basis) return null;
      const days = ageDays(basis, now);
      return {
        kind: 'invoice',
        id: inv.id,
        invoice: inv,
        clientId: inv.clientId || null,
        name: inv.clientName || '',
        number: inv.number || '',
        total: invoiceGrandTotal(inv),
        remaining: invoiceRemaining(inv),
        state,
        basis,
        dated: !!inv.dueAt,
        days,
        bucket: bucketFor(days),
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.days - a.days);
}

/**
 * حال عمولة صفقة: كم منها قُبض وكم بقي (المرحلة ٤٥).
 *
 * **صورتان لا ثالثة:**
 *   • بلا أقساط → `commissionPaidAt` هو الحَكَم كما كان منذ المرحلة ١٧: قُبضت كلّها أو
 *     لم يُقبض منها شيء. وهكذا تبقى كل صفقةٍ سُجّلت قبل هذه المرحلة على حالها بلا هجرة.
 *   • بأقساط → المقبوض مجموعُ ما وُسم مقبوضًا، والباقي فرقُه عن العمولة.
 *
 * **والمجدولُ غيرُ العمولة:** من كتب عمولةً ١٠٠ ألف وجدول منها ٥٠ فله ٥٠ **غير مجدولة**
 * وهي مستحَقّةٌ عليه لا مُلغاة — فتُحسب في `unscheduled` ولا تُبتلع. وضدُّه كذلك: مجدولٌ
 * فوق العمولة يُقال بسالبٍ ولا يُصحَّح من خلف ظهرك.
 */
export function commissionState(deal) {
  const total = Number(deal?.commission) || 0;
  const rows = Array.isArray(deal?.commissionPayments) ? deal.commissionPayments : [];
  if (!rows.length) {
    const paid = deal?.commissionPaidAt ? total : 0;
    return {
      total, paid, remaining: total - paid, scheduled: 0, unscheduled: total,
      rows: [], split: false, done: !!deal?.commissionPaidAt, paidAt: deal?.commissionPaidAt || null,
    };
  }
  const amount = (r) => Number(r?.amount) || 0;
  const paid = rows.filter((r) => r.paidAt).reduce((a, r) => a + amount(r), 0);
  const scheduled = rows.reduce((a, r) => a + amount(r), 0);
  const lastPaidAt = rows.filter((r) => r.paidAt).map((r) => r.paidAt).sort().at(-1) || null;
  const done = total > 0 && paid >= total;
  return {
    total, paid, remaining: total - paid, scheduled, unscheduled: total - scheduled,
    rows, split: true, done, paidAt: done ? lastPaidAt : null,
  };
}

/**
 * العمولات غير المقبوضة: الصفقة أُبرمت وسُجّلت عمولتها ولم يُسجَّل قبضها.
 * الصفقة بلا رقم عمولة ليست مستحقًا — لا يُخترع لها رقم.
 *
 * **وبالأقساط يصير لكلّ قسطٍ صفُّه وتاريخُ استحقاقه** (المرحلة ٤٥): عمرُ المتأخر يُحسب من
 * موعد القسط لا من تاريخ الصفقة — وإلا لظهر قسطٌ يستحقّ بعد شهرين متأخّرًا اليوم.
 */
export function commissionReceivables(deals = [], now = new Date()) {
  const out = [];
  for (const d of deals) {
    const st = commissionState(d);
    if (st.total <= 0 || st.remaining <= 0) continue;

    if (!st.split) {
      const days = ageDays(d.date, now);
      out.push({
        kind: 'commission', id: d.id, deal: d, clientId: d.clientId || null,
        remaining: st.remaining, total: st.total, state: 'unpaid',
        basis: d.date, dated: false, days, bucket: bucketFor(days),
      });
      continue;
    }

    for (const p of st.rows) {
      if (p.paidAt || !(Number(p.amount) > 0)) continue;
      // قسطٌ بلا تاريخ استحقاق: يُنسب إلى تاريخ الصفقة ويُعلَن غيرَ مؤرَّخ، ولا يختفي.
      const basis = p.dueAt || d.date;
      const days = ageDays(basis, now);
      out.push({
        kind: 'commission', id: `${d.id}:${p.id || p.dueAt || ''}`, dealId: d.id, deal: d,
        instalment: p, clientId: d.clientId || null,
        remaining: Number(p.amount), total: st.total, state: 'unpaid',
        basis, dated: !!p.dueAt, days, bucket: bucketFor(days),
      });
    }

    // ما لم يُجدول أصلًا: مستحَقٌّ لك ولا قسطَ يحمله، فيُعرض على تاريخ الصفقة.
    if (st.unscheduled > 0) {
      const days = ageDays(d.date, now);
      out.push({
        kind: 'commission', id: `${d.id}:unscheduled`, dealId: d.id, deal: d,
        clientId: d.clientId || null, unscheduled: true,
        remaining: st.unscheduled, total: st.total, state: 'unpaid',
        basis: d.date, dated: false, days, bucket: bucketFor(days),
      });
    }
  }
  return out.sort((a, b) => b.days - a.days);
}

/**
 * دفعات الإيجار المستحقّة ولم تُقبض (المرحلة ٢٤).
 * الدفعة المستقبلية ليست مستحقًا متأخرًا، فتدخل بعمرٍ سالب كما تدخل الفاتورة المؤجَّلة.
 */
export function paymentReceivables(deals = [], now = new Date()) {
  const rows = [];
  for (const deal of deals) {
    for (const payment of deal.payments || []) {
      if (payment.paidAt || !payment.dueAt) continue;
      const days = ageDays(payment.dueAt, now);
      rows.push({
        kind: 'payment',
        id: payment.id,
        dealId: deal.id,
        deal,
        payment,
        clientId: deal.clientId || null,
        remaining: Number(payment.amount) || 0,
        total: Number(payment.amount) || 0,
        state: 'unpaid',
        basis: payment.dueAt,
        dated: true,
        days,
        bucket: bucketFor(days),
      });
    }
  }
  return rows.sort((a, b) => b.days - a.days);
}

/** كل المستحقات مجموعةً، مع إجمالٍ لكل شريحة عمر. */
export function receivables({ invoices = [], deals = [] } = {}, now = new Date()) {
  const rows = [...invoiceReceivables(invoices, now), ...commissionReceivables(deals, now), ...paymentReceivables(deals, now)]
    .sort((a, b) => b.days - a.days);
  const buckets = AGE_BUCKETS.map((b) => ({
    ...b,
    count: 0,
    amount: 0,
  }));
  const byKey = new Map(buckets.map((b) => [b.key, b]));
  for (const row of rows) {
    const bucket = byKey.get(row.bucket);
    bucket.count++;
    bucket.amount += row.remaining;
  }
  const overdue = rows.filter((r) => r.days > 0);
  return {
    rows,
    buckets,
    total: rows.reduce((s, r) => s + r.remaining, 0),
    overdueTotal: overdue.reduce((s, r) => s + r.remaining, 0),
    overdueCount: overdue.length,
  };
}
