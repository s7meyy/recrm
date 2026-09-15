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
