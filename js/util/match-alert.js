// تنبيه «هذا العقار يطابق طلبات قائمة» (المرحلة ١٠).
//
// المحرك نفسه بلا تعديل (`matching.js`): بعد حفظ عقار أو اعتماد التقاط ميداني، يُسأل المحرك
// عن الطلبات النشطة التي يطابقها هذا العقار تحديدًا، فيُعرض عليك فورًا بدل أن تكتشفه لاحقًا
// حين تفتح صفحة المطابقات. لا يُنشئ سجل مطابقة ولا يغيّر حالة شيء — إشعار وروابط فقط
// (التخزين الكسول للمطابقات كما هو منذ المرحلة ٣).

import { loadMatchingContext, scoreOne } from '../data/matching.js';
import { getMatchingSettings, getLists, getCompany, getTemplates } from '../data/settings.js';
import { getCurrentUser } from '../data/repository.js';
import { el, openModal, toast, selectEl } from './dom.js';
import { formatPhone } from '../util/phone.js';
import { renderTemplate, templateValues } from './templates.js';
import { whatsappButton } from './outreach.js';
import { countOf } from './format.js';

/**
 * يحسب الطلبات النشطة التي يطابقها العقار، مرتّبة بالنسبة تنازليًا.
 * @returns {Promise<Array<{ request, client, score }>>}
 */
export async function requestsMatching(property, { minScore = null } = {}) {
  if (!property || property.captureStatus !== 'approved') return [];
  const [ctx, settings] = await Promise.all([loadMatchingContext({ withMatches: false }), getMatchingSettings()]);
  const floor = minScore == null ? settings.minScore : minScore;
  const clientsById = new Map(ctx.clients.map((c) => [c.id, c]));
  const out = [];
  for (const request of ctx.requests) {
    if (request.status !== 'active') continue;
    const result = scoreOne(request, property, ctx);
    if (!result.ok || result.score < floor) continue;
    out.push({ request, client: clientsById.get(request.clientId) || null, score: result.score });
  }
  return out.sort((a, b) => b.score - a.score);
}

/**
 * يعرض النتيجة، **ومعها زر واتساب جاهز لكل عميل** (المرحلة ١٣): الرسالة من قوالبك معبّأة
 * ببيانات هذا العقار وهذا العميل، فتتحوّل المعلومة إلى فعل بنقرة.
 * ملاحظة صريحة: واتساب لا يسمح بإرسال جماعي حقيقي — فهي نقرة لكل عميل، وهذا حدّ المنصة.
 * وصمت تام إن لم توجد مطابقة (لا إزعاج بلا فائدة).
 */
export async function announceMatches(property, { title = 'هذا العقار يطابق طلبات قائمة' } = {}) {
  let matches = [];
  try {
    matches = await requestsMatching(property);
  } catch (err) {
    console.warn('تعذر فحص المطابقات بعد الحفظ', err);
    return [];
  }
  if (!matches.length) return [];

  const [lists, company, templates] = await Promise.all([getLists(), getCompany(), getTemplates()]);
  const user = getCurrentUser();
  const link = `${location.origin}${location.pathname}#/properties/${property.id}`;
  let template = templates[0];
  const templateSelect = selectEl({
    options: templates.map((t, i) => ({ value: String(i), label: t.label })), value: '0',
    onChange: (e) => { template = templates[Number(e.target.value)] || templates[0]; draw(); },
  });

  const list = el('div', { class: 'match-alert-list' });
  const draw = () => {
    list.replaceChildren(...matches.slice(0, 12).map(({ request, client, score }) => {
      const text = renderTemplate(template?.body || '', templateValues({ client, property, lists, user, company, link }));
      return el('div', { class: 'match-alert-row' },
        el('span', { class: 'match-alert-score', text: `${score}٪` }),
        el('span', { class: 'match-alert-name' },
          el('strong', { text: client?.name || (client?.phone ? formatPhone(client.phone) : 'عميل بلا اسم') }),
          el('span', { class: 'muted small', text: client?.phone ? ` · ${formatPhone(client.phone)}` : ' · بلا جوال' })),
        el('span', { class: 'row' },
          // «أرسل» يسجّل ما فتحه (المرحلة ٤٧): تُرسل لعشرة عملاء من هذه اللوحة، ولا
          // يبقى منها أثرٌ في سجلّ أيٍّ منهم — فيُعاد الاتصال بهم غدًا.
          client?.phone ? whatsappButton(el, {
            clientId: client.id, phone: client.phone, text,
            label: '💬 أرسل', cls: 'btn btn-primary btn-sm',
            note: 'أُرسل له عرضٌ مطابقٌ من لوحة المطابقات',
          }) : null,
          el('a', { class: 'btn btn-ghost btn-sm', href: `#/matches/${request.id}`, text: 'الطلب', onClick: () => modal.close() })));
    }));
  };
  draw();

  const modal = openModal({
    title,
    size: 'wide',
    body: el('div', {},
      el('p', { class: 'muted small', text: `${countOf(matches.length, 'طلب نشط')} يطابق هذا العقار. أرسل لكل عميل رسالة جاهزة من قوالبك، أو افتح طلبه.` }),
      el('div', { class: 'row' }, el('span', { class: 'field-label', text: 'القالب' }), templateSelect),
      list,
      matches.length > 12 ? el('p', { class: 'muted small', text: `و${matches.length - 12} طلبًا آخر — افتح صفحة المطابقات لبقيتهم.` }) : null),
    footer: [el('button', { type: 'button', class: 'btn btn-primary', text: 'حسنًا', onClick: () => modal.close() })],
  });
  toast(`${countOf(matches.length, 'طلب نشط')} يطابق هذا العقار`, 'success', 4000);
  return matches;
}
