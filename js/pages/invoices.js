// صفحة الفواتير وعروض الأسعار (المرحلة ٨): كيان واحد بنوعين، بنود وأسعار وبيان وعميل مرتبط.
// التصدير PDF عبر طباعة المتصفح فقط (Ctrl+P ← حفظ كـPDF) بتنسيق طباعة مخصَّص —
// بلا مكتبة وبلا تصدير صورة (مؤجَّل صراحة بقرار المالك).

import { repo, ValidationError } from '../data/repository.js';
import { ENUMS, labelFor, invoiceTotal } from '../data/schema.js';
import { getCompany, suggestInvoiceNumber, consumeInvoiceNumber } from '../data/settings.js';
import { getImageUrl } from '../data/images.js';
import {
  el, clear, labeled, selectEl, badge, openModal, confirmDialog, toast, emptyState, debounce,
} from '../util/dom.js';
import { formatDate, formatNumber, toInputDate, fromInputDate } from '../util/format.js';
import { formatPhone } from '../util/phone.js';
import { matchesQuery } from '../util/arabic.js';

const typeLabelOf = (key) => labelFor(ENUMS.invoiceTypes, key);
const clientName = (c) => (c ? (c.name || formatPhone(c.phone) || 'عميل بلا اسم') : null);
const money = (n) => `${formatNumber(Number(n) || 0)} ريال`;

// يقرأ #/invoices/<id> — نفس نمط الروابط العميقة الموثّق منذ المرحلة ٣.
function routeInvoiceId() {
  const m = /^#\/invoices\/([^/?#]+)/.exec(location.hash || '');
  return m ? decodeURIComponent(m[1]) : null;
}

export async function render(container) {
  const ctx = { container, query: '', type: '', invoices: [], clients: [], company: null, nodes: {} };
  await loadData(ctx);
  buildLayout(ctx);
  const focusId = routeInvoiceId();
  if (focusId) {
    const target = ctx.invoices.find((x) => x.id === focusId);
    if (target) await openForm(ctx, target);
    else toast('المستند غير موجود، أو حُذف', 'error');
  }
}

async function loadData(ctx) {
  const [invoices, clients, company] = await Promise.all([
    repo.invoices.list(), repo.clients.list(), getCompany(),
  ]);
  // الأحدث تاريخًا أولًا، وعند تساوي التاريخ فالأحدث إنشاءً.
  invoices.sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || '').localeCompare(a.createdAt || ''));
  ctx.invoices = invoices;
  ctx.clients = clients;
  ctx.clientsById = new Map(clients.map((c) => [c.id, c]));
  ctx.company = company;
}

async function refresh(ctx) {
  await loadData(ctx);
  renderList(ctx);
}

function buildLayout(ctx) {
  clear(ctx.container);
  ctx.nodes.count = el('span', { class: 'count' });
  const search = el('input', {
    class: 'input', type: 'search', placeholder: 'ابحث برقم المستند أو العميل أو البيان…',
    onInput: debounce((e) => { ctx.query = e.target.value.trim(); renderList(ctx); }, 150),
  });
  const typeFilter = selectEl({
    options: [{ value: '', label: 'الكل' }, ...ENUMS.invoiceTypes.map((t) => ({ value: t.key, label: t.label }))],
    value: '', onChange: (e) => { ctx.type = e.target.value; renderList(ctx); },
  });
  ctx.container.append(
    el('div', { class: 'page-head' },
      el('h1', {}, 'الفواتير وعروض الأسعار', ctx.nodes.count),
      el('div', { class: 'row' },
        el('button', { type: 'button', class: 'btn btn-primary', text: '+ فاتورة جديدة', onClick: () => openForm(ctx, null, 'invoice') }),
        el('button', { type: 'button', class: 'btn', text: '+ عرض سعر', onClick: () => openForm(ctx, null, 'quote') }))),
    el('div', { class: 'toolbar' }, search, typeFilter),
  );
  ctx.nodes.list = el('div');
  ctx.container.append(ctx.nodes.list);
  renderList(ctx);
}

function passes(ctx, inv) {
  if (ctx.type && inv.type !== ctx.type) return false;
  if (ctx.query.length && !matchesQuery(inv.searchKey || '', ctx.query)) return false;
  return true;
}

