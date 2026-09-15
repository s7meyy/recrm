// حجز موعد من الصفحة العامة (المرحلة ٢٩).
//
// يختار العميل وقتًا من **أوقاتك أنت** بدل تبادل رسائل «متى يناسبك؟». وإعدادات أوقاتك
// تصل إلى هنا مع لقطة النشر نفسها (`snapshot.booking`)، فلا مصدر ثانٍ يمكن أن يخالفها.
//
// ثلاثة قيود:
//   • **الخادم يولّد الأوقات ويقبلها**؛ الصفحة تعرض ما يعطيها. وحجزُ وقتٍ ليس في المجموعة
//     المولَّدة يُرفض — فتعديل الصفحة في المتصفح لا يفتح لك بابًا.
//   • **الحجز مغلق حتى تفتحه** (`booking.enabled`): لا يُفتح تقويمك للناس بلا قرارك.
//   • الحماية نفسها: فخّ، وحدّ معدّل لكل IP، وحدود طول — لا حساب ولا خدمة خارجية.

import { getStore } from '@netlify/blobs';
import { signedIn, unauthorized } from '../lib/auth.js';
import { buildSlots, slotAllowed, localParts, DAY_NAMES } from '../lib/slots.js';
import { notifyAll } from '../lib/notify.js';

const STORE = 'kassab-public';
const PREFIX = 'booking/';
const RATE_PREFIX = 'brate/';
const MAX_PER_HOUR = 4;

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

const CONTROL_CHARS = /[\p{Cc}]/gu;
const clean = (value, max) => String(value ?? '').replace(CONTROL_CHARS, ' ').trim().slice(0, max);

const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
function normalizePhone(raw) {
  const digits = String(raw ?? '')
    .replace(/[٠-٩]/g, (d) => String(ARABIC_DIGITS.indexOf(d)))
    .replace(/\D/g, '');
  if (/^9665\d{8}$/.test(digits)) return `0${digits.slice(3)}`;
  if (/^05\d{8}$/.test(digits)) return digits;
  if (/^5\d{8}$/.test(digits)) return `0${digits}`;
  return '';
}

async function rateLimited(store, ip) {
  if (!ip) return false;
  const hour = new Date().toISOString().slice(0, 13);
  const key = `${RATE_PREFIX}${hour}/${ip.replace(/[^\w.:-]/g, '')}`;
  const count = (await store.get(key, { type: 'json' }))?.n || 0;
  if (count >= MAX_PER_HOUR) return true;
  await store.setJSON(key, { n: count + 1 });
  return false;
}

/** المواعيد المحجوزة الحيّة — الماضي منها لا يشغل وقتًا ولا يُقرأ. */
async function loadBookings(store) {
  const { blobs } = await store.list({ prefix: PREFIX });
  const out = [];
  for (const blob of blobs) {
    const rec = await store.get(blob.key, { type: 'json' });
    if (rec?.at) out.push(rec);
  }
  return out.sort((a, b) => String(a.at).localeCompare(String(b.at)));
}

export default async (request) => {
  const store = getStore({ name: STORE, consistency: 'strong' });
  const url = new URL(request.url);
  const snapshot = await store.get('snapshot', { type: 'json' });
  const booking = snapshot?.booking || null;

  /* قراءة المواعيد المحجوزة — للمالك وحده */
  if (request.method === 'GET' && url.searchParams.get('admin') === '1') {
    if (!(await signedIn(request))) return unauthorized();
    return json({ bookings: (await loadBookings(store)).slice(0, 200) });
  }

  /* الأوقات المتاحة — عامّة بقصد */
  if (request.method === 'GET') {
    if (!booking?.enabled) return json({ enabled: false, slots: [], office: snapshot?.office || {} });
    const taken = (await loadBookings(store)).map((b) => b.at);
    return json({
      enabled: true,
      place: clean(booking.place, 120),
      slotMinutes: Number(booking.slotMinutes) || 30,
      dayNames: DAY_NAMES,
      office: snapshot?.office || {},
      slots: buildSlots(booking, taken).slice(0, 200),
    });
  }

  if (request.method === 'POST') {
    if (!booking?.enabled) return json({ error: 'الحجز مغلق حاليًا' }, 400);
    const body = await request.json().catch(() => null);
    if (!body) return json({ error: 'طلب غير صالح' }, 400);
    if (clean(body.website, 80)) return json({ ok: true }); // الفخّ: نجاح صامت

    const phone = normalizePhone(body.phone);
    if (!phone) return json({ error: 'اكتب رقم جوال سعودي صحيح' }, 400);

    const ip = request.headers.get('x-nf-client-connection-ip') || request.headers.get('x-forwarded-for') || '';
    if (await rateLimited(store, ip.split(',')[0].trim())) return json({ error: 'حاول بعد قليل' }, 429);

    const taken = (await loadBookings(store)).map((b) => b.at);
    const at = String(body.at || '');
    if (!slotAllowed(at, booking, taken)) {
      return json({ error: 'هذا الوقت لم يعد متاحًا — اختر غيره' }, 409);
    }

    const parts = localParts(new Date(at).getTime());
    const rec = {
      id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
      at: new Date(at).toISOString(),
      name: clean(body.name, 60),
      phone,
      note: clean(body.note, 300),
      ref: clean(body.ref, 12),
      createdAt: new Date().toISOString(),
    };
    await store.setJSON(PREFIX + rec.id, rec);
    await notifyAll({
      title: 'موعد جديد محجوز',
      body: `${DAY_NAMES[parts.dow]} ${parts.date} — ${parts.time}`,
      url: '/#/publish',
      tag: 'kassab-booking',
    }).catch(() => {});
    return json({ ok: true, at: rec.at });
  }

  /* حذف موعد — للمالك وحده */
  if (request.method === 'DELETE') {
    if (!(await signedIn(request))) return unauthorized();
    const body = await request.json().catch(() => null);
    if (body?.id) await store.delete(PREFIX + String(body.id).replace(/[^\w-]/g, ''));
    return json({ ok: true });
  }

  return json({ error: 'طريقة غير مدعومة' }, 405);
};

export const config = { path: '/api/book' };
