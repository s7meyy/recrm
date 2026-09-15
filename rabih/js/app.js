// رابح — منطق الواجهة. ES modules خالصة، بلا مكتبات ولا أداة بناء.

import { REGIONS, CITIES, citiesOfRegion, cityById, regionById } from './data/cities.js';
import { CATEGORY_GROUPS, ALL_CATEGORIES, categoryById } from './data/categories.js';
import { districtsOf, addDistrict } from './data/districts.js';
import { parseMapsUrl, asciiName } from './maps.js';
import { emptyPlace, assignReviewIds, validate, stats } from './schema.js';
import { parseReviews, parseHeader } from './parse.js';
import { STEPS, STAGE_NAMES, MODEL_PICKS } from './prompts.js';
import { buildReportHtml } from './report.js';
import { topicStats, topComplaints, uncovered } from './lexicon.js';
import { verify } from './verify.js';
import { scan, withoutFlagged, FLAGS } from './anomaly.js';
import { comparablePlaces, timeline, competitors, benchmark } from './compare.js';
import { extractTasks, mergeTasks, progress, planMarkdown, defaultDue, STATUS } from './plan.js';
import { TEMPLATES, DEFAULT_TEMPLATE, applyTemplate, droppedSections } from './templates.js';
import { buildXlsx, jobSheets, archiveSheet } from './export.js';
import { recentVsOlder, monthly, alerts as recencyAlerts, topicAges } from './recency.js';
import * as safe from './persist.js';
import { brands, analyze, groupPrompt } from './group.js';
import { buildGroupReportHtml } from './report.js';
import { CHARTER } from './prompts.js';
import * as identity from './brand.js';
import * as lock from './lock.js';
import * as queue from './queue.js';
import { build as buildMessage, subject as messageSubject, situationLabel } from './messages.js';
import { audit, fixPrompt } from './completeness.js';
import { extract as extractEntities } from './entities.js';
import { analyze as analyzeReplies } from './replies.js';
import { internalBenchmark } from './compare.js';
import * as models from './models.js';
import { TOPICS, addKeyword, removeKeyword, customKeywords, resetCustom } from './lexicon.js';
import { newId, saveJob, getJob, allJobs, deleteJob, buildTree, jobPath } from './store.js';

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const el = (tag, cls, html) => { const n = document.createElement(tag); if (cls) n.className = cls; if (html !== undefined) n.innerHTML = html; return n; };

const LAST_JOB = 'rabih:last-job';
const VIEWS = ['new', 'data', 'pipeline', 'report', 'compare', 'archive', 'settings', 'about'];

let job = null;
let dirty = false;
// حالة فتح خطوات خط التحليل: تبقى كما تركها المستخدم عبر إعادات الرسم،
// وإلا انطوت الخطوة تحت يده لحظة انتقاله من مربع الإجابة.
const stepOpen = new Map();

/* ───────────────────────── أدوات عامة ───────────────────────── */

let toastTimer = null;
function toast(text) {
  const t = $('#toast');
  t.textContent = text;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
}

function message(host, kind, title, items = []) {
  const box = typeof host === 'string' ? $(host) : host;
  if (!box) return;
  if (!title && !items.length) { box.innerHTML = ''; return; }
  box.innerHTML = `<div class="msg ${kind}"><b>${title}</b>${
    items.length ? `<ul>${items.map((i) => `<li>${i}</li>`).join('')}</ul>` : ''
  }</div>`;
}

