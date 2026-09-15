// المرحلة ٣٨ — ختم الصور: الشعارات، والأنماط، والدفعة، والاحتفاظ، وجلب الروابط.
import { chromium } from './pw.mjs';
const BASE = process.env.TEST_URL || 'http://127.0.0.1:8235';
const b = await chromium.launch();
const page = await (await b.newContext({ locale: 'ar-SA' })).newPage();
const errors = [];
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
page.on('console', m => { const t = m.text(); if (m.type() === 'error' && !t.includes('ERR_') && !t.includes('Failed to load resource')) errors.push(t); });
const ok = (n, c, x = '') => console.log(`${c ? 'PASS' : 'FAIL'} — ${n}${x ? ' :: ' + x : ''}`);

await page.goto(BASE + '/');
await page.waitForTimeout(2000);

// صورةٌ وشعارٌ نصنعهما في المتصفّح — لا ملفّات على القرص تعتمد عليها الحزمة
await page.addInitScript(() => {
  window.__makeFile = async (name, w, h, color, type = 'image/png') => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const x = c.getContext('2d');
    x.fillStyle = color; x.fillRect(0, 0, w, h);
    const blob = await new Promise((r) => c.toBlob(r, type));
    return new File([blob], name, { type });
  };
});
await page.reload();
await page.waitForTimeout(2000);
await page.evaluate(() => { location.hash = '#/stamp'; });
await page.waitForTimeout(1400);

/* ===== الصفحة تفتح ===== */
console.log('\n--- ٣٨. الصفحة ---');
ok('الصفحة تفتح بأقسامها', (await page.locator('#page .panel').count()) >= 5, String(await page.locator('#page .panel').count()));
ok('وتقول إنّ الأصل لا يُمسّ', (await page.locator('#page').innerText()).includes('الأصل'));

/* ===== الشعارات: تُضاف وتبقى وتُحذف ===== */
console.log('\n--- ٣٨. الشعارات ---');
const addLogo = async (name, color) => page.evaluate(async ([n, c]) => {
  const { addLogo: add } = await import('/js/data/stamp.js');
  const f = await window.__makeFile(n, 200, 80, c);
  return (await add(f, n)).id;
}, [name, color]);
await addLogo('شعار أحمر', '#c0392b');
await addLogo('شعار أزرق', '#1d63b8');
await page.evaluate(() => { location.hash = '#/clients'; });
await page.waitForTimeout(300);
await page.evaluate(() => { location.hash = '#/stamp'; });
await page.waitForTimeout(1200);
ok('الشعاران ظهرا', await page.locator('.logo-tile').count() === 2, String(await page.locator('.logo-tile').count()));

await page.reload();
await page.waitForTimeout(2200);
await page.evaluate(() => { location.hash = '#/stamp'; });
await page.waitForTimeout(1400);
ok('والشعارات تبقى بعد إعادة التحميل (محفوظة لا في الذاكرة)', await page.locator('.logo-tile').count() === 2);

/* ===== الأنماط: أكثر من واحد على الصورة نفسها ===== */
console.log('\n--- ٣٨. الأنماط ---');
ok('يبدأ بنمطٍ واحد', await page.locator('.stamp-pattern').count() === 1);
await page.locator('button:has-text("+ نمط آخر")').click();
await page.waitForTimeout(400);
ok('«+ نمط آخر» يضيف ثانيًا (وسطٌ كبير وزاويةٌ صغيرة)', await page.locator('.stamp-pattern').count() === 2);
const posOptions = await page.locator('.stamp-pattern').first().locator('select').nth(1).locator('option').count();
ok('المواضع تشمل الوسط والزوايا والتكرار', posOptions >= 6, String(posOptions));

