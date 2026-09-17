/**
 * **سوقٌ حقيقيّ، لا مخزونُك** (المرحلة ٥٠).
 *
 * كلُّ ما في النظام قبل هذه الصفحة **مخزونُك أنت**: أسعارُ عرضِك، وصفقاتُك، وآراءُ من
 * عاينوا. و«تقدير السعر» يقيس حيًّا بعقاراتك أنت فيه — فإن لم يكن لك في قرطبة إلا
 * عقاران، **قِيس الحيُّ بعقارين**. وهو أصدقُ ما يستطيعه من بياناتك، وليس أصدقَ ما يمكن.
 *
 * **والفرقُ جوهريّ**: سعرُ العرض ما يطلبه المالك، وسعرُ الصفقة ما دُفع فعلًا — وبينهما
 * في السوق السعودي فجوةٌ معلومة. ومن يحاجّ مالكًا بأسعار الإعلانات يحاجّه بأمانيّ الناس
 * لا بأفعالهم.
 *
 * دوالُّ خالصة: لا تخزين ولا شبكة ولا DOM.
 */

/**
 * **الوسيطُ لا المتوسّط.** أسعارُ العقار ملتويةٌ بطبعها: قصرٌ بثلاثين مليونًا بين عشر
 * شققٍ يرفع «المتوسّط» فيصير رقمًا لا يشبه شيئًا في الحي. والوسيطُ لا يتأثّر به.
 */
export function median(values = []) {
  const nums = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!nums.length) return null;
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 ? nums[mid] : Math.round((nums[mid - 1] + nums[mid]) / 2);
}

/** الشريحةُ التي يقع فيها أكثرُ السوق — من الرُّبع الأوّل إلى الثالث. */
export function quartiles(values = []) {
  const nums = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (nums.length < 4) return { q1: null, q3: null };
  const at = (p) => nums[Math.min(nums.length - 1, Math.floor(nums.length * p))];
  return { q1: at(0.25), q3: at(0.75) };
}

/**
 * **أدنى عيّنةٍ يُعطى عندها رقم.** ثلاثُ صفقاتٍ ليست سوقًا، وخمسٌ أوّلُ ما يُلتفت إليه.
 * وما دونها يُعرض **موسومًا بصِغره** لا محجوبًا: رقمٌ ضعيفٌ معلومُ الضعف خيرٌ من فراغ.
 */
export const MIN_SAMPLE = 5;

const norm = (s) => String(s || '').trim();
const monthOf = (iso) => String(iso || '').slice(0, 7);

/**
 * يُصفّي الصفقات بما يُسأل عنه.
 * **والمدّةُ بالأشهر لا بعددٍ من الصفوف**: سوقٌ تحرّك قبل سنتين لا يُقاس به اليوم.
 */
export function filterDeals(deals = [], { city = '', district = '', type = '', purpose = '', months = 12, now = Date.now() } = {}) {
  const from = months > 0 ? new Date(now - months * 30.44 * 86400000).toISOString().slice(0, 10) : '';
  const c = norm(city); const d = norm(district); const t = norm(type); const p = norm(purpose);
  return deals.filter((x) => {
    if (c && norm(x.city) !== c) return false;
    if (d && norm(x.district) !== d) return false;
    if (t && norm(x.type) !== t) return false;
    if (p && norm(x.purpose) !== p) return false;
    if (from && String(x.date || '').slice(0, 10) < from) return false;
    return Number.isFinite(Number(x.pricePerM)) && Number(x.pricePerM) > 0;
  });
}

/**
 * مؤشّرُ حيٍّ واحد: وسيطُ سعر المتر، وشريحتُه، وعددُ صفقاته، واتّجاهُه.
 *
 * **والاتّجاهُ يُقارن نصفين متساويين في الطول**: نصفُ المدّة الأخير بنصفها الأوّل.
 * ومقارنةُ شهرٍ بسنةٍ تُنتج رقمًا يتذبذب بلا معنى.
 *
 * @returns {{ district, n, median, q1, q3, trendPct, enough, months }}
 */
export function districtStat(deals = [], { district = '', months = 12, now = Date.now(), ...rest } = {}) {
  const rows = filterDeals(deals, { district, months, now, ...rest });
  const values = rows.map((r) => Number(r.pricePerM));
  const mid = new Date(now - (months / 2) * 30.44 * 86400000).toISOString().slice(0, 10);
  const recent = rows.filter((r) => String(r.date || '').slice(0, 10) >= mid).map((r) => Number(r.pricePerM));
  const older = rows.filter((r) => String(r.date || '').slice(0, 10) < mid).map((r) => Number(r.pricePerM));
  const a = median(older);
  const b = median(recent);
  return {
    district: norm(district),
    n: rows.length,
    median: median(values),
    ...quartiles(values),
    // **ولا اتّجاهَ إلا بنصفين فيهما ما يكفي**: نصفٌ بصفقةٍ واحدةٍ يقلب الرقم رأسًا على عقب.
    trendPct: (a && b && older.length >= 3 && recent.length >= 3)
      ? Math.round(((b - a) / a) * 1000) / 10
      : null,
    enough: rows.length >= MIN_SAMPLE,
    months,
  };
}

