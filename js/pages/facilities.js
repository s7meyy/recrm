/**
 * صفحة **«إدارة المرافق»** (المرحلة ٥٤).
 *
 * المرفقُ ما يخدم العقارَ ولا يُباع معه في نظر اليوميّ: مصعدٌ يقف، ومولّدٌ يحتاج وقودًا،
 * وخزّانٌ يُنظَّف، وموقفٌ يُدار. وكان هذا كلُّه يعيش في ملاحظات العقار — **فلا يُحصى ولا
 * تُعرف حالُه ولا يُسأل عنه إلّا حين يتعطّل**.
 *
 * **وهذه أوّلُ صورةٍ للصفحة، مقصودةٌ قليلةَ الحقول**: اسمٌ ونوعٌ وعقارٌ يتبعه وحالٌ
 * وملاحظة. وصاحبُ المكتب قال إنّ تفاصيلَ محتواها تأتي لاحقًا — **فلا يُخترع له عملٌ لم
 * يطلبه**: لا عقودُ صيانةٍ دوريّةٌ ولا موردون ولا دوراتُ فحص، حتى يقولها.
 *
 * وما تفعله اليوم حقيقيٌّ لا هيكل: تُحصي مرافقك، وتربط كلَّ واحدٍ بعقاره، وتعرف ما
 * تعطّل منها — **والإضافةُ من هنا** كما في «إدارة الأملاك»، لا من صفحةٍ أخرى.
 */

import { repo } from '../data/repository.js';
import { getLists, typeLabel } from '../data/settings.js';
import { ENUMS, labelFor } from '../data/schema.js';
import {
  el, clear, badge, selectEl, emptyState, openModal, confirmDialog, toast, debounce,
} from '../util/dom.js';
import { formatNumber, countOf } from '../util/format.js';
import { matchesQuery } from '../util/arabic.js';

const STATUS_CLASS = { active: 'badge-ok', maintenance: 'badge-warn', stopped: 'badge-danger' };

const placeOf = (p, lists) => (p
  ? ([typeLabel(lists, p.type), p.district, p.city].filter(Boolean).join(' · ') || 'عقار بلا وصف')
  : null);

function routeFacilityId() {
  const m = /^#\/facilities\/([^/?#]+)/.exec(location.hash || '');
  return m ? decodeURIComponent(m[1]) : null;
}

export async function render(container) {
  const ctx = { container, query: '', status: '' };
  await load(ctx);
  build(ctx);
  const focus = routeFacilityId();
  if (focus) {
    const target = ctx.rows.find((r) => r.id === focus);
    if (target) openForm(ctx, target);
    else toast('المرفق غير موجود، أو حُذف', 'error');
  }
}

async function load(ctx) {
  const [rows, properties, lists] = await Promise.all([
    repo.facilities.list(), repo.properties.list(), getLists(),
  ]);
  ctx.rows = rows;
  ctx.properties = properties;
  ctx.lists = lists;
  ctx.propertyById = new Map(properties.map((p) => [p.id, p]));
}

async function refresh(ctx) {
  await load(ctx);
  build(ctx);
}

function visible(ctx) {
  let rows = ctx.rows.slice();
  if (ctx.status) rows = rows.filter((r) => r.status === ctx.status);
  if (ctx.query.trim()) rows = rows.filter((r) => matchesQuery(r.searchKey, ctx.query.trim()));
  return rows.sort((a, b) => String(a.name).localeCompare(String(b.name), 'ar'));
}

