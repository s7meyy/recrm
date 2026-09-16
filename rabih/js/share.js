// نشر التقرير على رابطٍ خاص — بديلٌ عن إرسال ملف.
//
// ويُرفَع **مشفَّرًا** بكلمةٍ تختارها أنت وتُرسلها لعميلك في قناةٍ أخرى. فلا
// الخادم يقرؤه ولا نحن، ومن وجد الرابط بلا الكلمة لم ينل شيئًا.
//
// ولا يُنشَر شيء إلا بضغطتك، والرابط يُلغى متى شئت.

import { encryptPayload, newBoxId } from './cloud.js';

/** يرفع HTML التقرير ويُعيد الرابط. */
export async function publish(html, password, { id = '', meta = {}, label = '' } = {}) {
  if (!html || !html.trim()) return { ok: false, error: 'لا تقرير.' };
  if (!password || password.length < 6) return { ok: false, error: 'كلمة السر ستّة أحرف فأكثر.' };

  const boxId = id || newBoxId();
  const payload = await encryptPayload({ html, meta, at: new Date().toISOString() }, password);
  /* عنوانُ صفحة الاستقبال يُخزَّن خارج الصندوق المشفَّر ليُقرأ قبل الكلمة،
     فيراه كل من بلغه الرابط. ولذلك لا يُرسَل إلا إن كتبه المُعِدّ بنفسه،
     ويُقصَر على اسم مكتبه: لو حمل اسم المنشأة لعُرف عمّن التقرير قبل فتحه. */
  if (label.trim()) payload.label = label.trim().slice(0, 60);

  const res = await fetch(`/api/store?key=${encodeURIComponent(boxId)}&slot=report`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: data.error || `تعذّر النشر (${res.status}).`, needsStore: !!data.needsStore };

  return { ok: true, id: boxId, url: `${location.origin}/r/${boxId}`, updatedAt: data.updatedAt, bytes: data.bytes };
}

export async function unpublish(id) {
  if (!id) return false;
  const res = await fetch(`/api/store?key=${encodeURIComponent(id)}&slot=report`, { method: 'DELETE' });
  return res.ok;
}
