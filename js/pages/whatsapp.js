// صفحة واتساب (المرحلة ٣٨): الوارد، والتسويق بالقوالب، وما ينقص لتشغيلهما.
//
// **ما يعمل الآن بلا اشتراك** يبقى كما هو: قوالبُ الرسائل في الإعدادات تُنسخ وتُفتح في
// واتساب يدويًّا منذ المرحلة ١١، ولا تحتاج شيئًا. وهذه الصفحة تضيف البابين اللذين
// يحتاجان حساب «واتساب للأعمال»: أن تصل رسائل العملاء إلى هنا، وأن تُرسل حملةٌ بقالبٍ
// معتمَد إلى قائمةٍ تختارها.
//
// **وما لا يعمل يُقال، لا يُموَّه**: إن نقص متغيّرٌ في Netlify قالت الصفحة اسمه بالضبط
// وأين يُكتب، ولم تعرض صندوقًا فارغًا يوهم أنّ الرسائل لم تصل بعد.
//
// **قيدٌ من واتساب لا منّا**: لا يبدأ المكتب رسالةً حرّة — يبدؤها بقالبٍ تعتمده Meta.
// فإن ردّ العميل انفتحت نافذةُ أربعٍ وعشرين ساعةً تُراسله فيها بحرّية. وهذا سببُ كون
// «الحملة» بالقوالب لا بنصٍّ تكتبه هنا.

import { repo } from '../data/repository.js';
import { el, clear, labeled, selectEl, badge, toast, emptyState, confirmDialog, allChip } from '../util/dom.js';
import { formatDateTime, formatNumber, countWord } from '../util/format.js';
import { formatPhone } from '../util/phone.js';
import { readPublicApi, resetPublicApi } from '../util/public-api.js';
import { loadIntegrations, runIntegration, explain } from '../data/integrations.js';
import { BUILTIN_CLIENT_TAGS } from '../data/schema.js';
import { getLists } from '../data/settings.js';

const INBOX_URL = '/api/whatsapp';

