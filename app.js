document.getElementById('year').textContent = new Date().getFullYear();

/* ---------- Country selector ---------- */
const countrySelect = document.getElementById('country');
COUNTRIES.forEach(c => {
  const opt = document.createElement('option');
  opt.value = c;
  opt.textContent = c;
  countrySelect.appendChild(opt);
});

/* ---------- Nominatim address autocomplete ---------- */
const addressInput = document.getElementById('address');
const addressResults = document.getElementById('address-results');
const addressLat = document.getElementById('address-lat');
const addressLon = document.getElementById('address-lon');
let addressDebounce = null;
let lastQuery = '';

addressInput.addEventListener('input', () => {
  const query = addressInput.value.trim();
  addressLat.value = '';
  addressLon.value = '';
  clearTimeout(addressDebounce);

  if (query.length < 3) {
    addressResults.hidden = true;
    addressResults.innerHTML = '';
    return;
  }

  addressDebounce = setTimeout(() => fetchAddressSuggestions(query), 400);
});

async function fetchAddressSuggestions(query) {
  if (query === lastQuery) return;
  lastQuery = query;
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=6&q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: { 'Accept-Language': 'en' }
    });
    if (!res.ok) throw new Error('Nominatim request failed');
    const data = await res.json();
    renderAddressSuggestions(data);
  } catch (err) {
    console.error(err);
    addressResults.hidden = true;
  }
}

function renderAddressSuggestions(results) {
  addressResults.innerHTML = '';
  if (!results.length) {
    addressResults.hidden = true;
    return;
  }
  results.forEach(place => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = place.display_name;
    btn.addEventListener('click', () => {
      addressInput.value = place.display_name;
      addressLat.value = place.lat;
      addressLon.value = place.lon;
      addressResults.hidden = true;
      addressResults.innerHTML = '';
      clearError('address');
    });
    addressResults.appendChild(btn);
  });
  addressResults.hidden = false;
}

document.addEventListener('click', (e) => {
  if (!addressResults.contains(e.target) && e.target !== addressInput) {
    addressResults.hidden = true;
  }
});

/* ---------- Time slots ---------- */
const SLOT_HOURS = [10, 11, 12, 13, 14, 15, 16]; // 10am - 5pm, hourly start times
const slotsGrid = document.getElementById('slots-grid');
const slotInput = document.getElementById('slot');
const slotDateInput = document.getElementById('slot-date');
let selectedSlotBtn = null;

// Restrict date picker to today and onward
const todayStr = new Date().toISOString().split('T')[0];
slotDateInput.min = todayStr;

function formatSlotLabel(hour) {
  const start = hour > 12 ? `${hour - 12}:00 PM` : (hour === 12 ? '12:00 PM' : `${hour}:00 AM`);
  return start;
}

async function loadSlots() {
  const date = slotDateInput.value;
  slotInput.value = '';
  if (selectedSlotBtn) { selectedSlotBtn.classList.remove('selected'); selectedSlotBtn = null; }

  if (!date) {
    slotsGrid.innerHTML = '<p class="slots-loading">Choose a date to see available times…</p>';
    return;
  }

  slotsGrid.innerHTML = '<p class="slots-loading">Loading available times…</p>';
  try {
    const res = await fetch(`/api/slots?date=${encodeURIComponent(date)}`);
    if (!res.ok) throw new Error('Failed to load slots');
    const data = await res.json();
    const booked = new Set(data.booked || []);
    renderSlots(booked);
  } catch (err) {
    console.error(err);
    renderSlots(new Set());
  }
}

function renderSlots(bookedSet) {
  slotsGrid.innerHTML = '';
  SLOT_HOURS.forEach(hour => {
    const slotId = `${hour}:00-${hour + 1}:00`;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'slot-btn';
    btn.textContent = formatSlotLabel(hour);
    btn.dataset.slotId = slotId;

    if (bookedSet.has(slotId)) {
      btn.disabled = true;
      btn.title = 'Already booked';
    } else {
      btn.addEventListener('click', () => selectSlot(btn, slotId));
    }
    slotsGrid.appendChild(btn);
  });
}

function selectSlot(btn, slotId) {
  if (selectedSlotBtn) selectedSlotBtn.classList.remove('selected');
  btn.classList.add('selected');
  selectedSlotBtn = btn;
  slotInput.value = slotId;
  clearError('slot');
}

