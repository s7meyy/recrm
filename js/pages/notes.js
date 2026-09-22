// صفحة "الأفكار والملاحظات" (المرحلة ٧) — التقاط حر بلا حقول إلزامية (كقوقل كيب)، تنظيم لاحق
// اختياري (تثبيت، لون، وسوم)، وتحويل أي فكرة إلى مهمة بزر واحد. لا فرز تلقائي معقّد: المثبَّتة
// أولًا، ثم الأحدث تعديلًا.

import { repo } from '../data/repository.js';
import { el, clear, badge, selectEl, openModal, confirmDialog, toast, emptyState } from '../util/dom.js';
import { micButton } from '../util/voice.js';
import { relativeDays } from '../util/format.js';
import { clientName } from './requests.js';

const NOTE_COLORS = [null, '#fff3bf', '#d0ebff', '#d3f9d8', '#ffdeeb', '#ffe8cc'];

function routeNoteId() {
  const m = /^#\/notes\/([^/?#]+)/.exec(location.hash || '');
  return m ? decodeURIComponent(m[1]) : null;
}

export async function render(container) {
  const ctx = { container, notes: [], clients: [], properties: [], requests: [], taskLists: [], showArchived: false, query: '', pendingTags: [] };
  await loadData(ctx);
  buildLayout(ctx);
  seedFromInbox(ctx);
  const focusId = routeNoteId();
  if (focusId) {
    const target = ctx.notes.find((n) => n.id === focusId);
    if (!target) { toast('الفكرة غير موجودة، أو حُذفت', 'error'); return; }
    if (target.archived) { ctx.showArchived = true; buildLayout(ctx); }
    const cardEl = container.querySelector(`[data-note-id="${focusId}"]`);
    if (cardEl) {
      cardEl.scrollIntoView({ block: 'center', behavior: 'smooth' });
      cardEl.classList.add('note-highlight');
      setTimeout(() => cardEl.classList.remove('note-highlight'), 2000);
    }
  }
}

