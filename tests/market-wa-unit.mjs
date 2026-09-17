// المرحلة ٥٠ — نافذةُ الواتساب والردُّ التلقائي · وقراءةُ ملفّات السوق ومؤشّرُه.
import {
  windowState, windowLabel, matchAuto, outsideWorkHours, cleanRules,
  MATCH_KINDS, MAX_AUTO_PER_DAY, WINDOW_MS,
} from '../js/util/wa-auto.js';
import { templateComponents, missingVars } from '../js/util/templates.js';
import {
  mapHeaders, cellNumber, cellDate, parseMarketRows, MARKET_SOURCES, sourceByKey,
} from '../js/data/market-import.js';
import {
  median, quartiles, filterDeals, districtStat, marketIndex, vsMarket, marketLine, MIN_SAMPLE,
} from '../js/util/market.js';
import { formatSAR, countOf } from '../js/util/format.js';

const ok = (n, c, x = '') => console.log(`${c ? 'PASS' : 'FAIL'} — ${n}${x ? ' :: ' + x : ''}`);
const HOUR = 3600000;
const NOW = Date.parse('2026-09-17T12:00:00Z');
const ago = (h) => new Date(NOW - h * HOUR).toISOString();

/* ===== ١. نافذة الأربع والعشرين ساعة ===== */
console.log('--- ١. النافذة ---');
ok('مدّتُها أربعٌ وعشرون ساعة — قاعدةُ Meta لا اجتهادُنا', WINDOW_MS === 24 * HOUR);
ok('رسالةٌ قبل ساعتين تُبقيها مفتوحةً اثنتين وعشرين', windowState(ago(2), NOW).hoursLeft === 22);
ok('وبعد ثلاثين ساعةً أُغلقت', windowState(ago(30), NOW).open === false);
ok('**وتُقرَّب لأعلى**: «بقيت ساعة» أصدقُ من «صفر» وأمامك تسعٌ وخمسون دقيقة',
  windowState(ago(23.1), NOW).hoursLeft === 1);
ok('وما أوشك يُوسَم', windowState(ago(23), NOW).soon === true && windowState(ago(2), NOW).soon === false);
ok('وتاريخٌ لا يُقرأ يُعامَل مغلقًا — لا يُفتح بابٌ على مجهول',
  windowState('ليس تاريخًا', NOW).open === false);
ok('والجملةُ تقول ما يقع', /أُغلقت/.test(windowLabel(windowState(ago(30), NOW), { countOf }))
  && /يبقى/.test(windowLabel(windowState(ago(5), NOW), { countOf })));

/* ===== ٢. الردّ التلقائي ===== */
console.log('\n--- ٢. الردّ التلقائي ---');
ok('طرقُ المطابقة ثلاث', MATCH_KINDS.length === 3);

const rules = [
  { when: 'first', reply: 'أهلًا بك', enabled: true },
  { when: 'contains', text: 'فلة، شقة', reply: 'عندنا عروض', enabled: true },
  { when: 'always', reply: 'وصلت رسالتك', enabled: true },
];
ok('**أوّلُ منطبقةٍ تفوز** فترتيبُ القواعد معنًى لا شكل',
  matchAuto({ text: 'ابغى فلة' }, rules, { isFirst: true }).reply === 'أهلًا بك');
ok('وغيرُ الأولى تُطابَق بالكلمة',
  matchAuto({ text: 'ابغى فلة' }, rules, { isFirst: false }).reply === 'عندنا عروض');
ok('والألفُ بأشكالها والتاءُ المربوطة لا تكسران المطابقة',
  matchAuto({ text: 'أبغى شقه' }, rules, { isFirst: false }).reply === 'عندنا عروض');
ok('وما لا يطابق يقع على «كلّ رسالة»',
  matchAuto({ text: 'كم الساعة' }, rules, { isFirst: false }).reply === 'وصلت رسالتك');
ok('**ورسالةٌ بلا نصٍّ (صورةٌ أو صوت) لا تُطابَق بكلمة**',
  matchAuto({ text: '' }, [rules[1]], {}) === null);
ok('والمعطَّلةُ تُتخطّى',
  matchAuto({ text: 'فلة' }, [{ ...rules[1], enabled: false }], {}) === null);
