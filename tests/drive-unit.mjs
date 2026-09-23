// نسخ درايف (المرحلة ٥٦) — بجوجل مزيَّف: جوجل الحقيقي لا يُبلغ من بيئة الاختبار، والدالة
// تأخذ `fetch` مُعاملًا فيُختبر مسارها كاملًا: الرمز والمجلد والرفع والتقليم والأعطاب.
import { getStore } from '@netlify/blobs';
const {
  runDriveBackup, driveStatus, latestCompleteBatch, missingEnv, driveFileName, DRIVE_KEEP, FOLDER_NAME,
} = await import('../netlify/lib/drive.js');
const ok = (n, c, x = '') => console.log(`${c ? 'PASS' : 'FAIL'} — ${n}${x ? ' :: ' + x : ''}`);

const ENV = { GDRIVE_CLIENT_ID: 'cid', GDRIVE_CLIENT_SECRET: 'csec', GDRIVE_REFRESH_TOKEN: 'rtok' };

/** جوجل مزيَّف في الذاكرة: يسجّل كل طلب، ويحفظ الملفات كما يحفظها درايف. */
function fakeGoogle({ tokenError = null, existing = [] } = {}) {
  const calls = [];
  const files = new Map(existing.map((f) => [f.id, f]));
  let seq = 0;
  const reply = (body, status = 200, headers = {}) => new Response(body == null ? null : JSON.stringify(body), { status, headers });
  const f = async (url, opt = {}) => {
    const method = opt.method || 'GET';
    calls.push({ url: String(url), method, body: opt.body, headers: opt.headers || {} });
    const u = new URL(url);
    if (u.host === 'oauth2.googleapis.com') {
      if (tokenError) return reply({ error: tokenError, error_description: 'Token has been expired or revoked.' }, 400);
      const p = new URLSearchParams(opt.body);
      return p.get('refresh_token') === 'rtok' ? reply({ access_token: 'AT', expires_in: 3599 }) : reply({ error: 'invalid_grant' }, 400);
    }
    if (opt.headers?.authorization !== 'Bearer AT' && !u.pathname.startsWith('/session/')) return reply({ error: { message: 'no auth' } }, 401);
    if (u.pathname === '/drive/v3/files' && method === 'POST') {
      const meta = JSON.parse(opt.body);
      const id = `folder${++seq}`;
      files.set(id, { id, ...meta, createdTime: new Date(Date.now() + seq).toISOString() });
      return reply({ id });
    }
    if (u.pathname.startsWith('/drive/v3/files/') && method === 'GET') {
      const got = files.get(decodeURIComponent(u.pathname.split('/').pop()));
      return got ? reply({ id: got.id, trashed: !!got.trashed }) : reply({ error: { message: 'not found' } }, 404);
    }
    if (u.pathname.startsWith('/drive/v3/files/') && method === 'DELETE') {
      files.delete(decodeURIComponent(u.pathname.split('/').pop()));
      return new Response(null, { status: 204 });
    }
    if (u.pathname === '/drive/v3/files' && method === 'GET') {
      const parent = /'([^']+)' in parents/.exec(u.searchParams.get('q'))[1];
      const list = [...files.values()].filter((x) => x.parents?.includes(parent) && !x.trashed)
        .sort((a, b) => b.createdTime.localeCompare(a.createdTime));
      return reply({ files: list.map(({ id, name, createdTime }) => ({ id, name, createdTime })) });
    }
    if (u.pathname === '/upload/drive/v3/files' && method === 'POST') {
      const meta = JSON.parse(opt.body);
      const sid = `s${++seq}`;
      files.set(`pending-${sid}`, meta);
      return reply({}, 200, { location: `https://www.googleapis.com/session/${sid}` });
    }
    if (u.pathname.startsWith('/session/') && method === 'PUT') {
      const sid = u.pathname.split('/').pop();
      const meta = files.get(`pending-${sid}`);
      files.delete(`pending-${sid}`);
      const id = `file${++seq}`;
      files.set(id, { id, ...meta, content: opt.body, createdTime: new Date(Date.now() + seq * 1000).toISOString() });
      return reply({ id, name: meta.name, size: String(opt.body.length) });
    }
    return reply({ error: { message: `unexpected ${method} ${u.pathname}` } }, 500);
  };
  return { f, calls, files };
}

const put = async (store, key, payload, meta) => store.set(key, payload, { metadata: { size: payload.length, ...meta } });

