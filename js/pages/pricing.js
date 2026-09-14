// صفحة «تقدير السعر» (المرحلة ١٤): بكم أعرضه؟
//
// السؤال الذي يتكرر عليك كل أسبوع: جاءك مالك بعقار بلا سعر، أو أردت أن تعرف إن كان
// سعر المطلوب معقولًا قبل أن تضيّع شهرًا في تسويقه. هذه الصفحة تجيب من بياناتك أنت:
// وسيط سعر المتر في حيّه ونوعه وغرضه × مساحته، ومعه نطاق الربيعين والعقارات المقارَنة.
//
// **ليست تثمينًا معتمدًا** ولا تدّعي ذلك: لا ترى عمر المبنى ولا واجهته ولا تشطيبه.
// ولذلك تُظهر دائمًا حجم العيّنة ومصدرها، وتصمت إن قلّت العيّنة بدل أن تخترع رقمًا.

import { repo } from '../data/repository.js';
import { getLists, typeLabel } from '../data/settings.js';
import { priceSamples, estimatePrice, purposeKey } from '../util/price-stats.js';
import { el, clear, labeled, selectEl, badge, emptyState, toast } from '../util/dom.js';
import { formatSAR, formatArea, formatNumber, formatDate } from '../util/format.js';

const MIN_SAMPLE = 3;

const SOURCE_LABELS = { inventory: 'مخزونك', external: 'السوق', deal: 'صفقة منجزة' };
const CONFIDENCE = {
  high: { label: 'ثقة جيدة', cls: 'badge-ok' },
  medium: { label: 'ثقة متوسطة', cls: 'badge-warn' },
  low: { label: 'ثقة ضعيفة', cls: 'badge-danger' },
};

export async function render(container) {
  const ctx = { container, nodes: {}, target: null };
  await loadData(ctx);
  build(ctx);
}

async function loadData(ctx) {
  const [properties, externals, deals, lists] = await Promise.all([
    repo.properties.list(), repo.externalListings.list(), repo.deals.list(), getLists(),
  ]);
  ctx.properties = properties;
  ctx.lists = lists;
  ctx.samples = priceSamples({ properties, externals, deals });
  ctx.target = ctx.target || {
    city: lists.cities[0] || 'الرياض', district: '', type: lists.propertyTypes[0]?.key || '', purpose: 'sale', area: '',
  };
}

function build(ctx) {
  clear(ctx.container);
  const t = ctx.target;

  const purposeSelect = selectEl({
    options: [{ value: 'sale', label: 'بيع' }, { value: 'rent', label: 'إيجار' }],
    value: t.purpose, onChange: (e) => { t.purpose = e.target.value; draw(ctx); },
  });
  const citySelect = selectEl({
    options: ctx.lists.cities.map((c) => ({ value: c, label: c })),
    value: t.city, onChange: (e) => { t.city = e.target.value; t.district = ''; build(ctx); },
  });
  const districtSelect = selectEl({
    options: (ctx.lists.districtsByCity[t.city] || []).map((d) => ({ value: d, label: d })),
    value: t.district, placeholder: 'كل المدينة', onChange: (e) => { t.district = e.target.value; draw(ctx); },
  });
  const typeSelect = selectEl({
    options: ctx.lists.propertyTypes.map((p) => ({ value: p.key, label: p.label })),
    value: t.type, placeholder: 'كل الأنواع', onChange: (e) => { t.type = e.target.value; draw(ctx); },
  });
  const areaInput = el('input', {
    class: 'input', type: 'number', min: '1', step: '1', value: t.area ?? '', placeholder: 'مثلًا ٤٠٠',
    onInput: (e) => { t.area = e.target.value; draw(ctx); },
  });

  // ملء سريع من عقار عندك: العقار بلا سعر أولًا، فهو صاحب السؤال عادةً.
  const fillable = [...ctx.properties]
    .filter((p) => p.captureStatus === 'approved' && Number(p.area) > 0)
    .sort((a, b) => (a.price == null ? 0 : 1) - (b.price == null ? 0 : 1));
  const fillSelect = selectEl({
    options: fillable.map((p) => ({
      value: p.id,
      label: `${typeLabel(ctx.lists, p.type)} — ${p.district || p.city} — ${formatArea(p.area)}${p.price == null ? ' — بلا سعر' : ''}`,
    })),
    placeholder: 'أو املأ من عقار عندك…',
    value: '',
    onChange: (e) => {
      const p = fillable.find((x) => x.id === e.target.value);
      if (!p) return;
      ctx.target = {
        city: p.city, district: p.district || '', type: p.type || '', purpose: purposeKey(p),
        area: p.area, excludeId: p.id, askingPrice: p.price,
      };
      build(ctx);
    },
  });

  ctx.container.append(
    el('div', { class: 'page-head' },
      el('h1', {}, 'تقدير السعر — بكم أعرضه؟'),
      el('div', { class: 'head-actions' }, fillSelect)),
    el('div', { class: 'notice' },
      el('strong', { text: 'ليس تثمينًا معتمدًا. ' }),
      'رقمٌ من بياناتك وحدها: مخزونك المعتمد، والعروض الخارجية النشطة، وصفقاتك المنجزة. ',
      'لا يرى عمر المبنى ولا الشارع ولا التشطيب، ولا يُقدِّر أصلًا إن قلّت العيّنة عن ',
      `${formatNumber(MIN_SAMPLE)} سجلات — والقرار قرارك.`),
    el('div', { class: 'panel' }, el('div', { class: 'form-grid' },
      labeled('الغرض', purposeSelect),
      labeled('المدينة', citySelect),
      labeled('الحي', districtSelect),
      labeled('نوع العقار', typeSelect),
      labeled('المساحة (م²)', areaInput, { required: true }))),
  );

  ctx.nodes.result = el('div', { style: { marginTop: '18px' } });
  ctx.container.append(ctx.nodes.result);
  draw(ctx);
}

