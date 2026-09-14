// استيراد جهات الاتصال وتصدير CSV (المرحلة ١١).
// كله محلي في المتصفح: لا شبكة، ولا خدمة، ولا خروج بيانات من الجهاز.

import { repo } from './repository.js';
import { normalizePhone } from '../util/phone.js';
import { invoiceTotal, labelFor, ENUMS } from './schema.js';
import { formatDate } from '../util/format.js';

/* ===== استيراد جهات الاتصال (vCard) ===== */

/** يفكّ التفاف أسطر vCard (السطر التالي المبدوء بمسافة تكملة لسابقه). */
function unfold(text) {
  return String(text ?? '').replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '');
}

function decodeValue(rawKey, value) {
  if (/ENCODING=QUOTED-PRINTABLE/i.test(rawKey)) {
    const bytes = [];
    value.replace(/=([0-9A-Fa-f]{2})|([\s\S])/g, (_, hex, ch) => {
      if (hex) bytes.push(parseInt(hex, 16));
      else for (const b of new TextEncoder().encode(ch)) bytes.push(b);
      return '';
    });
    try { return new TextDecoder('utf-8').decode(new Uint8Array(bytes)); } catch (_) { return value; }
  }
  return value;
}

/**
 * يقرأ ملف vCard (تصدير جهات الاتصال من الجوال) إلى `[{ name, phone, phone2 }]`.
 * دالة خالصة تقبل نص الملف. تتجاهل البطاقات بلا اسم ولا جوال.
 */
export function parseVCards(text) {
  const out = [];
  const cards = unfold(text).split(/BEGIN:VCARD/i).slice(1);
  for (const card of cards) {
    let name = '';
    const phones = [];
    for (const line of card.split('\n')) {
      const idx = line.indexOf(':');
      if (idx < 0) continue;
      const key = line.slice(0, idx).toUpperCase();
      const value = decodeValue(line.slice(0, idx), line.slice(idx + 1).trim());
      if (/^FN\b/.test(key) && value) name = value;
      else if (!name && /^N\b/.test(key) && value) name = value.split(';').filter(Boolean).join(' ').trim();
      else if (/^TEL\b/.test(key) && value) {
        const p = normalizePhone(value);
        if (p && !phones.includes(p)) phones.push(p);
      }
    }
    if (!name && !phones.length) continue;
    out.push({ name: name.trim(), phone: phones[0] || '', phone2: phones[1] || '' });
  }
  return out;
}

/**
 * يستورد جهات الاتصال عملاءَ جددًا. **لا يعدّل عميلًا قائمًا ولا يحذف شيئًا:**
 * الجوال الموجود مسبقًا يُتخطّى ويُعدّ في `skipped`.
 * @returns {Promise<{ added: number, skipped: number, invalid: number }>}
 */
export async function importContacts(contacts, { tag = null } = {}) {
  let added = 0;
  let skipped = 0;
  let invalid = 0;
  for (const c of contacts) {
    if (!c.name && !c.phone) { invalid++; continue; }
    if (c.phone && await repo.clients.findByPhone(c.phone)) { skipped++; continue; }
    await repo.clients.create({
      name: c.name, phone: c.phone, phone2: c.phone2,
      tags: tag ? [tag] : [],
      notes: 'مستورد من جهات الاتصال',
    });
    added++;
  }
  return { added, skipped, invalid };
}

/* ===== تصدير CSV ===== */

