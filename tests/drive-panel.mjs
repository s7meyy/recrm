// المرحلة ٥٦: لوحة نسخ درايف، وحمايتها، والاسترجاع من ملفٍّ نُزِّل من درايف.
import { chromium } from './pw.mjs';
const BASE = process.env.TEST_URL || 'http://127.0.0.1:8234';
const b = await chromium.launch();
const ctx = await b.newContext({ locale: 'ar-SA' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
const ok = (n, c, x = '') => console.log(`${c ? 'PASS' : 'FAIL'} — ${n}${x ? ' :: ' + x : ''}`);

await page.goto(BASE + '/');
await page.fill('input[type="password"]', 'secret-pass');
await page.click('button[type="submit"]');
await page.waitForTimeout(2500);

// ——— الخادم: بلا متغيّرات جوجل يقول ذلك بأسمائها ———
const api = await page.evaluate(async () => {
  const g = await fetch('/api/drive', { credentials: 'same-origin' });
  const p = await fetch('/api/drive', { method: 'POST', credentials: 'same-origin' });
  return { gs: g.status, g: await g.json(), ps: p.status, p: await p.json() };
});
ok('الحالة: غير مهيّأ وبأسماء المتغيّرات الثلاثة', api.gs === 200 && api.g.configured === false
  && api.g.missing.join() === 'GDRIVE_CLIENT_ID,GDRIVE_CLIENT_SECRET,GDRIVE_REFRESH_TOKEN', JSON.stringify(api.g));
ok('«انسخ الآن» بلا تهيئة: NOT_CONFIGURED لا نجاحٌ مزيَّف', api.ps === 503 && /NOT_CONFIGURED/.test(api.p.error), JSON.stringify(api.p));

// ——— اللوحة ———
await page.evaluate(() => { location.hash = '#/settings'; });
await page.waitForTimeout(1500);
const drivePanel = page.locator('[id="set-النسخ-اليومي-إلى-Google-Drive"]');
ok('لوحة درايف موجودة في الإعدادات', await drivePanel.count() === 1);
const txt = await drivePanel.innerText();
ok('تقول «غير مهيّأ» وتسمّي ما ينقص', txt.includes('غير مهيّأ') && txt.includes('GDRIVE_REFRESH_TOKEN') && txt.includes('GDRIVE_CLIENT_ID'), txt.slice(0, 160).replace(/\n/g, ' | '));
ok('وتشرح «In production» وصلاحية drive.file', txt.includes('In production') && txt.includes('drive.file'));
ok('ولا زرَّ نسخٍ يوهم أن شيئًا سيحدث', await drivePanel.locator('button:has-text("انسخ إلى درايف")').count() === 0);
ok('ولا تطلب لصق سرٍّ في التطبيق: لا حقل إدخال فيها', await drivePanel.locator('input').count() === 0);

// ——— الاسترجاع من ملف درايف ———
const PASS = 'عبارة درايف الطويلة';
const built = await page.evaluate(async (pass) => {
  const { repo } = await import('/js/data/repository.js');
  const { exportBackup } = await import('/js/data/backup.js');
  const { encryptText, splitUtf8 } = await import('/js/data/vault.js');
  const { setVaultSettings } = await import('/js/data/settings.js');
  await repo.clients.create({ name: 'عميل من درايف', phone: '0500000056' });
  const { blob } = await exportBackup();
  const plain = await blob.text();
  // كتلٌ صغيرة عمدًا: يثبت أن الوصل بالترتيب يعمل كما في الخزنة
  const chunks = splitUtf8(plain, Math.ceil(plain.length / 3) + 1);
  const parts = [];
  for (const c of chunks) parts.push(await encryptText(c, pass));
  const file = JSON.stringify({ app: 'kassab', format: 'kassab-drive-1', at: new Date().toISOString(), batch: 'B', encrypted: true, parts });
  // ثم يضيع العميل من الجهاز
  const gone = (await repo.clients.list()).find((c) => c.name === 'عميل من درايف');
  await repo.clients.remove(gone.id, { force: true });
  await setVaultSettings({ passphrase: '' });
  return { file, parts: parts.length, left: (await repo.clients.list()).filter((c) => c.name === 'عميل من درايف').length };
}, PASS);
ok('ملف درايف مبنيّ بعدّة كتل مشفّرة', built.parts >= 2 && built.left === 0, JSON.stringify({ parts: built.parts, left: built.left }));
ok('والملف لا يحمل اسم العميل مقروءًا', !built.file.includes('عميل من درايف'));

const backupPanel = page.locator('[id="set-النسخ-الاحتياطي"]');
const fileInput = backupPanel.locator('input[type="file"]').first();

// عبارة خاطئة: يُرفض ولا يُمسّ شيء
await fileInput.setInputFiles({ name: 'kassab-backup.json', mimeType: 'application/json', buffer: Buffer.from(built.file) });
await page.waitForTimeout(600);
const promptShown = await page.locator('.modal:has-text("ملف درايف مشفَّر")').count();
ok('بلا عبارةٍ محفوظة يسألك عنها', promptShown === 1);
await page.locator('.modal input').fill('عبارة خاطئة تماما');
await page.locator('.modal button:has-text("فكّ الملف")').click();
await page.waitForTimeout(2500);
const toastTxt = await page.locator('#toast-root').innerText();
ok('العبارة الخاطئة تُرفض برسالة واضحة', toastTxt.includes('غير صحيحة'), toastTxt.replace(/\n/g, ' | '));
ok('ولا نافذة استبدال بعدها', await page.locator('.modal:has-text("استيراد نسخة احتياطية")').count() === 0);

// العبارة الصحيحة: المقارنة ثم الاسترجاع
await fileInput.setInputFiles({ name: 'kassab-backup.json', mimeType: 'application/json', buffer: Buffer.from(built.file) });
await page.waitForTimeout(600);
await page.locator('.modal input').fill(PASS);
await page.locator('.modal button:has-text("فكّ الملف")').click();
await page.waitForTimeout(2500);
const cmp = page.locator('.modal:has-text("استيراد نسخة احتياطية")');
ok('يُفكّ ويمرّ بمقارنة الاستيراد نفسها قبل الاستبدال', await cmp.count() === 1, (await cmp.innerText().catch(() => '')).slice(0, 120).replace(/\n/g, ' | '));
await cmp.locator('button:has-text("استبدال واستيراد")').click();
await page.waitForTimeout(3500);
const back = await page.evaluate(async () => {
  const { repo } = await import('/js/data/repository.js');
  return (await repo.clients.list()).some((c) => c.name === 'عميل من درايف');
});
ok('استُرجع العميل من ملف درايف', back);

// الملف العادي ما زال يُستورد كما كان
const plainOk = await page.evaluate(async () => {
  const { readBackupFile } = await import('/js/data/backup.js');
  const { exportBackup } = await import('/js/data/backup.js');
  const { blob } = await exportBackup();
  const r = await readBackupFile(new File([await blob.text()], 'x.json'));
  return !!r.data;
});
ok('ملف التصدير العادي لم يتأثّر', plainOk);

// ——— بلا دخول: مرفوض ———
const anon = await (await b.newContext()).newPage();
await anon.goto(BASE + '/');
const anonStatus = await anon.evaluate(async () => (await fetch('/api/drive')).status);
ok('بلا دخول: 401', anonStatus === 401, String(anonStatus));

ok('بلا أخطاء صفحة', !errors.length, errors.slice(0, 3).join(' | '));
await b.close();
