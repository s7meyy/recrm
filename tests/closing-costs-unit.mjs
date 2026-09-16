// اختبار وحدة (المرحلة ٤٥): كلفة الإتمام النقدية — «كم أحتاج نقدًا يوم الإفراغ؟».
import { closingCosts } from '../js/util/finance.js';

const ok = (n, c, x = '') => console.log(`${c ? 'PASS' : 'FAIL'} — ${n}${x ? ' :: ' + x : ''}`);
const r = closingCosts({ price: 1000000 });

/* ===== البنود الافتراضية على مليون ===== */
ok('الدفعة الأولى ١٠٪', r.down === 100000, String(r.down));
ok('ورسوم التصرفات ٥٪', r.rett === 50000, String(r.rett));
ok('والعمولة ٢٫٥٪', r.commission === 25000, String(r.commission));
ok('وضريبتها ١٥٪ من العمولة لا من السعر', r.commissionVat === 3750, String(r.commissionVat));
ok('ورسوم البنك بسقفها ٥٬٠٠٠', r.bankFee === 5000, String(r.bankFee));
ok('والمموَّل ما بقي بعد الدفعة', r.financed === 900000, String(r.financed));
ok('والمجموع مجموعُ بنوده', r.cashNeeded === 100000 + 50000 + 25000 + 3750 + 5000, String(r.cashNeeded));

// الخبر الذي تصنعه هذه اللوحة: فوق الدفعة الأولى ٨٣٬٧٥٠ ريالًا لم يكن يعلمها.
ok('وفوق الدفعة الأولى ٨٣٬٧٥٠', Math.round(r.cashNeeded - r.down) === 83750, String(r.cashNeeded - r.down));

/* ===== الإعفاء يُصفّر رسوم التصرفات ولا يمسّ غيرها ===== */
const ex = closingCosts({ price: 1000000, rettExempt: true });
ok('الإعفاء يُصفّر رسوم التصرفات', ex.rett === 0);
ok('ولا يمسّ العمولة ولا ضريبتها', ex.commission === 25000 && ex.commissionVat === 3750);
ok('وينقص المجموع بقدرها', r.cashNeeded - ex.cashNeeded === 50000, String(r.cashNeeded - ex.cashNeeded));
ok('والبند يبقى ظاهرًا؟ لا — الصفر لا يُعرض سطرًا', !ex.lines.some((l) => l.key === 'rett'));

/* ===== الدفعة بالمبلغ تغلب النسبة ===== */
const byAmount = closingCosts({ price: 1000000, downPaymentRate: 10, downPayment: 250000 });
ok('المبلغ المكتوب يغلب النسبة', byAmount.down === 250000 && byAmount.financed === 750000);
ok('ودفعةٌ فوق السعر تُحَدّ به', closingCosts({ price: 500000, downPayment: 900000 }).down === 500000);

/* ===== رسوم البنك: النسبة دون السقف تُؤخذ كما هي ===== */
const small = closingCosts({ price: 200000, downPaymentRate: 10, bankFeeRate: 1, bankFeeCap: 5000 });
ok('رسمٌ دون السقف يُؤخذ بنسبته', small.bankFee === 1800, String(small.bankFee));
const noCap = closingCosts({ price: 5000000, downPaymentRate: 10, bankFeeRate: 1, bankFeeCap: 0 });
ok('وسقفٌ صفريّ = بلا سقف لا بلا رسوم', noCap.bankFee === 45000, String(noCap.bankFee));

/* ===== لا رقمَ من عدم ===== */
ok('بلا سعر لا نتيجة', closingCosts({}) === null && closingCosts({ price: 0 }) === null && closingCosts({ price: 'كثير' }) === null);
ok('والنِّسب الصفرية تُصفّر بنودها', closingCosts({ price: 1000000, downPaymentRate: 0, rettRate: 0, commissionRate: 0, bankFeeRate: 0 }).cashNeeded === 0);
ok('والنسبة السالبة تُعامَل صفرًا ولا تنقص المجموع', closingCosts({ price: 1000000, rettRate: -5 }).rett === 0);

/* ===== البنود تُعرض مرتَّبةً وبلا أصفار ===== */
ok('البنود مرتَّبة: الدفعة أوّلًا ثم التصرفات', r.lines[0].key === 'down' && r.lines[1].key === 'rett');
ok('و«أخرى» لا تُعرض بلا مبلغ', !r.lines.some((l) => l.key === 'other'));
ok('وتُعرض إن كُتبت', closingCosts({ price: 1000000, otherFees: 3000 }).lines.some((l) => l.key === 'other'));
ok('ومجموع البنود هو المجموع', Math.abs(r.lines.reduce((a, l) => a + l.amount, 0) - r.cashNeeded) < 0.01);