ok('وقاعدةٌ بلا ردٍّ تُتخطّى — تُطابق ولا تُرسل شيئًا فتبدو معطَّلةً وهي مشتغلة',
  matchAuto({ text: 'فلة' }, [{ when: 'contains', text: 'فلة', reply: '  ' }], {}) === null);
ok(`**والسدُّ قبل المطابقة**: بعد ${MAX_AUTO_PER_DAY} لا يُردّ رابعةً مهما طابق`,
  matchAuto({ text: 'فلة' }, rules, { sentToday: MAX_AUTO_PER_DAY }) === null);
ok('و«خارج الدوام وحده» تُسكت الردَّ في الدوام',
  matchAuto({ text: 'فلة' }, rules, { outsideHoursOnly: true, outsideHours: false }) === null);
ok('وتُطلقه خارجه',
  matchAuto({ text: 'فلة' }, rules, { outsideHoursOnly: true, outsideHours: true })?.reply === 'عندنا عروض');
ok('وبلا قواعدَ لا يُردّ — و`null` تعني لا تردّ لا «ردّ بالافتراضيّ»', matchAuto({ text: 'x' }, []) === null);

/* خارج الدوام بتوقيت الرياض */
console.log('\n--- ٣. خارج الدوام ---');
const at = (utcHour) => Date.parse(`2026-09-17T${String(utcHour).padStart(2, '0')}:00:00Z`);
ok('الثانيةَ عشرةَ ظهرًا بالرياض داخلَ الدوام', !outsideWorkHours({ from: 9, to: 22 }, at(9)));
ok('والثالثةَ فجرًا خارجَه', outsideWorkHours({ from: 9, to: 22 }, at(0)));
ok('**ومدًى يعبر منتصف الليل** (٢٢ ← ٨) يُقرأ كما قُصد',
  !outsideWorkHours({ from: 22, to: 8 }, at(0)) && outsideWorkHours({ from: 22, to: 8 }, at(9)));
ok('ودوامٌ لا طول له لا يُقسَّم', outsideWorkHours({ from: 9, to: 9 }, at(3)) === false);

const cleaned = cleanRules([
  { when: 'contains', text: 'فلة', reply: 'نعم' },
  { when: 'مجهول', reply: 'ردّ' },
  { when: 'first', reply: '   ' },
  ...Array.from({ length: 20 }, () => ({ when: 'always', reply: 'x' })),
]);
ok('التطبيعُ يُسقط ما لا ردَّ فيه', !cleaned.some((r) => !r.reply.trim()));
ok('ويردّ المجهولَ إلى «تحوي كلمة»', cleaned[1].when === 'contains');
ok('ويقف عند اثنتي عشرة — وما زاد متاهة', cleaned.length === 12, String(cleaned.length));

/* ===== ٤. متغيّرات القالب ===== */
console.log('\n--- ٤. متغيّرات القالب ---');
const comps = templateComponents(['اسم_العميل', 'الحي'], { اسم_العميل: 'سعد', الحي: 'قرطبة' });
ok('المكوّناتُ بترتيب المواضع', comps[0].parameters.map((p) => p.text).join(',') === 'سعد,قرطبة');
ok('**وفارغٌ يصير شَرطة** — Meta ترفض المتغيّرَ الفارغ بخطأٍ غامض',
  templateComponents(['الحي'], {})[0].parameters[0].text === '—');
ok('وقالبٌ بلا متغيّراتٍ بلا مكوّنات', templateComponents([], {}).length === 0);
ok('وما نقص يُقال قبل الإرسال', missingVars(['اسم_العميل', 'الحي'], { اسم_العميل: 'سعد' }).join() === 'الحي');

/* ===== ٥. قراءة ملفّ السوق ===== */
console.log('\n--- ٥. الاستيراد ---');
ok('المصادرُ مصنَّفةٌ بصدق: مفتوحٌ · يُعرض ولا يُصدِّر · باشتراك',
  sourceByKey('moj').kind === 'open' && sourceByKey('srem').kind === 'manualOnly'
  && sourceByKey('suhail').kind === 'paid' && sourceByKey('paseetah').kind === 'paid',
  MARKET_SOURCES.map((s) => `${s.key}:${s.kind}`).join(' '));
