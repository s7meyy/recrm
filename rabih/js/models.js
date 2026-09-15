// لوحة أداء النماذج — مدقّق السند يعطي درجة لكل مخرج، فنحفظها مع اسم النموذج.
// بعد عشرين تقريرًا تعرف أي نموذج مجاني يستحق الثقة، بالبيانات لا بترشيح أحد.

const KEY = 'rabih:model-scores';

const read = () => {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); }
  catch { return []; }
};
const write = (rows) => { try { localStorage.setItem(KEY, JSON.stringify(rows.slice(-500))); } catch { /* تجاهل */ } };

/**
 * يسجّل نتيجة خطوة.
 * @param {{model:string, role:string, step:string, score:number, level:string,
 *          badIds:number, unsupported:number, numberIssues:number, coverage:number}} entry
 */
export function record(entry) {
  if (!entry?.model) return;
  const rows = read();
  // خطوة واحدة في تقرير واحد لا تُسجَّل مرتين: يُحدَّث سجلّها.
  const i = rows.findIndex((r) => r.jobId === entry.jobId && r.step === entry.step);
  const row = { ...entry, at: new Date().toISOString() };
  if (i >= 0) rows[i] = row; else rows.push(row);
  write(rows);
}

export const all = () => read();

export function clear() { write([]); }

/** ترتيب النماذج بمتوسط درجة السند، مع عدّ المشكلات. */
export function leaderboard() {
  const map = new Map();
  for (const r of read()) {
    const row = map.get(r.model) || {
      model: r.model, runs: 0, scoreSum: 0, coverageSum: 0,
      invented: 0, unsupported: 0, numbers: 0, clean: 0, roles: new Set(),
    };
    row.runs += 1;
    row.scoreSum += Number(r.score) || 0;
    row.coverageSum += Number(r.coverage) || 0;
    row.invented += Number(r.badIds) || 0;
    row.unsupported += Number(r.unsupported) || 0;
    row.numbers += Number(r.numberIssues) || 0;
    if (r.level === 'ok') row.clean += 1;
    if (r.role) row.roles.add(r.role);
    map.set(r.model, row);
  }

  return [...map.values()]
    .map((r) => ({
      model: r.model,
      runs: r.runs,
      score: Math.round(r.scoreSum / r.runs),
      coverage: Math.round(r.coverageSum / r.runs),
      cleanRate: Math.round((r.clean / r.runs) * 100),
      invented: r.invented,
      unsupported: r.unsupported,
      numbers: r.numbers,
      roles: [...r.roles],
    }))
    .sort((a, b) => b.cleanRate - a.cleanRate || b.score - a.score || b.runs - a.runs);
}

/** أفضل نموذج لدورٍ بعينه، إن كفت التجارب. */
export function bestFor(role, minRuns = 3) {
  const rows = read().filter((r) => r.role === role);
  const map = new Map();
  for (const r of rows) {
    const row = map.get(r.model) || { model: r.model, runs: 0, clean: 0, sum: 0 };
    row.runs += 1; row.sum += Number(r.score) || 0;
    if (r.level === 'ok') row.clean += 1;
    map.set(r.model, row);
  }
  const ranked = [...map.values()]
    .filter((r) => r.runs >= minRuns)
    .sort((a, b) => (b.clean / b.runs) - (a.clean / a.runs) || (b.sum / b.runs) - (a.sum / a.runs));
  return ranked[0] || null;
}
