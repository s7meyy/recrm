// قراءة اللقطة المنشورة — عامّة بقصد (هذه هي الصفحة التي تُعرض على العميل بلا تسجيل دخول).

import { getStore } from '@netlify/blobs';

export default async () => {
  const store = getStore({ name: 'kassab-public', consistency: 'strong' });
  const snapshot = await store.get('snapshot', { type: 'json' });
  return new Response(JSON.stringify(snapshot || { publishedAt: null, office: {}, intro: '', listings: [] }), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      // يجب التحقّق في كل مرة: التخزين المؤقت هنا كان يُبقي عرضًا سحبتَه ظاهرًا للعميل
      // دقيقة كاملة بعد إعادة النشر (ثبت فعليًا في الاختبار). الملف صغير، والصور — وهي الثقل
      // الحقيقي — مخزَّنة سنة كاملة بمعرّفاتها الثابتة في دالة media.
      'cache-control': 'public, max-age=0, must-revalidate',
    },
  });
};

export const config = { path: '/api/listings' };
