// سمة العرض: فاتح/داكن/يتبع النظام (المرحلة ١١).
// وُضعت في وحدة مستقلة لا في app.js كي لا تستوردها صفحة الإعدادات من نقطة الدخول
// (استيراد دائري بلا داعٍ). القيمة المحفوظة في settings.ui.theme.

/** يضع سمة data-theme على <html>. 'system' يزيلها فيتبع تفضيل نظام المستخدم. */
export function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'dark' || theme === 'light') root.setAttribute('data-theme', theme);
  else root.removeAttribute('data-theme');
  // لون شريط المتصفح على الجوال يتبع الخلفية الفعلية بعد التبديل.
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#121714' : '#0f6e56');
}
