// صفحة النشر العام (المرحلة ٩): تختار العقارات التي توافق صراحة على عرضها للعملاء،
// ثم تدفعها بضغطة واحدة إلى الصفحة العامة `/offers/` عبر دالة Netlify.
//
// **قيد معلن للمستخدم في الصفحة نفسها:** هذه **لقطة لحظة الضغط، لا بثّ حيّ** — بياناتك في
// متصفح جهازك، فلا شيء يتحدث في السحابة تلقائيًا. وأي تعديل بعد النشر يحتاج ضغطة نشر جديدة.
//
// ما يخرج من الجهاز: الحقول التسويقية فقط للعقارات المختارة (نوع، حي، مدينة، مساحة، سعر إن
// اخترت إظهاره، ملاحظات، صور — **الصور وحدها دون المقاطع**، المرحلة ٣٨). **لا يخرج أبدًا:** اسم المالك وجواله، ملاحظاتك الداخلية عنه،
// الإحداثيات الدقيقة (يُشتق منها رابط خرائط فقط إن اخترت)، ولا أي عميل أو طلب أو مطابقة.

import { repo } from '../data/repository.js';
import { ENUMS, labelFor } from '../data/schema.js';
import { getLists, typeLabel, getCompany, getPublishSettings, setPublishSettings } from '../data/settings.js';
import { el, clear, labeled, selectEl, checkbox, badge, toast, emptyState, confirmDialog, debounce, openModal } from '../util/dom.js';
import { formatSAR, formatArea, formatDateTime, formatNumber } from '../util/format.js';
import { mapsLink } from '../util/location.js';
import { isVideo } from '../data/images.js';
import { matchesQuery } from '../util/arabic.js';
import { qrBlock } from '../util/qr.js';
import { runPlans } from '../util/plans.js';
import { newId } from '../data/repository.js';

const PREVIEW_LIMIT = 400; // حد أعلى معقول لعدد العروض في لقطة واحدة

export async function render(container) {
  const ctx = { container, query: '', nodes: {} };
  await loadData(ctx);
  build(ctx);
}

