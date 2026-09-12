# عقد طبقة البيانات — مُطابِق (بعد المرحلة ٥)

> أرفق هذا الملف في محادثات المراحل التالية بدل الكود. كل ما تحتاجه الصفحات موجود في `repo` (ملف `js/data/repository.js`)
> وفي وحدات `settings.js` و`images.js` و`backup.js` و`extraction.js` (المرحلة ٢) و`matching.js` (المرحلة ٣) و`listing-parse.js` (المرحلة ٤). لا تصل الصفحات إلى IndexedDB مباشرة.
> القسم ١٠ يوثّق إضافات المرحلة ٢ (الالتقاط، EXIF، كشف التكرار)، والقسم ١١ إضافات المرحلة ٣ (الطلبات، المطابقة، النطاقات)، والقسم ١٢ إضافات المرحلة ٤ (العروض الخارجية)، والقسم ١٣ إضافات المرحلة ٥ (الخريطة والداشبورد)؛ وبقية الملف من المرحلة ١ ولا يزال ساريًا كما هو.
>
> **التسعير التقديري (الصفحة ٨) لم يُبنَ**: أُجِّل بقرار المالك إلى تطوير لاحق، ونقاط القسم ٧ / ١٨–٢٢ في وثيقة الخطة ما زالت مفتوحة. ولا يوجد في الكود أي أثر له (لا مخزن، ولا إعدادات، ولا دوال).

## ١. الأساسيات

- **التخزين:** IndexedDB، قاعدة `motabiq` إصدار `1`. المحوّل `js/data/adapters/indexeddb.js` هو الملف الوحيد الذي يُستبدل عند الانتقال إلى خادم؛ واجهته:
  `init() · get(store, key) · getAll(store) · getByIndex(store, index, value) · put(store, record) · putMany(store, records) · delete(store, key) · deleteMany(store, keys) · clear(store) · count(store) · replaceAll({ store: records[] })` — كلها تعيد Promise.
  للتبديل: `repo.init({ adapter })` أو `setAdapter(adapter)`.
- **المخازن (٩):** `clients · properties · tours · requests · matches · externalListings · deals · images · settings`.
- **الحقول المشتركة** التي تضيفها الطبقة لكل سجل: `id` (UUID)، `createdAt`، `updatedAt` (ISO)، `createdBy`، `updatedBy` (معرّف المستخدم الحالي)، `searchKey` (نص مطبَّع للبحث — لا يُكتب يدويًا).
- **المستخدم الحالي:** هوية محلية `{ id, name, createdAt }` في `settings/user`؛ تُهيّأ بـ `ensureUser()` عند التشغيل. لا مصادقة.
- **الأرقام:** الحقول الرقمية تُحوَّل بـ `Number` أو تصبح `null` إن فرغت. **السعر غير المعروف = `null`**.
- **الجوال:** يُوحَّد إلى `05XXXXXXXX` (والثابت `01XXXXXXXX`)؛ الأرقام غير السعودية تُحفظ أرقامًا فقط. `searchKey` يتضمن صيغ `5…`، `9665…`، `+9665…` فيُوجد بأي صيغة.
- **التواريخ:** كلها ISO 8601 نصًا. `date` في الجولة والصفقة تاريخ ISO أيضًا (عادةً `YYYY-MM-DD`).
- **الأخطاء:** فشل التحقق يرمي `ValidationError` (`.errors` قائمة رسائل عربية). بقية الأخطاء `Error` برسالة عربية.
- **الفهارس المتاحة لـ `where`:**
  `clients: phone, stage, updatedAt` · `properties: city, district, type, status, ownerId, tourId, captureStatus, updatedAt` · `tours: date` · `requests: clientId, status` · `matches: requestId, propertyId, status` · `externalListings: status` · `deals: propertyId, clientId, date` · `images: entityId`.
  إضافة فهرس جديد = رفع `DB_VERSION` في المحوّل وإضافته إلى `STORE_DEFS` (دالة `upgrade` تنشئ الناقص فقط).

## ٢. الواجهة العامة `repo`

لكل كيان `E` من: `clients, properties, tours, requests, matches, externalListings, deals, images`:

| الدالة | المدخل | المخرج |
|---|---|---|
| `repo.E.defaults()` | — | كائن بالقيم الافتراضية (بلا id) |
| `repo.E.create(data)` | حقول السجل | السجل المحفوظ كاملًا (مع الحقول المشتركة) |
| `repo.E.get(id)` | معرّف | السجل أو `null` |
| `repo.E.list()` | — | كل السجلات (بلا ترتيب مضمون؛ رتّب في الصفحة) |
| `repo.E.where(index, value)` | اسم فهرس وقيمة | السجلات المطابقة |
| `repo.E.update(id, patch)` | تعديل جزئي (الحقول المتداخلة تُستبدل كاملة) | السجل بعد التعديل |
| `repo.E.remove(id)` | معرّف | — (تُطبَّق قواعد الحذف أدناه) |
| `repo.E.search(query)` | نص بأي صيغة عربية | السجلات التي يطابق `searchKey` فيها كل كلمات الاستعلام |
| `repo.E.count()` | — | عدد السجلات |

إضافات خاصة:

- `repo.clients.findByPhone(phone)` → العميل الذي رقمه (أي صيغة) في `phone` أو `phone2`، أو `null`.
- `repo.clients.addContact(clientId, { type, date, note, followUpAt })` → العميل بعد الإضافة (يُنشئ `id, createdAt, createdBy` للتواصل).
- `repo.clients.updateContact(clientId, contactId, patch)` · `repo.clients.removeContact(clientId, contactId)` → العميل بعد التعديل.
- `repo.clients.lastContactAt(client)` → ISO آخر تواصل أو `null`. `repo.clients.nextFollowUp(client)` → `followUpAt` لأحدث تواصل أو `null` (دوال خالصة، لا تلمس التخزين).
- `repo.properties.isComplete(property, { owner, fields })` → `{ complete, missing[] }`؛ `fields` من `getCompleteness()` و`owner` سجل العميل المالك (يلزم لفحص `ownerPhone`).
- `repo.properties.findDuplicates({ phone, location, type, excludeId })` → **جديد في المرحلة ٢.** مصفوفة `{ property, reason: 'phone'|'location', distance? }` للعقارات التي قد تكون تكرارًا: تطابق جوال (عبر مالك عقار آخر مسجَّل بنفس الرقم بأي صيغة) أو موقع ضمن ٣٠ مترًا (معادلة Haversine عبر `distanceMeters` في `location.js`) لعقار بنفس `type`. لا تُطبَّق تلقائيًا — الاستدعاء فقط يعيد المرشحين ليقرر المستخدم (دمج أو إبقاء منفصلًا)؛ الاستعمال في `tour-approve.js`.
- `repo.settings.get(key, fallback) · set(key, value) · remove(key) · all()` — مفتاح/قيمة (استعمل دوال `settings.js` المسمّاة بدل هذه غالبًا).
- `repo.raw.getAll / putMany / deleteMany / clear / replaceAll` — وصول خام للنسخ الاحتياطي والبيانات التجريبية فقط.
- `repo.counts()` → `{ store: count }` لكل المخازن. `repo.init()` يفتح التخزين. `getCurrentUser()` / `setCurrentUser(user)`.

