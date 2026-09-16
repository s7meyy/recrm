// هامش الخطأ — لأن الأداة كانت تعرض نسبًا بدقّةٍ لا تملكها.
//
// حين يقول التقرير «٢٣٪ من العيّنة تشكو من الانتظار» فهو صادقٌ **عن العيّنة**،
// ويُقرأ حكمًا **على المنشأة** — وبينهما هامش. وعيّنةٌ من ٤٠ تعليقًا من أصل
// ٣١٠ تعطي نسبةً حقيقية بين ١٢٪ و٣٨٪ تقريبًا، فالفرق بين ١٨٪ و٢٣٪ بين
// تقريرين قد لا يعني شيئًا — وكانت الأداة تعرضه تغيُّرًا.
//
// فترة **ويلسون** لا الفترة العادية: الأخيرة تُخطئ خطأً فاحشًا عند النسب
// القريبة من الصفر أو الواحد وعند العيّنات الصغيرة — وهي حالنا الغالبة.
//
// وتصحيح المجتمع المحدود (fpc) يُطبَّق حين تكون العيّنة جزءًا معتبَرًا من
// الإجمالي: عيّنةُ ٨٠ من ١٠٠ أدقُّ من عيّنةِ ٨٠ من عشرة آلاف، فلا يُساوَى بينهما.

const Z = 1.96;   // ثقة ٩٥٪

/**
 * @param {number} k عدد الموافق (مثلًا: من اشتكى)
 * @param {number} n حجم العيّنة
 * @param {number|null} population إجمالي المجتمع إن عُرف (لتصحيح المجتمع المحدود)
 * @returns {{p, low, high, margin, n, k, wide}|null}
 */
export function wilson(k, n, population = null) {
  const K = Number(k);
  const N = Number(n);
  if (!Number.isFinite(K) || !Number.isFinite(N) || N <= 0 || K < 0 || K > N) return null;

  const p = K / N;
  let z = Z;

  // تصحيح المجتمع المحدود: يضيق الهامش كلما اقتربت العيّنة من الإجمالي.
  if (Number.isFinite(population) && population > 0 && N <= population) {
    const fpc = Math.sqrt((population - N) / (population - 1 || 1));
    z *= fpc;
  }

  const z2 = z * z;
  const denom = 1 + z2 / N;
  const center = (p + z2 / (2 * N)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / N + z2 / (4 * N * N))) / denom;

  const low = Math.max(0, center - half);
  const high = Math.min(1, center + half);

  return {
    k: K,
    n: N,
    p: Number((p * 100).toFixed(1)),
    low: Number((low * 100).toFixed(1)),
    high: Number((high * 100).toFixed(1)),
    margin: Number((((high - low) / 2) * 100).toFixed(1)),
    // هامشٌ يتجاوز عشر نقاط يجعل الرقم مؤشّرًا لا قياسًا.
    wide: ((high - low) / 2) * 100 > 10,
  };
}

/** صياغةٌ موجزة: «٢٣٪ ± ١٣ نقطة». */
export function pretty(ci) {
  if (!ci) return '—';
  return `${ci.p}% ± ${ci.margin}`;
}

/**
 * هل الفرق بين نسبتين يتجاوز الهامش؟
 *
 * وهذا موضع الخطر: تقريران متتاليان بعيّنتين صغيرتين يُظهران «تحسّنًا» هو
 * ضجيجٌ محض. فما تداخلت فترتاه لا يُعتدّ به، ويُقال ذلك صراحةً.
 */
export function significant(a, b) {
  if (!a || !b) return { decided: false, reason: 'لا بيانات كافية.' };
  const overlap = a.low <= b.high && b.low <= a.high;
  if (overlap) {
    return {
      decided: false,
      overlap: true,
      reason: `الفرق ضمن هامش الخطأ (${pretty(a)} مقابل ${pretty(b)}) — لا يُعتدّ به.`,
    };
  }
  return {
    decided: true,
    overlap: false,
    direction: a.p > b.p ? 'أعلى' : 'أدنى',
    reason: `الفرق يتجاوز هامش الخطأ (${pretty(a)} مقابل ${pretty(b)}).`,
  };
}
