// تيليجرام: قناةُ تحويلِ الرسائل إلى النظام (المرحلة ٥١).
//
// **لماذا تيليجرام لا الواتساب؟** الواتسابُ الرسميُّ يحتاج تحقّقَ أعمالٍ من Meta وقوالبَ
// معتمَدة، وبوتُ تيليجرام يُصنع في دقيقتين ومجّانيٌّ بلا حدّ. فتحوّل إليه رسالةَ عميلك
// كما هي، فتصل هنا في ثانية.
//
// ثلاثةُ أبوابٍ في دالّةٍ واحدة:
//   POST              → تحديثٌ من تيليجرام (رسالةٌ حوّلتَها)، يُفرَز ويُحفظ.
//   GET               → سردُ الوارد للتطبيق — للمالك وحده.
//   DELETE            → إزالةُ ما اعتمدتَه أو رفضتَه — للمالك وحده.
//
// **قفلان لا قفلٌ واحد:**
//
//   ١) `TELEGRAM_SECRET` — يُسلَّم لتيليجرام عند الربط فيعيده في ترويسة كلّ طلب. وبلا
//      ضبطه **تُرفض الحمولات كلُّها**: نقطةٌ عامّةٌ بلا سرٍّ تعني أنّ من عرف عنوانك
//      يدسّ في صندوقك ما شاء. والرفضُ ٥٠٣ لا ٤٠٣ — فالعيبُ عندنا، وتيليجرام يعيد
//      المحاولة فتصل الرسائل متى ضُبط.
//
//   ٢) `TELEGRAM_CHAT_ID` — اسمُ البوت يُبحث عنه في تيليجرام، فأيُّ أحدٍ يستطيع مراسلته.
//      فلا يُقبل إلا من محادثتك أنت. **وحتى يُضبط، يردّ البوتُ بمعرّف المحادثة ولا
//      يحفظ شيئًا** — فتأخذه منه بلا بحثٍ ولا أداةٍ خارجيّة.
//
// والفرزُ نفسُه في `js/util/lead-sort.js` — **يستورده الخادمُ والمتصفّحُ معًا** فلا
// يختلف ما تراه على الشاشة عمّا حكم به الخادم.

import { getStore } from '@netlify/blobs';
import { signedIn, unauthorized } from '../lib/auth.js';
import { sortIncoming, fingerprintText } from '../../js/util/lead-sort.js';

const STORE = 'kassab-public';
const PREFIX = 'tg/';
/** سقفُ ما يُسرد: صندوقٌ يُعتمد أوّلًا بأوّل لا يبلغه، ومن أهمله لا يُحمّل صفحتَه ألفًا. */
const MAX_KEEP = 300;

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

const CONTROL = /[\p{Cc}]/gu;
const clean = (v, max) => String(v ?? '').replace(CONTROL, ' ').trim().slice(0, max);

/** مقارنةٌ بزمنٍ ثابت: المقارنة العادية تُسرّب طول البادئة الصحيحة. */
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** آخرُ خطإٍ في الإرسال — يُقرأ في السرد فيُعرف سببُ الصمت. */
const REPLY_ERR = 'tg/_reply-error';
/** صاحبُ البوت — يُربط بأوّل رسالة، ويُفصل من صفحة «الوارد». */
const OWNER_KEY = 'tg/_owner';

/**
 * يردّ على المحادثة نفسِها — **وهو الطريقُ الوحيدُ لتعرف معرّفك**.
 *
 * وفشلُه لا يُفشل الاستقبال: الوارِدُ أثمنُ من إشعارٍ به. **لكنّه يُسجَّل ولا يُبتلع**
 * (المرحلة ٥١): كتبتُ أوّلَ مرّةٍ `catch { return false }` فصار الردُّ يفشل ولا يعلم
 * أحد — **وصمتٌ لا يُعرف سببُه أسوأُ من خطإٍ يُقال**. فيُحفظ السببُ ليظهر في السرد.
 */
async function reply(store, chatId, text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const note = async (why) => {
    try { await store.setJSON(REPLY_ERR, { at: new Date().toISOString(), why }); } catch { /* لا يُفشل شيئًا */ }
    return false;
  };
  if (!token) return note('TELEGRAM_BOT_TOKEN غير مضبوط');
  if (!chatId) return note('بلا معرّف محادثة');
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: String(text).slice(0, 3500) }),
    });
    if (res.ok) {
      // ونجاحٌ بعد فشلٍ يمحو الشكوى، فلا تبقى تُتَّهم وقد صلح الحال.
      try { await store.delete(REPLY_ERR); } catch { /* لا يضرّ */ }
      return true;
    }
    const body = await res.text();
    return note(`تيليجرام ردّ ${res.status}: ${body.slice(0, 300)}`);
  } catch (e) {
    return note(`تعذّر الاتصال بتيليجرام: ${String(e?.message || e).slice(0, 200)}`);
  }
}

