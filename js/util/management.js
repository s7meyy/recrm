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
      openMaintenance: openMaintenance(p),
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
    // بلاغُ صيانةٍ مفتوحٌ عملٌ ينتظرك كالدفعة الفائتة — وكان يسكن الملاحظات فلا يُرى.
    const open = r.openMaintenance?.length || 0;
    if (open) {
      out.push({
        row: r,
        kind: 'maintenance',
        text: countWord(open, ['بلاغ صيانة واحد مفتوح', 'بلاغا صيانة مفتوحان', 'بلاغات صيانة مفتوحة', 'بلاغ صيانة مفتوحًا']),
      });
    }
  }
  return out;
}

/** مجموع أجور الإدارة الشهرية — دخلٌ متكرّر لا يظهر في العمولات. */
export function monthlyFeeTotal(rows) {
  return rows.reduce((s, r) => s + (r.fee || 0), 0);
}

/* ===== الصيانة وكشف المالك (المرحلة ٤٧) ===== */

export const MAINTENANCE_STATUSES = [
  { key: 'open', label: 'مفتوح' },
  { key: 'doing', label: 'تحت التنفيذ' },
  { key: 'done', label: 'أُنجز' },
];

/** من يتحمّل كلفة الصيانة — وهو موضعُ الخلاف الأوّل، فلا يُخمَّن. */
export const MAINTENANCE_BEARERS = [
  { key: 'owner', label: 'المالك' },
  { key: 'tenant', label: 'المستأجر' },
  { key: 'office', label: 'المكتب' },
];

export const bearerLabel = (key) => MAINTENANCE_BEARERS.find((b) => b.key === key)?.label || 'المالك';
export const maintenanceLabel = (key) => MAINTENANCE_STATUSES.find((s) => s.key === key)?.label || 'مفتوح';

/** البلاغاتُ التي لم تُنجَز بعد — هي التي تنتظر عملك. */
export const openMaintenance = (property) => (property?.maintenance || []).filter((m) => m.status !== 'done');

/**
 * **كشفُ حسابِ المالك لشهر** — السؤالُ الذي يسأله كلَّ شهر: «كم لي؟».
 *
 * وكان جوابُه يُجمع بيدك من ثلاث شاشات: الدفعاتُ المقبوضة، ناقصَ أجرِ الإدارة، ناقصَ
 * الصيانة. **وهذا يجمعها ولا يخترع شيئًا**: الدفعاتُ من الصفقة، والأجرُ من عقد الإدارة،
 * والصيانةُ من بلاغات العقار.
 *
 * **ولا يُخصم إلا ما يتحمّله المالك**: صيانةٌ على المستأجر أو على المكتب ليست على المالك،
 * وخصمُها منه خطأٌ في ورقةٍ تُسلَّم بيده.
 *
 * @param {{ property, deal, month }} o — `month` بصيغة `YYYY-MM`
 * @returns {{ month, collected, rows, fee, maintenance, maintenanceRows, net }}
 */
export function ownerStatement({ property = null, deal = null, month = '' } = {}) {
  const key = String(month || new Date().toISOString().slice(0, 7));
  const inMonth = (iso) => String(iso || '').slice(0, 7) === key;

  // المقبوضُ **بتاريخ قبضه** لا بتاريخ استحقاقه: الكشفُ يقول ما دخل في هذا الشهر.
  const rows = (deal?.payments || []).filter((p) => p.paidAt && inMonth(p.paidAt));
  const collected = rows.reduce((a, p) => a + (Number(p.amount) || 0), 0);

  // **ولا يُخصم إلّا ما أُنجز**: بلاغٌ مفتوحٌ كلفتُه تقديرٌ لم يُصرَف بعد، وخصمُه من
  // المالك اليومَ مطالبةٌ بمالٍ لم يُدفع. والتاريخُ تاريخُ الإنجاز، فإن غاب فتاريخُ البلاغ.
  const maintenanceRows = (property?.maintenance || [])
    .filter((m) => m.status === 'done' && m.bearer === 'owner' && Number(m.cost) > 0 && inMonth(m.doneAt || m.at));
  const maintenance = maintenanceRows.reduce((a, m) => a + (Number(m.cost) || 0), 0);

  // أجرُ الإدارة يُحسب على ما قُبض فعلًا حين يكون نسبةً — فلا يُستحقّ أجرٌ على مالٍ لم يصل.
  const mgmt = property?.management || null;
  const fee = !mgmt ? 0
    : mgmt.feeType === 'fixed'
      ? (Number(mgmt.feeValue) || 0)
      : Math.round(collected * ((Number(mgmt.feeValue) || 0) / 100));

  return { month: key, collected, rows, fee, maintenance, maintenanceRows, net: collected - fee - maintenance };
}

