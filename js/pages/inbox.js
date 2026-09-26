/**
 * **الوارد** — ما حوّلتَه من واتساب، مفروزًا وينتظر اعتمادك (المرحلة ٥١، ووُسِّع في ٥٣).
 *
 * تصلك الطلباتُ والعروضُ في واتساب، وإدخالُها بيدك هو العملُ الذي يُؤجَّل إلى المساء
 * **ثم يُنسى**. فصارت لك قناةٌ في تيليجرام: تحوّل الرسالةَ كما هي، فيقرؤها خادمُك
 * ويفرزها، وتجدها هنا.
 *
 * **ولا يُحفظ شيءٌ في قاعدتك بلا ضغطتك** — وهي قاعدةُ النظام منذ المرحلة ٤. وما تراه
 * هنا محفوظٌ في الخادم لا في مخزونك: **بريدٌ ينتظر الفتح، لا سجلٌّ دخل**.
 *
 * **والاعتمادُ يمرّ بالمسارات القائمة** لا بمسارٍ يُخترع لكلّ صنف (المرحلة ٥٣):
 *   طلبٌ        → استمارةُ الطلبات معبّأةً (`kassab:quick-request`)
 *   عرضٌ        → نافذةُ اللصق في العقارات (`kassab:quick-offer`)
 *   فرصةٌ       → صندوقُ الإضافة في «الفرص العقاريّة» (`kassab:quick-prospect`)
 *   مهمّةٌ      → صندوقُ الدفعة في «المهام» (`kassab:quick-task`)
 *   مقترَحٌ/فكرةٌ → صندوقُ الالتقاط في «الأفكار والملاحظات» موسومًا (`kassab:quick-note`)
 *
 * فمحلّلٌ واحدٌ يُصان، وشاشاتُ اعتمادٍ تعرفها، **ولا شاشةَ اعتمادٍ ثانيةٌ تُبنى هنا**.
 */

import { el, clear, emptyState, toast, confirmDialog, openModal, selectEl, disclosure, SESSION_GONE } from '../util/dom.js';
import { repo } from '../data/repository.js';
import { getLists } from '../data/settings.js';
import { formatDate, formatNumber } from '../util/format.js';
import { KINDS, KIND_LABELS, KIND_ACC, sortReason } from '../util/lead-sort.js';
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

/**
 * **عدّله ثمّ اعتمده** (المرحلة ٥٤) — البابُ الرابع.
 *
 * كانت أمامك ثلاثة: طلبٌ أو عرضٌ أو حذف. **ورسالةٌ تحتاج لمسةً يسيرة** — رقمٌ التصق،
 * أو سطرُ دعايةٍ ملصق، أو اسمٌ ناقص — لم يكن لها باب: تُحذف وتُكتب من الصفر، أو تُعتمد
 * ناقصةً وتُصحَّح في الاستمارة. فصارت تُعدَّل في مكانها، **ويُعاد فرزُها بعد التعديل**.
 */
async function editText(key, text) {
  const res = await fetch(API, {
    method: 'PUT', credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ key, text }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `تعذّر الحفظ (${res.status})`);
  }
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