async function loadData(ctx) {
  const [properties, lists, company, publish, clients] = await Promise.all([
    repo.properties.list(), getLists(), getCompany(), getPublishSettings(), repo.clients.list(),
  ]);
  // المعروض للاختيار: المخزون المعتمد فقط (نفس نطاق صفحة العقارات) — لا التقاطات غير معتمدة.
  ctx.properties = properties
    .filter((p) => p.captureStatus === 'approved')
    .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  ctx.lists = lists;
  ctx.company = company;
  ctx.publish = publish;
  ctx.clients = clients; // لازم لاختيار عميل القائمة المخصّصة (المرحلة ١١)
  ctx.selected = new Set(publish.listingIds);
  // المقاطع لا تُنشر (المرحلة ٣٨): مقطعٌ واحد بحدّه ٦٠ م.ب يساوي مئاتِ الصور رفعًا
  // وتخزينًا، وصفحةُ العميل تُفتح من جوّالٍ على بياناته. فتُنشر الصور وحدها، ويُقال ذلك
  // صراحةً في الصفحة — لا يُحذف شيءٌ ولا يُرفع شيءٌ في الخفاء.
  ctx.videoIds = new Set((await repo.images.list()).filter(isVideo).map((r) => r.id));
  ctx.publishedRefs = new Map(publish.publishedRefs || []);

  // عدّاد المشاهدات (المرحلة ٢٥): فشله لا يُعطّل الصفحة — تظهر «؟» مكان الرقم.
  ctx.views = {};
  ctx.viewsError = false;
  try {
    const res = await fetch('/api/view', { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(String(res.status));
    ({ counts: ctx.views = {} } = await res.json());
  } catch (_) {
    ctx.viewsError = true;
  }
}

function build(ctx) {
  clear(ctx.container);
  ctx.container.append(el('div', { class: 'page-head' },
    el('h1', {}, 'الصفحة العامة للعروض'),
    el('div', { class: 'row' },
      el('a', { class: 'btn', href: ctx.publish.publicUrl || '/offers/', target: '_blank', rel: 'noopener', text: 'فتح الصفحة العامة ↗' }))));

  ctx.container.append(el('div', { class: 'notice' },
    el('strong', { text: 'لقطة لا بثّ حيّ. ' }),
    'بياناتك محفوظة في متصفح هذا الجهاز، فالصفحة العامة تعرض ما كان وقت آخر ضغطة «نشر». ',
    'كل تعديل بعده يحتاج نشرًا جديدًا. ولا يخرج من جهازك إلا العقارات المختارة أدناه، ',
    'بحقولها التسويقية فقط — بلا اسم المالك أو جواله أو ملاحظاتك الداخلية.'));

  const grid = el('div', { class: 'settings-grid' });
  ctx.nodes.settingsPanel = panelBody(grid, 'إعدادات النشر', 'مفتاح النشر يُضبط مرة واحدة، ويبقى محفوظًا في هذا الجهاز فقط.');
  ctx.nodes.statusPanel = panelBody(grid, 'الحالة', 'آخر نشر وما هو ظاهر للعملاء الآن.');
  ctx.nodes.listsPanel = panelBody(grid, 'قوائم مخصّصة لعملاء', 'اختر عروضًا لعميل بعينه فيصله رابط خاص يعرض قائمته وحده — ويخبرك العدّاد هل فتحه.');
  ctx.nodes.leadsPanel = panelBody(grid, 'طلبات من الصفحة العامة', 'زوّار تركوا أرقامهم في نموذج «اطلب معاينة». تحويل الطلب ينشئ عميلًا في قاعدتك ثم يُزيله من هنا.');
  ctx.nodes.intakePanel = panelBody(grid, 'استمارة العملاء بـQR', 'رمز يمسحه العميل فيكتب طلبه بنفسه — بمدنك وأحيائك وأنواعك، لا نصًّا حرًّا.');
  ctx.nodes.bookingPanel = panelBody(grid, 'حجز المواعيد', 'يختار العميل وقتًا من أوقاتك بدل تبادل «متى يناسبك؟». مغلق حتى تفتحه، والأوقات لا تُنشر إلا بنشرة جديدة.');
  ctx.nodes.bookedPanel = panelBody(grid, 'مواعيد محجوزة', 'ما حجزه العملاء من صفحتك. التحويل ينشئ مهمة بموعدها ويُزيله من هنا.');
  ctx.container.append(grid);

  drawSettings(ctx);
  drawStatus(ctx);
  drawClientLists(ctx);
  drawLeads(ctx);
  drawIntake(ctx);
  drawBookingSettings(ctx);
  drawBookings(ctx);

  /* اختيار العقارات */
  ctx.nodes.count = el('span', { class: 'count' });
  const search = el('input', {
    class: 'input search', type: 'search', placeholder: 'بحث في العقارات…',
    onInput: debounce((e) => { ctx.query = e.target.value.trim(); drawList(ctx); }, 150),
  });
  ctx.container.append(el('div', { class: 'page-head', style: { marginTop: '18px' } },
    el('h2', {}, 'العقارات المختارة للنشر ', ctx.nodes.count),
    el('div', { class: 'head-actions' }, search,
      el('button', { type: 'button', class: 'btn btn-sm', text: 'إلغاء اختيار الكل', onClick: () => selectAll(ctx, false) }))));
  ctx.nodes.list = el('div');
  ctx.container.append(ctx.nodes.list);
  drawList(ctx);
}

function panelBody(grid, title, desc) {
  const body = el('div');
  grid.append(el('section', { class: 'panel' }, el('h2', { text: title }), el('p', { class: 'panel-desc', text: desc }), body));
  return body;
}

function drawSettings(ctx) {
  const body = ctx.nodes.settingsPanel;
  clear(body);
  const tokenInput = el('input', { class: 'input', type: 'password', value: ctx.publish.token || '', placeholder: 'مفتاح النشر من إعدادات Netlify' });
  const endpointInput = el('input', { class: 'input', type: 'text', dir: 'ltr', value: ctx.publish.endpoint || '/api/publish' });
  const introInput = el('textarea', { class: 'input', rows: 3, value: ctx.publish.intro || '', placeholder: 'نص ترحيبي يظهر أعلى الصفحة العامة' });
  const phoneInput = el('input', { class: 'input', type: 'tel', dir: 'ltr', value: ctx.publish.contactPhone || ctx.company.phone || '' });
  const priceBox = checkbox('إظهار السعر للعميل', { checked: ctx.publish.showPrice !== false });

  body.append(el('div', { class: 'form-grid' },
    labeled('مفتاح النشر', tokenInput, { hint: 'لا يُرسل إلا لدالة النشر، ولا يظهر في الصفحة العامة' }),
    labeled('مسار دالة النشر', endpointInput, { hint: 'اتركه كما هو ما دمت تنشر من نفس الموقع' }),
    labeled('جوال التواصل في العروض', phoneInput, { hint: 'يظهر للعميل كزر واتساب واتصال' }),
    el('div', { class: 'field' }, el('span', { class: 'field-label', text: 'السعر' }), priceBox),
    labeled('نص أعلى الصفحة', introInput, { full: true })),
  el('div', { class: 'row' }, el('button', {
    type: 'button', class: 'btn btn-primary', text: 'حفظ الإعدادات',
    onClick: async () => {
      ctx.publish = await setPublishSettings({
        token: tokenInput.value.trim(), endpoint: endpointInput.value.trim() || '/api/publish',
        intro: introInput.value, contactPhone: phoneInput.value.trim(),
        showPrice: priceBox.querySelector('input').checked,
      });
      toast('حُفظت إعدادات النشر', 'success');
      drawStatus(ctx);
    },
  })));
}

function drawStatus(ctx) {
  const body = ctx.nodes.statusPanel;
  clear(body);
  const p = ctx.publish;
  body.append(el('dl', { class: 'kv' },
    el('dt', { text: 'آخر نشر' }),
    el('dd', {}, p.lastPublishAt ? `${formatDateTime(p.lastPublishAt)} — ${p.lastPublishCount} عرض` : badge('لم يُنشر شيء بعد', 'badge-warn')),
    el('dt', { text: 'المختار الآن' }),
    el('dd', { text: `${ctx.selected.size} عقار` })));

  const publishBtn = el('button', { type: 'button', class: 'btn btn-primary', text: '🚀 نشر الآن' });
  publishBtn.addEventListener('click', () => doPublish(ctx, publishBtn));
  body.append(el('div', { class: 'row' }, publishBtn,
    el('button', {
      type: 'button', class: 'btn btn-danger', text: 'سحب كل ما نُشر',
      onClick: async () => {
        const ok = await confirmDialog({
          title: 'سحب المنشور', message: 'إخلاء الصفحة العامة تمامًا وحذف صورها من الخادم؟ اختياراتك هنا تبقى كما هي.',
          confirmText: 'سحب الكل', danger: true,
        });
        if (!ok) return;
        try {
          await callPublish(ctx, { kind: 'clear' });
          ctx.publish = await setPublishSettings({ lastPublishAt: null, lastPublishCount: 0 });
          toast('أُخليت الصفحة العامة', 'success');
          drawStatus(ctx);
        } catch (err) { toast(err.message, 'error', 6000); }
      },
    })));
  body.append(el('p', { class: 'muted small', text: 'الصور تُرفع مرة واحدة لكل صورة؛ النشر التالي يرفع الجديد فقط.' }));
}

/* ===== قائمة الاختيار ===== */

function drawList(ctx) {
  const items = ctx.properties.filter((p) => !ctx.query || matchesQuery(p.searchKey || '', ctx.query));
  ctx.nodes.count.textContent = `(${ctx.selected.size} من ${ctx.properties.length})`;
  const area = ctx.nodes.list;
  clear(area);
  if (!ctx.properties.length) {
    area.append(emptyState('لا عقارات معتمدة بعد لعرضها على العملاء.'));
    return;
  }
  if (!items.length) { area.append(emptyState('لا نتائج تطابق البحث.')); return; }

  const rows = items.map((p) => {
    const box = checkbox('', { checked: ctx.selected.has(p.id), onChange: (e) => toggle(ctx, p.id, e.target.checked) });
    return el('tr', {},
      el('td', {}, box),
      el('td', { class: 'strong', text: typeLabel(ctx.lists, p.type) }),
      el('td', { text: [p.district, p.city].filter(Boolean).join('، ') || '—' }),
      el('td', { text: (p.purposes || []).map((k) => labelFor(ENUMS.purposes, k)).join('، ') || '—' }),
      el('td', { class: 'num', text: formatArea(p.area) }),
      el('td', { class: 'num', text: formatSAR(p.price) }),
      // عمود الصور يقول ما يُنشر فعلًا، والمقاطع تُذكر منفصلةً لئلّا يُظنّ أنّها نُشرت.
      el('td', {}, (() => {
        const all = p.images || [];
        const vids = all.filter((id) => ctx.videoIds.has(id)).length;
        return el('span', {},
          String(all.length - vids),
          vids ? el('span', { class: 'muted small', title: 'المقاطع لا تُنشر في الصفحة العامة', text: ` (+${vids} مقطع لا يُنشر)` }) : null);
      })()),
      el('td', {}, viewCell(ctx, p)),
      el('td', {}, shareButton(ctx, p)));
  });
  area.append(el('div', { class: 'table-wrap' }, el('table', { class: 'table' },
    el('thead', {}, el('tr', {}, ['نشر', 'النوع', 'الموقع', 'الغرض', 'المساحة', 'السعر', 'الصور', 'مشاهدات', 'الرابط'].map((t) => el('th', { text: t })))),
    el('tbody', {}, rows))));
}

/**
 * مشاهدات العرض (المرحلة ٢٥): كم مرة فُتحت صفحته، وكم منها في آخر أسبوع.
 *
 * **مؤشر اهتمام لا محاسبة إعلانية:** العدّ مرة واحدة لكل جلسة متصفح، بلا معرّف زائر،
 * ومشاهدتان في اللحظة نفسها قد تُحسبان واحدة (لا قفل في التخزين). ويقال هذا في التلميح.
 */
function viewCell(ctx, property) {
  const index = ctx.publishedRefs.get(property.id);
  if (!index) return el('span', { class: 'muted small', text: '—' });
  const row = ctx.views?.[String(index)];
  if (!row) return el('span', { class: 'muted small', text: ctx.viewsError ? '؟' : '٠' });
  return el('span', {
    class: 'num strong',
    title: `${formatNumber(row.week)} في آخر سبعة أيام · آخر مشاهدة ${row.lastAt || '—'} · العدّ تقريبي: مرة لكل جلسة متصفح`,
    text: formatNumber(row.total),
  });
}

/**
 * رابط العرض الواحد: يُشارك مع عميل بعينه فيرى عقاره وحده بمعاينة صحيحة في واتساب.
 * الرقم (ref) = ترتيب العقار في آخر نشرة، فالزر لا يظهر إلا لما نُشر فعلًا.
 */
function shareButton(ctx, property) {
  const index = ctx.publishedRefs.get(property.id);
  if (!index) return el('span', { class: 'muted small', text: '—' });
  const url = `${location.origin}/offers/l/${index}`;
  return el('div', { class: 'row' },
    el('a', { class: 'btn btn-ghost btn-sm', href: url, target: '_blank', rel: 'noopener', text: '↗' , title: 'فتح صفحة العرض' }),
    el('button', {
      type: 'button', class: 'btn btn-ghost btn-sm', text: '📋', title: 'نسخ الرابط',
      onClick: async (e) => {
        e.stopPropagation();
        try { await navigator.clipboard.writeText(url); toast('نُسخ رابط العرض', 'success'); }
        catch (_) { toast(url, 'info', 8000); }
      },
    }),
    el('a', {
      class: 'btn btn-ghost btn-sm', title: 'إرسال في واتساب', text: '💬',
      href: `https://wa.me/?text=${encodeURIComponent(url)}`, target: '_blank', rel: 'noopener',
    }),
    qrButton(url, `${typeLabel(ctx.lists, property.type)} — ${property.district || property.city || ''}`));
}

/**
 * رمز QR للرابط: يُمسح من شاشة جوالك أو من ورقة مطبوعة أو لوحة على العقار،
 * فلا يُملى الرابط حرفًا حرفًا ولا يُكتب خطأً.
 */
function qrButton(url, title) {
  return el('button', {
    type: 'button', class: 'btn btn-ghost btn-sm', text: '▣', title: 'رمز QR',
    onClick: async (e) => {
      e.stopPropagation();
      try {
        const block = await qrBlock(url);
        const modal = openModal({
          title: `رمز QR — ${title}`,
          body: el('div', { style: { textAlign: 'center' } }, block,
            el('p', { class: 'muted small', style: { marginTop: '10px' }, text: 'امسحه بكاميرا العميل، أو اطبعه على لوحة العقار أو كتالوجك.' })),
          footer: [
            el('button', { type: 'button', class: 'btn btn-primary', text: '🖨️ طباعة', onClick: () => printQr(block, title, url) }),
            el('button', { type: 'button', class: 'btn btn-ghost', text: 'إغلاق', onClick: () => modal.close() }),
          ],
        });
      } catch (err) { toast(err.message || 'تعذّر بناء الرمز', 'error'); }
    },
  });
}

/** ورقة طباعة بسيطة: الرمز كبيرًا وتحته العنوان والرابط — تُقصّ وتُلصق. */
function printQr(block, title, url) {
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;inset:0;width:0;height:0;border:0;';
  document.body.append(frame);
  const doc = frame.contentDocument;
  doc.open();
  doc.write(`<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;text-align:center;padding:40px}
svg{width:340px;height:340px}h1{font-size:20px;margin:18px 0 6px}
.u{direction:ltr;font-size:12px;color:#555;word-break:break-all}</style></head>
<body>${block.querySelector('svg').outerHTML}<h1>${title}</h1><div class="u">${url}</div></body></html>`);
  doc.close();
  frame.contentWindow.focus();
  frame.contentWindow.print();
  setTimeout(() => frame.remove(), 1000);
}

async function toggle(ctx, id, on) {
  if (on) ctx.selected.add(id); else ctx.selected.delete(id);
  ctx.publish = await setPublishSettings({ listingIds: [...ctx.selected] });
  ctx.nodes.count.textContent = `(${ctx.selected.size} من ${ctx.properties.length})`;
  drawStatus(ctx);
}

async function selectAll(ctx, on) {
  ctx.selected = on ? new Set(ctx.properties.map((p) => p.id)) : new Set();
  ctx.publish = await setPublishSettings({ listingIds: [...ctx.selected] });
  drawList(ctx);
  drawStatus(ctx);
}

/* ===== النشر ===== */

async function callPublish(ctx, payload, { method = 'POST' } = {}) {
  const token = ctx.publish.token;
  if (!token) throw new Error('اضبط مفتاح النشر أولًا في إعدادات النشر أعلاه');
  const res = await fetch(ctx.publish.endpoint || '/api/publish', {
    method,
    headers: { 'content-type': 'application/json', 'x-publish-token': token },
    body: method === 'GET' ? undefined : JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `تعذر الاتصال بدالة النشر (${res.status})`);
  return data;
}

const blobToBase64 = (blob) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
  reader.onerror = () => reject(new Error('تعذر قراءة الصورة'));
  reader.readAsDataURL(blob);
});

/** يبني ما سيخرج من الجهاز — الحقول التسويقية فقط، بلا أي بيانات مالك أو عميل. */
function toPublicListing(ctx, property, index) {
  return {
    ref: String(index + 1),
    title: `${typeLabel(ctx.lists, property.type)} — ${property.district || property.city || ''}`.trim(),
    typeLabel: typeLabel(ctx.lists, property.type),
    purposeLabels: (property.purposes || []).map((k) => labelFor(ENUMS.purposes, k)),
    // المفاتيح (المرحلة ٣٠): تحتاجها النسخة الإنجليزية لتترجم المدمج منها، وما لم تعرفه
    // (نوعٌ أضفتَه أنت) يبقى بمسمّاه العربي — أصدق من ترجمةٍ تُخترع.
    type: property.type || '',
    purposes: [...(property.purposes || [])],
    city: property.city || '',
    district: property.district || '',
    area: property.area ?? null,
    price: ctx.publish.showPrice !== false ? (property.price ?? null) : null,
    notes: property.notes || '',
    images: (property.images || []).filter((id) => !ctx.videoIds.has(id)),
    mapUrl: property.location ? mapsLink(property.location) : null,
    contactPhone: ctx.publish.contactPhone || ctx.company.phone || '',
  };
}

async function doPublish(ctx, btn) {
  const chosen = ctx.properties.filter((p) => ctx.selected.has(p.id));
  if (!chosen.length) { toast('اختر عقارًا واحدًا على الأقل قبل النشر', 'error'); return; }
  if (chosen.length > PREVIEW_LIMIT) { toast(`الحد الأعلى ${PREVIEW_LIMIT} عرضًا في النشرة الواحدة`, 'error'); return; }

  btn.disabled = true;
  const original = btn.textContent;
  try {
    const listings = chosen.map((p, i) => toPublicListing(ctx, p, i));

    // ١) ما المرفوع أصلًا؟ فلا تُعاد صورة مرفوعة.
    btn.textContent = 'يفحص المرفوع…';
    const manifest = await callPublish(ctx, null, { method: 'GET' });
    const already = new Set(manifest.images || []);

    // ٢) الشعار ثم صور العروض الناقصة (صورة لكل طلب، ومع تقدّم مرئي).
    const wanted = [];
    if (ctx.company.logoImageId) wanted.push(ctx.company.logoImageId);
    for (const listing of listings) wanted.push(...listing.images);
    const missing = [...new Set(wanted)].filter((id) => !already.has(id));

    let done = 0;
    for (const id of missing) {
      const rec = await repo.images.get(id);
      if (!rec?.blob) continue;
      btn.textContent = `يرفع الصور ${++done}/${missing.length}…`;
      await callPublish(ctx, { kind: 'image', id, mime: rec.mime || 'image/jpeg', base64: await blobToBase64(rec.blob) });
    }

    // ٣) اللقطة نفسها (وهي التي تُظهر العروض للعميل فعليًا).
    btn.textContent = 'ينشر…';
    const result = await callPublish(ctx, {
      kind: 'snapshot',
      intro: ctx.publish.intro || '',
      office: {
        name: ctx.company.name || '', phone: ctx.publish.contactPhone || ctx.company.phone || '',
        address: ctx.company.address || '', logo: ctx.company.logoImageId || null,
      },
      // قوائمك (المرحلة ٢٥): تحتاجها استمارة الطلب العامة لتُرسل **مفاتيحك أنت** لا نصًّا حرًّا،
      // فيصير الطلب الوارد جاهزًا للمحرك بلا ترجمة. وهي قوائم عامة أصلًا (أنواع وأحياء ومدن)
      // لا بيانات عميل ولا عقار.
      // إعدادات الحجز (المرحلة ٢٩): الخادم يولّد الأوقات منها، فلا مصدر ثانٍ يخالفها.
      booking: ctx.publish.booking || { enabled: false },
      forms: {
        purposes: ENUMS.purposes.map((x) => ({ key: x.key, label: x.label })),
        types: (ctx.lists.propertyTypes || []).map((x) => ({ key: x.key, label: x.label })),
        cities: ctx.lists.cities || [],
        districtsByCity: ctx.lists.districtsByCity || {},
      },
      listings,
    });

    ctx.publish = await setPublishSettings({
      lastPublishAt: result.publishedAt, lastPublishCount: result.count,
      publishedRefs: chosen.map((p, i) => [p.id, String(i + 1)]), // لبناء روابط العروض المفردة
    });
    ctx.publishedRefs = new Map(ctx.publish.publishedRefs);
    drawStatus(ctx);
    drawList(ctx);
    toast(`نُشر ${result.count} عرض — الصفحة العامة محدَّثة الآن`, 'success', 5000);
  } catch (err) {
    console.error(err);
    toast(err.message || 'تعذر النشر', 'error', 7000);
  } finally {
    btn.textContent = original;
    btn.disabled = false;
  }
}


/* ===== قوائم مخصّصة لعملاء (المرحلة ١١) ===== */

/* ===== طلبات الصفحة العامة (المرحلة ٢٢) ===== */

const LEAD_API = '/api/lead';

async function leadCall(options = {}) {
  const res = await fetch(LEAD_API, { credentials: 'same-origin', ...options });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) throw new Error('انتهت جلستك — حدّث الصفحة وسجّل الدخول ثم أعد المحاولة');
  if (!res.ok) throw new Error(data.error || `تعذر الاتصال (${res.status})`);
  return data;
}

