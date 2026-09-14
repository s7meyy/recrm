// اختبار وحدة لتقدير السعر (المرحلة ١٤): دوال خالصة، بلا متصفح.
import { priceSamples, estimatePrice, quantile, purposeKey, buildPriceIndex, comparePrice } from '../js/util/price-stats.js';

const ok = (n, c, x = '') => console.log(`${c ? 'PASS' : 'FAIL'} — ${n}${x ? ' :: ' + x : ''}`);

const prop = (o) => ({ captureStatus: 'approved', city: 'الرياض', type: 'villa', purposes: ['sale'], ...o });

const properties = [
  prop({ id: 'p1', district: 'النرجس', price: 2000000, area: 400 }), // 5000
  prop({ id: 'p2', district: 'النرجس', price: 2200000, area: 400 }), // 5500
  prop({ id: 'p3', district: 'النرجس', price: 2400000, area: 400 }), // 6000
  prop({ id: 'p4', district: 'النرجس', price: 2600000, area: 400 }), // 6500
  prop({ id: 'p5', district: 'النرجس', price: 120000, area: 400, purposes: ['rent'] }), // إيجار: 300
  prop({ id: 'p6', district: 'حطين', price: 3000000, area: 500 }), // 6000
  prop({ id: 'pX', district: 'النرجس', price: 9000000, area: 400, captureStatus: 'captured' }), // غير معتمد
];
const externals = [
  { id: 'x1', status: 'active', city: 'الرياض', district: 'النرجس', type: 'villa', purposes: ['sale'], price: 2800000, area: 400 }, // 7000
  { id: 'x2', status: 'archived', city: 'الرياض', district: 'النرجس', type: 'villa', purposes: ['sale'], price: 400000, area: 400 },
];
const deals = [{ id: 'd1', propertyId: 'p6', finalPrice: 2750000, date: '2026-01-10T00:00:00.000Z' }]; // 5500 في حطين

const samples = priceSamples({ properties, externals, deals });

/* ١) العيّنة: المعتمد فقط، والنشط فقط، والصفقة بسعرها النهائي */
ok('لا يدخل عقار غير معتمد في العيّنة', !samples.some((s) => s.id === 'pX'));
ok('لا يدخل عرض خارجي مؤرشف', !samples.some((s) => s.id === 'x2'));
const dealSample = samples.find((s) => s.source === 'deal');
ok('الصفقة تدخل بسعرها النهائي ومساحة عقارها', dealSample && dealSample.ppm === 5500, String(dealSample?.ppm));

/* ٢) البيع لا يُخلط بالإيجار — وإلا فسد الوسيط تمامًا */
ok('غرض عقار الإيجار يُقرأ rent', purposeKey(properties[4]) === 'rent');
ok('غرض «بيع وإيجار» معًا يُحسب بيعًا', purposeKey({ purposes: ['sale', 'rent'] }) === 'sale');
const rentSamples = samples.filter((s) => s.purpose === 'rent');
ok('عيّنة الإيجار منفصلة بسجل واحد', rentSamples.length === 1 && rentSamples[0].ppm === 300);

/* ٣) التقدير في حي بعيّنة كافية */
const r = estimatePrice({ city: 'الرياض', district: 'النرجس', type: 'villa', purpose: 'sale', area: 400 }, samples);
ok('التقدير نجح وأساسه الحي', r.ok && r.basis === 'district', `${r.basis}`);
ok('العيّنة خمسة (أربعة مخزون + عرض نشط)', r.count === 5, String(r.count));
ok('وسيط المتر ٦٠٠٠', Math.round(r.ppm.median) === 6000, String(r.ppm.median));
ok('التقدير = الوسيط × المساحة', Math.round(r.estimate) === 2400000, String(r.estimate));
ok('النطاق يحيط بالتقدير', r.low < r.estimate && r.estimate < r.high, `${r.low}–${r.high}`);
ok('الإيجار لم يُسحب إلى حساب البيع', r.ppm.low > 1000);
ok('المقارَنات مرتبة بقرب المساحة', r.comparables.length === 5 && r.comparables.every((c) => c.purpose === 'sale'));

/* ٤) التراجع إلى المدينة حين لا تكفي عيّنة الحي — ويُصرَّح به */
const city = estimatePrice({ city: 'الرياض', district: 'حطين', type: 'villa', purpose: 'sale', area: 500 }, samples);
ok('حي بسجلين يتراجع إلى مستوى المدينة', city.ok && city.basis === 'city', `${city.basis}/${city.count}`);
ok('ثقة التراجع إلى المدينة ضعيفة دائمًا', city.confidence === 'low', city.confidence);

/* ٥) الصمت حين تقل العيّنة عن الحد */
const thin = estimatePrice({ city: 'الرياض', district: 'النرجس', type: 'villa', purpose: 'rent', area: 400 }, samples);
ok('لا تقدير بعيّنة واحدة', !thin.ok && thin.reason === 'sample', `${thin.reason}/${thin.count}`);
const noArea = estimatePrice({ city: 'الرياض', district: 'النرجس', type: 'villa', purpose: 'sale', area: 0 }, samples);
ok('لا تقدير بلا مساحة', !noArea.ok && noArea.reason === 'area');

/* ٦) الشرائح المئوية */
ok('الربيع الأول لـ[1,2,3,4,5] = 2', quantile([1, 2, 3, 4, 5], 0.25) === 2);
ok('الشريحة تستوفي خطيًا', quantile([0, 10], 0.5) === 5);
ok('شريحة قائمة فارغة null', quantile([], 0.5) === null);

/* ٧) المؤشر ومقارنة العقار صارا يفصلان الغرض */
const index = buildPriceIndex({ properties, externals, deals });
const saleRow = index.get('الرياض', 'النرجس', 'villa', 'sale');
ok('المؤشر يفصل دلو البيع عن الإيجار', saleRow && saleRow.count === 5, String(saleRow?.count));
ok('دلو الإيجار بسجل واحد لا يظهر (أقل من الحد)', index.get('الرياض', 'النرجس', 'villa', 'rent') === null);
const cmp = comparePrice(prop({ district: 'النرجس', price: 3200000, area: 400 }), index);
ok('عقار أغلى من الوسيط يُوصف بأنه أعلى', cmp.diffPct > 8 && cmp.tone === 'price-high', String(cmp.diffPct));

/* ٨) العقار المقدَّر لا يدخل عيّنته — وإلا صدّق سعرُه نفسَه */
const selfIncluded = estimatePrice({ city: 'الرياض', district: 'النرجس', type: 'villa', purpose: 'sale', area: 400 }, samples);
const selfExcluded = estimatePrice({ city: 'الرياض', district: 'النرجس', type: 'villa', purpose: 'sale', area: 400, excludeId: 'p1' }, samples);
ok('استبعاد العقار نفسه ينقص العيّنة واحدًا', selfExcluded.count === selfIncluded.count - 1, `${selfIncluded.count}→${selfExcluded.count}`);
ok('العقار المستبعَد لا يظهر في المقارَنات', !selfExcluded.comparables.some((c) => c.id === 'p1'));
const dealExcluded = estimatePrice({ city: 'الرياض', district: 'حطين', type: 'villa', purpose: 'sale', area: 500, excludeId: 'p6' }, samples);
ok('استبعاد العقار يستبعد صفقته أيضًا', !dealExcluded.comparables.some((c) => c.propertyId === 'p6'));
