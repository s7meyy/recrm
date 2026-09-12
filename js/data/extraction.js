// واجهة الاستخراج الآلي لبيانات اللوحة — قابلة للتوصيل بأي نموذج رؤية لاحقًا دون تغيير بقية التطبيق.
// القرار الحالي (بموافقة صريحة): لا مزوّد مُهيَّأ بعد. isConfigured() تعيد false دائمًا،
// وextractSignboard() تعيد NOT_CONFIGURED دائمًا، فيبقى المسار اليدوي الكامل (إدخال الحقول
// بالنظر إلى الصورة في شاشة الاعتماد) هو الطريق الوحيد — وهذا صالح تمامًا بنص عقد المرحلة ٢.
//
// لتفعيل مزوّد لاحقًا (مثلًا Gemini): نفّذ الاستدعاء الفعلي هنا فقط (fetch مباشر من المتصفح
// بمفتاح API يُخزَّن في الإعدادات)، بدّل isConfigured() لتعكس وجود المفتاح، ولا حاجة لتغيير
// tour-capture.js أو tour-approve.js إطلاقًا — كلاهما يستدعي هذا الملف فقط.

export const NOT_CONFIGURED = 'NOT_CONFIGURED';

/** هل يوجد مزوّد استخراج مُهيَّأ الآن؟ تُستعمل لإخفاء أزرار "استخرج تلقائيًا" من الواجهة. */
export function isConfigured() {
  return false;
}

/**
 * يحاول استخراج حقول من صورة اللوحة. لا يرمي أبدًا.
 * الشكل المتوقَّع لاحقًا عند تفعيل مزوّد: { ok: true, fields: { name, phone, notes } }
 * @param {Blob} _signboardBlob
 * @returns {Promise<{ ok: false, reason: string } | { ok: true, fields: object }>}
 */
export async function extractSignboard(_signboardBlob) {
  return { ok: false, reason: NOT_CONFIGURED };
}
