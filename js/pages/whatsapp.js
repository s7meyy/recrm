// صفحة واتساب (المرحلة ٣٨ · وُسّعت في المرحلة ٥٠).
//
// **ما يعمل الآن بلا اشتراك** يبقى كما هو: قوالبُ الرسائل في الإعدادات تُنسخ وتُفتح في
// واتساب يدويًّا منذ المرحلة ١١، ولا تحتاج شيئًا. وهذه الصفحة تضيف ما يحتاج حساب
// «واتساب للأعمال»: أن تصل رسائل العملاء، وأن تُردّ من هنا، وأن تُرسل حملةٌ بقالبٍ معتمَد.
//
// **وما لا يعمل يُقال، لا يُموَّه**: إن نقص متغيّرٌ في Netlify قالت الصفحة اسمه بالضبط
// وأين يُكتب، ولم تعرض صندوقًا فارغًا يوهم أنّ الرسائل لم تصل بعد.
//
// **قاعدةُ واتساب التي تحكم الصفحة كلَّها** (المرحلة ٥٠): المكتبُ لا يبدأ رسالةً حرّة —
// يبدؤها بقالبٍ تعتمده Meta ويُحاسَب عليه. فإن ردّ العميلُ انفتحت **نافذةُ أربعٍ وعشرين
// ساعة** يُراسَل فيها بنصٍّ حرٍّ بلا قالبٍ ولا كلفة. وكانت الصفحةُ لا تقول هذا ولا تعرضه،
// **والنافذةُ تُغلق بصمت** — فتفتحها بعد يومين وتظنّ أنّك ما زلت تستطيع الردّ.

import { repo } from '../data/repository.js';
import {
  el, clear, labeled, selectEl, checkbox, badge, toast, emptyState, confirmDialog, allChip, openModal,
} from '../util/dom.js';
import { formatDateTime, formatNumber, formatSAR, countWord, countOf, relativeDays } from '../util/format.js';
import { formatPhone } from '../util/phone.js';
import { readPublicApi, resetPublicApi } from '../util/public-api.js';
import { loadIntegrations, runIntegration, explain } from '../data/integrations.js';
import { BUILTIN_CLIENT_TAGS } from '../data/schema.js';
import {
  getLists, typeLabel, getCompany, getCampaigns,
  getWaTemplates, setWaTemplates, getWaSends, addWaSends, clearWaSends,
} from '../data/settings.js';
import { getCurrentUser } from '../data/repository.js';
import { TEMPLATE_VARS, templateValues, templateComponents, missingVars } from '../util/templates.js';
import { windowState, windowLabel, MATCH_KINDS, MAX_AUTO_PER_DAY } from '../util/wa-auto.js';
import { parseRequestText } from '../data/listing-parse.js';

const INBOX_URL = '/api/whatsapp';

export async function render(container) {
  clear(container);
  const ctx = {
    container,
    status: null,
    messages: [],
    clients: [],
    properties: [],
    campaigns: [],
    waTemplates: [],
    sends: [],
    auto: null,
    canSend: false,
    tags: new Set(),
    lists: null,
    company: null,
    nodes: {},
  };

  container.append(el('div', { class: 'page-head' },
    el('h1', {}, 'واتساب'),
    el('div', { class: 'head-actions' },
      el('button', {
        type: 'button', class: 'btn btn-sm', text: 'حدّث',
        onClick: () => { resetPublicApi(); render(container); },
      }),
      el('a', { class: 'btn btn-ghost btn-sm', href: '#/integrations', text: 'التكاملات' }))));

  await load(ctx);
  container.append(
    statusPanel(ctx),
    inboxPanel(ctx),
    autoPanel(ctx),
    offerPanel(ctx),
    campaignPanel(ctx),
    sendLogPanel(ctx),
  );
  renderInbox(ctx);
  renderAudience(ctx);
}

async function load(ctx) {
  const [rows, inbox, clients, properties, lists, company, campaigns, waTemplates, sends] = await Promise.all([
    loadIntegrations(),
    readPublicApi(INBOX_URL, null),
    repo.clients.list(),
    repo.properties.list(),
    getLists(),
    getCompany(),
    getCampaigns(),
    getWaTemplates(),
    getWaSends(),
  ]);
  ctx.status = rows.find((r) => r.key === 'whatsapp') || null;
  ctx.messages = inbox?.messages || [];
  ctx.inboxReadable = !!inbox;
  ctx.auto = inbox?.auto || null;
  ctx.canSend = !!inbox?.canSend;
  ctx.clients = clients;
  ctx.properties = properties.filter((p) => p.captureStatus === 'approved');
  ctx.lists = lists;
  ctx.company = company;
  ctx.campaigns = campaigns;
  ctx.waTemplates = waTemplates;
  ctx.sends = sends;
}

/* ===== ١. الحالة: ما ينقص بالضبط ===== */

