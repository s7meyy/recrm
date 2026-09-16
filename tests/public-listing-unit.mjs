// المرحلة ٤٨ — ما يخرج إلى الناس: حقائقُ النوع، و«مُدرَجٌ منذ».
import { publicFacts, listedMonths, PUBLIC_FACT_KEYS } from '../js/util/public-listing.js';
import { stampTable, CARD_WIDTH } from '../js/util/table-cards.js';
const ok = (n, c, x = '') => console.log(`${c ? 'PASS' : 'FAIL'} — ${n}${x ? ' :: ' + x : ''}`);

/* الحقائق */
const built = { typeFields: { rooms: 4, baths: 3, floor: 'الثاني', buildingAge: 6, buildingCondition: '' } };
const f = publicFacts(built);
ok('الغرفُ ودوراتُ المياه تخرج — وهي أوّلُ ما يُسأل عنه', f.rooms === 4 && f.baths === 3);
ok('والدورُ وعمرُ البناء', f.floor === 'الثاني' && f.buildingAge === 6);
ok('وما لم يُملأ لا يخرج — فلا «الحالة: —» على إعلانٍ يُقرأ', !('buildingCondition' in f));
ok('وفراغٌ من مسافاتٍ كذلك', !('floor' in publicFacts({ typeFields: { floor: '   ' } })));
ok('والصفرُ قيمةٌ لا فراغ', publicFacts({ typeFields: { rooms: 0 } }).rooms === 0);

const land = { typeFields: { plotDimensions: '20 × 30', streetWidth: 15, facades: 'شمالية', planNumber: '2310', plotNumber: '77' } };
const lf = publicFacts(land);
ok('وأطوالُ القطعة وعرضُ الشارع والواجهات تخرج', lf.plotDimensions === '20 × 30' && lf.streetWidth === 15 && lf.facades === 'شمالية');
ok('**ورقمُ المخطط والقطعة لا يخرجان** — معرّفان يُوصلان إلى الصك لا وصفٌ يُرغِّب',
  !('planNumber' in lf) && !('plotNumber' in lf));
ok('والقائمةُ بيضاءُ صريحة لا «كلُّ ما في الحقول»',
  !PUBLIC_FACT_KEYS.includes('planNumber') && !PUBLIC_FACT_KEYS.includes('plotNumber'));
ok('وحقلٌ غريبٌ أضافه المستخدم لا يتسرّب', !('سرّي' in publicFacts({ typeFields: { 'سرّي': 'لا تنشره' } })));
ok('وعقارٌ بلا حقولٍ لا ينفجر', Object.keys(publicFacts({})).length === 0 && Object.keys(publicFacts()).length === 0);

/* مُدرَجٌ منذ */
const NOW = Date.parse('2026-09-15T00:00:00Z');
const ago = (days) => new Date(NOW - days * 86400000).toISOString();
ok('ثلاثةُ أشهرٍ تُقرأ ثلاثة', listedMonths(ago(92), NOW) === 3, String(listedMonths(ago(92), NOW)));
ok('وأقلُّ من شهرٍ صفر — فيُقال «حديثًا» لا «٠ شهر»', listedMonths(ago(10), NOW) === 0);
ok('وسنةٌ اثنا عشر', listedMonths(ago(365), NOW) === 12, String(listedMonths(ago(365), NOW)));
ok('وبلا تاريخٍ لا يُخمَّن عمر', listedMonths(null, NOW) === null && listedMonths('كلام', NOW) === null);
ok('وتاريخٌ في المستقبل لا يُقرأ عمرًا سالبًا', listedMonths(new Date(NOW + 86400000).toISOString(), NOW) === null);

/* وسمُ الجداول */
ok('حدُّ البطاقة هو حدُّ ورقة الأنماط نفسُه', CARD_WIDTH === '(max-width: 720px)');
ok('وبلا جدولٍ لا ينفجر', (stampTable(null), stampTable(undefined), true));
