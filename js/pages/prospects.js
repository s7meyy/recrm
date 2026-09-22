/**
 * صفحة **«الفرص العقاريّة»** (المرحلة ٥٣) — بابٌ لم يُفتح بعد.
 *
 * **ولماذا صفحةٌ لا وسمٌ على العقار؟** لأنّ مخزونك يُطابَق ويُرسَل ويُنشَر: مزادٌ لم
 * يُعلَن، وورثةٌ يتقاسمون، ومالكٌ ينوي ولم يعرض — لو دخلت هذه مخزونَك لصارت **عروضًا
 * وهميّةً** تُرسَل لعملائك وتظهر في صفحتك العامّة، **وأنت مسؤولٌ نظامًا عمّا تعرض**.
 * ولو لم يكن لها بابٌ أصلًا لماتت في محادثةٍ أو ورقة.
 *
 * فصارت قوائمَ كقوائم المهامّ **عمدًا لا كسلًا**: الفرصةُ تمرّ بمراحلَ يصنعها صاحبُها
 * («سمعتُ بها» ← «تحقّقتُ» ← «كلّمتُ المالك» ← «اتّفقنا»)، والمراحلُ تختلف من مكتبٍ
 * إلى مكتب — **فقوائمُك أنت لا قوائمُنا نحن**. والحركةُ بين الأعمدة بأزرارٍ لا بسحب،
 * لأنّ السحبَ لا يعمل باللمس إلّا بتعقيدٍ لا يستحقّه.
 *
 * **وإذا نضجت صارت عرضًا بضغطة** — بالمسار القائم نفسِه (`kassab:quick-offer` ونافذةُ
 * اللصق في العقارات)، فلا يُخترع بابُ إدخالٍ ثانٍ يُصان.
 */

import { repo, getCurrentUser } from '../data/repository.js';
import { ENUMS, labelFor } from '../data/schema.js';
import { getUI, setUI, getTeam, getLists } from '../data/settings.js';
import { activeMembers, assignOptions, memberName, passesAssign, assignRow } from '../util/team.js';
import {
  el, clear, badge, selectEl, checkbox, openModal, confirmDialog, promptDialog, toast, emptyState,
  allChip, debounce,
} from '../util/dom.js';
import { micButton } from '../util/voice.js';
import { syncReminders } from '../util/push.js';
import {
  formatDateTime, formatNumber, formatSAR, formatArea, countWord, countOf,
  toInputDateTime, fromInputDateTime,
} from '../util/format.js';
import { matchesQuery } from '../util/arabic.js';
import { clientName } from './requests.js';

/** المراحلُ المقترَحة — **تُنشأ بضغطتك لا في صمت**، وتُسمّى وتُحذف كما تشاء بعدها. */
export const SUGGESTED_LISTS = ['سمعتُ بها', 'أتحقّق منها', 'كلّمتُ صاحبَها', 'اتّفقنا'];

// يقرأ #/prospects/<id> — نمطُ الروابط العميقة نفسُه، ويستعمله البحث العام.
function routeProspectId() {
  const m = /^#\/prospects\/([^/?#]+)/.exec(location.hash || '');
  return m ? decodeURIComponent(m[1]) : null;
}

export async function render(container) {
  const ctx = {
    container, lists: [], rows: [], clients: [], properties: [], requests: [],
    view: 'board',
    table: { status: 'open', priorities: new Set(), due: 'all', listId: '', query: '', assign: '', sort: { key: 'due', dir: 'asc' } },
  };
  const savedView = (await getUI()).prospectsView;
  ctx.view = ['single', 'table'].includes(savedView) ? savedView : 'board';
  await loadData(ctx);
  buildLayout(ctx);

  // **والبذرةُ من الوارد لا تُحفظ بنفسها**: تُملأ في صندوق الإضافة وتنتظر ضغطتك.
  let seed = '';
  try { seed = sessionStorage.getItem('kassab:quick-prospect') || ''; } catch (_) { seed = ''; }
  try { sessionStorage.removeItem('kassab:quick-prospect'); } catch (_) { /* تصفح خاص */ }
  if (seed) {
    const area = container.querySelector('.bulk-area');
    if (area) { area.value = seed; area.focus(); }
    toast('نصُّ الرسالة في صندوق الإضافة — راجعه ثمّ أضِفه', 'info', 5000);
  }

  const focusId = routeProspectId();
  if (focusId) {
    const target = ctx.rows.find((r) => r.id === focusId);
    if (target) await openProspectForm(ctx, target);
    else toast('الفرصة غير موجودة، أو حُذفت', 'error');
  }
}

async function loadData(ctx) {
  const [lists, rows, clients, properties, requests, team, settingsLists] = await Promise.all([
    repo.prospectLists.list(), repo.prospects.list(), repo.clients.list(),
    repo.properties.list(), repo.requests.list(), getTeam(), getLists(),
  ]);
  ctx.team = team;
  ctx.meId = getCurrentUser()?.id || '';
  ctx.lists = lists.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (a.order ?? 0) - (b.order ?? 0));
  ctx.rows = rows;
  ctx.clients = clients;
  ctx.properties = properties;
  ctx.requests = requests;
  ctx.settingsLists = settingsLists;
}

