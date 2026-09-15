// طابور الدفعات — عشرة محلات في جلسة واحدة، تنتقل بينها بلا فقد سياق.
// الطابور قائمة معرّفات تقارير مفتوحة، محفوظة محليًّا، مع موضع الوقوف.

const KEY = 'rabih:queue';

const read = () => {
  try { return JSON.parse(localStorage.getItem(KEY) || '{"ids":[],"at":0}'); }
  catch { return { ids: [], at: 0 }; }
};
const write = (q) => { try { localStorage.setItem(KEY, JSON.stringify(q)); } catch { /* تجاهل */ } };

export const list = () => read().ids;
export const position = () => read().at;
export const size = () => read().ids.length;

export function add(id) {
  const q = read();
  if (!q.ids.includes(id)) { q.ids.push(id); write(q); }
  return q.ids.length;
}

export function remove(id) {
  const q = read();
  const i = q.ids.indexOf(id);
  if (i < 0) return;
  q.ids.splice(i, 1);
  if (q.at > i) q.at -= 1;
  if (q.at >= q.ids.length) q.at = Math.max(0, q.ids.length - 1);
  write(q);
}

export function clear() { write({ ids: [], at: 0 }); }

export function goTo(index) {
  const q = read();
  if (!q.ids.length) return null;
  q.at = Math.max(0, Math.min(index, q.ids.length - 1));
  write(q);
  return q.ids[q.at];
}

export const next = () => goTo(position() + 1);
export const prev = () => goTo(position() - 1);
export const current = () => read().ids[read().at] ?? null;

export function setCurrentById(id) {
  const q = read();
  const i = q.ids.indexOf(id);
  if (i >= 0) { q.at = i; write(q); }
}

/** يزيل من الطابور ما لم يعد له تقرير في الأرشيف. */
export function prune(existingIds) {
  const q = read();
  const set = new Set(existingIds);
  const ids = q.ids.filter((id) => set.has(id));
  if (ids.length !== q.ids.length) write({ ids, at: Math.min(q.at, Math.max(0, ids.length - 1)) });
  return ids;
}
