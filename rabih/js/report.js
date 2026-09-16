// بناء التقرير المصمَّم من التقرير النصي الموحَّد.
// لا يعتمد على أي نموذج: النصّ يدخل Markdown ويخرج صفحة A4 عربية جاهزة للطباعة/الـPDF.
// وإن أراد المستخدم تصميمًا من نموذج (الخطوة الاختيارية التاسعة) فله ذلك، وهذا هو الأساس المضمون.

import { stats, assignReviewIds } from './schema.js';
import { topicStats } from './lexicon.js';
import { recentVsOlder, monthly, alerts, topicAges } from './recency.js';
import { themeCss, coverHeader, footerLine, OFFICE_CSS } from './brand.js';
import { extract as extractEntities } from './entities.js';
import { analyze as analyzeReplies } from './replies.js';
import { block as confidenceBlock } from './confidence.js';
import { priorityBlock } from './priority.js';
import { starsBlock } from './stars.js';
import { voiceBlock } from './voice.js';
import { impactBlock } from './impact.js';
import { sourcesBlock } from './sources.js';
import { cooccurBlock } from './cooccur.js';
import { biasBlock } from './bias.js';
import { shield, notice as privacyNotice } from './privacy.js';
import { timingBlock } from './timing.js';
import { promisesBlock } from './promises.js';
import { effectBlock } from './effect.js';
import { briefBlock } from './brief.js';
import { coverageBlock } from './coverage.js';
import { actionsBlock, checklistBlock, commitBlock, draftsBlock } from './action.js';

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

