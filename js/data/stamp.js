// بيانات صفحة الختم (المرحلة ٣٨): الشعارات، والقوالب، وسياسة الاحتفاظ.
//
// **الشعارات** تُخزَّن صورًا في مخزن الوسائط بوسم `entity: 'stamp-logo'`، وقائمتُها
// (بأسمائها وترتيبها) في الإعدادات. ولمَ لا يُكتفى بالمخزن؟ لأنّ الاسم والترتيب اختيارُ
// المستخدم لا خاصّيةٌ في الملف، والمخزن لا يحفظ اختيارًا.
//
// **الاحتفاظ**: المختوم إمّا مؤقّت — يُحذف تلقائيًّا بعد أيامٍ معدودة — وإمّا دائم.
// والمؤقّت هو الافتراضي: من ختم ثلاثين صورةً ليرسلها اليوم لا يريدها في جهازه شهرًا،
// ومخزن المتصفّح محدود. والحذف **يُنفَّذ** عند فتح الصفحة، لا يُوعد به: تاريخ انتهاءٍ
// مكتوبٌ بلا كنّاسٍ يمرّ عليه وعدٌ كاذب.

import { repo, newId } from './repository.js';
import { storeImage, removeImage } from './images.js';

const SETTINGS_LOGOS = 'stampLogos';
const SETTINGS_PRESETS = 'stampPresets';

export const RETENTION_OPTIONS = [
  { key: '2', label: 'يومان ثم تُحذف', days: 2 },
  { key: '3', label: 'ثلاثة أيام ثم تُحذف', days: 3 },
  { key: '7', label: 'أسبوع ثم تُحذف', days: 7 },
  { key: 'forever', label: 'دائم — لا يُحذف', days: null },
];

export const DEFAULT_RETENTION = '3';

export function retentionDays(key) {
  return RETENTION_OPTIONS.find((o) => o.key === key)?.days ?? null;
}

export function expiryFor(key, now = Date.now()) {
  const days = retentionDays(key);
  return days == null ? null : new Date(now + days * 86400000).toISOString();
}

/* ===== الشعارات ===== */

export async function getLogos() {
  const list = await repo.settings.get(SETTINGS_LOGOS, []);
  return Array.isArray(list) ? list : [];
}

export async function addLogo(file, name = '') {
  const rec = await storeImage(file, { entity: 'stamp-logo', entityId: null });
  const logos = await getLogos();
  const entry = { id: newId(), imageId: rec.id, name: String(name || file.name || 'شعار').trim() };
  await repo.settings.set(SETTINGS_LOGOS, [...logos, entry]);
  return entry;
}

export async function renameLogo(id, name) {
  const logos = await getLogos();
  await repo.settings.set(SETTINGS_LOGOS, logos.map((l) => (l.id === id ? { ...l, name: String(name).trim() || l.name } : l)));
}

/**
 * حذف شعار. وصورتُه تُحذف معه — لكن **لا تُمسّ الصور المختومة به**: الختم مُحرَقٌ فيها
 * فلا يعتمد على بقاء الملف، وحذفُها لأن شعارًا حُذف إتلافٌ لعملٍ تمّ.
 */
export async function removeLogo(id) {
  const logos = await getLogos();
  const entry = logos.find((l) => l.id === id);
  await repo.settings.set(SETTINGS_LOGOS, logos.filter((l) => l.id !== id));
  if (entry?.imageId) await removeImage(entry.imageId).catch(() => {});
  // القوالب التي تشير إليه تُنظَّف، وإلّا بقي نمطٌ يشير إلى شعارٍ غير موجود فلا يُرسم
  // ولا يُفسَّر سكوته.
  const presets = await getPresets();
  const cleaned = presets
    .map((p) => ({ ...p, patterns: (p.patterns || []).filter((x) => x.logoId !== entry?.imageId) }))
    .filter((p) => p.patterns.length);
  if (cleaned.length !== presets.length || JSON.stringify(cleaned) !== JSON.stringify(presets)) {
    await repo.settings.set(SETTINGS_PRESETS, cleaned);
  }
}

/* ===== القوالب (مجموعات أنماط محفوظة) ===== */

export async function getPresets() {
  const list = await repo.settings.get(SETTINGS_PRESETS, []);
  return Array.isArray(list) ? list : [];
}

export async function savePreset(name, patterns) {
  const presets = await getPresets();
  const entry = { id: newId(), name: String(name).trim() || 'قالب', patterns: JSON.parse(JSON.stringify(patterns)) };
  await repo.settings.set(SETTINGS_PRESETS, [...presets, entry]);
  return entry;
}

export async function removePreset(id) {
  const presets = await getPresets();
  await repo.settings.set(SETTINGS_PRESETS, presets.filter((p) => p.id !== id));
}

/* ===== المختوم ===== */

export async function listStamped() {
  const all = await repo.images.list();
  return all
    .filter((r) => r.entity === 'stamped')
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

export async function saveStamped(blob, {
  width, height, propertyId = null, retention = DEFAULT_RETENTION, originalName = '', sourceUrl = '',
} = {}) {
  return repo.images.create({
    entity: 'stamped',
    entityId: propertyId,
    mime: blob.type || 'image/jpeg',
    blob,
    thumb: null,
    width, height,
    size: blob.size,
    originalName,
    sourceUrl,
    retention,
    expiresAt: expiryFor(retention),
  });
}

/**
 * يمرّ على المختوم فيحذف ما انتهى أجله. يُستدعى عند فتح الصفحة.
 * يعيد عدد المحذوف — يُقال للمستخدم، فالحذف الصامت يُقلق من افتقد صورةً.
 */
export async function sweepExpired(now = Date.now()) {
  const rows = await listStamped();
  let removed = 0;
  for (const r of rows) {
    if (!r.expiresAt) continue;
    const t = new Date(r.expiresAt).getTime();
    if (Number.isNaN(t) || t > now) continue;
    await removeImage(r.id);
    removed++;
  }
  return removed;
}

/** تثبيت صورةٍ مؤقّتة: تصير دائمة. من أعجبه المختوم أبقاه بضغطة. */
export async function keepForever(id) {
  return repo.images.update(id, { retention: 'forever', expiresAt: null });
}
