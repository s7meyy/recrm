// الإعدادات المخزَّنة في مخزن settings (مفتاح/قيمة) مع دوال مسمّاة لكل مفتاح.
// القوائم القابلة للإضافة = المدمج في schema.js + ما يضيفه المستخدم هنا.

import { repo, newId, setCurrentUser } from './repository.js';
import { BUILTIN_PROPERTY_TYPES, BUILTIN_PROPERTY_STATUSES, BUILTIN_CLIENT_TAGS, DEFAULT_COMPLETENESS } from './schema.js';
import { RIYADH_DISTRICTS, RIYADH_SECTORS, DEFAULT_CITY } from './riyadh-districts.js';
import { DEFAULT_TEMPLATES } from '../util/templates.js';

export const SETTINGS_KEYS = {
  matching: 'matching', // أوزان المعايير وحدود المرونة والحدّ الأدنى للظهور (المرحلة ٣)
  zones: 'zones', // نطاقات الأحياء: { [city]: [{ key, label, districts: [] }] } (المرحلة ٣)
  user: 'user', // { id, name, createdAt }
  lists: 'lists', // { propertyTypes: [], propertyStatuses: [], clientTags: [], cities: [], districts: { city: [] } } — إضافات المستخدم فقط
  customFields: 'customFields', // [{ key, label, input: 'text'|'number', forTypes: [] }]
  completeness: 'completeness', // ['city', ...]
  backup: 'backup', // { lastExportAt }
  ui: 'ui', // { propertiesView, firstRunDone, tasksView, theme, lastVisitAt } — تفضيلات عرض لا بيانات عمل
  seed: 'seed', // { ids: { clients: [], properties: [], images: [] }, insertedAt } | null
  followUp: 'followUp', // { staleContactDays: 14, notify: false } — المرحلة ٦ (تنبيهات المتابعة)
  sidebarOrder: 'sidebarOrder', // ['dashboard', 'properties', …] ترتيب صفحات القائمة الجانبية (المرحلة ٨)
  company: 'company', // بيانات الشركة والشعار وسلسلتا ترقيم المستندات (المرحلة ٨)
  publish: 'publish', // الصفحة العامة: المفتاح والعروض المختارة وآخر نشر (المرحلة ٩)
  vault: 'vault', // النسخة السحابية المشفَّرة: العبارة السرّية والرفع التلقائي (المرحلة ١٠)
  templates: 'templates', // قوالب رسائل واتساب (المرحلة ١١)
  goals: 'goals', // أهداف شهرية (المرحلة ١٣)
  savedSearches: 'savedSearches', // بحوث محفوظة لكل صفحة (المرحلة ١٧)
};

const EMPTY_LISTS = () => ({ propertyTypes: [], propertyStatuses: [], clientTags: [], cities: [], districts: {}, sources: [] });
const shortKey = (prefix) => `${prefix}_${newId().replace(/-/g, '').slice(0, 8)}`;
const norm = (s) => String(s ?? '').trim();
const sortAr = (arr) => [...arr].sort((a, b) => a.localeCompare(b, 'ar'));

/* ===== المستخدم الحالي (هوية محلية بلا تسجيل دخول) ===== */

export async function ensureUser() {
  let user = await repo.settings.get(SETTINGS_KEYS.user);
  if (!user || !user.id) {
    user = { id: newId(), name: 'الوسيط', createdAt: new Date().toISOString() };
    await repo.settings.set(SETTINGS_KEYS.user, user);
  }
  setCurrentUser(user);
  return user;
}

export async function updateUserName(name) {
  const user = await ensureUser();
  const next = { ...user, name: norm(name) || 'الوسيط' };
  await repo.settings.set(SETTINGS_KEYS.user, next);
  setCurrentUser(next);
  return next;
}

/* ===== القوائم القابلة للإضافة ===== */

async function readExtras() {
  return { ...EMPTY_LISTS(), ...(await repo.settings.get(SETTINGS_KEYS.lists, {})) };
}
async function writeExtras(extras) {
  await repo.settings.set(SETTINGS_KEYS.lists, extras);
}

/**
 * القوائم المدمجة + إضافات المستخدم.
 * @returns {{ propertyTypes, propertyStatuses, clientTags, cities, districtsByCity, extras }}
 */