async function drawLeads(ctx) {
  const body = ctx.nodes.leadsPanel;
  clear(body);
  body.append(el('p', { class: 'muted small', text: 'جارٍ التحميل…' }));
  let leads = [];
  try {
    ({ leads = [] } = await leadCall());
  } catch (err) {
    clear(body);
    body.append(el('p', { class: 'muted small', text: `تعذّر جلب الطلبات: ${err.message}` }));
    return;
  }
  clear(body);
  if (!leads.length) {
    body.append(el('p', { class: 'muted small', text: 'لا طلبات بعد. النموذج ظاهر أسفل صفحة العروض العامة.' }));
    return;
  }

  body.append(el('div', { class: 'table-wrap' }, el('table', { class: 'table' },
    el('thead', {}, el('tr', {}, ['الاسم', 'الجوال', 'ما يبحث عنه', 'وصل', ''].map((t) => el('th', { text: t })))),
    el('tbody', {}, leads.map((lead) => el('tr', {},
      el('td', { class: 'strong', text: lead.name || 'بلا اسم' }),
      el('td', {}, el('a', { class: 'tel', href: `tel:${lead.phone}`, text: lead.phone, dir: 'ltr' })),
      el('td', {},
        el('div', { text: [lead.note, lead.ref ? `عن العرض ${lead.ref}` : ''].filter(Boolean).join(' · ') || '—' }),
        lead.want ? el('div', { class: 'muted small', text: wantSummary(ctx, lead.want) }) : null),
      el('td', { class: 'small muted', text: formatDateTime(lead.createdAt) }),
      el('td', {}, el('div', { class: 'row' },
        el('button', {
          type: 'button', class: 'btn btn-sm', text: 'حوّله عميلًا',
          onClick: () => convertLead(ctx, lead),
        }),
        el('a', {
          class: 'btn btn-ghost btn-sm', text: '💬', title: 'واتساب', target: '_blank', rel: 'noopener',
          href: `https://wa.me/${lead.phone.replace(/^0/, '966')}`,
        }),
        el('button', {
          type: 'button', class: 'icon-btn', text: '✕', title: 'تجاهل وحذف',
          onClick: async () => {
            const ok = await confirmDialog({ title: 'حذف الطلب', message: `حذف طلب ${lead.name || lead.phone}؟`, confirmText: 'حذف', danger: true });
            if (!ok) return;
            await leadCall({ method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: lead.id }) });
            await drawLeads(ctx);
          },
        })))))))));
}