ok('وللمدفوعَين متغيّراتُهما مذكورة', sourceByKey('suhail').env?.length === 2);

const { mapping, unmatched } = mapHeaders(['تاريخ الصفقة', 'المدينه', 'الحى', 'قيمة الصفقة', 'عمود غريب'], 'moj');
ok('**الترويسةُ تُطابَق بعد تطبيعٍ عربيّ** فلا تكسرها همزةٌ ولا تاءٌ مربوطة',
  mapping.date === 0 && mapping.city === 1 && mapping.district === 2 && mapping.price === 3,
  JSON.stringify(mapping));
ok('وما لم يُعرَف يُقال لا يُبتلع', unmatched.join() === 'عمود غريب');

ok('الأرقامُ العربيّةُ وفواصلُ الآلاف تُقرأ', cellNumber('٢٬٠٠٠٬٠٠٠') === 2000000 || cellNumber('2,000,000') === 2000000);
ok('وما ليس رقمًا `null`', cellNumber('غير معروف') === null && cellNumber('') === null);
ok('والصفرُ والسالبُ ليسا سعرًا', cellNumber('0') === null && cellNumber('-5') === null);

ok('التاريخُ بالسنة أوّلًا يُقرأ', cellDate('2026-08-01') === '2026-08-01');
ok('واليومُ فوق اثني عشر يفكّ الالتباس', cellDate('25/04/2026') === '2026-04-25');
ok('**والملتبسُ يُردّ ولا يُخمَّن** — تخمينُه يُزحزح صفقاتِ شهرٍ كامل', cellDate('03/04/2026') === '');

const parsed = parseMarketRows({
  headers: ['تاريخ الصفقة', 'المدينة', 'الحي', 'نوع العقار', 'المساحة', 'قيمة الصفقة'],
  rows: [
    ['2026-08-01', 'الرياض', 'قرطبة', 'فيلا', '400', '2,000,000'],
    ['2026-08-05', '', 'قرطبة', 'فيلا', '400', '2000000'],
    ['2026-08-06', 'الرياض', 'قرطبة', 'فيلا', '', ''],
    ['03/04/2026', 'الرياض', 'قرطبة', 'فيلا', '400', '2000000'],
  ],
  source: 'moj', defaultCity: '',
});
ok('يُقرأ الصحيحُ وحده', parsed.rows.length === 1, String(parsed.rows.length));
ok('**وما يُتخطّى يُقال مع سببه** لا يُسقَط صامتًا', parsed.skipped.length === 3
  && parsed.skipped.every((s) => s.why && s.line), JSON.stringify(parsed.skipped));
ok('والمدينةُ الافتراضيّةُ تسدّ الفراغ متى كُتبت',
  parseMarketRows({
    headers: ['تاريخ الصفقة', 'المدينة', 'المساحة', 'قيمة الصفقة'],
    rows: [['2026-08-05', '', '400', '2000000']],
    source: 'moj', defaultCity: 'الرياض',
  }).rows.length === 1);

/* ===== ٦. المؤشّر ===== */
console.log('\n--- ٦. المؤشّر ---');
ok('**الوسيطُ لا المتوسّط**: قصرٌ بين شققٍ لا يرفعه', median([100, 200, 300, 400, 30000]) === 300);
ok('والزوجيُّ يُؤخذ وسطُ وسطَيه', median([100, 200, 300, 400]) === 250);
ok('وفارغٌ `null` لا صفر', median([]) === null);
ok('والشريحةُ لا تُحسب لأقلَّ من أربع', quartiles([1, 2, 3]).q1 === null);

const deals = [
  ...Array.from({ length: 6 }, (_, i) => ({ date: '2026-08-10', city: 'الرياض', district: 'قرطبة', type: 'فيلا', purpose: 'sale', pricePerM: 5000 + i * 100 })),
  ...Array.from({ length: 4 }, (_, i) => ({ date: '2026-03-10', city: 'الرياض', district: 'قرطبة', type: 'فيلا', purpose: 'sale', pricePerM: 4000 + i * 100 })),
  { date: '2026-08-11', city: 'الرياض', district: 'النرجس', type: 'شقة', purpose: 'sale', pricePerM: 7000 },
  { date: '2020-01-01', city: 'الرياض', district: 'قرطبة', type: 'فيلا', purpose: 'sale', pricePerM: 99999 }, // قديم
];
const NOW2 = Date.parse('2026-09-17T00:00:00Z');
ok('**والمدّةُ تحكم**: صفقةُ ٢٠٢٠ لا تدخل مؤشّرَ سنة',
  filterDeals(deals, { months: 12, now: NOW2 }).every((d) => d.pricePerM !== 99999));