async function refresh(ctx) {
  syncReminders().catch(() => {});
  await loadData(ctx);
  buildLayout(ctx);
}

/* ===== أدوات ===== */

function rowsForList(ctx, listId) {
  const items = ctx.rows.filter((r) => r.listId === listId);
  const open = items.filter((r) => !r.done).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const closed = items.filter((r) => r.done).sort((a, b) => (b.doneAt || '').localeCompare(a.doneAt || ''));
  return [...open, ...closed];
}

function linkedLabel(ctx, row) {
  if (!row.linkType || !row.linkId) return null;
  if (row.linkType === 'client') {
    const c = ctx.clients.find((x) => x.id === row.linkId);
    return `👤 ${c ? clientName(c) : 'عميل محذوف'}`;
  }
  if (row.linkType === 'property') {
    const p = ctx.properties.find((x) => x.id === row.linkId);
    return `🏠 ${p ? (p.district || p.city || 'عقار') : 'عقار محذوف'}`;
  }
  if (row.linkType === 'request') {
    const r = ctx.requests.find((x) => x.id === row.linkId);
    const c = r ? ctx.clients.find((x) => x.id === r.clientId) : null;
    return `📋 ${r ? clientName(c) : 'طلب محذوف'}`;
  }
  return null;
}

/** سطرُ الموقع والسعر — **ما يُميّز فرصةً عن مهمّة**، فيظهر على البطاقة نفسِها. */
function placeLine(row) {
  const bits = [
    [row.district, row.city].filter(Boolean).join('، '),
    row.area != null ? formatArea(row.area) : '',
    row.price != null ? formatSAR(row.price) : '',
  ].filter(Boolean);
  return bits.length ? bits.join(' · ') : '';
}

async function reorder(ctx, row, dir) {
  const siblings = ctx.rows.filter((r) => r.listId === row.listId && !r.done).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const idx = siblings.findIndex((r) => r.id === row.id);
  const swapIdx = idx + dir;
  if (swapIdx < 0 || swapIdx >= siblings.length) return;
  const other = siblings[swapIdx];
  await repo.prospects.update(row.id, { order: other.order ?? 0 });
  await repo.prospects.update(other.id, { order: row.order ?? 0 });
  await refresh(ctx);
}

/**
 * **الإغلاقُ يُسأل عن مآله** — ولا تُغلق فرصةٌ بضغطةٍ صامتة.
 *
 * لأنّ أنفعَ ما في هذا السجلّ أن ترى بعد سنةٍ أنّ أكثرَ ما يفوتك يفوتك **لأنّك تأخّرت**
 * لا لأنّ السعر لم يناسب. وفتحُها من جديدٍ لا يُسأل عنه: الرجوعُ مجّانيّ.
 */
async function closeProspect(ctx, row) {
  const sel = selectEl({ options: ENUMS.prospectOutcomes.map((o) => ({ value: o.key, label: o.label })), value: 'lost' });
  const why = el('input', { class: 'input', type: 'text', maxLength: 140, placeholder: 'بكلماتك: تأخّرت · السعر · أخذها غيري' });
  return new Promise((resolve) => {
    const modal = openModal({
      title: `إغلاق «${row.title}»`,
      body: el('div', { class: 'form-grid one' },
        el('label', { class: 'field' }, el('span', { class: 'field-label', text: 'ماذا صارت إليه؟' }), sel),
        el('label', { class: 'field' }, el('span', { class: 'field-label', text: 'ولماذا؟ (اختياريّ)' }), why),
        el('p', { class: 'muted small', text: 'يبقى السجلُّ كما هو، ويُقرأ منه بعد سنةٍ ما يفوتك ولماذا.' })),
      footer: [
        el('button', {
          type: 'button', class: 'btn btn-primary', text: 'أغلقها',
          onClick: async () => {
            await repo.prospects.update(row.id, {
              done: true, doneAt: new Date().toISOString(),
              outcome: sel.value, outcomeReason: why.value.trim(),
            });
            modal.close();
            toast('أُغلقت الفرصة', 'success');
            await refresh(ctx);
            resolve(true);
          },
        }),
        el('span', { class: 'spacer' }),
        // **والتراجعُ يُعيد الرسم**: المربّعُ صار مؤشَّرًا بضغطتك قبل السؤال، فلو تراجعتَ
        // بقيت البطاقةُ تبدو مغلقةً وهي مفتوحة — **وشاشةٌ تكذب أسوأُ من شاشةٍ تتأخّر**.
        el('button', {
          type: 'button', class: 'btn btn-ghost', text: 'تراجع',
          onClick: async () => { modal.close(); await refresh(ctx); resolve(false); },
        }),
      ],
    });
  });
}

