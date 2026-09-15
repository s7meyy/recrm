// صفحة «ختم الصور والمقاطع» (المرحلة ٣٨).
//
// عملٌ يوميّ متكرّر: عشراتُ صورٍ تخرج كلَّ يوم إلى واتساب ومواقع العرض، وكلُّ واحدةٍ
// تحتاج شعارك عليها. وكان يُفعل بتطبيقٍ آخر صورةً صورة.
//
// ثلاثة قراراتٍ تُقال صراحةً هنا، لأنّ إخفاءها يخون:
//
//  ١) **الأصل لا يُمسّ.** الختم يُحرق في نسخةٍ جديدة، فمن أخطأ في الشفافية أعاد من الأصل.
//  ٢) **المؤقّت افتراضًا.** من ختم ثلاثين صورةً ليرسلها اليوم لا يريدها في جهازه شهرًا،
//     ومخزن المتصفّح محدود. والحذف يُنفَّذ عند الفتح ويُقال عدده — لا يُوعد به.
//  ٣) **المقطع ليس كالصورة.** الصورة تُختم في لحظة؛ والمقطع يحتاج إعادة ترميزٍ بزمنه
//     الحقيقي — وهذا مكتوبٌ في الصفحة نفسها قبل الضغط لا بعده.

import { repo } from '../data/repository.js';
import { el, clear, labeled, selectEl, badge, toast, confirmDialog, emptyState, openModal } from '../util/dom.js';
import { getImageUrl, removeImage, formatBytes, isVideoFile } from '../data/images.js';
import { typeLabel, getLists } from '../data/settings.js';
import { formatDate, formatNumber, countWord, relativeDays } from '../util/format.js';
import {
  POSITIONS, SIZE_PRESETS, DEFAULT_PATTERN, stampImage, stampVideo, VIDEO_STAMP,
} from '../util/watermark.js';
import {
  getLogos, addLogo, removeLogo, renameLogo, getPresets, savePreset, removePreset,
  listStamped, saveStamped, sweepExpired, keepForever, RETENTION_OPTIONS, DEFAULT_RETENTION,
} from '../data/stamp.js';

export async function render(container) {
  clear(container);
  const ctx = {
    container,
    logos: [],
    logoBlobs: new Map(), // imageId → Blob
    presets: [],
    patterns: [DEFAULT_PATTERN()],
    items: [], // { id, file, name, size, isVideo, url, status, error, outId }
    retention: DEFAULT_RETENTION,
    propertyId: '',
    properties: [],
    lists: null,
    stamped: [],
    nodes: {},
    seq: 0,
  };

  // الكنس أوّلًا: ما انتهى أجله يُحذف الآن ويُقال عدده.
  const swept = await sweepExpired();
  await reload(ctx);

  container.append(el('div', { class: 'page-head' },
    el('h1', {}, 'ختم الصور والمقاطع'),
    el('div', { class: 'head-actions' },
      el('a', { class: 'btn btn-ghost btn-sm', href: '#/properties', text: 'العقارات' }))));

  if (swept) {
    container.append(el('div', { class: 'notice' },
      `حُذفت ${countWord(swept, ['صورة مؤقّتة واحدة', 'صورتان مؤقّتتان', 'صور مؤقّتة', 'صورة مؤقّتة'])} انتهى أجلها. `,
      'المؤقّت يُحذف تلقائيًّا — واختر «دائم» لما تريد بقاءه.'));
  }

  // ثلاثة أسطرٍ تُقرأ قبل أول ضغطة، لا تُكتشف بعدها.
  container.append(el('div', { class: 'notice' },
    el('strong', { text: 'الأصل لا يُمسّ: ' }),
    'الختم يُحرق في نسخةٍ جديدة، فمن أخطأ في الشفافية أعاد الختم من الأصل. ',
    el('strong', { text: 'والمؤقّت افتراضًا: ' }),
    'ما اخترتَه مؤقّتًا يُحذف تلقائيًّا عند فتح الصفحة بعد انتهاء أجله — واختر «دائم» لما تريد بقاءه. ',
    el('strong', { text: 'والمقطع ليس كالصورة: ' }),
    'ختمه إعادةُ ترميزٍ تجري بزمنه الحقيقي.'));

  container.append(
    logosPanel(ctx),
    editorPanel(ctx),
    sourcePanel(ctx),
    queuePanel(ctx),
    libraryPanel(ctx),
  );

  renderLogos(ctx);
  renderPatterns(ctx);
  renderQueue(ctx);
  renderLibrary(ctx);
  refreshPreview(ctx);
}

