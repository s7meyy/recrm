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
/** تاريخٌ يُقرأ بلغة الصفحة — والمجهولُ يبقى كما جاء لا يُخترع له شكل. */
const fmtDate = (iso, lang) => {
  const at = new Date(iso || '');
  if (Number.isNaN(at.getTime())) return String(iso || '');
  try {
    return at.toLocaleDateString(lang === 'en' ? 'en-GB' : 'ar-SA-u-ca-gregory', { year: 'numeric', month: 'long' });
  } catch (_) { return at.toISOString().slice(0, 10); }
};

const monthsSince = (iso) => {
  const at = new Date(iso || '').getTime();
  if (!Number.isFinite(at) || at > Date.now()) return null;
  return Math.floor((Date.now() - at) / (30 * 86400000));
};

let all = [];
const filters = { type: '', purpose: '', district: '', priceMax: '', areaMin: '', favs: false };

/* ===== المفضّلة (المرحلة ٥٨) — في متصفّح العميل وحده، لا تصل الخادم ولا تُطلب بها هويّة ===== */
const FAV_KEY = 'kassab-offers-favs';
const favs = new Set((() => { try { return JSON.parse(localStorage.getItem(FAV_KEY) || '[]'); } catch (_) { return []; } })());
function toggleFav(ref) {
  const key = String(ref);
  if (favs.has(key)) favs.delete(key); else favs.add(key);
  try { localStorage.setItem(FAV_KEY, JSON.stringify([...favs])); } catch (_) { /* تصفّح خاص: تبقى للجلسة */ }
}

