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
import { matchAuto, cleanRules, outsideWorkHours, MAX_AUTO_PER_DAY } from '../../js/util/wa-auto.js';

const STORE = 'kassab-public';
const PREFIX = 'wa/';
/** إعدادُ الردّ التلقائيّ — **في Blobs لا في إعدادات التطبيق**: الوِبهوك يعمل على الخادم
 *  ولا يرى IndexedDB في متصفّحك، فقاعدةٌ تُكتب هناك لا تصل إليه أبدًا. */
const AUTO_KEY = 'wa-auto/config';
/** عدّادُ ما أُرسل آليًّا لكلّ رقمٍ في اليوم — سدٌّ أمام حلقةٍ لا تنتهي. */
const AUTO_COUNT = 'wa-auto/count/';
const MAX_KEEP = 500;

const DEFAULT_AUTO = { enabled: false, outsideHoursOnly: false, from: 9, to: 22, rules: [] };

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

const clampHour = (v, dflt) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 0 && n <= 23 ? n : dflt;
};

/**
 * يرسل نصًّا حرًّا إلى رقم — **وهو مشروعٌ داخل نافذة الأربع والعشرين ساعة وحدها**.
 * وواتساب نفسُه هو الذي يرفض خارجَها، فلا نُكرّر حراسته هنا ولا ندّعي علمًا بما عنده:
 * يُمرَّر الردُّ ويُنقَل جوابُه كما هو.
 */
