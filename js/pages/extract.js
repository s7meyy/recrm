// صفحة «تفريغ المستندات والوسائط» (المرحلة ٤١).
//
// يصلك الصكُّ صورةً، والطلبُ رسالةً صوتية، والعرضُ مقطعًا — فتُعيد كتابة ما فيها بيدك في
// الاستمارة، أو تتركها فتضيع. وهذه تفرّغها نصًّا، وتقرأ منه حقولَه، **وتحوّله إلى عقارٍ
// أو طلبٍ أو مهمّة عقد وساطة** بضغطة.
//
// **ثلاثة مساراتٍ لا واحد، ويُقال أيُّها يعمل الآن:**
//
//  ١) **نصٌّ تلصقه — يعمل اليوم بلا اشتراك.** جوّالك يستخرج نصّ الصورة بنفسه («النص
//     المباشر» في آيفون، وعدسة جوجل في أندرويد)، وملفُّ PDF يُنسخ منه. فتلصقه هنا
//     فيُقرأ ويُحوَّل. وهذا أكثرُ ما يختصر الوقت على كل حال.
//  ٢) **صورةٌ أو PDF تلقائيًّا** — يحتاج «قراءة المستندات» في التكاملات.
//  ٣) **صوتٌ أو مقطع تلقائيًّا** — يحتاج «تفريغ الصوت إلى نصّ».
//
// وما لم يُهيَّأ **يقول اسم المتغيّر الناقص بالضبط**، ولا يعرض نصًّا مخترَعًا.
//
// **ولا حقلَ يُخمَّن**: ما لم يُقرأ لا يظهر، وكلُّ حقلٍ يحمل السطر الذي قُرئ منه — شاهدُك
// عليه. **ولا يُنشأ شيءٌ حتى تعتمد**: التفريغ مسوّدةٌ تُراجَع، لا سجلٌّ يُكتب.

import { repo } from '../data/repository.js';
import { labelFor, ENUMS } from '../data/schema.js';
import { getLists, typeLabel } from '../data/settings.js';
import { el, clear, badge, toast, emptyState, confirmDialog, allChip } from '../util/dom.js';
import { formatDateTime, formatNumber } from '../util/format.js';
import { formatBytes } from '../data/images.js';
import { parseDocument, toPropertyFields, DOC_KINDS } from '../util/deed-parse.js';
import { parseOfferText, parseRequestText } from '../data/listing-parse.js';
import { loadIntegrations, runIntegration, explain } from '../data/integrations.js';
import { runPlans } from '../util/plans.js';

const MAX_BYTES = 25 * 1024 * 1024; // حدُّ ما يُرسَل إلى مزوّدٍ في نداءٍ واحد
const KIND_LABEL = Object.fromEntries(DOC_KINDS.map((k) => [k.key, k.label]));

const FILTERS = [
  { key: 'new', label: 'بانتظار المراجعة', test: (r) => r.status !== 'approved' },
  { key: 'approved', label: 'معتمَدة', test: (r) => r.status === 'approved' },
  { key: 'failed', label: 'فشل تفريغها', test: (r) => !!r.error },
  { key: 'used', label: 'أُنشئ منها شيء', test: (r) => !!(r.madePropertyId || r.madeRequestId || r.madeTaskId) },
];

export async function render(container) {
  clear(container);
  const ctx = {
    container, rows: [], lists: null, integrations: [], filters: new Set(), nodes: {},
  };
  await load(ctx);

  container.append(el('div', { class: 'page-head' },
    el('h1', {}, 'تفريغ المستندات والوسائط ', ctx.nodes.count = el('span', { class: 'count' })),
    el('div', { class: 'head-actions' },
      el('a', { class: 'btn btn-ghost btn-sm', href: '#/integrations', text: 'التكاملات' }))));

  container.append(pathsNotice(ctx), intakePanel(ctx));

  ctx.nodes.filters = el('div', { class: 'filters' });
  ctx.nodes.list = el('div');
  container.append(el('section', { class: 'panel' },
    el('h2', { text: 'ما فُرِّغ' }),
    ctx.nodes.filters,
    ctx.nodes.list));

  renderFilters(ctx);
  renderList(ctx);
}

