// اختبار وحدة (المرحلة ٢٨): توقّع الإيراد، ونصّ الإعلان.
import { revenueForecast } from '../js/util/forecast.js';
import { adCopy, adGaps, AD_CHANNELS } from '../js/util/ad-copy.js';

const ok = (n, c, x = '') => console.log(`${c ? 'PASS' : 'FAIL'} — ${n}${x ? ' :: ' + x : ''}`);

/* ===== توقّع الإيراد ===== */
// تاريخ: ستة طلبات منتهية، ثلاثة منها أُنجزت — فالنِّسب تُقرأ من هذه لا من جدول عام.
const history = [
  { id: 'h1', status: 'done' }, { id: 'h2', status: 'done' }, { id: 'h3', status: 'done' },
  { id: 'h4', status: 'lost' }, { id: 'h5', status: 'lost' }, { id: 'h6', status: 'lost' },
];
const histMatches = [
  { requestId: 'h1', status: 'won' }, { requestId: 'h2', status: 'won' }, { requestId: 'h3', status: 'won' },
  { requestId: 'h4', status: 'interested' }, { requestId: 'h5', status: 'presented' }, { requestId: 'h6', status: 'new' },
];
const active = [
  { id: 'a1', status: 'active', budgetMax: 1000000 },
  { id: 'a2', status: 'active', budgetMax: 2000000 },
  { id: 'a3', status: 'active' }, // بلا ميزانية
  { id: 'a4', status: 'paused', budgetMax: 5000000 }, // موقوف: خارج الأنبوب
];
const activeMatches = [
  { requestId: 'a1', status: 'interested' },
  { requestId: 'a2', status: 'presented' },
];
const deals = [{ id: 'd1' }, { id: 'd2' }, { id: 'd3' }];

const f = revenueForecast({
  requests: [...history, ...active], matches: [...histMatches, ...activeMatches], deals, commissionPercent: 2.5,
});
ok('التوقّع يعمل مع عيّنة كافية', f.ok === true, f.reason || '');
ok('الموقوف خارج الأنبوب', f.pipeline === 3000000, String(f.pipeline));
ok('والطلب بلا ميزانية يُستثنى ويُذكر', f.counted === 2 && f.noBudget === 1, JSON.stringify([f.counted, f.noBudget]));
ok('والمدى يحوي وسطه', f.low <= f.expected && f.expected <= f.high, JSON.stringify([f.low, f.expected, f.high]));
ok('والاحتمال محسوب من تاريخك لا من فراغ', f.rates.interested > 0 && f.rates.interested <= 1, String(f.rates.interested));
const interested = f.stages.find((s) => s.key === 'interested');
ok('وكل مرحلة تحمل طلباتها وقيمتها', interested.count === 1 && interested.value === 1000000, JSON.stringify([interested.count, interested.value]));
ok('والمتوقَّع = القيمة × العمولة × الاحتمال',
  Math.round(interested.expected) === Math.round(1000000 * 0.025 * f.rates.interested),
  String(interested.expected));

const thin = revenueForecast({ requests: active, matches: activeMatches, deals: [{ id: 'x' }] });
ok('وتحت الحدّ الأدنى لا يُعطى رقم', thin.ok === false && thin.reason === 'sample', JSON.stringify(thin.reason));
ok('ويُعرض الأنبوب مع ذلك', thin.pipeline === 3000000, String(thin.pipeline));
ok('وبلا بيانات أصلًا لا ينفجر', revenueForecast({}).ok === false);

/* ===== نصّ الإعلان ===== */
const property = {
  type: 'villa', city: 'الرياض', district: 'النرجس', area: 400, price: 1900000,
  purposes: ['sale'], notes: 'دورين وملحق.', images: ['i1'],
  typeFields: { rooms: 6 },
};
const copy = adCopy(property, { typeLabel: 'فلة', group: 'building', company: { name: 'مكتب كسّاب', phone: '0501234567' }, ref: '3' });
ok('لكل قناة نصّها', copy.channels.length === AD_CHANNELS.length);
const portal = copy.channels.find((c) => c.key === 'portal');
ok('نصّ البوّابة يحمل السعر والمساحة والموقع',
  portal.text.includes('1,900,000') && portal.text.includes('400') && portal.text.includes('النرجس'));
ok('ورقم العرض إن كان منشورًا', portal.text.includes('رقم العرض: 3'));
ok('ووصفك كما كتبته', portal.text.includes('دورين وملحق.'));
const social = copy.channels.find((c) => c.key === 'social');
ok('ووسوم انستقرام من بيانات العقار نفسه', social.text.includes('#النرجس') && social.text.includes('#الرياض'));
const short = copy.channels.find((c) => c.key === 'short');
ok('والمنشور القصير تحت الحدّ', short.chars <= 280 && short.over === false, String(short.chars));

// لا يُكتب ما ليس في السجل: عقار بلا سعر ولا وصف لا يخترع لهما نصًّا.
const bare = adCopy({ type: 'land', city: 'الرياض', purposes: ['sale'] }, { typeLabel: 'أرض' });
const barePortal = bare.channels.find((c) => c.key === 'portal');
ok('وبلا سعر لا يُكتب سعر', !barePortal.text.includes('ريال'), barePortal.text.replace(/\n/g, ' | '));
ok('ولا عبارات تسويقية مخترعة', !/مميز|فرصة|لا تُعوَّض|استثنائي/.test(barePortal.text));
ok('ولا null نصًّا', !barePortal.text.includes('null') && !barePortal.text.includes('undefined'));

const gaps = adGaps({ type: 'land', city: 'الرياض' });
ok('والنواقص تُقال قبل النشر', gaps.length >= 3 && gaps.some((g) => g.includes('سعر')), JSON.stringify(gaps.length));
ok('والعقار المكتمل بلا نواقص', adGaps(property).length === 0, JSON.stringify(adGaps(property)));

// المنشور القصير يُقاس بالحروف لا بالبايتات (العربية حرفان في UTF-8).
const longNotes = adCopy({ ...property, district: 'ح'.repeat(60) }, { typeLabel: 'فلة', company: { phone: '0501234567' } });
const longShort = longNotes.channels.find((c) => c.key === 'short');
ok('والتجاوز يُعلن ولا يُقصّ النصّ', longShort.over === (longShort.chars > 280) && longShort.text.length > 0, String(longShort.chars));
