// إدارة الأملاك (المرحلة ٣٨).
//
// هذا عملٌ غير الوساطة: الوساطة تنتهي بالصفقة، والإدارة تبدأ بعدها وتستمرّ — إيجارٌ
// يُحصَّل في موعده، وعقدٌ ينتهي فيُجدَّد، وأجرُ إدارةٍ يُستحقّ شهرًا بعد شهر. وكان هذا
// كلّه يُكتب في ملاحظات العقار، فلا يُذكَّر بموعدٍ ولا يُحسب دخلٌ ولا يُعرف ما فات.
//
// ولا تُخترع بياناتٌ هنا: عقد الإدارة في العقار، والإيجارُ ودفعاتُه في الصفقة المرتبطة
// به — وهذا يجمع الاثنين ويحسب ما بينهما، لا أكثر.

import { daysWord, countWord } from './format.js';

const DAY = 86400000;

export const FEE_TYPES = [
  { key: 'percent', label: 'نسبة من الإيجار' },
  { key: 'fixed', label: 'مبلغ شهري ثابت' },
];

/** أجرُ الإدارة الشهريّ محسوبًا — أو null إن لم يكن معلومًا. */
export function monthlyFee(management, annualRent) {
  if (!management || management.feeValue == null) return null;
  if (management.feeType === 'fixed') return Math.round(management.feeValue);
  const rent = Number(annualRent);
  if (!Number.isFinite(rent) || rent <= 0) return null;
  return Math.round((rent * management.feeValue) / 100 / 12);
}

/** أيامٌ تفصلنا عن انتهاء عقد الإدارة — سالبةٌ إن انتهى، وnull إن لم تُحدَّد نهاية. */
export function daysToEnd(management, now = Date.now()) {
  if (!management?.endAt) return null;
  const end = new Date(management.endAt).getTime();
  if (Number.isNaN(end)) return null;
  return Math.ceil((end - now) / DAY);
}

export function contractState(management, now = Date.now()) {
  if (!management) return 'none';
  const left = daysToEnd(management, now);
  if (left == null) return 'open'; // بلا نهاية محدَّدة — سارٍ حتى يُلغى
  if (left < 0) return 'expired';
  if (left <= 30) return 'ending';
  return 'active';
}

export const STATE_LABEL = {
  none: 'ليس تحت الإدارة',
  open: 'سارٍ (بلا نهاية محدَّدة)',
  active: 'سارٍ',
  ending: 'ينتهي قريبًا',
  expired: 'انتهى',
};

/**
 * صفٌّ واحد لكل عقارٍ تحت الإدارة: عقده، ومستأجرُه إن وُجد، ودفعاته المتأخّرة، وأجرُه.
 * @param {object} args
 * @param {Array} args.properties كل العقارات
 * @param {Array} args.deals كل الصفقات (تُقرأ منها عقود الإيجار ودفعاتها)
 * @param {Map}   args.clientMap معرّف العميل ← سجلّه (لاسم المالك والمستأجر)
 */
export function managedRows({ properties = [], deals = [], clientMap = new Map(), now = Date.now() } = {}) {
  const dealsByProperty = new Map();
  for (const d of deals) {
    if (!d.propertyId) continue;
    const cur = dealsByProperty.get(d.propertyId);
    // أحدث صفقةٍ للعقار هي عقده الساري
    if (!cur || (d.date || '') > (cur.date || '')) dealsByProperty.set(d.propertyId, d);
  }

  const rows = [];
  for (const p of properties) {
    if (!p.management) continue;
    const deal = dealsByProperty.get(p.id) || null;
    const payments = deal?.payments || [];
    const overdue = payments.filter((x) => !x.paidAt && x.dueAt && new Date(x.dueAt).getTime() < now);
    const nextDue = payments
      .filter((x) => !x.paidAt && x.dueAt && new Date(x.dueAt).getTime() >= now)
      .sort((a, b) => String(a.dueAt).localeCompare(String(b.dueAt)))[0] || null;
    const collected = payments.filter((x) => x.paidAt).reduce((s, x) => s + (Number(x.amount) || 0), 0);
    const due = payments.reduce((s, x) => s + (Number(x.amount) || 0), 0);

    rows.push({
      property: p,
      owner: clientMap.get(p.ownerId) || null,
      tenant: deal ? clientMap.get(deal.clientId) || null : null,
      deal,
      state: contractState(p.management, now),
      daysLeft: daysToEnd(p.management, now),
      leaseEndAt: deal?.leaseEndAt || null,
      fee: monthlyFee(p.management, deal?.finalPrice ?? p.price),
      overdueCount: overdue.length,
      overdueAmount: overdue.reduce((s, x) => s + (Number(x.amount) || 0), 0),
      nextDue,
      collected,
      due,
    });
  }
  return rows;
}

/** ما يستحقّ انتباهك اليوم: عقدٌ انتهى أو يوشك، أو دفعةٌ فاتت. */
export function managementAlerts(rows) {
  const out = [];
  for (const r of rows) {
    if (r.state === 'expired') out.push({ row: r, kind: 'expired', text: 'عقد الإدارة انتهى' });
    else if (r.state === 'ending') out.push({ row: r, kind: 'ending', text: `عقد الإدارة ينتهي بعد ${daysWord(r.daysLeft)}` });
    if (r.overdueCount) {
      out.push({
        row: r,
        kind: 'overdue',
        text: `${countWord(r.overdueCount, ['دفعة إيجار واحدة متأخّرة', 'دفعتا إيجار متأخّرتان', 'دفعات إيجار متأخّرة', 'دفعة إيجار متأخّرة'])}`,
      });
    }
  }
  return out;
}

/** مجموع أجور الإدارة الشهرية — دخلٌ متكرّر لا يظهر في العمولات. */
export function monthlyFeeTotal(rows) {
  return rows.reduce((s, r) => s + (r.fee || 0), 0);
}
