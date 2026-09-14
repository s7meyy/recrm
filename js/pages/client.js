// ملف العميل الكامل (المرحلة ٢٠): كل ما يخصّه في شاشة واحدة قبل أن تتصل به.
//
// كان التطبيق لا يعرف ارتباطات العميل إلا **لحظة حذفه** (ليحذّرك)، فقبل كل مكالمة كنت
// تتنقّل بين أربع صفحات: طلباته، ومطابقاته، وصفقاته، وفواتيره ومستحقاته.
//
// **قراءة محضة:** لا ينشئ ولا يعدّل ولا يحذف شيئًا — يجمع ويعرض ويربط بالصفحات الأصلية،
// فلا مصدر حقيقة ثانيًا يمكن أن يتناقض معها.

import { repo } from '../data/repository.js';
import { ENUMS, labelFor, clientTagClass, invoiceGrandTotal, COLLECTION_LABELS, invoiceCollection } from '../data/schema.js';
import { getLists, typeLabel } from '../data/settings.js';
import { loadMatchingContext, candidatesFor } from '../data/matching.js';
import { receivables } from '../util/receivables.js';
import { el, clear, badge, emptyState } from '../util/dom.js';
import { formatSAR, formatArea, formatDate, formatDateTime, formatNumber, daysWord } from '../util/format.js';
import { formatPhone, toInternational } from '../util/phone.js';

function routeClientId() {
  const m = /^#\/client\/([^/?#]+)/.exec(location.hash || '');
  return m ? decodeURIComponent(m[1]) : null;
}

