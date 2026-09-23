// نسخ الخزنة إلى Google Drive كل يوم (المرحلة ٥٦).
//
// **لا يُرفع إلى درايف شيءٌ مقروء**: ما يُنسخ هو دفعة الخزنة كما هي — مشفَّرةً في متصفحك
// بعبارتك قبل أن تصل الخادم أصلًا (المرحلة ٣٥). فلا جوجل ولا Netlify يقرأ منها حرفًا،
// وضياعُ حساب درايف لا يكشف بياناتك. وضياعُ العبارة يعني أن النسخة لا تُفكّ — هنا ولا هناك.
//
// **والدخول بحسابك أنت لا بـ«حساب خدمة»**: حساب الخدمة في جوجل لا مساحة له في درايف الشخصي،
// فيرفض الرفع أو يرفع إلى درايفٍ لا تراه. فالطريق رمزُ تحديثٍ (refresh token) من حسابك،
// بصلاحية `drive.file` وحدها: **يرى ما أنشأه هو فقط** ولا يرى بقية ملفاتك، ولا يحتاج مراجعة جوجل.
//
// والأسرار الثلاثة في متغيّرات Netlify وحدها، لا في المستودع ولا في الجهاز ولا في النسخة.

const STATE_KEY = 'drive/state';
const PREFIX = 'backup/';
export const DRIVE_KEEP = 30; // شهرٌ من النسخ اليومية، والأقدم يُحذف من المجلد
export const FOLDER_NAME = 'كسّاب — نسخ احتياطية';
export const DRIVE_FORMAT = 'kassab-drive-1';
export const DRIVE_ENV = ['GDRIVE_CLIENT_ID', 'GDRIVE_CLIENT_SECRET', 'GDRIVE_REFRESH_TOKEN'];

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';

/** ما ينقص من المتغيّرات — بأسمائها، فالرسالة تقول ماذا يُضاف لا «غير مهيّأ» وحدها. */
export function missingEnv(env = process.env) {
  return DRIVE_ENV.filter((k) => !String(env[k] || '').trim());
}

/**
 * أحدث دفعةٍ **كاملة** في الخزنة — دالة خالصة على البيانات الوصفية كي تُختبر وحدها.
 * والناقصة لا تُنسخ: نصف نسخةٍ في درايف أسوأ من لا شيء، لأنك تحسبها نسخة.
 */
export function latestCompleteBatch(metas = []) {
  const map = new Map();
  for (const m of metas) {
    const id = m.batch || m.key;
    if (!map.has(id)) map.set(id, []);
    map.get(id).push(m);
  }
  const batches = [...map.entries()].map(([batch, list]) => {
    const parts = list.slice().sort((a, b) => (a.part ?? 0) - (b.part ?? 0));
    const expected = parts[0]?.parts ?? parts.length;
    return {
      batch, parts, at: parts[0].at,
      counts: parts.find((p) => p.counts)?.counts || null,
      complete: parts.length === expected,
    };
  }).filter((b) => b.complete);
  batches.sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
  return batches[0] || null;
}

/** اسم الملف في درايف: تاريخه بتوقيت الرياض، فيُقرأ في القائمة بلا فتح. */
export function driveFileName(at) {
  const d = new Date(new Date(at).getTime() + 3 * 3600000).toISOString();
  return `kassab-backup-${d.slice(0, 10)}-${d.slice(11, 13)}${d.slice(14, 16)}.json`;
}

