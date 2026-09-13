// الإدخال بالصوت (المرحلة ١١): إملاء نص عربي في أي حقل — مفيد في السيارة بعد الجولة.
//
// يعتمد `SpeechRecognition` في المتصفح (Chrome وSafari). **غير مدعوم في فايرفوكس**،
// فالزر لا يظهر أصلًا حين لا يكون مدعومًا (لا زر معطَّل يربك المستخدم).
// التعرّف يجري عبر خدمة المتصفح لا عبر خادمنا؛ وهذا خارج «لا تخرج البيانات من الجهاز»
// فلذلك هو **زر صريح تضغطه أنت** ولا يعمل تلقائيًا أبدًا.

import { el, toast } from './dom.js';

export function voiceSupported() {
  return typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

/**
 * زر إملاء يُلحق النص المسموع بالحقل المُمرَّر.
 * @param {HTMLInputElement|HTMLTextAreaElement} target
 */
export function micButton(target, { lang = 'ar-SA' } = {}) {
  if (!voiceSupported()) return null;
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null;
  let listening = false;

  const btn = el('button', { type: 'button', class: 'btn btn-ghost btn-sm mic-btn', text: '🎙️', title: 'إملاء بالصوت' });

  const stop = () => {
    listening = false;
    btn.classList.remove('mic-on');
    try { recognition?.stop(); } catch (_) { /* مُوقَف أصلًا */ }
  };

  btn.addEventListener('click', () => {
    if (listening) { stop(); return; }
    recognition = new Recognition();
    recognition.lang = lang;
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onresult = (event) => {
      const text = [...event.results].map((r) => r[0].transcript).join(' ').trim();
      if (!text) return;
      const sep = target.value && !/\s$/.test(target.value) ? ' ' : '';
      target.value = `${target.value}${sep}${text}`;
      target.dispatchEvent(new Event('input', { bubbles: true }));
    };
    recognition.onerror = (event) => {
      stop();
      if (event.error === 'not-allowed') toast('لم يُمنح إذن الميكروفون', 'error');
      else if (event.error !== 'aborted' && event.error !== 'no-speech') toast('تعذر التعرّف على الصوت', 'error');
    };
    recognition.onend = stop;
    try {
      recognition.start();
      listening = true;
      btn.classList.add('mic-on');
    } catch (_) {
      toast('تعذر بدء الإملاء', 'error');
    }
  });

  return btn;
}
