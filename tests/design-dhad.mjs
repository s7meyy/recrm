// هوية ضاد في متصفح حقيقي (المرحلة ٣٤): المقاييس والألوان والاتجاه والحالات التفاعلية.
//
// هذا الفحص يسأل عن التصميم ما يسأله المستعمل بيده لا بعينه: هل يصيب إصبعي الزرّ؟ هل أرى
// أين أنا حين أتنقّل بالمفاتيح؟ هل يردّ الزرّ حين أضغطه؟ هل يفيض شيءٌ خارج شاشتي؟
// وثلاثة مقاسات لا واحد: جوّال (٣٩٠) وآيباد (٧٦٨ و١٠٢٤) وسطح مكتب (١٤٤٠).
//
// وأكثرُه يقيس من `getComputedStyle` و`getBoundingClientRect` لا من نصّ CSS: قاعدةٌ مكتوبة
// قد تدهسها قاعدةٌ أخرى، والمقاس المحسوب هو ما يراه صاحب الجهاز فعلًا.
import { chromium } from './pw.mjs';

const BASE = process.env.TEST_URL || 'http://127.0.0.1:8235';
const b = await chromium.launch();
const ok = (n, c, x = '') => console.log(`${c ? 'PASS' : 'FAIL'} — ${n}${x ? ' :: ' + x : ''}`);
const errors = [];

const watch = (page) => {
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
  page.on('console', (m) => {
    const t = m.text();
    if (m.type() === 'error' && !t.includes('ERR_') && !t.includes('Failed to load resource')) errors.push(t);
  });
};

