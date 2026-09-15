// تحويل نموذج عميل من إعلانات Meta إلى سجل طلب (المرحلة ٣٠).
//
// حقول نموذج Meta تصل بأسماء إنجليزية قياسية أحيانًا وبأسماء كتبتَها أنت أحيانًا أخرى،
// فالمطابقة **بالاسم القياسي أولًا ثم بالمعنى** — وما لم يُعرف لا يُرمى: يُضمّ إلى الملاحظة
// كما جاء، لأن سطرًا لا نفهمه أهون من بيانات عميلٍ تضيع.
//
// دوال خالصة: لا شبكة ولا تخزين — ولذلك تُختبر وحدها بلا حساب Meta.

import crypto from 'node:crypto';

const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

export function normalizePhone(raw) {
  const digits = String(raw ?? '')
    .replace(/[٠-٩]/g, (d) => String(ARABIC_DIGITS.indexOf(d)))
    .replace(/\D/g, '');
  if (/^9665\d{8}$/.test(digits)) return `0${digits.slice(3)}`;
  if (/^05\d{8}$/.test(digits)) return digits;
  if (/^5\d{8}$/.test(digits)) return `0${digits}`;
  return '';
}

// `first_name` **ليس** هنا بقصد: وجوده يسبق الجمع فيعطي «سارة» بدل «سارة القحطاني».
const NAME_KEYS = ['full_name', 'name', 'الاسم'];
const PHONE_KEYS = ['phone_number', 'phone', 'mobile', 'الجوال', 'الجوّال', 'رقم_الجوال'];
const EMAIL_KEYS = ['email', 'البريد'];

const pick = (map, keys) => keys.map((k) => map.get(k)).find((v) => v);

/**
 * @param {[{name, values}]} fieldData حقول النموذج كما ترسلها Meta
 * @returns {{ name, phone, note }}
 */
export function mapLeadFields(fieldData = []) {
  const map = new Map();
  const extras = [];
  for (const field of fieldData) {
    const key = String(field?.name ?? '').trim().toLowerCase();
    const value = Array.isArray(field?.values) ? field.values.join('، ').trim() : String(field?.values ?? '').trim();
    if (!key || !value) continue;
    map.set(key, value);
    const known = [...NAME_KEYS, 'first_name', 'last_name', ...PHONE_KEYS, ...EMAIL_KEYS];
    if (!known.includes(key)) extras.push(`${field.name}: ${value}`);
  }
  const first = map.get('first_name');
  const last = map.get('last_name');
  const name = pick(map, NAME_KEYS) || [first, last].filter(Boolean).join(' ');
  const email = pick(map, EMAIL_KEYS);
  return {
    name: (name || '').slice(0, 60),
    phone: normalizePhone(pick(map, PHONE_KEYS)),
    // البريد ليس حقلًا في سجل العميل عندنا، فلا يُخترع له حقل — يُذكر في الملاحظة.
    note: [email ? `البريد: ${email}` : '', ...extras].filter(Boolean).join(' · ').slice(0, 400),
  };
}

/**
 * التحقّق من توقيع Meta (`X-Hub-Signature-256`) بمقارنة ثابتة الزمن.
 * **بلا سرٍّ مضبوط لا يُقبل شيء:** نقطة عامة بلا توقيع تعني أن أي أحد يحقن عملاء في قاعدتك.
 */
export function verifySignature(rawBody, header, appSecret) {
  if (!appSecret || !header) return false;
  const expected = `sha256=${crypto.createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex')}`;
  const a = Buffer.from(String(header));
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** معرّفات النماذج الواردة في حمولة الويب-هوك. */
export function leadgenIds(payload) {
  const out = [];
  for (const entry of payload?.entry || []) {
    for (const change of entry?.changes || []) {
      const id = change?.value?.leadgen_id;
      if (id) out.push({ id: String(id), formId: String(change.value.form_id || ''), createdAt: change.value.created_time || null });
    }
  }
  return out;
}