export async function getLists() {
  const extras = await readExtras();
  const cities = [...new Set([DEFAULT_CITY, ...extras.cities])];
  const districtsByCity = {};
  for (const city of cities) {
    const builtin = city === DEFAULT_CITY ? RIYADH_DISTRICTS : [];
    districtsByCity[city] = sortAr(new Set([...builtin, ...(extras.districts[city] || [])]));
  }
  const builtinTags = BUILTIN_CLIENT_TAGS.map((t) => t.label);
  return {
    propertyTypes: [...BUILTIN_PROPERTY_TYPES, ...extras.propertyTypes],
    propertyStatuses: [...BUILTIN_PROPERTY_STATUSES, ...extras.propertyStatuses],
    // المدمجان («جادّ» ثم «مهم») أولًا دائمًا بترتيب أولويتهما، ثم ما أضافه المستخدم مرتبًا عربيًا.
    clientTags: [...builtinTags, ...sortAr(extras.clientTags.filter((t) => !builtinTags.includes(t)))],
    sources: sortAr(extras.sources), // تاق المصدر (المرحلة ٨): قيم مستعملة سابقًا، للاقتراح فقط
    cities,
    districtsByCity,
    extras,
  };
}

export function typeLabel(lists, key) {
  return lists.propertyTypes.find((t) => t.key === key)?.label ?? (key || 'بلا نوع');
}
export function typeGroup(lists, key) {
  return lists.propertyTypes.find((t) => t.key === key)?.group ?? 'none';
}
export function statusLabel(lists, key) {
  return lists.propertyStatuses.find((s) => s.key === key)?.label ?? (key || '');
}

export async function addPropertyType({ label, group = 'none' }) {
  const lists = await getLists();
  const name = norm(label);
  if (!name) throw new Error('اسم النوع مطلوب');
  const existing = lists.propertyTypes.find((t) => t.label === name);
  if (existing) return existing;
  const item = { key: shortKey('type'), label: name, group, builtin: false };
  const extras = lists.extras;
  extras.propertyTypes.push(item);
  await writeExtras(extras);
  return item;
}

export async function removePropertyType(key) {
  const extras = await readExtras();
  if (!extras.propertyTypes.some((t) => t.key === key)) throw new Error('لا يمكن حذف الأنواع المدمجة');
  const inUse = await repo.properties.where('type', key);
  if (inUse.length) throw new Error(`لا يمكن الحذف: ${inUse.length} عقار يستعمل هذا النوع`);
  extras.propertyTypes = extras.propertyTypes.filter((t) => t.key !== key);
  await writeExtras(extras);
}

export async function addPropertyStatus(label) {
  const lists = await getLists();
  const name = norm(label);
  if (!name) throw new Error('اسم الحالة مطلوب');
  const existing = lists.propertyStatuses.find((s) => s.label === name);
  if (existing) return existing;
  const item = { key: shortKey('status'), label: name, builtin: false };
  const extras = lists.extras;
  extras.propertyStatuses.push(item);
  await writeExtras(extras);
  return item;
}

export async function removePropertyStatus(key) {
  const extras = await readExtras();
  if (!extras.propertyStatuses.some((s) => s.key === key)) throw new Error('لا يمكن حذف الحالات المدمجة');
  const inUse = await repo.properties.where('status', key);
  if (inUse.length) throw new Error(`لا يمكن الحذف: ${inUse.length} عقار بهذه الحالة`);
  extras.propertyStatuses = extras.propertyStatuses.filter((s) => s.key !== key);
  await writeExtras(extras);
}

export const isBuiltinClientTag = (label) => BUILTIN_CLIENT_TAGS.some((t) => t.label === norm(label));

export async function addClientTag(label) {
  const extras = await readExtras();
  const name = norm(label);
  if (!name) throw new Error('اسم التصنيف مطلوب');
  if (isBuiltinClientTag(name)) return name; // مدمج أصلًا — لا يُكرَّر في إضافات المستخدم
  if (!extras.clientTags.includes(name)) {
    extras.clientTags.push(name);
    await writeExtras(extras);
  }
  return name;
}

export async function removeClientTag(label) {
  if (isBuiltinClientTag(label)) throw new Error('لا يمكن حذف التصنيفين المدمجين «جادّ» و«مهم»');
  const extras = await readExtras();
  const all = await repo.clients.list();
  const inUse = all.filter((c) => (c.tags || []).includes(label)).length;
  if (inUse) throw new Error(`لا يمكن الحذف: ${inUse} عميل بهذا التصنيف`);
  extras.clientTags = extras.clientTags.filter((t) => t !== label);
  await writeExtras(extras);
}

