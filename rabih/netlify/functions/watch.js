// المتابعة الدورية والإنذار المبكر — تحويل التقرير من بيعةٍ إلى اشتراك.
//
// تعمل مجدولةً كل يوم: تقرأ قائمة المنشآت المرصودة، وتجلب تعليقاتها الجديدة
// من المزوّد، وتقارنها بآخر لقطة، فتُسجّل ما تغيّر. وإن تجاوز التغيّر عتبةً
// أعدّت إنذارًا.
//
// **وما تُخزّنه مُعلَن**: اللقطة أرقامٌ لا نصوص — المتوسط والعدد ونسبة السلبي
// وعدّ المواضيع. فلا يُرفَع كلام الناس إلى الخادم لهذه المهمة أصلًا.
//
// **ولا تعمل إلا لمن فعّلها**: بلا قائمة مرصودة لا يقع نداءٌ ولا تُستهلك
// فاتورة.
//
// التهيئة: OUTSCRAPER_KEY أو APIFY_TOKEN (للجلب)، والقائمة تُكتب من التطبيق.

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

const WATCH_SLOT = 'watchlist';
const SNAP_PREFIX = 'snap-';

/** عتبات الإنذار: تغيّرٌ دون هذا لا يُزعج صاحبه. */
const ALERT = { avgDrop: 0.15, negJump: 10, newNegative: 3 };

async function openStore() {
  const { getStore } = await import('@netlify/blobs');
  return getStore({ name: 'rabih', consistency: 'strong' });
}

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);

/** إحصاءٌ مختصر من التعليقات — أرقامٌ لا نصوص. */
export function summarize(reviews = []) {
  const rated = reviews.filter((r) => Number(r.rating) >= 1 && Number(r.rating) <= 5);
  const neg = rated.filter((r) => Number(r.rating) <= 2).length;
  const sum = rated.reduce((a, r) => a + Number(r.rating), 0);
  return {
    count: reviews.length,
    rated: rated.length,
    average: rated.length ? Number((sum / rated.length).toFixed(2)) : null,
    negShare: rated.length ? Number(((neg / rated.length) * 100).toFixed(1)) : null,
    at: new Date().toISOString(),
  };
}

/** يقارن لقطتين ويُخرج ما يستحقّ الإنذار. */
export function diffSnapshots(before, after) {
  if (!before || !after) return { alerts: [], changed: false };
  const alerts = [];

  const avgDrop = (num(before.average) ?? 0) - (num(after.average) ?? 0);
  if (num(before.average) !== null && num(after.average) !== null && avgDrop >= ALERT.avgDrop) {
    alerts.push({ kind: 'avg', text: `المتوسط نزل من ${before.average} إلى ${after.average}.` });
  }

  const negJump = (num(after.negShare) ?? 0) - (num(before.negShare) ?? 0);
  if (negJump >= ALERT.negJump) {
    alerts.push({ kind: 'neg', text: `نسبة السلبي ارتفعت من ${before.negShare}% إلى ${after.negShare}%.` });
  }

  const newOnes = (num(after.count) ?? 0) - (num(before.count) ?? 0);
  if (newOnes > 0 && num(after.negShare) !== null && after.negShare >= 40 && newOnes >= ALERT.newNegative) {
    alerts.push({ kind: 'burst', text: `${newOnes} تعليقًا جديدًا، ونسبة السلبي فيها ${after.negShare}%.` });
  }

  return { alerts, changed: newOnes !== 0 || alerts.length > 0, newOnes };
}

async function fetchReviews(url, origin) {
  const res = await fetch(`${origin}/api/reviews?url=${encodeURIComponent(url)}&limit=200&sort=newest`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: data.error || `تعذّر الجلب (${res.status}).` };
  return { ok: true, reviews: data.reviews || [], claimed: data.claimed ?? null };
}

export default async (request) => {
  const url = new URL(request.url);
  const origin = url.origin;

  let store;
  try { store = await openStore(); }
  catch (e) { return json({ error: 'المخزن غير مهيّأ: ' + (e?.message || ''), needsStore: true }, 503); }

  // قائمة الرصد تُدار من التطبيق: {key, places:[{id,name,url}]}
  if (request.method === 'PUT') {
    const body = await request.text();
    if (body.length > 200000) return json({ error: 'القائمة أكبر من الحدّ.' }, 413);
    try { JSON.parse(body); } catch { return json({ error: 'ليست JSON.' }, 400); }
    await store.set(WATCH_SLOT, body, { metadata: { updatedAt: new Date().toISOString() } });
    return json({ ok: true });
  }

  if (request.method === 'GET' && url.searchParams.get('list') === '1') {
    const raw = await store.get(WATCH_SLOT, { type: 'text' });
    return json({ found: !!raw, list: raw ? JSON.parse(raw) : null });
  }

  /* الجولة: تُنادى مجدولةً أو يدويًّا من التطبيق. */
  const raw = await store.get(WATCH_SLOT, { type: 'text' });
  if (!raw) return json({ ok: true, watched: 0, note: 'لا منشآت مرصودة — فلا نداء ولا فاتورة.' });

  let list;
  try { list = JSON.parse(raw); } catch { return json({ error: 'قائمة الرصد تالفة.' }, 500); }
  const places = Array.isArray(list?.places) ? list.places.slice(0, 50) : [];

  const results = [];
  for (const p of places) {
    if (!p?.url || !p?.id) continue;
    const got = await fetchReviews(p.url, origin);
    if (!got.ok) { results.push({ id: p.id, name: p.name, error: got.error }); continue; }

    const after = summarize(got.reviews);
    after.claimed = got.claimed;

    const prevRaw = await store.get(SNAP_PREFIX + p.id, { type: 'text' });
    const before = prevRaw ? JSON.parse(prevRaw) : null;
    const d = diffSnapshots(before, after);

    await store.set(SNAP_PREFIX + p.id, JSON.stringify(after), { metadata: { updatedAt: after.at } });
    results.push({ id: p.id, name: p.name, before, after, alerts: d.alerts, newOnes: d.newOnes ?? null });
  }

  const alerts = results.filter((r) => r.alerts?.length);
  await store.set('last-run', JSON.stringify({ at: new Date().toISOString(), results }), {
    metadata: { updatedAt: new Date().toISOString() },
  });

  return json({ ok: true, watched: results.length, alerts: alerts.length, results });
};

export const config = {
  path: '/api/watch',
  schedule: '@daily',   // جولةٌ يومية؛ والتغيّر يُجمَع ويُعرَض في التطبيق
};
