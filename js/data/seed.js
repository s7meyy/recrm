// بيانات تجريبية صغيرة: 10 عملاء و17 عقارًا في الرياض بأنواع وأحياء وحالات متنوعة،
// و8 طلبات عقارية لتشغيل محرك المطابقة (المرحلة ٣)، وسجل واحد لكل كيان آخر (جولة، مطابقة، عرض خارجي، صفقة)،
// وصور تجريبية مولَّدة عبر canvas إن كان المتصفح يدعمها. تُسجَّل المعرّفات في الإعدادات
// حتى يحذف "مسح البيانات التجريبية" هذه السجلات فقط دون بيانات المستخدم.

import { repo } from './repository.js';
import { storeImage, deleteImages } from './images.js';
import { getSeedInfo, setSeedInfo } from './settings.js';

const daysAgo = (n, hour = 10) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};
const daysAhead = (n) => daysAgo(-n, 0);

function makeSampleImage(label, color) {
  return new Promise((resolve) => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 800;
      canvas.height = 600;
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve(null); return; }
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 800, 600);
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fillRect(40, 40, 720, 520);
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.font = 'bold 44px sans-serif';
      ctx.fillText(label, 400, 290);
      ctx.font = '26px sans-serif';
      ctx.fillText('صورة تجريبية', 400, 345);
      canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.85);
    } catch (_) {
      resolve(null);
    }
  });
}

export async function seedExists() {
  const info = await getSeedInfo();
  return !!(info && info.ids);
}

