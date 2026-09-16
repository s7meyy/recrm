// من التشخيص إلى الفعل.
//
// التقرير يقول «الانتظار أكبر شكواك» ويُسلِّم. وصاحب المحل يسأل ثلاثة
// أسئلة لا يجد جوابها: بكم؟ وفي كم؟ وماذا أكسب؟ فيطوي التقرير.
//
// وهذه أجوبةٌ من نوعين لا يُخلَط بينهما:
//
//   • **ما يُحسب من بياناته**: الكسب المتوقَّع — من فرضِه هو (متوسط
//     الفاتورة، وعدد عملائه، ونسبة من لا يعود) مضروبًا في نصيب الشكوى
//     من عيّنته. هذا حسابٌ ظاهرٌ لا تقدير.
//
//   • **ما هو قاعدةٌ عامة**: كلفةُ الإصلاح ومدّته. وهذه لا تُستخرَج من
//     تعليقاتٍ بحال — لا التعليق يذكر راتب موظف، ولا العيّنة تعرف سوق
//     مدينته. فتُعرَض بابها: مرتبةَ كلفةٍ لا مبلغًا، ومدًى لا يومًا بعينه،
//     موسومةً بأنها عُرفُ القطاع لا قياسُ محلّه.
//
// وخلطُ النوعين هو الكذب: أن يُقال «كلفة الإصلاح 8,400 ريال» برقمٍ حاسمٍ
// مخترَع بجوار رقمٍ محسوب، فيُصدَّق الاثنان معًا.

import { priorities } from './priority.js';
import { impact } from './impact.js';
import { stats } from './schema.js';
import { topicStats, topicIcon, topicColor } from './lexicon.js';
import { analyze as analyzeReplies } from './replies.js';
import { significant } from './interval.js';

const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const num = (n) => (Number.isFinite(Number(n)) ? Number(n).toLocaleString('ar-SA-u-nu-latn') : '—');

/* مراتب الكلفة — لا مبالغ. ومصدرها عُرفُ القطاع لا بيانات المنشأة،
   وهذا مُعلَنٌ في كل موضعٍ تُعرَض فيه. */
const COST = {
  none:  { label: 'بلا كلفة',        hint: 'قرارٌ أو ترتيبٌ داخلي' },
  low:   { label: 'كلفة يسيرة',      hint: 'ضمن المصروف التشغيلي المعتاد' },
  mid:   { label: 'كلفة متوسطة',     hint: 'تدريبٌ أو توظيفٌ أو شراءٌ محدود' },
  high:  { label: 'كلفة مرتفعة',     hint: 'تغييرٌ في المكان أو المعدّات' },
};

/* لكل موضوعٍ بابُ إصلاحه: من يملكه، وأسرعُ فعلٍ فيه، ومرتبة كلفته ومدّته.
   وهذه أدلّةٌ تُعين على البدء، لا وصفةٌ تُغني عن نظر صاحب المحل في محلّه. */
