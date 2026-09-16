// دفتر العملاء — الأداة تُدير عملًا لا تُنتج تقارير فقط.
//
// كل ما فيه مبنيٌّ من الأرشيف نفسه: لا جدول خارجي ولا إدخال مزدوج. والمعلومة
// الوحيدة التي تُضاف يدويًّا هي ما لا يعرفه الأرشيف — اسم العميل ورقمه
// والمبلغ ودورية التجديد.
//
// وقيمته أن يجيب عن سؤالين: **مَن لم يُتابَع؟** و**ما الذي يُجدَّد قريبًا؟**

const KEY = 'rabih:clients';

const read = () => {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}'); }
  catch { return {}; }
};

const write = (data) => {
  try { localStorage.setItem(KEY, JSON.stringify(data)); return true; }
  catch { return false; }
};

/** بيانات العميل تُربَط بالمنشأة لا بالتقرير: التقارير تتعدّد والعميل واحد. */
export const placeKey = (job) => {
  const name = (job?.place?.identity?.name || '').trim();
  const city = (job?.ctx?.cityId || '').trim();
  return name ? `${city}::${name}` : '';
};

export function getClient(job) {
  const k = placeKey(job);
  return k ? (read()[k] || null) : null;
}

export function setClient(job, patch) {
  const k = placeKey(job);
  if (!k) return null;
  const all = read();
  const next = { ...(all[k] || {}), ...patch, key: k, updatedAt: new Date().toISOString() };
  all[k] = next;
  return write(all) ? next : null;
}

const DAY = 86400000;
const days = (iso) => {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? Math.round((Date.now() - t) / DAY) : null;
};

/**
 * يبني الدفتر: صفٌّ لكل منشأة في أرشيفك، مع حالتها.
 *
 * @returns {{rows:Array, totals:{places,delivered,revenue,dueSoon,stale}}}
 */
export function ledger(jobs = []) {
  const data = read();
  const byPlace = new Map();

  for (const j of jobs) {
    const k = placeKey(j);
    if (!k) continue;
    if (!byPlace.has(k)) byPlace.set(k, []);
    byPlace.get(k).push(j);
  }

  const rows = [...byPlace.entries()].map(([k, list]) => {
    list.sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
    const last = list[list.length - 1];
    const info = data[k] || {};
    const delivered = list.filter((j) => (j.snapshots?.length || 0) > 0 || j.delivered).length;
    const lastDate = last?.createdAt || null;
    const age = days(lastDate);

    // التجديد: من آخر تقرير + دورية العميل (بالأشهر).
    const every = Number(info.everyMonths) || 0;
    const dueInDays = every && age !== null ? Math.round(every * 30 - age) : null;

    return {
      key: k,
      name: last?.place?.identity?.name || 'بلا اسم',
      city: last?.ctx?.cityName || '',
      district: last?.ctx?.districtName || '',
      category: last?.ctx?.categoryName || '',
      reports: list.length,
      delivered,
      lastDate,
      ageDays: age,
      contact: info.contact || '',
      phone: info.phone || '',
      fee: Number(info.fee) || 0,
      everyMonths: every,
      dueInDays,
      note: info.note || '',
      jobIds: list.map((j) => j.id),
      // «متروك» من لم يُتابَع منذ تسعين يومًا ولا تجديد مجدول له.
      stale: age !== null && age > 90 && !every,
    };
  }).sort((a, b) => {
    const da = a.dueInDays ?? 9999;
    const db = b.dueInDays ?? 9999;
    return da - db;
  });

  return {
    rows,
    totals: {
      places: rows.length,
      delivered: rows.reduce((a, r) => a + r.delivered, 0),
      revenue: rows.reduce((a, r) => a + r.fee * Math.max(r.delivered, 0), 0),
      dueSoon: rows.filter((r) => r.dueInDays !== null && r.dueInDays <= 14).length,
      stale: rows.filter((r) => r.stale).length,
    },
  };
}

export function exportClients() { return JSON.stringify(read(), null, 2); }

export function importClients(json) {
  try {
    const data = JSON.parse(json);
    if (!data || typeof data !== 'object') return false;
    return write({ ...read(), ...data });
  } catch { return false; }
}
