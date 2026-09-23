// المرحلة ٤٨ — الهيكل: مجموعاتُ القائمة، وحالُ المزامنة.
import { SIDEBAR_PAGES, SIDEBAR_GROUPS, groupOf, DEFAULT_PAGE_KEYS } from '../js/util/sidebar.js';
import { syncState, STALE_MS } from '../js/util/sync-dot.js';
const ok = (n, c, x = '') => console.log(`${c ? 'PASS' : 'FAIL'} — ${n}${x ? ' :: ' + x : ''}`);

/* ===== مجموعات القائمة ===== */
ok('أربعُ مجموعاتٍ لا أكثر', SIDEBAR_GROUPS.length === 4, String(SIDEBAR_GROUPS.length));
ok('ولكلٍّ عنوانٌ عربيّ', SIDEBAR_GROUPS.every((g) => g.key && g.label));
ok('**وكلُّ صفحةٍ في مجموعة** — فلا يسقط بابٌ خارج التجميع',
  SIDEBAR_PAGES.every((p) => p.group), SIDEBAR_PAGES.filter((p) => !p.group).map((p) => p.key).join('،'));
ok('ولا مجموعةَ خارج الأربع',
  SIDEBAR_PAGES.every((p) => SIDEBAR_GROUPS.some((g) => g.key === p.group)));
// **والعددُ يُرفع بالإضافة وحدَها**: صار ثمانيًا وعشرين بصفحة السوق (المرحلة ٥٠)،
// وتسعًا وعشرين بالوارد (٥١)، وثلاثين بـ«الفرص العقاريّة» (٥٣)، وواحدًا وثلاثين بـ«إدارة المرافق» (٥٤).
// وحرسُه أن ينقص أو يقفز بلا مرحلةٍ تذكره — لا أن يثبت أبدًا.
ok('ولا صفحةَ حُذفت: واحدٌ وثلاثون بعد إدارة المرافق', DEFAULT_PAGE_KEYS.length === 31, String(DEFAULT_PAGE_KEYS.length));
ok('ولا مفتاحَ مكرَّر', new Set(DEFAULT_PAGE_KEYS).size === DEFAULT_PAGE_KEYS.length);
ok('و«يومي» في العمل، و«المالية» في المال', groupOf('today') === 'work' && groupOf('expenses') === 'money');
ok('و«العقود والتراخيص» في الالتزام', groupOf('rega') === 'duty' && groupOf('management') === 'duty');
ok('و«السلّة» و«الإعدادات» أدوات', groupOf('trash') === 'tools' && groupOf('settings') === 'tools');
ok('ومفتاحٌ مجهولٌ يقع في الأدوات لا يسقط', groupOf('لا وجود له') === 'tools');
const counts = SIDEBAR_GROUPS.map((g) => SIDEBAR_PAGES.filter((p) => p.group === g.key).length);
ok('ولا مجموعةَ فارغة', counts.every((n) => n > 0), counts.join('،'));
ok('ومجموعُ المجموعات = مجموعُ الصفحات', counts.reduce((a, b) => a + b, 0) === SIDEBAR_PAGES.length);

/* ===== حالُ المزامنة ===== */
const NOW = Date.parse('2026-09-15T12:00:00Z');
const ago = (ms) => new Date(NOW - ms).toISOString();
ok('**من لم يُفعّل المزامنة لا تُزعجه نقطة**', syncState({ sync: false }, NOW).state === 'off');
ok('وبلا إعداداتٍ أصلًا', syncState({}, NOW).state === 'off' && syncState(undefined, NOW).state === 'off');
ok('ومزامنةٌ قريبةٌ ناجحة = خضراءُ صامتة',
  syncState({ sync: true, lastSyncAt: ago(60000) }, NOW).state === 'ok');
ok('**والخطأُ يُقال ونصُّه معه** — والنظامُ يعرف أنّه فشل، فليقُله',
  syncState({ sync: true, lastSyncAt: ago(60000), lastSyncError: 'لا شبكة' }, NOW).state === 'error');
ok('ونصُّ الخطأ يحمل سببه',
  syncState({ sync: true, lastSyncError: 'لا شبكة' }, NOW).text.includes('لا شبكة'));
