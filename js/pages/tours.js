// صفحة "الجولات الميدانية والالتقاط والاعتماد" (المرحلة ٢) — صفحة واحدة في التنقّل بحسب جدول
// الصفحات، مقسَّمة داخليًا: تبويب الجولات (القائمة والمؤشرات، إنشاء/تعديل) وتبويب "بانتظار
// الاعتماد" (مفوَّض بالكامل لـ tour-approve.js). الالتقاط نفسه في tour-capture.js.

import { repo } from '../data/repository.js';
import { getLists, getCompleteness } from '../data/settings.js';
import { el, clear, labeled, badge, openModal, confirmDialog, toast, selectEl } from '../util/dom.js';
import { openCaptureForm } from './tour-capture.js';
import { renderQueue } from './tour-approve.js';

// يقرأ #/tours/queue ليفتح تبويب "بانتظار الاعتماد" مباشرة (يستعمله طابور الداشبورد)،
// بنفس نمط #/matches/<requestId> الموثّق. أي مسار آخر (بما فيه #/tours العادي) يفتح تبويب الجولات.
function routeTab() {
  return /^#\/tours\/queue/.test(location.hash || '') ? 'queue' : 'tours';
}

export async function render(container) {
  const ctx = {
    container, tab: routeTab(), nodes: {},
    tours: [], properties: [], clients: [], clientMap: new Map(), dealPropertyIds: new Set(),
    lists: null, completeness: [],
  };
  await loadData(ctx);
  buildLayout(ctx);
}

async function loadData(ctx) {
  const [tours, properties, clients, deals, lists, completeness] = await Promise.all([
    repo.tours.list(), repo.properties.list(), repo.clients.list(), repo.deals.list(), getLists(), getCompleteness(),
  ]);
  tours.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  ctx.tours = tours;
  ctx.properties = properties;
  ctx.clients = clients;
  ctx.clientMap = new Map(clients.map((c) => [c.id, c]));
  ctx.dealPropertyIds = new Set(deals.map((d) => d.propertyId).filter(Boolean));
  ctx.lists = lists;
  ctx.completeness = completeness;
}

async function refresh(ctx) {
  await loadData(ctx);
  buildLayout(ctx);
}

function pendingCount(ctx) {
  return ctx.properties.filter((p) => p.captureStatus !== 'approved').length;
}

function buildLayout(ctx) {
  clear(ctx.container);
  const pending = pendingCount(ctx);
  const segButtons = {};
  const seg = el('div', { class: 'seg' }, [
    ['tours', 'الجولات'],
    ['queue', pending ? `بانتظار الاعتماد (${pending})` : 'بانتظار الاعتماد'],
  ].map(([key, label]) => {
    segButtons[key] = el('button', {
      type: 'button', class: `seg-btn${ctx.tab === key ? ' active' : ''}`, text: label,
      onClick: async () => { ctx.tab = key; await refresh(ctx); },
    });
    return segButtons[key];
  }));

  ctx.container.append(
    el('div', { class: 'page-head' },
      el('h1', {}, 'الجولات الميدانية'),
      el('div', { class: 'head-actions' },
        seg,
        el('button', {
          type: 'button', class: 'btn btn-ghost', text: '📷 التقاط عقار',
          onClick: () => openCaptureForm({ tour: null, onSaved: () => refresh(ctx) }),
        }),
        el('button', { type: 'button', class: 'btn btn-primary', text: '+ جولة جديدة', onClick: () => openTourForm(ctx, null) }))));

  ctx.nodes.body = el('div');
  ctx.container.append(ctx.nodes.body);
  if (ctx.tab === 'tours') renderToursList(ctx);
  else renderQueue(ctx.nodes.body, { onChanged: () => refresh(ctx) });
}

/* ===== المؤشرات ===== */

// مُصدَّرة لاستعمالها في الداشبورد (معدل الاقتناص لكل جولة) بلا حساب مواز قد يختلف عن هذا التعريف.
export function tourStats(ctx, tour) {
  const props = ctx.properties.filter((p) => p.tourId === tour.id);
  const complete = props.filter((p) => repo.properties.isComplete(p, { owner: ctx.clientMap.get(p.ownerId), fields: ctx.completeness }).complete).length;
  const contacted = props.filter((p) => (ctx.clientMap.get(p.ownerId)?.contacts || []).length > 0).length;
  const agreed = props.filter((p) => p.status === 'agreed').length;
  const closed = props.filter((p) => ctx.dealPropertyIds.has(p.id)).length;
  return { captured: props.length, complete, contacted, agreed, closed };
}

function statChip(value, label) {
  return el('span', { class: 'chip chip-static' }, el('strong', { text: String(value) }), ` ${label}`);
}

/* ===== قائمة الجولات ===== */

