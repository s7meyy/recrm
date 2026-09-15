// التقويم الشهري وتصدير المواعيد (المرحلة ٣٢).
//
// المهام والمعاينات والمتابعات ونهايات الإيجار ودفعاته واتفاقياتك — **كلها بتواريخ، وكلها
// في قوائم متفرّقة**، ولا شهرٌ يُرى كاملًا. وهذا لا يضيف بيانات: يجمع ما هو مكتوب أصلًا
// في شبكةٍ واحدة تُقرأ بنظرة.
//
// وتصدير `.ics` يضع الموعد في تقويم جوالك — **بلا مزامنة ولا حساب**: ملفٌّ تفتحه فيُضاف
// مرّة واحدة. ولو غيّرتَ الموعد عندنا لن يتغيّر هناك، وهذا يُقال في الشاشة لا هنا فقط.
//
// دوال خالصة: لا تخزين ولا شبكة.

const DAY = 86400000;

export const EVENT_KINDS = {
  showing: { key: 'showing', label: 'معاينة', icon: '📅' },
  task: { key: 'task', label: 'مهمة', icon: '✅' },
  followUp: { key: 'followUp', label: 'متابعة', icon: '📞' },
  payment: { key: 'payment', label: 'دفعة إيجار', icon: '💰' },
  leaseEnd: { key: 'leaseEnd', label: 'نهاية عقد', icon: '🔑' },
  agreement: { key: 'agreement', label: 'نهاية اتفاقية', icon: '📝' },
  // انتهاء ترخيص الإعلان (المرحلة ٤٠): نهايةُ الاتفاقية كانت في التقويم وحدها، وترخيصٌ
  // ينتهي وإعلانُك قائم يجعله مخالفةً من يومه — فموعدُه أولى بالظهور لا أقلّ.
  adLicense: { key: 'adLicense', label: 'نهاية ترخيص إعلان', icon: '📜' },
};

