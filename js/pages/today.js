// صفحة «يومي» (المرحلة ١١): شاشة واحدة تجمع ما ينتظرك اليوم بدل التنقّل بين أربع صفحات.
//
// **لا تُنشئ ولا تُخزّن شيئًا جديدًا:** كل رقم هنا محسوب لحظيًا من البيانات نفسها التي تعرضها
// الصفحات الأخرى (نفس دوال المصدر: tourStats للمطابقة، getFollowUpSettings للحدّ، إلخ)،
// فلا مصدر حقيقة ثانيًا يمكن أن يتناقض معها.

import { repo } from '../data/repository.js';
import { ENUMS, labelFor, clientPriority, clientTagClass, reviewCandidates } from '../data/schema.js';
import { getLists, getCompleteness, getFollowUpSettings, typeLabel, getUI, setUI, getGoals, getCompany, getPlaybooks, getPublishSettings } from '../data/settings.js';
import { loadMatchingContext, candidatesFor, matchReadiness } from '../data/matching.js';
import { buildOpportunityIndex, topOpportunities } from '../util/opportunity.js';
import { receivables } from '../util/receivables.js';
import { awaitingReply } from '../util/lead-score.js';
import { upcomingShowings, needFeedback } from '../util/showings.js';
import { expiringAgreements } from '../util/agreements.js';
import { dealAnniversaries } from '../util/calendar.js';
import { runPlans } from '../util/plans.js';
import { el, clear, badge, emptyState, confirmDialog, toast, openModal, labeled, selectEl } from '../util/dom.js';
import { formatSAR, formatDate, formatDateTime, formatNumber, relativeDays, daysBetween, daysWord, countWord } from '../util/format.js';
import { formatPhone, toInternational } from '../util/phone.js';
import { clientName } from './requests.js';
import { audioNoteField } from '../util/audio-note.js';
import { openedNotCalled } from '../util/list-opens.js';
import { readPublicApi } from '../util/public-api.js';
import { orderByCallTime, callFit, noShowCounts, windowAt } from '../util/call-timing.js';

export async function render(container) {
  const data = await loadData();
  build(container, data);
  // ختم الزيارة بعد البناء: «الجديد منذ آخر دخول» يُحسب بالختم السابق لا بالحالي.
  await setUI({ lastVisitAt: new Date().toISOString() });
}