async function reload(ctx) {
  const [logos, presets, stamped, properties, lists] = await Promise.all([
    getLogos(), getPresets(), listStamped(), repo.properties.list(), getLists(),
  ]);
  ctx.logos = logos;
  ctx.presets = presets;
  ctx.stamped = stamped;
  ctx.properties = properties.filter((p) => p.captureStatus === 'approved');
  ctx.lists = lists;
  ctx.logoBlobs = new Map();
  for (const l of logos) {
    const rec = await repo.images.get(l.imageId);
    if (rec?.blob) ctx.logoBlobs.set(l.imageId, rec.blob);
  }
}

/* ===== ١. الشعارات ===== */

function logosPanel(ctx) {
  const input = el('input', {
    type: 'file', accept: 'image/png,image/svg+xml,image/webp,image/jpeg', multiple: true, class: 'visually-hidden',
    onChange: async (e) => {
      const files = [...e.target.files];
      e.target.value = '';
      for (const f of files) {
        try { await addLogo(f); } catch (err) { toast(`تعذّر حفظ «${f.name}»: ${err.message}`, 'error', 6000); }
      }
      await reload(ctx);
      renderLogos(ctx);
      renderPatterns(ctx);
      refreshPreview(ctx);
    },
  });
  ctx.nodes.logos = el('div', { class: 'logo-row' });
  return el('section', { class: 'panel' },
    el('h2', { text: 'شعاراتك' }),
    el('p', { class: 'panel-desc', text: 'احفظ ما شئت منها، واختر لكل صورةٍ شعارها. وحذف شعارٍ لا يمسّ ما خُتم به — الختم محروقٌ في الصورة لا معلَّقٌ بالملف.' }),
    ctx.nodes.logos,
    el('label', { class: 'btn btn-primary' }, '+ أضف شعارًا', input),
    el('p', { class: 'field-hint', text: 'PNG بخلفيةٍ شفّافة أوضح ما يكون على الصور. والشعار يُضغط كغيره فلا يُثقل الجهاز.' }));
}

function renderLogos(ctx) {
  const wrap = ctx.nodes.logos;
  clear(wrap);
  if (!ctx.logos.length) {
    wrap.append(el('p', { class: 'muted small', text: 'لا شعار بعد. أضف واحدًا لتبدأ.' }));
    return;
  }
  for (const logo of ctx.logos) {
    const img = el('img', { alt: logo.name });
    getImageUrl(logo.imageId, { thumb: true }).then((url) => { if (url) img.src = url; });
    wrap.append(el('div', { class: 'logo-tile' }, img,
      el('div', { class: 'logo-name', text: logo.name }),
      el('div', { class: 'logo-tools' },
        el('button', {
          type: 'button', class: 'btn btn-ghost btn-sm', text: 'سمِّه',
          onClick: async () => {
            const name = prompt('اسم الشعار', logo.name);
            if (name == null) return;
            await renameLogo(logo.id, name);
            await reload(ctx);
            renderLogos(ctx);
            renderPatterns(ctx);
          },
        }),
        el('button', {
          type: 'button', class: 'btn btn-ghost btn-sm danger', text: 'احذف',
          onClick: async () => {
            const okDel = await confirmDialog({
              title: `حذف «${logo.name}»؟`,
              message: 'الصور المختومة به تبقى كما هي — الختم محروقٌ فيها. والقوالب التي تستعمله تُنظَّف.',
              confirmText: 'احذف الشعار',
              danger: true,
            });
            if (!okDel) return;
            await removeLogo(logo.id);
            await reload(ctx);
            renderLogos(ctx);
            renderPatterns(ctx);
            refreshPreview(ctx);
          },
        }))));
  }
}

