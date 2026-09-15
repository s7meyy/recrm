// ختم الصور بالشعار (المرحلة ٣٨).
//
// الختم هنا **يُحرق في الصورة** لا يُوضع طبقةً فوقها: الصورة تُرسل في واتساب وتُنسخ
// وتُعاد نشرًا، فطبقةٌ في الصفحة تسقط عند أوّل نسخ. ولذلك تُرسم على canvas وتُصدَّر ملفًا
// جديدًا — والأصل يبقى كما هو، فمن أخطأ في الشفافية أعاد الختم من الأصل لا من المختوم.
//
// وكلُّ الحساب هنا **بالنسبة لا بالبكسل**: الشعار بنسبةٍ من عرض الصورة، والهامش بنسبةٍ
// منه كذلك. صورةٌ ٤٠٠٠ بكسل وأخرى ٨٠٠ تأخذان الختم نفسه حجمًا في العين — ولو كان بالبكسل
// لاختفى في الأولى وغطّى الثانية.

export const POSITIONS = [
  { key: 'center', label: 'الوسط' },
  { key: 'top-start', label: 'أعلى اليمين' },
  { key: 'top-end', label: 'أعلى اليسار' },
  { key: 'bottom-start', label: 'أسفل اليمين' },
  { key: 'bottom-end', label: 'أسفل اليسار' },
  { key: 'tile', label: 'مكرَّر على الصورة كلّها' },
];

/** نمطٌ واحد: أين الشعار، وكم حجمه، وكم شفافيّته. */
export const DEFAULT_PATTERN = () => ({
  logoId: null,
  position: 'bottom-start',
  sizePct: 18, // نسبة من عرض الصورة
  opacity: 0.75,
  marginPct: 3,
  rotate: 0, // درجات — للنمط المكرَّر غالبًا
});

export const SIZE_PRESETS = [
  { key: 'small', label: 'صغير', sizePct: 10 },
  { key: 'medium', label: 'متوسط', sizePct: 18 },
  { key: 'large', label: 'كبير', sizePct: 32 },
  { key: 'huge', label: 'يغطّي الصورة', sizePct: 60 },
];

const clamp = (n, min, max) => Math.min(max, Math.max(min, Number(n) || 0));

/**
 * موضع الشعار بالبكسل داخل صورةٍ بأبعادٍ معلومة.
 * ملاحظة على الاتجاه: `start` هي اليمين لأنّ الواجهة عربية — وهو ما يتوقّعه من يقرأ
 * «أعلى اليمين» في القائمة. والحساب هنا صريحٌ لا يعتمد على اتجاه الصفحة، فالصورة تُقرأ
 * كما هي أينما فُتحت.
 */
export function placeAt(position, { imgW, imgH, logoW, logoH, margin }) {
  const map = {
    'top-start': [imgW - logoW - margin, margin],
    'top-end': [margin, margin],
    'bottom-start': [imgW - logoW - margin, imgH - logoH - margin],
    'bottom-end': [margin, imgH - logoH - margin],
    center: [(imgW - logoW) / 2, (imgH - logoH) / 2],
  };
  const [x, y] = map[position] || map['bottom-start'];
  return { x, y };
}

async function toBitmap(blob) {
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(blob); } catch (_) { /* نجرّب العنصر */ }
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('تعذّر قراءة الصورة')); };
    img.src = url;
  });
}

const dimsOf = (src) => ({ w: src.naturalWidth || src.width, h: src.naturalHeight || src.height });

