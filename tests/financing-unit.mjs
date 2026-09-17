// المرحلة ٤٩ — التمويل، والعروض المقدَّمة، والتركُّز، والمقارنة بين قرارين.
import {
  FINANCE_STAGES, PAY_METHODS, financeStage, payMethod, isOpenStage,
  idleDays, stalledFinancing, financeSummary, financeLine, STALL_DAYS,
} from '../js/util/financing.js';
import { OFFER_STATUSES, offerStatus, offerSummary, ownerTalkingPoint } from '../js/util/offers.js';
import { concentration } from '../js/util/investor.js';
import { holdVsSell } from '../js/util/finance.js';
import { matchLead } from '../js/util/duplicates.js';
import { memberSteps } from '../js/util/onboarding.js';
import { formatSAR, countOf, daysWord } from '../js/util/format.js';

const ok = (n, c, x = '') => console.log(`${c ? 'PASS' : 'FAIL'} — ${n}${x ? ' :: ' + x : ''}`);
const DAY = 86400000;
const NOW = Date.parse('2026-09-16T10:00:00Z');
const ago = (d) => new Date(NOW - d * DAY).toISOString();

/* ===== ١. مراحل التمويل ===== */
console.log('--- ١. مراحل التمويل ---');
ok('المراحلُ ثمانٍ بترتيب الواقع لا بترتيب الحروف',
  FINANCE_STAGES.length === 8 && FINANCE_STAGES[0].key === 'cash'
  && FINANCE_STAGES.map((f) => f.rank).join(',') === '0,1,2,3,4,5,6,7');
ok('و«نقدًا» مرحلةٌ لا حقلٌ ثانٍ', !!financeStage('cash') && financeStage('cash').open === false);
ok('والمجهولةُ لا يُخترع لها معنًى', financeStage('sdfsdf') === null && financeStage('') === null);
ok('والمفتوحةُ هي التي تنتظر البنك',
  isOpenStage('applied') && isOpenStage('valuation') && !isOpenStage('disbursed') && !isOpenStage('rejected'));
ok('وطرقُ الدفع ثلاثٌ مرتَّبةٌ بقربها من الإبرام',
  PAY_METHODS.map((p) => p.key).join(',') === 'cash,preapproved,finance');
ok('والمجهولةُ منها `null`', payMethod('') === null && !!payMethod('cash'));

/* ===== ٢. كم مضى بلا حركة ===== */
console.log('\n--- ٢. سكوت البنك ---');
ok('يُقاس من `financeAt`', idleDays({ financeAt: ago(9) }, NOW) === 9);
ok('و`null` لمن لا تاريخَ له — لا صفر', idleDays({ financeStage: 'applied' }, NOW) === null);
ok('وتاريخٌ في المستقبل يُقصّ إلى صفرٍ لا يُعاد سالبًا',
  idleDays({ financeAt: new Date(NOW + 5 * DAY).toISOString() }, NOW) === 0);
ok('وتاريخٌ لا يُقرأ يُعامَل كالمجهول', idleDays({ financeAt: 'ليس تاريخًا' }, NOW) === null);

const deals = [
  { id: 'd1', clientId: 'c1', financeStage: 'applied', financeAt: ago(20), financeBank: 'الراجحي' },
  { id: 'd2', clientId: 'c2', financeStage: 'valuation', financeAt: ago(3) },   // تحرّكت
  { id: 'd3', clientId: 'c3', financeStage: 'cash' },                            // لا بنك
  { id: 'd4', clientId: 'c4', financeStage: 'preapproved' },                     // بلا تاريخ
  { id: 'd5', clientId: 'c5', financeStage: 'rejected', financeAt: ago(90) },    // انتهت
  { id: 'd6', clientId: 'c6' },                                                  // لم يُقل عنه شيء
];
const stalled = stalledFinancing(deals, { now: NOW });
ok('الواقفةُ وحدها تُلتقط', stalled.map((r) => r.deal.id).join(',') === 'd1,d4', stalled.map((r) => r.deal.id).join(','));
ok('والأطولُ سكوتًا أوّلًا والمجهولُ آخرًا', stalled[0].deal.id === 'd1' && stalled[1].days === null);
ok('والمتحرّكةُ حديثًا لا تُزعجك', !stalled.some((r) => r.deal.id === 'd2'));
ok('والمرفوضةُ لا تنتظر أحدًا', !stalled.some((r) => r.deal.id === 'd5'));
ok('والحدُّ أسبوعٌ افتراضًا', STALL_DAYS === 7);
ok('ورفعُ الحدّ يُقلّل لا يُكثر', stalledFinancing(deals, { days: 30, now: NOW }).length === 1);

const sum = financeSummary(deals);
ok('الخلاصةُ تعدّ كلَّ حال', sum.cash === 1 && sum.open === 3 && sum.rejected === 1 && sum.unknown === 1,
  JSON.stringify(sum));
ok('**والصمتُ ليس نقدًا**: المجهولُ يُعدّ وحده', sum.unknown === 1 && sum.total === 6);