async function loadData() {
  const [ui, lists, completeness, followUp, ctx, tasks, externals, invoices, goals, deals, expenses, company] = await Promise.all([
    getUI(), getLists(), getCompleteness(), getFollowUpSettings(),
    loadMatchingContext({ withMatches: true }), repo.tasks.list(), repo.externalListings.list(), repo.invoices.list(),
    getGoals(), repo.deals.list(), repo.expenses.list(), getCompany(),
  ]);
  const showings = await repo.showings.list(); // المعاينات (المرحلة ٢٧)
  // فتحات قوائم العملاء (المرحلة ٣٥): إشارةٌ تأتي من الخادم، فقد لا تصل — بلا اتصال، أو
  // والدالة غير منشورة. وفشلُها **لا يكسر «يومي»**: لوحةٌ تغيب أهون من صفحةٍ لا تُفتح.
  //
  // **ولا يُسأل الخادم إلا إن كان للسؤال معنى:** القائمة المخصّصة لا تُنشأ إلا من عروضٍ
  // منشورة (تردّ الدالة نفسها بـ400 على قائمةٍ بلا عروض)، فمن لم ينشر شيئًا لا قوائم له.
  // وطلبٌ يُرسَل في كل فتحةٍ لأكثر صفحاتك فتحًا، ليعود بلا شيء، كلفةٌ بلا مقابل.
  const publishSettings = await getPublishSettings();
  const hasPublished = (publishSettings.publishedRefs || []).length > 0;
  const clientLists = hasPublished
    ? ((await readPublicApi('/api/client-list', { lists: [] })) || {}).lists || []
    : [];

  // الطلبات التي لم يُردَّ عليها (المرحلة ٣٥).
  //
  // الطلب الجديد يُنبَّه عليه فورًا منذ المرحلة ٢٢، لكنه بعدها **لا يُرى إلا في صفحة
  // «الصفحة العامة للعروض»** — صفحةٍ تفتحها لتنشر لا لتعمل. فتنبيهٌ ضاع من فوق الشاشة
  // يعني طلبًا لا يراه أحد. وبقاؤه في المخزن هو علامة أنه لم يُردَّ عليه: إدخالُه عميلًا
  // أو صرفُه يحذفه.
  const pendingLeads = (((await readPublicApi('/api/lead', { leads: [] })) || {}).leads || [])
    .map((l) => ({ ...l, kind: 'lead' }));
  const since = ui.lastVisitAt || null;
  const due = receivables({ invoices, deals }); // المستحقات (المرحلة ١٧)
  // عملاء جدد بلا ردّ (المرحلة ٢٣): «سرعة الردّ» أقوى ما تبيعه الأنظمة الكبرى، وحسابه بسيط.
  // «لا تتصل» (المرحلة ٣٢): من طلب ألّا تتصل به لا تُلحّ عليه اللوحات — ويبقى في قوائمه.
  const reachable = ctx.clients.filter((c) => !c.doNotContact);
  const waiting = awaitingReply(reachable, { minutes: followUp.replyWithinMinutes ?? 60 });
  const clientsById = new Map(ctx.clients.map((c) => [c.id, c]));
  const now = Date.now();

  /* فتح قائمته ولم يتصل (المرحلة ٣٥) — أحرّ إشارة شراءٍ في النظام */
  const openedLists = openedNotCalled({
    lists: clientLists,
    clients: ctx.clients,
    contactsByClient: new Map(ctx.clients.map((c) => [c.id, repo.clients.lastContactAt(c)])),
    now,
  });

  /* متابعات اليوم: موعد المتابعة المسجَّل حلّ أو فات */
  const followUps = orderByCallTime(ctx.clients
    .map((c) => ({ client: c, at: repo.clients.nextFollowUp(c) }))
    .filter((x) => x.at && new Date(x.at).getTime() <= now + 86400000)
    .sort((a, b) => (a.at || '').localeCompare(b.at || '')), (r) => r.client, now);

  /* عملاء تجاوزوا حدّ عدم التواصل */
  const stale = reachable
    .map((c) => ({ client: c, last: repo.clients.lastContactAt(c) }))
    .filter((x) => !['won', 'closed'].includes(x.client.stage))
    .map((x) => ({ ...x, days: x.last ? daysBetween(x.last, new Date().toISOString()) : null }))
    .filter((x) => x.days == null || x.days >= followUp.staleContactDays)
    .sort((a, b) => (b.days ?? 9999) - (a.days ?? 9999));
  // الاتصال في وقته (المرحلة ٣٥): من وقتُه الآن يتقدّم، والباقي يبقى على ترتيب الإلحاح.
  const staleOrdered = orderByCallTime(stale, (r) => r.client, now);

  /* مهام اليوم والمتأخرة */
  const pending = tasks.filter((t) => !t.done && t.dueAt);
  const dueTasks = pending
    .filter((t) => new Date(t.dueAt).getTime() <= now + 86400000)
    .sort((a, b) => (a.dueAt || '').localeCompare(b.dueAt || ''));

  /* مطابقات جديدة: مرشّح فوق الحدّ لم يُسجَّل عليه أي تصرّف بعد.
   *
   * **وبحدٍّ على الطلبات المفحوصة** (المرحلة ٣٥). قيسَ: بخمسة آلاف عقار وثلاثمئة طلب نشط
   * كان هذا يبني **٦١١٬٨٠٧ مرشّحًا** ويرتّبها — تسع ثوانٍ — لتُعرض منها ثمانية. واللوحة
   * ترتّب بأولوية العميل أوّلًا، فنفحص الطلبات بذلك الترتيب نفسه ونقف عند حدٍّ: من هم
   * أولى بمكالمتك يُفحصون، ومن دونهم صفحةُ المطابقات لهم. وبلا هذا الحدّ تتجمّد أكثر
   * صفحاتك فتحًا على الجوّال.
   */
  const NEW_MATCH_REQUEST_CAP = 40;
  const NEW_MATCH_PER_REQUEST = 20;
  const saved = new Set(ctx.matches.map((m) => `${m.requestId}:${m.propertyId || m.externalId}`));
  const newMatches = [];
  const scanned = ctx.requests
    .filter((r) => r.status === 'active')
    .sort((a, b) => clientPriority(clientsById.get(b.clientId)) - clientPriority(clientsById.get(a.clientId)))
    .slice(0, NEW_MATCH_REQUEST_CAP);
  for (const request of scanned) {
    let taken = 0;
    for (const row of candidatesFor(request, ctx, { minScore: ctx.settings.minScore })) {
      if (saved.has(`${request.id}:${row.listing.id}`)) continue;
      newMatches.push({ request, client: clientsById.get(request.clientId), row });
      if (++taken >= NEW_MATCH_PER_REQUEST) break;
    }
  }
  newMatches.sort((a, b) => (clientPriority(b.client) - clientPriority(a.client)) || (b.row.score - a.row.score));

  /* ما يحتاج إكمالًا */
  const approved = ctx.properties.filter((p) => p.captureStatus === 'approved');
  const incomplete = approved.filter((p) => !repo.properties.isComplete(p, {
    owner: clientsById.get(p.ownerId) || null, fields: completeness,
  }).complete);
  const awaitingApproval = ctx.properties.filter((p) => p.captureStatus !== 'approved');
  const unreadyExternals = externals.filter((x) => x.status === 'active' && !matchReadiness(x).ready);

  // أعلى الأحياء عجزًا (المرحلة ١٢) — نفس حساب صفحة «الفرص» بلا تكرار منطق.
  const opportunities = topOpportunities(buildOpportunityIndex(ctx, { minScore: ctx.settings.minScore }).rows, 3);

  /* الأهداف الشهرية والتجديدات والعروض البائتة (المرحلة ١٣) */
  const thisMonth = (iso) => {
    const d = new Date(iso);
    return !Number.isNaN(d.getTime()) && d.getFullYear() === new Date().getFullYear() && d.getMonth() === new Date().getMonth();
  };
  const monthDeals = deals.filter((d) => thisMonth(d.date));
  const progress = {
    goals,
    deals: monthDeals.length,
    commission: monthDeals.reduce((a, d) => a + (Number(d.commission) || 0), 0),
    spent: expenses.filter((e) => thisMonth(e.date)).reduce((a, e) => a + (Number(e.amount) || 0), 0),
  };
  // تجديد الإيجار: العقد الذي ينتهي خلال ٤٥ يومًا (أو انتهى ولم يُتابَع).
  const renewals = deals
    .filter((d) => d.leaseEndAt)
    .map((d) => ({ deal: d, days: daysBetween(new Date().toISOString(), d.leaseEndAt) }))
    .filter((x) => x.days != null && x.days <= 45)
    .sort((a, b) => a.days - b.days);
  // العرض البائت: عقار معتمد لم يُحدَّث منذ الحدّ المضبوط في الإعدادات.
  const staleListings = approved
    .map((p) => ({ property: p, days: daysBetween(p.updatedAt, new Date().toISOString()) }))
    .filter((x) => x.days != null && x.days >= goals.staleListingDays
      && !['sold', 'rented'].includes(x.property.status))
    .sort((a, b) => b.days - a.days);

  return {
    since, lists, followUps, stale: staleOrdered, dueTasks, newMatches, incomplete, awaitingApproval, unreadyExternals, opportunities,
    progress, renewals, staleListings,
    clientsById, waiting, tasksPending: tasks.filter((t) => !t.done).length,
    quotesOpen: invoices.filter((i) => i.type === 'quote').length,
    due,
    // طلب التقييم (المرحلة ٢٥): لا لوحة بلا رابط تقييم — زرٌّ يرسل عميلك إلى لا شيء أسوأ من غيابه.
    reviews: company.reviewUrl ? reviewCandidates(deals) : [],
    reviewUrl: company.reviewUrl || '',
    company,
    // ذكرى الصفقة السنوية (المرحلة ٣٢)
    anniversaries: dealAnniversaries(deals),
    // اتفاقيات توشك أو انتهت (المرحلة ٣١)
    agreements: expiringAgreements(ctx.properties, { defaultDays: company.agreementDurationDays || 90 }),
    // المعاينات (المرحلة ٢٧): القادمة خلال ٤٨ ساعة، والتي مضت بلا انطباع.
    upcoming: upcomingShowings(showings),
    pendingFeedback: needFeedback(showings),
    // فتح قائمته ولم يتصل (المرحلة ٣٥)
    openedLists,
    // طلبات لم يُردَّ عليها (المرحلة ٣٥) — الأقدم أولًا: هو أخطرها
    pendingLeads: [...pendingLeads].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))),
    // الاتصال في وقته (المرحلة ٣٥): الفترة الحالية، ومن أخلف مواعيده.
    callWindow: windowAt(now),
    noShows: noShowCounts(showings),
    propertiesById: new Map(ctx.properties.map((p) => [p.id, p])),
    externalsById: new Map(externals.map((x) => [x.id, x])),
  };
}

