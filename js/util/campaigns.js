/**
 * **الحملات التسويقيّة** (المرحلة ٤٩) — الدورُ الذي كان بلا صفحة.
 *
 * `sources.js` تقيس **المصدر**: كم كلّفك «سناب»، وكم عاد منه. وهذا قياسُ **قناةٍ** لا
 * قياسُ حملة. والمسوّقُ لا يعمل بالقنوات — يعمل بالحملات: «حملةُ فلل قرطبة · من ١
 * إلى ١٥ · بميزانية ٣٠٠٠». وحملتان على القناة نفسِها تختلفان كلَّ اختلاف، وتذوبان
 * في رقمٍ واحد.
 *
 * **والحملةُ إعدادٌ لا مخزنٌ جديد**: مخزنٌ يستلزم رفعَ `DB_VERSION` وهجرةً وشاشةَ إدارة،
 * والحملةُ أربعةُ حقولٍ تُكتب مرّةً وتُقرأ شهرًا. وتُخزَّن حيث تُخزَّن القوائمُ والقوالب.
 *
 * والنسبةُ إليها تكون **بحقلٍ على العميل** (`campaign`): من دخل من حملةٍ يحمل مفتاحَها،
 * وطلباتُه وصفقاتُه تُنسب إليها من خلاله — كما يفعل تقريرُ المصادر تمامًا.
 *
 * دوالُّ خالصة: لا تخزين ولا شبكة.
 */

import { netCommission } from '../data/schema.js';

/** قنواتُ الحملة المعروفة — نصٌّ حرٌّ بعدها لمن له قناةٌ غيرها. */
export const CAMPAIGN_CHANNELS = ['سناب', 'تويتر (X)', 'إنستقرام', 'تيك توك', 'جوجل', 'لوحات طرق', 'رسائل', 'أخرى'];

const num = (v) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : 0);

/** أهي جاريةٌ الآن؟ حملةٌ بلا تاريخين جاريةٌ دائمًا — ولا يُفترض لها انتهاء. */
export function isRunning(campaign, now = Date.now()) {
  const from = campaign?.startAt ? new Date(campaign.startAt).getTime() : null;
  const to = campaign?.endAt ? new Date(campaign.endAt).getTime() : null;
  if (from != null && Number.isFinite(from) && now < from) return false;
  // اليومُ الأخيرُ داخلٌ في الحملة: من كتب «إلى ١٥» يقصد نهايةَ الخامس عشر لا بدايتَه.
  if (to != null && Number.isFinite(to) && now > to + 86400000) return false;
  return true;
}

/**
 * أداءُ كلّ حملة: كم طلبًا جلبت، وكم منها جادّ، وكم صفقة، وبكم كلّفك الطلبُ الواحد.
 *
 * **و«الجادّ» يُقرأ من البيانات لا من الظنّ**: طلبٌ حالتُه «نشط» ولصاحبه تواصلٌ مسجَّل،
 * أو مصنَّفٌ «جادّ». وهو ما يفرّق بين حملةٍ جلبت أربعةَ عشرَ رقمًا وحملةٍ جلبت مشترين.
 *
 * `costPerLead` و`costPerDeal` **`null` بلا ميزانيةٍ مكتوبة** — لا صفر: حملةٌ بلا
 * ميزانيةٍ مسجَّلة ليست مجّانيّة، هي مجهولةُ الكلفة، والفرقُ بينهما هو الفرق كلُّه.
 */
export function campaignReport({ campaigns = [], clients = [], requests = [], deals = [], now = Date.now() } = {}) {
  const byKey = new Map(campaigns.map((c) => [c.key, {
    campaign: c,
    clients: 0, serious: 0, requests: 0, deals: 0, commission: 0,
    budget: num(c.budget),
    running: isRunning(c, now),
  }]));

  const campaignOf = new Map();
  for (const c of clients) {
    const row = byKey.get(c.campaign);
    if (!row) continue; // عميلٌ بحملةٍ حُذفت لا يُنسب إلى غيرها ولا يُخترع له سطر
    row.clients += 1;
    campaignOf.set(c.id, c.campaign);
    const tags = c.tags || [];
    if (tags.includes('جادّ') || (c.contacts || []).length > 0) row.serious += 1;
  }
  for (const r of requests) {
    const row = byKey.get(campaignOf.get(r.clientId));
    if (row) row.requests += 1;
  }
  for (const d of deals) {
    const row = byKey.get(campaignOf.get(d.clientId));
    if (!row) continue;
    row.deals += 1;
    row.commission += netCommission(d);
  }

  const rows = [...byKey.values()].map((r) => ({
    ...r,
    costPerLead: r.budget > 0 && r.clients > 0 ? r.budget / r.clients : null,
    costPerDeal: r.budget > 0 && r.deals > 0 ? r.budget / r.deals : null,
    net: r.commission - r.budget,
    // نسبةُ الجادّ من الوارد: حملةٌ بأربعةَ عشرَ طلبًا ثلاثةٌ منها جادّة تُقرأ بهذا الرقم.
    seriousRate: r.clients > 0 ? r.serious / r.clients : null,
  }));

  // **الجاريةُ أوّلًا** — هي التي يُتصرَّف فيها اليوم، والمنتهيةُ تاريخٌ يُقرأ.
  rows.sort((a, b) => Number(b.running) - Number(a.running) || b.net - a.net || b.clients - a.clients);

  return {
    rows,
    totals: {
      budget: rows.reduce((s, r) => s + r.budget, 0),
      clients: rows.reduce((s, r) => s + r.clients, 0),
      deals: rows.reduce((s, r) => s + r.deals, 0),
      commission: rows.reduce((s, r) => s + r.commission, 0),
      net: rows.reduce((s, r) => s + r.net, 0),
      running: rows.filter((r) => r.running).length,
    },
  };
}

/**
 * السطرُ الذي يُحاسَب به المسوّقُ ويُدافع به عن نفسه — وكلاهما نافعٌ له.
 * يُعاد `''` لحملةٍ لم يدخل منها أحد: «صفرٌ من صفر» ليس خبرًا.
 */
export function campaignLine(row, { formatSAR, countOf } = {}) {
  if (!row || !row.clients) return '';
  const money = formatSAR || ((n) => String(n));
  const count = countOf || ((n, w) => `${n} ${w}`);
  const parts = [count(row.clients, 'طلب'), `${count(row.serious, 'جادّ')}`];
  if (row.deals) parts.push(count(row.deals, 'صفقة'));
  if (row.costPerLead != null) parts.push(`كلفةُ الطلب ${money(Math.round(row.costPerLead))}`);
  return parts.join(' · ');
}
