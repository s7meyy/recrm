// صفحة «الفرص» (المرحلة ١٢): أين أذهب أقتنص؟
//
// تقارن الطلب غير الملبّى بمخزونك لكل حي، فتحوّل الجولة الميدانية من عشوائية إلى موجَّهة.
// كل رقم هنا من المحرك نفسه (`candidatesFor`) لا من حساب مواز — فلا يتناقض مع صفحة المطابقات.

import { repo } from '../data/repository.js';
import { loadMatchingContext } from '../data/matching.js';
import { getLists, typeLabel } from '../data/settings.js';
import { buildOpportunityIndex, collapseByDistrict, surplusRows } from '../util/opportunity.js';
import { el, clear, badge, selectEl, checkbox, emptyState, openModal, toast } from '../util/dom.js';
import { formatSAR, formatArea, formatNumber } from '../util/format.js';
import { formatPhone } from '../util/phone.js';
import { clientName } from './requests.js';

export async function render(container) {
  const ctx = { container, city: '', byType: true, nodes: {} };
  await loadData(ctx);
  build(ctx);
}

async function loadData(ctx) {
  const [match, lists] = await Promise.all([loadMatchingContext({ withMatches: false }), getLists()]);
  ctx.match = match;
  ctx.lists = lists;
  ctx.clientsById = new Map(match.clients.map((c) => [c.id, c]));
  ctx.index = buildOpportunityIndex(match, { minScore: match.settings.minScore });
  if (!ctx.city) ctx.city = ctx.index.cities[0] || lists.cities[0] || '';
}

function build(ctx) {
  clear(ctx.container);
  const citySelect = selectEl({
    options: (ctx.index.cities.length ? ctx.index.cities : ctx.lists.cities).map((c) => ({ value: c, label: c })),
    value: ctx.city, onChange: (e) => { ctx.city = e.target.value; draw(ctx); },
  });
  const byTypeBox = checkbox('فصل حسب نوع العقار', {
    checked: ctx.byType, onChange: (e) => { ctx.byType = e.target.checked; draw(ctx); },
  });

  ctx.container.append(
    el('div', { class: 'page-head' },
      el('h1', {}, 'الفرص — أين أذهب أقتنص؟'),
      el('div', { class: 'head-actions' }, citySelect)),
    el('div', { class: 'notice' },
      el('strong', { text: 'الطلب غير الملبّى لا عدد الطلبات. ' }),
      'الطلب الذي يجد عندك مرشحًا ليس فرصة. ما يُحسب هنا هو الطلب النشط الذي لا يجد ',
      'مرشحًا واحدًا بمحرك المطابقة نفسه — بسعره ومساحته وقواطعه، لا بالحي وحده.'),
    el('div', { class: 'toolbar' }, byTypeBox));

  ctx.nodes.stats = el('div', { class: 'stat-strip' });
  ctx.nodes.body = el('div');
  ctx.container.append(ctx.nodes.stats, ctx.nodes.body);
  draw(ctx);
}

function chip(value, label) {
  return el('div', { class: 'stat-chip' },
    el('div', { class: 'stat-num', text: formatNumber(value) }),
    el('div', { class: 'stat-label', text: label }));
}

function draw(ctx) {
  const all = ctx.index.rows.filter((r) => !ctx.city || r.city === ctx.city);
  const rows = ctx.byType ? all : collapseByDistrict(all);
  const hot = rows.filter((r) => r.unmet > 0);
  const surplus = surplusRows(all);

  clear(ctx.nodes.stats);
  ctx.nodes.stats.append(
    chip(hot.reduce((s, r) => s + r.unmet, 0), 'طلب بلا أي مطابقة'),
    chip(hot.length, ctx.byType ? 'حي × نوع فيه عجز' : 'حي فيه عجز'),
    chip(all.reduce((s, r) => s + r.supply, 0), 'عقار في مخزونك'),
    chip(surplus.length, 'تخمة بلا طلب'));

  clear(ctx.nodes.body);
  if (!rows.length) {
    ctx.nodes.body.append(emptyState('لا طلبات نشطة ولا مخزون في هذه المدينة بعد.'));
    return;
  }

  ctx.nodes.body.append(
    el('h2', { class: 'section-title', text: 'أحياء يطلبها عملاؤك ولا تملك فيها' }),
    hot.length ? table(ctx, hot) : el('p', { class: 'muted small', text: 'لا عجز حاليًا — كل طلب نشط يجد مرشحًا واحدًا على الأقل.' }));

  if (surplus.length) {
    ctx.nodes.body.append(
      el('h2', { class: 'section-title', style: { marginTop: '22px' }, text: 'تخمة: مخزون راكد بلا طلب نشط' }),
      el('p', { class: 'muted small', text: 'لا طلب نشط واحد يشمل هذه الأحياء بهذا النوع — راجع أسعارها أو وسّع تسويقها.' }),
      table(ctx, surplus, { surplus: true }));
  }
}

