// صفحة العرض الواحد (المرحلة ١٠): رابط تشاركه مع عميل بعينه في واتساب فيرى عقاره وحده.
// تُبنى على الخادم لسبب واحد: وسوم المعاينة (Open Graph) يقرأها واتساب قبل تشغيل أي جافاسكربت،
// فلا تصلح لها صفحة ثابتة تُعبَّأ في المتصفح. لا تكشف أكثر مما نشرتَه أصلًا — تقرأ اللقطة نفسها.

import { getStore } from '@netlify/blobs';

const esc = (v) => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const nf = new Intl.NumberFormat('en-US');

// النسخة الإنجليزية (المرحلة ٣٠): الواجهة تُترجَم والبيانات لا — الحي والوصف كما كتبتَهما.
const T = {
  ar: {
    dir: 'rtl', lang: 'ar', other: 'English', otherLang: 'en',
    price: (n) => (n == null ? 'السعر عند الطلب' : `${nf.format(n)} ريال`),
    area: (n) => `${nf.format(n)} م²`, ref: 'رقم', noimg: 'لا صور',
    whatsapp: 'واتساب', call: 'اتصال', location: 'الموقع', all: 'كل العروض',
    gone: 'هذا العرض لم يعد متاحًا', goneNote: 'قد يكون بيع أو سُحب من النشر.',
    browse: 'تصفّح العروض المتاحة', contact: 'للاستفسار',
    disclaimer: 'الأسعار والتفاصيل قابلة للتغيير — للتأكد تواصل معنا مباشرة.',
    hello: (t, r) => `السلام عليكم، مهتم بالعرض رقم ${r}: ${t}`,
  },
  en: {
    dir: 'ltr', lang: 'en', other: 'العربية', otherLang: 'ar',
    price: (n) => (n == null ? 'Price on request' : `${nf.format(n)} SAR`),
    area: (n) => `${nf.format(n)} m²`, ref: 'Ref', noimg: 'No photos',
    whatsapp: 'WhatsApp', call: 'Call', location: 'Location', all: 'All listings',
    gone: 'This listing is no longer available', goneNote: 'It may have been sold or unpublished.',
    browse: 'Browse available listings', contact: 'Enquiries',
    disclaimer: 'Prices and details are subject to change — please contact us to confirm.',
    hello: (t, r) => `Hello, I am interested in listing ${r}: ${t}`,
  },
};

const TYPES_EN = { land: 'Land', villa: 'Villa', floor: 'Floor', apartment: 'Apartment' };
const PURPOSES_EN = { sale: 'For Sale', rent: 'For Rent', investment: 'Investment' };

