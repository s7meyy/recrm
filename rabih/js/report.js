// بناء التقرير المصمَّم من التقرير النصي الموحَّد.
// لا يعتمد على أي نموذج: النصّ يدخل Markdown ويخرج صفحة A4 عربية جاهزة للطباعة/الـPDF.
// وإن أراد المستخدم تصميمًا من نموذج (الخطوة الاختيارية التاسعة) فله ذلك، وهذا هو الأساس المضمون.

import { stats, assignReviewIds } from './schema.js';
import { topicStats, topicIcon, topicColor } from './lexicon.js';
import { recentVsOlder, monthly, alerts, topicAges } from './recency.js';
import { themeCss, coverHeader, footerLine, OFFICE_CSS } from './brand.js';
import { extract as extractEntities } from './entities.js';
import { analyze as analyzeReplies } from './replies.js';
import { block as confidenceBlock } from './confidence.js';
import { priorityBlock } from './priority.js';
import { starsBlock } from './stars.js';
import { voiceBlock, cardBlock } from './voice.js';
import { impactBlock } from './impact.js';
import { LOGO } from './logo.js';
import { sourcesBlock } from './sources.js';
import { cooccurBlock } from './cooccur.js';
import { biasBlock } from './bias.js';
import { shield, notice as privacyNotice } from './privacy.js';
import { timingBlock } from './timing.js';
import { promisesBlock } from './promises.js';
import { effectBlock } from './effect.js';
import { briefBlock } from './brief.js';
import { coverageBlock } from './coverage.js';
import { actionsBlock, checklistBlock, commitBlock, draftsBlock, keepBlock, unansweredBlock, nextBlock } from './action.js';
import { selfCompareBlock, trendWithinBlock } from './compare.js';

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

/**
 * يُرقّم كل قسمٍ في الجسد ويمنحه معرّفًا، ويُرجع بنود الفهرس.
 *
 * الترقيم كان بعدّاد CSS يتخطّى كل عنوانٍ وُسم `no-count` — وهي أحدَ عشر
 * قسمًا من عشرين، متداخلةً مع المرقَّمة. فالقارئ يرى «2. أولويات» ثم قسمًا
 * بلا رقم ثم «4. صوت العميل»، فيظنّ الثالث سقط من نسخته.
 *
 * فصار الترقيم في البناء لا في التنسيق: متسلسلًا على ما يُطبَع فعلًا، ولا
 * يُخالف الفهرسَ بحال لأن كليهما من مصدرٍ واحد.
 */
function numberSections(html) {
  const items = [];
  const out = String(html).replace(/<h2(\s[^>]*)?>([\s\S]*?)<\/h2>/g, (m, attrs, inner) => {
    /* **ما لا يُعرَض رقمُه لا يستهلك رقمًا.**
       كان العنوان الموسوم `no-count` يأخذ رقمَه في البناء ثم يُخفيه التنسيق،
       فيرى القارئ 5 ثم 7 ثم 9 — ستَّ قفزاتٍ في تقريرٍ واحد — ويذكر الفهرسُ
       أرقامًا لا يجد لها أثرًا في المتن. فالعدّ يتخطّاه أصلًا. */
    if (/\bno-count\b/.test(attrs || '')) return m;
    const n = items.length + 1;
    const id = `sec${n}`;
    const title = inner.replace(/<[^>]+>/g, '').trim();
    items.push({ id, n, title });
    const cls = /class="/.test(attrs || '') ? (attrs || '').replace(/class="/, 'class="numbered ') : `${attrs || ''} class="numbered"`;
    return `<h2 id="${id}"${cls}><span class="secno">${n}</span>${inner}</h2>`;
  });
  return { html: out, items };
}

/**
 * يُسمّي كل جدولٍ باسم قسمه.
 *
 * قارئُ الشاشة يتنقّل بين الجداول تنقّلًا مستقلًّا عن النصّ، فجدولٌ بلا اسم
 * يُسمَع «جدولٌ بخمسة أعمدة» ولا يُعرَف أيُّ جدولٍ هو. وقِيس فكان سبعةٌ من
 * ثمانية بلا اسم.
 *
 * والاسمُ يُؤخَذ من عنوان القسم الذي يسبقه، فلا يُكتَب مرتين ولا يُنسى.
 */
function nameTables(html) {
  let title = '';
  return String(html).replace(/<h2[^>]*>([\s\S]*?)<\/h2>|<table(?![^>]*aria-label)/g, (m, inner) => {
    if (inner !== undefined) {
      title = inner.replace(/<span class="secno">[\s\S]*?<\/span>/g, '')
        .replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      return m;
    }
    return title ? `<table aria-label="${esc(`جدول: ${title}`)}"` : m;
  });
}

/** فهرسٌ من الأقسام المطبوعة نفسها — لا من عناوين النموذج وحدها. */
function tocOf(items) {
  if (items.length < 2) return '';
  return `<nav class="toc"><h2 class="no-count">المحتويات</h2><ol>${
    items.map((i) => `<li><span class="tn">${i.n}</span><a href="#${i.id}">${esc(i.title)}</a></li>`).join('')
  }</ol></nav>`;
}

/**
 * وسمُ العيّنة المجانية — وما لا تراه فيها.
 *
 * الراية `teaser` كانت معرَّفةً في القوالب منذ كُتبت **ولا يستعملها أحد**:
 * فتخرج العيّنة بغلافٍ وترويسةٍ وخاتمةٍ كالتقرير المدفوع سواءً بسواء، ولا
 * سطر يقول ما ينقصها. فمن يستلمها لا يعلم أن وراءها شيئًا، ولا يجد سببًا
 * ليطلب الكامل.
 *
 * والصادقُ المقنع أن تبقى بقيمتها الحقيقية — لا تُفرَّغ لتُغري — ويُقال
 * بدقّةٍ ما لا تراه فيها. فإخفاءُ النقص ليس تسويقًا، وتجويعُ العيّنة ليس
 * صدقًا. وبينهما أن تُعطي ما تُعطي، وتُسمّي ما تمنع.
 */
