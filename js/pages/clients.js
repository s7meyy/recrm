// صفحة العملاء: الأدوار المتعددة، المراحل، التصنيفات، وسجل التواصل بمواعيد المتابعة.

import { repo, ValidationError } from '../data/repository.js';
import { ENUMS, labelFor, clientTagClass, clientPriority } from '../data/schema.js';
import { getLists, addClientTag, typeLabel, statusLabel, getFollowUpSettings } from '../data/settings.js';
import { sourceField, rememberSource, sourceBadge } from '../util/source-field.js';
import {
  el, clear, labeled, fieldGroup, selectEl, checkbox, badge, openModal, confirmDialog,
  promptDialog, toast, emptyState, debounce,
} from '../util/dom.js';
import {
  formatDate, formatDateTime, formatSAR, formatNumber, relativeDays, daysBetween, daysWord,
  toInputDateTime, fromInputDateTime, fromInputDate,
} from '../util/format.js';
import { matchesQuery } from '../util/arabic.js';
import { scoreClient } from '../util/lead-score.js';
import { formatPhone } from '../util/phone.js';
import { findDuplicates, suggestKeeper } from '../util/duplicates.js';
import { audioNoteField, audioPlayer } from '../util/audio-note.js';
import { capped, PAGE_SIZE } from '../util/render-cap.js';

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
  const [clients, properties, lists, requests, followUp] = await Promise.all([
    repo.clients.list(), repo.properties.list(), getLists(), repo.requests.list(), getFollowUpSettings(),
  ]);
  // درجة الأولوية (المرحلة ٢٣): تُحسب من سجلات موجودة — لا تخزين ولا نموذج.
  const byClient = new Map();
  for (const r of requests) {
    if (!byClient.has(r.clientId)) byClient.set(r.clientId, []);
    byClient.get(r.clientId).push(r);
  }
  ctx.scores = new Map(clients.map((c) => [c.id, scoreClient(c, {
    requests: byClient.get(c.id) || [],
    lastContactAt: repo.clients.lastContactAt(c),
    staleDays: followUp.staleContactDays,
  })]));
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
      ctx.nodes.dupBtn = el('button', { type: 'button', class: 'btn', hidden: true, onClick: () => openDuplicates(ctx) }),
      el('button', { type: 'button', class: 'btn btn-primary', text: '+ إضافة عميل', onClick: () => openForm(ctx, null) }))));
  drawDupButton(ctx);
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
  // حدّ الرسم (المرحلة ٣٥): ألفا عميل تضع ٢٨ ألف عنصر في الصفحة وتستغرق ثانيتين — قيسَ
  // لا ظُنّ. والفرز والبحث والعدّ فوق على المجموعة كاملة، والمرسوم مئتان.
  const signature = `${ctx.query || ''}|`
    + Object.entries(ctx.filters || {}).map(([g, set]) => `${g}:${[...(set || [])].sort().join(',')}`).join('|');
  if (signature !== ctx.lastSignature) { ctx.shown = PAGE_SIZE; ctx.lastSignature = signature; }
  const { visible, more } = capped(items, ctx.shown || PAGE_SIZE);

  const head = el('tr', {}, ['الأولوية', 'الاسم', 'الجوال', 'الأدوار', 'المرحلة', 'التصنيفات', 'آخر تواصل', 'المتابعة القادمة'].map((t) => el('th', { text: t })));
  const body = el('tbody', {}, visible.map((c) => el('tr', { class: `row-priority-${clientPriority(c)}`, onClick: () => openDetail(ctx, c.id) },
    el('td', {}, scoreBadge(ctx, c)),
    el('td', { class: 'strong' }, c.name || el('span', { class: 'muted', text: 'بلا اسم' }), sourceBadge(c.referralSource)),
    el('td', {}, phoneLink(c.phone)),
    el('td', {}, (c.roles || []).map((r) => labelFor(ENUMS.clientRoles, r)).join('، ') || '—'),
    el('td', {}, stageBadge(c.stage)),
    el('td', {}, (c.tags || []).length ? c.tags.map((t) => badge(t, clientTagClass(t))) : '—'),
    el('td', {}, lastContactNode(c)),
    el('td', {}, followUpNode(c)))));
  area.append(el('div', { class: 'table-wrap' }, el('table', { class: 'table' }, el('thead', {}, head), body)));
  if (more) {
    area.append(el('div', { class: 'row', style: { justifyContent: 'center', marginTop: '16px' } },
      el('button', {
        type: 'button', class: 'btn', text: `أظهر ${formatNumber(Math.min(more, PAGE_SIZE))} أخرى (بقي ${formatNumber(more)})`,
        onClick: () => { ctx.shown = (ctx.shown || PAGE_SIZE) + PAGE_SIZE; renderList(ctx); },
      })));
  }
}

