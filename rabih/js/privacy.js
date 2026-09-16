// وضع الخصوصية — أسماء أشخاصٍ حقيقيين في ملفٍّ يخرج من يدك.
//
// التقرير لا يذكر أسماء المعلّقين، لكن **تصدير Excel يحمل عمود «الكاتب»**
// بأسماء حقيقية، وقد يُسلَّم للعميل. وتعليقات قوقل منشورةٌ علنًا، لكن جمعها
// في ملفٍّ وتسليمه لطرفٍ ثالث معالجةٌ لبياناتٍ شخصية — ونظام حماية البيانات
// الشخصية السعودي يحكمها.
//
// **والقاعدة هنا كالقاعدة في كل شيء**: لا يُمسّ نصّ تعليقٍ ولا تقييمه.
// الاسم وحده يُستبدَل فيما يخرج منك، ويبقى في أرشيفك كما ورد. والمعرّف
// (R001) يبقى، فيظلّ التحقّق ممكنًا.

const KEY = 'rabih:privacy';

export const isOn = () => {
  try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
};

export function setOn(on) {
  try { localStorage.setItem(KEY, on ? '1' : '0'); return true; } catch { return false; }
}

/** اسمٌ بديل ثابت لكل كاتب: «زائر ٣» لا يتغيّر بين تصديرين. */
export function pseudonymize(reviews = []) {
  const map = new Map();
  let n = 0;
  return reviews.map((r) => {
    const raw = (r.author || '').trim();
    if (!raw) return { ...r, author: '' };
    if (!map.has(raw)) { n += 1; map.set(raw, `زائر ${n}`); }
    return { ...r, author: map.get(raw) };
  });
}

/** منشأةٌ بأسماء مستعارة — تُستعمل عند التصدير والنشر، لا في أرشيفك. */
export function shield(place) {
  if (!isOn() || !place) return place;
  return { ...place, reviews: pseudonymize(place.reviews || []) };
}

/** سطرٌ يُكتب في التقرير: من أين البيانات، وكيف عوملت. */
export function notice() {
  return isOn()
    ? 'أسماء كتّاب التعليقات مُستبدَلة بأسماء مستعارة في هذا الملف حمايةً لخصوصيتهم. والنصوص والتقييمات كما وردت، ومعرّفاتها ثابتة للتحقّق.'
    : 'التعليقات وأسماء كتّابها منشورةٌ علنًا في خرائط قوقل، ونُقلت كما وردت.';
}