const PLAYBOOK = {
  wait: {
    owner: 'مدير الوردية',
    first: 'قِس زمن التحضير في ساعة الذروة ثلاثة أيام، واكتب متوسطه.',
    then: 'أضف يدًا في الذروة وحدها، أو افصل طابور الطلبات الجاهزة عن طابور التحضير.',
    cost: 'mid', days: [7, 21],
    metric: 'متوسط زمن التسليم في الذروة',
  },
  service: {
    owner: 'المالك أو مدير الفرع',
    first: 'اجلس مع الفريق واقرأ عليهم التعليقات بنصّها — بلا تسمية أحد.',
    then: 'اكتب ثلاث جملٍ للاستقبال والاعتذار والوداع، ودرِّب عليها في نصف ساعة أسبوعيًّا.',
    cost: 'low', days: [3, 14],
    metric: 'عدد شكاوى التعامل شهريًّا',
  },
  quality: {
    owner: 'الشيف أو المسؤول عن التحضير',
    first: 'تذوَّق الصنف المشكوّ منه بنفسك في وقتين مختلفين من اليوم.',
    then: 'ثبِّت المقادير مكتوبةً، واربط التحضير بها لا بالتقدير.',
    cost: 'low', days: [3, 14],
    metric: 'شكاوى الطعم على الصنف بعينه',
  },
  clean: {
    owner: 'مسؤول الصالة',
    first: 'جولةُ تفقُّدٍ بعينك الآن لدورات المياه والطاولات.',
    then: 'قائمةٌ موقَّعة كل ساعتين، معلَّقة حيث يراها الفريق.',
    cost: 'low', days: [1, 7],
    metric: 'شكاوى النظافة شهريًّا',
  },
  price: {
    owner: 'المالك',
    first: 'قارن أسعارك بأقرب ثلاثة منافسين — بنفسك لا بالظنّ.',
    then: 'إن كان السعر في السوق فالمشكلة في القيمة المُدرَكة لا في الرقم: حسِّن التقديم والكمّية قبل أن تُنقص السعر.',
    cost: 'none', days: [7, 30],
    metric: 'شكاوى السعر ونصيبها من التعليقات',
  },
  crowd: {
    owner: 'مدير الفرع',
    first: 'سجِّل ساعات الامتلاء أسبوعًا.',
    then: 'وزِّع الطلب: حجزٌ أو عرضٌ في الساعات الخالية.',
    cost: 'low', days: [7, 30],
    metric: 'شكاوى الازدحام في ساعات الذروة',
  },
  parking: {
    owner: 'المالك',
    first: 'اعرف كم موقفًا يخصّك فعلًا، ومتى تمتلئ.',
    then: 'اتفاقٌ مع جارٍ، أو دلالةٌ واضحة على أقرب موقف في الخرائط وعند الباب.',
    cost: 'mid', days: [14, 60],
    metric: 'شكاوى المواقف شهريًّا',
  },
  delivery: {
    owner: 'مسؤول الطلبات الخارجية',
    first: 'اطلب من محلّك عبر التطبيق مرّتين، واستلم كما يستلم العميل.',
    then: 'راجع التغليف وعزل الحارّ عن البارد، وثبِّت مراجعة الطلب قبل تسليمه.',
    cost: 'low', days: [3, 14],
    metric: 'شكاوى الطلب الناقص أو البارد',
  },
  place: {
    owner: 'المالك',
    first: 'اجلس في أسوأ طاولةٍ عندك ساعةً كاملة.',
    then: 'عالج ما أزعجك: الإضاءة، والصوت، وتباعد الطاولات.',
    cost: 'high', days: [30, 90],
    metric: 'شكاوى الأجواء والجلسات',
  },
  wifi: {
    owner: 'المالك',
    first: 'اختبر سرعة الشبكة في أبعد ركنٍ عن الراوتر وقت الذروة.',
    then: 'ارفع الباقة أو أضف موزّعًا، وأعلن كلمة الشبكة حيث تُرى.',
    cost: 'low', days: [3, 14],
    metric: 'شكاوى الإنترنت والمقابس',
  },
  money: {
    owner: 'المحاسب أو الكاشير',
    first: 'راجع أن كل عملية تُسلَّم بفاتورة، وأن الشبكة تعمل.',
    then: 'درِّب الكاشير على الفاتورة والباقي والضريبة، ولا تتركها للاجتهاد.',
    cost: 'none', days: [1, 7],
    metric: 'شكاوى الفوترة والدفع',
  },
  kids: {
    owner: 'مدير الفرع',
    first: 'اعرف كم كرسيَّ أطفالٍ عندك، وهل قسم العائلات يكفي في الذروة.',
    then: 'أضف ما ينقص، وأعلن ما عندك في صفحة الخرائط.',
    cost: 'mid', days: [14, 45],
    metric: 'شكاوى العائلات والأطفال',
  },
  access: {
    owner: 'المالك',
    first: 'افتح موقعك في الخرائط واتبع الطريق كأنك زائرٌ أول مرة.',
    then: 'صحِّح الدبّوس، وأضف صورةَ مدخل، ولوحةً تُرى من الشارع.',
    cost: 'low', days: [1, 14],
    metric: 'شكاوى صعوبة الوصول',
  },
  hygiene_staff: {
    owner: 'المالك',
    first: 'قارن مواعيدك المعلنة في الخرائط بواقع الفتح والإغلاق أسبوعًا.',
    then: 'صحِّح المعلن، أو التزم به. والمخالفة بينهما أشدُّ من التأخّر نفسه.',
    cost: 'none', days: [1, 7],
    metric: 'شكاوى المواعيد والالتزام',
  },
};

const FALLBACK = {
  owner: 'المالك',
  first: 'اقرأ التعليقات المسنودة إلى هذا الموضوع بمعرّفاتها، واستخرج منها الفعل.',
  then: 'حدِّد مسؤولًا ومهلةً ومؤشّرًا يُقاس.',
  cost: 'low', days: [7, 30],
  metric: 'عدد الشكاوى في هذا الموضوع',
};

