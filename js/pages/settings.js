// صفحة الإعدادات: المستخدم، النسخ الاحتياطي، التخزين، القوائم القابلة للإضافة،
// الحقول المخصصة، تعريف "مكتمل البيانات"، والبيانات التجريبية.

import { repo, getCurrentUser } from '../data/repository.js';
import { ENUMS, COMPLETENESS_CANDIDATES, labelFor } from '../data/schema.js';
import {
  updateUserName, getLists, addPropertyType, removePropertyType, addPropertyStatus, removePropertyStatus,
  addClientTag, removeClientTag, addCity, addDistrict, removeDistrict,
  getCustomFields, addCustomField, removeCustomField, getCompleteness, setCompleteness, getBackupInfo,
  getMatchingSettings, setMatchingSettings, DEFAULT_MATCHING, getZones, addZone, updateZone, removeZone,
} from '../data/settings.js';
import { exportBackup, downloadBlob, markExported, readBackupFile, importBackup } from '../data/backup.js';
import { imagesSummary, formatBytes } from '../data/images.js';
import { seedExists, insertSeed, clearSeed } from '../data/seed.js';
import { el, clear, labeled, selectEl, checkbox, badge, confirmDialog, openModal, toast } from '../util/dom.js';
import { formatDateTime, relativeDays } from '../util/format.js';

const dataChanged = () => window.dispatchEvent(new CustomEvent('motabiq:data-changed'));

export async function render(container) {
  clear(container);
  container.append(el('div', { class: 'page-head' }, el('h1', { text: 'الإعدادات' })));
  const grid = el('div', { class: 'settings-grid' });
  container.append(grid);
  grid.append(
    panel('المستخدم الحالي', 'اسمك يُسجَّل على كل ما تنشئه أو تعدّله (تمهيدًا لتعدد المستخدمين لاحقًا).', userBody),
    panel('النسخ الاحتياطي', 'البيانات محفوظة في هذا المتصفح فقط. الملف الواحد يحوي كل شيء بما فيه الصور والإعدادات.', backupBody),
    panel('التخزين والصور', 'ما تشغله البيانات على هذا الجهاز. لحذف صور بعينها افتح العقار واحذفها من نموذجه.', storageBody),
    panel('القوائم', 'أنواع العقار وحالاته وتصنيفات العملاء والمدن والأحياء. المدمج لا يُحذف؛ ما أضفته يُحذف ما لم يكن مستعملًا.', listsBody),
    panel('الحقول الإضافية', 'حقول تظهر في نموذج العقار لكل الأنواع أو لأنواع محددة.', customFieldsBody),
    panel('المطابقة', 'أوزان المعايير المرجّحة وحدود المرونة. المرونة في اتجاه واحد: الأرخص من الميزانية والأكبر من المساحة لا يُخصم منهما.', matchingBody),
    panel('نطاقات الأحياء', 'مجموعة أحياء بمسمّى واحد («شمال الدائري الشمالي») تُعرَّف مرة وتُستعمل في أي طلب. نطاقات الرياض الخمسة مسودّة تقريبية — راجعها وعدّلها.', zonesBody),
    panel('تعريف "مكتمل البيانات"', 'العقار يُعدّ مكتملًا عندما تتوفر فيه الحقول المحددة هنا.', completenessBody),
    panel('البيانات التجريبية', 'عملاء وعقارات للتجربة (مع سجل واحد لكل كيان من المراحل اللاحقة لاختبار طبقة البيانات)؛ تُدرج تلقائيًا عند أول تشغيل، ومسحها لا يمس بياناتك الحقيقية.', seedBody),
  );
}

function panel(title, desc, bodyFn) {
  const body = el('div');
  const node = el('section', { class: 'panel' }, el('h2', { text: title }), el('p', { class: 'panel-desc', text: desc }), body);
  const redraw = async () => {
    clear(body);
    try {
      body.append(await bodyFn(redraw));
    } catch (err) {
      body.append(el('div', { class: 'error-box', text: err.message || String(err) }));
    }
  };
  redraw();
  return node;
}

