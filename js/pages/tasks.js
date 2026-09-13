// صفحة "المهام" (المرحلة ٧) — قوائم كأعمدة، حركة المهام بأزرار لا بسحب حقيقي (الأرخص، ويعمل
// باللمس على الجوال بلا أي تعقيد سحب). عرضان محفوظان كتفضيل: لوحة أفقية أو قائمة واحدة رأسية —
// نفس البيانات، فرق العرض CSS فقط. المهمة المنجزة تبقى في قائمتها وتُشطب بصريًا، ومؤشرها في
// الداشبورد منفصل. تذكير المهام (تاريخ ووقت) يُعاد استعمال آلية follow-up-alerts.js نفسها
// بمانع تكرار عبر حقل reminded على المهمة نفسها (لا localStorage هنا، لأنه بيانات عمل حقيقية).

import { repo } from '../data/repository.js';
import { ENUMS, labelFor } from '../data/schema.js';
import { getUI, setUI } from '../data/settings.js';
import {
  el, clear, badge, selectEl, checkbox, openModal, confirmDialog, promptDialog, toast, emptyState,
} from '../util/dom.js';
import { micButton } from '../util/voice.js';
import { syncReminders } from '../util/push.js';
import { formatDateTime, toInputDateTime, fromInputDateTime } from '../util/format.js';
import { clientName } from './requests.js';

// يقرأ #/tasks/<id> (نفس نمط الروابط العميقة الموثّقة) — يستعمله البحث العام.
function routeTaskId() {
  const m = /^#\/tasks\/([^/?#]+)/.exec(location.hash || '');
  return m ? decodeURIComponent(m[1]) : null;
}

export async function render(container) {
  const ctx = { container, taskLists: [], tasks: [], clients: [], properties: [], requests: [], view: 'board' };
  ctx.view = (await getUI()).tasksView === 'single' ? 'single' : 'board';
  await loadData(ctx);
  buildLayout(ctx);
  const focusId = routeTaskId();
  if (focusId) {
    const target = ctx.tasks.find((t) => t.id === focusId);
    if (target) await openTaskForm(ctx, target);
    else toast('المهمة غير موجودة، أو حُذفت', 'error');
  }
}

async function loadData(ctx) {
  const [taskLists, tasks, clients, properties, requests] = await Promise.all([
    repo.taskLists.list(), repo.tasks.list(), repo.clients.list(), repo.properties.list(), repo.requests.list(),
  ]);
  ctx.taskLists = taskLists.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  ctx.tasks = tasks;
  ctx.clients = clients;
  ctx.properties = properties;
  ctx.requests = requests;
}

async function refresh(ctx) {
  // مواعيد التذكير على الخادم تتبع أي تغيير هنا (المرحلة ١٠) — صامتة إن لم تُفعَّل التنبيهات.
  syncReminders().catch(() => {});
  await loadData(ctx);
  buildLayout(ctx);
}

/* ===== أدوات ===== */

function tasksForList(ctx, listId) {
  const items = ctx.tasks.filter((t) => t.listId === listId);
  const pending = items.filter((t) => !t.done).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const done = items.filter((t) => t.done).sort((a, b) => (b.doneAt || '').localeCompare(a.doneAt || ''));
  return [...pending, ...done];
}

function linkedLabel(ctx, task) {
  if (!task.linkType || !task.linkId) return null;
  if (task.linkType === 'client') {
    const c = ctx.clients.find((x) => x.id === task.linkId);
    return `👤 ${c ? clientName(c) : 'عميل محذوف'}`;
  }
  if (task.linkType === 'property') {
    const p = ctx.properties.find((x) => x.id === task.linkId);
    return `🏠 ${p ? (p.district || p.city || 'عقار') : 'عقار محذوف'}`;
  }
  if (task.linkType === 'request') {
    const r = ctx.requests.find((x) => x.id === task.linkId);
    const c = r ? ctx.clients.find((x) => x.id === r.clientId) : null;
    return `📋 ${r ? clientName(c) : 'طلب محذوف'}`;
  }
  return null;
}

async function reorder(ctx, task, dir) {
  const siblings = ctx.tasks.filter((t) => t.listId === task.listId && !t.done).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const idx = siblings.findIndex((t) => t.id === task.id);
  const swapIdx = idx + dir;
  if (swapIdx < 0 || swapIdx >= siblings.length) return;
  const other = siblings[swapIdx];
  await repo.tasks.update(task.id, { order: other.order ?? 0 });
  await repo.tasks.update(other.id, { order: task.order ?? 0 });
  await refresh(ctx);
}

