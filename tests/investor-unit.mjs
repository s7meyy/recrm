// المرحلة ٤٧ — محفظة المستثمر: قيمةُ التملّك، والمتوقَّع، والواقع، والفجوة.
import { capitalValue, portfolioRow, investorPortfolio, yieldPct, dealsByProperty } from '../js/util/investor.js';
const ok = (n, c, x = '') => console.log(`${c ? 'PASS' : 'FAIL'} — ${n}${x ? ' :: ' + x : ''}`);
const DAY = 86400000;
const NOW = Date.parse('2026-09-15T00:00:00Z');
const iso = (days) => new Date(NOW + days * DAY).toISOString();

/* قيمة التملّك */
ok('عرضُ بيعٍ: سعرُه ثمنُ تملّك', capitalValue({ price: 1000000, purposes: ['sale'] }).value === 1000000);
ok('وعرضُ استثمار كذلك', capitalValue({ price: 800000, purposes: ['investment'] }).value === 800000);
ok('وعرضٌ بلا غرضٍ مصرَّح: يُؤخذ سعرُه ثمنًا', capitalValue({ price: 500000, purposes: [] }).value === 500000);
ok('وعرضُ إيجارٍ وحده: لا قيمةَ تملّكٍ تُقسم عليها — ولا عائدَ ١٠٠٪ كاذب',
  capitalValue({ price: 60000, purposes: ['rent'] }).value === null);
ok('وتُقال العلّة لا تُترك فراغًا',
  capitalValue({ price: 60000, purposes: ['rent'] }).reason.includes('أجرةٌ سنويّة'));
ok('وبيعٌ وإيجارٌ معًا: السعرُ ثمنٌ', capitalValue({ price: 900000, purposes: ['rent', 'sale'] }).value === 900000);
ok('وبلا سعر: غير معلوم بعلّته', capitalValue({ price: null, purposes: ['sale'] }).value === null
  && capitalValue({}).reason === 'سعر العقار غير مُدخل');
ok('وسعرٌ سالبٌ أو صفرٌ لا يصير مقامًا', capitalValue({ price: 0, purposes: ['sale'] }).value === null
  && capitalValue({ price: -5, purposes: ['sale'] }).value === null);

/* المتوقَّع والواقع */
const prop = { id: 'p1', price: 1200000, purposes: ['investment'], district: 'النرجس' };
const deal = { id: 'd1', propertyId: 'p1', date: iso(-400), payments: [
  // سنةٌ خلفنا: ثلاثٌ قُبضت وواحدةٌ فاتت ولم تُقبض
  { dueAt: iso(-300), paidAt: iso(-299), amount: 15000 },
  { dueAt: iso(-200), paidAt: iso(-198), amount: 15000 },
  { dueAt: iso(-100), paidAt: iso(-100), amount: 15000 },
  { dueAt: iso(-50), paidAt: null, amount: 15000 },
  // سنةٌ أمامنا: أربعُ دفعاتٍ مجدوَلة
  { dueAt: iso(30), paidAt: null, amount: 16000 },
  { dueAt: iso(120), paidAt: null, amount: 16000 },
  { dueAt: iso(210), paidAt: null, amount: 16000 },
  { dueAt: iso(300), paidAt: null, amount: 16000 },
  // خارج النافذتين: لا هنا ولا هناك
  { dueAt: iso(500), paidAt: null, amount: 99999 },
  { dueAt: iso(-500), paidAt: iso(-500), amount: 88888 },
] };
const r = portfolioRow({ property: prop, deal, now: NOW });
ok('المتوقَّع = الدفعات المجدوَلة في السنة القادمة وحدها', r.expected === 64000, String(r.expected));
ok('ودفعةٌ بعد سنةٍ ونصف لا تُحسب في المتوقَّع', r.expected !== 64000 + 99999);
ok('ومصدرُه يُسمّى', r.expectedFrom === 'جدول الدفعات', r.expectedFrom);
ok('والواقع = ما قُبض فعلًا في السنة الماضية بتاريخ قبضه', r.actual === 45000, String(r.actual));
ok('ودفعةٌ قُبضت قبل سنةٍ ونصف خارج الواقع', r.actual !== 45000 + 88888);
ok('والفجوة = ما استُحقّ في السنة الماضية ولم يُقبض', r.missed === 15000 && r.missedCount === 1, JSON.stringify([r.missed, r.missedCount]));
ok('ودفعةٌ لم يَحِن موعدُها ليست فجوة', r.missed === 15000);
ok('العائد المتوقَّع = ٦٤٠٠٠ ÷ ١٢٠٠٠٠٠', yieldPct(r.expectedYield) === 5.3, String(yieldPct(r.expectedYield)));
ok('والعائد الواقع = ٤٥٠٠٠ ÷ ١٢٠٠٠٠٠', yieldPct(r.actualYield) === 3.8, String(yieldPct(r.actualYield)));
ok('وافتراقُهما هو الخبر', r.expectedYield > r.actualYield);
ok('ونسبةُ التحصيل = ٤٥٠٠٠ ÷ ٦٠٠٠٠', yieldPct(r.collectionRate) === 75, String(yieldPct(r.collectionRate)));