### قواعد الحذف (تُطبَّق داخل `remove`)

| حذف | يُنظَّف تلقائيًا | يُمنع إذا |
|---|---|---|
| عميل | بلا `force`: لا شيء. مع `force` (بتأكيدك الصريح — المرحلة ٣): عقاراته تبقى و`ownerId = null` · طلباته ومطابقاتها تُحذف · صفقاته تبقى و`clientId = null` | بلا `force`: إن كان مرتبطًا بعقار أو طلب أو صفقة |
| عقار | صوره (`images` حيث `entityId`)، ومطابقاته | له صفقة |
| جولة | عقاراتها تصبح `tourId = null` | — |
| طلب | مطابقاته | — |
| عرض خارجي | صورته `screenshotImageId`، ومطابقاته | — |
| صفقة / مطابقة / صورة | — | — |

**قاعدة ثابتة (نُقّحت في المرحلة ٣):** حذف العميل ممكن دائمًا **بقرارك** عبر `repo.clients.remove(id, { force: true })` بعد عرض الأثر من `deleteImpact(id)`. أما تلقائيًا فلا يُحذف أبدًا كأثر جانبي — لا عند حذف عقاره ولا عند فك ربطه ولا عند مسح البيانات التجريبية؛ العملاء بلا عقارات يبقون في القائمة (للتسويق، ولربط عقار جديد بهم لاحقًا).

## ٣. الكيانات وحقولها

القيم الافتراضية بين قوسين. القوائم الثابتة في `ENUMS` بملف `schema.js`، وقوائم المستخدم من `settings.js`.

### `clients` — العميل (كيان واحد بأدوار متعددة)
- `name` ('') · `phone` ('') · `phone2` ('') · `notes` ('')
- `roles` ([]) من `ENUMS.clientRoles`: `owner` مالك عرض · `seeker` صاحب طلب
- `tags` ([]) تصنيفات حرة من قائمة `clientTags` في الإعدادات
- `stage` ('new') من `ENUMS.clientStages`: `new` جديد · `contacted` تم التواصل · `negotiating` مهتم/تفاوض · `won` أُبرمت · `closed` مغلق
- `contacts` ([]) سجل التواصل: `[{ id, type, date, note, followUpAt, createdAt, createdBy }]` و`type` من `ENUMS.contactTypes`: `call · whatsapp · visit`
- **التحقق:** الاسم أو الجوال على الأقل؛ الأدوار والمرحلة من القوائم.

### `properties` — العقار
- `city` ('الرياض') **مطلوب** · `district` ('') · `type` ('') مفتاح من قائمة الأنواع · `purposes` ([]) من `ENUMS.purposes`: `sale · rent · investment` (يقبل أكثر من غرض)
- `location` (null) `{ lat, lng }` · `area` (null) م² · `price` (null) ريال، `null` = غير معروف
- `images` ([]) معرّفات في مخزن `images` · `ownerId` (null) عميل · `notes` ('')
- `source` ('manual') من `ENUMS.propertySources`: `tour · manual · external`
- `status` ('not_contacted') مفتاح من قائمة الحالات: المدمج `not_contacted · agreed · refused · rented · sold` + ما يضيفه المستخدم (`status_xxxxxxxx`)
- `captureStatus` ('approved') من `ENUMS.captureStatuses`: `captured` بانتظار المعالجة · `extracted` بانتظار الاعتماد · `approved` معتمد (المفاتيح البرمجية ثابتة؛ التسميات الظاهرة حُدِّثت في المرحلة ٢) — الإدخال اليدوي يُنشأ معتمدًا؛ مسار الالتقاط الميداني يبدأ من `captured` ولا يظهر في صفحة العقارات ولا يدخل أي مطابقة قبل `approved`
- `tourId` (null) الجولة الميدانية
- `signboardImageId` (null) — **جديد في المرحلة ٢.** معرّف صورة اللوحة ضمن `images` (نفس نمط `externalListings.screenshotImageId`)؛ تبقى الصورة أيضًا ضمن `property.images` كصورة عادية.
- `captureContact` (null) — **جديد في المرحلة ٢.** `{ name, phone, note }` مؤقت من الالتقاط الميداني قبل وجود عميل مربوط؛ يُستهلك عند الاعتماد (يُبحث عنه بالجوال عبر `findByPhone`، فإن لم يوجد يُنشأ عميل جديد) ثم يُصفَّر تلقائيًا (`null`) بعد الاعتماد. الجوال يُطبَّع بنفس قواعد جوال العميل.
- `typeFields` ({}) الحقول بحسب مجموعة النوع (`TYPE_FIELD_GROUPS` في `schema.js`):
  - مجموعة `land`: `plotDimensions` نص · `streetWidth` رقم · `streetsCount` رقم · `facades` نص · `plotPosition` (`corner | middle`) · `planNumber` نص · `plotNumber` نص
  - مجموعة `built`: `rooms` رقم · `floor` نص · `floorsCount` رقم (الأدوار/الشقق) · `buildingAge` رقم · `buildingCondition` نص
- `extra` ({}) قيم الحقول المخصصة التي يضيفها المستخدم (`field_xxxxxxxx: value`)
- **الأنواع المدمجة:** `land` أرض (land) · `villa` فلة (built) · `floor` دور (built) · `apartment` شقة (built). النوع المضاف من المستخدم: `{ key: 'type_xxxxxxxx', label, group: 'land'|'built'|'none', builtin: false }`.
- **مكتمل البيانات:** الافتراضي `['city','district','type','purposes','location','ownerPhone']`؛ الخيارات الممكنة في `COMPLETENESS_CANDIDATES` (+ `area`, `price`, `images`).

### `tours` — الجولة الميدانية
- `date` ('') **مطلوب** · `city` ('الرياض') · `districts` ([]) · `notes` ('') · `inferred` (false) إن استُنتجت من تواريخ الصور
- المؤشرات (عدد الملتقط، المكتمل، المتواصل معه…) تُحسب من العقارات التي `tourId` فيها يساوي معرّف الجولة — لا تُخزَّن.

