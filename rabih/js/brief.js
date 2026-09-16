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
  const best = [...topics].sort((a, b) => b.pos - a.pos)[0] || null;

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
        <span class="fine">${b.best && b.best.pos ? `${b.best.pos} ثناءً في العيّنة` : 'لا ثناء متكرّر'}</span>
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