/** سلّمٌ ثابت للسعر والمساحة — ولا يُعرض من درجاته إلا ما يفصل بين العروض فعلًا. */
const PRICE_LADDER = [100000, 250000, 500000, 750000, 1000000, 1500000, 2000000, 3000000, 5000000, 10000000];
const AREA_LADDER = [150, 200, 250, 300, 400, 500, 750, 1000, 2000];
function ladderOptions(ladder, values, keep) {
  const nums = values.filter((v) => Number.isFinite(v));
  if (nums.length < 2) return [];
  return ladder.filter((step) => keep(step, nums));
}
const shortMoney = (n) => (n >= 1000000 ? t.million(nf.format(n / 1000000)) : t.thousand(nf.format(n / 1000)));
/** ترتيبُ القائمة: `''` كما وصلت · `new` الأحدث · `cheap` الأرخص · `dear` الأغلى. */
let sortBy = '';
/** أمفتوحٌ الحجزُ في هذه اللقطة؟ — يُقرأ عند التحميل. */
let bookingOpen = false;

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
    /* بلا صور (المرحلة ٥٨): كان مربّعًا بارتفاع الصورة فيه اسمُ النوع وحده — فراغٌ يقارنه
       العميل بمنصّاتٍ صورُها لا تغيب. فيصغُر إلى شريطٍ يقول الحال ويشير إلى الموقع إن عُرف. */
    media.classList.add('card-media-none');
    media.append(el('div', { class: 'noimg' },
      el('span', { class: 'noimg-icon', 'aria-hidden': 'true', text: '🏠' }),
      el('span', { text: `${typeName(listing, lang)} · ${t.noPhotos}` })));
  }
  const favBtn = el('button', {
    type: 'button', class: `fav-btn${favs.has(String(listing.ref)) ? ' is-fav' : ''}`,
    'aria-label': favs.has(String(listing.ref)) ? t.favRemove : t.favAdd, 'aria-pressed': favs.has(String(listing.ref)) ? 'true' : 'false',
  }, favs.has(String(listing.ref)) ? '♥' : '♡');
  favBtn.addEventListener('click', (ev) => {
    ev.preventDefault(); ev.stopPropagation();
    toggleFav(listing.ref);
    const on = favs.has(String(listing.ref));
    favBtn.textContent = on ? '♥' : '♡';
    favBtn.classList.toggle('is-fav', on);
    favBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    favBtn.setAttribute('aria-label', on ? t.favRemove : t.favAdd);
    updateFavChip();
    if (filters.favs && !on) draw();
  });
  media.append(favBtn);

  const waText = encodeURIComponent(`السلام عليكم، مهتم بالعرض: ${listing.title || ''}${listing.ref ? ` (رقم ${listing.ref})` : ''}`);
  const phone = (listing.contactPhone || '').replace(/\D/g, '');
  const waLink = phone ? `https://wa.me/${phone.startsWith('966') ? phone : `966${phone.replace(/^0/, '')}`}?text=${waText}` : null;

  const single = `/offers/l/${encodeURIComponent(listing.ref)}`;
  return el('article', { class: 'card' },
    el('a', { href: single, 'aria-label': listing.title || 'عرض' }, media),
    el('div', { class: 'card-body' },
      /* العنوانُ يحمل المكانَ أصلًا («فلة — الملقا، الرياض»)، فسطرُ المكان تحته تكرارٌ (المرحلة ٥٨).
         والأسماءُ العربيّة في الصفحة الإنجليزية تُعزل اتجاهيًّا كي لا تقلب الجملة. */
      el('h2', { class: 'card-title' }, el('a', { class: 'card-link', href: single }, titleNode(listing))),
      el('div', { class: 'card-price', text: money(listing.price) }),
      el('div', { class: 'card-meta' },
        purposeNames(listing, lang).map((p) => el('span', { class: 'tag', text: p })),
        area(listing.area) ? el('span', { class: 'tag', text: area(listing.area) }) : null,
        // حقائقُ النوع (المرحلة ٤٨): «كم غرفة؟» أوّلُ ما يُسأل، وكان جوابُه لا يخرج أصلًا.
        ...Object.entries(listing.facts || {})
          .map(([k, v]) => factLabel(k, v, t, nf))
          .filter(Boolean)
          .map((text) => el('span', { class: 'tag', text })),
        // **على الخارطة يُقال قبل كلّ شيء** (المرحلة ٤٩): من اشترى ظانًّا أنّه قائمٌ يرجع عليك.
        listing.offPlan ? el('span', { class: 'tag tag-warn', text: t.offPlan }) : null,
        listing.offPlan && listing.deliveryAt
          ? el('span', { class: 'tag', text: t.delivery(fmtDate(listing.deliveryAt, lang)) })
          : null,
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
        el('a', { class: 'btn', href: `${single}?lang=${lang}`, text: t.allOffers === 'All listings' ? 'Details' : 'تفاصيل' }),
        /* **طريقٌ إلى الحجز** (المرحلة ٥٢): الحجزُ مبنيٌّ منذ المرحلة ٤٠ ولم يكن إليه
           رابطٌ واحد، فيعود العميلُ إلى «متى يناسبك؟» التي بُني ليُنهيها. */
        bookingOpen ? el('a', {
          class: 'btn', href: `book.html?lang=${lang}&p=${encodeURIComponent(listing.ref || '')}`,
          text: lang === 'en' ? 'Book a viewing' : 'احجز معاينة',
        }) : el('a', {
          /* والحجزُ مغلقٌ (المرحلة ٥٨): طريقٌ إلى الاستمارة برقم العرض، لا واتساب وحده. */
          class: 'btn', href: `intake.html?lang=${lang}&ref=${encodeURIComponent(listing.ref || '')}`, text: t.askAbout,
        }),
        /* **والمشاركة** (المرحلة ٥٢): العميلُ لا يقرّر وحده — يُرسل العرضَ لمن يقرّر معه،
           وكان يفعلها بنسخ الرابط من شريط المتصفّح إن عرف كيف. */
        shareButton(listing, single)),
      // **سطرُ الإفصاح** (المرحلة ٤٧): النظام يوجب ذكرَ رقم ترخيص الإعلان في كلّ إعلان.
      // ولا يُترجَم: رقمٌ نظاميّ سعوديّ يُقرأ كما صدر بأيّ لغةٍ عُرضت الصفحة.
      listing.disclosure ? el('p', { class: 'card-license', text: listing.disclosure }) : null));
}

