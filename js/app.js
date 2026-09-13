// نقطة الدخول: فتح التخزين، تهيئة المستخدم المحلي، التوجيه بين الصفحات (#/…)، وتذكير النسخ الاحتياطي.

import { repo } from './data/repository.js';
import { ensureUser, getUI, setUI } from './data/settings.js';
import { insertSeed } from './data/seed.js';
import { backupStatus, exportBackup, downloadBlob, markExported } from './data/backup.js';
import { revokeImageUrls } from './data/images.js';
import { startFollowUpAlerts } from './util/follow-up-alerts.js';
import { initGlobalSearch } from './util/global-search.js';
import { applySidebarOrder } from './util/sidebar.js';
import { el, clear, toast } from './util/dom.js';
import { daysWord } from './util/format.js';
import * as dashboardPage from './pages/dashboard.js';
import * as propertiesPage from './pages/properties.js';
import * as mapPage from './pages/map.js';
import * as clientsPage from './pages/clients.js';
import * as toursPage from './pages/tours.js';
import * as requestsPage from './pages/requests.js';
import * as matchesPage from './pages/matches.js';
import * as externalPage from './pages/external.js';
import * as invoicesPage from './pages/invoices.js';
import * as publishPage from './pages/publish.js';
import * as tasksPage from './pages/tasks.js';
import * as notesPage from './pages/notes.js';
import * as settingsPage from './pages/settings.js';

// سجل الصفحات: الصفحات اللاحقة تُضاف هنا وفي القائمة الجانبية في index.html.
const ROUTES = {
  dashboard: { title: 'الداشبورد', render: dashboardPage.render },
  properties: { title: 'العقارات', render: propertiesPage.render },
  map: { title: 'خريطة العقارات', render: mapPage.render },
  clients: { title: 'العملاء', render: clientsPage.render },
  tours: { title: 'الجولات الميدانية', render: toursPage.render },
  requests: { title: 'الطلبات العقارية', render: requestsPage.render },
  matches: { title: 'المطابقات', render: matchesPage.render },
  external: { title: 'العروض الخارجية', render: externalPage.render },
  invoices: { title: 'الفواتير وعروض الأسعار', render: invoicesPage.render },
  publish: { title: 'الصفحة العامة للعروض', render: publishPage.render },
  tasks: { title: 'المهام', render: tasksPage.render },
  notes: { title: 'الأفكار والملاحظات', render: notesPage.render },
  settings: { title: 'الإعدادات', render: settingsPage.render },
};
const DEFAULT_ROUTE = 'properties';

let bannerDismissed = false;
let renderToken = 0;

function routeName() {
  const m = /^#\/([\w-]+)/.exec(location.hash || '');
  return m && ROUTES[m[1]] ? m[1] : DEFAULT_ROUTE;
}

async function navigate() {
  const name = routeName();
  const route = ROUTES[name];
  const page = document.getElementById('page');
  document.querySelectorAll('.sidebar-nav a').forEach((a) => a.classList.toggle('active', a.dataset.route === name));
  const sidebarToggle = document.getElementById('sidebar-toggle');
  if (sidebarToggle) sidebarToggle.checked = false; // يطوي القائمة على الجوال بعد اختيار صفحة
  document.title = `${route.title} — مُطابِق`;
  revokeImageUrls();
  clear(page);
  const token = ++renderToken;
  try {
    await route.render(page);
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
    window.dispatchEvent(new CustomEvent('motabiq:data-changed'));
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
  window.addEventListener('motabiq:data-changed', refreshBanner);
  window.addEventListener('unhandledrejection', (e) => {
    console.error(e.reason);
    toast(e.reason?.message || 'حدث خطأ غير متوقع', 'error');
  });

  if (!location.hash) history.replaceState(null, '', `#/${DEFAULT_ROUTE}`);
  await applySidebarOrder(); // ترتيب صفحات القائمة الجانبية المحفوظ من الإعدادات (المرحلة ٨)
  initGlobalSearch();
  startFollowUpAlerts();
  await navigate();
  refreshBanner();
}

init();