/* ===== ٣. السطر المقروء ===== */
console.log('\n--- ٣. سطر التمويل ---');
ok('لا سطرَ لمن لا تمويلَ مذكورٌ له', financeLine({ financeStage: '' }, { daysWord }) === '');
ok('والبنكُ يُذكر مع المفتوحة',
  financeLine(deals[0], { daysWord, now: NOW }).includes('الراجحي'), financeLine(deals[0], { daysWord, now: NOW }));
ok('والمدّةُ تُكتب بكلمةٍ عربيّة',
  /منذ/.test(financeLine(deals[0], { daysWord, now: NOW })));
ok('وبلا تاريخٍ يُقال «بلا تاريخ» لا «اليوم»',
  financeLine(deals[3], { daysWord, now: NOW }).includes('بلا تاريخ'));
ok('و«نقدًا» لا بنكَ لها ولا مدّة', financeLine(deals[2], { daysWord, now: NOW }) === 'نقدًا — بلا تمويل');
ok('وحُدِّثت اليوم تُقال اليوم',
  financeLine({ financeStage: 'applied', financeAt: new Date(NOW).toISOString() }, { daysWord, now: NOW }).includes('اليوم'));

/* ===== ٤. العروض المقدَّمة ===== */
console.log('\n--- ٤. العروض ---');
ok('الحالاتُ أربع', OFFER_STATUSES.length === 4);
ok('والمجهولةُ تُردّ إلى «قائم» لا تُرفض', offerStatus('xx').key === 'open');

const property = {
  price: 2500000,
  offers: [
    { id: 'o1', amount: 2300000, status: 'rejected', at: '2026-08-01T00:00:00Z', from: 'أبو فهد' },
    { id: 'o2', amount: 2100000, status: 'rejected', at: '2026-07-01T00:00:00Z' },
    { id: 'o3', amount: 2400000, status: 'expired', at: '2026-09-01T00:00:00Z' },
    { id: 'o4', amount: null, status: 'open' }, // بلا مبلغ
  ],
};
const os = offerSummary(property);
ok('العدّادُ يفصل الحالات', os.total === 4 && os.rejected === 2 && os.expired === 1, JSON.stringify(os.total));
ok('وأعلى عرضٍ مهما كان مصيرُه', os.best === 2400000, String(os.best));
ok('**وأعلى مرفوضٍ وحده** — وهو بيتُ القصيد', os.bestRejected === 2300000, String(os.bestRejected));
ok('والفجوةُ عن المطلوب بالريال وبالنسبة', os.gap === 100000 && os.gapPct === 4, `${os.gap}/${os.gapPct}`);
ok('والأحدثُ أوّلًا', os.rows[0].id === 'o3', os.rows[0].id);
ok('وما لا تاريخَ له آخرًا', os.rows[os.rows.length - 1].id === 'o4');
ok('ولا فجوةَ لعقارٍ بلا سعرٍ مكتوب', offerSummary({ offers: property.offers }).gap === null);

const talk = ownerTalkingPoint(os, { formatSAR, countOf });
ok('والجملةُ تُقال بأرقامٍ لا برأي', /رُفض/.test(talk) && /أعلى مرفوض/.test(talk), talk);
ok('وعقارٌ بلا عروضٍ لا جملةَ له', ownerTalkingPoint(offerSummary({ price: 1 }), { formatSAR, countOf }) === '');

/* ===== ٥. التركُّز ===== */
console.log('\n--- ٥. التركُّز ---');
const rows = [
  { property: { district: 'قرطبة' }, deal: { clientId: 't1' }, actual: 60000, value: 1000000 },
  { property: { district: 'قرطبة' }, deal: { clientId: 't1' }, actual: 60000, value: 1000000 },
  { property: { district: 'الياسمين' }, deal: { clientId: 't2' }, actual: 30000, value: 800000 },
];
const conc = concentration(rows, { nameOf: (id) => ({ t1: 'شركة الراية', t2: 'سعد' })[id] || '' });
ok('يُقاس بالدخل الواقع متى وُجد', conc.basis === 'income');
ok('وحيٌّ واحدٌ يحمل ثلثَي الدخل', conc.topDistrict.label === 'قرطبة' && conc.topDistrict.pct === 80,
  String(conc.topDistrict.pct));
ok('ومستأجرٌ واحدٌ كذلك', conc.topTenant.label === 'شركة الراية' && conc.topTenant.pct === 80);
ok('والمجموعُ يُوزَّع على الأحياء كلِّها',
  Math.round(conc.districts.reduce((a, d) => a + d.pct, 0)) === 100);

const noIncome = concentration([
  { property: { district: 'حطين' }, deal: null, actual: 0, value: 2000000 },
  { property: { district: 'النرجس' }, deal: null, actual: 0, value: 1000000 },
]);
ok('**وبلا دخلٍ واقعٍ يُقاس بالقيمة ويُقال بأيّهما قِيس**', noIncome.basis === 'value'
  && noIncome.topDistrict.pct === 66.7, `${noIncome.basis}/${noIncome.topDistrict?.pct}`);
