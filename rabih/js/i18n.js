// نسخةٌ إنجليزية من التقرير — لمالكٍ أجنبي أو إدارةٍ إقليمية.
//
// **والقاعدة التي لا تُخرَق**: تُترجَم العناوين والأرقام وأسماء المحاور —
// وهي كلماتٌ نكتبها نحن. **ولا يُترجَم كلام العميل**: يبقى بالعربية كما
// قيل، ومعه ترجمةٌ بجانبه لا بدلًا منه متى توفّرت.
//
// لأن ترجمة شهادةٍ إتلافٌ لها: «المكان زفت» ليست «the place is not good».
// ومن نقل الشهادة مترجمةً وحدها فقد سلّم القارئ رأيَ المترجم لا قول الشاهد.

export const LANGS = { ar: 'العربية', en: 'English' };

/** مفاتيح ما نكتبه نحن — لا ما يكتبه الناس. */
const DICT = {
  'تقرير تحليلي عن': 'Analytical report on',
  'مبنيّ على تقييمات وتعليقات العملاء المنشورة في خرائط قوقل': 'Based on customer ratings and reviews published on Google Maps',
  'التصنيف': 'Category',
  'المدينة': 'City',
  'الحي': 'District',
  'متوسط التقييم': 'Average rating',
  'عدد التقييمات': 'Total ratings',
  'تاريخ التقرير': 'Report date',
  'المحتويات': 'Contents',
  'توزيع التقييمات في العيّنة': 'Rating distribution in the sample',
  'مقياس الثقة في هذا التقرير': 'Confidence in this report',
  'أولويات الإصلاح — بماذا تبدأ': 'Fix priorities — where to start',
  'ما يجتمع من الشكاوى': 'Complaints that co-occur',
  'متى تقع الشكوى؟': 'When do complaints happen?',
  'وعودٌ سابقة — وما جرى بعدها': 'Past promises — and what followed',
  'صوت العميل — بنصّه': 'Customer voice — verbatim',
  'ما الذي يلزم لرفع التقييم': 'What it takes to raise the rating',
  'تقدير الأثر المالي — بافتراضاتك': 'Financial impact — on your assumptions',
  'مقارنة المصادر': 'Source comparison',
  'هل عيّنتك تمثّل منشأتك؟': 'Is your sample representative?',
  'أثر الخطة السابقة — مقيسًا': 'Effect of the previous plan — measured',
  'المنهجية وحدود هذا التقرير': 'Methodology and limits of this report',
  'أمانة النقل': 'Fidelity of transcription',
  'توقيع التقرير': 'Report signature',
  'الموضوع': 'Topic', 'الوزن': 'Weight', 'الشواهد': 'Evidence', 'لماذا': 'Why',
  'المهمة': 'Task', 'الفرق': 'Change', 'الهدف': 'Target',
  'المصدر': 'Source', 'التعليقات': 'Reviews', 'المتوسط': 'Average',
  'نسبة السلبي': 'Negative share', 'النجوم': 'Stars', 'المعلَن في قوقل': 'Declared on Google',
  'في عيّنتك': 'In your sample', 'الحكم': 'Verdict',
  'من 5': 'of 5', 'بلا تقييم': 'no rating',
};

/** نصٌّ ثنائي: الإنجليزية عنوانًا والعربية تحته — لا بدلًا منها. */
export function bi(ar, lang = 'ar') {
  if (lang !== 'en') return ar;
  const en = DICT[ar];
  return en ? `${en} <span class="ar-sub">${ar}</span>` : ar;
}

/**
 * يحوّل عناوين تقريرٍ جاهز إلى ثنائي اللغة.
 *
 * ويعمل على العناوين ورؤوس الجداول وحدها — أي على ما كتبناه. ونصوص
 * التعليقات داخل `blockquote` لا تُمسّ بحال.
 */
export function bilingual(html, lang = 'ar') {
  if (lang !== 'en') return html;

  /* يُمرّ على العناوين ورؤوس الجداول وحدها — أي على ما كتبناه نحن.
     ونصّ التعليق داخل blockquote لا يمرّ من هنا بحال. */
  const out = String(html).replace(/<(h1|h2|h3|th)([^>]*)>([^<]+)<\/\1>/g, (m, tag, attrs, inner) => {
    const key = inner.trim();
    const en = DICT[key];
    if (!en) return m;
    return `<${tag}${attrs}>${en} <span class="ar-sub">${key}</span></${tag}>`;
  });

  const note = `<p class="lang-note"><b>Note:</b> customer quotes are kept in their original Arabic, verbatim.
    Translating a testimony alters it — the numbers and headings are translated, the words of customers are not.</p>`;
  return out.replace('</main>', `${note}</main>`);
}
