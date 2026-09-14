// صفحة المصاريف (المرحلة ١٣): الإيراد بلا مصروف ليس ربحًا.
//
// كيان بسيط عمدًا (تاريخ، مبلغ، تصنيف، ملاحظة، ربط اختياري بصفقة أو عقار) — لا محاسبة
// مزدوجة ولا مراكز تكلفة؛ الغرض أن يصير رقم الداشبورد **صافي ربح** لا إيرادًا.

import { repo, ValidationError } from '../data/repository.js';
import { ENUMS, labelFor } from '../data/schema.js';
import { getLists, typeLabel } from '../data/settings.js';
import {
  el, clear, labeled, selectEl, badge, openModal, confirmDialog, toast, emptyState, debounce,
} from '../util/dom.js';
import { formatSAR, formatDate, formatNumber, toInputDate, fromInputDate } from '../util/format.js';
import { matchesQuery } from '../util/arabic.js';

const categoryLabel = (key) => labelFor(ENUMS.expenseCategories, key);

export async function render(container) {
  const ctx = { container, query: '', category: '', months: 6, nodes: {} };
  await loadData(ctx);
  build(ctx);
}

async function loadData(ctx) {
  const [expenses, deals, properties, lists] = await Promise.all([
    repo.expenses.list(), repo.deals.list(), repo.properties.list(), getLists(),
  ]);
  expenses.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  ctx.expenses = expenses;
  ctx.deals = deals;
  ctx.properties = properties;
  ctx.lists = lists;
}

async function refresh(ctx) {
  await loadData(ctx);
  renderSummary(ctx);
  renderList(ctx);
}

/** ملخّص شهري: عمولاتك ناقص مصاريفك = صافي الربح. */
export function monthlySummary({ expenses = [], deals = [], months = 6 } = {}, now = new Date()) {
  const key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const buckets = new Map();
  for (let i = 0; i < months; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.set(key(d), { month: key(d), commission: 0, expenses: 0, net: 0 });
  }
  const add = (iso, field, value) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return;
    const bucket = buckets.get(key(d));
    if (bucket) bucket[field] += Number(value) || 0;
  };
  for (const deal of deals) add(deal.date, 'commission', deal.commission);
  for (const e of expenses) add(e.date, 'expenses', e.amount);
  const rows = [...buckets.values()].map((b) => ({ ...b, net: b.commission - b.expenses }));
  return rows;
}

function build(ctx) {
  clear(ctx.container);
  ctx.nodes.count = el('span', { class: 'count' });
  const search = el('input', {
    class: 'input search', type: 'search', placeholder: 'بحث في الملاحظات…',
    onInput: debounce((e) => { ctx.query = e.target.value.trim(); renderList(ctx); }, 150),
  });
  const categoryFilter = selectEl({
    options: [{ value: '', label: 'كل التصنيفات' }, ...ENUMS.expenseCategories.map((c) => ({ value: c.key, label: c.label }))],
    value: '', onChange: (e) => { ctx.category = e.target.value; renderList(ctx); },
  });

  ctx.container.append(
    el('div', { class: 'page-head' },
      el('h1', {}, 'المصاريف ', ctx.nodes.count),
      el('div', { class: 'head-actions' }, search,
        el('button', { type: 'button', class: 'btn btn-primary', text: '+ مصروف', onClick: () => openForm(ctx, null) }))),
    el('div', { class: 'toolbar' }, categoryFilter));

  ctx.nodes.summary = el('div');
  ctx.nodes.list = el('div');
  ctx.container.append(ctx.nodes.summary, ctx.nodes.list);
  renderSummary(ctx);
  renderList(ctx);
}

function renderSummary(ctx) {
  const rows = monthlySummary({ expenses: ctx.expenses, deals: ctx.deals, months: ctx.months });
  const area = ctx.nodes.summary;
  clear(area);
  const current = rows[0];
  area.append(el('div', { class: 'stat-strip' },
    stat(formatSAR(current.commission), 'عمولات هذا الشهر'),
    stat(formatSAR(current.expenses), 'مصاريف هذا الشهر'),
    stat(formatSAR(current.net), current.net < 0 ? 'خسارة هذا الشهر' : 'صافي ربح هذا الشهر')));

  area.append(el('div', { class: 'table-wrap' }, el('table', { class: 'table' },
    el('thead', {}, el('tr', {}, ['الشهر', 'العمولات', 'المصاريف', 'صافي الربح'].map((t) => el('th', { text: t })))),
    el('tbody', {}, rows.map((r) => el('tr', {},
      el('td', { text: r.month }),
      el('td', { class: 'num', text: formatSAR(r.commission) }),
      el('td', { class: 'num', text: formatSAR(r.expenses) }),
      el('td', {}, badge(formatSAR(r.net), r.net < 0 ? 'badge-danger' : 'badge-ok'))))))));
  area.append(el('p', { class: 'muted small', text: 'صافي الربح = عمولاتك من الصفقات − مصاريفك. سعر البيع نفسه ليس دخلك، فلا يدخل هنا.' }));
}

function stat(value, label) {
  return el('div', { class: 'stat-chip' },
    el('div', { class: 'stat-num', text: value }),
    el('div', { class: 'stat-label', text: label }));
}

