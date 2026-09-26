// رابح — منطق الواجهة. ES modules خالصة، بلا مكتبات ولا أداة بناء.

import { citiesOfRegion, cityById, regionById, allCities, addCity, allRegions, addRegion } from './data/cities.js';
import { CATEGORY_GROUPS, categoryById, allCategories, addCategory } from './data/categories.js';
import { districtsOf, addDistrict } from './data/districts.js';
import { parseMapsUrl, expandShortUrl, asciiName } from './maps.js';
import { emptyPlace, assignReviewIds, validate, stats } from './schema.js';
import { parseReviews, parseHeader } from './parse.js';
import { STEPS, STAGE_NAMES, MODEL_PICKS } from './prompts.js';
import { buildReportHtml } from './report.js';
import { topicStats, topComplaints, uncovered } from './lexicon.js';
import { verify } from './verify.js';
import { scan, withoutFlagged, FLAGS } from './anomaly.js';
import { comparablePlaces, timeline, competitors, benchmark } from './compare.js';
import { extractTasks, mergeTasks, progress, planMarkdown, defaultDue, STATUS } from './plan.js';
import { TEMPLATES, DEFAULT_TEMPLATE, applyTemplate, droppedSections, sectorFor } from './templates.js';
import { buildXlsx, jobSheets, archiveSheet, reviewsCsv } from './export.js';
import { recentVsOlder, monthly, alerts as recencyAlerts, topicAges } from './recency.js';
import * as safe from './persist.js';
import { brands, analyze, groupPrompt } from './group.js';
import { buildGroupReportHtml } from './report.js';
import { CHARTER, promptDesign, promptReplyDrafts, batchCount, promptNormalizeBatch } from './prompts.js';
import * as identity from './brand.js';
import * as lock from './lock.js';
import * as queue from './queue.js';
import { build as buildMessage, subject as messageSubject, situationLabel } from './messages.js';
import { audit, fixPrompt } from './completeness.js';
import { score as confidenceScore } from './confidence.js';
import { extract as extractEntities } from './entities.js';
import { analyze as analyzeReplies } from './replies.js';
import { internalBenchmark } from './compare.js';
import * as models from './models.js';
import { TOPICS, addKeyword, removeKeyword, customKeywords, resetCustom } from './lexicon.js';
import { parsePopularTimes, parseQna, peakInsight, tagLanguages, qnaInsight, contextBlock } from './peak.js';
import { fetchPlace, merge as mergePlace } from './places.js';
import { fetchAllReviews, mergeReviews } from './reviews.js';
import { runStep, pendingSteps, callModel } from './runner.js';
import { dataStamp, staleSteps } from './stamp.js';
import { checkSource, exclusionNote } from './integrity.js';
import { priorities, priorityNotes, rankOf, loneTag } from './priority.js';
import { PLATFORMS, platformName, compareSources } from './sources.js';
import { ledger, setClient } from './clients.js';
import { scanNetwork } from './network.js';
import { wilson, pretty as ciPretty, significant } from './interval.js';
import { sampleBias } from './bias.js';
import { isOn as privacyOn, setOn as setPrivacy } from './privacy.js';
import { runEval, saveRun, history as evalHistory } from './eval.js';
import { bilingual } from './i18n.js';
import { sign, verifyFile, pretty } from './signature.js';
import { planEffect } from './effect.js';
import { push as cloudPush, pull as cloudPull, removeBox, newBoxId } from './cloud.js';
import { publish as sharePublish, unpublish as shareUnpublish } from './share.js';
import { ladder } from './stars.js';
import { impact } from './impact.js';
import { compare as compareOutputs, mergeHint } from './agreement.js';
import * as history from './history.js';
import * as tour from './tour.js';
import { newId, saveJob, getJob, allJobs, deleteJob, buildTree, jobPath,
         saveSnapshot, snapshotsOf, getSnapshot, deleteSnapshot } from './store.js';

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const el = (tag, cls, html) => { const n = document.createElement(tag); if (cls) n.className = cls; if (html !== undefined) n.innerHTML = html; return n; };

/**
 * هروبٌ لكل نصٍّ لا نكتبه نحن: نصوص التعليقات، ومخرجات النماذج، وما يكتبه المستخدم.
 *
 * ليست احتياطًا نظريًّا: مخرجُ نموذجٍ يحمل `<img onerror=...>` كان يُنفَّذ فعلًا في
 * أصل الموقع — حيث يقبع أرشيف العملاء كله في IndexedDB. والطريق واقعي: تعليقٌ خبيث
 * على قوقل، يُلصَق، فيردّده النموذج في مخرجه، فيُلصَق مخرجه.
 */
/** تاريخٌ ميلادي بالحروف العربية: يرفع لبس 10/15 عن 15/10. */
const arDate = (iso) => {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return '';
  try { return d.toLocaleDateString('ar-SA-u-ca-gregory', { day: 'numeric', month: 'long', year: 'numeric' }); }
  catch { return iso; }
};

const esc = (v) => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

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
    designHtml: '',
    lang: 'ar',          // لغة التقرير — والاقتباسات بالعربية دائمًا
    replyDrafts: '',     // مسوّدات ردود المالك — اقتراحٌ لا يدخل التقرير
    shareId: '',         // معرّف الرابط الخاص إن نُشر
    stamps: {},          // بصمة البيانات وقت إنتاج كل خطوة
    excluded: [],        // ما استُبعد بقرارك — يُحفَظ ويُقَرّ به، ولا يُمحى
    assume: {},          // أرقام المالك للأثر المالي — فرضُه لا تقديرنا
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

/** اسمُ الملفّ المختار بالعربية — الحقلُ الأصلي مُخفًى، فلولاه لم يدرِ أوقع اختياره أم لا. */
function bindFilePickers() {
  for (const inp of document.querySelectorAll('.filepick input[type="file"]')) {
    inp.addEventListener('change', () => {
      const out = inp.parentElement.querySelector('.filepick-name');
      if (!out) return;
      const n = inp.files?.length || 0;
      out.textContent = n === 0 ? ''
        : n === 1 ? inp.files[0].name
        : n === 2 ? 'ملفّان' : `${n} ملفات`;
    });
  }
}

function show(view) {
  for (const v of VIEWS) {
    const node = $(`#view-${v}`);
    if (node) node.hidden = v !== view;
  }
  $$('.topbar nav button').forEach((b) => {
    b.setAttribute('aria-current', String(b.dataset.go === view || (view === 'data' && b.dataset.go === 'new') || (view === 'pipeline' && b.dataset.go === 'new') || (view === 'report' && b.dataset.go === 'new')));
  });
  renderStepsBar(view);
  /* **الشاشةُ تُحمَّل متى عُرضت، لا متى سُلك إليها طريقٌ بعينه.**
     قائمةُ «قالب الإخراج» كانت تُملأ في `loadReportView` وحدها، ومَن بلغ
     التقريرَ من غير شريط الخطوات — كفاتح التقرير النموذجي — وجدها فارغةً:
     قِيست فكانت صفرَ خيارات. فالتحميل هنا حارسٌ لكل الطرق. */
  if (view === 'report' && !$('#r-template')?.options.length) fillTemplates();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

const STEP_LABELS = [
  { key: 'new',      n: '1', t: 'المنشأة' },
  { key: 'data',     n: '2', t: 'البيانات' },
  { key: 'pipeline', n: '3', t: 'خط التحليل' },
  { key: 'report',   n: '4', t: 'التقرير' },
];

function renderStepsBar(view) {
  const done = {
    new: !!job?.ctx?.cityId,
    data: (job?.place?.reviews?.length || 0) > 0,
    pipeline: !!job?.out?.am,
    // التقرير مبلوغٌ متى تمّ الدمج النهائي، لا متى زُرتَ الشاشة: وإلا بقي
    // الطريق إليه مقفلًا بعد اكتمال التحليل كلّه.
    report: !!(job?.reportMd || job?.out?.am),
  };
  const idx = STEP_LABELS.findIndex((s) => s.key === view);
  /* الشريط دليلٌ وطريقٌ معًا: كان يُعلِم بالمرحلة ولا يُنقَل به، وشاشة التقرير
     بلا زرّ رجوع — فمن أراد تصحيح خطوةٍ بعد أن رأى تقريره لم يجد سبيلًا إلا
     المرور بالأرشيف. والمرحلة التي لم تُبلَغ بعد تبقى غير قابلة للنقر. */
  const html = STEP_LABELS.map((s, i) => {
    const cls = i === idx ? 'active' : (done[s.key] ? 'done' : '');
    const reachable = i <= idx || done[s.key];
    return `<button type="button" class="pill ${cls}${reachable ? '' : ' locked'}"
      data-step-go="${s.key}"${reachable ? '' : ' disabled'}
      title="${reachable ? 'انتقل إلى: ' + s.t : 'لم تُبلَغ بعد'}"><b>${done[s.key] && i !== idx ? '✓' : s.n}</b>${s.t}</button>`;
  }).join('');
  ['#steps-bar', '#steps-bar-2', '#steps-bar-3', '#steps-bar-4'].forEach((sel) => {
    const n = $(sel);
    if (!n) return;
    n.innerHTML = html;
    n.querySelectorAll('[data-step-go]').forEach((btn) => btn.addEventListener('click', () => {
      const key = btn.dataset.stepGo;
      if (key === 'data') loadDataView();
      if (key === 'pipeline') renderPipeline();
      if (key === 'report') loadReportView();
      show(key);
    }));
  });
}

/* ───────────────────────── ١) شاشة الإدخال ───────────────────────── */

function fillRegions(selected = '') {
  const sel = $('#f-region');
  sel.innerHTML = '<option value="">— اختر المنطقة —</option>' +
    allRegions().map((r) => `<option value="${esc(r.id)}"${r.id === selected ? ' selected' : ''}>${esc(r.name)}</option>`).join('');
}

function fillCities(regionId, selected = '') {
  const sel = $('#f-city');
  const list = regionId ? citiesOfRegion(regionId) : allCities();
  sel.innerHTML = '<option value="">— اختر المدينة —</option>' +
    list.map((c) => `<option value="${c.id}"${c.id === selected ? ' selected' : ''}>${c.name}</option>`).join('');
}

function fillGroups() {
  $('#f-group').innerHTML = '<option value="">— اختر المجال —</option>' +
    CATEGORY_GROUPS.map((g) => `<option value="${g.id}">${g.name}</option>`).join('');
}

function fillCategories(groupId, selected = '') {
  const sel = $('#f-category');
  const list = groupId ? allCategories().filter((c) => c.group === groupId) : allCategories();
  sel.innerHTML = '<option value="">— اختر التصنيف —</option>' +
    list.map((c) => `<option value="${c.id}"${c.id === selected ? ' selected' : ''}>${c.name}</option>`).join('');
}

function fillDistricts(cityId, selected = '') {
  const sel = $('#f-district');
  const list = cityId ? districtsOf(cityId) : [];
  sel.innerHTML = '<option value="">— اختر الحي —</option>' +
    list.map((d) => `<option value="${esc(d)}"${d === selected ? ' selected' : ''}>${esc(d)}</option>`).join('');
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
      if (!r.ok) { message('#new-msg', 'err', r.reason); return; }
      if (!r.short) { message('#new-msg', 'ok', `الرابط صالح${r.data.name ? ` — المنشأة: ${r.data.name}` : ''}.`); return; }
      /* الرابطُ المختصر يُفكّ في الخادم: كان الموقع يقول «أدخِل البيانات يدويًّا»
         وهو تهرّبٌ عن تحويلةٍ واحدة يستطيع الخادمُ تتبّعها بلا مفتاح. */
      message('#new-msg', 'warn', r.reason);
      expandShortUrl(v).then((x) => {
        if ($('#f-url').value.trim() !== v) return;      // بدّل الرابطَ أثناء الانتظار
        if (x?.name) message('#new-msg', 'ok', `الرابط صالح — المنشأة: ${x.name}.`);
        else if (x?.url) message('#new-msg', 'ok', 'فُكّ الرابط المختصر، ولم يحمل اسمًا — يُملأ الاسم في شاشة البيانات.');
        else message('#new-msg', 'warn', 'رابط مختصر، وتعذّر فكّه الآن — يُقبَل كما هو ويُملأ الاسم في شاشة البيانات.');
      });
    }, 400);
  });

  $('#btn-add-region').addEventListener('click', () => {
    const name = prompt('اسم المنطقة أو الدولة الجديدة:');
    if (!name) return;
    const id = addRegion(name);
    if (!id) { toast('موجودة أصلًا أو الاسم فارغ'); return; }
    fillRegions(id);
    fillCities(id);
    fillDistricts('');
    toast('أُضيفت — وتظهر في شجرة الأرشيف كغيرها');
  });

  $('#btn-add-city').addEventListener('click', () => {
    const regionId = $('#f-region').value;
    if (!regionId) { toast('اختر المنطقة أولًا'); return; }
    const name = prompt('اسم المدينة الجديدة:');
    if (!name) return;
    const id = addCity(regionId, name);
    if (!id) { toast('المدينة موجودة أصلًا أو الاسم فارغ'); return; }
    fillCities(regionId, id);
    fillDistricts(id);
    toast('أُضيفت المدينة');
  });

  $('#btn-add-category').addEventListener('click', () => {
    const groupId = $('#f-group').value;
    if (!groupId) { toast('اختر مجال النشاط أولًا'); return; }
    const name = prompt('اسم التصنيف الجديد:');
    if (!name) return;
    const id = addCategory(groupId, name);
    if (!id) { toast('التصنيف موجود أصلًا أو الاسم فارغ'); return; }
    fillCategories(groupId, id);
    toast('أُضيف التصنيف — ويرث محاور مجموعته في التحليل');
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
    $('#brand-list').innerHTML = names.map((n) => `<option value="${esc(n)}"></option>`).join('');
  } catch { /* لا يمنع التشغيل */ }
}

/** بذر دفعة: قائمة محلات تُنشأ تقاريرها دفعةً وتدخل الطابور بالترتيب. */
function bindBulk() {
  $('#btn-bulk').addEventListener('click', () => {
    const f = $('#bulk-field');
    f.hidden = !f.hidden;
    if (!f.hidden) $('#bulk-list').focus();
  });

  $('#btn-bulk-create').addEventListener('click', async () => {
    const cityId = $('#f-city').value;
    const categoryId = $('#f-category').value;
    if (!cityId || !categoryId) { message('#new-msg', 'err', 'اختر المدينة والتصنيف أولًا — تُطبَّق على الدفعة كلها.'); return; }

    const city = cityById(cityId);
    const cat = categoryById(categoryId);
    const region = regionById($('#f-region').value || city?.region);
    const brand = $('#f-brand').value.trim();

    const lines = $('#bulk-list').value.split('\n').map((l) => l.trim()).filter(Boolean);
    if (!lines.length) { message('#new-msg', 'err', 'القائمة فارغة.'); return; }

    const created = [];
    const skipped = [];
    for (const line of lines) {
      const [rawName, rawUrl, rawDistrict] = line.split('|').map((x) => (x || '').trim());
      const name = rawName || '';
      let url = rawUrl || '';
      if (!name && !url) continue;

      let expanded = null;
      if (url) {
        const chk = parseMapsUrl(url);
        if (!chk.ok) { skipped.push(`${name || url}: ${chk.reason}`); continue; }
        if (chk.short) { expanded = await expandShortUrl(url); if (expanded?.url) url = expanded.url; }
      }

      const j = blankJob();
      j.mapsUrl = url;
      j.ctx = {
        regionId: region?.id || '', regionName: region?.name || '',
        cityId, cityName: city?.name || '',
        groupId: cat?.group || '', categoryId, categoryName: cat?.name || '',
        districtName: rawDistrict || '', brand, branch: name,   // ما كتبته الوكالةُ اسمًا هو اسمُ الفرع في تقرير المجموعة
      };
      j.place.mapsUrl = url;
      j.place.identity.name = name || parseMapsUrl(url)?.data?.name || expanded?.name || '';
      j.place.identity.category = cat?.name || '';
      await saveJob(j);
      queue.add(j.id);
      created.push(j.place.identity.name || 'بلا اسم');
    }

    if (!created.length) {
      message('#new-msg', 'err', 'لم يُنشأ شيء.', skipped);
      return;
    }
    message('#new-msg', skipped.length ? 'warn' : 'ok',
      `أُنشئ ${created.length} تقريرًا ودخلت الطابور: ${created.join('، ')}`, skipped);
    $('#bulk-list').value = '';
    $('#bulk-field').hidden = true;
    await renderQueue();
    await fillBrandList();
    const first = queue.goTo(0);
    if (first) jumpQueue(first);
  });
}

