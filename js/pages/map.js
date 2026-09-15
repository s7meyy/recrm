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
// تجميع العلامات (المرحلة ٦): تجميع بسيط بالمسافة بالبكسل مكتوب يدويًا (لا مكتبة
// Leaflet.markercluster — بناؤها القديم UMD يصعب توافقه مع استيراد Leaflet كوحدة ES هنا)،
// يعمل فقط حين يتجاوز عدد العلامات الظاهرة ١٥.

import { repo } from '../data/repository.js';
import { getLists, typeLabel, statusLabel } from '../data/settings.js';
import { EXCLUDED_EXTERNAL_STATUSES } from '../data/matching.js';
import { ENUMS } from '../data/schema.js';
import { LISTING_GROUPS, LISTING_VALUES, listingFilterOptions } from '../util/property-filters.js';
import { el, clear, badge, checkbox, openModal, toast, appendChildren, allChip } from '../util/dom.js';
import { orderRoute, routeLength, googleMapsRoute, MAX_STOPS } from '../util/route.js';
import { formatNumber } from '../util/format.js';
import { MAP_SCHEMES, colorFor, legendFor, schemeValue, SCHEME_FILTER_GROUP, EXTERNAL_COLOR } from '../util/map-colors.js';

const RIYADH_CENTER = [24.7136, 46.6753];
const CLUSTER_THRESHOLD = 15; // تحت هذا العدد تُعرض العلامات فرادى بلا تجميع
const CLUSTER_PIXEL_RADIUS = 44; // تجميع بسيط بالمسافة بالبكسل عند التكبير الحالي — بلا مكتبة خارجية