const csvCell = (v) => {
  const text = v == null ? '' : String(v);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/** يبني نص CSV مع BOM كي يفتحه إكسل بالعربية صحيحةً بلا خطوات إضافية. */
export function toCsv(rows, headers) {
  const head = headers.map((h) => csvCell(h.label)).join(',');
  const body = rows.map((r) => headers.map((h) => csvCell(h.get(r))).join(',')).join('\n');
  return `﻿${head}\n${body}`;
}

/** تعريفات التصدير لكل كيان — تُستعمل في صفحة الإعدادات. */
export const CSV_EXPORTS = {
  clients: {
    label: 'العملاء',
    async rows() { return repo.clients.list(); },
    headers: (ctx) => [
      { label: 'الاسم', get: (c) => c.name },
      { label: 'الجوال', get: (c) => c.phone },
      { label: 'جوال آخر', get: (c) => c.phone2 },
      { label: 'المرحلة', get: (c) => labelFor(ENUMS.clientStages, c.stage) },
      { label: 'الأدوار', get: (c) => (c.roles || []).map((r) => labelFor(ENUMS.clientRoles, r)).join('، ') },
      { label: 'التصنيفات', get: (c) => (c.tags || []).join('، ') },
      { label: 'المصدر', get: (c) => c.referralSource },
      { label: 'آخر تواصل', get: (c) => (repo.clients.lastContactAt(c) ? formatDate(repo.clients.lastContactAt(c)) : '') },
      { label: 'ملاحظات', get: (c) => c.notes },
    ],
  },
  properties: {
    label: 'العقارات',
    async rows() { return (await repo.properties.list()).filter((p) => p.captureStatus === 'approved'); },
    headers: (ctx) => [
      { label: 'النوع', get: (p) => ctx.typeLabel(p.type) },
      { label: 'المدينة', get: (p) => p.city },
      { label: 'الحي', get: (p) => p.district },
      { label: 'الغرض', get: (p) => (p.purposes || []).map((k) => labelFor(ENUMS.purposes, k)).join('، ') },
      { label: 'المساحة', get: (p) => p.area ?? '' },
      { label: 'السعر', get: (p) => p.price ?? '' },
      { label: 'سعر المتر', get: (p) => (p.price && p.area ? Math.round(p.price / p.area) : '') },
      { label: 'الحالة', get: (p) => ctx.statusLabel(p.status) },
      { label: 'المالك', get: (p) => ctx.clientName(p.ownerId) },
      { label: 'المصدر', get: (p) => p.referralSource },
      { label: 'ملاحظات', get: (p) => p.notes },
    ],
  },
  requests: {
    label: 'الطلبات',
    async rows() { return repo.requests.list(); },
    headers: (ctx) => [
      { label: 'العميل', get: (r) => ctx.clientName(r.clientId) },
      { label: 'النوع', get: (r) => ctx.typeLabel(r.type) },
      { label: 'الغرض', get: (r) => labelFor(ENUMS.purposes, r.purpose) },
      { label: 'المدينة', get: (r) => r.city },
      { label: 'الأحياء', get: (r) => (r.districts || []).join('، ') },
      { label: 'سقف الميزانية', get: (r) => r.budgetMax ?? '' },
      { label: 'المساحة', get: (r) => r.area ?? '' },
      { label: 'الحالة', get: (r) => labelFor(ENUMS.requestStatuses, r.status) },
    ],
  },
  deals: {
    label: 'الصفقات',
    async rows() { return repo.deals.list(); },
    headers: (ctx) => [
      { label: 'التاريخ', get: (d) => formatDate(d.date) },
      { label: 'السعر النهائي', get: (d) => d.finalPrice ?? '' },
      { label: 'العمولة', get: (d) => d.commission ?? '' },
      { label: 'العميل', get: (d) => ctx.clientName(d.clientId) },
      { label: 'ملاحظات', get: (d) => d.notes },
    ],
  },
  invoices: {
    label: 'الفواتير وعروض الأسعار',
    async rows() { return repo.invoices.list(); },
    headers: () => [
      { label: 'النوع', get: (i) => labelFor(ENUMS.invoiceTypes, i.type) },
      { label: 'الرقم', get: (i) => i.number },
      { label: 'التاريخ', get: (i) => formatDate(i.date) },
      { label: 'العميل', get: (i) => i.clientName },
      { label: 'البيان', get: (i) => i.statement },
      { label: 'الإجمالي', get: (i) => invoiceTotal(i) },
    ],
  },
};

/** يبني ملف CSV لكيان ويعيد `{ blob, filename, count }`. */
export async function buildCsv(entity, ctx) {
  const def = CSV_EXPORTS[entity];
  if (!def) throw new Error('نوع تصدير غير معروف');
  const rows = await def.rows();
  const csv = toCsv(rows, def.headers(ctx));
  const stamp = new Date().toISOString().slice(0, 10);
  return { blob: new Blob([csv], { type: 'text/csv;charset=utf-8' }), filename: `kassab-${entity}-${stamp}.csv`, count: rows.length };
}

/* ===== استيراد CSV (المرحلة ١٨) ===== */

/**
 * يقرأ نص CSV إلى `{ headers, rows }`.
 *
 * مكتوب يدويًا بلا مكتبة لأن المطلوب محدود ومعروف: فاصلة أو فاصلة منقوطة، واقتباس مزدوج
 * يحمي الفاصلة والسطر داخل الخلية، و`""` اقتباسٌ هارب. ويُسقط شارة BOM التي يضعها إكسل.
 * ويكتشف الفاصل بنفسه: إكسل العربي يحفظ بالفاصلة المنقوطة في كثير من الأجهزة.
 */
export function parseCsv(text) {
  const src = String(text ?? '').replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  if (!src.trim()) return { headers: [], rows: [] };

  // الفاصل: أيّهما أكثر في أول سطر خارج الاقتباس.
  const firstLine = src.split('\n')[0];
  const count = (ch) => firstLine.split('"').filter((_, i) => i % 2 === 0).join('').split(ch).length - 1;
  const delim = count(';') > count(',') ? ';' : ',';

  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"') { quoted = true; continue; }
    if (ch === delim) { row.push(cell); cell = ''; continue; }
    if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; continue; }
    cell += ch;
  }
  row.push(cell);
  rows.push(row);

  const clean = rows
    .map((r) => r.map((c) => c.trim()))
    .filter((r) => r.some((c) => c !== ''));
  if (!clean.length) return { headers: [], rows: [] };

  const headers = clean[0].map((h, i) => h || `عمود ${i + 1}`);
  const body = clean.slice(1).map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ''])));
  return { headers, rows: body };
}

