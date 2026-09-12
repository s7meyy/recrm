// الصور: ضغط قبل التخزين (JPEG بحد أقصى 1600 بكسل + مصغّرة 320 بكسل)، تخزين في مخزن images
// منفصل عن سجل العقار، وذاكرة روابط مؤقتة للعرض، وحذف فردي لتخفيف المساحة.
// تنبيه للمرحلة ٢: الضغط عبر canvas يزيل بيانات EXIF (ومنها إحداثيات GPS) — اقرأها من الملف الأصلي قبل الضغط.

import { repo } from './repository.js';

export const IMAGE_LIMITS = { maxDim: 1600, quality: 0.8, thumbDim: 320, thumbQuality: 0.7 };

const urlCache = new Map(); // `${id}:${t|f}` → object URL

async function loadSource(blob) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(blob, { imageOrientation: 'from-image' });
    } catch (_) { /* نجرّب عنصر الصورة */ }
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('تعذر قراءة الصورة — قد تكون صيغتها غير مدعومة في هذا المتصفح (مثل HEIC)'));
    };
    img.src = url;
  });
}

function scaleToBlob(source, maxDim, quality) {
  const w = source.naturalWidth || source.width;
  const h = source.naturalHeight || source.height;
  const ratio = Math.min(1, maxDim / Math.max(w, h));
  const width = Math.max(1, Math.round(w * ratio));
  const height = Math.max(1, Math.round(h * ratio));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('المتصفح لا يدعم معالجة الصور (canvas)');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(source, 0, 0, width, height);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve({ blob, width, height }) : reject(new Error('فشل ضغط الصورة'))), 'image/jpeg', quality);
  });
}

/** يضغط ملف صورة ويعيد { blob, width, height, thumb } دون تخزين. */
export async function compressImage(file, limits = IMAGE_LIMITS) {
  const source = await loadSource(file);
  try {
    const main = await scaleToBlob(source, limits.maxDim, limits.quality);
    const thumb = await scaleToBlob(source, limits.thumbDim, limits.thumbQuality);
    return { ...main, thumb: thumb.blob };
  } finally {
    if (typeof source.close === 'function') source.close();
  }
}

/** يضغط ويخزّن الصورة ويعيد سجلها (يُضاف id إلى property.images من المستدعي). */
export async function storeImage(file, { entity = 'property', entityId = null } = {}) {
  const { blob, width, height, thumb } = await compressImage(file);
  return repo.images.create({
    entity, entityId, mime: 'image/jpeg', blob, thumb, width, height,
    size: blob.size, originalName: file.name || '', originalSize: file.size ?? null,
  });
}

/** رابط عرض مؤقت للصورة (أو مصغّرتها). يُخزَّن حتى revokeImageUrls(). */
export async function getImageUrl(id, { thumb = false } = {}) {
  const key = `${id}:${thumb ? 't' : 'f'}`;
  if (urlCache.has(key)) return urlCache.get(key);
  const rec = await repo.images.get(id);
  const blob = rec ? (thumb && rec.thumb ? rec.thumb : rec.blob) : null;
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  urlCache.set(key, url);
  return url;
}

/** يحرّر كل روابط العرض المؤقتة (يُستدعى عند تغيير الصفحة). */
export function revokeImageUrls() {
  for (const url of urlCache.values()) URL.revokeObjectURL(url);
  urlCache.clear();
}

/** يحذف صورة واحدة من التخزين (يبقى على المستدعي إزالة id من property.images). */
export async function removeImage(id) {
  for (const suffix of ['t', 'f']) {
    const key = `${id}:${suffix}`;
    if (urlCache.has(key)) {
      URL.revokeObjectURL(urlCache.get(key));
      urlCache.delete(key);
    }
  }
  await repo.images.remove(id);
}

export async function deleteImages(ids = []) {
  for (const id of ids) await removeImage(id);
}

/** عدد الصور ومجموع حجمها (الأصل المضغوط + المصغّرة). */
export async function imagesSummary() {
  const all = await repo.images.list();
  const bytes = all.reduce((sum, r) => sum + (r.size || 0) + (r.thumb?.size || 0), 0);
  return { count: all.length, bytes };
}

export function formatBytes(bytes) {
  if (!bytes) return '0 بايت';
  const units = ['بايت', 'ك.ب', 'م.ب', 'ج.ب'];
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}
