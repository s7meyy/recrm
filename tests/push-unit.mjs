// اختبار وحدة لاختيار التذكيرات المستحقة (قاعدة الإرسال نفسها التي تستعملها الدالة المجدولة)
const { selectDue } = await import('../netlify/functions/push-tick.js');
const ok = (n, c, x = '') => console.log(`${c ? 'PASS' : 'FAIL'} — ${n}${x ? ' :: ' + x : ''}`);
const now = Date.parse('2026-09-13T12:00:00.000Z');
const iso = (h) => new Date(now + h * 3600000).toISOString();

const rec = { reminders: [
  { id: 'due', dueAt: iso(-0.5) },
  { id: 'exactly-now', dueAt: iso(0) },
  { id: 'future', dueAt: iso(2) },
  { id: 'ancient', dueAt: iso(-30) },
  { id: 'already', dueAt: iso(-1) },
  { id: 'broken', dueAt: 'ليس تاريخًا' },
], sent: ['already'] };

const ids = selectDue(rec, now).map((r) => r.id);
ok('المستحق الآن يُرسل', ids.includes('due') && ids.includes('exactly-now'), ids.join(','));
ok('المستقبلي لا يُرسل', !ids.includes('future'));
ok('ما فات بأكثر من يوم لا يُرسل (تنبيه متأخر لا ينفع)', !ids.includes('ancient'));
ok('المُرسَل سابقًا لا يتكرر', !ids.includes('already'));
ok('التاريخ التالف يُتجاهل بلا خطأ', !ids.includes('broken'));
ok('لا شيء يُرسل لاشتراك بلا تذكيرات', selectDue({ reminders: [], sent: [] }, now).length === 0);