function renderList(ctx) {
  const items = ctx.invoices.filter((x) => passes(ctx, x));
  ctx.nodes.count.textContent = items.length === ctx.invoices.length
    ? `(${ctx.invoices.length})`
    : `(${items.length} من ${ctx.invoices.length})`;
  const area = ctx.nodes.list;
  clear(area);
  if (!ctx.invoices.length) {
    area.append(emptyState('لا فواتير ولا عروض أسعار بعد. ابدأ من الزر أعلاه — وبيانات شركتك وشعارك تُضبط من الإعدادات.'));
    return;
  }
  if (!items.length) {
    area.append(emptyState('لا نتائج تطابق البحث أو الفرز.'));
    return;
  }
  const head = el('tr', {}, ['الرقم', 'النوع', 'التاريخ', 'العميل', 'البنود', 'الإجمالي', ''].map((t) => el('th', { text: t })));
  const body = el('tbody', {}, items.map((inv) => el('tr', { onClick: () => openForm(ctx, inv) },
    el('td', { class: 'strong', text: inv.number || '—' }),
    el('td', {}, badge(typeLabelOf(inv.type), inv.type === 'quote' ? 'badge-accent' : 'badge-ok')),
    el('td', { text: formatDate(inv.date) }),
    el('td', { text: clientName(ctx.clientsById.get(inv.clientId)) || inv.clientName || '—' }),
    el('td', { text: String((inv.items || []).length) }),
    el('td', { class: 'strong', text: money(invoiceTotal(inv)) }),
    el('td', {}, el('button', {
      type: 'button', class: 'btn btn-ghost btn-sm', text: '🖨️ طباعة',
      onClick: (e) => { e.stopPropagation(); printInvoice(inv, ctx.company, ctx.clientsById.get(inv.clientId)); },
    })))));
  area.append(el('div', { class: 'table-wrap' }, el('table', { class: 'table' }, el('thead', {}, head), body)));
}

/* ===== النموذج ===== */

