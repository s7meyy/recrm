// صفحة «إدارة الأملاك» (المرحلة ٣٨).
//
// الوساطة تنتهي بالصفقة؛ والإدارة تبدأ بعدها وتستمرّ: إيجارٌ يُحصَّل في موعده، وعقدٌ
// ينتهي فيُجدَّد، وأجرُ إدارةٍ يُستحقّ شهرًا بعد شهر. وهذا العمل كان يعيش في ملاحظات
// العقار، فلا موعد يُنبَّه عليه ولا دخل يُحسب ولا متأخّرٌ يُعرف.
//
// ولا تخترع الصفحة شيئًا: عقد الإدارة في العقار نفسه (يُكتب من نموذجه)، والإيجارُ
// ودفعاتُه في الصفقة المرتبطة به. وهذه تجمعهما وتقول ما يستحقّ انتباهك اليوم.

import { repo } from '../data/repository.js';
import { getLists, typeLabel, getCompany } from '../data/settings.js';
import { el, clear, badge, emptyState, selectEl, labeled, openModal, confirmDialog, toast } from '../util/dom.js';
import { formatSAR, formatDate, formatNumber, countWord, countOf, daysWord } from '../util/format.js';
import { formatPhone } from '../util/phone.js';
import {
  managedRows, managementAlerts, monthlyFeeTotal, STATE_LABEL, FEE_TYPES,
  ownerStatement, arrearsByTenant, lateDays, renewalPlan, bearerLabel, maintenanceLabel,
  feePosted, feeIncomeDraft, buildingGroups,
} from '../util/management.js';
import { normalizeArabic } from '../util/arabic.js';
import { printOwnerStatement, printOwnerActivity } from '../util/property-print.js';
import { ownerActivity, activityHeadline } from '../util/owner-report.js';
import { labelFor, ENUMS } from '../data/schema.js';

const STATE_CLASS = { expired: 'badge-danger', ending: 'badge-warn', active: 'badge-ok', open: 'badge-outline' };
const ALERT_CLASS = { expired: 'badge-danger', overdue: 'badge-danger', ending: 'badge-warn', maintenance: 'badge-warn' };
const personName = (c) => (c ? (c.name || formatPhone(c.phone) || 'بلا اسم') : null);

