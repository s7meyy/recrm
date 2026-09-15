// اختبار شامل لرابح من طرف إلى طرف: الإدخال ← اللصق ← خط النماذج ← التقرير ← الأرشيف ← الجوال.
//
//   npm i --no-save playwright-core
//   CHROME_PATH=/path/to/chrome node tests/e2e.mjs
//
// يشغّل خادمًا ثابتًا على المنفذ 8099 ويغلقه في النهاية.

import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';

const server = spawn('python3', ['-m', 'http.server', '8099'], { cwd: new URL('..', import.meta.url).pathname, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));

const fails = [];
const ok = (t) => console.log('  ✓', t);
const bad = (t, e) => { fails.push(t + (e ? ' :: ' + e : '')); console.log('  ✗', t, e || ''); };

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
const errors = [];
page.on('console', m => { const t = m.text(); if (m.type() === 'error' && !t.includes('favicon')) errors.push(t); });
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

try {
  await page.goto('http://localhost:8099/', { waitUntil: 'networkidle' });
  console.log('١) الإقلاع');
  await page.waitForFunction(() => document.querySelectorAll('#f-region option').length > 1, null, { timeout: 5000 });
  const regions = await page.$$eval('#f-region option', o => o.length);
  regions === 14 ? ok(`المناطق ${regions - 1}`) : bad('عدد المناطق', regions);

  console.log('٢) التعبئة المتسلسلة');
  await page.selectOption('#f-region', 'riyadh');
  await page.waitForTimeout(100);
  const cities = await page.$$eval('#f-city option', o => o.map(x => x.textContent));
  cities.includes('الرياض') ? ok('مدن المنطقة') : bad('مدن المنطقة', cities.join(','));
  await page.selectOption('#f-city', 'riyadh');
  await page.waitForTimeout(100);
  const d = await page.$$eval('#f-district option', o => o.length);
  d > 50 ? ok(`أحياء الرياض ${d - 1}`) : bad('أحياء الرياض', d);
  await page.selectOption('#f-group', 'food');
  await page.waitForTimeout(100);
  const cats = await page.$$eval('#f-category option', o => o.map(x => x.textContent));
  cats.includes('مقهى / كوفي') ? ok('تصنيفات المجال') : bad('تصنيفات المجال', cats.join(','));

  console.log('٣) التحقق من النموذج');
  await page.click('#btn-start');
  await page.waitForTimeout(200);
  const err1 = await page.textContent('#new-msg');
  err1.includes('رابط') ? ok('يمنع البدء بلا رابط') : bad('التحقق من الرابط', err1);

  await page.fill('#f-url', 'https://www.google.com/maps/place/%D9%85%D9%82%D9%87%D9%89+%D8%A7%D9%84%D8%AF%D8%B1%D8%A8/@24.7136,46.6753,17z');
  await page.selectOption('#f-category', 'cafe');
  await page.selectOption('#f-district', 'الملقا');
  await page.waitForTimeout(600);
  await page.click('#btn-start');
  await page.waitForTimeout(500);
  (await page.isVisible('#view-data')) ? ok('الانتقال لشاشة البيانات') : bad('الانتقال لشاشة البيانات');
  const nm = await page.inputValue('#d-name');
  nm === 'مقهى الدرب' ? ok('استخراج الاسم من الرابط') : bad('استخراج الاسم', nm);

  console.log('٤) لصق التعليقات');
  const paste = `5 | أحمد الشمري | قبل شهر
القهوة ممتازة والباريستا محترف جدًا، والمكان هادئ للعمل.
رد المالك: شكرًا لك أحمد، نسعد بزيارتك
---
2 | نورة القحطاني | قبل أسبوعين
انتظرت ٢٥ دقيقة على طلب بسيط، والموظف لم يعتذر.
---
4 | فهد | قبل ٣ أشهر
المكان جميل والأسعار معقولة لكن المواقف قليلة جدًا.
---
1 | سارة | قبل شهرين
الطلب وصل بارد والخدمة سيئة، لن أعيد التجربة.
---
5 | خالد العتيبي | قبل أسبوع
أفضل كوفي في الحي، الحلى طازج والجلسات مريحة.
---
3 | ريم | قبل ٤ أشهر
عادي، لا مميز ولا سيئ. الأسعار مرتفعة قليلًا.
---
5 | عبدالله | قبل شهر
خدمة سريعة وقهوة ممتازة، أنصح به.
---
2 | منى | قبل ٣ أسابيع
ازدحام شديد وقت المساء والانتظار طويل.
---
4 | ماجد | قبل ٥ أشهر
جيد جدًا لكن الإنترنت ضعيف.
---
5 | هند | قبل أسبوعين
المكان نظيف والموظفون لطفاء.`;
  await page.fill('#d-reviews', paste);
  await page.click('#btn-parse');
  await page.waitForTimeout(300);
  const info = await page.textContent('#parse-info');
  info.includes('10') ? ok('استُخرجت ١٠ تعليقات: ' + info) : bad('عدد التعليقات', info);
  const st = await page.$$eval('#parse-stats .stat', n => n.map(x => x.textContent));
  st.length >= 6 ? ok('الإحصاءات: ' + st.slice(0, 3).join(' | ')) : bad('الإحصاءات', st.join(','));

  await page.fill('#d-avg', '4.2');
  await page.fill('#d-count', '310');
  await page.waitForTimeout(150);

  console.log('٥) خط النماذج');
  await page.click('#btn-to-pipeline');
  await page.waitForTimeout(400);
  (await page.isVisible('#view-pipeline')) ? ok('الانتقال لخط التحليل') : bad('الانتقال لخط التحليل');
  const steps = await page.$$eval('.step', n => n.length);
  steps === 8 ? ok('ثماني خطوات') : bad('عدد الخطوات', steps);
  const heads = await page.$$eval('.stage-head', n => n.length);
  heads === 4 ? ok('أربع مراحل') : bad('عدد المراحل', heads);

  // عرض رسالة الخطوة الأولى
  const step0 = page.locator('.step').nth(0);
  (await step0.getAttribute('data-open')) === '1' ? ok('الخطوة الأولى مفتوحة تلقائيًا') : bad('فتح الخطوة الأولى');
  await step0.getByText('عرض الرسالة').click();
  await page.waitForTimeout(250);
  const prompt = await step0.locator('pre.prompt').textContent();
  const checks = [['الميثاق', 'قواعد مُلزِمة'], ['الإحصاءات', 'الإحصاءات المحسوبة'], ['المعرّفات', '[R001]'], ['التعليقات', 'الباريستا']];
  for (const [n, needle] of checks) prompt.includes(needle) ? ok(`الرسالة تحوي ${n}`) : bad(`الرسالة تحوي ${n}`);
  prompt.includes('4.2') ? ok('المتوسط في الرسالة') : bad('المتوسط في الرسالة');

  console.log('٦) ملء الخطوات الثماني');
  for (const k of ['n1','n2','n3','nm','a1','a2','a3','am']) {
    await page.evaluate((key) => {
      const ta = document.querySelector('#out-' + key);
      ta.value = '# الخلاصة التنفيذية\nالمنشأة قوية في جودة القهوة (R001، R005، R007) وتعاني من بطء الخدمة (R002، R008).\n\n## تفصيل القوة\nجودة الطعم متكررة.\n\n# نقاط الضعف\n- بطء الخدمة وقت الذروة (R002، R008)\n- ضعف الإنترنت (R009)\n\n| المحور | الحكم |\n|---|---|\n| الجودة | قوي |\n| الانتظار | ضعيف |\n\n> «انتظرت ٢٥ دقيقة على طلب بسيط» (R002)\n';
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    }, k);
  }
  await page.waitForTimeout(300);
  const prog = await page.textContent('#pipeline-progress');
  prog.includes('8 من 8') ? ok('اكتملت الخطوات: ' + prog) : bad('تقدّم الخطوات', prog);

  console.log('٧) التقرير');
  await page.click('#btn-to-report');
  await page.waitForTimeout(600);
  (await page.isVisible('#view-report')) ? ok('الانتقال للتقرير') : bad('الانتقال للتقرير');
  const frame = page.frameLocator('#r-frame');
  const h1 = await frame.locator('h1').first().textContent();
  h1.includes('مقهى الدرب') ? ok('غلاف التقرير: ' + h1.replace(/\s+/g,' ').trim()) : bad('الغلاف', h1);
  const bars = await frame.locator('.bar-row').count();
  bars === 5 ? ok('أشرطة توزيع النجوم') : bad('الأشرطة', bars);
  const toc = await frame.locator('.toc li').count();
  toc >= 2 ? ok(`الفهرس (${toc} عناصر)`) : bad('الفهرس', toc);
  const h3 = await frame.locator('.body h3').count();
  h3 >= 1 ? ok('العناوين الفرعية مرقّمة') : bad('العناوين الفرعية', h3);
  const tbl = await frame.locator('table').count();
  tbl >= 1 ? ok('الجدول') : bad('الجدول', tbl);
  const rid = await frame.locator('.rid').count();
  rid >= 4 ? ok(`معرّفات التعليقات مُبرَزة (${rid})`) : bad('المعرّفات', rid);
  const dir = await frame.locator('html').getAttribute('dir');
  dir === 'rtl' ? ok('اتجاه RTL') : bad('الاتجاه', dir);

  console.log('٨) الأرشيف والاستعادة');
  await page.click('[data-go="archive"]');
  await page.waitForTimeout(500);
  const tree = await page.textContent('#archive-tree');
  ['منطقة الرياض','الرياض','مقهى','الملقا','مقهى الدرب'].every(s => tree.includes(s))
    ? ok('شجرة الأرشيف كاملة') : bad('شجرة الأرشيف', tree.slice(0,200));
  (tree.includes('تقرير جاهز')) ? ok('وسم التقرير الجاهز') : bad('وسم التقرير');

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  const after = await page.frameLocator('#r-frame').locator('h1').first().textContent().catch(() => '');
  after.includes('مقهى الدرب') ? ok('استُعيدت الحالة بعد إعادة التحميل') : bad('الاستعادة', after);

  console.log('٩) الجوال (390px)');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  overflow <= 1 ? ok('لا فيض أفقي') : bad('فيض أفقي', overflow + 'px');

} catch (e) {
  bad('استثناء', e.message);
}

if (errors.length) { console.log('\nأخطاء الطرفية:'); errors.forEach(e => console.log('  !', e)); }
console.log('\n' + (fails.length ? `فشل ${fails.length}:\n` + fails.map(f => ' - ' + f).join('\n') : '✅ نجحت كل الاختبارات'));
await browser.close();
server.kill();
process.exit(fails.length || errors.length ? 1 : 0);