/**
 * خطوات العمل مرتَّبةً بأولويتها، ولكل خطوةٍ كسبُها المحسوب وكلفتها المُقدَّرة.
 * @returns {{rows:Array, hasMoney:boolean, assume:object}}
 */
export function actions(place, job = {}) {
  const all = priorities(place, { limit: 10 });
  if (!all.length) return { rows: [], singles: [], hasMoney: false, assume: {} };

  /* **ما ذُكر مرةً أو مرتين لا يُرتَّب.**
     كان الجدول يصفّ ستّ أولويات، أربعٌ منها «شكوى واحدة (10% ±19)» —
     والهامشُ يبتلع الفرق بينها جميعًا. فصفُّها «3، 4، 5، 6» بشريطِ وزنٍ
     يُوهِم ترتيبًا لا تحمله العيّنة، ويصرف صاحب المحل إلى الثالثة قبل
     الخامسة بلا سبب. فتُفرَد بلا ترقيم، وتُذكَر لأنها وقعت. */
  const ordered = all.filter((r) => r.count >= 3);
  const singles = all.filter((r) => r.count < 3);
  /* وإن لم يبلغ شيءٌ ثلاثًا فالخطة لا تسقط — يسقط **ترتيبُها** وحده:
     تُعرَض البطاقات بلا أرقام، ويُقال إن عيّنتك لا ترتّبها. وحذفُ الخطة
     لصغر العيّنة يترك صاحب المحل بلا شيء، وهو أسوأ من ترتيبٍ متحفّظ. */
  const rows = ordered.length ? ordered : all.slice(0, 6);
  const rankable = ordered.length > 0;

  const assume = {
    ticket: job.assume?.ticket, monthly: job.assume?.monthly,
    lossRate: (Number(job.assume?.loss) || 25) / 100,
  };
  const imp = impact(place, assume);
  const hasMoney = Boolean(imp && imp.ticket && imp.monthly);
  const byId = new Map((imp?.rows || []).map((r) => [r.id, r]));

  const shape = (r, i) => {
    const pb = PLAYBOOK[r.id] || FALLBACK;
    const money = hasMoney ? (byId.get(r.id)?.riyals ?? 0) : null;
    return {
      rank: i === null ? null : i + 1,
      id: r.id,
      name: r.name,
      why: r.why,
      ids: r.ids,
      count: r.count,
      ci: r.ci || null,
      owner: pb.owner,
      first: pb.first,
      then: pb.then,
      metric: pb.metric,
      cost: COST[pb.cost],
      days: pb.days,
      // الكسب: نصيبُ هذه الشكوى من الخسارة المُقدَّرة على فرض المالك.
      money,
      yearly: money === null ? null : money * 12,
    };
  };

  /* وهل تفصل العيّنةُ بين الأولى والثانية أصلًا؟ إن لم تفصل قيل ذلك،
     ولم يُترك الترقيمُ وحده يُفهِم ترتيبًا لا يسنده عدد. */
  const ranked = rows.map((r, i) => shape(r, rankable ? i : null));
  const tie = (ranked.length >= 2 && rows[0].ci && rows[1].ci)
    ? !significant(rows[0].ci, rows[1].ci).decided : false;

  return {
    hasMoney,
    tie,
    rankable,
    assume: { ticket: imp?.ticket || 0, monthly: imp?.monthly || 0, lossRate: imp?.lossRate ?? 0.25 },
    rows: ranked,
    singles: rankable ? singles.map((r) => shape(r, null)) : [],
  };
}

