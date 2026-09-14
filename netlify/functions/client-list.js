// قائمة عروض مخصّصة لعميل واحد (المرحلة ١١).
//
// الوسيط يختار عقارات لفلان تحديدًا فيصله رابط برمز عشوائي غير قابل للتخمين، يعرض قائمته وحده.
// القائمة تشير إلى عروض **منشورة أصلًا** (نفس اللقطة) فلا تكشف شيئًا زائدًا.
// الكتابة محميّة بكوكي بوابة الدخول؛ والقراءة عامة (هذا هو الغرض) مع **عدّاد فتح**
// يخبرك هل فتح العميل الرابط ومتى آخر مرة — إشارة متابعة، بلا أي تتبّع لشخصه.

import { getStore } from '@netlify/blobs';
import { signedIn, unauthorized } from '../lib/auth.js';
import { notifyAll } from '../lib/notify.js';

const STORE = 'kassab-public';
const PREFIX = 'list/';

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

const validSlug = (s) => typeof s === 'string' && /^[A-Za-z0-9_-]{6,40}$/.test(s);

export default async (request) => {
  const store = getStore({ name: STORE, consistency: 'strong' });
  const url = new URL(request.url);
  const slug = url.searchParams.get('slug') || '';

  /* قراءة عامة: القائمة + تسجيل فتحة */
  if (request.method === 'GET' && slug) {
    if (!validSlug(slug)) return json({ error: 'رمز غير صالح' }, 400);
    const rec = await store.get(PREFIX + slug, { type: 'json' });
    if (!rec) return json({ error: 'القائمة غير موجودة أو سُحبت' }, 404);
    const snapshot = await store.get('snapshot', { type: 'json' });
    const byRef = new Map((snapshot?.listings || []).map((l) => [String(l.ref), l]));
    const listings = (rec.refs || []).map((r) => byRef.get(String(r))).filter(Boolean);

    // العدّاد لا يُحسب إلا لفتحة حقيقية من متصفح (لا لاستعلام المالك من لوحة التحكم).
    if (url.searchParams.get('count') === '1') {
      const now = new Date().toISOString();
      await store.setJSON(PREFIX + slug, { ...rec, opens: (rec.opens || 0) + 1, lastOpenAt: now });
      // تنبيه فوري عند الفتح (المرحلة ٢٢): لحظة فتح العميل لرابطه أفضل لحظة للاتصال به.
      // ويُرسل مرة واحدة كل ساعة للقائمة نفسها، فلا يزعجك من يتصفّح ذهابًا وإيابًا.
      const lastNotify = rec.lastNotifyAt ? new Date(rec.lastNotifyAt).getTime() : 0;
      if (Date.now() - lastNotify > 3600000) {
        await store.setJSON(PREFIX + slug, {
          ...rec, opens: (rec.opens || 0) + 1, lastOpenAt: now, lastNotifyAt: now,
        });
        await notifyAll({
          title: 'عميلك فتح قائمة عروضه',
          body: 'هذه أفضل لحظة للاتصال به.',
          url: '/#/publish',
          tag: `kassab-open-${slug}`,
        }).catch(() => {});
      }
    }
    return json({
      title: rec.title || '', note: rec.note || '', clientName: rec.clientName || '',
      office: snapshot?.office || {}, listings,
    });
  }

  if (!(await signedIn(request))) return unauthorized();

  /* قائمة كل القوائم مع عدّاداتها (للوحة التحكم) */
  if (request.method === 'GET') {
    const { blobs } = await store.list({ prefix: PREFIX });
    const out = [];
    for (const b of blobs) {
      const rec = await store.get(b.key, { type: 'json' });
      if (rec) out.push({ slug: b.key.slice(PREFIX.length), ...rec });
    }
    out.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    return json({ lists: out });
  }

  if (request.method === 'POST') {
    const body = await request.json().catch(() => null);
    if (!body?.slug || !validSlug(body.slug)) return json({ error: 'رمز غير صالح' }, 400);
    const refs = (Array.isArray(body.refs) ? body.refs : []).map(String).slice(0, 100);
    if (!refs.length) return json({ error: 'اختر عرضًا واحدًا على الأقل' }, 400);
    const prev = await store.get(PREFIX + body.slug, { type: 'json' });
    await store.setJSON(PREFIX + body.slug, {
      refs,
      clientName: String(body.clientName || '').slice(0, 80),
      title: String(body.title || '').slice(0, 120),
      note: String(body.note || '').slice(0, 400),
      createdAt: prev?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      opens: prev?.opens || 0,
      lastOpenAt: prev?.lastOpenAt || null,
    });
    return json({ ok: true, slug: body.slug });
  }

  if (request.method === 'DELETE') {
    const body = await request.json().catch(() => null);
    if (body?.slug && validSlug(body.slug)) await store.delete(PREFIX + body.slug);
    return json({ ok: true });
  }

  return json({ error: 'طريقة غير مدعومة' }, 405);
};

export const config = { path: '/api/client-list' };
