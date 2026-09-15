// تذكيرات المهام المستحقة (المرحلة ١٠) و**ملاحقة الطلب الذي لم يُردَّ عليه** (المرحلة ٣٥)
// — دالة مجدولة كل ٥ دقائق.
//
// تعمل والتبويب مغلق (وهذا القيد الذي كان موثَّقًا منذ المرحلة ٦ ويزول هنا).
// لا تعرف الخادمُ شيئًا عن محتوى مهامك: عنده `{ id, dueAt }` فقط، فالتنبيه نصّه عام
// والتفاصيل تُقرأ من جهازك عند النقر. الاشتراك المنتهي (404/410) يُحذف تلقائيًا.
//
// **وأما الطلب الجديد فله تنبيهٌ فوري منذ المرحلة ٢٢** (`notifyAll` في `lead.js`) — وليس
// هو الناقص. الناقص أن **تنبيهًا واحدًا يضيع**: يصل الساعة الحادية عشرة ليلًا وأنت نائم،
// فتصحو وقد ذهب من فوق الشاشة ولا شيء يعيده. وسرعة الردّ هي الصفقة في هذه المهنة.
//
// فهذه تلاحق: الطلبُ يبقى في المخزن حتى تُدخله أو تصرفه من التطبيق، فبقاؤه **هو** علامة
// أنه لم يُردَّ عليه. ويُنبَّه عليه مرّتين لا أكثر (بعد نصف ساعة وبعد أربع)، ثم يُترك —
// فبعد يومين لم يعد خبرًا، وهو ظاهرٌ في «يومي» وفي صفحة النشر على كل حال. والملاحقةُ التي
// لا تنتهي تُعلّمك تجاهلها، فتضيع معها الطلبات الحقيقية.

import { getStore } from '@netlify/blobs';
import webpush from 'web-push';
import { notifyAll } from '../lib/notify.js';

const STORE = 'kassab-push';
const PREFIX = 'sub/';
const GRACE_HOURS = 24; // لا تُرسل تذكيرًا فات موعده بأكثر من يوم (تنبيه متأخر جدًا لا ينفع)

const PUBLIC_STORE = 'kassab-public';
const LEAD_PREFIX = 'lead/';
const BOOKING_PREFIX = 'booking/';
const NUDGE_KEY = 'nudge/state';
/** مراحل الملاحقة بالدقائق، ثم يُترك. */
export const NUDGE_STAGES = [30, 240];
/** بعد يومين لم يعد الطلب خبرًا يُنبَّه عليه. */
export const NUDGE_GIVE_UP_MINUTES = 48 * 60;

/**
 * التذكيرات المستحقة الآن لاشتراك واحد — دالة خالصة (لا شبكة ولا تخزين) كي تُختبر وحدها.
 * الشروط الثلاثة: لم يُرسل من قبل · حان وقته · ولم يفت بأكثر من GRACE_HOURS.
 */
export function selectDue(rec, now = Date.now()) {
  const sent = new Set(rec?.sent || []);
  return (rec?.reminders || []).filter((r) => {
    if (sent.has(r.id)) return false;
    const at = new Date(r.dueAt).getTime();
    return Number.isFinite(at) && at <= now && now - at <= GRACE_HOURS * 3600000;
  });
}

/**
 * الطلبات التي حان وقت ملاحقتها — دالة خالصة (لا شبكة ولا تخزين) كي تُختبر وحدها.
 *
 * @param {Array<{id, createdAt}>} pending الطلبات الباقية في المخزن (أي: لم يُردَّ عليها)
 * @param {Record<string, number>} sentStage آخر مرحلةٍ أُرسلت لكل طلب
 * @returns {Array<{ id, stage, minutes }>}
 */
export function selectStaleLeads(pending = [], sentStage = {}, now = Date.now()) {
  const out = [];
  for (const rec of pending) {
    const at = new Date(rec?.createdAt || 0).getTime();
    if (!Number.isFinite(at) || !rec?.id) continue;
    const minutes = (now - at) / 60000;
    if (minutes > NUDGE_GIVE_UP_MINUTES) continue;
    // أعلى مرحلةٍ استحقّت الآن — فإن غاب التطبيق يومًا لم تصل مرحلتان متتاليتان معًا.
    let stage = 0;
    for (let i = 0; i < NUDGE_STAGES.length; i++) if (minutes >= NUDGE_STAGES[i]) stage = i + 1;
    if (!stage || (sentStage[rec.id] || 0) >= stage) continue;
    out.push({ id: rec.id, stage, minutes: Math.round(minutes) });
  }
  return out;
}