// ——— الدالة الخالصة: أحدث دفعةٍ كاملة ———
const metas = [
  { key: 'backup/a1', at: '2026-09-20T10:00:00Z', batch: 'A', part: 1, parts: 2 },
  { key: 'backup/a2', at: '2026-09-20T10:00:03Z', batch: 'A', part: 2, parts: 2, counts: { clients: 3 } },
  { key: 'backup/b1', at: '2026-09-22T10:00:00Z', batch: 'B', part: 1, parts: 3 }, // ناقصة
  { key: 'backup/c', at: '2026-09-19T10:00:00Z', batch: 'C' },
];
const latest = latestCompleteBatch(metas);
ok('يختار أحدث دفعةٍ كاملة ويتخطّى الناقصة', latest?.batch === 'A', latest?.batch);
ok('وكتلها بترتيبها', latest.parts.map((p) => p.key).join() === 'backup/a1,backup/a2');
ok('والعدّاد من أيّ كتلةٍ حملته', latest.counts?.clients === 3);
ok('ولا دفعة كاملة ← لا شيء', latestCompleteBatch([metas[2]]) === null);
ok('المتغيّرات الناقصة بأسمائها', missingEnv({ GDRIVE_CLIENT_ID: 'x', GDRIVE_REFRESH_TOKEN: '  ' }).join() === 'GDRIVE_CLIENT_SECRET,GDRIVE_REFRESH_TOKEN');
ok('اسم الملف بتوقيت الرياض', driveFileName('2026-09-22T22:30:00Z') === 'kassab-backup-2026-09-23-0130.json', driveFileName('2026-09-22T22:30:00Z'));

// ——— بلا متغيّرات: لا شبكة ولا حالةٌ مزيّفة ———
{
  const store = getStore({ name: 'drive-t0' });
  const g = fakeGoogle();
  const r = await runDriveBackup({ store, env: {}, fetch: g.f });
  ok('بلا متغيّرات: NOT_CONFIGURED بأسمائها الثلاثة', r.notConfigured && r.missing.length === 3, JSON.stringify(r));
  ok('ولا يتّصل بجوجل أصلًا', g.calls.length === 0);
  const st = await driveStatus({ store, env: {} });
  ok('والحالة تقول غير مهيّأ', st.configured === false && st.lastAt === null);
}

// ——— لا نسخة في الخزنة ———
{
  const store = getStore({ name: 'drive-t1' });
  const g = fakeGoogle();
  const r = await runDriveBackup({ store, env: ENV, fetch: g.f });
  ok('خزنةٌ فارغة: يقول ذلك ولا يرفع ملفًّا فارغًا', !r.ok && r.noBackup && g.calls.length === 0, r.error);
}

// ——— المسار الكامل ———
const store = getStore({ name: 'drive-t2' });
await put(store, 'backup/2026-09-22T10:00:00Z-001', 'ENC-PART-1', { at: '2026-09-22T10:00:00Z', batch: 'X', part: 1, parts: 2, counts: { clients: 7 } });
await put(store, 'backup/2026-09-22T10:00:02Z-002', 'ENC-PART-2', { at: '2026-09-22T10:00:02Z', batch: 'X', part: 2, parts: 2 });
const g = fakeGoogle();
const r1 = await runDriveBackup({ store, env: ENV, fetch: g.f, now: new Date('2026-09-22T23:00:00Z') });
ok('ينسخ بنجاح', r1.ok && r1.fileId, JSON.stringify(r1));
const tokenCall = g.calls[0];
ok('يطلب رمز الدخول برمز التحديث', tokenCall.url.includes('oauth2.googleapis.com/token') && new URLSearchParams(tokenCall.body).get('grant_type') === 'refresh_token');
const folder = [...g.files.values()].find((x) => x.mimeType === 'application/vnd.google-apps.folder');
ok('يُنشئ مجلده باسمه', folder?.name === FOLDER_NAME, folder?.name);
const uploaded = [...g.files.values()].find((x) => x.name?.startsWith('kassab-backup-'));
ok('والملف داخل المجلد', uploaded?.parents?.[0] === folder.id);
const body = JSON.parse(uploaded.content);
ok('والملف يحمل الكتل المشفّرة كما هي وبترتيبها', body.parts.join('|') === 'ENC-PART-1|ENC-PART-2' && body.format === 'kassab-drive-1' && body.encrypted === true);
ok('ولا يحمل سرًّا من الأسرار الثلاثة', !/cid|csec|rtok|AT\b/.test(uploaded.content));
ok('يستعمل الرفع القابل للاستئناف', g.calls.some((c) => c.url.includes('uploadType=resumable')));
const st1 = await driveStatus({ store, env: ENV });
ok('والحالة تحفظ آخر نسخٍ واسم ملفه', st1.configured && st1.lastAt === '2026-09-22T23:00:00.000Z' && st1.lastFileName === uploaded.name && !st1.lastError, JSON.stringify(st1));
ok('والحالة لا تكشف معرّف المجلد ولا الملف', !('folderId' in st1) && !('lastFileId' in st1));

