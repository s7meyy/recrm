// حالُ المزامنة في الترويسة (المرحلة ٤٨).
//
// المزامنةُ تسحب وتدمج وترفع، وتُعيد المحاولةَ بسلّم تباعد، وتستيقظ حين تعود الشبكة —
// **وتعمل في صمتٍ تامّ**: `lastSyncAt` و`lastSyncError` لا يُقرآن إلّا في لوحةٍ داخل
// الإعدادات. فمن يعمل على جهازين لا يعرف أوصل عملُه أم لا، **ومن تعثّرت مزامنتُه منذ
// ثلاثة أيّامٍ لا يعلم** حتى يفتح جهازَه الآخر فيجد النقص.
//
// **وأخطرُ ما في هذا الصمت أنّ النظام يعرف أنّه فشل ولا يقوله.**
//
// وهذه نقطةٌ لا لوحة: خضراءُ صامتةٌ حين كلُّ شيءٍ في محلّه، وتصير تحذيرًا متى مضى يوم
// أو وقع خطأ. **ولا تُزعج من لم يُفعّل المزامنة أصلًا** — تغيب عنه كأنّها ليست.

import { getVaultSettings } from '../data/settings.js';

const DAY = 86400000;
/** بعد يومٍ بلا مزامنةٍ ناجحةٍ يصير الصمتُ خبرًا يستحقّ نقطةً صفراء. */
export const STALE_MS = DAY;

/**
 * حالُ المزامنة بكلمةٍ ونصّ — دالّةٌ خالصةٌ تُختبر وحدها.
 * @returns {{ state: 'off'|'ok'|'stale'|'error'|'never', text }}
 */
export function syncState(vault = {}, now = Date.now()) {
  if (!vault.sync) return { state: 'off', text: '' };
  if (vault.lastSyncError) {
    return { state: 'error', text: `تعثّرت المزامنة: ${vault.lastSyncError}` };
  }
  if (!vault.lastSyncAt) {
    return { state: 'never', text: 'المزامنة مفعّلة ولم تتمّ بعد — افتح الإعدادات وزامن مرّة.' };
  }
  const age = now - new Date(vault.lastSyncAt).getTime();
  if (!Number.isFinite(age)) return { state: 'never', text: 'تاريخ آخر مزامنةٍ غير مقروء.' };
  if (age > STALE_MS) {
    const days = Math.floor(age / DAY);
    return { state: 'stale', text: `آخر مزامنةٍ ناجحةٍ قبل ${days > 1 ? `${days} أيام` : 'يوم'} — قد يكون عملُك لم يصل جهازَك الآخر.` };
  }
  return { state: 'ok', text: 'المزامنة تعمل — آخرُها قريب.' };
}

const MARK = { ok: '●', stale: '●', error: '●', never: '○' };

/** يرسم النقطة من الإعدادات، ويُخفيها لمن لم يُفعّل المزامنة. */
export async function paintSyncDot() {
  const dot = document.getElementById('sync-dot');
  if (!dot) return;
  let st;
  try { st = syncState(await getVaultSettings()); } catch (_) { return; }
  if (st.state === 'off') { dot.hidden = true; return; }
  dot.hidden = false;
  dot.className = `sync-dot sync-${st.state}`;
  dot.textContent = MARK[st.state] || '●';
  dot.title = st.text;
  dot.setAttribute('aria-label', st.text); // النقطةُ لونٌ، والنصُّ هو الذي يُقرأ
}

/**
 * يبدأ متابعةَ الحال: عند كل تغيّر بيانات، وعند عودة الشبكة، وكلَّ خمس دقائق.
 *
 * والدورةُ الطويلةُ لأنّ «مضى يوم» حالٌ تتغيّر ببطء — ونبضةٌ كلَّ دقيقةٍ على صفحةٍ
 * مفتوحةٍ طولَ اليوم كلفةٌ بلا مقابل.
 */
export function installSyncDot() {
  const tick = () => { paintSyncDot(); };
  window.addEventListener('kassab:data-changed', tick);
  window.addEventListener('online', tick);
  const timer = setInterval(tick, 5 * 60 * 1000);
  tick();
  return () => { clearInterval(timer); window.removeEventListener('kassab:data-changed', tick); window.removeEventListener('online', tick); };
}
