// النسخة الاحتياطية السحابية المشفَّرة (المرحلة ١٠) — التشفير كله في المتصفح.
//
// **الخادم لا يرى بياناتك أبدًا:** تُشتقّ مفتاحية AES-GCM من عبارتك السرّية عبر PBKDF2
// (٢٠٠ ألف دورة، SHA-256، ملح عشوائي لكل نسخة)، ويُرفع الناتج المشفَّر وحده.
// نسيان العبارة = فقدان النسخ السحابية نهائيًا — لا يوجد من يستطيع فكّها، ولا نحن.
//
// العبارة تُحفظ في هذا الجهاز (إن اخترت) كي يعمل الرفع التلقائي؛ الخطر المفترض هنا هو ضياع
// الجهاز لا اختراقه محليًا — ومن يملك جهازك المفتوح يرى البيانات نفسها في التطبيق أصلًا.

import { exportBackup, readBackupFile, importBackup, mergeBackup, restoreRisk, importSettings } from './backup.js';

const ENDPOINT = '/api/vault';
const PBKDF2_ROUNDS = 200000;

// حدّ الحجم (المرحلة ٣٥) — نفس حدّ الدالة، مفحوصًا قبل الشبكة كي لا تُشفَّر ميغابايتات
// ثم تُرمى. ودونه بهامش: التشفير يزيد الحجم نحو الثلث (base64 ومغلّف JSON).
export const MAX_PAYLOAD = 4_500_000;
// الصور تُرفع كتلًا، وحجم الكتلة قبل التشفير يُبقي المشفَّر تحت الحدّ.
const IMAGE_CHUNK_BYTES = 3_000_000;
const enc = new TextEncoder();
const dec = new TextDecoder();

const b64 = (bytes) => {
  let bin = '';
  const arr = new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i += 0x8000) bin += String.fromCharCode.apply(null, arr.subarray(i, i + 0x8000));
  return btoa(bin);
};
const unb64 = (text) => {
  const bin = atob(text);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

async function deriveKey(passphrase, salt) {
  const base = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ROUNDS, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
  );
}

/** يشفّر نصًّا ويعيد مغلّفًا يحمل الملح والمتجه — دالة خالصة عدا العشوائية. */
export async function encryptText(plain, passphrase) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt);
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plain));
  return JSON.stringify({ v: 1, alg: 'AES-GCM', kdf: 'PBKDF2', rounds: PBKDF2_ROUNDS, salt: b64(salt), iv: b64(iv), data: b64(cipher) });
}

export async function decryptText(envelope, passphrase) {
  let parsed;
  try { parsed = JSON.parse(envelope); } catch (_) { throw new Error('النسخة المشفَّرة تالفة'); }
  if (parsed?.v !== 1) throw new Error('صيغة النسخة المشفَّرة غير معروفة');
  const key = await deriveKey(passphrase, unb64(parsed.salt));
  let plain;
  try {
    plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(parsed.iv) }, key, unb64(parsed.data));
  } catch (_) {
    throw new Error('العبارة السرّية غير صحيحة لهذه النسخة');
  }
  return dec.decode(plain);
}

async function call(path, options = {}) {
  const res = await fetch(`${ENDPOINT}${path}`, { credentials: 'same-origin', ...options });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) throw new Error('انتهت جلستك — حدّث الصفحة وسجّل الدخول ثم أعد المحاولة');
  if (!res.ok) throw new Error(data.error || `تعذر الاتصال بالخزنة (${res.status})`);
  return data;
}

/** قائمة النسخ المحفوظة سحابيًا (بلا تنزيلها). */
export async function listBackups() {
  return (await call('')).backups || [];
}

const mb = (bytes) => `${Math.round(bytes / 100000) / 10} ميغابايت`;

/**
 * يبني نسخة **بيانات** (بلا صور افتراضيًا)، يشفّرها، ويرفعها. يعيد `{ key, at, bytes }`.
 *
 * والصور خارجها بقصد (المرحلة ٣٥): هي تسعة أعشار الحجم، وبياناتك كلها في العشر الباقي.
 * فكانت النسخة الكاملة تتجاوز حدّ الدالة بعد عشرين عقارًا بصورها، **فيفشل الرفع بصمت
 * وأنت تحسب بياناتك محفوظة**. والبيانات وحدها تُرفع كل يوم بلا مشقّة، والصور في كتلٍ
 * منفصلة على مهلٍ (`uploadImages`).
 */
