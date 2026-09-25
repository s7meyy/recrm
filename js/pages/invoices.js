// صفحة الفواتير وعروض الأسعار (المرحلة ٨): كيان واحد بنوعين، بنود وأسعار وبيان وعميل مرتبط.
// التصدير PDF عبر طباعة المتصفح فقط (Ctrl+P ← حفظ كـPDF) بتنسيق طباعة مخصَّص —
// بلا مكتبة وبلا تصدير صورة (مؤجَّل صراحة بقرار المالك).

import { repo, ValidationError, getCurrentUser } from '../data/repository.js';
import { ENUMS, labelFor, invoiceTotal, invoiceVat, invoiceGrandTotal, invoiceCollection, invoiceRemaining, invoicePaid, COLLECTION_LABELS } from '../data/schema.js';
import { zatcaTlvBase64, zatcaReady } from '../util/zatca.js';
import { qrSvg } from '../util/qr.js';
import { getCompany, suggestInvoiceNumber, consumeInvoiceNumber } from '../data/settings.js';
import { getImageUrl } from '../data/images.js';
import {
  el, clear, labeled, selectEl, badge, openModal, confirmDialog, toast, emptyState, debounce, appendChildren,
} from '../util/dom.js';
import { formatDate, formatNumber, formatSAR, toInputDate, fromInputDate, countOf, daysWord } from '../util/format.js';
import { vatSummary, invoiceYears, QUARTERS, quarterOf } from '../util/vat-report.js';
import { receivables } from '../util/receivables.js';
import { dunningList, dunningDraft } from '../util/dunning.js';
import { whatsappButton } from '../util/outreach.js';
import { formatPhone } from '../util/phone.js';
import { matchesQuery } from '../util/arabic.js';
import { runIntegration, explain } from '../data/integrations.js';

const typeLabelOf = (key) => labelFor(ENUMS.invoiceTypes, key);
const clientName = (c) => (c ? (c.name || formatPhone(c.phone) || 'عميل بلا اسم') : null);
const money = (n) => `${formatNumber(Number(n) || 0)} ريال`;

// يقرأ #/invoices/<id> — نفس نمط الروابط العميقة الموثّق منذ المرحلة ٣.
function routeInvoiceId() {
  const m = /^#\/invoices\/([^/?#]+)/.exec(location.hash || '');
  return m ? decodeURIComponent(m[1]) : null;
}

export async function render(container) {
  const ctx = { container, query: '', type: '', collection: '', invoices: [], clients: [], company: null, nodes: {} };
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
  const search = ctx.nodes.search = el('input', {
    class: 'input', type: 'search', placeholder: 'ابحث برقم المستند أو العميل أو البيان…',
    onInput: debounce((e) => { ctx.query = e.target.value.trim(); renderList(ctx); }, 150),
  });
  const typeFilter = ctx.nodes.typeFilter = selectEl({
    options: [{ value: '', label: 'الكل' }, ...ENUMS.invoiceTypes.map((t) => ({ value: t.key, label: t.label }))],
    value: '', onChange: (e) => { ctx.type = e.target.value; renderList(ctx); },
  });
  const collectionFilter = ctx.nodes.collectionFilter = selectEl({
    options: [
      { value: '', label: 'كل حالات التحصيل' },
      { value: 'due', label: 'لم يُقبض أو جزئيًا' },
      { value: 'unpaid', label: COLLECTION_LABELS.unpaid },
      { value: 'partial', label: COLLECTION_LABELS.partial },
      { value: 'paid', label: COLLECTION_LABELS.paid },
    ],
    value: '', onChange: (e) => { ctx.collection = e.target.value; renderList(ctx); },
  });
  ctx.container.append(
    el('div', { class: 'page-head' },
      el('h1', {}, 'الفواتير وعروض الأسعار ', ctx.nodes.count), // الفراغ مقصود: بقيّة الصفحات «العقارات (15)» وهذه كانت «الأسعار(0)»
      el('div', { class: 'row' },
        el('button', { type: 'button', class: 'btn btn-primary', text: '+ فاتورة جديدة', onClick: () => openForm(ctx, null, 'invoice') }),
        el('button', { type: 'button', class: 'btn', text: '+ عرض سعر', onClick: () => openForm(ctx, null, 'quote') }),
        el('button', { type: 'button', class: 'btn', text: '🧾 ملخّص الضريبة', title: 'ضريبة المخرجات لربع سنة', onClick: () => openVatReport(ctx) }))),
    // `filter-bar` (المرحلة ٥٧): كانت القائمتان كلٌّ بعرض الصفحة فوق بعضهما.
    el('div', { class: 'toolbar filter-bar' }, search, typeFilter, collectionFilter),
  );
  ctx.nodes.summary = el('div');
  ctx.nodes.list = el('div');
  ctx.container.append(ctx.nodes.summary, ctx.nodes.list);
  renderList(ctx);
}

