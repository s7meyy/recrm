// صفحة التقويم (المرحلة ٣٢): شهرٌ واحد يجمع ما تفرّق في ست قوائم.
//
// **لا تُنشئ ولا تُخزّن شيئًا:** كل حدث هنا مقروء من سجلّه (مهمة · معاينة · متابعة · دفعة ·
// نهاية عقد · نهاية اتفاقية)، والنقر عليه يفتح مصدره. فلا مصدر حقيقة ثانيًا يخالف الصفحات.

import { repo } from '../data/repository.js';
import { getLists, typeLabel, getCompany } from '../data/settings.js';
import { monthEvents, monthGrid, icsCalendar, EVENT_KINDS, dayKey } from '../util/calendar.js';
import { agreementState } from '../util/agreements.js';
import { downloadBlob } from '../data/backup.js';
import { el, clear, badge, toast } from '../util/dom.js';
import { formatNumber, formatDateTime } from '../util/format.js';

const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
const WEEKDAYS = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

export async function render(container) {
  const now = new Date();
  const ctx = { container, year: now.getFullYear(), month: now.getMonth(), nodes: {} };
  await load(ctx);
  build(ctx);
}

async function load(ctx) {
  const [showings, tasks, clients, deals, properties, externals, lists, company] = await Promise.all([
    repo.showings.list(), repo.tasks.list(), repo.clients.list(), repo.deals.list(),
    repo.properties.list(), repo.externalListings.list(), getLists(), getCompany(),
  ]);
  const byId = new Map([...properties, ...externals].map((p) => [p.id, p]));
  const clientById = new Map(clients.map((c) => [c.id, c]));
  ctx.data = {
    showings, tasks, clients, deals, properties,
    propertyLabel: (id) => {
      const p = byId.get(id);
      return p ? `${typeLabel(lists, p.type)} ${[p.district, p.city].filter(Boolean).join('، ')}`.trim() : 'عقار محذوف';
    },
    clientLabel: (id) => {
      const c = clientById.get(id);
      return c ? (c.name || c.phone || 'عميل') : '';
    },
    nextFollowUp: (c) => repo.clients.nextFollowUp(c),
    agreementEnd: (p) => agreementState(p, { defaultDays: company.agreementDurationDays || 90 }).endsAt,
  };
}

function build(ctx) {
  clear(ctx.container);
  const { days, events, counts } = monthEvents(ctx.data, { year: ctx.year, month: ctx.month });

  ctx.container.append(
    el('div', { class: 'page-head' },
      el('h1', {}, 'التقويم'),
      el('div', { class: 'head-actions' },
        el('button', { type: 'button', class: 'btn btn-sm', text: '‹ السابق', onClick: () => move(ctx, -1) }),
        el('button', { type: 'button', class: 'btn btn-sm', text: 'هذا الشهر', onClick: () => goToday(ctx) }),
        el('button', { type: 'button', class: 'btn btn-sm', text: 'التالي ›', onClick: () => move(ctx, 1) }),
        el('button', {
          type: 'button', class: 'btn btn-sm', text: '📆 صدّر الشهر (.ics)',
          title: 'ملف تفتحه فيُضاف إلى تقويم جوالك',
          onClick: () => exportMonth(ctx, events),
        }))),
    el('h2', { class: 'section-title', text: `${MONTHS[ctx.month]} ${ctx.year}` }),
  );

  if (!events.length) {
    ctx.container.append(el('p', { class: 'muted small', text: 'لا مواعيد في هذا الشهر.' }));
  } else {
    ctx.container.append(el('div', { class: 'row', style: { flexWrap: 'wrap', marginBottom: '10px' } },
      ...Object.values(EVENT_KINDS)
        .filter((k) => counts[k.key])
        .map((k) => badge(`${k.icon} ${k.label} ${formatNumber(counts[k.key])}`, ''))));
  }

  const table = el('table', { class: 'table calendar-table' },
    el('thead', {}, el('tr', {}, WEEKDAYS.map((d) => el('th', { text: d })))),
    el('tbody', {}, monthGrid(ctx.year, ctx.month).map((week) => el('tr', {}, week.map((date) => {
      if (!date) return el('td', { class: 'cal-empty' });
      const key = dayKey(date);
      const list = days.get(key) || [];
      const isToday = key === dayKey(new Date());
      return el('td', { class: `cal-cell${isToday ? ' cal-today' : ''}` },
        el('div', { class: 'cal-num', text: formatNumber(date.getDate()) }),
        ...list.slice(0, 4).map((e) => el('a', {
          class: `cal-event cal-${e.kind}`,
          href: e.href || '#/calendar',
          title: `${formatDateTime(e.at)} — ${e.title}${e.meta ? ` · ${e.meta}` : ''}`,
          text: `${EVENT_KINDS[e.kind]?.icon || ''} ${e.title}`,
        })),
        list.length > 4 ? el('div', { class: 'muted small', text: `+ ${formatNumber(list.length - 4)}` }) : null);
    })))));

  ctx.container.append(el('div', { class: 'table-wrap' }, table));
  ctx.container.append(el('p', { class: 'muted small', text: 'كل موعد هنا مقروء من سجلّه — التقويم لا يُنشئ شيئًا، والنقر يفتح المصدر. وملف ‎.ics‎ يُضاف مرّة واحدة إلى تقويمك ولا يتزامن بعدها.' }));
}

function move(ctx, step) {
  const d = new Date(ctx.year, ctx.month + step, 1);
  ctx.year = d.getFullYear();
  ctx.month = d.getMonth();
  build(ctx);
}

function goToday(ctx) {
  const now = new Date();
  ctx.year = now.getFullYear();
  ctx.month = now.getMonth();
  build(ctx);
}

function exportMonth(ctx, events) {
  if (!events.length) { toast('لا مواعيد في هذا الشهر', 'info'); return; }
  const text = icsCalendar(events, { name: `كسّاب — ${MONTHS[ctx.month]} ${ctx.year}` });
  downloadBlob(new Blob([text], { type: 'text/calendar;charset=utf-8' }), `kassab-${ctx.year}-${String(ctx.month + 1).padStart(2, '0')}.ics`);
  toast(`صُدّر ${formatNumber(events.length)} موعدًا`, 'success');
}
