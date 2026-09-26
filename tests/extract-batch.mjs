// المرحلة ٦١ — التفريغ: الحالُ بلفظها، والاعتمادُ من الرأس، وملفّاتٌ عدّة دفعةً واحدة، والصورة تُحفظ للمحاولة.
import { chromium } from './pw.mjs';
const BASE = process.env.TEST_URL || 'http://127.0.0.1:8235';
const b = await chromium.launch();
const page = await (await b.newContext({ locale: 'ar-SA', viewport: { width: 1280, height: 900 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const ok = (n, c, x = '') => console.log(`${c ? 'PASS' : 'FAIL'} — ${n}${x ? ' :: ' + x : ''}`);

await page.goto(BASE + '/');
await page.waitForTimeout(2200);
await page.evaluate(() => { location.hash = '#/extract'; });
await page.waitForTimeout(1400);

console.log('--- الوصف يقول أن لا شيء «قيد المعالجة» ---');
const intake = page.locator('#page .extract-intake');
ok('الوصف يقول إن التفريغ فوريّ وما يُنتظر هو اعتمادك', /فوري/.test(await intake.innerText()) && /اعتماد/.test(await intake.innerText()));
ok('والزرّ يقول «عدّة ملفات دفعةً واحدة»', /عدّة ملفات/.test(await intake.locator('label.btn').innerText()));

console.log('--- نصّ ملصوق: «تنتظر اعتمادك» ثم «اعتمد» من الرأس ---');
await intake.locator('textarea').fill('رقم الصك ٣١٠١٠٢٠٤٥٦٧٨٩ اسم المالك سعد التميمي المدينة الرياض الحي النرجس المساحة ٤٥٠ م٢');
await page.locator('button:has-text("اقرأ النصّ")').click();
await page.waitForTimeout(1000);
const card = page.locator('.extract-card').first();
ok('الشارة «تنتظر اعتمادك» لا «بانتظار المراجعة»', (await card.locator('.extract-head').innerText()).includes('تنتظر اعتمادك') && !(await card.innerText()).includes('بانتظار المراجعة'));
ok('وزرّ «اعتمد» بارزٌ في الرأس', await card.locator('.extract-head button:has-text("اعتمد")').count() === 1);
await card.locator('.extract-head button:has-text("اعتمد")').click();
await page.waitForTimeout(800);
ok('والضغط يعتمدها', (await page.locator('.extract-card').first().locator('.extract-head').innerText()).includes('معتمَدة'));

console.log('--- ملفّان دفعةً واحدة ---');
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEklEQVR42mNk+M9Qz8DAwMAAAA0EAf3pWfWfAAAAAElFTkSuQmCC';
const buf = Buffer.from(png, 'base64');
const before = await page.locator('.extract-card').count();
await intake.locator('input[type="file"]').setInputFiles([
  { name: 'صك-١.png', mimeType: 'image/png', buffer: buf },
  { name: 'صك-٢.png', mimeType: 'image/png', buffer: buf },
]);
await page.waitForTimeout(2500);
const after = await page.locator('.extract-card').count();
ok('كل ملفٍّ صار سجلًّا', after - before === 2, `${before} → ${after}`);
const failed = page.locator('.extract-card.extract-failed');
ok('وبلا مزوّدٍ مهيَّأ: البطاقتان «لم يُفرَّغ» بلونهما لا «تنتظر اعتمادك»', await failed.count() === 2
  && (await failed.first().locator('.extract-head').innerText()).includes('لم يُفرَّغ')
  && !(await failed.first().innerText()).includes('تنتظر اعتمادك'));
const why = (await failed.first().locator('.warn-text').innerText()).trim();
ok('وتقول سبب الفشل بسطرٍ صريح', why.length > 10, why);
ok('وفيها «الصق نصّه» و«أعد المحاولة (بعد التهيئة)» معطّلًا', await failed.first().locator('button:has-text("الصق نصّه")').count() === 1
  && await failed.first().locator('button:has-text("أعد المحاولة")').isDisabled());
const kept = await page.evaluate(async () => {
  const { repo } = await import('/js/data/repository.js');
  const rows = (await repo.extractions.list()).filter((r) => r.error && r.imageId);
  const imgs = await Promise.all(rows.map((r) => repo.images.get(r.imageId)));
  return { rows: rows.length, blobs: imgs.filter((i) => i?.blob).length };
});
ok('والصورتان محفوظتان للمحاولة بعد التهيئة', kept.rows === 2 && kept.blobs === 2, JSON.stringify(kept));
await failed.first().locator('button:has-text("الصق نصّه")').click();
await page.waitForTimeout(300);
ok('و«الصق نصّه» يضع المؤشّر في مربّع النصّ', await page.evaluate(() => document.activeElement?.tagName === 'TEXTAREA' && !!document.activeElement.closest('.extract-intake')));

console.log('--- الفلاتر بأسمائها ---');
const chips = await page.locator('#page .chip:not(.chip-all)').allInnerTexts();
ok('«تنتظر اعتمادك» فلترٌ لا يعدّ الفاشل', chips.some((c) => c.includes('تنتظر اعتمادك') && /0\s*$/.test(c)), chips.join(' | '));

ok('بلا أخطاء صفحة', !errors.length, errors.slice(0, 3).join(' | '));
await b.close();
