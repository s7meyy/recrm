// مساعدات بناء الواجهة: إنشاء العناصر، النوافذ المنبثقة، التأكيد، التنبيهات.
// لا يُستعمل innerHTML مع بيانات المستخدم أبدًا؛ النصوص تُدرج نصوصًا.

import { formatDate, formatDateTime } from './format.js';

const PROPS = new Set(['value', 'checked', 'disabled', 'selected', 'multiple', 'hidden', 'readOnly', 'required']);

export function el(tag, attrs = null, ...children) {
  const node = document.createElement(tag);
  if (attrs) {
    for (const [key, val] of Object.entries(attrs)) {
      if (val == null || val === false) continue;
      if (key === 'class') node.className = val;
      else if (key === 'text') node.textContent = val;
      else if (key === 'style' && typeof val === 'object') Object.assign(node.style, val);
      else if (key === 'dataset') Object.assign(node.dataset, val);
      else if (key.startsWith('on') && typeof val === 'function') node.addEventListener(key.slice(2).toLowerCase(), val);
      else if (PROPS.has(key)) node[key] = val;
      else node.setAttribute(key, val === true ? '' : String(val));
    }
  }
  appendChildren(node, children);
  nameIfIconOnly(node);
  return node;
}

/**
 * **اسمٌ لكلّ زرٍّ رمزيّ** (المرحلة ٤٩).
 *
 * في الصفحات ستةَ عشرَ زرًّا محتواه رمزٌ واحد — 📞 و🗑 و✏️ و📍 — وقارئُ الشاشة يقرؤها
 * كلَّها: **«زر»**. لا أكثر. وعددُ سمات `aria-*` في المشروع كلِّه كان سبعًا وعشرين،
 * موزّعةً على خمسة ملفّاتٍ من خمسةٍ وعشرين.
 *
 * **والإصلاحُ هنا لا في ستّةَ عشرَ موضعًا**: كلُّ زرٍّ نصُّه رموزٌ وحدها وله `title`
 * يأخذ عنوانَه اسمًا. فما كُتب من قبل يُصلَح، وما يُكتب بعدُ يُصلَح وحدَه.
 *
 * **وما له `aria-label` مكتوبٌ لا يُمسّ**، وما لا `title` له لا يُخترع له اسم:
 * اسمٌ مخترَعٌ أسوأُ من لا اسم — يقول لقارئ الشاشة غيرَ ما يفعل الزرّ.
 */
const SYMBOLS_ONLY = /^[^\p{L}\p{N}]+$/u;

function nameIfIconOnly(node) {
  if (node.tagName !== 'BUTTON' && node.tagName !== 'A') return;
  if (node.hasAttribute('aria-label') || node.getAttribute('aria-hidden') === 'true') return;
  const title = node.getAttribute('title');
  if (!title) return;
  const text = (node.textContent || '').trim();
  // نصٌّ فيه حرفٌ أو رقمٌ يُقرأ وحدَه — ولا يُزاحَم باسمٍ ثانٍ.
  if (text && !SYMBOLS_ONLY.test(text)) return;
  node.setAttribute('aria-label', title);
}

export function appendChildren(node, children) {
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false || child === '') continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

export function badge(text, cls = '', { title = null } = {}) {
  return el('span', { class: `badge ${cls}`.trim(), text, ...(title ? { title } : {}) });
}

/** حقل بعنوان (label يلف عنصر إدخال واحد). */
export function labeled(labelText, control, { hint = null, required = false, full = false } = {}) {
  return el('label', { class: `field${full ? ' field-full' : ''}` },
    el('span', { class: 'field-label' }, labelText, required ? el('span', { class: 'req', text: ' *' }) : null),
    control,
    hint ? el('span', { class: 'field-hint', text: hint }) : null);
}

/** مجموعة حقول بعنوان (div، لعناصر متعددة مثل مربعات الاختيار). */
export function fieldGroup(labelText, content, { full = false } = {}) {
  return el('div', { class: `field${full ? ' field-full' : ''}` },
    el('span', { class: 'field-label', text: labelText }),
    content);
}

