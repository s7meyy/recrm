// بوابة رابح — حماية من جهة الخادم لا من جهة المتصفح.
//
// كل طلب يمرّ من هنا قبل أن يصل إلى أي ملف: بلا كوكي موقَّعة صالحة لا يُسلَّم شيء
// أصلًا — لا HTML ولا JS ولا CSS. فهذا يختلف عن قفلٍ يُرسَم بالمتصفح، إذ تلك الملفات
// تكون قد نزلت، وعن النسخة المشفَّرة على Pages، إذ ينزل ciphertext قابل للمحاولة عليه.
//
// كلمة السر في متغيّر بيئة على Netlify: لا تُكتب في الكود، ولا تصل المتصفح، وتُغيَّر
// من لوحة Netlify بلا إعادة بناء ولا دفع.

const COOKIE = 'rabih_gate';
const MAX_AGE_DAYS = 30;

const enc = new TextEncoder();

async function sign(value, secret) {
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, enc.encode(value));
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** مقارنة بزمن ثابت: لا تكشف طول التطابق. */
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
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

/**
 * وجهةٌ داخلية لا غير.
 *
 * `startsWith('/')` وحدها لا تكفي: «//evil.com» يبدأ بشرطة ويقرؤه المتصفح عنوانًا
 * خارجيًّا بالبروتوكول نفسه. فتصير البوابة أداةَ تحويلٍ مفتوح: رابطٌ من موقعك يقذف
 * من يفتحه إلى موقع غيرك، ويُستعمل في التصيّد لأن المصدر يبدو موثوقًا.
 */
function safeTarget(raw) {
  const t = String(raw || '');
  if (!t.startsWith('/')) return '/';
  if (t.startsWith('//') || t.startsWith('/\\')) return '/';
  return t;
}

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function loginPage({ error = false, target = '/' } = {}) {
  return new Response(`<!doctype html>
<html dir="rtl" lang="ar">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>رابــح — الدخول</title>
<meta name="robots" content="noindex,nofollow">
<style>
  :root{--navy:#16324f;--navy2:#1f4570;--gold:#9a7b26;--line:#dde2e9;--err:#b02121;--muted:#626b78}
  *{box-sizing:border-box}
  body{margin:0;min-height:100dvh;display:grid;place-items:center;padding:24px;
    background:linear-gradient(170deg,var(--navy),#0e2338);
    font-family:"Segoe UI",Tahoma,"Noto Naskh Arabic",sans-serif;color:#16191f}
  form{background:#fff;border-radius:16px;padding:30px 26px;width:100%;max-width:370px;
    box-shadow:0 18px 50px rgba(0,0,0,.35);text-align:center}
  .logo{font-size:24px;font-weight:800;letter-spacing:.14em;color:var(--navy)}
  .mark{height:52px;width:auto;display:block;margin:0 auto 10px}
  .sub{font-size:13px;color:var(--muted);margin:6px 0 20px;line-height:1.7}
  input{width:100%;font:inherit;padding:12px;border:1px solid var(--line);border-radius:10px;text-align:center}
  input:focus{outline:2px solid var(--gold);outline-offset:1px}
  button{width:100%;margin-top:12px;font:inherit;font-weight:600;padding:12px;border:0;
    border-radius:10px;background:var(--navy);color:#fff;cursor:pointer}
  button:hover{background:var(--navy2)}
  .err{min-height:22px;font-size:13px;color:var(--err);margin-top:10px}
  .note{font-size:11.5px;color:var(--muted);margin-top:16px;line-height:1.7}
</style>
</head>
<body>
<form method="POST" action="/__login">
  <img class="mark" src="/assets/rabeh-logo.png" alt="رابــح — نُحلّل تقييماتك، ونطوّر أعمالك">
  <div class="logo">رابــح</div>
  <p class="sub">تقارير المنشآت من خرائط قوقل</p>
  <input type="password" name="password" placeholder="كلمة السر" autocomplete="current-password" autofocus>
  <input type="hidden" name="to" value="${esc(target)}">
  <button type="submit">دخول</button>
  <div class="err">${error ? 'كلمة السر غير صحيحة.' : ''}</div>
  <p class="note">بلا دخولٍ صحيح لا يُسلَّم من الموقع ملفٌّ واحد. وبياناتك بعد الدخول تبقى في متصفحك وحده.</p>
</form>
</body>
</html>`, {
    status: error ? 401 : 200,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  });
}

export default async (request, context) => {
  const password = Netlify.env.get('APP_PASSWORD');
  const secret = Netlify.env.get('APP_SECRET') || password;

  // بلا كلمة سر مضبوطة لا تُقفل البوابة الموقع — كي لا يُحبس المالك خارجه بخطأ إعداد.
  if (!password) return context.next();

  const url = new URL(request.url);

  /* مسارٌ واحد يُستثنى: رابط التقرير الخاص وما يقرؤه من المخزن.
     وإلا لطُولب عميلُك بكلمة سرّ موقعك — وهي لك لا له. ولا خطر في الاستثناء:
     ما وراءه مشفَّرٌ لا يُفكّ إلا بكلمة التقرير، ومعرّفه عشوائيٌّ لا يُخمَّن. */
  if (url.pathname.startsWith('/r/')
      || (url.pathname === '/api/store' && request.method === 'GET')) {
    return context.next();
  }

  /* وشعارُ صفحةِ الدخول نفسِها: البوابةُ تعترض كل مسار، فلو حُجب لظهرت صفحتُها
     بصورةٍ مكسورة — تحجب عن نفسها. وهو ملفٌّ واحدٌ لا يحمل شيئًا من بياناتك. */
  if (url.pathname === '/assets/rabeh-logo.png') return context.next();

  if (url.pathname === '/__logout') {
    return new Response(null, {
      status: 302,
      headers: {
        location: '/',
        'set-cookie': `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`,
      },
    });
  }

  if (url.pathname === '/__login') {
    if (request.method !== 'POST') return loginPage();
    const form = await request.formData();
    const target = String(form.get('to') || '/');
    if (!safeEqual(String(form.get('password') || ''), password)) {
      return loginPage({ error: true, target });
    }
    return new Response(null, {
      status: 302,
      headers: {
        location: safeTarget(target),
        'set-cookie': `${COOKIE}=${await makeToken(secret)}; Path=/; Max-Age=${MAX_AGE_DAYS * 86400}; HttpOnly; Secure; SameSite=Lax`,
      },
    });
  }

  const cookie = request.headers.get('cookie') || '';
  const current = cookie.split(';').map((c) => c.trim())
    .find((c) => c.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);

  if (await validToken(current, secret)) return context.next();

  return loginPage({ target: url.pathname + url.search });
};

export const config = { path: '/*' };
