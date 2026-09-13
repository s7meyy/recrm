// صفحة «يومي» (المرحلة ١١): شاشة واحدة تجمع ما ينتظرك اليوم بدل التنقّل بين أربع صفحات.
//
// **لا تُنشئ ولا تُخزّن شيئًا جديدًا:** كل رقم هنا محسوب لحظيًا من البيانات نفسها التي تعرضها
// الصفحات الأخرى (نفس دوال المصدر: tourStats للمطابقة، getFollowUpSettings للحدّ، إلخ)،
// فلا مصدر حقيقة ثانيًا يمكن أن يتناقض معها.

import { repo } from '../data/repository.js';
import { ENUMS, labelFor, clientPriority, clientTagClass } from '../data/schema.js';
import { getLists, getCompleteness, getFollowUpSettings, typeLabel, getUI, setUI } from '../data/settings.js';
import { loadMatchingContext, candidatesFor, matchReadiness } from '../data/matching.js';
import { buildOpportunityIndex, topOpportunities } from '../util/opportunity.js';
import { el, clear, badge, emptyState } from '../util/dom.js';
import { formatSAR, formatDate, formatDateTime, relativeDays, daysBetween, daysWord } from '../util/format.js';
import { formatPhone, toInternational } from '../util/phone.js';
import { clientName } from './requests.js';

export async function render(container) {
  const data = await loadData();
  build(container, data);
  // ختم الزيارة بعد البناء: «الجديد منذ آخر دخول» يُحسب بالختم السابق لا بالحالي.
  await setUI({ lastVisitAt: new Date().toISOString() });
}

async function loadData() {
  const [ui, lists, completeness, followUp, ctx, tasks, externals, invoices] = await Promise.all([
    getUI(), getLists(), getCompleteness(), getFollowUpSettings(),
    loadMatchingContext({ withMatches: true }), repo.tasks.list(), repo.externalListings.list(), repo.invoices.list(),
  ]);
  const since = ui.lastVisitAt || null;
  const clientsById = new Map(ctx.clients.map((c) => [c.id, c]));
  const now = Date.now();

  /* متابعات اليوم: موعد المتابعة المسجَّل حلّ أو فات */
  const followUps = ctx.clients
    .map((c) => ({ client: c, at: repo.clients.nextFollowUp(c) }))
    .filter((x) => x.at && new Date(x.at).getTime() <= now + 86400000)
    .sort((a, b) => (a.at || '').localeCompare(b.at || ''));

  /* عملاء تجاوزوا حدّ عدم التواصل */
  const stale = ctx.clients
    .map((c) => ({ client: c, last: repo.clients.lastContactAt(c) }))
    .filter((x) => !['won', 'closed'].includes(x.client.stage))
    .map((x) => ({ ...x, days: x.last ? daysBetween(x.last, new Date().toISOString()) : null }))
    .filter((x) => x.days == null || x.days >= followUp.staleContactDays)
    .sort((a, b) => (b.days ?? 9999) - (a.days ?? 9999));

  /* مهام اليوم والمتأخرة */
  const pending = tasks.filter((t) => !t.done && t.dueAt);
  const dueTasks = pending
    .filter((t) => new Date(t.dueAt).getTime() <= now + 86400000)
    .sort((a, b) => (a.dueAt || '').localeCompare(b.dueAt || ''));

  /* مطابقات جديدة: مرشّح فوق الحدّ لم يُسجَّل عليه أي تصرّف بعد */
  const saved = new Set(ctx.matches.map((m) => `${m.requestId}:${m.propertyId || m.externalId}`));
  const newMatches = [];
  for (const request of ctx.requests) {
    if (request.status !== 'active') continue;
    for (const row of candidatesFor(request, ctx, { minScore: ctx.settings.minScore })) {
      if (saved.has(`${request.id}:${row.listing.id}`)) continue;
      newMatches.push({ request, client: clientsById.get(request.clientId), row });
    }
  }
  newMatches.sort((a, b) => (clientPriority(b.client) - clientPriority(a.client)) || (b.row.score - a.row.score));

  /* ما يحتاج إكمالًا */
  const approved = ctx.properties.filter((p) => p.captureStatus === 'approved');
  const incomplete = approved.filter((p) => !repo.properties.isComplete(p, {
    owner: clientsById.get(p.ownerId) || null, fields: completeness,
  }).complete);
  const awaitingApproval = ctx.properties.filter((p) => p.captureStatus !== 'approved');
  const unreadyExternals = externals.filter((x) => x.status === 'active' && !matchReadiness(x).ready);

  // أعلى الأحياء عجزًا (المرحلة ١٢) — نفس حساب صفحة «الفرص» بلا تكرار منطق.
  const opportunities = topOpportunities(buildOpportunityIndex(ctx, { minScore: ctx.settings.minScore }).rows, 3);

  return {
    since, lists, followUps, stale, dueTasks, newMatches, incomplete, awaitingApproval, unreadyExternals, opportunities,
    clientsById, tasksPending: tasks.filter((t) => !t.done).length,
    quotesOpen: invoices.filter((i) => i.type === 'quote').length,
  };
}