export function selectEl({ options = [], value = '', placeholder = null, onChange = null, ...attrs } = {}) {
  const select = el('select', { class: 'input', ...attrs });
  if (placeholder != null) select.append(el('option', { value: '', text: placeholder }));
  for (const opt of options) select.append(el('option', { value: opt.value, text: opt.label }));
  select.value = value ?? '';
  if (onChange) select.addEventListener('change', onChange);
  return select;
}

export function checkbox(labelText, { name, value, checked = false, onChange = null } = {}) {
  const input = el('input', { type: 'checkbox', name, value, checked });
  if (onChange) input.addEventListener('change', onChange);
  return el('label', { class: 'check' }, input, el('span', { text: labelText }));
}

/**
 * حالُ الفراغ. **ورسالةٌ وحدها لا تكفي** (المرحلة ٤٧): من يقرأ «لا نتائج» يبقى واقفًا،
 * ومن يجد تحتها زرًّا يمضي. فتقبل أكثرَ من فعلٍ، وتُبقي الرسالةَ سطرًا واحدًا واضحًا.
 */
export function emptyState(message, ...actions) {
  return el('div', { class: 'empty' },
    el('p', { class: 'pre-line', text: message }),
    actions.length ? el('div', { class: 'row empty-actions' }, actions) : null);
}

export function debounce(fn, ms = 150) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

/* ===== صدى التاريخ: ما اخترتَه مكتوبًا بالعربية ===== */

/**
 * حقلُ `input[type=date]` يرسمه المتصفّح بلغته هو لا بلغة الصفحة، فيظهر `mm/dd/yyyy`
 * في واجهةٍ عربيّةٍ كلِّها — ولا يملك الموقع تبديلَ ذلك. واستبدالُ المنتقي الأصليّ بآخرَ
 * مكتوبٍ بأيدينا يخسر لوحةَ التاريخ في الجوّال، وهي أنفعُ ما فيه. فبدل المنع: **صدًى تحت
 * الحقل** يكتب ما اخترتَه بالعربية وبالتقويمين.
 *
 * **ومكانُها هنا لا في `app.js` (المرحلة ٤٣):** كانت تُستدعى على `#page` بعد كل رسم،
 * والنوافذ تُرسَم في `#modal-root` **خارجه**. وقِيس: صفرُ حقلِ تاريخٍ في الصفحات، وثمانيةٌ
 * في النوافذ — فالميزةُ كانت في الكود ولا تصل شيئًا. وهي هنا تُستدعى من `openModal` نفسها.
 */
export function echoDates(root) {
  if (!root) return;
  for (const input of root.querySelectorAll('input[type="date"], input[type="datetime-local"]')) {
    if (input.dataset.echo) continue;
    input.dataset.echo = '1';
    input.lang = 'ar-SA'; // يُحترم في بعض المتصفّحات، ولا يضرّ حيث لا يُحترم
    const withTime = input.type === 'datetime-local';
    const out = el('div', { class: 'muted small date-echo' });
    const draw = () => {
      // `formatDateTime` تحتاج زمنًا كاملًا، و`datetime-local` تعطي «…T10:00» بلا منطقة.
      // **والفارغُ يُقال سببُه** (المرحلة ٥٢): من رأى `mm/dd/yyyy` في واجهةٍ عربيّةٍ ظنّه
      // عطبًا في البرنامج، وهو ترتيبُ جهازه هو ولا يملك الموقعُ تبديلَه. فيُقال صراحةً
      // مرّةً واحدةً تحت الحقل، ويزول القولُ فور أن يُكتب التاريخُ بالعربيّة مكانه.
      out.textContent = input.value
        ? (withTime ? formatDateTime(new Date(input.value).toISOString()) : formatDate(input.value))
        : 'ترتيبُ الصندوق بحسب لغة جهازك — وما تختاره يُكتب هنا بالعربيّة والهجريّ.';
      out.classList.toggle('empty-note', !input.value);
    };
    draw();
    input.addEventListener('change', draw);
    input.addEventListener('input', draw);
    input.after(out);
  }
}