### `requests` — الطلب العقاري
- `clientId` **مطلوب** · `type` **مطلوب** · `purpose` **مطلوب** (واحد من `ENUMS.purposes`) · `city` ('الرياض') **مطلوب**
- `districts` ([]) · `budgetMax` (null) · `area` (null) · `notes` ('')
- `status` ('active') من `ENUMS.requestStatuses`: `active · paused · done`
- `priceFlexibility` (null) نسبة مئوية تتجاوز الإعداد العام للطلب فقط، أو `null`
- `priceFlexAmount` (null) **جديد في المرحلة ٣.** مبلغ بالريال يغلب النسبة والحدّ الأدنى معًا
- `areaFlexibility` (null) · `areaFlexAmount` (null) **جديدان في المرحلة ٣.** نظير الحقلين السابقين للمساحة (٪ ومتر)
- `districtZones` ([]) **جديد في المرحلة ٣.** مفاتيح نطاقات الأحياء؛ تُوسَّع إلى أحياء وقت المطابقة لا وقت الحفظ، فتعديل النطاق في الإعدادات يسري على الطلب. أحياء الطلب الفعلية = `districts` ∪ توسيع `districtZones`

### `matches` — المطابقة
- `requestId` **مطلوب** · `propertyId` (null) أو `externalId` (null) — أحدهما لازم
- `score` (0) نسبة 0–100 · `priceUnknown` (false) · `notes` ('')
- `status` ('new') من `ENUMS.matchStatuses`: `new · presented · interested · not_interested · won`

### `externalListings` — العرض الخارجي
- `rawText` ('') النص الملصوق (تُحفظ أسطره) · `sourceUrl` ('') مرجع يُفتح بنقرة · `platform` ('') · `screenshotImageId` (null) · `postedAt` (null)
- `advertiserPhone` ('') **جديد في المرحلة ٤.** جوال المعلن، يُطبَّع بقواعد جوال العميل نفسها ويدخل `searchKey` بكل صيغه
- الحقول المستخرجة: `city` ('الرياض') · `district` · `type` · `purposes` ([]) · `area` · `price` · `location` · `notes`
- `status` ('active') من `ENUMS.externalStatuses`: `active · unavailable · archived` — **رُوجعت في المرحلة ٤ وأُبقيت كما هي** (كيان بلا علاقة مع صاحبه، فحالاته عن التوفّر لا عن التفاوض)
- **لا حقول مطلوبة:** العرض الناقص يُحفظ ويُصنَّف "بانتظار الإكمال" (انظر القسم ١٢)

### `deals` — الصفقة
- `date` **مطلوب** · `finalPrice` **مطلوب** · `commission` (null) · `propertyId` (null) · `clientId` (null) · `notes` ('')

### `images` — الصور (مخزن مساعد)
- `entity` ('property') · `entityId` (null) · `mime` ('image/jpeg') · `blob` (Blob مضغوطة، أقصى بُعد 1600) · `thumb` (Blob مصغّرة 320) · `width` · `height` · `size` · `originalName` · `originalSize`
- لا تُنشأ مباشرة؛ استعمل `images.js`.

### `settings` — مفتاح/قيمة (`{ key, value }`)
`user` · `lists` (إضافات المستخدم فقط: `propertyTypes, propertyStatuses, clientTags, cities, districts{city:[]}`) · `customFields` · `completeness` · `backup` (`{ lastExportAt }`) · `ui` (`{ propertiesView, firstRunDone }`) · `seed` (معرّفات البيانات التجريبية) · `matching` و`zones` (المرحلة ٣ — القسم ١١).

## ٤. `settings.js`

- `ensureUser()` → المستخدم (ينشئه إن لم يوجد ويثبّته في `repo`). `updateUserName(name)`.
- `getLists()` → `{ propertyTypes, propertyStatuses, clientTags, cities, districtsByCity, extras }` (المدمج + إضافات المستخدم؛ الأحياء مرتبة عربيًا). `typeLabel(lists, key)` · `typeGroup(lists, key)` · `statusLabel(lists, key)`.
- `addPropertyType({ label, group })` · `removePropertyType(key)` · `addPropertyStatus(label)` · `removePropertyStatus(key)` · `addClientTag(label)` · `removeClientTag(label)` · `addCity(name)` · `addDistrict(city, name)` · `removeDistrict(city, name)` — الإضافة تعيد العنصر، والحذف يرمي خطأ إن كان مدمجًا أو مستعملًا.
- `getCustomFields()` → `[{ key, label, input: 'text'|'number', forTypes: [] }]` · `addCustomField({ label, input, forTypes })` · `removeCustomField(key)`.
- `getCompleteness()` / `setCompleteness(fields)` · `getBackupInfo()` / `setLastExport(iso)` · `getUI()` / `setUI(patch)` · `getSeedInfo()` / `setSeedInfo(info|null)`.
- أحياء الرياض المدمجة: `RIYADH_DISTRICTS` و`DEFAULT_CITY` في `riyadh-districts.js`.

## ٥. `images.js`

- `compressImage(file, limits?)` → `{ blob, width, height, thumb }` (JPEG 0.8، أقصى بُعد 1600؛ مصغّرة 320) دون تخزين.
- `storeImage(file, { entity, entityId })` → سجل الصورة المحفوظ؛ **على المستدعي** إضافة `id` إلى `property.images`.
- `getImageUrl(id, { thumb })` → رابط عرض مؤقت (يُحرَّر بـ `revokeImageUrls()`، وتستدعيها `app.js` عند تغيير الصفحة).
- `removeImage(id)` · `deleteImages(ids)` — حذف من التخزين (وعلى المستدعي تحديث `property.images`).
- `imagesSummary()` → `{ count, bytes }` · `formatBytes(n)`.
- **تنبيه للمرحلة ٢:** الضغط عبر canvas **يزيل EXIF** (ومنها GPS وتاريخ الصورة) — اقرأها من الملف الأصلي **قبل** `storeImage`. صيغة HEIC قد لا تُقرأ في غير Safari.

## ٦. `backup.js`