/* ===== ١. الرموز موجودة وتصل إلى الصفحة ===== */
console.log('\n--- ١. رموز ضاد ---');
const ctx = await b.newContext({ locale: 'ar-SA', viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
watch(page);
await page.goto(BASE + '/');
await page.waitForTimeout(2400);

const tokens = await page.evaluate(() => {
  const s = getComputedStyle(document.documentElement);
  const get = (n) => s.getPropertyValue(n).trim();
  return {
    space: [1, 2, 3, 4, 5, 6, 7, 8].map((i) => get(`--dhad-space-${i}`)),
    touch: get('--dhad-size-touch'),
    focus: get('--dhad-focus-width'),
    reading: get('--dhad-line-reading'),
    action: get('--dhad-color-action'),
    help: get('--dhad-color-help'),
    font: get('--dhad-font-body'),
    // الأسماء القديمة تشير إلى رموز ضاد، فلا يبقى في المشروع سلّمان
    accent: s.getPropertyValue('--accent').trim(),
  };
});
ok('سلّم المسافات كامل', tokens.space.join(',') === '4px,8px,12px,16px,24px,32px,40px,64px', tokens.space.join(','));
ok('ومساحة اللمس ٤٤', tokens.touch === '44px', tokens.touch);
ok('وعرض التركيز ٣', tokens.focus === '3px', tokens.focus);
ok('وسطر القراءة ١٫٧', tokens.reading === '1.7', tokens.reading);
ok('ولون المساعدة معرَّف', /^#/.test(tokens.help), tokens.help);
ok('وهوية المشروع باقية (الأخضر)', tokens.action.toLowerCase() === '#0f6e56', tokens.action);
ok('والأسماء القديمة تتبع ضاد', tokens.accent.toLowerCase() === '#0f6e56', tokens.accent);
ok('وخطّ ضاد أوّل الرصّة', tokens.font.startsWith('"IBM Plex Sans Arabic"'), tokens.font.slice(0, 40));

// الخط نفسه: أُنزل فعلًا لا اسمًا في CSS
const fonts = await page.evaluate(async () => {
  await document.fonts.ready;
  return [...document.fonts].filter((f) => f.family.includes('IBM Plex')).map((f) => `${f.weight}:${f.status}`);
});
ok('وملفّ الخط يُحمَّل فعلًا', fonts.some((f) => f.endsWith(':loaded')), fonts.join(' ') || 'لا شيء');

/* ===== ٢. النصّ العربي: سطرٌ يحمي التشكيل ===== */
console.log('\n--- ٢. النصّ العربي ---');
const typo = await page.evaluate(() => {
  const el = document.documentElement;
  const cs = getComputedStyle(el);
  const ratio = parseFloat(cs.lineHeight) / parseFloat(cs.fontSize);
  // نصٌّ مشكَّل: نقيس ارتفاع سطره فعلًا لا نظنّه
  const probe = document.createElement('p');
  probe.textContent = 'أَهْلًا بِكَ فِي كَسَّابٍ — مُحَرِّكُ العَقَارِ';
  probe.style.cssText = 'position:absolute;visibility:hidden;width:200px';
  document.body.appendChild(probe);
  const box = probe.getBoundingClientRect();
  const lines = Math.round(box.height / parseFloat(getComputedStyle(probe).lineHeight));
  const clipped = probe.scrollHeight > Math.ceil(box.height) + 1;
  probe.remove();
  return { ratio, letterSpacing: cs.letterSpacing, lines, clipped };
});
ok('ارتفاع السطر لا يقلّ عن ١٫٥', typo.ratio >= 1.5, String(typo.ratio));
// ضاد تمنع تباعد الحروف مع العربية: يفكّ وصل الحرف بما بعده
ok('ولا تباعد بين الحروف', typo.letterSpacing === 'normal' || typo.letterSpacing === '0px', typo.letterSpacing);
ok('ونصٌّ مشكَّل لا يُقصّ', typo.clipped === false, JSON.stringify(typo));

/* ===== ٣. الاتجاه: عربيةٌ من اليمين، وجزرٌ لاتينية في اتجاهها ===== */
console.log('\n--- ٣. الاتجاه ---');
const dir = await page.evaluate(() => {
  const side = document.querySelector('.sidebar').getBoundingClientRect();
  return {
    html: document.documentElement.dir,
    lang: document.documentElement.lang,
    // في RTL القائمةُ على اليمين: حافّتها اليمنى تلامس حافّة النافذة
    sidebarRight: Math.round(window.innerWidth - side.right),
  };
});
ok('الصفحة عربية RTL', dir.html === 'rtl' && dir.lang === 'ar', `${dir.lang}/${dir.html}`);
ok('والقائمة على يمين الشاشة', dir.sidebarRight === 0, String(dir.sidebarRight));

const islands = await page.evaluate(() => {
  const mk = (cls) => {
    const e = document.createElement('span');
    e.className = cls; e.textContent = '0501234567';
    document.body.appendChild(e);
    const cs = getComputedStyle(e);
    const out = { dir: cs.direction, bidi: cs.unicodeBidi };
    e.remove();
    return out;
  };
  return { tel: mk('tel'), ltr: mk('ltr'), num: mk('num') };
});
ok('الجوال جزيرة لاتينية معزولة', islands.tel.dir === 'ltr' && islands.tel.bidi === 'isolate', JSON.stringify(islands.tel));
ok('وصنف ltr كذلك', islands.ltr.dir === 'ltr' && islands.ltr.bidi === 'isolate', JSON.stringify(islands.ltr));
ok('والأرقام معزولة عن جوارها', islands.num.bidi === 'isolate', JSON.stringify(islands.num));

/* ===== ٤. الحالات التفاعلية: كل عنصر يُنقر يردّ ===== */
console.log('\n--- ٤. الحالات التفاعلية ---');
await page.evaluate(() => { location.hash = '#/properties'; });
await page.waitForTimeout(1800);

const hover = await page.evaluate(async () => {
  // نقارن ما تعطيه القاعدة نفسها: نستخرج خلفية العنصر ثم نحاكي :hover بإضافة الصنف مؤقتًا
  const btn = document.querySelector('.btn');
  if (!btn) return null;
  const before = getComputedStyle(btn).backgroundColor;
  return { before, text: btn.textContent.trim().slice(0, 20) };
});
if (hover) {
  await page.hover('.btn');
  await page.waitForTimeout(220);
  const after = await page.evaluate(() => getComputedStyle(document.querySelector('.btn')).backgroundColor);
  ok('الزرّ يتغيّر تحت المؤشّر', after !== hover.before, `${hover.before} → ${after}`);
} else ok('الزرّ يتغيّر تحت المؤشّر', false, 'لا زرّ في الصفحة');

// الضغط: حالة :active معرَّفة على الزرّ (وهي ردّ الجوال الوحيد إذ لا مؤشّر فيه)
const activeRules = await page.evaluate(() => {
  let n = 0;
  for (const sheet of document.styleSheets) {
    let rules; try { rules = sheet.cssRules; } catch (_) { continue; }
    for (const r of rules || []) if (r.selectorText && /:active/.test(r.selectorText)) n++;
  }
  return n;
});
ok('وحالة الضغط معرَّفة في الأنماط', activeRules >= 8, String(activeRules));

// التركيز يُرى: نُركّز بلوحة المفاتيح ونقيس الخطّ الخارجي
const focus = await page.evaluate(() => {
  const btn = document.querySelector('.btn');
  btn.focus({ focusVisible: true });
  const cs = getComputedStyle(btn);
  return { width: cs.outlineWidth, style: cs.outlineStyle, color: cs.outlineColor };
});
ok('والتركيز يُرى بثلاثة بكسلات', parseFloat(focus.width) >= 3 && focus.style !== 'none', JSON.stringify(focus));

// المحدَّد لا يُعرَف باللون وحده
const selected = await page.evaluate(() => {
  const a = document.querySelector('.sidebar-nav a.active');
  if (!a) return null;
  const cs = getComputedStyle(a);
  return { shadow: cs.boxShadow, bg: cs.backgroundColor };
});
ok('والصفحة المفتوحة عليها شريطٌ لا لونٌ وحده', !!selected && selected.shadow !== 'none', JSON.stringify(selected));

/* ===== ٥. مساحة اللمس على جهازٍ يُلمس ===== */
console.log('\n--- ٥. مساحة اللمس (جوّال) ---');
const touchCtx = await b.newContext({
  locale: 'ar-SA', viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true,
});
const touchPage = await touchCtx.newPage();
watch(touchPage);
await touchPage.goto(BASE + '/');
await touchPage.waitForTimeout(2400);

const control = await touchPage.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--dhad-size-control').trim());
ok('الارتفاع يرتفع إلى ٤٤ على اللمس', control === '44px' || control === 'var(--dhad-size-touch)', control);

const ROUTES = [
  'today', 'dashboard', 'opportunities', 'properties', 'map', 'clients', 'tours',
  'requests', 'matches', 'external', 'pricing', 'calendar', 'invoices', 'expenses',
  'publish', 'tasks', 'notes', 'health', 'settings',
];

// نبذر بياناتٍ كي تُرسم الصفحات على محتوًى لا على فراغ
await touchPage.evaluate(async () => {
  const { repo } = await import('/js/data/repository.js');
  const c = await repo.clients.create({ name: 'عميل التصميم', phone: '0500002222' });
  const p = await repo.properties.create({
    type: 'villa', city: 'الرياض', district: 'النرجس', area: 420, price: 2100000,
    captureStatus: 'approved', purposes: ['sale'], status: 'agreed',
  });
  await repo.requests.create({
    clientId: c.id, type: 'villa', purpose: 'sale', city: 'الرياض',
    districts: ['النرجس'], budgetMax: 2300000, area: 420, status: 'active',
  });
  await repo.showings.create({ at: new Date(Date.now() + 86400000).toISOString(), clientId: c.id, propertyId: p.id });
});

const small = [];
const overflow = [];
for (const route of ROUTES) {
  await touchPage.evaluate(() => { location.hash = '#/__none'; });
  await touchPage.waitForTimeout(140);
  await touchPage.evaluate((r) => { location.hash = `#/${r}`; }, route);
  await touchPage.waitForTimeout(1300);

  const bad = await touchPage.evaluate(() => {
    const out = [];
    const nodes = document.querySelectorAll(
      '#page button, #page a[href], #page input:not([type=hidden]), #page select, #page textarea, .topbar button, .topbar label'
    );
    for (const el of nodes) {
      if (getComputedStyle(el).visibility === 'hidden') continue;
      // المستثنى بقصد: خلايا التقويم، وأزرار الصور المركَّبة فوق الصورة، ونسبة الخريطة
      // إلى Leaflet وOpenStreetMap — وهذه الأخيرة حقٌّ أدبيّ لصاحب الخريطة لا زرٌّ لنا،
      // وتُكتب صغيرةً في كل موقع يستعملها. وما عداها له بديلٌ أكبر في الصفحة نفسها.
      if (el.closest('.cal-cell, .img-tile, .note-colors, .leaflet-control')) continue;
      // حقلٌ مخفيّ بصريًّا (`.visually-hidden`) ليس هو ما يُلمس: تسميتُه `<label class="btn">`
      // هي الزرّ الظاهر، وقد قيست مع بقيّة الأزرار.
      if (el.classList.contains('visually-hidden')) continue;
      // مربّع الاختيار داخل تسميته: **التسمية** هي ما يُلمس فعلًا، فهي التي تُقاس.
      const target = el.closest('label') || el;
      const r = target.getBoundingClientRect();
      if (!r.width || !r.height) continue;                 // مخفي
      if (r.height < 30) out.push(`${el.className || el.tagName}:${Math.round(r.height)}`);
    }
    return { small: out.slice(0, 4), scroll: document.documentElement.scrollWidth, inner: window.innerWidth };
  });
  if (bad.small.length) small.push(`${route} → ${bad.small.join(', ')}`);
  if (bad.scroll > bad.inner + 1) overflow.push(`${route} (${bad.scroll})`);
}
ok(`مساحات اللمس كافية في كل الصفحات (${ROUTES.length})`, small.length === 0, small.slice(0, 3).join(' | '));
ok('ولا فيض أفقي على ٣٩٠', overflow.length === 0, overflow.join(', '));

/* ===== ٦. الآيباد وسطح المكتب ===== */
console.log('\n--- ٦. الآيباد وسطح المكتب ---');
for (const [name, width, height] of [['آيباد عموديًا', 768, 1024], ['آيباد أفقيًا', 1024, 768], ['سطح مكتب', 1440, 900]]) {
  const c2 = await b.newContext({ locale: 'ar-SA', viewport: { width, height } });
  const p2 = await c2.newPage();
  watch(p2);
  await p2.goto(BASE + '/');
  await p2.waitForTimeout(2200);
  const over = [];
  for (const route of ['today', 'dashboard', 'properties', 'clients', 'calendar', 'invoices', 'settings']) {
    await p2.evaluate(() => { location.hash = '#/__none'; });
    await p2.waitForTimeout(120);
    await p2.evaluate((r) => { location.hash = `#/${r}`; }, route);
    await p2.waitForTimeout(1100);
    const s = await p2.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
    if (s.scroll > s.inner + 1) over.push(`${route} (${s.scroll})`);
  }
  ok(`لا فيض أفقي على ${name} (${width})`, over.length === 0, over.join(', '));
  await c2.close();
}

/* ===== ٧. الوضع الليلي: لا لونَ فاتحٍ ثابتٍ يتسرّب ===== */
console.log('\n--- ٧. الوضع الليلي ---');
const darkCtx = await b.newContext({ locale: 'ar-SA', colorScheme: 'dark', viewport: { width: 1280, height: 900 } });
const darkPage = await darkCtx.newPage();
watch(darkPage);
await darkPage.goto(BASE + '/');
await darkPage.waitForTimeout(2400);
const lum = (rgb) => {
  const [r, g, bl] = (rgb.match(/\d+/g) || [0, 0, 0]).map(Number);
  return (0.2126 * r + 0.7152 * g + 0.0722 * bl) / 255;
};
const dark = await darkPage.evaluate(() => {
  const cs = getComputedStyle(document.body);
  const root = getComputedStyle(document.documentElement);
  return { bg: root.getPropertyValue('--bg').trim(), text: cs.color, scheme: root.colorScheme };
});
ok('الوضع الليلي يُلتقط من النظام', dark.scheme.includes('dark'), dark.scheme);
ok('والخلفية داكنة', dark.bg.toLowerCase() === '#121714', dark.bg);

// التبديل اليدوي في الإعدادات يغلب تفضيل النظام في الاتجاهين — وإلا صار الاختيار زينة.
const manual = await darkPage.evaluate(() => {
  const html = document.documentElement;
  const read = () => getComputedStyle(html).getPropertyValue('--bg').trim().toLowerCase();
  const before = html.getAttribute('data-theme');
  html.setAttribute('data-theme', 'light');
  const light = read();
  html.setAttribute('data-theme', 'dark');
  const dark = read();
  if (before === null) html.removeAttribute('data-theme'); else html.setAttribute('data-theme', before);
  return { light, dark };
});
ok('و«فاتح» يدويًّا يغلب نظامًا داكنًا', manual.light === '#f2f4f1', manual.light);
ok('و«داكن» يدويًّا يبقى داكنًا', manual.dark === '#121714', manual.dark);

// صفّ الجدول تحت المؤشّر كان مكتوبًا لونًا فاتحًا ثابتًا فيبيضّ ليلًا — نتحقّق أنه صار رمزًا
await darkPage.evaluate(() => { location.hash = '#/properties'; });
await darkPage.waitForTimeout(1800);
const rowHover = await darkPage.evaluate(() => {
  for (const sheet of document.styleSheets) {
    let rules; try { rules = sheet.cssRules; } catch (_) { continue; }
    for (const r of rules || []) {
      if (r.selectorText === '.table tbody tr:hover') return r.style.background || r.style.backgroundColor;
    }
  }
  return null;
});
ok('وصفّ الجدول تحت المؤشّر رمزٌ لا لونٌ ثابت', !!rowHover && rowHover.includes('var('), String(rowHover));

/* ===== ٨. الصفحة العامة تلبس الهوية نفسها ===== */
console.log('\n--- ٨. الصفحة العامة ---');
const pubCtx = await b.newContext({ locale: 'ar-SA', viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const pub = await pubCtx.newPage();
watch(pub);
await pub.goto(BASE + '/offers/');
await pub.waitForTimeout(1800);
const pubId = await pub.evaluate(() => {
  const root = getComputedStyle(document.documentElement);
  return {
    hasTokens: root.getPropertyValue('--dhad-size-touch').trim(),
    accent: root.getPropertyValue('--accent').trim(),
    font: getComputedStyle(document.body).fontFamily,
    line: getComputedStyle(document.body).lineHeight,
    size: getComputedStyle(document.body).fontSize,
    scroll: document.documentElement.scrollWidth,
    inner: window.innerWidth,
    dir: document.documentElement.dir,
  };
});
ok('ملف الهوية يصل الصفحة العامة', pubId.hasTokens === '44px', pubId.hasTokens);
ok('وبالأخضر نفسه', pubId.accent.toLowerCase() === '#0f6e56', pubId.accent);
ok('وبخطّ ضاد', pubId.font.includes('IBM Plex Sans Arabic'), pubId.font.slice(0, 40));
ok('وسطرها للقراءة', (parseFloat(pubId.line) / parseFloat(pubId.size)).toFixed(2) === '1.70', `${pubId.line}/${pubId.size}`);
ok('ولا فيض أفقي فيها', pubId.scroll <= pubId.inner + 1, `${pubId.scroll} > ${pubId.inner}`);
ok('وهي RTL', pubId.dir === 'rtl', pubId.dir);

/* ===== ٩. لا أخطاء في أي صفحة زرناها ===== */
console.log('\n--- ٩. الإجمال ---');
ok('لا أخطاء في المتصفح', errors.length === 0, errors.slice(0, 3).join(' | '));

await b.close();
