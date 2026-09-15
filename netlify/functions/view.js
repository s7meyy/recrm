// عدّاد مشاهدات العروض (المرحلة ٢٥).
//
// كنت تنشر عرضًا ولا تعرف: هل رآه أحد؟ العدّاد يجيب عن هذا وحده — **ولا يجيب عن أكثر**:
// لا عنوان IP يُخزَّن، ولا كوكي، ولا بصمة متصفح، ولا «من» رأى. رقمٌ لكل عرض لكل يوم.
//
// الدقّة معلَنة: القراءة ثم الكتابة بلا قفل، فمشاهدتان في اللحظة نفسها قد تُحسبان واحدة.
// وهذا مقبول لغرضه — **مؤشر اهتمام لا محاسبة إعلانية** — ولا يُقدَّم على أنه غير ذلك.
//
// المسح بعد ٩٠ يومًا: العدّاد يُقاس بالأسابيع لا بالسنين، والتخزين لا يُترك ينمو بلا حدّ.

import { getStore } from '@netlify/blobs';
import { signedIn, unauthorized } from '../lib/auth.js';

const STORE = 'kassab-public';
const PREFIX = 'view/';
const KEEP_DAYS = 90;

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

const day = (d = new Date()) => d.toISOString().slice(0, 10);
const safeRef = (v) => String(v ?? '').replace(/[^\w-]/g, '').slice(0, 24);

export default async (request) => {
  const store = getStore({ name: STORE, consistency: 'strong' });

  /* تسجيل مشاهدة — عامّ بقصد (الزائر لا يسجّل دخولًا) */
  if (request.method === 'POST') {
    const body = await request.json().catch(() => null);
    const ref = safeRef(body?.ref);
    // العرض غير المنشور لا يُفتح له عدّاد: وإلا لملأ أيُّ عابثٍ التخزين بمفاتيح لا وجود لها.
    if (!ref) return json({ ok: true });
    const snapshot = await store.get('snapshot', { type: 'json' });
    if (!(snapshot?.listings || []).some((l) => String(l.ref) === ref)) return json({ ok: true });

    const key = `${PREFIX}${ref}/${day()}`;
    const n = (await store.get(key, { type: 'json' }))?.n || 0;
    await store.setJSON(key, { n: n + 1 });
    return json({ ok: true });
  }

  /* قراءة العدّاد — للمالك وحده */
  if (!(await signedIn(request))) return unauthorized();
  if (request.method !== 'GET') return json({ error: 'طريقة غير مدعومة' }, 405);

  const { blobs } = await store.list({ prefix: PREFIX });
  const cutoff = day(new Date(Date.now() - KEEP_DAYS * 86400000));
  const weekAgo = day(new Date(Date.now() - 7 * 86400000));
  const counts = {};

  for (const blob of blobs) {
    const [ref, date] = blob.key.slice(PREFIX.length).split('/');
    if (!ref || !date) continue;
    if (date < cutoff) { await store.delete(blob.key).catch(() => {}); continue; }
    const n = (await store.get(blob.key, { type: 'json' }))?.n || 0;
    const row = counts[ref] || (counts[ref] = { total: 0, week: 0, lastAt: null });
    row.total += n;
    if (date >= weekAgo) row.week += n;
    if (!row.lastAt || date > row.lastAt) row.lastAt = date;
  }

  return json({ counts });
};

export const config = { path: '/api/view' };
