// رابح — منطق الواجهة. ES modules خالصة، بلا مكتبات ولا أداة بناء.

import { REGIONS, CITIES, citiesOfRegion, cityById, regionById } from './data/cities.js';
import { CATEGORY_GROUPS, ALL_CATEGORIES, categoryById } from './data/categories.js';
import { districtsOf, addDistrict } from './data/districts.js';
import { parseMapsUrl, slugify } from './maps.js';
import { emptyPlace, assignReviewIds, validate, stats } from './schema.js';
import { parseReviews, parseHeader } from './parse.js';
import { STEPS, STAGE_NAMES, MODEL_PICKS } from './prompts.js';
import { buildReportHtml } from './report.js';
import { newId, saveJob, getJob, allJobs, deleteJob, buildTree, jobPath } from './store.js';

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const el = (tag, cls, html) => { const n = document.createElement(tag); if (cls) n.className = cls; if (html !== undefined) n.innerHTML = html; return n; };

const LAST_JOB = 'rabih:last-job';
const VIEWS = ['new', 'data', 'pipeline', 'report', 'archive', 'about'];

let job = null;
let dirty = false;

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
  scheduleSave();
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
    node.dataset.open = (!done && ready) ? '1' : '0';

    const head = el('header');
    head.innerHTML = `<b>${done ? '✓' : i + 1}</b>
      <div><div class="t">${step.title}</div>
      <div class="s">${done ? 'مكتملة — اضغط للتعديل' : (ready ? 'جاهزة' : 'تنتظر إكمال المرحلة السابقة')}</div></div>`;
    head.addEventListener('click', () => { node.dataset.open = node.dataset.open === '1' ? '0' : '1'; });
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
    ta.addEventListener('input', () => {
      job.out[step.key] = ta.value;
      scheduleSave();
      updateProgress();
    });
    ta.addEventListener('change', () => { renderPipeline(); });
    inner.append(lbl, ta);

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
  renderReport();
  renderStepsBar('report');
}

function currentHtml() {
  return buildReportHtml({
    place: job.place,
    ctx: job.ctx,
    markdown: $('#r-md').value,
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
  bindArchiveView();

  $$('[data-go]').forEach((b) => b.addEventListener('click', () => {
    const v = b.dataset.go;
    if (v === 'archive') renderArchive($('#ar-search').value);
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
