// صحة البيانات (المرحلة ١٧): ما ينقص، ومَن يتضرّر من نقصه.
//
// كل ميزة في التطبيق تقف على حقلٍ ما: التقدير يقف على السعر والمساحة، والمطابقة على النوع
// والمدينة والغرض، والخريطة على الموقع، والاتصال على الجوال. فحين ينقص الحقل لا تُعطَّل
// الميزة بضجيج — بل **تصمت**، فتظن أن لا فرص ولا مطابقات وأنت من حرمها مادّتها.
//
// ولذلك كل بند هنا يقول **ماذا يتعطّل** لا «ناقص» فقط. دوال خالصة، لا تلمس التخزين.

import { matchReadiness } from '../data/matching.js';
import { normalizePhone } from './phone.js';

const isBlank = (v) => !String(v ?? '').trim();
const days = (iso, now) => (iso ? Math.floor((now - new Date(iso).getTime()) / 86400000) : null);

/**
 * @param {{ properties, clients, requests, externals, deals, staleRequestDays? }} input
 * @returns {{ groups: [], totalIssues: number }}
 */
export function healthReport({
  properties = [], clients = [], requests = [], externals = [], deals = [],
  staleRequestDays = 90, typeName = (k) => k || '',
} = {}, now = Date.now()) {
  const approved = properties.filter((p) => p.captureStatus === 'approved');
  const groups = [];
  const add = (key, label, impact, items, href) => {
    if (items.length) groups.push({ key, label, impact, items, href, count: items.length });
  };

  const propLabel = (p) => [p.district || p.city, typeName(p.type)].filter(Boolean).join(' — ') || 'عقار بلا وصف';
  const clientLabel = (c) => c.name || c.phone || 'عميل بلا اسم';

  /* ١) ما يمنع المطابقة أصلًا — أشدّها أثرًا فيُذكر أولًا */
  add('property-unmatched', 'عقارات لا تدخل المطابقة إطلاقًا',
    'ينقصها نوع أو مدينة أو غرض — وهذه قواطع: العقار بلا واحدٍ منها لا يطابق أي طلب مهما بلغ سعره.',
    approved.filter((p) => !matchReadiness(p).ready)
      .map((p) => ({ id: p.id, label: propLabel(p), detail: matchReadiness(p).missing.map((m) => m.label).join('، ') })),
    '#/properties');

  add('external-unready', 'عروض خارجية بانتظار الإكمال',
    'كذلك لا تدخل المطابقة — وهي مخزونك المحتمل من السوق.',
    externals.filter((x) => x.status === 'active' && !matchReadiness(x).ready)
      .map((x) => ({ id: x.id, label: [x.district || x.city, x.platform].filter(Boolean).join(' — ') || 'عرض خارجي', detail: matchReadiness(x).missing.map((m) => m.label).join('، ') })),
    '#/external');

  /* ٢) ما يعطّل التقدير والمقارنة السعرية */
  add('property-no-price', 'عقارات بلا سعر',
    'لا تدخل عيّنة «تقدير السعر»، ولا تطابق طلبًا بميزانية، ولا يُعرف سعر مترها.',
    approved.filter((p) => !(Number(p.price) > 0)).map((p) => ({ id: p.id, label: propLabel(p) })),
    '#/properties');

  add('property-no-area', 'عقارات بلا مساحة',
    'سعر المتر لا يُحسب بلا مساحة، فتخرج من التقدير ومن مقارنة الحي.',
    approved.filter((p) => !(Number(p.area) > 0)).map((p) => ({ id: p.id, label: propLabel(p) })),
    '#/properties');

  /* ٣) ما يعطّل الميدان */
  add('property-no-location', 'عقارات بلا موقع على الخريطة',
    'لا تظهر في خريطة العقارات ولا في تخطيط جولتك.',
    approved.filter((p) => !p.location || !Number.isFinite(Number(p.location.lat)))
      .map((p) => ({ id: p.id, label: propLabel(p) })),
    '#/map');

  /* ٤) ما يعطّل التواصل */
  add('client-no-phone', 'عملاء بلا جوال',
    'لا اتصال ولا واتساب ولا تذكير — وهو أصل العمل كله.',
    clients.filter((c) => isBlank(c.phone) && isBlank(c.phone2)).map((c) => ({ id: c.id, label: clientLabel(c) })),
    '#/clients');

  /* ٥) التكرار: سجلّان لعميل واحد يشتّتان تاريخه ومتابعاته */
  const byPhone = new Map();
  for (const c of clients) {
    const key = normalizePhone(c.phone);
    if (!key) continue;
    if (!byPhone.has(key)) byPhone.set(key, []);
    byPhone.get(key).push(c);
  }
  add('client-duplicate', 'جوالات مكرّرة بين العملاء',
    'سجلّان لشخص واحد: متابعاته وطلباته تنقسم بينهما فتضيع.',
    [...byPhone.entries()].filter(([, list]) => list.length > 1)
      .map(([phone, list]) => ({ id: list[0].id, label: phone, detail: list.map(clientLabel).join(' · ') })),
    '#/clients');

  /* ٦) ما يشوّش المؤشرات: طلب نشط منسيّ */
  add('request-stale', `طلبات نشطة لم تُحدَّث منذ ${staleRequestDays} يومًا`,
    'تُحسب في «الفرص» وفي المطابقات كأنها حيّة — فتطاردك فرصٌ صاحبها اشترى من غيرك.',
    requests.filter((r) => r.status === 'active')
      .map((r) => ({ r, d: days(r.updatedAt || r.createdAt, now) }))
      .filter((x) => x.d != null && x.d >= staleRequestDays)
      .map(({ r, d }) => ({ id: r.id, label: [typeName(r.type), (r.districts || []).join('، ')].filter(Boolean).join(' — ') || 'طلب', detail: `منذ ${d} يومًا` })),
    '#/requests');

  /* ٧) المال: صفقة بلا عمولة مسجَّلة لا تدخل الأرباح ولا الأهداف */
  add('deal-no-commission', 'صفقات بلا عمولة مسجَّلة',
    'لا تدخل صافي الربح ولا شريط الهدف ولا المستحقات — أرباحك تبدو أقلّ مما هي.',
    deals.filter((d) => !(Number(d.commission) > 0))
      .map((d) => ({ id: d.id, label: `صفقة ${d.date ? String(d.date).slice(0, 10) : ''}`.trim() })),
    '#/matches');

  return { groups, totalIssues: groups.reduce((s, g) => s + g.count, 0) };
}
