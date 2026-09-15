// ملخّص ضريبة القيمة المضافة للربع (المرحلة ٣١).
//
// تُصدر فواتير ضريبية منذ المرحلة ١٩، ولم تكن هناك شاشة تجمع **ضريبة المخرجات** لربعٍ
// لتقدّمها في الإقرار — فتُجمع باليد من الفواتير، وهو أسوأ موضعٍ للخطأ.
//
// **حدوده مكتوبة وصريحة، ويُعرض معها في الشاشة:**
//   • هذا **بيانٌ من فواتيرك لا إقرار ضريبي ولا مشورة**، ولا يُرسَل إلى أي جهة.
//   • **ضريبة المخرجات وحدها**: ما حصّلتَه على فواتيرك. ولا تدخل هنا ضريبة المدخلات
//     (ما دفعتَه أنت) لأن مصاريفك ليست فيها حقل ضريبة أصلًا — فادّعاء صافي ضريبة يكون كذبًا.
//   • **عرض السعر ليس فاتورة** فلا يدخل، وهي القاعدة نفسها منذ المرحلة ١٧.
//   • الأساس **تاريخ المستند** كما أصدرتَه.
//
// دوال خالصة: لا تخزين ولا شبكة.

import { invoiceTotal, invoiceVat, invoiceGrandTotal } from '../data/schema.js';

export const QUARTERS = [
  { key: 1, label: 'الربع الأول (يناير–مارس)', months: [0, 1, 2] },
  { key: 2, label: 'الربع الثاني (أبريل–يونيو)', months: [3, 4, 5] },
  { key: 3, label: 'الربع الثالث (يوليو–سبتمبر)', months: [6, 7, 8] },
  { key: 4, label: 'الربع الرابع (أكتوبر–ديسمبر)', months: [9, 10, 11] },
];

export const quarterOf = (date) => Math.floor(new Date(date).getMonth() / 3) + 1;

/**
 * @param {[]} invoices كل المستندات (فواتير وعروض أسعار)
 * @param {{ year, quarter }} period
 * @returns {{ rows, count, net, vat, gross, zeroRated, year, quarter, label }}
 */
export function vatSummary(invoices = [], { year = new Date().getFullYear(), quarter = quarterOf(new Date()) } = {}) {
  const months = QUARTERS.find((q) => q.key === Number(quarter))?.months || [];
  const rows = invoices
    .filter((inv) => inv.type === 'invoice' && inv.date) // عرض السعر ليس فاتورة
    .map((inv) => ({ inv, at: new Date(inv.date) }))
    .filter((x) => !Number.isNaN(x.at.getTime())
      && x.at.getFullYear() === Number(year)
      && months.includes(x.at.getMonth()))
    .map(({ inv, at }) => ({
      id: inv.id,
      number: inv.number || '',
      date: inv.date,
      clientName: inv.clientName || '',
      net: invoiceTotal(inv),
      vat: invoiceVat(inv),
      gross: invoiceGrandTotal(inv),
      rate: Number(inv.vatRate) || 0,
      at,
    }))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));

  const sum = (key) => rows.reduce((total, r) => total + (Number(r[key]) || 0), 0);
  return {
    rows,
    count: rows.length,
    net: sum('net'),
    vat: sum('vat'),
    gross: sum('gross'),
    // فواتير بلا ضريبة داخل الربع: تُعدّ وتُذكر، فلا يظنّ القارئ أن الضريبة نُسيت.
    zeroRated: rows.filter((r) => !(r.vat > 0)).length,
    year: Number(year),
    quarter: Number(quarter),
    label: QUARTERS.find((q) => q.key === Number(quarter))?.label || '',
  };
}

/** السنوات التي فيها فواتير فعلًا — لا قائمة سنوات مخترعة. */
export function invoiceYears(invoices = []) {
  const years = new Set();
  for (const inv of invoices) {
    if (inv.type !== 'invoice' || !inv.date) continue;
    const y = new Date(inv.date).getFullYear();
    if (Number.isFinite(y)) years.add(y);
  }
  if (!years.size) years.add(new Date().getFullYear());
  return [...years].sort((a, b) => b - a);
}
