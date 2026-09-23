// صفحة الإعدادات: المستخدم، النسخ الاحتياطي، التخزين، القوائم القابلة للإضافة،
// الحقول المخصصة، تعريف "مكتمل البيانات"، والبيانات التجريبية.

import { repo, getCurrentUser } from '../data/repository.js';
import { activeMembers } from '../util/team.js';
import { ENUMS, COMPLETENESS_CANDIDATES, labelFor } from '../data/schema.js';
import {
  updateUserName, userHandle, getTeam, setTeam, getLists, addPropertyType, removePropertyType, addPropertyStatus, removePropertyStatus,
  addClientTag, removeClientTag, isBuiltinClientTag, addSource, removeSource, addCity, addDistrict, removeDistrict,
  getCustomFields, addCustomField, removeCustomField, getCompleteness, setCompleteness, getBackupInfo,
  getMatchingSettings, setMatchingSettings, DEFAULT_MATCHING, getZones, addZone, updateZone, removeZone,
  getFollowUpSettings, setFollowUpSettings,
  getSidebarOrder, setSidebarOrder, resetSidebarOrder, orderedPageKeys,
  getCompany, setCompany, getVaultSettings, setVaultSettings, getTemplates, setTemplates, resetTemplates,
  getGoals, setGoals,
  getCampaigns, setCampaigns, // الحملات (المرحلة ٤٩)
} from '../data/settings.js';
import {
  listBackupBatches, uploadBackup, restoreBackup, uploadImages, listImageBackups, restoreImages,
  inspectBackup, mergeFromVault, settingsFromVault,
} from '../data/vault.js';
import { pushSupported, enablePush, disablePush, currentSubscription, syncReminders } from '../util/push.js';
import { TEMPLATE_VARS } from '../util/templates.js';
import { CAMPAIGN_CHANNELS } from '../util/campaigns.js';
import { SHORTCUTS } from '../util/shortcuts.js';
import {
  parseVCards, importContacts, buildVCards, buildCsv, CSV_EXPORTS, supportsRange,
  parseCsv, CSV_IMPORTS, suggestMapping, previewImport, runImport,
} from '../data/exchange.js';
import { typeLabel as typeLabelOf, statusLabel as statusLabelOf, getUI, setUI } from '../data/settings.js';
import { SIDEBAR_PAGES, DEFAULT_PAGE_KEYS, pageLabel, applySidebarOrder, getSections, saveSections, buildDefaultSections } from '../util/sidebar.js';
import { applyTheme } from '../util/theme.js';
import { storeImage, getImageUrl, removeImage } from '../data/images.js';
import { requestFollowUpPermission } from '../util/follow-up-alerts.js';
import { ALERT_RULES, ruleOn } from '../util/alert-rules.js';
import { getPlans, setPlans, PLAN_TRIGGERS, PLAN_STEP_TYPES, SAMPLE_PLAN } from '../data/settings.js';
import { getPlaybooks, setPlaybooks } from '../data/settings.js';
import { exportBackup, downloadBlob, markExported, readBackupFile, importBackup } from '../data/backup.js';
import { imagesSummary, formatBytes, storageStatus } from '../data/images.js';
import { audioSummary } from '../data/audio.js';
import { seedExists, insertSeed, clearSeed } from '../data/seed.js';
import { el, clear, labeled, selectEl, checkbox, badge, confirmDialog, promptDialog, openModal, toast, appendChildren, debounce, isNarrow } from '../util/dom.js';
import { clientTagClass } from '../data/schema.js';
import { formatDate, formatDateTime, relativeDays, setHijriMode, formatNumber, countWord, toInputDate, fromInputDate, countOf } from '../util/format.js';
import { hijriSupported } from '../util/hijri.js';

const dataChanged = () => window.dispatchEvent(new CustomEvent('kassab:data-changed'));

export async function render(container) {
  clear(container);
  container.append(el('div', { class: 'page-head' }, el('h1', { text: 'الإعدادات' })));
  panelIndex = 0; // عدّادُ الطيّ على الجوّال: الأوّلُ مفتوحٌ وما بعده مطويّ
  const grid = el('div', { class: 'settings-grid' });
  // **فهرسٌ وبحث قبل الشبكة (المرحلة ٤٣):** الصفحةُ واحدٌ وعشرون لوحًا في نحو خمس عشرة
  // شاشة، وكانت بلا تبويبٍ ولا فهرسٍ ولا بحث — فمن أراد «أوزان المعايير» مرّر بالتخمين.
  container.append(settingsNav(grid));
  container.append(grid);
  grid.append(
    panel('المستخدم الحالي', 'اسمك يُسجَّل على كل ما تنشئه أو تعدّله، ويظهر في السجلّات باسمك.', userBody),
    panel('الفريق', 'أعضاء مكتبك: تُسنَد إليهم العملاء والعقارات والطلبات، وتُنسب السجلّات إليهم، ويُقاس عمل كل واحد. وهذا تمييزٌ وتنسيق لا حجب — اقرأ الحدّ المكتوب في اللوحة.', teamBody),
    panel('المظهر والتاريخ', 'فاتح أو داكن، وإظهار التاريخ الهجري مع الميلادي.', themeBody),
    panel('القفل التلقائي', 'يقفل التطبيق بعد مدّة بلا نشاط — لأن جوالًا على طاولة مجلس يعني قائمة عملائك مكشوفة. معطَّل حتى تضبط مدّته.', autoLockBody),
    panel('ترتيب صفحات القائمة الجانبية', 'رتّب الصفحات كما تريد رؤيتها في القائمة. كل الصفحات تبقى ظاهرة؛ الترتيب فقط هو ما يُحفظ.', sidebarOrderBody),
    panel('بيانات الشركة والمستندات', 'ما يُطبع أعلى الفاتورة وعرض السعر: الاسم والشعار وبيانات التواصل، وسلسلتا الترقيم التلقائي.', companyBody),
    panel('النسخ الاحتياطي', 'البيانات محفوظة في هذا المتصفح فقط. الملف الواحد يحوي كل شيء بما فيه الصور والإعدادات.', backupBody),
    // للمالك وحده (المرحلة ٣٥): الخزنة فيها بيانات المكتب كلها، والخادم يرفضها بدور المساعد.
    panel('النسخة السحابية المشفَّرة', 'نسخة مشفَّرة في متصفحك قبل رفعها — الخادم لا يستطيع قراءتها. تحمي بياناتك لو ضاع الجهاز، وتنقلها إلى جهاز آخر.', vaultBody, { ownerOnly: true }),
    panel('التخزين والصور', 'ما تشغله البيانات على هذا الجهاز. لحذف صور بعينها افتح العقار واحذفها من نموذجه.', storageBody),
    panel('القوائم', 'أنواع العقار وحالاته وتصنيفات العملاء والمدن والأحياء. المدمج لا يُحذف؛ ما أضفته يُحذف ما لم يكن مستعملًا.', listsBody),
    panel('الحقول الإضافية', 'حقول تظهر في نموذج العقار لكل الأنواع أو لأنواع محددة.', customFieldsBody),
    panel('المطابقة', 'أوزان المعايير المرجّحة وحدود المرونة. المرونة في اتجاه واحد: الأرخص من الميزانية والأكبر من المساحة لا يُخصم منهما.', matchingBody),
    panel('نطاقات الأحياء', 'مجموعة أحياء بمسمّى واحد («شمال الدائري الشمالي») تُعرَّف مرة وتُستعمل في أي طلب. نطاقات الرياض الخمسة مسودّة تقريبية — راجعها وعدّلها.', zonesBody),
    panel('تعريف "مكتمل البيانات"', 'العقار يُعدّ مكتملًا عندما تتوفر فيه الحقول المحددة هنا.', completenessBody),
    panel('الأهداف والتنبيهات', 'هدفك الشهري يظهر شريط تقدّم في «يومي»، وحدّ العرض البائت ينبّهك على المخزون الراكد.', goalsBody),
    panel('متابعة العملاء والتنبيهات', 'حدّ "لم يُتواصل معه"، وقائمةُ ما يوقظك: العقودُ والمستحقّاتُ والتمويلُ والصيانةُ والمعاينات.', followUpBody),
    panel('استيراد وتصدير', 'استيراد جهات اتصالك عملاءَ دفعة واحدة، وتصدير جداولك إلى ملفات تفتحها في إكسل.', exchangeBody),
    panel('خطط المتابعة', 'سلسلة خطوات بأيامها تُنشأ مهامها تلقائيًا عند حدث — بدل أن تتذكّر أنت. لا تعمل خطة حتى تُفعّلها.', plansBody),
    panel('نقاط المكالمات', 'ما تقوله في كل نوع مكالمة — يظهر مطويًّا داخل نافذة تسجيل التواصل. نصّ محض: لا يُنشئ مهمة ولا يُرسل شيئًا.', playbooksBody),
    panel('اختصارات لوحة المفاتيح', 'ثلاثةٌ لا رابعَ لها — ومن يُدخل عشرين سجلًّا في الجلسة توفّر عليه الفأرة.', shortcutsBody),
    panel('الحملات التسويقيّة', 'المصدرُ قناة، والحملةُ حملةٌ بعينها فيها بمدّتها وميزانيتها — وبها يُقاس ما جلبته كلُّ واحدةٍ على حدة: كم طلبًا، وكم جادًّا، وبكم كلّفك الطلب.', campaignsBody),
    panel('قوالب رسائل واتساب', 'رسائل جاهزة تُرسل بنقرة من قائمة مشاركة العقار، وتُعبَّأ ببيانات العقار والعميل تلقائيًا.', templatesBody),
    panel('تنبيهات الخلفية', 'تذكير المهام يصلك على الجهاز حتى بعد إغلاق التبويب. لا يغادر جهازك إلا موعد التذكير — بلا عناوين ولا أسماء.', pushBody),
    panel('سلة المحذوفات', 'نسخة من كل سجل حذفته خلال ثلاثين يومًا. يُستعاد السجل نفسه — أما ما حُذف تبعًا له (طلبات العميل مثلًا) فلا يعود.', trashBody),
    panel('البيانات التجريبية', 'عملاء وعقارات للتجربة (مع سجل واحد لكل كيان من المراحل اللاحقة لاختبار طبقة البيانات)؛ تُدرج تلقائيًا عند أول تشغيل، ومسحها لا يمس بياناتك الحقيقية.', seedBody),
  );
}

/** معرّفٌ ثابت من العنوان — يصلح مرساةً للقفز إليه، ولا يتغيّر ما لم يتغيّر العنوان. */
const panelId = (title) => 'set-' + String(title).replace(/\s+/g, '-');

/**
 * شريطُ قفزٍ وبحثٍ في أعلى الإعدادات.
 *
 * والبحثُ **يُخفي اللوحات غير الموافقة ولا يحذفها**، فحالتُها الداخلية (ما كتبتَه في حقلٍ
 * ولم تحفظه) تبقى. ويُبنى من اللوحات نفسها بعد رسمها، فلا قائمةَ ثانيةٌ تُنسى حين تُضاف
 * لوحةٌ جديدة.
 */
function settingsNav(grid) {
  const chips = el('div', { class: 'chips settings-nav-chips' });
  const search = el('input', {
    class: 'input search', type: 'search', placeholder: 'ابحث في الإعدادات… (اسم اللوح أو وصفه)',
    'aria-label': 'بحث في الإعدادات',
  });
  const count = el('span', { class: 'muted small' });

  const panels = () => [...grid.querySelectorAll(':scope > .panel')];
  const apply = () => {
    const q = search.value.trim().toLowerCase();
    let shown = 0;
    for (const p of panels()) {
      // **`textContent` لا `innerText`**: اللوحُ المطويّ على الجوّال لا يظهر نصُّه في
      // `innerText` أصلًا، فكان البحثُ يعمى عن كلّ لوحٍ مطويّ — وهي كلُّها إلّا الأوّل.
      const hit = !q || (p.dataset.title || '').toLowerCase().includes(q) || p.textContent.toLowerCase().includes(q);
      p.hidden = !hit;
      if (hit) shown += 1;
      // وما وافق البحثَ يُفتح ليُقرأ، فلا يُقال «وجدتُ ثلاثة» ولا يُرى منها شيء.
      if (q && hit) p.classList.add('set-open');
    }
    for (const c of chips.children) {
      const target = grid.querySelector('#' + CSS.escape(c.dataset.target || ''));
      c.hidden = !!q && !!target && target.hidden;
    }
    count.textContent = q ? `${formatNumber(shown)} من ${formatNumber(panels().length)}` : '';
  };
  search.addEventListener('input', debounce(apply, 150));

  // تُبنى الرقائق بعد أن تمتلئ الشبكة — والرسم متزامنٌ في `render`، فيكفي تأجيلٌ واحد.
  setTimeout(() => {
    clear(chips);
    for (const p of panels()) {
      chips.append(el('button', {
        type: 'button', class: 'chip', text: p.dataset.title || '', 'data-target': p.id,
        onClick: () => { p.classList.add('set-open'); p.scrollIntoView({ behavior: 'smooth', block: 'start' }); },
      }));
    }
  }, 0);

  // **`<nav>` لا `.panel`**: الفهرس يحمل عناوين اللوحات كلَّها نصًّا، فلو كان `.panel`
  // أصابه كلُّ بحثٍ عن لوحٍ باسمه قبل اللوح نفسه. والوسمُ الدلاليّ أصحُّ هنا على كلّ حال.
  return el('nav', { class: 'settings-nav', 'aria-label': 'فهرس الإعدادات' },
    el('div', { class: 'row', style: { gap: '8px', flexWrap: 'wrap' } }, search, count),
    chips);
}

/**
 * **خمسةٌ وعشرون لوحًا مفتوحةً على شاشة الجوّال** (المرحلة ٥٢): قِيست الصفحةُ فبلغت
 * سبعًا وعشرين شاشةَ تمرير، وآخرُ لوحٍ فيها — «البيانات التجريبية» — لا يبلغه أحدٌ إلّا
 * بعزم. فيُفتح الأوّلُ وحدَه، ويُطوى ما بعده خلف عنوانِه، والبحثُ فوق يفتح ما يوافقه.
 *
 * وعلى الشاشة الواسعة لا يتغيّر شيء: اللوحاتُ كلُّها مفتوحةٌ كما كانت.
 */
let panelIndex = 0;

function foldOnMobile(node, head) {
  if (!isNarrow()) return;
  const open = panelIndex++ === 0;
  node.classList.add('set-fold');
  if (open) node.classList.add('set-open');
  const btn = el('button', {
    type: 'button', class: 'set-fold-toggle', text: head.textContent,
    'aria-expanded': open ? 'true' : 'false',
    onClick: () => {
      const on = node.classList.toggle('set-open');
      btn.setAttribute('aria-expanded', on ? 'true' : 'false');
    },
  });
  clear(head);
  head.append(btn);
}

function panel(title, desc, bodyFn, { ownerOnly = false } = {}) {
  const body = el('div', { class: 'panel-body' });
  const attrs = { class: 'panel', id: panelId(title), 'data-title': title };
  if (ownerOnly) attrs['data-owner-only'] = '';
  const head = el('h2', { text: title });
  const node = el('section', attrs,
    head, el('p', { class: 'panel-desc', text: desc }), body);
  foldOnMobile(node, head);
  const redraw = async () => {
    clear(body);
    try {
      body.append(await bodyFn(redraw));
    } catch (err) {
      body.append(el('div', { class: 'error-box', text: err.message || String(err) }));
    }
  };
  redraw();
  return node;
}

const errToast = (err) => toast(err?.message || 'حدث خطأ غير متوقع', 'error');

/* ===== المستخدم ===== */