function statusPanel(ctx) {
  const s = ctx.status;
  const missingSend = s?.missing || [];
  const missingRecv = s?.missingOptional || [];

  // **عنوان الوِبهوك يُعرض دائمًا** — ولو تعذّرت قراءة الحالة. هو أوّل ما يحتاجه من
  // يُهيّئ الربط، ولا يعتمد على جلسةٍ ولا على مفتاح: عنوان موقعك لا أكثر. وإخفاؤه مع
  // الحالة كان يحرم صاحبَ الإعداد من أهمّ سطرٍ في الصفحة بلا سبب.
  const webhookBlock = el('div', { class: 'panel-block' },
    el('h3', { text: 'عنوان الوِبهوك — انسخه إلى Meta' }),
    el('p', { class: 'muted small', text: 'في لوحة Meta ← WhatsApp ← Configuration ← Webhook، ضع هذا العنوان ورمز التحقّق الذي كتبتَه في WHATSAPP_VERIFY_TOKEN، ثم اشترك في حقل messages.' }),
    el('code', { class: 'ltr wa-webhook', text: `${location.origin}/api/whatsapp` }));

  const signatureNote = el('p', { class: 'field-hint' },
    'ولا تُقبل رسالةٌ واردة بلا تحقّقٍ من توقيعها: بلا ',
    el('code', { text: 'WHATSAPP_APP_SECRET' }),
    ' يستطيع أيُّ أحدٍ أن يدسّ في صندوقك رسائل باسم عملائك، فالباب يبقى مغلقًا ويُقال لماذا.');

  return el('section', { class: 'panel' },
    el('h2', { text: 'الحالة' }),
    s
      ? el('div', { class: 'stat-strip' },
        state('الإرسال بالقوالب', missingSend.length === 0, missingSend),
        state('استقبال الرسائل', missingSend.length === 0 && missingRecv.length === 0, [...missingSend, ...missingRecv]))
      : el('p', { class: 'field-hint', text: 'تعذّرت قراءة حالة التكامل — تحتاج جلسة مالك على الموقع المنشور. والخطوات أدناه صحيحة على كل حال.' }),
    webhookBlock,
    signatureNote);
}

function state(label, ready, missing) {
  return el('div', { class: 'stat-chip solo' },
    el('div', {}, badge(ready ? 'جاهز' : 'ينقصه', ready ? 'badge-ok' : 'badge-warn')),
    el('div', {},
      el('div', { class: 'strong', text: label }),
      ready
        ? el('div', { class: 'muted small', text: 'كل المتغيّرات موجودة.' })
        : el('div', { class: 'muted small', text: `الناقص: ${missing.join('، ')} — تُكتب في Netlify ← Site configuration ← Environment variables.` })));
}

/* ===== ٢. الوارد — ويُردّ عليه من هنا ===== */

function inboxPanel(ctx) {
  ctx.nodes.inbox = el('div');
  return el('section', { class: 'panel' },
    el('h2', {}, 'الوارد ', ctx.nodes.inboxCount = el('span', { class: 'count' })),
    el('p', { class: 'panel-desc' },
      'ما يصل من العملاء إلى رقم مكتبك، وما رددتَ به. والرسالة تُربط بصاحبها إن كان في عملائك، وإلّا فبضغطةٍ تُضيفه. ',
      el('strong', { text: 'وردُّ العميل يفتح نافذةَ أربعٍ وعشرين ساعة' }),
      ' تُراسله فيها بنصٍّ حرّ — وبعدها لا يُراسَل إلا بقالبٍ معتمَد.'),
    ctx.nodes.inbox);
}

