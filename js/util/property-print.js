// بطاقة عقار للطباعة / PDF (المرحلة ١١).
// نفس آلية طباعة الفواتير حرفيًا: تُبنى الورقة في #print-root وتُطبع بقواعد @media print —
// بلا مكتبة وبلا تصوير DOM (تصدير الصورة مرفوض بقرار المالك منذ المرحلة ٨).

import { el, clear } from './dom.js';
import { formatSAR, formatArea, formatDate, formatNumber, daysWord } from './format.js';
import { formatPhone } from './phone.js';
import { getImageUrl } from '../data/images.js';
import { labelFor, ENUMS, TYPE_FIELD_GROUPS } from '../data/schema.js';
import { typeLabel, typeGroup } from '../data/settings.js';

const MAX_IMAGES = 4;

/** ترويسة المكتب المشتركة بين بطاقة العقار والكتالوج والاتفاقية. */
async function officeHeader(company, title, subtitle = '') {
  let logo = null;
  if (company.logoImageId) {
    try {
      const url = await getImageUrl(company.logoImageId);
      if (url) logo = el('img', { class: 'print-logo', src: url, alt: '' });
    } catch (_) { /* شعار مفقود لا يمنع الطباعة */ }
  }
  const lines = [
    { text: company.phone, ltr: true },
    { text: company.email, ltr: true },
    { text: company.address, ltr: false },
    { text: company.crNumber ? `السجل التجاري: ${company.crNumber}` : '', ltr: false },
  ].filter((l) => l.text);
  return el('header', { class: 'print-head' },
    el('div', { class: 'print-company' }, logo,
      el('div', {},
        el('div', { class: 'print-company-name', text: company.name || 'كسّاب' }),
        ...lines.map((l) => el('div', { class: `print-company-line${l.ltr ? ' print-ltr' : ''}`, text: l.text })))),
    el('div', { class: 'print-meta' },
      el('h1', { class: 'print-title', text: title }),
      el('div', { text: subtitle || formatDate(new Date().toISOString()) })));
}

/** يفتح نافذة الطباعة على محتوى مبنيّ، وينظّف بعدها. */
function printNode(node) {
  const root = document.getElementById('print-root');
  if (!root) return;
  clear(root);
  root.append(node);
  document.body.classList.add('printing');
  const cleanup = () => {
    document.body.classList.remove('printing');
    clear(root);
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);
  setTimeout(() => window.print(), 0);
  setTimeout(cleanup, 60000);
}

/** بطاقة عقار واحدة كعنصر (تُستعمل مفردة أو داخل كتالوج). */
async function propertyCard(property, { lists, publicUrl = '' } = {}) {
  const images = [];
  for (const id of (property.images || []).slice(0, MAX_IMAGES)) {
    try {
      const url = await getImageUrl(id);
      if (url) images.push(el('img', { class: 'print-photo', src: url, alt: '' }));
    } catch (_) { /* صورة مفقودة تُتخطّى */ }
  }
  const group = typeGroup(lists, property.type);
  const typeRows = (TYPE_FIELD_GROUPS[group] || [])
    .map((def) => {
      const raw = property.typeFields?.[def.key];
      if (raw == null || raw === '') return null;
      return [def.label, def.input === 'select' ? labelFor(def.options || [], raw) : String(raw)];
    })
    .filter(Boolean);
  const facts = [
    ['النوع', typeLabel(lists, property.type)],
    ['الغرض', (property.purposes || []).map((k) => labelFor(ENUMS.purposes, k)).join(' / ') || '—'],
    ['الموقع', [property.district, property.city].filter(Boolean).join('، ') || '—'],
    ['المساحة', formatArea(property.area)],
    ['السعر', formatSAR(property.price)],
    ...typeRows,
  ];
  return el('section', { class: 'print-card' },
    images.length ? el('div', { class: 'print-photos' }, images) : null,
    el('table', { class: 'print-table' },
      el('tbody', {}, facts.map(([label, value]) => el('tr', {},
        el('th', { style: { width: '28%' }, text: label }),
        el('td', { text: value }))))),
    property.notes ? el('p', { class: 'print-notes', text: property.notes }) : null,
    publicUrl ? el('p', { class: 'print-notes', text: `رابط العرض: ${publicUrl}` }) : null);
}

/**
 * @param {object} property العقار
 * @param {{ lists, company, publicUrl?: string }} ctx
 */
export async function printProperty(property, { lists, company = {}, publicUrl = '' } = {}) {
  printNode(el('article', { class: 'print-doc' },
    await officeHeader(company, 'بطاقة عقار'),
    await propertyCard(property, { lists, publicUrl }),
    company.phone ? el('footer', { class: 'print-footer' },
      `للاستفسار: ${formatPhone(company.phone)}${company.name ? ` — ${company.name}` : ''}`) : null));
}