async function onStart() {
  let url = $('#f-url').value.trim();
  const regionId = $('#f-region').value;
  const cityId = $('#f-city').value;
  const categoryId = $('#f-category').value;
  const districtName = $('#f-district').value;

  /* **الرابط وحده يبدأ.**
     كانت المدينةُ والتصنيفُ والحيُّ شروطًا للبدء، فيقف صاحب المحل أمام ثمانية
     حقولٍ وهو جاء يسأل «كيف حال محلّي؟». وهذه الثلاثة تنفع الأرشيف وقالبَ
     القطاع، ولا يتوقّف عليها تحليلُ تعليقاته. فصارت تُطلَب ولا تَحجِب:
     يُنبَّه إلى ما ينقص ويُمضى، وتُستكمَل من شاشة البيانات متى شاء. */
  const errors = [];
  if (!url) errors.push('رابط قوقل مابز مطلوب.');
  else { const r = parseMapsUrl(url); if (!r.ok) errors.push(r.reason); }
  if (errors.length) { message('#new-msg', 'err', 'أكمل ما يلي قبل البدء:', errors); return; }

  const missing = [];
  if (!cityId) missing.push('المدينة');
  if (!categoryId) missing.push('التصنيف');
  if (!districtName) missing.push('الحي');

  let parsed = parseMapsUrl(url);
  /* وعند البدء يُفكّ المختصرُ فيُحفَظ الرابطُ الكامل والاسمُ معًا — لا الرابطُ العاري. */
  if (parsed.ok && parsed.short) {
    const x = await expandShortUrl(url);
    if (x?.url) { url = x.url; parsed = parseMapsUrl(url); if (!parsed.ok) parsed = { ok: true, data: { name: x.name, coords: x.coords, placeId: x.placeId } }; }
  }
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
  /* والتنبيه يقع حيث صار المستخدم لا حيث كان: وُضع أولًا في شاشة الإدخال
     فاختفى معها قبل أن يُقرأ. */
  if (missing.length) {
    message('#parse-msg', 'warn', `بدأنا بالرابط وحده. وما ينقص (${missing.join('، ')}) يُستكمَل متى شئت:`, [
      'التصنيف يختار قالب القطاع — وبدونه يُستعمل العام.',
      'المدينة والحي يجمعان تقاريرك في الأرشيف ولا يمسّان تحليل تعليقاتك.',
    ]);
  }
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
  '#d-qna':     (p, v) => { p.qna = parseQna(v); p.qnaRaw = v; },
  '#d-peak':    (p, v) => { p.popularTimes = parsePopularTimes(v); p.peakRaw = v; },
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
  $('#d-withtext').value = p.ratings.withText ?? '';
  for (const star of [5, 4, 3, 2, 1]) {
    const el2 = $(`#d-d${star}`);
    if (el2) el2.value = p.ratings.distribution?.[star] ?? '';
  }
  $('#d-hours').value = (p.identity.hours || []).join('\n');
  $('#d-attrs').value = (p.identity.attributes || []).join('\n');
  $('#d-notes').value = p.notes || '';
  $('#d-qna').value = p.qnaRaw || '';
  $('#d-peak').value = p.peakRaw || '';
  $('#d-reviews').value = job.rawPaste || '';
  renderParseStats();
  renderRecency();
  renderTopics();
  renderEntities();
  renderReplies();
  renderContext();
  renderAnomaly();
  renderIntegrity();
  for (const [id, key] of [['#as-ticket', 'ticket'], ['#as-monthly', 'monthly'], ['#as-loss', 'loss'], ['#as-permonth', 'perMonth']]) {
    const el2 = $(id);
    if (el2) el2.value = job.assume?.[key] ?? '';
  }
  /* إدراجُ المال قرارٌ صريح، والأصلُ إطفاؤه — فلا يُقرأ فرضُ المالك حكمًا. */
  if ($('#as-show')) $('#as-show').checked = !!job.assume?.show;
  renderSources();
  renderBias();
  renderConfidenceHint();
  renderPriority();
  renderStars();
  renderImpactPreview();
  renderPhotoChips();
}

function bindDataView() {
  for (const [sel, setter] of Object.entries(DATA_FIELDS)) {
    $(sel).addEventListener('input', (e) => { setter(job.place, e.target.value); scheduleSave(); });
  }
  $('#d-qna').addEventListener('blur', renderContext);
  $('#d-peak').addEventListener('blur', renderContext);

  $('#d-reviews').addEventListener('input', (e) => { job.rawPaste = e.target.value; scheduleSave(); });
  $('#d-reviews').addEventListener('paste', () => setTimeout(doParse, 50));
  fillPlatforms();
  $('#btn-parse').addEventListener('click', () => doParse(false));
  $('#btn-parse-add').addEventListener('click', () => doParse(true));
  $('#btn-clear-reviews').addEventListener('click', () => {
    if (!confirm('مسح التعليقات الملصوقة وما استُخرج منها؟')) return;
    $('#d-reviews').value = '';
    job.rawPaste = '';
    job.place.reviews = [];
    renderParseStats();
    message('#parse-msg', 'ok', '');
    scheduleSave();
  });

  $('#as-show')?.addEventListener('change', (e) => {
    job.assume = job.assume || {};
    job.assume.show = e.target.checked;
    scheduleSave();
    renderImpactPreview();
    renderReport();
    renderShareMessage();
    toast(e.target.checked ? 'سيظهر الأثر المالي في التقرير — مقرونًا بأنه فرضُك' : 'لن يظهر الأثر المالي في التقرير');
  });

  // أرقام المالك للأثر المالي: تُحفَظ وتُعاد حسابها أمامه فورًا.
  for (const [id, key] of [['#as-ticket', 'ticket'], ['#as-monthly', 'monthly'], ['#as-loss', 'loss'], ['#as-permonth', 'perMonth']]) {
    const el2 = $(id);
    if (!el2) continue;
    el2.addEventListener('input', (e) => {
      job.assume = job.assume || {};
      job.assume[key] = e.target.value === '' ? '' : Number(e.target.value);
      renderImpactPreview();
      if (key === 'perMonth') renderStars();
      scheduleSave();
    });
  }

  // عدد المنصوصة وتوزيع النجوم: يصحّحان مقام التغطية ويكشفان الانحياز.
  $('#d-withtext').addEventListener('input', (e) => {
    job.place.ratings.withText = e.target.value === '' ? null : Number(e.target.value);
    renderParseStats(); renderBias(); renderConfidenceHint(); scheduleSave();
  });
  for (const star of [5, 4, 3, 2, 1]) {
    const el2 = $(`#d-d${star}`);
    if (!el2) continue;
    el2.addEventListener('input', (e) => {
      job.place.ratings.distribution = job.place.ratings.distribution || {};
      job.place.ratings.distribution[star] = e.target.value === '' ? null : Number(e.target.value);
      renderBias(); scheduleSave();
    });
  }

  $('#btn-places').addEventListener('click', onFetchPlaces);
  $('#btn-fetch-reviews').addEventListener('click', onFetchReviews);
  $('#d-photos').addEventListener('change', onPhotos);
  $('#btn-to-pipeline').addEventListener('click', () => {
    const v = validate(job.place);
    if (!v.ok) { message('#parse-msg', 'err', 'لا يمكن المتابعة:', v.errors); return; }
    if (v.warnings.length) message('#parse-msg', 'warn', 'تنبيهات (لا تمنع المتابعة):', v.warnings);
    renderPipeline();
    show('pipeline');
  });
}

/**
 * جلب **كل** التعليقات من مزوّد وسيط.
 *
 * ولا يُدهَس ما لُصق بيدك: الجديد يُدمج ويُعلَن كم أُضيف وكم كان مكررًا.
 * والمُعاد يُقارَن بما يقوله قوقل (`claimed`) فيُقاس النقص ولا يُخفى.
 */
async function onFetchReviews() {
  const url = (job.mapsUrl || '').trim();
  if (!url) { message('#reviews-msg', 'err', 'لا رابط في هذا التقرير.'); return; }

  const btn = $('#btn-fetch-reviews');
  const limit = parseInt($('#rv-limit').value || '0', 10) || 0;
  btn.disabled = true;
  message('#reviews-msg', 'warn', 'يُجلب من المزوّد… قد يستغرق دقيقة لمحلٍّ كثير التعليقات.');

  const r = await fetchAllReviews(url, { limit, sort: 'newest' });
  btn.disabled = false;

  if (!r.ok) {
    message('#reviews-msg', 'err', r.error, r.needsKey ? [
      'أنشئ حسابًا في Outscraper أو Apify، وخذ المفتاح.',
      'ضعه في Netlify → Site settings → Environment variables باسم OUTSCRAPER_KEY أو APIFY_TOKEN.',
      'ثم أعد نشر الموقع وأعد المحاولة.',
    ] : []);
    return;
  }

  const m = mergeReviews(job.place.reviews, r.reviews);
  job.place.reviews = m.reviews;
  assignReviewIds(job.place);

  // ما جاء من المزوّد ليس لصقًا، فلا يُكتب في مربع اللصق ولا يُمحى بمسحه.
  if (r.average !== null && job.place.ratings.average === null) {
    job.place.ratings.average = r.average;
    $('#d-avg').value = r.average;
  }
  if (r.claimed && job.place.ratings.count === null) {
    job.place.ratings.count = r.claimed;
    $('#d-count').value = r.claimed;
  }
  if (r.placeName && !job.place.identity.name.trim()) {
    job.place.identity.name = r.placeName;
    $('#d-name').value = r.placeName;
  }

  const lines = [`أُضيف ${m.added} تعليقًا${m.duplicates ? `، وتُرك ${m.duplicates} مكررًا` : ''}.`];
  if (r.claimed) {
    const pct = Math.round((job.place.reviews.length / r.claimed) * 100);
    lines.push(`<b>عندك الآن ${job.place.reviews.length} من أصل ${r.claimed} تقييمًا (${pct}%).</b>`);
    if (r.fetched < r.claimed) {
      lines.push('النقص طبيعي: التقييم بلا نصّ لا يُعيده المزوّد، وقوقل يعدّه في الإجمالي.');
    }
  }
  if (r.truncated) lines.push('بُلغ السقف الأعلى (2000)، فما زاد لم يُجلَب.');
  if (m.empties) lines.push(`${m.empties} عنصرًا بلا نصّ ولا تقييم أُسقط.`);
  lines.push(`المزوّد: ${r.provider}.`);

  message('#reviews-msg', 'ok', 'تمّ الجلب.', lines);
  $('#parse-info').textContent = `من المزوّد — ${job.place.reviews.length} تعليقًا`;
  $('#parse-info').className = 'badge ok';
  renderParseStats();
  scheduleSave();
}

/** جلب بطاقة المنشأة من قوقل عبر الدالة الخادمية. */
async function onFetchPlaces() {
  const url = (job.mapsUrl || '').trim();
  if (!url) { message('#places-msg', 'err', 'لا رابط في هذا التقرير.'); return; }

  const btn = $('#btn-places');
  btn.disabled = true;
  message('#places-msg', 'warn', 'يُجلب من قوقل…');

  const r = await fetchPlace(url);
  btn.disabled = false;

  if (!r.ok) {
    message('#places-msg', 'err', r.error, r.needsKey
      ? ['أضف GOOGLE_PLACES_KEY في متغيّرات البيئة على Netlify، ثم أعد المحاولة.']
      : []);
    return;
  }

  const out = mergePlace(job.place, r.place, { photos: r.photos, photoSink: job.photos });
  loadDataView();
  scheduleSave();

  const cov = r.place.coverage || {};
  const lines = [];
  if (out.filled.length) lines.push(`مُلئ: ${out.filled.join('، ')}.`);
  if (out.kept.length) lines.push(`أُبقي ما كتبتَه بيدك ولم يُدهَس: ${out.kept.join('، ')}.`);
  lines.push(`التعليقات: أُضيف ${out.reviewsAdded}${out.duplicates ? `، وتُرك ${out.duplicates} مكررًا` : ''}.`);
  if (cov.reviewsTotal) {
    lines.push(`<b>قوقل أعطى ${cov.reviewsReturned} من أصل ${cov.reviewsTotal} تقييمًا</b> — الباقي يُلصَق يدويًّا. هذا حدُّ واجهتهم لا نقصٌ في الجلب.`);
  }
  if (out.photosAdded) lines.push(`الصور: أُضيفت ${out.photosAdded}.`);

  message('#places-msg', 'ok', 'تمّ الجلب من قوقل.', lines);
}

/** يملأ قائمة المنصّات مرةً واحدة. */
function fillPlatforms() {
  const sel = $('#d-platform');
  if (!sel || sel.options.length) return;
  sel.innerHTML = PLATFORMS.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
}

/** مقارنة المصادر — لا تظهر إلا إذا لُصق أكثر من منصّة. */
function renderSources() {
  const box = $('#sources-box');
  if (!box) return;
  const c = compareSources(job.place);
  if (!c.ok) { box.innerHTML = ''; return; }
  box.innerHTML = `<h3 class="mini-h">مقارنة المصادر</h3>
    <div class="table-wrap"><table class="mini"><thead><tr><th>المصدر</th><th>التعليقات</th><th>المتوسط</th><th>السلبي</th></tr></thead><tbody>${
      c.platforms.map((p) => `<tr><td><b>${esc(p.name)}</b></td><td>${p.count}</td><td>${p.average ?? '—'}</td><td>${p.negShare === null ? '—' : p.negShare + '%'}</td></tr>`).join('')
    }</tbody></table></div>
    ${c.gaps.length ? `<ul class="fine">${c.gaps.slice(0, 4).map((g) => `<li><b>${esc(g.name)}</b>: ${g.highShare}% في ${esc(g.high)} مقابل ${g.lowShare}% في ${esc(g.low)}</li>`).join('')}</ul>` : ''}`;
}

