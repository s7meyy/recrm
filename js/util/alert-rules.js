/**
 * **قواعدُ التنبيه** (المرحلة ٤٩) — ما يوقظك صار قائمةً تُشغَّل وتُطفَأ، لا فحصين مكتوبين بأيديهما.
 *
 * كان النظام يوقظك بشيئين لا ثالثَ لهما: **عميلٌ لم تتواصل معه**، و**مهمّةٌ حان موعدها**.
 * وهو يعرف أكثرَ من ذلك بكثير ويصمت عنه: عقدُ إيجارٍ ينتهي بعد شهر، ودفعةٌ تأخّرت،
 * وصيانةٌ فُتحت ولم تُغلق، ومعاينةٌ مضت ولم تُقيَّم، وتمويلٌ وقف عند البنك.
 * **كلُّها محسوبةٌ في وحداتٍ قائمة** — ولا واحدةٌ منها كانت تصل إليك إلا أن تفتح صفحتَها.
 *
 * وهذا الملفُّ **حسابٌ خالص**: يقرأ البيانات ويعيد ما يستحقّ تنبيهًا. لا `Notification`
 * ولا `localStorage` ولا مؤقّت — تلك في `follow-up-alerts.js` حيث كانت.
 *
 * **ولكلّ قاعدةٍ مفتاحُ تشغيلٍ في الإعدادات**: من لا يدير أملاكًا يُطفئ تنبيهَ الصيانة،
 * ومن لا يُعاين يُطفئ تنبيهَ التقييم — فلا يصير التنبيهُ ضجيجًا يُتجاهَل كلُّه.
 */

import { needFeedback } from './showings.js';
import { stalledFinancing, STALL_DAYS } from './financing.js';
import { receivables } from './receivables.js';

const DAY = 86400000;

/**
 * القواعد وأوصافُها — تُعرض في الإعدادات كما هي، فما يُشغَّل يُقرأ بلغةٍ مفهومة.
 * و`on` القيمةُ الافتراضية: **المبنيّ قبل هذه المرحلة يبقى مشتغلًا**، والجديدُ يبدأ
 * مطفأً إلّا ما كان عامًّا لكلّ وسيط — فلا يُغرَق أحدٌ بتنبيهاتٍ لم يطلبها.
 */
export const ALERT_RULES = [
  { key: 'staleClient', label: 'عميلٌ لم تتواصل معه', hint: 'تجاوز حدّ عدم التواصل في إعدادات المتابعة.', on: true },
  { key: 'dueTask', label: 'مهمّةٌ حان موعدها', hint: 'مهمّةٌ لها موعدٌ وحلّ.', on: true },
  { key: 'leaseEnding', label: 'عقدُ إيجارٍ ينتهي', hint: 'قبل نهايته بثلاثين يومًا — وقتُ التجديد أو البحث عن مستأجر.', on: true },
  { key: 'overdue', label: 'مستحقٌّ تأخّر', hint: 'فاتورةٌ أو عمولةٌ أو دفعةٌ مضى استحقاقُها.', on: true },
  { key: 'financeStalled', label: 'تمويلٌ وقف عند البنك', hint: 'حالةٌ مفتوحةٌ لم تتحرّك أسبوعًا.', on: true },
  { key: 'delivery', label: 'تسليمُ وحدةٍ على الخارطة يقترب', hint: 'قبل التسليم المتعهَّد به بثلاثين يومًا — وقتُ التأكّد من المطوِّر قبل أن يسأل المشتري.', on: true },
  { key: 'openMaintenance', label: 'صيانةٌ فُتحت ولم تُغلق', hint: 'بلاغُ مستأجرٍ مضى عليه أسبوعٌ بلا إنجاز — لمن يدير أملاكًا.', on: false },
  { key: 'showingFeedback', label: 'معاينةٌ مضت بلا تقييم', hint: 'رأيُ العميل بعد المعاينة أصدقُ ما يُقال عن العرض.', on: false },
];

export const DEFAULT_ALERT_RULES = Object.fromEntries(ALERT_RULES.map((r) => [r.key, r.on]));

/** أهي مشتغلة؟ والمفتاحُ الغائبُ يأخذ الافتراضيّ — فقاعدةٌ جديدةٌ لا تُطفَأ بصمت. */
export const ruleOn = (enabled, key) => (enabled?.[key] === undefined ? !!DEFAULT_ALERT_RULES[key] : !!enabled[key]);

/** عقودُ الإيجار التي توشك — من الصفقات، حيث تُسجَّل نهايةُ العقد. */
export function endingLeases(deals = [], { days = 30, now = Date.now() } = {}) {
  return deals
    .filter((d) => d.leaseEndAt)
    .map((d) => ({ deal: d, days: Math.floor((new Date(d.leaseEndAt).getTime() - now) / DAY) }))
    .filter((x) => Number.isFinite(x.days) && x.days >= 0 && x.days <= days)
    .sort((a, b) => a.days - b.days);
}

/**
 * بلاغاتُ الصيانة المفتوحة منذ أكثر من الحدّ.
 * **والمفتوحُ هو ما ليست حالتُه `done`** — وبلا تاريخٍ يُعدّ قديمًا لا جديدًا: بلاغٌ
 * لا يُعرف متى فُتح أحقُّ بالسؤال، لا أقلّ.
 */
export function openMaintenance(properties = [], { days = 7, now = Date.now() } = {}) {
  const out = [];
  for (const p of properties) {
    for (const m of p.maintenance || []) {
      if (m.status === 'done' || m.status === 'cancelled') continue;
      const at = m.at ? new Date(m.at).getTime() : null;
      const age = at && Number.isFinite(at) ? Math.floor((now - at) / DAY) : null;
      if (age != null && age < days) continue;
      out.push({ property: p, item: m, days: age });
    }
  }
  return out.sort((a, b) => (a.days == null ? 1 : 0) - (b.days == null ? 1 : 0) || (b.days ?? 0) - (a.days ?? 0));
}