const errToast = (err) => toast(err?.message || 'حدث خطأ غير متوقع', 'error');

/* ===== المستخدم ===== */

async function userBody() {
  const user = getCurrentUser();
  const input = el('input', { class: 'input', type: 'text', value: user.name || '' });
  return el('div', { class: 'row' },
    input,
    el('button', {
      type: 'button', class: 'btn btn-primary', text: 'حفظ الاسم',
      onClick: async () => {
        try { await updateUserName(input.value); toast('تم حفظ الاسم', 'success'); } catch (err) { errToast(err); }
      },
    }),
    el('span', { class: 'muted small' }, `المعرّف: ${user.id}`));
}

/* ===== النسخ الاحتياطي ===== */

async function backupBody(redraw) {
  const info = await getBackupInfo();
  const counts = await repo.counts();
  const fileInput = el('input', {
    type: 'file', accept: '.json,application/json', class: 'visually-hidden',
    onChange: async (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      try {
        const { data, counts: fileCounts, exportedAt } = await readBackupFile(file);
        const summary = `عملاء: ${fileCounts.clients} · عقارات: ${fileCounts.properties} · صور: ${fileCounts.images}`;
        const ok = await confirmDialog({
          title: 'استيراد نسخة احتياطية',
          message: `النسخة من ${exportedAt ? formatDateTime(exportedAt) : 'تاريخ غير معروف'} (${summary}). سيُستبدل كل ما في هذا المتصفح بمحتواها. المتابعة؟`,
          confirmText: 'استبدال واستيراد', danger: true,
        });
        if (!ok) return;
        await importBackup(data);
        toast('تم الاستيراد؛ يُعاد التحميل…', 'success');
        setTimeout(() => location.reload(), 800);
      } catch (err) {
        errToast(err);
      }
    },
  });
  return el('div', {},
    el('dl', { class: 'kv' },
      el('dt', { text: 'آخر تصدير' }),
      el('dd', {}, info.lastExportAt ? `${formatDateTime(info.lastExportAt)} (${relativeDays(info.lastExportAt)})` : badge('لم يُصدَّر بعد', 'badge-warn')),
      el('dt', { text: 'السجلات' }),
      el('dd', { text: `عملاء: ${counts.clients} · عقارات: ${counts.properties} · صور: ${counts.images}` })),
    el('div', { class: 'row' },
      el('button', {
        type: 'button', class: 'btn btn-primary', text: 'تصدير نسخة احتياطية',
        onClick: async (e) => {
          const btn = e.currentTarget;
          btn.disabled = true;
          try {
            const { blob, filename } = await exportBackup();
            downloadBlob(blob, filename);
            await markExported();
            toast(`تم تصدير ${filename}`, 'success');
            dataChanged();
            redraw();
          } catch (err) {
            errToast(err);
          } finally {
            btn.disabled = false;
          }
        },
      }),
      el('button', { type: 'button', class: 'btn', text: 'استيراد من ملف…', onClick: () => fileInput.click() }),
      fileInput));
}

/* ===== التخزين ===== */

async function storageBody() {
  const summary = await imagesSummary();
  const rows = [
    el('dt', { text: 'الصور' }), el('dd', { text: `${summary.count} صورة — ${formatBytes(summary.bytes)}` }),
  ];
  if (navigator.storage?.estimate) {
    try {
      const est = await navigator.storage.estimate();
      rows.push(el('dt', { text: 'المستخدم من المتصفح' }), el('dd', { text: `${formatBytes(est.usage || 0)} من ${formatBytes(est.quota || 0)} متاحة` }));
    } catch (_) { /* غير مدعوم */ }
  }
  return el('dl', { class: 'kv' }, rows);
}

/* ===== القوائم ===== */

