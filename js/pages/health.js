// صفحة «صحة البيانات» (المرحلة ١٧): ما ينقص، ومَن يتضرّر من نقصه.
//
// لا تُصلح شيئًا بنفسها ولا تحذف ولا «تُنظّف تلقائيًا» — تدلّك على السجل وتفتحه لك، والقرار قرارك.
// وهذا مقصود: التنظيف الآلي في بياناتٍ لا نسخة منها إلا عندك مخاطرةٌ لا داعي لها.

import { repo } from '../data/repository.js';
import { getLists, typeLabel } from '../data/settings.js';
import { healthReport } from '../util/health.js';
import { externalDuplicates } from '../util/duplicates.js';
import { el, clear, badge, emptyState } from '../util/dom.js';
import { formatNumber, formatSAR } from '../util/format.js';

const LINK_BY_KEY = {
  'property-unmatched': (id) => `#/properties/${id}`,
  'property-no-price': (id) => `#/properties/${id}`,
  'property-no-area': (id) => `#/properties/${id}`,
  'property-no-location': (id) => `#/properties/${id}`,
  'external-unready': (id) => `#/external/${id}`,
  'client-no-phone': (id) => `#/clients/${id}`,
  'client-duplicate': (id) => `#/clients/${id}`,
  'request-stale': (id) => `#/requests/${id}`,
};

export async function render(container) {
  const [properties, clients, requests, externals, deals, lists] = await Promise.all([
    repo.properties.list(), repo.clients.list(), repo.requests.list(),
    repo.externalListings.list(), repo.deals.list(), getLists(),
  ]);
  const report = healthReport({
    properties, clients, requests, externals, deals,
    typeName: (key) => (key ? typeLabel(lists, key) : ''),
  });

  clear(container);
  container.append(
    el('div', { class: 'page-head' }, el('h1', {}, 'صحة البيانات')),
    el('div', { class: 'notice' },
      el('strong', { text: 'الحقل الناقص لا يُعطِّل الميزة بضجيج — بل يُسكتها. ' }),
      'التقدير يقف على السعر والمساحة، والمطابقة على النوع والمدينة والغرض، والخريطة على ',
      'الموقع. فحين ينقص الحقل تظن أن لا فرص ولا مطابقات، وأنت من حرمها مادّتها. ',
      'وهذه الصفحة تدلّ ولا تُصلح: لا تحذف ولا تعدّل شيئًا من تلقاء نفسها.'));

  // عروض خارجية يُشتبه أنها عقارك (المرحلة ٣٢) — تُعرض قبل بقيّة الملاحظات لأنها الأهم.
  const dups = externalDuplicates({ properties, externals });
  if (dups.length) {
    container.append(el('section', { class: 'panel health-group' },
      el('div', { class: 'today-head' },
        el('h2', {}, 'عروض خارجية تشبه مخزونك ', badge(formatNumber(dups.length), 'badge-warn')),
        el('a', { class: 'small', href: '#/external', text: 'العروض الخارجية →' })),
      el('p', { class: 'muted small', text: 'المدينة والحي والنوع نفسها، والمساحة والسعر متقاربان. إمّا وسيطٌ آخر يسوّق عرضك — وربما بسعر غير سعرك — وإمّا أنك رصدتَ عقارك مرّتين فيُحسب مرّتين في مؤشر السعر.' }),
      el('div', { class: 'health-items' }, dups.slice(0, 10).map((x) => el('a', {
        class: 'health-item', href: `#/properties/${x.property.id}`,
      },
        el('span', { class: 'strong', text: `${typeLabel(lists, x.property.type)} — ${[x.property.district, x.property.city].filter(Boolean).join('، ')}` }),
        el('span', {
          class: 'muted small',
          text: x.priceGap == null
            ? 'أحدهما بلا سعر — راجعه بنفسك'
            : (x.priceGap === 0
              ? 'بالسعر نفسه'
              : `المعلن ${x.priceGap > 0 ? 'أعلى' : 'أقل'} بـ${formatSAR(Math.abs(x.priceGap))}`),
        })))),
      dups.length > 10 ? el('p', { class: 'muted small', text: `و${formatNumber(dups.length - 10)} غيرها.` }) : null));
  }

  if (!report.groups.length) {
    if (!dups.length) container.append(emptyState('لا ملاحظات — بياناتك كاملة بحسب كل فحوص هذه الصفحة.'));
    return;
  }

  container.append(el('div', { class: 'stat-strip' },
    el('div', { class: 'stat-chip' },
      el('div', { class: 'stat-num', text: formatNumber(report.totalIssues) }),
      el('div', { class: 'stat-label', text: 'سجل يحتاج إكمالًا' })),
    el('div', { class: 'stat-chip' },
      el('div', { class: 'stat-num', text: formatNumber(report.groups.length) }),
      el('div', { class: 'stat-label', text: 'نوع ملاحظة' }))));

  for (const group of report.groups) {
    container.append(el('section', { class: 'panel health-group' },
      el('div', { class: 'today-head' },
        el('h2', {}, group.label, ' ', badge(formatNumber(group.count), 'badge-warn')),
        el('a', { class: 'small', href: group.href, text: 'الصفحة →' })),
      el('p', { class: 'muted small', text: group.impact }),
      el('div', { class: 'health-items' }, group.items.slice(0, 12).map((item) => {
        const href = LINK_BY_KEY[group.key]?.(item.id) || group.href;
        return el('a', { class: 'health-item', href },
          el('span', { class: 'strong', text: item.label }),
          item.detail ? el('span', { class: 'muted small', text: item.detail }) : null);
      })),
      group.count > 12
        ? el('p', { class: 'muted small', text: `و${formatNumber(group.count - 12)} غيرها — افتح الصفحة لرؤيتها كلها.` })
        : null));
  }
}
