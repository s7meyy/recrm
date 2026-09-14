// اختبار وحدة (المرحلة ٢٣): خطط المتابعة، ودرجة أولوية العميل، وسرعة الردّ.
import { planTasks, planTag } from '../js/util/plans.js';
import { scoreClient, awaitingReply, SIGNALS } from '../js/util/lead-score.js';

const ok = (n, c, x = '') => console.log(`${c ? 'PASS' : 'FAIL'} — ${n}${x ? ' :: ' + x : ''}`);
const DAY = 86400000;
const now = Date.parse('2026-09-14T08:00:00.000Z');

/* ===== خطط المتابعة ===== */
const plan = {
  id: 'plan_1',
  steps: [
    { day: 0, type: 'call', title: 'اتصال تعارف' },
    { day: 3, type: 'whatsapp', title: 'إرسال عروض' },
  ],
};
const tasks = planTasks(plan, { title: 'محمد', linkType: 'client', linkId: 'c1', from: now });
ok('لكل خطوة مهمة', tasks.length === 2);
ok('عنوان المهمة يحمل اسم العميل', tasks[0].title === 'اتصال تعارف — محمد', tasks[0].title);
ok('خطوة اليوم صفر تُجدول بعد ساعة لا الآن', new Date(tasks[0].dueAt).getTime() === now + 3600000);
ok('الخطوات اللاحقة في العاشرة صباحًا', new Date(tasks[1].dueAt).getHours() === 10, String(new Date(tasks[1].dueAt).getHours()));
ok('وفرقها بالأيام محفوظ', new Date(tasks[1].dueAt).getTime() - now > 2 * DAY);
ok('المهمة موسومة بخطتها وسجلّها', tasks[0].notes === planTag('plan_1', 'c1'), tasks[0].notes);
ok('والربط يُمرَّر كما هو', tasks[1].linkType === 'client' && tasks[1].linkId === 'c1');
ok('خطة بلا خطوات لا تنتج مهامًا', planTasks({ id: 'x', steps: [] }).length === 0);

/* ===== درجة أولوية العميل ===== */
const base = { id: 'c1', name: 'محمد', phone: '0501234567', tags: [], contacts: [], stage: 'new' };
const empty = scoreClient(base, { now });
ok('العميل المكتمل وحده يأخذ درجة الاكتمال', empty.score === 10, String(empty.score));
const hot = scoreClient({ ...base, tags: ['جادّ'], contacts: [{ date: '2026-09-13T00:00:00Z' }] }, {
  requests: [{ status: 'active' }], opens: 2, candidates: 3, lastContactAt: '2026-09-13T00:00:00Z', now,
});
ok('العميل الساخن يتجاوز ٦٠', hot.hot && hot.score >= 60, String(hot.score));
ok('ويُذكر سببه مرتّبًا بالأثر', hot.reasons[0].label.includes('جادّ'), JSON.stringify(hot.reasons[0]));
const noPhone = scoreClient({ ...base, phone: '', name: 'بلا جوال' }, { now });
ok('بلا جوال تُخصم درجة كبيرة', noPhone.score === 0, String(noPhone.score));
const stale = scoreClient({ ...base, contacts: [{ date: '2026-01-01T00:00:00Z' }] }, {
  lastContactAt: '2026-01-01T00:00:00Z', staleDays: 14, now,
});
ok('التأخّر في التواصل يخفض', stale.score < scoreClient({ ...base, contacts: [{ date: '2026-09-13T00:00:00Z' }] }, { lastContactAt: '2026-09-13T00:00:00Z', now }).score);
const closed = scoreClient({ ...base, stage: 'closed', tags: ['جادّ'] }, { opens: 9, now });
ok('الملف المغلق خارج السباق مهما كانت إشاراته', closed.score === 0 && !closed.hot, String(closed.score));
ok('الدرجة لا تتجاوز مئة', scoreClient({ ...base, tags: ['جادّ', 'مهم'] }, { requests: [{ status: 'active' }], opens: 5, candidates: 5, lastContactAt: '2026-09-14T00:00:00Z', now }).score <= 100);
ok('كل إشارة لها وصف مقروء', SIGNALS.every((s) => s.label && Number.isFinite(s.weight)));

/* ===== سرعة الردّ ===== */
const clients = [
  { id: 'a', name: 'انتظر ساعتين', createdAt: new Date(now - 2 * 3600000).toISOString(), contacts: [] },
  { id: 'b', name: 'جديد للتوّ', createdAt: new Date(now - 5 * 60000).toISOString(), contacts: [] },
  { id: 'c', name: 'كُلّم', createdAt: new Date(now - 5 * 3600000).toISOString(), contacts: [{ date: 'x' }] },
  { id: 'd', name: 'قديم جدًا', createdAt: new Date(now - 30 * DAY).toISOString(), contacts: [] },
  { id: 'e', name: 'مغلق', stage: 'closed', createdAt: new Date(now - 3 * 3600000).toISOString(), contacts: [] },
];
const waiting = awaitingReply(clients, { minutes: 60, now });
ok('من تجاوز الحدّ بلا تواصل يظهر', waiting.map((w) => w.client.id).join(',') === 'a', waiting.map((w) => w.client.id).join(','));
ok('والأطول انتظارًا أولًا', waiting[0].waitedMinutes === 120, String(waiting[0]?.waitedMinutes));
ok('الجديد دون الحدّ لا يظهر', !waiting.some((w) => w.client.id === 'b'));
ok('ومن كُلّم لا يظهر', !waiting.some((w) => w.client.id === 'c'));
ok('والقديم جدًا لا يتحول إلى أرشيف ذنوب', !waiting.some((w) => w.client.id === 'd'));
ok('والمغلق مستثنى', !waiting.some((w) => w.client.id === 'e'));
ok('الصفر يعطّل اللوحة كلها', awaitingReply(clients, { minutes: 0, now }).length === 0);