async function load(ctx) {
  const [rows, lists, integrations] = await Promise.all([
    repo.extractions.list(), getLists(), loadIntegrations(),
  ]);
  ctx.rows = rows.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  ctx.lists = lists;
  ctx.integrations = integrations;
}

const statusOf = (ctx, key) => ctx.integrations.find((i) => i.key === key) || null;

/* ===== ما يعمل الآن وما ينتظر ===== */

function pathsNotice(ctx) {
  const ocr = statusOf(ctx, 'ocr');
  const tr = statusOf(ctx, 'transcribe');
  const line = (ready, label, missing) => el('li', {},
    badge(ready ? 'يعمل' : 'ينتظر مفتاحًا', ready ? 'badge-ok' : 'badge-warn'), ' ', label,
    !ready && missing?.length ? el('span', { class: 'muted small', text: ` — الناقص: ${missing.join('، ')}` }) : null);

  return el('div', { class: 'notice' },
    el('strong', { text: 'ثلاثة مسارات: ' }),
    el('ul', { class: 'simple-list' },
      line(true, 'نصٌّ تلصقه — بلا اشتراك، ويقرأ الحقول كاملةً'),
      line(!!ocr?.configured, 'صورة أو PDF تلقائيًّا (قراءة المستندات)', ocr?.missing),
      line(!!tr?.configured, 'صوت أو مقطع تلقائيًّا (تفريغ الصوت)', tr?.missing)),
    'وجوّالك يستخرج نصّ الصورة بنفسه — «النص المباشر» في آيفون وعدسة جوجل في أندرويد — ',
    'فالمسار الأول يكفي لأكثر ما يصلك اليوم.');
}

/* ===== الإدخال ===== */

function intakePanel(ctx) {
  const textarea = el('textarea', {
    class: 'input', rows: 6,
    placeholder: 'الصق هنا نصّ الصك أو الهوية أو الرسالة…\n'
      + 'مثال: رقم الصك ٣١٠١٠٢٠٤٥٦٧٨٩ — اسم المالك سعد التميمي — المدينة الرياض — الحي النرجس — المساحة ٤٥٠ م٢',
  });

  const fileInput = el('input', {
    type: 'file', accept: 'image/*,application/pdf,audio/*,video/*', multiple: true, class: 'visually-hidden',
    onChange: async (e) => {
      const files = [...e.target.files];
      e.target.value = '';
      for (const f of files) await intakeFile(ctx, f);
      await load(ctx);
      renderFilters(ctx);
      renderList(ctx);
    },
  });

  return el('section', { class: 'panel' },
    el('h2', { text: 'فرّغ مستندًا' }),
    el('p', { class: 'panel-desc', text: 'الصق نصًّا، أو اختر ملفًّا. والنصّ يبقى قابلًا للتعديل بعد التفريغ — التفريغ مسوّدةٌ لا حكم.' }),
    textarea,
    el('div', { class: 'row', style: { marginTop: '8px', gap: '8px', flexWrap: 'wrap' } },
      el('button', {
        type: 'button', class: 'btn btn-primary', text: 'اقرأ النصّ',
        onClick: async () => {
          const text = textarea.value.trim();
          if (!text) { toast('الصق نصًّا أولًا', 'error'); return; }
          const parsed = readAll(text, ctx.lists);
          await repo.extractions.create({
            source: 'paste', text, kind: parsed.kind?.key || null,
            fields: parsed.fields, warnings: parsed.warnings,
          });
          textarea.value = '';
          toast('فُرِّغ — راجعه أدناه', 'success');
          await load(ctx);
          renderFilters(ctx);
          renderList(ctx);
        },
      }),
      el('label', { class: 'btn' }, '+ اختر ملفًّا (صورة · PDF · صوت · مقطع)', fileInput)),
    el('p', { class: 'field-hint', text: `حدّ الملف ${formatBytes(MAX_BYTES)} — وما فوقه لا يُرسَل إلى مزوّدٍ في نداءٍ واحد.` }));
}