/* ===== النوافذ المنبثقة ===== */

/**
 * **النوافذُ المفتوحةُ الآن** (المرحلة ٥٠) — سجلٌّ صغير يُغلقها الموجِّهُ به عند تبديل الصفحة.
 *
 * `navigate()` كان يُفرِغ `#page` **ولا يمسّ `#modal-root`** — والنوافذُ تُرسَم فيه خارجَ
 * الصفحة. فمن فتح نافذةً ثم انتقل إلى صفحةٍ أخرى بقيت النافذةُ طافيةً فوق الجديدة،
 * تحجبها وتلتقط ضغطاته. كشفتها `whatsapp.mjs` حين صار زرُّ «أضفه عميلًا» ينتقل إلى
 * مسارٍ صحيح (`#/clients/<id>`) فيفتح استمارةَ العميل — وكان ينتقل إلى `#/client/<id>`
 * **وهو مسارٌ لا وجود له**، فلا يفتح شيئًا ولا يُرى العطب.
 */
const openModals = new Set();

/**
 * يُغلق كلَّ نافذةٍ مفتوحة — **بإغلاقها لا بمحو عقدها**: `replaceChildren` تمحو العناصر
 * ولا تُطلق `onClose`، فيبقى وعدُ `confirmDialog` معلّقًا إلى الأبد ينتظر جوابًا لن يأتي.
 */
export function closeAllModals() {
  for (const close of [...openModals]) {
    try { close(); } catch (_) { /* نافذةٌ أُغلقت بالفعل */ }
  }
  openModals.clear();
}

export function openModal({ title, body, footer = null, size = null, onClose = null }) {
  const root = document.getElementById('modal-root');
  const overlay = el('div', { class: 'modal-overlay' });
  // **عنوانٌ يُنطَق** (المرحلة ٤٩): النافذةُ كانت `role="dialog"` بلا اسم، فيقرؤها
  // قارئُ الشاشة «حوار» ولا يقول أيُّ حوار. و`aria-labelledby` يربطها بعنوانها المكتوب.
  const titleId = `modal-title-${Math.random().toString(36).slice(2, 9)}`;
  const box = el('div', {
    class: `modal${size === 'wide' ? ' modal-wide' : ''}`,
    role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId,
  });
  let closed = false;
  // **إلى أين يعود التركيز؟** من فتح النافذة بزرٍّ يعود إليه عند إغلاقها — وإلّا قفز
  // التركيزُ إلى أوّل الصفحة، فيبدأ من يتنقّل بلوحة المفاتيح من الصفر في كل مرّة.
  const opener = document.activeElement;

  function close() {
    if (closed) return;
    closed = true;
    openModals.delete(close);
    overlay.remove();
    document.removeEventListener('keydown', onKey);
    if (!root.children.length) document.body.classList.remove('modal-open');
    try { if (opener && opener.isConnected && typeof opener.focus === 'function') opener.focus(); } catch (_) { /* عنصرٌ زال مع إعادة الرسم */ }
    if (onClose) onClose();
  }

  /** ما يمكن الوصول إليه بالمفاتيح داخل النافذة — بترتيب ظهوره. */
  const focusables = () => [...box.querySelectorAll(
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )].filter((n) => !n.hidden && n.offsetParent !== null);

  function onKey(e) {
    if (root.lastElementChild !== overlay) return;
    if (e.key === 'Escape') { close(); return; }
    // **حبسُ التركيز**: `Tab` كان يخرج من النافذة إلى الصفحة تحتها — وهي محجوبةٌ
    // بصريًّا فيتنقّل المستخدمُ في شيءٍ لا يراه ولا يعلم أين هو.
    if (e.key !== 'Tab') return;
    const items = focusables();
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  const bodyEl = el('div', { class: 'modal-body' }, body);
  // `appendChildren` لا `box.append`: الأصليّة تحوّل `null` إلى **نصّ** «null» فيُطبع في
  // الشاشة. ونافذةٌ بلا تذييل (البحث، مشاركة العقار، عملاء مكرّرون) كانت تعرضه فعلًا.
  appendChildren(box, [
    el('div', { class: 'modal-head' },
      el('h2', { class: 'modal-title', id: titleId, text: title }),
      el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'إغلاق', text: '✕', onClick: close })),
    bodyEl,
    footer ? el('div', { class: 'modal-foot' }, footer) : null,
  ]);
  echoDates(box); // حقولُ التاريخ كلُّها تقريبًا داخل النوافذ لا الصفحات
  overlay.append(box);
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', onKey);
  root.append(overlay);
  openModals.add(close);
  document.body.classList.add('modal-open');
  // **أوّلُ ما يُملأ لا أوّلُ ما يُضغط**: التركيزُ يبدأ بأوّل حقلِ إدخال إن وُجد،
  // فمن فتح استمارةً كتب فيها مباشرةً. وبلا حقلٍ يبدأ بالنافذة نفسِها لا بزرّ الإغلاق.
  const firstField = box.querySelector('.modal-body input:not([type="hidden"]), .modal-body select, .modal-body textarea');
  try {
    if (firstField) firstField.focus();
    else { box.setAttribute('tabindex', '-1'); box.focus(); }
  } catch (_) { /* لا تركيز في بيئةٍ بلا عرض */ }
  return { close, element: box, body: bodyEl };
}