/**
 * **متأخّراتٌ بحسب المستأجر** لا بحسب العقار.
 *
 * الجدولُ يقول «هذا العقار عليه دفعتان»، ولا يقول «فلانٌ عليه خمسُ دفعاتٍ في ثلاثة
 * عقارات». والمطالبةُ تكون بالشخص لا بالوحدة: مكالمةٌ واحدةٌ تُغني عن ثلاث.
 *
 * ومن لا مستأجرَ مسجَّلًا له يُجمع تحت مفتاحٍ واحد ويُسمَّى باسمه الصريح — لا يُخفى
 * ولا يُنسب إلى أحد.
 */
export function arrearsByTenant(rows, now = Date.now()) {
  const map = new Map();
  for (const r of rows) {
    if (!r.overdueCount) continue;
    const key = r.tenant?.id || '__none__';
    let entry = map.get(key);
    if (!entry) {
      entry = { tenantId: r.tenant?.id || null, tenant: r.tenant || null, count: 0, amount: 0, oldestDueAt: null, rows: [] };
      map.set(key, entry);
    }
    entry.count += r.overdueCount;
    entry.amount += r.overdueAmount;
    entry.rows.push(r);
    for (const p of r.deal?.payments || []) {
      if (p.paidAt || !p.dueAt) continue;
      if (new Date(p.dueAt).getTime() >= now) continue;
      if (!entry.oldestDueAt || String(p.dueAt) < String(entry.oldestDueAt)) entry.oldestDueAt = p.dueAt;
    }
  }
  return [...map.values()].sort((a, b) => b.amount - a.amount || b.count - a.count);
}

/** أيامُ التأخّر عن أقدم دفعةٍ فاتت — أو null إن لم يُعرف تاريخُها. */
export function lateDays(iso, now = Date.now()) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((now - t) / DAY));
}

/**
 * **خطّةُ تجديدٍ مقترَحة** — تُحسب ولا تُنفَّذ، فيراها صاحبُها قبل أن يعتمدها.
 *
 * والتجديدُ عقدان لا عقد: عقدُ إدارتِك مع المالك، وعقدُ الإيجار مع المستأجر. وكانا
 * يُجدَّدان بيدك في شاشتين، فيُنسى أحدُهما.
 *
 * **ولا يُخترع مبلغ**: دفعاتُ السنة القادمة تُبنى على قيمة آخر دفعةٍ مجدوَلة، فإن لم
 * تكن هناك دفعةٌ سابقة فلا دفعاتٍ تُقترح — وتُذكر العلّة صراحةً في `warnings`.
 *
 * @returns {{months, management, lease, warnings: string[]}}
 */
export function renewalPlan({ row, months = 12, now = Date.now() } = {}) {
  const warnings = [];
  const addMonths = (base, n) => {
    const d = new Date(base);
    const day = d.getDate();
    const out = new Date(d.getFullYear(), d.getMonth() + n, day);
    // ٣١ يناير + شهر لا يصير ٣ مارس: يُردّ إلى آخر يومٍ في الشهر المقصود.
    if (out.getDate() !== day) out.setDate(0);
    return out;
  };

  const mgmt = row?.property?.management || null;
  let management = null;
  if (mgmt) {
    // يبدأ الجديدُ من نهاية القديم إن كانت معلومةً ولم تمضِ، وإلّا فمن اليوم.
    const endTime = mgmt.endAt ? new Date(mgmt.endAt).getTime() : NaN;
    const base = Number.isFinite(endTime) && endTime > now ? endTime : now;
    if (!mgmt.endAt) warnings.push('عقد الإدارة بلا نهاية محدَّدة — التجديد يبدأ من اليوم');
    management = { startAt: new Date(base).toISOString(), endAt: addMonths(base, months).toISOString() };
  }

  let lease = null;
  const deal = row?.deal || null;
  const payments = (deal?.payments || []).filter((p) => p.dueAt);
  if (deal) {
    const sorted = payments.slice().sort((a, b) => String(a.dueAt).localeCompare(String(b.dueAt)));
    const last = sorted[sorted.length - 1] || null;
    const amount = Number(last?.amount);
    const endTime = deal.leaseEndAt ? new Date(deal.leaseEndAt).getTime() : NaN;
    const baseEnd = Number.isFinite(endTime) ? endTime : (last ? new Date(last.dueAt).getTime() : now);
    const leaseEndAt = addMonths(baseEnd, months).toISOString();
    const out = [];
    if (last && Number.isFinite(amount) && amount > 0) {
      const from = new Date(last.dueAt).getTime();
      for (let m = 1; m <= months; m++) out.push({ dueAt: addMonths(from, m).toISOString(), amount, note: `تجديد — الشهر ${m}` });
    } else {
      warnings.push('لا دفعةٌ سابقةٌ بمبلغٍ معلوم — لن تُقترح دفعات، أضِفها من صفحة العميل');
    }
    lease = { leaseEndAt, payments: out };
  } else {
    warnings.push('لا عقد إيجارٍ مربوطٌ بهذا العقار — يُجدَّد عقدُ الإدارة وحده');
  }

  return { months, management, lease, warnings };
}