/**
 * الحقول المسطّحة للتخزين: `bounds` مصفوفةُ كائنات، والباقي قيمٌ بسيطة.
 * ومفاتيح `bound_*` تُسقَط: هي نفسُها ما في `bounds`، وإبقاؤها يعرض كلّ حدٍّ مرّتين
 * — مرّةً باسمه العربي ومرّةً بمفتاحه الخام.
 */
function flatFields(fields) {
  const out = {};
  for (const [k, v] of Object.entries(fields || {})) {
    if (k === 'bounds') out.bounds = v;
    else if (k.startsWith('bound_')) continue;
    else if (v != null && typeof v !== 'object') out[k] = v;
  }
  return out;
}

/**
 * **قراءةٌ واحدة تجمع القراءتين** (المرحلة ٤١): المستندُ يُقرأ بمحلّل الوثائق، والرسالةُ
 * الصوتية المفرَّغة بمحلّل الطلبات — ورسالةُ العميل ليست صكًّا، فقراءتُها بمحلّل الصكوك
 * تعيد «لم يُقرأ حقل» وفيها ميزانيةٌ وحيٌّ ونوعٌ وجوّال.
 */
function readAll(text, lists) {
  const doc = parseDocument(text);
  const out = flatFields(doc.fields);
  const warnings = [...doc.warnings];

  const opts = {
    districts: lists?.districtsByCity?.[lists.cities?.[0]] || [],
    types: lists?.propertyTypes || [],
    cities: lists?.cities || [],
  };
  const req = parseRequestText(text, opts);
  // ما قرأه محلّل الطلبات ولم يقرأه محلّل الوثائق يُضاف — ولا يُزاحم ما في الصكّ.
  const EXTRA = { phone: 'جوال المرسِل', name: 'اسم المرسِل', budgetMax: 'سقف الميزانية', purpose: 'الغرض', type: 'النوع' };
  for (const key of Object.keys(EXTRA)) {
    if (out[key] == null && req.fields[key] != null) out[key] = req.fields[key];
  }
  if (out.district == null && (req.fields.districts || []).length) out.district = req.fields.districts.join('، ');
  if (out.city == null && req.fields.city) out.city = req.fields.city;
  if (out.area == null && req.fields.area != null) out.area = req.fields.area;

  // «لم يُقرأ شيء» لا تُقال إن قرأ الآخرُ شيئًا
  const any = Object.keys(out).filter((k) => k !== 'bounds').length > 0;
  return { kind: doc.kind, fields: out, warnings: any ? warnings.filter((w) => !w.includes('لم يُقرأ')) : warnings };
}

const blobToBase64 = (blob) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result).split(',')[1] || '');
  r.onerror = () => reject(new Error('تعذّر قراءة الملف'));
  r.readAsDataURL(blob);
});

/**
 * يرسل ملفًّا إلى محوّله. **وسجلُّ الفشل يُحفظ كسجلّ النجاح** — ملفٌّ فشل تفريغه وسقط
 * صامتًا أسوأ من سطرٍ أحمر يقول لماذا، لأنك تظنّه فُرّغ.
 */
