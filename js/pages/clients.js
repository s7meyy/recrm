// صفحة العملاء: الأدوار المتعددة، المراحل، التصنيفات، وسجل التواصل بمواعيد المتابعة.

import { repo, ValidationError } from '../data/repository.js';
import { ENUMS, labelFor, clientTagClass, clientPriority } from '../data/schema.js';
import { getLists, addClientTag, typeLabel, statusLabel } from '../data/settings.js';
import { sourceField, rememberSource, sourceBadge } from '../util/source-field.js';
import {
  el, clear, labeled, fieldGroup, selectEl, checkbox, badge, openModal, confirmDialog,
  promptDialog, toast, emptyState, debounce,
} from '../util/dom.js';
import {
  formatDate, formatDateTime, formatSAR, relativeDays, daysBetween, daysWord,
  toInputDateTime, fromInputDateTime, fromInputDate,
} from '../util/format.js';
import { matchesQuery } from '../util/arabic.js';
import { formatPhone } from '../util/phone.js';

const GROUPS = [['role', 'الدور'], ['stage', 'المرحلة'], ['tag', 'التصنيف']];
const VALUES = { role: (c) => c.roles || [], stage: (c) => [c.stage], tag: (c) => c.tags || [] };
const STAGE_STYLE = { new: '', contacted: 'badge-accent', negotiating: 'badge-warn', won: 'badge-ok', closed: '' };

// يقرأ #/clients/<id> (نفس نمط #/matches/<requestId> الموثّق) — يستعمله البحث العام (المرحلة ٦).
function routeClientId() {
  const m = /^#\/clients\/([^/?#]+)/.exec(location.hash || '');
  return m ? decodeURIComponent(m[1]) : null;
}

export async function render(container) {
  const ctx = {
    container, query: '',
    filters: Object.fromEntries(GROUPS.map(([k]) => [k, new Set()])),
    clients: [], properties: [], lists: null, nodes: {},
  };
  await loadData(ctx);
  buildLayout(ctx);
  const focusId = routeClientId();
  if (focusId) {
    const target = ctx.clients.find((c) => c.id === focusId);
    if (target) await openForm(ctx, target);
    else toast('العميل غير موجود، أو حُذف', 'error');
  }
}