async function toggleDone(ctx, row, done) {
  if (done) { await closeProspect(ctx, row); return; }
  await repo.prospects.update(row.id, { done: false, doneAt: null, outcome: null, outcomeReason: '' });
  await refresh(ctx);
}

/**
 * **نضجت فصارت عرضًا** — بالمسار القائم نفسِه لا بثالثٍ يُخترع.
 *
 * ولا يُنشأ العقارُ هنا صامتًا: يُبذر النصُّ في نافذة اللصق بالعقارات، فتراجع وتحفظ.
 * وتبقى الفرصةُ مفتوحةً حتى تُغلقها بيدك بمآلها — **فلا يُدَّعى نجاحٌ لم يتمّ**.
 */
function toOffer(row) {
  const text = [
    row.title,
    placeLine(row),
    row.contactName || row.contactPhone ? `المالك: ${[row.contactName, row.contactPhone].filter(Boolean).join(' ')}` : '',
    row.notes,
  ].filter(Boolean).join('\n');
  try { sessionStorage.setItem('kassab:quick-offer', text); } catch (_) { /* تصفح خاص */ }
  location.hash = '#/properties?new=paste';
}

/* ===== البطاقة والعمود ===== */

function prospectCard(ctx, row) {
  const idx = ctx.lists.findIndex((l) => l.id === row.listId);
  const rightList = idx > 0 ? ctx.lists[idx - 1] : null;
  const leftList = idx < ctx.lists.length - 1 ? ctx.lists[idx + 1] : null;
  const overdue = row.dueAt && !row.done && new Date(row.dueAt).getTime() < Date.now();
  const link = linkedLabel(ctx, row);
  const place = placeLine(row);
  const outcome = row.outcome ? labelFor(ENUMS.prospectOutcomes, row.outcome) : '';

  return el('div', { class: `task-card${row.done ? ' task-done' : ''}`, 'data-prospect-id': row.id },
    el('div', { class: 'task-card-top' },
      checkbox('', { checked: row.done, onChange: (e) => toggleDone(ctx, row, e.target.checked) }),
      el('button', { type: 'button', class: 'task-title-btn', onClick: () => openProspectForm(ctx, row) }, row.title)),
    place ? el('div', { class: 'muted small', text: place }) : null,
    (row.dueAt || link || outcome) ? el('div', { class: 'task-card-meta' },
      row.dueAt ? badge(formatDateTime(row.dueAt), overdue ? 'badge-danger' : 'badge-outline') : null,
      outcome ? badge(outcome, row.outcome === 'won' ? 'badge-ok' : row.outcome === 'lost' ? 'badge-danger' : 'badge-warn') : null,
      link ? el('span', { class: 'muted small' }, link) : null) : null,
    el('div', { class: 'row task-card-actions' },
      rightList ? el('button', { type: 'button', class: 'btn btn-ghost btn-sm', title: `نقل إلى «${rightList.title}»`, text: '→', onClick: async () => { await repo.prospects.update(row.id, { listId: rightList.id }); await refresh(ctx); } }) : null,
      leftList ? el('button', { type: 'button', class: 'btn btn-ghost btn-sm', title: `نقل إلى «${leftList.title}»`, text: '←', onClick: async () => { await repo.prospects.update(row.id, { listId: leftList.id }); await refresh(ctx); } }) : null,
      !row.done ? el('button', { type: 'button', class: 'btn btn-ghost btn-sm', title: 'أعلى', text: '↑', onClick: () => reorder(ctx, row, -1) }) : null,
      !row.done ? el('button', { type: 'button', class: 'btn btn-ghost btn-sm', title: 'أسفل', text: '↓', onClick: () => reorder(ctx, row, 1) }) : null,
      !row.done ? el('button', { type: 'button', class: 'btn btn-ghost btn-sm', title: 'تصير عرضًا في مخزونك', text: 'حوّلها عرضًا', onClick: () => toOffer(row) }) : null));
}

function quickAddRow(ctx, list) {
  const input = el('input', { class: 'input', type: 'text', placeholder: '+ إضافة فرصة' });
  const add = async () => {
    const title = input.value.trim();
    if (!title) return;
    const maxOrder = ctx.rows.filter((r) => r.listId === list.id).reduce((m, r) => Math.max(m, r.order ?? 0), -1);
    input.value = '';
    await repo.prospects.create({ listId: list.id, title, order: maxOrder + 1 });
    await refresh(ctx);
  };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
  return el('div', { class: 'task-quick-add' }, input, micButton(input), el('button', { type: 'button', class: 'btn btn-sm', text: '+', onClick: add }));
}

async function removeList(ctx, list) {
  const n = ctx.rows.filter((r) => r.listId === list.id).length;
  const okDel = await confirmDialog({
    title: 'حذف القائمة', confirmText: 'حذف', danger: true,
    message: `ستُحذف قائمة «${list.title}» و${countOf(n, 'فرصة')} فيها نهائيًا. هل أنت متأكد؟`,
  });
  if (!okDel) return;
  await repo.prospectLists.remove(list.id);
  toast('حُذفت القائمة', 'success');
  await refresh(ctx);
}

