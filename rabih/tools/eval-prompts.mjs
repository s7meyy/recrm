// مِعيار الرسائل — يقيس التزام النماذج الحقيقية بميثاق منع الهلوسة.
//
// **العلّة التي يعالجها:** بُنيت ثماني رسائل وميثاقٌ ومدقّقان، ولم يمرّ عليها نموذجٌ
// حقيقي قطّ. كل التحقّق جرى على مخرجاتٍ كتبناها بأيدينا لنختبر المدقّق. فهل يلتزم
// DeepSeek بالميثاق؟ لا نعلم — نظنّ. وهذا يحوّل الظنّ إلى رقم.
//
// المقياس ليس رأينا في المخرج، بل مدقّقا السند والاكتمال أنفسهما: المعرّف الوهمي،
// والحكم بلا سند، والرقم المخالف، والموضوع المُهمَل.
//
//   OPENROUTER_KEY=... node tools/eval-prompts.mjs [--models a,b] [--runs 2]

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { emptyPlace, assignReviewIds, stats } = await import(join(ROOT, 'js/schema.js'));
const { promptNormalize, promptAnalyze, MODEL_PICKS } = await import(join(ROOT, 'js/prompts.js'));
const { verify } = await import(join(ROOT, 'js/verify.js'));
const { audit } = await import(join(ROOT, 'js/completeness.js'));

const KEY = process.env.OPENROUTER_KEY || process.env.OPENROUTER_API_KEY;
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const RUNS = Number(arg('runs', 1));
const MODELS = (arg('models', '') || [...new Set([...MODEL_PICKS.normalize, ...MODEL_PICKS.analyze].map((m) => m.slug))].join(','))
  .split(',').map((x) => x.trim()).filter(Boolean);

/* ───── حالة اختبار معروفة الإجابة ─────
   بُنيت عمدًا لتحمل أفخاخًا: موضوعًا يتكرر أربع مرات فلا يُهمَل، وأرقامًا محسوبة
   فلا تُقدَّر، ومعرّفات لا وجود لخامسها فلا يُخترع. */

function fixture() {
  const p = emptyPlace();
  p.identity.name = 'مقهى الدرب';
  p.identity.category = 'مقهى';
  p.identity.address = 'حي الملقا، الرياض';
  p.ratings.average = 4.1;
  p.ratings.count = 268;
  p.reviews = [
    { rating: 5, author: 'أحمد', date: 'قبل ١١ شهرًا', text: 'طلبت اللاتيه وكان ممتاز، والباريستا فهد محترف.' },
    { rating: 5, author: 'خالد', date: 'قبل ١٠ أشهر', text: 'أفضل قهوة مختصة جربتها، والمكان هادئ للعمل.' },
    { rating: 4, author: 'ماجد', date: 'قبل ٩ أشهر', text: 'جيد جدًا لكن المواقف ضيقة.' },
    { rating: 5, author: 'هند', date: 'قبل ٨ أشهر', text: 'نظافة ممتازة وموظفون لطفاء.' },
    { rating: 2, author: 'نورة', date: 'قبل شهرين', text: 'انتظرت ٢٥ دقيقة على طلب بسيط ولم يعتذر أحد.', ownerReply: 'نعتذر عن التجربة' },
    { rating: 1, author: 'سارة', date: 'قبل شهر', text: 'الخدمة بطيئة جدًا والزحمة المسائية لا تُحتمل.', ownerReply: 'نعتذر عن التجربة' },
    { rating: 2, author: 'منى', date: 'قبل ٣ أسابيع', text: 'الانتظار طويل والكيك بايت.' },
    { rating: 2, author: 'فيصل', date: 'قبل أسبوع', text: 'بطء في الخدمة والإنترنت ضعيف.' },
  ];
  assignReviewIds(p);
  return p;
}

const ctx = { cityName: 'الرياض', districtName: 'الملقا', categoryId: 'cafe', categoryName: 'مقهى / كوفي' };

async function ask(model, prompt) {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { authorization: `Bearer ${KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], temperature: 0.2 }),
  });
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 160)}`);
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || '';
  if (!text.trim()) throw new Error('مخرج فارغ');
  return text;
}

/**
 * مخرجٌ مرجعي مكتوب بيدٍ، يستوفي ما تطلبه الرسالة على هذه الحالة بعينها.
 *
 * **لماذا مرجع؟** أول صياغة للمقياس أعطت المخرجَ المثاليَّ ٤٣ من ١٠٠ — مثل الذي
 * يخترع معرّفًا. والعلّة أن المدقّقين يقيسان بمقاييسهما، فتغطيةُ ٦٧٪ قد تكون سقفَ
 * ما يُدرَك على حالةٍ بعينها لا تقصيرًا من النموذج. فالنسبة إلى مرجعٍ يُقاس بالمقياس
 * نفسه تعزل عيوبَ المقياس عن عيوب النموذج.
 */
const GOLD = `# الخلاصة التنفيذية
يقف المقهى على 4.1 من 5 بواقع 268 تقييمًا، والعيّنة ثمانية تعليقات.

# قراءة الأرقام
أربعة تعليقات إيجابية وأربعة سلبية في العيّنة.

# نقاط القوة
- جودة المنتج والطعم: اللاتيه والقهوة المختصة (R001، R002).
- النظافة وتعامل الموظفين: موظفون لطفاء (R004).
- المكان والأجواء: هادئ للعمل (R002).

# نقاط الضعف والشكاوى
1. الانتظار وسرعة الخدمة — بطء متكرر (R005، R006، R007، R008).
2. الازدحام المسائي (R006).
3. المواقف ضيقة (R003).
4. الإنترنت ضعيف (R008).

# الاتجاه الزمني
انحدار: الشكاوى كلها في آخر تسعين يومًا ولم تَرِد قبلها.

# تعامل المنشأة مع التعليقات
ردّان متشابهان قالبًا على الشكاوى (R005، R006).

# التوصيات التنفيذية
- تعزيز المناوبة المسائية (R005، R006، R007).
- مراجعة مورّد الكيك (R007).`;

