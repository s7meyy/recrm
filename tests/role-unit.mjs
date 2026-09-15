// اختبار وحدة (المرحلة ٣٥): الدور في الكوكي — موقَّعًا، ولا يُبدّله صاحبه.
globalThis.Netlify = { env: { get: (k) => ({ APP_PASSWORD: 'owner-pass', APP_SECRET: 'topsecret', ASSISTANT_PASSWORD: 'helper-pass' }[k]) } };
const gate = (await import('../netlify/edge-functions/gate.js')).default;
process.env.APP_SECRET = 'topsecret';
const { roleOf } = await import('../netlify/lib/auth.js');

const ok = (n, c, x = '') => console.log(`${c ? 'PASS' : 'FAIL'} — ${n}${x ? ' :: ' + x : ''}`);
const ctx = { next: async () => new Response('APP HTML') };
const req = (path, init = {}) => new Request(`https://site.test${path}`, init);
const form = (obj) => ({ method: 'POST', body: new URLSearchParams(obj), headers: { 'content-type': 'application/x-www-form-urlencoded' } });
const cookieOf = (res) => (res.headers.get('set-cookie') || '').split(';')[0];
const withCookie = (c) => req('/api/x', { headers: { cookie: c } });

const ownerRes = await gate(req('/__login', form({ password: 'owner-pass', to: '/' })), ctx);
const ownerCookie = cookieOf(ownerRes);
ok('كلمة سرّ المالك تُصدر كوكي', ownerRes.status === 302 && ownerCookie.includes('kassab_gate='));
ok('ودورها «مالك»', (await roleOf(withCookie(ownerCookie))) === 'owner', String(await roleOf(withCookie(ownerCookie))));

const helperRes = await gate(req('/__login', form({ password: 'helper-pass', to: '/' })), ctx);
const helperCookie = cookieOf(helperRes);
ok('وكلمة سرّ المساعد تُصدر كوكي كذلك', helperRes.status === 302 && helperCookie.includes('kassab_gate='));
ok('ودورها «مساعد»', (await roleOf(withCookie(helperCookie))) === 'assistant', String(await roleOf(withCookie(helperCookie))));
ok('والكوكي لا تحمل كلمة السر', !helperCookie.includes('helper-pass'));

// الترقية بيد صاحبها: يبدّل الدور في الكوكي ويبقي التوقيع
const raw = helperCookie.slice('kassab_gate='.length);
const [expires, , mac] = raw.split('.');
const forged = `kassab_gate=${expires}.owner.${mac}`;
ok('ومساعدٌ يكتب «owner» في كوكيّه يُرفض', (await roleOf(withCookie(forged))) === null, String(await roleOf(withCookie(forged))));

const noRole = `kassab_gate=${expires}.${mac}`; // الشكل القديم بتوقيعٍ لا يخصّه
ok('وتوقيعٌ لا يطابق الشكل القديم يُرفض', (await roleOf(withCookie(noRole))) === null);

// كلمة سرّ خاطئة
const bad = await gate(req('/__login', form({ password: 'nope', to: '/' })), ctx);
ok('وكلمة سرّ ثالثة تُرفض', bad.status === 401);

// كلمة المساعد إن ساوت كلمة المالك: لا دور ثانٍ
globalThis.Netlify = { env: { get: (k) => ({ APP_PASSWORD: 'same', APP_SECRET: 'topsecret', ASSISTANT_PASSWORD: 'same' }[k]) } };
const same = await gate(req('/__login', form({ password: 'same', to: '/' })), ctx);
ok('ومساواة الكلمتين تُبقي الداخل مالكًا لا مساعدًا',
  (await roleOf(withCookie(cookieOf(same)))) === 'owner', String(await roleOf(withCookie(cookieOf(same)))));
