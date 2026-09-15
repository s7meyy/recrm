// صفحة "الداشبورد" (المرحلة ٥، وحدّ "لم يُتواصل معه" صار قابلًا للتعديل من الإعدادات في
// المرحلة ٦ — راجع getFollowUpSettings في settings.js). معدل الاقتناص لكل جولة وترتيب الأحياء
// يُحسبان بإعادة استعمال tourStats المصدَّرة من tours.js بدل تعريف مواز قد يختلف عنها. معدل
// التحويل ونطاق الإيراد وفق القسم ١٢ من عقد البيانات: صفقة العرض الخارجي (بلا propertyId) تدخل
// الإيراد ولا تدخل معدل التحويل.

import { repo } from '../data/repository.js';
import { ENUMS, labelFor, invoiceGrandTotal } from '../data/schema.js';
import { getLists, getCompleteness, getFollowUpSettings, typeLabel, statusLabel, getCompany } from '../data/settings.js';
import { tourStats } from './tours.js';
import { buildPriceIndex } from '../util/price-stats.js';
import { conversionFunnel } from '../util/funnel.js';
import { sourceReport, propertyProfit } from '../util/sources.js';
import { showingStats } from '../util/showings.js';
import { revenueForecast } from '../util/forecast.js';
import { el, clear, badge } from '../util/dom.js';
import { formatNumber, formatSAR, daysBetween, relativeDays, countWord } from '../util/format.js';
import { formatPhone, toInternational } from '../util/phone.js';
import { discountEffect } from '../util/property-evidence.js';

const DISTRICT_MIN_SAMPLE = 3;

export async function render(container) {
  const data = await loadData();
  buildLayout(container, data);
}

