// فهم روابط قوقل مابز: تحقّق، واستخراج ما يمكن استخراجه من الرابط نفسه بلا شبكة.

const HOSTS = ['google.com', 'www.google.com', 'maps.google.com', 'goo.gl', 'maps.app.goo.gl', 'g.co'];

/** @returns {{ok:boolean, reason?:string, short?:boolean, data?:object}} */
export function parseMapsUrl(raw) {
  const s = String(raw || '').trim();
  if (!s) return { ok: false, reason: 'الرابط فارغ.' };

  let u;
  try { u = new URL(s.startsWith('http') ? s : 'https://' + s); }
  catch { return { ok: false, reason: 'هذا ليس رابطًا صالحًا.' }; }

  const host = u.hostname.replace(/^www\./, '');
  const known = HOSTS.some((h) => host === h || host.endsWith('.' + h) || host === h.replace(/^www\./, ''));
  if (!known) return { ok: false, reason: 'الرابط ليس من قوقل مابز.' };

  const short = host.includes('goo.gl') || host === 'g.co';
  const data = { name: '', placeId: '', coords: null, short };

  // /maps/place/<الاسم>/@<lat>,<lng>,17z/data=...
  const place = u.pathname.match(/\/maps\/place\/([^/@]+)/);
  if (place) {
    try { data.name = decodeURIComponent(place[1]).replace(/\+/g, ' '); } catch { data.name = place[1]; }
  }
  const at = u.pathname.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (at) data.coords = { lat: parseFloat(at[1]), lng: parseFloat(at[2]) };

  const cid = u.searchParams.get('cid');
  if (cid) data.placeId = 'cid:' + cid;
  const pid = u.searchParams.get('place_id') || u.searchParams.get('placeid');
  if (pid) data.placeId = pid;
  const hex = u.href.match(/0x[0-9a-f]+:0x[0-9a-f]+/i);
  if (hex && !data.placeId) data.placeId = hex[0];

  if (short) return { ok: true, short: true, data, reason: 'رابط مختصر: تعذّر استخراج الاسم منه، أدخِل البيانات يدويًا.' };
  if (!place && !at && !data.placeId) {
    return { ok: false, reason: 'الرابط من قوقل لكنه لا يشير إلى مكان محدد.' };
  }
  return { ok: true, short: false, data };
}

/** اسم ملف آمن للأرشيف. */
export function slugify(text) {
  return String(text || 'تقرير')
    .replace(/[\\/:*?"<>|\n\r\t]/g, ' ')
    .replace(/\s+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'تقرير';
}
