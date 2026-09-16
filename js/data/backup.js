// النسخ الاحتياطي: ملف JSON واحد يحوي كل المخازن (بما فيها الإعدادات والصور كـ data URLs).
// الاستيراد يستبدل كل البيانات الحالية بمحتوى الملف في معاملة واحدة.
// التذكير: يُعدّ الاستحقاق قائمًا إذا وُجدت بيانات ولم يُصدَّر منذ 24 ساعة أو لم يُصدَّر قط.

import { repo } from './repository.js';
import { STORES } from './schema.js';
import { worthBackingUp } from './images.js';
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

export async function serializeImage(rec) {
  return {
    ...rec,
    blob: rec.blob ? await blobToDataUrl(rec.blob) : null,
    thumb: rec.thumb ? await blobToDataUrl(rec.thumb) : null,
  };
}

export function deserializeImage(rec) {
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
export async function exportBackup({ includeImages = true } = {}) {
  const exportedAt = new Date().toISOString();
  const parts = [`{"app":"${BACKUP_APP}","format":${BACKUP_FORMAT},"exportedAt":"${exportedAt}","db":{`];
  const counts = {};
  let firstStore = true;
  // نسخةٌ بلا صور (المرحلة ٣٥): الصور تسعة أعشار الحجم، وبياناتك كلها في العشر الباقي.
  // ومخزن `images` يبقى **مذكورًا فارغًا** لا محذوفًا: الاستيراد يمسح كل مخزنٍ يجده،
  // فحذفُه من النسخة يعني أن استيرادها لا يمسح صورك — وهو الصواب هنا بالضبط.
  const stores = includeImages ? STORE_ORDER : STORE_ORDER.filter((x) => x !== 'images');
  for (const store of stores) {
    let records = await repo.raw.getAll(store);
    // المختوم المؤقّت لا يُنسخ (المرحلة ٣٨): هو ذاهبٌ إلى الحذف بأمر صاحبه.
    if (store === 'images') records = records.filter(worthBackingUp);
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
    filename: `kassab-backup-${includeImages ? '' : 'data-'}${stamp(exportedAt)}.json`,
    counts,
    exportedAt,
    includeImages,
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

/**
 * يستبدل المخازن **الموجودة في النسخة** بمحتواها، ثم يعتبر البيانات مُصدَّرة الآن.
 *
 * **ومخزنٌ غائب عن النسخة لا يُمسّ** (المرحلة ٣٥). كان الاستيراد يمرّ على المخازن كلها
 * ويضع `[]` لما لم يجده — فيمسحه. وذلك صحيحٌ لنسخةٍ كاملة (فيها كل مخزنٍ ولو فارغًا)،
 * وكارثةٌ لنسخة البيانات وحدها: استرجاعُها كان **يمحو مكتبة صورك كلّها**.
 *
 * وهو يصلح عطبًا أقدم أيضًا: نسخةٌ أُخذت قبل أن يوجد مخزنٌ ما كانت تمحوه عند الاسترجاع.
 */
export async function importBackup(parsed) {
  const dataByStore = {};
  for (const store of repo.raw.stores) {
    if (!Array.isArray(parsed.db?.[store])) continue; // غائب عن النسخة: يبقى كما هو
    const rows = parsed.db[store];
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

/* ===== المرحلة ٣٥ — حارس الاسترجاع، والدمج بدل الاستبدال ===== */

/** المخازن التي يُقاس بها «عمل الجهاز»: سجلات المستخدم لا الإعدادات ولا الصور. */
const WORK_STORES = STORE_ORDER.filter((s) => s !== 'settings' && s !== 'images' && s !== 'trash');

/**
 * أحدث لحظة عملٍ على هذا الجهاز — أو null إن لم يكن فيه شيء.
 *
 * يحتاجها الحارس: استرجاعٌ يستبدل عملَ اليوم بنسخة الأمس **كارثةٌ صامتة**، ومقارنةُ
 * تاريخين تمنعها بلا أي بنيةٍ جديدة، فكل سجلّ يحمل `updatedAt` منذ زمن.
 */
export async function localNewestAt() {
  let newest = null;
  for (const store of WORK_STORES) {
    for (const rec of await repo.raw.getAll(store)) {
      const at = rec?.updatedAt || rec?.createdAt;
      if (at && (!newest || at > newest)) newest = at;
    }
  }
  return newest;
}

/**
 * ماذا يخسر هذا الجهاز لو استُبدل بهذه النسخة؟
 * @returns {{ localNewest, snapshotAt, wouldLose, newerCount }}
 */
export async function restoreRisk(parsed) {
  const snapshotAt = parsed?.exportedAt || null;
  const localNewest = await localNewestAt();
  let newerCount = 0;
  if (snapshotAt) {
    for (const store of WORK_STORES) {
      for (const rec of await repo.raw.getAll(store)) {
        const at = rec?.updatedAt || rec?.createdAt;
        if (at && at > snapshotAt) newerCount++;
      }
    }
  }
  return {
    localNewest,
    snapshotAt,
    wouldLose: !!(localNewest && snapshotAt && localNewest > snapshotAt),
    newerCount,
  };
}

/**
 * يدمج نسخة في بيانات الجهاز بدل أن يستبدلها (المرحلة ٣٥).
 *
 * **الأحدث يفوز لكل سجلٍّ على حدة** بـ`updatedAt` — وهو مكتوبٌ في كل سجلّ منذ البداية،
 * فلا يحتاج الدمج بنيةً جديدة. ولذلك صار جهازان لا يمحو أحدهما الآخر: تعمل على الجوال
 * وعلى المكتب، وترفع من كلٍّ وتدمج في كلٍّ، فيجتمع العملان.
 *
 * **والمحذوف يبقى محذوفًا**: سلّة المحذوفات شواهدُ حذف، فسجلٌّ حُذف هنا بعد تاريخ النسخة
 * لا يُحييه الدمج. ولولا ذلك لعاد كل ما حذفتَه مع أول دمج.
 *
 * **والإعدادات لا تُدمج**: مفتاحٌ واحد نصفُه من هنا ونصفُه من هناك إعدادٌ لا معنى له.
 * تبقى إعدادات هذا الجهاز كما هي، ويُستبدل كاملها من «استرجاع» الصريح وحده.
 *
 * @returns {{ added, updated, kept, skippedDeleted }}
 */
export async function mergeBackup(parsed) {
  const stats = { added: 0, updated: 0, kept: 0, skippedDeleted: 0 };
  const deletedAt = new Map();
  for (const entry of await repo.raw.getAll('trash')) {
    if (entry?.recordId && entry.deletedAt) deletedAt.set(`${entry.store}:${entry.recordId}`, entry.deletedAt);
  }

  for (const store of repo.raw.stores) {
    // الإعدادات لا تُدمج مفتاحًا مفتاحًا (انظر التوثيق أعلاه)، وتُنقل كاملةً بقرارٍ صريح
    // عبر `importSettings`. والسلّة شواهدُ حذفٍ تُقرأ ولا تُكتب هنا.
    if (store === 'settings' || store === 'trash') continue;
    const incoming = parsed.db?.[store];
    if (!Array.isArray(incoming)) continue;

    const mine = await repo.raw.getAll(store);
    const byId = new Map(mine.map((r) => [r.id, r]));
    const toPut = [];

    for (const raw of incoming) {
      const rec = store === 'images' ? deserializeImage(raw) : raw;
      if (!rec?.id) continue;

      // حُذف هنا بعد أن كُتب هناك: الحذف أحدث، فلا يُحيا.
      const killed = deletedAt.get(`${store}:${rec.id}`);
      const stamp = rec.updatedAt || rec.createdAt || '';
      if (killed && killed > stamp) { stats.skippedDeleted++; continue; }

      const current = byId.get(rec.id);
      if (!current) { toPut.push(rec); stats.added++; continue; }
      const currentStamp = current.updatedAt || current.createdAt || '';
      // التساوي يبقي ما في الجهاز: لا فائدة من كتابةٍ لا تغيّر شيئًا.
      if (stamp > currentStamp) { toPut.push(rec); stats.updated++; } else { stats.kept++; }
    }

    if (toPut.length) await repo.raw.putMany(store, toPut);
  }

  await setLastExport(new Date().toISOString());
  return stats;
}


/**
 * نقل **الإعدادات وحدها** من نسخة (المرحلة ٣٦).
 *
 * الدمج لا يمسّ الإعدادات بقصد: مفتاحٌ نصفُه من هنا ونصفُه من هناك إعدادٌ لا معنى له.
 * وأثرُ ذلك أن جهازًا جديدًا يُدمج فيه تصل بياناته بلا قوالب رسائلك ولا خطط متابعتك ولا
 * بيانات مكتبك. فهذا يجعله **قرارًا صريحًا**: زرٌّ يستبدل إعدادات هذا الجهاز بإعدادات
 * النسخة، لا شيئًا يقع صامتًا في أثناء دمجٍ طلبتَه لغيره.
 *
 * @param {object} parsed النسخة المقروءة
 * @param {{ keep }} options `keep` مفاتيح لا تُستبدل — والخزنة منها دائمًا: عبارتها السرّية
 *   تخصّ هذا الجهاز، ونقلُها من نسخةٍ يعني كتابة عبارة جهازٍ آخر فوق عبارتك.
 *   **و`user` مثلُها منذ المرحلة ٤٧**: هويّةُ الجهاز تخصّه، ونقلُها تجعل جهازَ موظّفك
 *   يوقّع السجلّات باسمك — فتُنسب أعمالُه إليك ويسقط تمييزُ الفريق كلُّه.
 * @returns {{ moved: number, kept: string[] }}
 */
export async function importSettings(parsed, { keep = ['vault', 'user'] } = {}) {
  const rows = Array.isArray(parsed?.db?.settings) ? parsed.db.settings : [];
  if (!rows.length) return { moved: 0, kept: [] };
  const out = [];
  const kept = [];
  for (const row of rows) {
    // مفتاح مخزن الإعدادات `key` لا `id` — ونقبل الاثنين لأن نسخًا قديمة قد تحمل أيًّا منهما.
    const key = row?.key ?? row?.id;
    if (!key) continue;
    if (keep.includes(key)) { kept.push(key); continue; }
    out.push({ key, value: row.value, updatedAt: row.updatedAt || new Date().toISOString(), updatedBy: row.updatedBy || null });
  }
  if (out.length) await repo.raw.putMany('settings', out);
  // ما كان عندك ولم يأتِ في النسخة يبقى: النقل إضافةٌ واستبدال، لا مسحٌ لما لا مقابل له.
  return { moved: out.length, kept };
}