/** موعد التكرار التالي بعد موعد معلوم (أو بعد الآن إن لم يكن للمهمة موعد). */
function nextDueAt(task) {
  const base = task.dueAt ? new Date(task.dueAt) : new Date();
  if (Number.isNaN(base.getTime())) return null;
  const next = new Date(base);
  if (task.repeat === 'daily') next.setDate(next.getDate() + 1);
  else if (task.repeat === 'weekly') next.setDate(next.getDate() + 7);
  else if (task.repeat === 'monthly') next.setMonth(next.getMonth() + 1);
  else return null;
  // موعد فات كثيرًا: يُدفع إلى أقرب موعد قادم بدل إغراقك بمتأخرات وهمية.
  const now = Date.now();
  while (next.getTime() <= now) {
    if (task.repeat === 'daily') next.setDate(next.getDate() + 1);
    else if (task.repeat === 'weekly') next.setDate(next.getDate() + 7);
    else next.setMonth(next.getMonth() + 1);
  }
  return next.toISOString();
}

async function toggleDone(ctx, task, done) {
  await repo.tasks.update(task.id, { done, doneAt: done ? new Date().toISOString() : null });
  // المهمة المتكررة (المرحلة ١١): تبقى المنجزة في مكانها للسجل، وتُنشأ نسخة جديدة بموعدها التالي.
  if (done && task.repeat && task.repeat !== 'none') {
    const dueAt = nextDueAt(task);
    if (dueAt) {
      await repo.tasks.create({
        listId: task.listId, title: task.title, notes: task.notes, order: (task.order ?? 0),
        dueAt, repeat: task.repeat, linkType: task.linkType, linkId: task.linkId,
      });
      toast(`مهمة متكررة — أُنشئت التالية في ${formatDateTime(dueAt)}`, 'info', 5000);
    }
  }
  await refresh(ctx);
}

/* ===== التخطيط ===== */

function taskCard(ctx, task) {
  const idx = ctx.taskLists.findIndex((l) => l.id === task.listId);
  const rightList = idx > 0 ? ctx.taskLists[idx - 1] : null; // "يمين" = قائمة أسبق في الترتيب
  const leftList = idx < ctx.taskLists.length - 1 ? ctx.taskLists[idx + 1] : null;
  const overdue = task.dueAt && !task.done && new Date(task.dueAt).getTime() < Date.now();
  const link = linkedLabel(ctx, task);

  return el('div', { class: `task-card${task.done ? ' task-done' : ''}` },
    el('div', { class: 'task-card-top' },
      checkbox('', { checked: task.done, onChange: (e) => toggleDone(ctx, task, e.target.checked) }),
      el('button', { type: 'button', class: 'task-title-btn', onClick: () => openTaskForm(ctx, task) }, task.title)),
    (task.dueAt || link) ? el('div', { class: 'task-card-meta' },
      task.dueAt ? badge(formatDateTime(task.dueAt), overdue ? 'badge-danger' : 'badge-outline') : null,
      link ? el('span', { class: 'muted small' }, link) : null) : null,
    el('div', { class: 'row task-card-actions' },
      rightList ? el('button', { type: 'button', class: 'btn btn-ghost btn-sm', title: `نقل إلى «${rightList.title}»`, text: '→', onClick: async () => { await repo.tasks.update(task.id, { listId: rightList.id }); await refresh(ctx); } }) : null,
      leftList ? el('button', { type: 'button', class: 'btn btn-ghost btn-sm', title: `نقل إلى «${leftList.title}»`, text: '←', onClick: async () => { await repo.tasks.update(task.id, { listId: leftList.id }); await refresh(ctx); } }) : null,
      !task.done ? el('button', { type: 'button', class: 'btn btn-ghost btn-sm', title: 'أعلى', text: '↑', onClick: () => reorder(ctx, task, -1) }) : null,
      !task.done ? el('button', { type: 'button', class: 'btn btn-ghost btn-sm', title: 'أسفل', text: '↓', onClick: () => reorder(ctx, task, 1) }) : null));
}