async function openForm(ctx, existing, newType = 'invoice') {
  const isEdit = !!existing;
  const company = ctx.company;
  const draft = existing ? JSON.parse(JSON.stringify(existing)) : { ...repo.invoices.defaults(), type: newType };
  if (!isEdit) {
    draft.number = suggestInvoiceNumber(company, newType);
    draft.date = new Date().toISOString();
  }

  const errorsBox = el('div', { class: 'form-errors', hidden: true });
  const showErrors = (errors) => {
    clear(errorsBox);
    errorsBox.append(el('ul', {}, errors.map((e) => el('li', { text: e }))));
    errorsBox.hidden = false;
  };

  const numberInput = el('input', { class: 'input', type: 'text', value: draft.number || '' });
  const typeSelect = selectEl({
    options: ENUMS.invoiceTypes.map((t) => ({ value: t.key, label: t.label })), value: draft.type,
    onChange: () => { if (!isEdit) numberInput.value = suggestInvoiceNumber(company, typeSelect.value); },
  });
  const dateInput = el('input', { class: 'input', type: 'date', value: toInputDate(draft.date || null) });
  const statementInput = el('textarea', { class: 'input', rows: 2, value: draft.statement || '', placeholder: 'مثال: عمولة وساطة على بيع أرض بحي الياسمين' });
  const notesInput = el('textarea', { class: 'input', rows: 2, value: draft.notes || '', placeholder: 'شروط الدفع أو أي ملاحظة تُطبع أسفل المستند' });

  const clientNameInput = el('input', { class: 'input', type: 'text', value: draft.clientName || '' });
  const clientPhoneInput = el('input', { class: 'input', type: 'tel', dir: 'ltr', value: draft.clientPhone || '' });
  const clientSelect = selectEl({
    options: [...ctx.clients]
      .sort((a, b) => (clientName(a) || '').localeCompare(clientName(b) || '', 'ar'))
      .map((c) => ({ value: c.id, label: clientName(c) })),
    value: draft.clientId || '', placeholder: 'بلا عميل مرتبط (اكتب الاسم يدويًا)',
    onChange: () => {
      const c = ctx.clientsById.get(clientSelect.value);
      if (!c) return;
      // لقطة تُملأ من العميل ويمكن تعديلها؛ المستند المحفوظ لا يتغير بعدها بتعديل العميل.
      clientNameInput.value = clientName(c) || '';
      clientPhoneInput.value = c.phone || '';
    },
  });

  /* البنود */
  const items = (draft.items || []).map((it) => ({ ...it }));
  if (!items.length) items.push({ description: '', qty: 1, unitPrice: 0 });
  const itemsBody = el('tbody');
  const totalNode = el('strong', { class: 'invoice-total-value' });

  const recalcTotal = () => { totalNode.textContent = money(invoiceTotal({ items })); };

  const drawItems = () => {
    clear(itemsBody);
    items.forEach((item, index) => {
      const desc = el('input', { class: 'input', type: 'text', value: item.description || '', placeholder: 'وصف البند' });
      const qty = el('input', { class: 'input', type: 'number', step: '1', min: '0', value: item.qty ?? 1 });
      const price = el('input', { class: 'input', type: 'number', step: '0.01', min: '0', value: item.unitPrice ?? 0 });
      const lineTotal = el('td', { class: 'strong' });
      const syncLine = () => {
        item.description = desc.value;
        item.qty = qty.value === '' ? 0 : Number(qty.value);
        item.unitPrice = price.value === '' ? 0 : Number(price.value);
        lineTotal.textContent = money((Number(item.qty) || 0) * (Number(item.unitPrice) || 0));
        recalcTotal();
      };
      [desc, qty, price].forEach((input) => input.addEventListener('input', syncLine));
      syncLine();
      itemsBody.append(el('tr', {},
        el('td', {}, desc), el('td', {}, qty), el('td', {}, price), lineTotal,
        el('td', {}, el('button', {
          type: 'button', class: 'icon-btn', text: '✕', title: 'حذف البند',
          onClick: () => { items.splice(index, 1); if (!items.length) items.push({ description: '', qty: 1, unitPrice: 0 }); drawItems(); },
        }))));
    });
    recalcTotal();
  };
  drawItems();

  const itemsBlock = el('div', { class: 'panel-block' },
    el('h3', { text: 'البنود' }),
    el('div', { class: 'table-wrap' },
      el('table', { class: 'table invoice-items' },
        el('thead', {}, el('tr', {}, ['الوصف', 'الكمية', 'سعر الوحدة', 'الإجمالي', ''].map((t) => el('th', { text: t })))),
        itemsBody)),
    el('div', { class: 'row', style: { marginTop: '8px' } },
      el('button', { type: 'button', class: 'btn btn-sm', text: '+ بند', onClick: () => { items.push({ description: '', qty: 1, unitPrice: 0 }); drawItems(); } }),
      el('span', { class: 'invoice-total' }, 'الإجمالي: ', totalNode)));

  const collect = () => ({
    type: typeSelect.value,
    number: numberInput.value,
    date: fromInputDate(dateInput.value),
    clientId: clientSelect.value || null,
    clientName: clientNameInput.value,
    clientPhone: clientPhoneInput.value,
    statement: statementInput.value,
    notes: notesInput.value,
    items,
  });

  const saveBtn = el('button', { type: 'button', class: 'btn btn-primary', text: isEdit ? 'حفظ التعديلات' : 'حفظ' });
  const save = async () => {
    errorsBox.hidden = true;
    const data = collect();
    if (!data.date) { showErrors(['حدد تاريخ المستند']); return null; }
    saveBtn.disabled = true;
    try {
      const saved = isEdit ? await repo.invoices.update(existing.id, data) : await repo.invoices.create(data);
      if (!isEdit) ctx.company = await consumeInvoiceNumber(saved.type, saved.number);
      await refresh(ctx);
      return saved;
    } catch (err) {
      if (err instanceof ValidationError) showErrors(err.errors);
      else { console.error(err); showErrors([err.message || 'حدث خطأ غير متوقع']); }
      return null;
    } finally {
      saveBtn.disabled = false;
    }
  };
  saveBtn.addEventListener('click', async () => {
    const saved = await save();
    if (!saved) return;
    modal.close();
    toast(isEdit ? 'تم حفظ التعديلات' : `حُفظ ${typeLabelOf(saved.type)}`, 'success');
  });

  const printBtn = el('button', {
    type: 'button', class: 'btn', text: '🖨️ حفظ كـPDF / طباعة',
    onClick: async () => {
      const saved = await save(); // الطباعة تحفظ أولًا فلا تُطبع نسخة تخالف المحفوظ
      if (!saved) return;
      modal.close();
      toast('حُفظ المستند؛ اختر «حفظ كـPDF» في نافذة الطباعة', 'info');
      printInvoice(saved, ctx.company, ctx.clientsById.get(saved.clientId));
    },
  });

  const deleteBtn = isEdit ? el('button', {
    type: 'button', class: 'btn btn-danger', text: 'حذف',
    onClick: async () => {
      const ok = await confirmDialog({
        title: 'حذف المستند',
        message: `حذف ${typeLabelOf(existing.type)} رقم ${existing.number || '—'}؟ لا يمكن التراجع.`,
        confirmText: 'حذف', danger: true,
      });
      if (!ok) return;
      await repo.invoices.remove(existing.id);
      modal.close();
      toast('حُذف المستند', 'success');
      await refresh(ctx);
    },
  }) : null;

  const modal = openModal({
    title: isEdit ? `تعديل ${typeLabelOf(draft.type)}` : `${typeLabelOf(draft.type)} جديد`,
    size: 'wide',
    body: el('div', {},
      errorsBox,
      el('div', { class: 'form-grid' },
        labeled('النوع', typeSelect),
        labeled('الرقم', numberInput, { hint: 'مقترح تلقائيًا ويمكن الكتابة فوقه؛ الكتابة اليدوية لا تحرّك العدّاد' }),
        labeled('التاريخ', dateInput, { required: true }),
        labeled('العميل المرتبط', clientSelect),
        labeled('الاسم في المستند', clientNameInput, { hint: 'يُطبع كما هو ولو تغيّر العميل لاحقًا' }),
        labeled('الجوال في المستند', clientPhoneInput),
        labeled('البيان', statementInput, { full: true })),
      itemsBlock,
      el('div', { class: 'form-grid one' }, labeled('ملاحظات تُطبع أسفل المستند', notesInput))),
    footer: [
      deleteBtn,
      el('button', { type: 'button', class: 'btn btn-ghost', text: 'إلغاء', onClick: () => modal.close() }),
      printBtn,
      saveBtn,
    ],
  });
  setTimeout(() => numberInput.focus(), 0);
}

