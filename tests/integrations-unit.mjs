// اختبار وحدة (المرحلة ٣٧): التكاملات لا تدّعي ما ليس فيها.
import { INTEGRATIONS, statusAll, missingEnv, runAction, NOT_CONFIGURED } from '../netlify/lib/integrations.js';

const ok = (n, c, x = '') => console.log(`${c ? 'PASS' : 'FAIL'} — ${n}${x ? ' :: ' + x : ''}`);
const KEYS = ['ejar', 'esign', 'payments', 'whatsapp', 'transcribe', 'ocr', 'mailing'];

ok('السبعة كلها مسجَّلة', KEYS.every((k) => INTEGRATIONS[k]), Object.keys(INTEGRATIONS).join(','));
ok('ولكلٍّ متغيّراته وإجراءاته', KEYS.every((k) => INTEGRATIONS[k].env.length && INTEGRATIONS[k].actions.length));
ok('ولكلٍّ اسمٌ عربي', KEYS.every((k) => /[؀-ۿ]/.test(INTEGRATIONS[k].label)));

// بلا متغيّرات بيئة: كلّها غير مُهيَّأة، وكلٌّ يقول ما ينقصه
for (const k of KEYS) delete process.env[`${k}_NOTHING`];
const status = statusAll();
ok('وبلا مفاتيح لا شيء مُهيَّأ', status.every((s) => !s.configured), status.filter((s) => s.configured).map((s) => s.key).join(','));
ok('وكلٌّ يسمّي ما ينقصه', status.every((s) => s.missing.length === s.env.length));
ok('ولا تُذاع قيمةُ سرّ', JSON.stringify(status).includes('KEY') && !JSON.stringify(status).includes('secret-value'));

const res = await runAction('payments', 'link.create', { amount: 100 });
ok('والتنفيذ بلا تهيئة يردّ حالةً معروفة', res.ok === false && res.status === NOT_CONFIGURED, JSON.stringify(res));
ok('ومعها ما ينقص بالضبط', Array.isArray(res.missing) && res.missing.includes('PAYMENTS_API_KEY'), JSON.stringify(res.missing));
ok('ومعها اسمه بالعربية', /[؀-ۿ]/.test(res.label || ''), res.label);

ok('وتكاملٌ مجهول يُرفض', (await runAction('nope', 'x')).status === 'unknown_integration');

// مُهيَّأ لكن بإجراءٍ مجهول
process.env.PAYMENTS_API_BASE = 'https://example.test';
process.env.PAYMENTS_API_KEY = 'k';
process.env.PAYMENTS_CURRENCY = 'SAR';
ok('وبعد التهيئة لا ينقص شيء', missingEnv('payments').length === 0, missingEnv('payments').join(','));
ok('وإجراءٌ مجهول يُرفض', (await runAction('payments', 'nope')).status === 'unknown_action');
ok('ومبلغٌ غير صالح يُرفض قبل الشبكة',
  await runAction('payments', 'link.create', { amount: 0 }).then(() => 'لم يُرفض').catch((e) => e.message) === 'المبلغ غير صالح');

// «إيجار» تعمل بلا شبكة: حزمة عقدٍ جاهزة
process.env.EJAR_API_BASE = 'https://example.test';
process.env.EJAR_API_KEY = 'k';
const draft = await runAction('ejar', 'contract.draft', { tenant: 'فهد' });
ok('وإيجار تعيد مسوّدة العقد', draft.ok === true && draft.draft.tenant === 'فهد', JSON.stringify(draft));

for (const v of ['PAYMENTS_API_BASE', 'PAYMENTS_API_KEY', 'PAYMENTS_CURRENCY', 'EJAR_API_BASE', 'EJAR_API_KEY']) delete process.env[v];
ok('وحذف المتغيّر يعيدها غير مُهيَّأة', missingEnv('payments').length === 3, missingEnv('payments').join(','));