- `exportBackup()` → `{ blob, filename, counts, exportedAt }` — ملف JSON واحد: `{ app: 'motabiq', format: 1, exportedAt, db: { settings, clients, …, images } }` والصور داخله data URLs.
- `downloadBlob(blob, filename)` · `markExported()`.
- `readBackupFile(file)` → `{ data, counts, exportedAt }` (يتحقق دون تطبيق). `importBackup(data)` **يستبدل** كل المخازن في معاملة واحدة ثم يعدّ البيانات مُصدَّرة.
- `backupStatus()` → `{ lastExportAt, hoursSince, hasData, due }`؛ `due` عندما توجد بيانات ولم يُصدَّر منذ `REMINDER_HOURS = 24`.
- الشريط التذكيري في `app.js` يستمع للحدث `motabiq:data-changed` ليعيد الفحص.

## ٧. `seed.js`

`insertSeed()` → معرّفات ما أُدرج (٦ عملاء، ١١ عقارًا [٨ من المرحلة ١ + ٣ التقاطات ميدانية بالحالات الثلاث]، جولتان، وسجل واحد من كل كيان آخر) · `clearSeed()` → أعداد ما حُذف (يمس السجلات التجريبية فقط؛ العميل التجريبي الذي رُبط به عقار حقيقي يبقى ويُحسب في `keptClients`) · `seedExists()`. تُدرج تلقائيًا في أول تشغيل إذا كانت القاعدة فارغة.

## ٨. الأدوات المساعدة `js/util/`

- `arabic.js`: `normalizeArabic(text)` (همزة، تاء مربوطة، ألف مقصورة، تشكيل، صور العرض NFKC، أرقام عربية→إنجليزية) · `looseKey(text)` (بلا ألف) · `buildSearchKey(parts)` · `matchesQuery(searchKey, query)` · `foldDigits(text)`.
- `phone.js`: `normalizePhone(input)` · `isSaudiMobile(phone)` · `toInternational(phone)` → `9665…` · `formatPhone(phone)` → `050 123 4567` · `phoneSearchForms(phone)`.
- `location.js`: `parseLocation(text)` → `{ lat, lng } | null` (إحداثيات أو رابط خرائط جوجل كامل) · `isShortMapLink(text)` · `locationToText(loc)` · `mapsLink(loc)`.
- `format.js`: `formatNumber · formatSAR · formatArea · formatDate · formatDateTime · toInputDate · toInputDateTime · fromInputDate · fromInputDateTime · daysBetween · daysWord · relativeDays`.
- `dom.js`: `el(tag, attrs, ...children)` (بلا innerHTML) · `clear · badge · labeled · fieldGroup · selectEl · checkbox · emptyState · debounce` · `openModal({ title, body, footer, size, onClose })` · `confirmDialog({...})` · `promptDialog({...})` · `toast(message, kind, ms)`.

## ٩. إضافة صفحة جديدة

ملف `js/pages/<name>.js` يصدّر `render(container)`، ثم سجّله في `ROUTES` بملف `app.js` وأضف رابطه في `index.html` (`data-route`). التوجيه بالـ hash: `#/<name>`.

## ١٠. المرحلة ٢ — الجولات الميدانية والالتقاط والاعتماد

الصفحة `js/pages/tours.js` (مسجَّلة باسم `tours`) تضم تبويبين: **الجولات** (القائمة والمؤشرات، إنشاء/تعديل) و**بانتظار الاعتماد** (مفوَّض لـ `tour-approve.js`). الالتقاط نفسه في `tour-capture.js`. كل الوصول للتخزين عبر `repo` كما في المراحل السابقة.

- **الالتقاط** (`tour-capture.js`, `openCaptureForm({ tour, onSaved })`): ينشئ العقار فورًا بـ `captureStatus: 'captured'`، `source: 'tour'`، `tourId` (مثبَّت إن بدأ من داخل جولة، أو `null` مع اقتراح استنتاج). يشترط صورة واحدة على الأقل (عقار أو لوحة)؛ بقية الحقول (النوع، المدينة، الحي…) تُملأ لاحقًا في الاعتماد.
- **مصادر الموقع** (بهذا الترتيب، أول قيمة تُقرأ تُعبّئ حقل نصي واحد قابل للتعديل دومًا): GPS عبر `navigator.geolocation` عند اختيار "📷 كاميرا" (تقريب لحظة الرجوع من تطبيق الكاميرا، لا لحظة الغالق نفسها) ← EXIF عبر `readImageMeta()` عند اختيار "🖼️ من المعرض" ← لصق نص (`parseLocation`). تعديل المستخدم اليدوي للحقل يوقف أي تعبئة تلقائية لاحقة لنفس الالتقاط.
- **`js/util/exif.js`** — `readImageMeta(file)` → `{ lat, lng, takenAt }` (أي منها `null` إن تعذّر). قارئ EXIF مكتوب يدويًا (JPEG فقط، بلا مكتبة) يُستدعى على الملف الأصلي **قبل** `storeImage` لأن الضغط عبر canvas يزيل EXIF. لا يقرأ HEIC (افتراضي آيفون) — يعيد كل الحقول `null` بصمت دون خطأ.
- **استنتاج الجولة:** عند التقاط بلا جولة مثبَّتة وقراءة تاريخ EXIF يخالف اليوم الحالي، يُبحث عن جولة بنفس التاريخ (`repo.tours.where('date', ...)`) وتُقترح للربط (أو تُقترح جولة جديدة بذلك التاريخ إن لم توجد) — اقتراح دائمًا، لا ربط تلقائي.
- **`js/data/extraction.js`** — واجهة استخراج قابلة للتوصيل: `isConfigured()` و`extractSignboard(blob)`. **معطَّلة عمدًا الآن** (تعيد `NOT_CONFIGURED` دائمًا) بموافقة صريحة على الاكتفاء بالإدخال اليدوي؛ لا مفتاح API يُخزَّن. لتفعيل مزوّد لاحقًا (مثل Gemini عبر استدعاء مباشر من المتصفح بمفتاح يُخزَّن في الإعدادات) يكفي تعديل هذا الملف وحده.
- **الاعتماد** (`tour-approve.js`, `openApprovalForm(property, { onDone })`): نموذج تعديل كامل (نفس حقول العقار كما في `properties.js` بمنطق مستقل) + "حفظ كمسودة" (يحفظ دون اعتماد) + "اعتماد ✓" (يشترط `type` و`city` كما في الإدخال اليدوي). عند الاعتماد: يُربط `captureContact.phone` بعميل موجود (`findByPhone`) أو يُنشأ عميل جديد، ثم `captureStatus: 'approved'` و`captureContact: null`.
- **كشف التكرار:** يُنفَّذ تلقائيًا عند فتح شاشة الاعتماد وعند تغيير النوع/الموقع/الجوال (`repo.properties.findDuplicates`). "دمج مع هذا العقار" ينقل صور الالتقاط إلى العقار الموجود (`repo.images.update(id, { entityId })` لكل صورة ثم تحديث `images[]` للهدف) ويحذف سجل الالتقاط؛ لا يُنقَل أي حقل آخر (الحقول المُدخَلة أثناء المراجعة تُفقد عند الدمج). "إبقاء منفصلًا" مجرّد إخفاء للتنبيه في هذه الجلسة.
- **صفحة العقارات:** `properties.js` تُصفّي القائمة الآن على `captureStatus === 'approved'` فقط (تعديل ضروري على ملف المرحلة ١).
- **البيانات التجريبية:** جولة إضافية بتاريخ الأمس مع ثلاثة عقارات بالحالات الثلاث (`captured` بلا نوع، `extracted` بحقول أرض جزئية، `approved` كامل) — تُدرج وتُمسح مع زرَّي البيانات التجريبية الحاليين في `seed.js` (لا زر منفصل).

