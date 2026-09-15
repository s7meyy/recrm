// اختبار وحدة (المرحلة ٣١): الاتفاقيات، وملخّص الضريبة، والعائد، وvCard.
import { agreementState, expiringAgreements, unsignedProperties } from '../js/util/agreements.js';
import { vatSummary, invoiceYears, quarterOf } from '../js/util/vat-report.js';
import { rentalYield } from '../js/util/finance.js';
import { buildVCards } from '../js/data/exchange.js';

const ok = (n, c, x = '') => console.log(`${c ? 'PASS' : 'FAIL'} — ${n}${x ? ' :: ' + x : ''}`);
const DAY = 86400000;
const now = Date.parse('2026-09-15T08:00:00.000Z');
const ago = (d) => new Date(now - d * DAY).toISOString();

/* ===== الاتفاقيات ===== */
ok('عقار بلا اتفاقية: حالة معلنة لا خطأ', agreementState({}, { now }).state === 'none');
const active = agreementState({ agreementSignedAt: ago(10) }, { now, defaultDays: 90 });
ok('والسارية تبقى سارية ببقيّة مدّتها', active.state === 'active' && active.days === 80, JSON.stringify([active.state, active.days]));
const soon = agreementState({ agreementSignedAt: ago(80) }, { now, defaultDays: 90 });
ok('والتي توشك تُوسم «قريبًا»', soon.state === 'soon' && soon.days === 10, JSON.stringify([soon.state, soon.days]));
const expired = agreementState({ agreementSignedAt: ago(100) }, { now, defaultDays: 90 });
ok('والمنتهية تُوسم منتهية بعدد أيامها', expired.state === 'expired' && expired.days === -10, String(expired.days));
const own = agreementState({ agreementSignedAt: ago(100), agreementDays: 180 }, { now, defaultDays: 90 });
ok('ومدّة العقار تغلب الافتراضية', own.state === 'active' && own.days === 80, JSON.stringify([own.state, own.days]));

const properties = [
  { id: 'p1', captureStatus: 'approved', status: 'agreed', agreementSignedAt: ago(85) }, // توشك
  { id: 'p2', captureStatus: 'approved', status: 'agreed', agreementSignedAt: ago(120) }, // انتهت
  { id: 'p3', captureStatus: 'approved', status: 'sold', agreementSignedAt: ago(120) }, // بيع
  { id: 'p4', captureStatus: 'approved', status: 'agreed' }, // بلا اتفاقية
  { id: 'p5', captureStatus: 'pending', status: 'agreed', agreementSignedAt: ago(120) }, // غير معتمد
  { id: 'p6', captureStatus: 'approved', status: 'agreed', agreementSignedAt: ago(5) }, // سارية
];
const rows = expiringAgreements(properties, { now, defaultDays: 90 });
ok('التي توشك أو انتهت فقط', rows.map((r) => r.property.id).join(',') === 'p2,p1', rows.map((r) => r.property.id).join(','));
ok('والأقرب انتهاءً أولًا', rows[0].property.id === 'p2');
ok('والمبيع خارج القائمة', !rows.some((r) => r.property.id === 'p3'));
ok('وغير المعتمد خارجها', !rows.some((r) => r.property.id === 'p5'));
ok('والسارية لا تُزعجك', !rows.some((r) => r.property.id === 'p6'));
ok('وبلا اتفاقية تُحصى وحدها', unsignedProperties(properties).map((p) => p.id).join(',') === 'p4', unsignedProperties(properties).map((p) => p.id).join(','));

