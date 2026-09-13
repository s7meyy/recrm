// تحقّق من كوكي بوابة الدخول داخل الدوال الخادمية (المرحلة ١٠).
// الدوال خارج بوابة الحافة (مستثناة في gate.js)، فما يحتاج منها حمايةً يتحقق من الكوكي نفسها
// بالمفتاح نفسه — فلا مفتاح إضافي يُلصق ولا كلمة سر ثانية تُحفظ.

const COOKIE = 'kassab_gate';
const enc = new TextEncoder();

async function sign(value, secret) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, enc.encode(value));
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** هل يحمل الطلب كوكي دخول صالحة؟ (بلا APP_SECRET/APP_PASSWORD مضبوط: لا حماية، فتُرفض الكتابة.) */
export async function signedIn(request) {
  const secret = process.env.APP_SECRET || process.env.APP_PASSWORD;
  if (!secret) return false;
  const cookie = request.headers.get('cookie') || '';
  const token = cookie.split(';').map((c) => c.trim()).find((c) => c.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  if (!token || !token.includes('.')) return false;
  const [expires, mac] = token.split('.');
  if (!/^\d+$/.test(expires) || Number(expires) < Date.now()) return false;
  return safeEqual(mac, await sign(expires, secret));
}

export const unauthorized = () => new Response(JSON.stringify({ error: 'يلزم تسجيل الدخول' }), {
  status: 401, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});
