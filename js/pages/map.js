// صفحة "خريطة العقارات" (المرحلة ٥).
//
// المكتبة: Leaflet مُحمَّلة محليًا من vendor/leaflet/ (لا CDN، تعمل دون اتصال، بلا مفتاح ولا حساب) —
// راجع قرار الخريطة في تقرير التسليم. البلاطات نفسها (الخرائط وصور القمر الصناعي) صور تُجلَب
// من الشبكة دائمًا؛ هذا قيد فيزيائي لا علاقة له باختيار المكتبة.
// الإسناد (OpenStreetMap وEsri) إلزامي ومُدرَج تلقائيًا عبر خيار attribution لكل طبقة.
//
// يظهر: العقارات المعتمدة (نفس نطاق صفحة العقارات) + العروض الخارجية النشطة (بعلامة مختلفة)،
// بنفس مجموعات الفرز المستعملة في صفحة العقارات (المدينة/الحي/النوع/الغرض) عبر util/property-filters.js.
// العقار بلا موقع يُستثنى من الخريطة مع بيان عدده أعلاها. النقر على عقار يفتح نموذج تعديله
// (#/properties/<id>) والعرض الخارجي كذلك (#/external/<id>) — بلا تكرار لأي من النموذجين هنا.

import { repo } from '../data/repository.js';
import { getLists, typeLabel, statusLabel } from '../data/settings.js';
import { EXCLUDED_EXTERNAL_STATUSES } from '../data/matching.js';
import { LISTING_GROUPS, LISTING_VALUES, listingFilterOptions } from '../util/property-filters.js';
import { el, clear, badge, checkbox } from '../util/dom.js';
import { formatNumber } from '../util/format.js';

const RIYADH_CENTER = [24.7136, 46.6753];

const STATUS_COLOR = {
  agreed: '#1f7a3f', refused: '#b4432f', sold: '#0f6e56', rented: '#0f6e56', not_contacted: '#8a5a00',
};
const EXTERNAL_COLOR = '#6b4fa0';

export async function render(container) {
  const ctx = {
    container,
    filters: Object.fromEntries(LISTING_GROUPS.map(([k]) => [k, new Set()])),
    showExternal: true, base: 'streets',
    properties: [], externals: [], noLocationCount: 0, noLocationExternalCount: 0,
    lists: null, nodes: {},
    map: null, L: null, baseLayers: null, markersLayer: null,
  };
  await loadData(ctx);
  buildLayout(ctx);
  await initMap(ctx);

  const onHashChange = () => {
    if (!/^#\/map(\/|$)/.test(location.hash || '')) {
      ctx.map?.remove();
      window.removeEventListener('hashchange', onHashChange);
    }
  };
  window.addEventListener('hashchange', onHashChange);
}

async function loadData(ctx) {
  const [properties, externals, lists] = await Promise.all([
    repo.properties.list(), repo.externalListings.list(), getLists(),
  ]);
  const approved = properties.filter((p) => p.captureStatus === 'approved');
  ctx.noLocationCount = approved.filter((p) => !p.location).length;
  ctx.properties = approved.filter((p) => !!p.location);

  const activeExternals = externals.filter((x) => !EXCLUDED_EXTERNAL_STATUSES.includes(x.status));
  ctx.noLocationExternalCount = activeExternals.filter((x) => !x.location).length;
  ctx.externals = activeExternals.filter((x) => !!x.location);

  ctx.lists = lists;
}

function combined(ctx) {
  return ctx.showExternal ? [...ctx.properties, ...ctx.externals] : ctx.properties;
}

function passes(ctx, item, exceptGroup = null) {
  for (const [g] of LISTING_GROUPS) {
    if (g === exceptGroup) continue;
    const set = ctx.filters[g];
    if (set.size && !LISTING_VALUES[g](item).some((v) => set.has(v))) return false;
  }
  return true;
}

/* ===== التخطيط ===== */

