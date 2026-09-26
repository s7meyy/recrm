// صفحة التكاملات (المرحلة ٣٧): ماذا يعمل، وماذا ينتظر، وما الخطوة التالية بيدك.
//
// وهي صفحة **حالة وخطوات** لا صفحة إعدادات: لا حقل مفتاحٍ فيها، لأن المفاتيح لا تنزل إلى
// المتصفح. تُكتب في Netlify فتبقى خارج قاعدة بياناتك ونسخك الاحتياطية وشاشتك.

import { el, clear, badge, emptyState, toast, disclosure } from '../util/dom.js';
import { loadIntegrations, runIntegration, explain, INTEGRATION_GUIDE } from '../data/integrations.js';
import { resetPublicApi } from '../util/public-api.js';

export async function render(container) {
  clear(container);
  container.append(el('div', { class: 'page-head' },
    el('h1', {}, 'التكاملات'),
    el('div', { class: 'head-actions' },
      // يصفّر «كفّ عن السؤال» قبل أن يعيد: جلسةٌ انتهت تمنع القراءة، وبلا زرٍّ يُعيد
      // المحاولة يبقى المستخدم أمام صفحةٍ فارغة لا يعرف كيف يُحييها إلا بتحديث المتصفح.
      el('button', {
        type: 'button', class: 'btn', text: 'تحديث الحالة',
        onClick: () => { resetPublicApi(); render(container); },
      }))));

  const rows = await loadIntegrations();
  if (!rows.length) {
    // **الصفحةُ لا تفرغ** (المرحلة ٤٢): كانت تقول «تعذّرت القراءة» وتسكت، فلا تعرف ما في
    // النظام أصلًا. والدليلُ محليٌّ لا يحتاج خادمًا — فتُعرض الأسماء وما ينقص كلَّ واحدٍ
    // منها، ويبقى ما لا يُعرف بلا خادمٍ **هو الحالة وحدها**، ويُقال ذلك صراحةً.
    const guides = Object.entries(INTEGRATION_GUIDE);
    container.append(
      el('div', { class: 'notice notice-prose' },
        el('strong', { text: 'لم تُقرأ الحالة ' }),
        '— اضغط «تحديث الحالة» بعد الدخول على الموقع المنشور.'),
      el('div', { class: 'today-grid' }, guides.map(([key, g]) => el('section', { class: 'panel today-panel' },
        el('div', { class: 'today-head' },
          el('h2', {}, g.label || key, badge('الحالة غير معروفة', 'badge-outline'))),
        g.what ? el('p', { text: g.what }) : null,
        (g.envs || []).length
          ? el('p', { class: 'field-hint' }, 'يحتاج: ', el('span', { class: 'ltr', text: (g.envs || []).join(' · ') }))
          : el('p', { class: 'field-hint ok', text: 'لا يحتاج مفتاحًا.' })))));
    return;
  }

  const ready = rows.filter((r) => r.configured).length;
  container.append(
    el('div', { class: 'notice notice-prose' },
      el('strong', { text: `${ready} من ${rows.length} جاهزة. ` }),
      'وما ليس جاهزًا يقول ما ينقصه بالضبط.',
      disclosure('أين تُكتب المفاتيح؟',
        el('p', {}, 'في Netlify ← Site configuration ← Environment variables — فلا تدخل بياناتك ولا نسخك، ولا يعرض تكاملٌ ناقصٌ بياناتٍ وهمية.'))),
    el('div', { class: 'today-grid' }, rows.map((row) => card(row, container))));
}

function card(row, container) {
  const g = row.guide || {};
  const body = el('div');

  if (g.what) body.append(el('p', { text: g.what }));
  if (g.reality) {
    body.append(el('details', { class: 'playbook-box' },
      el('summary', { text: 'ما يجب أن تعرفه قبل أن تعتمد عليه' }),
      el('p', { class: 'small', text: g.reality })));
  }

  if (row.configured) {
    body.append(el('p', { class: 'field-hint ok', text: 'كل المتغيّرات موجودة — التكامل جاهز للاستعمال من صفحاته.' }));
  } else {
    body.append(
      el('h4', { class: 'evidence-title', text: 'الخطوات' }),
      el('ol', { class: 'steps-list' }, (g.steps || []).map((step) => el('li', { text: step }))),
      el('p', { class: 'field-hint', text: `الناقص الآن: ${row.missing.join('، ')}` }));
  }

  // زرّ فحصٍ حقيقي: يستدعي الخادم فعلًا ويقول ما ردّ — لا يدّعي.
  const probe = el('button', {
    type: 'button', class: 'btn btn-sm', text: 'افحص الآن',
    onClick: async () => {
      probe.disabled = true;
      const action = (row.actions || [])[0];
      const res = await runIntegration(row.key, action, {});
      toast(res.ok ? `${g.label || row.key}: يردّ ويعمل` : explain(res, row.key), res.ok ? 'success' : 'error', 7000);
      probe.disabled = false;
    },
  });

  return el('section', { class: 'panel today-panel' },
    el('div', { class: 'today-head' },
      el('h2', {}, g.label || row.label,
        row.configured ? badge('جاهز', 'badge-ok')
          : g.freeNow ? badge('يعمل جزئيًّا بلا اشتراك', 'badge-help')
            : badge('ينتظر مفتاحًا', 'badge-warn')),
      probe),
    body);
}
