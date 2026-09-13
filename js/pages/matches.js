// صفحة المطابقات (المرحلة ٣): مطابقات الطلبات النشطة، مجمّعة بالطلب ومرتّبة تنازليًّا بالنسبة.
//
// النسب تُحسب لحظة العرض من محرك المطابقة، ولا يُكتب سجل في مخزن matches إلا عند تصرّفك:
// فما لم تتصرّف فيه حالته "جديدة" ضمنًا، و"إعادة إلى جديدة" تحذف السجل.
// المطابقة المتصرَّف فيها تظهر دائمًا ولو هبطت نسبتها تحت الشريط أو خرجت من الترشيح (تُوسَم "لم تعد مطابقة").
// و"غير مهتم" مخفية افتراضيًا حتى لا تتحول الصفحة إلى ضجيج.
// المرحلة ٤: العروض الخارجية تظهر في القائمة نفسها موسومة "خارجي" (مفتاح إظهارها أعلى الصفحة)،
// وسجل مطابقتها يُكتب بـ externalId لا propertyId.

import { repo } from '../data/repository.js';
import { ENUMS, labelFor, clientPriority, clientTagClass } from '../data/schema.js';
import { getLists, typeLabel, statusLabel, zoneLabel } from '../data/settings.js';
import { loadMatchingContext, candidatesFor, scoreOne, hardReasonLabel, priceFlexFor } from '../data/matching.js';
import {
  el, clear, labeled, selectEl, checkbox, badge, openModal, toast, emptyState,
} from '../util/dom.js';
import { formatSAR, formatArea, formatNumber, toInputDate, fromInputDate } from '../util/format.js';
import { formatPhone } from '../util/phone.js';

const STATUS_STYLE = { new: 'badge-outline', presented: 'badge-accent', interested: 'badge-ok', not_interested: '', won: 'badge-ok' };
const clientName = (c) => (c ? (c.name || formatPhone(c.phone) || 'عميل بلا اسم') : 'عميل محذوف');

function routeRequestId() {
  const m = /^#\/matches\/([^/?#]+)/.exec(location.hash || '');
  return m ? decodeURIComponent(m[1]) : null;
}

export async function render(container) {
  const ctx = {
    container, focusId: routeRequestId(),
    match: null, lists: null,
    propertiesById: new Map(), externalsById: new Map(), clientsById: new Map(), recordsByRequest: new Map(),
    threshold: 50, statusFilter: new Set(), showRejected: false, includeExternal: true,
    nodes: {},
  };
  await loadData(ctx);
  ctx.threshold = ctx.match.settings.minScore;
  buildLayout(ctx);
}

async function loadData(ctx) {
  const [lists, match] = await Promise.all([getLists(), loadMatchingContext()]);
  ctx.lists = lists;
  ctx.match = match;
  ctx.propertiesById = new Map(match.properties.map((p) => [p.id, p]));
  ctx.externalsById = new Map((match.externals || []).map((x) => [x.id, x]));
  ctx.clientsById = new Map(match.clients.map((c) => [c.id, c]));
  ctx.recordsByRequest = new Map();
  for (const rec of match.matches) {
    if (!ctx.recordsByRequest.has(rec.requestId)) ctx.recordsByRequest.set(rec.requestId, []);
    ctx.recordsByRequest.get(rec.requestId).push(rec);
  }
}

async function refresh(ctx) {
  await loadData(ctx);
  renderControls(ctx);
  renderList(ctx);
}

/* ===== بناء الصفوف ===== */

function requestsInView(ctx) {
  if (ctx.focusId) {
    const one = ctx.match.requests.find((r) => r.id === ctx.focusId);
    return one ? [one] : [];
  }
  return ctx.match.requests
    .filter((r) => r.status === 'active')
    // العملاء ذوو الأولوية («جادّ» ثم «مهم») أولًا، ثم آخر تعديل كما كان (المرحلة ٨).
    .sort((a, b) => (clientPriority(ctx.clientsById.get(b.clientId)) - clientPriority(ctx.clientsById.get(a.clientId)))
      || (b.updatedAt || '').localeCompare(a.updatedAt || ''));
}