/** يرسم نمطًا واحدًا على سياق canvas. مكشوفةٌ للاختبار. */
export function drawPattern(ctx2d, pattern, { imgW, imgH, logo }) {
  const { w: lw, h: lh } = dimsOf(logo);
  if (!lw || !lh) return 0;
  const sizePct = clamp(pattern.sizePct, 1, 100);
  const targetW = (imgW * sizePct) / 100;
  const targetH = (targetW * lh) / lw;
  const margin = (imgW * clamp(pattern.marginPct, 0, 40)) / 100;

  ctx2d.save();
  ctx2d.globalAlpha = clamp(pattern.opacity, 0.02, 1);

  let drawn = 0;
  if (pattern.position === 'tile') {
    // المكرَّر يحمي الصورة من القصّ: من قصّ الزاوية بقي الختم في الوسط.
    const stepX = targetW * 1.8;
    const stepY = targetH * 2.4;
    for (let y = -targetH; y < imgH + targetH; y += stepY) {
      for (let x = -targetW; x < imgW + targetW; x += stepX) {
        ctx2d.save();
        ctx2d.translate(x + targetW / 2, y + targetH / 2);
        ctx2d.rotate(((pattern.rotate || -20) * Math.PI) / 180);
        ctx2d.drawImage(logo, -targetW / 2, -targetH / 2, targetW, targetH);
        ctx2d.restore();
        drawn++;
      }
    }
  } else {
    const { x, y } = placeAt(pattern.position, { imgW, imgH, logoW: targetW, logoH: targetH, margin });
    ctx2d.save();
    ctx2d.translate(x + targetW / 2, y + targetH / 2);
    if (pattern.rotate) ctx2d.rotate((pattern.rotate * Math.PI) / 180);
    ctx2d.drawImage(logo, -targetW / 2, -targetH / 2, targetW, targetH);
    ctx2d.restore();
    drawn = 1;
  }
  ctx2d.restore();
  return drawn;
}

/**
 * يختم صورةً بأنماطٍ متعدّدة ويعيد ملفًا جديدًا.
 * @param {Blob} imageBlob الصورة الأصلية — لا تُمسّ
 * @param {Array} patterns الأنماط بالترتيب (الأول أسفل، والأخير فوق)
 * @param {Map}   logos معرّف الشعار ← Blob
 * @returns {Promise<{blob: Blob, width: number, height: number}>}
 */
export async function stampImage(imageBlob, patterns, logos, { quality = 0.9, maxDim = 0 } = {}) {
  const base = await toBitmap(imageBlob);
  const { w, h } = dimsOf(base);
  const ratio = maxDim > 0 ? Math.min(1, maxDim / Math.max(w, h)) : 1;
  const width = Math.max(1, Math.round(w * ratio));
  const height = Math.max(1, Math.round(h * ratio));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const c = canvas.getContext('2d');
  if (!c) throw new Error('المتصفح لا يدعم معالجة الصور (canvas)');
  c.drawImage(base, 0, 0, width, height);

  const bitmaps = new Map();
  try {
    for (const pattern of patterns) {
      if (!pattern?.logoId) continue;
      const blob = logos.get(pattern.logoId);
      if (!blob) continue;
      if (!bitmaps.has(pattern.logoId)) bitmaps.set(pattern.logoId, await toBitmap(blob));
      drawPattern(c, pattern, { imgW: width, imgH: height, logo: bitmaps.get(pattern.logoId) });
    }
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('فشل إنشاء الصورة المختومة'))), 'image/jpeg', quality);
    });
    return { blob, width, height };
  } finally {
    for (const bmp of bitmaps.values()) if (typeof bmp.close === 'function') bmp.close();
    if (typeof base.close === 'function') base.close();
  }
}

/* ===== ختم المقاطع ===== */

/**
 * **قل الحقيقة قبل أن تَعِد**: ختم المقطع ليس كختم الصورة. الصورة تُرسم مرّةً وتُصدَّر
 * في جزءٍ من الثانية؛ والمقطع صورةٌ في كل إطار، فلا سبيل إلى حرق الشعار فيه إلا بإعادة
 * ترميزه كاملًا. وما في المتصفّح لذلك واحد: تشغيل المقطع على canvas وتسجيل الناتج
 * (MediaRecorder). وهذا يعني ثلاثة أمورٍ لا تُخفى:
 *
 *   ١) **الوقت بالوقت**: مقطع دقيقتين يأخذ دقيقتين. لا تسريع — لأنّ التسجيل يلتقط ما
 *      يُعرض، وما يُعرض يجري بزمنه. ولذلك لا يُختم مقطعٌ في دفعةٍ من عشرين بلا أن يُقال.
 *   ٢) **الصيغة تتبدّل** إلى WebM غالبًا (وهي ما يسجّله المتصفّح)، وهذا مقبولٌ في
 *      واتساب وتويتر، وقد لا يُقبل في مواضع أخرى.
 *   ٣) **الجودة تنقص**: إعادة الترميز لا تعيد الأصل.
 *
 * ومن لم يُرِد هذا فله بديلٌ أصدق: ختم صورةٍ من المقطع وإرسالها معه.
 */