ok('والمجهولُ لا يُجمع في سلّةٍ تُوهم بتركُّز',
  concentration([{ property: { district: '' }, actual: 5, value: 1 }]).districts.length === 0);
ok('ومحفظةٌ فارغةٌ لا تنكسر', concentration([]).topDistrict === null);

/* ===== ٦. أُبقيه أم أبيعه؟ ===== */
console.log('\n--- ٦. المقارنة بين قرارين ---');
const cmp = holdVsSell({
  currentValue: 2000000, currentRent: 100000, loanBalance: 500000, sellCostPct: 5,
  altPrice: 1300000, altRent: 110000,
});
ok('ما يبقى بعد البيع = الثمن − كلفته − دَينه',
  cmp.netCash === 2000000 - 100000 - 500000, String(cmp.netCash));
ok('والإبقاءُ يُقاس على حقوق الملكية لا على القيمة', cmp.keep.cashIn === 1500000, String(cmp.keep.cashIn));
ok('والبديلُ أعلى دخلًا هنا', cmp.better === 'sell' && cmp.gap === 10000, `${cmp.better}/${cmp.gap}`);
ok('والعائدان محسوبان', Math.round(cmp.keep.cashYield * 10) / 10 === 6.7
  && Math.round(cmp.sell.cashYield * 10) / 10 === 8.5, `${cmp.keep.cashYield}/${cmp.sell.cashYield}`);
ok('**والحكمُ بالريال لا بالنسبة**: بديلٌ أعلى نسبةً وأقلُّ دخلًا يخسر',
  holdVsSell({ currentValue: 2000000, currentRent: 120000, altPrice: 500000, altRent: 40000 }).better === 'keep');
ok('وبيعٌ لا يغطّي دَينه لا يُخرج نقدًا سالبًا',
  holdVsSell({ currentValue: 1000000, currentRent: 50000, loanBalance: 3000000, altPrice: 1, altRent: 1 }).netCash === 0);
ok('وبلا بديلٍ صالحٍ لا يُخترع عمودٌ ثانٍ',
  holdVsSell({ currentValue: 1000000, currentRent: 50000, altPrice: 0, altRent: 0 }).sell === null);
ok('وبلا عقارٍ حاليٍّ لا مقارنةَ أصلًا', holdVsSell({ currentValue: 0, currentRent: 0 }) === null);

/* ===== ٧. الوارد: أغريبٌ أم عميلُك؟ ===== */
console.log('\n--- ٧. الطلب الوارد ---');
const clients = [
  { id: 'c1', name: 'تركي الحارثي', phone: '0512223344' },
  { id: 'c2', name: 'محمد', phone: '', phone2: '0555555555' },
];
ok('الجوالُ يكشف عميلَك', matchLead({ phone: '0512223344' }, clients)?.id === 'c1');
ok('والصيغةُ الدوليّةُ تُطبَّع فتُطابق', matchLead({ phone: '+966512223344' }, clients)?.id === 'c1');
ok('والجوالُ الثاني يُفحص كذلك', matchLead({ phone: '0555555555' }, clients)?.id === 'c2');
ok('وغريبٌ يبقى غريبًا', matchLead({ phone: '0500000000' }, clients) === null);
ok('**والاسمُ وحدَه لا يكفي** — وادّعاءُ معرفةٍ خاطئةٍ أسوأُ من لا ادّعاء',
  matchLead({ name: 'تركي الحارثي', phone: '' }, clients) === null);

/* ===== ٨. بداية الموظّف ===== */
console.log('\n--- ٨. ما أُسند إليه ---');
const steps = memberSteps({
  meId: 'm1',
  properties: [{ assignedTo: 'm1' }, { assignedTo: 'm2' }],
  clients: [{ id: 'a', assignedTo: 'm1' }, { id: 'b', assignedTo: 'm1' }],
  requests: [{ assignedTo: 'm1', status: 'active' }],
  deals: [{ assignedTo: 'm1', date: '2026-09-02' }],
  goal: { dealsPerMonth: 2 },
  lastContactOf: (c) => (c.id === 'a' ? '2026-09-01T00:00:00Z' : null),
  now: NOW,
});
ok('الخطواتُ أربع', steps.length === 4);
ok('وتُقرأ ممّا أُسند إليه هو لا من حال المكتب', steps[0].count === 1, String(steps[0].count));
ok('و«لم يتواصل» تعني بلا تواصلٍ أصلًا', steps[1].count === 1 && steps[1].done === false);
ok('وطلبٌ نشطٌ يُنجز خطوتَه', steps[2].done === true);
ok('والهدفُ يُقاس بصفقات الشهر المسندة إليه', /أنجزتَ 1/.test(steps[3].title), steps[3].title);
ok('ولم يبلغ هدفَه بعد', steps[3].done === false);
ok('ومن لا هدفَ له يُقال له ذلك',
  memberSteps({ meId: 'm1', now: NOW })[3].title.includes('لا هدف'));
