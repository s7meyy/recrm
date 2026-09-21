// بطاقةُ ثناءٍ صورةً — لا نصًّا في تقرير.
//
// البطاقة في التقرير تُقرأ ولا تُنشَر: صاحب المحل لن يعيد كتابتها في
// إنستقرام ولا يقصّ صورةَ شاشةٍ من ملفّ PDF. فتُرسَم صورةً مربّعة جاهزة
// للنشر، تُنزَّل بضغطة.
//
// ولا مكتبة: ترسمها لوحةُ الرسم (canvas) بنفسها، والعربية تُشكَّل فيها
// كما تُشكَّل في الصفحة.
//
// **وشرطُها شرطُ التقرير**: نصُّ العميل بحروفه. لا يُهذَّب ولا يُختصر —
// وما جاوز مساحةَ البطاقة **لا يُقَصّ صامتًا**، بل تُصغَّر البطاقةُ لتسعه،
// فإن لم تسعه رُفضت البطاقةُ كلُّها. واقتباسٌ مبتورٌ منسوبٌ إلى صاحبه
// تحريفٌ وإن كان بحسن نيّة.

const NAVY = '#16324f';
const GOLD = '#9a7b26';

/** يلفّ النصّ على أسطرٍ بعرضٍ معلوم، ويُرجع الأسطر. */
function wrap(ctx, text, maxWidth) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width <= maxWidth || !line) line = next;
    else { lines.push(line); line = w; }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * يرسم بطاقةً مربّعة ويُرجعها Blob بصيغة PNG.
 *
 * @param {{text:string, author?:string, date?:string, rating?:number, id?:string}} review
 * @param {{placeName?:string, size?:number, mark?:boolean}} opts
 * @returns {Promise<Blob|null>} وnull إن لم يسع النصُّ البطاقةَ بحال.
 */
export async function drawCard(review, { placeName = '', size = 1080, mark = true } = {}) {
  const text = String(review?.text || '').trim();
  if (!text) return null;

  const cv = document.createElement('canvas');
  cv.width = size;
  cv.height = size;
  const ctx = cv.getContext('2d');
  if (!ctx) return null;

  const pad = Math.round(size * 0.09);
  const inner = size - pad * 2;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#fbfcfd';
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = '#e3e8ee';
  ctx.lineWidth = Math.max(2, size * 0.004);
  ctx.strokeRect(pad * 0.45, pad * 0.45, size - pad * 0.9, size - pad * 0.9);

  ctx.direction = 'rtl';
  ctx.textAlign = 'center';
  const family = '"Segoe UI", Tahoma, "Noto Naskh Arabic", sans-serif';

  // النجوم
  const stars = Math.round(Number(review.rating) || 5);
  ctx.fillStyle = GOLD;
  ctx.font = `${Math.round(size * 0.055)}px ${family}`;
  ctx.fillText('★'.repeat(Math.max(1, Math.min(5, stars))), size / 2, pad + size * 0.06);

  /* يُبحَث عن أكبر قياسٍ يسع النصَّ كاملًا — ولا يُقَصّ منه حرف.
     فإن لم يسعه أصغرُ قياسٍ مقبول رُدَّت البطاقة، ولم تُسلَّم مبتورة. */
  const topY = pad + size * 0.13;
  const bottomY = size - pad - size * 0.14;
  const avail = bottomY - topY;
  let fs = Math.round(size * 0.052);
  let lines = [];
  const MIN = Math.round(size * 0.026);
  for (; fs >= MIN; fs -= 2) {
    ctx.font = `${fs}px ${family}`;
    lines = wrap(ctx, text, inner);
    if (lines.length * (fs * 1.75) <= avail) break;
  }
  if (fs < MIN) return null;          // نصٌّ أطولُ من أن يُعرَض بلا بتر

  ctx.fillStyle = NAVY;
  ctx.font = `${fs}px ${family}`;
  const lh = fs * 1.75;
  const startY = topY + (avail - lines.length * lh) / 2 + lh * 0.75;
  lines.forEach((l, i) => ctx.fillText(l, size / 2, startY + i * lh));

  // التوقيع: صاحب الكلمة، ثم اسم المنشأة.
  const who = String(review.author || '').trim() || 'عميل';
  ctx.fillStyle = '#626b78';
  ctx.font = `${Math.round(size * 0.028)}px ${family}`;
  ctx.fillText(`— ${who}${review.date ? ` · ${review.date}` : ''}`, size / 2, bottomY + size * 0.045);

  if (placeName) {
    ctx.strokeStyle = '#e3e8ee';
    ctx.lineWidth = Math.max(1, size * 0.002);
    ctx.beginPath();
    ctx.moveTo(pad * 1.6, bottomY + size * 0.065);
    ctx.lineTo(size - pad * 1.6, bottomY + size * 0.065);
    ctx.stroke();
    ctx.fillStyle = NAVY;
    ctx.font = `700 ${Math.round(size * 0.034)}px ${family}`;
    ctx.fillText(placeName, size / 2, bottomY + size * 0.105);
  }

  /* **وسمٌ صغير في ذيل البطاقة.** البطاقةُ تُنشَر في حساب المحلّ ويراها من لم
     يسمع برابح قطّ، فهي أوسعُ ما يخرج من التقرير انتشارًا. ويبقى صغيرًا في
     الذيل فلا ينازع شهادةَ العميل، ويسقط كلَّه متى أخفى صاحبُ المكتب رابح. */
  if (mark) {
    try {
      const { LOGO } = await import('./logo.js');
      const img = new Image();
      img.src = LOGO;
      await img.decode();
      const h = Math.round(size * 0.042);
      const w = Math.round(h * (img.width / img.height));
      ctx.globalAlpha = 0.6;
      ctx.drawImage(img, Math.round((size - w) / 2), Math.round(size - pad * 0.72 - h), w, h);
      ctx.globalAlpha = 1;
    } catch { /* الشعارُ زينةٌ لا شرط: بطاقةٌ بلا وسمٍ خيرٌ من بطاقةٍ لا تُرسَم */ }
  }

  return new Promise((resolve) => cv.toBlob(resolve, 'image/png'));
}

/** أصلحُ تعليقٍ للنشر: أعلى نجومًا ثم أطول نصًّا — ولا يُختلَق شيء. */
export function bestQuote(place) {
  return (place?.reviews || [])
    .filter((r) => Number(r.rating) >= 5 && (r.text || '').trim().length >= 40)
    .sort((a, b) => (b.text || '').length - (a.text || '').length)[0] || null;
}
