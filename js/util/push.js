// اشتراك تنبيهات المتصفح التي تعمل والتبويب مغلق (المرحلة ١٠).
//
// ما يغادر الجهاز: اشتراك المتصفح (endpoint ومفاتيحه) و`{ id, dueAt }` لكل تذكير — لا عناوين
// ولا أسماء. نصّ التنبيه عام، والتفاصيل تُقرأ محليًا عند فتح التطبيق بالنقر عليه.
// هذا يكمّل تنبيهات المرحلة ٦ ولا يلغيها: تلك تعمل والتبويب مفتوح، وهذه بعد إغلاقه.

import { repo } from '../data/repository.js';

const ENDPOINT = '/api/push';

const urlBase64ToUint8Array = (base64) => {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
};

export function pushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

async function publicKey() {
  const res = await fetch(`${ENDPOINT}?key=public`, { credentials: 'same-origin' });
  if (!res.ok) throw new Error('تعذر قراءة مفتاح التنبيهات من الخادم');
  const { publicKey: key } = await res.json();
  if (!key) throw new Error('تنبيهات الخلفية غير مفعَّلة على الخادم بعد');
  return key;
}

/** مواعيد التذكير فقط — بلا أي محتوى (دالة خالصة على قائمة المهام). */
export function remindersFrom(tasks) {
  return tasks
    .filter((t) => !t.done && t.dueAt)
    .map((t) => ({ id: t.id, dueAt: t.dueAt }));
}

export async function currentSubscription() {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return (await reg?.pushManager.getSubscription()) || null;
}

/** يشترك (بعد إذن المستخدم) ويرفع المواعيد. يعيد الاشتراك. */
export async function enablePush() {
  if (!pushSupported()) throw new Error('هذا المتصفح لا يدعم تنبيهات الخلفية');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('لم يُمنح إذن التنبيهات');
  const reg = await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  const sub = existing || await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(await publicKey()),
  });
  await syncReminders(sub);
  return sub;
}

export async function disablePush() {
  const sub = await currentSubscription();
  if (!sub) return;
  await fetch(ENDPOINT, {
    method: 'DELETE', credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ endpoint: sub.endpoint }),
  }).catch(() => {});
  await sub.unsubscribe().catch(() => {});
}

/** يرفع مواعيد التذكير الحالية. صامت عند الفشل (التنبيه أثناء فتح التبويب يبقى عاملًا). */
export async function syncReminders(subscription = null) {
  const sub = subscription || await currentSubscription();
  if (!sub) return false;
  try {
    const tasks = await repo.tasks.list();
    const res = await fetch(ENDPOINT, {
      method: 'POST', credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ subscription: sub.toJSON ? sub.toJSON() : sub, reminders: remindersFrom(tasks) }),
    });
    return res.ok;
  } catch (_) {
    return false;
  }
}
