// المرحلة ٤٧ — تصدير المالية بمدًى، والقالبُ في موضع الحاجة.
import { filterByRange, supportsRange, toCsv, CSV_EXPORTS } from '../js/data/exchange.js';
import { suggestTemplate, TEMPLATE_CONTEXTS, DEFAULT_TEMPLATES } from '../js/util/templates.js';
const ok = (n, c, x = '') => console.log(`${c ? 'PASS' : 'FAIL'} — ${n}${x ? ' :: ' + x : ''}`);

/* التصدير: المصاريف والإيرادات صارتا فيه */
ok('المصاريف في قائمة التصدير', !!CSV_EXPORTS.expenses && CSV_EXPORTS.expenses.label === 'المصاريف');
ok('والإيرادات كذلك', !!CSV_EXPORTS.incomes && CSV_EXPORTS.incomes.label === 'الإيرادات');
ok('وسبعةٌ صارت تُصدَّر بعد أن كانت خمسة', Object.keys(CSV_EXPORTS).length === 7, String(Object.keys(CSV_EXPORTS).length));

const ctx = { clientName: () => 'سعد', propertyLabel: () => 'شقة — النرجس', typeLabel: () => '', statusLabel: () => '' };
const heads = CSV_EXPORTS.expenses.headers(ctx);
ok('وأعمدةُ المال تحمل التاريخ والمبلغ والتصنيف والبيان',
  ['التاريخ', 'المبلغ', 'التصنيف', 'البيان'].every((h) => heads.some((x) => x.label === h)), heads.map((h) => h.label).join('،'));
ok('والربطُ يُصدَّر باسمه لا بمعرّفه',
  heads.find((h) => h.label === 'العقار').get({ propertyId: 'p1' }) === 'شقة — النرجس');
ok('وبلا ربطٍ لا يُكتب معرّفٌ ولا فراغُ undefined',
  heads.find((h) => h.label === 'العقار').get({}) === '' && heads.find((h) => h.label === 'العميل').get({}) === '');

/* المدى */
const rows = [
  { id: 'a', date: '2026-01-15', amount: 100 },
  { id: 'b', date: '2026-03-31', amount: 200 },
  { id: 'c', date: '2026-04-01', amount: 300 },
  { id: 'd', date: '', amount: 400 },
  { id: 'e', date: '2025-12-31', amount: 500 },
];
const q1 = filterByRange(rows, 'expenses', { from: '2026-01-01', to: '2026-03-31' });
ok('المدى شاملٌ للطرفين', q1.map((r) => r.id).join('') === 'ab', q1.map((r) => r.id).join(''));
ok('وما بعده خارجٌ عنه', !q1.some((r) => r.id === 'c'));
ok('وما قبله كذلك', !q1.some((r) => r.id === 'e'));
ok('وسجلٌّ بلا تاريخٍ لا يدخل مدًى — إدخالُه ادّعاءُ أنّه وقع فيه', !q1.some((r) => r.id === 'd'));
ok('وبلا مدًى يخرج كلُّ شيء بما فيه ما لا تاريخَ له', filterByRange(rows, 'expenses', {}).length === 5);
ok('وطرفٌ واحدٌ يحدّ من جهته وحدها',
  filterByRange(rows, 'expenses', { from: '2026-04-01' }).map((r) => r.id).join('') === 'c');
ok('و«إلى» وحدها كذلك',
  filterByRange(rows, 'expenses', { to: '2025-12-31' }).map((r) => r.id).join('') === 'e');
ok('وكيانٌ لا يقبل المدى يُرجَع كما هو',
  filterByRange(rows, 'ليس كيانًا', { from: '2026-01-01' }).length === 5);
ok('والكياناتُ السبعةُ كلُّها تقبل مدًى', Object.keys(CSV_EXPORTS).every((k) => supportsRange(k)),
  Object.keys(CSV_EXPORTS).filter((k) => !supportsRange(k)).join('،'));
ok('والعملاءُ يُقاسون بتاريخ إنشائهم لا بتاريخٍ لا يملكونه',
  filterByRange([{ createdAt: '2026-02-01T10:00:00Z' }], 'clients', { from: '2026-01-01', to: '2026-02-28' }).length === 1);

/* CSV */
const csv = toCsv([{ a: 'نصّ, بفاصلة', b: 'فيه "اقتباس"' }], [
  { label: 'الأول', get: (r) => r.a }, { label: 'الثاني', get: (r) => r.b },
]);
ok('الملفّ يبدأ بشارة BOM فيقرؤه إكسل بالعربية', csv.charCodeAt(0) === 0xFEFF);
ok('والفاصلةُ داخل الخلية تُحمى بالاقتباس', csv.includes('"نصّ, بفاصلة"'));
ok('والاقتباسُ يُضاعَف لا يُكسر', csv.includes('""اقتباس""'));

/* القالب في موضع الحاجة */
ok('العميلُ المنقطع يُقترح له قالبُ متابعة',
  suggestTemplate(DEFAULT_TEMPLATES, 'stale')?.key === 'followup');
ok('والمعاينةُ بلا انطباعٍ كذلك',
  suggestTemplate(DEFAULT_TEMPLATES, 'showingFeedback')?.key === 'followup');
ok('والموعدُ القادم يُقترح له تذكير',
  suggestTemplate(DEFAULT_TEMPLATES, 'upcoming')?.key === 'reminder');
ok('والمطابقةُ يُقترح لها عرض', suggestTemplate(DEFAULT_TEMPLATES, 'match')?.key === 'offer');
ok('والصفقةُ المبرمة شكرٌ', suggestTemplate(DEFAULT_TEMPLATES, 'won')?.key === 'thanks');

const renamed = [{ key: 'tpl_x1', label: 'متابعة العميل', body: '…' }, { key: 'tpl_x2', label: 'ترحيب', body: '…' }];
ok('ومن غيّر مفاتيح قوالبه يُبحث في عناوينها', suggestTemplate(renamed, 'stale')?.key === 'tpl_x1');
ok('ولا يُرجَع أوّلُ قالبٍ وُجد حين لا يناسب — «مبارك عليك» لمنقطعٍ أسوأ من الصمت',
  suggestTemplate([{ key: 'z', label: 'ترحيب', body: '…' }], 'stale') === null);
ok('ومن حذف قوالبه كلَّها لا يُقترح له شيء', suggestTemplate([], 'stale') === null);
ok('وموضعٌ غيرُ معروفٍ لا يُخترع له قالب', suggestTemplate(DEFAULT_TEMPLATES, 'لا شيء') === null);
ok('ولا مدخلاتٍ أصلًا', suggestTemplate() === null);
ok('ولكلّ موضعٍ اسمٌ عربيٌّ يُكتب على الزرّ',
  Object.values(TEMPLATE_CONTEXTS).every((c) => c.label && c.keys.length && c.words.length));
