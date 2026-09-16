// المزامنة بين أجهزتك (المرحلة ٤٥).
//
// **ما الذي كان ناقصًا:** بياناتك في `IndexedDB` في كلّ جهازٍ على حدة. عميلٌ تضيفه من
// الجوّال في السيارة لا يراه حاسوب المكتب حتى تُصدّر وتستورد يدويًّا — فتصير عندك نسختان
// من مكتبك، تُخالف إحداهما الأخرى، ولا تدري أيّهما الصحيحة.
//
// **ولم ينقص المحرّك، بل نقصت دورتُه.** `mergeBackup` يدمج سجلًّا سجلًّا بختم `updatedAt`
// (الأحدث يغلب) **ويحترم شواهد الحذف**: ما حُذف هنا بعد أن كُتب هناك لا يُحيا. وهذه هي
// دلالة المزامنة بعينها، وكانت مربوطةً بزرٍّ في الإعدادات لا بدورةٍ تعمل وحدها.
//
// **الدورة: اسحب ← ادمج ← ارفع.** والترتيب ليس اعتباطًا: الرفعُ بعد الدمج يرفع **اتّحاد**
// الجهازين، فلا تمحو رفعةُ هذا الجهاز ما كتبه ذاك. ولو رُفع قبل الدمج لكانت آخر نسخةٍ في
// الخزنة نسخةَ جهازٍ واحد، وضاع ما عند الآخر حتى رفعتِه التالية.
//
// **وما لا تفعله هذه الدورة، بصراحة:**
//   • لا تحلّ تعارضًا داخل السجلّ الواحد. عدّلتَ سعر العقار نفسه من جهازين قبل أن
//     يتزامنا؟ **الأحدث كتابةً يغلب، والآخر يذهب.** وحلُّ ذلك حقًّا يحتاج خادمًا يملك
//     السجلّات ويصرّح بها حقلًا حقلًا — وهو تحوّلٌ في بنية النظام لا إعدادٌ يُضاف.
//   • لا تنقل الإعدادات: قوالبك وخططك وبيانات مكتبك تبقى قرارًا صريحًا (`importSettings`)،
//     لأن مفتاحًا نصفُه من هنا ونصفُه من هناك إعدادٌ لا معنى له.
//   • لا تنقل الصور: كتلُها ثقيلة ودورتُها أسبوعية، ولا تُحشر في دورةٍ تعمل كل دقيقة.

import { getVaultSettings, setVaultSettings } from './settings.js';
import { fetchBackup, uploadBackup } from './vault.js';
import { mergeBackup, markExported } from './backup.js';
import { repo } from './repository.js';
import { currentRole } from '../util/role.js';

/** المخازن التي وجودُ سجلٍّ في أيٍّ منها يعني «هذا الجهاز ليس فارغًا». */
const DATA_STORES = ['clients', 'properties', 'tours', 'requests', 'matches', 'externalListings', 'deals'];

/** بعد كم من الهدوء تُرفع النسخة إثر تغيير. ثوانٍ لا لحظات: الكتابة تأتي دفعاتٍ. */
export const PUSH_QUIET_MS = 20000;
/** أقصر مدّة بين رفعتين مهما كثر التغيير — كي لا تُستنزف بيانات جوّالك. */
export const PUSH_EVERY_MS = 120000;

/** تباعدُ المحاولات بعد فشلٍ: ثانيةٌ ثم ثمانٍ ثم دقيقةٌ ثم أربعٌ ثم ربعُ ساعة، ثم يقف. */
export const RETRY_BACKOFF_MS = [1000, 8000, 60000, 240000, 900000];

let running = null;      // وعدُ المزامنة الجارية: اثنتان معًا تتدافعان على نفس المخازن
let dirty = false;       // تغيّر شيءٌ منذ آخر رفعة؟
let lastPushAt = 0;
let timer = null;
let retryTimer = null;
let retryStep = 0;       // أين نحن من سلّم التباعد
let started = false;

/** هل جهازك فارغ؟ لا تُرفع قاعدةٌ فارغة فوق نسخةٍ صالحة. */
async function isEmpty() {
  const counts = await repo.counts();
  return !DATA_STORES.some((s) => counts[s] > 0);
}

/**
 * دورةٌ واحدة كاملة: سحبٌ ودمجٌ ثم رفع.
 *
 * @param {{ push, pull }} what أيّ شطريها يُنفَّذ (الافتراض: كلاهما)
 * @returns {{ ok, merged, pushed, stats, error }}
 */
