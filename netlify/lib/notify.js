// إرسال تنبيه فوري إلى كل اشتراكات هذا الحساب (المرحلة ٢٢).
//
// تُستعمل في الأحداث اللحظية (فتح العميل لرابطه، ووصول طلب من الصفحة العامة) —
// بخلاف `push-tick` المجدولة للتذكيرات. والحمولة **عامة بقصد**: لا اسم عميل ولا رقم،
// فما يغادر الخادم عنوانٌ قصير ومسارٌ داخل التطبيق، والتفاصيل تُقرأ من جهازك عند النقر.

import { getStore } from '@netlify/blobs';
import webpush from 'web-push';

const STORE = 'kassab-push';
const PREFIX = 'sub/';

/**
 * @param {{ title, body, url, tag }} payload
 * @returns {Promise<{ sent: number, dropped: number, skipped?: string }>}
 */
export async function notifyAll({ title, body, url = '/#/today', tag = 'kassab' }) {
  const publicKey = process.env.VAPID_PUBLIC;
  const privateKey = process.env.VAPID_PRIVATE;
  if (!publicKey || !privateKey) return { sent: 0, dropped: 0, skipped: 'vapid' };

  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:noreply@example.com', publicKey, privateKey);
  const store = getStore({ name: STORE, consistency: 'strong' });
  const { blobs } = await store.list({ prefix: PREFIX });
  let sent = 0;
  let dropped = 0;

  for (const blob of blobs) {
    const rec = await store.get(blob.key, { type: 'json' });
    if (!rec?.subscription) continue;
    try {
      await webpush.sendNotification(rec.subscription, JSON.stringify({ title, body, url, tag }));
      sent++;
    } catch (err) {
      // الاشتراك المنتهي يُحذف تلقائيًا — نفس قاعدة push-tick.
      if (err?.statusCode === 404 || err?.statusCode === 410) { await store.delete(blob.key); dropped++; }
    }
  }
  return { sent, dropped };
}