async function loadData() {
  const [clients, properties, tours, matches, externals, deals, lists, completeness, followUp, tasks, invoices, expenses, requests] = await Promise.all([
    repo.clients.list(), repo.properties.list(), repo.tours.list(), repo.matches.list(),
    repo.externalListings.list(), repo.deals.list(), getLists(), getCompleteness(), getFollowUpSettings(), repo.tasks.list(),
    repo.invoices.list(), repo.expenses.list(), repo.requests.list(),
  ]);
  const showings = await repo.showings.list(); // المعاينات (المرحلة ٢٧)
  const company = await getCompany(); // نسبة العمولة لتوقّع الإيراد (المرحلة ٢٨)
  const approved = properties.filter((p) => p.captureStatus === 'approved');
  const clientMap = new Map(clients.map((c) => [c.id, c]));
  const dealPropertyIds = new Set(deals.map((d) => d.propertyId).filter(Boolean));
  return { clients, properties, approved, tours, matches, externals, deals, lists, completeness, followUp, tasks, invoices, expenses, requests, showings, company, clientMap, dealPropertyIds };
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

/**
 * لوحة في الداشبورد. و`money: true` توسمها **حسّاسة** (المرحلة ٣٦).
 *
 * كان `data-sensitive` موسومًا في ثمانية مواضع في صفحتين، يغطّي اسم المالك وجوّال العميل
 * وملاحظاتك — **ولا يغطّي العمولة إطلاقًا**. فكان «وضع العرض للعميل» يُريه أرباحك، ووضعُ
 * المساعد كذلك. وهذا خُلْفٌ لما وعدتْ به الميزة، وخُلْفُ الوعد في حجبٍ أسوأ من غيابه:
 * تبني عليه ثقةً لا يستحقّها.
 */
function panel(title, desc, ...content) {
  return el('div', { class: 'panel' },
    el('h2', { text: title }),
    desc ? el('div', { class: 'panel-desc', text: desc }) : null,
    ...content);
}

/** لوحةٌ فيها مال: تُخفى في «وضع العرض للعميل» وفي وضع المساعد. */
function moneyPanel(title, desc, ...content) {
  const node = panel(title, desc, ...content);
  node.setAttribute('data-sensitive', '');
  return node;
}

/* ===== المؤشرات ===== */

function staleClients(clients, staleDays) {
  return clients
    .map((c) => {
      const last = repo.clients.lastContactAt(c);
      const days = last ? daysBetween(last) : null;
      return { client: c, last, days };
    })
    .filter((x) => x.days == null || x.days > staleDays)
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
  const { clients, properties, approved, tours, matches, externals, deals, lists, completeness, followUp, tasks, invoices, expenses, requests, showings, company, clientMap, dealPropertyIds } = data;
  clear(container);

  const pending = properties.filter((p) => p.captureStatus !== 'approved').length;
  const staleDays = followUp.staleContactDays;
  const stale = staleClients(clients, staleDays);
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
    `عملاء لم يُتواصل معهم منذ أكثر من ${formatNumber(staleDays)} يومًا (${formatNumber(stale.length)})`,
    'مرتّبون: الأطول انقطاعًا أولًا. اتصل أو راسل مباشرة من هنا.',
    stale.length
      ? el('div', { class: 'stale-list' }, stale.slice(0, 12).map((x) => staleClientRow(x)))
      : el('div', { class: 'muted small', text: `لا يوجد — كل عملائك تم التواصل معهم خلال آخر ${formatNumber(staleDays)} يومًا.` }),
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
  grid.append(moneyPanel('الصفقات والإيراد', null,
    el('dl', { class: 'kv' },
      el('dt', { text: 'إيراد هذا الشهر' }), el('dd', { text: formatSAR(deal.monthRevenue) }),
      el('dt', { text: 'عمولة هذا الشهر' }), el('dd', { text: formatSAR(deal.monthCommission) }),
      el('dt', { text: 'إيراد هذه السنة' }), el('dd', { text: formatSAR(deal.yearRevenue) }),
      el('dt', { text: 'عمولة هذه السنة' }), el('dd', { text: formatSAR(deal.yearCommission) }),
      el('dt', { text: 'معدل التحويل (عقار ← صفقة)' }), el('dd', { text: deal.conversion == null ? '—' : `${formatNumber(deal.conversion)}٪` })),
    el('div', { class: 'muted small', text: 'صفقات العروض الخارجية (بلا عقار من مخزونك) تدخل الإيراد والعمولة أعلاه، ولا تدخل معدل التحويل.' })));

  /* صافي الربح ولماذا تضيع الصفقات (المرحلة ١٣) */
  grid.append(moneyPanel('صافي الربح', null, ...profitSection({ deals, expenses })));
  grid.append(panel('أين تضيع: قمع التحويل', null, ...funnelSection({ requests, matches })));
  grid.append(panel('لماذا تضيع الصفقات', null, ...rejectSection(matches)));
  grid.append(panel('لماذا يتركك الناس', 'سبب موت الطلب كلّه لا سبب رفض عرضٍ واحد.', ...lossSection(requests)));

  /* توقّع الإيراد (المرحلة ٢٨) */
  grid.append(moneyPanel('العمولة المتوقَّعة', 'من طلباتك النشطة ونسب قمعك أنت — تقدير لا وعد.',
    ...forecastSection({ requests, matches, deals, company })));

  /* المعاينات ونسبتها إلى الصفقات (المرحلة ٢٧) */
  grid.append(panel('المعاينات', 'الموعد الذي يصير صفقة — والذي لا يصير.', ...showingSection({ showings, deals })));
  // رحلة السعر مجموعةً (المرحلة ٣٥، البند أ٤): التخفيض مكتوبٌ في كل سجل ولم يُقرأ قط.
  const discount = discountSection({ properties: approved, deals });
  if (discount) grid.append(discount);

  /* من أين يأتي المال، وأي عقار يستحق جهدك (المرحلة ٢٤) */
  grid.append(moneyPanel('مصادر العملاء', 'أي مصدرٍ أعطاك صفقات لا مجرد أسماء.', ...sourceSection({ clients, requests, deals, expenses })));
  grid.append(moneyPanel('ربحية العقارات', 'العمولة الصافية ناقص ما صُرف على العقار.', ...propertySection({ properties, deals, expenses, lists })));

  /* مؤشر السوق من بياناتك (المرحلة ١١) */
  grid.append(panel('مؤشر سعر المتر', null, ...priceSection({ properties, externals, deals, lists })));

  /* الفواتير وعروض الأسعار (المرحلة ١٠) */
  grid.append(moneyPanel('الفواتير وعروض الأسعار', null, ...invoiceSection(invoices)));

  /* الجولات الميدانية */
  grid.append(panel('الجولات الميدانية', null, ...tourSection({ tours, properties, clientMap, completeness, dealPropertyIds })));

  /* المهام (المرحلة ٧) */
  grid.append(panel('المهام', null, ...taskSection(tasks)));
}

/**
 * مؤشرات المستندات المالية: الفواتير وعروض الأسعار منفصلان (عرض السعر ليس إيرادًا).
 * الإجمالي يُحسب من البنود لحظة العرض بـinvoiceTotal — لا مجموع مخزَّن (القسم ١٦).
 */
/**
 * توقّع الإيراد (المرحلة ٢٨): أنبوبك × احتمالك التاريخي × نسبة عمولتك.
 * **ولا رقم قبل عيّنة كافية:** نسبةٌ من صفقتين ليست نسبة، فيُعرض الأنبوب وحده حتى تكبر.
 */
function forecastSection({ requests, matches, deals, company }) {
  const f = revenueForecast({
    requests, matches, deals, commissionPercent: Number(company.commissionPercent) || 2.5,
  });
  const pct = (v) => (v == null ? '—' : `${formatNumber(Math.round(v * 100))}٪`);
  if (!f.ok) {
    return [
      el('dl', { class: 'kv' },
        el('dt', { text: 'قيمة الطلبات النشطة' }), el('dd', { text: formatSAR(f.pipeline) }),
        el('dt', { text: 'طلبات بميزانية' }), el('dd', { text: formatNumber(f.counted) })),
      el('div', { class: 'muted small', text: `لا توقّع بعد: يحتاج ${formatNumber(f.minDeals)} صفقات مكتملة فأكثر ليُبنى على تاريخك أنت. عندك ${formatNumber(f.closed)}.` }),
      f.noBudget ? el('div', { class: 'muted small', text: `${formatNumber(f.noBudget)} طلبًا نشطًا بلا ميزانية — لا يدخل الحساب.` }) : null,
    ].filter(Boolean);
  }
  return [
    el('dl', { class: 'kv' },
      el('dt', { text: 'العمولة المتوقَّعة' }),
      el('dd', {}, badge(`${formatSAR(f.low)} — ${formatSAR(f.high)}`, 'badge-ok')),
      el('dt', { text: 'الأقرب إلى الوسط' }), el('dd', { text: formatSAR(f.expected) }),
      el('dt', { text: 'قيمة الأنبوب' }), el('dd', { text: formatSAR(f.pipeline) })),
    el('div', { class: 'table-wrap' }, el('table', { class: 'table' },
      el('thead', {}, el('tr', {}, ['المرحلة', 'طلبات', 'قيمتها', 'احتمالك', 'متوقَّع'].map((t) => el('th', { text: t })))),
      el('tbody', {}, f.stages.map((st) => el('tr', {},
        el('td', { class: 'strong', text: st.label }),
        el('td', { class: 'num', text: formatNumber(st.count) }),
        el('td', { class: 'num', text: formatSAR(st.value) }),
        el('td', { class: 'num', text: pct(st.rate) }),
        el('td', { class: 'num strong', text: formatSAR(st.expected) })))))),
    f.noBudget ? el('div', { class: 'muted small', text: `${formatNumber(f.noBudget)} طلبًا نشطًا بلا ميزانية — خارج الحساب لأن قيمته لا تُخمَّن.` }) : null,
    el('div', { class: 'muted small', text: 'الاحتمال محسوب من طلباتك التي أُنجزت فعلًا، والقيمة من سقف الميزانية. وهو تقدير يتحرك مع بياناتك — لا وعد.' }),
  ].filter(Boolean);
}

/**
 * «هل ينفع التخفيض معك؟» (المرحلة ٣٥).
 *
 * `priceHistory` يُكتب عند كل تغيير سعر منذ زمن ولا يُقرأ إلا داخل حسابات السعر. وفيه جوابٌ
 * لا يملكه غيرك: كم يومًا بِعتَ **بعد** التخفيض، وأي نسبةٍ هي التي باعت فعلًا — فتكفّ عن
 * اقتراح خمسة بالمئة وأنت تعرف أن ما باع عندك كان اثني عشر.
 *
 * ولا يُعطى رقمٌ دون عيّنة: صفقتان لا تصنعان قاعدة، والصمت هنا أصدق.
 */
function discountSection({ properties, deals }) {
  const d = discountEffect({ properties, deals });
  if (!d.sold) return null;
  if (d.sample < 3) {
    return el('div', { class: 'panel' },
      el('h2', { text: 'هل ينفع التخفيض معك؟' }),
      el('p', { class: 'panel-desc', text: `بِعتَ ${formatNumber(d.sold)} عقارًا، منها ${formatNumber(d.soldAfterCut)} بعد تخفيضٍ مسجَّل.`
        + ' والعيّنة أقلّ من ثلاث، فلا رقم — نسبةٌ من صفقتين ليست نسبة.' }));
  }
  return el('div', { class: 'panel' },
    el('h2', { text: 'هل ينفع التخفيض معك؟' }),
    el('p', { class: 'panel-desc', text: 'من تاريخك أنت لا من قاعدةٍ عامة — وآخر تخفيضٍ سبق الصفقة هو المحسوب، فلا تُنسب صفقةٌ إلى تخفيضٍ جاء بعدها.' }),
    el('div', { class: 'stat-strip' },
      statChip(d.soldAfterCut, `من ${formatNumber(d.sold)} صفقة سبقها تخفيض`),
      statChip(Math.round(d.medianCut * 100), 'وسيط نسبة التخفيض (٪)'),
      statChip(d.medianDays, 'يومًا وسطيًّا من التخفيض إلى البيع')));
}

/**
 * المعاينات (المرحلة ٢٧): وحدتها **المعاينة** لا الطلب، ولذلك هي لوحة مستقلة لا مرحلة في
 * القمع — القمع كل مراحله بالطلب وكل مرحلة مجموعة جزئية مما قبلها، والمعاينة تكسر الشرطين.
 */
function showingSection({ showings, deals }) {
  const s = showingStats({ showings, deals });
  if (!s.total) {
    return [el('div', { class: 'muted small', text: 'لا معاينات مسجَّلة بعد — حدّدها من زرّ «معاينة» في صفحة المطابقات.' })];
  }
  const pct = (v) => (v == null ? '—' : `${formatNumber(Math.round(v * 100))}٪`);
  return [
    el('div', { class: 'stat-strip' },
      statChip(s.scheduled, 'موعد قادم'),
      statChip(s.done, 'معاينة تمّت'),
      statChip(s.converted, 'صارت صفقة')),
    el('dl', { class: 'kv' },
      el('dt', { text: 'نسبة الحضور' }), el('dd', { text: pct(s.showRate) }),
      el('dt', { text: 'معاينة ← صفقة' }), el('dd', {}, badge(pct(s.closeRate), s.closeRate >= 0.2 ? 'badge-ok' : '')),
      el('dt', { text: 'معاينات لكل صفقة' }), el('dd', { text: s.perDeal == null ? '—' : formatNumber(Math.round(s.perDeal * 10) / 10) }),
      el('dt', { text: 'أعجبه / متردّد / لم يعجبه' }),
      el('dd', { text: `${formatNumber(s.liked)} / ${formatNumber(s.maybe)} / ${formatNumber(s.disliked)}` })),
    s.reasons.length
      ? breakdownColumn('لماذا لم يعجبهم', s.reasons.map(([key, n]) => [labelFor(ENUMS.matchRejectReasons, key), n]))
      : null,
    s.done < 5
      ? el('div', { class: 'muted small', text: 'العيّنة صغيرة: النسبة تستقرّ بعد خمس معاينات فأكثر.' })
      : null,
    el('div', { class: 'muted small', text: 'الصفقة تُنسب إلى معاينتها بشرط العميل نفسه والعقار نفسه وتاريخٍ بعدها — فلا يتملّق الرقم نفسه.' }),
  ].filter(Boolean);
}

/**
 * أداء مصادر العملاء (المرحلة ٢٤): تاق «المصدر» يُكتب منذ المرحلة ٨ ولم يكن يُقرأ.
 * العمود الحاسم هو **العمولة**، لأن مصدرًا يعطيك خمسين اسمًا بلا صفقة تكلفةٌ لا مورد.
 */
function sourceSection({ clients, requests, deals, expenses }) {
  const { rows, totals } = sourceReport({ clients, requests, deals, expenses });
  if (!rows.length) return [el('div', { class: 'muted small', text: 'لا عملاء بعد.' })];
  const pct = (v) => (v == null ? '—' : `${formatNumber(Math.round(v * 100))}٪`);
  return [
    el('div', { class: 'table-wrap' }, el('table', { class: 'table' },
      el('thead', {}, el('tr', {}, ['المصدر', 'عملاء', 'صفقات', 'تحويل', 'عمولة', 'كلفة', 'الصافي'].map((t) => el('th', { text: t })))),
      el('tbody', {}, rows.slice(0, 10).map((r) => el('tr', {},
        el('td', { class: 'strong', text: r.source }),
        el('td', { class: 'num', text: formatNumber(r.clients) }),
        el('td', { class: 'num', text: formatNumber(r.deals) }),
        el('td', { class: 'num', text: pct(r.conversion) }),
        el('td', { class: 'num', text: formatSAR(r.commission) }),
        el('td', { class: 'num', text: r.spent ? formatSAR(r.spent) : '—' }),
        // الصافي هو الحكم — وسالبُه يُلوَّن بلون الخطأ: مصدرٌ يأخذ أكثر مما يعطي.
        el('td', { class: 'num strong' }, r.spent
          ? badge(formatSAR(r.net), r.net >= 0 ? 'badge-ok' : 'badge-danger')
          : el('span', { text: formatSAR(r.commission) })))))))
    ,
    rows.length > 10 ? el('div', { class: 'muted small', text: `+ ${formatNumber(rows.length - 10)} مصدرًا آخر` }) : null,
    el('div', { class: 'muted small', text: `${formatNumber(totals.sources)} مصدرًا مسمّى · العمولة صافية بعد نصيب الشريك.`
      + (totals.spent ? ` · صُرف ${formatSAR(totals.spent)} موسومًا بمصدره.` : ' · لا مصروف موسوم بمصدره بعد — وسم المصروف في صفحة المصاريف يجعل هذا الجدول ربحًا لا عدًّا.') }),
    totals.deals < 5
      ? el('div', { class: 'muted small', text: 'العيّنة صغيرة: لا تُلغِ مصدرًا قبل أن تتجاوز صفقاتك خمسًا.' })
      : null,
  ].filter(Boolean);
}

/** ربحية العقار: عمولاته ناقص مصاريفه. عقارٌ صُرف عليه ولم يُبَع يظهر بصافٍ سالب — وهذا مقصود. */
function propertySection({ properties, deals, expenses, lists }) {
  const rows = propertyProfit({ properties, deals, expenses });
  if (!rows.length) return [el('div', { class: 'muted small', text: 'لا صفقة ولا مصروف مربوط بعقار بعد.' })];
  const name = (r) => (r.property
    ? `${typeLabel(lists, r.property.type)} — ${[r.property.district, r.property.city].filter(Boolean).join('، ')}`
    : 'عقار محذوف');
  return [
    el('div', { class: 'table-wrap' }, el('table', { class: 'table' },
      el('thead', {}, el('tr', {}, ['العقار', 'عمولة', 'مصاريف', 'الصافي'].map((t) => el('th', { text: t })))),
      el('tbody', {}, rows.slice(0, 10).map((r) => el('tr', {},
        el('td', { class: 'strong', text: name(r) }),
        el('td', { class: 'num', text: formatSAR(r.commission) }),
        el('td', { class: 'num', text: formatSAR(r.spent) }),
        el('td', { class: 'num' }, badge(formatSAR(r.net), r.net < 0 ? 'badge-danger' : 'badge-ok')))))))
    ,
    rows.length > 10 ? el('div', { class: 'muted small', text: `+ ${formatNumber(rows.length - 10)} عقارًا آخر` }) : null,
  ].filter(Boolean);
}

/**
 * وسيط سعر المتر لكل (حي × نوع) من مخزونك وعروضك وصفقاتك — لا مصدر خارجي.
 * يُذكر حجم العيّنة دائمًا: رقمٌ من عيّنتين ليس كرقمٍ من عشرين، والقرار قرارك.
 */
function priceSection({ properties, externals, deals, lists }) {
  const index = buildPriceIndex({ properties, externals, deals, minSample: 2 });
  if (!index.rows.length) {
    return [el('div', { class: 'muted small', text: 'لا عيّنة كافية بعد — يلزم عقاران على الأقل بسعر ومساحة في الحي والنوع نفسه.' })];
  }
  const rows = index.rows.slice(0, 10).map((r) => el('tr', {},
    el('td', { text: r.district || r.city || '—' }),
    el('td', { text: typeLabel(lists, r.type) }),
    el('td', { class: 'small', text: r.purpose === 'rent' ? 'إيجار' : 'بيع' }),
    el('td', { class: 'num strong', text: `${formatNumber(Math.round(r.median))}` }),
    el('td', { class: 'num', text: formatNumber(r.count) }),
    el('td', { class: 'small muted', text: [r.sources.deal ? `${r.sources.deal} صفقة` : '', r.sources.external ? `${r.sources.external} خارجي` : ''].filter(Boolean).join(' · ') || 'مخزونك' })));
  return [
    el('div', { class: 'table-wrap' }, el('table', { class: 'table' },
      el('thead', {}, el('tr', {}, ['الحي', 'النوع', 'الغرض', 'وسيط سعر المتر', 'العيّنة', 'المصدر'].map((t) => el('th', { text: t })))),
      el('tbody', {}, rows))),
    el('div', { class: 'muted small', text: 'الوسيط لا المتوسط (فلا يفسده عرض شاذّ واحد). والصفقات المنجزة تدخل بسعرها النهائي لا المطلوب. والبيع مفصول عن الإيجار.' }),
  ];
}

/**
 * قمع التحويل: كم طلبًا يبلغ كل مرحلة، وأين أكبر سقوط.
 * الوحدة «طلب» في كل المراحل — ولذلك لا تصعد نسبةٌ فوق المئة أبدًا.
 */
const REQUEST_FORMS = ['طلب واحد', 'طلبان', 'طلبات', 'طلبًا'];

function funnelSection({ requests, matches }) {
  const { stages, worst, totals } = conversionFunnel({ requests, matches });
  if (!stages[0].count) {
    return [el('div', { class: 'muted small', text: 'لا طلبات بعد — القمع يبدأ من أول طلب تسجّله.' })];
  }
  const top = stages[0].count;
  const rows = stages.map((st) => el('div', { class: 'funnel-row' },
    el('span', { class: 'funnel-name', text: st.label }),
    el('span', { class: 'funnel-bar' }, el('span', {
      class: 'funnel-fill', style: { width: `${Math.round((st.count / top) * 100)}%` },
    })),
    el('span', { class: 'funnel-num' },
      el('span', { class: 'strong', text: formatNumber(st.count) }),
      st.rate == null ? null : el('span', { class: 'muted small', text: ` ${Math.round(st.rate * 100)}٪` }))));

  const tail = [];
  if (worst) {
    tail.push(el('div', { class: 'funnel-drop small' },
      el('strong', { text: `أكبر سقوط: ${countWord(worst.lost, REQUEST_FORMS)} عند «${worst.label}». ` }), worst.advice));
  }
  tail.push(el('div', { class: 'muted small' },
    totals.overall == null ? '' : `التحويل الكلّي: ${Math.round(totals.overall * 100)}٪ من طلباتك أُبرمت. `,
    'الطلبات الموقوفة مستثناة، والمُنجزة محسوبة (فهي موضع الفوز نفسه).'));
  return [...rows, ...tail];
}

/** عمولاتك ناقص مصاريفك — سعر البيع نفسه ليس دخلك فلا يدخل هنا. */
function profitSection({ deals, expenses }) {
  const now = new Date();
  const inRange = (iso, kind) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return false;
    return kind === 'month' ? d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() : d.getFullYear() === now.getFullYear();
  };
  const sum = (list, key, kind) => list.filter((x) => inRange(x.date, kind)).reduce((a, x) => a + (Number(x[key]) || 0), 0);
  const rows = [['month', 'هذا الشهر'], ['year', 'هذه السنة']].map(([kind, label]) => {
    const commission = sum(deals, 'commission', kind);
    const spent = sum(expenses, 'amount', kind);
    return { label, commission, spent, net: commission - spent };
  });
  return [
    el('dl', { class: 'kv' }, rows.flatMap((r) => [
      el('dt', { text: `عمولات ${r.label}` }), el('dd', { text: formatSAR(r.commission) }),
      el('dt', { text: `مصاريف ${r.label}` }), el('dd', { text: formatSAR(r.spent) }),
      el('dt', { text: `صافي ${r.label}` }), el('dd', {}, badge(formatSAR(r.net), r.net < 0 ? 'badge-danger' : 'badge-ok')),
    ])),
    el('div', { class: 'muted small', text: 'الإيراد في لوحة «الصفقات» هو سعر البيع لا دخلك؛ الدخل هو العمولة، والصافي بعد المصاريف.' }),
    el('a', { class: 'btn btn-sm', href: '#/expenses', text: 'افتح المصاريف →' }),
  ];
}