async function userBody() {
  const user = getCurrentUser();
  const input = el('input', { class: 'input', type: 'text', value: user.name || '' });
  return el('div', { class: 'row' },
    input,
    el('button', {
      type: 'button', class: 'btn btn-primary', text: 'حفظ الاسم',
      onClick: async () => {
        try { await updateUserName(input.value); toast('تم حفظ الاسم', 'success'); } catch (err) { errToast(err); }
      },
    }),
    // «المعرّف» كان سطرًا من ٣٦ حرفًا لا يُقرأ ولا يُملى في الهاتف. وهو يلزم أحيانًا
    // (يُوسَم به من غيَّر السجلّ في «ماذا تغيّر ومتى»)، فلا يُحذف: يُختصر إلى يوزرٍ قصير
    // يُقرأ ويُنطق، والكامل تحت الضغط ينسخه من أراده. (المرحلة ٣٨)
    el('button', {
      type: 'button', class: 'btn btn-ghost btn-sm', title: `المعرّف الكامل: ${user.id} — اضغط لنسخه`,
      onClick: async () => {
        try {
          await navigator.clipboard.writeText(user.id);
          toast('نُسخ المعرّف الكامل', 'success');
        } catch { toast(`المعرّف: ${user.id}`); }
      },
    }, 'يوزر: ', el('span', { class: 'ltr', text: userHandle(user) })),
    // بوابة الدخول (المرحلة ٩) تُدار من الخادم؛ هذا الرابط يمسح كوكي الجلسة فقط.
    el('a', { class: 'btn btn-ghost', href: '/__logout', text: 'تسجيل الخروج' }));
}

/* ===== النسخ الاحتياطي ===== */

async function backupBody(redraw) {
  const info = await getBackupInfo();
  const counts = await repo.counts();
  const fileInput = el('input', {
    type: 'file', accept: '.json,application/json', class: 'visually-hidden',
    onChange: async (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      try {
        const { data, counts: fileCounts, exportedAt } = await readBackupFile(file);
        // مقارنة صريحة قبل الاستبدال (المرحلة ٢١): «سيُستبدل كل شيء» جملةٌ لا يقرؤها أحد،
        // أما «١٢ عميلًا ← ٩» فرقمٌ يوقفك. والفقد يُحسب لكل كيان لا إجمالًا.
        const current = await repo.counts();
        const compare = ['clients', 'properties', 'requests', 'deals', 'invoices', 'images']
          .map((key) => ({ key, now: current[key] ?? 0, next: fileCounts[key] ?? 0 }))
          .filter((rowData) => rowData.now || rowData.next);
        const losing = compare.filter((c) => c.next < c.now);
        const label = { clients: 'العملاء', properties: 'العقارات', requests: 'الطلبات', deals: 'الصفقات', invoices: 'الفواتير', images: 'الصور' };
        const ok = await confirmDialog({
          title: 'استيراد نسخة احتياطية',
          message: `النسخة من ${exportedAt ? formatDateTime(exportedAt) : 'تاريخ غير معروف'}.\n`
            + `${compare.map((c) => `${label[c.key]}: ${c.now} ← ${c.next}`).join(' · ')}\n`
            + (losing.length
              ? `تحذير: ستفقد ${losing.map((c) => `${c.now - c.next} من ${label[c.key]}`).join('، ')} — وهذا لا يُستعاد إلا بنسخة أحدث.\n`
              : '')
            + 'الاستيراد يستبدل كل ما في هذا المتصفح بمحتوى الملف. المتابعة؟`'.replace('`', ''),
          confirmText: 'استبدال واستيراد', danger: true,
        });
        if (!ok) return;
        await importBackup(data);
        toast('تم الاستيراد؛ يُعاد التحميل…', 'success');
        setTimeout(() => location.reload(), 800);
      } catch (err) {
        errToast(err);
      }
    },
  });
  return el('div', {},
    el('dl', { class: 'kv' },
      el('dt', { text: 'آخر تصدير' }),
      el('dd', {}, info.lastExportAt ? `${formatDateTime(info.lastExportAt)} (${relativeDays(info.lastExportAt)})` : badge('لم يُصدَّر بعد', 'badge-warn')),
      el('dt', { text: 'السجلات' }),
      el('dd', { text: `عملاء: ${counts.clients} · عقارات: ${counts.properties} · صور: ${counts.images}` })),
    el('div', { class: 'row' },
      el('button', {
        type: 'button', class: 'btn btn-primary', text: 'تصدير نسخة احتياطية',
        onClick: async (e) => {
          const btn = e.currentTarget;
          btn.disabled = true;
          try {
            const { blob, filename } = await exportBackup();
            downloadBlob(blob, filename);
            await markExported();
            toast(`تم تصدير ${filename}`, 'success');
            dataChanged();
            redraw();
          } catch (err) {
            errToast(err);
          } finally {
            btn.disabled = false;
          }
        },
      }),
      el('button', { type: 'button', class: 'btn', text: 'استيراد من ملف…', onClick: () => fileInput.click() }),
      fileInput));
}

/* ===== التخزين ===== */

async function storageBody() {
  const [summary, voice] = await Promise.all([imagesSummary(), audioSummary()]);
  const rows = [
    el('dt', { text: 'الصور' }), el('dd', { text: `${countOf(summary.count, 'صورة')} — ${formatBytes(summary.bytes)}` }),
  ];
  // الملاحظات الصوتية (المرحلة ٢٦): لا تظهر ما لم توجد — سطرٌ بصفرٍ دائم ضجيج.
  if (voice.count) {
    rows.push(el('dt', { text: 'الملاحظات الصوتية' }),
      el('dd', { text: `${countOf(voice.count, 'تسجيل')} — ${formatBytes(voice.bytes)}` }));
  }
  // الحسابُ مشتركٌ في `storageStatus` (المرحلة ٤٧): كان هنا وحده، فكان الإنذارُ في
  // الصفحة التي لا تُفتح في الجولة. وصار يُقرأ من «يومي» ومن صفحة الالتقاط أيضًا،
  // **بقياسٍ واحدٍ لا قياسين يختلفان**.
  let warning = null;
  const st = await storageStatus();
  if (st.supported) {
    rows.push(el('dt', { text: 'المستخدم من المتصفح' }),
      el('dd', { text: `${formatBytes(st.usage)} من ${formatBytes(st.quota)} متاحة${st.quota ? ` (${st.pct}٪)` : ''}` }));
    // التحذير قبل الامتلاء لا بعده: الامتلاء **أثناء جولة ميدانية** يعني ضياع التقاط اليوم.
    if (st.low) {
      warning = el('div', { class: 'notice notice-warn' },
        el('strong', { text: `التخزين بلغ ${st.pct}٪ من المتاح. ` }),
        st.imagesLeft != null ? `يكفي نحو ${countOf(st.imagesLeft, 'صورة')} تقريبًا. ` : '',
        'صدّر نسخة احتياطية الآن، ثم احذف صور العقارات المبيعة أو المؤجَّرة من نماذجها. ',
        'وامتلاؤه أثناء جولة ميدانية يعني ضياع التقاط اليوم.');
    }
  }
  return el('div', {}, warning, el('dl', { class: 'kv' }, rows));
}

/* ===== القوائم ===== */

function chipList(items, { labelOf = (x) => x, removable = () => false, onRemove }) {
  return el('div', { class: 'chips' }, items.map((item) => el('span', { class: 'chip chip-static' },
    labelOf(item),
    removable(item) ? el('button', { type: 'button', class: 'chip-x', text: '✕', title: 'حذف', onClick: () => onRemove(item) }) : null)));
}

async function listsBody(redraw) {
  const lists = await getLists();
  const act = (fn) => async () => { try { await fn(); await redraw(); } catch (err) { errToast(err); } };

  /* أنواع العقار */
  const typeInput = el('input', { class: 'input', type: 'text', placeholder: 'نوع جديد: عمارة، استراحة…' });
  const typeGroupSel = selectEl({ options: ENUMS.typeFieldGroups.map((g) => ({ value: g.key, label: g.label })), value: 'built' });
  const typesBlock = el('div', { class: 'panel-block' },
    el('h3', { text: 'أنواع العقار' }),
    chipList(lists.propertyTypes, {
      labelOf: (t) => `${t.label} (${labelFor(ENUMS.typeFieldGroups, t.group).split(' ')[0]})`,
      removable: (t) => !t.builtin,
      onRemove: (t) => act(() => removePropertyType(t.key))(),
    }),
    el('div', { class: 'row', style: { marginTop: '8px' } },
      typeInput, typeGroupSel,
      el('button', { type: 'button', class: 'btn', text: 'إضافة', onClick: act(() => addPropertyType({ label: typeInput.value, group: typeGroupSel.value })) })));

  /* حالات العقار */
  const statusInput = el('input', { class: 'input', type: 'text', placeholder: 'حالة جديدة' });
  const statusesBlock = el('div', { class: 'panel-block' },
    el('h3', { text: 'حالات العقار' }),
    chipList(lists.propertyStatuses, { labelOf: (s) => s.label, removable: (s) => !s.builtin, onRemove: (s) => act(() => removePropertyStatus(s.key))() }),
    el('div', { class: 'row', style: { marginTop: '8px' } },
      statusInput,
      el('button', { type: 'button', class: 'btn', text: 'إضافة', onClick: act(() => addPropertyStatus(statusInput.value)) })));

  /* تصنيفات العملاء — «جادّ» و«مهم» مدمجان بلونيهما، لا يُحذفان، ويرفعان صاحبهما أعلى القوائم */
  const tagInput = el('input', { class: 'input', type: 'text', placeholder: 'تصنيف جديد: مستثمر، مطوّر…' });
  const tagChips = el('div', { class: 'chips' }, lists.clientTags.map((t) => el('span', { class: `chip chip-static ${clientTagClass(t)}`.trim() },
    t,
    isBuiltinClientTag(t) ? null : el('button', { type: 'button', class: 'chip-x', text: '✕', title: 'حذف', onClick: () => act(() => removeClientTag(t))() }))));
  const tagsBlock = el('div', { class: 'panel-block' },
    el('h3', { text: 'تصنيفات العملاء' }),
    el('p', { class: 'muted small', text: '«جادّ» و«مهم» مدمجان بلونين ثابتين ولا يُحذفان؛ أي عميل يحمل أحدهما يظهر أعلى صفحات العملاء والطلبات والمطابقات («جادّ» قبل «مهم»).' }),
    tagChips,
    el('div', { class: 'row', style: { marginTop: '8px' } },
      tagInput,
      el('button', { type: 'button', class: 'btn', text: 'إضافة', onClick: act(() => addClientTag(tagInput.value)) })));

  /* مصادر الإحالة (تاق المصدر) — اقتراحات فقط، تتكوّن مما استُعمل فعلًا */
  const sourceInput = el('input', { class: 'input', type: 'text', placeholder: 'مصدر جديد: اسم وسيط، منصة…' });
  const sourcesBlock = el('div', { class: 'panel-block' },
    el('h3', { text: 'مصادر الإحالة' }),
    el('p', { class: 'muted small', text: 'اقتراحات حقل «المصدر» في العقار والعميل والطلب. الحقل نصّي حر: أي قيمة جديدة تكتبها تُضاف هنا تلقائيًا، وحذفها من هنا لا يمسّ السجلات.' }),
    lists.sources.length
      ? chipList(lists.sources, { removable: () => true, onRemove: (x) => act(() => removeSource(x))() })
      : el('p', { class: 'muted small', text: 'لا مصادر بعد.' }),
    el('div', { class: 'row', style: { marginTop: '8px' } },
      sourceInput,
      el('button', { type: 'button', class: 'btn', text: 'إضافة', onClick: act(() => addSource(sourceInput.value)) })));

  /* المدن والأحياء */
  const districtsChips = el('div');
  const cityInput = el('input', { class: 'input', type: 'text', placeholder: 'مدينة جديدة' });
  const districtInput = el('input', { class: 'input', type: 'text', placeholder: 'حي جديد للمدينة المختارة' });
  const citySel = selectEl({ options: lists.cities.map((c) => ({ value: c, label: c })), value: lists.cities[0], onChange: () => drawDistricts() });
  const drawDistricts = () => {
    clear(districtsChips);
    const city = citySel.value;
    const extras = new Set(lists.extras.districts[city] || []);
    const items = lists.districtsByCity[city] || [];
    districtsChips.append(
      el('p', { class: 'muted small', text: `${countOf(items.length, 'حي')} في ${city}` }),
      items.length
        ? chipList(items, { removable: (d) => extras.has(d), onRemove: (d) => act(() => removeDistrict(city, d))() })
        : el('p', { class: 'muted small', text: 'لا أحياء بعد لهذه المدينة.' }));
  };
  drawDistricts();
  const citiesBlock = el('div', { class: 'panel-block' },
    el('h3', { text: 'المدن والأحياء' }),
    el('div', { class: 'row' },
      citySel,
      cityInput,
      el('button', { type: 'button', class: 'btn', text: 'إضافة مدينة', onClick: act(() => addCity(cityInput.value)) })),
    el('div', { style: { marginTop: '10px' } }, districtsChips),
    el('div', { class: 'row', style: { marginTop: '8px' } },
      districtInput,
      el('button', { type: 'button', class: 'btn', text: 'إضافة حي', onClick: act(() => addDistrict(citySel.value, districtInput.value)) })));

  return el('div', {}, typesBlock, statusesBlock, tagsBlock, sourcesBlock, citiesBlock);
}

/* ===== الحقول الإضافية ===== */

async function customFieldsBody(redraw) {
  const [fields, lists] = await Promise.all([getCustomFields(), getLists()]);
  const typeName = (key) => lists.propertyTypes.find((t) => t.key === key)?.label ?? key;
  const table = fields.length
    ? el('table', { class: 'cf-table' },
      el('thead', {}, el('tr', {}, ['الحقل', 'النوع', 'يظهر لـ', ''].map((t) => el('th', { text: t })))),
      el('tbody', {}, fields.map((f) => el('tr', {},
        el('td', { text: f.label }),
        el('td', { text: labelFor(ENUMS.customFieldInputs, f.input) }),
        el('td', { text: f.forTypes?.length ? f.forTypes.map(typeName).join('، ') : 'كل الأنواع' }),
        el('td', {}, el('button', {
          type: 'button', class: 'icon-btn', text: '✕', title: 'حذف الحقل',
          onClick: async () => {
            const ok = await confirmDialog({ title: 'حذف الحقل', message: `حذف حقل «${f.label}»؟ القيم المحفوظة في العقارات تبقى مخزنة لكنها لن تظهر.`, confirmText: 'حذف', danger: true });
            if (!ok) return;
            try { await removeCustomField(f.key); await redraw(); } catch (err) { errToast(err); }
          },
        }))))))
    : el('p', { class: 'muted small', text: 'لا حقول إضافية بعد.' });

  const labelInput = el('input', { class: 'input', type: 'text', placeholder: 'اسم الحقل، مثال: رقم الصك' });
  const inputSel = selectEl({ options: ENUMS.customFieldInputs.map((i) => ({ value: i.key, label: i.label })), value: 'text' });
  const typesBox = el('div', { class: 'check-group' }, lists.propertyTypes.map((t) => checkbox(t.label, { name: 'cf-type', value: t.key })));
  return el('div', {},
    table,
    el('div', { class: 'form-grid' },
      labeled('اسم الحقل', labelInput),
      labeled('نوع القيمة', inputSel),
      el('div', { class: 'field field-full' },
        el('span', { class: 'field-label', text: 'يظهر للأنواع (اتركها كلها فارغة ليظهر لكل الأنواع)' }), typesBox),
      el('div', { class: 'field-full' }, el('button', {
        type: 'button', class: 'btn', text: 'إضافة الحقل',
        onClick: async () => {
          try {
            await addCustomField({ label: labelInput.value, input: inputSel.value, forTypes: [...typesBox.querySelectorAll('input:checked')].map((i) => i.value) });
            await redraw();
          } catch (err) { errToast(err); }
        },
      }))));
}

/* ===== المطابقة (المرحلة ٣) ===== */