/** يترجم خطأ جوجل إلى ما يُفعل — «invalid_grant» وحدها لا تدلّ صاحب مكتب على شيء. */
function googleError(status, body, step) {
  const code = body?.error?.status || body?.error || '';
  const detail = body?.error?.message || body?.error_description || '';
  if (code === 'invalid_grant') {
    return 'رفض جوجل رمز التحديث: انتهى أو أُلغي. إن كانت شاشة الموافقة في وضع «Testing» فالرمز يموت بعد ٧ أيام — '
      + 'انقلها إلى «In production» ثم استخرج رمزًا جديدًا وضعه في GDRIVE_REFRESH_TOKEN.';
  }
  if (code === 'invalid_client' || code === 'unauthorized_client') {
    return 'رفض جوجل بيانات التطبيق: تحقّق من GDRIVE_CLIENT_ID وGDRIVE_CLIENT_SECRET، وأن الرمز استُخرج بالعميل نفسه.';
  }
  if (status === 403 && /storage|quota/i.test(detail)) return 'مساحة درايف ممتلئة — أفرغ مساحةً أو احذف نسخًا قديمة.';
  if (status === 403) return `رفض جوجل الإذن (${step}): تأكّد أن واجهة Google Drive API مفعّلة في مشروعك وأن الرمز بصلاحية drive.file.`;
  return `تعذّر ${step} في درايف (${status}${detail ? `: ${detail}` : ''})`;
}

async function readJson(res) {
  return res.json().catch(() => ({}));
}

/**
 * ينسخ أحدث دفعةٍ كاملة من الخزنة إلى درايف.
 *
 * @param {object} o
 * @param {object} o.store   مخزن الخزنة (`kassab-vault`)
 * @param {object} [o.env]   المتغيّرات (للاختبار)
 * @param {Function} [o.fetch] (للاختبار: جوجل غير متاح من بيئة الاختبار)
 * @param {boolean} [o.force] ارفع ولو كانت الدفعة نفسها قد رُفعت
 * @returns {Promise<object>} النتيجة، وتُحفظ حالتها ليُعرض آخر نجاحٍ أو فشل في الإعدادات
 */
