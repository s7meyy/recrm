/**
 * **مصادرُ بيانات السوق، وما يصدق فيها** (المرحلة ٥٠).
 *
 * سُئلتُ عن أربعة بأسمائها — بسيطة، وسهيل، والبورصة العقارية، والسجل العقاري — وبحثتُ
 * عنها وعن غيرها. **والجوابُ الصادق أنّها ليست سواءً**، وهذا تصنيفُها:
 *
 * **١) مفتوحةٌ ومجّانيّةٌ ويجوز إعادةُ نشرها** بترخيص البيانات المفتوحة السعوديّ:
 *   • **بوّابة البيانات المفتوحة** (`open.data.gov.sa`) — صفقاتُ وزارة العدل صفًّا صفًّا.
 *   • **الهيئة العامة للعقار** — مؤشّراتُ الإيجار والبيع.
 *   • **كابسارك** (`data.kapsarc.org`) — مؤشّراتُ الأسعار التاريخيّة، بواجهةٍ بلا مفتاح.
 *   وهذه تُنزَّل ملفًّا وتُستورَد هنا. **تعمل اليوم، بلا اشتراكٍ ولا انتظار.**
 *
 * **٢) حكوميّةٌ تُعرض ولا تُصدِّر**: **البورصة العقارية** (`srem.moj.gov.sa`) تعرض الصفقات
 *   حيّةً، **ولا واجهةَ برمجيّةً عامّةً موثّقةً لها**، وخدماتُها خلف «نفاذ». وكذلك
 *   **السجل العقاري**. فما يُوعَد به هنا: **الاستيرادُ** لا السحبُ الآليّ — والوعدُ بسحبٍ
 *   من واجهةٍ غير موثّقةٍ وعدٌ ينكسر مع أوّل تغييرٍ في صفحتهم.
 *
 * **٣) تجاريّةٌ باشتراك**: **سهيل** و**بسيطة** منصّتان سعوديّتان تبيعان تحليلَ البيانات،
 *   **ولا واجهةَ عامّةً مجّانيّةً لأيٍّ منهما**. فلهما هنا محوّلٌ بحالةٍ صادقة: إن جاء
 *   مفتاحُك عمِل، وإلّا قال ما ينقصه بالضبط — كسائر التكاملات المدفوعة في هذا النظام.
 *
 * **ولا يُخترع رقمٌ في أيّ حال.** مؤشّرٌ بلا بيانات يقول «لا بيانات»، لا صفرًا ولا تقديرًا.
 */

import { normalizeArabic } from '../util/arabic.js';

/** حالُ المصدر: أيُستورَد اليوم، أم ينتظر اشتراكًا، أم يُعرض ولا يُصدِّر. */
export const SOURCE_KINDS = {
  open: { key: 'open', label: 'مفتوحٌ ومجّانيّ', cls: 'badge-ok' },
  manualOnly: { key: 'manualOnly', label: 'يُعرض ولا يُصدِّر آليًّا', cls: 'badge-warn' },
  paid: { key: 'paid', label: 'باشتراك', cls: 'badge-outline' },
};

/**
 * المصادرُ وأسماءُ أعمدتها.
 *
 * **والأعمدةُ أسماءٌ بديلة لا واحد**: البوّابات تُغيّر ترويسةَ ملفّاتها بين إصدارٍ وآخر،
 * وملفٌّ لا يُقرأ لأنّ العمود صار «سعر الصفقة» بدل «قيمة الصفقة» عطبٌ لا يُحتمَل.
 * وتُطابَق بعد تطبيعٍ عربيّ، فلا تكسرها همزةٌ ولا تاءٌ مربوطة.
 */
