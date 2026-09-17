/**
 * **صفحة السوق** (المرحلة ٥٠) — ما بِيع فعلًا، لا ما يُعرض.
 *
 * كلُّ ما في النظام قبلها **مخزونُك أنت**، و«تقدير السعر» يقيس حيًّا بعقاراتك فيه. وهذه
 * تُدخل السوقَ الحقيقيّ: صفقاتُ وزارة العدل المُفرَغة، بمساحتها وسعرها وتاريخها.
 *
 * **والفرقُ جوهريّ**: سعرُ العرض ما يطلبه المالك، وسعرُ الصفقة ما دُفع فعلًا — ومن يحاجّ
 * مالكًا بأسعار الإعلانات يحاجّه بأمانيّ الناس لا بأفعالهم.
 *
 * **وأيُّ مصدرٍ يعمل اليوم وأيُّه ينتظر يُقال في أوّل الصفحة** لا في حاشية: البوّابات
 * المفتوحة تُنزَّل ملفًّا وتُستورَد الآن بلا اشتراك، والبورصةُ تُعرض ولا تُصدِّر، وسهيل
 * وبسيطة منصّتان تجاريّتان باشتراك. ولا يُخترع رقمٌ في أيّ حال.
 */

import { repo } from '../data/repository.js';
import {
  el, clear, labeled, selectEl, badge, toast, emptyState, confirmDialog, openModal,
} from '../util/dom.js';
import { formatNumber, formatSAR, countOf, formatDate } from '../util/format.js';
import { getLists, typeLabel } from '../data/settings.js';
import { parseCsv } from '../data/exchange.js';
import {
  MARKET_SOURCES, SOURCE_KINDS, sourceByKey, parseMarketRows,
} from '../data/market-import.js';
import { marketIndex, districtStat, vsMarket, marketLine, MIN_SAMPLE } from '../util/market.js';

export async function render(container) {
  clear(container);
  const ctx = {
    container,
    deals: [],
    properties: [],
    lists: null,
    city: '',
    type: '',
    months: 12,
    nodes: {},
  };
  await load(ctx);

  container.append(el('div', { class: 'page-head' },
    el('h1', {}, 'السوق ', ctx.nodes.count = el('span', { class: 'count' })),
    el('div', { class: 'head-actions' },
      el('button', { type: 'button', class: 'btn btn-primary', text: '⬆︎ استورد ملف صفقات', onClick: () => openImport(ctx) }),
      ctx.deals.length
        ? el('button', { type: 'button', class: 'btn btn-ghost', text: 'امسح البيانات', onClick: () => wipe(ctx) })
        : null)));

  container.append(sourcesPanel(), indexPanel(ctx), comparePanel(ctx));
  renderIndex(ctx);
}

async function load(ctx) {
  const [deals, properties, lists] = await Promise.all([
    repo.marketDeals.list(), repo.properties.list(), getLists(),
  ]);
  ctx.deals = deals;
  ctx.properties = properties.filter((p) => p.captureStatus === 'approved');
  ctx.lists = lists;
  const cities = [...new Set(deals.map((d) => d.city).filter(Boolean))];
  ctx.city = cities.includes('الرياض') ? 'الرياض' : (cities[0] || '');
  ctx.cities = cities;
}

/* ===== ١. المصادر: أيُّها يعمل اليوم وأيُّه ينتظر ===== */

function sourcesPanel() {
  return el('details', { class: 'panel' },
    el('summary', {}, el('strong', { text: 'من أين تأتي هذه الأرقام؟' })),
    el('p', { class: 'panel-desc', text: 'سُئلتُ عن أربعة مصادر بأسمائها، وبحثتُ عنها وعن غيرها — وهي ليست سواءً. وهذا حالُ كلٍّ منها بصدق، فما يعمل اليوم يُفرَّق عمّا ينتظر اشتراكًا.' }),
    el('div', { class: 'table-wrap' }, el('table', { class: 'table' },
      el('thead', {}, el('tr', {}, ['المصدر', 'الحال', 'ماذا يعني ذلك'].map((h) => el('th', { text: h })))),
      el('tbody', {}, MARKET_SOURCES.filter((s) => s.key !== 'manual').map((s) => el('tr', {},
        el('td', { class: 'strong' },
          s.site
            ? el('a', { href: s.site, target: '_blank', rel: 'noopener noreferrer', text: s.label })
            : el('span', { text: s.label })),
        el('td', {}, badge(SOURCE_KINDS[s.kind].label, SOURCE_KINDS[s.kind].cls)),
        el('td', {},
          el('span', { class: 'small', text: s.hint }),
          s.env?.length
            ? el('div', { class: 'muted small' }, 'المتغيّرات: ', ...s.env.map((e) => el('code', { class: 'ltr', text: `${e} ` })))
            : null))))),
    ),
    el('p', { class: 'field-hint' },
      el('strong', { text: 'ولا يُسحب شيءٌ آليًّا اليوم: ' }),
      'الاستيرادُ بملفٍّ تُنزّله أنت من البوّابة. والوعدُ بسحبٍ من واجهةٍ غير موثّقةٍ وعدٌ ينكسر مع أوّل تغييرٍ في صفحتهم — وأنت تبني عليه قرارَ سعر.'));
}