export async function runDriveBackup({ store, env = process.env, fetch: f = globalThis.fetch, force = false, now = new Date() }) {
  const state = (await store.get(STATE_KEY, { type: 'json' })) || {};
  const missing = missingEnv(env);
  if (missing.length) return { ok: false, notConfigured: true, missing };

  const save = async (patch) => {
    Object.assign(state, patch, { lastRunAt: now.toISOString() });
    await store.setJSON(STATE_KEY, state);
    return state;
  };

  try {
    const { blobs } = await store.list({ prefix: PREFIX });
    const metas = [];
    for (const b of blobs) {
      const meta = await store.getMetadata(b.key);
      metas.push({ key: b.key, ...(meta?.metadata || {}) });
    }
    const picked = latestCompleteBatch(metas);
    if (!picked) {
      await save({ lastError: 'لا توجد نسخة سحابية كاملة لتُنسخ — فعّل «ارفع نسخة تلقائيًا» في الإعدادات أو ارفع نسخة الآن.', lastErrorAt: now.toISOString() });
      return { ok: false, noBackup: true, error: state.lastError };
    }
    if (!force && state.lastBatch === picked.batch) {
      await save({});
      return { ok: true, skipped: 'already', fileName: state.lastFileName, at: state.lastAt };
    }

    // ١) رمز دخولٍ قصير العمر من رمز التحديث.
    const tokRes = await f(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: env.GDRIVE_CLIENT_ID.trim(),
        client_secret: env.GDRIVE_CLIENT_SECRET.trim(),
        refresh_token: env.GDRIVE_REFRESH_TOKEN.trim(),
      }).toString(),
    });
    const tok = await readJson(tokRes);
    if (!tokRes.ok || !tok.access_token) throw new Error(googleError(tokRes.status, tok, 'الدخول'));
    const auth = { authorization: `Bearer ${tok.access_token}` };

    // ٢) المجلد: يُنشأ مرّةً ويُحفظ معرّفه. وإن حذفتَه أو رميتَه في المهملات يُنشأ من جديد.
    let folderId = state.folderId || null;
    if (folderId) {
      const r = await f(`${API}/files/${encodeURIComponent(folderId)}?fields=id,trashed`, { headers: auth });
      const j = await readJson(r);
      if (!r.ok || j.trashed) folderId = null;
    }
    if (!folderId) {
      const r = await f(`${API}/files?fields=id`, {
        method: 'POST',
        headers: { ...auth, 'content-type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ name: FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' }),
      });
      const j = await readJson(r);
      if (!r.ok || !j.id) throw new Error(googleError(r.status, j, 'إنشاء المجلد'));
      folderId = j.id;
    }

    // ٣) الملف: الكتل المشفَّرة كما هي، في ملفٍ واحد يُسترجع من «النسخ الاحتياطي» في الإعدادات.
    const parts = [];
    for (const p of picked.parts) parts.push(await store.get(p.key, { type: 'text' }));
    const content = JSON.stringify({
      app: 'kassab', format: DRIVE_FORMAT, at: picked.at, batch: picked.batch,
      counts: picked.counts, encrypted: true, parts,
    });
    const fileName = driveFileName(picked.at || now.toISOString());
    // الرفع القابل للاستئناف: لا حدّ خمسة ميغابايت الذي على الرفع البسيط.
    const start = await f(`${UPLOAD}/files?uploadType=resumable&fields=id,name,size`, {
      method: 'POST',
      headers: { ...auth, 'content-type': 'application/json; charset=utf-8', 'x-upload-content-type': 'application/json' },
      body: JSON.stringify({ name: fileName, parents: [folderId], mimeType: 'application/json', description: 'نسخة كسّاب المشفّرة — تُسترجع من الإعدادات بعبارتك' }),
    });
    const location = start.headers.get('location');
    if (!start.ok || !location) throw new Error(googleError(start.status, await readJson(start), 'بدء الرفع'));
    const put = await f(location, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: content });
    const file = await readJson(put);
    if (!put.ok || !file.id) throw new Error(googleError(put.status, file, 'رفع الملف'));

    // ٤) التقليم: ما زاد على DRIVE_KEEP في مجلدنا يُحذف، الأقدم أولًا. وصلاحية drive.file
    // لا ترى إلا ما أنشأه هذا التطبيق — فلا يمسّ ملفًا وضعتَه أنت في المجلد بيدك.
    let pruned = 0;
    const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
    const listRes = await f(`${API}/files?q=${q}&orderBy=createdTime desc&pageSize=200&fields=files(id,name,createdTime)`, { headers: auth });
    if (listRes.ok) {
      const { files = [] } = await readJson(listRes);
      const ours = files.filter((x) => /^kassab-backup-.*\.json$/.test(x.name || ''));
      for (const old of ours.slice(DRIVE_KEEP)) {
        const d = await f(`${API}/files/${encodeURIComponent(old.id)}`, { method: 'DELETE', headers: auth });
        if (d.ok || d.status === 204) pruned++;
      }
    }

    await save({
      folderId, lastBatch: picked.batch, lastAt: now.toISOString(), lastFileName: fileName,
      lastFileId: file.id, lastBytes: content.length, lastError: null, lastErrorAt: null,
    });
    return { ok: true, fileName, fileId: file.id, bytes: content.length, pruned };
  } catch (err) {
    await save({ lastError: err?.message || String(err), lastErrorAt: now.toISOString() });
    return { ok: false, error: state.lastError };
  }
}

/** الحالة كما تُعرض في الإعدادات — بلا أسرارٍ ولا معرّفات تخصّ جوجل. */
export async function driveStatus({ store, env = process.env }) {
  const s = (await store.get(STATE_KEY, { type: 'json' })) || {};
  const missing = missingEnv(env);
  return {
    configured: !missing.length,
    missing,
    keep: DRIVE_KEEP,
    folderName: FOLDER_NAME,
    lastAt: s.lastAt || null,
    lastFileName: s.lastFileName || null,
    lastBytes: s.lastBytes || null,
    lastRunAt: s.lastRunAt || null,
    lastError: s.lastError || null,
    lastErrorAt: s.lastErrorAt || null,
  };
}
