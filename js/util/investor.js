// محفظة المستثمر والعائد الواقع (المرحلة ٤٧).
//
// «استثمار» غرضٌ في النظام منذ أوّله، وللنظام حاسبةُ عائدٍ **استرشادية** تجيب عن سؤالٍ
// افتراضيّ: «لو اشتريتُ بكذا وأجّرتُ بكذا، كم يعود؟». وليس فيه ما يجيب عن السؤال
// الواقع: **«ما الذي أملكه فعلًا، وكم عاد عليّ منه هذا العام؟»**
//
// والفرقُ بينهما هو الفرقُ بين وعدٍ ومحاسبة. المتوقَّعُ يُكتب في العقد، والواقعُ يُقرأ من
// الدفعات المقبوضة. ومتى افترقا فذلك أهمُّ رقمٍ في الصفحة: شهرٌ لم يُحصَّل، أو وحدةٌ
// شغرت، أو مستأجرٌ يماطل.
//
// **ولا يُخترع رقم:** ما لا يُعرف يُقال «غير معلوم» وتُذكر علّتُه بنصٍّ صريح، ولا يُكتب
// صفرًا يُضلّل المجموع.

import { ENUMS } from '../data/schema.js';

const DAY = 86400000;
const YEAR = 365 * DAY;

/**
 * **قيمةُ التملّك** — أساسُ كسر العائد، ولا يصحّ العائد بغيره.
 *
 * وفي النظام حقلُ `price` واحدٌ يحمل معنيين بحسب غرض العرض: **ثمنَ تملّكٍ** لعرض البيع
 * أو الاستثمار، و**أجرةً سنويّة** لعرض الإيجار. وقسمةُ الأجرة على الأجرة عائدٌ كاذبٌ
 * مئةٌ بالمئة — فلا تُحسب، ويُقال سببُ امتناعها.
 *
 * @returns {{ value: number|null, reason: string }}
 */
export function capitalValue(property) {
  const price = Number(property?.price);
  const purposes = property?.purposes || [];
  if (!Number.isFinite(price) || price <= 0) return { value: null, reason: 'سعر العقار غير مُدخل' };
  // إيجارٌ وحده: السعرُ أجرةٌ سنويّةٌ لا ثمنَ تملّك.
  if (purposes.length && purposes.every((k) => k === 'rent')) {
    return { value: null, reason: 'السعر المسجَّل أجرةٌ سنويّة لا ثمنَ تملّك — أضِف عرض بيعٍ أو استثمارٍ ليُحسب العائد' };
  }
  return { value: price, reason: '' };
}

/** أحدثُ صفقةٍ مربوطةٍ بكل عقار — هي عقدُه الساري. */
export function dealsByProperty(deals = []) {
  const map = new Map();
  for (const d of deals) {
    if (!d.propertyId) continue;
    const cur = map.get(d.propertyId);
    if (!cur || String(d.date || '') > String(cur.date || '')) map.set(d.propertyId, d);
  }
  return map;
}

/**
 * **سطرُ عقارٍ واحدٍ في المحفظة**: المتوقَّعُ سنةً أمامنا، والواقعُ سنةً خلفنا.
 *
 * • **المتوقَّع** — مجموعُ الدفعات المجدوَلة المستحقّة في الاثني عشر شهرًا القادمة. فإن لم
 *   يكن جدولٌ أصلًا، وكان العرضُ للإيجار بسعرٍ معلوم، فالسعرُ أجرةٌ سنويّةٌ يُؤخذ بها.
 * • **الواقع** — مجموعُ ما **قُبض فعلًا** في الاثني عشر شهرًا الماضية، بتاريخ قبضه.
 * • **الفجوة** — ما استُحقّ في السنة الماضية ولم يُقبض. وهي التي تُطارَد.
 */
