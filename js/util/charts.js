// رسومٌ بيانيّةٌ مرسومةٌ بيدنا (المرحلة ٤٧).
//
// الداشبورد كلُّه أرقامٌ وقوائم. والرقمُ يُقرأ ولا يُرى: «١٢ صفقة» و«٩ صفقات» سطران
// متشابهان، وارتفاعُ عمودين يقول الفرق في لحظة. وأكثرُ ما يُسأل عنه شكلٌ لا رقم:
// **أصاعدٌ أنا أم هابط؟ وأين يذهب أكثرُ ما عندي؟**
//
// **ولا مكتبةَ رسومٍ هنا.** المشروع بلا أداةِ بناءٍ ولا حزم، وإدخالُ مكتبةٍ لأجل ثلاثة
// أشكالٍ يجرّ عليك ملفًّا يُحمَّل في كل فتحة، وترقيمًا لاتينيًّا، ومحاورَ تبدأ من اليسار.
// وهذه ثلاثةُ أشكالٍ بـ SVG خالص: أعمدةٌ تبدأ من اليمين، وخطٌّ يسير إلى اليسار، وحلقةٌ
// تدور كما تدور العربيّة.
//
// **والرقمُ لا يعيش في الشكل وحده:** تحت كل رسمٍ سطرٌ يقول أرقامَه نصًّا، فمن لا يرى
// الرسم — قارئُ شاشةٍ، أو ورقةٌ مطبوعة، أو شاشةٌ ضيّقة — يقرأ ما فيه كاملًا.

const NS = 'http://www.w3.org/2000/svg';

/** عنصرُ SVG — لا يُنشأ بـ`createElement` وإلّا خرج عنصرًا فارغًا لا يُرسم. */
export function svgEl(tag, attrs = {}, ...children) {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'text') node.textContent = v;
    else node.setAttribute(k, String(v));
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false || c === '') continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

/* ===== الهندسة: تُحسب وحدها فتُختبر وحدها ===== */

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/**
 * مواضعُ الأعمدة. **الأوّلُ إلى اليمين** لأنّ الزمن في العربيّة يسير يمينًا فيسارًا،
 * وعمودٌ يبدأ من اليسار يقلب قراءة الاتّجاه كلَّها.
 *
 * والقيمُ السالبةُ تُقصّ إلى الصفر: هذا شكلُ مقاديرَ لا شكلُ ميزان.
 */
export function columnLayout(values = [], { width = 320, height = 140, pad = 18, gap = 0.28 } = {}) {
  const vals = values.map((v) => Math.max(0, num(v)));
  if (!vals.length) return [];
  const max = Math.max(...vals);
  const inner = Math.max(1, width - pad * 2);
  const slot = inner / vals.length;
  const w = slot * (1 - gap);
  const floor = height - pad;
  const usable = Math.max(1, floor - pad);
  return vals.map((v, i) => {
    // ارتفاعٌ نسبيّ، وأدنى شعرةٍ ظاهرةٍ لقيمةٍ موجبةٍ صغيرة — وصفرٌ يبقى صفرًا لا شعرة.
    const h = max > 0 ? Math.max(v > 0 ? 2 : 0, (v / max) * usable) : 0;
    return {
      i,
      value: vals[i],
      x: width - pad - (i + 1) * slot + (slot - w) / 2,
      y: floor - h,
      w,
      h,
      cx: width - pad - (i + 1) * slot + slot / 2,
    };
  });
}

