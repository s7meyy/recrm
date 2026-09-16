// صفحة المالية (المرحلة ١٣، ووُسّعت في ٣٨): الإيراد بلا مصروف ليس ربحًا — والعكس كذلك.
//
// كانت «المصاريف» وحدها، فكان صافي الربح = عمولات الصفقات − المصاريف. وذلك يُسقط كل دخلٍ
// لا يأتي من عمولة صفقة: **إدارة أملاك، واستشارة، وتسويقٌ لعميل، وإيجار مملوك**. فكان
// الرقم يقول أقلّ من الحقيقة، وصاحبه يظنّ شهرًا خاسرًا وهو رابح.
//
// وكيانا الصفحة بسيطان عمدًا (تاريخ، مبلغ، تصنيف، ملاحظة، ربط اختياري) — لا محاسبة مزدوجة
// ولا مراكز تكلفة؛ الغرض أن يصير رقم الداشبورد **صافي ربح** صادقًا.

import { repo, ValidationError } from '../data/repository.js';
import { ENUMS, labelFor } from '../data/schema.js';
import { getLists, typeLabel } from '../data/settings.js';
import {
  el, clear, labeled, selectEl, badge, openModal, confirmDialog, toast, emptyState, debounce,
} from '../util/dom.js';
import { formatSAR, formatDate, formatNumber, toInputDate, fromInputDate } from '../util/format.js';
import { matchesQuery } from '../util/arabic.js';

const categoryLabel = (key, kind = 'expense') => labelFor(kind === 'income' ? ENUMS.incomeCategories : ENUMS.expenseCategories, key);

/** الكيانان متوازيان، فتُكتب الصفحة مرّة ويُبدَّل ما يخصّ النوع في مكانٍ واحد. */
const categoriesFor = (ctx) => (ctx.kind === 'income' ? ENUMS.incomeCategories : ENUMS.expenseCategories);
const entityFor = (ctx) => (ctx.kind === 'income' ? repo.incomes : repo.expenses);
const itemsFor = (ctx) => (ctx.kind === 'income' ? ctx.incomes : ctx.expenses);
const kindWord = (ctx) => (ctx.kind === 'income' ? 'إيراد' : 'مصروف');

export async function render(container) {
  const ctx = { container, query: '', category: '', months: 6, kind: 'expense', nodes: {} };
  await loadData(ctx);
  build(ctx);
}

async function loadData(ctx) {
  const [expenses, incomes, deals, properties, lists] = await Promise.all([
    repo.expenses.list(), repo.incomes.list(), repo.deals.list(), repo.properties.list(), getLists(),
  ]);
  const byDate = (a, b) => (b.date || '').localeCompare(a.date || '');
  expenses.sort(byDate);
  incomes.sort(byDate);
  ctx.expenses = expenses;
  ctx.incomes = incomes;
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
export function monthlySummary({ expenses = [], deals = [], incomes = [], months = 6 } = {}, now = new Date()) {
  const key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const buckets = new Map();
  for (let i = 0; i < months; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.set(key(d), { month: key(d), commission: 0, income: 0, expenses: 0, net: 0 });
  }
  const add = (iso, field, value) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return;
    const bucket = buckets.get(key(d));
    if (bucket) bucket[field] += Number(value) || 0;
  };
  for (const deal of deals) add(deal.date, 'commission', deal.commission);
  for (const e of expenses) add(e.date, 'expenses', e.amount);
  // الإيراد المسجَّل يُضاف إلى العمولات (المرحلة ٣٨) — ولا يُخلط بها في العمود كي يبقى
  // كل مصدرٍ ظاهرًا: من أراد أن يعرف «كم من دخلي ليس عمولة» وجد الجواب.
  for (const i of incomes) add(i.date, 'income', i.amount);
  const rows = [...buckets.values()].map((b) => ({ ...b, net: b.commission + b.income - b.expenses }));
  return rows;
}

