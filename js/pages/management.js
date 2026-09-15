// صفحة «إدارة الأملاك» (المرحلة ٣٨).
//
// الوساطة تنتهي بالصفقة؛ والإدارة تبدأ بعدها وتستمرّ: إيجارٌ يُحصَّل في موعده، وعقدٌ
// ينتهي فيُجدَّد، وأجرُ إدارةٍ يُستحقّ شهرًا بعد شهر. وهذا العمل كان يعيش في ملاحظات
// العقار، فلا موعد يُنبَّه عليه ولا دخل يُحسب ولا متأخّرٌ يُعرف.
//
// ولا تخترع الصفحة شيئًا: عقد الإدارة في العقار نفسه (يُكتب من نموذجه)، والإيجارُ
// ودفعاتُه في الصفقة المرتبطة به. وهذه تجمعهما وتقول ما يستحقّ انتباهك اليوم.

import { repo } from '../data/repository.js';
import { getLists, typeLabel } from '../data/settings.js';
import { el, clear, badge, emptyState } from '../util/dom.js';
import { formatSAR, formatDate, formatNumber, countWord } from '../util/format.js';
import { formatPhone } from '../util/phone.js';
import { managedRows, managementAlerts, monthlyFeeTotal, STATE_LABEL, FEE_TYPES } from '../util/management.js';

const STATE_CLASS = { expired: 'badge-danger', ending: 'badge-warn', active: 'badge-ok', open: 'badge-outline' };
const personName = (c) => (c ? (c.name || formatPhone(c.phone) || 'بلا اسم') : null);

export async function render(container) {
  clear(container);
  const [properties, deals, clients, lists] = await Promise.all([
    repo.properties.list(), repo.deals.list(), repo.clients.list(), getLists(),
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
        badge(a.text, a.kind === 'expired' || a.kind === 'overdue' ? 'badge-danger' : 'badge-warn'),
        ' ',
        el('a', { href: `#/properties/${a.row.property.id}`, text: placeOf(a.row.property, lists) }),
        a.kind === 'overdue' && a.row.overdueAmount
          ? el('span', { class: 'muted small', text: ` — ${formatSAR(a.row.overdueAmount)}` })
          : null)))
      : el('p', { class: 'muted small', text: 'لا عقد ينتهي قريبًا ولا دفعة متأخّرة. كلُّ شيء في موعده.' })));

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

  /* الجدول */
  const head = ['العقار', 'المالك', 'المستأجر', 'عقد الإدارة', 'الأجر الشهري', 'نهاية الإيجار', 'الدفعة القادمة', 'المتأخّر'];
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
            : el('span', { class: 'muted', text: '—' })))))))); 

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
