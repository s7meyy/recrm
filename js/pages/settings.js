// صفحة الإعدادات: المستخدم، النسخ الاحتياطي، التخزين، القوائم القابلة للإضافة،
// الحقول المخصصة، تعريف "مكتمل البيانات"، والبيانات التجريبية.

import { repo, getCurrentUser } from '../data/repository.js';
import { ENUMS, COMPLETENESS_CANDIDATES, labelFor } from '../data/schema.js';
import {
  updateUserName, getLists, addPropertyType, removePropertyType, addPropertyStatus, removePropertyStatus,
  addClientTag, removeClientTag, isBuiltinClientTag, addSource, removeSource, addCity, addDistrict, removeDistrict,
  getCustomFields, addCustomField, removeCustomField, getCompleteness, setCompleteness, getBackupInfo,
  getMatchingSettings, setMatchingSettings, DEFAULT_MATCHING, getZones, addZone, updateZone, removeZone,
  getFollowUpSettings, setFollowUpSettings,
  getSidebarOrder, setSidebarOrder, resetSidebarOrder, orderedPageKeys,
  getCompany, setCompany,
} from '../data/settings.js';
import { SIDEBAR_PAGES, DEFAULT_PAGE_KEYS, pageLabel, applySidebarOrder } from '../util/sidebar.js';
import { storeImage, getImageUrl, removeImage } from '../data/images.js';
import { requestFollowUpPermission } from '../util/follow-up-alerts.js';
import { exportBackup, downloadBlob, markExported, readBackupFile, importBackup } from '../data/backup.js';
import { imagesSummary, formatBytes } from '../data/images.js';
import { seedExists, insertSeed, clearSeed } from '../data/seed.js';
import { el, clear, labeled, selectEl, checkbox, badge, confirmDialog, openModal, toast } from '../util/dom.js';
import { clientTagClass } from '../data/schema.js';
import { formatDateTime, relativeDays } from '../util/format.js';

const dataChanged = () => window.dispatchEvent(new CustomEvent('motabiq:data-changed'));