/** القياس الخام: أرقامٌ لا حكم فيها. */
export function measure(output, place) {
  const v = verify(output, place);
  const a = audit(output, place);
  return {
    cited: v.score,
    coverage: a.coverage,
    invented: v.badIds.length,
    unsupported: v.unsupported.length,
    badNumbers: v.numberIssues.length,
    missedTopics: a.missedTopics.length,
    missedAlerts: a.missedAlerts.length,
    level: v.level,
  };
}

/**
 * الحكم: **الاختراع لا يُغتفر مهما حسُن ما سواه.**
 * معرّفٌ لا وجود له أو رقمٌ يخالف المحسوب يُسقط المخرج، لأن تقريرًا فيه رقمٌ مخترع
 * لا يُسلَّم لعميل مهما كان باقيه جيدًا. وما عداه يُقاس نسبةً إلى المرجع.
 */
export function grade(output, place, gold) {
  const m = measure(output, place);
  const ref = gold || measure(GOLD, place);

  const rel = (x, r) => (r > 0 ? Math.min(100, Math.round((x / r) * 100)) : (x > 0 ? 100 : 0));
  const citedRel = rel(m.cited, ref.cited);
  const coverRel = rel(m.coverage, ref.coverage);

  const fatal = m.invented > 0 || m.badNumbers > 0;
  const verdict = fatal ? 'مرفوض'
    : (citedRel >= 80 && coverRel >= 80 ? 'مقبول' : 'ضعيف');

  return {
    ...m,
    citedRel,
    coverRel,
    fatal,
    verdict,
    total: fatal ? 0 : Math.round((citedRel + coverRel) / 2),
  };
}

export { GOLD };

async function main() {
  if (!KEY) {
    console.error('يلزم OPENROUTER_KEY. مثال:\n  OPENROUTER_KEY=sk-or-... node tools/eval-prompts.mjs');
    process.exit(1);
  }

  const place = fixture();
  const s = stats(place);
  console.log(`الحالة: ${place.reviews.length} تعليقًا، متوسط العيّنة ${s.sampleAverage}، متوسط قوقل ${s.googleAverage}.`);
  console.log(`النماذج: ${MODELS.length} × ${RUNS} تشغيلة × مرحلتين\n`);

  const gold = measure(GOLD, place);
  console.log(`المرجع المكتوب بيد: سند ${gold.cited}% · تغطية ${gold.coverage}% — وإليه تُنسَب درجات النماذج.\n`);

  const rows = [];
  for (const model of MODELS) {
    for (let run = 1; run <= RUNS; run += 1) {
      for (const [stage, build] of [
        ['التوحيد', () => promptNormalize(place, ctx)],
        ['التحليل', () => promptAnalyze('', place, ctx)],
      ]) {
        const label = `${model} · ${stage} · ${run}`;
        try {
          const out = await ask(model, build());
          const g = grade(out, place, gold);
          rows.push({ model, stage, run, ...g, chars: out.length });
          console.log(`${g.verdict === 'مقبول' ? '✓' : (g.fatal ? '✗' : '~')} ${label} → ${g.verdict} ${g.total}/100 ` +
            `(سند ${g.citedRel}% · تغطية ${g.coverRel}% من المرجع · اختراع ${g.invented} · أرقام ${g.badNumbers})`);
        } catch (e) {
          rows.push({ model, stage, run, total: null, error: String(e.message).slice(0, 120) });
          console.log(`! ${label} → ${e.message}`);
        }
      }
    }
  }

  // الترتيب: متوسط الدرجة، ثم نسبة المخرجات السليمة.
  const byModel = new Map();
  for (const r of rows) {
    const row = byModel.get(r.model) || { model: r.model, n: 0, sum: 0, clean: 0, invented: 0, errors: 0 };
    if (r.total === null) { row.errors += 1; } else {
      row.n += 1; row.sum += r.total;
      if (r.verdict === 'مقبول') row.clean += 1;
      row.invented += r.invented;
      row.badNumbers = (row.badNumbers || 0) + r.badNumbers;
    }
    byModel.set(r.model, row);
  }

  const board = [...byModel.values()]
    .map((r) => ({ ...r, avg: r.n ? Math.round(r.sum / r.n) : null }))
    .sort((a, b) => (b.avg ?? -1) - (a.avg ?? -1));

  console.log('\n═══ الترتيب ═══');
  for (const r of board) {
    console.log(`  ${String(r.avg ?? '—').padStart(3)}/100  ${r.model}  ` +
      `(مقبولة ${r.n ? Math.round((r.clean / r.n) * 100) : 0}% · اختراع ${r.invented} · أرقام مخالفة ${r.badNumbers || 0} · أخطاء ${r.errors})`);
  }

  mkdirSync(join(ROOT, 'docs'), { recursive: true });
  const out = join(ROOT, 'docs/eval-results.json');
  writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), fixture: place.reviews.length, rows, board }, null, 2));
  console.log(`\nالتفصيل: ${out}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