export async function render(container) {
  clear(container);
  const [properties, deals, clients, lists, company, incomes, showings, matches] = await Promise.all([
    repo.properties.list(), repo.deals.list(), repo.clients.list(), getLists(), getCompany(),
    // قيدُ أجر الإدارة وتقريرُ النشاط (المرحلة ٤٨)
    repo.incomes.list(), repo.showings.list(), repo.matches.list(),
  ]);
  const clientMap = new Map(clients.map((c) => [c.id, c]));
  const rows = managedRows({ properties, deals, clientMap });

  container.append(el('div', { class: 'page-head' },
    el('h1', {}, 'إدارة الأملاك ', el('span', { class: 'count', text: `(${formatNumber(rows.length)})` }))));

  if (!rows.length) {
    container.append(emptyState(
      'لا عقار تحت إدارتك بعد. أشِّر على «هذا العقار تحت إدارتنا» في نموذج أي عقار، فيظهر هنا بعقده وأجره ودفعاته.',
      el('a', { class: 'btn btn-primary', href: '#/properties', text: 'افتح العقارات' })));
    return;
  }

  /* ما يستحقّ انتباهك اليوم — قبل الجدول، فالجدول يُقرأ والمتأخّر يُعالَج */
  const alerts = managementAlerts(rows);
  container.append(el('section', { class: 'panel' },
    el('h2', { text: 'ما يستحقّ انتباهك' }),
    alerts.length
      ? el('ul', { class: 'simple-list' }, alerts.map((a) => el('li', {},
        badge(a.text, ALERT_CLASS[a.kind] || 'badge-warn'),
        ' ',
        el('a', { href: `#/properties/${a.row.property.id}`, text: placeOf(a.row.property, lists) }),
        a.kind === 'overdue' && a.row.overdueAmount
          ? el('span', { class: 'muted small', text: ` — ${formatSAR(a.row.overdueAmount)}` })
          : null)))
      : el('p', { class: 'muted small', text: 'لا عقد ينتهي قريبًا ولا دفعة متأخّرة ولا بلاغ صيانة مفتوح. كلُّ شيء في موعده.' })));

  /* المتأخّرات بحسب المستأجر — المطالبةُ بالشخص لا بالوحدة */
  const arrears = arrearsByTenant(rows);
  if (arrears.length) {
    container.append(el('section', { class: 'panel' },
      el('h2', { text: 'المتأخّرات بحسب المستأجر' }),
      el('p', { class: 'muted small', text: 'مكالمةٌ واحدةٌ لصاحبها تُغني عن مكالمةٍ لكل وحدة. والمبالغُ مجموعةٌ من دفعات الصفقات، لا تُكتب هنا.' }),
      el('div', { class: 'table-wrap' }, el('table', { class: 'table' },
        el('thead', {}, el('tr', {}, ['المستأجر', 'الجوال', 'دفعات فائتة', 'المبلغ', 'أقدم دفعة', 'العقارات'].map((h) => el('th', { text: h })))),
        el('tbody', {}, arrears.map((a) => {
          const late = lateDays(a.oldestDueAt);
          return el('tr', {},
            el('td', {}, a.tenant
              ? el('a', { href: `#/clients/${a.tenant.id}`, text: personName(a.tenant) })
              : el('span', { class: 'muted', text: 'بلا مستأجر مسجَّل' })),
            el('td', { class: 'ltr', text: a.tenant?.phone ? formatPhone(a.tenant.phone) : '—' }),
            el('td', { text: formatNumber(a.count) }),
            el('td', { 'data-sensitive': '' }, badge(formatSAR(a.amount), 'badge-danger')),
            el('td', {}, a.oldestDueAt
              ? el('span', {}, formatDate(a.oldestDueAt), late ? el('span', { class: 'muted small', text: ` · تأخّر ${daysWord(late)}` }) : null)
              : el('span', { class: 'muted', text: '—' })),
            el('td', {}, a.rows.map((r, i) => el('span', {},
              i ? '، ' : '',
              el('a', { href: `#/properties/${r.property.id}`, text: placeOf(r.property, lists) })))));
        }))))));
  }

  /* الأجر الشهري المتكرّر: دخلٌ لا يظهر في العمولات */
  const feeTotal = monthlyFeeTotal(rows);
  const unknownFee = rows.filter((r) => r.fee == null).length;
  container.append(el('div', { class: 'stat-strip' },
    stat('عقارات تحت الإدارة', formatNumber(rows.length)),
    stat('أجر الإدارة الشهري', feeTotal ? formatSAR(feeTotal) : '—', unknownFee
      ? `${countWord(unknownFee, ['عقار واحد', 'عقاران', 'عقارات', 'عقارًا'])} بلا أجرٍ معلوم — لا يدخل المجموع`
      : 'مجموع أجور العقود المعلومة'),
    stat('عقود تنتهي خلال شهر', formatNumber(rows.filter((r) => r.state === 'ending').length)),
    stat('دفعات متأخّرة', formatNumber(rows.reduce((s, r) => s + r.overdueCount, 0)))));

  /* المباني (المرحلة ٤٨): عشرون شقّةً في عمارةٍ كانت عشرين سطرًا لا يعرف بعضُها بعضًا */
  const buildings = buildingGroups(rows, { normalize: normalizeArabic });
  if (buildings.length) {
    container.append(el('section', { class: 'panel' },
      el('h2', { text: 'المباني' }),
      el('p', { class: 'muted small', text: 'وحداتٌ تحمل اسمَ المبنى نفسَه تُجمع هنا. وما لم يُكتب له مبنًى يبقى في الجدول أدناه وحده.' }),
      el('div', { class: 'table-wrap' }, el('table', { class: 'table' },
        el('thead', {}, el('tr', {}, ['المبنى', 'الوحدات', 'مؤجَّرة', 'شاغرة', 'الأجر الشهري', 'متأخّرات', 'صيانة مفتوحة', 'أوّل عقدٍ ينتهي'].map((h) => el('th', { text: h })))),
        el('tbody', {}, buildings.map((b) => el('tr', {},
          el('td', { class: 'strong', text: b.name }),
          el('td', { class: 'num', text: formatNumber(b.units) }),
          el('td', { class: 'num', text: formatNumber(b.leased) }),
          el('td', { class: 'num' }, b.vacant
            ? badge(formatNumber(b.vacant), 'badge-warn')
            : el('span', { class: 'muted', text: '—' })),
          el('td', { class: 'num', 'data-sensitive': '' }, b.monthlyFee ? formatSAR(b.monthlyFee) : el('span', { class: 'muted', text: '—' })),
          el('td', { class: 'num', 'data-sensitive': '' }, b.overdueCount
            ? badge(`${formatNumber(b.overdueCount)} · ${formatSAR(b.overdueAmount)}`, 'badge-danger')
            : el('span', { class: 'muted', text: '—' })),
          el('td', { class: 'num' }, b.openMaintenance
            ? badge(formatNumber(b.openMaintenance), 'badge-warn')
            : el('span', { class: 'muted', text: '—' })),
          el('td', { text: b.nextVacancy ? formatDate(b.nextVacancy) : '—' })))))),
      el('p', { class: 'muted small', text: '«مؤجَّرة» = لها عقدٌ ومستأجرٌ مسجَّل — لا ما كُتبت حالتُه «مؤجَّر»، فالحالةُ تُنسى والعقدُ لا يُنسى.' })));
  }

  /* شهرُ الكشف: يُختار مرّةً ويُطبع لأيّ مالك — والافتراضُ الشهرُ الماضي، فهو الذي يُسلَّم كشفُه */
  const monthInput = el('input', { class: 'input', type: 'month', value: defaultMonth(), style: { maxWidth: '180px' } });
  container.append(el('div', { class: 'row', style: { alignItems: 'flex-end', gap: '8px', marginBottom: '8px' } },
    el('label', { class: 'field' },
      el('span', { class: 'field-label', text: 'شهر كشف المالك' }),
      monthInput),
    el('span', { class: 'muted small', text: 'يُطبع من زرّ 🧾 في صفّ العقار: المقبوضُ في هذا الشهر، ناقصَ أجرِ الإدارة وصيانةِ المالك.' })));

  /* الجدول */
  const head = ['العقار', 'المالك', 'المستأجر', 'عقد الإدارة', 'الأجر الشهري', 'نهاية الإيجار', 'الدفعة القادمة', 'المتأخّر', 'الصيانة', 'إجراءات'];
  container.append(el('div', { class: 'table-wrap' },
    el('table', { class: 'table' },
      el('thead', {}, el('tr', {}, head.map((h) => el('th', { text: h })))),
      el('tbody', {}, rows
        .slice()
        .sort((a, b) => rank(a) - rank(b))
        .map((r) => el('tr', {},
          el('td', {}, el('a', { href: `#/properties/${r.property.id}`, text: placeOf(r.property, lists) })),
          el('td', { text: personName(r.owner) || '—' }),
          el('td', { text: personName(r.tenant) || 'لا مستأجر مسجَّل' }),
          el('td', {},
            badge(STATE_LABEL[r.state], STATE_CLASS[r.state] || ''),
            r.property.management?.endAt
              ? el('div', { class: 'muted small', text: `حتى ${formatDate(r.property.management.endAt)}` })
              : null),
          // الأجر حسّاسٌ كالعمولة: يُخفى في وضع العرض للعميل وعن المساعد.
          el('td', { 'data-sensitive': '' },
            r.fee == null ? el('span', { class: 'muted', text: '—' }) : formatSAR(r.fee),
            el('div', { class: 'muted small', text: feeText(r.property.management) })),
          el('td', { text: r.leaseEndAt ? formatDate(r.leaseEndAt) : '—' }),
          el('td', {}, r.nextDue
            ? el('span', {}, formatDate(r.nextDue.dueAt), el('span', { class: 'muted small', text: ` · ${formatSAR(r.nextDue.amount)}` }))
            : el('span', { class: 'muted', text: '—' })),
          el('td', { 'data-sensitive': '' }, r.overdueCount
            ? badge(`${formatNumber(r.overdueCount)} · ${formatSAR(r.overdueAmount)}`, 'badge-danger')
            : el('span', { class: 'muted', text: '—' })),
          el('td', {}, maintenanceCell(r)),
          el('td', { class: 'row' },
            el('button', {
              type: 'button', class: 'icon-btn', text: '🧾', title: 'اطبع كشف حساب المالك لهذا الشهر',
              onClick: () => printOwnerStatement({
                property: r.property,
                owner: r.owner,
                statement: ownerStatement({ property: r.property, deal: r.deal, month: monthInput.value }),
                lists, company,
              }),
            }),
            el('button', {
              type: 'button', class: 'icon-btn', text: '♻️', title: 'جدِّد عقد الإدارة والإيجار',
              onClick: () => renew(r, lists),
            }),
            // **دخلُ الإدارة يدخل دفترك** (المرحلة ٤٨): كان يُحسب ويُطبع ولا يُقيَّد،
            // فيرى الداشبوردُ عمولاتِك ولا يرى أثبتَ دخلٍ عندك.
            feeButton(r, { incomes, monthInput, lists }),
            // **«ماذا فعلتم لعقاري؟»** — ورقةٌ تجمع ما هو متفرّقٌ في خمسة مواضع.
            el('button', {
              type: 'button', class: 'icon-btn', text: '📈', title: 'تقرير نشاط يُسلَّم للمالك',
              onClick: () => {
                const act = ownerActivity({ property: r.property, showings, matches });
                act.headline = activityHeadline(act, { countOf, daysWord });
                return printOwnerActivity({
                  property: r.property, owner: r.owner, activity: act, lists, company,
                  reasonLabel: (k) => labelFor(ENUMS.matchRejectReasons, k),
                });
              },
            })))))))); 

  container.append(el('p', { class: 'muted small' },
    'الدفعات والمستأجر ونهاية الإيجار تُقرأ من الصفقة المرتبطة بالعقار — تُعدَّل من صفحة الصفقات، ',
    'وعقدُ الإدارة وأجرُه يُعدَّلان من نموذج العقار نفسه. ولا شيء هنا يُكتب مرّتين.'));
}