function table(ctx, rows, { surplus = false } = {}) {
  const head = surplus
    ? ['الحي', 'النوع', 'مخزونك', 'السوق', '']
    : ['الحي', 'النوع', 'طلب بلا مطابقة', 'كل الطلبات', 'مخزونك', 'متاح في السوق', 'التشخيص', ''];

  const body = rows.slice(0, 40).map((r) => {
    const name = r.district || '—';
    const type = r.type ? typeLabel(ctx.lists, r.type) : 'كل الأنواع';
    if (surplus) {
      return el('tr', {},
        el('td', { class: 'strong', text: name }),
        el('td', { text: type }),
        el('td', { class: 'num', text: formatNumber(r.supply) }),
        el('td', { class: 'num', text: formatNumber(r.market) }),
        el('td', {}, el('a', { class: 'btn btn-ghost btn-sm', href: '#/properties', text: 'راجع المخزون' })));
    }
    return el('tr', {},
      el('td', { class: 'strong', text: name }),
      el('td', { text: type }),
      el('td', {}, r.unmet ? badge(formatNumber(r.unmet), 'badge-danger') : el('span', { class: 'muted', text: '—' })),
      el('td', { class: 'num', text: formatNumber(r.demand) }),
      el('td', { class: 'num', text: formatNumber(r.supply) }),
      el('td', { class: 'num muted', text: formatNumber(r.market) }),
      el('td', {}, diagnosis(r)),
      el('td', {}, el('button', {
        type: 'button', class: 'btn btn-ghost btn-sm', text: 'من يطلبه؟',
        onClick: () => openRequests(ctx, r),
      })));
  });

  return el('div', { class: 'table-wrap' }, el('table', { class: 'table' },
    el('thead', {}, el('tr', {}, head.map((t) => el('th', { text: t })))),
    el('tbody', {}, body)));
}

/**
 * التشخيص بدل رقم فجوة مضلِّل: «عجز ١» حين يكون ٣ عملاء بلا مرشح ومخزونك اثنان لا يناسبهم
 * رقمٌ صحيح حسابيًا وخاطئ عمليًا. المفيد أن تعرف **لماذا** لا يجدون، وماذا تفعل.
 */
function diagnosis(r) {
  if (!r.unmet) return el('span', { class: 'muted', text: '—' });
  if (!r.supply) {
    return r.market
      ? badge('لا مخزون لك — لكن في السوق عروض', 'badge-warn')
      : badge('لا مخزون لك ولا في السوق — اقتنص', 'badge-danger');
  }
  // عندك مخزون هناك ومع ذلك لا أحد يجد مرشحًا: العائق سعر أو مساحة لا وجود عقار.
  return badge(`مخزونك هنا لا يناسبهم (${formatNumber(r.supply)}) — راجع السعر والمساحة`, 'badge-warn');
}

/** من يطلب هذا الحي فعلًا: العملاء أصحاب الطلبات غير الملبّاة، بميزانياتهم وروابطهم. */
function openRequests(ctx, row) {
  const seen = new Set();
  const items = row.requests.filter((r) => (seen.has(r.id) ? false : seen.add(r.id)));
  if (!items.length) { toast('لا طلبات غير ملبّاة في هذا الصف', 'info'); return; }

  const body = el('div', {},
    el('p', { class: 'muted small', text: `${items.length} طلب نشط يشمل ${row.district} ولا يجد مرشحًا — هذه هي الفرصة.` }),
    el('div', { class: 'table-wrap' }, el('table', { class: 'table' },
      el('thead', {}, el('tr', {}, ['العميل', 'الجوال', 'سقف الميزانية', 'المساحة', ''].map((t) => el('th', { text: t })))),
      el('tbody', {}, items.map((r) => {
        const client = ctx.clientsById.get(r.clientId);
        return el('tr', {},
          el('td', { class: 'strong', text: clientName(client) }),
          el('td', {}, client?.phone ? el('a', { class: 'tel', href: `tel:${client.phone}`, text: formatPhone(client.phone) }) : '—'),
          el('td', { class: 'num', text: r.budgetMax == null ? '—' : formatSAR(r.budgetMax) }),
          el('td', { class: 'num', text: formatArea(r.area) }),
          el('td', {}, el('a', {
            class: 'btn btn-ghost btn-sm', href: `#/matches/${r.id}`, text: 'الطلب',
            onClick: () => modal.close(),
          })));
      })))));

  const modal = openModal({
    title: `${row.district}${row.type ? ` — ${typeLabel(ctx.lists, row.type)}` : ''}`,
    size: 'wide',
    body,
    footer: [el('button', { type: 'button', class: 'btn btn-primary', text: 'إغلاق', onClick: () => modal.close() })],
  });
}
