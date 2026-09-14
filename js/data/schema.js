// مخططات الكيانات: الحقول، القيم الافتراضية، القوائم الثابتة، والحقول التي تظهر بحسب نوع العقار.
// الحقول المشتركة لكل سجل (تضيفها طبقة البيانات): id, createdAt, updatedAt, createdBy, updatedBy, searchKey.

export const STORES = ['clients', 'properties', 'tours', 'requests', 'matches', 'externalListings', 'deals', 'images', 'settings', 'taskLists', 'tasks', 'notes', 'invoices', 'expenses'];

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
  linkTypes: [ // ربط اختياري للمهمة أو الفكرة بسجل آخر (المرحلة ٧)
    { key: 'client', label: 'عميل' },
    { key: 'property', label: 'عقار' },
    { key: 'request', label: 'طلب' },
  ],
  expenseCategories: [ // المصاريف (المرحلة ١٣) — صافي الربح = العمولات − هذه
    { key: 'fuel', label: 'وقود ومواصلات' },
    { key: 'ads', label: 'إعلانات وتسويق' },
    { key: 'partner', label: 'عمولة وسيط شريك' },
    { key: 'fees', label: 'رسوم حكومية' },
    { key: 'office', label: 'مكتب واشتراكات' },
    { key: 'hospitality', label: 'ضيافة' },
    { key: 'other', label: 'أخرى' },
  ],
  matchRejectReasons: [ // سبب رفض المطابقة (المرحلة ١٣) — يكشف نمط ضياع الصفقات
    { key: 'price', label: 'السعر مرتفع' },
    { key: 'location', label: 'الموقع لا يناسب' },
    { key: 'area', label: 'المساحة لا تناسب' },
    { key: 'condition', label: 'حالة العقار أو مواصفاته' },
    { key: 'slow', label: 'تأخّر الردّ أو المعاينة' },
    { key: 'bought_elsewhere', label: 'اشترى من مكان آخر' },
    { key: 'changed_mind', label: 'غيّر رأيه أو أجّل' },
    { key: 'other', label: 'سبب آخر' },
  ],
  taskRepeats: [ // تكرار المهمة (المرحلة ١١): تُنشأ التالية عند إنجاز الحالية
    { key: 'none', label: 'بلا تكرار' },
    { key: 'daily', label: 'يوميًا' },
    { key: 'weekly', label: 'أسبوعيًا' },
    { key: 'monthly', label: 'شهريًا' },
  ],
  invoiceTypes: [ // المستند المالي (المرحلة ٨) — نفس الكيان بمسمّيين وسلسلتَي ترقيم منفصلتين
    { key: 'invoice', label: 'فاتورة' },
    { key: 'quote', label: 'عرض سعر' },
  ],
};

/**
 * تصنيفا العميل المدمجان (المرحلة ٨): حاضران من أول تشغيل بلا إنشاء، لا يُحذفان،
 * ولكل منهما لون ثابت (الصنف CSS) ووزن أولوية يرفع صاحبه أعلى القوائم.
 * التصنيفات نصوص في `client.tags` (لا مفاتيح)، فالتطابق بالنص كما يكتبه المستخدم.
 */
export const BUILTIN_CLIENT_TAGS = [
  { label: 'جادّ', cls: 'tag-serious', priority: 2 },
  { label: 'مهم', cls: 'tag-important', priority: 1 },
];

/** صنف اللون الثابت لتصنيف مدمج، أو '' لأي تصنيف آخر (يبقى بالشكل المحايد الحالي). */
export function clientTagClass(tag) {
  return BUILTIN_CLIENT_TAGS.find((t) => t.label === tag)?.cls ?? '';
}

/**
 * وزن أولوية العميل: ٢ لـ«جادّ» · ١ لـ«مهم» · ٠ لغيرهما (والحامل للاثنين يأخذ الأعلى).
 * دالة خالصة تُستعمل في صفحات العملاء والطلبات والمطابقات لترتيب واحد متّسق.
 */
export function clientPriority(client) {
  const tags = client?.tags || [];
  let best = 0;
  for (const t of BUILTIN_CLIENT_TAGS) if (tags.includes(t.label) && t.priority > best) best = t.priority;
  return best;
}