async function matchingBody(redraw) {
  const m = await getMatchingSettings();
  const numInput = (value, { step = '1', min = '0' } = {}) => el('input', { class: 'input', type: 'number', value, step, min });

  const wDistrict = numInput(m.weights.district);
  const wPrice = numInput(m.weights.price);
  const wArea = numInput(m.weights.area);
  const wRooms = numInput(m.weights.rooms);
  const pPercent = numInput(m.price.percent);
  const pSale = numInput(m.price.minSale, { step: '10000' });
  const pRent = numInput(m.price.minRent, { step: '1000' });
  const pInvest = numInput(m.price.minInvestment, { step: '10000' });
  const aPercent = numInput(m.area.percent);
  const aMin = numInput(m.area.minSqm, { step: '5' });
  const minScore = numInput(m.minScore, { step: '5' });
  const ownBox = checkbox('لا تُعرض على العميل عقاراته هو', { checked: m.excludeOwnProperties });

  const num = (input, fallback) => (input.value === '' ? fallback : Number(input.value));
  return el('div', {},
    el('div', { class: 'panel-block' },
      el('h3', { text: 'أوزان المعايير المرجّحة' }),
      el('p', { class: 'muted small', text: 'النسبة تُحسب على المعايير المعروفة فقط؛ وأي قيمة غير معروفة (سعر أو مساحة أو حي) تُرفع من الحساب وتُوسَم.' }),
      el('div', { class: 'form-grid' },
        labeled('الحي', wDistrict), labeled('السعر', wPrice), labeled('المساحة', wArea), labeled('عدد الغرف', wRooms))),
    el('div', { class: 'panel-block' },
      el('h3', { text: 'مرونة السعر' }),
      el('p', { class: 'muted small', text: 'المرونة = النسبة من سقف الميزانية، وإن قلّت عن الحدّ الأدنى بحسب الغرض رُفعت إليه. وكل طلب يقبل نسبة أو مبلغًا خاصًّا يتجاوز هذا.' }),
      el('div', { class: 'form-grid' },
        labeled('النسبة ٪', pPercent),
        labeled('الحدّ الأدنى — بيع (ريال)', pSale),
        labeled('الحدّ الأدنى — إيجار (ريال)', pRent),
        labeled('الحدّ الأدنى — استثمار (ريال)', pInvest))),
    el('div', { class: 'panel-block' },
      el('h3', { text: 'مرونة المساحة' }),
      el('div', { class: 'form-grid' },
        labeled('النسبة ٪', aPercent),
        labeled('الحدّ الأدنى (م²)', aMin))),
    el('div', { class: 'panel-block' },
      el('h3', { text: 'صفحة المطابقات' }),
      el('div', { class: 'form-grid' },
        labeled('الحدّ الابتدائي لشريط "أظهر ما نسبته ≥" ٪', minScore, { hint: 'قيمة ابتدائية فقط؛ الشريط في الصفحة يتغير وقت العمل' }),
        el('div', { class: 'field' }, el('span', { class: 'field-label', text: 'استبعاد تلقائي' }), ownBox))),
    el('div', { class: 'row', style: { marginTop: '14px' } },
      el('button', {
        type: 'button', class: 'btn btn-primary', text: 'حفظ إعدادات المطابقة',
        onClick: async () => {
          try {
            await setMatchingSettings({
              weights: {
                district: num(wDistrict, DEFAULT_MATCHING.weights.district),
                price: num(wPrice, DEFAULT_MATCHING.weights.price),
                area: num(wArea, DEFAULT_MATCHING.weights.area),
                rooms: num(wRooms, DEFAULT_MATCHING.weights.rooms),
              },
              price: {
                percent: num(pPercent, DEFAULT_MATCHING.price.percent),
                minSale: num(pSale, DEFAULT_MATCHING.price.minSale),
                minRent: num(pRent, DEFAULT_MATCHING.price.minRent),
                minInvestment: num(pInvest, DEFAULT_MATCHING.price.minInvestment),
              },
              area: { percent: num(aPercent, DEFAULT_MATCHING.area.percent), minSqm: num(aMin, DEFAULT_MATCHING.area.minSqm) },
              minScore: num(minScore, DEFAULT_MATCHING.minScore),
              excludeOwnProperties: ownBox.querySelector('input').checked,
            });
            toast('حُفظت إعدادات المطابقة', 'success');
            await redraw();
          } catch (err) { errToast(err); }
        },
      }),
      el('button', {
        type: 'button', class: 'btn btn-ghost', text: 'إرجاع الافتراضي',
        onClick: async () => {
          const ok = await confirmDialog({ title: 'إرجاع الافتراضي', message: 'إرجاع كل إعدادات المطابقة إلى قيمها الافتراضية؟', confirmText: 'إرجاع' });
          if (!ok) return;
          try { await setMatchingSettings(DEFAULT_MATCHING); await redraw(); } catch (err) { errToast(err); }
        },
      })));
}

/* ===== نطاقات الأحياء (المرحلة ٣) ===== */

async function openZoneForm({ city, zone, districts, onSaved }) {
  const selected = new Set(zone ? zone.districts : []);
  const labelInput = el('input', { class: 'input', type: 'text', value: zone ? zone.label : '', placeholder: 'مثال: شمال الدائري الشمالي' });
  const countNode = el('span', { class: 'muted small' });
  const box = el('div', { class: 'check-group zone-picker' });
  const searchInput = el('input', { class: 'input', type: 'search', placeholder: 'تصفية الأحياء…' });

  const draw = () => {
    clear(box);
    const q = searchInput.value.trim();
    const items = q ? districts.filter((d) => d.includes(q)) : districts;
    for (const d of items) {
      box.append(checkbox(d, {
        value: d, checked: selected.has(d),
        onChange: (e) => { if (e.target.checked) selected.add(d); else selected.delete(d); countNode.textContent = `${countOf(selected.size, 'حي مختار')}`; },
      }));
    }
    if (!items.length) box.append(el('span', { class: 'muted small', text: 'لا حي يطابق التصفية.' }));
    countNode.textContent = `${countOf(selected.size, 'حي مختار')}`;
  };
  searchInput.addEventListener('input', draw);
  draw();

  const saveBtn = el('button', { type: 'button', class: 'btn btn-primary', text: zone ? 'حفظ النطاق' : 'إضافة النطاق' });
  saveBtn.addEventListener('click', async () => {
    saveBtn.disabled = true;
    try {
      if (zone) await updateZone(city, zone.key, { label: labelInput.value, districts: [...selected] });
      else await addZone(city, { label: labelInput.value, districts: [...selected] });
      modal.close();
      await onSaved();
    } catch (err) {
      errToast(err);
    } finally {
      saveBtn.disabled = false;
    }
  });

  const modal = openModal({
    title: zone ? `تعديل نطاق: ${zone.label}` : `نطاق جديد في ${city}`,
    size: 'wide',
    body: el('div', {},
      el('div', { class: 'form-grid' }, labeled('اسم النطاق', labelInput, { required: true }), labeled('تصفية', searchInput)),
      el('div', { style: { marginTop: '10px' } }, countNode, box)),
    footer: [
      el('button', { type: 'button', class: 'btn btn-ghost', text: 'إلغاء', onClick: () => modal.close() }),
      saveBtn,
    ],
  });
}

async function zonesBody(redraw) {
  const [zones, lists] = await Promise.all([getZones(), getLists()]);
  const citySel = selectEl({ options: lists.cities.map((c) => ({ value: c, label: c })), value: lists.cities[0], onChange: () => drawList() });
  const listBox = el('div');

  const drawList = () => {
    clear(listBox);
    const city = citySel.value;
    const cityZones = zones[city] || [];
    const districts = lists.districtsByCity[city] || [];
    if (!cityZones.length) {
      listBox.append(el('p', { class: 'muted small', text: 'لا نطاقات لهذه المدينة بعد.' }));
    }
    for (const zone of cityZones) {
      listBox.append(el('div', { class: 'zone-item' },
        el('div', {},
          el('span', { class: 'strong', text: zone.label }),
          el('span', { class: 'muted small', text: ` — ${countOf(zone.districts.length, 'حي')}` }),
          el('div', { class: 'muted small', text: zone.districts.slice(0, 8).join('، ') + (zone.districts.length > 8 ? ' …' : '') })),
        el('div', { class: 'row' },
          el('button', { type: 'button', class: 'btn btn-sm', text: 'تعديل', onClick: () => openZoneForm({ city, zone, districts, onSaved: redraw }) }),
          el('button', {
            type: 'button', class: 'icon-btn', text: '✕', title: 'حذف النطاق',
            onClick: async () => {
              const ok = await confirmDialog({ title: 'حذف النطاق', message: `حذف نطاق «${zone.label}»؟ الطلبات التي تستعمله تفقد أحياءه (أحياؤها المفردة تبقى).`, confirmText: 'حذف', danger: true });
              if (!ok) return;
              try { await removeZone(city, zone.key); await redraw(); } catch (err) { errToast(err); }
            },
          }))));
    }
    listBox.append(el('div', { class: 'row', style: { marginTop: '10px' } },
      el('button', {
        type: 'button', class: 'btn', text: '+ نطاق جديد',
        onClick: () => openZoneForm({ city, zone: null, districts, onSaved: redraw }),
      })));
  };
  drawList();
  return el('div', {}, el('div', { class: 'row' }, citySel), el('div', { style: { marginTop: '10px' } }, listBox));
}

/* ===== تعريف الاكتمال ===== */

async function completenessBody() {
  const current = new Set(await getCompleteness());
  const box = el('div', { class: 'check-group' }, COMPLETENESS_CANDIDATES.map((c) => checkbox(c.label, { name: 'complete', value: c.key, checked: current.has(c.key) })));
  return el('div', {},
    box,
    el('div', { style: { marginTop: '10px' } }, el('button', {
      type: 'button', class: 'btn btn-primary', text: 'حفظ التعريف',
      onClick: async () => {
        try {
          await setCompleteness([...box.querySelectorAll('input:checked')].map((i) => i.value));
          toast('تم حفظ تعريف الاكتمال', 'success');
        } catch (err) { errToast(err); }
      },
    })));
}

/* ===== متابعة العملاء (المرحلة ٦) ===== */

async function followUpBody() {
  const fu = await getFollowUpSettings();
  const daysInput = el('input', { class: 'input', type: 'number', min: '1', step: '1', value: fu.staleContactDays });
  const notifyBox = checkbox('نبّهني عبر المتصفح عند تجاوز عميل لهذا الحدّ', { checked: fu.notify });
  const afterShowingInput = el('input', { class: 'input', type: 'number', min: '0', step: '1', value: fu.afterShowingDays ?? 3 });
  const note = el('div', { class: 'muted small' });

  function updateNote() {
    if (typeof Notification === 'undefined') { note.textContent = 'متصفحك لا يدعم تنبيهات النظام.'; return; }
    if (Notification.permission === 'denied') note.textContent = 'تنبيهات المتصفح مرفوضة حاليًا — فعّلها من إعدادات الموقع في متصفحك ثم أعد المحاولة.';
    else if (Notification.permission === 'granted') note.textContent = 'إذن التنبيهات مُفعَّل.';
    else note.textContent = '';
  }
  updateNote();

  /**
   * **قواعدُ التنبيه** (المرحلة ٤٩) — النظامُ كان يوقظك بشيئين وهو يعرف سبعة.
   * وتُعرض قائمةً تُشغَّل وتُطفَأ: من لا يدير أملاكًا يُطفئ الصيانة، ومن لا يُعاين
   * يُطفئ التقييم — فلا يصير التنبيهُ ضجيجًا يُتجاهَل كلُّه.
   */
  const ruleBoxes = ALERT_RULES.map((r) => ({
    key: r.key,
    node: checkbox(r.label, { checked: ruleOn(fu.alertRules, r.key) }),
    hint: r.hint,
  }));
  const rulesWrap = el('div', { class: 'rule-list' },
    ...ruleBoxes.map((b) => el('div', { class: 'rule-row' }, b.node, el('span', { class: 'muted small', text: b.hint }))));

  return el('div', {},
    el('div', { class: 'form-grid' },
      labeled('لم يُتواصَل معه منذ (أيام)', daysInput),
      el('div', { class: 'field' }, el('span', { class: 'field-label', text: 'تنبيه المتصفح' }), notifyBox),
      labeled('متابعة تلقائية بعد المعاينة (أيام)', afterShowingInput, {
        hint: 'عند تعليم مطابقة بـ«عُرضت» تُنشأ مهمة متابعة بعد هذه المدة. صفر = معطَّل.',
      })),
    el('h3', { class: 'section-title', style: { marginTop: '12px' }, text: 'ما الذي يوقظك؟' }),
    el('p', { class: 'muted small', text: 'كلُّ ما تحته محسوبٌ في النظام أصلًا — وهذه القائمةُ تقول أيُّه يصل إليك تنبيهًا. وكلُّه يحتاج «تنبيه المتصفح» أعلاه مُفعَّلًا.' }),
    rulesWrap,
    note,
    el('p', { class: 'muted small', style: { marginTop: '4px' } },
      'قيد مهم: التنبيه يعمل فقط أثناء بقاء هذا التبويب مفتوحًا في المتصفح — لا تنبيهات بعد إغلاقه؛ ذلك يحتاج خادمًا حقيقيًا، خارج نطاق التطبيق الحالي.'),
    el('div', { style: { marginTop: '10px' } }, el('button', {
      type: 'button', class: 'btn btn-primary', text: 'حفظ',
      onClick: async () => {
        let notify = notifyBox.querySelector('input').checked;
        if (notify) {
          const perm = await requestFollowUpPermission();
          if (perm !== 'granted') {
            notify = false;
            toast(perm === 'unsupported' ? 'متصفحك لا يدعم تنبيهات النظام' : 'لم يُسمح بالتنبيهات — فعّلها من إعدادات المتصفح', 'error', 6000);
          }
        }
        try {
          const alertRules = Object.fromEntries(ruleBoxes.map((b) => [b.key, b.node.querySelector('input').checked]));
          await setFollowUpSettings({ staleContactDays: daysInput.value, notify, afterShowingDays: afterShowingInput.value, alertRules });
          toast('تم الحفظ', 'success');
        } catch (err) { errToast(err); }
        updateNote();
      },
    })));
}

/* ===== نقاط المكالمات (المرحلة ٢٨) ===== */

async function playbooksBody(redraw) {
  const books = await getPlaybooks();
  const wrap = el('div', {});
  const draft = books.map((b) => ({ ...b, points: [...b.points] }));

  const draw = () => {
    clear(wrap);
    if (!draft.length) {
      wrap.append(el('p', { class: 'muted small', text: 'لا نصوص. أضف واحدًا، أو أعد الجاهزة بحذف الكل ثم إعادة تحميل الصفحة.' }));
    }
    draft.forEach((book, i) => {
      const nameInput = el('input', { class: 'input', type: 'text', value: book.name, onInput: (e) => { book.name = e.target.value; } });
      const pointsInput = el('textarea', {
        class: 'input', rows: Math.max(3, book.points.length + 1), value: book.points.join('\n'),
        onInput: (e) => { book.points = e.target.value.split('\n'); },
      });
      wrap.append(el('div', { class: 'panel-block' },
        el('div', { class: 'form-grid' },
          labeled('الاسم', nameInput),
          el('div', { class: 'field', style: { justifyContent: 'flex-end' } },
            el('button', {
              type: 'button', class: 'btn btn-ghost btn-sm', text: '🗑️ احذفه',
              onClick: () => { draft.splice(i, 1); draw(); },
            })),
          labeled('النقاط', pointsInput, { full: true, hint: 'نقطة في كل سطر' }))));
    });
  };
  draw();

  return el('div', {}, wrap,
    el('div', { class: 'row', style: { marginTop: '12px' } },
      el('button', {
        type: 'button', class: 'btn btn-sm', text: '+ نصّ جديد',
        onClick: () => { draft.push({ name: '', points: [''] }); draw(); },
      }),
      el('button', {
        type: 'button', class: 'btn btn-primary', text: 'حفظ النقاط',
        onClick: async () => {
          try {
            await setPlaybooks(draft);
            toast('حُفظت النقاط', 'success');
            await redraw();
          } catch (err) { errToast(err); }
        },
      })));
}

/* ===== خطط المتابعة (المرحلة ٢٣) ===== */

