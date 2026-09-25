// الصفحة الأولى — ما يراه صاحب المحل في خمس ثوانٍ.
//
// التقرير كان يبدأ بالحديث عن نفسه: مقياس الثقة، ثم المحتويات، ثم «هل
// عيّنتك ممثِّلة؟» — ثلاثة أقسام عن منهجنا قبل كلمةٍ عن محلّه، والخلاصة في
// المرتبة الثالثة عشرة. وهذا ترتيب محلّلٍ لا ترتيب صاحب عمل.
//
// فهذه لوحةٌ واحدة تُجيب عن أسئلته الأربعة بالترتيب الذي يسألها به:
//   كيف حالي؟ · ما أسوأ ما عندي؟ · ما أفضل ما عندي؟ · ماذا أفعل غدًا؟
//
// وكلها أرقامٌ محسوبةٌ من بياناته، ومعها هوامشها. ولا جملة إنشاء.

import { stats } from './schema.js';
import { priorities } from './priority.js';
import { topicStats } from './lexicon.js';
import { recentVsOlder } from './recency.js';
import { impact } from './impact.js';
import { wilson } from './interval.js';
import { needed } from './stars.js';
import { monthly } from './recency.js';

const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const num = (n) => (Number.isFinite(Number(n)) ? Number(n).toLocaleString('ar-SA-u-nu-latn') : '—');

/** سهمٌ ودلالة: وما دون هامش الخطأ لا يُسمّى تغيّرًا. */
function trendOf(place) {
  const r = recentVsOlder(place);
  if (!r || r.verdict === 'غير كافٍ' || r.diff === null) {
    /* الشارةُ حكمٌ إحصائيّ والخطُّ بجوارها وصفٌ للمسار، فكانت تُقرأ نفيًا
       لما يرسمه. فتُسمّى بما هي: الاتجاه لم يُحسَم، والمسار مرسومٌ كما وقع. */
    return {
      label: 'الاتجاه لم يُحسَم',
      cls: 'flat',
      detail: r && r.note ? r.note : 'يلزم تعليقاتٌ مؤرَّخة أكثر في كل فترة.',
      hint: 'والخطُّ بجانبه يرسم ما وقع فعلًا، ولا يُحسَم منه صعودٌ ولا هبوط.',
    };
  }
  if (r.verdict === 'انحدار') return { label: `انحدار ${Math.abs(r.diff).toFixed(2)}`, cls: 'down', detail: `آخر 90 يومًا ${r.recent.avg} مقابل ${r.older.avg} قبلها.` };
  if (r.verdict === 'تحسّن') return { label: `تحسّن ${r.diff.toFixed(2)}`, cls: 'up', detail: `آخر 90 يومًا ${r.recent.avg} مقابل ${r.older.avg} قبلها.` };
  return { label: 'ثابت', cls: 'flat', detail: `آخر 90 يومًا ${r.recent.avg} مقابل ${r.older.avg} قبلها.` };
}

/**
 * @returns {{worst, best, action, money, trend, ci}|null}
 */
