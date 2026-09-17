// قوالب رسائل التسليم — نصٌّ يتغيّر بحسب حال التقرير، فتقريرٌ سيّئ لا يُسلَّم بنبرة تقريرٍ جيّد.

import { stats } from './schema.js';
import { topComplaints } from './lexicon.js';
import { recentVsOlder } from './recency.js';
import { progress } from './plan.js';
import { brief } from './brief.js';

/** يصنّف حال المنشأة ليُختار القالب المناسب. */
export function situation(job) {
  const s = stats(job.place);
  const r = recentVsOlder(job.place);
  const avg = s.googleAverage ?? s.sampleAverage;

  if (r.verdict === 'انحدار') return 'declining';
  if (avg !== null && avg < 3.5) return 'weak';
  if (avg !== null && avg >= 4.5 && s.negative <= 1) return 'strong';
  return 'mixed';
}

const LABELS = {
  strong:    'وضع قوي',
  mixed:     'وضع متوسط',
  weak:      'وضع ضعيف',
  declining: 'انحدار حديث',
};

/**
 * يبني نص رسالة التسليم.
 * @param {object} job
 * @param {'whatsapp'|'email'|'short'} channel
 */
export function build(job, channel = 'whatsapp', link = '') {
  const s = stats(job.place);
  const r = recentVsOlder(job.place);
  const p = progress(job.plan || []);
  const name = job.place?.identity?.name || 'المنشأة';
  const avg = s.googleAverage ?? s.sampleAverage;
  const worst = topComplaints(job.place, 3);
  const sit = situation(job);

  const head = {
    strong:    `تقرير ${name} جاهز، والنتيجة مطمئنة.`,
    mixed:     `تقرير ${name} جاهز، وفيه ما يُبنى عليه وما يُعالَج.`,
    weak:      `تقرير ${name} جاهز، وفيه ملاحظات تستحق الوقوف عندها.`,
    declining: `تقرير ${name} جاهز، وفيه إشارة مهمة تخصّ الأشهر الأخيرة.`,
  }[sit];

  /* الرسالة أوّلُ ما يقرؤه، وكانت تصف ولا تُغري: «التقييم 4.2 · المحلَّلة 2
     · أبرز ما تكرر: الانتظار». بلا مبلغٍ، وبلا فعلٍ واحدٍ يبدأ به، وبلا ما
     يميّز هذا التقرير عن غيره. والإغراءُ هنا ليس مبالغة: هي أرقامُه هو. */
  const b = brief(job.place, job);
  const body = [];
  body.push(`التقييم: ${avg ?? '—'} من 5${s.googleCount ? ` (${s.googleCount} تقييمًا)` : ''}`);
  body.push(`التعليقات المُحلَّلة: ${s.total}`);
  if (b?.totalRiyals) {
    body.push(`تقدير ما تكلّفك الشكاوى: ${b.totalRiyals.toLocaleString('ar-SA-u-nu-latn')} ريال شهريًّا — على فرضك أنت.`);
  }

  if (sit === 'declining' && r.diff !== null) {
    body.push(`متوسط آخر ${r.window} يومًا ${r.recent.avg} مقابل ${r.older.avg} قبلها — وهذا ما يستدعي النظر أولًا.`);
  }
  if (worst.length && channel !== 'short') {
    body.push(`أبرز ما تكرر: ${worst.map((t) => `${t.name} (${t.neg})`).join('، ')}`);
  }
  if (p.total) body.push(`خطة العمل: ${p.total} مهمة${p.done ? `، منجز منها ${p.done}` : ''}.`);

  const tail = {
    strong:    'التقرير يفصّل ما يُحافَظ عليه وما يُعزَّز.',
    mixed:     'التقرير يفصّل نقاط القوة والضعف مع توصيات مرتبطة بتعليقات بعينها.',
    weak:      'التقرير يرتّب الشكاوى بحسب تكرارها ويقترح معالجة لكل واحدة.',
    declining: 'التقرير يبيّن متى بدأ التغيّر وفي أي جانب تحديدًا.',
  }[sit];

  /* سطرُ التسليم يتبع وسيلته: كانت الرسالة تقول «مرفق بصيغة PDF» ولو
     سُلِّم برابط، فيبحث المستقبِل عن مرفقٍ لا وجود له. */
  const deliver = link
    ? `التقرير على هذا الرابط: ${link}\nيُفتَح في المتصفّح بلا تنزيل، ويصلح للطباعة وحفظه PDF.`
    : 'التقرير الكامل مرفق بصيغة PDF.';

  /* وفعلٌ واحدٌ يبدأ به: التقرير كلُّه يُطوى، والسطرُ الذي فيه فعلٌ يُنفَّذ. */
  const first = b?.action ? `ابدأ بهذا: ${b.action}` : '';
  // وما يميّزه: أن كل رقمٍ فيه مسنودٌ إلى تعليقٍ بعينه يُراجَع.
  const proof = 'وكلُّ رقمٍ في التقرير بجانبه معرّفُ التعليق الذي بُني عليه، فتراجعه بنفسك في قوقل.';

  if (channel === 'short') {
    return [head, body[0], first, deliver].filter(Boolean).join('\n');
  }

  const lines = [head, '', ...body.map((x) => `• ${x}`), '',
    ...(first ? [first, ''] : []), tail, '', proof, '', deliver];
  if (channel === 'email') {
    lines.push('', 'وفي خدمتك لأي استفسار أو توضيح.');
  }
  return lines.join('\n');
}

export function subject(job) {
  const name = job.place?.identity?.name || 'منشأة';
  return `تقرير تحليلي — ${name}`;
}

export const situationLabel = (job) => LABELS[situation(job)];
