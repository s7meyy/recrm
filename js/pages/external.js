// صفحة العروض الخارجية (المرحلة ٤): عروض من المنصات لا علاقة لك بأصحابها.
//
// الإدخال: نص ملصوق (يُقرأ محليًا بلا أي خدمة خارجية) أو صورة شاشة، والحقول تبقى قابلة للتعديل دومًا.
// الرابط مرجع يُفتح بنقرة فقط — لا استخراج منه (قيد CORS وشروط المنصات).
// العرض موسوم "خارجي" بحالاته الخاصة (نشط · لم يعد متاحًا · مؤرشف)، ويمرّ على محرك المطابقة نفسه.
// وما نقصه النوع أو الغرض أو المدينة لا يطابق أي طلب أبدًا، فيُصنَّف "بانتظار الإكمال" لتعود إليه.
// كل وصول للتخزين عبر repo كما في المراحل السابقة.

import { repo, ValidationError } from '../data/repository.js';
import { ENUMS, labelFor } from '../data/schema.js';
import { getLists, typeLabel, addDistrict } from '../data/settings.js';
import { matchReadiness } from '../data/matching.js';
import { parseListingText } from '../data/listing-parse.js';
import { storeImage, getImageUrl, removeImage } from '../data/images.js';
import {
  el, clear, badge, labeled, fieldGroup, selectEl, checkbox, emptyState, debounce,
  openModal, confirmDialog, toast, allChip,
} from '../util/dom.js';
import { formatSAR, formatArea, formatNumber, formatDate, toInputDate, fromInputDate, countOf } from '../util/format.js';
import { matchesQuery } from '../util/arabic.js';
import { parseLocation, isShortMapLink, mapsLink, locationToText } from '../util/location.js';

const READY_OPTIONS = [
  { value: 'ready', label: 'جاهز للمطابقة' },
  { value: 'incomplete', label: 'بانتظار الإكمال' },
];

const GROUPS = [
  ['ready', 'الجاهزية'],
  ['status', 'الحالة'],
  ['type', 'النوع'],
  ['purpose', 'الغرض'],
  ['city', 'المدينة'],
  ['district', 'الحي'],
  ['platform', 'المنصة'],
];

const VALUES = {
  ready: (x) => [matchReadiness(x).ready ? 'ready' : 'incomplete'],
  status: (x) => [x.status].filter(Boolean),
  type: (x) => [x.type].filter(Boolean),
  purpose: (x) => x.purposes || [],
  city: (x) => [x.city].filter(Boolean),
  district: (x) => [x.district].filter(Boolean),
  platform: (x) => [x.platform].filter(Boolean),
};

// يقرأ #/external/<id> (نفس نمط #/matches/<requestId> الموثّق) — يتيح لخريطة العقارات فتح
// نموذج تعديل عرض خارجي بعينه مباشرة بلا تكرار للنموذج في صفحة منفصلة.
function routeExternalId() {
  const m = /^#\/external\/([^/?#]+)/.exec(location.hash || '');
  return m ? decodeURIComponent(m[1]) : null;
}

export async function render(container) {
  const ctx = {
    container, query: '',
    filters: Object.fromEntries(GROUPS.map(([k]) => [k, new Set()])),
    items: [], lists: null, nodes: {},
  };
  await loadData(ctx);
  buildLayout(ctx);
  const focusId = routeExternalId();
  if (focusId) {
    const target = ctx.items.find((x) => x.id === focusId);
    if (target) await openForm(ctx, target);
    else toast('العرض الخارجي غير موجود، أو حُذف', 'error');
  }
}

async function loadData(ctx) {
  const [items, lists] = await Promise.all([repo.externalListings.list(), getLists()]);
  items.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  ctx.items = items;
  ctx.lists = lists;
}

async function refresh(ctx) {
  await loadData(ctx);
  renderNotice(ctx);
  renderFilters(ctx);
  renderList(ctx);
}

/* ===== التخطيط ===== */

