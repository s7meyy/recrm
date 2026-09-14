// ترتيب أولوية العميل (المرحلة ٢٣): من أحقّ بمكالمتك الآن؟
//
// الأنظمة العالمية تبيع هذا بوصفه «ذكاءً» يقيّم العميل بنموذج لغوي. وهذا يفعل ٧٠٪ منه
// **بحسابٍ من بياناتك أنت، ويقول لك لماذا** — وهو فارقٌ جوهري لا تجميلي: درجةٌ لا تُشرح
// لا تُصحَّح، وأنت أدرى بعملائك من أي نموذج.
//
// دوال خالصة: لا تخزين ولا شبكة، وكل إشارة فيها مقروءة من سجلٍّ موجود أصلًا.

const DAY = 86400000;

/**
 * إشارات الدرجة وأوزانها. موجبها يرفع وسالبها يخفض، والمجموع يُقصّ بين صفر ومئة.
 * والأوزان اجتهاد معلن لا قانون — مكتوبة هنا في مكان واحد ليُراجَع.
 */
export const SIGNALS = [
  { key: 'tagged', weight: 25, label: 'صنّفته «جادّ» أو «مهم»' },
  { key: 'opened', weight: 20, label: 'فتح رابط عروضه' },
  { key: 'replied', weight: 18, label: 'تواصلتما فعلًا' },
  { key: 'activeRequest', weight: 15, label: 'له طلب نشط' },
  { key: 'hasCandidates', weight: 12, label: 'عندك ما يناسبه الآن' },
  { key: 'complete', weight: 10, label: 'بياناته مكتملة' },
  { key: 'stale', weight: -20, label: 'مضى وقت طويل بلا تواصل' },
  { key: 'unrealistic', weight: -15, label: 'ميزانيته بعيدة عن سوق حيّه' },
  { key: 'noPhone', weight: -30, label: 'بلا جوال — لا سبيل للوصول إليه' },
];

const WEIGHTS = Object.fromEntries(SIGNALS.map((s) => [s.key, s.weight]));
const LABELS = Object.fromEntries(SIGNALS.map((s) => [s.key, s.label]));

/**
 * @param {object} client
 * @param {{ requests, lastContactAt, opens, candidates, unrealistic, staleDays, now }} ctx
 *   `opens` عدد فتحات روابطه · `candidates` عدد المرشحين لطلباته · `unrealistic` هل ميزانيته بعيدة
 * @returns {{ score, reasons: [{ key, label, weight }], hot: boolean }}
 */
export function scoreClient(client, {
  requests = [], lastContactAt = null, opens = 0, candidates = 0,
  unrealistic = false, staleDays = 14, now = Date.now(),
} = {}) {
  const hit = [];
  const add = (key, on) => { if (on) hit.push(key); };

  add('tagged', (client?.tags || []).some((t) => t === 'جادّ' || t === 'مهم'));
  add('opened', opens > 0);
  add('replied', (client?.contacts || []).length > 0);
  add('activeRequest', requests.some((r) => r.status === 'active'));
  add('hasCandidates', candidates > 0);
  add('complete', !!(client?.name && client?.phone));
  add('noPhone', !client?.phone && !client?.phone2);
  add('unrealistic', !!unrealistic);

  const last = lastContactAt ? new Date(lastContactAt).getTime() : null;
  add('stale', last != null && now - last > staleDays * DAY);

  // العميل المُبرَم أو المغلق ليس في السباق أصلًا — درجته صفر لا رقمٌ يزاحم الأحياء.
  if (client?.stage === 'won' || client?.stage === 'closed') {
    return { score: 0, reasons: [{ key: 'closed', label: 'ملفّه مغلق', weight: 0 }], hot: false };
  }

  const raw = hit.reduce((sum, key) => sum + WEIGHTS[key], 0);
  const score = Math.max(0, Math.min(100, raw));
  const reasons = hit
    .map((key) => ({ key, label: LABELS[key], weight: WEIGHTS[key] }))
    .sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight));
  return { score, reasons, hot: score >= 60 };
}

/**
 * عملاء جدد لم تردّ عليهم بعد (speed-to-lead).
 *
 * «الردّ خلال ١٥ دقيقة» شعار تبيعه أنظمة كبرى، والفكرة أبسط من أدواتها: عميلٌ سُجِّل ولم
 * يُسجَّل معه تواصل ومضى عليه أكثر من الحدّ. ويُقصر على أسبوع مضى كي لا تتحوّل اللوحة
 * إلى أرشيف ذنوب قديمة لا يُفعل بها شيء.
 */
export function awaitingReply(clients = [], { minutes = 60, withinDays = 7, now = Date.now() } = {}) {
  if (!minutes) return [];
  return clients
    .filter((c) => (c.contacts || []).length === 0 && c.stage !== 'won' && c.stage !== 'closed')
    .map((c) => ({ client: c, since: new Date(c.createdAt).getTime() }))
    .filter((x) => Number.isFinite(x.since)
      && now - x.since >= minutes * 60000
      && now - x.since <= withinDays * DAY)
    .map((x) => ({ ...x, waitedMinutes: Math.round((now - x.since) / 60000) }))
    .sort((a, b) => b.waitedMinutes - a.waitedMinutes);
}