## ١١. المرحلة ٣ — الطلبات العقارية ومحرك المطابقة

الصفحتان `js/pages/requests.js` (مسجَّلة `requests`) و`js/pages/matches.js` (مسجَّلة `matches`، وتقبل `#/matches/<requestId>` لطلب واحد). كل وصول للتخزين عبر `repo` كما في المراحل السابقة.

### `js/data/matching.js` — المحرك (دوال خالصة + جمع المرشحين)

- `loadMatchingContext({ withMatches })` → `{ settings, properties, clients, requests, zonesByCity, matches }` — تُستدعى **مرة واحدة** للصفحة، لا داخل حلقة.
- `candidatesFor(request, ctx, { minScore })` → `[{ listing, score, tags, parts, priceUnknown }]` مرتّبة تنازليًّا.
- `scoreListing(request, listing, { settings, districts })` → `{ ok, reason?, score, priceUnknown, tags[], parts[] }` · `scoreOne(request, listing, ctx)` غلاف يوسّع الأحياء بنفسه.
- `requestDistricts(request, cityZones)` → أحياء الطلب بعد توسيع نطاقاته · `priceFlexFor(request, settings)` و`areaFlexFor(request, settings)` → `{ value, source: 'amount'|'percent'|'floor', percent, floor }` · `hardReasonLabel(key)` · `EXCLUDED_STATUSES`.

**الفواصل القاطعة** (`ok: false` مع `reason`): `type` · `purpose` (غرض الطلب داخل `listing.purposes`) · `city` (بمقارنة مطبَّعة عربيًا) · `capture` (كل `captureStatus` غير `approved`) · `status` (`rented, sold, refused`) · `own` (مالك العقار هو صاحب الطلب، إن كان `excludeOwnProperties`).

**المعايير المرجّحة:** الحي ٤٠ · السعر ٣٥ · المساحة ٢٥ (من الإعدادات). المعيار يدخل الحساب فقط إذا حدّده الطلب؛ وإن كانت قيمة العقار مجهولة **رُفع وزنه من المقام** ووُسم (`السعر غير معروف` · `المساحة غير معروفة` · `الحي غير معروف`). النسبة = مجموع (الوزن × النسبة) ÷ مجموع أوزان المعروف × ١٠٠، مقرَّبة. ولو لم يصلح أي معيار للحساب فالنسبة ١٠٠ (اجتاز القواطع ولا شيء آخر يُحاكم عليه).

**السعر (اتجاه واحد):** المرونة = `priceFlexAmount` إن وُجد، وإلا `max(سقف الميزانية × النسبة، الحدّ الأدنى بحسب الغرض)`. الأرخص من السقف ونظيره = درجة كاملة؛ والأغلى يتدرّج خطيًّا `1 − الزيادة ÷ المرونة`؛ وعند بلوغ المرونة أو تجاوزها **تسقط المطابقة** (`reason: 'price'`) لا تصبح صفرًا.

**المساحة:** المساحة المطلوبة **حدٌّ أدنى** بالمنطق نفسه: الأكبر أو المساوي درجة كاملة، والأصغر يتدرّج حتى `max(المساحة × النسبة، الحدّ الأدنى بالمتر)` فيسقط (`reason: 'area'`).

**الحي:** حي العقار داخل أحياء الطلب (المفردة + الموسَّعة من النطاقات) = درجة كاملة، وخارجها = صفر في هذا المعيار **ولا يسقط** (الوثيقة جعلته مرجّحًا لا قاطعًا). والحي المذكور صريحًا والآتي من نطاق متساويان.

### التخزين الكسول للمطابقات

النسب تُحسب لحظة العرض، ولا يُنشأ سجل في مخزن `matches` إلا عند تصرّف المستخدم؛ فالمرشح بلا سجل حالته `new` ضمنًا، و"إعادة إلى جديدة" = `repo.matches.remove(id)`. والسجل المحفوظ يُعاد تقييمه عند العرض ويظهر دائمًا ولو نزل تحت الشريط أو سقط من الترشيح، موسومًا "لم تعد مطابقة". أثره على المرحلة ٥: "عدد المطابقات بحسب حالتها" يقرأ المحفوظ، و"الجديدة" تُحسب لحظيًا بـ `candidatesFor`.

### "أُبرمت" تُنشئ صفقة

عند اختيار `won` يُفتح نموذج مصغّر (التاريخ، السعر النهائي، العمولة، ملاحظات) فيُنشئ سجلًا في `deals` بـ `propertyId` و`clientId`، ومع خيار مفعَّل افتراضيًا: حالة العقار تصير `sold` (أو `rented` إن كان غرض الطلب إيجارًا) وحالة الطلب تصير `done`. وتخطّي النموذج يترك المطابقة `won` بلا صفقة.

### `settings.js` — الجديد

- `getMatchingSettings()` / `setMatchingSettings(patch)` و`DEFAULT_MATCHING`:
  `{ weights: { district: 40, price: 35, area: 25 }, price: { percent: 12, minSale: 100000, minRent: 10000, minInvestment: 100000 }, area: { percent: 15, minSqm: 50 }, minScore: 50, excludeOwnProperties: true }`. المخزَّن يُدمج بالافتراضي فالنقص لا يُعطّل المحرك.
- **النطاقات** في مفتاح `zones` = `{ [city]: [{ key: 'zone_xxxxxxxx'|'north'…, label, districts: [] }] }`:
  `getZones()` · `getZonesFor(city)` · `addZone(city, { label, districts })` · `updateZone(city, key, patch)` · `removeZone(city, key)` · `expandZones(cityZones, keys)` · `zoneLabel(cityZones, key)` (الأخيرتان دالتان خالصتان). أول قراءة تنسخ قطاعات الرياض الخمسة من `RIYADH_SECTORS` **مسودّة** (تقسيم تقريبي قابل للتعديل والحذف) وتحفظها.
