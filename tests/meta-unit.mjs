// اختبار وحدة (المرحلة ٣٠): تحويل نموذج Meta والتحقّق من توقيعه.
import crypto from 'node:crypto';
import { mapLeadFields, verifySignature, leadgenIds, normalizePhone } from '../netlify/lib/meta.js';

const ok = (n, c, x = '') => console.log(`${c ? 'PASS' : 'FAIL'} — ${n}${x ? ' :: ' + x : ''}`);

/* ===== تحويل الحقول ===== */
const standard = mapLeadFields([
  { name: 'full_name', values: ['فهد العتيبي'] },
  { name: 'phone_number', values: ['+966501234567'] },
  { name: 'email', values: ['f@example.com'] },
]);
ok('الاسم والجوال من الحقول القياسية', standard.name === 'فهد العتيبي' && standard.phone === '0501234567', JSON.stringify(standard));
ok('والبريد يُذكر في الملاحظة لا يُخترع له حقل', standard.note.includes('f@example.com'));

const split = mapLeadFields([
  { name: 'first_name', values: ['سارة'] },
  { name: 'last_name', values: ['القحطاني'] },
  { name: 'phone', values: ['٠٥٥١١١٢٢٢٢'] },
]);
ok('والاسم المجزّأ يُجمع', split.name === 'سارة القحطاني', split.name);
ok('والجوال بالأرقام العربية يُطبَّع', split.phone === '0551112222', split.phone);

const custom = mapLeadFields([
  { name: 'الجوال', values: ['0569998888'] },
  { name: 'كم ميزانيتك؟', values: ['مليون ونص'] },
  { name: 'متى تحب تشتري؟', values: ['خلال شهر'] },
]);
ok('والحقول العربية تُقرأ', custom.phone === '0569998888', custom.phone);
ok('وما لا يُعرف لا يُرمى بل يُضمّ للملاحظة',
  custom.note.includes('كم ميزانيتك؟') && custom.note.includes('مليون ونص'), custom.note);

const empty = mapLeadFields([]);
ok('ونموذج فارغ لا ينفجر', empty.name === '' && empty.phone === '' && empty.note === '');
ok('وجوال غير سعودي يُردّ فارغًا', normalizePhone('+14155551234') === '');

/* ===== التوقيع ===== */
const secret = 'top-secret';
const body = JSON.stringify({ object: 'page', entry: [] });
const good = `sha256=${crypto.createHmac('sha256', secret).update(body, 'utf8').digest('hex')}`;
ok('التوقيع الصحيح يُقبل', verifySignature(body, good, secret) === true);
ok('والتوقيع الخاطئ يُرفض', verifySignature(body, 'sha256=deadbeef', secret) === false);
ok('وجسمٌ مبدَّل يُرفض بالتوقيع نفسه', verifySignature(body + ' ', good, secret) === false);
ok('وبلا سرٍّ مضبوط لا يُقبل شيء', verifySignature(body, good, '') === false);
ok('وبلا ترويسة لا يُقبل شيء', verifySignature(body, null, secret) === false);

/* ===== قراءة المعرّفات ===== */
const payload = {
  object: 'page',
  entry: [{
    changes: [
      { field: 'leadgen', value: { leadgen_id: '111', form_id: '222', created_time: 1757900000 } },
      { field: 'other', value: {} },
    ],
  }],
};
const ids = leadgenIds(payload);
ok('تُقرأ معرّفات النماذج', ids.length === 1 && ids[0].id === '111', JSON.stringify(ids));
ok('والتغييرات الأخرى تُتجاهل', !ids.some((x) => !x.id));
ok('وحمولة فارغة لا تنفجر', leadgenIds({}).length === 0 && leadgenIds(null).length === 0);
