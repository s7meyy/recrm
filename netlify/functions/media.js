// صور العروض المنشورة — عامّة بقصد، وتُقرأ بمعرّف الصورة فقط (لا فهرسة ولا سرد).

import { getStore } from '@netlify/blobs';

export default async (request) => {
  const id = new URL(request.url).searchParams.get('id');
  if (!id || !/^[\w-]+$/.test(id)) return new Response('معرّف غير صالح', { status: 400 });
  const store = getStore({ name: 'kassab-public', consistency: 'strong' });
  const found = await store.getWithMetadata(`img/${id}`, { type: 'arrayBuffer' });
  if (!found?.data) return new Response('غير موجودة', { status: 404 });
  return new Response(found.data, {
    headers: {
      'content-type': found.metadata?.mime || 'image/jpeg',
      // الصورة لا تتغيّر لنفس المعرّف، فيمكن تخزينها طويلًا.
      'cache-control': 'public, max-age=31536000, immutable',
    },
  });
};

export const config = { path: '/api/media' };
