# عقد طبقة البيانات — مُطابِق (بعد المرحلة ٩)

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