export async function render(container) {
  clear(container);
  const ctx = {
    container,
    status: null,
    messages: [],
    clients: [],
    tags: new Set(),
    lists: null,
    sending: false,
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
  container.append(statusPanel(ctx), inboxPanel(ctx), campaignPanel(ctx));
  renderInbox(ctx);
  renderAudience(ctx);
}

async function load(ctx) {
  const [rows, inbox, clients, lists] = await Promise.all([
    loadIntegrations(),
    readPublicApi(INBOX_URL, null),
    repo.clients.list(),
    getLists(),
  ]);
  ctx.status = rows.find((r) => r.key === 'whatsapp') || null;
  ctx.messages = inbox?.messages || [];
  ctx.inboxReadable = !!inbox;
  ctx.clients = clients;
  ctx.lists = lists;
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
    el('code', {
      class: 'ltr wa-webhook',
      text: `${location.origin}/api/whatsapp`,
    }));

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

/* ===== ٢. الوارد ===== */

function inboxPanel(ctx) {
  ctx.nodes.inbox = el('div');
  return el('section', { class: 'panel' },
    el('h2', {}, 'الوارد ', ctx.nodes.inboxCount = el('span', { class: 'count' })),
    el('p', { class: 'panel-desc', text: 'ما يصل من العملاء إلى رقم مكتبك. والرسالة تُربط بصاحبها إن كان في عملائك، وإلّا فبضغطةٍ تُضيفه.' }),
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
  const table = el('table', { class: 'table' },
    el('thead', {}, el('tr', {}, ['متى', 'من', 'الرسالة', ''].map((h) => el('th', { text: h })))),
    el('tbody', {}, ctx.messages.map((m) => {
      const client = byPhone.get(m.from) || null;
      return el('tr', {},
        el('td', { text: formatDateTime(m.at) }),
        el('td', {},
          client
            ? el('a', { href: `#/client/${client.id}`, text: client.name || formatPhone(client.phone) })
            : el('span', {}, el('span', { class: 'tel', text: formatPhone(m.from) }),
              m.name ? el('div', { class: 'muted small', text: m.name }) : null)),
        el('td', {},
          m.text || el('span', { class: 'muted', text: m.mediaId ? `(${m.type}) — الوسائط تبقى في واتساب` : '(بلا نص)' })),
        el('td', {},
          client ? null : el('button', {
            type: 'button', class: 'btn btn-sm', text: '+ أضفه عميلًا',
            onClick: async () => {
              const created = await repo.clients.create({ name: m.name || '', phone: m.from, notes: `أول رسالة واتساب: ${m.text || ''}`.trim() });
              toast('أُضيف العميل', 'success');
              location.hash = `#/client/${created.id}`;
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

/* ===== ٣. الحملة ===== */

function campaignPanel(ctx) {
  const templateInput = el('input', { class: 'input', type: 'text', placeholder: 'اسم القالب كما اعتمدته Meta' });
  const langSelect = selectEl({
    options: [{ value: 'ar', label: 'العربية' }, { value: 'en', label: 'الإنجليزية' }],
    value: 'ar',
  });
  ctx.nodes.audience = el('div', { class: 'filters' });
  ctx.nodes.audienceCount = el('p', { class: 'muted small' });
  ctx.nodes.log = el('div', { class: 'campaign-log' });

  const sendBtn = el('button', {
    type: 'button', class: 'btn btn-primary', text: 'أرسل الحملة',
    onClick: async () => {
      const name = templateInput.value.trim();
      if (!name) { toast('اكتب اسم القالب المعتمَد', 'error'); return; }
      const targets = audience(ctx);
      if (!targets.length) { toast('لا أحد في القائمة المختارة', 'error'); return; }
      const okGo = await confirmDialog({
        title: `إرسال إلى ${countWord(targets.length, ['عميل واحد', 'عميلين', 'عملاء', 'عميلًا'])}؟`,
        message: 'الإرسال بقالبٍ معتمَد، وواتساب يحاسب على كل محادثة. راجع القائمة قبل الضغط — لا تراجع بعد الإرسال.',
        confirmText: 'أرسل',
      });
      if (!okGo) return;
      await runCampaign(ctx, targets, { template: name, language: langSelect.value, button: sendBtn });
    },
  });
  ctx.nodes.sendBtn = sendBtn;

  return el('section', { class: 'panel' },
    el('h2', { text: 'حملة تسويقية' }),
    el('p', { class: 'panel-desc' },
      'واتساب لا يسمح برسالةٍ حرّة يبدؤها المكتب — تُرسل بقالبٍ تعتمده Meta أوّلًا. ',
      'فاكتب هنا اسم القالب المعتمَد، واختر من تُرسل إليه.'),
    el('div', { class: 'form-grid' },
      labeled('اسم القالب', templateInput, { hint: 'الاسم الحرفيّ في لوحة Meta — لا عنوانه المعروض' }),
      labeled('لغة القالب', langSelect)),
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
  const withPhone = ctx.clients.filter((c) => c.phone);
  if (!ctx.tags.size) return withPhone;
  return withPhone.filter((c) => (c.tags || []).some((t) => ctx.tags.has(t)));
}

function renderAudience(ctx) {
  const wrap = ctx.nodes.audience;
  clear(wrap);
  const tags = allTags(ctx);
  const chips = el('div', { class: 'chips' });
  chips.append(allChip(ctx.tags, tags, () => renderAudience(ctx)));
  for (const tag of tags) {
    const n = ctx.clients.filter((c) => c.phone && (c.tags || []).includes(tag)).length;
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
  const noPhone = ctx.clients.length - ctx.clients.filter((c) => c.phone).length;
  ctx.nodes.audienceCount.textContent = ctx.tags.size
    ? `${formatNumber(targets.length)} من عملائك يحملون التصنيف المختار ولهم جوال.`
    : `كل من له جوال: ${formatNumber(targets.length)}${noPhone ? ` — و${formatNumber(noPhone)} بلا جوال يُتخطَّون.` : '.'}`;
}

async function runCampaign(ctx, targets, { template, language, button }) {
  button.disabled = true;
  const original = button.textContent;
  clear(ctx.nodes.log);
  const rows = el('div');
  ctx.nodes.log.append(el('h3', { text: 'سجلّ الإرسال' }), rows);

  let sent = 0;
  let failed = 0;
  for (const [i, client] of targets.entries()) {
    button.textContent = `يرسل ${i + 1}/${targets.length}…`;
    const res = await runIntegration('whatsapp', 'template.send', {
      to: client.phone, template, language,
    });
    const good = res?.ok;
    if (good) sent++; else failed++;
    rows.append(el('div', { class: 'queue-row' },
      el('span', { class: 'queue-name', text: client.name || formatPhone(client.phone) }),
      good ? badge('أُرسلت', 'badge-ok') : badge(explain(res, 'whatsapp'), 'badge-danger')));
    // أوّل فشلٍ بسبب نقص التهيئة يوقف الحملة: لا معنى لتكرار الفشل مئة مرّة،
    // ولا لإيهام المستخدم أنّ شيئًا يجري.
    if (!good && res?.status === 'not_configured') {
      rows.append(el('p', { class: 'field-hint', text: 'أُوقفت الحملة: التكامل غير مُهيَّأ — لا فائدة من متابعة الإرسال.' }));
      break;
    }
  }
  button.textContent = original;
  button.disabled = false;
  toast(`أُرسلت ${formatNumber(sent)}${failed ? ` · فشلت ${formatNumber(failed)}` : ''}`, failed ? 'error' : 'success', 6000);
}