/* ===== ٢. مؤشّر الأحياء ===== */

function indexPanel(ctx) {
  ctx.nodes.filters = el('div', { class: 'form-grid' });
  ctx.nodes.index = el('div');
  return el('section', { class: 'panel' },
    el('h2', { text: 'وسيطُ سعر المتر — بحسب الحي' }),
    el('p', { class: 'panel-desc' },
      el('strong', { text: 'الوسيطُ لا المتوسّط: ' }),
      'قصرٌ بثلاثين مليونًا بين عشر شققٍ يرفع المتوسّطَ فيصير رقمًا لا يشبه شيئًا في الحي.'),
    ctx.nodes.filters,
    ctx.nodes.index);
}

function renderIndex(ctx) {
  const wrap = ctx.nodes.index;
  const filters = ctx.nodes.filters;
  clear(filters);
  clear(wrap);
  ctx.nodes.count.textContent = ctx.deals.length ? `(${formatNumber(ctx.deals.length)})` : '';

  if (!ctx.deals.length) {
    wrap.append(emptyState(
      'لا بيانات سوقٍ بعد. نزّل ملفَّ الصفقات من بوّابة البيانات المفتوحة واستورِده — ويصير لك مؤشّرُ حيٍّ من صفقاتٍ حقيقيّة لا من مخزونك.',
      el('button', { type: 'button', class: 'btn btn-primary', text: '⬆︎ استورد ملف صفقات', onClick: () => openImport(ctx) })));
    return;
  }

  const citySel = selectEl({
    options: ctx.cities.map((c) => ({ value: c, label: c })),
    value: ctx.city, placeholder: 'كل المدن',
    onChange: (e) => { ctx.city = e.target.value; renderIndex(ctx); },
  });
  const types = [...new Set(ctx.deals.map((d) => d.type).filter(Boolean))];
  const typeSel = selectEl({
    options: types.map((t) => ({ value: t, label: t })),
    value: ctx.type, placeholder: 'كل الأنواع',
    onChange: (e) => { ctx.type = e.target.value; renderIndex(ctx); },
  });
  const monthsSel = selectEl({
    options: [6, 12, 24, 36].map((m) => ({ value: String(m), label: countOf(m, 'شهر') })),
    value: String(ctx.months),
    onChange: (e) => { ctx.months = Number(e.target.value); renderIndex(ctx); },
  });
  filters.append(
    labeled('المدينة', citySel),
    labeled('نوع العقار', typeSel),
    labeled('المدّة', monthsSel, { hint: 'سوقٌ تحرّك قبل سنتين لا يُقاس به اليوم' }));

  const index = marketIndex(ctx.deals, { city: ctx.city, type: ctx.type, purpose: '', months: ctx.months });
  if (!index.total) {
    wrap.append(el('p', { class: 'muted', text: 'لا صفقةٌ تطابق هذا الفرز في هذه المدّة.' }));
    return;
  }

  wrap.append(el('div', { class: 'stat-strip' },
    stat(formatNumber(index.total), 'صفقة في المدّة'),
    stat(formatNumber(index.districts), 'حيًّا'),
    stat(index.cityMedian ? `${formatSAR(index.cityMedian)}/م²` : '—', 'وسيطُ المدينة')));

  // **ومدى البيانات يُقال دائمًا**: مؤشّرٌ لا يُعرف عمرُه لا يُبنى عليه قرارُ سعر.
  if (index.span.from) {
    wrap.append(el('p', { class: 'muted small', text: `البيانات من ${index.span.from} إلى ${index.span.to}.` }));
  }

  wrap.append(el('div', { class: 'table-wrap' }, el('table', { class: 'table' },
    el('thead', {}, el('tr', {}, ['الحي', 'صفقات', 'وسيط المتر', 'الشريحة الغالبة', 'الاتجاه', 'مقابل المدينة'].map((h) => el('th', { text: h })))),
    el('tbody', {}, index.rows.map((r) => {
      const vsCity = (index.cityMedian && r.median)
        ? Math.round(((r.median - index.cityMedian) / index.cityMedian) * 100) : null;
      return el('tr', {},
        el('td', { class: 'strong' }, r.district,
          // **العيّنةُ الصغيرةُ تُوسَم ولا تُحجب**: رقمٌ ضعيفٌ معلومُ الضعف خيرٌ من فراغ.
          r.enough ? null : badge('عيّنة صغيرة', 'badge-warn', { title: `أقلُّ من ${MIN_SAMPLE} صفقات` })),
        el('td', { class: 'num', text: formatNumber(r.n) }),
        el('td', { class: 'num', text: r.median ? `${formatSAR(r.median)}` : '—' }),
        el('td', { class: 'num', text: r.q1 && r.q3 ? `${formatNumber(r.q1)} – ${formatNumber(r.q3)}` : '—' }),
        el('td', {}, r.trendPct == null
          ? el('span', { class: 'muted', text: '—' })
          : badge(`${r.trendPct > 0 ? '+' : ''}${formatNumber(r.trendPct)}٪`,
            r.trendPct > 0 ? 'badge-ok' : (r.trendPct < 0 ? 'badge-danger' : 'badge-outline'),
            { title: 'نصفُ المدّة الأخير مقابل نصفها الأوّل' })),
        el('td', {}, vsCity == null
          ? el('span', { class: 'muted', text: '—' })
          : el('span', { class: 'num', text: `${vsCity > 0 ? '+' : ''}${formatNumber(vsCity)}٪` })));
    })))));

  wrap.append(el('p', { class: 'field-hint', text: 'الاتّجاهُ يقارن نصفَي المدّة، ولا يُحسب إلا إذا كان في كلّ نصفٍ ثلاثُ صفقاتٍ فأكثر — ونصفٌ بصفقةٍ واحدةٍ يقلب الرقم رأسًا على عقب.' }));
}

