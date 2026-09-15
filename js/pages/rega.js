// صفحة «عقود الوساطة وتراخيص الإعلانات» (المرحلة ٤٠).
//
// عملٌ نظاميٌّ لا تسويقيّ: عقدُ الوساطة مكتوبٌ ومحدَّد المدّة ومودَعٌ لدى الهيئة، وترخيصُ
// الإعلان يُصدَر لكل عقارٍ تُعلن عنه ويُكتب رقمُه في الإعلان. وكان هذا كلُّه في ذاكرتك
// وملفّاتك: عقدٌ ينتهي فلا تدري، وإعلانٌ يمضي بلا ترخيص فتقع المخالفة.
//
// **وما لا تفعله هذه الصفحة يُقال في أوّلها لا في حاشية:** لا تُصدِر ترخيصًا ولا توثّق
// عقدًا ولا تستعلم آليًّا. الهيئة لا تفتح واجهةً برمجية عامة لذلك. فهذه **تتبُّعٌ وتنبيهٌ
// ومنعُ إعلانٍ بلا ترخيص**، ومعها روابطُ مباشرة إلى خدمات الهيئة نفسها — بلا اشتراكٍ
// ولا مفتاح.

import { repo } from '../data/repository.js';
import { getLists, typeLabel, getCompany } from '../data/settings.js';
import { ENUMS, labelFor } from '../data/schema.js';
import { el, clear, badge, toast, emptyState, allChip } from '../util/dom.js';
import { formatDate, formatNumber, countWord, daysWord } from '../util/format.js';
import { formatPhone } from '../util/phone.js';
import {
  complianceRows, byUrgency, summary, STATE_LABEL, REGA_LINKS, falState,
  adDisclosure, DEFAULT_CONTRACT_DAYS,
} from '../util/rega.js';

const STATE_CLASS = { expired: 'badge-danger', soon: 'badge-warn', none: 'badge-outline', active: 'badge-ok' };

/** ما تُفرَز به الصفحة — كلٌّ منها سؤالٌ يُسأل فعلًا. */
const FILTERS = [
  { key: 'blocked', label: 'لا يصلح للإعلان', test: (r) => r.blockers.length > 0 },
  { key: 'noContract', label: 'بلا عقد', test: (r) => r.contract.state === 'none' },
  { key: 'contractSoon', label: 'عقدٌ يوشك', test: (r) => r.contract.state === 'soon' },
  { key: 'contractExpired', label: 'عقدٌ انتهى', test: (r) => r.contract.state === 'expired' },
  { key: 'noLicense', label: 'بلا ترخيص إعلان', test: (r) => r.license.state === 'none' },
  { key: 'licenseSoon', label: 'ترخيصٌ يوشك', test: (r) => r.license.state === 'soon' },
  { key: 'licenseExpired', label: 'ترخيصٌ انتهى', test: (r) => r.license.state === 'expired' },
  { key: 'ok', label: 'مستوفٍ', test: (r) => r.blockers.length === 0 },
];

export async function render(container) {
  clear(container);
  const ctx = { container, rows: [], lists: null, company: null, clientMap: new Map(), filters: new Set(), nodes: {} };
  await load(ctx);

  container.append(el('div', { class: 'page-head' },
    el('h1', {}, 'عقود الوساطة وتراخيص الإعلانات'),
    el('div', { class: 'head-actions' },
      el('a', { class: 'btn btn-ghost btn-sm', href: '#/properties', text: 'العقارات' }))));

  container.append(
    honestyNotice(),
    falPanel(ctx),
    summaryPanel(ctx),
    linksPanel(),
  );

  ctx.nodes.filters = el('div', { class: 'filters' });
  ctx.nodes.table = el('div');
  container.append(el('section', { class: 'panel' },
    el('h2', {}, 'عقاراتك ', ctx.nodes.count = el('span', { class: 'count' })),
    ctx.nodes.filters,
    ctx.nodes.table));

  renderFilters(ctx);
  renderTable(ctx);

  container.append(el('p', { class: 'muted small' },
    'العقد ونطاقه ورقمه وترخيص الإعلان تُكتب في نموذج العقار نفسه — تُفتح من اسم العقار هنا. ',
    'ولا شيء يُكتب مرّتين.'));
}

async function load(ctx) {
  const [properties, clients, lists, company] = await Promise.all([
    repo.properties.list(), repo.clients.list(), getLists(), getCompany(),
  ]);
  ctx.lists = lists;
  ctx.company = company;
  ctx.clientMap = new Map(clients.map((c) => [c.id, c]));
  ctx.rows = byUrgency(complianceRows(properties, { defaultDays: company.agreementDurationDays || DEFAULT_CONTRACT_DAYS }));
}

/* ===== ما يفعله وما لا يفعله ===== */

