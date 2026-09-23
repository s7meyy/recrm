// حالة نسخ درايف و«ارفع الآن» (المرحلة ٥٦) — للمالك وحده كالخزنة نفسها.
// الرفع اليومي في `drive-tick.js`؛ وهذه للعرض والتجربة، والمنطق كلّه في `lib/drive.js`.

import { getStore } from '@netlify/blobs';
import { roleOf, unauthorized, forbidden } from '../lib/auth.js';
import { runDriveBackup, driveStatus } from '../lib/drive.js';

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

export default async (request) => {
  const role = await roleOf(request);
  if (!role) return unauthorized();
  if (role !== 'owner') return forbidden('نسخ درايف للمالك وحده');
  const store = getStore({ name: 'kassab-vault', consistency: 'strong' });

  if (request.method === 'GET') return json(await driveStatus({ store }));
  if (request.method === 'POST') {
    const result = await runDriveBackup({ store, force: true });
    if (result.notConfigured) {
      return json({ ...result, error: `NOT_CONFIGURED: ينقص ${result.missing.join('، ')} في متغيّرات Netlify` }, 503);
    }
    return json({ ...result, status: await driveStatus({ store }) }, result.ok ? 200 : 502);
  }
  return json({ error: 'طريقة غير مدعومة' }, 405);
};

export const config = { path: '/api/drive' };
