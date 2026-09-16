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
import { el, clear, labeled, selectEl, checkbox, badge, emptyState, toast } from '../util/dom.js';
import { formatSAR, formatArea, formatNumber, formatDate, countOf } from '../util/format.js';
import { monthlyInstallment, rentalYield, closingCosts } from '../util/finance.js';

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
  /* **تصفيةٌ فوق القائمة لا بدلًا منها** (المرحلة ٤٣): كانت عقاراتُك كلُّها في منسدلةٍ
     واحدةٍ بلا بحث — تكفي خمسةَ عشرَ ولا تكفي مئةً، والمئاتُ هي الهدف المعلَن. والقائمةُ
     تبقى قائمةً بقيمِها (فالمعرّف لا يضيع ولا يتبدّل تعاملُ بقيّة الصفحة معها)، ويُضاف
     فوقها حقلٌ يحذف منها ما لا يوافق ما تكتب. */
  const fillLabel = (p) => `${typeLabel(ctx.lists, p.type)} — ${p.district || p.city} — ${formatArea(p.area)}${p.price == null ? ' — بلا سعر' : ''}`;
  const fillSelectEl = selectEl({
    options: fillable.map((p) => ({ value: p.id, label: fillLabel(p) })),
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
  const fillFilter = el('input', {
    class: 'input', type: 'search', 'aria-label': 'تصفية قائمة العقارات',
    placeholder: `صفِّ القائمة… (${formatNumber(fillable.length)})`,
  });
  fillFilter.addEventListener('input', () => {
    const q = fillFilter.value.trim().toLowerCase();
    for (const opt of fillSelectEl.options) {
      if (!opt.value) continue; // سطرُ العنوان يبقى دائمًا
      opt.hidden = !!q && !opt.textContent.toLowerCase().includes(q);
    }
  });
  const fillSelect = el('div', { class: 'row', style: { gap: '6px' } }, fillFilter, fillSelectEl);

  ctx.container.append(
    el('div', { class: 'page-head' },
      el('h1', {}, 'تقدير السعر — بكم أعرضه؟'),
      el('div', { class: 'head-actions' }, fillSelect)),
    el('div', { class: 'notice' },
      el('strong', { text: 'ليس تثمينًا معتمدًا. ' }),
      'رقمٌ من بياناتك وحدها: مخزونك المعتمد، والعروض الخارجية النشطة، وصفقاتك المنجزة. ',
      'لا يرى عمر المبنى ولا الشارع ولا التشطيب، ولا يُقدِّر أصلًا إن قلّت العيّنة عن ',
      `${countOf(MIN_SAMPLE, 'سجل')} — والقرار قرارك.`),
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
      : emptyState(`لا عيّنة كافية: ${countOf(result.count, 'سجل')} فقط بهذه المواصفات، والحد ${formatNumber(MIN_SAMPLE)}. `
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

  area.append(installmentPanel(Math.round(result.estimate)));
  area.append(closingPanel(Math.round(result.estimate)));
  area.append(yieldPanel(Math.round(result.estimate)));
  area.append(comparablesTable(ctx, result.comparables, 'العقارات المقارَنة — من أين جاء الرقم'));
}

/**
 * «كم القسط؟» (المرحلة ٢٠) — السؤال الذي يلي السعر مباشرة عند كل مشترٍ.
 * استرشادي لا عرض تمويل، وهذا مكتوب تحته: النِّسب تختلف بين البنوك وبحسب ملف العميل.
 */
function installmentPanel(defaultPrice) {
  const priceInput = el('input', { class: 'input', type: 'number', min: '0', step: '1000', value: defaultPrice });
  const downInput = el('input', { class: 'input', type: 'number', min: '0', step: '1000', value: Math.round(defaultPrice * 0.1) });
  const rateInput = el('input', { class: 'input', type: 'number', min: '0', max: '20', step: '0.25', value: 5 });
  const yearsInput = el('input', { class: 'input', type: 'number', min: '1', max: '30', step: '1', value: 20 });
  const out = el('div', { class: 'stat-strip', style: { marginTop: '12px' } });

  const recalc = () => {
    clear(out);
    const r = monthlyInstallment({
      price: Number(priceInput.value), downPayment: Number(downInput.value),
      annualRate: Number(rateInput.value), years: Number(yearsInput.value),
    });
    if (!r) { out.append(el('p', { class: 'muted small', text: 'اكتب سعرًا ومدة، ودفعةً أولى أقلّ من السعر.' })); return; }
    out.append(
      fact(formatSAR(Math.round(r.monthly)), 'القسط الشهري'),
      fact(formatSAR(Math.round(r.principal)), 'مبلغ التمويل'),
      fact(formatSAR(Math.round(r.cost)), 'كلفة التمويل على المدة'));
  };
  for (const input of [priceInput, downInput, rateInput, yearsInput]) input.addEventListener('input', recalc);

  const panel = el('div', { class: 'panel', style: { marginTop: '18px' } },
    el('h2', { class: 'section-title', text: 'وكم قسطه؟' }),
    el('div', { class: 'form-grid' },
      labeled('السعر', priceInput),
      labeled('الدفعة الأولى', downInput),
      labeled('نسبة الهامش السنوية (٪)', rateInput),
      labeled('المدة (سنوات)', yearsInput)),
    out,
    el('p', { class: 'muted small', text: 'حساب استرشادي بمعادلة القسط الثابت — ليس عرض تمويل. لا يشمل الرسوم الإدارية ولا التأمين ولا الدعم السكني، والنِّسب تختلف بين البنوك وبحسب ملف العميل.' }));
  recalc();
  return panel;
}

/**
 * «وكم أحتاج نقدًا؟» (المرحلة ٤٥) — السؤال الذي يلي القسط، وكان بلا جواب.
 *
 * والقسطُ وحده يخدع: مشترٍ حسب قسطه فوجده يناسبه، ثم جاء يوم الإفراغ فوجد فوق دفعته
 * الأولى رسومَ تصرّفٍ وعمولةً وضريبتَها ورسومَ بنك — فانكسرت الصفقة في آخرها. وهذه
 * تضع الرقم أمامه **من أوّلها**، وبندًا بندًا كي يراجعه لا كي يصدّقه.
 */
function closingPanel(defaultPrice) {
  const priceInput = el('input', { class: 'input', type: 'number', min: '0', step: '1000', value: defaultPrice });
  const downInput = el('input', { class: 'input', type: 'number', min: '0', max: '100', step: '1', value: 10 });
  const rettInput = el('input', { class: 'input', type: 'number', min: '0', max: '20', step: '0.5', value: 5 });
  const commissionInput = el('input', { class: 'input', type: 'number', min: '0', max: '20', step: '0.25', value: 2.5 });
  const vatInput = el('input', { class: 'input', type: 'number', min: '0', max: '30', step: '1', value: 15 });
  const bankInput = el('input', { class: 'input', type: 'number', min: '0', max: '10', step: '0.25', value: 1 });
  const otherInput = el('input', { class: 'input', type: 'number', min: '0', step: '500', value: 0 });
  const exemptWrap = checkbox('معفًى من رسوم التصرفات', {});
  const exemptBox = exemptWrap.querySelector('input');
  const out = el('div', {});

  const recalc = () => {
    clear(out);
    const r = closingCosts({
      price: Number(priceInput.value),
      downPaymentRate: Number(downInput.value),
      rettRate: Number(rettInput.value),
      rettExempt: exemptBox.checked,
      commissionRate: Number(commissionInput.value),
      vatRate: Number(vatInput.value),
      bankFeeRate: Number(bankInput.value),
      otherFees: Number(otherInput.value),
    });
    if (!r) { out.append(el('p', { class: 'muted small', text: 'اكتب سعرًا أوّلًا.' })); return; }
    out.append(
      el('div', { class: 'stat-strip' },
        fact(formatSAR(Math.round(r.cashNeeded)), 'المطلوب نقدًا'),
        fact(formatSAR(Math.round(r.financed)), 'ما يموّله البنك'),
        fact(formatSAR(Math.round(r.cashNeeded - r.down)), 'فوق الدفعة الأولى')),
      el('div', { class: 'table-wrap' }, el('table', { class: 'table' },
        el('tbody', {}, [
          ...r.lines.map((l) => el('tr', {},
            el('td', { text: l.label }),
            el('td', { class: 'num', text: formatSAR(Math.round(l.amount)) }))),
          el('tr', {},
            el('td', {}, el('span', { class: 'strong', text: 'المجموع النقدي' })),
            el('td', { class: 'num' }, el('span', { class: 'strong', text: formatSAR(Math.round(r.cashNeeded)) }))),
        ]))));
  };
  const inputs = [priceInput, downInput, rettInput, commissionInput, vatInput, bankInput, otherInput];
  for (const input of inputs) input.addEventListener('input', recalc);
  exemptBox.addEventListener('change', recalc);

  const panel = el('div', { class: 'panel', style: { marginTop: '18px' } },
    el('h2', { class: 'section-title', text: 'وكم يحتاج نقدًا يوم الإفراغ؟' }),
    el('div', { class: 'form-grid' },
      labeled('السعر', priceInput),
      labeled('الدفعة الأولى (٪)', downInput),
      labeled('رسوم التصرفات العقارية (٪)', rettInput, { hint: 'الأساس ٥٪ من قيمة التصرّف' }),
      labeled('عمولة الوساطة (٪)', commissionInput),
      labeled('ضريبة القيمة المضافة (٪)', vatInput, { hint: 'على العمولة لا على العقار' }),
      labeled('رسوم البنك الإدارية (٪)', bankInput, { hint: 'من مبلغ التمويل، وبسقفٍ 5,000' }),
      labeled('رسومٌ أخرى (ريال)', otherInput, { hint: 'تقييم، إفراغ، نقل عدّاد…' }),
      el('div', { class: 'field' },
        el('span', { class: 'field-label', text: 'الإعفاء' }),
        exemptWrap)),
    out,
    el('p', { class: 'muted small', text: 'حساب استرشادي بالنِّسب التي تكتبها أنت — ليس فتوى ضريبية ولا عرض تمويل.'
      + ' رسوم التصرفات العقارية لها إعفاءات (منها تملّك المواطن مسكنه الأول ضمن سقفٍ محدَّد)، فإن كانت حالته منها فعلِّم الإعفاء.'
      + ' ورسوم البنك وسقفها يختلفان بين بنكٍ وآخر — راجعهما قبل أن تعد عميلك برقم.' }));
  recalc();
  return panel;
}

/**
 * «وكم يعود عليّ؟» (المرحلة ٣١) — سؤال المستثمر، ولا أداة له كانت.
 * استرشادي كأخيه: لا تغيّر قيمة، ولا تمويل، ولا ضريبة، ولا فترات شغور غير ما تُدخله.
 */
function yieldPanel(defaultPrice) {
  const priceInput = el('input', { class: 'input', type: 'number', min: '0', step: '1000', value: defaultPrice });
  const rentInput = el('input', { class: 'input', type: 'number', min: '0', step: '1000', value: Math.round(defaultPrice * 0.06) });
  const costsInput = el('input', { class: 'input', type: 'number', min: '0', step: '500', value: 0 });
  const occInput = el('input', { class: 'input', type: 'number', min: '0', max: '100', step: '5', value: 100 });
  const out = el('div', { class: 'stat-strip', style: { marginTop: '12px' } });

  const recalc = () => {
    clear(out);
    const r = rentalYield({
      price: Number(priceInput.value), annualRent: Number(rentInput.value),
      annualCosts: Number(costsInput.value), occupancy: Number(occInput.value),
    });
    if (!r) { out.append(el('p', { class: 'muted small', text: 'اكتب سعرًا وإيجارًا سنويًا أكبر من صفر.' })); return; }
    out.append(
      fact(`${formatNumber(Math.round(r.net * 100) / 100)}٪`, 'العائد بعد المصاريف'),
      fact(`${formatNumber(Math.round(r.gross * 100) / 100)}٪`, 'العائد الإجمالي'),
      fact(formatSAR(Math.round(r.monthly)), 'الدخل الشهري الصافي'),
      fact(r.payback == null ? '—' : `${countOf(Math.round(r.payback), 'سنة')}`, 'مدّة الاسترداد'));
  };
  for (const input of [priceInput, rentInput, costsInput, occInput]) input.addEventListener('input', recalc);

  const panel = el('div', { class: 'panel', style: { marginTop: '18px' } },
    el('h2', { class: 'section-title', text: 'وكم يعود عليّ؟' }),
    el('div', { class: 'form-grid' },
      labeled('السعر', priceInput),
      labeled('الإيجار السنوي', rentInput),
      labeled('المصاريف السنوية', costsInput, { hint: 'صيانة وإدارة ورسوم' }),
      labeled('نسبة الإشغال (٪)', occInput, { hint: 'مئة = مؤجَّر طول السنة' })),
    out,
    el('p', { class: 'muted small', text: 'حساب استرشادي: لا يشمل تغيّر قيمة العقار ولا كلفة التمويل ولا الضريبة، ومدّة الاسترداد بالدخل الحالي وحده. والإيجار المقترح افتراض أوّليّ عدّله بما تعرفه عن الحي.' }));
  recalc();
  return panel;
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
