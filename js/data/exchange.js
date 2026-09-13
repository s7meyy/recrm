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
