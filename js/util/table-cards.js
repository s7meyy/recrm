// الجداولُ على الجوّال (المرحلة ٤٨).
//
// `.table` عرضُها الأدنى ٩٠٠ بكسل، وشاشةُ الجوّال ٣٩٠. فالجدولُ يُسحب سحبًا، **ويُرى منه
// خمسةُ أعمدةٍ من عشرة** وينقطع في منتصف خليّة. جُرّب على ٣٩٠ بكسلًا في «إدارة الأملاك».
//
// **والترتيبُ يضاعف العطب**: الأعمدةُ التي تحتاجها — المتأخّر، والصيانة، والأزرار — هي
// آخرُها، أي أبعدُها عن أوّل ما تراه. وأنت تفتح النظام في السيارة لا على المكتب.
//
// **والعلاجُ ليس تعديلَ ثلاثين موضعًا** يُبنى فيها جدول: كلُّ خليّةٍ تحتاج عنوانَ عمودها
// إلى جانبها لتُقرأ وحدها. فيُنسخ العنوانُ من `<thead>` إلى `data-label` في كلّ خليّة،
// ثمّ تتكفّل ورقةُ الأنماط بالباقي. وهذا موضعٌ واحدٌ يلحق كلَّ جدولٍ في النظام —
// الموجودَ اليوم والذي يُضاف غدًا.
//
// **ولا يعمل إلا على الشاشة الضيّقة**: على الشاشة الواسعة الجدولُ جدولٌ كما كان، ولا
// يُنفَق وقتٌ على وسمِ خلايا لا تُقرأ بها. وعلى خمسة آلاف سجلٍّ يكون الوسمُ ثمنًا يُدفع
// بلا مقابل — ولذلك يُسأل الحدُّ أوّلًا.

/** الحدُّ الذي يصير عنده الجدولُ بطاقات — هو نفسُه حدُّ القوالب في ورقة الأنماط. */
export const CARD_WIDTH = '(max-width: 720px)';

/** ينسخ عناوينَ الأعمدة إلى خلايا الصفوف. ويتخطّى ما وُسم أصلًا فلا يُعاد العمل. */
export function stampTable(table) {
  if (!table || table.dataset.carded === '1') return;
  const heads = [...table.querySelectorAll('thead th')].map((th) => th.textContent.trim());
  if (!heads.length) return;
  for (const tr of table.querySelectorAll('tbody tr')) {
    [...tr.children].forEach((td, i) => {
      // عمودٌ بلا عنوان (مربّعُ اختيارٍ أو أزرار) يبقى بلا وسم — وعنوانٌ فارغٌ أسوأ من لا عنوان.
      if (heads[i]) td.setAttribute('data-label', heads[i]);
    });
  }
  table.dataset.carded = '1';
}

/**
 * يراقب الجذرَ فيسِمُ كلَّ جدولٍ يدخله.
 *
 * والمراقبةُ لا الاستدعاءُ عند كل رسم: الصفحاتُ تُعيد رسمَ قوائمها من داخلها (فلترٌ،
 * بحثٌ، ترتيب) بلا مرورٍ بالموجّه — فاستدعاءٌ بعد التنقّل وحده يترك أكثرَ الحالات.
 *
 * **ويُمرَّر `document.body` لا `#page`**: النوافذُ تُرسَم في `#modal-root` **خارج**
 * الصفحة، وفيها جداولُ المقارنة وملخّصِ الضريبة وغيرِها — ولها العطبُ نفسُه على الجوّال.
 */
export function installTableCards(root) {
  if (!root || typeof MutationObserver !== 'function') return () => {};
  const narrow = typeof matchMedia === 'function' ? matchMedia(CARD_WIDTH) : { matches: false };
  const stampAll = () => { if (narrow.matches) root.querySelectorAll('table').forEach(stampTable); };

  const observer = new MutationObserver((records) => {
    if (!narrow.matches) return;
    for (const r of records) {
      for (const node of r.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.matches?.('table')) stampTable(node);
        node.querySelectorAll?.('table').forEach(stampTable);
      }
    }
  });
  observer.observe(root, { childList: true, subtree: true });

  // ودورانُ الجهاز يعبر الحدَّ: ما رُسم عريضًا يُوسَم متى ضاقت الشاشة.
  narrow.addEventListener?.('change', stampAll);
  stampAll();
  return () => { observer.disconnect(); narrow.removeEventListener?.('change', stampAll); };
}