async function renameList(ctx, list) {
  const title = await promptDialog({ title: 'إعادة تسمية القائمة', label: 'اسم القائمة', value: list.title, confirmText: 'حفظ' });
  if (!title) return;
  await repo.prospectLists.update(list.id, { title });
  await refresh(ctx);
}

function listColumn(ctx, list) {
  const rows = rowsForList(ctx, list.id);
  const doneCount = rows.filter((r) => r.done).length;
  return el('div', { class: `task-list-col${list.pinned ? ' task-list-pinned' : ''}` },
    el('div', { class: 'task-list-head' },
      el('button', {
        type: 'button', class: `icon-btn pin-btn${list.pinned ? ' pinned' : ''}`,
        title: list.pinned ? 'أزل التثبيت' : 'ثبّتها في الأعلى',
        'aria-pressed': list.pinned ? 'true' : 'false',
        text: list.pinned ? '📌' : '📍',
        onClick: async () => { await repo.prospectLists.update(list.id, { pinned: !list.pinned }); await refresh(ctx); },
      }),
      el('button', { type: 'button', class: 'task-list-title', title: 'إعادة تسمية', onClick: () => renameList(ctx, list) }, list.title),
      el('span', { class: 'muted small num' }, `${doneCount}/${rows.length}`),
      el('button', { type: 'button', class: 'icon-btn', title: 'حذف القائمة', text: '🗑️', onClick: () => removeList(ctx, list) })),
    el('div', { class: 'task-list-body' }, rows.length ? rows.map((r) => prospectCard(ctx, r)) : el('div', { class: 'muted small', text: 'لا فرصة بعد.' })),
    quickAddRow(ctx, list));
}

const VIEWS = [['board', 'لوحة'], ['single', 'قائمة واحدة'], ['table', 'جدول']];

function viewToggle(ctx) {
  return el('div', { class: 'seg' }, VIEWS.map(([key, label]) => el('button', {
    type: 'button', class: `seg-btn${ctx.view === key ? ' active' : ''}`, text: label,
    'data-view': key,
    onClick: async () => { ctx.view = key; await setUI({ prospectsView: key }); buildLayout(ctx); },
  })));
}

function buildLayout(ctx) {
  clear(ctx.container);
  const closed = ctx.rows.filter((r) => r.done).length;
  const won = ctx.rows.filter((r) => r.outcome === 'won').length;
  ctx.container.append(
    el('div', { class: 'page-head' },
      el('h1', {}, 'الفرص العقاريّة ',
        el('span', {
          class: 'count',
          text: `(${countWord(ctx.rows.length - closed, ['فرصةٌ واحدةٌ مفتوحة', 'فرصتان مفتوحتان', 'فرصٌ مفتوحة', 'فرصةً مفتوحة'])}`
            + ` · ${countWord(won, ['فرصةٌ واحدةٌ نضجت', 'فرصتان نضجتا', 'فرصٌ نضجت', 'فرصةً نضجت'])})`,
        })),
      el('div', { class: 'head-actions' }, viewToggle(ctx),
        el('button', {
          type: 'button', class: 'btn', text: '+ قائمة جديدة',
          onClick: async () => {
            const title = await promptDialog({ title: 'قائمة جديدة', label: 'اسم المرحلة', confirmText: 'إنشاء' });
            if (!title) return;
            await repo.prospectLists.create({ title, order: ctx.lists.length });
            await refresh(ctx);
          },
        }))),
    el('div', { class: 'notice' },
      el('strong', { text: 'بابٌ لم يُفتح بعد، لا عرضٌ في مخزونك. ' }),
      'المزادُ والورثةُ والمالكُ الذي ينوي ولم يعرض: كلُّها تُتابَع هنا ولا تُطابَق ولا تُنشَر — ',
      el('strong', { text: 'فأنت مسؤولٌ نظامًا عمّا تعرض' }),
      '. وإذا نضجت فزرُّ «حوّلها عرضًا» يفتح لصقَ العقارات بنصّها، وتُحفظ بيدك. ',
      el('span', { class: 'muted' }, 'وهي غيرُ صفحة «الفرص» التي تحسب أحياءً يطلبها عملاؤك ولا تملك فيها.')),
  );

  ctx.container.append(bulkAddBox(ctx));

  if (!ctx.lists.length) {
    ctx.container.append(emptyState(
      'لا قوائم بعد. والفرصةُ تمرّ بمراحلَ تصنعها أنت — هذه بدايةٌ تُعدَّل وتُحذف كما تشاء.',
      el('button', {
        type: 'button', class: 'btn btn-primary', text: 'أنشئ المراحل الأربع المقترَحة',
        onClick: async () => {
          for (const [i, title] of SUGGESTED_LISTS.entries()) {
            // eslint-disable-next-line no-await-in-loop
            await repo.prospectLists.create({ title, order: i });
          }
          toast('أُنشئت المراحل — سمِّها كما تشاء', 'success');
          await refresh(ctx);
        },
      })));
    return;
  }

  if (ctx.view === 'table') {
    ctx.container.append(tableView(ctx));
    return;
  }
  ctx.container.append(el('div', { class: `task-board${ctx.view === 'single' ? ' task-board-single' : ''}` },
    ctx.lists.map((l) => listColumn(ctx, l))));
}

