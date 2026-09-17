/**
 * **البحوث المحفوظة، مشتركةً** (المرحلة ٤٩).
 *
 * بُنيت في المرحلة ١٧ **لصفحة العقارات وحدها**، ومكثت فيها اثنتين وثلاثين مرحلة.
 * وصفحتا العملاء والطلبات فيهما الفلاترُ نفسُها بالشكل نفسِه (`ctx.query` و`ctx.filters`
 * و`ctx.nodes.search`) وليس فيهما حفظ — فالوسيط يبني «فلل قرطبة بين ٢ و٣ مليون»
 * بستّ نقراتٍ صباحًا، ثم ينتقل لصفحةٍ أخرى فيضيع، فيبنيه ثانيةً بعد الظهر.
 *
 * **ولم يُكتب حفظٌ جديد**: نُقل ما في `properties.js` إلى هنا كما هو، فصار الثلاثةُ
 * يقرؤون من موضعٍ واحد. والتخزينُ نفسُه (`SETTINGS_KEYS.savedSearches`) بمفتاح صفحةٍ
 * لكلٍّ — فما حُفظ من قبل في العقارات يبقى كما هو ولا يمسّه شيء.
 */

import { getSavedSearches, addSavedSearch, removeSavedSearch } from '../data/settings.js';
import { el, clear, promptDialog, confirmDialog, toast } from './dom.js';

/** حالة الفرز الحالية في شكلٍ يُحفظ (المجموعات إلى مصفوفات). */
export function currentViewState(ctx, groups) {
  return {
    query: ctx.query || '',
    filters: Object.fromEntries(groups.map(([g]) => [g, [...(ctx.filters?.[g] || [])]])),
  };
}

/**
 * تطبيق حالةٍ محفوظة.
 * **والمجموعاتُ المجهولة تُتجاهل بلا خطأ**: فرزٌ حُذف من الصفحة بعد أن حُفظ بحثٌ فيه
 * لا يكسر البحث — يُطبَّق ما بقي، وهو أنفعُ من رفض الكلّ.
 */
export function applyViewState(ctx, groups, state) {
  ctx.query = state?.query || '';
  if (ctx.nodes?.search) ctx.nodes.search.value = ctx.query;
  for (const [g] of groups) {
    ctx.filters[g].clear();
    for (const v of state?.filters?.[g] || []) ctx.filters[g].add(v);
  }
}

/**
 * يرسم صفَّ الرقائق داخل `wrap`: المحفوظُ يُطبَّق بضغطة، ويُحذف بضغطة،
 * و«احفظ هذا البحث» **لا يظهر إلا وفي اليد ما يُحفظ** — زرُّ حفظٍ لبحثٍ فارغ عبث.
 *
 * @param {object} o
 * @param {HTMLElement} o.wrap الحاوية
 * @param {string} o.page مفتاح الصفحة في التخزين
 * @param {object} o.ctx سياق الصفحة (query · filters · nodes)
 * @param {Array} o.groups مجموعات الفرز `[[key, label]]`
 * @param {Function} o.onApply يُستدعى بعد تطبيق حالةٍ محفوظة (إعادة الرسم)
 * @param {string} [o.placeholder] مثالُ اسمٍ في نافذة الحفظ
 */
export async function renderSavedViews({ wrap, page, ctx, groups, onApply, placeholder = '' }) {
  if (!wrap) return;
  const items = await getSavedSearches(page);
  clear(wrap);
  const hasFilter = !!ctx.query || groups.some(([g]) => ctx.filters?.[g]?.size);
  const redraw = () => renderSavedViews({ wrap, page, ctx, groups, onApply, placeholder });

  wrap.append(...items.map((item) => el('span', { class: 'saved-chip' },
    el('button', {
      type: 'button', class: 'saved-apply', text: item.name,
      // اسمُ البحث وحده لا يقول أنّه بحثٌ يُطبَّق — والقارئُ بالصوت يسمع الاسمَ مجرَّدًا.
      'aria-label': `طبّق البحث المحفوظ: ${item.name}`,
      onClick: () => { applyViewState(ctx, groups, item.state); onApply(); redraw(); },
    }),
    el('button', {
      type: 'button', class: 'saved-del', text: '✕',
      title: 'حذف البحث المحفوظ', 'aria-label': `حذف البحث المحفوظ: ${item.name}`,
      onClick: async () => {
        const ok = await confirmDialog({ title: 'حذف بحث محفوظ', message: `حذف «${item.name}»؟`, confirmText: 'حذف', danger: true });
        if (!ok) return;
        await removeSavedSearch(page, item.id);
        redraw();
      },
    }))));

  if (!hasFilter) return;
  wrap.append(el('button', {
    type: 'button', class: 'btn btn-ghost btn-sm', text: '★ احفظ هذا البحث',
    onClick: async () => {
      const name = await promptDialog({ title: 'حفظ البحث', label: 'اسم البحث', placeholder, confirmText: 'حفظ' });
      if (!name) return;
      try {
        await addSavedSearch(page, name, currentViewState(ctx, groups));
        toast('حُفظ البحث', 'success');
        redraw();
      } catch (err) { toast(err.message, 'error'); }
    },
  }));
}