- `riyadh-districts.js` يصدّر الآن `RIYADH_SECTORS` بجانب `RIYADH_DISTRICTS` (القائمة المسطّحة لم تتغير: ١٥١ حيًّا).

### `minScore` ليس فلترًا مخفيًا

هو القيمة الابتدائية لشريط ظاهر أعلى صفحة المطابقات ("أظهر ما نسبته ≥ ٪") يتحرك وقت العمل، ووزن الحي ٤٠ يعني أن عقارًا خارج الأحياء المطلوبة بسعر ومساحة كاملين سقفه ٦٠٪.

### تعديلات على ملفات سابقة (وسببها)

| الملف | التعديل | السبب |
|---|---|---|
| `index.html` · `app.js` | رابطان في التنقّل وتسجيل المسارين | لا وصول للصفحتين بدونهما |
| `schema.js` | ٤ حقول جديدة في `requests` | المرونة بمبلغ/مساحة والنطاقات (`null`/`[]` افتراضًا فلا ترحيل) |
| `repository.js` | تطبيع الحقول الأربعة · `clients.deleteImpact` و`clients.remove(id, { force })` بدل منع الحذف في `CASCADE` | الحذف صار بقرارك لا ممنوعًا |
| `clients.js` | نافذة الحذف تعرض الأثر بالأرقام ثم تمرّر `force` | المصدر نفسه |
| `settings.js` · `pages/settings.js` | إعدادات المطابقة ونطاقات الأحياء | "قابلة للتعديل من الإعدادات العامة" في الوثيقة |
| `riyadh-districts.js` | تصدير القطاعات من البيانات نفسها | مسودّة النطاقات بلا كلفة |
| `seed.js` | ٤ عملاء و٦ عقارات و٨ طلبات · ومسح البيانات التجريبية لم يُعد يتعطل إذا ارتبط سجل تجريبي بصفقة أو عميل حقيقي (يُحسب في `keptProperties` / `keptClients`) | مادة للمطابقة · والصفقات صارت ممكنة من الواجهة فصار التعطل واردًا |
| `css/components.css` | أصناف المطابقات والنطاقات (إضافة في آخر الملف) | — |

**لم تُمسّ:** `adapters/indexeddb.js` (لا فهارس جديدة ولا رفع `DB_VERSION`) · `properties.js` · `tours*.js` · `images.js` · `backup.js` · `extraction.js` · `util/*`.


## ١٢. المرحلة ٤ — العروض الخارجية

الصفحة `js/pages/external.js` (مسجَّلة `external`). كل وصول للتخزين عبر `repo` كما في المراحل السابقة.
والعرض الخارجي **يمرّ على محرك المطابقة نفسه** — لا محرك ثانيًا له ولا مخزن مطابقات منفصل.

### الإدخال والاعتماد اليدوي

- **`js/data/listing-parse.js`** — `parseListingText(text, { districts, types, cities })` → `{ fields, found, warnings }`.
  دالة خالصة تعمل **محليًا في المتصفح**: لا شبكة ولا مفتاح ولا مكتبة، وتعمل دون اتصال ولا تخرج البيانات من الجهاز.
  تقرأ: `sourceUrl` · `platform` (من نطاق الرابط أو من اسم المنصة في النص) · `advertiserPhone` · `price` (مع المضاعفات «مليون/ألف» والفواصل العربية) · `area` · `district` (بمطابقة متسامحة فتُعرف «اليسمين» = الياسمين) · `city` · `type` · `purposes` · و`mapsText` (رابط خرائط يُقرأ منه الموقع بـ `parseLocation`).
  `fields` يحمل ما قُرئ فقط، و`found` للعرض، و`warnings` لما يحتاج نظرك (نوع غير مسجَّل، رابط خرائط مختصر، سعر متر لا سعر عقار).
  **قواعد ثابتة:** النوع يُختار بأول كلمة نوع تظهر في النص (فلا تصير «عمارة فيها ١٢ شقة» شقةً)، والصفحة **لا تستبدل حقلًا أدخله المستخدم بنفسه** بل تعبّئ الفارغ فقط وتُبلغ بما تخطّته.
  فيه تطبيع عربي محلي يحافظ على علامات الترقيم (لأن `normalizeArabic` يستبدلها بمسافات عن قصد، فتُفقد فواصل الأرقام).
- **`js/data/extraction.js` لا يزال معطَّلًا عمدًا** ولا مفتاح API مخزَّن (قرار المرحلة ٢ أُكِّد في المرحلة ٤: الاكتفاء بالمجاني). ولا يقرأ `listing-parse.js` الصور: النص يُستخرج من صورة الشاشة بأداة الجهاز (النص المباشر في آيفون، عدسة جوجل) ثم يُلصق. وتفعيل مزوّد رؤية لاحقًا يبقى مكانه `extraction.js` وحده.
- **صورة الشاشة:** واحدة، عبر `storeImage(file, { entity: 'external', entityId })` ثم `screenshotImageId` (ولا تُضاف إلى أي مصفوفة صور). استبدالها يحذف القديمة بـ `removeImage`.
- **الرابط مرجع فقط:** يُفتح في تبويب جديد (`target="_blank" rel="noopener noreferrer"`)، ولا استخراج منه (CORS وشروط المنصات).

### الجاهزية للمطابقة — تصنيف "بانتظار الإكمال"

- `matching.js` يصدّر `MATCH_REQUIRED_FIELDS` و`matchReadiness(listing)` → `{ ready, missing: [{ key, label }] }`.
  الحقول اللازمة هي الفواصل القاطعة نفسها: **النوع · الغرض · المدينة**.
- العرض الناقص **يُحفظ** (لا حقل مطلوب في المخزن)، ويُصنَّف "بانتظار الإكمال" في فرز الصفحة، وينبّه عليه شريط أعلى الصفحة بعدده. وهو ساقط من المطابقة تلقائيًا بالفاصل القاطع — لا بفلتر إضافي، فالتصنيف **محسوب وقت العرض ولا يُخزَّن** (فلا يتناقض أبدًا مع واقع الحقول).

### المحرك: ما تغيّر في `matching.js`