function renderToursList(ctx) {
  clear(ctx.nodes.body);
  if (!ctx.tours.length) {
    ctx.nodes.body.append(el('div', { class: 'empty' }, el('p', { text: 'لا توجد جولات بعد. أنشئ جولة قبل الخروج، أو ابدأ "التقاط عقار" مباشرة وسنقترح الجولة من تاريخ الصور.' })));
    return;
  }
  const grid = el('div', { class: 'grid' });
  for (const tour of ctx.tours) {
    const stats = tourStats(ctx, tour);
    grid.append(el('article', { class: 'card' },
      el('div', { class: 'card-body' },
        el('div', { class: 'card-top' },
          el('span', { class: 'card-type', text: tour.date || 'بلا تاريخ' }),
          tour.inferred ? badge('مُستنتجة من الصور', 'badge-outline') : null),
        el('div', { class: 'card-place' }, tour.districts?.length ? tour.districts.join('، ') : 'بلا أحياء محددة'),
        tour.notes ? el('div', { class: 'muted small', text: tour.notes }) : null,
        el('div', { class: 'chips' },
          statChip(stats.captured, 'ملتقطة'),
          statChip(stats.complete, 'مكتملة'),
          statChip(stats.contacted, 'تم التواصل'),
          statChip(stats.agreed, 'موافق'),
          statChip(stats.closed, 'صفقة')),
        el('div', { class: 'head-actions', style: { marginTop: '8px' } },
          el('button', { type: 'button', class: 'btn btn-primary btn-sm', text: '📷 بدء التقاط', onClick: () => openCaptureForm({ tour, onSaved: () => refresh(ctx) }) }),
          el('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: 'تعديل', onClick: () => openTourForm(ctx, tour) })))));
  }
  ctx.nodes.body.append(grid);
}

/* ===== نموذج إنشاء/تعديل جولة ===== */

function districtsField(lists, initialCity, initialValues = []) {
  const values = new Set(initialValues);
  const chips = el('div', { class: 'chips' });
  const optionsList = el('datalist', { id: 'tour-district-options' });
  const input = el('input', { class: 'input', type: 'text', list: 'tour-district-options', placeholder: 'اكتب اسم الحي واضغط Enter' });
  let currentCity = initialCity;

  function fillOptions() {
    clear(optionsList);
    for (const d of lists.districtsByCity[currentCity] || []) optionsList.append(el('option', { value: d }));
  }
  function renderChips() {
    clear(chips);
    for (const d of values) {
      chips.append(el('span', { class: 'chip chip-static' }, d,
        el('button', { type: 'button', class: 'chip-x', text: '✕', title: 'إزالة', onClick: () => { values.delete(d); renderChips(); } })));
    }
  }
  function addFromInput() {
    const v = input.value.trim();
    if (v) { values.add(v); input.value = ''; renderChips(); }
  }
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addFromInput(); } });
  fillOptions();
  renderChips();

  return {
    element: el('div', {}, chips, el('div', { class: 'field-row' }, input, optionsList, el('button', { type: 'button', class: 'btn btn-sm', text: 'إضافة', onClick: addFromInput })), el('span', { class: 'field-hint', text: 'أحياء الرياض معبَّأة مسبقًا — اكتب اسم أي حي آخر' })),
    setCity(city) { currentCity = city; fillOptions(); },
    getValues: () => [...values],
  };
}

function openTourForm(ctx, existing) {
  const isEdit = !!existing;
  const draft = existing || repo.tours.defaults();

  const dateInput = el('input', { class: 'input', type: 'date', value: draft.date || '' });
  const citySelect = selectEl({ options: ctx.lists.cities.map((c) => ({ value: c, label: c })), value: draft.city });
  const districts = districtsField(ctx.lists, citySelect.value, draft.districts);
  citySelect.addEventListener('change', () => districts.setCity(citySelect.value));
  const notesInput = el('textarea', { class: 'input', rows: 2, value: draft.notes || '' });
  const errorsBox = el('div', { class: 'form-errors', hidden: true });

  const saveBtn = el('button', { type: 'button', class: 'btn btn-primary', text: isEdit ? 'حفظ التعديلات' : 'إنشاء الجولة' });
  saveBtn.addEventListener('click', async () => {
    errorsBox.hidden = true;
    if (!dateInput.value) {
      clear(errorsBox); errorsBox.append('التاريخ مطلوب'); errorsBox.hidden = false; return;
    }
    saveBtn.disabled = true;
    try {
      const data = { date: dateInput.value, city: citySelect.value, districts: districts.getValues(), notes: notesInput.value.trim() };
      if (isEdit) await repo.tours.update(existing.id, data); else await repo.tours.create(data);
      modal.close();
      toast(isEdit ? 'تم حفظ التعديلات' : 'أُنشئت الجولة', 'success');
      await refresh(ctx);
    } catch (err) {
      clear(errorsBox); errorsBox.append(err.message || 'حدث خطأ غير متوقع'); errorsBox.hidden = false;
    } finally {
      saveBtn.disabled = false;
    }
  });

  const deleteBtn = isEdit ? el('button', {
    type: 'button', class: 'btn btn-ghost btn-danger', text: 'حذف الجولة',
    onClick: async () => {
      const ok = await confirmDialog({ title: 'حذف الجولة', message: 'ستبقى عقارات هذه الجولة كما هي وتصبح بلا جولة مرتبطة. هل أنت متأكد؟', confirmText: 'حذف', danger: true });
      if (!ok) return;
      try {
        await repo.tours.remove(existing.id);
        modal.close();
        toast('تم حذف الجولة', 'success');
        await refresh(ctx);
      } catch (err) { toast(err.message || 'تعذر الحذف', 'error', 6000); }
    },
  }) : null;

  const modal = openModal({
    title: isEdit ? 'تعديل الجولة' : 'جولة جديدة',
    body: el('div', { class: 'form-grid one' },
      errorsBox,
      labeled('التاريخ', dateInput, { required: true }),
      labeled('المدينة', citySelect),
      labeled('الأحياء', districts.element),
      labeled('ملاحظات', notesInput)),
    footer: [
      deleteBtn,
      el('span', { class: 'spacer' }),
      el('button', { type: 'button', class: 'btn btn-ghost', text: 'إلغاء', onClick: () => modal.close() }),
      saveBtn,
    ],
  });
}
