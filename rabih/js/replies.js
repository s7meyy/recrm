// تحليل ردود المالك — نقيس اليوم نسبتها فقط، وهذا لا يكفي:
// الردّ المكرَّر قالبًا أسوأ من لا ردّ، لأن كل زائر يراه فيعرف أنه آليّ.

import { similarity } from './anomaly.js';
import { normalizeAr } from './lexicon.js';

// عبارات اعتذار مجرّد: ردٌّ يقف عندها لا يعالج شيئًا.
const APOLOGY = ['نعتذر', 'الاعتذار', 'نأسف', 'ناسف', 'المعذره', 'نتفهم', 'يؤسفنا'];
// عبارات تدلّ على معالجة: وعدٌ أو إجراء أو قناة تواصل.
const ACTION = ['سنعمل', 'عملنا', 'تم اتخاذ', 'اتخذنا', 'سيتم', 'تواصل معنا', 'تواصلي معنا', 'راسلنا',
  'رقمنا', 'الادار', 'تمت معالج', 'عالجنا', 'نبهنا', 'تنبيه الفريق', 'درّبنا', 'استبدل', 'عوّض', 'سنراجع', 'راجعنا'];
const THANKS = ['شكرا', 'نشكرك', 'سعداء', 'يسعدنا', 'نورتنا', 'حياك'];

const has = (norm, list) => list.some((w) => norm.includes(normalizeAr(w)));

/**
 * @returns {{total, replied, rate, negTotal, negReplied, negRate, unanswered:string[],
 *            templates:Array<{ids:string[], sample:string}>, quality:{apologyOnly, withAction, thanksOnly},
 *            avgLength:number, level:'ok'|'warn'|'err', findings:string[]}}
 */
export function analyze(place) {
  const reviews = place?.reviews || [];
  const withReply = reviews.filter((r) => (r.ownerReply || '').trim());
  const negatives = reviews.filter((r) => Number(r.rating) >= 1 && Number(r.rating) <= 2);
  const negReplied = negatives.filter((r) => (r.ownerReply || '').trim());

  // ردود متشابهة = قالب واحد يُلصَق على الجميع.
  const templates = [];
  const seen = new Set();
  for (let i = 0; i < withReply.length; i += 1) {
    if (seen.has(withReply[i].id)) continue;
    const group = [withReply[i].id];
    for (let j = i + 1; j < withReply.length; j += 1) {
      if (seen.has(withReply[j].id)) continue;
      // عتبة أدنى من عتبة التعليقات: الردود قصيرة، فالتشابه فيها أصعب بلوغًا.
      if (similarity(withReply[i].ownerReply, withReply[j].ownerReply) >= 0.5) {
        group.push(withReply[j].id);
        seen.add(withReply[j].id);
      }
    }
    if (group.length > 1) templates.push({ ids: group, sample: withReply[i].ownerReply.slice(0, 90) });
  }

  let apologyOnly = 0, withAction = 0, thanksOnly = 0;
  let lengthSum = 0;
  for (const r of withReply) {
    const n = normalizeAr(r.ownerReply);
    lengthSum += r.ownerReply.trim().length;
    if (has(n, ACTION)) withAction += 1;
    else if (has(n, APOLOGY)) apologyOnly += 1;
    else if (has(n, THANKS)) thanksOnly += 1;
  }

  const rate = reviews.length ? Number(((withReply.length / reviews.length) * 100).toFixed(1)) : null;
  const negRate = negatives.length ? Number(((negReplied.length / negatives.length) * 100).toFixed(1)) : null;
  const templated = templates.reduce((a, t) => a + t.ids.length, 0);

  const findings = [];
  if (!withReply.length && reviews.length) {
    findings.push('لا ردّ على أي تعليق — صفحة المنشأة تبدو مهجورة لمن يقرؤها.');
  }
  if (negatives.length && negRate !== null && negRate < 50) {
    findings.push(`الشكاوى أولى بالرد: ${negReplied.length} من ${negatives.length} فقط رُدّ عليها (${negRate}%).`);
  }
  if (templated >= 2) {
    findings.push(`${templated} ردًّا متشابهًا — القالب الواحد يراه كل زائر فيعرف أنه آليّ.`);
  }
  if (withReply.length && apologyOnly > withAction) {
    findings.push(`${apologyOnly} ردًّا يعتذر بلا إجراء مقابل ${withAction} يذكر معالجة.`);
  }
  if (withReply.length && lengthSum / withReply.length < 30) {
    findings.push('متوسط طول الرد قصير جدًّا — لا يتّسع لمعالجة شكوى.');
  }

  const unanswered = negatives.filter((r) => !(r.ownerReply || '').trim()).map((r) => r.id);

  const level = (!withReply.length && reviews.length) || (negRate !== null && negRate < 30) ? 'err'
    : (findings.length ? 'warn' : 'ok');

  return {
    total: reviews.length,
    replied: withReply.length,
    rate,
    negTotal: negatives.length,
    negReplied: negReplied.length,
    negRate,
    unanswered,
    templates,
    quality: { apologyOnly, withAction, thanksOnly },
    avgLength: withReply.length ? Math.round(lengthSum / withReply.length) : 0,
    level,
    findings,
  };
}

/** كتلة تُضاف إلى رسائل النماذج. */
export function repliesBlock(place) {
  const a = analyze(place);
  if (!a.total) return '';
  const L = ['\n## تعامل المنشأة مع التعليقات (محسوب آليًّا)'];
  L.push(`- ردّ على ${a.replied} من ${a.total} تعليقًا${a.rate !== null ? ` (${a.rate}%)` : ''}`);
  if (a.negTotal) L.push(`- ردّ على ${a.negReplied} من ${a.negTotal} تعليقًا سلبيًّا${a.negRate !== null ? ` (${a.negRate}%)` : ''}`);
  if (a.unanswered.length) L.push(`- شكاوى بلا ردّ: ${a.unanswered.join('، ')}`);
  if (a.replied) L.push(`- نوع الردود: ${a.quality.withAction} تذكر معالجة، ${a.quality.apologyOnly} اعتذار مجرّد، ${a.quality.thanksOnly} شكر فقط. متوسط الطول ${a.avgLength} حرفًا.`);
  if (a.templates.length) L.push(`- ردود متشابهة (قالب واحد): ${a.templates.map((t) => t.ids.join(' ≈ ')).join(' · ')}`);
  if (a.findings.length) L.push(`- ملاحظات: ${a.findings.join(' ')}`);
  return L.join('\n');
}
