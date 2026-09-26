// استمارة الطلب العامة (المرحلة ٢٥): العميل يكتب طلبه بنفسه، فيصل جاهزًا للمحرك.
//
// الفرق عن «اطلب معاينة»: ذاك يترك رقمًا ونصًّا حرًّا، وهذا **يملأ حقول الطلب نفسها**
// (غرض · نوع · مدينة · حي · ميزانية · مساحة) من قوائمك أنت المنشورة في اللقطة — فلا
// ترجمة ولا تخمين عند التحويل.
//
// صفحة مستقلة كسابقتها: لا تصل إلى IndexedDB ولا إلى شيء من النظام الداخلي.

const form = document.getElementById('intake-form');
const statusNode = document.getElementById('intake-status');
const sendBtn = document.getElementById('intake-send');
const citySelect = document.getElementById('city');
const districtSelect = document.getElementById('district');

const option = (value, label) => {
  const node = document.createElement('option');
  node.value = value;
  node.textContent = label;
  return node;
};

const fill = (select, items, { placeholder = null } = {}) => {
  select.textContent = '';
  if (placeholder) select.append(option('', placeholder));
  for (const item of items) select.append(option(item.key ?? item, item.label ?? item));
};

let districtsByCity = {};

/** القوائم تأتي من اللقطة المنشورة — ولو تعذّرت، تبقى الاستمارة صالحة بالاسم والجوال والنص. */
async function loadForms() {
  try {
    const res = await fetch('/api/listings', { headers: { accept: 'application/json' } });
    const snapshot = await res.json();
    const office = snapshot.office || {};
    if (office.name) {
      document.getElementById('office-name').textContent = office.name;
      document.title = `سجّل طلبك — ${office.name}`;
    }
    if (office.phone) {
      const a = document.createElement('a');
      a.href = `tel:${office.phone}`;
      a.dir = 'ltr';
      a.textContent = office.phone;
      document.getElementById('office-contact').append(a);
    }
    if (office.logo) {
      const logo = document.getElementById('logo');
      logo.src = `/api/media?id=${encodeURIComponent(office.logo)}`;
      logo.hidden = false;
    }

    const forms = snapshot.forms || {};
    /* **ولا غرضَ محدَّدٌ مسبقًا** (المرحلة ٥٢): كانت تفتح على «بيع» فلا يلحظها
       المستأجر، **فيصلك طلبُ شراءٍ من مستأجر**. والصمتُ هنا أصدقُ من افتراض. */
    fill(document.getElementById('purpose'), forms.purposes || [{ key: 'sale', label: 'بيع' }, { key: 'rent', label: 'إيجار' }],
      { placeholder: 'غير محدد' });
    fill(document.getElementById('type'), forms.types || [], { placeholder: 'غير محدد' });
    districtsByCity = forms.districtsByCity || {};
    fill(citySelect, forms.cities || [], { placeholder: 'غير محددة' });
    drawDistricts();
  } catch (err) {
    // الاستمارة تعمل بلا قوائم: الحقول الاختيارية تبقى فارغة ولا تُعطَّل الصفحة كلها.
    statusNode.textContent = '';
  }
}

function drawDistricts() {
  fill(districtSelect, districtsByCity[citySelect.value] || [], { placeholder: 'كل الأحياء' });
}
citySelect.addEventListener('change', drawDistricts);

/* رقمُ العرض من الرابط (المرحلة ٥٨): «اطلب معاينة» في صفحة العرض يأتي به، فيُقال في
   الاستمارة ويُرسل مع الطلب — ويصل صاحبَ المكتب موصولًا بعرضه لا سؤالًا عامًّا. */
const askedRef = (new URLSearchParams(location.search).get('ref') || '').slice(0, 12);
if (askedRef) {
  const note = document.createElement('p');
  note.className = 'intake-ref';
  note.textContent = `بخصوص العرض رقم ${askedRef}`;
  form.prepend(note);
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(form).entries());
  if (!String(data.phone || '').trim()) {
    statusNode.textContent = 'اكتب رقم جوالك أولًا.';
    return;
  }
  sendBtn.disabled = true;
  statusNode.textContent = 'جارٍ الإرسال…';
  try {
    const res = await fetch('/api/lead', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: data.name, phone: data.phone, note: data.note, website: data.website, ref: askedRef,
        want: {
          purpose: data.purpose, type: data.type, city: data.city, district: data.district,
          budgetMax: data.budgetMax, area: data.area,
        },
      }),
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(out.error || 'تعذّر الإرسال');
    form.reset();
    drawDistricts();
    showDone(data.name);
  } catch (err) {
    statusNode.textContent = err.message || 'تعذّر الإرسال، حاول لاحقًا.';
  } finally {
    sendBtn.disabled = false;
  }
});

/**
 * بطاقةُ النجاح (المرحلة ٥٧): كانت جملةٌ تحت الزرّ والاستمارةُ كاملةٌ بحقولها الفارغة
 * فوقها، فلا يُدرى أأُرسل شيءٌ أم يُعاد. الآن تختفي الحقول ويبقى ما يُفعل تاليًا:
 * واتساب المكتب، وتصفّح العروض، أو طلبٌ آخر.
 */
function showDone(name) {
  const phone = (document.getElementById('office-contact')?.textContent || '').replace(/\D/g, '');
  const intl = phone.startsWith('0') ? `966${phone.slice(1)}` : phone;
  const done = document.createElement('div');
  done.className = 'lead-done';
  done.setAttribute('role', 'status');
  done.innerHTML = `<h2>وصلنا طلبك${name ? ` يا ${escapeHtml(name)}` : ''} ✓</h2>
    <p class="muted">نراجعه ونتواصل معك قريبًا بإذن الله على الجوال الذي كتبته.</p>
    <div class="lead-done-actions">
      ${intl ? `<a class="btn btn-primary" href="https://wa.me/${intl}" target="_blank" rel="noopener">راسلنا على واتساب</a>` : ''}
      <a class="btn" href="index.html">تصفّح العروض</a>
      <button type="button" class="btn" id="intake-again">طلب آخر</button>
    </div>`;
  form.hidden = true;
  form.after(done);
  done.querySelector('#intake-again').addEventListener('click', () => { done.remove(); form.hidden = false; form.querySelector('input')?.focus(); });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

loadForms();
