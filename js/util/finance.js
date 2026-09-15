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

/**
 * عائد الاستثمار العقاري (المرحلة ٣١).
 *
 * «استثمار» غرضٌ في النظام منذ البداية، ولم تكن له أداة. والسؤال الذي يسأله المستثمر
 * ثلاثة أرقام لا أكثر: **كم يعود عليّ سنويًا؟ وبعد المصاريف؟ ومتى أسترد ثمنه؟**
 *
 * **استرشادي كأخيه:** لا يحسب تغيّر قيمة العقار، ولا التمويل، ولا الضريبة، ولا فترات
 * الشغور. وهذه كلها تُقال تحت الحاسبة لا هنا فقط.
 *
 * @param {{ price, annualRent, annualCosts?, occupancy? }} input
 *   `occupancy` نسبة الإشغال المتوقّعة (١٠٠ = مؤجَّر طول السنة).
 * @returns {{ gross, net, netIncome, payback, monthly } | null}
 */
export function rentalYield({ price, annualRent, annualCosts = 0, occupancy = 100 } = {}) {
  const p = Number(price);
  const rent = Number(annualRent);
  const costs = Math.max(0, Number(annualCosts) || 0);
  const occ = Math.min(100, Math.max(0, Number(occupancy) || 0)) / 100;
  if (!Number.isFinite(p) || !Number.isFinite(rent) || p <= 0 || rent <= 0) return null;

  const effectiveRent = rent * occ;
  const netIncome = effectiveRent - costs;
  return {
    gross: (effectiveRent / p) * 100, // العائد الإجمالي ٪
    net: (netIncome / p) * 100, // بعد المصاريف ٪
    netIncome,
    monthly: netIncome / 12,
    // مدّة الاسترداد بالسنوات — بلا دخلٍ موجب لا مدّة، ولا يُكتب رقمٌ لا نهائي.
    payback: netIncome > 0 ? p / netIncome : null,
  };
}