function buildLayout(ctx) {
  clear(ctx.container);
  const search = el('input', {
    class: 'input search', type: 'search', placeholder: 'بحث: الحي، المنصة، نص العرض، جوال المعلن، الرابط…',
    onInput: debounce((e) => { ctx.query = e.target.value; renderFilters(ctx); renderList(ctx); }, 150),
  });
  ctx.nodes.count = el('span', { class: 'count' });
  ctx.container.append(
    el('div', { class: 'page-head' },
      el('h1', {}, 'العروض الخارجية ', ctx.nodes.count, badge('خارجي', 'badge-accent')),
      el('div', { class: 'head-actions' },
        search,
        el('a', { class: 'btn', href: '#/matches', text: 'المطابقات' }),
        el('button', { type: 'button', class: 'btn btn-primary', text: '+ إضافة عرض', onClick: () => openForm(ctx, null) }))),
  );
  ctx.nodes.notice = el('div');
  ctx.nodes.filters = el('div', { class: 'filters' });
  ctx.nodes.list = el('div');
  ctx.container.append(ctx.nodes.notice, ctx.nodes.filters, ctx.nodes.list);
  renderNotice(ctx);
  renderFilters(ctx);
  renderList(ctx);
}

function renderNotice(ctx) {
  const wrap = ctx.nodes.notice;
  clear(wrap);
  const incomplete = ctx.items.filter((x) => !matchReadiness(x).ready);
  if (!incomplete.length) return;
  const onlyIncomplete = ctx.filters.ready.size === 1 && ctx.filters.ready.has('incomplete');
  wrap.append(el('div', { class: 'notice' },
    el('span', { text: `${countOf(incomplete.length, 'عرض')} بانتظار الإكمال: ينقصها النوع أو الغرض أو المدينة، فلا تدخل المطابقة حتى تُكمل.` }),
    el('button', {
      type: 'button', class: 'btn btn-sm', text: onlyIncomplete ? 'إظهار الكل' : 'أظهر الناقصة',
      onClick: () => {
        ctx.filters.ready.clear();
        if (!onlyIncomplete) ctx.filters.ready.add('incomplete');
        renderNotice(ctx);
        renderFilters(ctx);
        renderList(ctx);
      },
    })));
}

/* ===== الفرز ===== */

function passes(ctx, x, exceptGroup = null) {
  for (const [g] of GROUPS) {
    if (g === exceptGroup) continue;
    const set = ctx.filters[g];
    if (set.size && !VALUES[g](x).some((v) => set.has(v))) return false;
  }
  if (ctx.query && !matchesQuery(x.searchKey, ctx.query)) return false;
  return true;
}

function uniqValues(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ar')).map((v) => ({ value: v, label: v }));
}

function optionsFor(ctx, group) {
  switch (group) {
    case 'ready': return READY_OPTIONS;
    case 'status': return ENUMS.externalStatuses.map((s) => ({ value: s.key, label: s.label }));
    case 'type': return uniqValues(ctx.items.map((x) => x.type)).map((o) => ({ value: o.value, label: typeLabel(ctx.lists, o.value) }));
    case 'purpose': return ENUMS.purposes.map((p) => ({ value: p.key, label: p.label }));
    case 'city': return uniqValues(ctx.items.map((x) => x.city));
    case 'district': {
      const cities = ctx.filters.city;
      const source = cities.size ? ctx.items.filter((x) => cities.has(x.city)) : ctx.items;
      return uniqValues(source.map((x) => x.district));
    }
    case 'platform': return uniqValues(ctx.items.map((x) => x.platform));
    default: return [];
  }
}

