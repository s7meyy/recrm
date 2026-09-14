// قمع التحويل (المرحلة ١٧): أين تضيع الصفقة بالضبط؟
//
// «لماذا تضيع الصفقات» يقول لك **سبب الرفض**، وهذا يقول لك **موضع السقوط** — وهما سؤالان
// بعلاجين مختلفين: السقوط بين «طلب» و«مرشّح» عيبُ مخزون، وبين «مرشّح» و«عُرض» عيبُ مبادرة
// منك، وبين «عُرض» و«مهتم» عيبُ اختيار أو طريقة عرض، وبين «مهتم» و«أُبرم» عيبُ إغلاق.
//
// **الوحدة واحدة في كل المراحل: الطلب.** وهذا شرط الصدق هنا — لو عُدّت المراحل الأولى
// بالطلبات والأخيرة بالمرشّحين لخرجت نسبٌ تتجاوز المئة (طلبٌ واحد تعرض عليه ثلاثة عقارات)،
// وهي نسبٌ لا معنى لها. وكل مرحلة **مجموعة جزئية** مما قبلها بحكم البناء، فلا تصعد أبدًا.
//
// وتُحسب على كل الطلبات إلا الموقوفة: الطلب المُنجز هو موضع الفوز نفسه، فإسقاطه يخفي نجاحك.

/** حالات المطابقة التي تعني أن المرحلة بلغت هذا الحدّ أو تجاوزته. */
const AT_LEAST = {
  acted: ['new', 'presented', 'interested', 'not_interested', 'won'],
  presented: ['presented', 'interested', 'won'],
  interested: ['interested', 'won'],
  won: ['won'],
};

export const FUNNEL_ADVICE = {
  candidates: 'طلبات لم تتصرّف في أي مرشّح لها — إمّا لا مخزون يناسبها (راجع «الفرص») وإمّا لم تفتحها بعد.',
  presented: 'طلبات لم تعرض على أصحابها شيئًا — عيب مبادرة: العرض بيدك وحدك.',
  interested: 'عُرض عليهم ولم يهتمّوا — عيب اختيار أو طريقة عرض: راجع أسباب الرفض.',
  won: 'اهتمّوا ولم تُبرم — عيب إغلاق: السعر أو التفاوض أو بطء المتابعة.',
};

/**
 * @param {{ requests, matches }} input
 * @returns {{ stages: [], worst: object|null, totals: object }}
 */
export function conversionFunnel({ requests = [], matches = [] } = {}) {
  const counted = requests.filter((r) => r.status !== 'paused');
  const ids = new Set(counted.map((r) => r.id));
  const mine = matches.filter((m) => ids.has(m.requestId));

  const reqsAt = (key) => new Set(mine.filter((m) => AT_LEAST[key].includes(m.status)).map((m) => m.requestId));

  const stages = [
    { key: 'requests', label: 'طلبات', count: counted.length },
    { key: 'candidates', label: 'تصرّفت في مرشّح لها', count: reqsAt('acted').size },
    { key: 'presented', label: 'عُرض على صاحبها', count: reqsAt('presented').size },
    { key: 'interested', label: 'أبدى اهتمامًا', count: reqsAt('interested').size },
    { key: 'won', label: 'أُبرمت', count: reqsAt('won').size },
  ];

  for (let i = 1; i < stages.length; i++) {
    const prev = stages[i - 1].count;
    stages[i].from = prev;
    stages[i].rate = prev > 0 ? stages[i].count / prev : null;
    stages[i].lost = Math.max(0, prev - stages[i].count);
    stages[i].advice = FUNNEL_ADVICE[stages[i].key] || '';
  }

  // أسوأ خطوة: أكبر **عدد** ساقطين لا أدنى نسبة — خطوةٌ نسبتها صفر وفيها ساقطٌ واحد ليست مشكلتك.
  const drops = stages.slice(1).filter((s) => s.from > 0 && s.lost > 0);
  const worst = drops.length ? drops.reduce((a, b) => (b.lost > a.lost ? b : a)) : null;

  return {
    stages,
    worst,
    totals: {
      acted: mine.length,
      rejected: mine.filter((m) => m.status === 'not_interested').length,
      overall: counted.length > 0 ? stages[4].count / counted.length : null,
    },
  };
}
