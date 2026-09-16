// توقيع التقرير والتحقّق منه — «لا يُعدَّل بعد التسليم أيضًا».
//
// شرطُ الأداة أن تكون صادقة، وقد حُرِس ذلك في المدخل (أمانة النقل) وفي
// المخرج (مدقّق السند والاقتباس). وبقي ما بعد التسليم: ملفٌّ خرج من يدك
// يستطيع أحدٌ أن يغيّر فيه رقمًا ثم ينسبه إليك.
//
// فيُحسَب لبصمةٌ SHA-256 لمحتواه، وتُطبَع في التقرير مع تاريخه. ومن شكّ
// يُلصق الملف في صفحة التحقّق فتقول: أهو كما صدر أم غُيِّر.
//
// **وهذا ليس توقيعًا معمَّى بمفتاحٍ سرّي**: هو بصمةُ محتوى تكشف التغيير ولا
// تُثبت الهوية. والفرق يُقال صراحةً، فدعوى أمانٍ أكبر ممّا تُعطي خيانةٌ أخرى.

const enc = new TextEncoder();

/** يُزيل ما يتغيّر بلا معنًى: البصمة نفسها، ومسافات الأسطر. */
export function canonical(html) {
  return String(html || '')
    .replace(/<span class="sig-hash">[^<]*<\/span>/g, '<span class="sig-hash"></span>')
    .replace(/\r\n/g, '\n')
    .trim();
}

export async function fingerprint(html) {
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(canonical(html)));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** الشكل المقروء: مجموعاتٌ رباعية تسهل قراءتها ومقارنتها بالعين. */
export const pretty = (hex) => (hex || '').slice(0, 32).replace(/(.{4})/g, '$1 ').trim().toUpperCase();

/**
 * يُدرج كتلة التوقيع في التقرير قبل إغلاق الجسد.
 * وتُحسَب البصمة بعد الإدراج على نصٍّ خالٍ منها، فيمكن التحقّق منها لاحقًا.
 */
export async function sign(html, { office = '' } = {}) {
  const at = new Date().toISOString();
  const block = `<section class="signature">
    <h2 class="no-count">توقيع التقرير</h2>
    <p>هذا التقرير يحمل بصمةً لمحتواه. فإن غُيِّر فيه حرفٌ بعد صدوره اختلفت البصمة.</p>
    <div class="sig-row"><b>البصمة</b><span class="sig-hash"></span></div>
    <div class="sig-row"><b>صدر في</b><span>${at.slice(0, 16).replace('T', ' ')}</span></div>
    ${office ? `<div class="sig-row"><b>جهة الإصدار</b><span>${String(office).replace(/[<>&]/g, '')}</span></div>` : ''}
    <p class="fine">للتحقّق: افتح صفحة التحقّق في المنصّة وألصق الملف. والبصمة تكشف التغيير ولا تُثبت هوية المُصدِر — وهي لذلك أضعف من توقيعٍ بمفتاح، وأصدقُ من دعوى ما لا تُعطي.</p>
  </section>`;

  const withBlock = html.includes('</main>')
    ? html.replace('</main>', `${block}</main>`)
    : html.replace('</body>', `${block}</body>`);

  const hash = await fingerprint(withBlock);
  return {
    html: withBlock.replace('<span class="sig-hash"></span>', `<span class="sig-hash">${pretty(hash)}</span>`),
    hash,
    at,
  };
}

/** يتحقّق من ملفٍ مُسلَّم: أهو كما صدر؟ */
export async function verifyFile(html) {
  const shown = (html.match(/<span class="sig-hash">([^<]*)<\/span>/) || [])[1] || '';
  if (!shown.trim()) return { ok: false, reason: 'لا بصمة في هذا الملف — لم يُوقَّع أصلًا.' };
  const actual = await fingerprint(html);
  const match = pretty(actual) === shown.trim().toUpperCase();
  return {
    ok: match,
    shown: shown.trim(),
    actual: pretty(actual),
    reason: match ? 'الملف كما صدر، ولم يُغيَّر فيه شيء.' : 'البصمة لا تطابق المحتوى — غُيِّر في الملف بعد صدوره.',
  };
}
