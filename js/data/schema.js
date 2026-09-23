// مخططات الكيانات: الحقول، القيم الافتراضية، القوائم الثابتة، والحقول التي تظهر بحسب نوع العقار.
// الحقول المشتركة لكل سجل (تضيفها طبقة البيانات): id, createdAt, updatedAt, createdBy, updatedBy, searchKey.

import { FINANCE_STAGES, PAY_METHODS } from '../util/financing.js';

export const STORES = ['clients', 'properties', 'tours', 'requests', 'matches', 'externalListings', 'deals', 'images', 'settings', 'taskLists', 'tasks', 'notes', 'invoices', 'expenses', 'incomes', 'audio', 'showings', 'extractions', 'marketDeals', 'prospectLists', 'prospects', 'facilities'];
// ملاحظة: `trash` (سلة المحذوفات، المرحلة ٢١) ليست في STORES عمدًا — شبكة أمان محلّية
// لا بيانات تُصدَّر: إدراجها في النسخة الاحتياطية يضخّمها بما حذفتَه قصدًا.

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
  // نطاق عقد الوساطة (المرحلة ٤٠) — نظام الوساطة العقارية يشترط عقدًا مكتوبًا محدَّد
  // النطاق، و**ترخيصُ الإعلان لا يُصدَر إلا لعقدٍ يشمل نطاقُه التسويق**. فالنطاق ليس
  // حقلًا وصفيًّا: هو الذي يقول أتستطيع الإعلان عن هذا العقار أم لا.
  agreementScopes: [
    { key: 'sell', label: 'البيع' },
    { key: 'rent', label: 'التأجير' },
    { key: 'market', label: 'التسويق' },
    { key: 'manage', label: 'إدارة الملك' },
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
  // مصادر الإيراد (المرحلة ٣٨): دخلٌ لا يأتي من عمولة صفقة — وكان لا يُسجَّل أصلًا،
  // فصافي الربح يقول أقلّ من الحقيقة، والداشبورد يعرض نصف الصورة.
  incomeCategories: [
    { key: 'commission', label: 'عمولة وساطة' },
    { key: 'management', label: 'إدارة أملاك' },
    { key: 'consulting', label: 'استشارة أو تقييم' },
    { key: 'marketing', label: 'تسويق لعميل' },
    { key: 'rent', label: 'إيجار مملوك' },
    { key: 'other', label: 'أخرى' },
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
  contactTimes: [ // أفضل وقت للاتصال (المرحلة ٣٢)
    { key: 'morning', label: 'صباحًا' },
    { key: 'afternoon', label: 'بعد الظهر' },
    { key: 'evening', label: 'مساءً' },
  ],
  showingStatuses: [ // المعاينة (المرحلة ٢٧)
    { key: 'scheduled', label: 'مجدولة' },
    { key: 'done', label: 'تمّت' },
    { key: 'no_show', label: 'لم يحضر' },
    { key: 'cancelled', label: 'أُلغيت' },
  ],
  showingImpressions: [ // انطباع العميل بعد المعاينة (المرحلة ٢٧)
    { key: 'liked', label: 'أعجبه' },
    { key: 'maybe', label: 'متردّد' },
    { key: 'disliked', label: 'لم يعجبه' },
  ],
  // أولوية المهمة (المرحلة ٤٠): عمودٌ يُرتَّب به ويُفرز، كما في كل أدوات إدارة المهام.
  // وأربعُ درجاتٍ لا أكثر: خمسٌ فأكثر لا يفرّق بينها أحدٌ في الاستعمال اليومي.
  // دورةُ الإيجار في الطلب (المرحلة ٤٢): «٦٠ ألف» سنويًّا غيرُها شهريًّا.
  rentCycles: [
    { key: 'yearly', label: 'سنويّ' },
    { key: 'monthly', label: 'شهريّ' },
  ],
  /**
   * **مراحلُ التمويل** وطريقةُ الدفع (المرحلة ٤٩) — تُقرأ من `js/util/financing.js`
   * فمصدرُها واحد، وتُصدَّر هنا كي تُستعمل كما تُستعمل بقيّةُ القوائم في الاستمارات.
   */
  financeStages: FINANCE_STAGES,
  payMethods: PAY_METHODS,
  taskPriorities: [
    { key: 'urgent', label: 'عاجل', rank: 0, cls: 'badge-danger' },
    { key: 'high', label: 'مرتفعة', rank: 1, cls: 'badge-warn' },
    { key: 'normal', label: 'عادية', rank: 2, cls: 'badge-outline' },
    { key: 'low', label: 'منخفضة', rank: 3, cls: 'badge-outline' },
  ],
  /**
   * **حالُ المرفق** (المرحلة ٥٤) — يعمل، أو تحت الصيانة، أو متوقّف.
   * وثلاثةٌ تكفي: حالٌ رابعةٌ لا تُغيّر ما تفعله اليوم.
   */
  facilityStatuses: [
    { key: 'active', label: 'يعمل' },
    { key: 'maintenance', label: 'تحت الصيانة' },
    { key: 'stopped', label: 'متوقّف' },
  ],
  /**
   * **مآلُ الفرصة** (المرحلة ٥٣) — وإغلاقُها بلا مآلٍ يضيّع أنفعَ ما فيها: أن ترى بعد
   * سنةٍ أنّ أكثرَ ما يفوتك يفوتك **لأنّك تأخّرت**، لا لأنّ السعر لم يناسب.
   */
  prospectOutcomes: [
    { key: 'won', label: 'نضجت وصارت عرضًا' },
    { key: 'lost', label: 'لم تنجح' },
    { key: 'cold', label: 'بردت — تُراجَع لاحقًا' },
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
  // **الأربعةُ الأُوَل لا تكفي وسيطًا في الرياض** (المرحلة ٤٢): العمائرُ والمحالُّ والمكاتبُ
  // تمرّ عليه كلَّ أسبوع، وكان يضيفها بيده في كل جهاز. وإضافتُها مفاتيحُ جديدةٌ على قائمةٍ
  // مدمجة — لا ترحيل، وسجلُّك القديم لا يمسّه شيء.
  { key: 'building', label: 'عمارة', group: 'built', builtin: true },
  { key: 'shop', label: 'محل', group: 'built', builtin: true },
  { key: 'office', label: 'مكتب', group: 'built', builtin: true },
  { key: 'warehouse', label: 'مستودع', group: 'built', builtin: true },
  { key: 'rest_house', label: 'استراحة', group: 'built', builtin: true },
  { key: 'farm', label: 'مزرعة', group: 'land', builtin: true },
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
    { key: 'baths', label: 'دورات المياه', input: 'number' },
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
      // رقم الهوية أو الإقامة (المرحلة ٣٧): يطلبه عقد الإيجار وتوثيقُ الصفقة.
      // اختياري دائمًا — ولا يُطلب إلا ممن يتعاقد فعلًا.
      nationalId: '',
      // الأرشفة (المرحلة ٤٥): **ترشيحُ عرضٍ لا حذف**. المؤرشف باقٍ كما هو ويظهر برقاقة،
      // ويبقى في التقارير والأرقام كما كان — والقائمة اليومية وحدها تخلو منه.
      archivedAt: null,
      // الإسنادُ إلى عضوٍ من الفريق (المرحلة ٤٧). `null` = بلا مسند.
      // **وهو تنسيقٌ لا تصريح**: يقول لمن هذا العمل، ولا يمنع أحدًا من رؤيته.
      assignedTo: null,
      roles: [], // 'owner' | 'seeker'
      tags: [], // تصنيفات من إعدادات clientTags
      stage: 'new', // ENUMS.clientStages
      contacts: [], // [{ id, type, date, note, followUpAt, inferred, createdAt, createdBy }]
      referralSource: '', // تاق المصدر (المرحلة ٨): الوسيط الذي أحال العميل — فارغ افتراضًا فلا يظهر شيء
      /**
       * **الحملةُ التي دخل منها** (المرحلة ٤٩): مفتاحٌ من إعدادات الحملات، و`''` = بلا حملة.
       *
       * `referralSource` **قناة** («سناب»)، وهذه **حملةٌ بعينها** فيها. وحملتان على
       * القناة نفسِها تختلفان كلَّ اختلاف، وكانتا تذوبان في رقمٍ واحد — فلا يُعرف
       * أيُّهما جلبت مشترين وأيُّهما جلبت ضجيجًا.
       */
      campaign: '',
      // تفضيلات التواصل (المرحلة ٣٢): من طلب ألّا تتصل به لا تُلحّ عليه لوحاتك.
      doNotContact: false,
      bestTime: '', // ENUMS.contactTimes — فارغ = بلا تفضيل
    }),
  },
  properties: {
    required: ['city'],
    labels: { city: 'المدينة', type: 'نوع العقار' },
    defaults: () => ({
      city: 'الرياض', district: '', type: '', // type: مفتاح من قائمة الأنواع
      purposes: [], // مجموعة من ENUMS.purposes
      archivedAt: null, // الأرشفة (المرحلة ٤٥) — ترشيحُ عرضٍ لا حذف؛ التقارير لا تراها
      // الإسنادُ إلى عضوٍ من الفريق (المرحلة ٤٧). `null` = بلا مسند.
      // **وهو تنسيقٌ لا تصريح**: يقول لمن هذا العمل، ولا يمنع أحدًا من رؤيته.
      assignedTo: null,
      location: null, // { lat, lng } | null
      // رقم الصك (المرحلة ٣٧): يطلبه عقد الإيجار وكل توثيق، وكان يُكتب في الملاحظات
      // فلا يُبحث فيه ولا يدخل حزمة عقد. نصٌّ حرّ: الصكوك قديمها وحديثها تختلف صيغها.
      deedNumber: '',
      /**
       * **المبنى ورقمُ الوحدة** (المرحلة ٤٨) — نصٌّ حرٌّ لا مخزنٌ ثانٍ.
       *
       * من يدير عمارةً من عشرين شقّةً كان يُدخلها عشرين سجلًّا لا يعرف بعضُها بعضًا:
       * الحيُّ نفسُه والمالكُ نفسُه، **ولا سبيل إلى سؤالٍ واحد**: «عمارةُ الياسمين: كم
       * مؤجَّرةٌ من كم؟ ومتى تشغر الأولى؟».
       *
       * **ونصٌّ حرٌّ لا معرّفٌ إلى مخزنِ مبانٍ**: المخزنُ يستلزم هجرةَ بيانات وشاشةَ
       * إدارةٍ ثالثة، والاسمُ يكفي للتجميع ويدخل مفتاح البحث. وما تشابه إملاؤه يُجمع
       * بعد تطبيعٍ عربيّ، لا بحرفيّة المطابقة.
       */
      building: '', unitNo: '',
      area: null, price: null, // أرقام أو null (السعر غير المعروف = null)
      images: [], // معرّفات في مخزن images
      ownerId: null, // عميل من مخزن clients
      // اتفاقية الوساطة (المرحلة ٣١): متى وُقّعت وكم مدّتها — تُحفظ في العقار لا تُقرأ من
      // الإعدادات، فتعديل المدّة الافتراضية لا يغيّر اتفاقيةً وُقّعت بمدّةٍ أخرى.
      agreementSignedAt: null, agreementDays: null,
      // توثيق العقد ونطاقه (المرحلة ٤٠): النظام يوجب إيداع نسخة العقد لدى الهيئة،
      // ورقمُ العقد الموثَّق هو شاهدُ ذلك. والنطاق يحدّد ما تملك فعله — ومنه التسويق
      // الذي بلا نصٍّ عليه لا يُصدَر ترخيصُ إعلان.
      agreementNumber: '', // رقم العقد الموثَّق في منصّة الوساطة
      agreementScopes: [], // مفاتيح من ENUMS.agreementScopes
      // ترخيص الإعلان العقاري (المرحلة ٤٠): رقمٌ يصدر من منصّة الهيئة ويُكتب في كل
      // إعلانٍ لهذا العقار على أي قناة. null = لا ترخيص، فالإعلان مخالفة.
      // { number, issuedAt, expiresAt }
      adLicense: null,
      notes: '',
      /**
       * **الوصفُ التسويقيّ — ما يُنشر للعميل** (المرحلة ٥٢).
       *
       * كان المنشورُ حقلَ «الملاحظات» نفسَه، **وصفحةُ النشر تعد بخلاف ذلك بالحرف**:
       * «بحقولها التسويقيّة فقط — بلا اسم المالك أو جواله أو ملاحظاتك الداخليّة».
       * فظهر في الصفحة العامّة «المالك يرفض التعاون حاليًا» و«لوحة على العقار بلا رقم
       * — يلزم البحث عن المالك» — **يقرؤها من تفاوضه**.
       *
       * فصار المنشورُ هذا الحقلَ وحدَه. والملاحظاتُ تبقى لك، **ولا تُنقل إليه تلقائيًّا**:
       * نقلُها يُعيد العطبَ نفسَه بابًا آخر. ومن أراد وصفًا كتبه، ومن تركه فارغًا خرج
       * عرضُه بحقائقه بلا وصف — وهو أسلمُ من فضيحة.
       */
      publicDesc: '',
      source: 'manual', // ENUMS.propertySources
      status: 'not_contacted', // مفتاح من قائمة الحالات
      captureStatus: 'approved', // ENUMS.captureStatuses
      tourId: null, // جولة ميدانية (المرحلة ٢)
      signboardImageId: null, // معرّف صورة اللوحة ضمن images (المرحلة ٢) — بنفس نمط externalListings.screenshotImageId
      captureContact: null, // { name, phone, note } مؤقت قبل الاعتماد (المرحلة ٢) — يُستهلك عند الاعتماد لربط/إنشاء العميل ثم يُصفَّر
      typeFields: {}, // الحقول بحسب النوع (TYPE_FIELD_GROUPS)
      extra: {}, // الحقول المخصصة التي يضيفها المستخدم
      referralSource: '', // تاق المصدر (المرحلة ٨) — لا يخلط بـ source أعلاه (مسار الإدخال: جولة/يدوي/خارجي)
      // تاريخ السعر (المرحلة ١٩): [{ at, price }] يُضاف إليه تلقائيًا عند كل تغيير سعر.
      // يجيب: كم خفّض المالك؟ وكم مضى على هذا السعر؟ — وكلاهما ورقة تفاوض.
      priceHistory: [],
      // إدارة الأملاك (المرحلة ٣٨): العقار قد يُدار لصاحبه لا يُباع له — إيجارٌ يُحصَّل،
      // وصيانةٌ تُتابَع، وعقدٌ يُجدَّد بأجرٍ معلوم. وكان هذا يُكتب في الملاحظات نصًّا حرًّا
      // فلا يُفرز به ولا يُذكَّر بانتهائه ولا يُحسب دخلُه.
      // null = ليس تحت الإدارة. وإلّا: { startAt, endAt, feeType, feeValue, notes }
      //   feeType: 'percent' (من الإيجار) | 'fixed' (مبلغ شهريّ)
      management: null,
      // **طلبات الصيانة** (المرحلة ٤٧): `[{ id, at, what, status, cost, bearer, doneAt, note }]`
      //
      // مستأجرٌ يتّصل: «المكيّف لا يبرّد» — **وأين يُكتب؟** لم يكن له مكان: بحثٌ في المشروع
      // كلِّه لا يجد إلا كلمة «صيانة» في *تلميحِ* حقل ملاحظات عقد الإدارة. فيضيع البلاغ،
      // ويضيع معه كم كلّف، ومن تحمّله، ومتى أُنجز.
      //
      // **وكلفتُه تدخل كشفَ المالك**: أجرةُ الإدارة وحدها لا تُخرج صافيه، والصيانةُ التي
      // يتحمّلها تُخصم منه. و`bearer` يقول من يتحمّل: المالك أم المستأجر — وهو موضعُ
      // الخلاف الأوّل في الإدارة، فلا يُخمَّن.
      // و`vendor` و`vendorPhone` (المرحلة ٤٨): البلاغُ كان يعرف كلفتَه ولا يعرف من نفّذه،
      // ومديرُ الأملاك يسأل: «من أصلح مكيّفات هذه العمارة المرّة الماضية؟ وبكم؟».
      maintenance: [],
      /**
       * **العروضُ المقدَّمة** (المرحلة ٤٩): `[{ id, at, amount, from, clientId, status, note }]`.
       *
       * ما بين «تفاوض» و«أُبرمت» هو كلُّ عملِ الوسيط، وكان نصًّا حرًّا في الملاحظات.
       * فلا يُعرف كم عرضًا قُدّم على هذا العقار، ولا بكم، ولا من رفض — **وهي أصدقُ
       * إشارةٍ عن سعرٍ لا يمشي**، وأقوى ما يُقنَع به مالكٌ متمسّكٌ بسعره.
       *
       * و`clientId` اختياريّ: العارضُ قد يكون عميلَك وقد يكون وسيطًا اتّصل بك،
       * و`from` اسمُه نصًّا لمن لا سجلَّ له — فلا يُمنع تسجيلُ عرضٍ لغياب ملفّ.
       */
      offers: [],
      /**
       * **البيعُ على الخارطة** (المرحلة ٤٩) — سوقٌ كاملةٌ كانت خارج النظام.
       *
       * بحثٌ في المشروع كلِّه عن «خارطة» و«وافي» و«تحت الإنشاء» كان يعيد صفرًا. والعقارُ
       * إمّا قائمٌ أو لا شيء. **والوحدةُ على الخارطة عقارٌ بخصائصَ مختلفة**: تاريخُ تسليمٍ
       * مُتعهَّدٌ به، ورخصةُ «وافي» للمشروع لا ترخيصُ إعلانٍ للوحدة.
       *
       * **وثلاثةُ حقولٍ لا مشروعٌ جديد**: `offPlan` يقول ما هو، و`deliveryAt` يُنبَّه
       * قبله بشهر، و`wafiLicense` يُكتب في الإعلان كما يُكتب ترخيصُه.
       * ويظهر التاريخُ في الصفحة العامة **فلا يُباع تحت الإنشاء كأنّه جاهز**.
       */
      offPlan: false, deliveryAt: null, wafiLicense: '',
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
      archivedAt: null, // الأرشفة (المرحلة ٤٥) — ترشيحُ عرضٍ لا حذف؛ التقارير لا تراها
      // الإسنادُ إلى عضوٍ من الفريق (المرحلة ٤٧). `null` = بلا مسند.
      // **وهو تنسيقٌ لا تصريح**: يقول لمن هذا العمل، ولا يمنع أحدًا من رؤيته.
      assignedTo: null,
      // **ما كان يُقرأ ولا يُخزَّن.** «٣ غرف ودورتين، من ٤٥ إلى ٦٠ ألف سنوي» كان المحلّل
      // يقرؤه ثم لا يجد له حقلًا، فيضيع — ولا يدخل المطابقة. وهي أوّل ما يسأل عنه المستأجر.
      rooms: null, // أقلّ عددٍ يقبله — لا عددٌ مطابقٌ بالضبط
      baths: null,
      budgetMin: null, // أرضيّةُ الميزانية: من دونها لا يُعرض عليه ما هو أدنى من سوقه
      // دورةُ الإيجار: «٦٠ ألف» سنويًّا غيرُها شهريًّا، والفرق اثنا عشر ضعفًا. و`''` تعني
      // غيرَ مذكورة، فتُقرأ بالدورة الافتراضية للسوق (سنويّة) ويُقال ذلك ولا يُخمَّن صامتًا.
      rentCycle: '', // ENUMS.rentCycles
      status: 'active', // ENUMS.requestStatuses
      priceFlexibility: null, // نسبة مئوية تتجاوز الإعداد العام، أو null
      priceFlexAmount: null, // مبلغ بالريال يتجاوز النسبة والحدّ الأدنى معًا (المرحلة ٣)
      areaFlexibility: null, // نسبة مئوية لمرونة المساحة تتجاوز الإعداد العام (المرحلة ٣)
      areaFlexAmount: null, // مساحة بالمتر تتجاوز نسبة المساحة وحدّها الأدنى (المرحلة ٣)
      districtZones: [], // مفاتيح نطاقات الأحياء؛ تُوسَّع إلى أحياء عند المطابقة (المرحلة ٣)
      referralSource: '', // تاق المصدر (المرحلة ٨): الوسيط الذي أحال الطلب
      // سبب إيقاف الطلب (المرحلة ٣٥) — ENUMS.matchRejectReasons، ويُسأل مع «موقوف» وحدها
      // (و«مُنجز» صفقةٌ تمّت لا خسارة).
      //
      //
      // النظام يعرف منذ المرحلة ١٣ لماذا رُفض **عرضٌ بعينه** (`rejectReason` على المطابقة)،
      // ولا يعرف لماذا يتركك **الناس**. والفرق بينهما هو الفرق بين تحسين عرضٍ وتحسين نفسك:
      // لو ظهر أن خُمس طلباتك تموت بسبب «تأخّر الردّ» فذلك رقمٌ يغيّر يومك كلّه.
      closeReason: null,
      /**
       * **كيف يدفع؟** (المرحلة ٤٩) — مفتاحٌ من `ENUMS.payMethods`، و`''` = لم يُسأل.
       *
       * حقولُ الطلب كانت عشرين وليس فيها ما يقول كيف يدفع. والفرقُ عمليٌّ لا نظريّ:
       * طالبٌ نقديٌّ بمليونٍ ونصف **مشترٍ خلال أسبوعين**، وطالبٌ بالمبلغ نفسِه ينتظر
       * بنكًا **مشترٍ بعد شهرين وقد لا يشتري**. وهما سطران متشابهان في قائمتك، يأخذان
       * من وقتك بالتساوي.
       *
       * و`''` تعني **لم يُسأل** لا «يحتاج تمويلًا»: الصمتُ لا يُقرأ جوابًا.
       */
      payMethod: '',
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
      commissionPaidAt: null, // متى قُبضت العمولة (المرحلة ١٧) — null = لم تُقبض بعد
      // أقساط العمولة (المرحلة ٤٥): [{ id, dueAt, amount, paidAt, note }] — كشكل دفعات الإيجار.
      //
      // كان القبض تاريخًا واحدًا: قُبضت أو لم تُقبض. والواقع في الرياض نصفٌ عند التوقيع
      // ونصفٌ عند الإفراغ — فكانت الصفقة تُسجَّل إمّا مدفوعةً بالكامل وهو كذب، وإمّا غير
      // مدفوعة وهو كذبٌ آخر. **وتقريرُ مستحقّاتك يقوم على هذا الرقم**، فيخرج مغلوطًا.
      //
      // وفارغةً يبقى `commissionPaidAt` هو الحَكَم كما كان، فلا تنكسر صفقةٌ قديمة.
      commissionPayments: [],
      // جدول دفعات الإيجار (المرحلة ٢٤): [{ id, dueAt, amount, paidAt, note }]
      // العقد الإيجاري دفعات بمواعيد لا مبلغًا واحدًا، وتذكير انتهاء العقد وحده لا يكفي.
      payments: [],
      // مسار الصفقة (المرحلة ٢٤): [{ key, label, done, doneAt }] — قائمة تحقّق تُبنى من
      // إعداداتك عند الإنشاء وتبقى محفوظة في الصفقة، فلا يغيّر تعديلُ القالب صفقةً ماضية.
      checklist: [],
      // العمولة المشتركة (المرحلة ٢٤): وسيط شريك له نصيب من عمولتك.
      partnerName: '', partnerShare: null, partnerPaidAt: null,
      /**
       * **مَن أتمّها من فريقك** (المرحلة ٤٨). `null` = بلا مسند.
       *
       * كان الإسنادُ على العميل والعقار والطلب **وليس على الصفقة**، فتُنسب الصفقةُ لمن
       * أدخلها بجهازه لا لمن أتمّها — ولا حقلَ يُصحَّح به. وهي أضعفُ موضعٍ في قياس الأداء:
       * صفقةٌ يُدخلها المديرُ نيابةً عن موظّفه تُحسب له هو.
       */
      assignedTo: null,
      /**
       * **حصّةُ وسيطك من العمولة** نسبةً مئويّة (المرحلة ٤٨). `null` = بلا حصّة.
       *
       * `partnerShare` أعلاه لوسيطٍ **خارجيّ** من مكتبٍ آخر. وأشهرُ ترتيبٍ في المكاتب —
       * نصفُ العمولة للوسيط الذي أتمّها — لم يكن له حقل. فلا الموظّفُ يعرف ما استحقّه،
       * ولا المديرُ ما عليه، ولوحةُ الأداء تعرض عمولةَ المكتب كأنّها عمولةَ الوسيط.
       *
       * **وهي حسابٌ لا التزام**: ورقةٌ تُقرأ، ولا يقع بها صرفٌ ولا قيدٌ في المالية.
       */
      agentShare: null,
      // طلب التقييم بعد الصفقة (المرحلة ٢٥): متى طلبتَه — null = لم يُطلب بعد.
      reviewRequestedAt: null,
      // ذكرى الصفقة السنوية (المرحلة ٣٢): متى هنّأتَه بها آخر مرّة.
      anniversaryGreetedAt: null,
      /**
       * **التمويل** (المرحلة ٤٩): أين وصل، وعند أيّ بنك، ومتى تحرّك آخر مرّة.
       *
       * `financeStage` مفتاحٌ من `ENUMS.financeStages` و`''` = لم يُقل عنه شيء.
       * و`financeAt` **يُحدَّث عند تغيّر المرحلة وحدها** لا عند كل حفظ — وإلّا لأسكت
       * تنبيهَ «وقف عند البنك» كلَّ مرّةٍ تفتح فيها الصفقةَ وتحفظها.
       */
      financeStage: '', financeBank: '', financeAt: null, financeNote: '',
    }),
  },
  /**
   * **صفقاتُ السوق** (المرحلة ٥٠) — ما بِيع فعلًا، لا ما يُعرض.
   *
   * كلُّ ما في النظام قبلها **مخزونُك أنت**: أسعارُ عرضِك، وصفقاتُك، وآراءُ من عاينوا.
   * و«تقدير السعر» يقيس حيًّا بعقاراتك فيه — فإن لم يكن لك فيه إلا اثنان، قِيس الحيُّ
   * باثنين. **والسوقُ الحقيقيُّ عند وزارة العدل**: كلُّ صفقةٍ مُفرَغة بمساحتها وسعرها.
   *
   * `source` من أين جاءت (`moj` · `rega` · `manual`…) — **ويبقى مع كلّ صفّ**: رقمٌ لا
   * يُعرف مصدرُه لا يُحاجّ به مالك. و`pricePerM` يُحسب عند الحفظ لا عند العرض، فيُفرز به.
   */
  marketDeals: {
    required: ['city', 'date'],
    labels: { city: 'المدينة', date: 'تاريخ الصفقة' },
    defaults: () => ({
      source: 'manual',
      date: '', city: '', district: '', type: '', purpose: 'sale',
      area: null, price: null, pricePerM: null,
      // **بصمةُ الصفّ**: تُبنى من حقوله فيُكشف التكرار عند إعادة استيراد ملفٍّ متداخل —
      // والبوّابات تُصدِّر مدًى يشمل ما سبق، فالاستيرادُ مرّتين هو الحالة العاديّة.
      fingerprint: '',
      note: '',
    }),
  },
  showings: { // المعاينات (المرحلة ٢٧): الموعد وما قاله العميل بعده
    required: ['at'],
    labels: { at: 'موعد المعاينة' },
    defaults: () => ({
      at: '', // ISO — التاريخ والوقت معًا
      // الإسناد (المرحلة ٤٨): «فلان، عندك معاينةُ الخامسة» — أوّلُ ما يقوله مديرٌ تحته وسطاء.
      assignedTo: null,
      clientId: null,
      propertyId: null, externalId: null, // من مخزونك أو عرض خارجي — أحدهما
      requestId: null, // الطلب الذي جاءت منه، إن جاءت من المطابقات
      status: 'scheduled', // ENUMS.showingStatuses
      impression: null, // ENUMS.showingImpressions — يُسأل بعد المعاينة
      reason: null, // ENUMS.matchRejectReasons — عند «لم يعجبه»
      notes: '',
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
  audio: { // الملاحظات الصوتية (المرحلة ٢٦): مخزن مستقل كالصور — الصوت لا يُحشر في سجل العميل
    required: [],
    labels: {},
    defaults: () => ({
      entity: 'contact', entityId: null, // entityId = معرّف العميل صاحب السجل
      mime: 'audio/webm', blob: null, seconds: 0, size: 0,
    }),
  },
  taskLists: { // صفحة المهام (المرحلة ٧)
    required: ['title'],
    labels: { title: 'اسم القائمة' },
    // `pinned` (المرحلة ٤٠): قائمةٌ مثبَّتة تتقدّم غيرَها مهما كان ترتيبها — ما تعمل فيه
    // اليوم أمامك، لا في آخر لوحةٍ تُمرَّر إليها.
    defaults: () => ({ title: '', order: 0, pinned: false }),
  },
  tasks: { // صفحة المهام (المرحلة ٧)
    required: ['listId', 'title'],
    labels: { listId: 'القائمة', title: 'العنوان' },
    defaults: () => ({
      listId: null, title: '', notes: '', order: 0,
      // الإسناد (المرحلة ٤٨): المهمّةُ فعلٌ يُوزَّع — «فلان، تابع عميل النرجس».
      // وكان النظام يوزّع الطلبات بالتناوب ثم يقف عند الطلب، والعملُ المتولّد عنه لا يُوزَّع.
      assignedTo: null,
      done: false, doneAt: null,
      dueAt: null, // تاريخ ووقت التذكير (ISO) أو null
      reminded: false, // مانع تكرار تنبيه المتصفح لهذه المهمة — يُصفَّر تلقائيًا إن غُيِّر dueAt
      repeat: 'none', // ENUMS.taskRepeats — إنجاز المهمة المتكررة يُنشئ التالية بموعدها (المرحلة ١١)
      priority: 'normal', // ENUMS.taskPriorities (المرحلة ٤٠)
      linkType: null, linkId: null, // ENUMS.linkTypes — ربط اختياري بعميل/عقار/طلب
    }),
  },
  /**
   * **قوائمُ الفرص العقاريّة** (المرحلة ٥٣) — مراحلُ لا تصنيفات.
   *
   * وهي كقوائم المهامّ عمدًا: القائمةُ عمودٌ، والبطاقةُ تنتقل بين الأعمدة بزرّ لا بسحب
   * — **والسحبُ لا يعمل باللمس بلا تعقيدٍ لا يستحقّه**.
   */
  prospectLists: {
    required: ['title'],
    labels: { title: 'اسم القائمة' },
    defaults: () => ({ title: '', order: 0, pinned: false }),
  },
  /**
   * **الفرصةُ العقاريّة** (المرحلة ٥٣) — **بابٌ لم يُفتح بعد**، لا عرضٌ ولا طلب.
   *
   * ولماذا لا تُحفظ عقارًا في مخزونك؟ لأنّ مخزونك **يُطابَق ويُرسَل ويُنشَر**: مزادٌ
   * لم يُعلَن بعدُ، وورثةٌ يتقاسمون، ومالكٌ ينوي ولم يعرض — لو دخلت هذه مخزونَك صارت
   * عروضًا وهميّةً تُرسَل لعملائك وتُنشر في صفحتك العامّة. **وأنت مسؤولٌ نظامًا عمّا
   * تعرض**. فصار لها بابُها: تُتابَع وتُنقل بين المراحل، **فإن نضجت حُوِّلت عرضًا
   * بضغطة** ودخلت المخزون كما يدخل أيُّ عرض.
   *
   * و`sourceKind`/`source` يقولان من أين جاءت — فرقٌ بين فرصةٍ من مالكٍ تعرفه وأخرى
   * سمعتَها في مجلس، **ورقمٌ لا يُعرف مصدرُه لا يُبنى عليه**.
   */
  prospects: {
    required: ['listId', 'title'],
    labels: { listId: 'القائمة', title: 'العنوان' },
    defaults: () => ({
      listId: null, title: '', notes: '', order: 0,
      city: '', district: '', type: '', purpose: 'sale',
      price: null, area: null,
      contactName: '', contactPhone: '',
      source: '', // بكلماتك: «مجلس أبو سعد»، «إعلان مزاد»، «تحويل من تيليجرام»
      assignedTo: null, // الإسناد كما في المهامّ (المرحلة ٤٨)
      priority: 'normal', // ENUMS.taskPriorities — الأولويّةُ هي هي، فلا تُخترع ثانية
      dueAt: null, reminded: false, // موعدُ المتابعة — وآليّةُ التذكير نفسُها
      done: false, doneAt: null,
      // ماذا صارت إليه: `null` ما دامت حيّة. و«لم تنجح» تُقال بسببها لا صامتة.
      outcome: null, // ENUMS.prospectOutcomes
      outcomeReason: '',
      madePropertyId: null, // إن نضجت وصارت عرضًا في مخزونك
      linkType: null, linkId: null, // ENUMS.linkTypes
    }),
  },
  /**
   * **المرفق** (المرحلة ٥٤) — مصعدٌ ومولّدٌ وخزّانٌ وموقف.
   *
   * وهي **أوّلُ صورةٍ للمخزن**، مقصودةٌ قليلةَ الحقول: اسمٌ وحالٌ وعقارٌ يتبعه وملاحظة.
   * وما يُضاف إليها لاحقًا (عقودُ الصيانة الدوريّة، والمورّد، ودورةُ الفحص) يُضاف حقولًا
   * افتراضيُّها فارغ **بلا هجرةٍ ولا كسرٍ لما حُفظ** — كما جرى في كلّ مخزنٍ قبله.
   */
  facilities: {
    required: ['name'],
    labels: { name: 'اسم المرفق' },
    defaults: () => ({
      name: '', kind: '', // نوعٌ حرٌّ: «مصعد» · «مولّد» · «خزّان» — ولا تُفرض قائمةٌ لم تُطلب
      propertyId: null,   // العقارُ الذي يتبعه — و`null` مرفقٌ عامٌّ لا يتبع واحدًا
      status: 'active',   // ENUMS.facilityStatuses
      notes: '',
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
  extractions: { // تفريغ المستندات والوسائط (المرحلة ٤١)
    required: [],
    labels: {},
    defaults: () => ({
      // `source`: 'paste' | 'ocr' | 'transcribe' — من أين جاء النصّ، فيُعرف ما يُوثق به
      source: 'paste',
      kind: null, // نوع المستند كما خُمّن (ENUMS-حرّ: deed/id/permit/lease/voice)
      fileName: '', mime: '', size: 0,
      text: '', // النصّ المفرَّغ — قابلٌ للتعديل دائمًا
      fields: {}, // الحقول المقروءة منه
      status: 'new', // 'new' | 'approved' — المعتمَد هو ما راجعتَه بعينك
      warnings: [],
      // ما أُنشئ منه: يمنع الإنشاء مرّتين، ويجعل السجلّ يقول ماذا صار إليه
      madePropertyId: null, madeRequestId: null, madeTaskId: null, madeClientId: null,
      error: '', // سببُ فشل التفريغ إن فشل — يُقال ولا يُبتلع
    }),
  },
  incomes: { // الإيرادات (المرحلة ٣٨): دخلٌ خارج عمولات الصفقات
    required: ['date', 'amount'],
    labels: { date: 'التاريخ', amount: 'المبلغ' },
    defaults: () => ({
      date: '', amount: null,
      category: 'other', // ENUMS.incomeCategories
      note: '',
      /**
       * **يتكرّر شهريًّا** (المرحلة ٤٨). `false` = قيدٌ لمرّةٍ واحدة.
       *
       * المهمّةُ لها `repeat` منذ المرحلة ١١، **والمصروفُ والإيرادُ ليس لهما**. ورسومُ
       * الخدمات والنظافةُ والحارسُ واشتراكُ الإعلان وإيجارُ مكتبك أرقامٌ ثابتةٌ تُعاد
       * كتابتُها شهرًا بشهر، أو تُنسى فيخرج الصافي أعلى ممّا هو.
       *
       * **ولا يُكتب القيدُ التالي وحده**: يُقترح في «المالية» ويُعتمد بضغطة — فالمبلغ
       * قد يتغيّر، وقيدٌ يقع في دفترٍ بلا علمِ صاحبه أسوأُ من قيدٍ يُنسى.
       */
      repeatMonthly: false,
      clientId: null, propertyId: null, dealId: null, // ربط اختياري
      // مصدر العميل الذي جاء منه هذا الدخل — يلتقي بتقرير المصادر كما يلتقي المصروف.
      source: '',
    }),
  },
  expenses: { // المصاريف (المرحلة ١٣): الإيراد بلا مصروف ليس ربحًا
    required: ['date', 'amount'],
    labels: { date: 'التاريخ', amount: 'المبلغ' },
    defaults: () => ({
      date: '', amount: null,
      category: 'other', // ENUMS.expenseCategories
      note: '',
      /**
       * **يتكرّر شهريًّا** (المرحلة ٤٨). `false` = قيدٌ لمرّةٍ واحدة.
       *
       * المهمّةُ لها `repeat` منذ المرحلة ١١، **والمصروفُ والإيرادُ ليس لهما**. ورسومُ
       * الخدمات والنظافةُ والحارسُ واشتراكُ الإعلان وإيجارُ مكتبك أرقامٌ ثابتةٌ تُعاد
       * كتابتُها شهرًا بشهر، أو تُنسى فيخرج الصافي أعلى ممّا هو.
       *
       * **ولا يُكتب القيدُ التالي وحده**: يُقترح في «المالية» ويُعتمد بضغطة — فالمبلغ
       * قد يتغيّر، وقيدٌ يقع في دفترٍ بلا علمِ صاحبه أسوأُ من قيدٍ يُنسى.
       */
      repeatMonthly: false,
      dealId: null, propertyId: null, // ربط اختياري: مصروف يخصّ صفقة أو عقارًا بعينه
      // مصدر العميل الذي صُرف هذا المبلغ لاجتذابه (المرحلة ٣٥).
      //
      // تقرير المصادر يعدّ الصفقات والعمولة، ولا يعرف **كم كلّفت**. فتعرف أن «سناب» أعطاك
      // ثلاث صفقات، ولا تعرف أنها كلّفتك أربعين ألفًا بينما أعطاك «إحالة عميل قديم» صفقتين
      // بصفر. وحقلٌ واحد هنا يحوّل التقرير من عدٍّ إلى ربح.
      source: '',
    }),
  },
  invoices: { // الفواتير وعروض الأسعار (المرحلة ٨)
    required: ['type', 'date'],
    labels: { type: 'نوع المستند', date: 'التاريخ' },
    defaults: () => ({
      type: 'invoice', // ENUMS.invoiceTypes
      number: '', // رقم المستند (يُقترح متسلسلًا عند الإنشاء ويبقى قابلًا للتعديل)
      // رابط السداد (المرحلة ٣٧): يُنشَأ من بوابة الدفع حين تُهيَّأ، ويُحفظ ليُرسل ويُتابَع.
      paymentUrl: '', paymentRef: '', paymentCreatedAt: null,
      date: '', // ISO
      clientId: null, // عميل مرتبط (اختياري)
      clientName: '', clientPhone: '', // لقطة اسم/جوال وقت الإصدار: المستند المطبوع لا يتغير بحذف العميل أو تعديله
      statement: '', // البيان: وصف عام أعلى الجدول
      items: [], // [{ id, description, qty, unitPrice }]
      notes: '', // شروط أو ملاحظات تُطبع أسفل المستند
      // التحصيل (المرحلة ١٧): المقبوض رقمٌ لا راية، فالدفعة الجزئية واقعٌ يوميّ.
      // null = لم يُقبض شيء. وعرض السعر لا يُحصَّل أصلًا (ليس مستحقًا حتى يصير فاتورة).
      paidAmount: null, paidAt: null,
      dueAt: null, // تاريخ الاستحقاق — يُحسب عليه التقادم، وبغيابه يُحسب على تاريخ المستند
      // ضريبة القيمة المضافة (المرحلة ١٩): نسبة مئوية تُنسخ من إعداداتك عند الإنشاء وتبقى
      // محفوظة في المستند — فالمستند المطبوع لا تتغيّر أرقامه لو غيّرت النسبة لاحقًا.
      // null = بلا ضريبة (غير مسجَّل، أو مستند معفيّ).
      vatRate: null
    }),
  },
};

/** إجمالي المستند = مجموع (الكمية × سعر الوحدة). دالة خالصة؛ لا يُخزَّن أي مجموع محسوب. */
export function invoiceTotal(invoice) {
  return (invoice?.items || []).reduce((sum, it) => sum + (Number(it.qty) || 0) * (Number(it.unitPrice) || 0), 0);
}

/* ===== التحصيل (المرحلة ١٧) ===== */

/** مبلغ ضريبة القيمة المضافة على المستند. صفر إن لم تُحدَّد نسبة. */
export function invoiceVat(invoice) {
  const rate = Number(invoice?.vatRate);
  if (!Number.isFinite(rate) || rate <= 0) return 0;
  return invoiceTotal(invoice) * (rate / 100);
}

/** الإجمالي المستحَقّ فعلًا: البنود + الضريبة. هو ما يُقبض وما يُطبع وما يُحسب في المستحقات. */
export function invoiceGrandTotal(invoice) {
  return invoiceTotal(invoice) + invoiceVat(invoice);
}

/** المقبوض من مستند، صفرًا إن لم يُقبض شيء. */
export function invoicePaid(invoice) {
  const paid = Number(invoice?.paidAmount);
  return Number.isFinite(paid) && paid > 0 ? paid : 0;
}

/** المتبقّي على المستند. عرض السعر ليس مستحقًا فمتبقّيه صفر دائمًا. */
export function invoiceRemaining(invoice) {
  if (invoice?.type === 'quote') return 0;
  return Math.max(0, invoiceGrandTotal(invoice) - invoicePaid(invoice));
}

/**
 * حالة التحصيل: `quote` (ليس مستحقًا) · `paid` · `partial` · `unpaid`.
 * الإجمالي صفر (مستند بلا بنود) يُعدّ مقبوضًا فلا يظهر في المستحقات إزعاجًا.
 */
export function invoiceCollection(invoice) {
  if (invoice?.type === 'quote') return 'quote';
  const total = invoiceGrandTotal(invoice); // العميل يدفع الإجمالي شاملًا الضريبة لا البنود وحدها
  if (total <= 0) return 'paid';
  const paid = invoicePaid(invoice);
  if (paid <= 0) return 'unpaid';
  return paid + 0.5 >= total ? 'paid' : 'partial'; // نصف ريال تسامحٌ في التقريب لا فرق حقيقي
}

/* ===== الصفقة: الدفعات والمسار والعمولة المشتركة (المرحلة ٢٤) ===== */

/** صافي عمولتك بعد نصيب الشريك — هو ما يدخل جيبك فعلًا. */
export function netCommission(deal) {
  const total = Number(deal?.commission) || 0;
  const partner = Number(deal?.partnerShare) || 0;
  return Math.max(0, total - partner);
}

/** الدفعات المستحقّة ولم تُقبض حتى تاريخ معيّن. */
export function duePayments(deal, until = Date.now()) {
  return (deal?.payments || [])
    .filter((p) => !p.paidAt && p.dueAt && new Date(p.dueAt).getTime() <= until)
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt));
}

/**
 * صفقات تستحق طلب تقييم (المرحلة ٢٥).
 *
 * التوقيت هو كل شيء: **بعد يومين** من الصفقة لا لحظتها (طلبٌ في اللحظة يبدو انتزاعًا)،
 * وقبل ثلاثين يومًا (بعدها بردت الحماسة وصار الطلب ثقيلًا). ومرة واحدة لكل صفقة.
 */
export function reviewCandidates(deals = [], { now = Date.now(), minDays = 2, maxDays = 30 } = {}) {
  const DAY = 86400000;
  return deals
    .filter((d) => !d.reviewRequestedAt && d.clientId && d.date)
    .map((d) => ({ deal: d, since: Math.floor((now - new Date(d.date).getTime()) / DAY) }))
    .filter((x) => Number.isFinite(x.since) && x.since >= minDays && x.since <= maxDays)
    .sort((a, b) => b.since - a.since);
}

/** تقدّم مسار الصفقة: منجَز من إجمالي، أو null إن لم يكن لها مسار. */
export function checklistProgress(deal) {
  const items = deal?.checklist || [];
  if (!items.length) return null;
  const done = items.filter((i) => i.done).length;
  return { done, total: items.length, complete: done === items.length };
}

export const COLLECTION_LABELS = {
  unpaid: 'لم يُقبض', partial: 'مقبوض جزئيًا', paid: 'مقبوض', quote: 'عرض سعر',
};
