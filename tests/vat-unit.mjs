// اختبار وحدة (المرحلة ١٩): الضريبة ورمز ZATCA وحركة السعر.
import { invoiceTotal, invoiceVat, invoiceGrandTotal, invoiceRemaining, invoiceCollection } from '../js/data/schema.js';
import { zatcaTlvBase64, zatcaReady } from '../js/util/zatca.js';
import { priceTrend } from '../js/util/price-stats.js';

const ok = (n, c, x = '') => console.log(`${c ? 'PASS' : 'FAIL'} — ${n}${x ? ' :: ' + x : ''}`);
const inv = (o) => ({ type: 'invoice', items: [{ qty: 1, unitPrice: 1000 }], ...o });

/* ===== الضريبة ===== */
ok('بلا نسبة لا ضريبة', invoiceVat(inv({})) === 0 && invoiceGrandTotal(inv({})) === 1000);
ok('١٥٪ تُحسب على البنود', invoiceVat(inv({ vatRate: 15 })) === 150);
ok('الإجمالي = البنود + الضريبة', invoiceGrandTotal(inv({ vatRate: 15 })) === 1150);
ok('نسبة صفر كالمعفيّ', invoiceVat(inv({ vatRate: 0 })) === 0);
ok('نسبة غير رقمية تُتجاهل', invoiceVat(inv({ vatRate: 'خمسة' })) === 0);
ok('المتبقّي يُحسب على الإجمالي شاملًا الضريبة', invoiceRemaining(inv({ vatRate: 15, paidAmount: 1000 })) === 150,
  String(invoiceRemaining(inv({ vatRate: 15, paidAmount: 1000 }))));
ok('دفع البنود دون الضريبة ليس قبضًا كاملًا', invoiceCollection(inv({ vatRate: 15, paidAmount: 1000 })) === 'partial');
ok('دفع الإجمالي شاملًا الضريبة قبضٌ كامل', invoiceCollection(inv({ vatRate: 15, paidAmount: 1150 })) === 'paid');
ok('عرض السعر لا يُحصَّل ولو حمل نسبة', invoiceRemaining({ type: 'quote', items: [{ qty: 1, unitPrice: 100 }], vatRate: 15 }) === 0);

/* ===== رمز الفاتورة الضريبية (TLV) ===== */
const b64 = zatcaTlvBase64({ sellerName: 'مكتب كسّاب', vatNumber: '300000000000003', timestamp: '2026-09-14T19:00:00Z', total: 1150, vat: 150 });
const raw = Buffer.from(b64, 'base64');
const read = (buf) => {
  const out = {};
  let i = 0;
  while (i < buf.length) { const tag = buf[i]; const len = buf[i + 1]; out[tag] = buf.slice(i + 2, i + 2 + len).toString('utf8'); i += 2 + len; }
  return out;
};
const tags = read(raw);
ok('الوسوم الخمسة كلها موجودة', [1, 2, 3, 4, 5].every((t) => tags[t] !== undefined), Object.keys(tags).join(','));
ok('اسم البائع العربي يُرمَّز UTF-8 صحيحًا', tags[1] === 'مكتب كسّاب', tags[1]);
ok('الرقم الضريبي كما هو', tags[2] === '300000000000003');
ok('الطابع الزمني كما هو', tags[3] === '2026-09-14T19:00:00Z');
ok('الإجمالي بمنزلتين عشريتين', tags[4] === '1150.00', tags[4]);
ok('مبلغ الضريبة بمنزلتين', tags[5] === '150.00', tags[5]);
ok('الطول بايتات لا محارف (العربية بايتان)', raw[1] === Buffer.byteLength('مكتب كسّاب', 'utf8'), String(raw[1]));
ok('كسور الهللة تُقرَّب لا تُقصّ', read(Buffer.from(zatcaTlvBase64({ total: 1150.005, vat: 0.125 }), 'base64'))[4] === '1150.01');
ok('الشرط يكتمل باسم ورقم', zatcaReady({ sellerName: 'أ', vatNumber: '3' }) && !zatcaReady({ sellerName: 'أ', vatNumber: '' }));

/* ===== حركة السعر ===== */
const day = 86400000;
const now = Date.parse('2026-09-14T00:00:00Z');
ok('بلا تاريخ لا شارة', priceTrend({ price: 100, priceHistory: [] }) === null);
ok('نقطة واحدة = سعر لم يتحرك بعد', priceTrend({ price: 100, priceHistory: [{ at: '2026-01-01T00:00:00Z', price: 100 }] }) === null);
const t = priceTrend({ price: 1800000, priceHistory: [
  { at: '2026-06-14T00:00:00Z', price: 2000000 },
  { at: '2026-08-15T00:00:00Z', price: 1800000 },
] }, now);
ok('عدد التغييرات = النقاط ناقصَ واحدة', t.changes === 1, String(t.changes));
ok('نسبة الخفض من أول سعر مسجَّل', t.dropPct === 10, String(t.dropPct));
ok('الأيام منذ آخر تغيير', t.days === 30, String(t.days));
const up = priceTrend({ price: 2200000, priceHistory: [
  { at: '2026-08-01T00:00:00Z', price: 2000000 },
  { at: '2026-09-04T00:00:00Z', price: 2200000 },
] }, now);
ok('الرفع يُقرأ سالبًا فيُوصف رفعًا', up.dropPct === -10, String(up.dropPct));

/* ===== فحص واقعية الميزانية ===== */
import { budgetRealityGap, priceSamples } from '../js/util/price-stats.js';
const props = [2000000, 2100000, 2200000, 2300000].map((price, i) => ({
  id: `s${i}`, captureStatus: 'approved', city: 'الرياض', district: 'النرجس', type: 'villa',
  purposes: ['sale'], price, area: 400,
}));
const samples = priceSamples({ properties: props });
const req = (o) => ({ city: 'الرياض', districts: ['النرجس'], type: 'villa', purpose: 'sale', area: 400, ...o });
ok('ميزانية أقل بالثلث يُنبَّه عليها', (budgetRealityGap(req({ budgetMax: 1400000 }), samples) || {}).gapPct >= 30,
  JSON.stringify(budgetRealityGap(req({ budgetMax: 1400000 }), samples)));
ok('ميزانية قريبة لا تُزعجك', budgetRealityGap(req({ budgetMax: 2000000 }), samples) === null);
ok('طلب على أكثر من حي لا يُحاسَب', budgetRealityGap(req({ budgetMax: 1000000, districts: ['النرجس', 'حطين'] }), samples) === null);
ok('بلا مساحة لا تنبيه', budgetRealityGap(req({ budgetMax: 1000000, area: null }), samples) === null);
ok('بلا عيّنة حيّ لا تنبيه', budgetRealityGap(req({ budgetMax: 1000000, districts: ['الملقا'] }), samples) === null);