async function plansBody(redraw) {
  const plans = await getPlans();
  const wrap = el('div', {});

  if (!plans.length) {
    wrap.append(el('p', { class: 'muted small', text: 'لا خطط بعد. الخطة الجاهزة أدناه مقترح — عدّله أو احذفه، ولن يعمل حتى تُفعّله.' }));
  }

  for (const plan of plans) {
    const nameInput = el('input', { class: 'input', type: 'text', value: plan.name });
    const triggerSelect = selectEl({
      options: PLAN_TRIGGERS.map((t) => ({ value: t.key, label: t.label })), value: plan.trigger,
    });
    const enabledBox = checkbox('مفعَّلة', { checked: plan.enabled });
    const stepsWrap = el('div', {});
    const steps = plan.steps.map((step) => ({ ...step }));

    const drawSteps = () => {
      clear(stepsWrap);
      steps.forEach((step, i) => {
        const dayInput = el('input', { class: 'input', type: 'number', min: '0', step: '1', value: step.day, style: { width: '80px' }, onInput: (e) => { step.day = Number(e.target.value); } });
        const typeSelect = selectEl({ options: PLAN_STEP_TYPES.map((t) => ({ value: t.key, label: t.label })), value: step.type, onChange: (e) => { step.type = e.target.value; } });
        const titleInput = el('input', { class: 'input', type: 'text', value: step.title, onInput: (e) => { step.title = e.target.value; } });
        stepsWrap.append(el('div', { class: 'plan-step' },
          el('span', { class: 'muted small', text: 'بعد' }), dayInput, el('span', { class: 'muted small', text: 'يومًا' }),
          typeSelect, titleInput,
          el('button', { type: 'button', class: 'icon-btn', text: '✕', title: 'حذف الخطوة', onClick: () => { steps.splice(i, 1); drawSteps(); } })));
      });
      stepsWrap.append(el('button', {
        type: 'button', class: 'btn btn-ghost btn-sm', text: '+ خطوة',
        onClick: () => { steps.push({ day: 1, type: 'call', title: '' }); drawSteps(); },
      }));
    };
    drawSteps();

    wrap.append(el('div', { class: 'panel-block' },
      el('div', { class: 'form-grid' },
        labeled('اسم الخطة', nameInput),
        labeled('متى تُطلق', triggerSelect),
        el('div', { class: 'field' }, el('span', { class: 'field-label', text: 'الحالة' }), enabledBox)),
      stepsWrap,
      el('div', { class: 'row', style: { marginTop: '8px' } },
        el('button', {
          type: 'button', class: 'btn btn-primary btn-sm', text: 'حفظ',
          onClick: async () => {
            const next = (await getPlans()).map((x) => (x.id === plan.id
              ? { ...x, name: nameInput.value, trigger: triggerSelect.value, enabled: enabledBox.querySelector('input').checked, steps }
              : x));
            await setPlans(next);
            toast('حُفظت الخطة', 'success');
            await redraw();
          },
        }),
        el('button', {
          type: 'button', class: 'btn btn-ghost btn-sm', text: 'حذف الخطة',
          onClick: async () => {
            const ok = await confirmDialog({ title: 'حذف الخطة', message: `حذف «${plan.name}»؟ المهام المُنشأة سابقًا تبقى.`, confirmText: 'حذف', danger: true });
            if (!ok) return;
            await setPlans((await getPlans()).filter((x) => x.id !== plan.id));
            await redraw();
          },
        }))));
  }

  wrap.append(el('div', { style: { marginTop: '10px' } }, el('button', {
    type: 'button', class: 'btn', text: plans.length ? '+ خطة جديدة' : '+ أضف الخطة الجاهزة',
    onClick: async () => {
      const base = plans.length
        ? { name: 'خطة جديدة', trigger: 'manual', enabled: false, steps: [{ day: 1, type: 'call', title: 'اتصال متابعة' }] }
        : SAMPLE_PLAN;
      await setPlans([...(await getPlans()), base]);
      await redraw();
    },
  })));

  wrap.append(el('p', { class: 'muted small', style: { marginTop: '8px' } },
    'المهام تُنشأ في أول قوائمك (أو قائمة «متابعات» تُنشأ عند الحاجة)، ولا تتكرر الخطة على السجل نفسه مرتين.'));
  return wrap;
}

/* ===== سلة المحذوفات (المرحلة ٢١) ===== */

/**
 * **ولكلّ مخزنٍ اسمٌ عربيّ هنا** — فالسطرُ يُقرأ «مهمة — اتصل على سعد»، لا `tasks`.
 * وكانت تنقص سبعةً من المخازن التي تُحذف سجلّاتُها فعلًا، فيظهر اسمُ المخزن بالإنجليزيّة
 * في شاشةٍ عربيّة. وأُكملت مع فرصِ المرحلة ٥٣.
 */
const TRASH_LABELS = {
  clients: 'عميل', properties: 'عقار', requests: 'طلب', deals: 'صفقة', invoices: 'مستند',
  expenses: 'مصروف', tasks: 'مهمة', notes: 'ملاحظة', taskLists: 'قائمة مهام',
  externalListings: 'عرض خارجي', tours: 'جولة',
  incomes: 'إيراد', showings: 'معاينة', matches: 'مطابقة', extractions: 'مستند مفرَّغ',
  marketDeals: 'صفقة سوق', prospects: 'فرصة عقاريّة', prospectLists: 'قائمة فرص', facilities: 'مرفق',
};

function trashTitle(entry) {
  const d = entry.data || {};
  const name = d.name || d.title || d.number || d.text || d.district || d.city || d.date || '';
  return `${TRASH_LABELS[entry.store] || entry.store}${name ? ` — ${String(name).slice(0, 40)}` : ''}`;
}

// تُصدَّر ليبنيها المسارُ `#/trash` بلا نسخةٍ ثانيةٍ من الشاشة (المرحلة ٤٣).
export async function trashBody(redraw) {
  const items = await repo.trash.list();
  if (!items.length) {
    return el('p', { class: 'muted small', text: 'السلة فارغة — لم تحذف شيئًا خلال الثلاثين يومًا الماضية.' });
  }
  return el('div', {},
    el('div', {}, items.slice(0, 40).map((entry) => el('div', { class: 'trash-row' },
      el('div', {},
        el('div', { class: 'strong', text: trashTitle(entry) }),
        el('div', { class: 'muted small', text: `حُذف ${formatDateTime(entry.deletedAt)}` })),
      el('div', { class: 'row' },
        el('button', {
          type: 'button', class: 'btn btn-sm', text: 'استرجاع',
          onClick: async () => {
            try {
              await repo.trash.restore(entry.id);
              toast('أُعيد السجل', 'success');
              dataChanged();
              await redraw();
            } catch (err) { errToast(err); }
          },
        }),
        el('button', {
          type: 'button', class: 'icon-btn', text: '✕', title: 'حذف نهائي',
          onClick: async () => {
            const ok = await confirmDialog({ title: 'حذف نهائي', message: `${trashTitle(entry)} — يُحذف بلا رجعة. المتابعة؟`, confirmText: 'حذف', danger: true });
            if (!ok) return;
            await repo.trash.remove(entry.id);
            await redraw();
          },
        }))))),
    items.length > 40 ? el('p', { class: 'muted small', text: `و${countWord(items.length - 40, ['واحدٌ غيرها', 'اثنان غيرها', 'غيرها', 'غيرها'])}.` }) : null,
    el('div', { style: { marginTop: '10px' } }, el('button', {
      type: 'button', class: 'btn btn-ghost btn-sm', text: 'إفراغ السلة',
      onClick: async () => {
        const ok = await confirmDialog({ title: 'إفراغ السلة', message: `حذف ${countWord(items.length, ['عنصرٍ واحد', 'عنصرين', 'عناصر', 'عنصرًا'])} نهائيًا؟`, confirmText: 'إفراغ', danger: true });
        if (!ok) return;
        await repo.trash.clear();
        await redraw();
      },
    })));
}

/* ===== البيانات التجريبية ===== */

async function seedBody(redraw) {
  const exists = await seedExists();
  return el('div', { class: 'row' },
    el('span', {}, exists ? badge('مُدرجة حاليًا', 'badge-accent') : badge('غير مُدرجة')),
    el('button', {
      type: 'button', class: 'btn', text: 'إدراج بيانات تجريبية', disabled: exists,
      onClick: async (e) => {
        e.currentTarget.disabled = true;
        try {
          const ids = await insertSeed();
          toast(`أُدرج ${countOf(ids.clients.length, 'عميل')} و${ids.properties.length} عقارات`, 'success');
          dataChanged();
          await redraw();
        } catch (err) { errToast(err); await redraw(); }
      },
    }),
    el('button', {
      type: 'button', class: 'btn btn-ghost btn-danger', text: 'مسح البيانات التجريبية', disabled: !exists,
      onClick: async () => {
        const ok = await confirmDialog({ title: 'مسح البيانات التجريبية', message: 'ستُحذف السجلات التجريبية فقط (العملاء والعقارات وصورها وسجلات التجربة الأخرى). بياناتك الأخرى لا تُمس، والعميل التجريبي الذي ربطت به عقارًا حقيقيًا يبقى.', confirmText: 'مسح', danger: true });
        if (!ok) return;
        try {
          const removed = await clearSeed();
          const keptBits = [];
          if (removed.keptClients) keptBits.push(`${countOf(removed.keptClients, 'عميل')} لارتباطه بعقارات أضفتها`);
          if (removed.keptProperties) keptBits.push(`${countOf(removed.keptProperties, 'عقار')} لوجود صفقة مسجّلة عليه`);
          const kept = keptBits.length ? ` — بقي ${keptBits.join(' و')}` : '';
          toast(`حُذف ${countOf(removed.clients, 'عميل')} و${removed.properties} عقارات${kept}`, 'success', kept ? 7000 : 3500);
          dataChanged();
          await redraw();
        } catch (err) { errToast(err); }
      },
    }));
}


/* ===== ترتيب صفحات القائمة الجانبية (المرحلة ٨ · وأقسامٌ بيدك في ٥٤) ===== */

/**
 * **الأقسامُ صارت بيدك** (المرحلة ٥٤).
 *
 * كانت أربعةً مكتوبةً في الشيفرة — ومكتبُ كلِّ أحدٍ غيرُ مكتب غيره. فصارت تُسمّى وتُعاد
 * تسميتُها وتُضاف وتُحذف، وتُرتَّب هي وصفحاتُها **بالسحب والإفلات**.
 *
 * **والسهمان باقيان مع السحب لا بدلًا منه**: السحبُ لا يعمل باللمس إلّا بتعقيدٍ لا
 * يستحقّه، ولا يعمل لمن يتنقّل بالكيبورد أصلًا. **فطريقةٌ واحدةٌ لا تكفي.**
 * والسهمُ يعبر حدَّ القسم: الصفحةُ في رأس قسمها تصعد إلى ذيل الذي قبله.
 */
async function sidebarOrderBody(redraw) {
  const sections = await getSections();

  const commit = async () => {
    await saveSections(sections.map(({ id, label, pages }) => ({ id, label, pages })));
    await applySidebarOrder();
    await redraw();
  };

  /** موضعُ صفحةٍ في القائمة المسطَّحة: [فهرسُ القسم، فهرسُها فيه]. */
  const locate = (key) => {
    for (let i = 0; i < sections.length; i++) {
      const j = sections[i].pages.indexOf(key);
      if (j >= 0) return [i, j];
    }
    return [-1, -1];
  };

  const move = async (key, dir) => {
    const [i, j] = locate(key);
    if (i < 0) return;
    const here = sections[i].pages;
    if (dir < 0) {
      if (j > 0) { [here[j - 1], here[j]] = [here[j], here[j - 1]]; }
      else if (i > 0) { here.splice(j, 1); sections[i - 1].pages.push(key); }
      else return;
    } else if (j < here.length - 1) {
      [here[j + 1], here[j]] = [here[j], here[j + 1]];
    } else if (i < sections.length - 1) {
      here.splice(j, 1); sections[i + 1].pages.unshift(key);
    } else return;
    await commit();
  };

  /** نقلُ صفحةٍ إلى موضعٍ بعينه — مسارُ السحب والإفلات. */
  const placePage = async (key, secIdx, at) => {
    const [i, j] = locate(key);
    if (i < 0) return;
    sections[i].pages.splice(j, 1);
    let idx = at;
    if (i === secIdx && j < at) idx -= 1;
    const target = sections[secIdx];
    if (!target) return;
    target.pages.splice(Math.max(0, Math.min(idx, target.pages.length)), 0, key);
    await commit();
  };

  const moveSection = async (from, to) => {
    if (to < 0 || to >= sections.length || from === to) return;
    const [sec] = sections.splice(from, 1);
    sections.splice(to, 0, sec);
    await commit();
  };

  /* ===== السحبُ والإفلات ===== */
  let dragging = null;   // { kind: 'page'|'section', key|index }

  const pageRow = (key, secIdx, idx, flatFirst, flatLast) => {
    const page = SIDEBAR_PAGES.find((p) => p.key === key);
    const row = el('div', {
      class: 'page-order-row', draggable: 'true', 'data-page': key,
      title: 'اسحبه إلى قسمٍ آخر، أو استعمل السهمين',
    },
    el('span', { class: 'drag-grip', 'aria-hidden': 'true', text: '⠿' }),
    el('span', { class: 'sidebar-icon', text: page?.icon || '•' }),
    el('span', { class: 'page-order-name', text: pageLabel(key) }),
    el('button', { type: 'button', class: 'btn btn-ghost btn-sm', title: 'أعلى', text: '↑', disabled: flatFirst, onClick: () => move(key, -1) }),
    el('button', { type: 'button', class: 'btn btn-ghost btn-sm', title: 'أسفل', text: '↓', disabled: flatLast, onClick: () => move(key, 1) }));

    row.addEventListener('dragstart', (e) => {
      dragging = { kind: 'page', key };
      row.classList.add('dragging');
      try { e.dataTransfer.setData('text/plain', key); e.dataTransfer.effectAllowed = 'move'; } catch (_) { /* متصفّحٌ ضنين */ }
    });
    row.addEventListener('dragend', () => { dragging = null; row.classList.remove('dragging'); document.querySelectorAll('.drop-over').forEach((n) => n.classList.remove('drop-over')); });
    row.addEventListener('dragover', (e) => {
      if (dragging?.kind !== 'page') return;
      e.preventDefault();
      row.classList.add('drop-over');
    });
    row.addEventListener('dragleave', () => row.classList.remove('drop-over'));
    row.addEventListener('drop', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      row.classList.remove('drop-over');
      if (dragging?.kind === 'page' && dragging.key !== key) await placePage(dragging.key, secIdx, idx);
      dragging = null;
    });
    return row;
  };

  const box = el('div', { class: 'section-editor' });
  let flat = 0;
  const total = sections.reduce((n, sec) => n + sec.pages.length, 0);

  sections.forEach((sec, secIdx) => {
    const nameInput = el('input', {
      class: 'input section-name', type: 'text', value: sec.label,
      'aria-label': `اسم القسم ${sec.label}`,
    });
    nameInput.addEventListener('change', async () => {
      const next = nameInput.value.trim();
      if (!next) { nameInput.value = sec.label; toast('للقسم اسمٌ لا يُترك فارغًا', 'error'); return; }
      sec.label = next;
      await commit();
    });

    const head = el('div', { class: 'section-head', draggable: 'true' },
      el('span', { class: 'drag-grip', 'aria-hidden': 'true', text: '⠿' }),
      nameInput,
      el('span', { class: 'muted small', text: countOf(sec.pages.length, 'صفحة') }),
      el('button', { type: 'button', class: 'btn btn-ghost btn-sm', title: 'ارفع القسم', text: '↑', disabled: secIdx === 0, onClick: () => moveSection(secIdx, secIdx - 1) }),
      el('button', { type: 'button', class: 'btn btn-ghost btn-sm', title: 'أنزل القسم', text: '↓', disabled: secIdx === sections.length - 1, onClick: () => moveSection(secIdx, secIdx + 1) }),
      el('button', {
        type: 'button', class: 'icon-btn', title: 'احذف القسم', text: '🗑️',
        disabled: sections.length <= 1,
        onClick: async () => {
          // **ولا تسقط صفحةٌ مع قسمها**: تنتقل إلى القسم الذي قبله (أو الذي بعده).
          const host = sections[secIdx - 1] || sections[secIdx + 1];
          if (!host) { toast('لا يُحذف القسمُ الوحيد', 'error'); return; }
          const yes = await confirmDialog({
            title: `حذف قسم «${sec.label}»`,
            message: `تنتقل ${countOf(sec.pages.length, 'صفحة')} منه إلى «${host.label}». ولا تُحذف صفحةٌ ولا يتغيّر مسار.`,
            confirmText: 'احذف القسم', danger: true,
          });
          if (!yes) return;
          host.pages.push(...sec.pages);
          sections.splice(secIdx, 1);
          await commit();
        },
      }));

    head.addEventListener('dragstart', (e) => {
      dragging = { kind: 'section', index: secIdx };
      try { e.dataTransfer.setData('text/plain', sec.id); e.dataTransfer.effectAllowed = 'move'; } catch (_) { /* متصفّحٌ ضنين */ }
    });
    head.addEventListener('dragend', () => { dragging = null; });

    const body = el('div', { class: 'section-pages' });
    sec.pages.forEach((key, idx) => {
      const row = pageRow(key, secIdx, idx, flat === 0, flat === total - 1);
      flat += 1;
      body.append(row);
    });
    if (!sec.pages.length) body.append(el('p', { class: 'muted small', text: 'قسمٌ فارغ — اسحب إليه صفحةً.' }));

    const wrap = el('section', { class: 'section-box', 'data-section': sec.id }, head, body);
    // الإفلاتُ على القسم نفسِه: صفحةٌ تُلحَق بذيله، أو قسمٌ يُوضع مكانه.
    wrap.addEventListener('dragover', (e) => { if (dragging) { e.preventDefault(); wrap.classList.add('drop-over'); } });
    wrap.addEventListener('dragleave', () => wrap.classList.remove('drop-over'));
    wrap.addEventListener('drop', async (e) => {
      e.preventDefault();
      wrap.classList.remove('drop-over');
      if (!dragging) return;
      const d = dragging;
      dragging = null;
      if (d.kind === 'page') await placePage(d.key, secIdx, sections[secIdx].pages.length);
      else if (d.kind === 'section') await moveSection(d.index, secIdx);
    });
    box.append(wrap);
  });

  return el('div', {},
    el('p', { class: 'muted small' },
      el('strong', { text: 'اسحب الصفحةَ إلى القسم الذي تريد، أو استعمل السهمين. ' }),
      'والسهمُ يعبر حدَّ القسم، فالصفحةُ في رأس قسمها تصعد إلى ذيل الذي قبله. ',
      'وكلُّ الصفحات تبقى ظاهرة — الترتيبُ والأقسامُ فقط هو ما يُحفظ.'),
    box,
    el('div', { class: 'row', style: { marginTop: '10px', gap: '8px', flexWrap: 'wrap' } },
      el('button', {
        type: 'button', class: 'btn', text: '+ قسم جديد',
        onClick: async () => {
          const label = await promptDialog({ title: 'قسم جديد', label: 'اسم القسم', confirmText: 'أضِف' });
          if (!label) return;
          sections.push({ id: `sec-${Date.now().toString(36)}`, label: label.trim(), pages: [] });
          await commit();
        },
      }),
      el('button', {
        type: 'button', class: 'btn btn-ghost', text: 'إرجاع الترتيب الافتراضي',
        onClick: async () => {
          await resetSidebarOrder();
          await saveSections(buildDefaultSections([]));
          await applySidebarOrder();
          toast('أُرجع الترتيب الافتراضي', 'success');
          await redraw();
        },
      })));
}

