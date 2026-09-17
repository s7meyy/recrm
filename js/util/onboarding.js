// «ابدأ من هنا» وحالاتُ الفراغ التي تفعل (المرحلة ٤٧).
//
// من يفتح النظام أوّلَ مرّةٍ يرى داشبوردًا فارغًا: أصفارٌ في شريطٍ، ولوحاتٌ تقول «لا
// بيانات بعد». وهذا صادق، لكنّه لا يقول **ماذا أفعل الآن**. فيخرج ولا يعود.
//
// والخطواتُ ليست دورةً تعليميّة: خمسُ خطواتٍ يُستفاد من كلٍّ منها وحدَها، وتُرى
// **محقَّقةً من بياناتك نفسِها** لا من علامةٍ تُرفع بالنقر. من كتب اسم مكتبه فقد أنجز
// الأولى سواءٌ مرّ بهذه البطاقة أم لم يمرّ.
//
// **والبطاقةُ تختفي حين تُنجَز كلُّها** — ولا تبقى تذكيرًا لمن فرغ منها.

/**
 * خطواتُ البدء وحالُ كلٍّ منها، محسوبةً من بياناتك.
 * @returns {[{ key, title, hint, href, cta, done }]}
 */
export function startSteps({
  company = {}, clients = [], properties = [], requests = [], matches = [],
  backup = {},
} = {}) {
  const approved = properties.filter((p) => p.captureStatus === 'approved');
  return [
    {
      key: 'company',
      title: 'اكتب اسم مكتبك',
      hint: 'يظهر على كل ورقةٍ تطبعها: العقد، والفاتورة، وسند القبض، وكشف المالك.',
      href: '#/settings',
      cta: 'الإعدادات',
      done: !!String(company.name || '').trim(),
    },
    {
      key: 'property',
      title: 'أضِف أوّل عقارٍ في مخزونك',
      hint: 'المدينةُ والحيّ والنوعُ والسعر تكفي للبداية — والباقي يُكمَّل متى عرفتَه.',
      href: '#/properties',
      cta: 'العقارات',
      done: approved.length > 0,
    },
    {
      key: 'client',
      title: 'سجّل أوّل عميلٍ وطلبَه',
      hint: 'الطلبُ هو ما يُطابَق بمخزونك — وبغيره لا مطابقةَ ولا تنبيه.',
      href: '#/clients',
      cta: 'العملاء',
      done: clients.length > 0 && requests.length > 0,
    },
    {
      // الخطوةُ التي **تُري** النظامَ يعمل بدل أن تشرحه: طلبٌ يلتقي بمخزونك فيخرج مرشَّح.
      key: 'match',
      title: 'شاهد أوّل مطابقة',
      hint: 'الطلبُ يلتقي بمخزونك فتخرج قائمةُ مرشَّحين مرتّبةً — هذا هو النظام في سطر.',
      href: '#/matches',
      cta: 'المطابقات',
      done: matches.length > 0,
    },
    {
      key: 'backup',
      title: 'خُذ نسخةً احتياطيّة',
      hint: 'بياناتُك في هذا الجهاز وحده. نسخةٌ اليوم تُغنيك عن ندمٍ بعد شهر.',
      href: '#/tools',
      cta: 'الأدوات',
      done: !!backup.lastExportAt,
    },
  ];
}

/**
 * **يومُ الموظّف الأوّل** (المرحلة ٤٩).
 *
 * `startSteps` أعلاه تقيس **بدايةَ المكتب**: أكتبتَ اسمَه؟ أضفتَ عقارًا؟ نشرتَ؟ وهي
 * نافعةٌ ليومك الأوّل أنت. **ولم يكن شيءٌ ليوم الموظّف الأوّل**: يُفتح له الجهازُ فيرى
 * نظامًا كاملًا بعشرين صفحة، ولا يعرف من أين يبدأ ولا ما المطلوبُ منه. وأنت تشرح له
 * بلسانك، ثم تشرح للذي بعده.
 *
 * **وهذه تُقرأ ممّا أُسند إليه هو** لا من حال المكتب: «عندك ٣ عقاراتٍ مسندة · عميلان
 * لم تتواصل معهما · هدفُك هذا الشهر صفقتان».
 *
 * **ولا تُعرض لمن لا فريقَ له** — الواجبُ على من يستدعيها: مكتبٌ من شخصٍ واحدٍ لا
 * موظّفَ فيه يُوجَّه.
 *
 * @returns {[{ key, title, hint, href, cta, done, count }]}
 */