async function intakeFile(ctx, file) {
  const mime = file.type || '';
  const isAudio = mime.startsWith('audio/') || mime.startsWith('video/');
  const isDoc = mime.startsWith('image/') || mime === 'application/pdf';
  const base = { fileName: file.name || 'ملف', mime, size: file.size };

  if (!isAudio && !isDoc) {
    await repo.extractions.create({ ...base, source: 'paste', error: `نوعٌ غير مدعوم (${mime || 'غير معروف'}) — الصق نصّه يدويًّا.` });
    return;
  }
  if (file.size > MAX_BYTES) {
    await repo.extractions.create({ ...base, source: isAudio ? 'transcribe' : 'ocr', error: `الملف ${formatBytes(file.size)} وهو فوق الحدّ (${formatBytes(MAX_BYTES)}) — اقتطع منه أو صغّره.` });
    return;
  }

  const key = isAudio ? 'transcribe' : 'ocr';
  const st = statusOf(ctx, key);
  if (st && !st.configured) {
    await repo.extractions.create({
      ...base, source: key,
      error: `${st.label} غير مُهيَّأ — الناقص: ${(st.missing || []).join('، ')}. وتُكتب في Netlify ← Site configuration ← Environment variables.`,
    });
    return;
  }

  let payload;
  try { payload = await blobToBase64(file); } catch (err) {
    await repo.extractions.create({ ...base, source: key, error: err.message });
    return;
  }

  const res = isAudio
    ? await runIntegration('transcribe', 'audio.transcribe', { audio: payload, mime })
    : await runIntegration('ocr', 'document.read', { image: payload, mime, kind: 'auto' });

  if (!res?.ok) {
    await repo.extractions.create({ ...base, source: key, error: explain(res, key) });
    return;
  }
  const text = String(res.provider?.text || res.provider?.transcript || res.text || '').trim();
  if (!text) {
    await repo.extractions.create({ ...base, source: key, error: 'ردّ المزوّد بلا نصّ — جرّب ملفًّا أوضح، أو الصق النصّ يدويًّا.' });
    return;
  }
  const parsed = readAll(text, ctx.lists);
  await repo.extractions.create({
    ...base, source: key, text, kind: parsed.kind?.key || null,
    fields: parsed.fields, warnings: parsed.warnings,
  });
}

/* ===== الفلاتر والقائمة ===== */

function renderFilters(ctx) {
  const wrap = ctx.nodes.filters;
  clear(wrap);
  ctx.nodes.count.textContent = ctx.rows.length ? `(${formatNumber(ctx.rows.length)})` : '';
  if (!ctx.rows.length) return;
  const chips = el('div', { class: 'chips' });
  chips.append(allChip(ctx.filters, FILTERS.map((f) => f.key), () => { renderFilters(ctx); renderList(ctx); }));
  for (const f of FILTERS) {
    const n = ctx.rows.filter(f.test).length;
    const active = ctx.filters.has(f.key);
    chips.append(el('button', {
      type: 'button', class: `chip${active ? ' active' : ''}${n === 0 && !active ? ' zero' : ''}`,
      onClick: () => {
        if (active) ctx.filters.delete(f.key); else ctx.filters.add(f.key);
        renderFilters(ctx);
        renderList(ctx);
      },
    }, f.label, el('span', { class: 'chip-count', text: String(n) })));
  }
  wrap.append(el('div', { class: 'filter-row' }, el('span', { class: 'filter-label', text: 'الحالة' }), chips));
}

function visible(ctx) {
  if (!ctx.filters.size) return ctx.rows;
  const chosen = FILTERS.filter((f) => ctx.filters.has(f.key));
  return ctx.rows.filter((r) => chosen.some((f) => f.test(r)));
}

function renderList(ctx) {
  const wrap = ctx.nodes.list;
  clear(wrap);
  if (!ctx.rows.length) {
    wrap.append(emptyState('لا مستند مفرَّغ بعد. الصق نصًّا أو اختر ملفًّا أعلاه.'));
    return;
  }
  const rows = visible(ctx);
  if (!rows.length) { wrap.append(el('p', { class: 'muted small', text: 'لا سجلّ يطابق الفرز المختار.' })); return; }
  for (const r of rows) wrap.append(card(ctx, r));
}

