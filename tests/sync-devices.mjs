// المزامنة بين الأجهزة والنسخة المجزَّأة (المرحلة ٤٥) — في متصفّح حقيقي وعلى الخزنة نفسها.
//
// **ولا يُفحص المنطق وحده:** الدورة كلها تُشغَّل — تشفيرٌ في المتصفح، ورفعٌ إلى الدالة،
// وتقليمٌ على الخادم، وسحبٌ ووصلُ كتلٍ ودمج. فما يمرّ هنا مرّ في الطريق الذي يسلكه فعلًا.
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
ok('الدخول تمّ', await page.locator('.app-shell').count() === 1);

/* ===== ١) دورة المزامنة: يرفع ثم يستردّ ما مُحي بلا شاهد حذف ===== */
console.log('\n--- المزامنة: الدورة الكاملة ---');

// **بذرةٌ أوّلًا، ورفعًا بلا سحب.** الخزنة في الاختبار ذاكرةٌ واحدة يشترك فيها المشغّل
// كلُّه، وحزمة `rename-and-vault` ترفع فيها قبلنا نسخًا **بعبارةٍ سرّية أخرى**. فسحبٌ
// قبل رفعتنا يقع على نسختها فلا يفكّها — وهو سلوكٌ صحيحٌ من المنتج (انظر رسالة
// «عبارةٌ غير التي في هذا الجهاز» في `sync.js`) وعزلٌ ناقصٌ في الاختبار. والرفعةُ
// الأولى تجعل أحدثَ ما في الخزنة نسختَنا، فتستقيم بقيّةُ الدورة.
const cycle = await page.evaluate(async () => {
  const { setVaultSettings } = await import('/js/data/settings.js');
  const { repo } = await import('/js/data/repository.js');
  const { syncNow } = await import('/js/data/sync.js');
  await setVaultSettings({ passphrase: 'a-long-enough-passphrase', sync: true });

  const c = await repo.clients.create({ name: 'عميل المزامنة', phone: '0501010101' });
  const first = await syncNow({ pull: false });

  // جهازٌ لم يرَ هذا السجلّ قط: نمحوه من المخزن **بلا شاهد حذف** (لا `remove`).
  await repo.raw.deleteMany('clients', [c.id]);
  const goneBefore = (await repo.clients.list()).some((x) => x.id === c.id);
  const second = await syncNow();
  const backAfter = (await repo.clients.list()).some((x) => x.id === c.id);
  return { id: c.id, first, second, goneBefore, backAfter };
});
ok('أوّل مزامنة ترفع', cycle.first.pushed === true && !cycle.first.error, JSON.stringify(cycle.first.error || ''));
ok('والمحو المحلّي يمحو فعلًا', cycle.goneBefore === false);
ok('والمزامنة التالية تستردّه من الجهاز الآخر', cycle.backAfter === true);
ok('وتقول كم أضافت', (cycle.second.stats?.added || 0) >= 1, JSON.stringify(cycle.second.stats));

/* ===== ٢) المحذوف يبقى محذوفًا — وإلا لعاد كل ما حذفتَه مع أول دمج ===== */
console.log('\n--- المزامنة: الحذف لا يُنقض ---');
const del = await page.evaluate(async () => {
  const { repo } = await import('/js/data/repository.js');
  const { syncNow } = await import('/js/data/sync.js');
  const c = await repo.clients.create({ name: 'عميل سيُحذف', phone: '0502020202' });
  await syncNow();                 // صار في الخزنة
  await repo.clients.remove(c.id); // حذفٌ بشاهد (سلّة المحذوفات)
  const res = await syncNow();
  return { id: c.id, alive: (await repo.clients.list()).some((x) => x.id === c.id), skipped: res.stats?.skippedDeleted || 0 };
});
ok('المحذوف لا يعود بالدمج', del.alive === false);
ok('ويُعدّ في «تُخطّي المحذوف»', del.skipped >= 1, String(del.skipped));

/* ===== ٣) الأحدث كتابةً يغلب ===== */
console.log('\n--- المزامنة: الأحدث يغلب ---');
const win = await page.evaluate(async () => {
  const { repo } = await import('/js/data/repository.js');
  const { syncNow } = await import('/js/data/sync.js');
  const c = await repo.clients.create({ name: 'اسمٌ قديم', phone: '0503030303' });
  await syncNow();
  // نكتب فوقه **بختمٍ أقدم** كما لو جاء من جهازٍ عُدّل فيه قبل ذلك: الخزنة أحدث فتغلب.
  await repo.raw.putMany('clients', [{ ...(await repo.clients.get(c.id)), name: 'اسمٌ أقدم', updatedAt: '2020-01-01T00:00:00.000Z' }]);
  await syncNow({ push: false });
  const afterOld = (await repo.clients.get(c.id)).name;
  // ثم نكتب بختمٍ أحدث: المحلّي يغلب فلا يمحوه السحب.
  await repo.raw.putMany('clients', [{ ...(await repo.clients.get(c.id)), name: 'اسمٌ أحدث', updatedAt: '2099-01-01T00:00:00.000Z' }]);
  await syncNow({ push: false });
  return { afterOld, afterNew: (await repo.clients.get(c.id)).name };
});
ok('الختم الأقدم محليًّا يُستبدل بما في الخزنة', win.afterOld === 'اسمٌ قديم', win.afterOld);
ok('والختم الأحدث محليًّا لا يُمحى', win.afterNew === 'اسمٌ أحدث', win.afterNew);

