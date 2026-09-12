// مخططات الكيانات: الحقول، القيم الافتراضية، القوائم الثابتة، والحقول التي تظهر بحسب نوع العقار.
// الحقول المشتركة لكل سجل (تضيفها طبقة البيانات): id, createdAt, updatedAt, createdBy, updatedBy, searchKey.

export const STORES = ['clients', 'properties', 'tours', 'requests', 'matches', 'externalListings', 'deals', 'images', 'settings'];

export const ENUMS = {
  clientRoles: [
    { key: 'owner', label: 'مالك عرض' },
    { key: 'seeker', label: 'صاحب طلب' },
  ],
  clientStages: [
    { key: 'new', label: 'جديد' },
    { key: 'contacted', label: 'تم التواصل' },
    { key: 'negotiating', label: 'مهتم / تفاوض' },
    { key: 'won', label: 'أُبرمت' },
    { key: 'closed', label: 'مغلق' },
  ],
  contactTypes: [
    { key: 'call', label: 'مكالمة' },
    { key: 'whatsapp', label: 'واتساب' },
    { key: 'visit', label: 'زيارة ميدانية' },
  ],
  purposes: [
    { key: 'sale', label: 'بيع' },
    { key: 'rent', label: 'إيجار' },
    { key: 'investment', label: 'استثمار' },
  ],
  propertySources: [
    { key: 'tour', label: 'جولة ميدانية' },
    { key: 'manual', label: 'إدخال يدوي' },
    { key: 'external', label: 'عرض خارجي' },
  ],
  captureStatuses: [
    { key: 'captured', label: 'بانتظار المعالجة' },
    { key: 'extracted', label: 'بانتظار الاعتماد' },
    { key: 'approved', label: 'معتمد' },
  ],
  requestStatuses: [
    { key: 'active', label: 'نشط' },
    { key: 'paused', label: 'موقوف' },
    { key: 'done', label: 'مُنجز' },
  ],
  matchStatuses: [
    { key: 'new', label: 'جديدة' },
    { key: 'presented', label: 'عُرضت على العميل' },
    { key: 'interested', label: 'مهتم' },
    { key: 'not_interested', label: 'غير مهتم' },
    { key: 'won', label: 'أُبرمت' },
  ],
  externalStatuses: [
    { key: 'active', label: 'نشط' },
    { key: 'unavailable', label: 'لم يعد متاحًا' },
    { key: 'archived', label: 'مؤرشف' },
  ],
  plotPositions: [
    { key: 'corner', label: 'زاوية' },
    { key: 'middle', label: 'وسط' },
  ],
  typeFieldGroups: [
    { key: 'land', label: 'أرض (أطوال، شوارع، مخطط…)' },
    { key: 'built', label: 'مبني (غرف، أدوار، عمر البناء…)' },
    { key: 'none', label: 'بلا حقول إضافية' },
  ],
  customFieldInputs: [
    { key: 'text', label: 'نص' },
    { key: 'number', label: 'رقم' },
  ],
};

export function labelFor(list, key) {
  return list.find((x) => x.key === key)?.label ?? (key || '');
}

/** أنواع العقار المدمجة؛ يضيف المستخدم غيرها من الإعدادات (group يحدد الحقول التي تظهر). */
export const BUILTIN_PROPERTY_TYPES = [
  { key: 'land', label: 'أرض', group: 'land', builtin: true },
  { key: 'villa', label: 'فلة', group: 'built', builtin: true },
  { key: 'floor', label: 'دور', group: 'built', builtin: true },
  { key: 'apartment', label: 'شقة', group: 'built', builtin: true },
];

/** حالات العقار المدمجة؛ يضيف المستخدم غيرها من الإعدادات. */
export const BUILTIN_PROPERTY_STATUSES = [
  { key: 'not_contacted', label: 'لم يتم التواصل معه بعد', builtin: true },
  { key: 'agreed', label: 'موافق للتعاون', builtin: true },
  { key: 'refused', label: 'يرفض التعاون', builtin: true },
  { key: 'rented', label: 'تم التأجير', builtin: true },
  { key: 'sold', label: 'تم البيع', builtin: true },
];

/** الحقول التي تظهر تلقائيًا بحسب مجموعة النوع؛ تُخزَّن في property.typeFields. */
export const TYPE_FIELD_GROUPS = {
  land: [
    { key: 'plotDimensions', label: 'أطوال القطعة', input: 'text', placeholder: 'مثال: 20 × 30' },
    { key: 'streetWidth', label: 'عرض الشارع (م)', input: 'number' },
    { key: 'streetsCount', label: 'عدد الشوارع', input: 'number' },
    { key: 'facades', label: 'الواجهات', input: 'text', placeholder: 'مثال: شمالية شرقية' },
    { key: 'plotPosition', label: 'الموقع في المخطط', input: 'select', options: ENUMS.plotPositions },
    { key: 'planNumber', label: 'رقم المخطط', input: 'text' },
    { key: 'plotNumber', label: 'رقم القطعة', input: 'text' },
  ],
  built: [
    { key: 'rooms', label: 'عدد الغرف', input: 'number' },
    { key: 'floor', label: 'الدور', input: 'text' },
    { key: 'floorsCount', label: 'عدد الأدوار / الشقق', input: 'number' },
    { key: 'buildingAge', label: 'عمر البناء (سنة)', input: 'number' },
    { key: 'buildingCondition', label: 'حالة البناء', input: 'text' },
  ],
  none: [],
};

