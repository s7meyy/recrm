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
export function whatsappButton(el, { clientId, phone, text = '', note = '', label = '💬 واتساب', cls = 'btn' }) {
  return el('button', {
    type: 'button', class: cls, text: label, 'data-sensitive': true,
    title: 'يفتح المحادثة ويسجّل تواصلًا مُستنتَجًا في سجلّ العميل',
    onClick: () => openWhatsApp({ clientId, phone, text, note }),
  });
}
