// خزنة النسخ الاحتياطية السحابية (المرحلة ١٠).
//
// **الخادم لا يستطيع قراءة نسختك.** التشفير يتم كاملًا في متصفحك (AES-GCM بمفتاح مشتق من
// عبارة سرّية عبر PBKDF2)، وما يصل هنا كتلة مبهمة لا مفتاح لها على الخادم إطلاقًا.
// الحماية: كوكي بوابة الدخول نفسها — فلا مفتاح إضافي تلصقه.
//
// يُحتفظ بآخر KEEP نسخ: الأحدث للاسترجاع السريع، والأقدم شبكة أمان لو أفسدت البيانات ولم تنتبه.

import { getStore } from '@netlify/blobs';
import { signedIn, unauthorized } from './_auth.js';

const STORE = 'kassab-vault';
const PREFIX = 'backup/';
const KEEP = 5;

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

const listSorted = async (store) => {
  const { blobs } = await store.list({ prefix: PREFIX });
  return blobs.map((b) => b.key).sort().reverse(); // المفتاح يبدأ بالتاريخ ISO فالفرز زمني
};

export default async (request) => {
  if (!(await signedIn(request))) return unauthorized();
  const store = getStore({ name: STORE, consistency: 'strong' });
  const url = new URL(request.url);

  if (request.method === 'GET') {
    const keys = await listSorted(store);
    // ?key=… ينزّل نسخة بعينها، وبلا مُعامل تعود قائمة النسخ فقط (بلا تحميل ثقيل).
    const wanted = url.searchParams.get('key');
    if (!wanted) {
      const metas = [];
      for (const key of keys) {
        const meta = await store.getMetadata(key);
        metas.push({ key, at: meta?.metadata?.at || key.slice(PREFIX.length), size: meta?.metadata?.size || null, counts: meta?.metadata?.counts || null });
      }
      return json({ backups: metas });
    }
    if (!keys.includes(wanted)) return json({ error: 'النسخة غير موجودة' }, 404);
    const found = await store.getWithMetadata(wanted, { type: 'text' });
    return json({ key: wanted, at: found.metadata?.at || null, payload: found.data });
  }

  if (request.method === 'POST') {
    const body = await request.json().catch(() => null);
    if (!body?.payload || typeof body.payload !== 'string') return json({ error: 'لا توجد نسخة صالحة' }, 400);
    const at = new Date().toISOString();
    const key = `${PREFIX}${at}`;
    await store.set(key, body.payload, { metadata: { at, size: body.payload.length, counts: body.counts || null } });

    const keys = await listSorted(store);
    for (const old of keys.slice(KEEP)) await store.delete(old);
    return json({ ok: true, key, at, kept: Math.min(keys.length, KEEP) });
  }

  return json({ error: 'طريقة غير مدعومة' }, 405);
};

export const config = { path: '/api/vault' };
