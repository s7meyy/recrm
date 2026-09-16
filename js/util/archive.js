// الأرشفة (المرحلة ٤٥): البيانات تكبر ولا تصغر.
//
// **المسألة:** المرحلة ٣٥ حدَّت **ما يُرسم** (`render-cap`)، وهو الصواب — لكنّ الملفّ نفسه
// يقول: «الفرزُ والبحث والعدّ تبقى على المجموعة كاملة». فبعد سنتين يصير في صفحة العملاء
// خمسةُ آلافٍ أكثرُهم **مغلقون منذ سنة** ولا يعنونك اليوم، وأنت تمرّ عليهم في كل بحثٍ
// وكل رقاقةِ فلترٍ وكل تمريرةِ إصبع.
//
// **وحدُّها معلَن:** هذه **ترشيحُ عرضٍ لا حذف**. السجلّ المؤرشف باقٍ كما هو، ويظهر بضغطةٍ
// على رقاقة «+ المؤرشف»، **ويبقى في تقاريرك وأرقامك كما كان** — الداشبورد والمالية
// والتوقّع والمطابقة لا ترى أرشفةً أصلًا. ولو أسقطناه منها لكذبت أرقامُ سنتك الماضية
// لأنك رتّبت قائمتك اليوم.
//
// دوالُّه خالصةٌ لا تلمس تخزينًا ولا شبكة — عدا `archiveRow` في آخره، وهي بانيةُ صفِّ
// الرقائق المشترك بين ثلاث صفحات (كما تبني `history-view.js` و`source-field.js` عناصرَهما).

/** كم يمضي على المغلق قبل أن يُقترح أرشفته. سنةٌ: أقصرُ منها يطوي عميلًا قد يعود. */
export const ARCHIVE_AFTER_DAYS = 365;

export const isArchived = (rec) => !!rec?.archivedAt;

/** المراحل التي يُقترح أرشفةُ صاحبها: المنتهية وحدها، لا الموقوفة ولا المتعثّرة. */
const DONE_STAGES = new Set(['won', 'closed']);

/**
 * يقسم القائمة إلى ما يُعرض وما هو مؤرشف.
 * @returns {{ visible: Array, archived: Array }}
 */
export function splitArchived(rows = [], showArchived = false) {
  const archived = rows.filter(isArchived);
  return { visible: showArchived ? rows : rows.filter((r) => !isArchived(r)), archived };
}

const ageDays = (iso, now) => {
  const t = new Date(iso || 0).getTime();
  return Number.isFinite(t) && t > 0 ? Math.floor((now - t) / 86400000) : null;
};

/**
 * عملاء يُقترح أرشفتهم: مرحلتُهم منتهية، ولم يُمسّوا منذ `days`، وليسوا مؤرشفين.
 *
 * **والمعيار آخرُ تعديلٍ لا تاريخُ الإنشاء:** عميلٌ أُنشئ قبل سنتين وكلّمته الأسبوع الماضي
 * حيٌّ لا أرشيف. و**الاقتراح لا يُنفَّذ وحده**: يُعرض عددُه ويُنتظر قرارك.
 */
export function archiveCandidates(clients = [], { days = ARCHIVE_AFTER_DAYS, now = Date.now() } = {}) {
  return clients.filter((c) => {
    if (isArchived(c)) return false;
    if (!DONE_STAGES.has(c.stage)) return false;
    const age = ageDays(c.updatedAt || c.createdAt, now);
    return age != null && age >= days;
  });
}

/**
 * عقارات يُقترح أرشفتها: بيعت أو أُجّرت ومضى عليها `days`.
 * والمعروضُ الآن لا يُؤرشف مهما قدُم — قِدَمه خبرٌ آخر تقوله «عروض بائتة» في «يومي».
 */
export function archivePropertyCandidates(properties = [], { days = ARCHIVE_AFTER_DAYS, now = Date.now() } = {}) {
  return properties.filter((p) => {
    if (isArchived(p)) return false;
    if (!['sold', 'rented'].includes(p.status)) return false;
    const age = ageDays(p.updatedAt || p.createdAt, now);
    return age != null && age >= days;
  });
}