function download(filename, content, type = 'text/plain;charset=utf-8') {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

async function copy(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch {
    const ta = el('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    return ok;
  }
}

/* ───────────────────────── الحالة ───────────────────────── */

function blankJob() {
  return {
    id: newId(),
    ctx: { regionId: '', regionName: '', cityId: '', cityName: '', groupId: '', categoryId: '', categoryName: '', districtName: '', brand: '', branch: '' },
    mapsUrl: '',
    place: emptyPlace(),
    out: {},
    reportMd: '',
    photos: [],
    plan: [],
    planInReport: false,
    models: {},
    template: DEFAULT_TEMPLATE,
    font: null,          // { name, dataUrl } خط عربي يرفعه المستخدم
  };
}

async function persist() {
  if (!job) return;
  await saveJob(job);
  try { localStorage.setItem(LAST_JOB, job.id); } catch { /* تجاهل */ }
  dirty = false;
}

const scheduleSave = (() => {
  let timer = null;
  return () => {
    dirty = true;
    clearTimeout(timer);
    timer = setTimeout(() => persist().catch(() => {}), 600);
  };
})();

/* ───────────────────────── التنقل ───────────────────────── */

function show(view) {
  for (const v of VIEWS) {
    const node = $(`#view-${v}`);
    if (node) node.hidden = v !== view;
  }
  $$('.topbar nav button').forEach((b) => {
    b.setAttribute('aria-current', String(b.dataset.go === view || (view === 'data' && b.dataset.go === 'new') || (view === 'pipeline' && b.dataset.go === 'new') || (view === 'report' && b.dataset.go === 'new')));
  });
  renderStepsBar(view);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

const STEP_LABELS = [
  { key: 'new',      n: '١', t: 'المنشأة' },
  { key: 'data',     n: '٢', t: 'البيانات' },
  { key: 'pipeline', n: '٣', t: 'خط التحليل' },
  { key: 'report',   n: '٤', t: 'التقرير' },
];

function renderStepsBar(view) {
  const done = {
    new: !!job?.ctx?.cityId,
    data: (job?.place?.reviews?.length || 0) > 0,
    pipeline: !!job?.out?.am,
    report: !!job?.reportMd,
  };
  const idx = STEP_LABELS.findIndex((s) => s.key === view);
  const html = STEP_LABELS.map((s, i) => {
    const cls = i === idx ? 'active' : (done[s.key] ? 'done' : '');
    return `<div class="pill ${cls}"><b>${done[s.key] && i !== idx ? '✓' : s.n}</b>${s.t}</div>`;
  }).join('');
  ['#steps-bar', '#steps-bar-2', '#steps-bar-3', '#steps-bar-4'].forEach((sel) => {
    const n = $(sel); if (n) n.innerHTML = html;
  });
}

/* ───────────────────────── ١) شاشة الإدخال ───────────────────────── */

function fillRegions() {
  const sel = $('#f-region');
  sel.innerHTML = '<option value="">— اختر المنطقة —</option>' +
    REGIONS.map((r) => `<option value="${r.id}">${r.name}</option>`).join('');
}

function fillCities(regionId, selected = '') {
  const sel = $('#f-city');
  const list = regionId ? citiesOfRegion(regionId) : CITIES;
  sel.innerHTML = '<option value="">— اختر المدينة —</option>' +
    list.map((c) => `<option value="${c.id}"${c.id === selected ? ' selected' : ''}>${c.name}</option>`).join('');
}

function fillGroups() {
  $('#f-group').innerHTML = '<option value="">— اختر المجال —</option>' +
    CATEGORY_GROUPS.map((g) => `<option value="${g.id}">${g.name}</option>`).join('');
}

function fillCategories(groupId, selected = '') {
  const sel = $('#f-category');
  const list = groupId ? (CATEGORY_GROUPS.find((g) => g.id === groupId)?.items || []) : ALL_CATEGORIES;
  sel.innerHTML = '<option value="">— اختر التصنيف —</option>' +
    list.map((c) => `<option value="${c.id}"${c.id === selected ? ' selected' : ''}>${c.name}</option>`).join('');
}

function fillDistricts(cityId, selected = '') {
  const sel = $('#f-district');
  const list = cityId ? districtsOf(cityId) : [];
  sel.innerHTML = '<option value="">— اختر الحي —</option>' +
    list.map((d) => `<option value="${d}"${d === selected ? ' selected' : ''}>${d}</option>`).join('');
  if (cityId && !list.length) {
    sel.innerHTML = '<option value="">— لا أحياء مسجّلة، أضف حيًّا —</option>';
  }
}

function bindNewView() {
  fillRegions(); fillCities(''); fillGroups(); fillCategories(''); fillDistricts('');

  $('#f-region').addEventListener('change', (e) => { fillCities(e.target.value); fillDistricts(''); });
  $('#f-city').addEventListener('change', (e) => fillDistricts(e.target.value));
  $('#f-group').addEventListener('change', (e) => fillCategories(e.target.value));

  // التحقق أثناء الكتابة لا عند مغادرة الحقل: كي لا تظهر الرسالة فتزيح زر «ابدأ» لحظة الضغط عليه.
  let urlTimer = null;
  $('#f-url').addEventListener('input', () => {
    clearTimeout(urlTimer);
    urlTimer = setTimeout(() => {
      const v = $('#f-url').value.trim();
      if (!v) { message('#new-msg', 'ok', ''); return; }
      const r = parseMapsUrl(v);
      if (!r.ok) message('#new-msg', 'err', r.reason);
      else if (r.short) message('#new-msg', 'warn', r.reason);
      else message('#new-msg', 'ok', `الرابط صالح${r.data.name ? ` — المنشأة: ${r.data.name}` : ''}.`);
    }, 400);
  });

  $('#btn-add-district').addEventListener('click', () => {
    const cityId = $('#f-city').value;
    if (!cityId) { toast('اختر المدينة أولًا'); return; }
    const name = prompt('اسم الحي الجديد:');
    if (!name) return;
    if (addDistrict(cityId, name)) { fillDistricts(cityId, name.trim()); toast('أُضيف الحي'); }
    else { toast('الحي موجود أصلًا أو الاسم فارغ'); }
  });

  fillBrandList();
  $('#btn-start').addEventListener('click', onStart);
  $('#f-url').addEventListener('keydown', (e) => { if (e.key === 'Enter') onStart(); });
}

/** يقترح العلامات المسجَّلة سابقًا كي تتّحد التسمية فتُجمَع الفروع. */
async function fillBrandList() {
  try {
    const jobs = await allJobs();
    const names = [...new Set(jobs.map((j) => (j.ctx?.brand || '').trim()).filter(Boolean))];
    $('#brand-list').innerHTML = names.map((n) => `<option value="${n}"></option>`).join('');
  } catch { /* لا يمنع التشغيل */ }
}

async function onStart() {
  const url = $('#f-url').value.trim();
  const regionId = $('#f-region').value;
  const cityId = $('#f-city').value;
  const categoryId = $('#f-category').value;
  const districtName = $('#f-district').value;

  const errors = [];
  if (!url) errors.push('رابط قوقل مابز مطلوب.');
  else { const r = parseMapsUrl(url); if (!r.ok) errors.push(r.reason); }
  if (!cityId) errors.push('اختر المدينة.');
  if (!categoryId) errors.push('اختر التصنيف.');
  if (!districtName) errors.push('اختر الحي أو أضفه.');

  if (errors.length) { message('#new-msg', 'err', 'أكمل ما يلي قبل البدء:', errors); return; }

  const parsed = parseMapsUrl(url);
  const city = cityById(cityId);
  const cat = categoryById(categoryId);
  const region = regionById(regionId || city?.region);

  if (!job || job.out?.am || job.place?.reviews?.length) job = blankJob();

  job.mapsUrl = url;
  job.ctx = {
    regionId: region?.id || '', regionName: region?.name || '',
    cityId, cityName: city?.name || '',
    groupId: cat?.group || '', categoryId, categoryName: cat?.name || '',
    districtName,
    brand: $('#f-brand').value.trim(),
    branch: $('#f-branch').value.trim(),
  };
  job.place.mapsUrl = url;
  job.place.placeId = parsed.data?.placeId || '';
  if (parsed.data?.coords) job.place.identity.coords = parsed.data.coords;
  if (parsed.data?.name && !job.place.identity.name) job.place.identity.name = parsed.data.name;
  if (cat && !job.place.identity.category) job.place.identity.category = cat.name;

  await persist();
  loadDataView();
  show('data');
  toast('ابدأ بلصق التعليقات');
}

/* ───────────────────────── ٢) شاشة البيانات ───────────────────────── */

const DATA_FIELDS = {
  '#d-name':    (p, v) => { p.identity.name = v; },
  '#d-cat':     (p, v) => { p.identity.category = v; },
  '#d-address': (p, v) => { p.identity.address = v; },
  '#d-phone':   (p, v) => { p.identity.phone = v; },
  '#d-price':   (p, v) => { p.identity.priceLevel = v; },
  '#d-avg':     (p, v) => { p.ratings.average = v === '' ? null : Number(v); },
  '#d-count':   (p, v) => { p.ratings.count = v === '' ? null : parseInt(v, 10); },
  '#d-hours':   (p, v) => { p.identity.hours = v.split('\n').map((s) => s.trim()).filter(Boolean); },
  '#d-attrs':   (p, v) => { p.identity.attributes = v.split('\n').map((s) => s.trim()).filter(Boolean); },
  '#d-notes':   (p, v) => { p.notes = v; },
};

function loadDataView() {
  const p = job.place;
  $('#d-name').value = p.identity.name || '';
  $('#d-cat').value = p.identity.category || '';
  $('#d-address').value = p.identity.address || '';
  $('#d-phone').value = p.identity.phone || '';
  $('#d-price').value = p.identity.priceLevel || '';
  $('#d-avg').value = p.ratings.average ?? '';
  $('#d-count').value = p.ratings.count ?? '';
  $('#d-hours').value = (p.identity.hours || []).join('\n');
  $('#d-attrs').value = (p.identity.attributes || []).join('\n');
  $('#d-notes').value = p.notes || '';
  $('#d-reviews').value = job.rawPaste || '';
  renderParseStats();
  renderRecency();
  renderTopics();
  renderEntities();
  renderReplies();
  renderAnomaly();
  renderPhotoChips();
}

function bindDataView() {
  for (const [sel, setter] of Object.entries(DATA_FIELDS)) {
    $(sel).addEventListener('input', (e) => { setter(job.place, e.target.value); scheduleSave(); });
  }

  $('#d-reviews').addEventListener('input', (e) => { job.rawPaste = e.target.value; scheduleSave(); });
  $('#d-reviews').addEventListener('paste', () => setTimeout(doParse, 50));
  $('#btn-parse').addEventListener('click', doParse);
  $('#btn-clear-reviews').addEventListener('click', () => {
    if (!confirm('مسح التعليقات الملصوقة وما استُخرج منها؟')) return;
    $('#d-reviews').value = '';
    job.rawPaste = '';
    job.place.reviews = [];
    renderParseStats();
    message('#parse-msg', 'ok', '');
    scheduleSave();
  });

  $('#d-photos').addEventListener('change', onPhotos);
  $('#btn-to-pipeline').addEventListener('click', () => {
    const v = validate(job.place);
    if (!v.ok) { message('#parse-msg', 'err', 'لا يمكن المتابعة:', v.errors); return; }
    if (v.warnings.length) message('#parse-msg', 'warn', 'تنبيهات (لا تمنع المتابعة):', v.warnings);
    renderPipeline();
    show('pipeline');
  });
}

function doParse() {
  const raw = $('#d-reviews').value;
  job.rawPaste = raw;
  if (!raw.trim()) { message('#parse-msg', 'warn', 'المربع فارغ.'); return; }

  const { reviews, format } = parseReviews(raw);
  if (!reviews.length) {
    message('#parse-msg', 'err', 'لم يُتعرَّف على أي تعليق.', [
      'تأكد أن اللصق يتضمّن النجوم أو التقييم الرقمي.',
      'أو استعمل الصيغة الصريحة: 5 | الاسم | قبل شهر ثم النص ثم سطر ---',
    ]);
    return;
  }

  job.place.reviews = reviews;
  assignReviewIds(job.place);

  // إن لُصقت بطاقة المنشأة مع التعليقات، استفد منها دون أن تدهس ما أدخله المستخدم.
  const head = parseHeader(raw.split('\n').slice(0, 8).join('\n'));
  if (head.average && job.place.ratings.average === null) { job.place.ratings.average = head.average; $('#d-avg').value = head.average; }
  if (head.count && job.place.ratings.count === null) { job.place.ratings.count = head.count; $('#d-count').value = head.count; }

  const names = { json: 'JSON', structured: 'الصيغة الصريحة', loose: 'اللصق الخام' };
  $('#parse-info').textContent = `${names[format]} — ${reviews.length} تعليقًا`;
  $('#parse-info').className = 'badge ok';

  const v = validate(job.place);
  if (v.warnings.length) message('#parse-msg', 'warn', `استُخرج ${reviews.length} تعليقًا. تنبيهات:`, v.warnings);
  else message('#parse-msg', 'ok', `استُخرج ${reviews.length} تعليقًا بنجاح.`);

  renderParseStats();
  renderRecency();
  renderTopics();
  renderEntities();
  renderReplies();
  renderAnomaly();
  scheduleSave();
}

/** المواضيع المرصودة آليًّا — تريك المشكلة قبل تشغيل أي نموذج. */
function renderTopics() {
  const box = $('#topics-box');
  if (!box) return;
  const rows = topicStats(job.place);
  if (!rows.length) { box.innerHTML = ''; return; }

  const max = Math.max(...rows.map((r) => r.total), 1);
  const bars = rows.map((t) => {
    const w = (n) => Math.round((n / max) * 100);
    return `<div class="topic-row">
      <span class="topic-name" title="${t.ids.join('، ')}">${t.name}</span>
      <span class="topic-track"><span class="seg pos" style="width:${w(t.pos)}%"></span><span class="seg neu" style="width:${w(t.neu)}%"></span><span class="seg neg" style="width:${w(t.neg)}%"></span></span>
      <span class="topic-count">${t.total}</span>
    </div>`;
  }).join('');

  const miss = uncovered(job.place);
  const worst = topComplaints(job.place, 3);
  box.innerHTML = `
    <div class="legend"><span><i class="sw pos"></i>إيجابي</span><span><i class="sw neu"></i>محايد</span><span><i class="sw neg"></i>سلبي</span></div>
    <div class="topics-chart">${bars}</div>
    ${worst.length ? `<p class="fine">أبرز الشكاوى: ${worst.map((t) => `<b>${t.name}</b> (${t.neg})`).join(' · ')}</p>` : ''}
    ${miss.length ? `<p class="fine">لم يصنّف القاموس ${miss.length} تعليقًا (${miss.join('، ')}) — اقرأها بنفسك، فقد ينقص القاموس لا التعليق.</p>` : ''}`;
}

/** القراءة الزمنية — متوسطٌ عامٌّ قد يخفي انحدارًا حديثًا. */
function renderRecency() {
  const box = $('#recency-box');
  if (!box) return;
  if (!job.place.reviews.length) { box.innerHTML = ''; return; }

  const r = recentVsOlder(job.place);
  if (!r.recent.n && !r.older.n) {
    box.innerHTML = '<p class="fine">لا تواريخ مفهومة في التعليقات — القراءة الزمنية متعذّرة.</p>';
    return;
  }

  const warn = recencyAlerts(job.place);
  const months = monthly(job.place);
  const max = Math.max(...months.map((m) => m.n), 1);
  const cls = r.verdict === 'انحدار' ? 'down' : (r.verdict === 'تحسّن' ? 'up' : '');

  const chart = months.length >= 3 ? `<div class="months">${
    months.map((m) => {
      const h = Math.max(8, Math.round((m.n / max) * 100));
      const tone = m.avg === null ? '' : (m.avg >= 4 ? 'up' : (m.avg <= 2.5 ? 'down' : 'mid'));
      return `<div class="month" title="${m.label}: ${m.n} تعليقًا، متوسط ${m.avg ?? '—'}">
        <span class="mv">${m.avg ?? '—'}</span><span class="bar ${tone}" style="height:${h}%"></span><span class="ml">${m.label}</span></div>`;
    }).join('')}</div>` : '';

  const ages = topicAges(job.place).filter((t) => t.state === 'ناشئة' || t.state === 'متفاقمة');

  box.innerHTML = `
    <div class="stat-grid">
      <div class="stat"><b>آخر ${r.window} يومًا</b><span>${r.recent.avg ?? '—'}</span><div class="fine">${r.recent.n} تعليقًا${r.recent.neg !== null ? ` · سلبي ${r.recent.neg}%` : ''}</div></div>
      <div class="stat"><b>ما قبلها</b><span>${r.older.avg ?? '—'}</span><div class="fine">${r.older.n} تعليقًا${r.older.neg !== null ? ` · سلبي ${r.older.neg}%` : ''}</div></div>
      <div class="stat ${cls}"><b>الحكم</b><span>${r.verdict}</span><div class="fine">${r.diff !== null ? `فرق ${r.diff}` : 'العيّنة الزمنية غير كافية'}</div></div>
    </div>
    ${chart}
    ${warn.length ? `<div class="msg ${r.verdict === 'انحدار' ? 'err' : 'warn'}"><b>إنذارات زمنية</b><ul>${warn.map((a) => `<li>${a}</li>`).join('')}</ul></div>` : ''}
    ${ages.length ? `<p class="fine">شكاوى نشطة: ${ages.map((t) => `<b>${t.name}</b> (${t.state})`).join(' · ')}</p>` : ''}`;
}

/** الأصناف والأسماء المتكررة — ما يُذكر بعينه لا المحاور العامة. */
function renderEntities() {
  const box = $('#entities-box');
  if (!box) return;
  const { people, products } = extractEntities(job.place);
  if (!people.length && !products.length) { box.innerHTML = ''; return; }
  const chip = (e) => {
    const cls = e.verdict === 'سلبي' ? 'neg' : (e.verdict === 'إيجابي' ? 'pos' : '');
    return `<span class="chip ent ${cls}" title="${e.ids.join('، ')}">${e.name} <b>${e.total}</b></span>`;
  };
  box.innerHTML = `
    ${products.length ? `<p class="fine">أصناف وعبارات متكررة:</p><div class="chips">${products.map(chip).join('')}</div>` : ''}
    ${people.length ? `<p class="fine">أشخاص ذُكروا بالاسم:</p><div class="chips">${people.map(chip).join('')}</div>` : ''}`;
}

/** تعامل المنشأة مع التعليقات. */
function renderReplies() {
  const box = $('#replies-box');
  if (!box) return;
  const a = analyzeReplies(job.place);
  if (!a.total) { box.innerHTML = ''; return; }
  box.innerHTML = `
    <div class="stat-grid">
      <div class="stat"><b>نسبة الرد</b><span>${a.rate ?? '—'}%</span><div class="fine">${a.replied} من ${a.total}</div></div>
      <div class="stat ${a.negRate !== null && a.negRate < 50 ? 'down' : ''}"><b>الرد على الشكاوى</b><span>${a.negRate ?? '—'}%</span><div class="fine">${a.negReplied} من ${a.negTotal}</div></div>
      <div class="stat"><b>طول الرد</b><span>${a.avgLength}</span><div class="fine">حرفًا في المتوسط</div></div>
    </div>
    ${a.findings.length ? `<div class="msg ${a.level === 'err' ? 'err' : 'warn'}"><b>تعامل المنشأة مع التعليقات</b><ul>${a.findings.map((f) => `<li>${f}</li>`).join('')}</ul></div>` : '<div class="msg ok"><b>الردود سليمة: نسبة معقولة ومعالجة لا اعتذارًا مجرّدًا.</b></div>'}
    ${a.unanswered.length ? `<p class="fine">شكاوى بلا ردّ: ${a.unanswered.map((i) => `<span class="rid">${i}</span>`).join('، ')}</p>` : ''}`;
}

/** كاشف التعليقات المشبوهة — يرفع إشارة ولا يحذف شيئًا من تلقاء نفسه. */
function renderAnomaly() {
  const box = $('#anomaly-box');
  if (!box) return;
  const r = scan(job.place);
  if (!job.place.reviews.length) { box.innerHTML = ''; return; }

  if (r.level === 'ok') { box.innerHTML = `<div class="msg ok"><b>${r.summary}</b></div>`; return; }

  const rows = r.flagged.slice(0, 12).map((f) => {
    const rev = job.place.reviews.find((x) => x.id === f.id);
    const labels = f.flags.map((k) => FLAGS[k].label).join('، ');
    return `<tr><td><span class="rid">${f.id}</span></td><td>${f.score}</td><td>${labels}</td>
      <td class="snip">${(rev?.text || '(بلا نص)').slice(0, 70)}</td></tr>`;
  }).join('');

  box.innerHTML = `
    <div class="msg ${r.level === 'err' ? 'err' : 'warn'}"><b>${r.summary}</b></div>
    ${r.clusters.length ? `<p class="fine">نصوص متشابهة: ${r.clusters.map((c) => c.ids.join(' ≈ ')).join(' · ')}</p>` : ''}
    <div class="table-wrap"><table class="mini"><thead><tr><th>التعليق</th><th>الدرجة</th><th>الإشارات</th><th>مقتطف</th></tr></thead><tbody>${rows}</tbody></table></div>
    <div class="row"><button type="button" class="btn ghost sm" id="btn-drop-flagged">استبعاد ما درجته ٣ فأعلى</button>
    <span class="fine">الاستبعاد قرارك أنت؛ لا يُحذف شيء تلقائيًّا.</span></div>`;

  const btn = $('#btn-drop-flagged');
  if (btn) btn.addEventListener('click', () => {
    const before = job.place.reviews.length;
    const cleaned = withoutFlagged(job.place, 3);
    const removed = before - cleaned.reviews.length;
    if (!removed) { toast('لا تعليق يبلغ هذه الدرجة'); return; }
    if (!confirm(`استبعاد ${removed} تعليقًا من التحليل؟ يبقى اللصق الأصلي كما هو.`)) return;
    job.place.reviews = cleaned.reviews;
    renderParseStats(); renderRecency(); renderTopics(); renderEntities(); renderReplies(); renderAnomaly();
    scheduleSave();
    toast(`استُبعد ${removed} تعليقًا`);
  });
}

function renderParseStats() {
  const box = $('#parse-stats');
  const s = stats(job.place);
  if (!s.total) { box.hidden = true; return; }
  box.hidden = false;
  const cells = [
    ['التعليقات', s.total],
    ['متوسط العيّنة', s.sampleAverage ?? '—'],
    ['إيجابي', s.positive],
    ['محايد', s.neutral],
    ['سلبي', s.negative],
    ['ردود المالك', s.replyRate !== null ? s.replyRate + '%' : '—'],
    ['نسبة العيّنة', s.coverage !== null ? s.coverage + '%' : '—'],
  ];
  box.innerHTML = cells.map(([k, v]) => `<div class="stat"><b>${k}</b><span>${v}</span></div>`).join('');
  renderStepsBar('data');
}

function onPhotos(e) {
  const files = [...(e.target.files || [])].slice(0, 6);
  if (!files.length) return;
  let pending = files.length;
  for (const f of files) {
    if (f.size > 3 * 1024 * 1024) { toast(`${f.name}: أكبر من 3 ميغابايت، تُخطّت`); if (--pending === 0) finish(); continue; }
    const fr = new FileReader();
    fr.onload = () => {
      job.photos.push({ url: fr.result, caption: f.name.replace(/\.[^.]+$/, '') });
      if (--pending === 0) finish();
    };
    fr.onerror = () => { toast(`تعذّرت قراءة ${f.name}`); if (--pending === 0) finish(); };
    fr.readAsDataURL(f);
  }
  function finish() { renderPhotoChips(); scheduleSave(); e.target.value = ''; }
}

function renderPhotoChips() {
  const box = $('#photo-chips');
  if (!job.photos.length) { box.innerHTML = '<span class="chip">لا صور</span>'; return; }
  box.innerHTML = '';
  job.photos.forEach((p, i) => {
    const c = el('span', 'chip', `${p.caption || 'صورة'} `);
    const b = el('button', 'btn danger sm', '×');
    b.style.padding = '0 6px';
    b.addEventListener('click', () => { job.photos.splice(i, 1); renderPhotoChips(); scheduleSave(); });
    c.appendChild(b);
    box.appendChild(c);
  });
}

/* ───────────────────────── ٣) خط النماذج ───────────────────────── */

function renderPipeline() {
  const host = $('#pipeline-steps');
  host.innerHTML = '';
  let lastStage = 0;

  STEPS.forEach((step, i) => {
    if (step.stage !== lastStage) {
      lastStage = step.stage;
      host.appendChild(el('div', 'stage-head', STAGE_NAMES[step.stage]));
    }

    // النماذج الثلاثة داخل المرحلة الواحدة مستقلة، فتُفتح معًا؛ وإنما تنتظر المرحلةُ ما قبلها.
    const ready = STEPS.filter((s) => s.stage < step.stage).every((s) => (job.out[s.key] || '').trim());
    const done = !!(job.out[step.key] || '').trim();

    const node = el('div', `step${done ? ' done' : ''}`);
    const defaultOpen = (!done && ready) || (done && !job.out.am);
    node.dataset.open = stepOpen.has(step.key) ? (stepOpen.get(step.key) ? '1' : '0') : (defaultOpen ? '1' : '0');

    const head = el('header');
    head.innerHTML = `<b>${done ? '✓' : i + 1}</b>
      <div><div class="t">${step.title}</div>
      <div class="s">${done ? 'مكتملة — اضغط للتعديل' : (ready ? 'جاهزة' : 'تنتظر إكمال المرحلة السابقة')}</div></div>`;
    head.addEventListener('click', () => {
      const next = node.dataset.open === '1' ? '0' : '1';
      node.dataset.open = next;
      stepOpen.set(step.key, next === '1');
    });
    node.appendChild(head);

    const inner = el('div', 'inner');

    const picks = MODEL_PICKS[step.role] || [];
    const modelChips = el('div', 'models');
    modelChips.innerHTML = picks.map((m, k) => {
      const free = m.slug.endsWith(':free');
      const label = picks.length > 1 && k === 0 ? 'الأنسب: ' : '';
      return `<span class="model${free ? ' free' : ''}" title="${m.note}">${label}${m.name}${free ? ' · مجاني' : ''}</span>`;
    }).join('');
    inner.appendChild(modelChips);

    // أي نموذج شغّلت؟ يُحفَظ مع درجة المدقّق فتُبنى لوحة الأداء.
    const pick = el('select', 'model-pick');
    pick.innerHTML = '<option value="">— النموذج المستعمل —</option>' +
      picks.map((m) => `<option value="${m.name}"${job.models?.[step.key] === m.name ? ' selected' : ''}>${m.name}</option>`).join('') +
      `<option value="__other"${job.models?.[step.key] && !picks.some((m) => m.name === job.models[step.key]) ? ' selected' : ''}>غير ذلك…</option>`;
    if (job.models?.[step.key] && !picks.some((m) => m.name === job.models[step.key])) {
      pick.value = '__other';
    }
    models_attach(pick, step);

    const row = el('div', 'row');
    row.appendChild(pick);
    const btnCopy = el('button', 'btn sm', 'نسخ الرسالة');
    const btnShow = el('button', 'btn ghost sm', 'عرض الرسالة');
    const btnDl   = el('button', 'btn ghost sm', 'تنزيلها');
    row.append(btnCopy, btnShow, btnDl);
    inner.appendChild(row);

    const pre = el('pre', 'prompt');
    pre.hidden = true;
    inner.appendChild(pre);

    const buildPrompt = () => {
      try { return step.build({ place: job.place, ctx: job.ctx, out: job.out }); }
      catch (err) { toast('تعذّر بناء الرسالة: ' + err.message); return ''; }
    };

    btnCopy.addEventListener('click', async () => {
      const text = buildPrompt();
      if (!text) return;
      toast(await copy(text) ? 'نُسخت الرسالة — ألصقها في النموذج' : 'تعذّر النسخ، استعمل «عرض الرسالة»');
    });
    btnShow.addEventListener('click', () => {
      if (pre.hidden) { pre.textContent = buildPrompt(); pre.hidden = false; btnShow.textContent = 'إخفاء الرسالة'; }
      else { pre.hidden = true; btnShow.textContent = 'عرض الرسالة'; }
    });
    btnDl.addEventListener('click', () => {
      const text = buildPrompt();
      if (text) download(`rabih-${step.key}-${asciiName(job.place.identity.name)}.txt`, text);
    });

    const lbl = el('label', null, 'إجابة النموذج');
    lbl.setAttribute('for', `out-${step.key}`);
    const ta = el('textarea');
    ta.id = `out-${step.key}`;
    ta.className = 'tall';
    ta.placeholder = 'ألصق هنا ما ردّ به النموذج…';
    ta.value = job.out[step.key] || '';
    const check = el('div', 'verify-box');

    const runVerify = () => {
      const val = (job.out[step.key] || '').trim();
      if (!val) { check.innerHTML = ''; return; }
      const v = verify(val, job.place);
      const model = job.models?.[step.key];
      if (model) {
        models.record({
          jobId: job.id, step: step.key, model, role: step.role,
          score: v.score, level: v.level, coverage: v.coverage,
          badIds: v.badIds.length, unsupported: v.unsupported.length, numberIssues: v.numberIssues.length,
        });
      }
      const bad = v.badIds.length
        ? `<p class="fine err-text">معرّفات لا وجود لها في بياناتك: ${v.badIds.map((i) => `<span class="rid">${i}</span>`).join('، ')} — هذا اختراع صريح، أعد الخطوة بنموذج آخر.</p>` : '';
      const nums = v.numberIssues.length
        ? `<ul class="fine">${v.numberIssues.map((n) => `<li>الرقم <b>${n.value}</b> في «${n.context.slice(0, 60)}» — ${n.why}.</li>`).join('')}</ul>` : '';
      const uns = v.unsupported.length
        ? `<details class="fine"><summary>${v.unsupported.length} حكمًا بلا سند</summary><ul>${
            v.unsupported.slice(0, 8).map((u) => `<li>${u.text.slice(0, 110)}</li>`).join('')}</ul></details>` : '';
      check.innerHTML = `<div class="msg ${v.level === 'err' ? 'err' : v.level === 'warn' ? 'warn' : 'ok'}">
        <b>مدقّق السند: ${v.summary}</b>${bad}${nums}${uns}</div>`;
    };

    ta.addEventListener('input', () => {
      job.out[step.key] = ta.value;
      scheduleSave();
      updateProgress();
    });
    ta.addEventListener('change', () => { runVerify(); renderPipeline(); });
    ta.addEventListener('blur', runVerify);
    inner.append(lbl, ta, check);
    runVerify();

    node.appendChild(inner);
    host.appendChild(node);
  });

  updateProgress();
  renderStepsBar('pipeline');
}

/** يربط قائمة اختيار النموذج بالحالة، ويسمح باسم يكتبه المستخدم. */
function models_attach(pick, step) {
  pick.addEventListener('change', () => {
    job.models ??= {};
    if (pick.value === '__other') {
      const name = prompt('اسم النموذج الذي استعملته:')?.trim();
      if (!name) { pick.value = job.models[step.key] || ''; return; }
      job.models[step.key] = name;
    } else {
      job.models[step.key] = pick.value;
    }
    scheduleSave();
  });
}

function updateProgress() {
  const done = STEPS.filter((s) => (job.out[s.key] || '').trim()).length;
  const badge = $('#pipeline-progress');
  badge.textContent = `${done} من ${STEPS.length} خطوات`;
  badge.className = 'badge ' + (done === STEPS.length ? 'ok' : done ? 'mid' : '');
}

function bindPipelineView() {
  $('#btn-open-openrouter').addEventListener('click', () => window.open('https://openrouter.ai/chat', '_blank', 'noopener'));
  $('#btn-export-job').addEventListener('click', () => {
    download(`rabih-state-${asciiName(job.place.identity.name)}.json`, JSON.stringify(job, null, 2), 'application/json');
  });
  $('#btn-to-report').addEventListener('click', () => {
    const final = (job.out.am || '').trim();
    if (!final && !job.reportMd) {
      if (!confirm('الخطوة الثامنة (الدمج النهائي) لم تكتمل. المتابعة بتقرير فارغ؟')) return;
    }
    if (final && !job.reportMd) job.reportMd = final;
    loadReportView();
    show('report');
  });
}

/* ───────────────────────── ٤) التقرير ───────────────────────── */

function loadReportView() {
  $('#r-md').value = job.reportMd || job.out.am || '';
  $('#plan-in-report').checked = !!job.planInReport;
  fillTemplates();
  showFontState();
  renderShareMessage();
  renderPlan();
  renderReport();
  renderCompleteness();
  renderStepsBar('report');
}

function currentHtml() {
  const tpl = TEMPLATES[job.template] || TEMPLATES[DEFAULT_TEMPLATE];
  return buildReportHtml({
    place: job.place,
    ctx: job.ctx,
    markdown: applyTemplate(reportMarkdown(), tpl.id),
    photos: job.photos,
    show: tpl.show,
    font: job.font,
    identity: identity.load(),
  });
}

function renderReport() {
  const frame = $('#r-frame');
  frame.srcdoc = currentHtml();
}

function reportFileName(ext) {
  const c = job.ctx;
  return `rabih-${asciiName(job.place.identity.name)}-${asciiName(c.cityName, 'ksa')}-${new Date().toISOString().slice(0, 10)}.${ext}`;
}

/** نص الإرسال: ما حرّره المستخدم، وإلا القالب المناسب لحال التقرير. */
function shareText(channel = 'whatsapp') {
  const typed = $('#s-msg')?.value?.trim();
  if (typed) return typed;
  const id = identity.load();
  const sign = id.office ? `\n— ${id.office}${id.phone ? ` · ${id.phone}` : ''}` : '';
  return buildMessage(job, channel) + sign;
}

function renderShareMessage() {
  const box = $('#s-msg');
  if (!box || !job.place.reviews.length) return;
  const badge = $('#s-situation');
  if (badge) badge.textContent = situationLabel(job);
  if (!box.value.trim() || box.dataset.auto === '1') {
    const id = identity.load();
    const sign = id.office ? `\n— ${id.office}${id.phone ? ` · ${id.phone}` : ''}` : '';
    box.value = buildMessage(job, 'whatsapp') + sign;
    box.dataset.auto = '1';
  }
}

/* ───────────────────────── خطة العمل ───────────────────────── */

function renderPlan() {
  const box = $('#plan-box');
  if (!box) return;
  job.plan ??= [];
  const p = progress(job.plan);
  const badge = $('#plan-progress');
  badge.textContent = job.plan.length ? `منجز ${p.done} من ${p.total} (${p.pct}%)` : 'لا مهام بعد';
  badge.className = 'badge ' + (p.total && p.done === p.total ? 'ok' : (p.done ? 'mid' : ''));

  if (!job.plan.length) {
    box.innerHTML = '<div class="empty">لا مهام. اضغط «استخراج التوصيات» بعد أن يكتمل التقرير.</div>';
    return;
  }

  const rows = job.plan.map((t, i) => `<tr data-i="${i}">
    <td>${i + 1}</td>
    <td class="task-text" contenteditable="true">${t.text}</td>
    <td class="task-metric" contenteditable="true">${t.metric || ''}</td>
    <td>${t.ids.map((x) => `<span class="rid">${x}</span>`).join(' ') || '—'}</td>
    <td><input type="date" class="task-due" value="${t.due || ''}"></td>
    <td><select class="task-status">${
      Object.entries(STATUS).map(([k, v]) => `<option value="${k}"${t.status === k ? ' selected' : ''}>${v.label}</option>`).join('')
    }</select></td>
    <td><button type="button" class="btn danger sm task-del">×</button></td>
  </tr>`).join('');

  box.innerHTML = `<div class="table-wrap"><table class="mini plan">
    <thead><tr><th>#</th><th>المهمة</th><th>مؤشر القياس</th><th>السند</th><th>الاستحقاق</th><th>الحالة</th><th></th></tr></thead>
    <tbody>${rows}</tbody></table></div>`;

  const idx = (e) => Number(e.target.closest('tr').dataset.i);
  box.querySelectorAll('.task-status').forEach((el2) => el2.addEventListener('change', (e) => {
    job.plan[idx(e)].status = e.target.value; renderPlan(); scheduleSave(); syncPlanIntoReport();
  }));
  box.querySelectorAll('.task-due').forEach((el2) => el2.addEventListener('change', (e) => {
    job.plan[idx(e)].due = e.target.value; scheduleSave(); syncPlanIntoReport();
  }));
  box.querySelectorAll('.task-text').forEach((el2) => el2.addEventListener('blur', (e) => {
    job.plan[idx(e)].text = e.target.textContent.trim(); scheduleSave(); syncPlanIntoReport();
  }));
  box.querySelectorAll('.task-metric').forEach((el2) => el2.addEventListener('blur', (e) => {
    job.plan[idx(e)].metric = e.target.textContent.trim(); scheduleSave(); syncPlanIntoReport();
  }));
  box.querySelectorAll('.task-del').forEach((el2) => el2.addEventListener('click', (e) => {
    job.plan.splice(idx(e), 1); renderPlan(); scheduleSave(); syncPlanIntoReport();
  }));
}

/** الخطة تظهر في الـPDF حين يطلبها المستخدم، فتُبنى المعاينة من النص + قسم الخطة. */
function reportMarkdown() {
  const base = $('#r-md').value;
  return job.planInReport && job.plan?.length ? base + planMarkdown(job.plan) : base;
}

function syncPlanIntoReport() {
  if (job.planInReport) renderReport();
}

function bindPlanView() {
  $('#btn-extract-plan').addEventListener('click', () => {
    const fresh = extractTasks($('#r-md').value);
    if (!fresh.length) {
      toast('لم يُعثر على قسم توصيات في التقرير');
      return;
    }
    fresh.forEach((t) => { t.due ||= defaultDue(30); });
    job.plan = mergeTasks(job.plan || [], fresh);
    renderPlan(); scheduleSave(); syncPlanIntoReport();
    toast(`استُخرجت ${fresh.length} توصية`);
  });

  $('#btn-add-task').addEventListener('click', () => {
    const text = prompt('نص المهمة:');
    if (!text?.trim()) return;
    job.plan ??= [];
    job.plan.push({
      id: 'T' + String(job.plan.length + 1).padStart(2, '0'),
      text: text.trim(), ids: [], metric: '', status: 'open', due: defaultDue(30), note: '', manual: true,
    });
    renderPlan(); scheduleSave(); syncPlanIntoReport();
  });

  $('#plan-in-report').addEventListener('change', (e) => {
    job.planInReport = e.target.checked;
    scheduleSave();
    renderReport();
  });
}

/* ───────────────────────── المقارنة ───────────────────────── */

const arrow = (d, goodIsUp = true) => {
  if (d === null || d === undefined || d === 0) return '<span class="delta flat">بلا تغيّر</span>';
  const good = goodIsUp ? d > 0 : d < 0;
  return `<span class="delta ${good ? 'up' : 'down'}">${d > 0 ? '▲' : '▼'} ${Math.abs(d)}</span>`;
};

let compareJobs = [];

async function renderCompare() {
  compareJobs = await allJobs();

  const places = comparablePlaces(compareJobs);
  const sel = $('#cmp-place');
  sel.innerHTML = places.length
    ? places.map((p) => `<option value="${p.key}">${p.name} (${p.count} تقارير)</option>`).join('')
    : '<option value="">— لا منشأة لها تقريران بعد —</option>';
  fillTimelineSelects();

  const tgt = $('#cmp-target');
  tgt.innerHTML = compareJobs.length
    ? compareJobs.map((j) => `<option value="${j.id}">${j.place?.identity?.name || 'بلا اسم'} — ${j.ctx?.cityName || ''} ${j.ctx?.districtName || ''}</option>`).join('')
    : '<option value="">— الأرشيف فارغ —</option>';
  renderBenchmark();
  renderGroups();
}

function fillTimelineSelects() {
  const key = $('#cmp-place').value;
  const group = comparablePlaces(compareJobs).find((p) => p.key === key);
  const opts = (list) => list.map((j) => `<option value="${j.id}">${String(j.createdAt || '').slice(0, 10)} — ${j.place?.reviews?.length || 0} تعليقًا</option>`).join('');
  if (!group) {
    $('#cmp-from').innerHTML = $('#cmp-to').innerHTML = '';
    $('#timeline-box').innerHTML = '<div class="empty">تحتاج تقريرين لمنشأة واحدة. أنشئ تقريرًا ثانيًا لاحقًا لنفس الرابط.</div>';
    return;
  }
  $('#cmp-from').innerHTML = opts(group.jobs);
  $('#cmp-to').innerHTML = opts(group.jobs);
  $('#cmp-from').value = group.jobs[0].id;
  $('#cmp-to').value = group.jobs[group.jobs.length - 1].id;
  renderTimeline();
}

function renderTimeline() {
  const box = $('#timeline-box');
  const a = compareJobs.find((j) => j.id === $('#cmp-from').value);
  const b = compareJobs.find((j) => j.id === $('#cmp-to').value);
  if (!a || !b || a.id === b.id) { box.innerHTML = '<div class="empty">اختر تقريرين مختلفين.</div>'; return; }

  const t = timeline(a, b);
  const r = t.ratings;
  const cell = (label, o, goodIsUp = true, suffix = '') =>
    `<div class="stat"><b>${label}</b><span>${o.now ?? '—'}${suffix}</span>
      <div class="fine">${o.before ?? '—'}${suffix} ← ${arrow(o.diff, goodIsUp)}</div></div>`;

  const list = (title, items, cls) => items.length
    ? `<div class="chg ${cls}"><b>${title}</b><ul>${items.map((x) => `<li>${x}</li>`).join('')}</ul></div>` : '';

  box.innerHTML = `
    <p class="fine">بين ${String(a.createdAt || '').slice(0, 10)} و${String(b.createdAt || '').slice(0, 10)}${t.days !== null ? ` — ${t.days} يومًا` : ''}.</p>
    <div class="stat-grid">
      ${cell('متوسط قوقل', r.googleAverage)}
      ${cell('عدد التقييمات', r.googleCount)}
      ${cell('متوسط العيّنة', r.sampleAverage)}
      ${cell('نسبة السلبي', r.negativeShare, false, '%')}
      ${cell('ردود المالك', r.replyRate, true, '%')}
    </div>
    <div class="changes">
      ${list('تحسّنت', t.topics.better.map((x) => `${x.name}: ${x.from} ← ${x.to} شكوى`), 'good')}
      ${list('اختفت', t.topics.gone.map((x) => `${x.name} (كانت ${x.was})`), 'good')}
      ${list('تفاقمت', t.topics.worse.map((x) => `${x.name}: ${x.from} ← ${x.to} شكوى`), 'bad')}
      ${list('شكاوى جديدة', t.topics.new.map((x) => `${x.name} (${x.neg}) — ${x.ids.join('، ')}`), 'bad')}
    </div>
    ${t.plan.total ? `<p class="fine">خطة التقرير الأقدم: أُنجز ${t.plan.done} من ${t.plan.total} مهمة${
      t.plan.tasks.length ? ` — ${t.plan.tasks.map((x) => x.text).join('؛ ')}` : ''}.</p>` : ''}`;
}

function renderBenchmark() {
  const box = $('#bench-box');
  const target = compareJobs.find((j) => j.id === $('#cmp-target').value);
  if (!target) { box.innerHTML = '<div class="empty">الأرشيف فارغ.</div>'; return; }

  const rivals = competitors(compareJobs, target);
  if (!rivals.length) {
    box.innerHTML = `<div class="empty">لا منافس في الأرشيف بنفس المدينة والتصنيف (${target.ctx?.cityName || ''} — ${target.ctx?.categoryName || ''}).<br>أضف تقريرًا لمنشأة منافسة لتظهر المقارنة.</div>`;
    return;
  }

  const b = benchmark(target, rivals);
  const head = `<tr><th>المنشأة</th><th>الحي</th><th>متوسط قوقل</th><th>التقييمات</th><th>نسبة السلبي</th><th>ردود المالك</th><th>العيّنة</th></tr>`;
  const rows = b.rows.map((r) => `<tr class="${r.isTarget ? 'me' : ''}">
    <td>${r.name}${r.isTarget ? ' <span class="badge">أنت</span>' : ''}</td>
    <td>${r.district}</td><td>${r.googleAverage ?? '—'}</td><td>${r.googleCount ?? '—'}</td>
    <td>${r.negativeShare ?? '—'}%</td><td>${r.replyRate ?? '—'}%</td><td>${r.total}</td></tr>`).join('');

  const topics = b.topics.slice(0, 8).map((t) => `<tr>
    <td>${t.name}</td>${t.cells.map((c) => `<td class="${c.isTarget ? 'me' : ''}">${c.total ? `${c.total} <small>(سلبي ${c.neg})</small>` : '—'}</td>`).join('')}
  </tr>`).join('');

  const ib = internalBenchmark(compareJobs, target);
  const ibHtml = ib && ib.verdicts.length ? `<div class="bench-inner">
      <h3 class="sub">معيار أرشيفك (${ib.scope} — ${ib.n} منشآت)</h3>
      <div class="stat-grid">${ib.verdicts.map((v) => `
        <div class="stat ${v.good ? 'up' : 'down'}"><b>${v.label}</b><span>${v.mine}${v.unit}</span>
          <div class="fine">المعيار ${v.theirs}${v.unit} · ${v.diff > 0 ? '+' : ''}${v.diff}${v.unit}</div></div>`).join('')}</div>
      <p class="fine">المعيار مبنيّ على أرشيفك أنت لا على بيانات القطاع، ويتحسّن كلما كبر.</p>
    </div>` : '';

  box.innerHTML = `
    ${b.rank ? `<div class="msg ${b.rank.position === 1 ? 'ok' : 'warn'}"><b>الترتيب ${b.rank.position} من ${b.rank.of} بـ${b.rank.by}.</b></div>` : ''}
    ${ibHtml}
    <div class="table-wrap"><table class="mini"><thead>${head}</thead><tbody>${rows}</tbody></table></div>
    ${topics ? `<h3 class="sub">المحاور المشتركة</h3><div class="table-wrap"><table class="mini">
      <thead><tr><th>الموضوع</th>${b.rows.map((r) => `<th class="${r.isTarget ? 'me' : ''}">${r.name}</th>`).join('')}</tr></thead>
      <tbody>${topics}</tbody></table></div>` : '<p class="fine">لا محاور مشتركة بعدُ بين هذه المنشآت.</p>'}`;
}

/* ───────────────────────── تقرير المجموعة ───────────────────────── */

let groupList = [];
let groupAnalysis = null;

function renderGroups() {
  groupList = brands(compareJobs);
  const sel = $('#grp-brand');
  sel.innerHTML = groupList.length
    ? groupList.map((b) => `<option value="${b.name}">${b.name} (${b.jobs.length} فروع)</option>`).join('')
    : '<option value="">— لا علامة لها فرعان فأكثر —</option>';
  renderGroup();
}

function renderGroup() {
  const box = $('#group-box');
  const brand = groupList.find((b) => b.name === $('#grp-brand').value);
  const actions = $('#group-actions');
  const answer = $('#group-answer-field');

  if (!brand) {
    groupAnalysis = null;
    actions.hidden = true; answer.hidden = true;
    box.innerHTML = '<div class="empty">اكتب اسم العلامة نفسه في حقل «العلامة / المالك» عند إنشاء تقرير كل فرع، فتُجمَع هنا.</div>';
    return;
  }

  const a = analyze(brand.jobs);
  groupAnalysis = { brand: brand.name, analysis: a };
  actions.hidden = false; answer.hidden = false;
  $('#grp-answer').value = readGroupAnswer(brand.name);

  const rank = (a.ranking.length ? a.ranking : a.branches.map((b, i) => ({ ...b, rank: i + 1 })));
  const rows = rank.map((b) => {
    const tone = b.trend === 'انحدار' ? 'down' : (b.trend === 'تحسّن' ? 'up' : '');
    return `<tr><td>${b.rank}</td><td>${b.label}</td><td>${b.district}</td>
      <td>${b.googleAverage ?? '—'}</td><td>${b.googleCount ?? '—'}</td>
      <td>${b.negativeShare ?? '—'}%</td><td>${b.replyRate ?? '—'}%</td>
      <td class="${tone}">${b.trend}</td></tr>`;
  }).join('');

  const shared = a.shared.map((t) =>
    `<li><b>${t.name}</b> — ${t.branches.length} فروع: ${t.branches.map((x) => `${x.label} (${x.neg})`).join('، ')}</li>`).join('');
  const uniq = a.unique.map((t) =>
    `<li><b>${t.name}</b> — ${t.branches[0].label} وحده (${t.branches[0].neg})</li>`).join('');

  box.innerHTML = `
    <div class="stat-grid">
      <div class="stat"><b>الفروع</b><span>${a.totals.branches}</span></div>
      <div class="stat"><b>المتوسط الموزون</b><span>${a.totals.weightedAverage ?? '—'}</span></div>
      <div class="stat"><b>إجمالي التقييمات</b><span>${a.totals.googleCount || '—'}</span></div>
      <div class="stat"><b>الفجوة</b><span>${a.gap ? a.gap.diff : '—'}</span></div>
    </div>
    ${a.gap ? `<p class="fine">الأقوى <b>${a.gap.best.label}</b> (${a.gap.best.googleAverage}) والأضعف <b>${a.gap.worst.label}</b> (${a.gap.worst.googleAverage}).</p>` : ''}
    ${a.totals.declining.length ? `<div class="msg warn"><b>فروع في انحدار حديث: ${a.totals.declining.join('، ')}</b></div>` : ''}
    <div class="table-wrap"><table class="mini"><thead><tr>
      <th>#</th><th>الفرع</th><th>الحي</th><th>متوسط قوقل</th><th>التقييمات</th><th>السلبي</th><th>ردود</th><th>الاتجاه</th>
    </tr></thead><tbody>${rows}</tbody></table></div>
    <div class="changes">
      ${shared ? `<div class="chg bad"><b>شكاوى مشتركة — مشكلة نظام</b><ul>${shared}</ul></div>` : ''}
      ${uniq ? `<div class="chg"><b>شكاوى منفردة — مشكلة فرع</b><ul>${uniq}</ul></div>` : ''}
    </div>`;
}

const groupAnswerKey = (brand) => `rabih:group-answer:${brand}`;
const readGroupAnswer = (brand) => { try { return localStorage.getItem(groupAnswerKey(brand)) || ''; } catch { return ''; } };

function bindGroupView() {
  $('#grp-brand').addEventListener('change', renderGroup);

  $('#grp-answer').addEventListener('input', (e) => {
    if (!groupAnalysis) return;
    try { localStorage.setItem(groupAnswerKey(groupAnalysis.brand), e.target.value); } catch { /* تجاهل */ }
  });

  $('#btn-group-prompt').addEventListener('click', async () => {
    if (!groupAnalysis) return;
    const brand = groupList.find((b) => b.name === groupAnalysis.brand);
    const text = groupPrompt(brand.name, brand.jobs, CHARTER);
    toast(await copy(text) ? 'نُسخت رسالة المجموعة — ألصقها في النموذج' : 'تعذّر النسخ');
  });

  $('#btn-group-xlsx').addEventListener('click', () => {
    if (!groupAnalysis) return;
    const a = groupAnalysis.analysis;
    const rank = a.ranking.length ? a.ranking : a.branches;
    const rows = [['#', 'الفرع', 'المدينة', 'الحي', 'متوسط قوقل', 'التقييمات', 'العيّنة', 'السلبي %', 'ردود %', 'الاتجاه']];
    rank.forEach((b, i) => rows.push([b.rank ?? i + 1, b.label, b.city, b.district, b.googleAverage ?? '', b.googleCount ?? '', b.total, b.negativeShare ?? '', b.replyRate ?? '', b.trend]));

    const sh = [['الموضوع', 'عدد الفروع', 'إجمالي الشكاوى', 'التفصيل']];
    a.shared.forEach((t) => sh.push([t.name, t.branches.length, t.totalNeg, t.branches.map((x) => `${x.label}: ${x.neg}`).join('، ')]));
    a.unique.forEach((t) => sh.push([t.name, 1, t.totalNeg, `${t.branches[0].label}: ${t.branches[0].neg} (منفردة)`]));

    download(`rabih-group-${asciiName(groupAnalysis.brand)}-${new Date().toISOString().slice(0, 10)}.xlsx`,
      buildXlsx([{ name: 'الفروع', rows }, { name: 'الشكاوى', rows: sh }]));
  });

  $('#btn-group-print').addEventListener('click', () => {
    if (!groupAnalysis) return;
    const html = buildGroupReportHtml({
      brand: groupAnalysis.brand,
      analysis: groupAnalysis.analysis,
      markdown: $('#grp-answer').value,
      identity: identity.load(),
    });
    const w = window.open('', '_blank');
    if (!w) { toast('المتصفح منع النافذة — اسمح بالنوافذ المنبثقة'); return; }
    w.document.write(html); w.document.close();
    w.addEventListener('load', () => setTimeout(() => w.print(), 400));
  });
}

function bindCompareView() {
  $('#cmp-place').addEventListener('change', fillTimelineSelects);
  $('#cmp-from').addEventListener('change', renderTimeline);
  $('#cmp-to').addEventListener('change', renderTimeline);
  $('#cmp-target').addEventListener('change', renderBenchmark);
}

/* ───────────────────────── القوالب والخط والتصدير ───────────────────────── */

function fillTemplates() {
  const sel = $('#r-template');
  if (!sel) return;
  sel.innerHTML = Object.values(TEMPLATES).map((t) =>
    `<option value="${t.id}"${(job.template || DEFAULT_TEMPLATE) === t.id ? ' selected' : ''}>${t.name}</option>`).join('');
  showTemplateNote();
}

function showTemplateNote() {
  const tpl = TEMPLATES[job.template] || TEMPLATES[DEFAULT_TEMPLATE];
  const dropped = droppedSections(reportMarkdown(), tpl.id);
  $('#tpl-note').innerHTML = `${tpl.note}${
    dropped.length ? `<br><b>يُستبعد من هذا الإخراج:</b> ${dropped.join('، ')}. (النص الأصلي محفوظ كما هو.)` : ''}`;
}

function showFontState() {
  const note = $('#font-note');
  if (!note) return;
  if (job.font?.name) {
    note.innerHTML = `الخط المضمَّن: <b>${job.font.name}</b> — <a href="#" id="font-clear">إزالته</a>`;
    const clear = $('#font-clear');
    if (clear) clear.addEventListener('click', (e) => {
      e.preventDefault();
      job.font = null; showFontState(); renderReport(); scheduleSave(); toast('أُزيل الخط');
    });
  } else {
    note.textContent = 'بدونه يُستعمل خط الجهاز. تضمينه يزيد حجم الملف نحو ٣٠٠ كيلوبايت ويثبّت الشكل عند كل مستقبِل.';
  }
}

function bindOutputView() {
  $('#r-template').addEventListener('change', (e) => {
    job.template = e.target.value;
    showTemplateNote();
    renderReport();
    scheduleSave();
  });

  $('#r-font').addEventListener('change', (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 2 * 1024 * 1024) { toast('الخط أكبر من ٢ ميغابايت'); e.target.value = ''; return; }
    const fr = new FileReader();
    fr.onload = () => {
      job.font = { name: f.name, dataUrl: fr.result };
      showFontState(); renderReport(); scheduleSave();
      toast('ضُمِّن الخط في التقرير');
    };
    fr.onerror = () => toast('تعذّرت قراءة ملف الخط');
    fr.readAsDataURL(f);
    e.target.value = '';
  });

  $('#btn-download-xlsx').addEventListener('click', () => {
    download(reportFileName('xlsx'), buildXlsx(jobSheets(job)));
    toast('نُزِّل ملف Excel');
  });

  $('#btn-archive-xlsx').addEventListener('click', async () => {
    const jobs = await allJobs();
    if (!jobs.length) { toast('الأرشيف فارغ'); return; }
    download(`rabih-archive-${new Date().toISOString().slice(0, 10)}.xlsx`, buildXlsx(archiveSheet(jobs)));
  });
}

/* ───────────────────────── مدقّق الاكتمال ───────────────────────── */

function renderCompleteness() {
  const box = $('#completeness-box');
  if (!box) return;
  const text = $('#r-md').value.trim();
  if (!text) { box.innerHTML = ''; return; }

  const r = audit(text, job.place);
  const topics = r.missedTopics.length
    ? `<p class="fine">مواضيع رصدها القاموس وأهملها التقرير: ${
        r.missedTopics.map((t) => `<b>${t.name}</b> (${t.total} مرات — ${t.ids.join('، ')})`).join(' · ')}</p>` : '';
  const alertsList = r.missedAlerts.length
    ? `<ul class="fine">${r.missedAlerts.map((a) => `<li>إنذار لم يُذكر: ${a}</li>`).join('')}</ul>` : '';

  box.innerHTML = `<div class="msg ${r.level === 'err' ? 'err' : r.level === 'warn' ? 'warn' : 'ok'}">
      <b>مدقّق الاكتمال: ${r.summary}</b>${topics}${alertsList}
      ${r.unusedShare >= 60 ? `<p class="fine">${r.unusedShare}% من التعليقات لم يُستشهَد بأيٍّ منها.</p>` : ''}
    </div>
    ${r.level !== 'ok' ? '<div class="row"><button type="button" class="btn ghost sm" id="btn-fix-prompt">نسخ رسالة سدّ النقص</button></div>' : ''}`;

  const btn = $('#btn-fix-prompt');
  if (btn) btn.addEventListener('click', async () => {
    const text2 = `${fixPrompt(r)}\n\n---\n## تقريرك الحالي\n${$('#r-md').value}`;
    toast(await copy(text2) ? 'نُسخت — ألصقها في النموذج نفسه ليُكمل تقريره' : 'تعذّر النسخ');
  });
}

function bindReportView() {
  $('#r-md').addEventListener('input', (e) => { job.reportMd = e.target.value; scheduleSave(); });
  $('#r-md').addEventListener('blur', () => { showTemplateNote(); renderCompleteness(); });
  $('#btn-render').addEventListener('click', () => { renderReport(); toast('حُدّثت المعاينة'); });

  $('#btn-print').addEventListener('click', () => {
    const w = window.open('', '_blank');
    if (!w) { toast('المتصفح منع النافذة — اسمح بالنوافذ المنبثقة'); return; }
    w.document.write(currentHtml());
    w.document.close();
    w.addEventListener('load', () => setTimeout(() => w.print(), 400));
  });

  $('#btn-download-html').addEventListener('click', () => download(reportFileName('html'), currentHtml(), 'text/html;charset=utf-8'));
  $('#btn-download-md').addEventListener('click', () => download(reportFileName('md'), $('#r-md').value, 'text/markdown;charset=utf-8'));

  $('#btn-wa').addEventListener('click', () => {
    const phone = $('#s-phone').value.replace(/\D/g, '');
    const base = phone ? `https://wa.me/${phone}` : 'https://wa.me/';
    window.open(`${base}?text=${encodeURIComponent(shareText())}`, '_blank', 'noopener');
    toast('احفظ الـPDF ثم أرفقه في المحادثة');
  });
  $('#btn-tg').addEventListener('click', () => {
    window.open(`https://t.me/share/url?url=${encodeURIComponent(job.mapsUrl || '')}&text=${encodeURIComponent(shareText())}`, '_blank', 'noopener');
    toast('احفظ الـPDF ثم أرفقه في المحادثة');
  });
  $('#btn-mail').addEventListener('click', () => {
    const to = $('#s-email').value.trim();
    location.href = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(messageSubject(job))}&body=${encodeURIComponent(shareText('email'))}`;
  });
  $('#s-msg').addEventListener('input', (e) => { e.target.dataset.auto = '0'; });
  $('#btn-copy-summary').addEventListener('click', async () => {
    toast(await copy(shareText()) ? 'نُسخ نص الإرسال' : 'تعذّر النسخ');
  });
}

/* ───────────────────────── الأرشيف ───────────────────────── */

async function renderArchive(filter = '') {
  const host = $('#archive-tree');
  const jobs = await allJobs();
  const q = filter.trim();
  const list = q ? jobs.filter((j) => (j.place?.identity?.name || '').includes(q)) : jobs;

  if (!list.length) {
    host.innerHTML = `<div class="empty">${q ? 'لا نتائج للبحث.' : 'لا تقارير بعد. ابدأ من «تقرير جديد».'}</div>`;
    return;
  }

  const tree = buildTree(list);
  host.innerHTML = '';
  for (const [region, cities] of Object.entries(tree)) {
    const dR = el('details'); dR.open = true;
    dR.appendChild(el('summary', null, `<b>${region}</b>`));
    const lR = el('div', 'lvl');
    for (const [city, cats] of Object.entries(cities)) {
      const dC = el('details'); dC.open = true;
      dC.appendChild(el('summary', null, city));
      const lC = el('div', 'lvl');
      for (const [cat, dists] of Object.entries(cats)) {
        const dK = el('details'); dK.open = true;
        dK.appendChild(el('summary', null, cat));
        const lK = el('div', 'lvl');
        for (const [dist, items] of Object.entries(dists)) {
          const dD = el('details'); dD.open = true;
          dD.appendChild(el('summary', null, `${dist} <span class="badge">${items.length}</span>`));
          const lD = el('div', 'lvl');
          for (const j of items) lD.appendChild(jobRow(j));
          dD.appendChild(lD); lK.appendChild(dD);
        }
        dK.appendChild(lK); lC.appendChild(dK);
      }
      dC.appendChild(lC); lR.appendChild(dC);
    }
    dR.appendChild(lR); host.appendChild(dR);
  }
}

function jobRow(j) {
  const done = STEPS.filter((s) => (j.out?.[s.key] || '').trim()).length;
  const badge = j.reportMd ? '<span class="badge ok">تقرير جاهز</span>'
    : done ? `<span class="badge mid">${done}/8</span>`
    : '<span class="badge">بيانات فقط</span>';
  const row = el('div', 'job');
  row.innerHTML = `<span class="n">${j.place?.identity?.name || 'بلا اسم'}</span>
    ${badge}
    <span class="d">${(j.place?.reviews?.length || 0)} تعليقًا · ${String(j.updatedAt || '').slice(0, 10)}</span>`;

  const open = el('button', 'btn ghost sm', 'فتح');
  open.addEventListener('click', async () => {
    job = await getJob(j.id);
    stepOpen.clear();
    loadDataView();
    renderPipeline();
    loadReportView();
    show(job.reportMd ? 'report' : (job.place.reviews.length ? 'pipeline' : 'data'));
    try { localStorage.setItem(LAST_JOB, job.id); } catch { /* تجاهل */ }
  });

  const q = el('button', 'btn ghost sm', '+ للطابور');
  q.addEventListener('click', () => { queue.add(j.id); renderQueue(); toast('أُضيف إلى الطابور'); });

  const del = el('button', 'btn danger sm', 'حذف');
  del.addEventListener('click', async () => {
    if (!confirm(`حذف تقرير «${j.place?.identity?.name || 'بلا اسم'}» نهائيًّا؟`)) return;
    await deleteJob(j.id);
    if (job?.id === j.id) job = blankJob();
    renderArchive($('#ar-search').value);
    toast('حُذف');
  });

  const sp = el('span', 'spacer');
  row.append(sp, q, open, del);
  return row;
}

/* ───────────────────────── حماية الأرشيف ───────────────────────── */

async function renderSafety() {
  const box = $('#safety-box');
  if (!box) return;
  const jobs = await allJobs();
  const st = await safe.status(jobs.length);

  const lines = [];
  lines.push(st.persisted
    ? '<li class="ok-line">التخزين مثبَّت — لن يمسحه المتصفح تلقائيًّا عند ضيق المساحة.</li>'
    : '<li class="warn-line">التخزين غير مثبَّت — قد يمسحه المتصفح عند ضيق المساحة. اضغط «تثبيت التخزين».</li>');

  if (st.days === null) lines.push(`<li class="warn-line">لم تأخذ نسخة احتياطية قطّ${jobs.length ? ` — وعندك ${jobs.length} تقريرًا.` : '.'}</li>`);
  else if (st.due) lines.push(`<li class="warn-line">آخر نسخة احتياطية قبل ${st.days} يومًا. خُذ نسخة.</li>`);
  else lines.push(`<li class="ok-line">آخر نسخة احتياطية قبل ${st.days} يومًا.</li>`);

  const folder = safe.backupFolderName();
  if (folder) lines.push(`<li class="ok-line">مجلد النسخ: <b>${folder}</b></li>`);
  else if (safe.canWriteToFolder()) lines.push('<li>لم يُختَر مجلد نسخ — اختره فتصير النسخة بضغطة واحدة.</li>');

  if (st.quota) lines.push(`<li>المستعمَل ${st.quota.used} م.ب من ${st.quota.available} م.ب (${st.quota.pct}%).</li>`);

  const level = st.persisted && !st.due ? 'ok' : 'warn';
  box.innerHTML = `<div class="msg ${level}"><b>${level === 'ok' ? 'الأرشيف محميّ' : 'الأرشيف غير محميّ بالكامل'}</b><ul>${lines.join('')}</ul></div>`;
}

function bindSafety() {
  $('#btn-persist').addEventListener('click', async () => {
    const ok = await safe.requestPersist();
    toast(ok ? 'ثُبِّت التخزين' : 'رفض المتصفح التثبيت — خُذ نسخة احتياطية بدلًا منه');
    renderSafety();
  });

  $('#btn-backup-folder').addEventListener('click', async () => {
    const r = await safe.chooseBackupFolder();
    toast(r.ok ? `مجلد النسخ: ${r.name}` : r.reason);
    renderSafety();
  });

  $('#btn-backup-now').addEventListener('click', async () => {
    const jobs = await allJobs();
    if (!jobs.length) { toast('الأرشيف فارغ'); return; }
    if (safe.backupFolderName()) {
      const r = await safe.writeBackup(jobs);
      if (r.ok) { toast(`حُفظت النسخة: ${r.file}`); renderSafety(); return; }
      toast(r.reason + ' — سيُنزَّل الملف بدلًا منه');
    }
    download(`rabih-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(jobs, null, 2), 'application/json');
    safe.markBackup();
    renderSafety();
  });
}

