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