function quickAddRow(ctx, list) {
  const input = el('input', { class: 'input', type: 'text', placeholder: '+ إضافة مهمة' });
  const add = async () => {
    const title = input.value.trim();
    if (!title) return;
    const maxOrder = ctx.tasks.filter((t) => t.listId === list.id).reduce((m, t) => Math.max(m, t.order ?? 0), -1);
    input.value = '';
    await repo.tasks.create({ listId: list.id, title, order: maxOrder + 1 });
    await refresh(ctx);
  };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
  return el('div', { class: 'task-quick-add' }, input, micButton(input), el('button', { type: 'button', class: 'btn btn-sm', text: '+', onClick: add }));
}

async function removeList(ctx, list) {
  const ok = await confirmDialog({
    title: 'حذف القائمة', confirmText: 'حذف', danger: true,
    message: `ستُحذف قائمة «${list.title}» وكل مهامها نهائيًا. هل أنت متأكد؟`,
  });
  if (!ok) return;
  await repo.taskLists.remove(list.id);
  toast('حُذفت القائمة', 'success');
  await refresh(ctx);
}

async function renameList(ctx, list) {
  const title = await promptDialog({ title: 'إعادة تسمية القائمة', label: 'اسم القائمة', value: list.title, confirmText: 'حفظ' });
  if (!title) return;
  await repo.taskLists.update(list.id, { title });
  await refresh(ctx);
}

function listColumn(ctx, list) {
  const tasks = tasksForList(ctx, list.id);
  const doneCount = tasks.filter((t) => t.done).length;
  return el('div', { class: 'task-list-col' },
    el('div', { class: 'task-list-head' },
      el('button', { type: 'button', class: 'task-list-title', title: 'إعادة تسمية', onClick: () => renameList(ctx, list) }, list.title),
      el('span', { class: 'muted small num' }, `${doneCount}/${tasks.length}`),
      el('button', { type: 'button', class: 'icon-btn', title: 'حذف القائمة', text: '🗑️', onClick: () => removeList(ctx, list) })),
    el('div', { class: 'task-list-body' }, tasks.length ? tasks.map((t) => taskCard(ctx, t)) : el('div', { class: 'muted small', text: 'لا مهام بعد.' })),
    quickAddRow(ctx, list));
}

function viewToggle(ctx) {
  return el('div', { class: 'seg' },
    el('button', {
      type: 'button', class: `seg-btn${ctx.view === 'board' ? ' active' : ''}`, text: 'لوحة',
      onClick: async () => { ctx.view = 'board'; await setUI({ tasksView: 'board' }); buildLayout(ctx); },
    }),
    el('button', {
      type: 'button', class: `seg-btn${ctx.view === 'single' ? ' active' : ''}`, text: 'قائمة واحدة',
      onClick: async () => { ctx.view = 'single'; await setUI({ tasksView: 'single' }); buildLayout(ctx); },
    }));
}

function buildLayout(ctx) {
  clear(ctx.container);
  const doneTotal = ctx.tasks.filter((t) => t.done).length;
  ctx.container.append(
    el('div', { class: 'page-head' },
      el('h1', {}, 'المهام ', el('span', { class: 'count', text: `(${ctx.tasks.length - doneTotal} متبقية، ${doneTotal} منجزة)` })),
      el('div', { class: 'head-actions' }, viewToggle(ctx),
        el('button', {
          type: 'button', class: 'btn', text: '+ قائمة جديدة',
          onClick: async () => {
            const title = await promptDialog({ title: 'قائمة جديدة', label: 'اسم القائمة', confirmText: 'إنشاء' });
            if (!title) return;
            await repo.taskLists.create({ title, order: ctx.taskLists.length });
            await refresh(ctx);
          },
        }))));

  if (!ctx.taskLists.length) {
    ctx.container.append(emptyState('لا قوائم بعد. أنشئ أول قائمة («قيد التنفيذ» مثلًا) من الزر أعلاه.'));
    return;
  }
  ctx.container.append(el('div', { class: `task-board${ctx.view === 'single' ? ' task-board-single' : ''}` },
    ctx.taskLists.map((l) => listColumn(ctx, l))));
}

/* ===== نموذج تعديل مهمة ===== */

function linkOptionsFor(ctx, type) {
  if (type === 'client') return ctx.clients.map((c) => ({ value: c.id, label: clientName(c) }));
  if (type === 'property') return ctx.properties.map((p) => ({ value: p.id, label: [p.district, p.city].filter(Boolean).join('، ') || 'عقار بلا موقع' }));
  if (type === 'request') return ctx.requests.map((r) => ({ value: r.id, label: clientName(ctx.clients.find((c) => c.id === r.clientId)) }));
  return [];
}