/* ───────────────────────── الإعدادات: الهوية والقفل ───────────────────────── */

const ID_FIELDS = { office: '#id-office', tagline: '#id-tagline', phone: '#id-phone', email: '#id-email', website: '#id-website' };

function loadIdentity() {
  const id = identity.load();
  for (const [k, sel] of Object.entries(ID_FIELDS)) $(sel).value = id[k] || '';
  $('#id-primary').value = id.primary || identity.EMPTY.primary;
  $('#id-accent').value = id.accent || identity.EMPTY.accent;
  $('#id-showrabih').checked = id.showRabih !== false;
  $('#logo-note').innerHTML = id.logo ? 'شعار محفوظ — <a href="#" id="logo-clear">إزالته</a>' : 'PNG أو SVG، أقل من ميغابايت.';
  const clr = $('#logo-clear');
  if (clr) clr.addEventListener('click', (e) => { e.preventDefault(); saveIdentity({ logo: '' }); loadIdentity(); toast('أُزيل الشعار'); });
  checkContrast(id);
}

function checkContrast(id) {
  const box = $('#id-msg');
  if (!identity.isDark(id.primary)) {
    box.innerHTML = '<div class="msg warn"><b>اللون الأساسي فاتح</b> — الغلاف يكتب عليه بالأبيض فقد لا يُقرأ. اختر لونًا أقتم.</div>';
  } else box.innerHTML = '';
}

