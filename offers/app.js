// صفحة العروض العامة (المرحلة ٩): تقرأ اللقطة المنشورة من /api/listings وتعرضها.
// لا تصل إلى IndexedDB ولا إلى أي ملف من النظام الداخلي — صفحة مستقلة بالكامل.

import { STRINGS, currentLang, rememberLang, typeName, purposeNames, listingTitle, factLabel, listedLabel } from './i18n.js';

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
const money = (n) => (n == null ? t.priceOnRequest : `${nf.format(n)} ${lang === 'en' ? 'SAR' : 'ريال'}`);
const area = (n) => (n == null ? null : `${nf.format(n)} ${lang === 'en' ? 'm²' : 'م²'}`);
/** كم شهرًا مضى على إدراج العرض — و`null` إن لم يُعرف تاريخُه أو كان في المستقبل. */
const monthsSince = (iso) => {
  const at = new Date(iso || '').getTime();
  if (!Number.isFinite(at) || at > Date.now()) return null;
  return Math.floor((Date.now() - at) / (30 * 86400000));
};

let all = [];
const filters = { type: '', purpose: '', district: '' };

// اللغة تُختار مرّة وتُحفظ؛ والبيانات لا تُترجَم — الواجهة وحدها (انظر i18n.js).
let lang = currentLang();
let t = STRINGS[lang];

function applyLang() {
  t = STRINGS[lang];
  document.documentElement.lang = t.lang;
  document.documentElement.dir = t.dir;
  const toggle = document.getElementById('lang-toggle');
  if (toggle) toggle.textContent = t.other;
}

function switchLang() {
  lang = lang === 'ar' ? 'en' : 'ar';
  rememberLang(lang);
  applyLang();
  if (all.length) { buildFilters(); draw(); }
  const footer = document.getElementById('disclaimer');
  if (footer) footer.textContent = t.disclaimer;
}

function card(listing) {
  const images = listing.images || [];
  const media = el('div', { class: 'card-media' });
  if (images.length) {
    media.append(el('img', { src: `/api/media?id=${encodeURIComponent(images[0])}`, alt: listing.title || '', loading: 'lazy' }));
    if (images.length > 1) media.append(el('span', { class: 'count', text: `${nf.format(images.length)} ${t.photos}` }));
  } else {
    media.append(el('div', { class: 'noimg', text: typeName(listing, lang) }));
  }

  const waText = encodeURIComponent(`السلام عليكم، مهتم بالعرض: ${listing.title || ''}${listing.ref ? ` (رقم ${listing.ref})` : ''}`);
  const phone = (listing.contactPhone || '').replace(/\D/g, '');
  const waLink = phone ? `https://wa.me/${phone.startsWith('966') ? phone : `966${phone.replace(/^0/, '')}`}?text=${waText}` : null;

  const single = `/offers/l/${encodeURIComponent(listing.ref)}`;
  return el('article', { class: 'card' },
    el('a', { href: single, 'aria-label': listing.title || 'عرض' }, media),
    el('div', { class: 'card-body' },
      el('h2', { class: 'card-title' }, el('a', { class: 'card-link', href: single, text: listingTitle(listing, lang) })),
      el('div', { class: 'card-place', text: [listing.district, listing.city].filter(Boolean).join(lang === 'en' ? ', ' : '، ') }),
      el('div', { class: 'card-price', text: money(listing.price) }),
      el('div', { class: 'card-meta' },
        purposeNames(listing, lang).map((p) => el('span', { class: 'tag', text: p })),
        area(listing.area) ? el('span', { class: 'tag', text: area(listing.area) }) : null,
        // حقائقُ النوع (المرحلة ٤٨): «كم غرفة؟» أوّلُ ما يُسأل، وكان جوابُه لا يخرج أصلًا.
        ...Object.entries(listing.facts || {})
          .map(([k, v]) => factLabel(k, v, t, nf))
          .filter(Boolean)
          .map((text) => el('span', { class: 'tag', text })),
        listing.ref ? el('span', { class: 'tag', text: `${t.ref} ${listing.ref}` }) : null),
      // «مُدرَجٌ منذ» لهذا العرض وحده — لا تاريخُ اللقطة الذي يستوي عنده الجديدُ والقديم.
      listedLabel(monthsSince(listing.listedAt), t)
        ? el('div', { class: 'card-since', text: listedLabel(monthsSince(listing.listedAt), t) })
        : null,
      listing.notes ? el('p', { class: 'card-notes', text: listing.notes }) : null,
      el('div', { class: 'card-actions' },
        waLink ? el('a', { class: 'btn btn-primary', href: waLink, target: '_blank', rel: 'noopener', text: t.whatsapp }) : null,
        listing.contactPhone ? el('a', { class: 'btn', href: `tel:${listing.contactPhone}`, text: t.call }) : null,
        listing.mapUrl ? el('a', { class: 'btn', href: listing.mapUrl, target: '_blank', rel: 'noopener', text: t.location }) : null,
        el('a', { class: 'btn', href: `${single}?lang=${lang}`, text: t.allOffers === 'All listings' ? 'Details' : 'تفاصيل' })),
      // **سطرُ الإفصاح** (المرحلة ٤٧): النظام يوجب ذكرَ رقم ترخيص الإعلان في كلّ إعلان.
      // ولا يُترجَم: رقمٌ نظاميّ سعوديّ يُقرأ كما صدر بأيّ لغةٍ عُرضت الصفحة.
      listing.disclosure ? el('p', { class: 'card-license', text: listing.disclosure }) : null));
}

