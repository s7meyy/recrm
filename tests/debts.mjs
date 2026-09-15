// المرحلة ٣٦ في متصفح حقيقي: ما وعدتُ به ولم أُنجزه كاملًا في ٣٥.
import { chromium } from './pw.mjs';

const BASE = process.env.TEST_URL || 'http://127.0.0.1:8235';
const b = await chromium.launch();
const ctx = await b.newContext({ locale: 'ar-SA', viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !t.includes('ERR_') && !t.includes('Failed to load resource')) errors.push(t); });
const ok = (n, c, x = '') => console.log(`${c ? 'PASS' : 'FAIL'} — ${n}${x ? ' :: ' + x : ''}`);

await page.goto(BASE + '/');
await page.waitForTimeout(2400);

/* ===== ١. شاهد الحذف يعيش أطول من السجل ===== */
console.log('\n--- ١. شواهد الحذف ---');
const stone = await page.evaluate(async () => {
  const { repo } = await import('/js/data/repository.js');
  const c = await repo.clients.create({ name: 'محذوفٌ قديم', phone: '0512345678' });
  await repo.clients.remove(c.id);
  // نُقدّم تاريخ الحذف أربعين يومًا: أكثر من مدّة السجل (٣٠) وأقلّ من مدّة الشاهد (٤٠٠)
  const rows = await repo.raw.getAll('trash');
  const entry = rows.find((t) => t.recordId === c.id);
  const old = new Date(Date.now() - 40 * 86400000).toISOString();
  await repo.raw.putMany('trash', [{ ...entry, deletedAt: old }]);
  const listed = await repo.trash.list(); // تُقلّم ضمنًا
  const after = (await repo.raw.getAll('trash')).find((t) => t.recordId === c.id);
  return {
    id: c.id,
    inList: listed.some((t) => t.recordId === c.id),
    stillThere: !!after,
    dataDropped: after ? after.data === null : false,
    trashId: entry.id,
  };
});
ok('السجل المحفوظ يُفرَّغ بعد مدّته', stone.dataDropped === true, JSON.stringify(stone));
ok('والشاهد يبقى في المخزن', stone.stillThere === true);
ok('ولا يظهر في سلّة المحذوفات', stone.inList === false);

const restoreMsg = await page.evaluate(async (trashId) => {
  const { repo } = await import('/js/data/repository.js');
  try { await repo.trash.restore(trashId); return 'استُعيد!'; } catch (e) { return e.message; }
}, stone.trashId);
ok('واستعادته تقول لماذا لا تمكن', restoreMsg.includes('لم يبقَ إلا أثرُه'), restoreMsg);

// والدمج لا يُحيي ما حُذف — حتى بعد تفريغ السجل
const revive = await page.evaluate(async (id) => {
  const { mergeBackup } = await import('/js/data/backup.js');
  const { repo } = await import('/js/data/repository.js');
  const snapshot = {
    db: { clients: [{ id, name: 'محذوفٌ قديم', updatedAt: new Date(Date.now() - 60 * 86400000).toISOString() }] },
  };
  const stats = await mergeBackup(snapshot);
  return { stats, back: !!(await repo.clients.get(id)) };
}, stone.id);
ok('والدمج لا يُحيي محذوفًا بعد أربعين يومًا', revive.back === false && revive.stats.skippedDeleted >= 1,
  JSON.stringify(revive));