/** كتلة التقرير: ماذا أفعل، ومن يفعله، وبكم، وماذا أكسب. */
export function actionsBlock(place, job = {}) {
  const a = actions(place, job);
  if (!a.rows.length) return '';

  const cards = a.rows.map((r) => `<div class="act" style="--tc:${topicColor(r.id)}">
    <div class="act-head">
      <span class="act-rank${r.rank === null ? ' none' : ''}">${r.rank === null ? '•' : r.rank}</span>
      <div>
        <b>${esc(r.name)}</b>
        <div class="fine">${esc(r.why)}</div>
      </div>
    </div>
    <div class="act-grid">
      <div><b>من ينفّذه</b><span>${esc(r.owner)}</span></div>
      <div><b>المدة المتوقّعة</b><span>${r.days[0]}–${r.days[1]} يومًا</span></div>
      <div><b>مرتبة الكلفة</b><span>${esc(r.cost.label)}</span><small>${esc(r.cost.hint)}</small></div>
      <div><b>ما تكسبه إن عولجت</b><span>${r.money === null ? '—' : `${num(r.money)} ريال/شهر`}</span><small>${
        r.money === null ? 'أدخِل متوسط فاتورتك وعدد عملائك ليُحسب' : `${num(r.yearly)} ريال في السنة، على فرضك`}</small></div>
    </div>
    <ol class="act-steps">
      <li><b>ابدأ اليوم:</b> ${esc(r.first)}</li>
      <li><b>ثم:</b> ${esc(r.then)}</li>
      <li><b>تُقاس بـ:</b> ${esc(r.metric)}</li>
    </ol>
    <div class="act-ids">الشواهد: ${r.ids.slice(0, 8).map((x) => `<span class="rid">${esc(x)}</span>`).join(' ')}</div>
  </div>`).join('');

  const caveat = !a.rankable
    ? `<div class="msg-tie"><b>هذه الخطة غير مرتّبة — وعيّنتك لا ترتّبها.</b>
        لم يبلغ موضوعٌ ثلاث شكاوى، والفرق بين واحدةٍ واثنتين لا يُبنى عليه ترتيب.
        فابدأ بأيسرها عليك أو بأقربها إلى ما تعرفه من محلّك، ولا تقرأ تسلسلها حكمًا.</div>`
    : (a.tie
      ? `<div class="msg-tie"><b>الأولى والثانية متقاربتان بقدر لا تفصله عيّنتك</b>
          (${esc(a.rows[0].name)} · ${esc(a.rows[1].name)}). فابدأ بأيسرهما عليك، أو بهما معًا.</div>`
      : '');

  const singles = a.singles.length
    ? `<div class="singles">
        <b>وشكاوى مفردة — ذُكرت مرةً أو مرتين، فلا تُرتَّب ولا تُهمَل:</b>
        <ul>${a.singles.map((r) => `<li>${esc(r.name)} <span class="fine">(${r.count})</span>
          — ${esc(r.first)} ${r.ids.slice(0, 4).map((x) => `<span class="rid">${esc(x)}</span>`).join(' ')}</li>`).join('')}</ul>
        <p class="fine">واحدةٌ منها قد تكون حادثةً عابرة، وقد تكون أولَ ظهورٍ لعطبٍ يتكرّر. فاقرأها بنصّها بمعرّفاتها.</p>
      </div>`
    : '';

  return `<section class="actions">
    <h2>خطة العمل — من يفعل ماذا</h2>
    <p class="note">${a.rankable ? 'مرتَّبةٌ بأولويةٍ محسوبةٍ من تعليقاتك. و' : ''}<b>ما تكسبه</b> محسوبٌ من أرقامك أنت
    (متوسط الفاتورة × عدد عملائك × نصيب الشكوى من عيّنتك × نسبة من لا يعود) — فإن غيّرتَ فرضك تغيّر.</p>
    ${caveat}
    <div class="acts">${cards}</div>
    ${singles}
    <p class="fine"><b>المدة ومرتبة الكلفة عُرفُ القطاع لا قياسُ محلّك</b>: التعليق لا يذكر أجور فريقك
    ولا أسعار مدينتك، فلا يُستخرَج منه مبلغ. وهي أدلّةٌ للبدء تُصحَّح بمعرفتك بمحلّك.</p>
  </section>`;
}