/** نقاطُ خطٍّ زمنيّ، يمينُها أقدمُها — ومسارُه جاهزٌ لـ`<path d>`. */
export function linePoints(values = [], { width = 320, height = 140, pad = 18 } = {}) {
  const vals = values.map(num);
  if (!vals.length) return { points: [], d: '', area: '', min: 0, max: 0 };
  const max = Math.max(...vals);
  const min = Math.min(...vals, 0);
  const span = max - min || 1;
  const inner = Math.max(1, width - pad * 2);
  const step = vals.length > 1 ? inner / (vals.length - 1) : 0;
  const floor = height - pad;
  const usable = Math.max(1, floor - pad);
  const points = vals.map((v, i) => ({
    i,
    value: v,
    x: width - pad - i * step,
    y: floor - ((v - min) / span) * usable,
  }));
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${round(p.x)},${round(p.y)}`).join(' ');
  const area = points.length
    ? `${d} L${round(points[points.length - 1].x)},${round(floor)} L${round(points[0].x)},${round(floor)} Z`
    : '';
  return { points, d, area, min, max };
}

/**
 * قِطَعُ الحلقة. **تدور مع عقارب الساعة ابتداءً من أعلى الدائرة**، وهو اتّجاهُ قراءة
 * الحصص في العربيّة أيضًا — فالقطعةُ الأولى تقع إلى يمين القمّة لا إلى يساره.
 *
 * وحصّةٌ واحدةٌ تملأ الكلّ: القوسُ لا يُغلق على ٣٦٠ درجةً في SVG، فتُرسم دائرتين.
 */
export function donutArcs(values = [], { size = 140, thickness = 26 } = {}) {
  const vals = values.map((v) => Math.max(0, num(v)));
  const total = vals.reduce((a, b) => a + b, 0);
  if (!total) return { total: 0, arcs: [] };
  const r = size / 2 - thickness / 2;
  const c = size / 2;
  let angle = -Math.PI / 2; // من القمّة
  const arcs = [];
  for (const [i, v] of vals.entries()) {
    const share = v / total;
    const sweep = share * Math.PI * 2;
    const end = angle + sweep;
    const at = (a) => [round(c + r * Math.cos(a)), round(c + r * Math.sin(a))];
    const [x1, y1] = at(angle);
    const [x2, y2] = at(end - 0.0001);
    const large = sweep > Math.PI ? 1 : 0;
    arcs.push({
      i,
      value: vals[i],
      share,
      // الكلُّ في قطعةٍ واحدة: دائرتان متتاليتان بدل قوسٍ لا يُغلق.
      d: share >= 0.9999
        ? `M${round(c)},${round(c - r)} A${round(r)},${round(r)} 0 1 1 ${round(c)},${round(c + r)} A${round(r)},${round(r)} 0 1 1 ${round(c)},${round(c - r)}`
        : `M${x1},${y1} A${round(r)},${round(r)} 0 ${large} 1 ${x2},${y2}`,
    });
    angle = end;
  }
  return { total, arcs, r, c, thickness };
}

const round = (n) => Math.round(n * 100) / 100;

/* ===== الأشكال ===== */

const PALETTE = ['var(--accent)', 'var(--dhad-color-help)', 'var(--warn)', 'var(--ok)', 'var(--danger)', 'var(--dhad-color-border-strong)'];

/** تُستدعى من الصفحات؛ وتحتاج DOM — لذلك تُستورد `el` كسولًا لا في رأس الوحدة. */
function box(title, note, svg, legend) {
  const fig = document.createElement('figure');
  fig.className = 'chart';
  if (title) {
    const cap = document.createElement('figcaption');
    cap.className = 'chart-title';
    cap.textContent = title;
    fig.append(cap);
  }
  fig.append(svg);
  if (legend) fig.append(legend);
  if (note) {
    const p = document.createElement('p');
    p.className = 'muted small';
    p.textContent = note;
    fig.append(p);
  }
  return fig;
}

function emptyChart(title, text) {
  const fig = document.createElement('figure');
  fig.className = 'chart chart-empty';
  if (title) {
    const cap = document.createElement('figcaption');
    cap.className = 'chart-title';
    cap.textContent = title;
    fig.append(cap);
  }
  const p = document.createElement('p');
  p.className = 'muted small';
  p.textContent = text;
  fig.append(p);
  return fig;
}

function legendList(items) {
  const ul = document.createElement('ul');
  ul.className = 'chart-legend';
  for (const it of items) {
    const li = document.createElement('li');
    const dot = document.createElement('span');
    dot.className = 'chart-dot';
    dot.style.background = it.color;
    li.append(dot, document.createTextNode(`${it.label}: ${it.text}`));
    ul.append(li);
  }
  return ul;
}

/**
 * **أعمدةٌ زمنيّة** — الأقدمُ يمينًا، والأحدثُ يسارًا.
 * @param {{ rows: [{label, value}], title, note, format, height }} o
 */
export function columnsChart({ rows = [], title = '', note = '', format = (v) => String(v), height = 150, emptyText = 'لا بيانات بعد.' } = {}) {
  if (!rows.length) return emptyChart(title, emptyText);
  const total = rows.reduce((a, r) => a + Math.max(0, num(r.value)), 0);
  if (!total) return emptyChart(title, 'كلُّ القيم صفر — لا شيء يُرسم بعد.');

  const W = 320;
  const cols = columnLayout(rows.map((r) => r.value), { width: W, height });
  const svg = svgEl('svg', {
    viewBox: `0 0 ${W} ${height + 16}`, class: 'chart-svg', role: 'img',
    'aria-label': `${title || 'رسم أعمدة'}: ${rows.map((r) => `${r.label} ${format(r.value)}`).join('، ')}`,
  });
  svg.append(svgEl('line', { x1: 6, x2: W - 6, y1: height - 18, y2: height - 18, class: 'chart-axis' }));
  for (const [i, c] of cols.entries()) {
    svg.append(svgEl('rect', {
      x: round(c.x), y: round(c.y), width: round(c.w), height: round(c.h),
      rx: 3, class: 'chart-bar', style: `fill: ${rows[i].color || 'var(--accent)'}`,
    }));
    svg.append(svgEl('text', {
      x: round(c.cx), y: height - 6, 'text-anchor': 'middle', class: 'chart-tick', text: rows[i].label,
    }));
  }
  const strip = document.createElement('p');
  strip.className = 'muted small chart-values';
  strip.textContent = rows.map((r) => `${r.label}: ${format(r.value)}`).join(' · ');
  return box(title, note, svg, strip);
}

/** **خطُّ اتجاه** — يسير من اليمين (الأقدم) إلى اليسار (الأحدث). */
export function lineChart({ rows = [], title = '', note = '', format = (v) => String(v), height = 150, emptyText = 'لا بيانات بعد.' } = {}) {
  if (rows.length < 2) return emptyChart(title, rows.length ? 'نقطةٌ واحدةٌ لا تصنع اتّجاهًا — تحتاج شهرين على الأقل.' : emptyText);
  const W = 320;
  const { d, area, min, max } = linePoints(rows.map((r) => r.value), { width: W, height });
  const svg = svgEl('svg', {
    viewBox: `0 0 ${W} ${height + 16}`, class: 'chart-svg', role: 'img',
    'aria-label': `${title || 'رسم خطّي'}: ${rows.map((r) => `${r.label} ${format(r.value)}`).join('، ')}`,
  });
  svg.append(svgEl('line', { x1: 6, x2: W - 6, y1: height - 18, y2: height - 18, class: 'chart-axis' }));
  svg.append(svgEl('path', { d: area, class: 'chart-area' }));
  svg.append(svgEl('path', { d, class: 'chart-line' }));
  const pts = linePoints(rows.map((r) => r.value), { width: W, height }).points;
  for (const p of pts) svg.append(svgEl('circle', { cx: p.x, cy: p.y, r: 2.5, class: 'chart-dot-svg' }));
  // طرفا المحور وحدهما: كتابةُ كل شهرٍ تحت خطٍّ من اثني عشر نقطةً تُزاحم فتُقرأ ركامًا.
  //
  // **و`text-anchor` هنا `middle` قصدًا**: `start` و`end` تتبعان اتجاه الكتابة، والصفحةُ
  // من اليمين — فينقلب طرفا المحور ويخرج الاسمان عن الإطار مقصوصين. و`middle` لا اتجاهَ لها.
  svg.append(svgEl('text', { x: W - 26, y: height - 4, 'text-anchor': 'middle', class: 'chart-tick', text: rows[0].label }));
  svg.append(svgEl('text', { x: 26, y: height - 4, 'text-anchor': 'middle', class: 'chart-tick', text: rows[rows.length - 1].label }));

  const strip = document.createElement('p');
  strip.className = 'muted small chart-values';
  strip.textContent = `${rows.map((r) => `${r.label}: ${format(r.value)}`).join(' · ')} — الأدنى ${format(min)} والأعلى ${format(max)}`;
  return box(title, note, svg, strip);
}

/** **حلقةُ حصص** — تدور من القمّة مع عقارب الساعة، والحصّةُ الأولى يمينَ القمّة. */
export function donutChart({ rows = [], title = '', note = '', format = (v) => String(v), emptyText = 'لا بيانات بعد.' } = {}) {
  const usable = rows.filter((r) => num(r.value) > 0);
  if (!usable.length) return emptyChart(title, rows.length ? 'كلُّ القيم صفر — لا شيء يُرسم بعد.' : emptyText);
  const SIZE = 150;
  const { arcs, total, r, c, thickness } = donutArcs(usable.map((x) => x.value), { size: SIZE, thickness: 26 });
  const svg = svgEl('svg', {
    viewBox: `0 0 ${SIZE} ${SIZE}`, class: 'chart-svg chart-donut', role: 'img',
    'aria-label': `${title || 'حلقة حصص'}: ${usable.map((x) => `${x.label} ${format(x.value)}`).join('، ')}`,
  });
  svg.append(svgEl('circle', { cx: c, cy: c, r, class: 'chart-ring' , 'stroke-width': thickness }));
  for (const a of arcs) {
    svg.append(svgEl('path', {
      d: a.d, fill: 'none', 'stroke-width': thickness, 'stroke-linecap': 'butt',
      style: `stroke: ${usable[a.i].color || PALETTE[a.i % PALETTE.length]}`,
    }));
  }
  svg.append(svgEl('text', { x: c, y: c + 5, 'text-anchor': 'middle', class: 'chart-center', text: format(total) }));

  const legend = legendList(arcs.map((a) => ({
    label: usable[a.i].label,
    color: usable[a.i].color || PALETTE[a.i % PALETTE.length],
    text: `${format(a.value)} · ${Math.round(a.share * 100)}٪`,
  })));
  return box(title, note, svg, legend);
}

/** أشهرُ السنة الأخيرة بمفاتيحها `YYYY-MM` وأسمائها القصيرة — محورُ كل رسمٍ زمنيّ. */
export function monthsBack(count = 6, now = Date.now()) {
  const names = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
  const out = [];
  const base = new Date(now);
  for (let i = 0; i < count; i++) {
    const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
    out.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: names[d.getMonth()] });
  }
  // **الأحدثُ أوّلًا.** والرسومُ هنا تضع الأوّلَ يمينًا، والزمنُ في العربيّة يسير يمينًا
  // فيسارًا — فمن أراد الزمنَ صاعدًا يقلبها عند الاستدعاء، وهو ما تفعله لوحاتُ الداشبورد.
  return out;
}
