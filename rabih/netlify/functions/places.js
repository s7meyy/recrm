// موصّل Google Places — الطريق الآلي الوحيد المشروع لجلب بيانات المنشأة.
//
// **ما يجلبه:** الاسم والعنوان والهاتف والموقع والتقييم وعدد التقييمات وساعات
// العمل والمميزات والصور، و**خمس مراجعات فقط** — وهذا حدُّ قوقل الرسمي لا حدُّنا.
// فهو يُغني عن إدخال البطاقة يدويًّا، ولا يُغني عن لصق التعليقات.
//
// **لماذا دالّة خادمية لا نداء من المتصفح؟** المفتاح لا يجوز أن يصل المتصفح.
// وهي تعمل على شبكة Netlify، فتتبع الروابط المختصرة وتنادي قوقل بلا قيود.
//
// المفتاح في متغيّر البيئة GOOGLE_PLACES_KEY على لوحة Netlify.

const BASE = 'https://maps.googleapis.com/maps/api/place';
const MAX_PHOTOS = 6;

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

/** يستخرج ما يمكن من الرابط بلا شبكة: المعرّف أو الاسم أو الإحداثيات. */
function readUrl(raw) {
  let u;
  try { u = new URL(String(raw).trim()); } catch { return null; }

  const out = { placeId: '', name: '', coords: null, short: /goo\.gl|g\.co/.test(u.hostname) };

  const pid = u.searchParams.get('place_id') || u.searchParams.get('placeid');
  if (pid) out.placeId = pid;

  const cid = u.searchParams.get('cid');
  if (cid) out.cid = cid;

  const place = u.pathname.match(/\/maps\/place\/([^/@]+)/);
  if (place) { try { out.name = decodeURIComponent(place[1]).replace(/\+/g, ' '); } catch { out.name = place[1]; } }

  const at = u.pathname.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (at) out.coords = { lat: parseFloat(at[1]), lng: parseFloat(at[2]) };

  return out;
}

// مضيفات قوقل وحدها: ما عداها لا يُطلَب.
const ALLOWED = ['google.com', 'goo.gl', 'g.co', 'google.com.sa'];

/** هل العنوان من قوقل؟ يُقارَن بالمضيف كاملًا أو كلاحقة نطاق، لا كتضمين نصّي. */
function allowedHost(raw) {
  try {
    const h = new URL(raw).hostname.toLowerCase();
    return ALLOWED.some((d) => h === d || h.endsWith('.' + d));
  } catch { return false; }
}

/**
 * الروابط المختصرة تُتبَع حتى الرابط الكامل.
 *
 * والعنوان يأتي من المتصفح، فلولا القيد لصارت الدالّة أداةَ طلبٍ نيابةً عن غيرها:
 * يُمرَّر عنوانٌ داخلي أو عنوان بيانات وصفية للسحابة، فتجلبه الدالّة من داخل شبكة
 * Netlify وتُعيد ما فيه. ولذلك يُفحص المضيف قبل الطلب، وبعد كل تحويلة.
 */
async function expand(url) {
  if (!allowedHost(url)) return url;
  try {
    // نتتبّع التحويلات بأنفسنا كي نفحص كل وجهة، لا أن نسلّمها للمتصفح الداخلي.
    let current = url;
    for (let i = 0; i < 5; i += 1) {
      const res = await fetch(current, { redirect: 'manual' });
      const next = res.headers.get('location');
      if (!next) return res.url || current;
      const abs = new URL(next, current).href;
      if (!allowedHost(abs)) return current;
      current = abs;
    }
    return current;
  } catch { return url; }
}

/** يحوّل ما في الرابط إلى place_id عبر البحث النصّي. */
async function findPlaceId(info, key) {
  if (info.placeId) return info.placeId;
  if (!info.name) return null;

  const params = new URLSearchParams({
    input: info.name,
    inputtype: 'textquery',
    fields: 'place_id',
    language: 'ar',
    key,
  });
  if (info.coords) {
    params.set('locationbias', `point:${info.coords.lat},${info.coords.lng}`);
  }
  const res = await fetch(`${BASE}/findplacefromtext/json?${params}`);
  const data = await res.json();
  if (data.status !== 'OK' || !data.candidates?.length) return null;
  return data.candidates[0].place_id;
}

/** صورة واحدة تُجلب وتُعاد data URL، فلا يتسرّب المفتاح ولا ينكسر الرابط لاحقًا. */
async function fetchPhoto(ref, key, maxwidth = 900) {
  try {
    const res = await fetch(`${BASE}/photo?maxwidth=${maxwidth}&photo_reference=${encodeURIComponent(ref)}&key=${key}`, { redirect: 'follow' });
    if (!res.ok) return null;
    const type = res.headers.get('content-type') || 'image/jpeg';
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.length > 1_500_000) return null;   // صورة ضخمة تُثقل التقرير بلا فائدة
    let bin = '';
    for (let i = 0; i < buf.length; i += 1) bin += String.fromCharCode(buf[i]);
    return `data:${type};base64,${btoa(bin)}`;
  } catch { return null; }
}