/**
 * يستخرج من تحديث تيليجرام ما يعنينا — **والنصُّ أينما كان**.
 *
 * والرسالةُ المحوَّلة تحمل نصَّها في `text`، والصورةُ المحوَّلة تحمله في `caption`،
 * **ومن حوّل صورةَ إعلانٍ بلا تعليقٍ لم يُرسل نصًّا** فيُحفظ أنّ صورةً وصلت ويُقال
 * ذلك صراحةً — ولا يُدَّعى أنّ رسالةً فارغةً طلبٌ أو عرض.
 *
 * @returns {null | { updateId, chatId, at, text, mediaKind, fromName, forwardedFrom }}
 */
export function extractUpdate(payload) {
  const m = payload?.message || payload?.channel_post || payload?.edited_message;
  if (!m) return null;
  const media = m.photo ? 'صورة'
    : m.voice ? 'رسالة صوتية'
      : m.audio ? 'مقطع صوتي'
        : m.video ? 'مقطع مرئي'
          : m.document ? 'ملف' : '';
  return {
    updateId: String(payload.update_id ?? ''),
    chatId: String(m.chat?.id ?? ''),
    at: m.date ? new Date(Number(m.date) * 1000).toISOString() : new Date().toISOString(),
    text: clean(m.text || m.caption || '', 4000),
    mediaKind: media,
    fromName: clean([m.from?.first_name, m.from?.last_name].filter(Boolean).join(' '), 80),
    // **من حُوِّلت عنه الرسالةُ هو صاحبُ الطلب لا أنت** — وتيليجرام يُخفيه إن أخفى
    // صاحبُه ملفَّه، فيُترك فارغًا ولا يُخمَّن.
    forwardedFrom: clean(
      [m.forward_from?.first_name, m.forward_from?.last_name].filter(Boolean).join(' ')
      || m.forward_sender_name || m.forward_from_chat?.title || '',
      80,
    ),
  };
}

