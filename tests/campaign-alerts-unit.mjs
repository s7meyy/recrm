// المرحلة ٤٩ — الحملات، وقواعد التنبيه، والمطالبة بالمتأخّر.
import { campaignReport, campaignLine, isRunning, CAMPAIGN_CHANNELS } from '../js/util/campaigns.js';
import {
  ALERT_RULES, DEFAULT_ALERT_RULES, ruleOn, evaluateRules, endingLeases, openMaintenance,
} from '../js/util/alert-rules.js';
import { DUNNING_TONES, toneFor, dunningDraft, dunningList } from '../js/util/dunning.js';
import { formatSAR, countOf, daysWord, formatDate } from '../js/util/format.js';

const ok = (n, c, x = '') => console.log(`${c ? 'PASS' : 'FAIL'} — ${n}${x ? ' :: ' + x : ''}`);
const DAY = 86400000;
const NOW = Date.parse('2026-09-16T10:00:00Z');
const ago = (d) => new Date(NOW - d * DAY).toISOString();
const ahead = (d) => new Date(NOW + d * DAY).toISOString();

/* ===== ١. الحملات ===== */
console.log('--- ١. الحملات ---');
ok('القنواتُ اقتراحاتٌ لا حصر', CAMPAIGN_CHANNELS.length > 3 && CAMPAIGN_CHANNELS.includes('أخرى'));
ok('حملةٌ بلا تاريخين جاريةٌ دائمًا', isRunning({}, NOW));
ok('وقبل بدايتها ليست جارية', !isRunning({ startAt: ahead(3) }, NOW));
ok('وبعد نهايتها ليست جارية', !isRunning({ endAt: ago(3) }, NOW));
ok('**واليومُ الأخيرُ داخلٌ فيها**: من كتب «إلى اليوم» يقصد نهايتَه',
  isRunning({ endAt: new Date(NOW).toISOString().slice(0, 10) }, NOW));

const campaigns = [
  { key: 'c1', label: 'فلل قرطبة', channel: 'سناب', budget: 3000, startAt: ago(20), endAt: ago(5) },
  { key: 'c2', label: 'شقق النرجس', channel: 'سناب', budget: null, startAt: ago(3) },
];
const clients = [
  { id: 'a', campaign: 'c1', tags: ['جادّ'], contacts: [] },
  { id: 'b', campaign: 'c1', tags: [], contacts: [{ id: 'x' }] },
  { id: 'c', campaign: 'c1', tags: [], contacts: [] },
  { id: 'd', campaign: 'c2', tags: [], contacts: [] },
  { id: 'e', campaign: 'محذوفة', tags: [], contacts: [] }, // حملةٌ لا وجود لها
  { id: 'f', campaign: '', tags: [], contacts: [] },
];
const report = campaignReport({
  campaigns, clients,
  requests: [{ clientId: 'a' }, { clientId: 'e' }],
  deals: [{ clientId: 'a', commission: 30000 }],
  now: NOW,
});
const c1 = report.rows.find((r) => r.campaign.key === 'c1');
const c2 = report.rows.find((r) => r.campaign.key === 'c2');
ok('الطلباتُ تُنسب إلى حملتها', c1.clients === 3 && c2.clients === 1, `${c1.clients}/${c2.clients}`);
ok('**والجادُّ محسوبٌ من البيانات لا من ظنّ**', c1.serious === 2, String(c1.serious));
ok('والصفقةُ تُنسب إليها عبر عميلها', c1.deals === 1 && c1.commission === 30000);
ok('وعميلٌ بحملةٍ حُذفت لا يُنسب إلى غيرها', report.totals.clients === 4, String(report.totals.clients));
ok('وكلفةُ الطلب تُقسم على الوارد', Math.round(c1.costPerLead) === 1000, String(c1.costPerLead));
ok('**وبلا ميزانيةٍ مكتوبةٍ `null` لا صفر** — مجهولةُ الكلفة لا مجّانيّة',
  c2.costPerLead === null && c2.budget === 0, String(c2.costPerLead));
ok('ونسبةُ الجادّ محسوبة', Math.round(c1.seriousRate * 100) === 67, String(c1.seriousRate));
ok('**والجاريةُ أوّلًا** — هي التي يُتصرَّف فيها اليوم', report.rows[0].campaign.key === 'c2');
ok('والصافي = العمولة − الميزانية', c1.net === 27000, String(c1.net));

