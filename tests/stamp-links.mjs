// المرحلة ٣٨ — جلب الروابط للختم: حدوده حقيقية ويُختبر على الخادم المقفل (يلزمه مالك).
import { chromium } from './pw.mjs';
const BASE = process.env.TEST_URL || 'http://127.0.0.1:8234';
const b = await chromium.launch();
const page = await (await b.newContext({ locale: 'ar-SA' })).newPage();
const ok = (n, c, x = '') => console.log(`${c ? 'PASS' : 'FAIL'} — ${n}${x ? ' :: ' + x : ''}`);

await page.goto(BASE + '/');
await page.fill('input[type="password"]', 'secret-pass');
await page.click('button[type="submit"]');
await page.waitForTimeout(2200);

// بلا جلسةٍ أصلًا: مرفوض قبل أي فحصٍ آخر — فالموقع ليس وسيط تحميلٍ للناس
const anon = await (await b.newContext()).newPage();
await anon.goto(BASE + '/');
const anonStatus = await anon.evaluate(async () => (await fetch('/api/fetch-media?url=' + encodeURIComponent('https://example.com/a.jpg'))).status);
ok('بلا تسجيل دخول: مرفوض 401 (لا يصير الموقع وسيط تحميل)', anonStatus === 401, String(anonStatus));

/* ===== جلب الروابط: حدوده حقيقية ===== */
console.log('\n--- ٣٨. جلب الروابط ---');
const linkChecks = await page.evaluate(async () => {
  const call = async (u) => {
    const res = await fetch(`/api/fetch-media?url=${encodeURIComponent(u)}`);
    const body = await res.json().catch(() => ({}));
    return { status: res.status, error: body.error || '' };
  };
  return {
    http: await call('http://example.com/a.jpg'),
    local: await call('https://127.0.0.1/a.jpg'),
    privateNet: await call('https://192.168.1.5/a.jpg'),
    metadata: await call('https://metadata.google.internal/x.jpg'),
    bad: await call('ليس رابطًا'),
  };
});
ok('http مرفوض (https فقط)', linkChecks.http.status === 400 && linkChecks.http.error.includes('https'), linkChecks.http.error);
ok('والمضيف المحلّي مرفوض', linkChecks.local.status === 400 && linkChecks.local.error.includes('داخلية'), linkChecks.local.error);
ok('والشبكة الخاصّة مرفوضة', linkChecks.privateNet.status === 400 && linkChecks.privateNet.error.includes('داخلية'), linkChecks.privateNet.error);
ok('وخدمة البيانات الوصفية في السحابة مرفوضة (لا باب خلفيّ)', linkChecks.metadata.status === 400, linkChecks.metadata.error);
ok('والرابط الفاسد يُردّ برسالةٍ مفهومة', linkChecks.bad.status === 400 && linkChecks.bad.error.includes('غير صالح'), linkChecks.bad.error);


console.log('');
await b.close();
