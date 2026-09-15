// بناء التقرير المصمَّم من التقرير النصي الموحَّد.
// لا يعتمد على أي نموذج: النصّ يدخل Markdown ويخرج صفحة A4 عربية جاهزة للطباعة/الـPDF.
// وإن أراد المستخدم تصميمًا من نموذج (الخطوة الاختيارية التاسعة) فله ذلك، وهذا هو الأساس المضمون.

import { stats } from './schema.js';
import { topicStats } from './lexicon.js';

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

/** Markdown مبسّط: عناوين، قوائم، جداول، غامق، مائل، اقتباس. */
export function mdToHtml(md) {
  const lines = String(md || '').replace(/\r/g, '').split('\n');
  // النماذج تختلف: بعضها يبدأ الأقسام بـ # وبعضها بـ ##. نجعل أعلى مستوى موجود هو مستوى الأقسام
  // كي يبقى الفهرس صحيحًا والترقيم متسقًا أيًّا كانت صيغة المخرج.
  const levels = lines.map((l) => l.match(/^(#{1,6})\s+\S/)).filter(Boolean).map((m) => m[1].length);
  const base = levels.length ? Math.min(...levels) : 1;
  const out = [];
  let list = null;      // 'ul' | 'ol'
  let inQuote = false;
  let table = null;

  const closeList = () => { if (list) { out.push(`</${list}>`); list = null; } };
  const closeQuote = () => { if (inQuote) { out.push('</blockquote>'); inQuote = false; } };
  const closeTable = () => {
    if (table) {
      const [head, ...rows] = table;
      out.push('<table><thead><tr>' + head.map((c) => `<th>${inline(c)}</th>`).join('') + '</tr></thead><tbody>');
      for (const r of rows) out.push('<tr>' + r.map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>');
      out.push('</tbody></table>');
      table = null;
    }
  };
  const closeAll = () => { closeList(); closeQuote(); closeTable(); };

  function inline(t) {
    let s = esc(t);
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,،]|$)/g, '$1<em>$2</em>');
    s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
    // معرّفات التعليقات تُبرَز لتسهيل التحقق من السند.
    s = s.replace(/\bR\d{3}\b/g, '<span class="rid">$&</span>');
    return s;
  }

  for (const raw of lines) {
    const line = raw.trimEnd();

    if (!line.trim()) { closeAll(); continue; }

    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      closeAll();
      const level = Math.min(h[1].length - base + 2, 6); // أعلى مستوى → h2 كي يبقى h1 للغلاف
      out.push(`<h${level}>${inline(h[2].replace(/^\d+[.\-)]\s*/, ''))}</h${level}>`);
      continue;
    }

    if (/^\s*\|.*\|\s*$/.test(line)) {
      closeList(); closeQuote();
      const cells = line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue; // سطر المحاذاة
      (table ??= []).push(cells);
      continue;
    }
    closeTable();

    if (/^>\s?/.test(line)) {
      closeList();
      if (!inQuote) { out.push('<blockquote>'); inQuote = true; }
      out.push(`<p>${inline(line.replace(/^>\s?/, ''))}</p>`);
      continue;
    }
    closeQuote();

    const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
    const ul = line.match(/^\s*[-*•]\s+(.*)$/);
    if (ol || ul) {
      const want = ol ? 'ol' : 'ul';
      if (list !== want) { closeList(); out.push(`<${want}>`); list = want; }
      out.push(`<li>${inline((ol || ul)[1])}</li>`);
      continue;
    }
    closeList();

    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { out.push('<hr>'); continue; }

    out.push(`<p>${inline(line.trim())}</p>`);
  }
  closeAll();
  return out.join('\n');
}

/** فهرس محتويات من عناوين h2. */
function tocFrom(html) {
  const items = [];
  const withIds = html.replace(/<h2>(.*?)<\/h2>/g, (m, t) => {
    const id = 's' + (items.length + 1);
    items.push({ id, title: t.replace(/<[^>]+>/g, '') });
    return `<h2 id="${id}">${t}</h2>`;
  });
  const toc = items.length
    ? `<nav class="toc"><h2 class="no-count">المحتويات</h2><ol>${
        items.map((i) => `<li><a href="#${i.id}">${i.title}</a></li>`).join('')
      }</ol></nav>`
    : '';
  return { html: withIds, toc };
}

