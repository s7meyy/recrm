// طبقة البيانات المجرّدة: كل ما تستدعيه الصفحات يمرّ من هنا.
// تضيف الحقول المشتركة (id، التواريخ، المُنشئ)، وتطبّع الجوال والبحث، وتتحقق من الحد الأدنى،
// ثم تمرّر إلى المحوّل (IndexedDB الآن، خادم لاحقًا عبر setAdapter).

import { indexedDbAdapter } from './adapters/indexeddb.js';
import { SCHEMAS, ENUMS, STORES, invoiceGrandTotal } from './schema.js';
import { buildSearchKey, matchesQuery } from '../util/arabic.js';
import { normalizePhone, phoneSearchForms } from '../util/phone.js';
import { distanceMeters } from '../util/location.js';

let adapter = indexedDbAdapter;
let currentUser = { id: 'local', name: '' };

export class ValidationError extends Error {
  constructor(errors) {
    super(errors.join('، '));
    this.name = 'ValidationError';
    this.errors = errors;
  }
}

export function newId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function setAdapter(next) { adapter = next; }
export function getAdapter() { return adapter; }
export function setCurrentUser(user) { currentUser = user; }
export function getCurrentUser() { return currentUser; }

const nowISO = () => new Date().toISOString();
const uniq = (arr) => [...new Set((Array.isArray(arr) ? arr : []).filter((x) => x != null && x !== ''))];
const trim = (v) => String(v ?? '').trim();
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

