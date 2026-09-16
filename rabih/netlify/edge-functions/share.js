// رابط التقرير الخاص — يفتحه عميلك في جوّاله بلا ملفٍ يُرسَل.
//
// **ولا يُسلَّم التقرير لمن لا يعرف كلمته**: المحتوى مخزَّنٌ مشفَّرًا، ويُفكّ
// **في متصفح العميل** لا هنا. فالخادم ينقل صندوقًا مغلقًا، والكلمة تمرّ منك
// إلى عميلك في قناةٍ أخرى ولا تمرّ بنا.
//
// والصفحة المُسلَّمة قشرةٌ صغيرة: تطلب الكلمة، وتفكّ، وتعرض. فلا فرق بينها
// وبين ملفٍ أرسلتَه، إلا أنها تبقى محدَّثة وتُلغى متى شئت.

const PAGE = (id) => `<!doctype html>
<html dir="rtl" lang="ar">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>تقرير</title>
<style>
  :root{--navy:#16324f;--gold:#9a7b26;--line:#dde2e9;--err:#b02121;--muted:#626b78}
  *{box-sizing:border-box}
  body{margin:0;min-height:100dvh;display:grid;place-items:center;padding:24px;
    background:linear-gradient(170deg,var(--navy),#0e2338);
    font-family:"Segoe UI",Tahoma,"Noto Naskh Arabic",sans-serif;color:#16191f}
  .gate{background:#fff;border-radius:16px;padding:30px 26px;width:100%;max-width:370px;
    box-shadow:0 18px 50px rgba(0,0,0,.35);text-align:center}
  .logo{font-size:26px;font-weight:800;letter-spacing:.16em;color:var(--gold)}
  .sub{font-size:13px;color:var(--muted);margin:6px 0 18px;line-height:1.7}
  input{width:100%;font:inherit;padding:12px;border:1px solid var(--line);border-radius:10px;text-align:center}
  button{width:100%;margin-top:12px;font:inherit;font-weight:600;padding:12px;border:0;
    border-radius:10px;background:var(--navy);color:#fff;cursor:pointer}
  .msg{min-height:20px;font-size:13px;color:var(--err);margin-top:10px}
  .foot{font-size:11.5px;color:var(--muted);margin:14px 0 0;line-height:1.7}
  .sub b{color:var(--navy)}
</style>
</head>
<body>
<form class="gate" id="gate">
  <div class="logo" id="label">تقرير</div>
  <p class="sub">تقريرٌ عن تعليقات عملائك، مشفَّرٌ بكلمةٍ اختارها مُعِدّه.
  اكتب الكلمة التي وصلتك — يُفكّ التقرير <b>في جهازك أنت</b>، ولا يمرّ نصُّه بخادمنا مفكوكًا.</p>
  <input id="pass" type="password" placeholder="كلمة السر" autocomplete="current-password" autofocus>
  <button type="submit">فتح التقرير</button>
  <div class="msg" id="msg"></div>
  <p class="foot">لا يُفهرَس هذا الرابط في محركات البحث، ويُلغيه مُعِدّه متى شاء.</p>
</form>
<script>
const ID = ${JSON.stringify(id)};
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/* عنوانٌ يختاره المُعِدّ ليعرف المستقبِل ممّن جاءه التقرير.
   ويُخزَّن **خارج التشفير** فيراه كل من بلغه الرابط، ولذلك لا يُوضَع إلا
   بطلبه، ولا يُوضَع فيه اسمُ المنشأة: من وجد الرابط عرف عمّن التقرير قبل
   أن يعرف كلمته. فهو اسم المكتب لا اسم العميل. */
fetch('/api/store?key=' + encodeURIComponent(ID) + '&slot=report')
  .then((r) => r.json())
  .then((d) => {
    if (!d.found) return;
    const label = (JSON.parse(d.data) || {}).label;
    if (label) document.getElementById('label').textContent = label;
  })
  .catch(() => {});
document.getElementById('gate').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = document.getElementById('msg');
  msg.textContent = 'يُفتَح…';
  try {
    const res = await fetch('/api/store?key=' + encodeURIComponent(ID) + '&slot=report');
    const data = await res.json();
    if (!data.found) { msg.textContent = 'لم يعد هذا الرابط متاحًا.'; return; }
    const p = JSON.parse(data.data);
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(document.getElementById('pass').value), 'PBKDF2', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: unb64(p.salt), iterations: p.iter || 310000, hash: 'SHA-256' },
      base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(p.iv) }, key, unb64(p.cipher));
    const obj = JSON.parse(new TextDecoder().decode(plain));
    document.open(); document.write(obj.html); document.close();
  } catch (err) {
    msg.textContent = 'كلمة السر غير صحيحة.';
  }
});
<\/script>
</body>
</html>`;

export default async (request) => {
  const url = new URL(request.url);
  const id = url.pathname.replace(/^\/r\//, '').replace(/[^a-f0-9]/gi, '').slice(0, 64);
  if (!id || id.length < 32) {
    return new Response('رابط غير صالح.', { status: 400, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  }
  return new Response(PAGE(id), {
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  });
};

export const config = { path: '/r/*' };