export async function syncNow({ push = true, pull = true } = {}) {
  // المزامنتان معًا تدمجان النسخة نفسها مرّتين وترفعان اثنتين لا فائدة في ثانيتهما؛
  // فالثانية تنتظر الأولى وتأخذ نتيجتها.
  if (running) return running;
  running = (async () => {
    const out = { ok: false, merged: false, pushed: false, stats: null, error: null };
    try {
      const vault = await getVaultSettings();
      if (!vault.sync || !vault.passphrase) return { ...out, ok: true, skipped: 'off' };
      // الخزنة للمالك وحده، والخادم يرفض المساعد فعلًا — فلا نطرق بابًا نعلم أنه مغلق.
      if ((await currentRole()) === 'assistant') return { ...out, ok: true, skipped: 'assistant' };

      if (pull) {
        try {
          const { data } = await fetchBackup(vault.passphrase);
          const stats = await mergeBackup(data);
          out.stats = stats;
          out.merged = (stats.added + stats.updated) > 0;
        } catch (err) {
          // «لا توجد نسخة سحابية بعد» ليست عطبًا: هذا أوّل جهازٍ يزامن، فيرفع ولا يسحب.
          if (/لا توجد نسخة سحابية/.test(err.message || '')) {
            // لا شيء يُسحب — يمضي إلى الرفع.
          } else if (/العبارة السرّية غير صحيحة/.test(err.message || '')) {
            // **عبارتان مختلفتان على جهازين.** الرسالة الخام صحيحة ولا تدلّ على فعل، وهذه
            // الحال بعينُها لها سببان لا ثالث: غيّرتَ عبارتك على جهازٍ دون آخر، أو أدخلتَ
            // على هذا غيرَ ما أدخلتَ على ذاك.
            //
            // **ولا يُرفع هنا رغم أن الرفع «ينجح»:** رفعةٌ بعبارةٍ أخرى تضع في الخزنة
            // نسخةً لا يقرؤها الجهاز الآخر، ثم يردّ هو بمثلها — فتتناوبان على طرد خمس
            // النسخ المحفوظة، والجهازان يظنّان أنهما يتزامنان وهما لا يلتقيان أبدًا.
            // فالوقوفُ هنا أصدق، والرسالةُ تقول ما يُفعَل.
            throw new Error('النسخة السحابية مشفَّرة بعبارةٍ سرّية غير التي في هذا الجهاز'
              + ' — وحّد العبارة بين أجهزتك (الإعدادات ← النسخة السحابية) ثم أعد المزامنة.');
          } else throw err;
        }
      }

      if (push && !(await isEmpty())) {
        const res = await uploadBackup(vault.passphrase);
        await markExported();
        out.pushed = true;
        lastPushAt = Date.now();
        dirty = false;
        await setVaultSettings({ lastUploadAt: res.at, lastSyncAt: new Date().toISOString(), lastSyncError: null });
      } else {
        await setVaultSettings({ lastSyncAt: new Date().toISOString(), lastSyncError: null });
      }
      out.ok = true;
    } catch (err) {
      // **ولا تُبتلع:** صمتُ المزامنة أسوأ من صمت النسخ الاحتياطي، لأنك تحسب جهازيك
      // متّفقين وهما مفترقان. فتُكتب الرسالة وتُعرض في لوحة الإعدادات.
      out.error = err?.message || String(err);
      try { await setVaultSettings({ lastSyncError: out.error, lastSyncErrorAt: new Date().toISOString() }); } catch (_) { /* لا شيء */ }
      console.warn('تعذّرت المزامنة', err);
    }
    return out;
  })();
  try { return await running; } finally { running = null; }
}

/** يُعلم الشاشة أن الدمج جاء بجديد — بلا إعادة تحميلٍ تُفاجئ من يكتب الآن. */
function announce(stats) {
  window.dispatchEvent(new CustomEvent('kassab:synced', { detail: stats }));
  window.dispatchEvent(new CustomEvent('kassab:data-changed'));
}

