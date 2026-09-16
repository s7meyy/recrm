// ما لم يدخل هذا التحليل.
//
// التقرير يقول «20% من العيّنة تشكو من الانتظار»، فيقرؤها صاحب المحل
// «20% من زبائني». وبين العبارتين ثلاث فجوات لا يذكرها التقرير:
// تقييماتٌ صامتة لا نصّ لها فلا رأي فيها يُقرأ، وتعليقاتٌ لم يعرفها
// القاموس فلم تدخل جدول المواضيع، وتعليقاتٌ بلا تاريخ فلم تدخل القراءة
// الزمنية. وإخفاء الفجوة يجعل الرقم أوسع مما يحتمل.
//
// فهذا قسمٌ يعدّها عدًّا. وهو أنفع للعميل من رقمٍ يظنّه شاملًا وليس كذلك.

import { stats } from './schema.js';
import { topicCoverage } from './lexicon.js';

const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const num = (n) => (Number.isFinite(Number(n)) ? Number(n).toLocaleString('ar-SA-u-nu-latn') : '—');

/**
 * @returns {{rows:Array<{label:string,count:number,note:string}>, sample:number, silent:number|null}}
 */
export function coverage(place, job = {}) {
  const s = stats(place);
  const reviews = place?.reviews || [];
  const tc = topicCoverage(place);

  // الصامتة: تقييماتٌ في قوقل بلا نص. لا تُعرَف إلا إن صرّح المالك بعدد المنصوصة.
  const silent = (s.googleCount !== null && s.declaredWithText !== null)
    ? Math.max(0, s.googleCount - s.declaredWithText) : null;

  const noDate = reviews.filter((r) => !r.date).length;
  const noRating = reviews.filter((r) => !(r.rating >= 1 && r.rating <= 5)).length;
  const excluded = (job.excluded || []).length;

  const rows = [];
  if (silent !== null && silent > 0) {
    rows.push({
      label: 'تقييمات صامتة (نجوم بلا نص)', count: silent,
      note: 'لا رأي فيها يُقرأ، فلا تدخل تحليل المواضيع ولا الاقتباسات. وهي داخلة في متوسط قوقل.',
    });
  } else if (s.googleCount !== null && s.declaredWithText === null) {
    rows.push({
      label: 'تقييمات صامتة', count: null,
      note: 'عددها غير معروف: لم يُدخَل عدد التعليقات المنصوصة في قوقل. وحتى يُدخَل، تُقاس التغطية على الإجمالي فتظهر أقلّ مما هي.',
    });
  }
  if (tc.unclassified) {
    rows.push({
      label: 'تعليقات لم تُصنَّف تحت أي موضوع', count: tc.unclassified,
      note: `${tc.share}% من العيّنة. لم يطابق نصُّها كلمةً في القاموس، فلا تظهر في جدول المواضيع. وزيادةُ كلمات القاموس تُنقصها.`,
    });
  }
  if (noDate) {
    rows.push({
      label: 'تعليقات بلا تاريخ', count: noDate,
      note: 'لا تدخل القراءة الزمنية ولا مقارنة آخر 90 يومًا، وتدخل كل ما سواهما.',
    });
  }
  if (noRating) {
    rows.push({
      label: 'تعليقات بلا تقييم نجمي', count: noRating,
      note: 'نصُّها محلَّل، ونجومها غير معروفة فلا تدخل المتوسط ولا التوزيع. ولم تُخمَّن.',
    });
  }
  if (excluded) {
    rows.push({
      label: 'مستبعَدة بقرارك', count: excluded,
      note: 'أخرجتَها أنت من التحليل. ونصُّها محفوظ ولم يُحذف.',
    });
  }

  return { rows, sample: s.total, silent, topicShare: tc.share };
}

/** كتلة التقرير: بلا صفٍّ واحد لا تُطبع. */
export function coverageBlock(place, job = {}) {
  const c = coverage(place, job);
  if (!c.rows.length) return '';
  const rows = c.rows.map((r) => `<tr>
      <td>${esc(r.label)}</td>
      <td>${r.count === null ? 'غير معروف' : num(r.count)}</td>
      <td class="fine">${esc(r.note)}</td>
    </tr>`).join('');

  return `<section class="coverage">
    <h2>ما لا يغطّيه هذا التقرير</h2>
    <p class="fine">أرقام التقرير محسوبةٌ على ${num(c.sample)} تعليقًا في عيّنتك. وما دونها لم يدخلها، وهذا بيانه.</p>
    <table><thead><tr><th>ما لم يدخل</th><th>العدد</th><th>وأثره في القراءة</th></tr></thead><tbody>${rows}</tbody></table>
    <!-- **أهمّ تحفّظٍ في التقرير كلّه، وكان غائبًا**: العيّنة ليست عشوائية.
         وكلُّ نسبةٍ في هذا التقرير تصف من كتب، لا من زار. -->
    <div class="notrandom">
      <b>وعيّنتك ليست عشوائية — وهذا أهمّ ما يُقيّد أرقامها.</b>
      <p>من يكتب في قوقل ليس عيّنةً من زبائنك: يكتب الغاضب جدًّا والراضي جدًّا،
      ويسكت أكثرُ من مرّ بك مرورًا عاديًّا. فكلُّ نسبةٍ في هذا التقرير تصف
      <b>من كتب</b> لا <b>من زار</b>، ولا تُقرأ نسبةً من زبائنك.</p>
      <p class="fine">ولا يُصلح هذا حسابٌ ولا هامش، لأنه ليس نقصًا في العدد بل في طريقة وصوله.
      وأقربُ ما يُقرَّبه: أن تسأل من يخرج من بابك اليوم، فتعرف رأي الساكتين.</p>
    </div>
    <p class="fine">ولم يُحذف من التعليقات شيء، ولم يُغيَّر نصُّ أحد. وهذا عدُّ ما خرج من الحساب لا إخفاءٌ له.</p>
    <!-- وكيف يُصحَّح ما أخطأنا فيه. -->
    <div class="fixit">
      <b>ووجدتَ تعليقًا تراه مزيَّفًا أو لا يخصّك؟</b>
      <p>أَعْلِم مُعِدَّ التقرير بمعرّفه (R000 المكتوب بجانب كل اقتباس) — يُستبعَد ويُعاد الحساب كلُّه أمامك،
      ويبقى نصُّه محفوظًا مع سبب استبعاده في ذيل التقرير، فلا يُمحى ولا يُخفى.
      وأرقامُ هذا التقرير ليست حكمًا نُصدره عليك، بل عدٌّ تملك مراجعته.</p>
    </div>
  </section>`;
}