async function openTaskForm(ctx, task) {
  const errorsBox = el('div', { class: 'form-errors', hidden: true });
  const showErrors = (errors) => { clear(errorsBox); errorsBox.append(el('ul', {}, errors.map((e) => el('li', { text: e })))); errorsBox.hidden = false; };

  const titleInput = el('input', { class: 'input', type: 'text', value: task.title });
  const notesInput = el('textarea', { class: 'input', rows: 3, value: task.notes || '' });
  const listSelect = selectEl({ options: ctx.taskLists.map((l) => ({ value: l.id, label: l.title })), value: task.listId });
  const dueInput = el('input', { class: 'input', type: 'datetime-local', value: task.dueAt ? toInputDateTime(task.dueAt) : '' });
  const clearDueBtn = el('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: 'بلا تذكير', onClick: () => { dueInput.value = ''; } });
  const repeatSelect = selectEl({
    options: ENUMS.taskRepeats.map((r) => ({ value: r.key, label: r.label })), value: task.repeat || 'none',
  });

  const linkTypeSelect = selectEl({
    options: ENUMS.linkTypes.map((t) => ({ value: t.key, label: t.label })), value: task.linkType || '', placeholder: 'بلا ربط',
  });
  const linkIdWrap = el('div', { class: 'field' });
  let currentLinkId = task.linkId || null;
  function renderLinkOptions() {
    clear(linkIdWrap);
    const type = linkTypeSelect.value;
    if (!type) return;
    const sel = selectEl({ options: linkOptionsFor(ctx, type), value: type === task.linkType ? (currentLinkId || '') : '', placeholder: 'اختر…' });
    sel.addEventListener('change', () => { currentLinkId = sel.value || null; });
    currentLinkId = sel.value || null;
    linkIdWrap.append(sel);
  }
  linkTypeSelect.addEventListener('change', renderLinkOptions);
  renderLinkOptions();

  const deleteBtn = el('button', {
    type: 'button', class: 'btn btn-ghost btn-danger', text: 'حذف المهمة',
    onClick: async () => {
      const ok = await confirmDialog({ title: 'حذف المهمة', message: 'سيُحذف نهائيًا. هل أنت متأكد؟', confirmText: 'حذف', danger: true });
      if (!ok) return;
      await repo.tasks.remove(task.id);
      modal.close();
      toast('حُذفت المهمة', 'success');
      await refresh(ctx);
    },
  });

  const saveBtn = el('button', {
    type: 'button', class: 'btn btn-primary', text: 'حفظ',
    onClick: async () => {
      const newDueAt = fromInputDateTime(dueInput.value);
      const patch = {
        title: titleInput.value, notes: notesInput.value, listId: listSelect.value,
        dueAt: newDueAt, repeat: repeatSelect.value,
        linkType: linkTypeSelect.value || null, linkId: linkTypeSelect.value ? currentLinkId : null,
      };
      if (newDueAt !== task.dueAt) patch.reminded = false; // موعد جديد يستحق تنبيهًا جديدًا
      saveBtn.disabled = true;
      try {
        await repo.tasks.update(task.id, patch);
        modal.close();
        toast('تم الحفظ', 'success');
        await refresh(ctx);
      } catch (err) {
        showErrors(err.errors || [err.message || 'حدث خطأ غير متوقع']);
      } finally {
        saveBtn.disabled = false;
      }
    },
  });

  const body = el('div', {},
    errorsBox,
    el('div', { class: 'form-grid one' },
      el('label', { class: 'field' }, el('span', { class: 'field-label', text: 'العنوان' }), titleInput),
      el('label', { class: 'field' }, el('span', { class: 'field-label', text: 'القائمة' }), listSelect),
      el('label', { class: 'field' }, el('span', { class: 'field-label', text: 'تذكير بتاريخ ووقت' }), el('div', { class: 'field-row' }, dueInput, clearDueBtn)),
      el('label', { class: 'field' }, el('span', { class: 'field-label', text: 'التكرار' }), repeatSelect),
      el('label', { class: 'field' }, el('span', { class: 'field-label', text: 'ربط بسجل آخر' }), linkTypeSelect),
      linkIdWrap,
      el('label', { class: 'field' }, el('span', { class: 'field-label', text: 'ملاحظات' }), notesInput)));

  const modal = openModal({
    title: 'تعديل المهمة', body,
    footer: [deleteBtn, el('span', { class: 'spacer' }), el('button', { type: 'button', class: 'btn btn-ghost', text: 'إلغاء', onClick: () => modal.close() }), saveBtn],
  });
}
