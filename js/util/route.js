// تخطيط جولة اليوم (المرحلة ١٨): ترتيب المحطات وفتحها في خرائط جوجل.
//
// **ليس حلًّا أمثل لمسألة البائع المتجول** ولا يدّعيه: ترتيبٌ جشِع بـ«الأقرب فالأقرب»،
// وهو تقريبٌ سريع يكفي لثماني محطات في مدينة — وأفضل بكثير من ترتيب عشوائي. والمسافة
// المذكورة **مسافة هواء لا طريق**، فهي أقصر من الواقع دائمًا؛ ولذلك تُذكر «تقديرية».
//
// ولا خدمة توجيه ولا مفتاح ولا تكلفة: الرابط عامٌّ تفتحه خرائط جوجل نفسها.

import { distanceMeters } from './location.js';

/** أقصى ما يقبله رابط خرائط جوجل: نقطة بداية ونهاية وثماني محطات بينهما. */
export const MAX_STOPS = 10;

/**
 * يرتّب المحطات بالأقرب فالأقرب ابتداءً من نقطة البداية.
 * @param {[{lat, lng}]} stops المحطات (كل عنصر يحمل lat/lng وما شئت معه)
 * @param {{lat, lng}|null} start نقطة البداية، أو null فتكون أول محطة هي البداية
 */
export function orderRoute(stops = [], start = null) {
  const remaining = stops.filter((s) => Number.isFinite(Number(s?.lat)) && Number.isFinite(Number(s?.lng)));
  const ordered = [];
  let cursor = start && Number.isFinite(Number(start.lat)) ? start : remaining.shift();
  if (cursor && !start) ordered.push(cursor);
  while (remaining.length) {
    let bestIndex = 0;
    let bestDistance = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = distanceMeters(cursor, remaining[i]);
      if (d < bestDistance) { bestDistance = d; bestIndex = i; }
    }
    const next = remaining.splice(bestIndex, 1)[0];
    ordered.push(next);
    cursor = next;
  }
  return ordered;
}

/** طول المسار بالمتر (مسافة هواء بين المحطات بالترتيب). */
export function routeLength(ordered = [], start = null) {
  let total = 0;
  let prev = start || ordered[0];
  for (const stop of (start ? ordered : ordered.slice(1))) {
    total += distanceMeters(prev, stop);
    prev = stop;
  }
  return total;
}

const pair = (p) => `${Number(p.lat).toFixed(6)},${Number(p.lng).toFixed(6)}`;

/**
 * رابط اتجاهات خرائط جوجل: بداية ونهاية ومحطات بينهما بالترتيب.
 * @returns {{ url, used, dropped }} مع عدد ما دخل وما سقط لتجاوز الحدّ.
 */
export function googleMapsRoute(ordered = [], start = null) {
  const stops = [...(start ? [start] : []), ...ordered];
  const used = stops.slice(0, MAX_STOPS);
  const dropped = stops.length - used.length;
  if (used.length < 2) return { url: null, used: used.length, dropped };
  const origin = used[0];
  const destination = used[used.length - 1];
  const waypoints = used.slice(1, -1);
  const params = new URLSearchParams({
    api: '1',
    origin: pair(origin),
    destination: pair(destination),
    travelmode: 'driving',
  });
  if (waypoints.length) params.set('waypoints', waypoints.map(pair).join('|'));
  return { url: `https://www.google.com/maps/dir/?${params.toString()}`, used: used.length, dropped };
}
