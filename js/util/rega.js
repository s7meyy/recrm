// عقود الوساطة وتراخيص الإعلانات — الهيئة العامة للعقار (المرحلة ٤٠).
//
// **ما يوجبه النظام، لا ما نظنّه:**
//
//  • عقد الوساطة يكون **مكتوبًا**، وتُودَع نسخةٌ منه لدى الهيئة.
//  • ويكون **محدَّد المدّة**؛ فإن لم تُذكر مدّةٌ فهي **تسعون يومًا** من تاريخ إبرامه.
//  • وينتهي **تلقائيًّا** بانتهاء مدّته ولو لم تتمّ الصفقة، ما لم يُجدَّد باتفاقٍ جديد.
//  • ومدّته تبدأ من **تاريخ التوقيع الإلكتروني** في منصّة وساطةٍ معتمدة من الهيئة.
//  • و**ترخيص الإعلان العقاري لا يُصدَر إلا لعقدٍ يشمل نطاقُه التسويق**.
//  • والإعلان يبيّن غرضه (بيع أو إيجار) واسم المعلن وصفته (مالك أو وكيل).
//  • ومخالفةُ ذلك تُعرِّض لإزالة الإعلان وإيقاف المعلن عن النشر مدّةً تصل إلى سنة.
//
// **وما لا يفعله هذا الملف — ويُقال صراحةً:** لا يُصدِر ترخيصًا ولا يوثّق عقدًا ولا
// يستعلم عن ترخيصٍ آليًّا. الهيئة **لا تفتح واجهةً برمجية عامة** لذلك، والإصدار يبقى
// بحسابك في منصّتها. فما هنا: تتبُّعُ ما أصدرتَه، وتنبيهٌ قبل أن ينتهي، ومنعُ إعلانٍ بلا
// ترخيص، وروابطُ مباشرة إلى الخدمة نفسها — وهذا كلُّه يعمل بلا اشتراكٍ ولا مفتاح.
//
// دوال خالصة: لا تخزين ولا شبكة.

const DAY = 86400000;

/** المدّة النظامية حين لا يُذكر في العقد غيرها. */
export const DEFAULT_CONTRACT_DAYS = 90;

/** روابط الهيئة ومنصّاتها — تُفتح بحسابك، ولا شيء يُرسَل إليها من هنا. */
export const REGA_LINKS = [
  {
    key: 'issueAd',
    label: 'إصدار ترخيص إعلان عقاري',
    url: 'https://rega.gov.sa/rega-services/eservices/إصدار-ترخيص-إعلان-عقاري/',
    what: 'تُصدر منه رقمَ ترخيصٍ لكل عقارٍ تُعلن عنه، ويُكتب في إعلانك على أي قناة.',
  },
  {
    key: 'checkAd',
    label: 'الاستعلام عن ترخيص إعلان',
    url: 'https://rega.gov.sa/rega-services/eservices/الاستعلام-عن-ترخيص-الإعلان-العقاري/',
    what: 'تتحقّق به من صحّة أي ترخيصٍ برقمه — لك ولغيرك.',
  },
  {
    key: 'fal',
    label: 'منصّة فال — الوساطة والتسويق العقاري',
    url: 'https://eservicesredp.rega.gov.sa/',
    what: 'الخدمات الإلكترونية للوساطة: رخصتك، وعقودك الموثَّقة.',
  },
  {
    key: 'falLicense',
    label: 'إصدار رخصة فال للمنشآت',
    url: 'https://rega.gov.sa/rega-services/eservices/إصدار-رخصة-فال-للوساطة-والتسويق-العقاري-للمنشآت/',
    what: 'رخصةُ مزاولة الوساطة نفسها — بلا سريانها لا عقدَ ولا إعلان.',
  },
  {
    key: 'adRules',
    label: 'ضوابط الإعلانات العقارية',
    url: 'https://rega.gov.sa/الأنظمة-واللوائح-والأدلة/ضوابط/ضوابط-الإعلانات-العقارية/',
    what: 'نصّ الضوابط كما نشرتها الهيئة.',
  },
  {
    key: 'brokerageLaw',
    label: 'نظام الوساطة العقارية',
    url: 'https://rega.gov.sa/الأنظمة-والقرارات/الأنظمة-واللوائح-والأدلة/الأنظمة/نظام-الوساطة-العقارية/',
    what: 'نصّ النظام — ومنه مدّة العقد وإيداعه.',
  },
];