function build(ctx) {
  clear(ctx.container);
  const broken = ctx.rows.filter((r) => r.status !== 'active').length;

  ctx.container.append(
    el('div', { class: 'page-head' },
      el('h1', {}, 'إدارة المرافق ', el('span', { class: 'count', text: `(${formatNumber(ctx.rows.length)})` })),
      el('div', { class: 'head-actions' },
        el('button', { type: 'button', class: 'btn btn-primary', text: '+ مرفق جديد', onClick: () => openForm(ctx, null) }))),
    el('div', { class: 'notice' },
      el('strong', { text: 'ما يخدم العقارَ ولا يُباع معه. ' }),
      'مصعدٌ ومولّدٌ وخزّانٌ وموقف — تُحصى وتُربط بعقارها ويُعرف ما تعطّل منها. ',
      el('strong', { text: 'وهذه أوّلُ صورةٍ للصفحة: ' }),
      'حقولُها قليلةٌ عمدًا، وتُوسَّع حين تقول ما تريد منها — ولا يُخترع لك عملٌ لم تطلبه.'),
  );

  ctx.container.append(intakePanel(ctx));

  if (!ctx.rows.length) {
    ctx.container.append(emptyState('لا مرفق بعد. أضِف أوّلَ مرفقٍ من اللوحة أعلاه، واربطه بعقاره.'));
    return;
  }

  /* ما تعطّل أوّلًا — فالجدول يُقرأ والمتوقّفُ يُعالَج */
  if (broken) {
    const bad = ctx.rows.filter((r) => r.status !== 'active');
    ctx.container.append(el('section', { class: 'panel' },
      el('h2', { text: 'ما يستحقّ انتباهك' }),
      el('ul', { class: 'simple-list' }, bad.map((r) => el('li', {},
        badge(labelFor(ENUMS.facilityStatuses, r.status), STATUS_CLASS[r.status] || 'badge-warn'),
        ' ',
        el('button', { type: 'button', class: 'task-title-btn', text: r.name, onClick: () => openForm(ctx, r) }),
        r.propertyId
          ? el('span', { class: 'muted small', text: ` — ${placeOf(ctx.propertyById.get(r.propertyId), ctx.lists) || 'عقار محذوف'}` })
          : null)))));
  }

  /* الفلاتر */
  const search = el('input', { class: 'input search', type: 'search', value: ctx.query, placeholder: 'ابحث في المرافق…' });
  search.addEventListener('input', debounce(() => { ctx.query = search.value; drawTable(ctx); }, 200));
  const statusSel = selectEl({
    options: ENUMS.facilityStatuses.map((x) => ({ value: x.key, label: x.label })),
    value: ctx.status, placeholder: 'كلُّ الحالات',
    onChange: (e) => { ctx.status = e.target.value; drawTable(ctx); },
  });
  ctx.nodes = { body: el('div') };
  ctx.container.append(
    el('div', { class: 'row', style: { gap: '8px', flexWrap: 'wrap', marginBottom: '8px' } }, search, statusSel),
    ctx.nodes.body,
  );
  drawTable(ctx);
}

