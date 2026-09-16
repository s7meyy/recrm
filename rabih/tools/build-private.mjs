// بناء نسخة خاصّة من رابح: ملف واحد لا يحمل من التطبيق إلا نصًّا مشفَّرًا.
//
// لماذا التشفير لا الحجب؟ أي بوابة تُرسم بالمتصفح يمكن تجاوزها، لأن الملفات
// نزلت أصلًا. هنا لا ينزل شيء مقروء: الصفحة تحمل AES-GCM ciphertext ومفتاحه
// مشتقٌّ من كلمة السر بـPBKDF2. بلا الكلمة لا يوجد تطبيق يُتجاوَز.
//
//   node tools/build-private.mjs "كلمة السر" [مجلد المخرج]
//
// ولا تُودَع كلمة السر في المستودع البتّة: تُمرَّر وقت البناء وتبقى عندك.

import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { webcrypto as crypto } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ITER = 310000;
const PREFIX = 'rabih:';

const password = process.argv[2];
const outDir = process.argv[3] || join(ROOT, 'dist');
if (!password || password.length < 8) {
  console.error('كلمة السر مطلوبة، ولا تقلّ عن ثمانية أحرف.');
  process.exit(1);
}

/* ───── جمع ملفات الجافاسكربت ───── */

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (name.endsWith('.js')) acc.push(relative(ROOT, p).split('\\').join('/'));
  }
  return acc;
}

const jsFiles = walk(join(ROOT, 'js')).sort();
const sources = new Map(jsFiles.map((f) => [f, readFileSync(join(ROOT, f), 'utf8')]));

/* ───── رسم التبعيات وترتيبها ───── */