function draw(ctx) {
  const area = ctx.nodes.result;
  clear(area);
  const t = ctx.target;
  const result = estimatePrice({ ...t, area: Number(t.area) }, ctx.samples, { minSample: MIN_SAMPLE });

  if (!result.ok) {
    area.append(result.reason === 'area'
      ? emptyState('اكتب المساحة بالمتر المربع ليُحسب التقدير.')
      : emptyState(`لا عيّنة كافية: ${formatNumber(result.count)} سجل فقط بهذه المواصفات، والحد ${formatNumber(MIN_SAMPLE)}. `
        + 'أضف عروضًا خارجية من هذا الحي أو اعتمد عقارات مخزونك — الصمت هنا أصدق من رقم مخترَع.'));
    if (result.comparables.length) area.append(comparablesTable(ctx, result.comparables, 'ما وجدناه رغم قلّته'));
    return;
  }

  const conf = CONFIDENCE[result.confidence];
  const sources = Object.entries(result.sources)
    .filter(([, n]) => n > 0).map(([k, n]) => `${formatNumber(n)} ${SOURCE_LABELS[k]}`).join(' · ');

  area.append(el('div', { class: 'panel estimate-card' },
    el('div', { class: 'estimate-head' },
      el('h2', { text: result.purpose === 'rent' ? 'الإيجار المتوقَّع' : 'السعر المتوقَّع' }),
      badge(conf.label, conf.cls)),
    el('div', { class: 'estimate-range' },
      el('span', { class: 'estimate-main', text: formatSAR(Math.round(result.estimate)) })),
    el('div', { class: 'muted', text: `النطاق المعقول: ${formatSAR(Math.round(result.low))} — ${formatSAR(Math.round(result.high))}` }),
    el('div', { class: 'estimate-facts' },
      fact(`${formatNumber(Math.round(result.ppm.median))} ريال/م²`, 'وسيط سعر المتر'),
      fact(formatNumber(result.count), 'حجم العيّنة'),
      fact(result.basis === 'district' ? (t.district || 'الحي') : 'كل المدينة', 'أساس المقارنة')),
    el('p', { class: 'muted small', text: `المصدر: ${sources || '—'}.` }),
    result.basis === 'city'
      ? el('p', { class: 'warn-text', text: 'لم تكفِ عيّنة الحي فتراجع الحساب إلى مستوى المدينة — والفرق بين حي وحي كبير، فاقرأ الرقم بحذر.' })
      : null,
    result.spread > 0.6
      ? el('p', { class: 'warn-text', text: 'العيّنة متفرّقة جدًا (فرق واسع بين الأرخص والأغلى) — النطاق أصدق من الرقم الواحد هنا.' })
      : null,
    askingNote(ctx, result),
    el('div', { class: 'head-actions', style: { marginTop: '12px' } },
      el('button', {
        type: 'button', class: 'btn btn-ghost btn-sm', text: 'نسخ الملخّص',
        onClick: () => copySummary(ctx, result),
      }))));

  area.append(comparablesTable(ctx, result.comparables, 'العقارات المقارَنة — من أين جاء الرقم'));
}