/** قائمةٌ تُطبَع وتُعلَّق: فعلٌ واحد في السطر، بمربّعٍ يُؤشَّر عليه. */
export function checklistBlock(place, job = {}) {
  const a = actions(place, job);
  if (!a.rows.length) return '';
  const s = stats(place);

  const items = a.rows.map((r) => `<li>
    <span class="box"></span>
    <span class="task"><b>${esc(r.name)}</b> — ${esc(r.first)}</span>
    <span class="who">${esc(r.owner)}</span>
    <span class="when">____ / ____</span>
  </li>`).join('');

  return `<section class="checklist">
    <h2 class="no-count">قائمةُ المتابعة — تُطبَع وتُعلَّق</h2>
    <p class="fine">أول فعلٍ في كل أولوية. أشِّر على ما أنجزتَه، واكتب تاريخه.</p>
    ${a.rows.length ? `<div class="week"><b>أسبوعك الأول — لا تبدأ بالستّ معًا:</b>
      <ol>${a.rows.slice(0, 3).map((r, i) => `<li><span class="wd">${['اليوم', 'هذا الأسبوع', 'الأسبوع القادم'][i]}</span>
        ${esc(r.name)} — ${esc(r.first)}</li>`).join('')}</ol>
      <p class="fine">وما بعدها في الشهر الذي يليه. ومهمّةٌ تُنجَز خيرٌ من ستٍّ تُفتَح.</p></div>` : ''}
    <ul class="checks">${items}</ul>
    <div class="check-foot">
      <div><b>متوسطك اليوم</b><span>${s.googleAverage ?? s.sampleAverage ?? '—'}</span></div>
      <div><b>تاريخ التقرير</b><span>${new Date().toLocaleDateString('ar-SA-u-ca-gregory-nu-latn')}</span></div>
      <div><b>المراجعة بعد</b><span>30 يومًا</span></div>
    </div>

    <!-- **ما يُقاس بعد شهر.** التقرير كان يُعطي مؤشّرًا لكل مهمة ولا يُعطي
         موضعًا تُكتب فيه قراءتُه، فيبقى المؤشّر كلامًا. -->
    <table class="measure"><caption>واكتب بعد شهرٍ ما صار — بيدك، ليُقارَن</caption>
      <thead><tr><th>المؤشّر</th><th>اليوم</th><th>بعد 30 يومًا</th></tr></thead>
      <tbody>
        <tr><td>متوسطك في قوقل</td><td>${s.googleAverage ?? s.sampleAverage ?? '—'}</td><td class="write"></td></tr>
        <tr><td>عدد تقييماتك</td><td>${s.googleCount ?? '—'}</td><td class="write"></td></tr>
        <tr><td>نسبة الرد على الشكاوى</td><td>${s.replyRate === null ? '—' : `${s.replyRate}%`}</td><td class="write"></td></tr>
        ${a.rows.slice(0, 3).map((r) => `<tr><td>${esc(r.metric)}</td><td class="write"></td><td class="write"></td></tr>`).join('')}
      </tbody></table>
  </section>`;
}

/**
 * «بم ستبدأ؟» — فراغٌ يكتب فيه صاحب المحل بيده.
 *
 * التقرير المطبوع يُقرأ ويُطوى. والذي يُكتَب فيه يُعلَّق. وهذا لا يُملأ
 * برمجيًّا بحال: الالتزام الذي يكتبه المالك بيده هو الذي يُتابَع.
 */
export function commitBlock(place, job = {}) {
  const a = actions(place, job);
  if (!a.rows.length) return '';
  const top = a.rows.slice(0, 3);
  /* الخانة الفارغة تُقرأ جدولًا لم يُملأ لا دعوةً للكتابة. فيها الآن سطرٌ
     ظاهر وتلميحٌ باهت يقول ماذا يُكتب فيه. */
  const rows = top.map((r) => `<tr>
      <td>${esc(r.name)}</td>
      <td class="write"><span class="hint">اسم المسؤول</span></td>
      <td class="write"><span class="hint">التاريخ</span></td>
    </tr>`).join('');

  return `<section class="commit">
    <h2 class="no-count">بماذا ستبدأ؟</h2>
    <p class="fine">اكتب بخطّ يدك: من يتولّاها ومتى تُراجَع. وما لم يُكتب لا يُتابَع.</p>
    <table><thead><tr><th>الأولوية</th><th>من يتولّاها</th><th>تُراجَع في</th></tr></thead><tbody>${rows}</tbody></table>
  </section>`;
}

/**
 * ملحق مسوّدات الردود.
 *
 * المسوّدات كانت تُولَّد في الشاشة ثم تُنسَخ يدويًّا، ولا تبلغ صاحب المحل
 * في تقريره. وهو الذي سيردّ بها. فتُلحَق به، موسومةً بأنها **مسوّدة تُراجَع
 * لا ردٌّ يُنشَر**، وأن نصّ الشكوى منقولٌ بحروفه.
 */
export function draftsBlock(job = {}) {
  const raw = String(job.replyDrafts || '').trim();
  if (!raw) return '';
  // تُعرَض بنصّها كما وُلِّدت، بلا إعادة صياغة: ما يُراجعه المالك هو ما رآه.
  return `<section class="drafts">
    <h2 class="no-count">ملحق: مسوّدات ردود على الشكاوى</h2>
    <p class="fine"><b>مسوّدات تُراجَع لا ردودٌ تُنشَر.</b> اقرأها وعدِّل ما شئت قبل نشرها،
    فالردّ باسمك ومسؤوليتك. وكلُّ مسوّدةٍ مسنودةٌ إلى معرّف الشكوى التي تردّ عليها.</p>
    <pre class="draft-text">${esc(raw)}</pre>
  </section>`;
}

