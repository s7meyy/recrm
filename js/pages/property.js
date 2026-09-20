/**
 * **ملفُّ العقار** — ما تقرؤه قبل أن تتكلّم عنه (المرحلة ٥٢).
 *
 * للعميل ملفٌّ كاملٌ منذ المرحلة ٢٠، **وللعقار لم يكن إلا استمارةُ تعديلٍ بثمانيةٍ
 * وثلاثين حقلًا**. فمن ضغط بطاقةً ليعرف عن عقارٍ فُتحت له «تعديل العقار» وفيها «حذف
 * العقار» و«حفظ التعديلات» — ولوحاتٌ ثمينةٌ بُنيت له (رحلةُ السعر، وشهادةُ السوق،
 * والمطابقاتُ النشطة) **لا تُرى إلا بالنزول داخل الاستمارة**.
 *
 * **ومن يريد أن يرى لا يريد أن يعدّل**، ومن فتح استمارةً على جوّاله قد يحفظ ما لم يقصد.
 *
 * **قراءةٌ محضة**: لا تُنشئ ولا تعدّل ولا تحذف — تجمع وتعرض وتربط بالصفحات الأصليّة،
 * فلا مصدرَ حقيقةٍ ثانيًا يناقضها. والتعديلُ زرٌّ واحدٌ يفتح الاستمارةَ كما هي.
 */

import { repo } from '../data/repository.js';
import { ENUMS, labelFor } from '../data/schema.js';
import { getLists, typeLabel, getCompany } from '../data/settings.js';
import { loadMatchingContext } from '../data/matching.js';
import { el, clear, badge, emptyState, toast } from '../util/dom.js';
import { formatSAR, formatArea, formatDate, formatNumber, countOf } from '../util/format.js';
import { formatPhone } from '../util/phone.js';
import { propertyEvidence, priceDrops } from '../util/property-evidence.js';
import { historyBox } from '../util/history-view.js';
import { printProperty } from '../util/property-print.js';
import { whatsappButton } from '../util/outreach.js';
import { getImageUrl } from '../data/images.js';
import { districtStatSmart, marketLine, vsMarket } from '../util/market.js';

function routePropertyId() {
  const m = /^#\/property\/([^/?#]+)/.exec(location.hash || '');
  return m ? decodeURIComponent(m[1]) : null;
}

/* ===== رأس الصفحة: ما هو، وبكم، ولمن ===== */

function headPanel(ctx) {
  const p = ctx.property;
  const actions = el('div', { class: 'head-actions' },
    el('a', { class: 'btn btn-primary', href: `#/properties/${p.id}`, text: 'تعديل البيانات' }),
    el('button', {
      type: 'button', class: 'btn btn-ghost', text: 'اطبع البطاقة',
      onClick: () => printProperty(p, { lists: ctx.lists, company: ctx.company }).catch(() => toast('تعذّرت الطباعة', 'error')),
    }));

  return el('div', { class: 'page-head' },
    el('div', {},
      el('h1', { text: `${typeLabel(ctx.lists, p.type)} — ${p.district || p.city}` }),
      el('p', { class: 'muted small' },
        `${formatArea(p.area)} · `,
        p.price == null ? 'السعر غير معروف' : formatSAR(p.price),
        p.price != null && Number(p.area) > 0 ? ` · ${formatNumber(Math.round(p.price / p.area))} ريال/م²` : '',
        ' · ',
        labelFor(ENUMS.captureStatuses, p.captureStatus) || '',
      )),
    actions);
}

/* ===== الصور كبيرةً — أوّلُ ما يُنظر إليه ===== */

async function mediaPanel(ctx) {
  const ids = (ctx.property.images || []).filter(Boolean);
  if (!ids.length) {
    return el('div', { class: 'panel' },
      el('h2', { text: 'الوسائط' }),
      el('p', { class: 'muted small' },
        'بلا صور — ',
        el('a', { href: `#/properties/${ctx.property.id}`, text: 'أضف صورًا' }),
        '. والعرضُ بلا صورةٍ يُتخطّى في الصفحة العامّة.'));
  }
  const strip = el('div', { class: 'media-strip' });
  for (const id of ids.slice(0, 8)) {
    try {
      const url = await getImageUrl(id, { thumb: true });
      if (url) strip.append(el('img', { src: url, alt: '', loading: 'lazy' }));
    } catch (_) { /* صورةٌ تعذّرت لا تُسقط الصفحة */ }
  }
  return el('div', { class: 'panel' },
    el('h2', { text: `الوسائط (${formatNumber(ids.length)})` }), strip);
}

