// المرحلة ٣٢ في متصفح حقيقي: التقويم وتصديره، والذكرى، و«لا تتصل»، وتكرار العروض، والقفل.
import { chromium } from './pw.mjs';

const BASE = process.env.TEST_URL || 'http://127.0.0.1:8235';
const b = await chromium.launch();
const ctx = await b.newContext({ locale: 'ar-SA', acceptDownloads: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !t.includes('ERR_') && !t.includes('Failed to load resource')) errors.push(t); });
const ok = (n, c, x = '') => console.log(`${c ? 'PASS' : 'FAIL'} — ${n}${x ? ' :: ' + x : ''}`);

await page.goto(BASE + '/');
await page.waitForTimeout(2400);

/* ===== ١. التقويم ===== */
console.log('\n--- ١. التقويم ---');
const seed = await page.evaluate(async () => {
  const { repo } = await import('/js/data/repository.js');
  const client = await repo.clients.create({ name: 'وليد الزهراني', phone: '0577778888' });
  const property = await repo.properties.create({
    type: 'villa', city: 'الرياض', district: 'العقيق', area: 420, price: 2400000,
    captureStatus: 'approved', purposes: ['sale'], status: 'agreed',
  });
  const soon = new Date();
  soon.setDate(soon.getDate() + 1);
  soon.setHours(17, 0, 0, 0);
  await repo.showings.create({ at: soon.toISOString(), clientId: client.id, propertyId: property.id });
  const lists = await repo.taskLists.list();
  const list = lists[0] || await repo.taskLists.create({ title: 'متابعات', order: 0 });
  await repo.tasks.create({ listId: list.id, title: 'مهمة التقويم', dueAt: soon.toISOString() });
  return { clientId: client.id, propertyId: property.id };
});

await page.evaluate(() => { location.hash = '#/calendar'; });
await page.waitForTimeout(2200);
const calText = await page.locator('#page').innerText();
ok('صفحة التقويم تُفتح', calText.includes('التقويم') && calText.includes('الأحد'), calText.split('\n')[0]);
ok('والمعاينة تظهر فيه', calText.includes('معاينة'), calText.split('\n').find((l) => l.includes('معاينة')) || '');
ok('والمهمة تظهر فيه', calText.includes('مهمة التقويم'));
ok('ويصرّح بأنه لا يُنشئ شيئًا', calText.includes('التقويم لا يُنشئ شيئًا'));
ok('ويصرّح بأن ics لا يتزامن', calText.includes('لا يتزامن'));
ok('ولا null نصًّا', !calText.includes('null') && !calText.includes('undefined'));
ok('واليوم مميَّز في الشبكة', await page.locator('.cal-today').count() === 1, String(await page.locator('.cal-today').count()));

const download = page.waitForEvent('download', { timeout: 15000 }).catch(() => null);
await page.locator('button:has-text("صدّر الشهر")').click();
const file = await download;
ok('تصدير الشهر ينزّل ملف ics', !!file && file.suggestedFilename().endsWith('.ics'), file?.suggestedFilename() || 'لا تنزيل');
if (file) {
  const path = await file.path();
  const text = path ? await (await import('node:fs/promises')).readFile(path, 'utf8') : '';
  ok('والملف تقويم صحيح', text.startsWith('BEGIN:VCALENDAR') && text.includes('BEGIN:VEVENT') && text.trimEnd().endsWith('END:VCALENDAR'));
  ok('وفيه اسم الحدث', text.includes('مهمة التقويم'));
}

// التنقّل بين الشهور
const before = await page.locator('.section-title').first().innerText();
await page.locator('button:has-text("التالي")').click();
await page.waitForTimeout(600);
const after = await page.locator('.section-title').first().innerText();
ok('التنقّل بين الشهور يعمل', before !== after, `${before} → ${after}`);
await page.locator('button:has-text("هذا الشهر")').click();
await page.waitForTimeout(600);
ok('والعودة إلى هذا الشهر', (await page.locator('.section-title').first().innerText()) === before);