/**
 * ما ينجح عندك — ولا تمسّه وأنت تُصلح ما يفشل.
 *
 * التقرير كلّه شكاوى وترتيبُ شكاوى، وفيه بطاقةُ «أكبر قوة» واحدة. وصاحب
 * المحل يقرؤه فيخرج بأن محلّه معطوبٌ من كل وجه، فيُغيّر ما كان يُحمَد له
 * وهو يطارد ما يُذَمّ. وكثيرٌ من المحلات تُفسد ما ينجح وهي تُصلح ما يفشل.
 *
 * فهذا يعدّ ما أثنى عليه عملاؤه بألفاظهم — **المنصوصَ وحده**، لا ما استُنبط
 * من نجومهم — ويسنده بمعرّفاته، ويقول صراحةً: هذه لا تُمَسّ.
 */
export function keepBlock(place) {
  const rows = topicStats(place)
    .filter((t) => t.posStated >= 2 && t.posStated > t.neg)
    .sort((a, b) => b.posStated - a.posStated)
    .slice(0, 5);
  if (!rows.length) return '';

  const items = rows.map((t) => `<li style="--tc:${topicColor(t.id)}">
    <b><i class="ticon" style="color:${topicColor(t.id)}">${topicIcon(t.id)}</i>${esc(t.name)}</b>
    <span class="fine">${t.posStated} ثناءً منصوصًا${t.neg ? ` · وشكوى واحدة أو أكثر (${t.neg})` : ''}</span>
    ${t.posIds.slice(0, 5).map((x) => `<span class="rid">${esc(x)}</span>`).join(' ')}
  </li>`).join('');

  return `<section class="keep">
    <h2>ما ينجح عندك — لا تمسّه</h2>
    <p class="note">أثنى عليه عملاؤك <b>بألفاظهم</b> لا بنجومهم. وهو رأس مالك الذي تُبنى عليه السمعة،
    وأسهلُ ما يُفقَد وأنت تُصلح غيره.</p>
    <ul class="keeps">${items}</ul>
    <p class="fine">فقبل أي تغييرٍ في هذه المواضع، اسأل: هل يمسّ ما يُحمَد لي؟
    والمعرّفات بجانبها لتقرأ بنصّها ما قاله عملاؤك.</p>
  </section>`;
}

/**
 * الشكاوى بلا ردّ — أسرعُ فعلٍ وأرخصُه وأظهرُه للناس.
 *
 * كانت تُذكر سطرًا عابرًا في ذيل قسم الردود. وهي الفعل الوحيد في التقرير
 * الذي يتمّ اليوم بلا كلفة، ويراه **كل من يقرأ صفحتك في قوقل** بعدُ — لا
 * صاحب الشكوى وحده.
 */
export function unansweredBlock(place) {
  const a = analyzeReplies(place);
  if (!a.unanswered.length) return '';
  const byId = new Map((place?.reviews || []).map((r) => [r.id, r]));
  const rows = a.unanswered.slice(0, 8).map((id) => {
    const r = byId.get(id);
    if (!r) return '';
    const text = String(r.text || '').trim();
    const cut = text.length > 150 ? `${text.slice(0, 150)}…` : text;
    return `<li>
      <span class="rid">${esc(id)}</span>
      ${r.rating ? `<span class="uw-stars">${'★'.repeat(Math.round(r.rating))}</span>` : ''}
      ${r.date ? `<span class="fine">${esc(r.date)}</span>` : ''}
      <p>${esc(cut)}</p>
    </li>`;
  }).join('');

  return `<section class="unanswered">
    <h2>شكاوى تنتظر ردًّا منك</h2>
    <p class="note"><b>${a.negTotal - a.negReplied} من ${a.negTotal}</b> شكوى في عيّنتك بلا ردّ.
    والردّ أسرعُ ما في هذا التقرير وأرخصُه: لا يكلّف شيئًا، ويتمّ اليوم،
    ويراه <b>كل من يقرأ صفحتك في قوقل</b> بعدُ — لا صاحب الشكوى وحده.</p>
    <ul class="unans">${rows}</ul>
    <p class="fine">وردٌّ يعالج خيرٌ من اعتذارٍ مجرَّد: اذكر ما ستفعله، لا أنك «تأسف للإزعاج».
    ${'' /* المسوّدات في ملحق التقرير إن وُلِّدت */}</p>
  </section>`;
}