function drawTable(ctx) {
  clear(ctx.nodes.body);
  const rows = visible(ctx);
  if (!rows.length) {
    ctx.nodes.body.append(el('p', { class: 'muted small', text: 'لا مرفق يطابق الفرز المختار.' }));
    return;
  }
  ctx.nodes.body.append(
    el('p', { class: 'muted small', text: `${formatNumber(rows.length)} من ${countOf(ctx.rows.length, 'مرفق')}` }),
    el('div', { class: 'table-wrap' }, el('table', { class: 'table' },
      el('thead', {}, el('tr', {}, ['المرفق', 'النوع', 'العقار', 'الحال', ''].map((h) => el('th', { text: h })))),
      el('tbody', {}, rows.map((r) => {
        const p = r.propertyId ? ctx.propertyById.get(r.propertyId) : null;
        return el('tr', {},
          el('td', {}, el('button', { type: 'button', class: 'task-title-btn', text: r.name, onClick: () => openForm(ctx, r) })),
          el('td', { text: r.kind || '—' }),
          el('td', {}, p
            ? el('a', { href: `#/property/${p.id}`, text: placeOf(p, ctx.lists) })
            : el('span', { class: 'muted', text: r.propertyId ? 'عقار محذوف' : 'مرفقٌ عامّ' })),
          el('td', {}, badge(labelFor(ENUMS.facilityStatuses, r.status), STATUS_CLASS[r.status] || 'badge-outline')),
          el('td', {}, el('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: 'تعديل', onClick: () => openForm(ctx, r) })));
      })))),
  );
}

/**
 * **الإضافةُ من هنا** — كما في «إدارة الأملاك».
 *
 * وزرُّ «عقار جديد» يفتح استمارةَ العقارات القائمة (`?new=1`) فلا تُبنى استمارةٌ ثانيةٌ
 * تُصان، وما أضفتَه هناك يظهر في قائمة الربط حين تعود.
 */
function intakePanel(ctx) {
  const withFacility = new Set(ctx.rows.map((r) => r.propertyId).filter(Boolean));
  const free = ctx.properties.filter((p) => !p.archivedAt);
  const pick = selectEl({
    options: free.map((p) => ({ value: p.id, label: placeOf(p, ctx.lists) })),
    placeholder: free.length ? 'اختر عقارًا لتضيف له مرفقًا…' : 'لا عقار في مخزونك بعد',
  });
  return el('section', { class: 'panel' },
    el('h2', { text: 'أضِف مرفقًا' }),
    el('p', { class: 'panel-desc' },
      `عندك ${countOf(free.length, 'عقار')}، `,
      `و${countOf(withFacility.size, 'عقار')} منها له مرفقٌ مسجَّل. `,
      'اختر عقارًا وأضِف مرفقَه — أو أضِف مرفقًا عامًّا لا يتبع عقارًا بعينه.'),
    el('div', { class: 'row', style: { gap: '8px', flexWrap: 'wrap', alignItems: 'center' } },
      pick,
      el('button', {
        type: 'button', class: 'btn btn-primary', text: 'أضِف مرفقًا لهذا العقار',
        disabled: !free.length,
        onClick: () => {
          if (!pick.value) { toast('اختر عقارًا أوّلًا، أو استعمل «مرفق جديد»', 'error'); return; }
          openForm(ctx, null, { propertyId: pick.value });
        },
      }),
      el('button', { type: 'button', class: 'btn', text: '+ مرفق عامّ', onClick: () => openForm(ctx, null) }),
      el('a', { class: 'btn btn-ghost', href: '#/properties?new=1', text: '+ عقار جديد' }),
      el('a', { class: 'btn btn-ghost', href: '#/management', text: 'إدارة الأملاك' })));
}

function openForm(ctx, existing, prefill = {}) {
  const rec = existing || { ...repo.facilities.defaults(), ...prefill };
  const nameInput = el('input', { class: 'input', type: 'text', value: rec.name || '' });
  const kindInput = el('input', { class: 'input', type: 'text', value: rec.kind || '', placeholder: 'مصعد · مولّد · خزّان · موقف' });
  const propSel = selectEl({
    options: ctx.properties.filter((p) => !p.archivedAt).map((p) => ({ value: p.id, label: placeOf(p, ctx.lists) })),
    value: rec.propertyId || '', placeholder: 'مرفقٌ عامّ — لا يتبع عقارًا',
  });
  const statusSel = selectEl({
    options: ENUMS.facilityStatuses.map((x) => ({ value: x.key, label: x.label })), value: rec.status || 'active',
  });
  const notesInput = el('textarea', { class: 'input', rows: 3, value: rec.notes || '' });
  const errorsBox = el('div', { class: 'form-errors', hidden: true });

  const save = el('button', {
    type: 'button', class: 'btn btn-primary', text: 'حفظ',
    onClick: async () => {
      const patch = {
        name: nameInput.value, kind: kindInput.value,
        propertyId: propSel.value || null, status: statusSel.value, notes: notesInput.value,
      };
      save.disabled = true;
      try {
        if (existing) await repo.facilities.update(existing.id, patch);
        else await repo.facilities.create(patch);
        modal.close();
        toast(existing ? 'تم الحفظ' : 'أُضيف المرفق', 'success');
        await refresh(ctx);
      } catch (err) {
        clear(errorsBox);
        errorsBox.append(el('ul', {}, (err.errors || [err.message || 'تعذّر الحفظ']).map((e) => el('li', { text: e }))));
        errorsBox.hidden = false;
      } finally { save.disabled = false; }
    },
  });

  const removeBtn = existing
    ? el('button', {
      type: 'button', class: 'btn btn-ghost btn-danger', text: 'حذف المرفق',
      onClick: async () => {
        const yes = await confirmDialog({ title: 'حذف المرفق', message: `سيُحذف «${existing.name}». ويبقى في السلّة ثلاثين يومًا.`, confirmText: 'حذف', danger: true });
        if (!yes) return;
        await repo.facilities.remove(existing.id);
        modal.close();
        toast('حُذف المرفق', 'success');
        await refresh(ctx);
      },
    })
    : null;

  const field = (label, control, hint = '') => el('label', { class: 'field' },
    el('span', { class: 'field-label', text: label }), control,
    hint ? el('span', { class: 'muted small', text: hint }) : null);

  const modal = openModal({
    title: existing ? 'تعديل المرفق' : 'مرفق جديد',
    body: el('div', {}, errorsBox, el('div', { class: 'form-grid one' },
      field('اسم المرفق', nameInput),
      field('النوع', kindInput, 'اكتبه بكلماتك — ولا تُفرض عليك قائمةٌ لم تطلبها'),
      field('العقار', propSel),
      field('الحال', statusSel),
      field('ملاحظات', notesInput))),
    footer: [removeBtn, el('span', { class: 'spacer' }),
      el('button', { type: 'button', class: 'btn btn-ghost', text: 'إلغاء', onClick: () => modal.close() }), save].filter(Boolean),
  });
}
