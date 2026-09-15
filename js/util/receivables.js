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
 * العمولات غير المقبوضة: الصفقة أُبرمت وسُجّلت عمولتها ولم يُسجَّل قبضها.
 * الصفقة بلا رقم عمولة ليست مستحقًا — لا يُخترع لها رقم.
 */
export function commissionReceivables(deals = [], now = new Date()) {
  return deals
    .filter((d) => !d.commissionPaidAt && Number(d.commission) > 0)
    .map((d) => {
      const days = ageDays(d.date, now);
      return {
        kind: 'commission',
        id: d.id,
        deal: d,
        clientId: d.clientId || null,
        remaining: Number(d.commission),
        total: Number(d.commission),
        state: 'unpaid',
        basis: d.date,
        dated: false,
        days,
        bucket: bucketFor(days),
      };
    })
    .sort((a, b) => b.days - a.days);
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
