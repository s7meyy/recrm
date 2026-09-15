// جانب المتصفح من موصّل Places — ينادي الدالة الخادمية ويدمج ما جاء في التقرير.
//
// المبدأ الحاكم: **ما يجيء من قوقل يُدمج، وما يُدخِله المستخدم لا يُدهَس.**
// فمن كتب اسمًا أو عنوانًا بيده أولى بأن يبقى، والآلة تملأ الفارغ لا تصحّح المكتوب.

import { assignReviewIds } from './schema.js';

/**
 * يجلب بيانات المنشأة من الدالة الخادمية.
 * @returns {{ok:boolean, place?:object, photos?:Array, error?:string, needsKey?:boolean}}
 */
export async function fetchPlace(mapsUrl, { photos = true } = {}) {
  if (!mapsUrl) return { ok: false, error: 'لا رابط.' };
  try {
    const res = await fetch(`/api/places?url=${encodeURIComponent(mapsUrl)}&photos=${photos ? 1 : 0}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: data.error || `تعذّر الجلب (${res.status}).`, needsKey: !!data.needsKey };
    }
    return { ok: true, place: data.place, photos: data.photos || [] };
  } catch (e) {
    return { ok: false, error: 'تعذّر الاتصال بالدالة — هل المنصّة تعمل على Netlify؟' };
  }
}

/** حقل فارغ فعلًا: لا يُعدّ الصفر ولا القيمة المُدخَلة فراغًا. */
const empty = (v) => v === undefined || v === null || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && !v.length);

/**
 * يدمج ما جاء من قوقل في المنشأة القائمة.
 * @returns {{filled:string[], kept:string[], reviewsAdded:number, duplicates:number, photosAdded:number}}
 */
export function merge(place, incoming, { overwrite = false, photos = [], photoSink = null } = {}) {
  const filled = [];
  const kept = [];

  const put = (label, get, set) => {
    const now = get(place);
    const next = get(incoming);
    if (empty(next)) return;
    if (!empty(now) && !overwrite) { if (String(now) !== String(next)) kept.push(label); return; }
    set(place, next);
    filled.push(label);
  };

  put('الاسم', (p) => p.identity.name, (p, v) => { p.identity.name = v; });
  put('النشاط', (p) => p.identity.category, (p, v) => { p.identity.category = v; });
  put('العنوان', (p) => p.identity.address, (p, v) => { p.identity.address = v; });
  put('الهاتف', (p) => p.identity.phone, (p, v) => { p.identity.phone = v; });
  put('الموقع', (p) => p.identity.website, (p, v) => { p.identity.website = v; });
  put('الإحداثيات', (p) => p.identity.coords, (p, v) => { p.identity.coords = v; });
  put('ساعات العمل', (p) => p.identity.hours, (p, v) => { p.identity.hours = v; });
  put('المميزات', (p) => p.identity.attributes, (p, v) => { p.identity.attributes = v; });
  put('مستوى الأسعار', (p) => p.identity.priceLevel, (p, v) => { p.identity.priceLevel = v; });
  put('متوسط التقييم', (p) => p.ratings.average, (p, v) => { p.ratings.average = v; });
  put('عدد التقييمات', (p) => p.ratings.count, (p, v) => { p.ratings.count = v; });
  if (empty(place.placeId) && !empty(incoming.placeId)) place.placeId = incoming.placeId;

  // التعليقات تُضاف ولا تُبدَّل، والمكرر يُترك: نصٌّ وتقييمٌ متطابقان = هو هو.
  const seen = new Set((place.reviews || []).map((r) => `${r.rating}|${(r.text || '').trim()}`));
  let added = 0;
  let duplicates = 0;
  for (const r of incoming.reviews || []) {
    const key = `${r.rating}|${(r.text || '').trim()}`;
    if (seen.has(key)) { duplicates += 1; continue; }
    seen.add(key);
    place.reviews.push({ ...r, id: '' });   // المعرّفات تُعاد كلها لتبقى متسلسلة
    added += 1;
  }
  if (added) {
    place.reviews.forEach((r) => { r.id = ''; });
    assignReviewIds(place);
  }

  // الصور تُضاف بلا تكرار إلى مخزنها الوحيد على التقرير.
  let photosAdded = 0;
  if (photoSink) {
    const urls = new Set(photoSink.map((p) => p.url));
    for (const ph of [...(photos || []), ...(incoming.photos || [])]) {
      if (ph?.url && !urls.has(ph.url)) { photoSink.push(ph); urls.add(ph.url); photosAdded += 1; }
    }
  }

  place.placesCoverage = incoming.coverage || null;
  return { filled, kept, reviewsAdded: added, duplicates, photosAdded };
}
