// صفحة الطلبات العقارية (المرحلة ٣): إنشاء/تعديل/حذف طلب مرتبط بعميل،
// مع الأحياء المرغوبة (مفردة أو بنطاق مسمّى)، وسقف الميزانية، والمساحة، ومرونة خاصة بالطلب.
// عدد المطابقات في القائمة يُحسب لحظيًا من محرك المطابقة (لا يُخزَّن).

import { repo, ValidationError } from '../data/repository.js';
import { ENUMS, labelFor, clientPriority } from '../data/schema.js';
import { sourceField, rememberSource, sourceBadge } from '../util/source-field.js';
import { getLists, typeLabel, addDistrict, getZonesFor, zoneLabel } from '../data/settings.js';
import { parseRequestText } from '../data/listing-parse.js';
import { runPlans } from '../util/plans.js';
import { loadMatchingContext, candidatesFor, priceFlexFor, areaFlexFor } from '../data/matching.js';
import { priceSamples, budgetRealityGap } from '../util/price-stats.js';
import {
  el, clear, labeled, fieldGroup, selectEl, badge, openModal, confirmDialog, promptDialog,
  toast, emptyState, debounce, allChip,
} from '../util/dom.js';
import { formatSAR, formatArea, formatNumber } from '../util/format.js';
import { matchesQuery } from '../util/arabic.js';
import { formatPhone } from '../util/phone.js';

const GROUPS = [['status', 'الحالة'], ['type', 'النوع'], ['purpose', 'الغرض'], ['city', 'المدينة']];
const VALUES = {
  status: (r) => [r.status],
  type: (r) => [r.type],
  purpose: (r) => [r.purpose],
  city: (r) => [r.city],
};
const STATUS_STYLE = { active: 'badge-ok', paused: 'badge-warn', done: '' };

export const clientName = (c) => (c ? (c.name || formatPhone(c.phone) || 'عميل بلا اسم') : 'عميل محذوف');

// يقرأ #/requests/<id> (نفس نمط #/matches/<requestId> الموثّق) — يستعمله البحث العام (المرحلة ٦).
function routeRequestIdParam() {
  const m = /^#\/requests\/([^/?#]+)/.exec(location.hash || '');
  return m ? decodeURIComponent(m[1]) : null;
}

export async function render(container) {
  const ctx = {
    container, query: '',
    filters: Object.fromEntries(GROUPS.map(([k]) => [k, new Set()])),
    requests: [], clientsById: new Map(), lists: null, match: null, counts: new Map(), nodes: {},
  };
  await loadData(ctx);
  buildLayout(ctx);
  const focusId = routeRequestIdParam();
  if (focusId) {
    const target = ctx.requests.find((r) => r.id === focusId);
    if (target) await openForm(ctx, target);
    else toast('الطلب غير موجود، أو حُذف', 'error');
    return;
  }
  // مسودّة قادمة من «البحث السريع» في صفحة المطابقات (المرحلة ٢٠): تُستهلك مرة ثم تُمحى،
  // فلا تُفتح الاستمارة من تلقاء نفسها في كل زيارة لاحقة للصفحة.
  if (/[?&]new=quick/.test(location.hash || '')) {
    let draft = null;
    try { draft = JSON.parse(sessionStorage.getItem('kassab:quick-request') || 'null'); } catch (_) { draft = null; }
    try { sessionStorage.removeItem('kassab:quick-request'); } catch (_) { /* تصفح خاص */ }
    history.replaceState(null, '', '#/requests');
    if (draft) await openForm(ctx, null, draft);
  }
}

