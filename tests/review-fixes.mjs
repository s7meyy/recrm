// المرحلة ٥٧ — ما كشفته المراجعةُ بعين العميل: أعطابُ الشكل الثمانية وأربعةُ الجوّال.
// تُقاس بالبكسل لا بالظنّ: عرضُ القائمة، وارتفاعُ الشريط، ومكانُ الزرّ، وما يُرى وما يُطوى.
import { chromium } from './pw.mjs';
const BASE = process.env.TEST_URL || 'http://127.0.0.1:8235';
const b = await chromium.launch();
const ok = (n, c, x = '') => console.log(`${c ? 'PASS' : 'FAIL'} — ${n}${x ? ' :: ' + x : ''}`);

async function open(viewport) {
  const ctx = await b.newContext({ locale: 'ar-SA', viewport, isMobile: viewport.width < 500, hasTouch: viewport.width < 500 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(BASE + '/');
  await page.waitForTimeout(2400);
  await page.evaluate(async () => {
    const { repo } = await import('/js/data/repository.js');
    if (!(await repo.clients.list()).some((c) => c.name === 'عميل المراجعة')) {
      const c = await repo.clients.create({ name: 'عميل المراجعة', phone: '0500005757', roles: ['seeker'] });
      await repo.requests.create({ clientId: c.id, type: 'villa', purpose: 'sale', city: 'الرياض', districts: ['النرجس'], budgetMax: 1500000, area: 350, status: 'active' });
    }
  });
  const go = async (h) => { await page.evaluate((x) => { location.hash = x; }, h); await page.waitForTimeout(1300); };
  return { page, errors, go };
}

/* ===== الحاسوب ===== */
const d = await open({ width: 1366, height: 900 });

console.log('--- ١: تنبيه الفرص فقرةً ---');
await d.go('#/prospects');
const notice = d.page.locator('#page .notice-prose');
ok('التنبيه صار فقرةً لا صفًّا مرنًا', await notice.count() === 1 && await notice.evaluate((n) => getComputedStyle(n).display) === 'block');
// كان الصفُّ المرن يضع «بابٌ لم يُفتح» في أقصى اليمين و«فأنت مسؤول» في أقصى اليسار من السطر
// نفسه وبينهما فراغٌ عريض؛ والفقرةُ تجعلهما متتاليَين أو في سطرين.
// فيُقاس التصاقُ النصّ الذي يلي «بابٌ لم يُفتح» بها: في الفقرة يبدأ حيث انتهت، وفي الصفّ
// المرن كان عنصرًا مستقلًّا يُرمى إلى الطرف الآخر.
const gap = await notice.evaluate((n) => {
  const strong = n.querySelector('strong');
  const text = strong.nextSibling;
  const r = document.createRange(); r.selectNodeContents(text);
  const a = strong.getBoundingClientRect(); const t = r.getBoundingClientRect();
  return Math.round(Math.abs(a.left - t.right));
});
ok('والنصّ يتلو عنوانه ملتصقًا لا مرميًّا إلى الطرف الآخر', gap < 12, `${gap}px`);

console.log('--- ٣: فلاتر الفواتير في صفٍّ واحد ---');
await d.go('#/invoices');
const bar = d.page.locator('#page .filter-bar');
const widths = await bar.evaluate((n) => [...n.children].map((c) => Math.round(c.getBoundingClientRect().width / n.getBoundingClientRect().width * 100)));
const tops = await bar.evaluate((n) => [...n.children].map((c) => Math.round(c.getBoundingClientRect().top)));
ok('القائمتان بعرضٍ طبيعي لا بعرض الصفحة', widths[1] < 40 && widths[2] < 40, widths.join('%,') + '%');
ok('والثلاثة على سطرٍ واحد', Math.max(...tops) - Math.min(...tops) <= 4, tops.join(','));

console.log('--- ٦: «الإعدادات» الثابت يغطّي ما يمرّ تحته ---');
await d.go('#/today');
const st = d.page.locator('.sidebar-nav a[data-route="settings"]:last-child');
const stStyle = await st.evaluate((n) => { const s = getComputedStyle(n); return { pos: s.position, radius: s.borderTopLeftRadius, bg: s.backgroundColor }; });
ok('ثابتٌ بلا زوايا شفّافة وبخلفيةٍ صلبة', stStyle.pos === 'sticky' && stStyle.radius === '0px' && !/rgba\(0, 0, 0, 0\)|transparent/.test(stStyle.bg), JSON.stringify(stStyle));
// يُمرَّر المِمرُّ حتى يقف رأسُ مجموعةٍ خلف الشريط، ويُفحص أن نقطته العليا لا تُرى
const covered = await d.page.evaluate(() => {
  const nav = document.querySelector('.sidebar-nav');
  const s = document.querySelector('.sidebar-nav a[data-route="settings"]:last-child');
  const groups = [...document.querySelectorAll('.sidebar-nav .nav-group')];
  for (let y = 0; y < nav.scrollHeight; y += 8) {
    nav.scrollTop = y;
    const sr = s.getBoundingClientRect();
    for (const g of groups) {
      const r = g.getBoundingClientRect();
      if (r.top < sr.top && r.bottom > sr.top + 4) {
        const hit = document.elementFromPoint(r.left + r.width / 2, sr.top + 3);
        return { found: true, coveredBySettings: s.contains(hit) || hit === s };
      }
    }
  }
  return { found: false };
});
ok('ورأسُ المجموعة المارّ تحته لا يظهر من خلاله', !covered.found || covered.coveredBySettings, JSON.stringify(covered));

console.log('--- ٨: حقل التاريخ الفارغ يقول «اختر التاريخ» ---');
await d.go('#/invoices');
await d.page.locator('button:has-text("فاتورة جديدة")').click();
await d.page.waitForTimeout(700);
const covers = d.page.locator('.modal .date-cover');
ok('الغطاء موجود على الحقول الفارغة', await covers.count() >= 1, String(await covers.count()));
const due = d.page.locator('.modal .date-cover-wrap').filter({ has: d.page.locator('input:not([value])') }).first();
const dueCover = due.locator('.date-cover');
ok('ونصّه عربي', (await dueCover.textContent()).includes('اختر التاريخ'));
ok('ولا يغطّي حقلًا فيه قيمة', await d.page.locator('.modal .date-cover-wrap').filter({ has: d.page.locator('input[type="date"]') }).first().locator('.date-cover').isHidden()
  || await d.page.locator('.modal input[type="date"]').first().evaluate((i) => !i.value));
await due.locator('input').fill('2026-10-01');
await d.page.waitForTimeout(200);
ok('وبعد الكتابة يزول الغطاء ويظهر الصدى العربي', await dueCover.isHidden() && (await due.evaluate((n) => n.nextElementSibling?.textContent || '')).includes('2026'));
await d.page.keyboard.press('Escape');

console.log('--- ١٨ (حاسوب): أزرار الجوّال لا تُرى، والاسم أوّلًا ---');
await d.go('#/clients');
ok('الاسم هو العمود الأوّل', (await d.page.locator('#page thead th').first().textContent()).trim() === 'الاسم');
ok('وخليّة أزرار الجوّال مخفيّة على الشاشة الواسعة', await d.page.locator('#page td.m-actions').first().isHidden());
ok('والصفّ ما زال يفتح الملفّ بالنقر', await (async () => { await d.page.locator('#page tbody tr').first().locator('td').nth(4).click(); await d.page.waitForTimeout(500); return (await d.page.locator('.modal').count()) === 1; })());
await d.page.keyboard.press('Escape');

/* ===== الجوّال ===== */
const m = await open({ width: 390, height: 844 });

console.log('--- ١٧: شريط النسخة سطرٌ واحد ---');
await m.go('#/today');
const banner = m.page.locator('#backup-banner');
const bh = await banner.evaluate((n) => n.hidden ? 0 : n.getBoundingClientRect().height);
ok('الشريط ظاهرٌ وبارتفاع سطرٍ واحد (< ٦٠ بكسلًا، كان ١٣٠)', bh > 0 && bh < 60, `${Math.round(bh)}px`);
const h1Top = await m.page.locator('#page h1').first().evaluate((n) => n.getBoundingClientRect().top);
ok('وعنوان الصفحة يُرى في أوّل الشاشة', h1Top < 200, `${Math.round(h1Top)}px`);

console.log('--- ١٩: العقارات عمودًا واحدًا ---');
await m.go('#/properties');
const gridInfo = await m.page.locator('#page .grid').first().evaluate((g) => ({ cols: getComputedStyle(g).gridTemplateColumns.split(' ').length, card: g.firstElementChild?.getBoundingClientRect().width, grid: g.getBoundingClientRect().width }));
ok('عمودٌ واحد يملأ العرض', gridInfo.cols === 1 && gridInfo.card > gridInfo.grid * 0.95, JSON.stringify(gridInfo));

console.log('--- ٢٣: الميكروفون في الزاوية ---');
const mic = await m.page.locator('.voice-btn').first().evaluate((n) => { const r = n.getBoundingClientRect(); return { w: r.width, h: r.height, right: innerWidth - r.right, bottom: innerHeight - r.bottom, left: r.left }; });
ok('زرٌّ ٤٤ بكسلًا في الزاوية السفلى لا في منتصف الجانب', mic.w >= 44 && mic.h >= 44 && mic.w <= 46 && mic.bottom < 20 && mic.left < 20, JSON.stringify(mic));

console.log('--- ١٨: بطاقة العميل المضغوطة ---');
await m.go('#/clients');
const row = m.page.locator('#page tbody tr').filter({ hasText: 'عميل المراجعة' }).first();
ok('الأدوار والأولوية مطويّة', await row.locator('td.m-hide').first().isHidden());
const acts = row.locator('td.m-actions .btn');
ok('زرّا اتصال وواتساب ظاهران', await acts.count() === 2 && await acts.first().isVisible());
const sizes = await acts.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
ok('وبحجم الإبهام ٤٤', sizes.every((h) => h >= 44), sizes.join(','));
ok('ورقم الجوال نفسه هدفٌ ٤٤', (await row.locator('.tel').evaluate((e) => e.getBoundingClientRect().height)) >= 44);
const rowH = await row.evaluate((r) => r.getBoundingClientRect().height);
ok('والبطاقة أقصر من ٢٨٠ بكسلًا (كانت ٣٤٠)', rowH < 280, `${Math.round(rowH)}px`);
ok('واسم العميل أوّل ما يُقرأ في البطاقة', (await row.locator('td').first().textContent()).includes('عميل المراجعة'));
await acts.nth(1).click();
await m.page.waitForTimeout(400);
ok('وضغط واتساب لا يفتح ملفّ العميل', await m.page.locator('.modal:has-text("عميل المراجعة")').count() === 0);

console.log('--- ١٨: بطاقة الطلب المضغوطة ---');
await m.go('#/requests');
const rrow = m.page.locator('#page tbody tr').filter({ hasText: 'عميل المراجعة' }).first();
const hidden = await rrow.locator('td.m-hide').evaluateAll((els) => els.map((e) => [e.dataset.label, getComputedStyle(e).display]));
ok('المدينة والمساحة مطويّتان', hidden.length === 2 && hidden.every(([, d]) => d === 'none'), JSON.stringify(hidden));
ok('والأحياء والميزانية والمطابقات باقية', /النرجس/.test(await rrow.innerText()) && /1,500,000/.test(await rrow.innerText()) && /مطابق/.test(await rrow.innerText()));

/* ===== الصفحة العامة: الاستمارة ===== */
console.log('--- ٤ و٥: الاستمارة العامة ---');
const pub = await (await b.newContext({ locale: 'ar-SA', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
await pub.goto(BASE + '/offers/intake.html');
await pub.waitForTimeout(1200);
const sel = pub.locator('#purpose');
const selStyle = await sel.evaluate((n) => { const s = getComputedStyle(n); return { h: n.getBoundingClientRect().height, w: n.getBoundingClientRect().width / n.parentElement.getBoundingClientRect().width, radius: s.borderTopLeftRadius, app: s.appearance }; });
ok('القائمة منسّقة كالحقول: بعرضها وبارتفاع ٤٤ وبلا شكل المتصفّح الخام', selStyle.h >= 44 && selStyle.w > 0.95 && selStyle.radius !== '0px' && selStyle.app === 'none', JSON.stringify(selStyle));
await pub.fill('input[name="name"]', 'زائر المراجعة');
await pub.fill('input[name="phone"]', '0500009999');
await pub.click('#intake-send');
await pub.waitForTimeout(1800);
const done = pub.locator('.lead-done');
ok('بعد الإرسال تختفي الحقول وتظهر بطاقة نجاح', await done.count() === 1 && await pub.locator('#intake-form').isHidden(), (await done.innerText().catch(() => '')).slice(0, 60));
const officePhone = (await pub.locator('#office-contact').textContent()).replace(/\D/g, '');
ok('وفيها اسم المرسل وتصفّح العروض', /زائر المراجعة/.test(await done.innerText()) && await done.locator('a[href="index.html"]').count() === 1, (await done.innerText()).replace(/\n/g, ' | ').slice(0, 80));
// واتساب المكتب يظهر حين يُعرف جوالُه من النشرة — وفي بيئة الاختبار لا نشرةَ فلا زرّ يوهم.
ok('وزرّ واتساب المكتب يتبع وجودَ جواله في النشرة', (await done.locator('a[href*="wa.me"]').count()) === (officePhone ? 1 : 0), officePhone || 'لا جوال في النشرة');
await done.locator('#intake-again').click();
ok('و«طلب آخر» يعيد الاستمارة فارغة', await pub.locator('#intake-form').isVisible() && (await pub.inputValue('input[name="name"]')) === '');

ok('بلا أخطاء صفحة (حاسوب)', !d.errors.length, d.errors.slice(0, 2).join(' | '));
ok('بلا أخطاء صفحة (جوّال)', !m.errors.length, m.errors.slice(0, 2).join(' | '));
await b.close();