/** يحوّل ردّ قوقل إلى شكل عقد البيانات — بلا زيادة ولا تفسير. */
export function toContract(r, { mapsUrl = '', placeId = '' } = {}) {
  const reviews = (r.reviews || []).map((x, i) => ({
    id: `R${String(i + 1).padStart(3, '0')}`,
    author: x.author_name || '',
    rating: typeof x.rating === 'number' ? x.rating : null,
    date: x.relative_time_description || '',
    text: (x.text || '').trim(),
    ownerReply: '',
    language: x.language || '',
    likes: null,
  }));

  return {
    schema: 1,
    source: 'places',
    capturedAt: new Date().toISOString(),
    mapsUrl: mapsUrl || r.url || '',
    placeId: placeId || r.place_id || '',
    identity: {
      name: r.name || '',
      category: (r.types || []).slice(0, 3).join('، '),
      address: r.formatted_address || r.vicinity || '',
      phone: r.formatted_phone_number || r.international_phone_number || '',
      website: r.website || '',
      coords: r.geometry?.location ? { lat: r.geometry.location.lat, lng: r.geometry.location.lng } : null,
      hours: r.opening_hours?.weekday_text || r.current_opening_hours?.weekday_text || [],
      attributes: [
        r.delivery && 'توصيل',
        r.dine_in && 'جلوس',
        r.takeout && 'طلبات خارجية',
        r.serves_breakfast && 'إفطار',
        r.wheelchair_accessible_entrance && 'مدخل لذوي الاحتياجات',
        r.reservable && 'يقبل الحجز',
      ].filter(Boolean),
      priceLevel: typeof r.price_level === 'number' ? '٪'.repeat(0) + '$'.repeat(r.price_level || 1) : '',
    },
    ratings: {
      average: typeof r.rating === 'number' ? r.rating : null,
      count: typeof r.user_ratings_total === 'number' ? r.user_ratings_total : null,
      distribution: { 5: null, 4: null, 3: null, 2: null, 1: null },
    },
    reviews,
    photos: [],
    qna: [],
    popularTimes: [],
    notes: '',
    // إفصاحٌ صريح يُعرَض في الواجهة: ما جاء وما لم يأتِ.
    coverage: {
      reviewsReturned: reviews.length,
      reviewsTotal: typeof r.user_ratings_total === 'number' ? r.user_ratings_total : null,
      limitNote: 'واجهة قوقل الرسمية تُرجع خمس مراجعات كحدٍّ أقصى. الباقي يُلصَق يدويًّا.',
    },
  };
}

export default async (request) => {
  const key = Netlify.env.get('GOOGLE_PLACES_KEY');
  if (!key) {
    return json({ error: 'لم يُضبط GOOGLE_PLACES_KEY على الموقع.', needsKey: true }, 503);
  }

  const url = new URL(request.url);
  const target = url.searchParams.get('url') || '';
  const wantPhotos = url.searchParams.get('photos') !== '0';
  if (!target) return json({ error: 'أرسل ?url=رابط قوقل مابز' }, 400);

  if (!allowedHost(target)) {
    return json({ error: 'الرابط ليس من قوقل مابز.' }, 400);
  }

  let info = readUrl(target);
  if (!info) return json({ error: 'الرابط غير صالح.' }, 400);

  if (info.short || (!info.placeId && !info.name)) {
    const full = await expand(target);
    info = readUrl(full) || info;
  }

  const placeId = await findPlaceId(info, key);
  if (!placeId) {
    return json({ error: 'تعذّر تحديد المنشأة من الرابط. جرّب الرابط الكامل من المتصفح لا المختصر.' }, 404);
  }

  const fields = [
    'name', 'formatted_address', 'vicinity', 'formatted_phone_number', 'international_phone_number',
    'website', 'url', 'geometry', 'rating', 'user_ratings_total', 'price_level', 'types',
    'opening_hours', 'current_opening_hours', 'reviews', 'photos', 'place_id',
    'delivery', 'dine_in', 'takeout', 'serves_breakfast', 'reservable', 'wheelchair_accessible_entrance',
  ].join(',');

  const res = await fetch(`${BASE}/details/json?${new URLSearchParams({
    place_id: placeId, fields, language: 'ar', reviews_no_translations: 'true', key,
  })}`);
  const data = await res.json();

  if (data.status !== 'OK') {
    return json({ error: `قوقل ردّ: ${data.status}`, detail: data.error_message || '' }, 502);
  }

  const place = toContract(data.result, { mapsUrl: target, placeId });

  if (wantPhotos && data.result.photos?.length) {
    const refs = data.result.photos.slice(0, MAX_PHOTOS).map((p) => p.photo_reference);
    const shots = await Promise.all(refs.map((ref) => fetchPhoto(ref, key)));
    place.photos = shots
      .map((url2, i) => (url2 ? { url: url2, caption: `صورة ${i + 1} من قوقل مابز` } : null))
      .filter(Boolean);
  }

  return json({ place });
};

export const config = { path: '/api/places' };