export function confirmDialog({ title = 'تأكيد', message, confirmText = 'تأكيد', cancelText = 'إلغاء', danger = false }) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (v) => { if (!settled) { settled = true; resolve(v); } };
    const modal = openModal({
      title,
      body: el('p', { text: message }),
      onClose: () => finish(false),
      footer: [
        el('button', { type: 'button', class: 'btn btn-ghost', text: cancelText, onClick: () => modal.close() }),
        el('button', { type: 'button', class: `btn ${danger ? 'btn-danger' : 'btn-primary'}`, text: confirmText, onClick: () => { finish(true); modal.close(); } }),
      ],
    });
  });
}

/**
 * سؤالٌ بأكثرَ من جوابين (المرحلة ٤٧).
 *
 * `confirmDialog` تكفي حين يكون الجوابُ نعم أو لا. وحين تكون الأجوبةُ ثلاثةً — «انشر
 * المرخَّصة وحدها» و«انشر الكلّ وأنا أعلم» و«ألغِ» — فحشرُها في نعم/لا يُخفي أحدَها أو
 * يجعله سؤالين متتاليين، وكلاهما يُربك القرار.
 *
 * والرسالةُ تُعرض بأسطرها كما كُتبت (`white-space: pre-line`)، فالقائمةُ فيها تُقرأ قائمة.
 *
 * @param {[{ key, label, ghost?, danger?, disabled? }]} choices — أوّلُها هو المميَّز
 * @returns {Promise<string|null>} مفتاحُ ما اختير، أو `null` للإلغاء والإغلاق
 */
export function choiceDialog({ title = 'اختر', message = '', choices = [], cancelText = 'إلغاء' }) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (v) => { if (!settled) { settled = true; resolve(v); } };
    const modal = openModal({
      title,
      body: el('p', { class: 'pre-line', text: message }),
      onClose: () => finish(null),
      footer: [
        el('button', { type: 'button', class: 'btn btn-ghost', text: cancelText, onClick: () => modal.close() }),
        el('span', { class: 'spacer' }),
        ...choices.map((c, i) => el('button', {
          type: 'button',
          class: `btn ${c.danger ? 'btn-danger' : (c.ghost || i > 0 ? 'btn-ghost' : 'btn-primary')}`,
          text: c.label,
          disabled: !!c.disabled,
          onClick: () => { finish(c.key); modal.close(); },
        })),
      ],
    });
  });
}