/* ===== الختم يغيّر البكسلات فعلًا ===== */
console.log('\n--- ٣٨. الختم نفسه ---');
const result = await page.evaluate(async () => {
  const { stampImage } = await import('/js/util/watermark.js');
  const base = await window.__makeFile('صورة.jpg', 600, 400, '#ffffff', 'image/jpeg');
  const logo = await window.__makeFile('شعار.png', 200, 80, '#000000');
  const logos = new Map([['L', logo]]);
  const read = async (blob) => {
    const bmp = await createImageBitmap(blob);
    const c = document.createElement('canvas');
    c.width = bmp.width; c.height = bmp.height;
    const x = c.getContext('2d');
    x.drawImage(bmp, 0, 0);
    const px = (px1, py1) => [...x.getImageData(px1, py1, 1, 1).data].slice(0, 3);
    return { w: bmp.width, h: bmp.height, center: px(300, 200), topRight: px(560, 20) };
  };
  const plain = await read(base);
  const centered = await stampImage(base, [{ logoId: 'L', position: 'center', sizePct: 40, opacity: 1, marginPct: 3 }], logos);
  const afterCenter = await read(centered.blob);
  const corner = await stampImage(base, [{ logoId: 'L', position: 'top-start', sizePct: 15, opacity: 1, marginPct: 2 }], logos);
  const afterCorner = await read(corner.blob);
  const faint = await stampImage(base, [{ logoId: 'L', position: 'center', sizePct: 40, opacity: 0.1, marginPct: 3 }], logos);
  const afterFaint = await read(faint.blob);
  const both = await stampImage(base, [
    { logoId: 'L', position: 'center', sizePct: 40, opacity: 1, marginPct: 3 },
    { logoId: 'L', position: 'top-start', sizePct: 15, opacity: 1, marginPct: 2 },
  ], logos);
  const afterBoth = await read(both.blob);
  return { plain, afterCenter, afterCorner, afterFaint, afterBoth, baseSize: base.size, outSize: centered.blob.size };
});
ok('الأصل أبيض في وسطه', result.plain.center[0] > 240, JSON.stringify(result.plain.center));
ok('الختم في الوسط يُسوّد الوسط', result.afterCenter.center[0] < 60, JSON.stringify(result.afterCenter.center));
ok('ولا يمسّ الزاوية', result.afterCenter.topRight[0] > 240, JSON.stringify(result.afterCenter.topRight));
ok('وختم الزاوية يُسوّد الزاوية (أعلى اليمين يمينٌ فعلًا)', result.afterCorner.topRight[0] < 60, JSON.stringify(result.afterCorner.topRight));
ok('ويترك الوسط أبيض', result.afterCorner.center[0] > 240, JSON.stringify(result.afterCorner.center));
ok('الشفافية تُفتّح الختم لا تُلغيه', result.afterFaint.center[0] > 180 && result.afterFaint.center[0] < 250, JSON.stringify(result.afterFaint.center));
ok('نمطان معًا يختمان الموضعين', result.afterBoth.center[0] < 60 && result.afterBoth.topRight[0] < 60,
  JSON.stringify([result.afterBoth.center, result.afterBoth.topRight]));
ok('الأبعاد لا تتغيّر', result.afterCenter.w === 600 && result.afterCenter.h === 400, `${result.afterCenter.w}×${result.afterCenter.h}`);

/* ===== الحجم بالنسبة لا بالبكسل ===== */
const scaling = await page.evaluate(async () => {
  const { stampImage } = await import('/js/util/watermark.js');
  const logo = await window.__makeFile('شعار.png', 200, 80, '#000000');
  const logos = new Map([['L', logo]]);
  const measure = async (w, h) => {
    const base = await window.__makeFile('b.jpg', w, h, '#ffffff', 'image/jpeg');
    const out = await stampImage(base, [{ logoId: 'L', position: 'center', sizePct: 20, opacity: 1, marginPct: 0 }], logos);
    const bmp = await createImageBitmap(out.blob);
    const c = document.createElement('canvas');
    c.width = bmp.width; c.height = bmp.height;
    const x = c.getContext('2d');
    x.drawImage(bmp, 0, 0);
    // نقيس عرض السواد على الخطّ الأفقيّ المارّ بالمركز
    const row = x.getImageData(0, Math.round(h / 2), w, 1).data;
    let dark = 0;
    for (let i = 0; i < w; i++) if (row[i * 4] < 80) dark++;
    return dark / w;
  };
  return { small: await measure(400, 300), big: await measure(1600, 1200) };
});
ok('نسبة الختم من عرض الصورة واحدة في الصغيرة والكبيرة',
  Math.abs(scaling.small - scaling.big) < 0.03 && scaling.small > 0.15,
  `${scaling.small.toFixed(3)} ≈ ${scaling.big.toFixed(3)}`);