export async function uploadBackup(passphrase, { includeImages = false } = {}) {
  if (!passphrase) throw new Error('حدد العبارة السرّية أولًا');
  const { blob, counts } = await exportBackup({ includeImages });
  const payload = await encryptText(await blob.text(), passphrase);
  if (payload.length > MAX_PAYLOAD) {
    throw new Error(`النسخة ${mb(payload.length)} والحدّ ${mb(MAX_PAYLOAD)}`
      + (includeImages ? ' — ارفع البيانات وحدها ثم الصور في كتلٍ منفصلة.' : ' — بياناتك تجاوزت حدّ الرفعة الواحدة، صدّر ملفًا محليًّا واحتفظ به.'));
  }
  const result = await call('', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ payload, counts }),
  });
  return { ...result, bytes: payload.length, includeImages };
}

/**
 * يرفع الصور في كتلٍ، كلٌّ منها تحت حدّ الدالة.
 *
 * والكتل كلها تحمل معرّف دفعةٍ واحد، فيعرف الاسترجاع أنه جمعها كاملة — ويعرف الخادم أن
 * يقلّمها **بالدفعة لا بالعدد**، فلا تبقى من دفعةِ عشرِ كتلٍ اثنتان لا تصلحان لشيء.
 *
 * @returns {{ batch, parts, bytes, images }}
 */
export async function uploadImages(passphrase, { onProgress = null } = {}) {
  if (!passphrase) throw new Error('حدد العبارة السرّية أولًا');
  const { repo } = await import('./repository.js');
  const { serializeImage } = await import('./backup.js');
  const { worthBackingUp } = await import('./images.js');
  // المختوم المؤقّت لا يُرفع (المرحلة ٣٨): رفعُ ما يُحذف بعد ثلاثة أيام يملأ الخزنة
  // ويستهلك حصّتك، ثم يعيده الاسترجاعُ حيًّا بعد أن مات.
  const records = (await repo.raw.getAll('images')).filter(worthBackingUp);
  const batch = new Date().toISOString();
  if (!records.length) return { batch, parts: 0, bytes: 0, images: 0 };

  // نُجمّع حتى يبلغ حجم الكتلة الحدّ، ثم نبدأ كتلةً جديدة. وصورةٌ واحدة تتجاوز الحدّ
  // وحدها تُرفع في كتلتها — وإلا لسقطت وسقط معها الباقي.
  const chunks = [];
  let current = [];
  let size = 0;
  for (const rec of records) {
    const row = await serializeImage(rec);
    const text = JSON.stringify(row);
    if (current.length && size + text.length > IMAGE_CHUNK_BYTES) {
      chunks.push(current);
      current = [];
      size = 0;
    }
    current.push(row);
    size += text.length;
  }
  if (current.length) chunks.push(current);

  let bytes = 0;
  for (let i = 0; i < chunks.length; i++) {
    const payload = await encryptText(JSON.stringify({ batch, part: i, parts: chunks.length, images: chunks[i] }), passphrase);
    if (payload.length > MAX_PAYLOAD) {
      throw new Error(`كتلة صور واحدة ${mb(payload.length)} وهي فوق الحدّ — صورةٌ ضخمة بعينها، احذفها أو أعد رفعها مضغوطة.`);
    }
    await call('?kind=images', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ payload, part: i, parts: chunks.length, batch }),
    });
    bytes += payload.length;
    onProgress?.(i + 1, chunks.length);
  }
  return { batch, parts: chunks.length, bytes, images: records.length };
}

/** كتل الصور المحفوظة سحابيًا. */
export async function listImageBackups() {
  return (await call('?kind=images')).backups || [];
}

/**
 * يسترجع آخر دفعة صور كاملة ويضيفها إلى مخزن الصور.
 * **ولا يسترجع دفعةً ناقصة**: صورٌ نصفها أسوأ من لا شيء، لأنك تحسبها كاملة.
 */