function renderInbox(ctx) {
  const wrap = ctx.nodes.inbox;
  clear(wrap);
  ctx.nodes.inboxCount.textContent = ctx.messages.length ? `(${formatNumber(ctx.messages.length)})` : '';

  if (!ctx.inboxReadable) {
    wrap.append(el('p', { class: 'field-hint', text: 'تعذّرت قراءة الوارد — تحتاج جلسة مالك على الموقع المنشور.' }));
    return;
  }
  if (!ctx.messages.length) {
    const blocked = (ctx.status?.missingOptional || []).length || (ctx.status?.missing || []).length;
    wrap.append(emptyState(blocked
      ? 'لا وارد — والسبب أعلاه: ما زال ينقص متغيّرٌ أو أكثر، فلا يصل شيء أصلًا.'
      : 'لا رسائل واردة بعد. أرسل رسالةً إلى رقم مكتبك من جوّالك لتتأكّد أن الربط يعمل.'));
    return;
  }

  const byPhone = new Map(ctx.clients.filter((c) => c.phone).map((c) => [c.phone, c]));
  const now = Date.now();
  // **آخرُ رسالةٍ واردةٍ من كلّ رقم** هي التي تفتح النافذة — لا آخرُ سطرٍ في الجدول:
  // ردُّك أنت لا يفتح شيئًا، وحسابُ النافذة منه يجعلها تبدو مفتوحةً وهي مغلقة.
  const lastIn = new Map();
  for (const m of ctx.messages) {
    if (m.outbound || !m.from) continue;
    const prev = lastIn.get(m.from);
    if (!prev || String(m.at) > String(prev)) lastIn.set(m.from, m.at);
  }

  const table = el('table', { class: 'table' },
    el('thead', {}, el('tr', {}, ['متى', 'من', 'الرسالة', 'نافذة الردّ', ''].map((h) => el('th', { text: h })))),
    el('tbody', {}, ctx.messages.map((m) => {
      const client = byPhone.get(m.from) || null;
      const win = windowState(lastIn.get(m.from), now);
      return el('tr', { class: m.outbound ? 'wa-out' : '' },
        el('td', { text: formatDateTime(m.at) }),
        el('td', {},
          m.outbound ? badge(m.auto ? 'ردٌّ تلقائيّ' : 'منك', m.auto ? 'badge-accent' : 'badge-outline') : null,
          client
            ? el('a', { href: `#/clients/${client.id}`, text: client.name || formatPhone(client.phone) })
            : el('span', {}, el('span', { class: 'tel', text: formatPhone(m.from) }),
              m.name ? el('div', { class: 'muted small', text: m.name }) : null)),
        el('td', {},
          m.text || el('span', { class: 'muted', text: m.mediaId ? `(${m.type}) — الوسائط تبقى في واتساب` : '(بلا نص)' })),
        el('td', {}, m.outbound
          ? el('span', { class: 'muted', text: '—' })
          : badge(win.open ? `${formatNumber(win.hoursLeft)} ساعة` : 'أُغلقت',
            win.open ? (win.soon ? 'badge-warn' : 'badge-ok') : 'badge-outline',
            { title: windowLabel(win, { countOf }) })),
        el('td', {},
          m.outbound ? null : el('button', {
            type: 'button', class: 'btn btn-sm', text: '↩︎ ردّ',
            title: win.open ? 'ردٌّ بنصٍّ حرّ داخل النافذة' : 'أُغلقت النافذة — لا يُراسَل إلا بقالب',
            disabled: !win.open || !ctx.canSend,
            onClick: () => openReply(ctx, m, win),
          }),
          // **الرسالةُ تصير طلبًا** (المرحلة ٥٠): «ابغى فلة في قرطبة بمليونين» يقرؤها
          // المحلّلُ منذ المرحلة ٤٢ — وكانت تُقرأ في صفحة الطلبات وحدها لا هنا.
          m.outbound || !m.text ? null : el('button', {
            type: 'button', class: 'btn btn-ghost btn-sm', text: '📋',
            title: 'اقرأ منها عميلًا وطلبًا',
            onClick: () => toRequest(ctx, m),
          }),
          // **ويبقى الزرُّ مسمًّى بكلماته** لا رمزًا: صفُّ الإجراءات فيه أربعةُ أزرار،
          // ورمزٌ بينها يُقرأ بالتخمين — وهذا أكثرُها استعمالًا.
          client || m.outbound ? null : el('button', {
            type: 'button', class: 'btn btn-ghost btn-sm', text: '+ أضفه عميلًا',
            title: 'أضفه إلى عملائك برقمه',
            onClick: async () => {
              const created = await repo.clients.create({ name: m.name || '', phone: m.from, notes: `أول رسالة واتساب: ${m.text || ''}`.trim() });
              toast('أُضيف العميل', 'success');
              location.hash = `#/clients/${created.id}`;
            },
          }),
          el('button', {
            type: 'button', class: 'btn btn-ghost btn-sm', text: '🗑',
            title: 'احذفها من الوارد',
            onClick: async () => {
              await fetch(INBOX_URL, {
                method: 'DELETE',
                credentials: 'same-origin',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ key: m.key }),
              });
              ctx.messages = ctx.messages.filter((x) => x.key !== m.key);
              renderInbox(ctx);
            },
          })));
    })));
  wrap.append(el('div', { class: 'table-wrap' }, table));
}

/** نافذةُ ردٍّ بنصٍّ حرّ — ولا تُفتح إلا ونافذةُ الأربع والعشرين ساعة مفتوحة. */
function openReply(ctx, msg, win) {
  const area = el('textarea', { class: 'input', rows: 4, 'aria-label': 'نصّ الردّ' });
  const errors = el('div', { class: 'form-errors', hidden: true });
  const send = async () => {
    const text = area.value.trim();
    if (!text) { toast('اكتب نصّ الردّ', 'error'); return; }
    const res = await fetch(INBOX_URL, {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ to: msg.from, reply: text }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      clear(errors);
      errors.append(el('div', { text: body.error || `تعذّر الإرسال (${res.status})` }));
      errors.hidden = false;
      return;
    }
    await addWaSends({ kind: 'reply', to: msg.from, name: msg.name, ok: true });
    modal.close();
    toast('أُرسل الردّ', 'success');
    resetPublicApi();
    render(ctx.container);
  };
  const modal = openModal({
    title: `ردٌّ على ${msg.name || formatPhone(msg.from)}`,
    body: el('div', {},
      errors,
      el('p', { class: 'muted small', text: windowLabel(win, { countOf }) }),
      el('blockquote', { class: 'wa-quote', text: msg.text || '(بلا نص)' }),
      area,
      el('p', { class: 'field-hint', text: 'نصٌّ حرٌّ بلا قالبٍ ولا كلفةِ قالب — وهذا هو مقصودُ النافذة.' })),
    footer: [
      el('button', { type: 'button', class: 'btn btn-primary', text: 'أرسل', onClick: send }),
      el('span', { class: 'spacer' }),
      el('button', { type: 'button', class: 'btn btn-ghost', text: 'إغلاق', onClick: () => modal.close() }),
    ],
  });
}

/**
 * يقرأ من الرسالة طلبًا — **بالمحلّل والمسار نفسِهما** اللذين تستعملهما صفحةُ المطابقات
 * منذ المرحلة ٢٠ (`kassab:quick-request` + `?new=quick`). ولا يُخترع مسارٌ ثانٍ يُصان
 * وحدَه ثم ينحرف عن أخيه.
 */
