// رمز الفاتورة الضريبية المبسّطة (المرحلة ١٩).
//
// هيئة الزكاة والضريبة والجمارك تشترط في الفاتورة المبسّطة رمز QR يحمل خمسة حقول
// بترميز **TLV** (وسم، طول، قيمة) ثم يُرمَّز الناتج Base64:
//   ١ اسم البائع · ٢ الرقم الضريبي · ٣ الطابع الزمني · ٤ الإجمالي شاملًا الضريبة · ٥ مبلغ الضريبة
//
// **حدّ هذا الملف صريح:** يبني الرمز بالشكل المطلوب ولا أكثر. أما «المرحلة الثانية»
// (الربط والتكامل مع الهيئة والختم التشفيري ورقم التسلسل الموقَّع) فتحتاج حلًّا معتمدًا
// من الهيئة وشهادة رقمية — ولا يمكن لتطبيق يعمل في متصفحك وحده أن يقوم بها، ولا يدّعيها.
//
// دوال خالصة؛ لا تلمس التخزين ولا الشبكة.

/** بايتات UTF-8 لنصّ. */
function utf8(text) {
  return new TextEncoder().encode(String(text ?? ''));
}

/**
 * وسم TLV واحد: [الوسم، الطول بالبايت، القيمة].
 * القيمة أطول من ٢٥٥ بايت لا تُمثَّل ببايت طول واحد، فتُقصّ — والأسماء الطويلة نادرة،
 * والقصّ أسلم من رمزٍ لا يُقرأ أصلًا.
 */
function tlv(tag, value) {
  let bytes = utf8(value);
  if (bytes.length > 255) bytes = bytes.slice(0, 255);
  return [tag, bytes.length, ...bytes];
}

/** رقم بمنزلتين عشريتين بأرقام لاتينية — هكذا تتوقّعه القارئات. */
function amount(n) {
  return (Math.round((Number(n) || 0) * 100) / 100).toFixed(2);
}

/**
 * @param {{ sellerName, vatNumber, timestamp, total, vat }} input
 *   `timestamp`: ISO 8601 (يُفضَّل بتوقيت Z)، و`total` شاملًا الضريبة.
 * @returns {string} Base64 جاهز للترميز في QR
 */
export function zatcaTlvBase64({ sellerName = '', vatNumber = '', timestamp = '', total = 0, vat = 0 } = {}) {
  const bytes = [
    ...tlv(1, sellerName),
    ...tlv(2, vatNumber),
    ...tlv(3, timestamp),
    ...tlv(4, amount(total)),
    ...tlv(5, amount(vat)),
  ];
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

/** هل يكتمل شرط الرمز؟ بلا اسم بائع ورقم ضريبي لا معنى له. */
export function zatcaReady({ sellerName = '', vatNumber = '' } = {}) {
  return !!String(sellerName).trim() && !!String(vatNumber).trim();
}
