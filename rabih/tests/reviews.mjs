// اختبار موصّل المزوّد الوسيط بلا متصفح وبلا حساب: يُنصَب مزوّدان مزيّفان
// يردّان بشكل الردّ الحقيقي، فيُختبَر التطبيع والدمج والحدود ورسائل الخطأ.
//
//   node tests/reviews.mjs

import { createServer } from 'node:http';
import { mergeReviews } from '../js/reviews.js';

const fails = [];
const ok = (t) => console.log('  ✓', t);
const bad = (t, e) => { fails.push(t + (e ? ' :: ' + e : '')); console.log('  ✗', t, e || ''); };

/* ── مزوّدان مزيّفان على شكل الردّ الحقيقي ── */
let lastReq = null;
const srv = createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  lastReq = { path: u.pathname, params: Object.fromEntries(u.searchParams), key: req.headers['x-api-key'] };
  res.setHeader('content-type', 'application/json');
  if (u.pathname.startsWith('/maps/reviews-v3')) {
    if (lastReq.key !== 'KEY-OUT') { res.statusCode = 401; return res.end(JSON.stringify({ errorMessage: 'مفتاح غير صالح' })); }
    return res.end(JSON.stringify({ data: [{
      name: 'مقهى الدرب', rating: 4.3, reviews: 310,
      reviews_data: [
        { author_title: 'أحمد', review_rating: 5, review_text: 'القهوة ممتازة.', review_datetime_utc: '2026-08-01 10:00:00', owner_answer: 'شكرًا لك.' },
        { author_title: 'نورة', review_rating: 2, review_text: 'الانتظار طويل.', review_datetime_utc: '2026-07-11 09:00:00', owner_answer: '' },
        { author_title: 'بلا نصّ', review_rating: null, review_text: '' },
        { author_title: 'أحمد', review_rating: 5, review_text: 'القهوة ممتازة.' },
      ],
    }] }));
  }
  if (u.pathname.includes('google-maps-reviews-scraper')) {
    if (u.searchParams.get('token') !== 'TOK-APIFY') { res.statusCode = 403; return res.end(JSON.stringify({ error: { message: 'رمز غير صالح' } })); }
    return res.end(JSON.stringify([
      { title: 'مقهى الدرب', totalScore: 4.3, reviewsCount: 310, name: 'خالد', stars: 4, text: 'جيد.', publishedAtDate: '2026-06-01T00:00:00Z', responseFromOwnerText: 'سعدنا بك.' },
      { name: 'سارة', stars: 1, text: 'سيئ.', publishedAtDate: '2026-05-01T00:00:00Z' },
    ]));
  }
  res.statusCode = 404; res.end('{}');
});
await new Promise((r) => srv.listen(0, r));
const port = srv.address().port;

// الدالّة تنادي المزوّد بعنوانه الحقيقي، فيُحوَّل fetch إلى الخادم المزيّف.
const realFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = new URL(input instanceof URL ? input.href : (typeof input === 'string' ? input : input.url));
  if (/outscraper|apify/.test(url.hostname)) {
    url.protocol = 'http:'; url.hostname = '127.0.0.1'; url.port = String(port);
    return realFetch(url, init);
  }
  return realFetch(input, init);
};

const { default: handler } = await import('../netlify/functions/reviews.js');
const call = async (qs, env = {}) => {
  const saved = { ...process.env };
  Object.assign(process.env, env);
  const res = await handler(new Request('https://x/api/reviews?' + qs));
  process.env = saved;
  return { status: res.status, body: await res.json() };
};
const MAPS = encodeURIComponent('https://maps.app.goo.gl/AbC');