ok('والخطأُ يغلب القِدَم — فما فشل أهمُّ ممّا تأخّر',
  syncState({ sync: true, lastSyncAt: ago(5 * 86400000), lastSyncError: 'خطأ' }, NOW).state === 'error');
ok('ويومٌ بلا نجاحٍ يصير خبرًا',
  syncState({ sync: true, lastSyncAt: ago(STALE_MS + 1000) }, NOW).state === 'stale');
ok('وما دون اليوم لا يُزعج',
  syncState({ sync: true, lastSyncAt: ago(STALE_MS - 1000) }, NOW).state === 'ok');
ok('ونصُّ القِدَم يقول كم مضى',
  syncState({ sync: true, lastSyncAt: ago(3 * 86400000) }, NOW).text.includes('3 أيام'),
  syncState({ sync: true, lastSyncAt: ago(3 * 86400000) }, NOW).text);
ok('ومفعّلةٌ لم تتمّ بعد تُقال كذلك لا تُخمَّن',
  syncState({ sync: true }, NOW).state === 'never');
ok('وتاريخٌ فاسدٌ لا ينفجر ولا يُقرأ نجاحًا',
  syncState({ sync: true, lastSyncAt: 'كلام' }, NOW).state === 'never');
ok('وكلُّ حالٍ لها نصٌّ يُقرأ إلّا المطفأة',
  ['ok', 'stale', 'error', 'never'].every((st) => {
    const v = { ok: { sync: true, lastSyncAt: ago(1000) }, stale: { sync: true, lastSyncAt: ago(3 * 86400000) },
      error: { sync: true, lastSyncError: 'x' }, never: { sync: true } }[st];
    return syncState(v, NOW).text.length > 10;
  }));


/* ===== المرحلة ٥٤: حارسُ الروابط الميّتة ===== */
console.log('\n--- ٥٤. كلُّ رابطٍ يقع على مسارٍ موجود ---');
/**
 * **العطبُ الذي وقع فعلًا**: بطاقةُ «خُذ نسخةً احتياطيّة» في قائمة البدء كانت تشير إلى
 * `#/tools` — **و«الأدوات» اسمُ مجموعةٍ في القائمة لا اسمُ صفحة**. فكان زرُّ أوّلِ خطوةٍ
 * يُوصي بها النظامُ مستخدمَه الجديدَ يهبط به على «مسارٌ غير معروف».
 *
 * ولا يكشفه فحصُ متصفّحٍ إلّا أن يُنقر ذلك الزرُّ بعينه. فصار يُقرأ من الشيفرة نفسِها.
 */
{
  const { readFileSync, readdirSync, statSync } = await import('node:fs');
  const root = new URL('../js', import.meta.url).pathname.replace(/\/$/, '');
  const jsFiles = [];
  const walk = (d) => {
    for (const e of readdirSync(d)) {
      const p = `${d}/${e}`;
      if (statSync(p).isDirectory()) walk(p);
      else if (p.endsWith('.js')) jsFiles.push(p);
    }
  };
  walk(root);
  const app = readFileSync(`${root}/app.js`, 'utf8');
  const known = new Set([...app.matchAll(/^\s{2}([a-zA-Z-]+):\s*\{\s*title:/gm)].map((m) => m[1]));
  const dead = [];
  for (const f of jsFiles) {
    readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
      if (/^\s*(\/\/|\*)/.test(line)) return;   // شرحٌ يذكر مسارًا لا يقصده
      for (const m of line.matchAll(/(?:href:\s*|location\.hash\s*=\s*)['"`]#\/([a-zA-Z-]+)/g)) {
        if (!known.has(m[1])) dead.push(`${f.split('/js/')[1]}:${i + 1} → #/${m[1]}`);
      }
    });
  }
  ok('**ولا رابطَ يقع على مسارٍ غير مسجَّل** في المستودع كلّه', dead.length === 0, dead.join(' · '));
  ok('وكلُّ صفحةٍ في القائمة لها مسار',
    [...new Set(SIDEBAR_PAGES.map((p) => p.key))].every((k) => known.has(k)),
    SIDEBAR_PAGES.map((p) => p.key).filter((k) => !known.has(k)).join(','));
}
