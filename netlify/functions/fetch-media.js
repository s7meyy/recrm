// جلب صورة من رابط (المرحلة ٣٨).
//
// **لمَ خادمٌ أصلًا؟** لأنّ المتصفّح لا يسمح بقراءة بكسلات صورةٍ من موقعٍ آخر: تُعرض
// ولا تُقرأ، وأيّ محاولةٍ لتصديرها من canvas تُرفض («canvas ملوَّث»). وهذا قيدُ أمانٍ
// في المتصفّح لا عيبٌ في الكود، ولا حيلة تتجاوزه من الصفحة. فالرابط يُجلب من هنا،
// وتصل الصورة من نطاقنا، فتُقرأ وتُختم.
//
// وحدوده مقصودة: للمالك وحده (لئلّا يصير الموقع وسيط تحميلٍ للناس)، وhttps فقط، وصورٌ
// فقط، وحجمٌ محدود، ومهلةٌ قصيرة. والعناوين الداخلية ممنوعة صراحةً — رابطٌ يشير إلى شبكة
// الخادم نفسه يجعل هذه الدالّة بابًا يقرأ ما خلف الجدار (SSRF).

import { roleOf, unauthorized, forbidden } from '../lib/auth.js';

const MAX_BYTES = 12 * 1024 * 1024;
const TIMEOUT_MS = 12000;

// عناوين لا تُجلب أبدًا: المضيف المحلّي، والشبكات الخاصّة، وخدمة البيانات الوصفية في السحابة.
const BLOCKED_HOST = /^(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|169\.254\.|\[::1\]|\[?::1\]?)/i;
const BLOCKED_HOST_EXACT = new Set(['metadata.google.internal', 'metadata']);
function privateRange(host) {
  const m = /^172\.(\d+)\./.exec(host);
  return m ? Number(m[1]) >= 16 && Number(m[1]) <= 31 : false;
}

export default async (request) => {
  const role = await roleOf(request);
  if (role === null) return unauthorized();
  if (role !== 'owner') return forbidden('جلب الروابط للمالك وحده');

  const raw = new URL(request.url).searchParams.get('url') || '';
  let target;
  try { target = new URL(raw); } catch { return bad('الرابط غير صالح'); }
  if (target.protocol !== 'https:') return bad('الروابط المسموحة https فقط');
  const host = target.hostname.toLowerCase();
  if (BLOCKED_HOST.test(host) || BLOCKED_HOST_EXACT.has(host) || privateRange(host)) {
    return bad('هذا الرابط يشير إلى شبكة داخلية، ولا يُجلب');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetch(target, { signal: controller.signal, redirect: 'follow', headers: { accept: 'image/*' } });
  } catch (err) {
    clearTimeout(timer);
    return bad(err?.name === 'AbortError' ? 'الرابط لم يستجب خلال ١٢ ثانية' : 'تعذّر الوصول إلى الرابط');
  }
  clearTimeout(timer);
  if (!res.ok) return bad(`الموقع ردّ ${res.status} — تأكّد أن الرابط للصورة نفسها لا لصفحةٍ تعرضها`);

  const mime = String(res.headers.get('content-type') || '').split(';')[0].trim();
  if (!mime.startsWith('image/')) {
    return bad(`الرابط ليس صورة (${mime || 'نوع غير معروف'}) — انسخ رابط الصورة نفسها`);
  }
  const declared = Number(res.headers.get('content-length') || 0);
  if (declared && declared > MAX_BYTES) return bad('الصورة أكبر من ١٢ م.ب');

  const buf = await res.arrayBuffer();
  // الحجم يُفحص بعد التنزيل كذلك: كثيرٌ من الخوادم لا تُعلن content-length.
  if (buf.byteLength > MAX_BYTES) return bad('الصورة أكبر من ١٢ م.ب');

  return new Response(buf, {
    headers: {
      'content-type': mime,
      'cache-control': 'no-store',
      'x-source-host': host,
    },
  });
};

const bad = (why) => new Response(JSON.stringify({ error: why }), {
  status: 400, headers: { 'content-type': 'application/json; charset=utf-8' },
});

export const config = { path: '/api/fetch-media' };