/**
 * مؤشّرُ الأحياء كلِّها مرتَّبًا — لوحةُ السوق التي تُقرأ في نصف دقيقة.
 * **والأكثرُ صفقاتٍ أوّلًا لا الأغلى**: الحيُّ النشط هو الذي تعمل فيه، والأغلى قد يكون
 * حيًّا بِيعت فيه فلّةٌ واحدة.
 */
export function marketIndex(deals = [], { city = '', type = '', purpose = 'sale', months = 12, now = Date.now() } = {}) {
  const rows = filterDeals(deals, { city, type, purpose, months, now });
  const names = [...new Set(rows.map((r) => norm(r.district)).filter(Boolean))];
  const stats = names
    .map((d) => districtStat(deals, { district: d, city, type, purpose, months, now }))
    .sort((x, y) => y.n - x.n || (y.median || 0) - (x.median || 0));
  return {
    rows: stats,
    total: rows.length,
    districts: stats.length,
    // وسيطُ المدينة كلِّها — يُقاس به الحيُّ: أغلى من مدينته أم أرخص؟
    cityMedian: median(rows.map((r) => Number(r.pricePerM))),
    span: monthSpan(rows),
  };
}

/** أوّلُ شهرٍ وآخرُه في البيانات — **يُقال دائمًا**: مؤشّرٌ لا يُعرف عمرُه لا يُبنى عليه. */
export function monthSpan(rows = []) {
  const months = rows.map((r) => monthOf(r.date)).filter(Boolean).sort();
  return months.length ? { from: months[0], to: months[months.length - 1] } : { from: '', to: '' };
}

/**
 * **مفرداتُ الأنواع لا تتطابق** — وهذا يُعالَج ولا يُتجاهَل (المرحلة ٥٠).
 *
 * النظامُ يسمّي النوعَ بمفتاحٍ (`villa`)، والبوّابةُ تسمّيه بنصٍّ عربيٍّ من عندها
 * («فيلا» · «فلة» · «سكني»). فطلبُ التطابق الحرفيّ يُخرج صفرًا دائمًا، **ويبدو كأنّ
 * الحيَّ بلا صفقات** وهو مملوءٌ بها.
 *
 * فيُجرَّب النوعُ أوّلًا، **فإن لم يُصِب شيئًا قِيس الحيُّ بأنواعه كلِّها ويُقال ذلك**
 * (`typeIgnored`) — ورقمٌ أوسعُ معلومُ السعة خيرٌ من فراغٍ كاذب.
 */
export function districtStatSmart(deals = [], opts = {}) {
  const typed = districtStat(deals, opts);
  if (typed.n > 0 || !opts.type) return { ...typed, typeIgnored: false };
  const any = districtStat(deals, { ...opts, type: '' });
  return { ...any, typeIgnored: any.n > 0 };
}

/**
 * **أين يقع سعرُ عقارك من السوق؟** — الجملةُ التي تُقال للمالك.
 *
 * `null` إن لم يكن للعقار سعرٌ أو مساحة، أو لم يكن في حيِّه ما يكفي: **ولا يُقارَن
 * بمجهول**. و`gapPct` موجبٌ إن كان سعرُك أعلى من السوق.
 *
 * @returns {{ askPerM, stat, gapPct, verdict } | null}
 */
export function vsMarket(property, deals = [], { months = 12, now = Date.now() } = {}) {
  const area = Number(property?.area);
  const price = Number(property?.price);
  if (!(area > 0) || !(price > 0)) return null;
  const stat = districtStatSmart(deals, {
    district: property.district, city: property.city, type: property.type,
    purpose: 'sale', months, now,
  });
  if (!stat.median) return null;
  const askPerM = Math.round(price / area);
  const gapPct = Math.round(((askPerM - stat.median) / stat.median) * 1000) / 10;
  // **ثلاثُ درجاتٍ لا خمس**: ما دون ١٠٪ في السوق العقاريّ ضجيجٌ لا فرق.
  const verdict = gapPct > 10 ? 'above' : (gapPct < -10 ? 'below' : 'inline');
  return { askPerM, stat, gapPct, verdict };
}

/** جملةٌ عربيّةٌ من أرقام — تُقال للمالك كما هي. */
export function marketLine(cmp, { formatSAR, countOf } = {}) {
  if (!cmp) return '';
  const money = formatSAR || ((n) => String(n));
  const count = countOf || ((n, w) => `${n} ${w}`);
  const head = `سعرُ مترك ${money(cmp.askPerM)}، ووسيطُ ما بِيع فعلًا في ${cmp.stat.district || 'الحي'} ${money(cmp.stat.median)}`;
  const sample = `من ${count(cmp.stat.n, 'صفقة')}`
    + (cmp.stat.typeIgnored ? ' من أنواع الحيّ كلِّها' : '')
    + (cmp.stat.enough ? '' : ' — وهي عيّنةٌ صغيرة');
  const verdict = cmp.verdict === 'above' ? `أي أعلى بـ${Math.abs(cmp.gapPct)}٪`
    : cmp.verdict === 'below' ? `أي أقلُّ بـ${Math.abs(cmp.gapPct)}٪`
      : 'أي في مستوى السوق';
  return `${head} ${sample}، ${verdict}.`;
}