/** رقم عربي أو لاتيني بفواصل آلاف → رقم، أو null. */
function toNumber(value) {
  const latin = String(value ?? '')
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[,٬\s]/g, '')
    .replace(/[^\d.-]/g, '');
  const n = Number(latin);
  return Number.isFinite(n) && latin !== '' ? n : null;
}

/** يبحث عن مفتاح قائمة بعنوانه العربي (أو يُرجع النص كما هو إن لم يُعرف). */
function keyByLabel(list, value) {
  const v = String(value ?? '').trim();
  if (!v) return '';
  return list.find((x) => x.label === v || x.key === v)?.key || '';
}

/** حقول الاستيراد لكل كيان: العنوان، وهل هو مفتاح تكرار، وكيف يُحوَّل. */
export const CSV_IMPORTS = {
  clients: {
    label: 'العملاء',
    fields: [
      { key: 'name', label: 'الاسم', aliases: ['الاسم', 'اسم العميل', 'name'] },
      { key: 'phone', label: 'الجوال', aliases: ['الجوال', 'الجوّال', 'الهاتف', 'رقم الجوال', 'phone', 'mobile'], parse: normalizePhone },
      { key: 'phone2', label: 'جوال آخر', aliases: ['جوال آخر', 'جوال ٢', 'phone2'], parse: normalizePhone },
      { key: 'notes', label: 'ملاحظات', aliases: ['ملاحظات', 'ملاحظة', 'notes'] },
      { key: 'referralSource', label: 'المصدر', aliases: ['المصدر', 'source'] },
    ],
    // الجوال أوثق، وبغيابه يُقارَن الاسم — وإلا كرّرت إعادةُ استيراد الملف نفسه كل عميل بلا جوال.
    dedupe: (rec, existing) => (rec.phone
      ? existing.some((c) => normalizePhone(c.phone) === rec.phone)
      : !!rec.name && existing.some((c) => !normalizePhone(c.phone) && String(c.name || '').trim() === rec.name)),
    required: (rec) => !!(rec.name || rec.phone),
    async existing() { return repo.clients.list(); },
    async create(rec) { return repo.clients.create(rec); },
  },
  properties: {
    label: 'العقارات',
    fields: [
      { key: 'city', label: 'المدينة', aliases: ['المدينة', 'city'] },
      { key: 'district', label: 'الحي', aliases: ['الحي', 'الحيّ', 'district'] },
      { key: 'type', label: 'النوع', aliases: ['النوع', 'نوع العقار', 'type'], listKey: 'propertyTypes' },
      { key: 'area', label: 'المساحة', aliases: ['المساحة', 'مساحة', 'area'], parse: toNumber },
      { key: 'price', label: 'السعر', aliases: ['السعر', 'price'], parse: toNumber },
      { key: 'purposes', label: 'الغرض', aliases: ['الغرض', 'purposes'], multi: 'purposes' },
      { key: 'notes', label: 'ملاحظات', aliases: ['ملاحظات', 'notes'] },
      { key: 'referralSource', label: 'المصدر', aliases: ['المصدر', 'source'] },
    ],
    // التكرار في العقار ليس قاطعًا كالجوال: نفس المدينة والحي والنوع والمساحة والسعر.
    dedupe: (rec, existing) => existing.some((p) => p.city === rec.city && p.district === rec.district
      && p.type === rec.type && Number(p.area) === Number(rec.area) && Number(p.price) === Number(rec.price)),
    required: (rec) => !!rec.city,
    async existing() { return repo.properties.list(); },
    async create(rec) { return repo.properties.create({ ...rec, source: 'manual', captureStatus: 'approved' }); },
  },
};

