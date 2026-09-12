// قارئ EXIF مبسّط للصور — يستخرج فقط إحداثيات GPS وتاريخ الالتقاط (DateTimeOriginal)، مكتوب يدويًا
// بلا مكتبة خارجية. يجب استدعاؤه على الملف الأصلي قبل الضغط، لأن الضغط عبر canvas (images.js)
// يزيل EXIF بالكامل. يدعم JPEG فقط — صيغة HEIC (افتراضية في آيفون) لا تُقرأ هنا؛ استعمل
// "الأكثر توافقًا (JPEG)" من إعدادات كاميرا الجهاز إن أردت استفادة كاملة من هذا القارئ.
// لا يرمي أبدًا: عند أي تعذّر يعيد { lat: null, lng: null, takenAt: null } بصمت.

const EMPTY = { lat: null, lng: null, takenAt: null };
const TYPE_SIZES = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 9: 4, 10: 8 };

function ascii(view, offset, length) {
  let s = '';
  for (let i = 0; i < length; i++) s += String.fromCharCode(view.getUint8(offset + i));
  return s;
}

/** يبحث عن جزء APP1/Exif في JPEG ويعيد إزاحة بداية بيانات TIFF، أو null. */
function findTiffStart(view) {
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return null; // ليست JPEG (SOI)
  let offset = 2;
  while (offset + 4 <= view.byteLength) {
    const marker = view.getUint16(offset);
    if ((marker & 0xff00) !== 0xff00) break;
    if (marker === 0xffd8 || marker === 0xffd9 || marker === 0xffda) break; // بداية/نهاية الصورة أو بيانات المسح
    const size = view.getUint16(offset + 2);
    if (marker === 0xffe1 && offset + 4 + 6 <= view.byteLength && ascii(view, offset + 4, 6) === 'Exif\0\0') {
      return offset + 4 + 6;
    }
    if (size < 2) break;
    offset += 2 + size;
  }
  return null;
}

function readIFD(view, ifdOffset, little) {
  const count = view.getUint16(ifdOffset, little);
  const entries = {};
  for (let i = 0; i < count; i++) {
    const entryOffset = ifdOffset + 2 + i * 12;
    entries[view.getUint16(entryOffset, little)] = {
      type: view.getUint16(entryOffset + 2, little),
      num: view.getUint32(entryOffset + 4, little),
      valueOffset: entryOffset + 8,
    };
  }
  return entries;
}

/** إزاحة البيانات الفعلية لمُدخل IFD (مباشرة إن كانت ٤ بايت فأقل، وإلا عبر مؤشر). */
function dataOffset(view, tiffStart, entry, little) {
  const size = (TYPE_SIZES[entry.type] || 1) * entry.num;
  return size > 4 ? tiffStart + view.getUint32(entry.valueOffset, little) : entry.valueOffset;
}

function readLong(view, entry, little) {
  return view.getUint32(entry.valueOffset, little); // LONG بعدد ١ يُخزَّن مباشرة (٤ بايت)
}

function readRational(view, offset, little) {
  const num = view.getUint32(offset, little);
  const den = view.getUint32(offset + 4, little);
  return den ? num / den : 0;
}

/** درجات/دقائق/ثوانٍ (٣ كسور متتالية) إلى قيمة عشرية واحدة. */
function readDMS(view, tiffStart, entry, little) {
  const off = dataOffset(view, tiffStart, entry, little);
  const d = readRational(view, off, little);
  const m = readRational(view, off + 8, little);
  const s = readRational(view, off + 16, little);
  return d + m / 60 + s / 3600;
}

function readAscii(view, tiffStart, entry, little) {
  const off = dataOffset(view, tiffStart, entry, little);
  let s = '';
  for (let i = 0; i < entry.num - 1; i++) s += String.fromCharCode(view.getUint8(off + i)); // بلا الصفر الختامي
  return s;
}

/** "YYYY:MM:DD HH:MM:SS" (صيغة Exif القياسية) إلى ISO. */
function parseExifDate(text) {
  const m = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(text || '');
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  const date = new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * يقرأ GPS وتاريخ الالتقاط من ملف صورة أصلي (قبل أي ضغط). JPEG فقط. لا يرمي أبدًا.
 * @param {File} file
 * @returns {Promise<{ lat: number|null, lng: number|null, takenAt: string|null }>}
 */
export async function readImageMeta(file) {
  try {
    if (!file) return EMPTY;
    // أول ٢٥٦ ك.ب تكفي عمليًا لبيانات EXIF (تسبق بيانات الصورة نفسها في JPEG القياسي).
    const buf = await file.slice(0, 262144).arrayBuffer();
    const view = new DataView(buf);
    const tiffStart = findTiffStart(view);
    if (tiffStart == null || tiffStart + 8 > view.byteLength) return EMPTY;

    const byteOrder = view.getUint16(tiffStart);
    const little = byteOrder === 0x4949; // "II"
    if (byteOrder !== 0x4949 && byteOrder !== 0x4d4d) return EMPTY; // ليس "II" ولا "MM"

    const ifd0Offset = tiffStart + view.getUint32(tiffStart + 4, little);
    const ifd0 = readIFD(view, ifd0Offset, little);

    let takenAt = null;
    if (ifd0[0x8769]) { // ExifIFDPointer → DateTimeOriginal (0x9003) أدق من DateTime في IFD0
      const exifIfd = readIFD(view, tiffStart + readLong(view, ifd0[0x8769], little), little);
      if (exifIfd[0x9003]) takenAt = parseExifDate(readAscii(view, tiffStart, exifIfd[0x9003], little));
    }
    if (!takenAt && ifd0[0x0132]) takenAt = parseExifDate(readAscii(view, tiffStart, ifd0[0x0132], little));

    let lat = null;
    let lng = null;
    if (ifd0[0x8825]) { // GPSInfoIFDPointer
      const gps = readIFD(view, tiffStart + readLong(view, ifd0[0x8825], little), little);
      if (gps[0x0002] && gps[0x0004]) {
        lat = readDMS(view, tiffStart, gps[0x0002], little);
        lng = readDMS(view, tiffStart, gps[0x0004], little);
        const latRef = gps[0x0001] ? readAscii(view, tiffStart, gps[0x0001], little) : 'N';
        const lngRef = gps[0x0003] ? readAscii(view, tiffStart, gps[0x0003], little) : 'E';
        if (/^S/i.test(latRef)) lat = -lat;
        if (/^W/i.test(lngRef)) lng = -lng;
        if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) { lat = null; lng = null; }
      }
    }

    return { lat, lng, takenAt };
  } catch (_) {
    return EMPTY; // صورة تالفة أو صيغة غير مدعومة (مثل HEIC) — نتعامل معها بصمت
  }
}
