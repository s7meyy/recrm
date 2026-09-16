// بحث عام عبر العملاء والعقارات والطلبات (المرحلة ٦)، والمهام والأفكار (المرحلة ٧)، والفواتير
// (المرحلة ١٠)، **والصفقات والعروض الخارجية والمعاينات والمالية** (المرحلة ٤٦).
//
// ويعيد استعمال `repo.<كيان>.search(q)` حيث ينفع — وهي تبني على `searchKey` المحفوظ.
//
// **لكنّ أربعةً منها لا يكفيها `searchKey`**، وهذا سببُ أن البحث كان يفوتها: مفتاحُ الصفقة
// ملاحظاتُها واسمُ شريكها، ومفتاحُ المعاينة ملاحظاتُها، ومفتاحُ المصروف ملاحظتُه،
// **والإيراد بلا مفتاحٍ أصلًا** (لا تهيئةَ له). فاسمُ مشترٍ أبرمتَ معه صفقةً لا يصل إليها
// البحثُ أبدًا، وهو أوّلُ ما تبحث به.
//
// فتُطابَق هذه الأربعة **بسجلّاتها المرتبطة**: اسمُ العميل وموقعُ العقار — كما تفعل صفحةُ
// الطلبات منذ البداية. ومطابقةٌ في المتصفّح لا تحتاج هجرةَ بياناتٍ ولا مفتاحًا جديدًا،
// **فتعمل على سجلّاتك القديمة كما تعمل على الجديدة**.

import { repo } from '../data/repository.js';
import { ENUMS, labelFor, invoiceGrandTotal } from '../data/schema.js';
import { getLists, typeLabel, statusLabel } from '../data/settings.js';
import { el, clear, badge, openModal, debounce } from './dom.js';
import { formatNumber, formatDateTime, formatDate, formatSAR } from './format.js';
import { buildSearchKey, matchesQuery } from './arabic.js';

const MIN_QUERY_LEN = 2;
const MAX_PER_GROUP = 6;

let cache = null; // { lists, clientsById, propertiesById } — يُبنى مرة لكل فتح للنافذة
let modalRef = null;

async function ensureCache() {
  if (cache) return cache;
  const [lists, clients, properties] = await Promise.all([getLists(), repo.clients.list(), repo.properties.list()]);
  cache = {
    lists,
    clientsById: new Map(clients.map((c) => [c.id, c])),
    propertiesById: new Map(properties.map((p) => [p.id, p])),
  };
  return cache;
}

/** يبني مفتاحًا من السجلّ ومرتبطاته ثم يطابقه — للكيانات التي لا يكفيها مفتاحُها المحفوظ. */
function linkedMatch(rec, q, { clientsById, propertiesById }, extra = []) {
  const client = rec.clientId ? clientsById.get(rec.clientId) : null;
  const property = rec.propertyId ? propertiesById.get(rec.propertyId) : null;
  return matchesQuery(buildSearchKey([
    rec.searchKey, rec.note, rec.notes,
    client?.name, client?.phone, client?.searchKey,
    property?.city, property?.district, property?.searchKey,
    ...extra,
  ]), q);
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
    [inv.clientName, `${formatNumber(invoiceGrandTotal(inv))} ريال`].filter(Boolean).join(' · '),
    labelFor(ENUMS.invoiceTypes, inv.type),
    () => { location.hash = `#/invoices/${inv.id}`; closeModal(); });
}

/* ===== الأربعة التي كان البحث يفوتها (المرحلة ٤٦) ===== */

function dealRow(d, { clientsById, propertiesById, lists }) {
  const client = d.clientId ? clientsById.get(d.clientId) : null;
  const property = d.propertyId ? propertiesById.get(d.propertyId) : null;
  const where = property ? `${typeLabel(lists, property.type)} — ${[property.district, property.city].filter(Boolean).join('، ')}` : '';
  return resultRow(
    `صفقة ${formatDate(d.date)}${client ? ` · ${client.name || client.phone}` : ''}`,
    [where, d.finalPrice == null ? '' : formatSAR(d.finalPrice)].filter(Boolean).join(' · '),
    d.commission ? formatSAR(d.commission) : null,
    () => { location.hash = `#/deals/${d.id}`; closeModal(); });
}

function externalRow(x, lists) {
  return resultRow(
    `${typeLabel(lists, x.type)} — ${[x.district, x.city].filter(Boolean).join('، ') || 'بلا موقع'}`,
    [x.platform, x.price == null ? '' : formatSAR(x.price)].filter(Boolean).join(' · '),
    labelFor(ENUMS.externalStatuses, x.status),
    () => { location.hash = `#/external/${x.id}`; closeModal(); });
}

function showingRow(sh, { clientsById, propertiesById, lists }) {
  const client = sh.clientId ? clientsById.get(sh.clientId) : null;
  const property = sh.propertyId ? propertiesById.get(sh.propertyId) : null;
  return resultRow(
    `معاينة ${sh.at ? formatDateTime(sh.at) : 'بلا موعد'}`,
    [client?.name || '', property ? `${typeLabel(lists, property.type)} — ${property.district || ''}` : ''].filter(Boolean).join(' · '),
    labelFor(ENUMS.showingStatuses, sh.status),
    () => { location.hash = '#/today'; closeModal(); });
}