/* ===== الطباعة (التصدير الوحيد: PDF عبر طباعة المتصفح) ===== */

/**
 * يبني ورقة المستند داخل #print-root ثم يفتح نافذة طباعة المتصفح.
 * قواعد `@media print` في components.css تُخفي التطبيق كله وتُظهر هذه الورقة وحدها.
 * لا مكتبة ولا تصدير صورة (مؤجَّل صراحة).
 */
export async function printInvoice(invoice, company, client = null) {
  const root = document.getElementById('print-root');
  if (!root) return;
  clear(root);

  let logo = null;
  if (company?.logoImageId) {
    try {
      const url = await getImageUrl(company.logoImageId);
      if (url) logo = el('img', { class: 'print-logo', src: url, alt: '' });
    } catch (_) { /* شعار مفقود لا يمنع الطباعة */ }
  }

  const name = invoice.clientName || clientName(client) || '';
  const phone = invoice.clientPhone || client?.phone || '';
  const rows = (invoice.items || []).map((it, i) => el('tr', {},
    el('td', { text: String(i + 1) }),
    el('td', { text: it.description }),
    el('td', { text: formatNumber(it.qty) }),
    el('td', { text: money(it.unitPrice) }),
    el('td', { text: money((Number(it.qty) || 0) * (Number(it.unitPrice) || 0)) })));

  // ltr للجوال والبريد فقط كي لا تنقلب خاناتهما داخل صفحة RTL.
  const companyLines = [
    { text: company?.phone, ltr: true },
    { text: company?.email, ltr: true },
    { text: company?.address, ltr: false },
    { text: company?.crNumber ? `السجل التجاري: ${company.crNumber}` : '', ltr: false },
  ].filter((l) => l.text);

  root.append(el('article', { class: 'print-doc' },
    el('header', { class: 'print-head' },
      el('div', { class: 'print-company' },
        logo,
        el('div', {},
          el('div', { class: 'print-company-name', text: company?.name || 'مُطابِق' }),
          ...companyLines.map((line) => el('div', {
            class: `print-company-line${line.ltr ? ' print-ltr' : ''}`, text: line.text,
          })))),
      el('div', { class: 'print-meta' },
        el('h1', { class: 'print-title', text: typeLabelOf(invoice.type) }),
        el('div', { text: `الرقم: ${invoice.number || '—'}` }),
        el('div', { text: `التاريخ: ${formatDate(invoice.date)}` }))),
    (name || phone) ? el('section', { class: 'print-party' },
      el('div', { class: 'print-party-label', text: invoice.type === 'quote' ? 'مقدَّم إلى' : 'فاتورة على' }),
      el('div', { class: 'print-party-name', text: name || '—' }),
      phone ? el('div', { class: 'print-ltr', text: formatPhone(phone) }) : null) : null,
    invoice.statement ? el('section', { class: 'print-statement', text: invoice.statement }) : null,
    el('table', { class: 'print-table' },
      el('thead', {}, el('tr', {}, ['#', 'الوصف', 'الكمية', 'سعر الوحدة', 'الإجمالي'].map((t) => el('th', { text: t })))),
      el('tbody', {}, rows)),
    el('div', { class: 'print-total' }, 'الإجمالي: ', el('strong', { text: money(invoiceTotal(invoice)) })),
    invoice.notes ? el('section', { class: 'print-notes', text: invoice.notes }) : null,
    company?.footerNote ? el('footer', { class: 'print-footer', text: company.footerNote }) : null));

  document.body.classList.add('printing');
  const cleanup = () => {
    document.body.classList.remove('printing');
    clear(root);
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);
  setTimeout(() => window.print(), 0);
  // شبكة أمان: بعض المتصفحات لا تُطلق afterprint عند الإلغاء.
  setTimeout(cleanup, 60000);
}