function saveIdentity(patch) {
  const id = { ...identity.load(), ...patch };
  identity.save(id);
  checkContrast(id);
  if (job) renderReport();
  return id;
}

function bindSettings() {
  for (const [k, sel] of Object.entries(ID_FIELDS)) {
    $(sel).addEventListener('input', (e) => saveIdentity({ [k]: e.target.value }));
  }
  $('#id-primary').addEventListener('input', (e) => saveIdentity({ primary: e.target.value }));
  $('#id-accent').addEventListener('input', (e) => saveIdentity({ accent: e.target.value }));
  $('#id-showrabih').addEventListener('change', (e) => saveIdentity({ showRabih: e.target.checked }));

  $('#id-logo').addEventListener('change', (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 1024 * 1024) { toast('الشعار أكبر من ميغابايت'); e.target.value = ''; return; }
    const fr = new FileReader();
    fr.onload = () => { saveIdentity({ logo: fr.result }); loadIdentity(); toast('حُفظ الشعار'); };
    fr.readAsDataURL(f);
    e.target.value = '';
  });

  $('#btn-lock-on').addEventListener('click', async () => {
    const p = $('#lk-pass').value;
    const r = await lock.enable(p);
    message('#lock-msg', r.ok ? 'ok' : 'err', r.ok ? 'فُعِّل القفل. احفظ كلمة السر — لا سبيل لاستعادتها.' : r.reason);
    $('#lk-pass').value = '';
    renderLockState();
  });

  $('#btn-lock-off').addEventListener('click', async () => {
    const r = await lock.disable($('#lk-pass').value);
    message('#lock-msg', r.ok ? 'ok' : 'err', r.ok ? 'أُلغي القفل.' : r.reason);
    $('#lk-pass').value = '';
    renderLockState();
  });

  $('#btn-export-enc').addEventListener('click', async () => {
    const p = $('#lk-pass').value;
    if (!p) { message('#lock-msg', 'err', 'اكتب كلمة السر التي سيُشفَّر بها الملف.'); return; }
    const jobs = await allJobs();
    if (!jobs.length) { toast('الأرشيف فارغ'); return; }
    const enc = await lock.encryptText(JSON.stringify(jobs), p);
    download(`rabih-archive-encrypted-${new Date().toISOString().slice(0, 10)}.json`, enc, 'application/json');
    safe.markBackup();
    message('#lock-msg', 'ok', 'صُدِّر الأرشيف مشفَّرًا. بلا كلمة السر لا يُفتح.');
  });

  $('#lk-import').addEventListener('change', async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const raw = await f.text();
    e.target.value = '';
    let text = raw;
    if (lock.isEncrypted(raw)) {
      const p = $('#lk-pass').value || prompt('كلمة سر الملف:') || '';
      const r = await lock.decryptText(raw, p);
      if (!r.ok) { message('#lock-msg', 'err', r.reason); return; }
      text = r.text;
    }
    try {
      const arr = JSON.parse(text);
      let n = 0;
      for (const j of (Array.isArray(arr) ? arr : [arr])) { if (j?.id && j?.ctx) { await saveJob(j); n += 1; } }
      message('#lock-msg', 'ok', `استُورد ${n} تقريرًا.`);
    } catch { message('#lock-msg', 'err', 'الملف غير صالح.'); }
  });
}