/** مقارن ترتيب: الأولوية تنازليًا ثم آخر تعديل تنازليًا (الترتيب الأصلي للصفحات). */
export function byClientPriority(clientOf) {
  return (a, b) => {
    const diff = clientPriority(clientOf(b)) - clientPriority(clientOf(a));
    return diff !== 0 ? diff : (b.updatedAt || '').localeCompare(a.updatedAt || '');
  };
}

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
      referralSource: '', // تاق المصدر (المرحلة ٨): الوسيط الذي أحال العميل — فارغ افتراضًا فلا يظهر شيء
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
      referralSource: '', // تاق المصدر (المرحلة ٨) — لا يخلط بـ source أعلاه (مسار الإدخال: جولة/يدوي/خارجي)
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
      referralSource: '', // تاق المصدر (المرحلة ٨): الوسيط الذي أحال الطلب
    }),
  },
  matches: {
    required: ['requestId'],
    labels: { requestId: 'الطلب' },
    defaults: () => ({
      requestId: null, propertyId: null, externalId: null,
      score: 0, // 0–100
      status: 'new', // ENUMS.matchStatuses
      rejectReason: null, // ENUMS.matchRejectReasons — يُسأل عند «غير مهتم» (المرحلة ١٣)
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
      leaseEndAt: null, // نهاية عقد الإيجار (المرحلة ١٣) — يُذكَّر بالتجديد قبل شهر
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
  taskLists: { // صفحة المهام (المرحلة ٧)
    required: ['title'],
    labels: { title: 'اسم القائمة' },
    defaults: () => ({ title: '', order: 0 }),
  },
  tasks: { // صفحة المهام (المرحلة ٧)
    required: ['listId', 'title'],
    labels: { listId: 'القائمة', title: 'العنوان' },
    defaults: () => ({
      listId: null, title: '', notes: '', order: 0,
      done: false, doneAt: null,
      dueAt: null, // تاريخ ووقت التذكير (ISO) أو null
      reminded: false, // مانع تكرار تنبيه المتصفح لهذه المهمة — يُصفَّر تلقائيًا إن غُيِّر dueAt
      repeat: 'none', // ENUMS.taskRepeats — إنجاز المهمة المتكررة يُنشئ التالية بموعدها (المرحلة ١١)
      linkType: null, linkId: null, // ENUMS.linkTypes — ربط اختياري بعميل/عقار/طلب
    }),
  },
  notes: { // صفحة الأفكار والملاحظات (المرحلة ٧)
    required: ['text'],
    labels: { text: 'نص الفكرة' },
    defaults: () => ({
      text: '', color: null, pinned: false, archived: false, tags: [],
      linkType: null, linkId: null, // ENUMS.linkTypes
    }),
  },
  expenses: { // المصاريف (المرحلة ١٣): الإيراد بلا مصروف ليس ربحًا
    required: ['date', 'amount'],
    labels: { date: 'التاريخ', amount: 'المبلغ' },
    defaults: () => ({
      date: '', amount: null,
      category: 'other', // ENUMS.expenseCategories
      note: '',
      dealId: null, propertyId: null, // ربط اختياري: مصروف يخصّ صفقة أو عقارًا بعينه
    }),
  },
  invoices: { // الفواتير وعروض الأسعار (المرحلة ٨)
    required: ['type', 'date'],
    labels: { type: 'نوع المستند', date: 'التاريخ' },
    defaults: () => ({
      type: 'invoice', // ENUMS.invoiceTypes
      number: '', // رقم المستند (يُقترح متسلسلًا عند الإنشاء ويبقى قابلًا للتعديل)
      date: '', // ISO
      clientId: null, // عميل مرتبط (اختياري)
      clientName: '', clientPhone: '', // لقطة اسم/جوال وقت الإصدار: المستند المطبوع لا يتغير بحذف العميل أو تعديله
      statement: '', // البيان: وصف عام أعلى الجدول
      items: [], // [{ id, description, qty, unitPrice }]
      notes: '', // شروط أو ملاحظات تُطبع أسفل المستند
    }),
  },
};

/** إجمالي المستند = مجموع (الكمية × سعر الوحدة). دالة خالصة؛ لا يُخزَّن أي مجموع محسوب. */
export function invoiceTotal(invoice) {
  return (invoice?.items || []).reduce((sum, it) => sum + (Number(it.qty) || 0) * (Number(it.unitPrice) || 0), 0);
}
