// اختبار وحدة (المرحلة ١٧): التحصيل، وقمع التحويل، وصحة البيانات. دوال خالصة بلا متصفح.
import { invoiceCollection, invoiceRemaining, invoicePaid } from '../js/data/schema.js';
import { receivables, bucketFor, ageDays } from '../js/util/receivables.js';
import { conversionFunnel } from '../js/util/funnel.js';
import { healthReport } from '../js/util/health.js';

const ok = (n, c, x = '') => console.log(`${c ? 'PASS' : 'FAIL'} — ${n}${x ? ' :: ' + x : ''}`);
const inv = (o) => ({ type: 'invoice', items: [{ qty: 1, unitPrice: 1000 }], ...o });

/* ===== ١) حالة التحصيل ===== */
ok('فاتورة بلا قبض = لم يُقبض', invoiceCollection(inv({})) === 'unpaid');
ok('قبض جزئي يُعرف جزئيًا', invoiceCollection(inv({ paidAmount: 400 })) === 'partial');
ok('القبض الكامل مقبوض', invoiceCollection(inv({ paidAmount: 1000 })) === 'paid');
ok('نصف ريال تسامحُ تقريب لا متبقٍّ', invoiceCollection(inv({ paidAmount: 999.6 })) === 'paid');
ok('عرض السعر ليس مستحقًا', invoiceCollection({ type: 'quote', items: [{ qty: 1, unitPrice: 9 }] }) === 'quote');
ok('مستند بلا بنود لا يُزعجك', invoiceCollection(inv({ items: [] })) === 'paid');
ok('المتبقّي = الإجمالي − المقبوض', invoiceRemaining(inv({ paidAmount: 400 })) === 600);
ok('المتبقّي لا يكون سالبًا', invoiceRemaining(inv({ paidAmount: 5000 })) === 0);
ok('المقبوض السالب يُقرأ صفرًا', invoicePaid(inv({ paidAmount: -5 })) === 0);

/* ===== ٢) المستحقات والتقادم ===== */
const now = new Date('2026-09-14T00:00:00.000Z');
const r = receivables({
  invoices: [
    inv({ id: 'i1', date: '2026-09-01T00:00:00.000Z', items: [{ qty: 1, unitPrice: 5000 }] }),
    inv({ id: 'i2', date: '2026-05-01T00:00:00.000Z', items: [{ qty: 1, unitPrice: 9000 }], paidAmount: 4000 }),
    { id: 'i3', type: 'quote', date: '2026-05-01T00:00:00.000Z', items: [{ qty: 1, unitPrice: 99999 }] },
    inv({ id: 'i4', date: '2026-09-10T00:00:00.000Z', dueAt: '2026-10-20T00:00:00.000Z', items: [{ qty: 1, unitPrice: 700 }] }),
    inv({ id: 'i5', date: '2026-01-01T00:00:00.000Z', items: [{ qty: 1, unitPrice: 100 }], paidAmount: 100 }),
  ],
  deals: [
    { id: 'd1', date: '2026-07-01T00:00:00.000Z', commission: 30000 },
    { id: 'd2', date: '2026-07-01T00:00:00.000Z', commission: 1000, commissionPaidAt: '2026-08-01T00:00:00.000Z' },
    { id: 'd3', date: '2026-07-01T00:00:00.000Z', commission: 0 },
  ],
}, now);
const ids = r.rows.map((x) => x.id);
ok('عرض السعر لا يدخل المستحقات', !ids.includes('i3'), ids.join(','));
ok('الفاتورة المقبوضة لا تدخل', !ids.includes('i5'));
ok('العمولة المقبوضة لا تدخل', !ids.includes('d2'));
ok('الصفقة بلا رقم عمولة ليست مستحقًا', !ids.includes('d3'));
ok('الإجمالي يجمع الفواتير والعمولات', r.total === 5000 + 5000 + 700 + 30000, String(r.total));
ok('المتأخر يستثني ما لم يستحق بعد', r.overdueTotal === 40000 && r.overdueCount === 3, `${r.overdueTotal}/${r.overdueCount}`);
ok('الاستحقاق المؤجَّل يُحسب على تاريخه لا على الإصدار', r.rows.find((x) => x.id === 'i4').days < 0);
ok('الأقدم أولًا', ids[0] === 'i2', ids.join(','));
ok('شريحة ٦١–٩٠ تسع ٧٥ يومًا', bucketFor(75) === 'd90');
ok('ما لم يستحق بعد في «لم يستحق»', bucketFor(-3) === 'current');
ok('عمر تاريخ غير صالح صفر', ageDays('ليس تاريخًا', now) === 0);

/* ===== ٣) قمع التحويل ===== */
const f = conversionFunnel({
  requests: [{ id: 'r1', status: 'active' }, { id: 'r2', status: 'active' }, { id: 'r3', status: 'active' },
    { id: 'r4', status: 'paused' }, { id: 'r5', status: 'done' }],
  matches: [
    { requestId: 'r1', status: 'presented' }, { requestId: 'r1', status: 'interested' },
    { requestId: 'r2', status: 'not_interested' }, { requestId: 'r5', status: 'won' },
    { requestId: 'r4', status: 'won' },
  ],
});
const counts = f.stages.map((s) => s.count);
ok('القمع لا يصعد أبدًا', counts.every((c, i) => i === 0 || c <= counts[i - 1]), counts.join('→'));
ok('الموقوف مستثنى والمنجز محسوب', counts[0] === 4, String(counts[0]));
ok('«عُرض» يشمل من تجاوزها إلى الاهتمام', counts[2] === 2, String(counts[2]));
ok('الطلب الواحد لا يُعدّ مرتين بعقارين', counts[1] === 3, String(counts[1]));
ok('مطابقة طلبٍ موقوف لا تُحسب فوزًا', counts[4] === 1, String(counts[4]));
ok('أسوأ خطوة تُذكر بعدد الساقطين', f.worst && f.worst.lost >= 1, JSON.stringify(f.worst?.key));
ok('لا قمع بلا طلبات', conversionFunnel({}).stages[0].count === 0);