export default async (request) => {
  const url = new URL(request.url);
  const lang = url.searchParams.get('lang') === 'en' ? 'en' : 'ar';
  const t = T[lang];
  const money = t.price;
  const ref = url.pathname.split('/').filter(Boolean).pop();
  const store = getStore({ name: 'kassab-public', consistency: 'strong' });
  const snapshot = await store.get('snapshot', { type: 'json' });
  const listing = (snapshot?.listings || []).find((l) => String(l.ref) === String(ref));

  if (!listing) {
    return new Response(`<!DOCTYPE html><html lang="${t.lang}" dir="${t.dir}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(t.gone)}</title>
<link rel="stylesheet" href="/offers/style.css"></head><body><main class="wrap" style="padding-block:40px">
<h1>${esc(t.gone)}</h1><p class="muted">${esc(t.goneNote)}</p>
<p><a class="btn btn-primary" href="/offers/?lang=${t.lang}">${esc(t.browse)}</a></p></main></body></html>`, {
      status: 404, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
    });
  }

  const office = snapshot.office || {};
  // النوع والأغراض تُترجَم بمفاتيحها المدمجة وحدها؛ وما أضفتَه أنت يبقى بمسمّاه العربي.
  const typeName = (lang === 'en' && listing.type && TYPES_EN[listing.type])
    ? TYPES_EN[listing.type] : (listing.typeLabel || '');
  const purposeNames = lang === 'en'
    ? (listing.purposes || []).map((k, i) => PURPOSES_EN[k] || (listing.purposeLabels || [])[i] || k)
    : (listing.purposeLabels || []);
  const where = [listing.district, listing.city].filter(Boolean).join(lang === 'en' ? ', ' : '، ');
  const heading = [typeName, where].filter(Boolean).join(' — ') || listing.title || '';
  const title = `${heading}${office.name ? ` — ${office.name}` : ''}`;
  const descParts = [
    where,
    listing.area ? t.area(listing.area) : '',
    money(listing.price),
    purposeNames.join(' / '),
  ].filter(Boolean);
  const description = descParts.join(' · ');
  const image = listing.images?.[0] ? `${url.origin}/api/media?id=${encodeURIComponent(listing.images[0])}` : '';
  const phone = String(listing.contactPhone || office.phone || '').replace(/\D/g, '');
  const wa = phone
    ? `https://wa.me/${phone.startsWith('966') ? phone : `966${phone.replace(/^0/, '')}`}?text=${encodeURIComponent(t.hello(heading, listing.ref))}`
    : '';
  const other = `${url.pathname}?lang=${t.otherLang}`;

  const gallery = (listing.images || [])
    .map((id) => `<img src="/api/media?id=${encodeURIComponent(id)}" alt="" loading="lazy">`).join('');

  return new Response(`<!DOCTYPE html>
<html lang="${t.lang}" dir="${t.dir}"><head>
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
  <h1>${esc(heading)}</h1>
  <p class="office-contact">${esc(where)}</p>
</div></div>
<a class="btn btn-sm lang-toggle" href="${esc(other)}">${esc(t.other)}</a></div></header>
<main class="wrap">
  <div class="offer-gallery">${gallery || `<div class="noimg">${esc(t.noimg)}</div>`}</div>
  <p class="card-price" style="font-size:26px">${esc(money(listing.price))}</p>
  <div class="card-meta">
    ${purposeNames.map((p) => `<span class="tag">${esc(p)}</span>`).join('')}
    ${listing.area ? `<span class="tag">${esc(t.area(listing.area))}</span>` : ''}
    <span class="tag">${esc(t.ref)} ${esc(listing.ref)}</span>
  </div>
  ${listing.notes ? `<p class="card-notes">${esc(listing.notes)}</p>` : ''}
  <div class="card-actions">
    ${wa ? `<a class="btn btn-primary" href="${esc(wa)}" target="_blank" rel="noopener">${esc(t.whatsapp)}</a>` : ''}
    ${listing.contactPhone ? `<a class="btn" href="tel:${esc(listing.contactPhone)}">${esc(t.call)}</a>` : ''}
    ${listing.mapUrl ? `<a class="btn" href="${esc(listing.mapUrl)}" target="_blank" rel="noopener">${esc(t.location)}</a>` : ''}
    <a class="btn" href="/offers/?lang=${t.lang}">${esc(t.all)}</a>
  </div>
</main>
<footer class="wrap footer"><p class="muted small">${esc(office.name || '')}${office.phone ? ` · ${esc(office.phone)}` : ''}</p>
<p class="muted small">${esc(t.disclaimer)}</p></footer>
<script>
/* عدّاد المشاهدات (المرحلة ٢٥): مرة واحدة لكل جلسة متصفح، بلا كوكي ولا معرّف زائر.
   وفشله لا يُظهر للزائر شيئًا — العدّاد ليس جزءًا من الصفحة التي جاء لأجلها. */
try {
  var k = 'kassab-view-${esc(listing.ref)}';
  if (!sessionStorage.getItem(k)) {
    sessionStorage.setItem(k, '1');
    fetch('/api/view', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ref: '${esc(listing.ref)}' }), keepalive: true }).catch(function () {});
  }
} catch (e) {}
</script>
</body></html>`, {
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=0, must-revalidate' },
  });
};

export const config = { path: '/offers/l/:ref' };