function passes(ctx, inv) {
  if (ctx.type && inv.type !== ctx.type) return false;
  if (ctx.query.length && !matchesQuery(inv.searchKey || '', ctx.query)) return false;
  if (ctx.collection) {
    const state = invoiceCollection(inv);
    if (ctx.collection === 'due' ? !(state === 'unpaid' || state === 'partial') : state !== ctx.collection) return false;
  }
  return true;
}

const COLLECTION_STYLE = { unpaid: 'badge-danger', partial: 'badge-warn', paid: 'badge-ok', quote: 'badge-outline' };

/** شارة التحصيل: تقول المتبقّي لا الحالة وحدها — «مقبوض جزئيًا» بلا رقم لا يفيد. */
function collectionBadge(inv) {
  const state = invoiceCollection(inv);
  const label = state === 'partial'
    ? `${COLLECTION_LABELS.partial} · باقٍ ${money(invoiceRemaining(inv))}`
    : COLLECTION_LABELS[state];
  return badge(label, COLLECTION_STYLE[state] || '');
}

function renderList(ctx) {
  const items = ctx.invoices.filter((x) => passes(ctx, x));
  ctx.nodes.count.textContent = items.length === ctx.invoices.length
    ? `(${ctx.invoices.length})`
    : `(${items.length} من ${ctx.invoices.length})`;
  renderSummary(ctx);
  const area = ctx.nodes.list;
  clear(area);
  if (!ctx.invoices.length) {
    area.append(emptyState('لا فواتير ولا عروض أسعار بعد. ابدأ من الزر أعلاه — وبيانات شركتك وشعارك تُضبط من الإعدادات.'));
    return;
  }
  if (!items.length) {
    area.append(emptyState(
      `لا مستندَ من ${formatNumber(ctx.invoices.length)} يطابق ما اخترتَه.`,
      el('button', {
        type: 'button', class: 'btn btn-primary', text: 'امسح الفرز والبحث',
        onClick: () => {
          ctx.query = ''; ctx.type = ''; ctx.collection = '';
          if (ctx.nodes.search) ctx.nodes.search.value = '';
          if (ctx.nodes.typeFilter) ctx.nodes.typeFilter.value = '';
          if (ctx.nodes.collectionFilter) ctx.nodes.collectionFilter.value = '';
          renderList(ctx);
        },
      })));
    return;
  }
  const head = el('tr', {}, ['الرقم', 'النوع', 'التاريخ', 'العميل', 'الإجمالي', 'التحصيل', ''].map((t) => el('th', { text: t })));
  const body = el('tbody', {}, items.map((inv) => el('tr', { onClick: () => openForm(ctx, inv) },
    el('td', { class: 'strong', text: inv.number || '—' }),
    el('td', {}, badge(typeLabelOf(inv.type), inv.type === 'quote' ? 'badge-accent' : 'badge-ok')),
    el('td', { text: formatDate(inv.date) }),
    el('td', { text: clientName(ctx.clientsById.get(inv.clientId)) || inv.clientName || '—' }),
    el('td', { class: 'strong', text: money(invoiceGrandTotal(inv)) }),
    el('td', {}, collectionBadge(inv)),
    el('td', {}, el('div', { class: 'row' },
      invoiceCollection(inv) === 'quote' || invoiceCollection(inv) === 'paid' ? null : el('button', {
        type: 'button', class: 'btn btn-sm', text: '💰 قبض',
        onClick: (e) => { e.stopPropagation(); openCollect(ctx, inv); },
      }),
      el('button', {
        type: 'button', class: 'btn btn-ghost btn-sm', text: '🖨️ طباعة',
        onClick: (e) => { e.stopPropagation(); printInvoice(inv, ctx.company, ctx.clientsById.get(inv.clientId)); },
      }))))));
  area.append(el('div', { class: 'table-wrap' }, el('table', { class: 'table' }, el('thead', {}, head), body)));
}

