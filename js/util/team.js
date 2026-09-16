// الفريق: من أدخله، ولمن أُسند (المرحلة ٤٧).
//
// **ما كان ناقصًا:** طبقةُ البيانات تختم `createdBy` و`updatedBy` على كلّ سجلٍّ في كلّ
// مخزنٍ منذ أوّل المشروع — **ولا شيء في الشاشات يعرضهما**. فالبياناتُ تعرف من أدخل العميل
// ومن غيّر السعر، والشاشةُ لا تقول. وهذا أوّلُ ما يحتاجه من تحته وسطاءُ ومسوّقون.
//
// **وحدُّ هذا كلِّه معلَنٌ ولا يُخفى:** هذا **تمييزٌ وتنسيق، لا تصريحٌ وحجب**. تعرف من
// أدخل، وتوزّع العمل، وتقيس كلَّ واحد — **ولا تمنع أحدًا من رؤية شيء**. والسببُ في البنية:
// التطبيق يعمل على قاعدةٍ في متصفّح كلّ جهاز، فمن فتح الجهاز وصل إلى ما فيه مهما أخفت
// الواجهة (وهذا مكتوبٌ في `role.js` منذ المرحلة ٣٥). والفصلُ الحقيقيّ يحتاج خادمًا يملك
// السجلّات ويصرّح بها سجلًّا سجلًّا — وذلك تحوّلٌ في بنية النظام لا إعدادٌ يُضاف.
//
// دوال خالصة: لا تخزين ولا شبكة.

/** اسمُ عضوٍ بمعرّفه، أو عبارةٌ صادقةٌ حين لا يُعرف. */
export function memberName(team = [], id, { unknown = 'غير معروف', me = null } = {}) {
  if (!id) return '';
  if (me && id === me) return 'أنا';
  const found = team.find((m) => m.id === id);
  return found?.name || unknown;
}

/** الأعضاءُ العاملون — والمعطَّلُ يبقى في القائمة لتُقرأ سجلّاته القديمة باسمه. */
export const activeMembers = (team = []) => team.filter((m) => m && m.active !== false);

/**
 * خياراتُ إسنادٍ لقائمة: العاملون، ومن أُسند إليه سابقًا ولو عُطّل.
 *
 * **والمعطَّلُ لا يختفي من سجلٍّ أُسند إليه**، وإلا لبدا السجلُّ بلا مسند وهو مسند.
 */
export function assignOptions(team = [], currentId = '') {
  const out = activeMembers(team).map((m) => ({ value: m.id, label: m.name }));
  if (currentId && !out.some((o) => o.value === currentId)) {
    const found = team.find((m) => m.id === currentId);
    out.push({ value: currentId, label: `${found?.name || 'عضو سابق'} (معطَّل)` });
  }
  return out;
}

/**
 * توزيعُ الوارد بالتناوب — **مقترَحٌ يُعرض ويُعتمد، لا يقع وحده**.
 *
 * والبدءُ من بعد آخرِ من أُسند إليه لا من أوّل القائمة، فلا يأخذ الأوّلُ كلَّ شيء كلَّ يوم.
 *
 * @returns {[{ item, memberId }]}
 */
export function roundRobin(items = [], team = [], { startAfter = null } = {}) {
  const members = activeMembers(team);
  if (!members.length || !items.length) return [];
  const at = members.findIndex((m) => m.id === startAfter);
  let i = at >= 0 ? (at + 1) % members.length : 0;
  return items.map((item) => {
    const memberId = members[i].id;
    i = (i + 1) % members.length;
    return { item, memberId };
  });
}

/**
 * أداءُ كلّ عضو — **من الحسابات القائمة نفسِها مصفّاةً**، لا بمعادلةٍ ثانية.
 *
 * **والإسنادُ يغلب الإنشاء:** عميلٌ أدخلتَه أنت وأسندتَه إلى ناصرٍ هو عميلُ ناصر — وإلا
 * لظهر كلُّ شيءٍ باسم من يُدخل البيانات لا باسم من يعمل عليها.
 *
 * @returns {[{ member, clients, properties, requests, deals, commission, entered }]}
 */
export function memberStats({ team = [], clients = [], properties = [], requests = [], deals = [] } = {}) {
  const ownerOf = (rec) => rec?.assignedTo || rec?.createdBy || null;
  const rows = activeMembers(team).map((member) => {
    const mine = (list) => list.filter((r) => ownerOf(r) === member.id);
    const myDeals = mine(deals);
    return {
      member,
      clients: mine(clients).length,
      properties: mine(properties).length,
      requests: mine(requests).length,
      deals: myDeals.length,
      commission: myDeals.reduce((a, d) => a + (Number(d.commission) || 0), 0),
      // ما أدخله بيده وإن أُسند لغيره — يفرّق بين من يُدخل ومن يُتابع.
      entered: [...clients, ...properties, ...requests].filter((r) => r.createdBy === member.id).length,
    };
  });
  // الأكثرُ عمولةً أوّلًا، ثم الأكثرُ صفقات — فالترتيبُ يقول شيئًا لا يُرتَّب أبجديًّا.
  return rows.sort((a, b) => b.commission - a.commission || b.deals - a.deals);
}

/** ما لم يُسند إلى أحد — وهو أوّلُ ما يبحث عنه مديرُ الكيان. */
export function unassigned(items = []) {
  return items.filter((r) => !r?.assignedTo);
}

/* ===== بانياتُ الواجهة المشتركة ===== */

/**
 * صفُّ رقائق الإسناد: «المسندة إليّ» · «بلا مسند» · وعضوًا عضوًا.
 *
 * جُمع هنا لأنه واحدٌ في ثلاث صفحات — والتكرارُ في ثلاثٍ يُنسى في واحدة.
 * ويعود `null` حين لا فريقَ إلا أنت: مكتبٌ من شخصٍ واحدٍ لا يحتاج رقاقةَ إسناد.
 *
 * @param {Function} o.el · o.formatNumber حقنٌ كي لا يستورد هذا الملفّ DOM المشروع
 */
export function assignRow({ rows = [], team = [], meId = '', value = '', onPick, el, formatNumber }) {
  const members = activeMembers(team);
  if (members.length < 2) return null;

  const chips = el('div', { class: 'chips' });
  const count = (fn) => rows.filter(fn).length;
  const chip = (key, label, n) => el('button', {
    type: 'button', class: `chip${value === key ? ' active' : ''}`,
    onClick: () => onPick(value === key ? '' : key),
  }, label, el('span', { class: 'chip-count', text: formatNumber(n) }));

  if (meId) chips.append(chip('me', 'المسندة إليّ', count((r) => r.assignedTo === meId)));
  chips.append(chip('none', 'بلا مسند', count((r) => !r.assignedTo)));
  for (const m of members) {
    if (m.id === meId) continue;   // «إليّ» تغني عن اسمك
    chips.append(chip(m.id, m.name, count((r) => r.assignedTo === m.id)));
  }
  return el('div', { class: 'filter-row' }, el('span', { class: 'filter-label', text: 'الإسناد' }), chips);
}

/** هل يمرّ السجلّ من مرشّح الإسناد المختار؟ */
export function passesAssign(rec, value, meId) {
  if (!value) return true;
  if (value === 'none') return !rec?.assignedTo;
  if (value === 'me') return rec?.assignedTo === meId;
  return rec?.assignedTo === value;
}
