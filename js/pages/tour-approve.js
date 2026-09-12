// طابور "بانتظار الاعتماد" وشاشة المراجعة: تعديل الحقول (بنفس منطق نموذج العقار في properties.js
// لكن نسخة أخف مخصَّصة لهذا السياق)، كشف التكرار (جوال أو ضمن ٣٠ مترًا لعقار بنفس النوع)،
// وربط/إنشاء العميل عند الاعتماد. الاعتماد يشترط نوع العقار ومدينته (كما في نموذج الإضافة اليدوي)
// ويُصفِّر captureContact بعد استهلاكه. "حفظ كمسودة" يحفظ التعديلات دون اعتماد.

import { repo } from '../data/repository.js';
import { ENUMS, TYPE_FIELD_GROUPS } from '../data/schema.js';
import { getLists, addPropertyType, addPropertyStatus, addCity, addDistrict, typeGroup, typeLabel } from '../data/settings.js';
import { getImageUrl, deleteImages } from '../data/images.js';
import {
  el, clear, labeled, fieldGroup, selectEl, checkbox, badge, openModal, promptDialog, confirmDialog, toast, emptyState, debounce,
} from '../util/dom.js';
import { formatPhone } from '../util/phone.js';
import { formatDate } from '../util/format.js';
import { parseLocation, isShortMapLink, locationToText, mapsLink } from '../util/location.js';

/* ===== الطابور ===== */

export async function renderQueue(container, { onChanged = null } = {}) {
  clear(container);
  const [properties, clients, tours, lists] = await Promise.all([
    repo.properties.list(), repo.clients.list(), repo.tours.list(), getLists(),
  ]);
  const pending = properties.filter((p) => p.captureStatus !== 'approved').sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
  if (!pending.length) {
    container.append(emptyState('لا عقارات بانتظار الاعتماد الآن.'));
    return;
  }
  const clientMap = new Map(clients.map((c) => [c.id, c]));
  const tourMap = new Map(tours.map((t) => [t.id, t]));
  const grid = el('div', { class: 'grid' });
  for (const p of pending) grid.append(renderQueueCard(p, { clientMap, tourMap, lists, onChanged }));
  container.append(grid);
}

function renderQueueCard(p, ctx) {
  const imgBox = el('div', { class: 'card-img' });
  const imgId = p.signboardImageId || p.images?.[0];
  if (imgId) {
    const img = el('img', { alt: '', loading: 'lazy' });
    imgBox.append(img);
    getImageUrl(imgId, { thumb: true }).then((url) => { if (url) img.src = url; });
  } else {
    imgBox.append(el('span', { class: 'card-noimg', text: '📷' }));
  }
  const tour = ctx.tourMap.get(p.tourId);
  const contact = p.captureContact;
  const title = contact?.name || (contact?.phone ? formatPhone(contact.phone) : null) || (p.type ? typeLabel(ctx.lists, p.type) : 'بلا بيانات');
  return el('article', {
    class: 'card',
    onClick: () => openApprovalForm(p, { lists: ctx.lists, onDone: () => ctx.onChanged?.() }),
  },
    imgBox,
    el('div', { class: 'card-body' },
      el('div', { class: 'card-top' },
        el('span', { class: 'card-type', text: title }),
        badge(p.captureStatus === 'extracted' ? 'بانتظار الاعتماد' : 'بانتظار المعالجة', 'badge-warn')),
      el('div', { class: 'card-place' }, tour ? `جولة ${tour.date}` : 'بلا جولة مرتبطة'),
      contact?.phone && contact?.name ? el('div', { class: 'muted small', text: formatPhone(contact.phone) }) : null,
      el('div', { class: 'muted small', text: `أُلتُقط ${formatDate(p.createdAt)}` })));
}

/* ===== حقول بحسب النوع (نسخة محلية مطابقة لِـ properties.js) ===== */

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

function duplicateLine(match, lists) {
  const p = match.property;
  const desc = [typeLabel(lists, p.type), p.district, p.city].filter(Boolean).join(' · ') || 'عقار بلا وصف';
  const reason = match.reason === 'phone' ? 'نفس رقم جوال المالك' : `على بُعد ${match.distance} م تقريبًا ونفس النوع`;
  return { desc, reason };
}

/* ===== شاشة المراجعة والاعتماد ===== */