/** شريط مختصر أعلى القائمة: كم لك عند الناس، وكم منه متأخر. */
function renderSummary(ctx) {
  const area = ctx.nodes.summary;
  clear(area);
  const { total, overdueTotal, overdueCount } = receivables({ invoices: ctx.invoices });
  if (total <= 0) return;
  area.append(el('div', { class: 'stat-strip' },
    el('div', { class: 'stat-chip' },
      el('div', { class: 'stat-num', text: money(total) }),
      el('div', { class: 'stat-label', text: 'مستحق لم يُقبض' })),
    overdueCount ? el('div', { class: 'stat-chip' },
      el('div', { class: 'stat-num', text: money(overdueTotal) }),
      el('div', { class: 'stat-label', text: `متأخر عن استحقاقه (${formatNumber(overdueCount)})` })) : null));
  // **المطالبة** (المرحلة ٤٩): التعميرُ كان يقف عند العرض، والرسالةُ تُكتب بيدٍ عشرين مرّة.
  if (overdueCount) {
    area.append(el('button', {
      type: 'button', class: 'btn btn-sm', text: '💬 طالِب بالمتأخّر',
      title: 'رسائلُ مطالبةٍ مملوءةٌ بالاسم والمبلغ وأيّام التأخّر — بنبرةٍ تتبع طول التأخّر',
      onClick: () => openDunning(ctx),
    }));
  }
}

/**
 * **نافذةُ المطالبة** (المرحلة ٤٩) — واحدةً بعد واحدة، ونبرةٌ تتبع الشريحة العمريّة.
 *
 * ولا إرسالَ جماعيٍّ بضغطة: عشرون رسالةً تُفتح دفعةً واحدةً يمنعها المتصفّح أصلًا،
 * **والمطالبةُ قرارٌ لكلّ واحدٍ على حدة** — فيهم من كلّمتَه أمس، وفيهم من له عذر.
 * وكلُّ ما يُفتح يُسجَّل تواصلًا مستنتَجًا فلا يُطالَب أحدٌ مرّتين في يوم.
 */
async function openDunning(ctx) {
  const { rows } = receivables({ invoices: ctx.invoices });
  const list = dunningList(rows, ctx.clientsById);
  const user = getCurrentUser();
  const body = el('div', {});
  if (!list.length) {
    body.append(el('p', { class: 'muted', text: 'لا متأخّرَ له جوّالٌ يُطالَب عليه. ومن لا جوّالَ له لا يُدرَج هنا: زرُّ رسالةٍ لا تُرسَل وعدٌ كاذب.' }));
  } else {
    body.append(el('p', { class: 'muted small', text: 'النبرةُ تتبع طولَ التأخّر: تذكيرٌ لطيفٌ في الشهر الأوّل، ومطالبةٌ صريحةٌ بعد التسعين. والنصُّ يُقرأ ويُعدَّل داخل واتساب قبل أن يُرسَل.' }));
    for (const item of list.slice(0, 20)) {
      const { text, tone } = dunningDraft({
        row: item.row, client: item.client, company: ctx.company, user, daysWord, formatDate,
      });
      const area2 = el('textarea', { class: 'input', rows: 4, value: text, 'aria-label': 'نصّ المطالبة' });
      body.append(el('div', { class: 'panel-block' },
        el('div', { class: 'row' },
          el('strong', { text: item.client?.name || item.row.name || 'بلا اسم' }),
          badge(tone.label, item.row.bucket === 'older' ? 'badge-danger' : 'badge-warn'),
          el('span', { class: 'muted small', text: `${money(item.row.remaining)} · متأخّرٌ ${daysWord(item.row.days)}` })),
        area2,
        el('div', { class: 'row' },
          whatsappButton(el, {
            clientId: item.client?.id || null,
            phone: item.phone,
            // النصُّ المعدَّل هو الذي يُرسَل — لا النصُّ الذي وُلِّد أوّلًا.
            textOf: () => area2.value,
            note: `مطالبة: ${tone.lead}`,
            label: '💬 افتح المحادثة',
            cls: 'btn btn-sm',
            sensitive: false,
          }))));
    }
  }
  openModal({ title: 'المطالبة بالمتأخّر', size: 'wide', body, footer: [] });
}

