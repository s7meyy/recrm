// صفحة العقارات: عرض شبكة/جدول، شريط الفرز بعدّاداته، نموذج الإضافة والتعديل.

import { repo, ValidationError } from '../data/repository.js';
import { ENUMS, TYPE_FIELD_GROUPS, COMPLETENESS_CANDIDATES, labelFor } from '../data/schema.js';
import {
  getLists, addPropertyType, addPropertyStatus, addCity, addDistrict,
  getCustomFields, getCompleteness, getUI, setUI, typeLabel, statusLabel, typeGroup,
} from '../data/settings.js';
import { storeImage, getImageUrl, deleteImages } from '../data/images.js';
import {
  el, clear, labeled, fieldGroup, selectEl, checkbox, badge, openModal, confirmDialog,
  promptDialog, toast, emptyState, debounce,
} from '../util/dom.js';
import { formatSAR, formatArea, formatDate, formatNumber } from '../util/format.js';
import { matchesQuery } from '../util/arabic.js';
import { formatPhone } from '../util/phone.js';
import { parseLocation, isShortMapLink, mapsLink, locationToText } from '../util/location.js';
import { LISTING_GROUPS, LISTING_VALUES, listingFilterOptions } from '../util/property-filters.js';
import { sourceField, rememberSource, sourceBadge } from '../util/source-field.js';
import { announceMatches } from '../util/match-alert.js';
import { getTemplates, getCompany } from '../data/settings.js';
import { getCurrentUser } from '../data/repository.js';
import { renderTemplate, templateValues, whatsappLink } from '../util/templates.js';
import { buildPriceIndex, comparePrice } from '../util/price-stats.js';
import { printProperty, printPropertyCatalog, printAgreement } from '../util/property-print.js';

// "الحالة" فرز خاص بالعقارات (بلا معنى للعروض الخارجية) فيبقى معرَّفًا هنا؛ بقية المجموعات
// مشتركة مع خريطة العقارات عبر util/property-filters.js فلا تنحرف الصفحتان عن بعضهما.
const GROUPS = [['status', 'الحالة'], ...LISTING_GROUPS];
const VALUES = { status: (p) => [p.status], ...LISTING_VALUES };
const STATUS_STYLE = { agreed: 'badge-ok', refused: 'badge-danger', sold: 'badge-accent', rented: 'badge-accent', not_contacted: 'badge-warn' };

// يقرأ #/properties/<id> (نفس نمط #/matches/<requestId> الموثّق) — يتيح لخريطة العقارات
// فتح نموذج تعديل عقار بعينه مباشرة بلا تكرار للنموذج (~350 سطرًا) في صفحة منفصلة.
function routePropertyId() {
  const m = /^#\/properties\/([^/?#]+)/.exec(location.hash || '');
  return m ? decodeURIComponent(m[1]) : null;
}

export async function render(container) {
  const ctx = {
    container, query: '', view: 'grid', selected: new Set(),
    sort: { key: 'createdAt', dir: 'desc' },
    filters: Object.fromEntries(GROUPS.map(([k]) => [k, new Set()])),
    properties: [], clients: [], clientMap: new Map(),
    lists: null, customFields: [], completeness: [], nodes: {},
  };
  ctx.view = (await getUI()).propertiesView === 'table' ? 'table' : 'grid';
  await loadData(ctx);
  buildLayout(ctx);
  const focusId = routePropertyId();
  if (focusId) {
    const target = ctx.properties.find((p) => p.id === focusId);
    if (target) await openForm(ctx, target);
    else toast('العقار غير موجود، أو حُذف، أو لم يُعتمد بعد', 'error');
  }
}

async function loadData(ctx) {
  const [properties, clients, lists, customFields, completeness, externals, deals] = await Promise.all([
    repo.properties.list(), repo.clients.list(), getLists(), getCustomFields(), getCompleteness(),
    repo.externalListings.list(), repo.deals.list(),
  ]);
  // العقارات بانتظار المعالجة/الاعتماد (المرحلة ٢) لا تظهر هنا ولا تدخل أي مطابقة — راجعها من صفحة الجولات الميدانية.
  const approved = properties.filter((p) => p.captureStatus === 'approved');
  approved.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  ctx.properties = approved;
  ctx.clients = clients;
  ctx.clientMap = new Map(clients.map((c) => [c.id, c]));
  ctx.lists = lists;
  ctx.customFields = customFields;
  ctx.completeness = completeness;
  // مؤشر سعر المتر من بياناتك أنت (المرحلة ١١): المخزون المعتمد + العروض النشطة + الصفقات.
  ctx.priceIndex = buildPriceIndex({ properties, externals, deals });
}

async function refresh(ctx) {
  await loadData(ctx);
  renderFilters(ctx);
  renderList(ctx);
}