/* ===== العرض ===== */

function section(title, count, body, { href = null, hrefText = null, tone = '' } = {}) {
  return el('section', { class: `panel today-panel ${tone}`.trim() },
    el('div', { class: 'today-head' },
      el('h2', {}, title, count != null ? el('span', { class: 'count', text: ` (${count})` }) : null),
      href ? el('a', { class: 'btn btn-ghost btn-sm', href, text: hrefText || 'فتح →' }) : null),
    body);
}

const row = (main, meta, actions = null) => el('div', { class: 'today-row' },
  el('div', {}, el('div', { class: 'strong' }, main), meta ? el('div', { class: 'muted small' }, meta) : null),
  actions);

function clientActions(client) {
  const actions = el('div', { class: 'row' });
  if (client?.phone) {
    actions.append(
      el('a', { class: 'btn btn-ghost btn-sm', href: `tel:${client.phone}`, text: '📞' , title: 'اتصال' }),
      el('a', {
        class: 'btn btn-ghost btn-sm', title: 'واتساب', text: '💬',
        href: `https://wa.me/${toInternational(client.phone)}`, target: '_blank', rel: 'noopener noreferrer',
      }));
  }
  actions.append(el('a', { class: 'btn btn-ghost btn-sm', href: `#/clients/${client.id}`, text: 'فتح' }));
  return actions;
}