const iso = (v) => {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** مفتاح اليوم المحلي «YYYY-MM-DD» — التجميع باليوم الذي يراه المستخدم لا بيوم UTC. */
export function dayKey(date) {
  const d = new Date(date);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * كل أحداث شهر من مصادرها الستّة.
 *
 * @param {{ showings, tasks, clients, deals, properties, lists, company }} data
 * @param {{ year, month }} when `month` صفريّ (٠ = يناير)
 * @returns {{ days: Map<string, []>, events: [], counts: object }}
 */
export function monthEvents(data = {}, { year, month } = {}) {
  const {
    showings = [], tasks = [], clients = [], deals = [], properties = [],
    propertyLabel = () => 'عقار', clientLabel = () => 'عميل', nextFollowUp = () => null,
    agreementEnd = () => null, taskListLabel = () => '',
  } = data;

  const start = new Date(year, month, 1).getTime();
  const end = new Date(year, month + 1, 1).getTime();
  const inMonth = (d) => d && d.getTime() >= start && d.getTime() < end;
  const events = [];
  const add = (kind, at, title, meta, href) => {
    const d = iso(at);
    if (!inMonth(d)) return;
    events.push({ kind, at: d.toISOString(), day: dayKey(d), title, meta: meta || '', href: href || null });
  };

  for (const s of showings) {
    if (s.status === 'cancelled') continue;
    add('showing', s.at, `معاينة — ${propertyLabel(s.propertyId || s.externalId)}`,
      clientLabel(s.clientId), s.clientId ? `#/client/${s.clientId}` : null);
  }
  for (const t of tasks) {
    if (t.done || !t.dueAt) continue;
    // **إلى المهمة نفسها لا إلى صفحتها** (المرحلة ٤٠): كان النقر يُلقيك في قائمةٍ من
    // مئة مهمّة تبحث فيها عمّا نقرتَ عليه. و`#/tasks/<id>` مسارٌ تقرؤه الصفحة منذ
    // المرحلة ٧ فتفتح المهمّة — لم يكن ينقص إلا استعماله.
    // واسمُ قائمتها في السطر الثاني: «اتصل على سعد» في «اتصالات» غيرُها في «متأخرات».
    add('task', t.dueAt, t.title || 'مهمة', taskListLabel(t.listId), `#/tasks/${t.id}`);
  }
  for (const c of clients) {
    const at = nextFollowUp(c);
    if (at) add('followUp', at, `متابعة — ${clientLabel(c.id)}`, '', `#/client/${c.id}`);
  }
  for (const d of deals) {
    for (const p of d.payments || []) {
      if (p.paidAt || !p.dueAt) continue;
      add('payment', p.dueAt, `دفعة إيجار${p.note ? ` — ${p.note}` : ''}`,
        clientLabel(d.clientId), d.clientId ? `#/client/${d.clientId}` : null);
    }
    if (d.leaseEndAt) {
      add('leaseEnd', d.leaseEndAt, `نهاية عقد — ${propertyLabel(d.propertyId)}`,
        clientLabel(d.clientId), d.clientId ? `#/client/${d.clientId}` : null);
    }
  }
  for (const p of properties) {
    const at = agreementEnd(p);
    if (at) add('agreement', at, `نهاية اتفاقية — ${propertyLabel(p.id)}`, '', `#/properties/${p.id}`);
    const lic = p.adLicense;
    if (lic?.number && lic.expiresAt) {
      add('adLicense', lic.expiresAt, `نهاية ترخيص إعلان — ${propertyLabel(p.id)}`, `رقم ${lic.number}`, '#/rega');
    }
  }

  events.sort((a, b) => a.at.localeCompare(b.at));
  const days = new Map();
  for (const e of events) {
    if (!days.has(e.day)) days.set(e.day, []);
    days.get(e.day).push(e);
  }
  const counts = {};
  for (const e of events) counts[e.kind] = (counts[e.kind] || 0) + 1;
  return { days, events, counts };
}

/** شبكة الشهر: أسابيع من سبعة أيام تبدأ بالأحد، مع أيام الجوار لإتمام الصفوف. */
export function monthGrid(year, month) {
  const first = new Date(year, month, 1);
  const startOffset = first.getDay(); // الأحد ٠
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/* ===== تصدير iCalendar ===== */

const pad = (n) => String(n).padStart(2, '0');
const stamp = (d) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`
  + `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;

// قواعد ICS: الفاصلة والفاصلة المنقوطة والشرطة المائلة تُهرَّب، والسطر الجديد يصير \n.
const esc = (v) => String(v ?? '')
  .replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** طيّ السطر عند ٧٥ محرفًا بمسافة بادئة — شرط في المواصفة تتشدّد فيه بعض التقاويم. */
const fold = (line) => {
  const chars = [...line];
  if (chars.length <= 75) return line;
  const parts = [];
  for (let i = 0; i < chars.length; i += 74) parts.push(chars.slice(i, i + 74).join(''));
  return parts.join('\r\n ');
};

/**
 * ملف تقويم من أحداث.
 * **مدّة الموعد افتراضية (`minutes`)** لأن أحداثنا لحظات لا فترات — ولا يُخترع لها وقت انتهاء
 * غير معلن.
 */
export function icsCalendar(events = [], { name = 'كسّاب', minutes = 60 } = {}) {
  const now = new Date();
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//kassab//ar//',
    'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${esc(name)}`,
  ];
  for (const e of events) {
    const startDate = new Date(e.at);
    if (Number.isNaN(startDate.getTime())) continue;
    const endDate = new Date(startDate.getTime() + minutes * 60000);
    const uid = `${startDate.getTime()}-${Math.abs([...String(e.title || '')].reduce((h, ch) => ((h * 31) + ch.codePointAt(0)) | 0, 7))}@kassab`;
    lines.push(
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${stamp(now)}`,
      `DTSTART:${stamp(startDate)}`,
      `DTEND:${stamp(endDate)}`,
      `SUMMARY:${esc(e.title || 'موعد')}`,
      e.meta ? `DESCRIPTION:${esc(e.meta)}` : null,
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.filter(Boolean).map(fold).join('\r\n');
}

/** ذكرى الصفقة السنوية: صفقات مرّ عليها عام (±نافذة) ولم تُهنَّأ بعد. */
export function dealAnniversaries(deals = [], { now = Date.now(), windowDays = 7 } = {}) {
  return deals
    .filter((d) => d.clientId && d.date && !d.anniversaryGreetedAt)
    .map((d) => {
      const at = new Date(d.date).getTime();
      if (!Number.isFinite(at)) return null;
      const years = Math.floor((now - at) / (365 * DAY));
      if (years < 1) return null;
      const target = at + years * 365 * DAY;
      const diff = Math.round((now - target) / DAY);
      return { deal: d, years, diff };
    })
    .filter((x) => x && x.diff >= 0 && x.diff <= windowDays)
    .sort((a, b) => b.years - a.years || a.diff - b.diff);
}
