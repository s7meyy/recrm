// بطاقة عقار للطباعة / PDF (المرحلة ١١).
// نفس آلية طباعة الفواتير حرفيًا: تُبنى الورقة في #print-root وتُطبع بقواعد @media print —
// بلا مكتبة وبلا تصوير DOM (تصدير الصورة مرفوض بقرار المالك منذ المرحلة ٨).

import { el, clear } from './dom.js';
import { formatSAR, formatArea, formatDate } from './format.js';
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