function toRequest(ctx, msg) {
  const districts = Object.values(ctx.lists?.districts || {}).flat();
  const parsed = parseRequestText(msg.text || '', {
    districts, types: ctx.lists?.propertyTypes || [], cities: ctx.lists?.cities || [],
  });
  // الجوّالُ من الرسالة لا من النصّ: المُرسِلُ معروفٌ برقمه، وهو أوثقُ ممّا يُقرأ داخلها.
  const draft = { ...parsed.fields, phone: msg.from, name: msg.name || '' };
  try { sessionStorage.setItem('kassab:quick-request', JSON.stringify(draft)); }
  catch (_) { /* تصفّح خاصّ — والصفحةُ تفتح بلا مسودّة */ }
  location.hash = '#/requests?new=quick';
}

/* ===== ٣. الردّ التلقائي ===== */

function autoPanel(ctx) {
  const cfg = ctx.auto || { enabled: false, outsideHoursOnly: false, from: 9, to: 22, rules: [] };
  const draft = (cfg.rules || []).map((r) => ({ ...r }));

  const enabledBox = checkbox('شغّل الردّ التلقائي', { checked: !!cfg.enabled });
  const outsideBox = checkbox('خارج الدوام وحده', { checked: !!cfg.outsideHoursOnly });
  const fromInput = el('input', { class: 'input', type: 'number', min: '0', max: '23', value: cfg.from ?? 9 });
  const toInput = el('input', { class: 'input', type: 'number', min: '0', max: '23', value: cfg.to ?? 22 });
  const wrap = el('div');

  const draw = () => {
    clear(wrap);
    if (!draft.length) {
      wrap.append(el('p', { class: 'muted small', text: 'لا قاعدة بعد. أضِف واحدةً — والأشيعُ ترحيبٌ بأوّل رسالة.' }));
    }
    draft.forEach((r, i) => {
      const kind = selectEl({
        options: MATCH_KINDS.map((k) => ({ value: k.key, label: k.label })),
        value: r.when || 'contains',
        onChange: (e) => { r.when = e.target.value; draw(); },
      });
      const words = el('input', {
        class: 'input', type: 'text', value: r.text || '', placeholder: 'فلة، شقة، سعر',
        'aria-label': 'كلماتُ المطابقة', hidden: (r.when || 'contains') !== 'contains',
        onInput: (e) => { r.text = e.target.value; },
      });
      const reply = el('input', {
        class: 'input', type: 'text', value: r.reply || '', placeholder: 'نصّ الردّ',
        'aria-label': 'نصّ الردّ', onInput: (e) => { r.reply = e.target.value; },
      });
      const on = checkbox('', { checked: r.enabled !== false, onChange: (e) => { r.enabled = e.target.checked; } });
      wrap.append(el('div', { class: 'plan-step' }, on, kind, words, reply,
        el('button', {
          type: 'button', class: 'icon-btn', text: '✕', title: 'حذف القاعدة',
          'aria-label': 'حذف هذه القاعدة',
          onClick: () => { draft.splice(i, 1); draw(); },
        })));
    });
    wrap.append(el('button', {
      type: 'button', class: 'btn btn-ghost btn-sm', text: '+ قاعدة',
      onClick: () => { draft.push({ when: 'first', text: '', reply: '', enabled: true }); draw(); },
    }));
  };
  draw();

  const save = async () => {
    const res = await fetch(INBOX_URL, {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        enabled: enabledBox.querySelector('input').checked,
        outsideHoursOnly: outsideBox.querySelector('input').checked,
        from: Number(fromInput.value), to: Number(toInput.value),
        rules: draft,
      }),
    });
    if (!res.ok) { toast(`تعذّر الحفظ (${res.status})`, 'error'); return; }
    toast('حُفظت قواعد الردّ', 'success');
    resetPublicApi();
    render(ctx.container);
  };

  return el('section', { class: 'panel' },
    el('h2', { text: 'الردّ التلقائي' }),
    el('p', { class: 'panel-desc' },
      'ردٌّ يخرج من الخادم لحظةَ وصول الرسالة — ',
      el('strong', { text: 'فيصل العميلَ وأنت نائم' }),
      '. وأوّلُ قاعدةٍ تنطبق تفوز، فرتّبها من الأخصّ إلى الأعمّ.'),
    // **القواعدُ تُحفظ على الخادم لا في جهازك**: الوِبهوك يعمل في Netlify ولا يرى
    // بياناتِ متصفّحك — فقاعدةٌ تُكتب في الإعدادات المحلّيّة لا تصل إليه أبدًا.
    el('p', { class: 'field-hint', text: 'تُحفظ على الخادم لا في هذا الجهاز: الوِبهوك يعمل هناك ولا يرى بيانات متصفّحك. ولذلك تحتاج جلسةَ مالكٍ على الموقع المنشور.' }),
    !ctx.canSend
      ? el('p', { class: 'field-hint' },
        el('strong', { text: 'ولا يُرسَل شيءٌ الآن: ' }),
        'ينقص ', el('code', { text: 'WHATSAPP_TOKEN' }), ' أو ', el('code', { text: 'WHATSAPP_PHONE_ID' }),
        ' — تُحفظ القواعدُ وتنتظر.')
      : null,
    el('div', { class: 'form-grid' },
      el('div', { class: 'field' }, enabledBox),
      el('div', { class: 'field' }, outsideBox),
      labeled('الدوام من (ساعة)', fromInput, { hint: 'بتوقيت الرياض — و«من ٢٢ إلى ٨» مدًى يعبر منتصف الليل.' }),
      labeled('إلى', toInput)),
    wrap,
    el('p', { class: 'field-hint', text: `ولا يُردّ آليًّا على رقمٍ واحد أكثر من ${countOf(MAX_AUTO_PER_DAY, 'مرّة')} في اليوم — سدٌّ أمام حلقةٍ لا تنتهي.` }),
    el('div', { style: { marginTop: '10px' } },
      el('button', { type: 'button', class: 'btn btn-primary', text: 'حفظ القواعد', onClick: save })));
}