async function loadData(ctx) {
  const [notes, clients, properties, requests, taskLists] = await Promise.all([
    repo.notes.list(), repo.clients.list(), repo.properties.list(), repo.requests.list(), repo.taskLists.list(),
  ]);
  ctx.notes = notes;
  ctx.clients = clients;
  ctx.properties = properties;
  ctx.requests = requests;
  ctx.taskLists = taskLists.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

async function refresh(ctx) {
  await loadData(ctx);
  buildLayout(ctx);
}

function linkedLabel(ctx, note) {
  if (!note.linkType || !note.linkId) return null;
  if (note.linkType === 'client') { const c = ctx.clients.find((x) => x.id === note.linkId); return `👤 ${c ? clientName(c) : 'عميل محذوف'}`; }
  if (note.linkType === 'property') { const p = ctx.properties.find((x) => x.id === note.linkId); return `🏠 ${p ? (p.district || p.city || 'عقار') : 'عقار محذوف'}`; }
  if (note.linkType === 'request') { const r = ctx.requests.find((x) => x.id === note.linkId); const c = r ? ctx.clients.find((x) => x.id === r.clientId) : null; return `📋 ${r ? clientName(c) : 'طلب محذوف'}`; }
  return null;
}

async function convertToTask(ctx, note) {
  if (!ctx.taskLists.length) { toast('أنشئ قائمة مهام أولًا من صفحة المهام', 'error', 6000); return; }
  const listSelect = selectEl({ options: ctx.taskLists.map((l) => ({ value: l.id, label: l.title })), value: ctx.taskLists[0].id });
  const confirmBtn = el('button', {
    type: 'button', class: 'btn btn-primary', text: 'تحويل',
    onClick: async () => {
      const listId = listSelect.value;
      const tasksInList = (await repo.tasks.list()).filter((t) => t.listId === listId);
      const maxOrder = tasksInList.reduce((m, t) => Math.max(m, t.order ?? 0), -1);
      const title = note.text.length > 120 ? `${note.text.slice(0, 117)}…` : note.text;
      await repo.tasks.create({
        listId, title, notes: note.text.length > 120 ? note.text : '', order: maxOrder + 1,
        linkType: note.linkType, linkId: note.linkId,
      });
      await repo.notes.update(note.id, { archived: true });
      modal.close();
      toast('حُوِّلت إلى مهمة', 'success');
      await refresh(ctx);
    },
  });
  const modal = openModal({
    title: 'تحويل إلى مهمة', body: el('label', { class: 'field' }, el('span', { class: 'field-label', text: 'أضفها إلى قائمة' }), listSelect),
    footer: [el('button', { type: 'button', class: 'btn btn-ghost', text: 'إلغاء', onClick: () => modal.close() }), confirmBtn],
  });
}

function noteCard(ctx, note) {
  const textArea = el('textarea', { class: 'note-text', value: note.text, rows: 3 });
  textArea.addEventListener('input', () => { textArea.style.height = 'auto'; textArea.style.height = `${textArea.scrollHeight}px`; });
  textArea.addEventListener('blur', async () => {
    const text = textArea.value.trim();
    if (!text) { textArea.value = note.text; toast('لا يمكن ترك الفكرة فارغة', 'error'); return; }
    if (text === note.text) return;
    try { await repo.notes.update(note.id, { text }); note.text = text; } catch (err) { toast(err.message || 'تعذر الحفظ', 'error'); textArea.value = note.text; }
  });

  const link = linkedLabel(ctx, note);
  const card = el('div', { class: 'note-card', 'data-note-id': note.id, style: { background: note.color || 'var(--surface)' } },
    el('div', { class: 'note-card-top' },
      note.pinned ? badge('مثبَّتة', 'badge-accent') : null,
      link ? el('span', { class: 'muted small' }, link) : null,
      el('div', { class: 'row', style: { marginInlineStart: 'auto' } },
        el('button', { type: 'button', class: 'icon-btn', title: note.pinned ? 'إلغاء التثبيت' : 'تثبيت', text: note.pinned ? '📌' : '📍', onClick: async () => { await repo.notes.update(note.id, { pinned: !note.pinned }); await refresh(ctx); } }),
        el('button', { type: 'button', class: 'icon-btn', title: note.archived ? 'استرجاع' : 'أرشفة', text: note.archived ? '↩️' : '🗄️', onClick: async () => { await repo.notes.update(note.id, { archived: !note.archived }); await refresh(ctx); } }),
        el('button', {
          type: 'button', class: 'icon-btn', title: 'حذف', text: '🗑️',
          onClick: async () => {
            const ok = await confirmDialog({ title: 'حذف الفكرة', message: 'ستُحذف نهائيًا. هل أنت متأكد؟', confirmText: 'حذف', danger: true });
            if (!ok) return;
            await repo.notes.remove(note.id);
            toast('حُذفت', 'success');
            await refresh(ctx);
          },
        }))),
    textArea,
    note.tags.length ? el('div', { class: 'row' }, note.tags.map((t) => badge(t))) : null,
    el('div', { class: 'row note-colors' }, NOTE_COLORS.map((c) => el('button', {
      type: 'button', class: `note-color-dot${(note.color || null) === c ? ' active' : ''}`,
      style: { background: c || '#ffffff' }, title: c ? 'اختر هذا اللون' : 'بلا لون',
      onClick: async () => { await repo.notes.update(note.id, { color: c }); await refresh(ctx); },
    }))),
    !note.archived ? el('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: '✔ حوّل إلى مهمة', onClick: () => convertToTask(ctx, note) }) : null);
  return card;
}

/**
 * **بذرةٌ من «الوارد»** (المرحلة ٥٣) — فكرةٌ أو مقترَحٌ حوّلتَه إلى بوتك.
 *
 * **ولا تُحفظ بنفسها**: تُملأ في صندوق الالتقاط وتنتظر ضغطتك، كما يفعل الطلبُ والعرض
 * منذ المرحلة ٥١. وقاعدةُ النظام منذ المرحلة ٤ أنّ **لا شيءَ يدخل قاعدتَك بلا ضغطتك**.
 * والوسمُ يأتي معها فيُفرَّق المقترَحُ من الفكرة في صفحةٍ واحدة بلا مخزنٍ ثالث.
 */
function seedFromInbox(ctx) {
  let raw = '';
  try { raw = sessionStorage.getItem('kassab:quick-note') || ''; } catch (_) { raw = ''; }
  try { sessionStorage.removeItem('kassab:quick-note'); } catch (_) { /* تصفح خاص */ }
  if (!raw) return;
  let seed = null;
  try { seed = JSON.parse(raw); } catch (_) { seed = { text: raw, tags: [] }; }
  if (!seed?.text) return;
  ctx.pendingTags = Array.isArray(seed.tags) ? seed.tags : [];
  const input = ctx.container.querySelector('.note-quick-input');
  if (input) { input.value = seed.text; input.focus(); }
  toast('نصُّ الرسالة في صندوق الالتقاط — راجعه ثمّ احفظه', 'info', 5000);
}

function quickCapture(ctx) {
  const input = el('textarea', { class: 'input note-quick-input', rows: 2, placeholder: 'اكتب فكرة أو ملاحظة سريعة… (Ctrl+Enter للحفظ)' });
  const save = async () => {
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    const tags = ctx.pendingTags || [];
    ctx.pendingTags = [];
    await repo.notes.create({ text, tags });
    await refresh(ctx);
  };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); save(); } });
  // زر الإملاء (المرحلة ١١) يظهر فقط حين يدعمه المتصفح.
  return el('div', { class: 'note-quick-capture' }, input,
    el('div', { class: 'row' }, micButton(input), el('button', { type: 'button', class: 'btn btn-primary', text: 'حفظ', onClick: save })));
}

function buildLayout(ctx) {
  clear(ctx.container);
  ctx.container.append(
    el('div', { class: 'page-head' },
      el('h1', { text: 'الأفكار والملاحظات' }),
      el('div', { class: 'head-actions' },
        el('label', { class: 'check' },
          el('input', { type: 'checkbox', checked: ctx.showArchived, onChange: (e) => { ctx.showArchived = e.target.checked; buildLayout(ctx); } }),
          el('span', { text: 'إظهار المؤرشفة' })))));

  ctx.container.append(quickCapture(ctx));

  const visible = ctx.notes
    .filter((n) => (ctx.showArchived ? n.archived : !n.archived))
    .sort((a, b) => (b.pinned - a.pinned) || (b.updatedAt || '').localeCompare(a.updatedAt || ''));

  if (!visible.length) {
    ctx.container.append(emptyState(ctx.showArchived ? 'لا أفكار مؤرشفة.' : 'لا أفكار بعد — اكتب أول فكرة أعلاه.'));
    return;
  }
  ctx.container.append(el('div', { class: 'notes-grid' }, visible.map((n) => noteCard(ctx, n))));
}
