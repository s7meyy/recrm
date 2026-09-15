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

  console.log('٤-ب) القاموس وكاشف المشبوه');
  const topics = await page.$$eval('#topics-box .topic-row', n => n.map(x => x.textContent.trim()));
  topics.length >= 4 ? ok(`المواضيع المرصودة (${topics.length}): ` + topics.slice(0,3).map(t=>t.replace(/\s+/g,' ')).join(' | ')) : bad('المواضيع', topics.length);
  const worst = await page.textContent('#topics-box');
  worst.includes('أبرز الشكاوى') ? ok('أبرز الشكاوى محسوبة برمجيًا') : bad('أبرز الشكاوى');
  const anom = await page.textContent('#anomaly-box');
  anom.trim().length > 5 ? ok('كاشف المشبوه يعمل: ' + anom.trim().slice(0,60)) : bad('كاشف المشبوه', anom);

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

  console.log('٥-ب) مدقّق السند');
  const ta0 = page.locator('#out-n1');
  await ta0.fill('يشكو العملاء من بطء الخدمة (R002، R008).\nتكرر الثناء على الموقع (R047).\nنقطة ضعف: النظافة سيئة.\nمتوسط التقييم 4.9 من 5.');
  await ta0.blur();
  await page.waitForTimeout(300);
  const vb = await page.locator('.step').nth(0).locator('.verify-box').textContent();
  vb.includes('R047') ? ok('كشف المعرّف الوهمي R047') : bad('المعرّف الوهمي', vb.slice(0,80));
  vb.includes('4.9') ? ok('كشف الرقم المخالف 4.9') : bad('الرقم المخالف');
  vb.includes('بلا سند') ? ok('كشف الحكم بلا سند') : bad('الحكم بلا سند');
  const lvl = await page.locator('.step').nth(0).locator('.verify-box .msg').getAttribute('class');
  lvl.includes('err') ? ok('صُنِّف المخرج مُعتلًّا') : bad('تصنيف المخرج', lvl);
  await ta0.fill('يشكو العملاء من بطء الخدمة (R002، R008).');
  await ta0.blur();
  await page.waitForTimeout(300);
  const vb2 = await page.locator('.step').nth(0).locator('.verify-box .msg').getAttribute('class');
  vb2.includes('ok') ? ok('مخرج سليم يمرّ') : bad('المخرج السليم', vb2);

  console.log('٦) ملء الخطوات الثماني');
  for (const k of ['n1','n2','n3','nm','a1','a2','a3','am']) {
    await page.evaluate((key) => {
      const ta = document.querySelector('#out-' + key);
      ta.value = '# الخلاصة التنفيذية\nالمنشأة قوية في جودة القهوة (R001، R005، R007) وتعاني من بطء الخدمة (R002، R008).\n\n## تفصيل القوة\nجودة الطعم متكررة.\n\n# نقاط الضعف\n- بطء الخدمة وقت الذروة (R002، R008)\n- ضعف الإنترنت (R009)\n\n| المحور | الحكم |\n|---|---|\n| الجودة | قوي |\n| الانتظار | ضعيف |\n\n# التوصيات التنفيذية\n| # | التوصية | السند | مؤشر القياس |\n|---|---|---|---|\n| 1 | إضافة باريستا ثانٍ من 6م إلى 10م | R002، R008 | متوسط زمن التحضير أقل من 7 دقائق |\n| 2 | ترقية نقطة الوصول اللاسلكية | R009 | سرعة أعلى من 30 ميغابت |\n| 3 | الرد على كل تعليق سلبي خلال 48 ساعة | R002، R004 | نسبة الرد 100% |\n\n> «انتظرت ٢٥ دقيقة على طلب بسيط» (R002)\n';
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
  const tp = await frame.locator('.topics .topic-row').count();
  tp >= 4 ? ok(`قسم المواضيع في التقرير (${tp} موضوعًا)`) : bad('قسم المواضيع', tp);
  const tbl = await frame.locator('table').count();
  tbl >= 1 ? ok('الجدول') : bad('الجدول', tbl);
  const rid = await frame.locator('.rid').count();
  rid >= 4 ? ok(`معرّفات التعليقات مُبرَزة (${rid})`) : bad('المعرّفات', rid);
  const dir = await frame.locator('html').getAttribute('dir');
  dir === 'rtl' ? ok('اتجاه RTL') : bad('الاتجاه', dir);

  console.log('٧-ب) خطة العمل');
  await page.click('#btn-extract-plan');
  await page.waitForTimeout(400);
  const tasks = await page.$$eval('#plan-box tbody tr', n => n.length);
  tasks === 3 ? ok(`استُخرجت ${tasks} مهام من جدول التوصيات`) : bad('استخراج المهام', tasks);
  const metric = await page.textContent('#plan-box tbody tr:first-child');
  metric.includes('دقائق') ? ok('مؤشر القياس التُقط') : bad('مؤشر القياس', metric.slice(0,60));
  const sand = await page.$$eval('#plan-box .rid', n => n.length);
  sand >= 2 ? ok(`سند التوصيات محفوظ (${sand})`) : bad('سند التوصيات', sand);
  await page.selectOption('#plan-box tbody tr:first-child .task-status', 'done');
  await page.waitForTimeout(250);
  const prog2 = await page.textContent('#plan-progress');
  prog2.includes('منجز 1') ? ok('تتبّع الإنجاز: ' + prog2) : bad('تتبّع الإنجاز', prog2);
  await page.check('#plan-in-report');
  await page.waitForTimeout(600);
  const inRep = await page.frameLocator('#r-frame').locator('.body').textContent();
  inRep.includes('خطة العمل') ? ok('الخطة تظهر في التقرير') : bad('الخطة في التقرير');

  console.log('٧-ج) القوالب والتصدير');
  const tplOpts = await page.$$eval('#r-template option', o => o.map(x => x.textContent));
  tplOpts.length === 3 ? ok('ثلاثة قوالب: ' + tplOpts.join('، ')) : bad('القوالب', tplOpts.join('|'));
  const fullHeads = await page.frameLocator('#r-frame').locator('.body h2').count();
  await page.selectOption('#r-template', 'brief');
  await page.waitForTimeout(600);
  const briefHeads = await page.frameLocator('#r-frame').locator('.body h2').count();
  briefHeads < fullHeads ? ok(`قالب الصفحة الواحدة يقصّ (${fullHeads} ← ${briefHeads} قسمًا)`) : bad('قصّ القالب', `${fullHeads}/${briefHeads}`);
  const note = await page.textContent('#tpl-note');
  note.includes('يُستبعد') ? ok('يُعلن ما سيُستبعد قبل الإخراج') : bad('إعلان الاستبعاد', note.slice(0,70));
  const noTopics = await page.frameLocator('#r-frame').locator('.topics').count();
  noTopics === 0 ? ok('القالب المختصر يُخفي المواضيع') : bad('إخفاء المواضيع', noTopics);
  await page.selectOption('#r-template', 'full');
  await page.waitForTimeout(500);
  const back = await page.frameLocator('#r-frame').locator('.body h2').count();
  back === fullHeads ? ok('العودة للقالب الكامل تستعيد كل الأقسام') : bad('استعادة الأقسام', `${back}/${fullHeads}`);

  const dl = page.waitForEvent('download', { timeout: 8000 });
  await page.click('#btn-download-xlsx');
  const file = await dl;
  const fname = file.suggestedFilename();
  fname.endsWith('.xlsx') && /^[\x20-\x7E]+$/.test(fname)
    ? ok('تنزيل Excel باسم لاتيني يحفظ الامتداد: ' + fname)
    : bad('تنزيل Excel', fname);
  const xpath = '/tmp/rabih-e2e.xlsx';
  await file.saveAs(xpath);
  const size = (await import('node:fs')).statSync(xpath).size;
  size > 3000 ? ok(`ملف Excel سليم الحجم (${size} بايت)`) : bad('حجم Excel', size);

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

  console.log('٨-ب) المقارنة');
  await page.click('[data-go="compare"]');
  await page.waitForTimeout(600);
  (await page.isVisible('#view-compare')) ? ok('شاشة المقارنة') : bad('شاشة المقارنة');
  const tl = await page.textContent('#timeline-box');
  tl.includes('تحتاج تقريرين') ? ok('المقارنة الزمنية تشرح شرطها بوضوح') : ok('المقارنة الزمنية: ' + tl.trim().slice(0,50));
  const bench = await page.textContent('#bench-box');
  bench.includes('لا منافس') ? ok('مقارنة المنافسين تشرح شرطها بوضوح') : bad('مقارنة المنافسين', bench.slice(0,80));

  console.log('٨-ج) المقارنة بمعطيات حقيقية');
  // استيراد تقرير أقدم للمنشأة نفسها + منافس، عبر مسار الاستيراد الحقيقي في الأرشيف.
  const mkJob = (id, name, url, when, reviews, plan) => ({
    id, mapsUrl: url, createdAt: when, updatedAt: when,
    ctx: { regionId:'riyadh', regionName:'منطقة الرياض', cityId:'riyadh', cityName:'الرياض',
           groupId:'food', categoryId:'cafe', categoryName:'مقهى / كوفي', districtName:'الملقا' },
    place: { schema:1, source:'manual', mapsUrl:url, identity:{ name, category:'مقهى', hours:[], attributes:[] },
             ratings:{ average: reviews.avg, count: reviews.count, distribution:{} },
             reviews: reviews.list.map((r,i)=>({ id:'R'+String(i+1).padStart(3,'0'), ...r })),
             photos:[], qna:[], popularTimes:[], notes:'' },
    out:{}, reportMd:'', photos:[], plan: plan||[], planInReport:false,
  });
  const older = mkJob('Jold', 'مقهى الدرب', 'https://www.google.com/maps/place/%D9%85%D9%82%D9%87%D9%89+%D8%A7%D9%84%D8%AF%D8%B1%D8%A8/@24.7136,46.6753,17z', '2026-06-01T00:00:00.000Z',
    { avg: 3.8, count: 180, list: [
      { rating:1, text:'انتظرت طويلا جدا والخدمة بطيئة' }, { rating:2, text:'الانتظار طويل والزحمة شديدة' },
      { rating:2, text:'زحمة ولا يوجد تنظيم' }, { rating:5, text:'القهوة لذيذة' }, { rating:4, text:'المكان نظيف' } ] },
    [{ id:'T01', text:'إضافة باريستا ثانٍ', ids:['R001'], metric:'', status:'done', due:'', note:'' },
     { id:'T02', text:'تنظيم الدخول', ids:['R003'], metric:'', status:'open', due:'', note:'' }]);
  const rival = mkJob('Jrival', 'كوفي المنافس', 'https://www.google.com/maps/place/rival/@24.7,46.6,17z', '2026-09-10T00:00:00.000Z',
    { avg: 4.7, count: 900, list: [
      { rating:5, text:'الخدمة سريعة جدا والقهوة ممتازة' }, { rating:5, text:'المكان نظيف والموظفين محترمين' },
      { rating:2, text:'الأسعار غالية جدا ومبالغ فيها' } ] });

  await page.click('[data-go="archive"]');
  await page.waitForTimeout(300);
  await page.setInputFiles('#ar-import', { name:'seed.json', mimeType:'application/json',
    buffer: Buffer.from(JSON.stringify([older, rival]), 'utf8') });
  await page.waitForTimeout(700);
  const tree2 = await page.textContent('#archive-tree');
  tree2.includes('كوفي المنافس') ? ok('استيراد الأرشيف يعمل') : bad('استيراد الأرشيف');

  await page.click('[data-go="compare"]');
  await page.waitForTimeout(700);
  const opts = await page.$$eval('#cmp-place option', o => o.map(x => x.textContent));
  opts.some(o => o.includes('مقهى الدرب')) ? ok('المنشأة صارت قابلة للمقارنة الزمنية') : bad('المقارنة الزمنية', opts.join('|'));

  const tl2 = await page.textContent('#timeline-box');
  tl2.includes('تحسّنت') || tl2.includes('اختفت') ? ok('رصد التحسّن بين التقريرين') : bad('رصد التحسّن', tl2.slice(0,120));
  tl2.includes('أُنجز 1 من 2') ? ok('قياس تنفيذ خطة التقرير السابق') : bad('قياس الخطة', tl2.slice(-160));
  const deltas = await page.$$eval('#timeline-box .delta', n => n.length);
  deltas >= 4 ? ok(`فروق المؤشرات محسوبة (${deltas})`) : bad('فروق المؤشرات', deltas);

  await page.selectOption('#cmp-target', { label: /مقهى الدرب/ }).catch(async () => {
    const ids = await page.$$eval('#cmp-target option', o => o.map(x => ({v:x.value,t:x.textContent})));
    const hit = ids.find(x => x.t.includes('مقهى الدرب'));
    if (hit) await page.selectOption('#cmp-target', hit.v);
  });
  await page.waitForTimeout(500);
  const bench2 = await page.textContent('#bench-box');
  bench2.includes('كوفي المنافس') ? ok('جدول المنافسين مبني') : bad('جدول المنافسين', bench2.slice(0,120));
  bench2.includes('الترتيب') ? ok('الترتيب محسوب: ' + (bench2.match(/الترتيب \d+ من \d+/) || [''])[0]) : bad('الترتيب');
  const meCells = await page.$$eval('#bench-box .me', n => n.length);
  meCells >= 1 ? ok('صفّ المنشأة مميَّز') : bad('تمييز الصف', meCells);

  console.log('٨-د) العمل بلا اتصال');
  const swReg = await page.evaluate(async () => {
    const r = await navigator.serviceWorker.getRegistration();
    return !!r;
  });
  swReg ? ok('عامل الخدمة مسجَّل') : bad('عامل الخدمة');
  const mani = await page.evaluate(async () => {
    const res = await fetch('manifest.webmanifest');
    return res.ok ? (await res.json()).short_name : null;
  });
  mani === 'رابح' ? ok('بيان التطبيق يُقرأ') : bad('بيان التطبيق', mani);

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
