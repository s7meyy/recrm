# عقد طبقة البيانات — كسّاب (بعد المرحلة ٩)

> أرفق هذا الملف في محادثات المراحل التالية بدل الكود. كل ما تحتاجه الصفحات موجود في `repo` (ملف `js/data/repository.js`)
> وفي وحدات `settings.js` و`images.js` و`backup.js` و`extraction.js` (المرحلة ٢) و`matching.js` (المرحلة ٣) و`listing-parse.js` (المرحلة ٤). لا تصل الصفحات إلى IndexedDB مباشرة.
> القسم ١٠ يوثّق إضافات المرحلة ٢ (الالتقاط، EXIF، كشف التكرار)، والقسم ١١ إضافات المرحلة ٣ (الطلبات، المطابقة، النطاقات)، والقسم ١٢ إضافات المرحلة ٤ (العروض الخارجية)، والقسم ١٣ إضافات المرحلة ٥ (الخريطة والداشبورد)، والقسم ١٤ إضافات المرحلة ٦ (بحث عام، مشاركة، تجميع، تنبيهات)، والقسم ١٥ إضافات المرحلة ٧ (القائمة الجانبية، المهام، الأفكار — وفيه أول رفع لـ`DB_VERSION`)؛ وبقية الملف من المرحلة ١ ولا يزال ساريًا كما هو.
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

## ١٤. المرحلة ٦ — مراجعات ما بعد التسليم (قائمة العملاء، البحث، المشاركة، التجميع، التنبيهات)

**بلا أي تغيير على المخطط:** لا مخزن جديد، لا فهرس جديد، **بلا رفع `DB_VERSION`**. مفتاح إعداد واحد جديد فقط (`followUp`، مخزن `settings` نفسه).

### إصلاح تجاوز القائمة على الجوال

`.nav` (٩ روابط) كان يفيض أفقيًا على الشاشات الضيقة بلا التفاف أو تمرير، فيمتد خارج حدود الشاشة يسارًا في تخطيط RTL. الحل: قائمة همبرغر (checkbox + label، بلا جافاسكربت) تظهر فقط تحت ٦٤٠ بكسل (نفس نقطة التجاوب المستعملة في بقية الملف)، مع سطر واحد في `app.js` يطوي القائمة تلقائيًا بعد اختيار صفحة.

### `js/util/global-search.js` (جديد)

بحث عام يجمع العملاء والعقارات والطلبات في نافذة واحدة، مفعَّل من زر "🔍" في الشريط العلوي واختصار لوحة المفاتيح "/". **لا منطق بحث جديد** — يستدعي `repo.<كيان>.search(q)` الموجودة فعليًا لكل كيان منذ المرحلة ١ (تبني على `searchKey` المحفوظ في كل سجل). أقل من حرفين لا يُشغِّل بحثًا.

### `js/util/follow-up-alerts.js` (جديد)

فحص العملاء المتأخرين عند فتح التطبيق وكل ٣٠ دقيقة أثناء بقاء التبويب مفتوحًا، بتنبيه متصفح (`Notification`) واحد فقط لكل عميل عند أول تجاوزه للحدّ (مانع تكرار في `localStorage`، لا في IndexedDB — ذاكرة عرض لا بيانات عمل). **قيد معماري:** يعمل فقط أثناء بقاء التبويب مفتوحًا؛ لا تنبيهات بعد إغلاقه بلا خادم حقيقي وService Worker وPush API، وهذا خارج "لا خادم الآن" المحسوم في القسم ١. الإذن يُطلب فقط من زر صريح في الإعدادات، لا تلقائيًا.

### `getFollowUpSettings` / `setFollowUpSettings` (في `settings.js`)

`{ staleContactDays: 14, notify: false }` — حدّ "لم يُتواصل معه" في الداشبورد صار قابلًا للتعديل من الإعدادات (كان ثابتًا في المرحلة ٥ بقرارك اختيار الأرخص؛ الآن غيّرت رأيك). `dashboard.js` يقرأ هذه القيمة بدل الثابت السابق.

### مشاركة العقار (في `properties.js`)

زر "📤 مشاركة" في تذييل نموذج تعديل عقار موجود (لا الجديد غير المحفوظ): رابط واتساب (`wa.me`) بنص ملخّص + رابط عميق للعقار، مشاركة عبر تطبيقات أخرى (`navigator.share` عند دعم المتصفح فقط)، ونسخ الرابط (`navigator.clipboard`). **لا يشمل العروض الخارجية عمدًا** — ليست ملكك لتشاركها مع عميل.

### تجميع علامات الخريطة (في `map.js`)

تجميع بسيط بالمسافة بالبكسل عند التكبير الحالي، مكتوب يدويًا (لا مكتبة `Leaflet.markercluster` — بناؤها القديم UMD يصعب توافقه مع استيراد Leaflet كوحدة ES المتّبع هنا). يعمل فقط حين تتجاوز العلامات الظاهرة ١٥؛ دون ذلك تُعرض فرادى كما في المرحلة ٥ بلا تغيير. النقر على تجمّع يكبّر إليه؛ النقر على علامة مفردة يفتح نافذتها كالسابق.

### امتداد التوجيه بالـ hash

`#/clients/<id>` و`#/requests/<id>` — بنفس نمط `#/properties/<id>` و`#/matches/<requestId>` الموثّقين، يستعملهما البحث العام.

### تعديلات على ملفات سابقة (وسببها)

| الملف | التعديل | السبب |
|---|---|---|
| `index.html` | زر بحث + checkbox/label قائمة الجوال | الميزتان الجديدتان |
| `css/base.css` | قواعد قائمة الجوال المتجاوبة (وسم `@media (max-width:640px)` الموجود) | إصلاح تجاوز القائمة |
| `css/components.css` | إضافات فقط: شارات التجميع، نافذة البحث، قائمة المشاركة | لا حذف لما هو موجود |
| `app.js` | استيراد وتشغيل `initGlobalSearch`/`startFollowUpAlerts` مرة عند التشغيل، وطيّ قائمة الجوال بعد التنقّل | ربط الميزتين الجديدتين |
| `settings.js` (البيانات) | مفتاح `followUp` جديد بدالتي قراءة/كتابة | تخزين حدّ المتابعة وتفعيل التنبيه |
| `settings.js` (الصفحة) | لوحة "متابعة العملاء" جديدة | واجهة التعديل |
| `dashboard.js` | يقرأ الحدّ من الإعدادات بدل ثابت `STALE_CONTACT_DAYS` | إتاحة التعديل |
| `properties.js` | (أ) زر المشاركة في تذييل النموذج · (ب) `await` قبل `openForm` عند الفتح من رابط عميق | (أ) الميزة الجديدة · (ب) رأيت هذه العلّة أثناء اختبار `requests.js` فأصلحتها في الأربعة معًا احتياطًا |
| `clients.js` | (أ) دعم `#/clients/<id>` · (ب) نفس إصلاح `await` أعلاه | (أ) يخدم البحث العام · (ب) نفسه |
| `requests.js` | (أ) دعم `#/requests/<id>` · (ب) **هنا وُجدت العلّة فعليًا**: `openForm` تنتظر `loadZones()` قبل فتح النافذة، فبلا `await` كانت النافذة تُفتح بعد عودة `render()` من الرابط العميق مباشرة، لا معه | (أ) يخدم البحث العام · (ب) إصلاح ضروري |
| `external.js` | نفس إصلاح `await` احتياطًا (لم تظهر فيه العلّة فعليًا) | اتساق واحتياط |

**لم يُمسّ:** `repository.js` · `schema.js` · `adapters/indexeddb.js` (**بلا رفع `DB_VERSION` وبلا فهرس جديد**) · `images.js` · `backup.js` · `extraction.js` · `listing-parse.js` · `matching.js` · `matches.js` · `tour-capture.js` · `tour-approve.js` · `tours.js` · `riyadh-districts.js` · `util/arabic.js` · `util/dom.js` · `util/format.js` · `util/location.js` · `util/phone.js` · `util/exif.js` · `util/property-filters.js`.

### اختُبر فعليًا قبل التسليم (لا مراجعة نظرية فقط)

تشغيل حقيقي لـ`app.js` كاملًا (لا وحدات معزولة) فوق محوّل تخزين وهمي: الصفحة الافتراضية، زر البحث من الشريط العلوي، طيّ قائمة الجوال بعد التنقّل. بيانات حدّية متعمَّدة: عميل متأخر ١٤/٧/٢٠ يومًا، عقار بلا موقع، ٢٠ عقارًا متلاصقة (يجب أن تتجمَّع) مقابل ١٠ (يجب ألا تتجمَّع)، عرض خارجي مؤرشف (مستبعد)، تنبيه متصفح محاكًى بمنع تكرار مؤكَّد (نبّه مرة، لم يكرّر، نبّه مجددًا بعد عودة التأخر). كل نتيجة طابقت المتوقَّع حسابيًا.

## ١٥. المرحلة ٧ — القائمة الجانبية، المهام، الأفكار

### تغيير المخطط (الوحيد من نوعه حتى الآن)

**رُفع `DB_VERSION` من ١ إلى ٢** — حتمي هذه المرة: ثلاثة مخازن جديدة كليًا (`taskLists`، `tasks`، `notes`) لا يمكن إنشاؤها بدون ترقية إصدار. دالة `upgrade()` في `indexeddb.js` تُنشئ الناقص فقط ولا تمسّ أي مخزن أو بيانات موجودة — لا ترحيل بيانات يدوي، والنسخ الاحتياطي (`backup.js`) يشمل الثلاثة تلقائيًا بلا أي تعديل لأنه مبني على `STORES`/`repo.raw` العامة أصلًا.

الكيانان:
- `taskLists`: `{ title, order }`. حذفها يحذف مهامها (CASCADE).
- `tasks`: `{ listId, title, notes, order, done, doneAt, dueAt, reminded, linkType, linkId }`. `linkType` من `ENUMS.linkTypes` (`client`/`property`/`request`)؛ وجوده يلزم `linkId`.
- `notes`: `{ text, color, pinned, archived, tags[], linkType, linkId }`. نفس قيد الربط.

### القائمة الجانبية (تستبدل قائمة الجوال المنسدلة من المرحلة ٦ بالكامل)

`index.html` أُعيد هيكلته بالكامل: `checkbox` واحد (`#sidebar-toggle`) يتحكم بحالتين مختلفتين حسب حجم الشاشة عبر CSS فقط (بلا جافاسكربت إضافي):
- **حاسوب:** رفّ أيقونات ثابت (٦٠px)، الضغط على ☰ داخله يوسّعه إلى ٢٢٠px (تظهر التسميات).
- **جوال:** درج كامل مخفي (`translateX`)، زر ☰ في شريط علوي مصغَّر يُظهره فوق الصفحة مع حاجب خلفي (scrim) يُغلق بالنقر خارج الدرج.

`app.js`: نفس منطق إغلاق القائمة بعد التنقّل من المرحلة ٦، معدَّلًا ليستهدف `#sidebar-toggle`/`.sidebar-nav a` بدل `#nav-toggle`/`.nav a`. **لم يُختبَر بصريًا في متصفح حقيقي** — فقط بنية DOM (ترتيب العناصر يصحّ لمحدِّد `:checked ~`) وسلوك التنقّل، عبر تشغيل `app.js` كاملًا فعليًا لا وحدات معزولة.

### `js/pages/tasks.js` (جديدة، مسجَّلة `tasks`)

لوحة أعمدة (قوائم)، حركة المهام بأزرار اتجاه (→ يمين / ← يسار بين القوائم، ↑↓ للترتيب داخل القائمة) **لا سحب حقيقي** — قرارك المؤكَّد لضمان عمل اللمس على الجوال بلا تعقيد سحب. عرضان محفوظان في `settings.ui.tasksView` (`board`/`single`) — نفس البيانات، فرق عرض CSS فقط (`task-board` صف أفقي أو عمود رأسي). المهمة المنجزة **تبقى في قائمتها** وتُشطب بصريًا (لا قائمة "منجزة" منفصلة تُنقل إليها تلقائيًا)، وتُحسب في المؤشرات (متبقية/منجزة/متأخرة). التذكير بتاريخ ووقت يُصفِّر حقل `reminded` تلقائيًا عند تغيير الموعد من نموذج التعديل. تدعم `#/tasks/<id>` (نفس نمط الروابط العميقة الموثّق).

### `js/pages/notes.js` (جديدة، مسجَّلة `notes`)

التقاط حر بلا حقول إلزامية (Ctrl+Enter للحفظ السريع)، تعديل النص مباشرة داخل البطاقة (يُحفظ عند فقدان التركيز)، تثبيت، لون (٦ خيارات ثابتة)، أرشفة، وزر "حوّل إلى مهمة" (يفتح اختيار القائمة الهدف، ينشئ مهمة، يؤرشف الفكرة). تدعم `#/notes/<id>` بسلوك مختلف عن بقية الروابط العميقة: لا مودال (الأفكار تُحرَّر داخل الصفحة نفسها) — بل تمرير إلى البطاقة وتظليلها مؤقتًا.

### تمديد `js/util/follow-up-alerts.js` (تذكير المهام)

دالة فحص ثانية `checkTasksOnce()` بجانب فحص العملاء المتأخرين الموجود، بنفس البنية الدورية (كل ٣٠ دقيقة + عند الفتح). **تذكير المهام يعمل بمجرد منح إذن التنبيهات من المتصفح، بلا مفتاح إعداد خاص به** — بخلاف تنبيه العملاء المتأخرين المربوط بمفتاح "متابعة العملاء" في الإعدادات. قرار تبسيط متعمَّد لضيق الوقت؛ أخبرني إن أردت مفتاحًا منفصلًا لتعطيل تذكير المهام وحده. نفس القيد المعروف: يعمل فقط أثناء بقاء التبويب مفتوحًا. النقر على التنبيه الآن ينقل إلى السجل المعني (`#/tasks/<id>` أو `#/clients/<id>` أو الداشبورد) — إضافة صغيرة لم تكن مطلوبة صراحة لكنها رخيصة ومفيدة.

### تعديلات على ملفات سابقة (وسببها)

| الملف | التعديل | السبب |
|---|---|---|
| `index.html` | إعادة هيكلة كاملة: قائمة جانبية بدل الشريط العلوي بروابطه | النموذج الجديد المتفق عليه |
| `css/base.css` | استبدال كل قواعد `.topbar`/`.nav`/`.nav-toggle-*` بقواعد `.sidebar-*`/`.app-shell`/`.app-main` | نفس السبب |
| `css/components.css` | إضافات فقط: `.task-*`، `.note-*` | لا حذف لما هو موجود |
| `app.js` | تسجيل مساري `tasks`/`notes`، استيرادهما، تحديث محدِّدات القائمة النشطة وطيّها لتستهدف الجانبية بدل العلوية | الصفحتان الجديدتان + النموذج الجديد |
| `schema.js` | ثلاثة كيانات جديدة (`taskLists`/`tasks`/`notes`) + `ENUMS.linkTypes` | البيانات الجديدة |
| `repository.js` | `PREPARE`/`VALIDATE`/`CASCADE` للكيانات الثلاثة + تسجيلها في `repo` | نفسه |
| `adapters/indexeddb.js` | ثلاثة مخازن جديدة + **`DB_VERSION` من ١ إلى ٢** | حتمي لمخازن جديدة كليًا (انظر أعلاه) |
| `dashboard.js` | لوحة "المهام" جديدة (متبقية/منجزة/متأخرة) | مؤشر طلبته صراحة |
| `util/global-search.js` | يشمل الآن المهام والأفكار | يخدم الصفحتين الجديدتين |
| `util/follow-up-alerts.js` | فحص تذكير المهام بجانب فحص العملاء | الميزة الجديدة |
| `pages/requests.js` | لا تعديل جديد — `clientName` المصدَّرة منها أُعيد استعمالها في `tasks.js`/`notes.js` | — |

**لم يُمسّ:** `matching.js` · `listing-parse.js` · `extraction.js` · `images.js` · `backup.js` (يشمل الكيانات الجديدة تلقائيًا بلا تعديل) · `riyadh-districts.js` · `seed.js` · `matches.js` · `tour-capture.js` · `tour-approve.js` · `tours.js` · `properties.js` · `clients.js` · `external.js` · `map.js` · `settings.js` (الصفحة، من هذه المرحلة تحديدًا) · كل ملفات `util/` الأخرى.

### اختُبر فعليًا (لا مراجعة نظرية)

طبقة البيانات: إنشاء/تعديل/حذف متسلسل/تحقّق حقول لكل كيان جديد. صفحة المهام: إضافة سريعة، نقل بين قوائم، ترتيب، إنجاز مع البقاء في القائمة، رابط عميق. صفحة الأفكار: التقاط، تثبيت، تحويل فعلي إلى مهمة مع أرشفة الأصل. تذكير المهام: مهمة متأخرة تُنبِّه ومستقبلية لا تُنبِّه بلا تكرار. مؤشر الداشبورد بأرقام صحيحة. البحث العام يجد مهام وأفكارًا. تشغيل `app.js` كاملًا وزيارة كل الصفحات العشر (عدا العقارات المُختبَرة سابقًا) بلا أخطاء حقيقية (تحقَّق بنطاق فحص داخل `#page` تحديدًا، بعد أن كشف فحص أول نتيجة زائفة من عنصر `<noscript>` الثابت).


## ١٦. المرحلة ٨ — ترتيب القائمة، تاق المصدر، تصنيفا الأولوية، الفواتير وعروض الأسعار

أربعة بنود من "آخر ست طلبات". **البندان ٢ (تسجيل الدخول) و٤ (صفحة العروض العامة) لم يُبنَ منهما شيء
ولا أثر لهما في الكود** — مؤجَّلان صراحة حتى ينتهي إعداد حساب Netlify، ويُعاد تقييم الخيار التقني للبند ٤
حينها لا قبله (انظر ملخص التسليم).

### تغيير المخطط

**رُفع `DB_VERSION` من ٢ إلى ٣** — مخزن جديد كليًا واحد (`invoices`) لا يمكن إنشاؤه بدون ترقية إصدار.
دالة `upgrade()` كما هي: تُنشئ الناقص فقط ولا تمسّ أي مخزن أو بيانات موجودة، فلا ترحيل بيانات يدوي.
وحقل `referralSource` أُضيف إلى ثلاثة كيانات قائمة بقيمة `''` افتراضًا، **فلا ترحيل له أيضًا**: السجل القديم
الذي لا يحمل الحقل يُقرأ كما هو، ويُملأ الافتراضي عند أول حفظ عبر `defaults()`.

### تاق المصدر — `referralSource`

- حقل نصّي حر اختياري على `properties` و`clients` و`requests`، فارغ افتراضًا (فلا تظهر شارة أصلًا).
- **اسمه ليس `source`:** `properties.source` مأخوذ منذ المرحلة ١ لمسار الإدخال (`tour | manual | external`)
  ويقرؤه محرك المطابقة والداشبورد، فالخلط بينهما كان يكسرهما.
- الاقتراحات: مفتاح `lists.sources` في الإعدادات (نفس أسلوب `clientTags`) —
  `getSources()` · `addSource(label)` · `removeSource(label)`. **اقتراح لا تقييد:** الحقل يقبل أي قيمة جديدة،
  وتُضاف للاقتراحات تلقائيًا بعد الحفظ. حذف قيمة من قائمة الاقتراحات لا يمسّ أي سجل يحملها.
- `js/util/source-field.js` (جديد): `sourceField(value, suggestions)` → `{ input, node }` (حقل + `<datalist>`) ·
  `rememberSource(value)` يُستدعى بعد الحفظ · `sourceBadge(value)` يعيد `null` للفارغ فلا يظهر شيء.
- يدخل `searchKey` للكيانات الثلاثة، فالبحث العام يجد السجل بمصدره.

### تصنيفا «جادّ» و«مهم» وترتيب الأولوية

- `BUILTIN_CLIENT_TAGS` في `schema.js`: `[{ label: 'جادّ', cls: 'tag-serious', priority: 2 }, { label: 'مهم', cls: 'tag-important', priority: 1 }]`.
  حاضران من أول تشغيل بلا إنشاء (يتقدّمان `clientTags` في `getLists()`)، و`removeClientTag` يرفض حذفهما،
  و`addClientTag` لا يكرّرهما في إضافات المستخدم. إضافة تصنيفات أخرى باقية كما هي بلا تغيير.
- التصنيفات تبقى **نصوصًا** في `client.tags` كما كانت (لا مفاتيح) — فلا ترحيل ولا كسر لبيانات قائمة.
- دوال خالصة في `schema.js`: `clientTagClass(tag)` (صنف اللون، `''` لغير المدمج) · `clientPriority(client)`
  (٢ / ١ / ٠، والحامل للاثنين يأخذ الأعلى) · `byClientPriority(clientOf)` (مقارن جاهز).
- **الترتيب في ثلاث صفحات لا واحدة:** العملاء (العميل نفسه) · الطلبات (بأولوية صاحب الطلب) ·
  المطابقات (ترتيب كتل الطلبات). القاعدة واحدة في الثلاث: الأولوية تنازليًا **ثم آخر تعديل تنازليًا كما كان**،
  فسلوك من لا يحمل تصنيفًا لم يتغيّر إطلاقًا.
- اللونان ثابتان في CSS (بنفسجي `#453188` للجادّ، توتي `#97123c` للمهم) ولا يُستعملان في أي شارة أخرى،
  ومعهما شريط جانبي خفيف على الصف المرفوع (`.row-priority-2` / `.row-priority-1`) يفسّر سبب تصدّره.

### ترتيب صفحات القائمة الجانبية

- مفتاح إعداد `sidebarOrder` = مصفوفة مفاتيح صفحات. `getSidebarOrder()` · `setSidebarOrder(order)` ·
  `resetSidebarOrder()` · و`orderedPageKeys(defaultKeys, saved)` **دالة خالصة** تدمج المحفوظ بالافتراضي:
  المحفوظ أولًا (بلا مفتاح لم يعد موجودًا) ثم أي صفحة جديدة في ذيل القائمة — فصفحة تُضاف في مرحلة لاحقة
  تظهر تلقائيًا بلا إعادة ضبط ولا اختفاء.
- `js/util/sidebar.js` (جديد): `SIDEBAR_PAGES` (مفتاح/عنوان/أيقونة، ترتيبه الافتراضي هو ترتيب `index.html` نفسه) ·
  `DEFAULT_PAGE_KEYS` · `pageLabel(key)` · `applySidebarOrder(order?)` التي تعيد ترتيب عناصر `<a>` الموجودة
  في الـDOM (`nav.append` ينقل العنصر لا ينسخه). **الروابط تبقى مكتوبة في `index.html`** فتظهر القائمة كاملة
  ولو تعطّلت الجافاسكربت، وهذا الملف لا ينشئ رابطًا ولا يخفي صفحة.
- اللوحة في الإعدادات بزرّي ↑↓ (نفس نمط ترتيب المهام في `tasks.js`): الحفظ فوري وتنعكس القائمة لحظيًا،
  وزر "إرجاع الترتيب الافتراضي" يمسح المفتاح. **ترتيب فقط بلا إخفاء** — بقرارك الصريح.

### `invoices` — الفاتورة وعرض السعر (كيان واحد بنوعين)

- `type` (`'invoice'`) **مطلوب** من `ENUMS.invoiceTypes`: `invoice` فاتورة · `quote` عرض سعر
- `date` ('') **مطلوب** ISO · `number` ('') رقم المستند
- `clientId` (null) عميل مرتبط اختياريًا · `clientName` ('') و`clientPhone` ('') **لقطة وقت الإصدار**
- `statement` ('') البيان · `notes` ('') ما يُطبع أسفل المستند
- `items` ([]) `[{ id, description, qty, unitPrice }]` — البند بلا وصف ولا مبلغ يُسقط تلقائيًا عند الحفظ
- **التحقق:** النوع من القائمة · بند واحد على الأقل · وكل بند له وصف.
- **لا ضريبة ولا خصم ولا حالة (مسودة/مدفوعة):** الإجمالي = مجموع (الكمية × سعر الوحدة) فقط، بقرارك الصريح.
- `invoiceTotal(invoice)` دالة خالصة في `schema.js` — **لا مجموع محسوب يُخزَّن أبدًا** (فلا يتناقض مع البنود).
- **لقطة اسم العميل مقصودة:** المستند المالي المطبوع لا يتغيّر بتعديل العميل ولا بحذفه؛ ولذلك حذف العميل
  القسري يترك فواتيره ويجعل `clientId = null` فقط (نفس منطق الصفقات)، و`clients.deleteImpact` صار يعدّها
  ويُظهرها في نافذة التأكيد.
- الفهارس الجديدة: `invoices: type, clientId, date`.

### بيانات الشركة والترقيم — مفتاح `company`

`{ name, phone, email, address, crNumber, logoImageId, footerNote, invoicePrefix, quotePrefix, nextInvoiceNo, nextQuoteNo }`
عبر `getCompany()` / `setCompany(patch)` (يُدمج بالافتراضي فالنقص لا يعطّل الطباعة).

- الشعار صورة واحدة في مخزن `images` (`entity: 'company'`) عبر `storeImage` نفسها — يُضغط تلقائيًا،
  ويدخل النسخة الاحتياطية مع بقية الصور بلا تعديل.
- `suggestInvoiceNumber(company, type)` دالة خالصة تعيد `بادئة + العدّاد`، و`consumeInvoiceNumber(type, used)`
  **تقدّم العدّاد فقط إذا حُفظ الرقم المقترح كما هو** — فالكتابة اليدوية فوقه لا تحرّك السلسلة ولا تُحدث فجوة.
  سلسلتان مستقلتان تمامًا للفاتورة ولعرض السعر.

### `js/pages/invoices.js` (جديدة، مسجَّلة `invoices`)

قائمة بفرز على النوع وبحث، ونموذج (نوع، رقم، تاريخ، عميل، بيان، بنود بجدول، ملاحظات) بإجمالٍ يُحسب لحظيًا
مع كل ضغطة. تدعم `#/invoices/<id>` بنفس نمط الروابط العميقة الموثّق. زر الطباعة **يحفظ أولًا** ثم يطبع،
فلا تُطبع ورقة تخالف المحفوظ.

### التصدير: PDF عبر طباعة المتصفح فقط

- `printInvoice(invoice, company, client)` تبني الورقة في `#print-root` (حاوية ثابتة في `index.html`، فارغة
  ومخفية بـ`display:none` على الشاشة) ثم تنادي `window.print()`. قواعد `@media print` في `components.css`
  تُخفي التطبيق كله (`.app-shell`، النوافذ، التنبيهات، شريط النسخة) وتُظهر الورقة وحدها بمقاس A4 وهوامش ١٦مم.
  التنظيف على حدث `afterprint` مع شبكة أمان مؤقتة (بعض المتصفحات لا تُطلقه عند الإلغاء).
- الجوال والبريد داخل الورقة بـ`direction: ltr` كي لا تنقلب خاناتهما في صفحة RTL.
- **بلا مكتبة وبلا تصدير صورة:** تصدير الصورة مرفوض صراحة الآن (يحتاج مكتبة تصوير DOM)، ولا أثر له في الكود.

### علّة مُصلحة في `backup.js` (من المرحلة ٧، وُجدت أثناء هذا العمل)

`STORE_ORDER` كانت **مكتوبة يدويًا بتسعة مخازن**، فلم تشمل `taskLists` و`tasks` و`notes` المضافة في المرحلة ٧
(بخلاف ما وثّقه القسم ١٥). وبما أن `importBackup` تمسح **كل** المخازن من `repo.raw.stores` قبل الاستبدال،
كان تصديرُ نسخة ثم استيرادُها **يمحو كل المهام والأفكار**. الآن `STORE_ORDER` مشتقّة من `STORES`
(الإعدادات أولًا والصور آخرًا) فيدخل أي مخزن جديد تلقائيًا — ومنه `invoices`. النسخ القديمة تُستورد كما هي
(المخزن الغائب عن الملف يُقرأ مصفوفةً فارغة كما كان).

### تعديلات على ملفات سابقة (وسببها)

| الملف | التعديل | السبب |
|---|---|---|
| `index.html` | رابط `invoices` في القائمة الجانبية · حاوية `#print-root` | الصفحة الجديدة · ورقة الطباعة |
| `app.js` | استيراد وتسجيل مسار `invoices` · نداء `applySidebarOrder()` مرة عند التشغيل | الصفحة الجديدة · ترتيب القائمة المحفوظ |
| `schema.js` | `invoices` في `STORES` و`SCHEMAS` · `ENUMS.invoiceTypes` · `invoiceTotal` · `BUILTIN_CLIENT_TAGS` و`clientTagClass`/`clientPriority`/`byClientPriority` · `referralSource` في افتراضيات العميل والعقار والطلب | البنود ٣ و٥ و٦ |
| `repository.js` | تطبيع `referralSource` (ودخوله `searchKey`) للكيانات الثلاثة · `PREPARE`/`VALIDATE` للفواتير وتسجيلها في `repo` · `clients.deleteImpact` يعدّ الفواتير و`clients.remove({force})` يفكّ ربطها بدل حذفها | البنود ٣ و٦ |
| `adapters/indexeddb.js` | مخزن `invoices` بفهارسه · **`DB_VERSION` من ٢ إلى ٣** | حتمي لمخزن جديد كليًا |
| `data/settings.js` | `sources` في القوائم (+`getSources`/`addSource`/`removeSource`) · حماية التصنيفين المدمجين (`isBuiltinClientTag`) وتصدّرهما `clientTags` · مفتاحا `sidebarOrder` و`company` بدوالهما و`orderedPageKeys`/`suggestInvoiceNumber`/`consumeInvoiceNumber` | البنود ١ و٣ و٥ و٦ |
| `data/backup.js` | `STORE_ORDER` مشتقّة من `STORES` بدل قائمة مكتوبة يدويًا | إصلاح علّة فقدان المهام والأفكار عند الاستيراد (أعلاه) |
| `pages/settings.js` | لوحتان جديدتان (ترتيب الصفحات · بيانات الشركة والمستندات) · كتلة «مصادر الإحالة» · تلوين التصنيفين ومنع حذفهما في لوحة القوائم | واجهات البنود ١ و٣ و٥ و٦ |
| `pages/clients.js` | ترتيب بالأولوية · صنف `row-priority-*` · ألوان التصنيفين في الجدول والتفاصيل والنموذج · حقل المصدر وشارته · ذكر الفواتير في نافذة حذف العميل | البندان ٣ و٥ |
| `pages/requests.js` | ترتيب بأولوية صاحب الطلب · حقل المصدر وشارته | البندان ٣ و٥ |
| `pages/properties.js` | حقل المصدر وشارته في البطاقة | البند ٣ |
| `pages/matches.js` | ترتيب كتل الطلبات بأولوية العميل · شارة التصنيف في رأس الكتلة | البند ٥ |
| `css/components.css` | إضافات فقط في آخر الملف: لونا التصنيفين وشريط الصف · شارة المصدر · لوحة الترتيب · جدول البنود · كتلة `@media print` كاملة | لا حذف لما هو موجود |

**ملفان جديدان:** `js/util/sidebar.js` · `js/util/source-field.js` · وصفحة `js/pages/invoices.js`.

**لم يُمسّ:** `matching.js` (لا معيار جديد ولا تغيير في المحرك — تاق المصدر لا يدخل المطابقة) ·
`listing-parse.js` · `extraction.js` · `images.js` · `seed.js` (لا بيانات تجريبية للفواتير) · `riyadh-districts.js` ·
`property-filters.js` · `global-search.js` (لا تشمل الفواتير — لم يُطلب) · `follow-up-alerts.js` ·
`dashboard.js` (لا مؤشر مالي جديد — لم يُطلب) · `tours*.js` · `external.js` · `map.js` · `tasks.js` · `notes.js` ·
`css/base.css` · كل ملفات `util/` الأخرى.

### اختُبر فعليًا في متصفح حقيقي (لا مراجعة نظرية، ولا jsdom هذه المرة)

التشغيل في **Chromium فعلي عبر Playwright** فوق خادم محلي، بتخزين IndexedDB حقيقي:

- **كل الصفحات الاثنتي عشرة** تُفتح بلا خطأ، و`DB_VERSION` قُرئ ٣ فعليًا من القاعدة ومخزن `invoices` منشأ.
- **الترتيب:** ↑ على آخر صفحة يحرّك القائمة الجانبية لحظيًا، الزران معطَّلان عند الطرفين، الترتيب يبقى بعد
  إعادة تحميل كاملة، و"إرجاع الافتراضي" يعيد الترتيب الأصلي حرفيًا.
- **المصدر:** أُدخل من نموذج العميل فعليًا، ظهرت الشارة للمعبّأ **ولم تظهر للفارغ**، والقيمة المستعملة صارت
  اقتراحًا في `datalist` النموذج التالي.
- **الأولوية:** ثلاثة عملاء (جادّ/مهم/بلا) أُنشئوا **بترتيب عكسي متعمَّد** ليتصدّر العاديُّ لولا الأولوية —
  فجاء «جادّ» أولًا ثم «مهم» في صفحة العملاء وفي الطلبات وفي كتل المطابقات، بالأصناف واللونين الصحيحين.
- **الفواتير:** رقم مقترح `فاتورة 1001`، إجمالي لحظي صحيح (50000 + 2×1500 = 53,000)، العدّاد تقدّم إلى 1002
  بعد استعمال المقترح، وسلسلة عرض السعر مستقلة (1001)، و**رقم يدوي لم يحرّك العدّاد**، ومستند بلا بنود
  رُفض برسالة عربية، والتعديل والحذف والرابط العميق `#/invoices/<id>` تعمل.
- **الطباعة:** الورقة بُنيت بالشعار المرفوع فعلًا وباسم الشركة وبياناتها والبنود والإجمالي والتذييل،
  و`window.print` نُودي مرة واحدة، وفي وسيط `print` كان التطبيق `display:none` والورقة `block`،
  وبعد `afterprint` نُظِّفت الحاوية وعاد التطبيق. وفُحصت الورقة بصريًا بلقطة شاشة.
- **الحذف المتسلسل:** حذف عميل قسريًا أبقى فاتورته وجعل `clientId = null` مع بقاء الاسم المطبوع.
- **النسخة الاحتياطية:** التصدير بعد الإصلاح شمل `taskLists` و`notes` و`invoices` فعليًا.
- **الجوال (٣٩٠px):** لا تجاوز أفقي للصفحة، وجدول المستندات داخل حاوية تمرير أفقي.


## ١٧. المرحلة ٩ — Netlify: بوابة دخول حقيقية وصفحة عروض عامة

تنفيذ البندين ٢ و٤ من "آخر ست طلبات" بعد جاهزية حساب Netlify (كانا مؤجَّلين بانتظارها).
**بلا أي تغيير على المخطط:** لا مخزن جديد، لا فهرس جديد، **بلا رفع `DB_VERSION`** (بقي ٣).
مفتاح إعداد واحد جديد (`publish`) في مخزن `settings` نفسه.

### ما تغيّر في الاستضافة

الموقع على Netlify باسم `motabiq-crm` (خطة Free). الملفات تُنشر من جذر المستودع كما هي —
**التطبيق نفسه ما زال بلا أداة بناء**، و`package.json` المضاف لا يخدم إلا تبعية واحدة للدوال
الخادمية (`@netlify/blobs`). و`netlify.toml` يضبط: مجلد النشر، مجلد الدوال، وترويسة
`no-cache` لصفحتَي `index.html` و`/offers/*` كي يصل التحديث فور النشر.

### البند ٢ — بوابة الدخول (`netlify/edge-functions/gate.js`)

**هذه حماية حقيقية، بخلاف ما كان مرفوضًا سابقًا.** كل طلب يمرّ على دالة حافة قبل أن يصل
إلى أي ملف: بلا كوكي صالحة **لا يُسلَّم شيء أصلًا — لا HTML ولا JS ولا حتى `repository.js`**
(مُختبَر فعليًا بطلب مباشر للملف). كلمة السر في متغيّر بيئة على Netlify، لا تُكتب في الكود
ولا تصل المتصفح ولا تظهر في مصدر الصفحة.

- الكوكي = `<انتهاء>.<HMAC-SHA256(انتهاء, APP_SECRET)>`، صلاحيتها ٣٠ يومًا،
  وخصائصها `HttpOnly; Secure; SameSite=Lax`. التوقيع المزوَّر والكوكي المنتهية يُرفضان.
- مقارنة كلمة السر بزمن ثابت (`safeEqual`) فلا تكشف طول التطابق.
- `/__login` يعرض النموذج ويستقبله · `/__logout` يمسح الكوكي (زر في لوحة الإعدادات).
- **صمام أمان مقصود:** إن لم يُضبط `APP_PASSWORD` أصلًا فالبوابة تمرّر — كي لا يحبس خطأ
  إعداد المالكَ خارج موقعه.
- المستثنى من البوابة عمدًا: `/offers*` (الصفحة العامة) و`/api/*` و`/.netlify/*`.
- متغيّرات البيئة: `APP_PASSWORD` · `APP_SECRET` · `PUBLISH_TOKEN` (الثلاثة أسرار على Netlify).

### البند ٤ — الصفحة العامة للعروض

**الحقيقة المعلنة في الصفحة نفسها: لقطة لا بثّ حيّ.** البيانات في IndexedDB على جهاز المالك،
فلا مصدر في السحابة ليُبثّ منه. ما أضافته Netlify فعلًا هو أن النشر صار **ضغطة زر واحدة**
بدل رفع ملف يدويًا — لا أكثر. (هذا حسم النقطة المفتوحة التي أُجِّلت في ملخص التسليم.)

- `netlify/functions/publish.js` (`/api/publish`) — محميّة بـ`PUBLISH_TOKEN`:
  `GET` يعيد قائمة الصور المرفوعة (فترفع اللوحة الناقص فقط) · `POST {kind:'image'}` صورة واحدة
  لكل طلب (حدّ حجم الطلب) · `POST {kind:'snapshot'}` يحفظ اللقطة **ويحذف الصور غير المرتبطة
  بأي عرض منشور** (والشعار محفوظ صراحة من هذا التنظيف) · `POST {kind:'clear'}` يُخلي كل شيء.
- `netlify/functions/listings.js` (`/api/listings`) — قراءة عامة بقصد.
- `netlify/functions/media.js` (`/api/media?id=`) — صور العروض، بمعرّف فقط بلا سرد ولا فهرسة.
- التخزين: Netlify Blobs، مخزن `motabiq-public` بقراءة `strong` (فالمنشور يظهر فورًا).
- `offers/` (صفحة مستقلة تمامًا: HTML+CSS+JS خاصّة بها) — **لا تستورد أي ملف من النظام
  الداخلي ولا تلمس IndexedDB**. تعرض البطاقات بفرز (نوع/غرض/حي) وزرّي واتساب واتصال ورابط
  الموقع، بنفس تقويم التطبيق (ميلادي بأرقام إنجليزية).
- `js/pages/publish.js` (جديدة، مسجَّلة `publish`): اختيار العقارات المعتمدة صراحة، إعدادات
  النشر، وزر «نشر الآن» بتقدّم مرئي، وزر «سحب كل ما نُشر».

**ما يخرج من الجهاز:** الحقول التسويقية للعقارات المختارة فقط (نوع، حي، مدينة، مساحة، سعر إن
اخترت إظهاره، ملاحظات، صور، ورابط خرائط مشتق). **ما لا يخرج أبدًا:** اسم المالك وجواله،
ملاحظاتك الداخلية عنه، العملاء والطلبات والمطابقات والفواتير — ولا عقار لم تختره بنفسك.

### `settings` — مفتاح `publish` الجديد

`{ token, endpoint, publicUrl, listingIds[], intro, showPrice, contactPhone, lastPublishAt, lastPublishCount }`
عبر `getPublishSettings()` / `setPublishSettings(patch)`. **قائمة المنشور محفوظة في الإعدادات
لا كحقل على العقار** — فلا تغيير على مخطط `properties` ولا ترحيل، و«سحب الكل» يصير تصفير قائمة.

### تعديلات على ملفات سابقة (وسببها)

| الملف | التعديل | السبب |
|---|---|---|
| `index.html` | رابط `publish` في القائمة الجانبية | الصفحة الجديدة |
| `app.js` · `util/sidebar.js` | تسجيل مسار `publish` وإدراجه في فهرس الصفحات | نفسه |
| `data/settings.js` | مفتاح `publish` بدالتيه | إعدادات النشر واختيار العروض |
| `pages/settings.js` | رابط «تسجيل الخروج» في لوحة المستخدم | صار للجلسة معنى بعد البوابة |
| **ملفات جديدة** | `netlify.toml` · `netlify/edge-functions/gate.js` · `netlify/functions/{publish,listings,media}.js` · `offers/{index.html,style.css,app.js}` · `js/pages/publish.js` · `package.json` · `.gitignore` | البندان ٢ و٤ |

**لم يُمسّ:** طبقة البيانات كلها (`repository.js` · `schema.js` · `adapters/indexeddb.js` ·
`backup.js` · `images.js`) · `matching.js` · كل صفحات المراحل السابقة عدا ما ذُكر · `css/*`
(الصفحة العامة وشاشة الدخول لهما أنماطهما المستقلة، فلا تعارض مع أنماط التطبيق).

### علّتان وُجدتا وأُصلحتا أثناء الاختبار الفعلي

1. **عرض مسحوب يبقى ظاهرًا للعميل دقيقة كاملة:** كانت `/api/listings` تُرسل
   `cache-control: max-age=60`، فبعد إلغاء اختيار عرض وإعادة النشر ظلّ ظاهرًا حتى بعد تحديث
   الصفحة (ثبت في المتصفح). صارت `max-age=0, must-revalidate` مع `cache: 'no-store'` في الصفحة،
   والصور وحدها تُخزَّن سنة (معرّفاتها ثابتة).
2. **الشعار يُحذف في كل نشرة:** تنظيف الصور غير المرتبطة كان يشمل شعار المكتب لأنه ليس ضمن
   صور العروض، فيختفي بعد أول نشر. صار محفوظًا صراحة.
   وأُصلح أيضًا فيضان أفقي (٢٧px) في شاشة الدخول على الجوال (`box-sizing` ناقص).

### اختُبر فعليًا (لا مراجعة نظرية)

**بوابة الدخول** — ١٣ اختبارًا تشغّل كود الحافة نفسه: زائر بلا كوكي لا يصل إلى أي ملف،
كلمة سر خاطئة تُرفض، الصحيحة تُصدر كوكي `HttpOnly/Secure/SameSite` لا تحوي كلمة السر،
التوقيع المزوَّر والكوكي المنتهية يُرفضان، تسجيل الخروج يمسح، والاستثناءات صحيحة.

**من طرف إلى طرف في Chromium حقيقي** (١٨ اختبارًا) فوق محاكاة محلية تشغّل **كود الدوال
الحقيقي كما هو** مع بديل Blobs في الذاكرة: شاشة الدخول تحجب التطبيق، طلب مباشر لملف داخلي
يعود بصفحة الدخول لا بالكود، الدخول يفتح التطبيق، اختيار عقارين ونشرهما، ثم **متصفح آخر بلا
أي كوكي** يفتح `/offers/` ويرى العرضين بصورهما المحمَّلة فعليًا من الخادم — **وبيانات المالك
غير موجودة في الصفحة إطلاقًا** (فُحص الاسم والجوال نصًّا)، وزر واتساب بالرقم الدولي الصحيح،
وإلغاء اختيار عرض ثم إعادة النشر يسحبه فعلًا، والنشر بمفتاح خاطئ يُرفض ٤٠١ ولا يغيّر شيئًا.
وفُحصت الصفحة العامة بصريًا بلقطة شاشة. واجتازت كل اختبارات المرحلة ٨ بعد التغيير (٥٥ اختبارًا).

**ما لم يُختبَر بعد (وسيُختبر عند أول نشر فعلي):** التشغيل على خوادم Netlify نفسها —
شبكة هذه الجلسة تحجب نطاقات `netlify.app`/`netlify.com`، فتعذّر الرفع من هنا. الربط الأخير
(ربط المستودع بالموقع من لوحة Netlify) خطوة واحدة على المالك، وبعدها يُعاد فحص:
تشغيل دالة الحافة، وقراءة/كتابة Blobs الحقيقية، وسريان متغيّرات البيئة.


## ١٨. المرحلة ١٠ — «كسّاب»، الخزنة المشفَّرة، ومقترحات التطوير المجانية

**بلا أي تغيير على المخطط:** لا مخزن جديد، لا فهرس جديد، **بلا رفع `DB_VERSION`** (بقي ٣).
مفتاحا إعداد جديدان (`vault`، وحقل `publishedRefs` داخل `publish`).

### إعادة التسمية إلى «كسّاب»

الاسم الظاهر صار «كسّاب» في كل مكان (العنوان، القائمة، شاشة الدخول، الطباعة، النسخ الاحتياطي).
والمعرّفات اللاتينية صارت `kassab` حيث كان التغيير آمنًا: اسم الحزمة، الكوكي، مخازن Blobs،
مفاتيح localStorage، وسوم التنبيهات، حدث `kassab:data-changed`، واسم ملف النسخة الاحتياطية.

**ما لم يُغيَّر عمدًا — لأن تغييره يُفسد أمورًا قائمة:**

| المعرّف | بقي | السبب |
|---|---|---|
| `DB_NAME` في `indexeddb.js` | `'motabiq'` | تغييره = قاعدة جديدة فارغة وفقدان كل ما على أجهزة الاستعمال الحالية. اسم داخلي لا يراه أحد. |
| `BACKUP_APP` عند **القراءة** | يقبل `kassab` و`motabiq` معًا | نسخك الاحتياطية القديمة تبقى قابلة للاستيراد (`LEGACY_BACKUP_APP`). الكتابة صارت `kassab`. |

### ١) الخزنة السحابية المشفَّرة — `js/data/vault.js` + `/api/vault`

أهم بند: البيانات كانت في متصفح جهاز واحد، وضياعه كان يعني ضياع كل شيء بين تصديرين يدويين.

- **التشفير كله في المتصفح:** AES-GCM بمفتاح مشتق بـPBKDF2 (٢٠٠ ألف دورة، SHA-256، ملح
  عشوائي لكل نسخة). ما يصل الخادم مغلّف `{ v, alg, kdf, rounds, salt, iv, data }` لا غير.
  **الخادم لا يستطيع فكّها، ولا نحن** — ونسيان العبارة السرّية يعني فقدان النسخ السحابية.
- الحماية: **كوكي بوابة الدخول نفسها** عبر `netlify/lib/auth.js` (يتحقق من التوقيع
  بـ`APP_SECRET`) — فلا مفتاح إضافي يُلصق ولا كلمة سر ثانية.
- يُحتفظ بآخر **٥** نسخ: الأحدث للاسترجاع، والأقدم شبكة أمان لو أفسدتَ البيانات ولم تنتبه.
- رفع تلقائي اختياري عند فتح التطبيق (مرة كل ٢٤ ساعة)، ويُعدّ تصديرًا فيسكت شريط التذكير.
  ولا يرفع قاعدة فارغة فوق نسخة صالحة.
- العبارة السرّية تُحفظ في هذا الجهاز ليعمل الرفع التلقائي — الخطر المفترض ضياع الجهاز لا
  اختراقه محليًا (ومن يملك جهازك المفتوح يرى البيانات في التطبيق أصلًا).

### ٢) المزامنة بين جهازين

نفس الخزنة: على الجهاز الثاني تكتب العبارة نفسها ثم «استرجاع». **قيد صريح معلن في الواجهة:**
الاسترجاع **يستبدل** بيانات الجهاز كلها (نفس سلوك الاستيراد من ملف منذ المرحلة ١)، فهي مزامنة
«آخر رفع يغلب» لا تعدد مستخدمين. الفريق الحقيقي ما زال يحتاج خادمًا بقاعدة بيانات — مؤجَّل كما هو.

### ٣) صفحة العرض الواحد — `netlify/functions/offer.js` (`/offers/l/:ref`)

رابط لكل عرض تشاركه مع عميل بعينه. **تُبنى على الخادم لسبب واحد:** وسوم `og:` يقرأها واتساب
قبل تشغيل أي جافاسكربت، فلا تصلح لها صفحة ثابتة تُعبَّأ في المتصفح. تقرأ اللقطة المنشورة نفسها
فلا تكشف أكثر مما نشرت، ورقم غير منشور يعيد ٤٠٤ برسالة مفهومة. وفي صفحة النشر زرّا نسخ
الرابط وإرساله في واتساب لكل عرض منشور (`publish.publishedRefs`).

### ٤) تنبيه المطابقات — `js/util/match-alert.js`

بعد إضافة عقار جديد أو اعتماد التقاط ميداني، يُسأل المحرك نفسه (`scoreOne`) عن الطلبات النشطة
التي يطابقها هذا العقار، فتظهر فورًا بنسبها وروابطها. **لا يُنشئ سجل مطابقة ولا يغيّر حالة شيء**
(التخزين الكسول كما هو منذ المرحلة ٣)، ولا يظهر شيء إن لم توجد مطابقة. تعديل عقار قائم لا يُنبّه
(إزعاج بلا فائدة) — الجديد فقط.

### ٥) وصل الفواتير ببقية النظام

لوحة في الداشبورد (عدد الفواتير وعروض الأسعار، إجمالي الفواتير، فواتير هذا الشهر، وقيمة عروض
الأسعار المعلّقة — **وعرض السعر ليس إيرادًا** فيُفصل)، وشمولها البحث العام، ومربع اختيار في
نموذج الصفقة يُنشئ **فاتورة بالعمولة** للعميل نفسه (مطفأ افتراضيًا، ولا يعمل بلا عمولة مُدخَلة).

### ٦) التثبيت على الجوال والعمل دون اتصال — `manifest.webmanifest` + `sw.js`

أيقونة على الشاشة الرئيسية، فتح بلا متصفح، وعمل دون اتصال أثناء الجولات الميدانية.
قاعدتان في عامل الخدمة: **لا يُخزَّن شيء من `/api/*` ولا `/offers*` ولا `/__login`** (فلا تُسلَّم
صفحة مخزَّنة لزائر غير مسجَّل، ولا بيانات نشر قديمة)، وصفحة HTML تُطلب من الشبكة أولًا
(فيصل التحديث فورًا) وتعود للمخزن عند الانقطاع. البيانات في IndexedDB ولا علاقة له بها.

### ٧) تنبيهات الخلفية — `/api/push` + `push-tick.js` (مجدولة كل ٥ دقائق)

القيد الموثَّق منذ المرحلة ٦ (لا تنبيه بعد إغلاق التبويب) يزول هنا.
**أقل ما يمكن من البيانات يغادر الجهاز:** `{ id, dueAt }` فقط لكل تذكير — **لا عناوين ولا
ملاحظات ولا أسماء** (مُختبَر: العنوان لا يظهر في المرفوع). نصّ التنبيه عام («لديك مهمة مستحقة»)
والتفاصيل تُقرأ من قاعدة جهازك عند النقر عليه. `selectDue()` دالة خالصة مُختبَرة وحدها:
المستحق فقط، بلا تكرار، وبلا تنبيه فات موعده أكثر من ٢٤ ساعة. الاشتراك المنتهي (404/410)
يُحذف تلقائيًا. التكلفة ٨٬٦٤٠ استدعاء شهريًا من أصل ١٢٥ ألفًا مجانية.

### تعديلات على ملفات سابقة (وسببها)

| الملف | التعديل | السبب |
|---|---|---|
| `index.html` | الاسم والشعار · `manifest` و`theme-color` والأيقونات · رابط صفحة النشر | التسمية + التثبيت |
| `app.js` | الرفع التلقائي للخزنة · تسجيل عامل الخدمة · اسم الحدث الجديد | البندان ١ و٦ |
| `data/settings.js` | مفتاح `vault` · `publishedRefs` في `publish` | البندان ١ و٣ |
| `data/backup.js` | `BACKUP_APP='kassab'` مع قبول القديم · اسم الملف | التسمية بلا كسر النسخ القديمة |
| `pages/settings.js` | لوحتا «النسخة السحابية المشفَّرة» و«تنبيهات الخلفية» | البندان ١ و٧ |
| `pages/dashboard.js` · `util/global-search.js` | لوحة الفواتير · شمولها البحث | البند ٥ |
| `pages/matches.js` | فاتورة العمولة من نموذج الصفقة | البند ٥ |
| `pages/properties.js` · `pages/tour-approve.js` | نداء `announceMatches` بعد الإضافة/الاعتماد | البند ٤ |
| `pages/tasks.js` | `syncReminders()` بعد كل تغيير | البند ٧ |
| `pages/publish.js` | أزرار رابط العرض الواحد | البند ٣ |
| `offers/app.js` · `offers/style.css` | بطاقة تفتح صفحة العرض · أنماطها | البند ٣ |
| `netlify/functions/{listings,media,publish}.js` | اسم المخزن `kassab-public` | التسمية |
| `package.json` | `web-push` · الاسم | البند ٧ |

**ملفات جديدة:** `js/data/vault.js` · `js/util/match-alert.js` · `js/util/push.js` ·
`netlify/lib/auth.js` · `netlify/functions/{vault,push,push-tick,offer}.js` · `sw.js` · `manifest.webmanifest` · `icons/*`.

**لم يُمسّ:** `repository.js` · `schema.js` · `adapters/indexeddb.js` (عدا تعليق اسم القاعدة) ·
`matching.js` (تنبيه المطابقات يستدعيه ولا يعدّله) · `images.js` · `seed.js` · `listing-parse.js` ·
`extraction.js` · بقية الصفحات.

### ما لم يُنفَّذ من المقترحات (وسببه)

- **صفحة التسعير التقديري:** مجانية برمجيًا لكنها تحتاج حسم نقاط وثيقة الخطة **وبيانات صفقات
  كافية**؛ بناؤها الآن يعطي رقمًا واثقًا وخاطئًا. تُبنى حين تتراكم عشرات الصفقات.
- **استخراج بيانات العرض من الصورة:** يحتاج مزوّد رؤية **مدفوعًا** — مستبعد بقرارك الصريح،
  ومكانه ما زال محجوزًا في `extraction.js` المعطَّل.

### اختُبر فعليًا (لا مراجعة نظرية)

**٨٤ اختبارًا ناجحًا** في Chromium حقيقي فوق محاكاة تشغّل كود الدوال الحقيقي:

- **التسمية:** العنوان والشعار، واسم القاعدة **لم يتغيّر** (تحقُّق مباشر من `indexedDB.databases()`)،
  والنسخة الجديدة توقَّع `kassab` **والقديمة `motabiq` ما زالت تُستورد**.
- **الخزنة:** التشفير وفكّه، ورفض العبارة الخاطئة برسالة واضحة، و**ما يصل الخادم لا يحوي أسماء
  عملائك** (فُحص نصًّا)، والاسترجاع على سياق متصفح ثانٍ نقل البيانات فعلًا، والاحتفاظ بـ٥ نسخ فقط،
  و٤٠١ بلا تسجيل دخول.
- **العرض الواحد:** يُفتح بلا دخول، وسوم `og:` الثلاثة مكتملة، الصورة تُحمَّل، و٤٠٤ لرقم غير منشور.
- **المطابقات:** العقار المطابق ينبّه، والنوع المختلف لا ينبّه، وغير المعتمد لا ينبّه.
- **الفواتير:** اللوحة بأرقام صحيحة، والبحث العام يجدها.
- **التثبيت:** الملف والأيقونات الثلاث تُخدَم، عامل الخدمة فعّال، **والتطبيق فُتح فعليًا بعد قطع
  الشبكة**، ولا شيء من `/api` أو `/offers` أو `/__login` في المخزن.
- **تنبيهات الخلفية:** المرفوع مواعيد فقط بلا عناوين، والاشتراك يُحفظ، والدالة المجدولة تعمل،
  و`selectDue` مُختبَرة وحدها بست حالات حدّية.
- **بلا انحدار:** كل اختبارات المراحل ٨ و٩ ما زالت ناجحة.

**ما لم يُختبَر بعد:** التسليم الفعلي لتنبيه من خدمة الدفع (يحتاج نشرًا حيًّا على https)، وتشغيل
الدوال على خوادم Netlify — شبكة جلسة التطوير تحجب نطاقاتها.


## ١٩. المرحلة ١١ — أدوات العمل اليومي

**بلا أي تغيير على المخطط يستلزم ترقية:** لا مخزن جديد ولا فهرس جديد، **و`DB_VERSION` باقٍ ٣**.
حقل واحد جديد على `tasks` (`repeat`) بقيمة `'none'` افتراضًا — لا ترحيل، والسجل القديم يُقرأ كما هو.
ومفتاحا إعداد جديدان (`templates`، و`ui.theme`/`ui.lastVisitAt` داخل مفتاح `ui` القائم).

### حزمة الاختبارات صارت داخل المستودع — `tests/`

كانت تُبنى من الصفر كل جلسة وتضيع بانتهائها. الآن:

- `node tests/run.mjs` يشغّل كل الحزم (وبكلمة مفتاحية يشغّل بعضها: `node tests/run.mjs vault`).
  يخرج بحالة غير صفرية عند أي فشل، فيصلح للتشغيل الآلي.
- `tests/server.mjs` يحاكي بيئة Netlify محليًا ويشغّل **كود الدوال الحقيقي كما هو**؛
  ويُشغَّل نسختين: مقفلة (لاختبار البوابة) ومفتوحة (لاختبار التطبيق وحده) — والفرق بينهما
  متغيّر `APP_PASSWORD` فقط، وهو سلوك `gate.js` نفسه لا مسار اختبار خاص.
- `tests/doubles/netlify-blobs.mjs` بديل تخزين في الذاكرة، يُوصَل عبر خطّاف استيراد
  (`tests/loader.mjs`) **بلا تلويث `node_modules`** ولا تعديل كود الإنتاج.
- ١٢ حزمة، **١٥٤ اختبارًا**.

### ١) صفحة «يومي» — `js/pages/today.js` (مسجَّلة `today`، وصارت الصفحة الافتراضية)

شاشة واحدة تجمع: متابعات اليوم · مهام مستحقة · **مطابقات جديدة لم تتصرّف فيها** · عملاء
تجاوزوا حدّ عدم التواصل · وما يحتاج إكمالًا (التقاطات بانتظار الاعتماد، عقارات ناقصة، عروض
خارجية غير جاهزة، عروض أسعار معلّقة). **لا تُخزّن ولا تحسب شيئًا جديدًا:** كل رقم من الدوال
نفسها التي تستعملها الصفحات الأخرى (`candidatesFor`، `matchReadiness`، `isComplete`،
`getFollowUpSettings`)، فلا مصدر حقيقة ثانٍ يتناقض معها.
«المطابقة الجديدة» = مرشّح فوق الحدّ بلا سجل في `matches` (أي لم تتصرّف فيه) — يتّسق مع
التخزين الكسول الموثّق في القسم ١١. و`ui.lastVisitAt` يُختم **بعد** البناء لا قبله.

### ٢) طلب من رسالة واتساب — `parseRequestText` في `listing-parse.js`

يلصق الوسيط رسالة العميل كما هي فتُفتح استمارة الطلب معبّأة. **يعيد استعمال
`parseListingText` نفسه** (لا قارئ ثانٍ) ثم يعدّل ما يختلف في الطلب:

| في العرض | في الطلب |
|---|---|
| حي واحد (الأطول تطابقًا) | **كل** الأحياء المذكورة («الياسمين أو النرجس») مع إسقاط المتضمَّن في اسم أطول |
| `price` سعر معروض | `budgetMax` سقف — تُقرأ كلمات «ميزانيتي/بحدود/سقف/لا يتجاوز» أولًا |
| `purposes` مجموعة | `purpose` واحد (والزائد ينبّه لا يُسقط) |

ويقرأ أيضًا اسم المرسل وجواله: الجوال المعروف **يختار العميل الموجود**، وغير المعروف يُكتب في
ملاحظات الطلب — **ولا يُنشأ عميل تلقائيًا أبدًا**. القراءة محلية بالكامل: بلا شبكة ولا مفتاح.
كل حقل يبقى قابلًا للتعديل، ولا يُحفظ شيء إلا بضغطك «حفظ».

### ٣) قوالب رسائل واتساب — `js/util/templates.js` + مفتاح `templates`

أربعة قوالب مدمجة (عرض عقار · متابعة بعد المعاينة · تذكير بموعد · شكر بعد الصفقة) قابلة
للتعديل والإضافة والحذف من الإعدادات. المتغيّرات (`{اسم_العميل}`، `{السعر}`، `{الرابط}`…)
تُعبَّأ من العقار وصاحبه وإعداداتك. **قاعدة مهمة:** السطر الذي يبقى بلا قيمة بعد الاستبدال
**يُحذف كاملًا** — فلا تُرسل «السعر: » فارغة. الإرسال من قائمة مشاركة العقار، ويُوجَّه إلى جوال
المالك إن وُجد وإلا تختار المستلم داخل واتساب.

### ٤) قوائم عروض مخصّصة لعميل — `netlify/functions/client-list.js` + `offers/list.html`

تختار عروضًا **من المنشور أصلًا** لعميل بعينه فيصله رابط برمز عشوائي (١٦ محرفًا) يعرض قائمته
وحده. القائمة تشير إلى اللقطة نفسها فلا تكشف شيئًا زائدًا، والكتابة محميّة بكوكي بوابة الدخول.
**عدّاد فتح** يخبرك هل فتح العميل الرابط وكم مرة وآخر مرة — إشارة متابعة، بلا أي تتبّع لشخصه
(لا IP ولا بصمة ولا هوية؛ رقمٌ وتاريخ فقط). الحذف يوقف الرابط فورًا.

### ٥) سعر المتر ومؤشر السوق — `js/util/price-stats.js`

دوال خالصة: `pricePerSqm` · `median` · `buildPriceIndex` · `comparePrice`.
المؤشر **من بياناتك أنت** لا من مصدر خارجي: المخزون المعتمد + العروض الخارجية النشطة +
**الصفقات المنجزة بسعرها النهائي** (أصدق من أي سعر مطلوب). الوسيط لا المتوسط كي لا يفسده عرض
شاذّ، وحدّ أدنى للعيّنة (٢) **ويُذكر حجمها دائمًا** — فلا يُصدر رقمٌ من عيّنتين حكمًا كأنه من عشرين.
تظهر شارةً على بطاقة العقار (سعر المتر وموضعه من وسيط حيّه) ولوحةً في الداشبورد.
وهذا هو الأساس الصحيح لصفحة التسعير التقديري المؤجَّلة: بيانات متراكمة لا تخمين.

### ٦) بطاقة عقار للطباعة — `js/util/property-print.js`

نفس آلية طباعة الفواتير حرفيًا (`#print-root` + `@media print`): صور (حتى ٤) وبيانات العقار
وحقول نوعه وشعارك وبيانات مكتبك. **بلا مكتبة وبلا تصدير صورة** (مرفوض بقرارك منذ المرحلة ٨).

### ٧) استيراد جهات الاتصال وتصدير CSV — `js/data/exchange.js`

- `parseVCards(text)` يقرأ ملف vCard المصدَّر من الجوال (بفكّ الالتفاف وQUOTED-PRINTABLE
  لدعم العربية) → `[{ name, phone, phone2 }]`.
- `importContacts(...)` **يضيف عملاء جددًا فقط**: الجوال المسجَّل مسبقًا يُتخطّى ولا يُعدَّل
  ولا يُحذف شيء أبدًا، والنتيجة تُعرض بالأرقام (أُضيف/تُخطّي/تُجوهل).
- تصدير CSV لخمسة جداول (العملاء، العقارات، الطلبات، الصفقات، الفواتير) **بعلامة BOM**
  ليفتحه إكسل بالعربية مباشرة. **ليس بديلًا عن النسخة الاحتياطية:** لا يحفظ الصور ولا يصلح
  للاستعادة — والتنبيه مكتوب في الواجهة نفسها.

### ٨) مهام متكررة — حقل `tasks.repeat`

`none | daily | weekly | monthly` (من `ENUMS.taskRepeats`). **إنجاز** المهمة المتكررة يُبقي
المنجزة في مكانها للسجل ويُنشئ التالية بموعدها. والموعد الفائت يُدفع إلى **أقرب موعد قادم**
بدل إغراقك بمتأخرات وهمية.

### ٩) الإدخال بالصوت — `js/util/voice.js`

زر إملاء في التقاط الأفكار وإضافة المهام السريعة عبر `SpeechRecognition` (عربي `ar-SA`).
**لا يظهر الزر أصلًا حين لا يدعمه المتصفح** (فايرفوكس) — لا زر معطَّل يربك. وهو **زر صريح
تضغطه أنت** ولا يعمل تلقائيًا؛ والتعرّف يجري عبر خدمة المتصفح لا عبر خادمنا، وهذا مذكور في
تعليق الملف لأنه الاستثناء الوحيد من «لا تخرج البيانات من الجهاز».

### ١٠) المظهر: فاتح/داكن/يتبع النظام — `js/util/theme.js`

الرموز (CSS variables) وحدها تُعاد تعريفها على `:root[data-theme="dark"]` وتحت
`prefers-color-scheme: dark` للمستخدم الذي لم يختر — **لا قاعدة تخطيط واحدة تتكرر**.
`applyTheme` في وحدة مستقلة لا في `app.js` تفاديًا لاستيراد دائري من صفحة الإعدادات.

### تعديلات على ملفات سابقة (وسببها)

| الملف | التعديل | السبب |
|---|---|---|
| `app.js` · `index.html` · `util/sidebar.js` | تسجيل `today` وجعلها الافتراضية · تطبيق السمة عند التشغيل | البندان ١ و١٠ |
| `data/settings.js` | `templates` (+ دواله) · توثيق `ui.theme`/`ui.lastVisitAt` | البندان ٣ و١٠ |
| `data/schema.js` · `repository.js` | `taskRepeats` و`tasks.repeat` مع تطبيعه والتحقق منه | البند ٨ |
| `data/listing-parse.js` | `parseRequestText` فوق القارئ نفسه | البند ٢ |
| `pages/requests.js` | زر «لصق رسالة عميل» و`prefill` في `openForm` | البند ٢ |
| `pages/properties.js` | قوالب الرسائل وبطاقة الطباعة في قائمة المشاركة · شارة سعر المتر · تحميل العروض والصفقات للمؤشر | البنود ٣ و٥ و٦ |
| `pages/dashboard.js` | لوحة «مؤشر سعر المتر» | البند ٥ |
| `pages/publish.js` | لوحة القوائم المخصّصة · **وتحميل العملاء** (كان ينقص فانكسر اختيار العميل — علّة وُجدت بالاختبار) | البند ٤ |
| `pages/tasks.js` · `pages/notes.js` | التكرار وإنشاء التالية · زر الإملاء | البندان ٨ و٩ |
| `pages/settings.js` | لوحات: المظهر · الاستيراد والتصدير · القوالب | البنود ٣ و٧ و١٠ |
| `css/base.css` | رموز الوضع الداكن (إضافة فقط، لا تعديل على الفاتح) | البند ١٠ |
| `css/components.css` | أصناف «يومي» وسعر المتر والقوالب والميكروفون وبطاقة الطباعة | — |

**ملفات جديدة:** `js/pages/today.js` · `js/util/{templates,price-stats,property-print,voice,theme}.js` ·
`js/data/exchange.js` · `netlify/functions/client-list.js` · `offers/{list.html,list.js}` · `tests/*`.

**لم يُمسّ:** `adapters/indexeddb.js` · `matching.js` · `images.js` · `backup.js` · `vault.js` ·
`seed.js` · `gate.js` · بقية الدوال الخادمية.

### اختُبر فعليًا (لا مراجعة نظرية)

**١٥٤ اختبارًا ناجحًا، صفر فشل** — `node tests/run.mjs`. الجديد منها:

- **«يومي»:** متابعة متأخرة ومهمة متأخرة مزروعتان تظهران فعلًا، واللوحات الخمس موجودة،
  والصفحة الافتراضية صارت `#/today`.
- **قراءة الرسالة:** رسالة عربية واقعية قُرئ منها النوع والغرض **وحيّان** والميزانية (٢ مليون
  بالأرقام العربية) والمساحة، ثم فُتحت الاستمارة **معبّأة فعليًا** (فُحصت قيم الحقول والشرائح).
- **القوالب:** التعبئة صحيحة، **والسطر بلا قيمة يُحذف**، والرابط يحمل الرقم الدولي.
- **سعر المتر:** غير المعتمد لا يدخل المؤشر، والصفقة تدخل بسعرها النهائي، والمقارنة تكشف
  المرتفع، **وبلا عيّنة كافية لا يُصدر حكمًا**.
- **التكرار:** إنجاز مهمة أسبوعية أنشأ التالية بموعد **في المستقبل** لا في الماضي.
- **vCard/CSV:** الجوال المكرر يُتخطّى، وإعادة الاستيراد لا تضيف شيئًا، وCSV بعلامة BOM
  ويقتبس الفواصل.
- **القوائم المخصّصة:** أُنشئت من الواجهة، وفُتحت من **متصفح بلا تسجيل دخول**، وعرضت
  العرض المختار وحده، وتقدّم العدّاد مع كل فتحة، والإنشاء بلا دخول مرفوض ٤٠١، والحذف أوقف
  الرابط فورًا.
- **المظهر:** الداكن يغيّر الخلفية فعليًا (قيمة محسوبة من المتصفح)، و«يتبع الجهاز» يزيل السمة.
- **بلا انحدار:** كل حزم المراحل ٨–١٠ ما زالت خضراء.


## ٢٠. المرحلة ١٢ — صفحة «الفرص»: أين أذهب أقتنص؟

**بلا أي تغيير على المخطط:** لا مخزن، لا حقل، لا فهرس، **ولا مفتاح إعداد جديد**. صفحة وحدة
حساب خالصة فقط — كل شيء يُحسب لحظة العرض من البيانات القائمة.

### المبدأ: الطلب غير الملبّى لا عدد الطلبات

قياس الطلب بعدد الطلبات في الحي **مضلِّل**: طلبٌ عنده تسع مطابقات ليس فرصة. المقياس هنا:

> **الطلب غير الملبّى** = طلب نشط يشمل الحي و`candidatesFor(...).length === 0`
> — بمحرك المطابقة نفسه، بسعره ومساحته وقواطعه، لا بالحي وحده.

ولذلك فالرقم متّسق حتمًا مع صفحة المطابقات: مصدره الدالة نفسها بالحدّ نفسه
(`settings.minScore`)، لا حساب مواز قد ينحرف عنها.

### `js/util/opportunity.js` (جديد) — دوال خالصة

- `buildOpportunityIndex(ctx, { minScore })` → `{ rows, cities, totals }`. `ctx` هو مخرج
  `loadMatchingContext` نفسه.
  كل صف `{ city, district, type, demand, unmet, supply, market, gap, requests[] }`:

| الحقل | معناه |
|---|---|
| `demand` | طلبات نشطة تشمل هذا الحي بهذا النوع |
| `unmet` | منها ما لا مرشح له إطلاقًا — **وهذه هي الفرصة** |
| `supply` | عقاراتك **المعتمدة** هناك (`captureStatus === 'approved'` فقط) |
| `market` | عروض خارجية **نشطة** هناك: سوق متاح ليس ملكك |
| `requests[]` | الطلبات غير الملبّاة نفسها، لتتصل بأصحابها مباشرة |

- `collapseByDistrict(rows)` يدمج الأنواع في صف لكل حي · `topOpportunities(rows, n)` لملخّص
  «يومي» · `surplusRows(rows)` للمخزون الراكد بلا طلب نشط.

**قواعد حسابية مقصودة:**
- **النطاقات تُوسَّع** عبر `requestDistricts` — فطلب «شمال الرياض» يظهر عجزه في كل حي من نطاقه.
- **الطلب بلا حي محدَّد** («أي حي») لا يُنسب إلى حي بعينه، فلا يفتعل عجزًا وهميًا في كل الأحياء.
- **الطلب الموقوف أو المنجز** لا يدخل إطلاقًا · **الالتقاط غير المعتمد** ليس مخزونًا ·
  **العرض الخارجي المؤرشف أو غير المتاح** ليس سوقًا.

### `js/pages/opportunities.js` (جديدة، مسجَّلة `opportunities`)

جدولان: أحياء العجز (مرتّبة بالطلب غير الملبّى تنازليًا)، و«التخمة» (مخزون ≥ ٢ بلا أي طلب
نشط يشمله — راجع سعره أو وسّع تسويقه). فرز بالمدينة، ومفتاح «فصل حسب نوع العقار»
(الافتراضي مفعَّل: ٧ طلبات فلل و٢ أراضٍ ليسا عجزًا واحدًا). والنقر على «من يطلبه؟» يكشف
أصحاب الطلبات بأسمائهم وجوالاتهم وميزانياتهم وروابط طلباتهم.

**عمود «التشخيص» بدل رقم فجوة:** جُرِّب أولًا عمود `gap = unmet − supply`، فأظهر الاختبار
البصري أنه **مضلِّل**: «عجز ١» بينما ٣ عملاء لا يجدون شيئًا ومخزونك الاثنان لا يناسب أحدًا.
فصار العمود تشخيصًا عمليًا:

| الحالة | التشخيص |
|---|---|
| عجز بلا مخزون ولا سوق | «لا مخزون لك ولا في السوق — اقتنص» |
| عجز بلا مخزون وفي السوق عروض | «لا مخزون لك — لكن في السوق عروض» |
| عجز **مع** وجود مخزون | «مخزونك هنا لا يناسبهم — راجع السعر والمساحة» (العائق سعر أو مساحة لا وجود عقار) |

(حقل `gap` باقٍ في طبقة الحساب للاستعمال البرمجي، ولا يُعرض رقمًا في الواجهة.)

### تعديلات على ملفات سابقة (وسببها)

| الملف | التعديل | السبب |
|---|---|---|
| `app.js` · `index.html` · `util/sidebar.js` | تسجيل مسار `opportunities` ورابطه | الصفحة الجديدة |
| `pages/today.js` | لوحة «أحياء يطلبها عملاؤك ولا تملك فيها» (أعلى ٣) | المكان الذي تنظر فيه يوميًا — وبالدوال نفسها بلا تكرار منطق |
| `css/components.css` | `.section-title` فقط | — |
| `tests/run.mjs` | تسجيل حزمتين جديدتين | — |

**لم يُمسّ:** `matching.js` (يُستدعى ولا يُعدَّل) · طبقة البيانات كلها · بقية الصفحات.

### اختُبر فعليًا

**١٧٩ اختبارًا ناجحًا، صفر فشل** (`node tests/run.mjs`)، منها ٢٥ جديدًا:

- **وحدة الحساب (١٥ اختبارًا بأرقام محسوبة يدويًا):** الطلب الملبّى لا يُحسب فرصة وغير الملبّى
  يُحسب · الالتقاط غير المعتمد ليس مخزونًا · العرض المؤرشف ليس سوقًا · النطاق يُوسَّع فيظهر
  العجز في كل حي فيه · الطلب الموقوف لا يدخل · الطلب بلا حي لا يفتعل عجزًا · التخمة تُكشف ·
  الدمج بالحي يجمع الأنواع · قاعدة فارغة لا تنهار.
- **في متصفح حقيقي (١٠):** الصفحة تعرض حي العجز وحي التخمة بأرقامهما، والتفصيل يكشف
  أصحاب الطلبات بجوالاتهم وميزانياتهم، والتشخيص صحيح، والدمج بالنوع يعمل، والملخّص يظهر في
  «يومي» — **وإضافة عقار مطابق تُسقط الحي من قائمة العجز فورًا** (اتساق فعلي مع المحرك).
- وفُحصت الصفحة بصريًا بلقطة شاشة قبل التسليم (وبها اكتُشف عمود الفجوة المضلِّل).


## ٢١. المرحلة ١٣ — إتمام أدوات العمل (البنود ٢–١١)

### تغيير المخطط

**رُفع `DB_VERSION` من ٣ إلى ٤** — مخزن جديد واحد (`expenses`) لا غير. `upgrade()` كما هي:
تُنشئ الناقص ولا تمسّ بيانات. وحقلان أُضيفا بقيمة خاملة فلا ترحيل لهما:
`matches.rejectReason` (null) و`deals.leaseEndAt` (null).

### `expenses` — المصروف (الجديد)

- `date` **مطلوب** · `amount` **مطلوب** (> 0) · `category` من `ENUMS.expenseCategories`
  (وقود · إعلانات · عمولة وسيط شريك · رسوم · مكتب · ضيافة · أخرى) · `note` · `dealId` · `propertyId`.
- **قاعدة حذف مقصودة:** حذف الصفقة **لا يحذف مصاريفها** — المصروف صُرف فعلًا، فيبقى ويُفكّ
  ربطه (`dealId = null`)، كما تبقى الفواتير عند حذف العميل.
- **صافي الربح = العمولات − المصاريف.** وسعر البيع (`finalPrice`) ليس دخلك فلا يدخل الحساب —
  وهذا مذكور في الواجهة نفسها لأن لوحة «الصفقات» تعرضه إيرادًا.
- `monthlySummary({ expenses, deals, months })` مصدَّرة من `pages/expenses.js` — دالة خالصة
  تُرجع صفوف الأشهر (عمولات/مصاريف/صافي) وتُستعمل في الصفحة.

### البنود العشرة

| البند | أين | ملاحظة تصميمية |
|---|---|---|
| **٢** إرسال للمطابقين | `util/match-alert.js` | لكل عميل مطابق زر واتساب برسالة من **قوالبك** معبّأة بالعقار والعميل، مع اختيار القالب. **واتساب لا يسمح بإرسال جماعي** — نقرة لكل عميل، وهذا حدّ المنصة. وأُضيف زر «من يناسبه هذا العقار؟» في قائمة المشاركة فلم يعد التنبيه لحظة الإضافة فقط. |
| **٣** المصاريف | `pages/expenses.js` + لوحة داشبورد | أعلاه. |
| **٤** اتفاقية الوساطة | `util/property-print.js` → `printAgreement` | تُملأ من العقار ومالكه وإعداداتك (نسبة العمولة، المدة، البنود)، بمكانَي توقيع. **البنود نصّ تكتبه أنت ويُطبع كما هو — ليست مشورة قانونية**، وهذا مكتوب في الإعدادات. |
| **٥** وضع العرض للعميل | `util/client-mode.js` | يخفي `[data-sensitive]` (اسم المالك وجواله، تاق المصدر) ويخفي روابط الصفحات الإدارية. **إخفاء عرضٍ لا حذف بيانات**، و**لا يُحفظ بين الجلسات** (`sessionStorage`) كي لا تُفاجأ ببيانات مخفية غدًا. |
| **٦** المقارنة والكتالوج | `pages/properties.js` + `printPropertyCatalog` | تحديد بمربعات على البطاقات، شريط يظهر عند الاختيار فقط، جدول مقارنة (ومنه سعر المتر)، وكتالوج بصفحة لكل عقار. |
| **٧** الغلاف وترتيب الصور | `pages/properties.js` | ترتيب `property.images` هو ترتيب العرض، وأولها الغلاف الذي يراه العميل في الصفحة العامة وبطاقة الطباعة. أزرار → ← ★ على كل صورة. |
| **٨** سبب الرفض | `pages/matches.js` + لوحة داشبورد | يُسأل عند «غير مهتم» **والتخطّي مسموح**؛ ولوحة «لماذا تضيع الصفقات» تعرض كم رفضًا **بلا سبب** وتحذّر من البناء على أقل من عشرة أسباب. |
| **٩** تجديد الإيجار | `deals.leaseEndAt` + «يومي» | عقد ينتهي خلال ٤٥ يومًا (أو انتهى) يظهر في «يومي». |
| **١٠** الأهداف الشهرية | مفتاح `goals` + «يومي» | شريط تقدّم للصفقات والعمولات. **صفر = بلا هدف فلا يظهر شريط** — لا إزعاج لمن لا يريد أهدافًا. |
| **١١** العرض البائت | `goals.staleListingDays` (٦٠ افتراضًا) + «يومي» | عقار معتمد لم يُحدَّث منذ الحدّ ولم يُبَع/يُؤجَّر. |

### تعديلات على ملفات سابقة (وسببها)

| الملف | التعديل | السبب |
|---|---|---|
| `schema.js` · `repository.js` · `adapters/indexeddb.js` | كيان `expenses` وقواعده ورفع الإصدار · `rejectReason` · `leaseEndAt` · تصنيفات المصاريف وأسباب الرفض | البنود ٣ و٨ و٩ |
| `data/settings.js` | مفتاح `goals` · حقول الاتفاقية في `company` | البندان ٤ و١٠ |
| `pages/dashboard.js` | لوحتا «صافي الربح» و«لماذا تضيع الصفقات» | البندان ٣ و٨ |
| `pages/today.js` | الهدف (أول لوحة) · التجديدات · العروض البائتة | البنود ٩ و١٠ و١١ |
| `pages/properties.js` | التحديد والمقارنة والكتالوج · الغلاف والترتيب · الاتفاقية · «من يناسبه؟» · وسم الحقول الحسّاسة | البنود ٢ و٤ و٥ و٦ و٧ |
| `pages/matches.js` | سؤال سبب الرفض · حقل نهاية عقد الإيجار | البندان ٨ و٩ |
| `pages/settings.js` | لوحة الأهداف · بنود الاتفاقية | البندان ٤ و١٠ |
| `index.html` · `app.js` · `util/sidebar.js` | صفحة المصاريف · زر وضع العرض وشريطه | البندان ٣ و٥ |
| `css/base.css` | **`[hidden] { display: none !important; }`** | علّة حقيقية: شريط وضع العرض كان يظهر وهو مطفأ لأن `display:flex` في صنفه تغلّب على سمة `hidden` |

### اختُبر فعليًا

**٢٠٧ اختبارات ناجحة، صفر فشل** (`node tests/run.mjs`)، منها ٢٤ جديدًا في
`tests/expenses-and-tools.mjs`: ترقية القاعدة إلى ٤ · صافي الربح محسوبًا · رفض المبلغ صفر
والتصنيف المجهول · **حذف الصفقة يُبقي المصروف ويفكّ ربطه** · سبب الرفض يُحفظ والمجهول يُرفض ·
لوحتا الداشبورد · شريط الهدف بنسبته · التجديد والبائت في «يومي» · وضع العرض يخفي
`[data-sensitive]` **فعليًا بقياس `display` من المتصفح** ويُعيدها عند الإنهاء ·
**الشريط مخفي فعلًا قبل التفعيل** (اختبار يمنع تكرار علّة `hidden`) · المقارنة والكتالوج
المطبوع · ترتيب الصور · والاتفاقية بطرفيها وعمولتها ومدتها وبنودها ومكانَي التوقيع.
وفُحصت صفحتا المصاريف و«يومي» بصريًا بلقطتين (وبهما اكتُشفت علّة الشريط، ورُفعت لوحة الهدف
إلى أول الصفحة لأنها كانت تحت الطيّ).

---

## ٢٢. المرحلة ١٤ — صفحة «تقدير السعر»: بكم أعرضه؟

**لا تغيير في المخطط ولا في إصدار القاعدة (يبقى ٤).** الصفحة قراءة محضة: لا مخزن جديد،
ولا حقل جديد، ولا كتابة واحدة إلى التخزين. كل ما تحتاجه موجود أصلًا في `properties`
و`externalListings` و`deals`.

### ما تجيب عنه

المالك يأتيك بعقار بلا سعر، أو يأتيك بسعرٍ تشكّ فيه. الصفحة تقول: **وسيط سعر المتر في
حيّه ونوعه وغرضه × مساحته**، ومعه **نطاق الربيعين** (الربع الأدنى إلى الربع الأعلى)
و**جدول العقارات التي جاء منها الرقم**.

### القواعد التي تحمي الرقم من الكذب

| القاعدة | لماذا |
|---|---|
| **البيع لا يُخلط بالإيجار** (`purposeKey`) | خلطهما يفسد الوسيط تمامًا: مليونان بجانب تسعين ألفًا. وحقل `price` رقم واحد فلا يحتمل غرضين. القاعدة: إيجارٌ إن ذُكر الإيجار ولم يُذكر البيع، وما عداه (بيع/استثمار/بلا غرض) في كفّة البيع. |
| **العقار المقدَّر لا يدخل عيّنته** (`excludeId`) | سعره المطلوب هو ما نختبره؛ إدخاله يجعل الرقم يصدّق نفسه. ويُستبعد معه صفقته إن وُجدت. |
| **حدّ أدنى ثلاثة سجلات** | أقلّ من ذلك ليس عيّنة. والصفحة **تصمت وتقول لماذا** بدل أن تخترع رقمًا. |
| **التراجع إلى المدينة مُعلَن** | إن لم تكفِ عيّنة الحي يُحسب على مستوى المدينة، **ويُكتب ذلك في الواجهة** وتُخفَّض الثقة إلى «ضعيفة» دائمًا — الفرق بين حي وحي كبير. |
| **الوسيط لا المتوسط، والربيعان لا الطرفان** | عرضٌ شاذّ واحد يفسد المتوسط والمدى، ولا يفسد الوسيط والربيعين. |
| **المعتمد والنشط والنهائي فقط** | مخزونك `captureStatus === 'approved'` · العروض الخارجية `status === 'active'` · الصفقة بسعرها **النهائي** ومساحة عقارها. نفس فلترة المرحلة ١١ بلا تغيير. |
| **الثقة من بُعدين** | قرب العيّنة (حي أم مدينة) **وتشتّتها**. عيّنة واسعة متفرّقة ليست ثقة، فيظهر تحذير «العيّنة متفرّقة جدًا» حين يتجاوز التشتّت ٦٠٪ من الوسيط. |

### الدوال (كلها خالصة في `js/util/price-stats.js`)

- `purposeKey(item)` → `'sale' | 'rent'`.
- `quantile(values, q)` — شريحة مئوية باستيفاء خطي (للربيعين).
- `priceSamples({ properties, externals, deals })` → عيّنة خام: `{ source, city, district, type,
  purpose, price, area, ppm, id, at, propertyId? }`. **هي الآن المصدر الوحيد** الذي يبني عليه
  `buildPriceIndex` أيضًا، فلا يتفرّع حسابان.
- `estimatePrice(target, samples, { minSample = 3, comparables = 8 })` →
  `{ ok, basis: 'district'|'city', count, purpose, area, ppm: { median, low, high },
  estimate, low, high, spread, confidence, sources, comparables }`، أو
  `{ ok: false, reason: 'area' | 'sample', count }`.

### تغيير سلوكي في ما سبق (مقصود)

**`buildPriceIndex` صار يفصل الغرض**: مفتاح الدلو أصبح (مدينة، حي، نوع، **غرض**)،
و`get()` تأخذ وسيطًا خامسًا `purpose` (افتراضه `'sale'`)، وصفوفه تحمل `purpose`.
كان الدلو الواحد يخلط بيعًا بإيجار فيُخرج وسيطًا لا معنى له — علّة حقيقية كانت في
شارة سعر المتر بصفحة العقارات ولوحة الأسعار بالداشبورد. `comparePrice` تمرّر غرض العقار
نفسه تلقائيًا فلم تتغيّر استدعاءاتها. **الأثر الظاهر:** عيّنات أصغر وصفوف أقل في لوحة
الداشبورد (مع عمود «الغرض» الجديد) — وهذا أصدق من صفوف كثيرة خاطئة.

### الملفات المعدَّلة وسببها

| الملف | التعديل | السبب |
|---|---|---|
| `js/util/price-stats.js` | `quantile` · `purposeKey` · `priceSamples` · `estimatePrice` · فصل الغرض في `buildPriceIndex` و`comparePrice` | قلب المرحلة |
| `js/pages/pricing.js` | **جديد** — الاستمارة، بطاقة التقدير، جدول المقارَنات، الملء من عقار عندك، نسخ الملخّص | الصفحة |
| `js/app.js` · `index.html` · `js/util/sidebar.js` | تسجيل المسار والرابط في الفهرس | صفحة جديدة تُسجَّل في ثلاثة مواضع (القسم ١٥) |
| `js/pages/dashboard.js` | عمود «الغرض» في لوحة الأسعار + تنبيه أن البيع مفصول عن الإيجار | أثر فصل الغرض |
| `css/components.css` | `.estimate-*` · `.warn-text` | بطاقة التقدير |
| `tests/pricing-unit.mjs` · `tests/pricing.mjs` · `tests/run.mjs` · `tests/app-pages.mjs` | حزمتان جديدتان وتسجيلهما، وإضافة المسار لقائمة مسارات الفحص | الاختبار |
| `README.md` | «التسعير التقديري مؤجَّل» صار خاطئًا في ثلاثة مواضع | توثيق |

### لم يُمسّ

`schema.js` · `repository.js` · `adapters/indexeddb.js` (لا رفع إصدار) · `settings.js` ·
`backup.js` · `matching.js` · `vault.js` · كل دوال Netlify · `offers/` · `sw.js` ·
بقية الصفحات.

### اختُبر فعليًا

**٢٥٠ اختبارًا ناجحًا، صفر فشل** (`node tests/run.mjs`) — منها ٢٦ في `pricing-unit.mjs`
(العيّنة تستبعد غير المعتمد والمؤرشف · الصفقة بسعرها النهائي · فصل البيع عن الإيجار
وأثره على الوسيط · صحة الحساب عدديًا · التراجع إلى المدينة وثقته الضعيفة · الصمت عند
العيّنة الرقيقة وعند غياب المساحة · الشرائح المئوية · استبعاد العقار من عيّنته ومعه
صفقته · فصل الغرض في المؤشر و`comparePrice`)، و١٦ في `pricing.mjs` داخل متصفح حقيقي
(الرابط في القائمة · لا رقم قبل المساحة · العقار بلا سعر يتصدّر قائمة الملء · التقدير
داخل نطاقه المعروض · الصمت عند غياب عيّنة الإيجار · التصريح بالتراجع · **السعر المطلوب
المبالَغ يُوصف بأنه أعلى من التقدير** · **العقار لا يقارن بنفسه** · بلا أخطاء جافاسكربت).
وفُحصت الصفحة بصريًا على الحاسوب والجوال (٣٩٠ بكسل: **صفر تجاوز أفقي**) — وبالفحص البصري
اكتُشفت علّة مقارنة العقار بنفسه فأُصلحت.

---

## ٢٣. المرحلة ١٥ — القائمة الجانبية: الجهة، والأسماء، والطيّ

**لا مخطط ولا إصدار قاعدة.** مفتاح واحد أُضيف داخل إعدادات `ui` الموجودة أصلًا:
`ui.sidebarExpanded` (منطقي، افتراضه مفتوح على الحاسوب).

### ثلاث علل حقيقية، لا تفضيلًا في الذوق

| العلّة | السبب في الكود | الإصلاح |
|---|---|---|
| **القائمة على يسار الشاشة** في صفحة اتجاهها من اليمين | `.sidebar { inset-inline-end: 0 }` — و`inline-end` في RTL هو **اليسار** | `inset-inline-start: 0`، ومعه `.app-main { margin-inline-start }` |
| **الأسماء تختفي بعد كل تنقّل** فلا تُرى القائمة إلا أيقونات | `navigate()` كانت تنفّذ `sidebarToggle.checked = false` بعد **كل** صفحة — والقصد طيّ درج الجوال، فطوت الحاسوب معه | الطيّ صار مشروطًا بعرض الشاشة (`isNarrow()`)، وتفضيل الحاسوب يُحفظ في `ui.sidebarExpanded` |
| **زر ☰ مقصوص** في حال الطيّ فلا سبيل إلى الفتح | `.sidebar-head` تضع الشعار والزر معًا في رفٍّ عرضه ٦٠ بكسل، و`overflow-x: hidden` تقصّ الزائد | الشعار يختفي في حال الطيّ فيبقى الزر وحده في المنتصف، ويعودان معًا عند الفتح |

وعلّتان في التمرير الأفقي على الجوال (٣٩٠ بكسل)، ظهرتا أثناء القياس:

- **درج الجوال** كان يُخفى بـ`transform: translateX(100%)` خارج الشاشة، والمزاح خارجها يُطيل
  عرض الصفحة فيظهر تمرير أفقي ببضعة بكسلات. صار يُطوى بعرض **صفر** مع `overflow-x: hidden`
  فيُقصّ تمامًا (والحركة صارت اتساعًا كما على الحاسوب).
- **`.today-grid`** كانت `minmax(380px, 1fr)` والعرض المتاح ٣٥٨ بكسل، فيتجاوز العمودُ الصفحةَ.
  صارت `minmax(min(380px, 100%), 1fr)`.

### السلوك المتّفق عليه

- **الأيقونات لا تختفي أبدًا** على الحاسوب: أضيق حالٍ رفٌّ بعرض ٦٠ بكسل.
- زر ☰ في أعلى القائمة يبدّل: أيقونات وأسماء ← أيقونات فقط ← وهكذا.
- الاختيار يُحفظ ويُستعاد قبل أول تنقّل (كي لا تُطوى القائمة ثم تُفتح أمام عينك).
- **الجوال مستثنى من الحفظ**: الدرج هناك يغطي الصفحة، فيُطوى دائمًا عند الفتح وبعد اختيار صفحة.

### الملفات المعدَّلة وسببها

| الملف | التعديل | السبب |
|---|---|---|
| `css/base.css` | جهة القائمة · هامش المحتوى · رأس القائمة في حال الطيّ · عرض الأسماء ١٣ بكسل · طيّ درج الجوال بالعرض | العلل الأربع أعلاه |
| `css/components.css` | `.today-grid` بـ`min(380px, 100%)` | التمرير الأفقي على الجوال |
| `js/app.js` | `isNarrow` · `setSidebarExpanded` · `initSidebarState` · الطيّ بعد التنقّل صار للجوال وحده | حفظ الاختيار |
| `tests/sidebar-order.mjs` | ١٦ فحصًا جديدًا | الاختبار |
| `README.md` | وصف القائمة صار خاطئًا | توثيق |

### لم يُمسّ

`index.html` (البنية كانت صحيحة: أيقونة واسم داخل كل رابط) · `util/sidebar.js` (الترتيب) ·
`schema.js` · `repository.js` · كل الصفحات · كل دوال Netlify.

### اختُبر فعليًا

**٢٦٦ اختبارًا ناجحًا، صفر فشل** (`node tests/run.mjs`) — منها ١٦ جديدًا في
`tests/sidebar-order.mjs` تقيس من المتصفح نفسه: موضع القائمة من حافة الشاشة اليمنى ·
ظهور الاسم والأيقونة معًا · **أن الاسم لا يتجاوز حدود رابطه** · بقاء القائمة مفتوحة بعد
التنقّل · أن الطيّ يُخفي الأسماء **ويُبقي الأيقونات** (بقياس العرض) · بقاء زر ☰ داخل الرفّ ·
حفظ الاختيار بعد إعادة التحميل · وعلى ٣٩٠ بكسل: الدرج مطويّ عند الفتح، ويفتح من اليمين
**داخل الشاشة كاملًا**، ويُطوى بعد اختيار صفحة، و**صفر تمرير أفقي في الحالات الثلاث**.
وفُحص بصريًا بثلاث لقطات (مفتوحة، مطوية، درج الجوال).

---

## ٢٤. المرحلة ١٦ — علّة عامل الخدمة: التحديثات لا تصل

**لا مخطط، ولا إعدادات، ولا واجهة.** ملفان: `sw.js` و`js/app.js`.

### العلّة

`sw.js` كان يخدم ملفات التطبيق (JS/CSS) **من المخزن أولًا**:

```js
const hit = await cache.match(request);
if (hit) return hit;          // ← ولا شيء يُبطل هذا المخزن أبدًا
```

واسم المخزن ثابت (`kassab-v1`)، و`activate` لا يمسح إلا المخازن **مختلفة الاسم**. فالنتيجة:
أول زيارة تُخزّن `app.js` و`base.css` و`components.css`، ثم **لا يصل أي تحديث فيها إلى
المتصفح أبدًا** مهما نُشر. صفحة HTML كانت تصل حديثة (الشبكة أولًا) — فتبدو النسخة محدَّثة
وهي تُحمِّل ملفات قديمة، وهذا أسوأ من قِدَمٍ ظاهر: خلطُ هيكلٍ جديد بتنسيق قديم.

ظهرت العلّة بعد نشر المرحلة ١٥: فُتح الرابط فلم يتغيّر شيء.

### الإصلاح

**الشبكة أولًا لكل شيء، والمخزن احتياطٌ للعمل دون اتصال** — لا العكس. والسرعة لم تضِع:
Netlify يردّ على الملف غير المتغيّر بـ304 من ذاكرة المتصفح. ورُفع الاسم إلى `kassab-v2`
فيُمسح المخزن المسموم عند أول تفعيل.

وفي `app.js`: حين يستلم عامل خدمة جديد صفحةً **مفتوحة**، تُعاد الصفحة مرة واحدة — وإلا
خلطت ملفات قديمة بجديدة. وبشرطين يمنعان حلقة لا تنتهي: لا إعادة تحميل عند أول تسجيل
(ليست تحديثًا)، ولا أكثر من مرة في التبويب الواحد (حارس في `sessionStorage`، ومنعُه في
التصفح الخاص يعني ترك إعادة التحميل لا تكرارها).

### ما لم يتغيّر

قاعدة الخصوصية كما هي: لا يُخزَّن شيء من `/api/` ولا `/offers` ولا `/__login`،
فلا تُسلَّم صفحة مخزَّنة لزائر غير مسجَّل، ولا تُعرض بيانات نشر قديمة.

### الملفات المعدَّلة وسببها

| الملف | التعديل | السبب |
|---|---|---|
| `sw.js` | الشبكة أولًا لملفات التطبيق · `kassab-v2` | العلّة نفسها |
| `js/app.js` | إعادة تحميل واحدة عند استلام عامل خدمة جديد | صفحة مفتوحة أثناء التحديث |
| `tests/offer-pwa-push.mjs` | ٤ فحوص جديدة | الاختبار |
| `README.md` | سطر «وصول التحديثات» | توثيق |

### اختُبر فعليًا

**٢٧٠ اختبارًا ناجحًا، صفر فشل** (`node tests/run.mjs`). والفحص الجديد يقيس العلّة نفسها لا
وصفها: ملف يُكتب على القرص، يُطلب من الصفحة فيُخزَّن، **ثم يتغيّر محتواه على الخادم**،
فيُطلب ثانيةً — ويجب أن تصل النسخة الجديدة. ثم يُقطع الاتصال فيجب أن يُخدَم من المخزن.
**وتُحقّق من أن الفحص يكشف العلّة فعلًا:** أُعيدت قاعدة «المخزن أولًا» مؤقتًا فسقطت ثلاثة
فحوص (`17 PASS 3 FAIL`)، ثم أُرجع الإصلاح فنجحت — فليس فحصًا يمرّ في الحالين.

---

## ٢٥. المرحلة ١٧ — المال والقمع والصحة (البنود ١ و٢ و٣ و٥ و٦)

**لا مخزن جديد ولا رفع لإصدار القاعدة (يبقى ٤).** ثلاثة حقول تبدأ فارغة، ومفتاح إعدادات واحد.

### تغيير المخطط

| الحقل | الكيان | لماذا |
|---|---|---|
| `paidAmount` · `paidAt` | `invoices` | **المقبوض رقمٌ لا راية:** الدفعة الجزئية واقعٌ يوميّ، والراية تكذب فيها |
| `dueAt` | `invoices` | التقادم يُحسب على الاستحقاق لا على الإصدار — الفاتورة المؤجَّلة باتفاق ليست متأخرة |
| `commissionPaidAt` | `deals` | الصفقة أُبرمت ولم تُقبض عمولتها حالةٌ شائعة لم يكن لها تمثيل |
| `followUp.afterShowingDays` | إعدادات | متابعة تلقائية بعد المعاينة. **صفر = معطَّل** |
| `savedSearches` | إعدادات | `{ [pageKey]: [{ id, name, state }] }` — مفتاحٌ لكل صفحة |

وقاعدتا تحقّق جديدتان: **المقبوض أكبر من الإجمالي مرفوض** (خطأ إدخال يجعل المستحق سالبًا
فيفسد التقادم)، و**عرض السعر لا يُقبض** (ليس مستحقًا حتى يصير فاتورة).

### ١) التحصيل — `js/util/receivables.js`

`invoiceCollection` → `unpaid | partial | paid | quote` · `invoiceRemaining` · `receivables()`
بشرائح تقادم (لم يستحق · ≤٣٠ · ٣١–٦٠ · ٦١–٩٠ · >٩٠).

- **عرض السعر ليس مستحقًا** — إدخاله يعطيك رقمًا يسرّك ولا وجود له.
- **الصفقة بلا رقم عمولة ليست مستحقًا** — لا يُخترع لها رقم.
- **مستند بلا بنود يُعدّ مقبوضًا** فلا يُزعجك بصفرٍ معلّق.
- نصف ريال تسامحُ تقريب لا متبقٍّ.

ويظهر في ثلاثة مواضع: شريط أعلى صفحة الفواتير، وعمود «التحصيل» مع زر **💰 قبض** (وفيه
«قُبض كاملًا» بمبلغه جاهزًا لأنها الحالة الغالبة)، ولوحة «مستحقات لم تُقبض» في «يومي»
مرتَّبة بالأقدم أولًا — وهو ترتيب من تتصل به أولًا. **وقبض العمولة من «يومي» مباشرة**،
إذ لا صفحة للصفقات أصلًا.

### ٢) قمع التحويل — `js/util/funnel.js`

طلبات ← تصرّفت في مرشّح لها ← عُرض على صاحبها ← أبدى اهتمامًا ← أُبرمت.

**الوحدة «طلب» في كل المراحل، وهذا شرط الصدق:** أول صياغة عدّت المرحلتين الأوليين
بالطلبات والأخيرة بالمرشّحين فأخرجت «١٥٠٪» (طلبٌ واحد عُرض عليه ثلاثة عقارات) — رقمٌ لا
معنى له. والآن كل مرحلة **مجموعة جزئية** مما قبلها بحكم البناء فلا تصعد أبدًا، والاختبار
يتحقق من ذلك صراحةً. والموقوف مستثنى، **والمُنجز محسوب** لأنه موضع الفوز نفسه.
وأسوأ خطوة تُختار بأكبر **عدد** ساقطين لا بأدنى نسبة، ويُذكر معها علاجها.

### ٣) متابعة تلقائية بعد المعاينة

عند تعليم المطابقة «عُرضت» تُنشأ مهمة في أول قوائمك (أو قائمة «متابعات» تُنشأ عند الحاجة)
بموعد بعد المدة المضبوطة، الساعة العاشرة صباحًا — موعدٌ يُتصل فيه لا لحظةَ إنشاء المهمة.
ولا تتكرر لأن الشرط تغيّرُ الحالة إلى «عُرضت». **وفشل الإنشاء لا يُسقط تغيير الحالة:**
تسجيل ما فعلته أهمّ من تذكير كمالي.

### ٥) صحة البيانات — `js/util/health.js` + صفحة

تسعة فحوص، كلٌّ منها يقول **ماذا يتعطّل** لا «ناقص» فقط: عقار لا يدخل المطابقة إطلاقًا ·
عرض خارجي بانتظار الإكمال · بلا سعر · بلا مساحة · بلا موقع · عميل بلا جوال · **جوالات
مكرّرة** (بالتطبيع، فتُكتشف رغم اختلاف صيغة الأرقام) · طلب نائم منذ ٩٠ يومًا · صفقة بلا
عمولة. وغير المعتمد لا يُحاسَب على نقصه. **والصفحة تدلّ ولا تُصلح:** لا حذف ولا تعديل
تلقائي — في بياناتٍ لا نسخة منها إلا عندك، التنظيف الآلي مخاطرة لا داعي لها.

### ٦) بحوث محفوظة

على صفحة العقارات: تحفظ تركيبة الفرز والبحث باسم وتستدعيها بنقرة. الاسم نفسه يستبدل
السابق، والمجموعات المجهولة (فرزٌ حُذف لاحقًا) تُتجاهل بلا خطأ. والبنية عامة بمفتاح صفحة،
فإضافة صفحة أخرى لاحقًا لا تمسّ الدوال.

### علل أُصلحت أثناء القياس

| العلّة | الإصلاح |
|---|---|
| **تمرير أفقي ٥٦٦ بكسل في الداشبورد على ٣٩٠ بكسل** — أعرضُ محتوًى داخل لوحة يفرض عرض عمود الشبكة كلّه (٩٤٠ بكسل داخل شاشة ٣٩٠) | `minmax(min(300px, 100%), 1fr)` + `.dashboard-grid > * { min-width: 0 }` |
| «٦ طلب» في نص القمع | `countWord` في `util/format.js` — مفرد ومثنّى وجمع قلّة وتمييز منصوب |
| اختبار ترتيب القائمة الجانبية كان يثبّت أسماء صفحات بعينها فكسرته «صحة البيانات» | صار يتحقق بالإزاحة لا بالأسماء |

### الملفات المعدَّلة وسببها

| الملف | التعديل | السبب |
|---|---|---|
| `schema.js` | حقول التحصيل · `invoicePaid`/`invoiceRemaining`/`invoiceCollection` | البند ١ |
| `repository.js` | تطبيع المقبوض وتحقّقه | البند ١ |
| `data/settings.js` | `afterShowingDays` · دوال البحوث المحفوظة | البندان ٣ و٦ |
| `util/receivables.js` · `util/funnel.js` · `util/health.js` | **جديدة** | البنود ١ و٢ و٥ |
| `util/format.js` | `countWord` | صحة العربية |
| `pages/invoices.js` | عمود التحصيل وفلترته وشريطه ونافذة القبض وحقل الاستحقاق | البند ١ |
| `pages/today.js` | لوحة المستحقات وقبض العمولة منها | البند ١ |
| `pages/matches.js` | إنشاء مهمة المتابعة | البند ٣ |
| `pages/dashboard.js` | لوحة القمع (ومعها قراءة الطلبات) | البند ٢ |
| `pages/health.js` | **جديدة** | البند ٥ |
| `pages/properties.js` | شريط البحوث المحفوظة | البند ٦ |
| `pages/settings.js` | حقل المتابعة التلقائية | البند ٣ |
| `app.js` · `index.html` · `util/sidebar.js` | تسجيل صفحة صحة البيانات | البند ٥ |
| `css/components.css` | أصناف الصحة والقمع والبحوث · إصلاح شبكة الداشبورد | أعلاه |

### لم يُمسّ

`adapters/indexeddb.js` (لا رفع إصدار) · `backup.js` · `matching.js` · `vault.js` ·
`price-stats.js` · `opportunity.js` · كل دوال Netlify · `offers/` · `sw.js`.

### اختُبر فعليًا

**٣٤١ اختبارًا ناجحًا، صفر فشل** (`node tests/run.mjs`) — منها ٣٩ في `money-unit.mjs`
(حالات التحصيل والتقادم وشرائحه · استثناء عرض السعر والمقبوض والصفقة بلا عمولة ·
**أن القمع لا يصعد أبدًا** وأن الطلب لا يُعدّ مرتين بعقارين · تسعة فحوص الصحة ومنها
كشف التكرار رغم اختلاف صيغة الأرقام)، و٣١ في `money-and-health.mjs` داخل متصفح حقيقي
(القبض الجزئي ثم الكامل من الواجهة · **رفض المقبوض الزائد وقبض عرض السعر** · إلغاء القبض
يمسح تاريخه · إنشاء مهمة المتابعة بموعدها وربطها بالعميل · صفحة الصحة وروابطها ·
أرقام القمع من الـDOM لا تصعد · حفظ بحثٍ واستدعاؤه يعيد العدد نفسه ويبقى بعد إعادة التحميل).
وفُحص بصريًا بأربع لقطات على الحاسوب، وقُيس **صفر تمرير أفقي** على ٣٩٠ بكسل في الصحة
والداشبورد (وبه اكتُشف تمرير الداشبورد القديم فأُصلح).

---

## ٢٦. المرحلة ١٨ — الاستيراد، وجولة اليوم، ورمز QR (البنود ٤ و٧ و٨)

**لا مخطط، ولا إعدادات، ولا إصدار قاعدة.** ثلاث أدوات تقف كلها على بيانات موجودة.

### ٤) استيراد من إكسل (CSV)

`parseCsv` مكتوبة يدويًا بلا مكتبة لأن المطلوب محدود ومعروف، وتتولّى ما يكسر القارئ الساذج:
**شارة BOM** التي يضعها إكسل، و**الفاصلة المنقوطة** فاصلًا (يحفظ بها إكسل العربي في كثير من
الأجهزة — تُكتشف تلقائيًا بعدّ الفواصل خارج الاقتباس في أول سطر)، و**الفاصلة والسطر داخل
خلية مقتبسة**، و`""` اقتباسًا هاربًا، وأسطر `\r\n`.

والتدفّق **ثلاث خطوات مقصودة**: ربط الأعمدة ← **معاينة** ← استيراد. لا كتابة قبل المعاينة،
لأن الاستيراد الأعمى في بياناتٍ لا نسخة منها إلا عندك يعني حذفًا يدويًا لعشرات السجلات
عند أول خطأ. والمعاينة تقول: كم سيُضاف، وكم يُتخطّى، **ولماذا**.

| القاعدة | لماذا |
|---|---|
| الربط يُقترح بمطابقة العناوين (عربيّها وإنجليزيّها) **ويبقى قابلًا للتغيير** | العنوان الحرّ في جداول الناس لا يُطابق دائمًا |
| الأرقام العربية تُطبَّع، وفواصل الآلاف تُزال | «١٬٢٥٠٬٠٠٠» و«1,250,000» رقمٌ واحد |
| أسماء الأنواع والأغراض تُترجم إلى مفاتيحها، و**المجهول يُترك فارغًا لا يُخترع** | «قصر فخم» ليس نوعًا عندك، واختراع مفتاح له يفسد المطابقة صامتًا |
| تكرار العميل: بالجوال، **وبالاسم إن لم يكن له جوال** | بغير الثانية كانت إعادة استيراد الملف نفسه تكرّر كل عميل بلا جوال (اكتشفها الاختبار) |
| تكرار العقار: المدينة والحي والنوع والمساحة والسعر معًا | لا مفتاح قاطعًا للعقار كالجوال للعميل |
| المستورد من العقارات يدخل **معتمدًا** (`captureStatus: 'approved'`) | ليس التقاطًا ميدانيًا ينتظر مراجعة |

### ٧) جولة اليوم — `js/util/route.js`

اختر محطاتك من **الظاهر على الخريطة بعد فرزك** (الفرز نفسه أداة اختيارك)، فتُرتَّب
بالأقرب فالأقرب وتُفتح في خرائط جوجل بمسار واحد.

- **ترتيبٌ جشِع لا حلٌّ أمثل** لمسألة البائع المتجول — ولا يدّعيه؛ تقريبٌ يكفي لثماني محطات
  في مدينة وأفضل كثيرًا من ترتيب عشوائي.
- **المسافة مسافة هواء لا طريق**، فهي أقصر من الواقع دائمًا — ومكتوبٌ ذلك في الواجهة.
- **حدّ الرابط عشر محطات** (بداية ونهاية وثماني بينهما)؛ وما زاد يسقط **ويُصرَّح بعدده**.
- البداية موقعك الحالي إن سمحت به، وإلا فأوّل محطة. ولا خدمة توجيه ولا مفتاح ولا تكلفة.

### ٨) رمز QR — `vendor/qrcode/` + `js/util/qr.js`

مكتبة `qrcode-generator` (MIT، ~٥٢ كيلوبايت) **محلّية في المستودع كما فُعل مع Leaflet**:
لا CDN ولا مفتاح ولا شبكة، وتُحمَّل **عند أول استعمال فقط** فلا تُثقل فتح التطبيق.
والخرج **SVG لا صورة**: يُطبع بأي حجم بلا تحبّب. وتصحيح الخطأ `M` يحتمل اتساخ الورقة
وانعكاس الضوء عند المسح من لوحة. والرابط مكتوب تحت الرمز نصًّا لمن لا كاميرا عنده.

الأزرار في صفحة «الصفحة العامة للعروض»: لكل عرض منشور، ولكل قائمة عميل — ومعها ورقة طباعة
فيها الرمز كبيرًا وتحته العنوان والرابط، تُقصّ وتُلصق على لوحة العقار.

### علّة أُصلحت أثناء الفحص البصري

**كلمة `null` كانت تُطبع نصًّا** أسفل معاينة الاستيراد وفي ملخّص الجولة: الشرط
`cond ? el(...) : null` داخل `el()` تُسقطه `appendChildren`، أما `node.append()` الأصلية
فتحوّله إلى نصّ `"null"`. استُبدلت بـ`appendChildren` في الموضعين.

### الملفات المعدَّلة وسببها

| الملف | التعديل | السبب |
|---|---|---|
| `data/exchange.js` | `parseCsv` · `CSV_IMPORTS` · `suggestMapping` · `rowToRecord` · `previewImport` · `runImport` | البند ٤ |
| `pages/settings.js` | لوحة الاستيراد ونافذة الربط والمعاينة | البند ٤ |
| `util/route.js` · `pages/map.js` | **جديد** + زر «خطّط جولة اليوم» | البند ٧ |
| `util/qr.js` · `vendor/qrcode/` | **جديد** (MIT، مع نصّ الرخصة) | البند ٨ |
| `pages/publish.js` | زر الرمز للعرض الواحد ولقائمة العميل + ورقة الطباعة | البند ٨ |
| `css/components.css` | `.route-list` · `.qr-block` | أعلاه |
| `tests/server.mjs` | نوع `.mjs` في جدول الأنواع | المكتبة الجديدة `.mjs` |

### لم يُمسّ

`schema.js` · `repository.js` · `adapters/indexeddb.js` · `settings.js` · `backup.js` ·
`matching.js` · كل دوال Netlify · `offers/` · `sw.js`.

### اختُبر فعليًا

**٣٩١ اختبارًا ناجحًا، صفر فشل** (`node tests/run.mjs`) — منها ٣٢ في `route-qr-csv-unit.mjs`
(BOM · الفاصلة المنقوطة · الفاصلة والسطر داخل اقتباس · الاقتباس الهارب · الملف الفارغ ·
العمود بلا عنوان · الأرقام العربية وفواصل الآلاف · ترجمة النوع والأغراض ورفض اختراع
المجهول · قواعد التكرار الثلاث · ترتيب الجولة وإسقاط الإحداثي الناقص · حدّ الرابط
والتصريح بالساقط)، و١٨ في `import-route-qr.mjs` داخل متصفح حقيقي (**لا كتابة قبل الضغط على
«استيراد»** مقيسةً بعدّ السجلات قبل وبعد · إعادة استيراد الملف نفسه لا تُضيف شيئًا ·
الجولة ترتّب وتفعّل الزر · الرمز SVG بوحدات فعلية (٤٢٨ وحدة) والمكتبة تُخدَم من المستودع
بنوع جافاسكربت لا من CDN). وفُحص بصريًا بثلاث لقطات، وبها اكتُشفت علّة `null`.

---

## ٢٧. المرحلة ١٩ — الفاتورة الضريبية، وتسجيل التواصل، وتاريخ السعر، وواقعية الميزانية

**لا مخزن جديد ولا رفع لإصدار القاعدة (يبقى ٤).** حقلان على الفاتورة، وحقل على العقار،
وحقلان في إعدادات الشركة — كلها تبدأ فارغة.

### ١) ضريبة القيمة المضافة ورمز الفاتورة المبسّطة

| الحقل | أين | لماذا |
|---|---|---|
| `company.vatNumber` · `company.vatRate` | إعدادات | فارغ = غير مسجَّل، **فلا ضريبة ولا رمز ولا ادّعاء** |
| `invoices.vatRate` | المستند | **تُنسخ من إعداداتك عند الإنشاء وتبقى محفوظة**، فلا تتغيّر أرقام مستند قديم إن غيّرت النسبة |

ودوال جديدة: `invoiceVat` · `invoiceGrandTotal`. و**`invoiceTotal` بقيت تعني البنود قبل
الضريبة**، أما كل موضع يعرض «الإجمالي» أو يحصّله فحُوّل إلى `invoiceGrandTotal`: القائمة،
والطباعة، ونافذة القبض، والمستحقات، والداشبورد، والبحث العام، وتصدير CSV، **وحدّ التحقق في
المخزن** (فدفع البنود دون الضريبة صار «مقبوضًا جزئيًا» لا «مقبوضًا»، وهو الصواب).

**`js/util/zatca.js`** يبني الرمز بترميز TLV ثم Base64 بالحقول الخمسة (اسم البائع · الرقم
الضريبي · الطابع الزمني · الإجمالي شاملًا الضريبة · مبلغ الضريبة). ودقائق تُخطئ فيها
التنفيذات: **الطول بالبايتات لا بالمحارف** (الحرف العربي بايتان في UTF-8 — والاختبار يتحقق
من ذلك صراحةً)، والمبالغ بمنزلتين عشريتين بأرقام لاتينية، والقيمة الأطول من ٢٥٥ بايت تُقصّ.

**والحدّ مكتوب في الملف نفسه:** هذا شكل الفاتورة المبسّطة ورمزها. أما «المرحلة الثانية»
(الربط والتكامل والختم التشفيري) فتحتاج حلًّا معتمدًا من الهيئة وشهادة رقمية، ولا يدّعيها
تطبيق يعمل في متصفحك. ولذلك لا يُطبع عنوان «فاتورة ضريبية مبسّطة» ولا الرمز إلا باكتمال
الشرط: نوعها فاتورة، وفيها ضريبة فعلية، ولك اسم ورقم ضريبي.

### ٢) تسجيل التواصل من «يومي»

الاتصال من «يومي» كان **لا يُسجَّل**، فيبقى العميل في «لم يُتواصل معهم» وأنت كلّمته للتوّ —
وثلاث لوحات تبني على `lastContactAt` فتكذب كلها. الآن تُفتح نافذة تسجيل **بعد** فتح
المهاتفة بمهلة قصيرة (فلا تعترض طريق المكالمة)، وفيها ملاحظة وموعد متابعة قادم.
و**«لم أتواصل» خيار صريح** لأن الضغط على الزر ليس دليلًا على أن أحدًا ردّ.

### ٣) تاريخ السعر — `properties.priceHistory`

**يُسجَّل في طبقة البيانات لا في الصفحة**، فيشمل كل مسار تعديل (النموذج، الاعتماد،
الاستيراد) ولا يعتمد على تذكّر كل صفحة. والسجل **نقاطُ سعرٍ على خطّ زمن لا قائمةَ تغييرات**:
أول نقطة هي السعر **قبل** أول تعديل — وإلا لم يُعرف من أين هبط (وهذه علّة كشفها الاختبار:
كانت أول نسخة تسجّل الجديد وحده فتُخرج «خُفّض ٠٪»). ولا يُسجَّل شيء إن لم يتغيّر السعر فعلًا.

و`priceTrend` تُرجع: عدد التغييرات، ونسبة الخفض من الأصل، و**كم يومًا مضى على السعر الحالي** —
وهو ورقة تفاوض بذاته: سعرٌ لم يتحرك تسعة أشهر يقول إن السوق رفضه.

### ٤) فحص واقعية الميزانية — `budgetRealityGap`

عند تسجيل الطلب تُقارن ميزانيته بالمتوقَّع في حيّه (بنفس محرك التقدير). القيمة في
**التوقيت**: أن تعرف الفجوة لحظة التسجيل لا بعد شهرين. وشروطه ضيّقة عمدًا: **حيٌّ واحد
محدد** (الطلب على خمسة أحياء لا يُحاسَب على أغلاها)، وعيّنة **على مستوى الحي** لا المدينة،
وفجوة ١٥٪ فأكثر (وما دونها يبتلعه التفاوض). ولا يمنع الحفظ ولا يحكم — عميلك قد يجد فرصة.

### الملفات المعدَّلة وسببها

| الملف | التعديل | السبب |
|---|---|---|
| `schema.js` | `vatRate` · `priceHistory` · `invoiceVat` · `invoiceGrandTotal` · المتبقّي والحالة على الإجمالي | ١ و٣ |
| `repository.js` | تسجيل نقاط السعر في `update` · تطبيع السجل · حدّ القبض شاملًا الضريبة | ١ و٣ |
| `data/settings.js` · `pages/settings.js` | `vatNumber`/`vatRate` وحقولهما | ١ |
| `util/zatca.js` | **جديد** | ١ |
| `pages/invoices.js` | حقل النسبة · الإجمالي شاملًا · سطور الضريبة والرمز في الطباعة | ١ |
| `pages/today.js` | نافذة تسجيل التواصل | ٢ |
| `util/price-stats.js` | `priceTrend` · `budgetRealityGap` | ٣ و٤ |
| `pages/properties.js` | شارة حركة السعر | ٣ |
| `pages/requests.js` | تنبيه الميزانية | ٤ |
| `util/receivables.js` · `pages/dashboard.js` · `util/global-search.js` · `data/exchange.js` | الإجمالي شاملًا الضريبة | ١ |

### اختُبر فعليًا

**٤٣٨ اختبارًا ناجحًا، صفر فشل** — منها ٢٨ في `vat-unit.mjs` (حساب الضريبة والمتبقّي
والحالة · فكّ ترميز TLV والتحقق من الوسوم الخمسة وطول البايتات وتقريب الهللة · نقاط السعر
ودلالتها · شروط تنبيه الميزانية الخمسة)، و١٨ في `vat-and-contacts.mjs` داخل متصفح حقيقي
(الضريبة في القائمة والطباعة · **الرمز مرسوم بوحدات فعلية** · **بلا رقم ضريبي لا رمز ولا
عنوان ضريبي** · نافذة التسجيل تظهر وتحفظ النوع والملاحظة وتحدّث «آخر تواصل» · **«لم أتواصل»
لا يسجّل شيئًا** · زرع نقطة السعر السابقة عند أول تغيير).

---

## ٢٨. المرحلة ٢٠ — الأداء المقيس، وملف العميل، والبحث السريع، وحاسبة القسط

**لا مخطط ولا إعدادات ولا إصدار قاعدة.** صفحة جديدة واحدة، وتحسين محرك بنتيجة مطابقة.

### ١) الأداء: قياس قبل الإصلاح، ثم قياس بعده

بُذرت بيانات حقيقية في متصفح (١٥٠٠ عقار · ٣٠٠ طلب نشط) وقِيست الأزمنة. **وأول فرضية
كانت خاطئة:** ظننت العلّة في المرور على كل عقار لكل طلب، فبنيتُ فهرس القواطع — **فلم
يتغيّر شيء** (٦٩٣ مقابل ٦٨٠ ملّي ثانية). فعُزل القياس:

| ما قِيس | الزمن |
|---|---|
| القواطع وحدها على ١١٥ ألف مقابلة | **٩ ملّي** |
| التسجيل الكامل بلا جمع صفوف ولا فرز | **٥٨٩ ملّي** |
| المرور كاملًا وجمع ٤٥٬٦٨٩ صفًّا | ٧١٦ ملّي |
| **الاكتفاء بأول مرشّح لكل طلب** | **٨ ملّي** |

فالعلّة في **التسجيل نفسه** لا في القواطع. وسببان فيه: بناء `Set` للأحياء وحساب مرونتَي
السعر والمساحة **داخل الحلقة** — وكلها تخصّ الطلب لا المعروض. فرُفعت إلى `preparePer`
تُحسب مرة لكل طلب.

والأهم: سؤال «الفرص» ليس «كم مرشحًا» بل **«أله مرشح أصلًا»** — فأُضيفت `hasCandidate`
بخروجٍ عند أول مرشح.

| النتيجة | قبل | بعد |
|---|---|---|
| مؤشر «الفرص» | ٦٧٧ ملّي | **٩ ملّي** |
| كل المرشحين | ٧١٦ ملّي | ٥٠٦ ملّي |

والفهرس بقي (يُبنى مع السياق) لأنه صحيح ومجاني، وإن لم يكن هو الفارق. **والنتيجة مطابقة
حرفًا بحرف** — يتحقق منها اختبارٌ يقارن المخرجات بالفهرس وبدونه، وقياسٌ يقارن عدد الصفوف.
والسياق المبنيّ يدويًا (في الاختبارات) يعمل كما كان: بلا فهرس يعود المرور كاملًا.

### ٢) ملف العميل — `js/pages/client.js` (`#/client/<id>`)

كان التطبيق لا يعرف ارتباطات العميل إلا **لحظة حذفه**. والملف الآن يجمع في شاشة: مرحلته
ومنذ متى لم تكلّمه · طلباته **وعدد مرشحي كل طلب** · سجل تواصله · ما عُرض عليه وبم ردّ ·
صفقاته وعمولتها المقبوضة من غيرها · فواتيره وحالة تحصيلها · **المستحق عليه** · عقاراته
إن كان مالكًا. **قراءة محضة** — لا ينشئ ولا يعدّل، ويربط بالصفحات الأصلية.

### ٣) البحث السريع — بلا تسجيل طلب

يتصل عميل: «عندك في النرجس تحت مليونين؟» — وكان الجواب يقتضي تسجيل طلب كامل أولًا.
النافذة تبني طلبًا **مؤقتًا في الذاكرة** وتمرّره على المحرك نفسه (فلا حساب موازٍ)، **ولا
تكتب شيئًا** — يتحقق الاختبار من أن عدد الطلبات لم يتغيّر. و«احفظه طلبًا» ينقل المسودّة
إلى الاستمارة عبر `sessionStorage` وتُستهلك مرة واحدة ثم يُنظَّف العنوان.

### ٤) حاسبة التمويل — `js/util/finance.js`

`monthlyInstallment` بمعادلة القسط الثابت (ومعها حالة الهامش صفر التي تقسم على صفر في
المعادلة العامة)، و`affordablePrice` تعكسها من الدخل. تظهر تحت التقدير في صفحة «تقدير
السعر». **واسترشادية لا عرض تمويل**، ومكتوب تحتها ما لا تشمله: الرسوم والتأمين والدعم.

### الملفات المعدَّلة وسببها

| الملف | التعديل | السبب |
|---|---|---|
| `data/matching.js` | `buildMatchIndex` · `preparePer` · `hasCandidate` · تمرير التهيئة | ١ |
| `util/opportunity.js` | «أله مرشح» بدل عدّ المرشحين | ١ |
| `pages/client.js` | **جديدة** | ٢ |
| `app.js` · `pages/clients.js` · `pages/today.js` | تسجيل المسار وروابطه | ٢ |
| `pages/matches.js` · `pages/requests.js` | البحث السريع وتسليم مسودّته | ٣ |
| `util/finance.js` · `pages/pricing.js` | **جديد** + لوحة القسط | ٤ |

### اختُبر فعليًا

**٤٧٥ اختبارًا ناجحًا، صفر فشل** — منها ١٨ في `perf-profile-unit.mjs` (**تطابق النتيجة
بالفهرس وبدونه** · العقار بغرضين في دلوين · موافقة `hasCandidate` لعدّ المرشحين في الحالتين
· صحة معادلة القسط عدديًا وحالاتها الحدّية)، و١٧ في `profile-and-quick.mjs` داخل متصفح
(الملف يجمع الستة · معرّف مجهول رسالةٌ لا خطأ · **البحث السريع لا يكتب سجلًا** مقيسًا
بعدّ الطلبات · المسودّة تُستهلك مرة · لوحة القسط بأرقامها وتصريحها).

---

## ٢٩. المرحلة ٢١ — سلة المحذوفات، وتحذير التخزين، ومعاينة الاسترجاع

### تغيير المخطط

**رُفع `DB_VERSION` من ٤ إلى ٥** — مخزن جديد واحد (`trash`) لا غير، و`upgrade()` كما هي:
تُنشئ الناقص ولا تمسّ بيانات.

**و`trash` ليست في `STORES` عمدًا** — وهي المرة الأولى التي يُستثنى فيها مخزن: `STORES`
تقود النسخة الاحتياطية، وإدراج السلة فيها يضخّم النسخة بما حذفتَه قصدًا. فهي شبكة أمان
محلّية لا بيانات تُصدَّر، ويتحقق اختبارٌ من بقائها خارجها.

### ٧) سلة المحذوفات

`remove()` في طبقة البيانات تنسخ السجل إلى السلة قبل حذفه — **في الطبقة لا في الصفحات**،
فتشمل كل مسار حذف بلا استثناء.

| القرار | لماذا |
|---|---|
| **يُستعاد السجل نفسه لا ما حُذف تبعًا له** | حذف العميل يحذف طلباته بـCASCADE، واسترجاعه يعيده وحده. مكتوبٌ في الواجهة — أصدق من وعدٍ باسترجاعٍ كامل لا يتحقق |
| **الصور والمطابقات لا تدخل السلة** | الصور تبلغ ميغابايتات، والمطابقات تُعاد حسابًا لا استرجاعًا |
| **الاسترجاع يرفض إن كان المعرّف مشغولًا** | لا يُطمَس سجلٌّ قائم باسم الاسترجاع (يتحقق منه اختبار) |
| **يُكنس ما تجاوز ٣٠ يومًا** عند كل فتح للسلة | شبكة أمان قصيرة لا أرشيف دائم يتضخّم في تخزينٍ محدود |
| **فشل النسخ لا يمنع الحذف** | الحذف ما طلبتَه، والسلة زيادة |

### ١١) تحذير التخزين قبل الامتلاء

لوحة التخزين كانت **تعرض** المستهلك ولا تنبّه. الآن تُعرض النسبة المئوية، وعند ٨٠٪ يظهر
تحذيرٌ بما يُفعل (تصدير نسخة، ثم حذف صور المبيع والمؤجَّر). والخطر الحقيقي المذكور فيه:
الامتلاء **أثناء جولة ميدانية** يعني ضياع التقاط اليوم.

### ١٢) معاينة قبل استبدال البيانات

كان الاستيراد يقول «سيُستبدل كل ما في هذا المتصفح» — جملةٌ لا يقرؤها أحد. الآن تُعرض
**مقارنة رقمية لكل كيان** (`العملاء: ١٢ ← ٩`)، ويُحسب الفقد صراحةً حين يكون ملف النسخة
أقلّ: «ستفقد ٣ من العملاء — وهذا لا يُستعاد إلا بنسخة أحدث».

### الملفات المعدَّلة وسببها

| الملف | التعديل | السبب |
|---|---|---|
| `adapters/indexeddb.js` | مخزن `trash` ورفع الإصدار إلى ٥ | ٧ |
| `repository.js` | `keepInTrash` في `remove` · واجهة `repo.trash` | ٧ |
| `schema.js` | تعليق يشرح استثناء `trash` من `STORES` | ٧ |
| `pages/settings.js` | لوحة السلة · تحذير التخزين · معاينة الاستيراد | ٧ و١١ و١٢ |
| `css/components.css` | `.notice-warn` · `.trash-row` | أعلاه |
| `tests/app-pages.mjs` · `tests/expenses-and-tools.mjs` | إصدار القاعدة ٥ (والثانية صارت `>= 4` فلا تُكسر بكل ترقية) | الاختبار |

### اختُبر فعليًا

**٤٨٩ اختبارًا ناجحًا، صفر فشل** — منها ١٤ في `trash-and-storage.mjs` داخل متصفح حقيقي:
الترقية إلى ٥ · الحذف يمرّ بالسلة ويُحذف فعلًا من مخزنه · الاسترجاع بالمعرّف الأصلي ثم
رفعه من السلة · **الصور لا تدخل** · **الرفض عند تعارض المعرّف مع بقاء السجل القائم سليمًا**
· الكنس بعد ثلاثين يومًا · بقاء السلة خارج النسخة الاحتياطية · واللوحة وزر الاسترجاع فيها.

---

## ٣٠. المرحلة ٢٢ — الصفحة العامة مصدرَ عملاء، وتنبيه الفتح

**لا مخطط ولا إصدار قاعدة.** دالة خادمية جديدة، ومساعد تنبيه مشترك، ونموذج في الصفحة العامة.

### ١٠) «اطلب معاينة» — `netlify/functions/lead.js`

الصفحة العامة كانت **كتيّبًا**: يرى الزائر العروض ولا يستطيع ترك رقمه. والآن نموذج أسفلها
(اسم · جوال · ما يبحث عنه) يصل إلى Blobs، ويظهر في صفحة «الصفحة العامة للعروض» داخل
التطبيق، ويُحوَّل بزرّ إلى عميل.

| الحماية | لماذا هكذا |
|---|---|
| **حقل فخّ** خارج العين وقارئ الشاشة ومسار التنقل (`clip` + `aria-hidden` + `tabindex="-1"`) | تعبئته تعني آلة. والردّ عليه **نجاح صامت** كي لا تتعلّم الآلة أنها كُشفت |
| **حدّ معدّل** ٥ في الساعة لكل IP في Blobs | بلا حساب ولا خدمة خارجية. وبغياب رأس الـIP لا يُطبَّق حدّ عام — إذ يعاقب الجميع بذنب واحد |
| حدود طول صارمة وتنظيف محارف التحكّم | والنصّ يُعرض نصًّا في التطبيق لا HTML |
| التطبيع في الدالة لا في المتصفح | الجوال بالأرقام العربية يصل محليًّا موحَّدًا، فلا يُقارن بصيغتين |

و**التحويل لا يُنشئ مكرّرًا**: إن كان الجوال مسجَّلًا عندك يُضاف نصّ الطلب إلى **سجل تواصل**
العميل القائم بدل سجلٍّ ثانٍ يشتّت تاريخه.

### ١٣) تنبيه عند فتح العميل لقائمته

`client-list.js` كان يعدّ الفتحات ويعرضها إن ذهبتَ إليها. الآن يُرسل تنبيهًا لحظتها —
**وهي أفضل لحظة للاتصال**. ومُهلة ساعة لكل قائمة فلا يزعجك من يتصفّح ذهابًا وإيابًا.

### `netlify/lib/notify.js`

مساعد مشترك للتنبيه الفوري (بخلاف `push-tick` المجدولة). **والحمولة عامة بقصد**: لا اسم
ولا رقم — عنوانٌ ومسارٌ داخل التطبيق، والتفاصيل تُقرأ من جهازك. والاشتراك المنتهي (404/410)
يُحذف تلقائيًا بنفس قاعدة `push-tick`.

### الملفات المعدَّلة وسببها

| الملف | التعديل | السبب |
|---|---|---|
| `netlify/functions/lead.js` · `netlify/lib/notify.js` | **جديدان** | ١٠ و١٣ |
| `netlify/functions/client-list.js` | تنبيه عند الفتح بمهلة ساعة | ١٣ |
| `offers/index.html` · `offers/style.css` · `offers/app.js` | النموذج وفخّه وحالته | ١٠ |
| `js/pages/publish.js` | لوحة الطلبات وتحويلها إلى عملاء | ١٠ |
| `tests/server.mjs` | توصيل `/api/lead` بالدالة الحقيقية | الاختبار |

### اختُبر فعليًا

**٥٠٣ اختبارات ناجحة، صفر فشل** — منها ١٤ في `leads.mjs` تعمل على **كود الدالة الحقيقي**
فوق تخزين Blobs مزدوج: النموذج وفخّه (بقياس حجمه وسمة `aria-hidden` و`tabindex`) · رفض
الجوال غير الصالح · **قبول الأرقام العربية وتخزينها بصيغة محلية** · الفخّ يردّ نجاحًا ولا
يحفظ شيئًا · **منع القراءة بلا جلسة (401)** · قراءة المالك · الحدّ المعدّل (برأس
`x-forwarded-for` الذي يضعه Netlify في الإنتاج، فيُختبر المنطق الحقيقي) · الحذف · واللوحة
في التطبيق.

**وما لا يُختبر هنا:** وصول التنبيه فعلًا إلى جهازك — يحتاج خدمة دفع حقيقية ومتصفحًا مشتركًا.
المنطق مُختبَر، والوصول يبقى للتجربة على الموقع المنشور.

---

## ٣١. المرحلة ٢٣ — التقاط العميل بلصقة، وخطط المتابعة، ودرجة الأولوية

**لا مخزن جديد ولا إصدار قاعدة.** مفتاح إعدادات واحد (`plans`) وحقل في `followUp`.

### ١) عميل وطلب بلصقة واحدة

الأنظمة التي تلتقط العملاء من البوّابات آليًا تُباع باشتراك شهري كبير (WIYO تبدأ من ٢٬٦٥٠
درهمًا). وهذا ٨٠٪ من قيمتها بلا اشتراك: القارئ (`parseRequestText`) موجود منذ المرحلة ١١
ويقرأ الاسم والجوال والمواصفات — وكان يفتح الاستمارة معبّأة فقط. الآن زرّ ثانٍ يُنشئ
**العميل وطلبه وسجل تواصله** دفعة واحدة وينقلك إلى مطابقات الطلب.

- **لا عميل مكرّر:** الجوال المسجَّل يُستعمل سجلّه ويُضاف الطلب إليه.
- **الزر معطَّل بلا جوال مقروء** — عميلٌ لا تستطيع الاتصال به سجلٌّ ناقص، والتلميح يقول لماذا.
- نصّ الرسالة يُحفظ في ملاحظات العميل، فيبقى الأصل الذي قُرئ منه.

### ٢) خطط المتابعة — `js/util/plans.js` + مفتاح `plans`

الخطة سلسلة خطوات بأيامها ونوعها تُطلق عند حدث (`new_client` · `after_showing` · يدويًا)،
فتُنشأ مهامها دفعة واحدة. وهذا ما تسمّيه الأنظمة العالمية Smart Plans / Drip.

| القرار | لماذا |
|---|---|
| **القائمة فارغة افتراضيًا** والخطة الجاهزة **معطَّلة** حتى تفعّلها | خطة لم تكتبها تُغرق مهامك بما لا تنوي فعله |
| خطوة اليوم صفر تُجدول **بعد ساعة** لا الآن | مهمة تظهر مستحقّة لحظة إنشائها ضجيج |
| بقية الخطوات في **العاشرة صباحًا** | موعدٌ يُتصل فيه لا لحظة الإنشاء |
| **لا تتكرر الخطة على السجل نفسه** (وسم `[خطة:id:سجل]` في الملاحظات) | إعادة تشغيل الحدث لا تضاعف المهام |
| الخطة والمهمة المفردة بعد المعاينة **إعدادان مستقلان** | تعطيل أحدهما لا يعطّل الآخر |

### ٣) درجة أولوية العميل — `js/util/lead-score.js`

الأنظمة الكبرى تبيع هذا بوصفه «ذكاءً» يقيّم العميل بنموذج لغوي. وهذا يفعل أكثره **بحسابٍ
من بياناتك، ويقول لماذا**: تسع إشارات بأوزان معلنة في مكان واحد (تصنيفك له، فتحه لرابطه،
تواصلٌ جرى، طلب نشط، مرشحون متاحون، اكتمال بياناته · وخصمٌ للتأخّر وبُعد الميزانية وغياب
الجوال). والسبب يظهر في تلميح الشارة — **درجةٌ لا تُشرح لا تُصحَّح**.

والملف المغلق أو المُبرَم درجته صفر مهما كانت إشاراته: ليس في السباق أصلًا.

### ٤) «ينتظرون ردّك» (سرعة الردّ)

«الردّ خلال ١٥ دقيقة» شعار تبيعه أنظمة كبرى، والحساب أبسط من أدواتها: عميل سُجِّل ولم
يُسجَّل معه تواصل ومضى عليه أكثر من الحدّ (`followUp.replyWithinMinutes`، صفر = معطَّل).
ويُقصر على أسبوع مضى **كي لا تتحوّل اللوحة إلى أرشيف ذنوب قديمة** لا يُفعل بها شيء.
وهي أول لوحة في «يومي» لأن التأخير هنا يكلّف عميلًا لا وقتًا.

### الملفات المعدَّلة وسببها

| الملف | التعديل | السبب |
|---|---|---|
| `pages/requests.js` | زر «أنشئ العميل والطلب» | ١ |
| `data/settings.js` · `pages/settings.js` | مفتاح `plans` ولوحته · `replyWithinMinutes` | ٢ و٤ |
| `util/plans.js` | **جديد** | ٢ |
| `pages/matches.js` · `pages/publish.js` | تشغيل الخطط عند الحدثين | ٢ |
| `util/lead-score.js` | **جديد** | ٣ و٤ |
| `pages/clients.js` | عمود الأولوية بشارته وتلميحه | ٣ |
| `pages/today.js` | لوحة «ينتظرون ردّك» | ٤ |
| `util/dom.js` | `badge` صار يقبل `title` | ٣ |
| `tests/source-and-priority.mjs` | قراءة خلية الاسم **بصنفها لا بموضعها** فلا يكسرها عمود جديد | الاختبار |

### اختُبر فعليًا

**٥٤٤ اختبارًا ناجحًا، صفر فشل** — منها ٢٣ في `plans-score-unit.mjs` (مواعيد الخطوات
ووسمها · الدرجة وحدودها وأسبابها مرتّبة بالأثر · **الملف المغلق خارج السباق** · شروط
«ينتظرون ردّك» الستة)، و١٦ في `plans-and-paste.mjs` داخل متصفح حقيقي (اللصق ينشئ عميلًا
واحدًا وطلبًا واحدًا بحقولهما · **لا تكرار للخطة على السجل نفسه** · **الخطة المعطَّلة لا
تُنشئ شيئًا** · التلميح يشرح الدرجة · واللوحة تظهر بمن ينتظر).

---

## ٣٢. المرحلة ٢٤ — الصفقة سجلًّا حيًّا: مسارها، ودفعاتها، وشريكها، ومصدر عملائها

الصفقة كانت **سطرًا يُكتب مرة ولا يُقرأ**: تُنشأ من المطابقات ثم لا تُعدَّل في أي مكان،
ولا تعرف من مسارها أين وقفت، ولا من إيجارها ما استُحقّ، ولا كم منها لشريكك حقًّا.
هذه المرحلة تجعلها سجلًّا يُتابَع، وتقرأ أخيرًا حقلًا كان يُكتب منذ المرحلة ٨ ولا يُقرأ:
**مصدر العميل**.

### ١) العمولة الصافية والشريك — `netCommission(deal)`

`commission` كان يُعرض بوصفه دخلك، وهو ليس كذلك حين تشارك وسيطًا آخر. الآن الصفقة تحمل
`partnerName` و`partnerShare` و`partnerPaidAt`، و**كل رقم عمولة في النظام صار صافيًا**:
تقرير المصادر، وربحية العقار.

| القرار | لماذا |
|---|---|
| الصافي `max(0, عمولة − نصيب)` | رقم سالب في لوحة دخلٍ لا معنى له |
| **نصيبٌ بلا اسم شريك يُردّ بخطأ ولا يُمحى صامتًا** | محو رقمٍ كتبه المستخدم أسوأ من رفضه — وهذا تصحيح لسلوكٍ كان يُفرغه في `PREPARE` فيجعل قاعدة التحقق ميتة |
| ونصيبٌ أكبر من العمولة يُردّ | خطأ إدخال لا حالة عمل |
| `partnerPaidAt` يُمحى إذا لا نصيب | لا تسليم لما لا وجود له |
| «صافيك» يُحسب **أمامك قبل الحفظ** | القسمة تُراجَع وهي رقم لا بعد أن تصير سجلًّا |

### ٢) جدول دفعات الإيجار — `deal.payments`

صفقة الإيجار دخلٌ يتكرر، وكان النظام يعرف تاريخ نهايتها ولا يعرف دفعاتها. الآن لكل صفقة
جدول `[{ id, dueAt, amount, paidAt, note }]`، ودفعاتها غير المقبوضة تدخل **مستحقات «يومي»**
بجوار الفواتير والعمولات، وتُقبض من هناك بزرّ واحد.

- الدفعة **المستقبلية ليست متأخرة**: تدخل بعمرٍ سالب كما تدخل الفاتورة المؤجَّلة (القسم ٢٥).
- الدفعة بلا تاريخ أو بلا مبلغ **تُسقَط في `PREPARE`** — جدولٌ ناقص ليس جدولًا.
- لكل دفعة مُعرِّف ثابت يُولَّد عند الحفظ، فقبضها من «يومي» يصيبها هي لا جارتها.
- زرّ «جدول ١٢ شهرًا» يوزّع مبلغًا شهريًا ابتداءً من الشهر القادم — الحالة الغالبة بضغطة.

### ٣) مسار الصفقة ومستنداتها — `deal.checklist`

قائمة تحقّق لكل صفقة: الاتفاقية، الهويات، الصك، التوثيق، قبض العمولة. قالبها في
**الإعدادات ← بيانات الشركة** (`company.dealChecklist`، سطر لكل بند).

> **القالب يُنسخ لحظة إنشاء الصفقة ولا يُقرأ منه بعدها.** تعديلك للقالب اليوم يجب ألّا
> يغيّر مسار صفقةٍ أُبرمت الشهر الماضي — السجل يحفظ حالته لا مرجعه.

وتقدّم المسار (`checklistProgress`) يُعيد `null` لا «صفر من صفر» للصفقة بلا مسار: فرقٌ بين
«لم يبدأ» و«لا ينطبق».

### ٤) تقرير مصادر العملاء — `js/util/sources.js`

`referralSource` يُكتب منذ المرحلة ٨ ولم يكن يُقرأ في أي شاشة. اللوحة الآن تقول لكل مصدر:
كم عميلًا، وكم طلبًا نشطًا، وكم صفقة، و**كم عمولة صافية** — والترتيب بالعمولة لا بعدد
الأسماء، لأن مصدرًا يعطيك خمسين اسمًا بلا صفقة **تكلفةٌ لا مورد**.

- العملاء بلا مصدر يُجمعون تحت «بلا مصدر» صراحةً، ولا يُحسبون مصدرًا مسمًّى في الإجمالي.
- تحت خمس صفقات تظهر جملة تحذير من صغر العيّنة — **لا تُلغِ مصدرًا بناءً على ثلاث صفقات**.

### ٥) ربحية العقار — `propertyProfit`

المصاريف مرتبطة بالعقار منذ المرحلة ١٣، والعمولات مرتبطة به عبر الصفقة. فالربحية **حسابٌ
لا تخزين**: عمولاته الصافية ناقص ما صُرف عليه. وعقارٌ صُرف عليه ولم يُبَع يظهر بصافٍ سالب
**وهذا مقصود** — هو الرقم الذي يجعلك تراجع التصوير والإعلان قبل التالي.

### الملفات المعدَّلة وسببها

| الملف | التعديل | السبب |
|---|---|---|
| `data/schema.js` | حقول `payments` و`checklist` والشريك · `netCommission` و`duePayments` و`checklistProgress` | ١–٣ |
| `data/repository.js` | تطبيع الدفعات والمسار في `PREPARE` · قاعدتا تحقق للشريك · **رفع محو النصيب الصامت** | ١–٣ |
| `data/settings.js` | `company.dealChecklist` قالبًا جاهزًا | ٣ |
| `util/sources.js` | **جديد** | ٤ و٥ |
| `util/receivables.js` | `paymentReceivables` مطويّة في `receivables` | ٢ |
| `pages/client.js` | نافذة «إدارة الصفقة» — **المكان الوحيد** الذي تُعدَّل منه الصفقة | ١–٣ |
| `pages/today.js` | صفوف الدفعات في المستحقات و«قُبضت» | ٢ |
| `pages/matches.js` | نسخ المسار من القالب عند إنشاء الصفقة (وحذف جلبٍ مكرر لبيانات الشركة) | ٣ |
| `pages/dashboard.js` | لوحتا «مصادر العملاء» و«ربحية العقارات» | ٤ و٥ |

### لم يُمسّ

- **مخزن `deals` لم تتغير مفاتيحه ولا فهارسه** — الحقول الثلاثة إضافة بقيم افتراضية، فصفقاتك
  القديمة تُقرأ كما هي بمسار فارغ ودفعات فارغة. **ولا ترقية لنسخة قاعدة البيانات** (تبقى ٥).
- محرك المطابقة، والتسعير، والفواتير، والنسخ الاحتياطي، وبوابة الدخول — لا تعديل.
- `commission` نفسه لم يُمسّ: الصافي **يُحسب ولا يُخزَّن**، فلا رقم مشتقّ يمكن أن يتناقض مع أصله.

### اختُبر فعليًا

**٦٠٠ اختبارًا ناجحًا، صفر فشل** — منها ٣٥ في `deals-sources-unit.mjs` (الصافي وحدوده ·
ترتيب المستحقّ بالأقدم · **المستقبلي ليس متأخرًا** · `null` لا «صفر من صفر» · ترتيب المصادر
بالعمولة الصافية · نسبة التحويل · العقار السالب)، و٢١ في `deals-and-sources.mjs` داخل متصفح
حقيقي (**النصيب بلا اسم يُردّ بخطأ**، والنصيب الأكبر من العمولة يُردّ · الصافي يظهر قبل
الحفظ · الدفعة تُحفظ بمعرِّف ثابت وتظهر في «يومي» وتُقبض منه فتختفي · اللوحتان بأرقامهما
الصحيحة بلا `null` نصًّا ولا فيض أفقي).

---

## ٣٣. المرحلة ٢٥ — استمارة العملاء بـQR، وعدّاد المشاهدات، وطلب التقييم

ثلاثة بنود بقيت من الطابور، يجمعها خيطٌ واحد: **ما بعد الصفحة العامة**. كانت الصفحة تعرض
وتستقبل رقمًا، ولا تعرف هل رآها أحد، ولا تُكمل الدائرة بعد أن تُبرم الصفقة.

### ١) استمارة العملاء بـQR — `offers/intake.html` + `offers/intake.js`

نموذج «اطلب معاينة» (المرحلة ٢٢) يترك رقمًا ونصًّا حرًّا تعيد أنت كتابته طلبًا. هذه الاستمارة
**تملأ حقول الطلب نفسها**: غرض · نوع · مدينة · حي · ميزانية · مساحة. رمزها يُمسح من شاشة
جوالك في المجلس، أو يُطبع على لوحة العقار.

> **القوائم من لقطتك أنت.** النشر صار يحمل في اللقطة `forms` (أغراضك وأنواعك ومدنك
> وأحياءك)، فترسل الاستمارة **مفاتيحك** لا نصًّا حرًّا — ويصير الوارد طلبًا يدخل المحرك بلا
> ترجمة ولا تخمين. وقبل أول نشرة تعمل بالاسم والجوال والنص وحدها، **وهذا مكتوب في اللوحة**
> لا يُكتشف عند أول عميل.

| القرار | لماذا |
|---|---|
| التحويل يُنشئ **العميل وطلبه معًا** وينقلك إلى مطابقاته | هذا هو الفرق كله: لم يعد الوارد رقمًا تعيد كتابته |
| المفاتيح تُنظَّف إلى حروف وأرقام في الدالة | حقلٌ يُتوقَّع مفتاحًا لا يدخله نصّ حرّ |
| الأرقام تُقرأ **بإشارتها** (`-5` ⇐ فارغ لا ٥) | نزع الإشارة قبل القراءة كان يُدخل رقمًا لم يكتبه أحد — أُصلح باختبارٍ كشفه |
| استمارة فارغة الحقول لا تُخزَّن طلبًا | كائنٌ فارغ في السجل يوهم بطلبٍ لم يُكتب |
| مدينة ليست في قوائمك ⇐ أول مدنك، والمكتوب في ملاحظات الطلب | طلب بلا مدينة لا يعمل عليه المحرك، والمكتوب لا يضيع |
| الفخّ والحدّ المعدّل نفسهما | الحماية من المرحلة ٢٢ تشمل المدخل الجديد بلا كود ثانٍ |

### ٢) عدّاد مشاهدات العروض — `netlify/functions/view.js`

كنت تنشر عرضًا ولا تعرف: هل فُتح؟ العدّاد يجيب عن هذا **وحده**.

> **ما لا يُخزَّن:** لا عنوان IP، ولا كوكي، ولا بصمة متصفح، ولا «من» رأى. رقمٌ لكل عرض لكل
> يوم، لا أكثر.

- العدّ **مرة واحدة لكل جلسة متصفح** (`sessionStorage`)، فالتحديث المتكرر لا ينفخ الرقم.
- **الدقّة معلَنة:** قراءة ثم كتابة بلا قفل، فمشاهدتان في اللحظة نفسها قد تُحسبان واحدة.
  وهو **مؤشر اهتمام لا محاسبة إعلانية** — ويُقال هذا في تلميح العمود لا في هذا الملف وحده.
- **عرضٌ غير منشور لا يُفتح له عدّاد**: وإلا لملأ أيُّ عابثٍ التخزين بمفاتيح لا وجود لها.
- تُمسح أيام أقدم من ٩٠ يومًا عند القراءة — العدّاد يُقاس بالأسابيع لا بالسنين.
- فشل الجلب لا يُعطّل صفحة النشر: تظهر «؟» مكان الرقم.

### ٣) طلب التقييم بعد الصفقة — `reviewCandidates` + `company.reviewUrl`

الصفقة تنتهي وتُنسى، والتقييم الذي يجلب العميل التالي لا يُطلب. اللوحة في «يومي» تعرض
صفقاتٍ **مضى عليها يومان فأكثر وأقل من ثلاثين** ولم يُطلب تقييمها.

| القرار | لماذا |
|---|---|
| بعد **يومين** لا لحظة الصفقة | طلبٌ في اللحظة يبدو انتزاعًا لا شكرًا |
| وقبل **ثلاثين يومًا** | بعدها بردت الحماسة وصار الطلب ثقيلًا |
| **بلا `reviewUrl` لا تظهر اللوحة أصلًا** | زرٌّ يرسل عميلك إلى لا شيء أسوأ من غيابه |
| الرسالة **تُعرض قبل الإرسال ولا تُرسل نيابةً عنك** | لا يخرج باسمك كلامٌ لم تقرأه — واتساب يفتح بالنص وأنت تضغط |
| ونصّها يدعو إلى **ملاحظةٍ مباشرة** إن لم يكن راضيًا | طلب تقييمٍ لا يترك للساخط بابًا غير العلن سوء أدبٍ مهني |
| «تخطَّ» توسم الصفقة بلا إرسال | قرارك ألّا تطلب قرارٌ أيضًا، ولا يعود السطر غدًا |

### الملفات المعدَّلة وسببها

| الملف | التعديل | السبب |
|---|---|---|
| `offers/intake.html` · `offers/intake.js` | **جديدان** — الاستمارة العامة | ١ |
| `netlify/functions/lead.js` | قبول `want` وتنظيفه · عنوان تنبيه أدقّ | ١ |
| `netlify/functions/publish.js` · `pages/publish.js` | `forms` في اللقطة · لوحة الاستمارة ورمزها · إنشاء الطلب عند التحويل · عمود المشاهدات | ١ و٢ |
| `netlify/functions/view.js` | **جديد** — العدّاد | ٢ |
| `netlify/functions/offer.js` | نبضة المشاهدة في صفحة العرض | ٢ |
| `data/schema.js` | `deals.reviewRequestedAt` · `reviewCandidates` | ٣ |
| `data/settings.js` · `pages/settings.js` | `company.reviewUrl` · وحقل **قالب مسار الصفقة** الذي أضافته المرحلة ٢٤ في البيانات ولم يكن له حقل في الشاشة | ٣ (و٢٤) |
| `pages/today.js` | لوحة «اطلب تقييمًا» وزرّاها | ٣ |
| `tests/server.mjs` | تركيب `/api/view` على خادم الاختبار | الاختبار |

### لم يُمسّ

- **لا ترقية لنسخة قاعدة البيانات** (تبقى ٥): `reviewRequestedAt` حقلٌ بقيمة افتراضية.
- الصفحة العامة للعروض ونموذج «اطلب معاينة» كما هما — الاستمارة الجديدة **صفحة مستقلة**،
  فمن يريد ترك رقمه فقط لا يُجبَر على استمارة طويلة.
- محرك المطابقة، والتسعير، والفواتير، وبوابة الدخول، والنسخ الاحتياطي — لا تعديل.
- عدّاد فتح قوائم العملاء (المرحلة ٢٢) مستقل عن عدّاد المشاهدات: ذاك يعرف **من** فتح لأنك
  أرسلت له رابطه، وهذا لا يعرف أحدًا — ولم يُدمجا كي لا يختلط المعنيان.

### اختُبر فعليًا

**٦٢٨ اختبارًا ناجحًا، صفر فشل** — منها ٢٨ في `intake-and-views.mjs` على خادمٍ مقفل بدوال
حقيقية: الاستمارة تُفتح بلا بوابة وفيها الفخّ · الأرقام تصل أرقامًا والمفاتيح منظَّفة
· **`-5` تصير فارغًا لا ٥** · الاستمارة الفارغة لا تُخزَّن طلبًا · التحويل يُنشئ العميل
والطلب بحقولهما وينقل إلى المطابقات · العدّاد يعدّ **فرقًا** لا رقمًا مطلقًا ويتجاهل رقمًا
غير منشور · وبلا رابط تقييم لا تظهر اللوحة، ومعه تظهر و«تخطَّ» توسم الصفقة فلا تعود.

---

## ٣٤. المرحلة ٢٦ — تقرير المالك، ودمج المكرّرين، والملاحظة الصوتية

ثلاثة اخترتَها من قائمة المقارنة، يجمعها أنها تعالج ما **يكلّفك فعلًا**: تفاوضٌ بلا ورقة،
وتاريخُ عميلٍ مقطوع، وكلامٌ يضيع بعد المكالمة.

### ١) تقرير المقارنة السوقية (CMA) — `printCma` في `util/property-print.js`

المالك يقول «عقاري يساوي كذا» ولا تملك ورقةً تردّ بها. هذه هي الورقة: يُطبع من قائمة
مشاركة العقار، على ترويسة مكتبك، وفيه النطاق المقترح ووسيط سعر المتر والعيّنة ومصادرها
ثم **المقارنات صفًّا صفًّا** بمساحاتها وأسعارها وتواريخها.

| القرار | لماذا |
|---|---|
| **نطاق** (الربيع الأول إلى الثالث) لا رقم واحد | رقمٌ واحد يوهم بدقّة لا يملكها حسابٌ من عيّنة |
| **العقار نفسه مستثنى من عيّنته** (`excludeId`) | سعره المطلوب هو ما نختبره، فإدخاله يجعل الرقم يصدّق نفسه |
| المقارنات معروضة بمصدر كل صفّ (مخزونك · معلن · صفقة) | لا رقم بلا سنده — والمالك يرى من أين جاء |
| درجة الثقة والتشتّت معلنان في الورقة | العيّنة الواسعة المتفرّقة ليست ثقة |
| العيّنة القليلة تُقال صراحةً **«لا تكفي»** ولا يُطبع نطاق | التخمين المُزيَّن أسوأ من الصمت |
| التذييل ينفي أنه تقييم معتمد | من يقرأ الورقة ليس أنت، وقد يبني عليها — فالحدّ يُكتب فيها لا في هذا الملف |

الحساب كله من `estimatePrice` نفسها التي تغذّي صفحة التسعير — **لا حساب موازٍ** يمكن أن
يخالف ما تراه في التطبيق.

### ٢) دمج العملاء المكرّرين — `util/duplicates.js` + `repo.clients.merge`

التكرار يدخل من أبواب مشروعة كلها: يتصل مرّتين، ويصل من الصفحة العامة ومن استمارة الـQR،
وتلصق رسالته مرّة وتسجّله مرّة. والنتيجة سجلّان لشخص واحد: تاريخه مقطوع، ومطابقاته مكرّرة،
و«لم يُتواصل معه منذ أسبوعين» يكذب عليك.

**الكشف** (دالة خالصة): الجوال حكمٌ قاطع (بأي صيغة، وجوال أحدهما = جوال الآخر الثاني)،
والاسم ظنٌّ يُعرض موسومًا «تحقّق بنفسك». واسمٌ من كلمة واحدة ليس دليلًا فيُستبعد، والمسافات
تُزال في المفتاح لأن «عبدالله» و«عبد الله» اسمٌ واحد يكتبه صاحبه بالطريقتين.

**الدمج** (في `repo`): لا يضيع شيء ولا يُطمس شيء.

| القاعدة | لماذا |
|---|---|
| المرتبطات **تُنقل** (عقارات · طلبات · صفقات · فواتير · مهام) | الدمج جمعٌ لا حذف |
| سجلّا التواصل يندمجان ويُرتَّبان بالتاريخ | تاريخ العميل يعود قطعة واحدة |
| الحقول الفارغة تُملأ من المحذوف، و**المملوءة لا تُمسّ** | الدمج لا يُلغي ما اخترتَه |
| ملاحظات المحذوف تُلحق بسطرٍ يقول من أين جاءت | نصٌّ بلا مصدر يربك بعد شهر |
| **كل أرقامه** تُقارن بأرقام المُبقى: ما وجد خانة فارغة دخلها، وما لا فإلى الملاحظات | رقمٌ يضيع في الدمج لا يُعوَّض — وقد كان يضيع فعلًا حتى كشفه الاختبار |
| **لا دمج آلي مهما بلغ اليقين**، ومعاينة ما سينتقل قبل التأكيد | سجلّان بجوالٍ واحد قد يكونان أبًا وابنه، والقرار قرارك |
| زرّ «اعكس» يقلب أيّهما الباقي، والاقتراح يبدأ بالأغنى سجلًّا | اقتراحٌ لا حكم |

### ٣) الملاحظة الصوتية في سجل التواصل — `data/audio.js` + `util/audio-note.js`

بعد المكالمة تكون في السيارة أو أمام العميل، فتكتب «تمّت المكالمة» ويضيع نصفُ ما قيل.
ثلاثون ثانية بصوتك تحفظ ما لا تكتبه. الزرّ في **موضعي التسجيل كليهما**: «يومي» بعد
المكالمة مباشرة، وسجل التواصل في ملف العميل.

> **لا يخرج الصوت من الجهاز أبدًا:** لا رفع ولا تفريغ نصّي في أي خدمة. وهذا يختلف عن
> الإملاء بالصوت (المرحلة ١١) الذي يمرّ بخدمة المتصفح — ولذلك هو زرٌّ صريح منفصل.
> والتصريح مكتوب **تحت الزرّ في الشاشة** لا هنا فقط.

- **حدّ دقيقتين** مع عدّاد يقول الحدّ — الصوت أثقل من النص بمرّات، والمساحة جهازك.
- **لا يُحفظ شيء قبل «تسجيل التواصل»**: التسجيل يبقى في الذاكرة، فإغلاق الاستمارة لا يترك ملفات يتيمة.
- **حذف سجل التواصل يحذف تسجيله** — ملفٌّ بلا سجلٍّ يشير إليه مساحةٌ ضائعة لا يراها أحد.
- الإيقاف يُغلق مسار الميكروفون دائمًا، فمؤشّر التسجيل في المتصفح لا يبقى مضاءً.
- المتصفح غير الداعم **لا يُركَّب فيه الزرّ أصلًا** — لا زرّ معطَّل يربك المستخدم.
- حجم التسجيلات يظهر في لوحة التخزين (المرحلة ٢١) متى وُجدت.

### الملفات المعدَّلة وسببها

| الملف | التعديل | السبب |
|---|---|---|
| `util/property-print.js` · `css/components.css` | `printCma` وأنماط ورقتها | ١ |
| `pages/properties.js` | زرّ التقرير في قائمة المشاركة · عيّنة الأسعار الخام في السياق | ١ |
| `util/duplicates.js` | **جديد** — الكشف واقتراح الباقي | ٢ |
| `data/repository.js` | `clients.merge` و`mergeImpact` · `addContact` يقبل التسجيل · `removeContact` يحذفه · `audio` في `repo` و`TRASH_SKIP` | ٢ و٣ |
| `pages/clients.js` | زرّ المكرّرين وشاشته · حقل التسجيل ومشغّله | ٢ و٣ |
| `data/audio.js` · `util/audio-note.js` | **جديدان** — التسجيل والتخزين والمشغّل | ٣ |
| `data/schema.js` · `adapters/indexeddb.js` | مخزن `audio` ورفع `DB_VERSION` إلى ٦ | ٣ |
| `pages/today.js` · `pages/client.js` · `pages/settings.js` | التسجيل في «يومي» · مشغّله في الملف · حجمه في لوحة التخزين | ٣ |
| `tests/app-pages.mjs` · `tests/trash-and-storage.mjs` | تثبيت الفحص على **الترقية لا على الرقم**، فلا يكسره مخزن جديد | الاختبار |

### ترقية قاعدة البيانات ٥ ⇐ ٦

مخزن `audio` **يُضاف فقط**؛ لا مخزن يُمسّ ولا بيانات تُرحَّل، بنفس آلية الترقيتين السابقتين
(٤ للمصاريف و٥ للسلة). وهو **داخل `STORES`** فيدخل النسخ الاحتياطي (تسجيلٌ ضاع لا يُستعاد)،
و**خارج سلة المحذوفات** كالصور لأن الملفات الثقيلة لا تُحتفظ بها نسختان ثلاثين يومًا.

### لم يُمسّ

- محرك المطابقة، والتسعير نفسه (التقرير يقرأ `estimatePrice` ولا يحسب شيئًا جديدًا)،
  والفواتير، والصفحة العامة، وبوابة الدخول.
- سجل التواصل القديم يبقى كما هو: `audioId` حقل جديد قيمته `null` فيما مضى.
- الإملاء بالصوت (`util/voice.js`) لم يُمسّ ولم يُدمج بالتسجيل — وظيفتان مختلفتان وحدودهما
  مختلفة، وخلطهما يخلط وعديهما.

### اختُبر فعليًا

**٦٧٧ اختبارًا ناجحًا، صفر فشل** — منها ١٣ في `duplicates-unit.mjs`، و٣٦ في
`merge-cma-voice.mjs` داخل متصفح حقيقي **بميكروفون حقيقي** (كروم بجهاز صوتٍ وهمي وإذنٍ
ممنوح): الدمج ينقل الأربعة ويدمج التواصل ويحفظ الجوال الثاني ولا يمسّ المملوء ويرفض دمج
السجل في نفسه · التقرير يُبنى ويُطبع بعيّنةٍ **لا تضمّ العقار نفسه** وبتذييلٍ ينفي الاعتماد،
والعيّنة المعدومة تُقال «لا تكفي» · والتسجيل يُسجَّل فعلًا ويُحفظ في مخزن `audio` بمدّته
وصاحبه، **ولا يُحفظ قبل الضغط على «تسجيل التواصل»**، ويُحذف بحذف سجلّه.

---

## ٣٥. المرحلة ٢٧ — المعاينة كيانًا: موعدها، ورأي العميل بعدها، ونسبتها إلى الصفقات

كانت «عُرضت على العميل» حالةً في المطابقة وكفى: **لا موعد**، ولا أثر لمن حضر ومن لم يحضر،
ولا كلمة واحدة مما قاله وهو واقف في الصالة. وهذه أغنى لحظة في العملية كلها — فيها يقول
العميل ما لا يقوله في الهاتف. وهذا البند الثاني من قائمة المقارنة (Sell.do تقيس
site-visit ← booking).

### ١) المخزن — `showings`

`{ at, clientId, propertyId | externalId, requestId, status, impression, reason, notes }`

| القرار | لماذا |
|---|---|
| مخزن مستقل لا حقل في المطابقة | للعميل معاينات كثيرة على عقار واحد، ومعاينة على عرضٍ خارجي بلا مطابقة أصلًا |
| **جدولة المعاينة ترفع المطابقة إلى «عُرض» بصمت** | من يواعد عميله على عقار فقد عرضه عليه؛ وترك الحالتين تتناقضان يُفسد القمع وأنت لم تخطئ |
| الانطباع يرفع الحالة إلى «تمّت» في `PREPARE` | لا رأي لمن لم يعاين — تناقضٌ يُصحَّح لا يُردّ بخطأ |
| **«لم يعجبه» يغلق المطابقة بالسبب نفسه** | تسجيلان لحقيقة واحدة يتناقضان بعد أسبوع |
| خطة «بعد المعاينة» تُطلق عند **تسجيل الانطباع** لا عند حجز الموعد | «بعد المعاينة» تعني بعدها فعلًا؛ وحارس التكرار في `runPlans` يمنع ازدواجها |
| معاينة بلا عميل أو بلا عقار مرفوضة في `VALIDATE` | موعدٌ لا تعرف مع من ولا أين ليس موعدًا |

### ٢) اللوحتان في «يومي»

«معاينات قادمة» (٤٨ ساعة) و«ما رأيه؟ معاينات تنتظر انطباعك». والسؤال يُعرض **بعد ساعتين**
من الموعد لا لحظته: سؤالٌ يقفز والعميل ما زال معك إزعاج.

> **حدٌّ سفليّ للوحة القادمة هو المهلة نفسها.** بغيره كان الصفّ الواحد يظهر في اللوحتين
> معًا — **كشفه الاختبار** فأُضيف الحدّ، ولوحدة الحدّ في الدالتين معنى: ما خرج من هنا دخل هناك.

### ٣) الأرقام — `util/showings.js`

نسبة الحضور (كم موعدًا صار معاينة) · **نسبة المعاينة ← الصفقة** · كم معاينة تكلّفك الصفقة ·
توزيع الانطباعات · وأسباب عدم الإعجاب مجمَّعة.

> **الصفقة تُنسب إلى معاينتها بشرطين:** العميل نفسه والعقار نفسه، وتاريخها **بعد** الموعد
> وخلال ١٢٠ يومًا. وصفقةٌ سبقت المعاينة لا تُنسب إليها مهما تطابق طرفاها — وإلا تملّق الرقم نفسه.

**ولماذا لوحة مستقلة لا مرحلة في قمع التحويل؟** القمع (القسم ٢٤) كل مراحله **بالطلب** وكل
مرحلة **مجموعة جزئية** مما قبلها. والمعاينة تكسر الشرطين: طلبٌ واحد له معاينات، وعميلٌ
يهتمّ بلا معاينة أصلًا. فإدخالها في السلسلة يعطي نسبًا تتجاوز المئة — وهو الخطأ نفسه الذي
أُصلح في المرحلة ١٧، فلا يُعاد.

### الملفات المعدَّلة وسببها

| الملف | التعديل | السبب |
|---|---|---|
| `data/schema.js` | مخزن `showings` · `showingStatuses` و`showingImpressions` | ١ |
| `data/adapters/indexeddb.js` | `DB_VERSION` ٧ ومخزنه وفهارسه | ١ |
| `data/repository.js` | `repo.showings` · `PREPARE` و`VALIDATE` | ١ |
| `util/showings.js` | **جديد** — القادمة · ما ينتظر رأيًا · الإحصاء | ٢ و٣ |
| `pages/matches.js` | زرّ «📅 معاينة» ونافذته · رفع الحالة بصمت (`setStatus` صار يقبل `silent`) | ١ |
| `pages/today.js` | اللوحتان · نافذة «ما رأيه؟» وإغلاقها للمطابقة | ٢ |
| `pages/dashboard.js` | لوحة المعاينات وأرقامها | ٣ |
| `pages/client.js` | معايناته في ملفه | ٢ |
| `tests/merge-cma-voice.mjs` | تثبيت فحص النسخة على الترقية لا على الرقم | الاختبار |

### لم يُمسّ

- **قمع التحويل كما هو** — ولم تُضف إليه مرحلة، للسبب المشروح أعلاه.
- محرك المطابقة، والتسعير، والصفقات، والفواتير، والصفحة العامة.
- الترقية ٦ ⇐ ٧ **إضافة مخزن فقط**، بلا ترحيل بيانات ولا مساس بمخزن قائم.

### اختُبر فعليًا

**٧٢١ اختبارًا ناجحًا، صفر فشل** — منها ٢٣ في `showings-unit.mjs` (النافذة وحدّاها ·
**لا تقاطع بين اللوحتين** · النسب وحالاتها الحدّية · الصفقة السابقة لا تُنسب)، و٢٢ في
`showings.mjs` داخل متصفح حقيقي (الجدولة ترفع المطابقة إلى «عُرض» · الصفّ ينتقل من لوحة
إلى لوحة بمضيّ الموعد · سبب الرفض لا يظهر إلا مع «لم يعجبه» · والانطباع السلبي يغلق
المطابقة بالسبب نفسه · ومعاينة بلا عميل أو عقار مرفوضة).

---

## ٣٦. المرحلة ٢٨ — توقّع الإيراد، ونصّ الإعلان، ونقاط المكالمة

ثلاثة بنود من قائمة المقارنة (٤ و٦ و٩)، يجمعها أنها **تحليل ونصّ**: لا مخزن جديد، ولا
ترقية لقاعدة البيانات، ولا بايت يغادر الجهاز.

### ١) العمولة المتوقَّعة — `util/forecast.js`

«Forecasting» أبرز ما تبيعه Dynamics وSalesforce، وحسابه عندك جاهز منذ المرحلة ١٧:
**نسب قمعك التاريخية × طلباتك النشطة وميزانياتها × نسبة عمولتك**.

| القرار | لماذا |
|---|---|
| الاحتمال **من تاريخك أنت**، مقسّمًا على مرحلة الطلب | طلبٌ أبدى صاحبه اهتمامًا ليس كطلبٍ لم تفتحه بعد؛ ولا جدول عام يعرف سوقك |
| **لا رقم تحت ثلاث صفقات مكتملة** — يُعرض الأنبوب وحده | نسبةٌ من صفقتين ليست نسبة |
| القيمة من **سقف الميزانية** لا وسطها | العميل يشتري عند سقفه غالبًا، وبغياب السقف لا تُخمَّن قيمة |
| الطلب بلا ميزانية **يُستثنى ويُذكر عدده** | إخراجه صامتًا يجعل الرقم يبدو أصغر بلا سبب ظاهر |
| الموقوف والمنجز خارج الأنبوب | الأنبوب ما هو حيّ الآن |
| **مدى يحوي وسطه**: الأدنى بالمهتمّين، والأعلى بكل النشِط بأعلى نسبة عندك | مدًى لا يحوي وسطه ليس مدًى — ويُقصّان حول المتوقَّع صراحةً |

واللوحة تقول في ذيلها إنه **تقدير يتحرك مع بياناتك، لا وعد**.

### ٢) نصّ إعلان جاهز لكل قناة — `util/ad-copy.js`

PropSpace تبيع النشر إلى ثمانين بوّابة عبر واجهاتها، ولا واجهات عامة في السعودية — لكن
**سبعين بالمئة من الوجع صياغة الإعلان** لا رفعه. ثلاث قنوات: بوّابة إعلانية · انستقرام
وسناب · منشور قصير (X).

> **لا يُكتب إلا ما هو مسجَّل.** لا «موقع مميز» ولا «فرصة لا تُعوَّض» ولا مساحة تُقرَّب.
> النصّ الذي يَعِد بما ليس في السجل يكسر ثقة المشتري حين يرى العقار — وهي أغلى مما يجلبه إعلان.

- الوسوم من بيانات العقار نفسه (مدينة · حي · نوع · غرض) لا وسوم عامة تجلب متابعين لا مشترين.
- **الحدّ يُعلَن ولا يُقصّ النصّ**: القصّ الآلي يبتر جملة في منتصفها؛ العدّاد يقول «تجاوز».
- والحروف تُعدّ بـ`[...text]` لا بـ`.length`: الحرف العربي قد يُعدّ مرّتين بغيرها.
- **النواقص تُقال قبل النسخ** (`adGaps`): بلا سعر · بلا صور · بلا وصف بخطّك.
- ورقم العرض المنشور يُذكر إن كان منشورًا، فيطابق ما يراه العميل على صفحتك.

### ٣) نقاط المكالمة — `company`-مستقل في مفتاح `playbooks`

أربعة نصوص جاهزة (تعارف · بعد المعاينة · التفاوض على السعر · إقناع المالك)، تظهر **مطويّة**
داخل نافذة تسجيل التواصل في «يومي».

| القرار | لماذا |
|---|---|
| **مطويّة افتراضيًا** | الاستمارة لتسجيل ما جرى لا لتلقينك، ومن أرادها فتحها |
| **نصّ محض**: لا تُنشئ مهمة ولا تُرسل شيئًا ولا تُخزَّن مع العميل | ما ليس بياناتك لا يدخل بياناتك |
| جاهزة من أول تشغيل **وقابلة للحذف كاملًا** | اجتهاد يُراجَع لا وحي؛ وأنت أدرى بسوقك وأسلوبك |
| النصّ بلا نقاط لا يُحفظ، والسطور الفارغة تُنظَّف | قائمة فارغة في نافذة المكالمة ضجيج |

### الملفات المعدَّلة وسببها

| الملف | التعديل | السبب |
|---|---|---|
| `util/forecast.js` | **جديد** | ١ |
| `util/ad-copy.js` | **جديد** | ٢ |
| `data/settings.js` | مفتاح `playbooks` و`DEFAULT_PLAYBOOKS` | ٣ |
| `pages/dashboard.js` | لوحة «العمولة المتوقَّعة» | ١ |
| `pages/properties.js` | زرّ «📣 نصّ إعلان جاهز» ونافذته · تحميل أرقام العروض المنشورة | ٢ |
| `pages/today.js` | النقاط داخل نافذة تسجيل التواصل | ٣ |
| `pages/settings.js` · `css/components.css` | محرّر النقاط وأنماطه | ٣ |

### لم يُمسّ

- **لا مخزن جديد ولا ترقية لقاعدة البيانات** (تبقى ٧): الأولان حسابٌ خالص، والثالث مفتاح إعدادات.
- قمع التحويل والمعاينات والتسعير — تُقرأ ولا تُعدَّل.
- قوالب واتساب (المرحلة ١١) لم تُمسّ: تلك رسالة تُرسل لعميل، وهذه إعلان يُنشر — ولم يُدمجا.

### اختُبر فعليًا

**٧٦٦ اختبارًا ناجحًا، صفر فشل** — منها ٢٢ في `forecast-adcopy-unit.mjs` (المدى يحوي وسطه ·
الموقوف خارج الأنبوب · **لا رقم تحت الحدّ** · النصّ بلا سعر لا يخترع سعرًا ولا عبارة
تسويقية)، و٢٢ في `forecast-adcopy.mjs` داخل متصفح حقيقي (اللوحة قبل التاريخ وبعده · نافذة
الإعلان بقنواتها ونواقصها وعدّادها · النقاط جاهزة وتُحفظ منظَّفة وتظهر مطويّة في نافذة المكالمة).

---

## ٣٧. المرحلة ٢٩ — رابط حجز موعد

البند السابع من قائمة المقارنة (HubSpot meetings). يختار العميل وقتًا من **أوقاتك أنت**
بدل خمس رسائل «متى يناسبك؟».

### المعمار — ولماذا الخادم هو المرجع

```
إعداداتك (جهازك) ──[نشر]──> snapshot.booking (Blobs) ──> /api/book ──> الصفحة العامة
```

| القرار | لماذا |
|---|---|
| **الخادم يولّد الأوقات ويقبلها**، والصفحة تعرض ما يعطيها ولا تحسب شيئًا | لو حسب المتصفح لأمكن حجز وقتٍ خارج دوامك بتعديل الصفحة |
| القبول يتحقّق أن الوقت **من نفس المجموعة المولَّدة** لا من شكله | فحصُ الشكل يمرّ عليه أي وقت بصيغة صحيحة |
| الأوقات من **اللقطة** لا من جهازك | جهازك قد يكون مغلقًا؛ ولذلك **لا تصل أوقاتك الجديدة إلا بنشرة جديدة** — مكتوبًا في اللوحة لا مُكتشَفًا |
| **مغلق حتى تفتحه** (`booking.enabled`) | لا يُفتح تقويمك للناس بلا قرارك |
| مهلة إشعار (`leadHours`) وأفق (`horizonDays`) | لا يُحجز عليك موعد بعد دقائق، ولا يُحجز بعد ثلاثة أشهر |
| توقيت الرياض ثابت (UTC+3) بلا مكتبة | المملكة بلا توقيت صيفي — والافتراض **مكتوب في الملف** لأن أي تغيّر فيه يُبطل الحساب |
| الفخّ والحدّ المعدّل نفسهما | الحماية من المرحلة ٢٢ تشمل المدخل الجديد بلا كود ثانٍ |

### التحويل: موعدٌ ⇐ عميل + **مهمة**

لا معاينة: المعاينة لا تقوم بلا عقار (قاعدة المرحلة ٢٧)، والموعد المحجوز بلا عقار بعد.
فيُنشأ العميل (إن كان جديدًا، بمصدر «حجز موعد») ويُسجَّل تواصله وتُنشأ **مهمة بموعده نفسه**.

### الملفات المعدَّلة وسببها

| الملف | التعديل | السبب |
|---|---|---|
| `netlify/lib/slots.js` | **جديد** — توليد الأوقات والتحقّق منها | المعمار |
| `netlify/functions/book.js` | **جديد** — المتاح · الحجز · قراءة المحجوز · الحذف | المعمار |
| `netlify/functions/publish.js` | `booking` في اللقطة | المعمار |
| `offers/book.html` · `offers/book.js` | **جديدان** — الصفحة العامة | العرض |
| `data/settings.js` | `publish.booking` بقيمه الافتراضية | الإعداد |
| `pages/publish.js` | لوحة أوقاتك ورمزها · لوحة المحجوز وتحويله | الإعداد |
| `css/components.css` | أنماط الأوقات | العرض |
| `tests/server.mjs` | تركيب `/api/book` | الاختبار |

### لم يُمسّ

- **لا مخزن جديد ولا ترقية لقاعدة البيانات** (تبقى ٧): المواعيد في Blobs كالطلبات العامة،
  والمحوَّل منها يصير عميلًا ومهمة في مخازنها المعروفة.
- «اطلب معاينة» واستمارة الـQR كما هما — ثلاثة مداخل لثلاث حاجات، ولم تُدمج.
- بوابة الدخول: صفحة الحجز عامة كأخواتها، وقراءة المحجوز وحدها خلف الجلسة.

### اختُبر فعليًا

**٨٠٩ اختبارات ناجحة، صفر فشل** — منها ١٩ في `slots-unit.mjs` (التحويل إلى توقيت الرياض
عند منتصف ليل UTC · المهلة والأفق وأيام العمل · **دوام مقلوب لا ينتج شيئًا**)، و٢٤ في
`booking.mjs` على خادم مقفل بدوال حقيقية (مغلق حتى يُفتح · الوقت المحجوز يختفي وحجزه ثانيةً
يُردّ بـ٤٠٩ · **وقتٌ خارج الدوام مرفوض ولو أُرسل مباشرة إلى الدالة** · الفخّ · قراءة المحجوز
تحتاج جلسة · والتحويل ينشئ العميل ومهمته بموعدها ثم يُزيل الموعد).

---

## ٣٨. المرحلة ٣٠ — الصفحة العامة بالإنجليزية، وطرف Meta، والنطاق باسمك

آخر ثلاثة بنود من قائمتَي المقارنة (٨ و١٠ من الثانية، و٨ من الأولى).

### ١) الصفحة العامة بالإنجليزية — `offers/i18n.js`

> **تُترجَم واجهة الصفحة، ولا تُترجَم بياناتك.** اسم الحي وملاحظاتك تبقى كما كتبتَها،
> لأن الترجمة الآلية تُنتج أسماء لا يعرفها أحد ووصفًا قد يخالف ما تقصده.

| القرار | لماذا |
|---|---|
| النوع والغرض يُترجمان **بمفاتيحهما المدمجة وحدها** | نوعٌ أضفتَه أنت («استراحة») يبقى بمسمّاه — أصدق من ترجمة تُخترع له |
| اللقطة صارت تحمل `type` و`purposes` (مفاتيح) بجانب مسمّياتها | بلا المفتاح لا تُعرف اللغة الأصل من الترجمة |
| **الفرز على المفاتيح لا على النصّ المعروض** | لولاه لأفرغ تبديلُ اللغة الفرزَ القائم — وهو ما يُختبر صراحةً |
| اللغة تُحفظ في `localStorage` وتُقرأ من `?lang=` أولًا | الرابط يغلب الذاكرة، فمشاركة رابط إنجليزي تفتح إنجليزيًا |
| صفحة العرض الواحد تُبنى في الخادم فتقرأ `?lang=en` | وسوم المعاينة (Open Graph) تُقرأ قبل أي جافاسكربت |
| العربية هي الافتراض | سوقك عربي، والإنجليزية إضافة لا استبدال |

### ٢) طرف إعلانات Meta — `netlify/functions/meta-lead.js`

نموذج «عميل محتمل» في فيسبوك أو إنستقرام يصل إلى لوحة الطلبات نفسها.
**وهذا نصف الطريق:** النصف الآخر إعدادٌ عندك في Meta لا يستطيعه أحد نيابةً عنك —
تطبيق، وتوكن صفحة، واشتراك الصفحة بحدث `leadgen`، ومراجعة من Meta.

| القاعدة | لماذا |
|---|---|
| **بلا `META_APP_SECRET` تُرفض كل الحمولات** | نقطة عامة بلا توقيع تعني أن أي أحد يحقن عملاء في قاعدتك؛ والتعطيل الآمن أولى |
| التوقيع يُقارن **بمقارنة ثابتة الزمن** على الجسم الخام | المقارنة العادية تُسرّب السرّ حرفًا حرفًا بفروق التوقيت |
| رسالة الرفض واحدة (لا سرّ / توقيع خاطئ) | لا يُخبَر الطارق أيّهما |
| بلا `META_PAGE_TOKEN` يُحفظ **ما وصل فقط** موسومًا «الربط ناقص» بمعرّف النموذج | الحدث لا يضيع، ولا يُدّعى أن العميل وصل كاملًا |
| ما لا يُعرف من حقول النموذج **يُضمّ إلى الملاحظة كما جاء** | سطرٌ لا نفهمه أهون من بيانات عميلٍ تضيع |
| تاريخ السجل من **الحدث** لا من لحظة الحفظ | الحمولة قد تصل متأخرة |

المتغيّرات على Netlify: `META_VERIFY_TOKEN` · `META_APP_SECRET` · `META_PAGE_TOKEN`.

### ٣) النطاق باسمك (البند ٨ من القائمة الأولى) — **إعداد لا كود**

الكود جاهز له منذ المرحلة ٩: `publish.publicUrl` و`endpoint` نسبيّان، فكل الروابط
(العروض · العرض الواحد · الاستمارة · الحجز · رمز QR) تُبنى من `location.origin`.
فما إن يشير النطاق إلى الموقع حتى تصير كلها باسمك بلا سطر واحد.

الخطوات عندك: اشترِ النطاق ⇐ Netlify ← Domain management ← Add domain ⇐ اتبع سجلّات DNS
التي يعطيكها ⇐ انتظر السريان. ثم **أعد النشر مرّة** ليُبنى رمز QR على النطاق الجديد.

### الملفات المعدَّلة وسببها

| الملف | التعديل | السبب |
|---|---|---|
| `offers/i18n.js` | **جديد** — النصوص وخرائط المفاتيح واللغة المحفوظة | ١ |
| `offers/app.js` · `offers/index.html` · `offers/style.css` | التبديل والفرز بالمفاتيح والعرض بلغتين | ١ |
| `netlify/functions/offer.js` | صفحة العرض بلغتين مع وسومها | ١ |
| `pages/publish.js` | `type` و`purposes` في اللقطة | ١ |
| `netlify/lib/meta.js` | **جديد** — التحويل والتوقيع وقراءة المعرّفات (دوال خالصة تُختبر بلا حساب Meta) | ٢ |
| `netlify/functions/meta-lead.js` | **جديد** — المصافحة والاستقبال | ٢ |
| `tests/server.mjs` | تركيب `/api/meta-lead` وقيم بيئته | الاختبار |

### لم يُمسّ

- **لا مخزن جديد ولا ترقية لقاعدة البيانات** (تبقى ٧): طلبات Meta تُحفظ في `lead/` نفسه
  فتظهر في اللوحة القائمة بلا كود عرضٍ ثانٍ.
- استمارة الـQR وصفحة الحجز تبقيان بالعربية: مدخلاهما للعميل المحلي، وإضافة لغةٍ لهما
  تُقاس بالحاجة لا بالتناظر.
- لا ترجمة آلية ولا خدمة ترجمة — النصوص مكتوبة في ملف واحد يُراجَع.

### اختُبر فعليًا

**٨٥٣ اختبارًا ناجحًا، صفر فشل** — منها ١٦ في `meta-unit.mjs` (الاسم المجزّأ يُجمع ·
**حقلٌ مجهول يُضمّ ولا يُرمى** · التوقيع الصحيح والخاطئ والمبدَّل وبلا سرّ)، و٢٨ في
`english-meta.mjs` (الاتجاه واللغة والترجمة · **النوع المخصّص يبقى بمسمّاه** · الفرز يبقى
بعد التبديل · صفحة العرض بلغتين وصفحة «لم يعد متاحًا» · المصافحة تردّ التحدّي · وحمولة
مبدَّلة بتوقيع صحيح تُرفض · والطلب يصل موسومًا بنقص الربط وبتاريخ الحدث).

---

## ٣٩. المرحلة ٣١ — الاتفاقية، وجهات الاتصال، وضريبة الربع، وعائد المستثمر

أربع أفكار جديدة (الطبقة الأولى)، كلّها تسدّ ثغرةً موجودة لا تضيف بابًا جديدًا.

### ١) تنبيه انتهاء اتفاقية الوساطة — `util/agreements.js`

تطبع الاتفاقية بمدّتها منذ المرحلة ١٣ **ولا شيء يتتبّع نهايتها**. والعقار الذي انتهت
اتفاقيته قد تخسره: يسوّقه غيرك أو يبيعه المالك بلا عمولتك، وأنت لا تعرف.

| القرار | لماذا |
|---|---|
| حقلان على **العقار**: `agreementSignedAt` و`agreementDays` | المدّة تُحفظ في العقار لا تُقرأ من الإعدادات — تعديل الافتراضية اليوم يجب ألّا يغيّر اتفاقيةً وُقّعت بمدّةٍ أخرى |
| اللوحة تعرض **المنتهية والتي توشك** فقط، الأقرب انتهاءً أولًا | وهو ترتيب من تتصل بمالكه أولًا |
| **المبيع والمؤجَّر يخرجان** | اتفاقيةٌ على عقارٍ أُنجزت صفقته لا معنى لتجديدها |
| بلا اتفاقية = حالة معلنة (`none`) تُحصى ولا تُنبّه كل يوم | ثغرة تُعرض لا تُلحّ |

### ٢) تصدير جهات الاتصال (vCard) — `buildVCards`

الاستيراد موجود منذ المرحلة ١١ والتصدير لم يكن. فحين يتصل بك عميل يظهر رقمٌ مجهول وأنت
تملك اسمه. الملف يُبنى في متصفحك وتستورده في جوالك بنفسك.

> **ولا تُكتب فيه ملاحظاتك الداخلية عن العميل.** ما يُكتب في دفتر الهاتف يُقرأ في مواضع
> لا تتحكّم بها — فيُكتب الاسم والجوالان والوسوم والمصدر، لا أكثر.

وبادئة «كسّاب — » تميّز عملاءك عن جهاتك الشخصية، والفواصل والفواصل المنقوطة تُهرَّب
بقواعد vCard، والأسطر الطويلة تُطوى.

### ٣) ملخّص ضريبة القيمة المضافة للربع — `util/vat-report.js`

تُصدر فواتير ضريبية منذ المرحلة ١٩، ولم تكن شاشة تجمع ضريبة المخرجات لربعٍ لتقدّمها في
الإقرار — فتُجمع باليد، وهو أسوأ موضعٍ للخطأ.

> **بيانٌ من فواتيرك لا إقرار ضريبي ولا مشورة، ولا يُرسَل إلى أي جهة** — مكتوبًا في الشاشة.
> و**ضريبة المخرجات وحدها**: مصاريفك ليس فيها حقل ضريبة أصلًا، فادّعاء «صافي ضريبة» كذب.
> وعرض السعر ليس فاتورة فلا يدخل — القاعدة نفسها منذ المرحلة ١٧.

والفواتير بلا ضريبة داخل الربع **تُعدّ وتُذكر**، فلا يظنّ القارئ أن الضريبة نُسيت.

### ٤) حاسبة عائد المستثمر — `rentalYield`

«استثمار» غرضٌ في النظام منذ البداية ولم تكن له أداة. ثلاثة أرقام: العائد الإجمالي،
والصافي بعد المصاريف، ومدّة الاسترداد — مع نسبة إشغال تُدخلها.

**واسترشادية كأختها:** لا تغيّر قيمة، ولا تمويل، ولا ضريبة، ولا شغور غير ما تُدخله.
و**دخلٌ صفر لا يعطي مدّة استرداد لا نهائية** — يُعرض «—».

### الملفات المعدَّلة وسببها

| الملف | التعديل | السبب |
|---|---|---|
| `util/agreements.js` · `util/vat-report.js` | **جديدان** | ١ و٣ |
| `util/finance.js` | `rentalYield` | ٤ |
| `data/exchange.js` | `buildVCards` | ٢ |
| `data/schema.js` · `data/repository.js` | حقلا الاتفاقية وتطبيعهما | ١ |
| `pages/properties.js` | حقلا الاستمارة | ١ |
| `pages/today.js` | لوحة «اتفاقيات تنتهي» | ١ |
| `pages/settings.js` | زرّ تنزيل vCard | ٢ |
| `pages/invoices.js` | زرّ «🧾 ملخّص الضريبة» ونافذته | ٣ |
| `pages/pricing.js` | لوحة «وكم يعود عليّ؟» | ٤ |

### لم يُمسّ

- **لا مخزن جديد ولا ترقية لقاعدة البيانات** (تبقى ٧): حقلان على العقار بقيمة `null`،
  فعقاراتك القديمة تُقرأ كما هي بحالة «بلا اتفاقية».
- الفواتير نفسها لم تُمسّ: الملخّص **يقرأ ولا يكتب**، ولا يغيّر رقمًا في مستند.
- استيراد vCard كما هو، والتصدير إضافة مستقلة عنه.

### اختُبر فعليًا

**٩١٥ اختبارًا ناجحًا، صفر فشل** — منها ٣٩ في `agreements-vat-unit.mjs` (حالات الاتفاقية
الأربع · **مدّة العقار تغلب الافتراضية** · المبيع وغير المعتمد خارج القائمة · عرض السعر
والسنة الأخرى خارج ملخّص الضريبة · **الملاحظات الداخلية لا تُكتب في vCard** · ودخلٌ صفر
بلا مدّة استرداد)، و٢٣ في `agreements-vat.mjs` داخل متصفح حقيقي (اللوحة ترتّب الأقرب
انتهاءً أولًا · الملف يُنزَّل فعلًا ويُقرأ محتواه · نافذة الضريبة بتصريحها وأرقامها ·
ولوحة العائد تحسب ٥٫٤٪ ومدّة استردادها).

---

## ٤٠. المرحلة ٣٢ — التقويم، والذكرى، وتفضيلات التواصل، وتكرار العروض، والقفل

خمس أفكار جديدة (الطبقة الثانية) تُكمل القائمة.

### ١) التقويم الشهري وتصدير `.ics` — `util/calendar.js` + صفحة `#/calendar`

المهام والمعاينات والمتابعات والدفعات ونهايات العقود والاتفاقيات: **كلها بتواريخ وكلها
في قوائم متفرّقة**، ولا شهرٌ يُرى كاملًا. الصفحة تجمعها في شبكة واحدة.

> **لا تُنشئ ولا تُخزّن شيئًا:** كل حدث مقروء من سجلّه، والنقر يفتح مصدره — فلا مصدر
> حقيقة ثانيًا. و`.ics` **يُضاف مرّة ولا يتزامن**: تغيير الموعد عندنا لا يغيّره في تقويمك،
> وهذا مكتوب أسفل الصفحة.

والملف يتبع المواصفة: أوقات UTC، وأسطر `CRLF` مطويّة عند ٧٥ محرفًا، وفواصل مهرَّبة،
و**حدثٌ بتاريخ غير صالح يُتخطّى** بدل أن يُفسد الملف كله.

### ٢) ذكرى الصفقة السنوية — `dealAnniversaries`

أرخص مولّد إحالات في الوساطة: كلمةٌ في يومها. تظهر الصفقات التي مرّ عليها عام (±٧ أيام)
ولم تُهنَّأ. والرسالة — كأختها في المرحلة ٢٥ — **تُعرض قبل الإرسال ولا تُرسل نيابةً عنك**،
و«تخطَّ» توسمها فلا تعود.

### ٣) تفضيلات التواصل و«لا تتصل»

| القرار | لماذا |
|---|---|
| `doNotContact` **يُخرجه من «المتأخرون» و«ينتظرون ردّك»** | من طلب ألّا تتصل لا تُلحّ عليه لوحاتك |
| **ولا يُحذف ولا يُخفى**: يبقى في قوائمه وسجلّه بشارة حمراء | الاحترام ليس محوًا |
| `bestTime` يظهر في ملفه | أن تتصل في وقته أدعى أن يردّ |

### ٤) عرضٌ خارجي يشبه مخزونك — `externalDuplicates`

معناه أحد أمرين وكلاهما يستحق أن تعرفه: **وسيطٌ آخر يسوّق عرضك** (وربما بسعرٍ غير سعرك)،
أو أنك رصدتَ عقارك مرّتين فيُحسب مرّتين في مؤشر السعر.

> **الشرط ضيّق بقصد:** المدينة والحي والنوع نفسها، والمساحة والسعر ضمن ٥٪. وتوسيعه يُنتج
> تنبيهات كاذبة — والتنبيه الكاذب أسوأ من لا تنبيه. وغياب السعر في أحدهما لا يمنع الشبهة
> لكن اختلافه الكبير يمنعها.

### ٥) القفل التلقائي بعد خمول — `util/auto-lock.js`

بوابة الدخول تُفتح مرّة وتبقى مفتوحة، وجوالٌ على طاولة مجلس يعني **قائمة عملائك مكشوفة**.

| القرار | لماذا |
|---|---|
| **معطَّل افتراضيًا** (صفر = لا قفل) | لا نُقحم أمانًا لم يطلبه أحد |
| **إنذار قبل القفل** بزرّ «ابقَ مفتوحًا» | لا تُغلق الشاشة فجأةً على استمارة نصف مكتوبة |
| كل نشاط حقيقي (نقر · مفتاح · لمس · عودة للتبويب) يعيد العدّاد | الخمول هو المقياس لا مرور الوقت |
| **القفل تسجيل خروج فعليّ** (`/__logout`) لا شاشة فوق الصفحة | شاشةٌ تُخفي المحتوى بلا حذف الكوكي **أمانٌ موهوم** |
| الساعة تُحقن (`now`) | يُختبر المنطق بساعة وهمية لا بصبر الاختبار |

### الملفات المعدَّلة وسببها

| الملف | التعديل | السبب |
|---|---|---|
| `util/calendar.js` · `pages/calendar.js` | **جديدان** | ١ و٢ |
| `util/auto-lock.js` | **جديد** | ٥ |
| `util/duplicates.js` | `externalDuplicates` | ٤ |
| `data/schema.js` · `data/repository.js` | `doNotContact` و`bestTime` و`contactTimes` · `anniversaryGreetedAt` · تطبيعها | ٢ و٣ |
| `pages/today.js` | لوحة الذكرى · استبعاد «لا تتصل» من اللوحتين · **`formatNumber` الناقص** | ٢ و٣ |
| `pages/clients.js` | حقلا التفضيل وشارتاهما | ٣ |
| `pages/health.js` | لوحة العروض المشتبهة | ٤ |
| `pages/settings.js` | لوحة القفل | ٥ |
| `app.js` · `index.html` · `util/sidebar.js` · `css/components.css` | تسجيل التقويم وتشغيل القفل وأنماطهما | ١ و٥ |

### لم يُمسّ

- **لا مخزن جديد ولا ترقية لقاعدة البيانات** (تبقى ٧): ثلاثة حقول بقيم افتراضية.
- التقويم **يقرأ ولا يكتب**، ولا يُنشئ مهامًا ولا مواعيد.
- بوابة الدخول نفسها لم تُمسّ: القفل يستعمل `/__logout` القائم منذ المرحلة ٩.

### اختُبر فعليًا

**٩٧٩ اختبارًا ناجحًا، صفر فشل** — منها ٣٥ في `calendar-lock-unit.mjs` (الشبكة والأحداث
الستّة وما يُستبعد منها · صحّة ملف `.ics` وتهريبه · نافذة الذكرى وحدودها · شروط الشبهة
الخمسة)، و٢٩ في `calendar-lock.mjs` داخل متصفح حقيقي (الصفحة والتنقّل والتصدير الذي
**يُنزَّل ويُقرأ محتواه** · الذكرى و«تخطَّ» · «لا تتصل» يخرج من «يومي» ويبقى في قائمته ·
لوحة العروض المشتبهة بفرق السعر · والقفل **ينذر ثم يقفل**، و«ابقَ مفتوحًا» يمنعه —
بساعة وهمية لا بانتظار حقيقي).

---

## ملحق: حالة المقترحات بعد المرحلة ٣٢

| القائمة | البنود | الحالة |
|---|---|---|
| المقارنة الأولى (٩ بنود) | ١–٧ و٩ | ✅ المراحل ٢٣–٢٥ |
| | ٨ — النطاق باسمك | ✅ الكود جاهز، والإعداد على المالك (القسم ٣٨) |
| المقارنة الثانية (١٠ بنود) | ١ و٣ و٥ | ✅ المرحلة ٢٦ |
| | ٢ · ٤ · ٦ · ٧ · ٨ · ٩ | ✅ المراحل ٢٧–٣٠ |
| | ١٠ — إعلانات Meta | ✅ الطرف عندنا (القسم ٣٨)، والربط في Meta على المالك |
| الأفكار الجديدة (٩ بنود) | ١–٤ | ✅ المرحلة ٣١ |
| | ٥–٩ | ✅ المرحلة ٣٢ |

**ولا يزال خارج النطاق بأسبابه المعلنة:** تكامل «إيجار»/«عقاري» الرسمي · التوقيع الإلكتروني ·
بوابة السداد · بوت واتساب · تفريغ المكالمات · OCR · البريد التسويقي — ربطٌ رسمي أو ترخيص
أو اشتراك مدفوع، لا قرارات برمجية.

---

## ٤١. المرحلة ٣٣ — لماذا لم يصل شيء إلى الجوال، ومسار نشرٍ لا يعتمد على أحد

### التشخيص (لا التخمين)

قرأتُ حالة المشروع من Netlify مباشرة. النشرة المنشورة اليوم هي نفسها منذ ١٤ سبتمبر
(`6aa7c61a`، المرحلة ١٦)، وفيها الحقل الفاصل:

```
"deploy_source": "api",   "manual_deploy": false,   "has_source_zip": true
```

**مصدرها `api` لا `git`.** أي أنها رُفعت رفعًا، ولم يُطلقها بناءٌ من GitHub. ولو كان ربط
المستودع يعمل لظهرت نشرات مصدرها `git` عند كل دفع — ولا توجد ولا واحدة منذ ذلك اليوم.
فالخلل في **الخطّاف (webhook) الذي يُطلق البناء**، لا في الكود ولا في `netlify.toml`.

ومحاولة النشر من هذه الجلسة تُردّ قبل أن تبلغ Netlify أصلًا:
`CONNECT tunnel failed, response 403` لكل نطاقات Netlify — **سياسة شبكة الجلسة** لا صلاحية
الحساب. فلا أستطيع الرفع بنفسي، والصدق هنا أنفع من محاولةٍ تُعاد.

### الحلّ: النشر من GitHub Actions — `.github/workflows/deploy.yml`

GitHub هو من ينشر، بمفتاحٍ تملكه أنت، **فلا يبقى الأمر معلّقًا على ربطٍ انقطع**.

| القرار | لماذا |
|---|---|
| المفاتيح **أسرارُ مستودع** لا قيمٌ في الملف | توكن النشر في ملفٍ عام يعني أن ينشر مكانك من شاء |
| خطوة تتحقّق من السرّين وتوقف بخطأ يسمّي الناقص | **لا فشل صامت**: أسوأ من عدم النشر أن تظنّه نشر |
| `npm install` لا `npm ci` | لا ملف قفل في المستودع (التطبيق بلا أداة بناء، والتبعيتان للدوال وحدها) |
| رسالة الالتزام تُمرَّر **متغيّرَ بيئة** لا استبدالًا نصّيًا | نصٌّ يكتبه بشر ويُحقن في سطر صدفة بابُ تنفيذٍ لما ليس منه |
| `concurrency` يلغي النشرة السابقة | دفعتان متلاحقتان: الأحدث تكفي |
| `workflow_dispatch` | زرّ يدوي يعيد النشر بلا دفع جديد |

### ما جرى فعلًا (١٥ سبتمبر ٢٠٢٦)

**عاد النشر التلقائي من Netlify يعمل.** أول نشرة ناجحة بعد الانقطاع: `c29ddfa` في
٠٩:٠٢:٤٧، حملت **١٢ دالة** (كانت ثمانيًا) والصفحتين الجديدتين `offers/book.html`
و`offers/intake.html` — أي أن المراحل ١٧–٣٣ كلها صارت حيّة. وفحص الأسرار في النشرة:
**صفر تطابق**، فلا سرَّ تسرّب في الملفات المنشورة.

ولذلك صار هذا المسار **احتياطيًا لا أوّليًا**، و**لا يفشل حين لا يجد المفتاح** — يمرّ
بملاحظة. فالفشل الأحمر عند كل دفعة وأنت لا تحتاجه ضجيجٌ يُعلّمك تجاهل الإشارة، حتى إذا
جاء فشلٌ حقيقي لم تنظر إليه.

### لتشغيل المسار الاحتياطي (إن انقطع الربط ثانيةً) — **سرٌّ واحد**

1. **Netlify** ← صورتك ← User settings ← Applications ← Personal access tokens ← New token، وانسخه.
2. **GitHub** ← المستودع ← Settings ← Secrets and variables ← **Actions** ← تبويب **Secrets**
   ← **New repository secret**: الاسم `NETLIFY_AUTH_TOKEN` والقيمة التوكن.
3. تبويب **Actions** ← «نشر إلى Netlify» ← Run workflow (أو ادفع أي تعديل).

**ومعرّف المشروع مكتوب في الملف صراحةً لأنه ليس سرًّا** — يظهر في رابط لوحة Netlify نفسها،
ولا يفعل به أحدٌ شيئًا بلا التوكن. وإخفاؤه كان يضاعف مواضع الخطأ بلا فائدة.

> **أشيع ثلاثة أخطاء** (والفحص صار يسمّيها في السجل بدل «ناقص»):
> ١) التبويب **Variables** بدل **Secrets** — وهما في الصفحة نفسها.
> ٢) تبويب **Codespaces** أو **Dependabot** بدل **Actions**.
> ٣) **Environment secret** بدل **Repository secret** — الأول لا تراه الوظيفة ما لم تُعلن بيئتها.

**وبديلٌ أبسط إن فضّلته:** Netlify ← المشروع ← Build & deploy ← Continuous deployment ←
أعد ربط المستودع؛ فيُعاد تركيب الخطّاف ويعود البناء التلقائي. والمساران لا يتعارضان،
وإبقاء الاثنين يعني نشرةً مضاعفة لا ضرر فيها غير دقيقة بناء.

### لم يُمسّ

- **لا كود تطبيق تغيّر في هذه المرحلة**: ملف واحد في `.github/workflows` وقسمٌ في هذا العقد.
- `netlify.toml` كما هو: النشر بلا أمر بناء، والدوال من مجلدها — وقد تحقّقتُ أنه سليم.
- أسرار النشر لا تدخل المستودع ولا هذا الملف: المعرّف وحده عامّ (وهو ليس سرًّا).

---

## ٤٢. المرحلة ٣٤ — هوية ضاد على الموقع كلّه

### القرار الأول: ضاد **لا تفرض شكلًا** — فهويّة كسّاب باقية

أول ما تقوله ضاد لمن يصمّم بها: «حافظ على هوية المشروع وخطه وألوانه وما يعمل فيه جيدًا».
فلم يتغيّر الأخضر `#0f6e56`، ولا الخلفية الرملية، ولا شكل القائمة الجانبية، ولا اسمُ صنفٍ
واحد في CSS. وما تغيّر هو **المقاييس تحت ذلك**: سلّم مسافات واحد بدل أرقامٍ متفرّقة
(`8px` هنا و`10px` هناك و`14px` هناك)، وارتفاع سطرٍ يحمي التشكيل، ومساحة لمسٍ لا تقلّ عن
٤٤ بكسلًا، وتركيزٌ يُرى، وحالاتٌ تفاعلية كاملة، ولونٌ دلاليٌّ سادس كان ناقصًا.

ولهذا **لم يُكسر شيء**: الاختبارات التسعمئة والثلاثة والثمانون التي كانت تمرّ قبل التصميم
مرّت بعده بلا تعديل واحد فيها.

### البنية: رموزٌ في ملف، ومكوّناتٌ تشير إليها

`css/dhad.css` **رموزٌ لا تخطيط** — لا قاعدة فيه ترسم عنصرًا. وفيه سلّم القياس والمسافة
والقطر والزمن والطبقات، والألوان الدلالية، وخطُّ `IBM Plex Sans Arabic` بأربعة أوزان
محليّة (لا من شبكة خارجية). ثم يشير إليه `base.css` بالأسماء القديمة:

```css
--accent: var(--dhad-color-action);
```

وهذا هو ما جعل التصميم تصميمًا لا إعادةَ كتابة: عشرات القواعد تكتب `var(--accent)` منذ
المرحلة الأولى، ولو غُيّرت الأسماء لتغيّر المشروع كلّه — ومعه كل اختبار يعتمد على صنف.

### الخطّ: أربعة أوزان محليّة، ولماذا لا ثمانية ولا شبكة خارجية

`system-ui` في العربية يعني على أندرويد وويندوز خطًّا لا يُحسن التشكيل. و`IBM Plex Sans
Arabic` مفتوح الرخصة (OFL) ويُحسنه. ونُقل **من الجهاز لا من CDN**: التطبيق يعمل دون اتصال،
وخطٌّ من شبكةٍ خارجية يعني صفحةً بخطّين — واحدٌ في المكتب وواحدٌ في السيارة.

وأربعة أوزان (٤٠٠ · ٥٠٠ · ٦٠٠ · ٧٠٠) لا ثمانية: التطبيق لا يستعمل غيرها، و٣٠٠ كيلوبايت
أهون من ٦٠٠ على من يفتح النظام على بيانات جواله. و`font-display: swap` كي يُقرأ النصّ بخطّ
النظام ريثما يصل الخط، فلا تبيضّ الصفحة لحظةً.

### أربع علل حقيقية كشفها التصميم

**١) قواعد ميتة لصفحةٍ لا تصلها.** `.slot-btn` و`.booking-days` — أزرار مواعيد صفحة الحجز
العامة — كانت مكتوبة في `components.css`. وذلك الملف **خلف بوابة الدخول**، وصفحة الحجز
عامّة لا تُحمّله أصلًا. فكان من يحجز موعدًا يرى أزرارًا بلا تنسيق، والتنسيق مكتوبٌ في ملفٍ
لا يصله. نُقلت إلى `offers/style.css` حيث تُقرأ فعلًا.

**٢) لونٌ ثابت يكسر الوضع الليلي.** `.table tbody tr:hover { background: #f6f8f5 }` — رقمٌ
فاتحٌ ثابت. فكان صفّ الجدول تحت المؤشّر **يبيضّ في الوضع الليلي** ويكاد نصُّه يختفي. صار
`var(--hover)` يتبع الوضع. وفي الاختبار قاعدةٌ تمنع عودته.

**٣) مربّع اختيار يُخطئه الإصبع.** `.card-pick` — مربّع اختيار البطاقة للمقارنة — كان ٢٠
بكسلًا معلَّقًا فوق الصورة: لا تسمية حوله تكبّره، ومربّع الاختيار عنصرٌ مستبدَل يتجاهل
الحشو. فكانت الضغطة تُخطئه فتفتح البطاقة بدل أن تختارها. رُسم بأنفسنا: صندوقٌ شفاف ٤٤×٤٤
تحت الإصبع، ومربّعٌ ٢٢ في وسطه تحت العين.

**٤) مزلاقٌ ارتفاعه ١٦.** `.range` في صفحة المطابقات: يصيبه المؤشّر ويخطئه الإصبع، فيسحب
الصفحةَ بدل أن يسحب المقبض. صار صندوقه ٤٤.

**٥) عطلة الأسبوع خارج الشاشة** (كشفتها المعاينة البصرية لا الاختبار). التقويم يرث من
`.table` عرضًا أدنى ٩٠٠ بكسل، وذاك صوابٌ في جدول بيانات لا يُعرف عدد أعمدته — أما التقويم
فسبعة أعمدة معلومة. فكان **الجمعة والسبت** يقعان خارج الشاشة على الآيباد وعلى الجوّال،
خلف تمريرٍ أفقيٍّ لا يظهر منه شيء. صار `min-width: min(620px, 100%)`: لا يتجاوز الجدول
حاويته أبدًا، فالأسبوع كامل في كل مقاس، ويقصر نصُّ الموعد بدل أن يغيب يومان — ولا يضيع
بالقِصَر شيء، فلكل موعدٍ `title` فيه تاريخه وعنوانه كاملًا ونقرةٌ تفتح سجلّه.

> وهذه الخامسة درسٌ في حدّ الاختبار الآلي: فحصُ «لا فيض أفقي» كان يمرّ، لأن الفيض كان
> **داخل** `.table-wrap` لا في الصفحة — وذلك سلوكٌ مقصود في الجداول. لم يكشفها إلا النظر
> إلى لقطةٍ بالعين. فصار لها فحصٌ يقيس عرض الجدول مقابل عرض حاويته، ويتحقّق أن «الجمعة»
> و«السبت» بينهما.

### ما أضافته ضاد إلى كل مكوّن

| القاعدة | قبل | بعد |
| --- | --- | --- |
| ارتفاع السطر | ١٫٦ | ١٫٧ للمتن (يحمي الهمزة والتشكيل)، ١٫٥٥ للواجهة الكثيفة |
| مساحة اللمس | ٣٨ للحقل، بلا حدٍّ للزرّ | ٤٠ على الفأرة و**٤٤ على الإصبع** (`pointer: coarse`) |
| التركيز | ٢ بكسل | ٣ بكسلات بفجوة — وعلى زرّ القائمة الذي كان تسميةً لا يصلها تركيز |
| الحالات | `:hover` فقط | `:hover` و`:active` و`:focus-visible` و«محدَّد» |
| «المحدَّد» | لونٌ وحده | لونٌ **وعلامةٌ أو شريط** — فمن لا يميّز الأخضر يرى الشكل |
| الألوان الدلالية | فعل · نجاح · تنبيه · خطأ | ومعها **المساعدة** (بنفسجي): الشرح لا يلبس لباس التنبيه |
| الجزر اللاتينية | `unicode-bidi: embed` | `isolate` — عزلٌ في الاتجاهين للجوال والبريد والرقم |
| الحركة | ثابتة | مدَدٌ تُصفَّر عند `prefers-reduced-motion` |

### هويّةٌ واحدة داخل البوابة وخارجها

كانت صفحة العروض العامة تكتب ألوانها ومقاييسها بنفسها (`#f7f8f6` لا `#f2f4f1`، وقطرٌ
`14px`…) لأنها **خلف البوابة لا تستطيع تحميل ملفات التطبيق**. فصار `/css/dhad.css`
و`/assets/fonts/*` **مستثنيَين من البوابة** (`excludedPath` في `gate.js`): لا سرَّ في لونٍ
ومقاسٍ وحرف، والمكوّنات تبقى محميّة كما كانت. ولبستها **صفحةُ الدخول** أيضًا — وهي أول ما
يراه صاحب النظام كل شهر.

### الاختبار: ما يُقاس بالإصبع لا ما يُقرأ في CSS

`tests/design-dhad.mjs` — ٤٣ فحصًا في متصفح حقيقي، وأكثرها يقرأ من `getComputedStyle`
و`getBoundingClientRect` لا من نصّ CSS: **قاعدةٌ مكتوبة قد تدهسها قاعدةٌ أخرى، والمقاس
المحسوب هو ما يراه صاحب الجهاز**. ويسأل ما يسأله المستعمل بيده:

- **الرموز تصل**: سلّم المسافات كامل، واللمس ٤٤، والتركيز ٣، والأخضر لم يتغيّر، والخطّ
  **نُزّل فعلًا** (`document.fonts` تقول `loaded` لا مجرّد اسمٍ في CSS).
- **نصٌّ مشكَّل لا يُقصّ**: تُحقن فقرةٌ فيها «أَهْلًا بِكَ فِي كَسَّابٍ» ويُقاس `scrollHeight`.
- **الاتجاه**: القائمة على اليمين فعلًا (حافّتها اليمنى تلامس حافّة النافذة)، والجوال جزيرة
  `isolate`.
- **مساحة اللمس في **كل** الصفحات التسع عشرة** على جهازٍ يُلمس: كل زرٍّ وحقلٍ ورابط —
  و**التسمية** هي ما يُقاس لمربّع الاختيار، فهي ما يُلمس فعلًا.
- **لا فيض أفقي** على ٣٩٠ و٧٦٨ و١٠٢٤ و١٤٤٠.
- **التقويم يسع أسبوعه**: عرض الجدول لا يتجاوز حاويته، و«الجمعة» و«السبت» بين أعمدته.
- **الوضع الليلي**: يُلتقط من النظام، والتبديل اليدوي يغلبه في الاتجاهين، ولا لونَ فاتحٍ
  ثابتٍ يتسرّب.
- **الصفحة العامة**: بالخطّ نفسه والأخضر نفسه وسطر القراءة نفسه.
- **صفر خطأ في Console** عبر كل ذلك.

والمستثنى من قياس اللمس مستثنًى بحجّة لا بتسامح: نسبةُ الخريطة إلى Leaflet وOpenStreetMap
(حقٌّ أدبيّ لصاحب الخريطة لا زرٌّ لنا، ويُكتب صغيرًا في كل موقعٍ يستعملها)، وخلايا التقويم
وأزرار الصور المركَّبة (ولكلٍّ بديلٌ أكبر في الصفحة نفسها)، والحقول المخفيّة بصريًّا التي
تسميتُها `<label class="btn">` هي الزرّ الظاهر — وقد قيست مع بقيّة الأزرار.

### الملفات المعدَّلة وسببها

| الملف | لماذا |
| --- | --- |
| `css/dhad.css` | **جديد** — رموز ضاد: القياس والمسافة والقطر والزمن والطبقات، والألوان الدلالية الستّ، وخطّ Plex بأربعة أوزان |
| `assets/fonts/*.woff2` | **جديد** — الخط محليًّا (٤ أوزان، ٣١٢ ك.ب) ومعه رخصة OFL |
| `css/base.css` | الأسماء القديمة تشير إلى رموز ضاد؛ سطر ١٫٧؛ تركيز ٣؛ مساحة لمس في القائمة؛ `env(safe-area-inset-*)`؛ حالات القائمة الجانبية |
| `css/components.css` | مساحة اللمس والحالات التفاعلية لكل مكوّن؛ إصلاح لون الجدول الليلي و`.card-pick` و`.range` وعرض التقويم؛ نقل القواعد الميتة؛ لون المساعدة |
| `offers/style.css` | الهوية نفسها عبر رموز ضاد؛ حقول وأزرار ٤٤؛ جزر لاتينية؛ واستقبال قواعد صفحة الحجز المنقولة |
| `index.html` | ربط `dhad.css` وتحميل وزنَي الخط مسبقًا |
| `offers/{index,intake,book,list}.html` | ربط `dhad.css` |
| `netlify/functions/offer.js` | ربط `dhad.css` في صفحتَي العرض المولَّدتين |
| `netlify/edge-functions/gate.js` | استثناء `/css/dhad.css` و`/assets/fonts/*` من البوابة؛ وصفحة الدخول تلبس الهوية |
| `sw.js` | رفع رقم المخزن إلى `kassab-v3` وإضافة الملف والخطوط إلى قائمة التثبيت |
| `tests/design-dhad.mjs` | **جديد** — ٤٣ فحصًا للهوية والمقاييس واللمس والاتجاه والحالات والتقويم والوضع الليلي |
| `tests/run.mjs` | تسجيل الحزمة الجديدة |

### لم يُمسّ

- **لا منطق تطبيقٍ واحد تغيّر**: لا `js/pages/*` ولا `js/data/*` ولا `js/util/*` — انظر
  الجدول أعلاه، ليس فيه ملف منطق واحد.
- **لا نصَّ عربيًّا واحدًا تغيّر**: لا عنوان صفحة ولا تسمية حقل ولا رسالة تنبيه.
- **لا اسمَ صنفٍ حُذف ولا غُيّر** — ولهذا مرّت الاختبارات القديمة كما هي.
- **لا ميزةَ حُذفت ولا أُضيفت**: هذه مرحلة تصميم لا مرحلة ميزات.
- `DB_VERSION` والمخازن كما هي: التصميم لا يمسّ بيانات.
- `netlify.toml` كما هو: بلا أمر بناء، والنشر من الجذر.

### ما جرى فعلًا

- **`node tests/run.mjs` — ١٠٢٦ ناجح · ٠ فاشل** (٩٨٣ قديمة بلا تعديل + ٤٣ جديدة).
- **`node --check` على ١٥٥ ملف JS** — كلها سليمة (وهذا أقوى فحصٍ ساكنٍ في مشروعٍ بلا
  ESLint ولا TypeScript، وليس فيه أيٌّ منهما بقصدٍ منذ المرحلة الأولى).
- **`npm install --omit=dev`** — نجح، صفر ثغرة. وهذا هو «البناء» كلّه: `netlify.toml` بلا
  أمر بناء، والتطبيق يُنشر كما هو.
- **معاينة بصرية فعلية** بلقطات على جوّال (٣٩٠) وآيباد (٧٦٨) وسطح مكتب (١٤٤٠) ووضعٍ ليلي
  وصفحةٍ عامة — لا اكتفاءً بمرور الاختبارات.

---

## ٤٣. المرحلة ٣٥ — أربعة عشر بندًا: سبعةٌ تُخرِج ما كان مدفونًا، وسبعةٌ تُصلح ما كان مكسورًا

### أ — سبعُ لوحاتٍ من بياناتٍ تُجمع ولا تُقرأ

الخيط الجامع: **لا مخزن جديد ولا طرف خارجي ولا اشتراك**. كلّها سجلاتٌ موجودة منذ مراحل.

| البند | ما كان | ما صار |
|---|---|---|
| **شهادة السوق على العقار** | `showingStats` تُستدعى **مرّة واحدة في المشروع كلّه** (الداشبورد) على المعاينات مجتمعة، و`properties.js` لا يذكر المعاينات إطلاقًا | لوحةٌ لكل عقار تجمع ما قاله من رآه ومن رفضه، **وتفصل بينهما**، وتُطبع في تقرير المالك |
| **طلبات عادت** | `matches.js` يرشّح `status === 'active'` وحدها | المخزون الجديد يُطابَق على الطلبات الموقوفة خلال سنة |
| **فتح قائمته ولم يتصل** | عدّاد الفتحات عمودٌ في صفحةٍ لا تُفتح إلا للنشر | لوحةٌ في «يومي» |
| **رحلة السعر** | `priceHistory` يُكتب ولا يُقرأ إلا داخل حسابات السعر | يُعرض للعقار، ومجموعًا: كم يومًا بِعتَ بعد التخفيض وأي نسبةٍ باعت |
| **لماذا يتركك الناس** | يُعرف سبب رفض عرضٍ بعينه، ولا يُعرف سبب موت الطلب | حقلٌ عند الإيقاف، ولوحةٌ تفرز ما بيدك |
| **الاتصال في وقته** | `bestTime` يُحفظ ويُعرض شارةً ولا يستعمله شيء | يُقدَّم من وقتُه الآن — ولا يُؤخَّر أحد |
| **كلفة المصدر** | المصروف لا يعرف مصدره | حقلٌ واحد حوّل التقرير من عدٍّ إلى ربح |

**والفصل بين الشهادتين هو لبّ الأولى**: من رآه ثم قال يحكم على **العقار** (حالته، غرفه،
شارعه)، ومن رفض قبل أن يرى يحكم على **إعلانك** (سعرك المكتوب، صورك، وصفك). وخلطهما يضيّع
الدلالة، والعلاج مختلف. ولا حكمَ على عيّنة دون ثلاثة آراء، ولا ما لم يجتمع أكثرها على سبب.

### وخطأٌ في فهمي كشفه المتصفح

كتبتُ `REVIVABLE_STATUSES = ['closed', 'archived']`، وحالات الطلب في المخطّط **`active` و
`paused` و`done`**. فكان «طلبات عادت» لا يوقظ شيئًا أبدًا، وكان سؤال «لماذا انتهى؟» يقع
على صفقةٍ تمّت. صُحّحا إلى `paused` وحدها: و«مُنجز» صاحبه اشترى، ومكالمةٌ تعرض عليه ما
اشتراه مثله إساءةٌ لا فرصة.

### ب — سبعُ علل

**١) النسخة السحابية تتوقّف عن الحماية بصمت.** `backup.js` يضع الصور كلها في النسخة،
و`uploadBackup` يرفعها في **طلبٍ واحد** إلى دالة Netlify — ولا فحص حجمٍ في أي موضع.
فبعد عشرين عقارًا بصورها يتجاوز الرفعُ الحدّ فيفشل، وصاحبه يحسب نسخته محفوظة.
صار: **البيانات يوميًّا** (مئات الكيلوبايت، لا تفشل)، **والصور أسبوعيًّا في كتلٍ** لكلٍّ
معرّف دفعة، وحدٌّ مفحوصٌ في المتصفح **وفي الدالة** برسالةٍ بالأرقام.

> وتحت هذا عطبٌ أخطر: `importBackup` كان يمرّ على المخازن كلها ويضع `[]` لما لم يجده —
> فيمسحه. فنسخةُ بياناتٍ بلا صور كانت **تمحو مكتبة الصور كلّها** عند استرجاعها. صار
> المخزن الغائب عن النسخة **لا يُمسّ**، وهو يصلح عطبًا أقدم: نسخةٌ أُخذت قبل وجود مخزنٍ
> كانت تمحوه.

**٢) جهازان يمحو أحدهما الآخر.** `restoreBackup` يستبدل كل شيء. صار الطريق المعتاد
**«دمج»**: الأحدث يفوز لكل سجلٍّ بـ`updatedAt` (وهو مكتوبٌ في كل سجلّ منذ البداية، فلا
بنية جديدة)، وسلّة المحذوفات شواهدُ حذفٍ فلا يُحيي الدمجُ ما حذفتَه، والإعدادات لا تُدمج.
و«استبدال» بقي لجهازٍ جديد أو بياناتٍ أفسدتها — **ويقول قبله بالأرقام** كم سجلًّا أحدث
سيمحو وتاريخَ آخر عملٍ هنا.

**٣) مقترحي كان خطأً، والتصحيح أنفع.** قلتُ «الطلب الجديد لا يُنبَّه عليه» بناءً على قراءة
`push-tick.js` وحده — **وهو ينبَّه عليه فورًا منذ المرحلة ٢٢** (`notifyAll` في `lead.js`،
ومثلها الحجز وطلب الإعلان وفتح القائمة). والناقص أن **تنبيهًا واحدًا يضيع**: يصل الحادية
عشرة ليلًا فتصحو وقد ذهب. فصار: **ملاحقةٌ** في المهمّة المجدولة (بعد نصف ساعة وبعد أربع،
ثم تُترك — والملاحقة التي لا تنتهي تُعلّمك تجاهلها)، **ولوحةٌ في «يومي»** إذ كان الطلب لا
يُرى بعدها إلا في صفحة النشر.

**٤) الوصولية.** رابط تخطٍّ، و`aria-current="page"` على الصفحة المفتوحة، ومنطقةٌ حيّة
تُعلن اسم الصفحة (فالموجّه لا يُحمّل صفحةً فيبقى القارئ صامتًا)، و`scope` على رؤوس الجداول
— يُوضع **مرّة بعد كل رسم** لا في عشرين صفحة يُنسى في الحادية والعشرين.

**٥) سجلّ «ماذا تغيّر ومتى».** حقولٌ مختارة لا كلّ شيء، آخر عشرين تغييرًا، مكتوبةٌ **في
المستودع** فتشمل كل مسار تعديل، وعلى السجل نفسه كنمط `priceHistory` — فتدخل النسخ والدمج
بلا سطرٍ إضافي فيهما.

**٦) الأداء: قيسَ ثم عولج ثم أُعيد القياس.**

| الصفحة | قبل | بعد |
|---|---|---|
| العقارات | ٣٦٣٨ مِلّي · **٩٥٬٣٥٣ عنصرًا** | **١٢٠ مِلّي · ٣٬٨٧٩** |
| العملاء | ٢١٦٨ مِلّي · ٢٨٬١٩٤ | **٨٣ مِلّي · ٢٬٨٥١** |
| يومي | ٨٩٥٥ مِلّي — يبني **٦١١٬٨٠٧ مرشّحًا** ليعرض ثمانية | **١٤٩ مِلّي** |
| المطابقات | — | **٢٩١ مِلّي** |

على ٥٠٠٠ عقار و٢٠٠٠ عميل و٣٠٠ طلب نشط. والعلاج: حدّ الرسم في القوائم (والفرز والبحث
والعدّ تبقى على المجموعة كاملة)، وحدّ الطلبات المفحوصة في «يومي» بترتيب أولوية العميل
نفسه، وحدّ الصفوف في المطابقات، و`limit` في `candidatesFor`.

> **وتحذيرٌ في القياس نفسه:** أول قياسٍ أعطى المطابقات ٩٫٩ ثانية — لأن بياناتي كانت خمسة
> آلاف فلّةٍ **متطابقة** في المدينة والنوع والغرض، وذلك يُفشل فهرس القواطع (المرحلة ٢٠)
> فيمرّ كل طلبٍ على الخمسة آلاف. وبمخزونٍ متنوّع كمخزون مكتبٍ حقيقي صارت ٢٩١ مِلّي.
> فبياناتُ القياس تكذب كما يكذب القياس.

**٧) حساب المساعد — وحدّه معلَن.** الكوكي تحمل الدور **موقَّعًا مع المدّة** (`expires.role.mac`)
لا المدّة وحدها، وإلا بدّل المساعدُ دورَه بيده وبقي التوقيع صالحًا. والشكل القديم يُقرأ
مالكًا فلا تُبطل الترقيةُ كوكي قائمة.

> **ولا يُدَّعى فصلُ بيانات.** التطبيق يعمل على IndexedDB في هذا المتصفح، فمن فتح الجهاز
> وصل إلى ما فيه مهما أخفت الواجهة. فالحساب ثلاثة أشياء صادقة: **بابٌ ثانٍ** تسحبه وحده،
> و**حجبٌ في الواجهة** بآلية «وضع العرض للعميل» القائمة، و**منعٌ حقيقي على الخادم**
> (الخزنة السحابية تُرفض بدور المساعد — في الدالة نفسها لا في زرٍّ مخفيّ). وفصلُ البيانات
> فعلًا يحتاج خادمًا يحفظها ويصرّح بها سجلًّا سجلًّا، وذلك تحوّلٌ في البنية لا إعداد.

### الملفات المعدَّلة وسببها

| الملف | لماذا |
| --- | --- |
| `js/util/property-evidence.js` · `revived-requests.js` · `list-opens.js` · `call-timing.js` | **جديدة** — محرّكات أ١–أ٦، دوال خالصة |
| `js/util/history-view.js` · `render-cap.js` · `public-api.js` · `role.js` | **جديدة** — ب٤–ب٧ |
| `js/util/sources.js` | كلفة المصدر وصافيه؛ والمصروف بلا وسم لا يُقسَّم تخمينًا |
| `js/data/repository.js` | `recordHistory` للحقول المتتبَّعة |
| `js/data/backup.js` | تصديرٌ بلا صور · **المخزن الغائب لا يُمسّ** · `mergeBackup` · `restoreRisk` |
| `js/data/vault.js` | حدّ الحجم · كتل الصور · `mergeFromVault` · `inspectBackup` |
| `js/data/matching.js` | `limit` في `candidatesFor` — لا تُبنى كائناتٌ لما سيُرمى |
| `js/data/schema.js` | `closeReason` على الطلب · `source` على المصروف |
| `js/data/settings.js` | `lastImagesAt` |
| `js/app.js` | `aria-current` · المنطقة الحيّة · `scope` · دور المستعمل · رفع الصور أسبوعيًّا |
| `js/pages/{properties,clients,matches,today,dashboard,opportunities,requests,expenses,client,settings}.js` | اللوحات والحقول والحدود |
| `js/util/property-print.js` | شهادة السوق في تقرير المالك |
| `netlify/edge-functions/gate.js` | كلمة سرّ المساعد ودورٌ موقَّع |
| `netlify/lib/auth.js` · `netlify/functions/me.js` | `roleOf` · `forbidden` · نقطة «من أنا» |
| `netlify/functions/vault.js` | حدّ الحجم · كتل الصور · المنع بالدور |
| `netlify/functions/push-tick.js` | ملاحقة الطلب الذي لم يُردَّ عليه |
| `index.html` · `css/components.css` | رابط التخطّي · المنطقة الحيّة · أنماط اللوحات الجديدة |
| `tests/{evidence-revival-unit,evidence-revival,role-unit,scale-perf}.mjs` | **جديدة** — ٩٥ فحصًا |

### لم يُمسّ

- **لا مخزن جديد ولا `DB_VERSION` تغيّر**: كل ما أُضيف حقولٌ على سجلاتٍ قائمة.
- **لا طرف خارجي ولا اشتراك**: كل البنود من بياناتك وخادمك.
- **لا ميزة حُذفت**: حدّ الرسم يقصر المعروض ولا يحذف شيئًا، والفرز والبحث والعدّ على
  المجموعة كاملة.
- **لا كلمة سرّ قائمة تغيّرت**: الكوكي القديمة تبقى صالحة وتُقرأ مالكًا.

### ما جرى فعلًا

- **`node tests/run.mjs` — ١١١٧ ناجح · ٠ فاشل** (١٠٢٢ سابقة + ٩٥ جديدة).
- **`node --check` على ١٦٨ ملف JS** — كلها سليمة.
- **`npm install --omit=dev`** — صفر ثغرة.
- **قياس أداءٍ حقيقي** قبل العلاج وبعده، ببياناتٍ متنوّعة وبأخرى متطابقة، والفرق بينهما
  موثَّق أعلاه.

---

## ٤٤. المرحلتان ٣٦ و٣٧ — ديونٌ سُدِّدت، ومدنٌ، وأساسُ سبعة تكاملات تنتظر اعتماداتها

### المرحلة ٣٦ — أربعة ديون، وعطبٌ كشفه اختبارها

**١) الوعد كان أوسع من المنفَّذ.** قلتُ إن وضع المساعد يُخفي «العمولات وأرقام المالك»،
وكان `data-sensitive` موسومًا في **ثمانية مواضع في صفحتين**: اسم المالك وجوّال العميل
وملاحظاتك — **ولا موضعَ عمولة واحد**. فكان المساعد يرى أرباحك، و«وضع العرض للعميل» كذلك.

> وخُلْفُ الوعد في حجبٍ أسوأ من غياب الحجب: على الغياب تحترس، وعلى الوعد تطمئنّ.

صارت لوحات المال في «يومي» والداشبورد موسومة، **وصفحتا الفواتير والمصاريف تُمنعان في
الموجّه** لا بإخفاء رابطٍ وحده: إخفاء رابطٍ ليس منعًا، والعنوان يُكتب باليد.

**٢) شاهد الحذف يعيش أطول من السجل.** السلّة تحفظ السجل كاملًا ثلاثين يومًا؛ والدمج بين
جهازين يحتاج أن يعرف «أن هذا حُذف» ولو بعد سنة. فصار التقليم **يُفرّغ السجل ويُبقي سطرًا**
(معرّف ومخزن وتاريخ) أربعمئة يوم. ألفُ شاهدٍ منها أقلّ من صورةٍ واحدة.

**٣) وكشف اختبارُ ذلك عطبًا أقدم منه.** `clients.remove` مكتوبةٌ بنفسها لقواعد الارتباط،
و**تتجاوز السلّة** التي تحفظ فيها `remove` المشتركة منذ المرحلة ٢١. فكان حذف عميلٍ **بلا
رجعة**، وطلباته معه. صارا يُحفظان.

**٤) نقل الإعدادات صار قرارًا صريحًا.** الدمج لا يمسّها بقصد، فكان جهازٌ جديد تصله البيانات
بلا قوالبك ولا خططك ولا بيانات مكتبك. وزرٌّ ثالث ينقلها — **وعبارة الخزنة السرّية لا
تُنقل**: تخصّ هذا الجهاز، وكتابةُ عبارة جهازٍ آخر فوقها عطب.

### وعشر مدنٍ غير الرياض

جدة · مكة · المدينة · الدمام · الخبر · أبها · خميس مشيط · الطائف · بريدة · تبوك.

**وصدقُ القوائم متفاوتٌ ومعلَن في رأس الملف**: الرياض أوفاها (١٥١ حيًّا بقطاعاتها الخمسة)،
وبقيّتها **مسوّدةٌ أولى** بأشهر الأحياء لا كلّها. ولا تُقسَّم غير الرياض على قطاعات:
تقسيمٌ أخترعه أنا أسوأ من نطاقٍ واحد تقسمه أنت بمعرفتك بمدينتك.

> وأثرُ ذلك ليس قائمةً أطول: **مؤشّر سعر المتر يُحسب بالحي**، وبلا أحياء موحّدة الكتابة
> تتفرّق العيّنة على «الحمراء» و«حي الحمراء» و«الحمرا» فلا تبلغ عيّنةٌ حدَّ الدلالة.

### المرحلة ٣٧ — أساس سبعة تكاملات

سبعةٌ كانت خارج النطاق لأنها **ترخيصٌ أو اشتراكٌ أو ربطٌ رسمي**. وهذا يبني نصفَها الذي
يخصّنا: المحوّل، والحالة، والمكان الذي يقف فيه المفتاح حين يصل.

**والقاعدة الحاكمة: لا تكاملَ يدّعي أنه يعمل وهو لا يعمل.** بلا مفاتيح يردّ كلٌّ منها
`not_configured` ومعه **أسماء المتغيّرات الناقصة بالضبط** — لا «خطأ ما»، ولا نجاحٌ صامت،
ولا بيانات وهمية تملأ الشاشة. وميزةٌ تتظاهر بالعمل أخطر من ميزةٍ غائبة: على الغائبة
تُخطّط، وعلى المتظاهرة تَبني.

**والأسرار لا تنزل إلى المتصفح.** متغيّرات بيئة على Netlify، والتطبيق يسأل «أمُهيَّأ؟»
فيُجاب بنعم أو لا — لا بقيمة المفتاح. فلا يدخل مفتاحٌ قاعدةَ بياناتك ولا نسخَك ولا شاشتك.

| التكامل | الحالة | ما ينقص |
|---|---|---|
| **إيجار** | ⚙️ **يعمل جزئيًّا الآن بلا اشتراك** | — |
| التوقيع الإلكتروني | ينتظر مفتاحًا | `ESIGN_API_BASE` · `ESIGN_API_KEY` |
| بوابة السداد | ينتظر مفتاحًا | `PAYMENTS_API_BASE` · `PAYMENTS_API_KEY` · `PAYMENTS_CURRENCY` |
| واتساب للأعمال | ينتظر مفتاحًا | `WHATSAPP_PHONE_ID` · `WHATSAPP_TOKEN` |
| تفريغ الصوت | ينتظر مفتاحًا | `TRANSCRIBE_API_BASE` · `TRANSCRIBE_API_KEY` · `TRANSCRIBE_MODEL` |
| قراءة المستندات | ينتظر مفتاحًا | `OCR_API_BASE` · `OCR_API_KEY` · `OCR_MODEL` |
| البريد التسويقي | ينتظر مفتاحًا | `MAIL_API_BASE` · `MAIL_API_KEY` · `MAIL_FROM` |

### وإيجار: الصدق أنفع من الوعد

منصّة «إيجار» تابعة للهيئة العامة للعقار **ولا تفتح واجهةً برمجية عامة** يُسجَّل بها من أي
تطبيق. فالوعد بالتسجيل الآلي وعدٌ لا يُوفى، ومكتوبٌ ذلك في الصفحة نفسها لا في حاشية.

والذي يُوفى — وهو أكثر ما يختصر الوقت على كل حال — **حزمة العقد**: كل حقلٍ يطلبه العقد
مجموعًا من سجلاتك في ورقةٍ تُنسخ مرّة واحدة، بدل التنقّل بين أربع شاشات تنسخ رقمًا رقمًا.
**وما ينقص يُقال ولا يُملأ بتخمين**: حقلٌ فارغ أهون من رقم صكٍّ اخترعناه لك.

ولها ثلاثة حقول جديدة كانت تُكتب في الملاحظات فلا تُبحث ولا تدخل عقدًا: **رقم الصك** على
العقار، و**رقم الهوية** على العميل، و**رقم الوسيط المعتمد** في بيانات المكتب.

### الملفات المعدَّلة وسببها

| الملف | لماذا |
| --- | --- |
| `netlify/lib/integrations.js` | **جديد** — سجلّ السبعة: متغيّراتها وإجراءاتها ومحوّلاتها |
| `netlify/functions/integrations.js` | **جديد** — الحالة والتنفيذ، للمالك وحده |
| `js/data/integrations.js` · `js/pages/integrations.js` | **جديدان** — الدليل بخطواته، والصفحة |
| `js/util/ejar-package.js` | **جديد** — حزمة العقد، تعمل بلا اشتراك |
| `js/data/saudi-cities.js` | **جديد** — عشر مدن، بصدقٍ متفاوت معلَن |
| `js/data/repository.js` | شواهد الحذف · **السلّة عند حذف العميل وطلباته** |
| `js/data/backup.js` · `vault.js` | `importSettings` ونقلها قرارًا صريحًا |
| `js/data/schema.js` | `deedNumber` · `nationalId` · حقول رابط السداد |
| `js/data/settings.js` | المدن العشر · `licenseNumber` |
| `js/app.js` | `OWNER_ONLY_ROUTES` · مسار التكاملات |
| `js/pages/{dashboard,today}.js` | لوحات المال موسومة حسّاسة |
| `js/pages/{client,clients,properties,invoices,settings}.js` | الحقول الجديدة · حزمة إيجار · رابط السداد |
| `js/util/audio-note.js` · `js/data/audio.js` | تفريغ الصوت نصًّا |
| `tests/server.mjs` | يخدم الدالتين الجديدتين — وبدونها كان الاختبار يقيس ٤٠٤ لا التكامل |

### وعطبٌ ثالثٌ كشفته اللقطة لا الاختبار

«كفّ عن السؤال» (المرحلة ٣٥) كان **علَمًا واحدًا للجميع**: أوّلُ ٤٠١ من أي مسار يُسكِت
البقيّة كلّها. فصفحة «يومي» تسأل عن الطلبات فتُردّ، فلا تعود صفحةُ التكاملات تسأل عن
حالتها أصلًا وتبقى فارغةً بلا سبب ظاهر. وذلك خلطٌ بين «هذا المسار مرفوض» و«لا فائدة من أي
سؤال». صار **لكل مسارٍ علَمُه**، ومعه زرٌّ يُصفّرها في صفحة التكاملات — فجلسةٌ انتهت لا
تترك صاحبها أمام صفحةٍ لا يعرف كيف يُحييها.

> ولم يكشفها اختبار: الاختبارات كانت تمرّ كلّها. كشفتها **لقطةٌ نظرتُ إليها** فوجدت
> الصفحة فارغةً وهي يجب أن تمتلئ. وهذه ثالثة مرّةٍ في هذه الجلسة يكشف فيها النظرُ ما
> أخطأه الفحص الآلي.

### لم يُمسّ

- **لا مفتاحَ ولا سرَّ في المستودع** ولا في قاعدة البيانات ولا في النسخ الاحتياطية.
- **لا تكاملَ يعمل بلا اعتماده**: كلٌّ يردّ بما ينقصه، ولا يعرض بيانات وهمية.
- **لا `DB_VERSION` تغيّر**: الحقول الجديدة حقولٌ على سجلاتٍ قائمة.
- منطق المطابقة والتسعير والقمع كما هو.

### ما جرى فعلًا

- **`node tests/run.mjs` — ١١٧٠ ناجح · ٠ فاشل** (١١١٧ سابقة + ٥٣ جديدة).
- **`node --check` على ١٧٧ ملف JS** — كلها سليمة.
- **`npm install --omit=dev`** — صفر ثغرة.

## ٤٥. المرحلة ٣٨ — خمس عشرة طلبة: ما بُني كما طُلب، وما له حدٌّ يُقال

طلبٌ من المالك في خمس عشرة نقطة. نُفِّذت كلّها. وثلاثٌ منها لها **حدودٌ مادّية** لا تُذلَّل
بالكود، فمكتوبةٌ هنا وفي الصفحات نفسها قبل أوّل ضغطة، لا في حاشيةٍ تُكتشف بعد الفشل.

### ١) فلتر «الكل» في كل فلتر

`allChip(set, values, onChange)` في `js/util/dom.js`: ضغطةٌ تُحدّد الكلّ، وثانيةٌ تمسحها،
وحالته تتبدّل بتبدّل التحديد. طُبّق في العقارات والعملاء والعروض الخارجية والطلبات
والخريطة والمطابقات وجمهور حملة واتساب.

**وعطبٌ صنعه هذا التغيير وكُشف:** `money-and-health` كانت تضغط `.filters .chip` **بموضعه**
لا باسمه، فصار «الكل» أوّلَ الصفّ فتضغطه الحزمة وهي تظنّها تضيّق النتائج. صُحِّح المحدِّد
(`:not(.chip-all)`) لا الميزة.

### ٢) المصاريف صارت «المالية»، ومعها الإيرادات

مخزنٌ جديد `incomes` (‏`DB_VERSION` ٧ ← ٨) وستّ فئاتٍ للدخل غير العمولة — أبرزها **إدارة
الأملاك**. والصفحة صارت بنوعين في مفتاحٍ واحد، والداشبورد يحسب **صافيًا حقيقيًّا**:
`العمولات + الإيرادات − المصاريف`. وكان قبلها يعرض نصف الصورة: كلَّ ما خرج ولا شيء ممّا
دخل بغير عمولة.

ومعها لوحة **مراحل الصفقات**: أين تقف صفقاتك في مسارها، وأيُّ خطوةٍ يقف عندها أكثرها.

### ٣) الفواتير: بنودٌ جاهزة ونسبةُ وساطةٍ في مكانها

البنود من الإعدادات (`invoiceProducts`) اختيارًا بضغطة — استشارة، عقد إيجار، إدارة أملاك،
تقييم، تسويق — **وتبقى قابلة للتعديل في المستند**: القالب لا يحبس مستندًا.

والنسبة كانت تُقرأ من الإعدادات ولا تُرى في الفاتورة، فمن أراد تغييرها لفاتورةٍ واحدة
خرج وغيّرها **للمستندات كلّها**، أو حسبها بيده. صارت تُحسب في مكانها: سعر الصفقة × نسبتك،
**والنسبة هنا لا تُحفظ في الإعدادات** — فتعديلُ فاتورةٍ لا يغيّر ما بعدها.

### ٤) «المعرّف» صار يوزرًا يُقرأ ويُنطق

سطرٌ من ٣٦ حرفًا لا يُملى في هاتف. صار `u` وستّة محارف مشتقّةً من المعرّف نفسه اشتقاقًا
ثابتًا — والكامل تحت الضغط ينسخه من أراده. **ولم يتغيّر المخزَّن**: السجلّات ما زالت
موسومةً بالمعرّف الكامل، وهذا عرضٌ له لا بديلٌ عنه.

### ٥) الخريطة: اللون صار معنًى يُختار

كانت تلوّن بالحالة وحدها، فالبائعُ والمؤجِّر والأرضُ والشقّة نقطةٌ واحدة اللون. صار
**اللون بحسب**: الحالة، أو الغرض (بيع/إيجار/استثمار)، أو النوع (أرض/فلة/دور/شقة، وما
تضيفه أنت بلونٍ ثابتٍ مشتقٍّ من مفتاحه).

ودليلُ الألوان تحتها **يُضغط فيُفرز به** — ومعه العدد — والفرز نفسه يظهر في شريط الفلاتر:
مصدرٌ واحد لا اثنان يفترقان. **واللون لا يُترك وحده دالًّا**: اسمه مكتوبٌ بجانبه، والغرض
مكتوبٌ في نافذة كل نقطة، فيقرؤه من لا يفرّق بين الأخضر والأحمر.

### ٦) تجميع نقاط الخريطة — كان موجودًا، وقد فُحص

التجميع بالمسافة البكسلية مكتوبٌ منذ المرحلة ٦ ويعمل فوق ١٥ علامة. لم يُبنَ من جديد، **بل
فُحص**: ٢٧ نقطة تلتئم عند التصغير، ومجموعُ ما في التجمّعات والمفردة يساوي ٢٧ بلا ضياع
نقطة، وأكبرُ تجمّعٍ ينفرط عند التكبير.

### ٧) إدارة الأملاك: صفحةٌ ووسمٌ وخيارٌ عند الإضافة

عملٌ غير الوساطة: الوساطة تنتهي بالصفقة، والإدارة تبدأ بعدها. `property.management`
(بدايةٌ ونهايةٌ ونوعُ أجرٍ وقيمته) يُكتب **في نموذج العقار نفسه** — وحقولُه لا تظهر إلا
لمن أشّر عليه، فلا يُثقَل من لا يُدير شيئًا.

وصار **مجموعة فرزٍ** في صفحة العقارات (تحت إدارتنا / ليست)، **وعمودًا يُرتَّب به** في
الجدول. والصفحة تجمع عقد الإدارة (من العقار) بالإيجار ودفعاته (من الصفقة) فتقول: ما
انتهى عقده، وما يوشك، وأيُّ دفعةٍ فاتت، وكم مجموع الأجر الشهري — **وما أجرُه غير معلوم لا
يدخل المجموع صفرًا يُضلّل**. والأجر موسومٌ `data-sensitive` كالعمولة.

### ٨) «إضافة الصور» صارت «إضافة الوسائط»

مقاطع الفيديو تُضاف مع الصور في نموذج العقار. **وتُحفظ كما هي بلا ضغط** — وهذا قولٌ صريح:
ضغط المقطع في المتصفّح إعادةُ ترميزٍ كاملة تستغرق دقائق وتُفقد الجودة، فلا يُدَّعى ولا
يُفعل خلسةً. ولذلك حدٌّ معلن (٦٠ م.ب) يُقال **قبل** الاختيار لا بعد الحفظ، ويُلتقط للمقطع
إطارٌ صورةً للعرض.

**وثلاثة مواضع صُحّحت لئلّا يظهر المقطع حيث لا يصلح:**

- غلاف البطاقة صار **أوّلَ ما يصلح صورةً** لا أوّل الوسائط — وإلّا بقي مربّعٌ فارغ.
- `getImageUrl(id, {thumb:true})` لمقطعٍ بلا إطارٍ ملتقط يعيد `null` لا الـblob نفسه —
  كان يُوضع في `<img>` فلا يظهر شيء ولا يُعلَم السبب.
- الطباعة والصفحة العامة **صورٌ فقط**: الورقة لا تشغّل مقطعًا، ومقطعٌ بـ٦٠ م.ب يُرفع إلى
  الصفحة العامة يساوي مئاتِ الصور. وعمود الصور في صفحة النشر يقول «(+١ مقطع لا يُنشر)»
  صراحةً، فلا يُظنّ أنّه نُشر.

### ٩) صفحة ختم الصور والمقاطع

شعاراتٌ متعدّدة تُحفظ وتُسمّى وتُحذف متى شئت · قوالبُ أنماطٍ محفوظة · **أنماطٌ متعدّدة على
الصورة نفسها** (شعارٌ كبير في الوسط وآخر صغير في الزاوية) · موضعٌ (الوسط، الزوايا الأربع،
مكرَّرًا على الصورة كلّها) · حجمٌ وشفافيّةٌ بمزلاجَين ومعاينةٌ حيّة · دفعاتٌ بالعشرات ·
ربطٌ بعرض · واحتفاظٌ مؤقّت (يومان/ثلاثة/أسبوع) أو دائم.

ثلاثة قراراتٍ مكتوبةٌ في الصفحة قبل أوّل ضغطة:

1. **الأصل لا يُمسّ**: الختم يُحرق في نسخةٍ جديدة، فمن أخطأ في الشفافية أعاد من الأصل.
2. **المؤقّت افتراضًا**، والحذف **يُنفَّذ** عند فتح الصفحة ويُقال عدده — تاريخُ انتهاءٍ بلا
   كنّاسٍ يمرّ عليه وعدٌ كاذب.
3. **الحجم بالنسبة لا بالبكسل**: صورةٌ ٤٠٠٠ بكسل وأخرى ٨٠٠ تأخذان الختم نفسه في العين.

**وحذف الشعار لا يُتلف ما خُتم به** — الختم محروقٌ في الصورة لا معلَّقٌ بالملف.

**والمختوم المؤقّت لا يدخل نسخةً احتياطية** — لا الملفَّ المحلّي ولا الخزنة السحابية.
وهذا عطبٌ كان سيقع لولا أن نُظر فيه: المختوم يُخزَّن في مخزن الوسائط نفسه، ونسخُ الوسائط
يأخذه كلَّه. فمن يختم ثلاثين صورةً كلَّ يوم كانت نسختُه الأسبوعية تمتلئ **بما هو ذاهبٌ
إلى الحذف بأمره هو**، ثم يُعيده الاسترجاعُ حيًّا بعد أن مات. القرار في `worthBackingUp`
مشتركًا بين الاثنين، فلا يفترق الملفُّ عن السحابة. والدائمُ يُنسخ كغيره: اختارَ صاحبُه
بقاءه.

#### الحدّ الأول: لصق الروابط يحتاج خادمًا، وله سياجه

المتصفّح يعرض صورة موقعٍ آخر **ولا يسمح بقراءة بكسلاتها**؛ وأيّ محاولةٍ لتصديرها من
`canvas` تُرفض. فالرابط يُجلب من `/api/fetch-media` فتصل الصورة من نطاقنا فتُختم. وحدوده
ليست زينة: **للمالك وحده** (لئلّا يصير الموقع وسيط تحميلٍ للناس)، وhttps فقط، وصورٌ فقط،
و١٢ م.ب، ومهلةُ ١٢ ثانية — **والعناوين الداخلية ممنوعة صراحةً** (المضيف المحلّي والشبكات
الخاصّة و`metadata.google.internal`)، وإلّا صارت الدالّة بابًا يقرأ ما خلف جدار الخادم.

#### الحدّ الثاني: ختم المقطع ليس كختم الصورة

الصورة تُرسم مرّةً وتُصدَّر في جزءٍ من الثانية. والمقطع صورةٌ في كل إطار، فلا سبيل إلى حرق
الشعار فيه إلا بإعادة ترميزه كاملًا — وما في المتصفّح لذلك واحدٌ: تشغيلُه على `canvas`
وتسجيلُ الناتج. وهذا يعني ثلاثة أمورٍ **مكتوبةٍ في الصفحة**: الوقتُ بالوقت (مقطع دقيقتين
يأخذ دقيقتين)، والصيغةُ تصير WebM، والجودةُ تنقص. ومن لم يُرِد هذا فله بديلٌ أصدق: ختمُ
صورةٍ من المقطع وإرسالُها معه.

### ١٠) التاريخ الهجري مع الميلادي — في المصدر لا في الصفحات

واحدٌ وخمسون موضعًا يستدعي `formatDate`. فبدل تعديلها موضعًا موضعًا — ويُنسى واحدٌ فيبقى
نصفُ البرنامج بتقويمٍ ونصفُه بآخر — أُضيف الهجري **في `formatDate` و`formatDateTime`
نفسيهما**، فوصل إلى الجميع دفعةً: الجولات، والتقويم، والمالية، والفواتير، والسجلّات.

- التقويم المعتمد **أمُّ القرى** (`islamic-umalqura`) لا الحسابيّ المجرَّد — والفرق بينهما
  يومان في التاريخ المفحوص، ويومٌ في موعدٍ أو عقد.
- **عرضٌ لا تخزين**: كلُّ ما يُحفظ يبقى ISO ميلاديًّا، فلا شيء يتغيّر في البيانات ولا في
  النسخ الاحتياطية.
- في التقويم: عنوانُ الشهر بالشهرين الهجريَّين معًا (الميلاديّ يقع عليهما غالبًا)، ورقمٌ
  هجريٌّ في كل خانة. **والفاصل بينهما نصٌّ في الصفحة لا زخرفةَ CSS** — المولَّد لا يُنسخ
  وقد يتخطّاه قارئ الشاشة، فيُقرأ اليومان رقمًا واحدًا «١١٩».
- في نموذج الجولة: حقل التاريخ في المتصفّح ميلاديٌّ لا يُبدَّل، فيُكتب ما اخترتَه هجريًّا
  تحته لحظةً بلحظة.
- ومفتاحٌ في الإعدادات يُطفئه فيعود كلُّ تاريخٍ كما كان، **بلا إعادة تحميل**.

### ١١) أمرٌ بالصوت في كل صفحة

زرٌّ ثابتٌ لا يسمع شيئًا حتى تضغطه. **والمسموع يُكتب، والفعل يُوصف بالعربية، ثم يُنفَّذ** —
لأنّ التعرّف على الصوت يخطئ، خصوصًا في السيارة، فتنفيذُ ما سُمع مباشرةً يفتح ما لم تُرِد.

يفهم: فتح أيّ صفحة («افتح العقارات»، «روح للعملاء» — واللام موصولةٌ بالكلمة كما تُقال)،
والبحث («ابحث عن سعد»)، والإنشاء («عقار جديد»)، والمظهر، والرجوع.

**وحدُّه يُقال صراحةً**: هذا نحوٌ ثابتٌ يفهم صيغًا معدودةً، لا مساعدًا يفهم كلَّ ما تقول.
فهمُ الكلام الحرّ يحتاج نموذجًا لغويًّا باشتراك، وهو مُعدٌّ في «التكاملات» ولم يُوصَل بعد.
وحتى يُوصَل، «لم أفهم — قل: افتح العقارات» أصدقُ من تخمينٍ يفتح صفحةً لم تُرِدها.
**وكلُّ ما هنا يجري في جهازك**: لا يُرسَل صوتُك ولا نصُّه إلى خادمنا.

**وفحصٌ ضبط نقصًا قبل أن يصل إليك:** أضفتُ صفحة واتساب إلى القائمة الجانبية ونسيتُ
اسمها المنطوق، فكانت «افتح واتساب» تقول «لم أفهم». والفحص لا يسأل عن أمرٍ بعينه، بل
يقارن **قائمة الصفحات كلَّها** بما يعرفه النحو — فصفحةٌ تُضاف غدًا بلا اسمٍ منطوق تسقط
الحزمةُ من أجلها. وكذلك كلُّ مثالٍ معروضٍ في «ماذا أقول؟» يُفحص أنّه مفهومٌ فعلًا، فلا
تُعرض أمثلةٌ لا تعمل.

**وعطبٌ حقيقيّ كشفه الاختبار:** «عقار جديد» وأنت في صفحة العملاء كانت تفتح **نموذج
العميل**: الصفحة القديمة تبقى في DOM حتى يُعاد الرسم، وفيها زرُّ إضافةٍ رئيسيٌّ كذلك،
فالضغط المتعجّل يصيبه. صار الضغط ينتظر **تبدّل الصفحة فعلًا** لا مضيَّ وقت.

### ١٢) صفحة واتساب: وارِدٌ وحملة

- **الوارد**: `/api/whatsapp` عنوانٌ واحد يخدم مصافحة التحقّق التي تطلبها Meta، واستقبالَ
  الرسائل، وسردَها للمالك. والرسالة تُربط بصاحبها إن كان في عملائك، وإلّا أُضيف بضغطة.
- **الحملة**: قالبٌ معتمَد يُرسل إلى جمهورٍ تختاره بتصنيفات العملاء (وفيها «الكل»)، بسجلٍّ
  لكل مُرسَلٍ إليه. **وأوّل فشلٍ بسبب نقص التهيئة يوقف الحملة** — لا معنى لتكرار الفشل مئة
  مرّة.

**والتوقيع ليس تفصيلًا**: Meta توقّع كلّ رسالةٍ واردة بـ`X-Hub-Signature-256`، وبلا تحقّقٍ
منه **يستطيع أيُّ أحدٍ في الدنيا أن يدسّ في صندوقك رسائل باسم عملائك**. فبلا
`WHATSAPP_APP_SECRET` تُرفض الرسائل كلّها **ويُقال السبب**: بابٌ بلا قفلٍ لا يُفتح لأنّه
«مؤقّت». والمقارنة بزمنٍ ثابت لا بـ`===` — المقارنة العادية تُسرّب طول البادئة الصحيحة.

**وقيدٌ من واتساب لا منّا**: لا يبدأ المكتب رسالةً حرّة — يبدؤها بقالبٍ تعتمده Meta. وقوالبُ
النسخ اليدوي في الإعدادات تبقى كما هي، تعمل بلا اشتراك.

### وعطبٌ رابع كشفه الفحصُ نفسه: حزمةٌ تنهار فتُقرأ خضراء

`tests/run.mjs` كان يحسب الحزمة ناجحةً ما دام سطرُ `PASS` واحدٌ قد طُبع:
`bad = r.fail > 0 || (r.code !== 0 && r.pass === 0)`. فحزمةٌ تنهار بعد خمسة عشر نجاحًا
تسقط بقيّتُها **صامتةً** وتُقرأ خضراء.

وكان ذلك واقعًا فعلًا: `rename-and-vault.mjs` تنهار منذ مدّةٍ عند فحص **«ما يصل الخادم
كتلةٌ مشفَّرة لا تحوي بياناتك»** — أهمِّ فحصٍ في الخزنة السحابية — فلا يُنفَّذ أصلًا. والسبب
أنّ الحزمة تقرأ مفتاح النسخة **قبل** التدوير، والتدوير يُبقي آخر خمسٍ فيُسقط أوّلَ ما رُفع.

صُحّح الاثنان: كلُّ خروجٍ بغير صفر صار فشلًا يُعدّ ويُطبع سببه، والحزمة تقرأ المفتاح بعد
التدوير. **والفحص يعمل الآن ويمرّ.**

### الملفات المعدَّلة وسببها

| الملف | لماذا |
| --- | --- |
| `js/util/map-colors.js` | **جديد** — معاني ألوان الخريطة ودليلها |
| `js/util/hijri.js` | **جديد** — أمّ القرى: يومًا وشهرًا ومدًى، مع تحقّقٍ فعليّ من دعم البيئة |
| `js/util/management.js` | **جديد** — الأجر وحالة العقد والمتأخّر، من العقار وصفقته |
| `js/util/watermark.js` | **جديد** — الختم بالنسبة لا بالبكسل، وختمُ المقطع بحدوده المعلنة |
| `js/util/voice-commands.js` | **جديد** — نحوٌ ثابت، وحروف الجرّ الموصولة كما تُنطق |
| `js/util/voice-bar.js` | **جديد** — الزرّ الثابت: يُري ما سُمع ويصف ما سيفعل |
| `js/data/stamp.js` | **جديد** — الشعارات والقوالب والاحتفاظ والكنس |
| `js/pages/{management,stamp,whatsapp}.js` | **جديدة** — الصفحات الثلاث |
| `netlify/functions/fetch-media.js` | **جديد** — جلب الروابط بسياجه (SSRF, https, صورٌ فقط) |
| `netlify/functions/whatsapp.js` | **جديد** — المصافحة والتوقيع والسرد |
| `js/util/format.js` | الهجري في المصدر، ومفتاحُ إطفائه |
| `js/util/dom.js` | `allChip` |
| `js/data/images.js` | المقاطع: حفظٌ بلا ضغط، وإطارٌ للعرض، و`firstStillId`/`splitMedia`/`worthBackingUp` |
| `js/data/backup.js` · `js/data/vault.js` | المختوم المؤقّت لا يدخل نسخةً — ملفًّا ولا سحابة |
| `js/data/schema.js` | `incomes` · `incomeCategories` · `property.management` |
| `js/data/adapters/indexeddb.js` | `DB_VERSION` ٨ — مخزن الإيرادات |
| `js/data/repository.js` | `cleanManagement` · «إدارة أملاك» في مفتاح البحث |
| `js/data/settings.js` | `userHandle` · `invoiceProducts` |
| `js/pages/map.js` | مبدّل المعنى · الدليل المضغوط · الغرض في النافذة |
| `js/pages/properties.js` | الوسائط · قسم الإدارة · مجموعة الفرز · العمود · الغلاف الصالح |
| `js/pages/publish.js` | المقاطع لا تُنشر، ويُقال ذلك في العمود |
| `js/pages/calendar.js` · `tours.js` | التقويمان في العنوان والخانة والبطاقة والنموذج |
| `js/pages/invoices.js` | البنود الجاهزة ونسبة الوساطة |
| `js/pages/settings.js` | اليوزر · مفتاح الهجري بمثالٍ حيّ |
| `js/pages/expenses.js` · `dashboard.js` | الإيرادات والصافي ومراحل الصفقات |
| `js/util/property-print.js` | الورقة لا تشغّل مقطعًا |
| `netlify/lib/integrations.js` | `envOptional` — الناقص الاختياريّ يُقال منفصلًا |
| `js/app.js` · `js/util/sidebar.js` · `index.html` | ثلاث صفحاتٍ جديدة · الهجري قبل أوّل رسم · شريط الصوت |
| `css/{components,dhad}.css` | الدليل المضغوط · الوسائط · الختم · الصوت · التقويمان |
| `tests/run.mjs` | **الانهيار صار فشلًا يُعدّ** — لا حزمةَ تسقط صامتة |
| `tests/rename-and-vault.mjs` | المفتاح يُقرأ بعد التدوير — فيعمل فحص التشفير أخيرًا |
| `tests/server.mjs` | يخدم الدالّتين الجديدتين، ويضبط متغيّرَي واتساب |

### لم يُمسّ

- **لا مفتاحَ ولا سرَّ في المستودع** ولا في IndexedDB ولا في النسخ الاحتياطية.
- **لا تكاملَ يتظاهر بالعمل**: ما نقصه متغيّرٌ يقول اسمه بالضبط وأين يُكتب.
- **التخزين ميلاديٌّ كما كان**: الهجري عرضٌ فقط، ولا حقل تاريخٍ تغيّر.
- منطق المطابقة والتسعير والقمع وعمولة الصفقات كما هو.
- قوالب الرسائل اليدوية في الإعدادات كما هي — تعمل بلا اشتراك.

### ما جرى فعلًا

- **`node tests/run.mjs` — ١٤٠٠ ناجح · ٠ فاشل** (١١٧٠ سابقة + ٢٣٠ جديدة في تسع حزم).
- **`node --check` على ١٩٩ ملف JS** — كلّها سليمة.
- **`npm install --omit=dev`** — صفر ثغرة، ولا حزمة جديدة (الختم والهجري والصوت كلّها
  بما في المتصفّح، بلا مكتبةٍ واحدة تُضاف).
- **فحصُ الأسرار على `js/` و`netlify/` و`css/` و`index.html`** — ولا مفتاحَ مكتوب.
- **ونُظر إلى الصفحات في متصفّحٍ حقيقيّ لا إلى الفحص وحده** — فكُشف أنّ زرّ الصوت يقف فوق
  القائمة الجانبية (في العربية `inset-inline-start` يمينٌ لا يسار)، وأنّ وسم «تُحذف
  بعد…» يمتدّ فيُقصّ، وأنّ عنوان الوِبهوك كان يختفي مع الحالة وهو لا يعتمد عليها.

## ٤٦. المرحلة ٣٩ — «لصق عرض عميل»، وعطبان في قراءة المبالغ

طلبٌ واحد: مثلُ «لصق رسالة عميل» في الطلبات، في صفحة العقارات. نُفِّذ — وكشف في طريقه
عطبَين في المحلّل القائم كانا يكتبان **أرقامًا خاطئة صامتة** في سجلّاتك منذ المرحلة ١١.

### الزوج المتقابل

| | الطلبات (المرحلة ١١) | العقارات (الآن) |
| --- | --- | --- |
| من يرسل؟ | **يطلب** | **يعرض** |
| ماذا يُنشأ؟ | باحثٌ وطلبُه | مالكٌ وعقارُه |
| الحي | **عدّة** («الياسمين أو النرجس») | **واحد** (العقار في حيٍّ واحد) |
| السعر | **سقفُ ميزانية** | **سعرٌ مطلوب** |
| الغرض | **واحد** | **مجموعة** (قد يبيع أو يؤجّر) |

والفرق ليس في الحقول بل في **معانيها** — ولذلك لم يُنسخ المحلّل: `parseOfferText` يستدعي
`parseListingText` نفسه ثم يعيد تفسير ما قرأ. ولو نُسخ لانحرف أحدهما عن الآخر بعد شهر.

وقارئ اسم المرسِل كان محبوسًا داخل `parseRequestText`، فأُخرج إلى `parseSenderName`
مشتركًا: الاسم يتوقّف عند أوّل فعل — ولم تكن أفعالُ العرض فيه («عندي»، «أملك»، «أبيع»)،
فكان «انا سعد عندي فلة» ليصير اسمًا من أربع كلمات.

### ما يُقرأ زيادةً: رقم الصك

المالك يكتبه في رسالته كثيرًا، وكان يذهب إلى الملاحظات نصًّا حرًّا فلا يُبحث فيه ولا يدخل
حزمة عقد. صار حقلًا يُقرأ ويُملأ.

### وتمييزُ الرسالة: يُقال ولا يُخمَّن

رسالةُ باحثٍ لُصقت هنا لا تُقرأ عرضًا صامتةً: تُنبَّه **وتُحال إلى مكانها** («استعمل لصق
رسالة عميل في صفحة الطلبات»). وما لم يُقرأ يُسمّى باسمه — نوعًا أو مدينةً أو سعرًا — ولا
يُخترع له قيمة.

### ما يُنشئه الزرّ

- **المالك**: بدور «مالك عرض»، ومعه تواصلٌ مسجَّل في ملفّه.
- **وعقارُه**: مربوطًا به، بحالة **«موافق للتعاون»** — عرضه عليك بنفسه، فليس «لم يتم
  التواصل معه بعد» — ومعتمَدًا لا ينتظر معالجة، ونصُّ الرسالة محفوظٌ في ملاحظاته.
- **ولا مالك مكرَّر**: الجوال المسجَّل يُستعمل سجلُّه. ومن كان **باحثًا** عندك ثم عرض
  عقاره يصير **الاثنين** — يُضاف الدور ولا يُنشأ سجلٌّ ينافس سجلَّه.
- ثم تُفتح استمارةُ العقار: أنشأتَه لتوّك من رسالة، فتُضيف صوره وموقعه قبل أن تنساه.
- ومَن يطابقه من طلباتك يُعلَن فورًا — العرضُ الجديد قد يكون جوابَ طلبٍ ينتظر.

**ولا يُحفظ شيءٌ بلا ضغطك**: القراءة تُعرض حقلًا حقلًا، والإلغاء لا يكتب حرفًا.
**ولا تخرج البيانات من الجهاز**: القراءة في متصفّحك، بلا شبكة ولا مفتاح.

### وعطبان في المبالغ كانا يكتبان أرقامًا خاطئة صامتة

هذان **ليسا في الجديد** — في المحلّل الذي يخدم لصق الطلبات منذ المرحلة ١١:

**١) «١٫٥ مليون» كانت تُقرأ ٥ ملايين.** الفاصلة العشرية العربية `٫` (U+066B) كانت مُدرَجةً
في **فواصل الآلاف**، وفاصلُ الآلاف هو `٬` (U+066C) لا هي. فيفشل النمط الأوّل على
«١٫٥ مليون»، ثم يلتقط الثاني «٥» وحدها فتصير خمسة ملايين. **خطأٌ بثلاثة ملايين ونصف،
بلا رسالةٍ ولا علامة.**

**٢) «٢ مليون ونصف» كانت تُقرأ مليونين.** الكسر المنطوق بعد المضاعِف كان يُهمَل، فنصفُ
مليونٍ يسقط. و«مليونين» و«نص مليون» — بلا رقمٍ في النص أصلًا — ما كانتا تُقرآن البتّة.

وهذه صيغٌ يوميّة في السوق هنا، لا حالاتٌ نادرة. والخطأ الصامت في السعر أسوأ من حقلٍ
فارغ: **الفارغُ يُسأل عنه، والخطأُ يُبنى عليه** — تُطابَق به العروض، ويُقدَّر به السعر،
ويُحسب به صافي الربح.

صار الحساب في موضعٍ واحد (`scaled` و`wordAmount`)، يخدم السعرَ في العرض والسقفَ في
الطلب معًا، فلا يُصلَح أحدهما ويُنسى الآخر.

### الملفات المعدَّلة وسببها

| الملف | لماذا |
| --- | --- |
| `js/data/listing-parse.js` | `parseOfferText` · `parseSenderName` مشتركًا · الفاصلة العشرية · الكسور والمبالغ المنطوقة |
| `js/pages/properties.js` | زرّ «لصق عرض عميل» ونافذتُه · `openForm` يقبل حقولًا مقروءة |
| `tests/offer-paste-unit.mjs` · `tests/offer-paste.mjs` | **جديدان** — ٣٥ فحصًا للقراءة و٣١ للسلوك |
| `tests/run.mjs` | تسجيل الحزمتين |

### لم يُمسّ

- **لصق رسالة عميل في الطلبات كما هو** — وزاد صحّةً بإصلاح المبالغ.
- `parseListingText` يقرأ العروض الخارجية كما كان؛ التغييران فيه **تصحيحُ خطأ لا تبديلُ
  سلوك**.
- لا `DB_VERSION` تغيّر، ولا حقلَ جديدًا في المخطّط: `deedNumber` موجودٌ منذ المرحلة ٣٧.

## ٤٧. المرحلة ٤٠ — عقود الوساطة وتراخيص الإعلانات، والمهام جدولًا ودفعةً

طلبان: صفحةٌ للعمل النظاميّ مع الهيئة العامة للعقار، وأربعةُ تحسيناتٍ في المهام.

### أ) عقود الوساطة وتراخيص الإعلانات

**بُني على نصوصٍ رُوجعت، لا على ظنّ.** وهذا ما يوجبه النظام:

- عقد الوساطة **مكتوبٌ**، وتُودَع نسخةٌ منه لدى الهيئة.
- و**محدَّد المدّة**؛ فإن لم تُذكر مدّةٌ فهي **تسعون يومًا** من تاريخ إبرامه.
- وينتهي **تلقائيًّا** بانتهائها ولو لم تتمّ الصفقة، ما لم يُجدَّد.
- ومدّته تبدأ من **تاريخ التوقيع الإلكتروني** في منصّةٍ معتمدة.
- و**ترخيص الإعلان لا يُصدَر إلا لعقدٍ يشمل نطاقُه التسويق**.
- والمخالفة تُعرِّض لإزالة الإعلان وإيقاف المعلن عن النشر مدّةً تصل إلى سنة.

> والمصادر في رسالة التسليم، ومنها موقع الهيئة نفسه ونظام الوساطة العقارية.

**وما لا تفعله الصفحة مكتوبٌ في أوّلها لا في حاشية:** لا تُصدِر ترخيصًا ولا توثّق عقدًا
ولا تستعلم آليًّا — **الهيئة لا تفتح واجهةً برمجية عامة** لذلك، والإصدار يبقى بحسابك في
منصّتها. فهذه تتبُّعٌ وتنبيهٌ ومنعُ إعلانٍ بلا ترخيص، وستّةُ روابط مباشرة إلى خدماتها.

**ما أُضيف إلى البيانات:**

| الحقل | لماذا |
| --- | --- |
| `property.agreementNumber` | رقم العقد الموثَّق — شاهدُ الإيداع الذي يوجبه النظام |
| `property.agreementScopes` | نطاقه؛ ومنه **التسويق** الذي بدونه لا ترخيص |
| `property.adLicense` | `{ number, issuedAt, expiresAt }` — أو `null` فلا ترخيص |
| `company.licenseExpiresAt` | انتهاء رخصة فال — بلا سريانها لا عقدَ ولا إعلان |

ورقما العقد والترخيص يدخلان **مفتاح البحث**: يأتيك سؤالٌ برقمٍ فتجد صاحبه.

**والمنعُ حيث يقع الفعل:** نافذة «نصّ إعلان جاهز» تعرض **المانع النظاميّ أوّلًا وعلى
حدة**، ثم ما يُضعف الإعلان. وكان الوشيك أن يُخلطا في قائمةٍ واحدة — وهو خطأ: نقصُ الصور
يُقلّل المشاهدات، وغيابُ الترخيص يجعل الإعلان مخالفةً تُزال ويُوقَف صاحبها. فبقي `adGaps`
للتسويق وحده، و`adBlockers` للنظام.

ونصُّ الإعلان نفسه يحمل **سطر الإفصاح**: «ترخيص إعلان عقاري رقم … · رخصة فال … · المكتب».
**ولا يُكتب هذا السطر إن لم يكن ثمّ ترخيص** — سطرٌ يوهم بترخيصٍ لا وجود له أسوأ من لا شيء.

**وانتهاء الترخيص صار في التقويم**: كانت نهايةُ الاتفاقية وحدها فيه، وترخيصٌ ينتهي
وإعلانُك قائم يجعله مخالفةً من يومه — فموعدُه أولى بالظهور لا أقلّ.

### ب) المهام: أربعة

**١) إضافة دفعة بتوزيعٍ يُعتمد.** تكتب مهامك سطرًا سطرًا، ثم إنتر، فيُقرأ من كل سطرٍ
موعدُه («بكرة الساعة ٤») وأولويّتُه («!!» أو «عاجل») وقائمتُه بموضوعه — **ثم لا يُحفظ شيء
حتى تراجع وتعتمد**. و**سببُ كل اختيار مكتوبٌ بجانبه** («ذُكر اسم القائمة»، «موضوعه
اتصالات»، «لم يُعرف موضوعه — راجعه»)، فيُراجَع التوزيع بنظرة لا بفتح كل سطر.

وترتيب الاختيار مقصود: اسمُ قائمةٍ عندك ذُكر في السطر ← كلمةٌ من اسمها ← موضوعٌ مدمج
(اتصال، معاينة، عقود، مالية، تسويق، متابعة) ← وإلّا فالأولى، **ويُقال إنّه لم يُعرف**.
وهي **مطابقةُ كلماتٍ لا فهمُ كلام** — مكتوبةً في الصفحة نفسها.

**٢) تثبيت القوائم**: `taskLists.pinned` — المثبَّتة تتقدّم مهما كان ترتيبها، والتثبيت
محفوظ.

**٣) عرض الجدول**: عمودٌ ثالث بجانب «لوحة» و«قائمة واحدة». وأعمدتُه ما تعرضه أدوات إدارة
المهام: **المهمة، الأولوية، الموعد، القائمة، التكرار، المرتبط بها** — تُرتَّب بالضغط على
العمود، وتُفرز بالحالة والأولوية والموعد (متأخّرة/اليوم/هذا الأسبوع/بلا موعد) والقائمة،
ويُبحث فيها نصًّا. ولا «مسؤول» ولا «تقدير بالساعات»: هذا مكتبٌ يعمل فيه صاحبُه ومساعده،
وعمودٌ لا يُملأ عمودٌ يُزاحم. ومعه حقلٌ جديد: `tasks.priority` بأربع درجات.

**٤) ربط التقويم بالمهام** — وكان فيه **عطبٌ حقيقيّ**: النقر على مهمّةٍ في التقويم يفتح
`#/tasks`، أي **صفحة المهام كلَّها**، فتبحث بين مئةٍ عمّا نقرتَ عليه. و`#/tasks/<id>`
مسارٌ تقرؤه الصفحة منذ المرحلة ٧ فتفتح المهمّة — لم يكن ينقص إلا استعماله. صار الرابط
إليها، ومعه اسمُ قائمتها في التلميح.

### وعطبان في المحلّل النصّي: `\b` لا يعرف العربية

`\b` في جافاسكربت حدُّ كلمةٍ **لاتينيّ**: يُعرَّف بـ`\w` وهي `[A-Za-z0-9_]` وحدها. فـ
`/\bبكره\b/` **لا تطابق «بكره» أبدًا** — لا لأنّ الكلمة غائبة، بل لأنّ الحدّ لا يقع بين
حرفين عربيَّين. وهذا خطأٌ **صامت**: التعبير صحيحُ الصياغة، ولا يطابق شيئًا، ولا يشتكي.

وكذلك `\d`: لاتينيّةٌ وحدها. والسطرُ يُكتب «الساعة ٤»، فالقصّ الذي لا يعرف الأرقام العربية
يترك «الساعة ٤» في عنوان المهمة.

فالحدّ هنا يُكتب صراحةً (بدايةُ نصٍّ أو فراغٌ أو ترقيم)، والأرقامُ تشمل العربية
والفارسية.

### الملفات المعدَّلة وسببها

| الملف | لماذا |
| --- | --- |
| `js/util/rega.js` | **جديد** — حالات العقد والترخيص، وما يمنع الإعلان، وسطر الإفصاح، وروابط الهيئة |
| `js/pages/rega.js` | **جديدة** — الصفحة بخلاصتها وفلاترها وجدولها |
| `js/util/task-intake.js` | **جديد** — قراءة الدفعة: الموعد والأولوية والقائمة بسببٍ معلن |
| `js/data/schema.js` | `agreementScopes` · `agreementNumber` · `adLicense` · `taskPriorities` · `taskLists.pinned` |
| `js/data/repository.js` | تنظيف الترخيص والنطاق والأولوية · الرقمان في مفتاح البحث |
| `js/data/settings.js` · `js/pages/settings.js` | `licenseExpiresAt` وحقله |
| `js/pages/properties.js` | قسم «التوثيق وترخيص الإعلان» · المانع النظاميّ في نافذة الإعلان |
| `js/util/ad-copy.js` | سطر الإفصاح في النصّ · وفصلُ «ما يُضعف» عن «ما يمنع» |
| `js/pages/tasks.js` | الدفعة · التثبيت · الجدول بفلاتره · حقل الأولوية |
| `js/util/calendar.js` · `js/pages/calendar.js` | المهمة تُفتح بنفسها · نهاية الترخيص حدثًا |
| `js/app.js` · `js/util/sidebar.js` · `index.html` · `js/util/voice-commands.js` | الصفحة الجديدة ومسارها واسمها المنطوق |

### لم يُمسّ

- **لا ادّعاءَ ربطٍ آليّ بالهيئة**: ما لا يُربط يُقال إنّه لا يُربط، ولمَ.
- **لا `DB_VERSION` تغيّر**: حقولٌ على سجلّاتٍ قائمة.
- عرضا «لوحة» و«قائمة واحدة» كما كانا؛ الجدول ثالثٌ لا بديل.
- منطق المطابقة والتسعير والعمولات كما هو.

## ٤٨. المرحلة ٤١ — تفريغ المستندات والوسائط

يصلك الصكُّ صورةً، والطلبُ رسالةً صوتية، والعرضُ مقطعًا — فتُعيد كتابة ما فيها بيدك في
الاستمارة، أو تتركها فتضيع. وهذه تفرّغها نصًّا، وتقرأ منه حقولَه، وتحوّله إلى **عقارٍ أو
طلبٍ أو مهمّةِ عقد وساطة** بضغطة.

### ثلاثة مسارات — ويُقال أيُّها يعمل الآن

| المسار | الحال |
| --- | --- |
| **نصٌّ تلصقه** | **يعمل اليوم بلا اشتراك**، ويقرأ الحقول كاملةً |
| صورة أو PDF تلقائيًّا | يحتاج «قراءة المستندات» — ويقول اسم المتغيّر الناقص |
| صوت أو مقطع تلقائيًّا | يحتاج «تفريغ الصوت» — كذلك |

والصفحة **تُرشد إلى المسار الذي يعمل**: جوّالك يستخرج نصّ الصورة بنفسه («النص المباشر» في
آيفون، وعدسة جوجل في أندرويد)، وملفُّ PDF يُنسخ منه — فالمسار الأول يكفي لأكثر ما يصلك.

### ما يُقرأ من الصكّ

رقمه وتاريخه (هجريًّا **كما كُتب، لا يُحوَّل**)، واسم المالك ورقم هويّته، والمساحة، ورقم
المخطط والقطعة والبلك، والحي والمدينة، **والحدود والأطوال الأربعة**. وكلُّ حقلٍ يحمل
**السطر الذي قُرئ منه** — شاهدُك عليه، فتصحّح ما أُسيء فهمه بدل أن تثق على عماك. واضغط
أيَّ حقلٍ فيُنسخ وحده.

**ولا حقلَ يُخمَّن**: ما لم يُقرأ لا يظهر — ورقمُ صكٍّ مخترَع في عقدٍ أسوأ من حقلٍ فارغ.
وصكٌّ بلا رقمٍ يُنبَّه عليه، وتاريخٌ بلا «هـ» أو «م» يُسأل عنه.

### والتحويل: ثلاثة أبواب

- **عقار**: بمدينته وحيّه ومساحته ورقم صكّه، ورقما المخطط والقطعة في حقول النوع حيث
  مكانهما، ونصُّ المستند في ملاحظاته. ثم تُفتح استمارتُه لتُكمله.
- **طلب**: بغرضه وميزانيته وأحيائه، **ومعه عميلُه** — ولا يُنشأ مكرَّر إن كان جوالُه مسجَّلًا.
- **مهمّة «أنشئ عقد وساطة»**: بأولويّةٍ مرتفعة، في قائمة العقود (تُنشأ إن لم تكن)، وفيها
  **خطواتُه بالترتيب النظاميّ** (وقّع ← وثّق في المنصّة ← سجّل رقمه ونطاقه ← ثم أصدر
  ترخيص الإعلان) **وحقولُ الصكّ لتُنقل إلى المنصّة**. فالمستندُ وحده لا يكفي: يحتاج عقدًا
  يُوقَّع ويُوثَّق ويُعتمد، فيصير خطوةً في قائمتك لا نيّةً تُنسى.

**ولا يُنشأ شيءٌ حتى تضغط**، ولا يُنشأ مرّتين: الزرّ يُعطَّل بعد أوّل إنشاء، ويظهر رابطٌ
إلى ما صار إليه السجلّ.

### والفشل يُحفظ كالنجاح

ملفٌّ فشل تفريغه **يُحفظ سجلًّا أحمر يقول لماذا** — «الناقص: `OCR_API_KEY`» أو «الملف فوق
الحدّ» أو «ردّ المزوّد بلا نصّ» — ويدلّ على المسار الذي يعمل الآن. وملفٌّ يسقط صامتًا أسوأ
من سطرٍ أحمر: تظنّه فُرِّغ.

### عطبان كشفتهما اللقطة لا الفحص

**١) كلُّ حدٍّ كان يُعرض مرّتين** — مرّةً باسمه العربي («الحدّ الشمالي») ومرّةً بمفتاحه
الخام (`bound_الشمال`): الحقول تُخزَّن بالوجهين، والعرضُ يمرّ على الاثنين. فأُسقطت
مفاتيح `bound_*` من العرض، وبقي `bounds` وحده.

**٢) رسالةُ العميل المفرَّغة كانت تقول «لم يُقرأ حقلٌ معروف»** وفيها ميزانيةٌ وحيٌّ ونوعٌ
وجوّال — لأنّها قُرئت **بمحلّل الصكوك وحده**، ورسالةُ عميلٍ ليست صكًّا. صارت القراءة تجمع
المحلّلَين: ما يقرؤه محلّل الطلبات ولا يقرؤه محلّل الوثائق يُضاف، ولا يُزاحم ما في الصكّ.

### وعطبٌ ثالث: التطبيع تسرّب إلى التخزين

`parseSenderName` كانت تقرأ الاسم من النصّ **المطبَّع**، فيُحفظ «نورة» **«نوره»** و«إيمان»
«ايمان». والتطبيع صوابٌ للمطابقة وخطأٌ للتخزين: اسمٌ يُكتب في سجلّ عميل ثم يُطبع في عقد
يجب أن يكون كما كتبه صاحبُه. صار الاسم يُؤخذ من الأصل، والوقوفُ عند الأفعال يُقارَن
مطبَّعًا. **ويمسّ هذا لصق الطلبات ولصق العروض معًا** — لا الجديدَ وحده.

### والفخّ نفسه ثالثةً: `\w` لاتينيّة

رقمُ بلكٍ اسمُه «ب» لم يكن يُقرأ، لأنّ `[\w\d]` لا تشمل العربية — وهو الفخّ الذي وقع في
`\b` و`\d` في المرحلة ٤٠. **كلُّ صنفٍ مختصرٍ في جافاسكربت لاتينيُّ المولد**، فالرموز هنا
تُكتب صريحةً.

### الملفات المعدَّلة وسببها

| الملف | لماذا |
| --- | --- |
| `js/util/deed-parse.js` | **جديد** — قراءة الصكّ حقلًا حقلًا، بشاهدٍ على كل حقل |
| `js/pages/extract.js` | **جديدة** — الصفحة: الإدخال والقراءة والتحويل والفشل الصادق |
| `js/data/schema.js` | مخزن `extractions` وحقولُه |
| `js/data/adapters/indexeddb.js` | `DB_VERSION` ٩ |
| `js/data/repository.js` | تنظيف سجلّ التفريغ · نصُّه في مفتاح البحث |
| `js/data/listing-parse.js` | **الاسم يُحفظ كما كُتب لا مطبَّعًا** |
| `js/app.js` · `js/util/sidebar.js` · `index.html` · `js/util/voice-commands.js` | الصفحة ومسارها واسمها المنطوق |

### لم يُمسّ

- **لا ادّعاءَ قراءةٍ آلية بلا اعتمادها**: ما ينقصه مفتاحٌ يقول اسمه.
- **ولا نصٌّ مخترَع**: مزوّدٌ يردّ بلا نصّ يُسجَّل فشلًا لا يُملأ بتخمين.
- ما أُنشئ من تفريغٍ يبقى ولو حُذف سجلُّ التفريغ — ويُقال ذلك في نافذة الحذف.

---

## ٤٩. المرحلة ٤٢ — جولةٌ في النظام مستخدِمًا، وستّةٌ وعشرون بندًا خرجت منها

طُلب أن أستعمل النظام لا أن أفحصه: أفتحه أوّل مرّة، وألصق رسالة عميل، وأنشئ طلبًا، وأمرّ
على صفحاته الخمس والعشرين، وأضيف مهامّ دفعةً، وأفرّغ صكًّا، وأجرّبه على جوّالٍ بعرض ٣٩٠
وفي الوضع الداكن، وأقيسه على خمسة آلاف عقارٍ وألفَي عميل. فخرج من ذلك **ستّةٌ وعشرون
بندًا**: عشرةُ أعطاب، وثماني صعوبات، وثماني نواقص. وهذا ما صار إليه كلُّ واحدٍ منها.

> **وستّةٌ منها تمسّ ما سلّمتُه في المرحلتين ٤٠ و٤١، والفحوصُ مرّت عليها خضراء.** كلمةُ
> `null` رأيتُها في **لقطة**، و«ساء» رأيتُها حين قرأتُ المخرَج بعيني لا حين عدَدتُ
> النجاحات. وهي الرابعةُ التي يكشف فيها **النظرُ** ما أخطأه الفحصُ الآلي.

### أ) عشرةُ أعطاب

**١) كلمة `null` مطبوعةٌ على الشاشة.** في نافذة البحث (وهي التي تُفتح بـ«/» عشرات المرّات
يوميًّا)، و«مشاركة العقار»، و«عملاء مكرّرون».

السبب في `dom.js`: `box.append(head, body, footer ? … : null)` — و**`Element.append`
الأصليّة تحوّل `null` إلى نصّ** `"null"`. ودالّةُ المشروع `appendChildren` تتخطّاه
صحيحًا، لكنّ هذا السطر لا يمرّ بها. وفُحص المستودعُ كلُّه بمحلّلٍ يقرأ الوسائطَ العليا
لكل `append` فوُجدت ثلاثةُ مواضع أخرى (`settings.js` · `invoices.js` · `integrations.js`)
وأُصلحت، والمحصّلةُ الآن **صفر**.

**٢) عناوين المهامّ تُشوَّه — وهي ميزةُ المرحلة ٤٠ نفسها.**

| ما كُتب | ما كان يُحفظ |
|---|---|
| معاينة النرجس الساعة ٦ **مساء** | معاينة النرجس **ساء** |
| اتصل على سعد الساعة ٩ **صباحًا** | اتصل على سعد **باحًا** |

السبب: البدائل كانت `(ص|صباحًا|صباحا|م|مساءً|مساء)` — و**جافاسكربت تختار أوّل بديلٍ
يطابق لا أطولَه**، فتأكل «م» من «مساء» وتترك «ساء». والأطولُ يجب أن يسبق الأقصر. ومعها
صارت تُقرأ: «٥م» الملتصقة (وهي أشيع اختصار، وكانت لا تُقرأ لأنّ `word()` يطلب حدًّا قبل
الميم ولا حدَّ بعد رقم)، و«خلال أسبوع»، و«بعد شهر»، و«بعد شهرين»، و«ظهرًا» و«عصرًا»
و«ليلًا». وثمانيةَ عشرَ صيغةً تُقرأ الآن بلا عنوانٍ مشوَّه.

**٣) اسم المالك في الصكّ يُبتر — وهو أخطرُها.** «عبدالعزيز بن محمد بن سعد الحربي» كان
يُقرأ «عبدالعزيز بن محمد بن»: يقف عند أربع كلمات، **وينتهي بأداة وصلٍ فيبدو اسمًا تامًّا
وليس كذلك**. وذلك أسوأ من ناقصٍ معلَن، واسمٌ يُطبع في عقد وساطة لا يحتمله. صار الحدُّ
ثماني كلمات، و`takeName` تحذف أداةَ الوصل من آخره وتُنبّه أنّ الاسم قد يكون أطول.

**٤) «تاريخ الصك: ١٤٤٥/٠٦/١٢ هـ» لا يُقرأ** — وهي صيغةُ الصكّ الإلكتروني. كان النمط
يطلب النقطتين بعد «تاريخ» مباشرةً وسنةً من أربعة أرقام **آخرًا**، فلا كلمةَ بينهما ولا
سنةَ أوّلًا. صارت تُقرأ الصيغُ الثلاث، والنقطةُ فاصلًا كذلك.

**٥) النوع يُعرض بمفتاحه الإنجليزي `land`** في صفحة التفريغ. أُضيفت `displayValue` تترجم
النوعَ والغرضَ وتكتب وحدةَ المساحة والمبلغ.

**٦) التطبيع تسرّب إلى تخزين الحدود** — وهو عطبُ المرحلة ٤١ نفسه، أُصلح للأسماء وبقي في
الحدود: `الشمال: قطعة رقم ٤٨` كان يُحفظ «قطعه رقم 48». أُضيفت `prepMapped` التي تحتفظ
بخريطةٍ من كلّ حرفٍ مطبَّعٍ إلى موضعه في الأصل، فـ**القراءة على المطبَّع والقيمة من
الأصل** — وتشمل الآن الحدودَ والحيَّ والمدينةَ واسمَ المالك.

**٧) رقم القطعة يُلتقط من سطر الحدود** — أي **قطعةِ الجار**، ويُخزَّن على أنّه قطعتُك.
وهذا تخمينٌ تنفيه الصفحةُ عن نفسها. صارت سطورُ الحدود محجوبةً عن حقول المخطط والقطعة
والبلك (`tNoBounds`)، والرقمُ الصريحُ في سطره يُقرأ كما كان.

**٨) زرّان ☰ متجاوران على الشاشة الكبيرة** يفعلان الشيء نفسه (كلاهما
`for="sidebar-toggle"`). السبب: `.sidebar-open-btn { display:none }` في `base.css`، ثمّ
`.icon-btn { display:inline-flex }` في `components.css` — **بالأولوية نفسها ومحمَّلٌ
بعده، فيغلب**. حُسم بـ`!important` في الطرفين، وسببُه مكتوبٌ فوقه.

**٩) صندوق «إضافة دفعة مهامّ» لا يظهر لمن لا قوائمَ عنده.** كان `return` قبله في
`tasks.js`، فالميزةُ الجديدة **غير مرئيّة لمستخدمٍ جديد**، وفي داخلها فرعٌ يقول «أنشئ
قائمةً واحدة أولًا» **لا يمكن الوصول إليه أبدًا**: كودٌ ميّت.

وصار الصندوقُ يُعرض أوّلًا، و`pickList` تقترح **اسمًا لقائمةٍ تُنشأ** من موضوع السطر حين
لا قوائمَ بعد، والاسمُ حقلٌ يُحرَّر، و**القوائمُ تُنشأ عند الاعتماد لا قبله** (وباسمٍ
واحدٍ لكل عنوان، فسطران موضوعُهما «اتصالات» لا يصنعان قائمتين). فمن فتح الصفحة بيضاء
صار يخرج منها بأربع قوائمَ وأربع مهامّ من لصقةٍ واحدة.

**١٠) تلميحٌ قديم يكذب**: «الموقع — اختياري — الخريطة تأتي في مرحلة لاحقة»، والخريطةُ
موجودةٌ منذ المرحلة ٥ وفي الشريط الجانبي.

### ب) ثماني صعوبات

| ما كان | ما صار |
|---|---|
| على جوّال ٣٩٠ لا ترى أوّل عقار إلّا بعد **١٫٣٠ شاشة** (قِيس: أوّل بطاقة عند ١٠٩١px والشاشة ٨٤٤) | **٠٫٥٨ شاشة** — أربع بطاقاتٍ في أوّل مشهد |
| والعروض الخارجية ١٫٤٢ شاشة | ٠٫٧٢ شاشة |
| رقائق الفلاتر **٣٤px** لمسًا | ٤٤px — وقياسُ المشروع نفسه يشهد: ٠ رقيقةً دونها |
| «لصق رسالة عميل» في «الطلبات» وحدها | زرٌّ في «العملاء» يقود إلى اللصق نفسه (`#/requests?paste=1`) لا إلى نسخةٍ ثانية منه |
| اللصق لا يقرأ حتى تضغط زرًّا | **يُقرأ فور اللصق** في اللصقتين معًا، والزرّ باقٍ لمن عدّل بيده |
| قائمة الحالة مقصوصة: «لم يعد م…» | الخليّةُ تتّسع لأطول خيارٍ فيها |
| بطاقةٌ بلا صورة تأخذ ١٩٠px من رماديٍّ فارغ | نسبتُها ١٦:٥ — والبطاقةُ ذاتُ الصورة كما هي |
| أرقامُ لوحة الوساطة كلُّها بلونٍ واحد: «١٣ بلا عقد» بلون «٠ انتهت» | نغمةٌ بالمعنى (ok/warn/danger) مع حدٍّ جانبيّ لمن لا يميّز اللون — **والصفرُ يبقى محايدًا مهما كان نوعُه** |

**وحقلُ التاريخ `mm/dd/yyyy`**: المتصفّح يرسمه بلغته هو لا بلغة الصفحة، ولا يملك الموقعُ
تبديلَ ذلك؛ واستبدالُ المنتقي الأصليّ بآخرَ من عندنا **يخسر لوحةَ التاريخ في الجوّال**
وهي أنفعُ ما فيه. فبدل المنع: **صدًى تحت الحقل** يكتب ما اخترتَه بالعربية وبالتقويمين —
فمن رأى `09/15/2026` وشكَّ أيُّهما الشهر قرأ تحته «١٥ سبتمبر ٢٠٢٦ · ٤ ربيع الآخر ١٤٤٨ هـ».

### ج) ثماني نواقص

**١) «٣ غرف ودورتين» كان يُقرأ ثم يضيع.** لا حقلَ له على الطلب، فلا يدخل المطابقة — وهو
أوّلُ ما يسأل عنه المستأجر. أُضيف `rooms` و`baths` على الطلب، و`baths` على العقار المبنيّ.

**والغرفُ معيارٌ مرجّحٌ لا قاطع، وذلك مقصود**: عرضٌ لم يُسجَّل عددُ غرفه ليس عرضًا بغرفةٍ
واحدة، وقطعُه لأجل حقلٍ ناقصٍ عندك **يُخفي عنك ما يناسب عميلك**. فالناقصُ يُوسَم، والأقلُّ
يهبط في الترتيب ولا يختفي:

| غرفُ العرض (والمطلوب ٣) | النسبة |
|---|---|
| ٣ | ١٠٠٪ |
| ٢ | ٨٩٪ |
| ١ | ٧٩٪ + وسمُ «غرفُه أقلّ ممّا طُلب بكثير» |
| غير مسجَّل | ١٠٠٪ + وسمُ «عدد الغرف غير مسجَّل» |

ووزنُه في الإعدادات (٢٠ افتراضًا) يُعدَّل كبقيّة الأوزان.

**٢) لا حدَّ أدنى للميزانية.** «من ٤٥ إلى ٦٠ ألف» كان يُحفظ سقفُه وحده. أُضيف
`budgetMin`، **ووسمًا لا حسمًا**: الأرخصُ ليس عيبًا في نفسه، لكنّ من قال «من ٤٥» غالبًا
يعني أنّ ما دونها ليس من سوقه — فيُقال له «أقلّ من أرضيّتك» ولا يُحجب عنه.

> **وفخُّ التطبيع ثالثةً في هذه المرحلة:** `prep` يردّ «ى» إلى «ي»، فـ«الى» تصير «الي» —
> ونمطٌ يبحث عن «الى» لا يجدها أبدًا وإن كانت في الرسالة. ولذلك كان «بين ٥٠ و٧٠» يُقرأ
> و«من ٤٥ الى ٦٠» لا يُقرأ. **الفاصلُ يُكتب بصيغته بعد التطبيع.**

**٣) الإيجار لا يميّز سنويًّا من شهريّ** — والفرقُ اثنا عشر ضعفًا. أُضيف `rentCycle`
(`ENUMS.rentCycles`)، ويُقرأ من الرسالة، **وإن لم يُذكر بقي فارغًا ولم يُفترض شيء**.

**٤) قراءةُ الموعد محدودة** — عولجت مع العطب ٢.

**٥) أنواعُ العقار الافتراضية أربعة** (أرض · فلة · دور · شقة)، ولا عمارةَ ولا محلَّ ولا
مكتبَ ولا مستودعَ ولا استراحة — ووسيطُ الرياض يمرّ عليها كلَّ أسبوع. أُضيفت ستّة:
**عمارة · محل · مكتب · مستودع · استراحة · مزرعة**، وتُقرأ من الرسائل الآن بدل أن تُذكر
ولا يُعرف نوعُها. وهي مفاتيحُ جديدةٌ على قائمةٍ مدمجة — لا ترحيل، ولا يمسّ سجلَّك شيء.

**٦) نصُّ الرسالة لا يُحفظ على الطلب** — كان على العميل وحده، فالطلبُ يفقد سياقه، وما لم
يجد المحلّلُ له حقلًا («صالة واسعة»، «قريب من مسجد») يضيع معه، ومَن له عند العميل ثلاثةُ
طلبات لا يعرف أيُّ رسالةٍ أنشأت أيَّها. صار يُحفظ في ملاحظات الطلب.

**٧) البذرةُ التجريبية بلا مهامّ ولا قوائم** — فمن جرّب النظام رأى «المهامّ» و«التقويم»
صفحتين بيضاوين وظنّهما غير مبنيَّتين. أُضيفت أربعُ قوائمَ وسبعُ مهامّ، **ومواعيدُها نسبيّةٌ
من اليوم لا ثابتة** فلا تولد متأخّرةً أبدًا، وتُمسح مع بقيّة البذرة بالترتيب الصحيح.

**٨) صفحة التكاملات تفرغ** حين تتعذّر قراءة الحالة، فلا تعرف ما في النظام أصلًا. صارت
تعرض السبعةَ بأسمائها **وأسماءَ متغيّراتها** (لا قيمَها) من دليلٍ محليٍّ لا يحتاج خادمًا،
**ويبقى ما لا يُعرف بلا خادمٍ هو الحالةُ وحدها، ويُقال ذلك صراحةً**.

**والترقيم العربيّ**: «0 متبقية» و«اقتراحٌ لـ3 مهمة» و«3 غرفة» ليست عربيّةً — والعددُ في
العربية يغيّر المعدود. صارت كلُّها على `countWord`.

### وثلاثةٌ كشفها الفحصُ بعد الإصلاح — واثنان منها حقيقيّان

- **`design-dhad`**: `task-list-title` ٣٠px و`task-title-btn` ٢٦px لمسًا. **عطبٌ قديمٌ لم
  يكن يُقاس**: صفحةُ المهامّ كانت فارغةً في الفحص فلا بطاقةَ تُقاس — فلمّا صارت البذرة
  تُنشئ مهامّ، وُجد ما يُقاس فظهر. وكلاهما هدفٌ يُنقر (تسميةٌ وتعديل) لا نصٌّ يُقرأ، فرُفعا
  إلى ٤٤.
- **`invoices`**: `taskLists === 1` صار ٥ — **توقُّعُ عددٍ بعينه** والمقصودُ أن المخزنين لا
  يسقطان من التصدير. صار `>= 1`.
- **`deed-parse-unit`**: كان يتوقّع «شارع عرض 15» بأرقامٍ لاتينيّة — أي **القيمةَ
  المطبَّعة**، وقد صارت تُخزَّن كما كُتبت. حُدِّث التوقُّع، وأُضيف فحصٌ يشهد للسلوك الجديد.

### الملفات المعدَّلة وسببها

| الملف | لماذا |
| --- | --- |
| `js/util/dom.js` | `appendChildren` بدل `box.append` — لا `null` مطبوعة |
| `js/pages/{settings,invoices,integrations}.js` | ثلاثةُ مواضعَ أخرى للعطب نفسه |
| `js/util/task-intake.js` | ترتيبُ بدائل الوقت · «٥م» الملتصقة · «خلال/بعد شهر» · `topicOf` و`newListTitle` |
| `js/util/deed-parse.js` | `prepMapped` · `takeName` · تاريخُ الصكّ · حجبُ سطور الحدود |
| `js/data/listing-parse.js` | الغرفُ والحمّاماتُ وأرضيّةُ الميزانية ودورةُ الإيجار · فاصلُ المدى بعد التطبيع · ستّةُ أنواعٍ تُقرأ |
| `js/data/schema.js` | حقولُ الطلب الأربعة · `baths` على المبنيّ · `rentCycles` · ستّةُ أنواعٍ مدمجة |
| `js/data/matching.js` | الغرفُ معيارًا مرجّحًا · وسمُ «أقلّ من أرضيّتك» |
| `js/data/{settings,repository,seed}.js` | وزنُ الغرف · تهيئةُ الحقول وتتبّعُها · بذرةُ المهامّ |
| `js/pages/{requests,clients,matches,properties}.js` | الحقولُ الجديدة في الاستمارة والملخّص · زرُّ اللصق في العملاء · القراءةُ فور اللصق · نصُّ الرسالة على الطلب |
| `js/pages/{tasks,extract,rega,invoices}.js` | الصندوقُ قبل الحارس · `displayValue` · نغمةُ الأرقام · فراغُ العنوان |
| `js/app.js` | `foldFilters` · `echoDates` |
| `css/base.css` · `css/components.css` | الزرُّ المكرَّر · ٤٤px · طيُّ الفلاتر · الغلافُ الفارغ · القائمةُ المقصوصة · نغمةُ الأرقام |
| `tests/{deed-parse-unit,invoices}.mjs` | توقُّعان قديمان: قيمةٌ مطبَّعة، وعددٌ بعينه |

### لم يُمسّ

- **`DB_VERSION` باقٍ ٩**: الحقولُ الستّة الجديدة (`rooms`, `baths`, `budgetMin`,
  `rentCycle` على الطلب، و`baths` على العقار) حقولٌ بقيمٍ افتراضية على مخازنَ قائمة —
  **لا ترحيل، وسجلُّك القديم يُقرأ كما هو**.
- **الأنواعُ الستّة الجديدة مفاتيحُ جديدة** لا تبديلَ لقائمٍ: عقارٌ نوعُه `villa` يبقى
  `villa`، وما أضفتَه بيدك يبقى كما أضفتَه.
- منطقُ الأسعار والمساحة والأحياء والمرونة في المطابقة كما هو — **الغرفُ معيارٌ سادسٌ
  أُضيف، ولم يُبدَّل معيارٌ قائم**.
- لا مفتاحَ ولا سرَّ في المستودع ولا في قاعدة البيانات ولا في النسخ الاحتياطية — وأسماءُ
  المتغيّرات التي أُضيفت إلى الدليل **أسماءٌ لا قيم**.

---

## ٥٠. المرحلة ٤٣ — جولةٌ ثانية، ومسطرةٌ كانت تكذب

جولةٌ ثانيةٌ مستخدِمًا على النسخة المُصلَحة، في مساراتٍ لم تُمشَ في الأولى: مسارُ المال
(معاينة ← صفقة ← فاتورة)، وملفُّ العميل، وصحةُ البيانات، والفرص، والجولات، وتقديرُ
السعر، والخريطة، والختم، والطباعة، والصفحةُ العامة، ودمجُ المكرّرين، والإعداداتُ
بأقسامها، والموجّه، والتباينُ اللوني، وأعرضُ الجوّال.

**ولا خطأ جافاسكربت واحدًا في الجولة كلّها.** وخرج منها **تسعةُ بنود**، **ثلاثةٌ منها
عيبٌ في تسليم المرحلة ٤٢ نفسها**.

### أ) ثلاثةٌ في عمل المرحلة السابقة

**١) صدى التاريخ كان لا يصل شيئًا.** أُضيف في ٤٢ ليكتب تحت حقل التاريخ ما اخترتَه
بالعربية، علاجًا لـ`mm/dd/yyyy`. وقِيس في ٤٣:

| أين | حقول التاريخ | ولها صدى |
|---|---|---|
| داخل الصفحات | **٠** | ٠ |
| داخل النوافذ | **٨** | **٠** |

السبب: `echoDates(page)` تمسح `#page`، **والنوافذ تُرسَم في `#modal-root` خارجه** —
وكلُّ حقول التاريخ في النظام داخل نوافذ. فالميزةُ في الكود ولا تصل شيئًا، **وذلك أسوأ من
غيابها لأنها أُعلنت منجَزة**. نُقلت إلى `dom.js` وتُستدعى من `openModal` نفسها، وشملت
`datetime-local` كذلك.

**٢) أُصلح زرّان وتُرك خمسةٌ وعشرون.** قال فحصُ ضاد في ٤٢ إنّ `task-list-title` و
`task-title-btn` دون الحدّ، فرُفعا. وقِيست صفحةُ المهامّ في ٤٣ على جوّال ٣٩٠: **٢٥ زرًّا
بـ٢٩×٣٢** في عرضَي «لوحة» و«قائمة» — أسهمُ النقل والتعديلُ والحذف على كلّ بطاقة، وأكثرُ
ما يُنقر فيها. والقاعدةُ مكتوبةٌ صراحةً `.task-card-actions .btn { min-height: 32px }`،
**وقد رُئيت في ٤٢ ولم تُصلَح**.

**٣) ولماذا لم يكشفها الفحص؟ لأنّ المسطرة نفسها كانت تكذب.**

```js
// tests/design-dhad.mjs — قبل
if (r.height < 30) out.push(...)
```

الحزمةُ اسمُها **«مساحات اللمس كافية»**، والقاعدةُ التي التزمها المشروع **٤٤**، والعتبةُ
المكتوبة **٣٠**. فكلُّ ما بين الثلاثين والثلاثة والأربعين يمرّ أخضر — ولم يُكشف في ٤٢
إلّا ما هبط دون الثلاثين، زرّان، وبقي خمسةٌ وعشرون.

> **وهذا أخطر الثلاثة**: عطبٌ في الكود يُكشف يومًا، **وعطبٌ في المسطرة يُخفي كلَّ ما
> بعده**. ورُفعت إلى ٤٤، فظهر معها لوحُ «صحة البيانات» (`health-item` بـ٤٠) وأُصلح —
> وهو رابطٌ يُنقر ليفتح صفحةً لا وسمًا يُقرأ.

### ب) عطبٌ رابع: ترقيم

«**٤ عرضًا** خارجيًا نشطًا» في الخريطة — وما بين الثلاثة والعشرة يُجمع. صارت «٤ عروض
خارجية نشطة» بـ`countWord`.

### ج) خمسةُ نواقص

**٤) لا سبيل لتسجيل صفقةٍ إلّا من خلال مطابقة** — وهو أوسعُها أثرًا. بحثٌ في الكود:

```
repo.deals.create  →  js/pages/matches.js:641   (موضعٌ واحدٌ في النظام كلِّه)
```

فبيعةٌ جاءت مباشرةً بلا طلبٍ مسجَّل، أو صفقةٌ قديمةٌ تُدخلها لتبني تاريخك، أو صفقةٌ على
عقارٍ لم يمرّ بمطابقة — **لا تُسجَّل أصلًا**. والصفقاتُ تغذّي توقّعَ العمولة، ولوحةَ
الداشبورد، وعائدَ المستثمر، وإقرارَ الضريبة، وربحيّةَ كلّ مصدر عملاء — **فما لا يُسجَّل
يُسقِط هذه كلَّها بصمت**.

بُنيت صفحةُ **«الصفقات»** (`js/pages/deals.js`): جدولٌ بحالة كلّ عمولة، وثلاثةُ مؤشّرات،
وبحث، واستمارةٌ فيها التاريخُ والسعرُ مطلوبَين **والعميلُ والعقارُ اختياريَّين** — صفقةٌ
قديمةٌ قد لا يكون طرفاها مسجَّلَين، ورقمٌ صحيحٌ بلا ربطٍ أنفعُ من غيابه. ومعها قبضُ
العمولة، ونهايةُ عقد الإيجار، والوسيطُ الشريك، وإنشاءُ فاتورةٍ بالعمولة.

**ولم يُلغَ مسارُ المطابقة**: ذاك أدقّ لأنه يربط الصفقة بطلبها وعرضها ويُغلقهما معًا،
وهذه لما لا مطابقةَ له. والصفحةُ **للمالك وحده** كالفواتير والمالية — صفحةُ عمولاتٍ كاملة.

**٥) الإعدادات ١٤٫٩ شاشةً و٢٢ لوحًا بلا تنقّل.** أُضيف فهرسٌ لاصقٌ برقيقةٍ لكلّ لوح،
وبحثٌ **يُخفي غيرَ الموافق ولا يحذفه** (فما كتبتَه في حقلٍ ولم تحفظه يبقى). وقِيس الأثر:
`13,746px` ← `1,265px` عند البحث عن «أوزان».

**٦) سلّة المحذوفات مدفونة** — مبنيّةٌ وتعمل، لكنّها قسمٌ داخل الإعدادات بلا رابطٍ في
الشريط، و`#/trash` يهبط بصاحبه على «يومي» صامتًا. صارت مسارًا ورابطًا، **والجسمُ نفسُه
مستوردٌ من `settings.js`** فلا نسخةَ ثانيةٌ تتباعد عن أصلها، والقسمُ باقٍ لمن اعتاده هناك.

**٧) الموجّه يبتلع أيّ مسارٍ مجهول صامتًا**: `#/zzz` تعرض «يومي» **والعنوانُ في الشريط
يبقى `#/zzz` وعنوانُ التبويب «يومي»**. فمن حفظ رابطًا قديمًا أو أسقط حرفًا رأى صفحةً
صحيحةً في مكانٍ خطأ. صار `routeName` يُعيد `null` للمجهول، فتُعرض صفحةُ «لا صفحة بهذا
العنوان» ومعها **ما كُتب في شريط العنوان**. والهاشُ الفارغ شأنٌ آخر: تلك صفحتُك الأولى
لا خطأ.

**٨) قائمةُ العقار في «تقدير السعر» مسطّحة** — بلا بحث؛ تكفي خمسةَ عشرَ ولا تكفي مئةً،
والمئاتُ هي الهدف المعلَن. أُضيف حقلُ تصفيةٍ **فوق القائمة لا بدلًا منها**، فالقائمةُ تبقى
قائمةً بقيمِها ولا يتبدّل تعاملُ بقيّة الصفحة معها.

**٩) والبندُ التاسع ظهر أثناء الإصلاح**: لوحةُ المتابعات في «يومي» كانت **تسكت خارج
أوقات الاتصال** (بعد العاشرة ليلًا وقبل السادسة صباحًا)، فتظنّ الترتيب اعتباطًا وقد كان
يُرتَّب بالفترة نهارًا. صارت تقولها في الحالين.

### وأربعةُ انكساراتٍ أحدثها الإصلاح نفسه — وكيف حُسمت

| ما انكسر | لماذا | الحسم |
|---|---|---|
| `hijri` · `profile-and-quick` | فهرسُ الإعدادات كان `.panel` **يحمل عناوين اللوحات كلَّها نصًّا**، فكلُّ `locator('.panel', {hasText})` يصيبه هو أوّلًا | صار `<nav>` — والوسمُ الدلاليّ أصحُّ هنا على كلّ حال. **الإصلاح في المنتج لا في الفحص** |
| `pricing` | استُبدلت المنسدلة بـ`datalist`، فضاعت قيمُ المعرّفات التي يتعامل بها بقيّةُ الصفحة والفحص | رُدّت المنسدلة وأُضيفت تصفيةٌ فوقها — **لا واجهةَ تُفقَد لأجل ميزة** |
| `voice-unit` | «لا صفحة في القائمة بلا اسمٍ منطوق»: الصفحتان الجديدتان بلا أسماء | أُضيفت أسماؤهما المنطوقة |
| `evidence-revival` | «الفترة الحالية معلَنة» تسقط كلَّ ليلةٍ بعد العاشرة — لا لعطبٍ بل لساعة التشغيل | المنتجُ صار يقولها في الحالين، والفحصُ يقبل الاثنين |

### الملفات المعدَّلة وسببها

| الملف | لماذا |
| --- | --- |
| `tests/design-dhad.mjs` | **المسطرة ٣٠ ← ٤٤** — وهي أوّلُ ما أُصلح، فلا يُصلَح بمسطرةٍ عوراء |
| `css/components.css` | ٢٥ زرًّا في المهامّ · `health-item` · فهرس الإعدادات |
| `js/util/dom.js` | `echoDates` تنتقل إليه وتُستدعى من `openModal` |
| `js/app.js` | صفحةُ «غير موجودة» · مسارا الصفقات والسلّة · `OWNER_ONLY_ROUTES` |
| `js/pages/deals.js` · `js/pages/trash.js` | **جديدان** |
| `js/pages/settings.js` | الفهرس والبحث · `panelId` · تصدير `trashBody` · ترقيمٌ عربيّ |
| `js/pages/pricing.js` · `js/pages/map.js` · `js/pages/today.js` | التصفية · الجمع · الفترة خارج أوقات الاتصال |
| `js/util/sidebar.js` · `js/util/voice-commands.js` · `index.html` | الصفحتان الجديدتان في الشريط والترتيب والأمر الصوتيّ |
| `tests/deals-router.mjs` | **جديدة** — ٢٥ فحصًا للبنود الستّة |
| `tests/evidence-revival.mjs` | حدٌّ كان يتبع ساعةَ التشغيل |

### لم يُمسّ

- **`DB_VERSION` باقٍ ٩**، ولا مخزنَ جديد: صفحةُ الصفقات تقرأ `deals` وتكتب فيه كما كان
  مسارُ المطابقة يفعل — **بالحقول نفسها**، ومنها `checklist` تُنسخ من القالب لحظة الإنشاء.
- **مسارُ المطابقة → «أُبرمت» كما هو حرفًا بحرف**: لم يُنقل منطقُه ولم يُعَد استعماله.
- منطقُ المطابقة والتسعير والقمع والتقويم كما هو.
- لا مفتاحَ ولا سرَّ في المستودع ولا في قاعدة البيانات ولا في النسخ.

---

## ٥١. المرحلة ٤٤ — حارسُ المدخلات، ومعجمُ المعدودات

جولةٌ ثالثةٌ مستخدِمًا — **إجهادًا لا تصفّحًا**: مدخلاتٌ قاسية، ودورةُ نسخٍ واسترجاعٍ
كاملة، وتبويبان على البيانات نفسها، والصفحةُ العامة، والتنقّلُ بالكيبورد، وتطابُقُ
الأرقام عبر الصفحات. **ولا خطأ جافاسكربت واحدًا فيها.** وخرج منها تسعةُ بنود.

> وطبيعةُ ما يُوجَد تغيّرت: لم تعد `null` على الشاشة ولا عناوينُ مشوَّهة، بل **مسائلُ
> حدودٍ وسياسة**: ماذا يفعل النظام بسعرٍ سالب، وبنصٍّ في حقل رقم. وهذه لا تظهر
> بالتصفّح — تظهر بالدفع.

### أ) حارسُ المدخلات — أربعةُ أعطابٍ يحسمها مبدأ واحد

**«ما لا يُقرأ يُقال، ولا يُبتلع»** — وهي قاعدةُ النظام المعلَنة في عشرين موضعًا، وكانت
طبقةُ البيانات نفسُها تنقضها:

| ما جُرِّب | ما كان يحدث | ما صار |
|---|---|---|
| «مليونين» في حقل السعر | `null` صامتًا، والعقارُ يُحفظ بلا سعر | «لم يُقرأ «السعر»: كُتب فيه «مليونين» وليس رقمًا» |
| «جوالي عندك» في حقل الجوال | فراغٌ صامت، والعميلُ يُحفظ بلا رقمٍ يظنّه مسجَّلًا | «لم يُقرأ «الجوال»…» |
| سعرٌ `-5,000` | يُحفظ **ويدخل وسيط سعر الحي** فيُفسد تقديرَ كلّ عقارٍ فيه | ««السعر» لا يكون بالسالب» |
| مساحةٌ وعمولةٌ ونصيبُ شريكٍ بالسالب | تُقبل | تُرفض |

والآليّة: `numField` تجمع ما سقط في `DROPPED` (رمزٌ غيرُ محصيّ فلا يُحفظ)، و`reportDropped`
تحوّله أخطاءً في التحقّق — **لأنّ التهيئة لا تملك قائمةَ الأخطاء والتحقّقُ يليها**.

**وسقفُ المعقول يُسأل عنه ولا يُمنع.** `999,999,999,999` خطأُ أصفارٍ يقع بالإصبع، وكان
يُقبل فيُنتج «٢٬٥٠٠٬٠٠٠٬٠٠٠ ريال/م²». **والمنعُ خطأ**: بُرجٌ بمليارٍ موجودٌ فعلًا. فصار
نموذجُ العقار يسأل مرّةً حين يتجاوز سعرُ المتر نصفَ مليون، ومن أكّد مضى.

**وعقدُ الإدارة صار مفروضًا لا موصوفًا.** شكلُه مكتوبٌ في `schema.js` تعليقًا منذ المرحلة
٣٨، **ولم يكن مفروضًا**: من كتب `contractEnd` بدل `endAt` ضاع حقلُه صامتًا وقرأ النظامُ
«سارٍ بلا نهاية محدَّدة» — صادقٌ فيما قرأ، والمستخدمُ يظنّ أنّه سجّل نهاية. **وهذا ما
أوقعني أنا في الجولة.** فصار المفتاحُ المجهول يُقال، والنهايةُ قبل البداية تُرفض.

### ب) معجمُ المعدودات — ١١٩ موضعًا

قِيس حيًّا: «**3 عقار** مختار» · «**2 التقاط** بانتظار الاعتماد» · «**11 عقار** ناقص
البيانات» · «**1 عرض** خارجي» · «**3 عمولة** لم تُقبض» — **وهذه الأخيرة في صفحة الصفقات
المبنيّة في المرحلة ٤٣ نفسها**.

ومسحُ المستودع وجد **١١٩ موضعًا** يُلصق فيها العددُ باسمٍ مفرد. وليست مسألةَ ذوق: العددُ
في العربية **يغيّر معدوده** (١ مفرد · ٢ مثنّى · ٣–١٠ جمع · ١١+ مفردٌ منصوب)، **فأيُّ صيغةٍ
ثابتةٍ خاطئةٌ لبعض القيم**.

و`countWord` موجودةٌ منذ المرحلة ١٧ ومستعملةٌ في ٣٥ موضعًا — **لكنّها تطلب أربعَ صيغٍ عند
كل نداء، وذلك عبءٌ يُترك**. فأُضيف **معجمٌ** (`NOUNS`) فيه ٤٧ مدخلًا مراجَعًا، وصار النداء
`countOf(n, 'عقار')`، فلا يبقى للإهمال عذر.

**والوصفُ يتبع معدودَه كذلك**: «٣ عقارات **ناقص**» ليست عربيّةً كما أنّ «٣ عقار» ليست.
فأُضيفت تسعةُ مركَّباتٍ (`'عقار ناقص'`, `'عرض خارجي'`, `'طلب نشط'`…) تحمل الوصفَ مع اسمه.

**وحزمةُ فحصٍ تمنع العودة**: `guard-plural-unit` تمسح ملفّات `js` كلَّها وتسقط إن وُجد
عددٌ ملصوقٌ باسمٍ من المعجم. **وقد أسقطت سبعةَ مواضعَ فاتت المحوّلَ الآليّ** (لأنه بدّل
أوّلَ مطابقةٍ في السطر فقط)، فأُصلحت.

### ج) الرقائقُ الصفريّة تُطوى ولا تُحذف

الأنواعُ الستّة المدمجة في المرحلة ٤٢ (عمارة · محل · مكتب · مستودع · استراحة · مزرعة)
صارت **صفَّ رقائقَ بأصفارها** لمن لا يملك منها شيئًا — في الصفحة التي عُمل في ٤٢ على
**تقصير** فلاترها. **ولا تُحذف**: «لا محلّات عندك» خبرٌ لا فراغ. فتُطوى خلف «+ ٦ بلا
نتائج» وتُفتح بنقرة.

### د) تبويبٌ آخر يُنبَّه عليه

تبويبان على البيانات نفسها: **آخرُ كتابةٍ تغلب** — وذلك صوابٌ لجهازٍ واحد ولا يُراد
تغييره (قفلُ السجلّات بين تبويبَي المستخدم نفسه تعقيدٌ بلا مقابل). **لكنّه كان صامتًا.**
فصار التبويبُ يعلم بفتح غيره عبر `BroadcastChannel` (أو `storage` حيث لا تتوفّر) فيُنبّه
مرّةً واحدة — **ولا يُرسَل في القناة إلا وقت**.

### ولم يُغيَّر: رابطُ التخطّي

«٢٦ ضغطةَ Tab قبل المحتوى» — ورابطُ «تخطَّ إلى المحتوى» موجودٌ ويعمل وهو **أوّلُ ما
يُركَّز عليه**، ومخفيٌّ حتى يُطلب، وبارتفاع ٤٤. وهو الحلُّ المعياريّ لهذه المسألة بعينها،
فلا شيءَ يُصلَح.

### ما وجدته الجولةُ متينًا

- **النسخةُ الاحتياطية دورةً كاملة**: ١٨ مخزنًا + الإعدادات + ٥ صور · تصدير ← **مسحٌ تامّ**
  ← استرجاع → **عاد كلُّ شيء بالضبط**، والإيموجي والسطران في الملاحظة كما كُتبا.
- **الأرقام تتفق عبر أربع صفحات**: ١٥٠٬٠٠٠ ريال في الصفقات والداشبورد (شهريًّا وسنويًّا)
  والمالية — بلا سجلٍّ شارد.
- **الصفحةُ العامة لا تُسرّب** اسمَ مالكٍ ولا جوالًا ولا ملاحظةً داخلية، وفيها فخُّ سبام.
- **لا قسمةَ على صفر**: مساحةُ صفرٍ لا تُنتج `Infinity` ولا `NaN`.
- **`<script>` في الاسم يُخزَّن ويُعرض نصًّا** — لا `innerHTML` في المشروع كلِّه.

### وثلاثةُ انكساراتٍ أحدثها الإصلاح — واثنان منها خطأٌ عربيّ ونسيانُ استيراد

- **`مرشّحون` في المعجم خطأ**: جمعُ المذكر السالم بعد العدد منصوبٌ — «٥ **مرشّحين**» لا
  «مرشّحون». كشفتها حزمةُ `profile-and-quick`، فصُحّح **المعجمُ** لا الفحص.
- **`countOf` استُعملت في `tasks.js` بلا استيراد**، فانهار عرضُ الجدول كلُّه بـ
  `ReferenceError`. والسببُ أنّ السطر أُضيف **بعد** جولة إضافة الاستيرادات. وأُضيف بعده
  فحصٌ يستورد كلّ وحدةٍ في `js/` فعليًّا، فلا يمرّ نقصُ استيرادٍ ثانيةً.
- **توقّعان قديمان**: «يظهر بعدد المختار» كان يطلب الرقم `2`، **والمثنّى في العربية لا
  يُسبق برقم** («عقاران مختاران»)؛ و«عقارًا ظاهرًا» صارت تتبع العدد.

### الملفات المعدَّلة وسببها

| الملف | لماذا |
| --- | --- |
| `js/data/repository.js` | `numField` · `nonNegative` · `reportDropped` · الجوالُ الساقط · مفاتيحُ عقد الإدارة |
| `js/util/format.js` | معجمُ `NOUNS` (٤٧ مدخلًا + ٩ مركَّبات) و`countOf` |
| ٢٣ ملفًّا في `js/pages` و`js/util` و`js/data` | ١١٩ موضعَ ترقيمٍ حُوِّلت إلى `countOf` |
| `js/pages/properties.js` | سقفُ المعقول سؤالًا · طيُّ الرقائق الصفريّة |
| `js/app.js` · `css/components.css` | `watchOtherTabs` · `.chips-zero` |
| `tests/guard-plural-unit.mjs` · `tests/guard-input.mjs` | **جديدتان** — ٣٢ فحصًا، وفيهما ماسحٌ يمنع عودة العطب |
| `tests/{expenses-and-tools,import-route-qr,profile-and-quick}.mjs` | ثلاثةُ توقّعاتٍ تتبع الصيغةَ الصحيحة الآن |

### لم يُمسّ

- **`DB_VERSION` باقٍ ٩** ولا مخزنَ جديد ولا حقلَ جديد: هذه المرحلة **قواعدُ قبولٍ وصياغة**
  لا بنية.
- **السجلّاتُ القديمة تُقرأ كما هي**: الحارسُ يعمل عند الكتابة وحدها، فسعرٌ سالبٌ حُفظ قبله
  يبقى ويُعرض — ولا تُعدَّل بياناتُك من خلف ظهرك.
- منطقُ المطابقة والتسعير والقمع والتقويم والنسخ كما هو.

## ٥٢. المرحلة ٤٥ — سقفٌ كان ينتظر، ومزامنةٌ كان محرّكها جاهزًا

ستّةُ بنودٍ من مقترحاتٍ عُرضت وأُقرّت. وأكثرُها ليس ميزةً تُضاف: **ثلاثةٌ منها أعطابٌ
كانت تنتظر وقتَها** — سقفٌ يقع حين يكبر مكتبُك، وجمعُ كتلٍ لا يجمع، ورقمُ عمولةٍ يكذب.

> والاقتراحُ السابع — أرقامُ السوق من صفقات وزارة العدل — **لم يُنفَّذ ولا يُدَّعى**:
> لا واجهةَ برمجيّةً مجانيّةً له، والمزوّدون التجاريّون باشتراك. ومؤشّرُ السعر يبقى
> **مؤشّرَ محفظتك** لا مؤشّرَ الحيّ، وهذا مكتوبٌ في الصفحة نفسها.

### أ) سقفُ ٤٫٥ ميغابايت — عطبٌ لم يكن قد وقع بعد

`uploadBackup` كانت تشفّر النسخة **كتلةً واحدة** وترميها كاملةً فوق الحدّ. والصورُ تُجزَّأ
منذ المرحلة ٣٥، والبياناتُ لا. فمع آلاف العميل بمطابقاتهم ومهامّهم — وهو المستهدَف
المعلَن — يُبلَغ الحدُّ، وحينها **لا نسخة سحابية أصلًا**: لا ناقصةٌ ولا كاملة.

فصارت تُقطَّع بـ`splitUtf8`، **بالبايت لا بالحرف** لأن الحدّ حدُّ بايتات (والحرف العربي
بايتان والإيموجي أربعة)، **وبلا شقّ محرف**: بايتُ التكملة في UTF-8 نمطه `10xxxxxx`،
فيُتراجَع عنه حتى يُوقَف على أوّل بايتٍ في محرف. ووصلُ القطع يعيد الأصل حرفًا حرفًا.

والكتلةُ الواحدة تُرفع بشكلها القديم بلا `part` — فلا يتغيّر مفتاحُها ولا تنكسر نسخةٌ
رُفعت قبل هذه المرحلة.

### ب) وعطبٌ كان واقعًا منذ عشر مراحل: استرجاع الصور متعدّد الكتل

`restoreImages` كانت تجمع كتلَ الدفعة بـ`at`. و**`at` ختمُ الخادم لكلّ طلبٍ على حدة** —
يُكتب `new Date()` في كلّ POST. وكتلُ الدفعة الواحدة تصل في ثوانٍ متفرّقة، فكان الجمع
يفرّقها إلى دفعاتٍ ناقصة، ثم يرفضها الاسترجاع جميعًا برسالة «الدفعة ناقصة» — **وهي تصف
عطبَ العدّ لا عطبَ الخزنة**. ومكتبةُ صورٍ تتجاوز ثلاثة ميغابايت لم تكن تُسترجع أبدًا.

و`batch` كان يُخزَّن في البيانات الوصفية **ولا يُعاد في القائمة**. فصار يُعاد، وصار
الجمعُ به في `groupBatches`، وصار **التقليمُ على الخادم بالدفعة لا بالعدد** للبيانات
كما للصور — إذ `slice(5)` على كتلٍ مجزَّأة يقصّ **وسط دفعةٍ حيّة**.

### ج) المزامنة بين الأجهزة — المحرّك كان جاهزًا والدورة ناقصة

`mergeBackup` يدمج سجلًّا سجلًّا بختم `updatedAt` **ويحترم شواهد الحذف**. وهذه دلالةُ
المزامنة بعينها، وكانت مربوطةً بزرٍّ لا بدورة. فصار `js/data/sync.js`:

**اسحب ← ادمج ← ارفع**، والترتيب ليس اعتباطًا: الرفعُ بعد الدمج يرفع **اتّحاد** الجهازين،
فلا تمحو رفعةُ هذا ما كتبه ذاك. ورفعٌ عند `visibilitychange` لا `beforeunload` — الأخير
لا يُطلَق على iOS حين يُبدَّل التطبيق، وهو أكثرُ ما يقع في الجوّال.

**وحدودُها معلنة:** لا تحلّ تعارضًا داخل السجلّ الواحد (الأحدثُ كتابةً يغلب والآخر يذهب)،
ولا تنقل الإعدادات ولا الصور، ولا ترفع جهازًا فارغًا فوق نسخةٍ صالحة. **وفشلُها يُقال**
في لوحة الإعدادات: مزامنةٌ صامتة أسوأ من لا مزامنة، لأنك تحسب جهازيك متّفقين وهما مفترقان.

**ولا تُعاد الصفحةُ تلقائيًّا** حين يأتي الدمجُ بجديد: هي تعمل وأنت تكتب. يُقال لك ما وصل
وزرُّ التحديث بيدك.

### د) أقساط العمولة — رقمٌ كان يكذب في تقريرك

`commissionPaidAt` تاريخٌ واحد: قُبضت أو لم تُقبض. والواقع نصفٌ عند التوقيع ونصفٌ عند
الإفراغ — فكانت الصفقة تُسجَّل مقبوضةً بالكامل وهو كذب، أو غيرَ مقبوضة وهو كذبٌ آخر.
**و`commissionReceivables` تقوم على هذا الرقم**، فيخرج تقريرُ مستحقّاتك مغلوطًا.

فصار `commissionPayments` كشكل دفعات الإيجار، و`commissionState` يحسم الحال. **وشرطُه
أرخى من دفعات الإيجار عمدًا**: دفعةُ إيجارٍ بلا موعدٍ لا معنى لها، أمّا «نصفٌ عند الإفراغ»
فمبلغٌ معلومٌ وموعدُه مجهول — واشتراطُ تاريخٍ عليه يعني أن يخترع المستخدم تاريخًا أو
يُمحى قسطُه صامتًا.

**وثلاثةُ حدودٍ تُحفظ:**
- **بلا أقساطٍ لا يتغيّر شيء**: `commissionPaidAt` هو الحَكَم كما كان منذ المرحلة ١٧،
  فلا هجرةَ لسجلٍّ واحد.
- **وما لم يُجدَّل لا يضيع**: من كتب عمولةً ١٠٠ ألفًا وجدول ٤٠ فله ٦٠ **غير مجدولة**
  تظهر صفًّا في المستحقّات على تاريخ الصفقة.
- **وأقساطٌ فوق العمولة تُرفض** في التحقّق، لا تُصحَّح من خلف ظهرك.

وعمرُ القسط المتأخّر **من موعده هو** لا من تاريخ الصفقة — وإلا لظهر قسطٌ يستحقّ بعد
شهرين متأخّرًا اليوم.

### هـ) «كم أحتاج نقدًا يوم الإفراغ؟»

الحاسبة تقول القسط الشهري وأقصى سعرٍ يحتمله الدخل، **ولم تكن تقول المبلغ النقديّ**.
وبحثٌ في المشروع كلِّه لم يجد ذكرًا لرسوم التصرفات العقارية.

فصارت `closingCosts`: الدفعة الأولى + رسوم التصرفات + العمولة + ضريبتها + رسوم البنك،
**بندًا بندًا لا مجموعًا مبهمًا**. وعلى مليونٍ بالنِّسب الشائعة: **٨٣٬٧٥٠ ريالًا فوق
الدفعة الأولى** لم يكن المشتري يعلمها — وهي حيث تنكسر الصفقة في آخرها.

وكلُّ نسبةٍ **مُدخَلٌ** لا حكم: `rettRate` قابلةٌ للضبط و`rettExempt` تُصفّرها، فمن عرف
حالته أدخلها ومن لم يعرف لم يُخبَّأ عنه الرقم. وتحتها سطرٌ يقول إنه استرشاديّ لا فتوى.

### و) الأرشفة — وحدُّها معلَن

المرحلة ٣٥ حدَّت **ما يُرسم**، والفرزُ والبحثُ والعدّ باقيةٌ على المجموعة كاملة. فصار
`archivedAt` على العملاء والعقارات والطلبات، والمؤرشَف خارج القائمة اليومية وحدها.

**وهي ترشيحُ عرضٍ لا حذف:** السجلّ باقٍ، ويعود برقاقة «+ المؤرشف»، **ويبقى في تقاريرك
وأرقامك ومطابقتك كما كان**. ولو أُسقط منها لكذبت أرقامُ سنتك الماضية لأنك رتّبت قائمتك
اليوم. والأثرُ الحقيقيّ في الأداء واحد: **فحصُ التكرار** — أثقلُ فحصٍ في صفحة العملاء
لأنه يقارن كلَّ عميلٍ بكلّ عميل — صار لا يمسّ المؤرشف، وهو صوابٌ أيضًا: دمجُ ما طويتَه
عمدًا ليس عملًا تريده.

والمعيار **آخرُ تعديلٍ لا تاريخُ الإنشاء**: من أُنشئ قبل سنتين وكلّمته أمس حيٌّ لا أرشيف.
والأرشفةُ بالجملة **بعددٍ يُقال قبلها وبقرارٍ يُطلب** — تغييرُ آلاف السجلّات بلا أن تطلبه
أسوأ من فوضى القائمة.

### وعطبٌ صغير على الطريق

`toast-error` صنفٌ **لا وجود له في الأنماط إطلاقًا**، وكان إنذارُ القفل التلقائي يستعمله
— فيظهر بلون التنبيه العادي لا بلون الخطر. وصار `toast error`، و`auto-lock-warn` صار
`toast-row` لأن المزامنة تحتاج الشكل نفسه.

### الملفات المعدَّلة وسببها

| الملف | لماذا |
| --- | --- |
| `js/data/vault.js` | `splitUtf8` · `groupBatches` · `listBackupBatches` · رفعٌ كتلًا · وصلُ الدفعة |
| `netlify/functions/vault.js` | `batch` يُعاد في القائمة · التقليم بالدفعة للبيانات كما للصور |
| `js/data/sync.js` | **جديد** — دورة المزامنة كاملةً بحدودها |
| `js/data/settings.js` · `js/app.js` | مفاتيح المزامنة · `startDeviceSync` · تصحيحُ تعليقٍ كان يدّعي أن البيانات لا تبلغ الحدّ |
| `js/pages/settings.js` | الدفعةُ صفٌّ واحد لا صفوف · مفتاح المزامنة وحالتُها وزرُّها |
| `js/util/duplicates.js` · `js/pages/today.js` | `advertiser` (من المعلن؟) · بطاقةُ «عقارك معروضٌ عند غيرك» |
| `js/util/receivables.js` | `commissionState` · المستحقّات قسطًا قسطًا بموعده |
| `js/data/schema.js` · `js/data/repository.js` | `commissionPayments` · `archivedAt` · تهيئتُهما وتحقّقُهما |
| `js/pages/deals.js` · `js/pages/client.js` | محرّرُ الأقساط · الحالُ من `commissionState` لا من التاريخ |
| `js/util/finance.js` · `js/pages/pricing.js` | `closingCosts` ولوحتُها |
| `js/util/archive.js` | **جديد** — المرشَّحون والقسمة |
| `js/pages/clients.js` · `js/pages/properties.js` · `js/pages/requests.js` | الرقاقةُ والأرشفةُ فردًا وجملةً |
| `css/components.css` | `.toast-row` بدل `.auto-lock-warn` |
| `tests/{vault-chunk,commission-instalments,closing-costs,archive}-unit.mjs` · `tests/sync-devices.mjs` | **خمسٌ جديدة** |

### لم يُمسّ

- **`DB_VERSION` باقٍ ٩**: `commissionPayments` و`archivedAt` حقلان في سجلّات قائمة، ولا
  مخزنَ جديد ولا فهرسَ جديد.
- **السجلّاتُ القديمة تُقرأ كما هي**: صفقةٌ بلا أقساط تعمل كما كانت، وسجلٌّ بلا `archivedAt`
  غيرُ مؤرشف، ونسخةٌ سحابية بلا `batch` دفعةٌ كاملةٌ بنفسها.
- **الداشبورد والمالية والتوقّع والمطابقة** لا ترى أرشفةً أصلًا.
- **الإعدادات والصور** خارج المزامنة، لكلٍّ زرُّه الصريح كما كان.

## ٥٣. المرحلة ٤٦ — أربعةُ أعطابٍ وثلاثُ فجوات

سبعةُ بنودٍ عُرضت وأُقرّت. **وأربعةٌ منها أعطابٌ قائمة، ثلاثةٌ منها في شيفرةٍ كُتبت في
المرحلتين ٤٣ و٤٥** — تُقال كما هي.

### أ) العقار المبيع كان يبقى معروضًا

تسجيلُ الصفقة من المطابقة يقفل العقار (`matches.js`)، **وصفحةُ الصفقات لا تفعل ذلك
إطلاقًا**: لا ذكرَ لـ`properties.update` في الملفّ كلِّه. فالعقارُ الذي بِعتَه يبقى
«متاحًا» — يُطابَق على طلبات عملائك فتَعرض على مشترٍ ما بِيع، ويُنشر في صفحتك العامة،
ويُحسب في مؤشّر سعر الحي **مخزونًا حيًّا** لا صفقةً منجزة.

وهي الصفحةُ التي بُنيت (المرحلة ٤٣) **للبيعة التي تأتيك مباشرةً بلا مطابقة** — أي للحالة
التي لا أحدَ فيها يقفل العقار بدلًا عنك.

**ولا يُخمَّن البيعُ من الإيجار:** لا طلبَ هنا يقول الغرض. فيُقترح بدلالةٍ ظاهرة (نهايةُ
عقدٍ مكتوبة = إيجار، وإلّا فغرضُ العقار)، **ويُعرض اختيارًا يُرى ويُغيَّر** — لا يقع صامتًا.

### ب) المزامنة كانت لا تعرف أنها عادت للشبكة

`sync.js` بلا مستمعٍ لـ`online` إطلاقًا. فالرفعةُ الفاشلة تنتهي عند رسالةٍ في الإعدادات،
و`dirty` باقيةٌ صحيحة والمؤقّت انطفأ — فلا تُرفع حتى تُغيّر شيئًا آخر أو تُغلق التطبيق
وتفتحه. وأكثرُ ما يقع هذا في السيارة.

فصار سلّمَ تباعدٍ (ثانيةٌ ← ربعُ ساعة) يقف عند آخر درجة — **ولا يُحاوَل بلا حدّ**: جوّالٌ
خارج التغطية ساعةً يُستنزف بمحاولةٍ كلَّ ثانية ولن تنجح. وعودةُ الشبكة تُلغي الانتظار
وتبدأ فورًا. **والسحبُ الفاشل يُعاد ولو لم تكتب أنت شيئًا** — فقد كتب جهازُك الآخر.

### ج) الأرشفة بالجملة كانت بلا رجعة

تسأل مرّةً ثم تمضي، وسلّةُ المحذوفات تغطّي الحذفَ لا الأرشفة. فإرجاعُ مئتين أُرشفت بالخطأ
كان مئتَي نافذة.

والدفعةُ الواحدة تحمل **ختمًا واحدًا**، فتساوي الختمِ هو ما يجمعها: «أعِدْ آخر أرشفة».
وصفُّ الرقائق نفسُه جُمع في `archiveRow` بعد أن كان مكرَّرًا حرفًا بحرف في ثلاث صفحات —
**وثالثُ زرٍّ يُضاف إليه هو ما يجعل التكرار عطبًا ينتظر**.

### د) وعقارٌ مكرَّر في مخزونك لم يكن له كاشف

`findDuplicates` للعملاء وحدهم، و`externalDuplicates` تقارن مخزونك بعروض **غيرك**. أمّا
مخزونك بنفسه فلا شيء يمسّه — وأنت تجول الأحياء وتُدخل العقارات، فالفلّةُ تدخل من جولتين.

**ودرجتان من اليقين:** رقمُ صكٍّ واحد (الصكّ يُعرّف القطعة) أو موقعٌ ضمن عشرين مترًا =
يقين؛ والمواصفاتُ المتقاربة = ظنٌّ يقرّره بصرُك. **وما بِيع أو أُجِّر أو أُرشف خارج
الفحص**: سجلٌّ منتهٍ تاريخٌ يُحفظ لا تكرارٌ يُدمج، ودمجُه يُفسد صفقةً مسجَّلة.

والدمجُ ينقل المطابقات والصفقات والمعاينات والمهامّ والصور والصوتيّات، ويدمج تاريخ السعر
زمنيًّا، **ويملأ الفارغَ من الحقول ولا يمسّ المملوء** — فسعرٌ كتبتَه بيدك لا يُستبدل بأقدمَ
منه لأن سجلَّه أغنى.

### هـ) البحث العام كان يفوته نصفُ النظام

ستّةٌ من عشرة. **وأربعةٌ لا يكفيها `searchKey`**: مفتاحُ الصفقة ملاحظاتُها واسمُ شريكها،
ومفتاحُ المعاينة ملاحظاتُها، ومفتاحُ المصروف ملاحظتُه، **والإيراد بلا مفتاحٍ أصلًا** (لا
تهيئةَ له في `repository.js`). فاسمُ مشترٍ أبرمتَ معه صفقةً لا يصل إليها البحثُ أبدًا،
وهو أوّلُ ما تبحث به.

فتُطابَق هذه **بسجلّاتها المرتبطة** في المتصفّح — لا هجرةَ بيانات ولا مفتاحٌ جديد،
**فتعمل على سجلّاتك القديمة كما تعمل على الجديدة**.

**وتوسيعُ البحث كان سينقض حجبًا قائمًا:** صفٌّ في النتيجة يحمل عمولةَ صفقة. فمجموعاتُ
الصفقات والمالية والفواتير موسومةٌ `[data-sensitive]` — بآليّة «وضع العرض للعميل» نفسها.

### و) رقمٌ بلا مقارنة لا يقول شيئًا

«١٢٠ ألفًا هذا الشهر» ليست خبرًا؛ خبرُها أنها أعلى من الشهر الماضي بالثلث أو أدنى منه
بالنصف. وبحثٌ عن «الشهر الماضي» في المشروع كلِّه: لا وجود لها.

**وحالتان تُقالان ولا تُحسبان نسبةً:** سابقٌ بصفرٍ («وكان صفرًا» لا «∞٪»)، وتساوٍ. **وفي
المصاريف ينقلب الحكمُ وحده** — النزولُ أخضر لأنه خبرٌ سارّ — **والسهمُ يتبع الرقم لا
الحكم**. والسابقُ **فترةٌ كاملة** لا ما مضى منها، وهذا مكتوبٌ تحت اللوحة كي لا يُظنّ
أوّلَ الشهر انخفاضًا.

### ز) سندُ قبضٍ يُطبع من الدفعة

الدفعات مسجَّلةٌ منذ المرحلة ٢٤، **ولا شيء يعطي الدافعَ ورقة**. والفواتيرُ لعمولتك أنت لا
لإيجارٍ تقبضه **نيابةً عن مالك**.

**والمبلغُ يُكتب رقمًا وكتابةً**، لأن الرقمَ وحده يُزاد عليه صفرٌ بقلم. والتفقيطُ حارسُ
الرقم لا بديلُه — ولذلك يُطبعان معًا.

**وتمييزُ العدد يتبع آخرَ لفظٍ فيه لا مقدارَه** — وهذا موضعُ الخطأ الشائع: «٣ ريال» و«٥٠٠
ألفًا» كلاهما غلط، والصواب «ثلاثة ريالات» و«خمسمائة ألف». **والمضافُ إلى تمييزه تسقط نونُه
وتنوينُه**: «ألفا ريال» لا «ألفان ريال»، و«أحد عشر ألف ريال» لا «أحد عشر ألفًا ريال»،
و«مائتا ألف» لا «مائتان ألف».

**وحارسٌ صارمٌ قبل التحويل:** `Number(null)` و`Number('')` و`Number([])` أصفارٌ في
جافاسكربت — فمبلغٌ غائبٌ كان سيُطبع «صفر ريال» في سند قبض. **وفراغٌ في السند أصدقُ من صفرٍ
لم يُكتب**، والصفرُ الصريح وحده يُقال صفرًا. وما بلغ المليار يُردّ رقمًا لا نصًّا خاطئًا.

### وثلاثةُ انكساراتٍ أحدثها العمل نفسُه

- **صفحةُ العقارات صارت ٣٣ ثانية بدل ثلاث** على خمسة آلاف سجلّ. والسببُ أنّ أوّلَ صيغةٍ
  من `propertyDuplicates` تقارن كلَّ عقارٍ بكلّ عقار (اثنا عشر مليون مقارنة) **وتُطبّع
  النصوصَ داخل الحلقة**. كشفتها حزمةُ `scale-perf`، ولولاها لشُحن.

  والعلاجُ ثلاثةٌ معًا: **تهيئةٌ مرّةً لكلّ سجلّ** لا مرّةً لكلّ مقارنة؛ ودلاءُ فرزٍ
  (خريطةٌ للصكوك، وخلايا شبكةٍ بحجم العتبة للمواقع، ودلوٌ بالمدينة والحي والنوع
  للمواصفات) — فلا يُقارَن إلا الجوار؛ **وفرزٌ بالمساحة داخل الدلو ووقوفٌ عند أوّل بعيد**،
  إذ الفرقُ النسبيّ يزداد بازدياد المساحة فما بعد البعيد أبعد.

- **والكشفُ كان يُعاد مع كلّ حرفٍ في البحث**: `renderList` تُستدعى مع كلّ رقاقةِ فلترٍ وكلّ
  ضغطةِ مفتاح. والنتيجةُ **لا تتغيّر بالفلترة أصلًا** — هي عن المخزون كلِّه لا عمّا يُعرض
  منه. فصارت تُحسب مرّةً لكلّ تحميل.

- **`Number(null)` صفر**، فمبلغٌ غائبٌ كان سيُطبع «صفر ريال» في سند قبض (انظر «ز» أعلاه).

### وعطبان صغيران على الطريق

- **`.print-signatures` و`.print-sign-line` بلا أنماطٍ إطلاقًا** منذ اتفاقية الوساطة
  (المرحلة ٣١): تُطبع الاتفاقيةُ بسطرَي «الطرف الأول/الثاني» متلاصقَين **بلا خطٍّ
  يُوقَّع عليه**. كُتبت لهما الأنماطُ الآن، فصلحت الاتفاقيةُ والسندُ معًا.
- **`.plan-step` كان عمودًا لا صفًّا**: `.input` عرضُها `100%`، وفي حاويةٍ مرنةٍ تلتفّ
  يأخذ كلُّ حقلٍ سطرًا. وكان يخفى لأن صفَّ الخطط يضع `width: 80px` بيده — فلمّا جاء صفُّ
  الدفعات بحقل تاريخٍ ورقمٍ بلا حيلة، ظهر العمود. (صُلح في المرحلة ٤٥ وتُذكر هنا للسجلّ.)

### الملفات المعدَّلة وسببها

| الملف | لماذا |
| --- | --- |
| `js/pages/deals.js` | حالةُ العقار بعد الصفقة · سندُ قبض القسط |
| `js/data/sync.js` | `runCycle` · `scheduleRetry` · مستمعُ `online` |
| `js/util/archive.js` | `lastArchiveBatch` · `archiveRow` المشترك |
| `js/pages/{clients,properties,requests}.js` | الصفُّ المشترك · التراجع عن آخر أرشفة |
| `js/util/duplicates.js` | `propertyDuplicates` · `suggestPropertyKeeper` |
| `js/data/repository.js` | `properties.mergeImpact` و`properties.merge` |
| `js/util/global-search.js` | أربعةُ كيانات · `linkedMatch` · وسمُ المجموعات الحسّاسة |
| `js/pages/dashboard.js` · `js/util/format.js` | `deltaOf` ورسمُه · `amountInWords` |
| `js/util/property-print.js` · `js/pages/client.js` | `printReceipt` وزرّاه |
| `css/components.css` | `.delta` · أنماطُ التوقيع التي لم تكن |
| `tests/{delta-receipt-unit,duplicates-unit}.mjs` | واحدةٌ جديدة، وأخرى وُسّعت |

### لم يُمسّ

- **`DB_VERSION` باقٍ ٩**: لا حقلَ جديد في هذه المرحلة ولا مخزن.
- **دمجُ العملاء** كما هو؛ ودمجُ العقارات مبنيٌّ على عهده نفسِه لا يغيّره.
- **المطابقةُ والتسعيرُ والنشر** لا ترى شيئًا من هذا — عدا أنّ العقار المقفل يخرج منها،
  وذلك هو المقصود.

## ٥٤. المرحلة ٤٧ — الموقعُ بخمس أعين: أربعةٌ وعشرون بندًا

قُرئ النظام من خمسة مواضع لا موضعٍ واحد: **وسيطٌ، ومديرُ أملاك، ووسيطُ استثمار، ومديرُ
كيانٍ تحته وسطاءُ ومسوّقون، وعينٌ تنظر إلى الشكل**. وخرجت أربعةٌ وعشرون بندًا، نُفّذت
كلُّها بالترتيب الذي خرجت به.

**وأكثرُها لم يكن نقصًا في الحساب، بل في الوصل**: منطقٌ مبنيٌّ منذ مراحلَ سابقة لا يبلغ
الشاشةَ التي يُحتاج فيها.

### أ) ما يخرج منك إلى الناس (٠١–٠٥)

**النشرُ كان لا يفحص ترخيصه.** `adBlockers` تحسب موانعَ الإعلان النظاميّة منذ المرحلة ٤٠:
لا عقدَ وساطة، أو عقدٌ نطاقُه لا يشمل التسويق، أو لا ترخيصَ إعلان، أو ترخيصٌ منتهٍ، أو
«فال» منتهية. **وكانت تُستعمل في صفحة العقارات وحدها**، وصفحةُ النشر لا تذكرها إطلاقًا.

فصار لكلّ عرضٍ عمودُ «الترخيص» في جدول الاختيار، وفحصٌ قبل كلّ رفع. **ولا منعَ قسريّ**:
قد يكون الترخيص صدر ولم تُدخله، والنظام لا يعرف إلّا ما كتبتَه. ولذلك بُنيت `choiceDialog`
— فالجوابُ هنا ثلاثةٌ لا اثنان: «انشر المرخَّصة وحدها» و«انشر الكلّ وأنا أعلم» و«ألغِ»،
وحشرُها في نعم/لا يُخفي أحدَها أو يجعله سؤالين متتاليين.

**ورقمُ الترخيص لم يكن يظهر في الإعلان أصلًا.** `adDisclosure` تُستعمل في نصّ واتساب وصفحة
العقود، **ولا تُستعمل في صفحتك العامّة** — وهي التي يراها كلُّ زائر. فصار يُرسَل مع كلّ
عرضٍ في اللقطة ويُطبع تحته.

**والعقارُ المبيع كان يبقى معروضًا.** النشرُ اختيارٌ يدويٌّ محفوظ بلا أيّ فحصٍ للحالة —
والمرحلةُ ٤٦ زادت الأمر حدّةً حين صار الإقفالُ تلقائيًّا عند تسجيل الصفقة: **فالنظامُ يعرف
أنه بِيع، وصفحتُك ما زالت تعرضه**. فبُنيت `publish-drift.js`: بصمةٌ لما نُشر (`status`
و`price` وحدهما — بصمةٌ تحفظ كلَّ حقلٍ تكبر بحجم مخزونك)، وشريطٌ يقول ما تغيّر. **ولا نشرَ
تلقائيّ**: ما يخرج إلى الناس يخرج بقرارك.

**وعميلٌ كان يحجز موعدًا وأنت مشغولٌ فيه.** صفحةُ الحجز تستبعد المحجوزَ **عبرها وحدها**،
ومواعيدُك في جهازك لا يراها الخادم. فصارت **أوقاتُك المشغولة** تُرفع مع كلّ نشرة: طوابعُ
زمنيّةٌ لا غير، بلا اسمٍ ولا عقارٍ ولا سبب — رقمٌ يقول «مشغول» ولا يقول بمَ. و`buildSlots`
تستبعد التداخلَ لا التطابقَ وحده.

**وتحذيرُ التخزين كان في المكان الذي لا يُفتح.** نصُّه بيده يقول إنّ الامتلاء «أثناء جولة
ميدانية يعني ضياع التقاط اليوم» — وهو في الإعدادات، التي لا تُفتح في الجولة ولا قبلها.
فصار في «يومي»، ومعه فحصٌ قبل بدء الالتقاط يقول كم صورةً تكفي المساحة.

### ب) ما بعد الصفقة (٠٦–٠٩)

**طلباتُ الصيانة لم يكن لها مكان.** بُحث في المشروع كلِّه: لا شيء إلّا كلمةَ «صيانة» في
*تلميحِ* حقلِ ملاحظاتِ عقد الإدارة. فصار للعقار `maintenance: []` — ما هو، ومتى، ومن يتحمّل
كلفته، وكم كلّف، ومتى أُنجز. **ومن يتحمّل الكلفة حقلٌ مستقلّ** لأنّه موضعُ الخلاف الأوّل بين
المالك والمستأجر، ولأنّ كشف المالك لا يخصم إلّا ما كان عليه هو.

**وكشفُ حساب المالك.** يسأل سؤالًا واحدًا كلَّ شهر: «كم لي؟»، وجوابُه كان يُجمع بيدك من
ثلاث شاشات. فصار `ownerStatement` يجمعها ولا يخترع شيئًا: الدفعاتُ من الصفقة، والأجرُ من
عقد الإدارة، والصيانةُ من بلاغات العقار. **وثلاثةُ قيود فيه**:

- المقبوضُ **بتاريخ قبضه** لا بتاريخ استحقاقه — الكشفُ يقول ما دخل في هذا الشهر.
- الأجرُ بالنسبة يُحسب **على ما قُبض فعلًا** — فلا أجرَ على مالٍ لم يصل.
- **ولا يُخصم إلّا ما أُنجز وكان على المالك**: بلاغٌ مفتوحٌ كلفتُه تقديرٌ لم يُصرَف بعد،
  وخصمُه اليومَ مطالبةٌ بمالٍ لم يُدفع؛ وصيانةٌ على المستأجر أو المكتب ليست على المالك.
  (هذا القيدُ الأخير **كشفه اختبارٌ لا مراجعة**: أوّلُ صيغةٍ كانت تخصم المفتوح.)

**والتجديدُ كان يُنبَّه عليه ولا يُنفَّذ.** `managementAlerts` تقول «ينتهي بعد ١٢ يومًا» ثم
تقف. فصار `renewalPlan` **يُحسب ولا يُنفَّذ**: يُعرض قبل أن يُعتمد. والتجديدُ عقدان لا عقد
— إدارتُك مع المالك وإيجارُ المستأجر، وكانا يُجدَّدان في شاشتين فيُنسى أحدُهما. **ولا
يُخترع مبلغ**: دفعاتُ السنة القادمة على قيمة آخر دفعةٍ مجدوَلة، فإن لم تكن فلا دفعاتٍ
تُقترح وتُذكر العلّةُ في نصّ التأكيد نفسِه.

**والمتأخّراتُ كانت تُعرض بالعقار لا بالشخص.** `arrearsByTenant` تجمعها بصاحبها: اسمًا،
وكم دفعةً، وكم مبلغًا، وأقدمَ ما فات، وجوالًا تضغطه — فمكالمةٌ واحدةٌ تُغني عن ثلاث. **ومن
لا مستأجرَ مسجَّلًا له يُفرد باسمه الصريح** ولا يُنسب إلى أحد.

### ج) الحاسبةُ تحسب ولا تعرف عقارك (١٠–١٢)

`rentalYield` تجيب سؤالًا افتراضيًّا: «لو اشتريتُ بكذا وأجّرتُ بكذا». **ولا شيء يجيب عن
الواقع**: «ما الذي أملكه، وكم عاد عليّ هذا العام؟». فبُني `investor.js`:

- **المتوقَّع** — الدفعاتُ المجدوَلة في الاثني عشر شهرًا **القادمة**، وإلّا فالأجرةُ
  المعروضة، وإلّا فلا شيء يُقال «غير معلوم».
- **الواقع** — ما قُبض فعلًا في الاثني عشر شهرًا **الماضية** بتاريخ قبضه.
- **والفجوة** — ما استُحقّ في السنة الماضية ولم يُقبض. وافتراقُ العمودين هو الخبر لا
  مجموعُهما.

**وقيمةُ التملّك هي أصعبُ ما فيه**: حقلُ `price` واحدٌ يحمل معنيين — ثمنَ تملّكٍ لعرض البيع
أو الاستثمار، و**أجرةً سنويّةً لعرض الإيجار**. وقسمةُ الأجرة على الأجرة عائدٌ كاذبٌ مئةٌ
بالمئة. فـ`capitalValue` تمتنع وتقول علّةَ امتناعها نصًّا يُعرض في الجدول. وعقارٌ مجهولُ
القيمة **يُعدّ ويُسمّى ولا يدخل كسرَ العائد** فيُفسده.

وأعمدةُ العائد دخلت **شاشة المقارنة** نفسَها: من يقارن ليستثمر يقارن بالعائد لا بالسعر
وحده.

### د) أكبرُ فجوةٍ في النظام (١٣–١٦)

`createdBy` و`updatedBy` مختومان على **كلّ سجلٍّ في كلّ مخزن** منذ أوّل المشروع. وبحثٌ
عنهما في صفحات العرض كلِّها: **صفر**. و`assignedTo` لا وجود له أصلًا.

فصار: أعضاءُ المكتب في الإعدادات، و`assignedTo` على العميل والعقار والطلب، ورقاقةُ
«المسندة إليّ» في كلّ قائمة، وتوزيعٌ بالتناوب، و**أداءُ الفريق من الحسابات نفسِها مصفّاةً
بصاحب العمل** — بلا معادلةٍ جديدة ولا مصدرِ حقيقةٍ ثانٍ. **والإسنادُ يغلب الإنشاء**: عميلٌ
أدخلتَه وأسندتَه إلى غيرك هو عميلُه لا عميلُك.

**والحدُّ يُقال قبل أن يُشترى وهم:** هذا **تمييزٌ وتنسيق، لا تصريحٌ وحجب**. التطبيق يعمل
على قاعدةٍ في متصفّح كلّ جهاز، فمن فتح الجهاز وصل إلى ما فيه مهما أخفت الواجهة. والفصلُ
الحقيقيّ يحتاج خادمًا يملك السجلّات ويصرّح بها سجلًّا سجلًّا — تحوّلٌ في البنية وكلفةٌ
شهريّة، **لا يُوصى به الآن**. والحدُّ مكتوبٌ في `role.js` منذ المرحلة ٣٥، وصار مكتوبًا في
لوحة الفريق وفي لوحة أدائه.

### هـ) الجمالُ والجاذبية (١٧–٢٠)

**لا رسمٌ بيانيٌّ واحد في النظام كلِّه.** الأرقامُ كلُّها قوائمُ وأزواجُ «اسمٌ ورقم». فبُني
`charts.js`: ثلاثةُ أشكالٍ بـSVG خالص — **بلا مكتبة**، إذ المشروع بلا أداة بناءٍ ولا حزم،
وإدخالُ مكتبةٍ لأجل ثلاثة أشكالٍ يجرّ ملفًّا يُحمَّل في كلّ فتحة وترقيمًا لاتينيًّا ومحاورَ
تبدأ من اليسار.

- **أعمدةٌ** لصفقاتك ستّةَ أشهر — **والأوّلُ إلى اليمين**، فالزمنُ في العربيّة يمينًا فيسارًا.
- **خطٌّ** لعمولتك اثني عشر شهرًا، يسير من اليمين إلى اليسار.
- **حلقةٌ** لحصص المصادر، تدور من القمّة مع عقارب الساعة.

**والرقمُ لا يعيش في الشكل وحده**: تحت كلّ رسمٍ سطرٌ يقول أرقامَه نصًّا، ولكلٍّ
`aria-label` كامل — فمن لا يرى الرسم (قارئُ شاشةٍ، أو ورقةٌ مطبوعة، أو شاشةٌ ضيّقة) يقرأ ما
فيه. **والقاعُ من الصفر** لا من أصغر قيمة، فلا يُضخَّم فرقٌ صغير.

**وأوّلُ دخولٍ كان يفتح على ثمانيةَ عشرَ بابًا بلا دليل.** فصارت بطاقةُ «ابدأ من هنا» في
«يومي» — وهي أوّلُ شاشةٍ تُفتح كلَّ صباح، والداشبوردُ يُفتح ليُقرأ لا ليُبتدأ منه.
**وحالُ كلّ خطوةٍ تُقرأ من بياناتك لا من علامةٍ تُرفع بالنقر**: من كتب اسم مكتبه فقد أنجز
الأولى سواءٌ مرّ بالبطاقة أم لم يمرّ. وتختفي وحدها متى تمّت، ويُخفيها صاحبُها متى شاء.

**والشاشةُ الفارغة كانت تقول «لا شيء» ولا تقول «افعل».** فوُسّعت `emptyState` لتقبل أكثرَ
من فعل، وصار كلُّ فراغٍ يحمل الفعلَ الذي يملؤه زرًّا وسطرًا يقول لماذا يفيده. **وأسوأُ
حالاته كانت «لا نتائج تطابق الفرز»**: تقول العدمَ ولا تقول أنّ الفرزَ سببُه — فصار معها
«امسح الفرز والبحث» يفعلُها.

**والصدقُ خُدش في موضعين.** أحدُهما العرضُ المبيع (٠٣ أعلاه). والآخرُ أنّ **مؤشّر سعر
المتر يُسمّى مؤشّرًا وهو مؤشّرُ محفظتك أنت**: مخزونُك المعتمد، وما أدخلتَه من عروضٍ
خارجية، وصفقاتُك المنجزة. وكان هذا مكتوبًا في صفحته وفي تقرير المالك، **والشارةُ التي تقول
«أعلى من وسيط الحي بـ١٢٪» تظهر في بطاقة كلّ عقار** فتُقرأ حكمًا من السوق. فصارت
`INDEX_SCOPE_NOTE` تُقال في كلّ موضعٍ يُستشهد به فيه، ومعها حجمُ العيّنة.

### و) أربعةٌ تعبر الأدوار (٢١–٢٤)

**المحاسبُ يطلب المصاريف والإيرادات، والتصديرُ لا يشملهما.** كان خمسةً؛ صار سبعة. **وبمدًى
زمنيٍّ يُختار** — فملفُّ الربع لا ملفُّ العمر، ومعه زرُّ «الربع الماضي» (المنقضي لا الجاري:
ملفُّ ربعٍ لم ينتهِ ناقصٌ يُراجَع مرّتين). **وسجلٌّ بلا تاريخٍ يُستبعد متى حُدِّد مدًى**:
إدخالُه في ملفّ الربع ادّعاءُ أنّه وقع فيه.

**والقوالبُ لم تكن تعرف السياق.** مبنيّةٌ بمتغيّراتها منذ المرحلة ١١، وتُختار من قائمةٍ في
شاشةٍ أو شاشتين. فصار `suggestTemplate` يقترحها **في موضع الحاجة**: قالبُ المتابعة على
العميل المنقطع، و«رأيه في المعاينة» على المعاينة التي مضت بلا انطباع. **ولا يُرجَع أوّلُ
قالبٍ وُجد حين لا يناسب**: رسالةُ «مبارك عليك» إلى عميلٍ منقطعٍ أسوأ من لا رسالة. ومن حذف
قوالبه كلَّها لا يُقترح له شيءٌ ولا يُدسّ في إعداداته نصٌّ لم يكتبه.

**ولا سجلَّ لما يصل العميل.** تفتح واتساب بقالبٍ جاهز ولا يُسجَّل أنّك أرسلت، فسجلُّ
التواصل يتّكل على أن تعود وتكتب — وأكثرُ الناس لا يعود، فتظهر في «المتأخّرين» وأنت كلّمتَه
أمس.

**والحلُّ ليس أن يدّعي النظامُ ما لا يعلم**: فتحُ محادثةٍ ليس إرسالًا، والنظامُ يرى النقرةَ
عندك ولا يرى «إرسال» في تطبيقٍ آخر — ولن يراها أبدًا. فصار `openWhatsApp` يسجّل ما رآه
**موسومًا بأنّه مستنتَج**: يمنعك من تكرار الاتصال، ولا يشهد لك شهادةَ المؤكَّد. والوسمُ
يُعرض في سجلّ التواصل حيث يُقرأ.

**وصارت زرًّا لا رابطًا** في كلّ موضع: الرابطُ يفتح تبويبًا قبل أن يُسجَّل شيء، فيضيع
السجلّ متى أُغلقت الصفحة. **وإلى مستلمٍ تختاره داخل واتساب لا يُسجَّل شيء** — لا نعرف من هو
فلا يُخترع له سجلّ.

**والمزامنةُ بابٌ لم يُفتح لفريقك.** بُنيت في المرحلة ٤٥ لجهازيك أنت، وهي نفسُها تصلح
لجهازين لشخصين بالعبارة السرّية نفسها. **وحدُّها يُقال قبل أن تُستعمل هكذا**: عدّلتَ أنت
وموظّفك السجلَّ نفسه قبل أن يلتقي الجهازان؟ يبقى الأحدثُ ويذهب الآخرُ بلا إنذار. فهي تنفع
فريقًا يعمل على **عملاءَ متفرّقين** ولا تنفع اثنين على سجلٍّ واحد — **ولذلك الإسنادُ شرطُها
لا رفاهيةٌ فيها**. وهذا مكتوبٌ الآن في لوحتها لا في رأس ملفّها فقط.

### وثلاثةٌ كشفتها اللقطاتُ لا المراجعة

- **الزمنُ كان يسير معكوسًا في الرسوم الثلاثة.** `monthsBack` تُعيد الأحدثَ أوّلًا،
  والرسمُ يضع الأوّلَ يمينًا — فوقع الشهرُ الجاري في أقصى اليمين والأقدمُ في اليسار،
  **وهو عكسُ قراءة الزمن بالعربيّة**. كُشف باللقطة لا بالاختبار، إذ الهندسةُ صحيحةٌ
  والترتيبُ وحده مقلوب. فصارت اللوحاتُ تقلب الأشهرَ قبل الرسم.
- **و`text-anchor` انقلبت في طرفي الخطّ.** `start` و`end` **تتبعان اتّجاه الكتابة**،
  والصفحةُ من اليمين — فخرج اسما الشهرين عن الإطار مقصوصَين («أكت» و«عبر»). و`middle`
  لا اتّجاهَ لها، فصارت هي المستعملة في كلّ نصٍّ داخل رسم.
- **وقوسٌ رسمُه صحيحٌ ونصُّه يُقرأ مقلوبًا**: `(٨٣٪)` بين قوسين ينقلب ترتيبُها البصريّ في
  فقرةٍ عربيّة. فصار الفاصلُ نقطةً وسطى لا قوسين.

### وعطبان كشفتهما الاختبارات لا المراجعة

- **`valueOf` اسمٌ موروث.** دالّةُ التجميع الشهريّ كانت `byMonth(items, months, { dateOf,
  valueOf = () => 1 })`. وكلُّ كائنٍ يرث `valueOf` من `Object.prototype`، **فالقيمةُ
  الافتراضيّة في التفكيك لا تُستعمل أبدًا**، وتُستدعى الموروثةُ بلا `this` فتنفجر:
  `TypeError: Cannot convert undefined or null to object`. والداشبوردُ كلُّه لا يُرسم.
  كشفتها `expenses-and-tools` و`scale-perf`، وصارت `amountOf`.
- **كشفُ المالك كان يخصم صيانةً لم تُنجَز** (انظر «ب» أعلاه) — كشفته حزمةُ
  `management-unit` وهي تُكتب.

### الملفات المعدَّلة وسببها

| الملف | لماذا |
| --- | --- |
| `js/pages/publish.js` · `js/util/publish-drift.js` | بوّابةُ الترخيص · بصمةُ المنشور وانحرافُه · الأوقاتُ المشغولة |
| `netlify/lib/slots.js` · `netlify/functions/{book,offer}.js` | استبعادُ التداخل لا التطابق وحده |
| `offers/{app,list,style}.css/js` | رقمُ الترخيص تحت كلّ عرض |
| `js/util/dom.js` | `choiceDialog` · `emptyState` بأكثرَ من فعل |
| `js/data/images.js` · `js/pages/{today,tour-capture}.js` | `storageStatus` · تحذيرُ المساحة حيث يُحتاج |
| `js/util/team.js` · `js/data/settings.js` | أعضاءُ المكتب · الإسنادُ والتناوبُ والنسبة |
| `js/util/management.js` | الصيانة · `ownerStatement` · `arrearsByTenant` · `renewalPlan` |
| `js/pages/management.js` | لوحةُ المتأخّرين بالشخص · كشفُ المالك · التجديد بنقرة |
| `js/util/investor.js` · `js/pages/client.js` | المحفظة: المتوقَّع والواقع والفجوة |
| `js/util/charts.js` · `css/components.css` | ثلاثةُ أشكالٍ بـSVG خالص، بلا مكتبة |
| `js/util/onboarding.js` · `js/pages/today.js` | «ابدأ من هنا» — خطواتٌ تُقرأ من البيانات |
| `js/pages/{clients,properties,requests,invoices,expenses}.js` | حالاتُ فراغٍ تُرشد وتفعل |
| `js/data/exchange.js` · `js/pages/settings.js` | المصاريفُ والإيرادات · المدى الزمنيّ |
| `js/util/templates.js` | `suggestTemplate` · مواضعُ الحاجة |
| `js/util/outreach.js` · `js/data/repository.js` | تواصلٌ مستنتَجٌ موسوم |
| `js/util/price-stats.js` | `INDEX_SCOPE_NOTE` — حدُّ المؤشّر حيث يُستشهد به |
| `tests/{publish-gate,publish-drift,team,investor,charts,onboarding,export-templates}-unit.mjs` | سبعُ حزمٍ جديدة |
| `tests/five-eyes.mjs` | حزمةُ متصفّحٍ للمرحلة كلِّها — ٥٣ فحصًا |

### لم يُمسّ

- **`DB_VERSION` باقٍ ٩**: `maintenance` و`assignedTo` حقلان في سجلّاتٍ قائمة، يُطبَّعان في
  PREPARE ويُقرآن افتراضًا فارغًا — لا مخزنَ جديد ولا فهرس.
- **المطابقةُ والتسعيرُ** لا يتغيّر فيهما شيء: أُضيف إليهما قولُ حدِّهما لا تغييرُ حسابهما.
- **البوّابةُ والتشفير** كما هما؛ والفريقُ تمييزٌ لا تصريح.
- **الأسرارُ لا تدخل المستودع ولا IndexedDB ولا النسخ** — على عهدها.

## ٥٥. المرحلة ٤٨ — قراءةٌ ثانية: تسعةَ عشرَ بندًا

الأربعةُ والعشرون من المرحلة ٤٧ نُفِّذت كلُّها، ثمّ قُرئ النظام ثانيةً بالأعين الخمس
نفسِها. **ولم تُعَد البنودُ الأولى**: السؤالُ صار «ما الذي كشفه ما بُني؟».

والخيطُ الجامع لأكثرها واحد: **النظامُ صار يعرف أشياءَ لا يقولها** — حسابٌ يجري في ملفٍّ
ولا يبلغ الشاشةَ التي يُحتاج فيها، أو رقمٌ يُطبع ولا يُقيَّد، أو فشلٌ يُعرف ولا يُعلَن.

### أ) ما يقع أمام العميل (٠١–٠٤)

**الرخصُ كانت تنتهي بلا إنذار.** `falState` تحسب ما بقي من «فال»، و`adLicenseState` تحسبه
لكلّ ترخيص إعلان — **وكلتاهما لا تُستدعى إلّا داخل صفحة «العقود والتراخيص»**، صفحةٍ تُفتح
قصدًا ومن يفتحها يعرف أصلًا أنّ عنده ما ينتهي. و«يومي» ينبّه على *اتفاقيات الوساطة*
ولا يذكر الرخصَ إطلاقًا.

**والأثرُ أشدُّ من الاتفاقية**: فالٌ منتهيةٌ تُبطل توثيقَ العقود وإصدارَ التراخيص جميعًا —
لا ترخيصًا واحدًا — **وكلُّ إعلانٍ قائمٍ يصير مخالفةً في اليوم نفسِه**.

فصارت لوحةٌ واحدةٌ في «يومي» تجمع الثلاثة: الرخصةَ، والتراخيصَ، والاتفاقيّات.
**ومرتَّبةٌ بالخطر لا بالتاريخ**: «فال» أوّلًا مهما بعُد أجلُها. والمنشورُ بترخيصٍ منتهٍ
يُوسَم «منشورٌ الآن» — فتلك مخالفةٌ قائمةٌ اللحظةَ لا خطرٌ مستقبليّ. وفي صفحة النشر صار
الترخيصُ الموشك يُقال قبل النشر: **يُنبَّه ولا يُوقَف**، لأنّ النشرَ اليومَ نظاميّ.

**والصفحةُ العامة لم تكن تقول كم غرفة.** ما يخرج إلى الزائر: النوعُ والمدينةُ والحيُّ
والمساحةُ والسعرُ والملاحظات — **و`typeFields` لا يخرج**، وفيه الغرفُ ودوراتُ المياه
والدورُ وعمرُ البناء والواجهاتُ وعرضُ الشارع. فأوّلُ سؤالٍ يسأله المشتري لا جواب له إلّا
أن يُكتب بيدك في الملاحظات، **فيصير الحقلُ مكتوبًا مرّتين**.

وصارت تخرج **بمفاتيحها لا بعناوينها** — الصفحةُ تُعرض بلغتين، وعنوانٌ عربيٌّ مُرسَلٌ جاهزًا
يبقى عربيًّا في الإنجليزية. **وبقائمةٍ بيضاءَ صريحة**: رقمُ المخطط ورقمُ القطعة خارجها
قصدًا — معرّفان يُوصلان إلى الصك لا وصفٌ يُرغِّب.

**ولم تكن تقول منذ متى.** تاريخٌ واحدٌ للّقطة كلِّها، وهو تاريخُ آخر ضغطةٍ على «انشر» لا
عمرُ العرض. فصار لكلّ عرضٍ «مُدرَجٌ منذ…» من `createdAt`. **وهذا في صالحك لا ضدَّك**:
الطازجُ يُقرأ طازجًا بدل أن يُخلط، والقديمُ يُعرف فيُفاوَض عليه بدل أن يُتجاهَل.

**والجوّالُ كان يقرأ نصفَ الجدول.** `.table { min-width: 900px }` وشاشةُ الجوّال ٣٩٠ —
جُرِّب على «إدارة الأملاك»: **خمسةُ أعمدةٍ من عشرة**، وينقطع في منتصف خليّة. والترتيبُ
يضاعف العطب: المتأخّرُ والصيانةُ والأزرارُ آخرُها، أي أبعدُها.

**والعلاجُ ليس تعديلَ ثلاثين موضعًا** يُبنى فيها جدول: كلُّ خليّةٍ تحتاج عنوانَ عمودها
إلى جانبها لتُقرأ وحدها. فيُنسخ العنوانُ من `<thead>` إلى `data-label`، وورقةُ الأنماط
تتكفّل بالباقي. **وموضعٌ واحدٌ يلحق كلَّ جدولٍ في النظام** — الموجودَ اليوم والذي يُضاف
غدًا — بمراقبٍ على `#page` لا باستدعاءٍ بعد كلّ تنقّل، لأنّ الصفحات تُعيد رسمَ قوائمها من
داخلها بلا مرورٍ بالموجّه. **ولا يعمل إلّا على الشاشة الضيّقة**: وسمُ خمسة آلاف خليّةٍ على
شاشةٍ واسعةٍ ثمنٌ بلا مقابل.

### ب) دورةُ الإدارة تصل الدفتر (٠٥–٠٨)

**أجرُ الإدارة كان يُحسب ويُطبع ولا يُقيَّد.** بحثٌ عن `incomes.create` في المشروع كلِّه:
لا وجود له خارج صفحة المالية. فدخلُك المتكرّر — **وهو أثبتُ دخلٍ في عملك، لا يتعلّق بصفقةٍ
تقع أو لا تقع** — لا يدخل صافي ربحك إلّا أن تكتبه بيدك كلَّ شهرٍ لكلّ عقار.

فصار زرٌّ في صفّ العقار: **بقرارك لا تلقائيًّا** (الطباعةُ تتكرّر للمراجعة، والقيدُ لا
يُراجَع بتكرار)، **ومرّةً واحدةً لكلّ شهرٍ وعقار** — والعلامةُ على أنّه قُيِّد هي القيدُ
نفسُه، بحثًا عن إيرادِ إدارةٍ لهذا العقار في هذا الشهر، فلا تفترق حقيقتان في سجلّين.
**وتاريخُه آخرُ يومٍ في شهر الكشف** لا يومُ الضغط: أجرُ أغسطس أجرُ أغسطس ولو قُيِّد في
أكتوبر، وإلّا اختلّ ملفُّ الربع الذي يُصدَّر للمحاسب.

**والمصروفُ المتكرّر كان يُكتب اثنتي عشرة مرّة.** المهمّةُ لها `repeat` منذ المرحلة ١١،
والمالُ لا. فصارت علامةُ «يتكرّر شهريًّا»، ولوحةٌ في «المالية» تقول ما لم يُقيَّد بعد.
**والقيدُ يُقترح ولا يُكتب**: المبلغُ قد يتغيّر، **وقيدٌ يقع في دفترك بلا علمك أسوأُ من
قيدٍ يُنسى** — فالمنسيُّ تكتشفه وتُضيفه، والواقعُ بلا علمك تبني عليه قرارًا. والنظيرُ
يُعرف بالتصنيف والبيان معًا لا بالمبلغ، **ويُؤخذ مبلغُه من أحدث نسخة**.

**والعمارةُ لم تكن عمارة، بل عشرين سجلًّا** لا يعرف بعضُها بعضًا. فصار للعقار `building`
و`unitNo` — **نصًّا حرًّا لا مخزنًا ثانيًا**: المخزنُ يستلزم هجرةَ بيانات وشاشةَ إدارةٍ
ثالثة، والاسمُ يكفي للتجميع ويدخل مفتاح البحث. **والإملاءُ المتقارب مبنًى واحد** بتطبيعٍ
عربيّ («عمارة» و«عماره»)، **ويُعرض بأوّل إملاءٍ كتبتَه** لا بصيغةٍ مخترَعة. ولوحةُ
«المباني» تجيب السؤالَ الذي كان بلا جواب: كم مؤجَّرةٌ من كم، وكم دخلُها، ومتى تشغر الأولى.
**و«مؤجَّرة» = لها عقدٌ ومستأجرٌ مسجَّل** لا ما كُتبت حالتُه «مؤجَّر»، فالحالةُ تُنسى
والعقدُ لا يُنسى.

**والصيانةُ كانت تعرف كلفتَها ولا تعرف من نفّذها.** فصار `vendor` و`vendorPhone` في البلاغ،
وكلاهما في مفتاح البحث — «من أصلح المكيّف؟» يُسترجع باسمه.

### ج) المستثمر: من القياس إلى المقارنة (٠٩–١١)

**اللوحةُ كانت تقيس ولا تقارن**: عائدُ كلّ عقارٍ على حدة، وعائدُ المحفظة كلًّا —
**ولا تضع الاثنين في جملةٍ واحدة**. وتلك الجملةُ هي ورقةُ التفاوض كلُّها: بها يبيع
المستثمر الخاسرَ ويشتري بدله منك، **فتكسب عمولتين من رقمٍ كان محسوبًا عندك أصلًا**.

فصار `vsPortfolio` **نسبةً من متوسّط المحفظة لا فرقَ نقاطٍ مئويّة**: «أقلُّ بـ٤٠٪» تُفهم،
و«أقلُّ بنقطةٍ ونصف» لا تُفهم. **وترتيبُ الصفوف صار بالأسوأ أوّلًا** لا بالأغلى: المحفظةُ
تُقرأ لتُعالَج. وما لا عائدَ واقعًا له يبقى بلا مقارنةٍ ويقع آخرًا — **لا يتقدّم المجهولُ
على المعلوم**.

**والعائدُ كان على ثمن العقار، والمشتري يدفع الدفعةَ الأولى.** في `finance.js` دالّتان
جارتان لا تلتقيان: `rentalYield` تقسم على الثمن كاملًا، و`affordability` تحسب التمويل.
**وأكثرُ من يشتري للاستثمار يشتري بتمويل**، فالعائدُ الذي يعنيه على ما خرج من جيبه.

فصار `leveragedYield`: الدفعةُ الأولى ورسومُ الإتمام مقسومًا عليها، والقسطُ مخصومًا من
الإيجار. **ويُقال سالبًا حين يكون سالبًا** — عقارٌ قسطُه أكبرُ من إيجاره يأكل من جيبك
شهريًّا، وذلك خبرٌ يُقال. **وحدوده في الشاشة لا في التعليق**: يفترض ثباتَ القسط، ولا يحسب
إطفاءَ أصل الدين (وهو ثروةٌ تتراكم لا تظهر)، ولا تغيّرَ القيمة ولا الضريبة.

**والتجديدُ كان يقترح السعرَ القديم.** وذلك الافتراضُ الصحيح حين لا يُعرف غيرُه — لكنّ
التجديدَ هو اللحظةُ التي تُراجَع فيها الأجرة. فصار يُسأل عن نسبة زيادةٍ **افتراضُها صفر**،
ويُعرض أثرُها على الدفعة قبل أن تُعتمد. **ولا تُقترح نسبةٌ من عندنا** — تلك مسألةُ سوقٍ
ونظامٍ لا حساب.

### د) الفريق: النصفُ الباقي هو المال (١٢–١٥)

**الإسنادُ كان على العميل والعقار والطلب — وليس على الصفقة.** ولوحةُ الأداء تحسب العمولة
من `deal.assignedTo || deal.createdBy`، فتقع على الثاني دائمًا: **تُنسب الصفقةُ لمن أدخلها
بجهازه لا لمن أتمّها، ولا حقلَ يُصحَّح به**.

**ولم تكن ثَمّ حصّةٌ لوسيطٍ من عندك.** `partnerShare` لوسيطٍ **خارجيّ** من مكتبٍ آخر،
وأشهرُ ترتيبٍ في المكاتب — نصفُ العمولة للوسيط الذي أتمّها — بلا حقل. فلا الموظّفُ يعرف
ما استحقّه، ولا المديرُ ما عليه، **ولوحةُ الأداء تعرض عمولةَ المكتب كأنّها عمولتَه**.

فصار `assignedTo` و`agentShare` على الصفقة، ونسبةٌ افتراضيّةٌ في الإعدادات، وعمودُ «حصّته»
في لوحة الأداء. **وتُحسب على ما بقي بعد الشريك الخارجيّ**: الشريكُ يقتطع قبل أن تدخل
العمولةُ المكتب، وحصّةُ وسيطك من دخل المكتب — وترتيبُ الخصم يغيّر الرقم فيُقال صراحةً.
**وهي حسابٌ لا التزام**: ورقةٌ تُقرأ، ولا يقع بها صرفٌ ولا قيدٌ في المالية.

**والمهامُّ والمعايناتُ لم تكن تُوزَّع** — وهما الفعلُ اليوميّ لمن تحته وسطاء. والنظامُ
يوزّع *الطلبات* بالتناوب منذ المرحلة ٤٧ ثمّ يقف عند الطلب، والعملُ المتولّد عنه لا يُوزَّع.
فصار `assignedTo` في المخزنين، ورقاقةُ الإسناد نفسُها (`assignRow`) في صفحة المهام،
وعمودٌ يُخفى كلُّه لمكتبٍ من شخصٍ واحد.

**والهدفُ كان للمكتب والمحاسبةُ على الفرد.** فشريطُ «يومي» يقول للموظّف ما أنجزه المكتب —
وهو لا يملك تحريكَه وحده. فصار `goals.perMember`، **ومن لا هدفَ شخصيًّا له يرى ما كان
يراه**. ومن وُضع له هدفٌ قِيس بصفقاته هو، وظهرت نسبتُه في لوحة الأداء — **ولا نسبةَ لمن
لا هدفَ له**، فلا يُقرأ «٠٪» حكمًا على من لم يُوضع له شيء.

### هـ) البابُ والورقةُ والنقطة (١٦–١٩)

**سبعةٌ وعشرون بابًا في قائمةٍ مسطّحة.** كانت ثمانيةَ عشرَ يوم المراجعة الأولى. والترتيبُ
قابلٌ للتخصيص منذ المرحلة ٨ وهذا حسن، **لكنّ التخصيص لا يعالج الطول**. فصارت أربعَ
مجموعاتٍ بعناوين: **العمل · المال · الإدارة والالتزام · الأدوات**. **ولا صفحةَ تُحذف ولا
يتغيّر مسار**، وترتيبُك المحفوظ يبقى محفوظًا — داخل مجموعته. والعنوانُ يغيب مع طيّ القائمة
كما يغيب عنوانُ الرابط، ويبقى بدله فاصلٌ رفيعٌ يحفظ التجميع للعين.

**ولا مستنداتٍ إلّا الصور.** `accept="image/*,video/*"` — **ولا مكانَ لملفّ PDF**: لا الصكُّ
المصوَّر، ولا الاتفاقيّةُ الموقَّعة، ولا عقدُ «إيجار» بعد توثيقه. وهي أوراقٌ تُطلب منك بعد
شهور فتبحث عنها في واتساب. **والمخزنُ نفسُه يقبلها** — `blob` بنوعه لا أكثر. فصار
`storeDoc` **بلا ضغطٍ ولا مصغَّرة** (ضغطُه يُفسده، ومصغَّرتُه لا تُقرأ)، ويُعرض بلاطةً
باسمه لا بصورةٍ مكسورة، **ويخرج من `splitMedia` ثالثًا** فلا يُنشر على صفحتك العامّة ولا
يدخل شبكةَ الصور.

**والمزامنةُ كانت تعمل في صمتٍ تامّ.** تسحب وتدمج وترفع وتُعيد المحاولةَ بسلّم تباعد
وتستيقظ مع الشبكة — **و`lastSyncAt` و`lastSyncError` لا يُقرآن إلّا في لوحةٍ داخل
الإعدادات**. فمن تعثّرت مزامنتُه منذ ثلاثة أيّامٍ لا يعلم حتى يفتح جهازَه الآخر فيجد
النقص. **وأخطرُ ما في هذا أنّ النظام يعرف أنّه فشل ولا يقوله.**

فصارت نقطةٌ في الترويسة: خضراءُ صامتة، وصفراءُ متى مضى يومٌ بلا نجاح، وحمراءُ تنبض عند
خطأ. **ولا تُزعج من لم يُفعّل المزامنة** — تغيب عنه كأنّها ليست. **ولا تعتمد على اللون
وحده**: الشكلُ يفرّق بين «لم تُزامن بعد» (حلقة) وغيرها (قرص)، والنصُّ في `aria-label`.

**وتقريرُ نشاطٍ للمالك.** «ماذا فعلتم لعقاري؟» سؤالُه كلَّ شهر، وجوابُه عندك كاملًا
متفرّقًا في خمسة مواضع: فتحاتُ صفحة عرضه، ومعايناتُه وانطباعاتُها، ومن رفضه ولماذا، ورحلةُ
سعره، ومتى أُدرج. **ولا ورقةَ تجمعه** — وتقريرُ المقارنة السوقيّة يجيب سؤالًا آخر: *بكم
يُعرض؟* لا *ماذا جرى له؟*

**وأصدقُ ما في الورقة أنّها تُظهر الصمتَ أيضًا**: «لا معاينةَ منذ ٤٠ يومًا» جملةٌ تفتح
حديثَ خفض السعر خيرًا من أن تبدأه أنت، وتُبقي عقدَك لأنّ المالك يرى أنّك تقول له الحقّ.
**والمشاهداتُ حين لا تصل من الخادم تُقال «غير متاحة» ولا تُكتب صفرًا** — صفرٌ مكذوبٌ في
ورقةٍ بيد المالك يُقرأ إهمالًا منك. وعيّنةُ الآراء الصغيرةُ تُوسَم صغيرةً فلا يُبنى عليها
قرارُ خفضِ سعر.

### وعطبان كشفتهما الحزمةُ لا المراجعة

- **وَعدٌ حُسم مرّتين فضاع جوابُه.** نافذةُ سؤال الزيادة كانت تُغلَق ثمّ تُحسم:
  `m.close()` تُطلق `onClose` فيسبق `resolve(null)` جوابَ الزرّ — **والوعدُ لا يُحسم
  مرّتين**، فيمضي التجديدُ كأنّك ألغيتَ. فصار الجوابُ يُثبَّت في متغيّرٍ قبل الإغلاق،
  و`onClose` تحسم به. كشفتها `five-eyes` وهي تضغط الزرّ.
- **سطرُ الصافي فقد صاحبَه.** أوّلُ صيغةٍ لحساب حصّة الوسيط كتبت «ويبقى للمكتب…» وأسقطت
  كلمة «صافيك» — **ورقمٌ بلا صاحبٍ يُقرأ على غير وجهه**. فصار السطرُ يسمّي صاحبه دائمًا:
  «صافيك» حين لا يقتطع أحد، و«صافي المكتب» حين يقتطع وسيطُك. كشفتها `deals-and-sources`.
- **والمراقبُ كان على `#page` وحده** فلا يبلغ جداولَ النوافذ — والنوافذُ تُرسَم في
  `#modal-root` **خارج** الصفحة. صار على `document.body`، فلحق جدولَ المقارنة وملخّصَ
  الضريبة وغيرَهما. كشفتها `invoices-lifecycle`.

### الملفات المعدَّلة وسببها

| الملف | لماذا |
| --- | --- |
| `js/util/rega.js` · `js/pages/today.js` | `expiryAlerts` · لوحةٌ واحدةٌ لما ينتهي، مرتَّبةٌ بالخطر |
| `js/pages/publish.js` · `js/util/public-listing.js` | الترخيصُ الموشك · حقائقُ النوع · «مُدرَجٌ منذ» |
| `offers/{app,list,i18n,style}.js/css` | عرضُ الحقائق بلغتين · سطرُ «مُدرَجٌ منذ» |
| `js/util/table-cards.js` · `css/components.css` · `js/app.js` | الجدولُ بطاقةً على الجوّال — موضعٌ واحدٌ يلحق كلَّ جدول |
| `js/data/schema.js` · `js/data/repository.js` | إسنادُ الصفقة والمهمّة والمعاينة · حصّةُ الوسيط · المتكرّر · المبنى · منفّذُ الصيانة · المستندات |
| `js/util/team.js` · `js/pages/dashboard.js` | `earned` و`goalFor` · عمودا الحصّة والهدف |
| `js/pages/{client,tasks,matches,settings}.js` | حقولُ الإسناد والحصّة · هدفُ كلّ عضو |
| `js/util/management.js` · `js/pages/management.js` | قيدُ الأجر · المباني · زيادةُ التجديد |
| `js/util/owner-report.js` · `js/util/property-print.js` | تقريرُ النشاط — ويُظهر الصمت |
| `js/util/recurring.js` · `js/pages/expenses.js` | ما يُقترح قيدُه هذا الشهر |
| `js/util/investor.js` · `js/util/finance.js` · `js/pages/pricing.js` | المقارنةُ بالمحفظة · العائدُ على رأس المال المدفوع |
| `js/util/sidebar.js` · `css/base.css` | أربعُ مجموعاتٍ بعناوين |
| `js/util/sync-dot.js` · `index.html` | نقطةُ حال المزامنة |
| `js/data/images.js` · `js/pages/properties.js` | `storeDoc` · بلاطةُ المستند · المبنى والوحدة |
| `tests/{public-listing,owner-report,recurring,shell}-unit.mjs` | أربعُ حزمٍ جديدة، وأربعٌ وُسّعت |

### لم يُمسّ

- **`DB_VERSION` باقٍ ٩**: كلُّ ما أُضيف حقولٌ في سجلّاتٍ قائمة، تُطبَّع في PREPARE وتُقرأ
  افتراضًا فارغة — ولا مخزنَ جديد ولا فهرس. **والمستندُ يدخل مخزنَ `images` نفسَه** بنوعه،
  فلا مخزنَ ثالثًا للوسائط.
- **البوّابةُ والتشفيرُ والمزامنة** كما هي: النقطةُ تقرأ حالَها ولا تغيّر عملها.
- **المطابقةُ والتسعيرُ** لا يتغيّر حسابُهما؛ أُضيف إلى التسعير سطرٌ ثانٍ بجانب الأوّل.
- **الفريقُ تمييزٌ وتنسيق لا تصريحٌ وحجب** — على عهده، ومكتوبٌ في لوحته.
- **الأسرارُ لا تدخل المستودع ولا IndexedDB ولا النسخ.**

---

## ٥٦. المرحلة ٤٩ — قراءةٌ ثالثة: ستةَ عشرَ بندًا

ثلاثةٌ وأربعون بندًا من المراجعتين نُفِّذت، و**٢٬٣٣٤ فحصًا يمرّ** (صارت **٢٬٤٩١** بعد هذه المرحلة). وسؤالُ هذه القراءة
مختلفٌ عن سابقتيها: **ليس «ما الذي يعرفه النظامُ ولا يقوله؟» — بل «ما الذي لا يعرفه أصلًا؟»**

### أ. التمويل — أكبرُ فجوةٍ في الورقة

بحثٌ في المخطّط كلِّه وفي صفحة الصفقات عن «تمويل» أو `financ` أو «بنك» كان يعيد **صفرًا**.
والموجودُ حاسبةُ قسطٍ في صفحة التقدير — **رقمٌ يُحسب لزائرٍ، لا حالةٌ تُتابَع لعميلٍ بعينه**.
وأكثرُ المشترين هنا يشترون بتمويل، **والصفقةُ لا تموت عند السعر — تموت عند البنك**: إفراغٌ
يتأخّر، تقييمٌ يأتي أقلَّ من المتّفق، التزامٌ يظهر فيسقط المشتري. والسؤالُ اليوميُّ في كلّ
مكتب — «وين وصل تمويله؟» — لم يكن له جوابٌ إلا الملاحظات.

فصار للصفقة `financeStage` من ثماني مراحلَ بترتيب الواقع (نقدًا · لم يُقدَّم · قُدّم ·
مبدئيّة · تقييم · نهائيّة · أُفرِغ · رُفض)، و`financeBank` و`financeAt` و`financeNote`.
و«يومي» يسأل عمّا وقف عند البنك أسبوعًا.

**وتاريخُ الحركة يُختم عند تغيّر المرحلة وحدها** — في المستودع لا في الصفحة، كتاريخ السعر
تمامًا. ولو خُتم عند كلّ حفظٍ **لأسكت التنبيهَ كلَّما فتحتَ الصفقةَ وحفظتَها**، فيصير
التنبيهُ يقيس فتحاتِك لا حركةَ البنك. ومن يُدخل صفقةً واقفةً منذ شهرٍ يكتب تاريخَها بيده.

**والطلبُ صار يقول كيف يدفع** (`payMethod`): نقدًا · معتمَدٌ مسبقًا · يحتاج تمويلًا.
حقولُ الطلب كانت عشرين وليس فيها أقوى مؤهِّلٍ للمشتري: طالبٌ نقديٌّ بمليونٍ ونصف **مشترٍ
خلال أسبوعين**، ومثلُه ينتظر بنكًا **مشترٍ بعد شهرين وقد لا يشتري** — وهما سطران متشابهان
في قائمتك يأخذان من وقتك بالتساوي. و`''` تعني **لم يُسأل** لا «يحتاج تمويلًا»: الصمتُ لا
يُقرأ جوابًا. ودخلت درجةَ الأولوية إشارتين (`cashBuyer` و`preapproved`).

### ب. الوارد يُقارَن بعملائك

«يومي» كان يسحب الطلبات من صفحتك العامة ويعرضها بأسمائها **بلا أن يقارنها بعملائك**.
فالعميلُ الذي تتابعه منذ شهرين يترك رقمَه فيظهر عندك **غريبًا جديدًا** — فتكلّمه من الصفر
وهو يعرفك. والأداةُ التي تكشفه (`findDuplicates`) مكتوبةٌ منذ المرحلة ٢٦ ولم تكن تلمس الوارد.

فصارت `matchLead`، وزرُّ الوارد المعروف «افتح ملفّه» لا «أدخِله». **والجوالُ وحده هو الحَكَم**
— لا الاسم: الوارد يكتبه زائرٌ في استمارةٍ عامّة، و«محمد العتيبي» يكتبه عشرة، **وادّعاءُ
معرفةٍ خاطئةٍ أسوأُ من لا ادّعاء**.

### ج. العروضُ المقدَّمة — ما بين «تفاوض» و«أُبرمت»

مراحلُ العميل خمسٌ تقفز من «مهتمّ/تفاوض» إلى «أُبرمت»، وبينهما **كلُّ عملِ الوسيط الحقيقيّ**:
عرضٌ بمبلغ، وردٌّ من المالك، وعرضٌ مقابل، ومهلةٌ تنتهي — وكان ذلك كلُّه نصًّا حرًّا في
الملاحظات. فلا يُعرف كم عرضًا قُدّم، ولا بكم، ولا من رفض.

فصار `offers` على العقار، و**أعلى عرضٍ مرفوضٍ هو بيتُ القصيد**: «تسعةٌ قالوا السعر مرتفع»
شهادةُ رأي، و«رُفض عرضٌ بمليونين وثلاثمئة» رقمٌ لا يُردّ — وهو أقوى ما تُحاجّ به مالكًا
متمسّكًا بسعره. و«انتهت مهلته» حالةٌ قائمةٌ بذاتها لا رفضٌ: المشتري لم يسحب عرضَه،
**المالكُ هو الذي لم يردّ** — والفرقُ بينهما هو الفرقُ بين لوم السوق ولوم البائع.

### د. البيعُ على الخارطة

بحثٌ عن «خارطة» و«وافي» و«تحت الإنشاء» في المشروع كلِّه كان يعيد **صفرًا**: العقارُ إمّا
قائمٌ أو لا شيء. فصارت ثلاثةُ حقول — `offPlan` و`deliveryAt` و`wafiLicense` — لا مشروعٌ
جديد. ويخرج العلمُ وتاريخُ التسليم إلى **المواضع العامّة الثلاثة كلِّها** — الصفحة العامة،
وصفحة العرض الواحد، وقائمةُ العميل المخصّصة — بلغتيها، **فلا يُباع تحت الإنشاء
كأنّه جاهز**: من اشترى ظانًّا أنّه قائمٌ يرجع عليك، ومن عرف فاشترى لا يرجع. **وإطفاءُ
العلم يمحو التاريخَ والرخصة** فلا يبقى تسليمٌ يُنبَّه عليه في عقارٍ مبنيٍّ أصلًا.

### هـ. ما كان محسوبًا ويقف عند العرض

**المطالبةُ بالمتأخّر.** `receivables` تُعمِّر كلَّ مستحقٍّ في شرائحَ عمريّة وتُعرض في
ثلاث صفحات — **ثم لا شيء**. ومديرُ الأملاك عملُه في الشريحة نفسِها: عشرون مستأجرًا تأخّروا،
وعليه أن يكتب لكلٍّ رسالةً بيده. والقوالبُ موجودة، والواتسابُ موصول، **والوصلةُ بينهما
كانت مفقودة**. فصارت `dunning.js`: **النبرةُ تتبع الشريحة** — تذكيرٌ ودّيٌّ قبل الموعد،
ولطيفٌ في الشهر الأوّل، وصريحٌ بعد التسعين. **ولا إرسالَ جماعيّ**: المطالبةُ قرارٌ لكلّ
واحدٍ على حدة — فيهم من كلّمتَه أمس، وفيهم من له عذر. ومن لا جوالَ له **لا يُدرَج أصلًا**:
زرُّ رسالةٍ لا تُرسَل وعدٌ كاذب.

**والتنبيهاتُ صارت قواعدَ تُشغَّل وتُطفَأ.** كان يوقظك شيئان — عميلٌ متأخّر ومهمّةٌ مستحقّة —
والنظامُ يعرف ثمانيةً ويصمت عن ستّة: عقدُ إيجارٍ ينتهي، ومستحقٌّ تأخّر، وتمويلٌ وقف،
وتسليمٌ يقترب، وصيانةٌ لم تُغلق، ومعاينةٌ بلا رأي. **كلُّها محسوبةٌ في وحداتٍ قائمة**، ولا
واحدةٌ كانت تصل إليك إلا أن تفتح صفحتَها. و**المفتاحُ الغائبُ يأخذ افتراضيَّ قاعدته** فلا
تبقى قاعدةٌ جديدةٌ مطفأةً صامتةً عند من ضبط إعداداته قبلها. وما يخصّ دورًا بعينه يبدأ
مطفأً، فلا يُغرَق أحدٌ بما لم يطلبه.

### و. المستثمر: العائدُ يُقاس والمخاطرةُ لا

المحفظةُ كانت **كلُّها أسئلةَ ربح، ولا سؤالَ واحدًا عن الخسارة**. فصارت `concentration`:
مستثمرٌ عائدُه ٨٪ من ستّة عقاراتٍ **كلُّها في حيٍّ واحد** ليس كمستثمرٍ عائدُه ٧٪ موزّعٌ على
أربعة أحياء. **ولا حكمَ ولا نصيحة** — يُقال الرقمُ ويسكت، وقد يكون ذلك قرارَه عن علمٍ لا
غفلة. **والقياسُ بالدخل الواقع لا بالقيمة**: القيمةُ تقديرٌ والدخلُ مقبوضٌ مُثبَت — وبلا
دخلٍ يُقاس بالقيمة **ويُقال بأيّهما قِيس**، فلا يُخلط مقياسان صامتًا. **وسطرٌ لا يُكتب إلّا
إن كان فيه خبر**: محفظةٌ من عقارٍ واحدٍ تركُّزُها ١٠٠٪ بداهةً، وقولُه لصاحبه ضجيج.

**و`holdVsSell`**: الحاسباتُ كلُّها تُجيب عن عقارٍ واحدٍ بمعزل، وسؤالُ المستثمر الحقيقيُّ
**بين اثنين**. والبيعُ يُخرج نقدًا بعد كلفته وسدادِ دَينه، وذلك النقدُ هو رأسُ المال للثاني.
**والحكمُ بالريال لا بالنسبة**: نسبةٌ أعلى على رأس مالٍ أقلّ قد تعني دخلًا أقلّ. والإبقاءُ
يُقاس على **حقوق الملكية** لا على القيمة، وإلّا ظُلم أمام بديلٍ يُشترى بالنقد وحده.

### ز. المسوّق والموظّف

**الحملةُ ليست قناة.** `sources.js` تقيس المصدر: كم كلّفك «سناب» وكم عاد منه — وحملتان على
القناة نفسِها تختلفان كلَّ اختلاف وتذوبان في رقمٍ واحد. فصارت الحملةُ **إعدادًا لا مخزنًا**
(أربعةُ حقولٍ تُكتب مرّةً وتُقرأ شهرًا)، والعميلُ يحمل مفتاحَها. ويخرج للمسوّق سطرٌ يُحاسَب
به **ويُدافع به عن نفسه**: «١٤ طلبًا · ٣ جادّة · صفقةٌ واحدة · كلفةُ الطلب ٢١٤ ريالًا».
**و«الجادُّ» محسوبٌ من البيانات لا من ظنّ**: مصنَّفٌ «جادّ» أو له تواصلٌ مسجَّل. **وميزانيةٌ
غير مكتوبةٍ `null` لا صفر**: الحملةُ ليست مجّانيّة — هي مجهولةُ الكلفة، والفرقُ بينهما هو
الفرق كلُّه.

**و`memberSteps`**: `startSteps` تقيس بدايةَ المكتب، **ولم يكن شيءٌ ليوم الموظّف الأوّل** —
يُفتح له الجهازُ فيرى عشرين صفحةً ولا يعرف من أين يبدأ. فصارت أربعُ خطواتٍ تُقرأ **ممّا
أُسند إليه هو**، ومعها الحقيقةُ نفسُها: ما لا يظهر ليس محجوبًا عنه.

### ح. الشكلُ واليد

- **الوصولية**: سماتُ `aria-*` في المشروع كلِّه كانت **سبعًا وعشرين** على خمسة ملفّاتٍ من
  خمسةٍ وعشرين، وفي الصفحات ستةَ عشرَ زرًّا رمزيًّا يقرؤها القارئُ «زر». **والإصلاحُ في
  `el()` لا في ستّةَ عشرَ موضعًا**: كلُّ زرٍّ نصُّه رموزٌ وحدها وله `title` يأخذ عنوانَه
  اسمًا — فما كُتب يُصلَح، وما يُكتب بعدُ يُصلَح وحدَه. **وما لا `title` له لا يُخترع له
  اسم**: اسمٌ مخترَعٌ يقول لقارئ الشاشة غيرَ ما يفعل الزرّ. والنافذةُ صار لها اسمٌ يُنطَق
  (`aria-labelledby`)، وتركيزٌ يبدأ بأوّل حقلٍ ويعود إلى فاتحها، و**حبسٌ للتنقّل** فلا يخرج
  `Tab` إلى صفحةٍ محجوبةٍ بصريًّا. والتنبيهُ يُعلَن: `status` للعاديّ و`alert` للخطأ —
  **والخطأُ وحدَه يستحقّ المقاطعة**.
- **ثلاثةُ اختصارات** لا رابعَ لها: `Alt+P` و`Alt+C` و`Ctrl/⌘+Enter`. **وتُقرأ بـ`code`
  لا بـ`key`**: `key` يتبع لغةَ اللوحة، فمن يكتب بالعربيّة يُرسل `ح` لا `c` — فينكسر
  الاختصارُ عند من بُني له أصلًا.
- **الإضافةُ السريعة** خرجت من صفحة المهامّ بعد اثنتين وأربعين مرحلة: اسمٌ وجوّالٌ و«إدخال».
  والوسيطُ واقفٌ في معرض، فيؤجّل الإدخالَ إلى المساء وفي المساء ينساه — **وسجلٌّ ناقصٌ
  محفوظٌ خيرٌ من سجلٍّ كاملٍ لم يُكتب**.
- **البحوثُ المحفوظة** كانت في صفحة العقارات وحدها منذ المرحلة ١٧. **ولم يُكتب حفظٌ جديد**:
  نُقل ما فيها إلى `saved-views.js` فصار الثلاثةُ يقرؤون من موضعٍ واحد، وما حُفظ من قبل
  يبقى كما هو.

### ط. والحدُّ يُقال قبل أن يوظّف، لا بعد أن يخسر

الحدُّ المعماريُّ مكتوبٌ منذ المرحلة ٣٥ وفي وصف لوحة الفريق وفي لوحة الأداء — **ويُقرأ بعد
الفعل لا قبله**. ومن يضيف **أوّلَ عضوٍ** إلى فريقه يتّخذ قرارًا عن بياناته كلِّها، فصار
يُوقَف عنده مرّةً واحدةً ليقرأ: الإسنادُ تمييزٌ وتنسيق، **ولا يمنع أحدًا من رؤية شيء**؛
ومن فتح الجهاز رأى كلَّ عميلٍ وكلَّ عمولة؛ والموظّفُ الذي يترك المكتب قد يأخذ نسخةً كاملة.
**ومرّةً واحدة**: سؤالٌ يتكرّر مع كلّ إضافةٍ يُضغط «موافق» بعده بلا قراءة، فيبطل مقصودُه.

### وعطبٌ كشفته القراءةُ لا الاختبار

**مفتاحٌ مكرَّرٌ محا أخاه صامتًا.** `TRACKED` كان فيه `deals` **مرّتين**: سطرُ المرحلة ٤٨
(`assignedTo` و`agentShare`) وسطرٌ أقدمُ تحته — **والثاني يمحو الأوّل** في كائنٍ واحد. فكان
إسنادُ الصفقة وحصّةُ الوسيط **لا يُتتبَّعان أصلًا** مع أن السطر مكتوبٌ فوقهما بشرحه. ولا شيء
في الجافاسكربت يشتكي من مفتاحٍ مكرَّر. فدُمجا، ودخل معهما `financeStage`.

**وجدولٌ في الإعدادات أفاض الصفحةَ كلَّها.** قائمةُ الاختصارات كُتبت جدولًا، و`.table`
في هذا المشروع عرضُها الأدنى ٩٠٠ بكسل — **فأجبرت عمودَ الإعدادات على ذلك العرض ولو كانت
في حاويةٍ تُمرَّر**، فصار عرضُ الصفحة ١٢١٦ على شاشةِ ٧٦٨. وثلاثةُ صفوفٍ لا تستحقّ جدولًا
أصلًا، فصارت قائمةً. كشفها `design-dhad`، **وهي تقيس فيض الصفحة لا فيض الحاوية** — والفرقُ
بينهما هو ما نجا منه هذا العطب.

**وصيغتان احتياطيّتان لصقتا العددَ بالاسم.** `financing.js` و`dunning.js` كتبتا
`` `${d} يوم` `` حين لا تُمرَّر `daysWord` — و«3 يوم» خطأٌ عربيّ. فصار المعجمُ يُستورَد
افتراضًا ولا بديلَ له. كشفها `guard-plural-unit` — الحارسُ الذي بُني في المرحلة ٤٤ لهذا
بعينه.

**ولوحةُ «ماذا قال السوق» كانت تُخفي العروض.** بابُها `if (!s.booked && !ev.opinions &&
!ev.priceDrops) return null` — فعقارٌ رُفض عليه عرضان بمليونين وثلاثمئة **تُخبَّأ شهادتُه
لأن أحدًا لم يعاينه**، وهي أقوى ما فيها. كشفها `finance-flow` وهي تبحث عن اللوحة.

### الملفات المعدَّلة وسببها

| الملف | لماذا |
| --- | --- |
| `js/util/financing.js` | المراحلُ وطرقُ الدفع · `stalledFinancing` · `financeLine` — حسابٌ خالص |
| `js/util/offers.js` | خلاصةُ العروض · `ownerTalkingPoint` — أرقامٌ تُقال للمالك لا رأي |
| `js/util/dunning.js` | نبرةٌ لكلّ شريحةٍ عمريّة · `dunningList` — ومن لا جوالَ له لا يُدرَج |
| `js/util/alert-rules.js` | ثماني قواعدَ تُشغَّل وتُطفَأ · `endingLeases` · `openMaintenance` |
| `js/util/campaigns.js` | `campaignReport` — الحملةُ لا القناة · «الجادُّ» من البيانات |
| `js/util/saved-views.js` | البحوثُ المحفوظة مشتركةً — نُقلت من `properties.js` بلا حفظٍ جديد |
| `js/util/shortcuts.js` | ثلاثةُ اختصاراتٍ تُقرأ بموضع الزرّ لا بحرفه |
| `js/data/schema.js` · `js/data/repository.js` | حقولُ التمويل والدفع والعروض والخارطة والحملة · ختمُ `financeAt` · دمجُ `TRACKED.deals` |
| `js/util/dom.js` | اسمٌ لكلّ زرٍّ رمزيّ · اسمُ النافذة وتركيزُها وحبسُه · إعلانُ التنبيه |
| `js/util/investor.js` · `js/util/finance.js` · `js/pages/pricing.js` | `concentration` · `holdVsSell` · عمودان جنبًا إلى جنب |
| `js/util/onboarding.js` · `js/pages/today.js` | `memberSteps` · لوحةُ «وقف عند البنك» · الوارد المعروف |
| `js/util/lead-score.js` · `js/util/outreach.js` | إشارتا الدفع · `textOf` يقرأ ما على الشاشة |
| `js/pages/{deals,requests,properties,clients,invoices,dashboard,settings}.js` | حقولُ المرحلة وأقسامُها ولوحاتُها |
| `js/pages/publish.js` · `offers/{app,list,i18n,style}` · `netlify/functions/offer.js` | «على الخارطة» وتاريخُ التسليم في المواضع العامّة الثلاثة بلغتيها |
| `css/components.css` · `js/app.js` | `.quick-add` · `.rule-list` · تركيبُ الاختصارات |
| `tests/{financing,campaign-alerts}-unit.mjs` · `tests/finance-flow.mjs` | ثلاثُ حزمٍ جديدة |

### لم يُمسّ

- **`DB_VERSION` باقٍ ٩**: كلُّ ما أُضيف حقولٌ في سجلّاتٍ قائمة تُطبَّع في PREPARE وتُقرأ
  افتراضًا فارغة — ولا مخزنَ جديد ولا فهرس. **والحملةُ إعدادٌ لا مخزن** قصدًا: مخزنٌ لها
  يستلزم رفعَ النسخة وهجرةً وشاشةَ إدارةٍ ثالثة بلا مقابل.
- **المطابقةُ والتسعير** لا يتغيّر حسابُهما؛ أُضيف إلى التسعير عمودان بجانب ما كان.
- **البوّابةُ والتشفيرُ والمزامنة** كما هي.
- **الفريقُ تمييزٌ وتنسيق لا تصريحٌ وحجب** — على عهده، ويُقال الآن **قبل** أوّل عضوٍ يُضاف.
- **الأسرارُ لا تدخل المستودع ولا IndexedDB ولا النسخ.**

## ٥٧. المرحلة ٥٠ — الواتساب يعمل، والسوقُ يدخل النظام

مطلبان في رسالةٍ واحدة: **صفحةُ واتساب تُسوّق وتراسل وتردّ أحيانًا بنفسها**، و**صفحةٌ
تجلب أسعارَ السوق الحقيقيّة** من البورصة العقاريّة والسجلّ وسهيل وبسيطة وما يُشبهها.
وبينهما جامعٌ واحد: **كلاهما يُخرج النظامَ من دائرة بياناتك أنت** — الأولى تُخرج كلامَك
إلى الناس، والثانية تُدخل أفعالَ الناس إليك.

### أ. الواتساب — من صندوقِ واردٍ إلى أداةِ عمل

ما كان: صفحةٌ تعرض الرسائلَ الواردة وتنسخ الردّ يدويًّا. وما صار خمسُ لوحات.

**ونافذةُ الأربع والعشرين ساعةً هي حجرُ الزاوية.** قانونُ واتساب للأعمال ليس تفصيلًا
تقنيًّا: **لا يبدأ الحسابُ التجاريّ محادثةً بكلامٍ حرّ** — يبدأ بقالبٍ معتمدٍ من ميتا؛
فإذا ردّ العميلُ انفتحت نافذةُ خدمةٍ أربعًا وعشرين ساعةً يجوز فيها الحرُّ. ومن لا يعرف هذا
يكتب رسالةً ويظنّها وصلت. فصار لكلّ محادثةٍ **وسمٌ يقول: مفتوحةٌ وبقي كذا · أوشكت ·
أُغلقت فالقالبُ وحده**. والحسابُ في `js/util/wa-auto.js` — **يستورده المتصفّحُ والخادمُ
معًا** فلا تختلف الشاشةُ عن الواقع.

**والردُّ التلقائيُّ قواعدُ لا ذكاء.** ثلاثةُ أنواع: أوّلُ رسالةٍ من رقمٍ جديد · احتواءُ
كلمة · دائمًا. **وثلاثةُ حدودٍ تمنع أن يصير النظامُ مزعجًا**: ثلاثُ رسائلَ آليّةٍ لرقمٍ
في اليوم سقفًا، وخيارُ «خارج الدوام فقط» بتوقيت الرياض، واثنتا عشرة قاعدةً حدًّا أعلى.
**والقواعدُ تُحفظ في Netlify Blobs لا في الجهاز**: الويبهوك يعمل على الخادم و**لا يرى
IndexedDB متصفّحِك** — فلو حُفظت عندك لَما ردَّ أحدٌ وأنت نائم، وهو السببُ الوحيدُ لوجود
الميزة.

**والعرضُ يُرسَل بقالبٍ بمتغيّراته**: تختار عميلًا وعقارًا فتُملأ `{{1}}` و`{{2}}` من
السجلّين وتراها **قبل الإرسال**. والفارغُ يصير `—` لا فراغًا — فقالبٌ بمتغيّرٍ خالٍ
ترفضه ميتا.

**والحملةُ تحترم «لا تُراسلني»** (`doNotContact`) وتُرسل على مهلٍ لا دفعةً واحدة، ويُكتب
لها سجلُّ إرسالٍ يسع مئتين. ومن لا جوالَ له لا يُدرَج أصلًا.

### ب. السوق — الصدقُ قبل الرقم

**والفرقُ الذي تقوم عليه الصفحةُ كلُّها**: سعرُ العرض ما يطلبه المالك، وسعرُ الصفقة ما
دُفع فعلًا. وكلُّ ما في النظام قبل اليوم **مخزونُك أنت**: تقديرُ السعر يقيس حيًّا
بعقاراتك أنت فيه — فإن لم يكن لك في قرطبة إلا عقاران **قِيس الحيُّ بعقارين**. ومن يحاجّ
مالكًا بأسعار الإعلانات **يحاجّه بأمانيّ الناس لا بأفعالهم**.

**وبحثٌ عن المصادر الأربعة انتهى إلى تصنيفٍ يُقال في الصفحة كما هو:**

| المصدر | حالُه الصادقة |
| --- | --- |
| بوّابة البيانات المفتوحة (صفقات العدل) · الهيئة العامّة للعقار | **مفتوحٌ ومجّانيّ** — يُنزَّل ملفًّا ويُستورَد |
| البورصة العقاريّة (SREM) · السجلّ العقاريّ | **يُعرض ولا يُصدِّر آليًّا** — لا واجهةَ عامّةً موثّقة، والدخولُ بنفاذ |
| سهيل · بسيطة | **باشتراك** — منصّتان تجاريّتان، ولا سحبَ بلا مفتاح |

فالمبنيُّ اليوم **مسارُ الاستيراد**: تُنزّل ملفَ الصفقات وتُلقيه في الصفحة، فتُقرأ
أعمدتُه بأسمائها العربيّة، ويُقال **كم صفًّا تُخطّي ولماذا** لا يُسقَط صامتًا. وتاريخٌ
ملتبسٌ مثل `03/04/2026` **يُرفض ولا يُخمَّن** — فشهرٌ مقلوبٌ يقلب الاتّجاه. والمدفوعان
لهما وسيطان يقولان `NOT_CONFIGURED` **ويسمّيان متغيّرَهما بالحرف** — لا بياناتٍ مخترَعة.

**والوسيطُ لا المتوسّط**: قصرٌ بثلاثين مليونًا بين عشر شققٍ يرفع «المتوسّط» فيصير رقمًا
لا يشبه شيئًا في الحي. **والعيّنةُ دون الخمس تُوسَم ولا تُحجب** — رقمٌ ضعيفٌ معلومُ
الضعف خيرٌ من فراغ. **والاتّجاهُ يقارن نصفين متساويين** ولا يُحسب إلا بثلاثٍ في كلّ نصف.
**ومدى البيانات يُقال دائمًا**: مؤشّرٌ لا يُعرف عمرُه لا يُبنى عليه.

**ومفرداتُ الأنواع لا تتطابق** — وهذا عُولج ولم يُتجاهَل: النظامُ يسمّي النوعَ مفتاحًا
(`villa`) والبوّابةُ تسمّيه نصًّا («فيلا»)، فالتطابقُ الحرفيُّ يُخرج صفرًا دائمًا
**فيبدو الحيُّ بلا صفقاتٍ وهو مملوءٌ بها**. فصار `districtStatSmart` يُجرّب النوعَ، فإن
لم يُصِب قاس الحيَّ بأنواعه كلِّها **وقال ذلك** (`typeIgnored`).

**وإعادةُ استيراد الملفِّ نفسِه لا تضاعف العدّ**: لكلّ صفقةٍ بصمةٌ من حقولها. والبوّابات
تُصدّر مدًى يشمل ما سبق، فمن يستورد شهريًّا **كان سيضاعف سوقَه بيده**.

### ج. وصلُه بما كان

صفحةُ التقدير تُضيف تحت رقمها سطرَ **«وما بِيع فعلًا»** من صفقات السوق — تقديرُك من
مخزونك، وبجانبه ما دُفع في الحيّ. ولوحةُ «مخزونك مقابل السوق» تعطي **جملةً للمالك من
أرقامٍ لا من رأي**.

### د. أعطابٌ كُشفت في الطريق

**والنوافذُ كانت تنجو من التنقّل.** النافذةُ تُبنى في `#modal-root` **خارج `#page`**،
و`navigate()` يمسح `#page` وحده — فمن ضغط رابطًا داخل نافذةٍ انتقلت الصفحةُ خلفَه
**والنافذةُ باقيةٌ فوق صفحةٍ أخرى**. فصار `closeAllModals()` يُستدعى قبل المسح،
**بنداءِ `close()` لكلّ نافذةٍ لا بمسح العنصر**: وعدُ `confirmDialog` المعلَّق يُحسم،
ولو مُسح العنصرُ لَبقي معلَّقًا أبدًا.

**ورابطٌ ميّتٌ في الوارد**: `#/client/<id>` بالإفراد، والمسارُ `#/clients/<id>`.
**ومفتاحٌ مخترَع**: كتبتُ `kassab:wa-request` وصفحةُ الطلبات لا تقرؤه — والموجودُ
`kassab:quick-request`. ومن اخترع مفتاحًا **بنى زرًّا لا يفعل شيئًا وهو يظنّه يعمل**.

**وصفحةُ السوق وُلدت خرساء**: أضفتُها إلى القائمة الجانبيّة ونسيتُ معجمَ الأوامر
الصوتيّة، **فبابٌ يُرى ولا يُنادى**. كشفها `voice-unit` — وحارسُها مكتوبٌ منذ بُنيت
الميزة: *لا صفحةَ في القائمة بلا اسمٍ منطوق*. فصار لها «السوق · سوق العقار · أسعار
السوق».

### الملفات المعدَّلة وسببها

| الملف | لماذا |
| --- | --- |
| `js/util/wa-auto.js` | نافذةُ الأربع والعشرين · مطابقةُ القواعد · سقفُ اليوم · خارجَ الدوام — **يستورده المتصفّحُ والخادم** |
| `netlify/functions/whatsapp.js` | الردُّ التلقائيُّ في الويبهوك · حفظُ القواعد في Blobs · إرسالُ نصٍّ داخل النافذة |
| `netlify/lib/integrations.js` | `text.send` بجانب القالب · تحويلُ `05…`→`9665…` مرّةً واحدة · وسيطا سهيل وبسيطة |
| `js/pages/whatsapp.js` | خمسُ لوحات: الحالة · الوارد بنافذته · القواعد · العرض بقالبه · الحملة وسجلُّها |
| `js/util/templates.js` · `js/data/settings.js` | `templateComponents` و`missingVars` · قوالبُ الواتساب وسجلُّ الإرسال |
| `js/util/market.js` | الوسيطُ والرُّبعان · `districtStatSmart` · `vsMarket` · `marketLine` — دوالُّ خالصة |
| `js/data/market-import.js` | تصنيفُ المصادر · قراءةُ الأعمدة العربيّة · **رفضُ التاريخ الملتبس** |
| `js/pages/market.js` | جدولُ المصادر بصدقه · المؤشّر · المقارنة · الاستيرادُ ببصمته |
| `js/data/schema.js` · `js/data/repository.js` · `js/data/adapters/indexeddb.js` | مخزنُ `marketDeals` وفهارسُه · سعرُ المتر والبصمةُ في PREPARE · `DB_VERSION` ٩←١٠ |
| `js/pages/pricing.js` | سطرُ «وما بِيع فعلًا» تحت التقدير |
| `js/util/dom.js` · `js/app.js` | `closeAllModals()` وندَاؤه في `navigate()` · مسارُ السوق |
| `js/util/sidebar.js` · `index.html` · `css/components.css` | بابُ السوق · أنماطُ الواتساب والمعاينة |
| `js/util/voice-commands.js` | اسمُ السوق منطوقًا — فالبابُ يُنادى كما يُرى |
| `tests/market-wa-unit.mjs` · `tests/market-page.mjs` · `tests/run.mjs` | ٨٩ فحصًا: الحسابُ الخالص، والصفحةُ في متصفّحٍ حقيقيّ |

### لم يُمسّ

- **`DB_VERSION` رُفع ٩←١٠ — وهي أوّلُ مرحلةٍ ترفعه منذ زمن، وسببُها مخزنٌ جديدٌ لا
  حقلٌ جديد.** صفقاتُ السوق **ليست صفقاتِك**: مصدرٌ مختلف، وعمرٌ مختلف، وحذفٌ جماعيٌّ
  لا يمسّ عملك — فوضعُها في `deals` كان سيخلط ما بِيع في الحيّ بما بِعتَه أنت. ولا هجرةَ
  بيانات: `upgrade()` عامٌّ يُنشئ الناقصَ وحده، وما كان يبقى كما هو.
- **الأسرارُ لا تدخل المستودعَ ولا IndexedDB ولا النسخ** — مفاتيحُ سهيل وبسيطة وواتساب
  متغيّراتُ بيئةٍ في Netlify وحدها، والصفحةُ تسمّيها ولا تحملها.
- **قواعدُ الردّ في Blobs لا في النسخ الاحتياطيّة** — إعدادُ خادمٍ لا بيانةُ عميل.
- **البوّابةُ والتشفيرُ والمزامنةُ والمطابقة** كما هي.
- **ولا سحبَ آليًّا اليوم من أيّ مصدر** — وهذا مكتوبٌ في الصفحة نفسِها لا في التوثيق وحده.

## ٥٨. المرحلة ٥١ — الوارد: قناةٌ تفرز، وصندوقٌ يُعتمد

«أكثرُ الطلبات والعروض تصلني في واتساب — هل أحوّلها إليك فتفرزها؟» والجوابُ الصادقُ
أوّلًا: **لا**. فلستُ خدمةً تعمل ليلَ نهار، وجلسةٌ تنتهي حين تُغلق لا تستقبل شيئًا وأنت
نائم. **والصوابُ أن يستقبلها نظامُك هو** — يعمل بلا انقطاع، ويقرأ بالمحلّل المبنيّ منذ
المرحلة ٤٢، ويضعها في صندوقٍ تعتمده أنت.

### أ. لماذا تيليجرام لا الواتساب

الواتسابُ الرسميُّ يحتاج تحقّقَ أعمالٍ من Meta وقوالبَ معتمَدة — حاجزٌ يوقف أسبوعًا.
وبوتُ تيليجرام يُصنع في دقيقتين، مجّانيٌّ بلا حدّ، بلا قوالبَ ولا نافذةِ أربعٍ وعشرين.
**والتحويلُ إليه يحفظ نصَّ الرسالة واسمَ من حُوِّلت عنه**، وهو كلُّ ما يلزم.

### ب. الفارزُ قواعدُ لا فهم

شواهدُ الطلب فِعلٌ يتكلّم به صاحبُه عن نفسه: «أبحث عن» · «أبي» · «مطلوب» · «عندكم؟»
· سقفُ ميزانيّة. وشواهدُ العرض ما **لا يذكره الطالبُ أصلًا**: الصكُّ، والواجهة، وعرضُ
الشارع، ورقمُ ترخيص الإعلان. ولكلّ شاهدٍ وزنٌ بقوّة دلالته لا بطوله.

**وثلاثةُ أحكامٍ لا حكمان**: طلبٌ، وعرضٌ، و**ملتبِسٌ يُوسَم ولا يُخمَّن**. فرسالةٌ تقول
«فلة حطين ٣ مليون» لا يُعرف أصاحبُها يعرضها أم يطلبها — **وادّعاءُ يقينٍ كاذبٍ أسوأُ من
الاعتراف بالجهل**. وما دون فارقِ ثلاثِ نقاطٍ التباسٌ يُقال.

**والحكمُ يُبيّن حجّته**: «حُكم طلبًا لأنّ فيه: فعلُ بحثٍ صريح · سقفُ ميزانيّة» — فتصدّقه
أو تردّه بعلم. وهو مجّانيٌّ يعمل بلا شبكة، **ولا تخرج رسائلُ عملائك إلى أيّ مزوّد**.

### ج. الصندوق: بريدٌ ينتظر الفتح لا سجلٌّ دخل

ما في «الوارد» محفوظٌ في الخادم لا في مخزونك، **ولا يدخل قاعدتَك حتى تضغط «اعتمده»** —
وهي قاعدةُ النظام منذ المرحلة ٤. **والاعتمادُ يمرّ بالمسارين القائمين** لا بثالثٍ يُخترع:
الطلبُ يفتح استمارةَ الطلبات معبّأةً (`kassab:quick-request` + `?new=quick`، وهو مسارُ
«لصق رسالة عميل» نفسُه)، والعرضُ يفتح نافذةَ اللصق في العقارات ونصُّه مبذورٌ فيها. فمحلّلٌ
واحدٌ يُصان، وشاشةُ اعتمادٍ واحدةٌ تُعرف. **والفرزُ اقتراحٌ**: تعتمدها على غير ما فُرزت متى شئت.

**والمعروفُ يُقال**: جوالُ الرسالة يُقارن بعملائك، فيظهر «هذا عميلُك: خالد الدوسري» —
فلا تكلّمه من الصفر وهو يعرفك، ولا يُنشأ له سجلٌّ ثانٍ.

### د. قفلان لا قفلٌ واحد

**١) سرُّ الوِبهوك** (`TELEGRAM_SECRET`) يُسلَّم لتيليجرام فيعيده في ترويسة كلّ طلب.
وبلا ضبطه **تُرفض الحمولات كلُّها** ٥٠٣ — نقطةٌ عامّةٌ بلا سرٍّ تعني أنّ من عرف عنوانك
يدسّ في صندوقك ما شاء. والرفضُ ٥٠٣ لا ٤٠٣ لأنّ العيبَ عندنا، وتيليجرام يعيد المحاولة.

**٢) البوتُ يربط نفسَه**: اسمُه يُبحث عنه في تيليجرام فأيُّ أحدٍ يراسله، فلا يُقبل إلا
من محادثةٍ واحدة. **وأوّلُ من يراسله يصير صاحبَه** ويُحفظ في التخزين، ويُفصل من صفحة
«الوارد» متى شئت.

### هـ. خمسةُ أعطابٍ وقعت فعلًا — وهي الدرس

**١. حدودُ الكلمات `\b` لا تطابق العربيّة.** كتبتُ الشواهدَ بها فكان الفارزُ يعيد صفرًا
على كلّ رسالة — **الميزةُ كلُّها معطّلةٌ وهي تبدو سليمة**. وهي في جافاسكربت حدٌّ بين
محرفٍ لاتينيٍّ وغيره، والعربيّةُ كلُّها «غيرُ ذلك» عندها. فصارت بنظرةٍ خلفيّةٍ وأماميّة
على `\p{L}` مع الراية `u`.

**٢. أودعتُ الدالّة في فرعٍ ولم أُقدّم بها `main`** — والموقعُ ينشر من `main` وحده، فبقي
صاحبُه يراسل بوتًا يرسل إلى عنوانٍ لا وجودَ له.

**٣. الردُّ يبتلع أخطاءه.** كتبتُ `catch { return false }` قصدًا ألّا يُفشل فشلُ الردِّ
حفظَ الرسالة — فصار يفشل **ولا يعلم أحدٌ أنّه فشل**. فصار السببُ يُسجَّل ويظهر في
السرد، ويُمحى وحدَه عند أوّل نجاح. **وصمتٌ لا يُعرف سببُه أسوأُ من خطإٍ يُقال.**

**٤. الربطُ بمتغيّر بيئة.** ألزمتُ صاحبَه برقصةٍ من ثلاث: البوتُ يعطيه رقمًا، فيلصقه،
ثم ينشر. **ولقطةُ المتغيّرات تُؤخذ لحظةَ بدء النشرة** — فمن حفظ متغيّرَه بعد بدئها بتسع
ثوانٍ لم يره خادمُه، وهذا ما وقع بالحرف. فصار الربطُ بأوّل رسالة.

**٥. مفاتيحُ النظام تُسرد كأنّها رسائل.** `_owner` و`_reply-error` تحت البادئة نفسِها،
فكانت تُعرض بطاقاتٍ فارغة **وحذفُ إحداها يحذف الربطَ فيصير البوتُ حرًّا لأوّل غريب**.
كشفه `inbox-page` قبل أن يصيب أحدًا.

### الملفات المعدَّلة وسببها

| الملف | لماذا |
| --- | --- |
| `js/util/lead-sort.js` | الشواهدُ وأوزانُها · ثلاثةُ أحكام · الحجّةُ تُقال · البصمة — **يستورده الخادمُ والمتصفّح** |
| `netlify/functions/telegram.js` | الاستقبالُ بقفليه · الربطُ الذاتيُّ · السردُ والحذفُ للمالك · سببُ فشل الردّ |
| `js/pages/inbox.js` | حالُ القناة · بطاقةٌ لكلّ رسالةٍ بحكمها وحجّتها · اعتمادٌ وحذفٌ وفصلُ ربط |
| `js/pages/properties.js` | `?new=paste` يفتح نافذةَ اللصق ونصُّها مبذورٌ فيها ويُقرأ فورًا |
| `js/app.js` · `js/util/sidebar.js` · `js/util/voice-commands.js` · `index.html` | المسارُ والبابُ والاسمُ المنطوق — **المواضعُ الأربعة معًا** |
| `tests/lead-sort-unit.mjs` · `tests/inbox-page.mjs` · `tests/run.mjs` · `tests/server.mjs` · `tests/shell-unit.mjs` | ٤٩ فحصًا: الفارزُ خالصًا، والصفحةُ في متصفّحٍ حقيقيّ · العدُّ ٢٨←٢٩ |

### لم يُمسّ

- **`DB_VERSION` باقٍ ١٠**: الوارِدُ في تخزين الخادم لا في IndexedDB — **بريدٌ لا سجلّ**،
  ولا يدخل مخزونَك إلا بعد اعتمادك، وحينها يدخل بمساره القديم بلا حقلٍ جديد.
- **المحلّلان كما هما**: `parseRequestText` و`parseOfferText` يُستعملان ولا يُعدَّلان.
- **الأسرارُ لا تدخل المستودعَ ولا IndexedDB ولا النسخ** — رمزُ البوت وسرُّه متغيّرا
  بيئةٍ في Netlify وحدهما.
- **ولا نموذجَ ذكاءٍ ولا مفتاحَ مدفوع** — الفرزُ قواعدُ مجّانيّة، ويبقى النموذجُ بابًا
  يُفتح عند الالتباس متى طُلب.

---

## ٥٩. المرحلة ٥٢ — كسّاب بعين العميل: اثنان وعشرون بندًا

تصفّحتُ البرنامجَ كما يتصفّحه من يفتحه أوّلَ مرّة، لا كما يقرؤه من كتبه. **والفرقُ
بينهما هو هذه المرحلة كلُّها**: ما يعمل بلا خطإٍ قد يكون مع ذلك بابًا لا يُفتح، أو رقمًا
لا يُبنى عليه، أو جدارَ نصٍّ يُتخطّى. وهذه البنودُ اثنان وعشرون، نُفّذت على ثلاث دفعات.

### أ. ما يفضح صاحبَه (٠١)

**الصفحةُ العامّةُ كانت تنشر ملاحظاتِك الداخليّة**، وهي تَعِد بخلاف ذلك بالحرف: «بحقولها
التسويقيّة فقط — بلا اسم المالك أو جواله أو ملاحظاتك الداخليّة». فظهر لمن تفاوضه
«المالك يرفض التعاون حاليًا» و«لوحة على العقار بلا رقم — يلزم البحث عن المالك».

فصار للعقار حقلٌ ثانٍ: `publicDesc` — **وما يُنشر هو هو وحدَه**. والملاحظاتُ تبقى لك
**ولا تُنقل إليه تلقائيًّا**: نقلُها يُعيد العطبَ بابًا آخر. ومن تركه فارغًا خرج عرضُه
بحقائقه بلا وصف، وهو أسلمُ من فضيحة.

### ب. الأرقامُ التي كانت تستوي (١١)

«لنورة القحطاني خمسُ مطابقات: ١٠٠٪ · ١٠٠٪ · ٩٢٪ … بأيّها تبدأ؟» — والعلّةُ أنّ المعايير
كانت **نجح/رسب**: السعرُ داخلَ الميزانية نسبتُه ١، والمساحةُ تساوي المطلوب أو تزيد
نسبتُها ١. فعقارٌ بمليونين وآخرُ بثلاثةٍ تحت سقفٍ واحدٍ لا يُفرَّق بينهما.

فأُضيفت **مرجّحاتٌ صغيرةٌ ترتّب ولا تُسقط** (`tiebreakersFor`): قربُ السعر من المعتاد
لميزانيّته، وقربُ المساحة من المطلوب، ووجودُ صورةٍ تُرسَل، وحداثةُ العهد بالمعروض.
مجموعُها اثنتا عشرةَ نقطةً على الأكثر، **ولا تهبط بالنسبة تحت حدّ العرض أبدًا** — فما
كان يظهر يبقى ظاهرًا وإنّما يترتّب. وكلُّ حسمٍ يُكتب سببُه على البطاقة: «الصور: بلا
صورة تُرسلها (−٣)» — فتصدّقه أو تتجاوزه بعلم.

### ج. جدرانُ النصّ والأبوابُ المغلقة (١٣ · ١٥ · ١٧ · ١٨ · ١٩)

- **الداشبورد في أوّل شهر**: خمسٌ وعشرون لوحةً، أكثرُها يقول «لا بيانات بعد» — فتُدفن
  الخمسُ التي فيها خبرُك الحقيقيّ. فتُنزع الفارغاتُ وتُجمع في سطرٍ **يسمّيها بأسمائها**،
  ويُعيدها زرُّ «أظهر الفارغ». ولا يقع الطيُّ لأقلَّ من ثلاث — لوحتان لا تستحقّان.
- **واتساب**: خطواتُ الربط وشروحُ القيود صارت خلف «كيف أربطه؟» و«كيف يعمل الردّ
  التلقائيّ؟». **والعنوانُ لم يُحذف** — من يربط أوّلَ مرّةٍ يجده بنقرة.
- **وقائمةُ القوالب الفارغة ليست بابًا**: كانت «اختر القالب» فارغةً وزرُّ إرسالٍ لا يعمل،
  والطريقُ إلى الحلّ مطويٌّ تحتها لا يُشير إليه شيء. فصارت **فعلًا واحدًا**: «سجّل قالبَك
  الأوّل» يفتح المحرّرَ ويُنشئ أوّلَ قالبٍ ويضع التركيزَ فيه.
- **الإعدادات على الجوّال**: خمسةٌ وعشرون لوحًا مفتوحةً = سبعٌ وعشرون شاشةَ تمرير. فيُفتح
  الأوّلُ ويُطوى ما بعده خلف عنوانه، **والبحثُ يفتح ما يوافقه** — وصار يقرأ `textContent`
  لا `innerText`، إذ المطويُّ لا نصَّ له في `innerText` فكان البحثُ يعمى عن كلّ مطويّ.
- **المطابقاتُ على الجوّال**: مطابقاتُ كلّ عميلٍ تُطوى تحت اسمه وعددها وأعلى نسبةٍ فيها.
- **وغلافُ البطاقة بلا صورة** كان يكرّر كلمةَ النوع بخطٍّ ضخم — وهي مكتوبةٌ تحتها. فصار
  أيقونةً صغيرةً وزرَّ «＋ أضف صورة»، وهو ما ينقص البطاقةَ فعلًا.

### د. ما يُقال ولا يُسكت عنه (١٤ · ٢٠ · ٢١ · ٢٢)

- **«ناقص» صارت تسمّي ما ينقص**: «بلا صور · بلا مالك». كان الجوابُ في `title` وحده —
  **ولا `title` على الجوّال أصلًا**، فكان عليك فتحُ كلّ عقارٍ لتعرف.
- **مصادرُ السوق صُحِّحت**: لوحاتُ تفاصيل صفقات وزارة العدل لم تعد تُحدَّث في بوّابة
  البيانات المفتوحة منذ صارت **البورصةُ العقاريّة** مَعرِضَ الصفقات الحيّ؛ فما هناك
  أرشيفٌ يصلح للاتّجاه لا لسعر الأمس. **وأُضيف مصدرٌ مجّانيٌّ يعمل اليوم ولم يُسأل عنه**:
  مؤشّرُ الإيجار العامّ للهيئة (`rentalrei.rega.gov.sa/publicindicators`) — بلا حسابٍ
  ولا نفاذ، ومتوسّطاتُه بالحيّ والنوع أقربُ ما يُسند به تسعيرةَ إيجار.
- **ولماذا صرفتَ هذا الوارد؟** الحذفُ الصامت يضيّع أنفعَ ما في الصندوق: أن ترى بعد شهرٍ
  أنّ نصفَ ما يصلك دعايةٌ فتغلق البابَ من أوّله. فيُسأل عن السبب ويُحفظ (`tg/_rejects`،
  خمسون سطرًا) ويُعرض مجموعًا بنمطه. **والسببُ اختياريّ**: «احذفه بلا سبب» بابٌ قائم،
  فلا يصير السؤالُ ضريبة. **ويُحفظ السببُ وحدَه لا نصُّ الرسالة.**
- **وصندوقُ التاريخ الفارغ يقول سببَه**: من رأى `mm/dd/yyyy` في واجهةٍ عربيّةٍ ظنّه عطبًا،
  وهو ترتيبُ جهازه ولا يملك الموقعُ تبديلَه. فصار تحته سطرٌ يقوله، يزول فور أن يُكتب
  التاريخُ بالعربيّة والهجريّ مكانه.

### هـ. ما أصلحته الدفعتان الأوليان (٠٢ — ٠٩ · ١٠ · ١٢ · ١٦)

جمعُ المعدودات في الصفحة العامّة («٣ دقيقة» ← «٣ دقائق»)، **وحارسُ الجمع امتدّ إلى
`offers/`** فكشف العطبَ الثالث في ساعته. وصفحةُ **ملفّ العقار** (`#/property/<id>`) قراءةً
محضةً — فالنقرةُ على البطاقة تفتح ملفًّا يُقرأ لا استمارةً بثمانيةٍ وثلاثين حقلًا. وحقائقُ
النوع وزرُّ الحجز وترتيبُ السعر ومشاركةُ العرض في الصفحة العامّة. وتاريخُ الجولة بصيغة
الإنسان، والجوّالُ لا يُكسر سطرين، والوسمُ يلتفّ ولا يُقصّ، ورقاقةُ «الكل» بلا رقمٍ يُضلّل.

### و. ثلاثةُ اختباراتٍ كشفت أثرَ التغيير — وهو أنفعُ ما فيها

**١. `offer-pwa-push`** كانت بذرتُها `notes: 'فلة زاوية'` وتنتظرها في الصفحة العامّة.
فلمّا صار المنشورُ `publicDesc` وحدَه **سقطت** — وهذا هو الإصلاحُ نفسُه يُرى. فصارت
البذرةُ ملاحظةً داخليّةً صريحة («المالك يرفض التعاون حاليًا») ووصفًا تسويقيًّا، والفحصُ
يشترط الأوّلَ غائبًا والثانيَ حاضرًا — **فحصٌ أقوى ممّا كان**.

**٢. `evidence-revival`** كانت تنقر صفَّ العقار وتنتظر الاستمارة، والنقرةُ صارت تفتح
الملفّ. فصارت تفحص الملفَّ أوّلًا (شهادةُ السوق ورحلةُ السعر فيه)، ثمّ تفتح الاستمارةَ
من زرّها كما يفتحها صاحبُها — فبقيت لوحتُها مفحوصةً ولم يضع شيء.

**٣. `forecast-adcopy` و`whatsapp`** كانتا تقرآن نصًّا صار مطويًّا. فصارتا تفتحان الطيَّ
ثمّ تقرآن — **والمطويُّ موجودٌ لا محذوف**، وهذا ما تشهد به.

### ز. عطبٌ كشفه الاختبار في هذه المرحلة نفسِها

`formatDate` استُعملت في `dashboard.js` **ولم تُستورَد** — وكتبتُ في التعليق أنّها
«مستوردةٌ في الملفّ نفسِه» وهي ليست كذلك. فكانت الداشبوردُ تنهار كاملةً عند أيّ جولةٍ
مسجَّلة. كشفتها `mobile-smoke` و`design-dhad` — **ثلاثُ حزمٍ في ثلاث صفحات، والمراجعةُ
بالعين لم تكشفها**. والدرسُ: تعليقٌ يدّعي شيئًا لا يجعله صحيحًا.

### الملفات المعدَّلة وسببها

| الملف | لماذا |
| --- | --- |
| `js/data/matching.js` | `tiebreakersFor` — أربعةُ مرجّحاتٍ ترتّب ولا تُسقط، ولا تهبط تحت حدّ العرض |
| `js/pages/matches.js` | المرجّحاتُ تُعرض بأسبابها · مطابقاتُ العميل تُطوى على الجوّال |
| `js/pages/dashboard.js` | `foldEmptyPanels` — الفارغُ يُجمع في سطرٍ يسمّيه · **استيرادُ `formatDate` الناقص** |
| `js/pages/properties.js` | «ناقص» تسمّي ما ينقص · الغلافُ الفارغ أيقونةٌ وزرُّ «أضف صورة» |
| `js/pages/whatsapp.js` | الشرحُ يُطلب لا يُفرض · «سجّل قالبَك الأوّل» بدل قائمةٍ فارغة |
| `js/pages/settings.js` | الأوّلُ مفتوحٌ وما بعده مطويّ على الجوّال · البحثُ يقرأ المطويّ ويفتحه |
| `js/pages/inbox.js` · `netlify/functions/telegram.js` | سببُ الصرف يُسأل ويُحفظ ويُقرأ نمطُه |
| `js/data/market-import.js` | تصحيحُ صفقات وزارة العدل والبورصة · مؤشّرُ الإيجار العامّ مصدرًا جديدًا |
| `js/util/dom.js` | `isNarrow` · `foldOnNarrow` · `disclosure` · صندوقُ التاريخ الفارغ يقول سببَه |
| `js/util/format.js` | «لوحة» و«قسم» و«قالب» في معجم المعدودات |
| `css/components.css` | رقاقةُ المرجّح · الطيُّ العامّ · طيُّ الإعدادات · الغلافُ المختصر |
| `tests/match-rank-unit.mjs` · `tests/run.mjs` | ١٥ فحصًا للمرجّحات: ترتّبُ، وتُعلّل، ولا تُسقط |
| `tests/inbox-page.mjs` · `tests/whatsapp.mjs` | سؤالُ السبب وحفظُه · الشرحُ المطويُّ يُفتح فيظهر العنوان |
| `tests/offer-pwa-push.mjs` · `tests/evidence-revival.mjs` · `tests/forecast-adcopy.mjs` | ما كشفه التغييرُ: الملاحظةُ لا تُنشر · النقرةُ تفتح الملفّ · الفارغُ يُطوى |

### لم يُمسّ

- **`DB_VERSION` باقٍ ١٠**: `publicDesc` حقلٌ افتراضيُّه `''` في المخطّط، والسجلُّ القديم
  يقرؤه فارغًا بلا هجرة. وأسبابُ الصرف في تخزين الخادم لا في IndexedDB.
- **المعاييرُ وأوزانُها كما هي**: المرجّحاتُ **بعد** الحساب لا داخله، فنسبةُ المعايير
  (`base`) تُعاد كما كانت مع النتيجة — ومن أراد الرقمَ القديم وجده.
- **ولا سحبَ آليًّا من أيّ منصّة**: المصادرُ الجديدةُ تُقرأ وتُستورَد ملفًّا، والوعدُ
  بسحبٍ من واجهةٍ غير موثّقةٍ وعدٌ ينكسر.
- **الأسرارُ لا تدخل المستودعَ ولا IndexedDB ولا النسخ.**

---

## ٦٠. المرحلة ٥٣ — الوارد يفرز ستّةً، وللفرصة بابُها

**ما طُلب:** أن يفرز بوتُ تيليجرام أصنافًا أكثرَ من الاثنين (عروض · طلبات): **أفكار
ومقترحات ومهامّ وفرصًا عقاريّة** — والأخيرةُ صفحةٌ جديدةٌ تُنشأ، تُرتَّب قوائمَ كصفحة
المهامّ.

### أ. لماذا صنفٌ سادسٌ لا وسمٌ على العقار؟

الطلبُ والعرضُ يدخلان مخزونك، **ومخزونُك يُطابَق ويُرسَل ويُنشَر**. ومزادٌ لم يُعلَن،
وورثةٌ يتقاسمون، ومالكٌ ينوي ولم يعرض — **ليست معروضةً بعد**. فلو دخلت مخزونَك لصارت
عروضًا وهميّةً تُرسَل لعملائك وتظهر في صفحتك العامّة، **وأنت مسؤولٌ نظامًا عمّا تعرض**.
ولو لم يكن لها بابٌ أصلًا لماتت في محادثةٍ أو ورقة. فصار لها بابُها: تُتابَع وتُنقل بين
مراحلها، **وإذا نضجت حُوِّلت عرضًا بضغطة** ودخلت المخزون كما يدخل أيُّ عرض.

### ب. الفارزُ: من حكمين إلى ستّة (`js/util/lead-sort.js`)

كان `sortIncoming` يزن كفّتين ويطرح إحداهما من الأخرى. وصار يزن **ستّ كفّاتٍ**، فيأخذ
أعلاها ويقيس فارقَه عن الثانية: `edge = top − second`، وما دون `MIN_EDGE` (٣) **التباسٌ
يُوسَم ولا يُخمَّن** كما كان. و`want`/`offer` يبقيان في النتيجة فلا ينكسر ما بُني عليهما،
ويُضاف `scores` بدرجةِ كلِّ صنف — **فيُرى على أيّ شيءٍ تردّدَ الفارز** لا الحكمُ وحده.

| الصنف | ما يميّزه | إلى أين يُعتمد |
| --- | --- | --- |
| طلب | فعلُ بحثٍ أو رغبةٍ أو سؤالٌ عن التوفّر | استمارةُ الطلبات معبّأةً |
| عرض | صكٌّ · واجهةٌ · رقمُ ترخيصٍ · «للبيع» | نافذةُ اللصق في العقارات |
| **فرصة عقاريّة** | مزادٌ · ورثةٌ · «ينوي البيع» · لغةُ استثمار | صندوقُ الإضافة في «الفرص العقاريّة» |
| **مهمّة** | «ذكّرني» · «لا تنسَ» · فعلُ أمرٍ بموعد | صندوقُ الدفعة في «المهام» |
| **مقترَح** | «أقترح» · «يا ليت» · كلامٌ عن البرنامج | «الأفكار والملاحظات» موسومًا «مقترَح» |
| **فكرة** | «فكرة» · «خطرت لي» · لغةُ تقييد | «الأفكار والملاحظات» موسومًا «فكرة» |

**و«فرصة» و«المزايدة» خرجتا من شواهد العرض** إلى شواهد الفرصة — والعرضُ يُعرف بصكّه
وواجهته ورقمِ ترخيصه، لا بلفظِ «فرصة» الذي يكتبه كلُّ معلن. وبقي «فرصة: فلة … زاوية …
رقم الترخيص» عرضًا كما كان، لأنّ شواهدَ العرض فيه تسعةٌ والفرصةِ أربعة.

**ولا شاشةَ اعتمادٍ سابعةٌ تُبنى**: كلُّ صنفٍ يُبذَر نصُّه في الصندوق القائم في صفحته
(`kassab:quick-prospect` · `kassab:quick-task` · `kassab:quick-note`) — **ولا يُحفظ شيءٌ
بلا ضغطتك**، وهي قاعدةُ النظام منذ المرحلة ٤.

### ج. صفحةُ «الفرص العقاريّة» (`js/pages/prospects.js`)

قوائمُ كقوائم المهامّ **عمدًا لا كسلًا**: الفرصةُ تمرّ بمراحلَ يصنعها صاحبُها، والمراحلُ
تختلف من مكتبٍ إلى مكتب — **فقوائمُك أنت لا قوائمُنا نحن**. وأربعُ مراحلَ مقترَحةٌ
(«سمعتُ بها» ← «أتحقّق منها» ← «كلّمتُ صاحبَها» ← «اتّفقنا») **تُنشأ بزرٍّ تضغطه لا في
صمت**، وتُسمّى وتُحذف كما تشاء.

وما زادته على المهمّة هو ما يجعلها فرصةً عقاريّة: **المدينةُ والحيُّ والنوعُ والسعرُ
المتوقَّع والمساحةُ وصاحبُها وجوّالُه ومن أين جاءت** — وأوّلُها يظهر على البطاقة نفسِها.
وثلاثةُ عروضٍ محفوظةٌ كتفضيل (لوحة · قائمة واحدة · جدول) بفلاتره وترتيبِه بالضغط على
العمود، كما في المهامّ.

**ولا تُغلق فرصةٌ بلا مآل**: `won` (نضجت وصارت عرضًا) أو `lost` (لم تنجح) أو `cold`
(بردت). والمدقّقُ في المخزن نفسِه يرفض `done: true` بلا `outcome` — **لا الشاشةُ وحدها**.
لأنّ أنفعَ ما في هذا السجلّ أن ترى بعد سنةٍ أنّ أكثرَ ما يفوتك يفوتك **لأنّك تأخّرت**
لا لأنّ السعر لم يناسب.

**واسمان متقاربان ولا لبس**: «الفرص» (`#/opportunities`) تحسب أحياءً يطلبها عملاؤك ولا
تملك فيها، و«الفرص العقاريّة» (`#/prospects`) بابٌ تتابعه. وكلُّ صفحةٍ تقول في صدرها
أنّها ليست الأخرى.

### د. حقلُ موعدٍ لا يوقظ أحدًا وعدٌ كاذب

البطاقةُ فيها «تذكير بتاريخ ووقت». فلو بقي حقلًا يُحفظ ولا يُقرأ **لكان زخرفًا يكذب**.
فصار `remindersFrom` يقبل المهامَّ والفرصَ معًا (دالّةٌ خالصةٌ على `done` و`dueAt`)،
و`syncReminders` يرفع الاثنين إلى `push-tick`، و`follow-up-alerts` يوقظ على فرصةٍ حلّ
موعدُها **بمانع التكرار نفسِه** (`reminded`) — ولا يُبنى مانعٌ ثالث.

### هـ. خمسةُ شواهدَ ميّتةٍ كشفها الاختبار

النصُّ يُطبَّع قبل المطابقة (ى←ي · ة←ه · أ←ا · ؤ←و · ئ←ي)، **فشاهدٌ مكتوبٌ بحرفٍ غيرِ
مطبَّعٍ لا يطابق شيئًا أبدًا — وهو ساكتٌ لا يشتكي**. فكتبتُ «لا تنسى» و«أتمنى» و«عائد»
فما طابقت واحدةً منها، وكشفها أوّلُ فحص. ووُجد معها اثنتان **قديمتان بلا بديلٍ حيّ**:
«نبغى» في شواهد الطلب و«مؤثثة» في شواهد العرض — فكان «نبغى شقة» لا يُقرأ طلبًا منذ
المرحلة ٥١. **وصار في اختبار الوحدة حارسٌ دائم** يمرّ على كلِّ شاهدٍ في الأصناف الستّة
ويرفض أيّ حرفٍ غيرِ مطبَّع، فلا يعود العطب.

### و. الملفات المعدَّلة وسببها

| الملف | لماذا |
| --- | --- |
| `js/util/lead-sort.js` | ستُّ كفّاتٍ لا كفّتان · `KINDS`/`KIND_ACC`/`scores` · شواهدُ الأصناف الأربعة · تطبيعُ الشواهد |
| `netlify/functions/telegram.js` | العنوانُ من الفارز لا من نسخةٍ ثانيةٍ هنا · نصُّ الترحيب يذكر الستّة |
| `js/pages/inbox.js` | ستّةُ أزرارِ اعتمادٍ على كلّ بطاقة، المقترَحُ أوّلًا · ألوانُ الوسم · مساراتُ البذر |
| `js/pages/prospects.js` | **الصفحةُ الجديدة**: قوائمُ ومراحلُ وبطاقةٌ بحقول العقار · ثلاثةُ عروض · المآلُ · «حوّلها عرضًا» |
| `js/data/schema.js` | مخطّطا `prospectLists`/`prospects` · `ENUMS.prospectOutcomes` |
| `js/data/adapters/indexeddb.js` | `DB_VERSION` ١٠ ← ١١ ومخزنان بفهارسهما |
| `js/data/repository.js` | مطبِّعان ومدقّقٌ يرفض الإغلاق بلا مآل · حذفُ القائمة يحذف فرصَها · تتبّعُ انتقال المراحل |
| `js/pages/notes.js` · `js/pages/tasks.js` | بذرةُ الوارد تُملأ في الصندوق القائم وتنتظر ضغطتك · الوسمُ يأتي معها |
| `js/util/push.js` · `js/util/follow-up-alerts.js` | موعدُ الفرصة يوقظ كما يوقظ موعدُ المهمّة، بالمانع نفسِه |
| `js/util/global-search.js` | **بابٌ جديدٌ لا يُفتح بلا بحثٍ يصله** — مجموعةُ «الفرص العقاريّة» |
| `js/app.js` · `js/util/sidebar.js` · `index.html` · `js/util/voice-commands.js` | المسارُ والرابطُ والأمرُ الصوتيّ |
| `js/util/client-mode.js` | وضعُ «عرض للعميل» يخفيها — فيها اسمُ المالك وجوّالُه |
| `js/util/format.js` | «فرصة» و«مرحلة» و«سطر» في معجم المعدودات |
| `tests/prospects.mjs` · `tests/run.mjs` | ٢٤ فحصًا: المخزنان والمراحلُ والمآلُ والتحويلُ والبحثُ والوارد بستّة أبواب |
| `tests/lead-sort-unit.mjs` | الأصنافُ الأربعة · الصيغةُ المنصوبة · **حارسُ الشاهد الميّت** |
| `tests/app-pages.mjs` | الصفحةُ الجديدة في جولة الصفحات |
| `js/pages/settings.js` | معجمُ أسماء السلّة يكتمل — **سبعةُ مخازنَ كانت تظهر بالإنجليزيّة** |
| `css/base.css` | القائمةُ هي المِمرّ لا الشريط · «الإعدادات» مثبَّتةٌ في الأسفل · شريطُ تمريرٍ ظاهر |
| `js/util/sidebar.js` | `DEFAULT_FOLDS` · `applyNavFolds` · `toggleNavGroup` · `revealGroupOf` · العنوانُ زرٌّ بعدّاد |
| `js/util/client-mode.js` | عددُ المطويّ يتبع ما يُرى — فالمخفيُّ لا يُحسب |
| `tests/deals-and-sources.mjs` | البحثُ عن الزرّ يُقصَر على `#page` — فالعنوانُ صار زرًّا يطابقه |
| `js/app.js` | الصفحةُ المفتوحةُ تُمرَّر إليها في القائمة |
| `tests/sidebar-order.mjs` | **فحصٌ يقيس ما يُرى**: «الإعدادات» داخل الشريط بلا تمرير، وتُنقر فتفتح |

### ز. عطبان كشفتهما المراجعة بعد الدفع

**١. سجلٌّ محذوفٌ كان يُسمّى بالإنجليزيّة.** سلّةُ المحذوفات تترجم اسمَ المخزن من
`TRASH_LABELS`، وما ليس فيها يظهر باسمه الخام. فكانت الفرصةُ المحذوفةُ تُسمّى `prospects`
في شاشةٍ عربيّة — **ووُجد معها ستّةٌ قديمةٌ بالعيب نفسِه**: `incomes` و`showings`
و`matches` و`extractions` و`marketDeals` وقائمةُ الفرص. فأُكمل المعجم.

**٢. التراجعُ عن الإغلاق يترك البطاقةَ تكذب.** مربّعُ الإغلاق يُؤشَّر بضغطتك **قبل** أن
يُسأل عن المآل. فمن تراجع بقي المربّعُ مؤشَّرًا والبطاقةُ تبدو مغلقةً وهي مفتوحة، حتى
يُعاد تحميلُ الصفحة. **وشاشةٌ تكذب أسوأُ من شاشةٍ تتأخّر** — فصار التراجعُ يُعيد الرسم.

### ز٣. البابُ الثلاثون كسر القائمة — ولم يكشفه فحصٌ واحد

**ما قاله صاحبُ المكتب:** «كتبتُ ترتيب، وكتبتُ الإعدادات، ولم تظهر لي. دخلتُ بالرابط
ووصلتُ لها، ولكنّها لا توجد في القائمة».

**وما وجدتُه بالقياس في متصفّحٍ حقيقيّ:** القائمةُ صارت بـ«الفرص العقاريّة» ثلاثين بابًا
وأربعةَ عناوين — **١٦٣٣ بكسلًا في شاشةٍ ارتفاعُها ٧٦٨–٩٠٠**. فثلثُها الأخير تحت الطيّ:
«الإعدادات» عند ١٥٧٩ بكسلًا، أي **نحو ٨٠٠ بكسلٍ أسفلَ ما يُرى**. وهي تُمرَّر فعلًا
(`overflow-y: auto` على `.sidebar`)، **لكنّ رفًّا عرضُه ٦٠ بكسلًا من أيقوناتٍ لا يقول
لأحدٍ إنّه يُمرَّر** — فمن بحث عن بابٍ لم يجده، وهذا ما وقع.

**ولا فحصَ عندنا كان يكشفها**: `sidebar-order` تقرأ ترتيبَ العناصر في الـDOM، و`design-dhad`
تقيس مساحةَ اللمس — **وكلاهما يمرّ على عنصرٍ لا تراه العين**. فالحضورُ في الـDOM ليس
ظهورًا، والاختبارُ الذي لا يقيس ما يُرى يشهد بما لا يقع.

**والعلاج ثلاثة:**

١. **الرأسُ يثبت والقائمةُ هي المِمرّ**: `overflow` انتقلت من `.sidebar` إلى `.sidebar-nav`
   (مع `flex: 1 1 auto; min-height: 0` — وبدون `min-height: 0` **لا ينكمش عنصرُ الفلكس
   فلا يُمرَّر أصلًا**)، وبشريط تمريرٍ رفيعٍ **ظاهرٍ** يقول إنّ تحته مزيدًا.

٢. **«الإعدادات» لا تغيب**: `position: sticky; bottom: 0` ما دامت آخرَ القائمة
   (`:last-child`) — فتُرى دائمًا وتُنقر وهي مثبَّتة. ومن رفعها بترتيبه عادت رابطًا كغيره،
   **فالتثبيتُ لا يصادر ترتيبَك**. وهي البابُ الذي **منه يُصلَح الترتيبُ نفسُه**، فغيابُها
   يُغلق البابَ على من يريد إصلاح القائمة.

٣. **الصفحةُ المفتوحةُ تُمرَّر إليها** (`scrollIntoView({ block: 'nearest' })`) — فمن فتح
   بابًا بالعنوان المباشر رأى أين هو من القائمة. و`nearest` لا تحرّك شيئًا إن كان ظاهرًا،
   فلا تقفز القائمةُ في كلّ نقلة.

**وصار الفحصُ يقيس ما يُرى لا ما في الـDOM**: على ١٢٨٠×٨٠٠ و١٣٦٦×٧٦٨ يُشترط أن يقع
مستطيلُ «الإعدادات» داخل مستطيل الشريط بلا تمرير، وأن تُنقر فتفتح.

### ز٤. طيُّ المجموعات — والتجميعُ وحدَه لا يعالج الزحام

التثبيتُ والتمريرُ عالجا **الوصول**: صارت «الإعدادات» تُرى وتُنقر. ولم يعالجا **الزحام**:
من يفتح القائمة يريد بابًا واحدًا، فتُعرض عليه ثلاثون. فصار عنوانُ كلِّ مجموعةٍ **زرًّا**
يطويها ويفتحها.

| | قبل | بعد |
| --- | --- | --- |
| ارتفاعُ القائمة | ١٦٣٣px | **٩١٢px** |
| الروابطُ الظاهرة | ٣٠ | **١٧** |

**و«العمل» وحدَها مفتوحةٌ افتراضًا** — هي ما يُفتح كلَّ يوم، والثلاثُ الباقية تُفتح عند
الحاجة. والاختيارُ يُحفظ في إعدادات العرض (`navFolds`)، **فما فتحتَه يبقى مفتوحًا غدًا**.

**وأربعةُ أحكامٍ تحفظ الطيَّ من أن يصير حجبًا:**

١. **المطويُّ يقول عددَ ما تحته** («الأدوات ٧») — فبابٌ مغلقٌ بلا عددٍ لا يُعرف ما خلفه.
   ويُعدّ الظاهرُ وحدَه، فرابطٌ أخفاه «وضع عرض للعميل» لا يُحسب لك.

٢. **«الإعدادات» مستثناةٌ من الطيّ** — هي المثبَّتة في الأسفل، **ومنها يُصلَح الترتيبُ
   نفسُه**، فطيُّ «الأدوات» لا يبتلعها وإلّا عاد العطبُ الذي عالجناه قبل سطرين.

٣. **ولا يُخفى البابُ الذي أنت فيه**: من فتح صفحةً بعنوانها المباشر ومجموعتُها مطويّة
   تُفتح مجموعتُه ويُحفظ ذلك (`revealGroupOf`).

٤. **العنوانُ زرٌّ لا سطرٌ زينة**: كان `div` بـ`aria-hidden`، وصار `button` يصله التركيز
   ويقرؤه قارئُ الشاشة بحاله (`aria-expanded`)، ومساحةُ لمسِه ٤٤ بكسلًا على الجوّال.
   وفي رفِّ الأيقونات يبقى السهمُ والعددُ وحدَهما وعنوانُه في `aria-label` — **فما لا
   يُسمّى لا يُقرأ، ولا يُترك بلا اسم**.

**وعطبٌ ثانٍ كشفه الطقمُ كاملًا**: صار عنوانُ المجموعة `button`، و«الإدارة والالتزام»
يطابق `button:has-text("إدارة")` — فكان فحصُ الصفقات يلتقط **زرَّ الشريط** لا زرَّ الصفقة
بـ`.first()`. **ودرسُه أنّ تحويلَ عنصرٍ إلى زرٍّ يوسّع ما تطابقه كلُّ مِحدِّدةٍ في المستودع**،
فقُصر البحثُ على `#page`. ولم يوجد غيرُه: ٢٧٠٠ فحصٍ مرّت.

**وفحصٌ كشف سلوكًا صحيحًا لا عطبًا**: أخفق فحصُ «العملُ وحدَها مفتوحة» لأنّ القسمَ الذي
قبله فتح «الإعدادات» — ففُتحت «الأدوات» وحُفظت، **وهو عينُ ما وُضع له الحكمُ الثالث**.
فصار الفحصُ يُرجع الحالَ إلى افتراضيّها قبل أن يقيسها: **لا يُختبَر الافتراضيُّ على حالٍ
غيّرها فحصٌ قبله**.

### ز٢. لم يُمسّ

- **صفحةُ «الفرص» (`opportunities`) كما هي حرفًا بحرف** — ولا يتغيّر مسارٌ ولا يُحذف باب.
- **المطابقةُ لا تراها**: الفرصةُ ليست في `candidatesFor` ولا في الصفحة العامّة ولا في
  النشر — **وهذا هو سببُ وجودها أصلًا**، فلا تُرسَل لعميلٍ ولا تُعلَن.
- **الهجرةُ تُنشئ الناقصَ فقط**: `upgrade()` لا يمسّ مخزنًا ولا بيانات، فلا ترحيلَ يدويّ
  ولا يفقد أحدٌ شيئًا عند فتح النسخة الجديدة.
- **المهامُّ والأفكارُ لم يُبنَ لها مخزنٌ ثانٍ**: المقترَحُ فكرةٌ موسومةٌ في مخزن `notes`
  نفسِه — **ومخزنٌ ثالثٌ يستلزم هجرةً وشاشةَ إدارةٍ بلا مقابل**.
- **الأسرارُ لا تدخل المستودعَ ولا IndexedDB ولا النسخ.**

---

## ٦١. المرحلة ٥٤ — المرافقُ، والأقسامُ بيدك، ونبضُ القناة

ثمانيةُ بنودٍ طلبها صاحبُ المكتب دفعةً واحدة. هذا ما صار في كلٍّ منها.

### أ. الوارد: بابٌ رابعٌ «عدّله»

كانت أمامك ثلاثة: طلبٌ أو عرضٌ أو حذف. **ورسالةٌ تحتاج لمسةً يسيرة** — رقمٌ التصق، أو
سطرُ دعايةٍ ملصق — لم يكن لها باب: تُحذف وتُكتب من الصفر، أو تُعتمد ناقصةً وتُصحَّح في
الاستمارة. فصار `PUT /api/telegram` يعدّل النصَّ في مكانه، **ويُعاد الفرزُ بعد التعديل**
فمن حذف «للبيع» لم يبقَ الحكمُ عرضًا، **وتُعاد البصمة** فلا يتكرّر الأصلُ لو أُعيد تحويلُه.
والمعدَّلةُ تُوسَم بوقت تعديلها — **نصٌّ غُيِّر ويُعرض كأنّه ما وصل يُضلّل من يراجعه بعدك**.

### ب. «أرسلتُ أمسِ ولم أجدها» — نبضُ القناة

والصندوقُ الفارغ كان **لا يُفرّق بين ثلاثٍ**: لم تصل أصلًا (وِبهوكٌ لم يُسجَّل عند
تيليجرام)، أو وصلت ورُدّت (سرٌّ خاطئ أو محادثةٌ غريبة)، أو وصلت واعتمدتَها فخرجت.
**وبينها فرقُ علاجٍ كامل.** فصار كلُّ ردٍّ يُعدّ بسببه في `tg/_pulse`:

| العدّاد | ماذا يقول |
| --- | --- |
| `arrived` | وصل الخادمَ شيءٌ فعلًا |
| `badSecret` | ⚠︎ السرُّ في الترويسة لا يطابق `TELEGRAM_SECRET` |
| `strangerChat` | من محادثةٍ غير محادثتك |
| `noText` | صورةٌ أو صوتٌ بلا تعليق |
| `stored` / `duplicate` | دخلت، أو مكرَّرةٌ لم تُضَف مرّتين |

**عدّادٌ بلا نصوصٍ ولا معرّفات.** وإن كان `arrived` صفرًا فالخللُ قبل الخادم — أي
الوِبهوكُ لم يُسجَّل، وهو أوّلُ ما يُفحص.

**ولا تحويلَ بلا موافقة**: هذا كان قائمًا منذ المرحلة ٥١ ولم يتغيّر — الفرزُ **وسمٌ على
البطاقة لا نقلٌ إلى مكان**، والاعتمادُ يفتح الاستمارةَ معبّأةً وتحفظها أنت. وصار النصُّ
يقول ذلك صراحةً في صدر الصفحة بدل أن يُفهم ضمنًا.

### ج. صفحةُ «إدارة المرافق» (`#/facilities`)

المرفقُ ما يخدم العقارَ ولا يُباع معه: مصعدٌ يقف، ومولّدٌ يحتاج وقودًا، وخزّانٌ يُنظَّف.
وكان يعيش في ملاحظات العقار — **فلا يُحصى ولا تُعرف حالُه ولا يُسأل عنه إلّا حين يتعطّل**.

**وحقولُها قليلةٌ عمدًا**: اسمٌ ونوعٌ حرٌّ وعقارٌ يتبعه وحالٌ وملاحظة. وصاحبُ المكتب قال
إنّ تفاصيلَ محتواها تأتي لاحقًا — **فلا يُخترع له عملٌ لم يطلبه**: لا عقودُ صيانةٍ دوريّةٌ
ولا موردون ولا دوراتُ فحص. وما يُضاف لاحقًا يُضاف حقولًا افتراضيُّها فارغ بلا هجرة.

### د. الإضافةُ من مكانها — في الإدارتين

كان إدخالُ عقارٍ تحت الإدارة **أربعَ خطوات**: افتح «العقارات» ← ابحث ← افتح استمارته ←
أشِّر على خانةٍ فيها. فصارت لوحةٌ في «إدارة الأملاك» نفسِها تعرض ما عندك ممّا ليس تحت
الإدارة، فتختار وتُضيف بعقده وأجره في نافذةٍ واحدة. ومثلُها في «إدارة المرافق».

**وزرُّ «عقار جديد» يفتح استمارةَ العقارات القائمة** (`?new=1`) — فلا استمارةُ عقارٍ ثانية
تُبنى وتُصان في صفحتين.

### هـ. الأقسامُ صارت بيدك، والسحبُ والإفلات

كانت أربعةً مكتوبةً في الشيفرة — **ومكتبُ كلِّ أحدٍ غيرُ مكتب غيره**. فصارت **بيانات**
(`navSections`): تُسمّى وتُعاد تسميتُها وتُضاف وتُحذف، وتُرتَّب هي وصفحاتُها بالسحب والإفلات.

**والسهمان باقيان مع السحب لا بدلًا منه**: السحبُ لا يعمل باللمس إلّا بتعقيدٍ لا يستحقّه،
ولا يعمل لمن يتنقّل بالكيبورد أصلًا — **فطريقةٌ واحدةٌ لا تكفي**. والسهمُ يعبر حدَّ القسم:
الصفحةُ في رأس قسمها تصعد إلى ذيل الذي قبله.

**وأربعةُ أحكامٍ تحفظ ما بُني قبلها:**

١. **البناءُ الافتراضيُّ هو التجميعُ القديم نفسُه**، ويُحترم ترتيبُك المحفوظ من المرحلة ٨
   عند أوّل بناء — **فمن لم يمسّها لم يتغيّر عنده شيء، ولا يضيع ما رتّبتَه**.
٢. **ولا يسقط بابٌ**: صفحةٌ تُضاف في تحديثٍ لاحقٍ تلحق بقسمها الافتراضيّ، وصفحةٌ حُذفت
   تسقط، ومفتاحٌ مكرَّرٌ يُبقى أوّلَ موضعٍ له.
٣. **ولا تسقط صفحةٌ مع قسمها**: حذفُ القسم ينقل صفحاتِه إلى الذي قبله، ويُقال ذلك في
   نصّ التأكيد قبل أن تضغط.
٤. **والطيُّ صار صنفًا على الرابط لا قاعدةَ CSS لكلّ قسم**: معرّفاتُ الأقسام بيدك،
   **ولا تُكتب قواعدُ لأسماءٍ لا تُعرف**.

### و. التدقيق: رابطٌ ميّتٌ منذ المرحلة ٤٧

فُحص المستودعُ كلُّه آليًّا: كلُّ `#/…` مقابل المسارات المسجَّلة، وكلُّ بذرةِ تسليمٍ بين
الصفحات مقابل قارئها، وكلُّ مخزنٍ مقابل مخطّطه ومحوّله وتسجيله.

**ووُجد واحد**: بطاقةُ «خُذ نسخةً احتياطيّة» في قائمة البدء تشير إلى `#/tools` —
**و«الأدوات» اسمُ مجموعةٍ في القائمة لا اسمُ صفحة**. فكان زرُّ **أوّلِ خطوةٍ يُوصي بها
النظامُ مستخدمَه الجديدَ** يهبط به على «مسارٌ غير معروف». والنسخةُ في الإعدادات.

**ولا يكشفه فحصُ متصفّحٍ إلّا أن يُنقر ذلك الزرُّ بعينه** — فصار يُقرأ من الشيفرة نفسِها:
حارسٌ في `shell-unit` يمرّ على كلّ `href:` و`location.hash =` في `js/` ويرفض ما لا مسارَ له.

### ز. عطبان كشفهما الفحصُ في هذه المرحلة

**١. القسمُ الفارغ كان يُمحى قبل أن يُملأ.** `getSections` كانت تُسقط ما لا صفحةَ فيه،
فقسمٌ تُنشئه **يختفي قبل أن تسحب إليه أوّلَ صفحة**. وصار يبقى محفوظًا ولا يظهر في القائمة
الجانبيّة حتى يمتلئ — فلا عنوانَ بلا روابط.

**٢. وفحصٌ أخفق والمنتجُ سليم**: كتبتُ `.section-box:has-text("قسمي الخاصّ")`،
**واسمُ القسم في `<input>` لا في نصّ** — وقيمةُ الحقل ليست محتوًى نصّيًّا، فالمِحدِّدةُ لا
تراه أبدًا. فصار يُقرأ من `value`. والدرس: **فحصٌ يبحث عن قيمةِ حقلٍ في النصّ يشهد بما لا يقع.**

### ح. الملفات المعدَّلة وسببها

| الملف | لماذا |
| --- | --- |
| `netlify/functions/telegram.js` | `PUT` يعدّل النصَّ ويُعيد الفرزَ والبصمة · `tg/_pulse` يعدّ ما وصل وما رُدّ بسببه |
| `js/pages/inbox.js` | زرُّ «عدّله» ونافذتُه · وسمُ المعدَّلة · لوحةُ نبض القناة · «لا تحويلَ بلا موافقتك» صراحةً |
| `js/pages/facilities.js` | **الصفحةُ الجديدة**: إحصاءٌ وربطٌ بالعقار وحالٌ وإضافةٌ من مكانها |
| `js/pages/management.js` | لوحةُ «أضِف عقارًا إلى الإدارة» بعقده وأجره — بدل أربع خطوات |
| `js/data/schema.js` · `js/data/adapters/indexeddb.js` · `js/data/repository.js` | مخزن `facilities` و`DB_VERSION` ١١ ← ١٢ |
| `js/data/settings.js` | `navSections` — الأقسامُ بيانات |
| `js/util/sidebar.js` | `getSections`/`buildDefaultSections`/`sectionOf` · الطيُّ بمعرّفٍ لا بصنفٍ ثابت |
| `js/pages/settings.js` | محرّرُ الأقسام: تسميةٌ وإضافةٌ وحذفٌ وسحبٌ وإفلات · السهمُ يعبر الحدّ |
| `js/util/onboarding.js` | **`#/tools` رابطٌ ميّت** ← `#/settings` |
| `css/base.css` · `css/components.css` | الطيُّ بصنفٍ على الرابط · محرّرُ الأقسام ومقابضُه |
| `js/app.js` · `index.html` · `js/util/voice-commands.js` | مسارُ المرافق ورابطُه وأمرُه الصوتيّ |
| `js/util/format.js` | «صفحة» و«مرفق» في معجم المعدودات |
| `tests/facilities-sections.mjs` · `tests/run.mjs` | ٢٤ فحصًا للمرافق والإدارة والأقسام |
| `tests/shell-unit.mjs` | **حارسُ الروابط الميّتة** · عدُّ الصفحات ٣٠ ← ٣١ |

### ط. لم يُمسّ

- **ولا صفحةَ حُذفت ولا تغيّر مسار** — الأقسامُ عرضٌ لا حذف.
- **والهجرةُ تُنشئ الناقصَ فقط**: `upgrade()` لا يمسّ مخزنًا ولا بيانات.
- **ولا يزال لا شيءَ يدخل قاعدتَك بلا ضغطتك** — والتعديلُ في الوارد لا يُدخل شيئًا،
  الاعتمادُ وحدَه يفعل.
- **الأسرارُ لا تدخل المستودعَ ولا IndexedDB ولا النسخ.**

---

## ٦٢. المرحلة ٥٥ — السحبُ بالإصبع، و«انتهت جلستك» التي لم تكن جلسة

### أ. السحبُ كان يعلق — وثلاثةُ أسبابٍ اجتمعت

**ما قاله صاحبُ المكتب:** «إذا ضغطتُ يبقى الزرُّ معلّقًا ولا يتحرّك، ولا يرتفع ولا ينزل،
ولا حلّ له إلّا تحديثُ الصفحة».

١. **سحبُ المتصفّح (`draggable`) لا يعمل باللمس** — والجوّالُ هو جهازُه الأوّل. وبعضُ
   متصفّحات الجوّال تبدأ سحبًا بالضغط الطويل ثمّ لا تُنهيه أبدًا: وذلك «المعلَّق».
٢. **الصفُّ كلُّه كان يُسحب وفيه السهمان** — ضغطةٌ على السهم تتحرّك شعرةً فتصير بدايةَ
   سحبٍ لا نقرة، فلا يعمل السهمُ ويبقى الصفُّ باهتًا.
٣. **وشريطُ أقسام الإعدادات لاصقٌ فوق القائمة على الجوّال** — فمن سحب صفحةً إلى أعلى
   أفلتها **على الشريط لا على الصفّ**، فلا يتحرّك شيء. وحافّةُ التمرير التلقائيّ كانت في
   السبعين بكسلًا العليا **التي يغطّيها الشريطُ نفسُه**، فلا يبلغها الإصبعُ أبدًا.

**والثالثُ لم يكشفه إلّا سحبٌ بإصبعٍ حقيقيّ**: فحصُ الفأرة على شاشة الحاسب مرّ ناجحًا،
لأنّ الشريطَ هناك لا يغطّي الهدف. فلمّا سُحب بلمسٍ عبر بروتوكول Chrome وسُئل المتصفّحُ
«ما تحت الإصبع؟» أجاب: `NAV.settings-nav`.

**والعلاج:**
- السحبُ **بأحداث المؤشّر** (`pointerdown/move/up`) — تعمل للإصبع والفأرة والقلم معًا،
  **ويبدأ من المقبض ⠿ وحده** بمساحة ٤٤×٤٤ و`touch-action: none` فلا يُمرِّر الإصبعُ الصفحةَ.
- **الهدفُ يُقرأ من طبقات النقطة كلِّها** (`elementsFromPoint`) لا من أعلاها — فالغطاءُ
  اللاصقُ لا يحجب الصفَّ تحته.
- **حافّةُ التمرير تحت الأغطية اللاصقة** لا عند حافّة الشاشة.
- **ولا يُعاد الرسمُ والسحبُ قائم**: التنظيفُ قبل الحفظ، و`pointercancel` يُعيد كلَّ شيءٍ
  كما كان — **فلا يبقى شيءٌ معلّقًا مهما انقطع السحب**.

### ب. «انتهت جلستك» — ولم تكن جلسةً

الصفحةُ كانت تقولها لثلاثة أسبابٍ لا يُفرَّق بينها:

| السبب | العلاج |
| --- | --- |
| جلسةٌ انتهت فعلًا | خروجٌ ودخول |
| الدوالُّ لا ترى `APP_SECRET`/`APP_PASSWORD` | لا يُصلحه دخول — المتغيّرُ نفسُه |
| البوّابةُ لا ترى `APP_PASSWORD` | تفتح الموقعَ **بلا كلمة سرّ ولا تُصدِر جلسةً أصلًا** |

**والثاني أو الثالث وقع** بعد تأشير هذه المتغيّرات «Contains secret values» في Netlify.
فالبوّابةُ حين لا ترى كلمةَ السرّ **تفتح صامتة** (`if (!password) return context.next()`)
— وهذا مقصودٌ حتى لا يُحبس المالكُ خارج موقعه بخطأ إعداد — **لكنّ صمتَها جعل العطبَ لا يُرى**.

فصار الخادمُ والبوّابةُ **يُسألان عمّا يريان**:
- `GET /api/telegram?probe=1` — بلا دخول، **«نعم» أو «لا» لكلّ متغيّر ولا قيمةَ أبدًا**.
- البوّابةُ المفتوحةُ بلا كلمة سرّ تضع ترويسة `x-kassab-gate: open-no-password`.
- والوارد يقرأ الاثنين ويقول السببَ الحقّ وعلاجَه، ومعه حالُ متغيّرَي تيليجرام.

### ج. المتغيّراتُ الأربعة أُعيدت بلا تأشير «سرّيّ»

مُنعت المحاولةُ الأولى بمصنّف الصلاحيات («Secret-Store Writes»)، فلم يُحذف شيء. ثمّ أذن
صاحبُ المكتب صراحةً فأُعيدت الأربعةُ — `PUBLISH_TOKEN` و`VAPID_PRIVATE` و`APP_SECRET`
و`APP_PASSWORD` — **بقيمها نفسِها** بلا «Contains secret values»، ونطاقُها «All scopes».

**وبترتيبٍ يحمي الموقع**: فُحص الإذنُ بمتغيّرٍ تجريبيٍّ قبل حذف أيّ شيءٍ حقيقيّ، وكلُّ حذفٍ
تبعه إنشاؤه فورًا، و`APP_PASSWORD` آخرُها — **فلا يبقى الموقعُ بلا كلمة سرٍّ لحظةً** لو
مُنع الإنشاءُ بعد الحذف. ولأنّ القيمَ هي هي، **فالجلساتُ القائمةُ تبقى صالحة** ولا يُطلب
دخولٌ من جديد.

**والدرس**: علامةُ «سرّيّ» في Netlify تُخفي القيمةَ في لوحة التحكّم، **وقد تُخفيها عن
بيئة التشغيل أيضًا** — فلا تُوضع على متغيّرٍ تقرؤه بوّابةُ الحافة أو الدوالّ قبل التحقّق
من أنّها تصله. والتشخيصُ (`?probe=1`) صار يقول ذلك بلا تخمين.

### د. الملفات المعدَّلة وسببها

| الملف | لماذا |
| --- | --- |
| `js/pages/settings.js` | السحبُ بالمؤشّر من المقبض وحده · الهدفُ من طبقات النقطة كلِّها · حافّةُ التمرير تحت الأغطية اللاصقة |
| `css/components.css` | المقبضُ ٤٤×٤٤ و`touch-action: none` · لا صفَّ يدّعي أنّه يُسحب |
| `netlify/functions/telegram.js` | `?probe=1`: ما يراه الخادم — بلا قيم |
| `netlify/edge-functions/gate.js` | البوّابةُ المفتوحةُ بلا كلمة سرّ تقول ذلك في ترويسة |
| `js/pages/inbox.js` | «لماذا لا يُفتح الصندوق؟» بدل «انتهت جلستك» العامّة |
| `tests/facilities-sections.mjs` | سحبٌ بالفأرة **وبإصبعٍ حقيقيّ** · الضغطُ بلا حركةٍ لا يُعلِّق · السهمُ يعمل بعد السحب |
| `tests/inbox-page.mjs` | الفحصُ يُجيب بلا دخولٍ ولا يحمل قيمة · الحالُ تُسمّى باسمها |

### هـ. لم يُمسّ

- **قيمُ المتغيّرات** — أُعيدت كما هي حرفًا بحرف؛ تغيّرت علامةُ «سرّيّ» وحدَها.
- **البوّابةُ تبقى تفتح بلا كلمة سرّ** — فذلك يحمي المالكَ من الحبس خارج موقعه؛ وإنّما
  صارت تقول ذلك.
- **الأسرارُ لا تدخل المستودعَ ولا IndexedDB ولا النسخ** — والفحصُ لا يحمل قيمةً واحدة.

## ٦٣. المرحلة ٥٦ — الخزنةُ تُنسخ كلَّ ليلةٍ إلى درايف

طلب صاحبُ المكتب أن تُرفع النسخةُ الاحتياطية **إلى درايف يوميًّا وتلقائيًّا**. فصار
للخزنة (المرحلة ٣٥) نسخةٌ ثانية خارج Netlify: كلَّ ليلةٍ الساعةَ الثانية بتوقيت الرياض
تُنسخ **أحدثُ دفعةٍ كاملة** فيها إلى مجلدٍ اسمه «كسّاب — نسخ احتياطية» في درايف صاحب
المكتب، ويبقى آخرُ ثلاثين ملفًّا.

### أ. ما يُرفع: الخزنةُ كما هي — مشفَّرة

لا يُبنى في الخادم شيءٌ مقروء: الملفُّ هو **كتلُ الخزنة المشفَّرة بعبارتك في متصفحك**،
مجموعةً في ملفٍّ واحد `{ app, format: 'kassab-drive-1', at, batch, counts, encrypted, parts }`.
فلا جوجل يقرؤه ولا Netlify، وضياعُ حساب درايف لا يكشف عميلًا. والعبارةُ هي هي: من
نسيها لا يفكّ هذه ولا تلك.

والناقصةُ لا تُنسخ (دفعةٌ وصلت بعضُ كتلها): نصفُ نسخةٍ في درايف أسوأ من لا شيء لأنّك
تحسبها نسخة. **والدفعةُ نفسها لا تُنسخ ليلتين** — ملفّان متطابقان لا يحميان زيادة. و«انسخ
الآن» في الإعدادات يفرض النسخ ولو نُسخت.

والصورُ خارجه: حجمُها تسعةُ أعشار النسخة، ومكانُها الخزنةُ وملفُّ التصدير كما كانت.

### ب. الدخول بحسابك لا بـ«حساب خدمة»

حسابُ الخدمة في جوجل **لا مساحةَ له في درايف الشخصي**؛ فالطريقُ رمزُ تحديثٍ من حساب صاحب
المكتب بصلاحية **`drive.file` وحدها**: يرى ما أنشأه هو فقط، لا بقيّةَ ملفات درايف، ولا
يحتاج مراجعةَ جوجل. ويُشترط أن تكون شاشةُ الموافقة **In production** — ففي «Testing»
يموت الرمزُ بعد سبعة أيام، والرسالةُ حين يُرفض تقول ذلك بنصّه.

والأسرارُ الثلاثة `GDRIVE_CLIENT_ID` و`GDRIVE_CLIENT_SECRET` و`GDRIVE_REFRESH_TOKEN`
**في متغيّرات Netlify وحدها** — لا في المستودع ولا في الجهاز ولا في النسخة، ولا حقلَ في
التطبيق يطلبها. وبلا واحدٍ منها: `NOT_CONFIGURED` بأسماء ما ينقص، ولا زرَّ نسخٍ يوهم.

### ج. المجلدُ والتقليم

المجلدُ يُنشأ مرّةً ويُحفظ معرّفُه في `kassab-vault/drive/state`؛ فإن حُذف أو رُمي في
المهملات أُنشئ غيرُه. ويُقلَّم إلى ٣٠ ملفًّا يطابق اسمُها `kassab-backup-*.json`، الأقدمُ
أوّلًا — **وملفٌّ وضعتَه أنت في المجلد لا يُمسّ**. والرفعُ «قابلٌ للاستئناف» فلا حدَّ
خمسة ميغابايت الذي على الرفع البسيط.

### د. الاسترجاع: من طريق الملف نفسه

نزّل الملفَّ من المجلد، ثم «استيراد نسخة احتياطية» في لوحة النسخ الاحتياطي: يتعرّف على
صيغة درايف، ويفكّها بعبارة الخزنة المحفوظة (أو يسألك عنها)، ثم **يمرّ بمقارنة الاستيراد
نفسها** («١٢ عميلًا ← ٩») قبل أن يستبدل شيئًا. والعبارةُ الخاطئة تُرفض ولا يُمسّ شيء.

### هـ. ما لم يُختبر هنا

جوجل لا يُبلَغ من بيئة الاختبار؛ فالمسارُ كلُّه — الرمز، والمجلد، والرفع، والتقليم، والرمز
المنتهي — مختبَرٌ **بجوجل مزيَّف** يحاكي واجهاته، والدالةُ تأخذ `fetch` مُعاملًا لذلك.
وأوّلُ رفعٍ حقيقيّ يُرى بعد وضع المتغيّرات الثلاثة و«انسخ إلى درايف الآن».

### و. الكلفة

مجانًا: درايف المجاني ١٥ غيغابايت، واستدعاءٌ مجدولٌ واحدٌ يوميًّا من حصّة Netlify المجانية.

### ز. الملفات المعدَّلة وسببها

| الملف | لماذا |
| --- | --- |
| `netlify/lib/drive.js` (جديد) | المنطقُ كلُّه: أحدثُ دفعةٍ كاملة · الرمز · المجلد · الرفع القابل للاستئناف · التقليم · الأعطابُ بما يُصلحها · الحالة |
| `netlify/functions/drive-tick.js` (جديد) | المجدولةُ يوميًّا `0 23 * * *` |
| `netlify/functions/drive.js` (جديد) | `/api/drive` للمالك وحده: الحالة و«انسخ الآن» |
| `js/data/vault.js` | `driveStatus` · `driveRunNow` · `isDriveFile` · `readDriveFile` |
| `js/pages/settings.js` | لوحة «النسخ اليومي إلى Google Drive» بخطوات الإعداد · الاستيرادُ يقرأ ملفَّ درايف |
| `css/components.css` | الخطواتُ مرقّمة والمصطلحاتُ الإنجليزية معزولةُ الاتجاه |
| `tests/drive-unit.mjs` (جديد) | المسارُ كاملًا بجوجل مزيَّف |
| `tests/drive-panel.mjs` (جديد) | اللوحةُ صادقةٌ بلا تهيئة · الحماية · الاسترجاعُ من ملفّ درايف بعبارةٍ خاطئة ثم صحيحة |
| `tests/server.mjs` · `tests/run.mjs` | المسارُ الجديد والحزمتان |

### ح. لم يُمسّ

- **الخزنةُ وتشفيرُها وعددُ نسخها** — درايف يقرأ منها ولا يكتب فيها إلّا حالتَه.
- **الأسرارُ لا تدخل المستودعَ ولا IndexedDB ولا النسخ**، ولا تظهر في الحالة المعروضة.
- **الرفعُ من المتصفح** — ما زال هو ما يملأ الخزنة؛ فـ«ارفع نسخة تلقائيًا» شرطُ حداثة نسخة درايف.
