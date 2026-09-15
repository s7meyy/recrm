// الوسائط: صورٌ ومقاطع (المرحلة ٣٨).
//
// الصور: ضغط قبل التخزين (JPEG بحد أقصى 1600 بكسل + مصغّرة 320 بكسل)، تخزين في مخزن images
// منفصل عن سجل العقار، وذاكرة روابط مؤقتة للعرض، وحذف فردي لتخفيف المساحة.
// تنبيه للمرحلة ٢: الضغط عبر canvas يزيل بيانات EXIF (ومنها إحداثيات GPS) — اقرأها من الملف الأصلي قبل الضغط.
//
// المقاطع (المرحلة ٣٨): تُحفظ **كما هي بلا ضغط**، ويُلتقط لها إطارٌ أوّل صورةً للعرض.
// وهذا قولٌ صريح لا تفصيلٌ تقنيّ: ضغط المقطع في المتصفّح يعني إعادة ترميزه كاملًا، وهو
// عملٌ يستغرق دقائق ويستهلك البطارية ويفقد الجودة — فلا يُدَّعى ولا يُفعل خلسةً. ولذلك
// حدٌّ أعلى للحجم يُقال للمستخدم صراحةً قبل أن يمتلئ جهازه.

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

export const VIDEO_LIMITS = {
  maxBytes: 60 * 1024 * 1024, // ٦٠ م.ب — مقطعٌ أطول يملأ مخزن المتصفّح فيتوقّف كلّ شيء
  posterDim: 480,
  posterQuality: 0.75,
};

export const isVideo = (rec) => String(rec?.mime || '').startsWith('video/');
export const isVideoFile = (file) => String(file?.type || '').startsWith('video/');

/**
 * إطارٌ من المقطع صورةً للعرض. يُؤخذ من الثانية الأولى لا من الصفر: أوّل إطارٍ في كثيرٍ
 * من المقاطع أسودُ خالص، فتبدو المكتبة كلّها مربّعاتٍ سوداء.
 */
export function videoPoster(file, limits = VIDEO_LIMITS) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      URL.revokeObjectURL(url);
      resolve(value);
    };
    // لقطة الإطار قد تفشل لأسبابٍ كثيرة (ترميزٌ لا يعرفه المتصفّح، ملفٌّ ناقص) —
    // وفشلُها لا يمنع حفظ المقطع: يُحفظ بلا صورةٍ ويُعرض بعلامة «مقطع».
    const fail = () => finish({ poster: null, width: null, height: null, duration: null });
    video.muted = true;
    video.playsInline = true;
    video.preload = 'metadata';
    video.onerror = fail;
    setTimeout(fail, 8000); // لا ننتظر إلى الأبد: ملفٌّ عصيّ يُحفظ بلا صورة
    video.onloadeddata = () => {
      const seekTo = Math.min(1, (video.duration || 1) / 2);
      const grab = () => {
        try {
          const w = video.videoWidth;
          const h = video.videoHeight;
          if (!w || !h) return fail();
          const ratio = Math.min(1, limits.posterDim / Math.max(w, h));
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(w * ratio));
          canvas.height = Math.max(1, Math.round(h * ratio));
          const c = canvas.getContext('2d');
          if (!c) return fail();
          c.drawImage(video, 0, 0, canvas.width, canvas.height);
          canvas.toBlob(
            (blob) => finish({ poster: blob || null, width: w, height: h, duration: video.duration || null }),
            'image/jpeg', limits.posterQuality,
          );
        } catch (_) { fail(); }
        return undefined;
      };
      video.onseeked = grab;
      try { video.currentTime = seekTo; } catch (_) { grab(); }
    };
    video.src = url;
  });
}

/** يخزّن مقطعًا كما هو ويعيد سجلّه. لا ضغط ولا إعادة ترميز — راجع رأس الملف. */
export async function storeVideo(file, { entity = 'property', entityId = null } = {}, limits = VIDEO_LIMITS) {
  if (file.size > limits.maxBytes) {
    throw new Error(`المقطع ${formatBytes(file.size)} وهو أكبر من الحدّ (${formatBytes(limits.maxBytes)}). `
      + 'المقاطع تُحفظ كما هي بلا ضغط — اقتطع منه أو صوّره بجودة أقلّ.');
  }
  const { poster, width, height, duration } = await videoPoster(file, limits);
  return repo.images.create({
    entity, entityId, mime: file.type || 'video/mp4', blob: file, thumb: poster,
    width, height, duration,
    size: file.size, originalName: file.name || '', originalSize: file.size ?? null,
  });
}

/** يخزّن ملفًا أيًّا كان نوعه: صورةً مضغوطة أو مقطعًا كما هو. */
export async function storeMedia(file, opts = {}) {
  return isVideoFile(file) ? storeVideo(file, opts) : storeImage(file, opts);
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
  // مقطعٌ بلا صورةٍ ملتقطة لا يُسلَّم مقطعًا لطالب صورة (المرحلة ٣٨): كان يُعاد الـblob
  // نفسه فيُوضع في <img> فلا يظهر شيء ولا يقول شيءٌ عن السبب.
  if (rec && thumb && isVideo(rec) && !rec.thumb) return null;
  const blob = rec ? (thumb && rec.thumb ? rec.thumb : rec.blob) : null;
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  urlCache.set(key, url);
  return url;
}

/**
 * أوّل معرّفٍ يصلح صورةً ساكنة من قائمة وسائط (المرحلة ٣٨).
 * الطباعة والصفحة العامة تريدان صورةً لا مقطعًا: ورقةٌ لا تشغّل فيديو، وبطاقةُ عرضٍ
 * لا تُظهر مربّعًا فارغًا. والمقطع بصورته الملتقطة يصلح، وبلا صورةٍ لا يصلح.
 */
export async function firstStillId(ids = []) {
  for (const id of ids) {
    const rec = await repo.images.get(id);
    if (!rec) continue;
    if (!isVideo(rec) || rec.thumb) return id;
  }
  return null;
}

/** يقسم قائمة وسائط إلى صورٍ ومقاطع، بالترتيب نفسه. */
export async function splitMedia(ids = []) {
  const images = [];
  const videos = [];
  for (const id of ids) {
    const rec = await repo.images.get(id);
    if (!rec) continue;
    (isVideo(rec) ? videos : images).push(id);
  }
  return { images, videos };
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
  // المقاطع تُعدّ وتُوزن على حدة (المرحلة ٣٨): مقطعٌ واحد قد يساوي مئة صورة، فخلطهما
  // في رقمٍ واحد يُخفي سبب امتلاء المساحة عمّن يبحث عنه.
  const videos = all.filter(isVideo);
  const videoBytes = videos.reduce((sum, r) => sum + (r.size || 0) + (r.thumb?.size || 0), 0);
  return {
    count: all.length,
    bytes,
    videoCount: videos.length,
    videoBytes,
    imageCount: all.length - videos.length,
    imageBytes: bytes - videoBytes,
  };
}

export function formatBytes(bytes) {
  if (!bytes) return '0 بايت';
  const units = ['بايت', 'ك.ب', 'م.ب', 'ج.ب'];
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}
