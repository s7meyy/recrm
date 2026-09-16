// اختبار وحدة (المرحلة ٤٥): الأرشفة — ترشيحُ عرضٍ لا حذف.
import {
  isArchived, splitArchived, archiveCandidates, archivePropertyCandidates,
  archiveRequestCandidates, ARCHIVE_AFTER_DAYS,
} from '../js/util/archive.js';

const ok = (n, c, x = '') => console.log(`${c ? 'PASS' : 'FAIL'} — ${n}${x ? ' :: ' + x : ''}`);
const NOW = new Date('2026-09-16T00:00:00Z').getTime();
const ago = (days) => new Date(NOW - days * 86400000).toISOString();

/* ===== القسمة ===== */
const rows = [{ id: 'a' }, { id: 'b', archivedAt: ago(1) }, { id: 'c' }];
ok('المؤرشف يُعرف بختمه', isArchived(rows[1]) && !isArchived(rows[0]));
ok('والافتراض إخفاؤه', splitArchived(rows).visible.map((r) => r.id).join('') === 'ac');
ok('وبطلبٍ يظهر مع غيره', splitArchived(rows, true).visible.length === 3);
ok('ويُعدّ ليُقال كم طُوي', splitArchived(rows).archived.length === 1);

/* ===== مرشَّحو العملاء ===== */
const c = (id, stage, days, extra = {}) => ({ id, stage, updatedAt: ago(days), ...extra });
const clients = [
  c('old-closed', 'closed', 400),
  c('old-won', 'won', 400),
  c('new-closed', 'closed', 10),
  c('old-active', 'negotiating', 400),
  c('old-new', 'new', 900),
  c('already', 'closed', 400, { archivedAt: ago(5) }),
];
const cands = archiveCandidates(clients, { now: NOW }).map((x) => x.id);
ok('المغلق القديم يُرشَّح', cands.includes('old-closed') && cands.includes('old-won'));
ok('والمغلق الحديث لا', !cands.includes('new-closed'));
ok('والحيُّ مهما قدُم لا', !cands.includes('old-active') && !cands.includes('old-new'), cands.join(','));
ok('والمؤرشف لا يُرشَّح مرّتين', !cands.includes('already'));
ok('فهما اثنان لا غير', cands.length === 2, String(cands.length));

// الحدّ نفسه: يومٌ دونه لا يُرشَّح، وعليه يُرشَّح.
ok('اليوم الذي دون الحدّ لا يُرشَّح', archiveCandidates([c('x', 'closed', ARCHIVE_AFTER_DAYS - 1)], { now: NOW }).length === 0);
ok('والحدّ نفسه يُرشَّح', archiveCandidates([c('x', 'closed', ARCHIVE_AFTER_DAYS)], { now: NOW }).length === 1);

// **آخرُ تعديلٍ لا تاريخُ الإنشاء**: من أُنشئ قبل سنتين وكلّمته أمس حيٌّ لا أرشيف.
ok('المعيار آخرُ تعديلٍ لا الإنشاء',
  archiveCandidates([{ id: 'x', stage: 'closed', createdAt: ago(900), updatedAt: ago(2) }], { now: NOW }).length === 0);
ok('وبلا تعديلٍ يُقرأ الإنشاء',
  archiveCandidates([{ id: 'x', stage: 'closed', createdAt: ago(900) }], { now: NOW }).length === 1);

/* ===== العقارات: المنتهية وحدها ===== */
const props = [
  { id: 'sold', status: 'sold', updatedAt: ago(400) },
  { id: 'rented', status: 'rented', updatedAt: ago(400) },
  { id: 'stale', status: 'available', updatedAt: ago(900) },
];
const pc = archivePropertyCandidates(props, { now: NOW }).map((x) => x.id);
ok('المبيع والمؤجَّر القديمان يُرشَّحان', pc.length === 2 && pc.includes('sold') && pc.includes('rented'));
ok('والمعروضُ الآن لا يُؤرشف مهما بات', !pc.includes('stale'));

/* ===== الطلبات ===== */
const reqs = [
  { id: 'done', status: 'done', updatedAt: ago(400) },
  { id: 'paused', status: 'paused', updatedAt: ago(400) },
  { id: 'active', status: 'active', updatedAt: ago(900) },
];
const rc = archiveRequestCandidates(reqs, { now: NOW }).map((x) => x.id);
ok('المنجز والموقوف القديمان يُرشَّحان', rc.length === 2, rc.join(','));
ok('والنشط لا', !rc.includes('active'));

/* ===== لا انهيارَ على سجلٍّ ناقص ===== */
ok('سجلٌّ بلا تواريخ لا يُرشَّح ولا ينهار', archiveCandidates([{ id: 'x', stage: 'closed' }], { now: NOW }).length === 0);
ok('وقائمةٌ فارغة تردّ فارغة', archiveCandidates([], { now: NOW }).length === 0 && splitArchived().visible.length === 0);
