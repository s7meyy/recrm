/**
 * **المطالبة بالمتأخّر** (المرحلة ٤٩) — المستحقُّ كان يُعمَّر بدقّةٍ ثم يقف عند العرض.
 *
 * `receivables` تُعمِّر كلَّ مستحقٍّ في شرائحَ عمريّة، فواتيرَ وعمولاتٍ ودفعات، وتُعرض في
 * ثلاث صفحات — **ثم لا شيء**. ومديرُ الأملاك عملُه في الشريحة نفسِها: عشرون مستأجرًا
 * تأخّروا، وعليه أن يكتب لكلٍّ منهم رسالةً بيده فيها اسمُه ومبلغُه وعددُ أيّام تأخّره.
 * والقوالبُ موجودةٌ في الإعدادات، والواتسابُ موصول — **والوصلةُ بينهما كانت مفقودة**.
 *
 * **والنبرةُ تتبع الشريحة**: تذكيرٌ لطيفٌ عند سبعة أيام لا يشبه مطالبةً عند تسعين.
 * ونبرةٌ واحدةٌ لكلّ الأعمار إمّا أن تُغضب من تأخّر يومين، وإمّا أن تُلاين من تأخّر سنة.
 *
 * دوالُّ خالصة: تبني النصّ ولا تُرسله. والإرسالُ يمرّ بـ`openWhatsApp` فيُسجَّل مستنتَجًا
 * كما يُسجَّل كلُّ ما يُفتح من النظام — فلا يُطالَب أحدٌ مرّتين في يوم.
 */

import { formatSAR, daysWord as defaultDaysWord } from './format.js';

/**
 * نبرةٌ لكلّ شريحةٍ عمريّة، بمفاتيح `AGE_BUCKETS` نفسِها.
 *
 * و`current` (لم يستحقّ بعد) **له نصٌّ أيضًا** ولم يُترك: تذكيرٌ قبل الاستحقاق
 * بيومين أنفعُ من مطالبةٍ بعده بأسبوع، وهو أرفقُ بالعلاقة.
 */
export const DUNNING_TONES = [
  {
    bucket: 'current',
    label: 'تذكيرٌ قبل الموعد',
    lead: 'تذكيرٌ ودّيّ',
    body: (v) => `السلام عليكم ${v.name}\nتذكيرٌ بأنّ ${v.what} بمبلغ ${v.amount} يستحقّ ${v.when}.\nوإن كان قد سُدِّد فاعذرني على التذكير.\n${v.sign}`,
  },
  {
    bucket: 'd30',
    label: 'تذكيرٌ لطيف',
    lead: 'تذكير',
    body: (v) => `السلام عليكم ${v.name}\nأذكّرك بـ${v.what} بمبلغ ${v.amount}، وقد استحقّ ${v.when}.\nلعلّه سهوٌ — وإن كنتَ سدّدتَه فأرجو إشعاري لأحدّث السجلّ.\n${v.sign}`,
  },
  {
    bucket: 'd60',
    label: 'متابعةٌ ثانية',
    lead: 'متابعة',
    body: (v) => `السلام عليكم ${v.name}\nما زال ${v.what} بمبلغ ${v.amount} غيرَ مسدَّد، وقد مضى على استحقاقه ${v.days}.\nأرجو إفادتي بموعدٍ للسداد كي أرتّب حسابي عليه.\n${v.sign}`,
  },
  {
    bucket: 'd90',
    label: 'مطالبةٌ صريحة',
    lead: 'مطالبة',
    body: (v) => `السلام عليكم ${v.name}\nبخصوص ${v.what} بمبلغ ${v.amount} المستحقّ منذ ${v.days}:\nأرجو تحديدَ موعدٍ نهائيٍّ للسداد، أو إفادتي إن كان ثمّة إشكالٌ نتفاهم عليه.\n${v.sign}`,
  },
  {
    bucket: 'older',
    label: 'مطالبةٌ أخيرة',
    lead: 'مطالبة أخيرة',
    body: (v) => `السلام عليكم ${v.name}\nمضى على استحقاق ${v.what} بمبلغ ${v.amount} ${v.days}، ولم أتلقَّ سدادًا ولا إفادة.\nأرجو التواصل معي خلال أسبوعٍ لتسوية المبلغ ودّيًّا.\n${v.sign}`,
  },
];