const IMPORT_RE = /(\bfrom\s+|\bimport\s+|\bimport\s*\(\s*)(['"])(\.\.?\/[^'"]+)\2/g;

/** يحوّل مسارًا نسبيًّا داخل ملف إلى مسار من جذر المشروع. */
function resolveSpec(fromFile, spec) {
  return join(dirname(fromFile), spec).split('\\').join('/').replace(/^\.\//, '');
}

const deps = new Map();
for (const [file, src] of sources) {
  const list = [];
  for (const m of src.matchAll(IMPORT_RE)) {
    const target = resolveSpec(file, m[3]);
    if (!sources.has(target)) {
      console.error(`استيراد غير معروف في ${file}: ${m[3]}`);
      process.exit(1);
    }
    list.push(target);
  }
  deps.set(file, [...new Set(list)]);
}

// ترتيب طوبولوجي: التابع بعد متبوعه، كي يكون رابط الـblob جاهزًا عند إعادة الكتابة.
const order = [];
const state = new Map();
const visit = (file, stack) => {
  if (state.get(file) === 'done') return;
  if (state.get(file) === 'visiting') {
    console.error(`دورة استيراد: ${[...stack, file].join(' → ')}`);
    process.exit(1);
  }
  state.set(file, 'visiting');
  for (const d of deps.get(file)) visit(d, [...stack, file]);
  state.set(file, 'done');
  order.push(file);
};
for (const f of jsFiles) visit(f, []);

// الاستيراد النسبي يُستبدَل بمُعرِّف مسطَّح، ووقت التشغيل يُستبدَل برابط blob.
const rewritten = {};
for (const file of order) {
  rewritten[file] = sources.get(file).replace(IMPORT_RE,
    (_, kw, q, spec) => `${kw}${q}${PREFIX}${resolveSpec(file, spec)}${q}`);
}

/* ───── جسد الصفحة وتنسيقها ───── */

const rawHtml = readFileSync(join(ROOT, 'index.html'), 'utf8');
const body = rawHtml.split('<body>')[1].split('</body>')[0]
  .replace(/<script[^>]*src="js\/app\.js"[^>]*><\/script>/, '');
const css = readFileSync(join(ROOT, 'css/rabih.css'), 'utf8');

const payload = JSON.stringify({ body, css, order, files: rewritten, entry: 'js/app.js' });

/* ───── التشفير ───── */

const enc = new TextEncoder();
const salt = crypto.getRandomValues(new Uint8Array(16));
const iv = crypto.getRandomValues(new Uint8Array(12));
const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
const key = await crypto.subtle.deriveKey(
  { name: 'PBKDF2', salt, iterations: ITER, hash: 'SHA-256' },
  base, { name: 'AES-GCM', length: 256 }, false, ['encrypt'],
);
const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(payload)));
const b64 = (u8) => Buffer.from(u8).toString('base64');

/* ───── صفحة البوابة ───── */

const page = `<!doctype html>
<html dir="rtl" lang="ar">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>رابــح</title>
<meta name="robots" content="noindex,nofollow">
<link rel="icon" href="icon.svg">
<style>
  :root{--navy:#16324f;--navy2:#1f4570;--gold:#9a7b26;--line:#dde2e9;--err:#b02121;--muted:#626b78}
  *{box-sizing:border-box}
  body{margin:0;min-height:100dvh;display:grid;place-items:center;padding:24px;
    background:linear-gradient(170deg,var(--navy),#0e2338);
    font-family:"Segoe UI",Tahoma,"Noto Naskh Arabic",sans-serif;color:#16191f}
  .gate{background:#fff;border-radius:16px;padding:30px 26px;width:100%;max-width:370px;
    box-shadow:0 18px 50px rgba(0,0,0,.35);text-align:center}
  .logo{font-size:30px;font-weight:800;letter-spacing:.18em;color:var(--gold)}
  .sub{font-size:13px;color:var(--muted);margin:6px 0 20px;line-height:1.7}
  input{width:100%;font:inherit;padding:12px;border:1px solid var(--line);border-radius:10px;
    text-align:center;letter-spacing:.05em}
  input:focus{outline:2px solid var(--gold);outline-offset:1px}
  button{width:100%;margin-top:12px;font:inherit;font-weight:600;padding:12px;border:0;
    border-radius:10px;background:var(--navy);color:#fff;cursor:pointer}
  button:hover{background:var(--navy2)}
  button:disabled{opacity:.6;cursor:progress}
  .msg{min-height:22px;font-size:13px;color:var(--err);margin-top:10px}
  .note{font-size:11.5px;color:var(--muted);margin-top:16px;line-height:1.7}
</style>
</head>
<body>
<form class="gate" id="gate" autocomplete="off">
  <div class="logo">رابــح</div>
  <p class="sub">هذه النسخة مشفَّرة. اكتب كلمة السر ليُفكّ التطبيق في متصفحك.</p>
  <input id="pass" type="password" placeholder="كلمة السر" autocomplete="current-password" autofocus>
  <button id="go" type="submit">فتح</button>
  <div class="msg" id="msg"></div>
  <p class="note">لا يُرسَل شيء إلى أي خادم. ما يُنزَّل من الإنترنت نصٌّ مشفَّر لا يُقرأ بلا هذه الكلمة.</p>
</form>

<script>
const DATA = {
  salt: "${b64(salt)}",
  iv: "${b64(iv)}",
  cipher: "${b64(cipher)}",
  iterations: ${ITER},
};
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function unlock(password) {
  const enc = new TextEncoder();
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: unb64(DATA.salt), iterations: DATA.iterations, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['decrypt'],
  );
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(DATA.iv) }, key, unb64(DATA.cipher));
  return JSON.parse(new TextDecoder().decode(plain));
}

function boot(app) {
  document.getElementById('gate').remove();
  document.body.removeAttribute('style');
  document.querySelectorAll('style').forEach((s) => s.remove());

  const style = document.createElement('style');
  style.textContent = app.css;
  document.head.appendChild(style);
  document.body.insertAdjacentHTML('afterbegin', app.body);

  // كل وحدة تصير blob، ويُستبدَل مُعرِّفها المسطَّح برابطه في ما يعتمد عليها.
  const urls = new Map();
  for (const file of app.order) {
    let src = app.files[file];
    for (const [name, url] of urls) {
      src = src.replaceAll('"rabih:' + name + '"', '"' + url + '"')
               .replaceAll("'rabih:" + name + "'", "'" + url + "'");
    }
    urls.set(file, URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
  }
  return import(urls.get(app.entry));
}

const form = document.getElementById('gate');
const msg = document.getElementById('msg');
const go = document.getElementById('go');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const pass = document.getElementById('pass').value;
  if (!pass) return;
  go.disabled = true;
  msg.textContent = 'يُفكّ التشفير…';
  try {
    const app = await unlock(pass);
    try { sessionStorage.setItem('rabih:pass', pass); } catch {}
    await boot(app);
  } catch {
    msg.textContent = 'كلمة السر غير صحيحة.';
    go.disabled = false;
    document.getElementById('pass').select();
  }
});

// تحديث الصفحة داخل الجلسة لا يُعيد السؤال.
(async () => {
  let saved = null;
  try { saved = sessionStorage.getItem('rabih:pass'); } catch {}
  if (!saved) return;
  try { await boot(await unlock(saved)); } catch { try { sessionStorage.removeItem('rabih:pass'); } catch {} }
})();
</script>
</body>
</html>
`;

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'index.html'), page);
writeFileSync(join(outDir, 'icon.svg'), readFileSync(join(ROOT, 'icon.svg')));
writeFileSync(join(outDir, '.nojekyll'), '');

const kb = (n) => (n / 1024).toFixed(0);
console.log(`الوحدات: ${order.length}`);
console.log(`النص الأصلي: ${kb(payload.length)} ك.ب → المشفَّر: ${kb(cipher.length)} ك.ب`);
console.log(`الصفحة: ${kb(page.length)} ك.ب → ${join(outDir, 'index.html')}`);
