// موصّل المزوّد الوسيط — الطريق المشروع لجلب **كل** التعليقات من رابط واحد.
//
// **لماذا مزوّد لا كشط بأنفسنا؟** كشط صفحة قوقل مخالفٌ لشروطه، ويُحظَر عند
// اكتشافه، وينكسر كلما غيّر قوقل صفحته. والمزوّد يتولّى ذلك ويتحمّل تبعته
// ويعطينا واجهةً ثابتة. وواجهة قوقل الرسمية لا تعطي إلا خمس مراجعات، فهي
// تحلّ البطاقة لا عمق التعليقات.
//
// **مزوّدان مدعومان**، ويُختار بحسب المفتاح الموجود في بيئة Netlify:
//   OUTSCRAPER_KEY   → api.outscraper.cloud
//   APIFY_TOKEN      → api.apify.com  (فاعل compass/google-maps-reviews-scraper)
// فإن وُجد الاثنان قُدِّم Outscraper، ويمكن فرض أحدهما بـ ?provider=apify.
//
// **ولا يصل المفتاح المتصفحَ أبدًا**: النداء كلّه هنا، والمُعاد تعليقاتٌ فقط.
//
// **صدق المخرج**: لا يُخترع حقلٌ ولا يُكمَّل ناقص. ما لم يعطه المزوّد يبقى فارغًا،
// والمُعاد يحمل `fetched` (كم جاء) و`claimed` (كم يقول قوقل) ليُقاس النقص لا يُخفى.

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

// سقفٌ يحمي من فاتورة غير متوقَّعة ومن ردٍّ لا ينتهي.
const HARD_CAP = 2000;
const TIMEOUT_MS = 110000;

/** الرابط يأتي من المتصفح، فلا يُمرَّر إلى المزوّد إلا إن كان رابط قوقل. */
const ALLOWED = ['google.com', 'goo.gl', 'g.co', 'google.com.sa'];
function allowedHost(raw) {
  try {
    const h = new URL(raw).hostname.toLowerCase();
    return ALLOWED.some((d) => h === d || h.endsWith('.' + d));
  } catch { return false; }
}

const str = (v) => (v === undefined || v === null ? '' : String(v).trim());

/**
 * المفتاح يُرسَل في ترويسة، والترويسة لا تحتمل إلا حروفًا لاتينية.
 *
 * ومفتاحٌ لُصق ومعه مسافة أو سطرٌ جديد أو حرفٌ عربي يُسقط النداء برسالة
 * مبهمة من المنصّة («Cannot convert argument to a ByteString»)، فيظنّ صاحبه
 * العطل في المزوّد. فيُفحَص هنا ويُقال له ما الخطب.
 */
function cleanKey(raw) {
  const k = str(raw);
  if (!k) return { ok: false, why: 'المفتاح فارغ.' };
  if (!/^[\x21-\x7e]+$/.test(k)) {
    return { ok: false, why: 'المفتاح فيه مسافة أو سطر جديد أو حرف غير لاتيني — انسخه من لوحة المزوّد بلا زيادة.' };
  }
  return { ok: true, key: k };
}

/** أول قيمة غير فارغة بين أسماء حقول محتملة — أسماء المزوّدين تتغيّر. */
function pick(obj, names) {
  for (const n of names) {
    const v = obj?.[n];
    if (v !== undefined && v !== null && String(v).trim() !== '') return v;
  }
  return '';
}

function toRating(v) {
  const n = Number(String(v).replace(',', '.'));
  if (!Number.isFinite(n)) return null;
  const r = Math.round(n);
  return r >= 1 && r <= 5 ? r : null;
}

/** يوحّد تعليق أي مزوّد إلى عقد البيانات — بلا اختراع حقلٍ لم يرد. */
function normalizeReview(raw) {
  const text = str(pick(raw, ['review_text', 'text', 'snippet', 'reviewText', 'comment']));
  const rating = toRating(pick(raw, ['review_rating', 'stars', 'rating', 'reviewRating']));
  const date = str(pick(raw, [
    'review_datetime_utc', 'publishedAtDate', 'publishAt', 'date', 'reviewDate', 'iso_date',
  ]));
  const author = str(pick(raw, ['author_title', 'name', 'author', 'reviewerName', 'user_name']));
  const reply = str(pick(raw, [
    'owner_answer', 'responseFromOwnerText', 'response_from_owner_text', 'ownerResponse', 'reply',
  ]));
  const likes = Number(pick(raw, ['review_likes', 'likesCount', 'likes']));
  return {
    id: '',
    author,
    rating,
    date,
    text,
    ownerReply: reply,
    language: str(pick(raw, ['review_language', 'language', 'originalLanguage'])),
    likes: Number.isFinite(likes) && likes >= 0 ? likes : null,
  };
}

/** تعليقٌ بلا نصٍّ ولا تقييم لا يفيد التحليل، ووجوده يُفسد نسب العيّنة. */
const usable = (r) => !!(r.text || r.rating);