/* ===== تاق المصدر (المرحلة ٨) ===== */

/**
 * قيم «المصدر» المستعملة سابقًا — اقتراحات فقط، لا قائمة مغلقة: الحقل نصّي حر على
 * العقار والعميل والطلب، وأي قيمة جديدة تُضاف هنا تلقائيًا عند الحفظ (نفس أسلوب addClientTag).
 */
export async function getSources() {
  return sortAr((await readExtras()).sources);
}

export async function addSource(label) {
  const extras = await readExtras();
  const name = norm(label);
  if (!name) return '';
  if (!extras.sources.includes(name)) {
    extras.sources.push(name);
    await writeExtras(extras);
  }
  return name;
}

export async function removeSource(label) {
  const extras = await readExtras();
  extras.sources = extras.sources.filter((x) => x !== label);
  await writeExtras(extras);
}

export async function addCity(name) {
  const extras = await readExtras();
  const city = norm(name);
  if (!city) throw new Error('اسم المدينة مطلوب');
  if (city !== DEFAULT_CITY && !extras.cities.includes(city)) {
    extras.cities.push(city);
    await writeExtras(extras);
  }
  return city;
}

export async function addDistrict(city, name) {
  const extras = await readExtras();
  const district = norm(name);
  const cityName = norm(city);
  if (!cityName || !district) throw new Error('المدينة والحي مطلوبان');
  if (cityName === DEFAULT_CITY && RIYADH_DISTRICTS.includes(district)) return district;
  const list = extras.districts[cityName] || [];
  if (!list.includes(district)) {
    extras.districts[cityName] = [...list, district];
    await writeExtras(extras);
  }
  return district;
}

export async function removeDistrict(city, name) {
  const extras = await readExtras();
  const list = extras.districts[city] || [];
  if (!list.includes(name)) throw new Error('لا يمكن حذف الأحياء المدمجة');
  extras.districts[city] = list.filter((d) => d !== name);
  await writeExtras(extras);
}

/* ===== الحقول المخصصة (تُخزَّن قيمها في property.extra) ===== */

export async function getCustomFields() {
  return repo.settings.get(SETTINGS_KEYS.customFields, []);
}

export async function addCustomField({ label, input = 'text', forTypes = [] }) {
  const fields = await getCustomFields();
  const name = norm(label);
  if (!name) throw new Error('اسم الحقل مطلوب');
  const item = { key: shortKey('field'), label: name, input: input === 'number' ? 'number' : 'text', forTypes: [...forTypes] };
  await repo.settings.set(SETTINGS_KEYS.customFields, [...fields, item]);
  return item;
}

export async function removeCustomField(key) {
  const fields = await getCustomFields();
  await repo.settings.set(SETTINGS_KEYS.customFields, fields.filter((f) => f.key !== key));
}

/* ===== تعريف "مكتمل البيانات" ===== */

export async function getCompleteness() {
  return repo.settings.get(SETTINGS_KEYS.completeness, DEFAULT_COMPLETENESS);
}
export async function setCompleteness(fields) {
  return repo.settings.set(SETTINGS_KEYS.completeness, [...new Set(fields)]);
}

/* ===== النسخ الاحتياطي ===== */

export async function getBackupInfo() {
  return repo.settings.get(SETTINGS_KEYS.backup, { lastExportAt: null });
}
export async function setLastExport(iso) {
  const info = await getBackupInfo();
  return repo.settings.set(SETTINGS_KEYS.backup, { ...info, lastExportAt: iso });
}

/* ===== تفضيلات الواجهة ===== */

export async function getUI() {
  return repo.settings.get(SETTINGS_KEYS.ui, { propertiesView: 'grid' });
}
export async function setUI(patch) {
  const ui = await getUI();
  return repo.settings.set(SETTINGS_KEYS.ui, { ...ui, ...patch });
}

/* ===== تنبيهات المتابعة (المرحلة ٦) ===== */

// `afterShowingDays` (المرحلة ١٧): تُنشأ مهمة متابعة تلقائيًا بعد تعليم المطابقة «عُرضت».
// صفر = معطَّل. والصفقات تموت بالصمت بعد المعاينة أكثر مما تموت بالسعر.
const DEFAULT_FOLLOW_UP = { staleContactDays: 14, notify: false, afterShowingDays: 3 };