/* ===== ٤) صحة البيانات ===== */
const h = healthReport({
  properties: [
    { id: 'p1', captureStatus: 'approved', city: 'الرياض', type: 'villa', purposes: ['sale'], price: null, area: 400, location: { lat: 24, lng: 46 } },
    { id: 'p2', captureStatus: 'approved', city: 'الرياض', type: '', purposes: [], price: 100, area: 1 },
    { id: 'p3', captureStatus: 'captured', city: 'الرياض', type: '', purposes: [], price: null, area: null },
  ],
  clients: [
    { id: 'c1', name: 'أ', phone: '0500000001' }, { id: 'c2', name: 'ب', phone: '٠٥٠٠٠٠٠٠٠١' },
    { id: 'c3', name: 'ج', phone: '' },
  ],
  requests: [{ id: 'r1', status: 'active', updatedAt: '2020-01-01T00:00:00.000Z' }],
  externals: [], deals: [{ id: 'd1', date: '2026-01-01', commission: 0 }],
  typeName: (k) => (k === 'villa' ? 'فلة' : k),
});
const key = (k) => h.groups.find((g) => g.key === k);
ok('غير المعتمد لا يُحاسَب على نقصه', !JSON.stringify(h.groups).includes('p3'));
ok('عقار بلا نوع ولا غرض لا يدخل المطابقة', key('property-unmatched').count === 1);
ok('يُذكر الحقل الناقص بالاسم', key('property-unmatched').items[0].detail.includes('النوع'));
ok('عقار بلا سعر يُرصد', key('property-no-price').count === 1);
ok('عقار بلا موقع يُرصد', key('property-no-location').count === 1);
ok('عميل بلا جوال يُرصد', key('client-no-phone').count === 1);
ok('التكرار يُكتشف رغم اختلاف صيغة الأرقام', key('client-duplicate').count === 1, key('client-duplicate').items[0].label);
ok('الطلب النائم يُرصد', key('request-stale').count === 1);
ok('الصفقة بلا عمولة تُرصد', key('deal-no-commission').count === 1);
ok('كل بند يقول ماذا يتعطّل', h.groups.every((g) => g.impact && g.impact.length > 20));
ok('نوع العقار يُعرض باسمه العربي', key('property-no-price').items[0].label.includes('فلة'));
ok('بيانات سليمة = لا ملاحظات', healthReport({}).groups.length === 0);

/* ===== المرحلة ٤٨ — العائد على رأس المال المدفوع ===== */
const F48 = await import('../js/util/finance.js');
const lv = F48.leveragedYield({
  price: 1000000, annualRent: 60000, annualCosts: 5000,
  downPct: 20, cashCosts: 30000, annualRate: 5.5, months: 240,
});
ok('ما يخرج من جيبك = الدفعة الأولى + النقد الآخر', lv.cashIn === 230000, String(lv.cashIn));
ok('ومبلغُ التمويل ما بقي', lv.loan === 800000, String(lv.loan));
ok('والقسطُ الشهريّ محسوبٌ بمعادلة الإطفاء', Math.round(lv.monthlyPayment) === 5503, String(Math.round(lv.monthlyPayment)));
ok('والصافي = دخلُ الإيجار بعد المصاريف − خدمةِ الدين',
  Math.round(lv.netIncome) === Math.round(55000 - lv.annualDebt), String(Math.round(lv.netIncome)));
ok('والعائدُ يُقسم على ما دفعتَه لا على الثمن',
  Math.abs(lv.cashYield - (lv.netIncome / 230000) * 100) < 0.0001);
ok('وهو يختلف عن العائد على الثمن اختلافًا حقيقيًّا',
  Math.abs(lv.cashYield - F48.rentalYield({ price: 1000000, annualRent: 60000, annualCosts: 5000 }).net) > 1);

/* **قد يكون سالبًا، ويُقال سالبًا** */
const bad = F48.leveragedYield({ price: 1000000, annualRent: 20000, downPct: 10, annualRate: 7, months: 180 });
ok('قسطٌ أكبرُ من إيجارٍ يُقرأ سالبًا لا صفرًا', bad.cashYield < 0 && bad.positive === false, String(Math.round(bad.cashYield)));
ok('وما يُدفع من الجيب شهريًّا يُقال', bad.monthlyNet < 0);

/* الحدود */
ok('وشراءٌ نقدًا بلا دفعةٍ ولا نقدٍ آخر: لا عائدَ نسبيًّا — ولا قسمةَ على صفر',
  F48.leveragedYield({ price: 1000000, annualRent: 60000, downPct: 0, cashCosts: 0 }) === null);
ok('وبلا سعرٍ أو إيجارٍ لا شيء', F48.leveragedYield({ price: 0, annualRent: 60000 }) === null
  && F48.leveragedYield({ price: 1000000, annualRent: 0 }) === null && F48.leveragedYield() === null);
ok('ونسبةُ تمويلٍ صفرٌ لا تنفجر', Number.isFinite(F48.leveragedYield({ price: 1000000, annualRent: 60000, downPct: 20, annualRate: 0 }).cashYield));
ok('وشراءٌ نقديٌّ كاملٌ برسومٍ نقديّة يُحسب بلا قسط',
  F48.leveragedYield({ price: 1000000, annualRent: 60000, downPct: 100, cashCosts: 50000 }).monthlyPayment === 0);