async function loadData(ctx) {
  const [lists, match] = await Promise.all([getLists(), loadMatchingContext({ withMatches: false })]);
  ctx.lists = lists;
  ctx.match = match;
  ctx.clientsById = new Map(match.clients.map((c) => [c.id, c]));
  // طلبات العملاء ذوي الأولوية («جادّ» ثم «مهم») أولًا، ثم آخر تعديل كما كان (المرحلة ٨).
  const priorityOf = (r) => clientPriority(ctx.clientsById.get(r.clientId));
  ctx.requests = [...match.requests].sort((a, b) => (priorityOf(b) - priorityOf(a)) || (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  ctx.counts = new Map(ctx.requests.map((r) => [r.id, candidatesFor(r, match, { minScore: match.settings.minScore }).length]));
  // عيّنة الأسعار لفحص واقعية الميزانية (المرحلة ١٩) — تُبنى مرة مع بقية بيانات الصفحة.
  ctx.priceSamples = priceSamples({ properties: match.properties, externals: match.externals, deals: await repo.deals.list() });
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
    el('h1', {}, 'الطلبات العقارية ', ctx.nodes.count),
    el('div', { class: 'head-actions' },
      el('input', {
        class: 'input search', type: 'search', placeholder: 'بحث بالمدينة أو الحي أو الملاحظات…',
        onInput: debounce((e) => { ctx.query = e.target.value; renderFilters(ctx); renderList(ctx); }, 150),
      }),
      el('button', { type: 'button', class: 'btn', text: '📋 لصق رسالة عميل', title: 'اقرأ طلبًا من رسالة واتساب', onClick: () => openPasteForm(ctx) }),
      el('button', { type: 'button', class: 'btn btn-primary', text: '+ إضافة طلب', onClick: () => openForm(ctx, null) }))));
  ctx.nodes.filters = el('div', { class: 'filters' });
  ctx.nodes.list = el('div');
  ctx.container.append(ctx.nodes.filters, ctx.nodes.list);
  renderFilters(ctx);
  renderList(ctx);
}

/* ===== الفرز ===== */

function passes(ctx, r, exceptGroup = null) {
  for (const [g] of GROUPS) {
    if (g === exceptGroup) continue;
    const set = ctx.filters[g];
    if (set.size && !VALUES[g](r).some((v) => set.has(v))) return false;
  }
  if (!ctx.query) return true;
  const client = ctx.clientsById.get(r.clientId);
  return matchesQuery(r.searchKey, ctx.query) || (client ? matchesQuery(client.searchKey, ctx.query) : false);
}

