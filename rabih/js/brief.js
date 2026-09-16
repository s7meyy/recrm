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
  if (!r || r.verdict === 'غير كافٍ' || r.diff === null) return { label: 'لا يُقاس بعد', cls: 'flat', detail: 'يلزم تقريران أو تعليقات مؤرَّخة أكثر.' };
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

  // الفعل الأول: أوّل توصيةٍ في الخطة إن وُجدت، وإلا فأولى الأولويات.
  const firstTask = (job.plan || []).find((t) => t.status !== 'done' && t.status !== 'dropped');
  const action = firstTask ? firstTask.text : (worst ? `عالج «${worst.name}» أولًا — ${worst.why}` : '');

  const imp = impact(place, {
    ticket: job.assume?.ticket, monthly: job.assume?.monthly,
    lossRate: (Number(job.assume?.loss) || 25) / 100,
  });
  const money = imp && imp.ticket && imp.monthly && worst
    ? (imp.rows.find((r) => r.id === worst.id)?.riyals ?? null) : null;

  return { stats: s, worst, best, action, money, trend: trendOf(place), ci, pop };
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
  const lo = Math.min(...months.map((m) => m.avg), 5);
  const hi = Math.max(...months.map((m) => m.avg), lo + 0.5);
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
    <div class="spark-ends"><span>${esc(months[0].label)}</span><span>${esc(last.label)}</span></div>
  </div>`;
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
        <div class="fine">${esc(b.trend.detail)}</div>
      </div>
    </div>

    <div class="brief-cards">
      <div class="bcard bad">
        <b>أكبر شكوى</b>
        <span class="big">${b.worst ? esc(b.worst.name) : '—'}</span>
        <span class="fine">${b.worst ? `${b.worst.count} شكوى${b.ci ? ` — ${b.ci.p}% من العيّنة (±${b.ci.margin} نقطة)` : ''}` : 'لا شكوى بارزة'}</span>
      </div>
      <div class="bcard good">
        <b>أكبر قوة</b>
        <span class="big">${b.best && b.best.pos ? esc(b.best.name) : '—'}</span>
        <span class="fine">${b.best && b.best.pos
          ? `${b.best.posStated || b.best.pos} ثناءً في العيّنة${b.best.posStated ? '' : ' (مستنبَطًا من النجوم)'}`
          : 'لا ثناء متكرّر'}</span>
      </div>
      ${b.money ? `<div class="bcard money">
        <b>على فرضك</b>
        <span class="big">${num(b.money)} ريال</span>
        <span class="fine">شهريًّا — كلفة أكبر شكوى</span>
      </div>` : ''}
      ${toTarget ? `<div class="bcard goal">
        <b>لبلوغ ${target}</b>
        <span class="big">${num(toTarget)}</span>
        <span class="fine">تقييمًا بخمس نجوم</span>
      </div>` : ''}
    </div>

    ${b.action ? `<div class="brief-action">
      <b>ابدأ بهذا</b>
      <p>${esc(b.action)}</p>
    </div>` : ''}

    <p class="brief-note">الأرقام أعلاه محسوبةٌ من تعليقات عملائك، لا من تقديرٍ ولا مقارنةٍ بسواك.
    وما وراء هذه الصفحة تفصيلُها ودليلُها.</p>
  </section>`;
}