/**
 * يُقيّم القواعد المشتغلة ويعيد ما يستحقّ تنبيهًا.
 *
 * وكلُّ تنبيهٍ يحمل **`id` ثابتًا** لا يتغيّر بين فحصٍ وفحص — به يُمنع التكرار في
 * الطبقة التي تعرض. ولو بُني من الوقت لتكرّر التنبيهُ نفسُه كلَّ نصف ساعة.
 *
 * @returns {[{ rule, id, title, body, hash }]}
 */
export function evaluateRules({
  clients = [], tasks = [], deals = [], properties = [], invoices = [], showings = [],
} = {}, { enabled = {}, staleContactDays = 14, lastContactOf = () => null, countOf = (n, w) => `${n} ${w}`, now = Date.now() } = {}) {
  const out = [];
  const on = (key) => ruleOn(enabled, key);

  if (on('staleClient')) {
    const late = clients.filter((c) => {
      if (c.doNotContact || ['won', 'closed'].includes(c.stage)) return false;
      const last = lastContactOf(c);
      if (!last) return true;
      return now - new Date(last).getTime() > staleContactDays * DAY;
    });
    for (const c of late) {
      out.push({
        rule: 'staleClient', id: `stale:${c.id}`,
        title: 'عميل يحتاج متابعة',
        body: `${c.name || 'عميل بلا اسم'} لم يُتواصل معه منذ أكثر من ${countOf(staleContactDays, 'يوم')}.`,
        hash: `#/clients/${c.id}`,
      });
    }
  }

  if (on('dueTask')) {
    for (const t of tasks) {
      if (t.done || !t.dueAt || t.reminded) continue;
      if (new Date(t.dueAt).getTime() > now) continue;
      out.push({ rule: 'dueTask', id: `task:${t.id}`, title: 'تذكير بمهمة', body: t.title, hash: `#/tasks/${t.id}` });
    }
  }

  if (on('leaseEnding')) {
    for (const { deal, days } of endingLeases(deals, { now })) {
      out.push({
        rule: 'leaseEnding', id: `lease:${deal.id}:${deal.leaseEndAt}`,
        title: 'عقد إيجار ينتهي',
        body: days === 0 ? 'ينتهي اليوم — التجديد أو البحث عن مستأجر.' : `ينتهي بعد ${countOf(days, 'يوم')}.`,
        hash: `#/deals/${deal.id}`,
      });
    }
  }

  if (on('delivery')) {
    for (const p of properties) {
      if (!p.offPlan || !p.deliveryAt) continue;
      const days = Math.floor((new Date(p.deliveryAt).getTime() - now) / DAY);
      if (!Number.isFinite(days) || days < 0 || days > 30) continue;
      out.push({
        rule: 'delivery', id: `deliver:${p.id}:${p.deliveryAt}`,
        title: 'تسليمٌ يقترب',
        body: `${[p.district, p.city].filter(Boolean).join('، ')} — ${days === 0 ? 'التسليمُ اليوم' : `بعد ${countOf(days, 'يوم')}`}.`,
        hash: `#/properties/${p.id}`,
      });
    }
  }

  if (on('overdue')) {
    const { rows } = receivables({ invoices, deals }, new Date(now));
    const late = rows.filter((r) => r.days > 0 && r.remaining > 0);
    if (late.length) {
      // **تنبيهٌ واحدٌ للكلّ لا واحدٌ لكلّ فاتورة**: عشرون تنبيهًا في دقيقةٍ تُغلق
      // الإشعارات كلَّها، ولا يُقرأ منها شيء. والرقمُ يقول ما يكفي.
      out.push({
        rule: 'overdue', id: `overdue:${late.length}:${new Date(now).toISOString().slice(0, 10)}`,
        title: 'مستحقات تأخّرت',
        body: `${countOf(late.length, 'مستحق')} مضى موعدُه. افتح الفواتير للمطالبة.`,
        hash: '#/invoices',
      });
    }
  }

  if (on('financeStalled')) {
    for (const { deal, days } of stalledFinancing(deals, { days: STALL_DAYS, now })) {
      out.push({
        rule: 'financeStalled', id: `fin:${deal.id}:${deal.financeStage}`,
        title: 'تمويل وقف عند البنك',
        body: days == null ? 'حالةُ تمويلٍ مفتوحةٌ بلا تاريخ حركة.' : `لم تتحرّك منذ ${countOf(days, 'يوم')}.`,
        hash: `#/deals/${deal.id}`,
      });
    }
  }

  if (on('openMaintenance')) {
    for (const { property, item, days } of openMaintenance(properties, { now })) {
      out.push({
        rule: 'openMaintenance', id: `maint:${property.id}:${item.id}`,
        title: 'صيانة لم تُغلق',
        body: `${item.what || 'بلاغ صيانة'} — ${[property.district, property.city].filter(Boolean).join('، ')}`
          + (days == null ? '' : ` · منذ ${countOf(days, 'يوم')}`),
        hash: `#/management`,
      });
    }
  }

  if (on('showingFeedback')) {
    // `needFeedback` تُعيد `{ showing, at }` لا المعاينةَ نفسَها.
    for (const { showing } of needFeedback(showings, { now })) {
      out.push({
        rule: 'showingFeedback', id: `showing:${showing.id}`,
        title: 'معاينة بلا تقييم',
        body: 'مضت المعاينةُ ولم يُسجَّل رأيُ العميل — وهو أصدقُ ما يُقال عن العرض.',
        hash: '#/tours',
      });
    }
  }

  return out;
}