function starBars(place) {
  const s = stats(place);
  if (!s.distribution) return '';
  const max = Math.max(...Object.values(s.distribution), 1);
  const rows = [5, 4, 3, 2, 1].map((n) => {
    const v = s.distribution[n];
    const pct = Math.round((v / max) * 100);
    const share = s.rated ? Math.round((v / s.rated) * 100) : 0;
    return `<div class="bar-row">
      <span class="bar-label">${n} ★</span>
      <span class="bar-track"><span class="bar-fill" style="width:${pct}%"></span></span>
      <span class="bar-value">${v} <small>(${share}%)</small></span>
    </div>`;
  }).join('');
  return `<section class="stats-block">
    <h2 class="no-count">توزيع التقييمات في العيّنة</h2>
    <div class="bars">${rows}</div>
    <p class="fine">العيّنة: ${s.total} تعليقًا${s.googleCount ? ` من أصل ${s.googleCount} تقييمًا في قوقل` : ''}${s.coverage !== null ? ` (${s.coverage}%)` : ''}.</p>
  </section>`;
}

function topicsBlock(place) {
  const rows = topicStats(place);
  if (!rows.length) return '';
  const max = Math.max(...rows.map((r) => r.total), 1);

  const bars = rows.slice(0, 10).map((t) => {
    const negPct = Math.round((t.neg / max) * 100);
    const posPct = Math.round((t.pos / max) * 100);
    const neuPct = Math.round((t.neu / max) * 100);
    return `<div class="topic-row">
      <span class="topic-name">${esc(t.name)}</span>
      <span class="topic-track">
        <span class="seg pos" style="width:${posPct}%"></span><span class="seg neu" style="width:${neuPct}%"></span><span class="seg neg" style="width:${negPct}%"></span>
      </span>
      <span class="topic-count">${t.total}</span>
    </div>`;
  }).join('');

  const table = rows.map((t) => `<tr><td>${esc(t.name)}</td><td>${t.total}</td><td>${t.pos}</td><td>${t.neg}</td><td>${esc(t.verdict)}</td></tr>`).join('');

  return `<section class="topics">
    <h2 class="no-count">المواضيع الواردة في التعليقات</h2>
    <p class="fine">مُستخرَجة آليًّا من نصوص التعليقات، لا من تقدير نموذج.</p>
    <div class="legend"><span><i class="sw pos"></i>إيجابي</span><span><i class="sw neu"></i>محايد</span><span><i class="sw neg"></i>سلبي</span></div>
    <div class="topics-chart">${bars}</div>
    <table><thead><tr><th>الموضوع</th><th>مرات الورود</th><th>إيجابي</th><th>سلبي</th><th>الاتجاه</th></tr></thead><tbody>${table}</tbody></table>
  </section>`;
}

function photosBlock(photos = []) {
  const valid = photos.filter((p) => p?.url);
  if (!valid.length) return '';
  return `<section class="photos">
    <h2 class="no-count">صور المنشأة</h2>
    <div class="photo-grid">${
      valid.slice(0, 6).map((p) => `<figure><img src="${esc(p.url)}" alt="${esc(p.caption || 'صورة المنشأة')}">${
        p.caption ? `<figcaption>${esc(p.caption)}</figcaption>` : ''
      }</figure>`).join('')
    }</div>
    <p class="fine">الصور من إدخال صاحب التقرير أو من صفحة المنشأة على قوقل مابز.</p>
  </section>`;
}

/** خط عربي يرفعه المستخدم فيُضمَّن في الملف، فلا يعتمد الإخراج على خطوط الجهاز. */
function fontFace(font) {
  if (!font?.dataUrl) return '';
  const fmt = font.dataUrl.includes('font/woff2') ? 'woff2' : (font.dataUrl.includes('font/woff') ? 'woff' : 'truetype');
  return `@font-face{font-family:"RabihArabic";src:url(${font.dataUrl}) format("${fmt}");font-display:swap}
body{font-family:"RabihArabic","Segoe UI",Tahoma,sans-serif!important}
`;
}