/* ===== ٢. ذكرى الصفقة ===== */
console.log('\n--- ٢. الذكرى ---');
const dealId = await page.evaluate(async ({ clientId, propertyId }) => {
  const { repo } = await import('/js/data/repository.js');
  const d = await repo.deals.create({
    date: new Date(Date.now() - 366 * 86400000).toISOString(),
    finalPrice: 2300000, commission: 57500, clientId, propertyId,
  });
  location.hash = '#/clients';
  return d.id;
}, seed);
await page.waitForTimeout(1200);
await page.evaluate(() => { location.hash = '#/today'; });
await page.waitForTimeout(2200);
const todayText = await page.locator('#page').innerText();
ok('لوحة ذكرى الصفقة تظهر', todayText.includes('ذكرى صفقة') && todayText.includes('وليد الزهراني'),
  todayText.split('\n').find((l) => l.includes('ذكرى')) || '');
ok('وتذكر عدد السنوات', /سنة على صفقته|سنوات على صفقته/.test(todayText),
  todayText.split('\n').find((l) => l.includes('صفقته')) || '');

await page.locator('.today-row').filter({ hasText: 'وليد الزهراني' }).locator('button:has-text("تخطَّ")').first().click();
await page.waitForTimeout(1600);
const greeted = await page.evaluate(async (id) => {
  const { repo } = await import('/js/data/repository.js');
  return (await repo.deals.get(id)).anniversaryGreetedAt;
}, dealId);
ok('و«تخطَّ» توسمها فلا تعود', !!greeted, String(greeted));

/* ===== ٣. «لا تتصل» ===== */
console.log('\n--- ٣. تفضيلات التواصل ---');
const dnc = await page.evaluate(async () => {
  const { repo } = await import('/js/data/repository.js');
  const c = await repo.clients.create({
    name: 'مرشّح للإزعاج', phone: '0588889999', doNotContact: true, bestTime: 'evening',
    contacts: [],
  });
  const { awaitingReply } = await import('/js/util/lead-score.js');
  await new Promise((r) => setTimeout(r, 300)); // كي يتجاوز عمرُه حدَّ «ينتظر ردّك»
  const all = await repo.clients.list();
  const reachable = all.filter((x) => !x.doNotContact);
  const opts = { minutes: 0.002 }; // ١٢٠ مِلّي ثانية — حدٌّ يتجاوزه عمر السجل
  return {
    saved: { dnc: c.doNotContact, time: c.bestTime },
    inAll: awaitingReply(all, opts).some((w) => w.client.id === c.id),
    inReachable: awaitingReply(reachable, opts).some((w) => w.client.id === c.id),
    id: c.id,
  };
});
ok('الحقلان يُحفظان', dnc.saved.dnc === true && dnc.saved.time === 'evening', JSON.stringify(dnc.saved));
ok('ومن طلب ألّا تتصل يخرج من لوحة الانتظار', dnc.inAll === true && dnc.inReachable === false,
  JSON.stringify([dnc.inAll, dnc.inReachable]));

await page.evaluate(() => { location.hash = '#/dashboard'; });
await page.waitForTimeout(700);
await page.evaluate(() => { location.hash = '#/today'; });
await page.waitForTimeout(2200);
ok('ولا يظهر في «يومي»', !(await page.locator('#page').innerText()).includes('مرشّح للإزعاج'));

await page.evaluate(() => { location.hash = '#/clients'; });
await page.waitForTimeout(1800);
await page.locator('tbody tr').filter({ hasText: 'مرشّح للإزعاج' }).first().click();
await page.waitForTimeout(1200);
const detail = await page.locator('.modal').last().innerText();
ok('ويبقى في قائمته بشارته', detail.includes('لا تتصل') && detail.includes('يفضّل مساءً'),
  detail.split('\n').slice(0, 4).join(' | '));
await page.evaluate(() => { document.getElementById('modal-root')?.replaceChildren(); });

