// «من أنا؟» (المرحلة ٣٥): يقرأ التطبيق دوره من هنا.
//
// الكوكي `HttpOnly` بقصد — لا تصلها جافاسكربت، فلا تُسرق بثغرة نصّية. فلا يعرف التطبيق
// دوره إلا بسؤال الخادم. والجواب لا يحمل سرًّا: اسم دورٍ لا أكثر.

import { roleOf } from '../lib/auth.js';

export default async (request) => new Response(JSON.stringify({ role: await roleOf(request) }), {
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

export const config = { path: '/api/me' };