export function brief(place, job = {}) {
  const s = stats(place);
  if (!s.total) return null;

  const pop = place.ratings?.withText || s.googleCount || null;
  const worst = priorities(place, { limit: 1 })[0] || null;
  const topics = topicStats(place);
  /* «أكبر قوة» كانت تُرتَّب بعمود `pos`، وفيه ذكرٌ مجرَّد أُخذت قطبيّته من
     نجوم التعليق: «القهوة ممتازة وفيه مواقف» بخمس نجوم كانت تجعل المواقف
     قوّةً. فيُرتَّب بالثناء المنصوص وحده، ويُرجَع إلى العام إن لم يكن. */
  const stated = [...topics].filter((t) => t.posStated > 0).sort((a, b) => b.posStated - a.posStated);
  const best = stated[0] || [...topics].sort((a, b) => b.pos - a.pos)[0] || null;

  const ci = worst ? wilson(worst.count, s.total, pop) : null;

  /* **وضعُ «أنت بخير» — وكان غائبًا.**
     التقرير كلُّه مبنيٌّ على أن ثَمَّ عطبًا يُصلَح، فإن لم يجد رفع الضجيج إلى
     عنوان. قِيس على مقهًى بـ4.8 و520 تقييمًا: جعل شكوى مواقفَ **واحدة**، من
     رجلٍ أعطاه أربع نجوم، «أكبرَ شكوى» و«ابدأ بهذا» وأسند إليها 750 ريالًا.
     وصاحبُه يعرف أن المواقف ليست مشكلته، فيحكم أن التحليل سطحيّ ولا يعود.
     فما لم تبلغ الشكوى ثلاثًا، ولم يتجاوز نصيبُها هامشَها، فلا «أكبر شكوى». */
  const solid = Boolean(worst && worst.count >= 3 && ci && ci.low * 100 > 0 && worst.share > ci.margin);
  const tiny = s.total < 5;

  // الفعل الأول: أوّل توصيةٍ في الخطة إن وُجدت، وإلا فأولى الأولويات.
  const firstTask = (job.plan || []).find((t) => t.status !== 'done' && t.status !== 'dropped');
  const action = (() => {
    if (firstTask) return firstTask.text;
    if (tiny) return 'اجمع تعليقاتٍ أكثر قبل أي قرار — اطلب من عملائك الراضين أن يكتبوا، فعشرةُ تعليقاتٍ تُغيّر كلَّ رقمٍ في هذه الصفحة.';
    if (solid) return `عالج «${worst.name}» أولًا — ${worst.why}`;
    if (worst) {
      return `لا شكوى بارزة في عيّنتك — وأكثر ما وقع «${worst.name}» ${countWord(worst.count, 'مرةً واحدة', 'مرتين', 'مرات', 'مرة')}، `
        + 'وهو أقلُّ من أن يُبنى عليه إصلاح. فاحفظ ما ينجح، وزِد عدد من يكتب لك.';
    }
    return 'لا شكوى في عيّنتك. فاحفظ ما ينجح، وزِد عدد من يكتب لك — فالعدد يحمي متوسطك من تعليقٍ واحدٍ سيّئ.';
  })();

  const imp = impact(place, {
    ticket: job.assume?.ticket, monthly: job.assume?.monthly,
    lossRate: (Number(job.assume?.loss) || 25) / 100,
  });
  // ولا يُسنَد مبلغٌ إلى شكوى لا يحملها العدد.
  /* والمالُ في الخلاصة تبعٌ لقرار الإدراج نفسه: لا يُمنَع من قسمه ويُسرَّب
     في أول صفحةٍ يقرؤها المالك. */
  const showMoney = !!job.assume?.show;
  const money = showMoney && imp && imp.ticket && imp.monthly && worst && solid
    ? (imp.rows.find((r) => r.id === worst.id)?.riyals ?? null) : null;

  return {
    stats: s, worst, best, action, money, trend: trendOf(place), ci, pop,
    solid,
    tiny,
    // الإجمالي على الشاكين المتمايزين — وهو الرقم الذي يُقرأ به الباقي.
    totalRiyals: showMoney && imp && imp.ticket && imp.monthly && solid ? imp.totalRiyals : null,
    yearly: imp && imp.ticket && imp.monthly && solid ? imp.yearly : null,
  };
}

/**
 * خطُّ مسار التقييم — رسمٌ متّجهٌ صغير، بلا مكتبة.
 *
 * المسار كان مدفونًا في «القراءة الزمنية» بعد اثني عشر قسمًا، وهو أول ما
 * تسأل عنه العين: أصاعدٌ أنا أم هابط؟ فيتصدّر. والنقاط شهورٌ فيها تعليقات،
 * ومن لا تعليق له لا نقطة له — ولا يُوصَل الخطُّ عبر فراغٍ لا يُعلَم.
 */
function sparkline(place) {
  const months = monthly(place).filter((m) => m.avg !== null);
  if (months.length < 3) return '';
  const W = 100;
  const H = 28;
  /* **مقياسٌ ثابت لا يتمدّد على البيانات.**
     كان يُشَدّ بين أدنى قيمةٍ وأعلاها، فهبوطٌ من 4.4 إلى 4.3 يُرسَم كهبوطٍ
     من خمسٍ إلى واحد — وهزّةٌ لا تُذكَر تُقرأ انهيارًا. فالمدى نصفُ نجمةٍ
     حول القيم على الأقل، ويُكتَب حدّاه على الرسم فلا يُقرأ بلا سقف. */
  const min = Math.min(...months.map((m) => m.avg));
  const max = Math.max(...months.map((m) => m.avg));
  const pad = Math.max(0.25, (0.5 - (max - min)) / 2);
  const lo = Math.max(1, Math.floor((min - pad) * 10) / 10);
  const hi = Math.min(5, Math.ceil((max + pad) * 10) / 10);
  const x = (i) => W - (i / (months.length - 1)) * W;
  const y = (v) => H - ((v - lo) / (hi - lo || 1)) * H;
  const pts = months.map((m, i) => `${x(i).toFixed(1)},${y(m.avg).toFixed(1)}`).join(' ');
  const last = months[months.length - 1];
  return `<div class="spark">
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img"
      aria-label="مسار متوسط التعليقات من ${esc(months[0].label)} إلى ${esc(last.label)}">
      <polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="1.6"
        stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
      <circle cx="${x(months.length - 1).toFixed(1)}" cy="${y(last.avg).toFixed(1)}" r="2.2" fill="currentColor"/>
    </svg>
    <div class="spark-ends"><span>${esc(months[0].label)}</span>
      <span class="spark-scale">مدى المحور: ${lo} إلى ${hi}</span>
      <span>${esc(last.label)}</span></div>
  </div>`;
}