function chipList(items, { labelOf = (x) => x, removable = () => false, onRemove }) {
  return el('div', { class: 'chips' }, items.map((item) => el('span', { class: 'chip chip-static' },
    labelOf(item),
    removable(item) ? el('button', { type: 'button', class: 'chip-x', text: '✕', title: 'حذف', onClick: () => onRemove(item) }) : null)));
}

async function listsBody(redraw) {
  const lists = await getLists();
  const act = (fn) => async () => { try { await fn(); await redraw(); } catch (err) { errToast(err); } };

  /* أنواع العقار */
  const typeInput = el('input', { class: 'input', type: 'text', placeholder: 'نوع جديد: عمارة، استراحة…' });
  const typeGroupSel = selectEl({ options: ENUMS.typeFieldGroups.map((g) => ({ value: g.key, label: g.label })), value: 'built' });
  const typesBlock = el('div', { class: 'panel-block' },
    el('h3', { text: 'أنواع العقار' }),
    chipList(lists.propertyTypes, {
      labelOf: (t) => `${t.label} (${labelFor(ENUMS.typeFieldGroups, t.group).split(' ')[0]})`,
      removable: (t) => !t.builtin,
      onRemove: (t) => act(() => removePropertyType(t.key))(),
    }),
    el('div', { class: 'row', style: { marginTop: '8px' } },
      typeInput, typeGroupSel,
      el('button', { type: 'button', class: 'btn', text: 'إضافة', onClick: act(() => addPropertyType({ label: typeInput.value, group: typeGroupSel.value })) })));

  /* حالات العقار */
  const statusInput = el('input', { class: 'input', type: 'text', placeholder: 'حالة جديدة' });
  const statusesBlock = el('div', { class: 'panel-block' },
    el('h3', { text: 'حالات العقار' }),
    chipList(lists.propertyStatuses, { labelOf: (s) => s.label, removable: (s) => !s.builtin, onRemove: (s) => act(() => removePropertyStatus(s.key))() }),
    el('div', { class: 'row', style: { marginTop: '8px' } },
      statusInput,
      el('button', { type: 'button', class: 'btn', text: 'إضافة', onClick: act(() => addPropertyStatus(statusInput.value)) })));

  /* تصنيفات العملاء */
  const tagInput = el('input', { class: 'input', type: 'text', placeholder: 'تصنيف جديد: مستثمر، مطوّر…' });
  const tagsBlock = el('div', { class: 'panel-block' },
    el('h3', { text: 'تصنيفات العملاء' }),
    lists.clientTags.length
      ? chipList(lists.clientTags, { removable: () => true, onRemove: (t) => act(() => removeClientTag(t))() })
      : el('p', { class: 'muted small', text: 'لا تصنيفات بعد.' }),
    el('div', { class: 'row', style: { marginTop: '8px' } },
      tagInput,
      el('button', { type: 'button', class: 'btn', text: 'إضافة', onClick: act(() => addClientTag(tagInput.value)) })));

  /* المدن والأحياء */
  const districtsChips = el('div');
  const cityInput = el('input', { class: 'input', type: 'text', placeholder: 'مدينة جديدة' });
  const districtInput = el('input', { class: 'input', type: 'text', placeholder: 'حي جديد للمدينة المختارة' });
  const citySel = selectEl({ options: lists.cities.map((c) => ({ value: c, label: c })), value: lists.cities[0], onChange: () => drawDistricts() });
  const drawDistricts = () => {
    clear(districtsChips);
    const city = citySel.value;
    const extras = new Set(lists.extras.districts[city] || []);
    const items = lists.districtsByCity[city] || [];
    districtsChips.append(
      el('p', { class: 'muted small', text: `${items.length} حي في ${city}` }),
      items.length
        ? chipList(items, { removable: (d) => extras.has(d), onRemove: (d) => act(() => removeDistrict(city, d))() })
        : el('p', { class: 'muted small', text: 'لا أحياء بعد لهذه المدينة.' }));
  };
  drawDistricts();
  const citiesBlock = el('div', { class: 'panel-block' },
    el('h3', { text: 'المدن والأحياء' }),
    el('div', { class: 'row' },
      citySel,
      cityInput,
      el('button', { type: 'button', class: 'btn', text: 'إضافة مدينة', onClick: act(() => addCity(cityInput.value)) })),
    el('div', { style: { marginTop: '10px' } }, districtsChips),
    el('div', { class: 'row', style: { marginTop: '8px' } },
      districtInput,
      el('button', { type: 'button', class: 'btn', text: 'إضافة حي', onClick: act(() => addDistrict(citySel.value, districtInput.value)) })));

  return el('div', {}, typesBlock, statusesBlock, tagsBlock, citiesBlock);
}