function askEdit(msg, onSaved) {
  const area = el('textarea', { class: 'input', rows: 8, value: msg.text });
  const errorsBox = el('div', { class: 'form-errors', hidden: true });
  const save = el('button', {
    type: 'button', class: 'btn btn-primary', text: 'احفظ التعديل',
    onClick: async () => {
      const text = area.value.trim();
      if (!text) {
        clear(errorsBox);
        errorsBox.append(el('p', { text: 'النصُّ فارغ — احذف الرسالة إن لم تُرِدها.' }));
        errorsBox.hidden = false;
        return;
      }
      save.disabled = true;
      try {
        await editText(msg.key, text);
        modal.close();
        toast('حُفظ التعديل وأُعيد الفرز', 'success');
        onSaved();
      } catch (err) {
        clear(errorsBox);
        errorsBox.append(el('p', { text: err.message }));
        errorsBox.hidden = false;
      } finally { save.disabled = false; }
    },
  });
  const modal = openModal({
    title: 'عدّل الرسالة قبل اعتمادها',
    body: el('div', {}, errorsBox,
      el('div', { class: 'field' }, area),
      el('p', { class: 'muted small' },
        el('strong', { text: 'ويُعاد الفرزُ بعد حفظك. ' }),
        'فمن حذف «للبيع» لم يبقَ الحكمُ عرضًا. والتعديلُ هنا لا يُدخل شيئًا قاعدتَك — ',
        'الاعتمادُ وحدَه يفعل.')),
    footer: [save, el('span', { class: 'spacer' }),
      el('button', { type: 'button', class: 'btn btn-ghost', text: 'إلغاء', onClick: () => modal.close() })],
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
  /**
   * **نبضُ القناة** (المرحلة ٥٤) — «أرسلتُ أمسِ ولم أجدها».
   *
   * وكان الصندوقُ الفارغ لا يُفرّق بين ثلاثٍ: **لم تصل أصلًا** (وِبهوكٌ لم يُسجَّل عند
   * تيليجرام)، أو **وصلت ورُدّت** (سرٌّ خاطئ أو محادثةٌ غريبة)، أو **وصلت واعتمدتَها
   * فخرجت**. وبينها فرقُ علاجٍ كامل. فصار العدّادُ يقولها.
   */
  const pulse = data.pulse;
  const counts = pulse?.counts || {};
  const LINES = [
    ['arrived', 'وصلت إلى الخادم'],
    ['stored', 'دخلت الصندوق'],
    ['duplicate', 'مكرَّرةٌ لم تُضَف مرّتين'],
    ['badSecret', '⚠︎ رُدَّت: سرُّ الترويسة لا يطابق TELEGRAM_SECRET'],
    ['strangerChat', 'رُدَّت: من محادثةٍ غير محادثتك'],
    ['noText', 'رُدَّت: بلا نصّ (صورةٌ أو صوتٌ بلا تعليق)'],
    ['noSecretConfigured', '⚠︎ رُدَّت: TELEGRAM_SECRET غير مضبوطٍ أصلًا'],
  ].filter(([k]) => counts[k]);

  if (!pulse || !counts.arrived) {
    rows.push(el('p', { class: 'muted small' },
      el('strong', { text: 'ولم يصل الخادمَ شيءٌ بعدُ. ' }),
      'فإن كنتَ راسلتَ البوت ولم تجد رسالتك هنا، فالغالبُ أنّ الوِبهوك لم يُسجَّل عند تيليجرام — ',
      'أو أنّ هذا العدّاد بدأ بعد إرسالك. وتسجيلُ الوِبهوك مرّةً واحدة يكفي.'));
  } else {
    rows.push(el('details', { class: 'panel-block' },
      el('summary', { text: `نبضُ القناة — آخرُ وصولٍ ${formatDate(pulse.arrivedAt || pulse.at)}` }),
      el('ul', { class: 'simple-list' }, LINES.map(([k, label]) => el('li', {},
        el('span', { text: label }),
        el('span', { class: 'num strong', text: formatNumber(counts[k]) })))),
      el('p', { class: 'muted small', text: 'عدّادٌ بلا نصوصٍ ولا معرّفات — يقول أين الخلل لا ما في الرسائل.' })));
  }

  return el('div', { class: 'panel' },
    el('h2', { text: 'حال القناة' }),
    ...rows);
}

/* ===== لماذا رُفضت الجلسة؟ (المرحلة ٥٥) ===== */

/**
 * **«انتهت جلستك» كانت تُقال لثلاثة أسبابٍ لا يُفرَّق بينها:**
 *   ١) جلسةٌ انتهت فعلًا — فيكفي الخروجُ والدخول.
 *   ٢) خادمٌ لا يرى مفتاحَ التوقيع (`APP_SECRET`/`APP_PASSWORD`) — فيرفض **كلَّ** جلسة،
 *      ولا يُصلحه دخولٌ ولا خروج.
 *   ٣) بوّابةٌ لا ترى كلمةَ السرّ — فتفتح الموقعَ بلا دخول، **ولا تُصدِر جلسةً أصلًا**.
 * والثاني والثالث وقعا بعد تأشير هذه المتغيّرات «سرّيّةً» في Netlify. فصار يُسأل الخادمُ
 * والبوّابةُ عمّا يريان — **«نعم» أو «لا» بلا قيمٍ أبدًا** — ويُقال السببُ الحقّ وعلاجُه.
 */
async function diagnoseSession() {
  let probe = null;
  let gateOpen = false;
  try { probe = await (await fetch(`${API}?probe=1`, { credentials: 'same-origin' })).json(); } catch (_) { probe = null; }
  try { gateOpen = (await fetch('/', { method: 'HEAD', credentials: 'same-origin' })).headers.get('x-kassab-gate') === 'open-no-password'; } catch (_) { gateOpen = false; }

  const serverBlind = probe && !probe.sees?.APP_SECRET && !probe.sees?.APP_PASSWORD;
  const box = el('div', { class: 'panel' }, el('h2', { text: 'لماذا لا يُفتح الصندوق؟' }));

  if (serverBlind || gateOpen) {
    const blind = [
      serverBlind ? 'الدوالُّ لا ترى APP_SECRET ولا APP_PASSWORD' : null,
      gateOpen ? 'البوّابةُ لا ترى APP_PASSWORD — فالموقعُ مفتوحٌ بلا كلمة سرّ' : null,
    ].filter(Boolean);
    box.append(
      el('p', {}, el('strong', { text: '⚠︎ ليست جلستَك — الخادمُ لا يرى مفتاحَ الدخول. ' }),
        'ولذلك يرفض كلَّ جلسة، ولا يُصلحه خروجٌ ولا دخول.'),
      el('ul', { class: 'simple-list' }, blind.map((t) => el('li', { text: t }))),
      el('p', { class: 'muted small' },
        el('strong', { text: 'والسببُ المرجّح: ' }),
        'هذه المتغيّراتُ مؤشَّرةٌ «Contains secret values» في Netlify، وبعضُ بيئات التشغيل لا تُسلَّم قيمتَها. ',
        'والعلاج: تُعاد بلا هذا التأشير ثمّ يُعاد النشر.'));
  } else if (probe && probe.sees?.APP_SECRET !== undefined) {
    box.append(
      el('p', {}, el('strong', { text: 'الخادمُ يرى مفتاحَ الدخول، والجلسةُ نفسُها غيرُ صالحة. ' }),
        'اخرج ثمّ ادخل بكلمة السرّ من جديد.'),
      el('a', { class: 'btn btn-primary', href: '/__logout', text: 'اخرج ثمّ ادخل' }));
  } else {
    box.append(el('p', { text: 'تعذّر سؤالُ الخادم عن حاله — تحقّق من الاتّصال ثمّ حدّث الصفحة.' }));
  }

  // **وحالُ تيليجرام يُقال معه** — فلا يُحلّ عطبٌ ويبقى الثاني خفيًّا.
  if (probe?.sees) {
    const tg = ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_SECRET'];
    box.append(el('ul', { class: 'simple-list' }, tg.map((k) => el('li', {},
      el('span', { text: k }),
      el('span', { class: probe.sees[k] ? 'strong' : 'strong warn-text', text: probe.sees[k] ? 'يراه الخادم ✓' : 'لا يراه ✗' })))));
    if (tg.some((k) => !probe.sees[k])) {
      box.append(el('p', { class: 'muted small' },
        'وبلا هذين لا يستقبل البوتُ شيئًا — تُرفض رسائلُه قبل أن تصل الصندوق.'));
    }
  }
  return box;
}

/* ===== بطاقةُ رسالة ===== */

/** لونُ وسمِ الصنف — والملتبسُ وحده أصفرُ، **فاللونُ يقول درجةَ اليقين لا الصنف فقط**. */
const BADGE = {
  request: 'ok', offer: 'accent', prospect: 'accent', task: 'ok', suggestion: 'outline', idea: 'outline', unsure: 'warn',
};

function card(ctx, msg, refresh) {
  const kind = msg.kind || 'unsure';
  const known = msg.phone
    ? ctx.clients.find((c) => normalizePhone(c.phone) === normalizePhone(msg.phone))
    : null;

  const head = el('div', { class: 'row', style: { justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' } },
    el('span', { class: `badge badge-${BADGE[kind] || 'warn'}`, text: KIND_LABELS[kind] || KIND_LABELS.unsure }),
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

  /** بذرةٌ نصّيّةٌ في صفحةٍ قائمة — والحفظُ هناك بيدك لا هنا. */
  const seedTo = (key, value, hash) => {
    try { sessionStorage.setItem(key, value); } catch (_) { /* تصفح خاص */ }
    drop(msg.key);
    location.hash = hash;
  };
  const asProspect = () => seedTo('kassab:quick-prospect', msg.text, '#/prospects');
  const asTask = () => seedTo('kassab:quick-task', msg.text, '#/tasks');
  const asNote = (tag) => seedTo('kassab:quick-note', JSON.stringify({ text: msg.text, tags: [tag] }), '#/notes');

  /**
   * **ستّةُ أبوابٍ كلُّها مفتوحة** (المرحلة ٥٣) — والفرزُ يرفع أحدَها لا يقفل الخمسة.
   * فالبابُ المُقترَح أوّلًا وبلونٍ بارز، **والبقيّةُ في متناول اليد** بضغطةٍ واحدة:
   * من رأى الحكمَ خطأً لا يُضطرّ إلى حذفٍ وإعادةِ تحويل.
   */
  const RUN = {
    request: asRequest, offer: asOffer, prospect: asProspect, task: asTask,
    suggestion: () => asNote('مقترَح'), idea: () => asNote('فكرة'),
  };
  const ordered = [...KINDS].sort((a, b) => (b.key === kind ? 1 : 0) - (a.key === kind ? 1 : 0));
  const actions = el('div', { class: 'row inbox-actions', style: { gap: '6px', flexWrap: 'wrap', marginTop: '10px' } },
    ...ordered.map((k) => el('button', {
      type: 'button', class: `btn btn-sm${k.key === kind ? ' btn-primary' : ''}`,
      text: `اعتمده ${KIND_ACC[k.key]}`, 'data-kind': k.key, onClick: RUN[k.key],
    })),
    el('button', {
      type: 'button', class: 'btn btn-ghost btn-sm', text: 'عدّله',
      onClick: () => askEdit(msg, refresh),
    }),
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
  // **والمعدَّلةُ تُقال** — نصٌّ غُيِّر ويُعرض كأنّه ما وصل يُضلّل من يراجعه بعدك.
  if (msg.editedAt) parts.push(el('p', { class: 'muted small', text: `عُدِّل النصُّ في ${formatDate(msg.editedAt)}` }));
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
    if (data.error) {
      area.append(data.gone ? await diagnoseSession() : emptyState(data.error));
      return;
    }
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
    // سطرٌ واحد (المرحلة ٥٩): كان الشرحُ خمسةَ أسطرٍ يقابل الداخلَ قبل رسائله. والباقي يُطلب.
    el('div', { class: 'notice notice-prose' },
      el('strong', { text: 'ما وصل، لا ما دخل: ' }),
      'لا يدخل شيءٌ قاعدتَك حتى تضغط «اعتمده»، والفرزُ بقواعدَ لا بذكاء — اقتراحٌ تبدّله متى شئت.',
      disclosure('كيف يعمل الوارد؟',
        el('p', {}, 'هذه رسائلُ حوّلتَها، قرأها الخادمُ وفرزها بقواعدَ لا بذكاء. الفرزُ وسمٌ على البطاقة لا نقلٌ إلى مكان، والاعتمادُ يفتح الاستمارةَ معبّأةً وتحفظها أنت.'),
        el('p', {}, 'وستّةُ أبواب: طلبٌ وعرضٌ يدخلان مخزونك، وفرصةٌ عقاريّةٌ تُتابَع في صفحتها، ومهمّةٌ تدخل قوائمك، ومقترَحٌ وفكرةٌ يُقيَّدان في «الأفكار والملاحظات» موسومين.'))),
    area,
  );
  await refresh();
}