async function sendText(to, text) {
  const id = process.env.WHATSAPP_PHONE_ID;
  const token = process.env.WHATSAPP_TOKEN;
  if (!id || !token) return { ok: false, error: 'WHATSAPP_PHONE_ID و WHATSAPP_TOKEN غير مضبوطين' };
  const res = await fetch(`https://graph.facebook.com/v21.0/${encodeURIComponent(id)}/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: String(to || '').replace(/\D/g, '').replace(/^0/, '966'),
      type: 'text',
      text: { body: String(text || '').slice(0, 4000) },
    }),
  });
  const body = await res.text();
  return res.ok ? { ok: true } : { ok: false, error: `واتساب ردّ ${res.status}: ${body.slice(0, 200)}` };
}

/** الردُّ اليدويّ من صندوق الوارد — للمالك وحده. */
async function sendReply(body, store) {
  const to = String(body?.to || '').replace(/\D/g, '');
  const text = String(body?.reply || '').trim();
  if (!to || !text) return json({ error: 'يلزم رقمٌ ونصّ' }, 400);
  const res = await sendText(to, text);
  if (!res.ok) return json({ error: res.error }, 502);
  // **ويُحفظ ما أُرسل**: صندوقٌ يعرض الوارد وحدَه يجعلك تردّ مرّتين وأنت لا تدري.
  const at = new Date().toISOString();
  await store.setJSON(`${PREFIX}${at}-out-${Math.random().toString(36).slice(2, 10)}`, {
    id: `out-${at}`, from: `0${to.replace(/^966/, '')}`, name: '', at,
    type: 'text', text: text.slice(0, 2000), mediaId: '', outbound: true,
  });
  return json({ ok: true });
}

/**
 * **الردُّ التلقائيّ.** يقرأ القواعد من Blobs ويُطبّقها على ما وصل للتوّ.
 *
 * ولا يردّ على ما أرسلناه نحن، ولا يتجاوز `MAX_AUTO_PER_DAY` لرقمٍ واحد، ولا يعمل
 * أصلًا ما لم يُفعَّل. **والعدّادُ بيوميّةٍ لا بعمرٍ مفتوح**: يُكتب بمفتاحٍ فيه تاريخُ
 * اليوم، فينتهي وحدَه غدًا بلا تنظيفٍ ولا مهمّةٍ دوريّة.
 */
async function autoReply(store, messages, existingBlobs) {
  const cfg = (await store.get(AUTO_KEY, { type: 'json' })) || DEFAULT_AUTO;
  if (!cfg.enabled || !cfg.rules?.length) return 0;
  const now = Date.now();
  const outsideHours = outsideWorkHours({ from: cfg.from, to: cfg.to }, now);
  const day = new Date(now).toISOString().slice(0, 10);

  let sent = 0;
  for (const m of messages) {
    if (!m.from || m.outbound) continue;
    // **أوّلُ رسالةٍ من هذا الرقم**: تُقاس على ما كان محفوظًا **قبل** هذه الدفعة،
    // لأنّ الرسالةَ الحاليّةَ حُفظت للتوّ فتبدو سابقةً لنفسها.
    const isFirst = !(await hasEarlier(store, existingBlobs, m.from));
    const countKey = `${AUTO_COUNT}${day}/${m.from}`;
    const sentToday = (await store.get(countKey, { type: 'json' }))?.n || 0;
    const rule = matchAuto(m, cfg.rules, {
      isFirst, sentToday, outsideHours, outsideHoursOnly: cfg.outsideHoursOnly,
    });
    if (!rule) continue;
    const res = await sendText(m.from, rule.reply);
    if (!res.ok) continue;
    sent += 1;
    await store.setJSON(countKey, { n: Math.min(sentToday + 1, MAX_AUTO_PER_DAY) });
    const at = new Date().toISOString();
    await store.setJSON(`${PREFIX}${at}-auto-${Math.random().toString(36).slice(2, 10)}`, {
      id: `auto-${at}`, from: m.from, name: '', at,
      type: 'text', text: rule.reply.slice(0, 2000), mediaId: '', outbound: true, auto: true,
    });
  }
  return sent;
}

/** أثمّة رسالةٌ سابقةٌ من هذا الرقم في المحفوظ قبل هذه الدفعة؟ */
async function hasEarlier(store, blobs, from) {
  for (const b of blobs) {
    const rec = await store.get(b.key, { type: 'json' });
    if (rec && rec.from === from && !rec.outbound) return true;
  }
  return false;
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
    const existing = messages.length ? (await store.list({ prefix: PREFIX })).blobs : [];
    for (const m of messages) {
      if (!m.id) continue;
      // المفتاح بالوقت ثم بمعرّف الرسالة: السرد يأتي مرتَّبًا، والتكرار لا يتضاعف
      // (Meta تعيد إرسال ما لم تؤكّده).
      await store.setJSON(`${PREFIX}${m.at}-${m.id.replace(/[^\w-]/g, '')}`, m);
    }
    // **الردُّ التلقائيّ بعد الحفظ لا قبله**: لو فشل الإرسال بقيت الرسالةُ محفوظةً على
    // كلّ حال — والوارِدُ أثمنُ من الردّ عليه.
    const replied = await autoReply(store, messages, existing).catch(() => 0);
    return json({ ok: true, stored: messages.length, autoReplied: replied });
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
    const auto = (await store.get(AUTO_KEY, { type: 'json' })) || DEFAULT_AUTO;
    // **وحالُ الإرسال تُقال مع الوارد**: صفحةٌ تعرض قواعدَ ردٍّ تلقائيٍّ لا يستطيع
    // الخادمُ تنفيذها (لا توكن) تَعِد بما لا يقع.
    return json({ messages: rows, auto, canSend: !!(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID) });
  }

  /* ٤) إعدادُ الردّ التلقائيّ — قراءةً وكتابةً، للمالك وحده */
  if (request.method === 'PUT') {
    if (!(await signedIn(request))) return unauthorized();
    const body = await request.json().catch(() => null);
    if (body?.reply) return sendReply(body, store);
    const next = {
      enabled: !!body?.enabled,
      outsideHoursOnly: !!body?.outsideHoursOnly,
      from: clampHour(body?.from, 9),
      to: clampHour(body?.to, 22),
      rules: cleanRules(body?.rules),
    };
    await store.setJSON(AUTO_KEY, next);
    return json({ ok: true, auto: next });
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
