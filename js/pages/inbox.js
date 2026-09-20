/**
 * **الوارد** — ما حوّلتَه من واتساب، مفروزًا وينتظر اعتمادك (المرحلة ٥١).
 *
 * تصلك الطلباتُ والعروضُ في واتساب، وإدخالُها بيدك هو العملُ الذي يُؤجَّل إلى المساء
 * **ثم يُنسى**. فصارت لك قناةٌ في تيليجرام: تحوّل الرسالةَ كما هي، فيقرؤها خادمُك
 * ويفرزها طلبًا أو عرضًا، وتجدها هنا.
 *
 * **ولا يُحفظ شيءٌ في قاعدتك بلا ضغطتك** — وهي قاعدةُ النظام منذ المرحلة ٤. وما تراه
 * هنا محفوظٌ في الخادم لا في مخزونك: **بريدٌ ينتظر الفتح، لا سجلٌّ دخل**.
 *
 * **والاعتمادُ يمرّ بالمسارين القائمين** لا بثالثٍ يُخترع: الطلبُ يفتح استمارةَ الطلبات
 * معبّأةً كما يفعل «لصق رسالة عميل»، والعرضُ يفتح نافذةَ اللصق في العقارات. فمحلّلٌ
 * واحدٌ يُصان، وشاشةُ اعتمادٍ واحدةٌ تُعرف.
 */

import { el, clear, emptyState, toast, confirmDialog, SESSION_GONE, sessionGoneNote } from '../util/dom.js';
import { repo } from '../data/repository.js';
import { getLists } from '../data/settings.js';
import { formatDate } from '../util/format.js';
import { KIND_LABELS, sortReason } from '../util/lead-sort.js';
import { parseRequestText, parseOfferText } from '../data/listing-parse.js';
import { normalizePhone } from '../util/phone.js';

const API = '/api/telegram';

/** قراءةٌ تفرّق بين «لم تسجّل الدخول» و«لا شيء بعد» — وبينهما فرقُ عملٍ كامل. */
async function load() {
  const res = await fetch(API, { credentials: 'same-origin' });
  if (res.status === 401) return { error: SESSION_GONE, gone: true };
  if (!res.ok) return { error: `تعذّرت القراءة (${res.status})` };
  return res.json();
}

async function drop(key) {
  await fetch(API, {
    method: 'DELETE', credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ key }),
  });
}

/* ===== لوحة الحال: أمربوطٌ البوت؟ ولمن؟ وهل صمت ولماذا؟ ===== */

function statusPanel(data, refresh) {
  const rows = [];
  if (!data.linked) {
    rows.push(el('p', {},
      el('strong', { text: 'البوت غير مربوط. ' }),
      `ينقص على Netlify: ${data.missing.join(' · ')} — ولا يصل شيءٌ حتى تُضبط.`));
  } else if (!data.owner) {
    rows.push(el('p', {},
      el('strong', { text: 'جاهزٌ وينتظر أوّل رسالة. ' }),
      'راسل بوتك بأيّ كلمة فيرتبط بمحادثتك، ولا يستقبل من غيرها بعدها.'));
  } else {
    rows.push(el('p', { class: 'muted small' },
      `مربوطٌ بمحادثة ${data.owner.name || 'بلا اسم'} منذ ${formatDate(data.owner.at)}. `,
      el('button', {
        type: 'button', class: 'btn btn-ghost btn-sm', text: 'افصل الربط',
        onClick: async () => {
          const yes = await confirmDialog({
            title: 'فصل الربط؟',
            message: 'يعود البوت حرًّا فيرتبط بأوّل من يراسله بعد ذلك — وما وصل يبقى كما هو.',
            confirmText: 'افصل', danger: true,
          });
          if (!yes) return;
          await fetch(API, {
            method: 'DELETE', credentials: 'same-origin',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ unbind: true }),
          });
          toast('فُصل الربط');
          refresh();
        },
      })));
  }
  // **وصمتُ البوت يُقال سببُه**: ردٌّ يفشل بلا خبرٍ يجعلك تظنّ أنّ شيئًا لم يصل، وقد وصل.
  if (data.lastReplyError) {
    rows.push(el('p', { class: 'muted small' },
      el('strong', { text: '⚠︎ آخرُ ردٍّ فشل: ' }),
      `${data.lastReplyError.why} (${formatDate(data.lastReplyError.at)})`));
  }
  return el('div', { class: 'panel' },
    el('h2', { text: 'حال القناة' }),
    ...rows);
}

/* ===== بطاقةُ رسالة ===== */

