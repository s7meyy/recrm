// الملاحظات الصوتية (المرحلة ٢٦): تسجيل قصير يُلحق بسجل التواصل.
//
// **لماذا الصوت أصلًا؟** بعد المكالمة تكون في السيارة أو أمام العميل، فتكتب «تمّت المكالمة»
// ويضيع نصفُ ما قيل. ثلاثون ثانية بصوتك تحفظ ما لا تكتبه.
//
// وثلاثة قيود مقصودة:
//   • **لا يخرج الصوت من الجهاز أبدًا** — لا رفع ولا تفريغ في خدمة خارجية. ولذلك لا نصّ له.
//     (الإملاء بالصوت في util/voice.js شيء آخر: يمرّ بخدمة المتصفح وهو زرٌّ صريح تضغطه.)
//   • **حدّ زمني صارم** (دقيقتان) — الصوت أثقل من النص بمرّات، والمساحة محدودة بجهازك.
//   • مخزن مستقل (`audio`) كالصور: سجل العميل يبقى خفيفًا يُقرأ ويُبحث فيه بلا حمل الملفات.

import { repo } from './repository.js';

export const AUDIO_LIMITS = { maxSeconds: 120, maxBytes: 3 * 1024 * 1024 };

const urlCache = new Map(); // id → object URL

/** هل يدعم المتصفح التسجيل أصلًا؟ الزر لا يظهر إن لم يدعم — لا زر معطَّل يربك المستخدم. */
export function recordingSupported() {
  return typeof window !== 'undefined'
    && typeof window.MediaRecorder === 'function'
    && !!navigator.mediaDevices?.getUserMedia;
}

/** أفضل صيغة يدعمها هذا المتصفح: webm/opus في كروم، وmp4 في سفاري. */
export function pickMime() {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  for (const mime of candidates) {
    if (window.MediaRecorder?.isTypeSupported?.(mime)) return mime;
  }
  return '';
}

/**
 * يبدأ تسجيلًا ويُعيد مقبضًا للإيقاف.
 * الإيقاف يُغلق مسار الميكروفون دائمًا — **مؤشّر التسجيل في المتصفح لا يبقى مضاءً** بعد أن تنتهي.
 * @returns {Promise<{ stop: () => Promise<{blob, mime, seconds}>, cancel: () => void }>}
 */
export async function startRecording({ maxSeconds = AUDIO_LIMITS.maxSeconds } = {}) {
  if (!recordingSupported()) throw new Error('المتصفح لا يدعم التسجيل الصوتي');
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mime = pickMime();
  const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  const chunks = [];
  const startedAt = Date.now();
  recorder.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data); };
  recorder.start();

  const release = () => stream.getTracks().forEach((t) => t.stop());
  const timer = setTimeout(() => { if (recorder.state === 'recording') recorder.stop(); }, maxSeconds * 1000);

  return {
    get seconds() { return Math.round((Date.now() - startedAt) / 1000); },
    cancel() {
      clearTimeout(timer);
      try { if (recorder.state !== 'inactive') recorder.stop(); } catch (_) { /* مُوقَف أصلًا */ }
      release();
    },
    stop() {
      clearTimeout(timer);
      return new Promise((resolve, reject) => {
        recorder.onstop = () => {
          release();
          const blob = new Blob(chunks, { type: recorder.mimeType || mime || 'audio/webm' });
          if (!blob.size) { reject(new Error('لم يُسجَّل صوت')); return; }
          resolve({ blob, mime: blob.type, seconds: Math.max(1, Math.round((Date.now() - startedAt) / 1000)) });
        };
        recorder.onerror = () => { release(); reject(new Error('تعذر التسجيل')); };
        try {
          if (recorder.state === 'inactive') recorder.onstop();
          else recorder.stop();
        } catch (err) { release(); reject(err); }
      });
    },
  };
}

/** يحفظ التسجيل ويُعيد معرّفه. */
export async function storeAudio(blob, { entity = 'contact', entityId = null, seconds = 0 } = {}) {
  if (blob.size > AUDIO_LIMITS.maxBytes) {
    throw new Error('التسجيل أكبر من الحد المسموح — سجّل ملاحظة أقصر');
  }
  const rec = await repo.audio.create({
    entity, entityId, mime: blob.type || 'audio/webm', blob, seconds, size: blob.size,
  });
  return rec.id;
}

export async function getAudioUrl(id) {
  if (!id) return null;
  if (urlCache.has(id)) return urlCache.get(id);
  const rec = await repo.audio.get(id);
  if (!rec?.blob) return null;
  const url = URL.createObjectURL(rec.blob);
  urlCache.set(id, url);
  return url;
}

export async function removeAudio(id) {
  if (!id) return;
  if (urlCache.has(id)) { URL.revokeObjectURL(urlCache.get(id)); urlCache.delete(id); }
  await repo.audio.remove(id);
}

/** عدد التسجيلات ومجموع حجمها — للوحة التخزين (المرحلة ٢١). */
export async function audioSummary() {
  const all = await repo.audio.list();
  return { count: all.length, bytes: all.reduce((sum, r) => sum + (r.size || 0), 0) };
}

export function formatSeconds(seconds) {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
