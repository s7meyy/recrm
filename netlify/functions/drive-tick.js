// نسخ درايف اليومي (المرحلة ٥٦): يعمل والتطبيق مغلق، والمنطق في `lib/drive.js`.
//
// ينسخ أحدث دفعةٍ كاملة في الخزنة؛ فإن كانت هي نفسها ما نُسخ أمس لم يُكرّرها — ملفّان
// متطابقان في درايف لا يحميان شيئًا زائدًا. والدفعةُ الجديدة تصل الخزنة حين يفتح جهازٌ
// التطبيق و«ارفع نسخة تلقائيًا» مفعّل، أو بعد كل تغيير إن كانت المزامنة مفعّلة.

import { getStore } from '@netlify/blobs';
import { runDriveBackup } from '../lib/drive.js';

export default async () => {
  const store = getStore({ name: 'kassab-vault', consistency: 'strong' });
  const result = await runDriveBackup({ store });
  if (!result.ok && !result.notConfigured) console.warn('تعذّر نسخ درايف', result.error);
  return new Response(JSON.stringify(result), { headers: { 'content-type': 'application/json; charset=utf-8' } });
};

// الساعة ٢٣:٠٠ بتوقيت غرينتش = الثانية فجرًا بتوقيت الرياض، بعد يوم العمل. استدعاءٌ واحد يوميًا.
export const config = { schedule: '0 23 * * *' };
