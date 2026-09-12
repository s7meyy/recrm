// نموذج الالتقاط الميداني: صورة أو أكثر للعقار + صورة اللوحة + الموقع + حقول اختيارية،
// يعمل دون اتصال (كل شيء يُحفظ محليًا فورًا بحالة "بانتظار المعالجة"). لا حقول عقار أخرى هنا
// (النوع/المدينة/الحي...) — تلك تُملأ في شاشة الاعتماد (tour-approve.js).
//
// مصادر الموقع بالترتيب: GPS لحظة الالتقاط (عند التقاط مباشر بالكاميرا) ← EXIF من الصورة
// (عند رفع صور قديمة من المعرض؛ نقرأه هنا قبل الضغط لأن الضغط يزيله) ← لصق رابط يدويًا.
// استنتاج الجولة: إن اختلف تاريخ EXIF عن اليوم ولم تُحدَّد جولة، نقترح جولة مطابقة أو إنشاء واحدة.

import { repo } from '../data/repository.js';
import { storeImage } from '../data/images.js';
import { readImageMeta } from '../util/exif.js';
import { parseLocation, isShortMapLink, locationToText, mapsLink } from '../util/location.js';
import { el, clear, labeled, openModal, toast, badge } from '../util/dom.js';

function isoDateOnly(input) {
  const d = input ? new Date(input) : new Date();
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function tourLabel(tour) {
  const parts = [tour.date, ...(tour.districts?.length ? [tour.districts.join('، ')] : [])];
  return parts.filter(Boolean).join(' · ') || 'بلا تاريخ';
}

function tryGeolocation() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) { resolve(null); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 6000, maximumAge: 30000 },
    );
  });
}

function fileTile(file, onRemove) {
  const url = URL.createObjectURL(file);
  const tile = el('div', { class: 'img-tile new' },
    el('img', { src: url, alt: '' }),
    el('button', { type: 'button', class: 'img-remove', text: '✕', title: 'إزالة', onClick: onRemove }));
  tile.dataset.url = url;
  return tile;
}

/**
 * يفتح نموذج التقاط عقار واحد.
 * @param {{ tour?: object|null, onSaved?: () => void }} opts
 *   tour: سجل الجولة إن بدأ الالتقاط من داخلها (تُثبَّت tourId)؛ null = التقاط عام يُستنتج له الجولة.
 */