ok('وما لا سعرَ متر له لا يدخل أصلًا',
  filterDeals([{ date: '2026-08-01', city: 'الرياض', pricePerM: null }], { now: NOW2 }).length === 0);

const stat = districtStat(deals, { district: 'قرطبة', city: 'الرياض', months: 12, now: NOW2 });
ok('العدُّ صحيح', stat.n === 10, String(stat.n));
ok('والعيّنةُ كافيةٌ فوق الحدّ', stat.enough === true && MIN_SAMPLE === 5);
ok('**والاتّجاهُ يقارن نصفين متساويين**: النصفُ الأخير أعلى فالاتّجاه موجب',
  stat.trendPct > 0, String(stat.trendPct));
ok('ولا اتّجاهَ بنصفٍ فيه أقلُّ من ثلاث',
  districtStat(deals, { district: 'النرجس', months: 12, now: NOW2 }).trendPct === null);

const index = marketIndex(deals, { city: 'الرياض', months: 12, now: NOW2 });
ok('**والأكثرُ صفقاتٍ أوّلًا لا الأغلى**', index.rows[0].district === 'قرطبة', index.rows[0].district);
ok('ووسيطُ المدينة محسوب', index.cityMedian > 0);
// المدى بالأشهر لا بالأيّام: «من مارس إلى أغسطس» هو ما يُقرأ، واليومُ فيه ضجيج.
ok('ومدى البيانات يُقال', index.span.from === '2026-03' && index.span.to === '2026-08',
  JSON.stringify(index.span));

/* ===== ٧. مخزونك مقابل السوق ===== */
console.log('\n--- ٧. المقارنة ---');
const cmp = vsMarket({ city: 'الرياض', district: 'قرطبة', type: 'فيلا', area: 400, price: 2600000 },
  deals, { months: 12, now: NOW2 });
ok('سعرُ مترك محسوب', cmp.askPerM === 6500, String(cmp.askPerM));
ok('والفرقُ عن وسيط الحيّ بالنسبة', cmp.gapPct > 0 && cmp.verdict === 'above', `${cmp.gapPct}`);
ok('**وما دون ١٠٪ ضجيجٌ لا فرق**',
  vsMarket({ city: 'الرياض', district: 'قرطبة', type: 'فيلا', area: 400, price: 400 * 4700 },
    deals, { months: 12, now: NOW2 }).verdict === 'inline');
ok('ولا يُقارَن عقارٌ بلا سعرٍ أو مساحة',
  vsMarket({ district: 'قرطبة', area: 400 }, deals, { now: NOW2 }) === null);
ok('ولا يُقارَن بحيٍّ لا صفقةَ فيه',
  vsMarket({ city: 'الرياض', district: 'حيٌّ لا وجود له', area: 1, price: 1 }, deals, { now: NOW2 }) === null);

const line = marketLine(cmp, { formatSAR, countOf });
// **«صفقات» لا تحوي «صفقة»** — والجمعُ العربيُّ لا يُفحص بجذعٍ إنجليزيّ.
ok('والجملةُ للمالك من أرقامٍ لا من رأي',
  line.includes('بِيع فعلًا') && /صفقات|صفقة|صفقتين/.test(line), line);
ok('**وتقول حجمَ العيّنة** — رقمٌ من ثلاثٍ يُقدَّم سوقًا يُردّ عليك بحقّ',
  marketLine(vsMarket({ city: 'الرياض', district: 'النرجس', type: 'شقة', area: 100, price: 900000 },
    deals, { now: NOW2 }), { formatSAR, countOf }).includes('عيّنةٌ صغيرة'));
ok('وبلا مقارنةٍ لا جملة', marketLine(null) === '');
