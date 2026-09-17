// صفحة القائمة المخصّصة لعميل (المرحلة ١١): تقرأ رمز القائمة من العنوان وتعرض عروضها.
// تعيد استعمال أنماط الصفحة العامة نفسها، ولا تلمس أي ملف من النظام الداخلي.

/** أسماءُ حقائق النوع بالعربية — القائمةُ المخصَّصة لا تُعرض إلا بها. */
const FACT_AR = {
  rooms: 'غرفة', baths: 'دورة مياه', floor: 'الدور', floorsCount: 'أدوار',
  buildingAge: 'عمر البناء', buildingCondition: 'الحالة',
  plotDimensions: 'الأطوال', streetWidth: 'عرض الشارع', streetsCount: 'شوارع', facades: 'الواجهات',
};
const COUNTED_AR = new Set(['rooms', 'baths', 'floorsCount', 'streetsCount']);

const grid = document.getElementById('grid');
const statusEl = document.getElementById('status');

const el = (tag, attrs = null, ...children) => {
  const node = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else node.setAttribute(k, v === true ? '' : String(v));
    }
  }
  for (const c of children.flat()) {
    if (c == null || c === false || c === '') continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
};

const nf = new Intl.NumberFormat('en-US');
const money = (n) => (n == null ? 'السعر عند الطلب' : `${nf.format(n)} ريال`);

/** شهرُ التسليم وسنتُه — والمجهولُ يبقى كما جاء لا يُخترع له شكل. */
function deliveryText(iso) {
  const at = new Date(iso || '');
  if (Number.isNaN(at.getTime())) return String(iso || '');
  try { return at.toLocaleDateString('ar-SA-u-ca-gregory', { year: 'numeric', month: 'long' }); }
  catch (_) { return at.toISOString().slice(0, 10); }
}

function card(listing) {
  const images = listing.images || [];
  const single = `/offers/l/${encodeURIComponent(listing.ref)}`;
  const media = el('div', { class: 'card-media' });
  if (images.length) media.append(el('img', { src: `/api/media?id=${encodeURIComponent(images[0])}`, alt: '', loading: 'lazy' }));
  else media.append(el('div', { class: 'noimg', text: listing.typeLabel || 'عقار' }));

  const phone = String(listing.contactPhone || '').replace(/\D/g, '');
  const wa = phone
    ? `https://wa.me/${phone.startsWith('966') ? phone : `966${phone.replace(/^0/, '')}`}?text=${encodeURIComponent(`مهتم بالعرض رقم ${listing.ref}`)}`
    : null;

  return el('article', { class: 'card' },
    el('a', { href: single }, media),
    el('div', { class: 'card-body' },
      el('h2', { class: 'card-title' }, el('a', { class: 'card-link', href: single, text: listing.title || listing.typeLabel || 'عقار' })),
      el('div', { class: 'card-place', text: [listing.district, listing.city].filter(Boolean).join('، ') }),
      el('div', { class: 'card-price', text: money(listing.price) }),
      el('div', { class: 'card-meta' },
        (listing.purposeLabels || []).map((p) => el('span', { class: 'tag', text: p })),
        listing.area ? el('span', { class: 'tag', text: `${nf.format(listing.area)} م²` }) : null,
        // حقائقُ النوع (المرحلة ٤٨) — القائمةُ المخصَّصة عربيّةٌ وحدها، فتُسمَّى هنا مباشرةً.
        ...Object.entries(listing.facts || {})
          .map(([k, v]) => FACT_AR[k] && (COUNTED_AR.has(k) ? `${nf.format(v)} ${FACT_AR[k]}` : `${FACT_AR[k]}: ${v}`))
          .filter(Boolean)
          .map((text) => el('span', { class: 'tag', text })),
        // **«على الخارطة» إفصاحٌ كالترخيص** (المرحلة ٤٩): القائمةُ المخصّصة إعلانٌ كغيرها،
        // ومن اشترى ظانًّا أنّه قائمٌ يرجع عليك — سواءٌ رآه في الصفحة العامة أو في قائمته.
        listing.offPlan ? el('span', { class: 'tag tag-warn', text: 'على الخارطة — تحت الإنشاء' }) : null,
        listing.offPlan && listing.deliveryAt
          ? el('span', { class: 'tag', text: `التسليم المتوقَّع: ${deliveryText(listing.deliveryAt)}` })
          : null),
      listing.notes ? el('p', { class: 'card-notes', text: listing.notes }) : null,
      el('div', { class: 'card-actions' },
        wa ? el('a', { class: 'btn btn-primary', href: wa, target: '_blank', rel: 'noopener', text: 'واتساب' }) : null,
        el('a', { class: 'btn', href: single, text: 'تفاصيل' })),
      // الإفصاح النظاميّ يلزم كلَّ إعلان — والقائمةُ المخصّصة إعلانٌ كغيرها (المرحلة ٤٧).
      listing.disclosure ? el('p', { class: 'card-license', text: listing.disclosure }) : null));
}

async function load() {
  const slug = new URLSearchParams(location.search).get('c') || location.hash.replace(/^#/, '');
  if (!slug) { statusEl.textContent = 'رابط غير مكتمل.'; return; }
  try {
    const res = await fetch(`/api/client-list?slug=${encodeURIComponent(slug)}&count=1`, { cache: 'no-store' });
    if (!res.ok) { statusEl.textContent = 'هذه القائمة لم تعد متاحة.'; return; }
    const data = await res.json();
    const office = data.office || {};
    document.getElementById('title').textContent = data.title || (data.clientName ? `عروض مختارة لـ${data.clientName}` : 'عروض مختارة لك');
    document.title = document.getElementById('title').textContent;
    if (data.note) document.getElementById('note').textContent = data.note;
    const contact = document.getElementById('office-contact');
    if (office.name) contact.append(document.createTextNode(office.name));
    if (office.phone) {
      contact.append(document.createTextNode(office.name ? ' · ' : ''));
      contact.append(el('a', { href: `tel:${office.phone}`, text: office.phone, dir: 'ltr' }));
    }
    if (office.logo) {
      const logo = document.getElementById('logo');
      logo.src = `/api/media?id=${encodeURIComponent(office.logo)}`;
      logo.hidden = false;
    }
    const listings = data.listings || [];
    if (!listings.length) { statusEl.textContent = 'لا عروض في هذه القائمة حاليًا.'; return; }
    statusEl.textContent = `${nf.format(listings.length)} عرض مختار لك`;
    grid.replaceChildren(...listings.map(card));
  } catch (err) {
    statusEl.textContent = 'تعذر تحميل القائمة حاليًا.';
    console.error(err);
  }
}

load();