function honestyNotice() {
  return el('div', { class: 'notice' },
    el('strong', { text: 'ما تفعله هذه الصفحة: ' }),
    'تتبّع عقودك وتراخيصك، وتنبّهك قبل أن تنتهي، وتقول لك بالضبط ما يمنع الإعلان عن كل عقار. ',
    el('strong', { text: 'وما لا تفعله: ' }),
    'لا تُصدِر ترخيصًا ولا توثّق عقدًا ولا تستعلم آليًّا — ',
    'الهيئة لا تفتح واجهةً برمجية عامة لذلك، والإصدار يبقى بحسابك في منصّتها. ',
    'والروابط أدناه تفتح الخدمة نفسها مباشرةً.');
}

/* ===== رخصة فال للمنشأة ===== */

function falPanel(ctx) {
  const st = falState(ctx.company);
  const body = el('div');
  if (st.state === 'none') {
    body.append(
      el('p', { class: 'field-hint', text: 'رقم رخصة فال غير مسجَّل. اكتبه في الإعدادات ← بيانات الشركة، فيظهر في عقودك وإعلاناتك.' }),
      el('a', { class: 'btn btn-sm', href: '#/settings', text: 'افتح الإعدادات' }));
  } else {
    body.append(el('div', { class: 'row', style: { gap: '10px', alignItems: 'center', flexWrap: 'wrap' } },
      el('span', { class: 'ltr strong', text: st.number }),
      badge(STATE_LABEL[st.state], STATE_CLASS[st.state]),
      st.undated
        ? el('span', { class: 'muted small', text: 'تاريخ الانتهاء غير مسجَّل — أضِفه في الإعدادات ليُنبَّه عليك قبله' })
        : el('span', { class: 'muted small', text: `حتى ${formatDate(st.endsAt)}${st.days != null ? ` · بقي ${daysWord(st.days)}` : ''}` })));
    if (st.state === 'expired') {
      body.append(el('p', { class: 'field-hint warn-text', text: 'رخصةٌ منتهية: لا عقدَ ولا إعلان حتى تُجدَّد.' }));
    }
  }
  return el('section', { class: 'panel' },
    el('h2', { text: 'رخصة فال — منشأتك' }),
    el('p', { class: 'panel-desc', text: 'رخصةُ مزاولة الوساطة والتسويق العقاري. بلا سريانها لا يُوثَّق عقد ولا يُصدَر ترخيص إعلان.' }),
    body);
}

/* ===== الخلاصة ===== */

function summaryPanel(ctx) {
  const s = summary(ctx.rows);
  return el('section', { class: 'panel' },
    el('h2', { text: 'ما يستحقّ انتباهك' }),
    el('div', { class: 'stat-strip' },
      stat(s.advertisable, 'يصلح للإعلان الآن', s.total ? `من ${formatNumber(s.total)}` : '', 'ok'),
      stat(s.noContract, 'بلا عقد وساطة', 'والإعلان يلزمه عقد', 'warn'),
      stat(s.contractExpired + s.contractExpiring, 'عقودٌ انتهت أو توشك', `${formatNumber(s.contractExpired)} انتهت`, s.contractExpired ? 'danger' : 'warn'),
      stat(s.noLicense, 'بلا ترخيص إعلان', 'الإعلان بلا ترخيص مخالفة', 'danger'),
      stat(s.licenseExpired + s.licenseExpiring, 'تراخيصُ انتهت أو توشك', `${formatNumber(s.licenseExpired)} انتهت`, s.licenseExpired ? 'danger' : 'warn')),
    s.settled
      ? el('p', { class: 'muted small', text: `و${countWord(s.settled, ['عقارٌ واحد', 'عقاران', 'عقارات', 'عقارًا'])} أُنجزت صفقته — خارج العدّ، فعقدٌ على مبيعٍ لا معنى لتجديده.` })
      : null);
}

/**
 * **اللونُ يقول ما يقوله الرقم.** كانت الخمسةُ كلُّها بأخضر النظام الواحد: «١٣ بلا عقد
 * وساطة» بلون «٠ تراخيص انتهت» — فاللونُ يطمئن والرقمُ ينذر. والصفرُ يبقى محايدًا مهما
 * كان نوعُه: لا خطرَ في «لا شيء».
 */
function stat(value, label, hint = '', tone = '') {
  const cls = value > 0 && tone ? ` stat-${tone}` : '';
  return el('div', { class: `stat-chip${cls}` },
    el('div', { class: 'stat-num', text: formatNumber(value) }),
    el('div', { class: 'stat-label', text: label }),
    hint ? el('div', { class: 'muted small', text: hint }) : null);
}

/* ===== روابط الهيئة ===== */

function linksPanel() {
  return el('section', { class: 'panel' },
    el('h2', { text: 'خدمات الهيئة' }),
    el('p', { class: 'panel-desc', text: 'تُفتح بحسابك في منصّة الهيئة — ولا يخرج من هنا شيء إليها.' }),
    el('div', { class: 'today-grid' }, REGA_LINKS.map((l) => el('div', { class: 'rega-link' },
      el('a', { class: 'strong', href: l.url, target: '_blank', rel: 'noopener noreferrer', text: l.label }),
      el('div', { class: 'muted small', text: l.what })))));
}

/* ===== الفلاتر والجدول ===== */

