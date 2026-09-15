// عرض سجلّ «ماذا تغيّر ومتى» (المرحلة ٣٥).
//
// السجلّ يُكتب في المستودع لكل حقلٍ متتبَّع. وهذه تعرضه — مطويًّا: هو جوابٌ لسؤالٍ يُطرح
// أحيانًا («قلتَ لي سعرًا غير هذا»، «متى صار موافقًا؟»)، لا معلومةٌ تُقرأ كل مرّة.

import { el } from './dom.js';
import { formatDateTime, formatSAR, formatNumber } from './format.js';
import { ENUMS, labelFor } from '../data/schema.js';

/** تسميات الحقول المتتبَّعة — بلا تسمية يظهر اسم الحقل خامًا وهو لا يعني شيئًا للقارئ. */
const FIELD_LABELS = {
  price: 'السعر',
  status: 'الحالة',
  captureStatus: 'حالة المعالجة',
  area: 'المساحة',
  ownerName: 'اسم المالك',
  agreementSignedAt: 'توقيع الاتفاقية',
  stage: 'المرحلة',
  phone: 'الجوال',
  phone2: 'جوال ثانٍ',
  doNotContact: 'لا تتصل',
  referralSource: 'المصدر',
  budgetMax: 'سقف الميزانية',
  closeReason: 'سبب الإيقاف',
  finalPrice: 'السعر النهائي',
  commission: 'العمولة',
  partnerName: 'الشريك',
  partnerShare: 'نصيب الشريك',
  commissionPaidAt: 'قبض العمولة',
  type: 'النوع',
  number: 'الرقم',
};

const MONEY = new Set(['price', 'budgetMax', 'finalPrice', 'commission', 'partnerShare']);
const ENUM_OF = {
  stage: 'clientStages',
  captureStatus: 'captureStatuses',
  closeReason: 'matchRejectReasons',
};

function show(field, value, lists = null) {
  if (value == null || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'نعم' : 'لا';
  if (MONEY.has(field)) return formatSAR(value);
  if (field === 'area') return `${formatNumber(value)} م²`;
  if (field === 'agreementSignedAt' || field === 'commissionPaidAt') return formatDateTime(value);
  const source = ENUM_OF[field];
  if (source && ENUMS[source]) return labelFor(ENUMS[source], value) || String(value);
  // «الحالة» قوائمها من الإعدادات لا من الثوابت، فتُمرَّر عند توفّرها.
  if (field === 'status' && Array.isArray(lists?.statuses)) {
    return lists.statuses.find((x) => x === value) || String(value);
  }
  return String(value);
}

/**
 * صندوقٌ مطويّ بآخر التغييرات، أو null إن لم يتغيّر شيء بعد.
 * @param {object} record السجل
 * @param {{ lists }} options قوائم الإعدادات لترجمة «الحالة»
 */
export function historyBox(record, { lists = null } = {}) {
  const rows = Array.isArray(record?.history) ? [...record.history].reverse() : [];
  if (!rows.length) return null;

  const changeLine = ([field, [from, to]]) => el('span', { class: 'history-change' },
    el('span', { class: 'strong', text: `${FIELD_LABELS[field] || field}: ` }),
    el('span', { class: 'muted', text: show(field, from, lists) }),
    el('span', { text: ' ← ' }),
    el('span', { text: show(field, to, lists) }));

  const entryRow = (entry) => el('li', { class: 'history-row' },
    el('span', { class: 'muted small', text: formatDateTime(entry.at) }),
    el('span', {}, Object.entries(entry.changes || {}).map(changeLine)));

  return el('details', { class: 'history-box' },
    el('summary', {}, `سجلّ التغييرات (${formatNumber(rows.length)})`),
    el('ul', { class: 'simple-list' }, rows.map(entryRow)));
}
