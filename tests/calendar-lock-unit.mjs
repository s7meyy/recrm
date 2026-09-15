// اختبار وحدة (المرحلة ٣٢): التقويم و.ics، والذكرى، وتكرار العروض، والقفل التلقائي.
import { monthEvents, monthGrid, icsCalendar, dealAnniversaries, dayKey } from '../js/util/calendar.js';
import { externalDuplicates } from '../js/util/duplicates.js';
import { startAutoLock } from '../js/util/auto-lock.js';

const ok = (n, c, x = '') => console.log(`${c ? 'PASS' : 'FAIL'} — ${n}${x ? ' :: ' + x : ''}`);
const DAY = 86400000;

/* ===== شبكة الشهر ===== */
// سبتمبر ٢٠٢٦ يبدأ الثلاثاء (٣٠ يومًا).
const weeks = monthGrid(2026, 8);
ok('الشبكة أسابيع من سبعة', weeks.every((w) => w.length === 7), String(weeks[0].length));
ok('وأيام الشهر كلها فيها', weeks.flat().filter(Boolean).length === 30, String(weeks.flat().filter(Boolean).length));
ok('وأول يوم في موضعه من الأسبوع', weeks[0].findIndex(Boolean) === new Date(2026, 8, 1).getDay());

/* ===== أحداث الشهر ===== */
const at = (d, h = 12) => new Date(2026, 8, d, h).toISOString();
const data = {
  showings: [
    { id: 's1', at: at(10), clientId: 'c1', propertyId: 'p1', status: 'scheduled' },
    { id: 's2', at: at(11), clientId: 'c1', propertyId: 'p1', status: 'cancelled' }, // ملغاة
    { id: 's3', at: new Date(2026, 9, 5).toISOString(), clientId: 'c1', propertyId: 'p1', status: 'scheduled' }, // شهر آخر
  ],
  tasks: [
    { id: 't1', title: 'اتصل بالمالك', dueAt: at(12), done: false },
    { id: 't2', title: 'منجزة', dueAt: at(13), done: true },
    { id: 't3', title: 'بلا موعد', dueAt: null, done: false },
  ],
  clients: [{ id: 'c1', name: 'فهد' }, { id: 'c2', name: 'سعد' }],
  deals: [{
    id: 'd1', clientId: 'c1', propertyId: 'p1', leaseEndAt: at(20),
    payments: [
      { id: 'y1', dueAt: at(15), amount: 4000, paidAt: null },
      { id: 'y2', dueAt: at(16), amount: 4000, paidAt: at(16) }, // مقبوضة
    ],
  }],
  properties: [{ id: 'p1' }],
  propertyLabel: () => 'فلة النرجس',
  clientLabel: (id) => (id === 'c1' ? 'فهد' : ''),
  nextFollowUp: (c) => (c.id === 'c2' ? at(18) : null),
  agreementEnd: () => at(25),
};
const { days, events, counts } = monthEvents(data, { year: 2026, month: 8 });
ok('المعاينة المجدولة حدث', counts.showing === 1, String(counts.showing));
ok('والملغاة ليست حدثًا', !events.some((e) => e.title.includes('معاينة') && e.day === dayKey(new Date(2026, 8, 11))));
ok('ومعاينة شهرٍ آخر خارج الشهر', events.every((e) => e.at < new Date(2026, 9, 1).toISOString()));
ok('والمهمة المنجزة لا تظهر', !events.some((e) => e.title === 'منجزة'));
ok('والمهمة بلا موعد لا تظهر', !events.some((e) => e.title === 'بلا موعد'));
ok('والمتابعة حدث', counts.followUp === 1);
ok('والدفعة غير المقبوضة وحدها', counts.payment === 1, String(counts.payment));
ok('ونهاية العقد حدث', counts.leaseEnd === 1);
ok('ونهاية الاتفاقية حدث', counts.agreement === 1);
ok('والأحداث مرتَّبة زمنيًا', events.map((e) => e.at).join('') === [...events].sort((a, b) => a.at.localeCompare(b.at)).map((e) => e.at).join(''));
ok('ومجمَّعة باليوم', days.get(dayKey(new Date(2026, 8, 10)))?.length === 1, String(days.size));
ok('وشهر فارغ لا ينفجر', monthEvents({}, { year: 2026, month: 0 }).events.length === 0);

