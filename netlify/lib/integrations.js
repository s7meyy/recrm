// سجلّ التكاملات الخارجية (المرحلة ٣٧) — **الطرف عندنا، والاعتماد عندك**.
//
// سبعة تكاملات كانت خارج النطاق لأنها **ترخيصٌ أو اشتراكٌ أو ربطٌ رسمي**، لا قرارات
// برمجية. وهذا يبني نصفَها الذي يخصّنا: المحوّل، والحالة، والمكان الذي يقف فيه المفتاح
// حين يصل. فمتى جاء الاشتراك لم يبقَ إلا متغيّر بيئةٍ يُضاف.
//
// **وقاعدةٌ واحدة تحكم الملف كلّه: لا تكاملَ يدّعي أنه يعمل وهو لا يعمل.**
// بلا مفاتيح يردّ كلٌّ منها `not_configured` ومعه **ما ينقصه بالضبط** — لا «خطأ ما»،
// ولا نجاحٌ صامت، ولا بيانات وهمية تملأ الشاشة فتظنّها حقيقة. وميزةٌ تتظاهر بالعمل
// أخطر من ميزةٍ غائبة: على الغائبة تُخطّط، وعلى المتظاهرة تَبني.
//
// **والأسرار لا تنزل إلى المتصفح أبدًا.** تبقى متغيّرات بيئة على Netlify، والتطبيق يسأل
// «أمُهيَّأ؟» فيُجاب بنعم أو لا — لا بقيمة المفتاح. (ولهذا لا يُخزَّن مفتاحٌ في الإعدادات.)

/** حالة موحّدة يعيدها كل محوّل لم يُهيَّأ بعد. */
export const NOT_CONFIGURED = 'not_configured';

const has = (name) => {
  const v = process.env[name];
  return typeof v === 'string' && v.trim().length > 0;
};

/**
 * كل تكامل:
 *   `env`      متغيّرات البيئة اللازمة (كلّها مطلوبة ما لم تُوسم `optional`)
 *   `actions`  ما يستطيعه حين يُهيَّأ
 *   `run`      التنفيذ الفعلي — ويُستدعى **بعد** التحقق من التهيئة
 */
