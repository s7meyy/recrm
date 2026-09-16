// الأثر المالي — بافتراضاتك أنت لا بتقديرٍ منّا.
//
// **ما لا نفعله**: لا نستورد نسبًا من دراساتٍ عن أسواقٍ أخرى ونُسقطها على
// محلّك. «كل نجمةٍ ترفع الإيراد ٩٪» عبارةٌ تُزيّن التقرير ولا تصفه، ومصدرها
// سوقٌ غير سوقك. وإقحامها اختراعٌ بثوب علم.
//
// **ما نفعله**: نأخذ رقمين منك — متوسط الفاتورة، وعدد العملاء شهريًّا —
// ونحسب بهما سيناريوهات **مُعلَنة الفرض**: كل رقمٍ مقرونٌ بمصدره، وفرضُك
// مكتوبٌ بجانب نتيجته. فإن غيّرتَ الفرض تغيّرت النتيجة أمامك.

import { topicStats } from './lexicon.js';
import { stats } from './schema.js';

/**
 * @param {object} place
 * @param {{ticket:number, monthly:number, lossRate:number}} assume
 *        ticket: متوسط الفاتورة بالريال — منك.
 *        monthly: عدد العملاء شهريًّا — منك.
 *        lossRate: كم من الشاكين لا يعود، كنسبة (٠–١) — فرضُك أنت.
 */
export function impact(place, assume = {}) {
  const ticket = Number(assume.ticket) || 0;
  const monthly = Number(assume.monthly) || 0;
  const lossRate = Number.isFinite(assume.lossRate) ? assume.lossRate : 0.25;
  const s = stats(place);
  const total = s.total || 0;
  if (!total) return null;

  const rows = topicStats(place)
    .filter((t) => t.neg > 0)
    .map((t) => {
      const share = t.neg / total;                   // نسبة الشاكين في عيّنتك
      const affected = monthly * share;              // إسقاطها على عملائك
      const lost = affected * lossRate;
      return {
        id: t.id,
        name: t.name,
        neg: t.neg,
        share: Number((share * 100).toFixed(1)),
        affected: Math.round(affected),
        lost: Math.round(lost),
        riyals: Math.round(lost * ticket),
      };
    })
    .sort((a, b) => b.riyals - a.riyals);

  const totalRiyals = rows.reduce((a, r) => a + r.riyals, 0);

  return {
    ticket,
    monthly,
    lossRate,
    sample: total,
    rows,
    totalRiyals,
    yearly: totalRiyals * 12,
    // العيّنة قد لا تمثّل الإجمالي، فالإسقاط تقديرٌ لا قياس — ويُقال ذلك.
    sampleShare: s.coverage,
  };
}

/** كتلة HTML للتقرير — ولا تُدرَج إلا إذا أدخل المالك أرقامه. */
export function impactBlock(place, assume = {}) {
  const r = impact(place, assume);
  if (!r || !r.ticket || !r.monthly || !r.rows.length) return '';
  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const num = (n) => Number(n).toLocaleString('ar-SA');

  const rows = r.rows.slice(0, 6).map((x) => `<tr>
      <td>${esc(x.name)}</td>
      <td>${x.share}%</td>
      <td>${num(x.affected)}</td>
      <td>${num(x.lost)}</td>
      <td><b>${num(x.riyals)}</b> ريال</td>
    </tr>`).join('');

  return `<section class="impact">
    <h2>تقدير الأثر المالي — بافتراضاتك</h2>
    <div class="assume">
      <b>الأرقام التي أدخلتَها:</b> متوسط الفاتورة ${num(r.ticket)} ريال ·
      عدد العملاء شهريًّا ${num(r.monthly)} ·
      فرضُك أن ${Math.round(r.lossRate * 100)}% من الشاكين لا يعودون.
    </div>
    <table><thead><tr>
      <th>الموضوع</th><th>نسبة الشاكين في العيّنة</th><th>عملاء متأثّرون شهريًّا</th><th>منهم لا يعود</th><th>الأثر الشهري</th>
    </tr></thead><tbody>${rows}</tbody></table>
    <p class="total">مجموع التقدير: <b>${num(r.totalRiyals)} ريال شهريًّا</b> — أي نحو <b>${num(r.yearly)} ريال سنويًّا</b>.</p>
    <p class="fine"><b>كيف قُرئ هذا الجدول:</b> نسبة الشاكين محسوبة من عيّنتك (${num(r.sample)} تعليقًا${r.sampleShare ? `، وهي ${r.sampleShare}% من إجمالي تقييماتك` : ''}).
    وما عداها فرضٌ أدخلتَه أنت لا قياسٌ من بياناتك — فالجدول يقيس <b>حجم المشكلة على فرضك</b>، ولا يزعم أنه إيرادٌ ضائع مقيس.</p>
  </section>`;
}