function optionsFor(ctx, group) {
  switch (group) {
    case 'status': return ENUMS.requestStatuses.map((s) => ({ value: s.key, label: s.label }));
    case 'purpose': return ENUMS.purposes.map((p) => ({ value: p.key, label: p.label }));
    case 'type': {
      const used = new Set(ctx.requests.map((r) => r.type));
      return ctx.lists.propertyTypes.filter((t) => used.has(t.key)).map((t) => ({ value: t.key, label: t.label }));
    }
    case 'city': {
      const used = [...new Set(ctx.requests.map((r) => r.city).filter(Boolean))];
      return used.length > 1 ? used.map((c) => ({ value: c, label: c })) : [];
    }
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
    chips.append(allChip(ctx.filters[group], options.map((o) => o.value),
      () => { renderFilters(ctx); renderList(ctx); }));
    for (const opt of options) {
      const n = ctx.requests.filter((r) => passes(ctx, r, group) && VALUES[group](r).includes(opt.value)).length;
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

function placesNode(ctx, r) {
  const zones = ctx.match.zonesByCity[r.city] || [];
  const zoneNames = (r.districtZones || []).map((k) => zoneLabel(zones, k)).filter(Boolean);
  const nodes = [];
  for (const z of zoneNames) nodes.push(badge(z, 'badge-accent'));
  const districts = r.districts || [];
  if (districts.length) nodes.push(el('span', { text: districts.slice(0, 3).join('، ') + (districts.length > 3 ? ` +${districts.length - 3}` : '') }));
  if (!nodes.length) return el('span', { class: 'muted', text: 'أي حي' });
  return el('div', { class: 'cell-stack' }, nodes);
}

function renderList(ctx) {
  const items = ctx.requests.filter((r) => passes(ctx, r));
  ctx.nodes.count.textContent = items.length === ctx.requests.length
    ? `(${ctx.requests.length})`
    : `(${items.length} من ${ctx.requests.length})`;
  const area = ctx.nodes.list;
  clear(area);
  if (!ctx.requests.length) {
    area.append(emptyState('لا طلبات بعد. أضف أول طلب من الزر أعلاه.'));
    return;
  }
  if (!items.length) {
    area.append(emptyState('لا نتائج تطابق الفرز أو البحث.'));
    return;
  }
  const head = el('tr', {}, ['العميل', 'النوع', 'الغرض', 'المدينة', 'الأحياء المرغوبة', 'سقف الميزانية', 'المساحة', 'الحالة', 'المطابقات'].map((t) => el('th', { text: t })));
  const body = el('tbody', {}, items.map((r) => {
    const client = ctx.clientsById.get(r.clientId);
    const n = ctx.counts.get(r.id) || 0;
    return el('tr', { class: `row-priority-${clientPriority(client)}`, onClick: () => openForm(ctx, r) },
      el('td', { class: 'strong' }, clientName(client), sourceBadge(r.referralSource)),
      el('td', { text: typeLabel(ctx.lists, r.type) }),
      el('td', { text: labelFor(ENUMS.purposes, r.purpose) }),
      el('td', { text: r.city || '—' }),
      el('td', {}, placesNode(ctx, r)),
      el('td', { class: 'num', text: r.budgetMax == null ? '—' : formatSAR(r.budgetMax) }),
      el('td', { class: 'num', text: formatArea(r.area) }),
      el('td', {}, badge(labelFor(ENUMS.requestStatuses, r.status), STATUS_STYLE[r.status] || '')),
      el('td', {}, r.status === 'active'
        ? el('a', {
          class: 'btn btn-sm', href: `#/matches/${r.id}`, text: n ? `${formatNumber(n)} مطابقة` : 'لا مطابقات',
          onClick: (e) => e.stopPropagation(),
        })
        : el('span', { class: 'muted small', text: '—' })));
  }));
  area.append(el('div', { class: 'table-wrap' }, el('table', { class: 'table' }, el('thead', {}, head), body)));
}

/* ===== النموذج ===== */

async function quickClient(ctx) {
  const name = await promptDialog({ title: 'عميل جديد', label: 'اسم العميل', confirmText: 'التالي' });
  if (!name) return null;
  const phone = await promptDialog({ title: 'عميل جديد', label: 'جوال العميل (اختياري)', placeholder: '05xxxxxxxx', confirmText: 'إضافة' });
  try {
    const client = await repo.clients.create({ name, phone: phone || '', roles: ['seeker'] });
    ctx.clientsById.set(client.id, client);
    ctx.match.clients.push(client);
    toast('أُضيف العميل', 'success');
    return client;
  } catch (err) {
    toast(err.message || 'تعذر إضافة العميل', 'error');
    return null;
  }
}

/* ===== قراءة طلب من رسالة واتساب (المرحلة ١١) ===== */

/**
 * يلصق المستخدم رسالة العميل كما هي فتُقرأ **محليًا في المتصفح** (بلا شبكة ولا مفتاح)
 * وتُفتح بها استمارة الطلب معبّأة. القراءة اقتراح لا حكم: كل حقل يبقى قابلًا للتعديل قبل الحفظ،
 * ولا يُحفظ شيء إلا بضغطك على «حفظ» في الاستمارة.
 */
async function openPasteForm(ctx) {
  const textarea = el('textarea', {
    class: 'input', rows: 6,
    placeholder: 'الصق رسالة العميل هنا…\nمثال: السلام عليكم، أبغى فلة للبيع بالياسمين أو النرجس، ميزانيتي ٢ مليون ومساحة ٤٠٠ متر تقريبًا',
  });
  const resultBox = el('div', { class: 'parse-result' });
  let parsed = null;

  const readIt = () => {
    parsed = parseRequestText(textarea.value, {
      districts: ctx.lists.districtsByCity[ctx.lists.cities[0]] || [],
      types: ctx.lists.propertyTypes,
      cities: ctx.lists.cities,
    });
    clear(resultBox);
    if (!parsed.found.length && !parsed.warnings.length) {
      resultBox.append(el('p', { class: 'muted small', text: 'لم يُقرأ شيء من النص — أكمل الاستمارة يدويًا.' }));
    } else {
      if (parsed.found.length) {
        resultBox.append(el('div', { class: 'chips' },
          parsed.found.map((f) => el('span', { class: 'chip chip-static' }, `${f.label}: ${f.text}`))));
      }
      for (const w of parsed.warnings) resultBox.append(el('p', { class: 'muted small', text: `⚠︎ ${w}` }));
    }
    openBtn.disabled = false;
    // بلا جوال لا إنشاء مباشر: عميلٌ لا تستطيع الاتصال به سجلٌّ ناقص لا فائدة فيه.
    quickBtn.disabled = !parsed?.fields?.phone;
    quickBtn.title = parsed?.fields?.phone ? '' : 'لم يُقرأ جوال من الرسالة — أكمل الاستمارة يدويًا';
  };

  const openBtn = el('button', {
    type: 'button', class: 'btn', text: 'افتح الاستمارة معبّأة', disabled: true,
    onClick: async () => {
      modal.close();
      await openForm(ctx, null, parsed?.fields || {});
    },
  });

  /**
   * إنشاء العميل وطلبه بضغطة (المرحلة ٢٣).
   *
   * الأنظمة التي تلتقط العملاء من البوّابات آليًا تُباع باشتراك شهري كبير، وهذا ٨٠٪ من
   * قيمتها بلا اشتراك: تلصق رسالة الاستفسار فيُقرأ الاسم والجوال والمواصفات معًا.
   * و**لا يُنشأ عميل مكرّر**: الجوال المسجَّل يُستعمل سجلّه ويُضاف الطلب إليه.
   * ويبقى الزر معطَّلًا ما لم يُقرأ جوال، لأن عميلًا بلا جوال لا يُتصل به.
   */
  const quickBtn = el('button', {
    type: 'button', class: 'btn btn-primary', text: 'أنشئ العميل والطلب', disabled: true,
    onClick: async () => {
      const fields = parsed?.fields || {};
      quickBtn.disabled = true;
      try {
        const clients = await repo.clients.list();
        const phone = fields.phone || '';
        let client = phone ? clients.find((c) => c.phone === phone) : null;
        const isNew = !client;
        if (!client) {
          client = await repo.clients.create({
            name: fields.name || '', phone, roles: ['seeker'], stage: 'new',
            referralSource: fields.source || '', notes: textarea.value.trim().slice(0, 500),
          });
        }
        await repo.clients.addContact(client.id, {
          type: 'whatsapp', date: new Date().toISOString(), note: 'استفسار ملصوق',
        });
        if (isNew) await runPlans('new_client', { title: fields.name || phone, linkType: 'client', linkId: client.id });
        const request = await repo.requests.create({
          clientId: client.id,
          city: fields.city || ctx.lists.cities[0] || 'الرياض',
          districts: fields.districts || [],
          type: fields.type || '',
          purpose: fields.purpose || 'sale',
          budgetMax: fields.budgetMax ?? null,
          area: fields.area ?? null,
          status: 'active',
        });
        modal.close();
        toast(isNew ? 'أُنشئ العميل وطلبه' : 'العميل مسجَّل — أُضيف له الطلب', 'success');
        window.dispatchEvent(new CustomEvent('kassab:data-changed'));
        location.hash = `#/matches/${request.id}`;
      } catch (err) {
        toast((err.errors || [err.message]).join('، '), 'error');
        quickBtn.disabled = false;
      }
    },
  });

  const modal = openModal({
    title: 'طلب من رسالة عميل',
    size: 'wide',
    body: el('div', {},
      el('p', { class: 'muted small', text: 'تُقرأ الرسالة في متصفحك فقط — لا تخرج البيانات من جهازك ولا تحتاج اتصالًا.' }),
      textarea,
      el('div', { class: 'row', style: { marginTop: '8px' } },
        el('button', { type: 'button', class: 'btn', text: 'اقرأ الحقول من النص', onClick: readIt })),
      resultBox),
    footer: [
      el('button', { type: 'button', class: 'btn btn-ghost', text: 'إلغاء', onClick: () => modal.close() }),
      openBtn,
      quickBtn,
    ],
  });
  setTimeout(() => textarea.focus(), 0);
}

/**
 * @param {object|null} existing سجل للتعديل، أو null لطلب جديد
 * @param {object} prefill حقول مقروءة من رسالة (المرحلة ١١) — تُعبّئ الاستمارة ولا تُحفظ وحدها
 */
/**
 * فحص واقعية الميزانية (المرحلة ١٩): تُقارن بوسيط سعر المتر في الحي والنوع المطلوبين.
 *
 * القيمة كلها في **التوقيت**: أن تعرف أن الميزانية أقلّ من السوق بالثلث **لحظة تسجيل الطلب**
 * لا بعد شهرين من البحث. ولا يمنع الحفظ ولا يحكم — عميلك قد يجد فرصة، والسوق ليس قانونًا.
 * ولا يظهر أصلًا ما لم تكن العيّنة كافية (نفس حدّ صفحة التقدير).
 */
function updateRealityCheck(ctx, probe, node) {
  node.hidden = true;
  if (!ctx.priceSamples) return;
  const gap = budgetRealityGap(probe, ctx.priceSamples);
  if (!gap) return;
  node.hidden = false;
  node.className = 'field-hint field-full warn-text';
  node.textContent = `تنبيه: ميزانية هذا الطلب أقلّ من المتوقَّع في ${gap.district} بنحو ${gap.gapPct}٪ `
    + `(المتوقَّع ${formatSAR(Math.round(gap.expected))} لمساحة ${formatArea(probe.area)}، بعيّنة ${gap.count}). `
    + 'اعرفها الآن لا بعد شهرين من البحث — قد يلزم توسيع الأحياء أو تصغير المساحة أو رفع السقف.';
}

async function openForm(ctx, existing, prefill = null) {
  const isEdit = !!existing;
  const draft = existing ? JSON.parse(JSON.stringify(existing)) : repo.requests.defaults();
  if (prefill) {
    // لا يُنشأ عميل تلقائيًا: إن عُرف جواله يُختار الموجود، وإلا تركنا الاختيار لك.
    if (prefill.type) draft.type = prefill.type;
    if (prefill.purpose) draft.purpose = prefill.purpose;
    if (prefill.city) draft.city = prefill.city;
    if (prefill.districts?.length) draft.districts = [...prefill.districts];
    if (prefill.budgetMax != null) draft.budgetMax = prefill.budgetMax;
    if (prefill.area != null) draft.area = prefill.area;
    if (prefill.phone) {
      const known = [...ctx.clientsById.values()].find((c) => c.phone === prefill.phone || c.phone2 === prefill.phone);
      if (known) draft.clientId = known.id;
      else draft.notes = [draft.notes, `جوال العميل من الرسالة: ${prefill.phone}${prefill.name ? ` (${prefill.name})` : ''}`].filter(Boolean).join('\n');
    } else if (prefill.name) {
      draft.notes = [draft.notes, `اسم العميل من الرسالة: ${prefill.name}`].filter(Boolean).join('\n');
    }
  }
  const settings = ctx.match.settings;

  const errorsBox = el('div', { class: 'form-errors', hidden: true });
  const showErrors = (errors) => {
    clear(errorsBox);
    errorsBox.append(el('ul', {}, errors.map((e) => el('li', { text: e }))));
    errorsBox.hidden = false;
  };

  /* العميل */
  const clientOptions = () => [...ctx.clientsById.values()]
    .sort((a, b) => clientName(a).localeCompare(clientName(b), 'ar'))
    .map((c) => ({ value: c.id, label: `${clientName(c)}${c.phone ? ` — ${formatPhone(c.phone)}` : ''}` }));
  const clientSelect = selectEl({ options: clientOptions(), value: draft.clientId || '', placeholder: 'اختر العميل…' });
  const clientRow = el('div', { class: 'field-row' }, clientSelect, el('button', {
    type: 'button', class: 'btn btn-sm', text: '+ عميل',
    onClick: async () => {
      const client = await quickClient(ctx);
      if (!client) return;
      clear(clientSelect);
      clientSelect.append(el('option', { value: '', text: 'اختر العميل…' }));
      for (const o of clientOptions()) clientSelect.append(el('option', { value: o.value, text: o.label }));
      clientSelect.value = client.id;
    },
  }));

  const typeSelect = selectEl({
    options: ctx.lists.propertyTypes.map((t) => ({ value: t.key, label: t.label })),
    value: draft.type || '', placeholder: 'اختر النوع…',
  });
  const purposeSelect = selectEl({
    options: ENUMS.purposes.map((p) => ({ value: p.key, label: p.label })),
    value: draft.purpose || '', placeholder: 'اختر الغرض…', onChange: () => updateHints(),
  });
  const citySelect = selectEl({
    options: ctx.lists.cities.map((c) => ({ value: c, label: c })), value: draft.city || ctx.lists.cities[0],
    onChange: async () => { await loadZones(); drawZones(); drawDistricts(); },
  });
  // سبب موت الطلب (المرحلة ٣٥): يُسأل عند الإغلاق وحده — سؤالٌ في غير موضعه لا يُجاب.
  const closeReasonSelect = selectEl({
    options: ENUMS.matchRejectReasons.map((r) => ({ value: r.key, label: r.label })),
    placeholder: 'بلا سبب مسجَّل', value: draft.closeReason || '',
  });
  const closeReasonField = labeled('لماذا أُوقف؟', closeReasonSelect, {
    hint: 'اختياري — لكنه الحقل الذي يعلّمك أين تخسر: أهو سعرك أم بطء ردّك أم مخزونك',
  });
  // «موقوف» وحده هو الخسارة: `done` صفقةٌ تمّت لا طلبٌ مات، وسؤال صاحبها «لماذا انتهى؟»
  // خطأٌ في الفهم قبل أن يكون خطأً في الواجهة.
  const DEAD = ['paused'];
  const syncCloseReason = () => { closeReasonField.hidden = !DEAD.includes(statusSelect.value); };
  const statusSelect = selectEl({
    options: ENUMS.requestStatuses.map((s) => ({ value: s.key, label: s.label })), value: draft.status || 'active',
    onChange: () => syncCloseReason(),
  });
  syncCloseReason(); // الحالة الابتدائية: الحقل مخفيّ ما لم يكن الطلب منتهيًا أصلًا
  const budgetInput = el('input', { class: 'input', type: 'number', min: '0', step: '1000', value: draft.budgetMax ?? '', onInput: () => updateHints() });
  const areaInput = el('input', { class: 'input', type: 'number', min: '0', step: '10', value: draft.area ?? '', onInput: () => updateHints() });
  const notesInput = el('textarea', { class: 'input', rows: 3, value: draft.notes || '' });
  const source = sourceField(draft.referralSource, ctx.lists.sources);

  /* النطاقات والأحياء */
  let cityZones = [];
  const selectedZones = new Set(draft.districtZones || []);
  const selectedDistricts = new Set(draft.districts || []);
  const zonesBox = el('div', { class: 'chips' });
  const districtsBox = el('div', { class: 'chips' });
  const districtList = el('datalist', { id: 'req-district-options' });
  const districtInput = el('input', { class: 'input', type: 'text', list: 'req-district-options', placeholder: 'اكتب حيًّا ثم أضفه' });

  const loadZones = async () => { cityZones = await getZonesFor(citySelect.value); };

  const drawZones = () => {
    clear(zonesBox);
    if (!cityZones.length) {
      zonesBox.append(el('span', { class: 'muted small', text: 'لا نطاقات لهذه المدينة — تُعرَّف من صفحة الإعدادات.' }));
      return;
    }
    for (const zone of cityZones) {
      const active = selectedZones.has(zone.key);
      zonesBox.append(el('button', {
        type: 'button', class: `chip${active ? ' active' : ''}`,
        title: `${zone.districts.length} حي`,
        onClick: () => { if (active) selectedZones.delete(zone.key); else selectedZones.add(zone.key); drawZones(); },
      }, zone.label, el('span', { class: 'chip-count', text: String(zone.districts.length) })));
    }
    for (const key of selectedZones) {
      if (!cityZones.some((z) => z.key === key)) {
        zonesBox.append(el('span', { class: 'chip chip-static' }, 'نطاق محذوف',
          el('button', { type: 'button', class: 'chip-x', text: '✕', onClick: () => { selectedZones.delete(key); drawZones(); } })));
      }
    }
  };

  const addDistrictValue = async (value) => {
    const name = String(value || '').trim();
    if (!name) return;
    selectedDistricts.add(name);
    districtInput.value = '';
    drawDistricts();
    const known = ctx.lists.districtsByCity[citySelect.value] || [];
    if (!known.includes(name)) {
      try {
        await addDistrict(citySelect.value, name);
        ctx.lists = await getLists();
        drawDistricts();
      } catch (_) { /* الحي يبقى في الطلب حتى لو تعذّرت إضافته للقائمة */ }
    }
  };

  const drawDistricts = () => {
    clear(districtList);
    for (const d of ctx.lists.districtsByCity[citySelect.value] || []) districtList.append(el('option', { value: d }));
    clear(districtsBox);
    if (!selectedDistricts.size) {
      districtsBox.append(el('span', { class: 'muted small', text: 'لا أحياء مفردة — اتركها فارغة إن اكتفيت بالنطاقات، أو لأي حي في المدينة.' }));
    }
    for (const d of selectedDistricts) {
      districtsBox.append(el('span', { class: 'chip chip-static' }, d,
        el('button', { type: 'button', class: 'chip-x', text: '✕', title: 'إزالة', onClick: () => { selectedDistricts.delete(d); drawDistricts(); } })));
    }
  };

  districtInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); addDistrictValue(districtInput.value); }
  });
  districtInput.addEventListener('change', () => {
    const known = ctx.lists.districtsByCity[citySelect.value] || [];
    if (known.includes(districtInput.value.trim())) addDistrictValue(districtInput.value);
  });

  /* المرونة */
  const priceFlexPercent = el('input', { class: 'input', type: 'number', min: '0', step: '1', value: draft.priceFlexibility ?? '', placeholder: String(settings.price.percent), onInput: () => updateHints() });
  const priceFlexAmount = el('input', { class: 'input', type: 'number', min: '0', step: '1000', value: draft.priceFlexAmount ?? '', onInput: () => updateHints() });
  const areaFlexPercent = el('input', { class: 'input', type: 'number', min: '0', step: '1', value: draft.areaFlexibility ?? '', placeholder: String(settings.area.percent), onInput: () => updateHints() });
  const areaFlexAmount = el('input', { class: 'input', type: 'number', min: '0', step: '10', value: draft.areaFlexAmount ?? '', onInput: () => updateHints() });
  const priceHint = el('p', { class: 'field-hint field-full' });
  const areaHint = el('p', { class: 'field-hint field-full' });
  const realityHint = el('p', { class: 'field-hint field-full', hidden: true });

  const num = (input) => (input.value === '' ? null : Number(input.value));
  const updateHints = () => {
    const probe = {
      purpose: purposeSelect.value, budgetMax: num(budgetInput), area: num(areaInput),
      priceFlexibility: num(priceFlexPercent), priceFlexAmount: num(priceFlexAmount),
      areaFlexibility: num(areaFlexPercent), areaFlexAmount: num(areaFlexAmount),
      referralSource: source.input.value,
    };
    const p = priceFlexFor(probe, settings);
    const a = areaFlexFor(probe, settings);
    const src = { amount: 'مبلغ محدد لهذا الطلب', percent: 'النسبة', floor: 'الحدّ الأدنى العام' };
    priceHint.textContent = probe.budgetMax == null
      ? 'بلا سقف ميزانية لا يدخل السعر في الحساب أصلًا.'
      : `المرونة المطبَّقة: ${formatSAR(Math.round(p.value))} (${src[p.source]}) — يُقبل حتى ${formatSAR(Math.round(probe.budgetMax + p.value))} بنسبة متدرّجة.`;
    areaHint.textContent = probe.area == null
      ? 'بلا مساحة مطلوبة لا تدخل المساحة في الحساب أصلًا.'
      : `المرونة المطبَّقة: ${formatArea(Math.round(a.value))} (${src[a.source]}) — يُقبل حتى ${formatArea(Math.round(Math.max(0, probe.area - a.value)))} بنسبة متدرّجة.`;
    updateRealityCheck(ctx, probe, realityHint);
  };

  await loadZones();
  drawZones();
  drawDistricts();
  updateHints();

  const saveBtn = el('button', { type: 'button', class: 'btn btn-primary', text: isEdit ? 'حفظ التعديلات' : 'إضافة الطلب' });
  saveBtn.addEventListener('click', async () => {
    errorsBox.hidden = true;
    const data = {
      clientId: clientSelect.value || null,
      type: typeSelect.value, purpose: purposeSelect.value, city: citySelect.value,
      districts: [...selectedDistricts], districtZones: [...selectedZones],
      budgetMax: num(budgetInput), area: num(areaInput), notes: notesInput.value, status: statusSelect.value,
      // السبب لا يُحفظ إلا مع حالة «موقوف»: طلبٌ أُعيد تنشيطه، أو تمّت صفقته، لا سببَ لموته.
      closeReason: DEAD.includes(statusSelect.value) ? (closeReasonSelect.value || null) : null,
      priceFlexibility: num(priceFlexPercent), priceFlexAmount: num(priceFlexAmount),
      areaFlexibility: num(areaFlexPercent), areaFlexAmount: num(areaFlexAmount),
      referralSource: source.input.value,
    };
    saveBtn.disabled = true;
    try {
      if (isEdit) await repo.requests.update(existing.id, data);
      else await repo.requests.create(data);
      await rememberSource(data.referralSource);
      modal.close();
      toast(isEdit ? 'تم حفظ التعديلات' : 'أُضيف الطلب', 'success');
      await refresh(ctx);
    } catch (err) {
      if (err instanceof ValidationError) showErrors(err.errors);
      else { console.error(err); showErrors([err.message || 'حدث خطأ غير متوقع']); }
    } finally {
      saveBtn.disabled = false;
    }
  });

  const footer = [];
  if (isEdit) {
    footer.push(el('button', {
      type: 'button', class: 'btn btn-ghost btn-danger', text: 'حذف الطلب',
      onClick: async () => {
        const ok = await confirmDialog({
          title: 'حذف الطلب',
          message: 'سيُحذف الطلب ومطابقاته المحفوظة نهائيًا. العميل وعقاراته لا تُمس.',
          confirmText: 'حذف', danger: true,
        });
        if (!ok) return;
        try {
          await repo.requests.remove(existing.id);
          modal.close();
          toast('حُذف الطلب', 'success');
          await refresh(ctx);
        } catch (err) {
          toast(err.message || 'تعذر الحذف', 'error');
        }
      },
    }));
    footer.push(el('a', { class: 'btn', href: `#/matches/${existing.id}`, text: 'مطابقات هذا الطلب', onClick: () => modal.close() }));
  }
  footer.push(el('span', { class: 'spacer' }));
  footer.push(el('button', { type: 'button', class: 'btn btn-ghost', text: 'إلغاء', onClick: () => modal.close() }));
  footer.push(saveBtn);

  const modal = openModal({
    title: isEdit ? 'تعديل الطلب' : 'طلب عقاري جديد',
    size: 'wide',
    body: el('div', {},
      errorsBox,
      el('div', { class: 'form-grid' },
        labeled('العميل', clientRow, { required: true }),
        labeled('الحالة', statusSelect),
        closeReasonField,
        labeled('نوع العقار', typeSelect, { required: true, hint: 'فاصل قاطع: لا تُطابق إلا عقارات هذا النوع' }),
        labeled('الغرض', purposeSelect, { required: true, hint: 'فاصل قاطع: الطلب لغرض واحد' }),
        labeled('المدينة', citySelect, { required: true, hint: 'فاصل قاطع' }),
        labeled('سقف الميزانية (ريال)', budgetInput),
        labeled('المساحة المطلوبة (م²)', areaInput, { hint: 'تُعدّ حدًّا أدنى: الأكبر لا يُخصم منه' }),
        fieldGroup('نطاقات الأحياء', zonesBox, { full: true }),
        fieldGroup('أحياء مفردة', el('div', {}, el('div', { class: 'field-row' }, districtInput, districtList,
          el('button', { type: 'button', class: 'btn btn-sm', text: 'إضافة', onClick: () => addDistrictValue(districtInput.value) })), districtsBox), { full: true }),
        labeled('المصدر (وسيط الإحالة)', source.node, { hint: 'اختياري — لا يظهر شيء ما لم يُعبَّأ' }),
        labeled('الملاحظات', notesInput, { full: true })),
      el('div', { class: 'form-section' },
        el('h3', { class: 'form-section-title', text: 'مرونة خاصة بهذا الطلب (اختيارية — تتجاوز الإعداد العام)' }),
        el('div', { class: 'form-grid' },
          labeled('نسبة مرونة السعر ٪', priceFlexPercent),
          labeled('أو مبلغ بالريال', priceFlexAmount, { hint: 'المبلغ يغلب النسبة والحدّ الأدنى' }),
          priceHint,
          labeled('نسبة مرونة المساحة ٪', areaFlexPercent),
          labeled('أو مساحة بالمتر', areaFlexAmount, { hint: 'المساحة تغلب النسبة والحدّ الأدنى' }),
          areaHint, realityHint))),
    footer,
  });
}