try {
  console.log('١) الحدود والأمان');
  let r = await call('url=' + MAPS, {});
  (r.status === 503 && r.body.needsKey) ? ok('بلا مفتاح: يُرشد ولا ينهار — ' + r.body.error.slice(0, 40)) : bad('حالة بلا مفتاح', r.status);

  r = await call('url=' + encodeURIComponent('http://169.254.169.254/latest/meta-data/'), { OUTSCRAPER_KEY: 'KEY-OUT' });
  (r.status === 400 && /خرائط قوقل/.test(r.body.error)) ? ok('عنوان داخلي مرفوض قبل أي طلب') : bad('رفض العنوان الداخلي', JSON.stringify(r).slice(0, 80));

  r = await call('url=' + encodeURIComponent('https://evil.example.com/maps'), { OUTSCRAPER_KEY: 'KEY-OUT' });
  r.status === 400 ? ok('مضيف غير قوقل مرفوض') : bad('رفض المضيف الغريب', r.status);

  r = await call('url=' + MAPS, { OUTSCRAPER_KEY: 'BAD-KEY' });
  (r.status === 502 && /Outscraper/.test(r.body.error)) ? ok('مفتاح مرفوض: يُنقَل خطأ المزوّد كما هو') : bad('خطأ المفتاح', JSON.stringify(r).slice(0, 90));

  // مفتاحٌ لُصق ومعه حرف عربي أو سطر جديد كان يُسقط الدالّة برسالة مبهمة.
  // السطر الجديد اللاصق بالنسخ يُقلَّم ولا يُعطَّل به الجلب.
  const trimmed = await call('url=' + MAPS, { OUTSCRAPER_KEY: 'KEY-OUT\n' });
  trimmed.status === 200 ? ok('سطرٌ جديد لاصقٌ بالمفتاح يُقلَّم ويمضي الجلب') : bad('تقليم المفتاح', JSON.stringify(trimmed).slice(0, 90));

  for (const [what, val] of [['حرف عربي', 'مفتاح'], ['مسافة داخلية', 'KEY OUT']]) {
    const bad1 = await call('url=' + MAPS, { OUTSCRAPER_KEY: val });
    (bad1.status === 400 && /غير صالح/.test(bad1.body.error))
      ? ok(`مفتاح فيه ${what}: رسالة واضحة لا انهيار`)
      : bad(`مفتاح فيه ${what}`, JSON.stringify(bad1).slice(0, 100));
  }

  console.log('٢) Outscraper');
  r = await call('url=' + MAPS + '&limit=0&sort=newest', { OUTSCRAPER_KEY: 'KEY-OUT' });
  r.status === 200 ? ok('الجلب نجح') : bad('الجلب', JSON.stringify(r.body).slice(0, 120));
  r.body.provider === 'outscraper' ? ok('المزوّد معلن في الردّ') : bad('اسم المزوّد', r.body.provider);
  r.body.fetched === 3 ? ok('ثلاثة تعليقات صالحة (أُسقط الفارغ)') : bad('عدد المجلوب', r.body.fetched);
  r.body.claimed === 310 ? ok('عدد قوقل المُعلن محفوظ (310) فيُقاس النقص') : bad('claimed', r.body.claimed);
  const a = r.body.reviews[0];
  (a.author === 'أحمد' && a.rating === 5 && a.text === 'القهوة ممتازة.' && a.ownerReply === 'شكرًا لك.')
    ? ok('التطبيع سليم: الاسم والتقييم والنص وردّ المالك في حقله')
    : bad('التطبيع', JSON.stringify(a));
  a.date === '2026-08-01 10:00:00' ? ok('التاريخ كما ورد بلا تخمين') : bad('التاريخ', a.date);
  lastReq.params.sort === 'newest' ? ok('الترتيب مُمرَّر للمزوّد') : bad('الترتيب', lastReq.params.sort);

  console.log('٣) Apify');
  r = await call('url=' + MAPS + '&provider=apify', { APIFY_TOKEN: 'TOK-APIFY' });
  (r.status === 200 && r.body.provider === 'apify') ? ok('الجلب من Apify') : bad('Apify', JSON.stringify(r.body).slice(0, 120));
  r.body.fetched === 2 ? ok('تعليقان') : bad('عدد Apify', r.body.fetched);
  const k = r.body.reviews[0];
  (k.author === 'خالد' && k.rating === 4 && k.ownerReply === 'سعدنا بك.')
    ? ok('أسماء حقول Apify المختلفة طُبِّعت إلى العقد نفسه') : bad('تطبيع Apify', JSON.stringify(k));
  r.body.claimed === 310 ? ok('عدد قوقل من عنصر Apify') : bad('claimed Apify', r.body.claimed);

  console.log('٤) الدمج مع ما لُصق بيدك');
  const mine = [{ id: 'R001', author: 'أحمد', rating: 5, text: 'القهوة ممتازة.', ownerReply: '', date: 'قبل شهر', language: '', likes: null }];
  const incoming = (await call('url=' + MAPS, { OUTSCRAPER_KEY: 'KEY-OUT' })).body.reviews;
  const m = mergeReviews(mine, incoming);
  // مكرّران: واحد يطابق ما بيدك، وواحد مكرَّر داخل ردّ المزوّد نفسه.
  m.duplicates === 2 ? ok('المكرّر لم يُضَف: لا ما يطابق يدك ولا ما تكرّر في ردّ المزوّد') : bad('كشف التكرار', m.duplicates);
  m.added === 1 ? ok('أُضيف الجديد وحده') : bad('المضاف', m.added);
  m.reviews[0].id === 'R001' ? ok('ما بيدك بقي في مكانه بمعرّفه') : bad('ثبات المعرّف', m.reviews[0].id);
  m.reviews.length === 2 ? ok('المجموع صحيح') : bad('المجموع', m.reviews.length);
  const m2 = mergeReviews(m.reviews, incoming);
  m2.added === 0 ? ok('إعادة الجلب لا تُضاعف شيئًا') : bad('الجلب المكرر', m2.added);
} catch (e) {
  bad('استثناء', e.message);
} finally {
  srv.close();
}

