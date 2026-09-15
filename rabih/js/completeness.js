// مدقّق الاكتمال — مرآة مدقّق السند.
// ذاك يمسك النموذج إن اخترع، وهذا يمسكه إن أهمل: شكوى وردت أربع مرات
// وتقريرٌ لا يذكرها خطأٌ كالاختراع، ولا شيء كان ينبّه إليه.

import { topicStats, normalizeAr } from './lexicon.js';
import { alerts, recentVsOlder } from './recency.js';
import { unusedReviews } from './verify.js';
import { stats } from './schema.js';

/** هل ذُكر الموضوع في النص؟ يُطابَق بالاسم وبمفاتيحه الدالّة. */
function mentioned(normText, topic) {
  const name = normalizeAr(topic.name);
  if (name && normText.includes(name)) return true;
  // اسم الموضوع مركّب غالبًا («الانتظار وسرعة الخدمة»)، فيكفي أحد شقّيه.
  return name.split(' ').filter((w) => w.length > 3).some((w) => normText.includes(w));
}

/**
 * يقيس ما أهمله التقرير من المرصود آليًّا.
 * @returns {{coverage:number, missedTopics:Array, missedAlerts:string[],
 *            unused:string[], level:'ok'|'warn'|'err', summary:string, checked:number}}
 */
export function audit(reportText, place) {
  const text = String(reportText || '');
  const norm = normalizeAr(text);
  const s = stats(place);

  // المواضيع الجديرة بالذكر: ما ورد سلبيًّا مرتين فأكثر، أو ورد في خُمس العيّنة.
  const threshold = Math.max(2, Math.ceil((place?.reviews?.length || 0) * 0.2));
  const notable = topicStats(place).filter((t) => t.neg >= 2 || t.total >= threshold);

  const missedTopics = notable.filter((t) => !mentioned(norm, t));
  const covered = notable.length - missedTopics.length;
  const coverage = notable.length ? Math.round((covered / notable.length) * 100) : 100;

  // الإنذارات الزمنية: يكفي ظهور جوهرها (الرقم أو الكلمة المفتاحية).
  const warn = alerts(place);
  const rec = recentVsOlder(place);
  const missedAlerts = warn.filter((a) => {
    if (/انحدار/.test(a)) return !/انحدار|تراجع|انخفاض|تدهور/.test(text) && !(rec.recent.avg !== null && text.includes(String(rec.recent.avg)));
    if (/تحسّن/.test(a)) return !/تحسّن|ارتفاع|تحسن/.test(text);
    if (/ناشئة|متفاقمة/.test(a)) {
      const name = (a.match(/«([^»]+)»/) || [])[1];
      return name ? !norm.includes(normalizeAr(name).split(' ')[0]) : false;
    }
    if (/بلا تاريخ/.test(a)) return !/بلا تاريخ|تواريخ غير|غير مؤرّ?خ/.test(text);
    return false;
  });

  const unused = unusedReviews(text, place);
  const unusedShare = s.total ? Math.round((unused.length / s.total) * 100) : 0;

  const problems = missedTopics.length + missedAlerts.length;
  const level = missedAlerts.length || missedTopics.length >= 2 ? 'err'
    : (missedTopics.length || unusedShare >= 60 ? 'warn' : 'ok');

  const bits = [];
  if (missedTopics.length) bits.push(`${missedTopics.length} موضوعًا مُهمَلًا`);
  if (missedAlerts.length) bits.push(`${missedAlerts.length} إنذارًا لم يُذكر`);
  if (unusedShare >= 60) bits.push(`${unusedShare}% من التعليقات بلا استشهاد`);

  const summary = problems === 0 && unusedShare < 60
    ? `التغطية ${coverage}% — كل ما رصده القاموس مذكور في التقرير.`
    : `التغطية ${coverage}% — ${bits.join('، ')}.`;

  return { coverage, missedTopics, missedAlerts, unused, unusedShare, level, summary, checked: notable.length };
}

/** نصٌّ يُلحَق برسالة إعادة المحاولة، فيُطلَب من النموذج سدّ النقص تحديدًا. */
export function fixPrompt(result) {
  if (!result || (result.level === 'ok')) return '';
  const L = ['# نقصٌ في تقريرك يجب سدّه', 'أعد التقرير نفسه كما هو، مضيفًا ما أُهمل، بلا حذف شيء مما كتبتَ وبلا اختراع:'];
  for (const t of result.missedTopics) {
    L.push(`- الموضوع «${t.name}» ورد ${t.total} مرات (سلبي ${t.neg}) ولم تذكره: ${t.ids.join('، ')}`);
  }
  for (const a of result.missedAlerts) L.push(`- إنذار لم يظهر في التقرير: ${a}`);
  if (result.unusedShare >= 60) {
    L.push(`- ${result.unusedShare}% من التعليقات لم يُستشهَد بأيٍّ منها؛ راجعها فقد يكون فيها ما يستحق.`);
  }
  return L.join('\n');
}