export const MARKET_SOURCES = [
  {
    key: 'moj',
    label: 'البيانات المفتوحة — صفقات وزارة العدل',
    kind: 'open',
    site: 'https://open.data.gov.sa',
    hint: 'نزّل ملفَّ الصفقات العقاريّة (CSV) من بوّابة البيانات المفتوحة، ثم أفلِته هنا. ترخيصُ البيانات المفتوحة يُجيز الاستعمال وإعادة النشر بالإسناد.',
    columns: {
      date: ['تاريخ الصفقة', 'التاريخ', 'تاريخ_الصفقة', 'deal date', 'date', 'transaction date'],
      city: ['المدينة', 'مدينة', 'city'],
      district: ['الحي', 'الحى', 'حي', 'district', 'neighborhood', 'neighbourhood'],
      type: ['نوع العقار', 'التصنيف', 'نوع_العقار', 'property type', 'type'],
      area: ['المساحة', 'مساحة العقار', 'المساحه', 'area', 'area sqm'],
      price: ['قيمة الصفقة', 'سعر الصفقة', 'السعر', 'قيمة_الصفقة', 'price', 'deal value', 'transaction value'],
      pricePerM: ['سعر المتر', 'سعر المتر المربع', 'price per meter', 'price per sqm'],
    },
  },
  {
    key: 'rega',
    label: 'الهيئة العامة للعقار — مؤشّرات الإيجار والبيع',
    kind: 'open',
    site: 'https://rega.gov.sa',
    hint: 'مؤشّراتٌ مجمَّعة لا صفقاتٌ مفردة — تُستورَد بالأعمدة نفسها متى صدَّرتها الهيئة جدولًا.',
    columns: null, // الأعمدةُ نفسُها، ولا يُكرَّر تعريفُها
  },
  {
    key: 'srem',
    label: 'البورصة العقارية (وزارة العدل)',
    kind: 'manualOnly',
    site: 'https://srem.moj.gov.sa',
    hint: 'تعرض الصفقات حيّةً على موقعها، **ولا واجهةَ برمجيّةً عامّةً موثّقةً لها** وخدماتُها خلف «نفاذ». فما يُستورَد منها ما تُصدّره صفحتُها أو ما تنسخه بيدك — والسحبُ الآليّ وعدٌ لا يُوفى.',
    columns: null,
  },
  {
    key: 'registry',
    label: 'السجل العقاري',
    kind: 'manualOnly',
    site: 'https://rega.gov.sa',
    hint: 'سجلُّ الملكيّات والهويّة العقاريّة — خدماتُه خلف تسجيل دخولٍ بـ«نفاذ»، ولا تصدير عامًّا منه.',
    columns: null,
  },
  {
    key: 'suhail',
    label: 'سهيل — تحليل بيانات عقاريّة',
    kind: 'paid',
    site: 'https://www.suhail.ai',
    env: ['SUHAIL_API_BASE', 'SUHAIL_API_KEY'],
    hint: 'منصّةٌ تجاريّةٌ باشتراك، ولا واجهةَ عامّةً مجّانيّةً لها. فإن كان لك اشتراكٌ ومفتاح، يُكتب في Netlify ويعمل المحوّل — وإلّا قال ما ينقصه.',
    columns: null,
  },
  {
    key: 'paseetah',
    label: 'بسيطة — بيانات عقاريّة',
    kind: 'paid',
    site: 'https://paseetah.com',
    env: ['PASEETAH_API_BASE', 'PASEETAH_API_KEY'],
    hint: 'منصّةٌ تجاريّةٌ باشتراك كسابقتها، وبالحكم نفسِه.',
    columns: null,
  },
  {
    key: 'manual',
    label: 'إدخالٌ يدويّ أو ملفٌّ من عندك',
    kind: 'open',
    site: '',
    hint: 'أيُّ جدولٍ فيه تاريخٌ ومدينةٌ وحيٌّ ومساحةٌ وسعر — ولو كان دفترَك أنت.',
    columns: null,
  },
];

export const sourceByKey = (key) => MARKET_SOURCES.find((s) => s.key === key) || null;

/** الأعمدةُ الافتراضيّة — يرثها كلُّ مصدرٍ لم يُعرِّف لنفسه أعمدة. */
const DEFAULT_COLUMNS = MARKET_SOURCES[0].columns;

export const columnsFor = (key) => sourceByKey(key)?.columns || DEFAULT_COLUMNS;

const norm = (s) => normalizeArabic(String(s ?? '')).replace(/[_\s]+/g, ' ').trim();

/** يربط ترويسةَ الملفّ بالحقول — ويعيد ما لم يُعرَف كي يُقال لا يُبتلع. */
export function mapHeaders(headers = [], sourceKey = 'moj') {
  const cols = columnsFor(sourceKey);
  const seen = headers.map((h, i) => ({ i, raw: h, key: norm(h) }));
  const mapping = {};
  for (const [field, aliases] of Object.entries(cols)) {
    const wanted = aliases.map(norm);
    const hit = seen.find((h) => wanted.includes(h.key));
    if (hit) mapping[field] = hit.i;
  }
  const usedIdx = new Set(Object.values(mapping));
  return { mapping, unmatched: seen.filter((h) => !usedIdx.has(h.i)).map((h) => h.raw) };
}

