// نقطة الدخول: فتح التخزين، تهيئة المستخدم المحلي، التوجيه بين الصفحات (#/…)، وتذكير النسخ الاحتياطي.

import { repo } from './data/repository.js';
import { ensureUser, getUI, setUI, getVaultSettings, setVaultSettings } from './data/settings.js';
import { insertSeed } from './data/seed.js';
import { backupStatus, exportBackup, downloadBlob, markExported } from './data/backup.js';
import { uploadBackup, uploadImages } from './data/vault.js';
import { revokeImageUrls } from './data/images.js';
import { startFollowUpAlerts } from './util/follow-up-alerts.js';
import { initGlobalSearch } from './util/global-search.js';
import { installTableCards } from './util/table-cards.js';
import { installSyncDot } from './util/sync-dot.js';
import { installShortcuts } from './util/shortcuts.js';
import { applySidebarOrder } from './util/sidebar.js';
import { applyTheme } from './util/theme.js';
import { setHijriMode, formatNumber, countOf } from './util/format.js';
import { initVoiceBar } from './util/voice-bar.js';
import { startAutoLock } from './util/auto-lock.js';
import { initClientMode, applyClientMode, clientModeOn } from './util/client-mode.js';
import { el, clear, toast, echoDates, closeAllModals } from './util/dom.js';
import { daysWord } from './util/format.js';
import * as todayPage from './pages/today.js';
import * as dashboardPage from './pages/dashboard.js';
import * as opportunitiesPage from './pages/opportunities.js';
import * as propertiesPage from './pages/properties.js';
import * as mapPage from './pages/map.js';
import * as clientsPage from './pages/clients.js';
import * as toursPage from './pages/tours.js';
import * as requestsPage from './pages/requests.js';
import * as matchesPage from './pages/matches.js';
import * as externalPage from './pages/external.js';
import * as pricingPage from './pages/pricing.js';
import * as calendarPage from './pages/calendar.js';
import * as invoicesPage from './pages/invoices.js';
import * as expensesPage from './pages/expenses.js';
import * as dealsPage from './pages/deals.js';
import * as marketPage from './pages/market.js';
import * as trashPage from './pages/trash.js';
import * as publishPage from './pages/publish.js';
import * as tasksPage from './pages/tasks.js';
import * as notesPage from './pages/notes.js';
import * as clientPage from './pages/client.js';
import * as healthPage from './pages/health.js';
import * as settingsPage from './pages/settings.js';
import * as integrationsPage from './pages/integrations.js';
import * as managementPage from './pages/management.js';
import * as stampPage from './pages/stamp.js';
import * as whatsappPage from './pages/whatsapp.js';
import * as regaPage from './pages/rega.js';
import * as extractPage from './pages/extract.js';
import { applyRole } from './util/role.js';

// سجل الصفحات: الصفحات اللاحقة تُضاف هنا وفي القائمة الجانبية في index.html.
const ROUTES = {
  today: { title: 'يومي', render: todayPage.render },
  dashboard: { title: 'الداشبورد', render: dashboardPage.render },
  opportunities: { title: 'الفرص', render: opportunitiesPage.render },
  properties: { title: 'العقارات', render: propertiesPage.render },
  map: { title: 'خريطة العقارات', render: mapPage.render },
  clients: { title: 'العملاء', render: clientsPage.render },
  tours: { title: 'الجولات الميدانية', render: toursPage.render },
  requests: { title: 'الطلبات العقارية', render: requestsPage.render },
  matches: { title: 'المطابقات', render: matchesPage.render },
  external: { title: 'العروض الخارجية', render: externalPage.render },
  pricing: { title: 'تقدير السعر', render: pricingPage.render },
  calendar: { title: 'التقويم', render: calendarPage.render },
  management: { title: 'إدارة الأملاك', render: managementPage.render },
  rega: { title: 'عقود الوساطة وتراخيص الإعلانات', render: regaPage.render },
  extract: { title: 'تفريغ المستندات والوسائط', render: extractPage.render },
  stamp: { title: 'ختم الصور والمقاطع', render: stampPage.render },
  whatsapp: { title: 'واتساب', render: whatsappPage.render },
  invoices: { title: 'الفواتير وعروض الأسعار', render: invoicesPage.render },
  expenses: { title: 'المالية', render: expensesPage.render },
  deals: { title: 'الصفقات', render: dealsPage.render },
  market: { title: 'السوق', render: marketPage.render },
  trash: { title: 'سلة المحذوفات', render: trashPage.render },
  publish: { title: 'الصفحة العامة للعروض', render: publishPage.render },
  tasks: { title: 'المهام', render: tasksPage.render },
  notes: { title: 'الأفكار والملاحظات', render: notesPage.render },
  client: { title: 'ملف العميل', render: clientPage.render },
  health: { title: 'صحة البيانات', render: healthPage.render },
  integrations: { title: 'التكاملات', render: integrationsPage.render },
  settings: { title: 'الإعدادات', render: settingsPage.render },
};
const DEFAULT_ROUTE = 'today'; // صفحة «يومي» هي المقصد الأول عند الفتح (المرحلة ١١)