export async function restoreImages(passphrase) {
  if (!passphrase) throw new Error('حدد العبارة السرّية أولًا');
  const metas = await listImageBackups();
  if (!metas.length) throw new Error('لا كتل صور في الخزنة بعد');
  const batch = metas[0].at;
  const mine = metas.filter((m) => (m.at || '') === batch);
  const expected = mine[0]?.parts ?? mine.length;
  if (mine.length !== expected) {
    throw new Error(`الدفعة ناقصة: ${mine.length} من ${expected} كتلة — ارفع الصور من جديد قبل الاسترجاع.`);
  }
  const { repo } = await import('./repository.js');
  const { deserializeImage } = await import('./backup.js');
  let count = 0;
  for (const meta of mine) {
    const { payload } = await call(`?kind=images&key=${encodeURIComponent(meta.key)}`);
    const parsed = JSON.parse(await decryptText(payload, passphrase));
    const rows = (parsed.images || []).map(deserializeImage);
    // `putMany` لا `replaceAll`: الصور **تُضاف** ولا تمحو ما في الجهاز — قد يكون فيه
    // أحدثُ مما في الكتلة، ومحوُه لاسترجاعٍ جزئيّ خسارةٌ لا استرجاع.
    if (rows.length) await repo.raw.putMany('images', rows);
    count += rows.length;
  }
  return { images: count, parts: mine.length, at: batch };
}

/** ينزّل نسخة ويفكّها ويقرؤها — بلا كتابةِ شيء. تُستعمل للفحص قبل القرار. */
export async function fetchBackup(passphrase, key = null) {
  if (!passphrase) throw new Error('حدد العبارة السرّية أولًا');
  const target = key || (await listBackups())[0]?.key;
  if (!target) throw new Error('لا توجد نسخة سحابية بعد');
  const { payload } = await call(`?key=${encodeURIComponent(target)}`);
  const plain = await decryptText(payload, passphrase);
  const file = new File([plain], 'vault.json', { type: 'application/json' });
  const { data, counts, exportedAt } = await readBackupFile(file);
  return { data, counts, exportedAt, key: target };
}

/** ماذا يخسر هذا الجهاز لو استُبدل بهذه النسخة؟ يُسأل **قبل** أي استرجاع. */
export async function inspectBackup(passphrase, key = null) {
  const found = await fetchBackup(passphrase, key);
  return { ...found, risk: await restoreRisk(found.data) };
}

/**
 * ينزّل نسخة ويستبدل بها بيانات الجهاز.
 * **يستبدل ولا يدمج** — نفس سلوك الاستيراد من ملف منذ المرحلة ١، وللدمج `mergeFromVault`.
 */
export async function restoreBackup(passphrase, key = null) {
  const { data, counts, exportedAt, key: target } = await fetchBackup(passphrase, key);
  await importBackup(data);
  return { counts, exportedAt, key: target };
}

/**
 * ينزّل نسخة و**يدمجها** في بيانات الجهاز: الأحدث يفوز لكل سجلٍّ على حدة.
 *
 * وهذا ما يجعل جهازين لا يمحو أحدهما الآخر — وهو الطريق المعتاد للنقل بين الأجهزة،
 * والاستبدال يبقى لحالةٍ واحدة: جهازٌ جديد فارغ، أو جهازٌ أفسدتَ بياناته وتريد الرجوع.
 */
/** ينقل إعدادات النسخة إلى هذا الجهاز — قرارٌ صريح منفصل عن الدمج. */
export async function settingsFromVault(passphrase, key = null) {
  const { data, exportedAt, key: target } = await fetchBackup(passphrase, key);
  const stats = await importSettings(data);
  return { ...stats, exportedAt, key: target };
}

export async function mergeFromVault(passphrase, key = null) {
  const { data, counts, exportedAt, key: target } = await fetchBackup(passphrase, key);
  const stats = await mergeBackup(data);
  return { counts, exportedAt, key: target, stats };
}

/** فحص سريع: هل الخزنة متاحة وهل الجلسة صالحة؟ (تُستعمل لإخفاء اللوحة محليًا بلا خادم.) */
export async function vaultAvailable() {
  try {
    await listBackups();
    return true;
  } catch (_) {
    return false;
  }
}