function doParse(append = false) {
  const raw = $('#d-reviews').value;
  job.rawPaste = raw;
  if (!raw.trim()) { message('#parse-msg', 'warn', 'المربع فارغ.'); return; }

  const { reviews, format } = parseReviews(raw);
  if (!reviews.length) {
    message('#parse-msg', 'err', 'لم يُتعرَّف على أي تعليق.', [
      'يُرسى كل تعليق على تاريخه («قبل شهر») أو على تقييمه — فتأكد أن أحدهما في اللصق.',
      'واللصق من صفحة قوقل يأتي بلا نجوم عادةً، وهذا مقبول: النصوص تُحلَّل والتقييم يبقى فارغًا.',
      'أو استعمل الصيغة الصريحة: 5 | الاسم | قبل شهر ثم النص ثم سطر ---',
    ]);
    return;
  }

  const before = append ? job.place.reviews.length : 0;
  const platform = $('#d-platform')?.value || 'google';
  const tagged = reviews.map((r) => ({ ...r, platform }));

  /* «إضافة إلى ما سبق»: لصقُ منصّةٍ ثانية لا يمحو الأولى. والمكرّر لا يُضاف. */
  if (append) {
    const seen = new Set(job.place.reviews.map((r) => `${r.author}\u0000${r.text}`));
    const fresh = tagged.filter((r) => !seen.has(`${r.author}\u0000${r.text}`));
    job.place.reviews = [...job.place.reviews, ...fresh];
  } else {
    job.place.reviews = tagged;
  }
  assignReviewIds(job.place);

  // إن لُصقت بطاقة المنشأة مع التعليقات، استفد منها دون أن تدهس ما أدخله المستخدم.
  const head = parseHeader(raw.split('\n').slice(0, 8).join('\n'));
  if (head.average && job.place.ratings.average === null) { job.place.ratings.average = head.average; $('#d-avg').value = head.average; }
  if (head.count && job.place.ratings.count === null) { job.place.ratings.count = head.count; $('#d-count').value = head.count; }

  const names = { json: 'JSON', structured: 'الصيغة الصريحة', loose: 'اللصق الخام' };
  // بعد الإضافة يُعرَض المجموع لا عدد اللصقة وحدها، وإلا ظنّ المستخدم أن ما سبق ضاع.
  const totalNow = job.place.reviews.length;
  $('#parse-info').textContent = append
    ? `${names[format]} — أُضيف ${totalNow - before} · المجموع ${totalNow} تعليقًا`
    : `${names[format]} — ${totalNow} تعليقًا`;
  $('#parse-info').className = 'badge ok';

  const v = validate(job.place);

  /* نجوم قوقل صورةٌ لا نصّ، فالنسخ من الصفحة يأتي بلا تقييمات غالبًا. ولا يُخمَّن
     رقمٌ ولا يُسكَت عن غيابه: يُقال كم تعليقًا بلا تقييم وما الذي يسقط بسببه. */
  const unrated = reviews.filter((r) => r.rating === null).length;
  const notes = [...v.warnings];
  if (unrated) {
    notes.unshift(unrated === reviews.length
      ? `<b>لا تقييم في أيٍّ منها.</b> هذا متوقَّع: قوقل يرسم النجوم صورةً فلا تُنسَخ مع النص. النصوص تُحلَّل كاملةً، ويسقط ما يقوم على النجوم: متوسط العيّنة وتوزيعها وفرز الإيجابي من السلبي.`
      : `<b>${unrated} من ${reviews.length} بلا تقييم</b> — تُحلَّل نصوصها، ولا تدخل في متوسط العيّنة ولا توزيعها.`);
    notes.push('لإضافة النجوم: اكتب قبل كل تعليق سطرًا بصيغة <code>4 | الاسم | قبل شهر</code>، أو اجلبها كاملةً بزرّ «جلب كل التعليقات تلقائيًّا».');
  }

  const resultLine = append
    ? `أُضيف ${totalNow - before} تعليقًا من ${platformName(platform)} — المجموع ${totalNow}.`
    : `استُخرج ${totalNow} تعليقًا.`;
  if (notes.length) message("#parse-msg", unrated === reviews.length ? "warn" : (v.warnings.length ? "warn" : "ok"), resultLine + " تنبيهات:", notes);
  else message("#parse-msg", "ok", resultLine);

  renderParseStats();
  renderRecency();
  renderTopics();
  renderEntities();
  renderReplies();
  renderContext();
  renderAnomaly();
  renderIntegrity();
  renderSources();
  renderBias();
  renderConfidenceHint();
  renderPriority();
  renderStars();
  renderImpactPreview();
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

  /* **عناوينُ الأشهر تُخفَّف ولا تُمال.** كانت كلُّها مكتوبةً مائلةً بأربعين
     درجة فتتراكب حين تكثر الأشهر، فلا يُقرأ منها شيء. فتُكتب مستقيمةً، ويُعرَض
     منها ما يتّسع له العرض — والأولُ والأخيرُ مثبتان، فالمدى مقروءٌ دائمًا. */
  const every = months.length > 12 ? 3 : (months.length > 7 ? 2 : 1);
  const chart = months.length >= 3 ? `<div class="months">${
    months.map((m, i) => {
      const h = Math.max(8, Math.round((m.n / max) * 100));
      const tone = m.avg === null ? '' : (m.avg >= 4 ? 'up' : (m.avg <= 2.5 ? 'down' : 'mid'));
      const showLabel = i === 0 || i === months.length - 1 || i % every === 0;
      return `<div class="month" title="${m.label}: ${m.n} تعليقًا، متوسط ${m.avg ?? '—'}">
        <span class="mv">${m.avg ?? '—'}</span><span class="bar ${tone}" style="height:${h}%"></span>
        <span class="ml">${showLabel ? m.label : ''}</span></div>`;
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
  if (!people.length && !products.length) {
    // الصمتُ هنا يُقرأ عطلًا. والصواب أن يُقال: لم يتكرّر صنفٌ بعينه مرتين فأكثر.
    box.innerHTML = '<p class="fine">لم تتكرّر عبارةٌ أو اسمٌ بعينه مرتين فأكثر في هذه العيّنة، '
      + 'فلا أصناف تُرصد. وهذا وصفٌ للعيّنة لا حكمٌ على المنشأة.</p>';
    return;
  }
  const chip = (e) => {
    const cls = e.verdict === 'سلبي' ? 'neg' : (e.verdict === 'إيجابي' ? 'pos' : '');
    return `<span class="chip ent ${cls}" title="${esc(e.ids.join('، '))}">${esc(e.name)} <b>${e.total}</b></span>`;
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

/** أوقات الذروة ولغة التعليقات والأسئلة — ثلاثة كانت في العقد بلا استعمال. */
function renderContext() {
  const box = $('#context-box');
  if (!box) return;
  const parts = [];

  const pk = peakInsight(job.place);
  if (pk.peaks.length) {
    parts.push(`<p class="fine">ذروة الازدحام: ${pk.peaks.map((d) => `<b>${d.day}</b> ${d.windows.map((w) => w.label).join('، ')}`).join(' · ')}</p>`);
    if (pk.suggestion) parts.push(`<div class="msg warn"><b>${pk.suggestion}</b></div>`);
  }

  const lang = tagLanguages(job.place);
  if (lang.total) {
    parts.push(`<p class="fine">لغة التعليقات: عربي ${lang.arabic}% · إنجليزي ${lang.english}%${lang.mixed ? ` · مختلط ${lang.mixed}%` : ''}${
      lang.note ? ` — <b>${lang.note}</b>` : ''}</p>`);
  }

  const q = qnaInsight(job.place);
  if (q.total) {
    parts.push(`<p class="fine">الأسئلة: ${q.total}، منها ${q.unanswered} بلا جواب.${
      q.unansweredQuestions.length ? ` مثل: «${esc(q.unansweredQuestions[0])}»` : ''}</p>`);
    if (q.note) parts.push(`<div class="msg warn"><b>${q.note}</b></div>`);
  }

  box.innerHTML = parts.join('');
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
      <td class="snip">${esc((rev?.text || '(بلا نص)').slice(0, 70))}</td></tr>`;
  }).join('');

  box.innerHTML = `
    <div class="msg ${r.level === 'err' ? 'err' : 'warn'}"><b>${r.summary}</b></div>
    ${r.clusters.length ? `<p class="fine">نصوص متشابهة: ${esc(r.clusters.map((c) => c.ids.join(' ≈ ')).join(' · '))}</p>` : ''}
    <div class="table-wrap"><table class="mini"><thead><tr><th>التعليق</th><th>الدرجة</th><th>الإشارات</th><th>مقتطف</th></tr></thead><tbody>${rows}</tbody></table></div>
    <div class="row"><button type="button" class="btn ghost sm" id="btn-drop-flagged">استبعاد ما درجته 3 فأعلى</button>
    <span class="fine">الاستبعاد قرارك أنت؛ لا يُحذف شيء تلقائيًّا.</span></div>`;

  const btn = $('#btn-drop-flagged');
  if (btn) btn.addEventListener('click', () => {
    const keep = new Set(withoutFlagged(job.place, 3).reviews.map((x) => x.id));
    const out = job.place.reviews.filter((x) => !keep.has(x.id));
    if (!out.length) { toast('لا تعليق يبلغ هذه الدرجة'); return; }
    if (!confirm(`استبعاد ${out.length} تعليقًا من التحليل؟\n\nلا يُحذف نصُّه: يُنقَل جانبًا، ويُذكَر عددها ومعرّفاتها في التقرير، ويمكنك إعادتها.`)) return;
    /* الاستبعاد نقلٌ لا محو: عيّنةٌ نُقِّيت من نقدٍ لم يعجب ثم سُلِّمت على أنها
       كاملة خيانةٌ للقارئ. فتُحفَظ المستبعَدة ويُقَرّ بها في التقرير. */
    job.excluded = [...(job.excluded || []), ...out];
    job.place.reviews = job.place.reviews.filter((x) => keep.has(x.id));
    renderParseStats(); renderRecency(); renderTopics(); renderEntities(); renderReplies(); renderAnomaly();
    renderIntegrity();
    scheduleSave();
    toast(`استُبعد ${out.length} تعليقًا — ومُقَرٌّ به في التقرير`);
  });
}

/**
 * لوحة أمانة النقل — تُثبت أن النصوص كما وردت، وتُقرّ بما استُبعد.
 *
 * ولا تُجمِّل: إن وُجد نصٌّ لا يطابق مصدره قالت ذلك بالأحمر وسمّت التعليق.
 */
/** أولويات الإصلاح — تُعرَض قبل تشغيل أي نموذج، فهي محسوبة لا مُستنتَجة. */
function renderPriority() {
  const box = $('#priority-box');
  if (!box) return;
  const rows = priorities(job.place, { limit: 6 });
  if (!rows.length) { box.innerHTML = ''; return; }
  const max = rows[0].weight || 1;
  box.innerHTML = `<h3 class="mini-h">أولويات الإصلاح — بماذا يبدأ صاحب المحل</h3>
    ${priorityNotes(rows)}
    <div class="table-wrap"><table class="mini"><thead><tr><th>#</th><th>الموضوع</th><th>الوزن</th><th>لماذا</th></tr></thead><tbody>${
      rows.map((r, i) => `<tr${r.lone ? ' class="lone-row"' : ''}><td>${rankOf(rows, i)}</td>
        <td><b>${esc(r.name)}</b> ${loneTag(r)}</td>
        <td><span class="w-track"><span class="w-fill" style="width:${Math.round((r.weight / max) * 100)}%"></span></span></td>
        <td class="fine">${esc(r.why)}</td></tr>`).join('')
    }</tbody></table></div>
    <p class="fine">الوزن = تكرار الشكوى × حدّة تقييمها × حداثتها. محسوبٌ من بياناتك بلا نموذج.
      وهذه المعاينة تعرض ما يعرضه التقرير بحروفه — فلا يقول أحدهما ما ينفيه الآخر.</p>`;
}

/** حاسبة النجوم — الجواب الحسابي على «كيف أرفع تقييمي؟». */
function renderStars() {
  const box = $('#stars-box');
  if (!box) return;
  const l = ladder(job.place.ratings?.average, job.place.ratings?.count, { perMonth: Number(job.assume?.perMonth) || 0 });
  if (!l || !l.rows.length) {
    box.innerHTML = job.place.ratings?.average
      ? '' : '<p class="fine">أدخل متوسط التقييم وعدد التقييمات أعلاه لترى ما يلزم لرفعه.</p>';
    return;
  }
  const four = l.rows.slice(0, 4).some((r) => r.fours !== null);
  /* عمودٌ كلُّه شَرَطات يُقرأ عطبًا لا امتناعًا. فإن لم يُدخِل المالك معدّله
     الشهري حُذف العمود أصلًا، وقيل له في سطرٍ واحد ما يفتحه. */
  const paced = l.rows.slice(0, 4).some((r) => r.months !== null);
  const rows = l.rows.slice(0, 4).map((r) => `<tr><td><b>${r.target}</b></td>
    <td>${r.fives === null ? '—' : r.fives}</td>
    ${four ? `<td>${r.fours === null ? '—' : r.fours}</td>` : ''}
    ${paced ? `<td>${r.months === null ? '—' : r.months + ' شهرًا'}</td>` : ''}</tr>`).join('');
  box.innerHTML = `<h3 class="mini-h">ما الذي يلزم لرفع التقييم</h3>
    <div class="table-wrap"><table class="mini"><thead><tr><th>الهدف</th><th>بخمس نجوم</th>${four ? '<th>أو بأربع</th>' : ''}${paced ? '<th>بمعدّلك</th>' : ''}</tr></thead><tbody>${rows}</tbody></table></div>
    <p class="fine">تقييمٌ واحد بنجمة يُنزل متوسطك ${Math.abs(l.drop.one).toFixed(3)} — والمحافظة أرخص من التعويض.${
      paced ? '' : ' وأدخِل عدد تقييماتك الشهري أعلاه ليُحسَب لك الزمن اللازم لكل هدف.'}</p>`;
}

/** معاينة الأثر المالي بأرقام المالك — وتتغيّر أمامه كلما غيّرها. */
function renderImpactPreview() {
  const box = $('#impact-preview');
  if (!box) return;
  const a = job.assume || {};
  const r = impact(job.place, { ticket: a.ticket, monthly: a.monthly, lossRate: (Number(a.loss) || 25) / 100 });
  if (!r || !a.ticket || !a.monthly || !r.rows.length) { box.innerHTML = ''; return; }
  const num = (n) => Number(n).toLocaleString('ar-SA-u-nu-latn');
  box.innerHTML = `<div class="msg ok"><b>على فرضك: نحو ${num(r.totalRiyals)} ريال شهريًّا</b>
    <p class="fine">${r.rows.slice(0, 3).map((x) => `${esc(x.name)}: ${num(x.riyals)}`).join(' · ')}</p>
    <p class="fine">هذا يقيس حجم المشكلة على فرضك، ولا يزعم أنه إيرادٌ ضائع مقيس.</p>
    <p class="fine">${a.show
      ? '<b>وهو مُدرَجٌ في التقرير</b> — مقرونًا بأنه فرضُك لا قياسٌ من التعليقات.'
      : '<b>ولا يظهر في التقرير.</b> هذه معاينةٌ لك وحدك، فشغّل الخيار أسفلَه إن أردت إدراجه.'}</p></div>`;
}

/** انحياز العيّنة — لا يُدَّعى تمثيلٌ ولا انحياز بلا توزيعٍ معلن. */
function renderBias() {
  const box = $('#bias-box');
  if (!box) return;
  const b = sampleBias(job.place);
  if (!b) {
    box.innerHTML = job.place.reviews.length
      ? '<p class="fine">أدخل توزيع النجوم المعلن في قوقل أعلاه لتعرف: هل عيّنتك تمثّل منشأتك أم منحازة؟</p>' : '';
    return;
  }
  const cls = b.verdict === 'منحازة' ? 'err' : (b.verdict === 'مائلة' ? 'warn' : 'ok');
  box.innerHTML = `<h3 class="mini-h">هل عيّنتك تمثّل منشأتك؟</h3>
    <div class="msg ${cls}"><b>${esc(b.verdict)}</b> — ${esc(b.note).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')}</div>
    <div class="table-wrap"><table class="mini"><thead><tr><th>النجوم</th><th>المعلَن</th><th>عيّنتك</th><th>الفرق</th></tr></thead>
    <tbody>${b.rows.map((r) => `<tr><td>${r.star} ★</td><td>${r.declared}%</td><td>${r.sample}%</td>
      <td class="${Math.abs(r.gap) >= 8 ? 'err-text' : ''}">${r.gap > 0 ? '+' : ''}${r.gap}</td></tr>`).join('')}</tbody></table></div>`;
}

/** تنبيه الهامش: كم تساوي نسبة واحدة من عيّنتك؟ */
function renderConfidenceHint() {
  const box = $('#ci-hint');
  if (!box) return;
  const n = job.place.reviews.length;
  const pop = job.place.ratings?.withText || job.place.ratings?.count || null;
  if (!n) { box.innerHTML = ''; return; }
  const ci = wilson(Math.round(n * 0.25), n, pop);
  if (!ci) { box.innerHTML = ''; return; }
  box.innerHTML = `<p class="fine">بعيّنةٍ من <b>${n}</b> تعليقًا${pop ? ` من ${pop}` : ''}، أي نسبةٍ تقولها الأداة تحمل هامشًا نحو
    <b>±${ci.margin}</b> نقطة. ${ci.wide ? '<b>وهامشٌ بهذا الاتّساع يجعل النسبة مؤشّرًا لا قياسًا</b> — وزيادة العيّنة تضيّقه.' : 'وهو هامشٌ مقبول.'}</p>`;
}

function renderIntegrity() {
  const box = $('#integrity-box');
  if (!box) return;
  const total = job.place.reviews.length;
  const ex = job.excluded || [];
  if (!total && !ex.length) { box.innerHTML = '<div class="empty">لا تعليقات بعد.</div>'; return; }

  const r = checkSource(job.place, job.rawPaste || '');
  const srcNames = { paste: 'لصقٌ منك', provider: 'مزوّد وسيط', places: 'قوقل Places', json: 'JSON', 'غير معروف': 'غير معروف' };
  const chips = Object.entries(r.bySource)
    .map(([k, n]) => `<span class="chip">${esc(srcNames[k] || k)}: ${n}</span>`).join('');

  const level = r.altered ? 'err' : 'ok';
  const offenders = r.altered
    ? `<ul class="fine">${r.offenders.slice(0, 5).map((o) => `<li><span class="rid">${esc(o.id)}</span> ${esc(o.text)}…</li>`).join('')}</ul>`
    : '';

  const exBlock = ex.length
    ? `<div class="msg warn"><b>مستبعَدات مُقَرٌّ بها.</b>
        <p class="fine">${esc(exclusionNote(ex))}</p>
        <button type="button" class="btn ghost sm" id="btn-restore-excluded">إعادة ${ex.length} تعليقًا إلى التحليل</button></div>`
    : '';

  box.innerHTML = `<div class="msg ${level}"><b>${esc(r.summary)}</b></div>
    <div class="chips">${chips}</div>
    ${offenders}
    <p class="fine">التقييمات تُنقَل كما وردت، وما لا تقييم له يبقى فارغًا ولا يُخمَّن. ولا تُحذف تعليقات تلقائيًّا بحال.</p>
    ${exBlock}`;

  const rb = $('#btn-restore-excluded');
  if (rb) rb.addEventListener('click', () => {
    job.place.reviews = [...job.place.reviews, ...ex];
    job.excluded = [];
    assignReviewIds(job.place);
    loadDataView();
    scheduleSave();
    toast('أُعيدت المستبعَدات');
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
    // المقام الصحيح المنصوصة متى عُرفت: «٤٦٪ من ٨٧» لا «١٣٪ من ٣١٠».
    s.textCoverage !== null
      ? ['نسبة العيّنة', `${s.textCoverage}% من ${s.declaredWithText} منصوصة`]
      : ['نسبة العيّنة', s.coverage !== null ? `${s.coverage}% من الإجمالي` : '—'],
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
    const c = el('span', 'chip', `${esc(p.caption || 'صورة')} `);
    const b = el('button', 'btn danger sm', '×');
    b.style.padding = '0 6px';
    b.addEventListener('click', () => { job.photos.splice(i, 1); renderPhotoChips(); scheduleSave(); });
    c.appendChild(b);
    box.appendChild(c);
  });
}

/* ───────────────────────── ٣) خط النماذج ───────────────────────── */

/** النماذجُ الحيّة لكل دور — تُعرَض بأسمائها كما ستُجرَّب، ويُقال إن تعذّرت القراءة. */
async function renderLiveModels({ force = false } = {}) {
  const box = $('#models-live-box');
  const state = $('#models-live-state');
  if (!box) return;
  const { resolvePicks, freeModels, retired } = await import('./catalog.js');
  const live = await freeModels({ force });
  const roles = [['normalize', 'التوحيد'], ['mergeNormalized', 'دمج التوحيد'], ['analyze', 'التحليل'], ['mergeAnalysis', 'الدمج النهائي']];
  const rows = [];
  for (const [role, label] of roles) {
    const picks = await resolvePicks(role);
    rows.push(`<tr><td><b>${label}</b></td><td>${picks.length ? picks.map((p) => `${esc(p.name)} <span class="fine">${esc(p.note)}</span>`).join('<br>') : '<span class="err-text">لا مرشَّح</span>'}</td></tr>`);
  }
  const dead = [...retired()];
  if (state) state.textContent = live ? `— ${live.length} نموذجًا مجانيًّا في قائمة OpenRouter الآن` : '— تعذّرت قراءة القائمة الحيّة، فتُجرَّب القائمةُ الثابتة';
  box.innerHTML = `<div class="table-wrap"><table class="mini"><thead><tr><th>المرحلة</th><th>ما سيُجرَّب بالترتيب</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>
    ${dead.length ? `<p class="fine">تقاعد في هذه الجلسة ولن يُجرَّب: ${dead.map(esc).join('، ')}.</p>` : ''}
    <p class="fine">لا مدفوعَ في رابح: القائمةُ مجانيةٌ كلُّها. وإن لم يُجب منها أحد، فالطريقُ الثاني قائم:
      انسخ رسالة كل خطوة والصقها في أي نموذجٍ مجانيٍّ على الويب، وأعد جوابه إلى مربعها.</p>`;
}