/**
 * كتالوج لعدة عقارات في ملف واحد (المرحلة ١٣) — كل عقار في صفحة، لعرضه على عميل في اجتماع.
 */
export async function printPropertyCatalog(properties, { lists, company = {}, title = 'عروض مختارة' } = {}) {
  const cards = [];
  for (const p of properties) cards.push(await propertyCard(p, { lists }));
  printNode(el('article', { class: 'print-doc' },
    await officeHeader(company, title, `${properties.length} عرض · ${formatDate(new Date().toISOString())}`),
    ...cards.map((card, i) => el('div', { class: i ? 'print-page-break' : '' }, card)),
    company.phone ? el('footer', { class: 'print-footer' },
      `للاستفسار: ${formatPhone(company.phone)}${company.name ? ` — ${company.name}` : ''}`) : null));
}

/**
 * اتفاقية وساطة/تسويق عقار (المرحلة ١٣): تُملأ من بيانات العقار ومالكه وإعداداتك،
 * وتُطبع لتوقّع قبل أن تبدأ التسويق — فهذا ما تضيع به عمولات الوسطاء عادةً.
 * **ليست مشورة قانونية:** البنود نصّ تكتبه أنت في الإعدادات، وتُطبع كما هي.
 */
export async function printAgreement(property, { lists, company = {}, owner = null } = {}) {
  const today = new Date();
  const end = new Date(today.getTime() + (Number(company.agreementDurationDays) || 90) * 86400000);
  const facts = [
    ['المالك / الطرف الأول', owner?.name || '—'],
    ['جواله', owner?.phone ? formatPhone(owner.phone) : '—'],
    ['الوسيط / الطرف الثاني', company.name || '—'],
    ['العقار', `${typeLabel(lists, property.type)} — ${[property.district, property.city].filter(Boolean).join('، ')}`],
    ['المساحة', formatArea(property.area)],
    ['السعر المطلوب', formatSAR(property.price)],
    ['نسبة العمولة', `${company.commissionPercent ?? 2.5}٪ من قيمة الصفقة`],
    ['مدة الاتفاقية', `${company.agreementDurationDays || 90} يومًا — من ${formatDate(today.toISOString())} إلى ${formatDate(end.toISOString())}`],
  ];
  printNode(el('article', { class: 'print-doc' },
    await officeHeader(company, 'اتفاقية وساطة وتسويق عقار'),
    el('table', { class: 'print-table' },
      el('tbody', {}, facts.map(([label, value]) => el('tr', {},
        el('th', { style: { width: '30%' }, text: label }),
        el('td', { text: value }))))),
    company.agreementTerms ? el('section', { class: 'print-notes', text: company.agreementTerms }) : null,
    el('section', { class: 'print-signatures' },
      el('div', {}, el('div', { text: 'الطرف الأول (المالك)' }), el('div', { class: 'print-sign-line' })),
      el('div', {}, el('div', { text: 'الطرف الثاني (الوسيط)' }), el('div', { class: 'print-sign-line' })))));
}

/* ===== تقرير المقارنة السوقية للمالك (المرحلة ٢٦) ===== */

const CONFIDENCE_LABEL = { high: 'عالية', medium: 'متوسطة', low: 'منخفضة' };
const SOURCE_LABEL = { inventory: 'من مخزونك', external: 'عرض معلن', deal: 'صفقة منجزة' };

/**
 * تقرير مقارنة سوقية (CMA) يُسلَّم للمالك.
 *
 * المالك يقول «عقاري يساوي كذا» ولا تملك ورقةً تردّ بها. هذه هي الورقة: **رقمٌ من بياناتك
 * أنت، بعيّنته ومصدرها وتاريخها** — لا تقديرٌ من نموذج ولا مؤشرٌ من موقع لا يعرف حيّه.
 *
 * ثلاثة قيود مكتوبة **في الورقة نفسها** لا هنا فقط، لأن من يقرؤها ليس أنت:
 *   ١) العيّنة وحجمها ومصدرها معروضة صفًّا صفًّا — لا رقم بلا سنده.
 *   ٢) درجة الثقة معلنة، والعيّنة الصغيرة تُقال صراحةً «لا تكفي لقرار».
 *   ٣) ليست تقييمًا معتمدًا ولا شهادة تقييم نظامية — وهذا مكتوب في التذييل.
 *
 * @param {object} property العقار
 * @param {{ lists, company, owner, estimate, trend, asking }} ctx `estimate` ناتج estimatePrice
 */