/* ===== ٤. أرسل عرضًا لعميل ===== */

/**
 * **البابُ الذي كان مفقودًا**: الصفحةُ كانت تُرسل حملةً لقائمة، ولا تُرسل عرضًا واحدًا
 * لعميلٍ واحد — وهو أكثرُ ما يفعله الوسيط في يومه. وكان يفتح واتساب في جهازه وينسخ.
 */
function offerPanel(ctx) {
  const clientSelect = selectEl({
    options: ctx.clients.filter((c) => c.phone).map((c) => ({ value: c.id, label: `${c.name || formatPhone(c.phone)}` })),
    placeholder: 'اختر العميل',
  });
  const propertySelect = selectEl({
    options: ctx.properties.map((p) => ({
      value: p.id,
      label: `${typeLabel(ctx.lists, p.type)} — ${[p.district, p.city].filter(Boolean).join('، ')}${p.price == null ? '' : ` · ${formatSAR(p.price)}`}`,
    })),
    placeholder: 'اختر العقار',
  });
  const tplSelect = selectEl({
    options: ctx.waTemplates.map((t) => ({ value: t.name, label: `${t.name}${t.note ? ` — ${t.note}` : ''}` })),
    placeholder: ctx.waTemplates.length ? 'اختر القالب' : 'لا قالب معتمَد بعد',
  });
  const preview = el('div', { class: 'wa-preview' });

  const draw = () => {
    clear(preview);
    const tpl = ctx.waTemplates.find((t) => t.name === tplSelect.value);
    const client = ctx.clients.find((c) => c.id === clientSelect.value) || null;
    const property = ctx.properties.find((p) => p.id === propertySelect.value) || null;
    if (!tpl) { preview.append(el('p', { class: 'muted small', text: 'اختر قالبًا لتُعرض قيمُ متغيّراته قبل الإرسال.' })); return; }
    if (!tpl.vars.length) { preview.append(el('p', { class: 'muted small', text: 'هذا القالب بلا متغيّرات — يُرسل نصَّه كما هو.' })); return; }
    const values = templateValues({ client, property, lists: ctx.lists, user: getCurrentUser(), company: ctx.company });
    const gaps = missingVars(tpl.vars, values);
    preview.append(el('ul', { class: 'simple-list' }, tpl.vars.map((name, i) => el('li', {},
      el('code', { class: 'num', text: `{{${i + 1}}}` }), ' ',
      el('span', { text: name }), ' — ',
      values[name]?.trim()
        ? el('span', { class: 'strong', text: values[name] })
        : el('span', { class: 'muted', text: 'فارغ، سيُرسَل «—»' })))));
    // **ما ينقص يُقال قبل الإرسال لا بعده**: Meta ترفض متغيّرًا فارغًا بخطأٍ غامض.
    if (gaps.length) {
      preview.append(el('p', { class: 'field-hint' },
        badge(`${countOf(gaps.length, 'متغيّر')} بلا قيمة`, 'badge-warn'),
        ' — أكمِل بيانات العميل أو العقار، أو أرسِلها كما هي.'));
    }
  };
  for (const node of [clientSelect, propertySelect, tplSelect]) node.addEventListener('change', draw);
  draw();

  const sendBtn = el('button', {
    type: 'button', class: 'btn btn-primary', text: '📤 أرسل العرض',
    onClick: async () => {
      const client = ctx.clients.find((c) => c.id === clientSelect.value);
      const tpl = ctx.waTemplates.find((t) => t.name === tplSelect.value);
      if (!client) { toast('اختر العميل', 'error'); return; }
      if (!tpl) { toast('اختر القالب المعتمَد', 'error'); return; }
      const property = ctx.properties.find((p) => p.id === propertySelect.value) || null;
      const values = templateValues({ client, property, lists: ctx.lists, user: getCurrentUser(), company: ctx.company });
      sendBtn.disabled = true;
      const res = await runIntegration('whatsapp', 'template.send', {
        to: client.phone, template: tpl.name, language: tpl.language,
        components: templateComponents(tpl.vars, values),
      });
      sendBtn.disabled = false;
      const ok = !!res?.ok;
      await addWaSends({
        kind: 'offer', template: tpl.name, to: client.phone, name: client.name,
        ok, error: ok ? '' : explain(res, 'whatsapp'),
      });
      toast(ok ? `أُرسل العرض إلى ${client.name || formatPhone(client.phone)}` : explain(res, 'whatsapp'), ok ? 'success' : 'error', 6000);
      if (ok) render(ctx.container);
    },
  });

  return el('section', { class: 'panel' },
    el('h2', { text: 'أرسل عرضًا لعميل' }),
    el('p', { class: 'panel-desc', text: 'عرضٌ واحدٌ لعميلٍ واحد — أكثرُ ما تفعله في يومك. يُملأ القالبُ ببيانات العميل والعقار، ويُعرض عليك قبل أن يخرج.' }),
    ctx.waTemplates.length
      ? null
      : el('p', { class: 'field-hint', text: 'ولا قالبَ معتمَدٌ مسجَّلٌ بعد — سجّله أدناه في «القوالب المعتمَدة» مرّةً واحدة.' }),
    el('div', { class: 'form-grid' },
      labeled('العميل', clientSelect),
      labeled('العقار', propertySelect, { hint: 'اختياريّ — يملأ الحيَّ والسعرَ والمساحة' }),
      labeled('القالب', tplSelect)),
    preview,
    sendBtn,
    templatesEditor(ctx));
}

