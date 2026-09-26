// صفحة العرض الواحد (المرحلة ١٠): رابط تشاركه مع عميل بعينه في واتساب فيرى عقاره وحده.
// تُبنى على الخادم لسبب واحد: وسوم المعاينة (Open Graph) يقرأها واتساب قبل تشغيل أي جافاسكربت،
// فلا تصلح لها صفحة ثابتة تُعبَّأ في المتصفح. لا تكشف أكثر مما نشرتَه أصلًا — تقرأ اللقطة نفسها.

import { getStore } from '@netlify/blobs';

const esc = (v) => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const nf = new Intl.NumberFormat('en-US');

/** شهرُ التسليم وسنتُه بلغة الصفحة — والمجهولُ يبقى كما جاء لا يُخترع له شكل. */
function handover(iso, lang) {
  const at = new Date(iso || '');
  if (Number.isNaN(at.getTime())) return String(iso || '');
  try { return at.toLocaleDateString(lang === 'en' ? 'en-GB' : 'ar-SA-u-ca-gregory', { year: 'numeric', month: 'long' }); }
  catch (_) { return at.toISOString().slice(0, 10); }
}

/**
 * **حقائقُ النوع وسومًا** (المرحلة ٥٢) — وما لم يُملأ لا يخرج، ولا تُخترع قيمة.
 * والمفتاحُ الذي لا ترجمةَ له يُسكَت عنه: ترجمةٌ تُخترع أسوأُ من حقيقةٍ تُترك.
 */
function factTags(facts, t) {
  const rows = Object.entries(facts || {})
    .filter(([, v]) => v != null && v !== '')
    .map(([k, v]) => (typeof t.facts?.[k] === 'function' ? t.facts[k](v) : null))
    .filter(Boolean);
  if (!rows.length) return '';
  return `<div class="card-meta">${rows.map((x) => `<span class="tag">${esc(x)}</span>`).join('')}</div>`;
}