let bannerDismissed = false;
let renderToken = 0;

/* ===== القائمة الجانبية: الأسماء تظهر وتختفي، والأيقونات لا تختفي أبدًا (المرحلة ١٥) ===== */

const isNarrow = () => window.matchMedia('(max-width: 640px)').matches;

function setSidebarExpanded(on) {
  const box = document.getElementById('sidebar-toggle');
  if (box) box.checked = !!on;
}

/**
 * يستعيد حالة القائمة المحفوظة ويحفظ كل تبديل — فلا تعود إلى الأيقونات وحدها بعد كل تنقّل.
 * الافتراض: مفتوحة بأسمائها على الحاسوب، ومطوية على الجوال (حيث هي درج يغطي الصفحة).
 */
async function initSidebarState() {
  const box = document.getElementById('sidebar-toggle');
  if (!box) return;
  const saved = (await getUI()).sidebarExpanded;
  setSidebarExpanded(isNarrow() ? false : saved !== false);
  box.addEventListener('change', () => {
    if (!isNarrow()) setUI({ sidebarExpanded: box.checked }); // تفضيل الحاسوب وحده يُحفظ
  });
}

/**
 * اسمُ المسار، و`null` لمسارٍ مكتوبٍ لا وجودَ له.
 *
 * كان يُعيد الصفحةَ الافتراضية لأيّ شيء، فـ`#/zzz` تعرض «يومي» **والعنوانُ في شريط
 * المتصفّح يبقى `#/zzz` وعنوانُ الصفحة «يومي»**. فمن حفظ رابطًا قديمًا أو أخطأ حرفًا رأى
 * صفحةً صحيحةً في مكانٍ خطأ ولا يعرف لماذا. والفراغُ (`#` أو لا شيء) شأنٌ آخر: تلك
 * صفحتُك الأولى لا خطأً (المرحلة ٤٣).
 */
function routeName() {
  const raw = location.hash || '';
  if (!raw || raw === '#' || raw === '#/') return DEFAULT_ROUTE;
  const m = /^#\/([\w-]+)/.exec(raw);
  if (!m) return null;
  return ROUTES[m[1]] ? m[1] : null;
}

/**
 * `scope` على رؤوس الجداول (المرحلة ٣٥).
 *
 * بدونها لا يعرف قارئ الشاشة أيّ رأسٍ يخصّ أيّ خلية، فيقرأ «٢٬١٠٠٬٠٠٠» ولا يقول «السعر».
 * والجداول تُبنى في عشرين صفحة، فوضعُها في كل موضع تكرارٌ يُنسى في الصفحة الحادية
 * والعشرين. فتُوضع هنا مرّة بعد كل رسم: ما في `thead` رأسُ عمود، وما في `tbody` رأسُ صفّ
 * (وهو نمط جداول الحقائق في التطبيق: الوصف يمينًا والقيمة يسارًا).
 */
function markTableHeaders(root) {
  if (!root) return;
  for (const th of root.querySelectorAll('thead th:not([scope])')) th.setAttribute('scope', 'col');
  for (const th of root.querySelectorAll('tbody th:not([scope])')) th.setAttribute('scope', 'row');
}

