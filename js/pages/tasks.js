// صفحة "المهام" (المرحلة ٧) — قوائم كأعمدة، حركة المهام بأزرار لا بسحب حقيقي (الأرخص، ويعمل
// باللمس على الجوال بلا أي تعقيد سحب). عرضان محفوظان كتفضيل: لوحة أفقية أو قائمة واحدة رأسية —
// نفس البيانات، فرق العرض CSS فقط. المهمة المنجزة تبقى في قائمتها وتُشطب بصريًا، ومؤشرها في
// الداشبورد منفصل. تذكير المهام (تاريخ ووقت) يُعاد استعمال آلية follow-up-alerts.js نفسها
// بمانع تكرار عبر حقل reminded على المهمة نفسها (لا localStorage هنا، لأنه بيانات عمل حقيقية).

import { repo } from '../data/repository.js';
import { ENUMS, labelFor } from '../data/schema.js';
import { getUI, setUI, getTeam } from '../data/settings.js';
import { getCurrentUser } from '../data/repository.js';
import { activeMembers, assignOptions, memberName, passesAssign, assignRow } from '../util/team.js';
import {
  el, clear, badge, selectEl, checkbox, openModal, confirmDialog, promptDialog, toast, emptyState,
} from '../util/dom.js';
import { micButton } from '../util/voice.js';
import { syncReminders } from '../util/push.js';
import { formatDateTime, formatDate, formatNumber, countWord, toInputDateTime, fromInputDateTime , countOf} from '../util/format.js';
import { clientName } from './requests.js';
import { proposeTasks } from '../util/task-intake.js';
import { allChip, debounce } from '../util/dom.js';
import { matchesQuery } from '../util/arabic.js';

// يقرأ #/tasks/<id> (نفس نمط الروابط العميقة الموثّقة) — يستعمله البحث العام.
function routeTaskId() {
  const m = /^#\/tasks\/([^/?#]+)/.exec(location.hash || '');
  return m ? decodeURIComponent(m[1]) : null;
}

export async function render(container) {
  const ctx = {
    container, taskLists: [], tasks: [], clients: [], properties: [], requests: [],
    view: 'board',
    // فلاتر عرض الجدول (المرحلة ٤٠) — كلٌّ منها سؤالٌ يُسأل في أدوات إدارة المهام
    table: { status: 'open', priorities: new Set(), due: 'all', listId: '', query: '', assign: '', sort: { key: 'due', dir: 'asc' } },
  };
  const savedView = (await getUI()).tasksView;
  ctx.view = ['single', 'table'].includes(savedView) ? savedView : 'board';
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
  const [taskLists, tasks, clients, properties, requests, team] = await Promise.all([
    repo.taskLists.list(), repo.tasks.list(), repo.clients.list(), repo.properties.list(), repo.requests.list(),
    getTeam(), // الإسناد (المرحلة ٤٨)
  ]);
  ctx.team = team;
  ctx.meId = getCurrentUser()?.id || '';
  // المثبَّتة أوّلًا مهما كان ترتيبها (المرحلة ٤٠) — ما تعمل فيه اليوم أمامك لا في آخر لوحة.
  ctx.taskLists = taskLists.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (a.order ?? 0) - (b.order ?? 0));
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
  return el('div', { class: `task-list-col${list.pinned ? ' task-list-pinned' : ''}` },
    el('div', { class: 'task-list-head' },
      el('button', {
        type: 'button', class: `icon-btn pin-btn${list.pinned ? ' pinned' : ''}`,
        title: list.pinned ? 'أزل التثبيت' : 'ثبّتها في الأعلى',
        'aria-pressed': list.pinned ? 'true' : 'false',
        text: list.pinned ? '📌' : '📍',
        onClick: async () => { await repo.taskLists.update(list.id, { pinned: !list.pinned }); await refresh(ctx); },
      }),
      el('button', { type: 'button', class: 'task-list-title', title: 'إعادة تسمية', onClick: () => renameList(ctx, list) }, list.title),
      el('span', { class: 'muted small num' }, `${doneCount}/${tasks.length}`),
      el('button', { type: 'button', class: 'icon-btn', title: 'حذف القائمة', text: '🗑️', onClick: () => removeList(ctx, list) })),
    el('div', { class: 'task-list-body' }, tasks.length ? tasks.map((t) => taskCard(ctx, t)) : el('div', { class: 'muted small', text: 'لا مهام بعد.' })),
    quickAddRow(ctx, list));
}