/* ===== ٢. المحرّر: الأنماط ===== */

function editorPanel(ctx) {
  ctx.nodes.patterns = el('div', { class: 'stamp-patterns' });
  ctx.nodes.preview = el('div', { class: 'stamp-preview' },
    el('p', { class: 'muted small', text: 'أضف صورةً أدناه لترى الختم عليها قبل أن تختم الدفعة كلّها.' }));

  const presetSelect = selectEl({ options: [], placeholder: 'قالب محفوظ…', class: 'input preset-picker' });
  const refreshPresets = () => {
    clear(presetSelect);
    presetSelect.append(el('option', { value: '', text: 'قالب محفوظ…' }));
    for (const p of ctx.presets) presetSelect.append(el('option', { value: p.id, text: p.name }));
  };
  ctx.nodes.refreshPresets = refreshPresets;
  refreshPresets();
  presetSelect.addEventListener('change', () => {
    const chosen = ctx.presets.find((p) => p.id === presetSelect.value);
    if (!chosen) return;
    ctx.patterns = JSON.parse(JSON.stringify(chosen.patterns));
    renderPatterns(ctx);
    refreshPreview(ctx);
  });

  return el('section', { class: 'panel' },
    el('h2', { text: 'المحرّر' }),
    el('p', { class: 'panel-desc', text: 'نمطٌ واحدٌ أو أكثر على الصورة نفسها — شعارٌ كبير في الوسط وآخر صغير في الزاوية مثلًا. وكلُّ حجمٍ نسبةٌ من عرض الصورة، فالصورة الكبيرة والصغيرة تأخذان الختم نفسه في العين.' }),
    el('div', { class: 'row', style: { flexWrap: 'wrap', gap: '8px', marginBottom: '10px' } },
      presetSelect,
      el('button', {
        type: 'button', class: 'btn btn-sm', text: '+ نمط آخر',
        onClick: () => { ctx.patterns.push(DEFAULT_PATTERN()); renderPatterns(ctx); refreshPreview(ctx); },
      }),
      el('button', {
        type: 'button', class: 'btn btn-sm', text: '💾 احفظ قالبًا',
        onClick: async () => {
          if (!ctx.patterns.some((p) => p.logoId)) { toast('اختر شعارًا في نمطٍ واحدٍ على الأقل', 'error'); return; }
          const name = prompt('اسم القالب', 'قالبي');
          if (!name) return;
          await savePreset(name, ctx.patterns);
          await reload(ctx);
          refreshPresets();
          toast('حُفظ القالب', 'success');
        },
      }),
      el('button', {
        type: 'button', class: 'btn btn-ghost btn-sm', text: 'احذف القالب المختار',
        onClick: async () => {
          if (!presetSelect.value) { toast('اختر قالبًا أوّلًا', 'error'); return; }
          await removePreset(presetSelect.value);
          await reload(ctx);
          refreshPresets();
          toast('حُذف القالب', 'success');
        },
      })),
    ctx.nodes.patterns,
    ctx.nodes.preview);
}

