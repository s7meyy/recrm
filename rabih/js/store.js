// أرشيف رابح — IndexedDB في المتصفح. كل شيء محلي، لا خادم ولا رفع.
// شجرة الأرشيف منطقية لا فيزيائية: المنطقة ← المدينة ← التصنيف ← الحي ← التقرير.

const DB_NAME = 'rabih';
const DB_VERSION = 1;
const STORE = 'jobs';

let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const s = db.createObjectStore(STORE, { keyPath: 'id' });
        s.createIndex('byCity', 'ctx.cityId');
        s.createIndex('byCategory', 'ctx.categoryId');
        s.createIndex('byUpdated', 'updatedAt');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

const tx = async (mode, fn) => {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const store = t.objectStore(STORE);
    let result;
    try { result = fn(store); } catch (e) { reject(e); return; }
    t.oncomplete = () => resolve(result?.result !== undefined ? result.result : result);
    t.onerror = () => reject(t.error);
  });
};

export const newId = () =>
  'J' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export async function saveJob(job) {
  job.updatedAt = new Date().toISOString();
  if (!job.createdAt) job.createdAt = job.updatedAt;
  await tx('readwrite', (s) => s.put(job));
  return job;
}

export async function getJob(id) {
  return tx('readonly', (s) => s.get(id));
}

export async function allJobs() {
  const list = await tx('readonly', (s) => s.getAll());
  return (list || []).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

export async function deleteJob(id) {
  return tx('readwrite', (s) => s.delete(id));
}

/** يبني شجرة الأرشيف: منطقة ← مدينة ← تصنيف ← حي ← [تقارير] */
export function buildTree(jobs) {
  const tree = {};
  for (const j of jobs) {
    const c = j.ctx || {};
    const region = c.regionName || 'بلا منطقة';
    const city = c.cityName || 'بلا مدينة';
    const cat = c.categoryName || 'بلا تصنيف';
    const dist = c.districtName || 'بلا حي';
    tree[region] ??= {};
    tree[region][city] ??= {};
    tree[region][city][cat] ??= {};
    tree[region][city][cat][dist] ??= [];
    tree[region][city][cat][dist].push(j);
  }
  return tree;
}

/** مسار الأرشيف نصًّا — يُستعمل في التسمية والعرض. */
export function jobPath(job) {
  const c = job.ctx || {};
  return [c.regionName, c.cityName, c.categoryName, c.districtName]
    .filter(Boolean).join(' / ');
}
