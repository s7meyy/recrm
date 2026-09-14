// صفحة النشر العام (المرحلة ٩): تختار العقارات التي توافق صراحة على عرضها للعملاء،
// ثم تدفعها بضغطة واحدة إلى الصفحة العامة `/offers/` عبر دالة Netlify.
//
// **قيد معلن للمستخدم في الصفحة نفسها:** هذه **لقطة لحظة الضغط، لا بثّ حيّ** — بياناتك في
// متصفح جهازك، فلا شيء يتحدث في السحابة تلقائيًا. وأي تعديل بعد النشر يحتاج ضغطة نشر جديدة.
//
// ما يخرج من الجهاز: الحقول التسويقية فقط للعقارات المختارة (نوع، حي، مدينة، مساحة، سعر إن
// اخترت إظهاره، ملاحظات، صور). **لا يخرج أبدًا:** اسم المالك وجواله، ملاحظاتك الداخلية عنه،
// الإحداثيات الدقيقة (يُشتق منها رابط خرائط فقط إن اخترت)، ولا أي عميل أو طلب أو مطابقة.

import { repo } from '../data/repository.js';
import { ENUMS, labelFor } from '../data/schema.js';
import { getLists, typeLabel, getCompany, getPublishSettings, setPublishSettings } from '../data/settings.js';
import { el, clear, labeled, selectEl, checkbox, badge, toast, emptyState, confirmDialog, debounce, openModal } from '../util/dom.js';
import { formatSAR, formatArea, formatDateTime } from '../util/format.js';
import { mapsLink } from '../util/location.js';
import { matchesQuery } from '../util/arabic.js';
import { qrBlock } from '../util/qr.js';
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
  ctx.publishedRefs = new Map(publish.publishedRefs || []);
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
  ctx.container.append(grid);

  drawSettings(ctx);
  drawStatus(ctx);
  drawClientLists(ctx);

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
      el('td', { text: `${(p.images || []).length}` }),
      el('td', {}, shareButton(ctx, p)));
  });
  area.append(el('div', { class: 'table-wrap' }, el('table', { class: 'table' },
    el('thead', {}, el('tr', {}, ['نشر', 'النوع', 'الموقع', 'الغرض', 'المساحة', 'السعر', 'الصور', 'الرابط'].map((t) => el('th', { text: t })))),
    el('tbody', {}, rows))));
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
    city: property.city || '',
    district: property.district || '',
    area: property.area ?? null,
    price: ctx.publish.showPrice !== false ? (property.price ?? null) : null,
    notes: property.notes || '',
    images: [...(property.images || [])],
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
