// تاريخ تحرير التقرير — تعدّل النص ثم تندم، ولا سبيل للرجوع.
// السجلّ في الذاكرة لكل تقرير، وآخر حالاته تُحفَظ مع التقرير فتنجو من إغلاق الصفحة.

const MAX = 40;
const stacks = new Map();   // jobId → { past: [], future: [], last: string }

const get = (jobId) => {
  if (!stacks.has(jobId)) stacks.set(jobId, { past: [], future: [], last: null });
  return stacks.get(jobId);
};

/** يلتقط حالةً جديدة إن اختلفت عن آخر لقطة. */
export function push(jobId, text, label = '') {
  const s = get(jobId);
  const v = String(text ?? '');
  if (s.last === v) return false;
  if (s.last !== null) {
    s.past.push({ text: s.last, at: Date.now(), label });
    if (s.past.length > MAX) s.past.shift();
  }
  s.last = v;
  s.future.length = 0;
  return true;
}

/** @returns {string|null} النص السابق، أو null إن لم يكن ثمّة تراجع. */
export function undo(jobId) {
  const s = get(jobId);
  if (!s.past.length) return null;
  const prev = s.past.pop();
  s.future.push({ text: s.last, at: Date.now() });
  s.last = prev.text;
  return prev.text;
}

export function redo(jobId) {
  const s = get(jobId);
  if (!s.future.length) return null;
  const next = s.future.pop();
  s.past.push({ text: s.last, at: Date.now() });
  s.last = next.text;
  return next.text;
}

export const canUndo = (jobId) => get(jobId).past.length > 0;
export const canRedo = (jobId) => get(jobId).future.length > 0;
export const depth = (jobId) => ({ past: get(jobId).past.length, future: get(jobId).future.length });

export function reset(jobId, text) {
  stacks.set(jobId, { past: [], future: [], last: String(text ?? '') });
}

/** لقطات السجل للعرض: طولها ووقتها. */
export const entries = (jobId) => get(jobId).past
  .map((e, i) => ({ i, at: e.at, chars: e.text.length, label: e.label }))
  .reverse();

/** يرجع إلى لقطة بعينها من السجل. */
export function restore(jobId, index) {
  const s = get(jobId);
  if (index < 0 || index >= s.past.length) return null;
  const target = s.past[index];
  // ما بعدها يصير مستقبلًا، فالتراجع والإعادة يبقيان متّسقين.
  const after = s.past.splice(index);
  after.shift();
  s.future.push(...after.reverse().map((e) => ({ text: e.text, at: e.at })), { text: s.last, at: Date.now() });
  s.last = target.text;
  return target.text;
}