/* عقارٌ بلا عقد */
const bare = portfolioRow({ property: { id: 'p2', price: 900000, purposes: ['sale'] }, deal: null, now: NOW });
ok('عقارٌ بلا عقدِ إيجار: لا متوقَّعَ مخترَع', bare.expected === null && bare.expectedYield === null);
ok('ولا واقعَ ولا فجوة', bare.actual === 0 && bare.missed === 0 && bare.hasLease === false);

/* أجرةٌ معروضةٌ بلا جدول */
const asking = portfolioRow({ property: { id: 'p3', price: 70000, purposes: ['rent'] }, deal: null, now: NOW });
ok('عرضُ إيجارٍ بلا جدول: أجرتُه المعروضة هي المتوقَّع', asking.expected === 70000 && asking.expectedFrom === 'الأجرة المعروضة');
ok('لكن لا عائدَ له: لا قيمةَ تملّكٍ تُقسم عليها', asking.expectedYield === null && asking.value === null);

/* عقارٌ مجهولُ القيمة لا يُفسد المجموع */
const props = [
  prop,
  { id: 'p2', ownerId: 'c1', price: 900000, purposes: ['sale'] },
  { id: 'p3', ownerId: 'c1', price: 70000, purposes: ['rent'] },
  { id: 'p9', ownerId: 'c2', price: 5000000, purposes: ['sale'] },
];
props[0].ownerId = 'c1';
const pf = investorPortfolio({ ownerId: 'c1', properties: props, deals: [deal], now: NOW });
ok('المحفظة تضمّ عقاراته وحده', pf.count === 3 && !pf.rows.some((x) => x.property.id === 'p9'), String(pf.count));
ok('والقيمةُ مجموعُ ما عُرف: ١٢٠٠٠٠٠ + ٩٠٠٠٠٠', pf.value === 2100000, String(pf.value));
ok('والمجهولُ يُعدّ ويُقال، لا يُحسب صفرًا', pf.unpriced === 1, String(pf.unpriced));
ok('والعائد الكلّيّ يُقسم على ما عُرفت قيمتُه', yieldPct(pf.actualYield) === 2.1, String(yieldPct(pf.actualYield)));
ok('ومن بلا عقدٍ يُعدّ', pf.withoutLease === 2, String(pf.withoutLease));
ok('والأغلى قيمةً أوّلًا', pf.rows[0].property.id === 'p1', pf.rows[0].property.id);

/* الفراغ */
const none = investorPortfolio({ ownerId: 'nobody', properties: props, deals: [] , now: NOW });
ok('مالكٌ بلا عقارات: صفرٌ صادقٌ بلا انفجار', none.count === 0 && none.value === 0 && none.actualYield === null);
ok('ومحفظةٌ بلا مدخلاتٍ أصلًا', investorPortfolio({}).count === 0);
ok('وسطرٌ بلا عقارٍ ولا عقد', portfolioRow({}).actual === 0 && portfolioRow({}).value === null);

/* عقارٌ بلا مالكٍ لا يُنسب إلى مالكٍ مجهول */
ok('عقارٌ بلا ownerId لا يدخل محفظةَ أحد',
  investorPortfolio({ ownerId: null, properties: [{ id: 'z', ownerId: null, price: 1 }], now: NOW }).count === 0);

/* أحدثُ صفقةٍ هي العقد الساري */
const map = dealsByProperty([
  { id: 'old', propertyId: 'p1', date: '2024-01-01' },
  { id: 'new', propertyId: 'p1', date: '2026-01-01' },
]);
ok('وأحدثُ صفقةٍ للعقار هي عقدُه', map.get('p1').id === 'new', map.get('p1').id);
ok('وصفقةٌ بلا عقارٍ تُتجاهل', dealsByProperty([{ id: 'x' }]).size === 0);

/* النسبة */
ok('النسبةُ بمنزلةٍ واحدة', yieldPct(5.2777) === 5.3, String(yieldPct(5.2777)));
ok('والمجهولُ يبقى مجهولًا لا صفرًا', yieldPct(null) === null && yieldPct(Infinity) === null && yieldPct(NaN) === null);