export function promptDialog({ title, label, placeholder = '', value = '', confirmText = 'إضافة' }) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (v) => { if (!settled) { settled = true; resolve(v); } };
    const input = el('input', { class: 'input', type: 'text', placeholder, value });
    const submit = () => {
      const v = input.value.trim();
      if (!v) return;
      finish(v);
      modal.close();
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
    const modal = openModal({
      title,
      body: labeled(label, input),
      onClose: () => finish(null),
      footer: [
        el('button', { type: 'button', class: 'btn btn-ghost', text: 'إلغاء', onClick: () => modal.close() }),
        el('button', { type: 'button', class: 'btn btn-primary', text: confirmText, onClick: submit }),
      ],
    });
    setTimeout(() => input.focus(), 0);
  });
}

/* ===== التنبيهات ===== */

export function toast(message, kind = 'info', ms = 3500) {
  const root = document.getElementById('toast-root');
  if (!root) return;
  /**
   * **التنبيهُ يُعلَن لا يُرى فقط** (المرحلة ٤٩).
   *
   * «حُفظت الصفقة» و«تعذّر الحفظ» كانا يظهران في زاوية الشاشة بلا أن يُقالا — فمن
   * لا يرى الزاوية لا يعلم أحفِظ أم لم يُحفظ. و`status` تُقرأ عند فراغ القارئ،
   * و`alert` تقاطعه — والخطأُ وحدَه يستحقّ المقاطعة.
   */
  const node = el('div', {
    class: `toast ${kind}`, text: message,
    role: kind === 'error' ? 'alert' : 'status',
    'aria-live': kind === 'error' ? 'assertive' : 'polite',
  });
  root.append(node);
  setTimeout(() => node.remove(), ms);
}


/**
 * **الجلسةُ المنتهية: صيغةٌ واحدةٌ وزرٌّ يفعلها** (المرحلة ٥٢).
 *
 * كانت تُقال بثلاث صيغ في صفحةٍ واحدة — «انتهت جلستك — حدّث الصفحة وسجّل الدخول»
 * مرّتين، و«يلزم تسجيل الدخول» مرّة — **فيظنّها القارئ ثلاثَ مشكلات**. وكلُّها
 * علاجُها واحد: تحديثُ الصفحة. فصار نصًّا واحدًا يحمل زرَّه.
 */
export const SESSION_GONE = 'انتهت جلستك. حدّث الصفحة وسجّل الدخول، ثم أعد المحاولة.';

/** أهذا خطأُ جلسةٍ منتهية؟ — يُعرف من نصّه أيًّا كانت صيغتُه القديمة. */
export function isSessionGone(err) {
  const t = String(err?.message || err || '');
  return t.includes('انتهت جلستك') || t.includes('يلزم تسجيل الدخول') || t.includes('401');
}

/** سطرُ الجلسة المنتهية بزرّ التحديث — يُستعمل حيث كان النصُّ وحده. */
export function sessionGoneNote() {
  return el('p', { class: 'muted small' },
    `${SESSION_GONE} `,
    el('button', {
      type: 'button', class: 'btn btn-ghost btn-sm', text: 'حدّث الآن',
      onClick: () => location.reload(),
    }));
}

/**
 * **شرحٌ يُطلب لا يُفرض** (المرحلة ٥٢). صفحةٌ تشرح نفسَها قبل أن تعمل تُقرأ مرّةً
 * وتُتخطّى ألفًا، والسطرُ الذي تحتاجه اليوم يضيع بين ثلاثة آلاف حرفٍ قرأتها بالأمس.
 * فيبقى ظاهرًا ما يلزم العمل، ويُطوى الشرحُ خلف سطرٍ واحدٍ يُفتح بنقرة.
 */
export function disclosure(summaryText, ...nodes) {
  return el('details', { class: 'panel-block disclosure' },
    el('summary', { text: summaryText }),
    ...nodes.filter(Boolean));
}