/** صفوف طلب واحد: المرشحون فوق الشريط + كل مطابقة محفوظة ولو خرجت من الترشيح. */
function rowsFor(ctx, request) {
  const records = ctx.recordsByRequest.get(request.id) || [];
  const recordByListing = new Map(records
    .filter((r) => r.propertyId || r.externalId)
    .map((r) => [r.propertyId ? `property:${r.propertyId}` : `external:${r.externalId}`, r]));
  const rows = [];
  const seen = new Set();

  for (const cand of candidatesFor(request, ctx.match, { minScore: ctx.threshold, includeExternal: ctx.includeExternal })) {
    const key = `${cand.kind}:${cand.listing.id}`;
    seen.add(key);
    rows.push({ ...cand, record: recordByListing.get(key) || null, stale: false, reason: null });
  }
  for (const rec of records) {
    const kind = rec.externalId ? 'external' : 'property';
    const id = rec.externalId || rec.propertyId;
    if (!id || seen.has(`${kind}:${id}`)) continue;
    if (kind === 'external' && !ctx.includeExternal) continue;
    const listing = kind === 'external' ? ctx.externalsById.get(id) : ctx.propertiesById.get(id);
    if (!listing) continue; // المعروض حُذف (وحذفه يحذف مطابقاته أصلًا)
    const result = scoreOne(request, listing, ctx.match, kind);
    rows.push({
      listing, kind, score: result.ok ? result.score : 0, tags: result.tags, parts: result.parts,
      priceUnknown: result.priceUnknown, record: rec,
      stale: !result.ok || result.score < ctx.threshold,
      reason: result.ok ? null : result.reason,
    });
  }
  return rows.sort((a, b) => b.score - a.score);
}

const rowStatus = (row) => row.record?.status || 'new';

function visibleRows(ctx, rows) {
  return rows.filter((row) => {
    const st = rowStatus(row);
    if (st === 'not_interested' && !ctx.showRejected) return false;
    if (ctx.statusFilter.size && !ctx.statusFilter.has(st)) return false;
    return true;
  });
}

/* ===== التخطيط ===== */

function buildLayout(ctx) {
  clear(ctx.container);
  ctx.nodes.count = el('span', { class: 'count' });
  const head = el('div', { class: 'page-head' },
    el('h1', {}, 'المطابقات ', ctx.nodes.count),
    el('div', { class: 'head-actions' },
      el('a', { class: 'btn', href: '#/requests', text: 'الطلبات العقارية' })));
  ctx.nodes.controls = el('div', { class: 'filters' });
  ctx.nodes.list = el('div');
  ctx.container.append(head, ctx.nodes.controls, ctx.nodes.list);
  renderControls(ctx);
  renderList(ctx);
}