/* ===== ملخّص الضريبة ===== */
const inv = (id, date, unitPrice, vatRate = 15, type = 'invoice') => ({
  id, type, number: id, date, clientName: 'عميل', vatRate,
  items: [{ id: 'i1', description: 'عمولة', qty: 1, unitPrice }],
});
const invoices = [
  inv('A', '2026-01-10', 10000),
  inv('B', '2026-03-31', 20000),
  inv('C', '2026-04-01', 30000), // الربع الثاني
  inv('D', '2026-02-10', 5000, 0), // بلا ضريبة
  inv('E', '2026-02-11', 9000, 15, 'quote'), // عرض سعر
  inv('F', '2025-02-10', 7000), // سنة أخرى
];
const q1 = vatSummary(invoices, { year: 2026, quarter: 1 });
ok('فواتير الربع وحدها', q1.count === 3, String(q1.count));
ok('وعرض السعر ليس فاتورة', !q1.rows.some((r) => r.number === 'E'));
ok('وسنة أخرى خارجه', !q1.rows.some((r) => r.number === 'F'));
ok('والربع الثاني خارجه', !q1.rows.some((r) => r.number === 'C'));
ok('والإجمالي قبل الضريبة صحيح', q1.net === 35000, String(q1.net));
ok('وضريبة المخرجات مجموعة', q1.vat === 4500, String(q1.vat));
ok('والإجمالي بعدها', q1.gross === 39500, String(q1.gross));
ok('وفاتورة بلا ضريبة تُعدّ وتُذكر', q1.zeroRated === 1, String(q1.zeroRated));
ok('والصفوف مرتَّبة بالتاريخ', q1.rows[0].number === 'A' && q1.rows.at(-1).number === 'B');
ok('وربع بلا فواتير لا ينفجر', vatSummary(invoices, { year: 2026, quarter: 4 }).count === 0);
ok('والسنوات من الفواتير نفسها', invoiceYears(invoices).join(',') === '2026,2025', invoiceYears(invoices).join(','));
ok('وبلا فواتير تُعطى السنة الحالية', invoiceYears([]).length === 1);
ok('والربع يُحسب من التاريخ', quarterOf('2026-07-05') === 3 && quarterOf('2026-12-31') === 4);

/* ===== العائد ===== */
const y = rentalYield({ price: 1000000, annualRent: 60000, annualCosts: 6000 });
ok('العائد الإجمالي والصافي', y.gross === 6 && Math.round(y.net * 10) / 10 === 5.4, JSON.stringify([y.gross, y.net]));
ok('ومدّة الاسترداد من الصافي', Math.round(y.payback) === 19, String(y.payback));
const occ = rentalYield({ price: 1000000, annualRent: 60000, occupancy: 50 });
ok('ونسبة الإشغال تخفض العائد', occ.gross === 3, String(occ.gross));
const zero = rentalYield({ price: 1000000, annualRent: 60000, annualCosts: 60000 });
ok('ودخلٌ صفر لا يعطي مدّة استرداد لا نهائية', zero.payback === null && zero.net === 0);
ok('وسعر صفر يُردّ فارغًا', rentalYield({ price: 0, annualRent: 1000 }) === null);

/* ===== vCard ===== */
const vcf = buildVCards([
  { id: 'c1', name: 'فهد; العتيبي', phone: '0501234567', phone2: '0559998888', tags: ['جادّ'], referralSource: 'إعلان', notes: 'سرّي جدًا' },
  { id: 'c2', name: '', phone: '0551112222', tags: [] },
  { id: 'c3', name: 'بلا جوال', phone: '', phone2: '' },
], { prefix: 'كسّاب — ' });
ok('بطاقة لكل عميل بجوال', (vcf.match(/BEGIN:VCARD/g) || []).length === 2, String((vcf.match(/BEGIN:VCARD/g) || []).length));
ok('ومن بلا جوال لا يُصدَّر', !vcf.includes('بلا جوال'));
ok('والبادئة تميّز عملاءك في دفترك', vcf.includes('FN:كسّاب — فهد'), vcf.split('\r\n').find((l) => l.startsWith('FN:')) || '');
ok('والفاصلة المنقوطة مهرَّبة', vcf.includes('\\;'), vcf.split('\r\n').find((l) => l.startsWith('FN:')) || '');
ok('والجوالان معًا', vcf.includes('0501234567') && vcf.includes('0559998888'));
ok('والوسوم تُكتب', vcf.includes('CATEGORIES:جادّ'));
ok('**وملاحظاتك الداخلية لا تُكتب**', !vcf.includes('سرّي جدًا'));
ok('والمصدر يُكتب', vcf.includes('المصدر: إعلان'));
ok('والبطاقة مغلقة', (vcf.match(/END:VCARD/g) || []).length === 2);
ok('وبلا عملاء ملفٌّ فارغ لا خطأ', buildVCards([]) === '');