/* ===== العرض ===== */

/** عبارة التأخّر: «تأخّر ١٢ يومًا» أصدق من تاريخٍ يُحسب في الذهن. */
function dueWhen(r) {
  if (r.days > 0) return `تأخّر ${daysWord(r.days)}${r.dated ? '' : ' عن تاريخه'}`;
  if (r.days === 0) return 'يستحق اليوم';
  return `يستحق بعد ${daysWord(-r.days)}`;
}

/**
 * نقاط المكالمة (المرحلة ٢٨): ما تقوله وأنت تتكلّم، مطويّة افتراضيًا.
 *
 * **مطويّة بقصد:** الاستمارة لتسجيل ما جرى لا لتلقينك، ومن أرادها فتحها. وهي نصّ محض —
 * لا تُنشئ مهمة ولا تُرسل شيئًا ولا تُخزَّن مع العميل، وتُحرَّر كلها من الإعدادات.
 */
function playbookBox() {
  const box = el('details', { class: 'playbook-box' }, el('summary', { text: 'نقاط تقولها في المكالمة' }));
  const body = el('div', { class: 'muted small', text: 'جارٍ التحميل…' });
  box.append(body);
  getPlaybooks().then((books) => {
    clear(body);
    if (!books.length) {
      body.append(el('p', { class: 'muted small', text: 'لا نصوص محفوظة — أضفها من الإعدادات.' }));
      return;
    }
    const select = selectEl({ options: books.map((b) => ({ value: b.id, label: b.name })), value: books[0].id });
    const points = el('ul', { class: 'simple-list' });
    const draw = () => {
      clear(points);
      const book = books.find((b) => b.id === select.value) || books[0];
      points.append(...book.points.map((t) => el('li', {}, el('span', { text: t }))));
    };
    select.addEventListener('change', draw);
    body.append(select, points, el('a', { class: 'btn btn-ghost btn-sm', href: '#/settings', text: 'حرّرها →' }));
    draw();
  }).catch(() => { clear(body); body.append(el('p', { class: 'muted small', text: 'تعذّر تحميل النصوص.' })); });
  return box;
}

/**
 * تهنئة بذكرى الصفقة (المرحلة ٣٢) — بالقاعدة نفسها: **تُعرض قبل الإرسال ولا تُرسل نيابةً عنك**.
 */
async function greetAnniversary(deal, client, years, company) {
  const name = client?.name ? ` ${client.name}` : '';
  const text = `السلام عليكم${name}، مرّ اليوم ${years === 1 ? 'عام' : `${years} أعوام`} على صفقتك`
    + `${company?.name ? ` مع ${company.name}` : ''}. أسأل الله أن تكون مباركة.\n`
    + 'وإن احتجت شيئًا في العقار — بيعًا أو شراءً أو استشارة — فأنا في خدمتك.';
  const ok = await confirmDialog({
    title: 'تهنئة بذكرى الصفقة',
    message: `ستُفتح محادثة ${clientName(client)} بهذه الرسالة:\n\n${text}`,
    confirmText: 'افتح واتساب',
  });
  if (!ok) return;
  const phone = toInternational(client?.phone || '');
  if (phone) window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  else toast('العميل بلا جوال', 'info');
  await repo.deals.update(deal.id, { anniversaryGreetedAt: new Date().toISOString() });
  if (client?.id) {
    await repo.clients.addContact(client.id, { type: 'whatsapp', date: new Date().toISOString(), note: 'تهنئة بذكرى الصفقة' }).catch(() => {});
  }
  window.dispatchEvent(new CustomEvent('kassab:data-changed'));
  build(document.getElementById('page'), await loadData());
}

/** عنوان المعاينة: العقار الذي ستعاينه، من مخزونك أو من العروض الخارجية. */
function showingTitle(d, showing) {
  const p = showing.propertyId ? d.propertiesById.get(showing.propertyId) : d.externalsById.get(showing.externalId);
  if (!p) return 'عقار محذوف';
  return `${typeLabel(d.lists, p.type)} — ${[p.district, p.city].filter(Boolean).join('، ') || 'بلا حي'}`;
}

/** زرّ اتصال سريع بصاحب الموعد — الرقم في متناولك وأنت في الطريق. */
function clientPhoneButton(client) {
  if (!client?.phone) return null;
  return el('a', { class: 'btn btn-ghost btn-sm', href: `tel:${client.phone}`, text: '📞', title: 'اتصال' });
}

/**
 * انطباع العميل بعد المعاينة (المرحلة ٢٧).
 *
 * سؤالٌ واحد بثلاثة أجوبة، والسبب يُسأل عند «لم يعجبه» فقط — من أعجبه العقار لا سبب لرفضه.
 * و**«لم يعجبه» يغلق المطابقة بالسبب نفسه**: تسجيلان لحقيقة واحدة يتناقضان بعد أسبوع.
 */