/* ───────────────────────── محرّر القاموس ───────────────────────── */

function renderLexicon() {
  const sel = $('#lex-topic');
  if (!sel) return;
  sel.innerHTML = TOPICS.map((t) => `<option value="${t.id}">${t.name}</option>`).join('');

  // الكلمات المتكررة في التعليقات غير المصنَّفة — مرشّحات للإضافة.
  const box = $('#lex-uncovered');
  const miss = job?.place?.reviews?.length ? uncovered(job.place) : [];
  if (miss.length) {
    const texts = job.place.reviews.filter((r) => miss.includes(r.id)).map((r) => r.text);
    const freq = new Map();
    for (const t of texts) {
      for (const w of String(t || '').split(/\s+/)) {
        const clean = w.replace(/[^\p{L}]/gu, '');
        if (clean.length < 4) continue;
        freq.set(clean, (freq.get(clean) || 0) + 1);
      }
    }
    const top = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14);
    box.innerHTML = `<div class="msg warn"><b>${miss.length} تعليقًا في تقريرك الحالي لم يصنّفها القاموس</b>
      ${top.length ? `<p class="fine">كلمات متكررة فيها — اضغط الكلمة لتضعها في الحقل:</p>
      <div class="chips">${top.map(([w, n]) => `<span class="chip lex-cand" data-w="${w}">${w} <b>${n}</b></span>`).join('')}</div>` : ''}</div>`;
    box.querySelectorAll('.lex-cand').forEach((c) => c.addEventListener('click', () => {
      $('#lex-word').value = c.dataset.w;
      $('#lex-word').focus();
    }));
  } else {
    box.innerHTML = job?.place?.reviews?.length
      ? '<div class="msg ok"><b>القاموس غطّى كل تعليقات تقريرك الحالي.</b></div>'
      : '<p class="fine">افتح تقريرًا فيه تعليقات لترى ما فات القاموس منها.</p>';
  }

  renderCustomKeywords();
}

