// المرحلة ٣٨ — واتساب: استخراج الرسائل من بنية Meta، وتطبيع الأرقام.
import { extractMessages } from '../netlify/functions/whatsapp.js';
const ok = (n, c, x = '') => console.log(`${c ? 'PASS' : 'FAIL'} — ${n}${x ? ' :: ' + x : ''}`);

const payload = {
  entry: [{
    changes: [{
      value: {
        contacts: [{ wa_id: '966551234567', profile: { name: 'سعد التميمي' } }],
        messages: [
          { id: 'wamid.A', from: '966551234567', timestamp: '1789000000', type: 'text', text: { body: 'السلام عليكم، العقار موجود؟' } },
          { id: 'wamid.B', from: '966551234567', timestamp: '1789000060', type: 'image', image: { id: 'media-1' } },
        ],
      },
    }],
  }],
};
const rows = extractMessages(payload);
ok('تُستخرج الرسالتان', rows.length === 2, String(rows.length));
ok('الرقم يصير محلّيًّا كما يخزّنه التطبيق (يطابق العملاء بلا ترجمة)', rows[0].from === '0551234567', rows[0].from);
ok('اسم المرسِل يُقرأ من contacts', rows[0].name === 'سعد التميمي', rows[0].name);
ok('النصّ يُحفظ كما هو', rows[0].text.includes('العقار موجود'), rows[0].text);
ok('الوقت يصير ISO لا ثوانيَ خامًا', rows[0].at.startsWith('20') && rows[0].at.includes('T'), rows[0].at);
ok('الصورة تُحفظ بمعرّفها لا تُنزَّل', rows[1].mediaId === 'media-1' && rows[1].text === '', JSON.stringify(rows[1]));

/* ما ليس رسالةً لا يُحفظ رسالةً */
const statuses = { entry: [{ changes: [{ value: { statuses: [{ id: 'x', status: 'delivered' }] } }] }] };
ok('إشعارات التسليم لا تُحسب رسائل', extractMessages(statuses).length === 0);
ok('وجسمٌ فارغ أو فاسد لا ينفجر', extractMessages({}).length === 0 && extractMessages(null).length === 0 && extractMessages({ entry: null }).length === 0);

/* الحدود: لا نصٌّ بلا سقف، ولا محارف تحكّم */
const long = { entry: [{ changes: [{ value: { messages: [{ id: 'l', from: '966500000000', type: 'text', text: { body: 'ا'.repeat(5000) } }] } }] }] };
ok('النصّ الطويل يُقصّ عند حدٍّ معلوم', extractMessages(long)[0].text.length === 2000, String(extractMessages(long)[0].text.length));
const CTRL = String.fromCharCode(0) + String.fromCharCode(7);
const ctrl = { entry: [{ changes: [{ value: { messages: [{ id: 'c', from: '966500000000', type: 'text', text: { body: `سطر${CTRL}آخر` } }] } }] }] };
ok('ومحارف التحكّم تُنظَّف', !new RegExp(`[${CTRL}]`).test(extractMessages(ctrl)[0].text), JSON.stringify(extractMessages(ctrl)[0].text));

/* أرقام بصيغٍ مختلفة */
const forms = (from) => extractMessages({ entry: [{ changes: [{ value: { messages: [{ id: 'x', from, type: 'text', text: { body: 'x' } }] } }] }] })[0].from;
ok('966… ← 0…', forms('966551112233') === '0551112233');
ok('0… يبقى', forms('0551112233') === '0551112233');
ok('ورقمٌ بلا مقدّمة يُسبَق بصفر', forms('551112233') === '0551112233', forms('551112233'));