function build(ctx) {
  clear(ctx.container);
  ctx.nodes.count = el('span', { class: 'count' });
  const search = ctx.nodes.search = el('input', {
    class: 'input search', type: 'search', placeholder: 'بحث في الملاحظات…',
    onInput: debounce((e) => { ctx.query = e.target.value.trim(); renderList(ctx); }, 150),
  });
  const categoryFilter = ctx.nodes.categoryFilter = selectEl({
    options: [{ value: '', label: 'كل التصنيفات' }, ...categoriesFor(ctx).map((c) => ({ value: c.key, label: c.label }))],
    value: ctx.category, onChange: (e) => { ctx.category = e.target.value; renderList(ctx); },
  });

  // مبدّل النوع: الصفحة واحدة والكيانان متوازيان، فلا صفحتان ولا رابطان في القائمة.
  const seg = el('div', { class: 'seg' },
    ...[['expense', 'المصاريف'], ['income', 'الإيرادات']].map(([kind, label]) => el('button', {
      type: 'button', class: `seg-btn${ctx.kind === kind ? ' active' : ''}`, text: label,
      onClick: () => { ctx.kind = kind; ctx.category = ''; build(ctx); },
    })));

  ctx.nodes.addBtn = el('button', {
    type: 'button', class: 'btn btn-primary',
    text: ctx.kind === 'income' ? '+ إيراد' : '+ مصروف',
    onClick: () => openForm(ctx, null),
  });

  ctx.container.append(
    el('div', { class: 'page-head' },
      el('h1', {}, 'المالية ', ctx.nodes.count),
      el('div', { class: 'head-actions' }, seg, search, ctx.nodes.addBtn)),
    el('div', { class: 'toolbar' }, categoryFilter));

  ctx.nodes.summary = el('div');
  ctx.nodes.list = el('div');
  ctx.container.append(ctx.nodes.summary, ctx.nodes.list);
  renderSummary(ctx);
  renderList(ctx);
}

function renderSummary(ctx) {
  const rows = monthlySummary({ expenses: ctx.expenses, incomes: ctx.incomes, deals: ctx.deals, months: ctx.months });
  const area = ctx.nodes.summary;
  clear(area);
  const current = rows[0];
  area.append(el('div', { class: 'stat-strip' },
    stat(formatSAR(current.commission), 'عمولات هذا الشهر'),
    stat(formatSAR(current.income), 'إيرادات أخرى'),
    stat(formatSAR(current.expenses), 'مصاريف هذا الشهر'),
    stat(formatSAR(current.net), current.net < 0 ? 'خسارة هذا الشهر' : 'صافي ربح هذا الشهر')));

  area.append(el('div', { class: 'table-wrap' }, el('table', { class: 'table' },
    el('thead', {}, el('tr', {}, ['الشهر', 'العمولات', 'إيرادات أخرى', 'المصاريف', 'صافي الربح'].map((t) => el('th', { text: t })))),
    el('tbody', {}, rows.map((r) => el('tr', {},
      el('td', { text: r.month }),
      el('td', { class: 'num', text: formatSAR(r.commission) }),
      el('td', { class: 'num', text: formatSAR(r.income) }),
      el('td', { class: 'num', text: formatSAR(r.expenses) }),
      el('td', {}, badge(formatSAR(r.net), r.net < 0 ? 'badge-danger' : 'badge-ok'))))))));
  area.append(el('p', { class: 'muted small', text: 'صافي الربح = عمولاتك من الصفقات + إيراداتك الأخرى − مصاريفك. وسعر البيع نفسه ليس دخلك، فلا يدخل هنا.' }));
}

function stat(value, label) {
  return el('div', { class: 'stat-chip' },
    el('div', { class: 'stat-num', text: value }),
    el('div', { class: 'stat-label', text: label }));
}

