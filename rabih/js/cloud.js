// المزامنة السحابية — نسخةٌ مشفَّرة من أرشيفك، تُفتَح على أي جهازٍ بكلمتك.
//
// **العلّة التي تحلّها**: أرشيفك كلّه في `IndexedDB` على متصفحٍ واحد. مسحُ
// بيانات المتصفح يمحو عملك كلّه، والنسخة الاحتياطية يدويّة تُنسى.
//
// **والثمن مُعلَن**: البيانات تغادر جهازك. فلا تُرفَع إلا مشفَّرةً بمفتاحٍ
// مشتقٍّ من كلمةٍ تعرفها أنت وحدك (PBKDF2-SHA256، ٣١٠ آلاف دورة، AES-GCM)،
// ولا تُرسَل الكلمة ولا المفتاح إلى الخادم أبدًا. والخادم يحمل الصندوق ولا
// يملك مفتاحه؛ ولو سُرِّب المخزن كلّه لم يُقرأ منه حرف.
//
// **ولا تعمل إلا بتشغيلك إيّاها**، وهي مطفأةٌ ابتداءً.

const ITER = 310000;
const enc = new TextEncoder();
const dec = new TextDecoder();

const b64 = (u8) => btoa(String.fromCharCode(...new Uint8Array(u8)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function keyFrom(password, salt) {
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: ITER, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
  );
}

export async function encryptPayload(obj, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await keyFrom(password, salt);
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(obj)));
  return { v: 1, iter: ITER, salt: b64(salt), iv: b64(iv), cipher: b64(cipher) };
}

export async function decryptPayload(payload, password) {
  const key = await keyFrom(password, unb64(payload.salt));
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: unb64(payload.iv) }, key, unb64(payload.cipher),
  );
  return JSON.parse(dec.decode(plain));
}

/** معرّف الصندوق: عشوائيّ محض، لا يُشتقّ من اسمٍ ولا كلمة سر. */
export function newBoxId() {
  const a = crypto.getRandomValues(new Uint8Array(24));
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function push(boxId, slot, obj, password) {
  const payload = await encryptPayload(obj, password);
  const res = await fetch(`/api/store?key=${encodeURIComponent(boxId)}&slot=${encodeURIComponent(slot)}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: data.error || `تعذّر الرفع (${res.status}).`, needsStore: !!data.needsStore };
  return { ok: true, updatedAt: data.updatedAt, bytes: data.bytes };
}

export async function pull(boxId, slot, password) {
  const res = await fetch(`/api/store?key=${encodeURIComponent(boxId)}&slot=${encodeURIComponent(slot)}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: data.error || `تعذّر الجلب (${res.status}).`, needsStore: !!data.needsStore };
  if (!data.found) return { ok: true, found: false };
  try {
    const obj = await decryptPayload(JSON.parse(data.data), password);
    return { ok: true, found: true, data: obj, updatedAt: data.updatedAt };
  } catch {
    return { ok: false, error: 'تعذّر فكّ التشفير — كلمة السر غير صحيحة، أو النسخة لصندوقٍ آخر.' };
  }
}

export async function removeBox(boxId, slot) {
  const res = await fetch(`/api/store?key=${encodeURIComponent(boxId)}&slot=${encodeURIComponent(slot)}`, { method: 'DELETE' });
  return res.ok;
}