function teaserBlock(show) {
  const missing = [
    [!show.actions, 'خطة العمل', 'من ينفّذ كل إصلاح، وأول فعلٍ يُفعَل اليوم، ومؤشّرٌ يُقاس به — وكلفتُه ومدّته.'],
    [!show.voice, 'صوت العميل بنصّه', 'اقتباسات عملائك حرفًا بحرف مصنَّفةً بالموضوع، بمعرّفاتها لتُراجَع.'],
    [!show.impact && !show.calc, 'الأثر المالي', 'كم تكلّفك كل شكوى شهريًّا بأرقامك أنت، وما يلزم لرفع تقييمك ربعَ نجمة.'],
    [!show.checklist, 'قائمة المتابعة', 'صفحةٌ تُطبَع وتُعلَّق، فيها أول فعلٍ لكل أولوية ومربّعٌ يُؤشَّر عليه.'],
    [!show.drafts, 'مسوّدات الردود', 'ردٌّ مكتوبٌ لكل شكوى بلا ردّ، تُراجعه وتنشره.'],
    [!show.selfCompare, 'المقارنة بتقريرك السابق', 'ما تحسّن وما تراجع منذ آخر مرة — مقيسًا لا مُدَّعى.'],
  ].filter(([gone]) => gone);

  return `<section class="teaser-note">
    <p class="teaser-tag">عيّنة</p>
    <h2 class="no-count">هذه عيّنة — وما فيها صحيحٌ كامل</h2>
    <p>كلُّ رقمٍ واقتباسٍ في هذه الصفحات محسوبٌ من تعليقات عملائك كما هو في التقرير الكامل،
    ولم يُنقَص منه شيء ولم يُهوَّن. وإنما أُخرجت منه أقسامٌ بعينها، وهذه أسماؤها:</p>
    ${missing.length ? `<ul>${missing.map(([, name, what]) =>
      `<li><b>${esc(name)}</b> — ${esc(what)}</li>`).join('')}</ul>` : ''}
    <p class="fine">فإن كان ما قرأتَه هنا يصف محلَّك، فالباقي يقول لك ماذا تفعل به.</p>
  </section>`;
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
      <span class="bar-track" aria-hidden="true"><span class="bar-fill" style="width:${pct}%"></span></span>
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
  const inferred = rows.reduce((n, t) => n + (t.inferred || 0), 0);
  const judged = rows.reduce((n, t) => n + t.total, 0);

  /* **رسمٌ واحد لا رسمٌ وجدولٌ يقولان الشيء نفسه.**
     كان الجدول يُعيد الصفوف العشرة التي رسمها الشريط قبله حرفًا بحرف، فيملأ
     نصف صفحةٍ بلا زيادة معنى. فصار الصفُّ واحدًا: فيه الشريط والأرقام
     والنصيب والحكم معًا. */
  const bars = rows.map((t) => {
    const negPct = Math.round((t.neg / max) * 100);
    const posPct = Math.round((t.pos / max) * 100);
    const neuPct = Math.round((t.neu / max) * 100);
    return `<div class="topic-row${t.decided ? '' : ' faint'}">
      <span class="topic-name"><i class="ticon" style="color:${topicColor(t.id)}">${topicIcon(t.id)}</i>${esc(t.name)}</span>
      <span class="topic-track" aria-hidden="true">
        <span class="seg pos" style="width:${posPct}%"></span><span class="seg neu" style="width:${neuPct}%"></span><span class="seg neg" style="width:${negPct}%"></span>
      </span>
      <span class="topic-nums">${t.pos ? `<b class="p">${t.pos}+</b>` : ''}${t.neg ? `<b class="n">${t.neg}−</b>` : ''}</span>
      <span class="topic-count">${t.total} <small>(${t.sharePct}%)</small></span>
      <span class="topic-verdict${t.decided ? '' : ' fine'}">${esc(t.verdict)}</span>
    </div>`;
  }).join('');

  return `<section class="topics">
    <h2>المواضيع الواردة في التعليقات</h2>
    <p class="fine">مُستخرَجة آليًّا من نصوص التعليقات، لا من تقدير نموذج.</p>
    ${inferred ? `<p class="fine"><b>${inferred} من ${judged} حكمًا مستنبَطٌ لا منصوص</b>: ذُكر الموضوع في التعليق
    بلا لفظٍ يحسم رأي صاحبه فيه، فأُخذ حكمُه من نجوم التعليق كلّه. وهو أضعفُ من المنصوص، ولم يُطرَح
    لأن طرحه يُخفي ذكرًا وقع.</p>` : ''}
    <div class="legend"><span><i class="sw pos"></i>إيجابي</span><span><i class="sw neu"></i>محايد</span><span><i class="sw neg"></i>سلبي</span>
      <span class="leg-note">والنسبة نصيبُ الموضوع من عيّنتك</span></div>
    <div class="topics-chart">${bars}</div>
    ${rows.some((t) => !t.decided) ? '<p class="fine">الصفوف الباهتة ذُكرت مرةً أو مرتين، فلا يُبنى عليها حكم — وذُكرت لأنها وقعت.</p>' : ''}
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
    <h2>القراءة الزمنية</h2>
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
    <h2>الأصناف والأسماء المتكررة</h2>
    <p class="fine">مستخرجة من نصوص التعليقات مباشرة — تدلّ على ما يُذكر بعينه لا على المحاور العامة.</p>
    ${products.length ? `<table><thead><tr><th>الصنف أو العبارة</th><th>مرات</th><th>إيجابي</th><th>سلبي</th><th>الاتجاه</th></tr></thead><tbody>${products.map(row).join('')}</tbody></table>` : ''}
    ${people.length ? `<p class="fine"><b>أشخاص ذُكروا بالاسم:</b> ${people.map((p) => `${esc(p.name)} (${p.total} — ${esc(p.verdict)})`).join(' · ')}</p>` : ''}
  </section>`;
}