const line = campaignLine(c1, { formatSAR, countOf });
ok('والسطرُ يُحاسَب به المسوّقُ ويُدافع به', /طلب/.test(line) && /كلفةُ الطلب/.test(line), line);
ok('وحملةٌ لم يدخل منها أحدٌ لا سطرَ لها',
  campaignLine({ clients: 0 }, { formatSAR, countOf }) === '');

/* ===== ٢. قواعد التنبيه ===== */
console.log('\n--- ٢. قواعد التنبيه ---');
ok('القواعدُ سبعٌ لكلٍّ مفتاحُ تشغيل', ALERT_RULES.length === 8, String(ALERT_RULES.length));
ok('والمبنيُّ قبل هذه المرحلة يبقى مشتغلًا',
  DEFAULT_ALERT_RULES.staleClient === true && DEFAULT_ALERT_RULES.dueTask === true);
ok('وما يخصّ دورًا بعينه يبدأ مطفأً',
  DEFAULT_ALERT_RULES.openMaintenance === false && DEFAULT_ALERT_RULES.showingFeedback === false);
ok('**والمفتاحُ الغائبُ يأخذ افتراضيّه** — فقاعدةٌ جديدةٌ لا تُطفَأ بصمت',
  ruleOn({}, 'staleClient') === true && ruleOn({}, 'openMaintenance') === false);
ok('وما أطفأه صاحبُه يبقى مطفأً', ruleOn({ staleClient: false }, 'staleClient') === false);

const leases = endingLeases([
  { id: 'L1', leaseEndAt: ahead(10) },
  { id: 'L2', leaseEndAt: ahead(40) },   // بعيد
  { id: 'L3', leaseEndAt: ago(5) },      // انتهى
  { id: 'L4' },
], { now: NOW });
ok('العقودُ التي توشك وحدها', leases.length === 1 && leases[0].deal.id === 'L1', String(leases.length));

const maint = openMaintenance([
  { id: 'p1', district: 'قرطبة', maintenance: [
    { id: 'm1', status: 'open', at: ago(10), what: 'مكيّف' },
    { id: 'm2', status: 'open', at: ago(2), what: 'باب' },     // جديد
    { id: 'm3', status: 'done', at: ago(30), what: 'مصعد' },   // أُنجز
    { id: 'm4', status: 'open', what: 'تسريب' },               // بلا تاريخ
  ] },
], { now: NOW });
ok('المفتوحُ منذ أكثرَ من أسبوع', maint.some((m) => m.item.id === 'm1'));
ok('والجديدُ لا يُزعجك', !maint.some((m) => m.item.id === 'm2'));
ok('والمُنجزُ خرج', !maint.some((m) => m.item.id === 'm3'));
ok('**وبلا تاريخٍ يُعدّ قديمًا لا جديدًا**', maint.some((m) => m.item.id === 'm4'));
ok('والمجهولُ آخرًا فلا يتقدّم على معلوم', maint[maint.length - 1].item.id === 'm4');

const alerts = evaluateRules({
  clients: [{ id: 'k1', name: 'سعد', stage: 'new' }],
  tasks: [{ id: 't1', title: 'اتصل', dueAt: ago(1) }],
  deals: [
    { id: 'L1', leaseEndAt: ahead(10) },
    { id: 'F1', financeStage: 'applied', financeAt: ago(20) },
  ],
  properties: [{ id: 'P1', district: 'حطين', offPlan: true, deliveryAt: ahead(12) }],
  invoices: [],
  showings: [],
}, { enabled: {}, countOf, now: NOW, lastContactOf: () => null });

const byRule = (r) => alerts.filter((a) => a.rule === r);
ok('العميلُ المتأخّر يُنبَّه عليه', byRule('staleClient').length === 1);
ok('والمهمّةُ المستحقّة', byRule('dueTask').length === 1);
ok('والعقدُ الذي ينتهي', byRule('leaseEnding').length === 1);
ok('والتمويلُ الواقف', byRule('financeStalled').length === 1);
ok('والتسليمُ المقترب', byRule('delivery').length === 1, JSON.stringify(byRule('delivery')[0]?.body));
ok('والمطفأةُ لا تُنتج شيئًا', byRule('openMaintenance').length === 0 && byRule('showingFeedback').length === 0);
ok('**والمعرّفُ ثابتٌ بين فحصٍ وفحص** فلا يتكرّر التنبيه',
  byRule('financeStalled')[0].id === 'fin:F1:applied');