console.log('٥) الرابطُ المختصر يُفكّ في الخادم — لا «أدخِل البيانات يدويًّا»');
/* «maps.app.goo.gl/xxxx» لا يحمل الاسم في حروفه ويقود إليه بتحويلةٍ واحدة يمنع
   المتصفّحُ تتبّعَها. فيتبعها الخادم، ويرفض ما ليس من قوقل، ويقف عند تحويلةٍ
   تخرج عن قوقل — وإلا صار أداةَ طلبٍ نيابةً عن غيره إلى شبكةٍ داخلية. */
{
  const { createServer } = await import('node:http');
  const srv = createServer((req, res) => {
    if (req.url === '/short') { res.writeHead(302, { location: 'https://www.google.com/maps/place/%D9%85%D9%82%D9%87%D9%89+%D8%A7%D9%84%D8%AF%D8%B1%D8%A8/@24.7136,46.6753,17z/data=!4m2!3m1!1s0x3e2f03:0x9a1c' }); res.end(); return; }
    if (req.url === '/evil') { res.writeHead(302, { location: 'http://169.254.169.254/latest/meta-data/' }); res.end(); return; }
    res.writeHead(200); res.end('x');
  });
  await new Promise((r) => srv.listen(8977, r));
  const real = globalThis.fetch;
  let leaked = null;
  globalThis.fetch = (input, init) => {
    const u = String(input);
    if (u.startsWith('https://maps.app.goo.gl/')) return real('http://127.0.0.1:8977/' + u.split('/').pop(), init);
    if (u.startsWith('https://www.google.com/maps/place/')) return new Response('', { status: 200 });
    leaked = u; throw new Error('BLOCKED ' + u);
  };
  const { default: fn } = await import('../netlify/functions/expand.js');
  const call = (q) => fn(new Request('http://x/api/expand?url=' + encodeURIComponent(q))).then((r) => r.json());
  const a = await call('https://maps.app.goo.gl/short');
  a.name === 'مقهى الدرب' && a.coords?.lat === 24.7136 && a.placeId === '0x3e2f03:0x9a1c'
    ? ok('يُفكّ فيُستخرَج الاسمُ والإحداثياتُ والمعرّف بلا مفتاح') : bad('فكّ المختصر', JSON.stringify(a));
  const e = await call('https://maps.app.goo.gl/evil');
  !e.resolved && leaked === null ? ok('وتحويلةٌ إلى شبكةٍ داخلية لا تُتبَع — ولا يخرج طلبٌ إليها') : bad('تسريب', leaked || JSON.stringify(e));
  const f = await call('https://example.com/abc');
  f.error ? ok('وما ليس من قوقل يُرفَض قبل أي طلب') : bad('قبول أجنبي', JSON.stringify(f));
  globalThis.fetch = real;
  srv.close();
}

console.log('\n' + (fails.length ? `فشل ${fails.length}:\n` + fails.map((f) => ' - ' + f).join('\n') : '✅ نجحت كل الاختبارات'));
process.exit(fails.length ? 1 : 0);