function renderPatterns(ctx) {
  const wrap = ctx.nodes.patterns;
  clear(wrap);
  ctx.patterns.forEach((pattern, index) => {
    const logoSelect = selectEl({
      options: ctx.logos.map((l) => ({ value: l.imageId, label: l.name })),
      value: pattern.logoId || '',
      placeholder: 'اختر شعارًا…',
      onChange: (e) => { pattern.logoId = e.target.value || null; refreshPreview(ctx); },
    });
    const posSelect = selectEl({
      options: POSITIONS.map((p) => ({ value: p.key, label: p.label })),
      value: pattern.position,
      onChange: (e) => { pattern.position = e.target.value; refreshPreview(ctx); },
    });
    const sizeRange = el('input', {
      class: 'input stamp-range', type: 'range', min: '2', max: '100', step: '1', value: String(pattern.sizePct),
      'aria-label': 'الحجم',
    });
    const sizeOut = el('span', { class: 'muted small', text: `${pattern.sizePct}٪` });
    sizeRange.addEventListener('input', () => {
      pattern.sizePct = Number(sizeRange.value);
      sizeOut.textContent = `${pattern.sizePct}٪`;
      refreshPreview(ctx);
    });
    const opacityRange = el('input', {
      class: 'input stamp-range', type: 'range', min: '5', max: '100', step: '5',
      value: String(Math.round(pattern.opacity * 100)), 'aria-label': 'الشفافية',
    });
    const opacityOut = el('span', { class: 'muted small', text: `${Math.round(pattern.opacity * 100)}٪` });
    opacityRange.addEventListener('input', () => {
      pattern.opacity = Number(opacityRange.value) / 100;
      opacityOut.textContent = `${opacityRange.value}٪`;
      refreshPreview(ctx);
    });

    wrap.append(el('div', { class: 'stamp-pattern' },
      el('div', { class: 'stamp-pattern-head' },
        el('strong', { text: `النمط ${formatNumber(index + 1)}` }),
        ctx.patterns.length > 1 ? el('button', {
          type: 'button', class: 'btn btn-ghost btn-sm danger', text: '✕ احذفه',
          onClick: () => { ctx.patterns.splice(index, 1); renderPatterns(ctx); refreshPreview(ctx); },
        }) : null),
      el('div', { class: 'form-grid' },
        labeled('الشعار', logoSelect),
        labeled('الموضع', posSelect),
        labeled('الحجم', el('div', { class: 'field-row' }, sizeRange, sizeOut),
          { hint: SIZE_PRESETS.map((s) => `${s.label} ${s.sizePct}٪`).join(' · ') }),
        labeled('الشفافية', el('div', { class: 'field-row' }, opacityRange, opacityOut),
          { hint: 'الأقلّ أخفى والأكثر أظهر — والوسطُ يحمي بلا أن يُفسد الصورة' }))));
  });
}

/* ===== ٣. المصدر: ملفات أو روابط ===== */

function sourcePanel(ctx) {
  const fileInput = el('input', {
    type: 'file', accept: 'image/*,video/*', multiple: true, class: 'visually-hidden',
    onChange: (e) => { addFiles(ctx, [...e.target.files]); e.target.value = ''; },
  });

  const urlsInput = el('textarea', {
    class: 'input', rows: 3,
    placeholder: 'ألصق روابط الصور، رابطًا في كل سطر',
  });
  const urlsBtn = el('button', {
    type: 'button', class: 'btn', text: 'اجلب الروابط',
    onClick: async () => {
      const urls = urlsInput.value.split('\n').map((s) => s.trim()).filter(Boolean);
      if (!urls.length) { toast('ألصق رابطًا واحدًا على الأقل', 'error'); return; }
      urlsBtn.disabled = true;
      const original = urlsBtn.textContent;
      let done = 0;
      for (const url of urls) {
        urlsBtn.textContent = `يجلب ${++done}/${urls.length}…`;
        try {
          const res = await fetch(`/api/fetch-media?url=${encodeURIComponent(url)}`);
          if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error(body.error || `الخادم ردّ ${res.status}`);
          }
          const blob = await res.blob();
          const name = decodeURIComponent(url.split('/').pop() || 'صورة').split('?')[0];
          addFiles(ctx, [new File([blob], name, { type: blob.type })], { sourceUrl: url });
        } catch (err) {
          toast(`تعذّر جلب ${url}: ${err.message}`, 'error', 7000);
        }
      }
      urlsBtn.textContent = original;
      urlsBtn.disabled = false;
      urlsInput.value = '';
    },
  });

  const propSelect = selectEl({
    options: ctx.properties.map((p) => ({
      value: p.id,
      label: [typeLabel(ctx.lists, p.type), p.district, p.city].filter(Boolean).join(' · ') || 'عقار',
    })),
    placeholder: 'بلا ربط بعرض…',
    onChange: (e) => { ctx.propertyId = e.target.value; },
  });

  const retentionSelect = selectEl({
    options: RETENTION_OPTIONS.map((o) => ({ value: o.key, label: o.label })),
    value: ctx.retention,
    onChange: (e) => { ctx.retention = e.target.value; },
  });

  return el('section', { class: 'panel' },
    el('h2', { text: 'ما تريد ختمه' }),
    el('div', { class: 'row', style: { flexWrap: 'wrap', gap: '8px' } },
      el('label', { class: 'btn btn-primary' }, '+ اختر ملفّات', fileInput)),
    el('div', { class: 'form-grid', style: { marginTop: '12px' } },
      labeled('اربطها بعرض', propSelect, { hint: 'اختياري — المختوم يظهر في مكتبته موسومًا بالعرض، وتجده حين تحتاجه' }),
      labeled('الاحتفاظ', retentionSelect, { hint: 'المؤقّت يُحذف تلقائيًّا عند فتح الصفحة بعد انتهاء أجله' })),
    el('div', { class: 'panel-block' },
      el('h3', { text: 'أو ألصق روابط' }),
      urlsInput,
      urlsBtn,
      el('p', { class: 'field-hint' },
        'الرابط يُجلب من خادمنا لا من متصفّحك، ',
        'لأنّ المتصفّح يعرض صورة موقعٍ آخر ولا يسمح بقراءة بكسلاتها — فلا تُختم. ',
        'وشرطه: رابط https للصورة نفسها (لا لصفحةٍ تعرضها)، وحدّه ١٢ م.ب.')));
}