/** أسباب رفض العملاء: نمطك الحقيقي يظهر بعد ثلاثين رفضًا لا بعد ثلاثة. */
function rejectSection(matches) {
  const rejected = matches.filter((m) => m.status === 'not_interested');
  if (!rejected.length) return [el('div', { class: 'muted small', text: 'لا مطابقات مرفوضة بعد.' })];
  const withReason = rejected.filter((m) => m.rejectReason);
  const counts = countBy(withReason, (m) => labelFor(ENUMS.matchRejectReasons, m.rejectReason));
  return [
    el('div', { class: 'stat-strip' },
      statChip(rejected.length, 'مطابقة مرفوضة'),
      statChip(rejected.length - withReason.length, 'بلا سبب مسجَّل')),
    withReason.length
      ? breakdownColumn('الأسباب', counts)
      : el('div', { class: 'muted small', text: 'لم يُسجَّل سبب لأي رفض بعد — يُسأل تلقائيًا عند اختيار «غير مهتم».' }),
    withReason.length < 10
      ? el('div', { class: 'muted small', text: 'العيّنة صغيرة: لا تبنِ قرارًا على أقل من عشرة أسباب.' })
      : null,
  ].filter(Boolean);
}

/**
 * «لماذا يتركك الناس؟» (المرحلة ٣٥).
 *
 * اللوحة التي قبلها تقول لماذا رُفض **عرضٌ بعينه**. وهذه تقول لماذا مات **الطلب كلّه** —
 * والفرق بينهما هو الفرق بين تحسين عرضٍ وتحسين نفسك: «السعر مرتفع» في عرضٍ تغيّر العرض،
 * و«تأخّر الردّ» في خُمس طلباتك تغيّر يومك.
 */
