// حزمة عقد إيجار (المرحلة ٣٧) — الجزء الذي يعمل **بلا اشتراك ولا مفتاح**.
//
// «إيجار» منصّة الهيئة العامة للعقار، ولا تفتح واجهةً برمجية عامة يُسجَّل بها من أي تطبيق.
// فالوعد بالتسجيل الآلي وعدٌ لا يُوفى. والذي يُوفى — وهو أكثر ما يختصر الوقت على كل حال —
// أن يجمع النظام **كل حقلٍ يطلبه العقد** من سجلاتك في ورقةٍ واحدة تنقلها مرّة، بدل أن
// تتنقّل بين أربع شاشات تنسخ رقمًا رقمًا.
//
// **وما ينقص يُقال ولا يُملأ بتخمين**: حقلٌ فارغ في هذه الورقة أهون من رقمٍ اخترعناه لك.
//
// دوال خالصة: لا تخزين ولا شبكة.

import { formatSAR, formatDate, formatArea, formatNumber } from './format.js';
import { formatPhone } from './phone.js';

/** حقول العقد مرتَّبةً كما تُطلب: الأطراف، ثم العين، ثم المال، ثم المدّة. */
export function ejarPackage({ deal, property = null, tenant = null, owner = null, company = {} } = {}) {
  const months = leaseMonths(deal);
  const yearly = Number(deal?.finalPrice) || null;
  const rows = [
    ['المؤجِّر (المالك)', owner?.name || property?.ownerName || null],
    ['جوال المؤجِّر', owner?.phone ? formatPhone(owner.phone) : null],
    ['هوية المؤجِّر', owner?.nationalId || null],
    ['المستأجر', tenant?.name || null],
    ['جوال المستأجر', tenant?.phone ? formatPhone(tenant.phone) : null],
    ['هوية المستأجر', tenant?.nationalId || null],
    ['نوع العين', property?.type || null],
    ['المدينة', property?.city || null],
    ['الحي', property?.district || null],
    ['المساحة', property?.area ? formatArea(property.area) : null],
    ['رقم الصك', property?.deedNumber || null],
    ['الموقع', property?.location || null],
    ['قيمة الإيجار السنوي', yearly ? formatSAR(yearly) : null],
    ['عدد الدفعات', (deal?.payments || []).length ? formatNumber(deal.payments.length) : null],
    ['تاريخ بداية العقد', deal?.date ? formatDate(deal.date) : null],
    ['تاريخ نهاية العقد', deal?.leaseEndAt ? formatDate(deal.leaseEndAt) : null],
    ['مدّة العقد', months ? `${formatNumber(months)} شهرًا` : null],
    ['عمولة الوساطة', deal?.commission ? formatSAR(deal.commission) : null],
    ['المكتب الوسيط', company?.name || null],
    ['رقم الوسيط المعتمد', company?.licenseNumber || null],
  ];

  const filled = rows.filter(([, v]) => v != null && v !== '');
  const missing = rows.filter(([, v]) => v == null || v === '').map(([k]) => k);
  return { rows, filled, missing, complete: missing.length === 0 };
}

/** مدّة العقد بالأشهر من تاريخَيه، أو null. */
export function leaseMonths(deal) {
  const from = deal?.date ? new Date(deal.date).getTime() : NaN;
  const to = deal?.leaseEndAt ? new Date(deal.leaseEndAt).getTime() : NaN;
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return null;
  return Math.round((to - from) / (30 * 86400000));
}

/** نصٌّ جاهز للنسخ — سطرٌ لكل حقل، وما ينقص مذكورٌ في آخره لا مطموس. */
export function ejarText(pkg) {
  const lines = pkg.filled.map(([k, v]) => `${k}: ${v}`);
  if (pkg.missing.length) {
    lines.push('');
    lines.push(`ينقص من سجلاتك: ${pkg.missing.join('، ')}`);
  }
  return lines.join('\n');
}