function renderPipeline() {
  const host = $('#pipeline-steps');
  const nowStamp = dataStamp(job.place);
  // إعادة الرسم تُفرغ الحاوية فيقصر ارتفاع الصفحة فيقفز التمرير. يُحفَظ موضعه
  // ويُعاد بعد البناء، فلا يفقد المستخدم مكانه كلما عدّل خطوة.
  const scrollY = window.scrollY;
  const active = document.activeElement?.id || '';
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

    const stale = done && job.stamps?.[step.key] && job.stamps[step.key] !== nowStamp;
    const node = el('div', `step${done ? ' done' : ''}${stale ? ' stale' : ''}`);
    const defaultOpen = (!done && ready) || (done && !job.out.am);
    node.dataset.open = stepOpen.has(step.key) ? (stepOpen.get(step.key) ? '1' : '0') : (defaultOpen ? '1' : '0');

    const head = el('header');
    head.innerHTML = `<b>${stale ? '⚠' : (done ? '✓' : i + 1)}</b>
      <div><div class="t">${step.title}</div>
      <div class="s">${stale ? '<b>قديمة — بُنيت على تعليقات غير الحالية</b>'
        : (done ? 'مكتملة — اضغط للتعديل' : (ready ? 'جاهزة' : 'تنتظر إكمال المرحلة السابقة'))}</div></div>`;
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
    // تشغيلٌ آلي لهذه الخطوة وحدها: لإعادة واحدة دون هدم ما بعدها.
    const btnRun = el('button', 'btn sm', '▶ شغّل');
    btnRun.title = 'يُشغّل هذه الخطوة عبر OpenRouter (يحتاج مفتاحًا)';
    btnRun.addEventListener('click', async () => {
      btnRun.disabled = true;
      const prev = btnRun.textContent;
      btnRun.textContent = '…';
      const r = await runOne(step.key);
      btnRun.disabled = false;
      btnRun.textContent = prev;
      if (r.ok) {
        message('#run-msg', 'ok', `${step.title}: ${r.model} — ${r.verdict.summary}`);
        renderPipeline();
      } else {
        message('#run-msg', 'err', `${step.title}: ${r.error}`, r.needsKey
          ? ['أضف OPENROUTER_KEY في متغيّرات البيئة على Netlify ثم أعد النشر.'] : []);
      }
    });
    row.appendChild(btnRun);
    const btnCopy = el('button', 'btn sm', 'نسخ الرسالة');
    const btnShow = el('button', 'btn ghost sm', 'عرض الرسالة');
    const btnDl   = el('button', 'btn ghost sm', 'تنزيلها');
    row.append(btnCopy, btnShow, btnDl);
    inner.appendChild(row);

    const pre = el('pre', 'prompt');
    pre.hidden = true;
    inner.appendChild(pre);

    /* حجم الرسالة يُقال قبل الضغط: تجاوز نافذة النموذج صامتٌ — يقتطع ما زاد
       ويجيب كأنه قرأ الكل. والتوحيد يُقسَّم على دفعات فيُعلَن عددها. */
    const size = el('div', 'fine size-note');
    try {
      const n = job.place.reviews.length;
      const parts = step.role === 'normalize' ? batchCount(n) : 1;
      const len = parts > 1
        ? promptNormalizeBatch(job.place, job.ctx, 0, parts).length
        : (step.build({ place: job.place, ctx: job.ctx, out: job.out }) || '').length;
      const k = Math.round(len / 1000);
      if (parts > 1) {
        size.innerHTML = `حجم الرسالة ~<b>${k}</b> ألف حرف للدفعة الواحدة — و<b>${parts} دفعات</b>، لأن ${n} تعليقًا لا تسعها نافذة النموذج المجاني دفعةً واحدة. التشغيل الآلي يتولّى التقسيم؛ ويدويًّا انسخ كل دفعة على حدة.`;
        size.classList.add('warn-text');
      } else if (k >= 25) {
        size.innerHTML = `حجم الرسالة ~<b>${k}</b> ألف حرف — <b>كبيرة</b>. بعض واجهات الدردشة تقتطع ما زاد بلا تنبيه، فتأتي الإجابة ناقصةً وهي تبدو تامّة. التشغيل الآلي أسلم هنا.`;
        size.classList.add('warn-text');
      } else {
        size.textContent = `حجم الرسالة ~${k} ألف حرف.`;
      }
    } catch { size.textContent = ''; }
    inner.appendChild(size);

    const buildPrompt = () => {
      try { return step.build({ place: job.place, ctx: job.ctx, out: job.out }); }
      catch (err) { toast('تعذّر بناء الرسالة: ' + err.message); return ''; }
    };

    /* الرسالة المقسَّمة تُنسَخ دفعةً دفعة: التشغيل الآلي يتولّى التقسيم، ومن
       ينسخ بيده كان يأخذ الدفعة الأولى وحدها ويظنّها كل شيء. */
    const parts = step.role === 'normalize' ? batchCount(job.place.reviews.length) : 1;
    if (parts > 1) {
      btnCopy.textContent = `نسخ الدفعة 1 من ${parts}`;
      const arNum = (n) => ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'][n - 1] || String(n);
      for (let bi = 1; bi < parts; bi += 1) {
        const extra = el('button', 'btn ghost sm', `نسخ الدفعة ${arNum(bi + 1)} من ${parts}`);
        extra.addEventListener('click', async () => {
          const t = promptNormalizeBatch(job.place, job.ctx, bi, parts);
          toast(await copy(t) ? `نُسخت الدفعة ${arNum(bi + 1)} — ألصقها ثم ألحق جوابها بما قبله` : 'تعذّر النسخ');
        });
        row.appendChild(extra);
      }
    }

    btnCopy.addEventListener('click', async () => {
      const text = parts > 1 ? promptNormalizeBatch(job.place, job.ctx, 0, parts) : buildPrompt();
      if (!text) return;
      const note = parts > 1 ? ` (1 من ${parts} — والباقي بالأزرار المجاورة)` : '';
      toast(await copy(text) ? `نُسخت الرسالة${note} — ألصقها في النموذج` : 'تعذّر النسخ، استعمل «عرض الرسالة»');
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
      const mis = v.misquotes?.length
        ? `<p class="fine err-text">اقتباسات غُيِّر نصُّها: ${v.misquotes.map((q) => `«${esc(q)}»`).join('، ')} — الاقتباس يُنقَل حرفيًّا، ومن لطّف ذمًّا فقد زوّر شهادة صاحبه. أعد الخطوة.</p>` : '';
      const nums = v.numberIssues.length
        ? `<ul class="fine">${v.numberIssues.map((n) => `<li>الرقم <b>${esc(n.value)}</b> في «${esc(n.context.slice(0, 60))}» — ${esc(n.why)}.</li>`).join('')}</ul>` : '';
      const uns = v.unsupported.length
        ? `<details class="fine"><summary>${v.unsupported.length} حكمًا بلا سند</summary><ul>${
            v.unsupported.slice(0, 8).map((u) => `<li>${esc(u.text.slice(0, 110))}</li>`).join('')}</ul></details>` : '';
      check.innerHTML = `<div class="msg ${v.level === 'err' ? 'err' : v.level === 'warn' ? 'warn' : 'ok'}">
        <b>مدقّق السند: ${v.summary}</b>${bad}${mis}${nums}${uns}</div>`;
    };

    ta.addEventListener('input', () => {
      job.out[step.key] = ta.value;
      job.stamps = job.stamps || {};
      job.stamps[step.key] = dataStamp(job.place);   // على أي بياناتٍ كُتبت
      job.staleAck = false;                          // إقرارٌ قديم لا يسري على فارقٍ جديد
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

  /* تحذيرٌ لا يُسكَت عنه: المعرّفات تُمنَح بالترتيب، فتحليلٌ قديم يستشهد بـR001
     يجتاز مدقّق السند وهو يصف تعليقًا لم يعد موجودًا. */
  const stalies = staleSteps(job.out, job.stamps || {}, nowStamp);
  const banner = $('#stale-msg');
  if (banner) {
    if (stalies.length) {
      banner.innerHTML = `<div class="msg err"><b>تغيّرت التعليقات بعد تشغيل ${stalies.length} من الخطوات.</b>
        <p class="fine">ما بُني عليها لم يعد يصف بياناتك الحالية — والمعرّفات نفسها صارت لتعليقات أخرى، فلن يكشفها مدقّق السند.
        أعد تشغيل الخطوات المعلَّمة <b>⚠</b>، أو امسح إجاباتها.</p>
        <button type="button" class="btn sm" id="btn-rerun-stale">إعادة تشغيل الخطوات القديمة</button></div>`;
      const rr = $('#btn-rerun-stale');
      if (rr) rr.addEventListener('click', async () => {
        for (const k of stalies) job.out[k] = '';
        renderPipeline();
        await onRunAll();
      });
    } else banner.innerHTML = '';
  }

  if (scrollY) window.scrollTo({ top: scrollY });
  if (active && document.getElementById(active)) document.getElementById(active).focus({ preventScroll: true });

  updateProgress();
  renderAgreement();
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

/** أين اتفقت النماذج وأين انفرد واحد — يُعرض قبل خطوتَي الدمج. */
function renderAgreement() {
  const card = $('#agreement-card');
  const box = $('#agreement-box');
  if (!card) return;

  // أي مرحلة نحن فيها؟ نعرض مقارنة المخرجات الثلاثة الجاهزة الأحدث.
  const sets = [
    { keys: ['a1', 'a2', 'a3'], name: 'تقارير التحليل' },
    { keys: ['n1', 'n2', 'n3'], name: 'مخرجات التوحيد' },
  ];
  const ready = sets.find((g) => g.keys.filter((k) => (job.out[k] || '').trim()).length >= 2);
  if (!ready) { card.hidden = true; return; }

  const outputs = ready.keys.map((k) => job.out[k] || '');
  const labels = ready.keys.map((k) => job.models?.[k] || `النموذج ${ready.keys.indexOf(k) + 1}`);
  const r = compareOutputs(outputs, labels);
  if (!r.stats.groups) { card.hidden = true; return; }

  card.hidden = false;
  const group = (g, cls) => `<div class="agree-group ${cls}">
    <div class="txt">${esc(g.text)}</div>
    <div class="who">${esc(g.sources.join(' · '))}${g.ids.length ? ` — ${g.ids.map((i) => `<span class="rid">${esc(i)}</span>`).join('، ')}` : ' — بلا سند'}</div>
  </div>`;

  box.innerHTML = `
    <div class="stat-grid">
      <div class="stat"><b>التوافق</b><span>${r.stats.consensus}%</span><div class="fine">${ready.name}</div></div>
      <div class="stat up"><b>اتفق الجميع</b><span>${r.stats.agreedAll}</span></div>
      <div class="stat"><b>اتفق بعضهم</b><span>${r.stats.agreedSome}</span></div>
      <div class="stat down"><b>انفرد واحد</b><span>${r.stats.unique}</span></div>
    </div>
    ${r.numbers.length ? `<div class="msg err"><b>أرقام متعارضة بين النماذج (${r.numbers.length})</b><ul>${
      r.numbers.slice(0, 5).map((n) => `<li>${n.values.map((v) => `${esc(v.label)}: <b>${esc(v.value)}</b>`).join(' · ')}</li>`).join('')}</ul>
      <p class="fine">ارجع إلى «الإحصاءات المحسوبة» — الرقم الصحيح فيها لا عند النماذج.</p></div>` : ''}
    ${r.all.length ? `<div class="agree-head">اتفق الجميع <span class="badge ok">ثقة عالية</span></div>${r.all.slice(0, 8).map((g) => group(g, 'all')).join('')}` : ''}
    ${r.some.length ? `<div class="agree-head">اتفق بعضهم <span class="badge mid">راجعها</span></div>${r.some.slice(0, 6).map((g) => group(g, 'some')).join('')}` : ''}
    ${r.alone.length ? `<div class="agree-head">انفرد به مصدر واحد <span class="badge">يحتاج تحقّقًا</span></div>${r.alone.slice(0, 8).map((g) => group(g, 'alone')).join('')}` : ''}
    <div class="row"><button type="button" class="btn ghost sm" id="btn-agree-hint">نسخ خلاصة المقارنة للدامج</button></div>`;

  const btn = $('#btn-agree-hint');
  if (btn) btn.addEventListener('click', async () => {
    toast(await copy(mergeHint(r)) ? 'نُسخت — ألحقها برسالة الدمج' : 'تعذّر النسخ');
  });
}

function updateProgress() {
  const done = STEPS.filter((s) => (job.out[s.key] || '').trim()).length;
  const badge = $('#pipeline-progress');
  badge.textContent = `${done} من ${STEPS.length} خطوات`;
  badge.className = 'badge ' + (done === STEPS.length ? 'ok' : done ? 'mid' : '');
}

/* ───────────── التشغيل الآلي لخط التحليل عبر OpenRouter ───────────── */

let runAbort = null;

/** الحالة التي يبني عليها المُشغِّل رسائله — نفسها التي تبني بها الواجهة. */
const runState = () => ({ place: job.place, ctx: job.ctx, out: job.out });

function setRunning(on) {
  $('#btn-run-all').disabled = on;
  $('#btn-stop-run').hidden = !on;
  $('#btn-run-all').textContent = on ? '… يعمل' : '▶ شغّل الخطوات الثماني آليًّا';
}

/**
 * يشغّل خطوةً واحدة ويكتب ردّ النموذج في مربعها حيًّا.
 *
 * والكتابة في `job.out` تتمّ أولًا بأول: لو انقطع الاتصال في المنتصف بقي ما وصل
 * ولم يضع عمل النموذج. وإعادة الرسم تُؤجَّل إلى النهاية كي لا يُقتلع المربع
 * من تحت النصّ وهو يُكتب.
 */
async function runOne(key, { quiet = false } = {}) {
  const ta = $(`#out-${key}`);
  const step = STEPS.find((x) => x.key === key);
  if (ta) { ta.value = ''; ta.disabled = true; }
  job.out[key] = '';

  const r = await runStep(key, runState(), {
    signal: runAbort?.signal,
    onModel: (pick) => {
      if (!quiet) message('#run-msg', 'warn', `${step.title} — يُشغَّل ${pick.name}…`);
      if (ta) ta.placeholder = `يكتب ${pick.name}…`;
    },
    onChunk: (_piece, whole) => {
      if (ta) { ta.value = whole; ta.scrollTop = ta.scrollHeight; }
      job.out[key] = whole;
    },
  });

  if (ta) { ta.disabled = false; ta.placeholder = 'ألصق هنا ما ردّ به النموذج…'; }

  if (!r.ok) {
    job.out[key] = '';
    if (ta) ta.value = '';
    return r;
  }

  job.out[key] = r.text;
  if (ta) ta.value = r.text;
  job.stamps = job.stamps || {};
  job.stamps[key] = dataStamp(job.place);
  job.models = job.models || {};
  job.models[key] = r.model;          // النموذج الذي شُغِّل فعلًا، لا الذي طُلب
  scheduleSave();
  return r;
}

async function onRunAll() {
  const v = validate(job.place);
  if (!v.ok) { message('#run-msg', 'err', 'لا يمكن التشغيل:', v.errors); return; }

  const pending = pendingSteps(job.out);
  if (!pending.length) { message('#run-msg', 'ok', 'الخطوات الثماني مكتملة. امسح خطوةً لإعادتها.'); return; }

  runAbort = new AbortController();
  setRunning(true);
  const started = Date.now();
  const log = [];

  for (const [i, key] of pending.entries()) {
    if (runAbort.signal.aborted) break;
    const step = STEPS.find((x) => x.key === key);
    message('#run-msg', 'warn', `(${i + 1} من ${pending.length}) ${step.title}…`, log.slice(-3));

    const r = await runOne(key, { quiet: true });

    if (!r.ok) {
      renderPipeline();
      setRunning(false);
      runAbort = null;
      message('#run-msg', 'err', `توقّف عند: ${step.title}`, [
        r.error,
        ...(r.needsKey ? [
          'أنشئ مفتاحًا من openrouter.ai/keys (مجاني).',
          'ضعه في Netlify → Site settings → Environment variables باسم OPENROUTER_KEY، ثم أعد النشر.',
        ] : []),
        ...(r.invented ? ['ما قبلها محفوظ. شغّل هذه الخطوة يدويًّا أو أعد المحاولة لاحقًا.'] : []),
        ...log,
      ]);
      return;
    }
    log.push(`${step.title}: ${r.model} — ${r.verdict.summary}`);
  }

  renderPipeline();
  setRunning(false);
  const stopped = runAbort?.signal.aborted;
  runAbort = null;
  const secs = Math.round((Date.now() - started) / 1000);
  message('#run-msg', stopped ? 'warn' : 'ok',
    stopped ? 'أُوقف بأمرك — وما تمّ محفوظ.' : `تمّت الخطوات في ${secs} ثانية.`, log);
  if (!stopped) toast('اكتمل خط التحليل — انتقل إلى التقرير');
}

function bindPipelineView() {
  $('#btn-run-all').addEventListener('click', onRunAll);
  $('#btn-stop-run').addEventListener('click', () => {
    runAbort?.abort();
    message('#run-msg', 'warn', 'يُوقَف بعد انتهاء الخطوة الجارية…');
  });
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
  renderConfidence();
  $('#r-lang').value = job.lang || 'ar';
  $('#d-design').value = job.designHtml || '';
  renderDesignState();
  $('#d-replies').value = job.replyDrafts || '';
  renderRepliesState();
  if ($('#sh-url')) $('#sh-url').value = job.shareId ? `${location.origin}/r/${job.shareId}` : '';
  renderStaleReport();
  history.reset(job.id, $('#r-md').value);
  renderHistory();
  renderSnapshots();
  renderStepsBar('report');
}

/** HTML موقَّعًا — لما يخرج من يدك: تنزيلًا أو نشرًا على رابط. */
async function signedHtml() {
  const id = identity.load();
  const out = await sign(currentHtml(), { office: id?.office || '' });
  if (job.signature !== out.hash) { job.signature = out.hash; job.signedAt = out.at; scheduleSave(); }
  return out.html;
}

function currentHtml() {
  const tpl = TEMPLATES[job.template] || TEMPLATES[DEFAULT_TEMPLATE];
  return bilingual(buildReportHtml({
    sector: sectorFor(job.ctx?.groupId),
    place: job.place,
    ctx: job.ctx,
    markdown: applyTemplate(reportMarkdown(), tpl.id),
    photos: job.photos,
    show: tpl.show,
    font: job.font,
    identity: identity.load(),
    job,
  }), job.lang || 'ar');
}

function renderReport() {
  const frame = $('#r-frame');
  frame.srcdoc = currentHtml();
}

function reportFileName(ext) {
  const c = job.ctx;
  return `rabih-${asciiName(job.place.identity.name)}-${asciiName(c.cityName, 'ksa')}-${new Date().toISOString().slice(0, 10)}.${ext}`;
}

/** رابط النسخة المنشورة إن نُشرت — وسطرُ التسليم يتبعه. */
const shareLink = () => (job.shareId ? `${location.origin}/r/${job.shareId}` : '');

/** نص الإرسال: ما حرّره المستخدم، وإلا القالب المناسب لحال التقرير. */
function shareText(channel = 'whatsapp') {
  const typed = $('#s-msg')?.value?.trim();
  if (typed) return typed;
  const id = identity.load();
  const sign = id.office ? `\n— ${id.office}${id.phone ? ` · ${id.phone}` : ''}` : '';
  return buildMessage(job, channel, shareLink()) + sign;
}

function renderShareMessage() {
  const box = $('#s-msg');
  if (!box || !job.place.reviews.length) return;
  const badge = $('#s-situation');
  if (badge) badge.textContent = situationLabel(job);
  if (!box.value.trim() || box.dataset.auto === '1') {
    const id = identity.load();
    const sign = id.office ? `\n— ${id.office}${id.phone ? ` · ${id.phone}` : ''}` : '';
    box.value = buildMessage(job, 'whatsapp', shareLink()) + sign;
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
    <td class="task-text" contenteditable="true">${esc(t.text)}</td>
    <td class="task-metric" contenteditable="true">${esc(t.metric || '')}</td>
    <td>${t.ids.map((x) => `<span class="rid">${esc(x)}</span>`).join(' ') || '—'}</td>
    <td><input type="date" class="task-due" value="${t.due || ''}">
      <div class="fine due-label">${esc(arDate(t.due))}</div></td>
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
    job.plan[idx(e)].due = e.target.value;
    // حقل التاريخ يعرض بصيغة لغة المتصفح (10/15/2026 غالبًا)، وهي ملتبسة على
    // قارئ عربي: أهو اليوم أم الشهر؟ فيُكتب التاريخ بجانبه بالحروف.
    const lab = e.target.parentElement.querySelector('.due-label');
    if (lab) lab.textContent = arDate(e.target.value);
    scheduleSave(); syncPlanIntoReport();
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

/**
 * دفتر العملاء — يجيب عن سؤالين: مَن لم يُتابَع؟ وما الذي يُجدَّد قريبًا؟
 *
 * والحقول تُحرَّر في مكانها وتُحفَظ فور تركها، فلا نافذة ولا نموذج منفصل.
 */
/**
 * نظرة المحفظة — تحليلية لا إدارية: أين يتحرّك كل عميل، وما يحتاج فعلًا.
 *
 * والاتجاه يُقاس بين آخر تقريرين للمنشأة الواحدة، فمن له تقريرٌ واحد لا
 * يُنسَب إليه اتجاه — ولا يُخمَّن له.
 */
async function renderPortfolio(preloaded = null) {
  const box = $('#portfolio-box');
  if (!box) return;
  const jobs = preloaded || await allJobs();
  const groups = comparablePlaces(jobs);
  const byPlace = new Map();

  for (const j of jobs) {
    const k = `${j.ctx?.cityId || ''}::${j.place?.identity?.name || ''}`;
    if (!byPlace.has(k)) byPlace.set(k, []);
    byPlace.get(k).push(j);
  }
  if (!byPlace.size) { box.innerHTML = '<div class="empty">لا منشآت بعد.</div>'; return; }

  const rows = [...byPlace.values()].map((list) => {
    list.sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
    const last = list[list.length - 1];
    const prev = list.length > 1 ? list[list.length - 2] : null;
    const s = stats(last.place);
    const t = prev ? timeline(prev, last) : null;
    const eff = prev ? planEffect(prev, last) : null;
    // الأولوية تُحسَب للمعروض وحده: حسابها لخمسمئة منشأة يُبطئ الشاشة بلا فائدة،
    // فالجدول يعرض أربعين صفًّا ويقول كم بقي.
    const pr = null;
    return {
      name: last.place?.identity?.name || 'بلا اسم',
      city: last.ctx?.cityName || '',
      reviews: s.total,
      avg: s.googleAverage ?? s.sampleAverage,
      neg: s.rated ? Math.round((s.negative / s.rated) * 100) : null,
      trend: t?.ratings?.googleAverage?.diff ?? null,
      verdict: t?.verdict || null,
      top: pr,
      effect: eff && eff.measured ? `${eff.improved}/${eff.measured}` : null,
      jobId: last.id,
      reports: list.length,
    };
  }).sort((a, b) => (a.trend ?? 0) - (b.trend ?? 0));

  const LIMIT = 40;
  const shown = rows.slice(0, LIMIT);
  for (const r of shown) {
    const j = jobs.find((x) => x.id === r.jobId);
    r.top = j ? (priorities(j.place, { limit: 1 })[0] || null) : null;
  }

  const arrow = (d) => {
    if (d === null || d === undefined) return '<span class="fine">—</span>';
    if (d > 0.05) return `<span class="delta up">▲ ${d.toFixed(2)}</span>`;
    if (d < -0.05) return `<span class="delta down">▼ ${Math.abs(d).toFixed(2)}</span>`;
    return '<span class="fine">ثابت</span>';
  };

  box.innerHTML = `<div class="table-wrap"><table class="mini"><thead><tr>
      <th>المنشأة</th><th>تقارير</th><th>العيّنة</th><th>المتوسط</th><th>السلبي</th><th>الاتجاه</th><th>أثر الخطة</th><th>الأولوية الآن</th>
    </tr></thead><tbody>${shown.map((r) => `<tr>
      <td><b>${esc(r.name)}</b><div class="fine">${esc(r.city)}</div></td>
      <td>${r.reports}</td>
      <td>${r.reviews}</td>
      <td>${r.avg ?? '—'}</td>
      <td>${r.neg === null ? '—' : r.neg + '%'}</td>
      <td>${arrow(r.trend)}</td>
      <td>${r.effect ? `<span class="chip ok">${esc(r.effect)} تحسّنت</span>` : '<span class="fine">—</span>'}</td>
      <td class="fine">${r.top ? esc(r.top.name) + ` (${r.top.count})` : '—'}</td>
    </tr>`).join('')}</tbody></table></div>
    <p class="fine">مرتَّبة بالأسوأ اتجاهًا أولًا${rows.length > LIMIT ? `، ويُعرَض أوّل ${LIMIT} من ${rows.length}` : ''}. ومن له تقريرٌ واحد لا اتجاه له — ولا يُخمَّن.</p>`;
}

async function renderClients(preloaded = null) {
  const box = $('#clients-box');
  if (!box) return;
  const jobs = preloaded || await allJobs();
  const { rows, totals } = ledger(jobs);
  if (!rows.length) { box.innerHTML = '<div class="empty">لا منشآت في أرشيفك بعد.</div>'; return; }

  const due = (r) => {
    if (r.dueInDays === null) return '<span class="fine">—</span>';
    if (r.dueInDays <= 0) return `<b class="err-text">مستحقّ الآن</b>`;
    if (r.dueInDays <= 14) return `<b class="warn-text">بعد ${r.dueInDays} يومًا</b>`;
    return `بعد ${r.dueInDays} يومًا`;
  };

  /* الدفتر يرسم خلايا قابلة للتحرير لكل صفّ، وخمسمئة صفٍّ منها تُثقل الشاشة.
     فيُعرَض الأقرب تجديدًا والأحوج متابعةً، ويُقال كم بقي. */
  const LEDGER_LIMIT = 40;
  const view = rows.slice(0, LEDGER_LIMIT);

  box.innerHTML = `<div class="stat-grid">
      <div class="stat"><b>منشآت</b><span>${totals.places}</span></div>
      <div class="stat"><b>تقارير مُسلَّمة</b><span>${totals.delivered}</span></div>
      <div class="stat"><b>إيراد مُقدَّر</b><span>${totals.revenue.toLocaleString('ar-SA-u-nu-latn')} ريال</span></div>
      <div class="stat"><b>تجديد خلال أسبوعين</b><span>${totals.dueSoon}</span></div>
      <div class="stat"><b>متروك (90 يومًا)</b><span>${totals.stale}</span></div>
    </div>
    <div class="table-wrap"><table class="mini clients"><thead><tr>
      <th>المنشأة</th><th>المدينة</th><th>تقارير</th><th>آخر تقرير</th><th>جهة الاتصال</th><th>الجوال</th><th>الأتعاب</th><th>كل (شهر)</th><th>التجديد</th>
    </tr></thead><tbody>${view.map((r) => `<tr data-key="${esc(r.key)}"${r.stale ? ' class="stale-row"' : ''}>
      <td><b>${esc(r.name)}</b>${r.stale ? ' <span class="chip warn">لم يُتابَع</span>' : ''}</td>
      <td>${esc(r.city)}</td>
      <td>${r.reports}</td>
      <td>${r.lastDate ? esc(String(r.lastDate).slice(0, 10)) : '—'}${r.ageDays !== null ? `<div class="fine">منذ ${r.ageDays} يومًا</div>` : ''}</td>
      <td contenteditable="true" class="c-field" data-f="contact">${esc(r.contact)}</td>
      <td contenteditable="true" class="c-field" data-f="phone">${esc(r.phone)}</td>
      <td contenteditable="true" class="c-field" data-f="fee">${r.fee || ''}</td>
      <td contenteditable="true" class="c-field" data-f="everyMonths">${r.everyMonths || ''}</td>
      <td>${due(r)}</td>
    </tr>`).join('')}</tbody></table></div>
    <p class="fine">اكتب في الخلايا مباشرةً — تُحفَظ عند تركها. والأتعاب والدورية عندك وحدك، ولا تدخل أي تقرير.${
      rows.length > LEDGER_LIMIT ? ` ويُعرَض أوّل ${LEDGER_LIMIT} من ${rows.length}، مرتَّبةً بالأقرب تجديدًا.` : ''}</p>`;

  box.querySelectorAll('.c-field').forEach((cell) => cell.addEventListener('blur', (e) => {
    const key = e.target.closest('tr')?.dataset.key;
    const row = rows.find((r) => r.key === key);
    if (!row) return;
    const f = e.target.dataset.f;
    const raw = e.target.textContent.trim();
    const val = (f === 'fee' || f === 'everyMonths') ? Number(raw) || 0 : raw;
    // يُربَط بأي وظيفةٍ من وظائف هذه المنشأة: المفتاح واحد لها كلها.
    const any = jobs.find((j) => row.jobIds.includes(j.id));
    if (any) { setClient(any, { [f]: val }); renderClients(jobs); }
  }));
}

async function renderCompare() {
  compareJobs = await allJobs();

  /* **الأرشيفُ الفارغ يُستقبَل بجوابٍ واحد لا بثلاثة نفي.**
     كانت الشاشةُ تعرض ثلاث بطاقاتٍ كلُّها «لا يوجد»: لا منشأة لها تقريران،
     ولا علامة، والأرشيف فارغ — فيخرج الزائرُ وقد قيل له ثلاثَ مرات إنه لا
     شيء عنده، ولم يُقَل له مرةً ما هذه الشاشة ولا كيف تمتلئ. */
  const emptyBox = $('#cmp-empty');
  const hasAny = compareJobs.length > 0;
  if (emptyBox) {
    emptyBox.hidden = hasAny;
    emptyBox.innerHTML = hasAny ? '' : `<div class="card intro-empty">
      <h2>المقارنة — تُظهر ما تغيَّر، ولا تعمل من تقريرٍ واحد</h2>
      <p>هنا تُقارَن منشأةٌ بنفسها بين تقريرين، أو تُقارَن بمنافسٍ في مدينتك وتصنيفك،
        أو تُجمَع فروعُ علامةٍ واحدة. وكلُّها تحتاج تقارير في أرشيفك أولًا.</p>
      <ul>
        <li><b>ما تغيَّر عندك:</b> أنشئ تقريرًا اليوم، ثم آخرَ للرابط نفسه بعد شهرٍ أو شهرين.</li>
        <li><b>مقارنةٌ بمنافس:</b> أنشئ تقريرًا لمنشأةٍ أخرى في المدينة والتصنيف نفسيهما.</li>
        <li><b>فروعُ علامة:</b> اكتب اسم العلامة نفسه في حقل «العلامة / المالك» عند كل فرع.</li>
      </ul>
      <div class="row"><button type="button" class="btn gold" data-go="new">ابدأ تقريرك الأول</button></div>
    </div>`;
    emptyBox.querySelector('[data-go]')?.addEventListener('click', () => show('new'));
  }
  for (const id of ['cmp-timeline-card', 'cmp-bench-card', 'cmp-group-card']) {
    const c = $('#' + id);
    if (c) c.hidden = !hasAny;
  }
  if (!hasAny) return;

  const places = comparablePlaces(compareJobs);
  const sel = $('#cmp-place');
  sel.innerHTML = places.length
    ? places.map((p) => `<option value="${p.key}">${p.name} (${p.count} تقارير)</option>`).join('')
    : '<option value="">— لا منشأة لها تقريران بعد —</option>';
  fillTimelineSelects();

  const tgt = $('#cmp-target');
  tgt.innerHTML = compareJobs.length
    ? compareJobs.map((j) => `<option value="${esc(j.id)}">${esc(j.place?.identity?.name || 'بلا اسم')} — ${esc(j.ctx?.cityName || '')} ${esc(j.ctx?.districtName || '')}</option>`).join('')
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
      t.plan.tasks.length ? ` — ${esc(t.plan.tasks.map((x) => x.text).join('؛ '))}` : ''}.</p>` : ''}`;
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
    <td>${esc(r.name)}${r.isTarget ? ' <span class="badge">أنت</span>' : ''}</td>
    <td>${esc(r.district)}</td><td>${r.googleAverage ?? '—'}</td><td>${r.googleCount ?? '—'}</td>
    <td>${r.negativeShare ?? '—'}%</td><td>${r.replyRate ?? '—'}%</td><td>${r.total}</td></tr>`).join('');

  const topics = b.topics.slice(0, 8).map((t) => `<tr>
    <td>${esc(t.name)}</td>${t.cells.map((c) => `<td class="${c.isTarget ? 'me' : ''}">${c.total ? `${c.total} <small>(سلبي ${c.neg})</small>` : '—'}</td>`).join('')}
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
      <thead><tr><th>الموضوع</th>${b.rows.map((r) => `<th class="${r.isTarget ? 'me' : ''}">${esc(r.name)}</th>`).join('')}</tr></thead>
      <tbody>${topics}</tbody></table></div>` : '<p class="fine">لا محاور مشتركة بعدُ بين هذه المنشآت.</p>'}`;
}

/* ───────────────────────── تقرير المجموعة ───────────────────────── */

let groupList = [];
let groupAnalysis = null;

function renderGroups() {
  groupList = brands(compareJobs);
  const sel = $('#grp-brand');
  sel.innerHTML = groupList.length
    ? groupList.map((b) => `<option value="${esc(b.name)}">${esc(b.name)} (${b.jobs.length} فروع)</option>`).join('')
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
    return `<tr><td>${b.rank}</td><td>${esc(b.label)}</td><td>${esc(b.district)}</td>
      <td>${b.googleAverage ?? '—'}</td><td>${b.googleCount ?? '—'}</td>
      <td>${b.negativeShare === null ? '—' : `${b.negativeShare}%${b.negMargin !== null ? ` <span class="fine">±${b.negMargin}</span>` : ''}`}${b.thin ? ' <span class="lone-tag">دون 3</span>' : ''}</td><td>${b.replyRate ?? '—'}%</td>
      <td class="${tone}">${esc(b.trend)}</td></tr>`;
  }).join('');

  const shared = a.shared.map((t) =>
    `<li><b>${esc(t.name)}</b> — ${t.branches.length} فروع: ${t.branches.map((x) => `${esc(x.label)} (${x.neg})`).join('، ')}</li>`).join('');
  const mentioned = (a.mentioned || []).map((t) =>
    `<li><b>${esc(t.name)}</b> — ${t.branches.map((x) => `${esc(x.label)} (${x.neg})`).join('، ')} <span class="fine">— دون ثلاثٍ في فرع، فلا يُسمّى مشكلةَ نظام</span></li>`).join('');
  const uniq = a.unique.map((t) =>
    `<li><b>${esc(t.name)}</b> — ${esc(t.branches[0].label)} وحده (${t.branches[0].neg})</li>`).join('');

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
      ${shared ? `<div class="chg bad"><b>شكاوى مشتركة — مشكلة نظام (ثلاثٌ فأكثر في كل فرع)</b><ul>${shared}</ul></div>` : ''}
      ${mentioned ? `<div class="chg"><b>وردت في أكثر من فرع — ذِكرًا لا نمطًا بعد</b><ul>${mentioned}</ul></div>` : ''}
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
    note.textContent = 'بدونه يُستعمل خط الجهاز. تضمينه يزيد حجم الملف نحو 300 كيلوبايت ويثبّت الشكل عند كل مستقبِل.';
  }
}

/** النسخة المُسلَّمة: HTML مجمَّد كما سُلِّم، فلا يتغيّر بتغيّر القاموس أو القالب. */
async function renderSnapshots() {
  const box = $('#snapshots-box');
  if (!box || !job) return;
  const snaps = await snapshotsOf(job.id);
  if (!snaps.length) { box.innerHTML = ''; return; }

  box.innerHTML = `<p class="fine">نسخ مُسلَّمة (لا تتغيّر بتغيّر الإعدادات):</p>` +
    snaps.map((s) => `<div class="snap" data-id="${s.id}">
      <span class="when">${String(s.at).slice(0, 10)}</span>
      <span class="meta">${esc(s.template || '—')}${s.note ? ` · ${esc(s.note)}` : ''} · ${Math.round((s.html || '').length / 1024)} ك.ب</span>
      <span class="spacer"></span>
      <button type="button" class="btn ghost sm" data-act="open">فتح</button>
      <button type="button" class="btn ghost sm" data-act="dl">تنزيل</button>
      <button type="button" class="btn danger sm" data-act="del">حذف</button>
    </div>`).join('');

  box.querySelectorAll('.snap').forEach((row) => {
    row.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', async () => {
      const snap = await getSnapshot(row.dataset.id);
      if (!snap) return;
      if (b.dataset.act === 'open') {
        const w = window.open('', '_blank');
        if (!w) { toast('المتصفح منع النافذة'); return; }
        w.document.write(snap.html); w.document.close();
      } else if (b.dataset.act === 'dl') {
        download(`rabih-delivered-${asciiName(job.place.identity.name)}-${String(snap.at).slice(0, 10)}.html`,
          snap.html, 'text/html;charset=utf-8');
      } else {
        if (!confirm('حذف هذه النسخة المُسلَّمة؟ لا رجعة.')) return;
        await deleteSnapshot(snap.id);
        renderSnapshots();
        toast('حُذفت');
      }
    }));
  });
}