function draw() {
  // الفرز على **المفاتيح والقيم المخزَّنة** لا على النصّ المعروض: تبديل اللغة لا يُفرغ الفرز.
  const items = all.filter((l) => (!filters.type || (l.type || l.typeLabel) === filters.type)
    && (!filters.purpose || (l.purposes || l.purposeLabels || []).includes(filters.purpose))
    && (!filters.district || l.district === filters.district));
  grid.replaceChildren(...items.map(card));
  statusEl.textContent = items.length
    ? `${nf.format(items.length)} ${t.listing}${items.length === all.length ? '' : ` ${t.ofCount} ${nf.format(all.length)}`}`
    : (lang === 'en' ? 'No listings match the filter.' : 'لا عروض تطابق الفرز.');
}

function buildFilters() {
  const uniqBy = (pairs) => {
    const map = new Map();
    for (const [value, label] of pairs) if (value && !map.has(value)) map.set(value, label);
    return [...map.entries()].sort((a, b) => String(a[1]).localeCompare(String(b[1]), lang === 'en' ? 'en' : 'ar'));
  };
  const groups = [
    ['type', lang === 'en' ? 'All types' : 'كل الأنواع',
      uniqBy(all.map((l) => [l.type || l.typeLabel, typeName(l, lang)]))],
    ['purpose', lang === 'en' ? 'All purposes' : 'كل الأغراض',
      uniqBy(all.flatMap((l) => (l.purposes || l.purposeLabels || []).map((k, i) => [k, purposeNames(l, lang)[i] || k])))],
    ['district', lang === 'en' ? 'All districts' : 'كل الأحياء',
      uniqBy(all.map((l) => [l.district, l.district]))],
  ];
  filtersBox.replaceChildren();
  let any = false;
  for (const [key, allLabel, values] of groups) {
    if (values.length < 2) continue;
    any = true;
    const select = el('select', { 'aria-label': allLabel }, el('option', { value: '', text: allLabel }),
      values.map(([value, label]) => el('option', { value, text: label, selected: filters[key] === value ? true : null })));
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
    document.title = office.name ? `${t.title} — ${office.name}` : t.title;
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
        `${t.updated}: ${df.format(new Date(snapshot.publishedAt))}`;
    }

    if (!all.length) { statusEl.textContent = t.empty; return; }
    buildFilters();
    draw();
  } catch (err) {
    statusEl.textContent = t.error;
    console.error(err);
  }
}

applyLang();
statusEl.textContent = t.loading;
document.getElementById('lang-toggle')?.addEventListener('click', switchLang);
load();

/* ===== «اطلب معاينة» (المرحلة ٢٢) ===== */

const leadForm = document.getElementById('lead-form');
if (leadForm) {
  const statusNode = document.getElementById('lead-status');
  const sendBtn = document.getElementById('lead-send');
  leadForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(leadForm).entries());
    if (!String(data.phone || '').trim()) {
      statusNode.textContent = 'اكتب رقم جوالك أولًا.';
      return;
    }
    sendBtn.disabled = true;
    statusNode.textContent = 'جارٍ الإرسال…';
    try {
      const res = await fetch('/api/lead', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...data, ref: new URLSearchParams(location.search).get('ref') || '' }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(out.error || 'تعذّر الإرسال');
      leadForm.reset();
      statusNode.textContent = 'وصلنا طلبك — نتواصل معك قريبًا بإذن الله.';
    } catch (err) {
      statusNode.textContent = err.message || 'تعذّر الإرسال، حاول لاحقًا.';
    } finally {
      sendBtn.disabled = false;
    }
  });
}