/** تمييزٌ عربيّ سليم: «شكوى» و«شكويان» و«3 شكاوى» و«12 شكوى». */
function countWord(n, one, two, few, many) {
  if (n === 1) return one;
  if (n === 2) return two;
  if (n >= 3 && n <= 10) return `${n} ${few}`;
  return `${n} ${many}`;
}

/** حلقةُ نصيب السلبي — الرقم وحده لا يُرى، والشكل يُرى. */
function negRing(s) {
  if (!s.rated) return '';
  const pct = Math.round((s.negative / s.rated) * 100);
  const R = 15.9155;                       // محيطها 100، فالنسبة طولٌ مباشر
  return `<div class="ring" role="img" aria-label="نصيب التعليقات السلبية ${pct} بالمئة">
    <svg viewBox="0 0 40 40">
      <circle cx="20" cy="20" r="${R}" fill="none" stroke="#eef1f5" stroke-width="5"/>
      <circle cx="20" cy="20" r="${R}" fill="none" stroke="#c0392b" stroke-width="5"
        stroke-dasharray="${pct} ${100 - pct}" stroke-dashoffset="25" stroke-linecap="butt"/>
    </svg>
    <div class="ring-val"><b>${pct}%</b><span>سلبي</span></div>
    <div class="ring-of">${s.negative} من ${s.rated}</div>
  </div>`;
}

