// دالة النشر (المرحلة ٩): تستقبل لقطة العروض العامة من لوحة التحكم وتحفظها في Netlify Blobs.
// محميّة بمفتاح سرّي في متغيّر بيئة (PUBLISH_TOKEN) — بلا المفتاح لا يستطيع أحد النشر ولا الحذف.
// البيانات لا تصل هنا إلا بضغطة «نشر» منك: لا مزامنة تلقائية ولا وصول من الخادم إلى جهازك.

import { getStore } from '@netlify/blobs';

const STORE = 'motabiq-public';
const SNAPSHOT_KEY = 'snapshot';
const IMAGE_PREFIX = 'img/';

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

function authorized(request) {
  const expected = process.env.PUBLISH_TOKEN;
  if (!expected) return false;
  const given = request.headers.get('x-publish-token') || '';
  return given.length === expected.length && given === expected;
}

export default async (request) => {
  if (!authorized(request)) return json({ error: 'مفتاح النشر غير صحيح' }, 401);
  const store = getStore({ name: STORE, consistency: 'strong' });

  // قائمة الصور المرفوعة أصلًا: ترفع اللوحة الناقص منها فقط، فلا تُعاد الصور كل مرة.
  if (request.method === 'GET') {
    const { blobs } = await store.list({ prefix: IMAGE_PREFIX });
    const snapshot = await store.get(SNAPSHOT_KEY, { type: 'json' });
    return json({
      images: blobs.map((b) => b.key.slice(IMAGE_PREFIX.length)),
      lastPublishAt: snapshot?.publishedAt || null,
      count: snapshot?.listings?.length || 0,
    });
  }

  if (request.method !== 'POST') return json({ error: 'طريقة غير مدعومة' }, 405);

  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload !== 'object') return json({ error: 'محتوى غير صالح' }, 400);

  // صورة واحدة لكل طلب (حدّ حجم الطلب في الدوال)، والمفاتيح من معرّفات الصور في التطبيق.
  if (payload.kind === 'image') {
    if (!payload.id || !payload.base64) return json({ error: 'الصورة ناقصة' }, 400);
    const bytes = Buffer.from(payload.base64, 'base64');
    await store.set(`${IMAGE_PREFIX}${payload.id}`, bytes, { metadata: { mime: payload.mime || 'image/jpeg' } });
    return json({ ok: true, id: payload.id, bytes: bytes.length });
  }

  if (payload.kind === 'snapshot') {
    const listings = Array.isArray(payload.listings) ? payload.listings : [];
    const snapshot = {
      publishedAt: new Date().toISOString(),
      office: payload.office || {},
      intro: payload.intro || '',
      listings,
    };
    await store.setJSON(SNAPSHOT_KEY, snapshot);

    // تنظيف الصور التي لم تعد مرتبطة بأي عرض منشور (لا تُترك تدور في التخزين).
    // الشعار محفوظ صراحة: ليس ضمن صور العروض، وكان التنظيف يحذفه في كل نشرة.
    const kept = new Set(listings.flatMap((l) => l.images || []));
    if (snapshot.office?.logo) kept.add(snapshot.office.logo);
    const { blobs } = await store.list({ prefix: IMAGE_PREFIX });
    let removed = 0;
    for (const blob of blobs) {
      const id = blob.key.slice(IMAGE_PREFIX.length);
      if (!kept.has(id)) { await store.delete(blob.key); removed++; }
    }
    return json({ ok: true, count: listings.length, removedImages: removed, publishedAt: snapshot.publishedAt });
  }

  // إخلاء الصفحة العامة تمامًا (سحب كل ما نُشر).
  if (payload.kind === 'clear') {
    const { blobs } = await store.list({ prefix: IMAGE_PREFIX });
    for (const blob of blobs) await store.delete(blob.key);
    await store.delete(SNAPSHOT_KEY);
    return json({ ok: true, cleared: true });
  }

  return json({ error: 'نوع الطلب غير معروف' }, 400);
};

export const config = { path: '/api/publish' };
