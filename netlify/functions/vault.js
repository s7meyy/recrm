// خزنة النسخ الاحتياطية السحابية (المرحلة ١٠).
//
// **الخادم لا يستطيع قراءة نسختك.** التشفير يتم كاملًا في متصفحك (AES-GCM بمفتاح مشتق من
// عبارة سرّية عبر PBKDF2)، وما يصل هنا كتلة مبهمة لا مفتاح لها على الخادم إطلاقًا.
// الحماية: كوكي بوابة الدخول نفسها — فلا مفتاح إضافي تلصقه.
//
// يُحتفظ بآخر KEEP نسخ: الأحدث للاسترجاع السريع، والأقدم شبكة أمان لو أفسدت البيانات ولم تنتبه.

import { getStore } from '@netlify/blobs';
import { roleOf, unauthorized, forbidden } from '../lib/auth.js';

const STORE = 'kassab-vault';
const PREFIX = 'backup/';
const IMAGE_PREFIX = 'images/';
const KEEP = 5;
const KEEP_IMAGES = 2; // كتل الصور ثقيلة، ونسختان تكفيان شبكةَ أمان

// حدّ الحجم (المرحلة ٣٥). دالة Netlify تستقبل نحو ٦ ميغابايت في الطلب الواحد، ونقف دونه
// بهامشٍ يسع ترويسات الطلب وتضخّم JSON. وكان الحدّ **غير مفحوص إطلاقًا** — لا هنا ولا في
// المتصفح — فكان الرفع يفشل بلا رسالةٍ مفهومة متى كبرت مكتبة الصور، وصاحبُه يحسب نسخته
// محفوظة. وأسوأ العطب ما يقع في ميزة أمانٍ ولا يقول.
const MAX_BYTES = 4_500_000;

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

const listSorted = async (store, prefix = PREFIX) => {
  const { blobs } = await store.list({ prefix });
  return blobs.map((b) => b.key).sort().reverse(); // المفتاح يبدأ بالتاريخ ISO فالفرز زمني
};

export default async (request) => {
  // الخزنة فيها بيانات المكتب كلّها معًا؛ فرفعُها واسترجاعها للمالك وحده (المرحلة ٣٥).
  // والمنع هنا لا في الواجهة: إخفاء زرٍّ ليس منعًا.
  const role = await roleOf(request);
  if (!role) return unauthorized();
  if (role !== 'owner') return forbidden('النسخة السحابية للمالك وحده');
  const store = getStore({ name: STORE, consistency: 'strong' });
  const url = new URL(request.url);

  // `?kind=images` يفصل كتل الصور عن نسخ البيانات: لكلٍّ قائمتُه وعددُ نسخه المحفوظة،
  // فلا تدفع كتلةُ صورٍ واحدة خمسَ نسخ بيانات خارج الخزنة.
  const kind = url.searchParams.get('kind') === 'images' ? IMAGE_PREFIX : PREFIX;
  const keep = kind === IMAGE_PREFIX ? KEEP_IMAGES : KEEP;

  if (request.method === 'GET') {
    const keys = await listSorted(store, kind);
    // ?key=… ينزّل نسخة بعينها، وبلا مُعامل تعود قائمة النسخ فقط (بلا تحميل ثقيل).
    const wanted = url.searchParams.get('key');
    if (!wanted) {
      const metas = [];
      for (const key of keys) {
        const meta = await store.getMetadata(key);
        metas.push({ key, at: meta?.metadata?.at || key.slice(kind.length), size: meta?.metadata?.size || null, counts: meta?.metadata?.counts || null, part: meta?.metadata?.part ?? null, parts: meta?.metadata?.parts ?? null });
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
    // الحدّ يُفحص هنا أيضًا لا في المتصفح وحده: الخادم هو من يرفض فعلًا، والرسالة تقول
    // **بالأرقام** لماذا رُفضت — «كبيرة» وحدها لا تدلّ على فعل.
    if (body.payload.length > MAX_BYTES) {
      return json({
        error: `النسخة ${Math.round(body.payload.length / 100000) / 10} ميغابايت، والحدّ ${MAX_BYTES / 1000000} — ارفع البيانات وحدها، والصور في كتلٍ منفصلة.`,
        tooLarge: true, bytes: body.payload.length, limit: MAX_BYTES,
      }, 413);
    }
    const at = new Date().toISOString();
    // الكتلة الواحدة من الصور تحمل ترتيبها كي يعرف الاسترجاع أنه جمعها كلّها.
    const suffix = body.part != null ? `${at}-${String(body.part).padStart(3, '0')}` : at;
    const key = `${kind}${suffix}`;
    await store.set(key, body.payload, {
      metadata: {
        at, size: body.payload.length, counts: body.counts || null,
        part: body.part ?? null, parts: body.parts ?? null, batch: body.batch || null,
      },
    });

    const keys = await listSorted(store, kind);
    // كتل الصور تُقلَّم بالدفعة لا بالعدد: دفعةٌ من عشر كتل لا يجوز أن يبقى منها اثنتان.
    if (kind === IMAGE_PREFIX) {
      const batches = [];
      for (const k of keys) {
        const meta = await store.getMetadata(k);
        const batch = meta?.metadata?.batch || k;
        if (!batches.includes(batch)) batches.push(batch);
      }
      const doomed = batches.slice(keep);
      for (const k of keys) {
        const meta = await store.getMetadata(k);
        if (doomed.includes(meta?.metadata?.batch || k)) await store.delete(k);
      }
      return json({ ok: true, key, at, kept: Math.min(batches.length, keep) });
    }
    for (const old of keys.slice(keep)) await store.delete(old);
    return json({ ok: true, key, at, kept: Math.min(keys.length, keep) });
  }

  return json({ error: 'طريقة غير مدعومة' }, 405);
};

export const config = { path: '/api/vault' };