export const INTEGRATIONS = {
  /* ===== ١. إيجار — تسجيل عقود الإيجار ===== */
  ejar: {
    key: 'ejar',
    label: 'إيجار — تسجيل عقود الإيجار',
    env: ['EJAR_API_BASE', 'EJAR_API_KEY'],
    actions: ['contract.draft'],
    // «إيجار» منصّة الهيئة العامة للعقار، ولا واجهةَ عامة مفتوحة للوسطاء يُسجَّل بها من أي
    // تطبيق. فالمتاح صدقًا أحد اثنين: حسابك في المنصّة نفسها، أو مزوّدٌ معتمد يعطيك مفتاحًا.
    // وحتى يصل ذلك، ما نبنيه هو **حزمة العقد**: كل حقلٍ يطلبه العقد مجموعًا من سجلاتك
    // جاهزًا للإدخال أو للإرسال — وهو أكثر ما يُختصر من الوقت على كل حال.
    async run(action, payload) {
      if (action !== 'contract.draft') throw new Error('إجراء غير معروف');
      return { ok: true, draft: payload, note: 'مسوّدة عقد جاهزة للإرسال إلى إيجار' };
    },
  },

  /* ===== ٢. التوقيع الإلكتروني ===== */
  esign: {
    key: 'esign',
    label: 'التوقيع الإلكتروني',
    env: ['ESIGN_API_BASE', 'ESIGN_API_KEY'],
    actions: ['envelope.create', 'envelope.status'],
    async run(action, payload) {
      const base = process.env.ESIGN_API_BASE.replace(/\/+$/, '');
      const key = process.env.ESIGN_API_KEY;
      const path = action === 'envelope.create' ? '/envelopes' : `/envelopes/${encodeURIComponent(payload.id || '')}`;
      const res = await fetch(base + path, {
        method: action === 'envelope.create' ? 'POST' : 'GET',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
        body: action === 'envelope.create' ? JSON.stringify(payload) : undefined,
      });
      const body = await res.text();
      if (!res.ok) throw new Error(`المزوّد ردّ ${res.status}: ${body.slice(0, 200)}`);
      return { ok: true, provider: safeJson(body) };
    },
  },

  /* ===== ٣. بوابة السداد ===== */
  payments: {
    key: 'payments',
    label: 'بوابة السداد — رابط دفع للفاتورة',
    env: ['PAYMENTS_API_BASE', 'PAYMENTS_API_KEY', 'PAYMENTS_CURRENCY'],
    actions: ['link.create', 'link.status'],
    async run(action, payload) {
      const base = process.env.PAYMENTS_API_BASE.replace(/\/+$/, '');
      const key = process.env.PAYMENTS_API_KEY;
      if (action === 'link.status') {
        const res = await fetch(`${base}/payments/${encodeURIComponent(payload.id || '')}`, {
          headers: { authorization: `Bearer ${key}` },
        });
        const body = await res.text();
        if (!res.ok) throw new Error(`المزوّد ردّ ${res.status}: ${body.slice(0, 200)}`);
        return { ok: true, provider: safeJson(body) };
      }
      // المبلغ **بالهللات** كما تطلبه بوّابات السعودية عامّةً، ويُحوَّل هنا مرّة واحدة
      // فلا يتكرّر الخطأ في كل موضع يستدعيها.
      const halalas = Math.round(Number(payload.amount || 0) * 100);
      if (!Number.isFinite(halalas) || halalas <= 0) throw new Error('المبلغ غير صالح');
      const res = await fetch(`${base}/invoices`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
        body: JSON.stringify({
          amount: halalas,
          currency: process.env.PAYMENTS_CURRENCY || 'SAR',
          description: payload.description || 'فاتورة',
          callback_url: payload.callbackUrl || undefined,
        }),
      });
      const body = await res.text();
      if (!res.ok) throw new Error(`المزوّد ردّ ${res.status}: ${body.slice(0, 200)}`);
      return { ok: true, provider: safeJson(body) };
    },
  },

  /* ===== ٤. واتساب للأعمال ===== */
  whatsapp: {
    key: 'whatsapp',
    label: 'واتساب للأعمال — رسالة بقالب معتمَد',
    // استقبال الرسائل (المرحلة ٣٨) يحتاج اثنين آخرين: رمزَ مصافحةٍ تُثبت به ملكيّة
    // العنوان، وسرَّ التطبيق الذي تُوقَّع به الرسائل الواردة. وبلا الثاني لا يُقبل واردٌ
    // أصلًا — راجع netlify/functions/whatsapp.js.
    env: ['WHATSAPP_PHONE_ID', 'WHATSAPP_TOKEN'],
    envOptional: ['WHATSAPP_VERIFY_TOKEN', 'WHATSAPP_APP_SECRET'],
    actions: ['template.send'],
    async run(action, payload) {
      if (action !== 'template.send') throw new Error('إجراء غير معروف');
      const id = process.env.WHATSAPP_PHONE_ID;
      const token = process.env.WHATSAPP_TOKEN;
      const res = await fetch(`https://graph.facebook.com/v21.0/${encodeURIComponent(id)}/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: payload.to,
          type: 'template',
          template: {
            name: payload.template,
            language: { code: payload.language || 'ar' },
            components: payload.components || undefined,
          },
        }),
      });
      const body = await res.text();
      if (!res.ok) throw new Error(`واتساب ردّ ${res.status}: ${body.slice(0, 200)}`);
      return { ok: true, provider: safeJson(body) };
    },
  },

  /* ===== ٥. تفريغ المكالمات والملاحظات الصوتية ===== */
  transcribe: {
    key: 'transcribe',
    label: 'تفريغ الصوت إلى نصّ',
    env: ['TRANSCRIBE_API_BASE', 'TRANSCRIBE_API_KEY', 'TRANSCRIBE_MODEL'],
    actions: ['audio.transcribe'],
    async run(action, payload) {
      if (action !== 'audio.transcribe') throw new Error('إجراء غير معروف');
      const base = process.env.TRANSCRIBE_API_BASE.replace(/\/+$/, '');
      const res = await fetch(`${base}/audio/transcriptions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.TRANSCRIBE_API_KEY}` },
        body: JSON.stringify({
          model: process.env.TRANSCRIBE_MODEL,
          language: 'ar',
          audio: payload.audio, // base64
        }),
      });
      const body = await res.text();
      if (!res.ok) throw new Error(`المزوّد ردّ ${res.status}: ${body.slice(0, 200)}`);
      return { ok: true, provider: safeJson(body) };
    },
  },

  /* ===== ٦. قراءة المستندات (صك · هوية · رخصة) ===== */
  ocr: {
    key: 'ocr',
    label: 'قراءة المستندات — صك وهوية ورخصة',
    env: ['OCR_API_BASE', 'OCR_API_KEY', 'OCR_MODEL'],
    actions: ['document.read'],
    async run(action, payload) {
      if (action !== 'document.read') throw new Error('إجراء غير معروف');
      const base = process.env.OCR_API_BASE.replace(/\/+$/, '');
      const res = await fetch(`${base}/documents`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.OCR_API_KEY}` },
        body: JSON.stringify({ model: process.env.OCR_MODEL, kind: payload.kind, image: payload.image }),
      });
      const body = await res.text();
      if (!res.ok) throw new Error(`المزوّد ردّ ${res.status}: ${body.slice(0, 200)}`);
      return { ok: true, provider: safeJson(body) };
    },
  },

  /* ===== ٧. البريد التسويقي ===== */
  mailing: {
    key: 'mailing',
    label: 'البريد التسويقي — حملة إلى عملائك',
    env: ['MAIL_API_BASE', 'MAIL_API_KEY', 'MAIL_FROM'],
    actions: ['campaign.send'],
    async run(action, payload) {
      if (action !== 'campaign.send') throw new Error('إجراء غير معروف');
      const base = process.env.MAIL_API_BASE.replace(/\/+$/, '');
      const to = Array.isArray(payload.to) ? payload.to.filter(Boolean) : [];
      if (!to.length) throw new Error('لا مستقبِلين');
      const res = await fetch(`${base}/emails`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.MAIL_API_KEY}` },
        body: JSON.stringify({ from: process.env.MAIL_FROM, to, subject: payload.subject, html: payload.html }),
      });
      const body = await res.text();
      if (!res.ok) throw new Error(`المزوّد ردّ ${res.status}: ${body.slice(0, 200)}`);
      return { ok: true, provider: safeJson(body), sent: to.length };
    },
  },
};

function safeJson(text) {
  try { return JSON.parse(text); } catch (_) { return { raw: String(text).slice(0, 500) }; }
}

/** المتغيّرات الناقصة لتكامل — فارغةٌ تعني أنه مُهيَّأ. */
export function missingEnv(key) {
  const def = INTEGRATIONS[key];
  if (!def) return null;
  return def.env.filter((name) => !has(name));
}

/** حالة كل التكاملات — **بلا أي قيمة سرّ**، أسماء المتغيّرات الناقصة فقط. */
export function statusAll() {
  return Object.values(INTEGRATIONS).map((def) => {
    const missing = missingEnv(def.key);
    return {
      key: def.key,
      label: def.label,
      configured: missing.length === 0,
      missing,
      env: def.env,
      // اختياريّ لا يمنع الأساسَ من العمل، لكن نقصانه يُعطّل بابًا بعينه — فيُقال
      // منفصلًا لا مخلوطًا بالناقص الأساسي (المرحلة ٣٨).
      optional: def.envOptional || [],
      missingOptional: (def.envOptional || []).filter((name) => !has(name)),
      actions: def.actions,
    };
  });
}

/**
 * ينفّذ إجراءً — أو يقول بدقّة ما ينقصه.
 * @returns {{ ok: boolean, status?: string, missing?: string[] }}
 */
export async function runAction(key, action, payload = {}) {
  const def = INTEGRATIONS[key];
  if (!def) return { ok: false, status: 'unknown_integration' };
  const missing = missingEnv(key);
  if (missing.length) return { ok: false, status: NOT_CONFIGURED, missing, label: def.label };
  if (!def.actions.includes(action)) return { ok: false, status: 'unknown_action' };
  return def.run(action, payload);
}