slotDateInput.addEventListener('change', () => {
  clearError('slot_date');
  loadSlots();
});

/* ---------- Validation ---------- */
const form = document.getElementById('consult-form');
const submitBtn = document.getElementById('submit-btn');
const formStatus = document.getElementById('form-status');

function showError(fieldName, message) {
  const field = form.querySelector(`[name="${fieldName}"]`);
  const fieldWrap = field ? field.closest('.field') : null;
  const errEl = form.querySelector(`.err[data-for="${fieldName}"]`);
  if (fieldWrap) fieldWrap.classList.add('invalid');
  if (errEl) {
    errEl.textContent = message;
    errEl.classList.add('show');
  }
}

function clearError(fieldName) {
  const field = form.querySelector(`[name="${fieldName}"]`);
  const fieldWrap = field ? field.closest('.field') : null;
  const errEl = form.querySelector(`.err[data-for="${fieldName}"]`);
  if (fieldWrap) fieldWrap.classList.remove('invalid');
  if (errEl) {
    errEl.textContent = '';
    errEl.classList.remove('show');
  }
}

function clearAllErrors() {
  form.querySelectorAll('.field').forEach(f => f.classList.remove('invalid'));
  form.querySelectorAll('.err').forEach(e => { e.textContent = ''; e.classList.remove('show'); });
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validateForm(values) {
  let valid = true;
  if (!values.name.trim()) { showError('name', 'Please enter your full name.'); valid = false; }
  if (!values.email.trim() || !isValidEmail(values.email)) { showError('email', 'Please enter a valid email address.'); valid = false; }
  if (!values.mobile.trim()) { showError('mobile', 'Please enter a mobile number.'); valid = false; }
  if (!values.dob) { showError('dob', 'Please select your date of birth.'); valid = false; }
  if (!values.country) { showError('country', 'Please select your country of citizenship.'); valid = false; }
  if (!values.address.trim()) { showError('address', 'Please enter and select your address.'); valid = false; }
  if (!values.reason.trim()) { showError('reason', 'Please tell us why you want to consult with us.'); valid = false; }
  if (!values.slot_date) { showError('slot_date', 'Please choose a preferred date.'); valid = false; }
  if (!values.slot) { showError('slot', 'Please select a time slot.'); valid = false; }
  return valid;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearAllErrors();
  formStatus.textContent = '';
  formStatus.className = 'form-status';

  const values = {
    name: form.name.value,
    email: form.email.value,
    mobile: form.mobile.value,
    dob: form.dob.value,
    country: form.country.value,
    address: form.address.value,
    address_lat: form.address_lat.value,
    address_lon: form.address_lon.value,
    reason: form.reason.value,
    slot_date: form.slot_date.value,
    slot: form.slot.value,
  };

  if (!validateForm(values)) {
    formStatus.textContent = 'Please fix the highlighted fields above.';
    formStatus.classList.add('error');
    return;
  }

  submitBtn.disabled = true;
  submitBtn.querySelector('.btn-label').textContent = 'Submitting…';

  try {
    const res = await fetch('/api/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    });
    const data = await res.json();

    if (!res.ok) {
      if (res.status === 409) {
        formStatus.textContent = 'That time slot was just booked by someone else. Please pick another.';
        formStatus.classList.add('error');
        loadSlots();
        slotInput.value = '';
      } else {
        formStatus.textContent = data.message || 'Something went wrong. Please try again.';
        formStatus.classList.add('error');
      }
      submitBtn.disabled = false;
      submitBtn.querySelector('.btn-label').textContent = 'Confirm consultation';
      return;
    }

    formStatus.textContent = 'Thank you — your consultation request has been confirmed. We\'ll be in touch shortly.';
    formStatus.classList.add('success');
    form.reset();
    if (selectedSlotBtn) selectedSlotBtn.classList.remove('selected');
    selectedSlotBtn = null;
    submitBtn.querySelector('.btn-label').textContent = 'Confirm consultation';
    submitBtn.disabled = false;
    loadSlots();

  } catch (err) {
    console.error(err);
    formStatus.textContent = 'Network error. Please check your connection and try again.';
    formStatus.classList.add('error');
    submitBtn.disabled = false;
    submitBtn.querySelector('.btn-label').textContent = 'Confirm consultation';
  }
});
