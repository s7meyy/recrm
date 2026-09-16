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

/**
 * **كم أحتاج نقدًا يوم الإفراغ؟** (المرحلة ٤٥)
 *
 * الحاسبة تقول القسط الشهري وأقصى سعرٍ يحتمله الدخل، **ولا تقول المبلغ النقديّ المطلوب
 * لإتمام الصفقة**. وهو أوّلُ ما يسأل عنه المشتري، وأكثرُ ما تنكسر عنده الصفقة في آخرها:
 * يظنّ الدفعة الأولى وحدها، فإذا جاء يوم الإفراغ وجد فوقها عشراتِ الألوف.
 *
 * وبنوده أربعة:
 *   • **الدفعة الأولى** — نسبة من السعر، من جيبه لا من البنك.
 *   • **رسوم التصرفات العقارية** — ضريبةٌ على التصرّف العقاري، أساسُها ٥٪ من قيمة التصرّف،
 *     ولها إعفاءاتٌ معروفة (منها تملّك المواطن مسكنَه الأول ضمن سقفٍ محدَّد). ولذلك
 *     `rettRate` **قابلةٌ للضبط**، و`rettExempt` تُصفّرها — فمن عرف حالته أدخلها، ومن لم
 *     يعرف لم يُخبَّأ عنه الرقم.
 *   • **العمولة وضريبتها** — عمولة الوساطة، وعليها ضريبة القيمة المضافة (١٥٪ افتراضًا).
 *   • **رسوم البنك الإدارية** — نسبةٌ من مبلغ التمويل، ولها سقفٌ في العادة.
 *
 * **ولا يُخترع رقم:** كل نسبةٍ هنا مُدخَلٌ له قيمةٌ ابتدائية شائعة لا حكمٌ على حالتك،
 * والنتيجة تُعرض بندًا بندًا لا مجموعًا مبهمًا — كي ترى **من أين جاء** كلُّ ريال.
 *
 * @param {{ price, downPaymentRate?, downPayment?, rettRate?, rettExempt?,
 *           commissionRate?, vatRate?, bankFeeRate?, bankFeeCap?, otherFees? }} input
 * @returns {{ price, down, financed, rett, commission, commissionVat, bankFee, other,
 *             cashNeeded, lines } | null}
 */
export function closingCosts({
  price,
  downPaymentRate = 10,
  downPayment = null,
  rettRate = 5,
  rettExempt = false,
  commissionRate = 2.5,
  vatRate = 15,
  bankFeeRate = 1,
  bankFeeCap = 5000,
  otherFees = 0,
} = {}) {
  const p = Number(price);
  if (!Number.isFinite(p) || p <= 0) return null;

  const pct = (v) => Math.max(0, Number(v) || 0) / 100;
  // دفعةٌ بالمبلغ تغلب النسبة: من يعرف رقمه لا يُحسب له غيرُه.
  const down = downPayment != null && downPayment !== ''
    ? Math.min(p, Math.max(0, Number(downPayment) || 0))
    : p * pct(downPaymentRate);
  const financed = Math.max(0, p - down);

  const rett = rettExempt ? 0 : p * pct(rettRate);
  const commission = p * pct(commissionRate);
  const commissionVat = commission * pct(vatRate);
  // السقفُ يُطبَّق حين يكون موجبًا: صفرًا أو فارغًا يعني «لا سقف» لا «لا رسوم».
  const rawBankFee = financed * pct(bankFeeRate);
  const cap = Number(bankFeeCap);
  const bankFee = Number.isFinite(cap) && cap > 0 ? Math.min(rawBankFee, cap) : rawBankFee;
  const other = Math.max(0, Number(otherFees) || 0);

  const cashNeeded = down + rett + commission + commissionVat + bankFee + other;
  return {
    price: p, down, financed, rett, commission, commissionVat, bankFee, other, cashNeeded,
    // البنود مرتَّبةً للعرض: الرقم وحده لا يُقنع، وتفصيلُه يُقنع ويُراجَع.
    lines: [
      { key: 'down', label: 'الدفعة الأولى', amount: down },
      { key: 'rett', label: rettExempt ? 'رسوم التصرفات العقارية (معفاة)' : `رسوم التصرفات العقارية (${Number(rettRate) || 0}٪)`, amount: rett },
      { key: 'commission', label: `عمولة الوساطة (${Number(commissionRate) || 0}٪)`, amount: commission },
      { key: 'vat', label: `ضريبة القيمة المضافة على العمولة (${Number(vatRate) || 0}٪)`, amount: commissionVat },
      { key: 'bank', label: 'رسوم البنك الإدارية', amount: bankFee },
      { key: 'other', label: 'رسومٌ أخرى', amount: other },
    ].filter((l) => l.amount > 0),
  };
}

/**
 * **العائدُ على رأس المال المدفوع** (المرحلة ٤٨) — لا على ثمن العقار كاملًا.
 *
 * في هذا الملفّ دالّتان جارتان لا تلتقيان: `rentalYield` تقسم الدخلَ على **الثمن كاملًا**،
 * و`affordability` تحسب التمويلَ والقسط. **وأكثرُ من يشتري للاستثمار يشتري بتمويل** —
 * فالعائدُ الذي يعنيه على ما خرج من جيبه: الدفعةُ الأولى ورسومُ الإتمام، والقسطُ يُخصم
 * من الإيجار.
 *
 * وهو رقمٌ يختلف عن الأوّل اختلافًا كبيرًا صعودًا أو هبوطًا، **وكلاهما صادقٌ في موضعه**:
 * الأوّلُ يقيس العقار، وهذا يقيس الصفقة.
 *
 * **وحدوده تُقال لا تُخبّأ**: يفترض بقاءَ القسط ثابتًا ومعدّلًا ثابتًا، ولا يحسب إطفاءَ
 * أصل الدين (وهو ثروةٌ تتراكم لا تظهر هنا)، ولا تغيّرَ قيمة العقار، ولا الضريبة.
 *
 * @param {{ price, annualRent, annualCosts?, occupancy?, downPct?, cashCosts?, annualRate?, months? }} o
 * @returns {{ cashIn, loan, annualDebt, netIncome, cashYield, monthlyNet, positive } | null}
 */
export function leveragedYield({
  price, annualRent, annualCosts = 0, occupancy = 100,
  downPct = 20, cashCosts = 0, annualRate = 5.5, months = 240,
} = {}) {
  const base = rentalYield({ price, annualRent, annualCosts, occupancy });
  if (!base) return null;
  const p = Number(price);
  const down = p * (Math.min(100, Math.max(0, Number(downPct) || 0)) / 100);
  const loan = Math.max(0, p - down);
  const cashIn = down + Math.max(0, Number(cashCosts) || 0);
  if (!(cashIn > 0)) return null; // شراءٌ بلا نقدٍ من جيبك لا عائدَ نسبيًّا له — وقسمةٌ على صفر

  const r = (Number(annualRate) || 0) / 100 / 12;
  const n = Math.max(1, Math.round(Number(months) || 0));
  const monthly = loan === 0 ? 0 : (r === 0 ? loan / n : (loan * r) / (1 - (1 + r) ** -n));
  const annualDebt = monthly * 12;
  const netIncome = base.netIncome - annualDebt;

  return {
    cashIn,
    loan,
    monthlyPayment: monthly,
    annualDebt,
    netIncome,
    // **قد يكون سالبًا**، ويُقال سالبًا: عقارٌ قسطُه أكبرُ من إيجاره يأكل من جيبك شهريًّا.
    cashYield: (netIncome / cashIn) * 100,
    monthlyNet: netIncome / 12,
    positive: netIncome > 0,
  };
}