function buildLayout(ctx) {
  clear(ctx.container);
  const search = el('input', {
    class: 'input search', type: 'search', placeholder: 'بحث: الحي، الملاحظات، رقم المخطط، اسم المالك أو جواله…',
    onInput: debounce((e) => { ctx.query = e.target.value; renderFilters(ctx); renderList(ctx); }, 150),
  });
  const segButtons = {};
  const seg = el('div', { class: 'seg' }, [['grid', 'شبكة'], ['table', 'جدول']].map(([key, label]) => {
    segButtons[key] = el('button', {
      type: 'button', class: `seg-btn${ctx.view === key ? ' active' : ''}`, text: label,
      onClick: async () => {
        ctx.view = key;
        for (const [k, b] of Object.entries(segButtons)) b.classList.toggle('active', k === key);
        renderList(ctx);
        await setUI({ propertiesView: key });
      },
    });
    return segButtons[key];
  }));
  ctx.nodes.count = el('span', { class: 'count' });
  ctx.container.append(
    el('div', { class: 'page-head' },
      el('h1', {}, 'العقارات ', ctx.nodes.count),
      el('div', { class: 'head-actions' },
        search, seg,
        el('button', { type: 'button', class: 'btn btn-primary', text: '+ إضافة عقار', onClick: () => openForm(ctx, null) }))),
  );
  ctx.nodes.filters = el('div', { class: 'filters' });
  ctx.nodes.selectionBar = el('div', { class: 'selection-bar', hidden: true });
  ctx.nodes.list = el('div');
  ctx.container.append(ctx.nodes.filters, ctx.nodes.selectionBar, ctx.nodes.list);
  renderFilters(ctx);
  renderList(ctx);
}

/**
 * شريط التحديد (المرحلة ١٣): مقارنة جنبًا إلى جنب أو كتالوج مطبوع لعدة عقارات.
 * يظهر فقط عند اختيار عقار — فلا يزاحم الواجهة في الاستعمال العادي.
 */
function renderSelectionBar(ctx) {
  const bar = ctx.nodes.selectionBar;
  if (!bar) return;
  const ids = [...ctx.selected];
  bar.hidden = ids.length === 0;
  clear(bar);
  if (!ids.length) return;
  const chosen = () => ctx.properties.filter((p) => ctx.selected.has(p.id));
  bar.append(
    el('span', { class: 'strong', text: `${ids.length} عقار مختار` }),
    el('button', {
      type: 'button', class: 'btn btn-sm', text: '⇄ قارن',
      onClick: () => (ids.length < 2 ? toast('اختر عقارين على الأقل للمقارنة', 'error') : openCompare(ctx, chosen())),
    }),
    el('button', {
      type: 'button', class: 'btn btn-sm', text: '🖨️ كتالوج',
      onClick: async () => {
        const company = await getCompany();
        await printPropertyCatalog(chosen(), { lists: ctx.lists, company });
      },
    }),
    el('button', {
      type: 'button', class: 'btn btn-ghost btn-sm', text: 'إلغاء التحديد',
      onClick: () => { ctx.selected.clear(); renderList(ctx); renderSelectionBar(ctx); },
    }));
}

/** مقارنة جنبًا إلى جنب: صفٌّ لكل معيار وعمودٌ لكل عقار — كما يقرؤها العميل. */
function openCompare(ctx, items) {
  const rows = [
    ['النوع', (p) => typeLabel(ctx.lists, p.type)],
    ['الحي', (p) => p.district || '—'],
    ['المدينة', (p) => p.city || '—'],
    ['الغرض', (p) => (p.purposes || []).map((k) => labelFor(ENUMS.purposes, k)).join('، ') || '—'],
    ['المساحة', (p) => formatArea(p.area)],
    ['السعر', (p) => formatSAR(p.price)],
    ['سعر المتر', (p) => (p.price && p.area ? `${formatNumber(Math.round(p.price / p.area))} ريال` : '—')],
    ['الحالة', (p) => statusLabel(ctx.lists, p.status)],
    ['الصور', (p) => formatNumber((p.images || []).length)],
    ['ملاحظات', (p) => p.notes || '—'],
  ];
  const modal = openModal({
    title: `مقارنة ${items.length} عقارات`,
    size: 'wide',
    body: el('div', { class: 'table-wrap' }, el('table', { class: 'table compare-table' },
      el('thead', {}, el('tr', {}, el('th', { text: 'المعيار' }),
        ...items.map((p) => el('th', { text: `${typeLabel(ctx.lists, p.type)} — ${p.district || p.city || ''}` })))),
      el('tbody', {}, rows.map(([label, get]) => el('tr', {},
        el('th', { text: label }),
        ...items.map((p) => el('td', { text: get(p) }))))))),
    footer: [
      el('button', {
        type: 'button', class: 'btn', text: '🖨️ اطبع الكتالوج',
        onClick: async () => { modal.close(); await printPropertyCatalog(items, { lists: ctx.lists, company: await getCompany() }); },
      }),
      el('button', { type: 'button', class: 'btn btn-primary', text: 'إغلاق', onClick: () => modal.close() }),
    ],
  });
}

/* ===== الفرز ===== */

function passes(ctx, p, exceptGroup = null) {
  for (const [g] of GROUPS) {
    if (g === exceptGroup) continue;
    const set = ctx.filters[g];
    if (set.size && !VALUES[g](p).some((v) => set.has(v))) return false;
  }
  if (ctx.query) {
    const owner = ctx.clientMap.get(p.ownerId);
    if (!matchesQuery(p.searchKey, ctx.query) && !(owner && matchesQuery(owner.searchKey, ctx.query))) return false;
  }
  return true;
}

function optionsFor(ctx, group) {
  if (group === 'status') return ctx.lists.propertyStatuses.map((s) => ({ value: s.key, label: s.label }));
  return listingFilterOptions(group, { items: ctx.properties, lists: ctx.lists, filters: ctx.filters });
}