function build(container, d) {
  clear(container);
  const greeting = new Date().getHours() < 12 ? 'صباح الخير' : 'مساء الخير';
  container.append(el('div', { class: 'page-head' },
    el('h1', {}, `${greeting} — هذا ما ينتظرك اليوم`),
    el('span', { class: 'muted small', text: d.since ? `آخر دخول: ${formatDateTime(d.since)}` : 'أول دخول' })));

  container.append(el('div', { class: 'stat-strip' },
    chip(d.followUps.length, 'متابعة اليوم'),
    chip(d.dueTasks.length, 'مهمة مستحقة'),
    chip(d.newMatches.length, 'مطابقة جديدة'),
    chip(d.stale.length, 'عميل متأخر'),
    chip(d.incomplete.length, 'عقار ناقص')));

  const grid = el('div', { class: 'today-grid' });
  container.append(grid);

  /* متابعات اليوم */
  grid.append(section('متابعات اليوم', d.followUps.length,
    d.followUps.length
      ? el('div', {}, d.followUps.slice(0, 8).map(({ client, at }) => row(
        el('span', {}, clientName(client), ...(client.tags || []).filter(clientTagClass).map((t) => badge(t, clientTagClass(t)))),
        `موعد المتابعة: ${formatDate(at)}${new Date(at).getTime() < Date.now() ? ' — فات' : ''}`,
        clientActions(client))))
      : el('p', { class: 'muted small', text: 'لا متابعات مجدولة اليوم.' }),
    { href: '#/clients', hrefText: 'العملاء →', tone: d.followUps.length ? 'today-warn' : '' }));

  /* مهام مستحقة */
  grid.append(section('مهام مستحقة', d.dueTasks.length,
    d.dueTasks.length
      ? el('div', {}, d.dueTasks.slice(0, 8).map((t) => row(
        t.title,
        `${formatDateTime(t.dueAt)}${new Date(t.dueAt).getTime() < Date.now() ? ' — متأخرة' : ''}`,
        el('a', { class: 'btn btn-ghost btn-sm', href: `#/tasks/${t.id}`, text: 'فتح' }))))
      : el('p', { class: 'muted small', text: `لا مهام مستحقة اليوم${d.tasksPending ? ` (${d.tasksPending} مهمة بلا موعد أو لاحقة)` : ''}.` }),
    { href: '#/tasks', hrefText: 'المهام →', tone: d.dueTasks.some((t) => new Date(t.dueAt) < Date.now()) ? 'today-warn' : '' }));

  /* مطابقات جديدة */
  grid.append(section('مطابقات جديدة لم تتصرّف فيها', d.newMatches.length,
    d.newMatches.length
      ? el('div', {}, d.newMatches.slice(0, 8).map(({ request, client, row: r }) => row(
        el('span', {}, `${r.score}٪ · `, clientName(client)),
        `${typeLabel(d.lists, r.listing.type)} — ${[r.listing.district, r.listing.city].filter(Boolean).join('، ')} · ${formatSAR(r.listing.price)}`,
        el('a', { class: 'btn btn-ghost btn-sm', href: `#/matches/${request.id}`, text: 'فتح' }))))
      : el('p', { class: 'muted small', text: 'لا مطابقات جديدة — كل المرشحين تصرّفت فيهم.' }),
    { href: '#/matches', hrefText: 'المطابقات →', tone: d.newMatches.length ? 'today-ok' : '' }));

  /* عملاء متأخرون */
  grid.append(section('عملاء لم يُتواصل معهم', d.stale.length,
    d.stale.length
      ? el('div', {}, d.stale.slice(0, 8).map(({ client, days }) => row(
        clientName(client),
        days == null ? 'لم يُسجَّل أي تواصل بعد' : `آخر تواصل قبل ${daysWord(days)}`,
        clientActions(client))))
      : el('p', { class: 'muted small', text: 'لا أحد تجاوز الحدّ.' }),
    { href: '#/clients' }));

  /* فرص الاقتناص (المرحلة ١٢) */
  grid.append(section('أحياء يطلبها عملاؤك ولا تملك فيها', d.opportunities.length,
    d.opportunities.length
      ? el('div', {}, d.opportunities.map((o) => row(
        o.district,
        `${o.unmet} طلب بلا أي مطابقة · مخزونك هناك: ${o.supply}`,
        el('a', { class: 'btn btn-ghost btn-sm', href: '#/opportunities', text: 'من يطلبه؟' }))))
      : el('p', { class: 'muted small', text: 'لا عجز — كل طلب نشط يجد مرشحًا.' }),
    { href: '#/opportunities', hrefText: 'الفرص →', tone: d.opportunities.length ? 'today-warn' : '' }));

  /* ما يحتاج إكمالًا */
  const chores = [];
  if (d.awaitingApproval.length) chores.push(row(`${d.awaitingApproval.length} التقاط بانتظار الاعتماد`, 'لا يدخل المطابقة قبل اعتماده',
    el('a', { class: 'btn btn-ghost btn-sm', href: '#/tours/queue', text: 'فتح' })));
  if (d.incomplete.length) chores.push(row(`${d.incomplete.length} عقار ناقص البيانات`, 'بحسب تعريف «مكتمل البيانات» في الإعدادات',
    el('a', { class: 'btn btn-ghost btn-sm', href: '#/properties', text: 'فتح' })));
  if (d.unreadyExternals.length) chores.push(row(`${d.unreadyExternals.length} عرض خارجي بانتظار الإكمال`, 'ينقصه النوع أو الغرض أو المدينة فلا يطابق شيئًا',
    el('a', { class: 'btn btn-ghost btn-sm', href: '#/external', text: 'فتح' })));
  if (d.quotesOpen) chores.push(row(`${d.quotesOpen} عرض سعر لم يتحوّل إلى فاتورة`, 'تابعه قبل أن يبرد',
    el('a', { class: 'btn btn-ghost btn-sm', href: '#/invoices', text: 'فتح' })));

  grid.append(section('يحتاج إكمالًا', chores.length,
    chores.length ? el('div', {}, chores) : el('p', { class: 'muted small', text: 'لا شيء ناقص — ممتاز.' })));
}

function chip(value, label) {
  return el('div', { class: 'stat-chip' },
    el('div', { class: 'stat-num', text: String(value) }),
    el('div', { class: 'stat-label', text: label }));
}