function renderList(ctx) {
  const items = ctx.expenses.filter((e) => (!ctx.category || e.category === ctx.category)
    && (!ctx.query || matchesQuery(e.searchKey || '', ctx.query)));
  ctx.nodes.count.textContent = `(${items.length}${items.length === ctx.expenses.length ? '' : ` من ${ctx.expenses.length}`})`;
  const area = ctx.nodes.list;
  clear(area);
  if (!ctx.expenses.length) {
    area.append(emptyState('لا مصاريف مسجّلة بعد. سجّل وقودك وإعلاناتك ليصير رقم الأرباح صادقًا.'));
    return;
  }
  if (!items.length) { area.append(emptyState('لا نتائج.')); return; }

  area.append(el('div', { class: 'table-wrap' }, el('table', { class: 'table' },
    el('thead', {}, el('tr', {}, ['التاريخ', 'التصنيف', 'المبلغ', 'الملاحظة', 'مرتبط بـ', ''].map((t) => el('th', { text: t })))),
    el('tbody', {}, items.map((e) => el('tr', { onClick: () => openForm(ctx, e) },
      el('td', { text: formatDate(e.date) }),
      el('td', {}, badge(categoryLabel(e.category))),
      el('td', { class: 'num strong', text: formatSAR(e.amount) }),
      el('td', { text: e.note || '—' }),
      el('td', { text: linkedLabel(ctx, e) }),
      el('td', {}, el('button', {
        type: 'button', class: 'icon-btn', text: '✕', title: 'حذف',
        onClick: async (ev) => {
          ev.stopPropagation();
          const ok = await confirmDialog({ title: 'حذف المصروف', message: `حذف مصروف ${formatSAR(e.amount)}؟`, confirmText: 'حذف', danger: true });
          if (!ok) return;
          await repo.expenses.remove(e.id);
          toast('حُذف المصروف', 'success');
          await refresh(ctx);
        },
      }))))))));
}

function linkedLabel(ctx, e) {
  if (e.dealId) {
    const deal = ctx.deals.find((d) => d.id === e.dealId);
    return deal ? `صفقة ${formatDate(deal.date)}` : 'صفقة محذوفة';
  }
  if (e.propertyId) {
    const p = ctx.properties.find((x) => x.id === e.propertyId);
    return p ? `${typeLabel(ctx.lists, p.type)} — ${p.district || p.city || ''}` : 'عقار محذوف';
  }
  return '—';
}

async function openForm(ctx, existing) {
  const isEdit = !!existing;
  const draft = existing ? { ...existing } : { ...repo.expenses.defaults(), date: new Date().toISOString() };
  const errorsBox = el('div', { class: 'form-errors', hidden: true });

  const dateInput = el('input', { class: 'input', type: 'date', value: toInputDate(draft.date || null) });
  const amountInput = el('input', { class: 'input', type: 'number', min: '0', step: '1', value: draft.amount ?? '' });
  const categorySelect = selectEl({
    options: ENUMS.expenseCategories.map((c) => ({ value: c.key, label: c.label })), value: draft.category || 'other',
  });
  const noteInput = el('input', { class: 'input', type: 'text', value: draft.note || '', placeholder: 'تفصيل قصير' });
  const dealSelect = selectEl({
    options: [...ctx.deals].sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      .map((d) => ({ value: d.id, label: `${formatDate(d.date)} — ${formatSAR(d.finalPrice)}` })),
    value: draft.dealId || '', placeholder: 'غير مرتبط بصفقة',
  });

  const saveBtn = el('button', { type: 'button', class: 'btn btn-primary', text: isEdit ? 'حفظ' : 'إضافة' });
  saveBtn.addEventListener('click', async () => {
    errorsBox.hidden = true;
    const data = {
      date: fromInputDate(dateInput.value),
      amount: amountInput.value === '' ? null : Number(amountInput.value),
      category: categorySelect.value, note: noteInput.value,
      dealId: dealSelect.value || null, propertyId: draft.propertyId || null,
    };
    saveBtn.disabled = true;
    try {
      if (isEdit) await repo.expenses.update(existing.id, data);
      else await repo.expenses.create(data);
      modal.close();
      toast(isEdit ? 'تم الحفظ' : 'أُضيف المصروف', 'success');
      await refresh(ctx);
    } catch (err) {
      clear(errorsBox);
      errorsBox.append(el('ul', {}, (err instanceof ValidationError ? err.errors : [err.message]).map((m) => el('li', { text: m }))));
      errorsBox.hidden = false;
    } finally {
      saveBtn.disabled = false;
    }
  });

  const modal = openModal({
    title: isEdit ? 'تعديل مصروف' : 'مصروف جديد',
    body: el('div', {}, errorsBox, el('div', { class: 'form-grid' },
      labeled('التاريخ', dateInput, { required: true }),
      labeled('المبلغ (ريال)', amountInput, { required: true }),
      labeled('التصنيف', categorySelect),
      labeled('مرتبط بصفقة', dealSelect, { hint: 'اختياري — يفيد في معرفة تكلفة كل صفقة' }),
      labeled('ملاحظة', noteInput, { full: true }))),
    footer: [
      el('button', { type: 'button', class: 'btn btn-ghost', text: 'إلغاء', onClick: () => modal.close() }),
      saveBtn,
    ],
  });
  setTimeout(() => amountInput.focus(), 0);
}
