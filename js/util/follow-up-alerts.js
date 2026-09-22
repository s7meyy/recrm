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
import { evaluateRules } from './alert-rules.js';
import { countOf } from './format.js';

const SEEN_KEY = 'kassab_followup_notified_v1';
/** مانعُ تكرارِ قواعد المرحلة ٤٩ — مفتاحٌ منفصلٌ فلا يختلط بمانع العملاء القائم. */
const RULES_SEEN_KEY = 'kassab_rule_notified_v1';
const CHECK_INTERVAL_MS = 30 * 60 * 1000;

function readSeen(key = SEEN_KEY) {
  try { return new Set(JSON.parse(localStorage.getItem(key) || '[]')); } catch (_) { return new Set(); }
}
function writeSeen(set, key = SEEN_KEY) {
  try { localStorage.setItem(key, JSON.stringify([...set])); } catch (_) { /* تجاهل (وضع تصفح خاص مثلًا) */ }
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
    ? new Notification('عميل يحتاج متابعة', { body: `${newlyStale[0].name || 'عميل بلا اسم'} لم يُتواصل معه منذ أكثر من ${countOf(settings.staleContactDays, 'يوم')}.`, tag: 'kassab-followup' })
    : new Notification('عملاء يحتاجون متابعة', { body: `${countOf(newlyStale.length, 'عميل')} تجاوزوا حدّ عدم التواصل. افتح الداشبورد لمراجعتهم.`, tag: 'kassab-followup' });
  n.onclick = goTo(newlyStale.length === 1 ? `#/clients/${newlyStale[0].id}` : '#/dashboard');
}

async function checkTasksOnce() {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  const ripe = (rows) => rows.filter((t) => !t.done && t.dueAt && !t.reminded && new Date(t.dueAt).getTime() <= Date.now());
  const tasks = await repo.tasks.list();
  for (const t of ripe(tasks)) {
    const n = new Notification('تذكير بمهمة', { body: t.title, tag: `kassab-task-${t.id}` });
    n.onclick = goTo(`#/tasks/${t.id}`);
    await repo.tasks.update(t.id, { reminded: true });
  }
  // **وموعدُ متابعة الفرصة يوقظ كما يوقظ موعدُ المهمّة** (المرحلة ٥٣) — بالمانع نفسِه
  // في سجلّها (`reminded`)، فلا يُبنى مانعُ تكرارٍ ثالث.
  const prospects = await repo.prospects.list();
  for (const pr of ripe(prospects)) {
    const n = new Notification('متابعةُ فرصة', { body: pr.title, tag: `kassab-prospect-${pr.id}` });
    n.onclick = goTo(`#/prospects/${pr.id}`);
    await repo.prospects.update(pr.id, { reminded: true });
  }
}

/**
 * **بقيّةُ القواعد** (المرحلة ٤٩) — العقدُ الذي ينتهي، والمستحقُّ الذي تأخّر، والتمويلُ
 * الذي وقف، والصيانةُ التي لم تُغلق، والمعاينةُ التي مضت بلا رأي.
 *
 * وفحصُ العملاء والمهامّ أعلاه **باقيان كما هما**: للمهمّة مانعُ تكرارٍ في سجلّها
 * (`reminded`)، وللعميل مانعٌ في `localStorage` — ولا يُعاد بناؤهما بلا حاجة.
 * وهذا يتولّى ما عداهما، بمانعِ تكرارٍ واحدٍ يقرأ `id` القاعدة الثابت.
 */
async function checkRulesOnce() {
  let settings;
  try { settings = await getFollowUpSettings(); } catch (_) { return; }
  if (!settings.notify) return;
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;

  const [deals, properties, invoices, showings] = await Promise.all([
    repo.deals.list(), repo.properties.list(), repo.invoices.list(), repo.showings.list(),
  ]);
  // العميلُ والمهمّةُ لهما فحصُهما الخاصُّ أعلاه — فيُطفآن هنا كي لا يُنبَّه عليهما مرّتين.
  const enabled = { ...(settings.alertRules || {}), staleClient: false, dueTask: false };
  const alerts = evaluateRules(
    { deals, properties, invoices, showings },
    { enabled, countOf, now: Date.now() },
  );
  if (!alerts.length) return;

  const seen = readSeen(RULES_SEEN_KEY);
  const fresh = alerts.filter((a) => !seen.has(a.id));
  for (const a of alerts) seen.add(a.id);
  // **ما لم يعد قائمًا يُنسى**: لولا ذلك لانتفخ المانعُ أبدًا، ولَما نُبِّه ثانيةً على
  // حالةٍ عادت بعد أن زالت (عقدٌ جُدِّد ثم قارب الانتهاء من جديد).
  const live = new Set(alerts.map((a) => a.id));
  writeSeen(new Set([...seen].filter((id) => live.has(id))), RULES_SEEN_KEY);

  // **ثلاثةٌ على الأكثر في الفحص الواحد**: عشرون إشعارًا تُغلق الإشعاراتِ كلَّها،
  // وما زاد يبقى في لوحة «يومي» حيث يُقرأ على مهل.
  for (const a of fresh.slice(0, 3)) {
    const n = new Notification(a.title, { body: a.body, tag: `kassab-${a.rule}-${a.id}` });
    n.onclick = goTo(a.hash);
  }
}

async function checkAllOnce() {
  await checkClientsOnce().catch((err) => console.warn('تعذر فحص تنبيهات المتابعة', err));
  await checkTasksOnce().catch((err) => console.warn('تعذر فحص تذكير المهام', err));
  await checkRulesOnce().catch((err) => console.warn('تعذر فحص قواعد التنبيه', err));
}

/** يبدأ الفحص الدوري (العملاء المتأخرون + المهام المستحقة + بقيّة القواعد). استدعها مرة واحدة عند تشغيل التطبيق. */
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