const CSS = `
:root{--ink:#14181f;--muted:#5b6472;--line:#d9dee6;--navy:#16324f;--gold:#9a7b26;--bg:#fff}
*{box-sizing:border-box}
body{margin:0;font-family:"Segoe UI",Tahoma,"Arabic Typesetting",sans-serif;color:var(--ink);background:#eef1f5;line-height:1.85}
.page{background:var(--bg);max-width:210mm;margin:0 auto;padding:18mm 15mm}
.cover{text-align:center;padding:38mm 15mm 20mm;border-bottom:3px double var(--gold)}
.brand{font-size:13pt;letter-spacing:.3em;color:var(--gold);font-weight:700}
.cover h1{font-size:26pt;margin:14mm 0 4mm;color:var(--navy);line-height:1.4}
.cover .sub{font-size:13pt;color:var(--muted);margin:0 0 10mm}
.cover-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:4mm;max-width:150mm;margin:0 auto;text-align:right}
.cover-grid div{border:1px solid var(--line);border-radius:6px;padding:4mm 5mm}
.cover-grid b{display:block;font-size:9pt;color:var(--muted);font-weight:600;margin-bottom:1mm}
.cover-grid span{font-size:12pt;color:var(--navy);font-weight:700}
.body{counter-reset:h2}
.body h2{counter-increment:h2;font-size:15pt;color:var(--navy);border-bottom:2px solid var(--gold);padding-bottom:2mm;margin:10mm 0 4mm;break-after:avoid}
.body h2::before{content:counter(h2) ". ";color:var(--gold)}
.body h2.no-count{counter-increment:none}
.body h2.no-count::before{content:none}
.body h3{counter-increment:h3;font-size:12.5pt;color:#24405e;margin:6mm 0 2mm;break-after:avoid}
.body h2{counter-reset:h3}
.body h3::before{content:counter(h2) "-" counter(h3) " ";color:var(--gold);font-weight:700}
.body h4{font-size:11.5pt;color:#2c4a6b;margin:4mm 0 1mm}
p{margin:0 0 3mm;text-align:justify}
ul,ol{margin:0 0 4mm;padding-inline-start:7mm}
li{margin-bottom:1.5mm}
blockquote{margin:3mm 0;padding:2mm 5mm;border-inline-start:3px solid var(--gold);background:#faf7ef;color:#3a3a3a}
table{width:100%;border-collapse:collapse;margin:3mm 0;font-size:10.5pt;break-inside:avoid}
th,td{border:1px solid var(--line);padding:2mm 3mm;text-align:right}
th{background:#f3f5f8;color:var(--navy);font-weight:700}
hr{border:0;border-top:1px solid var(--line);margin:6mm 0}
code{background:#f3f5f8;padding:0 1mm;border-radius:3px;font-size:10pt}
.rid{color:var(--gold);font-size:9.5pt;font-weight:700;white-space:nowrap}
.toc{border:1px solid var(--line);border-radius:8px;padding:5mm 7mm;background:#fbfcfd;break-inside:avoid;margin-bottom:8mm}
.toc ol{padding-inline-start:6mm;margin:0}
.toc a{color:var(--navy);text-decoration:none}
.stats-block{break-inside:avoid;margin:8mm 0}
.bars{display:flex;flex-direction:column;gap:2mm}
.bar-row{display:grid;grid-template-columns:14mm 1fr 24mm;align-items:center;gap:3mm}
.bar-label{color:var(--gold);font-weight:700;font-size:10.5pt}
.bar-track{background:#eef1f5;border-radius:3px;height:5mm;overflow:hidden}
.bar-fill{display:block;height:100%;background:linear-gradient(90deg,var(--navy),#3a6ea5)}
.bar-value{font-size:10pt;color:var(--muted);text-align:left}
.topics{break-inside:avoid;margin:8mm 0}
.topics-chart{display:flex;flex-direction:column;gap:2mm;margin:4mm 0}
.topic-row{display:grid;grid-template-columns:52mm 1fr 10mm;align-items:center;gap:3mm}
.topic-name{font-size:10.5pt;color:var(--navy)}
.topic-track{display:flex;background:#eef1f5;border-radius:3px;height:5mm;overflow:hidden}
.topic-track .seg{display:block;height:100%}
.seg.pos{background:#2f7d55}.seg.neu{background:#b9c2ce}.seg.neg{background:#b5462f}
.topic-count{font-size:10pt;color:var(--muted);text-align:left}
.legend{display:flex;gap:6mm;font-size:9.5pt;color:var(--muted);margin-top:2mm}
.legend span{display:flex;align-items:center;gap:1.5mm}
.legend .sw{width:3mm;height:3mm;border-radius:2px;display:inline-block}
.sw.pos{background:#2f7d55}.sw.neu{background:#b9c2ce}.sw.neg{background:#b5462f}
.photos{break-inside:avoid;margin:8mm 0}
.photo-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:3mm}
.photo-grid img{width:100%;height:38mm;object-fit:cover;border-radius:6px;border:1px solid var(--line)}
figcaption{font-size:9pt;color:var(--muted);margin-top:1mm;text-align:center}
.fine{font-size:9.5pt;color:var(--muted)}
.foot{margin-top:12mm;padding-top:4mm;border-top:1px solid var(--line);font-size:9pt;color:var(--muted);display:flex;justify-content:space-between;gap:4mm}
@page{size:A4;margin:16mm 14mm}
@media print{
  body{background:#fff}
  .page{max-width:none;margin:0;padding:0}
  .cover{padding:45mm 10mm 20mm;break-after:page}
  .toc{break-after:page}
  h2,h3,h4{break-after:avoid}
  p,li,tr{break-inside:avoid}
  a{color:inherit;text-decoration:none}
}`;

