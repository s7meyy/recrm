// خطة العمل — تحوّل توصيات التقرير إلى مهامّ لها حالة ومؤشّر قياس ومهلة،
// فيُقاس في التقرير التالي ما نُفِّذ منها فعلًا بدل أن تبقى التوصيات كلامًا.

const RID = /\bR\d{3}\b/g;

export const STATUS = {
  open:    { label: 'لم تبدأ',   cls: '' },
  doing:   { label: 'جارية',     cls: 'mid' },
  done:    { label: 'منجزة',     cls: 'ok' },
  dropped: { label: 'مُستبعدة',  cls: '' },
};

/** يبحث عن قسم التوصيات في التقرير ويُرجع نصّه وحده. */
function recommendationSection(markdown) {
  const lines = String(markdown || '').split('\n');
  const start = lines.findIndex((l) => /^#{1,6}\s*.*(?:توصيات|التوصيات|خطة|إجراءات)/.test(l));
  if (start < 0) return '';
  const level = (lines[start].match(/^#+/) || ['#'])[0].length;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    const m = lines[i].match(/^(#+)\s/);
    if (m && m[1].length <= level) { end = i; break; }
  }
  return lines.slice(start + 1, end).join('\n');
}

/** ينظّف بند التوصية من الترقيم والتشكيل الزائد. */
const clean = (t) => String(t || '')
  .replace(/^\s*[-*•]\s*/, '')
  .replace(/^\s*\d+[.)-]\s*/, '')
  .replace(/\*\*/g, '')
  .trim();

/**
 * يستخرج التوصيات من التقرير النهائي — من القوائم أو من جدول التوصيات.
 * @returns {Array<{id,text,ids:string[],metric:string,status:string,due:string,note:string}>}
 */
export function extractTasks(markdown) {
  // بلا قسم توصيات لا تُستخرج مهام: التقاط «نقاط الضعف» بوصفها مهامَّ يقلب معنى التقرير.
  const section = recommendationSection(markdown);
  if (!section.trim()) return [];
  const tasks = [];
  const seen = new Set();

  // `source` هو السطر كاملًا: في الجداول يقع سند التوصية في خلية أخرى غير خلية نصّها.
  const push = (text, metric = '', source = '') => {
    const t = clean(text);
    if (t.length < 8) return;
    const norm = t.replace(/\s+/g, ' ').slice(0, 90);
    if (seen.has(norm)) return;
    seen.add(norm);
    const ids = [...new Set((source || t).match(RID) || [])];
    RID.lastIndex = 0;
    tasks.push({
      id: 'T' + String(tasks.length + 1).padStart(2, '0'),
      text: t.replace(/\s*[（(][^)）]*R\d{3}[^)）]*[)）]\s*/g, ' ').replace(/\s+/g, ' ').trim(),
      ids, metric: clean(metric), status: 'open', due: '', note: '',
    });
  };

  for (const raw of section.split('\n')) {
    const line = raw.trim();
    if (!line) continue;

    // صفوف الجدول: نأخذ أطول خلية نصية توصيةً، وخلية تحوي مؤشّرًا قياسًا.
    if (line.startsWith('|')) {
      const cells = line.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue;
      if (/التوصية|الإجراء|المهمة/.test(line) && /مؤشر|قياس|السند/.test(line)) continue; // رأس الجدول
      const texts = cells.filter((c) => c.replace(/\s/g, '').length > 6);
      if (!texts.length) continue;
      const main = texts.reduce((a, b) => (b.length > a.length ? b : a), '');
      const metric = texts.find((c) => c !== main && /%|٪|دقيقة|يوم|صفر|أقل|أكثر|نسبة|معدل|<|>/.test(c)) || '';
      push(main, metric, line);
      continue;
    }

    if (/^\s*(?:[-*•]|\d+[.)-])\s+/.test(raw)) push(line);
  }

  return tasks;
}

/** يدمج التوصيات المستخرجة مع خطة قائمة، فلا تضيع حالة مهمة عند إعادة الاستخراج. */
export function mergeTasks(existing = [], fresh = []) {
  const byText = new Map(existing.map((t) => [t.text.replace(/\s+/g, ' ').slice(0, 60), t]));
  const out = [];
  for (const f of fresh) {
    const k = f.text.replace(/\s+/g, ' ').slice(0, 60);
    const old = byText.get(k);
    out.push(old ? { ...f, id: old.id, status: old.status, due: old.due, note: old.note } : f);
    byText.delete(k);
  }
  // مهام أضافها المستخدم يدويًّا ولا وجود لها في التقرير الجديد — تبقى.
  for (const left of byText.values()) if (left.manual) out.push(left);
  return out;
}

export function progress(tasks = []) {
  const total = tasks.filter((t) => t.status !== 'dropped').length;
  const done = tasks.filter((t) => t.status === 'done').length;
  const doing = tasks.filter((t) => t.status === 'doing').length;
  return { total, done, doing, open: total - done - doing, pct: total ? Math.round((done / total) * 100) : 0 };
}

/** تاريخ استحقاق افتراضي: ٣٠ يومًا من اليوم، بصيغة ISO قصيرة. */
export function defaultDue(days = 30) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** قسم Markdown يُلحَق بالتقرير ليظهر في الـPDF. */
export function planMarkdown(tasks = []) {
  if (!tasks.length) return '';
  const p = progress(tasks);
  const rows = tasks.map((t, i) => {
    const st = STATUS[t.status]?.label || t.status;
    return `| ${i + 1} | ${t.text} | ${t.metric || '—'} | ${t.due || '—'} | ${st} |`;
  }).join('\n');
  return `\n\n# خطة العمل\nمنجز ${p.done} من ${p.total} مهمة (${p.pct}%).\n\n` +
    `| # | المهمة | مؤشر القياس | الاستحقاق | الحالة |\n|---|---|---|---|---|\n${rows}\n`;
}
