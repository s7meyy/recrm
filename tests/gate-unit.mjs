// اختبار بوابة الدخول: يشغّل كود الحافة نفسه (gate.js) في Node مع بيئة مُحاكية.
globalThis.Netlify = { env: { get: (k) => ({ APP_PASSWORD: 'secret-pass', APP_SECRET: 'topsecret' }[k]) } };
const gate = (await import('../netlify/edge-functions/gate.js')).default;
const { config } = await import('../netlify/edge-functions/gate.js');
let nextCalled = 0;
const ctx = { next: async () => { nextCalled++; return new Response('APP HTML'); } };
const ok = (n, c, x = '') => console.log(`${c ? 'PASS' : 'FAIL'} — ${n}${x ? ' :: ' + x : ''}`);
const req = (path, init = {}) => new Request(`https://site.test${path}`, init);
const form = (obj) => { const f = new URLSearchParams(obj); return { method: 'POST', body: f, headers: { 'content-type': 'application/x-www-form-urlencoded' } }; };

// ١) بلا كوكي: لا يصل الزائر إلى ملفات التطبيق أصلًا
let res = await gate(req('/'), ctx);
let body = await res.clone().text();
ok('زائر بلا كوكي يُمنع ولا يُسلَّم أي ملف من التطبيق', res.status === 200 && body.includes('أدخل كلمة السر') && !body.includes('APP HTML') && nextCalled === 0);

// ٢) كلمة سر خاطئة
res = await gate(req('/__login', form({ password: 'wrong', to: '/' })), ctx);
ok('كلمة سر خاطئة تُرفض بـ401', res.status === 401 && (await res.text()).includes('غير صحيحة'));

// ٣) كلمة سر صحيحة → كوكي
res = await gate(req('/__login', form({ password: 'secret-pass', to: '/#/clients' })), ctx);
const setCookie = res.headers.get('set-cookie') || '';
ok('كلمة السر الصحيحة تُصدر كوكي وتعيد التوجيه', res.status === 302 && setCookie.includes('kassab_gate=') && res.headers.get('location') === '/#/clients');
ok('الكوكي HttpOnly وSecure وSameSite', setCookie.includes('HttpOnly') && setCookie.includes('Secure') && setCookie.includes('SameSite=Lax'), setCookie.split(';').slice(1).join(';').trim());
const cookieValue = setCookie.split(';')[0];
ok('الكوكي لا تحتوي كلمة السر نفسها', !setCookie.includes('secret-pass'));

// ٤) كوكي صحيحة تمرّ
res = await gate(req('/', { headers: { cookie: cookieValue } }), ctx);
ok('الكوكي الصحيحة تمرّر الطلب إلى التطبيق', nextCalled === 1 && (await res.text()) === 'APP HTML');

// ٥) كوكي معدَّلة تُرفض
const tampered = cookieValue.slice(0, -1) + (cookieValue.slice(-1) === 'a' ? 'b' : 'a');
res = await gate(req('/', { headers: { cookie: tampered } }), ctx);
ok('توقيع مزوَّر يُرفض', nextCalled === 1 && (await res.text()).includes('أدخل كلمة السر'));

// ٦) كوكي منتهية تُرفض
const expired = `kassab_gate=${Date.now() - 1000}.deadbeef`;
res = await gate(req('/', { headers: { cookie: expired } }), ctx);
ok('كوكي منتهية الصلاحية تُرفض', nextCalled === 1 && (await res.text()).includes('أدخل كلمة السر'));

// ٧) تسجيل الخروج يمسح الكوكي
res = await gate(req('/__logout', { headers: { cookie: cookieValue } }), ctx);
ok('تسجيل الخروج يمسح الكوكي', res.status === 302 && (res.headers.get('set-cookie') || '').includes('Max-Age=0'));

// ٨) الاستثناءات: الصفحة العامة والدوال خارج البوابة
ok('صفحة العروض العامة مستثناة من البوابة', config.excludedPath.includes('/offers') && config.excludedPath.includes('/offers/*'), config.excludedPath.join(' '));
ok('مسارات الدوال مستثناة من البوابة', config.excludedPath.includes('/api/*'));
ok('البوابة تغطي كل ما عداها', config.path === '/*');

// ٩) بلا كلمة سر مضبوطة لا تُقفل البوابة الموقع (حماية من حبس المالك)
globalThis.Netlify = { env: { get: () => undefined } };
const before = nextCalled;
await gate(req('/'), ctx);
ok('غياب متغيّر كلمة السر لا يحبس المالك خارج موقعه', nextCalled === before + 1);
