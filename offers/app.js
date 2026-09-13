// صفحة العروض العامة (المرحلة ٩): تقرأ اللقطة المنشورة من /api/listings وتعرضها.
// لا تصل إلى IndexedDB ولا إلى أي ملف من النظام الداخلي — صفحة مستقلة بالكامل.

const grid = document.getElementById('grid');
const statusEl = document.getElementById('status');
const filtersBox = document.getElementById('filters');

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
  for (const child of children.flat()) {
    if (child == null || child === false || child === '') continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
};

// نفس تقويم التطبيق وأرقامه: ميلادي بأرقام إنجليزية (ar-SA وحده يعطي هجريًا).
const nf = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
const df = new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', { year: 'numeric', month: 'long', day: 'numeric' });
const money = (n) => (n == null ? 'السعر عند الطلب' : `${nf.format(n)} ريال`);
const area = (n) => (n == null ? null : `${nf.format(n)} م²`);

let all = [];
const filters = { type: '', purpose: '', district: '' };

function card(listing) {
  const images = listing.images || [];
  const media = el('div', { class: 'card-media' });
  if (images.length) {
    media.append(el('img', { src: `/api/media?id=${encodeURIComponent(images[0])}`, alt: listing.title || '', loading: 'lazy' }));
    if (images.length > 1) media.append(el('span', { class: 'count', text: `${nf.format(images.length)} صور` }));
  } else {
    media.append(el('div', { class: 'noimg', text: listing.typeLabel || 'عقار' }));
  }

  const waText = encodeURIComponent(`السلام عليكم، مهتم بالعرض: ${listing.title || ''}${listing.ref ? ` (رقم ${listing.ref})` : ''}`);
  const phone = (listing.contactPhone || '').replace(/\D/g, '');
  const waLink = phone ? `https://wa.me/${phone.startsWith('966') ? phone : `966${phone.replace(/^0/, '')}`}?text=${waText}` : null;

  const single = `/offers/l/${encodeURIComponent(listing.ref)}`;
  return el('article', { class: 'card' },
    el('a', { href: single, 'aria-label': listing.title || 'عرض' }, media),
    el('div', { class: 'card-body' },
      el('h2', { class: 'card-title' }, el('a', { class: 'card-link', href: single, text: listing.title || listing.typeLabel || 'عقار' })),
      el('div', { class: 'card-place', text: [listing.district, listing.city].filter(Boolean).join('، ') }),
      el('div', { class: 'card-price', text: money(listing.price) }),
      el('div', { class: 'card-meta' },
        (listing.purposeLabels || []).map((p) => el('span', { class: 'tag', text: p })),
        area(listing.area) ? el('span', { class: 'tag', text: area(listing.area) }) : null,
        listing.ref ? el('span', { class: 'tag', text: `رقم ${listing.ref}` }) : null),
      listing.notes ? el('p', { class: 'card-notes', text: listing.notes }) : null,
      el('div', { class: 'card-actions' },
        waLink ? el('a', { class: 'btn btn-primary', href: waLink, target: '_blank', rel: 'noopener', text: 'واتساب' }) : null,
        listing.contactPhone ? el('a', { class: 'btn', href: `tel:${listing.contactPhone}`, text: 'اتصال' }) : null,
        listing.mapUrl ? el('a', { class: 'btn', href: listing.mapUrl, target: '_blank', rel: 'noopener', text: 'الموقع' }) : null,
        el('a', { class: 'btn', href: single, text: 'تفاصيل' }))));
}

function draw() {
  const items = all.filter((l) => (!filters.type || l.typeLabel === filters.type)
    && (!filters.purpose || (l.purposeLabels || []).includes(filters.purpose))
    && (!filters.district || l.district === filters.district));
  grid.replaceChildren(...items.map(card));
  statusEl.textContent = items.length
    ? `${nf.format(items.length)} عرض${items.length === all.length ? '' : ` من ${nf.format(all.length)}`}`
    : 'لا عروض تطابق الفرز.';
}

function buildFilters() {
  const uniq = (values) => [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ar'));
  const groups = [
    ['type', 'كل الأنواع', uniq(all.map((l) => l.typeLabel))],
    ['purpose', 'كل الأغراض', uniq(all.flatMap((l) => l.purposeLabels || []))],
    ['district', 'كل الأحياء', uniq(all.map((l) => l.district))],
  ];
  filtersBox.replaceChildren();
  let any = false;
  for (const [key, allLabel, values] of groups) {
    if (values.length < 2) continue;
    any = true;
    const select = el('select', { 'aria-label': allLabel }, el('option', { value: '', text: allLabel }),
      values.map((v) => el('option', { value: v, text: v })));
    select.addEventListener('change', () => { filters[key] = select.value; draw(); });
    filtersBox.append(select);
  }
  filtersBox.hidden = !any;
}

async function load() {
  try {
    // no-store: تحديث الصفحة يعني رؤية آخر نشر فعلًا، لا نسخة من ذاكرة المتصفح.
    const res = await fetch('/api/listings', { headers: { accept: 'application/json' }, cache: 'no-store' });
    if (!res.ok) throw new Error('تعذر تحميل العروض');
    const snapshot = await res.json();
    all = snapshot.listings || [];

    const office = snapshot.office || {};
    if (office.name) document.getElementById('office-name').textContent = office.name;
    document.title = office.name ? `العروض المتاحة — ${office.name}` : 'العروض المتاحة';
    const contact = document.getElementById('office-contact');
    if (office.phone) {
      contact.append(el('a', { href: `tel:${office.phone}`, text: office.phone, dir: 'ltr' }));
      if (office.address) contact.append(document.createTextNode(` · ${office.address}`));
    } else if (office.address) {
      contact.textContent = office.address;
    }
    if (office.logo) {
      const logo = document.getElementById('logo');
      logo.src = `/api/media?id=${encodeURIComponent(office.logo)}`;
      logo.hidden = false;
    }
    if (snapshot.intro) document.getElementById('intro').textContent = snapshot.intro;
    if (snapshot.publishedAt) {
      document.getElementById('published-at').textContent =
        `آخر تحديث للعروض: ${df.format(new Date(snapshot.publishedAt))}`;
    }

    if (!all.length) { statusEl.textContent = 'لا توجد عروض منشورة حاليًا.'; return; }
    buildFilters();
    draw();
  } catch (err) {
    statusEl.textContent = 'تعذر تحميل العروض حاليًا. حدّث الصفحة بعد قليل.';
    console.error(err);
  }
}

load();