/**
 * يُشغّل دورةً ويتصرّف بنتيجتها: ينشر ما جاء، ويُعيد المحاولة إن فشلت.
 *
 * **وهذه هي الثغرة التي تُسدّ** (المرحلة ٤٦): كانت الرفعةُ الفاشلة تنتهي عند رسالةٍ
 * تُكتب في الإعدادات، و`dirty` باقيةٌ صحيحة والمؤقّت انطفأ — فلا تُرفع حتى تُغيّر شيئًا
 * آخر أو تُغلق التطبيق وتفتحه. وأكثرُ ما يقع هذا في السيارة: تُضيف عميلًا، تنقطع الشبكة،
 * فتظنّ أنّ جهازيك التقيا وهما لم يلتقيا.
 */
async function runCycle(opts = {}) {
  const res = await syncNow(opts);
  if (res.merged) announce(res.stats);
  if (res.error) scheduleRetry();
  else retryStep = 0;   // نجاحٌ يصفّر السلّم، فلا يرث تباعدَ فشلٍ قديم
  return res;
}

/**
 * يعيد المحاولة بتباعدٍ متزايد، ثم يقف عند آخر درجة.
 *
 * **ولا يُحاوَل بلا حدّ:** جوّالٌ خارج التغطية ساعةً كاملة يُستنزف بمحاولةٍ كلَّ ثانية،
 * وهي لن تنجح. فآخرُ الدرجات ربعُ ساعة، ثم يُترك الأمر لحدث `online` أو لتغييرٍ جديد.
 */
function scheduleRetry() {
  if (retryTimer) return;             // محاولةٌ مجدولةٌ تكفي
  const wait = RETRY_BACKOFF_MS[Math.min(retryStep, RETRY_BACKOFF_MS.length - 1)];
  retryStep++;
  // **ولا تُشترط تغييراتٌ محلّية:** السحبُ الفاشل يستحقّ الإعادة ولو لم تكتب أنت شيئًا —
  // فقد كتب جهازُك الآخر. واشتراطُ `dirty` هنا كان يعني أن فشلًا عند الفتح لا يُعاد أبدًا.
  retryTimer = setTimeout(() => { retryTimer = null; runCycle(); }, wait);
}

/** يجدول رفعةً بعد هدوء، ويحترم أقصر مدّةٍ بين رفعتين. */
function schedulePush() {
  if (timer) clearTimeout(timer);
  const since = Date.now() - lastPushAt;
  const wait = Math.max(PUSH_QUIET_MS, PUSH_EVERY_MS - since);
  timer = setTimeout(async () => {
    timer = null;
    if (!dirty) return;
    await runCycle();
  }, wait);
}

/**
 * يبدأ الدورة: سحبٌ عند الفتح، ورفعٌ بعد كل تغيير بمهلةِ هدوء، ورفعٌ أخيرٌ عند إخفاء
 * الصفحة — وهو أهمّها على الجوّال، حيث يُغلق التطبيق قبل أن تنقضي المهلة.
 */
export async function startSync() {
  if (started) return;
  const vault = await getVaultSettings();
  if (!vault.sync || !vault.passphrase) return;
  started = true;

  window.addEventListener('kassab:data-changed', () => {
    // المزامنة نفسها تُطلق هذا الحدث، فلا نجعلها تستدعي نفسها.
    if (running) return;
    dirty = true;
    schedulePush();
  });

  // `visibilitychange` لا `beforeunload`: الأخير لا يُطلَق أصلًا على iOS حين يُبدَّل
  // التطبيق أو يُقفَل الجهاز، وهو أكثرُ ما يقع في الجوّال.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'hidden' || !dirty) return;
    syncNow({ pull: false });
  });

  // عودةُ الشبكة أصدقُ إشارةٍ من أيّ مؤقّت — فتُلغى المحاولةُ المؤجَّلة ويُبدأ فورًا.
  // (ورجوعُ التطبيق إلى الواجهة مثلُها: كثيرًا ما يعود الاتصال والتطبيقُ في الخلفية.)
  const wake = () => {
    if (!dirty && !retryStep) return;   // لا تغييرَ معلّق ولا فشلٌ ينتظر الإعادة
    if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
    retryStep = 0;
    runCycle();
  };
  window.addEventListener('online', wake);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && navigator.onLine !== false) wake();
  });

  return runCycle();
}

/** للفحص: يُعيد الحالة إلى ما كانت عليه قبل `startSync`. */
export function resetSyncForTests() {
  if (timer) clearTimeout(timer);
  if (retryTimer) clearTimeout(retryTimer);
  timer = null; retryTimer = null; retryStep = 0;
  running = null; dirty = false; lastPushAt = 0; started = false;
}