function renderControls(ctx) {
  const wrap = ctx.nodes.controls;
  clear(wrap);

  if (ctx.focusId) {
    const request = ctx.match.requests.find((r) => r.id === ctx.focusId);
    wrap.append(el('div', { class: 'row' },
      badge(request ? `طلب واحد: ${clientName(ctx.clientsById.get(request.clientId))}` : 'طلب غير موجود', 'badge-accent'),
      el('a', { class: 'btn btn-ghost btn-sm', href: '#/matches', text: 'عرض كل الطلبات النشطة' })));
  }

  /* شريط النسبة */
  const label = el('span', { class: 'filter-label', style: { minWidth: '150px' } });
  const range = el('input', {
    type: 'range', min: '0', max: '100', step: '5', value: String(ctx.threshold), class: 'range',
    onInput: (e) => { ctx.threshold = Number(e.target.value); label.textContent = `أظهر ما نسبته ≥ ${ctx.threshold}٪`; renderList(ctx); },
  });
  label.textContent = `أظهر ما نسبته ≥ ${ctx.threshold}٪`;
  wrap.append(el('div', { class: 'filter-row' }, label, range));

  /* حالات المطابقة */
  const allRows = requestsInView(ctx).flatMap((r) => rowsFor(ctx, r));
  const chips = el('div', { class: 'chips' });
  for (const st of ENUMS.matchStatuses) {
    const n = allRows.filter((row) => rowStatus(row) === st.key).length;
    const active = ctx.statusFilter.has(st.key);
    chips.append(el('button', {
      type: 'button', class: `chip${active ? ' active' : ''}${n === 0 && !active ? ' zero' : ''}`,
      onClick: () => {
        if (active) ctx.statusFilter.delete(st.key); else ctx.statusFilter.add(st.key);
        if (st.key === 'not_interested' && ctx.statusFilter.has('not_interested')) ctx.showRejected = true;
        renderControls(ctx);
        renderList(ctx);
      },
    }, st.label, el('span', { class: 'chip-count', text: String(n) })));
  }
  wrap.append(el('div', { class: 'filter-row' }, el('span', { class: 'filter-label', text: 'الحالة' }), chips));

  wrap.append(el('div', { class: 'row' },
    checkbox('إظهار «غير مهتم»', {
      checked: ctx.showRejected,
      onChange: (e) => { ctx.showRejected = e.target.checked; renderControls(ctx); renderList(ctx); },
    }),
    checkbox('إظهار العروض الخارجية', {
      checked: ctx.includeExternal,
      onChange: (e) => { ctx.includeExternal = e.target.checked; renderControls(ctx); renderList(ctx); },
    }),
    ctx.statusFilter.size
      ? el('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: 'مسح فرز الحالة', onClick: () => { ctx.statusFilter.clear(); renderControls(ctx); renderList(ctx); } })
      : null));
}

function requestSummary(ctx, request) {
  const zones = ctx.match.zonesByCity[request.city] || [];
  const zoneNames = (request.districtZones || []).map((k) => zoneLabel(zones, k)).filter(Boolean);
  const places = [...zoneNames, ...(request.districts || [])];
  const flex = priceFlexFor(request, ctx.match.settings);
  const bits = [
    typeLabel(ctx.lists, request.type),
    labelFor(ENUMS.purposes, request.purpose),
    request.city,
    places.length ? places.join('، ') : 'أي حي',
    request.budgetMax == null ? 'بلا سقف ميزانية' : `حتى ${formatSAR(request.budgetMax)} (مرونة ${formatSAR(Math.round(flex.value))})`,
    request.area == null ? 'بلا مساحة محددة' : `${formatArea(request.area)} أو أكثر`,
  ];
  return el('p', { class: 'panel-desc', text: bits.join(' · ') });
}

function scoreNode(score) {
  const cls = score >= 85 ? 'ok' : score >= 65 ? 'mid' : 'low';
  return el('div', { class: `score score-${cls}` },
    el('span', { class: 'score-num', text: `${score}٪` }),
    el('span', { class: 'score-bar' }, el('span', { class: 'score-fill', style: { width: `${Math.max(2, score)}%` } })));
}

function partsNode(row) {
  if (!row.parts.length) return el('span', { class: 'muted small', text: 'لا معايير مرجّحة في هذا الطلب' });
  return el('div', { class: 'match-parts' }, row.parts.map((p) => el('span', {
    class: `match-part${p.state === 'unknown' ? ' unknown' : p.ratio >= 1 ? ' full' : ' partial'}`,
    text: `${p.label}: ${p.detail}`,
  })));
}

function renderList(ctx) {
  const area = ctx.nodes.list;
  clear(area);
  const requests = requestsInView(ctx);

  if (!ctx.match.requests.length) {
    ctx.nodes.count.textContent = '';
    area.append(emptyState('لا طلبات بعد. أضف طلبًا أولًا ثم عد إلى هذه الصفحة.',
      el('a', { class: 'btn btn-primary', href: '#/requests', text: 'الطلبات العقارية' })));
    return;
  }
  if (!requests.length) {
    ctx.nodes.count.textContent = '';
    area.append(emptyState(ctx.focusId ? 'الطلب غير موجود أو حُذف.' : 'لا طلبات نشطة. الطلبات الموقوفة والمنجزة لا تُحسب لها مطابقات هنا.'));
    return;
  }

  let shown = 0;
  for (const request of requests) {
    const rows = visibleRows(ctx, rowsFor(ctx, request));
    shown += rows.length;
    const client = ctx.clientsById.get(request.clientId);
    const block = el('section', { class: 'panel match-block' },
      el('div', { class: 'match-head' },
        el('h2', {}, clientName(client),
          // تصنيفا الأولوية المدمجان يظهران هنا ليُفسّرا تصدُّر هذا الطلب القائمة (المرحلة ٨).
          ...(client?.tags || []).filter((t) => clientTagClass(t)).map((t) => badge(t, clientTagClass(t))),
          request.status !== 'active' ? badge(labelFor(ENUMS.requestStatuses, request.status), 'badge-warn') : null),
        el('div', { class: 'row' },
          client?.phone ? el('a', { class: 'tel', href: `tel:${client.phone}`, text: formatPhone(client.phone) }) : null,
          el('a', { class: 'btn btn-ghost btn-sm', href: '#/requests', text: 'تعديل الطلب' }))),
      requestSummary(ctx, request));

    if (!rows.length) {
      block.append(el('p', { class: 'muted small', text: 'لا مطابقات بهذه الشروط. جرّب إنزال الشريط أو مراجعة الأحياء وسقف الميزانية.' }));
    } else {
      block.append(el('div', { class: 'match-list' }, rows.map((row) => matchRow(ctx, request, row))));
    }
    area.append(block);
  }
  ctx.nodes.count.textContent = `(${formatNumber(shown)})`;
}

function matchRow(ctx, request, row) {
  const p = row.listing;
  const status = rowStatus(row);
  const statusSelect = selectEl({
    options: [
      { value: 'new', label: 'جديدة (بلا تصرّف)' },
      ...ENUMS.matchStatuses.filter((s) => s.key !== 'new').map((s) => ({ value: s.key, label: s.label })),
    ],
    value: status,
    onChange: (e) => setStatus(ctx, request, row, e.target.value),
  });

  const isExternal = row.kind === 'external';
  return el('div', { class: `match-row${row.stale ? ' stale' : ''}${isExternal ? ' external' : ''}` },
    scoreNode(row.score),
    el('div', { class: 'match-main' },
      el('div', { class: 'match-title' },
        isExternal ? badge('خارجي', 'badge-accent') : null,
        el('span', { class: 'strong', text: typeLabel(ctx.lists, p.type) }),
        el('span', { class: 'muted', text: [p.district, p.city].filter(Boolean).join('، ') || 'بلا حي' }),
        isExternal
          ? badge(labelFor(ENUMS.externalStatuses, p.status))
          : badge(statusLabel(ctx.lists, p.status)),
        isExternal && p.platform ? el('span', { class: 'muted small', text: p.platform }) : null,
        isExternal && p.sourceUrl
          ? el('a', { class: 'btn btn-ghost btn-sm', href: p.sourceUrl, target: '_blank', rel: 'noopener noreferrer', text: 'فتح الرابط ↗' })
          : null),
      el('div', { class: 'match-figures' },
        el('span', { class: p.price == null ? 'muted' : 'strong', text: formatSAR(p.price) }),
        el('span', { class: 'muted', text: formatArea(p.area) }),
        ...row.tags.map((t) => badge(t, 'badge-warn')),
        row.stale ? badge(row.reason ? `لم تعد مطابقة: ${hardReasonLabel(row.reason)}` : 'تحت الشريط الحالي', 'badge-danger') : null),
      partsNode(row)),
    el('div', { class: 'match-actions' },
      badge(labelFor(ENUMS.matchStatuses, status), STATUS_STYLE[status] || ''),
      statusSelect));
}

/* ===== تغيير الحالة ===== */

async function setStatus(ctx, request, row, status) {
  try {
    if (status === 'new') {
      if (row.record) await repo.matches.remove(row.record.id);
      toast('أُعيدت إلى «جديدة»', 'success');
    } else if (row.record) {
      await repo.matches.update(row.record.id, { status, score: row.score, priceUnknown: row.priceUnknown });
    } else {
      await repo.matches.create({
        requestId: request.id,
        propertyId: row.kind === 'external' ? null : row.listing.id,
        externalId: row.kind === 'external' ? row.listing.id : null,
        score: row.score, priceUnknown: row.priceUnknown, status,
      });
    }
    if (status === 'won') await openDealForm(ctx, request, row);
    window.dispatchEvent(new CustomEvent('motabiq:data-changed'));
    await refresh(ctx);
  } catch (err) {
    console.error(err);
    toast(err.message || 'تعذر تغيير الحالة', 'error');
    await refresh(ctx);
  }
}

/* ===== صفقة عند "أُبرمت" ===== */

function openDealForm(ctx, request, row) {
  return new Promise((resolve) => {
    const p = row.listing;
    const isExternal = row.kind === 'external';
    // العرض الخارجي ليس في مخزونك: الصفقة تُسجَّل بلا propertyId، ووصف العرض ورابطه
    // يُكتبان في الملاحظات لأن سجل الصفقة لا يحمل حقلًا للعرض الخارجي.
    const externalNote = isExternal
      ? [`عرض خارجي: ${typeLabel(ctx.lists, p.type)} — ${[p.district, p.city].filter(Boolean).join('، ')}`,
        p.platform ? `المنصة: ${p.platform}` : '', p.sourceUrl || '',
        p.advertiserPhone ? `جوال المعلن: ${p.advertiserPhone}` : '']
        .filter(Boolean).join(' · ')
      : '';
    const dateInput = el('input', { class: 'input', type: 'date', value: toInputDate() });
    const priceInput = el('input', { class: 'input', type: 'number', min: '0', step: '1000', value: p.price ?? '' });
    const commissionInput = el('input', { class: 'input', type: 'number', min: '0', step: '1000' });
    const notesInput = el('textarea', { class: 'input', rows: 2, value: externalNote });
    const syncBox = checkbox(
      isExternal ? 'إغلاق الطلب (مُنجز) ووسم العرض الخارجي «لم يعد متاحًا»' : 'تحديث حالة العقار وإغلاق الطلب (مُنجز)',
      { checked: true },
    );
    const errorsBox = el('div', { class: 'form-errors', hidden: true });

    const saveBtn = el('button', { type: 'button', class: 'btn btn-primary', text: 'تسجيل الصفقة' });
    saveBtn.addEventListener('click', async () => {
      const date = fromInputDate(dateInput.value);
      const finalPrice = priceInput.value === '' ? null : Number(priceInput.value);
      if (!date || finalPrice == null) {
        clear(errorsBox);
        errorsBox.append(el('div', { text: 'التاريخ والسعر النهائي مطلوبان' }));
        errorsBox.hidden = false;
        return;
      }
      saveBtn.disabled = true;
      try {
        await repo.deals.create({
          date, finalPrice,
          commission: commissionInput.value === '' ? null : Number(commissionInput.value),
          propertyId: isExternal ? null : p.id, clientId: request.clientId, notes: notesInput.value,
        });
        if (syncBox.querySelector('input').checked) {
          if (isExternal) await repo.externalListings.update(p.id, { status: 'unavailable' });
          else await repo.properties.update(p.id, { status: request.purpose === 'rent' ? 'rented' : 'sold' });
          await repo.requests.update(request.id, { status: 'done' });
        }
        toast('سُجّلت الصفقة', 'success');
        modal.close();
      } catch (err) {
        clear(errorsBox);
        errorsBox.append(el('div', { text: err.message || 'تعذر تسجيل الصفقة' }));
        errorsBox.hidden = false;
      } finally {
        saveBtn.disabled = false;
      }
    });

    const modal = openModal({
      title: isExternal ? 'تسجيل الصفقة (عرض خارجي)' : 'تسجيل الصفقة',
      onClose: () => resolve(),
      body: el('div', {},
        errorsBox,
        el('p', { class: 'muted small', text: `${isExternal ? 'عرض خارجي: ' : ''}${typeLabel(ctx.lists, p.type)} — ${[p.district, p.city].filter(Boolean).join('، ')} · العميل: ${clientName(ctx.clientsById.get(request.clientId))}` }),
        isExternal ? el('p', { class: 'field-hint', text: 'العرض ليس في مخزونك، فالصفقة تُسجَّل بلا عقار مربوط ووصف العرض ورابطه في الملاحظات.' }) : null,
        el('div', { class: 'form-grid' },
          labeled('تاريخ الصفقة', dateInput, { required: true }),
          labeled('السعر النهائي (ريال)', priceInput, { required: true }),
          labeled('العمولة (ريال)', commissionInput),
          labeled('ملاحظات', notesInput, { full: true }),
          el('div', { class: 'field field-full' }, syncBox))),
      footer: [
        el('button', { type: 'button', class: 'btn btn-ghost', text: 'تخطّي الآن', onClick: () => modal.close() }),
        saveBtn,
      ],
    });
  });
}