function lossSection(requests) {
  // «موقوف» وحده: `done` صفقةٌ تمّت لا خسارة، وعدّها هنا يقلب الرقم رأسًا على عقب.
  const dead = requests.filter((r) => r.status === 'paused');
  if (!dead.length) return [el('div', { class: 'muted small', text: 'لا طلبات موقوفة بعد.' })];
  const withReason = dead.filter((r) => r.closeReason);
  const counts = countBy(withReason, (r) => labelFor(ENUMS.matchRejectReasons, r.closeReason));
  // ما يخصّك أنت من الأسباب: هذه وحدها التي بيدك إصلاحها اليوم.
  const mine = withReason.filter((r) => r.closeReason === 'slow' || r.closeReason === 'price').length;
  return [
    el('div', { class: 'stat-strip' },
      statChip(dead.length, 'طلب أُوقف'),
      statChip(dead.length - withReason.length, 'بلا سبب مسجَّل'),
      statChip(mine, 'بسببٍ بيدك (سعرك أو بطء ردّك)')),
    withReason.length
      ? breakdownColumn('الأسباب', counts)
      : el('div', { class: 'muted small', text: 'لم يُسجَّل سبب لأي طلب موقوف بعد — اختر السبب عند تغيير حالة الطلب إلى «موقوف».' }),
    withReason.length && withReason.length < 10
      ? el('div', { class: 'muted small', text: 'العيّنة صغيرة: لا تبنِ قرارًا على أقل من عشرة أسباب.' })
      : null,
  ].filter(Boolean);
}