/* ===== الحقائق: ما يسأل عنه العميل ===== */

function factsPanel(ctx) {
  const p = ctx.property;
  const rows = [
    ['المدينة والحي', [p.city, p.district].filter(Boolean).join(' — ') || '—'],
    ['الغرض', (p.purposes || []).map((k) => labelFor(ENUMS.purposes, k)).join('، ') || '—'],
    ['الحالة', p.status ? (ctx.lists.propertyStatuses?.find((s) => s.key === p.status)?.label || p.status) : '—'],
    ['رقم الصك', p.deedNumber || '—'],
    ['المبنى والوحدة', [p.building, p.unitNo].filter(Boolean).join(' · ') || '—'],
    ['ترخيص الإعلان', p.adLicense?.number || '—'],
    ['اتفاقية الوساطة', p.agreementSignedAt ? formatDate(p.agreementSignedAt) : '—'],
  ];
  return el('div', { class: 'panel' },
    el('h2', { text: 'الحقائق' }),
    el('dl', { class: 'kv' }, rows.flatMap(([k, v]) => [el('dt', { text: k }), el('dd', { text: String(v) })])));
}

/* ===== المالك: اسمٌ وجوالٌ وزرُّ واتساب ===== */

function ownerPanel(ctx) {
  const owner = ctx.owner;
  if (!owner) {
    return el('div', { class: 'panel' },
      el('h2', { text: 'المالك' }),
      el('p', { class: 'muted small' },
        'بلا مالكٍ مربوط — ',
        el('a', { href: `#/properties/${ctx.property.id}`, text: 'اربطه' }),
        '. وعقارٌ لا تعرف صاحبَه لا تُتمّ صفقتَه.'));
  }
  return el('div', { class: 'panel' },
    el('h2', { text: 'المالك' }),
    el('p', {},
      el('a', { href: `#/client/${owner.id}`, class: 'strong', text: owner.name || 'بلا اسم' }),
      owner.phone ? el('span', { class: 'muted small phone', text: ` · ${formatPhone(owner.phone)}` }) : null),
    el('div', { class: 'row', style: { gap: '6px', marginTop: '8px' } },
      owner.phone ? el('a', { class: 'btn btn-sm', href: `tel:${owner.phone}`, text: 'اتصال' }) : null,
      owner.phone ? whatsappButton(el, {
        clientId: owner.id, phone: owner.phone, cls: 'btn btn-sm',
        text: `بخصوص ${typeLabel(ctx.lists, ctx.property.type)} ${ctx.property.district || ''}`,
      }) : null));
}

/* ===== رحلةُ السعر ===== */

function pricePanel(ctx) {
  const drops = priceDrops(ctx.property);
  const history = (ctx.property.priceHistory || []).filter((h) => h?.at);
  if (!history.length) return null;
  return el('div', { class: 'panel' },
    el('h2', { text: 'رحلة السعر' }),
    el('ul', { class: 'simple-list' }, history.slice(-6).reverse().map((h) => el('li', {},
      el('span', { text: formatDate(h.at) }),
      el('span', { class: 'num', text: h.value == null ? 'بلا سعر' : formatSAR(h.value) })))),
    drops.length
      ? el('p', { class: 'muted small', text: `خُفّض ${countOf(drops.length, 'مرة')} منذ إدراجه.` })
      : el('p', { class: 'muted small', text: 'لم يُخفَّض بعد.' }));
}

/* ===== شهادةُ السوق: ما قاله من عاينوا، وما بِيع فعلًا ===== */

