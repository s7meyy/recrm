// استقبال نماذج عملاء إعلانات Meta (المرحلة ٣٠) — **الطرف عندنا فقط**.
//
// إعلان «نموذج عميل محتمل» في فيسبوك أو إنستقرام يصل إلى هنا فيظهر في لوحة «طلبات من
// الصفحة العامة» كأي طلب. وهذا نصف الطريق: النصف الآخر **إعدادٌ عندك في Meta** لا يستطيعه
// أحد نيابةً عنك (تطبيق، وتوكن صفحة، واشتراك الصفحة بالحدث، ومراجعة من Meta).
//
// المتغيّرات المطلوبة على Netlify:
//   META_VERIFY_TOKEN  نصٌّ تختاره أنت وتكتبه في Meta عند ربط الويب-هوك
//   META_APP_SECRET    سرّ التطبيق — **بلا ضبطه لا تُقبل أي حمولة** (انظر أدناه)
//   META_PAGE_TOKEN    توكن الصفحة لقراءة بيانات النموذج من Graph API
//
// وقاعدتان صارمتان:
//   • **بلا `META_APP_SECRET` تُرفض كل الحمولات.** نقطة عامة بلا توقيع تعني أن أي أحد
//     يحقن عملاء في قاعدتك — والتعطيل الآمن أولى من استقبالٍ مفتوح.
//   • بلا `META_PAGE_TOKEN` يُحفظ **ما وصل فقط** (معرّف النموذج) موسومًا بأن الربط ناقص،
//     فلا يضيع الحدث ولا يُدّعى أن العميل وصل كاملًا.

import { getStore } from '@netlify/blobs';
import { mapLeadFields, verifySignature, leadgenIds } from '../lib/meta.js';
import { notifyAll } from '../lib/notify.js';

const STORE = 'kassab-public';
const PREFIX = 'lead/';

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/** يقرأ بيانات النموذج من Graph API. الفشل لا يُسقط الحدث — يُحفظ ناقصًا وموسومًا. */
async function fetchLead(leadgenId, token) {
  const url = `https://graph.facebook.com/v19.0/${encodeURIComponent(leadgenId)}?access_token=${encodeURIComponent(token)}`;
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`graph ${res.status}`);
  return res.json();
}

export default async (request) => {
  const url = new URL(request.url);

  /* مصافحة التحقّق التي تطلبها Meta مرة واحدة عند ربط الويب-هوك */
  if (request.method === 'GET') {
    const expected = process.env.META_VERIFY_TOKEN;
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge') || '';
    if (!expected) return json({ error: 'META_VERIFY_TOKEN غير مضبوط' }, 503);
    if (mode === 'subscribe' && token === expected) {
      return new Response(challenge, { status: 200, headers: { 'content-type': 'text/plain; charset=utf-8' } });
    }
    return json({ error: 'تحقّق غير صالح' }, 403);
  }

  if (request.method !== 'POST') return json({ error: 'طريقة غير مدعومة' }, 405);

  const secret = process.env.META_APP_SECRET;
  const raw = await request.text();
  if (!verifySignature(raw, request.headers.get('x-hub-signature-256'), secret)) {
    // الرسالة واحدة في الحالتين (لا سرّ / توقيع خاطئ): لا يُخبَر الطارق أيّهما.
    return json({ error: 'توقيع غير صالح' }, 403);
  }

  const payload = JSON.parse(raw || '{}');
  const ids = leadgenIds(payload);
  if (!ids.length) return json({ ok: true, saved: 0 });

  const store = getStore({ name: STORE, consistency: 'strong' });
  const pageToken = process.env.META_PAGE_TOKEN;
  let saved = 0;

  for (const item of ids) {
    let lead = { name: '', phone: '', note: '' };
    let partial = !pageToken;
    if (pageToken) {
      try {
        const data = await fetchLead(item.id, pageToken);
        lead = mapLeadFields(data?.field_data || []);
      } catch (_) {
        partial = true; // الحدث لا يضيع: يُحفظ ناقصًا ويُقال إنه ناقص
      }
    }
    const rec = {
      id: newId(),
      name: lead.name || '',
      phone: lead.phone || '',
      note: [
        lead.note,
        partial ? `من إعلان Meta — الربط ناقص، افتح النموذج في Meta لقراءة بياناته (المعرّف ${item.id})` : '',
      ].filter(Boolean).join(' · '),
      ref: '',
      source: 'meta',
      createdAt: item.createdAt ? new Date(Number(item.createdAt) * 1000).toISOString() : new Date().toISOString(),
    };
    await store.setJSON(PREFIX + rec.id, rec);
    saved++;
  }

  await notifyAll({
    title: 'طلب جديد من إعلان',
    body: 'وصل نموذج عميل من إعلانك — افتح «الصفحة العامة للعروض».',
    url: '/#/publish',
    tag: 'kassab-lead',
  }).catch(() => {});

  return json({ ok: true, saved });
};

export const config = { path: '/api/meta-lead' };