function buildLayout(ctx) {
  clear(ctx.container);

  const baseButtons = {};
  const baseSeg = el('div', { class: 'seg' }, [['streets', 'خريطة'], ['satellite', 'قمر صناعي']].map(([key, label]) => {
    baseButtons[key] = el('button', {
      type: 'button', class: `seg-btn${ctx.base === key ? ' active' : ''}`, text: label,
      onClick: () => {
        if (ctx.base === key || !ctx.map) return;
        ctx.map.removeLayer(ctx.baseLayers[ctx.base]);
        ctx.base = key;
        ctx.baseLayers[key].addTo(ctx.map);
        for (const [k, b] of Object.entries(baseButtons)) b.classList.toggle('active', k === key);
      },
    });
    return baseButtons[key];
  }));

  const showExternalBox = checkbox('إظهار العروض الخارجية', {
    checked: ctx.showExternal,
    onChange: (e) => { ctx.showExternal = e.target.checked; renderFilters(ctx); renderMarkers(ctx); },
  });

  ctx.nodes.count = el('span', { class: 'count' });
  ctx.container.append(
    el('div', { class: 'page-head' },
      el('h1', {}, 'خريطة العقارات ', ctx.nodes.count),
      el('div', { class: 'head-actions' }, baseSeg, showExternalBox)),
  );

  ctx.nodes.notice = el('div');
  ctx.nodes.filters = el('div', { class: 'filters' });
  ctx.nodes.legend = el('div', { class: 'map-legend' },
    el('span', { class: 'map-legend-item' }, el('span', { class: 'map-dot', style: { background: '#5f6b64' } }), 'عقار من مخزونك (اللون بحسب حالته)'),
    el('span', { class: 'map-legend-item' }, el('span', { class: 'map-dot map-dot-external' }), 'عرض خارجي'));
  ctx.nodes.mapCanvas = el('div', { class: 'map-canvas' }, el('div', { class: 'map-loading', text: 'جارٍ تحميل الخريطة…' }));

  ctx.container.append(ctx.nodes.notice, ctx.nodes.filters, ctx.nodes.legend, ctx.nodes.mapCanvas);
  renderNotice(ctx);
  renderFilters(ctx);
}

function renderNotice(ctx) {
  const wrap = ctx.nodes.notice;
  clear(wrap);
  const parts = [];
  if (ctx.noLocationCount) parts.push(`${formatNumber(ctx.noLocationCount)} عقارًا معتمدًا`);
  if (ctx.showExternal && ctx.noLocationExternalCount) parts.push(`${formatNumber(ctx.noLocationExternalCount)} عرضًا خارجيًا نشطًا`);
  if (!parts.length) return;
  wrap.append(el('div', { class: 'notice' },
    el('span', { text: `${parts.join(' و')} بلا موقع جغرافي محفوظ — لن يظهر هنا حتى تُضيف موقعه من نموذجه.` })));
}

/* ===== الفرز (نفس تعريف صفحة العقارات) ===== */

function renderFilters(ctx) {
  const wrap = ctx.nodes.filters;
  clear(wrap);
  const items = combined(ctx);
  for (const [group, label] of LISTING_GROUPS) {
    const options = listingFilterOptions(group, { items, lists: ctx.lists, filters: ctx.filters });
    if (!options.length) continue;
    const chips = el('div', { class: 'chips' });
    for (const opt of options) {
      const n = items.filter((it) => passes(ctx, it, group) && LISTING_VALUES[group](it).includes(opt.value)).length;
      const active = ctx.filters[group].has(opt.value);
      chips.append(el('button', {
        type: 'button', class: `chip${active ? ' active' : ''}${n === 0 && !active ? ' zero' : ''}`,
        onClick: () => {
          if (active) ctx.filters[group].delete(opt.value); else ctx.filters[group].add(opt.value);
          if (group === 'city') {
            const allowed = new Set(listingFilterOptions('district', { items: combined(ctx), lists: ctx.lists, filters: ctx.filters }).map((o) => o.value));
            for (const d of [...ctx.filters.district]) if (!allowed.has(d)) ctx.filters.district.delete(d);
          }
          renderFilters(ctx);
          renderMarkers(ctx);
        },
      }, opt.label, el('span', { class: 'chip-count', text: String(n) })));
    }
    wrap.append(el('div', { class: 'filter-row' }, el('span', { class: 'filter-label', text: label }), chips));
  }
  if (LISTING_GROUPS.some(([g]) => ctx.filters[g].size)) {
    wrap.append(el('div', {}, el('button', {
      type: 'button', class: 'btn btn-ghost btn-sm', text: 'مسح الفرز',
      onClick: () => { for (const [g] of LISTING_GROUPS) ctx.filters[g].clear(); renderFilters(ctx); renderMarkers(ctx); },
    })));
  }
}