function toNumberOrNull(v) {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function cleanLocation(loc) {
  if (!loc || typeof loc !== 'object') return null;
  const lat = Number(loc.lat);
  const lng = Number(loc.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

const inEnum = (list, key) => list.some((x) => x.key === key);

/* تطبيع كل كيان قبل الحفظ */
const PREPARE = {
  clients(rec) {
    rec.name = trim(rec.name);
    rec.phone = normalizePhone(rec.phone);
    rec.phone2 = normalizePhone(rec.phone2);
    rec.notes = trim(rec.notes);
    rec.roles = uniq(rec.roles);
    rec.tags = uniq(rec.tags);
    rec.contacts = Array.isArray(rec.contacts) ? rec.contacts : [];
    rec.referralSource = trim(rec.referralSource);
    rec.searchKey = buildSearchKey([
      rec.name, ...phoneSearchForms(rec.phone), ...phoneSearchForms(rec.phone2), rec.notes, ...rec.tags,
      rec.referralSource,
    ]);
  },
  properties(rec) {
    rec.agreementSignedAt = rec.agreementSignedAt || null; // اتفاقية الوساطة (المرحلة ٣١)
    rec.agreementDays = toNumberOrNull(rec.agreementDays);
    rec.city = trim(rec.city);
    rec.district = trim(rec.district);
    rec.type = trim(rec.type);
    rec.notes = trim(rec.notes);
    rec.purposes = uniq(rec.purposes);
    rec.area = toNumberOrNull(rec.area);
    rec.price = toNumberOrNull(rec.price);
    rec.location = cleanLocation(rec.location);
    rec.images = uniq(rec.images);
    rec.ownerId = rec.ownerId || null;
    rec.tourId = rec.tourId || null;
    rec.signboardImageId = rec.signboardImageId || null;
    rec.priceHistory = (Array.isArray(rec.priceHistory) ? rec.priceHistory : [])
      .filter((h) => h && h.at)
      .map((h) => ({ at: h.at, price: toNumberOrNull(h.price) }));
    if (rec.captureContact && typeof rec.captureContact === 'object') {
      const cc = {
        name: trim(rec.captureContact.name),
        phone: normalizePhone(rec.captureContact.phone),
        note: trim(rec.captureContact.note),
      };
      rec.captureContact = cc.name || cc.phone || cc.note ? cc : null;
    } else {
      rec.captureContact = null;
    }
    rec.typeFields = obj(rec.typeFields);
    rec.extra = obj(rec.extra);
    rec.referralSource = trim(rec.referralSource); // تاق المصدر — غير `source` (مسار الإدخال)
    rec.searchKey = buildSearchKey([
      rec.city, rec.district, rec.notes, ...Object.values(rec.typeFields), ...Object.values(rec.extra),
      rec.referralSource,
    ]);
  },
  tours(rec) {
    rec.city = trim(rec.city);
    rec.districts = uniq(rec.districts);
    rec.notes = trim(rec.notes);
    rec.searchKey = buildSearchKey([rec.city, ...rec.districts, rec.notes]);
  },
  requests(rec) {
    rec.city = trim(rec.city);
    rec.districts = uniq(rec.districts);
    rec.budgetMax = toNumberOrNull(rec.budgetMax);
    rec.area = toNumberOrNull(rec.area);
    rec.priceFlexibility = toNumberOrNull(rec.priceFlexibility);
    rec.priceFlexAmount = toNumberOrNull(rec.priceFlexAmount);
    rec.areaFlexibility = toNumberOrNull(rec.areaFlexibility);
    rec.areaFlexAmount = toNumberOrNull(rec.areaFlexAmount);
    rec.districtZones = uniq(rec.districtZones);
    rec.notes = trim(rec.notes);
    rec.referralSource = trim(rec.referralSource);
    rec.searchKey = buildSearchKey([rec.city, ...rec.districts, rec.notes, rec.referralSource]);
  },
  matches(rec) {
    rec.score = toNumberOrNull(rec.score) ?? 0;
    rec.rejectReason = trim(rec.rejectReason) || null;
    rec.notes = trim(rec.notes);
    rec.searchKey = buildSearchKey([rec.notes]);
  },
  externalListings(rec) {
    rec.city = trim(rec.city);
    rec.district = trim(rec.district);
    rec.type = trim(rec.type);
    rec.platform = trim(rec.platform);
    rec.sourceUrl = trim(rec.sourceUrl);
    rec.notes = trim(rec.notes);
    rec.rawText = String(rec.rawText ?? '').trim(); // نص العرض كما لُصق (أسطره تبقى)
    rec.advertiserPhone = normalizePhone(rec.advertiserPhone);
    rec.screenshotImageId = rec.screenshotImageId || null;
    rec.postedAt = rec.postedAt || null;
    rec.purposes = uniq(rec.purposes);
    rec.area = toNumberOrNull(rec.area);
    rec.price = toNumberOrNull(rec.price);
    rec.location = cleanLocation(rec.location);
    rec.searchKey = buildSearchKey([
      rec.platform, rec.city, rec.district, rec.rawText, rec.notes, rec.sourceUrl,
      ...phoneSearchForms(rec.advertiserPhone),
    ]);
  },
  showings(rec) {
    rec.notes = trim(rec.notes);
    // «تمّت» بلا انطباع حالةٌ مشروعة (تُسأل لاحقًا)، لكن الانطباع بلا «تمّت» تناقض:
    // لا رأي لمن لم يعاين. فتسجيل الانطباع يرفع الحالة إلى «تمّت» بدل أن يُردّ بخطأ.
    if (rec.impression && rec.status === 'scheduled') rec.status = 'done';
    if (rec.impression !== 'disliked') rec.reason = rec.reason || null;
    rec.searchKey = buildSearchKey([rec.notes]);
  },
  deals(rec) {
    rec.finalPrice = toNumberOrNull(rec.finalPrice);
    rec.commission = toNumberOrNull(rec.commission);
    rec.notes = trim(rec.notes);
    // الدفعات والمسار والشريك (المرحلة ٢٤)
    rec.payments = (Array.isArray(rec.payments) ? rec.payments : [])
      .map((p) => ({
        id: p.id || newId(),
        dueAt: p.dueAt || null,
        amount: toNumberOrNull(p.amount),
        paidAt: p.paidAt || null,
        note: trim(p.note),
      }))
      .filter((p) => p.dueAt && p.amount != null && p.amount > 0)
      .sort((a, b) => a.dueAt.localeCompare(b.dueAt));
    rec.checklist = (Array.isArray(rec.checklist) ? rec.checklist : [])
      .map((i) => ({
        key: i.key || newId(),
        label: trim(i.label),
        done: !!i.done,
        doneAt: i.done ? (i.doneAt || nowISO()) : null,
      }))
      .filter((i) => i.label);
    rec.partnerName = trim(rec.partnerName);
    rec.partnerShare = toNumberOrNull(rec.partnerShare);
    // نصيبٌ بلا اسم **لا يُمحى صامتًا** — يُردّ بخطأ في VALIDATE، لأن محو رقمٍ كتبه المستخدم
    // أسوأ من رفضه. وما لا نصيب فيه لا تسليم له.
    rec.partnerPaidAt = (rec.partnerShare == null ? null : rec.partnerPaidAt) || null;
    rec.searchKey = buildSearchKey([rec.notes, rec.partnerName]);
  },
  images(rec) {
    rec.size = toNumberOrNull(rec.size) ?? 0;
  },
  taskLists(rec) {
    rec.title = trim(rec.title);
    rec.order = toNumberOrNull(rec.order) ?? 0;
    rec.searchKey = buildSearchKey([rec.title]);
  },
  tasks(rec) {
    rec.title = trim(rec.title);
    rec.order = toNumberOrNull(rec.order) ?? 0;
    rec.done = !!rec.done;
    rec.repeat = trim(rec.repeat) || 'none';
    rec.searchKey = buildSearchKey([rec.title, rec.notes]);
  },
  notes(rec) {
    rec.text = trim(rec.text);
    rec.tags = [...new Set((rec.tags || []).map(trim).filter(Boolean))];
    rec.searchKey = buildSearchKey([rec.text, ...rec.tags]);
  },
  expenses(rec) {
    rec.amount = toNumberOrNull(rec.amount);
    rec.category = trim(rec.category) || 'other';
    rec.note = trim(rec.note);
    rec.dealId = rec.dealId || null;
    rec.propertyId = rec.propertyId || null;
    rec.searchKey = buildSearchKey([rec.note]);
  },
  invoices(rec) {
    rec.type = trim(rec.type);
    rec.number = trim(rec.number);
    rec.statement = trim(rec.statement);
    rec.notes = trim(rec.notes);
    rec.clientId = rec.clientId || null;
    rec.clientName = trim(rec.clientName);
    rec.clientPhone = normalizePhone(rec.clientPhone);
    // التحصيل (المرحلة ١٧): صفر أو فراغ = لم يُقبض شيء، فلا فرق بينهما في التخزين.
    rec.paidAmount = toNumberOrNull(rec.paidAmount);
    if (rec.paidAmount != null && rec.paidAmount <= 0) rec.paidAmount = null;
    rec.paidAt = rec.paidAmount == null ? null : (rec.paidAt || new Date().toISOString());
    rec.dueAt = rec.dueAt || null;
    // البنود: وصف ونصّان رقميان؛ البند بلا وصف ولا مبلغ يُسقط (صفوف فارغة من النموذج).
    rec.items = (Array.isArray(rec.items) ? rec.items : [])
      .map((it) => ({
        id: it.id || newId(),
        description: trim(it.description),
        qty: toNumberOrNull(it.qty) ?? 1,
        unitPrice: toNumberOrNull(it.unitPrice) ?? 0,
      }))
      .filter((it) => it.description || it.unitPrice);
    rec.searchKey = buildSearchKey([
      rec.number, rec.clientName, ...phoneSearchForms(rec.clientPhone), rec.statement, rec.notes,
      ...rec.items.map((it) => it.description),
    ]);
  },
};

/* تحقق خاص بكل كيان (بعد الحقول المطلوبة العامة) */
const VALIDATE = {
  clients(rec, errors) {
    if (!rec.name && !rec.phone) errors.push('يلزم اسم العميل أو رقم جواله على الأقل');
    if (rec.roles.some((r) => !inEnum(ENUMS.clientRoles, r))) errors.push('دور العميل غير معروف');
    if (!inEnum(ENUMS.clientStages, rec.stage)) errors.push('مرحلة العميل غير معروفة');
  },
  properties(rec, errors) {
    if (rec.purposes.some((p) => !inEnum(ENUMS.purposes, p))) errors.push('الغرض غير معروف');
    if (!inEnum(ENUMS.propertySources, rec.source)) errors.push('مصدر العقار غير معروف');
    if (!inEnum(ENUMS.captureStatuses, rec.captureStatus)) errors.push('حالة الالتقاط غير معروفة');
    if (!rec.status) errors.push('حالة العقار مطلوبة');
  },
  requests(rec, errors) {
    if (!inEnum(ENUMS.purposes, rec.purpose)) errors.push('غرض الطلب غير معروف');
    if (!inEnum(ENUMS.requestStatuses, rec.status)) errors.push('حالة الطلب غير معروفة');
  },
  matches(rec, errors) {
    if (!rec.propertyId && !rec.externalId) errors.push('المطابقة تحتاج عقارًا أو عرضًا خارجيًا');
    if (!inEnum(ENUMS.matchStatuses, rec.status)) errors.push('حالة المطابقة غير معروفة');
    if (rec.rejectReason && !inEnum(ENUMS.matchRejectReasons, rec.rejectReason)) errors.push('سبب الرفض غير معروف');
  },
  expenses(rec, errors) {
    if (!inEnum(ENUMS.expenseCategories, rec.category)) errors.push('تصنيف المصروف غير معروف');
    if (rec.amount == null || rec.amount <= 0) errors.push('مبلغ المصروف يجب أن يكون أكبر من صفر');
  },
  externalListings(rec, errors) {
    if (!inEnum(ENUMS.externalStatuses, rec.status)) errors.push('حالة العرض الخارجي غير معروفة');
  },
  showings(rec, errors) {
    if (!rec.clientId) errors.push('المعاينة بلا عميل');
    if (!rec.propertyId && !rec.externalId) errors.push('المعاينة بلا عقار');
    if (!inEnum(ENUMS.showingStatuses, rec.status)) errors.push('حالة المعاينة غير معروفة');
    if (rec.impression && !inEnum(ENUMS.showingImpressions, rec.impression)) errors.push('الانطباع غير معروف');
  },
  deals(rec, errors) {
    // نصيب الشريك أكبر من العمولة يجعل صافيك سالبًا — خطأ إدخال غالبًا (المرحلة ٢٤).
    if (rec.partnerShare != null && rec.commission != null && rec.partnerShare > rec.commission) {
      errors.push('نصيب الشريك أكبر من العمولة');
    }
    if (rec.partnerShare != null && !rec.partnerName) errors.push('اكتب اسم الشريك أو امسح نصيبه');
  },
  tasks(rec, errors) {
    if (!inEnum(ENUMS.taskRepeats, rec.repeat)) errors.push('نوع التكرار غير معروف');
    if (rec.linkType && !inEnum(ENUMS.linkTypes, rec.linkType)) errors.push('نوع الربط غير معروف');
    if (rec.linkType && !rec.linkId) errors.push('يلزم تحديد السجل المرتبط');
  },
  notes(rec, errors) {
    if (rec.linkType && !inEnum(ENUMS.linkTypes, rec.linkType)) errors.push('نوع الربط غير معروف');
    if (rec.linkType && !rec.linkId) errors.push('يلزم تحديد السجل المرتبط');
  },
  invoices(rec, errors) {
    if (!inEnum(ENUMS.invoiceTypes, rec.type)) errors.push('نوع المستند غير معروف');
    if (!rec.items.length) errors.push('يلزم بند واحد على الأقل');
    if (rec.items.some((it) => !it.description)) errors.push('كل بند يحتاج وصفًا');
    // المقبوض أكبر من الإجمالي خطأ إدخال غالبًا، ولو مُرِّر لصار المستحق سالبًا فيفسد التقادم.
    if (rec.paidAmount != null && rec.paidAmount > invoiceGrandTotal(rec) + 0.5) {
      errors.push('المقبوض أكبر من إجمالي المستند');
    }
    if (rec.paidAmount != null && rec.type === 'quote') errors.push('عرض السعر لا يُقبض؛ حوّله إلى فاتورة أولًا');
  },
};

/* ===== سلة المحذوفات (المرحلة ٢١) ===== */

const TRASH_DAYS = 30;
// الصور والتسجيلات قد تبلغ ميغابايتات، والمطابقات تُعاد حسابًا لا استرجاعًا.
const TRASH_SKIP = ['images', 'matches', 'audio'];

/**
 * ينسخ السجل إلى السلة قبل حذفه.
 *
 * **حدّه مكتوب وصريح: يُستعاد السجل نفسه لا ما حُذف تبعًا له.** حذف العميل يحذف طلباته
 * بقاعدة CASCADE، واسترجاعه يعيده وحده — وهذا أصدق من وعدٍ باسترجاعٍ كامل لا يتحقق.
 * وفشل النسخ لا يمنع الحذف: الحذف ما طلبتَه، والسلة زيادة.
 */
async function keepInTrash(store, id) {
  if (TRASH_SKIP.includes(store)) return;
  try {
    const record = await adapter.get(store, id);
    if (!record) return;
    await adapter.put('trash', {
      id: newId(), store, recordId: id, deletedAt: nowISO(), deletedBy: currentUser.id, data: record,
    });
  } catch (_) { /* السلة رفاهية لا شرط */ }
}

/* قواعد الحذف: ما يُنظَّف تلقائيًا وما يمنع الحذف (تُطبَّق قبل حذف السجل) */
const CASCADE = {
  // حذف العميل ليس هنا: له دالة remove خاصة تشترط قرارًا صريحًا منك (انظر clients.remove أدناه).
  async properties(id) {
    const deals = await adapter.getByIndex('deals', 'propertyId', id);
    if (deals.length) throw new Error('لا يمكن حذف عقار له صفقة مسجّلة؛ احذف الصفقة أولًا');
    const images = await adapter.getByIndex('images', 'entityId', id);
    if (images.length) await adapter.deleteMany('images', images.map((i) => i.id));
    const matches = await adapter.getByIndex('matches', 'propertyId', id);
    if (matches.length) await adapter.deleteMany('matches', matches.map((m) => m.id));
  },
  async tours(id) {
    for (const p of await adapter.getByIndex('properties', 'tourId', id)) {
      await adapter.put('properties', { ...p, tourId: null, updatedAt: nowISO(), updatedBy: currentUser.id });
    }
  },
  async requests(id) {
    const matches = await adapter.getByIndex('matches', 'requestId', id);
    if (matches.length) await adapter.deleteMany('matches', matches.map((m) => m.id));
  },
  async externalListings(id) {
    const rec = await adapter.get('externalListings', id);
    if (rec?.screenshotImageId) await adapter.delete('images', rec.screenshotImageId);
    const mine = (await adapter.getAll('matches')).filter((m) => m.externalId === id);
    if (mine.length) await adapter.deleteMany('matches', mine.map((m) => m.id));
  },
  async deals(id) {
    // المصروف المرتبط بصفقة محذوفة يبقى (مصروفٌ صُرف فعلًا) ويُفكّ ربطه فقط.
    for (const e of await adapter.getByIndex('expenses', 'dealId', id)) {
      await adapter.put('expenses', { ...e, dealId: null, updatedAt: nowISO(), updatedBy: currentUser.id });
    }
  },
  async taskLists(id) {
    const tasks = await adapter.getByIndex('tasks', 'listId', id);
    if (tasks.length) await adapter.deleteMany('tasks', tasks.map((t) => t.id));
  },
};

function makeEntity(store) {
  const schema = SCHEMAS[store];

  function prepare(rec) {
    PREPARE[store]?.(rec);
    const errors = [];
    for (const f of schema.required) {
      if (rec[f] == null || rec[f] === '') errors.push(`الحقل «${schema.labels[f] ?? f}» مطلوب`);
    }
    VALIDATE[store]?.(rec, errors);
    if (errors.length) throw new ValidationError(errors);
  }

  return {
    store,
    defaults: () => schema.defaults(),

    async create(data = {}) {
      const rec = { ...schema.defaults(), ...data };
      rec.id = data.id || newId();
      rec.createdAt = data.createdAt || nowISO();
      rec.updatedAt = rec.createdAt;
      rec.createdBy = data.createdBy || currentUser.id;
      rec.updatedBy = rec.createdBy;
      prepare(rec);
      await adapter.put(store, rec);
      return rec;
    },

    async get(id) {
      if (!id) return null;
      return (await adapter.get(store, id)) ?? null;
    },

    async list() {
      return adapter.getAll(store);
    },

    async where(index, value) {
      return adapter.getByIndex(store, index, value);
    },

    async update(id, patch = {}) {
      const current = await adapter.get(store, id);
      if (!current) throw new Error('السجل غير موجود');
      const rec = {
        ...current, ...patch, id,
        createdAt: current.createdAt, createdBy: current.createdBy,
        updatedAt: nowISO(), updatedBy: currentUser.id,
      };
      // تاريخ السعر (المرحلة ١٩): يُسجَّل هنا لا في الصفحة، فيشمل كل مسار تعديل —
      // النموذج، والاعتماد، والاستيراد — ولا يعتمد على تذكّر كل صفحة أن تسجّله.
      if (store === 'properties' && 'price' in patch) {
        const before = toNumberOrNull(current.price);
        const after = toNumberOrNull(rec.price);
        if (before !== after) {
          const history = Array.isArray(current.priceHistory) ? current.priceHistory : [];
          // السجل نقاطُ سعرٍ على خطّ زمن لا قائمةَ تغييرات: أول نقطة هي السعر **قبل** أول
          // تعديل، وإلا لم يُعرف من أين هبط. فتُزرع عند أول تغيير إن كان له سعر سابق.
          const seeded = history.length === 0 && before != null
            ? [{ at: current.updatedAt || current.createdAt, price: before }]
            : history;
          rec.priceHistory = [...seeded, { at: rec.updatedAt, price: after }];
        }
      }
      prepare(rec);
      await adapter.put(store, rec);
      return rec;
    },

    /** يحذف السجل بعد تطبيق قواعد CASCADE (تنظيف المرتبط أو منع الحذف). */
    async remove(id) {
      if (CASCADE[store]) await CASCADE[store](id);
      await keepInTrash(store, id); // شبكة أمان قبل الحذف (المرحلة ٢١)
      await adapter.delete(store, id);
    },

    async search(query) {
      const all = await adapter.getAll(store);
      return all.filter((r) => matchesQuery(r.searchKey || '', query));
    },

    async count() {
      return adapter.count(store);
    },
  };
}

/* ===== دوال خالصة تُستعمل في الصفحات وفي المراحل اللاحقة ===== */

const COMPLETENESS_CHECKS = {
  city: (p) => !!p.city,
  district: (p) => !!p.district,
  type: (p) => !!p.type,
  purposes: (p) => Array.isArray(p.purposes) && p.purposes.length > 0,
  location: (p) => !!p.location,
  ownerPhone: (p, owner) => !!(owner && owner.phone),
  area: (p) => p.area != null,
  price: (p) => p.price != null,
  images: (p) => Array.isArray(p.images) && p.images.length > 0,
};

/** آخر تواصل مسجّل مع العميل (ISO) أو null. */
function lastContactAt(client) {
  const dates = (client?.contacts || []).map((c) => c.date).filter(Boolean).sort();
  return dates.length ? dates[dates.length - 1] : null;
}

/** موعد المتابعة القادمة = ما حُدد في أحدث تواصل (ISO) أو null. */
function nextFollowUp(client) {
  const contacts = [...(client?.contacts || [])].filter((c) => c.date).sort((a, b) => a.date.localeCompare(b.date));
  const latest = contacts[contacts.length - 1];
  return latest?.followUpAt || null;
}

const clients = Object.assign(makeEntity('clients'), {
  /**
   * ما سيتأثر بحذف هذا العميل — يُعرض عليك قبل التأكيد.
   * @returns {Promise<{ properties: number, requests: number, deals: number, linked: boolean }>}
   */
  async deleteImpact(id) {
    const [properties, requests, deals, invoices] = await Promise.all([
      adapter.getByIndex('properties', 'ownerId', id),
      adapter.getByIndex('requests', 'clientId', id),
      adapter.getByIndex('deals', 'clientId', id),
      adapter.getByIndex('invoices', 'clientId', id),
    ]);
    return {
      properties: properties.length, requests: requests.length, deals: deals.length, invoices: invoices.length,
      linked: !!(properties.length || requests.length || deals.length || invoices.length),
    };
  },

  /**
   * حذف العميل. **لا يحدث أبدًا كأثر جانبي:** الحذف مع وجود مرتبطات يشترط `{ force: true }`
   * الذي لا يُمرَّر إلا من زرّ حذف بتأكيدك الصريح. وعند الحذف القسري:
   * عقاراته تبقى ويصير `ownerId = null` · طلباته تُحذف هي ومطابقاتها · صفقاته تبقى ويصير `clientId = null`
   * (حفظًا لتاريخ الصفقات الذي يغذّي التسعير والداشبورد).
   */
  async remove(id, { force = false } = {}) {
    const [properties, requests, deals] = await Promise.all([
      adapter.getByIndex('properties', 'ownerId', id),
      adapter.getByIndex('requests', 'clientId', id),
      adapter.getByIndex('deals', 'clientId', id),
    ]);
    if (!force && (properties.length || requests.length || deals.length)) {
      const parts = [];
      if (properties.length) parts.push(`${properties.length} عقار`);
      if (requests.length) parts.push(`${requests.length} طلب`);
      if (deals.length) parts.push(`${deals.length} صفقة`);
      throw new Error(`العميل مرتبط بـ ${parts.join(' و')}؛ حذفه يحتاج تأكيدًا صريحًا منك`);
    }
    const stamp = { updatedAt: nowISO(), updatedBy: currentUser.id };
    for (const p of properties) await adapter.put('properties', { ...p, ownerId: null, ...stamp });
    for (const r of requests) {
      const matches = await adapter.getByIndex('matches', 'requestId', r.id);
      if (matches.length) await adapter.deleteMany('matches', matches.map((m) => m.id));
      await adapter.delete('requests', r.id);
    }
    for (const d of deals) await adapter.put('deals', { ...d, clientId: null, ...stamp });
    // الفواتير وعروض الأسعار تبقى ويصير clientId = null (اسم العميل وجواله لقطة محفوظة داخل المستند
    // منذ إصداره، فالمطبوع لا يتغير) — نفس منطق الصفقات: مستند مالي لا يُمحى بحذف عميل.
    for (const inv of await adapter.getByIndex('invoices', 'clientId', id)) {
      await adapter.put('invoices', { ...inv, clientId: null, ...stamp });
    }
    await adapter.delete('clients', id);
  },

  /**
   * ما سينتقل لو دُمج `dropId` في `keepId` — يُعرض عليك قبل الدمج.
   */
  async mergeImpact(keepId, dropId) {
    const [properties, requests, deals, invoices, tasks, drop] = await Promise.all([
      adapter.getByIndex('properties', 'ownerId', dropId),
      adapter.getByIndex('requests', 'clientId', dropId),
      adapter.getByIndex('deals', 'clientId', dropId),
      adapter.getByIndex('invoices', 'clientId', dropId),
      adapter.getAll('tasks'),
      this.get(dropId),
    ]);
    return {
      properties: properties.length, requests: requests.length, deals: deals.length, invoices: invoices.length,
      tasks: tasks.filter((t) => t.linkType === 'client' && t.linkId === dropId).length,
      contacts: (drop?.contacts || []).length,
    };
  },

  /**
   * دمج عميلين (المرحلة ٢٦): كل ما يشير إلى `dropId` يصير يشير إلى `keepId`، ثم يُحذف المكرّر.
   *
   * **لا يضيع شيء ولا يُطمس شيء:**
   *   • المرتبطات (عقارات · طلبات · صفقات · فواتير · مهام) تُنقل — لا تُحذف ولا تُترك يتيمة.
   *   • سجل التواصل يُدمج ويُرتَّب بالتاريخ، فتاريخ العميل يعود قطعة واحدة.
   *   • الحقول الفارغة في المُبقى تُملأ من المحذوف، و**المملوءة لا تُمسّ أبدًا**.
   *   • ملاحظات المحذوف تُلحق بملاحظات المُبقى مفصولةً بسطر يقول من أين جاءت.
   *   • جوالٌ ثانٍ مختلف يُحفظ في `phone2` إن كان فارغًا، وإلا ذُكر في الملاحظات — رقمٌ يضيع
   *     في الدمج خسارةٌ لا تُعوَّض.
   *
   * وهو **غير قابل للتراجع**: الشاشة تسأل، والسجل المحذوف يذهب إلى سلة المحذوفات كغيره.
   */
  async merge(keepId, dropId) {
    if (keepId === dropId) throw new Error('لا يُدمج سجل في نفسه');
    const [keep, drop] = await Promise.all([this.get(keepId), this.get(dropId)]);
    if (!keep || !drop) throw new Error('أحد السجلين غير موجود');

    const stamp = { updatedAt: nowISO(), updatedBy: currentUser.id };
    const [properties, requests, deals, invoices, tasks] = await Promise.all([
      adapter.getByIndex('properties', 'ownerId', dropId),
      adapter.getByIndex('requests', 'clientId', dropId),
      adapter.getByIndex('deals', 'clientId', dropId),
      adapter.getByIndex('invoices', 'clientId', dropId),
      adapter.getAll('tasks'),
    ]);
    for (const p of properties) await adapter.put('properties', { ...p, ownerId: keepId, ...stamp });
    for (const r of requests) await adapter.put('requests', { ...r, clientId: keepId, ...stamp });
    for (const d of deals) await adapter.put('deals', { ...d, clientId: keepId, ...stamp });
    for (const inv of invoices) await adapter.put('invoices', { ...inv, clientId: keepId, ...stamp });
    for (const t of tasks) {
      if (t.linkType === 'client' && t.linkId === dropId) await adapter.put('tasks', { ...t, linkId: keepId, ...stamp });
    }

    // كل أرقام المحذوف — جوالاه معًا — تُقارن بأرقام المُبقى: رقمٌ يضيع في الدمج لا يُعوَّض.
    const extras = [drop.phone, drop.phone2]
      .filter((p) => p && p !== keep.phone && p !== keep.phone2);
    const extraPhone = keep.phone2 ? '' : extras[0] || ''; // يملأ الخانة الفارغة إن وُجدت
    const leftover = extras.filter((p) => p !== extraPhone); // وما لا خانة له يُكتب في الملاحظات
    const notes = [
      keep.notes,
      drop.notes ? `— من السجل المدموج (${drop.name || drop.phone || 'بلا اسم'}):\n${drop.notes}` : '',
      leftover.length ? `جوال إضافي من السجل المدموج: ${leftover.join('، ')}` : '',
    ].filter(Boolean).join('\n');

    const contacts = [...(keep.contacts || []), ...(drop.contacts || [])]
      .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));

    await adapter.put('clients', {
      ...keep,
      name: keep.name || drop.name,
      phone: keep.phone || drop.phone,
      phone2: keep.phone2 || extraPhone,
      referralSource: keep.referralSource || drop.referralSource,
      stage: keep.stage,
      roles: uniq([...(keep.roles || []), ...(drop.roles || [])]),
      tags: uniq([...(keep.tags || []), ...(drop.tags || [])]),
      contacts,
      notes,
      createdAt: [keep.createdAt, drop.createdAt].filter(Boolean).sort()[0] || keep.createdAt,
      ...stamp,
      searchKey: buildSearchKey([
        keep.name || drop.name, keep.notes, drop.notes, drop.name,
        ...phoneSearchForms(keep.phone || drop.phone), ...phoneSearchForms(keep.phone2 || extraPhone), ...leftover,
      ]),
    });

    // لم يبقَ ما يشير إليه: يُحذف مباشرة (ويُحفظ في سلة المحذوفات كأي حذف).
    await keepInTrash('clients', dropId);
    await adapter.delete('clients', dropId);
    return this.get(keepId);
  },

  /** يبحث بالجوال (أي صيغة) في phone ثم phone2. */
  async findByPhone(phone) {
    const p = normalizePhone(phone);
    if (!p) return null;
    const byPhone = await adapter.getByIndex('clients', 'phone', p);
    if (byPhone.length) return byPhone[0];
    const all = await adapter.getAll('clients');
    return all.find((c) => c.phone2 === p) ?? null;
  },

  async addContact(clientId, { type, date, note = '', followUpAt = null, audioId = null, audioSeconds = 0 }) {
    const client = await this.get(clientId);
    if (!client) throw new Error('العميل غير موجود');
    if (!inEnum(ENUMS.contactTypes, type)) throw new ValidationError(['نوع التواصل غير معروف']);
    const contact = {
      id: newId(), type, date: date || nowISO(), note: trim(note), followUpAt: followUpAt || null,
      // ملاحظة صوتية (المرحلة ٢٦): معرّف في مخزن audio لا الملف نفسه — سجل العميل يبقى خفيفًا.
      audioId: audioId || null, audioSeconds: audioId ? Number(audioSeconds) || 0 : 0,
      createdAt: nowISO(), createdBy: currentUser.id,
    };
    return this.update(clientId, { contacts: [...client.contacts, contact] });
  },

  async updateContact(clientId, contactId, patch) {
    const client = await this.get(clientId);
    if (!client) throw new Error('العميل غير موجود');
    const contacts = client.contacts.map((c) => (c.id === contactId ? { ...c, ...patch, id: contactId } : c));
    return this.update(clientId, { contacts });
  },

  /**
   * حذف سجل تواصل — ويحذف معه تسجيله الصوتي إن وُجد (المرحلة ٢٦).
   * ملفٌّ يبقى بلا سجلٍّ يشير إليه مساحةٌ ضائعة لا يراها أحد.
   */
  async removeContact(clientId, contactId) {
    const client = await this.get(clientId);
    if (!client) throw new Error('العميل غير موجود');
    const gone = (client.contacts || []).find((c) => c.id === contactId);
    if (gone?.audioId) await adapter.delete('audio', gone.audioId).catch(() => {});
    return this.update(clientId, { contacts: client.contacts.filter((c) => c.id !== contactId) });
  },

  lastContactAt,
  nextFollowUp,
});

const properties = Object.assign(makeEntity('properties'), {
  /**
   * هل العقار مكتمل البيانات بحسب تعريف الإعدادات؟
   * @returns {{ complete: boolean, missing: string[] }}
   */
  isComplete(property, { owner = null, fields = [] } = {}) {
    const missing = fields.filter((f) => COMPLETENESS_CHECKS[f] && !COMPLETENESS_CHECKS[f](property, owner));
    return { complete: missing.length === 0, missing };
  },

  /**
   * كشف تكرار عند الاعتماد (المرحلة ٢): تطابق جوال (عبر مالك عقار آخر)، أو موقع ضمن ٣٠ مترًا
   * لعقار مسجَّل بنفس النوع. لا يُطبَّق تلقائيًا — يعيد المرشحين فقط ليقرر المستخدم.
   * @param {{ phone?: string, location?: {lat,lng}, type?: string, excludeId?: string }} params
   * @returns {Promise<Array<{ property: object, reason: 'phone'|'location', distance?: number }>>}
   */
  async findDuplicates({ phone = null, location = null, type = null, excludeId = null } = {}) {
    const all = await adapter.getAll('properties');
    const others = all.filter((p) => p.id !== excludeId);
    const matches = [];

    const normalizedPhone = phone ? normalizePhone(phone) : null;
    if (normalizedPhone) {
      const clients = await adapter.getAll('clients');
      const ownerIds = new Set(clients.filter((c) => c.phone === normalizedPhone || c.phone2 === normalizedPhone).map((c) => c.id));
      if (ownerIds.size) {
        for (const p of others) {
          if (p.ownerId && ownerIds.has(p.ownerId)) matches.push({ property: p, reason: 'phone' });
        }
      }
    }

    if (location && type) {
      for (const p of others) {
        if (p.type !== type || !p.location) continue;
        if (matches.some((m) => m.property.id === p.id)) continue;
        const d = distanceMeters(location, p.location);
        if (d != null && d <= 30) matches.push({ property: p, reason: 'location', distance: Math.round(d) });
      }
    }

    return matches;
  },
});

const externalListings = Object.assign(makeEntity('externalListings'), {
  /**
   * مرشحو التكرار لعرض خارجي (المرحلة ٤): تنبيه لا منع — الاستدعاء يعيد المرشحين وأنت تقرر.
   * أربع أسباب: نفس الرابط · نفس جوال المعلن في عرض آخر · عرض شبيه (نفس النوع والحي وتقارب
   * المساحة والسعر ١٠٪) · والأنفع: جوال المعلن مسجَّل مالكًا لعقار في مخزونك.
   * @returns {Promise<Array<{ reason: 'url'|'phone'|'similar'|'inventory', listing?: object, property?: object, detail?: string }>>}
   */
  async findDuplicates({ sourceUrl = '', advertiserPhone = '', city = '', district = '', type = '', area = null, price = null, excludeId = null } = {}) {
    const all = (await adapter.getAll('externalListings')).filter((x) => x.id !== excludeId);
    const out = [];
    const seen = new Set();
    const push = (item) => {
      const key = `${item.reason}:${item.listing?.id || item.property?.id}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push(item);
    };

    const urlKey = (u) => String(u ?? '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/+$/, '');
    const wantedUrl = urlKey(sourceUrl);
    if (wantedUrl) {
      for (const x of all) if (urlKey(x.sourceUrl) === wantedUrl) push({ reason: 'url', listing: x });
    }

    const phone = normalizePhone(advertiserPhone);
    if (phone) {
      for (const x of all) if (x.advertiserPhone && x.advertiserPhone === phone) push({ reason: 'phone', listing: x });
      const clientsWithPhone = (await adapter.getAll('clients')).filter((c) => c.phone === phone || c.phone2 === phone);
      if (clientsWithPhone.length) {
        const ownerIds = new Set(clientsWithPhone.map((c) => c.id));
        for (const p of await adapter.getAll('properties')) {
          if (p.ownerId && ownerIds.has(p.ownerId)) {
            push({ reason: 'inventory', property: p, detail: clientsWithPhone[0].name || phone });
          }
        }
      }
    }

    if (type && (area != null || price != null)) {
      const near = (a, b) => a == null || b == null || Math.abs(a - b) <= Math.max(a, b) * 0.1;
      const sameDistrict = (a, b) => buildSearchKey([a]) === buildSearchKey([b]);
      for (const x of all) {
        if (x.type !== type) continue;
        if (city && x.city && !sameDistrict(city, x.city)) continue;
        if (district && x.district && !sameDistrict(district, x.district)) continue;
        if (!near(area, x.area) || !near(price, x.price)) continue;
        push({ reason: 'similar', listing: x });
      }
    }

    return out;
  },
});

const settings = {
  async get(key, fallback = null) {
    const rec = await adapter.get('settings', key);
    return rec ? rec.value : fallback;
  },
  async set(key, value) {
    await adapter.put('settings', { key, value, updatedAt: nowISO(), updatedBy: currentUser.id });
    return value;
  },
  async remove(key) {
    await adapter.delete('settings', key);
  },
  async all() {
    return adapter.getAll('settings');
  },
};

/**
 * سلة المحذوفات: عرضٌ واسترجاعٌ وكنس (المرحلة ٢١).
 * ليست كيانًا كامل الأركان: لا مخطط ولا تحقّق — سجلّ محفوظ كما كان لحظة حذفه.
 */
const trash = {
  /** الأحدث حذفًا أولًا، بعد كنس ما تجاوز المدة. */
  async list() {
    await trash.prune();
    const all = await adapter.getAll('trash');
    return all.sort((a, b) => (b.deletedAt || '').localeCompare(a.deletedAt || ''));
  },

  /** يمسح ما تجاوز ثلاثين يومًا — السلة شبكة أمان قصيرة لا أرشيف دائم. */
  async prune(days = TRASH_DAYS) {
    const cutoff = Date.now() - days * 86400000;
    const old = (await adapter.getAll('trash')).filter((t) => new Date(t.deletedAt).getTime() < cutoff);
    if (old.length) await adapter.deleteMany('trash', old.map((t) => t.id));
    return old.length;
  },

  /**
   * يعيد السجل إلى مخزنه بمعرّفه الأصلي (فترجع إليه روابط غيره إن بقيت).
   * ويرفض إن كان المعرّف مشغولًا الآن — فلا يُطمَس سجلّ قائم باسم الاسترجاع.
   */
  async restore(trashId) {
    const entry = await adapter.get('trash', trashId);
    if (!entry) throw new Error('العنصر لم يعد في السلة');
    const existing = await adapter.get(entry.store, entry.recordId);
    if (existing) throw new Error('يوجد سجل بالمعرّف نفسه الآن — لم يُستبدل');
    await adapter.put(entry.store, entry.data);
    await adapter.delete('trash', trashId);
    return entry;
  },

  async remove(trashId) {
    await adapter.delete('trash', trashId);
  },

  async clear() {
    const all = await adapter.getAll('trash');
    if (all.length) await adapter.deleteMany('trash', all.map((t) => t.id));
    return all.length;
  },

  async count() {
    return adapter.count('trash');
  },
};

export const repo = {
  /** يفتح التخزين. يمكن تمرير محوّل بديل: repo.init({ adapter }). */
  async init({ adapter: next = null } = {}) {
    if (next) adapter = next;
    await adapter.init();
  },
  get adapterName() { return adapter.name; },

  clients,
  properties,
  tours: makeEntity('tours'),
  requests: makeEntity('requests'),
  matches: makeEntity('matches'),
  externalListings,
  deals: makeEntity('deals'),
  images: makeEntity('images'),
  settings,
  taskLists: makeEntity('taskLists'),
  tasks: makeEntity('tasks'),
  notes: makeEntity('notes'),
  invoices: makeEntity('invoices'),
  trash,
  expenses: makeEntity('expenses'),
  audio: makeEntity('audio'), // الملاحظات الصوتية (المرحلة ٢٦)
  showings: makeEntity('showings'), // المعاينات (المرحلة ٢٧)

  /** وصول خام للمخازن (النسخ الاحتياطي والبيانات التجريبية). */
  raw: {
    stores: STORES,
    getAll: (store) => adapter.getAll(store),
    putMany: (store, records) => adapter.putMany(store, records),
    deleteMany: (store, keys) => adapter.deleteMany(store, keys),
    clear: (store) => adapter.clear(store),
    replaceAll: (dataByStore) => adapter.replaceAll(dataByStore),
  },

  /** عدد السجلات في كل مخزن. */
  async counts() {
    const out = {};
    for (const store of STORES) out[store] = await adapter.count(store);
    return out;
  },
};
