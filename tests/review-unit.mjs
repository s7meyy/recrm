// المرحلة ٥٧ — عدّاد الصفحة العامة يُجمع بالعربية والإنجليزية.
const { STRINGS } = await import('../offers/i18n.js');
const ok = (n, c, x = '') => console.log(`${c ? 'PASS' : 'FAIL'} — ${n}${x ? ' :: ' + x : ''}`);
const ar = (n) => STRINGS.ar.listings(n, String(n));
ok('١ ← «عرضٌ واحد»', ar(1) === 'عرضٌ واحد', ar(1));
ok('٢ ← «عرضان»', ar(2) === 'عرضان', ar(2));
ok('٤ ← «٤ عروض» لا «٤ عرض»', ar(4) === '4 عروض', ar(4));
ok('١١ ← «١١ عرضًا»', ar(11) === '11 عرضًا', ar(11));
ok('الإنجليزية: 1 listing / 4 listings', STRINGS.en.listings(1, '1') === '1 listing' && STRINGS.en.listings(4, '4') === '4 listings');
