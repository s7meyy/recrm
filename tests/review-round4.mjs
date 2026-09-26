// المرحلة ٦٠ — الإضافات (هـ): بطاقة المشاركة، زرّ التواصل الموحّد، مؤشّر النسخة، طيّ الفارغ في يومي.
import { chromium } from './pw.mjs';
const BASE = process.env.TEST_URL || 'http://127.0.0.1:8235';
const b = await chromium.launch();
const ok = (n, c, x = '') => console.log(`${c ? 'PASS' : 'FAIL'} — ${n}${x ? ' :: ' + x : ''}`);

const ctx = await b.newContext({ locale: 'ar-SA', viewport: { width: 1366, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(BASE + '/');
await page.waitForTimeout(2400);
const go = async (h, ms = 1500) => { await page.evaluate((x) => { location.hash = x; }, h); await page.waitForTimeout(ms); };

console.log('--- ٣٤: مؤشّر النسخة في الرأس ---');
const dot = page.locator('#backup-dot');
ok('المؤشّر ظاهرٌ في الرأس ويقول أن لا نسخة بعد', await dot.isVisible() && /لم تُحفظ/.test(await dot.getAttribute('title')) && await dot.evaluate((n) => n.classList.contains('backup-late')), await dot.getAttribute('title'));
ok('والشريط الأصفر ظاهرٌ لأنه لم تُحفظ نسخةٌ قطّ', await page.locator('#backup-banner').isVisible());
await page.evaluate(async () => {
  const { markExported: setLastExport } = await import('/js/data/backup.js');
  await setLastExport(new Date(Date.now() - 40 * 3600000).toISOString());
  window.dispatchEvent(new CustomEvent('kassab:data-changed'));
});
await go('#/today');
ok('بعد نسخةٍ قبل ٤٠ ساعة: المؤشّر أصفر والشريط مخفيّ', await dot.evaluate((n) => n.classList.contains('backup-stale')) && await page.locator('#backup-banner').isHidden(), await dot.getAttribute('title'));
await page.evaluate(async () => {
  const { markExported: setLastExport } = await import('/js/data/backup.js');
  await setLastExport(new Date(Date.now() - 4 * 86400000).toISOString());
  window.dispatchEvent(new CustomEvent('kassab:data-changed'));
});
await go('#/dashboard'); await go('#/today');
ok('وبعد أربعة أيام: المؤشّر أحمر والشريط يعود', await dot.evaluate((n) => n.classList.contains('backup-late')) && await page.locator('#backup-banner').isVisible());
await page.evaluate(async () => { const { markExported: setLastExport } = await import('/js/data/backup.js'); await setLastExport(new Date().toISOString()); window.dispatchEvent(new CustomEvent('kassab:data-changed')); });
await go('#/dashboard'); await go('#/today');
ok('ونسخةٌ الآن: أخضر بلا شريط', await dot.evaluate((n) => n.classList.contains('backup-ok')) && await page.locator('#backup-banner').isHidden());

console.log('--- ٣٥: يومي يطوي اللوحات الفارغة ---');
const folded = page.locator('#page .dash-folded');
ok('اللوحاتُ الفارغة مجموعةٌ في سطرٍ واحد بأسمائها', await folded.count() === 1 && /لا شيء فيها اليوم/.test(await folded.innerText()), (await folded.innerText().catch(() => '')).replace(/\n/g, ' | ').slice(0, 100));
ok('ولا لوحةَ ظاهرة عدّادُها (0)', await page.locator('#page .today-panel:visible .count').filter({ hasText: '(0)' }).count() === 0);
await folded.locator('button').click();
await page.waitForTimeout(300);
ok('و«أظهرها» يعيدها', await page.locator('#page .today-panel .count').filter({ hasText: '(0)' }).count() >= 1);

console.log('--- ٣٣: زرّ التواصل الموحّد ---');
await go('#/clients');
const clientId = await page.evaluate(async () => (await (await import('/js/data/repository.js')).repo.clients.list()).find((c) => c.phone)?.id);
await go(`#/client/${clientId}`);
const menuBtn = page.locator('#page .contact-menu-btn');
ok('في ملفّ العميل زرٌّ واحد «تواصل» بدل زرّين', await menuBtn.count() === 1 && await page.locator('#page .head-actions > a[href^="tel:"]').count() === 0);
await menuBtn.click();
await page.waitForTimeout(200);
const items = page.locator('#page .contact-menu-item');
ok('يفتح قائمة: اتصال · واتساب · سجّل تواصلًا', await items.count() === 3 && (await items.allInnerTexts()).join('|').includes('سجّل تواصلًا'), (await items.allInnerTexts()).join('|'));
const sizes = await items.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
ok('وكل خيارٍ ٤٤', sizes.every((h) => h >= 44), sizes.join(','));
await page.keyboard.press('Escape');
await page.mouse.click(5, 5);
await page.waitForTimeout(200);
ok('والنقر خارجها يغلقها', await page.locator('#page .contact-menu-list').isHidden());
await go('#/clients');
await page.locator('#page tbody tr').first().locator('td').nth(4).click();
await page.waitForTimeout(600);
ok('وفي نافذة التفاصيل الزرُّ نفسه', await page.locator('.modal .contact-menu-btn').count() === 1);
await page.locator('.modal .contact-menu-btn').click();
await page.locator('.modal .contact-menu-item:has-text("سجّل تواصلًا")').click();
await page.waitForTimeout(300);
ok('و«سجّل تواصلًا» يضع المؤشّر في استمارة السجلّ', await page.evaluate(() => document.activeElement?.tagName === 'SELECT' && !!document.activeElement.closest('.modal')));
await page.keyboard.press('Escape');

console.log('--- ٣١: بطاقة المشاركة ---');
const propId = await page.evaluate(async () => (await (await import('/js/data/repository.js')).repo.properties.list()).find((p) => p.price)?.id);
await go(`#/property/${propId}`);
const cardBtn = page.locator('#page button:has-text("بطاقة مشاركة")');
ok('في ملفّ العقار زرّ «بطاقة مشاركة»', await cardBtn.count() === 1);
await cardBtn.click();
await page.waitForTimeout(1500);
const preview = page.locator('.modal .share-card-preview');
const dims = await preview.evaluate((img) => ({ w: img.naturalWidth, h: img.naturalHeight, src: img.src.slice(0, 22) }));
ok('تُرسم صورةٌ ١٠٨٠×١٠٨٠', dims.w === 1080 && dims.h === 1080 && dims.src.startsWith('data:image/png'), JSON.stringify(dims));
const text = await page.locator('.modal .share-card-text').inputValue();
ok('ونصٌّ مرافق فيه السعر والمكان', /ريال|عند الطلب/.test(text) && /الرياض/.test(text), text.replace(/\n/g, ' | ').slice(0, 80));
ok('وأزرار: شارك · حمّل الصورة · انسخ النصّ', await page.locator('.modal button:has-text("حمّل الصورة")').count() === 1 && await page.locator('.modal button:has-text("انسخ النصّ")').count() === 1 && await page.locator('.modal button:has-text("شارك")').count() === 1);
await page.locator('.modal button:has-text("انسخ النصّ")').click();
await page.waitForTimeout(200);
ok('و«انسخ النصّ» ينسخه', (await page.evaluate(() => navigator.clipboard.readText().catch(() => ''))) === text);
// البطاقة ليست فارغة: بكسلاتٌ ملوّنة في الأعلى (الصورة أو خلفيتها) والأسفل (النصّ)
const painted = await page.evaluate(async () => {
  const { drawShareCard } = await import('/js/util/share-card.js');
  const { repo } = await import('/js/data/repository.js');
  const { getLists, getCompany } = await import('/js/data/settings.js');
  const p = (await repo.properties.list()).find((x) => x.price);
  const c = await drawShareCard({ property: p, lists: await getLists(), company: await getCompany() });
  const ctx2 = c.getContext('2d');
  const sample = (x, y) => [...ctx2.getImageData(x, y, 1, 1).data].slice(0, 3).join(',');
  const dark = (x, y) => { const [r, g, b2] = ctx2.getImageData(x, y, 1, 1).data; return r + g + b2 < 300; };
  let inkPixels = 0;
  const d = ctx2.getImageData(0, 660, 1080, 420).data;
  for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] < 300) inkPixels++;
  return { top: sample(10, 10), inkPixels, darkStrip: dark(540, 640) };
});
ok('والنصّ مرسومٌ فعلًا في الجزء السفلي', painted.inkPixels > 2000, JSON.stringify(painted));
await page.keyboard.press('Escape');

ok('بلا أخطاء صفحة', !errors.length, errors.slice(0, 3).join(' | '));
await b.close();