async function loadData(ctx) {
  const [clients, properties, lists] = await Promise.all([repo.clients.list(), repo.properties.list(), getLists()]);
  // الأولوية أولًا («جادّ» ثم «مهم»)، ثم آخر تعديل كما كان (المرحلة ٨).
  clients.sort((a, b) => (clientPriority(b) - clientPriority(a)) || (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  ctx.clients = clients;
  ctx.properties = properties;
  ctx.lists = lists;
}

async function refresh(ctx) {
  await loadData(ctx);
  renderFilters(ctx);
  renderList(ctx);
}

function buildLayout(ctx) {
  clear(ctx.container);
  ctx.nodes.count = el('span', { class: 'count' });
  ctx.container.append(el('div', { class: 'page-head' },
    el('h1', {}, 'العملاء ', ctx.nodes.count),
    el('div', { class: 'head-actions' },
      el('input', {
        class: 'input search', type: 'search', placeholder: 'بحث بالاسم أو الجوال أو الملاحظات…',
        onInput: debounce((e) => { ctx.query = e.target.value; renderFilters(ctx); renderList(ctx); }, 150),
      }),
      el('button', { type: 'button', class: 'btn btn-primary', text: '+ إضافة عميل', onClick: () => openForm(ctx, null) }))));
  ctx.nodes.filters = el('div', { class: 'filters' });
  ctx.nodes.list = el('div');
  ctx.container.append(ctx.nodes.filters, ctx.nodes.list);
  renderFilters(ctx);
  renderList(ctx);
}

/* ===== الفرز ===== */

function passes(ctx, c, exceptGroup = null) {
  for (const [g] of GROUPS) {
    if (g === exceptGroup) continue;
    const set = ctx.filters[g];
    if (set.size && !VALUES[g](c).some((v) => set.has(v))) return false;
  }
  return !ctx.query || matchesQuery(c.searchKey, ctx.query);
}

function optionsFor(ctx, group) {
  switch (group) {
    case 'role': return ENUMS.clientRoles.map((r) => ({ value: r.key, label: r.label }));
    case 'stage': return ENUMS.clientStages.map((s) => ({ value: s.key, label: s.label }));
    case 'tag': return ctx.lists.clientTags.map((t) => ({ value: t, label: t }));
    default: return [];
  }
}

function renderFilters(ctx) {
  const wrap = ctx.nodes.filters;
  clear(wrap);
  for (const [group, label] of GROUPS) {
    const options = optionsFor(ctx, group);
    if (!options.length) continue;
    const chips = el('div', { class: 'chips' });
    for (const opt of options) {
      const n = ctx.clients.filter((c) => passes(ctx, c, group) && VALUES[group](c).includes(opt.value)).length;
      const active = ctx.filters[group].has(opt.value);
      chips.append(el('button', {
        type: 'button', class: `chip${active ? ' active' : ''}${n === 0 && !active ? ' zero' : ''}`,
        onClick: () => {
          if (active) ctx.filters[group].delete(opt.value); else ctx.filters[group].add(opt.value);
          renderFilters(ctx);
          renderList(ctx);
        },
      }, opt.label, el('span', { class: 'chip-count', text: String(n) })));
    }
    wrap.append(el('div', { class: 'filter-row' }, el('span', { class: 'filter-label', text: label }), chips));
  }
  if (GROUPS.some(([g]) => ctx.filters[g].size)) {
    wrap.append(el('div', {}, el('button', {
      type: 'button', class: 'btn btn-ghost btn-sm', text: 'مسح الفرز',
      onClick: () => { for (const [g] of GROUPS) ctx.filters[g].clear(); renderFilters(ctx); renderList(ctx); },
    })));
  }
}

/* ===== القائمة ===== */

function stageBadge(stage) {
  return badge(labelFor(ENUMS.clientStages, stage), STAGE_STYLE[stage] || '');
}

function followUpNode(client) {
  const f = repo.clients.nextFollowUp(client);
  if (!f) return el('span', { class: 'muted', text: '—' });
  const diff = daysBetween(new Date().toISOString(), f); // موجب = في المستقبل
  if (diff == null) return el('span', { class: 'muted', text: '—' });
  if (diff < 0) return badge(`متأخرة ${daysWord(-diff)}`, 'badge-danger');
  if (diff === 0) return badge('اليوم', 'badge-warn');
  return el('span', {}, formatDate(f), el('span', { class: 'muted small' }, ` (بعد ${daysWord(diff)})`));
}

function lastContactNode(client) {
  const last = repo.clients.lastContactAt(client);
  if (!last) return el('span', { class: 'muted', text: 'لم يُسجَّل' });
  return el('span', {}, formatDate(last), el('span', { class: 'muted small' }, ` (${relativeDays(last)})`));
}

function phoneLink(phone) {
  if (!phone) return el('span', { class: 'muted', text: '—' });
  return el('a', { class: 'tel', href: `tel:${phone}`, text: formatPhone(phone), onClick: (e) => e.stopPropagation() });
}

function renderList(ctx) {
  const items = ctx.clients.filter((c) => passes(ctx, c));
  ctx.nodes.count.textContent = items.length === ctx.clients.length
    ? `(${ctx.clients.length})`
    : `(${items.length} من ${ctx.clients.length})`;
  const area = ctx.nodes.list;
  clear(area);
  if (!ctx.clients.length) {
    area.append(emptyState('لا يوجد عملاء بعد. أضف أول عميل من الزر أعلاه.'));
    return;
  }
  if (!items.length) {
    area.append(emptyState('لا نتائج تطابق الفرز أو البحث.'));
    return;
  }
  const head = el('tr', {}, ['الاسم', 'الجوال', 'الأدوار', 'المرحلة', 'التصنيفات', 'آخر تواصل', 'المتابعة القادمة'].map((t) => el('th', { text: t })));
  const body = el('tbody', {}, items.map((c) => el('tr', { class: `row-priority-${clientPriority(c)}`, onClick: () => openDetail(ctx, c.id) },
    el('td', { class: 'strong' }, c.name || el('span', { class: 'muted', text: 'بلا اسم' }), sourceBadge(c.referralSource)),
    el('td', {}, phoneLink(c.phone)),
    el('td', {}, (c.roles || []).map((r) => labelFor(ENUMS.clientRoles, r)).join('، ') || '—'),
    el('td', {}, stageBadge(c.stage)),
    el('td', {}, (c.tags || []).length ? c.tags.map((t) => badge(t, clientTagClass(t))) : '—'),
    el('td', {}, lastContactNode(c)),
    el('td', {}, followUpNode(c)))));
  area.append(el('div', { class: 'table-wrap' }, el('table', { class: 'table' }, el('thead', {}, head), body)));
}

/* ===== تفاصيل العميل وسجل التواصل ===== */

async function openDetail(ctx, clientId) {
  let client = await repo.clients.get(clientId);
  if (!client) { toast('العميل غير موجود', 'error'); return; }
  const body = el('div');

  const draw = () => {
    clear(body);
    const owned = ctx.properties.filter((p) => p.ownerId === client.id);

    body.append(el('div', { class: 'detail-head' },
      el('div', { class: 'row' }, phoneLink(client.phone), client.phone2 ? el('span', { class: 'muted' }, ' / ', phoneLink(client.phone2)) : null),
      el('div', { class: 'badges' },
        stageBadge(client.stage),
        ...(client.roles || []).map((r) => badge(labelFor(ENUMS.clientRoles, r), 'badge-accent')),
        ...(client.tags || []).map((t) => badge(t, clientTagClass(t))),
        sourceBadge(client.referralSource)),
      client.notes ? el('p', { class: 'muted', text: client.notes }) : null,
      el('div', { class: 'row' },
        el('span', { class: 'small muted' }, 'آخر تواصل: ', lastContactNode(client)),
        el('span', { class: 'small muted' }, ' · المتابعة القادمة: ', followUpNode(client)))));

    /* إضافة تواصل */
    const typeSel = selectEl({ options: ENUMS.contactTypes.map((t) => ({ value: t.key, label: t.label })), value: 'call' });
    const dateInput = el('input', { class: 'input', type: 'datetime-local', value: toInputDateTime() });
    const noteInput = el('textarea', { class: 'input', rows: 2, placeholder: 'ماذا دار في التواصل؟' });
    const followInput = el('input', { class: 'input', type: 'date' });
    const addBtn = el('button', {
      type: 'button', class: 'btn btn-primary btn-sm', text: 'تسجيل التواصل',
      onClick: async () => {
        const date = fromInputDateTime(dateInput.value);
        if (!date) { toast('حدد تاريخ التواصل', 'error'); return; }
        addBtn.disabled = true;
        try {
          client = await repo.clients.addContact(client.id, {
            type: typeSel.value, date, note: noteInput.value, followUpAt: fromInputDate(followInput.value),
          });
          toast('سُجّل التواصل', 'success');
          draw();
          await refresh(ctx);
        } catch (err) {
          toast(err.message, 'error');
        } finally {
          addBtn.disabled = false;
        }
      },
    });
    const contacts = [...(client.contacts || [])].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    body.append(el('div', { class: 'detail-section' },
      el('h3', { text: `سجل التواصل (${contacts.length})` }),
      el('div', { class: 'form-grid' },
        labeled('النوع', typeSel),
        labeled('التاريخ والوقت', dateInput),
        labeled('ملاحظة', noteInput, { full: true }),
        labeled('موعد المتابعة القادمة', followInput, { hint: 'اختياري' }),
        el('div', { class: 'field', style: { justifyContent: 'flex-end' } }, addBtn)),
      contacts.length
        ? el('div', { class: 'contact-list' }, contacts.map((c) => el('div', { class: 'contact-item' },
          el('span', { class: 'contact-type', text: labelFor(ENUMS.contactTypes, c.type) }),
          el('span', { class: 'contact-date', text: formatDateTime(c.date) }),
          el('button', {
            type: 'button', class: 'icon-btn', text: '✕', title: 'حذف هذا التواصل',
            onClick: async () => {
              const ok = await confirmDialog({ title: 'حذف التواصل', message: 'حذف هذا السجل من سجل التواصل؟', confirmText: 'حذف', danger: true });
              if (!ok) return;
              client = await repo.clients.removeContact(client.id, c.id);
              draw();
              await refresh(ctx);
            },
          }),
          c.note ? el('span', { class: 'contact-note', text: c.note }) : null,
          c.followUpAt ? el('span', { class: 'contact-follow' }, 'متابعة: ', formatDate(c.followUpAt), ` (${relativeDays(c.followUpAt)})`) : null)))
        : el('p', { class: 'muted small', text: 'لم يُسجَّل أي تواصل بعد.' })));

    /* عقاراته */
    body.append(el('div', { class: 'detail-section' },
      el('h3', { text: `عقاراته (${owned.length})` }),
      owned.length
        ? el('ul', { class: 'simple-list' }, owned.map((p) => el('li', {},
          el('span', {}, `${typeLabel(ctx.lists, p.type)} — ${[p.district, p.city].filter(Boolean).join('، ')}`),
          el('span', { class: 'muted small' }, `${formatSAR(p.price)} · ${statusLabel(ctx.lists, p.status)}`))))
        : el('p', { class: 'muted small', text: 'لا عقارات مربوطة بهذا العميل.' })));
  };
  draw();

  const modal = openModal({
    title: client.name || formatPhone(client.phone) || 'عميل',
    body, size: 'wide',
    footer: [
      el('button', {
        type: 'button', class: 'btn btn-ghost btn-danger', text: 'حذف العميل',
        onClick: async () => {
          // الحذف لا يحدث تلقائيًا أبدًا: يُعرض الأثر بالأرقام ثم يُمرَّر force بقرارك الصريح.
          let impact;
          try {
            impact = await repo.clients.deleteImpact(client.id);
          } catch (err) {
            toast(err.message || 'تعذر فحص ارتباطات العميل', 'error');
            return;
          }
          const lines = ['سيُحذف العميل وسجل تواصله نهائيًا.'];
          if (impact.properties) lines.push(`عقاراته (${impact.properties}) تبقى في المخزون ويصبح مالكها غير مربوط.`);
          if (impact.requests) lines.push(`طلباته (${impact.requests}) تُحذف هي ومطابقاتها.`);
          if (impact.deals) lines.push(`صفقاته (${impact.deals}) تبقى محفوظة بلا عميل مربوط (حفظًا لتاريخ الصفقات).`);
          if (impact.invoices) lines.push(`فواتيره وعروض أسعاره (${impact.invoices}) تبقى كما طُبعت باسمه وجواله المحفوظين فيها.`);
          const ok = await confirmDialog({
            title: 'حذف العميل', message: lines.join(' '), confirmText: 'حذف نهائي', danger: true,
          });
          if (!ok) return;
          try {
            await repo.clients.remove(client.id, { force: true });
            modal.close();
            toast('تم حذف العميل', 'success');
            await refresh(ctx);
          } catch (err) {
            toast(err.message || 'تعذر الحذف', 'error', 6000);
          }
        },
      }),
      el('span', { class: 'spacer' }),
      el('button', { type: 'button', class: 'btn btn-ghost', text: 'إغلاق', onClick: () => modal.close() }),
      el('button', { type: 'button', class: 'btn', text: 'تعديل البيانات', onClick: () => { modal.close(); openForm(ctx, client); } }),
    ],
  });
}

/* ===== نموذج الإضافة والتعديل ===== */

async function openForm(ctx, existing) {
  const isEdit = !!existing;
  const draft = existing ? JSON.parse(JSON.stringify(existing)) : repo.clients.defaults();
  const errorsBox = el('div', { class: 'form-errors', hidden: true });
  const showErrors = (errors) => {
    clear(errorsBox);
    errorsBox.append(el('ul', {}, errors.map((e) => el('li', { text: e }))));
    errorsBox.hidden = false;
  };

  const nameInput = el('input', { class: 'input', type: 'text', value: draft.name || '' });
  const phoneInput = el('input', { class: 'input', type: 'tel', value: draft.phone || '', dir: 'ltr', placeholder: '05xxxxxxxx' });
  const phone2Input = el('input', { class: 'input', type: 'tel', value: draft.phone2 || '', dir: 'ltr' });
  const rolesBox = el('div', { class: 'check-group' }, ENUMS.clientRoles.map((r) => checkbox(r.label, { name: 'role', value: r.key, checked: (draft.roles || []).includes(r.key) })));
  const stageSelect = selectEl({ options: ENUMS.clientStages.map((s) => ({ value: s.key, label: s.label })), value: draft.stage || 'new' });
  const notesInput = el('textarea', { class: 'input', rows: 3, value: draft.notes || '' });
  const source = sourceField(draft.referralSource, ctx.lists.sources);

  const selectedTags = new Set(draft.tags || []);
  const tagsBox = el('div', { class: 'chips' });
  const renderTags = () => {
    clear(tagsBox);
    for (const tag of ctx.lists.clientTags) {
      const active = selectedTags.has(tag);
      tagsBox.append(el('button', {
        type: 'button', class: `chip${active ? ' active' : ''} ${clientTagClass(tag)}`.trim(), text: tag,
        onClick: () => { if (active) selectedTags.delete(tag); else selectedTags.add(tag); renderTags(); },
      }));
    }
    tagsBox.append(el('button', {
      type: 'button', class: 'chip chip-static', text: '+ تصنيف جديد',
      onClick: async () => {
        const name = await promptDialog({ title: 'تصنيف جديد للعملاء', label: 'اسم التصنيف' });
        if (!name) return;
        const tag = await addClientTag(name);
        ctx.lists = await getLists();
        selectedTags.add(tag);
        renderTags();
      },
    }));
  };
  renderTags();

  const saveBtn = el('button', { type: 'button', class: 'btn btn-primary', text: isEdit ? 'حفظ التعديلات' : 'إضافة العميل' });
  saveBtn.addEventListener('click', async () => {
    errorsBox.hidden = true;
    const data = {
      name: nameInput.value, phone: phoneInput.value, phone2: phone2Input.value,
      roles: [...rolesBox.querySelectorAll('input:checked')].map((i) => i.value),
      stage: stageSelect.value, tags: [...selectedTags], notes: notesInput.value,
      referralSource: source.input.value,
    };
    saveBtn.disabled = true;
    try {
      if (data.phone.trim()) {
        const dup = await repo.clients.findByPhone(data.phone);
        if (dup && dup.id !== existing?.id) {
          showErrors([`يوجد عميل مسجّل بهذا الجوال: ${dup.name || formatPhone(dup.phone)}`]);
          return;
        }
      }
      if (isEdit) await repo.clients.update(existing.id, data);
      else await repo.clients.create(data);
      await rememberSource(data.referralSource);
      modal.close();
      toast(isEdit ? 'تم حفظ التعديلات' : 'تمت إضافة العميل', 'success');
      await refresh(ctx);
    } catch (err) {
      if (err instanceof ValidationError) showErrors(err.errors);
      else { console.error(err); showErrors([err.message || 'حدث خطأ غير متوقع']); }
    } finally {
      saveBtn.disabled = false;
    }
  });

  const modal = openModal({
    title: isEdit ? 'تعديل بيانات العميل' : 'عميل جديد',
    body: el('div', {},
      errorsBox,
      el('div', { class: 'form-grid' },
        labeled('الاسم', nameInput, { hint: 'الاسم أو الجوال مطلوب على الأقل' }),
        labeled('الجوال', phoneInput, { hint: 'تُوحَّد الصيغة تلقائيًا (05 / 9665 / +966)' }),
        labeled('جوال آخر', phone2Input),
        labeled('المرحلة', stageSelect),
        fieldGroup('الأدوار', rolesBox, { full: true }),
        fieldGroup('التصنيفات', tagsBox, { full: true }),
        labeled('المصدر (وسيط الإحالة)', source.node, { hint: 'اختياري — لا يظهر شيء ما لم يُعبَّأ' }),
        labeled('الملاحظات', notesInput, { full: true }))),
    footer: [
      el('button', { type: 'button', class: 'btn btn-ghost', text: 'إلغاء', onClick: () => modal.close() }),
      saveBtn,
    ],
  });
  setTimeout(() => nameInput.focus(), 0);
}
