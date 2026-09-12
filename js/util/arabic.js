// تطبيع النص العربي للبحث والمقارنة.
// يوحّد الهمزات والتاء المربوطة والألف المقصورة والأرقام العربية،
// ويفكّ صور العرض (Presentation Forms) عبر NFKC،
// ويزيل التشكيل والتطويل والمحارف الخفية.

const TASHKEEL = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g;
const TATWEEL = /\u0640/g;
const INVISIBLE = /[\u00AD\u061C\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g;
const ARABIC_INDIC_DIGITS = /[\u0660-\u0669\u06F0-\u06F9]/g;

/** يحوّل الأرقام العربية (٠-٩) والفارسية (۰-۹) إلى أرقام إنجليزية. */
export function foldDigits(value) {
  return String(value ?? '').replace(ARABIC_INDIC_DIGITS, (d) => {
    const code = d.charCodeAt(0);
    return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);
  });
}

/** الصورة المطبَّعة للنص: تُخزَّن في searchKey وتُستعمل للمقارنة. */
export function normalizeArabic(value) {
  let s = String(value ?? '');
  if (!s) return '';
  try { s = s.normalize('NFKC'); } catch (_) { /* متصفح لا يدعم normalize */ }
  s = s.replace(INVISIBLE, '').replace(TASHKEEL, '').replace(TATWEEL, '');
  s = foldDigits(s);
  s = s
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/[ىی]/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ک/g, 'ك');
  s = s.toLowerCase()
    .replace(/[^\p{L}\p{N}\s@._+-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return s;
}

/** مفتاح متسامح: يحذف الألف كلها حتى تتطابق "الياسمين" مع "اليسمين". */
export function looseKey(value) {
  return normalizeArabic(value).replace(/ا/g, '');
}

/** يبني searchKey من أجزاء متعددة (تُهمَل الفارغة). */
export function buildSearchKey(parts) {
  return normalizeArabic(parts.filter((p) => p != null && p !== '').join(' '));
}

/**
 * هل يطابق searchKey (مطبَّع مسبقًا) الاستعلام؟
 * كل كلمة في الاستعلام يجب أن تظهر، إما مطابقة مطبَّعة أو مطابقة متسامحة (بلا ألف).
 */
export function matchesQuery(searchKey, query) {
  const q = normalizeArabic(query);
  if (!q) return true;
  const key = String(searchKey ?? '');
  const keyLoose = key.replace(/ا/g, '');
  return q.split(' ').every((token) => key.includes(token) || keyLoose.includes(token.replace(/ا/g, '')));
}
