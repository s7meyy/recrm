// دلالات ألوان الخريطة (المرحلة ٣٨).
//
// كانت الخريطة تلوّن بالحالة وحدها، فالبائعُ والمؤجِّر والأرضُ والشقّة كلّها نقطةٌ واحدة
// اللون، ولا تُقرأ الخريطة إلا بفتح كل نقطة. وهذه تجعل معنى اللون اختيارًا: الحالة، أو
// الغرض (بيع/إيجار)، أو النوع (شقق/أراضي). واللون وحده لا يكفي — ولذلك يُسمّى كلُّ لونٍ
// في دليلٍ مكتوبٍ تحت الخريطة، ويُذكر في نافذة كل نقطة، فيقرؤه من لا يفرّق الألوان.

import { ENUMS, BUILTIN_PROPERTY_TYPES } from '../data/schema.js';

export const MAP_SCHEMES = [
  ['status', 'الحالة'],
  ['purpose', 'الغرض'],
  ['type', 'النوع'],
];

export const NO_VALUE = '#5f6b64'; // رماديّ: لا قيمة لهذا السجل في هذا المعنى
export const EXTERNAL_COLOR = '#6b4fa0';

const STATUS_COLOR = {
  not_contacted: '#8a5a00',
  agreed: '#1f7a3f',
  refused: '#b4432f',
  rented: '#0f6e56',
  sold: '#0f6e56',
};

const PURPOSE_COLOR = {
  sale: '#1f7a3f',
  rent: '#1d63b8',
  investment: '#9a6b00',
};

const TYPE_COLOR = {
  land: '#a86a12',
  villa: '#1f7a3f',
  floor: '#6b4fa0',
  apartment: '#1d63b8',
};

// ألوان الأنواع والحالات التي يضيفها المستخدم: تُشتقّ من المفتاح اشتقاقًا ثابتًا،
// فيبقى لونُ النوع نفسَه في كل فتحةٍ للصفحة، ولا يتبدّل بترتيب القائمة.
const EXTRA_PALETTE = ['#b4432f', '#0f6e56', '#7a4e8f', '#1d63b8', '#8a5a00', '#356b7a', '#9a3f6b'];

function stableColor(key) {
  let sum = 0;
  for (let i = 0; i < key.length; i++) sum = (sum * 31 + key.charCodeAt(i)) >>> 0;
  return EXTRA_PALETTE[sum % EXTRA_PALETTE.length];
}

/** قيمة السجل في هذا المعنى — أو null إن لم تكن له قيمة. */
export function schemeValue(scheme, item) {
  if (scheme === 'status') return item.status || null;
  if (scheme === 'type') return item.type || null;
  if (scheme === 'purpose') {
    const list = Array.isArray(item.purposes) ? item.purposes : [];
    // عقارٌ بغرضين يأخذ لون أوّلهما في ترتيب القائمة، ويُذكر ذلك في الدليل صراحةً:
    // قائمة الفرز تُضيّق العرض على غرضٍ واحدٍ متى أردتَ يقينًا.
    for (const p of ENUMS.purposes) if (list.includes(p.key)) return p.key;
    return null;
  }
  return null;
}

export function colorFor(scheme, item, { lists = null, external = false } = {}) {
  const value = schemeValue(scheme, item);
  if (scheme === 'status' && external) return EXTERNAL_COLOR;
  if (!value) return NO_VALUE;
  if (scheme === 'status') return STATUS_COLOR[value] || stableColor(value);
  if (scheme === 'purpose') return PURPOSE_COLOR[value] || stableColor(value);
  if (scheme === 'type') return TYPE_COLOR[value] || stableColor(value);
  return NO_VALUE;
}

/** دليل الألوان: كل لونٍ واسمه، لهذا المعنى. `counts` يملأ عدد ما يحمل كل قيمة. */
export function legendFor(scheme, { lists = null, counts = null } = {}) {
  const at = (key) => (counts ? counts.get(key) || 0 : null);
  let rows = [];
  if (scheme === 'purpose') {
    rows = ENUMS.purposes.map((p) => ({ value: p.key, label: p.label, color: PURPOSE_COLOR[p.key] }));
  } else if (scheme === 'type') {
    const types = lists?.propertyTypes?.length ? lists.propertyTypes : BUILTIN_PROPERTY_TYPES;
    rows = types.map((t) => ({ value: t.key, label: t.label, color: TYPE_COLOR[t.key] || stableColor(t.key) }));
  } else {
    const statuses = lists?.propertyStatuses?.length ? lists.propertyStatuses : [];
    rows = statuses.map((s) => ({ value: s.key, label: s.label, color: STATUS_COLOR[s.key] || stableColor(s.key) }));
  }
  return rows.map((r) => ({ ...r, count: at(r.value) }));
}

/** مجموعة الفرز التي يقابلها هذا المعنى — الضغط على لونٍ يفرز به. */
export const SCHEME_FILTER_GROUP = { purpose: 'purpose', type: 'type', status: null };
