// المعاينات: الموعد، وما قاله العميل بعده، ونسبتها إلى الصفقات (المرحلة ٢٧).
//
// كانت «عُرضت على العميل» حالةً في المطابقة وكفى: لا موعد، ولا أثر لمن حضر ومن لم يحضر،
// ولا كلمة واحدة مما قاله وهو واقف في الصالة. **وهذه أغنى لحظة في العملية كلها** — فيها
// يقول العميل ما لا يقوله في الهاتف.
//
// **وحدة القياس هنا المعاينة لا الطلب**، ولذلك لا تدخل قمع التحويل (المرحلة ١٧): القمع
// كل مراحله بالطلب وكل مرحلة مجموعة جزئية مما قبلها، والمعاينة تكسر الشرطين (طلبٌ واحد
// له معاينات، وعميلٌ يهتمّ بلا معاينة). فخلطهما يعطي نسبًا تتجاوز المئة ولا معنى لها.
//
// دوال خالصة: لا تخزين ولا شبكة.

const DAY = 86400000;

/**
 * المعاينات القادمة خلال مدّة — مرتَّبة بالأقرب موعدًا.
 *
 * ولها **حدٌّ سفليّ** هو مهلة `graceHours` نفسها التي تنتظرها `needFeedback`: موعدٌ مضى
 * عليه أكثر منها لم يعد قادمًا، بل صار ينتظر رأي العميل. ولولا هذا الحدّ لظهر الصفّ
 * الواحد في لوحتين معًا — وهو ما كشفه الاختبار.
 */
export function upcomingShowings(showings = [], { now = Date.now(), withinHours = 48, graceHours = 2 } = {}) {
  const until = now + withinHours * 3600000;
  const since = now - graceHours * 3600000;
  return showings
    .filter((s) => s.status === 'scheduled' && s.at)
    .map((s) => ({ showing: s, at: new Date(s.at).getTime() }))
    .filter((x) => Number.isFinite(x.at) && x.at >= since && x.at <= until)
    .sort((a, b) => a.at - b.at);
}

/**
 * معاينات مضى موعدها ولم يُسجَّل لها انطباع.
 *
 * تُعرض **بعد ساعتين** من الموعد لا لحظته: سؤالٌ يقفز والعميل ما زال معك إزعاج.
 * وتُقصر على أسبوعين مضيا كي لا تصير اللوحة أرشيف ذنوب لا يُفعل بها شيء.
 */
export function needFeedback(showings = [], { now = Date.now(), afterHours = 2, withinDays = 14 } = {}) {
  return showings
    .filter((s) => !s.impression && s.status !== 'cancelled' && s.at)
    .map((s) => ({ showing: s, at: new Date(s.at).getTime() }))
    .filter((x) => Number.isFinite(x.at)
      && now - x.at >= afterHours * 3600000
      && now - x.at <= withinDays * DAY)
    .sort((a, b) => a.at - b.at);
}

/**
 * إحصاء المعاينات ونسبتها إلى الصفقات.
 *
 * **الصفقة تُنسب إلى المعاينة بشرطين:** العميل نفسه والعقار نفسه، وتاريخها **بعد** الموعد
 * وخلال `windowDays`. وصفقةٌ سبقت المعاينة لا تُنسب إليها مهما تطابق طرفاها — وهذا يمنع
 * الرقم من تملّق نفسه.
 *
 * @returns {{ total, done, noShow, cancelled, scheduled, liked, maybe, disliked, converted,
 *   showRate, closeRate, perDeal, reasons: [[key, count]] }}
 */
export function showingStats({ showings = [], deals = [], windowDays = 120 } = {}) {
  const past = showings.filter((s) => s.status !== 'scheduled');
  const done = past.filter((s) => s.status === 'done');
  const attended = done.length;

  const converted = done.filter((s) => deals.some((d) => {
    if (!d.clientId || d.clientId !== s.clientId) return false;
    if (!d.propertyId || d.propertyId !== s.propertyId) return false;
    const dealAt = new Date(d.date).getTime();
    const showAt = new Date(s.at).getTime();
    return Number.isFinite(dealAt) && Number.isFinite(showAt)
      && dealAt >= showAt - DAY // يوم سماح: الصفقة قد تُسجَّل بتاريخ اليوم والمعاينة مساءً
      && dealAt - showAt <= windowDays * DAY;
  })).length;

  const counts = (key, value) => done.filter((s) => s[key] === value).length;
  const reasons = new Map();
  for (const s of done) {
    if (s.impression === 'disliked' && s.reason) reasons.set(s.reason, (reasons.get(s.reason) || 0) + 1);
  }

  const totalBooked = past.length;
  return {
    total: showings.length,
    scheduled: showings.filter((s) => s.status === 'scheduled').length,
    done: attended,
    noShow: past.filter((s) => s.status === 'no_show').length,
    cancelled: past.filter((s) => s.status === 'cancelled').length,
    liked: counts('impression', 'liked'),
    maybe: counts('impression', 'maybe'),
    disliked: counts('impression', 'disliked'),
    converted,
    // نسبة الحضور: كم موعدًا صار معاينة فعلية.
    showRate: totalBooked > 0 ? attended / totalBooked : null,
    // نسبة الإغلاق: كم معاينة صارت صفقة — وهو الرقم الذي تقيس به نفسك.
    closeRate: attended > 0 ? converted / attended : null,
    // كم معاينة تكلّفك الصفقة الواحدة وسطيًا.
    perDeal: converted > 0 ? attended / converted : null,
    reasons: [...reasons.entries()].sort((a, b) => b[1] - a[1]),
  };
}
