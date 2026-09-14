// رمز QR (المرحلة ١٨): رابطٌ يُمسح بالكاميرا بدل أن يُكتب باليد.
//
// المكتبة محلّية في `vendor/qrcode/` (MIT، بلا CDN ولا مفتاح ولا شبكة) وتُحمَّل **عند أول
// استعمال فقط** — كما فُعل مع Leaflet — فلا تُثقل فتح التطبيق لمن لا يستعملها.
// ونخرج SVG لا صورة: يُطبع بأي حجم بلا تحبّب، ويظهر في الوضع الداكن والفاتح.
//
// «QR Code» علامة تجارية مسجَّلة لشركة DENSO WAVE INCORPORATED.

let qrcodeLib = null;

async function lib() {
  if (!qrcodeLib) qrcodeLib = (await import('../../vendor/qrcode/qrcode.mjs')).default;
  return qrcodeLib;
}

/**
 * يبني رمزًا كـSVG نصّي.
 * @param {string} text المحتوى (رابط غالبًا)
 * @param {{ cellSize?: number, margin?: number }} options
 */
export async function qrSvg(text, { cellSize = 4, margin = 2 } = {}) {
  const value = String(text ?? '').trim();
  if (!value) throw new Error('لا نصّ للترميز');
  const qrcode = await lib();
  // النسخة 0 = يختارها بنفسه بحسب طول النص. وتصحيح الخطأ M: توازنٌ بين الحجم والمتانة،
  // ويحتمل اتساخ الورقة أو انعكاس الضوء عند المسح من لوحة مطبوعة.
  const qr = qrcode(0, 'M');
  qr.addData(value);
  qr.make();
  return qr.createSvgTag({ cellSize, margin, scalable: true });
}

/** عنصر جاهز للإدراج، بالرابط تحته نصًّا (فمن لا كاميرا عنده يكتبه). */
export async function qrBlock(text, { cellSize = 4, caption = true } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'qr-block';
  wrap.innerHTML = await qrSvg(text, { cellSize });
  if (caption) {
    const link = document.createElement('div');
    link.className = 'qr-caption print-ltr';
    link.textContent = text;
    wrap.append(link);
  }
  return wrap;
}
