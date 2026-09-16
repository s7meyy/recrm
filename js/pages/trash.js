// سلة المحذوفات مسارًا مستقلًّا (المرحلة ٤٣).
//
// كانت قسمًا داخل الإعدادات: مبنيّةً وتعمل، لكن بلا رابطٍ في الشريط، و`#/trash` يهبط
// بصاحبه على «يومي» صامتًا. ومن حذف عميلًا بالخطأ يبحث عن «المحذوفات» لا عن «الإعدادات».
//
// **ولا نسخةَ ثانيةً من الشاشة**: الجسمُ نفسُه مستوردٌ من `settings.js`، فإصلاحٌ فيه
// يصلح الموضعين معًا. والقسمُ باقٍ في الإعدادات لمن اعتاده هناك.

import { trashBody } from './settings.js';
import { el, clear } from '../util/dom.js';

export async function render(container) {
  clear(container);
  container.append(el('div', { class: 'page-head' }, el('h1', { text: 'سلة المحذوفات' })));

  const body = el('div');
  const panel = el('section', { class: 'panel' },
    el('p', { class: 'panel-desc', text: 'نسخة من كل سجل حذفته خلال ثلاثين يومًا. يُستعاد السجل نفسه — أما ما حُذف تبعًا له (طلبات العميل مثلًا) فلا يعود.' }),
    body);
  container.append(panel);

  const redraw = async () => {
    clear(body);
    try { body.append(await trashBody(redraw)); }
    catch (err) { body.append(el('div', { class: 'error-box', text: err.message || String(err) })); }
  };
  await redraw();
}
