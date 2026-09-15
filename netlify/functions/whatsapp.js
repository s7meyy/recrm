// واتساب: استقبال الرسائل وسردها (المرحلة ٣٨).
//
// ثلاثة أبوابٍ في دالّةٍ واحدة، لأنّ Meta تشترط عنوانًا واحدًا للوِبهوك:
//
//   GET  مع hub.mode=subscribe  → مصافحة التحقّق التي تطلبها Meta عند ربط الوِبهوك.
//   POST                        → رسالةٌ واردة من عميل، تُحفظ.
//   GET  بلا hub.mode           → سرد الوارد للتطبيق (للمالك وحده).
//
// **التحقّق من التوقيع**: Meta توقّع كلّ POST بـ`X-Hub-Signature-256` من سرّ التطبيق.
// وبلا تحقّقٍ منه يستطيع أيُّ أحدٍ في الدنيا أن يدسّ في صندوقك رسائل باسم عملائك.
// فإن كان `WHATSAPP_APP_SECRET` مضبوطًا، لا تُقبل رسالةٌ بلا توقيعٍ صحيح — نقطة.
// وإن لم يُضبط، تُرفض الرسائل كلّها ويُقال السبب: بابٌ بلا قفلٍ لا يُفتح لأنّه «مؤقّت».

import { getStore } from '@netlify/blobs';
import { signedIn, unauthorized } from '../lib/auth.js';

const STORE = 'kassab-public';
const PREFIX = 'wa/';
const MAX_KEEP = 500;

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

const CONTROL = /[\p{Cc}]/gu;
const clean = (v, max) => String(v ?? '').replace(CONTROL, ' ').trim().slice(0, max);

/** مقارنةٌ بزمنٍ ثابت: المقارنة العادية تُسرّب طول البادئة الصحيحة. */
function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmacHex(secret, bodyText) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(bodyText));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** الرقم كما يخزّنه التطبيق: محلّيّ يبدأ بصفر، فيُطابق العملاء بلا ترجمةٍ في الواجهة. */
function localPhone(waId) {
  const digits = String(waId ?? '').replace(/\D/g, '');
  if (digits.startsWith('966')) return `0${digits.slice(3)}`;
  if (digits.startsWith('0')) return digits;
  return digits ? `0${digits}` : '';
}

/** يستخرج الرسائل من بنية Meta المتشعّبة — ويتجاهل ما ليس رسالةً (إشعارات التسليم). */
export function extractMessages(payload) {
  const out = [];
  for (const entry of payload?.entry || []) {
    for (const change of entry.changes || []) {
      const value = change.value || {};
      const names = new Map((value.contacts || []).map((c) => [c.wa_id, c.profile?.name || '']));
      for (const m of value.messages || []) {
        out.push({
          id: clean(m.id, 120),
          from: localPhone(m.from),
          name: clean(names.get(m.from) || '', 80),
          at: m.timestamp ? new Date(Number(m.timestamp) * 1000).toISOString() : new Date().toISOString(),
          type: clean(m.type, 20),
          // النصّ وحده يُحفظ؛ والوسائط يُحفظ معرّفها فقط — تنزيلها يحتاج نداءً آخر
          // بالتوكن، ولا يُفعل هنا بلا طلبك: صورةٌ تُنزَّل تلقائيًّا تملأ التخزين.
          text: clean(m.text?.body || m.button?.text || m.interactive?.list_reply?.title || '', 2000),
          mediaId: clean(m.image?.id || m.video?.id || m.audio?.id || m.document?.id || '', 120),
        });
      }
    }
  }
  return out;
}

export default async (request) => {
  const url = new URL(request.url);
  const store = getStore({ name: STORE, consistency: 'strong' });

  /* ١) مصافحة التحقّق من Meta */
  if (request.method === 'GET' && url.searchParams.get('hub.mode')) {
    const token = process.env.WHATSAPP_VERIFY_TOKEN;
    if (!token) return new Response('WHATSAPP_VERIFY_TOKEN غير مضبوط', { status: 503 });
    const given = url.searchParams.get('hub.verify_token') || '';
    if (!safeEqual(given, token)) return new Response('رمز تحقّق خاطئ', { status: 403 });
    return new Response(url.searchParams.get('hub.challenge') || '', {
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }

  /* ٢) رسالة واردة */
  if (request.method === 'POST') {
    const secret = process.env.WHATSAPP_APP_SECRET;
    const bodyText = await request.text();
    if (!secret) {
      // لا يُقبل وارِدٌ بلا تحقّق. الرفض ٥٠٣ لا ٤٠٣: العيب عندنا لا عند المُرسِل،
      // وMeta تعيد المحاولة فتصل الرسائل متى ضُبط السرّ.
      return json({ error: 'WHATSAPP_APP_SECRET غير مضبوط — لا تُقبل رسالة بلا تحقّق من توقيعها' }, 503);
    }
    const header = request.headers.get('x-hub-signature-256') || '';
    const expected = `sha256=${await hmacHex(secret, bodyText)}`;
    if (!safeEqual(header, expected)) return json({ error: 'توقيع غير صحيح' }, 403);

    let payload;
    try { payload = JSON.parse(bodyText); } catch { return json({ error: 'جسمٌ غير صالح' }, 400); }

    const messages = extractMessages(payload);
    for (const m of messages) {
      if (!m.id) continue;
      // المفتاح بالوقت ثم بمعرّف الرسالة: السرد يأتي مرتَّبًا، والتكرار لا يتضاعف
      // (Meta تعيد إرسال ما لم تؤكّده).
      await store.setJSON(`${PREFIX}${m.at}-${m.id.replace(/[^\w-]/g, '')}`, m);
    }
    return json({ ok: true, stored: messages.length });
  }

  /* ٣) سرد الوارد — للمالك وحده */
  if (request.method === 'GET') {
    if (!(await signedIn(request))) return unauthorized();
    const { blobs } = await store.list({ prefix: PREFIX });
    const rows = [];
    for (const blob of blobs.slice(-MAX_KEEP)) {
      const rec = await store.get(blob.key, { type: 'json' });
      if (rec) rows.push({ ...rec, key: blob.key });
    }
    rows.sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
    return json({ messages: rows });
  }

  if (request.method === 'DELETE') {
    if (!(await signedIn(request))) return unauthorized();
    const body = await request.json().catch(() => null);
    const k = String(body?.key || '');
    if (k.startsWith(PREFIX) && /^[\w\-.:/]+$/.test(k)) await store.delete(k);
    return json({ ok: true });
  }

  return json({ error: 'طريقة غير مدعومة' }, 405);
};

export const config = { path: '/api/whatsapp' };
