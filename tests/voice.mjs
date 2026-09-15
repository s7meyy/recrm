// المرحلة ٣٨ — الأوامر الصوتية في المتصفّح: الزرّ في كل صفحة، والأمر يُنفَّذ فعلًا.
import { chromium } from './pw.mjs';
const BASE = process.env.TEST_URL || 'http://127.0.0.1:8235';
const b = await chromium.launch();
// كروم بلا رأسٍ لا يملك خدمة تعرّفٍ على الصوت، فنُركّب SpeechRecognition صوريًّا:
// ما يُختبر هنا هو ما بعد السماع — الفهمُ والتنفيذ، وهما كودُنا. أمّا السماع نفسه
// فخدمةُ المتصفّح لا كودُنا، ولا يُدَّعى اختبارها.
const page = await (await b.newContext({ locale: 'ar-SA' })).newPage();
await page.addInitScript(() => {
  class FakeRecognition {
    constructor() { this.lang = ''; this.onresult = null; this.onend = null; this.onerror = null; }
    start() { window.__rec = this; }
    stop() { this.onend?.(); }
  }
  window.SpeechRecognition = FakeRecognition;
  window.__say = (text) => {
    const r = window.__rec;
    if (!r) throw new Error('لم يبدأ الاستماع');
    r.onresult({ results: [[{ transcript: text }]] });
  };
});
const errors = [];
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
page.on('console', m => { const t = m.text(); if (m.type() === 'error' && !t.includes('ERR_') && !t.includes('Failed to load resource')) errors.push(t); });
const ok = (n, c, x = '') => console.log(`${c ? 'PASS' : 'FAIL'} — ${n}${x ? ' :: ' + x : ''}`);

await page.goto(BASE + '/');
await page.waitForTimeout(2200);

/* ===== الزرّ في كل صفحة ===== */
console.log('\n--- ٣٨. الزرّ ---');
ok('الزرّ موجود', await page.locator('.voice-btn').count() === 1);
ok('ومساحة لمسه ٤٤px فأكثر', await page.evaluate(() => {
  const r = document.querySelector('.voice-btn').getBoundingClientRect();
  return Math.min(r.width, r.height) >= 44;
}));
ok('واللوحة مطويّة حتى تُستعمل', await page.locator('#voice-bar').isHidden());

for (const r of ['properties', 'clients', 'map', 'settings', 'calendar']) {
  await page.evaluate((h) => { location.hash = h; }, `#/${r}`);
  await page.waitForTimeout(500);
  if (await page.locator('.voice-btn').count() !== 1) { ok(`الزرّ في صفحة ${r}`, false); break; }
}
ok('والزرّ في كل صفحةٍ تنقّلتَ إليها', await page.locator('.voice-btn').count() === 1);

/* ===== الأمر يُنفَّذ ===== */
console.log('\n--- ٣٨. التنفيذ ---');
const say = async (text) => {
  await page.locator('.voice-btn').click();
  await page.waitForTimeout(150);
  await page.evaluate((t) => window.__say(t), text);
  await page.waitForTimeout(800);
};

await page.evaluate(() => { location.hash = '#/today'; });
await page.waitForTimeout(600);
await say('افتح العقارات');
ok('«افتح العقارات» تفتحها فعلًا', (await page.evaluate(() => location.hash)) === '#/properties', await page.evaluate(() => location.hash));
ok('واللوحة تُري ما سُمع', (await page.locator('.voice-heard').innerText()).includes('افتح العقارات'), await page.locator('.voice-heard').innerText());
ok('وتصف ما فُعل بالعربية', (await page.locator('.voice-status').innerText()).includes('أفتح'), await page.locator('.voice-status').innerText());

await say('روح للعملاء');
ok('«روح للعملاء» كذلك', (await page.evaluate(() => location.hash)) === '#/clients', await page.evaluate(() => location.hash));

/* ما لا يُفهم يُقال ولا يُخمَّن */
const hashBefore = await page.evaluate(() => location.hash);
await say('أعطني فنجان قهوة');
ok('ما لا يُفهم لا يفتح صفحةً عشوائية', (await page.evaluate(() => location.hash)) === hashBefore);
ok('ويُقال صراحةً «لم أفهم»', (await page.locator('.voice-status').innerText()).includes('لم أفهم'), await page.locator('.voice-status').innerText());
ok('ومع الأمثلة تحته', await page.locator('.voice-help').count() === 1);

/* الإنشاء يفتح النموذج */
await say('عقار جديد');
await page.waitForTimeout(900);
ok('«عقار جديد» تفتح نموذج عقار', await page.locator('.modal').count() === 1 && (await page.locator('.modal').innerText()).includes('عقار جديد'),
  (await page.locator('.modal').count()) ? (await page.locator('.modal h2, .modal .modal-title').first().innerText()) : 'لا نافذة');
ok('والزرّ يختفي خلف النافذة فلا يُضغط بالخطأ', await page.locator('.voice-dock').isHidden());
await page.keyboard.press('Escape');
await page.waitForTimeout(500);
ok('ويعود بعد إغلاقها', await page.locator('.voice-dock').isVisible());

/* البحث */
await say('ابحث عن الرياض');
await page.waitForTimeout(700);
const searchVal = await page.locator('.search-modal-body input.search').inputValue();
ok('«ابحث عن …» تفتح البحث وتملأ الحقل', searchVal === 'الرياض', searchVal);
await page.keyboard.press('Escape');
await page.waitForTimeout(400);

/* المظهر يتغيّر ويُحفظ */
await say('الوضع الليلي');
await page.waitForTimeout(600);
ok('«الوضع الليلي» يحوّل المظهر', (await page.evaluate(() => document.documentElement.dataset.theme)) === 'dark',
  await page.evaluate(() => document.documentElement.dataset.theme));
const savedTheme = await page.evaluate(async () => (await (await import('/js/data/settings.js')).getUI()).theme);
ok('ويُحفظ اختيارًا لا لحظةً', savedTheme === 'dark', String(savedTheme));
await say('الوضع الفاتح');
await page.waitForTimeout(500);

console.log('\n' + (errors.length ? 'FAIL — أخطاء وحدة التحكّم :: ' + errors.join(' | ') : 'PASS — لا أخطاء في وحدة التحكّم'));
await b.close();