export async function getFollowUpSettings() {
  return repo.settings.get(SETTINGS_KEYS.followUp, DEFAULT_FOLLOW_UP);
}
export async function setFollowUpSettings(patch) {
  const current = await getFollowUpSettings();
  const next = { ...current, ...patch };
  next.staleContactDays = Math.max(1, Math.round(Number(next.staleContactDays) || DEFAULT_FOLLOW_UP.staleContactDays));
  next.afterShowingDays = Math.max(0, Math.round(Number(next.afterShowingDays) || 0)); // صفر مقصود = معطَّل
  return repo.settings.set(SETTINGS_KEYS.followUp, next);
}

/* ===== علامة البيانات التجريبية ===== */

export async function getSeedInfo() {
  return repo.settings.get(SETTINGS_KEYS.seed, null);
}
export async function setSeedInfo(info) {
  if (info == null) return repo.settings.remove(SETTINGS_KEYS.seed);
  return repo.settings.set(SETTINGS_KEYS.seed, info);
}

/* ===== إعدادات المطابقة (المرحلة ٣) ===== */

/**
 * القيم الافتراضية لمحرك المطابقة.
 * price.min* بحسب غرض الطلب: البيع والاستثمار بحدٍّ أدنى للمرونة يقاس بمئات الألوف، والإيجار بعشرات الآلاف.
 */
export const DEFAULT_MATCHING = {
  weights: { district: 40, price: 35, area: 25 },
  price: { percent: 12, minSale: 100000, minRent: 10000, minInvestment: 100000 },
  area: { percent: 15, minSqm: 50 },
  minScore: 50, // القيمة الابتدائية لشريط "أظهر ما نسبته ≥" في صفحة المطابقات
  excludeOwnProperties: true, // لا تُعرض على العميل عقاراته هو
};

const numOr = (v, fallback) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : fallback);

/** الإعدادات المخزَّنة مدموجة بالافتراضي (فالنقص لا يُعطّل المحرك). */
export async function getMatchingSettings() {
  const stored = (await repo.settings.get(SETTINGS_KEYS.matching, null)) || {};
  const d = DEFAULT_MATCHING;
  return {
    weights: {
      district: numOr(stored.weights?.district, d.weights.district),
      price: numOr(stored.weights?.price, d.weights.price),
      area: numOr(stored.weights?.area, d.weights.area),
    },
    price: {
      percent: numOr(stored.price?.percent, d.price.percent),
      minSale: numOr(stored.price?.minSale, d.price.minSale),
      minRent: numOr(stored.price?.minRent, d.price.minRent),
      minInvestment: numOr(stored.price?.minInvestment, d.price.minInvestment),
    },
    area: {
      percent: numOr(stored.area?.percent, d.area.percent),
      minSqm: numOr(stored.area?.minSqm, d.area.minSqm),
    },
    minScore: numOr(stored.minScore, d.minScore),
    excludeOwnProperties: stored.excludeOwnProperties !== false,
  };
}

export async function setMatchingSettings(patch) {
  const current = await getMatchingSettings();
  const next = {
    ...current, ...patch,
    weights: { ...current.weights, ...(patch.weights || {}) },
    price: { ...current.price, ...(patch.price || {}) },
    area: { ...current.area, ...(patch.area || {}) },
  };
  await repo.settings.set(SETTINGS_KEYS.matching, next);
  return next;
}

/* ===== نطاقات الأحياء (المرحلة ٣) ===== */

const zonesDraft = () => ({
  [DEFAULT_CITY]: RIYADH_SECTORS.map((s) => ({ key: s.key, label: s.label, districts: [...s.districts] })),
});

/**
 * كل النطاقات لكل المدن. عند أول قراءة تُنسخ قطاعات الرياض مسودّةً قابلة للتعديل والحذف،
 * وتُحفظ فعليًا حتى يصير تعديل المستخدم عليها هو المصدر بعد ذلك.
 */
export async function getZones() {
  const stored = await repo.settings.get(SETTINGS_KEYS.zones, null);
  if (stored && typeof stored === 'object') return stored;
  const draft = zonesDraft();
  await repo.settings.set(SETTINGS_KEYS.zones, draft);
  return draft;
}

export async function getZonesFor(city) {
  const zones = await getZones();
  return zones[norm(city)] || [];
}