function stat(value, label) {
  return el('div', { class: 'stat-chip' },
    el('div', { class: 'stat-num', text: value }),
    el('div', { class: 'stat-label', text: label }));
}

/* ===== ٣. مخزونك مقابل السوق ===== */

function comparePanel(ctx) {
  const body = el('div');
  if (!ctx.deals.length) {
    body.append(el('p', { class: 'muted small', text: 'تظهر المقارنةُ متى استوردتَ صفقاتِ السوق.' }));
  } else {
    const rows = ctx.properties
      .map((p) => ({ property: p, cmp: vsMarket(p, ctx.deals, { months: ctx.months }) }))
      .filter((r) => r.cmp)
      // **الأبعدُ عن السوق أوّلًا**: هو الذي يطول تسويقُه، وهو أوّلُ حديثٍ مع مالكه.
      .sort((a, b) => Math.abs(b.cmp.gapPct) - Math.abs(a.cmp.gapPct));
    if (!rows.length) {
      body.append(el('p', { class: 'muted small', text: 'لا عقارَ عندك في حيٍّ فيه صفقاتٌ مستوردة — أو لا مساحةَ وسعرَ له.' }));
    } else {
      body.append(el('div', { class: 'table-wrap' }, el('table', { class: 'table' },
        el('thead', {}, el('tr', {}, ['العقار', 'سعر مترك', 'وسيط الحي', 'الفرق', 'صفقات الحي', ''].map((h) => el('th', { text: h })))),
        el('tbody', {}, rows.slice(0, 40).map(({ property, cmp }) => el('tr', {},
          el('td', {}, el('a', {
            href: `#/properties/${property.id}`,
            text: `${typeLabel(ctx.lists, property.type)} — ${[property.district, property.city].filter(Boolean).join('، ')}`,
          })),
          el('td', { class: 'num', text: formatSAR(cmp.askPerM) }),
          el('td', { class: 'num', text: formatSAR(cmp.stat.median) }),
          el('td', {}, badge(`${cmp.gapPct > 0 ? '+' : ''}${formatNumber(cmp.gapPct)}٪`,
            cmp.verdict === 'above' ? 'badge-danger' : (cmp.verdict === 'below' ? 'badge-accent' : 'badge-ok'))),
          el('td', { class: 'num' }, formatNumber(cmp.stat.n),
            cmp.stat.enough ? null : badge('صغيرة', 'badge-warn')),
          el('td', {}, el('button', {
            type: 'button', class: 'btn btn-sm', text: 'الجملة للمالك',
            title: 'انسخ جملةً من أرقامٍ لا من رأي',
            onClick: () => ownerSentence(property, cmp),
          }))))))));
    }
  }
  return el('section', { class: 'panel' },
    el('h2', { text: 'مخزونك مقابل السوق' }),
    el('p', { class: 'panel-desc' },
      'رأيُك أنّ السعر مرتفعٌ جدالٌ بين رأيين. و',
      el('strong', { text: '«وسيطُ ما بِيع فعلًا في حيّه أقلُّ بـ١٨٪»' }),
      ' شهادةُ سوقٍ لا تُردّ.'),
    body);
}