/**
 * لوحة استمارة العملاء (المرحلة ٢٥): الرابط ورمزه.
 *
 * القوائم داخل الاستمارة تأتي من **آخر لقطة نشرتها**، فاستمارة قبل أول نشرة تعمل
 * بالاسم والجوال والنص وحدها — وهذا يُقال هنا صراحةً لا يُكتشف عند أول عميل.
 */
function drawIntake(ctx) {
  const body = ctx.nodes.intakePanel;
  clear(body);
  const base = (ctx.publish.publicUrl || `${location.origin}/offers/`).replace(/\/?$/, '/');
  const url = `${base}intake.html`;
  body.append(
    el('p', { class: 'small', style: { wordBreak: 'break-all' }, text: url }),
    el('div', { class: 'row' },
      el('a', { class: 'btn btn-sm', href: url, target: '_blank', rel: 'noopener', text: 'افتحها ↗' }),
      el('button', {
        type: 'button', class: 'btn btn-ghost btn-sm', text: '📋', title: 'نسخ الرابط',
        onClick: async () => {
          try { await navigator.clipboard.writeText(url); toast('نُسخ رابط الاستمارة', 'success'); }
          catch (_) { toast(url, 'info', 8000); }
        },
      }),
      qrButton(url, 'استمارة العملاء')),
    el('p', { class: 'field-hint', text: ctx.publish.lastPublishAt
      ? 'الطلب الوارد منها يُنشئ العميل وطلبه معًا، وينقلك إلى مطابقاته.'
      : 'لم تنشر بعد: الاستمارة تعمل الآن بالاسم والجوال والنص فقط — قوائمها تصل مع أول نشرة.' }),
  );
}