/** مساراتٌ كلّها مال: لا تُفتح بدور المساعد (المرحلة ٣٦). */
// «واتساب» للمالك وحده (المرحلة ٣٨): الحملة تُرسل باسم المكتب وتُحاسَب عليه،
// والوارد فيه أرقام العملاء وكلامهم.
// الصفقات صفحةُ عمولاتٍ كاملة، فهي كالفواتير والمالية: للمالك وحده (المرحلة ٤٣).
const OWNER_ONLY_ROUTES = new Set(['invoices', 'expenses', 'deals', 'integrations', 'whatsapp']);

async function navigate() {
  const name = routeName();
  const page = document.getElementById('page');
  if (name === null) {
    clear(page);
    document.querySelectorAll('.sidebar-nav a').forEach((a) => { a.classList.remove('active'); a.removeAttribute('aria-current'); });
    document.title = 'صفحة غير موجودة — كسّاب';
    page.append(el('div', { class: 'empty' },
      el('p', { class: 'strong', text: 'لا صفحة بهذا العنوان.' }),
      el('p', { class: 'muted' }, 'المكتوب في شريط العنوان: ', el('span', { class: 'ltr', text: location.hash })),
      el('p', { class: 'muted small', text: 'قد يكون رابطًا قديمًا، أو حرفًا سقط. واختر من القائمة الجانبية، أو ارجع إلى «يومي».' }),
      el('a', { class: 'btn btn-primary', href: '#/today', text: 'إلى «يومي»' })));
    return;
  }
  const route = ROUTES[name];
  // `aria-current="page"` لا الصنف وحده (المرحلة ٣٥): الصنف لونٌ يراه المبصر، والسمة هي
  // ما يقوله قارئ الشاشة — «الصفحة الحالية». وبدونها يسمع تسعة عشر رابطًا متساوية.
  document.querySelectorAll('.sidebar-nav a').forEach((a) => {
    const on = a.dataset.route === name;
    a.classList.toggle('active', on);
    if (on) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  applyClientMode(clientModeOn()); // الروابط تُعاد بناؤها/تُرتَّب، فيُعاد تطبيق الإخفاء
  // الدرج على الجوال يُطوى بعد اختيار صفحة (وإلا غطّى الصفحة)، أما على الحاسوب فاختيارك يبقى.
  if (isNarrow()) setSidebarExpanded(false);
  // صفحتان كلّهما مال: لا تُفتحان بدور المساعد ولو كُتب عنوانهما بالعنوان مباشرةً
  // (المرحلة ٣٦). وإخفاء رابطٍ ليس منعًا، والمنع هنا يسبق الرسم.
  if (OWNER_ONLY_ROUTES.has(name) && document.body.classList.contains('assistant-mode')) {
    clear(page);
    page.append(el('div', { class: 'empty' },
      el('p', { class: 'strong', text: 'هذه الصفحة للمالك وحده.' }),
      el('p', { class: 'muted', text: 'الفواتير والمصاريف تعرض أرباح المكتب، فلا تُفتح بحساب المساعد.' }),
      el('a', { class: 'btn btn-primary', href: '#/today', text: 'إلى «يومي»' })));
    document.title = 'كسّاب';
    return;
  }
  document.title = `${route.title} — كسّاب`;
  // إعلانٌ لقارئ الشاشة: الموجّه يبدّل المحتوى بلا تحميل صفحة، فلا يعلم القارئ أن شيئًا
  // تغيّر — يبقى صامتًا والمستعمل ينتظر. والمنطقة الحيّة تقول له اسم الصفحة.
  const live = document.getElementById('route-live');
  if (live) live.textContent = route.title;
  revokeImageUrls();
  // **ونوافذُ الصفحة السابقة تُغلق معها** (المرحلة ٥٠): تُرسَم في `#modal-root` خارج
  // `#page`، فكان تفريغُ الصفحة لا يمسّها — وتبقى طافيةً فوق الجديدة تحجبها وتلتقط
  // ضغطاتِك. وتُغلق **قبل** الرسم لا بعده، فنافذةُ رابطٍ عميق (`#/clients/<id>`) يفتحها
  // الرسمُ الجديد تبقى كما هي.
  closeAllModals();
  clear(page);
  const token = ++renderToken;
  try {
    await route.render(page);
    markTableHeaders(page);
    foldFilters(page);
    echoDates(page);
  } catch (err) {
    if (token !== renderToken) return;
    console.error(err);
    clear(page);
    page.append(el('div', { class: 'error-box' },
      el('strong', { text: 'تعذر عرض الصفحة' }),
      el('div', { text: err.message || String(err) })));
  }
}

/* ===== تبويبٌ آخر مفتوح ===== */

/**
 * **تبويبان على البيانات نفسها: آخرُ كتابةٍ تغلب.**
 *
 * وذلك سلوكٌ صحيحٌ لجهازٍ واحد ولا يُراد تغييره — قفلُ السجلّات بين تبويبَي المستخدم نفسه
 * تعقيدٌ بلا مقابل. **لكنّه كان صامتًا**: من فتح تبويبين وكتب في كليهما فقَد ما كتبه في
 * الأول ولا شيء يقول له. فيُقال: تبويبٌ يعلم بفتح غيره فيُنبّه مرّةً واحدة.
 *
 * والقناةُ `BroadcastChannel` حين تتوفّر، وإلّا `storage` — وكلتاهما بين تبويبات الأصل
 * نفسه لا تخرجان منه، ولا يُرسَل فيهما إلا وقتٌ (المرحلة ٤٤).
 */
function watchOtherTabs() {
  const KEY = 'kassab:tab-ping';
  let warned = false;
  const warn = () => {
    if (warned) return;
    warned = true;
    toast('تبويبٌ آخر من كسّاب مفتوح على البيانات نفسها — واكتب في واحدٍ منهما: آخرُ حفظٍ يغلب.', 'info', 9000);
  };
  const announce = () => { try { localStorage.setItem(KEY, String(Date.now())); } catch (_) { /* تصفّح خاص */ } };
  try {
    const ch = new BroadcastChannel(KEY);
    ch.addEventListener('message', (e) => { if (e.data === 'hello') { ch.postMessage('here'); warn(); } else if (e.data === 'here') warn(); });
    ch.postMessage('hello');
    return;
  } catch (_) { /* لا BroadcastChannel — نرجع إلى التخزين */ }
  window.addEventListener('storage', (e) => { if (e.key === KEY) warn(); });
  announce();
}

/* ===== الفلاتر على الجوّال: تُطوى خلف زرّ ===== */

/**
 * على شاشة الجوّال كانت صفحة العقارات تعرض **ستّ مجموعات فلاتر** قبل أوّل عقار: قِيس
 * فوجد أوّل بطاقةٍ عند ١٠٩١ بكسل وارتفاع الشاشة ٨٤٤ — أي شاشةٌ وثلث تمريرًا قبل أن ترى
 * بيانًا واحدًا، في أكثر صفحةٍ تُفتح.
 *
 * فتُطوى الفلاتر خلف زرٍّ، **ويُكتب على الزرّ عدد الفلاتر الفعّالة** — فلا يختفي شيءٌ
 * صامتًا: من طوى الفلاتر وهو مصفٍّ يرى «الفلاتر (٢)» فيعلم لماذا القائمة قصيرة.
 *
 * والحاويةُ نفسها تبقى (الصفحات تُفرّغ أبناءها لا تستبدلها)، فالطيّ يصمد بعد كل تصفية.
 */
function foldFilters(page) {
  if (!isNarrow()) return;
  for (const box of page.querySelectorAll('.filters')) {
    if (box.previousElementSibling?.classList.contains('filters-toggle')) continue;
    box.classList.add('filters-foldable');
    const btn = el('button', {
      type: 'button', class: 'btn btn-sm filters-toggle',
      'aria-expanded': 'false', 'aria-controls': box.id || '',
      onClick: () => {
        const open = box.classList.toggle('filters-open');
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
        label();
      },
    });
    const label = () => {
      const active = box.querySelectorAll('.chip.active:not(.chip-all)').length;
      const open = box.classList.contains('filters-open');
      btn.textContent = `${open ? '▲' : '▼'} الفلاتر${active ? ` (${formatNumber(active)})` : ''}`;
    };
    label();
    box.addEventListener('click', () => setTimeout(label, 0)); // التصفية تعيد رسم الرقائق
    box.before(btn);
  }
}

/* ===== تذكير النسخ الاحتياطي اليومي ===== */

async function exportNow() {
  try {
    const { blob, filename } = await exportBackup();
    downloadBlob(blob, filename);
    await markExported();
    toast(`تم تصدير ${filename}`, 'success');
    window.dispatchEvent(new CustomEvent('kassab:data-changed'));
  } catch (err) {
    console.error(err);
    toast(err.message || 'تعذر التصدير', 'error');
  }
}

async function refreshBanner() {
  const banner = document.getElementById('backup-banner');
  if (!banner) return;
  if (bannerDismissed) { banner.hidden = true; return; }
  let status;
  try {
    status = await backupStatus();
  } catch (_) {
    banner.hidden = true;
    return;
  }
  if (!status.due) { banner.hidden = true; return; }
  clear(banner);
  const since = status.lastExportAt ? `آخر نسخة احتياطية قبل ${daysWord(Math.floor(status.hoursSince / 24))}.` : 'لم تُحفظ نسخة احتياطية بعد.';
  banner.append(el('div', { class: 'banner-inner' },
    el('span', {}, `${since} بياناتك محفوظة في هذا المتصفح فقط — صدّر نسخة يوميًا.`),
    el('div', { class: 'banner-actions' },
      el('button', { type: 'button', class: 'btn btn-primary btn-sm', text: 'تصدير الآن', onClick: exportNow }),
      el('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: 'لاحقًا', onClick: () => { bannerDismissed = true; banner.hidden = true; } }))));
  banner.hidden = false;
}

/* ===== الرفع التلقائي للنسخة السحابية المشفَّرة (المرحلة ١٠) ===== */

const VAULT_EVERY_HOURS = 24;
const VAULT_IMAGES_EVERY_HOURS = 168; // أسبوع: الصور ثقيلة ونادرة التغيّر

/**
 * يرفع نسخة مشفَّرة مرة كل يوم إن فُعّل الخيار ووُجدت عبارة سرّية.
 * صامت تمامًا عند الفشل (لا شبكة، جلسة منتهية): النسخة المحلية والتصدير اليدوي لم يتغيّرا،
 * وشريط التذكير يبقى هو الحارس الظاهر.
 */
async function autoVaultBackup() {
  try {
    const vault = await getVaultSettings();
    if (!vault.auto || !vault.passphrase) return;
    const hours = vault.lastUploadAt ? (Date.now() - new Date(vault.lastUploadAt).getTime()) / 3600000 : Infinity;
    if (hours < VAULT_EVERY_HOURS) return;
    const counts = await repo.counts();
    if (!DATA_STORES.some((s) => counts[s] > 0)) return; // لا ترفع قاعدة فارغة فوق نسخة صالحة
    // البيانات وحدها، وتُقطَّع كتلًا إن كبرت (المرحلة ٤٥). وكان مكتوبًا هنا أنها «لا
    // تتجاوز حدّ الرفعة مهما كثرت سجلاتك» — وهو غيرُ صحيح: آلافُ عميلٍ بمطابقاتهم تبلغه.
    const res = await uploadBackup(vault.passphrase);
    await setVaultSettings({ lastUploadAt: res.at });
    await markExported();
    window.dispatchEvent(new CustomEvent('kassab:data-changed'));
  } catch (err) {
    console.warn('تعذر رفع النسخة السحابية تلقائيًا', err);
  }

  // والصور أسبوعيًّا في كتلٍ منفصلة (المرحلة ٣٥): ثقيلة وبطيئة ونادرة التغيّر، ورفعُها
  // كل يوم إهدارٌ لبيانات جواله. وفشلُها **لا يمسّ** نسخة البيانات التي رُفعت قبلها.
  try {
    const vault = await getVaultSettings();
    if (!vault.auto || !vault.passphrase) return;
    const hours = vault.lastImagesAt ? (Date.now() - new Date(vault.lastImagesAt).getTime()) / 3600000 : Infinity;
    if (hours < VAULT_IMAGES_EVERY_HOURS) return;
    const res = await uploadImages(vault.passphrase);
    if (res.parts) await setVaultSettings({ lastImagesAt: new Date().toISOString() });
  } catch (err) {
    console.warn('تعذر رفع كتل الصور تلقائيًا', err);
  }
}

/* ===== المزامنة بين الأجهزة (المرحلة ٤٥) ===== */

/**
 * يبدأ دورة المزامنة إن فُعّلت، ويقول للشاشة إن جاء الدمجُ بجديد.
 *
 * **ولا يُعاد تحميل الصفحة تلقائيًّا.** الاسترجاعُ اليدويّ يفعل ذلك لأنك طلبتَه ووقفتَ
 * تنتظره؛ أما هذه فتعمل وأنت تكتب — وإعادةُ تحميلٍ في أثناء كتابتك تمحو ما لم تحفظه.
 * فيُقال لك ما وصل، والتحديثُ بيدك.
 */
function startDeviceSync() {
  import('./data/sync.js').then(({ startSync }) => {
    window.addEventListener('kassab:synced', (e) => {
      const s = e.detail || {};
      const changed = (s.added || 0) + (s.updated || 0);
      if (!changed) return;
      const box = el('div', { class: 'toast toast-row' },
        el('span', { text: `وصل ${countOf(changed, 'سجل')} من جهازك الآخر.` }),
        el('button', { type: 'button', class: 'btn btn-sm', text: 'حدّث الشاشة', onClick: () => location.reload() }));
      document.getElementById('toast-root')?.append(box);
      setTimeout(() => box.remove(), 12000);
    });
    return startSync();
  }).catch((err) => console.warn('تعذّر بدء المزامنة', err));
}

/* ===== البيانات التجريبية عند أول تشغيل ===== */

const DATA_STORES = ['clients', 'properties', 'tours', 'requests', 'matches', 'externalListings', 'deals'];

async function seedOnFirstRun() {
  const ui = await getUI();
  if (ui.firstRunDone) return;
  await setUI({ firstRunDone: true });
  const counts = await repo.counts();
  if (!DATA_STORES.every((s) => counts[s] === 0)) return;
  try {
    await insertSeed();
    toast('أُدرجت بيانات تجريبية للتجربة — تُمسح من الإعدادات', 'info', 6000);
  } catch (err) {
    console.warn('تعذر إدراج البيانات التجريبية', err);
  }
}

/* ===== التثبيت على الجوال والعمل دون اتصال (المرحلة ١٠) ===== */

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  // عامل خدمة جديد استلم الصفحة = ملفات التطبيق تبدّلت تحت قدميك، والصفحة المفتوحة تخلط
  // القديم بالجديد. أعد تحميلها مرة واحدة — بشرطين يمنعان حلقة لا تنتهي:
  // لا إعادة تحميل عند أول تسجيل (ليست تحديثًا)، ولا أكثر من مرة في التبويب الواحد.
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) return;
    try {
      if (sessionStorage.getItem('kassab:sw-reloaded')) return;
      sessionStorage.setItem('kassab:sw-reloaded', '1');
    } catch (_) { return; } // تخزين الجلسة ممنوع (تصفح خاص): لا تُعد التحميل بلا حارس
    location.reload();
  });
  // النطاق الجذر كي يغطّي التطبيق كله؛ والفشل غير مؤثر (التطبيق يعمل بلا عامل خدمة).
  navigator.serviceWorker.register('/sw.js').catch((err) => console.warn('تعذر تسجيل عامل الخدمة', err));
}

/* ===== التهيئة ===== */

async function init() {
  const page = document.getElementById('page');
  try {
    await repo.init();
    await ensureUser();
    await seedOnFirstRun();
  } catch (err) {
    console.error(err);
    page.append(el('div', { class: 'error-box' },
      el('strong', { text: 'تعذر فتح قاعدة البيانات المحلية' }),
      el('div', { text: err?.message || String(err) }),
      el('div', { class: 'small', text: 'تأكد من أن المتصفح يسمح بتخزين البيانات (ليس وضع التصفح الخاص) ثم أعد التحميل.' })));
    return;
  }
  // طلب عدم إخلاء التخزين عند ضيق المساحة (المتصفح قد يرفض بصمت).
  if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});

  window.addEventListener('hashchange', navigate);
  window.addEventListener('kassab:data-changed', refreshBanner);
  window.addEventListener('unhandledrejection', (e) => {
    console.error(e.reason);
    toast(e.reason?.message || 'حدث خطأ غير متوقع', 'error');
  });

  const ui0 = await getUI();
  applyTheme(ui0.theme || 'system'); // قبل أول رسم كي لا يومض البياض
  // الهجري مع الميلادي (المرحلة ٣٨): يُضبط قبل أول رسم، فلا تُرسم صفحةٌ بتقويمٍ ثم تُعاد
  // بآخر. والافتراضي مُشغَّل — هذا بلدٌ يُؤرَّخ فيه بالتقويمين معًا.
  setHijriMode(ui0.hijri !== false);
  if (!location.hash) history.replaceState(null, '', `#/${DEFAULT_ROUTE}`);
  await applySidebarOrder(); // ترتيب صفحات القائمة الجانبية المحفوظ من الإعدادات (المرحلة ٨)
  await initSidebarState(); // قبل أول تنقّل كي لا تُطوى القائمة ثم تُفتح أمام عينك
  initGlobalSearch();
  // الجدولُ بطاقةً على الجوّال (المرحلة ٤٨): موضعٌ واحدٌ يلحق كلَّ جدولٍ في النظام،
  // ولا يعمل إلّا على الشاشة الضيّقة. **وعلى `body` لا على `#page`**: النوافذُ تُرسَم في
  // `#modal-root` خارجه، وفيها جداولُ المقارنة وملخّصِ الضريبة — ولها العطبُ نفسُه.
  installTableCards(document.body);
  // حالُ المزامنة (المرحلة ٤٨): كانت تعمل في صمتٍ تامّ — تنجح وتفشل ولا تقول.
  installSyncDot();
  installShortcuts(); // ثلاثةُ اختصاراتٍ للوحة المفاتيح (المرحلة ٤٩)
  initVoiceBar(); // أمرٌ بالصوت في كل صفحة (المرحلة ٣٨) — لا يسمع شيئًا حتى تضغطه
  watchOtherTabs(); // تبويبٌ آخر مفتوح: يُقال ولا يُترك صامتًا (المرحلة ٤٤)
  initClientMode(); // وضع العرض للعميل (المرحلة ١٣)
  startFollowUpAlerts();
  await initAutoLock(); // القفل التلقائي بعد خمول (المرحلة ٣٢)
  await navigate();
  refreshBanner();
  // دور المستعمل (المرحلة ٣٥): بلا await كذلك — الصفحة تظهر ثم تُخفى الحقول الحسّاسة إن
  // كان الداخل مساعدًا. والمنع الحقيقي على الخادم لا هنا.
  applyRole().catch(() => {});
  autoVaultBackup(); // بلا await: لا يؤخّر ظهور الصفحة
  startDeviceSync();  // المزامنة بين الأجهزة (المرحلة ٤٥) — بلا await كذلك
  registerServiceWorker();
}

/**
 * القفل التلقائي (المرحلة ٣٢): معطَّل حتى تضبط مدّته، وبإنذارٍ قبله.
 *
 * **والقفل تسجيل خروج فعليّ من البوابة** لا شاشة تُخفي المحتوى: شاشةٌ فوق الصفحة بلا حذف
 * الكوكي أمانٌ موهوم — من يغلقها يرى كل شيء.
 */
async function initAutoLock() {
  const minutes = Number((await getUI()).autoLockMinutes) || 0;
  if (!minutes) return;
  startAutoLock({
    minutes,
    onWarn: (seconds, stay) => {
      const box = el('div', { class: 'toast error toast-row' },
        el('span', { text: `سيُقفل التطبيق بعد ${countOf(seconds, 'ثانية')} لعدم النشاط.` }),
        el('button', { type: 'button', class: 'btn btn-sm', text: 'ابقَ مفتوحًا', onClick: () => { stay(); box.remove(); } }));
      document.getElementById('toast-root')?.append(box);
      setTimeout(() => box.remove(), seconds * 1000);
    },
  });
}

init();
