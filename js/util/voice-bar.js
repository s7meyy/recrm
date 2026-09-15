// زرّ الأوامر الصوتية، ثابتٌ في كل صفحة (المرحلة ٣٨).
//
// **لماذا يُعرض ما سُمع قبل التنفيذ؟** لأنّ التعرّف على الصوت يخطئ — خصوصًا في السيارة
// وبين الناس. فلو نُفِّذ ما سُمع مباشرةً لفتح البرنامجُ صفحاتٍ لم تُرِدها، أو أسوأ.
// فالمسموع يُكتب، والفعل يُوصف بالعربية، ثم يُنفَّذ. وما لم يُفهم يُقال صراحةً مع أمثلة،
// لا يُخمَّن.
//
// والزرّ لا يظهر إن لم يدعمه المتصفّح (فايرفوكس لا يدعمه) — زرٌّ معطَّلٌ يُغضب أكثر ممّا
// يُفيد. والاستماع لا يبدأ إلا بضغطك: لا شيء يسمع في الخلفية أبدًا.

import { el, toast } from './dom.js';
import { voiceSupported } from './voice.js';
import { parseCommand, describe, EXAMPLES } from './voice-commands.js';
import { openGlobalSearch } from './global-search.js';
import { applyTheme } from './theme.js';
import { setUI } from '../data/settings.js';

let panel = null;
let statusLine = null;
let heardLine = null;
let recognition = null;
let listening = false;
let btn = null;

export function initVoiceBar() {
  if (!voiceSupported()) return null;
  if (document.getElementById('voice-bar')) return null;

  btn = el('button', {
    type: 'button', id: 'voice-bar-btn', class: 'voice-btn',
    title: 'أمرٌ بالصوت',
    'aria-label': 'أمرٌ بالصوت',
  }, '🎤');
  heardLine = el('div', { class: 'voice-heard' });
  statusLine = el('div', { class: 'voice-status', text: 'اضغط الميكروفون ثم قل أمرك.' });
  const help = el('details', { class: 'voice-help' },
    el('summary', { text: 'ماذا أقول؟' }),
    el('ul', { class: 'simple-list' }, EXAMPLES.map((x) => el('li', { text: `«${x}»` }))));

  panel = el('div', { id: 'voice-bar', class: 'voice-bar', hidden: true }, heardLine, statusLine, help);
  const wrap = el('div', { class: 'voice-dock' }, panel, btn);
  document.body.append(wrap);

  btn.addEventListener('click', () => (listening ? stop() : start()));
  return wrap;
}

function show(text, cls = '') {
  panel.hidden = false;
  statusLine.className = `voice-status ${cls}`.trim();
  statusLine.textContent = text;
}

function stop() {
  listening = false;
  btn?.classList.remove('voice-on');
  try { recognition?.stop(); } catch (_) { /* موقوفٌ أصلًا */ }
}

function start() {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new Recognition();
  recognition.lang = 'ar-SA';
  recognition.interimResults = false;
  recognition.continuous = false;

  heardLine.textContent = '';
  show('أسمعك…');
  recognition.onresult = (event) => {
    const text = [...event.results].map((r) => r[0].transcript).join(' ').trim();
    heardLine.textContent = text ? `سمعتُ: «${text}»` : '';
    handle(text);
  };
  recognition.onerror = (event) => {
    stop();
    if (event.error === 'not-allowed') show('لم يُمنح إذن الميكروفون — اسمح به من إعدادات المتصفّح.', 'bad');
    else if (event.error === 'no-speech') show('لم أسمع شيئًا. جرّب ثانيةً.', 'bad');
    else if (event.error !== 'aborted') show('تعذّر التعرّف على الصوت.', 'bad');
  };
  recognition.onend = stop;

  try {
    recognition.start();
    listening = true;
    btn.classList.add('voice-on');
  } catch (_) {
    show('تعذّر بدء الاستماع.', 'bad');
  }
}

/** مكشوفةٌ للاختبار: تُنفَّذ كما لو سُمعت. */
export async function handle(text) {
  const cmd = parseCommand(text);
  if (!cmd) {
    show(`لم أفهم «${text}». أنا أفهم أوامر معدودة — انظر «ماذا أقول؟» تحت.`, 'bad');
    return false;
  }
  show(`${describe(cmd)}…`);
  await run(cmd);
  return true;
}

async function run(cmd) {
  switch (cmd.kind) {
    case 'route':
      location.hash = `#/${cmd.route}`;
      show(describe(cmd), 'ok');
      break;
    case 'new': {
      // **ننتظر رسم الصفحة الجديدة قبل الضغط.** الصفحة القديمة تبقى في DOM حتى يُعاد
      // الرسم، وفيها زرُّ إضافةٍ رئيسيٌّ كذلك — فالضغط المتعجّل يفتح نموذج الصفحة التي
      // كنتَ فيها لا التي طلبتَها: قلتَ «عقار جديد» ففُتح «عميل جديد».
      const before = document.getElementById('page')?.firstElementChild || null;
      const sameRoute = location.hash === `#/${cmd.route}`;
      location.hash = `#/${cmd.route}`;
      const opened = await clickPrimaryAdd(cmd.route, sameRoute ? null : before);
      if (opened) show(describe(cmd), 'ok');
      else show('فُتحت الصفحة، ولم أجد زرّ الإضافة فيها — أضِف يدويًّا.', 'bad');
      break;
    }
    case 'search':
      openGlobalSearch();
      // الحقل يُملأ بعد فتح النافذة بلحظة (تركيزها مؤجَّل في الأصل).
      setTimeout(() => {
        const input = document.querySelector('.search-modal-body input.search');
        if (!input) return;
        input.value = cmd.query;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }, 80);
      show(describe(cmd), 'ok');
      break;
    case 'theme':
      applyTheme(cmd.theme);
      await setUI({ theme: cmd.theme });
      show(describe(cmd), 'ok');
      break;
    case 'back':
      history.back();
      show(describe(cmd), 'ok');
      break;
    case 'help':
      panel.querySelector('.voice-help').open = true;
      show('هذه أمثلةٌ ممّا أفهمه.', 'ok');
      break;
    default:
      toast('أمرٌ غير معروف', 'error');
  }
}

/**
 * يضغط زرّ الإضافة الرئيسي في الصفحة المطلوبة — بعد أن تصير هي المرسومة فعلًا.
 * @param {string} route المسار المنتظَر
 * @param {Element|null} before أوّل عنصرٍ في `#page` قبل التنقّل؛ ننتظر تبدّله
 */
function clickPrimaryAdd(route, before, tries = 30) {
  return new Promise((resolve) => {
    const attempt = (left) => {
      const page = document.getElementById('page');
      const current = page?.firstElementChild || null;
      const routeReady = location.hash === `#/${route}`;
      const rendered = before == null ? true : current !== before;
      const btnAdd = page?.querySelector('.page-head .btn-primary');
      if (routeReady && rendered && btnAdd) { btnAdd.click(); resolve(true); return; }
      if (left <= 0) { resolve(false); return; }
      setTimeout(() => attempt(left - 1), 90);
    };
    attempt(tries);
  });
}
