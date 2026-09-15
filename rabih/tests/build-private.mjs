// اختبار النسخة المشفَّرة: يبني ملفًا واحدًا ثم يتحقّق أنه يفي بوعده.
//
//   node tests/build-private.mjs
//
// الوعد ثلاثة: لا يُقرأ من التطبيق حرفٌ بلا كلمة السر، وكلمةٌ خاطئة لا تفتحه،
// والصحيحةُ تُخرج تطبيقًا كاملًا مرتَّبًا ترتيبًا يصحّ تشغيله.

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { webcrypto as crypto } from 'node:crypto';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const PASS = 'kalima-sirr-ikhtibar-9317';

const fails = [];
const ok = (t) => console.log('  ✓', t);
const bad = (t, e) => { fails.push(t + (e ? ' :: ' + e : '')); console.log('  ✗', t, e || ''); };

const out = mkdtempSync(join(tmpdir(), 'rabih-dist-'));

try {
  console.log('١) البناء');
  const short = spawnSync(process.execPath, [join(ROOT, 'tools/build-private.mjs'), 'قصيرة', out], { encoding: 'utf8' });
  short.status === 1 ? ok('كلمة سر قصيرة تُرفض') : bad('رفض الكلمة القصيرة', 'status=' + short.status);

  const built = spawnSync(process.execPath, [join(ROOT, 'tools/build-private.mjs'), PASS, out], { encoding: 'utf8' });
  if (built.status !== 0) { bad('البناء', (built.stderr || '').slice(0, 200)); throw new Error('توقّف البناء'); }
  ok('بُني بلا خطأ');

  const files = readdirSync(out).sort();
  ['.nojekyll', 'icon.svg', 'index.html'].every((f) => files.includes(f))
    ? ok('مخرجات المجلد: ' + files.join('، ')) : bad('مخرجات ناقصة', files.join('، '));

  console.log('٢) لا تسرّب نصًّا ظاهرًا');
  const page = readFileSync(join(out, 'index.html'), 'utf8');
  // عيّنات من الشيفرة والواجهة: لو ظهر أيٌّ منها فالنسخة ليست مشفَّرة حقًّا.
  const leaks = [
    ['دالّة من app.js', 'function designHtmlWithPhotos'],
    ['ميثاق الرسائل', 'CHARTER'],
    ['نصّ من الواجهة', 'رابط قوقل مابز'],
    ['اسم وحدة', 'lexicon.js'],
  ];
  for (const [what, needle] of leaks) {
    page.includes(needle) ? bad('تسرّب ' + what, needle) : ok('لا يظهر ' + what);
  }
  /cipher: "[A-Za-z0-9+/=]{4000,}"/.test(page)
    ? ok('الحمولة نصٌّ مشفَّر كبير') : bad('الحمولة المشفَّرة', 'لم يُعثر على cipher كافٍ');

  console.log('٣) فكّ التشفير');
  const DATA = {
    salt: page.match(/salt: "([^"]+)"/)[1],
    iv: page.match(/iv: "([^"]+)"/)[1],
    cipher: page.match(/cipher: "([^"]+)"/)[1],
    iterations: Number(page.match(/iterations: (\d+)/)[1]),
  };
  DATA.iterations >= 310000 ? ok('دورات PBKDF2: ' + DATA.iterations) : bad('دورات قليلة', String(DATA.iterations));

  const unb64 = (s) => Uint8Array.from(Buffer.from(s, 'base64'));
  async function unlock(password) {
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: unb64(DATA.salt), iterations: DATA.iterations, hash: 'SHA-256' },
      base, { name: 'AES-GCM', length: 256 }, false, ['decrypt'],
    );
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(DATA.iv) }, key, unb64(DATA.cipher));
    return JSON.parse(new TextDecoder().decode(plain));
  }

  let opened = false;
  try { await unlock(PASS + 'x'); opened = true; } catch { /* المتوقَّع */ }
  opened ? bad('كلمة خاطئة فتحت النسخة') : ok('كلمة خاطئة لا تفتح شيئًا');

  const app = await unlock(PASS);
  ok('الكلمة الصحيحة تفكّ الحمولة');

  console.log('٤) سلامة التطبيق المفكوك');
  app.entry === 'js/app.js' ? ok('المدخل js/app.js') : bad('المدخل', String(app.entry));
  const onDisk = readdirSync(join(ROOT, 'js')).filter((f) => f.endsWith('.js')).length;
  const inApp = app.order.filter((f) => f.startsWith('js/') && !f.slice(3).includes('/')).length;
  inApp === onDisk ? ok(`كل وحدات js حاضرة (${inApp})`) : bad('وحدات ناقصة', `${inApp}/${onDisk}`);
  app.order.every((f) => typeof app.files[f] === 'string' && app.files[f].length)
    ? ok('لكل وحدة شيفرتها') : bad('وحدة بلا شيفرة');
  app.order[app.order.length - 1] === app.entry
    ? ok('المدخل آخر الترتيب') : bad('موضع المدخل', app.order[app.order.length - 1]);
  app.css.includes('--navy') || app.css.length > 1000 ? ok('التنسيق مضمَّن') : bad('التنسيق');
  app.body.includes('design-card') ? ok('جسد الصفحة كامل (فيه خطوة التصميم)') : bad('جسد الصفحة ناقص');
  /<script[^>]*src="js\/app\.js"/.test(app.body) ? bad('وسم السكربت باقٍ في الجسد') : ok('وسم سكربت التطبيق أُزيل');

  console.log('٥) الترتيب الطوبولوجي');
  const seen = new Set();
  let broken = null;
  for (const f of app.order) {
    for (const m of app.files[f].matchAll(/['"]rabih:([^'"]+\.js)['"]/g)) {
      // مفاتيح التخزين تبدأ بـrabih: أيضًا، والمُعرَّف وحده ما كان ملفًّا معروفًا.
      if (!app.files[m[1]]) continue;
      if (!seen.has(m[1])) { broken = `${f} يسبق متبوعه ${m[1]}`; break; }
    }
    if (broken) break;
    seen.add(f);
  }
  broken ? bad('ترتيب خاطئ', broken) : ok('كل وحدة بعد ما تعتمد عليه');
  app.files[app.entry].includes('rabih:js/schema.js')
    ? ok('الاستيراد النسبي أُعيدت كتابته إلى rabih:') : bad('لم يُعَد كتابة الاستيراد');
} catch (e) {
  bad('استثناء', e.message);
} finally {
  rmSync(out, { recursive: true, force: true });
}

console.log('\n' + (fails.length ? `فشل ${fails.length}:\n` + fails.map((f) => ' - ' + f).join('\n') : '✅ نجحت كل الاختبارات'));
process.exit(fails.length ? 1 : 0);