export const STATE_LABEL = {
  none: 'غير مسجَّل',
  active: 'سارٍ',
  soon: 'ينتهي قريبًا',
  expired: 'انتهى',
};

const STATE_RANK = { expired: 0, soon: 1, none: 2, active: 3 };

/** حالةُ مدّةٍ لها نهاية: ما بقي منها، وهل قاربت أو انتهت. */
export function spanState(endsAt, { soonDays = 14, now = Date.now() } = {}) {
  if (!endsAt) return { state: 'none', days: null, endsAt: null };
  const end = new Date(endsAt).getTime();
  if (!Number.isFinite(end)) return { state: 'none', days: null, endsAt: null };
  const days = Math.ceil((end - now) / DAY);
  return { state: days < 0 ? 'expired' : days <= soonDays ? 'soon' : 'active', days, endsAt };
}

/**
 * حالة عقد الوساطة لعقار.
 * المدّة من العقار إن سُجّلت، وإلّا فالافتراضية، وإلّا فالتسعون النظامية.
 */
export function contractState(property, { defaultDays = DEFAULT_CONTRACT_DAYS, soonDays = 14, now = Date.now() } = {}) {
  const signedAt = property?.agreementSignedAt || null;
  if (!signedAt) {
    return { state: 'none', signedAt: null, endsAt: null, days: null, span: null, number: property?.agreementNumber || '' };
  }
  const start = new Date(signedAt).getTime();
  if (!Number.isFinite(start)) {
    return { state: 'none', signedAt: null, endsAt: null, days: null, span: null, number: property?.agreementNumber || '' };
  }
  const span = Math.max(1, Math.round(Number(property.agreementDays) || Number(defaultDays) || DEFAULT_CONTRACT_DAYS));
  const endsAt = new Date(start + span * DAY).toISOString();
  return { ...spanState(endsAt, { soonDays, now }), signedAt, span, number: property.agreementNumber || '' };
}

/** حالة ترخيص الإعلان لعقار. ترخيصٌ بلا تاريخ انتهاء يُعدّ ساريًا ويُقال إنّ مدّته غير مسجَّلة. */
export function adLicenseState(property, { soonDays = 14, now = Date.now() } = {}) {
  const lic = property?.adLicense || null;
  if (!lic?.number) return { state: 'none', days: null, endsAt: null, number: '', undated: false };
  if (!lic.expiresAt) return { state: 'active', days: null, endsAt: null, number: lic.number, undated: true };
  return { ...spanState(lic.expiresAt, { soonDays, now }), number: lic.number, undated: false };
}

/**
 * **لماذا لا تستطيع الإعلان عن هذا العقار؟** — أسبابٌ مرتَّبةٌ بترتيب النظام نفسه.
 * تُعاد فارغةً إن كان كلُّ شيءٍ في محلّه.
 */
