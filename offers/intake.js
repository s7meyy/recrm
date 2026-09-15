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
    fill(document.getElementById('purpose'), forms.purposes || [{ key: 'sale', label: 'بيع' }, { key: 'rent', label: 'إيجار' }]);
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
        name: data.name, phone: data.phone, note: data.note, website: data.website,
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
    statusNode.textContent = 'وصلنا طلبك — نتواصل معك قريبًا بإذن الله.';
  } catch (err) {
    statusNode.textContent = err.message || 'تعذّر الإرسال، حاول لاحقًا.';
  } finally {
    sendBtn.disabled = false;
  }
});

loadForms();
