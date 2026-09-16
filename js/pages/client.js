// ملف العميل الكامل (المرحلة ٢٠): كل ما يخصّه في شاشة واحدة قبل أن تتصل به.
//
// كان التطبيق لا يعرف ارتباطات العميل إلا **لحظة حذفه** (ليحذّرك)، فقبل كل مكالمة كنت
// تتنقّل بين أربع صفحات: طلباته، ومطابقاته، وصفقاته، وفواتيره ومستحقاته.
//
// **قراءة محضة:** لا ينشئ ولا يعدّل ولا يحذف شيئًا — يجمع ويعرض ويربط بالصفحات الأصلية،
// فلا مصدر حقيقة ثانيًا يمكن أن يتناقض معها.

import { repo } from '../data/repository.js';
import { ENUMS, labelFor, clientTagClass, invoiceGrandTotal, COLLECTION_LABELS, invoiceCollection, checklistProgress, duePayments } from '../data/schema.js';
import { getLists, typeLabel, getCompany } from '../data/settings.js';
import { loadMatchingContext, candidatesFor } from '../data/matching.js';
import { receivables, commissionState } from '../util/receivables.js';
import { el, clear, badge, emptyState, openModal, labeled, checkbox, promptDialog, toast } from '../util/dom.js';
import { formatSAR, formatArea, formatDate, formatDateTime, formatNumber, daysWord, toInputDate, fromInputDate, countOf } from '../util/format.js';
import { formatPhone, toInternational } from '../util/phone.js';
import { audioPlayer } from '../util/audio-note.js';
import { historyBox } from '../util/history-view.js';
import { ejarPackage, ejarText } from '../util/ejar-package.js';

function routeClientId() {
  const m = /^#\/client\/([^/?#]+)/.exec(location.hash || '');
  return m ? decodeURIComponent(m[1]) : null;
}

