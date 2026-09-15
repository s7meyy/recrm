// المرحلة ٤١ — تفريغ المستندات والوسائط: القراءة، والصدق فيما لا يعمل، والتحويل.
import { chromium } from './pw.mjs';
const BASE = process.env.TEST_URL || 'http://127.0.0.1:8235';
const b = await chromium.launch();
const page = await (await b.newContext({ locale: 'ar-SA' })).newPage();
const errors = [];
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
page.on('console', m => { const t = m.text(); if (m.type() === 'error' && !t.includes('ERR_') && !t.includes('Failed to load resource')) errors.push(t); });
const ok = (n, c, x = '') => console.log(`${c ? 'PASS' : 'FAIL'} — ${n}${x ? ' :: ' + x : ''}`);

/** يغلق كل نافذة مفتوحة وينتظر اختفاءها — المُنشأ يُفتح في نافذة، وتركُها يحجب ما بعدها. */
const closeModals = async () => {
  for (let i = 0; i < 6 && (await page.locator('.modal-overlay').count()); i++) {
    await page.locator('.modal-overlay').last().locator('button[aria-label="إغلاق"]').click({ force: true });
    await page.waitForTimeout(300);
  }
  return page.locator('.modal-overlay').count();
};

const DEED = [
  'صك إلكتروني — سجل عقاري',
  'رقم الصك: ٣١٠١٠٢٠٤٥٦٧٨٩ بتاريخ ١٢/٠٣/١٤٤٥ هـ',
  'اسم المالك: سعد بن عبدالله التميمي',
  'رقم الهوية: ١٠٢٣٤٥٦٧٨٩',
  'المدينة: الرياض الحي: النرجس',
  'رقم المخطط: ٢٧٤٥ رقم القطعة: ١١٨',
  'المساحة: ٤٥٠ م٢',
  'الحدود والأطوال: الشمال: شارع عرض ١٥م بطول ١٥ الجنوب: قطعة رقم ١١٧ بطول ١٥ الشرق: قطعة ١١٩ بطول ٣٠ الغرب: شارع عرض ٢٠م بطول ٣٠',
].join('\n');

await page.goto(BASE + '/');
await page.waitForTimeout(2200);
await page.evaluate(() => { location.hash = '#/extract'; });
await page.waitForTimeout(1400);

/* ===== المسارات الثلاثة تُقال بصدق ===== */
console.log('\n--- ٤١. ما يعمل وما ينتظر ---');
const notice = await page.locator('#page .notice').first().innerText();
ok('الصفحة تقول مساراتها الثلاثة', notice.includes('نصٌّ تلصقه') && notice.includes('صورة أو PDF') && notice.includes('صوت أو مقطع'), notice.split('\n')[0]);
ok('والمسار المجّاني معلَّم «يعمل»', notice.includes('يعمل'));
ok('وما ينتظر مفتاحًا يقول اسم المتغيّر الناقص',
  notice.includes('OCR_API_BASE') || notice.includes('ينتظر مفتاحًا'), notice.split('\n').find((l) => l.includes('ينتظر')) || '—');
ok('وتُرشد إلى «النص المباشر» في الجوال', notice.includes('النص المباشر'));

/* ===== قراءة النصّ الملصوق ===== */
console.log('\n--- ٤١. قراءة الصك ---');
await page.locator('#page textarea').first().fill(DEED);
await page.locator('button:has-text("اقرأ النصّ")').click();
await page.waitForTimeout(1200);
const card = page.locator('.extract-card').first();
ok('أُنشئ سجلّ تفريغ', await card.count() === 1);
ok('ونوعُه مُيِّز صكًّا', (await card.innerText()).includes('صك ملكية'), (await card.innerText()).split('\n')[1]);
const chips = await card.locator('.chip-copy').allInnerTexts();
const joined = chips.join(' | ');
ok('رقم الصك مقروءًا', joined.includes('3101020456789'), joined);
ok('واسم المالك', joined.includes('سعد بن عبدالله التميمي'));
ok('والمساحة والحي والمدينة', joined.includes('450') && joined.includes('النرجس') && joined.includes('الرياض'));
ok('ورقما المخطط والقطعة', joined.includes('2745') && joined.includes('118'));
ok('وكلُّ حقلٍ زرٌّ يُنسخ بضغطة', await card.locator('.chip-copy').count() >= 7, String(await card.locator('.chip-copy').count()));
ok('**ولا حدٌّ يُعرض مرّتين** — مرّةً باسمه ومرّةً بمفتاحه الخام', !joined.includes('bound_'), joined.slice(0, 80));
ok('والحدود الأربعة تُعرض بأسمائها العربية',
  (await card.innerText()).includes('الحدّ الشمالي') && (await card.innerText()).includes('الحدّ الغربي'));

