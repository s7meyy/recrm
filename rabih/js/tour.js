// جولة أولى — الشاشات صارت ثمانيًا، والقادم عليها يتيه.
// خطوات قصيرة تشير إلى عنصر حقيقي في الصفحة، وتُعرَض مرة واحدة ثم تُطلَب عند الحاجة.

const SEEN = 'rabih:tour-done';

export const STEPS = [
  { view: 'new', sel: '#f-url', title: 'ابدأ من الرابط',
    body: 'ألصق رابط المنشأة من خرائط قوقل. يُقبل الرابط الكامل والمختصر.' },
  { view: 'new', sel: '#f-city', title: 'المدينة والتصنيف والحي',
    body: 'هذه الثلاثة تبني شجرة الأرشيف وتوجّه محاور التحليل. والحي يُضاف يدويًّا إن لم تجده.' },
  { view: 'new', sel: '#f-brand', title: 'العلامة — لتقرير المجموعة',
    body: 'اكتب الاسم نفسه في فروع المالك الواحد، فتُجمَع في تقرير مجموعة يفرز مشكلة النظام من مشكلة الفرع.' },
  { view: 'data', sel: '#d-reviews', title: 'ألصق التعليقات',
    body: 'انسخ من صفحة قوقل كما هي؛ المحلّل يتعرّف على النجوم والتواريخ وردود المالك ويتجاهل الزائد.' },
  { view: 'data', sel: '#recency-box', title: 'القراءة الزمنية',
    body: 'متوسطٌ عام قد يخفي انحدارًا حديثًا. هنا ترى آخر تسعين يومًا مقابل ما قبلها.' },
  { view: 'data', sel: '#anomaly-box', title: 'فحص سلامة العيّنة',
    body: 'إشارات على تعليقات قد تكون مفتعلة. لا يُحذف شيء إلا بأمرك.' },
  { view: 'pipeline', sel: '.step', title: 'ثماني خطوات',
    body: 'انسخ الرسالة، ألصقها في النموذج، أعِد إجابته هنا. ومدقّق السند يفحصها قبل أن تمضي.' },
  { view: 'report', sel: '#completeness-box', title: 'مدقّق الاكتمال',
    body: 'يكشف ما أهمله التقرير من المرصود، ويبني رسالة تطلب من النموذج سدّ النقص.' },
  { view: 'report', sel: '#plan-box', title: 'خطة العمل',
    body: 'التوصيات تصير مهامًّ لها حالة ومهلة، ويُقاس تنفيذها في التقرير القادم.' },
  { view: 'archive', sel: '#safety-card', title: 'احمِ أرشيفك',
    body: 'كل شيء في متصفحك. اضغط «تثبيت التخزين» مرة، وخذ نسخة احتياطية دوريًّا.' },
];

export const isDone = () => { try { return localStorage.getItem(SEEN) === '1'; } catch { return true; } };
export const markDone = () => { try { localStorage.setItem(SEEN, '1'); } catch { /* تجاهل */ } };
export const reset = () => { try { localStorage.removeItem(SEEN); } catch { /* تجاهل */ } };

/**
 * يشغّل الجولة.
 * @param {(view:string)=>void} goTo دالة التنقّل بين الشاشات
 */
export function start(goTo) {
  let i = 0;
  const layer = document.createElement('div');
  layer.id = 'tour';
  layer.innerHTML = '<div class="tour-spot"></div><div class="tour-card"></div>';
  document.body.appendChild(layer);

  const spot = layer.querySelector('.tour-spot');
  const card = layer.querySelector('.tour-card');

  const close = () => { markDone(); layer.remove(); };

  const render = () => {
    const step = STEPS[i];
    if (!step) { close(); return; }
    goTo(step.view);

    setTimeout(() => {
      const el = document.querySelector(step.sel);
      if (el) {
        el.scrollIntoView({ block: 'center', behavior: 'instant' });
        const r = el.getBoundingClientRect();
        spot.style.cssText = `top:${r.top - 6}px;right:${window.innerWidth - r.right - 6}px;width:${r.width + 12}px;height:${r.height + 12}px;opacity:1`;
      } else {
        spot.style.opacity = '0';
      }

      card.innerHTML = `
        <div class="tour-step">${i + 1} من ${STEPS.length}</div>
        <h3>${step.title}</h3>
        <p>${step.body}</p>
        <div class="tour-actions">
          <button type="button" class="btn ghost sm" data-act="skip">تخطّي</button>
          <span style="flex:1"></span>
          ${i > 0 ? '<button type="button" class="btn ghost sm" data-act="prev">السابق</button>' : ''}
          <button type="button" class="btn sm" data-act="next">${i === STEPS.length - 1 ? 'إنهاء' : 'التالي'}</button>
        </div>`;

      card.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => {
        const a = b.dataset.act;
        if (a === 'skip') close();
        else if (a === 'prev') { i -= 1; render(); }
        else { i += 1; render(); }
      }));
    }, 180);
  };

  render();
  return { close };
}