/* ===== ICS ===== */
const ics = icsCalendar(events, { name: 'كسّاب' });
ok('الملف يبدأ وينتهي كتقويم', ics.startsWith('BEGIN:VCALENDAR') && ics.trimEnd().endsWith('END:VCALENDAR'));
ok('وحدثٌ لكل موعد', (ics.match(/BEGIN:VEVENT/g) || []).length === events.length, String((ics.match(/BEGIN:VEVENT/g) || []).length));
ok('ولكل حدث بداية ونهاية ومعرّف', (ics.match(/DTSTART:/g) || []).length === events.length && (ics.match(/UID:/g) || []).length === events.length);
ok('والوقت بصيغة UTC', /DTSTART:\d{8}T\d{6}Z/.test(ics), ics.split('\r\n').find((l) => l.startsWith('DTSTART')) || '');
ok('والأسطر مفصولة بـCRLF', ics.includes('\r\n'));
ok('وحدثٌ بتاريخ غير صالح يُتخطّى', (icsCalendar([{ at: 'ليس تاريخًا', title: 'x' }]).match(/BEGIN:VEVENT/g) || []).length === 0);
const escaped = icsCalendar([{ at: at(10), title: 'عنوان; فيه, فواصل' }]);
ok('والفواصل مهرَّبة', escaped.includes('\\;') && escaped.includes('\\,'), escaped.split('\r\n').find((l) => l.startsWith('SUMMARY')) || '');

/* ===== ذكرى الصفقة ===== */
const now = Date.parse('2026-09-15T08:00:00.000Z');
const anniversaries = dealAnniversaries([
  { id: 'a', clientId: 'c1', date: new Date(now - 365 * DAY).toISOString() }, // عام بالضبط
  { id: 'b', clientId: 'c1', date: new Date(now - 368 * DAY).toISOString() }, // ضمن النافذة
  { id: 'c', clientId: 'c1', date: new Date(now - 380 * DAY).toISOString() }, // مضت النافذة
  { id: 'd', clientId: 'c1', date: new Date(now - 200 * DAY).toISOString() }, // دون عام
  { id: 'e', clientId: 'c1', date: new Date(now - 730 * DAY).toISOString() }, // عامان
  { id: 'f', clientId: 'c1', date: new Date(now - 365 * DAY).toISOString(), anniversaryGreetedAt: 'x' }, // هُنّئ
  { id: 'g', clientId: null, date: new Date(now - 365 * DAY).toISOString() }, // بلا عميل
], { now });
const ids = anniversaries.map((x) => x.deal.id);
ok('صفقة مرّ عليها عام تظهر', ids.includes('a'));
ok('وضمن النافذة تظهر', ids.includes('b'));
ok('وبعد النافذة لا تظهر', !ids.includes('c'));
ok('ودون عام لا تظهر', !ids.includes('d'));
ok('والعامان يظهران بعددهما', anniversaries.find((x) => x.deal.id === 'e')?.years === 2, String(anniversaries.find((x) => x.deal.id === 'e')?.years));
ok('ومن هُنّئ لا يعود', !ids.includes('f'));
ok('وبلا عميل لا تظهر', !ids.includes('g'));
ok('والأقدم صفقةً أولًا', ids[0] === 'e', ids.join(','));

/* ===== عرض خارجي يشبه مخزونك ===== */
const props = [{ id: 'p1', captureStatus: 'approved', city: 'الرياض', district: 'النرجس', type: 'villa', area: 400, price: 2000000 }];
const dups = externalDuplicates({
  properties: props,
  externals: [
    { id: 'e1', status: 'active', city: 'الرياض', district: 'النرجس', type: 'villa', area: 402, price: 2050000 },
    { id: 'e2', status: 'active', city: 'الرياض', district: 'الملقا', type: 'villa', area: 400, price: 2000000 }, // حي آخر
    { id: 'e3', status: 'active', city: 'الرياض', district: 'النرجس', type: 'land', area: 400, price: 2000000 }, // نوع آخر
    { id: 'e4', status: 'active', city: 'الرياض', district: 'النرجس', type: 'villa', area: 700, price: 2000000 }, // مساحة بعيدة
    { id: 'e5', status: 'active', city: 'الرياض', district: 'النرجس', type: 'villa', area: 400, price: 5000000 }, // سعر بعيد
    { id: 'e6', status: 'unavailable', city: 'الرياض', district: 'النرجس', type: 'villa', area: 400, price: 2000000 }, // غير نشط
  ],
});
ok('المطابق وحده يُشتبه به', dups.length === 1 && dups[0].external.id === 'e1', dups.map((d) => d.external.id).join(','));
ok('وفرق السعر محسوب', dups[0].priceGap === 50000, String(dups[0].priceGap));
ok('وبلا سعر في أحدهما تبقى الشبهة',
  externalDuplicates({ properties: props, externals: [{ id: 'x', status: 'active', city: 'الرياض', district: 'النرجس', type: 'villa', area: 400, price: null }] }).length === 1);
ok('وعقار غير معتمد لا يُقارن',
  externalDuplicates({ properties: [{ ...props[0], captureStatus: 'pending' }], externals: [{ id: 'x', status: 'active', city: 'الرياض', district: 'النرجس', type: 'villa', area: 400, price: 2000000 }] }).length === 0);

/* ===== القفل التلقائي ===== */
ok('صفر دقيقة = لا قفل', startAutoLock({ minutes: 0 }).remaining() === Infinity);
