// النسخة الاحتياطية السحابية المشفَّرة (المرحلة ١٠) — التشفير كله في المتصفح.
//
// **الخادم لا يرى بياناتك أبدًا:** تُشتقّ مفتاحية AES-GCM من عبارتك السرّية عبر PBKDF2
// (٢٠٠ ألف دورة، SHA-256، ملح عشوائي لكل نسخة)، ويُرفع الناتج المشفَّر وحده.
// نسيان العبارة = فقدان النسخ السحابية نهائيًا — لا يوجد من يستطيع فكّها، ولا نحن.
//
// العبارة تُحفظ في هذا الجهاز (إن اخترت) كي يعمل الرفع التلقائي؛ الخطر المفترض هنا هو ضياع
// الجهاز لا اختراقه محليًا — ومن يملك جهازك المفتوح يرى البيانات نفسها في التطبيق أصلًا.

import { exportBackup, readBackupFile, importBackup, mergeBackup, restoreRisk, importSettings } from './backup.js';
import { countOf } from '../util/format.js';

const ENDPOINT = '/api/vault';
const PBKDF2_ROUNDS = 200000;

// حدّ الحجم (المرحلة ٣٥) — نفس حدّ الدالة، مفحوصًا قبل الشبكة كي لا تُشفَّر ميغابايتات
// ثم تُرمى. ودونه بهامش: التشفير يزيد الحجم نحو الثلث (base64 ومغلّف JSON).
export const MAX_PAYLOAD = 4_500_000;
// الصور تُرفع كتلًا، وحجم الكتلة قبل التشفير يُبقي المشفَّر تحت الحدّ.
const IMAGE_CHUNK_BYTES = 3_000_000;
// **والبيانات مثلها الآن** (المرحلة ٤٥). كانت كتلةً واحدة تُرمى كاملةً عند تجاوز الحدّ،
// فكان سقفُ الخزنة سقفًا لعدد عملائك: آلافُ عميلٍ بمطابقاتهم ومهامّهم تبلغه، وحينها
// **لا نسخة سحابية أصلًا** — لا ناقصة ولا كاملة. والثلاثةُ ملايين بايت تصير بعد التشفير
// وbase64 نحو أربعةٍ، فتبقى دون الحدّ بهامش.
const DATA_CHUNK_BYTES = 3_000_000;
const enc = new TextEncoder();
const dec = new TextDecoder();

/**
 * يقطع نصًّا قطعًا لا تتجاوز الواحدة `limit` بايتًا من UTF-8، **بلا شقّ محرف**.
 *
 * والقطع بالبايت لا بالحرف لأن الحدّ حدُّ بايتات؛ والحرف العربي بايتان والإيموجي أربعة،
 * فقطعٌ بعدد الأحرف يخطئ الحجم مرّتين. ولا يُقطع في وسط محرف: بايتُ التكملة في UTF-8
 * نمطه `10xxxxxx`، فنتراجع عنه حتى نقف على أوّل بايتٍ في محرف.
 *
 * ووصلُ القطع نصًّا يعيد الأصل حرفًا حرفًا — وعليه يقوم الاسترجاع.
 */
export function splitUtf8(text, limit = DATA_CHUNK_BYTES) {
  const bytes = enc.encode(String(text ?? ''));
  if (bytes.length <= limit) return [String(text ?? '')];
  const parts = [];
  let start = 0;
  while (start < bytes.length) {
    let end = Math.min(start + limit, bytes.length);
    while (end > start + 1 && end < bytes.length && (bytes[end] & 0xC0) === 0x80) end--;
    parts.push(dec.decode(bytes.subarray(start, end)));
    start = end;
  }
  return parts;
}

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

/** قائمة كتل النسخ المحفوظة سحابيًا (بلا تنزيلها) — كتلةً كتلة لا دفعةً دفعة. */
export async function listBackups() {
  return (await call('')).backups || [];
}

/**
 * يجمع الكتل **دفعاتٍ**: الدفعة رفعةٌ واحدة قد تكون كتلةً أو عشرًا.
 *
 * والتجميع بـ`batch` لا بـ`at`: الخادم يختم كلَّ طلبٍ بوقته هو، وكتلُ الدفعة الواحدة
 * تصل في ثوانٍ متفرّقة — **فالجمع بالوقت يفرّق الدفعة الواحدة إلى دفعاتٍ ناقصة**، ثم
 * يرفض الاسترجاعُ كلَّ واحدةٍ منها لنقصها. وهذا كان حال استرجاع الصور متعدّدِ الكتل
 * منذ المرحلة ٣٥: لم يكن يسترجع شيئًا، ورسالتُه «الدفعة ناقصة» تصف عطبَ العدّ لا عطبَ
 * الخزنة. و`batch` كان يُخزَّن في بيانات الكتلة الوصفية ولا يُعاد في القائمة.
 *
 * @returns {Array<{ key, at, batch, counts, size, parts, expected, complete }>}
 */