export async function addZone(city, { label, districts = [] }) {
  const zones = await getZones();
  const cityName = norm(city);
  const name = norm(label);
  if (!cityName) throw new Error('المدينة مطلوبة');
  if (!name) throw new Error('اسم النطاق مطلوب');
  const list = zones[cityName] || [];
  if (list.some((z) => z.label === name)) throw new Error('يوجد نطاق بهذا الاسم');
  const zone = { key: shortKey('zone'), label: name, districts: [...new Set(districts.map(norm).filter(Boolean))] };
  zones[cityName] = [...list, zone];
  await repo.settings.set(SETTINGS_KEYS.zones, zones);
  return zone;
}

export async function updateZone(city, key, patch = {}) {
  const zones = await getZones();
  const cityName = norm(city);
  const list = zones[cityName] || [];
  const zone = list.find((z) => z.key === key);
  if (!zone) throw new Error('النطاق غير موجود');
  const next = {
    ...zone,
    label: patch.label != null ? norm(patch.label) || zone.label : zone.label,
    districts: patch.districts ? [...new Set(patch.districts.map(norm).filter(Boolean))] : zone.districts,
  };
  zones[cityName] = list.map((z) => (z.key === key ? next : z));
  await repo.settings.set(SETTINGS_KEYS.zones, zones);
  return next;
}

export async function removeZone(city, key) {
  const zones = await getZones();
  const cityName = norm(city);
  zones[cityName] = (zones[cityName] || []).filter((z) => z.key !== key);
  await repo.settings.set(SETTINGS_KEYS.zones, zones);
}

/**
 * يوسّع مفاتيح النطاقات إلى أحياء. دالة خالصة: مرّر قائمة نطاقات المدينة كما جاءت من getZonesFor.
 * المفتاح غير الموجود (نطاق حُذف بعد إنشاء الطلب) يُهمل بصمت.
 */
export function expandZones(cityZones, zoneKeys = []) {
  const byKey = new Map((cityZones || []).map((z) => [z.key, z]));
  const out = [];
  for (const key of zoneKeys || []) {
    const zone = byKey.get(key);
    if (zone) out.push(...zone.districts);
  }
  return [...new Set(out)];
}

/** اسم النطاق للعرض، أو null إن كان المفتاح لا يقابل نطاقًا موجودًا. */
export function zoneLabel(cityZones, key) {
  return (cityZones || []).find((z) => z.key === key)?.label ?? null;
}


/* ===== ترتيب صفحات القائمة الجانبية (المرحلة ٨) ===== */

/**
 * الترتيب المحفوظ كما هو (مفاتيح صفحات). القراءة لا تُصلح شيئًا — الدمج مع الافتراضي
 * في `orderedPageKeys` أدناه، فصفحةٌ تُضاف لاحقًا تظهر تلقائيًا بلا إعادة ضبط.
 */
export async function getSidebarOrder() {
  const stored = await repo.settings.get(SETTINGS_KEYS.sidebarOrder, null);
  return Array.isArray(stored) ? stored : [];
}

export async function setSidebarOrder(order) {
  const clean = [...new Set((order || []).map(norm).filter(Boolean))];
  await repo.settings.set(SETTINGS_KEYS.sidebarOrder, clean);
  return clean;
}

export async function resetSidebarOrder() {
  await repo.settings.remove(SETTINGS_KEYS.sidebarOrder);
}

/**
 * دالة خالصة: المحفوظ أولًا (بلا المفاتيح التي لم تعد موجودة)، ثم أي صفحة جديدة
 * بترتيبها الافتراضي في ذيل القائمة.
 */
export function orderedPageKeys(defaultKeys, savedOrder = []) {
  const known = new Set(defaultKeys);
  const head = (savedOrder || []).filter((k) => known.has(k));
  const seen = new Set(head);
  return [...head, ...defaultKeys.filter((k) => !seen.has(k))];
}

/* ===== بيانات الشركة وترقيم المستندات (المرحلة ٨) ===== */