/** شاشةُ الجوّال — الحدُّ نفسُه المستعمل في `css` وفي طيّ الفلاتر. */
export const isNarrow = () => window.matchMedia('(max-width: 640px)').matches;

/**
 * **يطوي كتلةً خلف زرٍّ على الجوّال وحده** (المرحلة ٥٢).
 *
 * صفحةُ المطابقات على الجوّال كانت تسرد مطابقات كلّ عميلٍ مفتوحةً تحت اسمه، فعميلٌ
 * له خمسُ مطابقاتٍ يأكل ثلاثَ شاشات — ومن له عشرةُ عملاء لا يبلغ آخرَهم أبدًا.
 * فيُطوى السردُ خلف سطرٍ يقول **اسمَ ما طُوي وعدده**، ويُفتح بنقرة.
 *
 * وعلى الشاشة الواسعة تُعاد الكتلةُ كما هي بلا زرٍّ ولا غلاف — فلا يتغيّر شيء.
 *
 * @param {HTMLElement} box الكتلة المطويّة
 * @param {string} label نصُّ الزرّ (يُسبق بسهم الحالة)
 * @param {{ open?: boolean }} options `open` يفتحها ابتداءً ولو على الجوّال
 */
export function foldOnNarrow(box, label, { open = false } = {}) {
  if (!isNarrow()) return box;
  box.classList.add('fold-body');
  if (open) box.classList.add('fold-open');
  const btn = el('button', {
    type: 'button', class: 'btn btn-sm fold-toggle', 'aria-expanded': open ? 'true' : 'false',
    onClick: () => {
      const on = box.classList.toggle('fold-open');
      btn.setAttribute('aria-expanded', on ? 'true' : 'false');
      paint(on);
    },
  });
  const paint = (on) => { btn.textContent = `${on ? '▲' : '▼'} ${label}`; };
  paint(open);
  const wrap = el('div', { class: 'fold' }, btn, box);
  return wrap;
}

/**
 * رقاقة «الكل» في رأس صفّ فلاتر (المرحلة ٣٨).
 *
 * ضغطةٌ تحدّد كل خيارات المجموعة، وأخرى تمحو التحديد كلّه. وفائدتها ليست تغيير النتيجة
 * — المجموعة الفارغة تعني «الكل» في كل الفلاتر هنا أصلًا — وإنما **طريق العمل**:
 * أن تحدّد الكل ثم تنزع اثنين أسرع من أن تحدّد ستةً واحدًا واحدًا. ولذلك تُظهر حالتها:
 * مُضيئةً حين يكون الكلّ محدَّدًا، ورماديةً حين لا شيء.
 *
 * @param {Set} set مجموعة القيم المحدَّدة (تُعدَّل في مكانها)
 * @param {string[]} values كل القيم الممكنة في هذه المجموعة
 * @param {() => void} onChange يُستدعى بعد التبديل
 */
export function allChip(set, values, onChange) {
  const total = values.length;
  const allOn = total > 0 && values.every((v) => set.has(v));
  /* **وبلا رقم** (المرحلة ٥٢): كلُّ رقاقةٍ في الصفّ تحمل عددَ سجلّاتها («فلة ٥» =
     خمسُ فلل)، إلا هذه فكانت تحمل عددَ **الخيارات**. والعينُ لا تفرّق، فتقرأ
     «الكل ١٠» في صفحةٍ عنوانُها «(١٥)» فتحتار. ووظيفتُها ضغطةٌ تحدّد وتمحو، لا عدّ. */
  return el('button', {
    type: 'button',
    class: `chip chip-all${allOn ? ' active' : ''}`,
    title: allOn ? 'امحُ التحديد' : 'حدّد الكل',
    onClick: () => {
      if (allOn) set.clear();
      else for (const v of values) set.add(v);
      onChange();
    },
  }, allOn ? 'امحُ الكل' : 'الكل');
}
