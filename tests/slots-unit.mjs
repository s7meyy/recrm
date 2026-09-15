// اختبار وحدة (المرحلة ٢٩): توليد أوقات الحجز وقبولها.
import { buildSlots, slotAllowed, minutesOf, localParts } from '../netlify/lib/slots.js';

const ok = (n, c, x = '') => console.log(`${c ? 'PASS' : 'FAIL'} — ${n}${x ? ' :: ' + x : ''}`);

// الثلاثاء ١٥ سبتمبر ٢٠٢٦، الثامنة صباحًا بتوقيت الرياض (٠٥:٠٠ UTC).
const now = Date.parse('2026-09-15T05:00:00.000Z');
const booking = {
  enabled: true, days: [0, 1, 2, 3, 4], from: '16:00', to: '19:00',
  slotMinutes: 60, leadHours: 4, horizonDays: 3,
};

ok('قراءة الوقت من نصّه', minutesOf('16:30') === 990 && minutesOf('00:00') === 0);
ok('ووقت غير صالح يُردّ فارغًا', minutesOf('25:00') === null && minutesOf('abc') === null && minutesOf('') === null);

const slots = buildSlots(booking, [], now);
ok('تولَّدت أوقات', slots.length > 0, String(slots.length));
ok('وكلها بتوقيت الرياض داخل الدوام',
  slots.every((s) => s.time >= '16:00' && s.time < '19:00'),
  slots.slice(0, 3).map((s) => s.time).join(','));
ok('وبفاصل مدّة الموعد', slots[0].time === '16:00' && slots[1].time === '17:00', `${slots[0].time},${slots[1].time}`);
ok('ولا يتجاوز آخرُها نهايةَ الدوام', !slots.some((s) => s.time === '19:00'));
ok('وأيام العمل وحدها', slots.every((s) => booking.days.includes(s.dow)), [...new Set(slots.map((s) => s.dow))].join(','));

// مهلة الإشعار: الساعة ٨ صباحًا + ٤ ساعات = ١٢ ظهرًا، فأوقات اليوم كلها (١٦–١٩) متاحة.
const tight = buildSlots({ ...booking, leadHours: 12 }, [], now);
ok('مهلة الإشعار تُسقط أوقات اليوم القريبة',
  !tight.some((s) => s.date === localParts(now).date),
  tight.slice(0, 2).map((s) => `${s.date} ${s.time}`).join(' | '));

const taken = [slots[0].iso];
const left = buildSlots(booking, taken, now);
ok('والمحجوز يختفي', left.length === slots.length - 1 && !left.some((s) => s.iso === slots[0].iso));

ok('القبول يتحقّق من المجموعة المولَّدة', slotAllowed(slots[1].iso, booking, [], now) === true);
ok('ووقتٌ محجوز يُرفض', slotAllowed(slots[0].iso, booking, taken, now) === false);
ok('ووقتٌ خارج الدوام يُرفض', slotAllowed('2026-09-15T23:00:00.000Z', booking, [], now) === false);
ok('ووقتٌ في الماضي يُرفض', slotAllowed('2026-09-14T13:00:00.000Z', booking, [], now) === false);
ok('ونصٌّ ليس تاريخًا يُرفض', slotAllowed('غدًا', booking, [], now) === false);

ok('دوام مقلوب لا ينتج شيئًا', buildSlots({ ...booking, from: '20:00', to: '16:00' }, [], now).length === 0);
ok('وبلا إعدادات أصلًا لا ينفجر', Array.isArray(buildSlots({}, [], now)));
ok('والأفق يحدّ عدد الأيام',
  new Set(buildSlots({ ...booking, horizonDays: 1 }, [], now).map((s) => s.date)).size <= 1);

// اليوم المحلي: ٠٥:٠٠ UTC هو الثامنة صباحًا بالرياض من اليوم نفسه لا من أمس.
const parts = localParts(now);
ok('التحويل إلى توقيت الرياض صحيح', parts.date === '2026-09-15' && parts.time === '08:00', JSON.stringify(parts));
// ومنتصف الليل UTC هو الثالثة فجرًا بالرياض من اليوم التالي.
const mid = localParts(Date.parse('2026-09-15T00:00:00.000Z'));
ok('وما بعد منتصف ليل UTC يُحسب على يومه المحلي', mid.date === '2026-09-15' && mid.time === '03:00', JSON.stringify(mid));
