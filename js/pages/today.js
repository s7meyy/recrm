// صفحة «يومي» (المرحلة ١١): شاشة واحدة تجمع ما ينتظرك اليوم بدل التنقّل بين أربع صفحات.
//
// **لا تُنشئ ولا تُخزّن شيئًا جديدًا:** كل رقم هنا محسوب لحظيًا من البيانات نفسها التي تعرضها
// الصفحات الأخرى (نفس دوال المصدر: tourStats للمطابقة، getFollowUpSettings للحدّ، إلخ)،
// فلا مصدر حقيقة ثانيًا يمكن أن يتناقض معها.

import { repo } from '../data/repository.js';
import { ENUMS, labelFor, clientPriority, clientTagClass } from '../data/schema.js';
import { getLists, getCompleteness, getFollowUpSettings, typeLabel, getUI, setUI, getGoals } from '../data/settings.js';
import { loadMatchingContext, candidatesFor, matchReadiness } from '../data/matching.js';
import { buildOpportunityIndex, topOpportunities } from '../util/opportunity.js';
import { receivables } from '../util/receivables.js';
import { el, clear, badge, emptyState, confirmDialog, toast } from '../util/dom.js';
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
  const [ui, lists, completeness, followUp, ctx, tasks, externals, invoices, goals, deals, expenses] = await Promise.all([
    getUI(), getLists(), getCompleteness(), getFollowUpSettings(),
    loadMatchingContext({ withMatches: true }), repo.tasks.list(), repo.externalListings.list(), repo.invoices.list(),
    getGoals(), repo.deals.list(), repo.expenses.list(),
  ]);
  const since = ui.lastVisitAt || null;
  const due = receivables({ invoices, deals }); // المستحقات (المرحلة ١٧)
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

  /* الأهداف الشهرية والتجديدات والعروض البائتة (المرحلة ١٣) */
  const thisMonth = (iso) => {
    const d = new Date(iso);
    return !Number.isNaN(d.getTime()) && d.getFullYear() === new Date().getFullYear() && d.getMonth() === new Date().getMonth();
  };
  const monthDeals = deals.filter((d) => thisMonth(d.date));
  const progress = {
    goals,
    deals: monthDeals.length,
    commission: monthDeals.reduce((a, d) => a + (Number(d.commission) || 0), 0),
    spent: expenses.filter((e) => thisMonth(e.date)).reduce((a, e) => a + (Number(e.amount) || 0), 0),
  };
  // تجديد الإيجار: العقد الذي ينتهي خلال ٤٥ يومًا (أو انتهى ولم يُتابَع).
  const renewals = deals
    .filter((d) => d.leaseEndAt)
    .map((d) => ({ deal: d, days: daysBetween(new Date().toISOString(), d.leaseEndAt) }))
    .filter((x) => x.days != null && x.days <= 45)
    .sort((a, b) => a.days - b.days);
  // العرض البائت: عقار معتمد لم يُحدَّث منذ الحدّ المضبوط في الإعدادات.
  const staleListings = approved
    .map((p) => ({ property: p, days: daysBetween(p.updatedAt, new Date().toISOString()) }))
    .filter((x) => x.days != null && x.days >= goals.staleListingDays
      && !['sold', 'rented'].includes(x.property.status))
    .sort((a, b) => b.days - a.days);

  return {
    since, lists, followUps, stale, dueTasks, newMatches, incomplete, awaitingApproval, unreadyExternals, opportunities,
    progress, renewals, staleListings,
    clientsById, tasksPending: tasks.filter((t) => !t.done).length,
    quotesOpen: invoices.filter((i) => i.type === 'quote').length,
    due,
  };
}

/* ===== العرض ===== */

/** عبارة التأخّر: «تأخّر ١٢ يومًا» أصدق من تاريخٍ يُحسب في الذهن. */
function dueWhen(r) {
  if (r.days > 0) return `تأخّر ${daysWord(r.days)}${r.dated ? '' : ' عن تاريخه'}`;
  if (r.days === 0) return 'يستحق اليوم';
  return `يستحق بعد ${daysWord(-r.days)}`;
}