function addFiles(ctx, files, { sourceUrl = '' } = {}) {
  for (const file of files) {
    ctx.items.push({
      id: `q${++ctx.seq}`,
      file,
      name: file.name || 'ملف',
      size: file.size,
      video: isVideoFile(file),
      sourceUrl,
      status: 'pending',
      error: '',
    });
  }
  renderQueue(ctx);
  refreshPreview(ctx);
}

/* ===== ٤. الطابور ===== */

function queuePanel(ctx) {
  ctx.nodes.queue = el('div');
  ctx.nodes.queueHead = el('div', { class: 'row', style: { flexWrap: 'wrap', gap: '8px' } });
  return el('section', { class: 'panel' },
    el('h2', {}, 'الطابور ', ctx.nodes.count = el('span', { class: 'count' })),
    ctx.nodes.queueHead,
    ctx.nodes.queue);
}

function renderQueue(ctx) {
  const wrap = ctx.nodes.queue;
  clear(wrap);
  clear(ctx.nodes.queueHead);

  const pending = ctx.items.filter((x) => x.status === 'pending');
  const videos = pending.filter((x) => x.video);
  ctx.nodes.count.textContent = ctx.items.length ? `(${formatNumber(ctx.items.length)})` : '';

  if (!ctx.items.length) {
    wrap.append(el('p', { class: 'muted small', text: 'لا ملفّات بعد. اختر ملفّاتٍ أو ألصق روابط أعلاه.' }));
    return;
  }

  ctx.nodes.queueHead.append(
    el('button', {
      type: 'button', class: 'btn btn-primary', text: `اختم ${countWord(pending.length, ['ملفًّا واحدًا', 'ملفّين', 'ملفّات', 'ملفًّا'])}`,
      disabled: !pending.length,
      onClick: () => runBatch(ctx),
    }),
    el('button', {
      type: 'button', class: 'btn btn-ghost', text: 'أفرغ الطابور',
      onClick: () => { ctx.items = []; renderQueue(ctx); refreshPreview(ctx); },
    }));

  if (videos.length) {
    // القول قبل الفعل: المقطع ليس كالصورة، والوقت يُحسب بزمنه.
    const seconds = videos.length;
    ctx.nodes.queueHead.append(el('p', { class: 'notice notice-warn', style: { flexBasis: '100%' } },
      el('strong', { text: `في الطابور ${countWord(videos.length, ['مقطع واحد', 'مقطعان', 'مقاطع', 'مقطعًا'])}. ` }),
      'ختم المقطع إعادةُ ترميزٍ كاملة تجري بزمنه الحقيقي: مقطع دقيقتين يأخذ دقيقتين، ',
      'والناتج WebM بجودةٍ أقلّ من الأصل. ',
      VIDEO_STAMP.supported() ? 'ابقَ في الصفحة حتى ينتهي.' : 'ومتصفّحك لا يدعم هذا أصلًا — ستُتخطّى المقاطع.'));
    void seconds;
  }

  for (const item of ctx.items) {
    wrap.append(el('div', { class: `queue-row queue-${item.status}` },
      el('span', { class: 'queue-name', text: item.name }),
      el('span', { class: 'muted small', text: formatBytes(item.size) }),
      item.video ? badge('مقطع', 'badge-warn') : badge('صورة', 'badge-outline'),
      el('span', { class: 'queue-status' }, statusNode(item)),
      item.status === 'pending' ? el('button', {
        type: 'button', class: 'btn btn-ghost btn-sm', text: '✕',
        title: 'أخرجه من الطابور',
        onClick: () => {
          ctx.items = ctx.items.filter((x) => x.id !== item.id);
          renderQueue(ctx);
          refreshPreview(ctx);
        },
      }) : null));
  }
}