function renderCustomKeywords() {
  const box = $('#lex-custom');
  const custom = customKeywords();
  const rows = Object.entries(custom).filter(([, list]) => list?.length);
  if (!rows.length) { box.innerHTML = '<p class="fine">لم تُضف كلمات بعد.</p>'; return; }

  box.innerHTML = `<p class="fine">إضافاتك:</p>` + rows.map(([id, list]) => {
    const name = TOPICS.find((t) => t.id === id)?.name || id;
    return `<div class="fine"><b>${name}:</b> <span class="chips">${
      list.map((w) => `<span class="chip">${w} <button type="button" class="btn danger sm lex-del" data-t="${id}" data-w="${w}" style="padding:0 6px">×</button></span>`).join('')
    }</span></div>`;
  }).join('');

  box.querySelectorAll('.lex-del').forEach((b) => b.addEventListener('click', () => {
    removeKeyword(b.dataset.t, b.dataset.w);
    renderLexicon();
    refreshAnalysis();
    toast('حُذفت الكلمة');
  }));
}

/** يعيد رسم كل ما يعتمد على القاموس بعد تعديله. */
function refreshAnalysis() {
  if (!job?.place?.reviews?.length) return;
  renderRecency(); renderTopics(); renderEntities(); renderReplies();
  renderCompleteness();
  renderReport();
}

