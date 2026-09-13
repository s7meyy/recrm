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

/**
 * @param {object} property العقار
 * @param {{ lists, company, publicUrl?: string }} ctx
 */
export async function printProperty(property, { lists, company = {}, publicUrl = '' } = {}) {
  const root = document.getElementById('print-root');
  if (!root) return;
  clear(root);

  let logo = null;
  if (company.logoImageId) {
    try {
      const url = await getImageUrl(company.logoImageId);
      if (url) logo = el('img', { class: 'print-logo', src: url, alt: '' });
    } catch (_) { /* شعار مفقود لا يمنع الطباعة */ }
  }

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
      const text = def.input === 'select' ? labelFor(def.options || [], raw) : String(raw);
      return [def.label, text];
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

  const companyLines = [
    { text: company.phone, ltr: true },
    { text: company.email, ltr: true },
    { text: company.address, ltr: false },
  ].filter((l) => l.text);

  root.append(el('article', { class: 'print-doc' },
    el('header', { class: 'print-head' },
      el('div', { class: 'print-company' }, logo,
        el('div', {},
          el('div', { class: 'print-company-name', text: company.name || 'كسّاب' }),
          ...companyLines.map((l) => el('div', { class: `print-company-line${l.ltr ? ' print-ltr' : ''}`, text: l.text })))),
      el('div', { class: 'print-meta' },
        el('h1', { class: 'print-title', text: 'بطاقة عقار' }),
        el('div', { text: formatDate(new Date().toISOString()) }))),
    images.length ? el('section', { class: 'print-photos' }, images) : null,
    el('table', { class: 'print-table' },
      el('tbody', {}, facts.map(([label, value]) => el('tr', {},
        el('th', { style: { width: '28%' }, text: label }),
        el('td', { text: value }))))),
    property.notes ? el('section', { class: 'print-notes', text: property.notes }) : null,
    publicUrl ? el('section', { class: 'print-notes', text: `رابط العرض: ${publicUrl}` }) : null,
    company.phone ? el('footer', { class: 'print-footer' },
      `للاستفسار: ${formatPhone(company.phone)}${company.name ? ` — ${company.name}` : ''}`) : null));

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
