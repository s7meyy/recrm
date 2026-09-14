// «اطلب معاينة» من الصفحة العامة (المرحلة ٢٢).
//
// كانت الصفحة العامة كتيّبًا: يرى الزائر العروض ولا يستطيع ترك رقمه. هذه الدالة تستقبل
// اسمًا وجوالًا ورسالة قصيرة فتصير الصفحة **مصدر عملاء** لا عرضًا فقط.
//
// الحماية بلا حساب ولا خدمة خارجية:
//   • حقل فخّ (honeypot) لا يراه إنسان — تعبئته تعني آلة، فيُردّ بنجاح صامت ولا يُحفظ شيء.
//   • حدّ معدّل بسيط لكل عنوان IP في الساعة، مخزَّن في Blobs نفسها.
//   • حدود طول صارمة، والنص يُخزَّن كما هو ويُعرض نصًّا في التطبيق (لا HTML).
//
// والقراءة (سحب الطلبات إلى التطبيق) محميّة بكوكي بوابة الدخول.

import { getStore } from '@netlify/blobs';
import { signedIn, unauthorized } from '../lib/auth.js';
import { notifyAll } from '../lib/notify.js';

const STORE = 'kassab-public';
const PREFIX = 'lead/';
const RATE_PREFIX = 'rate/';
const MAX_PER_HOUR = 5;

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

const CONTROL_CHARS = /[\p{Cc}]/gu;
const clean = (value, max) => String(value ?? '').replace(CONTROL_CHARS, ' ').trim().slice(0, max);

const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

/** جوال سعودي بصيغة محلية — نفس قاعدة التطبيق، مكرّرة هنا لأن الدالة لا تستورد كوده. */
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

export default async (request) => {
  const store = getStore({ name: STORE, consistency: 'strong' });

  /* استقبال طلب من زائر — عامّ بلا تسجيل دخول (هذا هو الغرض) */
  if (request.method === 'POST') {
    const body = await request.json().catch(() => null);
    if (!body) return json({ error: 'طلب غير صالح' }, 400);

    // الفخّ: حقل مخفي لا يعبّئه إنسان. نجاح صامت كي لا تتعلّم الآلة أنها كُشفت.
    if (clean(body.website, 80)) return json({ ok: true });

    const phone = normalizePhone(body.phone);
    if (!phone) return json({ error: 'اكتب رقم جوال سعودي صحيح' }, 400);

    const ip = request.headers.get('x-nf-client-connection-ip') || request.headers.get('x-forwarded-for') || '';
    if (await rateLimited(store, ip.split(',')[0].trim())) {
      return json({ error: 'حاول بعد قليل' }, 429);
    }

    const lead = {
      id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
      name: clean(body.name, 60),
      phone,
      note: clean(body.note, 400),
      ref: clean(body.ref, 12), // رقم العرض الذي يسأل عنه، إن جاء من صفحة عرض
      createdAt: new Date().toISOString(),
    };
    await store.setJSON(PREFIX + lead.id, lead);
    // تنبيه فوري بلا تفاصيل: «طلب جديد» ثم تفتح التطبيق فترى الاسم والرقم.
    await notifyAll({
      title: 'طلب جديد من صفحة العروض',
      body: 'زائر ترك رقمه — افتح «الصفحة العامة للعروض».',
      url: '/#/publish',
      tag: 'kassab-lead',
    }).catch(() => {});
    return json({ ok: true });
  }

  /* قراءة الطلبات وحذفها — للمالك وحده */
  if (!(await signedIn(request))) return unauthorized();

  if (request.method === 'GET') {
    const { blobs } = await store.list({ prefix: PREFIX });
    const leads = [];
    for (const blob of blobs) {
      const rec = await store.get(blob.key, { type: 'json' });
      if (rec) leads.push(rec);
    }
    leads.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    return json({ leads: leads.slice(0, 200) });
  }

  if (request.method === 'DELETE') {
    const body = await request.json().catch(() => null);
    if (body?.id) await store.delete(PREFIX + String(body.id).replace(/[^\w-]/g, ''));
    return json({ ok: true });
  }

  return json({ error: 'طريقة غير مدعومة' }, 405);
};

export const config = { path: '/api/lead' };