function card(ctx, msg, refresh) {
  const kind = msg.kind || 'unsure';
  const known = msg.phone
    ? ctx.clients.find((c) => normalizePhone(c.phone) === normalizePhone(msg.phone))
    : null;

  const head = el('div', { class: 'row', style: { justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' } },
    el('span', { class: `badge badge-${kind === 'request' ? 'ok' : kind === 'offer' ? 'accent' : 'warn'}`, text: KIND_LABELS[kind] }),
    el('span', { class: 'muted small', text: `${msg.senderName || 'بلا اسم'} · ${formatDate(msg.at)}` }));

  const body = el('p', { class: 'wa-quote', text: msg.text });

  const why = el('p', { class: 'muted small', text: sortReason({ kind, why: msg.why || [] }) });

  /** الطلبُ: المسارُ القائم نفسُه (`kassab:quick-request` + `?new=quick`). */
  const asRequest = () => {
    const parsed = parseRequestText(msg.text, {
      districts: ctx.lists.districtsByCity?.[ctx.lists.cities[0]] || [],
      types: ctx.lists.propertyTypes,
      cities: ctx.lists.cities,
    });
    try {
      sessionStorage.setItem('kassab:quick-request', JSON.stringify({ ...parsed.fields, notes: msg.text.slice(0, 500) }));
    } catch (_) { /* تصفح خاص */ }
    drop(msg.key);
    location.hash = '#/requests?new=quick';
  };

  /** العرضُ: نافذةُ اللصق في العقارات، ونصُّها مبذورٌ فيها. */
  const asOffer = () => {
    try { sessionStorage.setItem('kassab:quick-offer', msg.text); } catch (_) { /* تصفح خاص */ }
    drop(msg.key);
    location.hash = '#/properties?new=paste';
  };

  const actions = el('div', { class: 'row', style: { gap: '6px', flexWrap: 'wrap', marginTop: '10px' } },
    el('button', { type: 'button', class: `btn btn-sm${kind === 'request' ? ' btn-primary' : ''}`, text: 'اعتمده طلبًا', onClick: asRequest }),
    el('button', { type: 'button', class: `btn btn-sm${kind === 'offer' ? ' btn-primary' : ''}`, text: 'اعتمده عرضًا', onClick: asOffer }),
    el('button', {
      type: 'button', class: 'btn btn-ghost btn-sm', text: 'احذفه',
      onClick: async () => { await drop(msg.key); toast('حُذف'); refresh(); },
    }));

  const parts = [head, body, why];
  // **والمعروفُ يُقال قبل أن تكلّمه من الصفر**: عميلٌ تتابعه منذ شهرين يترك رقمه فيظهر غريبًا.
  if (known) {
    parts.push(el('p', { class: 'muted small' },
      el('strong', { text: 'هذا عميلُك: ' }),
      el('a', { href: `#/clients/${known.id}`, text: known.name })));
  }
  if (msg.mediaKind) parts.push(el('p', { class: 'muted small', text: `مرفقٌ لم يُقرأ: ${msg.mediaKind}` }));
  parts.push(actions);
  return el('div', { class: 'panel' }, ...parts);
}

/* ===== الصفحة ===== */

export async function render(container) {
  const ctx = {
    container,
    lists: await getLists(),
    clients: await repo.clients.list(),
  };

  const area = el('div', { style: { marginTop: '18px' } });

  const refresh = async () => {
    clear(area);
    const data = await load();
    if (data.error) { area.append(data.gone ? sessionGoneNote() : emptyState(data.error)); return; }
    area.append(statusPanel(data, refresh));
    if (!data.messages.length) {
      area.append(emptyState('لا وارد بعد. حوّل رسالةَ عميلٍ إلى بوتك في تيليجرام، فتظهر هنا مفروزةً في ثانية.'));
      return;
    }
    for (const m of data.messages) area.append(card(ctx, m, refresh));
  };

  container.append(
    el('div', { class: 'page-head' },
      el('h1', { text: 'الوارد' }),
      el('div', { class: 'head-actions' },
        el('button', { type: 'button', class: 'btn btn-ghost', text: 'حدّث', onClick: refresh }))),
    el('div', { class: 'notice' },
      el('strong', { text: 'ما وصل، لا ما دخل. ' }),
      'هذه رسائلُ حوّلتَها، قرأها الخادمُ وفرزها بقواعدَ لا بذكاء — ',
      'ولا يدخل شيءٌ قاعدتَك حتى تضغط «اعتمده». والفرزُ اقتراحٌ: اعتمد الرسالةَ على غير ما فُرزت متى شئت.'),
    area,
  );
  await refresh();
}
