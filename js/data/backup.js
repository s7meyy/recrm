// النسخ الاحتياطي: ملف JSON واحد يحوي كل المخازن (بما فيها الإعدادات والصور كـ data URLs).
// الاستيراد يستبدل كل البيانات الحالية بمحتوى الملف في معاملة واحدة.
// التذكير: يُعدّ الاستحقاق قائمًا إذا وُجدت بيانات ولم يُصدَّر منذ 24 ساعة أو لم يُصدَّر قط.

import { repo } from './repository.js';
import { STORES } from './schema.js';
import { getBackupInfo, setLastExport } from './settings.js';

export const BACKUP_APP = 'kassab';
// الاسم القديم للتطبيق: النسخ الاحتياطية المأخوذة قبل إعادة التسمية تبقى مقبولة للاستيراد.
export const LEGACY_BACKUP_APP = 'motabiq';
export const BACKUP_FORMAT = 1;
export const REMINDER_HOURS = 24;

// كل المخازن، مشتقّة من STORES لا مكتوبة يدويًا: الإعدادات أولًا والصور آخرًا (أثقلها)،
// وأي مخزن يُضاف لاحقًا يدخل النسخة تلقائيًا. (كانت مكتوبة يدويًا فسقطت منها مخازن
// المرحلة ٧ الثلاثة، والاستيراد يمسح كل المخازن — فكان التصدير ثم الاستيراد يمحو المهام والأفكار.)
const STORE_ORDER = ['settings', ...STORES.filter((s) => s !== 'settings' && s !== 'images'), 'images'];

function bytesToBase64(bytes) {
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

async function blobToDataUrl(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return `data:${blob.type || 'image/jpeg'};base64,${bytesToBase64(bytes)}`;
}

function dataUrlToBlob(dataUrl) {
  const m = /^data:([^;,]*);base64,([\s\S]*)$/.exec(dataUrl);
  if (!m) return null;
  const binary = atob(m[2]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: m[1] || 'image/jpeg' });
}

async function serializeImage(rec) {
  return {
    ...rec,
    blob: rec.blob ? await blobToDataUrl(rec.blob) : null,
    thumb: rec.thumb ? await blobToDataUrl(rec.thumb) : null,
  };
}

function deserializeImage(rec) {
  return {
    ...rec,
    blob: typeof rec.blob === 'string' ? dataUrlToBlob(rec.blob) : (rec.blob ?? null),
    thumb: typeof rec.thumb === 'string' ? dataUrlToBlob(rec.thumb) : (rec.thumb ?? null),
  };
}

function stamp(iso) {
  return iso.slice(0, 16).replace('T', '-').replace(':', '');
}

/**
 * يبني ملف النسخة الاحتياطية بأجزاء (لا تُبنى سلسلة نصية واحدة ضخمة).
 * @returns {{ blob: Blob, filename: string, counts: object, exportedAt: string }}
 */
export async function exportBackup() {
  const exportedAt = new Date().toISOString();
  const parts = [`{"app":"${BACKUP_APP}","format":${BACKUP_FORMAT},"exportedAt":"${exportedAt}","db":{`];
  const counts = {};
  let firstStore = true;
  for (const store of STORE_ORDER) {
    const records = await repo.raw.getAll(store);
    counts[store] = records.length;
    parts.push(`${firstStore ? '' : ','}"${store}":[`);
    firstStore = false;
    for (let i = 0; i < records.length; i++) {
      const rec = store === 'images' ? await serializeImage(records[i]) : records[i];
      parts.push((i ? ',' : '') + JSON.stringify(rec));
    }
    parts.push(']');
  }
  parts.push('}}');
  return {
    blob: new Blob(parts, { type: 'application/json' }),
    filename: `kassab-backup-${stamp(exportedAt)}.json`,
    counts,
    exportedAt,
  };
}

/** ينزّل الملف عبر رابط مؤقت (متصفح فقط). */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export async function markExported(iso = new Date().toISOString()) {
  await setLastExport(iso);
}

/** يقرأ ملف نسخة ويتحقق منه دون تطبيقه. */
export async function readBackupFile(file) {
  const text = await file.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (_) {
    throw new Error('الملف ليس ملف JSON صالحًا');
  }
  if (!parsed || ![BACKUP_APP, LEGACY_BACKUP_APP].includes(parsed.app) || !parsed.db || typeof parsed.db !== 'object') {
    throw new Error('الملف ليس نسخة احتياطية من كسّاب');
  }
  if (Number(parsed.format) > BACKUP_FORMAT) {
    throw new Error('النسخة من إصدار أحدث من التطبيق الحالي');
  }
  const counts = {};
  for (const store of STORE_ORDER) counts[store] = Array.isArray(parsed.db[store]) ? parsed.db[store].length : 0;
  return { data: parsed, counts, exportedAt: parsed.exportedAt || null };
}

/** يستبدل كل المخازن بمحتوى النسخة، ثم يعتبر البيانات مُصدَّرة الآن. */
export async function importBackup(parsed) {
  const dataByStore = {};
  for (const store of repo.raw.stores) {
    const rows = Array.isArray(parsed.db[store]) ? parsed.db[store] : [];
    dataByStore[store] = store === 'images' ? rows.map(deserializeImage) : rows;
  }
  await repo.raw.replaceAll(dataByStore);
  await setLastExport(new Date().toISOString());
}

/** حالة التذكير اليومي. */
export async function backupStatus() {
  const info = await getBackupInfo();
  const counts = await repo.counts();
  const dataStores = ['clients', 'properties', 'tours', 'requests', 'matches', 'externalListings', 'deals'];
  const hasData = dataStores.some((s) => counts[s] > 0);
  const lastExportAt = info.lastExportAt || null;
  const hoursSince = lastExportAt ? (Date.now() - new Date(lastExportAt).getTime()) / 3600000 : null;
  return {
    lastExportAt,
    hoursSince,
    hasData,
    due: hasData && (hoursSince == null || hoursSince >= REMINDER_HOURS),
  };
}
