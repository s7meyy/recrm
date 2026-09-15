// مساعدات بناء الواجهة: إنشاء العناصر، النوافذ المنبثقة، التأكيد، التنبيهات.
// لا يُستعمل innerHTML مع بيانات المستخدم أبدًا؛ النصوص تُدرج نصوصًا.

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
  return node;
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

export function emptyState(message, action = null) {
  return el('div', { class: 'empty' }, el('p', { text: message }), action);
}

export function debounce(fn, ms = 150) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

/* ===== النوافذ المنبثقة ===== */

export function openModal({ title, body, footer = null, size = null, onClose = null }) {
  const root = document.getElementById('modal-root');
  const overlay = el('div', { class: 'modal-overlay' });
  const box = el('div', { class: `modal${size === 'wide' ? ' modal-wide' : ''}`, role: 'dialog', 'aria-modal': 'true' });
  let closed = false;

  function close() {
    if (closed) return;
    closed = true;
    overlay.remove();
    document.removeEventListener('keydown', onKey);
    if (!root.children.length) document.body.classList.remove('modal-open');
    if (onClose) onClose();
  }
  function onKey(e) {
    if (e.key === 'Escape' && root.lastElementChild === overlay) close();
  }

  const bodyEl = el('div', { class: 'modal-body' }, body);
  // `appendChildren` لا `box.append`: الأصليّة تحوّل `null` إلى **نصّ** «null» فيُطبع في
  // الشاشة. ونافذةٌ بلا تذييل (البحث، مشاركة العقار، عملاء مكرّرون) كانت تعرضه فعلًا.
  appendChildren(box, [
    el('div', { class: 'modal-head' },
      el('h2', { class: 'modal-title', text: title }),
      el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'إغلاق', text: '✕', onClick: close })),
    bodyEl,
    footer ? el('div', { class: 'modal-foot' }, footer) : null,
  ]);
  overlay.append(box);
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', onKey);
  root.append(overlay);
  document.body.classList.add('modal-open');
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
  const node = el('div', { class: `toast ${kind}`, text: message });
  root.append(node);
  setTimeout(() => node.remove(), ms);
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
  return el('button', {
    type: 'button',
    class: `chip chip-all${allOn ? ' active' : ''}`,
    title: allOn ? 'امحُ التحديد' : 'حدّد الكل',
    onClick: () => {
      if (allOn) set.clear();
      else for (const v of values) set.add(v);
      onChange();
    },
  }, allOn ? 'امحُ الكل' : 'الكل', el('span', { class: 'chip-count', text: String(total) }));
}