function renderFilters(ctx) {
  const wrap = ctx.nodes.filters;
  clear(wrap);
  for (const [group, label] of GROUPS) {
    const options = optionsFor(ctx, group);
    if (!options.length) continue;
    const chips = el('div', { class: 'chips' });
    for (const opt of options) {
      const n = ctx.properties.filter((p) => passes(ctx, p, group) && VALUES[group](p).includes(opt.value)).length;
      const active = ctx.filters[group].has(opt.value);
      chips.append(el('button', {
        type: 'button', class: `chip${active ? ' active' : ''}${n === 0 && !active ? ' zero' : ''}`,
        onClick: () => {
          if (active) ctx.filters[group].delete(opt.value); else ctx.filters[group].add(opt.value);
          if (group === 'city') {
            const allowed = new Set(optionsFor(ctx, 'district').map((o) => o.value));
            for (const d of [...ctx.filters.district]) if (!allowed.has(d)) ctx.filters.district.delete(d);
          }
          renderFilters(ctx);
          renderList(ctx);
        },
      }, opt.label, el('span', { class: 'chip-count', text: String(n) })));
    }
    wrap.append(el('div', { class: 'filter-row' }, el('span', { class: 'filter-label', text: label }), chips));
  }
  if (GROUPS.some(([g]) => ctx.filters[g].size)) {
    wrap.append(el('div', {}, el('button', {
      type: 'button', class: 'btn btn-ghost btn-sm', text: 'مسح الفرز',
      onClick: () => { for (const [g] of GROUPS) ctx.filters[g].clear(); renderFilters(ctx); renderList(ctx); },
    })));
  }
}

/* ===== القائمة ===== */

function renderList(ctx) {
  renderSelectionBar(ctx);
  const items = ctx.properties.filter((p) => passes(ctx, p));
  ctx.nodes.count.textContent = items.length === ctx.properties.length
    ? `(${ctx.properties.length})`
    : `(${items.length} من ${ctx.properties.length})`;
  const area = ctx.nodes.list;
  clear(area);
  if (!ctx.properties.length) {
    area.append(emptyState('لا توجد عقارات بعد. أضف أول عقار من الزر أعلاه، أو أدرج بيانات تجريبية من الإعدادات.'));
    return;
  }
  if (!items.length) {
    area.append(emptyState('لا نتائج تطابق الفرز أو البحث.'));
    return;
  }
  area.append(ctx.view === 'table' ? renderTable(ctx, items) : renderGrid(ctx, items));
}

function ownerLabel(ctx, p) {
  const owner = ctx.clientMap.get(p.ownerId);
  if (!owner) return '';
  return owner.name || formatPhone(owner.phone);
}

function completeness(ctx, p) {
  const owner = ctx.clientMap.get(p.ownerId) || null;
  const result = repo.properties.isComplete(p, { owner, fields: ctx.completeness });
  result.missingLabels = result.missing.map((k) => labelFor(COMPLETENESS_CANDIDATES, k));
  return result;
}

function completenessBadge(ctx, p) {
  const c = completeness(ctx, p);
  if (c.complete) return badge('مكتمل', 'badge-ok');
  return el('span', { class: 'badge badge-warn', text: 'ناقص', title: `ينقص: ${c.missingLabels.join('، ')}` });
}

function statusBadge(ctx, key) {
  return badge(statusLabel(ctx.lists, key), STATUS_STYLE[key] || '');
}

function priceNode(p, cls = 'card-price') {
  if (p.price == null) return el('span', { class: `${cls} unknown` }, badge('السعر غير معروف', 'badge-outline'));
  return el('span', { class: cls }, formatNumber(p.price), el('span', { class: 'unit', text: 'ريال' }));
}

function thumbInto(node, p, thumb = true) {
  if (!p.images?.length) return;
  const img = el('img', { alt: '', loading: 'lazy' });
  node.append(img);
  getImageUrl(p.images[0], { thumb }).then((url) => { if (url) img.src = url; });
}

function renderGrid(ctx, items) {
  const grid = el('div', { class: 'grid' });
  for (const p of items) {
    const imgBox = el('div', { class: 'card-img' });
    if (p.images?.length) {
      thumbInto(imgBox, p);
      if (p.images.length > 1) imgBox.append(el('span', { class: 'card-imgcount', text: `${p.images.length} صور` }));
    } else {
      imgBox.append(el('span', { class: 'card-noimg', text: typeLabel(ctx.lists, p.type) }));
    }
    const owner = ownerLabel(ctx, p);
    const pick = el('input', {
      type: 'checkbox', class: 'card-pick', title: 'اختر للمقارنة أو الكتالوج',
      checked: ctx.selected.has(p.id),
      onClick: (e) => { e.stopPropagation(); },
      onChange: (e) => { if (e.target.checked) ctx.selected.add(p.id); else ctx.selected.delete(p.id); renderSelectionBar(ctx); },
    });
    grid.append(el('article', { class: 'card', onClick: () => openForm(ctx, p) }, pick,
      imgBox,
      el('div', { class: 'card-body' },
        el('div', { class: 'card-top' },
          el('span', { class: 'card-type' }, typeLabel(ctx.lists, p.type),
            (p.purposes || []).length ? el('span', { class: 'muted small' }, ` · ${p.purposes.map((k) => labelFor(ENUMS.purposes, k)).join(' / ')}`) : null),
          statusBadge(ctx, p.status)),
        el('div', { class: 'card-place' }, [p.district, p.city].filter(Boolean).join('، ') || 'بلا حي'),
        priceNode(p),
        el('div', { class: 'card-meta' },
          el('span', {}, formatArea(p.area)),
          // بيانات المالك والمصدر تُخفى في «وضع العرض للعميل» (المرحلة ١٣).
          el('span', { 'data-sensitive': true }, owner || 'بلا مالك')),
        el('div', { class: 'card-meta' }, completenessBadge(ctx, p),
          el('span', { 'data-sensitive': true }, sourceBadge(p.referralSource)), ppmBadge(ctx, p)))));
  }
  return grid;
}