export async function insertSeed() {
  if (await seedExists()) throw new Error('البيانات التجريبية موجودة بالفعل');
  const ids = { clients: [], properties: [], images: [], tours: [], requests: [], matches: [], externalListings: [], deals: [], taskLists: [], tasks: [] };

  const c = {};
  c.mohammed = await repo.clients.create({
    name: 'محمد العتيبي', phone: '0501234567', roles: ['owner'], stage: 'contacted', tags: [],
    notes: 'يملك أرضًا في الياسمين وأخرى في العارض',
    contacts: [
      { id: 'seed-c1', type: 'call', date: daysAgo(3), note: 'استفسر عن السعر المتوقع لأرض الياسمين', followUpAt: daysAhead(1), createdAt: daysAgo(3), createdBy: 'seed' },
    ],
  });
  c.sarah = await repo.clients.create({
    name: 'سارة الشهري', phone: '0559876543', roles: ['seeker'], stage: 'new', notes: 'تبحث عن شقة تمليك شمال الرياض',
  });
  c.khalid = await repo.clients.create({
    name: 'خالد الدوسري', phone: '0533456789', phone2: '0114567890', roles: ['owner', 'seeker'], stage: 'negotiating',
    notes: 'يبيع فلته في الملقا ويطلب أرضًا استثمارية',
    contacts: [
      { id: 'seed-c2', type: 'whatsapp', date: daysAgo(20), note: 'أرسل صور الفلة', followUpAt: daysAgo(10), createdAt: daysAgo(20), createdBy: 'seed' },
      { id: 'seed-c3', type: 'visit', date: daysAgo(25), note: 'زيارة ميدانية للفلة', followUpAt: null, createdAt: daysAgo(25), createdBy: 'seed' },
    ],
  });
  c.noura = await repo.clients.create({
    name: 'نورة القحطاني', phone: '0567891234', roles: ['seeker'], stage: 'contacted',
    contacts: [
      { id: 'seed-c4', type: 'call', date: daysAgo(1), note: 'تريد فلة في حطين أو الملقا بميزانية 3 ملايين', followUpAt: daysAhead(5), createdAt: daysAgo(1), createdBy: 'seed' },
    ],
  });
  c.abdullah = await repo.clients.create({
    name: 'عبدالله المطيري', phone: '0541122334', roles: ['owner'], stage: 'closed', notes: 'بيعت فلته في حطين',
  });
  c.fahad = await repo.clients.create({
    name: 'فهد الشمري', phone: '0587654321', roles: ['seeker'], stage: 'won', notes: 'اشترى فلة حطين',
  });
  c.reem = await repo.clients.create({
    name: 'ريم الحربي', phone: '0502223344', roles: ['seeker'], stage: 'contacted', notes: 'تبحث عن شقة تمليك بحدود 850 ألفًا',
  });
  c.bandar = await repo.clients.create({
    name: 'بندر السبيعي', phone: '0553334455', roles: ['owner', 'seeker'], stage: 'negotiating',
    notes: 'يملك عقارات شمال الرياض ويطلب دورًا للإيجار',
  });
  c.mona = await repo.clients.create({
    name: 'منى العنزي', phone: '0544445566', roles: ['seeker'], stage: 'new', notes: 'تريد فلة شمال الرياض بميزانية 3.5 مليون',
  });
  c.turki = await repo.clients.create({
    name: 'تركي الزهراني', phone: '0565556677', roles: ['seeker'], stage: 'contacted', notes: 'يطلب أرضًا في الرمال ويتحمل زيادة 150 ألفًا',
  });
  ids.clients.push(...Object.values(c).map((x) => x.id));

  const props = [
    {
      city: 'الرياض', district: 'الياسمين', type: 'land', purposes: ['sale'], area: 600, price: 1500000,
      ownerId: c.mohammed.id, status: 'agreed', location: { lat: 24.8302, lng: 46.6612 },
      typeFields: { plotDimensions: '20 × 30', streetWidth: 20, streetsCount: 1, facades: 'شمالية', plotPosition: 'middle', planNumber: '3100', plotNumber: '452' },
      notes: 'الصك إلكتروني', _image: ['أرض الياسمين', '#6b7c5c'],
    },
    {
      city: 'الرياض', district: 'الملقا', type: 'villa', purposes: ['sale'], area: 400, price: 2800000,
      ownerId: c.khalid.id, status: 'not_contacted', location: { lat: 24.8121, lng: 46.6005 },
      typeFields: { rooms: 6, floorsCount: 2, buildingAge: 3, buildingCondition: 'ممتازة' },
      notes: 'فلة درج داخلي مع شقة', _image: ['فلة الملقا', '#5a6e8c'],
    },
    {
      city: 'الرياض', district: 'النرجس', type: 'apartment', purposes: ['rent'], area: 150, price: 45000,
      ownerId: c.abdullah.id, status: 'rented',
      typeFields: { rooms: 3, floor: '2', buildingAge: 1, buildingCondition: 'جديدة' },
      notes: 'الإيجار سنوي',
    },
    {
      city: 'الرياض', district: 'الروضة', type: 'floor', purposes: ['rent'], area: 250, price: null,
      ownerId: null, status: 'not_contacted',
      typeFields: { rooms: 4, floor: 'أرضي', buildingAge: 12 },
      notes: 'لوحة على العقار بلا رقم — يلزم البحث عن المالك',
    },
    {
      city: 'الرياض', district: 'العارض', type: 'land', purposes: ['sale', 'investment'], area: 900, price: 2100000,
      ownerId: c.mohammed.id, status: 'refused', location: { lat: 24.9008, lng: 46.6501 },
      typeFields: { plotDimensions: '30 × 30', streetWidth: 36, streetsCount: 2, facades: 'شرقية جنوبية', plotPosition: 'corner', planNumber: '3335', plotNumber: '12' },
      notes: 'المالك يرفض التعاون حاليًا',
    },
    {
      city: 'الرياض', district: 'الياسمين', type: 'apartment', purposes: ['sale'], area: 180, price: 750000,
      ownerId: c.khalid.id, status: 'agreed',
      typeFields: { rooms: 4, floor: '1', floorsCount: 3, buildingAge: 2, buildingCondition: 'جيدة جدًا' },
      _image: ['شقة الياسمين', '#8c6a5a'],
    },
    {
      city: 'الرياض', district: 'حطين', type: 'villa', purposes: ['sale', 'rent'], area: 500, price: 4500000,
      ownerId: c.abdullah.id, status: 'sold', location: { lat: 24.7657, lng: 46.5911 },
      typeFields: { rooms: 7, floorsCount: 2, buildingAge: 5, buildingCondition: 'ممتازة' },
      notes: 'أُبرمت الصفقة',
    },
    {
      city: 'الرياض', district: 'الرمال', type: 'land', purposes: ['sale'], area: 750, price: 900000,
      ownerId: null, status: 'not_contacted',
      typeFields: { plotDimensions: '25 × 30', streetWidth: 15, streetsCount: 1 },
    },
    /* عقارات المرحلة ٣: مادة يعمل عليها محرك المطابقة (داخل الميزانية، وفوقها قليلًا، وبسعر مجهول) */
    {
      city: 'الرياض', district: 'حطين', type: 'villa', purposes: ['sale'], area: 450, price: 3200000,
      ownerId: c.khalid.id, status: 'agreed',
      typeFields: { rooms: 6, floorsCount: 2, buildingAge: 4, buildingCondition: 'ممتازة' },
      notes: 'أعلى من ميزانية 3 ملايين بقليل — يظهر بنسبة متدرّجة',
    },
    {
      city: 'الرياض', district: 'الملقا', type: 'villa', purposes: ['sale'], area: 380, price: 2950000,
      ownerId: c.bandar.id, status: 'agreed',
      typeFields: { rooms: 5, floorsCount: 2, buildingAge: 6, buildingCondition: 'جيدة جدًا' },
    },
    {
      city: 'الرياض', district: 'القيروان', type: 'villa', purposes: ['sale'], area: 420, price: null,
      ownerId: null, status: 'not_contacted',
      typeFields: { rooms: 6, floorsCount: 2, buildingAge: 2 },
      notes: 'السعر غير معروف — يظهر موسومًا ولا يسقط من المطابقة',
    },
    {
      city: 'الرياض', district: 'النرجس', type: 'land', purposes: ['sale', 'investment'], area: 500, price: 1250000,
      ownerId: c.mohammed.id, status: 'agreed',
      typeFields: { plotDimensions: '20 × 25', streetWidth: 20, streetsCount: 1, plotPosition: 'middle' },
    },
    {
      city: 'الرياض', district: 'الملقا', type: 'apartment', purposes: ['sale'], area: 170, price: 900000,
      ownerId: c.bandar.id, status: 'agreed',
      typeFields: { rooms: 4, floor: '2', floorsCount: 4, buildingAge: 1, buildingCondition: 'جديدة' },
    },
    {
      city: 'الرياض', district: 'الياسمين', type: 'floor', purposes: ['rent'], area: 300, price: 65000,
      ownerId: c.abdullah.id, status: 'agreed',
      typeFields: { rooms: 5, floor: 'أول', buildingAge: 3, buildingCondition: 'جيدة' },
      notes: 'إيجار سنوي',
    },
  ];

  const canMakeImages = typeof document !== 'undefined' && typeof document.createElement === 'function';
  const created = [];
  for (const p of props) {
    const { _image, ...data } = p;
    const rec = await repo.properties.create({ ...data, source: 'manual', captureStatus: 'approved' });
    created.push(rec);
    ids.properties.push(rec.id);
    if (_image && canMakeImages) {
      try {
        const blob = await makeSampleImage(_image[0], _image[1]);
        if (blob) {
          const img = await storeImage(blob, { entity: 'property', entityId: rec.id });
          ids.images.push(img.id);
          await repo.properties.update(rec.id, { images: [img.id] });
        }
      } catch (_) { /* لا صور تجريبية إن تعذر توليدها */ }
    }
  }

  /* سجل واحد لكل كيان من كيانات المراحل اللاحقة — لاختبار المخططات فقط، بلا واجهة الآن */
  const tour = await repo.tours.create({ date: daysAgo(12), city: 'الرياض', districts: ['الياسمين', 'الملقا'], notes: 'جولة صباحية شمال الرياض' });
  ids.tours.push(tour.id);
  await repo.properties.update(created[0].id, { source: 'tour', tourId: tour.id }); // أرض الياسمين
  await repo.properties.update(created[1].id, { source: 'tour', tourId: tour.id }); // فلة الملقا

  /* جولة تجريبية بالتقاطات في الحالات الثلاث (المرحلة ٢) — لعرض شاشتَي الجولات والاعتماد فقط */
  const captureTour = await repo.tours.create({ date: daysAgo(1), city: 'الرياض', districts: ['العارض'], notes: 'جولة تجريبية لعرض شاشات الالتقاط والاعتماد' });
  ids.tours.push(captureTour.id);

  const capCaptured = await repo.properties.create({
    source: 'tour', tourId: captureTour.id, captureStatus: 'captured',
    captureContact: { name: '', phone: '0561112222', note: 'لوحة على أرض بلا اسم واضح' },
  });
  ids.properties.push(capCaptured.id);
  if (canMakeImages) {
    try {
      const blob = await makeSampleImage('صورة اللوحة', '#7a5c3e');
      if (blob) {
        const img = await storeImage(blob, { entity: 'property', entityId: capCaptured.id });
        ids.images.push(img.id);
        await repo.properties.update(capCaptured.id, { images: [img.id], signboardImageId: img.id });
      }
    } catch (_) { /* لا صور تجريبية إن تعذر توليدها */ }
  }

  const capExtracted = await repo.properties.create({
    source: 'tour', tourId: captureTour.id, captureStatus: 'extracted', district: 'العارض', type: 'land',
    typeFields: { plotDimensions: '25 × 25', streetWidth: 15 },
    captureContact: { name: 'سعيد الغامدي', phone: '0533221100', note: '' },
  });
  ids.properties.push(capExtracted.id);
  if (canMakeImages) {
    try {
      const blob = await makeSampleImage('أرض العارض', '#4c6b8a');
      if (blob) {
        const img = await storeImage(blob, { entity: 'property', entityId: capExtracted.id });
        ids.images.push(img.id);
        await repo.properties.update(capExtracted.id, { images: [img.id], signboardImageId: img.id });
      }
    } catch (_) { /* لا صور تجريبية إن تعذر توليدها */ }
  }

  const capApproved = await repo.properties.create({
    source: 'tour', tourId: captureTour.id, captureStatus: 'approved', district: 'العارض', type: 'land',
    purposes: ['sale'], area: 625, ownerId: c.mohammed.id, status: 'not_contacted',
    typeFields: { plotDimensions: '25 × 25', streetWidth: 15, streetsCount: 1 },
    notes: 'اعتُمد أثناء نفس الجولة التجريبية',
  });
  ids.properties.push(capApproved.id);

  /* الطلبات العقارية (المرحلة ٣): أنواع وأغراض مختلفة، ومنها ما يستعمل نطاق أحياء ومنها ما له مرونة خاصة */
  const seedRequests = [
    {
      clientId: c.sarah.id, type: 'apartment', purpose: 'sale', city: 'الرياض', districts: ['الياسمين', 'النرجس'],
      budgetMax: 800000, area: 160, notes: 'تفضّل الدور الأول أو الثاني', status: 'active',
    },
    {
      clientId: c.noura.id, type: 'villa', purpose: 'sale', city: 'الرياض', districtZones: ['north'],
      budgetMax: 3000000, area: 400, notes: 'تريد فلة في شمال الرياض عمومًا (نطاق)', status: 'active',
    },
    {
      clientId: c.khalid.id, type: 'land', purpose: 'investment', city: 'الرياض', districts: ['العارض', 'النرجس'],
      budgetMax: 2500000, area: 450, notes: 'أرض استثمارية', status: 'active',
    },
    {
      clientId: c.reem.id, type: 'apartment', purpose: 'sale', city: 'الرياض', districts: ['الياسمين', 'النرجس', 'الملقا'],
      budgetMax: 850000, area: 150, status: 'active',
    },
    {
      clientId: c.bandar.id, type: 'floor', purpose: 'rent', city: 'الرياض', districtZones: ['north'],
      budgetMax: 70000, area: 250, notes: 'دور للإيجار السنوي', status: 'active',
    },
    {
      clientId: c.mona.id, type: 'villa', purpose: 'sale', city: 'الرياض', districts: ['حطين', 'الملقا', 'القيروان'],
      budgetMax: 3500000, area: 400, notes: 'ميزانية أوسع — يظهر فيها العقار مجهول السعر موسومًا', status: 'active',
    },
    {
      clientId: c.turki.id, type: 'land', purpose: 'sale', city: 'الرياض', districts: ['الرمال'],
      budgetMax: 1000000, area: 700, priceFlexAmount: 150000, notes: 'يتحمل زيادة 150 ألفًا (مرونة خاصة بالطلب)', status: 'active',
    },
    {
      clientId: c.fahad.id, type: 'apartment', purpose: 'rent', city: 'الرياض',
      budgetMax: 60000, notes: 'أي حي وبلا مساحة محددة — المعيارَان محايدان', status: 'paused',
    },
  ];
  const createdRequests = [];
  for (const r of seedRequests) {
    const rec = await repo.requests.create(r);
    createdRequests.push(rec);
    ids.requests.push(rec.id);
  }

  /* مطابقة محفوظة واحدة (متصرَّف فيها) — وبقية المطابقات تُحسب لحظيًا في صفحتها */
  const match = await repo.matches.create({ requestId: createdRequests[0].id, propertyId: created[5].id, score: 86, status: 'presented' }); // شقة الياسمين
  ids.matches.push(match.id);

  /* العروض الخارجية (المرحلة ٤): منها ما يطابق طلبات المخزون، وواحد "بانتظار الإكمال"،
     وواحد لم يعد متاحًا (لا يدخل المطابقة)، وواحد جوال معلنه جوال مالك عقار عندك (تنبيه التكرار). */
  const seedExternals = [
    {
      rawText: 'شقة للبيع حي النرجس 4 غرف وصالة الدور الأول 820 ألف\nالمساحة 175 م2\n0512345678',
      platform: 'عقار', sourceUrl: 'https://sa.aqar.fm/1000001', postedAt: daysAgo(6),
      city: 'الرياض', district: 'النرجس', type: 'apartment', purposes: ['sale'], area: 175, price: 820000, status: 'active',
    },
    {
      rawText: 'فلة للبيع في حطين درج داخلي وشقة، المساحة 420 متر مربع، المطلوب 3.3 مليون',
      platform: 'وصلت', sourceUrl: 'https://www.wasalt.com/ar/property/1000002', postedAt: daysAgo(12),
      city: 'الرياض', district: 'حطين', type: 'villa', purposes: ['sale'], area: 420, price: 3300000, status: 'active',
      notes: 'المعلن وسيط آخر',
    },
    {
      rawText: 'أرض للبيع بحي الرمال مساحة 700م2 السعر 950 الف\nللتواصل 0501234567',
      platform: 'حراج', sourceUrl: 'https://haraj.com.sa/1000003', postedAt: daysAgo(3),
      city: 'الرياض', district: 'الرمال', type: 'land', purposes: ['sale'], area: 700, price: 950000,
      advertiserPhone: c.mohammed.phone, status: 'active',
      notes: 'جوال المعلن نفس جوال مالك عقار في المخزون — يظهر تنبيه "قد يكون عقارك"',
    },
    {
      rawText: 'عمارة للبيع بالملقا 12 شقة دخل سنوي 480 ألف، السعر 9.5 مليون',
      platform: 'وصلت', sourceUrl: 'https://www.wasalt.com/ar/property/1000004', postedAt: daysAgo(2),
      city: 'الرياض', district: 'الملقا', purposes: [], price: 9500000, status: 'active',
      notes: 'مثال "بانتظار الإكمال": النوع (عمارة) غير موجود في أنواع العقار والغرض غير محدد',
    },
    {
      rawText: 'دور علوي للإيجار السنوي حي الياسمين 250 متر 70 ألف',
      platform: 'عقار', postedAt: daysAgo(40),
      city: 'الرياض', district: 'الياسمين', type: 'floor', purposes: ['rent'], area: 250, price: 70000,
      status: 'unavailable', notes: 'أُجّر — لا يدخل المطابقة',
    },
  ];
  for (const x of seedExternals) {
    const rec = await repo.externalListings.create(x);
    ids.externalListings.push(rec.id);
  }

  const deal = await repo.deals.create({
    date: daysAgo(30), finalPrice: 4400000, commission: 110000, propertyId: created[6].id, clientId: c.fahad.id, notes: 'عمولة 2.5٪', // فلة حطين
  });
  ids.deals.push(deal.id);

  /* مهامّ وقوائمُها (المرحلة ٤٢): كانت البذرة تملأ العملاء والعقارات وتترك «المهامّ»
     و«التقويم» فارغَين تمامًا — وهما من أقوى صفحات النظام. فمن جرّبه رآهما صفحتين بيضاوين
     وظنّهما غير مبنيَّتين. والمواعيدُ نسبيّةٌ من اليوم لا ثابتة، فلا تولد متأخّرةً أبدًا. */
  const day = (n, h = 9) => { const d = new Date(); d.setDate(d.getDate() + n); d.setHours(h, 0, 0, 0); return d.toISOString(); };
  const seedLists = [
    ['اتصالات', [
      ['اتصل على محمد العتيبي — رأيه في عرض الملقا', day(0, 17), 'urgent'],
      ['رُدّ على استفسار ريم الحربي', day(1, 11), 'high'],
    ]],
    ['معاينات', [
      ['معاينة فلة الملقا مع نورة القحطاني', day(2, 18), 'high'],
      ['جولة تصوير لعقارات النرجس', day(5, 16), 'normal'],
    ]],
    ['عقود وتراخيص', [
      ['جدّد ترخيص إعلان فلة حطين', day(6), 'urgent'],
      ['وقّع اتفاقية وساطة مع بندر السبيعي', day(9), 'normal'],
    ]],
    ['مالية', [['حصّل عمولة صفقة أغسطس', day(3), 'high']]],
  ];
  for (const [title, rows] of seedLists) {
    const list = await repo.taskLists.create({ title, order: ids.taskLists.length });
    ids.taskLists.push(list.id);
    for (const [taskTitle, dueAt, priority] of rows) {
      const task = await repo.tasks.create({ listId: list.id, title: taskTitle, dueAt, priority, order: ids.tasks.length });
      ids.tasks.push(task.id);
    }
  }

  await setSeedInfo({ ids, insertedAt: new Date().toISOString() });
  return ids;
}