/* ===== الحقول الإضافية ===== */

async function customFieldsBody(redraw) {
  const [fields, lists] = await Promise.all([getCustomFields(), getLists()]);
  const typeName = (key) => lists.propertyTypes.find((t) => t.key === key)?.label ?? key;
  const table = fields.length
    ? el('table', { class: 'cf-table' },
      el('thead', {}, el('tr', {}, ['الحقل', 'النوع', 'يظهر لـ', ''].map((t) => el('th', { text: t })))),
      el('tbody', {}, fields.map((f) => el('tr', {},
        el('td', { text: f.label }),
        el('td', { text: labelFor(ENUMS.customFieldInputs, f.input) }),
        el('td', { text: f.forTypes?.length ? f.forTypes.map(typeName).join('، ') : 'كل الأنواع' }),
        el('td', {}, el('button', {
          type: 'button', class: 'icon-btn', text: '✕', title: 'حذف الحقل',
          onClick: async () => {
            const ok = await confirmDialog({ title: 'حذف الحقل', message: `حذف حقل «${f.label}»؟ القيم المحفوظة في العقارات تبقى مخزنة لكنها لن تظهر.`, confirmText: 'حذف', danger: true });
            if (!ok) return;
            try { await removeCustomField(f.key); await redraw(); } catch (err) { errToast(err); }
          },
        }))))))
    : el('p', { class: 'muted small', text: 'لا حقول إضافية بعد.' });

  const labelInput = el('input', { class: 'input', type: 'text', placeholder: 'اسم الحقل، مثال: رقم الصك' });
  const inputSel = selectEl({ options: ENUMS.customFieldInputs.map((i) => ({ value: i.key, label: i.label })), value: 'text' });
  const typesBox = el('div', { class: 'check-group' }, lists.propertyTypes.map((t) => checkbox(t.label, { name: 'cf-type', value: t.key })));
  return el('div', {},
    table,
    el('div', { class: 'form-grid' },
      labeled('اسم الحقل', labelInput),
      labeled('نوع القيمة', inputSel),
      el('div', { class: 'field field-full' },
        el('span', { class: 'field-label', text: 'يظهر للأنواع (اتركها كلها فارغة ليظهر لكل الأنواع)' }), typesBox),
      el('div', { class: 'field-full' }, el('button', {
        type: 'button', class: 'btn', text: 'إضافة الحقل',
        onClick: async () => {
          try {
            await addCustomField({ label: labelInput.value, input: inputSel.value, forTypes: [...typesBox.querySelectorAll('input:checked')].map((i) => i.value) });
            await redraw();
          } catch (err) { errToast(err); }
        },
      }))));
}

/* ===== المطابقة (المرحلة ٣) ===== */