export function openCaptureForm({ tour = null, onSaved = null } = {}) {
  const state = {
    photoFiles: [], signboardFile: null,
    locationSource: null, // 'gps' | 'exif' | null — لتفضيل GPS على EXIF عند التعارض
    userEditedLocation: false,
    selectedTourId: tour?.id || null,
    inferredDate: null,
    previewUrls: [],
  };

  /* ===== سياق الجولة / الاستنتاج ===== */
  const tourBox = el('div', { class: 'inline-box' });
  const renderTourBox = () => {
    clear(tourBox);
    if (tour) {
      tourBox.append(el('span', { class: 'field-hint' }, `ضمن جولة: ${tourLabel(tour)}`));
      return;
    }
    if (state.selectedTourId) {
      tourBox.append(
        badge('مرتبط بجولة', 'badge-ok'),
        el('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: 'إلغاء الربط', onClick: () => { state.selectedTourId = null; renderTourBox(); } }));
      return;
    }
    tourBox.append(el('span', { class: 'field-hint', text: 'بلا جولة محدَّدة بعد — سيُقترح ربط تلقائي إن كانت الصور قديمة' }));
  };
  renderTourBox();

  async function maybeSuggestTour(takenAtIso) {
    if (tour || state.selectedTourId || !takenAtIso) return; // مثبَّتة أصلًا أو لا تاريخ صورة
    const takenDate = isoDateOnly(takenAtIso);
    const today = isoDateOnly();
    if (!takenDate || takenDate === today || takenDate === state.inferredDate) return;
    state.inferredDate = takenDate;
    const matches = await repo.tours.where('date', takenDate);
    clear(tourBox);
    const dismiss = () => renderTourBox();
    if (matches.length) {
      const select = matches.length > 1
        ? el('select', { class: 'input' }, matches.map((t) => el('option', { value: t.id, text: tourLabel(t) })))
        : null;
      tourBox.append(
        el('div', { class: 'suggest-box' },
          el('div', { text: `صور هذا الالتقاط بتاريخ ${takenDate} — هل هي من جولة مسجَّلة بهذا التاريخ؟` }),
          select,
          el('div', { class: 'head-actions', style: { marginTop: '8px' } },
            el('button', {
              type: 'button', class: 'btn btn-primary btn-sm', text: 'ربط بهذه الجولة',
              onClick: () => { state.selectedTourId = select ? select.value : matches[0].id; renderTourBox(); },
            }),
            el('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: 'تجاهل', onClick: dismiss }))));
    } else {
      tourBox.append(
        el('div', { class: 'suggest-box' },
          el('div', { text: `صور هذا الالتقاط بتاريخ ${takenDate} — لا توجد جولة مسجَّلة بهذا التاريخ.` }),
          el('div', { class: 'head-actions', style: { marginTop: '8px' } },
            el('button', {
              type: 'button', class: 'btn btn-primary btn-sm', text: 'إنشاء جولة بهذا التاريخ',
              onClick: async () => {
                try {
                  const t = await repo.tours.create({ date: takenDate });
                  state.selectedTourId = t.id;
                  toast('أُنشئت جولة جديدة — أكمل تاريخها وأحياءها لاحقًا من قائمة الجولات', 'success', 5000);
                  renderTourBox();
                } catch (err) { toast(err.message || 'تعذر إنشاء الجولة', 'error'); }
              },
            }),
            el('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: 'تجاهل', onClick: dismiss }))));
    }
  }

  /* ===== الموقع ===== */
  const locationInput = el('input', {
    class: 'input', type: 'text', dir: 'ltr',
    placeholder: 'يُملأ تلقائيًا من GPS أو الصورة إن أمكن — أو الصق رابط/إحداثيات',
  });
  const locationHint = el('span', { class: 'field-hint', text: 'اختياري الآن — يمكن إكماله في شاشة الاعتماد' });
  locationInput.addEventListener('input', () => {
    state.userEditedLocation = true;
    const text = locationInput.value.trim();
    clear(locationHint);
    locationHint.className = 'field-hint';
    if (!text) { locationHint.textContent = 'اختياري الآن — يمكن إكماله في شاشة الاعتماد'; return; }
    const loc = parseLocation(text);
    if (loc) {
      locationHint.classList.add('ok');
      locationHint.append('تمت قراءة الإحداثيات — ', el('a', { href: mapsLink(loc), target: '_blank', rel: 'noopener', text: 'فتح في الخرائط' }));
    } else if (isShortMapLink(text)) {
      locationHint.classList.add('error');
      locationHint.textContent = 'الروابط المختصرة لا تحمل الإحداثيات؛ الصق الرابط الكامل أو الإحداثيات';
    } else {
      locationHint.classList.add('error');
      locationHint.textContent = 'تعذر قراءة الموقع من هذا النص';
    }
  });

  function autoFillLocation(loc, source) {
    if (!loc || state.userEditedLocation) return;
    const rank = { gps: 2, exif: 1 };
    if (state.locationSource && rank[source] < rank[state.locationSource]) return;
    state.locationSource = source;
    locationInput.value = locationToText(loc);
    locationInput.dispatchEvent(new Event('input'));
    state.userEditedLocation = false; // إعادة الضبط بعد الحدث الاصطناعي — التعبئة تلقائية لا يدوية
  }

  async function handleNewFiles(files, { live }) {
    for (const file of files) {
      if (live) {
        tryGeolocation().then((loc) => autoFillLocation(loc, 'gps'));
      } else {
        readImageMeta(file).then((meta) => {
          if (meta.lat != null) autoFillLocation({ lat: meta.lat, lng: meta.lng }, 'exif');
          if (meta.takenAt) maybeSuggestTour(meta.takenAt);
        });
      }
    }
  }

  /* ===== صور العقار ===== */
  const photosBox = el('div', { class: 'images-box' });
  const renderPhotos = () => {
    clear(photosBox);
    for (const url of state.previewUrls) URL.revokeObjectURL(url);
    state.previewUrls = [];
    state.photoFiles.forEach((file, index) => {
      const tile = fileTile(file, () => { state.photoFiles.splice(index, 1); renderPhotos(); });
      state.previewUrls.push(tile.dataset.url);
      photosBox.append(tile);
    });
    const cameraInput = el('input', {
      type: 'file', accept: 'image/*', capture: 'environment', class: 'visually-hidden',
      onChange: (e) => { const files = [...e.target.files]; state.photoFiles.push(...files); handleNewFiles(files, { live: true }); e.target.value = ''; renderPhotos(); },
    });
    const galleryInput = el('input', {
      type: 'file', accept: 'image/*', multiple: true, class: 'visually-hidden',
      onChange: (e) => { const files = [...e.target.files]; state.photoFiles.push(...files); handleNewFiles(files, { live: false }); e.target.value = ''; renderPhotos(); },
    });
    photosBox.append(
      el('label', { class: 'img-add' }, '📷 كاميرا', cameraInput),
      el('label', { class: 'img-add' }, '🖼️ من المعرض', galleryInput));
  };

  /* ===== صورة اللوحة ===== */
  const signboardBox = el('div', { class: 'images-box' });
  const renderSignboard = () => {
    clear(signboardBox);
    if (state.signboardFile) {
      signboardBox.append(fileTile(state.signboardFile, () => { state.signboardFile = null; renderSignboard(); }));
      return;
    }
    const cameraInput = el('input', {
      type: 'file', accept: 'image/*', capture: 'environment', class: 'visually-hidden',
      onChange: (e) => { const f = e.target.files[0]; if (f) { state.signboardFile = f; handleNewFiles([f], { live: true }); } e.target.value = ''; renderSignboard(); },
    });
    const galleryInput = el('input', {
      type: 'file', accept: 'image/*', class: 'visually-hidden',
      onChange: (e) => { const f = e.target.files[0]; if (f) { state.signboardFile = f; handleNewFiles([f], { live: false }); } e.target.value = ''; renderSignboard(); },
    });
    signboardBox.append(
      el('label', { class: 'img-add' }, '📷 كاميرا', cameraInput),
      el('label', { class: 'img-add' }, '🖼️ من المعرض', galleryInput));
  };
  renderPhotos();
  renderSignboard();

  /* ===== حقول اختيارية ===== */
  const phoneInput = el('input', { class: 'input', type: 'tel', dir: 'ltr', placeholder: 'جوال صاحب العقار (إن وُجد على اللوحة)' });
  const nameInput = el('input', { class: 'input', type: 'text', placeholder: 'اسم صاحب العقار (إن وُجد)' });
  const notesInput = el('textarea', { class: 'input', rows: 2, placeholder: 'ملاحظات ميدانية سريعة' });

  const errorsBox = el('div', { class: 'form-errors', hidden: true });

  const saveBtn = el('button', { type: 'button', class: 'btn btn-primary', text: 'حفظ الالتقاط' });
  saveBtn.addEventListener('click', async () => {
    errorsBox.hidden = true;
    if (!state.photoFiles.length && !state.signboardFile) {
      clear(errorsBox);
      errorsBox.append('أضف صورة واحدة على الأقل (للعقار أو للوحة).');
      errorsBox.hidden = false;
      return;
    }
    const locText = locationInput.value.trim();
    const location = locText ? parseLocation(locText) : null;
    if (locText && !location) {
      clear(errorsBox);
      errorsBox.append('تعذر قراءة الموقع المُدخل — صحّحه أو أفرغ الحقل ليُكمَل لاحقًا.');
      errorsBox.hidden = false;
      return;
    }

    saveBtn.disabled = true;
    try {
      const rec = await repo.properties.create({
        source: 'tour',
        tourId: state.selectedTourId,
        captureStatus: 'captured',
        location,
        captureContact: { name: nameInput.value, phone: phoneInput.value, note: notesInput.value },
      });
      const imageIds = [];
      for (const file of state.photoFiles) {
        try { imageIds.push((await storeImage(file, { entity: 'property', entityId: rec.id })).id); } catch (err) { toast(`تعذر حفظ صورة: ${err.message}`, 'error', 6000); }
      }
      let signboardImageId = null;
      if (state.signboardFile) {
        try { signboardImageId = (await storeImage(state.signboardFile, { entity: 'property', entityId: rec.id })).id; imageIds.push(signboardImageId); } catch (err) { toast(`تعذر حفظ صورة اللوحة: ${err.message}`, 'error', 6000); }
      }
      await repo.properties.update(rec.id, { images: imageIds, signboardImageId });
      modal.close();
      toast('تم حفظ الالتقاط محليًا — بانتظار المعالجة', 'success');
      onSaved?.();
    } catch (err) {
      clear(errorsBox);
      errorsBox.append(err.message || 'حدث خطأ غير متوقع');
      errorsBox.hidden = false;
    } finally {
      saveBtn.disabled = false;
    }
  });

  const modal = openModal({
    title: 'التقاط عقار',
    size: 'wide',
    body: el('div', {},
      errorsBox,
      tourBox,
      el('div', { class: 'form-section' },
        el('div', { class: 'form-grid one' },
          labeled('صور العقار', photosBox),
          labeled('صورة اللوحة', signboardBox))),
      el('div', { class: 'form-section' },
        el('div', { class: 'form-grid' },
          labeled('الموقع', el('div', {}, locationInput, locationHint)),
          labeled('جوال صاحب العقار', phoneInput),
          labeled('اسم صاحب العقار', nameInput),
          labeled('ملاحظات', notesInput)))),
    onClose: () => { for (const url of state.previewUrls) URL.revokeObjectURL(url); },
    footer: [
      el('button', { type: 'button', class: 'btn btn-ghost', text: 'إلغاء', onClick: () => modal.close() }),
      saveBtn,
    ],
  });
}
