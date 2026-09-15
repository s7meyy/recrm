// نقطة الدخول: فتح التخزين، تهيئة المستخدم المحلي، التوجيه بين الصفحات (#/…)، وتذكير النسخ الاحتياطي.

import { repo } from './data/repository.js';
import { ensureUser, getUI, setUI, getVaultSettings, setVaultSettings } from './data/settings.js';
import { insertSeed } from './data/seed.js';
import { backupStatus, exportBackup, downloadBlob, markExported } from './data/backup.js';
import { uploadBackup, uploadImages } from './data/vault.js';
import { revokeImageUrls } from './data/images.js';
import { startFollowUpAlerts } from './util/follow-up-alerts.js';
import { initGlobalSearch } from './util/global-search.js';
import { applySidebarOrder } from './util/sidebar.js';
import { applyTheme } from './util/theme.js';
import { setHijriMode } from './util/format.js';
import { initVoiceBar } from './util/voice-bar.js';
import { startAutoLock } from './util/auto-lock.js';
import { initClientMode, applyClientMode, clientModeOn } from './util/client-mode.js';
import { el, clear, toast } from './util/dom.js';
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
  stamp: { title: 'ختم الصور والمقاطع', render: stampPage.render },
  whatsapp: { title: 'واتساب', render: whatsappPage.render },
  invoices: { title: 'الفواتير وعروض الأسعار', render: invoicesPage.render },
  expenses: { title: 'المالية', render: expensesPage.render },
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

function routeName() {
  const m = /^#\/([\w-]+)/.exec(location.hash || '');
  return m && ROUTES[m[1]] ? m[1] : DEFAULT_ROUTE;
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
const OWNER_ONLY_ROUTES = new Set(['invoices', 'expenses', 'integrations', 'whatsapp']);

async function navigate() {
  const name = routeName();
  const route = ROUTES[name];
  const page = document.getElementById('page');
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
  clear(page);
  const token = ++renderToken;
  try {
    await route.render(page);
    markTableHeaders(page);
  } catch (err) {
    if (token !== renderToken) return;
    console.error(err);
    clear(page);
    page.append(el('div', { class: 'error-box' },
      el('strong', { text: 'تعذر عرض الصفحة' }),
      el('div', { text: err.message || String(err) })));
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
    // البيانات وحدها: سريعة ولا تتجاوز حدّ الرفعة مهما كثرت سجلاتك.
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
  initVoiceBar(); // أمرٌ بالصوت في كل صفحة (المرحلة ٣٨) — لا يسمع شيئًا حتى تضغطه
  initClientMode(); // وضع العرض للعميل (المرحلة ١٣)
  startFollowUpAlerts();
  await initAutoLock(); // القفل التلقائي بعد خمول (المرحلة ٣٢)
  await navigate();
  refreshBanner();
  // دور المستعمل (المرحلة ٣٥): بلا await كذلك — الصفحة تظهر ثم تُخفى الحقول الحسّاسة إن
  // كان الداخل مساعدًا. والمنع الحقيقي على الخادم لا هنا.
  applyRole().catch(() => {});
  autoVaultBackup(); // بلا await: لا يؤخّر ظهور الصفحة
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
      const box = el('div', { class: 'toast toast-error auto-lock-warn' },
        el('span', { text: `سيُقفل التطبيق بعد ${seconds} ثانية لعدم النشاط.` }),
        el('button', { type: 'button', class: 'btn btn-sm', text: 'ابقَ مفتوحًا', onClick: () => { stay(); box.remove(); } }));
      document.getElementById('toast-root')?.append(box);
      setTimeout(() => box.remove(), seconds * 1000);
    },
  });
}

init();