function evidencePanel(ctx) {
  const ev = propertyEvidence({ property: ctx.property, showings: ctx.showings, matches: ctx.matches });
  const s = ev.showings;
  const rows = [];
  if (s.booked) {
    rows.push(el('p', {},
      `${countOf(s.booked, 'معاينة')} · تمّت ${formatNumber(s.done)}`,
      s.noShow ? ` · لم يحضر ${formatNumber(s.noShow)}` : '',
      '. ',
      ev.opinions ? `أعجب ${formatNumber(s.liked)} ولم يُعجب ${formatNumber(s.disliked)}.` : ''));
  }
  if (ev.allReasons?.length) {
    rows.push(el('div', { class: 'chips' }, ev.allReasons.slice(0, 6).map((r) => el('span', { class: 'chip chip-static', text: `${r.label} (${formatNumber(r.count)})` }))));
  }
  /* **وما بِيع فعلًا** (المرحلة ٥٠): تقديرُك من مخزونك، وبجانبه ما دُفع في الحي. */
  const cmp = vsMarket(ctx.property, ctx.market, {});
  if (cmp) {
    rows.push(el('p', { class: 'muted small' },
      el('strong', { text: 'السوق: ' }),
      marketLine(cmp, { formatSAR, countOf }),
      ' ',
      el('a', { href: '#/market', text: 'صفحة السوق' })));
  } else {
    const stat = districtStatSmart(ctx.market, { city: ctx.property.city, district: ctx.property.district, purpose: 'sale', months: 12 });
    if (stat.median) {
      rows.push(el('p', { class: 'muted small', text: `وسيطُ متر ${stat.district || ctx.property.city} ${formatSAR(stat.median)} من ${countOf(stat.n, 'صفقة')} في سنة.` }));
    }
  }
  if (!rows.length) return null;
  return el('div', { class: 'panel' }, el('h2', { text: 'ماذا قال السوق' }), ...rows);
}

/* ===== المطابقاتُ النشطة: من ينتظره الآن ===== */

function matchesPanel(ctx) {
  const mine = (ctx.matches || []).filter((m) => m.propertyId === ctx.property.id && m.status !== 'rejected');
  if (!mine.length) {
    return el('div', { class: 'panel' },
      el('h2', { text: 'من يناسبه' }),
      el('p', { class: 'muted small', text: 'لا مطابقة نشطة — ولا طلبَ عندك يوافق مواصفاته الآن.' }));
  }
  return el('div', { class: 'panel' },
    el('h2', { text: `من يناسبه (${formatNumber(mine.length)})` }),
    el('ul', { class: 'simple-list' }, mine.slice(0, 8).map((m) => {
      const client = ctx.clients.find((c) => c.id === m.clientId);
      return el('li', {},
        el('a', { href: client ? `#/client/${client.id}` : '#/matches', text: client?.name || 'عميل' }),
        el('span', { class: 'num strong', text: `${formatNumber(m.score)}٪` }));
    })),
    el('a', { class: 'btn btn-ghost btn-sm', href: '#/matches', text: 'صفحة المطابقات' }));
}

/* ===== الصفحة ===== */

export async function render(container) {
  const id = routePropertyId();
  clear(container);
  if (!id) {
    container.append(emptyState('افتح ملفَّ عقارٍ من صفحة العقارات.',
      el('a', { class: 'btn btn-primary', href: '#/properties', text: 'العقارات' })));
    return;
  }

  const [property, lists, company, match, showings, clients, market] = await Promise.all([
    repo.properties.get(id), getLists(), getCompany(),
    loadMatchingContext({ withMatches: true }), repo.showings.list(),
    repo.clients.list(), repo.marketDeals.list(),
  ]);

  if (!property) {
    container.append(emptyState('العقار غير موجود، أو حُذف، أو لم يُعتمد بعد.',
      el('a', { class: 'btn btn-primary', href: '#/properties', text: 'العقارات' })));
    return;
  }

  const ctx = {
    property, lists, company, showings, clients, market,
    matches: match.matches || [],
    owner: property.ownerId ? clients.find((c) => c.id === property.ownerId) : null,
  };

  container.append(headPanel(ctx));
  const grid = el('div', { class: 'settings-grid' });
  container.append(grid);
  grid.append(await mediaPanel(ctx));
  grid.append(factsPanel(ctx));
  grid.append(ownerPanel(ctx));
  const price = pricePanel(ctx);
  if (price) grid.append(price);
  const evidence = evidencePanel(ctx);
  if (evidence) grid.append(evidence);
  grid.append(matchesPanel(ctx));
  /* **و`null` لا يُلحَق بالصفحة**: `historyBox` تعيد `null` حين لا سجلّ، و`append(null)`
     يطبع كلمة «null» نصًّا — وهو عطبٌ رآه الفحصُ في أوّل فتحة. */
  const history = historyBox(property, { lists });
  if (history) container.append(history);
}
