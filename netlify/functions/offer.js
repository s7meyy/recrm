// صفحة العرض الواحد (المرحلة ١٠): رابط تشاركه مع عميل بعينه في واتساب فيرى عقاره وحده.
// تُبنى على الخادم لسبب واحد: وسوم المعاينة (Open Graph) يقرأها واتساب قبل تشغيل أي جافاسكربت،
// فلا تصلح لها صفحة ثابتة تُعبَّأ في المتصفح. لا تكشف أكثر مما نشرتَه أصلًا — تقرأ اللقطة نفسها.

import { getStore } from '@netlify/blobs';

const esc = (v) => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const money = (n) => (n == null ? 'السعر عند الطلب' : `${new Intl.NumberFormat('en-US').format(n)} ريال`);

export default async (request) => {
  const url = new URL(request.url);
  const ref = url.pathname.split('/').filter(Boolean).pop();
  const store = getStore({ name: 'kassab-public', consistency: 'strong' });
  const snapshot = await store.get('snapshot', { type: 'json' });
  const listing = (snapshot?.listings || []).find((l) => String(l.ref) === String(ref));

  if (!listing) {
    return new Response(`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>العرض غير متاح</title>
<link rel="stylesheet" href="/offers/style.css"></head><body><main class="wrap" style="padding-block:40px">
<h1>هذا العرض لم يعد متاحًا</h1><p class="muted">قد يكون بيع أو سُحب من النشر.</p>
<p><a class="btn btn-primary" href="/offers/">تصفّح العروض المتاحة</a></p></main></body></html>`, {
      status: 404, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
    });
  }

  const office = snapshot.office || {};
  const title = `${listing.title || listing.typeLabel || 'عقار'}${office.name ? ` — ${office.name}` : ''}`;
  const descParts = [
    [listing.district, listing.city].filter(Boolean).join('، '),
    listing.area ? `${listing.area} م²` : '',
    money(listing.price),
    (listing.purposeLabels || []).join(' / '),
  ].filter(Boolean);
  const description = descParts.join(' · ');
  const image = listing.images?.[0] ? `${url.origin}/api/media?id=${encodeURIComponent(listing.images[0])}` : '';
  const phone = String(listing.contactPhone || office.phone || '').replace(/\D/g, '');
  const wa = phone
    ? `https://wa.me/${phone.startsWith('966') ? phone : `966${phone.replace(/^0/, '')}`}?text=${encodeURIComponent(`السلام عليكم، مهتم بالعرض رقم ${listing.ref}: ${listing.title || ''}`)}`
    : '';

  const gallery = (listing.images || [])
    .map((id) => `<img src="/api/media?id=${encodeURIComponent(id)}" alt="" loading="lazy">`).join('');

  return new Response(`<!DOCTYPE html>
<html lang="ar" dir="rtl"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
${image ? `<meta property="og:image" content="${esc(image)}">` : ''}
<meta property="og:url" content="${esc(url.href)}">
<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}">
<link rel="stylesheet" href="/offers/style.css">
</head><body>
<header class="hero"><div class="wrap"><div class="office"><div>
  <h1>${esc(listing.title || listing.typeLabel || 'عقار')}</h1>
  <p class="office-contact">${esc([listing.district, listing.city].filter(Boolean).join('، '))}</p>
</div></div></div></header>
<main class="wrap">
  <div class="offer-gallery">${gallery || '<div class="noimg">لا صور</div>'}</div>
  <p class="card-price" style="font-size:26px">${esc(money(listing.price))}</p>
  <div class="card-meta">
    ${(listing.purposeLabels || []).map((p) => `<span class="tag">${esc(p)}</span>`).join('')}
    ${listing.area ? `<span class="tag">${esc(listing.area)} م²</span>` : ''}
    <span class="tag">رقم ${esc(listing.ref)}</span>
  </div>
  ${listing.notes ? `<p class="card-notes">${esc(listing.notes)}</p>` : ''}
  <div class="card-actions">
    ${wa ? `<a class="btn btn-primary" href="${esc(wa)}" target="_blank" rel="noopener">واتساب</a>` : ''}
    ${listing.contactPhone ? `<a class="btn" href="tel:${esc(listing.contactPhone)}">اتصال</a>` : ''}
    ${listing.mapUrl ? `<a class="btn" href="${esc(listing.mapUrl)}" target="_blank" rel="noopener">الموقع</a>` : ''}
    <a class="btn" href="/offers/">كل العروض</a>
  </div>
</main>
<footer class="wrap footer"><p class="muted small">${esc(office.name || '')}${office.phone ? ` · ${esc(office.phone)}` : ''}</p>
<p class="muted small">الأسعار والتفاصيل قابلة للتغيير — للتأكد تواصل معنا مباشرة.</p></footer>
</body></html>`, {
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=0, must-revalidate' },
  });
};

export const config = { path: '/offers/l/:ref' };
