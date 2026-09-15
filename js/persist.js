// حماية الأرشيف — كل تقاريرك في IndexedDB داخل المتصفح، والمتصفح يحقّ له مسحها
// عند ضيق المساحة، و«مسح بيانات التصفح» يمحوها. هذه الوحدة تقلّل الخطر وتُذكّر به.

const LAST_BACKUP = 'rabih:last-backup';
const DIR_FLAG = 'rabih:backup-dir';
const REMIND_DAYS = 7;

const read = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k, v) => { try { localStorage.setItem(k, v); } catch { /* تجاهل */ } };

/** هل منح المتصفح التخزينَ صفة الدائم؟ */
export async function isPersisted() {
  try { return await navigator.storage?.persisted?.() ?? false; }
  catch { return false; }
}

/**
 * يطلب جعل التخزين دائمًا. المتصفحات تمنحه بحسب تفاعل المستخدم مع الموقع،
 * وقد ترفض؛ والرفض ليس خطأً في المنصّة.
 */
export async function requestPersist() {
  try {
    if (await isPersisted()) return true;
    return await navigator.storage?.persist?.() ?? false;
  } catch { return false; }
}

/** المساحة المستعملة والمتاحة، بالميغابايت. */
export async function quota() {
  try {
    const e = await navigator.storage?.estimate?.();
    if (!e) return null;
    const mb = (n) => Number(((n || 0) / 1048576).toFixed(1));
    return { used: mb(e.usage), available: mb(e.quota), pct: e.quota ? Math.round((e.usage / e.quota) * 100) : 0 };
  } catch { return null; }
}

export const lastBackup = () => read(LAST_BACKUP);

export function markBackup() {
  write(LAST_BACKUP, new Date().toISOString());
}

/** أيام مضت منذ آخر نسخة احتياطية، أو null إن لم تُؤخذ قطّ. */
export function daysSinceBackup() {
  const t = Date.parse(lastBackup() || '');
  if (!Number.isFinite(t)) return null;
  return Math.floor((Date.now() - t) / 86400000);
}

export function backupDue(jobCount) {
  if (!jobCount) return false;
  const d = daysSinceBackup();
  return d === null || d >= REMIND_DAYS;
}

/* ───── النسخ إلى مجلد يختاره المستخدم (File System Access) ───── */

export const canWriteToFolder = () => typeof window !== 'undefined' && 'showDirectoryPicker' in window;

let dirHandle = null;

/** يطلب من المستخدم اختيار مجلد للنسخ الاحتياطي. */
export async function chooseBackupFolder() {
  if (!canWriteToFolder()) return { ok: false, reason: 'متصفحك لا يدعم الكتابة في مجلد. استعمل «تصدير الكل».' };
  try {
    dirHandle = await window.showDirectoryPicker({ mode: 'readwrite', id: 'rabih-backup' });
    write(DIR_FLAG, dirHandle.name || '1');
    return { ok: true, name: dirHandle.name || 'المجلد المختار' };
  } catch (e) {
    return { ok: false, reason: e?.name === 'AbortError' ? 'أُلغي الاختيار.' : 'تعذّر فتح المجلد.' };
  }
}

export const backupFolderName = () => (dirHandle?.name || read(DIR_FLAG) || '');

/**
 * يكتب نسخة في المجلد المختار. يحتاج إذنًا حيًّا؛ فإن انتهى طُلب من جديد.
 * @returns {{ok:boolean, file?:string, reason?:string}}
 */
export async function writeBackup(jobs) {
  if (!dirHandle) return { ok: false, reason: 'لم يُختَر مجلد بعد.' };
  try {
    const perm = await dirHandle.queryPermission?.({ mode: 'readwrite' });
    if (perm !== 'granted') {
      const asked = await dirHandle.requestPermission?.({ mode: 'readwrite' });
      if (asked !== 'granted') return { ok: false, reason: 'لم يُمنح الإذن بالكتابة.' };
    }
    const name = `rabih-backup-${new Date().toISOString().slice(0, 10)}.json`;
    const fh = await dirHandle.getFileHandle(name, { create: true });
    const w = await fh.createWritable();
    await w.write(JSON.stringify(jobs, null, 2));
    await w.close();
    markBackup();
    return { ok: true, file: name };
  } catch {
    return { ok: false, reason: 'تعذّرت الكتابة في المجلد.' };
  }
}

/** حالة الحماية مجموعةً، لعرضها في الواجهة. */
export async function status(jobCount = 0) {
  const persisted = await isPersisted();
  const q = await quota();
  const days = daysSinceBackup();
  return {
    persisted,
    quota: q,
    days,
    due: backupDue(jobCount),
    level: !persisted || backupDue(jobCount) ? (jobCount ? 'warn' : 'ok') : 'ok',
  };
}