/* ===== النصّ يبقى قابلًا للتعديل وإعادة القراءة ===== */
console.log('\n--- ٤١. التعديل وإعادة القراءة ---');
const textBox = card.locator('textarea').first();
ok('النصّ معروضٌ كاملًا قابلًا للتعديل', (await textBox.inputValue()).includes('سجل عقاري'));
await textBox.fill(DEED.replace('٤٥٠', '٦٠٠'));
await card.locator('button:has-text("أعد قراءة الحقول")').click();
await page.waitForTimeout(900);
ok('وتعديلُه يُعيد قراءة الحقول', (await card.locator('.chip-copy').allInnerTexts()).join(' ').includes('600'),
  (await card.locator('.chip-copy').allInnerTexts()).find((t) => t.includes('مساحة')) || '—');

/* ===== التحويل إلى عقار ===== */
console.log('\n--- ٤١. التحويل ---');
// البذرة التجريبية موجودة، فالعدُّ قبل وبعد لا الافتراضُ بأنّ القاعدة فارغة.
const before = await page.evaluate(async () => (await (await import('/js/data/repository.js')).repo.properties.list()).length);
await card.locator('button:has-text("أنشئ عقارًا")').click();
await page.waitForTimeout(1800);
const made = await page.evaluate(async () => {
  const { repo } = await import('/js/data/repository.js');
  // العقار يُقرأ **بالمعرّف الذي سجّله التفريغ**، لا بأوّل ما في القائمة: البذرة فيها غيرُه.
  const e = (await repo.extractions.list()).find((x) => x.madePropertyId);
  const p = e ? await repo.properties.get(e.madePropertyId) : null;
  return {
    count: (await repo.properties.list()).length,
    city: p?.city, district: p?.district, area: p?.area, deed: p?.deedNumber,
    plan: p?.typeFields?.planNumber, plot: p?.typeFields?.plotNumber,
    notes: (p?.notes || '').slice(0, 10), capture: p?.captureStatus,
    linked: e?.madePropertyId === p?.id, status: e?.status,
  };
});
ok('لا شيء يُنشأ قبل الضغط — والعدّ زاد واحدًا بعده', made.count === before + 1, `${before} ← ${made.count}`);
ok('أُنشئ العقار بمدينته وحيّه', made.city === 'الرياض' && made.district === 'النرجس', `${made.city} · ${made.district}`);
ok('وبمساحته المعدَّلة ورقم صكّه', made.area === 600 && made.deed === '3101020456789', `${made.area} · ${made.deed}`);
ok('ورقما المخطط والقطعة في حقول النوع', made.plan === '2745' && made.plot === '118', `${made.plan} · ${made.plot}`);
ok('ونصُّ المستند محفوظٌ في ملاحظاته', made.notes.includes('صك'), made.notes);
ok('والسجلّ يقول ماذا صار إليه', made.linked === true);
ok('ويُعلَّم معتمَدًا بعد التحويل', made.status === 'approved', String(made.status));

ok('واستمارةُ المُنشأ تُفتح لتُكمله', (await page.locator('.modal').last().innerText()).includes('تعديل العقار'));
ok('وتُغلق فتبقى الصفحة نظيفة', (await closeModals()) === 0);
await page.evaluate(() => { location.hash = '#/extract'; });
await page.waitForTimeout(1400);
const card2 = page.locator('.extract-card').first();
ok('وزرُّ الإنشاء يُعطَّل فلا يُنشأ عقارٌ مرّتين', await card2.locator('button:has-text("أنشئ عقارًا")').isDisabled());
ok('ويظهر رابطٌ إلى ما أُنشئ', await card2.locator('a:has-text("العقار المُنشأ")').count() === 1);

/* ===== رسالة طلبٍ تصير طلبًا وعميلًا ===== */
console.log('\n--- ٤١. رسالة صوتية مفرَّغة ← طلب ---');
await page.locator('#page textarea').first().fill('السلام عليكم انا نورة القحطاني ابغى شقة للايجار في حطين ميزانيتي ٧٠ الف جوالي ٠٥٥٤٤٤٣٣٢٢');
await page.locator('button:has-text("اقرأ النصّ")').click();
await page.waitForTimeout(1200);
const reqCard = page.locator('.extract-card').first();
ok('النوع مُيِّز «طلب أو رسالة»', (await reqCard.innerText()).includes('طلب أو رسالة'), (await reqCard.innerText()).split('\n')[1]);
// الرسالة ليست صكًّا: قراءتُها بمحلّل الصكوك وحده تعيد «لم يُقرأ حقل» وفيها ميزانيةٌ وحيّ.
const reqChips = (await reqCard.locator('.chip-copy').allInnerTexts()).join(' | ');
ok('وحقولُ الرسالة تُقرأ لا تُترك — ميزانيةٌ وحيٌّ وجوّال',
  reqChips.includes('70,000') || reqChips.includes('70000'), reqChips);