/* ===== الخريطة (Leaflet) ===== */

function ensureLeafletCss() {
  if (document.getElementById('leaflet-css-link')) return;
  const link = document.createElement('link');
  link.id = 'leaflet-css-link';
  link.rel = 'stylesheet';
  link.href = './vendor/leaflet/leaflet.css';
  document.head.appendChild(link);
}

async function initMap(ctx) {
  ensureLeafletCss();
  const L = await import('../../vendor/leaflet/leaflet.esm.js');
  clear(ctx.nodes.mapCanvas);

  const map = L.map(ctx.nodes.mapCanvas, { center: RIYADH_CENTER, zoom: 11 });
  const streets = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
  });
  const satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 19,
    attribution: 'Tiles &copy; Esri — Esri, Maxar, Earthstar Geographics, and the GIS User Community',
  });
  streets.addTo(map);

  ctx.map = map;
  ctx.L = L;
  ctx.baseLayers = { streets, satellite };
  ctx.markersLayer = L.layerGroup().addTo(map);
  renderMarkers(ctx);
}

function propertyMarker(ctx, p) {
  const color = STATUS_COLOR[p.status] || '#5f6b64';
  const marker = ctx.L.circleMarker([p.location.lat, p.location.lng], {
    radius: 9, weight: 2, color: '#ffffff', fillColor: color, fillOpacity: 0.9,
  });
  const box = el('div', { class: 'map-popup' },
    el('div', { class: 'map-popup-title' }, typeLabel(ctx.lists, p.type), badge(statusLabel(ctx.lists, p.status))),
    el('div', { class: 'muted small' }, [p.district, p.city].filter(Boolean).join('، ') || 'بلا حي'),
    el('div', {}, p.price == null ? badge('السعر غير معروف', 'badge-outline') : `${formatNumber(p.price)} ريال`),
    el('div', { class: 'map-popup-actions' },
      el('button', {
        type: 'button', class: 'btn btn-primary btn-sm', text: 'فتح العقار',
        onClick: () => { location.hash = `#/properties/${p.id}`; },
      })));
  marker.bindPopup(box);
  return marker;
}

function externalMarker(ctx, x) {
  const marker = ctx.L.circleMarker([x.location.lat, x.location.lng], {
    radius: 7, weight: 2, dashArray: '3,2', color: '#ffffff', fillColor: EXTERNAL_COLOR, fillOpacity: 0.85,
  });
  const box = el('div', { class: 'map-popup' },
    el('div', { class: 'map-popup-title' }, x.type ? typeLabel(ctx.lists, x.type) : 'بلا نوع', badge('خارجي', 'badge-accent')),
    el('div', { class: 'muted small' }, [x.district, x.city].filter(Boolean).join('، ') || 'بلا حي'),
    el('div', {}, x.price == null ? badge('السعر غير معروف', 'badge-outline') : `${formatNumber(x.price)} ريال`),
    el('div', { class: 'map-popup-actions' },
      el('button', {
        type: 'button', class: 'btn btn-primary btn-sm', text: 'فتح العرض',
        onClick: () => { location.hash = `#/external/${x.id}`; },
      })));
  marker.bindPopup(box);
  return marker;
}

function renderMarkers(ctx) {
  if (!ctx.map || !ctx.markersLayer) return;
  ctx.markersLayer.clearLayers();
  const points = [];

  for (const p of ctx.properties) {
    if (!passes(ctx, p)) continue;
    propertyMarker(ctx, p).addTo(ctx.markersLayer);
    points.push([p.location.lat, p.location.lng]);
  }
  if (ctx.showExternal) {
    for (const x of ctx.externals) {
      if (!passes(ctx, x)) continue;
      externalMarker(ctx, x).addTo(ctx.markersLayer);
      points.push([x.location.lat, x.location.lng]);
    }
  }

  if (ctx.nodes.count) {
    const total = ctx.properties.length + (ctx.showExternal ? ctx.externals.length : 0);
    ctx.nodes.count.textContent = points.length === total ? `(${formatNumber(points.length)})` : `(${formatNumber(points.length)} من ${formatNumber(total)})`;
  }
  if (points.length) ctx.map.fitBounds(points, { padding: [28, 28], maxZoom: 15 });
  else ctx.map.setView(RIYADH_CENTER, 11);
}
