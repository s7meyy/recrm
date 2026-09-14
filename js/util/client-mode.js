// وضع «عرض للعميل» (المرحلة ١٣): تُري العميل جوالك وأنت مطمئن.
//
// يخفي ما لا يخصّه: جوال المالك واسمه، ملاحظاتك الداخلية، تاق المصدر، وروابط الصفحات
// الإدارية (العملاء، المصاريف، الفواتير، المهام…). **إخفاء عرضٍ لا حذف بيانات** — كل شيء
// يعود بضغطة، والوضع **لا يُحفظ بين الجلسات** (sessionStorage) كي لا تُفاجأ ببيانات مخفية غدًا.

const KEY = 'kassab_client_mode';
const HIDDEN_ROUTES = ['clients', 'expenses', 'invoices', 'tasks', 'notes', 'publish', 'settings', 'opportunities', 'dashboard'];

export function clientModeOn() {
  try { return sessionStorage.getItem(KEY) === '1'; } catch (_) { return false; }
}

/** يطبّق الوضع على الصفحة: صنف على <body> تتكفّل به قواعد CSS، وإخفاء روابط الإدارة. */
export function applyClientMode(on) {
  document.body.classList.toggle('client-mode', !!on);
  for (const link of document.querySelectorAll('.sidebar-nav a[data-route]')) {
    link.hidden = !!on && HIDDEN_ROUTES.includes(link.dataset.route);
  }
  const banner = document.getElementById('client-mode-banner');
  if (banner) banner.hidden = !on;
}

export function setClientMode(on) {
  try { sessionStorage.setItem(KEY, on ? '1' : '0'); } catch (_) { /* وضع خاص */ }
  applyClientMode(on);
  return on;
}

export function toggleClientMode() {
  return setClientMode(!clientModeOn());
}

/** يُستدعى مرة عند التشغيل: يبني الزر والشريط ويطبّق الحالة المحفوظة للجلسة. */
export function initClientMode() {
  const bar = document.getElementById('client-mode-banner');
  if (bar && !bar.childElementCount) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-sm';
    btn.textContent = 'إنهاء وضع العرض';
    btn.addEventListener('click', () => setClientMode(false));
    const text = document.createElement('span');
    text.textContent = 'وضع العرض للعميل مفعَّل — بيانات المالك وملاحظاتك الداخلية مخفية.';
    bar.append(text, btn);
  }
  const toggle = document.getElementById('client-mode-btn');
  if (toggle) toggle.addEventListener('click', () => toggleClientMode());
  applyClientMode(clientModeOn());
}