/* ===== بيانات الشركة والمستندات (المرحلة ٨) ===== */

async function goalsBody(redraw) {
  const [goals, team] = await Promise.all([getGoals(), getTeam()]);
  const num = (value, step = '1') => el('input', { class: 'input', type: 'number', min: '0', step, value });
  const dealsInput = num(goals.dealsPerMonth);
  const commissionInput = num(goals.commissionPerMonth, '1000');
  const staleInput = num(goals.staleListingDays);

  /**
   * **هدفٌ لكلّ عضو** (المرحلة ٤٨).
   *
   * كان الهدفُ رقمين للمكتب كلِّه، فشريطُ التقدّم في «يومي» يقول للموظّف ما أنجزه
   * المكتب — وهو لا يملك تحريكَه وحده. **ومن لا هدفَ شخصيًّا له يرى هدفَ المكتب كما كان**،
   * فلا ينكسر شيءٌ على من لا فريقَ له.
   */
  const members = activeMembers(team);
  const perRows = members.map((m) => {
    const g = goals.perMember?.[m.id] || {};
    return { member: m, deals: num(g.dealsPerMonth || 0), commission: num(g.commissionPerMonth || 0, '1000') };
  });
  const perBlock = members.length > 1
    ? el('div', { class: 'panel-block' },
      el('h3', { text: 'هدفُ كلّ عضو' }),
      el('p', { class: 'muted small', text: 'صفرٌ في الاثنين = بلا هدفٍ خاصّ، فيرى هدفَ المكتب أعلاه. والنسبةُ تظهر في لوحة أداء الفريق.' }),
      el('div', {}, perRows.map((r) => el('div', { class: 'plan-step' },
        el('span', { class: 'field-label', text: r.member.name }),
        el('span', { class: 'muted small', text: 'صفقات' }), r.deals,
        el('span', { class: 'muted small', text: 'عمولات' }), r.commission))))
    : null;

  return el('div', {},
    el('div', { class: 'form-grid' },
      labeled('هدف الصفقات شهريًا', dealsInput, { hint: 'صفر = بلا هدف، فلا يظهر شريط' }),
      labeled('هدف العمولات شهريًا (ريال)', commissionInput, { hint: 'صفر = بلا هدف' }),
      labeled('العرض يُعدّ بائتًا بعد (يومًا)', staleInput, { hint: 'عقار لم يُحدَّث منذ هذه المدة يظهر في «يومي» لمراجعة سعره' })),
    perBlock,
    el('div', { class: 'row' }, el('button', {
      type: 'button', class: 'btn btn-primary', text: 'حفظ الأهداف',
      onClick: async () => {
        try {
          await setGoals({
            dealsPerMonth: dealsInput.value, commissionPerMonth: commissionInput.value, staleListingDays: staleInput.value,
            perMember: Object.fromEntries(perRows.map((r) => [r.member.id, {
              dealsPerMonth: r.deals.value, commissionPerMonth: r.commission.value,
            }])),
          });
          toast('حُفظت الأهداف', 'success');
          await redraw();
        } catch (err) { errToast(err); }
      },
    })));
}

async function companyBody(redraw) {
  const company = await getCompany();
  const text = (value, placeholder = '') => el('input', { class: 'input', type: 'text', value: value || '', placeholder });
  const nameInput = text(company.name, 'اسم المكتب كما يُطبع');
  const phoneInput = el('input', { class: 'input', type: 'tel', dir: 'ltr', value: company.phone || '' });
  const emailInput = el('input', { class: 'input', type: 'email', dir: 'ltr', value: company.email || '' });
  const addressInput = text(company.address);
  const crInput = text(company.crNumber, 'رقم السجل التجاري أو الترخيص');
  const licenseInput = text(company.licenseNumber, 'رقم الوسيط المعتمد لدى الهيئة العامة للعقار');
  const licenseExpiresInput = el('input', {
    class: 'input', type: 'date',
    value: company.licenseExpiresAt ? toInputDate(company.licenseExpiresAt) : '',
  });
  const vatNumberInput = el('input', { class: 'input', type: 'text', dir: 'ltr', value: company.vatNumber || '', placeholder: '١٥ رقمًا' });
  const vatRateInput = el('input', { class: 'input', type: 'number', min: '0', max: '100', step: '0.5', value: company.vatRate ?? 15 });
  const commissionInput = el('input', { class: 'input', type: 'number', min: '0', step: '0.25', value: company.commissionPercent ?? 2.5 });
  const durationInput = el('input', { class: 'input', type: 'number', min: '1', step: '1', value: company.agreementDurationDays ?? 90 });
  const termsInput = el('textarea', { class: 'input', rows: 4, value: company.agreementTerms || '', placeholder: 'بنود اتفاقية الوساطة كما تريد طباعتها (تُطبع كما هي — ليست مشورة قانونية)' });
  const footerInput = el('textarea', { class: 'input', rows: 2, value: company.footerNote || '', placeholder: 'سطر يُطبع أسفل كل مستند (شروط، شكر، حساب بنكي…)' });
  // مسار الصفقة (المرحلة ٢٤) وطلب التقييم (المرحلة ٢٥)
  const checklistInput = el('textarea', { class: 'input', rows: 5, value: company.dealChecklist || '', placeholder: 'بند في كل سطر' });
  const reviewUrlInput = el('input', { class: 'input', type: 'url', dir: 'ltr', value: company.reviewUrl || '', placeholder: 'https://g.page/r/…' });
  const invPrefix = text(company.invoicePrefix);
  const quotePrefix = text(company.quotePrefix);
  const invNext = el('input', { class: 'input', type: 'number', min: '1', step: '1', value: company.nextInvoiceNo });
  const quoteNext = el('input', { class: 'input', type: 'number', min: '1', step: '1', value: company.nextQuoteNo });

  /* الشعار: صورة واحدة في مخزن images (نفس آلية صور العقار: ضغط تلقائي قبل الحفظ). */
  const logoBox = el('div', { class: 'row' });
  const fileInput = el('input', {
    type: 'file', accept: 'image/*', class: 'visually-hidden',
    onChange: async (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      try {
        const rec = await storeImage(file, { entity: 'company', entityId: 'company' });
        if (company.logoImageId) await removeImage(company.logoImageId).catch(() => {});
        await setCompany({ logoImageId: rec.id });
        toast('حُفظ الشعار', 'success');
        await redraw();
      } catch (err) { errToast(err); }
    },
  });
  if (company.logoImageId) {
    try {
      const url = await getImageUrl(company.logoImageId);
      if (url) logoBox.append(el('img', { class: 'company-logo-preview', src: url, alt: 'شعار' }));
    } catch (_) { /* شعار مفقود */ }
  }
  appendChildren(logoBox, [
    el('button', { type: 'button', class: 'btn', text: company.logoImageId ? 'استبدال الشعار…' : 'رفع شعار…', onClick: () => fileInput.click() }),
    company.logoImageId ? el('button', {
      type: 'button', class: 'btn btn-ghost', text: 'حذف الشعار',
      onClick: async () => {
        try {
          await removeImage(company.logoImageId).catch(() => {});
          await setCompany({ logoImageId: null });
          await redraw();
        } catch (err) { errToast(err); }
      },
    }) : null,
    fileInput,
  ]);

  return el('div', {},
    el('div', { class: 'panel-block' },
      el('h3', { text: 'ما يُطبع أعلى المستند' }),
      el('div', { class: 'form-grid' },
        labeled('اسم الشركة / المكتب', nameInput),
        labeled('الجوال', phoneInput),
        labeled('البريد', emailInput),
        labeled('العنوان', addressInput),
        labeled('السجل التجاري', crInput),
      labeled('رقم الوسيط المعتمد (رخصة فال)', licenseInput, { hint: 'يطلبه عقد إيجار ويُطبع في اتفاقية الوساطة وسطر الإعلان' }),
      labeled('انتهاء رخصة فال', licenseExpiresInput, { hint: 'يُنبَّه عليك قبله — وبلا سريانها لا يُوثَّق عقد ولا يُصدَر ترخيص إعلان' }),
        labeled('الرقم الضريبي', vatNumberInput, { hint: 'اتركه فارغًا إن لم تكن مسجَّلًا في ضريبة القيمة المضافة — عندها لا ضريبة ولا رمز في مستنداتك' }),
        labeled('نسبة الضريبة (٪)', vatRateInput, { hint: 'تُقترح على الفواتير الجديدة، وتبقى محفوظة في كل مستند كما أصدرته' }),
        el('div', { class: 'field field-full' }, el('span', { class: 'field-label', text: 'الشعار' }), logoBox),
        labeled('تذييل المستند', footerInput, { full: true }))),
    el('div', { class: 'panel-block' },
      el('h3', { text: 'اتفاقية الوساطة' }),
      el('p', { class: 'muted small', text: 'تُطبع من قائمة مشاركة العقار، وتُملأ ببيانات العقار ومالكه. البنود نصّ تكتبه أنت ويُطبع كما هو — ليست مشورة قانونية.' }),
      el('div', { class: 'form-grid' },
        labeled('نسبة العمولة ٪', commissionInput),
        labeled('مدة الاتفاقية (يومًا)', durationInput),
        labeled('بنود الاتفاقية', termsInput, { full: true }))),
    el('div', { class: 'panel-block' },
      el('h3', { text: 'الصفقة بعد إبرامها' }),
      el('p', { class: 'muted small', text: 'المسار يُنسخ إلى كل صفقة جديدة ويبقى محفوظًا فيها، فتعديلك هنا لا يغيّر صفقة ماضية. ورابط التقييم إن تركته فارغًا لا تظهر لوحة طلب التقييم أصلًا.' }),
      el('div', { class: 'form-grid' },
        labeled('مسار الصفقة ومستنداتها', checklistInput, { full: true, hint: 'بند في كل سطر — ما لا تريد تتبّعه احذف سطره' }),
        labeled('رابط التقييم', reviewUrlInput, { full: true, hint: 'صفحتك في خرائط قوقل مثلًا — يُرسل للعميل بعد صفقته' }))),
    el('div', { class: 'panel-block' },
      el('h3', { text: 'الترقيم التلقائي' }),
      el('p', { class: 'muted small', text: 'لكل نوع سلسلة مستقلة. الرقم يُقترح عند الإنشاء ويبقى قابلًا للكتابة فوقه، والعدّاد لا يتقدم إلا إذا حُفظ الرقم المقترح كما هو.' }),
      el('div', { class: 'form-grid' },
        labeled('بادئة الفاتورة', invPrefix),
        labeled('رقم الفاتورة التالي', invNext),
        labeled('بادئة عرض السعر', quotePrefix),
        labeled('رقم عرض السعر التالي', quoteNext))),
    el('div', { class: 'row', style: { marginTop: '14px' } },
      el('button', {
        type: 'button', class: 'btn btn-primary', text: 'حفظ بيانات الشركة',
        onClick: async () => {
          try {
            await setCompany({
              name: nameInput.value, phone: phoneInput.value, email: emailInput.value,
              address: addressInput.value, crNumber: crInput.value, licenseNumber: licenseInput.value,
              licenseExpiresAt: fromInputDate(licenseExpiresInput.value),
              footerNote: footerInput.value,
              vatNumber: vatNumberInput.value.trim(), vatRate: Number(vatRateInput.value) || 0,
              invoicePrefix: invPrefix.value, quotePrefix: quotePrefix.value,
              nextInvoiceNo: invNext.value, nextQuoteNo: quoteNext.value,
              commissionPercent: Number(commissionInput.value) || 0,
              agreementDurationDays: Number(durationInput.value) || 90,
              agreementTerms: termsInput.value,
              dealChecklist: checklistInput.value,
              reviewUrl: reviewUrlInput.value.trim(),
            });
            toast('حُفظت بيانات الشركة', 'success');
            await redraw();
          } catch (err) { errToast(err); }
        },
      })));
}


/* ===== الفريق (المرحلة ٤٧) ===== */

/**
 * أعضاءُ المكتب: إضافةً وتعطيلًا وإعادةَ تسمية.
 *
 * **ولا يُحذف عضو** — يُعطَّل. فسجلّاتُه القديمة منسوبةٌ إليه، وحذفُه يجعلها «غير معروف»،
 * وذلك يُفسد كلَّ تقرير أداءٍ ماضٍ.
 */