export default async (request) => {
  const store = getStore({ name: STORE, consistency: 'strong' });

  /* ١) تحديثٌ وارد من تيليجرام */
  if (request.method === 'POST') {
    const secret = process.env.TELEGRAM_SECRET;
    if (!secret) {
      return json({ error: 'TELEGRAM_SECRET غير مضبوط — لا تُقبل رسالة بلا تحقّق' }, 503);
    }
    const given = request.headers.get('x-telegram-bot-api-secret-token') || '';
    if (!safeEqual(given, secret)) return json({ error: 'سرٌّ غير صحيح' }, 403);

    const payload = await request.json().catch(() => null);
    const up = extractUpdate(payload);
    // تحديثٌ لا رسالةَ فيه (تعديلُ حالةٍ أو انضمامُ عضو) يُبتلع بهدوء: تيليجرام
    // يعيد ما لم نؤكّده بـ200، فالصمتُ هنا صوابٌ لا إهمال.
    if (!up || !up.chatId) return json({ ok: true, ignored: true });

    /* **البوتُ يربط نفسَه** (المرحلة ٥١، بعد تجربةٍ مريرة).
       جعلتُ المعرّفَ أوّلَ مرّةٍ متغيّرَ بيئة، فألزمتُ صاحبَه برقصةٍ من ثلاث خطوات:
       البوتُ يعطيه رقمًا، فيلصقه في Netlify، ثم ينشر من جديد. **وكلُّ خطوةٍ منها
       تفشل بصمت**: لقطةُ المتغيّرات تُؤخذ لحظةَ بدء النشرة، فمن حفظ متغيّرَه بعدها
       بثوانٍ لم يره خادمُه — وهذا ما وقع فعلًا.
       فصار الربطُ **بأوّل رسالة**: أوّلُ من يراسل البوت يصير صاحبَه ويُحفظ في التخزين
       لا في متغيّر. ولا نشرةَ ولا لصقَ ولا سباقَ توقيتات. والمتغيّرُ يبقى مقبولًا إن
       وُجد فلا ينكسر ما ضُبط، **وهو الأعلى** — فمن أراد تثبيتَه بيده فله ذلك. */
    const envChat = String(process.env.TELEGRAM_CHAT_ID || '').trim();
    const bound = envChat || String((await store.get(OWNER_KEY, { type: 'json' }))?.chatId || '');

    if (!bound) {
      await store.setJSON(OWNER_KEY, { chatId: up.chatId, at: new Date().toISOString(), name: up.fromName });
      await reply(store, up.chatId, 'تمّ الربط ✅\n\nصار هذا البوتُ لمكتبك، ولا يستقبل من غيرك. '
        + 'حوّل إليه رسائل عملائك وسأفرزها طلبًا أو عرضًا، وتعتمدها أنت من صفحة «الوارد».\n\n'
        + 'وإن لم تكن أنت من ربطه فافصله من صفحة «الوارد» في التطبيق.');
      return json({ ok: true, bound: up.chatId });
    }
    if (bound !== up.chatId) {
      await reply(store, up.chatId, 'هذا البوت خاصٌّ بمكتبٍ بعينه ولا يستقبل من غيره.');
      return json({ ok: true, rejected: true });
    }

    if (!up.text) {
      await reply(store, up.chatId, up.mediaKind
        ? `وصلتني ${up.mediaKind} بلا نصّ — لا أقرأ الصور ولا الصوت. `
          + 'انسخ نصّ الرسالة وأرسله، أو اكتب وصفًا معها.'
        : 'وصلت رسالةٌ فارغة.');
      return json({ ok: true, empty: true });
    }

    /* **التكرار لا يتضاعف**: بصمةُ النصّ مفتاحُ الحفظ، فإعادةُ التحويل تكتب فوق نفسها. */
    const fp = fingerprintText(up.text);
    const verdict = sortIncoming(up.text);
    const key = `${PREFIX}${up.at}-${fp}`;
    const already = (await store.list({ prefix: PREFIX })).blobs.some((b) => b.key.endsWith(`-${fp}`));

    if (!already) {
      await store.setJSON(key, {
        id: fp,
        at: up.at,
        source: 'telegram',
        text: up.text,
        mediaKind: up.mediaKind,
        senderName: up.forwardedFrom || up.fromName,
        forwarded: !!up.forwardedFrom,
        kind: verdict.kind,
        edge: verdict.edge,
        why: verdict.why,
      });
    }

    const label = { request: 'طلب', offer: 'عرض', unsure: 'غير مؤكَّد' }[verdict.kind];
    await reply(store, up.chatId, already
      ? 'وصلت من قبل — لم تُضَف مرّتين.'
      : `وصلت ✅ وقُرئت «${label}». افتح صفحة «الوارد» لتعتمدها.`);
    return json({ ok: true, stored: !already, kind: verdict.kind });
  }

  /* ٢) سرد الوارد — للمالك وحده */
  if (request.method === 'GET') {
    if (!(await signedIn(request))) return unauthorized();
    const { blobs } = await store.list({ prefix: PREFIX });
    const rows = [];
    for (const blob of blobs.slice(-MAX_KEEP)) {
      const rec = await store.get(blob.key, { type: 'json' });
      if (rec) rows.push({ ...rec, key: blob.key });
    }
    rows.sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
    // **وحالُ الربط تُقال مع الوارد**: صفحةٌ تعرض صندوقًا فارغًا لا تُفرّق بين
    // «لا رسائل» و«البوت غير مربوط» — وبينهما فرقُ عملٍ كامل.
    return json({
      messages: rows,
      // **وسببُ الصمت يُقال**: بوتٌ لا يردّ يجعلك تظنّ أنّ شيئًا لم يصل، وقد وصل.
      lastReplyError: (await store.get(REPLY_ERR, { type: 'json' })) || null,
      owner: (await store.get(OWNER_KEY, { type: 'json' })) || null,
      // **والربطُ لا يحتاج متغيّرَ المعرّف**: يكفي الرمزُ والسرّ، والمحادثةُ تُربط بنفسها.
      linked: !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_SECRET),
      missing: ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_SECRET'].filter((k) => !process.env[k]),
    });
  }

  /* ٣) إزالةُ ما اعتُمد أو رُفض — للمالك وحده */
  if (request.method === 'DELETE') {
    if (!(await signedIn(request))) return unauthorized();
    const body = await request.json().catch(() => null);
    // **فصلُ الربط**: يُعيد البوتَ حرًّا فيرتبط بأوّل من يراسله بعدها.
    if (body?.unbind) { await store.delete(OWNER_KEY); return json({ ok: true, unbound: true }); }
    const k = String(body?.key || '');
    if (k.startsWith(PREFIX) && /^[\w\-.:/]+$/.test(k)) await store.delete(k);
    return json({ ok: true });
  }

  return json({ error: 'طريقة غير مدعومة' }, 405);
};

export const config = { path: '/api/telegram' };