/** جملةٌ تُنسخ وتُقال — من أرقامٍ لا من رأي. */
function ownerSentence(property, cmp) {
  const text = marketLine(cmp, { formatSAR, countOf });
  const area = el('textarea', { class: 'input', rows: 4, value: text, 'aria-label': 'الجملة للمالك' });
  const modal = openModal({
    title: `${property.district || property.city} — الجملة للمالك`,
    body: el('div', {},
      area,
      el('p', { class: 'field-hint', text: 'وتُقال العيّنةُ معها: رقمٌ من ثلاث صفقاتٍ يُقدَّم على أنّه سوقٌ يُردّ عليك بحقّ.' })),
    footer: [
      el('button', {
        type: 'button', class: 'btn btn-primary', text: 'انسخ',
        onClick: async () => {
          try { await navigator.clipboard.writeText(area.value); toast('نُسخت', 'success'); }
          catch (_) { area.select(); toast('اضغط نسخ من لوحة المفاتيح', 'info'); }
        },
      }),
      el('span', { class: 'spacer' }),
      el('button', { type: 'button', class: 'btn btn-ghost', text: 'إغلاق', onClick: () => modal.close() }),
    ],
  });
}

/* ===== ٤. الاستيراد ===== */

function openImport(ctx) {
  const sourceSel = selectEl({
    options: MARKET_SOURCES.filter((s) => s.kind !== 'paid').map((s) => ({ value: s.key, label: s.label })),
    value: 'moj',
  });
  const purposeSel = selectEl({
    options: [{ value: 'sale', label: 'بيع' }, { value: 'rent', label: 'إيجار' }],
    value: 'sale',
  });
  const cityInput = el('input', { class: 'input', type: 'text', placeholder: 'الرياض', value: 'الرياض' });
  const file = el('input', { class: 'input', type: 'file', accept: '.csv,text/csv', 'aria-label': 'ملف الصفقات' });
  const hint = el('p', { class: 'muted small' });
  const preview = el('div');
  let parsed = null;

  const showHint = () => { hint.textContent = sourceByKey(sourceSel.value)?.hint || ''; };
  sourceSel.addEventListener('change', showHint);
  showHint();

  file.addEventListener('change', async () => {
    clear(preview);
    parsed = null;
    const f = file.files?.[0];
    if (!f) return;
    const text = await f.text();
    const csv = parseCsv(text);
    if (!csv.headers.length) { preview.append(el('p', { class: 'form-errors', text: 'الملفّ فارغٌ أو ليس CSV.' })); return; }
    // **`parseCsv` تُعيد كلَّ صفٍّ كائنًا بمفاتيحِ ترويسته**، و`parseMarketRows` تقرأ
    // بمواضع الأعمدة (لأنّ `mapHeaders` تُعيد مواضع). فيُحوَّل هنا في سطرٍ واحد بدل أن
    // يُغيَّر عقدُ الوحدتين — وكلتاهما مُختبَرةٌ على شكلها.
    const rows = csv.rows.map((r) => csv.headers.map((h) => r[h] ?? ''));
    parsed = parseMarketRows({
      headers: csv.headers, rows,
      source: sourceSel.value, purpose: purposeSel.value, defaultCity: cityInput.value.trim(),
    });
    preview.append(
      el('p', {}, el('strong', { text: `${countOf(parsed.rows.length, 'صفقة')} تُقرأ` }),
        parsed.skipped.length ? ` · ${countOf(parsed.skipped.length, 'صفّ')} يُتخطّى` : ''),
      // **وما يُتخطّى يُقال مع سببه** لا يُسقَط صامتًا: ملفٌّ استُورد نصفُه دون أن يُقال
      // يجعلك تبني على بياناتٍ ناقصةٍ وأنت تظنّها كاملة.
      parsed.skipped.length
        ? el('details', {},
          el('summary', { text: 'لماذا تُخطّي تلك الصفوف؟' }),
          el('ul', { class: 'simple-list' }, [...new Map(parsed.skipped.map((s) => [s.why, s])).values()]
            .map((s) => el('li', { text: `${s.why} — أوّلُها السطر ${s.line}` }))))
        : null,
      parsed.unmatched.length
        ? el('p', { class: 'muted small', text: `أعمدةٌ لم تُستعمل: ${parsed.unmatched.slice(0, 8).join('، ')}` })
        : null,
      parsed.rows.length
        ? el('div', { class: 'table-wrap' }, el('table', { class: 'table' },
          el('thead', {}, el('tr', {}, ['التاريخ', 'المدينة', 'الحي', 'النوع', 'المساحة', 'السعر'].map((h) => el('th', { text: h })))),
          el('tbody', {}, parsed.rows.slice(0, 5).map((r) => el('tr', {},
            el('td', { text: r.date }),
            el('td', { text: r.city }),
            el('td', { text: r.district || '—' }),
            el('td', { text: r.type || '—' }),
            el('td', { class: 'num', text: r.area == null ? '—' : formatNumber(r.area) }),
            el('td', { class: 'num', text: r.price == null ? '—' : formatSAR(r.price) }))))))
        : null);
  });

  const importBtn = el('button', {
    type: 'button', class: 'btn btn-primary', text: 'استورد',
    onClick: async () => {
      if (!parsed?.rows.length) { toast('اختر ملفًّا فيه صفقاتٌ تُقرأ', 'error'); return; }
      importBtn.disabled = true;
      const added = await importRows(ctx, parsed.rows, importBtn);
      importBtn.disabled = false;
      modal.close();
      toast(`أُضيفت ${countOf(added.added, 'صفقة')}${added.dupes ? ` · وتُخطّيت ${countOf(added.dupes, 'مكرَّرة')}` : ''}`, 'success', 6000);
      render(ctx.container);
    },
  });

  const modal = openModal({
    title: 'استيراد صفقات السوق',
    size: 'wide',
    body: el('div', {},
      el('div', { class: 'form-grid' },
        labeled('المصدر', sourceSel),
        labeled('الغرض', purposeSel, { hint: 'بيعٌ أم إيجار — الملفّ لا يقوله عادةً' }),
        labeled('المدينة إن خلا الملفّ منها', cityInput)),
      hint,
      labeled('الملفّ (CSV)', file),
      preview),
    footer: [importBtn, el('span', { class: 'spacer' }),
      el('button', { type: 'button', class: 'btn btn-ghost', text: 'إلغاء', onClick: () => modal.close() })],
  });
}

