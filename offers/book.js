import { countAr } from './i18n.js';
// صفحة حجز الموعد (المرحلة ٢٩).
//
// **لا تحسب الصفحة وقتًا ولا تتحقّق من شيء:** الخادم يعطيها الأوقات، وهي تعرضها،
// وهو الذي يقبل أو يرفض. فتعديل الصفحة في المتصفح لا يفتح وقتًا خارج دوام المكتب.
//
// صفحة مستقلة كأخواتها: لا تصل إلى IndexedDB ولا إلى شيء من النظام الداخلي.

const statusEl = document.getElementById('status');
const slotsEl = document.getElementById('slots');
const form = document.getElementById('book-form');
const chosenEl = document.getElementById('chosen');
const sendBtn = document.getElementById('book-send');
const bookStatus = document.getElementById('book-status');

let chosen = null;

const el = (tag, attrs = null, ...children) => {
  const node = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else if (k === 'onClick') node.addEventListener('click', v);
      else node.setAttribute(k, v === true ? '' : String(v));
    }
  }
  for (const child of children.flat()) {
    if (child == null || child === false || child === '') continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
};

function pick(slot, button) {
  chosen = slot;
  for (const b of slotsEl.querySelectorAll('.slot-btn')) b.classList.remove('chosen');
  button.classList.add('chosen');
  chosenEl.textContent = `الموعد المختار: ${slot.dayLabel} ${slot.date} — ${slot.time}`;
  form.hidden = false;
  form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function draw(data) {
  slotsEl.textContent = '';
  if (!data.enabled) {
    /* مغلقٌ (المرحلة ٥٨): كانت جملةً تحيل إلى «المكتب» بلا زرّ. الآن طرقُ التواصل أزرارٌ،
       والاستمارةُ برقم العرض إن جاء العميل من صفحة عرض. */
    statusEl.textContent = 'الحجز مغلق حاليًا — تواصل معنا مباشرةً أو اترك طلبك ونرتّب لك الموعد.';
    const office = data.office || {};
    const phone = String(office.phone || '').replace(/\D/g, '');
    const intl = phone ? (phone.startsWith('966') ? phone : `966${phone.replace(/^0/, '')}`) : '';
    const ref = new URLSearchParams(location.search).get('p') || '';
    const msg = encodeURIComponent(ref ? `السلام عليكم، أودّ معاينة العرض رقم ${ref}` : 'السلام عليكم، أودّ حجز موعد معاينة');
    slotsEl.append(el('div', { class: 'closed-actions' },
      intl ? el('a', { class: 'btn btn-primary', href: `https://wa.me/${intl}?text=${msg}`, target: '_blank', rel: 'noopener', text: 'واتساب' }) : null,
      office.phone ? el('a', { class: 'btn', href: `tel:${office.phone}`, text: 'اتصال' }) : null,
      el('a', { class: 'btn', href: `intake.html${ref ? `?ref=${encodeURIComponent(ref)}` : ''}`, text: 'اطلب معاينة' })));
    return;
  }
  if (!data.slots.length) {
    statusEl.textContent = 'لا أوقات متاحة حاليًا. حاول لاحقًا أو تواصل مع المكتب.';
    return;
  }
  /* **ومدّةُ الموعد تُجمع** (المرحلة ٥٢): «٣٠ دقيقة» صوابٌ و«٣ دقيقة» لحن،
     وأمسكه الحارسُ حين امتدّ إلى `offers/`. وبالمعجم نفسِه لا بترقيعٍ محليّ. */
  const minWord = countAr(data.slotMinutes, ['دقيقة واحدة', 'دقيقتان', 'دقائق', 'دقيقة'], data.slotMinutes);
  statusEl.textContent = data.place
    ? `مدّة الموعد ${minWord} · المكان: ${data.place}`
    : `مدّة الموعد ${minWord}`;

  // تجميع بالأيام: العميل يفكّر بيومٍ أولًا ثم بساعة.
  const byDay = new Map();
  for (const slot of data.slots) {
    if (!byDay.has(slot.date)) byDay.set(slot.date, []);
    byDay.get(slot.date).push(slot);
  }
  for (const [date, slots] of byDay) {
    slotsEl.append(el('div', { class: 'booking-day' },
      el('h3', { text: `${slots[0].dayLabel} — ${date}` }),
      el('div', { class: 'slot-row' }, slots.map((s) => {
        const btn = el('button', { type: 'button', class: 'btn slot-btn', text: s.time });
        btn.addEventListener('click', () => pick(s, btn));
        return btn;
      }))));
  }
}

async function load() {
  try {
    const res = await fetch('/api/book', { headers: { accept: 'application/json' } });
    const data = await res.json();
    const office = data.office || {};
    if (office.name) {
      document.getElementById('office-name').textContent = `احجز موعدًا — ${office.name}`;
      document.title = `احجز موعدًا — ${office.name}`;
    }
    if (office.phone) {
      const a = document.createElement('a');
      a.href = `tel:${office.phone}`;
      a.dir = 'ltr';
      a.textContent = office.phone;
      document.getElementById('office-contact').append(a);
    }
    if (office.logo) {
      const logo = document.getElementById('logo');
      logo.src = `/api/media?id=${encodeURIComponent(office.logo)}`;
      logo.hidden = false;
    }
    draw(data);
  } catch (err) {
    statusEl.textContent = 'تعذر تحميل الأوقات حاليًا. حدّث الصفحة بعد قليل.';
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!chosen) { bookStatus.textContent = 'اختر وقتًا أولًا.'; return; }
  const data = Object.fromEntries(new FormData(form).entries());
  if (!String(data.phone || '').trim()) { bookStatus.textContent = 'اكتب رقم جوالك.'; return; }
  sendBtn.disabled = true;
  bookStatus.textContent = 'جارٍ التأكيد…';
  try {
    const res = await fetch('/api/book', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...data, at: chosen.iso, ref: new URLSearchParams(location.search).get('ref') || '' }),
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(out.error || 'تعذّر الحجز');
    form.hidden = true;
    chosenEl.textContent = '';
    statusEl.textContent = `تم الحجز: ${chosen.dayLabel} ${chosen.date} — ${chosen.time}. نتواصل معك لتأكيده.`;
    slotsEl.textContent = '';
  } catch (err) {
    bookStatus.textContent = err.message || 'تعذّر الحجز، حاول مرة أخرى.';
    // الوقت قد يكون حُجز في هذه اللحظة من جهاز آخر — نعيد تحميل الأوقات لا لنتركه يعيد المحاولة على وقتٍ ذهب.
    if (/لم يعد متاحًا/.test(err.message || '')) { chosen = null; form.hidden = true; await load(); }
  } finally {
    sendBtn.disabled = false;
  }
});

load();