export async function openApprovalForm(property, { lists = null, onDone = null } = {}) {
  const ctx = { lists: lists || await getLists() };
  const draft = JSON.parse(JSON.stringify(property));
  draft.typeFields = draft.typeFields || {};
  const contact = property.captureContact || { name: '', phone: '', note: '' };
  const state = { removedImages: new Set() };

  const errorsBox = el('div', { class: 'form-errors', hidden: true });
  const showErrors = (errors) => { clear(errorsBox); errorsBox.append(el('ul', {}, errors.map((e) => el('li', { text: e })))); errorsBox.hidden = false; };

  /* الصور */
  const imagesBox = el('div', { class: 'images-box' });
  const renderImages = () => {
    clear(imagesBox);
    for (const id of draft.images || []) {
      const removed = state.removedImages.has(id);
      const isSignboard = id === draft.signboardImageId;
      const img = el('img', { alt: '' });
      getImageUrl(id, { thumb: true }).then((url) => { if (url) img.src = url; });
      imagesBox.append(el('div', { class: `img-tile${removed ? ' removed' : ''}` },
        img,
        isSignboard ? badge('اللوحة', 'badge-accent') : null,
        el('button', {
          type: 'button', class: 'img-remove', text: removed ? '↺' : '✕', title: removed ? 'تراجع عن الحذف' : 'حذف الصورة',
          onClick: () => { if (removed) state.removedImages.delete(id); else state.removedImages.add(id); renderImages(); },
        })));
    }
  };
  renderImages();

  /* المدينة والحي */
  const districtList = el('datalist', { id: 'approve-district-options' });
  const districtInput = el('input', { class: 'input', type: 'text', list: 'approve-district-options', value: draft.district || '', placeholder: 'اكتب أو اختر' });
  const fillDistricts = () => { clear(districtList); for (const d of ctx.lists.districtsByCity[citySelect.value] || []) districtList.append(el('option', { value: d })); };
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
    onChange: () => { renderTypeFields(); checkDuplicates(); },
  });
  const addTypeBtn = el('button', {
    type: 'button', class: 'btn btn-sm', text: '+', title: 'إضافة نوع',
    onClick: async () => {
      const label = await promptDialog({ title: 'نوع عقار جديد', label: 'اسم النوع' });
      if (!label) return;
      const item = await addPropertyType({ label, group: 'built' });
      ctx.lists = await getLists();
      if (![...typeSelect.options].some((o) => o.value === item.key)) typeSelect.append(el('option', { value: item.key, text: item.label }));
      typeSelect.value = item.key;
      renderTypeFields();
    },
  });

  /* الغرض */
  const purposesBox = el('div', { class: 'check-group' }, ENUMS.purposes.map((p) => checkbox(p.label, { name: 'purpose', value: p.key, checked: (draft.purposes || []).includes(p.key) })));

  /* المساحة والسعر */
  const areaInput = el('input', { class: 'input', type: 'number', min: '0', step: 'any', value: draft.area ?? '' });
  const priceInput = el('input', { class: 'input', type: 'number', min: '0', step: 'any', value: draft.price ?? '' });

  /* الموقع */
  const locationHint = el('span', { class: 'field-hint' });
  const locationInput = el('input', { class: 'input', type: 'text', dir: 'ltr', value: locationToText(draft.location), placeholder: 'إحداثيات أو رابط خرائط جوجل كامل' });
  const updateLocationHint = () => {
    const text = locationInput.value.trim();
    clear(locationHint);
    locationHint.className = 'field-hint';
    if (!text) { locationHint.textContent = 'اختياري'; return; }
    const loc = parseLocation(text);
    if (loc) { locationHint.classList.add('ok'); locationHint.append('تمت القراءة — ', el('a', { href: mapsLink(loc), target: '_blank', rel: 'noopener', text: 'فتح في الخرائط' })); }
    else if (isShortMapLink(text)) { locationHint.classList.add('error'); locationHint.textContent = 'رابط مختصر لا يحمل الإحداثيات'; }
    else { locationHint.classList.add('error'); locationHint.textContent = 'تعذر قراءة الموقع'; }
  };
  locationInput.addEventListener('input', debounce(() => { updateLocationHint(); checkDuplicates(); }, 250));
  updateLocationHint();

  /* الحالة */
  const statusSelect = selectEl({ options: ctx.lists.propertyStatuses.map((s) => ({ value: s.key, label: s.label })), value: draft.status });
  const addStatusBtn = el('button', {
    type: 'button', class: 'btn btn-sm', text: '+', title: 'إضافة حالة',
    onClick: async () => {
      const name = await promptDialog({ title: 'حالة جديدة', label: 'اسم الحالة' });
      if (!name) return;
      const item = await addPropertyStatus(name);
      ctx.lists = await getLists();
      if (![...statusSelect.options].some((o) => o.value === item.key)) statusSelect.append(el('option', { value: item.key, text: item.label }));
      statusSelect.value = item.key;
    },
  });

  /* جهة الاتصال / المالك */
  const contactNameInput = el('input', { class: 'input', type: 'text', value: contact.name || '', placeholder: 'اسم صاحب العقار' });
  const contactPhoneInput = el('input', { class: 'input', type: 'tel', dir: 'ltr', value: contact.phone || '', placeholder: 'جوال صاحب العقار' });
  const contactNoteInput = el('input', { class: 'input', type: 'text', value: contact.note || '', placeholder: 'ملاحظة ميدانية' });
  contactPhoneInput.addEventListener('input', debounce(checkDuplicates, 300));
  const ownerHint = el('div', { class: 'field-hint' }, draft.ownerId ? 'مرتبط بعميل موجود مسبقًا في النظام.' : 'سيُبحث عن عميل بهذا الجوال عند الاعتماد، وإلا يُنشأ عميل جديد.');

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
  renderTypeFields();

  /* الملاحظات */
  const notesInput = el('textarea', { class: 'input', rows: 2, value: draft.notes || '' });

  /* كشف التكرار */
  const duplicatesBox = el('div', { hidden: true });
  let dismissedDuplicates = false;
  async function checkDuplicates() {
    if (dismissedDuplicates) return;
    const location = parseLocation(locationInput.value);
    const matches = await repo.properties.findDuplicates({
      phone: contactPhoneInput.value, location, type: typeSelect.value, excludeId: property.id,
    });
    clear(duplicatesBox);
    duplicatesBox.hidden = !matches.length;
    if (!matches.length) return;
    const lines = matches.map((m) => {
      const { desc, reason } = duplicateLine(m, ctx.lists);
      return el('div', { class: 'field-row', style: { marginTop: '6px' } },
        el('span', {}, `${desc} — ${reason}`),
        el('button', {
          type: 'button', class: 'btn btn-sm btn-primary', text: 'دمج مع هذا العقار',
          onClick: () => mergeInto(m.property),
        }));
    });
    duplicatesBox.append(el('div', { class: 'suggest-box' },
      el('strong', { text: 'قد يكون مكررًا:' }),
      ...lines,
      el('div', { style: { marginTop: '8px' } },
        el('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: 'إبقاء منفصلًا', onClick: () => { dismissedDuplicates = true; duplicatesBox.hidden = true; } }))));
  }
  async function mergeInto(target) {
    const ok = await confirmDialog({
      title: 'دمج الالتقاط',
      message: `ستُنقَل صور هذا الالتقاط إلى العقار الموجود (${duplicateLine({ property: target }, ctx.lists).desc}) ويُحذف هذا الالتقاط. لا يمكن التراجع بعد الدمج. متابعة؟`,
      confirmText: 'دمج', danger: true,
    });
    if (!ok) return;
    try {
      const keepImages = (draft.images || []).filter((id) => !state.removedImages.has(id));
      for (const id of keepImages) await repo.images.update(id, { entityId: target.id });
      const mergedImages = [...new Set([...(target.images || []), ...keepImages])];
      await repo.properties.update(target.id, { images: mergedImages });
      if (state.removedImages.size) await deleteImages([...state.removedImages]);
      await repo.properties.remove(property.id);
      modal.close();
      toast('تم الدمج مع العقار الموجود', 'success');
      onDone?.();
    } catch (err) {
      toast(err.message || 'تعذر الدمج', 'error', 6000);
    }
  }

  /* التجميع */
  function collectFields() {
    const group = typeGroup(ctx.lists, typeSelect.value);
    const typeFields = {};
    for (const def of TYPE_FIELD_GROUPS[group] || []) {
      const v = draft.typeFields[def.key];
      if (v != null && v !== '') typeFields[def.key] = def.input === 'number' ? Number(v) : v;
    }
    return {
      city: citySelect.value.trim(),
      district: districtInput.value.trim(),
      type: typeSelect.value,
      purposes: [...purposesBox.querySelectorAll('input:checked')].map((i) => i.value),
      area: areaInput.value === '' ? null : Number(areaInput.value),
      price: priceInput.value === '' ? null : Number(priceInput.value),
      location: parseLocation(locationInput.value),
      status: statusSelect.value,
      notes: notesInput.value.trim(),
      typeFields,
      images: (draft.images || []).filter((id) => !state.removedImages.has(id)),
    };
  }

  async function saveDraft() {
    errorsBox.hidden = true;
    saveDraftBtn.disabled = true;
    approveBtn.disabled = true;
    try {
      const data = collectFields();
      data.captureContact = { name: contactNameInput.value, phone: contactPhoneInput.value, note: contactNoteInput.value };
      if (state.removedImages.size) await deleteImages([...state.removedImages]);
      await repo.properties.update(property.id, data);
      if (data.district && !(ctx.lists.districtsByCity[data.city] || []).includes(data.district)) await addDistrict(data.city, data.district);
      modal.close();
      toast('تم حفظ التعديلات — لا يزال بانتظار الاعتماد', 'success');
      onDone?.();
    } catch (err) {
      showErrors(err.errors || [err.message || 'حدث خطأ غير متوقع']);
    } finally {
      saveDraftBtn.disabled = false;
      approveBtn.disabled = false;
    }
  }

  async function approve() {
    errorsBox.hidden = true;
    const data = collectFields();
    const errors = [];
    if (!data.type) errors.push('نوع العقار مطلوب قبل الاعتماد');
    if (!data.city) errors.push('المدينة مطلوبة قبل الاعتماد');
    const locText = locationInput.value.trim();
    if (locText && !data.location) errors.push('تعذر قراءة الموقع — صحّحه أو أفرغه');
    if (errors.length) { showErrors(errors); return; }

    saveDraftBtn.disabled = true;
    approveBtn.disabled = true;
    try {
      let ownerId = draft.ownerId || null;
      const phone = contactPhoneInput.value.trim();
      const name = contactNameInput.value.trim();
      if (!ownerId && (phone || name)) {
        const found = phone ? await repo.clients.findByPhone(phone) : null;
        if (found) {
          ownerId = found.id;
          toast(`رُبط العقار بعميل موجود: ${found.name || formatPhone(found.phone)}`);
        } else {
          const owner = await repo.clients.create({ name, phone, roles: ['owner'] });
          ownerId = owner.id;
        }
      }
      if (state.removedImages.size) await deleteImages([...state.removedImages]);
      await repo.properties.update(property.id, { ...data, ownerId, captureStatus: 'approved', captureContact: null });
      if (data.district && !(ctx.lists.districtsByCity[data.city] || []).includes(data.district)) await addDistrict(data.city, data.district);
      modal.close();
      toast('تم الاعتماد — العقار الآن في المخزون', 'success');
      onDone?.();
    } catch (err) {
      showErrors(err.errors || [err.message || 'حدث خطأ غير متوقع']);
    } finally {
      saveDraftBtn.disabled = false;
      approveBtn.disabled = false;
    }
  }

  const saveDraftBtn = el('button', { type: 'button', class: 'btn btn-ghost', text: 'حفظ كمسودة', onClick: saveDraft });
  const approveBtn = el('button', { type: 'button', class: 'btn btn-primary', text: 'اعتماد ✓', onClick: approve });

  const deleteBtn = el('button', {
    type: 'button', class: 'btn btn-ghost btn-danger', text: 'حذف الالتقاط',
    onClick: async () => {
      const ok = await confirmDialog({ title: 'حذف الالتقاط', message: 'سيُحذف هذا الالتقاط وصوره نهائيًا. هل أنت متأكد؟', confirmText: 'حذف', danger: true });
      if (!ok) return;
      try {
        await repo.properties.remove(property.id);
        modal.close();
        toast('تم حذف الالتقاط', 'success');
        onDone?.();
      } catch (err) { toast(err.message || 'تعذر الحذف', 'error', 6000); }
    },
  });

  const modal = openModal({
    title: 'مراجعة الالتقاط واعتماده',
    size: 'wide',
    body: el('div', {},
      errorsBox,
      fieldGroup('الصور', imagesBox),
      duplicatesBox,
      el('div', { class: 'form-section' },
        el('h3', { class: 'form-section-title', text: 'جهة الاتصال المُلتقطة' }),
        el('div', { class: 'form-grid' },
          labeled('الاسم', contactNameInput),
          labeled('الجوال', contactPhoneInput, { hint: 'يُستعمل لربط/إنشاء العميل عند الاعتماد ولكشف التكرار' }),
          labeled('ملاحظة', contactNoteInput)),
        ownerHint),
      el('div', { class: 'form-section' },
        el('div', { class: 'form-grid' },
          labeled('المدينة', el('div', { class: 'field-row' }, citySelect, addCityBtn), { required: true }),
          fieldGroup('الحي', el('div', {}, districtInput, districtList)),
          labeled('نوع العقار', el('div', { class: 'field-row' }, typeSelect, addTypeBtn), { required: true }),
          fieldGroup('الغرض', purposesBox),
          labeled('المساحة (م²)', areaInput),
          labeled('السعر (ريال)', priceInput, { hint: 'اتركه فارغًا إن كان غير معروف' }),
          el('label', { class: 'field field-full' }, el('span', { class: 'field-label', text: 'الموقع' }), locationInput, locationHint),
          labeled('الحالة', el('div', { class: 'field-row' }, statusSelect, addStatusBtn)))),
      typeBox,
      el('div', { class: 'form-section' }, labeled('ملاحظات', notesInput))),
    footer: [
      deleteBtn,
      el('span', { class: 'spacer' }),
      el('button', { type: 'button', class: 'btn btn-ghost', text: 'إغلاق', onClick: () => modal.close() }),
      saveDraftBtn,
      approveBtn,
    ],
  });

  checkDuplicates();
}