export async function clearSeed() {
  const info = await getSeedInfo();
  const empty = { clients: 0, properties: 0, images: 0, tours: 0, requests: 0, matches: 0, externalListings: 0, deals: 0, tasks: 0, taskLists: 0, keptClients: 0, keptProperties: 0 };
  if (!info || !info.ids) return empty;
  const ids = { ...empty, ...info.ids };
  const removed = { ...empty };

  // الترتيب يراعي قواعد الحذف: الصفقات والمطابقات قبل العقارات والطلبات، والطلبات قبل العملاء.
  // المهامّ قبل قوائمها، كبقيّة الترتيب أدناه.
  for (const store of ['tasks', 'taskLists', 'deals', 'matches', 'requests', 'externalListings', 'tours']) {
    for (const id of ids[store] || []) {
      if (await repo[store].get(id)) { await repo[store].remove(id); removed[store]++; }
    }
  }
  for (const id of ids.properties || []) {
    const p = await repo.properties.get(id);
    if (!p) continue;
    // عقار تجريبي أبرمت عليه صفقة حقيقية: لا يُحذف (قاعدة الحذف من المرحلة ١) ولا يُوقف بقية المسح
    if ((await repo.deals.where('propertyId', id)).length) { removed.keptProperties++; continue; }
    await deleteImages(p.images || []); // يحرّر روابط العرض المؤقتة قبل حذف العقار
    removed.images += (p.images || []).length;
    await repo.properties.remove(id);
    removed.properties++;
  }
  for (const id of ids.clients || []) {
    if (!(await repo.clients.get(id))) continue;
    // عميل تجريبي ارتبط ببيانات حقيقية (عقار أو طلب أو صفقة أضفتها): يبقى عميلًا عاديًا،
    // لا يُحذف ولا تُفك عقاراته — الحذف لا يحدث إلا بقرارك من صفحة العملاء.
    const impact = await repo.clients.deleteImpact(id);
    if (impact.linked) { removed.keptClients++; continue; }
    await repo.clients.remove(id);
    removed.clients++;
  }
  await setSeedInfo(null);
  return removed;
}
