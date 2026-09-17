// قوالب التقرير — نفس المحتوى في ثلاثة مقاسات، لأن كل مُستقبِل يريد مقاسًا.
// لا يُحذف معنى ولا يُضاف؛ إنما تُنتقى الأقسام ويُضبط الإخراج.

/**
 * قوالب القطاعات — العيادة ليست كالمقهى.
 *
 * التقرير كان قالبًا واحدًا للجميع، ومحاور `hints` توجّه النموذج ولا تغيّر
 * **بنية** التقرير. فهذه تُغيّر ما يُعرَض وما يُقدَّم: العيادة يتصدّرها
 * الانتظار والطاقم، والتوصيل يتصدّره مسار الطلب، والجمعية لا تُقاس بالسعر.
 *
 * ولا يُحذف قسمٌ فيه بيانات: الترتيب يتغيّر والإبراز يتغيّر، والمحتوى باقٍ.
 */
export const SECTOR_PRESETS = {
  food:     { name: 'مطاعم ومقاهٍ', lead: ['quality', 'wait', 'price', 'clean'], show: { photos: true, timing: true, sources: true } },
  health:   { name: 'صحة وعيادات', lead: ['wait', 'service', 'clean', 'money'], show: { photos: false, timing: true, sources: false } },
  services: { name: 'خدمات مهنية', lead: ['service', 'hygiene_staff', 'price'], show: { photos: false, timing: false, sources: false } },
  shops:    { name: 'تجزئة ومعارض', lead: ['price', 'quality', 'service', 'parking'], show: { photos: true, timing: true, sources: true } },
  nonprofit: { name: 'جمعيات وخيرية', lead: ['service', 'hygiene_staff', 'access'], show: { photos: true, timing: false, sources: false } },
  beauty:   { name: 'تجميل وعناية', lead: ['service', 'clean', 'price', 'wait'], show: { photos: true, timing: true, sources: false } },
};

/** إعداد القطاع بحسب مجموعة التصنيف، أو الافتراضي. */
export function sectorFor(groupId) {
  return SECTOR_PRESETS[groupId] || { name: 'عام', lead: [], show: {} };
}

/* لكل قالبٍ خريطةُ عرضٍ **كاملة**: كل قسمٍ مذكورٌ فيها بنعم أو لا.
   وكانت تذكر بعضها فيرث الباقي قيمته الافتراضية (وهي «نعم»)، فقالبُ
   «صفحة واحدة» يُخرج خطة العمل وقائمة المتابعة وبطاقة النشر وملحقَ
   المسوّدات — فيصير عشر صفحات. والقالبُ الذي لا يضبط طولَه لا يضبط شيئًا.

   وأربعةُ أقسامٍ لا تسقط من أي قالبٍ فيه بيانات: «في سطور»، وحدودُ
   التغطية، ومقياسُ الثقة، والمنهجية. فالإيجازُ يكون باختصار التفصيل، لا
   بحذف ما يُقيّد الأرقام — وتقريرٌ موجزٌ بلا حدودِ تغطيته يُقرأ أوسع مما هو. */