function bindLexicon() {
  $('#btn-lex-add').addEventListener('click', () => {
    const word = $('#lex-word').value.trim();
    const topic = $('#lex-topic').value;
    const r = addKeyword(topic, word);
    message('#lex-msg', r.ok ? 'ok' : 'err',
      r.ok ? `أُضيفت «${word}» إلى «${TOPICS.find((t) => t.id === topic)?.name}».` : r.reason);
    if (r.ok) { $('#lex-word').value = ''; renderLexicon(); refreshAnalysis(); }
  });
  $('#lex-word').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#btn-lex-add').click(); });

  $('#btn-lex-reset').addEventListener('click', () => {
    if (!confirm('حذف كل الكلمات التي أضفتها؟ القاموس الأصلي لا يتأثر.')) return;
    resetCustom();
    renderLexicon(); refreshAnalysis();
    toast('صُفِّرت الإضافات');
  });
}

/* ───────────────────────── لوحة أداء النماذج ───────────────────────── */

function renderModels() {
  const box = $('#models-box');
  if (!box) return;
  const rows = models.leaderboard();
  if (!rows.length) {
    box.innerHTML = '<div class="empty">لا سجلّ بعد. اختر النموذج المستعمل في كل خطوة من خط التحليل، فتُبنى اللوحة تلقائيًّا.</div>';
    return;
  }
  const total = rows.reduce((a, r) => a + r.runs, 0);
  box.innerHTML = `
    <div class="table-wrap"><table class="mini"><thead><tr>
      <th>النموذج</th><th>تجارب</th><th>مخرجات نظيفة</th><th>درجة السند</th><th>تغطية</th><th>اختراع</th><th>بلا سند</th><th>أرقام</th>
    </tr></thead><tbody>${
      rows.map((r, i) => `<tr class="${i === 0 && total >= 6 ? 'me' : ''}">
        <td>${r.model}</td><td>${r.runs}</td><td>${r.cleanRate}%</td><td>${r.score}%</td>
        <td>${r.coverage}%</td><td>${r.invented}</td><td>${r.unsupported}</td><td>${r.numbers}</td></tr>`).join('')
    }</tbody></table></div>
    <p class="fine">${total < 6 ? 'العيّنة صغيرة بعد؛ لا تحكم على نموذج بتجربتين.' : `مبنيّ على ${total} خطوة مسجّلة.`}</p>`;
}