/** سطر يلخّص ما كتبه العميل في استمارة الـQR — بمسمّياتك أنت لا بمفاتيحها. */
function wantSummary(ctx, want) {
  return [
    want.purpose ? labelFor(ENUMS.purposes, want.purpose) : '',
    want.type ? typeLabel(ctx.lists, want.type) : '',
    [want.district, want.city].filter(Boolean).join('، '),
    want.budgetMax ? `حتى ${formatSAR(want.budgetMax)}` : '',
    want.area ? formatArea(want.area) : '',
  ].filter(Boolean).join(' · ');
}

/**
 * تحويل الطلب إلى عميل: **لا يُنشأ عميل مكرّر** — إن كان الجوال مسجَّلًا عندك يُضاف نصّ
 * الطلب إلى سجل تواصله بدل إنشاء سجل ثانٍ يشتّت تاريخه.
 *
 * وإن جاء من استمارة الـQR بحقول طلبٍ مكتوبة (المرحلة ٢٥) يُنشأ **الطلب أيضًا** —
 * وهذا هو الفرق: لم يعد الوارد رقمًا تعيد أنت كتابته، بل طلبًا يدخل المحرك فورًا.
 */
async function convertLead(ctx, lead) {
  try {
    const clients = await repo.clients.list();
    const existing = clients.find((c) => c.phone === lead.phone);
    const note = [lead.note, lead.ref ? `عن العرض ${lead.ref}` : ''].filter(Boolean).join(' · ') || 'طلب من الصفحة العامة';
    let client = existing;
    if (existing) {
      await repo.clients.addContact(existing.id, { type: 'whatsapp', date: lead.createdAt, note: `من الصفحة العامة: ${note}` });
      toast('العميل مسجَّل مسبقًا — أُضيف الطلب إلى سجل تواصله', 'success');
    } else {
      client = await repo.clients.create({
        name: lead.name || '', phone: lead.phone, roles: ['seeker'], stage: 'new',
        referralSource: 'الصفحة العامة', notes: note,
      });
      await repo.clients.addContact(client.id, { type: 'whatsapp', date: lead.createdAt, note });
      await runPlans('new_client', { title: client.name || client.phone, linkType: 'client', linkId: client.id });
      toast('أُنشئ العميل', 'success');
    }
    let request = null;
    if (lead.want && client) {
      // المدينة المطلوبة قد لا تكون في قوائمك بعد؛ والطلب بلا مدينة لا يعمل عليه المحرك،
      // فتُستعمل أول مدنك بديلًا ويُذكر المكتوب في ملاحظات الطلب.
      const city = (ctx.lists.cities || []).includes(lead.want.city) ? lead.want.city : (ctx.lists.cities || [])[0] || '';
      const district = (ctx.lists.districtsByCity?.[city] || []).includes(lead.want.district) ? lead.want.district : '';
      request = await repo.requests.create({
        clientId: client.id, status: 'active',
        purpose: lead.want.purpose || 'sale',
        type: lead.want.type || (ctx.lists.propertyTypes || [])[0]?.key || '',
        city, districts: district ? [district] : [],
        budgetMax: lead.want.budgetMax ?? null, area: lead.want.area ?? null,
        notes: `من استمارة العملاء: ${wantSummary(ctx, lead.want)}${lead.note ? ` · ${lead.note}` : ''}`,
      });
      toast(existing ? 'أُضيف الطلب إلى العميل المسجَّل' : 'أُنشئ العميل وطلبه', 'success');
    }
    await leadCall({ method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: lead.id }) });
    window.dispatchEvent(new CustomEvent('kassab:data-changed'));
    await drawLeads(ctx);
    if (request) location.hash = `#/matches/${request.id}`;
    else if (client) location.hash = `#/client/${client.id}`;
  } catch (err) {
    toast(err.message || 'تعذّر التحويل', 'error');
  }
}

