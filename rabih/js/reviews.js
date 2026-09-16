// جلب كل التعليقات من مزوّد وسيط — جانب المتصفح.
//
// المفتاح لا يمرّ من هنا: النداء إلى `/api/reviews`، والدالّة الخادمية وحدها
// تعرف المفتاح. وما يعود تعليقاتٌ موحَّدة على عقد البيانات.

import { emptyReview } from './schema.js';
import { fetchHint } from './places.js';

/**
 * @returns {{ok:boolean, reviews?:Array, fetched?:number, claimed?:number|null,
 *            placeName?:string, average?:number|null, provider?:string,
 *            error?:string, needsKey?:boolean}}
 */
export async function fetchAllReviews(mapsUrl, { limit = 0, sort = '', provider = '' } = {}) {
  if (!mapsUrl) return { ok: false, error: 'لا رابط.' };
  const q = new URLSearchParams({ url: mapsUrl });
  if (limit) q.set('limit', String(limit));
  if (sort) q.set('sort', sort);
  if (provider) q.set('provider', provider);

  try {
    const res = await fetch(`/api/reviews?${q}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: data.error || fetchHint(res.status), needsKey: !!data.needsKey };
    }
    return {
      ok: true,
      reviews: Array.isArray(data.reviews) ? data.reviews : [],
      fetched: data.fetched || 0,
      claimed: data.claimed ?? null,
      placeName: data.placeName || '',
      average: data.average ?? null,
      provider: data.provider || '',
      truncated: !!data.truncated,
    };
  } catch {
    return { ok: false, error: 'تعذّر الاتصال بالدالة — هل المنصّة تعمل على Netlify؟' };
  }
}

// فاصلٌ لا يرد في نصّ تعليق، فلا يلتبس اسمٌ بنصّ عند بناء البصمة.
const SEP = String.fromCharCode(0);

/** بصمة تعليق: النص والكاتب معًا. تمنع التكرار عند إعادة الجلب أو الخلط باللصق. */
const fingerprint = (r) => `${(r.author || '').trim()}${SEP}${(r.text || '').trim()}`;

/**
 * يدمج ما جاء من المزوّد في التعليقات القائمة.
 *
 * والقاعدة: **لا يُدهَس ما بيدك ولا يُكرَّر ما عندك**. التعليق المطابق نصًّا
 * وكاتبًا يُترك، والباقي يُضاف في آخر القائمة.
 */
export function mergeReviews(existing, incoming) {
  const out = Array.isArray(existing) ? [...existing] : [];
  const seen = new Set(out.map(fingerprint));
  let added = 0;
  let duplicates = 0;
  let empties = 0;

  for (const raw of incoming || []) {
    const r = { ...emptyReview(), ...raw, id: '', source: raw.source || 'provider' };
    if (!r.text && r.rating === null) { empties += 1; continue; }
    const f = fingerprint(r);
    if (seen.has(f)) { duplicates += 1; continue; }
    seen.add(f);
    out.push(r);
    added += 1;
  }
  return { reviews: out, added, duplicates, empties };
}
