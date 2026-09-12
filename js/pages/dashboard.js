// صفحة "الداشبورد" (المرحلة ٥) — تقرأ من كل الكيانات دفعة واحدة (list() لكل مخزن) وتُجمِّع
// في الذاكرة؛ لا حاجة لفهرس جديد ولا لرفع DB_VERSION لحجم بيانات وسيط واحد.
//
// حدّ "لم يُتواصل معه" ثابت STALE_CONTACT_DAYS = 14 يومًا (وفق قرارك اختيار الأرخص: بلا مفتاح
// إعداد إضافي). معدل الاقتناص لكل جولة وترتيب الأحياء يُحسبان بإعادة استعمال tourStats المصدَّرة
// من tours.js بدل تعريف مواز قد يختلف عنها. معدل التحويل ونطاق الإيراد وفق القسم ١٢ من عقد
// البيانات: صفقة العرض الخارجي (بلا propertyId) تدخل الإيراد ولا تدخل معدل التحويل.

import { repo } from '../data/repository.js';
import { ENUMS, labelFor } from '../data/schema.js';
import { getLists, getCompleteness, typeLabel, statusLabel } from '../data/settings.js';
import { tourStats } from './tours.js';
import { el, clear, badge } from '../util/dom.js';
import { formatNumber, formatSAR, daysBetween, relativeDays } from '../util/format.js';
import { formatPhone, toInternational } from '../util/phone.js';

const STALE_CONTACT_DAYS = 14;
const DISTRICT_MIN_SAMPLE = 3;

export async function render(container) {
  const data = await loadData();
  buildLayout(container, data);
}

async function loadData() {
  const [clients, properties, tours, matches, externals, deals, lists, completeness] = await Promise.all([
    repo.clients.list(), repo.properties.list(), repo.tours.list(), repo.matches.list(),
    repo.externalListings.list(), repo.deals.list(), getLists(), getCompleteness(),
  ]);
  const approved = properties.filter((p) => p.captureStatus === 'approved');
  const clientMap = new Map(clients.map((c) => [c.id, c]));
  const dealPropertyIds = new Set(deals.map((d) => d.propertyId).filter(Boolean));
  return { clients, properties, approved, tours, matches, externals, deals, lists, completeness, clientMap, dealPropertyIds };
}

/* ===== أدوات تجميع عامة ===== */

