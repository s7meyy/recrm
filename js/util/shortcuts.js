/**
 * **اختصاراتُ لوحة المفاتيح** (المرحلة ٤٩).
 *
 * الاختصارُ الوحيدُ في النظام كلِّه كان فتحَ البحث العام (`global-search.js`). ومن يجلس
 * إلى مكتبٍ ويُدخل عشرين سجلًّا في الجلسة يفعل ذلك كلَّه بالفأرة: يقصد القائمة، ثم
 * الصفحة، ثم «إضافة». **والثانيةُ الواحدةُ في كلّ فتحةٍ تصير ساعةً في الشهر.**
 *
 * **وثلاثةٌ تكفي ولا رابعَ لها**: عقارٌ جديد، وعميلٌ جديد، وحفظُ النافذة المفتوحة.
 * وقائمةُ اختصاراتٍ طويلةٌ لا يحفظها أحد، وتزاحم اختصاراتِ المتصفّح.
 *
 * **والمفاتيحُ تُقرأ بـ`code` لا بـ`key`**: `key` يتبع لغةَ لوحة المفاتيح، فمن يكتب
 * بالعربيّة يُرسل `ح` لا `c` — فينكسر الاختصارُ عند من بُني له أصلًا. و`code` يقول
 * **موضعَ الزرّ** لا حرفَه، فيعمل بالعربيّة والإنجليزيّة سواء.
 */

/** الاختصاراتُ كما تُعرض في الإعدادات — مصدرٌ واحدٌ للنصّ وللعمل. */
export const SHORTCUTS = [
  { keys: 'Alt + P', code: 'KeyP', label: 'عقارٌ جديد', hint: 'يفتح صفحة العقارات باستمارةٍ جاهزة.' },
  { keys: 'Alt + C', code: 'KeyC', label: 'عميلٌ جديد', hint: 'يفتح صفحة العملاء باستمارةٍ جاهزة.' },
  { keys: 'Ctrl/⌘ + Enter', code: 'Enter', label: 'حفظُ النافذة المفتوحة', hint: 'يضغط زرّ الحفظ في النافذة التي أمامك.' },
];

const ROUTES = { KeyP: '#/properties?new=1', KeyC: '#/clients?new=1' };

/** أيُكتب الآن في حقل؟ فلا يُخطف حرفٌ من يدِ من يكتب. */
function typing(target) {
  if (!target) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

/**
 * زرُّ الحفظ في أحدث نافذةٍ مفتوحة — `.btn-primary` في تذييلها.
 * **ولا يُخترع زرّ**: نافذةٌ بلا زرٍّ أساسيٍّ لا يُضغط فيها شيء.
 */
function primaryButton() {
  const overlay = document.getElementById('modal-root')?.lastElementChild;
  if (!overlay) return null;
  const btn = overlay.querySelector('.modal-foot .btn-primary, .modal-foot button.btn-primary');
  return btn && !btn.disabled ? btn : null;
}

export function installShortcuts() {
  document.addEventListener('keydown', (e) => {
    // **الحفظُ يعمل داخل الحقول** — وهو موضعُه: من ملأ آخرَ حقلٍ يحفظ بلا أن يرفع يده.
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      const btn = primaryButton();
      if (!btn) return;
      e.preventDefault();
      btn.click();
      return;
    }
    if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (typing(e.target)) return;
    const route = ROUTES[e.code];
    if (!route) return;
    e.preventDefault();
    // **والتنقّلُ بالمسار لا بنداءٍ مباشر**: الصفحةُ قد لا تكون مفتوحةً أصلًا،
    // و`?new=1` نمطٌ قائمٌ في النظام (`#/requests?paste=1`) لا اختراعَ جديدًا.
    location.hash = route;
  });
}
