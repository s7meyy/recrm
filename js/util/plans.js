// تشغيل خطط المتابعة (المرحلة ٢٣): من خطة مكتوبة إلى مهام بمواعيدها.
//
// الخطة تصف «ماذا أفعل ومتى» مرة واحدة، فتُنشأ مهامها عند الحدث بدل أن تتذكّر أنت.
// وهذا ما تسمّيه الأنظمة العالمية Smart Plans / Drip — ومحرك المهام عندك يكفيه.
//
// **قاعدتان تمنعان الإغراق:** لا تُشغَّل خطة غير مفعَّلة، ولا تُشغَّل الخطة نفسها مرتين
// على السجل نفسه (يُبحث عن مهمة تحمل وسم الخطة قبل الإنشاء).

import { repo } from '../data/repository.js';
import { getPlans } from '../data/settings.js';

const DAY = 86400000;

/** وسم يربط المهمة بخطتها وسجلّها — مخزَّن في الملاحظات لأن المهمة بلا حقل وسوم. */
export const planTag = (planId, linkId) => `[خطة:${planId}:${linkId}]`;

/**
 * مهام خطة واحدة كما ستُنشأ — دالة خالصة تُختبر وحدها.
 * الخطوة في اليوم صفر تُجدول **بعد ساعة** لا الآن: مهمة تظهر مستحقّة لحظة إنشائها ضجيج.
 */
export function planTasks(plan, { title = '', linkType = null, linkId = null, from = Date.now() } = {}) {
  return (plan.steps || []).map((step) => {
    const at = new Date(from + step.day * DAY);
    if (step.day === 0) at.setTime(from + 3600000);
    else at.setHours(10, 0, 0, 0); // عاشرة الصباح: موعدٌ يُتصل فيه
    return {
      title: `${step.title}${title ? ` — ${title}` : ''}`,
      notes: planTag(plan.id, linkId || ''),
      dueAt: at.toISOString(),
      linkType,
      linkId,
      stepType: step.type,
    };
  });
}

/** أول قائمة مهام، أو قائمة «متابعات» تُنشأ عند الحاجة. */
async function targetList() {
  const lists = (await repo.taskLists.list()).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  return lists[0] || repo.taskLists.create({ title: 'متابعات', order: 0 });
}

/**
 * يشغّل كل خطة مفعَّلة لهذا الحدث.
 * @returns {Promise<{ created: number, plans: string[] }>}
 */
export async function runPlans(trigger, { title = '', linkType = null, linkId = null } = {}) {
  const plans = (await getPlans()).filter((p) => p.enabled && p.trigger === trigger);
  if (!plans.length) return { created: 0, plans: [] };

  const existing = await repo.tasks.list();
  const list = await targetList();
  let created = 0;
  const ran = [];

  for (const plan of plans) {
    const tag = planTag(plan.id, linkId || '');
    if (existing.some((t) => String(t.notes || '').includes(tag))) continue; // لا تكرار
    for (const task of planTasks(plan, { title, linkType, linkId })) {
      await repo.tasks.create({
        listId: list.id, title: task.title, notes: task.notes, dueAt: task.dueAt,
        linkType: task.linkType, linkId: task.linkId,
      });
      created++;
    }
    ran.push(plan.name);
  }
  return { created, plans: ran };
}
