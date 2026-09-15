// اتفاقية الوساطة ومتى تنتهي (المرحلة ٣١).
//
// تطبع الاتفاقية بمدّتها منذ المرحلة ١٣، **ولا شيء يتتبّع نهايتها**. والعقار الذي انتهت
// اتفاقيته عقارٌ قد تخسره — يسوّقه غيرك أو يبيعه المالك بلا عمولتك، وأنت لا تعرف.
//
// دوال خالصة: لا تخزين ولا شبكة.

const DAY = 86400000;

export const AGREEMENT_STATES = {
  none: { key: 'none', label: 'بلا اتفاقية مسجَّلة' },
  active: { key: 'active', label: 'سارية' },
  soon: { key: 'soon', label: 'تنتهي قريبًا' },
  expired: { key: 'expired', label: 'انتهت' },
};

/**
 * حالة اتفاقية عقار واحد.
 *
 * **مدّة الاتفاقية تُقرأ من العقار نفسه إن سُجّلت فيه**، ولا تُقرأ من الإعدادات إلا بديلًا:
 * تعديل المدّة الافتراضية اليوم يجب ألّا يغيّر اتفاقيةً وُقّعت بمدّةٍ أخرى.
 *
 * @returns {{ state, signedAt, endsAt, days } | null} `days` موجب = باقٍ، سالب = مضى
 */
export function agreementState(property, { defaultDays = 90, soonDays = 14, now = Date.now() } = {}) {
  const signedAt = property?.agreementSignedAt || null;
  if (!signedAt) return { state: 'none', signedAt: null, endsAt: null, days: null };
  const start = new Date(signedAt).getTime();
  if (!Number.isFinite(start)) return { state: 'none', signedAt: null, endsAt: null, days: null };

  const span = Math.max(1, Math.round(Number(property.agreementDays) || Number(defaultDays) || 90));
  const end = start + span * DAY;
  const days = Math.ceil((end - now) / DAY);
  const state = days < 0 ? 'expired' : (days <= soonDays ? 'soon' : 'active');
  return { state, signedAt, endsAt: new Date(end).toISOString(), days, span };
}

/**
 * العقارات التي تحتاج انتباهك: منتهية أو توشك.
 *
 * **المبيع والمؤجَّر يخرجان**: اتفاقيةٌ على عقارٍ أُنجزت صفقته لا معنى لتجديدها.
 * والمرتَّب أولًا هو **الأقرب انتهاءً** — وهو ترتيب من تتصل بمالكه أولًا.
 */
export function expiringAgreements(properties = [], options = {}) {
  const done = new Set(['sold', 'rented']);
  return properties
    .filter((p) => p.captureStatus === 'approved' && !done.has(p.status))
    .map((p) => ({ property: p, ...agreementState(p, options) }))
    .filter((x) => x.state === 'soon' || x.state === 'expired')
    .sort((a, b) => a.days - b.days);
}

/** عقارات معتمدة بلا اتفاقية مسجَّلة — ثغرة صامتة تُعرض لا تُنبَّه عليها كل يوم. */
export function unsignedProperties(properties = []) {
  const done = new Set(['sold', 'rented']);
  return properties.filter((p) => p.captureStatus === 'approved' && !done.has(p.status) && !p.agreementSignedAt);
}