export async function render(container) {
  const ctx = {
    container,
    filters: Object.fromEntries(LISTING_GROUPS.map(([k]) => [k, new Set()])),
    showExternal: true, base: 'streets',
    scheme: 'status', // معنى اللون على الخريطة (المرحلة ٣٨)
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

  // معنى اللون (المرحلة ٣٨): الخريطة نفسها تُقرأ ثلاث قراءات — من وافق، وما للبيع
  // وما للإيجار، وأين الأراضي وأين الشقق. والاختيار يبدّل الألوان والدليل معًا.
  const schemeButtons = {};
  const schemeSeg = el('div', { class: 'seg map-scheme' },
    el('span', { class: 'muted small', style: { padding: '0 8px' }, text: 'اللون بحسب:' }),
    MAP_SCHEMES.map(([key, label]) => {
      schemeButtons[key] = el('button', {
        type: 'button', class: `seg-btn${ctx.scheme === key ? ' active' : ''}`, text: label,
        'data-scheme': key,
        onClick: () => {
          if (ctx.scheme === key) return;
          ctx.scheme = key;
          for (const [k, b] of Object.entries(schemeButtons)) b.classList.toggle('active', k === key);
          renderMarkers(ctx, { fit: false });
        },
      });
      return schemeButtons[key];
    }));

  const showExternalBox = checkbox('إظهار العروض الخارجية', {
    checked: ctx.showExternal,
    onChange: (e) => { ctx.showExternal = e.target.checked; renderFilters(ctx); renderMarkers(ctx); },
  });

  ctx.nodes.count = el('span', { class: 'count' });
  ctx.container.append(
    el('div', { class: 'page-head' },
      el('h1', {}, 'خريطة العقارات ', ctx.nodes.count),
      el('div', { class: 'head-actions' }, baseSeg, schemeSeg, showExternalBox,
        el('button', { type: 'button', class: 'btn btn-sm', text: '🚗 خطّط جولة اليوم', onClick: () => openRoutePlanner(ctx) }))),
  );

  ctx.nodes.notice = el('div');
  ctx.nodes.filters = el('div', { class: 'filters' });
  ctx.nodes.legend = el('div', { class: 'map-legend' });
  ctx.nodes.mapCanvas = el('div', { class: 'map-canvas' }, el('div', { class: 'map-loading', text: 'جارٍ تحميل الخريطة…' }));

  ctx.container.append(ctx.nodes.notice, ctx.nodes.filters, ctx.nodes.legend, ctx.nodes.mapCanvas);
  renderNotice(ctx);
  renderLegend(ctx);
  renderFilters(ctx);
}

/**
 * دليل الألوان: كل لونٍ واسمُه وعددُ ما يحمله من الظاهر على الخريطة، والضغط عليه يفرز به
 * (وضغطُه ثانيةً يمسح الفرز) — فالدليل يُقرأ ويُستعمل، لا يُقرأ وحده. واللون لا يُترك وحده
 * دالًّا أبدًا: اسمه مكتوبٌ بجانبه، فيقرؤه من لا يفرّق بين الأخضر والأحمر.
 */
function renderLegend(ctx) {
  const wrap = ctx.nodes.legend;
  if (!wrap) return;
  clear(wrap);

  const items = ctx.properties.filter((p) => passes(ctx, p));
  const counts = new Map();
  for (const p of items) {
    const v = schemeValue(ctx.scheme, p);
    if (v) counts.set(v, (counts.get(v) || 0) + 1);
  }

  const group = SCHEME_FILTER_GROUP[ctx.scheme];
  const rows = legendFor(ctx.scheme, { lists: ctx.lists, counts });
  for (const row of rows) {
    const active = group ? ctx.filters[group].has(row.value) : false;
    const dot = el('span', { class: 'map-dot', style: { background: row.color } });
    const label = `${row.label}${row.count != null ? ` (${formatNumber(row.count)})` : ''}`;
    if (!group) {
      wrap.append(el('span', { class: 'map-legend-item' }, dot, label));
      continue;
    }
    wrap.append(el('button', {
      type: 'button', class: `map-legend-item map-legend-btn${active ? ' active' : ''}`,
      title: active ? `أزل فرز «${row.label}»` : `اعرض «${row.label}» وحده`,
      'aria-pressed': active ? 'true' : 'false',
      onClick: () => {
        if (active) ctx.filters[group].delete(row.value); else ctx.filters[group].add(row.value);
        renderFilters(ctx);
        renderMarkers(ctx);
      },
    }, dot, label));
  }

  if (ctx.showExternal) {
    wrap.append(el('span', { class: 'map-legend-item' },
      el('span', { class: 'map-dot map-dot-external', style: ctx.scheme === 'status' ? { background: EXTERNAL_COLOR } : null }),
      ctx.scheme === 'status' ? 'عرض خارجي (لا حالة لك فيه)' : 'عرض خارجي (الحلقة المتقطّعة)'));
  }
  if (ctx.scheme === 'purpose') {
    wrap.append(el('span', { class: 'muted small map-legend-note', text: 'العقار لغرضين يأخذ لون أوّلهما — افرز بغرضٍ واحدٍ إن أردتَ يقينًا.' }));
  }
}

/**
 * تخطيط جولة اليوم (المرحلة ١٨): اختر محطاتك من الظاهر على الخريطة، فتُرتَّب بالأقرب
 * فالأقرب وتُفتح في خرائط جوجل بمسار واحد.
 *
 * يعمل على **ما هو ظاهر بعد الفرز** لا على المخزون كله: الفرز نفسه هو أداة اختيارك.
 */
function openRoutePlanner(ctx) {
  const items = itemsForMap(ctx).filter((i) => i.kind === 'property');
  if (!items.length) {
    toast('لا عقارات ظاهرة على الخريطة الآن — خفّف الفرز أولًا', 'info');
    return;
  }

  const picked = new Set();
  const boxes = new Map();
  let origin = null; // موقعك الحالي إن سمحت به

  const summary = el('div', { class: 'muted small', style: { marginTop: '10px' } });
  const openBtn = el('button', { type: 'button', class: 'btn btn-primary', text: 'افتح في خرائط جوجل', disabled: true });

  const refresh = () => {
    const stops = items.filter((i) => picked.has(i.data.id))
      .map((i) => ({ id: i.data.id, lat: i.lat, lng: i.lng, label: stopLabel(ctx, i.data) }));
    const ordered = orderRoute(stops, origin);
    const { url, dropped } = googleMapsRoute(ordered, origin);
    openBtn.disabled = !url;
    clear(summary);
    if (!stops.length) { summary.append(el('span', { text: 'اختر محطتين على الأقل.' })); return; }
    appendChildren(summary, [
      el('div', { class: 'strong', text: `الترتيب: ${ordered.map((s, i) => `${i + 1}. ${s.label}`).join('  ←  ')}` }),
      el('div', { text: `مسافة تقديرية: ${(routeLength(ordered, origin) / 1000).toFixed(1)} كم — مسافة هواء لا طريق، فالواقع أطول.` }),
      dropped ? el('div', { class: 'warn-text', text: `خرائط جوجل تقبل ${MAX_STOPS} محطات في الرابط الواحد؛ سقطت ${dropped} من الآخر.` }) : null,
      origin ? el('div', { text: 'البداية: موقعك الحالي.' }) : null,
    ]);
    openBtn.onclick = () => { if (url) window.open(url, '_blank', 'noopener'); };
  };

  const list = el('div', { class: 'route-list' }, items.map((item) => {
    const box = checkbox(stopLabel(ctx, item.data), {
      checked: false,
      onChange: (e) => {
        if (e.target.checked) picked.add(item.data.id); else picked.delete(item.data.id);
        refresh();
      },
    });
    boxes.set(item.data.id, box);
    return box;
  }));

  const locBtn = el('button', {
    type: 'button', class: 'btn btn-sm', text: '📍 ابدأ من موقعي',
    onClick: () => {
      if (!navigator.geolocation) { toast('متصفحك لا يدعم تحديد الموقع', 'error'); return; }
      locBtn.disabled = true;
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          origin = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          locBtn.textContent = '📍 موقعك هو البداية';
          refresh();
        },
        () => { locBtn.disabled = false; toast('تعذّر تحديد موقعك — ستبدأ الجولة من أول محطة', 'error'); },
        { enableHighAccuracy: true, timeout: 8000 },
      );
    },
  });

  const modal = openModal({
    title: 'جولة اليوم',
    size: 'wide',
    body: el('div', {},
      el('p', { class: 'muted small', text: `اختر من ${formatNumber(items.length)} عقارًا ظاهرًا على الخريطة الآن. الترتيب بالأقرب فالأقرب — تقريبٌ سريع لا مسارٌ أمثل.` }),
      el('div', { class: 'row' }, locBtn,
        el('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: 'مسح الاختيار', onClick: () => {
          picked.clear();
          for (const box of boxes.values()) box.querySelector('input').checked = false;
          refresh();
        } })),
      list, summary),
    footer: [openBtn, el('button', { type: 'button', class: 'btn btn-ghost', text: 'إغلاق', onClick: () => modal.close() })],
  });
  refresh();
}