const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

/** رقمٌ من خليّةٍ قد تحمل فواصلَ آلافٍ وأرقامًا عربيّة — و`null` لما ليس رقمًا. */
export function cellNumber(v) {
  const text = String(v ?? '')
    .replace(/[٠-٩]/g, (d) => String(ARABIC_DIGITS.indexOf(d)))
    .replace(/[,،\s]/g, '')
    .replace(/[^\d.-]/g, '');
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * تاريخٌ بصيغة `YYYY-MM-DD` من خليّة.
 *
 * **ولا يُخمَّن ترتيبُ اليوم والشهر**: `03/04/2026` تحتمل الثالثَ من أبريل والرابعَ من
 * مارس، وتخمينُها يُزحزح صفقاتِ شهرٍ كامل. فما لم يكن الترتيبُ بيّنًا (سنةٌ أوّلًا، أو
 * يومٌ أكبرُ من اثني عشر) يُردّ `''` — **ويُعدّ الصفُّ ناقصًا ويُقال**.
 */
export function cellDate(v) {
  const raw = String(v ?? '').replace(/[٠-٩]/g, (d) => String(ARABIC_DIGITS.indexOf(d))).trim();
  if (!raw) return '';
  let m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/.exec(raw);
  if (m) return `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`;
  m = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/.exec(raw);
  if (m) {
    const a = Number(m[1]); const b = Number(m[2]);
    if (a > 12 && b <= 12) return `${m[3]}-${String(b).padStart(2, '0')}-${String(a).padStart(2, '0')}`;
    if (b > 12 && a <= 12) return `${m[3]}-${String(a).padStart(2, '0')}-${String(b).padStart(2, '0')}`;
    return ''; // ملتبس — ولا يُخمَّن
  }
  return '';
}

/**
 * يحوّل صفوفَ CSV إلى صفقاتِ سوق.
 *
 * **ويُعيد المرفوضَ مع سببه** لا يُسقطه صامتًا: ملفٌّ استُورد منه نصفُه دون أن يُقال
 * يجعلك تبني على بيانات ناقصةٍ وأنت تظنّها كاملة.
 *
 * @returns {{ rows, skipped: [{ line, why }], mapping, unmatched }}
 */
export function parseMarketRows({ headers = [], rows = [], source = 'moj', purpose = 'sale', defaultCity = '' } = {}) {
  const { mapping, unmatched } = mapHeaders(headers, source);
  const out = [];
  const skipped = [];
  const cell = (row, field) => (mapping[field] == null ? '' : row[mapping[field]]);

  rows.forEach((row, i) => {
    const date = cellDate(cell(row, 'date'));
    const city = String(cell(row, 'city') ?? '').trim() || defaultCity;
    const area = cellNumber(cell(row, 'area'));
    const price = cellNumber(cell(row, 'price'));
    const perM = cellNumber(cell(row, 'pricePerM'));
    // **الصفُّ بلا تاريخٍ أو بلا مدينةٍ لا يُحفظ**: لا يدخل مؤشّرًا زمنيًّا ولا مكانيًّا،
    // ووجودُه يضخّم العدَّ فيوهم بعيّنةٍ أكبر ممّا هي.
    if (!date) { skipped.push({ line: i + 2, why: 'تاريخٌ ناقصٌ أو ملتبس' }); return; }
    if (!city) { skipped.push({ line: i + 2, why: 'بلا مدينة' }); return; }
    // ولا قيمةَ لصفٍّ لا يُعرف منه سعرُ المتر — لا بالقسمة ولا بعمودٍ جاهز.
    if (!perM && !(area && price)) { skipped.push({ line: i + 2, why: 'بلا مساحةٍ وسعرٍ يُحسب منهما سعرُ المتر' }); return; }
    out.push({
      source,
      date,
      city,
      district: String(cell(row, 'district') ?? '').trim(),
      type: String(cell(row, 'type') ?? '').trim(),
      purpose,
      area: area ?? (perM && price ? Math.round(price / perM) : null),
      price: price ?? (perM && area ? Math.round(perM * area) : null),
    });
  });

  return { rows: out, skipped, mapping, unmatched };
}
