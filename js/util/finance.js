// حاسبة التمويل العقاري (المرحلة ٢٠): «كم القسط؟» سؤال كل مشترٍ.
//
// **استرشادية لا عرض تمويل:** النِّسب تختلف بين البنوك وبحسب ملف العميل، ولا تدخل هنا رسوم
// إدارية ولا تأمين ولا دعم سكني ولا ضريبة. الحساب هو معادلة القسط الثابت المعروفة، لا أكثر.
//
// دوال خالصة؛ لا تلمس التخزين ولا الشبكة.

/**
 * القسط الشهري الثابت.
 * @param {{ price, downPayment?, annualRate?, years? }} input
 *   `annualRate` نسبة مئوية سنوية (٥ = ٥٪). صفرًا = تقسيط بلا هامش.
 * @returns {{ principal, monthly, months, total, cost } | null}
 */
export function monthlyInstallment({ price, downPayment = 0, annualRate = 5, years = 20 } = {}) {
  const p = Number(price);
  const down = Math.max(0, Number(downPayment) || 0);
  const months = Math.round((Number(years) || 0) * 12);
  if (!Number.isFinite(p) || p <= 0 || months <= 0 || down >= p) return null;

  const principal = p - down;
  const r = (Number(annualRate) || 0) / 100 / 12;
  // بلا هامش: قسمة بسيطة — والمعادلة العامة تقسم على صفر عندها.
  const monthly = r === 0 ? principal / months : (principal * r) / (1 - (1 + r) ** -months);
  const total = monthly * months;
  return { principal, monthly, months, total, cost: total - principal };
}

/**
 * أقصى سعر يحتمله دخلٌ شهري، بنسبة استقطاع محددة.
 * يقلب المعادلة: من القسط المحتمَل إلى أصل التمويل، ثم يُضاف إليه الدفعة الأولى.
 */
export function affordablePrice({ monthlyIncome, ratio = 33, downPayment = 0, annualRate = 5, years = 20 } = {}) {
  const income = Number(monthlyIncome);
  const months = Math.round((Number(years) || 0) * 12);
  if (!Number.isFinite(income) || income <= 0 || months <= 0) return null;
  const capacity = income * (Math.min(Math.max(Number(ratio) || 0, 1), 100) / 100);
  const r = (Number(annualRate) || 0) / 100 / 12;
  const principal = r === 0 ? capacity * months : (capacity * (1 - (1 + r) ** -months)) / r;
  return { capacity, principal, price: principal + Math.max(0, Number(downPayment) || 0) };
}