function stopLabel(ctx, p) {
  return [typeLabel(ctx.lists, p.type), p.district || p.city].filter(Boolean).join(' — ') || 'عقار';
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
    chips.append(allChip(ctx.filters[group], options.map((o) => o.value),
      () => { renderFilters(ctx); renderMarkers(ctx); }));
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
  map.on('zoomend', () => renderMarkers(ctx, { fit: false })); // إعادة تجميع العلامات فقط، بلا تحريك العرض
  renderMarkers(ctx);
}

const purposeText = (item) => {
  const keys = Array.isArray(item.purposes) ? item.purposes : [];
  const labels = ENUMS.purposes.filter((x) => keys.includes(x.key)).map((x) => x.label);
  return labels.length ? `الغرض: ${labels.join(' و')}` : 'بلا غرض محدَّد';
};

function propertyMarker(ctx, p) {
  const color = colorFor(ctx.scheme, p, { lists: ctx.lists });
  const marker = ctx.L.circleMarker([p.location.lat, p.location.lng], {
    radius: 9, weight: 2, color: '#ffffff', fillColor: color, fillOpacity: 0.9,
  });
  const box = el('div', { class: 'map-popup' },
    el('div', { class: 'map-popup-title' }, typeLabel(ctx.lists, p.type), badge(statusLabel(ctx.lists, p.status))),
    // الغرض مكتوبًا في النافذة (المرحلة ٣٨): اللون يدلّ، والكلمة تُثبت — ومن لا يفرّق
    // الألوان يقرأ هنا ما لا يراه هناك.
    el('div', { class: 'muted small' }, purposeText(p)),
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
    radius: 7, weight: 2, dashArray: '3,2', color: '#ffffff',
    fillColor: colorFor(ctx.scheme, x, { lists: ctx.lists, external: true }), fillOpacity: 0.85,
  });
  const box = el('div', { class: 'map-popup' },
    el('div', { class: 'map-popup-title' }, x.type ? typeLabel(ctx.lists, x.type) : 'بلا نوع', badge('خارجي', 'badge-accent')),
    el('div', { class: 'muted small' }, purposeText(x)),
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

function itemsForMap(ctx) {
  const items = [];
  for (const p of ctx.properties) {
    if (!passes(ctx, p)) continue;
    items.push({ kind: 'property', data: p, lat: p.location.lat, lng: p.location.lng });
  }
  if (ctx.showExternal) {
    for (const x of ctx.externals) {
      if (!passes(ctx, x)) continue;
      items.push({ kind: 'external', data: x, lat: x.location.lat, lng: x.location.lng });
    }
  }
  return items;
}

function markerFor(ctx, item) {
  return item.kind === 'property' ? propertyMarker(ctx, item.data) : externalMarker(ctx, item.data);
}

/**
 * تجميع بسيط بالمسافة بالبكسل عند مستوى التكبير الحالي (بذرة + كل ما يقع ضمن نصف قطرها) —
 * تقريب كافٍ لتفريق العلامات المتلاصقة بصريًا، بلا مكتبة تجميع خارجية.
 */
function clusterItems(ctx, items) {
  const pts = items.map((item) => ({ item, pt: ctx.map.latLngToContainerPoint([item.lat, item.lng]) }));
  const visited = new Array(pts.length).fill(false);
  const clusters = [];
  for (let i = 0; i < pts.length; i++) {
    if (visited[i]) continue;
    visited[i] = true;
    const group = [pts[i]];
    for (let j = i + 1; j < pts.length; j++) {
      if (visited[j]) continue;
      const dx = pts[i].pt.x - pts[j].pt.x;
      const dy = pts[i].pt.y - pts[j].pt.y;
      if (Math.sqrt(dx * dx + dy * dy) <= CLUSTER_PIXEL_RADIUS) { visited[j] = true; group.push(pts[j]); }
    }
    clusters.push(group);
  }
  return clusters;
}

function clusterMarker(ctx, group) {
  const count = group.length;
  const avgLat = group.reduce((s, g) => s + g.item.lat, 0) / count;
  const avgLng = group.reduce((s, g) => s + g.item.lng, 0) / count;
  const mixed = group.some((g) => g.item.kind === 'external') && group.some((g) => g.item.kind === 'property');
  const size = count < 10 ? 34 : count < 30 ? 42 : 50;
  const icon = ctx.L.divIcon({
    className: 'map-cluster-icon',
    html: `<div class="map-cluster-badge${mixed ? ' map-cluster-badge-mixed' : ''}" style="width:${size}px;height:${size}px;line-height:${size}px">${count}</div>`,
    iconSize: [size, size],
  });
  const marker = ctx.L.marker([avgLat, avgLng], { icon });
  marker.on('click', () => {
    ctx.map.fitBounds(group.map((g) => [g.item.lat, g.item.lng]), { padding: [40, 40], maxZoom: ctx.map.getZoom() + 3 });
  });
  return marker;
}

function renderMarkers(ctx, { fit = true } = {}) {
  if (!ctx.map || !ctx.markersLayer) return;
  ctx.markersLayer.clearLayers();
  const items = itemsForMap(ctx);

  if (items.length > CLUSTER_THRESHOLD) {
    for (const group of clusterItems(ctx, items)) {
      (group.length === 1 ? markerFor(ctx, group[0].item) : clusterMarker(ctx, group)).addTo(ctx.markersLayer);
    }
  } else {
    for (const item of items) markerFor(ctx, item).addTo(ctx.markersLayer);
  }

  if (ctx.nodes.count) {
    const total = ctx.properties.length + (ctx.showExternal ? ctx.externals.length : 0);
    ctx.nodes.count.textContent = items.length === total ? `(${formatNumber(items.length)})` : `(${formatNumber(items.length)} من ${formatNumber(total)})`;
  }
  renderLegend(ctx); // الأعداد في الدليل تتبع الظاهر فعلًا، لا كل المخزون
  if (!fit) return; // إعادة تجميع بعد تكبير/تصغير فقط — لا تحريك العرض
  if (items.length) ctx.map.fitBounds(items.map((it) => [it.lat, it.lng]), { padding: [28, 28], maxZoom: 15 });
  else ctx.map.setView(RIYADH_CENTER, 11);
}