const VIEWS = [['board', 'لوحة'], ['single', 'قائمة واحدة'], ['table', 'جدول']];

function viewToggle(ctx) {
  return el('div', { class: 'seg' }, VIEWS.map(([key, label]) => el('button', {
    type: 'button', class: `seg-btn${ctx.view === key ? ' active' : ''}`, text: label,
    'data-view': key,
    onClick: async () => { ctx.view = key; await setUI({ tasksView: key }); buildLayout(ctx); },
  })));
}

function buildLayout(ctx) {
  clear(ctx.container);
  const doneTotal = ctx.tasks.filter((t) => t.done).length;
  ctx.container.append(
    el('div', { class: 'page-head' },
      // `countWord` لا الرقمُ عاريًا: «0 متبقية» و«3 مهمة» ليستا عربيّة، والعددُ في العربية
      // يُغيّر المعدود — وهذا ما يقرؤه المستخدم في كل زيارة.
      el('h1', {}, 'المهام ', el('span', { class: 'count', text: `(${countWord(ctx.tasks.length - doneTotal, ['مهمة واحدة متبقية', 'مهمّتان متبقيتان', 'مهامّ متبقية', 'مهمّة متبقية'])} · ${countWord(doneTotal, ['مهمة منجزة', 'مهمّتان منجزتان', 'مهامّ منجزة', 'مهمّة منجزة'])})` })),
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

  // الصندوق **قبل** حارس «لا قوائم بعد»: كان بعده، فالمستخدم الجديد — وهو أحوجُ الناس
  // إلى إضافةٍ دفعةً — لا يراه أصلًا، ويُطلب منه أن ينشئ قائمةً بيده أوّلًا. وصار الصندوق
  // يقترح أسماءَ القوائم من موضوعات أسطرك، ويُنشئها مع المهامّ عند الاعتماد.
  ctx.container.append(bulkAddBox(ctx));

  if (!ctx.taskLists.length) {
    ctx.container.append(emptyState('لا قوائم بعد. أضِف مهامك في الصندوق أعلاه فتُقترح لها قوائم، أو أنشئ قائمةً من الزرّ.'));
    return;
  }

  if (ctx.view === 'table') {
    ctx.container.append(tableView(ctx));
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
  const prioritySelect = selectEl({
    options: ENUMS.taskPriorities.map((x) => ({ value: x.key, label: x.label })),
    value: task?.priority || 'normal',
  });
  const repeatSelect = selectEl({
    options: ENUMS.taskRepeats.map((r) => ({ value: r.key, label: r.label })), value: task.repeat || 'none',
  });

  // الإسناد (المرحلة ٤٨): المهمّةُ فعلٌ يُوزَّع — ولا يظهر الحقل لمكتبٍ من شخصٍ واحد.
  const taskMembers = activeMembers(ctx.team || []);
  const assignSelect = selectEl({
    options: assignOptions(ctx.team || [], task.assignedTo || ''),
    value: task.assignedTo || '', placeholder: 'بلا مسند',
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
        dueAt: newDueAt, repeat: repeatSelect.value, priority: prioritySelect.value,
        ...(taskMembers.length > 1 ? { assignedTo: assignSelect.value || null } : {}),
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
      el('label', { class: 'field' }, el('span', { class: 'field-label', text: 'الأولوية' }), prioritySelect),
      el('label', { class: 'field' }, el('span', { class: 'field-label', text: 'التكرار' }), repeatSelect),
      taskMembers.length > 1
        ? el('label', { class: 'field' }, el('span', { class: 'field-label', text: 'مُسندة إلى' }), assignSelect)
        : null,
      el('label', { class: 'field' }, el('span', { class: 'field-label', text: 'ربط بسجل آخر' }), linkTypeSelect),
      linkIdWrap,
      el('label', { class: 'field' }, el('span', { class: 'field-label', text: 'ملاحظات' }), notesInput)));

  const modal = openModal({
    title: 'تعديل المهمة', body,
    footer: [deleteBtn, el('span', { class: 'spacer' }), el('button', { type: 'button', class: 'btn btn-ghost', text: 'إلغاء', onClick: () => modal.close() }), saveBtn],
  });
}

/* ===== إضافة دفعة مهام بتوزيعٍ يُعتمد (المرحلة ٤٠) ===== */

/**
 * تكتب مهامك سطرًا سطرًا كما تخطر لك — ثم إنتر، فتُوزَّع على قوائمك بموضوعها ويُقرأ من كل
 * سطرٍ موعدُه وأولويّتُه. **ولا يُحفظ شيء حتى تراجع وتعتمد**: توزيعٌ آليٌّ يُكتب بلا نظرة
 * يخلط مهامك بدل أن يرتّبها، ويُشغلك بتصحيحه أكثر ممّا وفّر.
 *
 * و**سببُ كل اختيار مكتوبٌ بجانبه** — «ذُكر اسم القائمة»، «موضوعه اتصالات»، «لم يُعرف
 * موضوعه» — فتراجعه بنظرة بدل أن تفتح كل سطرٍ لتفهم لماذا وقع هنا.
 */
function bulkAddBox(ctx) {
  const area = el('textarea', {
    class: 'input bulk-area', rows: 3,
    placeholder: 'اكتب مهامك — مهمة في كل سطر، ثم إنتر:\n'
      + 'اتصل على سعد بكرة الساعة ٤\n!! جدّد ترخيص إعلان الملقا\nمعاينة النرجس الخميس',
    'aria-label': 'إضافة مهام دفعة واحدة',
  });
  const preview = el('div', { class: 'bulk-preview' });
  let rows = [];

  const propose = () => {
    rows = proposeTasks(area.value, ctx.taskLists);
    drawPreview();
  };

  // إنتر يقترح؛ وShift+إنتر سطرٌ جديد — وإلّا تعذّر كتابة أكثر من سطر أصلًا.
  area.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
    e.preventDefault();
    propose();
  });

  const drawPreview = () => {
    clear(preview);
    if (!rows.length) return;

    preview.append(el('div', { class: 'notice' },
      el('strong', { text: `اقتراحٌ لـ${countWord(rows.length, ['مهمة واحدة', 'مهمّتين', 'مهامّ', 'مهمّة'])} — ` }),
      'راجعه وعدّل ما شئت، ثم اعتمده. ولا يُحفظ شيءٌ قبل ذلك.'));

    const body = el('tbody');
    rows.forEach((r, i) => {
      const titleInput = el('input', { class: 'input', type: 'text', value: r.title });
      titleInput.addEventListener('input', () => { rows[i].title = titleInput.value; });

      const listCell = ctx.taskLists.length
        ? selectEl({
          options: ctx.taskLists.map((l) => ({ value: l.id, label: l.title })),
          value: r.listId || ctx.taskLists[0].id,
          onChange: (e) => { rows[i].listId = e.target.value; rows[i].why = 'اخترتَها بنفسك'; drawWhy(i); },
        })
        // بلا قوائمَ بعد: الاسمُ يُقترح ويُحرَّر، والقوائمُ تُنشأ عند الاعتماد لا قبله.
        : (() => {
          const input = el('input', { class: 'input', type: 'text', value: r.newListTitle || 'قيد التنفيذ', 'aria-label': 'اسم القائمة التي ستُنشأ' });
          input.addEventListener('input', () => { rows[i].newListTitle = input.value; });
          return input;
        })();
      const prioritySelect = selectEl({
        options: ENUMS.taskPriorities.map((p) => ({ value: p.key, label: p.label })),
        value: r.priority,
        onChange: (e) => { rows[i].priority = e.target.value; },
      });
      const dueInput = el('input', {
        class: 'input', type: 'datetime-local', value: r.dueAt ? toInputDateTime(r.dueAt) : '',
      });
      dueInput.addEventListener('change', () => { rows[i].dueAt = fromInputDateTime(dueInput.value); });

      const whyCell = el('td', { class: 'bulk-why' });
      const drawWhy = (idx) => {
        clear(whyCell);
        const guessed = rows[idx].why.includes('لم يُعرف');
        whyCell.append(
          el('div', { class: `small${guessed ? ' warn-text' : ' muted'}`, text: rows[idx].why }),
          el('div', { class: 'muted small bulk-source', title: rows[idx].source, text: rows[idx].source }));
      };
      drawWhy(i);

      body.append(el('tr', {},
        el('td', {}, titleInput),
        el('td', {}, listCell),
        el('td', {}, prioritySelect),
        el('td', {}, dueInput),
        whyCell,
        el('td', {}, el('button', {
          type: 'button', class: 'icon-btn', title: 'استبعد هذا السطر', text: '✕',
          onClick: () => { rows.splice(i, 1); drawPreview(); },
        }))));
    });

    preview.append(el('div', { class: 'table-wrap' },
      el('table', { class: 'table bulk-table' },
        el('thead', {}, el('tr', {}, ['المهمة', 'القائمة', 'الأولوية', 'الموعد', 'لماذا هنا؟', ''].map((h) => el('th', { text: h })))),
        body)));

    preview.append(el('div', { class: 'row', style: { marginTop: '10px' } },
      el('button', {
        type: 'button', class: 'btn btn-primary',
        text: `اعتمد وأضِف ${formatNumber(rows.length)}`,
        onClick: async () => {
          const chosen = rows.filter((r) => r.title.trim() && (r.listId || String(r.newListTitle || '').trim()));
          if (!chosen.length) { toast('لا سطر صالحًا للإضافة', 'error'); return; }

          // القوائمُ المقترَحة تُنشأ الآن — عند الاعتماد لا قبله — وباسمٍ واحدٍ لكل عنوان،
          // فسطران موضوعُهما «اتصالات» لا يصنعان قائمتين.
          const made = new Map(ctx.taskLists.map((l) => [l.title.trim(), l.id]));
          for (const r of chosen) {
            if (r.listId) continue;
            const title = String(r.newListTitle || 'قيد التنفيذ').trim();
            if (!made.has(title)) {
              // eslint-disable-next-line no-await-in-loop
              const created = await repo.taskLists.create({ title, order: made.size });
              made.set(title, created.id);
            }
            r.listId = made.get(title);
          }

          for (const r of chosen) {
            const maxOrder = ctx.tasks.filter((t) => t.listId === r.listId).reduce((m, t) => Math.max(m, t.order ?? 0), -1);
            // eslint-disable-next-line no-await-in-loop
            await repo.tasks.create({
              listId: r.listId, title: r.title.trim(), priority: r.priority,
              dueAt: r.dueAt || null, order: maxOrder + 1,
            });
          }
          area.value = '';
          rows = [];
          toast(`أُضيفت ${countWord(chosen.length, ['مهمة واحدة', 'مهمّتان', 'مهامّ', 'مهمّة'])}`, 'success');
          await refresh(ctx);
        },
      }),
      el('button', {
        type: 'button', class: 'btn btn-ghost', text: 'ألغِ الاقتراح',
        onClick: () => { rows = []; drawPreview(); },
      })));
  };

  return el('section', { class: 'panel bulk-add' },
    el('h2', { text: 'أضِف مهامك دفعةً' }),
    el('p', { class: 'panel-desc' },
      'مهمة في كل سطر، ثم إنتر (وShift+إنتر لسطرٍ جديد). ',
      'تُقرأ في جهازك: الموعد («بكرة الساعة ٤»)، والأولوية («!!» أو «عاجل»)، والقائمة بموضوعها. ',
      el('strong', { text: 'وهي مطابقةُ كلماتٍ لا فهمُ كلام' }),
      ' — ولذلك تُراجَع قبل أن تُحفظ.'),
    el('div', { class: 'row' }, area, micButton(area)),
    el('div', { class: 'row', style: { marginTop: '8px' } },
      el('button', { type: 'button', class: 'btn', text: 'وزّعها', onClick: propose })),
    preview);
}

/* ===== عرض الجدول (المرحلة ٤٠) ===== */

/**
 * ما تعرضه أدوات إدارة المهام في جدولها: **العنوان، والحالة، والأولوية، والموعد،
 * والمشروع/القائمة، والوسم/الرابط** — وتفرز بالحالة والأولوية والموعد والمشروع، وتبحث
 * بالنصّ، وترتّب بالضغط على العمود. وهذا هو المبنيّ هنا بأسمائه في هذا البرنامج.
 *
 * ولا «المسؤول» ولا «التقدير بالساعات»: هذا برنامج مكتبٍ يعمل فيه صاحبُه ومساعده، وعمودٌ
 * لا يُملأ عمودٌ يُزاحم.
 */
const DUE_FILTERS = [
  { key: 'all', label: 'كل المواعيد' },
  { key: 'overdue', label: 'متأخّرة' },
  { key: 'today', label: 'اليوم' },
  { key: 'week', label: 'هذا الأسبوع' },
  { key: 'none', label: 'بلا موعد' },
];

const COLUMNS = [
  { key: 'done', label: '', sort: null },
  { key: 'title', label: 'المهمة', sort: (t) => t.title || '' },
  { key: 'priority', label: 'الأولوية', sort: (t) => ENUMS.taskPriorities.find((p) => p.key === t.priority)?.rank ?? 9, num: true },
  { key: 'due', label: 'الموعد', sort: (t) => t.dueAt || '￿', num: false },
  { key: 'list', label: 'القائمة', sort: (t, ctx) => ctx.taskLists.find((l) => l.id === t.listId)?.title || '' },
  { key: 'repeat', label: 'التكرار', sort: (t) => t.repeat || '' },
  { key: 'link', label: 'مرتبطة بـ', sort: (t, ctx) => linkedLabel(ctx, t) || '' },
  // الإسناد (المرحلة ٤٨) — عمودٌ يُخفى كلُّه لمكتبٍ من شخصٍ واحد، فلا يشغل عرضًا بلا معنى.
  { key: 'assign', label: 'مُسندة إلى', team: true, sort: (t, ctx) => memberName(ctx.team, t.assignedTo, { me: ctx.meId }) || '￿' },
];

/** أعمدةُ هذا المكتب: الإسنادُ يسقط إن لم يكن ثَمّ فريق. */
const columnsFor = (ctx) => COLUMNS.filter((c) => !c.team || activeMembers(ctx.team || []).length > 1);

function dueBucket(task, now = Date.now()) {
  if (!task.dueAt) return 'none';
  const t = new Date(task.dueAt).getTime();
  if (!Number.isFinite(t)) return 'none';
  if (t < now && !task.done) return 'overdue';
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  if (t <= end.getTime()) return 'today';
  return t <= end.getTime() + 6 * 86400000 ? 'week' : 'later';
}

function tableRows(ctx) {
  const f = ctx.table;
  let rows = ctx.tasks.slice();
  if (f.status === 'open') rows = rows.filter((t) => !t.done);
  else if (f.status === 'done') rows = rows.filter((t) => t.done);
  if (f.priorities.size) rows = rows.filter((t) => f.priorities.has(t.priority || 'normal'));
  if (f.listId) rows = rows.filter((t) => t.listId === f.listId);
  rows = rows.filter((t) => passesAssign(t, f.assign, ctx.meId));
  if (f.due !== 'all') {
    const now = Date.now();
    rows = rows.filter((t) => (f.due === 'week'
      ? ['today', 'week', 'overdue'].includes(dueBucket(t, now))
      : dueBucket(t, now) === f.due));
  }
  if (f.query.trim()) {
    const q = f.query.trim();
    rows = rows.filter((t) => matchesQuery(t.searchKey, q));
  }
  const col = COLUMNS.find((c) => c.key === f.sort.key);
  if (col?.sort) {
    const dir = f.sort.dir === 'asc' ? 1 : -1;
    rows.sort((a, b) => {
      const va = col.sort(a, ctx);
      const vb = col.sort(b, ctx);
      if (col.num) return (Number(va) - Number(vb)) * dir;
      return String(va).localeCompare(String(vb), 'ar') * dir;
    });
  }
  return rows;
}

function tableView(ctx) {
  const wrap = el('section', { class: 'panel' });
  const filters = el('div', { class: 'filters' });
  const body = el('div');

  const redraw = () => { clear(body); body.append(tableBody(ctx, redrawAll)); };
  const redrawAll = () => { drawFilters(); redraw(); };

  function drawFilters() {
    clear(filters);
    const f = ctx.table;

    const search = el('input', {
      class: 'input search', type: 'search', value: f.query, placeholder: 'ابحث في المهام…',
    });
    search.addEventListener('input', debounce(() => { f.query = search.value; redraw(); }, 200));

    const statusSeg = el('div', { class: 'seg' }, [['open', 'المتبقية'], ['done', 'المنجزة'], ['all', 'الكل']]
      .map(([key, label]) => el('button', {
        type: 'button', class: `seg-btn${f.status === key ? ' active' : ''}`, text: label,
        onClick: () => { f.status = key; redrawAll(); },
      })));

    const prChips = el('div', { class: 'chips' });
    prChips.append(allChip(f.priorities, ENUMS.taskPriorities.map((p) => p.key), redrawAll));
    for (const p of ENUMS.taskPriorities) {
      const n = ctx.tasks.filter((t) => (t.priority || 'normal') === p.key && (f.status !== 'open' || !t.done)).length;
      const active = f.priorities.has(p.key);
      prChips.append(el('button', {
        type: 'button', class: `chip${active ? ' active' : ''}${n === 0 && !active ? ' zero' : ''}`,
        onClick: () => { if (active) f.priorities.delete(p.key); else f.priorities.add(p.key); redrawAll(); },
      }, p.label, el('span', { class: 'chip-count', text: String(n) })));
    }

    // رقاقةُ الإسناد (المرحلة ٤٨) — هي نفسُها المستعملة في العملاء والعقارات والطلبات.
    const assignChips = assignRow({
      rows: ctx.tasks.filter((t) => f.status !== 'open' || !t.done),
      team: ctx.team || [], meId: ctx.meId, value: f.assign || '',
      onPick: (v) => { f.assign = v; redrawAll(); },
      el, formatNumber,
    });

    const dueSelect = selectEl({
      options: DUE_FILTERS.map((d) => ({ value: d.key, label: d.label })),
      value: f.due,
      onChange: (e) => { f.due = e.target.value; redrawAll(); },
    });
    const listSelect = selectEl({
      options: ctx.taskLists.map((l) => ({ value: l.id, label: l.title })),
      value: f.listId, placeholder: 'كل القوائم',
      onChange: (e) => { f.listId = e.target.value; redrawAll(); },
    });

    filters.append(
      el('div', { class: 'row', style: { flexWrap: 'wrap', gap: '8px', marginBottom: '8px' } },
        search, statusSeg, dueSelect, listSelect),
      el('div', { class: 'filter-row' }, el('span', { class: 'filter-label', text: 'الأولوية' }), prChips),
      assignChips); // `assignRow` تُعيد صفَّ فلترٍ كاملًا بعنوانه — لا يُلَفّ مرّةً ثانية
  }

  drawFilters();
  redraw();
  wrap.append(filters, body);
  return wrap;
}

function tableBody(ctx, redrawAll) {
  const rows = tableRows(ctx);
  const f = ctx.table;
  const cols = columnsFor(ctx);
  const head = el('tr', {}, cols.map((c) => {
    if (!c.sort) return el('th', { text: c.label });
    const active = f.sort.key === c.key;
    return el('th', {}, el('button', {
      type: 'button', class: `th-sort${active ? ' active' : ''}`,
      onClick: () => {
        if (active) f.sort.dir = f.sort.dir === 'asc' ? 'desc' : 'asc';
        else { f.sort.key = c.key; f.sort.dir = 'asc'; }
        redrawAll();
      },
    }, c.label, active ? (f.sort.dir === 'asc' ? ' ▲' : ' ▼') : ''));
  }));

  if (!rows.length) {
    return el('div', {},
      el('p', { class: 'muted small', text: 'لا مهمة تطابق الفرز المختار.' }));
  }

  return el('div', {},
    el('p', { class: 'muted small', text: `${formatNumber(rows.length)} من ${countOf(ctx.tasks.length, 'مهمة')}` }),
    el('div', { class: 'table-wrap' },
      el('table', { class: 'table tasks-table' },
        el('thead', {}, head),
        el('tbody', {}, rows.map((t) => tableRow(ctx, t))))));
}

function tableRow(ctx, task) {
  const pr = ENUMS.taskPriorities.find((p) => p.key === (task.priority || 'normal'));
  const bucket = dueBucket(task);
  const link = linkedLabel(ctx, task);
  const list = ctx.taskLists.find((l) => l.id === task.listId);
  return el('tr', { class: task.done ? 'task-row-done' : '' },
    el('td', {}, checkbox('', { checked: task.done, onChange: (e) => toggleDone(ctx, task, e.target.checked) })),
    el('td', {}, el('button', { type: 'button', class: 'task-title-btn', onClick: () => openTaskForm(ctx, task) }, task.title)),
    el('td', {}, badge(pr?.label || '—', pr?.cls || 'badge-outline')),
    el('td', {}, task.dueAt
      ? badge(formatDateTime(task.dueAt), bucket === 'overdue' ? 'badge-danger' : bucket === 'today' ? 'badge-warn' : 'badge-outline')
      : el('span', { class: 'muted', text: '—' })),
    el('td', { text: list?.title || '—' }),
    el('td', { text: task.repeat && task.repeat !== 'none' ? labelFor(ENUMS.taskRepeats, task.repeat) : '—' }),
    el('td', {}, link || el('span', { class: 'muted', text: '—' })),
    activeMembers(ctx.team || []).length > 1
      ? el('td', { text: task.assignedTo ? memberName(ctx.team, task.assignedTo, { me: ctx.meId }) : '—' })
      : null);
}
