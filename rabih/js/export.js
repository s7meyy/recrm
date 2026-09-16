// التصدير — ملف Excel حقيقي (xlsx) يُبنى في المتصفح بلا مكتبة ولا خادم،
// وCSV بعلامة ترتيب البايتات كي تفتحه Excel بالعربية سليمةً.
//
// ملف xlsx ما هو إلا أرشيف ZIP يضمّ ملفات XML. وبما أن الحجم صغير،
// نكتب المدخلات بلا ضغط (طريقة store) فلا نحتاج إلى أي مكتبة ضغط.

import { stats } from './schema.js';
import { topicStats, topicSentiment, topicsOf } from './lexicon.js';
import { scan } from './anomaly.js';
import { progress, STATUS } from './plan.js';
import { shield } from './privacy.js';

/* ───────── أدوات ZIP ───────── */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i += 1) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

const enc = new TextEncoder();

/** يبني أرشيف ZIP من [{name, data:Uint8Array}] بلا ضغط. */
function zip(files) {
  const chunks = [];
  const central = [];
  let offset = 0;

  const u16 = (n) => [n & 0xFF, (n >>> 8) & 0xFF];
  const u32 = (n) => [n & 0xFF, (n >>> 8) & 0xFF, (n >>> 16) & 0xFF, (n >>> 24) & 0xFF];
  // تاريخ DOS صالح (1980-01-01): الصفر يعني الشهر صفرًا فتشكو بعض القارئات.
  const DOS_DATE = (1 << 5) | 1;

  for (const f of files) {
    const name = enc.encode(f.name);
    const crc = crc32(f.data);
    const local = [
      ...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(DOS_DATE),
      ...u32(crc), ...u32(f.data.length), ...u32(f.data.length),
      ...u16(name.length), ...u16(0),
    ];
    chunks.push(new Uint8Array(local), name, f.data);

    central.push([
      ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(DOS_DATE),
      ...u32(crc), ...u32(f.data.length), ...u32(f.data.length),
      ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0),
      ...u32(offset), ...Array.from(name),
    ]);
    offset += local.length + name.length + f.data.length;
  }

  const dir = central.flat();
  const end = [
    ...u32(0x06054b50), ...u16(0), ...u16(0),
    ...u16(files.length), ...u16(files.length),
    ...u32(dir.length), ...u32(offset), ...u16(0),
  ];

  const total = offset + dir.length + end.length;
  const out = new Uint8Array(total);
  let pos = 0;
  for (const c of chunks) { out.set(c, pos); pos += c.length; }
  out.set(new Uint8Array(dir), pos); pos += dir.length;
  out.set(new Uint8Array(end), pos);
  return out;
}

/* ───────── بناء ورقة ───────── */

const xmlEsc = (v) => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;')
  .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');

const colName = (i) => {
  let s = '', n = i;
  do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; } while (n >= 0);
  return s;
};