/** قبض العمولة من «يومي» مباشرة: لا صفحة للصفقات، وفتح المطابقات لأجل هذا تكلّف خطوات. */
async function markCommissionPaid(event, r) {
  event.preventDefault();
  const ok = await confirmDialog({
    title: 'قبض العمولة',
    message: `تأكيد قبض عمولة ${formatSAR(r.remaining)} لصفقة ${formatDate(r.basis)}؟`,
    confirmText: 'قُبضت',
  });
  if (!ok) return;
  await repo.deals.update(r.id, { commissionPaidAt: new Date().toISOString() });
  toast('سُجّل قبض العمولة', 'success');
  window.dispatchEvent(new CustomEvent('kassab:data-changed'));
  const container = document.getElementById('page');
  build(container, await loadData());
}

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

  /* الأهداف الشهرية (المرحلة ١٣) — لا تظهر ما لم تضبط هدفًا */
  if (d.progress.goals.dealsPerMonth || d.progress.goals.commissionPerMonth) {
    grid.append(section('هدف الشهر', null, el('div', {},
      goalBar('صفقات', d.progress.deals, d.progress.goals.dealsPerMonth, (v) => String(v)),
      goalBar('عمولات', d.progress.commission, d.progress.goals.commissionPerMonth, formatSAR),
      el('p', { class: 'muted small', text: `مصاريف هذا الشهر: ${formatSAR(d.progress.spent)} · الصافي: ${formatSAR(d.progress.commission - d.progress.spent)}` })),
    { href: '#/expenses', hrefText: 'المصاريف →' }));
  }

  /* مستحقات لم تُقبض (المرحلة ١٧) — لا تظهر اللوحة إن لم يكن لك شيء عند أحد */
  if (d.due.rows.length) {
    grid.append(section('مستحقات لم تُقبض', d.due.rows.length,
      el('div', {},
        el('p', { class: 'strong', text: `${formatSAR(d.due.total)} لك عند الناس`
          + (d.due.overdueCount ? ` — منها ${formatSAR(d.due.overdueTotal)} تجاوزت استحقاقها` : '') }),
        ...d.due.rows.slice(0, 8).map((r) => row(
          r.kind === 'commission' ? `عمولة صفقة ${formatDate(r.basis)}` : `فاتورة ${r.number || 'بلا رقم'}`,
          `${formatSAR(r.remaining)} · ${dueWhen(r)}${r.state === 'partial' ? ' · مقبوضة جزئيًا' : ''}`
            + (r.clientId && d.clientsById.get(r.clientId) ? ` · ${clientName(d.clientsById.get(r.clientId))}` : ''),
          r.kind === 'commission'
            ? el('button', {
              type: 'button', class: 'btn btn-ghost btn-sm', text: 'قُبضت',
              onClick: (e) => markCommissionPaid(e, r),
            })
            : el('a', { class: 'btn btn-ghost btn-sm', href: `#/invoices/${r.id}`, text: 'فتح' })))),
      { href: '#/invoices', hrefText: 'الفواتير →', tone: d.due.overdueCount ? 'today-warn' : '' }));
  }

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

  /* تجديد عقود الإيجار (المرحلة ١٣) */
  if (d.renewals.length) {
    grid.append(section('عقود إيجار تقترب نهايتها', d.renewals.length,
      el('div', {}, d.renewals.slice(0, 6).map(({ deal, days }) => row(
        `عقد ينتهي ${formatDate(deal.leaseEndAt)}`,
        days < 0 ? `انتهى قبل ${daysWord(Math.abs(days))} — تابع التجديد` : `بعد ${daysWord(days)} — كلّم الطرفين مبكرًا`,
        el('a', { class: 'btn btn-ghost btn-sm', href: '#/clients', text: 'العملاء' }))),
      ), { tone: 'today-warn' }));
  }

  /* عروض بائتة (المرحلة ١٣) */
  if (d.staleListings.length) {
    grid.append(section('عروض بائتة تحتاج مراجعة', d.staleListings.length,
      el('div', {}, d.staleListings.slice(0, 6).map(({ property, days }) => row(
        `${typeLabel(d.lists, property.type)} — ${[property.district, property.city].filter(Boolean).join('، ')}`,
        `لم يُحدَّث منذ ${daysWord(days)} — راجع السعر والتوفر`,
        el('a', { class: 'btn btn-ghost btn-sm', href: `#/properties/${property.id}`, text: 'فتح' }))),
      ), { href: '#/properties' }));
  }

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

/** شريط تقدّم نحو هدف الشهر — يتجاوز ١٠٠٪ بلا كسر (تجاوزتَ هدفك). */
function goalBar(label, value, goal, fmt) {
  if (!goal) return null;
  const pct = Math.min(100, Math.round((value / goal) * 100));
  return el('div', { class: 'goal-row' },
    el('div', { class: 'goal-head' },
      el('span', { text: label }),
      el('span', { class: 'muted small', text: `${fmt(value)} من ${fmt(goal)} (${pct}٪)` })),
    el('div', { class: 'goal-track' }, el('div', { class: `goal-fill${value >= goal ? ' done' : ''}`, style: { width: `${pct}%` } })));
}

function chip(value, label) {
  return el('div', { class: 'stat-chip' },
    el('div', { class: 'stat-num', text: String(value) }),
    el('div', { class: 'stat-label', text: label }));
}
