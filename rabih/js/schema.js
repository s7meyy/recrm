// عقد بيانات رابح: الشكل الموحّد الذي تنتهي إليه كل مصادر الاستخراج.
// كل ما بعده (التوحيد، التحليل، التقرير) يقرأ من هذا الشكل وحده، فلا يتأثر بتغيّر المصدر.
// المصادر: 'manual' (لصق يدوي) — لاحقًا: 'places' (Google Places API) و'provider' (مزوّد وسيط).

export const SCHEMA_VERSION = 1;

/** @returns {object} هيكل فارغ مطابق للعقد */
export function emptyPlace() {
  return {
    schema: SCHEMA_VERSION,
    source: 'manual',
    capturedAt: new Date().toISOString(),
    mapsUrl: '',
    placeId: '',
    identity: {
      name: '',
      category: '',       // تصنيف قوقل كما يظهر
      address: '',
      phone: '',
      website: '',
      coords: null,       // { lat, lng }
      hours: [],          // ["الأحد: 8 ص – 11 م", ...]
      attributes: [],     // ["يوجد توصيل", "مواقف مجانية", ...]
      priceLevel: '',
    },
    ratings: {
      average: null,      // 4.3
      count: null,        // 1287
      distribution: { 5: null, 4: null, 3: null, 2: null, 1: null },
    },
    reviews: [],          // انظر emptyReview
    qna: [],              // { question, answer, date }
    popularTimes: [],     // { day, hours: [{hour, level}] }
    notes: '',            // ملاحظات المستخدم اليدوية
  };
}

export function emptyReview() {
  return {
    id: '',
    author: '',
    rating: null,         // 1..5
    date: '',             // كما ورد ("قبل شهرين") أو ISO إن توفّر
    text: '',
    ownerReply: '',
    language: '',
    likes: null,
    source: '',           // من أين جاء: paste | provider | places | json
  };
}

/** يمنح كل تعليق مُعرِّفًا ثابتًا يُستشهَد به في التحليل (منع الهلوسة يعتمد عليه). */
export function assignReviewIds(place) {
  place.reviews.forEach((r, i) => { if (!r.id) r.id = `R${String(i + 1).padStart(3, '0')}`; });
  return place;
}

/** يحسب توزيع النجوم من التعليقات المتاحة إن لم يُدخله المستخدم. */
export function computeDistribution(place) {
  const dist = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  let counted = 0;
  for (const r of place.reviews) {
    const n = Number(r.rating);
    if (n >= 1 && n <= 5) { dist[Math.round(n)] += 1; counted += 1; }
  }
  return counted ? { dist, counted } : null;
}

/**
 * تحقّق من سلامة العقد قبل تشغيل خط التحليل.
 * @returns {{ok: boolean, errors: string[], warnings: string[]}}
 */
export function validate(place) {
  const errors = [];
  const warnings = [];

  if (!place || typeof place !== 'object') return { ok: false, errors: ['لا توجد بيانات.'], warnings };
  if (!place.identity?.name?.trim()) errors.push('اسم المنشأة مطلوب.');
  if (!Array.isArray(place.reviews)) errors.push('حقل التعليقات ليس قائمة.');
  if (Array.isArray(place.reviews) && place.reviews.length === 0)
    errors.push('لا يوجد أي تعليق — التحليل بلا تعليقات لا يُنتج تقريرًا ذا قيمة.');

  const avg = place.ratings?.average;
  if (avg !== null && avg !== undefined && avg !== '' && (avg < 1 || avg > 5))
    errors.push('متوسط التقييم يجب أن يكون بين 1 و5.');

  const withRating = (place.reviews || []).filter((r) => r.rating >= 1 && r.rating <= 5).length;
  const total = (place.reviews || []).length;
  if (total && withRating < total)
    warnings.push(`${total - withRating} تعليقًا بلا عدد نجوم — سيُحلَّل نصُّه دون احتسابه في الإحصاء.`);
  if (total && total < 10)
    warnings.push('عدد التعليقات أقل من 10؛ الاستنتاجات ستكون محدودة الدلالة.');
  if (!place.identity?.address?.trim())
    warnings.push('العنوان غير مُدخَل — سيغيب من التقرير.');
  if (!place.ratings?.count)
    warnings.push('إجمالي عدد التقييمات في قوقل غير مُدخَل — لا يمكن قياس نسبة العيّنة.');

  return { ok: errors.length === 0, errors, warnings };
}

/** إحصاءات محسوبة برمجيًا — تُمرَّر للنماذج كأرقام جاهزة فلا تخترعها. */
export function stats(place) {
  const reviews = place.reviews || [];
  const rated = reviews.filter((r) => r.rating >= 1 && r.rating <= 5);
  const sum = rated.reduce((a, r) => a + Number(r.rating), 0);
  const d = computeDistribution(place);
  const withText = reviews.filter((r) => (r.text || '').trim().length > 0).length;
  const withReply = reviews.filter((r) => (r.ownerReply || '').trim().length > 0).length;

  return {
    total: reviews.length,
    rated: rated.length,
    sampleAverage: rated.length ? Number((sum / rated.length).toFixed(2)) : null,
    googleAverage: place.ratings?.average ?? null,
    googleCount: place.ratings?.count ?? null,
    coverage: place.ratings?.count ? Number(((reviews.length / place.ratings.count) * 100).toFixed(1)) : null,
    distribution: d ? d.dist : null,
    negative: rated.filter((r) => r.rating <= 2).length,
    neutral: rated.filter((r) => r.rating === 3).length,
    positive: rated.filter((r) => r.rating >= 4).length,
    withText,
    withReply,
    replyRate: reviews.length ? Number(((withReply / reviews.length) * 100).toFixed(1)) : null,
  };
}