export function adBlockers(property, opts = {}) {
  // لكل مانعٍ اسمٌ قصير وجملةٌ كاملة: القصيرُ يُقرأ في جدولٍ من عشرين سطرًا، والكاملُ
  // يشرح تحت المؤشّر وفي صفحة العقار. وجملةٌ كاملةٌ مكرّرةٌ عشرين مرّة تصير جدارًا
  // لا يُقرأ منه شيء.
  const out = [];
  const add = (key, short, text) => out.push({ key, short, text });
  const contract = contractState(property, opts);
  if (contract.state === 'none') add('noContract', 'لا عقد', 'لا عقد وساطة مسجَّل — والإعلان يلزمه عقد');
  else if (contract.state === 'expired') add('contractExpired', 'العقد انتهى', 'عقد الوساطة انتهت مدّته — جدّده قبل الإعلان');

  if (contract.state !== 'none' && !(property.agreementScopes || []).includes('market')) {
    add('noMarketScope', 'النطاق بلا تسويق', 'نطاق العقد لا يشمل التسويق — وترخيص الإعلان لا يُصدَر بدونه');
  }
  if (contract.state !== 'none' && !property.agreementNumber) {
    add('noContractNumber', 'بلا رقم عقد', 'رقم العقد الموثَّق غير مسجَّل — والنظام يوجب إيداع نسخة العقد لدى الهيئة');
  }

  const lic = adLicenseState(property, opts);
  if (lic.state === 'none') add('noLicense', 'لا ترخيص', 'لا ترخيص إعلان — الإعلان بلا ترخيص مخالفة');
  else if (lic.state === 'expired') add('licenseExpired', 'الترخيص انتهى', 'ترخيص الإعلان انتهى — جدّده أو أوقف الإعلان');
  return out;
}

/** أيصلح هذا العقار للإعلان عنه الآن؟ */
export const canAdvertise = (property, opts = {}) => adBlockers(property, opts).length === 0;

/** صفٌّ واحد لكل عقارٍ معتمد: عقدُه وترخيصُه وما يمنعه. */
export function complianceRows(properties = [], opts = {}) {
  const done = new Set(['sold', 'rented']);
  return properties
    .filter((p) => p.captureStatus === 'approved')
    .map((p) => {
      const contract = contractState(p, opts);
      const license = adLicenseState(p, opts);
      return {
        property: p,
        contract,
        license,
        blockers: adBlockers(p, opts),
        // المبيع والمؤجَّر لا يُلاحَقان: عقدٌ على عقارٍ أُنجزت صفقته لا معنى لتجديده.
        settled: done.has(p.status),
      };
    });
}

/** الأعجل أوّلًا: ما انتهى، فما يوشك، فما لا عقد له، ثم السارية. */
export function byUrgency(rows) {
  const rank = (r) => Math.min(STATE_RANK[r.contract.state] ?? 9, STATE_RANK[r.license.state] ?? 9);
  return [...rows].sort((a, b) => rank(a) - rank(b)
    || (a.contract.days ?? 9e9) - (b.contract.days ?? 9e9));
}

/** خلاصةٌ تُقرأ بنظرة. والمستقرّ (مبيع/مؤجَّر) خارج كل عدّ — لا يُلاحَق ولا يُنبَّه عليه. */
export function summary(rows) {
  const live = rows.filter((r) => !r.settled);
  return {
    total: live.length,
    noContract: live.filter((r) => r.contract.state === 'none').length,
    contractExpiring: live.filter((r) => r.contract.state === 'soon').length,
    contractExpired: live.filter((r) => r.contract.state === 'expired').length,
    noLicense: live.filter((r) => r.license.state === 'none').length,
    licenseExpiring: live.filter((r) => r.license.state === 'soon').length,
    licenseExpired: live.filter((r) => r.license.state === 'expired').length,
    advertisable: live.filter((r) => r.blockers.length === 0).length,
    settled: rows.length - live.length,
  };
}

/**
 * سطرٌ يُذيَّل به الإعلان: الترخيص والوسيط — وهو ما يوجبه النظام أن يُبيَّن.
 * يعيد '' إن لم يكن ثمّ ترخيص، فلا يُكتب سطرٌ يوهم بترخيصٍ لا وجود له.
 */
export function adDisclosure(property, company = {}) {
  const number = property?.adLicense?.number;
  if (!number) return '';
  const parts = [`ترخيص إعلان عقاري رقم ${number}`];
  if (company.licenseNumber) parts.push(`رخصة فال ${company.licenseNumber}`);
  if (company.name) parts.push(company.name);
  return parts.join(' · ');
}