export const DEFAULT_COMPANY = {
  name: '', phone: '', email: '', address: '', crNumber: '', // السجل التجاري/رقم الترخيص — نص حر يُطبع كما هو
  // اتفاقية الوساطة (المرحلة ١٣): تُطبع من بيانات العقار والمالك + هذه البنود
  commissionPercent: 2.5,
  agreementDurationDays: 90,
  agreementTerms: '',
  logoImageId: null, // صورة في مخزن images (entity: 'company')
  footerNote: '', // شروط أو تذييل يُطبع أسفل كل مستند
  invoicePrefix: 'فاتورة ', quotePrefix: 'عرض سعر ', // بادئة الرقم المقترح لكل سلسلة
  nextInvoiceNo: 1001, nextQuoteNo: 1001, // العدّاد التالي لكل سلسلة (يتقدم عند الحفظ فقط)
};

export async function getCompany() {
  const stored = (await repo.settings.get(SETTINGS_KEYS.company, null)) || {};
  return { ...DEFAULT_COMPANY, ...stored };
}

export async function setCompany(patch) {
  const next = { ...(await getCompany()), ...patch };
  next.nextInvoiceNo = Math.max(1, Math.round(Number(next.nextInvoiceNo) || DEFAULT_COMPANY.nextInvoiceNo));
  next.nextQuoteNo = Math.max(1, Math.round(Number(next.nextQuoteNo) || DEFAULT_COMPANY.nextQuoteNo));
  await repo.settings.set(SETTINGS_KEYS.company, next);
  return next;
}

/** الرقم المقترح للمستند التالي من نوعه (اقتراح فقط — الحقل يبقى قابلًا للكتابة فوقه). */
export function suggestInvoiceNumber(company, type) {
  return type === 'quote'
    ? `${company.quotePrefix}${company.nextQuoteNo}`
    : `${company.invoicePrefix}${company.nextInvoiceNo}`;
}

/**
 * يقدّم عدّاد السلسلة خطوة واحدة **فقط إذا** كان الرقم المحفوظ هو الرقم المقترح نفسه
 * (فالكتابة اليدوية فوقه لا تحرّك العدّاد ولا تُحدث فجوة).
 */
export async function consumeInvoiceNumber(type, usedNumber) {
  const company = await getCompany();
  if (norm(usedNumber) !== suggestInvoiceNumber(company, type)) return company;
  return setCompany(type === 'quote'
    ? { nextQuoteNo: company.nextQuoteNo + 1 }
    : { nextInvoiceNo: company.nextInvoiceNo + 1 });
}


/* ===== الصفحة العامة للعروض (المرحلة ٩) ===== */

export const DEFAULT_PUBLISH = {
  token: '', // مفتاح النشر (PUBLISH_TOKEN نفسه المضبوط على Netlify) — يبقى في هذا الجهاز فقط
  endpoint: '/api/publish', // نسبي: يعمل من نفس الموقع. غيّره لرابط كامل إن نشرت من نطاق آخر
  publicUrl: '/offers/', // رابط الصفحة العامة للعرض على العميل
  listingIds: [], // معرّفات العقارات التي وافقتَ صراحة على نشرها — وما عداها لا يخرج أبدًا
  intro: '', // نص تعريفي يظهر أعلى الصفحة العامة
  showPrice: true, // إظهار السعر للعميل
  contactPhone: '', // جوال التواصل في بطاقات العروض (افتراضه جوال الشركة)
  lastPublishAt: null,
  lastPublishCount: 0,
  publishedRefs: [], // [[propertyId, ref]] من آخر نشرة — لبناء روابط العروض المفردة (المرحلة ١٠)
};

export async function getPublishSettings() {
  const stored = (await repo.settings.get(SETTINGS_KEYS.publish, null)) || {};
  return { ...DEFAULT_PUBLISH, ...stored, listingIds: [...(stored.listingIds || [])] };
}

export async function setPublishSettings(patch) {
  const next = { ...(await getPublishSettings()), ...patch };
  next.listingIds = [...new Set(next.listingIds || [])];
  await repo.settings.set(SETTINGS_KEYS.publish, next);
  return next;
}


/* ===== الخزنة السحابية المشفَّرة (المرحلة ١٠) ===== */

export const DEFAULT_VAULT = {
  // العبارة السرّية تُحفظ في هذا الجهاز فقط ليعمل الرفع التلقائي؛ الخادم لا يراها ولا يرى
  // بياناتك (التشفير كله في المتصفح). نسيانها = فقدان النسخ السحابية، فلا أحد يستطيع فكّها.
  passphrase: '',
  auto: false, // رفع تلقائي عند فتح التطبيق إذا مضى أكثر من يوم على آخر رفع
  lastUploadAt: null,
  lastUploadCounts: null,
};

