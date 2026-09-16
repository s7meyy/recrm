// المرحلة ٤٨ — دخلُ الإدارة يُقيَّد، وتقريرُ النشاط يُجمع.
import { feePosted, feeIncomeDraft, ownerStatement, FEE_INCOME_CATEGORY } from '../js/util/management.js';
import { ownerActivity, activityHeadline } from '../js/util/owner-report.js';
import { countOf, daysWord } from '../js/util/format.js';
const ok = (n, c, x = '') => console.log(`${c ? 'PASS' : 'FAIL'} — ${n}${x ? ' :: ' + x : ''}`);
const DAY = 86400000;
const NOW = Date.parse('2026-09-15T00:00:00Z');
const ago = (d) => new Date(NOW - d * DAY).toISOString();
const soon = (d) => new Date(NOW + d * DAY).toISOString();

/* ===== قيدُ أجر الإدارة ===== */
const prop = { id: 'p1', management: { feeType: 'percent', feeValue: 5 } };
const deal = { payments: [{ dueAt: ago(20), paidAt: '2026-08-05T00:00:00Z', amount: 20000 }] };
const st = ownerStatement({ property: prop, deal, month: '2026-08' });
const draft = feeIncomeDraft({ property: prop, statement: st, ownerName: 'عبدالله' });
ok('القيدُ بمبلغ الأجر المحسوب', draft.amount === 1000, String(draft.amount));
ok('وتصنيفُه «إدارة أملاك» ثابتًا فيُبحث به', draft.category === FEE_INCOME_CATEGORY && draft.category === 'management');
ok('ومربوطٌ بالعقار', draft.propertyId === 'p1');
ok('**وتاريخُه آخرُ يومٍ في شهر الكشف لا يوم الضغط** — فأجرُ أغسطس أجرُ أغسطس',
  draft.date.slice(0, 10) === '2026-08-31', draft.date);
ok('وبيانُه يحمل الشهر واسم المالك', draft.note.includes('2026-08') && draft.note.includes('عبدالله'));
ok('ولا قيدَ بلا أجر', feeIncomeDraft({ property: prop, statement: { month: '2026-01', fee: 0 } }) === null);
ok('ولا قيدَ بلا كشف', feeIncomeDraft({}) === null && feeIncomeDraft() === null);
ok('وفبراير يُختم في ٢٨ لا في ٣٠',
  feeIncomeDraft({ property: prop, statement: { month: '2026-02', fee: 100 } }).date.slice(0, 10) === '2026-02-28');

const incomes = [{ propertyId: 'p1', category: 'management', date: '2026-08-31T00:00:00.000Z' }];
ok('والمقيَّدُ يُعرف فلا يُقيَّد مرّتين', feePosted(incomes, 'p1', '2026-08') === true);
ok('وشهرٌ آخر لم يُقيَّد بعد', feePosted(incomes, 'p1', '2026-09') === false);
ok('وعقارٌ آخر كذلك', feePosted(incomes, 'p2', '2026-08') === false);
ok('وإيرادٌ من تصنيفٍ آخر في الشهر نفسِه لا يُحسب قيدًا لهذا',
  feePosted([{ propertyId: 'p1', category: 'rent', date: '2026-08-10' }], 'p1', '2026-08') === false);
ok('وبلا إيراداتٍ أصلًا', feePosted([], 'p1', '2026-08') === false && feePosted(null, 'p1', '2026-08') === false);

/* ===== تقريرُ النشاط ===== */
const property = { id: 'x1', createdAt: ago(120), price: 900000, priceHistory: [
  { at: ago(100), price: 1000000 }, { at: ago(40), price: 900000 },
] };
const showings = [
  { propertyId: 'x1', at: ago(10), status: 'done', impression: 'disliked', reason: 'price', clientId: 'c1' },
  { propertyId: 'x1', at: ago(25), status: 'done', impression: 'liked', clientId: 'c2' },
  { propertyId: 'x1', at: ago(50), status: 'no_show', clientId: 'c3' },
  { propertyId: 'x1', at: soon(3), status: 'scheduled', clientId: 'c4' },
  { propertyId: 'other', at: ago(5), status: 'done', clientId: 'c5' },
];
const matches = [
  { propertyId: 'x1', clientId: 'c6', status: 'not_interested', rejectReason: 'price' },
  { propertyId: 'x1', clientId: 'c7', status: 'new' },
];
const act = ownerActivity({ property, showings, matches, views: 34, now: NOW });
ok('المواعيدُ في النافذة وحدها (٣٠ يومًا): اثنان',
  act.showings.window === 2, String(act.showings.window));