function invoiceSection(invoices) {
  if (!invoices.length) {
    return [el('div', { class: 'muted small', text: 'لا فواتير ولا عروض أسعار بعد.' }),
      el('a', { class: 'btn btn-sm', href: '#/invoices', text: 'افتح صفحة الفواتير →' })];
  }
  const now = new Date();
  const thisMonth = (iso) => {
    const d = new Date(iso);
    return !Number.isNaN(d.getTime()) && d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  };
  const bills = invoices.filter((x) => x.type === 'invoice');
  const quotes = invoices.filter((x) => x.type === 'quote');
  const sum = (list) => list.reduce((acc, x) => acc + invoiceGrandTotal(x), 0);
  return [
    el('div', { class: 'stat-strip' },
      statChip(bills.length, 'فاتورة'),
      statChip(quotes.length, 'عرض سعر'),
      statChip(bills.filter((x) => thisMonth(x.date)).length, 'فاتورة هذا الشهر')),
    el('dl', { class: 'kv' },
      el('dt', { text: 'إجمالي الفواتير' }), el('dd', { text: formatSAR(sum(bills)) }),
      el('dt', { text: 'فواتير هذا الشهر' }), el('dd', { text: formatSAR(sum(bills.filter((x) => thisMonth(x.date)))) }),
      el('dt', { text: 'قيمة عروض الأسعار المعلّقة' }), el('dd', { text: formatSAR(sum(quotes)) })),
    el('div', { class: 'muted small', text: 'عرض السعر ليس إيرادًا — يُعرض هنا لمتابعة ما لم يتحوّل إلى فاتورة بعد.' }),
    el('a', { class: 'btn btn-sm', href: '#/invoices', text: 'افتح صفحة الفواتير →' }),
  ];
}

function taskSection(tasks) {
  const pending = tasks.filter((t) => !t.done);
  const done = tasks.filter((t) => t.done);
  const overdue = pending.filter((t) => t.dueAt && new Date(t.dueAt).getTime() < Date.now());
  if (!tasks.length) {
    return [el('div', { class: 'muted small', text: 'لا مهام بعد.' }),
      el('a', { class: 'btn btn-sm', href: '#/tasks', text: 'افتح صفحة المهام →' })];
  }
  return [
    el('div', { class: 'stat-strip' },
      statChip(pending.length, 'مهمة متبقية'),
      statChip(done.length, 'مهمة منجزة'),
      statChip(overdue.length, 'متأخرة عن موعدها')),
    el('a', { class: 'btn btn-sm', href: '#/tasks', text: 'افتح صفحة المهام →' }),
  ];
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
