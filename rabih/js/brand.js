// هوية المكتب — التقارير تُباع، فينبغي أن تحمل اسم مُعِدّها لا اسم الأداة.
// كل شيء محلي في المتصفح، ويُحقن في التقرير عند الإخراج.

const KEY = 'rabih:identity';

export const EMPTY = {
  office: '',        // اسم المكتب أو المُعِدّ
  tagline: '',       // سطر تعريفي
  phone: '', email: '', website: '',
  logo: '',          // data URL
  primary: '#16324f',
  accent: '#9a7b26',
  showRabih: true,   // إظهار «أُعدّ عبر رابح» في التذييل
};

export function load() {
  try { return { ...EMPTY, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; }
  catch { return { ...EMPTY }; }
}

export function save(identity) {
  try { localStorage.setItem(KEY, JSON.stringify({ ...EMPTY, ...identity })); return true; }
  catch { return false; }
}

export const isConfigured = (id) => !!(id?.office || id?.logo);

/** هل اللون قاتم بما يكفي ليُكتب عليه بالأبيض؟ يمنع غلافًا لا يُقرأ. */
export function isDark(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
  if (!m) return true;
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) < 140;
}

/** CSS يُحقن في التقرير فيغيّر لوحته إلى ألوان المكتب. */
export function themeCss(id) {
  if (!id) return '';
  const primary = /^#[0-9a-f]{6}$/i.test(id.primary) ? id.primary : EMPTY.primary;
  const accent = /^#[0-9a-f]{6}$/i.test(id.accent) ? id.accent : EMPTY.accent;
  return `:root{--navy:${primary};--gold:${accent}}\n`;
}

/** ترويسة المُعِدّ على الغلاف. */
export function coverHeader(id) {
  if (!isConfigured(id)) return '';
  const logo = id.logo ? `<img class="office-logo" src="${id.logo}" alt="">` : '';
  return `<div class="office">${logo}${id.office ? `<div class="office-name">${escapeHtml(id.office)}</div>` : ''}${
    id.tagline ? `<div class="office-tag">${escapeHtml(id.tagline)}</div>` : ''}</div>`;
}

/** سطر التواصل في التذييل. */
export function footerLine(id) {
  if (!isConfigured(id)) return '';
  const parts = [id.office, id.phone, id.email, id.website].filter(Boolean).map(escapeHtml);
  return parts.length ? `<div class="office-foot">${parts.join(' · ')}</div>` : '';
}

function escapeHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export const OFFICE_CSS = `
.office{display:flex;flex-direction:column;align-items:center;gap:2mm;margin-bottom:8mm}
.office-logo{max-height:22mm;max-width:60mm;object-fit:contain}
.office-name{font-size:13pt;font-weight:700;color:var(--navy)}
.office-tag{font-size:9.5pt;color:var(--muted)}
.office-foot{font-size:9pt;color:var(--muted);text-align:center;width:100%;margin-top:1mm}
`;