- `loadMatchingContext()` تعيد الآن `externals` بجانب `properties` (استدعاء واحد للصفحة كما هو).
- `candidatesFor(request, ctx, { minScore, includeExternal = true })` تمرّ على المخزون ثم العروض الخارجية، وكل مرشح يحمل `kind: 'property'|'external'` بجانب `listing` و`score` و`tags` و`parts`.
- `scoreListing(request, listing, { settings, districts, kind = 'property' })` و`scoreOne(request, listing, ctx, kind = 'property')` — الافتراضي عقار، فنداء المرحلة ٣ يعمل كما هو.
- **الفواصل القاطعة للعرض الخارجي:** النوع والغرض والمدينة كالمخزون، ثم `EXCLUDED_EXTERNAL_STATUSES = ['unavailable', 'archived']` بسبب `external_status`. ولا يُفحص `captureStatus` (لا وجود له) ولا `own` (لا مالك مربوطًا).
- **الأوزان والمرونة والوسوم نفسها بلا استثناء:** الحي ٤٠ والسعر ٣٥ والمساحة ٢٥ من الإعدادات، و`السعر غير معروف` يُرفع من المقام ويُوسَم كما في المخزون.

### صفحة المطابقات: ما تغيّر

- العروض الخارجية في **القائمة نفسها** مرتّبة بالنسبة، موسومة `خارجي` مع منصتها وزر «فتح الرابط ↗»، وحالتها من `ENUMS.externalStatuses` لا من حالات العقار. ومفتاح **«إظهار العروض الخارجية»** أعلى الصفحة مفعَّل افتراضيًّا (إخفاؤه يخفي مرشحيها ومطابقاتها المحفوظة معًا).
- سجل المطابقة يُكتب بـ `externalId` و`propertyId: null` (والعكس للمخزون)، والتخزين الكسول كما هو: لا سجل إلا عند تصرّفك.
- **«أُبرمت» على عرض خارجي:** الصفقة تُسجَّل بـ `propertyId: null` (العرض ليس في مخزونك، و`deals` لا يحمل حقلًا للعرض الخارجي)، ووصف العرض ورابطه وجوال معلنه يُكتبان تلقائيًا في `notes`. والمفتاح المفعَّل افتراضيًّا يُغلق الطلب (`done`) **ويوسم العرض `unavailable`** بدل تغيير حالة عقار لا وجود له.

### `repo.externalListings.findDuplicates(...)` — تنبيه لا منع

`findDuplicates({ sourceUrl, advertiserPhone, city, district, type, area, price, excludeId })`
→ `[{ reason: 'url'|'phone'|'similar'|'inventory', listing?, property?, detail? }]`

| السبب | معناه |
|---|---|
| `url` | نفس الرابط في عرض محفوظ (مقارنة مطبَّعة: بلا بروتوكول ولا `www` ولا شرطة أخيرة) |
| `phone` | نفس جوال المعلن في عرض خارجي آخر |
| `similar` | نفس النوع والمدينة والحي، وتقارب المساحة والسعر بـ ١٠٪ |
| `inventory` | **الأنفع:** جوال المعلن مسجَّل مالكًا لعقار في مخزونك — أي أن العرض قد يكون عقارك أنت |

لا تُطبَّق تلقائيًا: تُستدعى في الصفحة عند تغيير حقل الجوال (تنبيه `inventory`/`phone` فوريًّا) وعند الحفظ (نافذة تأكيد تسرد المرشحين وأنت تقرر «احفظ على أي حال»).

### تعديلات على ملفات سابقة (وسببها)

| الملف | التعديل | السبب |
|---|---|---|
| `index.html` · `app.js` | رابط في التنقّل وتسجيل مسار `external` | لا وصول للصفحة بدونهما |
| `matching.js` | `externals` في السياق · `kind` في التسجيل والترشيح · `EXCLUDED_EXTERNAL_STATUSES` · `matchReadiness` | "يمرّ على محرك المطابقة نفسه" في الوثيقة |
| `pages/matches.js` | صفوف العروض الخارجية · مفتاح إظهارها · سجل بـ `externalId` · صفقة بلا عقار | المصدر نفسه |
| `schema.js` | `advertiserPhone` في `externalListings` | جوال المعلن (`''` افتراضًا فلا ترحيل) |
| `repository.js` | تطبيع حقول العرض الخارجي (الجوال، الرابط، المنصة، `rawText`) · `externalListings.findDuplicates` | التطبيع والبحث وكشف التكرار |
| `seed.js` | ٥ عروض خارجية بدل واحد: منها ما يطابق طلبات المخزون، وواحد "بانتظار الإكمال" (نوع غير مسجَّل وغرض ناقص)، وواحد `unavailable`، وواحد جوال معلنه جوال مالك عقار عندك | مادة للمطابقة ولتصنيف الناقص ولتنبيه التكرار — تُدرج وتُمسح مع زرَّي البيانات التجريبية الحاليين |
| `css/components.css` | أصناف `notice` و`parse-result` و`match-row.external`، وقاعدة `.modal-body > p { white-space: pre-line; }` | القاعدة الأخيرة لإظهار أسطر نافذة التكرار؛ ولا تغيّر شكل نوافذ التأكيد السابقة (رسائلها بلا أسطر) |

**لم يُمسّ:** `adapters/indexeddb.js` (**بلا رفع `DB_VERSION` وبلا فهرس جديد — لا ترحيل بيانات**) · `extraction.js` · `properties.js` · `clients.js` · `requests.js` · `tours*.js` · `settings.js` · `images.js` · `backup.js` · `util/*`.

### ما يخص المرحلة ٥ (الداشبورد)

- العرض الخارجي **ليس مخزونًا:** لا يُحسب في عدد العقارات ولا في "نسبة العقارات مكتملة البيانات" ولا في مؤشرات الجولات.
- "عدد المطابقات بحسب حالتها" يقرأ المحفوظ كما هو، وفيه الآن سجلات بـ `externalId` — ميّزها إن أردت فصل المخزون عن الخارجي.
- صفقة العرض الخارجي بلا `propertyId`: تدخل الإيراد والعمولة (وهي صفقتك فعلًا)، ولا تدخل "معدل التحويل من عقار إلى صفقة".

## ١٣. المرحلة ٥ — خريطة العقارات والداشبورد

**بلا أي تغيير على المخطط:** لا مخزن جديد، لا حقل جديد، لا فهرس جديد، **بلا رفع `DB_VERSION`**. كل مؤشر يُحسب بقراءة `list()` لكل مخزن وتجميعه في الذاكرة (حجم بيانات وسيط واحد لا يبرر فهرسًا إضافيًا).

### `js/pages/map.js` (مسجَّلة `map`)

