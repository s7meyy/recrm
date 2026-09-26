// المرحلة ٥٨ — الصفحة العامة بعين العميل: البنود ٩–١٦ من المراجعة.
// اللقطة تُنشر بمفتاح النشر مباشرةً (كما في booking.mjs)، والصفحات تُفتح بلا كوكي كما يفتحها العميل.
import { chromium } from './pw.mjs';
const BASE = process.env.TEST_URL || 'http://127.0.0.1:8234';
const PUBLISH_TOKEN = 'test-publish-token';
const b = await chromium.launch();
const ok = (n, c, x = '') => console.log(`${c ? 'PASS' : 'FAIL'} — ${n}${x ? ' :: ' + x : ''}`);

await fetch(BASE + '/api/publish', {
  method: 'POST', headers: { 'content-type': 'application/json', 'x-publish-token': PUBLISH_TOKEN },
  body: JSON.stringify({
    kind: 'snapshot', intro: 'عروض مختارة من مكتبنا.',
    office: { name: 'مكتب التجربة العقاري', phone: '0551234567' },
    booking: { enabled: false },
    listings: [
      { ref: '1', title: 'فلة — الملقا', typeLabel: 'فلة', type: 'villa', purposes: ['sale'], purposeLabels: ['بيع'], city: 'الرياض', district: 'الملقا', area: 400, price: 2800000, images: ['img-a'], contactPhone: '0551234567' },
      { ref: '2', title: 'شقة — الياسمين', typeLabel: 'شقة', type: 'apartment', purposes: ['sale'], purposeLabels: ['بيع'], city: 'الرياض', district: 'الياسمين', area: 180, price: 750000, images: [], contactPhone: '0551234567' },
      { ref: '3', title: 'أرض — العارض', typeLabel: 'أرض', type: 'land', purposes: ['sale'], purposeLabels: ['بيع'], city: 'الرياض', district: 'العارض', area: 625, price: null, images: [], contactPhone: '0551234567' },
      { ref: '4', title: 'دور — الياسمين', typeLabel: 'دور', type: 'floor', purposes: ['rent'], purposeLabels: ['إيجار'], city: 'الرياض', district: 'الياسمين', area: 300, price: 65000, images: [], contactPhone: '0551234567' },
    ],
  }),
});

const ctx = await b.newContext({ locale: 'ar-SA', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, permissions: ['clipboard-read', 'clipboard-write'] });
const pub = await ctx.newPage();
const errors = [];
pub.on('pageerror', (e) => errors.push(e.message));

console.log('--- ٩ و١٠: البطاقة بلا صور، ولا تكرار للمكان ---');
await pub.goto(BASE + '/offers/');
await pub.waitForTimeout(1800);
ok('العدّاد مجموعٌ: «٤ عروض»', (await pub.locator('#status').innerText()).includes('4 عروض'), await pub.locator('#status').innerText());
const noPhoto = pub.locator('.card').filter({ hasText: 'العارض' }).first();
const mediaH = await noPhoto.locator('.card-media').evaluate((n) => n.getBoundingClientRect().height);
ok('العرض بلا صور شريطٌ قصير لا مربّعٌ فارغ (< ١٠٠ بكسل)', mediaH > 0 && mediaH < 100, `${Math.round(mediaH)}px`);
ok('ويقول «بلا صور بعد» لا اسمَ النوع وحده', (await noPhoto.locator('.noimg').innerText()).includes('بلا صور بعد'));
ok('سطر المكان المكرّر تحت العنوان أُزيل', await pub.locator('.card .card-place').count() === 0);
ok('والعنوان يحمل المكان', (await noPhoto.locator('.card-title').innerText()).includes('العارض'));
ok('وزرّ «اطلب معاينة» برقم العرض حين يكون الحجز مغلقًا', (await noPhoto.locator('a:has-text("اطلب معاينة")').getAttribute('href')).includes('intake.html?lang=ar&ref=3'));

