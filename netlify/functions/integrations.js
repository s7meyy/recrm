// نقطة التكاملات الخارجية (المرحلة ٣٧).
//
// GET  → حالة السبعة: أمُهيَّأ كلٌّ منها؟ وما المتغيّرات الناقصة؟ **بلا أي قيمة سرّ.**
// POST → تنفيذ إجراء: `{ integration, action, payload }`.
//
// وهي **للمالك وحده**: تُنفق مالًا (رسائل ورسوم بوّابات وتفريغ)، فلا تُترك لدور المساعد.

import { roleOf, unauthorized, forbidden } from '../lib/auth.js';
import { statusAll, runAction, NOT_CONFIGURED } from '../lib/integrations.js';

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

export default async (request) => {
  const role = await roleOf(request);
  if (!role) return unauthorized();
  if (role !== 'owner') return forbidden('التكاملات للمالك وحده');

  if (request.method === 'GET') return json({ integrations: statusAll() });

  if (request.method === 'POST') {
    const body = await request.json().catch(() => null);
    if (!body?.integration || !body?.action) return json({ error: 'حدّد التكامل والإجراء' }, 400);
    try {
      const result = await runAction(body.integration, body.action, body.payload || {});
      // «لم يُهيَّأ» ليست خطأ خادم: هي حالةٌ معروفة تُعرض للمستخدم بما ينقصها بالضبط.
      if (result?.status === NOT_CONFIGURED) return json(result, 409);
      if (result?.ok === false) return json(result, 400);
      return json(result);
    } catch (err) {
      // رسالة المزوّد تُنقل كما هي: «تعذّر الاتصال» وحدها لا تدلّ على فعل.
      return json({ ok: false, status: 'provider_error', error: err.message }, 502);
    }
  }

  return json({ error: 'طريقة غير مدعومة' }, 405);
};

export const config = { path: '/api/integrations' };