/** لوحة الصفحة الأولى. */
export function briefBlock(place, job = {}) {
  const b = brief(place, job);
  if (!b) return '';
  const s = b.stats;
  const avg = s.googleAverage ?? s.sampleAverage;
  const target = avg ? Math.min(4.9, Math.round((avg + 0.4) * 10) / 10) : null;
  const toTarget = (avg && s.googleCount && target > avg) ? needed(avg, s.googleCount, target, 5) : null;

  /* التقرير كان يقول ما يخسره ولا يقول ما يكسبه. و«تخسر 48,600 سنويًّا»
     تُثقِل الصدر، و«الشكاوى إن زالت يرتفع متوسطك كذا» تُحرّك اليد.
     والحسابُ ظاهر: لو أن شاكي عيّنتك كتبوا خمسًا بدل ما كتبوا. */
  /* **الكسبُ يُقال في إطاره لا في إطارٍ يُوهِم.**
     كانت البطاقةُ تقول «+1.25 نجمة» محسوبةً على متوسط ثمانية تعليقات في
     العيّنة، وتُوضَع بجانب «4.2 من 5» وهو متوسطُه في قوقل على 240 تقييمًا.
     فيقرؤها المالك 5.45 — وهي مستحيلة. والصوابُ أن يُقال ما تفعله شكاوى
     عيّنته بمتوسطه الحقيقيّ إن عُرف: ثلاثةُ شاكين يكتبون خمسًا على 240
     تقييمًا يرفعونه خمسَ نقطةٍ من مئة. وهذا رقمٌ صغيرٌ صادق، وفيه خبرٌ أهمّ
     من الرقم الموهِم: أن الإصلاح يُقاس بمن سيأتي لا بمن شكا. */
  const gain = (() => {
    if (!s.rated || !s.negative || !avg) return null;
    const neg = place.reviews.filter((r) => r.rating >= 1 && r.rating <= 2);
    const lift = neg.reduce((a, r) => a + (5 - Number(r.rating)), 0);
    const n = s.negative;
    const who = n === 1 ? 'الشاكي الواحد في عيّنتك' : n === 2 ? 'الشاكيان في عيّنتك' : `${n} ${n <= 10 ? 'شاكين' : 'شاكيًا'} في عيّنتك`;
    const verb = n === 1 ? 'كتب' : n === 2 ? 'كتبا' : 'كتبوا';
    if (s.googleAverage && s.googleCount) {
      const to = Math.round((s.googleAverage + lift / s.googleCount) * 100) / 100;
      if (to - s.googleAverage < 0.005) return null;
      return {
        from: s.googleAverage, to, frame: 'google',
        how: `لو ${verb} ${who} خمسًا — على ${s.googleCount} تقييمًا في قوقل. صغيرٌ لأن متوسطك يصنعه من سيأتي، لا من شكا.`,
      };
    }
    const base = s.sampleAverage ?? avg;
    const to = Math.round((base + lift / s.rated) * 100) / 100;
    if (to - base < 0.05) return null;
    return { from: base, to, frame: 'sample', how: `متوسطُ عيّنتك نفسها لو ${verb} ${who} خمسًا — لا متوسطُك في قوقل.` };
  })();

  return `<section class="brief">
    <h2 class="no-count">في سطور</h2>

    <div class="brief-hero">
      <div class="hero-num">
        <span class="n">${avg ?? '—'}</span>
        <span class="of">من 5</span>
        <span class="trend ${b.trend.cls}">${esc(b.trend.label)}</span>
      </div>
      ${negRing(s)}
      ${sparkline(place)}
      <div class="hero-side">
        <div><b>${num(s.googleCount ?? '—')}</b> تقييمًا على قوقل</div>
        <div><b>${num(s.total)}</b> تعليقًا حُلِّل${s.declaredWithText ? ` من ${num(s.declaredWithText)} منصوصًا` : ''}</div>
        <div class="fine">${esc(b.trend.detail)}${b.trend.hint ? ` ${esc(b.trend.hint)}` : ''}</div>
      </div>
    </div>

    ${b.tiny ? `<div class="msg-tie"><b>عيّنتك ${num(s.total)} تعليقات — أصغرُ من أن يُبنى عليها حكم.</b>
      كلُّ رقمٍ في هذه الصفحة يتغيّر بتعليقٍ واحدٍ جديد. فاقرأها استئناسًا لا قرارًا،
      واجمع تعليقاتٍ أكثر ثم أعِد القراءة.</div>` : ''}

    <div class="brief-cards">
      <div class="bcard ${b.solid ? 'bad' : 'flat'}">
        <b>${b.solid ? 'أكبر شكوى' : 'أكثر ما وقع'}</b>
        <span class="big">${b.solid ? esc(b.worst.name) : (b.worst ? esc(b.worst.name) : 'لا شكوى')}</span>
        <span class="fine">${(() => {
          if (!b.worst) return 'لا شكوى في عيّنتك';
          const n = `${countWord(b.worst.count, 'شكوى واحدة', 'شكويان', 'شكاوى', 'شكوى')}`;
          if (b.solid) return `${n}${b.ci ? ` — ${b.ci.p}% من العيّنة (±${b.ci.margin} نقطة)` : ''}`;
          return `${n} فقط — ولا تكفي لحكم${b.ci ? ` (الهامش ±${b.ci.margin} يبتلع الفرق)` : ''}`;
        })()}</span>
      </div>
      <div class="bcard good">
        <b>أكبر قوة</b>
        <span class="big">${b.best && b.best.pos ? esc(b.best.name) : '—'}</span>
        <span class="fine">${b.best && b.best.pos
          ? `${b.best.posStated || b.best.pos} ثناءً في العيّنة${b.best.posStated ? '' : ' (مستنبَطًا من النجوم)'}`
          : 'لا ثناء متكرّر'}</span>
      </div>
      ${b.totalRiyals ? `<div class="bcard money">
        <b>على فرضك — ما تخسره اليوم</b>
        <span class="big">${num(b.totalRiyals)} ريال/شهر</span>
        <span class="fine">${num(b.yearly)} ريال في السنة · على الشاكين في عيّنتك، لا بجمع المواضيع</span>
      </div>` : ''}
      ${gain ? `<div class="bcard gain">
        <b>${gain.frame === 'google' ? 'وأثرُ هؤلاء على متوسطك' : 'وما تكسبه في عيّنتك'}</b>
        <span class="big">من ${gain.from} إلى ${gain.to}</span>
        <span class="fine">${esc(gain.how)}</span>
      </div>` : ''}
      ${toTarget ? `<div class="bcard goal">
        <b>لبلوغ ${target}</b>
        <span class="big">${num(toTarget)}</span>
        <span class="fine">تقييمًا بخمس نجوم</span>
      </div>` : ''}
    </div>

    ${b.action ? `<div class="brief-action${b.solid ? ' urgent' : ''}">
      <b>ابدأ بهذا</b>
      <p>${esc(b.action)}</p>
      ${!b.solid && !b.tiny ? '<p class="fine">وليس هذا مجاملة: العدد لا يحمل ترتيبًا، وقولُ غير ذلك اختلاقُ عطبٍ ليس عندك.</p>' : ''}
    </div>` : ''}

    <p class="brief-note"><b>وكلُّ رقمٍ هنا تستطيع مراجعته بنفسك</b>: بجانب كل حكمٍ في هذا التقرير
    معرّفُ التعليق الذي بُني عليه (R001، R002…)، ونصُّه منقولٌ بحروفه — فارجع إليه في قوقل وتحقّق.
    والأرقام محسوبةٌ من تعليقات عملائك، لا من تقديرٍ ولا مقارنةٍ بسواك.</p>
  </section>`;
}
