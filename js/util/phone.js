// توحيد صيغ أرقام الجوال السعودية إلى الصورة القياسية 05XXXXXXXX.
// يقبل: 05x / 5x / 9665x / +9665x / 009665x، والأرقام العربية، والفواصل والمسافات.
// الأرقام غير السعودية أو غير المكتملة تُحفظ أرقامًا فقط بعد التنظيف.

import { foldDigits } from './arabic.js';

export function normalizePhone(input) {
  if (input == null) return '';
  let s = foldDigits(String(input)).replace(/[^\d+]/g, '');
  if (!s) return '';
  if (s.startsWith('+')) s = s.slice(1);
  if (s.startsWith('00')) s = s.slice(2);
  if (s.startsWith('966')) s = s.slice(3);
  s = s.replace(/^0+/, '');
  if (/^5\d{8}$/.test(s)) return `0${s}`; // جوال
  if (/^1\d{8}$/.test(s)) return `0${s}`; // هاتف ثابت (011…)
  return s;
}

export function isSaudiMobile(phone) {
  return /^05\d{8}$/.test(phone || '');
}

/** الصيغة الدولية بلا علامة +: 9665XXXXXXXX (تلزم لروابط واتساب لاحقًا). */
export function toInternational(phone) {
  const p = normalizePhone(phone);
  return /^0[15]\d{8}$/.test(p) ? `966${p.slice(1)}` : p;
}

/** للعرض: 050 123 4567 */
export function formatPhone(phone) {
  const p = normalizePhone(phone);
  if (/^0[15]\d{8}$/.test(p)) return `${p.slice(0, 3)} ${p.slice(3, 6)} ${p.slice(6)}`;
  return p;
}

/** كل الصيغ التي قد يكتبها المستخدم في البحث، لتُضمَّن في searchKey. */
export function phoneSearchForms(phone) {
  const p = normalizePhone(phone);
  if (!p) return [];
  const forms = new Set([p]);
  if (/^0[15]\d{8}$/.test(p)) {
    forms.add(p.slice(1));
    forms.add(`966${p.slice(1)}`);
    forms.add(`+966${p.slice(1)}`);
  }
  return [...forms];
}