ok('ومعايناتُ العقار كلُّها لا معايناتِ غيره', act.showings.total === 4, String(act.showings.total));
ok('ومن لم يحضر يُعدّ', act.showings.noShow === 1);
ok('والقادمُ يُعدّ قادمًا', act.showings.upcoming === 1);
ok('والانطباعاتُ تُفصَّل', act.impressions.liked === 1 && act.impressions.disliked === 1);
ok('وما قاله السوق يُجمع من المعاينة والرفض معًا',
  act.reasons.find(([k]) => k === 'price')?.[1] === 2, JSON.stringify(act.reasons));
ok('وعددُ الآراء يُعدّ (رأيان في معاينةٍ ورفضٌ واحد)', act.opinions === 3, String(act.opinions));
ok('وثلاثةٌ تبلغ الحدَّ الأدنى للعيّنة — فلا تُوسَم صغيرة', act.reasonsEnough === true);
ok('ورأيان دونه فيُقال إنّها إشارةٌ لا حكم',
  ownerActivity({ property, showings: showings.slice(0, 2), matches: [], now: NOW }).reasonsEnough === false);
ok('والطلباتُ التي طابقته تُعدّ', act.matched === 2);
ok('وتخفيضُ السعر يظهر برحلته', act.priceDrops.length === 1 && act.priceDrops[0].to === 900000);
ok('والمشاهداتُ كما وصلت', act.views === 34);
ok('ومنذ متى مُدرَج', act.daysListed === 120, String(act.daysListed));
ok('وليس صامتًا: آخرُ معاينةٍ قبل عشرة أيام', act.silent === false && act.quietDays === 10);

/* **الصمتُ خبر** */
// معاينةٌ واحدةٌ تمّت قبل سبعين يومًا — خارج نافذة الثلاثين، فالنافذةُ صامتة.
const quiet = ownerActivity({ property, showings: [{ propertyId: 'x1', at: ago(70), status: 'done', clientId: 'c9' }], matches: [], now: NOW });
ok('لا معاينةَ في النافذة = صمت', quiet.silent === true);
const never = ownerActivity({ property, showings: [], matches: [], now: NOW });
ok('ولم تجرِ معاينةٌ قطّ = صمتٌ كذلك، وأيّامُه غيرُ معلومة', never.silent === true && never.quietDays === null);

/* **المشاهداتُ غير المتاحة لا تُكتب صفرًا** */
const noViews = ownerActivity({ property, showings, matches, now: NOW });
ok('وبلا مشاهداتٍ من الخادم: «غير متاحة» لا صفرٌ يُقرأ إهمالًا', noViews.views === null);

/* الجملة */
ok('الجملةُ تقول ما وقع بعدده', activityHeadline(act, { countOf, daysWord }).includes('معاينتان'),
  activityHeadline(act, { countOf, daysWord }));
ok('وتقول الصمتَ صمتًا', activityHeadline(quiet, { countOf, daysWord }).includes('لا معاينةَ منذ'));
ok('ومن لم تجرِ له معاينةٌ قطّ يُقال له ذلك',
  activityHeadline(never, { countOf, daysWord }).includes('لم تجرِ معاينةٌ واحدة'));
ok('وبلا نشاطٍ أصلًا لا تنفجر', activityHeadline(null, { countOf, daysWord }) === '');
ok('وتقريرٌ بلا مدخلاتٍ لا ينفجر', ownerActivity({}).showings.total === 0 && ownerActivity().matched === 0);