function askShowingFeedback(showing) {
  const impressionSel = selectEl({
    options: ENUMS.showingImpressions.map((x) => ({ value: x.key, label: x.label })),
    value: 'liked',
  });
  const reasonSel = selectEl({
    options: ENUMS.matchRejectReasons.map((x) => ({ value: x.key, label: x.label })),
    placeholder: 'بلا سبب محدد', value: '',
  });
  const reasonField = el('div', { class: 'field field-full', hidden: true },
    el('span', { class: 'field-label', text: 'لماذا؟' }), reasonSel);
  const noteInput = el('textarea', { class: 'input', rows: 2, placeholder: 'ما قاله بالضبط — بعد شهر لن تتذكّره' });
  impressionSel.addEventListener('change', () => { reasonField.hidden = impressionSel.value !== 'disliked'; });

  const save = async () => {
    try {
      const impression = impressionSel.value;
      await repo.showings.update(showing.id, {
        status: 'done', impression,
        reason: impression === 'disliked' ? (reasonSel.value || null) : null,
        notes: [showing.notes, noteInput.value.trim()].filter(Boolean).join(' · '),
      });
      // إغلاق الحلقة: رأيٌ سلبي في المعاينة هو رفضٌ للمطابقة، بالسبب نفسه.
      if (impression === 'disliked' && showing.requestId) {
        const matches = await repo.matches.list();
        const match = matches.find((m) => m.requestId === showing.requestId
          && (m.propertyId === showing.propertyId || m.externalId === showing.externalId));
        if (match) await repo.matches.update(match.id, { status: 'not_interested', rejectReason: reasonSel.value || null });
      }
      // «بعد المعاينة» تُطلق الآن فعلًا — وحارس التكرار يمنع ازدواجها إن أُطلقت سابقًا.
      if (showing.requestId) {
        await runPlans('after_showing', { title: '', linkType: 'request', linkId: showing.requestId }).catch(() => {});
      }
      modal.close();
      toast('سُجّل رأي العميل', 'success');
      window.dispatchEvent(new CustomEvent('kassab:data-changed'));
      build(document.getElementById('page'), await loadData());
    } catch (err) { toast(err.message || 'تعذّر الحفظ', 'error'); }
  };

  const modal = openModal({
    title: 'ما رأيه في العقار؟',
    body: el('div', {},
      el('div', { class: 'form-grid' },
        labeled('الانطباع', impressionSel),
        reasonField,
        labeled('ما قاله', noteInput, { full: true })),
      el('p', { class: 'field-hint', text: '«لم يعجبه» يسجّل المطابقة مرفوضة بالسبب نفسه، فلا تسجّل الحقيقة مرّتين.' })),
    footer: [
      el('button', { type: 'button', class: 'btn btn-primary', text: 'احفظ', onClick: save }),
      el('button', { type: 'button', class: 'btn btn-ghost', text: 'لاحقًا', onClick: () => modal.close() }),
    ],
  });
}

/**
 * طلب التقييم بعد الصفقة (المرحلة ٢٥).
 *
 * **الرسالة تُعرض قبل الإرسال ولا تُرسل نيابةً عنك:** واتساب يفتح بالنص مكتوبًا وأنت تضغط
 * إرسال — فلا يخرج من اسمك كلامٌ لم تقرأه. والصفقة تُوسم «طُلب» بعد فتح المحادثة، فلا
 * يعود العميل نفسه في اللوحة غدًا.
 */
async function requestReview(event, deal, client, reviewUrl, company) {
  event.preventDefault();
  const name = client?.name ? ` ${client.name}` : '';
  const office = company?.name ? ` من ${company.name}` : '';
  const text = `السلام عليكم${name}، أسعدنا إتمام صفقتك${office}.\n`
    + `إن كانت خدمتنا نالت رضاك فتقييمك يعيننا كثيرًا — ولن يأخذ منك دقيقة:\n${reviewUrl}\n`
    + 'وإن كان لديك ملاحظة نتحسّن بها فاكتبها لي مباشرة، فهي أنفع لنا من التقييم.';
  const ok = await confirmDialog({
    title: 'طلب تقييم',
    message: `ستُفتح محادثة ${clientName(client)} بهذه الرسالة:\n\n${text}`,
    confirmText: 'افتح واتساب',
  });
  if (!ok) return;
  const phone = toInternational(client?.phone || '');
  if (phone) window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  else toast('العميل بلا جوال — نُسخ النص لترسله بنفسك', 'info', 6000);
  await repo.deals.update(deal.id, { reviewRequestedAt: new Date().toISOString() });
  if (client?.id) {
    await repo.clients.addContact(client.id, { type: 'whatsapp', date: new Date().toISOString(), note: 'طلب تقييم بعد الصفقة' }).catch(() => {});
  }
  window.dispatchEvent(new CustomEvent('kassab:data-changed'));
  build(document.getElementById('page'), await loadData());
}

/** قبض دفعة إيجار من «يومي» (المرحلة ٢٤) — بنفس منطق قبض العمولة. */
async function markPaymentPaid(event, r) {
  event.preventDefault();
  const ok = await confirmDialog({
    title: 'قبض الدفعة',
    message: `تأكيد قبض ${formatSAR(r.remaining)} المستحقة في ${formatDate(r.basis)}؟`,
    confirmText: 'قُبضت',
  });
  if (!ok) return;
  const payments = (r.deal.payments || []).map((p) => (p.id === r.id ? { ...p, paidAt: new Date().toISOString() } : p));
  await repo.deals.update(r.dealId, { payments });
  toast('سُجّل قبض الدفعة', 'success');
  window.dispatchEvent(new CustomEvent('kassab:data-changed'));
  build(document.getElementById('page'), await loadData());
}

/** قبض العمولة من «يومي» مباشرة: لا صفحة للصفقات، وفتح المطابقات لأجل هذا تكلّف خطوات. */
async function markCommissionPaid(event, r) {
  event.preventDefault();
  const ok = await confirmDialog({
    title: 'قبض العمولة',
    message: `تأكيد قبض عمولة ${formatSAR(r.remaining)} لصفقة ${formatDate(r.basis)}؟`,
    confirmText: 'قُبضت',
  });
  if (!ok) return;
  await repo.deals.update(r.id, { commissionPaidAt: new Date().toISOString() });
  toast('سُجّل قبض العمولة', 'success');
  window.dispatchEvent(new CustomEvent('kassab:data-changed'));
  const container = document.getElementById('page');
  build(container, await loadData());
}

function section(title, count, body, { href = null, hrefText = null, tone = '', money = false } = {}) {
  // `money` توسم اللوحة حسّاسة (المرحلة ٣٦): لا يراها العميل على شاشتك ولا يراها المساعد.
  return el('section', money
    ? { class: `panel today-panel ${tone}`.trim(), 'data-sensitive': '' }
    : { class: `panel today-panel ${tone}`.trim() },
    el('div', { class: 'today-head' },
      el('h2', {}, title, count != null ? el('span', { class: 'count', text: ` (${count})` }) : null),
      href ? el('a', { class: 'btn btn-ghost btn-sm', href, text: hrefText || 'فتح →' }) : null),
    body);
}

const row = (main, meta, actions = null) => el('div', { class: 'today-row' },
  el('div', {}, el('div', { class: 'strong' }, main), meta ? el('div', { class: 'muted small' }, meta) : null),
  actions);