export async function render(container) {
  clear(container);
  container.append(el('div', { class: 'page-head' }, el('h1', { text: 'الإعدادات' })));
  const grid = el('div', { class: 'settings-grid' });
  container.append(grid);
  grid.append(
    panel('المستخدم الحالي', 'اسمك يُسجَّل على كل ما تنشئه أو تعدّله (تمهيدًا لتعدد المستخدمين لاحقًا).', userBody),
    panel('ترتيب صفحات القائمة الجانبية', 'رتّب الصفحات كما تريد رؤيتها في القائمة. كل الصفحات تبقى ظاهرة؛ الترتيب فقط هو ما يُحفظ.', sidebarOrderBody),
    panel('بيانات الشركة والمستندات', 'ما يُطبع أعلى الفاتورة وعرض السعر: الاسم والشعار وبيانات التواصل، وسلسلتا الترقيم التلقائي.', companyBody),
    panel('النسخ الاحتياطي', 'البيانات محفوظة في هذا المتصفح فقط. الملف الواحد يحوي كل شيء بما فيه الصور والإعدادات.', backupBody),
    panel('التخزين والصور', 'ما تشغله البيانات على هذا الجهاز. لحذف صور بعينها افتح العقار واحذفها من نموذجه.', storageBody),
    panel('القوائم', 'أنواع العقار وحالاته وتصنيفات العملاء والمدن والأحياء. المدمج لا يُحذف؛ ما أضفته يُحذف ما لم يكن مستعملًا.', listsBody),
    panel('الحقول الإضافية', 'حقول تظهر في نموذج العقار لكل الأنواع أو لأنواع محددة.', customFieldsBody),
    panel('المطابقة', 'أوزان المعايير المرجّحة وحدود المرونة. المرونة في اتجاه واحد: الأرخص من الميزانية والأكبر من المساحة لا يُخصم منهما.', matchingBody),
    panel('نطاقات الأحياء', 'مجموعة أحياء بمسمّى واحد («شمال الدائري الشمالي») تُعرَّف مرة وتُستعمل في أي طلب. نطاقات الرياض الخمسة مسودّة تقريبية — راجعها وعدّلها.', zonesBody),
    panel('تعريف "مكتمل البيانات"', 'العقار يُعدّ مكتملًا عندما تتوفر فيه الحقول المحددة هنا.', completenessBody),
    panel('متابعة العملاء', 'حدّ "لم يُتواصل معه" في الداشبورد، وتنبيه المتصفح عند تجاوز عميل له.', followUpBody),
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
    el('span', { class: 'muted small' }, `المعرّف: ${user.id}`),
    // بوابة الدخول (المرحلة ٩) تُدار من الخادم؛ هذا الرابط يمسح كوكي الجلسة فقط.
    el('a', { class: 'btn btn-ghost', href: '/__logout', text: 'تسجيل الخروج' }));
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

  /* تصنيفات العملاء — «جادّ» و«مهم» مدمجان بلونيهما، لا يُحذفان، ويرفعان صاحبهما أعلى القوائم */
  const tagInput = el('input', { class: 'input', type: 'text', placeholder: 'تصنيف جديد: مستثمر، مطوّر…' });
  const tagChips = el('div', { class: 'chips' }, lists.clientTags.map((t) => el('span', { class: `chip chip-static ${clientTagClass(t)}`.trim() },
    t,
    isBuiltinClientTag(t) ? null : el('button', { type: 'button', class: 'chip-x', text: '✕', title: 'حذف', onClick: () => act(() => removeClientTag(t))() }))));
  const tagsBlock = el('div', { class: 'panel-block' },
    el('h3', { text: 'تصنيفات العملاء' }),
    el('p', { class: 'muted small', text: '«جادّ» و«مهم» مدمجان بلونين ثابتين ولا يُحذفان؛ أي عميل يحمل أحدهما يظهر أعلى صفحات العملاء والطلبات والمطابقات («جادّ» قبل «مهم»).' }),
    tagChips,
    el('div', { class: 'row', style: { marginTop: '8px' } },
      tagInput,
      el('button', { type: 'button', class: 'btn', text: 'إضافة', onClick: act(() => addClientTag(tagInput.value)) })));

  /* مصادر الإحالة (تاق المصدر) — اقتراحات فقط، تتكوّن مما استُعمل فعلًا */
  const sourceInput = el('input', { class: 'input', type: 'text', placeholder: 'مصدر جديد: اسم وسيط، منصة…' });
  const sourcesBlock = el('div', { class: 'panel-block' },
    el('h3', { text: 'مصادر الإحالة' }),
    el('p', { class: 'muted small', text: 'اقتراحات حقل «المصدر» في العقار والعميل والطلب. الحقل نصّي حر: أي قيمة جديدة تكتبها تُضاف هنا تلقائيًا، وحذفها من هنا لا يمسّ السجلات.' }),
    lists.sources.length
      ? chipList(lists.sources, { removable: () => true, onRemove: (x) => act(() => removeSource(x))() })
      : el('p', { class: 'muted small', text: 'لا مصادر بعد.' }),
    el('div', { class: 'row', style: { marginTop: '8px' } },
      sourceInput,
      el('button', { type: 'button', class: 'btn', text: 'إضافة', onClick: act(() => addSource(sourceInput.value)) })));

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

  return el('div', {}, typesBlock, statusesBlock, tagsBlock, sourcesBlock, citiesBlock);
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

/* ===== متابعة العملاء (المرحلة ٦) ===== */

async function followUpBody() {
  const fu = await getFollowUpSettings();
  const daysInput = el('input', { class: 'input', type: 'number', min: '1', step: '1', value: fu.staleContactDays });
  const notifyBox = checkbox('نبّهني عبر المتصفح عند تجاوز عميل لهذا الحدّ', { checked: fu.notify });
  const note = el('div', { class: 'muted small' });

  function updateNote() {
    if (typeof Notification === 'undefined') { note.textContent = 'متصفحك لا يدعم تنبيهات النظام.'; return; }
    if (Notification.permission === 'denied') note.textContent = 'تنبيهات المتصفح مرفوضة حاليًا — فعّلها من إعدادات الموقع في متصفحك ثم أعد المحاولة.';
    else if (Notification.permission === 'granted') note.textContent = 'إذن التنبيهات مُفعَّل.';
    else note.textContent = '';
  }
  updateNote();

  return el('div', {},
    el('div', { class: 'form-grid' },
      labeled('لم يُتواصَل معه منذ (أيام)', daysInput),
      el('div', { class: 'field' }, el('span', { class: 'field-label', text: 'تنبيه المتصفح' }), notifyBox)),
    note,
    el('p', { class: 'muted small', style: { marginTop: '4px' } },
      'قيد مهم: التنبيه يعمل فقط أثناء بقاء هذا التبويب مفتوحًا في المتصفح — لا تنبيهات بعد إغلاقه؛ ذلك يحتاج خادمًا حقيقيًا، خارج نطاق التطبيق الحالي.'),
    el('div', { style: { marginTop: '10px' } }, el('button', {
      type: 'button', class: 'btn btn-primary', text: 'حفظ',
      onClick: async () => {
        let notify = notifyBox.querySelector('input').checked;
        if (notify) {
          const perm = await requestFollowUpPermission();
          if (perm !== 'granted') {
            notify = false;
            toast(perm === 'unsupported' ? 'متصفحك لا يدعم تنبيهات النظام' : 'لم يُسمح بالتنبيهات — فعّلها من إعدادات المتصفح', 'error', 6000);
          }
        }
        try {
          await setFollowUpSettings({ staleContactDays: daysInput.value, notify });
          toast('تم الحفظ', 'success');
        } catch (err) { errToast(err); }
        updateNote();
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


/* ===== ترتيب صفحات القائمة الجانبية (المرحلة ٨) ===== */

async function sidebarOrderBody(redraw) {
  const saved = await getSidebarOrder();
  const keys = orderedPageKeys(DEFAULT_PAGE_KEYS, saved);
  const rows = el('div', { class: 'page-order-list' });

  const swap = async (index, dir) => {
    const target = index + dir;
    if (target < 0 || target >= keys.length) return;
    [keys[index], keys[target]] = [keys[target], keys[index]];
    await setSidebarOrder(keys);
    await applySidebarOrder(keys);
    await redraw();
  };

  keys.forEach((key, index) => {
    const page = SIDEBAR_PAGES.find((p) => p.key === key);
    rows.append(el('div', { class: 'page-order-row' },
      el('span', { class: 'sidebar-icon', text: page?.icon || '•' }),
      el('span', { class: 'page-order-name', text: pageLabel(key) }),
      el('button', { type: 'button', class: 'btn btn-ghost btn-sm', title: 'أعلى', text: '↑', disabled: index === 0, onClick: () => swap(index, -1) }),
      el('button', { type: 'button', class: 'btn btn-ghost btn-sm', title: 'أسفل', text: '↓', disabled: index === keys.length - 1, onClick: () => swap(index, 1) })));
  });

  return el('div', {},
    rows,
    el('div', { class: 'row', style: { marginTop: '10px' } },
      el('button', {
        type: 'button', class: 'btn btn-ghost', text: 'إرجاع الترتيب الافتراضي',
        onClick: async () => {
          await resetSidebarOrder();
          await applySidebarOrder([]);
          toast('أُرجع الترتيب الافتراضي', 'success');
          await redraw();
        },
      })));
}

/* ===== بيانات الشركة والمستندات (المرحلة ٨) ===== */

async function companyBody(redraw) {
  const company = await getCompany();
  const text = (value, placeholder = '') => el('input', { class: 'input', type: 'text', value: value || '', placeholder });
  const nameInput = text(company.name, 'اسم المكتب كما يُطبع');
  const phoneInput = el('input', { class: 'input', type: 'tel', dir: 'ltr', value: company.phone || '' });
  const emailInput = el('input', { class: 'input', type: 'email', dir: 'ltr', value: company.email || '' });
  const addressInput = text(company.address);
  const crInput = text(company.crNumber, 'رقم السجل التجاري أو الترخيص');
  const footerInput = el('textarea', { class: 'input', rows: 2, value: company.footerNote || '', placeholder: 'سطر يُطبع أسفل كل مستند (شروط، شكر، حساب بنكي…)' });
  const invPrefix = text(company.invoicePrefix);
  const quotePrefix = text(company.quotePrefix);
  const invNext = el('input', { class: 'input', type: 'number', min: '1', step: '1', value: company.nextInvoiceNo });
  const quoteNext = el('input', { class: 'input', type: 'number', min: '1', step: '1', value: company.nextQuoteNo });

  /* الشعار: صورة واحدة في مخزن images (نفس آلية صور العقار: ضغط تلقائي قبل الحفظ). */
  const logoBox = el('div', { class: 'row' });
  const fileInput = el('input', {
    type: 'file', accept: 'image/*', class: 'visually-hidden',
    onChange: async (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      try {
        const rec = await storeImage(file, { entity: 'company', entityId: 'company' });
        if (company.logoImageId) await removeImage(company.logoImageId).catch(() => {});
        await setCompany({ logoImageId: rec.id });
        toast('حُفظ الشعار', 'success');
        await redraw();
      } catch (err) { errToast(err); }
    },
  });
  if (company.logoImageId) {
    try {
      const url = await getImageUrl(company.logoImageId);
      if (url) logoBox.append(el('img', { class: 'company-logo-preview', src: url, alt: 'شعار' }));
    } catch (_) { /* شعار مفقود */ }
  }
  logoBox.append(
    el('button', { type: 'button', class: 'btn', text: company.logoImageId ? 'استبدال الشعار…' : 'رفع شعار…', onClick: () => fileInput.click() }),
    company.logoImageId ? el('button', {
      type: 'button', class: 'btn btn-ghost', text: 'حذف الشعار',
      onClick: async () => {
        try {
          await removeImage(company.logoImageId).catch(() => {});
          await setCompany({ logoImageId: null });
          await redraw();
        } catch (err) { errToast(err); }
      },
    }) : null,
    fileInput);

  return el('div', {},
    el('div', { class: 'panel-block' },
      el('h3', { text: 'ما يُطبع أعلى المستند' }),
      el('div', { class: 'form-grid' },
        labeled('اسم الشركة / المكتب', nameInput),
        labeled('الجوال', phoneInput),
        labeled('البريد', emailInput),
        labeled('العنوان', addressInput),
        labeled('السجل التجاري', crInput),
        el('div', { class: 'field field-full' }, el('span', { class: 'field-label', text: 'الشعار' }), logoBox),
        labeled('تذييل المستند', footerInput, { full: true }))),
    el('div', { class: 'panel-block' },
      el('h3', { text: 'الترقيم التلقائي' }),
      el('p', { class: 'muted small', text: 'لكل نوع سلسلة مستقلة. الرقم يُقترح عند الإنشاء ويبقى قابلًا للكتابة فوقه، والعدّاد لا يتقدم إلا إذا حُفظ الرقم المقترح كما هو.' }),
      el('div', { class: 'form-grid' },
        labeled('بادئة الفاتورة', invPrefix),
        labeled('رقم الفاتورة التالي', invNext),
        labeled('بادئة عرض السعر', quotePrefix),
        labeled('رقم عرض السعر التالي', quoteNext))),
    el('div', { class: 'row', style: { marginTop: '14px' } },
      el('button', {
        type: 'button', class: 'btn btn-primary', text: 'حفظ بيانات الشركة',
        onClick: async () => {
          try {
            await setCompany({
              name: nameInput.value, phone: phoneInput.value, email: emailInput.value,
              address: addressInput.value, crNumber: crInput.value, footerNote: footerInput.value,
              invoicePrefix: invPrefix.value, quotePrefix: quotePrefix.value,
              nextInvoiceNo: invNext.value, nextQuoteNo: quoteNext.value,
            });
            toast('حُفظت بيانات الشركة', 'success');
            await redraw();
          } catch (err) { errToast(err); }
        },
      })));
}