export function groupBatches(metas = []) {
  const map = new Map();
  for (const m of metas) {
    const id = m.batch || m.at || m.key;
    if (!map.has(id)) map.set(id, []);
    map.get(id).push(m);
  }
  return [...map.values()]
    .map((list) => {
      const parts = list.slice().sort((a, b) => (a.part ?? 0) - (b.part ?? 0));
      const expected = parts[0]?.parts ?? parts.length;
      return {
        key: parts[0].key,
        at: parts[0].at,
        batch: parts[0].batch || parts[0].at || parts[0].key,
        counts: parts.find((p) => p.counts)?.counts || null,
        size: parts.reduce((a, p) => a + (Number(p.size) || 0), 0),
        parts,
        expected,
        complete: parts.length === expected,
      };
    })
    .sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
}

/** الدفعات مجموعةً — وهو ما تعرضه الشاشة وما يقرؤه الاسترجاع. */
export async function listBackupBatches() {
  return groupBatches(await listBackups());
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
export async function uploadBackup(passphrase, { includeImages = false, onProgress = null } = {}) {
  if (!passphrase) throw new Error('حدد العبارة السرّية أولًا');
  const { blob, counts } = await exportBackup({ includeImages });
  const chunks = splitUtf8(await blob.text());
  const batch = new Date().toISOString();

  let bytes = 0;
  let result = null;
  for (let i = 0; i < chunks.length; i++) {
    const payload = await encryptText(chunks[i], passphrase);
    if (payload.length > MAX_PAYLOAD) {
      // لا يقع هذا إلا بعطبٍ في القطع: ثلاثةُ ملايين بايت لا تبلغ مشفَّرةً أربعةً ونصفًا.
      throw new Error(`كتلةٌ واحدة ${mb(payload.length)} وهي فوق الحدّ ${mb(MAX_PAYLOAD)} — بلّغ عن هذا فهو عطب.`);
    }
    // الكتلةُ الواحدة تُرفع بشكلها القديم بلا `part`، فلا يتغيّر مفتاحها ولا تنكسر
    // النسخُ المرفوعة قبل هذه المرحلة.
    const body = chunks.length === 1
      ? { payload, counts }
      : { payload, counts: i === 0 ? counts : null, part: i, parts: chunks.length, batch };
    result = await call('', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    bytes += payload.length;
    onProgress?.(i + 1, chunks.length);
  }
  return { ...result, bytes, includeImages, parts: chunks.length, batch };
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
  const batches = groupBatches(await listImageBackups());
  if (!batches.length) throw new Error('لا كتل صور في الخزنة بعد');
  const picked = batches[0];
  if (!picked.complete) {
    throw new Error(`الدفعة ناقصة: ${picked.parts.length} من ${countOf(picked.expected, 'كتلة')} — ارفع الصور من جديد قبل الاسترجاع.`);
  }
  const mine = picked.parts;
  const batch = picked.batch;
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

/**
 * ينزّل دفعةً كاملة ويفكّها ويقرؤها — بلا كتابةِ شيء. تُستعمل للفحص قبل القرار.
 *
 * **ولا تُقرأ دفعةٌ ناقصة أبدًا**: نصفُ نسخةٍ ليس نصفَ نفع، هو JSON مقطوع لا يُفكّ أصلًا؛
 * والأسوأ لو فُكّ: بياناتٌ تحسبها كاملة وقد ذهب نصفها. وهذا مبدأ استرجاع الصور نفسه.
 */
export async function fetchBackup(passphrase, key = null) {
  if (!passphrase) throw new Error('حدد العبارة السرّية أولًا');
  const batches = await listBackupBatches();
  const picked = key ? batches.find((b) => b.parts.some((p) => p.key === key)) : batches[0];
  if (!picked) throw new Error('لا توجد نسخة سحابية بعد');
  if (!picked.complete) {
    throw new Error(`النسخة ناقصة: وصلت ${picked.parts.length} من ${countOf(picked.expected, 'كتلة')}`
      + ' — ارفع نسخةً جديدة قبل الاسترجاع.');
  }
  let plain = '';
  for (const part of picked.parts) {
    const { payload } = await call(`?key=${encodeURIComponent(part.key)}`);
    plain += await decryptText(payload, passphrase);
  }
  const file = new File([plain], 'vault.json', { type: 'application/json' });
  const { data, counts, exportedAt } = await readBackupFile(file);
  return { data, counts, exportedAt, key: picked.key };
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