export function portfolioRow({ property, deal = null, now = Date.now() } = {}) {
  const { value, reason } = capitalValue(property);
  const payments = (deal?.payments || []).filter((p) => p.dueAt || p.paidAt);

  const inWindow = (iso, from, to) => {
    const t = new Date(iso).getTime();
    return Number.isFinite(t) && t >= from && t < to;
  };

  const expectedRows = payments.filter((p) => p.dueAt && inWindow(p.dueAt, now, now + YEAR));
  let expected = expectedRows.reduce((a, p) => a + (Number(p.amount) || 0), 0);
  let expectedFrom = expectedRows.length ? 'جدول الدفعات' : '';
  if (!expectedRows.length) {
    const askRent = (property?.purposes || []).includes('rent') ? Number(property?.price) : NaN;
    if (Number.isFinite(askRent) && askRent > 0) { expected = askRent; expectedFrom = 'الأجرة المعروضة'; }
    else { expected = null; expectedFrom = ''; }
  }

  const actualRows = payments.filter((p) => p.paidAt && inWindow(p.paidAt, now - YEAR, now));
  const actual = actualRows.reduce((a, p) => a + (Number(p.amount) || 0), 0);

  // ما فات موعدُه في السنة الماضية ولم يُقبض — لا ما استُحقّ اليوم.
  const missedRows = payments.filter((p) => !p.paidAt && p.dueAt && inWindow(p.dueAt, now - YEAR, now));
  const missed = missedRows.reduce((a, p) => a + (Number(p.amount) || 0), 0);

  const pct = (n) => (value && Number.isFinite(n) && n != null ? (n / value) * 100 : null);

  return {
    property,
    deal,
    value,
    valueReason: reason,
    expected,
    expectedFrom,
    actual,
    actualRows: actualRows.length,
    missed,
    missedCount: missedRows.length,
    expectedYield: pct(expected),
    actualYield: pct(actual),
    // فجوةُ التحصيل نسبةً: كم من المستحقّ وصل فعلًا؟ ولا نسبةَ بلا مستحقّ.
    collectionRate: (actual + missed) > 0 ? (actual / (actual + missed)) * 100 : null,
    hasLease: !!deal && payments.length > 0,
  };
}

/**
 * **محفظةُ مالكٍ واحد**: كلُّ ما يملكه، وما يعود عليه، ومجاميعُ ذلك.
 *
 * والمجاميعُ لا تُجمع إلّا ممّا عُرف: عقارٌ مجهولُ القيمة يُعدّ ويُسمّى، ولا يدخل
 * كسرَ العائد فيُفسده.
 */
export function investorPortfolio({ ownerId, properties = [], deals = [], now = Date.now() } = {}) {
  const byProperty = dealsByProperty(deals);
  const mine = properties.filter((p) => p.ownerId && p.ownerId === ownerId);
  const rows = mine.map((p) => portfolioRow({ property: p, deal: byProperty.get(p.id) || null, now }));

  const priced = rows.filter((r) => r.value != null);
  const value = priced.reduce((a, r) => a + r.value, 0);
  const expected = rows.reduce((a, r) => a + (r.expected || 0), 0);
  const actual = rows.reduce((a, r) => a + r.actual, 0);
  const missed = rows.reduce((a, r) => a + r.missed, 0);

  const actualYield = value > 0 ? (actual / value) * 100 : null;

  /**
   * **أيُّها يجرّ البقيّة إلى أسفل؟** (المرحلة ٤٨)
   *
   * اللوحةُ كانت تعطي لكلّ عقارٍ عائدَه، وتعطي للمحفظة عائدَها الكلّيّ — **ولا تضع
   * الاثنين في جملةٍ واحدة**. وتلك الجملةُ هي ورقةُ التفاوض كلُّها: بها يبيع المستثمر
   * الخاسرَ ويشتري بدله منك، فتكسب عمولتين من رقمٍ كان محسوبًا عندك أصلًا.
   *
   * **والفرقُ نسبةٌ من متوسّط المحفظة لا فرقُ نقاطٍ مئويّة**: «أقلُّ بـ٤٠٪» تُفهم،
   * و«أقلُّ بنقطةٍ ونصف» لا تُفهم. وما لا عائدَ واقعًا له يبقى `null` ولا يُقارَن.
   */
  for (const r of rows) {
    r.vsPortfolio = (actualYield != null && actualYield > 0 && r.actualYield != null)
      ? Math.round(((r.actualYield - actualYield) / actualYield) * 100)
      : null;
  }

  return {
    // **الأسوأُ أوّلًا** لا الأغلى: المحفظةُ تُقرأ لتُعالَج، وأوّلُ ما يُعالَج أضعفُها.
    // وما لا يُقارَن (بلا قيمةٍ أو بلا عائد) يقع آخرًا — لا يتقدّم المجهولُ على المعلوم.
    rows: rows.sort((a, b) => {
      const A = a.vsPortfolio == null ? Infinity : a.vsPortfolio;
      const B = b.vsPortfolio == null ? Infinity : b.vsPortfolio;
      return A - B || (b.value || 0) - (a.value || 0);
    }),
    count: rows.length,
    unpriced: rows.length - priced.length,
    value,
    expected,
    actual,
    missed,
    // العائدُ الكلّيّ يُقسم على قيمة ما عُرفت قيمتُه وحده — وعددُ المجهول يُقال فوقه.
    expectedYield: value > 0 ? (expected / value) * 100 : null,
    actualYield,
    withoutLease: rows.filter((r) => !r.hasLease).length,
  };
}

