// المرحلة ٣٨ — نحو الأوامر الصوتية: يفهم ما يفهم، ويقول «لم أفهم» فيما عداه.
import { parseCommand, describe, ROUTE_WORDS, EXAMPLES } from '../js/util/voice-commands.js';
const ok = (n, c, x = '') => console.log(`${c ? 'PASS' : 'FAIL'} — ${n}${x ? ' :: ' + x : ''}`);
const route = (s) => parseCommand(s)?.route;

/* الفتح بصيغٍ مختلفة كما تُقال فعلًا */
ok('«افتح العقارات»', route('افتح العقارات') === 'properties');
ok('«روح للعملاء» — واللام موصولةٌ بالكلمة', route('روح للعملاء') === 'clients');
ok('«ودني للخريطة»', route('ودني للخريطة') === 'map');
ok('«اذهب إلى الفواتير»', route('اذهب إلى الفواتير') === 'invoices');
ok('«صفحة المهام»', route('صفحة المهام') === 'tasks');
ok('اسم الصفحة وحده يكفي', route('التقويم') === 'calendar');
ok('وبلا «ال»', route('عقارات') === 'properties');
ok('والصفحات الجديدة معروفة', route('إدارة الأملاك') === 'management' && route('ختم الصور') === 'stamp');
ok('«المصاريف» تفتح «المالية» (الاسم القديم ما زال يُنطق)', route('المصاريف') === 'expenses');

/* التشكيل والهمزات والأرقام العربية لا تُربك */
ok('الهمزات المختلفة سواء', route('افتح الإعدادات') === 'settings' && route('افتح الاعدادات') === 'settings');
ok('التشكيل يُتجاهل', route('افتح العَقارات') === 'properties');

/* البحث */
const s1 = parseCommand('ابحث عن سعد التميمي');
ok('«ابحث عن …» يلتقط ما بعده كاملًا', s1?.kind === 'search' && s1.query === 'سعد التميمي', JSON.stringify(s1));
ok('«دور على …» كذلك', parseCommand('دور على فلة')?.query === 'فله', JSON.stringify(parseCommand('دور على فلة')));
ok('والأرقام العربية تصير إنجليزية للبحث', parseCommand('ابحث عن ٠٥٥١٢٣٤٥٦٧')?.query === '0551234567');

/* الإنشاء لا يُخلط بالفتح */
ok('«عقار جديد» إنشاءٌ لا فتح', parseCommand('عقار جديد')?.kind === 'new');
ok('«العقارات» فتحٌ لا إنشاء', parseCommand('العقارات')?.kind === 'route');
ok('«مهمة جديدة»', parseCommand('مهمة جديدة')?.route === 'tasks');
ok('«فاتورة جديدة»', parseCommand('فاتورة جديدة')?.route === 'invoices');

/* أوامر عامّة */
ok('الوضع الليلي', parseCommand('الوضع الليلي')?.theme === 'dark');
ok('الوضع النهاري', parseCommand('الوضع الفاتح')?.theme === 'light');
ok('الرجوع', parseCommand('ارجع')?.kind === 'back');
ok('المساعدة', parseCommand('ماذا أقول')?.kind === 'help');

/* الحدّ الصادق: ما لا يُفهم يُقال لا يُخمَّن */
ok('كلامٌ خارج النحو يعيد null لا تخمينًا', parseCommand('أعطني قهوة') === null);
ok('وجملةٌ طويلة حرّة كذلك', parseCommand('ارفع سعر فلة النرجس عشرة بالمئة') === null);
ok('والفراغ كذلك', parseCommand('') === null && parseCommand('   ') === null && parseCommand(null) === null);
ok('وحرفُ جرٍّ وحده لا يفتح صفحة', parseCommand('ل') === null && parseCommand('ال') === null);

/* الوصف العربي يُعرض قبل التنفيذ */
ok('كلّ أمرٍ مفهومٍ له وصفٌ عربيّ غير فارغ',
  ['افتح العقارات', 'ابحث عن سعد', 'عميل جديد', 'الوضع الليلي', 'ارجع', 'ماذا أقول']
    .every((x) => describe(parseCommand(x)).length > 3));
ok('وغير المفهوم بلا وصف', describe(null) === '');

/* كلُّ صفحةٍ في القائمة لها كلمةٌ تُنطق */
const { SIDEBAR_PAGES } = await import('../js/util/sidebar.js');
const known = new Set(ROUTE_WORDS.map(([k]) => k));
const missing = SIDEBAR_PAGES.map((p) => p.key).filter((k) => !known.has(k));
ok('لا صفحة في القائمة بلا اسمٍ منطوق', missing.length === 0, missing.join('، '));

/* الأمثلة المعروضة تعمل فعلًا — لا تُعرض أمثلةٌ لا يفهمها */
const deadExamples = EXAMPLES.filter((x) => parseCommand(x) === null);
ok('كلُّ مثالٍ معروضٍ في «ماذا أقول؟» مفهومٌ فعلًا', deadExamples.length === 0, deadExamples.join('، '));
