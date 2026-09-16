// بصمة البيانات: هل التحليل الذي بين يديك مبنيٌّ على التعليقات التي أمامك؟
//
// **لماذا هذا ضروري؟** المعرّفات تُمنَح بالترتيب (R001، R002…)، فإذا بدّلت
// التعليقات بقيت المعرّفات نفسها لأسماءٍ أخرى ونصوصٍ أخرى. فتحليلٌ قديم
// يستشهد بـR001 يجتاز مدقّق السند اجتيازًا تامًّا — وهو يصف تعليقًا لم يعد
// موجودًا. فيمدح التقريرُ منشأةً صارت تعليقاتها كلها غاضبة، ولا شيء يُنبّه.
//
// فتُؤخَذ بصمةٌ للبيانات وقت إنتاج كل خطوة، وتُقارَن عند العرض.

/** FNV-1a: سريعة وتكفي لكشف التغيّر، وليست للتعمية. */
function hash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

/**
 * بصمة ما يُبنى عليه التحليل: التعليقات بنصوصها ومعرّفاتها وتقييماتها،
 * ومعها الأرقام المعلنة التي تدخل الرسائل. وما لا يدخل الرسالة لا يُبصَم،
 * كي لا تُنبَّه على تغيّرٍ لا أثر له.
 */
export function dataStamp(place) {
  if (!place) return '';
  const rows = (place.reviews || [])
    .map((r) => `${r.id}|${r.rating ?? ''}|${(r.text || '').trim()}|${(r.ownerReply || '').trim()}`)
    .join('\n');
  const head = [
    place.identity?.name || '',
    place.ratings?.average ?? '',
    place.ratings?.count ?? '',
  ].join('|');
  return `${(place.reviews || []).length}-${hash(head)}-${hash(rows)}`;
}

/** أي الخطوات بُنيت على بياناتٍ غير الحالية؟ */
export function staleSteps(out = {}, stamps = {}, current = '') {
  return Object.keys(out)
    .filter((k) => (out[k] || '').trim())
    .filter((k) => stamps[k] && stamps[k] !== current);
}
