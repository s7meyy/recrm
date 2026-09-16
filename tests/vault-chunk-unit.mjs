// اختبار وحدة (المرحلة ٤٥): تجزئة حمولة النسخة السحابية، وجمع الكتل دفعاتٍ.
//
// البندان اللذان يُفحصان هنا عطبان لا ميزتان:
//   • النسخة كانت كتلةً واحدة تُرمى كاملةً فوق ٤٫٥ ميغابايت — فلا نسخة أصلًا عند الكِبَر.
//   • والكتل كانت تُجمَّع بـ`at` وهو ختمُ الخادم لكلّ طلب، فتنفرط الدفعة الواحدة.
import { splitUtf8, groupBatches } from '../js/data/vault.js';

const ok = (n, c, x = '') => console.log(`${c ? 'PASS' : 'FAIL'} — ${n}${x ? ' :: ' + x : ''}`);
const enc = new TextEncoder();
const bytes = (s) => enc.encode(s).length;

/* ===== القطع: بالبايت، وبلا شقّ محرف ===== */

ok('النصّ دون الحدّ قطعةٌ واحدة', splitUtf8('مرحبا', 100).length === 1);
ok('والفارغ قطعةٌ واحدة فارغة', splitUtf8('', 10).length === 1 && splitUtf8('', 10)[0] === '');

const arabic = 'أبجد هوز حطي كلمن'.repeat(200);
const parts = splitUtf8(arabic, 100);
ok('العربي يُقطَّع بحدّ البايت', parts.length > 1, `${parts.length} قطعة`);
ok('ولا قطعةَ فوق الحدّ', parts.every((p) => bytes(p) <= 100), JSON.stringify(parts.map(bytes).filter((n) => n > 100)));
ok('ووصلُها يعيد الأصل حرفًا حرفًا', parts.join('') === arabic);

// الإيموجي أربعة بايتات وزوجُ بدائل في JS: القطعُ بالحرف يشقّه فيخرج محرف بديلٍ يتيم.
const emoji = '🏠🏡🏘️'.repeat(60);
const eparts = splitUtf8(emoji, 41); // حدٌّ لا يوافق حدود المحارف عمدًا
ok('الإيموجي لا يُشقّ', eparts.join('') === emoji, `${eparts.length} قطعة`);
ok('ولا قطعةَ فيها محرفٌ بديلٌ يتيم', eparts.every((p) => !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(p)));
ok('وحدُّ البايت محفوظ مع الإيموجي', eparts.every((p) => bytes(p) <= 41), JSON.stringify(eparts.map(bytes)));

const mixed = `{"name":"محمد العتيبي 🏠","note":"شقة ٣ غرف"}`.repeat(50);
const mparts = splitUtf8(mixed, 64);
ok('المخلوط عربيًّا ولاتينيًّا وإيموجي يُوصل كما كان', mparts.join('') === mixed);

/* ===== الجمع: بالدفعة لا بالوقت ===== */

// هذه صورةُ الواقع: خمس كتلٍ لرفعةٍ واحدة، **بأوقاتٍ مختلفة** لأن الخادم يختم كل طلب بوقته.
const meta = (i, batch, at, parts = 5) => ({ key: `backup/${at}-00${i}`, at, batch, part: i, parts, size: 1000, counts: i === 0 ? { clients: 9 } : null });
const one = groupBatches([
  meta(0, 'B1', '2026-09-16T10:00:01Z'),
  meta(1, 'B1', '2026-09-16T10:00:04Z'),
  meta(2, 'B1', '2026-09-16T10:00:09Z'),
  meta(3, 'B1', '2026-09-16T10:00:13Z'),
  meta(4, 'B1', '2026-09-16T10:00:17Z'),
]);
ok('خمسُ كتلٍ بأوقاتٍ مختلفة دفعةٌ واحدة', one.length === 1, `${one.length} دفعة`);
ok('وتُعدّ كاملة', one[0].complete === true && one[0].expected === 5);
ok('وحجمها مجموعُ كتلها', one[0].size === 5000, String(one[0].size));
ok('وعدّادها يُؤخذ من الكتلة التي تحمله', one[0].counts?.clients === 9);
ok('وترتيبُ كتلها بالجزء', one[0].parts.map((p) => p.part).join('') === '01234');

const short = groupBatches([meta(0, 'B2', '2026-09-16T11:00:00Z'), meta(2, 'B2', '2026-09-16T11:00:05Z')]);
ok('الدفعة الناقصة تُعلَن ناقصة', short[0].complete === false && short[0].parts.length === 2);

const two = groupBatches([
  meta(0, 'B1', '2026-09-15T10:00:00Z', 1),
  meta(0, 'B2', '2026-09-16T10:00:00Z', 1),
]);
ok('دفعتان تبقيان اثنتين', two.length === 2);
ok('والأحدث أوّلًا', two[0].batch === 'B2', two.map((b) => b.batch).join(','));

// النسخ المرفوعة قبل هذه المرحلة: بلا `batch` ولا `part` — كلٌّ دفعةٌ كاملة بنفسها.
const legacy = groupBatches([
  { key: 'backup/2026-09-10T10:00:00Z', at: '2026-09-10T10:00:00Z', batch: null, part: null, parts: null, size: 2000, counts: null },
  { key: 'backup/2026-09-11T10:00:00Z', at: '2026-09-11T10:00:00Z', batch: null, part: null, parts: null, size: 2100, counts: null },
]);
ok('النسخ القديمة بلا دفعةٍ تبقى نسخًا مستقلّة', legacy.length === 2);
ok('وكلٌّ منها كاملة', legacy.every((b) => b.complete === true));
ok('ولا تختلط بالجديدة', groupBatches([...legacy, meta(0, 'B9', '2026-09-16T10:00:00Z', 1)]).length === 3);