/**
 * نافذة القبض: مبلغ وتاريخ، ومعها زر «قُبض كاملًا» لأن هذه هي الحالة الغالبة
 * فلا يُطلب منك كتابة رقمٍ يعرفه النظام.
 */
function openCollect(ctx, inv) {
  const total = invoiceGrandTotal(inv);
  const already = invoicePaid(inv);
  const remaining = invoiceRemaining(inv);
  const errorsBox = el('div', { class: 'form-errors', hidden: true });
  const amountInput = el('input', { class: 'input', type: 'number', min: '0', step: '1', value: remaining });
  const dateInput = el('input', { class: 'input', type: 'date', value: toInputDate() });

  /**
   * رابط سداد للفاتورة (المرحلة ٣٧).
   *
   * بلا بوابةٍ مُهيَّأة **لا يُخفى الزرّ**: يُضغط فيقول ما ينقص بالضبط وأين يُضاف. وزرٌّ
   * مخفيّ يترك صاحبه لا يعرف أن الميزة موجودة أصلًا، فلا يسعى إلى تشغيلها.
   */
  const payBtn = el('button', {
    type: 'button', class: 'btn', text: '💳 رابط سداد',
    title: 'ينشئ رابط دفع من بوابتك ويحفظه على الفاتورة',
    onClick: async () => {
      payBtn.disabled = true;
      const res = await runIntegration('payments', 'link.create', {
        amount: remaining,
        description: `فاتورة ${inv.number || ''} — ${inv.clientName || ''}`.trim(),
      });
      if (!res.ok) { toast(explain(res, 'payments'), 'error', 8000); payBtn.disabled = false; return; }
      const url = res.provider?.url || res.provider?.payment_url || res.provider?.link || '';
      await repo.invoices.update(inv.id, {
        paymentUrl: url, paymentRef: res.provider?.id || '', paymentCreatedAt: new Date().toISOString(),
      });
      try { await navigator.clipboard.writeText(url); toast('أُنشئ الرابط ونُسخ', 'success'); }
      catch (_) { toast(url || 'أُنشئ الرابط', 'success', 9000); }
      payBtn.disabled = false;
    },
  });

  const save = async (fullAmount) => {
    errorsBox.hidden = true;
    const added = fullAmount != null ? fullAmount : Number(amountInput.value);
    if (!Number.isFinite(added) || added <= 0) {
      clear(errorsBox);
      errorsBox.append(el('div', { text: 'اكتب مبلغًا أكبر من صفر' }));
      errorsBox.hidden = false;
      return;
    }
    try {
      await repo.invoices.update(inv.id, { paidAmount: already + added, paidAt: fromInputDate(dateInput.value) });
      modal.close();
      toast('سُجّل القبض', 'success');
      window.dispatchEvent(new CustomEvent('kassab:data-changed'));
      await refresh(ctx);
    } catch (err) {
      clear(errorsBox);
      errorsBox.append(el('ul', {}, (err instanceof ValidationError ? err.errors : [err.message]).map((m) => el('li', { text: m }))));
      errorsBox.hidden = false;
    }
  };

  const modal = openModal({
    title: `قبض ${inv.number ? `الفاتورة ${inv.number}` : 'الفاتورة'}`,
    body: el('div', {}, errorsBox,
      el('p', { class: 'muted small', text: `الإجمالي ${money(total)}${already ? ` · المقبوض سابقًا ${money(already)}` : ''} · المتبقّي ${money(remaining)}` }),
      el('div', { class: 'form-grid' },
        labeled('المبلغ المقبوض الآن', amountInput),
        labeled('تاريخ القبض', dateInput))),
    footer: [
      el('button', { type: 'button', class: 'btn btn-primary', text: `قُبض كاملًا (${money(remaining)})`, onClick: () => save(remaining) }),
      el('button', { type: 'button', class: 'btn', text: 'حفظ المبلغ المكتوب', onClick: () => save(null) }),
      payBtn,
      el('span', { class: 'spacer' }),
      el('button', { type: 'button', class: 'btn btn-ghost', text: 'إلغاء', onClick: () => modal.close() }),
    ],
  });
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
  const dueInput = el('input', { class: 'input', type: 'date', value: draft.dueAt ? toInputDate(draft.dueAt) : '' });
  // النسبة تُنسخ من إعداداتك عند الإنشاء وتبقى محفوظة في المستند، فلا تتغير أرقام مستند قديم.
  const defaultVat = company?.vatNumber ? (company.vatRate ?? 15) : null;
  const vatInput = el('input', {
    class: 'input', type: 'number', min: '0', max: '100', step: '0.5',
    value: (isEdit ? draft.vatRate : defaultVat) ?? '',
    onInput: () => recalcTotal(),
  });
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

  const recalcTotal = () => {
    const draftInv = { items, vatRate: vatInput.value === '' ? null : Number(vatInput.value) };
    const vat = invoiceVat(draftInv);
    totalNode.textContent = vat > 0
      ? `${money(invoiceTotal(draftInv))} + ضريبة ${money(vat)} = ${money(invoiceGrandTotal(draftInv))}`
      : money(invoiceTotal(draftInv));
  };

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

  /**
   * البنود الجاهزة ونسبة الوساطة (المرحلة ٣٨).
   *
   * **البنود**: الوصف نفسه يتكرّر عشرات المرّات ويختلف كتابةً في كلٍّ منها. قائمةٌ من
   * الإعدادات تجعله اختيارًا — ويبقى قابلًا للتعديل في المستند (القالب لا يحبس مستندًا).
   *
   * **والنسبة**: كانت تُقرأ من الإعدادات ولا تُرى هنا، فمن أراد تغييرها لفاتورةٍ واحدة
   * خرج من المستند إلى صفحة الإعدادات وغيّرها **للمستندات كلّها**، أو حسبها بيده. وهذه
   * تحسبها في مكانها: تكتب سعر الصفقة، فيُحسب البند بنسبتك — والنسبة قابلة للتعديل هنا
   * **بلا أن تُحفظ في الإعدادات**، فتعديلُ فاتورةٍ لا يغيّر ما بعدها.
   */
  const products = String(ctx.company.invoiceProducts || '').split('\n')
    .map((line) => {
      const [description, price] = line.split('|');
      return { description: (description || '').trim(), unitPrice: Number(price) || 0 };
    })
    .filter((x) => x.description);

  const percentInput = el('input', {
    class: 'input commission-percent', type: 'number', min: '0', max: '100', step: '0.25',
    'aria-label': 'نسبة الوساطة (٪)',
    value: ctx.company.commissionPercent ?? 2.5, style: { maxWidth: '90px' },
  });
  const dealPriceInput = el('input', {
    class: 'input commission-price', type: 'number', min: '0', step: '1000',
    'aria-label': 'سعر الصفقة',
    placeholder: 'سعر الصفقة', style: { maxWidth: '150px' },
  });
  const commissionBtn = el('button', {
    type: 'button', class: 'btn btn-sm', text: 'أضف بند العمولة',
    onClick: () => {
      const price = Number(dealPriceInput.value) || 0;
      const percent = Number(percentInput.value) || 0;
      if (price <= 0) { toast('اكتب سعر الصفقة أولًا', 'error'); return; }
      items.push({
        description: `عمولة وساطة ${percent}٪ من ${formatSAR(price)}`,
        qty: 1,
        unitPrice: Math.round(price * percent) / 100,
      });
      drawItems();
    },
  });

  const productSelect = selectEl({
    class: 'input product-picker',
    'aria-label': 'بند جاهز',
    options: products.map((p2, i) => ({ value: String(i), label: p2.unitPrice ? `${p2.description} — ${formatSAR(p2.unitPrice)}` : p2.description })),
    placeholder: 'بند جاهز…',
    onChange: (e) => {
      const chosen = products[Number(e.target.value)];
      if (!chosen) return;
      items.push({ description: chosen.description, qty: 1, unitPrice: chosen.unitPrice });
      e.target.value = '';
      drawItems();
    },
  });

  const itemsBlock = el('div', { class: 'panel-block' },
    el('h3', { text: 'البنود' }),
    el('div', { class: 'row', style: { marginBottom: '10px', gap: '8px' } },
      products.length ? productSelect : null,
      el('span', { class: 'muted small', text: 'أو احسب العمولة:' }),
      dealPriceInput,
      percentInput,
      el('span', { class: 'muted small', text: '٪' }),
      commissionBtn),
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
    dueAt: dueInput.value ? fromInputDate(dueInput.value) : null,
    vatRate: vatInput.value === '' ? null : Number(vatInput.value),
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
        labeled('تاريخ الاستحقاق', dueInput, { hint: 'اختياري — يُحسب عليه تأخّر التحصيل بدل تاريخ الإصدار' }),
        labeled('نسبة ضريبة القيمة المضافة (٪)', vatInput, {
          hint: company?.vatNumber ? 'اتركه فارغًا لمستند معفيّ' : 'اكتب رقمك الضريبي في الإعدادات أولًا ليظهر في المستند ورمزه',
        }),
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
    { text: company?.vatNumber ? `الرقم الضريبي: ${company.vatNumber}` : '', ltr: false },
  ].filter((l) => l.text);

  /* الضريبة (المرحلة ١٩): سطور منفصلة — البنود ثم الضريبة ثم المستحقّ. */
  const vat = invoiceVat(invoice);
  const totalsBlock = vat > 0
    ? el('div', { class: 'print-totals' },
      el('div', {}, el('span', { text: 'الإجمالي قبل الضريبة' }), el('span', { text: money(invoiceTotal(invoice)) })),
      el('div', {}, el('span', { text: `ضريبة القيمة المضافة (${invoice.vatRate}٪)` }), el('span', { text: money(vat) })),
      el('div', { class: 'print-total-row' }, el('span', { text: 'الإجمالي المستحَقّ' }), el('strong', { text: money(invoiceGrandTotal(invoice)) })))
    : el('div', { class: 'print-total' }, 'الإجمالي: ', el('strong', { text: money(invoiceTotal(invoice)) }));

  /* رمز الفاتورة الضريبية المبسّطة: لا يُبنى إلا باكتمال شرطه (اسم بائع ورقم ضريبي وضريبة فعلية). */
  let zatcaBlock = null;
  const isTaxInvoice = invoice.type === 'invoice' && vat > 0 && zatcaReady({ sellerName: company?.name, vatNumber: company?.vatNumber });
  if (isTaxInvoice) {
    try {
      const payload = zatcaTlvBase64({
        sellerName: company.name,
        vatNumber: company.vatNumber,
        timestamp: new Date(invoice.date || Date.now()).toISOString(),
        total: invoiceGrandTotal(invoice),
        vat,
      });
      const holder = el('div', { class: 'print-zatca' });
      holder.innerHTML = await qrSvg(payload, { cellSize: 3, margin: 1 });
      holder.append(el('div', { class: 'print-zatca-label', text: 'فاتورة ضريبية مبسّطة' }));
      zatcaBlock = holder;
    } catch (_) { /* تعذّر بناء الرمز لا يمنع الطباعة */ }
  }

  root.append(el('article', { class: 'print-doc' },
    el('header', { class: 'print-head' },
      el('div', { class: 'print-company' },
        logo,
        el('div', {},
          el('div', { class: 'print-company-name', text: company?.name || 'كسّاب' }),
          ...companyLines.map((line) => el('div', {
            class: `print-company-line${line.ltr ? ' print-ltr' : ''}`, text: line.text,
          })))),
      el('div', { class: 'print-meta' },
        el('h1', { class: 'print-title', text: isTaxInvoice ? 'فاتورة ضريبية مبسّطة' : typeLabelOf(invoice.type) }),
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
    totalsBlock,
    zatcaBlock,
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


/* ===== ملخّص ضريبة القيمة المضافة للربع (المرحلة ٣١) ===== */

/**
 * يجمع ضريبة المخرجات لربعٍ من فواتيرك.
 *
 * **بيانٌ من فواتيرك لا إقرار ضريبي ولا مشورة**، ولا يُرسَل إلى أي جهة — والتصريح مكتوب
 * في الشاشة وفي الورقة المطبوعة، لا في ملفٍ لا يقرؤه أحد.
 *
 * وضريبة **المخرجات وحدها**: مصاريفك ليس فيها حقل ضريبة أصلًا، فادّعاء «صافي ضريبة» كذب.
 */
function openVatReport(ctx) {
  const years = invoiceYears(ctx.invoices);
  const yearSelect = selectEl({ options: years.map((y) => ({ value: String(y), label: String(y) })), value: String(years[0]) });
  const quarterSelect = selectEl({
    options: QUARTERS.map((q) => ({ value: String(q.key), label: q.label })),
    value: String(quarterOf(new Date())),
  });
  const out = el('div');

  const draw = () => {
    const report = vatSummary(ctx.invoices, { year: Number(yearSelect.value), quarter: Number(quarterSelect.value) });
    clear(out);
    if (!report.count) {
      out.append(el('p', { class: 'muted small', text: 'لا فواتير في هذا الربع.' }));
      return;
    }
    appendChildren(out, [
      el('dl', { class: 'kv' },
        el('dt', { text: 'عدد الفواتير' }), el('dd', { text: formatNumber(report.count) }),
        el('dt', { text: 'الإجمالي قبل الضريبة' }), el('dd', { text: formatSAR(report.net) }),
        el('dt', { text: 'ضريبة المخرجات' }), el('dd', {}, badge(formatSAR(report.vat), 'badge-ok')),
        el('dt', { text: 'الإجمالي بعد الضريبة' }), el('dd', { text: formatSAR(report.gross) })),
      report.zeroRated
        ? el('p', { class: 'muted small', text: `${countOf(report.zeroRated, 'فاتورة')} بلا ضريبة في هذا الربع — تأكّد أنها مقصودة.` })
        : null,
      el('div', { class: 'table-wrap' }, el('table', { class: 'table' },
        el('thead', {}, el('tr', {}, ['الرقم', 'التاريخ', 'العميل', 'قبل الضريبة', 'الضريبة'].map((t) => el('th', { text: t })))),
        el('tbody', {}, report.rows.map((r) => el('tr', {},
          el('td', { class: 'strong', text: r.number || '—' }),
          el('td', { text: formatDate(r.date) }),
          el('td', { text: r.clientName || '—' }),
          el('td', { class: 'num', text: formatSAR(r.net) }),
          el('td', { class: 'num', text: formatSAR(r.vat) })))))),
    ]);
  };
  yearSelect.addEventListener('change', draw);
  quarterSelect.addEventListener('change', draw);
  draw();

  const modal = openModal({
    title: 'ملخّص ضريبة القيمة المضافة',
    size: 'wide',
    body: el('div', {},
      el('div', { class: 'notice' },
        el('strong', { text: 'بيانٌ من فواتيرك، لا إقرار ضريبي. ' }),
        'يجمع ضريبة المخرجات (ما حصّلتَه على فواتيرك) لربعٍ واحد. ',
        'ولا يشمل ضريبة المدخلات لأن مصاريفك ليس فيها حقل ضريبة، فلا يُحسب منه صافي الضريبة. ',
        'وعروض الأسعار غير داخلة — ليست فواتير.'),
      el('div', { class: 'form-grid' }, labeled('السنة', yearSelect), labeled('الربع', quarterSelect)),
      out),
    footer: [
      el('button', { type: 'button', class: 'btn', text: '🖨️ طباعة', onClick: () => window.print() }),
      el('button', { type: 'button', class: 'btn btn-ghost', text: 'إغلاق', onClick: () => modal.close() }),
    ],
  });
}
