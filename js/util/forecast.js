// توقّع الإيراد للربع القادم (المرحلة ٢٨).
//
// «Forecasting» أبرز ما تبيعه Dynamics وSalesforce للقيادات، وحسابه عندك جاهز منذ المرحلة ١٧:
// **نسب قمعك التاريخية × طلباتك النشطة وميزانياتها × نسبة عمولتك**.
//
// وثلاثة قيود تجعله رقمًا يُصدَّق بدل رقمٍ يُتمنّى:
//   ١) **الاحتمال من تاريخك أنت** لا من جدولٍ عام: نسبة الطلبات التي أُبرمت فعلًا، مقسّمة
//      على مرحلة الطلب (مهتمّ · عُرض عليه · لم يُعرض) — فطلبٌ أبدى صاحبه اهتمامًا ليس كطلبٍ
//      لم تفتحه بعد.
//   ٢) **العيّنة تُعلن**، وتحت حدٍّ أدنى من الصفقات لا يُعطى رقم أصلًا: نسبةٌ من صفقتين
//      ليست نسبة.
//   ٣) **مدى لا رقم واحد**: الأدنى بالمهتمّين وحدهم، والأعلى بكل النشِط.
//
// دالة خالصة: لا تخزين ولا شبكة.

/** مراحل الطلب في التوقّع، من الأقرب إلى الإبرام إلى الأبعد. */
export const FORECAST_STAGES = [
  { key: 'interested', label: 'أبدى اهتمامًا' },
  { key: 'presented', label: 'عُرض عليه' },
  { key: 'open', label: 'لم يُعرض عليه بعد' },
];

const AT_LEAST = {
  interested: ['interested', 'won'],
  presented: ['presented', 'interested', 'won'],
};

/** مرحلة الطلب من مطابقاته: أعلى ما بلغته. */
function stageOf(requestId, matches) {
  const mine = matches.filter((m) => m.requestId === requestId);
  if (mine.some((m) => AT_LEAST.interested.includes(m.status))) return 'interested';
  if (mine.some((m) => AT_LEAST.presented.includes(m.status))) return 'presented';
  return 'open';
}

/**
 * قيمة الصفقة المتوقَّعة من الطلب.
 * **سقف الميزانية لا وسطها:** العميل يشتري عند سقفه غالبًا، وإن غاب السقف فلا قيمة تُخمَّن.
 */
function valueOf(request) {
  const max = Number(request?.budgetMax);
  if (Number.isFinite(max) && max > 0) return max;
  const min = Number(request?.budgetMin);
  return Number.isFinite(min) && min > 0 ? min : null;
}

/**
 * @param {{ requests, matches, deals, commissionPercent, minDeals }} input
 * @returns {{ ok, reason?, stages, expected, low, high, pipeline, counted, noBudget, rates, closed }}
 */
export function revenueForecast({
  requests = [], matches = [], deals = [], commissionPercent = 2.5, minDeals = 3,
} = {}) {
  const closedRequests = requests.filter((r) => r.status === 'done').length;
  const closed = deals.length;

  // الطلبات الحيّة وحدها: الموقوف والمنجز خرجا من الأنبوب.
  const active = requests.filter((r) => r.status === 'active');
  const withBudget = active.map((r) => ({ request: r, value: valueOf(r), stage: stageOf(r.id, matches) }));
  const counted = withBudget.filter((x) => x.value != null);
  const noBudget = withBudget.length - counted.length;

  // الاحتمال التاريخي: كم طلبًا من كل مرحلة انتهى مُنجزًا. وبغياب تاريخٍ كافٍ لا يُخترع رقم.
  const done = requests.filter((r) => r.status === 'done');
  const rateFor = (stage) => {
    const pool = requests.filter((r) => r.status !== 'paused' && stageOf(r.id, matches) === stage);
    if (!pool.length) return null;
    return pool.filter((r) => r.status === 'done').length / pool.length;
  };
  const rates = Object.fromEntries(FORECAST_STAGES.map((s) => [s.key, rateFor(s.key)]));

  if (closed < minDeals || done.length < minDeals) {
    return {
      ok: false,
      reason: 'sample',
      minDeals,
      closed,
      closedRequests,
      pipeline: counted.reduce((sum, x) => sum + x.value, 0),
      counted: counted.length,
      noBudget,
      stages: [],
      rates,
    };
  }

  const commission = (value) => (value * commissionPercent) / 100;
  const stages = FORECAST_STAGES.map((s) => {
    const rows = counted.filter((x) => x.stage === s.key);
    const value = rows.reduce((sum, x) => sum + x.value, 0);
    const rate = rates[s.key] ?? 0;
    return {
      ...s,
      count: rows.length,
      value,
      rate,
      expected: commission(value) * rate,
    };
  });

  const expected = stages.reduce((sum, s) => sum + s.expected, 0);
  const pipeline = counted.reduce((sum, x) => sum + x.value, 0);
  const bestRate = Math.max(0, ...FORECAST_STAGES.map((s) => rates[s.key] ?? 0));
  // الأدنى: المهتمّون وحدهم — من عداهم قد لا يصل. والأعلى: كل النشِط بأعلى نسبة عندك.
  // ويُقصّان حول المتوقَّع: مدًى لا يحوي وسطه ليس مدًى.
  const low = Math.min(stages.find((s) => s.key === 'interested')?.expected || 0, expected);
  const high = Math.max(commission(pipeline) * bestRate, expected);

  return {
    ok: true,
    stages,
    expected,
    low,
    high,
    pipeline,
    counted: counted.length,
    noBudget,
    rates,
    closed,
    closedRequests,
  };
}