/** شارة الدرجة مع سببها في التلميح — درجةٌ لا تُشرح لا تُصحَّح. */
function scoreBadge(ctx, client) {
  const result = ctx.scores?.get(client.id);
  if (!result) return el('span', { class: 'muted', text: '—' });
  const tone = result.score >= 60 ? 'badge-ok' : result.score >= 30 ? 'badge-warn' : 'badge-outline';
  const why = result.reasons.map((r) => `${r.weight > 0 ? '+' : ''}${r.weight} ${r.label}`).join('\n');
  return badge(String(result.score), tone, { title: why || 'لا إشارات بعد' });
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
        sourceBadge(client.referralSource),
        client.doNotContact ? badge('لا تتصل', 'badge-danger') : null,
        client.bestTime ? badge(`يفضّل ${labelFor(ENUMS.contactTimes, client.bestTime)}`, '') : null),
      client.notes ? el('p', { class: 'muted', text: client.notes }) : null,
      el('div', { class: 'row' },
        el('span', { class: 'small muted' }, 'آخر تواصل: ', lastContactNode(client)),
        el('span', { class: 'small muted' }, ' · المتابعة القادمة: ', followUpNode(client)))));

    /* إضافة تواصل */
    const typeSel = selectEl({ options: ENUMS.contactTypes.map((t) => ({ value: t.key, label: t.label })), value: 'call' });
    const dateInput = el('input', { class: 'input', type: 'datetime-local', value: toInputDateTime() });
    const noteInput = el('textarea', { class: 'input', rows: 2, placeholder: 'ماذا دار في التواصل؟' });
    const followInput = el('input', { class: 'input', type: 'date' });
    const audio = audioNoteField(); // null في متصفح لا يدعم التسجيل — فلا يُركَّب زرّ لا يعمل
    const addBtn = el('button', {
      type: 'button', class: 'btn btn-primary btn-sm', text: 'تسجيل التواصل',
      onClick: async () => {
        const date = fromInputDateTime(dateInput.value);
        if (!date) { toast('حدد تاريخ التواصل', 'error'); return; }
        addBtn.disabled = true;
        try {
          // الصوت يُحفظ أولًا: لو فشل حفظه لا يُسجَّل تواصلٌ يشير إلى ملفٍ ليس موجودًا.
          const voice = audio ? await audio.save(client.id) : null;
          client = await repo.clients.addContact(client.id, {
            type: typeSel.value, date, note: noteInput.value, followUpAt: fromInputDate(followInput.value),
            audioId: voice?.audioId || null, audioSeconds: voice?.audioSeconds || 0,
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
        audio ? el('div', { class: 'field field-full' },
          el('span', { class: 'field-label', text: 'ملاحظة صوتية' }), audio.node,
          el('span', { class: 'field-hint', text: 'تبقى في جهازك: لا تُرفع ولا تُفرَّغ نصًّا في أي خدمة.' })) : null,
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
          c.audioId ? audioPlayer(c.audioId, c.audioSeconds) : null,
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
      el('a', {
        class: 'btn btn-primary', href: `#/client/${client.id}`, text: 'الملف الكامل',
        title: 'طلباته ومطابقاته وصفقاته وفواتيره ومستحقاته في شاشة واحدة',
        onClick: () => modal.close(),
      }),
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
  const nationalIdInput = el('input', { class: 'input', type: 'text', inputmode: 'numeric', value: draft.nationalId || '', placeholder: '١٠ أرقام', dir: 'ltr' });
  const rolesBox = el('div', { class: 'check-group' }, ENUMS.clientRoles.map((r) => checkbox(r.label, { name: 'role', value: r.key, checked: (draft.roles || []).includes(r.key) })));
  const stageSelect = selectEl({ options: ENUMS.clientStages.map((s) => ({ value: s.key, label: s.label })), value: draft.stage || 'new' });
  const notesInput = el('textarea', { class: 'input', rows: 3, value: draft.notes || '' });
  const source = sourceField(draft.referralSource, ctx.lists.sources);
  // تفضيلات التواصل (المرحلة ٣٢)
  const dncBox = checkbox('لا تتصل به (طلب ذلك)', { checked: !!draft.doNotContact });
  const bestTimeSelect = selectEl({
    options: ENUMS.contactTimes.map((t) => ({ value: t.key, label: t.label })),
    placeholder: 'بلا تفضيل', value: draft.bestTime || '',
  });

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
      nationalId: nationalIdInput.value.trim(),
      roles: [...rolesBox.querySelectorAll('input:checked')].map((i) => i.value),
      stage: stageSelect.value, tags: [...selectedTags], notes: notesInput.value,
      referralSource: source.input.value,
      doNotContact: dncBox.querySelector('input').checked,
      bestTime: bestTimeSelect.value,
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
        labeled('رقم الهوية أو الإقامة', nationalIdInput, { hint: 'اختياري — يطلبه عقد الإيجار وتوثيق الصفقة، ولا يُطلب إلا ممن يتعاقد' }),
        labeled('المرحلة', stageSelect),
        fieldGroup('الأدوار', rolesBox, { full: true }),
        fieldGroup('التصنيفات', tagsBox, { full: true }),
        labeled('المصدر (وسيط الإحالة)', source.node, { hint: 'اختياري — لا يظهر شيء ما لم يُعبَّأ' }),
        labeled('أفضل وقت للاتصال', bestTimeSelect, { hint: 'يظهر لك قبل أن تتصل' }),
        el('div', { class: 'field field-full' }, dncBox,
          el('span', { class: 'field-hint', text: 'يُخرجه من لوحات «المتأخرون» و«ينتظرون ردّك» — ويبقى في قوائمه وسجلّه كما هو.' })),
        labeled('الملاحظات', notesInput, { full: true }))),
    footer: [
      el('button', { type: 'button', class: 'btn btn-ghost', text: 'إلغاء', onClick: () => modal.close() }),
      saveBtn,
    ],
  });
  setTimeout(() => nameInput.focus(), 0);
}


/* ===== دمج العملاء المكرّرين (المرحلة ٢٦) ===== */

/** الزرّ لا يظهر إلا إن وُجد تكرار فعلًا — لا زرّ دائم يذكّرك بمشكلة ليست عندك. */
function drawDupButton(ctx) {
  const btn = ctx.nodes.dupBtn;
  if (!btn) return;
  const pairs = findDuplicates(ctx.clients);
  btn.hidden = pairs.length === 0;
  btn.textContent = `عملاء مكرّرون (${formatNumber(pairs.length)})`;
}

/**
 * شاشة الدمج: زوجٌ زوجًا، مع **معاينة ما سينتقل** قبل التأكيد.
 *
 * ولا يُدمج شيء آليًا مهما بلغ اليقين: سجلّان بجوالٍ واحد قد يكونان أبًا وابنه على رقم واحد،
 * والقرار قرارك.
 */
function openDuplicates(ctx) {
  const body = el('div', {});
  let modal = null;

  const draw = async () => {
    clear(body);
    const pairs = findDuplicates(ctx.clients);
    if (!pairs.length) {
      body.append(el('p', { class: 'muted small', text: 'لا تكرار — كل عميل سجلّ واحد.' }));
      return;
    }
    body.append(el('p', { class: 'muted small', text: 'الدمج ينقل كل ما يشير إلى السجل المكرّر (عقارات وطلبات وصفقات وفواتير ومهام) ويدمج سجل التواصل، ثم يحذفه إلى سلة المحذوفات. راجع قبل أن تؤكّد.' }));
    for (const pair of pairs.slice(0, 20)) {
      body.append(await dupRow(ctx, pair, draw));
    }
    if (pairs.length > 20) body.append(el('p', { class: 'muted small', text: `+ ${formatNumber(pairs.length - 20)} زوجًا آخر — تظهر بعد دمج هذه.` }));
  };

  const dupRow = async (context, pair, refreshRows) => {
    const suggested = suggestKeeper(pair.a, pair.b);
    let keep = suggested;
    let drop = suggested.id === pair.a.id ? pair.b : pair.a;
    const impactNode = el('div', { class: 'muted small' });
    const label = (c) => `${c.name || 'بلا اسم'} · ${formatPhone(c.phone) || 'بلا جوال'} · ${formatNumber((c.contacts || []).length)} تواصل`;
    const keepNode = el('div', { class: 'strong' });
    const dropNode = el('div', { class: 'muted small' });

    const showImpact = async () => {
      keepNode.textContent = `يبقى: ${label(keep)}`;
      dropNode.textContent = `يُحذف: ${label(drop)}`;
      const impact = await repo.clients.mergeImpact(keep.id, drop.id);
      const parts = [
        impact.properties ? `${formatNumber(impact.properties)} عقار` : '',
        impact.requests ? `${formatNumber(impact.requests)} طلب` : '',
        impact.deals ? `${formatNumber(impact.deals)} صفقة` : '',
        impact.invoices ? `${formatNumber(impact.invoices)} فاتورة` : '',
        impact.tasks ? `${formatNumber(impact.tasks)} مهمة` : '',
        impact.contacts ? `${formatNumber(impact.contacts)} تواصل` : '',
      ].filter(Boolean);
      impactNode.textContent = parts.length ? `سينتقل: ${parts.join(' · ')}` : 'لا مرتبطات تنتقل — السجل المكرّر فارغ.';
    };
    await showImpact();

    return el('div', { class: 'today-row' },
      el('div', {},
        el('div', { class: 'row' },
          badge(pair.label, pair.sure ? 'badge-ok' : 'badge-warn'),
          pair.sure ? null : el('span', { class: 'muted small', text: 'تشابه اسم فقط — تحقّق بنفسك' })),
        keepNode, dropNode, impactNode),
      el('div', { class: 'row' },
        el('button', {
          type: 'button', class: 'btn btn-ghost btn-sm', text: '⇄ اعكس',
          title: 'اجعل الآخر هو الباقي',
          onClick: async () => { const t = keep; keep = drop; drop = t; await showImpact(); },
        }),
        el('button', {
          type: 'button', class: 'btn btn-sm', text: 'ادمج',
          onClick: async () => {
            const ok = await confirmDialog({
              title: 'دمج سجلّين',
              message: `سيبقى «${keep.name || keep.phone}» وينتقل إليه كل ما يخص «${drop.name || drop.phone}»، ثم يُحذف السجل الثاني.\n\nهذا لا يُتراجع عنه بضغطة — السجل المحذوف يبقى في سلة المحذوفات بلا مرتبطاته.`,
              confirmText: 'ادمج',
            });
            if (!ok) return;
            try {
              await repo.clients.merge(keep.id, drop.id);
              toast('دُمج السجلان', 'success');
              await loadData(context);
              renderFilters(context);
              renderList(context);
              drawDupButton(context);
              await refreshRows();
            } catch (err) {
              toast(err.message || 'تعذّر الدمج', 'error');
            }
          },
        }),
        el('a', { class: 'btn btn-ghost btn-sm', href: `#/client/${keep.id}`, text: 'الملف', onClick: () => modal?.close() })));
  };

  modal = openModal({ title: 'عملاء مكرّرون', size: 'wide', body });
  draw();
}
