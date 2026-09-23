// بوابة الدخول للنظام الداخلي (المرحلة ٩) — حماية حقيقية من جهة الخادم.
//
// كل طلب لملفات التطبيق يمرّ من هنا قبل أن يصل إلى أي ملف: بلا كوكي صالحة لا يُسلَّم
// شيء أصلًا (لا HTML ولا JS)، فهذا ليس "قفلًا بجافاسكربت" مكشوفًا كما رُفض سابقًا.
// كلمة السر في متغيّر بيئة على Netlify ولا تُكتب في الكود ولا تصل المتصفح.
//
// المستثنى من البوابة: صفحة العروض العامة `/offers` ومسارات الدوال `/api/*` و`/.netlify/*`
// (دالة النشر محميّة بمفتاحها الخاص، ودالّتا القراءة عامّتان بقصد).
//
// ومعها **ملف هوية ضاد وخطّه** (`/css/dhad.css` و`/assets/fonts/*`): الصفحة العامة تلبس
// هوية الموقع نفسها، ولا سرَّ في لونٍ ومقاسٍ وحرف. ولو بقيا خلف البوابة لعادت الصفحة
// العامة إلى خطّ النظام وحده — موقعان بوجهين.

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

/**
 * الكوكي تحمل **الدور** موقَّعًا معها (المرحلة ٣٥): `expires.role.mac`.
 *
 * والتوقيع على `expires.role` معًا لا على المدّة وحدها — وإلا لبدّل المساعدُ دورَه بيده
 * وبقي التوقيع صالحًا. وهذه هي العلّة المعتادة في الكوكي الموقَّعة: يُوقَّع بعضُها ويُترك
 * بعضُها، فيصير الباقي قابلًا للكتابة.
 *
 * والشكل القديم (`expires.mac`) يبقى مقبولًا ويُقرأ **مالكًا**: الكوكي القائمة في جوّالك
 * الآن لا يجوز أن تُبطلها ترقيةٌ لم تطلبها.
 */
export const ROLES = { owner: 'owner', assistant: 'assistant' };

async function makeToken(secret, role = ROLES.owner) {
  const expires = Date.now() + MAX_AGE_DAYS * 86400000;
  const payload = `${expires}.${role}`;
  return `${payload}.${await sign(payload, secret)}`;
}

/** @returns {Promise<string|null>} الدور إن صحّت الكوكي، وإلا null. */
async function tokenRole(token, secret) {
  if (!token || !token.includes('.')) return null;
  const parts = token.split('.');
  if (parts.length === 2) {
    // الشكل القديم: مدّةٌ وتوقيع، وصاحبه مالك.
    const [expires, mac] = parts;
    if (!/^\d+$/.test(expires) || Number(expires) < Date.now()) return null;
    return safeEqual(mac, await sign(expires, secret)) ? ROLES.owner : null;
  }
  if (parts.length !== 3) return null;
  const [expires, role, mac] = parts;
  if (!/^\d+$/.test(expires) || Number(expires) < Date.now()) return null;
  if (role !== ROLES.owner && role !== ROLES.assistant) return null;
  return safeEqual(mac, await sign(`${expires}.${role}`, secret)) ? role : null;
}

async function validToken(token, secret) {
  return (await tokenRole(token, secret)) !== null;
}

