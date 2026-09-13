// تنبيه «هذا العقار يطابق طلبات قائمة» (المرحلة ١٠).
//
// المحرك نفسه بلا تعديل (`matching.js`): بعد حفظ عقار أو اعتماد التقاط ميداني، يُسأل المحرك
// عن الطلبات النشطة التي يطابقها هذا العقار تحديدًا، فيُعرض عليك فورًا بدل أن تكتشفه لاحقًا
// حين تفتح صفحة المطابقات. لا يُنشئ سجل مطابقة ولا يغيّر حالة شيء — إشعار وروابط فقط
// (التخزين الكسول للمطابقات كما هو منذ المرحلة ٣).

import { loadMatchingContext, scoreOne } from '../data/matching.js';
import { getMatchingSettings } from '../data/settings.js';
import { el, openModal, toast } from './dom.js';
import { formatPhone } from '../util/phone.js';

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

/** يعرض النتيجة: نافذة إن وُجدت مطابقات، وصمت تام إن لم توجد (لا إزعاج بلا فائدة). */
export async function announceMatches(property, { title = 'هذا العقار يطابق طلبات قائمة' } = {}) {
  let matches = [];
  try {
    matches = await requestsMatching(property);
  } catch (err) {
    console.warn('تعذر فحص المطابقات بعد الحفظ', err);
    return [];
  }
  if (!matches.length) return [];

  const rows = matches.slice(0, 8).map(({ request, client, score }) => el('a', {
    class: 'match-alert-row', href: `#/matches/${request.id}`,
    onClick: () => modal.close(),
  },
  el('span', { class: 'match-alert-score', text: `${score}٪` }),
  el('span', {},
    el('strong', { text: client?.name || (client?.phone ? formatPhone(client.phone) : 'عميل بلا اسم') }),
    el('span', { class: 'muted small', text: client?.phone ? ` · ${formatPhone(client.phone)}` : '' }))));

  const modal = openModal({
    title,
    body: el('div', {},
      el('p', { class: 'muted small', text: `${matches.length} طلب نشط يطابق هذا العقار. اضغط أي طلب لفتح مطابقاته.` }),
      el('div', { class: 'match-alert-list' }, rows),
      matches.length > rows.length ? el('p', { class: 'muted small', text: `و${matches.length - rows.length} طلبًا آخر.` }) : null),
    footer: [el('button', { type: 'button', class: 'btn btn-primary', text: 'حسنًا', onClick: () => modal.close() })],
  });
  toast(`${matches.length} طلب نشط يطابق هذا العقار`, 'success', 4000);
  return matches;
}
