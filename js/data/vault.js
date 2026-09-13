// النسخة الاحتياطية السحابية المشفَّرة (المرحلة ١٠) — التشفير كله في المتصفح.
//
// **الخادم لا يرى بياناتك أبدًا:** تُشتقّ مفتاحية AES-GCM من عبارتك السرّية عبر PBKDF2
// (٢٠٠ ألف دورة، SHA-256، ملح عشوائي لكل نسخة)، ويُرفع الناتج المشفَّر وحده.
// نسيان العبارة = فقدان النسخ السحابية نهائيًا — لا يوجد من يستطيع فكّها، ولا نحن.
//
// العبارة تُحفظ في هذا الجهاز (إن اخترت) كي يعمل الرفع التلقائي؛ الخطر المفترض هنا هو ضياع
// الجهاز لا اختراقه محليًا — ومن يملك جهازك المفتوح يرى البيانات نفسها في التطبيق أصلًا.

import { exportBackup, readBackupFile, importBackup } from './backup.js';

const ENDPOINT = '/api/vault';
const PBKDF2_ROUNDS = 200000;
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

/** يبني نسخة كاملة، يشفّرها، ويرفعها. يعيد `{ key, at, bytes }`. */
export async function uploadBackup(passphrase) {
  if (!passphrase) throw new Error('حدد العبارة السرّية أولًا');
  const { blob, counts } = await exportBackup();
  const payload = await encryptText(await blob.text(), passphrase);
  const result = await call('', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ payload, counts }),
  });
  return { ...result, bytes: payload.length };
}

/**
 * ينزّل نسخة ويفكّها ويستبدل بها كل بيانات هذا الجهاز.
 * **يستبدل ولا يدمج** — نفس سلوك الاستيراد من ملف منذ المرحلة ١.
 */
export async function restoreBackup(passphrase, key = null) {
  if (!passphrase) throw new Error('حدد العبارة السرّية أولًا');
  const target = key || (await listBackups())[0]?.key;
  if (!target) throw new Error('لا توجد نسخة سحابية بعد');
  const { payload } = await call(`?key=${encodeURIComponent(target)}`);
  const plain = await decryptText(payload, passphrase);
  const file = new File([plain], 'vault.json', { type: 'application/json' });
  const { data, counts, exportedAt } = await readBackupFile(file);
  await importBackup(data);
  return { counts, exportedAt, key: target };
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