console.log('--- ١٦: فلاتر السعر والمساحة ---');
const priceSel = pub.locator('#filters select[aria-label="السعر: الكل"]');
ok('فلتر السعر موجود بدرجاتٍ تفصل العروض', await priceSel.count() === 1 && (await priceSel.locator('option').allTextContents()).some((o) => o.includes('حتى 1 مليون')), (await priceSel.locator('option').allTextContents()).join(' | '));
await priceSel.selectOption('1000000');
await pub.waitForTimeout(400);
ok('«حتى مليون» يبقي الشقّة والدور والأرض بلا سعر (لا يُقصى ما سعره عند الطلب)', await pub.locator('.card').count() === 3 && await pub.locator('.card:has-text("الملقا")').count() === 0, String(await pub.locator('.card').count()));
await priceSel.selectOption('');
const areaSel = pub.locator('#filters select[aria-label="المساحة: الكل"]');
ok('فلتر المساحة موجود', await areaSel.count() === 1, (await areaSel.locator('option').allTextContents()).join(' | '));
await areaSel.selectOption('300');
await pub.waitForTimeout(400);
ok('«٣٠٠ م² فأكثر» يُبقي ثلاثة', await pub.locator('.card').count() === 3 && await pub.locator('.card:has-text("الياسمين، الرياض")').count() === 1, String(await pub.locator('.card').count()));
await areaSel.selectOption('');
await pub.waitForTimeout(300);

console.log('--- ١٦: المفضّلة ---');
const heart = pub.locator('.card').first().locator('.fav-btn');
const heartSize = await heart.evaluate((n) => n.getBoundingClientRect().width);
ok('قلبٌ ٤٤ بكسلًا على كل بطاقة', heartSize >= 44 && await pub.locator('.fav-btn').count() === 4, `${heartSize}px`);
await heart.click();
await pub.waitForTimeout(200);
ok('الضغط يحفظ ويقول ذلك', (await heart.getAttribute('aria-pressed')) === 'true' && (await pub.locator('.fav-chip').innerText()).includes('(1)'));
await pub.reload();
await pub.waitForTimeout(1800);
ok('ويبقى بعد تحديث الصفحة', (await pub.locator('.card').first().locator('.fav-btn').getAttribute('aria-pressed')) === 'true');
await pub.locator('.fav-chip').click();
await pub.waitForTimeout(400);
ok('و«المفضّلة» تُريك ما حفظت وحده', await pub.locator('.card').count() === 1, String(await pub.locator('.card').count()));
await pub.locator('.fav-chip').click();

console.log('--- ١١ و١٤ و١٥: صفحة العرض الواحد ---');
await pub.goto(BASE + '/offers/l/3');
await pub.waitForTimeout(1200);
const slimH = await pub.locator('.offer-gallery .noimg-slim').evaluate((n) => n.getBoundingClientRect().height);
ok('بلا صور: شريطٌ قصير يقترح المعاينة', slimH > 0 && slimH < 130 && (await pub.locator('.noimg-slim').innerText()).includes('اطلب معاينة'), `${Math.round(slimH)}px`);
ok('هويّة المكتب في الترويسة: الاسم والجوال', (await pub.locator('.office-line').innerText()).includes('مكتب التجربة') && await pub.locator('.office-line a[href="tel:0551234567"]').count() === 1);
ok('ولا سطرَ مكانٍ مكرّر تحت العنوان', await pub.locator('.hero .office-contact').count() === 0);
ok('زرّ «اطلب معاينة» يحمل رقم العرض', (await pub.locator('a:has-text("اطلب معاينة")').getAttribute('href')).includes('intake.html?lang=ar&ref=3'));
const share = pub.locator('#share-btn');
ok('زرّ المشاركة موجود', await share.count() === 1);
await share.click();
await pub.waitForTimeout(300);
const copied = await pub.evaluate(() => navigator.clipboard.readText().catch(() => ''));
ok('والضغط ينسخ رابط الصفحة ويقول ذلك', copied.includes('/offers/l/3') && (await share.innerText()) === 'نُسخ الرابط', copied);
await pub.goto(BASE + '/offers/l/3?lang=en');
await pub.waitForTimeout(1000);
ok('الإنجليزية: الاسم العربي معزولٌ اتجاهيًّا في العنوان', await pub.locator('h1 bdi').count() === 1 && (await pub.locator('h1').innerText()).startsWith('Land'), await pub.locator('h1').innerText());
await pub.goto(BASE + '/offers/?lang=en');
await pub.waitForTimeout(1500);
ok('وفي البطاقات كذلك، والعدّاد «4 listings»', await pub.locator('.card-title bdi').count() === 4 && (await pub.locator('#status').innerText()).includes('4 listings'));
ok('وخيار السعر بالإنجليزية', (await pub.locator('#filters select[aria-label="Price: any"] option').allTextContents()).some((o) => /Up to 1M/.test(o)));