/** يقترح ربط كل حقل بعمودٍ في الملف بمطابقة العنوان (تقريبية، وتبقى قابلة للتغيير). */
export function suggestMapping(entity, headers) {
  const norm = (s) => String(s ?? '').trim().toLowerCase().replace(/[ًٌٍَُِّْـ]/g, '');
  const out = {};
  for (const field of CSV_IMPORTS[entity].fields) {
    const hit = headers.find((h) => field.aliases.some((a) => norm(a) === norm(h)));
    if (hit) out[field.key] = hit;
  }
  return out;
}

/** يحوّل صفًا خامًا إلى سجل بحسب الربط والقوائم. */
export function rowToRecord(entity, row, mapping, { lists = null } = {}) {
  const rec = {};
  for (const field of CSV_IMPORTS[entity].fields) {
    const col = mapping[field.key];
    if (!col) continue;
    const raw = row[col];
    if (field.multi === 'purposes') {
      rec.purposes = String(raw ?? '').split(/[،,/|]/).map((v) => keyByLabel(ENUMS.purposes, v)).filter(Boolean);
    } else if (field.listKey && lists) {
      rec[field.key] = keyByLabel(lists[field.listKey] || [], raw);
    } else if (field.parse) {
      rec[field.key] = field.parse(raw);
    } else {
      rec[field.key] = String(raw ?? '').trim();
    }
  }
  return rec;
}

/**
 * معاينة الاستيراد قبل الكتابة: ماذا سيُضاف، وماذا سيُتخطّى ولماذا.
 * **لا تكتب شيئًا** — الكتابة في `runImport` بعد موافقتك على المعاينة.
 */
export async function previewImport(entity, rows, mapping, { lists = null } = {}) {
  const def = CSV_IMPORTS[entity];
  const existing = await def.existing();
  const seen = [];
  const out = { add: [], skipped: [] };
  for (const [i, row] of rows.entries()) {
    const rec = rowToRecord(entity, row, mapping, { lists });
    if (!def.required(rec)) { out.skipped.push({ line: i + 2, rec, why: 'ينقصه الحد الأدنى من البيانات' }); continue; }
    if (def.dedupe(rec, existing) || def.dedupe(rec, seen)) { out.skipped.push({ line: i + 2, rec, why: 'موجود عندك أصلًا' }); continue; }
    seen.push(rec);
    out.add.push({ line: i + 2, rec });
  }
  return out;
}

/** ينفّذ الإضافة. يُرجع عدد المضاف وقائمة أخطاء التحقق إن رفض المخزن سجلًا. */
export async function runImport(entity, items) {
  const def = CSV_IMPORTS[entity];
  let added = 0;
  const failed = [];
  for (const item of items) {
    try { await def.create(item.rec); added++; } catch (err) {
      failed.push({ line: item.line, message: (err.errors || [err.message]).join('، ') });
    }
  }
  return { added, failed };
}
