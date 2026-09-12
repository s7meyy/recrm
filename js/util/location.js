// قراءة الموقع الجغرافي من نص: إحداثيات "24.71, 46.67" أو رابط خرائط جوجل كامل.
// الروابط المختصرة (maps.app.goo.gl) لا تحمل الإحداثيات في نصها فلا يمكن قراءتها.

import { foldDigits } from './arabic.js';

const PATTERNS = [
  /@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/, // …/@24.71,46.67,17z
  /[?&](?:q|ll|query|center|destination)=(-?\d{1,2}\.\d+),\s*(-?\d{1,3}\.\d+)/, // ?q=24.71,46.67
  /!3d(-?\d{1,2}\.\d+)!4d(-?\d{1,3}\.\d+)/, // …!3d24.71!4d46.67
  /^\s*(-?\d{1,2}\.\d+)[\s,،]+(-?\d{1,3}\.\d+)\s*$/, // 24.71, 46.67
];

function valid(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

/** يعيد { lat, lng } أو null إن تعذرت القراءة. */
export function parseLocation(text) {
  const s = foldDigits(String(text ?? '')).trim();
  if (!s) return null;
  for (const re of PATTERNS) {
    const m = re.exec(s);
    if (m) {
      const lat = Number(m[1]);
      const lng = Number(m[2]);
      if (valid(lat, lng)) return { lat, lng };
    }
  }
  return null;
}

export function isShortMapLink(text) {
  return /maps\.app\.goo\.gl|goo\.gl\/maps/i.test(String(text ?? ''));
}

export function locationToText(loc) {
  if (!loc) return '';
  return `${Number(loc.lat).toFixed(6)}, ${Number(loc.lng).toFixed(6)}`;
}

export function mapsLink(loc) {
  return `https://www.google.com/maps?q=${loc.lat},${loc.lng}`;
}

const EARTH_RADIUS_M = 6371000;

/** المسافة بالأمتار بين نقطتين (معادلة Haversine)، أو null إن كانت إحداهما ناقصة. */
export function distanceMeters(a, b) {
  if (!a || !b) return null;
  const lat1 = Number(a.lat);
  const lng1 = Number(a.lng);
  const lat2 = Number(b.lat);
  const lng2 = Number(b.lng);
  if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) return null;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(Math.min(1, s)));
}
