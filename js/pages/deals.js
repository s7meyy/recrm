// صفحة الصفقات (المرحلة ٤٣).
//
// **لماذا صارت صفحة؟** كانت الصفقةُ تُسجَّل من موضعٍ واحدٍ في النظام كلِّه: تغييرُ حالة
// مطابقةٍ إلى «أُبرمت» (`matches.js`). فبيعةٌ جاءتك مباشرةً بلا طلبٍ مسجَّل، أو صفقةٌ
// قديمةٌ تُدخلها لتبني تاريخك، أو صفقةٌ على عقارٍ لم يمرّ بمطابقة — **لا تُسجَّل أصلًا**.
//
// وأثرُ ذلك ليس نقصَ سجلّ: الصفقاتُ تغذّي توقّعَ العمولة، ولوحةَ الداشبورد، وعائدَ
// المستثمر، وإقرارَ الضريبة، وربحيّةَ كلّ مصدر عملاء. فما لا يُسجَّل يُسقِط هذه كلَّها
// **بصمت** — والرقمُ الناقص لا يُعلن عن نفسه.
//
// **ولا تُلغي هذه الصفحةُ مسارَ المطابقة**: ذاك أدقّ لأنه يربط الصفقة بطلبها وعرضها
// ويُغلقهما معًا. وهذه لما لا مطابقةَ له.

import { repo } from '../data/repository.js';
import { getLists, typeLabel, getCompany, suggestInvoiceNumber, consumeInvoiceNumber } from '../data/settings.js';
import {
  el, clear, labeled, selectEl, checkbox, badge, openModal, confirmDialog, toast, emptyState, debounce,
} from '../util/dom.js';
import { formatDate, formatSAR, formatNumber, countWord, toInputDate, fromInputDate } from '../util/format.js';
import { commissionState } from '../util/receivables.js';

const clientName = (c) => (c ? (c.name || c.phone || 'عميل') : '');