/**
 * شاراتٌ تسبق الاتصال (المرحلة ٣٥): وقتُه، وسجلّ حضوره.
 * ولا تُخفي أحدًا — تُخبر فقط، فالقرار قرارك وقد تكون مكالمتك عاجلة.
 */
function callHints(client, d) {
  const hints = [];
  if (callFit(client, Date.now()) === 'later' && client?.bestTime) {
    hints.push(badge(`يفضّل ${labelFor(ENUMS.contactTimes, client.bestTime)}`, 'badge-warn'));
  }
  // «أخلف موعدين» لا «أخلف ٢ مواعيد»: للعربية مثنًّى، و`countWord` تعرفه منذ المرحلة ١٧.
  const missed = d?.noShows?.get(client?.id) || 0;
  if (missed) {
    hints.push(badge(`أخلف ${countWord(missed, ['موعدًا', 'موعدين', 'مواعيد', 'موعدًا'])}`,
      missed >= 2 ? 'badge-danger' : ''));
  }
  return hints.length ? el('span', { class: 'row', style: { gap: '4px' } }, ...hints) : null;
}

function clientActions(client) {
  const actions = el('div', { class: 'row' });
  if (client?.phone) {
    actions.append(
      el('a', {
        class: 'btn btn-ghost btn-sm', href: `tel:${client.phone}`, text: '📞', title: 'اتصال',
        onClick: () => askLogContact(client, 'call'),
      }),
      el('a', {
        class: 'btn btn-ghost btn-sm', title: 'واتساب', text: '💬',
        href: `https://wa.me/${toInternational(client.phone)}`, target: '_blank', rel: 'noopener noreferrer',
        onClick: () => askLogContact(client, 'whatsapp'),
      }));
  }
  actions.append(el('a', { class: 'btn btn-ghost btn-sm', href: `#/client/${client.id}`, text: 'الملف', title: 'ملف العميل الكامل' }));
  return actions;
}

/**
 * تسجيل التواصل بعد الاتصال (المرحلة ١٩).
 *
 * كان الاتصال من هنا **لا يُسجَّل**، فيبقى العميل في «لم يُتواصل معهم» وأنت كلّمته للتوّ —
 * وثلاث لوحات تبني على `lastContactAt`: المتابعات، والمتأخرون، وحدّ الداشبورد. فتكذب كلها.
 *
 * والنافذة تُفتح **بعد** فتح المهاتفة لا قبلها (بمهلة قصيرة)، فلا تعترض طريق المكالمة،
 * و«لم أتواصل» خيارٌ صريح لأن الضغط على الزر ليس دليلًا على أن أحدًا ردّ.
 */
function askLogContact(client, type) {
  setTimeout(() => {
    const noteInput = el('input', { class: 'input', type: 'text', placeholder: 'خلاصة المكالمة (اختياري)' });
    const followInput = el('input', { class: 'input', type: 'date' });
    const audio = audioNoteField(); // ملاحظة صوتية (المرحلة ٢٦) — بعد المكالمة مباشرة حيث الكلام حاضر
    const playbook = playbookBox(); // نقاط تقولها (المرحلة ٢٨)
    const save = async () => {
      try {
        const voice = audio ? await audio.save(client.id) : null;
        await repo.clients.addContact(client.id, {
          type,
          date: new Date().toISOString(),
          note: noteInput.value.trim(),
          followUpAt: followInput.value ? new Date(`${followInput.value}T09:00:00`).toISOString() : null,
          audioId: voice?.audioId || null, audioSeconds: voice?.audioSeconds || 0,
        });
        modal.close();
        toast('سُجّل التواصل', 'success');
        window.dispatchEvent(new CustomEvent('kassab:data-changed'));
        build(document.getElementById('page'), await loadData());
      } catch (err) { toast(err.message || 'تعذّر التسجيل', 'error'); }
    };
    const modal = openModal({
      title: `تسجيل ${type === 'call' ? 'المكالمة' : 'الرسالة'} — ${clientName(client)}`,
      body: el('div', {},
        el('p', { class: 'muted small', text: 'يُحدَّث «آخر تواصل» فلا يظهر العميل متأخرًا وأنت كلّمته.' }),
        el('div', { class: 'form-grid' },
          labeled('ملاحظة', noteInput, { full: true }),
          labeled('موعد المتابعة القادم', followInput, { hint: 'اختياري — يظهر في «متابعات اليوم»' }),
          audio ? el('div', { class: 'field field-full' },
            el('span', { class: 'field-label', text: 'ملاحظة صوتية' }), audio.node,
            el('span', { class: 'field-hint', text: 'تبقى في جهازك: لا تُرفع ولا تُفرَّغ نصًّا في أي خدمة.' })) : null),
        playbook),
      onClose: () => audio?.discard(),
      footer: [
        el('button', { type: 'button', class: 'btn btn-primary', text: 'سجّل', onClick: save }),
        el('button', { type: 'button', class: 'btn btn-ghost', text: 'لم أتواصل', onClick: () => modal.close() }),
      ],
    });
  }, 700);
}

