// اختبار وحدة (المرحلة ١٨): قراءة CSV، وترتيب الجولة، ورابط خرائط جوجل.
import { parseCsv, suggestMapping, rowToRecord, CSV_IMPORTS } from '../js/data/exchange.js';
import { orderRoute, routeLength, googleMapsRoute, MAX_STOPS } from '../js/util/route.js';

const ok = (n, c, x = '') => console.log(`${c ? 'PASS' : 'FAIL'} — ${n}${x ? ' :: ' + x : ''}`);

/* ===== ١) قراءة CSV ===== */
const csv = '﻿الاسم,الجوال,ملاحظات\nمحمد العتيبي,0501234567,"عميل جادّ, يبحث في النرجس"\nمنى العنزي,٠٥٠٧٦٥٤٣٢١,\n';
const p = parseCsv(csv);
ok('شارة BOM لا تلوّث أول عنوان', p.headers[0] === 'الاسم', JSON.stringify(p.headers[0]));
ok('الصفوف تُقرأ بعدد صحيح', p.rows.length === 2, String(p.rows.length));
ok('الفاصلة داخل اقتباس لا تكسر الخلية', p.rows[0]['ملاحظات'].includes('جادّ, يبحث'), p.rows[0]['ملاحظات']);

const semi = parseCsv('المدينة;الحي;السعر\nالرياض;النرجس;1,250,000\n');
ok('الفاصلة المنقوطة تُكتشف تلقائيًا', semi.headers.length === 3 && semi.rows[0]['السعر'] === '1,250,000', JSON.stringify(semi.rows[0]));

const quoted = parseCsv('a,b\n"سطر\nداخل خلية",2\n');
ok('سطر جديد داخل اقتباس يبقى في خليته', quoted.rows.length === 1 && quoted.rows[0].a.includes('\n'), JSON.stringify(quoted.rows[0]));
const esc = parseCsv('a\n"قال ""أهلًا"""\n');
ok('الاقتباس المزدوج يُفكّ', esc.rows[0].a === 'قال "أهلًا"', esc.rows[0].a);
ok('ملف فارغ لا يرمي خطأ', parseCsv('').rows.length === 0 && parseCsv('   ').headers.length === 0);
ok('السطر الفارغ يُسقط', parseCsv('a,b\n1,2\n\n3,4\n').rows.length === 2);
ok('العمود بلا عنوان يُسمّى', parseCsv('a,,c\n1,2,3\n').headers[1] === 'عمود 2');

/* ===== ٢) الربط والتحويل ===== */
const mapping = suggestMapping('clients', p.headers);
ok('الربط يُقترح بمطابقة العناوين', mapping.name === 'الاسم' && mapping.phone === 'الجوال', JSON.stringify(mapping));
ok('العنوان الإنجليزي يُعرف أيضًا', suggestMapping('clients', ['name', 'phone']).phone === 'phone');
const rec = rowToRecord('clients', p.rows[1], mapping);
ok('الأرقام العربية في الجوال تُطبَّع', rec.phone === '0507654321', rec.phone);

const propMapping = suggestMapping('properties', semi.headers);
const lists = { propertyTypes: [{ key: 'villa', label: 'فلة' }] };
const propRec = rowToRecord('properties', semi.rows[0], propMapping, { lists });
ok('فواصل الآلاف لا تفسد السعر', propRec.price === 1250000, String(propRec.price));
const typed = rowToRecord('properties', { 'النوع': 'فلة', 'الغرض': 'بيع، إيجار', 'المدينة': 'الرياض' },
  { type: 'النوع', purposes: 'الغرض', city: 'المدينة' }, { lists });
ok('النوع يُترجم من اسمه العربي إلى مفتاحه', typed.type === 'villa', typed.type);
ok('الأغراض تُفصل وتُترجم', JSON.stringify(typed.purposes) === '["sale","rent"]', JSON.stringify(typed.purposes));
ok('نوع غير معروف يُترك فارغًا لا يُخترع', rowToRecord('properties', { 'النوع': 'قصر فخم' }, { type: 'النوع' }, { lists }).type === '');
ok('الحقل غير المربوط لا يُكتب', rowToRecord('clients', p.rows[0], { name: 'الاسم' }).phone === undefined);

/* شرط الحد الأدنى وكشف التكرار */
const cdef = CSV_IMPORTS.clients;
ok('العميل بلا اسم ولا جوال مرفوض', !cdef.required({ notes: 'شيء' }));
ok('العميل بجوال وحده مقبول', cdef.required({ phone: '0500000000' }));
ok('التكرار بالجوال يُكتشف', cdef.dedupe({ phone: '0501234567' }, [{ phone: '٠٥٠١٢٣٤٥٦٧' }]));
// بلا جوال يُقارَن الاسم: إعادة استيراد الملف نفسه كانت تكرّر كل عميل بلا جوال.
ok('بلا جوال يُكتشف التكرار بالاسم', cdef.dedupe({ name: 'أ' }, [{ name: 'أ' }]));
ok('واسمٌ مطابق لعميل له جوال ليس تكرارًا', !cdef.dedupe({ name: 'أ' }, [{ name: 'أ', phone: '0500000000' }]));
ok('واسم مختلف ليس تكرارًا', !cdef.dedupe({ name: 'ب' }, [{ name: 'أ' }]));

/* ===== ٣) ترتيب الجولة ===== */
const stops = [
  { id: 'بعيد', lat: 24.80, lng: 46.60 },
  { id: 'قريب', lat: 24.71, lng: 46.71 },
  { id: 'وسط', lat: 24.75, lng: 46.65 },
];
const start = { lat: 24.705, lng: 46.715 };
const ordered = orderRoute(stops, start);
ok('الأقرب أولًا من نقطة البداية', ordered[0].id === 'قريب', ordered.map((s) => s.id).join('→'));
ok('كل المحطات تدخل الترتيب', ordered.length === 3);
ok('بلا نقطة بداية تكون أولى المحطات هي البداية', orderRoute(stops, null)[0].id === 'بعيد');
ok('الإحداثي الناقص يُسقط لا يُكسر', orderRoute([...stops, { id: 'بلا' }], start).length === 3);
ok('طول المسار موجب', routeLength(ordered, start) > 0);

/* ===== ٤) رابط خرائط جوجل ===== */
const link = googleMapsRoute(ordered, start);
ok('الرابط يحمل البداية والنهاية', link.url.includes('origin=24.705') && link.url.includes('destination=24.800'), link.url.slice(0, 90));
ok('المحطات الوسطى تُمرَّر waypoints', decodeURIComponent(link.url).includes('waypoints='));
ok('لا رابط بمحطة واحدة', googleMapsRoute([stops[0]], null).url === null);
const many = Array.from({ length: 14 }, (_, i) => ({ id: i, lat: 24.7 + i * 0.01, lng: 46.6 }));
const capped = googleMapsRoute(orderRoute(many, null), null);
ok('الحدّ الأقصى يُحترم ويُصرَّح بالساقط', capped.used === MAX_STOPS && capped.dropped === 4, `${capped.used}/${capped.dropped}`);