export function memberSteps({
  meId = '', properties = [], clients = [], requests = [], deals = [], goal = null,
  lastContactOf = () => null, now = Date.now(),
} = {}) {
  const mine = (rows) => rows.filter((r) => r.assignedTo === meId);
  const myProperties = mine(properties);
  const myClients = mine(clients);
  const myRequests = mine(requests);
  const myDeals = mine(deals);

  // «لم يتواصل معه» هنا: **بلا أيّ تواصلٍ مسجَّل** لا «تأخّر عن الحدّ» — الموظّفُ
  // الجديد لم يمضِ عليه حدٌّ أصلًا، والسؤالُ الأوّلُ: أبدأتَ أم لم تبدأ؟
  const untouched = myClients.filter((c) => !lastContactOf(c));

  const month = new Date(now).toISOString().slice(0, 7);
  const monthDeals = myDeals.filter((d) => String(d.date || '').slice(0, 7) === month).length;
  const target = Number(goal?.dealsPerMonth) || 0;

  return [
    {
      key: 'myProperties',
      title: myProperties.length ? `عقاراتُك المسندة: ${myProperties.length}` : 'لا عقارَ مسندٌ إليك بعد',
      hint: 'ما أُسند إليك من المخزون — تعرفه وتعرضه وتتابع مالكيه.',
      href: '#/properties', cta: 'العقارات',
      done: myProperties.length > 0, count: myProperties.length,
    },
    {
      key: 'myClients',
      title: untouched.length ? `${untouched.length} من عملائك لم تتواصل معهم بعد` : 'تواصلتَ مع كلّ من أُسند إليك',
      hint: 'أوّلُ مكالمةٍ هي الفرقُ بين اسمٍ في جدولٍ وعميلٍ يعرفك.',
      href: '#/clients', cta: 'العملاء',
      done: myClients.length > 0 && untouched.length === 0, count: untouched.length,
    },
    {
      key: 'myRequests',
      title: myRequests.length ? `طلباتُك النشطة: ${myRequests.filter((r) => r.status === 'active').length}` : 'لا طلبَ مسندٌ إليك',
      hint: 'الطلبُ يُطابَق بالمخزون فتخرج لك قائمةُ مرشَّحين مرتّبة.',
      href: '#/requests', cta: 'الطلبات',
      done: myRequests.some((r) => r.status === 'active'), count: myRequests.length,
    },
    {
      key: 'myGoal',
      title: target ? `هدفُك هذا الشهر: ${target} — أنجزتَ ${monthDeals}` : 'لا هدفَ مُسجَّلٌ لك هذا الشهر',
      hint: target ? 'يُقاس بالصفقات المسندة إليك وحدها.' : 'يضبطه مديرُ المكتب في الإعدادات.',
      href: '#/today', cta: 'يومي',
      done: target > 0 && monthDeals >= target, count: monthDeals,
    },
  ];
}

/** ما أُنجز من الخطوات وما بقي — وأوّلُ ما ينتظرك. */
export function startProgress(steps = []) {
  const done = steps.filter((s) => s.done).length;
  return {
    done,
    total: steps.length,
    complete: steps.length > 0 && done === steps.length,
    next: steps.find((s) => !s.done) || null,
    pct: steps.length ? Math.round((done / steps.length) * 100) : 0,
  };
}

/**
 * هل تُعرض بطاقةُ البدء؟
 *
 * تُعرض ما بقيت خطوةٌ لم تُنجَز، **ما لم يُخفِها صاحبُها بنفسه**. وإخفاؤها قرارُه لا
 * قرارُنا: من عرف طريقه لا يُلاحَق ببطاقةٍ في كل فتحة. وحين تُنجَز كلُّها تختفي وحدها،
 * فلا يحتاج إلى إخفائها أصلًا.
 */
export function shouldShowStart(steps = [], ui = {}) {
  if (ui.startCardHidden) return false;
  return !startProgress(steps).complete;
}
