// بطاقةُ المشاركة (المرحلة ٦٠): صورةٌ واحدة — الصورة والسعر والمكان وشعارُ المكتب — تُرسل
// في واتساب بضغطة. الرابطُ وحده يُفتح أو لا يُفتح؛ والصورةُ تُرى في المحادثة نفسها.
//
// تُرسم في المتصفح على `<canvas>` بلا خادمٍ ولا مكتبة، ولا تصل الشبكة أبدًا: الصورةُ
// من مخزن هذا الجهاز، والشعارُ منه، والناتجُ ملفٌّ يمرّ إلى مشاركة الجهاز أو يُحمَّل.

import { el, openModal, toast } from './dom.js';
import { formatSAR, formatArea, formatNumber } from './format.js';
import { getImageUrl, firstStillId } from '../data/images.js';
import { typeLabel } from '../data/settings.js';

const W = 1080;
const H = 1080;

function loadImage(url) {
  return new Promise((resolve) => {
    if (!url) { resolve(null); return; }
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/** يرسم صورةً بملء مستطيلٍ مع القصّ من الوسط (كـ`object-fit: cover`). */
function drawCover(ctx, img, x, y, w, h) {
  const scale = Math.max(w / img.width, h / img.height);
  const sw = w / scale; const sh = h / scale;
  const sx = (img.width - sw) / 2; const sy = (img.height - sh) / 2;
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** سطورُ الحقائق القصيرة: المساحة، الغرف، الدور، الشوارع — ما وُجد فقط. */
export function cardFacts(property) {
  const out = [];
  if (property.area) out.push(formatArea(property.area));
  if (property.rooms) out.push(`${formatNumber(property.rooms)} غرف`);
  if (property.baths) out.push(`${formatNumber(property.baths)} دورات مياه`);
  if (property.floor) out.push(`الدور ${property.floor}`);
  if (property.streetWidth) out.push(`شارع ${formatNumber(property.streetWidth)} م`);
  if (property.facades) out.push(String(property.facades));
  return out.slice(0, 4);
}

/** نصُّ الرسالة الذي يرافق الصورة — يُنسخ أو يُرسل مع الملف. */
export function cardText({ property, lists, company, url = '' }) {
  const lines = [
    `${typeLabel(lists, property.type)} — ${[property.district, property.city].filter(Boolean).join('، ')}`,
    property.price == null ? 'السعر عند الطلب' : formatSAR(property.price),
    cardFacts(property).join(' · '),
    company?.name ? `${company.name}${company.phone ? ` · ${company.phone}` : ''}` : '',
    url,
  ].filter(Boolean);
  return lines.join('\n');
}

/**
 * يرسم البطاقة ويعيد `canvas`. الألوانُ من هويّة الموقع (ضاد) كي تشبه الصفحةَ العامة.
 * @param {{ property, lists, company, photoUrl?, logoUrl?, font? }} o
 */
export async function drawShareCard({ property, lists, company = {}, photoUrl = null, logoUrl = null, font = null }) {
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const family = font || getComputedStyle(document.body).fontFamily || 'sans-serif';
  const accent = '#0f6e56';
  const ink = '#1a1f1c';
  const muted = '#5f6b64';

  // الخلفية
  ctx.fillStyle = '#f2f4f1';
  ctx.fillRect(0, 0, W, H);

  // الصورة: ثلثا الارتفاع
  const photoH = 660;
  const photo = await loadImage(photoUrl);
  if (photo) {
    drawCover(ctx, photo, 0, 0, W, photoH);
  } else {
    ctx.fillStyle = '#dff0ea';
    ctx.fillRect(0, 0, W, photoH);
    ctx.fillStyle = accent;
    ctx.font = `700 64px ${family}`;
    ctx.textAlign = 'center';
    ctx.direction = 'rtl';
    ctx.fillText(typeLabel(lists, property.type), W / 2, photoH / 2 + 22);
  }
  // شريطٌ داكن متدرّج أسفل الصورة كي يُقرأ السعرُ فوقها
  const grad = ctx.createLinearGradient(0, photoH - 220, 0, photoH);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, photoH - 220, W, 220);

  ctx.direction = 'rtl';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  const margin = 56;

  // السعر على الصورة
  ctx.fillStyle = '#fff';
  ctx.font = `800 76px ${family}`;
  ctx.fillText(property.price == null ? 'السعر عند الطلب' : formatSAR(property.price), W - margin, photoH - 60);

  // الجزء السفلي: العنوان والحقائق
  ctx.fillStyle = ink;
  ctx.font = `700 52px ${family}`;
  const title = `${typeLabel(lists, property.type)} — ${[property.district, property.city].filter(Boolean).join('، ')}`;
  ctx.fillText(title, W - margin, photoH + 90);

  // رقائقُ الحقائق
  let x = W - margin;
  const y = photoH + 160;
  ctx.font = `600 34px ${family}`;
  for (const fact of cardFacts(property)) {
    const tw = ctx.measureText(fact).width + 44;
    if (x - tw < margin) break;
    ctx.fillStyle = '#dff0ea';
    roundRect(ctx, x - tw, y - 44, tw, 62, 31);
    ctx.fill();
    ctx.fillStyle = '#0a4d3c';
    ctx.fillText(fact, x - 22, y);
    x -= tw + 16;
  }

  // الغرض والحالة
  ctx.fillStyle = muted;
  ctx.font = `500 30px ${family}`;
  const purposes = (property.purposes || []).map((k) => ({ sale: 'بيع', rent: 'إيجار', investment: 'استثمار' }[k] || k)).join(' / ');
  if (purposes) ctx.fillText(purposes, W - margin, photoH + 250);

  // خطٌّ فاصل ثم المكتب
  ctx.fillStyle = '#d9e0d9';
  ctx.fillRect(margin, H - 150, W - margin * 2, 2);
  ctx.fillStyle = ink;
  ctx.font = `700 36px ${family}`;
  if (company.name) ctx.fillText(company.name, W - margin, H - 82);
  ctx.fillStyle = accent;
  ctx.font = `600 32px ${family}`;
  ctx.direction = 'ltr';
  ctx.textAlign = 'left';
  if (company.phone) ctx.fillText(company.phone, margin + (logoUrl ? 130 : 0), H - 82);
  const logo = await loadImage(logoUrl);
  if (logo) {
    const lh = 96; const lw = Math.min(200, logo.width * (lh / logo.height));
    ctx.drawImage(logo, margin, H - 150 + 27, lw, lh);
  }
  return canvas;
}

function canvasToBlob(canvas) {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
}

/**
 * يفتح نافذة المعاينة بأزرارها: مشاركة الجهاز (تحمل الصورة والنصّ) حيث وُجدت،
 * وتحميلُ الصورة، ونسخُ النصّ — فلا يبقى الزرُّ بلا فعلٍ في متصفّحٍ لا يدعم المشاركة.
 */
export async function openShareCard({ property, lists, company = {}, url = '' }) {
  const stillId = await firstStillId(property.images || []);
  const photoUrl = stillId ? await getImageUrl(stillId) : null;
  const logoUrl = company.logoImageId ? await getImageUrl(company.logoImageId) : null;
  const canvas = await drawShareCard({ property, lists, company, photoUrl, logoUrl });
  const blob = await canvasToBlob(canvas);
  const text = cardText({ property, lists, company, url });
  const fileName = `kassab-${property.district || 'card'}.png`;
  const file = blob ? new File([blob], fileName, { type: 'image/png' }) : null;
  const preview = el('img', { class: 'share-card-preview', src: canvas.toDataURL('image/png'), alt: 'بطاقة المشاركة' });
  const canShareFile = !!(file && navigator.canShare && navigator.canShare({ files: [file] }));

  const download = () => {
    const a = el('a', { href: URL.createObjectURL(blob), download: fileName });
    document.body.append(a); a.click(); a.remove();
  };
  const share = async () => {
    try {
      if (canShareFile) { await navigator.share({ files: [file], text }); return; }
      await navigator.clipboard.writeText(text);
      download();
      toast('حُمّلت الصورة ونُسخ النصّ — ألصقهما في واتساب', 'success', 5000);
    } catch (_) { /* أُلغيت المشاركة */ }
  };
  const modal = openModal({
    title: 'بطاقة المشاركة',
    body: el('div', { class: 'share-card-box' },
      preview,
      el('textarea', { class: 'input share-card-text', rows: 4, readonly: true }, text),
      el('p', { class: 'muted small', text: canShareFile
        ? 'تُرسل الصورةُ والنصُّ معًا إلى واتساب أو أيّ تطبيق.'
        : 'هذا المتصفّح لا يشارك الملفات مباشرةً: حمّل الصورة وانسخ النصّ ثم ألصقهما.' })),
    footer: [
      el('button', { type: 'button', class: 'btn btn-ghost', text: 'إغلاق', onClick: () => modal.close() }),
      el('button', { type: 'button', class: 'btn', text: 'انسخ النصّ', onClick: async () => { try { await navigator.clipboard.writeText(text); toast('نُسخ النصّ', 'success'); } catch (_) { toast('تعذّر النسخ', 'error'); } } }),
      el('button', { type: 'button', class: 'btn', text: 'حمّل الصورة', onClick: download }),
      el('button', { type: 'button', class: 'btn btn-primary', text: canShareFile ? 'شارك' : 'شارك (حمّل + انسخ)', onClick: share }),
    ],
  });
  return modal;
}