console.log('--- ١٣: الحجز مغلق ---');
await pub.goto(BASE + '/offers/book.html?p=3');
await pub.waitForTimeout(1200);
ok('يقول إنه مغلق ويعطي أزرارًا', (await pub.locator('#status').innerText()).includes('مغلق') && await pub.locator('.closed-actions .btn').count() === 3);
const waHref = await pub.locator('.closed-actions a[href*="wa.me"]').getAttribute('href');
ok('واتساب المكتب برقم العرض', waHref.includes('966551234567') && decodeURIComponent(waHref).includes('رقم 3'), waHref);
ok('واتصالٌ واستمارةٌ برقم العرض', await pub.locator('.closed-actions a[href="tel:0551234567"]').count() === 1 && (await pub.locator('.closed-actions a:has-text("اطلب معاينة")').getAttribute('href')).includes('ref=3'));

console.log('--- ١٢: الاستمارة برقم العرض ---');
await pub.goto(BASE + '/offers/intake.html?ref=3');
await pub.waitForTimeout(1200);
ok('الاستمارة تقول بخصوص أيّ عرض', (await pub.locator('.intake-ref').innerText()).includes('رقم 3'));
await pub.fill('input[name="name"]', 'سائل عن الأرض');
await pub.fill('input[name="phone"]', '0500003333');
await pub.click('#intake-send');
await pub.waitForTimeout(1800);
ok('وتُرسل وتظهر بطاقة النجاح', await pub.locator('.lead-done').count() === 1);

// صاحب المكتب يرى الطلب موصولًا بعرضه
const page = await (await b.newContext({ locale: 'ar-SA' })).newPage();
await page.goto(BASE + '/');
await page.fill('input[type="password"]', 'secret-pass');
await page.click('button[type="submit"]');
await page.waitForTimeout(2200);
const leads = await page.evaluate(async () => (await (await fetch('/api/lead', { credentials: 'same-origin' })).json()));
const mine = (leads.leads || []).find((l) => l.name === 'سائل عن الأرض');
ok('ويصل صاحبَ المكتب برقم العرض ٣', mine && String(mine.ref) === '3', JSON.stringify(mine || leads).slice(0, 120));

console.log('--- ٩: تنبيه النشر قبل الصمت ---');
await page.evaluate(async () => {
  const { repo } = await import('/js/data/repository.js');
  const { setCompany, setPublishSettings } = await import('/js/data/settings.js');
  await setCompany({ name: 'مكتب التجربة العقاري', phone: '0551234567' });
  await setPublishSettings({ token: 'test-publish-token', contactPhone: '0551234567' });
  await repo.properties.create({ city: 'الرياض', district: 'النرجس', type: 'land', purposes: ['sale'], area: 600, notes: 'بلا صور وبلا سعر' });
});
await page.evaluate(() => { location.hash = '#/publish'; });
await page.waitForTimeout(1200);
await page.locator('.table tbody input[type="checkbox"]').first().check();
await page.waitForTimeout(400);
await page.locator('button:has-text("نشر الآن")').click();
try { const btn = page.locator('.modal button:has-text("انشر الكلّ وأنا أعلم")'); await btn.waitFor({ timeout: 2500 }); await btn.click(); } catch (_) { /* لا مانع */ }
const gate = page.locator('.modal:has-text("قبل النشر")');
await gate.waitFor({ timeout: 3000 }).catch(() => {});
const gateText = await gate.innerText().catch(() => '');
ok('قبل النشر يُقال بالعدد: بلا صور وبلا سعر', gateText.includes('بلا صور') && gateText.includes('بلا سعر'), gateText.replace(/\n/g, ' | ').slice(0, 120));
await gate.locator('button:has-text("إلغاء")').click();
await page.waitForTimeout(500);
ok('و«إلغاء» لا ينشر', await page.locator('.modal').count() === 0 && !/بلا صور وبلا سعر/.test(await (await fetch(BASE + '/api/listings')).text()));

ok('بلا أخطاء في الصفحات العامة', !errors.length, errors.slice(0, 3).join(' | '));
await b.close();
