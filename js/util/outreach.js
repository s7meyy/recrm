// ما يصل العميل — ومَن يشهد أنّه وصل (المرحلة ٤٧).
//
// تفتح واتساب من النظام بقالبٍ جاهز، **ولا يُسجَّل أنّك أرسلت**. فسجلُّ التواصل يتّكل
// على أن تعود وتكتب «تواصلتُ معه» — وأكثرُ الناس لا يعود. فتظهر في «المتأخّرين» وأنت
// كلّمتَه أمس، وتتّصل مرّةً ثانيةً فتبدو كمن لا يضبط عمله.
//
// **والحلُّ ليس أن يدّعي النظامُ ما لا يعلم.** فتحُ محادثةٍ ليس إرسالًا: قد تقرأ القالب
// فتُغلق، أو ينقطع الاتصال، أو تُبدّل رأيك. والنظام يرى النقرةَ عندك ولا يرى «إرسال»
// في تطبيقٍ آخر — ولن يراها أبدًا.
//
// **فيُسجَّل ما رآه، وموسومًا بأنّه مستنتَج:** يمنعك من تكرار الاتصال، ولا يشهد لك في
// خلافٍ شهادةَ المؤكَّد. وتبقى تحويلُه إلى مؤكَّدٍ بيدك — سطرٌ تكتبه إن شئت.

import { repo } from '../data/repository.js';
import { toInternational } from './phone.js';

/** وسمُ ما استُنتج، يُعرض حيث يُعرض التواصل. */
export const INFERRED_LABEL = 'مُستنتَج — فُتحت المحادثة ولم يُتأكَّد الإرسال';

/**
 * يفتح محادثة واتساب **ويسجّل تواصلًا مستنتَجًا**.
 *
 * ولا يُسجَّل إلّا لعميلٍ معروف: رسالةٌ إلى رقمٍ لا سجلَّ له لا مكان لها. وفشلُ التسجيل
 * **لا يمنع فتح المحادثة**: عملُك أهمُّ من دفتره.
 *
 * @param {{ clientId?, phone?, text?, note?, type? }} o
 * @returns {Promise<{ opened: boolean, logged: boolean }>}
 */
export async function openWhatsApp({ clientId = null, phone = '', text = '', note = '', type = 'whatsapp' } = {}) {
  const to = phone ? toInternational(phone) : '';
  const url = `https://wa.me/${to}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
  let opened = false;
  try {
    opened = !!window.open(url, '_blank', 'noopener');
  } catch (_) { opened = false; }

  let logged = false;
  if (clientId) {
    try {
      await repo.clients.addContact(clientId, {
        type, date: new Date().toISOString(), note, inferred: true,
      });
      logged = true;
    } catch (_) { logged = false; }
  }
  if (logged) window.dispatchEvent(new CustomEvent('kassab:data-changed'));
  return { opened, logged };
}

/**
 * زرُّ واتساب يسجّل ما يفتحه — بديلُ `<a href="wa.me/…">` الصامت.
 *
 * ويبقى رابطًا لا زرًّا في المظهر وحده؟ **لا**: الرابطُ يفتح تبويبًا قبل أن يُسجَّل شيء،
 * فيضيع السجلّ متى أُغلقت الصفحة. والزرُّ يضبط الترتيب.
 *
 * @param {Function} el باني العناصر (يُمرَّر كي لا تعتمد هذه الوحدة على DOM في الاختبار)
 */
export function whatsappButton(el, {
  clientId, phone, text = '', note = '', label = '💬 واتساب', cls = 'btn',
  /**
   * **نصٌّ يُقرأ لحظةَ الضغط لا لحظةَ البناء** (المرحلة ٤٩).
   *
   * حيث يُعرض النصُّ في رقعةٍ تُحرَّر (المطالبة بالمتأخّر مثلًا) كان الزرُّ يرسل
   * ما وُلِّد أوّلًا لا ما كتبتَه أنت — **فيُرسَل غيرُ ما على الشاشة**. و`textOf`
   * دالّةٌ تُقرأ عند الضغط فيُرسَل ما يراه صاحبُه.
   */
  textOf = null,
  /**
   * **`sensitive`**: الزرُّ يحمل `data-sensitive` افتراضًا لأنّ أكثرَ مواضعه رسائلُ
   * فيها أسعارٌ وعمولات، ووضعُ المساعد يخفيها. وفي المطالبة بالمتأخّر لا يُخفى:
   * زرٌّ غائبٌ في نافذةٍ عنوانُها «طالِب بالمتأخّر» يترك من يفتحها بلا فعل.
   */
  sensitive = true,
}) {
  return el('button', {
    type: 'button', class: cls, text: label, ...(sensitive ? { 'data-sensitive': true } : {}),
    title: 'يفتح المحادثة ويسجّل تواصلًا مُستنتَجًا في سجلّ العميل',
    onClick: () => openWhatsApp({ clientId, phone, text: textOf ? textOf() : text, note }),
  });
}


/**
 * **زرُّ «تواصل» الموحّد** (المرحلة ٦٠): اتصالٌ وواتساب وتسجيلُ تواصلٍ كانت ثلاثةَ
 * أزرارٍ متفرّقة في رأس الملفّ وفي نافذته. زرٌّ واحد يفتح قائمةً صغيرة، والاختيارُ الأوّل
 * فيها هو الأكثرُ استعمالًا. وكلُّ خيارٍ هدفُ لمسٍ ٤٤.
 *
 * @param {Function} el باني العناصر
 * @param {{ client, onLog?: Function, sensitive?: boolean }} o `onLog` يفتح تسجيلَ التواصل
 */
export function contactMenu(el, { client, onLog = null, sensitive = true }) {
  const phone = client?.phone || '';
  const wrap = el('div', { class: 'contact-menu' });
  const btn = el('button', {
    type: 'button', class: 'btn btn-primary contact-menu-btn', text: '📞 تواصل ▾',
    'aria-haspopup': 'menu', 'aria-expanded': 'false',
    ...(sensitive ? { 'data-sensitive': true } : {}),
  });
  const items = [
    phone ? el('a', { class: 'contact-menu-item', role: 'menuitem', href: `tel:${phone}`, text: '📞 اتصال' }) : null,
    phone ? el('button', {
      type: 'button', class: 'contact-menu-item', role: 'menuitem', text: '💬 واتساب',
      title: 'يفتح المحادثة ويسجّل تواصلًا مُستنتَجًا في سجلّ العميل',
      onClick: () => { close(); openWhatsApp({ clientId: client.id, phone, note: 'فُتحت المحادثة من زرّ التواصل' }); },
    }) : null,
    onLog ? el('button', { type: 'button', class: 'contact-menu-item', role: 'menuitem', text: '📝 سجّل تواصلًا', onClick: () => { close(); onLog(); } }) : null,
  ].filter(Boolean);
  if (!items.length) return null;
  const menu = el('div', { class: 'contact-menu-list', role: 'menu', hidden: true }, items);
  const close = () => { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); document.removeEventListener('click', onDoc, true); };
  const onDoc = (e) => { if (!wrap.contains(e.target)) close(); };
  btn.addEventListener('click', () => {
    const open = menu.hidden;
    menu.hidden = !open;
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) setTimeout(() => document.addEventListener('click', onDoc, true), 0);
  });
  wrap.append(btn, menu);
  return wrap;
}
