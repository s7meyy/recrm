// القفل التلقائي بعد خمول (المرحلة ٣٢).
//
// بوابة الدخول تُفتح مرّة وتبقى مفتوحة. وجوالٌ على طاولة مجلس، أو حاسوب في مكتب مشترك،
// يعني **قائمة عملائك كلها مكشوفة** لمن يمرّ. وهذا يقفلها بعد مدّة تحدّدها أنت.
//
// ثلاثة قيود تمنعه من أن يصير إزعاجًا:
//   • **معطَّل افتراضيًا** (صفر = لا قفل): لا نُقحم أمانًا لم يطلبه أحد.
//   • **إنذار قبل القفل**: لا تُغلق الشاشة فجأةً على استمارة نصف مكتوبة — يظهر تنبيه
//     تضغط فيه «ابقَ» فيعود العدّاد.
//   • كل نشاط حقيقي (نقر · مفتاح · لمس · عودة إلى التبويب) يعيد العدّاد.
//
// والقفل نفسه هو تسجيل خروج البوابة (`/__logout`) لا شاشة وهمية فوق الصفحة: شاشةٌ تُخفي
// المحتوى ولا تحذف الكوكي أمانٌ موهوم.

const ACTIVITY = ['pointerdown', 'keydown', 'touchstart', 'wheel'];

export const LOCK_URL = '/__logout';

/**
 * @param {{ minutes, warnSeconds, onWarn, onLock }} options
 *   `onWarn(secondsLeft, stay)` تُستدعى عند بدء الإنذار، و`stay` دالة إلغاء.
 * @returns {{ stop: () => void, reset: () => void, remaining: () => number }}
 */
export function startAutoLock({
  minutes = 0, warnSeconds = 20, onWarn = null, onLock = null, now = () => Date.now(),
} = {}) {
  const idleMs = Math.max(0, Number(minutes) || 0) * 60000;
  if (!idleMs) return { stop() {}, reset() {}, remaining: () => Infinity };

  let last = now();
  let warned = false;
  let stopped = false;

  const reset = () => {
    last = now();
    warned = false;
  };

  const stay = () => { reset(); };

  const tick = () => {
    if (stopped) return;
    const idle = now() - last;
    if (!warned && idle >= idleMs - warnSeconds * 1000 && idle < idleMs) {
      warned = true;
      onWarn?.(Math.max(1, Math.round((idleMs - idle) / 1000)), stay);
    }
    if (idle >= idleMs) {
      stopped = true;
      cleanup();
      if (onLock) onLock();
      else if (typeof location !== 'undefined') location.assign(LOCK_URL);
    }
  };

  const timer = setInterval(tick, 1000);
  const onActivity = () => reset();
  const onVisible = () => { if (document.visibilityState === 'visible') reset(); };

  function cleanup() {
    clearInterval(timer);
    for (const type of ACTIVITY) document.removeEventListener(type, onActivity, true);
    document.removeEventListener('visibilitychange', onVisible);
  }

  for (const type of ACTIVITY) document.addEventListener(type, onActivity, true);
  document.addEventListener('visibilitychange', onVisible);

  return {
    stop() { stopped = true; cleanup(); },
    reset,
    remaining: () => Math.max(0, idleMs - (now() - last)),
  };
}