/**
 * @param {object} o
 * @param {object} o.place  بيانات المنشأة
 * @param {object} o.ctx    المدينة/الحي/التصنيف
 * @param {string} o.markdown التقرير الموحَّد النهائي
 * @param {Array}  o.photos  [{url, caption}]
 * @returns {string} HTML كامل مكتفٍ بذاته
 */
export function buildReportHtml({ place, ctx = {}, markdown = '', photos = [], show = {}, font = null }) {
  const opt = { toc: true, stars: true, topics: true, photos: true, ...show };
  const s = stats(place);
  const body = tocFrom(mdToHtml(markdown));
  const date = new Date().toLocaleDateString('ar-SA-u-ca-gregory');
  const name = esc(place.identity?.name || 'منشأة غير مسمّاة');

  const cover = `<header class="cover">
    <div class="brand">رابــح</div>
    <h1>تقرير تحليلي عن<br>${name}</h1>
    <p class="sub">مبنيّ على تقييمات وتعليقات العملاء المنشورة في خرائط قوقل</p>
    <div class="cover-grid">
      <div><b>التصنيف</b><span>${esc(ctx.categoryName || '—')}</span></div>
      <div><b>المدينة</b><span>${esc(ctx.cityName || '—')}</span></div>
      <div><b>الحي</b><span>${esc(ctx.districtName || '—')}</span></div>
      <div><b>متوسط التقييم</b><span>${s.googleAverage ?? s.sampleAverage ?? '—'} من 5</span></div>
      <div><b>عدد التقييمات</b><span>${s.googleCount ?? '—'}</span></div>
      <div><b>تاريخ التقرير</b><span>${esc(date)}</span></div>
    </div>
  </header>`;

  const footer = `<footer class="foot">
    <span>${name} — تقرير رابح</span>
    <span>${esc(date)}</span>
  </footer>`;

  return `<!doctype html>
<html dir="rtl" lang="ar">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>تقرير ${name} — رابح</title>
<style>${fontFace(font)}${CSS}</style>
</head>
<body>
<div class="page">
${cover}
<main class="body">
${opt.toc ? body.toc : ''}
${opt.stars ? starBars(place) : ''}
${opt.topics ? topicsBlock(place) : ''}
${body.html}
${opt.photos ? photosBlock(photos) : ''}
</main>
${footer}
</div>
</body>
</html>`;
}