async function teamBody(redraw) {
  const [team, me] = await Promise.all([getTeam(), Promise.resolve(getCurrentUser())]);
  const wrap = el('div', {});

  for (const m of team) {
    const nameInput = el('input', { class: 'input', type: 'text', value: m.name });
    const isMe = m.id === me.id;
    const activeBox = checkbox('عامل', {
      checked: m.active !== false,
      onChange: async (e) => {
        await setTeam(team.map((x) => (x.id === m.id ? { ...x, active: e.target.checked } : x)));
        toast(e.target.checked ? 'صار عاملًا' : 'عُطِّل — وسجلّاته باقيةٌ باسمه', 'success');
      },
    });
    nameInput.addEventListener('change', async () => {
      const next = team.map((x) => (x.id === m.id ? { ...x, name: nameInput.value } : x));
      await setTeam(next);
      if (isMe) await updateUserName(nameInput.value);   // اسمُ الجهاز واسمُ العضو واحد
      toast('حُفظ الاسم', 'success');
    });
    wrap.append(el('div', { class: 'plan-step' },
      nameInput,
      isMe ? badge('هذا الجهاز', 'badge-ok') : null,
      activeBox));
  }

  const newName = el('input', { class: 'input', type: 'text', placeholder: 'اسم العضو الجديد' });
  const add = async () => {
    const name = newName.value.trim();
    if (!name) return;
    /**
     * **يُقال قبل أن يوظّف، لا بعد أن يخسر** (المرحلة ٤٩).
     *
     * الحدُّ مكتوبٌ في وصف اللوحة وفي صندوق التنبيه أسفلها وفي لوحة الأداء — **ويُقرأ
     * بعد الفعل لا قبله**. ومن يضيف أوّلَ عضوٍ إلى فريقه يتّخذ قرارًا عن بياناته كلِّها،
     * فيُوقَف عنده مرّةً واحدةً ليقرأ ما يترتّب عليه.
     *
     * **ومرّةً واحدة**: عند أوّل عضوٍ وحده. وسؤالٌ يتكرّر مع كلّ إضافةٍ يُقرأ مرّةً
     * ويُضغط «موافق» بعدها بلا قراءة — فيبطل مقصودُه.
     */
    if (!team.length) {
      const ok = await confirmDialog({
        title: 'قبل أن تضيف فريقك',
        confirmText: 'فهمتُ — أضِفه',
        message: 'إضافةُ الأعضاء تمييزٌ وتنسيق: تعرف من أدخل، وتوزّع العمل، وتقيس كلَّ واحد.'
          + '\n\nولا تمنع أحدًا من رؤية شيء. فالتطبيق يعمل على قاعدةٍ في متصفّح كلّ جهاز،'
          + ' ومن فتح الجهاز رأى كلَّ عميلٍ وكلَّ عمولةٍ وكلَّ صفقة مهما أخفت الواجهة.'
          + ' والموظّفُ الذي يترك المكتب قد يأخذ معه نسخةً كاملة.'
          + '\n\nوالفصلُ الحقيقيّ يحتاج خادمًا يملك السجلّات ويسأل: من أنت؟ وهل لك أن ترى هذا؟'
          + ' وذلك تحوّلٌ في بنية النظام بكلفةٍ شهريّةٍ قائمة — لا إعدادٌ يُضاف.',
      });
      if (!ok) return;
    }
    // معرّفٌ محلّيّ يُولَّد هنا: لا حساباتٍ ولا خادم — هو وسمُ نسبةٍ لا هوّيةُ دخول.
    await setTeam([...team, { id: `m${Date.now().toString(36)}`, name, active: true }]);
    toast(`أُضيف ${name}`, 'success');
    redraw();
  };
  newName.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });

  return el('div', {},
    wrap,
    el('div', { class: 'row' }, newName, el('button', { type: 'button', class: 'btn btn-sm', text: '+ عضو', onClick: add })),
    el('div', { class: 'notice' },
      el('strong', { text: 'حدُّ هذا معلَنٌ ولا يُخفى: ' }),
      'هو تمييزٌ وتنسيق — تعرف من أدخل، وتوزّع العمل، وتقيس كلَّ واحد. ',
      el('strong', { text: 'ولا يمنع أحدًا من رؤية شيء.' }),
      ' فالتطبيق يعمل على قاعدةٍ في متصفّح كلّ جهاز، ومن فتح الجهاز وصل إلى ما فيه مهما أخفت الواجهة. ',
      'والفصلُ الحقيقيّ يحتاج خادمًا يملك السجلّات ويصرّح بها سجلًّا سجلًّا — وذلك تحوّلٌ في بنية النظام لا إعدادٌ يُضاف.'),
    el('p', { class: 'muted small', text: 'وعلى كل جهازٍ يعمل عليه أحدُهم: افتح «المستخدم الحالي» واكتب اسمه — فتُوقَّع سجلّاته باسمه.'
      + ' وهويّةُ الجهاز لا تُنقل بـ«نقل الإعدادات»، فلا يوقّع جهازُ موظّفك باسمك.' }));
}

/* ===== الخزنة السحابية المشفَّرة (المرحلة ١٠) ===== */

async function vaultBody(redraw) {
  const vault = await getVaultSettings();
  const passInput = el('input', { class: 'input', type: 'password', value: vault.passphrase || '', placeholder: 'عبارة سرّية طويلة تتذكّرها' });
  const autoBox = checkbox('ارفع نسخة تلقائيًا عند فتح التطبيق (مرة كل يوم)', { checked: !!vault.auto });
  // المزامنة (المرحلة ٤٥) منفصلةٌ عن الرفع التلقائي بقصد: ذاك نسخةٌ تحفظ، وهذه جهازان
  // يتّفقان. ومن أراد الحفظ وحده لا يُفرض عليه رفعٌ كلّما كتب.
  const syncBox = checkbox('زامن أجهزتي: اسحب وادمج عند الفتح، وارفع بعد كل تغيير', { checked: !!vault.sync });
  const listBox = el('div');
  const busy = (btn, on, text) => { btn.disabled = on; if (text) btn.textContent = text; };

  const drawList = async () => {
    clear(listBox);
    try {
      // الدفعة صفٌّ واحد ولو كانت عشر كتل (المرحلة ٤٥): النسخة نسخةٌ واحدة في عين
      // صاحبها، وعرضُ كتلها صفوفًا يوهم أن عنده عشر نسخ وليس عنده إلا واحدة.
      const backups = await listBackupBatches();
      if (!backups.length) { listBox.append(el('p', { class: 'muted small', text: 'لا نسخ سحابية بعد.' })); return; }
      listBox.append(el('table', { class: 'table' },
        el('thead', {}, el('tr', {}, ['التاريخ', 'الحجم', ''].map((t) => el('th', { text: t })))),
        el('tbody', {}, backups.map((b) => el('tr', {},
          el('td', {}, el('div', {},
            el('div', { text: formatDateTime(b.at) }),
            b.expected > 1 ? el('div', { class: 'muted small', text: countOf(b.expected, 'كتلة') }) : null)),
          el('td', {}, el('div', {},
            el('div', { text: b.size ? formatBytes(b.size) : '—' }),
            b.complete ? null : badge(`ناقصة: ${b.parts.length} من ${b.expected}`, 'badge-danger'))),
          el('td', {}, el('div', { class: 'row' },
            el('button', {
              type: 'button', class: 'btn btn-sm btn-primary', text: 'دمج',
              title: 'يضمّ ما في النسخة إلى ما في الجهاز — الأحدث يفوز لكل سجل، ولا يُمحى شيء',
              onClick: () => doMerge(b.key),
            }),
            el('button', {
              type: 'button', class: 'btn btn-sm', text: 'الإعدادات',
              title: 'ينقل قوالبك وخططك وبيانات مكتبك من هذه النسخة — والدمج لا ينقلها بقصد',
              onClick: () => doSettings(b.key),
            }),
            el('button', {
              type: 'button', class: 'btn btn-sm', text: 'استبدال',
              title: 'يمحو ما في الجهاز ويضع النسخة مكانه',
              onClick: () => doRestore(b.key),
            }))))))));
    } catch (err) {
      listBox.append(el('p', { class: 'muted small', text: `تعذر قراءة الخزنة: ${err.message}` }));
    }
  };

  /**
   * الدمج (المرحلة ٣٥): الأحدث يفوز لكل سجلٍّ على حدة — وهو الطريق المعتاد بين جهازين.
   * لا سؤال هنا لأنه **لا يمحو شيئًا**: يضيف الناقص ويرفع الأقدم، ويبقي ما هو أحدث.
   */
  const doMerge = async (key) => {
    try {
      const res = await mergeFromVault(passInput.value.trim(), key);
      const s2 = res.stats;
      toast(`دُمجت نسخة ${formatDateTime(res.exportedAt)} — أُضيف ${s2.added} · حُدّث ${s2.updated} · بقي أحدث ${s2.kept}`, 'success', 6000);
      setTimeout(() => location.reload(), 1400);
    } catch (err) { errToast(err); }
  };

  /**
   * نقل الإعدادات وحدها (المرحلة ٣٦): الدمج لا يمسّها بقصد، فيصل جهازٌ جديد بلا قوالبك
   * ولا خططك ولا بيانات مكتبك. وهذا يجعل نقلها **قرارًا صريحًا** لا أثرًا جانبيًّا.
   * وعبارة الخزنة السرّية لا تُنقل: تخصّ هذا الجهاز، وكتابةُ عبارة جهازٍ آخر فوقها عطب.
   */
  const doSettings = async (key) => {
    const ok = await confirmDialog({
      title: 'نقل الإعدادات من النسخة',
      message: 'ستُستبدل إعدادات هذا الجهاز (القوائم والقوالب والخطط وبيانات المكتب) بما في النسخة.'
        + '\nوعبارة الخزنة السرّية لا تُنقل — تبقى عبارة هذا الجهاز.\n\nالمتابعة؟',
      confirmText: 'انقل الإعدادات',
    });
    if (!ok) return;
    try {
      const res = await settingsFromVault(passInput.value.trim(), key);
      toast(`نُقل ${countOf(res.moved, 'إعداد')} — يُعاد التحميل…`, 'success');
      setTimeout(() => location.reload(), 1200);
    } catch (err) { errToast(err); }
  };

  /**
   * الاستبدال: **يمحو** ما في الجهاز. فقبله يُقاس ما سيُمحى ويُقال بالأرقام.
   *
   * وكان يسأل سؤالًا عامًّا يُضغط «نعم» فيه بلا قراءة — ومن رفع من جواله ثم استرجع على
   * مكتبه فقد عمل يومه ولم يدرِ. والتاريخان مكتوبان في السجلات أصلًا، فالسؤال يصير محدَّدًا.
   */
  const doRestore = async (key) => {
    let risk = null;
    try {
      risk = (await inspectBackup(passInput.value.trim(), key)).risk;
    } catch (err) { errToast(err); return; }

    const lines = ['سيُستبدل كل ما في هذا المتصفح بمحتوى النسخة.'];
    if (risk.wouldLose) {
      lines.push('');
      lines.push(`⚠️ في هذا الجهاز ${countOf(risk.newerCount, 'سجل')} أحدث من النسخة.`);
      lines.push(`آخر عمل هنا: ${formatDateTime(risk.localNewest)}`);
      lines.push(`وتاريخ النسخة: ${formatDateTime(risk.snapshotAt)}`);
      lines.push('');
      lines.push('الاستبدال يمحوها. و«دمج» يبقيها ويضمّ إليها ما في النسخة.');
    }
    lines.push('');
    lines.push('المتابعة؟');

    const ok = await confirmDialog({
      title: risk.wouldLose ? '⚠️ الاستبدال سيمحو عملًا أحدث' : 'استرجاع نسخة سحابية',
      message: lines.join('\n'),
      confirmText: 'استبدال واسترجاع', danger: true,
    });
    if (!ok) return;
    try {
      const res = await restoreBackup(passInput.value.trim(), key);
      toast(`استُرجعت نسخة ${formatDateTime(res.exportedAt)} — يُعاد التحميل…`, 'success');
      setTimeout(() => location.reload(), 900);
    } catch (err) { errToast(err); }
  };

  const uploadBtn = el('button', { type: 'button', class: 'btn btn-primary', text: '☁️ ارفع نسخة الآن' });
  uploadBtn.addEventListener('click', async () => {
    const pass = passInput.value.trim();
    if (pass.length < 8) { toast('اجعل العبارة السرّية ٨ أحرف فأكثر', 'error'); return; }
    busy(uploadBtn, true, 'يشفّر ويرفع…');
    try {
      await setVaultSettings({
        passphrase: pass,
        auto: autoBox.querySelector('input').checked,
        sync: syncBox.querySelector('input').checked,
      });
      const res = await uploadBackup(pass);
      await setVaultSettings({ lastUploadAt: res.at });
      await markExported(); // النسخة السحابية تُعدّ تصديرًا فعليًا، فيسكت شريط التذكير
      toast(res.parts > 1 ? `رُفعت نسخة مشفَّرة في ${countOf(res.parts, 'كتلة')}` : 'رُفعت نسخة مشفَّرة', 'success');
      dataChanged();
      await redraw();
    } catch (err) { errToast(err); }
    finally { busy(uploadBtn, false, '☁️ ارفع نسخة الآن'); }
  });

  /* ===== الصور: كتلٌ منفصلة (المرحلة ٣٥) ===== */
  const imagesBox = el('div');
  const drawImages = async () => {
    clear(imagesBox);
    try {
      const metas = await listImageBackups();
      if (!metas.length) { imagesBox.append(el('p', { class: 'muted small', text: 'لا صور مرفوعة بعد.' })); return; }
      // الكتل تُعرض دفعةً واحدة لا كتلةً كتلة: الدفعة هي وحدة الاسترجاع.
      const batch = metas[0].at;
      const mine = metas.filter((m) => (m.at || '') === batch);
      const bytes = mine.reduce((sum, m) => sum + (m.size || 0), 0);
      const expected = mine[0]?.parts ?? mine.length;
      imagesBox.append(el('dl', { class: 'kv' },
        el('dt', { text: 'آخر دفعة' }), el('dd', { text: formatDateTime(batch) }),
        el('dt', { text: 'الكتل' }), el('dd', {}, mine.length === expected
          ? badge(`${mine.length} من ${expected}`, 'badge-ok')
          : badge(`${mine.length} من ${expected} — ناقصة`, 'badge-danger')),
        el('dt', { text: 'الحجم' }), el('dd', { text: formatBytes(bytes) })));
    } catch (err) {
      imagesBox.append(el('p', { class: 'muted small', text: `تعذر قراءة كتل الصور: ${err.message}` }));
    }
  };

  const imgUploadBtn = el('button', { type: 'button', class: 'btn', text: '🖼️ ارفع الصور' });
  imgUploadBtn.addEventListener('click', async () => {
    const pass = passInput.value.trim();
    if (pass.length < 8) { toast('اجعل العبارة السرّية ٨ أحرف فأكثر', 'error'); return; }
    busy(imgUploadBtn, true, 'يرفع الصور…');
    try {
      const res = await uploadImages(pass, {
        onProgress: (done, all) => { imgUploadBtn.textContent = `كتلة ${done} من ${all}…`; },
      });
      await setVaultSettings({ passphrase: pass, lastImagesAt: new Date().toISOString() });
      toast(res.images ? `رُفعت ${countOf(res.images, 'صورة')} في ${res.parts} كتلة` : 'لا صور لرفعها', 'success');
      await drawImages();
    } catch (err) { errToast(err); }
    finally { busy(imgUploadBtn, false, '🖼️ ارفع الصور'); }
  });

  const imgRestoreBtn = el('button', { type: 'button', class: 'btn', text: 'استرجع الصور' });
  imgRestoreBtn.addEventListener('click', async () => {
    busy(imgRestoreBtn, true, 'يسترجع…');
    try {
      const res = await restoreImages(passInput.value.trim());
      toast(`استُرجعت ${countOf(res.images, 'صورة')} من ${res.parts} كتلة`, 'success');
      dataChanged();
    } catch (err) { errToast(err); }
    finally { busy(imgRestoreBtn, false, 'استرجع الصور'); }
  });

  const syncBtn = el('button', { type: 'button', class: 'btn', text: 'زامن الآن' });
  syncBtn.addEventListener('click', async () => {
    const pass = passInput.value.trim();
    if (pass.length < 8) { toast('اجعل العبارة السرّية ٨ أحرف فأكثر', 'error'); return; }
    busy(syncBtn, true, 'يزامن…');
    try {
      // تُحفظ العبارة والمفتاح قبل المزامنة: الدورة تقرأ الإعدادات لا الحقل.
      await setVaultSettings({ passphrase: pass, sync: syncBox.querySelector('input').checked });
      const { syncNow } = await import('../data/sync.js');
      const res = await syncNow();
      if (res.error) { toast(`تعذّرت المزامنة: ${res.error}`, 'error', 7000); }
      else if (res.skipped === 'off') { toast('المزامنة غير مفعّلة — فعّلها أوّلًا', 'error'); }
      else {
        const st = res.stats || {};
        toast(`تمّت المزامنة — أُضيف ${st.added || 0} · حُدّث ${st.updated || 0}`
          + (res.pushed ? ' · ورُفعت نسختك' : ''), 'success', 6000);
      }
      redraw();
    } catch (err) { errToast(err); }
    finally { busy(syncBtn, false, 'زامن الآن'); }
  });

  await drawList();
  await drawImages();
  return el('div', {},
    el('dl', { class: 'kv' },
      el('dt', { text: 'آخر رفع للبيانات' }),
      el('dd', {}, vault.lastUploadAt ? formatDateTime(vault.lastUploadAt) : badge('لم تُرفع نسخة بعد', 'badge-warn')),
      el('dt', { text: 'آخر رفع للصور' }),
      el('dd', {}, vault.lastImagesAt ? formatDateTime(vault.lastImagesAt) : badge('لم تُرفع صور بعد', 'badge-warn')),
      el('dt', { text: 'آخر مزامنة' }),
      // **الفشل يُقال.** مزامنةٌ صامتة أسوأ من لا مزامنة: تحسب جهازيك متّفقين وهما مفترقان.
      el('dd', {}, vault.lastSyncError
        ? badge(`تعثّرت: ${vault.lastSyncError}`, 'badge-danger')
        : (vault.lastSyncAt ? formatDateTime(vault.lastSyncAt) : badge('لم تُزامن بعد', 'badge-warn')))),
    el('div', { class: 'form-grid' },
      labeled('العبارة السرّية', passInput, { hint: 'تُشتق منها مفتاحية التشفير. نسيانها يعني فقدان النسخ السحابية — لا يستطيع أحد فكّها، ولا الخادم.' }),
      el('div', { class: 'field' }, el('span', { class: 'field-label', text: 'الرفع التلقائي' }), autoBox),
      el('div', { class: 'field' }, el('span', { class: 'field-label', text: 'المزامنة بين الأجهزة' }), syncBox)),
    el('div', { class: 'row' }, uploadBtn, syncBtn, imgUploadBtn, imgRestoreBtn,
      el('button', { type: 'button', class: 'btn', text: 'تحديث القائمة', onClick: () => { drawList(); drawImages(); } })),
    el('p', { class: 'muted small', text: 'المزامنة تسحب آخر نسخة وتدمجها ثم ترفع الاتّحاد — فلا يمحو جهازٌ ما كتبه الآخر.'
      + ' والأحدثُ كتابةً يغلب لكل سجلٍّ على حدة، والمحذوفُ يبقى محذوفًا.'
      + ' وما عُدّل في السجلّ نفسه من جهازين قبل أن يلتقيا: يبقى الأحدث ويذهب الآخر — وهذا حدُّها المعلَن.'
      + ' والصور والإعدادات خارجها: لكلٍّ زرُّه أعلاه.' }),
    /* المزامنة بابًا لفريقك (المرحلة ٤٧) — بحدِّه مكتوبًا قبل أن يُفتح */
    el('div', { class: 'panel-block' },
      el('h3', { text: 'وهي تصلح لفريقك — بشرطها' }),
      el('p', { class: 'muted small' },
        'بُنيت لجهازيك أنت، ',
        el('strong', { text: 'وهي نفسُها تصلح لجهازين لشخصين' }),
        ': العبارةُ السرّية نفسُها على جهاز موظّفك، فيجتمع عملُكما ويُحترم ما حُذف.'),
      el('p', { class: 'muted small' },
        el('strong', { text: 'وحدُّها هو الذي يقرّر أتصلح لكم أم لا: ' }),
        'عدّلتَ أنت وموظّفك السجلَّ نفسه قبل أن يلتقي الجهازان؟ يبقى الأحدثُ ويذهب الآخرُ بلا إنذار. ',
        'فهي تنفع فريقًا يعمل على ',
        el('strong', { text: 'عملاءَ متفرّقين' }),
        '، ولا تنفع اثنين على سجلٍّ واحد.'),
      el('p', { class: 'muted small' },
        'ولذلك ',
        el('strong', { text: 'الإسنادُ شرطُها لا رفاهيةٌ فيها' }),
        ': أسنِد كلَّ عميلٍ وعقارٍ وطلبٍ إلى صاحبه، فيعمل كلٌّ في سجلّاته ولا يلتقيان على واحد. ',
        el('a', { href: '#/settings', text: 'أعضاء المكتب في لوحة «الفريق» أعلاه' }),
        '.'),
      el('p', { class: 'muted small' },
        el('strong', { text: 'وليست فصلًا بين المستخدمين: ' }),
        'من فتح أيَّ جهازٍ منها وصل إلى كلّ ما فيه — النسخةُ تُنقل كاملةً. ',
        'والفصلُ الحقيقيّ يحتاج خادمًا يملك السجلّات ويصرّح بها سجلًّا سجلًّا، وذلك تحوّلٌ في البنية وكلفةٌ شهريّة.')),
    el('div', { class: 'panel-block' }, el('h3', { text: 'نسخ البيانات (آخر ٥)' }), listBox),
    el('div', { class: 'panel-block' }, el('h3', { text: 'الصور' }), imagesBox,
      el('p', { class: 'muted small', text: 'الترتيب بين جهازين: استرجع الصور أوّلًا ثم ارفعها — فترفع دفعتك وفيها صور الجهازين، وتلتقي المكتبتان. والاسترجاع يضيف ولا يمحو.' }),
      el('p', { class: 'muted small', text: 'الصور تسعة أعشار الحجم، وبياناتك كلها في العشر الباقي.'
        + ' فتُرفع البيانات كل يوم (سريعة ولا تفشل)، والصور في كتلٍ منفصلة كل أسبوع.'
        + ' وكانت النسخة الواحدة تحمل الاثنين فتتجاوز حدّ الرفع بعد عشرين عقارًا بصورها — فيفشل الرفع بلا رسالة، وصاحبه يحسب نسخته محفوظة.' })),
    el('p', { class: 'muted small', text: 'للنقل إلى جهاز آخر: افتح التطبيق عليه، اكتب العبارة السرّية نفسها، ثم «دمج» —'
      + ' فيجتمع عمل الجهازين ولا يُمحى شيء. و«استبدال» لجهازٍ جديد فارغ أو لبياناتٍ أفسدتها وتريد الرجوع،'
      + ' وهو يقول لك قبله كم سجلًّا أحدث سيمحو.' }),
  );
}