function bindModels() {
  $('#btn-models-clear').addEventListener('click', () => {
    if (!confirm('حذف سجلّ أداء النماذج كلّه؟')) return;
    models.clear(); renderModels(); toast('صُفِّر السجل');
  });
}

function renderLockState() {
  $('#lock-state').innerHTML = lock.isEnabled()
    ? '<div class="msg ok"><b>القفل مفعَّل</b> — يُطلب عند فتح المنصّة.</div>'
    : '<div class="msg warn"><b>القفل غير مفعَّل</b> — من يفتح متصفحك يرى تقارير عملائك.</div>';
}

/** بوابة الدخول: تُعرَض قبل أي شيء إن كان القفل مفعَّلًا. */
async function gate() {
  if (!lock.isEnabled()) return true;
  document.body.insertAdjacentHTML('afterbegin', `
    <div id="gate" style="position:fixed;inset:0;background:var(--navy);z-index:99;display:grid;place-items:center;padding:20px">
      <form id="gate-form" style="background:#fff;border-radius:14px;padding:26px;max-width:340px;width:100%;text-align:center">
        <div style="font-size:26px;font-weight:800;letter-spacing:.16em;color:var(--gold)">رابــح</div>
        <p style="color:var(--muted);font-size:13.5px">الأرشيف مقفل. اكتب كلمة السر.</p>
        <input id="gate-pass" type="password" autocomplete="current-password" placeholder="كلمة السر" style="text-align:center">
        <div id="gate-msg" style="color:var(--err);font-size:13px;min-height:20px"></div>
        <button class="btn" type="submit" style="width:100%">دخول</button>
      </form>
    </div>`);
  const input = $('#gate-pass');
  input.focus();
  return new Promise((resolve) => {
    $('#gate-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      if (await lock.verifyPassword(input.value)) { $('#gate').remove(); resolve(true); }
      else { $('#gate-msg').textContent = 'كلمة السر غير صحيحة.'; input.value = ''; input.focus(); }
    });
  });
}

/* ───────────────────────── طابور الدفعات ───────────────────────── */

async function renderQueue() {
  const bar = $('#queue-bar');
  if (!bar) return;
  const jobs = await allJobs();
  const ids = queue.prune(jobs.map((j) => j.id));
  if (ids.length < 2) { bar.hidden = true; return; }

  const byId = new Map(jobs.map((j) => [j.id, j]));
  const at = queue.position();
  const cur = byId.get(ids[at]);

  bar.hidden = false;
  bar.innerHTML = `
    <span class="qpos">الطابور ${at + 1}/${ids.length}</span>
    <span class="qname">${cur?.place?.identity?.name || 'بلا اسم'}</span>
    <span class="qdots">${ids.map((id, i) =>
      `<span class="qdot ${i === at ? 'on' : (byId.get(id)?.reportMd ? 'done' : '')}" data-i="${i}" title="${byId.get(id)?.place?.identity?.name || ''}"></span>`).join('')}</span>
    <span class="spacer"></span>
    <button type="button" class="btn ghost sm" id="q-prev">السابق</button>
    <button type="button" class="btn ghost sm" id="q-next">التالي</button>
    <button type="button" class="btn ghost sm" id="q-clear">إنهاء الطابور</button>`;

  $('#q-prev').addEventListener('click', () => jumpQueue(queue.prev()));
  $('#q-next').addEventListener('click', () => jumpQueue(queue.next()));
  $('#q-clear').addEventListener('click', () => { queue.clear(); renderQueue(); toast('أُنهي الطابور'); });
  bar.querySelectorAll('.qdot').forEach((d) => d.addEventListener('click', () => jumpQueue(queue.goTo(Number(d.dataset.i)))));
}

async function jumpQueue(id) {
  if (!id) return;
  const j = await getJob(id);
  if (!j) return;
  job = j;
  stepOpen.clear();
  loadDataView(); renderPipeline(); loadReportView();
  try { localStorage.setItem(LAST_JOB, job.id); } catch { /* تجاهل */ }
  renderQueue();
  show(job.reportMd ? 'report' : (job.place.reviews.length ? 'pipeline' : 'data'));
  toast(job.place.identity.name || 'تقرير');
}

/* ───────────────────────── اختصارات لوحة المفاتيح ───────────────────────── */

function bindShortcuts() {
  document.addEventListener('keydown', async (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;

    if (e.ctrlKey && e.key === 'Enter') {
      const openStep = $('.step[data-open="1"] .btn');
      if (openStep) { e.preventDefault(); openStep.click(); }
      return;
    }
    if (e.altKey && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
      if (queue.size() < 2) return;
      e.preventDefault();
      jumpQueue(e.key === 'ArrowLeft' ? queue.next() : queue.prev());
      return;
    }
    if (e.ctrlKey && (e.key === 's' || e.key === 'S')) {
      e.preventDefault(); await persist(); toast('حُفِظ');
      return;
    }
    if (e.ctrlKey && (e.key === 'p' || e.key === 'P') && !$('#view-report').hidden) {
      e.preventDefault(); $('#btn-print').click();
      return;
    }
    if (e.key === 'Escape' && !typing) {
      $$('.step[data-open="1"]').forEach((n) => { n.dataset.open = '0'; });
    }
  });
}

function bindArchiveView() {
  let t = null;
  $('#ar-search').addEventListener('input', (e) => {
    clearTimeout(t);
    t = setTimeout(() => renderArchive(e.target.value), 200);
  });
  $('#btn-export-all').addEventListener('click', async () => {
    const jobs = await allJobs();
    safe.markBackup();
    download(`rabih-archive-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(jobs, null, 2), 'application/json');
  });
  $('#ar-import').addEventListener('change', async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      const arr = Array.isArray(data) ? data : [data];
      let n = 0;
      for (const j of arr) {
        if (!j?.id || !j?.ctx) continue;
        await saveJob(j); n += 1;
      }
      toast(`استُورد ${n} تقريرًا`);
      renderArchive($('#ar-search').value);
    } catch { toast('ملف غير صالح'); }
    e.target.value = '';
  });
}

/* ───────────────────────── الإقلاع ───────────────────────── */

async function boot() {
  if (!(await gate())) return;
  bindNewView();
  bindDataView();
  bindPipelineView();
  bindReportView();
  bindPlanView();
  bindOutputView();
  bindCompareView();
  bindGroupView();
  bindArchiveView();
  bindSafety();
  bindSettings();
  bindLexicon();
  bindModels();
  bindShortcuts();

  $$('[data-go]').forEach((b) => b.addEventListener('click', () => {
    const v = b.dataset.go;
    if (v === 'archive') { renderArchive($('#ar-search').value); renderSafety(); }
    if (v === 'compare') renderCompare();
    if (v === 'settings') { loadIdentity(); renderLockState(); renderLexicon(); renderModels(); }
    if (v === 'data' && job) loadDataView();
    show(v);
  }));

  let restored = null;
  try {
    const lastId = localStorage.getItem(LAST_JOB);
    if (lastId) restored = await getJob(lastId);
  } catch { /* تجاهل */ }

  job = restored || blankJob();

  if (restored) {
    // أعد ملء شاشة الإدخال بما كان.
    fillCities(job.ctx.regionId, job.ctx.cityId);
    fillCategories(job.ctx.groupId, job.ctx.categoryId);
    fillDistricts(job.ctx.cityId, job.ctx.districtName);
    $('#f-region').value = job.ctx.regionId || '';
    $('#f-group').value = job.ctx.groupId || '';
    $('#f-url').value = job.mapsUrl || '';
    $('#f-brand').value = job.ctx.brand || '';
    $('#f-branch').value = job.ctx.branch || '';
    loadDataView();
    renderPipeline();
    loadReportView();
    show(job.reportMd ? 'report' : (job.place.reviews.length ? 'pipeline' : 'data'));
    toast('استُعيد آخر تقرير');
  } else {
    show('new');
  }

  // العمل بلا اتصال: لا شيء يُرسَل إلى خادم أصلًا، والاتصال إنما يلزم لأول تحميل.
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('./sw.js').catch(() => { /* لا يمنع التشغيل */ });
  }

  renderQueue();

  window.addEventListener('beforeunload', (e) => {
    if (!dirty) return;
    e.preventDefault();
    e.returnValue = '';
  });
}

boot().catch((err) => {
  document.body.insertAdjacentHTML('afterbegin',
    `<div class="msg err" style="margin:16px">تعذّر تشغيل رابح: ${err.message}</div>`);
});
