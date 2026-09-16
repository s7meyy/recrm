// ما تغيّر في عروضك **بعد** أن نُشرت (المرحلة ٤٧).
//
// **المسألة:** النشرُ اختيارٌ يدويّ محفوظ، بلا أيّ فحصٍ للحالة. فالعقارُ الذي بِعتَه أمس
// يبقى على صفحتك حتى تتذكّر أن تنزع تأشيرته وتُعيد النشر. **والمرحلةُ ٤٦ زادت الأمر
// حدّةً**: صار الإقفالُ تلقائيًّا عند تسجيل الصفقة — فالنظامُ يعرف أنه بِيع، وصفحتُك ما
// زالت تعرضه لمشترٍ يتصل بك عنه.
//
// **ولا نشرَ تلقائيّ.** ما يخرج إلى الناس يخرج بقرارك — وهذا يقول لك ماذا تغيّر ومتى،
// والضغطةُ ضغطتُك.
//
// دوال خالصة: لا تخزين ولا شبكة.

/** الحالاتُ التي لا يصحّ بقاءُ العقار معروضًا معها. */
const CLOSED = new Set(['sold', 'rented']);

/**
 * يلتقط بصمةَ ما نُشر: ما يُقارَن لاحقًا لا أكثر.
 *
 * **والحالةُ والسعرُ وحدهما**، لا السجلُّ كلُّه: بصمةٌ تحفظ كلَّ حقلٍ تكبر بحجم مخزونك
 * وتُخزَّن في الإعدادات، وأكثرُ حقولها لا يُعلَن أصلًا. وتغيّرُ ملاحظةٍ داخلية ليس خبرًا
 * يستحقّ إعادة نشر.
 */
export function publishFingerprint(properties = []) {
  return properties.map((p) => [p.id, { status: p.status || '', price: p.price ?? null }]);
}

/**
 * ماذا تغيّر منذ آخر نشرة؟
 *
 * @param {Array} properties مخزونك الآن
 * @param {Array} published بصمةُ ما نُشر — `[[id, { status, price }]]`
 * @returns {[{ property, id, kind: 'closed'|'price'|'gone', from, to }]}
 */
export function publishDrift(properties = [], published = []) {
  const byId = new Map(properties.map((p) => [p.id, p]));
  const out = [];
  for (const [id, was] of published) {
    const now = byId.get(id);
    // **حُذف أو دُمج**: رابطُه المفرد يشير إلى لا شيء، وبطاقتُه باقيةٌ في اللقطة.
    if (!now) { out.push({ property: null, id, kind: 'gone', from: was, to: null }); continue; }
    if (CLOSED.has(now.status) && !CLOSED.has(was.status || '')) {
      out.push({ property: now, id, kind: 'closed', from: was.status, to: now.status });
      continue;   // «بِيع» يغني عن «تغيّر سعره»: الأوّلُ يُنهي العرض والثاني يُعدّله
    }
    const before = was.price ?? null;
    const after = now.price ?? null;
    if (before !== after) out.push({ property: now, id, kind: 'price', from: before, to: after });
  }
  // المنتهي أوّلًا: بطاقةُ عقارٍ بِيع أسوأُ من بطاقةٍ بسعرٍ قديم.
  const rank = { closed: 0, gone: 1, price: 2 };
  return out.sort((a, b) => rank[a.kind] - rank[b.kind]);
}

/**
 * أوقاتُك المشغولة للرفع مع النشرة — **طوابعُ زمنيّةٌ وامتدادات، لا غير**.
 *
 * ولا يخرج منها اسمُ عميلٍ ولا عقارٌ ولا سبب: رقمٌ يقول «مشغول» ولا يقول بمَ. وتُقصر على
 * أفق الحجز المنشور، فلا تُرفع مواعيدُ سنةٍ كاملة بلا فائدة.
 *
 * @param {Array} showings المعاينات
 * @param {{ horizonDays, visitMinutes }} booking إعدادات الحجز
 */
export function busyTimes(showings = [], { horizonDays = 14, visitMinutes = 60, now = Date.now() } = {}) {
  const until = now + Math.max(1, Math.min(60, Number(horizonDays) || 14)) * 86400000;
  const mins = Math.max(5, Math.min(600, Number(visitMinutes) || 60));
  return showings
    .filter((s) => s?.at && s.status === 'scheduled')
    .map((s) => ({ at: new Date(s.at).getTime(), minutes: mins }))
    .filter((s) => Number.isFinite(s.at) && s.at >= now && s.at <= until)
    .sort((a, b) => a.at - b.at)
    .map((s) => ({ at: new Date(s.at).toISOString(), minutes: s.minutes }));
}
