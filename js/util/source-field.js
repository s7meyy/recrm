// تاق «المصدر» (المرحلة ٨): الوسيط أو الجهة التي أحالت العقار/العميل/الطلب.
// حقل نصّي حر واحد بثلاثة أماكن، فارغ افتراضًا (فلا يظهر شيء)، باقتراحات من القيم المستعملة
// سابقًا عبر <datalist> (اقتراح لا تقييد — أي قيمة جديدة مقبولة وتُضاف للاقتراحات عند الحفظ).

import { el, badge } from './dom.js';
import { addSource } from '../data/settings.js';

let seq = 0;

/** يبني حقل المصدر مع قائمة اقتراحاته. `node` يُدرج في النموذج و`input.value` يُقرأ عند الحفظ. */
export function sourceField(value = '', suggestions = []) {
  const listId = `source-options-${++seq}`;
  const input = el('input', { class: 'input', type: 'text', value: value || '', list: listId, placeholder: 'اتركه فارغًا إن لم يكن هناك وسيط محيل' });
  const datalist = el('datalist', { id: listId }, suggestions.map((s) => el('option', { value: s })));
  return { input, node: el('div', {}, input, datalist) };
}

/** يسجّل القيمة في قائمة الاقتراحات بعد حفظ السجل (يتجاهل الفارغ). */
export async function rememberSource(value) {
  const name = String(value ?? '').trim();
  if (name) await addSource(name);
}

/** شارة المصدر — تُعرض فقط حين يكون الحقل معبّأً. */
export function sourceBadge(value) {
  const name = String(value ?? '').trim();
  return name ? badge(`المصدر: ${name}`, 'badge-source') : null;
}