/**
 * **التركُّز: أين تقع المخاطرة؟** (المرحلة ٤٩)
 *
 * المحفظةُ كانت تقيس العائدَ وحدَه — وكلُّها أسئلةُ ربح، ولا سؤالَ واحدًا عن الخسارة.
 * ومستثمرٌ عائدُه ٨٪ من ستّة عقاراتٍ **كلُّها في حيٍّ واحد** ليس كمستثمرٍ عائدُه ٧٪
 * موزّعٌ على أربعة أحياء: الأوّلُ أعلى رقمًا وأقربُ إلى الخطر — حيٌّ واحدٌ يهبط فتهبط
 * المحفظةُ كلُّها. وكذلك **مستأجرٌ واحدٌ يدفع نصفَ الدخل**.
 *
 * **ولا حكمَ ولا نصيحة**: يُقال الرقمُ ويسكت. «٦٧٪ من دخلك من حيٍّ واحد» تقول نفسَها،
 * وقد يكون ذلك قرارَ المستثمر عن علمٍ لا غفلة.
 *
 * والقياسُ **بالدخل الواقع لا بالقيمة**: القيمةُ تقديرٌ في أكثر الصفوف، والدخلُ مقبوضٌ
 * مُثبَت. وبلا دخلٍ واقعٍ تُقاس بالقيمة ويُقال بأيّهما قِيست، فلا يُخلط مقياسان صامتًا.
 *
 * @returns {{ basis, districts, tenants, topDistrict, topTenant }}
 */
export function concentration(rows = [], { nameOf = () => '' } = {}) {
  const income = rows.reduce((a, r) => a + (r.actual || 0), 0);
  const basis = income > 0 ? 'income' : 'value';
  const weightOf = (r) => (basis === 'income' ? (r.actual || 0) : (r.value || 0));
  const total = rows.reduce((a, r) => a + weightOf(r), 0);
  if (!total) return { basis, districts: [], tenants: [], topDistrict: null, topTenant: null };

  const group = (keyOf, labelOf) => {
    const map = new Map();
    for (const r of rows) {
      const key = keyOf(r);
      if (!key) continue; // المجهولُ لا يُجمع في سلّةٍ واحدة تُوهم بتركّزٍ ليس فيه
      const cur = map.get(key) || { key, label: labelOf(r), amount: 0, count: 0 };
      cur.amount += weightOf(r);
      cur.count += 1;
      map.set(key, cur);
    }
    return [...map.values()]
      .map((g) => ({ ...g, pct: Math.round((g.amount / total) * 1000) / 10 }))
      .sort((a, b) => b.amount - a.amount);
  };

  const districts = group((r) => (r.property?.district || '').trim(), (r) => r.property.district.trim());
  // المستأجرُ هو عميلُ الصفقة: من يدفع الإيجار فعلًا، لا مالكُ العقار.
  // والاسمُ يُجلب من خارجٍ (`nameOf`): الصفقةُ تحمل `clientId` ولا تحمل اسمًا،
  // وهذه الوحدةُ خالصةٌ لا تقرأ المستودع.
  const tenants = group((r) => r.deal?.clientId || '', (r) => nameOf(r.deal.clientId) || 'مستأجرٌ بلا اسم');

  return {
    basis,
    districts,
    tenants,
    topDistrict: districts[0] || null,
    topTenant: tenants[0] || null,
  };
}

/** نسبةٌ مئويّةٌ بمنزلةٍ واحدة — أو `null` كما هي، فلا تُطبع «٠٪» على مجهول. */
export const yieldPct = (n) => (n == null || !Number.isFinite(n) ? null : Math.round(n * 10) / 10);

/** هل يُعنى هذا العميل بالاستثمار؟ غرضٌ مصرَّحٌ به، أو ملكيّةُ أكثرَ من عقار. */
export function isInvestor(client, owned = 0) {
  const purposes = client?.purposes || client?.purpose ? [].concat(client.purposes || client.purpose) : [];
  return purposes.includes('investment') || owned > 1;
}

export const PURPOSE_LABELS = Object.fromEntries(ENUMS.purposes.map((p) => [p.key, p.label]));