/* ===== الدفعة والاحتفاظ ===== */
console.log('\n--- ٣٨. الدفعة والاحتفاظ ---');
const batch = await page.evaluate(async () => {
  const { stampImage } = await import('/js/util/watermark.js');
  const { saveStamped, listStamped, sweepExpired, keepForever } = await import('/js/data/stamp.js');
  const logo = await window.__makeFile('شعار.png', 200, 80, '#000000');
  const logos = new Map([['L', logo]]);
  const pattern = [{ logoId: 'L', position: 'center', sizePct: 20, opacity: 1, marginPct: 3 }];
  // ثلاثون صورةً دفعةً واحدة — هذا هو الاستعمال الحقيقي
  const t0 = performance.now();
  for (let i = 0; i < 30; i++) {
    const f = await window.__makeFile(`دفعة-${i}.jpg`, 800, 600, '#ffffff', 'image/jpeg');
    const out = await stampImage(f, pattern, logos);
    await saveStamped(out.blob, { width: out.width, height: out.height, retention: i < 20 ? '3' : 'forever', originalName: f.name });
  }
  const ms = Math.round(performance.now() - t0);
  const all = await listStamped();
  const temp = all.filter((r) => r.expiresAt);
  const perm = all.filter((r) => !r.expiresAt);
  // الكنس لا يمسّ ما لم ينتهِ أجله
  const sweptNow = await sweepExpired();
  // ثم نُقدّم الزمن أربعة أيام
  const later = await sweepExpired(Date.now() + 4 * 86400000);
  const afterSweep = await listStamped();
  const pinned = perm[0]?.id;
  if (pinned) await keepForever(pinned);
  return { ms, total: all.length, temp: temp.length, perm: perm.length, sweptNow, later, left: afterSweep.length };
});
ok('ثلاثون صورةً تُختم وتُحفظ دفعةً واحدة', batch.total === 30, String(batch.total));
ok('وفي زمنٍ معقول (أقلّ من ٣٠ ثانية)', batch.ms < 30000, `${batch.ms} مللي ثانية`);
ok('عشرون مؤقّتة وعشرٌ دائمة كما اختير', batch.temp === 20 && batch.perm === 10, `${batch.temp} + ${batch.perm}`);
ok('الكنس اليوم لا يحذف شيئًا (الأجل لم ينتهِ)', batch.sweptNow === 0, String(batch.sweptNow));
ok('وبعد أربعة أيام يُحذف المؤقّت وحده', batch.later === 20 && batch.left === 10, `حُذف ${batch.later} · بقي ${batch.left}`);

/* ===== حذف الشعار لا يُتلف ما خُتم به ===== */
console.log('\n--- ٣٨. حذف الشعار ===');
const afterLogoDelete = await page.evaluate(async () => {
  const { getLogos, removeLogo, listStamped } = await import('/js/data/stamp.js');
  const logos = await getLogos();
  const before = (await listStamped()).length;
  await removeLogo(logos[0].id);
  return { before, after: (await listStamped()).length, logosLeft: (await getLogos()).length };
});
ok('حذف الشعار لا يحذف صورةً واحدة مختومة به', afterLogoDelete.before === afterLogoDelete.after,
  `${afterLogoDelete.before} → ${afterLogoDelete.after}`);
ok('والشعار نفسه حُذف', afterLogoDelete.logosLeft === 1, String(afterLogoDelete.logosLeft));

console.log('\n' + (errors.length ? 'FAIL — أخطاء وحدة التحكّم :: ' + errors.join(' | ') : 'PASS — لا أخطاء في وحدة التحكّم'));
await b.close();
