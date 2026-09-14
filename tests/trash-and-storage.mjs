// المرحلة ٢١ في متصفح حقيقي: سلة المحذوفات، وترقية القاعدة، ومعاينة الاسترجاع.
import { chromium } from './pw.mjs';

const BASE = process.env.TEST_URL || 'http://127.0.0.1:8235';
const b = await chromium.launch();
const ctx = await b.newContext({ locale: 'ar-SA' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !t.includes('ERR_') && !t.includes('Failed to load resource')) errors.push(t); });
const ok = (n, c, x = '') => console.log(`${c ? 'PASS' : 'FAIL'} — ${n}${x ? ' :: ' + x : ''}`);

await page.goto(BASE + '/');
await page.waitForTimeout(2400);

/* ===== ترقية القاعدة ===== */
const db = await page.evaluate(async () => new Promise((res) => {
  const rq = indexedDB.open('motabiq');
  rq.onsuccess = () => { const d = rq.result; res({ v: d.version, stores: [...d.objectStoreNames] }); d.close(); };
}));
ok('القاعدة رُقّيت إلى ٥ ومخزن السلة موجود', db.v === 5 && db.stores.includes('trash'), `v${db.v}`);

/* ===== الحذف يمرّ بالسلة ===== */
const flow = await page.evaluate(async () => {
  const { repo } = await import('/js/data/repository.js');
  await repo.trash.clear();
  const note = await repo.notes.create({ text: 'فكرة ستُحذف ثم تعود' });
  await repo.notes.remove(note.id);
  const inTrash = await repo.trash.list();
  const gone = await repo.notes.get(note.id).catch(() => null);
  const entry = inTrash.find((t) => t.recordId === note.id);
  await repo.trash.restore(entry.id);
  const back = await repo.notes.get(note.id);
  const after = await repo.trash.list();
  return {
    trashCount: inTrash.length, gone: gone == null, store: entry.store,
    restoredText: back?.text, sameId: back?.id === note.id, leftInTrash: after.length,
  };
});
ok('السجل المحذوف يُحفظ في السلة', flow.trashCount === 1 && flow.store === 'notes', JSON.stringify(flow));
ok('ويُحذف فعلًا من مخزنه', flow.gone);
ok('والاسترجاع يعيده بنصّه ومعرّفه الأصلي', flow.restoredText === 'فكرة ستُحذف ثم تعود' && flow.sameId);
ok('ويُرفع من السلة بعد الاسترجاع', flow.leftInTrash === 0);

/* ===== حدود مصرَّح بها ===== */
const limits = await page.evaluate(async () => {
  const { repo } = await import('/js/data/repository.js');
  await repo.trash.clear();
  // الصور لا تدخل السلة (قد تبلغ ميغابايتات)
  const img = await repo.images.create({ entity: 'property', entityId: 'x', mime: 'image/jpeg', size: 10 });
  await repo.images.remove(img.id);
  const afterImage = (await repo.trash.list()).length;

  // معرّف مشغول: الاسترجاع يرفض ولا يطمس القائم
  const note = await repo.notes.create({ text: 'الأصل' });
  await repo.notes.remove(note.id);
  const entry = (await repo.trash.list())[0];
  await repo.notes.create({ text: 'الأصل' }); // سجل آخر بمعرّف مختلف
  const { adapterName } = repo;
  // نُعيد إنشاء سجل بالمعرّف نفسه لنختبر الرفض
  const { indexedDbAdapter } = await import('/js/data/adapters/indexeddb.js');
  await indexedDbAdapter.put('notes', { ...entry.data, text: 'سجل جديد بالمعرّف نفسه' });
  let refused = 'قُبل';
  try { await repo.trash.restore(entry.id); } catch (e) { refused = e.message; }
  const survivor = await repo.notes.get(entry.recordId);
  return { afterImage, refused, survivorText: survivor.text, adapterName };
});
ok('الصور لا تدخل السلة', limits.afterImage === 0, String(limits.afterImage));
ok('الاسترجاع يرفض إن كان المعرّف مشغولًا', limits.refused.includes('المعرّف نفسه'), limits.refused);
ok('ولا يطمس السجل القائم', limits.survivorText === 'سجل جديد بالمعرّف نفسه', limits.survivorText);

/* ===== الكنس بعد ثلاثين يومًا ===== */
const pruned = await page.evaluate(async () => {
  const { repo } = await import('/js/data/repository.js');
  const { indexedDbAdapter } = await import('/js/data/adapters/indexeddb.js');
  await repo.trash.clear();
  const old = new Date(Date.now() - 40 * 86400000).toISOString();
  await indexedDbAdapter.put('trash', { id: 'old1', store: 'notes', recordId: 'n1', deletedAt: old, data: { id: 'n1', text: 'قديم' } });
  await indexedDbAdapter.put('trash', { id: 'new1', store: 'notes', recordId: 'n2', deletedAt: new Date().toISOString(), data: { id: 'n2', text: 'حديث' } });
  const list = await repo.trash.list();
  return { count: list.length, ids: list.map((t) => t.id) };
});
ok('ما تجاوز ثلاثين يومًا يُكنس تلقائيًا', pruned.count === 1 && pruned.ids[0] === 'new1', JSON.stringify(pruned));

/* ===== السلة لا تدخل النسخة الاحتياطية ===== */
const backup = await page.evaluate(async () => {
  const { STORES } = await import('/js/data/schema.js');
  return { hasTrash: STORES.includes('trash') };
});
ok('السلة خارج النسخة الاحتياطية عمدًا', !backup.hasTrash);

/* ===== اللوحة في الإعدادات ===== */
await page.evaluate(async () => {
  const { repo } = await import('/js/data/repository.js');
  const n = await repo.notes.create({ text: 'فكرة في السلة للعرض' });
  await repo.notes.remove(n.id);
  location.hash = '#/settings';
});
await page.waitForTimeout(1800);
const settingsText = await page.locator('#page').innerText();
ok('لوحة السلة تظهر بمحتواها', settingsText.includes('سلة المحذوفات') && settingsText.includes('فكرة في السلة للعرض'),
  settingsText.split('\n').find((l) => l.includes('سلة')) || '');
ok('وتصرّح بحدّها: التابع لا يعود', settingsText.includes('أما ما حُذف تبعًا له'));

await page.locator('button:has-text("استرجاع")').first().click();
await page.waitForTimeout(1200);
const restored = await page.evaluate(async () => {
  const { repo } = await import('/js/data/repository.js');
  return (await repo.notes.list()).some((n) => n.text === 'فكرة في السلة للعرض');
});
ok('زر الاسترجاع يعيد السجل فعلًا', restored);

ok('لا أخطاء جافاسكربت في الصفحة', errors.length === 0, errors.slice(0, 2).join(' | '));
await b.close();