export const VIDEO_STAMP = {
  supported: () => typeof MediaRecorder !== 'undefined'
    && typeof HTMLCanvasElement !== 'undefined'
    && typeof HTMLCanvasElement.prototype.captureStream === 'function',
  // ترتيبٌ بالأفضل: VP9 أصغر حجمًا، وVP8 أوسع قبولًا، والأخير للمتصفّحات التي تأبى غيره.
  mimeCandidates: ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'],
};

export function pickVideoMime() {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return '';
  return VIDEO_STAMP.mimeCandidates.find((m) => MediaRecorder.isTypeSupported(m)) || '';
}

/**
 * يختم مقطعًا بإعادة ترميزه في زمنه الحقيقي.
 * @param {Blob} videoBlob المقطع الأصلي — لا يُمسّ
 * @param {Array} patterns الأنماط
 * @param {Map} logos معرّف ← Blob
 * @param {object} opts { onProgress(ratio), signal }
 */
export async function stampVideo(videoBlob, patterns, logos, { onProgress = null, signal = null } = {}) {
  if (!VIDEO_STAMP.supported()) throw new Error('متصفّحك لا يدعم تسجيل المقاطع — جرّب كروم أو إيدج حديثًا');
  const mime = pickVideoMime();
  if (!mime) throw new Error('متصفّحك لا يدعم أيّ صيغة تسجيل نعرفها');

  const url = URL.createObjectURL(videoBlob);
  const video = document.createElement('video');
  video.src = url;
  video.muted = true;
  video.playsInline = true;

  try {
    await new Promise((resolve, reject) => {
      video.onloadedmetadata = resolve;
      video.onerror = () => reject(new Error('تعذّر قراءة المقطع — قد تكون صيغته غير مدعومة هنا'));
    });

    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!width || !height) throw new Error('المقطع بلا أبعاد معروفة');

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const c = canvas.getContext('2d');
    if (!c) throw new Error('المتصفح لا يدعم معالجة الصور (canvas)');

    const bitmaps = new Map();
    for (const pattern of patterns) {
      if (!pattern?.logoId || bitmaps.has(pattern.logoId)) continue;
      const blob = logos.get(pattern.logoId);
      if (blob) bitmaps.set(pattern.logoId, await toBitmap(blob));
    }

    const stream = canvas.captureStream(30);
    const chunks = [];
    const recorder = new MediaRecorder(stream, { mimeType: mime });
    recorder.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data); };

    const finished = new Promise((resolve, reject) => {
      recorder.onstop = () => resolve(new Blob(chunks, { type: mime }));
      recorder.onerror = () => reject(new Error('انقطع التسجيل'));
    });

    let stopped = false;
    const stop = () => {
      if (stopped) return;
      stopped = true;
      try { recorder.stop(); } catch (_) { /* توقّف مرّتين لا يضرّ */ }
      video.pause();
    };
    signal?.addEventListener('abort', stop, { once: true });

    const duration = video.duration || 0;
    const draw = () => {
      if (stopped) return;
      c.drawImage(video, 0, 0, width, height);
      for (const pattern of patterns) {
        const logo = bitmaps.get(pattern.logoId);
        if (logo) drawPattern(c, pattern, { imgW: width, imgH: height, logo });
      }
      if (onProgress && duration) onProgress(Math.min(1, video.currentTime / duration));
      if (video.ended) { stop(); return; }
      requestAnimationFrame(draw);
    };

    recorder.start(1000);
    await video.play();
    draw();
    const out = await finished;
    for (const bmp of bitmaps.values()) if (typeof bmp.close === 'function') bmp.close();
    if (signal?.aborted) throw new Error('أُلغي الختم');
    return { blob: out, width, height, mime };
  } finally {
    URL.revokeObjectURL(url);
  }
}