function renderFilters(ctx) {
  const wrap = ctx.nodes.filters;
  clear(wrap);
  const chips = el('div', { class: 'chips' });
  chips.append(allChip(ctx.filters, FILTERS.map((f) => f.key), () => { renderFilters(ctx); renderTable(ctx); }));
  for (const f of FILTERS) {
    const n = ctx.rows.filter((r) => !r.settled && f.test(r)).length;
    const active = ctx.filters.has(f.key);
    chips.append(el('button', {
      type: 'button', class: `chip${active ? ' active' : ''}${n === 0 && !active ? ' zero' : ''}`,
      onClick: () => {
        if (active) ctx.filters.delete(f.key); else ctx.filters.add(f.key);
        renderFilters(ctx);
        renderTable(ctx);
      },
    }, f.label, el('span', { class: 'chip-count', text: String(n) })));
  }
  wrap.append(el('div', { class: 'filter-row' }, el('span', { class: 'filter-label', text: 'الحالة' }), chips));
}

function visibleRows(ctx) {
  const live = ctx.rows.filter((r) => !r.settled);
  if (!ctx.filters.size) return live;
  const chosen = FILTERS.filter((f) => ctx.filters.has(f.key));
  return live.filter((r) => chosen.some((f) => f.test(r)));
}

function renderTable(ctx) {
  const wrap = ctx.nodes.table;
  clear(wrap);
  const rows = visibleRows(ctx);
  ctx.nodes.count.textContent = rows.length ? `(${formatNumber(rows.length)})` : '';

  if (!ctx.rows.length) {
    wrap.append(emptyState('لا عقار معتمدًا بعد. أضِف عقارًا، ثم سجّل عقده وترخيصه هنا.',
      el('a', { class: 'btn btn-primary', href: '#/properties', text: 'افتح العقارات' })));
    return;
  }
  if (!rows.length) {
    wrap.append(el('p', { class: 'muted small', text: 'لا عقار يطابق الفرز المختار.' }));
    return;
  }

  const head = ['العقار', 'المالك', 'عقد الوساطة', 'النطاق', 'ترخيص الإعلان', 'ما يمنع الإعلان'];
  wrap.append(el('div', { class: 'table-wrap' },
    el('table', { class: 'table' },
      el('thead', {}, el('tr', {}, head.map((h) => el('th', { text: h })))),
      el('tbody', {}, rows.map((r) => row(ctx, r))))));
}

function row(ctx, r) {
  const p = r.property;
  // المالك هو من تتّصل به لتجديد العقد، فاسمُه ورابطُ ملفّه هنا لا في صفحةٍ أخرى.
  const owner = p.ownerId ? ctx.clientMap.get(p.ownerId) : null;
  return el('tr', {},
    el('td', {}, el('a', { href: `#/properties/${p.id}`, text: placeOf(p, ctx.lists) })),
    el('td', {}, owner
      ? el('a', { href: `#/client/${owner.id}`, text: owner.name || formatPhone(owner.phone) || 'بلا اسم' })
      : el('span', { class: 'muted', text: 'غير مربوط' })),
    el('td', {},
      badge(STATE_LABEL[r.contract.state], STATE_CLASS[r.contract.state]),
      r.contract.endsAt
        ? el('div', { class: 'muted small', text: `حتى ${formatDate(r.contract.endsAt)}${r.contract.days != null ? ` · ${daysWord(r.contract.days)}` : ''}` })
        : null,
      r.contract.number ? el('div', { class: 'muted small ltr', text: r.contract.number }) : null),
    el('td', {},
      (p.agreementScopes || []).length
        ? el('div', { class: 'chips' }, (p.agreementScopes || []).map((k) => badge(labelFor(ENUMS.agreementScopes, k), (p.agreementScopes || []).includes('market') && k === 'market' ? 'badge-ok' : 'badge-outline')))
        : el('span', { class: 'muted', text: '—' })),
    el('td', {},
      badge(STATE_LABEL[r.license.state], STATE_CLASS[r.license.state]),
      r.license.number ? el('div', { class: 'muted small ltr', text: r.license.number }) : null,
      r.license.undated ? el('div', { class: 'muted small', text: 'بلا تاريخ انتهاء مسجَّل' }) : null,
      r.license.endsAt ? el('div', { class: 'muted small', text: `حتى ${formatDate(r.license.endsAt)}` }) : null),
    el('td', {}, r.blockers.length
      ? el('div', { class: 'chips' }, r.blockers.map((b) => badge(b.short, 'badge-danger', { title: b.text })))
      : el('span', {}, badge('مستوفٍ', 'badge-ok'),
        el('button', {
          type: 'button', class: 'btn btn-ghost btn-sm', text: '📋 انسخ سطر الإعلان',
          title: 'السطر الذي يوجب النظام بيانه في إعلانك',
          onClick: async () => {
            const line = adDisclosure(p, ctx.company);
            try { await navigator.clipboard.writeText(line); toast('نُسخ — ألصقه في إعلانك', 'success'); }
            catch { toast(line, 'info', 8000); }
          },
        }))));
}

function placeOf(p, lists) {
  return [typeLabel(lists, p.type), p.district, p.city].filter(Boolean).join(' · ') || 'عقار بلا وصف';
}