function topicsBlock(place, lead = []) {
  let rows = topicStats(place);
  if (!rows.length) return '';
  /* محاور القطاع تتقدّم: العيادة يتصدّرها الانتظار والطاقم، والمقهى الطعم.
     ولا يُحذف موضوعٌ فيه بيانات — الترتيب يتغيّر والمحتوى باقٍ. */
  if (lead.length) {
    rows = [...rows].sort((a, b) => {
      const ia = lead.indexOf(a.id);
      const ib = lead.indexOf(b.id);
      if (ia !== ib) return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
      return b.total - a.total;
    });
  }
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

function recencyBlock(place) {
  const r = recentVsOlder(place);
  const months = monthly(place);
  const warn = alerts(place);
  if (!r.recent.n && !r.older.n) return '';

  const cls = r.verdict === 'انحدار' ? 'down' : (r.verdict === 'تحسّن' ? 'up' : 'flat');
  const max = Math.max(...months.map((m) => m.n), 1);

  const chart = months.length >= 3 ? `<div class="months">${
    months.map((m) => {
      const h = Math.max(6, Math.round((m.n / max) * 100));
      const tone = m.avg === null ? 'flat' : (m.avg >= 4 ? 'up' : (m.avg <= 2.5 ? 'down' : 'mid'));
      return `<div class="month"><span class="bar ${tone}" style="height:${h}%"></span>
        <span class="mv">${m.avg ?? '—'}</span><span class="ml">${esc(m.label)}</span></div>`;
    }).join('')
  }</div>` : '';

  const ages = topicAges(place).filter((t) => t.state !== 'قديمة');
  const ageRows = ages.length ? `<table><thead><tr><th>الشكوى</th><th>الحال</th><th>حديثة</th><th>قديمة</th></tr></thead><tbody>${
    ages.map((t) => `<tr><td>${esc(t.name)}</td><td>${esc(t.state)}</td><td>${t.recentNeg}</td><td>${t.olderNeg}</td></tr>`).join('')
  }</tbody></table>` : '';

  return `<section class="recency">
    <h2 class="no-count">القراءة الزمنية</h2>
    <div class="rec-grid">
      <div class="rec-cell"><b>آخر ${r.window} يومًا</b><span>${r.recent.avg ?? '—'}</span><small>${r.recent.n} تعليقًا${r.recent.neg !== null ? ` · سلبي ${r.recent.neg}%` : ''}</small></div>
      <div class="rec-cell"><b>ما قبلها</b><span>${r.older.avg ?? '—'}</span><small>${r.older.n} تعليقًا${r.older.neg !== null ? ` · سلبي ${r.older.neg}%` : ''}</small></div>
      <div class="rec-cell ${cls}"><b>الحكم</b><span>${esc(r.verdict)}</span><small>${r.diff !== null ? `فرق ${r.diff}` : 'العيّنة الزمنية غير كافية'}</small></div>
    </div>
    ${r.note ? `<p class="fine">${esc(r.note)}</p>` : ''}
    ${chart}
    ${warn.length ? `<div class="alerts"><b>إنذارات</b><ul>${warn.map((a) => `<li>${esc(a)}</li>`).join('')}</ul></div>` : ''}
    ${ageRows}
    ${r.undated ? `<p class="fine">${r.undated} تعليقًا بلا تاريخ مفهوم لم يدخل هذه القراءة.</p>` : ''}
  </section>`;
}

function entitiesReportBlock(place) {
  const { people, products } = extractEntities(place);
  if (!people.length && !products.length) return '';
  const row = (e) => `<tr><td>${esc(e.name)}</td><td>${e.total}</td><td>${e.pos}</td><td>${e.neg}</td><td>${esc(e.verdict)}</td></tr>`;
  return `<section class="entities">
    <h2 class="no-count">الأصناف والأسماء المتكررة</h2>
    <p class="fine">مستخرجة من نصوص التعليقات مباشرة — تدلّ على ما يُذكر بعينه لا على المحاور العامة.</p>
    ${products.length ? `<table><thead><tr><th>الصنف أو العبارة</th><th>مرات</th><th>إيجابي</th><th>سلبي</th><th>الاتجاه</th></tr></thead><tbody>${products.map(row).join('')}</tbody></table>` : ''}
    ${people.length ? `<p class="fine"><b>أشخاص ذُكروا بالاسم:</b> ${people.map((p) => `${esc(p.name)} (${p.total} — ${esc(p.verdict)})`).join(' · ')}</p>` : ''}
  </section>`;
}

function repliesReportBlock(place) {
  const a = analyzeReplies(place);
  if (!a.total || (!a.replied && !a.negTotal)) return '';
  return `<section class="replies">
    <h2 class="no-count">تعامل المنشأة مع التعليقات</h2>
    <div class="rec-grid">
      <div class="rec-cell"><b>نسبة الرد</b><span>${a.rate ?? '—'}%</span><small>${a.replied} من ${a.total}</small></div>
      <div class="rec-cell ${a.negRate !== null && a.negRate < 50 ? 'down' : ''}"><b>الرد على الشكاوى</b><span>${a.negRate ?? '—'}%</span><small>${a.negReplied} من ${a.negTotal}</small></div>
      <div class="rec-cell"><b>متوسط طول الرد</b><span>${a.avgLength}</span><small>حرفًا</small></div>
    </div>
    ${a.replied ? `<p class="fine">${a.quality.withAction} ردًّا يذكر معالجة · ${a.quality.apologyOnly} اعتذار مجرّد · ${a.quality.thanksOnly} شكر فقط.</p>` : ''}
    ${a.findings.length ? `<div class="alerts"><b>ملاحظات</b><ul>${a.findings.map((f) => `<li>${esc(f)}</li>`).join('')}</ul></div>` : ''}
    ${a.unanswered.length ? `<p class="fine">شكاوى بلا ردّ: ${a.unanswered.join('، ')}</p>` : ''}
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
.priority,.stars-calc,.voice,.impact,.sources,.cooccur,.timing,.promises,.effect,.network,.signature,.bias,.method{break-inside:avoid;margin:0 0 7mm}
.promise{margin:0 0 4mm;padding:3mm 4mm;border:1px solid var(--line);border-radius:6px;break-inside:avoid}
.promise .q{margin:2mm 0;padding:2mm 3mm;background:#fbfcfd;border-inline-start:3px solid var(--gold);border-radius:4px}
.promise .q p{margin:0;font-size:10pt;line-height:1.8}
.promise .after{margin:2mm 0 0;font-size:9.5pt}
.err-text{color:#c0392b}
.ar-sub{display:block;font-size:.72em;color:var(--muted);font-weight:400;margin-top:1mm}
.lang-note{margin-top:6mm;padding:3mm 4mm;background:#fbfcfd;border:1px solid var(--line);border-radius:6px;font-size:9.5pt;direction:ltr;text-align:left}
.bias .verdict{padding:3mm 4mm;border-radius:6px;margin-top:3mm}
.bias .verdict.err{background:#fdf6f5;border:1px solid #f0c9c4}
.bias .verdict.warn{background:#fffaf2;border:1px solid #f0dcb8}
.bias .verdict.ok{background:#f5fbf7;border:1px solid #cfe8d8}
.ok-text{color:#1e8449}
.signature{border:1px solid var(--line);border-radius:8px;padding:5mm 6mm;background:#fbfcfd}
.sig-row{display:flex;gap:4mm;margin:2mm 0;font-size:10pt}
.sig-row b{min-width:26mm;color:var(--navy)}
.sig-hash{font-family:ui-monospace,Menlo,Consolas,monospace;letter-spacing:.06em;font-size:9.5pt}
.prio .w-track{display:block;height:7px;background:#eef1f5;border-radius:4px;overflow:hidden;min-width:60px}
.prio .w-fill{display:block;height:100%;background:var(--gold)}
.prio .rid-cell{white-space:normal;line-height:1.9}
.voice-cols{display:grid;grid-template-columns:1fr 1fr;gap:4mm;margin-bottom:4mm}
.voice-cols.one{grid-template-columns:1fr}
/* الخلاصة التنفيذية — أول ما تقع عليه عين صاحب المنشأة. */
.brief{break-inside:avoid;margin:0 0 9mm;border:1px solid var(--line);border-radius:10px;padding:6mm;background:#fbfcfd}
.brief-hero{display:flex;align-items:center;gap:6mm;margin-bottom:5mm;flex-wrap:wrap}
.brief-hero .hero-num{display:flex;align-items:baseline;gap:2mm;flex-wrap:wrap}
.brief-hero .hero-num .n{font-size:32pt;font-weight:700;color:var(--navy);line-height:1}
.brief-hero .hero-num .of{font-size:12pt;color:var(--muted)}
.brief-hero .hero-side{font-size:10pt;line-height:1.9;border-inline-start:1px solid var(--line);padding-inline-start:5mm}
.brief-hero .hero-side b{color:var(--navy)}
/* الاتجاه وسمٌ قائم بذاته، لا ذيلٌ يلتصق بـ«من 5» فيُقرأ جزءًا منه. */
.brief-hero .trend{display:block;font-size:9.5pt;font-weight:600;color:var(--muted);
  border:1px solid var(--line);border-radius:999px;padding:1mm 3mm;margin-top:2mm}
.brief-hero .trend.down{color:#c0392b;border-color:#e8c4bf;background:#fdf6f5}
.brief-hero .trend.up{color:#1e8449;border-color:#bfe0cc;background:#f5fbf7}
.brief-cards{display:grid;grid-template-columns:repeat(2,1fr);gap:3mm}
.bcard{border:1px solid var(--line);border-radius:8px;padding:4mm;background:#fff;break-inside:avoid}
.bcard b{display:block;font-size:9pt;color:var(--muted);margin-bottom:1.5mm;font-weight:600}
.bcard span{font-size:11pt;line-height:1.7}
.bcard.bad{border-inline-start:3px solid #c0392b}
.bcard.good{border-inline-start:3px solid #1e8449}
.bcard.money{border-inline-start:3px solid var(--gold)}
.bcard.goal{border-inline-start:3px solid var(--navy)}
.brief-action{margin:4mm 0 0;padding:4mm;border-radius:8px;background:#f3f6fa;font-size:11pt;line-height:1.8}
.brief-note{margin:2mm 0 0;font-size:9pt;color:var(--muted)}
/* الملحق: كيف بُني التقرير — يُؤخَّر ولا يُحذف، فالصدق يقتضي بقاءه. */
.appendix{margin-top:12mm;padding-top:5mm;border-top:2px solid var(--line)}
.appendix-head{font-size:12pt;font-weight:700;color:var(--navy);margin:0 0 5mm}
/* خطة العمل — بطاقةٌ لكل أولوية، لا تنكسر بين صفحتين. */
.acts{display:grid;gap:4mm}
.act{border:1px solid var(--line);border-radius:8px;padding:4mm 5mm;background:#fff;break-inside:avoid}
.act-head{display:flex;gap:3mm;align-items:flex-start;margin-bottom:3mm}
.act-rank{flex:0 0 auto;width:8mm;height:8mm;border-radius:50%;background:var(--navy);color:#fff;
  display:flex;align-items:center;justify-content:center;font-weight:700;font-size:10pt}
.act-head b{font-size:11.5pt;color:var(--navy)}
.act-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:3mm;margin-bottom:3mm}
.act-grid>div{background:#fbfcfd;border-radius:6px;padding:2.5mm 3mm}
.act-grid b{display:block;font-size:8.5pt;color:var(--muted);font-weight:600;margin-bottom:1mm}
.act-grid span{display:block;font-size:10.5pt;font-weight:600;color:var(--navy)}
.act-grid small{display:block;font-size:8pt;color:var(--muted);margin-top:.5mm;line-height:1.6}
.act-steps{margin:0 0 2mm;padding-inline-start:5mm;font-size:10pt;line-height:1.9}
.act-ids{font-size:8.5pt;color:var(--muted)}
/* «بماذا ستبدأ؟» — فراغٌ يُكتب فيه بخطّ اليد. */
.commit td.write{height:11mm;background:repeating-linear-gradient(transparent,transparent 10mm,var(--line) 10mm,var(--line) 10.2mm)}
/* قائمة المتابعة — تُطبَع وتُعلَّق، فتبدأ صفحةً جديدة. */
.checklist{break-before:page;break-inside:avoid}
.checks{list-style:none;margin:0 0 5mm;padding:0}
.checks li{display:flex;align-items:center;gap:3mm;padding:3mm 0;border-bottom:1px solid var(--line);font-size:10.5pt}
.checks .box{flex:0 0 auto;width:5mm;height:5mm;border:1.5px solid var(--navy);border-radius:2px}
.checks .task{flex:1}
.checks .who{flex:0 0 auto;font-size:9pt;color:var(--muted)}
.checks .when{flex:0 0 auto;font-size:9pt;color:var(--muted);letter-spacing:.1em}
.check-foot{display:flex;gap:5mm;padding-top:3mm}
.check-foot div{flex:1;text-align:center}
.check-foot b{display:block;font-size:8.5pt;color:var(--muted)}
.check-foot span{font-size:11pt;font-weight:700;color:var(--navy)}
/* المسوّدات بنصّها كما وُلِّدت. */
.draft-text{white-space:pre-wrap;font-family:inherit;font-size:10pt;line-height:1.9;
  background:#fbfcfd;border:1px solid var(--line);border-radius:8px;padding:4mm 5mm;margin:0}
.voice .q{margin:0 0 3mm;padding:3mm 4mm;border-radius:6px;border-inline-start:3px solid var(--line);background:#fafbfc;break-inside:avoid}
.voice .q.neg{border-inline-start-color:#c0392b;background:#fdf6f5}
.voice .q.pos{border-inline-start-color:#1e8449;background:#f5fbf7}
.voice .q p{margin:0 0 2mm;font-size:10pt;line-height:1.85}
.voice .q footer{font-size:8.5pt;color:var(--muted)}
.impact .assume{padding:3mm 4mm;background:#fbfcfd;border:1px solid var(--line);border-radius:6px;margin-bottom:3mm;font-size:9.5pt}
.impact .total{font-size:11pt;margin-top:3mm}
.confidence{break-inside:avoid;margin:0 0 8mm;border:1px solid var(--line);border-radius:8px;padding:5mm 6mm;background:#fbfcfd}
.honesty{margin-top:4mm;padding-top:3mm;border-top:1px dashed var(--line);font-size:9.5pt;color:#333}
.honesty b{color:var(--navy)}
.honesty ul{margin:2mm 0 0;padding-inline-start:5mm}
.honesty li{margin:1mm 0}
.conf-head{display:flex;align-items:baseline;gap:4mm;margin:2mm 0 4mm}
.conf-score{font-size:22pt;font-weight:800;color:var(--navy);line-height:1}
.conf-level{font-size:11pt;color:var(--muted)}
.conf-head.up .conf-score{color:#2f7d55}
.conf-head.down .conf-score{color:#b5462f}
.conf-bars{display:flex;flex-direction:column;gap:2mm}
.conf-row{display:grid;grid-template-columns:38mm 1fr 42mm;align-items:center;gap:3mm}
.conf-name{font-size:10pt;color:var(--navy)}
.conf-track{background:#eef1f5;border-radius:3px;height:4mm;overflow:hidden}
.conf-fill{display:block;height:100%;background:linear-gradient(90deg,var(--navy),#3a6ea5)}
.conf-val{font-size:9.5pt;color:var(--muted);text-align:left}
.recency{break-inside:avoid;margin:8mm 0}
.rec-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:4mm;margin:4mm 0}
.rec-cell{border:1px solid var(--line);border-radius:6px;padding:3mm 4mm;text-align:center}
.rec-cell b{display:block;font-size:9pt;color:var(--muted);font-weight:600}
.rec-cell span{display:block;font-size:16pt;font-weight:700;color:var(--navy);line-height:1.5}
.rec-cell small{font-size:8.5pt;color:var(--muted)}
.rec-cell.down{border-color:#e2b7ab;background:#fdf6f4}.rec-cell.down span{color:#b5462f}
.rec-cell.up{border-color:#b7d9c4;background:#f4fbf7}.rec-cell.up span{color:#2f7d55}
.months{display:flex;align-items:flex-end;gap:2mm;height:34mm;margin:5mm 0 2mm;padding-bottom:12mm;position:relative}
.month{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;position:relative}
.month .bar{width:100%;border-radius:2px 2px 0 0;background:#8fa3b8}
.month .bar.up{background:#2f7d55}.month .bar.down{background:#b5462f}.month .bar.mid{background:#b98b2a}
.month .mv{font-size:8.5pt;color:var(--navy);margin-top:1mm}
.month .ml{position:absolute;bottom:-11mm;font-size:7.5pt;color:var(--muted);white-space:nowrap;transform:rotate(-45deg);transform-origin:top right}
.alerts{border-inline-start:3px solid #b5462f;background:#fdf6f4;padding:3mm 5mm;border-radius:0 6px 6px 0;margin:4mm 0}
.alerts b{color:#b5462f;font-size:10.5pt}
.alerts ul{margin:2mm 0 0;padding-inline-start:6mm;font-size:10pt}
.entities,.replies{break-inside:avoid;margin:8mm 0}
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
/**
 * صفحة المنهجية وحدود المسؤولية — تحمي مُعِدّ التقرير وتُتمّ صدقه.
 *
 * التقرير يصف **ما كُتب في قوقل** لا حقيقة المنشأة: من كتب راضٍ أو غاضب،
 * ومن سكت لم يُحسَب. وقول ذلك صراحةً ليس تقليلًا من التقرير — بل تحديدٌ
 * لما يصلح أن يُبنى عليه.
 */
function methodBlock(place, job, ctx) {
  const s = stats(place);
  const esc2 = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const src = [...new Set((place.reviews || []).map((r) => r.source || 'paste'))]
    .map((x) => ({ paste: 'لصقٌ يدوي', provider: 'مزوّد وسيط', places: 'واجهة قوقل الرسمية', json: 'ملف JSON' }[x] || x));

  return `<section class="method">
    <h2>المنهجية وحدود هذا التقرير</h2>
    <ul>
      <li><b>المصدر:</b> ${esc2(src.join('، ') || 'غير محدَّد')}${ctx.cityName ? ` — ${esc2(ctx.cityName)}` : ''}.</li>
      <li><b>العيّنة:</b> ${s.total} تعليقًا${s.declaredWithText ? ` من ${s.declaredWithText} تعليقًا منصوصًا` : ''}${s.googleCount ? `، وإجمالي التقييمات ${s.googleCount}` : ''}.</li>
      <li><b>التصنيف:</b> المواضيع تُستخرج بقاموس كلماتٍ عربيّ يعمل في المتصفح، والاتجاه يُحسَب على مستوى الجملة لا التعليق كلّه.</li>
      <li><b>الأرقام:</b> كلها محسوبةٌ برمجيًّا من التعليقات، ولا يُعيد أي نموذجٍ حسابها.</li>
      <li><b>ما لا يقوله هذا التقرير:</b> يصف <b>ما كُتب في قوقل</b> لا حقيقة المنشأة. ومن كتب غالبًا راضٍ جدًّا أو غاضب جدًّا، ومن سكت لم يُحسَب — فلا يُقاس عليه رضا العملاء كافّة.</li>
      <li><b>الخصوصية:</b> ${esc2(privacyNotice())}</li>
    </ul>
  </section>`;
}

export function buildReportHtml({ place: rawPlace, ctx = {}, markdown = '', photos = [], show = {}, font = null, identity = null, job = null, sector = null }) {
  // وضع الخصوصية يعمل على ما يخرج من يدك، ولا يمسّ أرشيفك.
  const place = shield(rawPlace);
  /* سندُ كل حكمٍ معرّفُ تعليقه، فتعليقٌ بلا معرّف يُخرج «الشواهد:» فارغة
     ويسقط وعدُ التقرير كلُّه صامتًا. والإسناد يُضمَن هنا لا يُفترَض. */
  assignReviewIds(place);
  const opt = { toc: true, stars: true, topics: true, photos: true, recency: true, entities: true, replies: true, confidence: true,
    priority: true, calc: true, voice: true, impact: true, sources: true, brief: true, coverage: true,
    actions: true, checklist: true, commit: true, drafts: true,
    cooccur: true, timing: true, promises: true, effect: true, bias: true, ...show, ...(sector?.show || {}) };
  const s = stats(place);
  const body = tocFrom(mdToHtml(markdown));
  const date = new Date().toLocaleDateString('ar-SA-u-ca-gregory-nu-latn');
  const name = esc(place.identity?.name || 'منشأة غير مسمّاة');

  const cover = `<header class="cover">
    ${coverHeader(identity)}
    ${identity?.showRabih === false ? '' : '<div class="brand">رابــح</div>'}
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
    <span>${name}${identity?.office ? ` — ${esc(identity.office)}` : (identity?.showRabih === false ? '' : ' — تقرير رابح')}</span>
    <span>${esc(date)}</span>
  </footer>
  ${footerLine(identity)}`;

  return `<!doctype html>
<html dir="rtl" lang="ar">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>تقرير ${name} — رابح</title>
<style>${fontFace(font)}${CSS}${OFFICE_CSS}${themeCss(identity)}</style>
</head>
<body>
<div class="page">
${cover}
<main class="body">
${opt.brief ? briefBlock(place, job) : ''}
${opt.toc ? body.toc : ''}
${body.html}
${opt.priority ? priorityBlock(place) : ''}
${opt.actions ? actionsBlock(place, job || {}) : ''}
${opt.commit ? commitBlock(place, job || {}) : ''}
${opt.voice ? voiceBlock(place) : ''}
${opt.effect && job?.prevJob ? effectBlock(job.prevJob, job) : ''}
${opt.promises ? promisesBlock(place) : ''}
${opt.topics ? topicsBlock(place, sector?.lead || []) : ''}
${opt.coverage ? coverageBlock(place, job || {}) : ''}
${opt.cooccur ? cooccurBlock(place) : ''}
${opt.timing ? timingBlock(place) : ''}
${opt.recency ? recencyBlock(place) : ''}
${opt.entities ? entitiesReportBlock(place) : ''}
${opt.replies ? repliesReportBlock(place) : ''}
${opt.sources ? sourcesBlock(place) : ''}
${opt.calc ? starsBlock(place, { perMonth: job?.assume?.perMonth || 0 }) : ''}
${opt.impact ? impactBlock(place, { ...(job?.assume || {}), lossRate: (Number(job?.assume?.loss) || 25) / 100 }) : ''}
${opt.photos ? photosBlock(photos) : ''}
${opt.checklist ? checklistBlock(place, job || {}) : ''}
${opt.drafts ? draftsBlock(job || {}) : ''}
<div class="appendix">
<p class="appendix-head">ملحق: كيف بُني هذا التقرير</p>
${opt.stars ? starBars(place) : ''}
${opt.bias ? biasBlock(place) : ''}
${opt.confidence ? confidenceBlock(job || { place, reportMd: markdown }) : ''}
${methodBlock(place, job, ctx)}
</div>
</main>
${footer}
</div>
</body>
</html>`;
}

/** تقرير المجموعة — نفس هوية التقرير الفردي، بجداول الفروع بدل بطاقة منشأة. */
export function buildGroupReportHtml({ brand, analysis, markdown = '', font = null, identity = null }) {
  const a = analysis;
  const date = new Date().toLocaleDateString('ar-SA-u-ca-gregory-nu-latn');
  const body = tocFrom(mdToHtml(markdown));

  const rows = a.ranking.length ? a.ranking : a.branches.map((b, i) => ({ ...b, rank: i + 1 }));
  const table = `<table><thead><tr>
      <th>#</th><th>الفرع</th><th>الحي</th><th>متوسط قوقل</th><th>التقييمات</th><th>السلبي %</th><th>ردود %</th><th>الاتجاه</th>
    </tr></thead><tbody>${
      rows.map((b) => `<tr><td>${b.rank}</td><td>${esc(b.label)}</td><td>${esc(b.district)}</td>
        <td>${b.googleAverage ?? '—'}</td><td>${b.googleCount ?? '—'}</td>
        <td>${b.negativeShare ?? '—'}</td><td>${b.replyRate ?? '—'}</td><td>${esc(b.trend)}</td></tr>`).join('')
    }</tbody></table>`;

  const list = (title, items, cls) => items.length
    ? `<section class="${cls}"><h2 class="no-count">${title}</h2><ul>${items.join('')}</ul></section>` : '';

  const shared = list('شكاوى مشتركة — مسؤولية الإدارة المركزية',
    a.shared.map((t) => `<li><b>${esc(t.name)}</b> — في ${t.branches.length} فروع: ${
      t.branches.map((x) => `${esc(x.label)} (${x.neg})`).join('، ')}</li>`), 'group-shared');

  const unique = list('شكاوى منفردة — مسؤولية إدارة الفرع',
    a.unique.map((t) => `<li><b>${esc(t.name)}</b> — ${esc(t.branches[0].label)} وحده: ${t.branches[0].neg} مرات</li>`), 'group-unique');

  return `<!doctype html>
<html dir="rtl" lang="ar">
<head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>تقرير مجموعة ${esc(brand)} — رابح</title>
<style>${fontFace(font)}${CSS}${OFFICE_CSS}${themeCss(identity)}
.group-shared ul,.group-unique ul{font-size:11pt}
.group-shared{border-inline-start:3px solid #b5462f;padding-inline-start:5mm}
.group-unique{border-inline-start:3px solid #b98b2a;padding-inline-start:5mm}
</style></head>
<body><div class="page">
<header class="cover">
  ${coverHeader(identity)}
  ${identity?.showRabih === false ? '' : '<div class="brand">رابــح</div>'}
  <h1>تقرير مجموعة<br>${esc(brand)}</h1>
  <p class="sub">قراءة موحّدة لفروع المجموعة من تقييمات العملاء في خرائط قوقل</p>
  <div class="cover-grid">
    <div><b>عدد الفروع</b><span>${a.totals.branches}</span></div>
    <div><b>المتوسط الموزون</b><span>${a.totals.weightedAverage ?? '—'} من 5</span></div>
    <div><b>إجمالي التقييمات</b><span>${a.totals.googleCount || '—'}</span></div>
    <div><b>التعليقات المُحلَّلة</b><span>${a.totals.reviews}</span></div>
    <div><b>الفجوة بين الفروع</b><span>${a.gap ? a.gap.diff : '—'}</span></div>
    <div><b>تاريخ التقرير</b><span>${esc(date)}</span></div>
  </div>
</header>
<main class="body">
${body.toc}
<section><h2 class="no-count">ترتيب الفروع</h2>${table}</section>
${shared}
${unique}
${body.html}
</main>
<footer class="foot"><span>${esc(brand)} — تقرير مجموعة من رابح</span><span>${esc(date)}</span></footer>
</div></body></html>`;
}