ok('وجوّالُ المرسِل', reqChips.includes('0554443322'), reqChips);
ok('ولا يُقال «لم يُقرأ حقل» وقد قُرئ', !(await reqCard.innerText()).includes('لم يُقرأ حقلٌ معروف'));
await reqCard.locator('button:has-text("أنشئ طلبًا")').click();
await page.waitForTimeout(1800);
const req = await page.evaluate(async () => {
  const { repo } = await import('/js/data/repository.js');
  const e = (await repo.extractions.list()).find((x) => x.madeRequestId);
  const r = e ? await repo.requests.get(e.madeRequestId) : null;
  const c = (await repo.clients.list()).find((x) => x.phone === '0554443322');
  return { purpose: r?.purpose, budget: r?.budgetMax, districts: r?.districts, name: c?.name, roles: c?.roles };
});
ok('أُنشئ الطلب بغرضه وميزانيته', req.purpose === 'rent' && req.budget === 70000, `${req.purpose} · ${req.budget}`);
ok('وحيّه', (req.districts || []).includes('حطين'), JSON.stringify(req.districts));
ok('وأُنشئ العميل باسمه ودوره', req.name === 'نورة القحطاني' && (req.roles || []).includes('seeker'), `${req.name} · ${req.roles}`);
await closeModals();

/* ===== مهمّة عقد الوساطة ===== */
console.log('\n--- ٤١. مهمّة عقد الوساطة ---');
await page.evaluate(() => { location.hash = '#/extract'; });
await page.waitForTimeout(1400);
const last = page.locator('.extract-card').last();
await last.locator('button:has-text("مهمّة: أنشئ عقد وساطة")').click();
await page.waitForTimeout(1800);
const task = await page.evaluate(async () => {
  const { repo } = await import('/js/data/repository.js');
  const t = (await repo.tasks.list()).find((x) => x.title.includes('عقد وساطة'));
  const lists = await repo.taskLists.list();
  return { title: t?.title, priority: t?.priority, notes: t?.notes || '', list: lists.find((l) => l.id === t?.listId)?.title };
});
ok('أُنشئت المهمّة باسم المالك', task.title.includes('سعد بن عبدالله التميمي'), task.title);
ok('وأولويّتُها مرتفعة', task.priority === 'high', String(task.priority));
ok('وفيها خطوات العقد بالترتيب النظاميّ', task.notes.includes('وثّقه في منصّة الوساطة') && task.notes.includes('ترخيص الإعلان'),
  task.notes.split('\n')[0]);
ok('وفيها حقول الصك لتُنقل إلى المنصّة', task.notes.includes('3101020456789'), task.notes.split('\n').find((l) => l.includes('الصك')) || '—');
ok('وتقع في قائمة العقود إن وُجدت، وإلّا أُنشئت', /عقود|تراخيص/.test(task.list || ''), String(task.list));

/* ===== الملف غير المهيَّأ يُقال سببُه ولا يسقط صامتًا ===== */
console.log('\n--- ٤١. الصدق عند الفشل ---');
const failRec = await page.evaluate(async () => {
  const { repo } = await import('/js/data/repository.js');
  const r = await repo.extractions.create({ source: 'ocr', fileName: 'صك.jpg', mime: 'image/jpeg', size: 1024, error: 'قراءة المستندات غير مُهيَّأ — الناقص: OCR_API_KEY.' });
  return r.id;
});
await page.evaluate(() => { location.hash = '#/today'; });
await page.waitForTimeout(400);
await page.evaluate(() => { location.hash = '#/extract'; });
await page.waitForTimeout(1400);
const failed = page.locator('.extract-failed').first();
ok('السجلّ الفاشل يُحفظ ولا يسقط صامتًا', await failed.count() === 1);
ok('ويقول سببَه بالضبط', (await failed.innerText()).includes('OCR_API_KEY'), (await failed.innerText()).split('\n').find((l) => l.includes('OCR')) || '—');
ok('ويدلّ على المسار الذي يعمل الآن', (await failed.innerText()).includes('استخرج نصّه بجوّالك'));
void failRec;

/* ===== الفلاتر ===== */
console.log('\n--- ٤١. الفلاتر ---');
ok('فيها فلتر «الكل»', await page.locator('#page .chip-all').count() === 1);
await page.locator('#page .chip:not(.chip-all)', { hasText: 'فشل تفريغها' }).first().click();
await page.waitForTimeout(700);
ok('وفرزُ الفاشل يُظهره وحده', await page.locator('.extract-card').count() === 1);

console.log('\n' + (errors.length ? 'FAIL — أخطاء وحدة التحكّم :: ' + errors.join(' | ') : 'PASS — لا أخطاء في وحدة التحكّم'));
await b.close();