function statusNode(item) {
  if (item.status === 'pending') return el('span', { class: 'muted small', text: 'بالانتظار' });
  if (item.status === 'working') return el('span', { class: 'small', text: item.progress ? `يعمل… ${Math.round(item.progress * 100)}٪` : 'يعمل…' });
  if (item.status === 'done') return badge('تمّ', 'badge-ok');
  return badge(item.error || 'فشل', 'badge-danger');
}

async function runBatch(ctx) {
  if (!ctx.patterns.some((p) => p.logoId)) {
    toast('اختر شعارًا في نمطٍ واحدٍ على الأقل قبل الختم', 'error');
    return;
  }
  const pending = ctx.items.filter((x) => x.status === 'pending');
  for (const item of pending) {
    item.status = 'working';
    item.progress = 0;
    renderQueue(ctx);
    try {
      let out;
      if (item.video) {
        if (!VIDEO_STAMP.supported()) throw new Error('متصفّحك لا يدعم ختم المقاطع');
        out = await stampVideo(item.file, ctx.patterns, ctx.logoBlobs, {
          onProgress: (r) => { item.progress = r; renderQueue(ctx); },
        });
      } else {
        out = await stampImage(item.file, ctx.patterns, ctx.logoBlobs);
      }
      const rec = await saveStamped(out.blob, {
        width: out.width,
        height: out.height,
        propertyId: ctx.propertyId || null,
        retention: ctx.retention,
        originalName: item.name,
        sourceUrl: item.sourceUrl,
      });
      item.outId = rec.id;
      item.status = 'done';
    } catch (err) {
      item.status = 'failed';
      item.error = err?.message || 'فشل غير معروف';
    }
    renderQueue(ctx);
  }
  ctx.stamped = await listStamped();
  renderLibrary(ctx);
  const okCount = ctx.items.filter((x) => x.status === 'done').length;
  toast(`خُتم ${countWord(okCount, ['ملفّ واحد', 'ملفّان', 'ملفّات', 'ملفًّا'])}`, 'success');
}

/* ===== ٥. المكتبة ===== */

function libraryPanel(ctx) {
  ctx.nodes.library = el('div', { class: 'images-box stamp-library' });
  return el('section', { class: 'panel' },
    el('h2', { text: 'المختوم' }),
    el('p', { class: 'panel-desc', text: 'ما خُتم يبقى هنا حتى ينتهي أجله أو تحذفه. حمِّل ما تريد إرساله، أو ثبِّت ما تريد بقاءه.' }),
    ctx.nodes.library);
}

