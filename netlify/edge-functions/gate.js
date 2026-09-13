// بوابة الدخول للنظام الداخلي (المرحلة ٩) — حماية حقيقية من جهة الخادم.
//
// كل طلب لملفات التطبيق يمرّ من هنا قبل أن يصل إلى أي ملف: بلا كوكي صالحة لا يُسلَّم
// شيء أصلًا (لا HTML ولا JS)، فهذا ليس "قفلًا بجافاسكربت" مكشوفًا كما رُفض سابقًا.
// كلمة السر في متغيّر بيئة على Netlify ولا تُكتب في الكود ولا تصل المتصفح.
//
// المستثنى من البوابة: صفحة العروض العامة `/offers` ومسارات الدوال `/api/*` و`/.netlify/*`
// (دالة النشر محميّة بمفتاحها الخاص، ودالّتا القراءة عامّتان بقصد).

const COOKIE = 'kassab_gate';
const MAX_AGE_DAYS = 30;

const enc = new TextEncoder();

async function sign(value, secret) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, enc.encode(value));
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** مقارنة بزمن ثابت (لا تكشف طول التطابق). */
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function makeToken(secret) {
  const expires = Date.now() + MAX_AGE_DAYS * 86400000;
  return `${expires}.${await sign(String(expires), secret)}`;
}

async function validToken(token, secret) {
  if (!token || !token.includes('.')) return false;
  const [expires, mac] = token.split('.');
  if (!/^\d+$/.test(expires) || Number(expires) < Date.now()) return false;
  return safeEqual(mac, await sign(expires, secret));
}

function loginPage({ error = false, target = '/' } = {}) {
  return new Response(`<!DOCTYPE html>
<html lang="ar" dir="rtl"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>كسّاب — الدخول</title>
<style>
  :root { color-scheme: light; }
  *, *::before, *::after { box-sizing: border-box; } /* بدونها يفيض حقل الإدخال بعرض الحشو على الجوال */
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f2f4f1; color: #1a1f1c;
    font-family: system-ui, -apple-system, "Segoe UI", Tahoma, "Noto Naskh Arabic", Arial, sans-serif; }
  form { background: #fff; padding: 28px; border-radius: 12px; border: 1px solid #d9e0d9; width: min(360px, 92vw);
    box-shadow: 0 10px 40px rgba(16,24,20,.08); }
  h1 { margin: 0 0 4px; font-size: 22px; }
  p { margin: 0 0 18px; color: #5f6b64; font-size: 14px; }
  input { width: 100%; padding: 10px 12px; font: inherit; border: 1px solid #b9c4bb; border-radius: 8px; }
  button { width: 100%; margin-top: 12px; padding: 10px 12px; font: inherit; font-weight: 600; cursor: pointer;
    background: #0f6e56; color: #fff; border: 0; border-radius: 8px; }
  .err { background: #f9e2dd; color: #b4432f; padding: 8px 10px; border-radius: 8px; font-size: 14px; margin-bottom: 12px; }
</style></head>
<body>
  <form method="POST" action="/__login">
    <h1>كسّاب</h1>
    <p>هذه الصفحة محمية. أدخل كلمة السر للمتابعة.</p>
    ${error ? '<div class="err">كلمة السر غير صحيحة.</div>' : ''}
    <input type="hidden" name="to" value="${target.replace(/"/g, '&quot;')}">
    <input type="password" name="password" autocomplete="current-password" autofocus required placeholder="كلمة السر">
    <button type="submit">دخول</button>
  </form>
</body></html>`, {
    status: error ? 401 : 200,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  });
}

export default async (request, context) => {
  const password = Netlify.env.get('APP_PASSWORD');
  const secret = Netlify.env.get('APP_SECRET') || password;
  // بلا كلمة سر مضبوطة لا تُقفل البوابة الموقعَ (حتى لا يُحبس المالك خارج موقعه بخطأ إعداد).
  if (!password) return context.next();

  const url = new URL(request.url);

  if (url.pathname === '/__logout') {
    return new Response(null, {
      status: 302,
      headers: { location: '/', 'set-cookie': `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax` },
    });
  }

  if (url.pathname === '/__login') {
    if (request.method !== 'POST') return loginPage();
    const form = await request.formData();
    const target = String(form.get('to') || '/');
    if (!safeEqual(String(form.get('password') || ''), password)) return loginPage({ error: true, target });
    const token = await makeToken(secret);
    return new Response(null, {
      status: 302,
      headers: {
        location: target.startsWith('/') ? target : '/',
        'set-cookie': `${COOKIE}=${token}; Path=/; Max-Age=${MAX_AGE_DAYS * 86400}; HttpOnly; Secure; SameSite=Lax`,
      },
    });
  }

  const cookie = request.headers.get('cookie') || '';
  const current = cookie.split(';').map((c) => c.trim()).find((c) => c.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  if (await validToken(current, secret)) return context.next();

  return loginPage({ target: url.pathname + url.search });
};

export const config = {
  path: '/*',
  excludedPath: ['/offers', '/offers/*', '/api/*', '/.netlify/*'],
};