const COLUMNS = [
  { key: 'image', label: '', render: (p) => { const box = el('div', { class: 'thumb' }); thumbInto(box, p); return box; } },
  { key: 'type', label: 'النوع', get: (p, ctx) => typeLabel(ctx.lists, p.type), sort: (p, ctx) => typeLabel(ctx.lists, p.type) },
  { key: 'purposes', label: 'الغرض', get: (p) => (p.purposes || []).map((k) => labelFor(ENUMS.purposes, k)).join('، ') || '—', sort: (p) => (p.purposes || []).join() },
  { key: 'city', label: 'المدينة', get: (p) => p.city, sort: (p) => p.city },
  { key: 'district', label: 'الحي', get: (p) => p.district || '—', sort: (p) => p.district || '' },
  { key: 'area', label: 'المساحة', get: (p) => formatArea(p.area), sort: (p) => p.area, num: true },
  { key: 'price', label: 'السعر', get: (p) => formatSAR(p.price), sort: (p) => p.price, num: true },
  { key: 'status', label: 'الحالة', render: (p, ctx) => statusBadge(ctx, p.status), sort: (p, ctx) => statusLabel(ctx.lists, p.status) },
  { key: 'owner', label: 'صاحب العقار', sensitive: true, get: (p, ctx) => ownerLabel(ctx, p) || '—', sort: (p, ctx) => ownerLabel(ctx, p) },
  { key: 'complete', label: 'الاكتمال', render: (p, ctx) => completenessBadge(ctx, p), sort: (p, ctx) => (completeness(ctx, p).complete ? 1 : 0), num: true },
  { key: 'createdAt', label: 'أُضيف في', get: (p) => formatDate(p.createdAt), sort: (p) => p.createdAt },
];

function sortItems(ctx, items) {
  const col = COLUMNS.find((c) => c.key === ctx.sort.key);
  if (!col?.sort) return items;
  const dir = ctx.sort.dir === 'asc' ? 1 : -1;
  return [...items].sort((a, b) => {
    const va = col.sort(a, ctx);
    const vb = col.sort(b, ctx);
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'ar');
    return cmp * dir;
  });
}

function renderTable(ctx, items) {
  // العمود الحسّاس يُخفى في «وضع العرض للعميل» بصنف data-sensitive على الخلية والترويسة معًا.
  const head = el('tr', {}, COLUMNS.map((col) => {
    const sortable = !!col.sort;
    const active = ctx.sort.key === col.key;
    return el('th', {
      class: sortable ? 'sortable' : null,
      'data-sensitive': col.sensitive || null,
      onClick: sortable ? () => {
        ctx.sort = { key: col.key, dir: active && ctx.sort.dir === 'asc' ? 'desc' : 'asc' };
        renderList(ctx);
      } : null,
    }, col.label, active ? el('span', { class: 'sort-mark', text: ctx.sort.dir === 'asc' ? '▲' : '▼' }) : null);
  }));
  const body = el('tbody', {}, sortItems(ctx, items).map((p) => el('tr', { onClick: () => openForm(ctx, p) },
    COLUMNS.map((col) => el('td', { class: col.num ? 'num' : null, 'data-sensitive': col.sensitive || null },
      col.render ? col.render(p, ctx) : col.get(p, ctx))))));
  return el('div', { class: 'table-wrap' }, el('table', { class: 'table' }, el('thead', {}, head), body));
}

/* ===== النموذج ===== */

function promptNewType() {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (v) => { if (!settled) { settled = true; resolve(v); } };
    const labelInput = el('input', { class: 'input', type: 'text', placeholder: 'مثال: عمارة، استراحة، محل' });
    const groupSelect = selectEl({ options: ENUMS.typeFieldGroups.map((g) => ({ value: g.key, label: g.label })), value: 'built' });
    const modal = openModal({
      title: 'نوع عقار جديد',
      body: el('div', { class: 'form-grid one' },
        labeled('اسم النوع', labelInput, { required: true }),
        labeled('الحقول التي تظهر له تلقائيًا', groupSelect)),
      onClose: () => finish(null),
      footer: [
        el('button', { type: 'button', class: 'btn btn-ghost', text: 'إلغاء', onClick: () => modal.close() }),
        el('button', {
          type: 'button', class: 'btn btn-primary', text: 'إضافة',
          onClick: () => {
            const label = labelInput.value.trim();
            if (!label) return;
            finish({ label, group: groupSelect.value });
            modal.close();
          },
        }),
      ],
    });
    setTimeout(() => labelInput.focus(), 0);
  });
}

function fieldInput(def, target) {
  const current = target[def.key] ?? '';
  if (def.input === 'select') {
    return selectEl({
      options: def.options.map((o) => ({ value: o.key, label: o.label })), value: current, placeholder: '—',
      onChange: (e) => { target[def.key] = e.target.value; },
    });
  }
  return el('input', {
    class: 'input', type: def.input === 'number' ? 'number' : 'text', value: current,
    placeholder: def.placeholder || '', step: def.input === 'number' ? 'any' : null,
    onInput: (e) => { target[def.key] = e.target.value; },
  });
}

/* ===== مشاركة العقار (المرحلة ٦): واتساب، مشاركة عبر تطبيقات أخرى (إن دعمها المتصفح)، ونسخ رابط عميق ===== */