export async function printCma(property, { lists, company = {}, owner = null, estimate = null, trend = null } = {}) {
  const where = [property.district, property.city].filter(Boolean).join('، ');
  const subtitle = `${typeLabel(lists, property.type)}${where ? ` — ${where}` : ''} · ${formatDate(new Date().toISOString())}`;

  const facts = [
    ['المالك', owner?.name || '—'],
    ['العقار', `${typeLabel(lists, property.type)}${where ? ` — ${where}` : ''}`],
    ['المساحة', formatArea(property.area)],
    ['السعر المطلوب حاليًا', formatSAR(property.price)],
  ];

  // النطاق المقترح: الربيع الأول والثالث لسعر المتر مضروبين في المساحة — لا رقم واحد
  // يوهم بدقّة لا يملكها الحساب.
  const range = estimate?.ok
    ? el('section', { class: 'print-cma-range' },
        el('table', { class: 'print-table' }, el('tbody', {},
          el('tr', {}, el('th', { style: { width: '40%' }, text: 'النطاق المقترح' }),
            el('td', { class: 'print-cma-big', text: `${formatSAR(estimate.low)} — ${formatSAR(estimate.high)}` })),
          el('tr', {}, el('th', { text: 'الأقرب إلى الوسيط' }), el('td', { text: formatSAR(estimate.estimate) })),
          el('tr', {}, el('th', { text: 'وسيط سعر المتر' }), el('td', { text: `${formatSAR(estimate.ppm.median)} / م²` })),
          el('tr', {}, el('th', { text: 'العيّنة' }),
            el('td', { text: `${formatNumber(estimate.count)} عقارًا ${estimate.basis === 'district' ? 'في الحي نفسه' : 'في المدينة'}`
              + ` (${formatNumber(estimate.sources.inventory)} من مخزونك · ${formatNumber(estimate.sources.external)} معلنة · ${formatNumber(estimate.sources.deal)} صفقات)` })),
          el('tr', {}, el('th', { text: 'درجة الثقة' }),
            el('td', { text: `${CONFIDENCE_LABEL[estimate.confidence] || '—'} — تشتّت العيّنة ${formatNumber(Math.round(estimate.spread * 100))}٪` })))))
    : el('p', { class: 'print-notes', text: estimate?.reason === 'area'
        ? 'لا مساحة مسجَّلة لهذا العقار، فلا يمكن حساب سعر المتر — أضف المساحة ثم أعد التقرير.'
        : `العيّنة المتاحة ${formatNumber(estimate?.count || 0)} عقارًا، وهي لا تكفي لنطاقٍ يُبنى عليه قرار. التقرير يعرض ما توفّر من مقارنات دون رقم مقترح.` });

  const rows = (estimate?.comparables || []).map((c) => el('tr', {},
    el('td', { text: [c.district, c.city].filter(Boolean).join('، ') || '—' }),
    el('td', { text: formatArea(c.area) }),
    el('td', { text: formatSAR(c.price) }),
    el('td', { text: `${formatSAR(c.ppm)} / م²` }),
    el('td', { text: SOURCE_LABEL[c.source] || c.source }),
    el('td', { text: c.at ? formatDate(c.at) : '—' })));

  const comparables = rows.length
    ? el('table', { class: 'print-table' },
        el('thead', {}, el('tr', {}, ['الموقع', 'المساحة', 'السعر', 'سعر المتر', 'المصدر', 'التاريخ'].map((t) => el('th', { text: t })))),
        el('tbody', {}, rows))
    : el('p', { class: 'print-notes', text: 'لا مقارنات متاحة بعد لهذا النوع في هذا الموقع.' });

  const history = trend
    ? el('p', { class: 'print-notes', text: `حركة السعر المسجَّلة: ${formatNumber(trend.changes)} تغييرًا`
        + `${trend.dropPct > 0 ? ` · خُفّض ${formatNumber(trend.dropPct)}٪ عن أول سعر` : ''}`
        + `${trend.days != null ? ` · مضى على السعر الحالي ${daysWord(trend.days)}` : ''}` })
    : null;

  printNode(el('article', { class: 'print-doc' },
    await officeHeader(company, 'تقرير مقارنة سوقية', subtitle),
    el('table', { class: 'print-table' },
      el('tbody', {}, facts.map(([label, value]) => el('tr', {},
        el('th', { style: { width: '30%' }, text: label }),
        el('td', { text: value }))))),
    el('h2', { class: 'print-section-title', text: 'السعر المقترح' }),
    range,
    history,
    el('h2', { class: 'print-section-title', text: 'العقارات المقارَنة' }),
    comparables,
    el('footer', { class: 'print-footer' },
      'هذا التقرير مبني على بيانات هذا المكتب وحده (مخزونه وعروض معلنة رصدها وصفقات أتمّها) '
      + 'وقت طباعته، وهو تقديرٌ استرشادي للتفاوض — وليس تقييمًا عقاريًا معتمدًا ولا شهادة تقييم نظامية. '
      + (company.phone ? `للاستفسار: ${formatPhone(company.phone)}${company.name ? ` — ${company.name}` : ''}` : ''))));
}