async function matchingBody(redraw) {
  const m = await getMatchingSettings();
  const numInput = (value, { step = '1', min = '0' } = {}) => el('input', { class: 'input', type: 'number', value, step, min });

  const wDistrict = numInput(m.weights.district);
  const wPrice = numInput(m.weights.price);
  const wArea = numInput(m.weights.area);
  const pPercent = numInput(m.price.percent);
  const pSale = numInput(m.price.minSale, { step: '10000' });
  const pRent = numInput(m.price.minRent, { step: '1000' });
  const pInvest = numInput(m.price.minInvestment, { step: '10000' });
  const aPercent = numInput(m.area.percent);
  const aMin = numInput(m.area.minSqm, { step: '5' });
  const minScore = numInput(m.minScore, { step: '5' });
  const ownBox = checkbox('لا تُعرض على العميل عقاراته هو', { checked: m.excludeOwnProperties });

  const num = (input, fallback) => (input.value === '' ? fallback : Number(input.value));
  return el('div', {},
    el('div', { class: 'panel-block' },
      el('h3', { text: 'أوزان المعايير المرجّحة' }),
      el('p', { class: 'muted small', text: 'النسبة تُحسب على المعايير المعروفة فقط؛ وأي قيمة غير معروفة (سعر أو مساحة أو حي) تُرفع من الحساب وتُوسَم.' }),
      el('div', { class: 'form-grid' },
        labeled('الحي', wDistrict), labeled('السعر', wPrice), labeled('المساحة', wArea))),
    el('div', { class: 'panel-block' },
      el('h3', { text: 'مرونة السعر' }),
      el('p', { class: 'muted small', text: 'المرونة = النسبة من سقف الميزانية، وإن قلّت عن الحدّ الأدنى بحسب الغرض رُفعت إليه. وكل طلب يقبل نسبة أو مبلغًا خاصًّا يتجاوز هذا.' }),
      el('div', { class: 'form-grid' },
        labeled('النسبة ٪', pPercent),
        labeled('الحدّ الأدنى — بيع (ريال)', pSale),
        labeled('الحدّ الأدنى — إيجار (ريال)', pRent),
        labeled('الحدّ الأدنى — استثمار (ريال)', pInvest))),
    el('div', { class: 'panel-block' },
      el('h3', { text: 'مرونة المساحة' }),
      el('div', { class: 'form-grid' },
        labeled('النسبة ٪', aPercent),
        labeled('الحدّ الأدنى (م²)', aMin))),
    el('div', { class: 'panel-block' },
      el('h3', { text: 'صفحة المطابقات' }),
      el('div', { class: 'form-grid' },
        labeled('الحدّ الابتدائي لشريط "أظهر ما نسبته ≥" ٪', minScore, { hint: 'قيمة ابتدائية فقط؛ الشريط في الصفحة يتغير وقت العمل' }),
        el('div', { class: 'field' }, el('span', { class: 'field-label', text: 'استبعاد تلقائي' }), ownBox))),
    el('div', { class: 'row', style: { marginTop: '14px' } },
      el('button', {
        type: 'button', class: 'btn btn-primary', text: 'حفظ إعدادات المطابقة',
        onClick: async () => {
          try {
            await setMatchingSettings({
              weights: {
                district: num(wDistrict, DEFAULT_MATCHING.weights.district),
                price: num(wPrice, DEFAULT_MATCHING.weights.price),
                area: num(wArea, DEFAULT_MATCHING.weights.area),
              },
              price: {
                percent: num(pPercent, DEFAULT_MATCHING.price.percent),
                minSale: num(pSale, DEFAULT_MATCHING.price.minSale),
                minRent: num(pRent, DEFAULT_MATCHING.price.minRent),
                minInvestment: num(pInvest, DEFAULT_MATCHING.price.minInvestment),
              },
              area: { percent: num(aPercent, DEFAULT_MATCHING.area.percent), minSqm: num(aMin, DEFAULT_MATCHING.area.minSqm) },
              minScore: num(minScore, DEFAULT_MATCHING.minScore),
              excludeOwnProperties: ownBox.querySelector('input').checked,
            });
            toast('حُفظت إعدادات المطابقة', 'success');
            await redraw();
          } catch (err) { errToast(err); }
        },
      }),
      el('button', {
        type: 'button', class: 'btn btn-ghost', text: 'إرجاع الافتراضي',
        onClick: async () => {
          const ok = await confirmDialog({ title: 'إرجاع الافتراضي', message: 'إرجاع كل إعدادات المطابقة إلى قيمها الافتراضية؟', confirmText: 'إرجاع' });
          if (!ok) return;
          try { await setMatchingSettings(DEFAULT_MATCHING); await redraw(); } catch (err) { errToast(err); }
        },
      })));
}