function renderLibrary(ctx) {
  const wrap = ctx.nodes.library;
  clear(wrap);
  if (!ctx.stamped.length) {
    wrap.append(el('p', { class: 'muted small', text: 'لا صورة مختومة بعد.' }));
    return;
  }
  const propMap = new Map(ctx.properties.map((p) => [p.id, p]));
  for (const rec of ctx.stamped) {
    const isVid = String(rec.mime || '').startsWith('video/');
    const media = isVid ? el('video', { controls: '', preload: 'metadata' }) : el('img', { alt: rec.originalName || '' });
    getImageUrl(rec.id).then((url) => { if (url) media.src = url; });

    const prop = rec.entityId ? propMap.get(rec.entityId) : null;
    wrap.append(el('div', { class: 'stamp-tile' }, media,
      el('div', { class: 'stamp-meta' },
        el('div', { class: 'small', text: rec.originalName || 'بلا اسم' }),
        el('div', { class: 'muted small', text: formatBytes(rec.size || 0) }),
        prop
          ? el('a', { class: 'small', href: `#/properties/${prop.id}`, text: [typeLabel(ctx.lists, prop.type), prop.district].filter(Boolean).join(' · ') })
          : null,
        // الوسم قصيرٌ يُقرأ في بطاقةٍ ضيّقة، والتاريخ الكامل (بتقويميه) تحت المؤشّر:
        // إقحامه في الوسم كان يمدّه فيُقصّ فلا يُقرأ منه شيء.
        rec.expiresAt
          ? el('span', { title: `تُحذف في ${formatDate(rec.expiresAt)}` }, badge(`تُحذف ${relativeDays(rec.expiresAt)}`, 'badge-warn'))
          : badge('دائمة', 'badge-ok')),
      el('div', { class: 'stamp-tools' },
        el('button', {
          type: 'button', class: 'btn btn-sm', text: '⬇ حمّلها',
          onClick: async () => {
            const url = await getImageUrl(rec.id);
            if (!url) { toast('الملف غير موجود', 'error'); return; }
            const a = el('a', { href: url, download: rec.originalName || `مختوم-${rec.id}.jpg` });
            document.body.append(a);
            a.click();
            a.remove();
          },
        }),
        rec.expiresAt ? el('button', {
          type: 'button', class: 'btn btn-sm', text: '📌 ثبّتها',
          title: 'تصير دائمة فلا تُحذف',
          onClick: async () => {
            await keepForever(rec.id);
            ctx.stamped = await listStamped();
            renderLibrary(ctx);
            toast('صارت دائمة', 'success');
          },
        }) : null,
        el('button', {
          type: 'button', class: 'btn btn-ghost btn-sm danger', text: '🗑',
          title: 'احذفها الآن',
          onClick: async () => {
            await removeImage(rec.id);
            ctx.stamped = await listStamped();
            renderLibrary(ctx);
          },
        }))));
  }
}

/* ===== المعاينة الحيّة ===== */

async function refreshPreview(ctx) {
  const box = ctx.nodes.preview;
  if (!box) return;
  const sample = ctx.items.find((x) => !x.video) || null;
  clear(box);
  if (!sample) {
    box.append(el('p', { class: 'muted small', text: 'أضف صورةً أدناه لترى الختم عليها قبل أن تختم الدفعة كلّها.' }));
    return;
  }
  if (!ctx.patterns.some((p) => p.logoId)) {
    box.append(el('p', { class: 'muted small', text: 'اختر شعارًا لترى المعاينة.' }));
    return;
  }
  // المعاينة بحجمٍ صغير: الصورة الأصلية قد تكون ٤٠٠٠ بكسل، ورسمها في كل تحريكٍ للمزلاج
  // يُجمّد الصفحة. والنسبة محفوظة، فما تراه هو ما سيكون.
  try {
    const { blob } = await stampImage(sample.file, ctx.patterns, ctx.logoBlobs, { maxDim: 700, quality: 0.8 });
    const url = URL.createObjectURL(blob);
    const img = el('img', { src: url, alt: 'معاينة الختم' });
    img.addEventListener('load', () => URL.revokeObjectURL(url), { once: true });
    box.append(img, el('p', { class: 'muted small', text: `معاينة «${sample.name}» — الختم يُحرق في نسخةٍ جديدة، والأصل يبقى كما هو.` }));
  } catch (err) {
    box.append(el('p', { class: 'field-hint', text: `تعذّرت المعاينة: ${err.message}` }));
  }
}

void openModal;
void emptyState;