const TONE_BY_BUCKET = Object.fromEntries(DUNNING_TONES.map((t) => [t.bucket, t]));

/** نبرةُ شريحةٍ بمفتاحها — والمجهولةُ تُردّ إلى اللطيفة، فالشدّةُ لا تُخمَّن. */
export const toneFor = (bucket) => TONE_BY_BUCKET[bucket] || TONE_BY_BUCKET.d30;

/** وصفُ المستحقّ كما يُخاطَب به صاحبُه — لا كما يُسمّى في الجدول. */
function whatOf(row) {
  if (row?.kind === 'invoice') return row.number ? `الفاتورة ${row.number}` : 'الفاتورة';
  if (row?.kind === 'payment') return 'دفعة الإيجار';
  if (row?.kind === 'commission') return 'عمولة الوساطة';
  return 'المبلغ المستحقّ';
}

/**
 * نصُّ مطالبةٍ لصفٍّ واحدٍ من `receivables().rows`.
 *
 * **ولا يُخترع اسمٌ ولا تاريخ**: بلا اسمٍ يُخاطَب بلا اسم، وبلا تاريخٍ لا يُقال
 * «استحقّ اليوم». ورقمُ الأيّام يُكتب بكلمةٍ عربيّةٍ صحيحةٍ عبر `daysWord` المُمرَّرة.
 *
 * @param {object} o
 * @param {object} o.row صفُّ المستحقّ (kind · name · remaining · days · basis)
 * @param {object} [o.client] العميل إن كان مسجَّلًا — اسمُه أولى من الاسم المطبوع
 * @param {Function} [o.daysWord] صائغُ «٣ أيام»
 * @param {Function} [o.formatDate] صائغُ التاريخ
 * @returns {{ text, tone }}
 */
export function dunningDraft({ row, client = null, company = null, user = null, daysWord = defaultDaysWord, formatDate = null } = {}) {
  const tone = toneFor(row?.bucket);
  const days = Math.max(0, Number(row?.days) || 0);
  const name = (client?.name || row?.name || '').trim();
  // تاريخُ الاستحقاق يُذكر متى عُرف؛ وإلّا فـ«سابقًا» — ولا يُخترع يوم.
  const when = row?.basis && formatDate ? `في ${formatDate(row.basis)}` : 'سابقًا';
  const sign = [user?.name, company?.name].filter(Boolean).join(' — ');
  const text = tone.body({
    name: name || 'وبعد',
    what: whatOf(row),
    amount: formatSAR(row?.remaining ?? 0),
    when,
    // ولا صيغةَ احتياطيّةٍ تلصق العددَ بالاسم: «3 يوم» خطأٌ عربيّ، والمعجمُ واحد.
    days: daysWord(days),
    sign: sign || '',
  });
  // توقيعٌ فارغٌ يترك سطرًا معلَّقًا في آخر الرسالة — يُقصّ كما يُقصّ أيُّ سطرٍ فارغ.
  return { text: text.replace(/\n+$/, ''), tone };
}

/**
 * الصفوفُ التي يُطالَب بها فعلًا: ما مضى استحقاقُه، ولمن يُعرف كيف يُخاطَب.
 *
 * **ومن لا جوالَ له لا يُدرَج** — لا في القائمة أصلًا: زرُّ رسالةٍ لا تُرسَل وعدٌ كاذب.
 * والصفُّ بلا عميلٍ مسجَّلٍ يُدرَج إن كان في الفاتورة جوالٌ مطبوع.
 */
export function dunningList(rows = [], clientsById = new Map()) {
  return rows
    .filter((r) => r.days > 0 && r.remaining > 0)
    .map((r) => {
      const client = r.clientId ? clientsById.get(r.clientId) || null : null;
      const phone = client?.phone || r.invoice?.clientPhone || '';
      return { row: r, client, phone };
    })
    .filter((x) => !!x.phone)
    .sort((a, b) => b.row.days - a.row.days);
}
