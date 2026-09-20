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

import { el, clear, emptyState, toast, confirmDialog, openModal, selectEl, SESSION_GONE, sessionGoneNote } from '../util/dom.js';
import { repo } from '../data/repository.js';
import { getLists } from '../data/settings.js';
import { formatDate, formatNumber } from '../util/format.js';
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

async function drop(key, why = '') {
  await fetch(API, {
    method: 'DELETE', credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ key, why }),
  });
}

/**
 * **ولماذا صرفتَه؟** (المرحلة ٥٢) — الحذفُ الصامت يضيّع أنفعَ ما في الصندوق: أن ترى
 * بعد شهرٍ أنّ نصفَ ما يصلك دعايةٌ، فتغلق البابَ من أوّله بدل أن تصرفه كلَّ يوم.
 * **والسببُ اختياريّ**: «احذف بلا سبب» بابٌ قائمٌ لا يُغلَق، فلا يصير السؤالُ ضريبةً.
 */
export const DROP_REASONS = [
  { value: 'spam', label: 'دعايةٌ أو رسالةٌ عامّة' },
  { value: 'duplicate', label: 'مكرَّرٌ عندي أصلًا' },
  { value: 'unclear', label: 'غامضٌ لا يُبنى عليه' },
  { value: 'not_mine', label: 'خارجُ سوقي (مدينةٌ أو نوعٌ لا أعمل فيه)' },
  { value: 'handled', label: 'تصرّفتُ فيه خارج البرنامج' },
];

function askWhy(onDone) {
  const sel = selectEl({ options: DROP_REASONS, placeholder: 'اختر سببًا (اختياريّ)' });
  const note = el('input', { class: 'input', type: 'text', placeholder: 'أو اكتبه بكلماتك', maxLength: 120 });
  const modal = openModal({
    title: 'لماذا تصرفه؟',
    body: el('div', { class: 'form-grid' },
      el('div', { class: 'field' }, sel),
      el('div', { class: 'field' }, note),
      el('p', { class: 'muted small', text: 'يُحفظ السببُ وحدَه لا نصُّ الرسالة — ليُقرأ نمطُ ما يضيّع وقتَك.' })),
    footer: [
      el('button', {
        type: 'button', class: 'btn btn-primary', text: 'احذفه',
        onClick: () => {
          const why = note.value.trim() || (DROP_REASONS.find((r) => r.value === sel.value)?.label || '');
          modal.close();
          onDone(why);
        },
      }),
      el('button', { type: 'button', class: 'btn btn-ghost', text: 'احذفه بلا سبب', onClick: () => { modal.close(); onDone(''); } }),
      el('span', { class: 'spacer' }),
      el('button', { type: 'button', class: 'btn btn-ghost', text: 'تراجع', onClick: () => modal.close() }),
    ],
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
  // **ونمطُ ما تصرفه يُقرأ** (المرحلة ٥٢): السطرُ الواحد لا يفيد، والعشرةُ تقول
  // «نصفُ ما يصلك دعاية» — فتُغلق البابَ من أوّله بدل أن تصرفه كلَّ يوم.
  const rejects = Array.isArray(data.rejects) ? data.rejects : [];
  if (rejects.length) {
    const byWhy = new Map();
    for (const r of rejects) byWhy.set(r.why, (byWhy.get(r.why) || 0) + 1);
    const top = [...byWhy.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
    rows.push(el('details', { class: 'panel-block' },
      el('summary', { text: `ما صرفتَه ولماذا (${formatNumber(rejects.length)})` }),
      el('ul', { class: 'simple-list' }, top.map(([why, n]) => el('li', {},
        el('span', { text: why }), el('span', { class: 'num strong', text: formatNumber(n) }))))));
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
      onClick: () => askWhy(async (why) => { await drop(msg.key, why); toast('حُذف'); refresh(); }),
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