/**
 * **زرُّ المشاركة** (المرحلة ٥٢).
 *
 * ويستعمل مشاركةَ الجهاز الأصليّة حيث وُجدت (وهي في الجوّال عند أكثر الناس)، **ويعود
 * إلى نسخ الرابط حيث لا تُوجد** — ولا يُترك الزرُّ صامتًا في متصفّحٍ لا يدعمها:
 * زرٌّ لا يفعل شيئًا أسوأُ من غيابه.
 */
/** العنوان بعزل الأسماء العربيّة (المرحلة ٥٨): «Land — <bdi>العارض، الرياض</bdi>». */
function titleNode(listing) {
  const type = typeName(listing, lang);
  const where = [listing.district, listing.city].filter(Boolean).join(lang === 'en' ? ', ' : '، ');
  if (!where) return document.createTextNode(listingTitle(listing, lang));
  return el('span', {}, type, ' — ', el('bdi', { text: where }));
}

function shareButton(listing, single) {
  const url = new URL(`${single}?lang=${lang}`, location.href).href;
  const title = `${typeName(listing, lang)} — ${listing.district || listing.city || ''}`.trim();
  const btn = el('button', {
    type: 'button', class: 'btn',
    text: lang === 'en' ? 'Share' : 'شارك',
  });
  btn.addEventListener('click', async (ev) => {
    ev.stopPropagation();
    try {
      if (navigator.share) { await navigator.share({ title, url }); return; }
      await navigator.clipboard.writeText(url);
      btn.textContent = lang === 'en' ? 'Link copied' : 'نُسخ الرابط';
      setTimeout(() => { btn.textContent = lang === 'en' ? 'Share' : 'شارك'; }, 1600);
    } catch (_) { /* أُلغيت المشاركة أو مُنع الحافظة — ولا شيء يُقال */ }
  });
  return btn;
}

function draw() {
  // الفرز على **المفاتيح والقيم المخزَّنة** لا على النصّ المعروض: تبديل اللغة لا يُفرغ الفرز.
  const items = all.filter((l) => (!filters.type || (l.type || l.typeLabel) === filters.type)
    && (!filters.purpose || (l.purposes || l.purposeLabels || []).includes(filters.purpose))
    && (!filters.district || l.district === filters.district)
    /* السعر والمساحة (المرحلة ٥٨): «حتى» للسعر و«فأكثر» للمساحة — وهما ما يُسأل عنه أوّلًا.
       **وبلا سعرٍ لا يُقصى بفلتر السعر**: عرضٌ سعرُه عند الطلب قد يكون في الميزانية. */
    && (!filters.priceMax || l.price == null || Number(l.price) <= Number(filters.priceMax))
    && (!filters.areaMin || (l.area != null && Number(l.area) >= Number(filters.areaMin)))
    && (!filters.favs || favs.has(String(l.ref))));
  /* **والترتيبُ بالسعر** (المرحلة ٥٢): «أرخصُ فلّة عندكم؟» أوّلُ سؤالٍ عند كلّ مشترٍ،
     ولم يكن في الصفحة ترتيبٌ أصلًا. **وبلا سعرٍ يُؤخَّر لا يُحذف**: عرضٌ سعرُه عند
     الطلب ما زال عرضًا، وإقصاؤه من الترتيب إخفاءٌ له. */
  const priced = (l) => (l.price == null ? null : Number(l.price));
  if (sortBy === 'cheap' || sortBy === 'dear') {
    items.sort((a, b) => {
      const x = priced(a); const y = priced(b);
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      return sortBy === 'cheap' ? x - y : y - x;
    });
  } else if (sortBy === 'new') {
    items.sort((a, b) => String(b.listedAt || '').localeCompare(String(a.listedAt || '')));
  }
  grid.replaceChildren(...items.map(card));
  statusEl.textContent = items.length
    ? `${t.listings(items.length, nf.format(items.length))}${items.length === all.length ? '' : ` ${t.ofCount} ${nf.format(all.length)}`}`
    : (filters.favs && !favs.size ? t.noFavs : (lang === 'en' ? 'No listings match the filter.' : 'لا عروض تطابق الفرز.'));
}