/** ما يمكن إدراجه في تعريف "مكتمل البيانات" (يُعدَّل من الإعدادات). */
export const COMPLETENESS_CANDIDATES = [
  { key: 'city', label: 'المدينة' },
  { key: 'district', label: 'الحي' },
  { key: 'type', label: 'نوع العقار' },
  { key: 'purposes', label: 'الغرض' },
  { key: 'location', label: 'الموقع الجغرافي' },
  { key: 'ownerPhone', label: 'رقم صاحب العقار' },
  { key: 'area', label: 'المساحة' },
  { key: 'price', label: 'السعر' },
  { key: 'images', label: 'صورة واحدة على الأقل' },
];
export const DEFAULT_COMPLETENESS = ['city', 'district', 'type', 'purposes', 'location', 'ownerPhone'];

/**
 * مخطط كل كيان: الحقول المطلوبة، وقيمه الافتراضية، وعناوين الحقول لرسائل التحقق.
 * الحقول المطلوبة هنا هي الحد الأدنى لصحة السجل في طبقة البيانات؛
 * النماذج قد تفرض أكثر (مثلًا نوع العقار في الإدخال اليدوي).
 */
export const SCHEMAS = {
  clients: {
    required: [],
    labels: { name: 'الاسم', phone: 'الجوال' },
    defaults: () => ({
      name: '', phone: '', phone2: '', notes: '',
      roles: [], // 'owner' | 'seeker'
      tags: [], // تصنيفات من إعدادات clientTags
      stage: 'new', // ENUMS.clientStages
      contacts: [], // [{ id, type, date, note, followUpAt, createdAt, createdBy }]
    }),
  },
  properties: {
    required: ['city'],
    labels: { city: 'المدينة', type: 'نوع العقار' },
    defaults: () => ({
      city: 'الرياض', district: '', type: '', // type: مفتاح من قائمة الأنواع
      purposes: [], // مجموعة من ENUMS.purposes
      location: null, // { lat, lng } | null
      area: null, price: null, // أرقام أو null (السعر غير المعروف = null)
      images: [], // معرّفات في مخزن images
      ownerId: null, // عميل من مخزن clients
      notes: '',
      source: 'manual', // ENUMS.propertySources
      status: 'not_contacted', // مفتاح من قائمة الحالات
      captureStatus: 'approved', // ENUMS.captureStatuses
      tourId: null, // جولة ميدانية (المرحلة ٢)
      signboardImageId: null, // معرّف صورة اللوحة ضمن images (المرحلة ٢) — بنفس نمط externalListings.screenshotImageId
      captureContact: null, // { name, phone, note } مؤقت قبل الاعتماد (المرحلة ٢) — يُستهلك عند الاعتماد لربط/إنشاء العميل ثم يُصفَّر
      typeFields: {}, // الحقول بحسب النوع (TYPE_FIELD_GROUPS)
      extra: {}, // الحقول المخصصة التي يضيفها المستخدم
    }),
  },
  tours: {
    required: ['date'],
    labels: { date: 'التاريخ' },
    defaults: () => ({
      date: '', city: 'الرياض', districts: [], notes: '',
      inferred: false, // true إن استُنتجت من تواريخ الصور
    }),
  },
  requests: {
    required: ['clientId', 'type', 'purpose', 'city'],
    labels: { clientId: 'العميل', type: 'نوع العقار', purpose: 'الغرض', city: 'المدينة' },
    defaults: () => ({
      clientId: null, type: '', purpose: '', city: 'الرياض',
      districts: [], budgetMax: null, area: null, notes: '',
      status: 'active', // ENUMS.requestStatuses
      priceFlexibility: null, // نسبة مئوية تتجاوز الإعداد العام، أو null
      priceFlexAmount: null, // مبلغ بالريال يتجاوز النسبة والحدّ الأدنى معًا (المرحلة ٣)
      areaFlexibility: null, // نسبة مئوية لمرونة المساحة تتجاوز الإعداد العام (المرحلة ٣)
      areaFlexAmount: null, // مساحة بالمتر تتجاوز نسبة المساحة وحدّها الأدنى (المرحلة ٣)
      districtZones: [], // مفاتيح نطاقات الأحياء؛ تُوسَّع إلى أحياء عند المطابقة (المرحلة ٣)
    }),
  },
  matches: {
    required: ['requestId'],
    labels: { requestId: 'الطلب' },
    defaults: () => ({
      requestId: null, propertyId: null, externalId: null,
      score: 0, // 0–100
      status: 'new', // ENUMS.matchStatuses
      priceUnknown: false, notes: '',
    }),
  },
  externalListings: {
    required: [],
    labels: {},
    defaults: () => ({
      rawText: '', sourceUrl: '', platform: '', screenshotImageId: null, postedAt: null,
      advertiserPhone: '', // جوال المعلن (المرحلة ٤) — يُطبَّع كجوال العميل، ويكشف أن العرض قد يكون عقارك
      city: 'الرياض', district: '', type: '', purposes: [], area: null, price: null, location: null, notes: '',
      status: 'active', // ENUMS.externalStatuses
    }),
  },
  deals: {
    required: ['date', 'finalPrice'],
    labels: { date: 'تاريخ الصفقة', finalPrice: 'السعر النهائي' },
    defaults: () => ({
      date: '', finalPrice: null, commission: null, propertyId: null, clientId: null, notes: '',
    }),
  },
  images: {
    required: [],
    labels: {},
    defaults: () => ({
      entity: 'property', entityId: null, mime: 'image/jpeg',
      blob: null, thumb: null, width: null, height: null, size: 0, originalName: '', originalSize: null,
    }),
  },
};
