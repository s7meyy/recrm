// إرسال تذكيرات المهام المستحقة (المرحلة ١٠) — دالة مجدولة كل ٥ دقائق.
//
// تعمل والتبويب مغلق (وهذا القيد الذي كان موثَّقًا منذ المرحلة ٦ ويزول هنا).
// لا تعرف الخادمُ شيئًا عن محتوى مهامك: عنده `{ id, dueAt }` فقط، فالتنبيه نصّه عام
// والتفاصيل تُقرأ من جهازك عند النقر. الاشتراك المنتهي (404/410) يُحذف تلقائيًا.

import { getStore } from '@netlify/blobs';
import webpush from 'web-push';

const STORE = 'kassab-push';
const PREFIX = 'sub/';
const GRACE_HOURS = 24; // لا تُرسل تذكيرًا فات موعده بأكثر من يوم (تنبيه متأخر جدًا لا ينفع)

/**
 * التذكيرات المستحقة الآن لاشتراك واحد — دالة خالصة (لا شبكة ولا تخزين) كي تُختبر وحدها.
 * الشروط الثلاثة: لم يُرسل من قبل · حان وقته · ولم يفت بأكثر من GRACE_HOURS.
 */
export function selectDue(rec, now = Date.now()) {
  const sent = new Set(rec?.sent || []);
  return (rec?.reminders || []).filter((r) => {
    if (sent.has(r.id)) return false;
    const at = new Date(r.dueAt).getTime();
    return Number.isFinite(at) && at <= now && now - at <= GRACE_HOURS * 3600000;
  });
}

export default async () => {
  const publicKey = process.env.VAPID_PUBLIC;
  const privateKey = process.env.VAPID_PRIVATE;
  if (!publicKey || !privateKey) return new Response('VAPID غير مضبوط', { status: 200 });
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:noreply@example.com', publicKey, privateKey);

  const store = getStore({ name: STORE, consistency: 'strong' });
  const { blobs } = await store.list({ prefix: PREFIX });
  const now = Date.now();
  let sentCount = 0;

  for (const blob of blobs) {
    const rec = await store.get(blob.key, { type: 'json' });
    if (!rec?.subscription) continue;
    const sent = new Set(rec.sent || []);
    const due = selectDue(rec, now);
    if (!due.length) continue;

    const payload = JSON.stringify(due.length === 1
      ? { title: 'تذكير مستحق', body: 'لديك مهمة مستحقة الآن.', url: `/#/tasks/${due[0].id}`, tag: `kassab-task-${due[0].id}` }
      : { title: 'تذكيرات مستحقة', body: `${due.length} مهام مستحقة الآن.`, url: '/#/tasks', tag: 'kassab-tasks' });

    try {
      await webpush.sendNotification(rec.subscription, payload);
      sentCount += due.length;
      for (const r of due) sent.add(r.id);
      await store.setJSON(blob.key, { ...rec, sent: [...sent] });
    } catch (err) {
      // 404/410 = اشتراك لم يعد صالحًا (أُلغي الإذن أو حُذف التطبيق) فيُنظَّف.
      if (err?.statusCode === 404 || err?.statusCode === 410) await store.delete(blob.key);
      else console.warn('تعذر إرسال تنبيه', err?.statusCode || err?.message);
    }
  }

  return new Response(JSON.stringify({ ok: true, sent: sentCount, subscriptions: blobs.length }), {
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
};

// كل ٥ دقائق: دقة كافية للتذكير، و٨٬٦٤٠ استدعاء شهريًا من أصل ١٢٥ ألفًا مجانية.
export const config = { schedule: '*/5 * * * *' };