function fact(value, label) {
  return el('div', { class: 'stat-chip' },
    el('div', { class: 'stat-num', text: value }),
    el('div', { class: 'stat-label', text: label }));
}

/** إن جاء التقدير لعقار عندك له سعر مطلوب: أين يقع سعره من التقدير؟ */
function askingNote(ctx, result) {
  const asking = Number(ctx.target.askingPrice);
  if (!Number.isFinite(asking) || asking <= 0) return null;
  const diffPct = Math.round(((asking - result.estimate) / result.estimate) * 100);
  const text = diffPct > 8 ? `السعر المطلوب (${formatSAR(asking)}) أعلى من التقدير بـ${diffPct}٪ — متوقَّع أن يطول تسويقه.`
    : diffPct < -8 ? `السعر المطلوب (${formatSAR(asking)}) أقل من التقدير بـ${Math.abs(diffPct)}٪ — فرصة، وراجع مع المالك.`
      : `السعر المطلوب (${formatSAR(asking)}) قريب من التقدير.`;
  return el('p', { class: diffPct > 8 || diffPct < -8 ? 'warn-text' : 'muted small', text });
}

function comparablesTable(ctx, rows, title) {
  if (!rows.length) return el('div');
  return el('div', { style: { marginTop: '18px' } },
    el('h2', { class: 'section-title', text: title }),
    el('div', { class: 'table-wrap' }, el('table', { class: 'table' },
      el('thead', {}, el('tr', {}, ['المصدر', 'الحي', 'النوع', 'المساحة', 'السعر', 'ريال/م²', 'التاريخ'].map((t) => el('th', { text: t })))),
      el('tbody', {}, rows.map((s) => el('tr', {},
        el('td', {}, badge(SOURCE_LABELS[s.source] || s.source, s.source === 'deal' ? 'badge-ok' : 'badge-outline')),
        el('td', { text: s.district || '—' }),
        el('td', { text: typeLabel(ctx.lists, s.type) }),
        el('td', { class: 'num', text: formatArea(s.area) }),
        el('td', { class: 'num', text: formatSAR(s.price) }),
        el('td', { class: 'num strong', text: formatNumber(Math.round(s.ppm)) }),
        el('td', { class: 'small muted', text: s.at ? formatDate(s.at) : '—' })))))),
    el('p', { class: 'muted small', text: 'الصفقات المنجزة تدخل بسعرها النهائي لا المطلوب، والبيع لا يُخلط بالإيجار.' }));
}

/** ملخّص جاهز للإرسال في واتساب — بالعيّنة ومصدرها، فلا يُنقل الرقم مجرَّدًا عن سنده. */
export function summaryText(ctx, result) {
  const t = ctx.target;
  return [
    `تقدير ${result.purpose === 'rent' ? 'الإيجار' : 'السعر'}: ${t.district || t.city} — ${typeLabel(ctx.lists, t.type)} — ${formatArea(result.area)}`,
    `التقدير: ${formatSAR(Math.round(result.estimate))}`,
    `النطاق: ${formatSAR(Math.round(result.low))} — ${formatSAR(Math.round(result.high))}`,
    `وسيط المتر: ${formatNumber(Math.round(result.ppm.median))} ريال/م² (عيّنة ${formatNumber(result.count)})`,
    'تقدير استرشادي من عروض وصفقات الحي، وليس تثمينًا معتمدًا.',
  ].join('\n');
}

async function copySummary(ctx, result) {
  const text = summaryText(ctx, result);
  try {
    await navigator.clipboard.writeText(text);
    toast('نُسخ الملخّص', 'success');
  } catch {
    toast('تعذّر النسخ — انسخه يدويًا', 'error');
  }
}