/* ===== ٤. عرض خارجي يشبه مخزونك ===== */
console.log('\n--- ٤. تكرار العروض ---');
await page.evaluate(async ({ propertyId }) => {
  const { repo } = await import('/js/data/repository.js');
  const p = await repo.properties.get(propertyId);
  await repo.externalListings.create({
    city: p.city, district: p.district, type: p.type, area: p.area, price: p.price + 50000,
    status: 'active', platform: 'حراج', purposes: ['sale'],
  });
  location.hash = '#/health';
}, seed);
await page.waitForTimeout(2200);
const healthText = await page.locator('#page').innerText();
ok('اللوحة تظهر في «صحة البيانات»', healthText.includes('عروض خارجية تشبه مخزونك'),
  healthText.split('\n').find((l) => l.includes('تشبه')) || '');
ok('وتقول ما معناه', healthText.includes('يسوّق عرضك') || healthText.includes('مرّتين في مؤشر السعر'));
ok('وتذكر فرق السعر', /أعلى بـ|أقل بـ|بالسعر نفسه/.test(healthText),
  healthText.split('\n').find((l) => l.includes('أعلى بـ')) || '');

/* ===== ٥. القفل التلقائي ===== */
console.log('\n--- ٥. القفل التلقائي ---');
await page.evaluate(() => { location.hash = '#/settings'; });
await page.waitForTimeout(2400);
const settingsText = await page.locator('#page').innerText();
ok('لوحة القفل في الإعدادات', settingsText.includes('القفل التلقائي'));
ok('وتقول إنه تسجيل خروج فعليّ', settingsText.includes('تسجيل خروج فعليّ'));
ok('ومعطَّل افتراضيًا', await page.evaluate(async () => !(await (await import('/js/data/settings.js')).getUI()).autoLockMinutes));

// المؤقّت نفسه: نشغّله بمدّة قصيرة ونتحقّق أنه ينذر ثم يقفل، بلا خروج فعليّ.
const lock = await page.evaluate(async () => {
  const { startAutoLock } = await import('/js/util/auto-lock.js');
  return new Promise((resolve) => {
    let warned = 0;
    let now = Date.now();
    // ساعة وهمية: المؤقّت ينبض كل ثانية حقيقية، ونقدّم الزمن ٢٫٥ ثانية لكل نبضة —
    // فتقع نبضةٌ داخل نافذة الإنذار [١ث، ٣ث) ثم نبضةٌ بعدها تقفل.
    const handle = startAutoLock({
      minutes: 0.05, // ثلاث ثوانٍ
      warnSeconds: 2,
      now: () => now,
      onWarn: () => { warned++; },
      onLock: () => { handle.stop(); resolve({ warned, locked: true }); },
    });
    const step = setInterval(() => { now += 500; }, 200);
    setTimeout(() => { clearInterval(step); handle.stop(); resolve({ warned, locked: false }); }, 6000);
  });
});
ok('القفل ينذر قبل أن يقفل', lock.warned >= 1, JSON.stringify(lock));
ok('ثم يقفل', lock.locked === true, JSON.stringify(lock));

const stayed = await page.evaluate(async () => {
  const { startAutoLock } = await import('/js/util/auto-lock.js');
  return new Promise((resolve) => {
    let now = Date.now();
    let locked = false;
    const handle = startAutoLock({
      minutes: 0.05, warnSeconds: 2, now: () => now,
      onWarn: (s, stay) => { stay(); }, // «ابقَ مفتوحًا»
      onLock: () => { locked = true; },
    });
    const step = setInterval(() => { now += 500; }, 200);
    setTimeout(() => { clearInterval(step); handle.stop(); resolve(locked); }, 6000);
  });
});
ok('و«ابقَ مفتوحًا» يمنع القفل', stayed === false, String(stayed));

ok('لا أخطاء في الصفحة', errors.length === 0, errors.slice(0, 3).join(' | '));
await b.close();
