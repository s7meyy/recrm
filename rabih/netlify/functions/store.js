// مخزنٌ صغير على Netlify Blobs — أساسٌ للمتابعة الدورية ورابط التقرير والمزامنة.
//
// **وهذه أول مرة تغادر فيها بياناتك متصفحك**، فالقواعد صارمة:
//
// 1. **لا يُخزَّن إلا مشفَّرًا**: ما يصل هنا نصٌّ مبهم شُفِّر في متصفحك بمفتاحٍ
//    لا نعرفه ولا يُرسَل. فالخادم حاملٌ للصندوق لا مالكٌ لمفتاحه، ولو سُرِّب
//    المخزن كلّه لم يُقرأ منه حرف.
// 2. **لا يُفتَح إلا بمعرِّفٍ سرّي** يولّده متصفحك ولا يُشتقّ من اسمٍ ولا رابط،
//    فلا يُخمَّن ولا يُعدّ عليه.
// 3. **ولا يُفعَّل إلا باختيارك**: ما لم تُشغّل المزامنة لا يُرفَع شيء البتّة.

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

// المعرّف من متصفحك: ٣٢ حرفًا ست عشريًّا فأكثر، فلا يُعَدّ عليه ولا يُخمَّن.
const validKey = (k) => typeof k === 'string' && /^[a-f0-9]{32,64}$/.test(k);

// سقفٌ يمنع استعمال المخزن مستودعَ ملفات.
const MAX_BYTES = 5 * 1024 * 1024;

export default async (request) => {
  const url = new URL(request.url);
  const key = url.searchParams.get('key') || '';
  const slot = (url.searchParams.get('slot') || 'archive').replace(/[^a-z0-9_-]/gi, '').slice(0, 40) || 'archive';

  if (!validKey(key)) return json({ error: 'معرّف غير صالح.' }, 400);

  /* الاستيراد داخل try: غياب الحزمة رسالةٌ تُفهَم لا انهيارٌ بخمسمئة. */
  let store;
  try {
    const { getStore } = await import('@netlify/blobs');
    store = getStore({ name: 'rabih', consistency: 'strong' });
  } catch (e) {
    return json({
      error: 'مخزن Netlify غير مهيّأ على هذا الموقع (' + (e?.message || '') + ').',
      needsStore: true,
    }, 503);
  }

  const path = `${key}/${slot}`;

  try {
    if (request.method === 'GET') {
      const blob = await store.get(path, { type: 'text' });
      if (blob === null) return json({ found: false });
      const meta = await store.getMetadata(path).catch(() => null);
      return json({ found: true, data: blob, updatedAt: meta?.metadata?.updatedAt || null });
    }

    if (request.method === 'PUT' || request.method === 'POST') {
      const body = await request.text();
      if (!body) return json({ error: 'لا بيانات.' }, 400);
      if (body.length > MAX_BYTES) return json({ error: 'أكبر من الحدّ (٥ ميقابايت).' }, 413);
      // لا يُقبَل إلا ما بدا مشفَّرًا: الصريح لا يُخزَّن ولو طُلب.
      let parsed;
      try { parsed = JSON.parse(body); } catch { return json({ error: 'الحمولة ليست JSON.' }, 400); }
      if (!parsed || !parsed.cipher || !parsed.iv || !parsed.salt) {
        return json({ error: 'لا تُقبَل حمولة غير مشفَّرة.' }, 400);
      }
      const updatedAt = new Date().toISOString();
      await store.set(path, body, { metadata: { updatedAt } });
      return json({ ok: true, updatedAt, bytes: body.length });
    }

    if (request.method === 'DELETE') {
      await store.delete(path);
      return json({ ok: true });
    }
  } catch (e) {
    return json({ error: 'تعذّر الوصول إلى المخزن: ' + (e?.message || '') }, 502);
  }

  return json({ error: 'الطريقة غير مدعومة.' }, 405);
};

export const config = { path: '/api/store' };