function renderFilters(ctx) {
  const wrap = ctx.nodes.filters;
  clear(wrap);
  for (const [group, label] of GROUPS) {
    const options = optionsFor(ctx, group);
    if (!options.length) continue;
    const chips = el('div', { class: 'chips' });
    chips.append(allChip(ctx.filters[group], options.map((o) => o.value),
      () => { renderNotice(ctx); renderFilters(ctx); renderList(ctx); }));
    for (const opt of options) {
      const n = ctx.items.filter((x) => passes(ctx, x, group) && VALUES[group](x).includes(opt.value)).length;
      const active = ctx.filters[group].has(opt.value);
      chips.append(el('button', {
        type: 'button', class: `chip${active ? ' active' : ''}${n === 0 && !active ? ' zero' : ''}`,
        onClick: () => {
          if (active) ctx.filters[group].delete(opt.value); else ctx.filters[group].add(opt.value);
          if (group === 'city') {
            const allowed = new Set(optionsFor(ctx, 'district').map((o) => o.value));
            for (const d of [...ctx.filters.district]) if (!allowed.has(d)) ctx.filters.district.delete(d);
          }
          renderNotice(ctx);
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
      onClick: () => {
        for (const [g] of GROUPS) ctx.filters[g].clear();
        renderNotice(ctx);
        renderFilters(ctx);
        renderList(ctx);
      },
    })));
  }
}

/* ===== القائمة ===== */

function linkButton(url, { small = true } = {}) {
  if (!url) return null;
  return el('a', {
    class: `btn btn-ghost${small ? ' btn-sm' : ''}`, href: url, target: '_blank', rel: 'noopener noreferrer',
    title: url, text: 'فتح الرابط ↗',
    onClick: (e) => e.stopPropagation(),
  });
}

function readyBadge(x, ctx = null) {
  const { ready, missing } = matchReadiness(x);
  if (ready) return badge('جاهز للمطابقة', 'badge-ok');
  // «أكمل الآن» (المرحلة ٥٩): الصفُّ الناقص كان يقول ما ينقصه ولا يفتح طريقًا إليه.
  return el('span', { class: 'row', style: { gap: '6px', flexWrap: 'wrap' } },
    badge(`ينقصه: ${missing.map((m) => m.label).join('، ')}`, 'badge-warn'),
    ctx ? el('button', {
      type: 'button', class: 'btn btn-sm', text: 'أكمل الآن',
      onClick: (e) => { e.stopPropagation(); openForm(ctx, x); },
    }) : null);
}

function statusCell(ctx, x) {
  const select = selectEl({
    options: ENUMS.externalStatuses.map((s) => ({ value: s.key, label: s.label })),
    value: x.status,
    onChange: async (e) => {
      const status = e.target.value;
      try {
        await repo.externalListings.update(x.id, { status });
        toast(`الحالة الآن: ${labelFor(ENUMS.externalStatuses, status)}`, 'success');
        window.dispatchEvent(new CustomEvent('kassab:data-changed'));
        await refresh(ctx);
      } catch (err) {
        toast(err.message || 'تعذر تغيير الحالة', 'error');
        await refresh(ctx);
      }
    },
  });
  select.addEventListener('click', (e) => e.stopPropagation());
  return select;
}

function renderList(ctx) {
  const items = ctx.items.filter((x) => passes(ctx, x));
  ctx.nodes.count.textContent = items.length === ctx.items.length
    ? `(${formatNumber(ctx.items.length)})`
    : `(${formatNumber(items.length)} من ${formatNumber(ctx.items.length)})`;
  const area = ctx.nodes.list;
  clear(area);

  if (!ctx.items.length) {
    area.append(emptyState('لا عروض خارجية بعد. الصق نص عرض من إحدى المنصات من زر «إضافة عرض».',
      el('button', { type: 'button', class: 'btn btn-primary', text: '+ إضافة عرض', onClick: () => openForm(ctx, null) })));
    return;
  }
  if (!items.length) {
    area.append(emptyState('لا نتائج تطابق الفرز أو البحث.'));
    return;
  }

  const head = el('tr', {}, ['النوع', 'الموقع', 'الغرض', 'المساحة', 'السعر', 'المنصة', 'تاريخ النشر', 'الحالة', 'الجاهزية']
    .map((t) => el('th', { text: t })));
  const body = el('tbody', {}, items.map((x) => el('tr', { onClick: () => openForm(ctx, x) },
    el('td', {}, x.type ? typeLabel(ctx.lists, x.type) : el('span', { class: 'muted', text: '—' })),
    el('td', {}, [x.district, x.city].filter(Boolean).join('، ') || el('span', { class: 'muted', text: '—' })),
    el('td', {}, el('div', { class: 'cell-stack' }, (x.purposes || []).map((p) => badge(labelFor(ENUMS.purposes, p))))),
    el('td', { class: 'num', text: x.area == null ? '—' : formatArea(x.area) }),
    el('td', { class: 'num', text: x.price == null ? '—' : formatSAR(x.price) }),
    el('td', {}, el('div', { class: 'cell-stack' },
      x.platform ? el('span', { text: x.platform }) : el('span', { class: 'muted', text: '—' }),
      linkButton(x.sourceUrl))),
    el('td', { text: x.postedAt ? formatDate(x.postedAt) : '—' }),
    el('td', {}, statusCell(ctx, x)),
    el('td', {}, readyBadge(x, ctx)))));
  area.append(el('div', { class: 'table-wrap' }, el('table', { class: 'table' }, el('thead', {}, head), body)));
}

/* ===== النموذج ===== */

async function openForm(ctx, existing) {
  const isEdit = !!existing;
  const draft = existing ? { ...existing } : repo.externalListings.defaults();
  const state = { newFile: null, previewUrl: null, removeScreenshot: false, dupConfirmed: false };

  const errorsBox = el('div', { class: 'form-errors', hidden: true });
  const showErrors = (errors) => {
    clear(errorsBox);
    errorsBox.append(el('ul', {}, errors.map((e) => el('li', { text: e }))));
    errorsBox.hidden = false;
    errorsBox.scrollIntoView?.({ block: 'nearest' });
  };

  /* الحقول */
  const citySelect = selectEl({
    options: ctx.lists.cities.map((c) => ({ value: c, label: c })),
    value: draft.city || '', placeholder: 'بلا مدينة (يُصنَّف بانتظار الإكمال)',
    onChange: () => fillDistricts(),
  });
  const districtList = el('datalist', { id: 'ext-district-options' });
  const districtInput = el('input', { class: 'input', type: 'text', list: 'ext-district-options', value: draft.district || '', placeholder: 'اكتب أو اختر من القائمة' });
  const fillDistricts = () => {
    clear(districtList);
    for (const d of ctx.lists.districtsByCity[citySelect.value] || []) districtList.append(el('option', { value: d }));
  };
  fillDistricts();

  const typeSelect = selectEl({
    options: ctx.lists.propertyTypes.map((t) => ({ value: t.key, label: t.label })),
    value: draft.type || '', placeholder: 'بلا نوع (يُصنَّف بانتظار الإكمال)',
  });
  const purposesBox = el('div', { class: 'check-group' }, ENUMS.purposes.map((p) => checkbox(p.label, {
    name: 'ext-purpose', value: p.key, checked: (draft.purposes || []).includes(p.key),
  })));

  const areaInput = el('input', { class: 'input', type: 'number', min: '0', step: 'any', value: draft.area ?? '' });
  const priceInput = el('input', { class: 'input', type: 'number', min: '0', step: 'any', value: draft.price ?? '' });
  const statusSelect = selectEl({ options: ENUMS.externalStatuses.map((s) => ({ value: s.key, label: s.label })), value: draft.status });
  const platformList = el('datalist', { id: 'ext-platform-options' });
  for (const p of [...new Set(ctx.items.map((x) => x.platform).filter(Boolean))]) platformList.append(el('option', { value: p }));
  const platformInput = el('input', { class: 'input', type: 'text', list: 'ext-platform-options', value: draft.platform || '', placeholder: 'عقار، حراج، وصلت…' });
  const postedInput = el('input', { class: 'input', type: 'date', value: draft.postedAt ? toInputDate(draft.postedAt) : '' });
  const notesInput = el('textarea', { class: 'input', rows: 2, value: draft.notes || '' });

  /* الرابط: مرجع يُفتح بنقرة فقط */
  const urlInput = el('input', { class: 'input', type: 'url', value: draft.sourceUrl || '', placeholder: 'https://…', dir: 'ltr' });
  const urlOpen = el('span');
  const updateUrlOpen = () => {
    clear(urlOpen);
    const u = urlInput.value.trim();
    if (/^https?:\/\//i.test(u)) urlOpen.append(linkButton(u, { small: true }));
  };
  urlInput.addEventListener('input', updateUrlOpen);
  updateUrlOpen();

  /* جوال المعلن + تنبيه "قد يكون عقارك" */
  const phoneHint = el('span', { class: 'field-hint' });
  const phoneInput = el('input', { class: 'input', type: 'tel', value: draft.advertiserPhone || '', placeholder: '05XXXXXXXX', dir: 'ltr' });
  const checkPhone = async () => {
    clear(phoneHint);
    phoneHint.className = 'field-hint';
    const value = phoneInput.value.trim();
    if (!value) return;
    try {
      const hits = await repo.externalListings.findDuplicates({ advertiserPhone: value, excludeId: existing?.id || null });
      const inventory = hits.filter((h) => h.reason === 'inventory');
      const others = hits.filter((h) => h.reason === 'phone');
      if (inventory.length) {
        phoneHint.classList.add('error');
        phoneHint.textContent = `تنبيه: هذا الرقم مسجَّل مالكًا لـ${countOf(inventory.length, 'عقار')} في مخزونك (${inventory[0].detail}) — قد يكون العرض لعقارك نفسه`;
      } else if (others.length) {
        phoneHint.classList.add('error');
        phoneHint.textContent = `هذا الرقم موجود في ${countOf(others.length, 'عرض خارجي')} آخر`;
      }
    } catch (_) { /* التنبيه تحسيني: فشله لا يعطّل النموذج */ }
  };
  phoneInput.addEventListener('change', checkPhone);
  if (draft.advertiserPhone) checkPhone();

  /* الموقع */
  const locationHint = el('span', { class: 'field-hint' });
  const locationInput = el('input', { class: 'input', type: 'text', value: locationToText(draft.location), placeholder: 'إحداثيات "24.71, 46.67" أو رابط خرائط جوجل كامل', dir: 'ltr' });
  const updateLocationHint = () => {
    const text = locationInput.value.trim();
    clear(locationHint);
    locationHint.className = 'field-hint';
    if (!text) { locationHint.textContent = 'اختياري'; return; }
    const loc = parseLocation(text);
    if (loc) {
      locationHint.classList.add('ok');
      locationHint.append(`تمت قراءة الإحداثيات: ${locationToText(loc)} — `, el('a', { href: mapsLink(loc), target: '_blank', rel: 'noopener', text: 'فتح في الخرائط' }));
    } else if (isShortMapLink(text)) {
      locationHint.classList.add('error');
      locationHint.textContent = 'الروابط المختصرة لا تحمل الإحداثيات؛ افتح الرابط وانسخ الرابط الكامل أو الإحداثيات';
    } else {
      locationHint.classList.add('error');
      locationHint.textContent = 'تعذر قراءة الموقع من هذا النص';
    }
  };
  locationInput.addEventListener('input', updateLocationHint);
  updateLocationHint();

  /* النص الملصوق وقراءته محليًا */
  const rawInput = el('textarea', {
    class: 'input', rows: 6, value: draft.rawText || '',
    placeholder: 'الصق نص العرض كما هو من المنصة أو من واتساب…',
  });
  const parseResult = el('div', { class: 'parse-result', hidden: true });
  const parseBtn = el('button', {
    type: 'button', class: 'btn', text: 'اقرأ الحقول من النص',
    onClick: () => {
      const { fields, found, warnings } = parseListingText(rawInput.value, {
        districts: ctx.lists.districtsByCity[citySelect.value || 'الرياض'] || [],
        types: ctx.lists.propertyTypes,
        cities: ctx.lists.cities,
      });
      const filled = [];
      const skipped = [];
      const put = (label, condition, apply) => {
        if (!condition) { skipped.push(label); return; }
        apply();
        filled.push(label);
      };
      if (fields.city) put('المدينة', !citySelect.value, () => { citySelect.value = fields.city; fillDistricts(); });
      if (fields.district) put('الحي', !districtInput.value.trim(), () => { districtInput.value = fields.district; });
      if (fields.type) put('النوع', !typeSelect.value, () => { typeSelect.value = fields.type; });
      if (fields.purposes) {
        put('الغرض', !purposesBox.querySelector('input:checked'), () => {
          for (const input of purposesBox.querySelectorAll('input')) input.checked = fields.purposes.includes(input.value);
        });
      }
      if (fields.area != null) put('المساحة', areaInput.value === '', () => { areaInput.value = String(fields.area); });
      if (fields.price != null) put('السعر', priceInput.value === '', () => { priceInput.value = String(fields.price); });
      if (fields.advertiserPhone) {
        put('جوال المعلن', !phoneInput.value.trim(), () => { phoneInput.value = fields.advertiserPhone; checkPhone(); });
      }
      if (fields.sourceUrl) put('الرابط', !urlInput.value.trim(), () => { urlInput.value = fields.sourceUrl; updateUrlOpen(); });
      if (fields.platform) put('المنصة', !platformInput.value.trim(), () => { platformInput.value = fields.platform; });
      if (fields.mapsText) put('الموقع', !locationInput.value.trim(), () => { locationInput.value = fields.mapsText; updateLocationHint(); });

      clear(parseResult);
      parseResult.hidden = false;
      if (!found.length) {
        parseResult.append(el('p', { class: 'muted small', text: 'لم يُقرأ شيء من النص. أكمل الحقول يدويًا — والقراءة تقريبية دائمًا.' }));
      } else {
        parseResult.append(el('div', { class: 'chips' }, found.map((f) => el('span', { class: 'chip-static', text: `${f.label}: ${f.text}` }))));
        parseResult.append(el('p', { class: 'muted small', text: filled.length ? `عُبّئ: ${filled.join('، ')}` : 'كل الحقول المقروءة مملوءة أصلًا فلم يُستبدل شيء.' }));
        if (skipped.length) parseResult.append(el('p', { class: 'muted small', text: `لم يُستبدل ما أدخلتَه بنفسك: ${skipped.join('، ')}` }));
      }
      for (const w of warnings) parseResult.append(el('p', { class: 'field-hint error', text: w }));
      parseResult.append(el('p', { class: 'muted small', text: 'راجع كل حقل قبل الحفظ: القراءة محلية وتقريبية، والاعتماد يدوي دائمًا.' }));
    },
  });

  /* صورة الشاشة (واحدة) */
  const fileInput = el('input', {
    type: 'file', accept: 'image/*', class: 'visually-hidden',
    onChange: (e) => { state.newFile = e.target.files[0] || null; state.removeScreenshot = false; e.target.value = ''; renderShot(); },
  });
  const shotBox = el('div', { class: 'images-box' });
  const renderShot = () => {
    clear(shotBox);
    if (state.previewUrl) { URL.revokeObjectURL(state.previewUrl); state.previewUrl = null; }
    if (state.newFile) {
      state.previewUrl = URL.createObjectURL(state.newFile);
      shotBox.append(el('div', { class: 'img-tile new' }, el('img', { src: state.previewUrl, alt: '' }),
        el('button', { type: 'button', class: 'img-remove', text: '✕', title: 'إزالة', onClick: () => { state.newFile = null; renderShot(); } })));
    } else if (draft.screenshotImageId && !state.removeScreenshot) {
      const img = el('img', { alt: '' });
      getImageUrl(draft.screenshotImageId, { thumb: true }).then((url) => { if (url) img.src = url; });
      shotBox.append(el('div', { class: 'img-tile' }, img,
        el('button', { type: 'button', class: 'img-remove', text: '✕', title: 'حذف الصورة', onClick: () => { state.removeScreenshot = true; renderShot(); } })));
    }
    if (!state.newFile && (!draft.screenshotImageId || state.removeScreenshot)) {
      shotBox.append(el('label', { class: 'img-add' }, '+ صورة شاشة', fileInput));
    }
  };
  renderShot();

  /* التجميع والحفظ */
  const collect = () => ({
    rawText: rawInput.value,
    sourceUrl: urlInput.value.trim(),
    platform: platformInput.value.trim(),
    advertiserPhone: phoneInput.value.trim(),
    postedAt: postedInput.value ? fromInputDate(postedInput.value) : null,
    city: citySelect.value.trim(),
    district: districtInput.value.trim(),
    type: typeSelect.value,
    purposes: [...purposesBox.querySelectorAll('input:checked')].map((i) => i.value),
    area: areaInput.value === '' ? null : Number(areaInput.value),
    price: priceInput.value === '' ? null : Number(priceInput.value),
    location: parseLocation(locationInput.value),
    notes: notesInput.value.trim(),
    status: statusSelect.value,
    screenshotImageId: state.removeScreenshot && !state.newFile ? null : draft.screenshotImageId,
  });

  const dupText = (hits) => hits.slice(0, 5).map((h) => {
    if (h.reason === 'url') return `• نفس الرابط في عرض محفوظ (${h.listing.platform || 'بلا منصة'})`;
    if (h.reason === 'phone') return `• نفس جوال المعلن في عرض آخر: ${[h.listing.district, h.listing.city].filter(Boolean).join('، ') || 'بلا حي'}`;
    if (h.reason === 'inventory') return `• جوال المعلن مسجَّل مالكًا لعقار في مخزونك: ${[h.property.district, h.property.city].filter(Boolean).join('، ')} (${h.detail})`;
    return `• عرض شبيه: ${[h.listing.district, h.listing.city].filter(Boolean).join('، ')} · ${h.listing.area ?? '؟'} م² · ${h.listing.price == null ? 'بلا سعر' : formatSAR(h.listing.price)}`;
  }).join('\n');

  const saveBtn = el('button', { type: 'button', class: 'btn btn-primary', text: isEdit ? 'حفظ التعديلات' : 'إضافة العرض' });
  saveBtn.addEventListener('click', async () => {
    errorsBox.hidden = true;
    const data = collect();
    const errors = [];
    if (!data.rawText.trim() && !data.sourceUrl && !state.newFile && !data.screenshotImageId && data.price == null) {
      errors.push('أدخل نص العرض أو رابطه أو صورة شاشته على الأقل');
    }
    const locText = locationInput.value.trim();
    if (locText && !data.location) {
      errors.push(isShortMapLink(locText) ? 'رابط الموقع مختصر ولا يمكن قراءته — الصق الرابط الكامل أو الإحداثيات' : 'تعذر قراءة الموقع');
    }
    if (errors.length) { showErrors(errors); return; }

    saveBtn.disabled = true;
    try {
      if (!state.dupConfirmed) {
        const hits = await repo.externalListings.findDuplicates({ ...data, excludeId: existing?.id || null });
        if (hits.length) {
          const ok = await confirmDialog({
            title: 'قد يكون مكررًا',
            message: `${dupText(hits)}\n\nأتحفظه على أي حال؟`,
            confirmText: 'احفظ على أي حال',
          });
          if (!ok) { saveBtn.disabled = false; return; }
          state.dupConfirmed = true;
        }
      }

      let rec = isEdit ? await repo.externalListings.update(existing.id, data) : await repo.externalListings.create(data);
      const oldShot = draft.screenshotImageId;
      if (state.newFile) {
        toast('جارٍ ضغط الصورة وحفظها…');
        try {
          const img = await storeImage(state.newFile, { entity: 'external', entityId: rec.id });
          rec = await repo.externalListings.update(rec.id, { screenshotImageId: img.id });
          if (oldShot) await removeImage(oldShot);
        } catch (err) {
          toast(`تعذر حفظ صورة الشاشة: ${err.message}`, 'error', 6000);
        }
      } else if (state.removeScreenshot && oldShot) {
        await removeImage(oldShot);
      }
      if (data.district && data.city && !(ctx.lists.districtsByCity[data.city] || []).includes(data.district)) {
        await addDistrict(data.city, data.district);
      }
      modal.close();
      const readiness = matchReadiness(rec);
      toast(isEdit ? 'تم حفظ التعديلات' : 'أُضيف العرض الخارجي', 'success');
      if (!readiness.ready) {
        toast(`بانتظار الإكمال — ينقصه: ${readiness.missing.map((m) => m.label).join('، ')}. لن يدخل المطابقة قبل إكماله.`, 'info', 6000);
      }
      window.dispatchEvent(new CustomEvent('kassab:data-changed'));
      await refresh(ctx);
    } catch (err) {
      if (err instanceof ValidationError) showErrors(err.errors);
      else { console.error(err); showErrors([err.message || 'حدث خطأ غير متوقع']); }
    } finally {
      saveBtn.disabled = false;
    }
  });

  const deleteBtn = isEdit ? el('button', {
    type: 'button', class: 'btn btn-ghost btn-danger', text: 'حذف العرض',
    onClick: async () => {
      const ok = await confirmDialog({
        title: 'حذف العرض الخارجي',
        message: 'سيُحذف العرض وصورته ومطابقاته المحفوظة نهائيًا. هل أنت متأكد؟',
        confirmText: 'حذف', danger: true,
      });
      if (!ok) return;
      try {
        await repo.externalListings.remove(existing.id);
        modal.close();
        toast('حُذف العرض', 'success');
        window.dispatchEvent(new CustomEvent('kassab:data-changed'));
        await refresh(ctx);
      } catch (err) {
        showErrors([err.message || 'تعذر الحذف']);
      }
    },
  }) : null;

  const modal = openModal({
    title: isEdit ? 'تعديل عرض خارجي' : 'عرض خارجي جديد',
    size: 'wide',
    onClose: () => { if (state.previewUrl) URL.revokeObjectURL(state.previewUrl); },
    body: el('div', {},
      errorsBox,
      el('div', { class: 'form-section' },
        el('h3', { class: 'form-section-title', text: 'النص الملصوق' }),
        rawInput,
        el('div', { class: 'row' }, parseBtn,
          el('span', { class: 'field-hint', text: 'قراءة محلية مجانية بلا أي خدمة خارجية، ولا تُستبدل الحقول التي أدخلتَها بنفسك.' })),
        parseResult,
        el('p', { class: 'field-hint', text: 'النص لا يُقرأ من الصورة: استخرجه بأداة جهازك (النص المباشر في آيفون أو عدسة جوجل) ثم الصقه هنا.' })),
      el('div', { class: 'form-section' },
        el('h3', { class: 'form-section-title', text: 'صورة الشاشة' }),
        shotBox),
      el('div', { class: 'form-section' },
        el('h3', { class: 'form-section-title', text: 'حقول العرض' }),
        el('div', { class: 'form-grid' },
          labeled('المدينة', citySelect),
          labeled('الحي', el('div', { class: 'field-row' }, districtInput, districtList)),
          labeled('النوع', typeSelect),
          fieldGroup('الغرض', purposesBox),
          labeled('المساحة (م²)', areaInput),
          labeled('السعر (ريال)', priceInput, { hint: 'اتركه فارغًا إن كان غير معروف' }),
          labeled('الرابط (مرجع يُفتح بنقرة)', el('div', { class: 'field-row' }, urlInput, urlOpen), { full: true }),
          labeled('المنصة', el('div', { class: 'field-row' }, platformInput, platformList)),
          labeled('تاريخ النشر', postedInput, { hint: 'اختياري — ينفع لاحقًا في التسعير' }),
          el('label', { class: 'field' }, el('span', { class: 'field-label', text: 'جوال المعلن' }), phoneInput, phoneHint),
          labeled('الحالة', statusSelect),
          el('label', { class: 'field field-full' }, el('span', { class: 'field-label', text: 'الموقع' }), locationInput, locationHint),
          labeled('ملاحظات', notesInput, { full: true }))),
      isEdit ? el('p', { class: 'muted small', text: `أُضيف: ${formatDate(existing.createdAt)}` }) : null),
    footer: [
      deleteBtn,
      el('button', { type: 'button', class: 'btn btn-ghost', text: 'إلغاء', onClick: () => modal.close() }),
      saveBtn,
    ],
  });
}