export const TEMPLATES = {
  full: {
    id: 'full', name: 'كامل', note: 'كل الأقسام، مع المواضيع وتوزيع النجوم والصور — للأرشفة والعرض الرسمي.',
    sections: null,            // null = كل شيء
    show: {
      brief: true, coverage: true, confidence: true, toc: true, quotes: true,
      priority: true, actions: true, commit: true, checklist: true, drafts: true,
      voice: true, card: true, selfCompare: true, effect: true, promises: true,
      topics: true, cooccur: true, timing: true, recency: true, entities: true,
      replies: true, sources: true, stars: true, calc: true, impact: true,
      bias: true, photos: true,
      teaser: false,
      next: true,
    },
  },
  owner: {
    id: 'owner', name: 'لصاحب المنشأة', note: 'ما يُعمَل به: الخلاصة، والأولويات، وخطة العمل، وصوت العميل، وقائمة المتابعة. والتفصيلُ المنهجيّ يُختصَر ولا يُحذَف.',
    sections: [/خلاص|تنفيذي/, /ضعف|شكاو/, /توصي|خطة/, /زمن|اتجاه/],
    show: {
      brief: true, coverage: true, confidence: true, toc: false, quotes: true,
      priority: false, actions: true, commit: true, checklist: true, drafts: true,
      voice: true, card: true, selfCompare: true, effect: true, promises: true,
      topics: true, cooccur: false, timing: true, recency: true, entities: true,
      replies: true, sources: false, stars: true, calc: true, impact: true,
      bias: false, photos: false,
      teaser: false,
      next: true,
    },
  },
  exec: {
    id: 'exec', name: 'تنفيذي', note: 'الخلاصة والأرقام والشكاوى والتوصيات فقط — صفحتان لصاحب القرار.',
    sections: [/خلاص|تنفيذي/, /أرقام|قراءة/, /ضعف|شكاو/, /زمن|اتجاه/, /توصي|خطة/],
    show: {
      brief: true, coverage: true, confidence: true, toc: false, quotes: false,
      priority: false, actions: true, commit: false, checklist: false, drafts: false,
      voice: false, card: false, selfCompare: true, effect: true, promises: false,
      topics: true, cooccur: false, timing: false, recency: true, entities: true,
      replies: true, sources: false, stars: true, calc: false, impact: true,
      bias: false, photos: false,
      teaser: false,
      next: true,
    },
  },
  brief: {
    id: 'brief', name: 'صفحة واحدة', note: 'الخلاصة وأبرز الشكاوى والتوصيات — صالح للإرسال في محادثة.',
    sections: [/خلاص|تنفيذي/, /توصي|خطة/],
    show: {
      brief: true, coverage: true, confidence: true, toc: false, quotes: false,
      priority: false, actions: false, commit: false, checklist: false, drafts: false,
      voice: false, card: false, selfCompare: false, effect: false, promises: false,
      topics: false, cooccur: false, timing: false, recency: false, entities: false,
      replies: false, sources: false, stars: true, calc: false, impact: false,
      bias: false, photos: false,
      teaser: false,
      next: true,
    },
  },
  teaser: {
    id: 'teaser', name: 'عيّنة مجانية', note: 'صفحة واحدة تُرسَل لعميل محتمل: الأرقام وأبرز الشكاوى فقط، بلا توصيات — أداة بيع لا أداة تحليل.',
    sections: [/خلاص|تنفيذي/, /ضعف|شكاو/],
    show: {
      brief: true, coverage: true, confidence: true, toc: false, quotes: false,
      priority: false, actions: false, commit: false, checklist: false, drafts: false,
      voice: false, card: false, selfCompare: false, effect: false, promises: false,
      topics: true, cooccur: false, timing: false, recency: true, entities: true,
      replies: true, sources: false, stars: true, calc: false, impact: false,
      bias: false, photos: false,
      /* الراية داخل `show` كي تبلغ بانيَ التقرير: كانت خارجه فلا يراها أحد،
         فتخرج العيّنةُ بلا وسمٍ يقول إنها عيّنة. */
      teaser: true,
      /* و«ما بعد هذا التقرير» خطابٌ لعميلٍ اشترى: «المراجعة القادمة بعد 30
         يومًا» لا تُقال لمن لم يطلب بعد. */
      next: false,
    },
    teaser: true,
  },
};

export const DEFAULT_TEMPLATE = 'owner';

/** يقصّ التقرير على أقسام القالب، محافظًا على ترتيبها الأصلي ونصّها كما هو. */
export function applyTemplate(markdown, templateId) {
  const tpl = TEMPLATES[templateId] || TEMPLATES[DEFAULT_TEMPLATE];
  if (!tpl.sections) return String(markdown || '');

  const lines = String(markdown || '').split('\n');
  const headings = [];
  lines.forEach((l, i) => {
    const m = l.match(/^(#{1,6})\s+(.*)$/);
    if (m) headings.push({ i, level: m[1].length, title: m[2] });
  });
  if (!headings.length) return String(markdown || '');

  const top = Math.min(...headings.map((h) => h.level));
  const tops = headings.filter((h) => h.level === top);

  const keep = [];
  tops.forEach((h, k) => {
    if (!tpl.sections.some((re) => re.test(h.title))) return;
    const end = k + 1 < tops.length ? tops[k + 1].i : lines.length;
    keep.push(lines.slice(h.i, end).join('\n').trimEnd());
  });

  // لو لم يطابق شيء، فالقصّ يمحو التقرير — والأصل أولى من الفراغ.
  return keep.length ? keep.join('\n\n') : String(markdown || '');
}

/** الأقسام التي سيحذفها القالب — تُعرَض للمستخدم قبل الإخراج. */
export function droppedSections(markdown, templateId) {
  const tpl = TEMPLATES[templateId] || TEMPLATES[DEFAULT_TEMPLATE];
  if (!tpl.sections) return [];
  const heads = String(markdown || '').split('\n')
    .map((l) => l.match(/^(#{1,6})\s+(.*)$/)).filter(Boolean);
  if (!heads.length) return [];
  const top = Math.min(...heads.map((m) => m[1].length));
  return heads.filter((m) => m[1].length === top && !tpl.sections.some((re) => re.test(m[2])))
    .map((m) => m[2]);
}