// الليلة التالية بلا دفعةٍ جديدة: لا يكرّر
const before = g.calls.length;
const r2 = await runDriveBackup({ store, env: ENV, fetch: g.f });
ok('الدفعة نفسها لا تُنسخ مرّتين', r2.ok && r2.skipped === 'already' && g.calls.length === before, JSON.stringify(r2));
// و«انسخ الآن» يفرض
const r3 = await runDriveBackup({ store, env: ENV, fetch: g.f, force: true });
const folders = [...g.files.values()].filter((x) => x.mimeType === 'application/vnd.google-apps.folder');
ok('«انسخ الآن» يرفع ولو نُسخت، في المجلد نفسه', r3.ok && folders.length === 1);

// حذفتَ المجلد: يُنشأ من جديد
folder.trashed = true;
await put(store, 'backup/2026-09-23T10:00:00Z', 'ENC-NEW', { at: '2026-09-23T10:00:00Z', batch: 'Y' });
const r4 = await runDriveBackup({ store, env: ENV, fetch: g.f });
const live = [...g.files.values()].filter((x) => x.mimeType === 'application/vnd.google-apps.folder' && !x.trashed);
ok('مجلدٌ في المهملات يُعوَّض بمجلدٍ جديد', r4.ok && live.length === 1 && live[0].id !== folder.id);

// التقليم: يبقى DRIVE_KEEP، والأقدم يذهب، وملفٌّ وضعتَه أنت بيدك لا يُمسّ
{
  const s = getStore({ name: 'drive-t3' });
  await put(s, 'backup/2026-09-23T10:00:00Z', 'E', { at: '2026-09-23T10:00:00Z', batch: 'Z' });
  const existing = [{ id: 'F', mimeType: 'application/vnd.google-apps.folder', name: FOLDER_NAME, createdTime: '2026-01-01T00:00:00Z' }];
  for (let i = 0; i < DRIVE_KEEP + 3; i++) {
    existing.push({ id: `old${i}`, name: `kassab-backup-2026-08-${String(i + 1).padStart(2, '0')}-0200.json`, parents: ['F'], createdTime: new Date(Date.parse('2026-08-01T00:00:00Z') + i * 86400000).toISOString() });
  }
  existing.push({ id: 'mine', name: 'ملاحظاتي.txt', parents: ['F'], createdTime: '2026-07-01T00:00:00Z' });
  await s.setJSON('drive/state', { folderId: 'F' });
  const g2 = fakeGoogle({ existing });
  const r = await runDriveBackup({ store: s, env: ENV, fetch: g2.f });
  const ours = [...g2.files.values()].filter((x) => /^kassab-backup-/.test(x.name || ''));
  ok(`يبقي آخر ${DRIVE_KEEP} ويحذف الأقدم`, r.ok && ours.length === DRIVE_KEEP && r.pruned === 4, `${ours.length} · pruned ${r.pruned}`);
  ok('والأقدم هو الذي ذهب', !g2.files.has('old0') && !g2.files.has('old3') && g2.files.has('old4'));
  ok('وملفٌّ ليس من نسخه لا يُمسّ', g2.files.has('mine'));
}

// رمزٌ منتهٍ: رسالةٌ تقول ماذا يُفعل، وتُحفظ فتظهر في الإعدادات
{
  const s = getStore({ name: 'drive-t4' });
  await put(s, 'backup/2026-09-23T10:00:00Z', 'E', { at: '2026-09-23T10:00:00Z', batch: 'Q' });
  const g3 = fakeGoogle({ tokenError: 'invalid_grant' });
  const r = await runDriveBackup({ store: s, env: ENV, fetch: g3.f });
  ok('رمزٌ منتهٍ يُقال بما يُصلحه', !r.ok && /In production/.test(r.error) && /GDRIVE_REFRESH_TOKEN/.test(r.error), r.error);
  const st = await driveStatus({ store: s, env: ENV });
  ok('والعطب محفوظ في الحالة', st.lastError === r.error && st.lastErrorAt);
  ok('ولا يُحسب نسخًا ناجحًا', st.lastAt === null);
  // وبعد إصلاحه يُمحى العطب
  const r2 = await runDriveBackup({ store: s, env: ENV, fetch: fakeGoogle().f });
  const st2 = await driveStatus({ store: s, env: ENV });
  ok('وبعد الإصلاح يُمحى العطب', r2.ok && st2.lastError === null && st2.lastAt);
}

// الدالة المجدولة: مرّة يوميًا
const tick = await import('../netlify/functions/drive-tick.js');
ok('الدالة المجدولة يوميًا (٢ فجرًا بالرياض)', tick.config?.schedule === '0 23 * * *', tick.config?.schedule);