function loginPage({ error = false, target = '/' } = {}) {
  return new Response(`<!DOCTYPE html>
<html lang="ar" dir="rtl"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>كسّاب — الدخول</title>
<link rel="stylesheet" href="/css/dhad.css">
<style>
  /* صفحة الدخول تلبس هوية ضاد نفسها: خطُّها وألوانُها ومقاييسُها من \`/css/dhad.css\`
     (وهو خارج البوابة بقصد). والقيم الاحتياطية مكتوبة بعد كل رمز كي تبقى الصفحة صحيحة
     لو تعذّر تحميل الملف — لا يليق بصفحة الدخول أن تعتمد على شيء قد لا يصل. */
  *, *::before, *::after { box-sizing: border-box; } /* بدونها يفيض حقل الإدخال بعرض الحشو على الجوال */
  body {
    margin: 0; min-height: 100vh; display: grid; place-items: center;
    padding: var(--dhad-space-4, 16px);
    background: var(--dhad-color-bg, #f2f4f1); color: var(--dhad-color-text-1, #1a1f1c);
    line-height: var(--dhad-line-reading, 1.7);
    font-family: var(--dhad-font-body, system-ui, -apple-system, "Segoe UI", Tahoma, "Noto Naskh Arabic", Arial, sans-serif);
  }
  form {
    background: var(--dhad-color-surface-1, #fff); padding: var(--dhad-space-6, 32px);
    border-radius: var(--dhad-radius-md, 14px); border: 1px solid var(--dhad-color-border, #d9e0d9);
    width: min(360px, 100%); box-shadow: 0 10px 40px rgba(16,24,20,.08);
  }
  h1 { margin: 0 0 var(--dhad-space-1, 4px); font-size: var(--dhad-font-size-800, 22px); line-height: var(--dhad-line-heading, 1.4); }
  p { margin: 0 0 var(--dhad-space-5, 24px); color: var(--dhad-color-text-2, #5f6b64); font-size: var(--dhad-font-size-400, 14px); }
  input {
    width: 100%; min-height: var(--dhad-size-touch, 44px); padding: var(--dhad-space-3, 12px);
    font: inherit; border: 1px solid var(--dhad-color-border-strong, #b9c4bb); border-radius: var(--dhad-radius-sm, 10px);
    background: var(--dhad-color-surface-1, #fff); color: inherit;
  }
  input:focus { border-color: var(--dhad-color-action, #0f6e56); outline: none;
    box-shadow: 0 0 0 var(--dhad-focus-width, 3px) var(--dhad-color-action-soft, #dff0ea); }
  button {
    width: 100%; margin-top: var(--dhad-space-3, 12px); min-height: var(--dhad-size-touch, 44px);
    padding: var(--dhad-space-3, 12px); font: inherit; font-weight: 600; cursor: pointer;
    background: var(--dhad-color-action, #0f6e56); color: var(--dhad-color-on-fill, #fff);
    border: 0; border-radius: var(--dhad-radius-sm, 10px);
  }
  button:hover { background: var(--dhad-color-action-hover, #0b5a46); }
  button:active { background: var(--dhad-color-action-active, #084433); }
  /* التركيز يُرى هنا أيضًا: من يدخل بلوحة المفاتيح يجب أن يعرف أين هو. */
  :focus-visible { outline: var(--dhad-focus-width, 3px) solid var(--dhad-color-action, #0f6e56); outline-offset: 2px; }
  .err {
    background: var(--dhad-color-danger-soft, #f9e2dd); color: var(--dhad-color-danger, #b4432f);
    border: 1px solid var(--dhad-color-danger-border, #efc5bd);
    padding: var(--dhad-space-2, 8px) var(--dhad-space-3, 12px); border-radius: var(--dhad-radius-sm, 10px);
    font-size: var(--dhad-font-size-400, 14px); margin-bottom: var(--dhad-space-3, 12px);
  }
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
  // **ولكنّها تقول ذلك** (المرحلة ٥٥): كانت تفتح صامتة، فلا يُعرف أنّ البوّابة لا ترى
  // كلمةَ السرّ إلّا حين ترفض الدوالُّ كلَّ جلسةٍ بـ«انتهت جلستك». والترويسةُ لا تحمل قيمة.
  if (!password) {
    const res = await context.next();
    const out = new Response(res.body, res);
    out.headers.set('x-kassab-gate', 'open-no-password');
    return out;
  }

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
    const given = String(form.get('password') || '');
    // كلمة سرّ المساعد (اختيارية): بابٌ ثانٍ تفتحه لمن يعمل معك وتغلقه وحده متى شئت،
    // بلا أن تغيّر كلمتك أنت. ولا تُقبل إن ساوت كلمتك — فبابٌ واحد بمفتاحين وهمٌ لا فصل.
    const assistant = Netlify.env.get('ASSISTANT_PASSWORD');
    const isOwner = safeEqual(given, password);
    const isAssistant = !!assistant && assistant !== password && safeEqual(given, assistant);
    if (!isOwner && !isAssistant) return loginPage({ error: true, target });
    const token = await makeToken(secret, isOwner ? ROLES.owner : ROLES.assistant);
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
  excludedPath: ['/offers', '/offers/*', '/api/*', '/.netlify/*', '/css/dhad.css', '/assets/fonts/*'],
};
