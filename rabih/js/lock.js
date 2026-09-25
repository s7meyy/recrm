// القفل والتشفير — بيانات عملاء على جهاز قد يُفتح.
// كلمة السر لا تُحفَظ قطّ: يُحفَظ منها مُلح ومُتحقِّق مشتقّ بـPBKDF2،
// والتصدير يُشفَّر بـAES-GCM بمفتاح مشتقّ منها. ونسيانها يعني ضياع الملف المشفَّر.

const KEY = 'rabih:lock';
const ITER = 210000;

const enc = new TextEncoder();
const dec = new TextDecoder();

const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function deriveKey(password, salt, usage = ['encrypt', 'decrypt']) {
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey', 'deriveBits']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: ITER, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, usage,
  );
}

async function deriveCheck(password, salt) {
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: ITER, hash: 'SHA-256' }, base, 256);
  return b64(bits);
}

const readCfg = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; } };

export const isEnabled = () => !!readCfg();

/** يضبط القفل. لا تُحفَظ كلمة السر، بل مُلحها ومُتحقِّقها. */
export async function enable(password) {
  if (!password || password.length < 8) return { ok: false, reason: 'كلمة السر قصيرة — ثمانية أحرف فأكثر، فهي تحمي ما تصدّره مشفَّرًا.' };
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const check = await deriveCheck(password, salt);
  try {
    localStorage.setItem(KEY, JSON.stringify({ salt: b64(salt), check, at: new Date().toISOString() }));
    return { ok: true };
  } catch { return { ok: false, reason: 'تعذّر الحفظ في المتصفح.' }; }
}

export async function verifyPassword(password) {
  const cfg = readCfg();
  if (!cfg) return true;
  try { return (await deriveCheck(password, unb64(cfg.salt))) === cfg.check; }
  catch { return false; }
}

export async function disable(password) {
  if (!(await verifyPassword(password))) return { ok: false, reason: 'كلمة السر غير صحيحة.' };
  try { localStorage.removeItem(KEY); return { ok: true }; } catch { return { ok: false, reason: 'تعذّر الحذف.' }; }
}

/** يشفّر نصًّا بكلمة سر. المخرج JSON يحمل مُلحه ومتجهه فيُفكّ بأي جهاز. */
export async function encryptText(text, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, ['encrypt']);
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(text));
  return JSON.stringify({
    format: 'rabih-encrypted', v: 1, kdf: 'PBKDF2-SHA256', iterations: ITER,
    salt: b64(salt), iv: b64(iv), data: b64(data),
  }, null, 2);
}

/** @returns {{ok:boolean, text?:string, reason?:string}} */
export async function decryptText(payload, password) {
  let obj;
  try { obj = typeof payload === 'string' ? JSON.parse(payload) : payload; }
  catch { return { ok: false, reason: 'الملف ليس بصيغة صالحة.' }; }
  if (obj?.format !== 'rabih-encrypted') return { ok: false, reason: 'الملف غير مشفَّر برابح.' };
  try {
    const key = await deriveKey(password, unb64(obj.salt), ['decrypt']);
    const out = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(obj.iv) }, key, unb64(obj.data));
    return { ok: true, text: dec.decode(out) };
  } catch {
    return { ok: false, reason: 'كلمة السر غير صحيحة أو الملف تالف.' };
  }
}

export const isEncrypted = (text) => {
  try { return JSON.parse(text)?.format === 'rabih-encrypted'; } catch { return false; }
};