export async function render(container) {
  const id = routeClientId();
  clear(container);
  if (!id) {
    container.append(emptyState('افتح ملف عميل من صفحة العملاء.', el('a', { class: 'btn btn-primary', href: '#/clients', text: 'العملاء' })));
    return;
  }

  const [client, lists, match, deals, invoices, allShowings] = await Promise.all([
    repo.clients.get(id), getLists(), loadMatchingContext({ withMatches: true }),
    repo.deals.list(), repo.invoices.list(), repo.showings.list(),
  ]);
  if (!client) {
    container.append(emptyState('العميل غير موجود، أو حُذف.', el('a', { class: 'btn', href: '#/clients', text: 'العملاء' })));
    return;
  }

  const requests = match.requests.filter((r) => r.clientId === id);
  const requestIds = new Set(requests.map((r) => r.id));
  const matches = match.matches.filter((m) => requestIds.has(m.requestId));
  const myDeals = deals.filter((d) => d.clientId === id);
  const myInvoices = invoices.filter((i) => i.clientId === id);
  const due = receivables({ invoices: myInvoices, deals: myDeals });
  const properties = match.properties.filter((p) => p.ownerId === id);
  const lastContact = repo.clients.lastContactAt(client);
  const nextFollowUp = repo.clients.nextFollowUp(client);
  const name = client.name || formatPhone(client.phone) || 'عميل بلا اسم';

  /* ===== الترويسة ===== */
  container.append(el('div', { class: 'page-head' },
    el('h1', {}, name, ' ', ...(client.tags || []).filter(clientTagClass).map((t) => badge(t, clientTagClass(t)))),
    el('div', { class: 'head-actions' },
      client.phone ? el('a', { class: 'btn', href: `tel:${client.phone}`, text: '📞 اتصال', 'data-sensitive': true }) : null,
      client.phone ? el('a', {
        class: 'btn', text: '💬 واتساب', 'data-sensitive': true,
        href: `https://wa.me/${toInternational(client.phone)}`, target: '_blank', rel: 'noopener noreferrer',
      }) : null,
      el('a', { class: 'btn btn-ghost', href: `#/clients/${client.id}`, text: 'تعديل البيانات' }))));

  container.append(el('div', { class: 'stat-strip' },
    stat(labelFor(ENUMS.clientStages, client.stage), 'المرحلة'),
    stat(lastContact ? daysWord(Math.floor((Date.now() - new Date(lastContact)) / 86400000)) : 'لم يُسجَّل', 'منذ آخر تواصل'),
    stat(formatNumber(requests.length), 'طلب'),
    stat(formatNumber(myDeals.length), 'صفقة'),
    due.total > 0 ? stat(formatSAR(due.total), 'مستحق لك عليه') : null));

  if (nextFollowUp) {
    container.append(el('div', { class: 'notice' },
      el('strong', { text: `موعد المتابعة: ${formatDate(nextFollowUp)}` }),
      new Date(nextFollowUp) < Date.now() ? ' — فات.' : ''));
  }

  const grid = el('div', { class: 'today-grid' });
  container.append(grid);

  // سجلّ التغييرات (المرحلة ٣٥): «متى صار مهتمًّا؟» و«من غيّر رقمه؟» أسئلةٌ تُطرح، وجوابها
  // كان يُكتب في السجل ولا يُعرض. ومطويٌّ لأنه جوابٌ عند الحاجة لا معلومةٌ تُقرأ كل مرّة.
  const hist = historyBox(client);
  if (hist) container.append(hist);

  /* ===== طلباته ومرشّحوها ===== */
  grid.append(panel('طلباته', requests.length, requests.length
    ? el('div', {}, requests.map((r) => {
      const count = r.status === 'active' ? candidatesFor(r, match, { minScore: match.settings.minScore }).length : null;
      return row(
        `${typeLabel(lists, r.type)} — ${(r.districts || []).join('، ') || r.city}`,
        [
          r.budgetMax == null ? 'بلا سقف' : `حتى ${formatSAR(r.budgetMax)}`,
          r.area == null ? null : formatArea(r.area),
          labelFor(ENUMS.requestStatuses, r.status),
          count == null ? null : `${countOf(count, 'مرشح')}`,
        ].filter(Boolean).join(' · '),
        el('a', { class: 'btn btn-ghost btn-sm', href: `#/matches/${r.id}`, text: 'المطابقات' }));
    }))
    : el('p', { class: 'muted small', text: 'لا طلبات مسجَّلة له.' }), '#/requests'));

  /* ===== سجل التواصل ===== */
  const contacts = [...(client.contacts || [])].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  grid.append(panel('سجل التواصل', contacts.length, contacts.length
    ? el('div', {}, contacts.slice(0, 10).map((c) => row(
      labelFor(ENUMS.contactTypes, c.type),
      `${formatDateTime(c.date)}${c.note ? ` — ${c.note}` : ''}`,
      c.audioId ? audioPlayer(c.audioId, c.audioSeconds) : null)))
    : el('p', { class: 'muted small', text: 'لم يُسجَّل تواصل بعد — سجّله من «يومي» بعد كل مكالمة.' })));

  /* ===== معاينـاته (المرحلة ٢٧) ===== */
  const myShowings = allShowings
    .filter((x) => x.clientId === client.id)
    .sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
  if (myShowings.length) {
    const propsById = new Map(match.properties.map((p) => [p.id, p]));
    const extById = new Map((match.externals || []).map((p) => [p.id, p]));
    grid.append(panel('معايناته', myShowings.length,
      el('div', {}, myShowings.slice(0, 10).map((x) => {
        const p = x.propertyId ? propsById.get(x.propertyId) : extById.get(x.externalId);
        return row(
          p ? `${typeLabel(lists, p.type)} — ${[p.district, p.city].filter(Boolean).join('، ')}` : 'عقار محذوف',
          `${formatDateTime(x.at)} · ${labelFor(ENUMS.showingStatuses, x.status)}`
            + (x.impression ? ` · ${labelFor(ENUMS.showingImpressions, x.impression)}` : '')
            + (x.notes ? ` — ${x.notes}` : ''),
          null);
      }))));
  }

  /* ===== ما عُرض عليه ===== */
  const shown = matches.filter((m) => m.status !== 'new');
  grid.append(panel('ما عُرض عليه', shown.length, shown.length
    ? el('div', {}, shown.slice(0, 10).map((m) => {
      const listing = match.properties.find((p) => p.id === m.propertyId)
        || match.externals.find((x) => x.id === m.externalId);
      return row(
        listing ? `${typeLabel(lists, listing.type)} — ${listing.district || listing.city || ''}` : 'معروض محذوف',
        `${labelFor(ENUMS.matchStatuses, m.status)}${m.rejectReason ? ` · ${labelFor(ENUMS.matchRejectReasons, m.rejectReason)}` : ''} · ${m.score}٪`,
        listing ? el('a', { class: 'btn btn-ghost btn-sm', href: `#/properties/${listing.id}`, text: 'العقار' }) : null);
    }))
    : el('p', { class: 'muted small', text: 'لم يُعرض عليه شيء بعد.' })));

  /* ===== صفقاته وفواتيره ===== */
  grid.append(panel('صفقاته', myDeals.length, myDeals.length
    ? el('div', {}, myDeals.map((d) => {
      const progress = checklistProgress(d);
      const due = duePayments(d);
      return row(
        formatDate(d.date),
        [
          formatSAR(d.finalPrice),
          d.commission ? `عمولة ${formatSAR(d.commission)}` : null,
          d.partnerName ? `شريك ${d.partnerName} (${formatSAR(d.partnerShare || 0)})` : null,
          // حال العمولة من `commissionState` (المرحلة ٤٥): «لم تُقبض» على صفقةٍ قُبض نصفُها خطأ.
          commissionLine(d),
          progress ? `المسار ${progress.done}/${progress.total}` : null,
          due.length ? `${countOf(due.length, 'دفعة مستحقة')}` : null,
        ].filter(Boolean).join(' · '),
        el('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: 'إدارة', onClick: () => openDeal(d, lists, client) }));
    }))
    : el('p', { class: 'muted small', text: 'لا صفقات معه بعد.' })));

  grid.append(panel('فواتيره', myInvoices.length, myInvoices.length
    ? el('div', {}, myInvoices.map((i) => row(
      `${labelFor(ENUMS.invoiceTypes, i.type)} ${i.number || ''}`.trim(),
      `${formatSAR(invoiceGrandTotal(i))} · ${COLLECTION_LABELS[invoiceCollection(i)]}`,
      el('a', { class: 'btn btn-ghost btn-sm', href: `#/invoices/${i.id}`, text: 'فتح' }))))
    : el('p', { class: 'muted small', text: 'لا فواتير باسمه.' }), '#/invoices'));

  /* ===== عقاراته (إن كان مالكًا) ===== */
  if (properties.length) {
    grid.append(panel('عقاراته عندك', properties.length,
      el('div', {}, properties.map((p) => row(
        `${typeLabel(lists, p.type)} — ${p.district || p.city || ''}`,
        [p.price == null ? 'بلا سعر' : formatSAR(p.price), formatArea(p.area)].filter(Boolean).join(' · '),
        el('a', { class: 'btn btn-ghost btn-sm', href: `#/properties/${p.id}`, text: 'فتح' })))),
      '#/properties'));
  }

  if (client.notes) {
    grid.append(panel('ملاحظاتك', null, el('p', { 'data-sensitive': true, text: client.notes })));
  }
}

/**
 * إدارة الصفقة (المرحلة ٢٤): مسارها ومستنداتها · دفعات الإيجار · العمولة المشتركة.
 *
 * هنا **وحده** لأن الصفقة لا صفحة لها: تُنشأ من المطابقات ولا تُعدَّل بعدها في أي مكان.
 * وهذه أقرب شاشة إليها منطقيًا — ملف صاحبها.
 */
/** عبارةُ حال العمولة في سطر الصفقة: مكتملةً تُترك، وإلا يُقال ما بقي (المرحلة ٤٥). */
function commissionLine(deal) {
  const st = commissionState(deal);
  if (st.total <= 0 || st.done) return null;
  return st.paid > 0 ? `بقي ${formatSAR(st.remaining)} من العمولة` : 'لم تُقبض';
}

function openDeal(deal, lists, client = null) {
  const draft = JSON.parse(JSON.stringify(deal));
  draft.payments = draft.payments || [];
  draft.checklist = draft.checklist || [];
  const errorsBox = el('div', { class: 'form-errors', hidden: true });

  /* المسار */
  const checklistWrap = el('div', {});
  const drawChecklist = () => {
    clear(checklistWrap);
    if (!draft.checklist.length) {
      checklistWrap.append(el('p', { class: 'muted small', text: 'لا مسار لهذه الصفقة. اكتب بنوده في الإعدادات ← بيانات الشركة، أو أضف بندًا هنا.' }));
    }
    draft.checklist.forEach((item, i) => {
      const box = checkbox(item.label, {
        checked: item.done,
        onChange: (e) => { item.done = e.target.checked; item.doneAt = e.target.checked ? new Date().toISOString() : null; },
      });
      checklistWrap.append(el('div', { class: 'trash-row' }, box,
        el('button', { type: 'button', class: 'icon-btn', text: '✕', title: 'حذف البند', onClick: () => { draft.checklist.splice(i, 1); drawChecklist(); } })));
    });
    checklistWrap.append(el('button', {
      type: 'button', class: 'btn btn-ghost btn-sm', text: '+ بند',
      onClick: async () => {
        const label = await promptDialog({ title: 'بند جديد', label: 'اسم البند', confirmText: 'إضافة' });
        if (!label) return;
        draft.checklist.push({ label, done: false });
        drawChecklist();
      },
    }));
  };
  drawChecklist();

  /* الدفعات */
  const paymentsWrap = el('div', {});
  const drawPayments = () => {
    clear(paymentsWrap);
    if (!draft.payments.length) {
      paymentsWrap.append(el('p', { class: 'muted small', text: 'لا دفعات. أضف جدول دفعات الإيجار لتظهر مستحقّاتها في «يومي».' }));
    }
    draft.payments.forEach((p, i) => {
      const dateInput = el('input', { class: 'input', type: 'date', value: p.dueAt ? toInputDate(p.dueAt) : '', onInput: (e) => { p.dueAt = e.target.value ? fromInputDate(e.target.value) : null; } });
      const amountInput = el('input', { class: 'input', type: 'number', min: '0', step: '100', value: p.amount ?? '', onInput: (e) => { p.amount = e.target.value === '' ? null : Number(e.target.value); } });
      const noteInput = el('input', { class: 'input', type: 'text', value: p.note || '', placeholder: 'وصف (الدفعة الأولى…)', onInput: (e) => { p.note = e.target.value; } });
      const paidBox = checkbox('قُبضت', { checked: !!p.paidAt, onChange: (e) => { p.paidAt = e.target.checked ? new Date().toISOString() : null; } });
      paymentsWrap.append(el('div', { class: 'plan-step' }, dateInput, amountInput, noteInput, paidBox,
        el('button', { type: 'button', class: 'icon-btn', text: '✕', title: 'حذف الدفعة', onClick: () => { draft.payments.splice(i, 1); drawPayments(); } })));
    });
    paymentsWrap.append(el('div', { class: 'row' },
      el('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: '+ دفعة', onClick: () => { draft.payments.push({ dueAt: null, amount: null, note: '' }); drawPayments(); } }),
      el('button', {
        type: 'button', class: 'btn btn-ghost btn-sm', text: '+ جدول ١٢ شهرًا',
        title: 'يوزّع مبلغًا شهريًا ابتداءً من الشهر القادم',
        onClick: async () => {
          const value = await promptDialog({ title: 'جدول شهري', label: 'قيمة الدفعة الشهرية', confirmText: 'أنشئ' });
          const amount = Number(value);
          if (!Number.isFinite(amount) || amount <= 0) return;
          const start = new Date();
          for (let m = 1; m <= 12; m++) {
            const at = new Date(start.getFullYear(), start.getMonth() + m, start.getDate());
            draft.payments.push({ dueAt: at.toISOString(), amount, note: `الشهر ${m}` });
          }
          drawPayments();
        },
      })));
  };
  drawPayments();

  /* العمولة والشريك */
  const commissionInput = el('input', { class: 'input', type: 'number', min: '0', step: '100', value: draft.commission ?? '' });
  const partnerInput = el('input', { class: 'input', type: 'text', value: draft.partnerName || '', placeholder: 'اسم الوسيط الشريك' });
  const shareInput = el('input', { class: 'input', type: 'number', min: '0', step: '100', value: draft.partnerShare ?? '' });
  const partnerPaidBox = checkbox('سلّمتُه نصيبه', { checked: !!draft.partnerPaidAt });
  // بالأقساط لا يُعرض مربّعُ «قُبضت»: الأقساط هي الحَكَم، ومربّعٌ يخالفها يكتب رقمين
  // متناقضين في سجلٍّ واحد. ويُعرض ما قُبض منها، وتحريرُها في صفحة الصفقات حيث محرّرها.
  const cstate = commissionState(draft);
  const commissionPaidBox = cstate.split
    ? el('div', { class: 'muted small' },
      el('div', { text: `أقساط: قُبض ${formatSAR(cstate.paid)} من ${formatSAR(cstate.total)} · بقي ${formatSAR(cstate.remaining)}` }),
      el('a', { class: 'btn btn-ghost btn-sm', href: `#/deals/${draft.id}`, text: 'حرّر الأقساط في الصفقات' }))
    : checkbox('قُبضت العمولة', { checked: !!draft.commissionPaidAt });
  const netNode = el('p', { class: 'muted small' });
  const recalcNet = () => {
    const total = Number(commissionInput.value) || 0;
    const share = Number(shareInput.value) || 0;
    netNode.textContent = share > 0
      ? `صافيك بعد نصيب الشريك: ${formatSAR(Math.max(0, total - share))}`
      : `صافيك: ${formatSAR(total)}`;
  };
  commissionInput.addEventListener('input', recalcNet);
  shareInput.addEventListener('input', recalcNet);
  recalcNet();

  const save = async () => {
    errorsBox.hidden = true;
    try {
      await repo.deals.update(deal.id, {
        commission: commissionInput.value === '' ? null : Number(commissionInput.value),
        // بالأقساط يبقى ما اشتُقّ منها كما هو، ولا يكتب هذا النموذج فوقه.
        ...(cstate.split ? {} : {
          commissionPaidAt: commissionPaidBox.querySelector('input').checked ? (deal.commissionPaidAt || new Date().toISOString()) : null,
        }),
        partnerName: partnerInput.value,
        partnerShare: shareInput.value === '' ? null : Number(shareInput.value),
        partnerPaidAt: partnerPaidBox.querySelector('input').checked ? (deal.partnerPaidAt || new Date().toISOString()) : null,
        payments: draft.payments,
        checklist: draft.checklist,
      });
      modal.close();
      toast('حُفظت الصفقة', 'success');
      window.dispatchEvent(new CustomEvent('kassab:data-changed'));
      render(document.getElementById('page'));
    } catch (err) {
      clear(errorsBox);
      errorsBox.append(el('ul', {}, (err.errors || [err.message]).map((m) => el('li', { text: m }))));
      errorsBox.hidden = false;
    }
  };

  // يظهر لصفقةٍ إيجارية وحدها: لها نهاية عقدٍ أو جدول دفعات. والبيع لا عقد إيجار له.
  const isLease = !!deal.leaseEndAt || (deal.payments || []).length > 0;
  const ejarBtn = isLease
    ? el('button', {
      type: 'button', class: 'btn', text: '📄 حزمة عقد إيجار',
      title: 'تجمع حقول العقد من سجلاتك في ورقة واحدة',
      onClick: () => showEjarPackage(deal, client),
    })
    : null;

  const modal = openModal({
    title: `صفقة ${formatDate(deal.date)} — ${formatSAR(deal.finalPrice)}`,
    size: 'wide',
    body: el('div', {}, errorsBox,
      el('h3', { class: 'section-title', text: 'العمولة' }),
      el('div', { class: 'form-grid' },
        labeled('العمولة', commissionInput),
        el('div', { class: 'field' }, el('span', { class: 'field-label', text: 'التحصيل' }), commissionPaidBox),
        labeled('وسيط شريك', partnerInput, { hint: 'اتركه فارغًا إن كانت العمولة كلها لك' }),
        labeled('نصيبه', shareInput)),
      el('div', { class: 'field' }, partnerPaidBox),
      netNode,
      el('h3', { class: 'section-title', style: { marginTop: '14px' }, text: 'مسار الصفقة ومستنداتها' }),
      checklistWrap,
      el('h3', { class: 'section-title', style: { marginTop: '14px' }, text: 'جدول الدفعات' }),
      paymentsWrap),
    footer: [
      el('button', { type: 'button', class: 'btn btn-primary', text: 'حفظ', onClick: save }),
      ejarBtn,
      el('span', { class: 'spacer' }),
      el('button', { type: 'button', class: 'btn btn-ghost', text: 'إغلاق', onClick: () => modal.close() }),
    ],
  });
}

/**
 * «حزمة عقد إيجار» (المرحلة ٣٧) — تعمل الآن بلا اشتراك ولا مفتاح.
 *
 * منصّة «إيجار» لا تفتح واجهةً برمجية عامة يُسجَّل بها من أي تطبيق، فالوعد بالتسجيل الآلي
 * وعدٌ لا يُوفى. والذي يُوفى: أن تُجمع حقول العقد من سجلاتك في ورقةٍ تنقلها مرّة واحدة،
 * بدل التنقّل بين أربع شاشات تنسخ رقمًا رقمًا. **وما ينقص يُقال ولا يُملأ بتخمين.**
 */
async function showEjarPackage(deal, client) {
  const [property, company] = await Promise.all([
    deal.propertyId ? repo.properties.get(deal.propertyId) : null,
    getCompany(),
  ]);
  const owner = property?.ownerId ? await repo.clients.get(property.ownerId) : null;
  const pkg = ejarPackage({ deal, property, tenant: client, owner, company });
  const text = ejarText(pkg);

  const body = el('div', {},
    el('p', { class: 'muted small', text: 'منصّة «إيجار» لا تفتح واجهة تسجيلٍ عامة، فهذه الحزمة تُنقل يدويًّا مرّة واحدة — وهي أكثر ما يختصر الوقت على كل حال.' }),
    el('table', { class: 'table' }, el('tbody', {}, pkg.rows.map(([k, v]) => el('tr', {},
      el('th', { style: { width: '38%' }, text: k }),
      v == null || v === ''
        ? el('td', {}, badge('ناقص في سجلاتك', 'badge-warn'))
        : el('td', { text: String(v) }))))));

  const modal = openModal({
    title: 'حزمة عقد إيجار',
    size: 'wide',
    body,
    footer: [
      el('button', {
        type: 'button', class: 'btn btn-primary', text: '📋 انسخ الحزمة',
        onClick: async () => {
          try { await navigator.clipboard.writeText(text); toast('نُسخت — الصقها في إيجار', 'success'); }
          catch (_) { toast('تعذّر النسخ — حدّدها بيدك من الجدول', 'error'); }
        },
      }),
      el('span', { class: 'spacer' }),
      el('button', { type: 'button', class: 'btn btn-ghost', text: 'إغلاق', onClick: () => modal.close() }),
    ],
  });
}

function stat(value, label) {
  return el('div', { class: 'stat-chip' },
    el('div', { class: 'stat-num', text: String(value) }),
    el('div', { class: 'stat-label', text: label }));
}

function panel(title, count, body, href = null) {
  return el('section', { class: 'panel today-panel' },
    el('div', { class: 'today-head' },
      el('h2', {}, title, count == null ? '' : ` (${formatNumber(count)})`),
      href ? el('a', { class: 'small', href, text: 'الصفحة →' }) : null),
    body);
}

function row(title, detail, action) {
  return el('div', { class: 'today-row' },
    el('div', {},
      el('div', { class: 'strong', text: title }),
      detail ? el('div', { class: 'muted small', text: detail }) : null),
    action);
}