/** محرِّرُ القوالب المعتمَدة ومواضع متغيّراتها — يُكتب مرّةً ويُستعمل دائمًا. */
function templatesEditor(ctx) {
  const draft = ctx.waTemplates.map((t) => ({ ...t, vars: [...(t.vars || [])] }));
  const wrap = el('div');

  const draw = () => {
    clear(wrap);
    if (!draft.length) wrap.append(el('p', { class: 'muted small', text: 'لا قالب. اكتب اسمه الحرفيّ كما اعتمدته Meta — لا عنوانه المعروض.' }));
    draft.forEach((t, i) => {
      const nameInput = el('input', {
        class: 'input ltr', type: 'text', value: t.name || '', placeholder: 'offer_villa',
        'aria-label': 'اسم القالب عند Meta', onInput: (e) => { t.name = e.target.value; },
      });
      const noteInput = el('input', {
        class: 'input', type: 'text', value: t.note || '', placeholder: 'وصفٌ لك',
        'aria-label': 'وصف القالب', onInput: (e) => { t.note = e.target.value; },
      });
      const langSel = selectEl({
        options: [{ value: 'ar', label: 'العربية' }, { value: 'en', label: 'الإنجليزية' }],
        value: t.language || 'ar', onChange: (e) => { t.language = e.target.value; },
      });
      // المواضعُ مرقّمة: كلُّ صفٍّ يقول «ما الذي يذهب إلى {{n}}؟»
      const varsWrap = el('div', { class: 'wa-vars' });
      const drawVars = () => {
        clear(varsWrap);
        t.vars.forEach((v, vi) => {
          varsWrap.append(el('span', { class: 'wa-var' },
            el('code', { class: 'num', text: `{{${vi + 1}}}` }),
            selectEl({
              options: TEMPLATE_VARS.map((tv) => ({ value: tv.key, label: tv.key })),
              value: v, onChange: (e) => { t.vars[vi] = e.target.value; },
            }),
            el('button', {
              type: 'button', class: 'icon-btn', text: '✕', title: 'احذف هذا الموضع',
              'aria-label': `احذف الموضع ${vi + 1}`,
              onClick: () => { t.vars.splice(vi, 1); drawVars(); },
            })));
        });
        varsWrap.append(el('button', {
          type: 'button', class: 'btn btn-ghost btn-sm', text: '+ موضع',
          onClick: () => { t.vars.push(TEMPLATE_VARS[0].key); drawVars(); },
        }));
      };
      drawVars();
      wrap.append(el('div', { class: 'panel-block' },
        el('div', { class: 'plan-step' }, nameInput, langSel, noteInput,
          el('button', {
            type: 'button', class: 'icon-btn', text: '✕', title: 'حذف القالب',
            'aria-label': `حذف القالب ${t.name || ''}`,
            onClick: () => { draft.splice(i, 1); draw(); },
          })),
        varsWrap));
    });
    wrap.append(el('button', {
      type: 'button', class: 'btn btn-ghost btn-sm', text: '+ قالب معتمَد',
      onClick: () => { draft.push({ name: '', language: 'ar', vars: [], note: '' }); draw(); },
    }));
  };
  draw();

  return el('details', { class: 'panel-block wa-templates' },
    el('summary', { text: 'القوالب المعتمَدة ومواضع متغيّراتها' }),
    el('p', { class: 'muted small', text: 'قوالبُ Meta تستعمل مواضعَ مرقّمة {{1}} و{{2}} لا أسماء. قل هنا مرّةً ما الذي يذهب إلى كلّ موضع، ثم لا تعيده.' }),
    wrap,
    el('div', { style: { marginTop: '10px' } }, el('button', {
      type: 'button', class: 'btn', text: 'حفظ القوالب',
      onClick: async () => {
        await setWaTemplates(draft);
        toast('حُفظت القوالب', 'success');
        render(ctx.container);
      },
    })));
}

/* ===== ٥. الحملة ===== */