function shareSummary(ctx, p) {
  const purpose = (p.purposes || []).map((k) => labelFor(ENUMS.purposes, k)).join(' / ');
  const lines = [
    `${typeLabel(ctx.lists, p.type)}${purpose ? ' — ' + purpose : ''}`,
    [p.district, p.city].filter(Boolean).join('، ') || null,
    `المساحة: ${formatArea(p.area)}`,
    `السعر: ${formatSAR(p.price)}`,
  ].filter(Boolean);
  return lines.join('\n');
}

function shareLink(p) {
  return `${location.origin}${location.pathname}#/properties/${p.id}`;
}

/** شارة سعر المتر وموضعه من وسيط الحي — لا تظهر إن نقص سعر أو مساحة. */
function ppmBadge(ctx, p) {
  const cmp = comparePrice(p, ctx.priceIndex);
  if (!cmp) return null;
  const ppm = `${formatNumber(Math.round(cmp.ppm))} ريال/م²`;
  return badge(cmp.median == null ? ppm : `${ppm} · ${cmp.label}`, cmp.tone || 'badge-outline');
}

let modalRef = null; // نافذة المشاركة الحالية — تُغلق قبل فتح نافذة الطباعة

async function openShareMenu(ctx, p) {
  const link = shareLink(p);
  const fullText = `${shareSummary(ctx, p)}\n${link}`;
  // القوالب (المرحلة ١١): رسالة جاهزة معبّأة ببيانات هذا العقار وصاحبه، تُرسل بنقرة.
  const [templates, company] = await Promise.all([getTemplates(), getCompany()]);
  const owner = ctx.clients.find((c) => c.id === p.ownerId) || null;
  const values = templateValues({ client: owner, property: p, lists: ctx.lists, user: getCurrentUser(), company, link });
  const templatesBox = el('div', { class: 'share-menu-templates' },
    el('div', { class: 'field-label', text: 'رسالة جاهزة' }),
    templates.map((t) => el('a', {
      class: 'btn btn-ghost', target: '_blank', rel: 'noopener noreferrer',
      href: whatsappLink(renderTemplate(t.body, values), owner?.phone || ''),
      text: `💬 ${t.label}`,
      title: owner?.phone ? `تُرسل إلى ${owner.name || owner.phone}` : 'تختار المستلم داخل واتساب',
    })));

  const body = el('div', { class: 'share-menu' },
    templatesBox,
    el('div', { class: 'field-label', text: 'أو مشاركة مباشرة' }),
    el('a', {
      class: 'btn btn-ghost', href: `https://wa.me/?text=${encodeURIComponent(fullText)}`,
      target: '_blank', rel: 'noopener noreferrer', text: '💬 واتساب (ملخّص)',
    }),
    typeof navigator.share === 'function' ? el('button', {
      type: 'button', class: 'btn btn-ghost', text: '📤 مشاركة عبر تطبيقات أخرى',
      onClick: () => { navigator.share({ title: 'عقار', text: shareSummary(ctx, p), url: link }).catch(() => {}); },
    }) : null,
    el('button', {
      type: 'button', class: 'btn btn-ghost', text: '🎯 من يناسبه هذا العقار؟',
      onClick: async () => {
        modalRef?.close();
        const found = await announceMatches(p, { title: 'من يناسبه هذا العقار؟' });
        if (!found.length) toast('لا طلب نشط يطابق هذا العقار حاليًا', 'info');
      },
    }),
    el('button', {
      type: 'button', class: 'btn btn-ghost', text: '🖨️ بطاقة العقار (PDF / طباعة)',
      onClick: async () => {
        modalRef?.close();
        await printProperty(p, { lists: ctx.lists, company });
      },
    }),
    el('button', {
      type: 'button', class: 'btn btn-ghost', text: '📝 اتفاقية وساطة (طباعة)',
      onClick: async () => {
        modalRef?.close();
        await printAgreement(p, { lists: ctx.lists, company, owner });
      },
    }),
    el('button', {
      type: 'button', class: 'btn btn-ghost', text: '🔗 نسخ الرابط',
      onClick: async () => {
        try {
          await navigator.clipboard.writeText(link);
          toast('نُسخ الرابط', 'success');
        } catch (_) {
          toast(`تعذر النسخ التلقائي — انسخه يدويًا: ${link}`, 'error', 8000);
        }
      },
    }),
  );
  modalRef = openModal({ title: 'مشاركة العقار', body });
}