let favChip = null;
function updateFavChip() {
  if (!favChip) return;
  favChip.textContent = `${favs.size ? '♥' : '♡'} ${t.favs}${favs.size ? ` (${nf.format(favs.size)})` : ''}`;
  favChip.classList.toggle('is-on', filters.favs);
  favChip.setAttribute('aria-pressed', filters.favs ? 'true' : 'false');
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
  /* السعر والمساحة (المرحلة ٥٨) — درجاتُ السلّم التي تفصل بين العروض فقط، فلا قائمةَ
     من عشر درجاتٍ تُعطي النتيجةَ نفسها. */
  const prices = all.map((l) => (l.price == null ? NaN : Number(l.price)));
  const priceSteps = ladderOptions(PRICE_LADDER, prices, (step, nums) => nums.some((v) => v <= step) && nums.some((v) => v > step));
  if (priceSteps.length) {
    const sel = el('select', { 'aria-label': t.priceUpTo }, el('option', { value: '', text: t.priceUpTo }),
      priceSteps.map((v) => el('option', { value: String(v), text: t.priceOpt(shortMoney(v)), selected: filters.priceMax === String(v) ? true : null })));
    sel.addEventListener('change', () => { filters.priceMax = sel.value; draw(); });
    filtersBox.append(sel);
    any = true;
  }
  const areas = all.map((l) => (l.area == null ? NaN : Number(l.area)));
  const areaSteps = ladderOptions(AREA_LADDER, areas, (step, nums) => nums.some((v) => v >= step) && nums.some((v) => v < step));
  if (areaSteps.length) {
    const sel = el('select', { 'aria-label': t.areaFrom }, el('option', { value: '', text: t.areaFrom }),
      areaSteps.map((v) => el('option', { value: String(v), text: t.areaOpt(`${nf.format(v)} ${t.m2}`), selected: filters.areaMin === String(v) ? true : null })));
    sel.addEventListener('change', () => { filters.areaMin = sel.value; draw(); });
    filtersBox.append(sel);
    any = true;
  }
  /* **والترتيبُ بجانب الفلاتر** — لا يُخفى ولو كانت الفلاترُ كلُّها بخيارٍ واحد. */
  const sortLabels = lang === 'en'
    ? [['', 'Sort: default'], ['new', 'Newest'], ['cheap', 'Cheapest'], ['dear', 'Most expensive']]
    : [['', 'الترتيب: كما وصل'], ['new', 'الأحدث'], ['cheap', 'الأرخص'], ['dear', 'الأغلى']];
  const sortSel = el('select', { 'aria-label': sortLabels[0][1] },
    sortLabels.map(([value, label]) => el('option', { value, text: label, selected: sortBy === value ? true : null })));
  sortSel.addEventListener('change', () => { sortBy = sortSel.value; draw(); });
  filtersBox.append(sortSel);
  /* المفضّلة (المرحلة ٥٨): زرٌّ يُبدّل لا قائمة — ضغطةٌ واحدة تُريك ما حفظت. */
  favChip = el('button', { type: 'button', class: 'btn btn-sm fav-chip', 'aria-pressed': 'false' });
  favChip.addEventListener('click', () => { filters.favs = !filters.favs; updateFavChip(); draw(); });
  filtersBox.append(favChip);
  updateFavChip();
  filtersBox.hidden = false;
}

async function load() {
  try {
    // no-store: تحديث الصفحة يعني رؤية آخر نشر فعلًا، لا نسخة من ذاكرة المتصفح.
    const res = await fetch('/api/listings', { headers: { accept: 'application/json' }, cache: 'no-store' });
    if (!res.ok) throw new Error('تعذر تحميل العروض');
    const snapshot = await res.json();
    all = snapshot.listings || [];
    // زرُّ الحجز لا يظهر إلا إن فُتح الحجزُ فعلًا — ووعدٌ بموعدٍ لا يُحجز أسوأُ من لا وعد.
    bookingOpen = !!snapshot.booking?.enabled;

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
