// «فتح قائمته ولم يتصل» (المرحلة ٣٥): أحرّ إشارة شراءٍ في النظام، وكانت عمودًا في جدول.
//
// دالة `client-list` تعدّ فتحات الرابط الخاص بكل عميل (`opens` و`lastOpenAt`) وهي مكتوبةٌ
// بقصدٍ لتكون «إشارة متابعة». ثم تُعرض في عمودٍ داخل صفحة «الصفحة العامة للعروض» — صفحةٍ
// تفتحها حين تنشر، لا حين تتابع. فالإشارة تصل ولا يراها أحد.
//
// ورجلٌ يفتح قائمة عقاراته ثلاث مرّات في يومين **يشتري الآن**. وهذه تنقل الإشارة إلى
// «يومي» حيث تُتخذ القرارات.
//
// **وقاعدتان تمنعانها أن تكذب:**
//   ١) **الفتح بعد آخر تواصل**: فتحٌ سبق مكالمتك ليس متابعةً معلّقة — كلّمتَه بعده.
//   ٢) **نافذة قصيرة**: فتحٌ مضى عليه أسبوعان بردت حرارته، ولوحة «يومي» للعاجل لا للأرشيف.
//
// دالة خالصة: لا شبكة ولا تخزين — تأخذ القوائم كما جاءت من الدالة، والعملاء كما هم.

const DAY = 86400000;

/**
 * @param {{ lists, clients, contactsByClient, now, withinDays, minOpens }} input
 *   `lists` مخرج `/api/client-list`، و`contactsByClient` خريطة معرّف العميل ← آخر تواصل (ISO).
 * @returns {Array<{ client, list, opens, lastOpenAt, sinceContact }>} الأكثر فتحًا أولًا.
 */
export function openedNotCalled({
  lists = [], clients = [], contactsByClient = new Map(),
  now = Date.now(), withinDays = 14, minOpens = 1,
} = {}) {
  const byId = new Map(clients.map((c) => [c.id, c]));
  const out = [];

  for (const list of lists) {
    const opens = Number(list?.opens) || 0;
    if (opens < minOpens || !list?.lastOpenAt) continue;
    const openedAt = new Date(list.lastOpenAt).getTime();
    if (!Number.isFinite(openedAt) || now - openedAt > withinDays * DAY) continue;

    const client = list.clientId ? byId.get(list.clientId) : null;
    // من طلب ألّا تتصل لا يُعرض ولو فتح — طلبُه أولى من حماسنا.
    if (client?.doNotContact) continue;

    const lastContact = contactsByClient.get(list.clientId);
    const contactAt = lastContact ? new Date(lastContact).getTime() : NaN;
    // كلّمتَه بعد أن فتح؟ إذن لا شيء معلّق.
    if (Number.isFinite(contactAt) && contactAt >= openedAt) continue;

    out.push({
      client,
      list,
      opens,
      lastOpenAt: list.lastOpenAt,
      sinceContact: Number.isFinite(contactAt) ? Math.floor((openedAt - contactAt) / DAY) : null,
    });
  }

  return out.sort((a, b) => b.opens - a.opens
    || String(b.lastOpenAt).localeCompare(String(a.lastOpenAt)));
}