async function openForm(ctx, existing) {
  const isEdit = !!existing;
  const draft = existing ? JSON.parse(JSON.stringify(existing)) : repo.properties.defaults();
  draft.typeFields = draft.typeFields || {};
  draft.extra = draft.extra || {};
  draft.images = draft.images || [];
  const state = { newFiles: [], removedImages: new Set(), previewUrls: [], newOwner: null };

  const errorsBox = el('div', { class: 'form-errors', hidden: true });
  const showErrors = (errors) => {
    clear(errorsBox);
    errorsBox.append(el('ul', {}, errors.map((e) => el('li', { text: e }))));
    errorsBox.hidden = false;
    errorsBox.scrollIntoView?.({ block: 'nearest' });
  };

  /* المدينة والحي */
  const districtList = el('datalist', { id: 'district-options' });
  const districtInput = el('input', { class: 'input', type: 'text', list: 'district-options', value: draft.district, placeholder: 'اكتب أو اختر من القائمة' });
  const fillDistricts = () => {
    clear(districtList);
    for (const d of ctx.lists.districtsByCity[citySelect.value] || []) districtList.append(el('option', { value: d }));
  };
  const citySelect = selectEl({ options: ctx.lists.cities.map((c) => ({ value: c, label: c })), value: draft.city, onChange: fillDistricts });
  const addCityBtn = el('button', {
    type: 'button', class: 'btn btn-sm', text: '+', title: 'إضافة مدينة',
    onClick: async () => {
      const name = await promptDialog({ title: 'مدينة جديدة', label: 'اسم المدينة' });
      if (!name) return;
      const city = await addCity(name);
      ctx.lists = await getLists();
      if (![...citySelect.options].some((o) => o.value === city)) citySelect.append(el('option', { value: city, text: city }));
      citySelect.value = city;
      fillDistricts();
    },
  });
  fillDistricts();

  /* النوع */
  const typeSelect = selectEl({
    options: ctx.lists.propertyTypes.map((t) => ({ value: t.key, label: t.label })), value: draft.type, placeholder: 'اختر النوع',
    onChange: () => { renderTypeFields(); renderCustomFields(); },
  });
  const addTypeBtn = el('button', {
    type: 'button', class: 'btn btn-sm', text: '+', title: 'إضافة نوع',
    onClick: async () => {
      const def = await promptNewType();
      if (!def) return;
      const item = await addPropertyType(def);
      ctx.lists = await getLists();
      if (![...typeSelect.options].some((o) => o.value === item.key)) typeSelect.append(el('option', { value: item.key, text: item.label }));
      typeSelect.value = item.key;
      renderTypeFields();
      renderCustomFields();
    },
  });

  /* الغرض */
  const purposesBox = el('div', { class: 'check-group' }, ENUMS.purposes.map((p) => checkbox(p.label, { name: 'purpose', value: p.key, checked: draft.purposes.includes(p.key) })));

  /* المساحة والسعر */
  const areaInput = el('input', { class: 'input', type: 'number', min: '0', step: 'any', value: draft.area ?? '' });
  const priceInput = el('input', { class: 'input', type: 'number', min: '0', step: 'any', value: draft.price ?? '' });

  /* الموقع */
  const locationHint = el('span', { class: 'field-hint' });
  const locationInput = el('input', { class: 'input', type: 'text', value: locationToText(draft.location), placeholder: 'إحداثيات "24.71, 46.67" أو رابط خرائط جوجل كامل', dir: 'ltr' });
  const updateLocationHint = () => {
    const text = locationInput.value.trim();
    clear(locationHint);
    locationHint.className = 'field-hint';
    if (!text) { locationHint.textContent = 'اختياري — الخريطة تأتي في مرحلة لاحقة'; return; }
    const loc = parseLocation(text);
    if (loc) {
      locationHint.classList.add('ok');
      locationHint.append(`تمت قراءة الإحداثيات: ${locationToText(loc)} — `, el('a', { href: mapsLink(loc), target: '_blank', rel: 'noopener', text: 'فتح في الخرائط' }));
    } else if (isShortMapLink(text)) {
      locationHint.classList.add('error');
      locationHint.textContent = 'الروابط المختصرة لا تحمل الإحداثيات؛ افتح الرابط في المتصفح وانسخ الرابط الكامل أو الإحداثيات';
    } else {
      locationHint.classList.add('error');
      locationHint.textContent = 'تعذر قراءة الموقع من هذا النص';
    }
  };
  locationInput.addEventListener('input', updateLocationHint);
  updateLocationHint();

  /* صاحب العقار */
  const sortedClients = [...ctx.clients].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ar'));
  const ownerSelect = selectEl({
    options: [
      { value: '__new__', label: '+ عميل جديد…' },
      ...sortedClients.map((c) => ({ value: c.id, label: `${c.name || 'بلا اسم'}${c.phone ? ` — ${formatPhone(c.phone)}` : ''}` })),
    ],
    value: draft.ownerId || '', placeholder: 'بلا مالك مربوط',
    onChange: () => { newOwnerBox.hidden = ownerSelect.value !== '__new__'; },
  });
  const newOwnerName = el('input', { class: 'input', type: 'text', placeholder: 'اسم المالك' });
  const newOwnerPhone = el('input', { class: 'input', type: 'tel', placeholder: 'جوال المالك', dir: 'ltr' });
  const newOwnerBox = el('div', { class: 'inline-box', hidden: true },
    labeled('اسم العميل الجديد', newOwnerName),
    labeled('جواله', newOwnerPhone, { hint: 'إن كان الرقم مسجّلًا لعميل موجود يُربط العقار به' }));

  /* الحالة */
  const statusSelect = selectEl({ options: ctx.lists.propertyStatuses.map((s) => ({ value: s.key, label: s.label })), value: draft.status });
  const addStatusBtn = el('button', {
    type: 'button', class: 'btn btn-sm', text: '+', title: 'إضافة حالة',
    onClick: async () => {
      const name = await promptDialog({ title: 'حالة جديدة للعقار', label: 'اسم الحالة' });
      if (!name) return;
      const item = await addPropertyStatus(name);
      ctx.lists = await getLists();
      if (![...statusSelect.options].some((o) => o.value === item.key)) statusSelect.append(el('option', { value: item.key, text: item.label }));
      statusSelect.value = item.key;
    },
  });

  /* الحقول بحسب النوع */
  const typeBox = el('div', { class: 'form-section', hidden: true });
  const renderTypeFields = () => {
    clear(typeBox);
    const group = typeGroup(ctx.lists, typeSelect.value);
    const defs = TYPE_FIELD_GROUPS[group] || [];
    typeBox.hidden = !defs.length;
    if (!defs.length) return;
    typeBox.append(
      el('h3', { class: 'form-section-title', text: group === 'land' ? 'بيانات الأرض' : 'بيانات المبنى' }),
      el('div', { class: 'form-grid' }, defs.map((def) => labeled(def.label, fieldInput(def, draft.typeFields)))));
  };

  /* الحقول المخصصة */
  const customBox = el('div', { class: 'form-section', hidden: true });
  const visibleCustomFields = () => ctx.customFields.filter((f) => !f.forTypes?.length || f.forTypes.includes(typeSelect.value));
  const renderCustomFields = () => {
    clear(customBox);
    const defs = visibleCustomFields();
    customBox.hidden = !defs.length;
    if (!defs.length) return;
    customBox.append(
      el('h3', { class: 'form-section-title', text: 'حقول إضافية' }),
      el('div', { class: 'form-grid' }, defs.map((def) => labeled(def.label, fieldInput(def, draft.extra)))));
  };

  /* الملاحظات */
  const notesInput = el('textarea', { class: 'input', rows: 3, value: draft.notes || '' });
  const source = sourceField(draft.referralSource, ctx.lists.sources);

  /* الصور */
  const fileInput = el('input', {
    type: 'file', accept: 'image/*', multiple: true, class: 'visually-hidden',
    onChange: (e) => { state.newFiles.push(...e.target.files); e.target.value = ''; renderImages(); },
  });
  const imagesBox = el('div', { class: 'images-box' });
  const renderImages = () => {
    clear(imagesBox);
    for (const url of state.previewUrls) URL.revokeObjectURL(url);
    state.previewUrls = [];
    draft.images.forEach((id, index) => {
      const removed = state.removedImages.has(id);
      const img = el('img', { alt: '' });
      getImageUrl(id, { thumb: true }).then((url) => { if (url) img.src = url; });
      // الأولى هي الغلاف: هي التي يراها العميل في الصفحة العامة وبطاقة الطباعة (المرحلة ١٣).
      const isCover = index === 0;
      imagesBox.append(el('div', { class: `img-tile${removed ? ' removed' : ''}${isCover ? ' is-cover' : ''}` }, img,
        isCover ? el('span', { class: 'img-cover-tag', text: 'الغلاف' }) : null,
        el('div', { class: 'img-tools' },
          index > 0 ? el('button', {
            type: 'button', class: 'img-tool', text: '→', title: 'قدّمها',
            onClick: () => { const [x] = draft.images.splice(index, 1); draft.images.splice(index - 1, 0, x); renderImages(); },
          }) : null,
          index < draft.images.length - 1 ? el('button', {
            type: 'button', class: 'img-tool', text: '←', title: 'أخّرها',
            onClick: () => { const [x] = draft.images.splice(index, 1); draft.images.splice(index + 1, 0, x); renderImages(); },
          }) : null,
          !isCover ? el('button', {
            type: 'button', class: 'img-tool', text: '★', title: 'اجعلها الغلاف',
            onClick: () => { const [x] = draft.images.splice(index, 1); draft.images.unshift(x); renderImages(); },
          }) : null),
        el('button', {
          type: 'button', class: 'img-remove', text: removed ? '↺' : '✕', title: removed ? 'تراجع عن الحذف' : 'حذف الصورة',
          onClick: () => { if (removed) state.removedImages.delete(id); else state.removedImages.add(id); renderImages(); },
        })));
    });
    state.newFiles.forEach((file, index) => {
      const url = URL.createObjectURL(file);
      state.previewUrls.push(url);
      imagesBox.append(el('div', { class: 'img-tile new' }, el('img', { src: url, alt: '' }),
        el('button', { type: 'button', class: 'img-remove', text: '✕', title: 'إزالة', onClick: () => { state.newFiles.splice(index, 1); renderImages(); } })));
    });
    imagesBox.append(el('label', { class: 'img-add' }, '+ إضافة صور', fileInput));
  };

  /* التجميع والحفظ */
  const collect = () => {
    const group = typeGroup(ctx.lists, typeSelect.value);
    const typeFields = {};
    for (const def of TYPE_FIELD_GROUPS[group] || []) {
      const v = draft.typeFields[def.key];
      if (v != null && v !== '') typeFields[def.key] = def.input === 'number' ? Number(v) : v;
    }
    const extra = {};
    for (const def of visibleCustomFields()) {
      const v = draft.extra[def.key];
      if (v != null && v !== '') extra[def.key] = def.input === 'number' ? Number(v) : v;
    }
    return {
      city: citySelect.value.trim(),
      district: districtInput.value.trim(),
      type: typeSelect.value,
      purposes: [...purposesBox.querySelectorAll('input:checked')].map((i) => i.value),
      area: areaInput.value === '' ? null : Number(areaInput.value),
      price: priceInput.value === '' ? null : Number(priceInput.value),
      location: parseLocation(locationInput.value),
      ownerId: ownerSelect.value && ownerSelect.value !== '__new__' ? ownerSelect.value : null,
      status: statusSelect.value,
      notes: notesInput.value.trim(),
      typeFields, extra,
      referralSource: source.input.value, // تاق المصدر — غير `source` أدناه (مسار الإدخال)
      source: draft.source, captureStatus: draft.captureStatus, tourId: draft.tourId,
    };
  };

  const saveBtn = el('button', { type: 'button', class: 'btn btn-primary', text: isEdit ? 'حفظ التعديلات' : 'إضافة العقار' });
  saveBtn.addEventListener('click', async () => {
    errorsBox.hidden = true;
    const data = collect();
    const errors = [];
    if (!data.type) errors.push('نوع العقار مطلوب');
    if (!data.city) errors.push('المدينة مطلوبة');
    const locText = locationInput.value.trim();
    if (locText && !data.location) errors.push(isShortMapLink(locText) ? 'رابط الموقع مختصر ولا يمكن قراءته — الصق الرابط الكامل أو الإحداثيات' : 'تعذر قراءة الموقع');
    const wantsNewOwner = ownerSelect.value === '__new__';
    if (wantsNewOwner && !newOwnerName.value.trim() && !newOwnerPhone.value.trim()) errors.push('أدخل اسم العميل الجديد أو جواله');
    if (errors.length) { showErrors(errors); return; }

    saveBtn.disabled = true;
    try {
      if (wantsNewOwner) {
        const found = newOwnerPhone.value.trim() ? await repo.clients.findByPhone(newOwnerPhone.value) : null;
        const owner = found || await repo.clients.create({ name: newOwnerName.value, phone: newOwnerPhone.value, roles: ['owner'] });
        if (found) toast(`رُبط العقار بعميل موجود بهذا الرقم: ${found.name || formatPhone(found.phone)}`);
        data.ownerId = owner.id;
      }
      // ترتيب draft.images هو ترتيب العرض (أولها الغلاف) — يُحفظ كما رتّبته.
      data.images = draft.images.filter((id) => !state.removedImages.has(id));
      let rec = isEdit ? await repo.properties.update(existing.id, data) : await repo.properties.create(data);
      if (state.removedImages.size) await deleteImages([...state.removedImages]);
      if (state.newFiles.length) {
        toast('جارٍ ضغط الصور وحفظها…');
        const ids = [];
        for (const file of state.newFiles) {
          try {
            const img = await storeImage(file, { entity: 'property', entityId: rec.id });
            ids.push(img.id);
          } catch (err) {
            toast(`تعذر حفظ الصورة ${file.name || ''}: ${err.message}`, 'error', 6000);
          }
        }
        rec = await repo.properties.update(rec.id, { images: [...data.images, ...ids] });
      }
      if (data.district && !(ctx.lists.districtsByCity[data.city] || []).includes(data.district)) {
        await addDistrict(data.city, data.district);
      }
      await rememberSource(data.referralSource);
      modal.close();
      toast(isEdit ? 'تم حفظ التعديلات' : 'تمت إضافة العقار', 'success');
      await refresh(ctx);
      // تنبيه المطابقات (المرحلة ١٠): للعقار الجديد فقط — التعديل لا يُزعجك في كل حفظ.
      if (!isEdit) await announceMatches(rec);
    } catch (err) {
      if (err instanceof ValidationError) showErrors(err.errors);
      else { console.error(err); showErrors([err.message || 'حدث خطأ غير متوقع']); }
    } finally {
      saveBtn.disabled = false;
    }
  });

  const deleteBtn = isEdit ? el('button', {
    type: 'button', class: 'btn btn-ghost btn-danger', text: 'حذف العقار',
    onClick: async () => {
      const ok = await confirmDialog({ title: 'حذف العقار', message: 'سيُحذف العقار وصوره نهائيًا. هل أنت متأكد؟', confirmText: 'حذف', danger: true });
      if (!ok) return;
      try {
        await repo.properties.remove(existing.id); // يحذف صوره ومطابقاته تلقائيًا
        modal.close();
        toast('تم حذف العقار', 'success');
        await refresh(ctx);
      } catch (err) {
        toast(err.message || 'تعذر الحذف', 'error', 6000);
      }
    },
  }) : null;

  const body = el('div', {},
    errorsBox,
    el('div', { class: 'form-grid' },
      labeled('المدينة', el('div', { class: 'field-row' }, citySelect, addCityBtn), { required: true }),
      fieldGroup('الحي', el('div', {}, districtInput, districtList)),
      labeled('نوع العقار', el('div', { class: 'field-row' }, typeSelect, addTypeBtn), { required: true }),
      fieldGroup('الغرض', purposesBox),
      labeled('المساحة (م²)', areaInput),
      labeled('السعر (ريال)', priceInput, { hint: 'اتركه فارغًا إن كان السعر غير معروف' }),
      el('label', { class: 'field field-full' }, el('span', { class: 'field-label', text: 'الموقع' }), locationInput, locationHint),
      labeled('صاحب العقار', ownerSelect),
      labeled('الحالة', el('div', { class: 'field-row' }, statusSelect, addStatusBtn)),
      labeled('المصدر (وسيط الإحالة)', source.node, { hint: 'اختياري — لا يظهر شيء ما لم يُعبَّأ' }),
      newOwnerBox),
    typeBox,
    customBox,
    el('div', { class: 'form-section' },
      el('div', { class: 'form-grid one' },
        labeled('الملاحظات', notesInput),
        fieldGroup('الصور', el('div', {}, imagesBox, el('span', { class: 'field-hint', text: 'الصورة الأولى هي الغلاف الذي يراه العميل — رتّبها بالأسهم أو اضغط ★. وتُضغط الصور تلقائيًا قبل الحفظ.' }))))),
  );

  renderTypeFields();
  renderCustomFields();
  renderImages();

  const shareBtn = isEdit ? el('button', {
    type: 'button', class: 'btn btn-ghost', text: '📤 مشاركة', onClick: () => openShareMenu(ctx, existing),
  }) : null;

  const modal = openModal({
    title: isEdit ? 'تعديل العقار' : 'عقار جديد',
    body, size: 'wide',
    onClose: () => { for (const url of state.previewUrls) URL.revokeObjectURL(url); },
    footer: [
      deleteBtn,
      shareBtn,
      el('span', { class: 'spacer' }),
      el('button', { type: 'button', class: 'btn btn-ghost', text: 'إلغاء', onClick: () => modal.close() }),
      saveBtn,
    ],
  });
}