/* ===== ٢. نقل الإعدادات قرارٌ صريح ===== */
console.log('\n--- ٢. نقل الإعدادات ---');
const moved = await page.evaluate(async () => {
  const { importSettings, mergeBackup } = await import('/js/data/backup.js');
  const { repo } = await import('/js/data/repository.js');
  await repo.settings.set('vault', { passphrase: 'عبارة هذا الجهاز', auto: false });
  await repo.settings.set('company', { name: 'مكتبي أنا' });
  const snapshot = {
    db: {
      settings: [
        { key: 'company', value: { name: 'مكتب النسخة' } },
        { key: 'vault', value: { passphrase: 'عبارة جهازٍ آخر' } },
      ],
      clients: [],
    },
  };
  // الدمج وحده لا يمسّ الإعدادات
  await mergeBackup(snapshot);
  const afterMerge = await repo.settings.get('company', null);
  const res = await importSettings(snapshot);
  const afterImport = await repo.settings.get('company', null);
  const vault = await repo.settings.get('vault', null);
  return { afterMerge, afterImport, vaultPass: vault?.passphrase, res };
});
ok('الدمج لا يمسّ الإعدادات', moved.afterMerge?.name === 'مكتبي أنا', JSON.stringify(moved.afterMerge));
ok('والنقل الصريح ينقلها', moved.afterImport?.name === 'مكتب النسخة', JSON.stringify(moved.afterImport));
ok('وعبارة الخزنة تبقى للجهاز', moved.vaultPass === 'عبارة هذا الجهاز', String(moved.vaultPass));
ok('ويقول كم نُقل وماذا أُبقي', moved.res.moved === 1 && moved.res.kept.includes('vault'), JSON.stringify(moved.res));

/* ===== ٣. وضع المساعد يُخفي المال ===== */
console.log('\n--- ٣. وضع المساعد ---');
await page.evaluate(async () => {
  const { repo } = await import('/js/data/repository.js');
  const c = await repo.clients.create({ name: 'صاحب صفقة', phone: '0533333333' });
  const p = await repo.properties.create({
    type: 'villa', city: 'الرياض', district: 'الربح', area: 400, price: 2000000,
    captureStatus: 'approved', purposes: ['sale'], status: 'agreed',
  });
  await repo.deals.create({ date: new Date().toISOString(), finalPrice: 2000000, commission: 50000, clientId: c.id, propertyId: p.id });
});
await page.evaluate(() => { location.hash = '#/dashboard'; });
await page.waitForTimeout(2600);
const before = await page.evaluate(() => ({
  money: [...document.querySelectorAll('#page [data-sensitive]')].length,
  visible: [...document.querySelectorAll('#page [data-sensitive]')].filter((n) => n.offsetParent !== null).length,
}));
ok('لوحات المال موسومةٌ حسّاسة', before.money >= 4, JSON.stringify(before));
ok('وتُرى للمالك', before.visible >= 4, JSON.stringify(before));

await page.evaluate(() => { document.body.classList.add('assistant-mode'); });
await page.waitForTimeout(300);
const after = await page.evaluate(() => [...document.querySelectorAll('#page [data-sensitive]')].filter((n) => n.offsetParent !== null).length);
ok('وتختفي في وضع المساعد', after === 0, String(after));

// والصفحتان المالّيتان لا تُفتحان
await page.evaluate(() => { location.hash = '#/invoices'; });
await page.waitForTimeout(1600);
const blocked = await page.locator('#page').innerText();
ok('وصفحة الفواتير تُمنع بالعنوان المباشر', blocked.includes('للمالك وحده'), blocked.split('\n')[0]);
await page.evaluate(() => { location.hash = '#/expenses'; });
await page.waitForTimeout(1400);
ok('وكذلك المصاريف', (await page.locator('#page').innerText()).includes('للمالك وحده'));

// الموجّه لا يعيد بناء المسار نفسه، فنمرّ بصفحةٍ وسيطة.
await page.evaluate(() => { document.body.classList.remove('assistant-mode'); location.hash = '#/today'; });
await page.waitForTimeout(900);
await page.evaluate(() => { location.hash = '#/expenses'; });
await page.waitForTimeout(1800);
ok('وتعودان للمالك', !(await page.locator('#page').innerText()).includes('للمالك وحده'));

ok('لا أخطاء في الصفحة', errors.length === 0, errors.slice(0, 3).join(' | '));
await b.close();