function campaignPanel(ctx) {
  const tplSelect = selectEl({
    options: ctx.waTemplates.map((t) => ({ value: t.name, label: `${t.name}${t.note ? ` — ${t.note}` : ''}` })),
    placeholder: ctx.waTemplates.length ? 'اختر القالب' : 'لا قالب معتمَد بعد',
  });
  // **ورَبطُها بالحملة التسويقيّة** (المرحلة ٤٩): ما أُرسل يُنسب إلى حملةٍ لها ميزانيّة،
  // فتُقاس كلفةُ الطلب على شيءٍ حقيقيّ لا على تقدير.
  const campaignSelect = selectEl({
    options: ctx.campaigns.map((c) => ({ value: c.key, label: c.label })),
    placeholder: 'بلا حملة',
  });
  const paceInput = el('input', { class: 'input', type: 'number', min: '0', max: '10', step: '0.5', value: 1 });
  ctx.nodes.audience = el('div', { class: 'filters' });
  ctx.nodes.audienceCount = el('p', { class: 'muted small' });
  ctx.nodes.log = el('div', { class: 'campaign-log' });

  const sendBtn = el('button', {
    type: 'button', class: 'btn btn-primary', text: 'أرسل الحملة',
    onClick: async () => {
      const tpl = ctx.waTemplates.find((t) => t.name === tplSelect.value);
      if (!tpl) { toast('اختر القالب المعتمَد', 'error'); return; }
      const targets = audience(ctx);
      if (!targets.length) { toast('لا أحد في القائمة المختارة', 'error'); return; }
      const okGo = await confirmDialog({
        title: `إرسال إلى ${countWord(targets.length, ['عميل واحد', 'عميلين', 'عملاء', 'عميلًا'])}؟`,
        message: 'الإرسال بقالبٍ معتمَد، وواتساب يحاسب على كل محادثة. راجع القائمة قبل الضغط — لا تراجع بعد الإرسال.',
        confirmText: 'أرسل',
      });
      if (!okGo) return;
      await runCampaign(ctx, targets, {
        tpl, campaign: campaignSelect.value, pace: Number(paceInput.value) || 0, button: sendBtn,
      });
    },
  });
  ctx.nodes.sendBtn = sendBtn;

  return el('section', { class: 'panel' },
    el('h2', { text: 'حملة تسويقية' }),
    el('p', { class: 'panel-desc' },
      'واتساب لا يسمح برسالةٍ حرّة يبدؤها المكتب — تُرسل بقالبٍ تعتمده Meta أوّلًا. ',
      'فاختر القالب المعتمَد، ومن تُرسل إليه.'),
    el('div', { class: 'form-grid' },
      labeled('القالب', tplSelect, { hint: 'متغيّراتُه تُملأ لكلّ عميلٍ باسمه هو' }),
      labeled('الحملة', campaignSelect, { hint: 'اختياريّ — يُنسب ما أُرسل إليها فتُقاس كلفتُها' }),
      labeled('مهلة بين رسالة وأخرى (ثانية)', paceInput, {
        hint: 'صفر = بلا مهلة. والدفعةُ السريعة تُغضب مزوّدَ الخدمة وقد تُوقف رقمك.',
      })),
    el('div', { class: 'panel-block' },
      el('h3', { text: 'إلى من؟' }),
      ctx.nodes.audience,
      ctx.nodes.audienceCount),
    sendBtn,
    ctx.nodes.log);
}

function allTags(ctx) {
  const builtin = BUILTIN_CLIENT_TAGS.map((t) => t.label);
  const custom = ctx.lists?.clientTags || [];
  return [...new Set([...builtin, ...custom])];
}

function audience(ctx) {
  // **ومن طلب ألّا تتصل به لا تُرسَل إليه حملة** (المرحلة ٥٠): الحقلُ قائمٌ منذ المرحلة ٣٢
  // وتحترمه اللوحاتُ كلُّها، **وكانت الحملةُ وحدها تتخطّاه** — وهي أشدُّ ما يُغضبه.
  const reachable = ctx.clients.filter((c) => c.phone && !c.doNotContact);
  if (!ctx.tags.size) return reachable;
  return reachable.filter((c) => (c.tags || []).some((t) => ctx.tags.has(t)));
}

function renderAudience(ctx) {
  const wrap = ctx.nodes.audience;
  clear(wrap);
  const tags = allTags(ctx);
  const chips = el('div', { class: 'chips' });
  chips.append(allChip(ctx.tags, tags, () => renderAudience(ctx)));
  for (const tag of tags) {
    const n = ctx.clients.filter((c) => c.phone && !c.doNotContact && (c.tags || []).includes(tag)).length;
    const active = ctx.tags.has(tag);
    chips.append(el('button', {
      type: 'button', class: `chip${active ? ' active' : ''}${n === 0 && !active ? ' zero' : ''}`,
      onClick: () => {
        if (active) ctx.tags.delete(tag); else ctx.tags.add(tag);
        renderAudience(ctx);
      },
    }, tag, el('span', { class: 'chip-count', text: String(n) })));
  }
  wrap.append(el('div', { class: 'filter-row' }, el('span', { class: 'filter-label', text: 'التصنيف' }), chips));

  const targets = audience(ctx);
  const noPhone = ctx.clients.filter((c) => !c.phone).length;
  const dnc = ctx.clients.filter((c) => c.phone && c.doNotContact).length;
  const skipped = [
    noPhone ? `${formatNumber(noPhone)} بلا جوال` : '',
    dnc ? `${formatNumber(dnc)} طلبوا ألّا تتصل بهم` : '',
  ].filter(Boolean).join('، و');
  ctx.nodes.audienceCount.textContent = ctx.tags.size
    ? `${formatNumber(targets.length)} من عملائك يحملون التصنيف المختار ولهم جوال.${skipped ? ` ويُتخطّى ${skipped}.` : ''}`
    : `كل من له جوال: ${formatNumber(targets.length)}${skipped ? ` — ويُتخطّى ${skipped}.` : '.'}`;
}