function renderList(ctx) {
  const all = itemsFor(ctx);
  const items = all.filter((e) => (!ctx.category || e.category === ctx.category)
    && (!ctx.query || matchesQuery(e.searchKey || '', ctx.query)));
  ctx.nodes.count.textContent = `(${items.length}${items.length === all.length ? '' : ` من ${all.length}`})`;
  const area = ctx.nodes.list;
  clear(area);
  if (!all.length) {
    area.append(emptyState(ctx.kind === 'income'
      ? 'لا إيرادات مسجّلة بعد. سجّل إدارة الأملاك والاستشارات ليصير رقم أرباحك كاملًا — العمولات وحدها ليست كل دخلك.'
      : 'لا مصاريف مسجّلة بعد. سجّل وقودك وإعلاناتك ليصير رقم الأرباح صادقًا.'));
    return;
  }
  if (!items.length) {
    // فراغٌ يفعل (المرحلة ٤٧): «لا نتائج» تترك الواقفَ واقفًا، والزرُّ يُخرجه منها.
    area.append(emptyState(
      `لا ${ctx.kind === 'income' ? 'إيرادَ' : 'مصروفَ'} من ${formatNumber(all.length)} يطابق ما اخترتَه.`,
      el('button', {
        type: 'button', class: 'btn btn-primary', text: 'امسح البحث والتصنيف',
        onClick: () => {
          ctx.query = ''; ctx.category = '';
          if (ctx.nodes.search) ctx.nodes.search.value = '';
          if (ctx.nodes.categoryFilter) ctx.nodes.categoryFilter.value = '';
          renderList(ctx);
        },
      })));
    return;
  }

  area.append(el('div', { class: 'table-wrap' }, el('table', { class: 'table' },
    el('thead', {}, el('tr', {}, ['التاريخ', 'التصنيف', 'المبلغ', 'الملاحظة', 'مرتبط بـ', ''].map((t) => el('th', { text: t })))),
    el('tbody', {}, items.map((e) => el('tr', { onClick: () => openForm(ctx, e) },
      el('td', { text: formatDate(e.date) }),
      el('td', {}, badge(categoryLabel(e.category, ctx.kind), ctx.kind === 'income' ? 'badge-ok' : '')),
      el('td', { class: 'num strong', text: formatSAR(e.amount) }),
      el('td', { text: e.note || '—' }),
      el('td', { text: linkedLabel(ctx, e) }),
      el('td', {}, el('button', {
        type: 'button', class: 'icon-btn', text: '✕', title: 'حذف',
        onClick: async (ev) => {
          ev.stopPropagation();
          const word = kindWord(ctx);
          const ok = await confirmDialog({ title: `حذف ${word === 'إيراد' ? 'الإيراد' : 'المصروف'}`, message: `حذف ${word} ${formatSAR(e.amount)}؟`, confirmText: 'حذف', danger: true });
          if (!ok) return;
          await entityFor(ctx).remove(e.id);
          toast(`حُذف ${word}`, 'success');
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
  const entity = entityFor(ctx);
  const word = kindWord(ctx);
  const draft = existing ? { ...existing } : { ...entity.defaults(), date: new Date().toISOString() };
  const errorsBox = el('div', { class: 'form-errors', hidden: true });

  const dateInput = el('input', { class: 'input', type: 'date', value: toInputDate(draft.date || null) });
  const amountInput = el('input', { class: 'input', type: 'number', min: '0', step: '1', value: draft.amount ?? '' });
  const categorySelect = selectEl({
    options: categoriesFor(ctx).map((c) => ({ value: c.key, label: c.label })), value: draft.category || 'other',
  });
  const noteInput = el('input', { class: 'input', type: 'text', value: draft.note || '', placeholder: 'تفصيل قصير' });
  // المصدر (المرحلة ٣٥): من قائمة المصادر نفسها التي تُوسم بها عملاؤك — وإلا لم يلتقِ
  // الجدولان. ويقبل الكتابة الحرّة كي لا يُحبس صرفٌ على مصدرٍ لم تسجّله بعد.
  const sourceSelect = el('input', {
    class: 'input', type: 'text', list: 'expense-sources',
    value: draft.source || '', placeholder: 'مثال: سناب · إحالة عميل قديم',
  });
  const sourceList = el('datalist', { id: 'expense-sources' },
    (ctx.lists.sources || []).map((name) => el('option', { value: name })));
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
      category: categorySelect.value, note: noteInput.value, source: sourceSelect.value.trim(),
      dealId: dealSelect.value || null, propertyId: draft.propertyId || null,
    };
    saveBtn.disabled = true;
    try {
      if (isEdit) await entity.update(existing.id, data);
      else await entity.create(data);
      modal.close();
      toast(isEdit ? 'تم الحفظ' : `أُضيف ${word}`, 'success');
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
    title: isEdit ? `تعديل ${word}` : `${word} جديد`,
    body: el('div', {}, errorsBox, el('div', { class: 'form-grid' },
      labeled('التاريخ', dateInput, { required: true }),
      labeled('المبلغ (ريال)', amountInput, { required: true }),
      labeled('التصنيف', categorySelect),
      labeled('مرتبط بصفقة', dealSelect, { hint: 'اختياري — يفيد في معرفة تكلفة كل صفقة' }),
      labeled(ctx.kind === 'income' ? 'المصدر الذي جاء منه' : 'المصدر الذي صُرف عليه', el('div', {}, sourceSelect, sourceList),
        { hint: 'اختياري — يحوّل تقرير المصادر من عدّ صفقات إلى ربحٍ بعد الكلفة' }),
      labeled('ملاحظة', noteInput, { full: true }))),
    footer: [
      el('button', { type: 'button', class: 'btn btn-ghost', text: 'إلغاء', onClick: () => modal.close() }),
      saveBtn,
    ],
  });
  setTimeout(() => amountInput.focus(), 0);
}