function moneyRow(m, kind) {
  const list = kind === 'income' ? ENUMS.incomeCategories : ENUMS.expenseCategories;
  return resultRow(
    `${kind === 'income' ? 'إيراد' : 'مصروف'} ${formatSAR(m.amount || 0)}`,
    [m.note, formatDate(m.date)].filter(Boolean).join(' · '),
    labelFor(list, m.category),
    () => { location.hash = '#/expenses'; closeModal(); });
}

/**
 * @param {boolean} money يوسم المجموعة حسّاسة: أرقامُ عمولاتك ومصاريفك لا يراها العميل
 *   على شاشتك ولا يراها المساعد — بآليّة `[data-sensitive]` نفسها القائمة منذ المرحلة ١٣.
 *   **وبدونها كان توسيعُ البحث ينقض حجبًا قائمًا**: صفٌّ في نتيجة بحثٍ يحمل عمولةَ صفقة.
 */
function group(title, rows, money = false) {
  if (!rows.length) return null;
  const attrs = money ? { class: 'search-group', 'data-sensitive': '' } : { class: 'search-group' };
  return el('div', attrs, el('h3', { text: title }), ...rows);
}
function renderEmpty(container, text) {
  clear(container);
  container.append(el('div', { class: 'muted small search-empty', text }));
}

async function runSearch(resultsEl, query) {
  const q = query.trim();
  if (q.length < MIN_QUERY_LEN) { renderEmpty(resultsEl, 'اكتب حرفين على الأقل للبحث.'); return; }
  const ctx = await ensureCache();
  const { lists, clientsById } = ctx;
  const [clients, properties, requests, tasks, notes, invoices, externals, deals, showings, expenses, incomes] = await Promise.all([
    repo.clients.search(q), repo.properties.search(q), repo.requests.search(q), repo.tasks.search(q), repo.notes.search(q),
    repo.invoices.search(q),
    // العروض الخارجية مفتاحُها غنيّ (المنصّة والنصّ الملصوق وجوّال المعلن)، فتكفيها `search`.
    repo.externalListings.search(q),
    // والأربعةُ الباقية تُقرأ كاملةً وتُطابَق بمرتبطاتها — وهي أقلُّ المخازن عددًا،
    // وكلُّها في الذاكرة أصلًا لبقيّة الصفحات.
    repo.deals.list(), repo.showings.list(), repo.expenses.list(), repo.incomes.list(),
  ]);
  if (!resultsEl.isConnected) return; // أُغلقت النافذة أثناء البحث
  clear(resultsEl);
  const dealHits = deals.filter((d) => linkedMatch(d, q, ctx, [d.partnerName, d.date]));
  const showingHits = showings.filter((sh) => linkedMatch(sh, q, ctx));
  const moneyHits = [
    ...expenses.filter((x) => linkedMatch(x, q, ctx, [labelFor(ENUMS.expenseCategories, x.category)])).map((x) => ({ ...x, _kind: 'expense' })),
    ...incomes.filter((x) => linkedMatch(x, q, ctx, [labelFor(ENUMS.incomeCategories, x.category)])).map((x) => ({ ...x, _kind: 'income' })),
  ].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  const groups = [
    group('العملاء', clients.slice(0, MAX_PER_GROUP).map(clientRow)),
    group('العقارات', properties.slice(0, MAX_PER_GROUP).map((p) => propertyRow(p, lists))),
    group('الطلبات', requests.slice(0, MAX_PER_GROUP).map((r) => requestRow(r, clientsById))),
    group('الصفقات', dealHits.slice(0, MAX_PER_GROUP).map((d) => dealRow(d, ctx)), true),
    group('العروض الخارجية', externals.slice(0, MAX_PER_GROUP).map((x) => externalRow(x, lists))),
    group('المعاينات', showingHits.slice(0, MAX_PER_GROUP).map((sh) => showingRow(sh, ctx))),
    group('المالية', moneyHits.slice(0, MAX_PER_GROUP).map((m) => moneyRow(m, m._kind)), true),
    group('المهام', tasks.slice(0, MAX_PER_GROUP).map(taskRow)),
    group('الأفكار', notes.filter((n) => !n.archived).slice(0, MAX_PER_GROUP).map(noteRow)),
    group('الفواتير وعروض الأسعار', invoices.slice(0, MAX_PER_GROUP).map(invoiceRow), true),
  ].filter(Boolean);
  if (!groups.length) { renderEmpty(resultsEl, 'لا نتائج.'); return; }
  resultsEl.append(...groups);
}

export function openGlobalSearch() {
  cache = null; // البيانات قد تغيّرت منذ آخر فتح
  const input = el('input', { class: 'input search', type: 'search', placeholder: 'ابحث عن عميل أو عقار أو طلب أو صفقة أو معاينة أو مصروف أو مهمة أو فاتورة…' });
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