/* ===== ٤) النسخة الكبيرة تُرفع كتلًا وتعود كما كانت ===== */
console.log('\n--- الخزنة: فوق ٤٫٥ ميغابايت ---');
const big = await page.evaluate(async () => {
  const { repo } = await import('/js/data/repository.js');
  const { uploadBackup, fetchBackup } = await import('/js/data/vault.js');
  // نصٌّ عربيّ ضخم: الحرف بايتان، فمليونا حرفٍ أربعةُ ميغابايت — فوق كتلةِ الثلاثة.
  // بلا مسافةٍ في آخره: مخزن السجلّات يقلّم أطراف الملاحظة (`trim`) وهو صواب، فمقارنةُ
  // نصٍّ ينتهي بفراغٍ تتّهم التجزئةَ بحرفٍ لم تُضيّعه هي.
  const huge = 'شقّة ٣ غرف في حيّ الياسمين بسعرٍ مناسب 🏠.'.repeat(50000);
  const c = await repo.clients.create({ name: 'عميلٌ بملاحظةٍ ضخمة', phone: '0504040404', notes: huge });
  const up = await uploadBackup('a-long-enough-passphrase');
  const back = await fetchBackup('a-long-enough-passphrase');
  const rows = back.data?.db?.clients || [];
  const found = rows.find((x) => x.id === c.id);
  return {
    parts: up.parts, bytes: up.bytes,
    same: found?.notes === huge,
    len: found?.notes?.length || 0, want: huge.length,
    rows: rows.length,
  };
});
ok('النسخة الضخمة تُرفع في أكثر من كتلة', big.parts > 1, `${big.parts} كتلة · ${Math.round(big.bytes/100000)/10}م`);
ok('وتعود كاملةً حرفًا حرفًا', big.same === true, `${big.len} من ${big.want}`);
ok('وبقيّة السجلّات معها', big.rows >= 3, String(big.rows));

/* ===== ٥) التقليم لا يقصّ وسط دفعة ===== */
console.log('\n--- الخزنة: التقليم بالدفعة ---');
const prune = await page.evaluate(async () => {
  const { listBackupBatches } = await import('/js/data/vault.js');
  const batches = await listBackupBatches();
  return {
    count: batches.length,
    newestComplete: batches[0]?.complete,
    allComplete: batches.every((x) => x.complete),
    newestParts: batches[0]?.expected,
  };
});
ok('الدفعة الأحدث كاملة بعد التقليم', prune.newestComplete === true, `${prune.newestParts} كتلة`);
ok('ولا دفعةَ ناقصة في الخزنة', prune.allComplete === true, `${prune.count} دفعة`);
ok('ولا تتجاوز الخزنة خمسَ دفعات', prune.count <= 5, String(prune.count));

/* ===== ٦) المزامنة لا ترفع جهازًا فارغًا فوق نسخةٍ صالحة ===== */
console.log('\n--- المزامنة: الفارغ لا يُرفع ---');
const empty = await page.evaluate(async () => {
  const { repo } = await import('/js/data/repository.js');
  const { syncNow } = await import('/js/data/sync.js');
  for (const s of ['clients', 'properties', 'tours', 'requests', 'matches', 'externalListings', 'deals']) await repo.raw.clear(s);
  const res = await syncNow({ pull: false });
  return { pushed: res.pushed, ok: res.ok, error: res.error };
});
ok('الجهاز الفارغ لا يرفع', empty.pushed === false && empty.ok === true, JSON.stringify(empty.error || ''));

/* ===== ٧) المزامنة مطفأة = لا شيء يقع ===== */
const off = await page.evaluate(async () => {
  const { setVaultSettings } = await import('/js/data/settings.js');
  const { syncNow } = await import('/js/data/sync.js');
  await setVaultSettings({ sync: false });
  return await syncNow();
});
ok('مطفأةً لا ترفع ولا تسحب', off.skipped === 'off' && off.pushed === false && off.merged === false);

ok('لا أخطاء في الصفحة', errors.length === 0, errors.slice(0, 3).join(' | '));
await b.close();