async function runCampaign(ctx, targets, { tpl, campaign, pace, button }) {
  button.disabled = true;
  const original = button.textContent;
  clear(ctx.nodes.log);
  const rows = el('div');
  ctx.nodes.log.append(el('h3', { text: 'سجلّ الإرسال' }), rows);

  let sent = 0;
  let failed = 0;
  const logged = [];
  for (const [i, client] of targets.entries()) {
    button.textContent = `يرسل ${i + 1}/${targets.length}…`;
    const values = templateValues({ client, lists: ctx.lists, user: getCurrentUser(), company: ctx.company });
    const res = await runIntegration('whatsapp', 'template.send', {
      to: client.phone, template: tpl.name, language: tpl.language,
      components: templateComponents(tpl.vars, values),
    });
    const good = res?.ok;
    if (good) sent++; else failed++;
    logged.push({
      kind: 'campaign', template: tpl.name, campaign, to: client.phone, name: client.name,
      ok: !!good, error: good ? '' : explain(res, 'whatsapp'),
    });
    rows.append(el('div', { class: 'queue-row' },
      el('span', { class: 'queue-name', text: client.name || formatPhone(client.phone) }),
      good ? badge('أُرسلت', 'badge-ok') : badge(explain(res, 'whatsapp'), 'badge-danger')));
    // أوّل فشلٍ بسبب نقص التهيئة يوقف الحملة: لا معنى لتكرار الفشل مئة مرّة،
    // ولا لإيهام المستخدم أنّ شيئًا يجري.
    if (!good && res?.status === 'not_configured') {
      rows.append(el('p', { class: 'field-hint', text: 'أُوقفت الحملة: التكامل غير مُهيَّأ — لا فائدة من متابعة الإرسال.' }));
      break;
    }
    // **مهلةٌ بين رسالةٍ وأخرى**: دفعةٌ من مئةٍ في ثانيةٍ واحدةٍ تُغضب مزوّدَ الخدمة،
    // وقد يُوقف رقمك — وإيقافُ الرقم أغلى من بطء الحملة.
    if (pace > 0 && i < targets.length - 1) await new Promise((r) => setTimeout(r, pace * 1000));
  }
  // **ويُحفظ السجلّ**: كان يعيش في الشاشة وحدها فيضيع بإعادة التحميل، ولا يُعرف بعدها
  // من وصلته الرسالةُ ومن لم تصله.
  await addWaSends(logged);
  button.textContent = original;
  button.disabled = false;
  toast(`أُرسلت ${formatNumber(sent)}${failed ? ` · فشلت ${formatNumber(failed)}` : ''}`, failed ? 'error' : 'success', 6000);
}

/* ===== ٦. سجلّ ما أُرسل ===== */

function sendLogPanel(ctx) {
  const rows = [...ctx.sends].reverse();
  const body = el('div');
  if (!rows.length) {
    body.append(el('p', { class: 'muted small', text: 'لم يُرسَل شيءٌ من هنا بعد.' }));
  } else {
    const ok = rows.filter((r) => r.ok).length;
    body.append(
      el('p', { class: 'muted small', text: `${countOf(rows.length, 'رسالة')} · نجح ${formatNumber(ok)} · فشل ${formatNumber(rows.length - ok)}` }),
      el('div', { class: 'table-wrap' }, el('table', { class: 'table' },
        el('thead', {}, el('tr', {}, ['متى', 'إلى', 'النوع', 'القالب', 'الحال'].map((h) => el('th', { text: h })))),
        el('tbody', {}, rows.slice(0, 60).map((r) => el('tr', {},
          el('td', { text: relativeDays(r.at) }),
          el('td', { text: r.name || formatPhone(r.to) }),
          el('td', { text: KIND_AR[r.kind] || r.kind }),
          el('td', {}, r.template ? el('code', { class: 'ltr', text: r.template }) : el('span', { class: 'muted', text: '—' })),
          el('td', {}, r.ok ? badge('وصلت', 'badge-ok') : badge(r.error || 'فشلت', 'badge-danger'))))))),
      el('button', {
        type: 'button', class: 'btn btn-ghost btn-sm', text: 'امسح السجلّ',
        onClick: async () => {
          const go = await confirmDialog({ title: 'مسح سجلّ الإرسال', message: 'يُمسح ما سُجِّل هنا — ولا يُلغي رسالةً أُرسلت.', confirmText: 'امسح', danger: true });
          if (!go) return;
          await clearWaSends();
          render(ctx.container);
        },
      }));
  }
  return el('section', { class: 'panel' },
    el('h2', { text: 'سجلّ ما أُرسل' }),
    el('p', { class: 'panel-desc', text: 'من وصلته رسالتُك ومن لم تصله. ويبقى بعد إعادة التحميل — وكان يضيع بها.' }),
    body);
}

const KIND_AR = { offer: 'عرضٌ لعميل', campaign: 'حملة', reply: 'ردٌّ من الوارد' };