async function withTimeout(promise, ms, label) {
  let t;
  const timeout = new Promise((_, rej) => { t = setTimeout(() => rej(new Error(label)), ms); });
  try { return await Promise.race([promise, timeout]); } finally { clearTimeout(t); }
}

/* ───────────────────────────── Outscraper ───────────────────────────── */

async function fromOutscraper(url, limit, key, sort) {
  const api = new URL('https://api.outscraper.cloud/maps/reviews-v3');
  api.searchParams.set('query', url);
  api.searchParams.set('reviewsLimit', String(limit)); // 0 عنده = الكل
  api.searchParams.set('sort', sort === 'newest' ? 'newest' : 'most_relevant');
  api.searchParams.set('language', 'ar');
  api.searchParams.set('async', 'false');

  const res = await withTimeout(
    fetch(api, { headers: { 'X-API-KEY': key } }),
    TIMEOUT_MS, 'انتهت المهلة قبل ردّ المزوّد (Outscraper).',
  );
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = str(body?.errorMessage || body?.message || body?.error) || `رمز ${res.status}`;
    throw new Error(`Outscraper ردّ بخطأ: ${msg}`);
  }

  const first = Array.isArray(body?.data) ? body.data[0] : null;
  if (!first) throw new Error('Outscraper لم يُعِد بيانات لهذا الرابط.');

  const list = Array.isArray(first.reviews_data) ? first.reviews_data : [];
  return {
    reviews: list.map(normalizeReview).filter(usable),
    claimed: Number(first.reviews) || null,
    placeName: str(first.name),
    average: Number(first.rating) || null,
  };
}

/* ─────────────────────────────── Apify ─────────────────────────────── */

async function fromApify(url, limit, token, sort) {
  const api = new URL('https://api.apify.com/v2/acts/compass~google-maps-reviews-scraper/run-sync-get-dataset-items');
  api.searchParams.set('token', token);

  const res = await withTimeout(fetch(api, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      startUrls: [{ url }],
      maxReviews: limit || HARD_CAP,
      reviewsSort: sort === 'newest' ? 'newest' : 'mostRelevant',
      language: 'ar',
    }),
  }), TIMEOUT_MS, 'انتهت المهلة قبل ردّ المزوّد (Apify).');

  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = str(body?.error?.message || body?.message) || `رمز ${res.status}`;
    throw new Error(`Apify ردّ بخطأ: ${msg}`);
  }
  const items = Array.isArray(body) ? body : (Array.isArray(body?.items) ? body.items : []);
  if (!items.length) throw new Error('Apify لم يُعِد أي عنصر لهذا الرابط.');

  const meta = items.find((i) => i && (i.reviewsCount || i.totalScore)) || {};
  return {
    reviews: items.map(normalizeReview).filter(usable),
    claimed: Number(meta.reviewsCount) || null,
    placeName: str(meta.title || meta.name),
    average: Number(meta.totalScore) || null,
  };
}

/* ─────────────────────────────── المدخل ─────────────────────────────── */

export default async (request) => {
  const url = new URL(request.url);
  const target = str(url.searchParams.get('url'));
  const forced = str(url.searchParams.get('provider')).toLowerCase();
  const sort = str(url.searchParams.get('sort'));
  let limit = parseInt(url.searchParams.get('limit') || '0', 10);
  if (!Number.isFinite(limit) || limit < 0) limit = 0;
  if (limit > HARD_CAP) limit = HARD_CAP;

  if (!target) return json({ error: 'لا رابط.' }, 400);
  if (!allowedHost(target)) {
    return json({ error: 'الرابط ليس من خرائط قوقل.' }, 400);
  }

  const outKey = process.env.OUTSCRAPER_KEY;
  const apifyKey = process.env.APIFY_TOKEN;

  let provider = '';
  if (forced === 'apify' && apifyKey) provider = 'apify';
  else if (forced === 'outscraper' && outKey) provider = 'outscraper';
  else if (outKey) provider = 'outscraper';
  else if (apifyKey) provider = 'apify';

  if (!provider) {
    return json({
      needsKey: true,
      error: 'لا مفتاح مزوّد. أضف OUTSCRAPER_KEY أو APIFY_TOKEN في متغيّرات البيئة على Netlify.',
    }, 503);
  }

  const chosen = cleanKey(provider === 'outscraper' ? outKey : apifyKey);
  if (!chosen.ok) {
    return json({ provider, error: `مفتاح ${provider} غير صالح: ${chosen.why}` }, 400);
  }

  try {
    const r = provider === 'outscraper'
      ? await fromOutscraper(target, limit, chosen.key, sort)
      : await fromApify(target, limit, chosen.key, sort);

    const reviews = r.reviews.slice(0, HARD_CAP);
    return json({
      provider,
      reviews,
      fetched: reviews.length,
      claimed: r.claimed,          // ما يقوله قوقل — ليُقاس النقص لا يُخفى
      placeName: r.placeName,
      average: r.average,
      truncated: r.reviews.length > reviews.length,
    });
  } catch (e) {
    return json({ provider, error: str(e.message) || 'تعذّر الجلب من المزوّد.' }, 502);
  }
};

export const config = { path: '/api/reviews' };