/** ينظّف حالة الملاحقة من طلباتٍ لم تعد موجودة (رُدّ عليها أو صُرفت). */
export function pruneNudgeState(state = {}, liveIds = []) {
  const live = new Set(liveIds);
  const out = {};
  for (const [id, stage] of Object.entries(state)) if (live.has(id)) out[id] = stage;
  return out;
}

/** ملاحقة الطلبات والحجوزات التي لم يُردَّ عليها. */
async function nudgeStaleLeads() {
  const store = getStore({ name: PUBLIC_STORE, consistency: 'strong' });
  const pending = [];
  for (const prefix of [LEAD_PREFIX, BOOKING_PREFIX]) {
    const { blobs } = await store.list({ prefix });
    for (const blob of blobs) {
      const rec = await store.get(blob.key, { type: 'json' });
      if (rec?.id && rec.createdAt) pending.push({ id: rec.id, createdAt: rec.createdAt, kind: prefix === LEAD_PREFIX ? 'lead' : 'booking' });
    }
  }
  const state = (await store.get(NUDGE_KEY, { type: 'json' })) || {};
  const due = selectStaleLeads(pending, state, Date.now());
  const next = pruneNudgeState(state, pending.map((p) => p.id));

  if (due.length) {
    const hours = Math.floor(Math.max(...due.map((d) => d.minutes)) / 60);
    await notifyAll({
      title: due.length === 1 ? 'طلبٌ لم يُردَّ عليه' : `${due.length} طلبات لم يُردَّ عليها`,
      body: hours >= 1 ? `أقدمها منذ ${hours} ساعة — افتح «يومي».` : 'وصل قبل نصف ساعة ولم يُفتح بعد.',
      url: '/#/today',
      tag: 'kassab-stale-leads',
    });
    for (const d of due) next[d.id] = d.stage;
  }
  await store.setJSON(NUDGE_KEY, next);
  return due.length;
}

export default async () => {
  const publicKey = process.env.VAPID_PUBLIC;
  const privateKey = process.env.VAPID_PRIVATE;
  if (!publicKey || !privateKey) return new Response('VAPID غير مضبوط', { status: 200 });
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:noreply@example.com', publicKey, privateKey);

  const store = getStore({ name: STORE, consistency: 'strong' });
  const { blobs } = await store.list({ prefix: PREFIX });
  const now = Date.now();
  let sentCount = 0;

  for (const blob of blobs) {
    const rec = await store.get(blob.key, { type: 'json' });
    if (!rec?.subscription) continue;
    const sent = new Set(rec.sent || []);
    const due = selectDue(rec, now);
    if (!due.length) continue;

    const payload = JSON.stringify(due.length === 1
      ? { title: 'تذكير مستحق', body: 'لديك مهمة مستحقة الآن.', url: `/#/tasks/${due[0].id}`, tag: `kassab-task-${due[0].id}` }
      : { title: 'تذكيرات مستحقة', body: `${due.length} مهام مستحقة الآن.`, url: '/#/tasks', tag: 'kassab-tasks' });

    try {
      await webpush.sendNotification(rec.subscription, payload);
      sentCount += due.length;
      for (const r of due) sent.add(r.id);
      await store.setJSON(blob.key, { ...rec, sent: [...sent] });
    } catch (err) {
      // 404/410 = اشتراك لم يعد صالحًا (أُلغي الإذن أو حُذف التطبيق) فيُنظَّف.
      if (err?.statusCode === 404 || err?.statusCode === 410) await store.delete(blob.key);
      else console.warn('تعذر إرسال تنبيه', err?.statusCode || err?.message);
    }
  }

  // الملاحقة مستقلّة عن التذكيرات: فشلُها لا يمنع تذكيرًا استُحقّ، والعكس.
  let nudged = 0;
  try { nudged = await nudgeStaleLeads(); }
  catch (err) { console.warn('تعذرت ملاحقة الطلبات', err?.message); }

  return new Response(JSON.stringify({ ok: true, sent: sentCount, nudged, subscriptions: blobs.length }), {
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
};

// كل ٥ دقائق: دقة كافية للتذكير، و٨٬٦٤٠ استدعاء شهريًا من أصل ١٢٥ ألفًا مجانية.
export const config = { schedule: '*/5 * * * *' };
