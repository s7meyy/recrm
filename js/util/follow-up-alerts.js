// تنبيهات المتابعة (المرحلة ٦) وتذكير المهام بالتاريخ والوقت (المرحلة ٧) — بنية فحص دورية واحدة
// مشتركة بينهما. يفحص العملاء المتأخرين والمهام المستحقة عند فتح التطبيق وكل نصف ساعة أثناء بقاء
// التبويب مفتوحًا، ويُظهر تنبيه متصفح واحدًا فقط لكل عميل/مهمة (لا تكرار). مانع تكرار العميل
// المتأخر في localStorage (ذاكرة عرض لا بيانات عمل)؛ مانع تكرار المهمة حقل `reminded` على
// المهمة نفسها (بيانات عمل حقيقية، يُصفَّر تلقائيًا إن غُيِّر موعدها من نموذج تعديلها).
//
// **قيد حقيقي يجب معرفته:** كلاهما يعمل فقط أثناء بقاء التبويب مفتوحًا في المتصفح. لا توجد
// تنبيهات بعد إغلاق التبويب أو المتصفح — ذلك يحتاج خادمًا حقيقيًا وService Worker وPush API،
// وهذا خارج نطاق "لا خادم ولا مزامنة الآن" المحسوم في القسم ١ من وثيقة الخطة.
//
// تذكير المهام يعمل بمجرّد منح إذن التنبيهات (Notification.permission === 'granted')، بلا مفتاح
// إعداد إضافي خاص به — بخلاف تنبيه العملاء المتأخرين الذي يبقى مربوطًا بمفتاح "متابعة العملاء"
// في الإعدادات (تفعيلان منطقيًا مختلفان، لكن كلاهما يحتاج الإذن نفسه من المتصفح أولًا).

import { repo } from '../data/repository.js';
import { getFollowUpSettings } from '../data/settings.js';
import { daysBetween } from './format.js';

const SEEN_KEY = 'kassab_followup_notified_v1';
const CHECK_INTERVAL_MS = 30 * 60 * 1000;

function readSeen() {
  try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]')); } catch (_) { return new Set(); }
}
function writeSeen(set) {
  try { localStorage.setItem(SEEN_KEY, JSON.stringify([...set])); } catch (_) { /* تجاهل (وضع تصفح خاص مثلًا) */ }
}
function goTo(hash) {
  return () => { window.focus(); location.hash = hash; };
}

async function checkClientsOnce() {
  let settings;
  try { settings = await getFollowUpSettings(); } catch (_) { return; }
  if (!settings.notify) return;
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;

  const clients = await repo.clients.list();
  const seen = readSeen();
  const newlyStale = [];
  for (const c of clients) {
    const last = repo.clients.lastContactAt(c);
    const days = last ? daysBetween(last) : null;
    const isStale = days == null || days > settings.staleContactDays;
    if (isStale && !seen.has(c.id)) newlyStale.push(c);
    if (isStale) seen.add(c.id);
    else seen.delete(c.id); // إن عاد التواصل معه، يُنبَّه مجددًا إن تأخر مستقبلًا
  }
  writeSeen(seen);
  if (!newlyStale.length) return;

  const n = newlyStale.length === 1
    ? new Notification('عميل يحتاج متابعة', { body: `${newlyStale[0].name || 'عميل بلا اسم'} لم يُتواصل معه منذ أكثر من ${settings.staleContactDays} يومًا.`, tag: 'kassab-followup' })
    : new Notification('عملاء يحتاجون متابعة', { body: `${newlyStale.length} عملاء تجاوزوا حدّ عدم التواصل. افتح الداشبورد لمراجعتهم.`, tag: 'kassab-followup' });
  n.onclick = goTo(newlyStale.length === 1 ? `#/clients/${newlyStale[0].id}` : '#/dashboard');
}

async function checkTasksOnce() {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  const tasks = await repo.tasks.list();
  const due = tasks.filter((t) => !t.done && t.dueAt && !t.reminded && new Date(t.dueAt).getTime() <= Date.now());
  for (const t of due) {
    const n = new Notification('تذكير بمهمة', { body: t.title, tag: `kassab-task-${t.id}` });
    n.onclick = goTo(`#/tasks/${t.id}`);
    await repo.tasks.update(t.id, { reminded: true });
  }
}

async function checkAllOnce() {
  await checkClientsOnce().catch((err) => console.warn('تعذر فحص تنبيهات المتابعة', err));
  await checkTasksOnce().catch((err) => console.warn('تعذر فحص تذكير المهام', err));
}

/** يبدأ الفحص الدوري (العملاء المتأخرون + المهام المستحقة). استدعها مرة واحدة عند تشغيل التطبيق. */
export function startFollowUpAlerts() {
  checkAllOnce();
  setInterval(checkAllOnce, CHECK_INTERVAL_MS);
}

/** يطلب إذن التنبيهات من المتصفح. تُستدعى من زر صريح في الإعدادات (لا تلقائيًا). */
export async function requestFollowUpPermission() {
  if (typeof Notification === 'undefined') return 'unsupported';
  if (Notification.permission === 'granted' || Notification.permission === 'denied') return Notification.permission;
  return Notification.requestPermission();
}