/** جمعُ العربيّة — نسخةٌ محليّةٌ كي تبقى الدالّةُ بلا تبعيّات. */
function plural(n, [one, two, few, many], withNum = true) {
  const x = Math.abs(Math.round(Number(n) || 0));
  if (x === 1) return one;
  if (x === 2) return two;
  const w = (x % 100 >= 3 && x % 100 <= 10) ? few : many;
  return withNum ? `${nf.format(x)} ${w}` : w;
}

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
    // على الخارطة (المرحلة ٤٩): إفصاحٌ في صفحة العرض الواحد كما في القائمة العامة.
    offPlan: 'على الخارطة — تحت الإنشاء',
    delivery: 'التسليم المتوقَّع',
    hello: (t, r) => `السلام عليكم، مهتم بالعرض رقم ${r}: ${t}`,
    /* **حقائقُ النوع في صفحة التفاصيل** (المرحلة ٥٢): كانت في البطاقة ولا تصل هنا،
       فيضغط العميلُ «تفاصيل» ليعرف أكثرَ **فيجد أقلّ**. */
    facts: {
      rooms: (n) => plural(n, ['غرفة', 'غرفتان', 'غرف', 'غرفة']),
      baths: (n) => plural(n, ['دورة مياه', 'دورتا مياه', 'دورات مياه', 'دورة مياه']),
      floorsCount: (n) => plural(n, ['دور واحد', 'دوران', 'أدوار', 'دورًا']),
      streetsCount: (n) => plural(n, ['شارع واحد', 'شارعان', 'شوارع', 'شارعًا']),
      floor: (v) => `الدور: ${v}`,
      buildingAge: (n) => `عمر البناء: ${nf.format(n)} ${plural(n, ['سنة', 'سنتان', 'سنوات', 'سنة'], false)}`,
      buildingCondition: (v) => `الحالة: ${v}`,
      plotDimensions: (v) => `الأطوال: ${v}`,
      streetWidth: (v) => `عرض الشارع: ${nf.format(v)} م`,
      facades: (v) => `الواجهات: ${v}`,
    },
    book: 'احجز معاينة',
    // المرحلة ٥٨
    ask: 'اطلب معاينة', share: 'شارك', shareText: (t, u) => `${t}\n${u}`, copied: 'نُسخ الرابط', noimgSlim: 'بلا صور بعد — اطلب معاينة لتراه',
  },
  en: {
    dir: 'ltr', lang: 'en', other: 'العربية', otherLang: 'ar',
    price: (n) => (n == null ? 'Price on request' : `${nf.format(n)} SAR`),
    area: (n) => `${nf.format(n)} m²`, ref: 'Ref', noimg: 'No photos',
    whatsapp: 'WhatsApp', call: 'Call', location: 'Location', all: 'All listings',
    gone: 'This listing is no longer available', goneNote: 'It may have been sold or unpublished.',
    browse: 'Browse available listings', contact: 'Enquiries',
    disclaimer: 'Prices and details are subject to change — please contact us to confirm.',
    offPlan: 'Off-plan — under construction',
    delivery: 'Expected handover',
    hello: (t, r) => `Hello, I am interested in listing ${r}: ${t}`,
    facts: {
      rooms: (n) => `${nf.format(n)} ${n === 1 ? 'room' : 'rooms'}`,
      baths: (n) => `${nf.format(n)} ${n === 1 ? 'bath' : 'baths'}`,
      floorsCount: (n) => `${nf.format(n)} ${n === 1 ? 'floor' : 'floors'}`,
      streetsCount: (n) => `${nf.format(n)} ${n === 1 ? 'street' : 'streets'}`,
      floor: (v) => `Floor: ${v}`,
      buildingAge: (n) => `Age: ${nf.format(n)} ${n === 1 ? 'yr' : 'yrs'}`,
      buildingCondition: (v) => `Condition: ${v}`,
      plotDimensions: (v) => `Dimensions: ${v}`,
      streetWidth: (v) => `Street width: ${nf.format(v)} m`,
      facades: (v) => `Facades: ${v}`,
    },
    book: 'Book a viewing',
    ask: 'Request a viewing', share: 'Share', shareText: (t, u) => `${t}\n${u}`, copied: 'Link copied', noimgSlim: 'No photos yet — request a viewing',
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
<link rel="stylesheet" href="/css/dhad.css"><link rel="stylesheet" href="/offers/style.css"></head><body><main class="wrap" style="padding-block:40px">
<h1>${esc(t.gone)}</h1><p class="muted">${esc(t.goneNote)}</p>
<p><a class="btn btn-primary" href="/offers/?lang=${t.lang}">${esc(t.browse)}</a></p></main></body></html>`, {
      status: 404, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
    });
  }

  const office = snapshot.office || {};
  /* **وطريقٌ إلى الحجز من صفحة العرض** (المرحلة ٥٢): الحجزُ مبنيٌّ منذ المرحلة ٤٠،
     **ولم يكن إليه من العروض رابطٌ واحد** — فالعميلُ الذي أعجبه عرضٌ يعود إلى
     «متى يناسبك؟» التي بُني الحجزُ ليُنهيها. ويُعرض إن كان مفتوحًا فقط. */
  const bookingOpen = !!snapshot.booking?.enabled;
  // النوع والأغراض تُترجَم بمفاتيحها المدمجة وحدها؛ وما أضفتَه أنت يبقى بمسمّاه العربي.
  const typeName = (lang === 'en' && listing.type && TYPES_EN[listing.type])
    ? TYPES_EN[listing.type] : (listing.typeLabel || '');
  const purposeNames = lang === 'en'
    ? (listing.purposes || []).map((k, i) => PURPOSES_EN[k] || (listing.purposeLabels || [])[i] || k)
    : (listing.purposeLabels || []);
  const where = [listing.district, listing.city].filter(Boolean).join(lang === 'en' ? ', ' : '، ');
  const heading = [typeName, where].filter(Boolean).join(' — ') || listing.title || '';
  // الأسماءُ العربيّة في الصفحة الإنجليزية معزولةٌ اتجاهيًّا (المرحلة ٥٨).
  const headingHtml = where ? `${esc(typeName)} — <bdi>${esc(where)}</bdi>` : esc(heading);
  const officeLogo = office.logo ? `<img class="logo" src="/api/media?id=${esc(encodeURIComponent(office.logo))}" alt="">` : '';
  const officeLine = (office.name || office.phone || officeLogo)
    ? `<p class="office-line">${officeLogo}${office.name ? `<span class="office-name">${esc(office.name)}</span>` : ''}${office.phone ? `<a href="tel:${esc(office.phone)}" dir="ltr">${esc(office.phone)}</a>` : ''}</p>`
    : '';
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
<link rel="stylesheet" href="/css/dhad.css"><link rel="stylesheet" href="/offers/style.css">
</head><body>
<header class="hero"><div class="wrap"><div class="office"><div>
  <h1>${headingHtml}</h1>
  ${officeLine}
</div></div>
<a class="btn btn-sm lang-toggle" href="${esc(other)}">${esc(t.other)}</a></div></header>
<main class="wrap">
  <div class="offer-gallery">${gallery || `<div class="noimg noimg-slim"><span aria-hidden="true">🏠</span> ${esc(t.noimgSlim)}</div>`}</div>
  <p class="card-price" style="font-size:26px">${esc(money(listing.price))}</p>
  <div class="card-meta">
    ${purposeNames.map((p) => `<span class="tag">${esc(p)}</span>`).join('')}
    ${listing.area ? `<span class="tag">${esc(t.area(listing.area))}</span>` : ''}
    ${listing.offPlan ? `<span class="tag tag-warn">${esc(t.offPlan)}</span>` : ''}
    ${listing.offPlan && listing.deliveryAt ? `<span class="tag">${esc(t.delivery)}: ${esc(handover(listing.deliveryAt, t.lang))}</span>` : ''}
    <span class="tag">${esc(t.ref)} ${esc(listing.ref)}</span>
  </div>
  ${factTags(listing.facts, t)}
  ${listing.notes ? `<p class="card-notes">${esc(listing.notes)}</p>` : ''}
  <div class="card-actions">
    ${wa ? `<a class="btn btn-primary" href="${esc(wa)}" target="_blank" rel="noopener">${esc(t.whatsapp)}</a>` : ''}
    ${listing.contactPhone ? `<a class="btn" href="tel:${esc(listing.contactPhone)}">${esc(t.call)}</a>` : ''}
    ${listing.mapUrl ? `<a class="btn" href="${esc(listing.mapUrl)}" target="_blank" rel="noopener">${esc(t.location)}</a>` : ''}
    ${bookingOpen
    ? `<a class="btn" href="/offers/book.html?lang=${t.lang}&amp;p=${esc(listing.ref)}">${esc(t.book)}</a>`
    : `<a class="btn" href="/offers/intake.html?lang=${t.lang}&amp;ref=${esc(listing.ref)}">${esc(t.ask)}</a>`}
    <button type="button" class="btn" id="share-btn" data-title="${esc(heading)}" data-copied="${esc(t.copied)}" data-label="${esc(t.share)}">${esc(t.share)}</button>
    <a class="btn" href="/offers/?lang=${t.lang}">${esc(t.all)}</a>
  </div>
  <!-- الإفصاح النظاميّ (المرحلة ٤٧): رقمُ ترخيص الإعلان يلزم كلَّ إعلان. ولا يُترجَم. -->
  ${listing.disclosure ? `<p class="card-license">${esc(listing.disclosure)}</p>` : ''}
</main>
<footer class="wrap footer"><p class="muted small">${esc(office.name || '')}${office.phone ? ` · ${esc(office.phone)}` : ''}</p>
<p class="muted small">${esc(t.disclaimer)}</p></footer>
<script>
/* المشاركة (المرحلة ٥٨): صفحةُ العرض هي ما يُرسل لمن يقرّر مع العميل، وكان زرُّ «شارك» في
   القائمة وحدها. مشاركةُ الجهاز حيث وُجدت، وإلا واتساب بالنصّ، وإلا نسخُ الرابط. */
(function () {
  var b = document.getElementById('share-btn');
  if (!b) return;
  b.addEventListener('click', function () {
    var title = b.getAttribute('data-title') || document.title;
    var url = location.href;
    if (navigator.share) { navigator.share({ title: title, url: url }).catch(function () {}); return; }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(function () {
        b.textContent = b.getAttribute('data-copied');
        setTimeout(function () { b.textContent = b.getAttribute('data-label'); }, 1600);
      }).catch(function () { location.href = 'https://wa.me/?text=' + encodeURIComponent(title + '\\n' + url); });
      return;
    }
    location.href = 'https://wa.me/?text=' + encodeURIComponent(title + '\\n' + url);
  });
})();
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