/** حالة رخصة فال للمنشأة — بلا سريانها لا عقدَ ولا إعلان. */
export function falState(company = {}, opts = {}) {
  const number = String(company.licenseNumber || '').trim();
  if (!number) return { state: 'none', days: null, endsAt: null, number: '' };
  if (!company.licenseExpiresAt) return { state: 'active', days: null, endsAt: null, number, undated: true };
  return { ...spanState(company.licenseExpiresAt, opts), number, undated: false };
}

/* ===== ما ينتهي قريبًا (المرحلة ٤٨) ===== */

/** المهلةُ التي يُنبَّه فيها على ما يوشك: شهرٌ يكفي لإجراءٍ في منصّةٍ حكوميّة. */
export const EXPIRY_HORIZON_DAYS = 30;

/**
 * **ما ينتهي خلال شهر** — رخصتُك، وتراخيصُ إعلاناتك، مجموعةً في صفٍّ واحد.
 *
 * `falState` و`adLicenseState` مبنيّتان منذ المرحلة ٤٠، **وكانتا تُستدعيان في صفحة
 * «العقود والتراخيص» وحدها** — صفحةٍ تُفتح قصدًا، ومن يفتحها يعرف أصلًا أنّ عنده ما ينتهي.
 * فكان التاريخُ يُسجَّل ولا يُنبَّه عليه، وهو عكسُ ما وُضع له.
 *
 * **وترتيبُ الخطر ليس ترتيبَ التاريخ:** رخصةُ «فال» أوّلًا مهما بعُد أجلُها، لأنّ انتهاءها
 * يُبطل التوثيقَ وإصدارَ التراخيص جميعًا — لا ترخيصًا واحدًا. ثمّ المنتهي، ثمّ الموشك.
 *
 * @param {Set<string>} o.publishedIds معرّفاتُ ما هو منشورٌ الآن — فالمنشورُ بترخيصٍ
 *   منتهٍ مخالفةٌ قائمةٌ اللحظةَ لا خطرٌ مستقبليّ، ويُقال ذلك بنصّه.
 * @returns {{ fal, rows, expired, soon, publishedExpired, worst }}
 */
export function expiryAlerts({
  company = {}, properties = [], publishedIds = new Set(),
  soonDays = EXPIRY_HORIZON_DAYS, now = Date.now(),
} = {}) {
  const fal = falState(company, { soonDays, now });
  const settled = new Set(['sold', 'rented']);

  const rows = [];
  for (const p of properties) {
    if (p.captureStatus !== 'approved' || settled.has(p.status)) continue;
    const lic = adLicenseState(p, { soonDays, now });
    // بلا ترخيصٍ أصلًا ليس انتهاءً: تلك ثغرةٌ تُعرض في «العقود والتراخيص» لا تنبيهٌ يوميّ.
    if (lic.state !== 'soon' && lic.state !== 'expired') continue;
    rows.push({ property: p, ...lic, published: publishedIds.has(p.id) });
  }
  rows.sort((a, b) => (a.days ?? 9e9) - (b.days ?? 9e9));

  const expired = rows.filter((r) => r.state === 'expired').length;
  const publishedExpired = rows.filter((r) => r.state === 'expired' && r.published).length;
  const falBad = fal.state === 'expired' || fal.state === 'soon';

  return {
    // بلا تاريخٍ مسجَّلٍ لا تنبيه: لا يُخمَّن أجلُ رخصةٍ لم تُدخل مدّتها.
    fal: falBad ? fal : null,
    rows,
    expired,
    soon: rows.length - expired,
    publishedExpired,
    worst: fal.state === 'expired' || expired ? 'expired' : (falBad || rows.length ? 'soon' : 'none'),
  };
}

/** ترخيصٌ يوشك — لا يمنع النشر، لكنّه يُقال قبله لا بعده. */
export function expiringSoon(property, opts = {}) {
  const lic = adLicenseState(property, { soonDays: EXPIRY_HORIZON_DAYS, ...opts });
  return lic.state === 'soon' ? lic : null;
}
