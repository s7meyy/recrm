// المرحلة ٤٤: حارس المدخلات ومعجم المعدودات — بلا متصفّح.
import { countOf, countWord, NOUNS } from '../js/util/format.js';
const ok = (n, c, x = '') => console.log(`${c ? 'PASS' : 'FAIL'} — ${n}${x ? ' :: ' + x : ''}`);

console.log('--- ٤٤. معجم المعدودات ---');
ok('لكل اسمٍ أربعُ صيغ', Object.values(NOUNS).every((f) => Array.isArray(f) && f.length === 4),
  String(Object.keys(NOUNS).length));
ok('ولا صيغةَ فارغة', Object.values(NOUNS).every((f) => f.every((x) => typeof x === 'string' && x.trim())));

ok('الواحدُ مفردٌ بلا رقم', countOf(1, 'عقار') === 'عقارٌ واحد', countOf(1, 'عقار'));
ok('والاثنان مثنّى بلا رقم', countOf(2, 'عقار') === 'عقاران', countOf(2, 'عقار'));
ok('وما بين ٣ و١٠ جمعٌ', countOf(3, 'عقار').includes('عقارات') && countOf(10, 'عقار').includes('عقارات'),
  `${countOf(3, 'عقار')} · ${countOf(10, 'عقار')}`);
ok('و١١ فما فوق تمييزٌ مفرد', countOf(11, 'عقار').includes('عقارًا') && countOf(25, 'عقار').includes('عقارًا'),
  `${countOf(11, 'عقار')} · ${countOf(25, 'عقار')}`);
ok('و١٠٣ تعود إلى الجمع (٣ من المئة)', countOf(103, 'عقار').includes('عقارات'), countOf(103, 'عقار'));
ok('والصفرُ لا ينفجر', countOf(0, 'عقار').includes('عقار'), countOf(0, 'عقار'));

console.log('\n--- ٤٤. الوصفُ يتبع معدودَه ---');
ok('«٣ عقارات مختارة» لا «٣ عقارات مختار»', countOf(3, 'عقار مختار') === '3 عقارات مختارة', countOf(3, 'عقار مختار'));
ok('و«عقاران مختاران»', countOf(2, 'عقار مختار') === 'عقاران مختاران', countOf(2, 'عقار مختار'));
ok('و«١١ عقارًا مختارًا»', countOf(11, 'عقار مختار') === '11 عقارًا مختارًا', countOf(11, 'عقار مختار'));
ok('و«٣ عروض خارجية»', countOf(3, 'عرض خارجي') === '3 عروض خارجية', countOf(3, 'عرض خارجي'));
ok('و«٣ طلبات نشطة»', countOf(3, 'طلب نشط') === '3 طلبات نشطة', countOf(3, 'طلب نشط'));

console.log('\n--- ٤٤. اسمٌ ليس في المعجم ---');
ok('يُعاد كما هو ولا يُخترع له جمع', countOf(3, 'شيءٌ غريب') === '3 شيءٌ غريب', countOf(3, 'شيءٌ غريب'));
ok('و`countWord` القديمة ما زالت تعمل', countWord(3, ['أ', 'ب', 'ج', 'د']) === '3 ج', countWord(3, ['أ', 'ب', 'ج', 'د']));

console.log('\n--- ٤٤. لا موضعَ يلصق عددًا باسمٍ مفرد ---');
// الفحصُ نفسه يمنع عودة العطب: أيُّ `${…} اسمٌ عربيّ` جديدٍ يُكشف هنا.
const { readFileSync, readdirSync, statSync } = await import('node:fs');
const files = [];
const walk = (dir) => {
  for (const e of readdirSync(dir)) {
    const p = `${dir}/${e}`;
    if (statSync(p).isDirectory()) walk(p);
    else if (p.endsWith('.js')) files.push(p);
  }
};
walk(new URL('../js', import.meta.url).pathname.replace(/\/$/, ''));
/* **والصفحةُ العامّة تُفحص أيضًا** (المرحلة ٥٢): كان الحارسُ يفحص `js/` وحدها،
   **فالصفحةُ الوحيدة التي يقرؤها الغريبُ هي الوحيدة بلا حارس** — وخرج فيها
   «6 غرفة» و«2 أدوار» و«1 شوارع» إلى عملاء المكتب. */
walk(new URL('../offers', import.meta.url).pathname.replace(/\/$/, ''));
const NUM = /\$\{(?:formatNumber\([^}]*?\)|[A-Za-z_$][\w$.[\]]*(?:\.length)?)\}\s+([؀-ۿ]{2,14})/g;
const SAFE = new Set(['ريال', 'من', 'هـ', 'م', '٪', 'بـ', 'في', 'و', 'أو', 'إلى', 'متر', 'بياناتك', 'غير', 'جاهزة', 'انتهت', 'بنحو', 'جديد', 'أخرى', 'بلا', 'آخر', 'منها', 'بانتظار', 'مختار', 'مسمّى']);
const NOUN_SURFACE = new Set(Object.keys(NOUNS).flatMap((k) => k.split(' ')));
const bad = [];
for (const f of files) {
  // ملفّا المعجم نفسُهما يحملان الصيغَ الأربع، فلا يُتَّهمان بما هما علاجُه.
  if (f.endsWith('util/format.js') || f.endsWith('offers/i18n.js')) continue;
  const lines = readFileSync(f, 'utf8').split('\n');
  lines.forEach((line, i) => {
    // `countAr` معجمُ الصفحة العامّة — سطرٌ يستعمله عالَجَ جمعَه فلا يُتَّهم.
    if (line.includes('countOf') || line.includes('countWord') || line.includes('countAr')) return;
    for (const m of line.matchAll(NUM)) {
      const w = m[1].replace(/[،.]$/, '');
      if (SAFE.has(w) || !NOUN_SURFACE.has(w)) continue;
      bad.push(`${f.split(/\/(?:js|offers)\//)[1]}:${i + 1} «${w}»`);
    }
  });
}
ok('لا عددٌ ملصوقٌ باسمٍ من المعجم في المستودع كلّه', bad.length === 0, bad.slice(0, 4).join(' | '));