/* الأعجل أوّلًا: انتهى، فمتأخّر، فينتهي قريبًا، ثم الباقي */
function rank(r) {
  if (r.state === 'expired') return 0;
  if (r.overdueCount) return 1;
  if (r.state === 'ending') return 2;
  return 3;
}

function feeText(m) {
  if (!m || m.feeValue == null) return 'الأجر غير مُدخل';
  const label = FEE_TYPES.find((f) => f.key === m.feeType)?.label || '';
  return m.feeType === 'percent' ? `${m.feeValue}٪ — ${label}` : label;
}

function placeOf(p, lists) {
  return [typeLabel(lists, p.type), p.district, p.city].filter(Boolean).join(' · ') || 'عقار بلا وصف';
}

function stat(label, value, hint = '') {
  return el('div', { class: 'stat-chip' },
    el('div', { class: 'stat-num', text: value }),
    el('div', { class: 'stat-label', text: label }),
    hint ? el('div', { class: 'muted small', text: hint }) : null);
}

/* الشهرُ الماضي: كشفُ الشهر الجاري ناقصٌ ما دام لم ينتهِ. */
function defaultMonth() {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function maintenanceCell(r) {
  const open = r.openMaintenance || [];
  const all = r.property.maintenance || [];
  if (!all.length) return el('span', { class: 'muted', text: '—' });
  if (!open.length) return el('span', { class: 'muted small', text: `${countWord(all.length, ['بلاغ واحد', 'بلاغان', 'بلاغات', 'بلاغًا'])} · كلُّها أُنجزت` });
  return el('span', {},
    badge(countWord(open.length, ['بلاغ مفتوح', 'بلاغان مفتوحان', 'بلاغات مفتوحة', 'بلاغًا مفتوحًا']), 'badge-warn'),
    el('div', { class: 'muted small', text: open.slice(0, 2).map((m) => `${m.what} — على ${bearerLabel(m.bearer)} · ${maintenanceLabel(m.status)}`).join(' · ') }));
}

/**
 * **التجديدُ بنقرة** — ويُعرض قبل أن يُنفَّذ.
 *
 * العقدان يُجدَّدان معًا: إدارتُك مع المالك، وإيجارُ المستأجر. وما لا يُعرف مبلغُه لا
 * يُخترع له مبلغ، ويُقال ذلك في نصّ التأكيد نفسه قبل الاعتماد.
 */
async function renew(r, lists) {
  // **التجديدُ هو اللحظةُ التي تُراجَع فيها الأجرة** (المرحلة ٤٨): تُسأل النسبةُ أوّلًا
  // وافتراضُها صفر، **ولا تُقترح نسبةٌ من عندنا** — تلك مسألةُ سوقٍ ونظامٍ لا حساب.
  const increaseInput = el('input', { class: 'input', type: 'number', min: '0', max: '100', step: '2.5', value: '0' });
  const preview = el('p', { class: 'muted small' });
  const base = renewalPlan({ row: r });
  const lastAmount = base.lease?.payments?.[0]?.amount || null;
  const drawPreview = () => {
    const pct = Math.min(100, Math.max(0, Number(increaseInput.value) || 0));
    preview.textContent = !lastAmount
      ? 'لا دفعةٌ سابقةٌ بمبلغٍ معلوم — فلا زيادةَ تُحسب.'
      : pct > 0
        ? `الدفعة الشهرية: ${formatSAR(lastAmount)} ← ${formatSAR(Math.round(lastAmount * (1 + pct / 100)))}`
        : `الدفعة الشهرية تبقى ${formatSAR(lastAmount)} — صفرٌ = تجديدٌ بالأجرة نفسِها.`;
  };
  increaseInput.addEventListener('input', drawPreview);
  drawPreview();

  // **يُحسم الجوابُ قبل الإغلاق لا بعده**: `close()` تُطلق `onClose`، فلو أُغلقت أوّلًا
  // لسبق `resolve(null)` جوابَ الزرّ — ووَعدٌ لا يُحسم مرّتين، فيضيع ما اختاره صاحبُه.
  const asked = await new Promise((resolve) => {
    let picked = null;
    const m = openModal({
      title: `تجديد ١٢ شهرًا — ${placeOf(r.property, lists)}`,
      body: el('div', {},
        el('div', { class: 'form-grid' }, labeled('زيادة الأجرة (٪)', increaseInput, { hint: 'افتراضُها صفر — والقرار قرارك' })),
        preview),
      onClose: () => resolve(picked),
      footer: [
        el('button', { type: 'button', class: 'btn btn-ghost', text: 'إلغاء', onClick: () => m.close() }),
        el('button', {
          type: 'button', class: 'btn btn-primary', text: 'اعرض الخطّة',
          onClick: () => { picked = Number(increaseInput.value) || 0; m.close(); },
        }),
      ],
    });
  });
  if (asked == null) return;

  const plan = renewalPlan({ row: r, increasePct: asked });
  const lines = [];
  if (plan.management) lines.push(`عقد الإدارة يمتدّ حتى ${formatDate(plan.management.endAt)}.`);
  if (plan.lease) {
    lines.push(`عقد الإيجار يمتدّ حتى ${formatDate(plan.lease.leaseEndAt)}.`);
    if (plan.lease.payments.length) {
      lines.push(`تُضاف ${countWord(plan.lease.payments.length, ['دفعة واحدة', 'دفعتان', 'دفعات', 'دفعةً'])} بقيمة ${formatSAR(plan.lease.payments[0].amount)} شهريًّا`
        + (plan.increasePct > 0 ? ` (بزيادة ${formatNumber(plan.increasePct)}٪).` : '.'));
    }
  }
  for (const w of plan.warnings) lines.push(`تنبيه: ${w}.`);
  if (!plan.management && !plan.lease) { toast('لا شيء يُجدَّد: لا عقد إدارةٍ ولا عقد إيجار.', 'warn'); return; }

  const ok = await confirmDialog({
    title: `تجديد ١٢ شهرًا — ${placeOf(r.property, lists)}`,
    message: lines.join('\n'),
    confirmText: 'جدِّد',
  });
  if (!ok) return;

  if (plan.management) {
    await repo.properties.update(r.property.id, {
      management: { ...r.property.management, startAt: plan.management.startAt, endAt: plan.management.endAt },
    });
  }
  if (plan.lease && r.deal) {
    await repo.deals.update(r.deal.id, {
      leaseEndAt: plan.lease.leaseEndAt,
      payments: [...(r.deal.payments || []), ...plan.lease.payments],
    });
  }
  toast('جُدِّد. أُعيد تحميل الصفحة لتظهر المواعيد الجديدة.', 'success');
  const host = document.querySelector('#page');
  if (host) await render(host);
}


/**
 * **زرُّ قيدِ أجر الإدارة إيرادًا** — بقرارك، ومرّةً واحدةً لكلّ شهرٍ وعقار.
 *
 * ولا يُقيَّد تلقائيًّا مع طباعة الكشف: الطباعةُ قد تتكرّر للمراجعة، والقيدُ لا يُراجَع
 * بتكرار. **والعلامةُ على أنّه قُيِّد هي القيدُ نفسُه** — بحثٌ عن إيرادِ إدارةٍ لهذا
 * العقار في هذا الشهر — فلا تفترق حقيقتان في سجلّين.
 */
function feeButton(row, { incomes, monthInput, lists }) {
  const btn = el('button', { type: 'button', class: 'icon-btn', text: '💰' });
  const paint = () => {
    const month = monthInput.value;
    const st = ownerStatement({ property: row.property, deal: row.deal, month });
    const done = feePosted(incomes, row.property.id, month);
    btn.disabled = !(st.fee > 0) || done;
    btn.title = done
      ? `أجرُ ${month} مقيَّدٌ في المالية — ولا يُقيَّد مرّتين`
      : st.fee > 0
        ? `قيِّد ${formatSAR(st.fee)} إيرادَ إدارةٍ عن ${month}`
        : `لا أجرَ مستحقٌّ عن ${month} — فلا شيء يُقيَّد`;
    btn.textContent = done ? '✅' : '💰';
  };
  monthInput.addEventListener('input', paint);
  btn.addEventListener('click', async () => {
    const month = monthInput.value;
    const st = ownerStatement({ property: row.property, deal: row.deal, month });
    const draft = feeIncomeDraft({ property: row.property, statement: st, ownerName: row.owner?.name || '' });
    if (!draft) return;
    const ok = await confirmDialog({
      title: 'قيد إيراد إدارة',
      message: `يُضاف إلى «المالية» إيرادٌ بـ${formatSAR(draft.amount)} باسم «${draft.note}»،\n`
        + `بتاريخ آخر يومٍ في ${month} لا بتاريخ اليوم — فأجرُ الشهر أجرُ شهره.\n\n`
        + 'وهذا قيدٌ في دفترك أنت، لا مطالبةً للمالك ولا صرفًا.',
      confirmText: 'قيِّده',
    });
    if (!ok) return;
    try {
      await repo.incomes.create(draft);
      toast('قُيِّد الإيراد — يظهر في «المالية» وفي صافي الداشبورد', 'success', 5000);
      window.dispatchEvent(new CustomEvent('kassab:data-changed'));
      const host = document.querySelector('#page');
      if (host) await render(host);
    } catch (err) { toast(err.message || 'تعذّر القيد', 'error'); }
  });
  paint();
  return btn;
}
