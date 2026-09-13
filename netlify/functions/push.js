// اشتراك تنبيهات المتصفح وتحديث مواعيد التذكير (المرحلة ١٠).
//
// **أقل ما يمكن من البيانات يغادر جهازك:** لا عناوين مهام ولا أسماء عملاء — فقط
// `{ id, dueAt }` لكل تذكير، ومعرّف الاشتراك من المتصفح. نصّ التنبيه عام
// («لديك تذكير مستحق»)، والتفاصيل تُقرأ من قاعدة جهازك عند فتح التطبيق بالنقر عليه.
//
// الحماية: كوكي بوابة الدخول نفسها (لا مفتاح إضافي).

import { getStore } from '@netlify/blobs';
import { signedIn, unauthorized } from '../lib/auth.js';

const STORE = 'kassab-push';
const PREFIX = 'sub/';

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

/** مفتاح ثابت لكل اشتراك مشتق من عنوانه (لا يصلح العنوان مفتاحًا: فيه محارف غير مسموحة). */
async function keyFor(endpoint) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint));
  return PREFIX + [...new Uint8Array(digest)].slice(0, 16).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export default async (request) => {
  const url = new URL(request.url);

  // المفتاح العام يُقرأ بلا تسجيل دخول (ليس سرًّا — يُستعمل في المتصفح للاشتراك).
  if (request.method === 'GET' && url.searchParams.get('key') === 'public') {
    return json({ publicKey: process.env.VAPID_PUBLIC || '' });
  }

  if (!(await signedIn(request))) return unauthorized();
  const store = getStore({ name: STORE, consistency: 'strong' });

  if (request.method === 'POST') {
    const body = await request.json().catch(() => null);
    const sub = body?.subscription;
    if (!sub?.endpoint) return json({ error: 'اشتراك غير صالح' }, 400);
    // reminders: [{ id, dueAt }] فقط — يُفلتر أي حقل آخر قد يُرسل سهوًا.
    const reminders = (Array.isArray(body.reminders) ? body.reminders : [])
      .filter((r) => r && r.id && r.dueAt)
      .map((r) => ({ id: String(r.id), dueAt: String(r.dueAt) }))
      .slice(0, 500);
    const key = await keyFor(sub.endpoint);
    const prev = await store.get(key, { type: 'json' });
    await store.setJSON(key, {
      subscription: sub,
      reminders,
      sent: (prev?.sent || []).filter((id) => reminders.some((r) => r.id === id)),
      updatedAt: new Date().toISOString(),
    });
    return json({ ok: true, reminders: reminders.length });
  }

  if (request.method === 'DELETE') {
    const body = await request.json().catch(() => null);
    if (body?.endpoint) await store.delete(await keyFor(body.endpoint));
    return json({ ok: true });
  }

  return json({ error: 'طريقة غير مدعومة' }, 405);
};

export const config = { path: '/api/push' };