const CLIENT_LIST_API = '/api/client-list';

async function clientListCall(options = {}) {
  const res = await fetch(CLIENT_LIST_API, { credentials: 'same-origin', ...options });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) throw new Error('انتهت جلستك — حدّث الصفحة وسجّل الدخول ثم أعد المحاولة');
  if (!res.ok) throw new Error(data.error || `تعذر الاتصال (${res.status})`);
  return data;
}

async function drawClientLists(ctx) {
  const body = ctx.nodes.listsPanel;
  clear(body);
  const listBox = el('div');

  const draw = async () => {
    clear(listBox);
    let lists = [];
    try {
      lists = (await clientListCall()).lists || [];
    } catch (err) {
      listBox.append(el('p', { class: 'muted small', text: `تعذر قراءة القوائم: ${err.message}` }));
      return;
    }
    if (!lists.length) { listBox.append(el('p', { class: 'muted small', text: 'لا قوائم مخصّصة بعد.' })); return; }
    listBox.append(el('div', { class: 'table-wrap' }, el('table', { class: 'table' },
      el('thead', {}, el('tr', {}, ['العميل', 'العروض', 'الفتحات', 'آخر فتح', ''].map((t) => el('th', { text: t })))),
      el('tbody', {}, lists.map((l) => {
        const url = `${location.origin}/offers/list.html?c=${l.slug}`;
        return el('tr', {},
          el('td', { class: 'strong', text: l.clientName || l.title || '—' }),
          el('td', { text: String((l.refs || []).length) }),
          el('td', {}, l.opens ? badge(`${l.opens}`, 'badge-ok') : el('span', { class: 'muted', text: 'لم يُفتح بعد' })),
          el('td', { text: l.lastOpenAt ? formatDateTime(l.lastOpenAt) : '—' }),
          el('td', {}, el('div', { class: 'row' },
            el('a', { class: 'btn btn-ghost btn-sm', href: url, target: '_blank', rel: 'noopener', text: '↗' , title: 'فتح' }),
            el('button', {
              type: 'button', class: 'btn btn-ghost btn-sm', text: '📋', title: 'نسخ الرابط',
              onClick: async () => {
                try { await navigator.clipboard.writeText(url); toast('نُسخ رابط القائمة', 'success'); }
                catch (_) { toast(url, 'info', 8000); }
              },
            }),
            el('a', {
              class: 'btn btn-ghost btn-sm', text: '💬', title: 'إرسال في واتساب', target: '_blank', rel: 'noopener',
              href: `https://wa.me/?text=${encodeURIComponent(url)}`,
            }),
            qrButton(url, l.clientName || l.title || 'قائمة عروض'),
            el('button', {
              type: 'button', class: 'btn btn-ghost btn-sm', text: '🗑️', title: 'حذف القائمة',
              onClick: async () => {
                const ok = await confirmDialog({ title: 'حذف القائمة', message: 'حذف هذه القائمة؟ الرابط سيتوقف فورًا.', confirmText: 'حذف', danger: true });
                if (!ok) return;
                await clientListCall({ method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ slug: l.slug }) });
                await draw();
              },
            }))));
      })))));
  };

  body.append(
    el('div', { class: 'row' },
      el('button', {
        type: 'button', class: 'btn btn-primary', text: '+ قائمة لعميل',
        onClick: () => openClientListForm(ctx, draw),
      }),
      el('button', { type: 'button', class: 'btn btn-ghost', text: 'تحديث', onClick: () => draw() })),
    el('p', { class: 'muted small', text: 'القائمة تشير إلى عروض منشورة أصلًا — انشر أولًا ثم أنشئ القائمة.' }),
    listBox);
  await draw();
}