/** طلبات يُقترح أرشفتها: مُنجزة أو موقوفة ومضى عليها `days`. */
export function archiveRequestCandidates(requests = [], { days = ARCHIVE_AFTER_DAYS, now = Date.now() } = {}) {
  return requests.filter((r) => {
    if (isArchived(r)) return false;
    if (!['done', 'paused'].includes(r.status)) return false;
    const age = ageDays(r.updatedAt || r.createdAt, now);
    return age != null && age >= days;
  });
}


/**
 * آخرُ أرشفةٍ وقعت: السجلّات التي تحمل أحدثَ ختمٍ **بعينه** (المرحلة ٤٦).
 *
 * والأرشفةُ بالجملة تختم دفعتَها كلَّها بختمٍ واحد، فتساوي الختمِ هو ما يجمعها. وأرشفةُ
 * سجلٍّ واحدٍ بيدك دفعةٌ من واحد — وإعادتُها صحيحةٌ كإعادة المئتين.
 *
 * @returns {{ at: string, rows: Array } | null}
 */
export function lastArchiveBatch(rows = []) {
  let at = '';
  for (const r of rows) if (r?.archivedAt && r.archivedAt > at) at = r.archivedAt;
  if (!at) return null;
  return { at, rows: rows.filter((r) => r?.archivedAt === at) };
}

/**
 * صفُّ رقائق الأرشيف: «+ المؤرشف» · «أرشف …» · «أعِدْ آخر أرشفة».
 *
 * جُمع هنا لأنه كان مكرَّرًا حرفًا بحرف في ثلاث صفحات، **وثالثُ زرٍّ يُضاف إليه هو ما
 * يجعل التكرار عطبًا ينتظر**: تعديلٌ في واحدةٍ ونسيانُ أختيها.
 *
 * @param {object} o
 * @param {Array} o.rows السجلّات كاملةً (مؤرشفةً وغيرَها)
 * @param {boolean} o.showArchived حالةُ الإظهار الآن
 * @param {Array} o.candidates ما يُقترح أرشفته
 * @param {string} o.bulkLabel نصّ زرّ الأرشفة بالجملة
 * @param {Function} o.onToggle · o.onBulk · o.onUndo
 * @param {Function} o.el · o.formatNumber حقنٌ كي لا يستورد هذا الملفّ DOM المشروع
 * @returns {Node|null} — `null` حين لا مؤرشفَ ولا مرشَّح، فلا يُعرض صفٌّ فارغ
 */
export function archiveRow({
  rows = [], showArchived = false, candidates = [], bulkLabel = '',
  onToggle, onBulk, onUndo, el, formatNumber,
}) {
  const archived = rows.filter(isArchived);
  const last = lastArchiveBatch(rows);
  if (!archived.length && !candidates.length) return null;

  const chips = el('div', { class: 'chips' });
  if (archived.length) {
    chips.append(el('button', {
      type: 'button', class: `chip${showArchived ? ' active' : ''}`, onClick: onToggle,
    }, showArchived ? 'أخفِ المؤرشف' : '+ المؤرشف',
    el('span', { class: 'chip-count', text: String(archived.length) })));
  }
  if (candidates.length) {
    chips.append(el('button', {
      type: 'button', class: 'btn btn-sm',
      text: `${bulkLabel} (${formatNumber(candidates.length)})`,
      onClick: onBulk,
    }));
  }
  // **التراجع** (المرحلة ٤٦): الأرشفةُ بالجملة كانت تسأل مرّةً ثم تمضي بلا رجعة، وسلّةُ
  // المحذوفات تغطّي الحذفَ لا الأرشفة. فإرجاعُ مئتين أُرشفت بالخطأ كان مئتَي نافذة.
  if (last && onUndo) {
    chips.append(el('button', {
      type: 'button', class: 'btn btn-ghost btn-sm',
      text: `أعِدْ آخر أرشفة (${formatNumber(last.rows.length)})`,
      title: 'يُرجع دفعةَ الأرشفة الأخيرة وحدها إلى القائمة',
      onClick: () => onUndo(last),
    }));
  }
  return el('div', { class: 'filter-row' }, el('span', { class: 'filter-label', text: 'الأرشيف' }), chips);
}
