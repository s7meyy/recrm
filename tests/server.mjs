// خادم اختبار يحاكي بيئة Netlify محليًا: يخدم الملفات الثابتة، ويشغّل **كود الدوال الحقيقي كما هو**
// فوق بديل Blobs في الذاكرة (tests/doubles)، ويمرّر كل ما عدا المستثنى على دالة بوابة الدخول.
// شغّله بـ: node --import ./tests/loader.mjs tests/server.mjs
// وهو ما يستعمله tests/run.mjs. ليس جزءًا من التطبيق المنشور.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
// بلا APP_PASSWORD تمرّ البوابة (سلوك gate.js نفسه) — يُستعمل لتشغيل نسخة مفتوحة
// تختبر التطبيق وحده، بينما النسخة المقفلة تختبر البوابة.
process.env.PUBLISH_TOKEN = 'test-publish-token';
process.env.APP_PASSWORD = process.env.TEST_OPEN ? '' : 'secret-pass';
process.env.APP_SECRET = 'topsecret';
process.env.VAPID_PUBLIC = 'BAS0l8XI1NXI4hkFooiusZNcycHEynQFewSBXSMWVPKWwoN_QzrKBJmrjMU8WEielVM9bVn7rjhXZ6lI8c5gZvY';
process.env.VAPID_PRIVATE = '-u5a2gqiVTbpfsskGbu-GU824_e_3OnnMR38HUe_NYs';
globalThis.Netlify = { env: { get: (k) => process.env[k] || undefined } }; // دوال الحافة تقرأ البيئة نفسها

const publishFn = (await import(`${ROOT}/netlify/functions/publish.js`)).default;
const listingsFn = (await import(`${ROOT}/netlify/functions/listings.js`)).default;
const mediaFn = (await import(`${ROOT}/netlify/functions/media.js`)).default;
const offerFn = (await import(`${ROOT}/netlify/functions/offer.js`)).default;
const vaultFn = (await import(`${ROOT}/netlify/functions/vault.js`)).default;
const pushFn = (await import(`${ROOT}/netlify/functions/push.js`)).default;
const pushTickFn = (await import(`${ROOT}/netlify/functions/push-tick.js`)).default;
const clientListFn = (await import(`${ROOT}/netlify/functions/client-list.js`)).default;
const gateFn = (await import(`${ROOT}/netlify/edge-functions/gate.js`)).default;
const { config: gateConfig } = await import(`${ROOT}/netlify/edge-functions/gate.js`);

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };

const excluded = (pathname) => gateConfig.excludedPath.some((p) => (p.endsWith('/*')
  ? pathname === p.slice(0, -2) || pathname.startsWith(p.slice(0, -1))
  : pathname === p));

async function staticResponse(pathname) {
  let file = pathname.endsWith('/') ? `${pathname}index.html` : pathname;
  const abs = path.join(ROOT, file);
  if (!abs.startsWith(ROOT)) return new Response('no', { status: 403 });
  try {
    const buf = await readFile(abs);
    return new Response(buf, { headers: { 'content-type': MIME[path.extname(abs)] || 'application/octet-stream' } });
  } catch { return new Response('غير موجود', { status: 404 }); }
}

const server = http.createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  const request = new Request(`http://localhost:8234${req.url}`, {
    method: req.method, headers: req.headers, body, duplex: 'half',
  });
  const url = new URL(request.url);

  let response;
  try {
    if (url.pathname === '/api/publish') response = await publishFn(request);
    else if (url.pathname === '/api/listings') response = await listingsFn(request);
    else if (url.pathname === '/api/media') response = await mediaFn(request);
    else if (url.pathname.startsWith('/offers/l/')) response = await offerFn(request);
    else if (url.pathname === '/api/vault') response = await vaultFn(request);
    else if (url.pathname === '/api/push') response = await pushFn(request);
    else if (url.pathname === '/api/push-tick') response = await pushTickFn(request);
    else if (url.pathname === '/api/client-list') response = await clientListFn(request);
    else if (excluded(url.pathname)) response = await staticResponse(url.pathname);
    else response = await gateFn(request, { next: () => staticResponse(url.pathname === '/' ? '/index.html' : url.pathname) });
  } catch (err) {
    console.error('SERVER ERROR', err);
    response = new Response(String(err), { status: 500 });
  }

  res.writeHead(response.status, Object.fromEntries(response.headers));
  const out = Buffer.from(await response.arrayBuffer());
  res.end(out);
});
const PORT = Number(process.env.TEST_PORT || 8234);
server.listen(PORT, () => console.log(`خادم الاختبار يعمل على http://127.0.0.1:${PORT}`));