function openClientListForm(ctx, onSaved) {
  const published = [...ctx.publishedRefs.entries()]
    .map(([id, ref]) => ({ ref, property: ctx.properties.find((p) => p.id === id) }))
    .filter((x) => x.property);

  if (!published.length) {
    toast('لا عروض منشورة بعد — اختر عقارات واضغط «نشر الآن» أولًا', 'error', 6000);
    return;
  }

  const clientSelect = selectEl({
    options: [...ctx.clients].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ar'))
      .map((c) => ({ value: c.id, label: c.name || c.phone || 'عميل بلا اسم' })),
    value: '', placeholder: 'اختر العميل (أو اكتب الاسم يدويًا)',
    onChange: () => {
      const c = ctx.clients.find((x) => x.id === clientSelect.value);
      if (c) nameInput.value = c.name || c.phone || '';
    },
  });
  const nameInput = el('input', { class: 'input', type: 'text', placeholder: 'الاسم كما يظهر في الصفحة' });
  const noteInput = el('textarea', { class: 'input', rows: 2, placeholder: 'سطر ترحيبي يظهر للعميل (اختياري)' });
  const picks = new Set();
  const box = el('div', { class: 'check-group' }, published.map(({ ref, property }) => checkbox(
    `${typeLabel(ctx.lists, property.type)} — ${[property.district, property.city].filter(Boolean).join('، ')} · ${formatSAR(property.price)}`,
    { value: ref, onChange: (e) => { if (e.target.checked) picks.add(ref); else picks.delete(ref); } },
  )));

  const saveBtn = el('button', { type: 'button', class: 'btn btn-primary', text: 'أنشئ الرابط' });
  saveBtn.addEventListener('click', async () => {
    if (!picks.size) { toast('اختر عرضًا واحدًا على الأقل', 'error'); return; }
    saveBtn.disabled = true;
    try {
      // رمز عشوائي غير قابل للتخمين — هو وحده ما يحمي القائمة (لا كلمة سر للعميل).
      const slug = newId().replace(/-/g, '').slice(0, 16);
      await clientListCall({
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slug, refs: [...picks], clientName: nameInput.value.trim(), note: noteInput.value.trim() }),
      });
      modal.close();
      toast('أُنشئت القائمة — انسخ رابطها من الجدول', 'success', 5000);
      await onSaved();
    } catch (err) {
      toast(err.message, 'error', 6000);
    } finally {
      saveBtn.disabled = false;
    }
  });

  const modal = openModal({
    title: 'قائمة عروض لعميل',
    size: 'wide',
    body: el('div', {},
      el('div', { class: 'form-grid' },
        labeled('العميل', clientSelect),
        labeled('الاسم في الصفحة', nameInput),
        labeled('سطر ترحيبي', noteInput, { full: true })),
      el('div', { class: 'field field-full' },
        el('span', { class: 'field-label', text: 'العروض المنشورة — اختر ما يخصّ هذا العميل' }), box)),
    footer: [
      el('button', { type: 'button', class: 'btn btn-ghost', text: 'إلغاء', onClick: () => modal.close() }),
      saveBtn,
    ],
  });
}

/* ===== حجز المواعيد (المرحلة ٢٩) ===== */

const BOOK_API = '/api/book';
const DAY_NAMES = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

async function bookCall(options = {}, query = '') {
  const res = await fetch(BOOK_API + query, { credentials: 'same-origin', ...options });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `تعذر الاتصال (${res.status})`);
  return data;
}

/**
 * إعدادات أوقاتك ورابط الصفحة.
 *
 * **لا تصل الأوقات إلى العميل إلا بنشرة جديدة** — لأنها تُقرأ من اللقطة لا من جهازك،
 * وهذا يُقال هنا صراحةً لا يُكتشف حين يحجز أحدهم في وقتٍ عدّلته ولم تنشره.
 */
