// كتالوج النماذج — يُطابق ما نفضّله بما هو متاحٌ مجانًا **اليوم**.
//
// `MODEL_PICKS` في `prompts.js` تقول ما نفضّله ولماذا، ولا تعرف ما مات منه.
// وقد ماتت ثلاثةُ بدائلَ معًا في يومٍ واحد فتوقّف خطُّ التحليل عند أول خطوة.
// فهذه الوحدة تسأل الخادم عن القائمة المجانية الحيّة (`/api/models`)، وتبني
// لكل دورٍ قائمةَ ترشيحٍ من ثلاث طبقات:
//
//   1. المفضَّلُ كما هو، إن كان لا يزال مجانيًّا.
//   2. وإلا فأقربُ قريبٍ له من العائلة نفسها (deepseek-chat ← deepseek-chat-v3.1:free).
//   3. ثم أفضلُ ما بقي في القائمة الحيّة، بالعائلات التي نثق بعربيّتها.
//
// وما جُرِّب فردّ بأنه «لم يعد مجانيًّا» يُوسَم متقاعدًا فلا يُجرَّب ثانيةً في
// هذه الجلسة. **ولا مدفوعَ هنا بقرار المالك**: مجانيٌّ يُجيب، أو نسخٌ ولصقٌ في
// أي نموذجٍ مجانيٍّ على الويب — وهو الطريقُ الثاني القائم في شاشة خطّ التحليل. وإن تعذّر الوصول إلى القائمة عاد الترشيحُ إلى الثابت كما كان،
// فلا يُكسَر ما كان يعمل.

import { MODEL_PICKS } from './prompts.js';


const CACHE_KEY = 'rabih:free-models:v2';   // v2: القائمةُ موسومةٌ بالنصّية — وما قبلها يُهمَل
const RETIRED_KEY = 'rabih:retired-models';
const TTL = 60 * 60 * 1000;

/** العائلاتُ التي نثق بها للعربية، بترتيب الأفضلية — تُستعمل لطبقة الاحتياط. */
const TRUSTED = ['deepseek', 'qwen', 'meta-llama', 'google', 'mistralai', 'nvidia', 'microsoft', 'openai'];

const storage = () => (typeof localStorage !== 'undefined' ? localStorage : null);

function readCache() {
  try {
    const raw = storage()?.getItem(CACHE_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw);
    return Date.now() - c.at < TTL ? c.free : null;
  } catch { return null; }
}

function writeCache(free) {
  try { storage()?.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), free })); } catch { /* تجاهل */ }
}

export function retired() {
  try { return new Set(JSON.parse(storage()?.getItem(RETIRED_KEY) || '[]')); } catch { return new Set(); }
}

/** يُوسَم النموذج متقاعدًا متى ردّ المزوّد بأنه لم يعد مجانيًّا. */
export function retire(slug) {
  const set = retired();
  set.add(slug);
  try { storage()?.setItem(RETIRED_KEY, JSON.stringify([...set])); } catch { /* تجاهل */ }
}

/** هل هذا الخطأ يقول إن النموذج لم يعد مجانيًّا أو أنه محجوزٌ لغيرنا؟ فلا يُجرَّب ثانية. */
export function retiredFrom(errorText) {
  const t = String(errorText || '');
  /* «للأدوات البرمجية فقط» (٤٠٣) تقاعدٌ من جهتنا أيضًا: لن يُجيب غدًا كما لم يُجب اليوم. */
  if (/only available on agentic harnesses|only available (to|on) /i.test(t)) return { paid: null, why: 'harness' };
  if (!/unavailable for free|no longer free|not available for free/i.test(t)) return null;
  const m = t.match(/use this slug instead:\s*([\w./:-]+)/i);
  return { paid: m ? m[1] : null, why: 'paid-only' };
}

/** القائمةُ الحيّة — من الخادم، أو من الخبيئة، أو لا شيء. */
export async function freeModels({ force = false } = {}) {
  if (!force) {
    const c = readCache();
    if (c) return c.free || c;
  }
  try {
    const res = await fetch('/api/models', { cache: 'no-store' });
    if (!res.ok) return null;
    const j = await res.json();
    if (!Array.isArray(j?.free)) return null;
    writeCache({ free: j.free });
    return j.free;
  } catch { return null; }
}

/** نصّيٌّ بشهادة الخادم، وليس اسمُه اسمَ مولّدِ صوتٍ أو صورة — حارسان لا واحد. */
const NON_TEXT = /lyria|imagen|veo|flux|stable-diffusion|whisper|tts|embed|rerank|moderation|guard|clip|audio|music|video|image/i;
export function isTextModel(m) {
  return m?.text === true && !NON_TEXT.test(`${m.id} ${m.name || ''}`);
}

/** جذرُ الاسم بلا نسخةٍ ولا لاحقة: «deepseek/deepseek-chat-v3:free» ← «deepseek/deepseek-chat». */
function family(slug) {
  return String(slug || '').replace(/:free$/, '').replace(/-v?\d+(\.\d+)*[a-z]*$/i, '').replace(/-(instruct|exp|preview|it)$/i, '');
}

/**
 * قائمةُ الترشيح لدورٍ — بالطبقات الثلاث، وبلا متقاعد.
 * @returns {Promise<Array<{name:string, slug:string, note:string}>>}
 */
export async function resolvePicks(role) {
  const preferred = MODEL_PICKS[role] || [];
  const dead = retired();
  const live = await freeModels();

  if (!live) return preferred.filter((p) => !dead.has(p.slug));

  const liveIds = new Set(live.map((m) => m.id));
  const out = [];
  const seen = new Set();
  const push = (pick) => { if (!seen.has(pick.slug) && !dead.has(pick.slug)) { seen.add(pick.slug); out.push(pick); } };

  for (const p of preferred) {
    if (liveIds.has(p.slug)) { push(p); continue; }
    // أقربُ قريب من العائلة نفسها
    const fam = family(p.slug);
    const fit = (m) => !dead.has(m.id) && isTextModel(m) && m.context >= 32000;
    const kin = live.find((m) => family(m.id) === fam && fit(m))
      || live.find((m) => m.id.split('/')[0] === p.slug.split('/')[0] && fit(m));
    if (kin) push({ name: kin.name, slug: kin.id, note: `مجاني اليوم — بديلُ ${p.name} من العائلة نفسها` });
  }

  // احتياطٌ من القائمة الحيّة حتى تبلغ ثلاثة
  const WANT = 6;
  for (const vendor of TRUSTED) {
    if (out.length >= WANT) break;
    const m = live.find((x) => x.id.startsWith(vendor + '/') && !seen.has(x.id) && !dead.has(x.id) && isTextModel(x) && x.context >= 32000);
    if (m) push({ name: m.name, slug: m.id, note: 'مجاني اليوم — من القائمة الحيّة' });
  }
  for (const m of live) {
    if (out.length >= WANT) break;
    if (isTextModel(m) && m.context >= 32000) push({ name: m.name, slug: m.id, note: 'مجاني اليوم — من القائمة الحيّة' });
  }

  return out;
}