/* ===== تنبيهات الخلفية (المرحلة ١٠) ===== */

async function pushBody(redraw) {
  if (!pushSupported()) {
    return el('p', { class: 'muted small', text: 'هذا المتصفح لا يدعم تنبيهات الخلفية. تنبيهات «متابعة العملاء» أعلاه تبقى عاملة أثناء فتح التبويب.' });
  }
  const sub = await currentSubscription();
  const on = !!sub;

  const toggleBtn = el('button', {
    type: 'button', class: on ? 'btn' : 'btn btn-primary', text: on ? 'إيقاف تنبيهات الخلفية' : 'تفعيل تنبيهات الخلفية',
    onClick: async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      try {
        if (on) { await disablePush(); toast('أُوقفت تنبيهات الخلفية', 'success'); }
        else { await enablePush(); toast('فُعّلت — ستصلك التذكيرات ولو أغلقت التبويب', 'success', 5000); }
        await redraw();
      } catch (err) { errToast(err); }
      finally { btn.disabled = false; }
    },
  });

  return el('div', {},
    el('dl', { class: 'kv' },
      el('dt', { text: 'الحالة' }),
      el('dd', {}, on ? badge('مفعَّلة على هذا الجهاز', 'badge-ok') : badge('غير مفعَّلة', 'badge-warn'))),
    el('div', { class: 'row' }, toggleBtn,
      on ? el('button', {
        type: 'button', class: 'btn btn-ghost', text: 'تحديث المواعيد الآن',
        onClick: async () => { await syncReminders(); toast('حُدّثت مواعيد التذكير على الخادم', 'success'); },
      }) : null),
    el('p', { class: 'muted small', text: 'يلزم أن يكون التطبيق مفتوحًا من رابطه الحقيقي (https)، وعلى آيفون يلزم تثبيته على الشاشة الرئيسية أولًا.' }));
}


/* ===== قوالب رسائل واتساب (المرحلة ١١) ===== */

async function templatesBody(redraw) {
  const templates = await getTemplates();
  const rows = el('div', { class: 'template-list' });
  const drafts = templates.map((t) => ({ ...t }));

  const draw = () => {
    clear(rows);
    drafts.forEach((t, i) => {
      const labelInput = el('input', { class: 'input', type: 'text', value: t.label });
      const bodyInput = el('textarea', { class: 'input', rows: 5, value: t.body });
      labelInput.addEventListener('input', () => { drafts[i].label = labelInput.value; });
      bodyInput.addEventListener('input', () => { drafts[i].body = bodyInput.value; });
      rows.append(el('div', { class: 'panel-block' },
        el('div', { class: 'row' }, labelInput,
          el('button', {
            type: 'button', class: 'icon-btn', text: '✕', title: 'حذف القالب',
            onClick: () => { drafts.splice(i, 1); draw(); },
          })),
        bodyInput));
    });
  };
  draw();

  return el('div', {},
    el('p', { class: 'muted small' }, 'المتغيّرات المتاحة: ',
      ...TEMPLATE_VARS.map((v) => el('code', { class: 'tpl-var', text: `{${v.key}}`, title: v.desc })),
      ' — والسطر الذي يبقى بلا قيمة يُحذف من الرسالة تلقائيًا.'),
    rows,
    el('div', { class: 'row', style: { marginTop: '10px' } },
      el('button', {
        type: 'button', class: 'btn', text: '+ قالب جديد',
        onClick: () => { drafts.push({ key: `tpl_${drafts.length + 1}`, label: 'قالب جديد', body: 'السلام عليكم {اسم_العميل}\n' }); draw(); },
      }),
      el('button', {
        type: 'button', class: 'btn btn-primary', text: 'حفظ القوالب',
        onClick: async () => {
          try { await setTemplates(drafts); toast('حُفظت القوالب', 'success'); await redraw(); } catch (err) { errToast(err); }
        },
      }),
      el('button', {
        type: 'button', class: 'btn btn-ghost', text: 'إرجاع المدمجة',
        onClick: async () => {
          const ok = await confirmDialog({ title: 'إرجاع القوالب', message: 'استبدال قوالبك بالقوالب المدمجة؟', confirmText: 'إرجاع' });
          if (!ok) return;
          await resetTemplates();
          await redraw();
        },
      })));
}


/* ===== الاستيراد والتصدير (المرحلة ١١) ===== */

/**
 * **الربعُ المنقضي** بطرفيه — وهو المطلوب في العادة حين يُطلب ملفّ.
 *
 * المنقضي لا الجاري: ملفُّ ربعٍ لم ينتهِ ناقصٌ يُراجَع مرّتين.
 */
function lastQuarter(now = new Date()) {
  const q = Math.floor(now.getMonth() / 3);
  const startMonth = (q - 1) * 3;
  const start = new Date(now.getFullYear(), startMonth, 1); // يعبر رأس السنة وحده إن كان الربع الأول
  const end = new Date(start.getFullYear(), start.getMonth() + 3, 0);
  const day = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { from: day(start), to: day(end) };
}

async function exchangeBody(redraw) {
  const [lists, clients, properties] = await Promise.all([getLists(), repo.clients.list(), repo.properties.list()]);
  const clientById = new Map(clients.map((c) => [c.id, c]));
  const propertyById = new Map(properties.map((p) => [p.id, p]));
  const ctx = {
    typeLabel: (key) => typeLabelOf(lists, key),
    statusLabel: (key) => statusLabelOf(lists, key),
    clientName: (id) => { const c = clientById.get(id); return c ? (c.name || c.phone || '') : ''; },
    // المصاريف والإيرادات تُربط بعقارٍ (المرحلة ٤٧): يُصدَّر باسمه لا بمعرّفه.
    propertyLabel: (id) => {
      const p = propertyById.get(id);
      return p ? [typeLabelOf(lists, p.type), p.district, p.city].filter(Boolean).join(' — ') : '';
    },
  };

  /* استيراد vCard */
  const resultBox = el('div');
  const fileInput = el('input', {
    type: 'file', accept: '.vcf,text/vcard,text/x-vcard', class: 'visually-hidden',
    onChange: async (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      try {
        const contacts = parseVCards(await file.text());
        if (!contacts.length) { toast('لم يُقرأ أي جهة اتصال من الملف', 'error'); return; }
        const ok = await confirmDialog({
          title: 'استيراد جهات الاتصال',
          message: `قُرئت ${countOf(contacts.length, 'جهة')} اتصال. ستُضاف عملاء جددًا فقط — والجوال المسجَّل عندك مسبقًا يُتخطّى ولا يُعدَّل. المتابعة؟`,
          confirmText: 'استيراد',
        });
        if (!ok) return;
        const stats = await importContacts(contacts);
        clear(resultBox);
        resultBox.append(el('p', { class: 'muted small', text: `أُضيف ${stats.added} · تُخطّي ${stats.skipped} (مسجَّل مسبقًا) · تُجوهل ${stats.invalid} (بلا اسم ولا جوال)` }));
        toast(`أُضيف ${countOf(stats.added, 'عميل')}`, 'success');
        dataChanged();
      } catch (err) { errToast(err); }
    },
  });

  /* تصدير CSV — بمدًى زمنيّ يُختار (المرحلة ٤٧): ملفُّ الربع لا ملفُّ العمر */
  const fromInput = el('input', { class: 'input', type: 'date', title: 'من تاريخ' });
  const toInput = el('input', { class: 'input', type: 'date', title: 'إلى تاريخ' });
  const rangeHint = el('span', { class: 'muted small' });
  const drawRangeHint = () => {
    const { from, to } = csvRange();
    rangeHint.textContent = from || to
      ? `يُصدَّر ما بين ${from || 'البداية'} و${to || 'اليوم'} — والطرفان داخلان. وسجلٌّ بلا تاريخٍ لا يدخل مدًى.`
      : 'بلا مدًى: يُصدَّر كلُّ شيء. حدِّد طرفًا أو طرفين ليضيق الملفّ على ما يطلبه محاسبُك.';
  };
  const csvRange = () => ({ from: fromInput.value || '', to: toInput.value || '' });
  fromInput.addEventListener('input', drawRangeHint);
  toInput.addEventListener('input', drawRangeHint);
  drawRangeHint();

  const csvButtons = Object.entries(CSV_EXPORTS).map(([key, def]) => el('button', {
    type: 'button', class: 'btn btn-sm', text: def.label,
    onClick: async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      try {
        const range = supportsRange(key) ? csvRange() : {};
        const { blob, filename, count } = await buildCsv(key, ctx, range);
        if (!count) {
          toast(range.from || range.to ? 'لا سجلّ في هذا المدى' : 'لا بيانات لتصديرها', 'info');
          return;
        }
        downloadBlob(blob, filename);
        toast(`صُدّر ${countOf(count, 'سجل')}`, 'success');
      } catch (err) { errToast(err); } finally { btn.disabled = false; }
    },
  }));
  const csvRangeRow = el('div', { class: 'plan-step' },
    el('span', { class: 'field-label', text: 'المدى' }), fromInput, toInput,
    el('button', {
      type: 'button', class: 'btn btn-ghost btn-sm', text: 'الربع الماضي',
      title: 'يملأ الطرفين بالربع المنقضي — وهو ما يُطلب في العادة',
      onClick: () => { const q = lastQuarter(); fromInput.value = q.from; toInput.value = q.to; drawRangeHint(); },
    }),
    el('button', {
      type: 'button', class: 'btn btn-ghost btn-sm', text: 'امسح المدى',
      onClick: () => { fromInput.value = ''; toInput.value = ''; drawRangeHint(); },
    }));

  /* استيراد CSV (المرحلة ١٨) */
  const csvImportInput = el('input', {
    type: 'file', accept: '.csv,text/csv', class: 'visually-hidden',
    onChange: async (e) => {
      const file = e.target.files[0];
      const entity = csvEntitySelect.value;
      e.target.value = '';
      if (!file) return;
      try {
        const { headers, rows } = parseCsv(await file.text());
        if (!rows.length) { toast('الملف فارغ أو بلا صفوف بعد العناوين', 'error'); return; }
        openCsvMapping(entity, headers, rows, lists, dataChanged);
      } catch (err) { errToast(err); }
    },
  });
  const csvEntitySelect = selectEl({
    options: Object.entries(CSV_IMPORTS).map(([key, def]) => ({ value: key, label: def.label })),
    value: 'clients',
  });

  return el('div', {},
    el('div', { class: 'panel-block' },
      el('h3', { text: 'استيراد من إكسل (CSV)' }),
      el('p', { class: 'muted small', text: 'احفظ جدولك من إكسل بصيغة CSV ثم اختره هنا. تربط الأعمدة بحقولك، وترى معاينة قبل أي كتابة — والمكرّر يُتخطّى ولا يُعدَّل شيء قائم.' }),
      el('div', { class: 'row' },
        csvEntitySelect,
        el('button', { type: 'button', class: 'btn', text: 'اختر ملف CSV…', onClick: () => csvImportInput.click() }),
        csvImportInput)),
    el('div', { class: 'panel-block' },
      el('h3', { text: 'استيراد جهات الاتصال' }),
      el('p', { class: 'muted small', text: 'صدّر جهات اتصالك من الجوال كملف vcf ثم اختره هنا. يُقرأ في متصفحك فقط، ولا يُعدَّل أي عميل قائم.' }),
      el('div', { class: 'row' },
        el('button', { type: 'button', class: 'btn', text: 'اختر ملف vCard…', onClick: () => fileInput.click() }),
        fileInput),
      resultBox),
    el('div', { class: 'panel-block' },
      el('h3', { text: 'تصدير جهات الاتصال إلى جوالك' }),
      el('p', { class: 'muted small', text: 'ملف vCard يضمّ عملاءك بأسمائهم وجوالاتهم، تستورده في جهات اتصال جوالك — فيظهر لك اسم المتّصل بدل رقمٍ مجهول. يُبنى في متصفحك ولا يُرفع إلى أي مكان.' }),
      el('div', { class: 'row' },
        el('button', {
          type: 'button', class: 'btn', text: '⬇️ نزّل ملف vCard',
          onClick: async (e) => {
            const btn = e.currentTarget;
            btn.disabled = true;
            try {
              const all = await repo.clients.list();
              // البادئة تجعل عملاءك مميّزين في دفتر هاتفك عن جهات اتصالك الشخصية.
              const text = buildVCards(all, { prefix: 'كسّاب — ' });
              const withPhone = all.filter((c) => c.phone || c.phone2).length;
              if (!withPhone) { toast('لا عملاء بأرقام لتصديرهم', 'info'); return; }
              downloadBlob(new Blob([text], { type: 'text/vcard;charset=utf-8' }), 'kassab-contacts.vcf');
              toast(`صُدّر ${countOf(withPhone, 'جهة')} اتصال`, 'success');
            } catch (err) { errToast(err); } finally { btn.disabled = false; }
          },
        }),
        el('span', { class: 'muted small', text: 'لا تُكتب فيه ملاحظاتك الداخلية عن العميل.' }))),
    el('div', { class: 'panel-block' },
      el('h3', { text: 'تصدير إلى إكسل (CSV)' }),
      el('p', { class: 'muted small', text: 'ملف لكل جدول، بترميز يفتحه إكسل بالعربية مباشرة. للنسخ الاحتياطي الكامل استعمل التصدير أعلاه — CSV لا يحفظ الصور ولا يصلح للاستعادة.' }),
      csvRangeRow,
      rangeHint,
      el('div', { class: 'row' }, csvButtons)));
}