/* ===== نموذج تعديل فرصة ===== */

function linkOptionsFor(ctx, type) {
  if (type === 'client') return ctx.clients.map((c) => ({ value: c.id, label: clientName(c) }));
  if (type === 'property') return ctx.properties.map((p) => ({ value: p.id, label: [p.district, p.city].filter(Boolean).join('، ') || 'عقار بلا موقع' }));
  if (type === 'request') return ctx.requests.map((r) => ({ value: r.id, label: clientName(ctx.clients.find((c) => c.id === r.clientId)) }));
  return [];
}

async function openProspectForm(ctx, row) {
  const errorsBox = el('div', { class: 'form-errors', hidden: true });
  const showErrors = (errors) => { clear(errorsBox); errorsBox.append(el('ul', {}, errors.map((e) => el('li', { text: e })))); errorsBox.hidden = false; };

  const titleInput = el('input', { class: 'input', type: 'text', value: row.title });
  const notesInput = el('textarea', { class: 'input', rows: 3, value: row.notes || '' });
  const listSelect = selectEl({ options: ctx.lists.map((l) => ({ value: l.id, label: l.title })), value: row.listId });
  const citySelect = selectEl({ options: (ctx.settingsLists.cities || []).map((c) => ({ value: c, label: c })), value: row.city || '', placeholder: 'بلا مدينة' });
  const districtInput = el('input', { class: 'input', type: 'text', value: row.district || '' });
  const typeSelect = selectEl({ options: (ctx.settingsLists.propertyTypes || []).map((t) => ({ value: t.key ?? t, label: t.label ?? t })), value: row.type || '', placeholder: 'بلا نوع' });
  const priceInput = el('input', { class: 'input', type: 'number', min: '0', value: row.price ?? '' });
  const areaInput = el('input', { class: 'input', type: 'number', min: '0', value: row.area ?? '' });
  const contactNameInput = el('input', { class: 'input', type: 'text', value: row.contactName || '' });
  const contactPhoneInput = el('input', { class: 'input', type: 'tel', inputMode: 'tel', value: row.contactPhone || '' });
  const sourceInput = el('input', { class: 'input', type: 'text', value: row.source || '', placeholder: 'من أين عرفتَها؟' });
  const dueInput = el('input', { class: 'input', type: 'datetime-local', value: row.dueAt ? toInputDateTime(row.dueAt) : '' });
  const clearDueBtn = el('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: 'بلا تذكير', onClick: () => { dueInput.value = ''; } });
  const prioritySelect = selectEl({
    options: ENUMS.taskPriorities.map((x) => ({ value: x.key, label: x.label })),
    value: row.priority || 'normal',
  });

  const members = activeMembers(ctx.team || []);
  const assignSelect = selectEl({
    options: assignOptions(ctx.team || [], row.assignedTo || ''),
    value: row.assignedTo || '', placeholder: 'بلا مسند',
  });

  const linkTypeSelect = selectEl({
    options: ENUMS.linkTypes.map((t) => ({ value: t.key, label: t.label })), value: row.linkType || '', placeholder: 'بلا ربط',
  });
  const linkIdWrap = el('div', { class: 'field' });
  let currentLinkId = row.linkId || null;
  function renderLinkOptions() {
    clear(linkIdWrap);
    const type = linkTypeSelect.value;
    if (!type) return;
    const sel = selectEl({ options: linkOptionsFor(ctx, type), value: type === row.linkType ? (currentLinkId || '') : '', placeholder: 'اختر…' });
    sel.addEventListener('change', () => { currentLinkId = sel.value || null; });
    currentLinkId = sel.value || null;
    linkIdWrap.append(sel);
  }
  linkTypeSelect.addEventListener('change', renderLinkOptions);
  renderLinkOptions();

  const deleteBtn = el('button', {
    type: 'button', class: 'btn btn-ghost btn-danger', text: 'حذف الفرصة',
    onClick: async () => {
      const okDel = await confirmDialog({ title: 'حذف الفرصة', message: 'ستُحذف نهائيًا. هل أنت متأكد؟', confirmText: 'حذف', danger: true });
      if (!okDel) return;
      await repo.prospects.remove(row.id);
      modal.close();
      toast('حُذفت الفرصة', 'success');
      await refresh(ctx);
    },
  });

  const offerBtn = el('button', {
    type: 'button', class: 'btn btn-ghost', text: 'حوّلها عرضًا',
    onClick: () => { modal.close(); toOffer(row); },
  });

  const saveBtn = el('button', {
    type: 'button', class: 'btn btn-primary', text: 'حفظ',
    onClick: async () => {
      const newDueAt = fromInputDateTime(dueInput.value);
      const patch = {
        title: titleInput.value, notes: notesInput.value, listId: listSelect.value,
        city: citySelect.value, district: districtInput.value, type: typeSelect.value,
        price: priceInput.value === '' ? null : Number(priceInput.value),
        area: areaInput.value === '' ? null : Number(areaInput.value),
        contactName: contactNameInput.value, contactPhone: contactPhoneInput.value,
        source: sourceInput.value,
        dueAt: newDueAt, priority: prioritySelect.value,
        ...(members.length > 1 ? { assignedTo: assignSelect.value || null } : {}),
        linkType: linkTypeSelect.value || null, linkId: linkTypeSelect.value ? currentLinkId : null,
      };
      if (newDueAt !== row.dueAt) patch.reminded = false;
      saveBtn.disabled = true;
      try {
        await repo.prospects.update(row.id, patch);
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

  const field = (label, control) => el('label', { class: 'field' }, el('span', { class: 'field-label', text: label }), control);

  const body = el('div', {},
    errorsBox,
    el('div', { class: 'form-grid one' },
      field('العنوان', titleInput),
      field('القائمة (المرحلة)', listSelect),
      field('المدينة', citySelect),
      field('الحي', districtInput),
      field('نوع العقار', typeSelect),
      field('السعر المتوقَّع (ر.س)', priceInput),
      field('المساحة (م²)', areaInput),
      field('صاحبُها', contactNameInput),
      field('جوّالُه', contactPhoneInput),
      field('من أين جاءت؟', sourceInput),
      field('تذكير بتاريخ ووقت', el('div', { class: 'field-row' }, dueInput, clearDueBtn)),
      field('الأولوية', prioritySelect),
      members.length > 1 ? field('مُسندة إلى', assignSelect) : null,
      field('ربط بسجل آخر', linkTypeSelect),
      linkIdWrap,
      field('ملاحظات', notesInput)),
    row.done && row.outcomeReason
      ? el('p', { class: 'muted small' }, el('strong', { text: 'أُغلقت: ' }), `${labelFor(ENUMS.prospectOutcomes, row.outcome)} — ${row.outcomeReason}`)
      : null);

  const modal = openModal({
    title: 'تعديل الفرصة', body,
    footer: [deleteBtn, offerBtn, el('span', { class: 'spacer' }),
      el('button', { type: 'button', class: 'btn btn-ghost', text: 'إلغاء', onClick: () => modal.close() }), saveBtn],
  });
}

/* ===== إضافةُ دفعةٍ: سطرٌ لكلّ فرصة ===== */

/**
 * **ولا توزيعَ آليًّا هنا** خلافًا للمهامّ: المهمّةُ يُقرأ من سطرها موعدُها وموضوعُها،
 * والفرصةُ لا يُقرأ من سطرها شيءٌ يُعتدّ به — **فسؤالُك عن قائمةٍ واحدةٍ أصدقُ من
 * تخمينٍ يُراجَع**. وما زاد على ذلك تُتمّه في بطاقتها.
 */
function bulkAddBox(ctx) {
  const area = el('textarea', {
    class: 'input bulk-area', rows: 3,
    placeholder: 'فرصة في كل سطر، ثم إنتر:\nأرض ورثة في الملقا ٦٠٠م\nمزاد على عمارة بالسليمانية الخميس\nأبو سعد ينوي يبيع فلته بحطين',
    'aria-label': 'إضافة فرص دفعة واحدة',
  });
  const preview = el('div', { class: 'bulk-preview' });
  let rows = [];
  let listId = ctx.lists[0]?.id || '';

  const propose = () => {
    rows = area.value.split('\n').map((s) => s.trim()).filter(Boolean).map((title) => ({ title }));
    drawPreview();
  };

  area.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
    e.preventDefault();
    propose();
  });

  const drawPreview = () => {
    clear(preview);
    if (!rows.length) return;

    preview.append(el('div', { class: 'notice' },
      el('strong', { text: `${countOf(rows.length, 'سطر')} — ` }),
      'راجعها وعدّل ما شئت، ثم اعتمدها. ولا يُحفظ شيءٌ قبل ذلك.'));

    const listSelect = ctx.lists.length
      ? selectEl({
        options: ctx.lists.map((l) => ({ value: l.id, label: l.title })), value: listId,
        onChange: (e) => { listId = e.target.value; },
      })
      : el('input', { class: 'input', type: 'text', value: 'سمعتُ بها', 'aria-label': 'اسم القائمة التي ستُنشأ' });

    const body = el('tbody');
    rows.forEach((r, i) => {
      const titleInput = el('input', { class: 'input', type: 'text', value: r.title });
      titleInput.addEventListener('input', () => { rows[i].title = titleInput.value; });
      body.append(el('tr', {},
        el('td', {}, titleInput),
        el('td', {}, el('button', {
          type: 'button', class: 'icon-btn', title: 'استبعد هذا السطر', text: '✕',
          onClick: () => { rows.splice(i, 1); drawPreview(); },
        }))));
    });

    preview.append(
      el('div', { class: 'row', style: { gap: '8px', flexWrap: 'wrap', marginBottom: '8px' } },
        el('span', { class: 'filter-label', text: 'تدخل في قائمة' }), listSelect),
      el('div', { class: 'table-wrap' },
        el('table', { class: 'table bulk-table' },
          el('thead', {}, el('tr', {}, ['الفرصة', ''].map((h) => el('th', { text: h })))),
          body)),
      el('div', { class: 'row', style: { marginTop: '10px' } },
        el('button', {
          type: 'button', class: 'btn btn-primary',
          text: `اعتمد وأضِف ${formatNumber(rows.length)}`,
          onClick: async () => {
            const chosen = rows.filter((r) => r.title.trim());
            if (!chosen.length) { toast('لا سطر صالحًا للإضافة', 'error'); return; }
            let target = listId;
            if (!target) {
              const title = String(listSelect.value || 'سمعتُ بها').trim() || 'سمعتُ بها';
              const made = await repo.prospectLists.create({ title, order: 0 });
              target = made.id;
            }
            const base = ctx.rows.filter((r) => r.listId === target).reduce((m, r) => Math.max(m, r.order ?? 0), -1);
            for (const [i, r] of chosen.entries()) {
              // eslint-disable-next-line no-await-in-loop
              await repo.prospects.create({ listId: target, title: r.title.trim(), order: base + 1 + i });
            }
            area.value = '';
            rows = [];
            toast(`أُضيفت ${countOf(chosen.length, 'فرصة')}`, 'success');
            await refresh(ctx);
          },
        }),
        el('button', { type: 'button', class: 'btn btn-ghost', text: 'ألغِ الاقتراح', onClick: () => { rows = []; drawPreview(); } })));
  };

  return el('section', { class: 'panel bulk-add' },
    el('h2', { text: 'أضِف فرصًا دفعةً' }),
    el('p', { class: 'panel-desc' },
      'فرصة في كل سطر، ثم إنتر (وShift+إنتر لسطرٍ جديد). ',
      el('strong', { text: 'وتدخل كلُّها في قائمةٍ واحدةٍ تختارها' }),
      ' — ثمّ تُتمّ الموقعَ والسعرَ وصاحبَها في بطاقتها.'),
    el('div', { class: 'row' }, area, micButton(area)),
    el('div', { class: 'row', style: { marginTop: '8px' } },
      el('button', { type: 'button', class: 'btn', text: 'اقرأ الأسطر', onClick: propose })),
    preview);
}

/* ===== عرض الجدول ===== */

const DUE_FILTERS = [
  { key: 'all', label: 'كل المواعيد' },
  { key: 'overdue', label: 'متأخّرة' },
  { key: 'today', label: 'اليوم' },
  { key: 'week', label: 'هذا الأسبوع' },
  { key: 'none', label: 'بلا موعد' },
];

const COLUMNS = [
  { key: 'done', label: '', sort: null },
  { key: 'title', label: 'الفرصة', sort: (r) => r.title || '' },
  { key: 'place', label: 'الموقع', sort: (r) => [r.city, r.district].filter(Boolean).join(' ') },
  { key: 'price', label: 'السعر المتوقَّع', sort: (r) => (r.price ?? Number.POSITIVE_INFINITY), num: true },
  { key: 'priority', label: 'الأولوية', sort: (r) => ENUMS.taskPriorities.find((p) => p.key === r.priority)?.rank ?? 9, num: true },
  { key: 'due', label: 'المتابعة', sort: (r) => r.dueAt || '￿' },
  { key: 'list', label: 'المرحلة', sort: (r, ctx) => ctx.lists.find((l) => l.id === r.listId)?.title || '' },
  { key: 'outcome', label: 'المآل', sort: (r) => r.outcome || '￿' },
  { key: 'assign', label: 'مُسندة إلى', team: true, sort: (r, ctx) => memberName(ctx.team, r.assignedTo, { me: ctx.meId }) || '￿' },
];

const columnsFor = (ctx) => COLUMNS.filter((c) => !c.team || activeMembers(ctx.team || []).length > 1);

function dueBucket(row, now = Date.now()) {
  if (!row.dueAt) return 'none';
  const t = new Date(row.dueAt).getTime();
  if (!Number.isFinite(t)) return 'none';
  if (t < now && !row.done) return 'overdue';
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  if (t <= end.getTime()) return 'today';
  return t <= end.getTime() + 6 * 86400000 ? 'week' : 'later';
}

function tableRows(ctx) {
  const f = ctx.table;
  let rows = ctx.rows.slice();
  if (f.status === 'open') rows = rows.filter((r) => !r.done);
  else if (f.status === 'done') rows = rows.filter((r) => r.done);
  if (f.priorities.size) rows = rows.filter((r) => f.priorities.has(r.priority || 'normal'));
  if (f.listId) rows = rows.filter((r) => r.listId === f.listId);
  rows = rows.filter((r) => passesAssign(r, f.assign, ctx.meId));
  if (f.due !== 'all') {
    const now = Date.now();
    rows = rows.filter((r) => (f.due === 'week'
      ? ['today', 'week', 'overdue'].includes(dueBucket(r, now))
      : dueBucket(r, now) === f.due));
  }
  if (f.query.trim()) rows = rows.filter((r) => matchesQuery(r.searchKey, f.query.trim()));
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

    const search = el('input', { class: 'input search', type: 'search', value: f.query, placeholder: 'ابحث في الفرص…' });
    search.addEventListener('input', debounce(() => { f.query = search.value; redraw(); }, 200));

    const statusSeg = el('div', { class: 'seg' }, [['open', 'المفتوحة'], ['done', 'المغلقة'], ['all', 'الكل']]
      .map(([key, label]) => el('button', {
        type: 'button', class: `seg-btn${f.status === key ? ' active' : ''}`, text: label,
        onClick: () => { f.status = key; redrawAll(); },
      })));

    const prChips = el('div', { class: 'chips' });
    prChips.append(allChip(f.priorities, ENUMS.taskPriorities.map((p) => p.key), redrawAll));
    for (const p of ENUMS.taskPriorities) {
      const n = ctx.rows.filter((r) => (r.priority || 'normal') === p.key && (f.status !== 'open' || !r.done)).length;
      const active = f.priorities.has(p.key);
      prChips.append(el('button', {
        type: 'button', class: `chip${active ? ' active' : ''}${n === 0 && !active ? ' zero' : ''}`,
        onClick: () => { if (active) f.priorities.delete(p.key); else f.priorities.add(p.key); redrawAll(); },
      }, p.label, el('span', { class: 'chip-count', text: String(n) })));
    }

    const assignChips = assignRow({
      rows: ctx.rows.filter((r) => f.status !== 'open' || !r.done),
      team: ctx.team || [], meId: ctx.meId, value: f.assign || '',
      onPick: (v) => { f.assign = v; redrawAll(); },
      el, formatNumber,
    });

    const dueSelect = selectEl({
      options: DUE_FILTERS.map((d) => ({ value: d.key, label: d.label })), value: f.due,
      onChange: (e) => { f.due = e.target.value; redrawAll(); },
    });
    const listSelect = selectEl({
      options: ctx.lists.map((l) => ({ value: l.id, label: l.title })), value: f.listId, placeholder: 'كل المراحل',
      onChange: (e) => { f.listId = e.target.value; redrawAll(); },
    });

    filters.append(
      el('div', { class: 'row', style: { flexWrap: 'wrap', gap: '8px', marginBottom: '8px' } },
        search, statusSeg, dueSelect, listSelect),
      el('div', { class: 'filter-row' }, el('span', { class: 'filter-label', text: 'الأولوية' }), prChips),
      assignChips);
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

  if (!rows.length) return el('div', {}, el('p', { class: 'muted small', text: 'لا فرصة تطابق الفرز المختار.' }));

  return el('div', {},
    el('p', { class: 'muted small', text: `${formatNumber(rows.length)} من ${countOf(ctx.rows.length, 'فرصة')}` }),
    el('div', { class: 'table-wrap' },
      el('table', { class: 'table tasks-table' },
        el('thead', {}, head),
        el('tbody', {}, rows.map((r) => tableRow(ctx, r))))));
}

function tableRow(ctx, row) {
  const pr = ENUMS.taskPriorities.find((p) => p.key === (row.priority || 'normal'));
  const bucket = dueBucket(row);
  const list = ctx.lists.find((l) => l.id === row.listId);
  return el('tr', { class: row.done ? 'task-row-done' : '' },
    el('td', {}, checkbox('', { checked: row.done, onChange: (e) => toggleDone(ctx, row, e.target.checked) })),
    el('td', {}, el('button', { type: 'button', class: 'task-title-btn', onClick: () => openProspectForm(ctx, row) }, row.title)),
    el('td', { text: [row.district, row.city].filter(Boolean).join('، ') || '—' }),
    el('td', { class: 'num', text: row.price != null ? formatSAR(row.price) : '—' }),
    el('td', {}, badge(pr?.label || '—', pr?.cls || 'badge-outline')),
    el('td', {}, row.dueAt
      ? badge(formatDateTime(row.dueAt), bucket === 'overdue' ? 'badge-danger' : bucket === 'today' ? 'badge-warn' : 'badge-outline')
      : el('span', { class: 'muted', text: '—' })),
    el('td', { text: list?.title || '—' }),
    el('td', { text: row.outcome ? labelFor(ENUMS.prospectOutcomes, row.outcome) : '—' }),
    activeMembers(ctx.team || []).length > 1
      ? el('td', { text: row.assignedTo ? memberName(ctx.team, row.assignedTo, { me: ctx.meId }) : '—' })
      : null);
}
