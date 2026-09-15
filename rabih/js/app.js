// رابح — منطق الواجهة. ES modules خالصة، بلا مكتبات ولا أداة بناء.

import { REGIONS, CITIES, citiesOfRegion, cityById, regionById } from './data/cities.js';
import { CATEGORY_GROUPS, ALL_CATEGORIES, categoryById } from './data/categories.js';
import { districtsOf, addDistrict } from './data/districts.js';
import { parseMapsUrl, slugify } from './maps.js';
import { emptyPlace, assignReviewIds, validate, stats } from './schema.js';
import { parseReviews, parseHeader } from './parse.js';
import { STEPS, STAGE_NAMES, MODEL_PICKS } from './prompts.js';
import { buildReportHtml } from './report.js';
import { topicStats, topComplaints, uncovered } from './lexicon.js';
import { verify } from './verify.js';
import { scan, withoutFlagged, FLAGS } from './anomaly.js';
import { comparablePlaces, timeline, competitors, benchmark } from './compare.js';
import { extractTasks, mergeTasks, progress, planMarkdown, defaultDue, STATUS } from './plan.js';
import { newId, saveJob, getJob, allJobs, deleteJob, buildTree, jobPath } from './store.js';

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const el = (tag, cls, html) => { const n = document.createElement(tag); if (cls) n.className = cls; if (html !== undefined) n.innerHTML = html; return n; };

const LAST_JOB = 'rabih:last-job';
const VIEWS = ['new', 'data', 'pipeline', 'report', 'compare', 'archive', 'about'];

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
  const blob = new Blob([content], { type });
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
    ctx: { regionId: '', regionName: '', cityId: '', cityName: '', groupId: '', categoryId: '', categoryName: '', districtName: '' },
    mapsUrl: '',
    place: emptyPlace(),
    out: {},
    reportMd: '',
    photos: [],
    plan: [],
    planInReport: false,
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

  $('#btn-start').addEventListener('click', onStart);
  $('#f-url').addEventListener('keydown', (e) => { if (e.key === 'Enter') onStart(); });
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
  renderTopics();
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
  renderTopics();
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
    renderParseStats(); renderTopics(); renderAnomaly();
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
    const models = el('div', 'models');
    models.innerHTML = picks.map((m, k) => {
      const free = m.slug.endsWith(':free');
      const label = picks.length > 1 && k === 0 ? 'الأنسب: ' : '';
      return `<span class="model${free ? ' free' : ''}" title="${m.note}">${label}${m.name}${free ? ' · مجاني' : ''}</span>`;
    }).join('');
    inner.appendChild(models);

    const row = el('div', 'row');
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
      if (text) download(`رابح-${step.key}-${slugify(job.place.identity.name)}.txt`, text);
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

function updateProgress() {
  const done = STEPS.filter((s) => (job.out[s.key] || '').trim()).length;
  const badge = $('#pipeline-progress');
  badge.textContent = `${done} من ${STEPS.length} خطوات`;
  badge.className = 'badge ' + (done === STEPS.length ? 'ok' : done ? 'mid' : '');
}

function bindPipelineView() {
  $('#btn-open-openrouter').addEventListener('click', () => window.open('https://openrouter.ai/chat', '_blank', 'noopener'));
  $('#btn-export-job').addEventListener('click', () => {
    download(`رابح-حالة-${slugify(job.place.identity.name)}.json`, JSON.stringify(job, null, 2), 'application/json');
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
  renderPlan();
  renderReport();
  renderStepsBar('report');
}

function currentHtml() {
  return buildReportHtml({
    place: job.place,
    ctx: job.ctx,
    markdown: reportMarkdown(),
    photos: job.photos,
  });
}

function renderReport() {
  const frame = $('#r-frame');
  frame.srcdoc = currentHtml();
}

function reportFileName(ext) {
  const c = job.ctx;
  return `${slugify(job.place.identity.name)}-${slugify(c.cityName)}-${new Date().toISOString().slice(0, 10)}.${ext}`;
}

function shareText() {
  const s = stats(job.place);
  const n = job.place.identity.name || 'المنشأة';
  return [
    `تقرير تحليلي عن: ${n}`,
    `${job.ctx.cityName || ''}${job.ctx.districtName ? ' — ' + job.ctx.districtName : ''} · ${job.ctx.categoryName || ''}`,
    `التقييم: ${s.googleAverage ?? s.sampleAverage ?? '—'} من 5${s.googleCount ? ` (${s.googleCount} تقييمًا)` : ''}`,
    `التعليقات المُحلَّلة: ${s.total}`,
    '',
    'التقرير الكامل مرفق بصيغة PDF.',
    '— أُعدّ عبر منصة رابح',
  ].join('\n');
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

  box.innerHTML = `
    ${b.rank ? `<div class="msg ${b.rank.position === 1 ? 'ok' : 'warn'}"><b>الترتيب ${b.rank.position} من ${b.rank.of} بـ${b.rank.by}.</b></div>` : ''}
    <div class="table-wrap"><table class="mini"><thead>${head}</thead><tbody>${rows}</tbody></table></div>
    ${topics ? `<h3 class="sub">المحاور المشتركة</h3><div class="table-wrap"><table class="mini">
      <thead><tr><th>الموضوع</th>${b.rows.map((r) => `<th class="${r.isTarget ? 'me' : ''}">${r.name}</th>`).join('')}</tr></thead>
      <tbody>${topics}</tbody></table></div>` : '<p class="fine">لا محاور مشتركة بعدُ بين هذه المنشآت.</p>'}`;
}

function bindCompareView() {
  $('#cmp-place').addEventListener('change', fillTimelineSelects);
  $('#cmp-from').addEventListener('change', renderTimeline);
  $('#cmp-to').addEventListener('change', renderTimeline);
  $('#cmp-target').addEventListener('change', renderBenchmark);
}

function bindReportView() {
  $('#r-md').addEventListener('input', (e) => { job.reportMd = e.target.value; scheduleSave(); });
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
    const subject = `تقرير تحليلي — ${job.place.identity.name || 'منشأة'}`;
    location.href = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(shareText())}`;
  });
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

  const del = el('button', 'btn danger sm', 'حذف');
  del.addEventListener('click', async () => {
    if (!confirm(`حذف تقرير «${j.place?.identity?.name || 'بلا اسم'}» نهائيًّا؟`)) return;
    await deleteJob(j.id);
    if (job?.id === j.id) job = blankJob();
    renderArchive($('#ar-search').value);
    toast('حُذف');
  });

  const sp = el('span', 'spacer');
  row.append(sp, open, del);
  return row;
}

function bindArchiveView() {
  let t = null;
  $('#ar-search').addEventListener('input', (e) => {
    clearTimeout(t);
    t = setTimeout(() => renderArchive(e.target.value), 200);
  });
  $('#btn-export-all').addEventListener('click', async () => {
    const jobs = await allJobs();
    download(`رابح-أرشيف-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(jobs, null, 2), 'application/json');
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
  bindNewView();
  bindDataView();
  bindPipelineView();
  bindReportView();
  bindPlanView();
  bindCompareView();
  bindArchiveView();

  $$('[data-go]').forEach((b) => b.addEventListener('click', () => {
    const v = b.dataset.go;
    if (v === 'archive') renderArchive($('#ar-search').value);
    if (v === 'compare') renderCompare();
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
    loadDataView();
    renderPipeline();
    loadReportView();
    show(job.reportMd ? 'report' : (job.place.reviews.length ? 'pipeline' : 'data'));
    toast('استُعيد آخر تقرير');
  } else {
    show('new');
  }

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
