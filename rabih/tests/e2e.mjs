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

const xssFired = [];
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
await page.exposeFunction('__xss', (where) => xssFired.push(where));
const errors = [];
// منعُ السكربت في إطار التصميم المعزول نجاحٌ لا خطأ، فيُعَدّ ولا يُحسَب في الأخطاء.
const sandboxBlocks = [];
page.on('console', m => {
  const t = m.text();
  if (m.type() !== 'error' || t.includes('favicon')) return;
  if (t.includes('Blocked script execution') && t.includes('srcdoc')) { sandboxBlocks.push(t); return; }
  errors.push(t);
});
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

try {
  await page.goto('http://localhost:8099/', { waitUntil: 'networkidle' });
  console.log('١) الإقلاع');
  await page.waitForTimeout(1100);
  /* الجولة تُعرَض ولا تُفرَض: كانت تفتح نفسها بثلاث عشرة خطوة تحجب الشاشة
     قبل أن يرى الوافدُ شيئًا. فصارت دعوةً في سطر، والشاشة تعمل من أول لحظة. */
  !(await page.isVisible('#tour').catch(() => false))
    ? ok('لا جولة تحجب الشاشة على الوافد') : bad('جولة تقتحم');
  (await page.isVisible('.tour-offer'))
    ? ok('بل دعوةٌ في سطر يقبلها من شاء') : bad('بلا دعوة');
  (await page.isVisible('#f-url'))
    ? ok('والحقول تعمل من أول لحظة') : bad('حقول محجوبة');
  await page.click('#offer-tour');
  await page.waitForTimeout(500);
  (await page.isVisible('#tour')) ? ok('ومن طلبها فُتحت له') : bad('الجولة لا تُفتَح');
  const tourSteps = await page.textContent('#tour .tour-step');
  /1 من \d+/.test(tourSteps) ? ok('عدّاد الجولة: ' + tourSteps) : bad('عدّاد الجولة', tourSteps);
  await page.click('#tour [data-act="next"]');
  await page.waitForTimeout(400);
  (await page.textContent('#tour .tour-step')).includes('2 من') ? ok('التنقّل في الجولة') : bad('تنقّل الجولة');
  await page.click('#tour [data-act="skip"]');
  await page.waitForTimeout(300);
  !(await page.isVisible('#tour').catch(() => false)) ? ok('تخطّي الجولة يغلقها') : bad('تخطّي الجولة');
  await page.waitForFunction(() => document.querySelectorAll('#f-region option').length > 1, null, { timeout: 5000 });
  const regions = await page.$$eval('#f-region option', o => o.length);
  regions === 14 ? ok(`المناطق ${regions - 1}`) : bad('عدد المناطق', regions);

  console.log('٢) التعبئة المتسلسلة');
  // الحقولُ الاختيارية خلف بابٍ مطويّ — يُفتَح كما يفتحه المستخدم
  await page.evaluate(() => { const d = document.querySelector('#more-fields'); if (d) d.open = true; });
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
  await page.fill('#f-brand', 'مقهى الدرب');
  await page.fill('#f-branch', 'فرع الملقا');
  await page.waitForTimeout(600);
  await page.click('#btn-start');
  await page.waitForTimeout(500);
  (await page.isVisible('#view-data')) ? ok('الانتقال لشاشة البيانات') : bad('الانتقال لشاشة البيانات');
  const nm = await page.inputValue('#d-name');
  nm === 'مقهى الدرب' ? ok('استخراج الاسم من الرابط') : bad('استخراج الاسم', nm);

  console.log('٣-ب) موصّل قوقل Places');
  // عامل الخدمة يعترض الطلب قبل page.route، فيُرقَّع fetch داخل الصفحة نفسها:
  // يُختبر مسار الزرّ والدمج والإفصاح كاملًا بلا مفتاح ولا شبكة.
  await page.evaluate(() => {
    const body = { place: {
      schema: 1, source: 'places', placeId: 'ChIJtest', mapsUrl: 'x',
      identity: { name: 'اسمٌ من قوقل', category: 'cafe', address: 'حي الملقا، الرياض',
        phone: '0112345678', website: 'https://example.sa', coords: { lat: 24.7, lng: 46.6 },
        hours: ['الأحد: 7ص – 12م', 'الاثنين: 7ص – 12م'], attributes: ['توصيل', 'جلوس'], priceLevel: '$$' },
      ratings: { average: 4.2, count: 310, distribution: {} },
      reviews: [
        { id: 'R001', author: 'أحمد', rating: 5, date: 'قبل شهر', text: 'اللاتيه ممتاز والخدمة سريعة', ownerReply: '', language: 'ar' },
        { id: 'R002', author: 'نورة', rating: 2, date: 'قبل أسبوع', text: 'انتظار طويل جدا', ownerReply: '', language: 'ar' },
      ],
      photos: [{ url: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=', caption: 'صورة 1 من قوقل مابز' }],
      qna: [], popularTimes: [], notes: '',
      coverage: { reviewsReturned: 2, reviewsTotal: 310, limitNote: 'حدّ قوقل خمس مراجعات.' },
    } };
    window.__realFetch = window.fetch;
    window.fetch = (input, init) => {
      const u = typeof input === 'string' ? input : input.url;
      if (u.includes('/api/places')) {
        return Promise.resolve(new Response(JSON.stringify(body), {
          status: 200, headers: { 'content-type': 'application/json' },
        }));
      }
      return window.__realFetch(input, init);
    };
  });

  const chipsBefore = await page.$$eval('#photo-chips .chip', n => n.filter(c => !c.textContent.includes('لا صور')).length);
  await page.click('#btn-places');
  await page.waitForTimeout(900);
  const pm = await page.textContent('#places-msg');
  pm.includes('تمّ الجلب') ? ok('الجلب من قوقل نجح') : bad('الجلب', pm.slice(0, 90));
  (await page.inputValue('#d-name')) === 'مقهى الدرب' ? ok('لم يُدهَس الاسم القائم') : bad('دهس الاسم', await page.inputValue('#d-name'));
  pm.includes('أُبقي ما كتبتَه') ? ok('يُعلن ما أبقاه ولم يدهسه') : bad('إعلان الإبقاء', pm.slice(0, 120));
  (await page.inputValue('#d-address')).includes('الملقا') ? ok('العنوان مُلئ') : bad('العنوان', await page.inputValue('#d-address'));
  (await page.inputValue('#d-count')) === '310' ? ok('عدد التقييمات مُلئ') : bad('عدد التقييمات', await page.inputValue('#d-count'));
  (await page.inputValue('#d-hours')).includes('الأحد') ? ok('ساعات العمل مُلئت') : bad('ساعات العمل');
  pm.includes('2 من أصل 310') ? ok('الإفصاح عن حدّ قوقل صريح') : bad('الإفصاح', pm.slice(0, 140));
  const chipsAfter = await page.$$eval('#photo-chips .chip', n => n.filter(c => !c.textContent.includes('لا صور')).length);
  chipsAfter === chipsBefore + 1 ? ok('الصورة أُضيفت') : bad('الصور', `${chipsBefore}→${chipsAfter}`);

  await page.click('#btn-places');
  await page.waitForTimeout(900);
  const pm2 = await page.textContent('#places-msg');
  pm2.includes('مكرر') ? ok('إعادة الجلب لا تكرّر التعليقات') : bad('التكرار', pm2.slice(0, 120));
  const chipsAfter2 = await page.$$eval('#photo-chips .chip', n => n.filter(c => !c.textContent.includes('لا صور')).length);
  chipsAfter2 === chipsAfter ? ok('ولا تكرّر الصور') : bad('تكرار الصور', `${chipsAfter}→${chipsAfter2}`);

  // تُزال التعليقات المجلوبة كي يبدأ فحص اللصق من صفحة بيضاء.
  await page.evaluate(() => { window.fetch = window.__realFetch; });
  page.once('dialog', d => d.accept());
  await page.click('#btn-clear-reviews');
  await page.waitForTimeout(400);

  console.log('٣-ج) جلب كل التعليقات من مزوّد وسيط');
  // الدالّة الخادمية لا تعمل في خادم ثابت، فيُعترَض النداء في الصفحة نفسها.
  await page.evaluate(() => {
    const real = window.fetch;
    window.fetch = (input, init) => {
      const u = String(input?.url || input);
      if (u.includes('/api/reviews')) {
        window.__reviewsUrl = u;
        return Promise.resolve(new Response(JSON.stringify({
          provider: 'outscraper',
          placeName: 'مقهى الدرب', average: 4.3, claimed: 310,
          fetched: 3, truncated: false,
          reviews: [
            { author: 'مجلوب أ', rating: 5, text: 'القهوة ممتازة والباريستا محترف.', date: '2026-08-01', ownerReply: 'شكرًا لك.' },
            { author: 'مجلوب ب', rating: 2, text: 'الانتظار طويل جدًّا في الذروة.', date: '2026-07-11', ownerReply: '' },
            { author: 'مجلوب ج', rating: 4, text: 'المكان نظيف والأسعار مقبولة.', date: '2026-06-02', ownerReply: '' },
          ],
        }), { status: 200, headers: { 'content-type': 'application/json' } }));
      }
      return real(input, init);
    };
  });
  await page.click('#btn-fetch-reviews');
  await page.waitForTimeout(900);
  const rvMsg = await page.textContent('#reviews-msg');
  rvMsg.includes('أُضيف 3') ? ok('جُلبت التعليقات وأُضيفت: ' + rvMsg.replace(/\s+/g, ' ').trim().slice(0, 55)) : bad('جلب التعليقات', rvMsg.replace(/\s+/g, ' ').slice(0, 120));
  rvMsg.includes('310') ? ok('يُعلن كم عندك من أصل كم — فيُقاس النقص') : bad('إعلان نسبة العيّنة', rvMsg.slice(0, 90));
  (await page.inputValue('#d-count')) === '310' ? ok('عدد التقييمات مُلئ من المزوّد') : bad('عدد التقييمات', await page.inputValue('#d-count'));
  // إعادة الضغط لا تُضاعف
  await page.click('#btn-fetch-reviews');
  await page.waitForTimeout(900);
  (await page.textContent('#reviews-msg')).includes('أُضيف 0') ? ok('إعادة الجلب لا تُكرّر شيئًا') : bad('الجلب المكرر', (await page.textContent('#reviews-msg')).slice(0, 90));
  const afterFetch = await page.textContent('#parse-info');
  /3 تعليقًا/.test(afterFetch) ? ok('العدّاد يعكس المجلوب: ' + afterFetch.trim()) : bad('عدّاد المجلوب', afterFetch);

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

  console.log('٤-ج) القراءة الزمنية');
  const rec = await page.textContent('#recency-box');
  rec.includes('آخر 90 يومًا') ? ok('نافذة التسعين يومًا محسوبة') : bad('النافذة الزمنية', rec.slice(0,80));
  const mbars = await page.$$eval('#recency-box .month', n => n.length);
  mbars >= 3 ? ok(`الخط الزمني (${mbars} فترات)`) : bad('الخط الزمني', mbars);
  /(انحدار|تحسّن|ثبات|غير كافٍ)/.test(rec) ? ok('حكم زمني صريح: ' + (rec.match(/انحدار|تحسّن|ثبات|غير كافٍ/) || [])[0]) : bad('الحكم الزمني');

  console.log('٤-د) الكيانات والردود');
  const ents = await page.textContent('#entities-box');
  ents.length > 5 ? ok('الكيانات مرصودة: ' + ents.replace(/\s+/g,' ').trim().slice(0,70)) : bad('الكيانات', ents);
  const reps = await page.textContent('#replies-box');
  reps.includes('الرد على الشكاوى') ? ok('تحليل ردود المالك يعمل') : bad('تحليل الردود', reps.slice(0,70));

  console.log('٤-هـ) الحقول المستكملة');
  await page.fill('#d-qna', 'هل يوجد قسم عائلي؟\nنعم يوجد\n\nهل تفتحون الجمعة؟\n\nكم سعر اللاتيه؟');
  await page.fill('#d-peak', 'الخميس: 8ص=20, 6م=80, 7م=95, 8م=90\nالجمعة: 4م=30, 9م=100');
  await page.locator('#d-peak').blur();
  await page.waitForTimeout(500);
  const ctxb = await page.textContent('#context-box');
  ctxb.includes('ذروة الازدحام') ? ok('أوقات الذروة: ' + (ctxb.match(/الخميس[^·]*/) || [''])[0].trim().slice(0,30)) : bad('أوقات الذروة', ctxb.slice(0,70));
  ctxb.includes('بلا جواب') ? ok('الأسئلة بلا جواب مرصودة') : bad('الأسئلة', ctxb.slice(0,70));
  ctxb.includes('لغة التعليقات') ? ok('توزيع اللغات محسوب') : bad('اللغات', ctxb.slice(0,70));
  ctxb.includes('شكوى تتعلق بالازدحام') ? ok('الشكوى مربوطة بنافذة الذروة') : bad('ربط الذروة');

  console.log('٤-و) حقن الوسوم — لا يُنفَّذ شيء');
  // تعليقٌ خبيث: نصٌّ خارجي يدخل DOM. نُفِّذ هذا فعلًا قبل الإصلاح، فالفحص يبقى.
  await page.evaluate(() => {
    const t = document.querySelector('#d-reviews');
    t.value = '1 | ضار | قبل شهر\nنص <img src=x onerror="window.__xss(\'تعليق\')"> تكملة\n---\n1 | ب | قبل شهر\nالخدمة بطيئة\n---\n1 | ج | قبل شهر\nالمكان وسخ';
    t.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.click('#btn-parse');
  await page.waitForTimeout(900);
  const anomalyRaw = await page.innerHTML('#anomaly-box').catch(() => '');
  const entsRaw = await page.innerHTML('#entities-box').catch(() => '');
  !/<img\s/i.test(anomalyRaw + entsRaw) ? ok('نصّ التعليق لا يدخل DOM وسمًا') : bad('حقن من التعليق');

  // إعادة اللصق الأصلي كي تبقى الفحوص التالية على حالها
  await page.fill('#d-reviews', paste);
  await page.click('#btn-parse');
  await page.waitForTimeout(700);
  (await page.textContent('#parse-info')).includes('10') ? ok('استُعيدت العيّنة الأصلية') : bad('استعادة العيّنة');

  console.log('٤-أ) اللصق الواقعي من صفحة قوقل (بلا نجوم)');
  // ما يُنسَخ فعلًا من الصفحة: بلا نجوم، وفيه ضجيج قوقل وردّ المالك.
  const RAW_GOOGLE = ['سلطان القحطاني', 'Local Guide · ٣١ مراجعة', 'قبل أسبوعين', 'جديد',
    'المكان ممتاز والقهوة على مستوى عالٍ، لكن المواقف قليلة.', 'المزيد', 'أعجبني', 'مشاركة',
    'الرد من المالك قبل ٣ أيام', 'شكرًا لك، نعمل على ترتيب مواقف إضافية.', '',
    'هند العتيبي', '٧ مراجعات', 'قبل شهر', 'الخدمة بطيئة والطلب تأخر كثيرًا.', 'أعجبني'].join('\n');
  await page.fill('#d-reviews', RAW_GOOGLE);
  await page.click('#btn-parse');
  await page.waitForTimeout(900);
  const rawInfo = await page.textContent('#parse-info');
  /2 تعليقًا/.test(rawInfo) ? ok('لصقٌ بلا نجوم يُعطي تعليقين: ' + rawInfo.trim()) : bad('اللصق الواقعي', rawInfo);
  const rawMsg = await page.textContent('#parse-msg');
  rawMsg.includes('لا تقييم في أيٍّ منها') ? ok('غياب التقييم يُعلَن ولا يُخمَّن') : bad('إعلان غياب التقييم', rawMsg.replace(/\s+/g, ' ').slice(0, 120));
  /* `innerText` لا يقرأ ما في بابٍ مطويّ، ولوحةُ المعاينة صارت مطويّةً عمدًا
     كي لا يُقرأ التحليل مرتين. والمقصود هنا أن الموضوع **استُخرج**، لا أنه
     مبسوطٌ أمام العين — فيُقرأ بـ`textContent`. */
  const clean = await page.evaluate(() => {
    const t = document.querySelector('#topics-box')?.textContent || '';
    return { topics: t.length, park: /مواقف/.test(t) };
  });
  clean.park ? ok('المواضيع تُستخرج من نصوص بلا تقييم (المواقف رُصدت)') : bad('مواضيع بلا تقييم', JSON.stringify(clean));
  const replies = await page.textContent('#replies-box');
  /1|واحد/.test(replies) ? ok('ردّ المالك أُحصي في تحليل الردود') : bad('إحصاء الردود', replies.replace(/\s+/g, ' ').slice(0, 90));

  // تُعاد العيّنة الأصلية: ما بعدها يقوم عليها.
  await page.fill('#d-reviews', paste);
  await page.click('#btn-parse');
  await page.waitForTimeout(900);
  /10 تعليقًا/.test(await page.textContent('#parse-info')) ? ok('عادت العيّنة الأصلية كاملة') : bad('استعادة العيّنة', await page.textContent('#parse-info'));

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
  await ta0.fill('يشكو العملاء من بطء الخدمة (R002، R008).\nتكرر الثناء على الموقع (R047).\nنقطة ضعف: النظافة سيئة <img src=y onerror="window.__xss(\'مدقّق\')">.\nمتوسط التقييم 4.9 من 5.');
  await ta0.blur();
  await page.waitForTimeout(300);
  const vb = await page.locator('.step').nth(0).locator('.verify-box').textContent();
  vb.includes('R047') ? ok('كشف المعرّف الوهمي R047') : bad('المعرّف الوهمي', vb.slice(0,80));
  vb.includes('4.9') ? ok('كشف الرقم المخالف 4.9') : bad('الرقم المخالف');
  vb.includes('بلا سند') ? ok('كشف الحكم بلا سند') : bad('الحكم بلا سند');
  const verifyRaw = await page.locator('.step').nth(0).locator('.verify-box').innerHTML();
  !/<img\s/i.test(verifyRaw) ? ok('مخرج النموذج لا يدخل DOM وسمًا') : bad('حقن من مخرج النموذج');
  const lvl = await page.locator('.step').nth(0).locator('.verify-box .msg').getAttribute('class');
  lvl.includes('err') ? ok('صُنِّف المخرج مُعتلًّا') : bad('تصنيف المخرج', lvl);
  await ta0.fill('يشكو العملاء من بطء الخدمة (R002، R008).');
  await ta0.blur();
  await page.waitForTimeout(300);
  const vb2 = await page.locator('.step').nth(0).locator('.verify-box .msg').getAttribute('class');
  vb2.includes('ok') ? ok('مخرج سليم يمرّ') : bad('المخرج السليم', vb2);

  const mp = page.locator('.step').nth(0).locator('select.model-pick');
  (await mp.count()) ? ok('اختيار النموذج معروض في الخطوة') : bad('اختيار النموذج');
  await mp.selectOption('DeepSeek V3');
  await ta0.fill('يشكو العملاء من بطء الخدمة (R002، R008).');
  await ta0.blur();
  await page.waitForTimeout(400);

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

  console.log('٦-ب) اتفاق النماذج');
  await page.evaluate(() => {
    const set = (k, v) => { const t = document.querySelector('#out-' + k); t.value = v; t.dispatchEvent(new Event('input', { bubbles: true })); };
    set('a1', '- يشكو العملاء من بطء الخدمة وقت الذروة (R002، R008)\n- جودة القهوة نقطة قوة متكررة (R001، R005)\n- متوسط التقييم 4.2 من 5\n- المواقف ضيقة حسب تعليق واحد (R003)');
    set('a2', '- بطء الخدمة في أوقات الذروة شكوى متكررة (R002، R008)\n- القهوة ممتازة ويثني عليها كثيرون (R001، R005)\n- متوسط التقييم 4.2 من 5\n- الإنترنت ضعيف (R009)');
    set('a3', '- الخدمة بطيئة وقت الذروة (R008، R002)\n- جودة القهوة ممتازة (R005، R001)\n- متوسط التقييم 4.5 من 5');
    document.querySelector('#out-a3').dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForTimeout(600);
  (await page.isVisible('#agreement-card')) ? ok('لوحة الاتفاق ظهرت') : bad('لوحة الاتفاق');
  const ag = await page.textContent('#agreement-box');
  ag.includes('اتفق الجميع') ? ok('فرز الاتفاق: ' + (ag.match(/التوافق\s*\d+%/) || [''])[0]) : bad('فرز الاتفاق', ag.slice(0,80));
  ag.includes('انفرد به مصدر واحد') ? ok('يبرز ما انفرد به واحد') : bad('الانفراد');
  ag.includes('أرقام متعارضة') ? ok('كشف تعارض 4.5 مقابل 4.2') : bad('تعارض الأرقام', ag.slice(0,120));

  console.log('٧) التقرير');
  await page.click('#btn-to-report');
  await page.waitForTimeout(600);
  (await page.isVisible('#view-report')) ? ok('الانتقال للتقرير') : bad('الانتقال للتقرير');
  const frame = page.frameLocator('#r-frame');
  const h1 = await frame.locator('h1').first().textContent();
  h1.includes('مقهى الدرب') ? ok('غلاف التقرير: ' + h1.replace(/\s+/g,' ').trim()) : bad('الغلاف', h1);
  const bars = await frame.locator('.bar-row').count();
  bars === 5 ? ok('أشرطة توزيع النجوم') : bad('الأشرطة', bars);
  // الفهرس مطفأٌ في قالب المالك عمدًا — «في سطور» تتصدّره فتُغني عنه.
  (await frame.locator('.brief').count()) === 1
    ? ok('قالب المالك يتصدّره «في سطور» بدل الفهرس') : bad('الخلاصة الأولى');
  await page.selectOption('#r-template', 'full');
  await page.waitForTimeout(600);
  const toc = await frame.locator('.toc li').count();
  toc >= 2 ? ok(`والقالب الكامل فيه الفهرس (${toc} عناصر)`) : bad('الفهرس', toc);
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
  await page.evaluate(() => { window.__fullReport = document.querySelector('#r-md').value; });

  console.log('٧-أ) مقياس الثقة');
  const conf = await page.textContent('#confidence-box');
  /ثقة (قوية|متوسطة|ضعيفة) \(\d+%\)/.test(conf) ? ok('المقياس محسوب: ' + (conf.match(/ثقة \S+ \(\d+%\)/) || [''])[0]) : bad('مقياس الثقة', conf.slice(0, 90));
  const confChips = await page.$$eval('#confidence-box .chip', n => n.length);
  confChips >= 5 ? ok(`مكوّناته معروضة (${confChips})`) : bad('مكوّنات المقياس', confChips);
  const confInReport = await page.frameLocator('#r-frame').locator('.confidence').count();
  confInReport === 1 ? ok('المقياس في صدر التقرير') : bad('المقياس في التقرير', confInReport);

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
  tplOpts.length === 5 ? ok('خمسة قوالب: ' + tplOpts.join('، ')) : bad('القوالب', tplOpts.join('|'));
  // الافتراضي «لصاحب المنشأة»، فيُنتقى الكامل صراحةً ليكون الأساس معلومًا.
  await page.selectOption('#r-template', 'full');
  await page.waitForTimeout(600);
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

  /* أزرارُ التسليم الأربعة تتقدّم، وأدواتُ المُعِدّ تُطوى خلف «أدوات أخرى» —
     فكانت اثنين وثلاثين زرًّا تضيع بينها لحظةُ التسليم. */
  const seen = (sel) => page.$eval(sel, (b) => b.checkVisibility({ contentVisibilityAuto: true }));
  (await seen('#btn-print')) && (await seen('#btn-onepage')) && (await seen('#btn-preview-owner'))
    ? ok('أزرار التسليم ظاهرةٌ مجموعة') : bad('التسليم مبعثر');
  !(await seen('#btn-download-xlsx')) ? ok('وأدوات المُعِدّ مطويّة') : bad('الأدوات لم تُطوَ');
  await page.click('.more-tools summary');
  await page.waitForTimeout(300);
  (await seen('#btn-download-xlsx')) ? ok('وتُفتَح بضغطة') : bad('لا تُفتَح');

  /* ومعاينةٌ بعين المستقبِل: المُعِدّ يراجع على شاشةٍ عريضة ويُسلّم إلى من
     يفتحه بإبهامه، فيرى ما سيراه عميلُه قبل أن يُسلّم لا بعده. */
  await page.click('#btn-preview-owner');
  await page.waitForTimeout(900);
  (await page.locator('.owner-preview iframe').count()) === 1
    ? ok('ومعاينةٌ بعين العميل تُفتَح') : bad('بلا معاينة');
  const pw = await page.$eval('.owner-preview iframe', (f) => Math.round(f.getBoundingClientRect().width));
  pw <= 400 ? ok(`بعرض جوّال (${pw}px)`) : bad('عرض غير جوّال', pw);
  await page.click('#op-close');
  await page.waitForTimeout(300);
  (await page.locator('.owner-preview').count()) === 0 ? ok('وتُغلَق') : bad('لا تُغلَق');

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

  console.log('٧-هـ) مدقّق الاكتمال');
  await page.evaluate(() => {
    const t = document.querySelector('#r-md');
    t.value = '# الخلاصة التنفيذية\nالقهوة ممتازة (R001).';
    t.dispatchEvent(new Event('input', { bubbles: true }));
    t.dispatchEvent(new Event('blur', { bubbles: true }));
  });
  await page.waitForTimeout(500);
  const comp = await page.textContent('#completeness-box');
  comp.includes('مدقّق الاكتمال') ? ok('مدقّق الاكتمال يعمل: ' + (comp.match(/التغطية \d+%/) || [''])[0]) : bad('مدقّق الاكتمال', comp.slice(0,80));
  comp.includes('أهملها التقرير') ? ok('يسمّي المواضيع المُهمَلة') : bad('تسمية المُهمَل', comp.slice(0,120));
  const lvl2 = await page.locator('#completeness-box .msg').getAttribute('class');
  /err|warn/.test(lvl2) ? ok('صُنِّف التقرير ناقصًا') : bad('تصنيف النقص', lvl2);
  (await page.locator('#btn-fix-prompt').count()) ? ok('زر سدّ النقص ظاهر') : bad('زر سدّ النقص');
  // إعادة التقرير الكامل
  await page.evaluate((v) => {
    const t = document.querySelector('#r-md');
    t.value = v; t.dispatchEvent(new Event('input', { bubbles: true })); t.dispatchEvent(new Event('blur', { bubbles: true }));
  }, await page.evaluate(() => window.__fullReport || ''));

  console.log('٧-و) السجل والتجميد');
  await page.evaluate(() => {
    const t = document.querySelector('#r-md');
    t.value = t.value + '\n\n# إضافة تجريبية\nنص أُضيف ثم سيُتراجَع عنه.';
    t.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(2400);
  const hd = await page.textContent('#history-depth');
  /\d+ تعديل/.test(hd) ? ok('السجل يلتقط التعديل: ' + hd) : bad('التقاط التعديل', hd);
  const mdBefore = await page.inputValue('#r-md');
  await page.click('#btn-undo');
  await page.waitForTimeout(500);
  const mdAfter = await page.inputValue('#r-md');
  mdAfter !== mdBefore && !mdAfter.includes('إضافة تجريبية') ? ok('التراجع يعيد النص') : bad('التراجع');
  await page.click('#btn-redo');
  await page.waitForTimeout(500);
  (await page.inputValue('#r-md')).includes('إضافة تجريبية') ? ok('الإعادة تعمل') : bad('الإعادة');
  await page.click('#btn-undo');
  await page.waitForTimeout(400);

  page.once('dialog', d => d.accept('سُلِّم واتساب'));
  await page.click('#btn-freeze');
  await page.waitForTimeout(900);
  const snaps = await page.$$eval('#snapshots-box .snap', n => n.length);
  snaps === 1 ? ok('جُمِّدت نسخة مُسلَّمة') : bad('التجميد', snaps);
  (await page.textContent('#snapshots-box')).includes('واتساب') ? ok('وسم النسخة محفوظ') : bad('وسم النسخة');
  // التجميد لا يتأثر بتغيّر القالب لاحقًا
  const snapHtml = await page.evaluate(async () => {
    const st = await import('./js/store.js');
    const all = await st.allSnapshots();
    return all[0]?.html?.length || 0;
  });
  await page.selectOption('#r-template', 'brief');
  await page.waitForTimeout(600);
  const snapHtml2 = await page.evaluate(async () => {
    const st = await import('./js/store.js');
    const all = await st.allSnapshots();
    return all[0]?.html?.length || 0;
  });
  snapHtml > 0 && snapHtml === snapHtml2 ? ok(`النسخة المجمَّدة لم تتغيّر بتغيّر القالب (${Math.round(snapHtml/1024)} ك.ب)`) : bad('ثبات النسخة', `${snapHtml}/${snapHtml2}`);
  await page.selectOption('#r-template', 'full');
  await page.waitForTimeout(400);

  console.log('٧-ز) الإخراج المصمَّم (اختياري)');
  await page.click('#design-card > summary');
  await page.waitForTimeout(250);
  // قراءة الحافظة تتوقّف على إذنٍ لا يُمنَح في الاختبار، فيُقرأ ما يُكتَب فيها باعتراض writeText.
  await page.evaluate(() => {
    window.__copied = '';
    const cb = navigator.clipboard || {};
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { ...cb, writeText: (t) => { window.__copied = t; return Promise.resolve(); } },
    });
  });
  await page.click('#btn-design-prompt');
  await page.waitForTimeout(400);
  const dPrompt = await page.evaluate(() => window.__copied || '');
  (dPrompt.includes('__PHOTO_1__') && dPrompt.includes('مقهى الدرب'))
    ? ok('رسالة التصميم تُنسخ وفيها مواضع الصور وبيانات الغلاف')
    : bad('رسالة التصميم', dPrompt.slice(0, 80));

  // شيفرة كما قد يردّ بها نموذج، وفيها حمولة حقن: يجب أن تُعرض ولا تُنفَّذ في أصل الموقع.
  await page.fill('#d-design', '<!doctype html><html dir="rtl"><body><h1 id="dh">تقرير مصمَّم</h1>'
    + '<img src="__PHOTO_1__"><img src="__PHOTO_2__">'
    + '<img src=x onerror="parent.__xss && parent.__xss(\'design\')">'
    + '<script>try{parent.__xss(\'design-script\')}catch(e){}<\/script></body></html>');
  await page.waitForTimeout(400);
  (await page.textContent('#design-state')).includes('ك.ب') ? ok('شارة حجم الشيفرة تتحدّث') : bad('شارة التصميم');
  await page.click('#btn-design-render');
  await page.waitForTimeout(700);
  (await page.isVisible('#design-preview')) ? ok('ظهرت المعاينة') : bad('المعاينة');
  const dFrame = page.frameLocator('#design-frame');
  (await dFrame.locator('#dh').textContent()).includes('تقرير مصمَّم') ? ok('الشيفرة تُعرض في الإطار') : bad('عرض الشيفرة');
  const sandbox = await page.getAttribute('#design-frame', 'sandbox');
  (sandbox && !sandbox.includes('allow-same-origin')) ? ok('الإطار معزول عن أصل الموقع: ' + sandbox) : bad('عزل الإطار', sandbox);
  const leftovers = await dFrame.locator('img[src^="__PHOTO_"]').count();
  leftovers === 0 ? ok('مواضع الصور الفارغة أُزيلت فلا صورة مكسورة') : bad('مواضع الصور', leftovers);
  sandboxBlocks.length > 0
    ? ok(`المتصفح منع سكربت النموذج داخل الإطار (${sandboxBlocks.length} مرة)`)
    : bad('منع السكربت في الإطار', 'لم يُسجَّل منع — راجع سمة sandbox');

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

  console.log('٧-د) حماية الأرشيف');
  await page.click('[data-go="archive"]');
  await page.waitForTimeout(600);
  const safety = await page.textContent('#safety-box');
  safety.includes('التخزين') ? ok('لوحة الحماية: ' + safety.trim().split('\n')[0].slice(0,50)) : bad('لوحة الحماية', safety.slice(0,80));
  safety.includes('لم تأخذ نسخة احتياطية') ? ok('يحذّر من غياب النسخة الاحتياطية') : ok('حالة النسخ: معروضة');
  await page.click('#btn-persist');
  await page.waitForTimeout(500);
  const after2 = await page.textContent('#safety-box');
  after2.includes('مثبَّت') ? ok('زر التثبيت يغيّر الحالة') : bad('التثبيت', after2.slice(0,60));
  const dlb = page.waitForEvent('download', { timeout: 8000 });
  await page.click('#btn-backup-now');
  const bfile = await dlb;
  bfile.suggestedFilename().startsWith('rabih-backup') ? ok('نسخة احتياطية: ' + bfile.suggestedFilename()) : bad('النسخة الاحتياطية', bfile.suggestedFilename());
  await page.waitForTimeout(400);
  const after3 = await page.textContent('#safety-box');
  after3.includes('آخر نسخة احتياطية قبل 0') ? ok('سُجِّل تاريخ النسخة') : bad('تسجيل النسخة', after3.slice(0,90));

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
  const mkJob = (id, name, url, when, reviews, plan, opts = {}) => ({
    id, mapsUrl: url, createdAt: when, updatedAt: when,
    ctx: { regionId:'riyadh', regionName:'منطقة الرياض', cityId:'riyadh', cityName:'الرياض',
           groupId:'food', categoryId:'cafe', categoryName:'مقهى / كوفي', districtName: opts.district || 'الملقا',
           brand: opts.brand || '', branch: opts.branch || '' },
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
  const branch2 = mkJob('Jb2', 'مقهى الدرب - النرجس', 'https://www.google.com/maps/place/narjis/@24.8,46.6,17z', '2026-09-08T00:00:00.000Z',
    { avg: 3.6, count: 150, list: [
      { rating:1, text:'الانتظار طويل جدا والخدمة بطيئة', date:'قبل شهر' },
      { rating:2, text:'المكان وسخ والحمامات قذرة', date:'قبل أسبوعين' },
      { rating:2, text:'الموظفين قليل ادبهم والخدمة بطيئة', date:'قبل أسبوع' } ] },
    null, { brand:'مقهى الدرب', branch:'فرع النرجس', district:'النرجس' });
  const branch3 = mkJob('Jb3', 'مقهى الدرب - قرطبة', 'https://www.google.com/maps/place/qurtuba/@24.8,46.7,17z', '2026-09-09T00:00:00.000Z',
    { avg: 4.4, count: 220, list: [
      { rating:2, text:'الخدمة بطيئة والانتظار طويل', date:'قبل شهر' },
      { rating:5, text:'ممتاز ونظيف والقهوة رائعة', date:'قبل شهر' },
      { rating:4, text:'جيد جدا', date:'قبل شهرين' } ] },
    null, { brand:'مقهى الدرب', branch:'فرع قرطبة', district:'قرطبة' });
  const rival = mkJob('Jrival', 'كوفي المنافس', 'https://www.google.com/maps/place/rival/@24.7,46.6,17z', '2026-09-10T00:00:00.000Z',
    { avg: 4.7, count: 900, list: [
      { rating:5, text:'الخدمة سريعة جدا والقهوة ممتازة' }, { rating:5, text:'المكان نظيف والموظفين محترمين' },
      { rating:2, text:'الأسعار غالية جدا ومبالغ فيها' } ] });

  await page.click('[data-go="archive"]');
  await page.waitForTimeout(300);
  await page.setInputFiles('#ar-import', { name:'seed.json', mimeType:'application/json',
    buffer: Buffer.from(JSON.stringify([older, rival, branch2, branch3]), 'utf8') });
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

  console.log('٨-هـ) تقرير المجموعة');
  const gopts = await page.$$eval('#grp-brand option', o => o.map(x => x.textContent));
  gopts.some(o => o.includes('مقهى الدرب') && o.includes('3')) ? ok('العلامة جُمعت: ' + gopts[0]) : bad('جمع العلامة', gopts.join('|'));
  const gbox = await page.textContent('#group-box');
  /* الانتظارُ وارد في الفروع الثلاثة — مرتين ومرتين ومرة. وكان يُسمّى «مشكلة
     نظام» على ذلك، وهو حكمٌ ثقيل لا يحمله ذكران. فيُذكَر أنه ورد في أكثر من
     فرع، ولا يُسمّى نظامًا حتى يبلغ ثلاثًا في كل فرع. */
  gbox.includes('ذِكرًا لا نمطًا') && gbox.includes('الانتظار')
    ? ok('الانتظارُ في الفروع الثلاثة يُذكَر ولا يُسمّى مشكلةَ نظام — دون ثلاثٍ في فرع') : bad('فرز الشكاوى', gbox.slice(0,160));
!gbox.includes('مشكلة نظام (ثلاثٌ فأكثر')
    ? ok('ولا «مشكلة نظام» على ذكرين') : bad('حكمٌ على ذكرين');
gbox.includes('±') ? ok('ونصيبُ السلبي لكل فرع بهامشه') : bad('نسبةٌ بلا هامش');
  const grows = await page.$$eval('#group-box tbody tr', n => n.map(r => r.cells[1].textContent));
  grows.length === 3 ? ok('ترتيب الفروع: ' + grows.join(' ← ')) : bad('ترتيب الفروع', grows.join('|'));
  grows[grows.length-1].includes('النرجس') ? ok('الفرع الأضعف في الذيل') : bad('الأضعف', grows.join('|'));
  const wavg = await page.textContent('#group-box .stat-grid');
  /4\.\d/.test(wavg) ? ok('المتوسط الموزون محسوب') : bad('المتوسط الموزون', wavg.slice(0,60));
  const gx = page.waitForEvent('download', { timeout: 8000 });
  await page.click('#btn-group-xlsx');
  const gfile = await gx;
  gfile.suggestedFilename().startsWith('rabih-group') ? ok('Excel المجموعة: ' + gfile.suggestedFilename()) : bad('Excel المجموعة', gfile.suggestedFilename());
  await gfile.saveAs('/tmp/rabih-group.xlsx');

  console.log('٨-و) الهوية والرسائل والطابور والقفل');
  await page.click('[data-go="settings"]');
  await page.waitForTimeout(400);
  await page.fill('#id-office', 'مكتب بصيرة للاستشارات');
  await page.fill('#id-phone', '0501234567');
  await page.fill('#id-primary', '#1f3d2e');
  await page.waitForTimeout(400);
  await page.click('[data-go="new"]');
  await page.waitForTimeout(200);
  await page.click('[data-go="settings"]');
  await page.waitForTimeout(300);
  (await page.inputValue('#id-office')) === 'مكتب بصيرة للاستشارات' ? ok('هوية المكتب تُحفَظ') : bad('حفظ الهوية');

  await page.evaluate(() => { document.querySelector('[data-go="archive"]').click(); });
  await page.waitForTimeout(400);
  // فتح آخر تقرير ثم فحص الغلاف
  await page.evaluate(() => {
    // الصف الذي له تقرير جاهز، لا أحد الفروع المستوردة بلا تقرير.
    const row = [...document.querySelectorAll('#archive-tree .job')].find(r => r.textContent.includes('تقرير جاهز'));
    [...(row?.querySelectorAll('button') || [])].find(b => b.textContent.trim() === 'فتح')?.click();
  });
  await page.waitForTimeout(900);
  if (await page.isVisible('#view-report')) {
    const cover = await page.frameLocator('#r-frame').locator('.office-name').textContent().catch(() => '');
    cover.includes('بصيرة') ? ok('اسم المكتب على غلاف التقرير') : bad('الهوية في التقرير', cover);
    const msg = await page.inputValue('#s-msg');
    msg.length > 40 && msg.includes('مقهى الدرب') ? ok('رسالة التسليم مبنية تلقائيًا') : bad('رسالة التسليم', msg.slice(0,60));
    const sit = await page.textContent('#s-situation');
    /وضع|انحدار/.test(sit) ? ok('حال التقرير مُصنَّف: ' + sit) : bad('تصنيف الحال', sit);
    const tplOpts2 = await page.$$eval('#r-template option', o => o.map(x => x.textContent));
    tplOpts2.includes('عيّنة مجانية') ? ok('قالب العيّنة المجانية موجود') : bad('قالب العيّنة', tplOpts2.join('|'));
  } else { bad('فتح تقرير من الأرشيف'); }

  // الطابور
  await page.click('[data-go="archive"]');
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    [...document.querySelectorAll('#archive-tree .job')].slice(0, 3).forEach(r => {
      [...r.querySelectorAll('button')].find(b => b.textContent.includes('للطابور'))?.click();
    });
  });
  await page.waitForTimeout(500);
  (await page.isVisible('#queue-bar')) ? ok('شريط الطابور ظهر') : bad('شريط الطابور');
  const qtext = await page.textContent('#queue-bar');
  /الطابور 1\/[23]/.test(qtext) ? ok('الطابور: ' + qtext.trim().slice(0,28)) : bad('عدّاد الطابور', qtext.slice(0,40));
  await page.click('#q-next');
  await page.waitForTimeout(700);
  const qtext2 = await page.textContent('#queue-bar');
  /الطابور 2\//.test(qtext2) ? ok('التنقّل في الطابور يعمل') : bad('التنقّل', qtext2.slice(0,40));

  // القفل والتشفير
  await page.click('[data-go="settings"]');
  await page.waitForTimeout(400);
  await page.fill('#lk-pass', 'kalimat-sirr');
  const encDl = page.waitForEvent('download', { timeout: 10000 });
  await page.click('#btn-export-enc');
  const encFile = await encDl;
  await encFile.saveAs('/tmp/rabih-enc.json');
  const encRaw = (await import('node:fs')).readFileSync('/tmp/rabih-enc.json', 'utf8');
  const encObj = JSON.parse(encRaw);
  encObj.format === 'rabih-encrypted' && !encRaw.includes('مقهى الدرب')
    ? ok('التصدير مشفَّر فعلًا (لا يظهر اسم المنشأة في الملف)') : bad('التشفير', encRaw.slice(0,80));

  const roundtrip = await page.evaluate(async ([payload]) => {
    const lk = await import('./js/lock.js');
    const bad1 = await lk.decryptText(payload, 'كلمة-خاطئة');
    const good = await lk.decryptText(payload, 'kalimat-sirr');
    return { rejected: !bad1.ok, accepted: good.ok, hasName: good.ok && good.text.includes('مقهى الدرب') };
  }, [encRaw]);
  roundtrip.rejected ? ok('كلمة السر الخاطئة تُرفض') : bad('رفض الخاطئة');
  roundtrip.accepted && roundtrip.hasName ? ok('كلمة السر الصحيحة تفكّ الملف') : bad('فكّ التشفير', JSON.stringify(roundtrip));

  await page.fill('#lk-pass', 'kalimat-sirr');
  await page.click('#btn-lock-on');
  await page.waitForTimeout(600);
  (await page.textContent('#lock-state')).includes('مفعَّل') ? ok('القفل يُفعَّل') : bad('تفعيل القفل');
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  (await page.isVisible('#gate')) ? ok('بوابة الدخول تظهر بعد إعادة التحميل') : bad('بوابة الدخول');
  await page.fill('#gate-pass', 'خطأ');
  await page.click('#gate-form button');
  await page.waitForTimeout(500);
  (await page.textContent('#gate-msg')).includes('غير صحيحة') ? ok('البوابة ترفض الخطأ') : bad('رفض البوابة');
  await page.fill('#gate-pass', 'kalimat-sirr');
  await page.click('#gate-form button');
  await page.waitForTimeout(800);
  !(await page.isVisible('#gate')) ? ok('البوابة تُفتح بالكلمة الصحيحة') : bad('فتح البوابة');

  console.log('٨-ز) القاموس والنماذج والمعيار');
  await page.click('[data-go="settings"]');
  await page.waitForTimeout(600);
  const lex = await page.textContent('#lex-uncovered');
  lex.length > 10 ? ok('محرّر القاموس يعرض غير المغطّى: ' + lex.replace(/\s+/g,' ').trim().slice(0,60)) : bad('محرّر القاموس', lex);
  await page.fill('#lex-word', 'ملخبط');
  await page.selectOption('#lex-topic', { index: 0 });
  await page.click('#btn-lex-add');
  await page.waitForTimeout(400);
  (await page.textContent('#lex-msg')).includes('أُضيفت') ? ok('إضافة كلمة للقاموس') : bad('إضافة الكلمة', await page.textContent('#lex-msg'));
  (await page.textContent('#lex-custom')).includes('ملخبط') ? ok('الكلمة تظهر في إضافاتك') : bad('عرض الإضافات');
  await page.click('#btn-lex-add');
  await page.waitForTimeout(300);
  (await page.textContent('#lex-msg')).includes('قبل') ? ok('التكرار مرفوض') : ok('رسالة التكرار: ' + (await page.textContent('#lex-msg')).slice(0,40));

  const recorded = await page.evaluate(async () => (await import('./js/models.js')).all().length);
  recorded > 0 ? ok(`سُجِّلت ${recorded} خطوة في أداء النماذج`) : bad('تسجيل الخطوات', recorded);
  const mb = await page.textContent('#models-box');
  mb.includes('DeepSeek V3') ? ok('لوحة أداء النماذج سجّلت النموذج') : bad('لوحة النماذج', mb.slice(0,80));
  /\d+%/.test(mb) ? ok('درجات النماذج محسوبة') : bad('درجات النماذج');

  await page.click('[data-go="compare"]');
  await page.waitForTimeout(800);
  const ibx = await page.textContent('#bench-box');
  ibx.includes('معيار أرشيفك') ? ok('المعيار الداخلي: ' + (ibx.match(/معيار أرشيفك \([^)]+\)/) || [''])[0]) : bad('المعيار الداخلي', ibx.slice(0,100));

  console.log('٨-ح) بذر الدفعة');
  await page.click('[data-go="new"]');
  await page.waitForTimeout(400);
  // الحقولُ الاختيارية خلف بابٍ مطويّ — يُفتَح كما يفتحه المستخدم
  await page.evaluate(() => { const d = document.querySelector('#more-fields'); if (d) d.open = true; });
  await page.selectOption('#f-region', 'riyadh');
  await page.selectOption('#f-city', 'riyadh');
  await page.selectOption('#f-group', 'food');
  await page.selectOption('#f-category', 'cafe');
  await page.click('#btn-bulk');
  await page.waitForTimeout(300);
  await page.fill('#bulk-list',
    'كوفي أول | https://www.google.com/maps/place/a/@24.7,46.6,17z | الملقا\n' +
    'كوفي ثانٍ | https://www.google.com/maps/place/b/@24.8,46.6,17z | النرجس\n' +
    'كوفي فاسد | ليس رابطًا | حي');
  await page.click('#btn-bulk-create');
  await page.waitForTimeout(1400);
  const bulkMsg = await page.textContent('#new-msg');
  bulkMsg.includes('أُنشئ 2') ? ok('أُنشئت الدفعة: ' + bulkMsg.trim().slice(0,45)) : bad('إنشاء الدفعة', bulkMsg.slice(0,90));
  bulkMsg.includes('كوفي فاسد') ? ok('الرابط الفاسد مرفوض ومُبلَّغ عنه') : bad('رفض الفاسد', bulkMsg.slice(0,120));
  const qsize = await page.textContent('#queue-bar');
  /الطابور \d+\/[3-9]/.test(qsize) ? ok('الدفعة دخلت الطابور: ' + qsize.trim().slice(0,22)) : bad('الطابور بعد الدفعة', qsize.slice(0,40));

  /* والرابطُ وحده يبدأ: كانت المدينةُ والتصنيفُ والحيُّ شروطًا للبدء، فيقف
     صاحب المحل أمام ثمانية حقولٍ وهو جاء يسأل «كيف حال محلّي؟».
     ويُفحَص في صفحةٍ مستقلة كي لا يلوّث حالةَ ما قبله. */
  console.log('٨-ب) الرابط وحده يبدأ');
  const fresh = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  await fresh.goto('http://localhost:8099/', { waitUntil: 'networkidle' });
  await fresh.waitForTimeout(900);
  await fresh.click('#offer-close').catch(() => {});
  await fresh.fill('#f-url', 'https://www.google.com/maps/place/%D9%85%D9%82%D9%87%D9%89/@24.7,46.6,17z');
  await fresh.click('#btn-start');
  await fresh.waitForTimeout(700);
  (await fresh.isVisible('#view-data')) ? ok('الرابط وحده يكفي للبدء') : bad('حقول تحجب البدء');
  (await fresh.textContent('#parse-msg')).includes('يُستكمَل')
    ? ok('ويُنبَّه إلى ما ينقص حيث صار لا حيث كان') : bad('بلا تنبيه');
  await fresh.close();

  console.log('٩) الجوال (390px)');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  overflow <= 1 ? ok('لا فيض أفقي') : bad('فيض أفقي', overflow + 'px');

  /* **أهدافُ اللمس.** قِيست فكان اثنا عشر هدفًا دون أربعين بكسلًا — وأربعون
     هو الحدّ الذي دونه يُخطئ الإبهام. والقياسُ بـ`checkVisibility` لا
     بـ`offsetParent`، وإلا عُدَّ ما في بابٍ مطويّ ظاهرًا. */
  const taps = await page.evaluate(() => [...document.querySelectorAll('button,a,select,input,.filepick-btn')]
    .filter((e) => e.checkVisibility({ contentVisibilityAuto: true }))
    .filter((e) => { const r = e.getBoundingClientRect(); return r.height > 0 && r.height < 40; }).length);
  taps === 0 ? ok('ولا هدفَ لمسٍ دون 40 بكسلًا — وكانت اثني عشر') : bad('أهداف لمسٍ صغيرة', taps);

  /* والتقرير نفسه يُفتَح على الهاتف أكثر مما يُطبَع: يصل بواتساب فيُقرأ على
     الفور. وكان يفيض عرضًا (جداولُ من خمسة أعمدة داخل هوامش A4) ويُقرأ بخطٍّ
     دون اثني عشر بكسلًا. فيُقاس على الجهاز لا يُفترَض. */
  const rep = await page.evaluate(async () => {
    const m = await import('/js/report.js');
    const { emptyPlace, emptyReview, assignReviewIds } = await import('/js/schema.js');
    const place = emptyPlace();
    place.identity.name = 'مقهى الاختبار';
    place.ratings = { average: 4.2, count: 310, distribution: null };
    place.reviews = [
      { ...emptyReview(), rating: 1, text: 'الانتظار طويل جدا ووقفت نص ساعة', date: 'قبل أسبوع' },
      { ...emptyReview(), rating: 2, text: 'الخدمه بطيئه والموظف ما اعتذر', date: 'قبل شهر' },
      { ...emptyReview(), rating: 5, text: 'القهوة ممتازة والباريستا محترف والمكان هادئ للعمل', date: 'قبل شهر' },
      { ...emptyReview(), rating: 4, text: 'المكان جميل والاسعار معقولة', date: 'قبل شهرين' },
    ];
    assignReviewIds(place);
    return m.buildReportHtml({ place, markdown: '## تحليل\nنصّ التقرير.', job: {}, ctx: {} });
  });
  const rp = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await rp.setContent(rep);
  await rp.waitForTimeout(200);
  const rm = await rp.evaluate(() => {
    const d = document.documentElement;
    const tiny = [...document.querySelectorAll('.body *')]
      .filter((el) => !el.children.length && el.textContent.trim())
      .map((el) => parseFloat(getComputedStyle(el).fontSize)).filter((f) => f < 11);
    return { over: d.scrollWidth - d.clientWidth, tiny: tiny.length };
  });
  rm.over <= 1 ? ok('والتقرير لا يفيض على الهاتف') : bad('فيض التقرير', rm.over + 'px');
  rm.tiny === 0 ? ok('ولا نصَّ دون 11 بكسلًا فيه') : bad('خطٌّ دقيق في التقرير', rm.tiny + ' عنصرًا');

  /* **الطباعة: تُصان الوحدةُ الصغيرة وتجري الحاويةُ الكبيرة.**
     كان منعُ الكسر مفروضًا على الأقسام كلها — وفيها ما يبلغ الصفحةَ طولًا
     («صوت العميل» و«قائمة المتابعة» نحو ألف بكسل). وحاويةٌ بهذا الطول لا
     تُصان بل تُدفَع، فتترك ما قبلها فارغًا: خمسُ صفحاتٍ من اثنتين وعشرين. */
  /* إمكانيةُ الوصول في التقرير نفسه — لا في التطبيق وحده. */
  /* **الأرشيفُ تحت حِمل.** يُقاس لا يُفترَض: زُرع أربعُمئة تقريرٍ بعشرة آلاف
     تعليق، فالجداول مسقوفةٌ بأربعين صفًّا والفتحُ دون نصف ثانية. وحارسُه هنا
     كي لا يسقط السقفُ صامتًا فيُرسَم آلافُ الصفوف في كل فتحة. */
  /* **التقريرُ النموذجيّ: ما يراه الوافدُ قبل أن يُدخل شيئًا.**
     ثلاثةُ أعطابٍ قِيست فيه: قائمةُ القالب فارغة (صفرُ خيارات) لأن التحميل
     كان معلّقًا بطريقٍ واحد، وخطُّ التحليل مقفلٌ «لم تُبلَغ بعد»، والتقريرُ
     يبدأ بعد نحو 1500 بكسل من أدوات صانعه. */
  console.log('٨-ط) التقرير النموذجيّ يُفتح كاملًا');
  const dp = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const dpErr = [];
  dp.on('pageerror', (e) => dpErr.push(e.message));
  await dp.goto('http://localhost:8099/', { waitUntil: 'networkidle' });
  await dp.waitForTimeout(700);
  await dp.evaluate(() => document.querySelector('#offer-demo')?.click());
  await dp.waitForTimeout(3500);
  const demo = await dp.evaluate(() => {
    const sel = document.querySelector('#r-template');
    const frame = document.querySelector('#r-frame');
    return {
      tplOpts: sel?.options.length || 0,
      tplShown: sel?.selectedOptions[0]?.textContent || '',
      frameTop: Math.round(frame.getBoundingClientRect().top + window.scrollY),
      locked: [...document.querySelectorAll('#steps-bar-4 .pill')].filter((x) => x.classList.contains('locked')).length,
      reportLen: (frame.contentDocument?.body?.innerText || '').length,
    };
  });
  demo.tplOpts >= 4 && demo.tplShown
    ? ok(`قائمةُ القالب مملوءةٌ (${demo.tplOpts}) وافتراضيُّها ظاهر: ${demo.tplShown}`) : bad('قائمة القالب فارغة', demo.tplOpts);
  demo.locked === 0 ? ok('ولا خطوةَ مقفلةٌ في وجه من فتح النموذجيّ') : bad('خطوةٌ مقفلة', demo.locked);
  demo.frameTop < 600 ? ok(`والتقريرُ أعلى شاشته (${demo.frameTop}px) — وكان دون 1500`) : bad('التقرير مدفون', demo.frameTop + 'px');
  demo.reportLen > 3000 ? ok(`ويُبنى كاملًا (${demo.reportLen} حرفًا)`) : bad('تقريرٌ ناقص', demo.reportLen);
  dpErr.length === 0 ? ok('بلا خطأٍ في الصفحة') : bad('خطأ', dpErr[0]);
  await dp.close();

  console.log('٨-و) الأرشيف تحت حِمل');
  const lp = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  await lp.goto('http://localhost:8099/', { waitUntil: 'networkidle' });
  await lp.waitForTimeout(700);
  await lp.click('#offer-close').catch(() => {});
  const seedMs = await lp.evaluate(async () => {
    const { saveJob } = await import('/js/store.js');
    const { emptyPlace, emptyReview, assignReviewIds } = await import('/js/schema.js');
    const t = performance.now();
    for (let i = 0; i < 400; i += 1) {
      const pl = emptyPlace();
      pl.identity.name = 'منشأة ' + i;
      pl.ratings = { average: 3.5 + (i % 15) / 10, count: 100 + i, distribution: null };
      pl.reviews = [...Array(25)].map((_, k) => ({ ...emptyReview(),
        rating: 1 + (k % 5), text: 'تعليق ' + k + ' عن الانتظار والخدمة والقهوة', date: 'قبل شهر' }));
      assignReviewIds(pl);
      // eslint-disable-next-line no-await-in-loop
      await saveJob({ id: 'load-' + i, createdAt: new Date(Date.now() - i * 86400000).toISOString(),
        place: pl, ctx: { cityName: 'الرياض', categoryName: 'مقهى', districtName: 'حي ' + (i % 20) },
        out: {}, plan: [], assume: {}, stamps: {}, excluded: [] });
    }
    return Math.round(performance.now() - t);
  });
  const openT = Date.now();
  await lp.click('[data-go="archive"]');
  await lp.waitForFunction(() => {
    const v = document.querySelector('#view-archive');
    return v && !v.hidden && v.querySelectorAll('tr,li,.chip').length > 5;
  }, null, { timeout: 30000 }).catch(() => {});
  const openMs = Date.now() - openT;
  const rows = await lp.evaluate(() => document.querySelectorAll('#view-archive tr').length);
  openMs < 4000 ? ok(`400 تقريرٍ (10,000 تعليق): يُزرَع في ${seedMs}ms ويُفتَح في ${openMs}ms`) : bad('أرشيفٌ بطيء', openMs + 'ms');
  rows > 0 && rows < 300 ? ok(`والجداول مسقوفة (${rows} صفًّا) — فلا تُرسَم أربعُمئة`) : bad('سقفُ الصفوف سقط', rows);
  await lp.close();

  console.log('٩-أ) التقرير لقارئ الشاشة');
  const ap = await browser.newPage();
  await ap.setContent(rep);
  await ap.waitForTimeout(250);
  const a11y = await ap.evaluate(() => {
    const tables = [...document.querySelectorAll('table')];
    const bars = [...document.querySelectorAll('.seg,.bar-fill')];
    const hs = [...document.querySelectorAll('h1,h2,h3,h4')].map((h) => +h.tagName[1]);
    const jumps = hs.filter((n, i) => i && n - hs[i - 1] > 1).length;
    return {
      unnamed: tables.filter((t) => !t.getAttribute('aria-label') && !t.querySelector('caption')).length,
      tables: tables.length,
      loudBars: bars.filter((e) => !e.closest('[aria-hidden="true"]')).length,
      jumps,
      h1: document.querySelectorAll('h1').length,
      svgNoName: [...document.querySelectorAll('svg')]
        .filter((x) => !x.closest('[role="img"]') && !x.getAttribute('aria-label') && !x.querySelector('title')).length,
    };
  });
  /* قارئُ الشاشة يتنقّل بين الجداول مستقلًّا عن النصّ، فجدولٌ بلا اسم يُسمَع
     «جدولٌ بخمسة أعمدة» ولا يُعرَف أيُّها — وكان سبعةٌ من ثمانية كذلك. */
  a11y.unnamed === 0 ? ok(`كلُّ جدولٍ يُنادى باسم قسمه (${a11y.tables})`) : bad('جداول بلا اسم', `${a11y.unnamed}/${a11y.tables}`);
  // والأشرطةُ زخرفة: معناها مكتوبٌ بجانبها، فلا تُتلى فارغةً.
  a11y.loudBars === 0 ? ok('والأشرطةُ زخرفةٌ مُخفاةٌ عن القارئ — معناها مكتوبٌ بجانبها') : bad('أشرطة تُتلى فارغة', a11y.loudBars);
  a11y.jumps === 0 && a11y.h1 === 1 ? ok('وتسلسلُ العناوين متّصل بعنوانٍ رئيسٍ واحد') : bad('تسلسل العناوين', `قفزات ${a11y.jumps} · h1 ${a11y.h1}`);
  a11y.svgNoName === 0 ? ok('ولكل رسمٍ متّجهٍ وصفُه') : bad('رسمٌ بلا وصف', a11y.svgNoName);
  await ap.close();

  console.log('٩-ب) قواعد الطباعة');
  const pp = await browser.newPage();
  await pp.setContent(rep);
  await pp.emulateMedia({ media: 'print' });
  await pp.waitForTimeout(250);
  const brk = await pp.evaluate(() => {
    const bi = (sel) => { const e = document.querySelector(sel); return e ? getComputedStyle(e).breakInside : null; };
    return {
      quote: bi('.voice .q'), card: bi('.act'), bcard: bi('.bcard'),
      voice: bi('.voice'), topics: bi('.topics'), recency: bi('.recency'),
    };
  });
  [brk.quote, brk.card, brk.bcard].filter((v) => v === 'avoid').length >= 2
    ? ok('الوحدةُ الصغيرة مصونةٌ من الكسر (اقتباس · بطاقة)') : bad('وحدةٌ بلا صون', JSON.stringify(brk));
  [brk.voice, brk.topics, brk.recency].every((v) => v === null || v === 'auto')
    ? ok('والحاويةُ الكبيرة تجري — فلا تُدفَع فتترك صفحةً بيضاء') : bad('حاويةٌ محبوسة', JSON.stringify(brk));
  await pp.close();

  await rp.close();

} catch (e) {
  bad('استثناء', e.message);
}

xssFired.length === 0 ? ok(`لم تُنفَّذ أي حمولة حقن (${xssFired.length})`) : bad('نُفِّذت حمولة حقن', xssFired.join('، '));
if (errors.length) { console.log('\nأخطاء الطرفية:'); errors.forEach(e => console.log('  !', e)); }
console.log('\n' + (fails.length ? `فشل ${fails.length}:\n` + fails.map(f => ' - ' + f).join('\n') : '✅ نجحت كل الاختبارات'));
await browser.close();
server.kill();
process.exit(fails.length || errors.length ? 1 : 0);