/** يحوّل مصفوفة صفوف إلى XML ورقة. الصف الأول عناوين. */
function sheetXml(rows) {
  const body = rows.map((row, r) => {
    const cells = row.map((val, c) => {
      const ref = `${colName(c)}${r + 1}`;
      const isHead = r === 0;
      const num = typeof val === 'number' && Number.isFinite(val);
      if (num) return `<c r="${ref}" s="${isHead ? 1 : 0}"><v>${val}</v></c>`;
      return `<c r="${ref}" t="inlineStr" s="${isHead ? 1 : 0}"><is><t xml:space="preserve">${xmlEsc(val)}</t></is></c>`;
    }).join('');
    return `<row r="${r + 1}">${cells}</row>`;
  }).join('');

  const widths = (rows[0] || []).map((_, c) => {
    const w = Math.min(60, Math.max(10, ...rows.map((r) => String(r[c] ?? '').length + 2)));
    return `<col min="${c + 1}" max="${c + 1}" width="${w}" customWidth="1"/>`;
  }).join('');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetViews><sheetView rightToLeft="1" workbookViewId="0"/></sheetViews>
<cols>${widths}</cols><sheetData>${body}</sheetData></worksheet>`;
}

/**
 * يبني ملف xlsx من أوراق متعددة.
 * @param {Array<{name:string, rows:Array<Array<string|number>>}>} sheets
 * @returns {Blob}
 */
export function buildXlsx(sheets) {
  const valid = sheets.filter((s) => s.rows?.length);
  const files = [];

  files.push({ name: '[Content_Types].xml', data: enc.encode(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${valid.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}
</Types>`) });

  files.push({ name: '_rels/.rels', data: enc.encode(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`) });

  files.push({ name: 'xl/workbook.xml', data: enc.encode(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${valid.map((s, i) => `<sheet name="${xmlEsc(s.name).slice(0, 31)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>
</workbook>`) });

  files.push({ name: 'xl/_rels/workbook.xml.rels', data: enc.encode(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${valid.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}
<Relationship Id="rId${valid.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`) });

  files.push({ name: 'xl/styles.xml', data: enc.encode(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF16324F"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs>
</styleSheet>`) });

  valid.forEach((s, i) => files.push({ name: `xl/worksheets/sheet${i + 1}.xml`, data: enc.encode(sheetXml(s.rows)) }));

  return new Blob([zip(files)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

/* ───────── أوراق رابح ───────── */

/** يبني أوراق تقرير واحد: التعليقات، المواضيع، الخطة، الملخص، الإشارات. */
export function jobSheets(job) {
  // وضع الخصوصية يعمل على ما يخرج من يدك: الأسماء تُستبدَل، والنصوص كما وردت.
  const place = shield(job.place || {});
  const reviews = place.reviews || [];
  const s = stats(place);
  const c = job.ctx || {};

  const summary = [
    ['البند', 'القيمة'],
    ['المنشأة', place.identity?.name || ''],
    ['التصنيف', c.categoryName || ''],
    ['المدينة', c.cityName || ''],
    ['الحي', c.districtName || ''],
    ['الرابط', job.mapsUrl || ''],
    ['متوسط قوقل', s.googleAverage ?? ''],
    ['عدد التقييمات في قوقل', s.googleCount ?? ''],
    ['التعليقات المُحلَّلة', s.total],
    ['نسبة العيّنة %', s.coverage ?? ''],
    ['متوسط العيّنة', s.sampleAverage ?? ''],
    ['إيجابي', s.positive], ['محايد', s.neutral], ['سلبي', s.negative],
    ['نسبة ردّ المالك %', s.replyRate ?? ''],
    ['تاريخ التقرير', String(job.createdAt || '').slice(0, 10)],
  ];

  const flags = new Map(scan(place).flagged.map((f) => [f.id, f]));
  const reviewRows = [['المعرّف', 'النجوم', 'الكاتب', 'التاريخ', 'النص', 'ردّ المالك', 'المواضيع', 'الاتجاه', 'إشارات']];
  for (const r of reviews) {
    const ids = topicsOf(r.text);
    const names = ids.map((id) => topicStats(place).find((t) => t.id === id)?.name || id);
    const dir = ids.length ? [...new Set(ids.map((id) => topicSentiment(r, id)))] : [];
    reviewRows.push([
      r.id, Number(r.rating) || '', r.author || '', r.date || '', r.text || '', r.ownerReply || '',
      names.join('، '),
      dir.includes('neg') ? (dir.includes('pos') ? 'مختلط' : 'سلبي') : (dir.includes('pos') ? 'إيجابي' : 'محايد'),
      (flags.get(r.id)?.flags || []).join('، '),
    ]);
  }

  const topics = [['الموضوع', 'مرات الورود', 'إيجابي', 'محايد', 'سلبي', 'الاتجاه', 'نسبة من العيّنة %', 'المعرّفات']];
  for (const t of topicStats(place)) topics.push([t.name, t.total, t.pos, t.neu, t.neg, t.verdict, t.share, t.ids.join('، ')]);

  const plan = [['#', 'المهمة', 'مؤشر القياس', 'السند', 'الاستحقاق', 'الحالة']];
  (job.plan || []).forEach((t, i) => plan.push([i + 1, t.text, t.metric || '', t.ids.join('، '), t.due || '', STATUS[t.status]?.label || t.status]));

  return [
    { name: 'الملخص', rows: summary },
    { name: 'التعليقات', rows: reviewRows },
    { name: 'المواضيع', rows: topics },
    ...(job.plan?.length ? [{ name: 'خطة العمل', rows: plan }] : []),
  ];
}

/** ورقة واحدة تجمع كل تقارير الأرشيف — للنظرة العامة. */
export function archiveSheet(jobs) {
  const rows = [['المنشأة', 'المنطقة', 'المدينة', 'التصنيف', 'الحي', 'متوسط قوقل', 'التقييمات', 'العيّنة', 'سلبي', 'ردود %', 'خطة منجزة', 'التاريخ']];
  for (const j of jobs) {
    const s = stats(j.place || {});
    const p = progress(j.plan || []);
    const c = j.ctx || {};
    rows.push([
      j.place?.identity?.name || '', c.regionName || '', c.cityName || '', c.categoryName || '', c.districtName || '',
      s.googleAverage ?? '', s.googleCount ?? '', s.total, s.negative, s.replyRate ?? '',
      p.total ? `${p.done}/${p.total}` : '—', String(j.createdAt || '').slice(0, 10),
    ]);
  }
  return [{ name: 'الأرشيف', rows }];
}

/** CSV بعلامة ترتيب البايتات — بدونها تفتح Excel العربية طلاسمَ. */
/**
 * البيانات الخام مع التقرير — شفافيةٌ تامة.
 *
 * من يسلّم بياناته مع تحليله لا يُتَّهم بانتقائها: يستطيع عميلك أن يتحقّق
 * من كل استشهادٍ بمعرّفه. والأسماء تتبع وضع الخصوصية.
 */
export function reviewsCsv(job) {
  const place = shield(job.place || {});
  const rows = [['المعرّف', 'النجوم', 'الكاتب', 'التاريخ', 'المصدر', 'النص', 'ردّ المالك']];
  for (const r of place.reviews || []) {
    rows.push([
      r.id, Number(r.rating) || '', r.author || '', r.date || '',
      ({ paste: 'لصق', provider: 'مزوّد', places: 'قوقل', json: 'JSON' }[r.source] || r.source || ''),
      r.text || '', r.ownerReply || '',
    ]);
  }
  return toCsv(rows);
}

export function toCsv(rows) {
  const esc = (v) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + rows.map((r) => r.map(esc).join(',')).join('\r\n');
}