function bindFreeze() {
  $('#btn-freeze').addEventListener('click', async () => {
    if (!$('#r-md').value.trim()) { toast('لا تقرير لتجميده'); return; }
    const note = prompt('وسمٌ للنسخة (اختياري): لمن سُلِّمت أو بأي وسيلة؟') ?? '';
    const tpl = TEMPLATES[job.template] || TEMPLATES[DEFAULT_TEMPLATE];
    await saveSnapshot({
      jobId: job.id,
      html: currentHtml(),
      markdown: reportMarkdown(),
      template: tpl.name,
      note: note.trim(),
      place: job.place.identity.name || '',
    });
    await renderSnapshots();
    toast('جُمِّدت النسخة — لن تتغيّر بعدها');
  });
}

/* ───────────────────── الإخراج المصمَّم من نموذج (اختياري) ─────────────────────
   وُعِد به منذ أول جولة ولم يُوصَل بالواجهة، فبقيت الدالّة معرَّفةً لا يبلغها أحد.

   ويُعرض في إطارٍ معزول (sandbox بلا allow-same-origin): شيفرةٌ يكتبها نموذجٌ
   ويلصقها المستخدم لا تُشغَّل في أصل الموقع حيث الأرشيف. */

function designHtmlWithPhotos() {
  let html = $('#d-design').value;
  const shots = job.photos || [];
  for (let i = 0; i < 6; i += 1) {
    const url = shots[i]?.url || '';
    html = html.replaceAll(`__PHOTO_${i + 1}__`, url);
  }
  // ما بقي من المواضع بلا صورة يُفرَّغ، فلا تظهر صورة مكسورة في تقرير يُسلَّم.
  return html.replace(/<img[^>]*src=["']?__PHOTO_\d+__["']?[^>]*>/g, '');
}

/**
 * تنبيهٌ في شاشة التسليم: التقرير الذي تُسلّمه مبنيٌّ على تعليقات غير التي أمامك.
 *
 * وهنا تحديدًا يجب أن يُقال، لا في خط التحليل وحده: من هنا يُطبَع ويُرسَل.
 */
/** أزرار التسليم: ما يُخرِج التقرير من الشاشة إلى يد عميلك. */
const DELIVERY_BTNS = ['#btn-print', '#btn-download-html', '#btn-download-md', '#btn-download-xlsx', '#btn-onepage', '#btn-card-png', '#btn-preview-owner', '#btn-freeze', '#btn-wa', '#btn-tg', '#btn-mail', '#btn-design-print', '#btn-design-dl'];

function renderStaleReport() {
  const box = $('#stale-report');
  if (!box) return;
  const now = dataStamp(job.place);
  const stalies = staleSteps(job.out, job.stamps || {}, now);

  /* لا يُسلَّم تقريرٌ لا يصف بياناته — والمنع هنا لا التنبيه وحده: تنبيهٌ
     يُتجاوَز بضغطة، والتقرير يخرج إلى يد صاحب المنشأة فلا يُستدرَك. */
  const lock = stalies.length > 0 && !job.staleAck;
  DELIVERY_BTNS.forEach((sel) => { const b = $(sel); if (b) b.disabled = lock; });

  if (!stalies.length) { box.innerHTML = ''; return; }
  box.innerHTML = `<div class="msg err"><b>هذا التقرير مبنيٌّ على تعليقات غير الحالية.</b>
    <p class="fine">غُيِّرت التعليقات بعد إنتاج ${stalies.length} من خطوات التحليل. والمعرّفات (R001…) تُمنَح بالترتيب،
    فما استشهد به التحليل القديم يشير الآن إلى تعليقاتٍ أخرى — ولن يكشف ذلك مدقّق السند.</p>
    ${lock ? `<p class="fine"><b>التسليم موقوف</b> حتى تُعيد تشغيل الخطوات المعلَّمة ⚠ في خط التحليل.</p>
      <div class="row">
        <button type="button" class="btn sm" id="btn-go-fix">إلى خط التحليل</button>
        <label class="inline-field"><input type="checkbox" id="stale-ack"> أُقرّ بالفارق وأتحمّله</label>
      </div>`
    : '<p class="fine">أقررتَ بالفارق، فالتسليم مفتوح. والإقرار لا يُغيّر شيئًا في التقرير.</p>'}</div>`;

  const go = $('#btn-go-fix');
  if (go) go.addEventListener('click', () => { renderPipeline(); show('pipeline'); });
  const ack = $('#stale-ack');
  if (ack) ack.addEventListener('change', (e) => { job.staleAck = e.target.checked; scheduleSave(); renderStaleReport(); });
}

function renderDesignState() {
  const badge = $('#design-state');
  if (!badge) return;
  const v = ($('#d-design').value || '').trim();
  const used = (job.photos || []).length;
  badge.textContent = v ? `${Math.round(v.length / 1024)} ك.ب · ${used} صورة` : 'لا شيء بعد';
  badge.className = 'badge' + (v ? ' mid' : '');
}

/**
 * مسوّدات الردود — تُكتب هنا ولا تدخل التقرير.
 *
 * وهي **اقتراحٌ للمالك** ينشره بنفسه، فلا تمرّ على مدقّق السند (لا تدّعي
 * استنادًا إلى معرّفات) — لكنها تُبنى من الشكاوى بلا ردّ وحدها.
 */
function renderRepliesState() {
  const badge = $('#replies-state');
  if (!badge) return;
  const pending = (job.place.reviews || []).filter((r) => ((r.rating !== null && r.rating <= 3)) && !(r.ownerReply || '').trim() && (r.text || '').trim()).length;
  const has = ($('#d-replies')?.value || '').trim();
  badge.textContent = pending ? `${pending} شكوى بلا ردّ${has ? ' · مسوّدات جاهزة' : ''}` : 'لا شكوى بلا ردّ';
  badge.className = 'badge' + (pending ? (has ? ' ok' : ' mid') : ' ok');
}

/* ───────────── المزامنة والرصد والرابط الخاص ───────────── */

const CLOUD_BOX = 'rabih:cloud-box';

/**
 * منافسٌ بالاسم — أقوى ورقةٍ في اجتماع البيع.
 *
 * يُجلَب رابطه من المزوّد ويُقارَن محورًا بمحور. ولا يُخزَّن في أرشيفك:
 * هو بيانات غيرك، تُعرَض للمقارنة ثم تذهب.
 */
function bindRival() {
  $('#btn-rival-fetch').addEventListener('click', async () => {
    const url = ($('#rival-url')?.value || '').trim();
    if (!url) { message('#rival-msg', 'err', 'ألصق رابط المنافس أولًا.'); return; }

    const target = compareJobs.find((j) => j.id === $('#cmp-target')?.value) || job;
    if (!target?.place?.reviews?.length) { message('#rival-msg', 'err', 'اختر منشأةً من أرشيفك للمقارنة.'); return; }

    const btn = $('#btn-rival-fetch');
    btn.disabled = true;
    message('#rival-msg', 'warn', 'يُجلَب المنافس من المزوّد…');
    const r = await fetchAllReviews(url, { limit: 200, sort: 'newest' });
    btn.disabled = false;

    if (!r.ok) {
      message('#rival-msg', 'err', r.error, r.needsKey
        ? ['يحتاج مفتاح مزوّد (OUTSCRAPER_KEY أو APIFY_TOKEN) في بيئة Netlify.'] : []);
      return;
    }
    if (!r.reviews.length) { message('#rival-msg', 'warn', 'لم يُعِد المزوّد تعليقات لهذا الرابط.'); return; }

    const rival = { ...emptyPlace(), identity: { ...emptyPlace().identity, name: r.placeName || 'المنافس' } };
    rival.ratings = { average: r.average ?? null, count: r.claimed ?? r.fetched, distribution: null };
    rival.reviews = r.reviews.map((x, i) => ({ ...x, id: `X${String(i + 1).padStart(3, '0')}` }));

    renderRival(target.place, rival, r);
    message('#rival-msg', 'ok', `جُلب ${r.fetched} تعليقًا من ${esc(rival.identity.name)}.`, [
      'ولا تُحفَظ تعليقات المنافس في أرشيفك — تُعرَض للمقارنة ثم تذهب.',
    ]);
  });
}

/** جدول المقارنة: محورًا بمحور، ومَن يتفوّق في كلٍّ منها. */
function renderRival(mine, rival, meta) {
  const box = $('#rival-box');
  if (!box) return;
  const a = stats(mine);
  const b = stats(rival);

  const mineT = new Map(topicStats(mine).map((t) => [t.id, t]));
  const rivalT = new Map(topicStats(rival).map((t) => [t.id, t]));
  const ids = [...new Set([...mineT.keys(), ...rivalT.keys()])];

  const share = (t, total) => (t && total ? Number(((t.neg / total) * 100).toFixed(1)) : 0);
  const rows = ids.map((id) => {
    const m = mineT.get(id);
    const v = rivalT.get(id);
    const ms = share(m, a.total);
    const vs = share(v, b.total);
    return { id, name: (m || v).name, ms, vs, diff: Number((ms - vs).toFixed(1)) };
  }).filter((r) => r.ms > 0 || r.vs > 0).sort((x, y) => y.diff - x.diff);

  const cmp = (x, y, higherBetter = true) => {
    if (x === null || y === null) return '<span class="fine">—</span>';
    if (x === y) return '<span class="fine">تعادل</span>';
    const better = higherBetter ? x > y : x < y;
    return better ? '<span class="delta up">أنت</span>' : '<span class="delta down">هو</span>';
  };

  box.innerHTML = `<div class="table-wrap"><table class="mini"><thead><tr>
      <th>المحور</th><th>${esc(mine.identity?.name || 'أنت')}</th><th>${esc(rival.identity?.name || 'المنافس')}</th><th>الأفضل</th>
    </tr></thead><tbody>
      <tr><td><b>متوسط قوقل</b></td><td>${a.googleAverage ?? '—'}</td><td>${rival.ratings.average ?? '—'}</td><td>${cmp(a.googleAverage, rival.ratings.average)}</td></tr>
      <tr><td><b>عدد التقييمات</b></td><td>${a.googleCount ?? '—'}</td><td>${rival.ratings.count ?? '—'}</td><td>${cmp(a.googleCount, rival.ratings.count)}</td></tr>
      <tr><td><b>نسبة السلبي في العيّنة</b></td><td>${a.rated ? Math.round((a.negative / a.rated) * 100) : '—'}%</td><td>${b.rated ? Math.round((b.negative / b.rated) * 100) : '—'}%</td><td>${cmp(a.rated ? a.negative / a.rated : null, b.rated ? b.negative / b.rated : null, false)}</td></tr>
      ${rows.map((r) => `<tr><td>${esc(r.name)}</td><td>${r.ms}%</td><td>${r.vs}%</td><td>${cmp(r.ms, r.vs, false)}</td></tr>`).join('')}
    </tbody></table></div>
    <p class="fine">نسبة الشكاوى في كل محور من عيّنة كلٍّ منكما (${a.total} مقابل ${b.total} تعليقًا).
    والعيّنتان قد تختلفان حجمًا وحداثةً، فالمقارنة <b>مؤشّر لا حُكم</b>.</p>`;
}

function bindEval() {
  const render = () => {
    const hist = evalHistory();
    const badge = $('#eval-state');
    if (badge) {
      badge.textContent = hist.length ? `آخر تشغيل: ${hist[0].average ?? '—'}/100` : 'لم يُشغَّل بعد';
      badge.className = 'badge' + (hist.length ? (hist[0].average >= 70 ? ' ok' : ' mid') : '');
    }
    const box = $('#eval-box');
    if (!box) return;
    if (!hist.length) { box.innerHTML = ''; return; }
    box.innerHTML = `<div class="table-wrap"><table class="mini"><thead><tr><th>التشغيل</th><th>المتوسط</th><th>مرفوض</th><th>الفرق عن السابق</th></tr></thead>
      <tbody>${hist.slice(0, 8).map((h, i) => {
        const prev = hist[i + 1];
        const d = prev && typeof h.average === 'number' && typeof prev.average === 'number' ? h.average - prev.average : null;
        return `<tr><td>${esc(String(h.at).slice(0, 16).replace('T', ' '))}</td><td><b>${h.average ?? '—'}</b></td>
          <td>${h.rejected || 0}</td>
          <td>${d === null ? '—' : `<span class="delta ${d >= 0 ? 'up' : 'down'}">${d > 0 ? '▲ +' : (d < 0 ? '▼ ' : '')}${d}</span>`}</td></tr>`;
      }).join('')}</tbody></table></div>
      <p class="fine">الاختراع أو تحريف الاقتباس يُصفّر الدرجة مهما حسُن ما سواه.</p>`;
  };
  render();

  $('#btn-eval-run').addEventListener('click', async () => {
    const btn = $('#btn-eval-run');
    btn.disabled = true;
    message('#eval-msg', 'warn', 'يعمل المعيار… ستّ نداءات تقريبًا.');
    const r = await runEval({ onProgress: (m) => message('#eval-msg', 'warn', m) });
    btn.disabled = false;

    if (r.needsKey) {
      message('#eval-msg', 'err', 'لا مفتاح OpenRouter.', ['أضف OPENROUTER_KEY في متغيّرات البيئة على Netlify ثم أعد النشر.']);
      return;
    }
    /* **فشلُ الاتصال ليس تشغيلًا.** كان تعذُّرُ الوصول إلى الخادم يُسجَّل في
       السجلّ تشغيلًا بمتوسط صفر و«مرفوض» — فيقرؤه من يفتح اللوحة حكمًا على
       النماذج لا على الشبكة. فما لم يُجِب نموذجٌ واحد لا يُحفَظ شيء ويُقال السبب. */
    const answered = (r.rows || []).filter((x) => !x.error).length;
    if (!answered) {
      const why = (r.rows || []).find((x) => x.error)?.error || 'تعذّر الوصول إلى الخادم';
      message('#eval-msg', 'err', 'لم يُشغَّل المعيار: لم يُجِب أيُّ نموذج، فلا يُسجَّل تشغيل.', [String(why)]);
      return;
    }
    saveRun(r);
    render();
    const lines = r.rows.map((x) => x.error
      ? `${x.model} · ${x.stage}: ${x.error}`
      : `${x.model} · ${x.stage}: ${x.verdict} ${x.total}/100 (سند ${x.cited}% · تغطية ${x.coverage}%${x.invented ? ` · اخترع ${x.invented}` : ''}${x.misquoted ? ` · حرّف ${x.misquoted}` : ''})`);
    message('#eval-msg', r.rejected ? 'warn' : 'ok', `المتوسط ${r.average ?? '—'}/100${r.rejected ? ` — و${r.rejected} مخرجًا مرفوضًا` : ''}.`, lines);
  });
}

function bindPrivacy() {
  const box = $('#privacy-on');
  if (!box) return;
  box.checked = privacyOn();
  box.addEventListener('change', (e) => {
    setPrivacy(e.target.checked);
    toast(e.target.checked ? 'وضع الخصوصية مُفعَّل — الأسماء مستعارة فيما يخرج منك' : 'أُطفئ وضع الخصوصية');
    if (!$('#view-report').hidden) renderReport();
  });
}

function bindNetwork() {
  $('#btn-network-scan').addEventListener('click', async () => {
    const jobs = await allJobs();
    const n = scanNetwork(jobs);
    const box = $('#network-box');
    if (!n.authors.length && !n.texts.length) {
      box.innerHTML = `<div class="msg ok">فُحص ${n.checked} تعليقًا في ${jobs.length} منشأة — لا إشارة عابرة بينها.</div>`;
      return;
    }
    box.innerHTML = `<div class="msg warn"><b>فُحص ${n.checked} تعليقًا: ${n.texts.length} نصًّا متكررًا عبر منشآت، و${n.authors.length} كاتبًا مشتركًا.</b>
      <p class="fine">تشابه الاسم ليس تطابقًا للشخص، والحكم حكمك.</p></div>
      ${n.texts.slice(0, 5).map((x) => `<p class="fine"><b>نصٌّ متطابق</b> في ${esc(x.places.join('، '))}: «${esc(x.text)}…»</p>`).join('')}
      ${n.authors.slice(0, 6).map((x) => `<p class="fine"><b>${esc(x.name)}</b> — ${x.count} تعليقًا في ${esc(x.places.join('، '))}${x.mixed ? ' <b class="err-text">(مدحٌ هنا وذمٌّ هناك)</b>' : ''}</p>`).join('')}`;
  });
}

function bindCloud() {
  const boxInput = $('#cl-box');
  if (boxInput) boxInput.value = localStorage.getItem(CLOUD_BOX) || '';

  const pass = () => ($('#cl-pass')?.value || '').trim();

  $('#btn-cloud-push').addEventListener('click', async () => {
    if (pass().length < 8) { message('#cloud-msg', 'err', 'كلمة السر ثمانية أحرف فأكثر — ونسيانها يعني ضياع النسخة.'); return; }
    let id = localStorage.getItem(CLOUD_BOX);
    if (!id) { id = newBoxId(); localStorage.setItem(CLOUD_BOX, id); $('#cl-box').value = id; }

    message('#cloud-msg', 'warn', 'يُشفَّر في جهازك ثم يُرفَع…');
    const jobs = await allJobs();
    const r = await cloudPush(id, 'archive', { jobs, at: new Date().toISOString() }, pass());
    if (!r.ok) {
      message('#cloud-msg', 'err', r.error, r.needsStore
        ? ['المخزن يعمل على Netlify وحدها، ويحتاج تفعيل Blobs للموقع.'] : []);
      return;
    }
    message('#cloud-msg', 'ok', `رُفعت نسخة (${Math.round(r.bytes / 1024)} ك.ب).`, [
      `احفظ معرّف صندوقك: ${id}`,
      'وبلا كلمة السر لا تُفكّ النسخة — ولا نملك استعادتها لك.',
    ]);
  });

  $('#btn-cloud-pull').addEventListener('click', async () => {
    const id = ($('#cl-box')?.value || localStorage.getItem(CLOUD_BOX) || '').trim();
    if (!id) { message('#cloud-msg', 'err', 'لا معرّف صندوق. ارفع نسخةً أولًا، أو ألصق معرّفك.'); return; }
    if (pass().length < 8) { message('#cloud-msg', 'err', 'اكتب كلمة السر أولًا.'); return; }
    if (!confirm('استعادة النسخة السحابية؟ ما يحمل المعرّف نفسه في أرشيفك سيُحدَّث بنسخة السحابة.')) return;

    message('#cloud-msg', 'warn', 'يُجلَب ويُفكّ في جهازك…');
    const r = await cloudPull(id, 'archive', pass());
    if (!r.ok) { message('#cloud-msg', 'err', r.error); return; }
    if (!r.found) { message('#cloud-msg', 'warn', 'لا نسخة في هذا الصندوق.'); return; }

    let added = 0;
    for (const j of r.data.jobs || []) { await saveJob(j); added += 1; }
    localStorage.setItem(CLOUD_BOX, id);
    message('#cloud-msg', 'ok', `استُعيد ${added} تقريرًا (نسخة ${String(r.updatedAt || '').slice(0, 16)}).`);
    renderArchive();
  });

  $('#btn-cloud-copy').addEventListener('click', async () => {
    const id = $('#cl-box')?.value;
    if (id) toast(await copy(id) ? 'نُسخ المعرّف' : 'تعذّر النسخ');
  });

  $('#btn-cloud-del').addEventListener('click', async () => {
    const id = localStorage.getItem(CLOUD_BOX);
    if (!id) return;
    if (!confirm('حذف النسخة من السحابة؟ أرشيفك في الجهاز لا يُمسّ.')) return;
    await removeBox(id, 'archive');
    message('#cloud-msg', 'ok', 'حُذفت النسخة السحابية. وأرشيفك في جهازك كما هو.');
  });
}

function bindWatch() {
  $('#btn-watch-sync').addEventListener('click', async () => {
    const jobs = await allJobs();
    const seen = new Set();
    const places = [];
    for (const j of jobs) {
      const url = (j.mapsUrl || '').trim();
      const name = j.place?.identity?.name || '';
      if (!url || seen.has(url)) continue;
      seen.add(url);
      places.push({ id: j.id, name, url });
    }
    if (!places.length) { message('#watch-msg', 'warn', 'لا منشآت في أرشيفك بعد.'); return; }

    const res = await fetch('/api/watch', {
      method: 'PUT', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ places, at: new Date().toISOString() }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      message('#watch-msg', 'err', data.error || `تعذّر الرفع (${res.status}).`,
        data.needsStore ? ['يعمل على Netlify وحدها.'] : []);
      return;
    }
    $('#watch-state').textContent = `${places.length} منشأة مرصودة`;
    $('#watch-state').className = 'badge ok';
    message('#watch-msg', 'ok', `رُفعت قائمة الرصد: ${places.length} منشأة.`, [
      'المرفوع الروابط وأسماؤها فقط — ولا تُرفَع تعليقات.',
      'والجولة تعمل يوميًّا، وتحتاج مفتاح مزوّد للجلب.',
    ]);
  });

  $('#btn-watch-run').addEventListener('click', async () => {
    message('#watch-msg', 'warn', 'تعمل جولة… قد تستغرق دقائق بحسب عدد المنشآت.');
    const res = await fetch('/api/watch');
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { message('#watch-msg', 'err', data.error || `تعذّرت الجولة (${res.status}).`); return; }
    renderWatchResults(data);
  });
}

/** نتيجة الجولة: ما تغيّر وما يستحقّ إنذارًا. */
function renderWatchResults(data) {
  const box = $('#watch-box');
  if (!box) return;
  const rows = data.results || [];
  if (!rows.length) { message('#watch-msg', 'ok', data.note || 'لا منشآت مرصودة.'); box.innerHTML = ''; return; }

  const alerts = rows.filter((r) => r.alerts?.length);
  message('#watch-msg', alerts.length ? 'warn' : 'ok',
    `فُحصت ${rows.length} منشأة — ${alerts.length ? `${alerts.length} تستحقّ نظرك` : 'لا تغيّر يستحقّ الإنذار'}.`);

  box.innerHTML = `<div class="table-wrap"><table class="mini"><thead><tr>
    <th>المنشأة</th><th>التعليقات</th><th>المتوسط</th><th>السلبي</th><th>ما تغيّر</th>
  </tr></thead><tbody>${rows.map((r) => `<tr${r.alerts?.length ? ' class="stale-row"' : ''}>
      <td><b>${esc(r.name || '—')}</b></td>
      <td>${r.after?.count ?? '—'}${r.newOnes ? ` <span class="chip">+${r.newOnes}</span>` : ''}</td>
      <td>${r.after?.average ?? '—'}${r.before?.average ? ` <span class="fine">(كان ${r.before.average})</span>` : ''}</td>
      <td>${r.after?.negShare ?? '—'}%</td>
      <td class="fine">${r.error ? esc(r.error) : (r.alerts?.length ? r.alerts.map((a) => esc(a.text)).join('<br>') : '—')}</td>
    </tr>`).join('')}</tbody></table></div>`;
}

function bindShare() {
  $('#btn-share-publish').addEventListener('click', async () => {
    const pass = ($('#sh-pass')?.value || '').trim();
    if (pass.length < 6) { message('#share-msg', 'err', 'كلمة سر التقرير ستّة أحرف فأكثر.'); return; }
    const html = await signedHtml();
    if (!html) { message('#share-msg', 'err', 'لا تقرير لنشره.'); return; }

    message('#share-msg', 'warn', 'يُشفَّر في جهازك ثم يُرفَع…');
    /* اسمُ المكتب يتصدّر صفحة الاستقبال قبل كلمة السر — واسمُ المنشأة لا،
       فمن وجد الرابط يعرف حينها عمّن التقرير قبل أن يملك فتحه. */
    const office = (identity.load().office || '').trim();
    const r = await sharePublish(html, pass, {
      id: job.shareId || '',
      meta: { name: job.place.identity.name, at: new Date().toISOString() },
      label: office,
    });
    if (!r.ok) {
      message('#share-msg', 'err', r.error, r.needsStore ? ['يعمل على Netlify وحدها.'] : []);
      return;
    }
    job.shareId = r.id;
    scheduleSave();
    $('#sh-url').value = r.url;
    message('#share-msg', 'ok', `نُشر.${office ? ` وصفحة الاستقبال تحمل «${office}» قبل كلمة السر — واسم المنشأة لا يظهر فيها.` : ''}`, [
      'أرسل الرابط لعميلك، و<b>أرسل الكلمة في قناةٍ أخرى</b> — لا في الرسالة نفسها.',
      'وإعادة النشر تُحدّث الرابط نفسه.',
    ]);
  });

  $('#btn-share-copy').addEventListener('click', async () => {
    const u = $('#sh-url')?.value;
    if (u) toast(await copy(u) ? 'نُسخ الرابط' : 'تعذّر النسخ');
  });

  $('#btn-share-del').addEventListener('click', async () => {
    if (!job.shareId) return;
    if (!confirm('إلغاء الرابط؟ لن يفتحه عميلك بعدها.')) return;
    await shareUnpublish(job.shareId);
    job.shareId = '';
    $('#sh-url').value = '';
    scheduleSave();
    message('#share-msg', 'ok', 'أُلغي الرابط.');
  });
}

function bindRepliesView() {
  $('#btn-replies-prompt').addEventListener('click', async () => {
    const text = promptReplyDrafts(job.place, job.ctx);
    toast(await copy(text) ? 'نُسخت رسالة المسوّدات — ألصقها في النموذج' : 'تعذّر النسخ');
  });

  $('#btn-replies-run').addEventListener('click', async () => {
    const btn = $('#btn-replies-run');
    btn.disabled = true;
    message('#replies-msg', 'warn', 'يُشغَّل النموذج…');
    const ta = $('#d-replies');
    ta.value = '';
    const r = await callModel('deepseek/deepseek-chat-v3:free', promptReplyDrafts(job.place, job.ctx), {
      onChunk: (_p, whole) => { ta.value = whole; ta.scrollTop = ta.scrollHeight; },
    });
    btn.disabled = false;
    if (!r.ok) {
      ta.value = '';
      message('#replies-msg', 'err', r.error, r.needsKey ? ['أضف OPENROUTER_KEY في متغيّرات البيئة على Netlify.'] : []);
      return;
    }
    job.replyDrafts = r.text;
    ta.value = r.text;
    scheduleSave();
    renderRepliesState();
    message('#replies-msg', 'ok', 'جاهزة — راجعها قبل نشرها، فهي اقتراحٌ لا قرار.');
  });

  $('#d-replies').addEventListener('input', (e) => { job.replyDrafts = e.target.value; scheduleSave(); renderRepliesState(); });
  $('#btn-replies-copy').addEventListener('click', async () => {
    toast(await copy($('#d-replies').value) ? 'نُسخت المسوّدات' : 'تعذّر النسخ');
  });
  $('#btn-replies-dl').addEventListener('click', () => {
    const t = $('#d-replies').value;
    if (t.trim()) download(reportFileName('replies.md'), t, 'text/markdown;charset=utf-8');
  });
}

function bindDesignView() {
  $('#btn-design-prompt').addEventListener('click', async () => {
    const text = promptDesign(reportMarkdown(), job.place, job.ctx);
    toast(await copy(text) ? 'نُسخت رسالة التصميم — ألصقها في النموذج' : 'تعذّر النسخ');
  });

  $('#d-design').addEventListener('input', (e) => {
    job.designHtml = e.target.value;
    scheduleSave();
    renderDesignState();
  });

  $('#btn-design-render').addEventListener('click', () => {
    const html = designHtmlWithPhotos();
    if (!html.trim()) { toast('ألصق الشيفرة أولًا'); return; }
    $('#design-preview').hidden = false;
    $('#design-frame').srcdoc = html;
    toast('عُرض في إطار معزول');
  });

  $('#btn-design-print').addEventListener('click', () => {
    const html = designHtmlWithPhotos();
    if (!html.trim()) { toast('ألصق الشيفرة أولًا'); return; }
    $('#design-preview').hidden = false;
    const frame = $('#design-frame');
    frame.srcdoc = html;
    frame.addEventListener('load', () => {
      try { frame.contentWindow.print(); }
      catch { toast('تعذّرت الطباعة من الإطار — نزّل الملف واطبعه'); }
    }, { once: true });
  });

  $('#btn-design-dl').addEventListener('click', () => {
    const html = designHtmlWithPhotos();
    if (!html.trim()) { toast('ألصق الشيفرة أولًا'); return; }
    download(reportFileName('design.html'), html, 'text/html;charset=utf-8');
  });
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
    if (f.size > 2 * 1024 * 1024) { toast('الخط أكبر من 2 ميغابايت'); e.target.value = ''; return; }
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

function renderHistory() {
  const d = history.depth(job.id);
  const u = $('#btn-undo'), r = $('#btn-redo'), b = $('#history-depth');
  if (!u) return;
  u.disabled = !d.past;
  r.disabled = !d.future;
  b.textContent = d.past ? `${d.past} تعديلًا محفوظًا` : 'لا تعديلات';
  b.className = 'badge' + (d.past ? ' mid' : '');
}

function applyHistoryText(text) {
  if (text === null) { toast('لا مزيد'); return; }
  $('#r-md').value = text;
  job.reportMd = text;
  scheduleSave();
  renderReport(); renderCompleteness(); renderConfidence(); showTemplateNote(); renderHistory();
}

function bindHistory() {
  $('#btn-undo').addEventListener('click', () => applyHistoryText(history.undo(job.id)));
  $('#btn-redo').addEventListener('click', () => applyHistoryText(history.redo(job.id)));
}

/** مقياس الثقة في صدر شاشة التقرير — يراه صاحبه قبل أن يُسلّم. */
function renderConfidence() {
  const box = $('#confidence-box');
  if (!box) return;
  const c = confidenceScore({ ...job, reportMd: $('#r-md').value });
  const tone = c.level === 'قوية' ? 'ok' : (c.level === 'ضعيفة' ? 'err' : 'warn');
  box.innerHTML = `<div class="msg ${tone}"><b>${esc(c.summary)}</b>
    <div class="chips" style="margin-top:8px">${
      c.parts.filter((p) => p.score !== null)
        .map((p) => `<span class="chip">${esc(p.name)} <b>${Math.round(p.score * 100)}%</b></span>`).join('')
    }</div>
    ${c.caveats.length ? `<ul>${c.caveats.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}</div>`;
}

function renderCompleteness() {
  const box = $('#completeness-box');
  if (!box) return;
  const text = $('#r-md').value.trim();
  if (!text) { box.innerHTML = ''; return; }

  const r = audit(text, job.place);
  const topics = r.missedTopics.length
    ? `<p class="fine">مواضيع رصدها القاموس وأهملها التقرير: ${
        r.missedTopics.map((t) => `<b>${esc(t.name)}</b> (${t.total} مرات — ${esc(t.ids.join('، '))})`).join(' · ')}</p>` : '';
  const alertsList = r.missedAlerts.length
    ? `<ul class="fine">${r.missedAlerts.map((a) => `<li>إنذار لم يُذكر: ${esc(a)}</li>`).join('')}</ul>` : '';

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
  let histTimer = null;
  $('#r-md').addEventListener('input', (e) => {
    job.reportMd = e.target.value;
    scheduleSave();
    // لقطة كل ثانيتين من التوقف، لا عند كل حرف.
    clearTimeout(histTimer);
    histTimer = setTimeout(() => { history.push(job.id, e.target.value); renderHistory(); }, 2000);
  });
  $('#r-md').addEventListener('blur', () => { showTemplateNote(); renderCompleteness(); renderConfidence(); });
  $('#r-lang').addEventListener('change', (e) => {
    job.lang = e.target.value;
    scheduleSave();
    renderReport();
  });

  $('#btn-render').addEventListener('click', () => { renderReport(); toast('حُدّثت المعاينة'); });

  $('#btn-print').addEventListener('click', () => {
    const w = window.open('', '_blank');
    if (!w) { toast('المتصفح منع النافذة — اسمح بالنوافذ المنبثقة'); return; }
    w.document.write(currentHtml());
    w.document.close();
    w.addEventListener('load', () => setTimeout(() => w.print(), 400));
  });

  // الملف الذي يخرج من يدك موقَّع: من غيّر فيه حرفًا كُشِف.
  $('#btn-download-html').addEventListener('click', async () => download(reportFileName('html'), await signedHtml(), 'text/html;charset=utf-8'));

  /* **معاينةٌ بعين المستقبِل.**
     المُعِدّ يراجع التقرير على شاشةٍ عريضة ويُسلّمه إلى من يفتحه بإبهامه في
     واتساب. فيرى هنا ما سيراه عميلُه: العرضُ نفسه، والخطُّ نفسه، والقطعُ
     نفسه — قبل أن يُسلّم لا بعده. */
  $('#btn-preview-owner').addEventListener('click', async () => {
    const html = currentHtml();
    const wrap = document.createElement('div');
    wrap.className = 'owner-preview';
    wrap.innerHTML = `<div>
      <div class="bar"><span>هكذا يراه عميلك على جوّاله (390 بكسل)</span>
        <button type="button" class="btn sm" id="op-close">إغلاق</button></div>
      <div class="frame"><iframe title="معاينة بعين العميل"></iframe></div>
    </div>`;
    document.body.appendChild(wrap);
    wrap.querySelector('iframe').srcdoc = html;
    const close = () => wrap.remove();
    wrap.querySelector('#op-close').addEventListener('click', close);
    wrap.addEventListener('click', (e) => { if (e.target === wrap) close(); });
    document.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }
    });
  });

  /* صفحةُ «في سطور» وحدها — تُرسَل في محادثة وتُقرأ على الجوال في ثانية.
     والتقريرُ الكامل ثلاثَ عشرةَ صفحة، ولا يُفتَح في واتساب. ولا يسقط منها
     ما يُقيّد أرقامها: حدودُ التغطية ومقياسُ الثقة معها. */
  $('#btn-onepage').addEventListener('click', async () => {
    const one = buildReportHtml({
      sector: sectorFor(job.ctx?.groupId),
      place: job.place,
      ctx: job.ctx,
      markdown: '',
      photos: [],
      show: {
        brief: true, coverage: true, confidence: true, toc: false, quotes: false,
        priority: false, actions: false, commit: false, checklist: false, drafts: false,
        voice: false, card: false, selfCompare: false, effect: false, promises: false,
        keep: false, unanswered: false,
        topics: false, cooccur: false, timing: false, recency: false, entities: false,
        replies: false, sources: false, stars: false, calc: false, impact: false,
        bias: false, photos: false,
      },
      font: job.font,
      identity: identity.load(),
      job,
    });
    download(reportFileName('one-page.html'), bilingual(one, job.lang || 'ar'), 'text/html;charset=utf-8');
    toast('صفحةٌ واحدة — ومعها حدود التغطية ومقياس الثقة.');
  });

  /* بطاقة الثناء صورةً: البطاقةُ في التقرير تُقرأ ولا تُنشَر. */
  $('#btn-card-png').addEventListener('click', async () => {
    const { drawCard, bestQuote } = await import('./card.js');
    const q = bestQuote(job.place);
    if (!q) { toast('لا ثناءَ بخمس نجومٍ ونصٍّ كافٍ في عيّنتك — ولا تُختلَق بطاقة.'); return; }
    const blob = await drawCard(q, { placeName: job.place?.identity?.name || '', mark: identity.load()?.showRabih !== false });
    if (!blob) { toast('النصّ أطول من أن يُعرَض في بطاقةٍ بلا بتر — ولا يُبتَر كلامُ عميلك.'); return; }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = reportFileName('card.png');
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast(`نُزِّلت — بنصّ ${q.id} كما كُتب، بلا تهذيب.`);
  });

  $('#btn-download-csv').addEventListener('click', () => {
    download(reportFileName('reviews.csv'), reviewsCsv(job), 'text/csv;charset=utf-8');
  });

  $('#btn-verify-file').addEventListener('click', async () => {
    const f = $('#verify-file').files?.[0];
    if (!f) { message('#verify-msg', 'warn', 'اختر ملف التقرير أولًا.'); return; }
    const v = await verifyFile(await f.text());
    message('#verify-msg', v.ok ? 'ok' : 'err', v.reason, v.shown
      ? [`المكتوبة في الملف: ${v.shown}`, `المحسوبة من محتواه: ${v.actual}`] : []);
  });
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
  /* قراءةٌ واحدة تُمرَّر إلى الثلاثة: كانت كل لوحةٍ تقرأ الأرشيف من جديد،
     فبخمسمئة تقرير صار فتح الشاشة يستغرق نحو ثانية ونصف — قِسته. */
  const jobs = await allJobs();
  renderPortfolio(jobs);
  renderClients(jobs);

  /* **أرشيفٌ فارغ لا يُستقبَل بأربع بطاقاتٍ فارغة وتحذيرِ ضياع.**
     كان الزائرُ الجديد يرى «نظرة المحفظة» و«دفتر العملاء» خاويين، وتحتهما
     تحذيرٌ بأن تقاريره قد تُمحى — ولا تقريرَ عنده أصلًا. فتُطوى الثلاثة حتى
     يوجد ما يُحمى، ويبقى جوابٌ واحدٌ يقول ما هذه الشاشة وكيف تمتلئ. */
  const bare = jobs.length === 0 && !filter.trim();
  for (const id of ['portfolio-card', 'clients-card', 'safety-card']) {
    const c = $('#' + id);
    if (c) c.hidden = bare;
  }
  const q = filter.trim();
  const list = q ? jobs.filter((j) => (j.place?.identity?.name || '').includes(q)) : jobs;

  if (!list.length) {
    host.innerHTML = q ? '<div class="empty">لا نتائج للبحث.</div>' : `<div class="intro-empty">
      <h2>أرشيفك — وهو ما يجعل التقريرَ الثاني أثمنَ من الأول</h2>
      <p>كلُّ تقريرٍ تُنشئه يُحفَظ هنا في متصفّحك وحده، مرتَّبًا بالمنطقة والمدينة والتصنيف والحيّ.
        ومتى اجتمع لك تقريران للمنشأة نفسها صار بيدك ما لا يُشترى: <b>ما تغيَّر فعلًا بعد أن عملتَ بالتوصيات</b>.</p>
      <ul>
        <li>تقريران لمنشأةٍ واحدة ← شاشةُ المقارنة تقيس أثر ما فعلتَه.</li>
        <li>منشأتان في مدينةٍ وتصنيفٍ واحد ← مقارنةٌ بمنافس.</li>
        <li>وحين يمتلئ الأرشيف تظهر هنا نظرةُ المحفظة ودفترُ العملاء وأدواتُ حمايته.</li>
      </ul>
      <div class="row"><button type="button" class="btn gold" id="ar-start">ابدأ تقريرك الأول</button></div>
    </div>`;
    host.querySelector('#ar-start')?.addEventListener('click', () => show('new'));
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
  row.innerHTML = `<span class="n">${esc(j.place?.identity?.name || 'بلا اسم')}</span>
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
  if (folder) lines.push(`<li class="ok-line">مجلد النسخ: <b>${esc(folder)}</b></li>`);
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
    /* «لا سبيل لاستعادتها» — فخطأُ حرفٍ واحد يحبس صاحبه خارج أرشيفه إلى الأبد.
       فتُكتب مرتين قبل أن تُفعَّل. */
    const p2 = $('#lk-pass2')?.value ?? p;
    if (p !== p2) { message('#lock-msg', 'err', 'الكلمتان مختلفتان — اكتبها مرتين متطابقتين، فلا سبيل لاستعادتها بعد التفعيل.'); return; }
    const r = await lock.enable(p);
    message('#lock-msg', r.ok ? 'ok' : 'err', r.ok ? 'فُعِّل القفل. احفظ كلمة السر — لا سبيل لاستعادتها.' : r.reason);
    $('#lk-pass').value = '';
    if ($('#lk-pass2')) $('#lk-pass2').value = '';
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
      <div class="chips">${top.map(([w, n]) => `<span class="chip lex-cand" data-w="${esc(w)}">${esc(w)} <b>${n}</b></span>`).join('')}</div>` : ''}</div>`;
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
      list.map((w) => `<span class="chip">${esc(w)} <button type="button" class="btn danger sm lex-del" data-t="${esc(id)}" data-w="${esc(w)}" style="padding:0 6px">×</button></span>`).join('')
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
        <td>${esc(r.model)}</td><td>${r.runs}</td><td>${r.cleanRate}%</td><td>${r.score}%</td>
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
        <img src="assets/rabeh-logo.png" alt="رابــح — نُحلّل تقييماتك، ونطوّر أعمالك" style="height:46px;width:auto;display:block;margin:0 auto 8px">
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
    <span class="qname">${esc(cur?.place?.identity?.name || 'بلا اسم')}</span>
    <span class="qdots">${ids.map((id, i) =>
      `<span class="qdot ${i === at ? 'on' : (byId.get(id)?.reportMd ? 'done' : '')}" data-i="${i}" title="${esc(byId.get(id)?.place?.identity?.name || '')}"></span>`).join('')}</span>
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
  bindBulk();
  bindDataView();
  bindPipelineView();
  bindReportView();
  bindPlanView();
  bindOutputView();
  bindEval();
  bindPrivacy();
  bindRival();
  bindNetwork();
  bindCloud();
  bindWatch();
  bindShare();
  bindRepliesView();
  bindDesignView();
  bindHistory();
  bindFreeze();
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
    /* البابُ يُفتَح تلقائيًّا لمن ملأ شيئًا من قبل — فلا يُخفى عنه ما كتبه. */
    const mf = $('#more-fields');
    if (mf) mf.open = !!(job.ctx.cityId || job.ctx.categoryId || job.ctx.brand || job.ctx.districtName);
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

  $('#btn-tour').addEventListener('click', () => { tour.reset(); tour.start(show); });

  /**
   * تقريرٌ نموذجيّ يُفتَح في ثانية.
   *
   * كان على الوافد أن يملأ ثمانية حقولٍ ويلصق تعليقاتٍ ويُشغّل خط النماذج
   * قبل أن يرى شكل ما اشترى. ورؤيةُ تقريرٍ واحدٍ كاملًا تُغني عن جولةٍ من
   * ثلاث عشرة خطوة. والبيانات فيه **مصرَّحٌ بأنها تجريبية** في كل موضع،
   * فلا تُحسَب منشأةً حقيقية.
   */
  async function loadDemo() {
    const { fixture, CTX } = await import('./eval.js');
    const demo = fixture();
    /* الاسمُ يحمل بيانَه معه: كي لا يُظنَّ منشأةً حقيقيةً في الأرشيف بعد أيام. */
    demo.identity = { ...(demo.identity || {}), name: 'مقهى المعيار (نموذج تجريبي)' };
    job.place = demo;
    job.ctx = { ...CTX, groupId: 'food' };
    job.mapsUrl = '';
    job.assume = { ticket: 30, monthly: 900, loss: 25 };
    job.rawPaste = demo.reviews.map((r) => `${r.rating} | ${r.author || 'عميل'} | ${r.date}\n${r.text}`).join('\n---\n');

    /* **وخطُّ التحليل يُفتَح لا يُقفَل.**
       كانت الجولة تُوصِل الوافد إلى الخطوة الثالثة فيجدها «لم تُبلَغ بعد»،
       لأن مخرجات النماذج خالية. فأهمُّ ما يُقنعه — أن يرى التحليل وقد جرى
       على مراحله — هو بالضبط ما كان يُحجَب عنه. فتُملأ الثماني بمخرجاتٍ
       تجريبية مصرَّحٌ بها في متنها، ولا يُدَّعى أن نموذجًا شُغِّل. */
    const demoNote = '⟪مخرَجٌ تجريبيّ — لم يُشغَّل نموذج، وهذا نصٌّ مكتوبٌ سلفًا ليُرى شكلُ الخطوة⟫';
    const demoTopics = 'الانتظار: R002، R007 · القهوة: R001، R005 · الأجواء: R008 · النظافة: R004';
    job.out = {
      n1: `${demoNote}\n\nوُحِّدت 8 تعليقات. المواضيع المرصودة:\n${demoTopics}`,
      n2: `${demoNote}\n\nوُحِّدت 8 تعليقات. اتّفق مع الأول في المواضيع، وخالفه في تصنيف R004 (نظافة لا خدمة).`,
      n3: `${demoNote}\n\nوُحِّدت 8 تعليقات. رصد في R007 موضوعين: انتظار وسعر.`,
      nm: `${demoNote}\n\nالمعتمَد ما اتّفق عليه اثنان فأكثر. الخلاف في R004 حُسم للنظافة (2 من 3)، وأُثبت الموضوع الثاني في R007.\n${demoTopics}`,
      a1: `${demoNote}\n\nأبرز ما يتكرّر: الانتظار في الذروة (R002، R007). وأبرز المحمود: القهوة (R001، R005).`,
      a2: `${demoNote}\n\nالانتظار أكثر الشكاوى، ويقع مساءً. والنظافة ذكرٌ مفرد (R004) لا يُبنى عليه حكم.`,
      a3: `${demoNote}\n\nالقهوة والأجواء هما ما يُحافَظ عليه. والسعر ذُكر مرة واحدة ولا يُرتَّب.`,
      am: '',
    };
    $('#r-md').value = [
      '## الخلاصة التنفيذية',
      'هذا **تقريرٌ نموذجيّ ببياناتٍ تجريبية** — أُعِدّ ليُرى شكلُ التقرير لا ليوصف محلٌّ حقيقي.',
      'مقهى المعيار متوسطه 4.2 من 5 على 240 تقييمًا، وحُلِّل منها 8 تعليقات منصوصة.',
      '',
      '## أبرز ما يتكرّر',
      'الانتظار وسرعة الخدمة أكثر ما يُشتكى منه (R002، R007)، والقهوة والأجواء أكثر ما يُثنى عليه (R001، R005، R008).',
      '',
      '## توصيات تنفيذية',
      '1. قياس زمن التحضير في ساعة الذروة ثلاثة أيام، وتدوين متوسطه.',
      '2. الردّ على الشكاوى التي بلا ردّ — R002 و R004.',
    ].join('\n');
    job.out.am = $('#r-md').value;
    renderParseStats(); renderRecency(); renderTopics(); renderEntities(); renderReplies();
    renderContext(); renderAnomaly(); renderIntegrity(); renderSources(); renderBias();
    renderConfidenceHint(); renderPriority(); renderStars(); renderImpactPreview();
    renderReport();
    /* **ويُحفَظ في الأرشيف.** كان الأرشيفُ يبقى فارغًا بعد الجولة، فلا يرى
       الوافدُ شاشةَ أرشيفٍ عاملةً قطّ. واسمُه مُعلِنٌ بنفسه أنه تجريبي، فلا
       يختلط بمنشأةٍ حقيقية، ويُحذَف كأي تقرير. */
    scheduleSave();
    show('report');
    toast('تقريرٌ نموذجيّ ببياناتٍ تجريبية — محفوظٌ في أرشيفك لتَرى الشاشات عاملة.');
  }

  /** دعوةٌ لا مقاطعة: شريطٌ أعلى الشاشة لا يحجب حقلًا ولا يوقف عملًا. */
  function showTourOffer() {
    const bar = document.createElement('div');
    bar.className = 'tour-offer';
    bar.innerHTML = `<span><b>أول مرة هنا؟</b> انظر تقريرًا كاملًا قبل أن تُدخل شيئًا — ثم ألصق رابط منشأتك واضغط «ابدأ».</span>
      <button type="button" class="btn sm" id="offer-demo">أرِني تقريرًا كاملًا</button>
      <button type="button" class="btn ghost sm" id="offer-tour">بل طُف بي في الشاشات</button>
      <button type="button" class="btn ghost sm" id="offer-close" aria-label="إخفاء">إخفاء</button>`;
    document.body.prepend(bar);
    const close = () => { tour.markDone(); bar.remove(); };
    bar.querySelector('#offer-tour').addEventListener('click', () => { close(); tour.reset(); tour.start(show); });
    bar.querySelector('#offer-demo').addEventListener('click', () => { close(); loadDemo(); });
    bar.querySelector('#offer-close').addEventListener('click', close);
  }

  bindFilePickers();
  $('#models-live')?.addEventListener('toggle', (e) => { if (e.target.open) renderLiveModels(); });
  $('#btn-models-refresh')?.addEventListener('click', () => renderLiveModels({ force: true }));

  renderQueue();

  /* **الجولة تُعرَض ولا تُفرَض.**
     كانت تفتح نفسها على الوافد الجديد بثلاث عشرة خطوة تحجب الشاشة قبل أن
     يرى شيئًا — وهو جاء ليعرف حال محلّه لا ليتعلّم أداة. فصارت دعوةً في
     سطرٍ يقبلها من شاء، وتُخفى لمن ردّها فلا تُلحّ عليه. والزرّ باقٍ أعلى
     الصفحة لمن أرادها بعدُ. */
  if (!tour.isDone() && !restored) showTourOffer();

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