export async function render(container) {
  const ctx = { container, query: '', nodes: {} };
  await load(ctx);
  build(ctx);

  // رابطٌ عميق `#/deals/<id>` — نفس نمط بقيّة الصفحات
  const id = (/^#\/deals\/([\w-]+)/.exec(location.hash || '') || [])[1];
  if (id) {
    const deal = ctx.deals.find((d) => d.id === id);
    if (deal) openForm(ctx, deal);
    else toast('الصفقة غير موجودة، أو حُذفت', 'error');
  }
}

async function load(ctx) {
  const [deals, clients, properties, lists] = await Promise.all([
    repo.deals.list(), repo.clients.list(), repo.properties.list(), getLists(),
  ]);
  ctx.lists = lists;
  ctx.clients = clients;
  ctx.properties = properties;
  ctx.clientById = new Map(clients.map((c) => [c.id, c]));
  ctx.propertyById = new Map(properties.map((p) => [p.id, p]));
  ctx.deals = [...deals].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
}

async function refresh(ctx) {
  await load(ctx);
  build(ctx);
  window.dispatchEvent(new CustomEvent('kassab:data-changed'));
}

const propertyLabel = (ctx, id) => {
  const p = ctx.propertyById.get(id);
  return p ? `${typeLabel(ctx.lists, p.type)} — ${[p.district, p.city].filter(Boolean).join('، ')}` : '';
};

function build(ctx) {
  clear(ctx.container);
  const rows = filtered(ctx);
  const totalCommission = rows.reduce((s, d) => s + (Number(d.commission) || 0), 0);
  // الباقي لا العدد وحده (المرحلة ٤٥): «٣ عمولات لم تُقبض» لا تقول كم في ذمّتهم، وقد
  // يكون قُبض أكثرُها بالأقساط. والرقم الذي يعنيك هو **ما لم يصلك بعد**.
  const states = rows.map((d) => commissionState(d));
  const unpaid = states.filter((st) => st.total > 0 && st.remaining > 0);
  const remaining = unpaid.reduce((a, st) => a + st.remaining, 0);

  ctx.container.append(
    el('div', { class: 'page-head' },
      el('h1', {}, 'الصفقات ', el('span', { class: 'count', text: `(${formatNumber(ctx.deals.length)})` })),
      el('div', { class: 'head-actions' },
        el('input', {
          class: 'input search', type: 'search', placeholder: 'بحث بالعميل أو العقار أو الملاحظات…',
          value: ctx.query,
          onInput: debounce((e) => { ctx.query = e.target.value; build(ctx); }, 150),
        }),
        el('button', { type: 'button', class: 'btn btn-primary', text: '+ صفقة جديدة', onClick: () => openForm(ctx, null) }))),
    el('p', { class: 'muted small', text: 'الصفقةُ المسجَّلة من المطابقات تظهر هنا أيضًا — وهذه الصفحة لما جاءك مباشرةً بلا طلبٍ مسجَّل، ولما تُدخله من صفقاتك الماضية.' }),
  );

  if (ctx.deals.length) {
    ctx.container.append(el('div', { class: 'stat-strip' },
      stat(formatNumber(rows.length), 'صفقة معروضة'),
      stat(formatSAR(totalCommission), 'مجموع عمولاتها'),
      stat(formatSAR(remaining), 'باقٍ لك'),
      stat(formatNumber(unpaid.length), 'عمولة لم تكتمل')));
  }

  if (!rows.length) {
    ctx.container.append(emptyState(ctx.deals.length
      ? 'لا صفقة توافق بحثك.'
      : 'لا صفقات بعد. سجّل واحدة من الزرّ أعلاه، أو من مطابقةٍ بتغيير حالتها إلى «أُبرمت».'));
    return;
  }

  ctx.container.append(el('div', { class: 'table-wrap' }, el('table', { class: 'table' },
    el('thead', {}, el('tr', {}, ['التاريخ', 'العميل', 'العقار', 'السعر النهائي', 'العمولة', 'حالة العمولة', ''].map((t) => el('th', { text: t })))),
    el('tbody', {}, rows.map((d) => dealRow(ctx, d))))));
}

function stat(value, label) {
  return el('div', { class: 'stat-chip' },
    el('div', { class: 'stat-num', text: value }),
    el('div', { class: 'stat-label', text: label }));
}

function filtered(ctx) {
  const q = ctx.query.trim().toLowerCase();
  if (!q) return ctx.deals;
  return ctx.deals.filter((d) => [
    clientName(ctx.clientById.get(d.clientId)), propertyLabel(ctx, d.propertyId), d.notes, d.date,
  ].join(' ').toLowerCase().includes(q));
}

function dealRow(ctx, d) {
  // الحال من `commissionState` لا من `commissionPaidAt` وحده (المرحلة ٤٥): صفقةٌ قُبض
  // نصفُ عمولتها ليست «قُبضت» ولا «لم تُقبض» — وكلاهما كان يُكتب كذبًا.
  const st = commissionState(d);
  return el('tr', {},
    el('td', { text: formatDate(d.date) }),
    el('td', { text: clientName(ctx.clientById.get(d.clientId)) || '—' }),
    el('td', { text: propertyLabel(ctx, d.propertyId) || (d.notes?.includes('عرض خارجي') ? 'عرض خارجي' : '—') }),
    el('td', { class: 'num', text: d.finalPrice == null ? '—' : formatSAR(d.finalPrice) }),
    el('td', { class: 'num', text: d.commission == null ? '—' : formatSAR(d.commission) }),
    el('td', {}, d.commission == null
      ? el('span', { class: 'muted small', text: 'بلا عمولة' })
      : (st.done
        ? badge(`قُبضت ${formatDate(st.paidAt || d.commissionPaidAt)}`, 'badge-ok')
        : (st.paid > 0
          ? badge(`قُبض ${formatSAR(st.paid)} · بقي ${formatSAR(st.remaining)}`, 'badge-warn')
          : badge('لم تُقبض', 'badge-warn')))),
    el('td', {},
      el('button', { type: 'button', class: 'btn btn-sm', text: 'تعديل', onClick: () => openForm(ctx, d) })));
}

/* ===== الاستمارة ===== */

function openForm(ctx, deal) {
  const isEdit = !!deal;
  const d = deal || {};
  const dateInput = el('input', { class: 'input', type: 'date', value: d.date ? toInputDate(d.date) : toInputDate() });
  const clientSelect = selectEl({
    options: ctx.clients.map((c) => ({ value: c.id, label: clientName(c) })),
    value: d.clientId || '', placeholder: 'بلا عميل مربوط',
  });
  const propertySelect = selectEl({
    options: ctx.properties.map((p) => ({ value: p.id, label: propertyLabel(ctx, p.id) })),
    value: d.propertyId || '', placeholder: 'بلا عقار مربوط',
  });
  const priceInput = el('input', { class: 'input', type: 'number', min: '0', step: '1000', value: d.finalPrice ?? '' });
  const commissionInput = el('input', { class: 'input', type: 'number', min: '0', step: '1000', value: d.commission ?? '' });
  const paidInput = el('input', { class: 'input', type: 'date', value: d.commissionPaidAt ? toInputDate(d.commissionPaidAt) : '' });
  const leaseEndInput = el('input', { class: 'input', type: 'date', value: d.leaseEndAt ? toInputDate(d.leaseEndAt) : '' });
  const partnerName = el('input', { class: 'input', type: 'text', value: d.partnerName || '' });
  const partnerShare = el('input', { class: 'input', type: 'number', min: '0', step: '500', value: d.partnerShare ?? '' });
  const notesInput = el('textarea', { class: 'input', rows: 2, value: d.notes || '' });
  const invoiceBox = checkbox('أنشئ فاتورة بالعمولة لهذا العميل', { checked: false });
  const errorsBox = el('div', { class: 'form-errors', hidden: true });

  /* أقساط العمولة (المرحلة ٤٥) — نصفٌ عند التوقيع ونصفٌ عند الإفراغ */
  const instalments = JSON.parse(JSON.stringify(d.commissionPayments || []));
  const instWrap = el('div', {});
  const instSummary = el('p', { class: 'muted small' });

  const drawSummary = () => {
    clear(instSummary);
    const total = commissionInput.value === '' ? 0 : Number(commissionInput.value) || 0;
    if (!instalments.length) {
      instSummary.append(el('span', { text: 'بلا أقساط: تاريخُ القبض أعلاه هو الحَكَم — قُبضت كلّها أو لم يُقبض منها شيء.' }));
      return;
    }
    const scheduled = instalments.reduce((a, p) => a + (Number(p.amount) || 0), 0);
    const paid = instalments.filter((p) => p.paidAt).reduce((a, p) => a + (Number(p.amount) || 0), 0);
    instSummary.append(el('span', { text: `المجدول ${formatSAR(scheduled)} · المقبوض ${formatSAR(paid)} · الباقي ${formatSAR(total - paid)}` }));
    // **الفرق يُقال ولا يُصحَّح من خلف ظهرك:** ما لم يُجدول يبقى مستحقًّا لك ويظهر في
    // «مستحقات لم تُقبض» على تاريخ الصفقة، والمجدولُ فوق العمولة خطأُ إدخالٍ يُنبَّه عليه.
    if (total > 0 && scheduled < total) {
      instSummary.append(el('div', {}, badge(`غير مجدول: ${formatSAR(total - scheduled)} — يبقى مستحقًّا ويظهر في المستحقات`, 'badge-warn')));
    } else if (total > 0 && scheduled > total) {
      instSummary.append(el('div', {}, badge(`الأقساط تزيد عن العمولة بـ${formatSAR(scheduled - total)} — راجع الأرقام`, 'badge-danger')));
    }
  };

  const drawInstalments = () => {
    clear(instWrap);
    instalments.forEach((p, i) => {
      const due = el('input', {
        class: 'input', type: 'date', value: p.dueAt ? toInputDate(p.dueAt) : '',
        onInput: (e) => { p.dueAt = e.target.value ? fromInputDate(e.target.value) : null; },
      });
      const amount = el('input', {
        class: 'input', type: 'number', min: '0', step: '500', value: p.amount ?? '',
        onInput: (e) => { p.amount = e.target.value === '' ? null : Number(e.target.value); drawSummary(); },
      });
      const note = el('input', {
        class: 'input', type: 'text', value: p.note || '', placeholder: 'عند التوقيع، عند الإفراغ…',
        onInput: (e) => { p.note = e.target.value; },
      });
      const paidBox = checkbox('قُبض', {
        checked: !!p.paidAt,
        onChange: (e) => { p.paidAt = e.target.checked ? new Date().toISOString() : null; drawSummary(); },
      });
      instWrap.append(el('div', { class: 'plan-step' }, due, amount, note, paidBox,
        el('button', {
          type: 'button', class: 'icon-btn', text: '✕', title: 'حذف القسط',
          onClick: () => { instalments.splice(i, 1); drawInstalments(); drawSummary(); },
        })));
    });
    instWrap.append(el('div', { class: 'row' },
      el('button', {
        type: 'button', class: 'btn btn-ghost btn-sm', text: '+ قسط',
        onClick: () => {
          instalments.push({ id: `ci${Date.now()}${instalments.length}`, dueAt: null, amount: null, paidAt: null, note: '' });
          drawInstalments(); drawSummary();
        },
      }),
      // القسمة نصفين هي الصيغة الغالبة، فتُقترح بضغطة بدل كتابتها مرّتين في كل صفقة.
      el('button', {
        type: 'button', class: 'btn btn-ghost btn-sm', text: 'نصفان: التوقيع والإفراغ',
        onClick: () => {
          const total = Number(commissionInput.value) || 0;
          if (!total) { toast('اكتب العمولة أوّلًا', 'error'); return; }
          const half = Math.round(total / 2);
          instalments.length = 0;
          instalments.push(
            { id: `ci${Date.now()}a`, dueAt: fromInputDate(dateInput.value), amount: half, paidAt: null, note: 'عند التوقيع' },
            { id: `ci${Date.now()}b`, dueAt: null, amount: total - half, paidAt: null, note: 'عند الإفراغ' },
          );
          drawInstalments(); drawSummary();
        },
      })));
  };
  commissionInput.addEventListener('input', drawSummary);
  drawInstalments();
  drawSummary();

  const saveBtn = el('button', { type: 'button', class: 'btn btn-primary', text: isEdit ? 'حفظ التعديلات' : 'تسجيل الصفقة' });
  saveBtn.addEventListener('click', async () => {
    const date = fromInputDate(dateInput.value);
    const finalPrice = priceInput.value === '' ? null : Number(priceInput.value);
    if (!date || finalPrice == null) {
      clear(errorsBox);
      errorsBox.append(el('div', { text: 'التاريخ والسعر النهائي مطلوبان' }));
      errorsBox.hidden = false;
      return;
    }
    saveBtn.disabled = true;
    try {
      const commission = commissionInput.value === '' ? null : Number(commissionInput.value);
      const data = {
        date, finalPrice, commission,
        clientId: clientSelect.value || null,
        propertyId: propertySelect.value || null,
        commissionPayments: instalments.filter((p) => p.amount != null || p.dueAt || p.note),
        // بالأقساط يُشتقّ تاريخُ القبض من اكتمالها فلا يتناقض رقمان: صفقةٌ باقٍ منها شيء
        // لا تحمل تاريخَ قبضٍ كامل. وبلا أقساط يبقى ما كتبتَه بيدك كما هو.
        commissionPaidAt: instalments.length
          ? (commissionState({ commission: Number(commissionInput.value) || 0, commissionPayments: instalments }).paidAt)
          : fromInputDate(paidInput.value),
        leaseEndAt: fromInputDate(leaseEndInput.value),
        partnerName: partnerName.value.trim(),
        partnerShare: partnerShare.value === '' ? null : Number(partnerShare.value),
        notes: notesInput.value,
      };
      if (isEdit) {
        await repo.deals.update(d.id, data);
        toast('حُفظت التعديلات', 'success');
      } else {
        // مسار الصفقة يُنسخ من قالب الإعدادات لحظة الإنشاء — كما في مسار المطابقة تمامًا،
        // فلا يغيّر تعديلُ القالب لاحقًا صفقةً ماضية.
        const company = await getCompany();
        const checklist = String(company.dealChecklist || '')
          .split('\n').map((line) => line.trim()).filter(Boolean)
          .map((label, i) => ({ key: `s${i + 1}`, label, done: false, doneAt: null }));
        await repo.deals.create({ ...data, checklist });
        if (invoiceBox.querySelector('input').checked) {
          if (!commission) toast('سُجّلت الصفقة — ولم تُنشأ فاتورة لأن العمولة فارغة', 'info', 5000);
          else {
            const client = ctx.clientById.get(data.clientId);
            const number = suggestInvoiceNumber(company, 'invoice');
            await repo.invoices.create({
              type: 'invoice', number, date,
              clientId: data.clientId, clientName: clientName(client), clientPhone: client?.phone || '',
              statement: `عمولة وساطة${data.propertyId ? ` — ${propertyLabel(ctx, data.propertyId)}` : ''}`,
              items: [{ description: 'عمولة الوساطة', qty: 1, unitPrice: commission }],
            });
            await consumeInvoiceNumber('invoice', number);
            toast(`سُجّلت الصفقة وأُنشئت الفاتورة ${number}`, 'success', 5000);
          }
        } else toast('سُجّلت الصفقة', 'success');
      }
      modal.close();
      await refresh(ctx);
    } catch (err) {
      clear(errorsBox);
      errorsBox.append(...(err.errors || [err.message || 'تعذر الحفظ']).map((m) => el('div', { text: m })));
      errorsBox.hidden = false;
    } finally {
      saveBtn.disabled = false;
    }
  });

  const footer = [];
  if (isEdit) {
    footer.push(el('button', {
      type: 'button', class: 'btn btn-ghost btn-danger', text: 'حذف الصفقة',
      onClick: async () => {
        if (!await confirmDialog({ title: 'حذف الصفقة', message: 'تذهب إلى سلة المحذوفات، ويمكن استرجاعها ثلاثين يومًا.', danger: true })) return;
        await repo.deals.remove(d.id);
        modal.close();
        toast('حُذفت الصفقة', 'success');
        await refresh(ctx);
      },
    }));
  }
  footer.push(el('span', { class: 'spacer' }));
  footer.push(el('button', { type: 'button', class: 'btn btn-ghost', text: 'إلغاء', onClick: () => modal.close() }));
  footer.push(saveBtn);

  const modal = openModal({
    title: isEdit ? 'تعديل الصفقة' : 'صفقة جديدة',
    size: 'wide',
    body: el('div', {},
      errorsBox,
      el('p', { class: 'muted small', text: 'العميلُ والعقارُ اختياريّان: صفقةٌ قديمةٌ تُدخلها للتاريخ قد لا يكون طرفاها مسجَّلَين عندك، ورقمٌ صحيحٌ بلا ربطٍ أنفعُ من غيابه.' }),
      el('div', { class: 'form-grid' },
        labeled('تاريخ الصفقة', dateInput, { required: true }),
        labeled('السعر النهائي (ريال)', priceInput, { required: true }),
        labeled('العميل', clientSelect),
        labeled('العقار', propertySelect),
        labeled('العمولة (ريال)', commissionInput),
        labeled('تاريخ قبض العمولة', paidInput, { hint: 'اتركه فارغًا إن لم تُقبض بعد — فتظهر في «مستحقات لم تُقبض». وإن جدولتَ أقساطًا أدناه فهي الحَكَم، ويُهمَل هذا الحقل.' }),
        labeled('نهاية عقد الإيجار', leaseEndInput, { hint: 'للإيجار فقط — يُذكّرك بالتجديد قبل شهر' }),
        labeled('الوسيط الشريك', partnerName, { hint: 'اختياري' }),
        labeled('نصيب الشريك (ريال)', partnerShare),
        labeled('ملاحظات', notesInput, { full: true })),
      el('div', { class: 'panel-block' },
        el('h3', { text: 'أقساط العمولة' }),
        el('p', { class: 'muted small', text: 'نصفٌ عند التوقيع ونصفٌ عند الإفراغ هو الغالب — وبلا أقساط كانت الصفقة تُسجَّل مقبوضةً بالكامل أو غيرَ مقبوضة، وكلاهما غيرُ صحيح. وكلُّ قسطٍ غير مقبوض يظهر في «مستحقات لم تُقبض» بموعده هو.' }),
        instWrap, instSummary),
      isEdit ? null : el('div', { class: 'panel-block' }, invoiceBox)),
    footer,
  });
}