- يعرض: العقارات المعتمدة (نفس نطاق صفحة العقارات: `captureStatus === 'approved'`) + العروض الخارجية التي حالتها ليست ضمن `EXCLUDED_EXTERNAL_STATUSES` (من `matching.js`) — كلاهما فقط إن كان له `location`. العقار/العرض بلا موقع يُستثنى مع بيان عدده أعلى الصفحة.
- الفرز (المدينة/الحي/النوع/الغرض) من `js/util/property-filters.js` — **نفس التعريف** المستعمل في `properties.js` حرفيًا (القيم، القوائم، تقييد الحي بالمدينة).
- مفتاح "إظهار العروض الخارجية" أعلى الصفحة (مفعَّل افتراضيًا)، وتبديل خريطة/قمر صناعي (Esri) لا يمسّان أي تخزين.
- النقر على عقار: `location.hash = '#/properties/<id>'` — والعرض الخارجي: `'#/external/<id>'` (انظر أدناه). لا نموذج تعديل مكرَّر في هذا الملف.
- المكتبة: Leaflet مُحمَّلة من `vendor/leaflet/leaflet.esm.js` عبر `import()` ديناميكي (لا تُحمَّل إلا عند فتح هذه الصفحة)، وCSS تُحقن مرة واحدة في `<head>`. **لا مفتاح ولا حساب** لبلاطات OpenStreetMap أو Esri World Imagery المجانيتين. العلامات `L.circleMarker` فقط (لا صور أيقونات مرفقة): لون العقار بحسب حالته، ولون ثابت مختلف (بحدّ متقطّع) للعروض الخارجية.

### `js/pages/dashboard.js` (مسجَّلة `dashboard`)

- يقرأ `repo.clients/properties/tours/matches/externalListings/deals` و`getLists`/`getCompleteness` — لا دوال `repo` جديدة.
- **حدّ "لم يُتواصل معه" ثابت** `STALE_CONTACT_DAYS = 14` في الملف نفسه (بقرارك: الأرخص، بلا مفتاح إعداد).
- "معدل الاقتناص لكل جولة" و"أي الأحياء أجدى" يعيدان استعمال `tourStats` المصدَّرة الآن من `tours.js` (بدل حساب مواز): الاقتناص = صفقات ÷ عقارات ملتقطة لكل جولة؛ ترتيب الأحياء بالنسبة نفسها على عقارات `source: 'tour'` بحدّ أدنى ٣ عقارات ملتقطة للحي.
- معدل التحويل = (عقارات معتمدة لها صفقة واحدة على الأقل) ÷ (كل العقارات المعتمدة) — لا يشمل صفقات العروض الخارجية (بلا `propertyId`)، بما يطابق ما سبق في القسم ١٢.
- الإيراد/العمولة الشهرية والسنوية بالتقويم الميلادي (نفس تنسيق `format.js` في التطبيق كله).

### `js/util/property-filters.js` (جديد)

يصدّر `LISTING_GROUPS`، `LISTING_VALUES`، `listingFilterOptions(group, { items, lists, filters })`، `uniqValues(values)` — تعريف الفرز المشترك بين `properties.js` و`map.js` (المدينة/الحي/النوع/الغرض). "الحالة" ليست فيه (خاصة بالعقارات فقط، تبقى محلية في `properties.js`).

### امتداد التوجيه بالـ hash

بنفس نمط `#/matches/<requestId>` الموثّق في القسم ١١:

- `#/properties/<id>` يفتح نموذج تعديل عقار بعينه مباشرة (`properties.js`).
- `#/external/<id>` يفتح نموذج تعديل عرض خارجي بعينه مباشرة (`external.js`).
- `#/tours/queue` يفتح تبويب "بانتظار الاعتماد" مباشرة بدل تبويب الجولات (`tours.js`).

### تعديلات على ملفات سابقة (وسببها)

| الملف | التعديل | السبب |
|---|---|---|
| `index.html` · `app.js` | رابطا تنقّل ومساران جديدان (`dashboard`, `map`) | لا وصول للصفحتين بدونهما |
| `properties.js` | (أ) قراءة `#/properties/<id>` لفتح عقار بعينه · (ب) الفرز المشترك (مدينة/حي/نوع/غرض) صار مستوردًا من `property-filters.js` بدل تعريف محلي؛ "الحالة" بقيت محلية | (أ) يتيح فتح العقار من الخريطة بلا تكرار النموذج · (ب) ضمان أن الخريطة تستعمل نفس الفرز حرفيًا |
| `external.js` | قراءة `#/external/<id>` لفتح عرضًا خارجيًا بعينه | نفس سبب (أ) أعلاه |
| `tours.js` | (أ) تصدير `tourStats` بإضافة `export` فقط، بلا أي تغيير في منطقها · (ب) قراءة `#/tours/queue` لفتح تبويب الاعتماد مباشرة | (أ) إعادة استعمال تعريف الاقتناص نفسه في الداشبورد · (ب) يتيح لطابور الداشبورد فتح نفس الشاشة |
| `css/components.css` | إضافات فقط في آخر الملف (الداشبورد، الخريطة) | لا حذف لما هو موجود |

**لم يُمسّ:** `repository.js` (لا دوال جديدة) · `schema.js` (لا حقول جديدة) · `adapters/indexeddb.js` (**بلا رفع `DB_VERSION` وبلا فهرس جديد**) · `settings.js` (لا مفاتيح جديدة) · `images.js` · `backup.js` · `extraction.js` · `listing-parse.js` · `matching.js` · `clients.js` · `requests.js` · `matches.js` · `tour-capture.js` · `tour-approve.js` · `riyadh-districts.js` · `util/arabic.js` · `util/dom.js` · `util/format.js` · `util/location.js` · `util/phone.js` · `util/exif.js`.

### الخيارات التقنية المتخذة (لم تكن في وثيقة الخطة)

- **مكتبة الخريطة:** Leaflet **محلّية داخل المشروع** (`vendor/leaflet/`) لا عبر CDN — تحافظ على "لا اعتماد شبكي وقت التحميل" وتعمل دون اتصال (فيما عدا بلاطات الخرائط نفسها، وهذا حتمي في كل الخيارات). بلا مفتاح أو حساب لبلاطات OpenStreetMap أو Esri World Imagery المجانيتين.
- **ما يظهر على الخريطة:** المخزون المعتمد + العروض الخارجية النشطة (لا مواقع الالتقاط غير المعتمدة).
- **العقار بلا موقع:** يُستثنى من الخريطة مع عدّاد أعلاها (بلا فلتر جديد في صفحة العقارات).
- **حدّ "لم يُتواصل معه":** ثابت ١٤ يومًا في الكود، غير قابل للتعديل من الإعدادات.
- **الصفحة الافتراضية عند الفتح:** بقيت "العقارات" (`DEFAULT_ROUTE` في `app.js` لم يتغيّر).