export async function getVaultSettings() {
  return { ...DEFAULT_VAULT, ...((await repo.settings.get(SETTINGS_KEYS.vault, null)) || {}) };
}

export async function setVaultSettings(patch) {
  const next = { ...(await getVaultSettings()), ...patch };
  await repo.settings.set(SETTINGS_KEYS.vault, next);
  return next;
}


/* ===== قوالب رسائل واتساب (المرحلة ١١) ===== */

/** القوالب المحفوظة، أو المدمجة عند أول قراءة (لا تُكتب حتى يعدّلها المستخدم). */
export async function getTemplates() {
  const stored = await repo.settings.get(SETTINGS_KEYS.templates, null);
  return Array.isArray(stored) && stored.length ? stored : DEFAULT_TEMPLATES.map((t) => ({ ...t }));
}

export async function setTemplates(list) {
  const clean = (list || [])
    .map((t) => ({ key: norm(t.key) || shortKey('tpl'), label: norm(t.label), body: String(t.body ?? '') }))
    .filter((t) => t.label && t.body);
  await repo.settings.set(SETTINGS_KEYS.templates, clean);
  return clean;
}

export async function resetTemplates() {
  await repo.settings.remove(SETTINGS_KEYS.templates);
  return DEFAULT_TEMPLATES.map((t) => ({ ...t }));
}


/* ===== الأهداف الشهرية وحدّ العرض البائت (المرحلة ١٣) ===== */

export const DEFAULT_GOALS = {
  dealsPerMonth: 0, // 0 = بلا هدف (فلا يظهر شريط تقدّم يزعجك بلا داعٍ)
  commissionPerMonth: 0,
  staleListingDays: 60, // عقار لم يُحدَّث منذ هذه المدة يُعدّ بائتًا ويُنبَّه عليه
};

export async function getGoals() {
  const stored = (await repo.settings.get(SETTINGS_KEYS.goals, null)) || {};
  const num = (v, d) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Math.max(0, Number(v)) : d);
  return {
    dealsPerMonth: num(stored.dealsPerMonth, DEFAULT_GOALS.dealsPerMonth),
    commissionPerMonth: num(stored.commissionPerMonth, DEFAULT_GOALS.commissionPerMonth),
    staleListingDays: Math.max(7, num(stored.staleListingDays, DEFAULT_GOALS.staleListingDays)),
  };
}

export async function setGoals(patch) {
  const next = { ...(await getGoals()), ...patch };
  await repo.settings.set(SETTINGS_KEYS.goals, next);
  return next;
}

/* ===== بحوث محفوظة (المرحلة ١٧) ===== */

/**
 * تركيبة فرز وبحث تحفظها باسم وتستدعيها بنقرة.
 * الشكل: `{ [pageKey]: [{ id, name, state }] }` — مفتاحٌ لكل صفحة، فإضافة صفحة أخرى
 * لاحقًا لا تمسّ هذه الدوال. و`state` غرضٌ حرّ تفهمه الصفحة وحدها (شكله عقدٌ بينها وبين نفسها).
 */
export async function getSavedSearches(page) {
  const all = await repo.settings.get(SETTINGS_KEYS.savedSearches, {});
  const list = Array.isArray(all?.[page]) ? all[page] : [];
  return list.filter((x) => x && x.id && x.name);
}

export async function addSavedSearch(page, name, state) {
  const clean = norm(name);
  if (!clean) throw new Error('اكتب اسمًا للبحث');
  const all = await repo.settings.get(SETTINGS_KEYS.savedSearches, {});
  const list = Array.isArray(all?.[page]) ? all[page] : [];
  // الاسم نفسه يستبدل السابق: «فلل النرجس» مرتين بحالتين مختلفتين إرباكٌ لا فائدة فيه.
  const next = [...list.filter((x) => x.name !== clean), { id: shortKey('search'), name: clean, state }];
  await repo.settings.set(SETTINGS_KEYS.savedSearches, { ...all, [page]: next });
  return next;
}

export async function removeSavedSearch(page, id) {
  const all = await repo.settings.get(SETTINGS_KEYS.savedSearches, {});
  const list = Array.isArray(all?.[page]) ? all[page] : [];
  const next = list.filter((x) => x.id !== id);
  await repo.settings.set(SETTINGS_KEYS.savedSearches, { ...all, [page]: next });
  return next;
}
