// قوالب التقرير — نفس المحتوى في ثلاثة مقاسات، لأن كل مُستقبِل يريد مقاسًا.
// لا يُحذف معنى ولا يُضاف؛ إنما تُنتقى الأقسام ويُضبط الإخراج.

export const TEMPLATES = {
  full: {
    id: 'full', name: 'كامل', note: 'كل الأقسام، مع المواضيع وتوزيع النجوم والصور — للأرشفة والعرض الرسمي.',
    sections: null,            // null = كل شيء
    show: { toc: true, stars: true, topics: true, photos: true, recency: true, quotes: true },
  },
  exec: {
    id: 'exec', name: 'تنفيذي', note: 'الخلاصة والأرقام والشكاوى والتوصيات فقط — صفحتان لصاحب القرار.',
    sections: [/خلاص|تنفيذي/, /أرقام|قراءة/, /ضعف|شكاو/, /زمن|اتجاه/, /توصي|خطة/],
    show: { toc: false, stars: true, topics: true, photos: false, recency: true, quotes: false },
  },
  brief: {
    id: 'brief', name: 'صفحة واحدة', note: 'الخلاصة وأبرز الشكاوى والتوصيات — صالح للإرسال في محادثة.',
    sections: [/خلاص|تنفيذي/, /توصي|خطة/],
    show: { toc: false, stars: true, topics: false, photos: false, recency: true, quotes: false },
  },
};

export const DEFAULT_TEMPLATE = 'full';

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