function repliesReportBlock(place) {
  const a = analyzeReplies(place);
  if (!a.total || (!a.replied && !a.negTotal)) return '';
  return `<section class="replies">
    <h2>تعامل المنشأة مع التعليقات</h2>
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
    <h2>صور المنشأة</h2>
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
.cover{text-align:center;padding:16mm 15mm 12mm;border-bottom:3px double var(--gold)}
.brand{font-size:13pt;letter-spacing:.3em;color:var(--navy);font-weight:700;margin:0 0 2mm}
.brand img{height:26mm;width:auto;display:block;margin:0 auto}
.cover h1{font-size:26pt;margin:6mm 0 3mm;color:var(--navy);line-height:1.4}
.cover .sub{font-size:13pt;color:var(--muted);margin:0 0 7mm}
.cover-photo{margin:0 auto 8mm;max-width:150mm}
.cover-photo img{width:100%;height:55mm;object-fit:cover;border-radius:8px;border:1px solid var(--line)}
.cover-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:3mm;max-width:170mm;margin:0 auto;text-align:right}
.cover-grid div{border:1px solid var(--line);border-radius:6px;padding:3mm 4mm}
.cover-grid b{display:block;font-size:9pt;color:var(--muted);font-weight:600;margin-bottom:1mm}
.cover-grid span{font-size:11.5pt;color:var(--navy);font-weight:700}
/* الترقيم صار في البناء لا في التنسيق (numberSections)، فالعدّاد أُلغي:
   كان يتخطّى كل عنوانٍ وُسم no-count فيَخرم التسلسل بلا أن يُرى السبب. */
.body h2{font-size:15pt;color:var(--navy);border-bottom:2px solid var(--gold);padding-bottom:2mm;margin:10mm 0 4mm;break-after:avoid}
.body h2 .secno{color:var(--gold);margin-inline-end:2mm}
.body h2 .secno::after{content:"."}
.body h2.no-count .secno{display:none}
.body h3{counter-increment:h3;font-size:12.5pt;color:#24405e;margin:6mm 0 2mm;break-after:avoid}
.body h2{counter-reset:h3}
.body h3::before{content:counter(h3) ") ";color:var(--gold);font-weight:700}
.body h4{font-size:11.5pt;color:#2c4a6b;margin:4mm 0 1mm}
p{margin:0 0 3mm;text-align:start}
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
.stats-block{margin:8mm 0}
.bars{display:flex;flex-direction:column;gap:2mm}
.bar-row{display:grid;grid-template-columns:14mm 1fr 24mm;align-items:center;gap:3mm}
.bar-label{color:var(--gold);font-weight:700;font-size:10.5pt}
.bar-track{background:#eef1f5;border-radius:3px;height:5mm;overflow:hidden}
.bar-fill{display:block;height:100%;background:linear-gradient(90deg,var(--navy),#3a6ea5)}
.bar-value{font-size:10pt;color:var(--muted);text-align:left}
.priority,.stars-calc,.voice,.impact,.sources,.cooccur,.timing,.promises,.effect,.network,.signature,.bias,.method{margin:0 0 7mm}
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
.brief{margin:0 0 9mm;border:1px solid var(--line);border-radius:10px;padding:6mm;background:#fbfcfd}
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
.spark{flex:1 1 40mm;min-width:32mm;color:var(--navy)}
.spark svg{display:block;width:100%;height:12mm}
.spark-ends{display:flex;justify-content:space-between;font-size:8pt;color:var(--muted);margin-top:.5mm}
.spark-scale{opacity:.75;letter-spacing:.02em}
.ring-of{position:absolute;inset-inline:0;bottom:-4mm;text-align:center;font-size:7.5pt;color:var(--muted);white-space:nowrap}
.ring{margin-bottom:4mm}
.ring{position:relative;width:18mm;height:18mm;flex:0 0 auto}
.ring svg{width:100%;height:100%;transform:rotate(0deg)}
.ring-val{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;line-height:1.1}
.ring-val b{font-size:10pt;color:var(--navy)}
.ring-val span{font-size:7pt;color:var(--muted)}
.brief-cards{display:grid;grid-template-columns:repeat(2,1fr);gap:3mm}
.bcard{border:1px solid var(--line);border-radius:8px;padding:4mm;background:#fff;break-inside:avoid}
.bcard b{display:block;font-size:9pt;color:var(--muted);margin-bottom:1.5mm;font-weight:600}
.bcard span{font-size:11pt;line-height:1.7}
.bcard.bad{border-inline-start:3px solid #c0392b}
.bcard.good{border-inline-start:3px solid #1e8449}
.bcard.money{border-inline-start:3px solid var(--gold)}
.bcard.goal{border-inline-start:3px solid var(--navy)}
.bcard.gain{border-inline-start:3px solid #1e8449}
.bcard.flat{border-inline-start:3px solid var(--line)}
.brief-action.urgent{background:#fdf6f5;border-inline-start:3px solid #c0392b}
.brief-action{margin:5mm 0 0;padding:5mm 6mm;border-radius:10px;background:#f3f6fa;
  font-size:11pt;line-height:1.85;border-inline-start:4px solid var(--navy)}
.brief-action>b{display:block;font-size:12pt;color:var(--navy);margin-bottom:2mm;letter-spacing:.01em}
.brief-action>p{margin:0;font-size:12pt;line-height:1.9}
.brief-action.urgent>b{color:#c0392b}
.brief-note{margin:2mm 0 0;font-size:9pt;color:var(--muted)}
/* الملحق: كيف بُني التقرير — يُؤخَّر ولا يُحذف، فالصدق يقتضي بقاءه. */
.divider{display:flex;align-items:center;gap:4mm;margin:12mm 0 8mm;break-before:auto;break-inside:avoid}
.divider::before,.divider::after{content:"";flex:1;border-top:1px solid var(--line)}
.divider span{flex:0 1 auto;font-size:9.5pt;color:var(--muted);text-align:center;line-height:1.8}
@media print{ .divider{break-before:page;margin-top:0} }
/* «في سطور» أهمُّ صفحةٍ في التقرير، وكان يبدأ في ذيل الغلاف وينكسر إلى الثانية. */
@media print{ .brief{break-before:page} }
.appendix{margin-top:12mm;padding-top:5mm;border-top:2px solid var(--line)}
.appendix-head{font-size:12pt;font-weight:700;color:var(--navy);margin:0 0 5mm}
/* خطة العمل — بطاقةٌ لكل أولوية، لا تنكسر بين صفحتين. */
.acts{display:grid;gap:4mm}
.act{border:1px solid var(--line);border-radius:8px;padding:4mm 5mm;background:#fff;break-inside:avoid}
.act-head{display:flex;gap:3mm;align-items:flex-start;margin-bottom:3mm}
.act{border-inline-start:3px solid var(--tc,var(--line))}
.act-rank{flex:0 0 auto;width:8mm;height:8mm;border-radius:50%;background:var(--navy);color:#fff;
.act-rank{background:var(--tc,var(--navy))}
.act-rank.none{background:none;color:transparent;border:1.5px dashed var(--line);width:6mm;height:6mm;font-size:0}
.teaser-note{margin:0 0 8mm;padding:5mm 6mm;border:1px solid #e0cfa0;border-radius:10px;
  background:#fdfaf2;break-inside:avoid;position:relative}
.teaser-tag{position:absolute;inset-inline-end:5mm;top:-3mm;margin:0;padding:1mm 4mm;border-radius:999px;
  background:var(--gold);color:#fff;font-size:8.5pt;font-weight:700;letter-spacing:.04em}
.teaser-note h2{font-size:13pt;border:0;padding:0;margin:0 0 3mm;color:#7a5f14}
.teaser-note p{margin:0 0 3mm;font-size:10.5pt;line-height:1.9}
.teaser-note ul{margin:0 0 3mm;padding-inline-start:5mm;font-size:10pt;line-height:1.95}
.teaser-note li b{color:var(--navy)}
.notrandom{margin:4mm 0;padding:4mm 5mm;border:1px solid #e0cfa0;border-radius:8px;background:#fdfaf2;break-inside:avoid}
.notrandom>b{display:block;font-size:10.5pt;color:#7a5f14;margin-bottom:2mm}
.notrandom p{margin:0 0 2mm;font-size:10pt;line-height:1.9}
.fixit{margin:4mm 0 0;padding:4mm 5mm;border:1px dashed var(--line);border-radius:8px;break-inside:avoid}
.fixit>b{display:block;font-size:10.5pt;color:var(--navy);margin-bottom:2mm}
.fixit p{margin:0;font-size:10pt;line-height:1.9}
/* ما ينجح، وما ينتظر ردًّا. */
.next-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(60mm,1fr));gap:4mm;margin-bottom:4mm}
.next-grid>div{border:1px solid var(--line);border-radius:8px;padding:4mm 5mm;background:#fbfcfd}
.next-grid b{display:block;color:var(--navy);margin-bottom:2mm;font-size:10.5pt}
.next-grid p,.next-grid li{font-size:10pt;line-height:1.9;margin:0}
.next-grid ul{margin:0;padding-inline-start:5mm}
.asks{padding:4mm 5mm;border-inline-start:3px solid var(--gold);background:#faf7ef;border-radius:6px}
.asks>b{display:block;margin-bottom:2mm;font-size:10.5pt;color:#7a5f14}
.asks ul{margin:0 0 2mm;padding-inline-start:5mm;font-size:10pt;line-height:1.95}
.keeps{list-style:none;margin:0;padding:0}
.keeps li{padding:3mm 4mm;margin-bottom:2mm;border-inline-start:3px solid #1e8449;background:#f5fbf7;border-radius:6px}
.keeps b{color:#14532d;margin-inline-end:2mm}
.unans{list-style:none;margin:0;padding:0}
.unans li{padding:3mm 4mm;margin-bottom:2mm;border:1px solid var(--line);border-inline-start:3px solid #c0392b;border-radius:6px;background:#fdf6f5;break-inside:avoid}
.unans p{margin:1.5mm 0 0;font-size:10pt;line-height:1.85}
.uw-stars{color:var(--gold);font-size:9pt;margin-inline:2mm}
/* الأسبوع الأول، وجدول ما يُقاس بعد شهر. */
.week{margin:3mm 0 4mm;padding:4mm 5mm;background:#f3f6fa;border-radius:8px;break-inside:avoid}
.week>b{display:block;margin-bottom:2mm;font-size:10.5pt;color:var(--navy)}
.week ol{margin:0 0 2mm;padding-inline-start:5mm;font-size:10pt;line-height:1.95}
.week .wd{display:inline-block;min-width:22mm;font-weight:700;color:var(--gold)}
.measure{margin-top:5mm}
.measure caption{caption-side:top;text-align:start;font-size:10pt;color:var(--navy);font-weight:700;margin-bottom:2mm}
.measure td.write{height:9mm;position:relative}
.measure td.write::after{content:"";position:absolute;inset-inline:3mm;bottom:2.5mm;border-bottom:1px solid var(--navy);opacity:.3}
.singles{margin-top:4mm;padding:4mm 5mm;border:1px dashed var(--line);border-radius:8px;background:#fbfcfd;break-inside:avoid}
.singles>b{display:block;font-size:10pt;color:var(--navy);margin-bottom:2mm}
.singles ul{margin:0 0 2mm;padding-inline-start:5mm;font-size:10pt;line-height:1.9}
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
.commit td.write{height:13mm;vertical-align:bottom;padding:0 3mm 2mm;position:relative}
.commit td.write::after{content:"";position:absolute;inset-inline:3mm;bottom:3mm;border-bottom:1px solid var(--navy);opacity:.35}
.commit td.write .hint{font-size:8.5pt;color:var(--muted);opacity:.7}
/* قائمة المتابعة — تُطبَع وتُعلَّق، فتبدأ صفحةً جديدة. */
.checklist{break-before:page}
.checks{list-style:none;margin:0 0 5mm;padding:0}
.checks li{display:grid;grid-template-columns:5mm 1fr auto auto;align-items:center;gap:3mm;padding:3mm 0;border-bottom:1px solid var(--line);font-size:10.5pt}
.checks .box{width:5mm;height:5mm;border:1.5px solid var(--navy);border-radius:2px}
.checks .task{min-width:0}
.checks .who{font-size:9pt;color:var(--muted);white-space:nowrap}
.checks .when{font-size:9pt;color:var(--muted);letter-spacing:.1em;white-space:nowrap}
.check-foot{display:flex;gap:5mm;padding-top:3mm}
.check-foot div{flex:1;text-align:center}
.check-foot b{display:block;font-size:8.5pt;color:var(--muted)}
.check-foot span{font-size:11pt;font-weight:700;color:var(--navy)}
/* المسوّدات بنصّها كما وُلِّدت. */
.toc ol{list-style:none;padding:0;margin:0;columns:2;column-gap:8mm}
.toc li{display:flex;gap:2mm;align-items:baseline;margin-bottom:1.5mm;font-size:10pt;break-inside:avoid}
.toc .tn{flex:0 0 auto;min-width:5mm;color:var(--gold);font-weight:700;font-size:9pt}
.toc a{color:var(--navy);text-decoration:none}
.topic-row .topic-nums{display:flex;gap:2mm;font-size:9pt;white-space:nowrap}
.topic-row .topic-nums .p{color:#1e8449}
.topic-row .topic-nums .n{color:#c0392b}
.topic-row .topic-verdict{font-size:9pt;color:var(--muted);text-align:start;white-space:nowrap}
.topic-row.faint{opacity:.62}
.legend .leg-note{color:var(--muted);font-size:8.5pt}
.ownernotes .ownernote-q{margin:2mm 0 0;padding:3mm 4mm;border-inline-start:3px solid #7a8798;background:#f4f6f8;border-radius:6px;font-size:10.5pt;line-height:1.9;white-space:pre-line}
.uw-draft{margin:2mm 0 0;padding:2.5mm 3.5mm;background:#f4f6f8;border-inline-start:3px solid var(--gold);border-radius:5px;font-size:10pt;line-height:1.8}
.lone-tag{font-size:8pt;color:#8a6d1f;background:#faf3e0;border:1px solid #ead9ab;border-radius:999px;padding:0 2mm;white-space:nowrap}
.lone-row{color:#5c6470}
.lone-row .w-fill{opacity:.45}
.msg-tie{margin:0 0 3mm;padding:3mm 4mm;border-inline-start:3px solid var(--gold);background:#faf7ef;border-radius:6px;font-size:10pt;line-height:1.85}
.ticon{font-style:normal;display:inline-block;width:5mm;color:var(--gold);font-size:11pt;text-align:center}
/* بطاقةُ النشر — ثناءُ العميل بنصّه. */
.mkt{margin:0;border:1px solid var(--line);border-radius:10px;padding:6mm;background:#fbfcfd;text-align:center}
.mkt-stars{color:var(--gold);font-size:15pt;letter-spacing:.15em;margin-bottom:3mm}
.mkt blockquote{margin:0 0 3mm;padding:0;border:0;background:none;font-size:13pt;line-height:1.9;color:var(--navy)}
.mkt figcaption{font-size:10pt;color:var(--muted)}
.mkt-foot{margin-top:4mm;padding-top:3mm;border-top:1px solid var(--line);font-size:10pt;font-weight:700;color:var(--navy)}
/* أنت مقابل نفسك. */
.sc-cols{display:grid;grid-template-columns:repeat(2,1fr);gap:4mm;margin-top:4mm}
.sc-col{border:1px solid var(--line);border-radius:8px;padding:3mm 4mm;background:#fff}
.sc-col b{display:block;font-size:9.5pt;margin-bottom:2mm;color:var(--navy)}
.sc-col.good b{color:#1e8449}
.sc-col.bad b{color:#c0392b}
.sc-col ul{margin:0;padding-inline-start:5mm;font-size:10pt;line-height:1.8}
.delta{font-weight:700;font-size:10.5pt}
.delta.up{color:#1e8449}
.delta.down{color:#c0392b}
.draft-text{white-space:pre-wrap;font-family:inherit;font-size:10pt;line-height:1.9;
  background:#fbfcfd;border:1px solid var(--line);border-radius:8px;padding:4mm 5mm;margin:0}
.voice .q{margin:0 0 3mm;padding:3mm 4mm;border-radius:6px;border-inline-start:3px solid var(--line);background:#fafbfc;break-inside:avoid}
.voice .q.neg{border-inline-start-color:#c0392b;background:#fdf6f5}
.voice .q.pos{border-inline-start-color:#1e8449;background:#f5fbf7}
.voice .q.answered{opacity:.82}
.voice .q .ans{color:#1e8449;font-weight:600}
.voice .q p{margin:0 0 2mm;font-size:10pt;line-height:1.85}
.voice .q footer{font-size:8.5pt;color:var(--muted)}
.impact .assume{padding:3mm 4mm;background:#fbfcfd;border:1px solid var(--line);border-radius:6px;margin-bottom:3mm;font-size:9.5pt}
.impact .total{font-size:11pt;margin-top:3mm}
.confidence{margin:0 0 8mm;border:1px solid var(--line);border-radius:8px;padding:5mm 6mm;background:#fbfcfd}
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
.recency{margin:8mm 0}
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
.entities,.replies{margin:8mm 0}
.topics{margin:8mm 0}
.topics-chart{display:flex;flex-direction:column;gap:2mm;margin:4mm 0}
.topic-row{display:grid;grid-template-columns:48mm 1fr 16mm 18mm 20mm;align-items:center;gap:2mm;margin-bottom:1mm}
.topic-name{font-size:10.5pt;color:var(--navy)}
.topic-track{display:flex;background:#eef1f5;border-radius:3px;height:5mm;overflow:hidden}
.topic-track .seg{display:block;height:100%}
.seg.pos{background:#2f7d55}.seg.neu{background:#b9c2ce}.seg.neg{background:#b5462f}
.topic-count{font-size:10pt;color:var(--muted);text-align:start;white-space:nowrap}
.legend{display:flex;gap:6mm;font-size:9.5pt;color:var(--muted);margin-top:2mm}
.legend span{display:flex;align-items:center;gap:1.5mm}
.legend .sw{width:3mm;height:3mm;border-radius:2px;display:inline-block}
.sw.pos{background:#2f7d55}.sw.neu{background:#b9c2ce}.sw.neg{background:#b5462f}
.photos{margin:8mm 0}
.photo-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:3mm}
.photo-grid img{width:100%;height:38mm;object-fit:cover;border-radius:6px;border:1px solid var(--line)}
figcaption{font-size:9pt;color:var(--muted);margin-top:1mm;text-align:center}
.fine{font-size:9.5pt;color:var(--muted)}
.foot{margin-top:12mm;padding-top:4mm;border-top:1px solid var(--line);font-size:9pt;color:var(--muted);display:flex;justify-content:space-between;gap:4mm}
@page{size:A4;margin:16mm 14mm}
/* ───── الهاتف ─────
   التقرير مقاسه A4 بالمليمترات، ويُفتَح على الهاتف أكثر مما يُطبَع: يصل
   بواتساب فيُقرأ على الفور. وكان يفيض عرضًا خمسة عشر بكسلًا (جداولُ من
   خمسة أعمدة في عرضٍ صافٍ لا يبلغ ٢٨٠ بكسلًا بعد هوامش الطباعة)، فيُسحَب
   يمينًا وشمالًا في كل تمرير. */
@media screen and (max-width:560px){
  .page{padding:8mm 5mm}
  /* الجدول يُمرَّر في حدّ ذاته، فلا يدفع الصفحة كلها. */
  table{display:block;overflow-x:auto;-webkit-overflow-scrolling:touch;font-size:11pt}
  th,td{white-space:nowrap}
  .cover{padding:14mm 0 8mm}
  .cover h1{font-size:19pt;margin:6mm 0 3mm}
  .cover .sub{font-size:11pt;margin-bottom:6mm}
  .cover-grid,.brief-cards,.act-grid,.sc-cols,.voice-cols,.photo-grid{grid-template-columns:1fr}
  .cover-grid{gap:2mm}
  /* البطاقة على الهاتف سطرٌ واحد: اسمٌ وقيمة، لا مربّعٌ يملأ الشاشة. */
  .cover-grid div{display:flex;justify-content:space-between;align-items:baseline;gap:3mm;padding:2.5mm 3mm}
  .cover-grid b{margin-bottom:0}
  .rec-grid{grid-template-columns:1fr}
  .brief-hero{gap:3mm}
  .brief-hero .hero-side{border-inline-start:0;padding-inline-start:0}
  .checks li{flex-wrap:wrap}
  /* ولا يُقرأ نصٌّ دون اثني عشر بكسلًا على شاشةٍ في اليد. */
  .fine,.note,small,.act-grid small,.mkt figcaption,.foot{font-size:11pt;line-height:1.85}
  .act-grid b,.cover-grid b,.bcard b,.check-foot b,.stat b,.rec-cell b{font-size:10.5pt}
  .month .mv,.month .ml{font-size:9.5pt}
  .spark-ends{font-size:9pt}
  .ring-of{font-size:8.5pt;bottom:-5mm}
  .ring-val span{font-size:8.5pt}
  .ring{width:22mm;height:22mm}
  /* صفُّ الموضوع خمسةُ أعمدة لا تسع شاشة يد: يصير سطرين — الاسمُ والحكمُ
     فوق، والشريطُ والأرقام تحت. */
  .topic-row{grid-template-columns:1fr auto;gap:1mm 2mm;margin-bottom:2.5mm}
  .topic-row .topic-name{grid-column:1}
  .topic-row .topic-verdict{grid-column:2;text-align:end}
  .topic-row .topic-track{grid-column:1;grid-row:2}
  .topic-row .topic-nums{grid-column:2;grid-row:2}
  .topic-row .topic-count{grid-column:1/-1;grid-row:3;font-size:9.5pt}
  .toc ol{columns:1}
  body{font-size:12pt}
}
/* ترويسةٌ جارية: لا تظهر على الشاشة، وتتكرّر في كل صفحةٍ مطبوعة.
   القارئ يقلّب التقرير بعد أسبوع فلا يعرف لأي فرعٍ هو ولا متى صدر. */
.running{display:none}
@media print{
  body{background:#fff}
  .page{max-width:none;margin:0;padding:0}
  .cover{padding:45mm 10mm 20mm;break-after:page}
  .toc{break-after:page}
  h2,h3,h4{break-after:avoid}
  p,li,tr{break-inside:avoid}
  a{color:inherit;text-decoration:none}
  .running{display:block;position:fixed;top:0;inset-inline:0;
    font-size:8pt;color:var(--muted);padding-bottom:2mm;border-bottom:1px solid var(--line);
    display:flex;justify-content:space-between;gap:4mm}
  .body{margin-top:8mm}
  /* **تُصان الوحدةُ الصغيرة، وتجري الحاويةُ الكبيرة.**
     كان منعُ الكسر مفروضًا على الأقسام كلها — وفيها ما يبلغ الصفحةَ طولًا
     («صوت العميل» 992 بكسلًا، «قائمة المتابعة» 1014). وحاويةٌ بهذا الطول لا
     تُصان: تُدفَع إلى صفحةٍ جديدة فتترك ما قبلها فارغًا. قِيس فبلغ الثمنُ
     خمسَ صفحاتٍ من اثنتين وعشرين — ثلاثةً وعشرين بالمئة بياضًا.
     فالصونُ لما لا ينقسم: اقتباسٌ، وبطاقةُ خطة، وصفُّ جدول، وبندُ قائمة. */
  .act,.brief,.bcard,.commit,.coverage{break-inside:avoid}
  /* والاقتباس لا يُشطَر: نصفُ شكوى في صفحةٍ ونصفُها في أخرى يُقرأ محرَّفًا. */
  blockquote,.q{break-inside:avoid}
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
 * ما أضافه المالك بنفسه — يُفصَل عن كلام العملاء ولا يُخلَط به.
 *
 * خانةُ «ملاحظاتك أنت» تدخل النموذج موصوفةً بأنها بياناتٌ موثوقة، فيبني عليها.
 * وإن لم يُقَل ذلك في التقرير عاد كلامُ المالك عن نفسه إليه بلبوس الحقيقة
 * المستخرَجة من تعليقات الناس — وهذا أخطر من خطأ في رقم، لأنه يجعل الدعوى
 * شهادةً. فيُنصّ عليه بحروفه، ويُقال إنه لم يُراجَع ولم يُؤخَذ من تعليق.
 */
function ownerNotesBlock(place) {
  const txt = String(place?.notes || '').trim();
  if (!txt) return '';
  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<section class="ownernotes">
    <h2>ما أضفتَه أنت — لا من التعليقات</h2>
    <p class="note">هذا نصُّ ما كتبتَه في خانة ملاحظات المالك، وقد دخل التحليل ليأخذه بالحسبان.
      وهو <b>قولُك عن منشأتك، لا استنتاجٌ من تعليقات عملائك</b>، ولم يُراجَع ولم يُسنَد إلى تعليق.
      فما بُني عليه في هذا التقرير يصحّ بصحّته.</p>
    <blockquote class="ownernote-q">${esc(txt).replace(/\n+/g, '<br>')}</blockquote>
  </section>`;
}

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
    priority: false, calc: true, voice: true, impact: true, sources: true, brief: true, coverage: true,
    actions: true, checklist: true, commit: true, drafts: true, selfCompare: true, card: true,
    keep: true, unanswered: true, next: true, teaser: false, ownerNotes: true,
    cooccur: true, timing: true, promises: true, effect: true, bias: true, ...(sector?.show || {}), ...show };
  const s = stats(place);
  const body = tocFrom(mdToHtml(markdown));
  const date = new Date().toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', { day: 'numeric', month: 'long', year: 'numeric' });
  const name = esc(place.identity?.name || 'منشأة غير مسمّاة');

  /* **تاريخ البيانات لا تاريخ الطبع.** التقرير يُفتَح بعد شهرين فيُقرأ كأنه
     اليوم: «متوسطك 4.2» صار 3.9 ولا شيء ينبّه. فيُذكر متى جُمعت التعليقات
     في ترويسة كل صفحة وعلى الغلاف. */
  const dataDate = (() => {
    const t = Date.parse(job?.fetchedAt || job?.createdAt || '');
    return Number.isFinite(t) ? new Date(t).toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', { day: 'numeric', month: 'long', year: 'numeric' }) : date;
  })();

  /* الغلاف كان يطبع «—» في كل حقلٍ لم يُملأ: ثلاثُ شرطاتٍ تُقرأ تقريرًا
     ناقصًا قبل قراءة سطرٍ منه. فالحقل الفارغ يُحذف، ويُملأ مكانه بما هو
     معلومٌ دائمًا: حجمُ العيّنة، والمدى الزمني الذي تغطّيه. */
  const span = monthly(place);
  const spanLabel = span.length ? `${span[0].label} — ${span[span.length - 1].label}` : '';
  const coverCells = [
    ['التصنيف', ctx.categoryName],
    ['المدينة', ctx.cityName],
    ['الحي', ctx.districtName],
    ['متوسط التقييم', (s.googleAverage ?? s.sampleAverage) === null || (s.googleAverage ?? s.sampleAverage) === undefined
      ? '' : `${s.googleAverage ?? s.sampleAverage} من 5`],
    ['عدد التقييمات', s.googleCount === null ? '' : String(s.googleCount)],
    ['التعليقات المحلَّلة', s.total ? String(s.total) : ''],
    ['الفترة المغطّاة', spanLabel],
    ['تاريخ التقرير', date],
    ['التعليقات جُمعت في', dataDate === date ? '' : dataDate],
  ].filter(([, v]) => v !== '' && v !== null && v !== undefined)
    .map(([k, v]) => `<div><b>${esc(k)}</b><span>${esc(v)}</span></div>`).join('');

  // صورةُ المنشأة على الغلاف إن رفعها المُعِدّ — وجهُ المحل أقربُ إلى صاحبه من شعارنا.
  const coverPhoto = photos.find((ph) => ph && ph.url) || null;

  const cover = `<header class="cover">
    ${coverHeader(identity)}
    ${identity?.showRabih === false ? ''
      : `<div class="brand"><img src="${LOGO}" alt="رابــح — نُحلّل تقييماتك، ونطوّر أعمالك" width="335" height="240"></div>`}
    <h1>تقرير تحليلي عن<br>${name}</h1>
    <p class="sub">مبنيّ على تقييمات وتعليقات العملاء المنشورة في خرائط قوقل</p>
    ${coverPhoto ? `<div class="cover-photo"><img src="${esc(coverPhoto.url)}" alt=""></div>` : ''}
    <div class="cover-grid">${coverCells}</div>
  </header>`;

  const footer = `<footer class="foot">
    <span>${name}${identity?.office ? ` — ${esc(identity.office)}` : (identity?.showRabih === false ? '' : ' — تقرير رابح')}</span>
    <span>تعليقاتٌ جُمعت في ${esc(dataDate)} · صدر في ${esc(date)}</span>
  </footer>
  ${footerLine(identity)}`;

  /* **الجسدُ يُجمَّع أولًا، ثم يُرقَّم ويُفهرَس مما فيه فعلًا.**
     كان الفهرس يُبنى من عناوين النموذج وحدها، فيُخرج بندًا واحدًا («تحليل»)
     ويُسمّى «المحتويات» وفي التقرير عشرون قسمًا. وكان الترقيم يقع على تسعةٍ
     منها دون أحدَ عشر، متداخلةً، فيرى القارئ 2 ثم 4 فيظنّ قسمًا سقط. */
  const sectionsRaw = [
    body.html,
    opt.priority ? priorityBlock(place) : '',
    opt.actions ? actionsBlock(place, job || {}) : '',
    opt.unanswered ? unansweredBlock(place, job || {}) : '',
    opt.keep ? keepBlock(place) : '',
    opt.commit ? commitBlock(place, job || {}) : '',
    opt.selfCompare ? (job?.prevJob ? selfCompareBlock(job.prevJob, job) : trendWithinBlock(place)) : '',
    opt.effect && job?.prevJob ? effectBlock(job.prevJob, job) : '',
    opt.promises ? promisesBlock(place) : '',
    /* **فاصلٌ بين ما يُعمَل به وما يُرجَع إليه.**
       ثمانيةَ عشرَ قسمًا متساويةً في الوزن البصري، فلا يعرف القارئ أين ينتهي
       ما يلزمه ويبدأ ما يُراجعه عند الحاجة — فيقرأ الكلَّ أو لا يقرأ شيئًا. */
    `<div class="divider"><span>ما سبق هو ما تعمل به. وما يلي تفصيلُه ودليلُه — يُرجَع إليه عند الحاجة.</span></div>`,
    opt.voice ? voiceBlock(place) : '',
    opt.card ? cardBlock(place) : '',
    opt.ownerNotes ? ownerNotesBlock(place) : '',
    opt.topics ? topicsBlock(place, sector?.lead || []) : '',
    opt.coverage ? coverageBlock(place, job || {}) : '',
    opt.cooccur ? cooccurBlock(place) : '',
    opt.timing ? timingBlock(place) : '',
    opt.recency ? recencyBlock(place) : '',
    opt.entities ? entitiesReportBlock(place) : '',
    opt.replies ? repliesReportBlock(place) : '',
    opt.sources ? sourcesBlock(place) : '',
    opt.calc ? starsBlock(place, { perMonth: job?.assume?.perMonth || 0 }) : '',
    /* **الأثرُ الماليّ لا يُدرَج بالسكوت.** هو مبنيٌّ على فرضِ المالك — متوسطُ
       فاتورته وعددُ عملائه وكم من الشاكين لا يعود — وهذه ثلاثةُ ظنونٍ يضربها
       بعضُها في بعض. والرقمُ الخارجُ منها يُقرأ عند مَن يُسلَّم إليه التقرير
       قياسًا من التعليقات لا فرضًا، فيُبنى عليه قرارُ إنفاق. فلا يظهر إلا
       بقرارٍ صريحٍ من صاحبه: `assume.show`. */
    opt.impact && job?.assume?.show ? impactBlock(place, { ...(job?.assume || {}), lossRate: (Number(job?.assume?.loss) || 25) / 100 }) : '',
    opt.photos ? photosBlock(photos) : '',
    opt.checklist ? checklistBlock(place, job || {}) : '',
    opt.next ? nextBlock(place, job || {}) : '',
    opt.drafts ? draftsBlock(job || {}) : '',
  ].filter(Boolean).join('\n');

  const appendix = [
    opt.stars ? starBars(place) : '',
    opt.bias ? biasBlock(place) : '',
    opt.confidence ? confidenceBlock(job?.place ? job : { place, reportMd: markdown }) : '',
    methodBlock(place, job, ctx),
  ].filter(Boolean).join('\n');

  const numbered = numberSections(sectionsRaw);
  const sections = nameTables(numbered.html)
    + `<div class="appendix"><p class="appendix-head">ملحق: كيف بُني هذا التقرير</p>
       <p class="fine">ما بعد هذا الخط مرجعٌ يُراجَع عند الحاجة، لا قراءةٌ تُتابَع: كيف قيست الأرقام وما حدودها.</p>
       ${appendix}</div>`;
  const toc = opt.toc ? tocOf(numbered.items) : '';

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
<div class="running"><span>${name}${identity?.office ? ` — ${esc(identity.office)}` : ''}</span><span>بيانات ${esc(dataDate)} · ${esc(date)}</span></div>
${cover}
<main class="body">
${opt.brief ? briefBlock(place, job) : ''}
${opt.teaser ? teaserBlock(opt) : ''}
${toc}
${sections}
</main>
${footer}
</div>
</body>
</html>`;
}

/** تقرير المجموعة — نفس هوية التقرير الفردي، بجداول الفروع بدل بطاقة منشأة. */
export function buildGroupReportHtml({ brand, analysis, markdown = '', font = null, identity = null }) {
  const a = analysis;
  const date = new Date().toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', { day: 'numeric', month: 'long', year: 'numeric' });
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
    ? `<section class="${cls}"><h2>${title}</h2><ul>${items.join('')}</ul></section>` : '';

  const shared = list('شكاوى مشتركة — مسؤولية الإدارة المركزية',
    a.shared.map((t) => `<li><b>${esc(t.name)}</b> — في ${t.branches.length} فروع: ${
      t.branches.map((x) => `${esc(x.label)} (${x.neg})`).join('، ')}</li>`), 'group-shared');

  const unique = list('شكاوى منفردة — مسؤولية إدارة الفرع',
    a.unique.map((t) => `<li><b>${esc(t.name)}</b> — ${esc(t.branches[0].label)} وحده: ${t.branches[0].neg} مرات</li>`), 'group-unique');

  /* تقرير المجموعة كان على الحال التي أُصلحت في التقرير الفردي: فهرسٌ يُبنى
     من عناوين النموذج وحدها فلا يذكر «ترتيب الفروع» وهو أول أقسامه، وأقسامٌ
     بلا ترقيم. فيُعامَل بما عومل به — والمصدرُ واحد فلا يختلفان. */
  const groupRaw = [
    `<section><h2>ترتيب الفروع</h2>${table}</section>`,
    shared,
    unique,
    body.html,
  ].filter(Boolean).join('\n');
  const groupNumbered = numberSections(groupRaw);
  const groupSections = nameTables(groupNumbered.html);
  const groupToc = tocOf(groupNumbered.items);

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
  ${identity?.showRabih === false ? ''
    : `<div class="brand"><img src="${LOGO}" alt="رابــح — نُحلّل تقييماتك، ونطوّر أعمالك" width="335" height="240"></div>`}
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
${groupToc}
${groupSections}
</main>
<footer class="foot"><span>${esc(brand)} — تقرير مجموعة من رابح</span><span>${esc(date)}</span></footer>
</div></body></html>`;
}