/* ===== نطاقات الأحياء (المرحلة ٣) ===== */

async function openZoneForm({ city, zone, districts, onSaved }) {
  const selected = new Set(zone ? zone.districts : []);
  const labelInput = el('input', { class: 'input', type: 'text', value: zone ? zone.label : '', placeholder: 'مثال: شمال الدائري الشمالي' });
  const countNode = el('span', { class: 'muted small' });
  const box = el('div', { class: 'check-group zone-picker' });
  const searchInput = el('input', { class: 'input', type: 'search', placeholder: 'تصفية الأحياء…' });

  const draw = () => {
    clear(box);
    const q = searchInput.value.trim();
    const items = q ? districts.filter((d) => d.includes(q)) : districts;
    for (const d of items) {
      box.append(checkbox(d, {
        value: d, checked: selected.has(d),
        onChange: (e) => { if (e.target.checked) selected.add(d); else selected.delete(d); countNode.textContent = `${selected.size} حي مختار`; },
      }));
    }
    if (!items.length) box.append(el('span', { class: 'muted small', text: 'لا حي يطابق التصفية.' }));
    countNode.textContent = `${selected.size} حي مختار`;
  };
  searchInput.addEventListener('input', draw);
  draw();

  const saveBtn = el('button', { type: 'button', class: 'btn btn-primary', text: zone ? 'حفظ النطاق' : 'إضافة النطاق' });
  saveBtn.addEventListener('click', async () => {
    saveBtn.disabled = true;
    try {
      if (zone) await updateZone(city, zone.key, { label: labelInput.value, districts: [...selected] });
      else await addZone(city, { label: labelInput.value, districts: [...selected] });
      modal.close();
      await onSaved();
    } catch (err) {
      errToast(err);
    } finally {
      saveBtn.disabled = false;
    }
  });

  const modal = openModal({
    title: zone ? `تعديل نطاق: ${zone.label}` : `نطاق جديد في ${city}`,
    size: 'wide',
    body: el('div', {},
      el('div', { class: 'form-grid' }, labeled('اسم النطاق', labelInput, { required: true }), labeled('تصفية', searchInput)),
      el('div', { style: { marginTop: '10px' } }, countNode, box)),
    footer: [
      el('button', { type: 'button', class: 'btn btn-ghost', text: 'إلغاء', onClick: () => modal.close() }),
      saveBtn,
    ],
  });
}