/**
 * نافذة ربط أعمدة الملف بحقول التطبيق، ثم معاينة، ثم استيراد (المرحلة ١٨).
 *
 * ثلاث خطوات مقصودة: **لا كتابة قبل معاينة**. الاستيراد الأعمى في بياناتٍ لا نسخة منها
 * إلا عندك خطرٌ لا يُحتمل، والتراجع عنه يعني حذفًا يدويًا لعشرات السجلات.
 */
function openCsvMapping(entity, headers, rows, lists, onDone) {
  const def = CSV_IMPORTS[entity];
  const suggested = suggestMapping(entity, headers);
  const selects = {};
  const grid = el('div', { class: 'form-grid' }, def.fields.map((f) => {
    selects[f.key] = selectEl({
      options: [{ value: '', label: '— لا يوجد —' }, ...headers.map((h) => ({ value: h, label: h }))],
      value: suggested[f.key] || '',
    });
    return labeled(f.label, selects[f.key]);
  }));

  const previewBox = el('div', { style: { marginTop: '12px' } });
  const mapping = () => Object.fromEntries(Object.entries(selects).map(([k, sel]) => [k, sel.value]).filter(([, v]) => v));

  const importBtn = el('button', { type: 'button', class: 'btn btn-primary', text: 'استيراد', disabled: true });
  let pending = null;

  const showPreview = async () => {
    try {
      const result = await previewImport(entity, rows, mapping(), { lists });
      pending = result.add;
      importBtn.disabled = !result.add.length;
      importBtn.textContent = result.add.length ? `استيراد ${result.add.length}` : 'لا جديد لاستيراده';
      clear(previewBox);
      appendChildren(previewBox, [
        el('p', { class: 'strong', text: `سيُضاف ${result.add.length} · يُتخطّى ${result.skipped.length}` }),
        result.skipped.length
          ? el('p', { class: 'muted small', text: `المتخطّى: ${[...new Set(result.skipped.map((x) => x.why))].join(' · ')}` })
          : null,
        result.add.length
          ? el('div', { class: 'table-wrap' }, el('table', { class: 'table' },
            el('thead', {}, el('tr', {}, ['السطر', ...def.fields.map((f) => f.label)].map((t) => el('th', { text: t })))),
            el('tbody', {}, result.add.slice(0, 5).map((item) => el('tr', {},
              el('td', { class: 'muted', text: String(item.line) }),
              ...def.fields.map((f) => el('td', { text: formatCell(item.rec[f.key], f, lists) })))))))
          : null,
        result.add.length > 5 ? el('p', { class: 'muted small', text: `— معاينة أول ٥ من ${result.add.length}` }) : null,
      ]);
    } catch (err) { errToast(err); }
  };

  for (const sel of Object.values(selects)) sel.addEventListener('change', showPreview);

  importBtn.addEventListener('click', async () => {
    importBtn.disabled = true;
    try {
      const { added, failed } = await runImport(entity, pending || []);
      modal.close();
      toast(failed.length ? `أُضيف ${added} · فشل ${failed.length}` : `أُضيف ${added} سجلًا`, failed.length ? 'error' : 'success');
      if (failed.length) console.warn('صفوف مرفوضة', failed);
      onDone();
    } catch (err) { errToast(err); importBtn.disabled = false; }
  });

  const modal = openModal({
    title: `استيراد ${def.label} من CSV`,
    size: 'wide',
    body: el('div', {},
      el('p', { class: 'muted small', text: `قُرئ ${countOf(rows.length, 'صف')} و${headers.length} عمودًا. اربط كل حقل بعموده — والحقول المتروكة تبقى فارغة.` }),
      grid, previewBox),
    footer: [importBtn, el('button', { type: 'button', class: 'btn btn-ghost', text: 'إلغاء', onClick: () => modal.close() })],
  });
  showPreview();
}

/** عرض قيمة في المعاينة: المفاتيح تُعرض بأسمائها العربية لا بمفاتيحها. */
function formatCell(value, field, lists) {
  if (Array.isArray(value)) return value.map((k) => labelFor(ENUMS.purposes, k)).join('، ');
  if (field.listKey && lists) return (lists[field.listKey] || []).find((x) => x.key === value)?.label || String(value ?? '');
  return String(value ?? '');
}

/* ===== القفل التلقائي (المرحلة ٣٢) ===== */

async function autoLockBody(redraw) {
  const ui = await getUI();
  const minutes = Number(ui.autoLockMinutes) || 0;
  const input = el('input', { class: 'input', type: 'number', min: '0', max: '240', step: '1', value: minutes });
  return el('div', {},
    el('div', { class: 'form-grid' },
      labeled('يقفل بعد (دقيقة)', input, { hint: 'صفر = لا قفل. ويظهر إنذار قبله بعشرين ثانية تضغط فيه «ابقَ مفتوحًا».' })),
    el('p', { class: 'muted small', text: 'القفل تسجيل خروج فعليّ من بوابة الدخول — لا شاشة تُخفي المحتوى. وتعود بكلمة السر نفسها، وبياناتك في الجهاز لا تتأثر.' }),
    el('div', { class: 'row' },
      el('button', {
        type: 'button', class: 'btn btn-primary', text: 'حفظ',
        onClick: async () => {
          const value = Math.max(0, Math.min(240, Math.round(Number(input.value) || 0)));
          await setUI({ autoLockMinutes: value });
          toast(value ? `سيُقفل بعد ${countOf(value, 'دقيقة')} بلا نشاط — يبدأ عند إعادة فتح التطبيق` : 'أُلغي القفل التلقائي', 'success', 6000);
          await redraw();
        },
      })));
}

/* ===== المظهر (المرحلة ١١) ===== */

async function themeBody(redraw) {
  const ui = await getUI();
  const current = ui.theme || 'system';
  const options = [
    { key: 'system', label: '🖥️ يتبع الجهاز' },
    { key: 'light', label: '☀️ فاتح' },
    { key: 'dark', label: '🌙 داكن' },
  ];
  const themeRow = el('div', { class: 'row' }, options.map((o) => el('button', {
    type: 'button', class: `btn${o.key === current ? ' btn-primary' : ''}`, text: o.label,
    onClick: async () => {
      await setUI({ theme: o.key });
      applyTheme(o.key); // فوريّ بلا إعادة تحميل
      await redraw();
    },
  })));

  // التاريخ الهجري (المرحلة ٣٨): مع الميلادي لا بدلًا منه — ما يُحفظ يبقى ميلاديًّا،
  // وهذا عرضٌ فقط. ويُطفأ لمن لا يريده فيعود كلُّ تاريخٍ كما كان.
  const today = new Date().toISOString();
  const sample = el('div', { class: 'muted small' });
  const paintSample = () => { sample.textContent = `مثال: ${formatDate(today)}`; };
  const hijriBox = checkbox('أظهر التاريخ الهجري مع الميلادي', {
    checked: ui.hijri !== false,
    onChange: async (e) => {
      await setUI({ hijri: e.target.checked });
      setHijriMode(e.target.checked);
      paintSample();
      toast(e.target.checked ? 'الهجري يظهر مع الميلادي في كل الصفحات' : 'عاد التاريخ ميلاديًّا وحده', 'success');
    },
  });
  paintSample();

  return el('div', {},
    themeRow,
    el('div', { class: 'panel-block' },
      el('h3', { text: 'التاريخ' }),
      hijriSupported()
        ? el('div', {}, hijriBox, sample)
        : el('div', { class: 'muted small', text: 'متصفّحك لا يعرف تقويم أمّ القرى، فيبقى التاريخ ميلاديًّا. جرّب متصفّحًا أحدث.' })));
}


/* ===== الحملات التسويقيّة (المرحلة ٤٩) ===== */

/**
 * الدورُ الذي كان بلا صفحة: المسوّق. و`sources.js` تقيس **القناة** لا **الحملة**،
 * وحملتان على القناة نفسِها تذوبان في رقمٍ واحد فلا يُعرف أيُّهما جلبت مشترين.
 */
async function campaignsBody(redraw) {
  const stored = await getCampaigns();
  const draft = stored.map((c) => ({ ...c }));
  const wrap = el('div', {});

  const draw = () => {
    clear(wrap);
    if (!draft.length) {
      wrap.append(el('p', { class: 'muted small', text: 'لا حملة بعد. أنشئ واحدةً، ثم اخترها في استمارة العميل — ويظهر أداؤها في الداشبورد.' }));
    }
    draft.forEach((c, i) => {
      wrap.append(el('div', { class: 'plan-step' },
        el('input', {
          class: 'input', type: 'text', value: c.label, placeholder: 'اسم الحملة (فلل قرطبة)',
          'aria-label': 'اسم الحملة', onInput: (e) => { c.label = e.target.value; },
        }),
        el('input', {
          class: 'input', type: 'text', value: c.channel || '', placeholder: 'القناة (سناب…)',
          list: 'campaign-channels', 'aria-label': 'قناة الحملة', onInput: (e) => { c.channel = e.target.value; },
        }),
        el('input', {
          class: 'input', type: 'date', value: c.startAt ? toInputDate(c.startAt) : '', title: 'من',
          'aria-label': 'بداية الحملة', onInput: (e) => { c.startAt = e.target.value ? fromInputDate(e.target.value) : null; },
        }),
        el('input', {
          class: 'input', type: 'date', value: c.endAt ? toInputDate(c.endAt) : '', title: 'إلى',
          'aria-label': 'نهاية الحملة', onInput: (e) => { c.endAt = e.target.value ? fromInputDate(e.target.value) : null; },
        }),
        el('input', {
          class: 'input', type: 'number', min: '0', step: '100', value: c.budget ?? '', placeholder: 'الميزانية',
          'aria-label': 'ميزانية الحملة', onInput: (e) => { c.budget = e.target.value === '' ? null : Number(e.target.value); },
        }),
        el('button', {
          type: 'button', class: 'icon-btn', text: '✕', title: 'حذف الحملة', 'aria-label': `حذف حملة ${c.label || 'بلا اسم'}`,
          onClick: () => { draft.splice(i, 1); draw(); },
        })));
    });
    wrap.append(el('button', {
      type: 'button', class: 'btn btn-ghost btn-sm', text: '+ حملة',
      onClick: () => { draft.push({ label: '', channel: '', startAt: null, endAt: null, budget: null }); draw(); },
    }));
  };
  draw();

  return el('div', {},
    // قائمةُ اقتراحاتٍ لا حصر: قناةٌ غيرُ مذكورةٍ تُكتب كما هي.
    el('datalist', { id: 'campaign-channels' }, CAMPAIGN_CHANNELS.map((ch) => el('option', { value: ch }))),
    wrap,
    el('p', { class: 'muted small', style: { marginTop: '8px' }, text: 'ميزانيةٌ متروكةٌ فارغةً تعني «مجهولةُ الكلفة» لا «مجّانيّة» — فلا تُحسب لها كلفةُ طلبٍ كاذبة.' }),
    el('div', { style: { marginTop: '10px' } }, el('button', {
      type: 'button', class: 'btn btn-primary', text: 'حفظ',
      onClick: async () => {
        try {
          await setCampaigns(draft);
          toast('حُفظت الحملات', 'success');
          redraw();
        } catch (err) { errToast(err); }
      },
    })));
}


/* ===== اختصارات لوحة المفاتيح (المرحلة ٤٩) ===== */

/**
 * **تُعرض حيث يراها من يريدها ولا تزاحم من لا يريدها.**
 * وثلاثةٌ تكفي: قائمةٌ طويلةٌ لا يحفظها أحدٌ وتزاحم اختصاراتِ المتصفّح.
 */
async function shortcutsBody() {
  /**
   * **قائمةٌ لا جدول** — وثلاثةُ صفوفٍ لا تستحقّ جدولًا أصلًا.
   *
   * و`.table` في هذا المشروع عرضُها الأدنى ٩٠٠ بكسل، فتُجبر عمودَ الإعدادات على ذلك
   * العرض ولو كانت في حاوية تُمرَّر — **فيفيض عرضُ الصفحة كلِّها على الآيباد**.
   * كشفتها `design-dhad`، وهي تقيس فيض الصفحة لا فيض الحاوية.
   */
  return el('div', {},
    el('div', { class: 'rule-list' }, SHORTCUTS.map((sc) => el('div', { class: 'rule-row' },
      // المفاتيحُ لاتينيّةٌ داخل سطرٍ عربيّ: تُعزل كي لا يقلب الاتجاهُ الثنائيُّ ترتيبَها.
      el('code', { class: 'num', text: sc.keys }),
      el('span', { class: 'strong', text: sc.label }),
      el('span', { class: 'muted small', text: sc.hint })))),
    el('p', { class: 'muted small', style: { marginTop: '8px' },
      text: 'تُقرأ بموضع الزرّ لا بحرفه، فتعمل بلوحةٍ عربيّة وإنجليزيّة سواء. ولا تُخطف حرفًا من يدِ من يكتب في حقل — إلا الحفظ، وهو موضعه.' }));
}
