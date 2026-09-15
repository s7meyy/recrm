import { chromium } from './pw.mjs';
const BASE = process.env.TEST_URL || 'http://127.0.0.1:8234';
const b = await chromium.launch();
const ctx = await b.newContext({ locale: 'ar-SA' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
page.on('console', m => { const t = m.text(); if (m.type() === 'error' && !t.includes('ERR_') && !t.includes('Failed to load resource') && !t.includes('favicon')) errors.push(t); });
const ok = (n, c, x = '') => console.log(`${c ? 'PASS' : 'FAIL'} — ${n}${x ? ' :: ' + x : ''}`);

console.log('--- البند ٢: البوابة في متصفح حقيقي ---');
await page.goto(BASE + '/');
ok('الزائر يرى شاشة الدخول لا التطبيق', await page.locator('input[type="password"]').count() === 1 && await page.locator('.app-shell').count() === 0);
const leaked = await page.content();
ok('كلمة السر لا تظهر في مصدر الصفحة', !leaked.includes('secret-pass'));

// الوصول المباشر لملف داخلي دون كوكي
const direct = await page.request.get(BASE + '/js/data/repository.js');
const directBody = await direct.text();
ok('ملفات التطبيق نفسها محجوبة قبل الدخول', !directBody.includes('export const repo') && directBody.includes('أدخل كلمة السر'));

await page.fill('input[type="password"]', 'wrong-one');
await page.click('button[type="submit"]');
await page.waitForTimeout(400);
ok('كلمة سر خاطئة تُبقيك خارجًا', await page.locator('.err').count() === 1);

await page.fill('input[type="password"]', 'secret-pass');
await page.click('button[type="submit"]');
await page.waitForTimeout(2500);
ok('كلمة السر الصحيحة تفتح التطبيق', await page.locator('.app-shell').count() === 1);

console.log('\n--- البند ٤: الاختيار والنشر ---');
// بيانات: عقاران معتمدان بصور + شركة
await page.evaluate(async () => {
  const { repo } = await import('/js/data/repository.js');
  const { setCompany, setPublishSettings } = await import('/js/data/settings.js');
  await setCompany({ name: 'مكتب سائح العقاري', phone: '0551234567', address: 'الرياض' });
  await setPublishSettings({ token: 'test-publish-token', contactPhone: '0551234567', intro: 'عروض مختارة من مكتبنا.' });
  const png = 'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAJElEQVR42u3NMQEAAAgDoC251a3gLzSgOXeqAAAAAAAAAAAAvAxJlwGBMRUXtAAAAABJRU5ErkJggg==';
  const bytes = Uint8Array.from(atob(png), c => c.charCodeAt(0));
  const { storeImage } = await import('/js/data/images.js');
  const owner = await repo.clients.create({ name: 'مالك سرّي', phone: '0509999999' });
  const p1 = await repo.properties.create({ city: 'الرياض', district: 'الياسمين', type: 'villa', purposes: ['sale'],
    area: 400, price: 2500000, notes: 'فلة درج صالة', ownerId: owner.id, location: { lat: 24.8, lng: 46.6 } });
  const img = await storeImage(new File([bytes], 'a.png', { type: 'image/png' }), { entity: 'property', entityId: p1.id });
  await repo.properties.update(p1.id, { images: [img.id] });
  await repo.properties.create({ city: 'الرياض', district: 'النرجس', type: 'land', purposes: ['sale'], area: 600, price: 1800000, notes: 'أرض زاوية' });
});
await page.evaluate(() => { location.hash = '#/publish'; });
await page.waitForTimeout(1200);
ok('صفحة النشر تعلن صراحة أنها لقطة لا بثّ حيّ', (await page.locator('.notice').innerText()).includes('لقطة لا بثّ حيّ'));

const boxes = page.locator('.table tbody input[type="checkbox"]');
const rowCount = await boxes.count();
await boxes.nth(0).check();
await page.waitForTimeout(400);
await boxes.nth(1).check();
await page.waitForTimeout(600);
ok('اختيار العقارات يُحفظ', (await page.locator('.count').first().innerText()).includes('2'), `${rowCount} صف`);

await page.locator('button:has-text("نشر الآن")').click();
await page.waitForTimeout(3500);
const status = await page.locator('.settings-grid .panel:has-text("الحالة") .kv').innerText();
ok('النشر تمّ وسُجّل وقته وعدده', status.includes('2') && !status.includes('لم يُنشر'), status.replace(/\n/g, ' | '));

console.log('\n--- الصفحة العامة (بلا تسجيل دخول) ---');
const publicCtx = await b.newContext({ locale: 'ar-SA' }); // متصفح آخر بلا أي كوكي
const pub = await publicCtx.newPage();
const pubErrors = [];
pub.on('pageerror', e => pubErrors.push(e.message));
await pub.goto(BASE + '/offers/');
await pub.waitForTimeout(1500);
const cards = pub.locator('.card');
ok('الصفحة العامة تُفتح بلا تسجيل دخول وتعرض العروض', await cards.count() === 2, `${await cards.count()} بطاقة`);
const text = await pub.locator('body').innerText();
ok('اسم المكتب وجواله يظهران للعميل', text.includes('مكتب سائح العقاري'));
ok('النص التعريفي يظهر', text.includes('عروض مختارة من مكتبنا'));
ok('السعر والمساحة والحي تظهر', text.includes('2,500,000') && text.includes('400') && text.includes('الياسمين'));
ok('بيانات المالك لا تخرج أبدًا', !text.includes('مالك سرّي') && !text.includes('0509999999'), 'فحص الاسم والجوال');
const imgOk = await pub.locator('.card-media img').first().evaluate((el) => el.complete && el.naturalWidth > 0);
ok('صورة العقار تُحمَّل من الخادم فعليًا', imgOk);
ok('زر واتساب مبني بالرقم الدولي', (await pub.locator('a:has-text("واتساب")').first().getAttribute('href')).includes('wa.me/966551234567'));

// سحب عرض: إلغاء اختياره ثم إعادة النشر
await page.locator('.table tbody input[type="checkbox"]').nth(1).uncheck();
await page.waitForTimeout(400);
await page.locator('button:has-text("نشر الآن")').click();
await page.waitForTimeout(3000);
await pub.reload();
await pub.waitForTimeout(1500);
ok('إلغاء اختيار عرض يسحبه من الصفحة العامة بعد إعادة النشر', await pub.locator('.card').count() === 1, `${await pub.locator('.card').count()} بطاقة`);

// النشر بمفتاح خاطئ يُرفض
const bad = await page.request.post(BASE + '/api/publish', { headers: { 'x-publish-token': 'not-the-token', 'content-type': 'application/json' }, data: { kind: 'clear' } });
ok('النشر بمفتاح خاطئ مرفوض (401)', bad.status() === 401, String(bad.status()));
const still = await (await page.request.get(BASE + '/api/listings')).json();
ok('ومحاولة المسح الفاشلة لم تغيّر شيئًا', (still.listings || []).length === 1);

console.log('\nERRORS(app):', errors.length ? JSON.stringify(errors.slice(0, 3)) : 'none');
console.log('ERRORS(public):', pubErrors.length ? JSON.stringify(pubErrors.slice(0, 3)) : 'none');
await b.close();