export async function render(container) {
  const id = routeClientId();
  clear(container);
  if (!id) {
    container.append(emptyState('افتح ملف عميل من صفحة العملاء.', el('a', { class: 'btn btn-primary', href: '#/clients', text: 'العملاء' })));
    return;
  }

  const [client, lists, match, deals, invoices] = await Promise.all([
    repo.clients.get(id), getLists(), loadMatchingContext({ withMatches: true }),
    repo.deals.list(), repo.invoices.list(),
  ]);
  if (!client) {
    container.append(emptyState('العميل غير موجود، أو حُذف.', el('a', { class: 'btn', href: '#/clients', text: 'العملاء' })));
    return;
  }

  const requests = match.requests.filter((r) => r.clientId === id);
  const requestIds = new Set(requests.map((r) => r.id));
  const matches = match.matches.filter((m) => requestIds.has(m.requestId));
  const myDeals = deals.filter((d) => d.clientId === id);
  const myInvoices = invoices.filter((i) => i.clientId === id);
  const due = receivables({ invoices: myInvoices, deals: myDeals });
  const properties = match.properties.filter((p) => p.ownerId === id);
  const lastContact = repo.clients.lastContactAt(client);
  const nextFollowUp = repo.clients.nextFollowUp(client);
  const name = client.name || formatPhone(client.phone) || 'عميل بلا اسم';

  /* ===== الترويسة ===== */
  container.append(el('div', { class: 'page-head' },
    el('h1', {}, name, ' ', ...(client.tags || []).filter(clientTagClass).map((t) => badge(t, clientTagClass(t)))),
    el('div', { class: 'head-actions' },
      client.phone ? el('a', { class: 'btn', href: `tel:${client.phone}`, text: '📞 اتصال', 'data-sensitive': true }) : null,
      client.phone ? el('a', {
        class: 'btn', text: '💬 واتساب', 'data-sensitive': true,
        href: `https://wa.me/${toInternational(client.phone)}`, target: '_blank', rel: 'noopener noreferrer',
      }) : null,
      el('a', { class: 'btn btn-ghost', href: `#/clients/${client.id}`, text: 'تعديل البيانات' }))));

  container.append(el('div', { class: 'stat-strip' },
    stat(labelFor(ENUMS.clientStages, client.stage), 'المرحلة'),
    stat(lastContact ? daysWord(Math.floor((Date.now() - new Date(lastContact)) / 86400000)) : 'لم يُسجَّل', 'منذ آخر تواصل'),
    stat(formatNumber(requests.length), 'طلب'),
    stat(formatNumber(myDeals.length), 'صفقة'),
    due.total > 0 ? stat(formatSAR(due.total), 'مستحق لك عليه') : null));

  if (nextFollowUp) {
    container.append(el('div', { class: 'notice' },
      el('strong', { text: `موعد المتابعة: ${formatDate(nextFollowUp)}` }),
      new Date(nextFollowUp) < Date.now() ? ' — فات.' : ''));
  }

  const grid = el('div', { class: 'today-grid' });
  container.append(grid);

  /* ===== طلباته ومرشّحوها ===== */
  grid.append(panel('طلباته', requests.length, requests.length
    ? el('div', {}, requests.map((r) => {
      const count = r.status === 'active' ? candidatesFor(r, match, { minScore: match.settings.minScore }).length : null;
      return row(
        `${typeLabel(lists, r.type)} — ${(r.districts || []).join('، ') || r.city}`,
        [
          r.budgetMax == null ? 'بلا سقف' : `حتى ${formatSAR(r.budgetMax)}`,
          r.area == null ? null : formatArea(r.area),
          labelFor(ENUMS.requestStatuses, r.status),
          count == null ? null : `${formatNumber(count)} مرشّح`,
        ].filter(Boolean).join(' · '),
        el('a', { class: 'btn btn-ghost btn-sm', href: `#/matches/${r.id}`, text: 'المطابقات' }));
    }))
    : el('p', { class: 'muted small', text: 'لا طلبات مسجَّلة له.' }), '#/requests'));

  /* ===== سجل التواصل ===== */
  const contacts = [...(client.contacts || [])].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  grid.append(panel('سجل التواصل', contacts.length, contacts.length
    ? el('div', {}, contacts.slice(0, 10).map((c) => row(
      labelFor(ENUMS.contactTypes, c.type),
      `${formatDateTime(c.date)}${c.note ? ` — ${c.note}` : ''}`,
      null)))
    : el('p', { class: 'muted small', text: 'لم يُسجَّل تواصل بعد — سجّله من «يومي» بعد كل مكالمة.' })));

  /* ===== ما عُرض عليه ===== */
  const shown = matches.filter((m) => m.status !== 'new');
  grid.append(panel('ما عُرض عليه', shown.length, shown.length
    ? el('div', {}, shown.slice(0, 10).map((m) => {
      const listing = match.properties.find((p) => p.id === m.propertyId)
        || match.externals.find((x) => x.id === m.externalId);
      return row(
        listing ? `${typeLabel(lists, listing.type)} — ${listing.district || listing.city || ''}` : 'معروض محذوف',
        `${labelFor(ENUMS.matchStatuses, m.status)}${m.rejectReason ? ` · ${labelFor(ENUMS.matchRejectReasons, m.rejectReason)}` : ''} · ${m.score}٪`,
        listing ? el('a', { class: 'btn btn-ghost btn-sm', href: `#/properties/${listing.id}`, text: 'العقار' }) : null);
    }))
    : el('p', { class: 'muted small', text: 'لم يُعرض عليه شيء بعد.' })));

  /* ===== صفقاته وفواتيره ===== */
  grid.append(panel('صفقاته', myDeals.length, myDeals.length
    ? el('div', {}, myDeals.map((d) => row(
      formatDate(d.date),
      `${formatSAR(d.finalPrice)}${d.commission ? ` · عمولة ${formatSAR(d.commission)}` : ''}`
        + (d.commission && !d.commissionPaidAt ? ' — لم تُقبض' : ''),
      null)))
    : el('p', { class: 'muted small', text: 'لا صفقات معه بعد.' })));

  grid.append(panel('فواتيره', myInvoices.length, myInvoices.length
    ? el('div', {}, myInvoices.map((i) => row(
      `${labelFor(ENUMS.invoiceTypes, i.type)} ${i.number || ''}`.trim(),
      `${formatSAR(invoiceGrandTotal(i))} · ${COLLECTION_LABELS[invoiceCollection(i)]}`,
      el('a', { class: 'btn btn-ghost btn-sm', href: `#/invoices/${i.id}`, text: 'فتح' }))))
    : el('p', { class: 'muted small', text: 'لا فواتير باسمه.' }), '#/invoices'));

  /* ===== عقاراته (إن كان مالكًا) ===== */
  if (properties.length) {
    grid.append(panel('عقاراته عندك', properties.length,
      el('div', {}, properties.map((p) => row(
        `${typeLabel(lists, p.type)} — ${p.district || p.city || ''}`,
        [p.price == null ? 'بلا سعر' : formatSAR(p.price), formatArea(p.area)].filter(Boolean).join(' · '),
        el('a', { class: 'btn btn-ghost btn-sm', href: `#/properties/${p.id}`, text: 'فتح' })))),
      '#/properties'));
  }

  if (client.notes) {
    grid.append(panel('ملاحظاتك', null, el('p', { 'data-sensitive': true, text: client.notes })));
  }
}

function stat(value, label) {
  return el('div', { class: 'stat-chip' },
    el('div', { class: 'stat-num', text: String(value) }),
    el('div', { class: 'stat-label', text: label }));
}

function panel(title, count, body, href = null) {
  return el('section', { class: 'panel today-panel' },
    el('div', { class: 'today-head' },
      el('h2', {}, title, count == null ? '' : ` (${formatNumber(count)})`),
      href ? el('a', { class: 'small', href, text: 'الصفحة →' }) : null),
    body);
}

function row(title, detail, action) {
  return el('div', { class: 'today-row' },
    el('div', {},
      el('div', { class: 'strong', text: title }),
      detail ? el('div', { class: 'muted small', text: detail }) : null),
    action);
}