ok('وكلُّ تنبيهٍ يعرف إلى أين يذهب', alerts.every((a) => a.hash.startsWith('#/')));

const offAll = evaluateRules({ clients: [{ id: 'z' }], tasks: [{ id: 'q', dueAt: ago(1), title: 'x' }] },
  { enabled: { staleClient: false, dueTask: false }, countOf, now: NOW });
ok('وإطفاءُ القاعدة يُسكتها', offAll.length === 0);

/* ===== ٣. المطالبة بالمتأخّر ===== */
console.log('\n--- ٣. المطالبة ---');
ok('النبراتُ خمسٌ بعدد الشرائح', DUNNING_TONES.length === 5);
ok('**والنبرةُ تتبع الشريحة**: لطيفةٌ في الشهر الأوّل وصريحةٌ بعد التسعين',
  toneFor('d30').lead === 'تذكير' && toneFor('older').lead === 'مطالبة أخيرة');
ok('والمجهولةُ تُردّ إلى اللطيفة — فالشدّةُ لا تُخمَّن', toneFor('sdf').bucket === 'd30');

const draft = dunningDraft({
  row: { kind: 'invoice', number: 'F-9', remaining: 12000, days: 45, bucket: 'd60', basis: '2026-08-01' },
  client: { name: 'نورة' }, company: { name: 'مكتب سائح' }, user: { name: 'سعد' },
  daysWord, formatDate,
});
ok('النصُّ يحمل الاسمَ والمبلغَ والمدّة',
  /نورة/.test(draft.text) && /12/.test(draft.text) && /45|يوم/.test(draft.text), draft.text.slice(0, 60));
ok('ويُسمّي المستحقَّ باسمه لا برمزه', /الفاتورة F-9/.test(draft.text));
ok('والتوقيعُ من المكتب ومن صاحبه', /سعد/.test(draft.text) && /مكتب سائح/.test(draft.text));
ok('وبلا اسمٍ لا يُخترع اسم', !/undefined|null/.test(
  dunningDraft({ row: { kind: 'payment', remaining: 500, days: 5, bucket: 'd30' } }).text));
ok('وبلا تاريخٍ يُقال «سابقًا» لا يُخترع يوم',
  /سابقًا/.test(dunningDraft({ row: { kind: 'commission', remaining: 1, days: 3, bucket: 'd30' } }).text));

const list = dunningList([
  { id: 'r1', clientId: 'c1', days: 40, remaining: 5000, bucket: 'd60' },
  { id: 'r2', clientId: 'c2', days: 90, remaining: 7000, bucket: 'older' },
  { id: 'r3', clientId: 'c3', days: 10, remaining: 900, bucket: 'd30' },   // بلا جوال
  { id: 'r4', clientId: 'c1', days: -3, remaining: 100, bucket: 'current' }, // لم يستحقّ
  { id: 'r5', clientId: 'c1', days: 5, remaining: 0, bucket: 'd30' },        // لا بقيّة
], new Map([
  ['c1', { id: 'c1', name: 'أ', phone: '0501111111' }],
  ['c2', { id: 'c2', name: 'ب', phone: '0502222222' }],
  ['c3', { id: 'c3', name: 'ج', phone: '' }],
]));
ok('المتأخّرُ وحده يُطالَب', list.map((x) => x.row.id).join(',') === 'r2,r1', list.map((x) => x.row.id).join(','));
ok('**ومن لا جوالَ له لا يُدرَج** — زرُّ رسالةٍ لا تُرسَل وعدٌ كاذب', !list.some((x) => x.row.id === 'r3'));
ok('وما لم يستحقّ لا يُطالَب به', !list.some((x) => x.row.id === 'r4'));
ok('وما لا بقيّةَ فيه ليس مستحقًّا', !list.some((x) => x.row.id === 'r5'));
ok('والأطولُ تأخّرًا أوّلًا', list[0].row.days === 90);
ok('وجوالُ الفاتورة يكفي لمن لا ملفَّ له',
  dunningList([{ id: 'x', clientId: null, days: 9, remaining: 10, bucket: 'd30', invoice: { clientPhone: '0503333333' } }], new Map()).length === 1);