function countBy(items, keyFn) {
  const map = new Map();
  for (const item of items) {
    const raw = keyFn(item);
    const keys = Array.isArray(raw) ? raw : [raw];
    for (const k of keys) {
      if (!k) continue;
      map.set(k, (map.get(k) || 0) + 1);
    }
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

function breakdownColumn(title, pairs, { limit = 8, emptyText = 'لا بيانات بعد' } = {}) {
  const shown = pairs.slice(0, limit);
  const rest = pairs.length - shown.length;
  return el('div', { class: 'breakdown-col' },
    el('h3', { text: title }),
    pairs.length
      ? el('ul', { class: 'simple-list' }, shown.map(([label, count]) => el('li', {},
          el('span', { text: label }), el('span', { class: 'num strong', text: formatNumber(count) }))))
      : el('div', { class: 'muted small', text: emptyText }),
    rest > 0 ? el('div', { class: 'muted small', text: `+ ${formatNumber(rest)} أخرى` }) : null);
}

function panel(title, desc, ...content) {
  return el('div', { class: 'panel' },
    el('h2', { text: title }),
    desc ? el('div', { class: 'panel-desc', text: desc }) : null,
    ...content);
}

/* ===== المؤشرات ===== */

function staleClients(clients) {
  return clients
    .map((c) => {
      const last = repo.clients.lastContactAt(c);
      const days = last ? daysBetween(last) : null;
      return { client: c, last, days };
    })
    .filter((x) => x.days == null || x.days > STALE_CONTACT_DAYS)
    .sort((a, b) => (b.days ?? Infinity) - (a.days ?? Infinity));
}

function districtSuccessRanking(allProperties, dealPropertyIds) {
  const byDistrict = new Map();
  for (const p of allProperties) {
    if (p.source !== 'tour' || !p.district) continue;
    const entry = byDistrict.get(p.district) || { captured: 0, closed: 0 };
    entry.captured += 1;
    if (dealPropertyIds.has(p.id)) entry.closed += 1;
    byDistrict.set(p.district, entry);
  }
  return [...byDistrict.entries()]
    .filter(([, v]) => v.captured >= DISTRICT_MIN_SAMPLE)
    .map(([district, v]) => ({ district, ...v, rate: Math.round((v.closed / v.captured) * 100) }))
    .sort((a, b) => b.rate - a.rate)
    .slice(0, 5);
}

function completenessPct(approved, completeness, clientMap) {
  if (!approved.length) return null;
  const complete = approved.filter((p) => repo.properties.isComplete(p, { owner: clientMap.get(p.ownerId), fields: completeness }).complete).length;
  return Math.round((complete / approved.length) * 100);
}

function dealsSummary(deals, approved) {
  const now = new Date();
  const inRange = (iso, kind) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return false;
    return kind === 'month'
      ? d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
      : d.getFullYear() === now.getFullYear();
  };
  const sum = (list, key) => list.reduce((acc, d) => acc + (Number(d[key]) || 0), 0);
  const monthDeals = deals.filter((d) => inRange(d.date, 'month'));
  const yearDeals = deals.filter((d) => inRange(d.date, 'year'));
  const propertiesWithDeal = new Set(deals.map((d) => d.propertyId).filter(Boolean)).size;
  return {
    monthRevenue: sum(monthDeals, 'finalPrice'), monthCommission: sum(monthDeals, 'commission'),
    yearRevenue: sum(yearDeals, 'finalPrice'), yearCommission: sum(yearDeals, 'commission'),
    totalDeals: deals.length,
    conversion: approved.length ? Math.round((propertiesWithDeal / approved.length) * 100) : null,
  };
}

/* ===== التخطيط ===== */

function statChip(value, label) {
  return el('div', { class: 'stat-chip' }, el('div', { class: 'stat-num', text: formatNumber(value) }), el('div', { class: 'stat-label', text: label }));
}

function buildLayout(container, data) {
  const { clients, properties, approved, tours, matches, externals, deals, lists, completeness, clientMap, dealPropertyIds } = data;
  clear(container);

  const pending = properties.filter((p) => p.captureStatus !== 'approved').length;
  const stale = staleClients(clients);
  const deal = dealsSummary(deals, approved);
  const completePct = completenessPct(approved, completeness, clientMap);

  container.append(
    el('div', { class: 'page-head' },
      el('h1', {}, 'الداشبورد'),
      el('div', { class: 'head-actions' }, el('a', { class: 'btn', href: '#/map', text: 'خريطة العقارات' }))),
  );

  /* شريط الأرقام السريعة */
  container.append(el('div', { class: 'stat-strip' },
    statChip(approved.length, 'عقار في المخزون'),
    statChip(clients.length, 'عميل'),
    statChip(tours.length, 'جولة ميدانية'),
    statChip(pending, 'بانتظار الاعتماد'),
    statChip(deal.totalDeals, 'صفقة (كل الوقت)')));

  const grid = el('div', { class: 'dashboard-grid' });
  container.append(grid);

  /* عملاء لم يُتواصل معهم منذ أكثر من أسبوعين — الأهم */
  grid.append(panel(
    `عملاء لم يُتواصل معهم منذ أكثر من ${formatNumber(STALE_CONTACT_DAYS)} يومًا (${formatNumber(stale.length)})`,
    'مرتّبون: الأطول انقطاعًا أولًا. اتصل أو راسل مباشرة من هنا.',
    stale.length
      ? el('div', { class: 'stale-list' }, stale.slice(0, 12).map((x) => staleClientRow(x)))
      : el('div', { class: 'muted small', text: 'لا يوجد — كل عملائك تم التواصل معهم خلال آخر أسبوعين.' }),
    stale.length > 12 ? el('div', { class: 'muted small', text: `+ ${formatNumber(stale.length - 12)} عميلًا آخر` }) : null,
  ));

  /* طابور بانتظار الاعتماد */
  grid.append(panel('بانتظار الاعتماد', null,
    el('div', { class: 'stat-chip solo' }, el('div', { class: 'stat-num', text: formatNumber(pending) }), el('div', { class: 'stat-label', text: 'عقار من الالتقاط الميداني لم يُعتمد بعد' })),
    pending ? el('a', { class: 'btn btn-primary btn-sm', href: '#/tours/queue', text: 'افتح طابور الاعتماد →' }) : null));

  /* توزيع العقارات */
  grid.append(panel('توزيع العقارات المعتمدة', null,
    el('div', { class: 'breakdown-grid' },
      breakdownColumn('الحالة', countBy(approved, (p) => statusLabel(lists, p.status))),
      breakdownColumn('المدينة', countBy(approved, (p) => p.city)),
      breakdownColumn('الحي', countBy(approved, (p) => p.district)),
      breakdownColumn('النوع', countBy(approved, (p) => typeLabel(lists, p.type))),
      breakdownColumn('الغرض', countBy(approved, (p) => (p.purposes || []).map((k) => labelFor(ENUMS.purposes, k)))))));

  /* العملاء بالمرحلة */
  grid.append(panel('العملاء بحسب المرحلة', null,
    el('ul', { class: 'simple-list' }, ENUMS.clientStages.map((s) => {
      const n = clients.filter((c) => c.stage === s.key).length;
      return el('li', {}, el('span', { text: s.label }), el('span', { class: 'num strong', text: formatNumber(n) }));
    }))));

  /* اكتمال البيانات */
  grid.append(panel('اكتمال بيانات المخزون', null,
    completePct == null
      ? el('div', { class: 'muted small', text: 'لا عقارات معتمدة بعد.' })
      : el('div', { class: 'score' },
          el('span', { class: 'score-num', text: `${formatNumber(completePct)}٪` }),
          el('span', { class: 'score-bar' }, el('span', { class: 'score-fill', style: { width: `${completePct}%` } })))));

  /* المطابقات بحسب الحالة */
  grid.append(panel('المطابقات بحسب الحالة', null,
    matches.length
      ? el('ul', { class: 'simple-list' }, ENUMS.matchStatuses.map((s) => {
          const list = matches.filter((m) => m.status === s.key);
          const external = list.filter((m) => m.externalId).length;
          return el('li', {},
            el('span', { text: s.label }),
            el('span', { class: 'row' },
              el('span', { class: 'num strong', text: formatNumber(list.length) }),
              external ? el('span', { class: 'muted small', text: `(منها ${formatNumber(external)} خارجي)` }) : null));
        }))
      : el('div', { class: 'muted small', text: 'لا مطابقات محفوظة بعد.' })));

  /* الصفقات والإيراد */
  grid.append(panel('الصفقات والإيراد', null,
    el('dl', { class: 'kv' },
      el('dt', { text: 'إيراد هذا الشهر' }), el('dd', { text: formatSAR(deal.monthRevenue) }),
      el('dt', { text: 'عمولة هذا الشهر' }), el('dd', { text: formatSAR(deal.monthCommission) }),
      el('dt', { text: 'إيراد هذه السنة' }), el('dd', { text: formatSAR(deal.yearRevenue) }),
      el('dt', { text: 'عمولة هذه السنة' }), el('dd', { text: formatSAR(deal.yearCommission) }),
      el('dt', { text: 'معدل التحويل (عقار ← صفقة)' }), el('dd', { text: deal.conversion == null ? '—' : `${formatNumber(deal.conversion)}٪` })),
    el('div', { class: 'muted small', text: 'صفقات العروض الخارجية (بلا عقار من مخزونك) تدخل الإيراد والعمولة أعلاه، ولا تدخل معدل التحويل.' })));

  /* الجولات الميدانية */
  grid.append(panel('الجولات الميدانية', null, ...tourSection({ tours, properties, clientMap, completeness, dealPropertyIds })));
}

function tourSection({ tours, properties, clientMap, completeness, dealPropertyIds }) {
  if (!tours.length) return [el('div', { class: 'muted small', text: 'لا جولات بعد.' })];
  const tourCtx = { properties, clientMap, completeness, dealPropertyIds };
  const rows = tours
    .map((tour) => ({ tour, stats: tourStats(tourCtx, tour) }))
    .sort((a, b) => (b.tour.date || '').localeCompare(a.tour.date || ''));
  const ranking = districtSuccessRanking(properties, dealPropertyIds);

  return [
    el('h3', { text: 'معدل الاقتناص لكل جولة (صفقات ÷ عقارات ملتقطة)' }),
    el('ul', { class: 'simple-list' }, rows.slice(0, 8).map(({ tour, stats }) => {
      const rate = stats.captured ? Math.round((stats.closed / stats.captured) * 100) : null;
      return el('li', {},
        el('span', { text: tour.date || 'بلا تاريخ' }),
        el('span', { class: 'row' },
          el('span', { class: 'muted small', text: `${formatNumber(stats.closed)}/${formatNumber(stats.captured)}` }),
          el('span', { class: 'num strong', text: rate == null ? '—' : `${formatNumber(rate)}٪` })));
    })),
    el('h3', { text: `أي الأحياء أجدى (٣ عقارات ملتقطة على الأقل)` }),
    ranking.length
      ? el('ul', { class: 'simple-list' }, ranking.map((r) => el('li', {},
          el('span', { text: r.district }),
          el('span', { class: 'row' },
            el('span', { class: 'muted small', text: `${formatNumber(r.closed)}/${formatNumber(r.captured)}` }),
            el('span', { class: 'num strong', text: `${formatNumber(r.rate)}٪` })))))
      : el('div', { class: 'muted small', text: 'لا حي بلغ ٣ عقارات ملتقطة بعد.' }),
  ];
}

function staleClientRow(x) {
  const c = x.client;
  const name = c.name || formatPhone(c.phone) || 'عميل بلا اسم';
  const lastText = x.days == null ? 'لم يُتواصل معه إطلاقًا' : `آخر تواصل ${relativeDays(x.last)}`;
  const intl = c.phone ? toInternational(c.phone) : '';
  const actions = [];
  if (c.phone) {
    actions.push(el('a', { class: 'btn btn-ghost btn-sm', href: `tel:${c.phone}`, text: '📞' }));
    if (/^966\d{9}$/.test(intl)) {
      actions.push(el('a', { class: 'btn btn-ghost btn-sm', href: `https://wa.me/${intl}`, target: '_blank', rel: 'noopener noreferrer', text: '💬' }));
    }
  }
  return el('div', { class: 'stale-row' },
    el('div', {}, el('div', { class: 'strong' }, name), el('div', { class: 'muted small', text: lastText })),
    el('div', { class: 'row' }, badge(labelFor(ENUMS.clientStages, c.stage)), ...actions));
}
