// دور مستعمل هذا الجهاز (المرحلة ٣٥).
//
// **وحدّه معلَن بصراحة:** التطبيق يعمل على بيانات هذا المتصفح (IndexedDB)، فمن فتح الجهاز
// وصل إلى ما فيه مهما أخفت الواجهة. فـ«حساب المساعد» هنا ثلاثة أشياء صادقة، لا رابع:
//   ١) **بابٌ ثانٍ**: كلمة سرّ تعطيها وتسحبها وحدها، بلا أن تغيّر كلمتك أنت.
//   ٢) **حجبٌ في الواجهة**: العمولات وأرقام المالك تُخفى افتراضيًا (بآلية «وضع العرض
//      للعميل» نفسها القائمة منذ المرحلة ١٣) — يقلّل ما يقع عليه البصر عرَضًا.
//   ٣) **منعٌ حقيقي على الخادم**: الخزنة السحابية لا تُرفع ولا تُسترجع بدور المساعد،
//      والمنع في الدالة نفسها لا في زرٍّ مخفيّ.
//
// أما فصلُ البيانات فعلًا فيحتاج خادمًا يحفظها ويصرّح بها سجلًّا سجلًّا — وذلك تحوّلٌ في
// بنية النظام لا إعدادٌ يُضاف، ولم يُدَّعَ هنا.

import { readPublicApi } from './public-api.js';

let cached = null;

/** `'owner'` أو `'assistant'` أو null (بلا بوابة مضبوطة). */
export async function currentRole() {
  if (cached !== null) return cached;
  const res = await readPublicApi('/api/me', { role: null });
  cached = res?.role ?? null;
  return cached;
}

/** يضع سمة الدور على `<body>` فتسري قواعد الإخفاء. */
export async function applyRole() {
  const role = await currentRole();
  document.body.classList.toggle('assistant-mode', role === 'assistant');
  return role;
}
