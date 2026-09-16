// مشغّل كل اختبارات كسّاب.
//   node tests/run.mjs            كل الحزم
//   node tests/run.mjs gate vault تصفية بالاسم
//
// يشغّل خادمَي اختبار: مقفلًا (بوابة دخول) ومفتوحًا (بلا بوابة)، ثم كل حزمة على الخادم المناسب،
// ويجمع نتائج أسطر PASS/FAIL. يخرج بحالة غير صفرية إن فشل شيء — فيصلح للتشغيل الآلي.

import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const LOCKED = 8234;
const OPEN = 8235;

// كل حزمة: الملف، والخادم الذي تعمل عليه (مقفل/مفتوح)
const SUITES = [
  ['gate-unit.mjs', null],            // بلا متصفح ولا خادم
  ['push-unit.mjs', null],
  ['opportunity-unit.mjs', null],
  ['pricing-unit.mjs', null],
  ['money-unit.mjs', null],
  ['route-qr-csv-unit.mjs', null],
  ['vat-unit.mjs', null],
  ['perf-profile-unit.mjs', null],
  ['plans-score-unit.mjs', null],
  ['deals-sources-unit.mjs', null],
  ['duplicates-unit.mjs', null],
  ['showings-unit.mjs', null],
  ['forecast-adcopy-unit.mjs', null],
  ['slots-unit.mjs', null],
  ['meta-unit.mjs', null],
  ['agreements-vat-unit.mjs', null],
  ['calendar-lock-unit.mjs', null],
  ['evidence-revival-unit.mjs', null],
  ['role-unit.mjs', null],
  ['integrations-unit.mjs', null],
  ['hijri-unit.mjs', null],
  ['voice-unit.mjs', null],
  ['whatsapp-unit.mjs', null],
  ['management-unit.mjs', null],
  ['offer-paste-unit.mjs', null],
  ['rega-unit.mjs', null],
  ['task-intake-unit.mjs', null],
  ['deed-parse-unit.mjs', null],
  ['guard-plural-unit.mjs', null],
  ['app-pages.mjs', OPEN],
  ['mobile-smoke.mjs', OPEN],
  ['design-dhad.mjs', OPEN],
  ['sidebar-order.mjs', OPEN],
  ['source-and-priority.mjs', OPEN],
  ['invoices.mjs', OPEN],
  ['invoices-lifecycle.mjs', OPEN],
  ['today-and-tools.mjs', OPEN],
  ['opportunities.mjs', OPEN],
  ['expenses-and-tools.mjs', OPEN],
  ['pricing.mjs', OPEN],
  ['money-and-health.mjs', OPEN],
  ['import-route-qr.mjs', OPEN],
  ['vat-and-contacts.mjs', OPEN],
  ['profile-and-quick.mjs', OPEN],
  ['trash-and-storage.mjs', OPEN],
  ['plans-and-paste.mjs', OPEN],
  ['deals-and-sources.mjs', OPEN],
  ['merge-cma-voice.mjs', OPEN],
  ['showings.mjs', OPEN],
  ['forecast-adcopy.mjs', OPEN],
  ['agreements-vat.mjs', OPEN],
  ['calendar-lock.mjs', OPEN],
  ['evidence-revival.mjs', OPEN],
  ['scale-perf.mjs', OPEN],
  ['debts.mjs', OPEN],
  ['integrations.mjs', OPEN],
  ['products-and-user.mjs', OPEN],
  ['map-colors.mjs', OPEN],
  ['hijri.mjs', OPEN],
  ['stamp.mjs', OPEN],
  ['voice.mjs', OPEN],
  ['management.mjs', OPEN],
  ['offer-paste.mjs', OPEN],
  ['tasks-table.mjs', OPEN],
  ['extract.mjs', OPEN],
  ['deals-router.mjs', OPEN],
  ['guard-input.mjs', OPEN],
  ['gate-and-publish.mjs', LOCKED],
  ['rename-and-vault.mjs', LOCKED],
  ['offer-pwa-push.mjs', LOCKED],
  ['client-links.mjs', LOCKED],
  ['leads.mjs', LOCKED],
  ['intake-and-views.mjs', LOCKED],
  ['booking.mjs', LOCKED],
  ['english-meta.mjs', LOCKED],
  ['stamp-links.mjs', LOCKED],
  ['whatsapp.mjs', LOCKED],
];

function startServer(port, open) {
  const child = spawn(process.execPath, ['--import', `${ROOT}/tests/loader.mjs`, `${ROOT}/tests/server.mjs`], {
    env: { ...process.env, TEST_PORT: String(port), TEST_OPEN: open ? '1' : '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stderr.on('data', (b) => { const t = String(b); if (!t.includes('ExperimentalWarning')) process.stderr.write(t); });
  return child;
}

async function waitFor(port) {
  for (let i = 0; i < 60; i++) {
    try { await fetch(`http://127.0.0.1:${port}/offers/`); return true; } catch (_) { await sleep(250); }
  }
  throw new Error(`تعذر تشغيل خادم الاختبار على ${port}`);
}

function runSuite(file, port) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['--import', `${ROOT}/tests/loader.mjs`, `${ROOT}/tests/${file}`], {
      env: { ...process.env, TEST_URL: port ? `http://127.0.0.1:${port}` : undefined },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    child.stdout.on('data', (b) => { out += b; });
    child.stderr.on('data', (b) => { out += b; });
    child.on('close', (code) => {
      const pass = (out.match(/^PASS/gm) || []).length;
      const fail = (out.match(/^FAIL/gm) || []).length;
      resolve({ file, pass, fail, code, out });
    });
  });
}

const filter = process.argv.slice(2);
const wanted = SUITES.filter(([f]) => !filter.length || filter.some((k) => f.includes(k)));

const locked = startServer(LOCKED, false);
const open = startServer(OPEN, true);
await Promise.all([waitFor(LOCKED), waitFor(OPEN)]);

let totalPass = 0;
let totalFail = 0;
for (const [file, port] of wanted) {
  const r = await runSuite(file, port);
  totalPass += r.pass;
  totalFail += r.fail;
  // خروجٌ بغير صفر = انهيار الحزمة، ولو بعد نجاحاتٍ سُجِّلت. كان يُحسب نجاحًا ما دام
  // سطر PASS واحد قد طُبع، فتسقط بقيّة الحزمة صامتةً وتُقرأ خضراء (المرحلة ٣٨).
  const crashed = r.code !== 0;
  if (crashed) totalFail += 1;
  const bad = r.fail > 0 || crashed;
  console.log(`${bad ? '✗' : '✓'} ${file.padEnd(26)} ${r.pass} PASS  ${r.fail} FAIL${crashed ? `  (انهارت: رمز ${r.code})` : ''}`);
  if (bad) console.log(r.out.split('\n').filter((l) => /^FAIL|Error|error/.test(l)).slice(0, 6).map((l) => `    ${l}`).join('\n'));
}

locked.kill();
open.kill();
console.log(`\nالمجموع: ${totalPass} ناجح · ${totalFail} فاشل`);
process.exit(totalFail ? 1 : 0);
