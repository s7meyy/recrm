// فكُّ الرابط المختصر — بلا مفتاح ولا مزوّد.
//
// `maps.app.goo.gl/xxxx` لا يحمل اسمَ المنشأة في حروفه، لكنه يقود إليه بإعادة
// توجيهٍ واحدة إلى الرابط الكامل `/maps/place/<الاسم>/@<إحداثيات>`. والمتصفّحُ
// ممنوعٌ من تتبّع تلك التحويلة (سياسة المنشأ الواحد)، فكان الموقع يقول لصاحب
// المحلّ «أدخِل البيانات يدويًّا» — وهو تهرّب. فيتبعها الخادمُ نيابةً عنه.
//
// **والقيدُ الأمنيّ كما في `places.js`**: لا يُتبَع إلا مضيفٌ من قوقل، وتُفحَص كلُّ
// وجهةٍ قبل الانتقال إليها، وإلا صارت الدالّةُ أداةَ طلبٍ نيابةً عن غيرها.

const ALLOWED = ['google.com', 'goo.gl', 'g.co', 'google.com.sa'];

function allowedHost(raw) {
  try {
    const h = new URL(raw).hostname.toLowerCase();
    return ALLOWED.some((d) => h === d || h.endsWith('.' + d));
  } catch { return false; }
}

async function expand(url) {
  let current = url;
  for (let i = 0; i < 6; i += 1) {
    const res = await fetch(current, { redirect: 'manual', headers: { 'user-agent': 'Mozilla/5.0 (rabih)' } });
    const next = res.headers.get('location');
    if (!next) return current;
    const abs = new URL(next, current).href;
    if (!allowedHost(abs)) return current;
    current = abs;
  }
  return current;
}

/** ما يُستخرَج من الرابط الكامل — الاسمُ والإحداثياتُ والمعرّف — بلا شبكةٍ أخرى. */
function parseFull(href) {
  const u = new URL(href);
  const out = { name: '', address: '', coords: null, placeId: '' };
  const place = u.pathname.match(/\/maps\/place\/([^/@]+)/);
  if (place) {
    let seg = place[1];
    try { seg = decodeURIComponent(seg).replace(/\+/g, ' '); } catch { /* يبقى */ }
    const parts = seg.split(/[,،]/).map((x) => x.trim()).filter(Boolean);
    out.name = parts[0] || seg;
    out.address = parts.slice(1).join('، ');
  }
  const at = u.pathname.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (at) out.coords = { lat: parseFloat(at[1]), lng: parseFloat(at[2]) };
  const cid = u.searchParams.get('cid');
  if (cid) out.placeId = 'cid:' + cid;
  const hex = href.match(/0x[0-9a-f]+:0x[0-9a-f]+/i);
  if (hex && !out.placeId) out.placeId = hex[0];
  return out;
}

const json = (obj, status = 200) => new Response(JSON.stringify(obj), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

export default async (request) => {
  const url = new URL(request.url).searchParams.get('url') || '';
  if (!url) return json({ error: 'لا رابط.' }, 400);
  if (!allowedHost(url)) return json({ error: 'الرابط ليس من قوقل.' }, 400);

  let full;
  try { full = await expand(url); }
  catch (e) { return json({ error: 'تعذّر تتبّع الرابط: ' + (e?.message || '') }, 502); }

  const data = parseFull(full);
  return json({ url: full, ...data, resolved: full !== url });
};

export const config = { path: '/api/expand' };
