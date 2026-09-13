// بحث عام عبر العملاء والعقارات والطلبات (المرحلة ٦)، والمهام والأفكار (المرحلة ٧)، والفواتير (المرحلة ١٠). يعيد استعمال
// repo.<كيان>.search(q) الموجودة أصلًا لكل كيان (تبني على searchKey المحفوظ في كل سجل) — لا
// منطق بحث جديد هنا، فقط واجهة تجمع الكيانات الخمسة في نافذة واحدة.

import { repo } from '../data/repository.js';
import { ENUMS, labelFor, invoiceTotal } from '../data/schema.js';
import { getLists, typeLabel, statusLabel } from '../data/settings.js';
import { el, clear, badge, openModal, debounce } from './dom.js';
import { formatNumber, formatDateTime } from './format.js';

const MIN_QUERY_LEN = 2;
const MAX_PER_GROUP = 6;

let cache = null; // { lists, clientsById } — يُبنى مرة لكل فتح للنافذة
let modalRef = null;

async function ensureCache() {
  if (cache) return cache;
  const [lists, clients] = await Promise.all([getLists(), repo.clients.list()]);
  cache = { lists, clientsById: new Map(clients.map((c) => [c.id, c])) };
  return cache;
}

function closeModal() { modalRef?.close(); modalRef = null; }

function resultRow(primary, secondary, badgeText, onClick) {
  return el('button', { type: 'button', class: 'search-result-row', onClick },
    el('div', {}, el('div', { class: 'strong' }, primary), el('div', { class: 'muted small' }, secondary || '')),
    badgeText ? badge(badgeText) : null);
}

function clientRow(c) {
  return resultRow(c.name || 'عميل بلا اسم', c.phone, labelFor(ENUMS.clientStages, c.stage),
    () => { location.hash = `#/clients/${c.id}`; closeModal(); });
}
function propertyRow(p, lists) {
  const title = `${typeLabel(lists, p.type)} — ${[p.district, p.city].filter(Boolean).join('، ') || 'بلا موقع'}`;
  const price = p.price == null ? 'السعر غير معروف' : `${formatNumber(p.price)} ريال`;
  return resultRow(title, price, statusLabel(lists, p.status),
    () => { location.hash = `#/properties/${p.id}`; closeModal(); });
}
function requestRow(r, clientsById) {
  const client = clientsById.get(r.clientId);
  return resultRow(client?.name || 'عميل غير معروف', [r.city, r.type].filter(Boolean).join(' · '),
    labelFor(ENUMS.requestStatuses, r.status),
    () => { location.hash = `#/requests/${r.id}`; closeModal(); });
}
function taskRow(t) {
  return resultRow(t.title, t.dueAt ? `مستحقة ${formatDateTime(t.dueAt)}` : null, t.done ? 'منجزة' : null,
    () => { location.hash = `#/tasks/${t.id}`; closeModal(); });
}
function noteRow(n) {
  const preview = n.text.length > 60 ? `${n.text.slice(0, 57)}…` : n.text;
  return resultRow(preview, null, n.pinned ? 'مثبَّتة' : null,
    () => { location.hash = `#/notes/${n.id}`; closeModal(); });
}

function invoiceRow(inv) {
  return resultRow(inv.number || 'بلا رقم',
    [inv.clientName, `${formatNumber(invoiceTotal(inv))} ريال`].filter(Boolean).join(' · '),
    labelFor(ENUMS.invoiceTypes, inv.type),
    () => { location.hash = `#/invoices/${inv.id}`; closeModal(); });
}

function group(title, rows) {
  return rows.length ? el('div', { class: 'search-group' }, el('h3', { text: title }), ...rows) : null;
}
function renderEmpty(container, text) {
  clear(container);
  container.append(el('div', { class: 'muted small search-empty', text }));
}

async function runSearch(resultsEl, query) {
  const q = query.trim();
  if (q.length < MIN_QUERY_LEN) { renderEmpty(resultsEl, 'اكتب حرفين على الأقل للبحث.'); return; }
  const { lists, clientsById } = await ensureCache();
  const [clients, properties, requests, tasks, notes, invoices] = await Promise.all([
    repo.clients.search(q), repo.properties.search(q), repo.requests.search(q), repo.tasks.search(q), repo.notes.search(q),
    repo.invoices.search(q),
  ]);
  if (!resultsEl.isConnected) return; // أُغلقت النافذة أثناء البحث
  clear(resultsEl);
  const groups = [
    group('العملاء', clients.slice(0, MAX_PER_GROUP).map(clientRow)),
    group('العقارات', properties.slice(0, MAX_PER_GROUP).map((p) => propertyRow(p, lists))),
    group('الطلبات', requests.slice(0, MAX_PER_GROUP).map((r) => requestRow(r, clientsById))),
    group('المهام', tasks.slice(0, MAX_PER_GROUP).map(taskRow)),
    group('الأفكار', notes.filter((n) => !n.archived).slice(0, MAX_PER_GROUP).map(noteRow)),
    group('الفواتير وعروض الأسعار', invoices.slice(0, MAX_PER_GROUP).map(invoiceRow)),
  ].filter(Boolean);
  if (!groups.length) { renderEmpty(resultsEl, 'لا نتائج.'); return; }
  resultsEl.append(...groups);
}

export function openGlobalSearch() {
  cache = null; // البيانات قد تغيّرت منذ آخر فتح
  const input = el('input', { class: 'input search', type: 'search', placeholder: 'ابحث عن عميل أو عقار أو طلب أو مهمة أو فكرة أو فاتورة…' });
  const results = el('div', { class: 'search-results' });
  const body = el('div', { class: 'search-modal-body' }, input, results);
  renderEmpty(results, 'اكتب حرفين على الأقل للبحث.');

  input.addEventListener('input', debounce(() => runSearch(results, input.value), 200));

  modalRef = openModal({ title: 'بحث', body, size: 'wide' });
  setTimeout(() => input.focus(), 30);
}

/** يُستدعى مرة عند بدء التطبيق: يربط زر البحث في الشريط العلوي واختصار "/" بلوحة المفاتيح. */
export function initGlobalSearch() {
  const btn = document.getElementById('global-search-btn');
  if (btn) btn.addEventListener('click', openGlobalSearch);

  document.addEventListener('keydown', (e) => {
    if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
    const tag = (document.activeElement && document.activeElement.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || (document.activeElement && document.activeElement.isContentEditable)) return;
    e.preventDefault();
    openGlobalSearch();
  });
}
