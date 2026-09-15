// المرحلة ٣٨ — إدارة الأملاك في المتصفّح: الوسم في النموذج، والفرز، والصفحة.
import { chromium } from './pw.mjs';
const BASE = process.env.TEST_URL || 'http://127.0.0.1:8235';
const b = await chromium.launch();
const page = await (await b.newContext({ locale: 'ar-SA' })).newPage();
const errors = [];
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
page.on('console', m => { const t = m.text(); if (m.type() === 'error' && !t.includes('ERR_') && !t.includes('Failed to load resource')) errors.push(t); });
const ok = (n, c, x = '') => console.log(`${c ? 'PASS' : 'FAIL'} — ${n}${x ? ' :: ' + x : ''}`);

await page.goto(BASE + '/');
await page.waitForTimeout(2200);

/* الصفحة فارغةٌ ابتداءً وتقول كيف تبدأ */
await page.evaluate(() => { location.hash = '#/management'; });
await page.waitForTimeout(1200);
console.log('\n--- ٣٨. الصفحة قبل أي عقد ---');
ok('تبدأ فارغةً وتقول ماذا تفعل', (await page.locator('#page .empty').count()) === 1
  && (await page.locator('#page .empty').innerText()).includes('تحت إدارتنا'), (await page.locator('#page .empty').innerText()).slice(0, 60));

/* الخيار في نموذج العقار */
console.log('\n--- ٣٨. الخيار عند إضافة عقار ---');
await page.evaluate(() => { location.hash = '#/properties'; });
await page.waitForTimeout(1200);
await page.locator('#page .page-head .btn-primary').click();
await page.waitForTimeout(800);
const modal = page.locator('.modal').last();
ok('النموذج فيه قسم إدارة الأملاك', (await modal.innerText()).includes('إدارة الأملاك'));
const mgmtCheck = modal.locator('label:has-text("هذا العقار تحت إدارتنا") input[type="checkbox"]');
ok('وفيه مربّع اختيار واحد', await mgmtCheck.count() === 1);
const feeFieldsHidden = await modal.locator('label:has-text("بداية عقد الإدارة")').isHidden();
ok('وحقول العقد مخفيّة حتى يُؤشَّر عليه (لا يُثقَل من لا يُدير شيئًا)', feeFieldsHidden);
await mgmtCheck.check();
await page.waitForTimeout(300);
ok('والتأشير يُظهرها', await modal.locator('label:has-text("بداية عقد الإدارة")').isVisible());
await page.keyboard.press('Escape');
await page.waitForTimeout(500);

/* عقاران: واحد تحت الإدارة وآخر لا */
await page.evaluate(async () => {
  const { repo } = await import('/js/data/repository.js');
  const day = 86400000;
  const managed = await repo.properties.create({
    type: 'apartment', city: 'الرياض', district: 'الوادي', captureStatus: 'approved',
    purposes: ['rent'], status: 'agreed', price: 60000,
    management: { active: true, feeType: 'percent', feeValue: 5, endAt: new Date(Date.now() + 10 * day).toISOString() },
  });
  const owner = await repo.clients.create({ name: 'مالك مُدار', phone: '0551110001' });
  const tenant = await repo.clients.create({ name: 'مستأجر مُدار', phone: '0551110002' });
  await repo.properties.update(managed.id, { ownerId: owner.id });
  await repo.deals.create({
    date: '2026-01-01', finalPrice: 60000, propertyId: managed.id, clientId: tenant.id,
    leaseEndAt: new Date(Date.now() + 200 * day).toISOString(),
    payments: [
      { id: 'a', dueAt: new Date(Date.now() - 10 * day).toISOString(), amount: 15000, paidAt: null },
      { id: 'b', dueAt: new Date(Date.now() + 50 * day).toISOString(), amount: 15000, paidAt: null },
    ],
  });
  await repo.properties.create({
    type: 'land', city: 'الرياض', district: 'الشفا', captureStatus: 'approved',
    purposes: ['sale'], status: 'agreed', price: 900000,
  });
});

/* الفرز في صفحة العقارات */
console.log('\n--- ٣٨. الوسم في الفلاتر والفرز ---');
await page.evaluate(() => { location.hash = '#/clients'; });
await page.waitForTimeout(300);
await page.evaluate(() => { location.hash = '#/properties'; });
await page.waitForTimeout(1400);
const mgmtRow = page.locator('.filter-row').filter({ has: page.locator('.filter-label', { hasText: 'الإدارة' }) }).first();
ok('«الإدارة» صارت مجموعة فرزٍ في صفحة العقارات', await mgmtRow.count() === 1);
const managedChip = mgmtRow.locator('.chip').filter({ hasNotText: 'ليست' }).filter({ hasText: 'تحت إدارتنا' }).first();
ok('وعدد ما تحت الإدارة مكتوبٌ في الوسم', (await managedChip.innerText()).includes('1'), (await managedChip.innerText()).trim());
await managedChip.click();
await page.waitForTimeout(800);
// النصّ يُقرأ من قائمة النتائج وحدها: أسماء الأحياء تظهر في وسوم الفرز على كل حال،
// فقراءة الصفحة كلّها تجعل الفحص يمرّ ولو لم يُفرز شيء.
const listText = await page.locator('#page .grid, #page .table-wrap').first().innerText();
ok('والفرز به يُظهر المُدار وحده', listText.includes('الوادي') && !listText.includes('الشفا'), listText.replace(/\n/g, ' | ').slice(0, 90));
await managedChip.click();
await page.waitForTimeout(600);

/* عمودٌ يُرتَّب به في عرض الجدول */
const tableBtn = page.locator('#page .seg-btn', { hasText: 'جدول' }).first();
if (await tableBtn.count()) { await tableBtn.click(); await page.waitForTimeout(800); }
const headers = await page.locator('#page thead th').allInnerTexts();
ok('وفي الجدول عمودٌ للإدارة يُرتَّب به', headers.some((h) => h.includes('الإدارة')), headers.join(' | '));

/* الصفحة بعد العقد */
console.log('\n--- ٣٨. الصفحة بعد العقد ---');
await page.evaluate(() => { location.hash = '#/management'; });
await page.waitForTimeout(1400);
const mtext = await page.locator('#page').innerText();
ok('العقار المُدار ظهر', mtext.includes('الوادي'));
ok('وغير المُدار لم يظهر', !mtext.includes('الشفا'));
ok('والمالك والمستأجر يظهران', mtext.includes('مالك مُدار') && mtext.includes('مستأجر مُدار'));
ok('والأجر الشهري محسوب (٦٠٠٠٠ × ٥٪ ÷ ١٢ = ٢٥٠)', mtext.includes('250'), mtext.split('\n').find((l) => l.includes('250')) || '—');
ok('وينبّه على العقد المقارب انتهاؤه', mtext.includes('ينتهي بعد'), mtext.split('\n').find((l) => l.includes('ينتهي')) || '—');
ok('وعلى الدفعة المتأخّرة', mtext.includes('متأخّرة'), mtext.split('\n').find((l) => l.includes('متأخّر')) || '—');
ok('والأجر حسّاسٌ كالعمولة: موسومٌ ليُخفى في وضع العرض للعميل',
  await page.locator('#page [data-sensitive]').count() > 0, String(await page.locator('#page [data-sensitive]').count()));

console.log('\n' + (errors.length ? 'FAIL — أخطاء وحدة التحكّم :: ' + errors.join(' | ') : 'PASS — لا أخطاء في وحدة التحكّم'));
await b.close();