function drawBookingSettings(ctx) {
  const body = ctx.nodes.bookingPanel;
  clear(body);
  const b = { ...(ctx.publish.booking || {}) };
  const enabledBox = checkbox('افتح الحجز للعملاء', { checked: !!b.enabled });
  const fromInput = el('input', { class: 'input', type: 'time', value: b.from || '16:00' });
  const toInput = el('input', { class: 'input', type: 'time', value: b.to || '21:00' });
  const stepInput = el('input', { class: 'input', type: 'number', min: '10', max: '240', step: '5', value: b.slotMinutes ?? 30 });
  const leadInput = el('input', { class: 'input', type: 'number', min: '0', max: '72', step: '1', value: b.leadHours ?? 4 });
  const horizonInput = el('input', { class: 'input', type: 'number', min: '1', max: '60', step: '1', value: b.horizonDays ?? 14 });
  const placeInput = el('input', { class: 'input', type: 'text', value: b.place || '', placeholder: 'مكتب المكتب، أو «نتفق عليه»' });
  const dayBoxes = DAY_NAMES.map((name, i) => checkbox(name, { checked: (b.days || []).includes(i) }));

  const base = (ctx.publish.publicUrl || `${location.origin}/offers/`).replace(/\/?$/, '/');
  const url = `${base}book.html`;

  body.append(
    el('div', { class: 'field field-full' }, enabledBox),
    el('div', { class: 'form-grid' },
      labeled('من', fromInput),
      labeled('إلى', toInput),
      labeled('مدّة الموعد (دقيقة)', stepInput),
      labeled('أقرب موعد (ساعات)', leadInput, { hint: 'لا يُحجز عليك موعد قبل هذه المهلة' }),
      labeled('أبعد يوم (أيام)', horizonInput),
      labeled('مكان اللقاء', placeInput, { full: true })),
    el('div', { class: 'field field-full' },
      el('span', { class: 'field-label', text: 'أيام العمل' }),
      el('div', { class: 'row', style: { flexWrap: 'wrap' } }, dayBoxes)),
    el('div', { class: 'row' },
      el('button', {
        type: 'button', class: 'btn btn-primary btn-sm', text: 'احفظ أوقاتي',
        onClick: async () => {
          const days = dayBoxes.map((box, i) => (box.querySelector('input').checked ? i : null)).filter((x) => x != null);
          ctx.publish = await setPublishSettings({
            booking: {
              enabled: enabledBox.querySelector('input').checked,
              days,
              from: fromInput.value || '16:00',
              to: toInput.value || '21:00',
              slotMinutes: Number(stepInput.value) || 30,
              leadHours: Number(leadInput.value) || 0,
              horizonDays: Number(horizonInput.value) || 14,
              place: placeInput.value.trim(),
            },
          });
          toast('حُفظت أوقاتك — انشر لتصل إلى الصفحة العامة', 'success', 5000);
          drawBookingSettings(ctx);
        },
      }),
      el('a', { class: 'btn btn-ghost btn-sm', href: url, target: '_blank', rel: 'noopener', text: 'افتح صفحة الحجز ↗' }),
      qrButton(url, 'حجز موعد')),
    el('p', { class: 'field-hint', text: 'الأوقات تُقرأ من آخر لقطة نشرتها لا من جهازك — فبعد تعديلها اضغط «نشر» وإلا بقي العميل يرى القديم.' }),
  );
}

/** ما حجزه العملاء: تحويله ينشئ العميل (إن كان جديدًا) ومهمة بموعده. */
async function drawBookings(ctx) {
  const body = ctx.nodes.bookedPanel;
  clear(body);
  body.append(el('p', { class: 'muted small', text: 'جارٍ التحميل…' }));
  let bookings = [];
  try {
    // `admin=1` هو ما يفرّق قراءة المالك (المحجوز) عن قراءة الزائر (المتاح) — والدالة تشترط جلسة له.
    ({ bookings = [] } = await bookCall({ method: 'GET', headers: { accept: 'application/json' } }, '?admin=1'));
  } catch (err) {
    clear(body);
    body.append(el('p', { class: 'muted small', text: `تعذّر جلب المواعيد: ${err.message}` }));
    return;
  }
  clear(body);
  if (!bookings.length) {
    body.append(el('p', { class: 'muted small', text: 'لا مواعيد محجوزة بعد.' }));
    return;
  }
  body.append(el('div', { class: 'table-wrap' }, el('table', { class: 'table' },
    el('thead', {}, el('tr', {}, ['الموعد', 'الاسم', 'الجوال', 'الموضوع', ''].map((t) => el('th', { text: t })))),
    el('tbody', {}, bookings.map((bk) => el('tr', {},
      el('td', { class: 'strong', text: formatDateTime(bk.at) }),
      el('td', { text: bk.name || 'بلا اسم' }),
      el('td', {}, el('a', { class: 'tel', href: `tel:${bk.phone}`, text: bk.phone, dir: 'ltr' })),
      el('td', { text: bk.note || '—' }),
      el('td', {}, el('div', { class: 'row' },
        el('button', { type: 'button', class: 'btn btn-sm', text: 'حوّله', onClick: () => convertBooking(ctx, bk) }),
        el('button', {
          type: 'button', class: 'icon-btn', text: '✕', title: 'حذف الموعد',
          onClick: async () => {
            const ok = await confirmDialog({ title: 'حذف الموعد', message: `حذف موعد ${bk.name || bk.phone}؟`, confirmText: 'حذف', danger: true });
            if (!ok) return;
            await bookCall({ method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: bk.id }) });
            await drawBookings(ctx);
          },
        })))))))));
}

/**
 * تحويل الموعد: عميل (إن كان جديدًا) + **مهمة بموعده** — لا معاينة، لأن الموعد بلا عقار
 * والمعاينة لا تقوم بلا عقار (قاعدة المرحلة ٢٧).
 */
async function convertBooking(ctx, bk) {
  try {
    const clients = await repo.clients.list();
    let client = clients.find((c) => c.phone === bk.phone);
    if (!client) {
      client = await repo.clients.create({
        name: bk.name || '', phone: bk.phone, roles: ['seeker'], stage: 'new',
        referralSource: 'حجز موعد', notes: bk.note || '',
      });
      await runPlans('new_client', { title: client.name || client.phone, linkType: 'client', linkId: client.id });
    }
    await repo.clients.addContact(client.id, { type: 'whatsapp', date: bk.createdAt, note: `حجز موعدًا: ${bk.note || 'بلا موضوع'}` });
    const lists = (await repo.taskLists.list()).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const list = lists[0] || await repo.taskLists.create({ title: 'متابعات', order: 0 });
    await repo.tasks.create({
      listId: list.id,
      title: `موعد مع ${client.name || bk.phone}`,
      notes: bk.note || '',
      dueAt: bk.at,
      linkType: 'client', linkId: client.id,
    });
    await bookCall({ method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: bk.id }) });
    toast('أُنشئت المهمة بموعدها', 'success');
    window.dispatchEvent(new CustomEvent('kassab:data-changed'));
    await drawBookings(ctx);
    location.hash = `#/client/${client.id}`;
  } catch (err) {
    toast(err.message || 'تعذّر التحويل', 'error');
  }
}