function card(ctx, rec) {
  const refresh = async () => { await load(ctx); renderFilters(ctx); renderList(ctx); };

  const head = el('div', { class: 'extract-head' },
    el('div', {},
      el('strong', { text: rec.fileName || (rec.kind ? KIND_LABEL[rec.kind] : 'نصّ ملصوق') }),
      el('div', { class: 'muted small' },
        [
          rec.kind ? KIND_LABEL[rec.kind] : 'نوعٌ لم يُميَّز',
          rec.source === 'paste' ? 'نصّ ملصوق' : rec.source === 'ocr' ? 'قراءة مستند' : 'تفريغ صوت',
          rec.size ? formatBytes(rec.size) : null,
          formatDateTime(rec.createdAt),
        ].filter(Boolean).join(' · '))),
    el('div', { class: 'row' },
      rec.status === 'approved' ? badge('معتمَدة', 'badge-ok') : badge('بانتظار المراجعة', 'badge-warn'),
      el('button', {
        type: 'button', class: 'btn btn-ghost btn-sm', text: '🗑', title: 'احذف السجل',
        onClick: async () => {
          const okDel = await confirmDialog({
            title: 'حذف التفريغ', danger: true, confirmText: 'احذف',
            message: 'يُحذف النصّ وحقولُه. وما أُنشئ منه (عقار أو طلب أو مهمة) يبقى كما هو.',
          });
          if (!okDel) return;
          await repo.extractions.remove(rec.id);
          await refresh();
        },
      })));

  if (rec.error) {
    return el('article', { class: 'panel extract-card extract-failed' }, head,
      el('p', { class: 'field-hint warn-text', text: rec.error }),
      el('p', { class: 'muted small', text: 'والمسار الأول يعمل الآن: استخرج نصّه بجوّالك والصقه أعلاه.' }));
  }

  /* النصّ — قابلٌ للتعديل وإعادة القراءة */
  const textarea = el('textarea', { class: 'input', rows: 5, value: rec.text || '' });
  const fieldsBox = el('div', { class: 'chips extract-fields' });
  const drawFields = (fields, warnings) => {
    clear(fieldsBox);
    const entries = Object.entries(fields || {}).filter(([k]) => k !== 'bounds');
    if (!entries.length) {
      fieldsBox.append(el('span', { class: 'muted small', text: 'لم يُقرأ حقلٌ معروف — انسخ من النصّ ما تحتاج.' }));
    }
    for (const [k, v] of entries) {
      const label = LABELS[k] || k;
      const shown = displayValue(k, v, ctx.lists);
      fieldsBox.append(el('button', {
        type: 'button', class: 'chip chip-copy', title: `انسخ ${label}`,
        onClick: async () => {
          try { await navigator.clipboard.writeText(shown); toast(`نُسخ ${label}`, 'success'); }
          catch { toast(shown, 'info', 6000); }
        },
      }, `${label}: `, el('span', { class: 'ltr', text: shown })));
    }
    for (const b of (fields?.bounds || [])) {
      fieldsBox.append(badge(`${b.label}: ${b.value}`, 'badge-outline'));
    }
    for (const w of warnings || []) fieldsBox.append(el('div', { class: 'field-hint warn-text', style: { flexBasis: '100%' }, text: `⚠︎ ${w}` }));
  };
  drawFields(rec.fields, rec.warnings);

  const reread = el('button', {
    type: 'button', class: 'btn btn-sm', text: 'أعد قراءة الحقول',
    onClick: async () => {
      const parsed = readAll(textarea.value, ctx.lists);
      await repo.extractions.update(rec.id, {
        text: textarea.value, kind: parsed.kind?.key || null,
        fields: parsed.fields, warnings: parsed.warnings,
      });
      drawFields(parsed.fields, parsed.warnings);
      toast('أُعيدت القراءة', 'success');
    },
  });

  const copyAll = el('button', {
    type: 'button', class: 'btn btn-sm', text: '📋 انسخ النصّ كاملًا',
    onClick: async () => {
      try { await navigator.clipboard.writeText(textarea.value); toast('نُسخ النصّ', 'success'); }
      catch { textarea.select(); toast('انسخه يدويًّا — المتصفح منع النسخ التلقائي', 'info', 6000); }
    },
  });

  return el('article', { class: 'panel extract-card' }, head,
    el('div', { class: 'panel-block' },
      el('h3', { text: 'النصّ' }),
      textarea,
      el('div', { class: 'row', style: { marginTop: '6px', gap: '6px', flexWrap: 'wrap' } }, reread, copyAll)),
    el('div', { class: 'panel-block' },
      el('h3', { text: 'الحقول المقروءة' }),
      el('p', { class: 'muted small', text: 'اضغط أيَّ حقلٍ لنسخه. وما لم يُقرأ لا يظهر — ولا يُخمَّن.' }),
      fieldsBox),
    actionsBlock(ctx, rec, textarea, refresh));
}

