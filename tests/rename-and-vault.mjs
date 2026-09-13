import { chromium } from './pw.mjs';
const BASE = process.env.TEST_URL || 'http://127.0.0.1:8234';
const b = await chromium.launch();
const ctx = await b.newContext({ locale: 'ar-SA' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
page.on('console', m => { const t = m.text(); if (m.type()==='error' && !t.includes('ERR_') && !t.includes('favicon') && !t.includes('401')) errors.push(t); });
const ok = (n,c,x='') => console.log(`${c?'PASS':'FAIL'} — ${n}${x?' :: '+x:''}`);

await page.goto(BASE + '/');
await page.fill('input[type="password"]', 'secret-pass');
await page.click('button[type="submit"]');
await page.waitForTimeout(2500);
ok('الدخول يعمل بعد إعادة التسمية', await page.locator('.app-shell').count() === 1);

console.log('\n--- إعادة التسمية إلى «كسّاب» ---');
ok('عنوان التبويب صار «كسّاب»', (await page.title()).includes('كسّاب'), await page.title());
ok('شعار القائمة الجانبية حرف ك', (await page.locator('.sidebar-brand').innerText()).trim() === 'ك');
const dbName = await page.evaluate(async () => (await indexedDB.databases()).map(d => d.name));
ok('اسم قاعدة البيانات لم يتغيّر (لا فقدان بيانات)', dbName.includes('motabiq'), dbName.join(','));
const backupApp = await page.evaluate(async () => {
  const { exportBackup } = await import('/js/data/backup.js');
  const { blob } = await exportBackup();
  return JSON.parse(await blob.text()).app;
});
ok('النسخة الجديدة توقَّع باسم kassab', backupApp === 'kassab', backupApp);
const legacyOk = await page.evaluate(async () => {
  const { readBackupFile } = await import('/js/data/backup.js');
  const old = JSON.stringify({ app: 'motabiq', format: 1, exportedAt: new Date().toISOString(), db: { clients: [] } });
  try { await readBackupFile(new File([old], 'old.json', { type: 'application/json' })); return true; } catch (e) { return e.message; }
});
ok('النسخ القديمة (motabiq) ما زالت تُستورد', legacyOk === true, String(legacyOk));

console.log('\n--- ٥: الفواتير في الداشبورد والبحث ---');
await page.evaluate(async () => {
  const { repo } = await import('/js/data/repository.js');
  await repo.invoices.create({ type: 'invoice', number: 'فاتورة 5001', date: new Date().toISOString(),
    clientName: 'سعد التميمي', items: [{ description: 'عمولة', qty: 1, unitPrice: 30000 }] });
  await repo.invoices.create({ type: 'quote', number: 'عرض سعر 5001', date: new Date().toISOString(),
    clientName: 'سعد التميمي', items: [{ description: 'تسويق', qty: 1, unitPrice: 5000 }] });
});
await page.evaluate(() => { location.hash = '#/dashboard'; });
await page.waitForTimeout(1500);
const dash = await page.locator('.panel:has-text("الفواتير وعروض الأسعار")').innerText();
ok('لوحة الفواتير تظهر بأرقامها في الداشبورد', dash.includes('30,000') && dash.includes('5,000'), dash.replace(/\n/g,' | ').slice(0,120));

await page.keyboard.press('/');
await page.waitForTimeout(400);
await page.fill('.search-modal-body input', 'سعد');
await page.waitForTimeout(700);
const searchTxt = await page.locator('.search-results').innerText();
ok('البحث العام يجد الفواتير', searchTxt.includes('الفواتير وعروض الأسعار') && searchTxt.includes('فاتورة 5001'), searchTxt.replace(/\n/g,' | ').slice(0,120));
await page.keyboard.press('Escape');
await page.waitForTimeout(300);

console.log('\n--- ٤: تنبيه المطابقات عند إضافة عقار ---');
const alertResult = await page.evaluate(async () => {
  const { repo } = await import('/js/data/repository.js');
  const { requestsMatching } = await import('/js/util/match-alert.js');
  const c = await repo.clients.create({ name: 'باحث عن فلة', phone: '0533333333' });
  await repo.requests.create({ clientId: c.id, type: 'villa', purpose: 'sale', city: 'الرياض', districts: ['الياسمين'], budgetMax: 3000000, area: 300 });
  const match = await repo.properties.create({ city: 'الرياض', district: 'الياسمين', type: 'villa', purposes: ['sale'], area: 400, price: 2600000 });
  const miss = await repo.properties.create({ city: 'الرياض', district: 'الياسمين', type: 'land', purposes: ['sale'], area: 400, price: 2600000 });
  const hits = await requestsMatching(match);
  return {
    hit: hits.length,
    hitIncludesNew: hits.some((h) => h.client?.name === 'باحث عن فلة'),
    missKind: (await requestsMatching(miss)).length,
    missDraft: (await requestsMatching({ ...match, captureStatus: 'captured' })).length,
  };
});
ok('العقار المطابق يرفع تنبيهًا يشمل الطلب الجديد', alertResult.hit >= 1 && alertResult.hitIncludesNew, JSON.stringify(alertResult));
ok('نوع مختلف لا يرفع تنبيهًا', alertResult.missKind === 0);
ok('العقار غير المعتمد لا يرفع تنبيهًا', alertResult.missDraft === 0);

console.log('\n--- ١: الخزنة السحابية المشفَّرة ---');
const vault = await page.evaluate(async () => {
  const { uploadBackup, listBackups, encryptText, decryptText } = await import('/js/data/vault.js');
  const round = await decryptText(await encryptText('نص سرّي', 'عبارة طويلة جدا'), 'عبارة طويلة جدا');
  let wrong = 'لم يُرفض';
  try { await decryptText(await encryptText('x', 'aaaaaaaa'), 'bbbbbbbb'); } catch (e) { wrong = e.message; }
  const up = await uploadBackup('عبارة طويلة جدا');
  const list = await listBackups();
  return { round, wrong, up, count: list.length, key: list[0]?.key };
});
ok('التشفير وفكّه يعملان', vault.round === 'نص سرّي', vault.round);
ok('العبارة الخاطئة تُرفض برسالة واضحة', vault.wrong.includes('غير صحيحة'), vault.wrong);
ok('الرفع يُنشئ نسخة في الخزنة', vault.count >= 1, JSON.stringify({ count: vault.count, bytes: vault.up.bytes }));

// الاحتفاظ بآخر ٥ نسخ فقط (شبكة أمان بلا تضخّم)
const rotation = await page.evaluate(async () => {
  const { uploadBackup, listBackups } = await import('/js/data/vault.js');
  for (let i = 0; i < 6; i++) await uploadBackup('عبارة طويلة جدا');
  return (await listBackups()).length;
});
ok('تُحفظ آخر ٥ نسخ فقط (لا تضخّم)', rotation === 5, String(rotation));

// الخادم لا يستطيع قراءة المحتوى
const rawBody = await page.evaluate(async (key) => {
  const res = await fetch(`/api/vault?key=${encodeURIComponent(key)}`, { credentials: 'same-origin' });
  return (await res.json()).payload;
}, vault.key);
ok('ما يصل الخادم كتلة مشفَّرة لا تحوي بياناتك', !rawBody.includes('باحث عن فلة') && !rawBody.includes('سعد التميمي') && rawBody.includes('AES-GCM'), rawBody.slice(0, 80));

// الاسترجاع على "جهاز آخر" (سياق متصفح جديد بنفس الدخول)
const dev2 = await b.newContext({ locale: 'ar-SA' });
const p2 = await dev2.newPage();
await p2.goto(BASE + '/');
await p2.fill('input[type="password"]', 'secret-pass');
await p2.click('button[type="submit"]');
await p2.waitForTimeout(2500);
const before = await p2.evaluate(async () => (await (await import('/js/data/repository.js')).repo.invoices.list()).length);
const after = await p2.evaluate(async () => {
  const { restoreBackup } = await import('/js/data/vault.js');
  await restoreBackup('عبارة طويلة جدا');
  const { repo } = await import('/js/data/repository.js');
  const invs = await repo.invoices.list();
  const clients = await repo.clients.list();
  return { invoices: invs.length, hasClient: clients.some((c) => c.name === 'سعد التميمي' || c.name === 'باحث عن فلة') };
});
ok('الاسترجاع على جهاز آخر ينقل البيانات فعلًا', after.invoices === 2 && after.hasClient, JSON.stringify({ before, after }));

// بلا كوكي: الخزنة مرفوضة
const anonCtx = await b.newContext();
const anonPage = await anonCtx.newPage();
await anonPage.goto(BASE + '/'); // شاشة الدخول (بلا كوكي)
const anonStatus = await anonPage.evaluate(async () => (await fetch('/api/vault', { credentials: 'same-origin' })).status);
ok('الخزنة محميّة: بلا تسجيل دخول ترفض 401', anonStatus === 401, String(anonStatus));
const anonPush = await anonPage.evaluate(async () => (await fetch('/api/push', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status);
ok('اشتراك التنبيهات محمي كذلك', anonPush === 401, String(anonPush));

console.log('\nERRORS:', errors.length ? JSON.stringify(errors.slice(0,4)) : 'none');
await b.close();