function build(container, d) {
  clear(container);
  const greeting = new Date().getHours() < 12 ? 'صباح الخير' : 'مساء الخير';
  container.append(el('div', { class: 'page-head' },
    el('h1', {}, `${greeting} — هذا ما ينتظرك اليوم`),
    el('span', { class: 'muted small', text: d.since ? `آخر دخول: ${formatDateTime(d.since)}` : 'أول دخول' })));

  container.append(el('div', { class: 'stat-strip' },
    chip(d.followUps.length, 'متابعة اليوم'),
    chip(d.dueTasks.length, 'مهمة مستحقة'),
    chip(d.newMatches.length, 'مطابقة جديدة'),
    chip(d.stale.length, 'عميل متأخر'),
    chip(d.incomplete.length, 'عقار ناقص')));

  const grid = el('div', { class: 'today-grid' });
  container.append(grid);

  /* الأهداف الشهرية (المرحلة ١٣) — لا تظهر ما لم تضبط هدفًا */
  if (d.progress.goals.dealsPerMonth || d.progress.goals.commissionPerMonth) {
    grid.append(section('هدف الشهر', null, el('div', {},
      goalBar('صفقات', d.progress.deals, d.progress.goals.dealsPerMonth, (v) => String(v)),
      goalBar('عمولات', d.progress.commission, d.progress.goals.commissionPerMonth, formatSAR),
      el('p', { class: 'muted small', text: `مصاريف هذا الشهر: ${formatSAR(d.progress.spent)} · الصافي: ${formatSAR(d.progress.commission - d.progress.spent)}` })),
    { href: '#/expenses', hrefText: 'المصاريف →', money: true }));
  }

  /* طلبات من صفحتك العامة لم يُردَّ عليها (المرحلة ٣٥) — لا شيء أعجل منها */
  if (d.pendingLeads.length) {
    grid.append(section('طلبات من صفحتك لم يُردَّ عليها', d.pendingLeads.length,
      el('div', {},
        el('p', { class: 'muted small', text: 'زائرٌ ترك رقمه ولم يُدخَل بعد. إدخاله عميلًا — أو صرفه — يُخرجه من هنا.' }),
        ...d.pendingLeads.slice(0, 8).map((lead) => row(
          el('span', {}, lead.name || 'بلا اسم',
            lead.ref ? badge(`عرض ${lead.ref}`, '') : null),
          `${lead.phone ? formatPhone(lead.phone) : 'بلا رقم'} · ${relativeDays(lead.createdAt)}`,
          el('div', { class: 'row' },
            lead.phone ? el('a', { class: 'btn btn-ghost btn-sm', href: `tel:${lead.phone}`, text: '📞', title: 'اتصال' }) : null,
            el('a', { class: 'btn btn-sm', href: '#/publish', text: 'أدخِله' }))))),
      { href: '#/publish', hrefText: 'الطلبات →', tone: 'today-warn' }));
  }

  /* عملاء ينتظرون ردّك (المرحلة ٢٣) — أول لوحة لأن التأخير هنا يكلّف عميلًا لا وقتًا */
  if (d.waiting.length) {
    grid.append(section('ينتظرون ردّك', d.waiting.length,
      el('div', {},
        el('p', { class: 'muted small', text: 'سُجّلوا ولم يُسجَّل معهم أي تواصل. سجّل المكالمة بعدها فيخرجون من هنا.' }),
        ...d.waiting.slice(0, 8).map(({ client, waitedMinutes }) => row(
          clientName(client),
          waitedMinutes < 120 ? `منذ ${waitedMinutes} دقيقة` : `منذ ${Math.round(waitedMinutes / 60)} ساعة`,
          clientActions(client)))),
      { href: '#/clients', hrefText: 'العملاء →', tone: 'today-warn' }));
  }

  /* فتح قائمته ولم يتصل (المرحلة ٣٥) — الإشارة كانت عمودًا في جدولٍ لا يُفتح إلا للنشر */
  if (d.openedLists.length) {
    grid.append(section('فتحوا قائمتهم ولم تتصل بهم', d.openedLists.length,
      el('div', {},
        el('p', { class: 'muted small', text: 'من يفتح قائمة عقاراته مرّتين يقرأ لا يتصفّح. ولا يظهر هنا من كلّمتَه بعد فتحه.' }),
        ...d.openedLists.slice(0, 8).map(({ client, list, opens, lastOpenAt }) => row(
          clientName(client) || list.clientName || list.title || 'قائمة',
          `${formatNumber(opens)} فتحة · آخرها ${formatDateTime(lastOpenAt)}`,
          clientActions(client)))),
      { href: '#/publish', hrefText: 'القوائم →', tone: 'today-ok' }));
  }

  /* مستحقات لم تُقبض (المرحلة ١٧) — لا تظهر اللوحة إن لم يكن لك شيء عند أحد */
  if (d.due.rows.length) {
    grid.append(section('مستحقات لم تُقبض', d.due.rows.length,
      el('div', {},
        el('p', { class: 'strong', text: `${formatSAR(d.due.total)} لك عند الناس`
          + (d.due.overdueCount ? ` — منها ${formatSAR(d.due.overdueTotal)} تجاوزت استحقاقها` : '') }),
        ...d.due.rows.slice(0, 8).map((r) => row(
          r.kind === 'commission' ? `عمولة صفقة ${formatDate(r.basis)}`
            : r.kind === 'payment' ? `دفعة إيجار${r.payment.note ? ` — ${r.payment.note}` : ''}`
              : `فاتورة ${r.number || 'بلا رقم'}`,
          `${formatSAR(r.remaining)} · ${dueWhen(r)}${r.state === 'partial' ? ' · مقبوضة جزئيًا' : ''}`
            + (r.clientId && d.clientsById.get(r.clientId) ? ` · ${clientName(d.clientsById.get(r.clientId))}` : ''),
          r.kind === 'commission'
            ? el('button', {
              type: 'button', class: 'btn btn-ghost btn-sm', text: 'قُبضت',
              onClick: (e) => markCommissionPaid(e, r),
            })
            : r.kind === 'payment'
              ? el('button', {
                type: 'button', class: 'btn btn-ghost btn-sm', text: 'قُبضت',
                onClick: (e) => markPaymentPaid(e, r),
              })
              : el('a', { class: 'btn btn-ghost btn-sm', href: `#/invoices/${r.id}`, text: 'فتح' })))),
      { href: '#/invoices', hrefText: 'الفواتير →', tone: d.due.overdueCount ? 'today-warn' : '', money: true }));
  }

  /* ذكرى الصفقة (المرحلة ٣٢): أرخص إحالة في الوساطة كلمةٌ في يومها */
  if (d.anniversaries.length) {
    grid.append(section('ذكرى صفقة', d.anniversaries.length,
      el('div', {},
        el('p', { class: 'muted small', text: 'مرّ عام على صفقتهم. كلمةٌ في يومها تعيدهم إليك — وتجلب من يسألونه عنك.' }),
        ...d.anniversaries.slice(0, 5).map(({ deal, years }) => {
          const client = d.clientsById.get(deal.clientId);
          return row(
            clientName(client),
            `${formatNumber(years)} ${years === 1 ? 'سنة' : 'سنوات'} على صفقته · ${formatDate(deal.date)}`,
            el('div', { class: 'row' },
              el('button', {
                type: 'button', class: 'btn btn-sm', text: 'هنّئه',
                onClick: () => greetAnniversary(deal, client, years, d.company),
              }),
              el('button', {
                type: 'button', class: 'btn btn-ghost btn-sm', text: 'تخطَّ',
                onClick: async () => {
                  await repo.deals.update(deal.id, { anniversaryGreetedAt: new Date().toISOString() });
                  build(document.getElementById('page'), await loadData());
                },
              })));
        }))));
  }

  /* اتفاقيات الوساطة (المرحلة ٣١): عقارٌ انتهت اتفاقيته قد تخسره وأنت لا تدري */
  if (d.agreements.length) {
    const expired = d.agreements.filter((x) => x.state === 'expired').length;
    grid.append(section('اتفاقيات تنتهي', d.agreements.length,
      el('div', {}, d.agreements.slice(0, 6).map((x) => row(
        `${typeLabel(d.lists, x.property.type)} — ${[x.property.district, x.property.city].filter(Boolean).join('، ') || 'بلا حي'}`,
        x.state === 'expired'
          ? `انتهت منذ ${daysWord(-x.days)} — جدّدها أو اتفق مع المالك`
          : `تنتهي بعد ${daysWord(x.days)} (${formatDate(x.endsAt)})`,
        el('a', { class: 'btn btn-ghost btn-sm', href: `#/properties/${x.property.id}`, text: 'افتح العقار' }))),
      ),
      { href: '#/properties', hrefText: 'العقارات →', tone: expired ? 'today-warn' : '' }));
  }

  /* المعاينات (المرحلة ٢٧): القادمة أولًا — موعدٌ يفوتك أغلى من متابعة تتأخر */
  if (d.upcoming.length) {
    grid.append(section('معاينات قادمة', d.upcoming.length,
      el('div', {}, d.upcoming.slice(0, 6).map(({ showing, at }) => row(
        showingTitle(d, showing),
        `${formatDateTime(showing.at)} — ${at < Date.now() ? 'حان موعدها' : relativeDays(showing.at)}`
          + (showing.notes ? ` · ${showing.notes}` : ''),
        el('div', { class: 'row' },
          clientPhoneButton(d.clientsById.get(showing.clientId)),
          el('button', {
            type: 'button', class: 'btn btn-sm', text: 'تمّت',
            onClick: () => askShowingFeedback(showing),
          }),
          el('button', {
            type: 'button', class: 'btn btn-ghost btn-sm', text: 'لم يحضر',
            onClick: async () => {
              await repo.showings.update(showing.id, { status: 'no_show' });
              toast('سُجّل عدم الحضور', 'success');
              build(document.getElementById('page'), await loadData());
            },
          }))))),
      { tone: 'today-warn' }));
  }

  /* معاينات تمّت ولم تسجّل رأي العميل — أغنى لحظة في العملية، وتضيع بلا سؤال واحد */
  if (d.pendingFeedback.length) {
    grid.append(section('ما رأيه؟ معاينات تنتظر انطباعك', d.pendingFeedback.length,
      el('div', {},
        el('p', { class: 'muted small', text: 'ما قاله العميل وهو واقف في العقار لا يُقال في الهاتف — وهو ما يشرح لك لماذا تضيع الصفقات.' }),
        ...d.pendingFeedback.slice(0, 6).map(({ showing }) => row(
          showingTitle(d, showing),
          `${formatDateTime(showing.at)} · ${clientName(d.clientsById.get(showing.clientId))}`,
          el('button', {
            type: 'button', class: 'btn btn-sm', text: 'سجّل رأيه',
            onClick: () => askShowingFeedback(showing),
          }))))));
  }

  /* طلب التقييم بعد الصفقة (المرحلة ٢٥) */
  if (d.reviews.length) {
    grid.append(section('اطلب تقييمًا', d.reviews.length,
      el('div', {},
        el('p', { class: 'muted small', text: 'صفقات مضى عليها يومان فأكثر ولم تطلب تقييمها بعد. الرسالة جاهزة — راجعها قبل الإرسال.' }),
        ...d.reviews.slice(0, 6).map(({ deal, since }) => {
          const client = d.clientsById.get(deal.clientId);
          return row(
            clientName(client),
            `صفقة ${formatDate(deal.date)} · ${formatSAR(deal.finalPrice)} · مضى ${daysWord(since)}`,
            el('div', { class: 'row' },
              el('button', {
                type: 'button', class: 'btn btn-sm', text: 'اطلب التقييم',
                onClick: (e) => requestReview(e, deal, client, d.reviewUrl, d.company),
              }),
              el('button', {
                type: 'button', class: 'btn btn-ghost btn-sm', text: 'تخطَّ', title: 'وسمها مطلوبة بلا إرسال',
                onClick: async () => {
                  await repo.deals.update(deal.id, { reviewRequestedAt: new Date().toISOString() });
                  build(document.getElementById('page'), await loadData());
                },
              })));
        })),
      { href: '#/settings', hrefText: 'رابط التقييم →' }));
  }

  /* متابعات اليوم */
  grid.append(section('متابعات اليوم', d.followUps.length,
    d.followUps.length
      ? el('div', {},
        // **وخارجُ الفترات يُقال كذلك (المرحلة ٤٣):** كان السطر يختفي بعد العاشرة ليلًا وقبل
        // السادسة صباحًا، فتظنّ الترتيب اعتباطًا وقد كان يُرتَّب بالفترة نهارًا. والصمتُ هنا
        // يُفهَم خطأً — والصوابُ أن يُقال إنّ الوقت ليس وقتَ اتصالٍ أصلًا.
        el('p', { class: 'muted small', text: d.callWindow
          ? `الفترة الآن: ${labelFor(ENUMS.contactTimes, d.callWindow)} — ومن يفضّلها مقدَّمٌ في الترتيب.`
          : 'الفترة الآن: خارج أوقات الاتصال (٦ صباحًا – ١٠ مساءً) — فالترتيب بالموعد وحده.' }),
        ...d.followUps.slice(0, 8).map(({ client, at }) => row(
          el('span', {}, clientName(client), ...(client.tags || []).filter(clientTagClass).map((t) => badge(t, clientTagClass(t))), callHints(client, d)),
          `موعد المتابعة: ${formatDate(at)}${new Date(at).getTime() < Date.now() ? ' — فات' : ''}`,
          clientActions(client))))
      : el('p', { class: 'muted small', text: 'لا متابعات مجدولة اليوم.' }),
    { href: '#/clients', hrefText: 'العملاء →', tone: d.followUps.length ? 'today-warn' : '' }));

  /* مهام مستحقة */
  grid.append(section('مهام مستحقة', d.dueTasks.length,
    d.dueTasks.length
      ? el('div', {}, d.dueTasks.slice(0, 8).map((t) => row(
        t.title,
        `${formatDateTime(t.dueAt)}${new Date(t.dueAt).getTime() < Date.now() ? ' — متأخرة' : ''}`,
        el('a', { class: 'btn btn-ghost btn-sm', href: `#/tasks/${t.id}`, text: 'فتح' }))))
      : el('p', { class: 'muted small', text: `لا مهام مستحقة اليوم${d.tasksPending ? ` (${d.tasksPending} مهمة بلا موعد أو لاحقة)` : ''}.` }),
    { href: '#/tasks', hrefText: 'المهام →', tone: d.dueTasks.some((t) => new Date(t.dueAt) < Date.now()) ? 'today-warn' : '' }));

  /* مطابقات جديدة */
  grid.append(section('مطابقات جديدة لم تتصرّف فيها', d.newMatches.length,
    d.newMatches.length
      ? el('div', {}, d.newMatches.slice(0, 8).map(({ request, client, row: r }) => row(
        el('span', {}, `${r.score}٪ · `, clientName(client)),
        `${typeLabel(d.lists, r.listing.type)} — ${[r.listing.district, r.listing.city].filter(Boolean).join('، ')} · ${formatSAR(r.listing.price)}`,
        el('a', { class: 'btn btn-ghost btn-sm', href: `#/matches/${request.id}`, text: 'فتح' }))))
      : el('p', { class: 'muted small', text: 'لا مطابقات جديدة — كل المرشحين تصرّفت فيهم.' }),
    { href: '#/matches', hrefText: 'المطابقات →', tone: d.newMatches.length ? 'today-ok' : '' }));

  /* عملاء متأخرون */
  grid.append(section('عملاء لم يُتواصل معهم', d.stale.length,
    d.stale.length
      ? el('div', {}, d.stale.slice(0, 8).map(({ client, days }) => row(
        el('span', {}, clientName(client), callHints(client, d)),
        days == null ? 'لم يُسجَّل أي تواصل بعد' : `آخر تواصل قبل ${daysWord(days)}`,
        clientActions(client))))
      : el('p', { class: 'muted small', text: 'لا أحد تجاوز الحدّ.' }),
    { href: '#/clients' }));

  /* تجديد عقود الإيجار (المرحلة ١٣) */
  if (d.renewals.length) {
    grid.append(section('عقود إيجار تقترب نهايتها', d.renewals.length,
      el('div', {}, d.renewals.slice(0, 6).map(({ deal, days }) => row(
        `عقد ينتهي ${formatDate(deal.leaseEndAt)}`,
        days < 0 ? `انتهى قبل ${daysWord(Math.abs(days))} — تابع التجديد` : `بعد ${daysWord(days)} — كلّم الطرفين مبكرًا`,
        el('a', { class: 'btn btn-ghost btn-sm', href: '#/clients', text: 'العملاء' }))),
      ), { tone: 'today-warn' }));
  }

  /* عروض بائتة (المرحلة ١٣) */
  if (d.staleListings.length) {
    grid.append(section('عروض بائتة تحتاج مراجعة', d.staleListings.length,
      el('div', {}, d.staleListings.slice(0, 6).map(({ property, days }) => row(
        `${typeLabel(d.lists, property.type)} — ${[property.district, property.city].filter(Boolean).join('، ')}`,
        `لم يُحدَّث منذ ${daysWord(days)} — راجع السعر والتوفر`,
        el('a', { class: 'btn btn-ghost btn-sm', href: `#/properties/${property.id}`, text: 'فتح' }))),
      ), { href: '#/properties' }));
  }

  /* فرص الاقتناص (المرحلة ١٢) */
  grid.append(section('أحياء يطلبها عملاؤك ولا تملك فيها', d.opportunities.length,
    d.opportunities.length
      ? el('div', {}, d.opportunities.map((o) => row(
        o.district,
        `${o.unmet} طلب بلا أي مطابقة · مخزونك هناك: ${o.supply}`,
        el('a', { class: 'btn btn-ghost btn-sm', href: '#/opportunities', text: 'من يطلبه؟' }))))
      : el('p', { class: 'muted small', text: 'لا عجز — كل طلب نشط يجد مرشحًا.' }),
    { href: '#/opportunities', hrefText: 'الفرص →', tone: d.opportunities.length ? 'today-warn' : '' }));

  /* ما يحتاج إكمالًا */
  const chores = [];
  if (d.awaitingApproval.length) chores.push(row(`${d.awaitingApproval.length} التقاط بانتظار الاعتماد`, 'لا يدخل المطابقة قبل اعتماده',
    el('a', { class: 'btn btn-ghost btn-sm', href: '#/tours/queue', text: 'فتح' })));
  if (d.incomplete.length) chores.push(row(`${d.incomplete.length} عقار ناقص البيانات`, 'بحسب تعريف «مكتمل البيانات» في الإعدادات',
    el('a', { class: 'btn btn-ghost btn-sm', href: '#/properties', text: 'فتح' })));
  if (d.unreadyExternals.length) chores.push(row(`${d.unreadyExternals.length} عرض خارجي بانتظار الإكمال`, 'ينقصه النوع أو الغرض أو المدينة فلا يطابق شيئًا',
    el('a', { class: 'btn btn-ghost btn-sm', href: '#/external', text: 'فتح' })));
  if (d.quotesOpen) chores.push(row(`${d.quotesOpen} عرض سعر لم يتحوّل إلى فاتورة`, 'تابعه قبل أن يبرد',
    el('a', { class: 'btn btn-ghost btn-sm', href: '#/invoices', text: 'فتح' })));

  grid.append(section('يحتاج إكمالًا', chores.length,
    chores.length ? el('div', {}, chores) : el('p', { class: 'muted small', text: 'لا شيء ناقص — ممتاز.' })));
}

/** شريط تقدّم نحو هدف الشهر — يتجاوز ١٠٠٪ بلا كسر (تجاوزتَ هدفك). */
function goalBar(label, value, goal, fmt) {
  if (!goal) return null;
  const pct = Math.min(100, Math.round((value / goal) * 100));
  return el('div', { class: 'goal-row' },
    el('div', { class: 'goal-head' },
      el('span', { text: label }),
      el('span', { class: 'muted small', text: `${fmt(value)} من ${fmt(goal)} (${pct}٪)` })),
    el('div', { class: 'goal-track' }, el('div', { class: `goal-fill${value >= goal ? ' done' : ''}`, style: { width: `${pct}%` } })));
}

function chip(value, label) {
  return el('div', { class: 'stat-chip' },
    el('div', { class: 'stat-num', text: String(value) }),
    el('div', { class: 'stat-label', text: label }));
}