async function zonesBody(redraw) {
  const [zones, lists] = await Promise.all([getZones(), getLists()]);
  const citySel = selectEl({ options: lists.cities.map((c) => ({ value: c, label: c })), value: lists.cities[0], onChange: () => drawList() });
  const listBox = el('div');

  const drawList = () => {
    clear(listBox);
    const city = citySel.value;
    const cityZones = zones[city] || [];
    const districts = lists.districtsByCity[city] || [];
    if (!cityZones.length) {
      listBox.append(el('p', { class: 'muted small', text: 'لا نطاقات لهذه المدينة بعد.' }));
    }
    for (const zone of cityZones) {
      listBox.append(el('div', { class: 'zone-item' },
        el('div', {},
          el('span', { class: 'strong', text: zone.label }),
          el('span', { class: 'muted small', text: ` — ${zone.districts.length} حي` }),
          el('div', { class: 'muted small', text: zone.districts.slice(0, 8).join('، ') + (zone.districts.length > 8 ? ' …' : '') })),
        el('div', { class: 'row' },
          el('button', { type: 'button', class: 'btn btn-sm', text: 'تعديل', onClick: () => openZoneForm({ city, zone, districts, onSaved: redraw }) }),
          el('button', {
            type: 'button', class: 'icon-btn', text: '✕', title: 'حذف النطاق',
            onClick: async () => {
              const ok = await confirmDialog({ title: 'حذف النطاق', message: `حذف نطاق «${zone.label}»؟ الطلبات التي تستعمله تفقد أحياءه (أحياؤها المفردة تبقى).`, confirmText: 'حذف', danger: true });
              if (!ok) return;
              try { await removeZone(city, zone.key); await redraw(); } catch (err) { errToast(err); }
            },
          }))));
    }
    listBox.append(el('div', { class: 'row', style: { marginTop: '10px' } },
      el('button', {
        type: 'button', class: 'btn', text: '+ نطاق جديد',
        onClick: () => openZoneForm({ city, zone: null, districts, onSaved: redraw }),
      })));
  };
  drawList();
  return el('div', {}, el('div', { class: 'row' }, citySel), el('div', { style: { marginTop: '10px' } }, listBox));
}

/* ===== تعريف الاكتمال ===== */

async function completenessBody() {
  const current = new Set(await getCompleteness());
  const box = el('div', { class: 'check-group' }, COMPLETENESS_CANDIDATES.map((c) => checkbox(c.label, { name: 'complete', value: c.key, checked: current.has(c.key) })));
  return el('div', {},
    box,
    el('div', { style: { marginTop: '10px' } }, el('button', {
      type: 'button', class: 'btn btn-primary', text: 'حفظ التعريف',
      onClick: async () => {
        try {
          await setCompleteness([...box.querySelectorAll('input:checked')].map((i) => i.value));
          toast('تم حفظ تعريف الاكتمال', 'success');
        } catch (err) { errToast(err); }
      },
    })));
}

/* ===== البيانات التجريبية ===== */

async function seedBody(redraw) {
  const exists = await seedExists();
  return el('div', { class: 'row' },
    el('span', {}, exists ? badge('مُدرجة حاليًا', 'badge-accent') : badge('غير مُدرجة')),
    el('button', {
      type: 'button', class: 'btn', text: 'إدراج بيانات تجريبية', disabled: exists,
      onClick: async (e) => {
        e.currentTarget.disabled = true;
        try {
          const ids = await insertSeed();
          toast(`أُدرج ${ids.clients.length} عملاء و${ids.properties.length} عقارات`, 'success');
          dataChanged();
          await redraw();
        } catch (err) { errToast(err); await redraw(); }
      },
    }),
    el('button', {
      type: 'button', class: 'btn btn-ghost btn-danger', text: 'مسح البيانات التجريبية', disabled: !exists,
      onClick: async () => {
        const ok = await confirmDialog({ title: 'مسح البيانات التجريبية', message: 'ستُحذف السجلات التجريبية فقط (العملاء والعقارات وصورها وسجلات التجربة الأخرى). بياناتك الأخرى لا تُمس، والعميل التجريبي الذي ربطت به عقارًا حقيقيًا يبقى.', confirmText: 'مسح', danger: true });
        if (!ok) return;
        try {
          const removed = await clearSeed();
          const keptBits = [];
          if (removed.keptClients) keptBits.push(`${removed.keptClients} عميل لارتباطه بعقارات أضفتها`);
          if (removed.keptProperties) keptBits.push(`${removed.keptProperties} عقار لوجود صفقة مسجّلة عليه`);
          const kept = keptBits.length ? ` — بقي ${keptBits.join(' و')}` : '';
          toast(`حُذف ${removed.clients} عملاء و${removed.properties} عقارات${kept}`, 'success', kept ? 7000 : 3500);
          dataChanged();
          await redraw();
        } catch (err) { errToast(err); }
      },
    }));
}