/**
 * يحفظ الصفوف — **ويتخطّى ما سبق حفظُه ببصمته**.
 *
 * والبوّابات تُصدِّر مدًى يشمل ما سبق، **فالاستيرادُ مرّتين هو الحالةُ العاديّة لا الشاذّة**.
 * وبلا كشفِ تكرارٍ يتضاعف العدُّ فيتضاعف وزنُ الشهر في الوسيط — وهو أخطرُ من مجرّد تكرار.
 */
async function importRows(ctx, rows, button) {
  const known = new Set(ctx.deals.map((d) => d.fingerprint).filter(Boolean));
  let added = 0;
  let dupes = 0;
  const label = button.textContent;
  for (const [i, row] of rows.entries()) {
    const fp = [String(row.date).slice(0, 10), row.city, row.district, row.type, row.area ?? '', row.price ?? ''].join('|');
    if (known.has(fp)) { dupes += 1; continue; }
    known.add(fp);
    try { await repo.marketDeals.create(row); added += 1; }
    catch (_) { dupes += 1; } // صفٌّ رفضه التحقّق — يُعدّ متخطًّى ولا يوقف الملفّ
    if (i % 200 === 0) button.textContent = `يستورد ${formatNumber(i)}/${formatNumber(rows.length)}…`;
  }
  button.textContent = label;
  return { added, dupes };
}

async function wipe(ctx) {
  const go = await confirmDialog({
    title: 'مسح بيانات السوق',
    message: `تُحذف ${countOf(ctx.deals.length, 'صفقة')} مستوردة. ولا يمسّ هذا مخزونك ولا صفقاتك أنت — بياناتُ السوق تُستورَد من جديد متى شئت.`,
    confirmText: 'امسحها', danger: true,
  });
  if (!go) return;
  for (const d of ctx.deals) await repo.marketDeals.remove(d.id);
  toast('مُسحت بيانات السوق', 'success');
  render(ctx.container);
}
