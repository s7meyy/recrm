// نداء دوال الخادم من داخل التطبيق، بلا إلحاح (المرحلة ٣٥).
//
// لوحتان في «يومي» تقرآن إشاراتٍ لا توجد إلا عند الخادم: الطلبات التي لم يُردَّ عليها،
// وفتحات قوائم العملاء. وقراءتهما تحتاج جلسةً صالحة.
//
// **والجلسة قد لا تكون صالحة**: نشرةٌ بلا كلمة سر مضبوطة (فالتحقّق يفشل مغلقًا بقصد)،
// أو جلسة انتهت، أو لا اتصال. فلو سألنا في كل فتحةٍ لصفحةٍ تُفتح عشرين مرّة في اليوم،
// لكان عشرون طلبًا يعود بلا شيء، وعشرون سطرًا في سجلّ المتصفح.
//
// فهذه تسأل مرّة: متى ردّ الخادم «لا صلاحية» كفّت عن السؤال حتى تُحدَّث الصفحة. ولا تُخفي
// عطبًا: الصفحة تعمل كاملة بلا هاتين اللوحتين، وهما إضافةٌ لا أساس.

let blocked = false;

/** تُستدعى بعد تسجيل دخولٍ جديد أو عند إعادة المحاولة يدويًا. */
export function resetPublicApi() { blocked = false; }

/** هل كفّت عن السؤال في هذه الجلسة؟ */
export function publicApiBlocked() { return blocked; }

/**
 * يقرأ من دالةٍ خادمية ويعيد `fallback` عند أي تعثّر — ولا يرمي أبدًا.
 * @param {string} path مسار الدالة
 * @param {*} fallback ما يُعاد عند التعثّر
 */
export async function readPublicApi(path, fallback = null) {
  if (blocked) return fallback;
  try {
    const res = await fetch(path, { credentials: 'same-origin' });
    if (res.status === 401 || res.status === 403) { blocked = true; return fallback; }
    if (!res.ok) return fallback;
    return await res.json();
  } catch (_) {
    return fallback;
  }
}
