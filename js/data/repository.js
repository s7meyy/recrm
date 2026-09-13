// طبقة البيانات المجرّدة: كل ما تستدعيه الصفحات يمرّ من هنا.
// تضيف الحقول المشتركة (id، التواريخ، المُنشئ)، وتطبّع الجوال والبحث، وتتحقق من الحد الأدنى،
// ثم تمرّر إلى المحوّل (IndexedDB الآن، خادم لاحقًا عبر setAdapter).

import { indexedDbAdapter } from './adapters/indexeddb.js';
import { SCHEMAS, ENUMS, STORES } from './schema.js';
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
  deals(rec) {
    rec.finalPrice = toNumberOrNull(rec.finalPrice);
    rec.commission = toNumberOrNull(rec.commission);
    rec.notes = trim(rec.notes);
    rec.searchKey = buildSearchKey([rec.notes]);
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
  invoices(rec) {
    rec.type = trim(rec.type);
    rec.number = trim(rec.number);
    rec.statement = trim(rec.statement);
    rec.notes = trim(rec.notes);
    rec.clientId = rec.clientId || null;
    rec.clientName = trim(rec.clientName);
    rec.clientPhone = normalizePhone(rec.clientPhone);
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
  },
  externalListings(rec, errors) {
    if (!inEnum(ENUMS.externalStatuses, rec.status)) errors.push('حالة العرض الخارجي غير معروفة');
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
  },
};

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
      prepare(rec);
      await adapter.put(store, rec);
      return rec;
    },

    /** يحذف السجل بعد تطبيق قواعد CASCADE (تنظيف المرتبط أو منع الحذف). */
    async remove(id) {
      if (CASCADE[store]) await CASCADE[store](id);
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

  /** يبحث بالجوال (أي صيغة) في phone ثم phone2. */
  async findByPhone(phone) {
    const p = normalizePhone(phone);
    if (!p) return null;
    const byPhone = await adapter.getByIndex('clients', 'phone', p);
    if (byPhone.length) return byPhone[0];
    const all = await adapter.getAll('clients');
    return all.find((c) => c.phone2 === p) ?? null;
  },

  async addContact(clientId, { type, date, note = '', followUpAt = null }) {
    const client = await this.get(clientId);
    if (!client) throw new Error('العميل غير موجود');
    if (!inEnum(ENUMS.contactTypes, type)) throw new ValidationError(['نوع التواصل غير معروف']);
    const contact = {
      id: newId(), type, date: date || nowISO(), note: trim(note), followUpAt: followUpAt || null,
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

  async removeContact(clientId, contactId) {
    const client = await this.get(clientId);
    if (!client) throw new Error('العميل غير موجود');
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