/**
 * ما يُعرض للمستخدم من قيمة الحقل — لا مفتاحُها الخام.
 * كان النوع يُعرض «land» و«apartment» في الشاشة: مفتاحُ مخزنٍ لا مسمّى عقار.
 */
function displayValue(key, value, lists) {
  if (value == null || value === '') return '';
  if (key === 'type') return typeLabel(lists, value) || String(value);
  if (key === 'purpose') return labelFor(ENUMS.purposes, value) || String(value);
  if (key === 'area') return `${formatNumber(value)} م²`;
  if (key === 'budgetMax') return `${formatNumber(value)} ريال`;
  return String(value);
}

const LABELS = {
  deedNumber: 'رقم الصك', deedDate: 'تاريخ الصك', ownerName: 'اسم المالك', nationalId: 'رقم الهوية',
  area: 'المساحة', planNumber: 'رقم المخطط', plotNumber: 'رقم القطعة', blockNumber: 'رقم البلك',
  district: 'الحي', city: 'المدينة',
  phone: 'جوال المرسِل', name: 'اسم المرسِل', budgetMax: 'سقف الميزانية',
  purpose: 'الغرض', type: 'النوع',
};

/* ===== التحويل: عقار · طلب · مهمة عقد وساطة ===== */

function actionsBlock(ctx, rec, textarea, refresh) {
  const made = el('div', { class: 'row', style: { gap: '6px', flexWrap: 'wrap' } });
  if (rec.madePropertyId) made.append(el('a', { class: 'btn btn-ghost btn-sm', href: `#/properties/${rec.madePropertyId}`, text: '↗ العقار المُنشأ' }));
  if (rec.madeRequestId) made.append(el('a', { class: 'btn btn-ghost btn-sm', href: `#/matches/${rec.madeRequestId}`, text: '↗ الطلب المُنشأ' }));
  if (rec.madeTaskId) made.append(el('a', { class: 'btn btn-ghost btn-sm', href: `#/tasks/${rec.madeTaskId}`, text: '↗ المهمة المُنشأة' }));
  if (rec.madeClientId) made.append(el('a', { class: 'btn btn-ghost btn-sm', href: `#/client/${rec.madeClientId}`, text: '↗ العميل' }));

  const mkProperty = el('button', {
    type: 'button', class: 'btn btn-primary btn-sm', text: '🏠 أنشئ عقارًا',
    disabled: !!rec.madePropertyId,
    title: rec.madePropertyId ? 'أُنشئ منه عقارٌ من قبل' : 'يفتح استمارة عقار معبّأة بما قُرئ',
    onClick: async () => {
      const text = textarea.value;
      const doc = parseDocument(text);
      const offer = parseOfferText(text, {
        districts: ctx.lists.districtsByCity?.[ctx.lists.cities[0]] || [],
        types: ctx.lists.propertyTypes, cities: ctx.lists.cities,
      });
      const base = toPropertyFields(doc, { city: ctx.lists.cities[0] });
      const created = await repo.properties.create({
        ...base,
        city: base.city || offer.fields.city || ctx.lists.cities[0] || 'الرياض',
        district: base.district || offer.fields.district || '',
        type: offer.fields.type || '',
        purposes: offer.fields.purposes || [],
        area: base.area ?? offer.fields.area ?? null,
        price: offer.fields.price ?? null,
        notes: text.slice(0, 1000),
        captureStatus: 'approved',
        status: 'not_contacted',
      });
      await repo.extractions.update(rec.id, { madePropertyId: created.id, status: 'approved' });
      toast('أُنشئ العقار — أكمله وراجعه', 'success');
      window.dispatchEvent(new CustomEvent('kassab:data-changed'));
      location.hash = `#/properties/${created.id}`;
      await refresh();
    },
  });

  const mkRequest = el('button', {
    type: 'button', class: 'btn btn-sm', text: '📋 أنشئ طلبًا',
    disabled: !!rec.madeRequestId,
    onClick: async () => {
      const text = textarea.value;
      const req = parseRequestText(text, {
        districts: ctx.lists.districtsByCity?.[ctx.lists.cities[0]] || [],
        types: ctx.lists.propertyTypes, cities: ctx.lists.cities,
      });
      const doc = parseDocument(text);
      const phone = req.fields.phone || '';
      const name = req.fields.name || doc.fields.ownerName || '';
      let client = null;
      if (phone) {
        const clients = await repo.clients.list();
        client = clients.find((c) => c.phone === phone) || null;
      }
      if (!client) {
        client = await repo.clients.create({
          name, phone, roles: ['seeker'], stage: 'new', notes: text.slice(0, 500),
        });
        await runPlans('new_client', { title: name || phone || 'عميل', linkType: 'client', linkId: client.id });
      }
      const created = await repo.requests.create({
        clientId: client.id,
        city: req.fields.city || ctx.lists.cities[0] || 'الرياض',
        districts: req.fields.districts || [],
        type: req.fields.type || '',
        purpose: req.fields.purpose || 'sale',
        budgetMax: req.fields.budgetMax ?? null,
        area: req.fields.area ?? null,
        status: 'active',
      });
      await repo.extractions.update(rec.id, { madeRequestId: created.id, madeClientId: client.id, status: 'approved' });
      toast('أُنشئ الطلب وعميلُه', 'success');
      window.dispatchEvent(new CustomEvent('kassab:data-changed'));
      location.hash = `#/matches/${created.id}`;
      await refresh();
    },
  });

  /**
   * مهمّة «أنشئ عقد وساطة»: المستندُ وحده لا يكفي — يحتاج عقدًا يُوقَّع ويُوثَّق ويُعتمد.
   * فتصير خطوةً في قائمتك لا نيّةً تُنسى، وفيها ما قُرئ من الصك ليُنقل إلى المنصّة.
   */
  const mkContractTask = el('button', {
    type: 'button', class: 'btn btn-sm', text: '📜 مهمّة: أنشئ عقد وساطة',
    disabled: !!rec.madeTaskId,
    onClick: async () => {
      const lists = await repo.taskLists.list();
      let list = lists.find((l) => /عقود|تراخيص|وساطه|وساطة/.test(l.title));
      if (!list) list = lists[0] || await repo.taskLists.create({ title: 'عقود وتراخيص', order: lists.length });
      const f = rec.fields || {};
      const who = f.ownerName ? ` — ${f.ownerName}` : '';
      const lines = Object.entries(f)
        .filter(([k, v]) => k !== 'bounds' && v != null && typeof v !== 'object')
        .map(([k, v]) => `${LABELS[k] || k}: ${displayValue(k, v, ctx.lists)}`);
      const created = await repo.tasks.create({
        listId: list.id,
        title: `أنشئ عقد وساطة${who}`,
        priority: 'high',
        notes: [
          'الخطوات: وقّع العقد مع المالك ← وثّقه في منصّة الوساطة ← سجّل رقمه ونطاقه في العقار ← ثم أصدر ترخيص الإعلان.',
          '',
          ...lines,
        ].join('\n'),
      });
      await repo.extractions.update(rec.id, { madeTaskId: created.id, status: 'approved' });
      toast(`أُضيفت المهمّة في «${list.title}»`, 'success');
      window.dispatchEvent(new CustomEvent('kassab:data-changed'));
      await refresh();
    },
  });

  const approve = rec.status === 'approved' ? null : el('button', {
    type: 'button', class: 'btn btn-ghost btn-sm', text: '✓ راجعتُه',
    title: 'يُعلَّم معتمَدًا بلا إنشاء شيء',
    onClick: async () => { await repo.extractions.update(rec.id, { status: 'approved', text: textarea.value }); await refresh(); },
  });

  return el('div', { class: 'panel-block' },
    el('h3', { text: 'حوّله' }),
    el('p', { class: 'muted small', text: 'لا يُنشأ شيءٌ حتى تضغط — والمُنشأ يُفتح لك لتُكمله وتراجعه.' }),
    el('div', { class: 'row', style: { gap: '6px', flexWrap: 'wrap' } }, mkProperty, mkRequest, mkContractTask, approve),
    made.children.length ? made : null);
}
