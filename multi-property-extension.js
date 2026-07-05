(function () {
  const original = {
    goToStep: window.goToStep,
    populateConfirm: window.populateConfirm,
    isBookingWindowSelectable: window.isBookingWindowSelectable,
    updatePriceSummary: window.updatePriceSummary,
    handleDomesticValueChange: window.handleDomesticValueChange,
    handleDomesticSqmChange: window.handleDomesticSqmChange
  };

  let nextPropertyNumber = 2;

  function money(value) {
    return Math.round((Number(value) || 0) * 100) / 100;
  }

  function val(id) {
    const el = document.getElementById(id);
    return el ? String(el.value || '').trim() : '';
  }

  function priceForDomesticBand(value, sqm) {
    if (value === '999000') return { price: 60, band: 'Up to £999,000', duration: 45, property_value: 999000, pricing_basis: 'domestic_value', square_meterage: null };
    if (value === '1999999') return { price: 80, band: '£1,000,000 to £1,999,999', duration: 60, property_value: 1500000, pricing_basis: 'domestic_value', square_meterage: null };
    if (value === '2999999') return { price: 110, band: '£2,000,000 to £2,999,999', duration: 75, property_value: 2500000, pricing_basis: 'domestic_value', square_meterage: null };
    if (value === '3999999') return { price: 150, band: '£3,000,000 to £3,999,999', duration: 90, property_value: 3500000, pricing_basis: 'domestic_value', square_meterage: null };

    if (value === '4000000') {
      const area = Number(sqm || 0);
      if (!area || area <= 0) return { price: 0, band: 'Over £4,000,000 — square meterage required', duration: 0, property_value: 4000000, pricing_basis: 'domestic_sqm', square_meterage: null };
      if (area >= 100 && area <= 150) return { price: 180, band: 'Over £4,000,000 / 100 to 150 m²', duration: 105, property_value: 4000000, pricing_basis: 'domestic_sqm', square_meterage: area };
      if (area >= 151 && area <= 300) return { price: 240, band: 'Over £4,000,000 / 151 to 300 m²', duration: 120, property_value: 4000000, pricing_basis: 'domestic_sqm', square_meterage: area };
      if (area >= 301 && area <= 500) return { price: 400, band: 'Over £4,000,000 / 301 to 500 m²', duration: 150, property_value: 4000000, pricing_basis: 'domestic_sqm', square_meterage: area };
      if (area >= 501 && area <= 10000) return { price: 450, band: 'Over £4,000,000 / 501 to 10,000 m²', duration: 180, property_value: 4000000, pricing_basis: 'domestic_sqm', square_meterage: area };
      return { price: 180, band: 'Over £4,000,000 — starting from £180, review required', duration: 120, property_value: 4000000, pricing_basis: 'domestic_sqm', square_meterage: area };
    }

    return { price: 0, band: '', duration: 0, property_value: null, pricing_basis: '', square_meterage: null };
  }

  function readMainProperty() {
    const postcode = val('postcode').toUpperCase();
    const zone = postcode ? getZone(postcode) : null;
    const info = priceForDomesticBand(val('domestic-property-value'), val('domestic-sqm'));
    return {
      index: 1,
      address: val('address'),
      postcode,
      zone_code: zone ? zone.code : '',
      zone_name: zone ? zone.name : '',
      property_subtype: val('prop-subtype'),
      value_band: val('domestic-property-value'),
      pricing_band: info.band,
      pricing_basis: info.pricing_basis,
      property_value: info.property_value,
      square_meterage: info.square_meterage,
      quote_amount: info.price,
      duration_minutes: info.duration
    };
  }

  function readExtraProperty(card, index) {
    const postcode = String((card.querySelector('.multi-postcode') || {}).value || '').trim().toUpperCase();
    const zone = postcode ? getZone(postcode) : null;
    const valueBand = String((card.querySelector('.multi-value') || {}).value || '');
    const sqm = String((card.querySelector('.multi-sqm') || {}).value || '');
    const info = priceForDomesticBand(valueBand, sqm);
    return {
      index,
      address: String((card.querySelector('.multi-address') || {}).value || '').trim(),
      postcode,
      zone_code: zone ? zone.code : '',
      zone_name: zone ? zone.name : '',
      property_subtype: String((card.querySelector('.multi-subtype') || {}).value || ''),
      value_band: valueBand,
      pricing_band: info.band,
      pricing_basis: info.pricing_basis,
      property_value: info.property_value,
      square_meterage: info.square_meterage,
      quote_amount: info.price,
      duration_minutes: info.duration
    };
  }

  function bookingProperties() {
    if (state.type !== 'Domestic') return [];
    const props = [readMainProperty()];
    document.querySelectorAll('.multi-property-card').forEach((card, i) => props.push(readExtraProperty(card, i + 2)));
    return props;
  }

  function totals() {
    const props = bookingProperties();
    const total = money(props.reduce((sum, p) => sum + Number(p.quote_amount || 0), 0));
    const deposit = money(total * 0.5);
    return {
      properties: props,
      total,
      deposit,
      balance: money(total - deposit),
      duration: props.reduce((sum, p) => sum + Number(p.duration_minutes || 0), 0)
    };
  }

  function syncTotals() {
    if (state.type !== 'Domestic') return;
    const t = totals();
    state.bookingProperties = t.properties;
    state.groupBooking = t.properties.length > 1;
    state.groupBookingCount = t.properties.length;
    if (t.properties.length > 1) {
      state.price = t.total;
      state.deposit = t.deposit;
      state.balance = t.balance;
      state.duration = t.duration;
      state.band = `${t.properties.length} domestic properties`;
      state.pricingBasis = 'domestic_multi_property';
    }
    renderStepQuote(t);
    renderMultiSummary(t);
  }

  function validateGroup(showAlert) {
    if (state.type !== 'Domestic') return true;
    const props = bookingProperties();
    const anchorZone = props[0] && props[0].zone_code;
    for (const p of props) {
      if (!p.address) return fail(`Please enter the address for property ${p.index}.`, showAlert);
      if (!p.postcode || !getZone(p.postcode)) return fail(`Please enter a valid London postcode for property ${p.index}.`, showAlert);
      if (!p.property_subtype) return fail(`Please select the property type for property ${p.index}.`, showAlert);
      if (!p.value_band) return fail(`Please select the estimated property value for property ${p.index}.`, showAlert);
      if (p.value_band === '4000000' && (!p.square_meterage || p.square_meterage <= 0)) return fail(`Please enter the floor area for property ${p.index}.`, showAlert);
      if (!p.quote_amount || p.quote_amount <= 0) return fail(`Please complete the pricing for property ${p.index}.`, showAlert);
      if (anchorZone && p.zone_code && p.zone_code !== anchorZone) return fail('These properties appear to be in different route areas. Please make a separate booking for properties outside the same area.', showAlert);
    }
    return true;
  }

  function fail(message, showAlert) {
    if (showAlert) alert(message);
    return false;
  }

  function propertyLine(p) {
    return `Property ${p.index}: ${p.address || 'Address missing'} — ${p.postcode || 'Postcode missing'} — ${p.quote_amount ? formatPrice(p.quote_amount) : '—'}`;
  }

  function renderStepQuote(t) {
    if (!t || t.properties.length <= 1) return;
    ['step2', 'step3'].forEach(step => {
      const fee = document.getElementById(`quote-fee-${step}`);
      const dep = document.getElementById(`quote-deposit-${step}`);
      const bal = document.getElementById(`quote-balance-${step}`);
      if (fee) fee.textContent = formatPrice(t.total);
      if (dep) dep.textContent = formatPrice(t.deposit);
      if (bal) bal.textContent = formatPrice(t.balance);
    });
  }

  function renderMultiSummary(t) {
    const el = document.getElementById('multi-property-summary');
    if (!el || !t) return;
    if (t.properties.length <= 1) {
      el.classList.remove('show');
      el.innerHTML = '';
      return;
    }
    el.classList.add('show');
    el.innerHTML = `<strong>${t.properties.length} properties in this booking</strong><ul>${t.properties.map(p => `<li>${propertyLine(p)}</li>`).join('')}</ul><p style="margin-top:10px;margin-bottom:0">Total assessment fee: <strong>${formatPrice(t.total)}</strong><br>Deposit due today: <strong>${formatPrice(t.deposit)}</strong></p>`;
  }

  function subtypeOptions() {
    const select = document.getElementById('prop-subtype');
    if (!select) return '';
    return Array.from(select.options).map(o => `<option value="${o.value}">${o.textContent}</option>`).join('');
  }

  function createCard() {
    const number = nextPropertyNumber++;
    const card = document.createElement('div');
    card.className = 'multi-property-card';
    card.innerHTML = `<div class="multi-property-card-head"><div class="multi-property-title">Property ${number}</div><button type="button" class="multi-remove">Remove</button></div><div class="field"><label>Property address <span class="req">*</span></label><input type="text" class="multi-address" placeholder="e.g. Flat 2, 14 Highbury Grove, London"></div><div class="field-row"><div class="field"><label>Postcode <span class="req">*</span></label><input type="text" class="multi-postcode" placeholder="e.g. N5 1PF" style="text-transform:uppercase"><div class="hint">Must be in the same route area as the first property.</div></div><div class="field"><label>Property type <span class="req">*</span></label><select class="multi-subtype">${subtypeOptions()}</select></div></div><div class="field"><label>Estimated property value <span class="req">*</span></label><select class="multi-value"><option value="">— Select —</option><option value="999000">Up to £999,000</option><option value="1999999">£1,000,000 to £1,999,999</option><option value="2999999">£2,000,000 to £2,999,999</option><option value="3999999">£3,000,000 to £3,999,999</option><option value="4000000">Over £4,000,000</option></select></div><div class="field multi-sqm-field" style="display:none"><label>Approximate floor area m² <span class="req">*</span></label><input type="number" min="1" class="multi-sqm" placeholder="e.g. 180"><div class="hint">Required for properties over £4,000,000.</div></div><div class="multi-price-line">Price: —</div>`;
    card.querySelector('.multi-remove').addEventListener('click', () => {
      card.remove();
      renumberCards();
      syncTotals();
    });
    card.querySelectorAll('input, select').forEach(input => {
      input.addEventListener('input', () => updateCard(card));
      input.addEventListener('change', () => updateCard(card));
    });
    return card;
  }

  function updateCard(card) {
    const value = String((card.querySelector('.multi-value') || {}).value || '');
    const sqm = String((card.querySelector('.multi-sqm') || {}).value || '');
    const info = priceForDomesticBand(value, sqm);
    const sqmField = card.querySelector('.multi-sqm-field');
    const priceLine = card.querySelector('.multi-price-line');
    if (sqmField) sqmField.style.display = value === '4000000' ? 'block' : 'none';
    if (priceLine) priceLine.textContent = info.price ? `Price: ${formatPrice(info.price)}` : 'Price: —';
    syncTotals();
  }

  function renumberCards() {
    document.querySelectorAll('.multi-property-card').forEach((card, i) => {
      const title = card.querySelector('.multi-property-title');
      if (title) title.textContent = `Property ${i + 2}`;
    });
    nextPropertyNumber = document.querySelectorAll('.multi-property-card').length + 2;
  }

  function injectStyles() {
    if (document.getElementById('epc-multi-property-style')) return;
    const style = document.createElement('style');
    style.id = 'epc-multi-property-style';
    style.textContent = `.multi-property-panel{border:1.5px solid var(--border);background:#f8fafc;border-radius:var(--radius);padding:16px;margin:18px 0 22px}.multi-property-panel h3{font-size:15px;color:var(--ink);margin-bottom:12px}.multi-property-card{background:white;border:1.5px solid var(--border);border-radius:var(--radius-sm);padding:14px;margin-top:12px}.multi-property-card-head{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:12px}.multi-property-title{font-size:14px;font-weight:700;color:var(--ink)}.multi-remove{border:none;background:transparent;color:var(--error);font-size:13px;font-weight:700;cursor:pointer}.multi-add-btn{width:100%;border:1.5px dashed var(--accent);background:var(--accent-light);color:var(--accent-dark);border-radius:var(--radius-sm);padding:13px 14px;font-size:14px;font-weight:700;cursor:pointer}.multi-price-line{margin-top:8px;font-size:13px;font-weight:700;color:var(--accent)}.multi-property-summary{display:none;margin-top:12px;border-top:1px solid var(--border);padding-top:12px}.multi-property-summary.show{display:block}.multi-property-summary ul{margin:8px 0 0 18px;color:var(--ink2);font-size:13px;line-height:1.5}.multi-property-summary strong{color:var(--ink)}.confirm-property-list{margin-top:14px;padding:12px 14px;background:#f8fafc;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:13px;line-height:1.5}.confirm-property-list strong{display:block;margin-bottom:6px}`;
    document.head.appendChild(style);
  }

  function injectPanel() {
    if (document.getElementById('multi-property-panel')) return;
    const domesticPricing = document.getElementById('domestic-pricing');
    if (!domesticPricing) return;
    injectStyles();
    const panel = document.createElement('div');
    panel.id = 'multi-property-panel';
    panel.className = 'multi-property-panel';
    panel.innerHTML = `<h3>Booking more than one domestic property?</h3><div id="multi-property-list"></div><button type="button" class="multi-add-btn" id="multi-add-property-btn">+ Add another property to this booking</button><div class="multi-property-summary" id="multi-property-summary"></div>`;
    domesticPricing.appendChild(panel);
    document.getElementById('multi-add-property-btn').addEventListener('click', () => {
      const card = createCard();
      document.getElementById('multi-property-list').appendChild(card);
      syncTotals();
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  function requiredCapacity() {
    return state.type === 'Domestic' ? Math.max(1, bookingProperties().length) : 1;
  }

  window.isBookingWindowSelectable = function (availability, windowName) {
    const required = requiredCapacity();
    if (!availability || availability.dayLeft < required) return false;
    if (windowName === 'AM') return availability.amLeft >= required;
    if (windowName === 'PM') return availability.pmLeft >= required && availability.amLeft < required;
    return false;
  };

  function patchPayload(payload) {
    if (!payload || state.type !== 'Domestic') return payload;
    syncTotals();
    const t = totals();
    const props = t.properties;
    return Object.assign(payload, {
      quote_amount: t.total,
      invoice_amount: t.total,
      price: t.total,
      deposit_amount: t.deposit,
      deposit: t.deposit,
      balance_due: t.balance,
      duration_minutes: t.duration,
      pricing_band: props.length > 1 ? `${props.length} domestic properties` : props[0].pricing_band,
      pricing_basis: props.length > 1 ? 'domestic_multi_property' : props[0].pricing_basis,
      is_group_booking: props.length > 1,
      group_booking_count: props.length,
      capacity_required: props.length,
      booking_properties: props,
      property_address: props[0].address,
      address: props[0].address,
      postcode: props[0].postcode,
      property_subtype: props[0].property_subtype,
      property_value: props[0].property_value,
      square_meterage: props[0].square_meterage
    });
  }

  const originalFetch = window.fetch.bind(window);
  window.fetch = function (url, options) {
    const urlString = typeof url === 'string' ? url : (url && url.url) || '';
    if (urlString.includes('/api/create-checkout-session') && options && options.body && state.type === 'Domestic') {
      try {
        options = Object.assign({}, options, { body: JSON.stringify(patchPayload(JSON.parse(options.body))) });
      } catch (err) {
        console.warn('Could not update Stripe payload for multi-property booking:', err);
      }
    }
    return originalFetch(url, options);
  };

  window.goToStep = function (n) {
    const active = document.querySelector('.form-step.active');
    const cur = active && active.id === 'step-success' ? 6 : parseInt(active.id.replace('step-', ''), 10);
    if (state.type === 'Domestic' && n > cur && cur === 2) {
      syncTotals();
      if (!validateGroup(true)) return;
    }
    return original.goToStep(n);
  };

  window.populateConfirm = function () {
    original.populateConfirm();
    if (state.type !== 'Domestic') return;
    syncTotals();
    const t = totals();
    if (t.properties.length <= 1) return;
    document.getElementById('cf-address').textContent = `${t.properties.length} domestic properties`;
    document.getElementById('cf-postcode').textContent = t.properties[0].postcode;
    document.getElementById('cf-service').textContent = 'Domestic EPC grouped booking';
    document.getElementById('cf-subtype').textContent = 'Multiple domestic properties';
    document.getElementById('cf-band').textContent = t.properties.map(p => `${p.index}: ${p.pricing_band}`).join(' | ');
    document.getElementById('cf-duration').textContent = t.duration ? `${t.duration} minutes total` : 'Review required';
    document.getElementById('cf-total').textContent = formatPrice(t.total);
    document.getElementById('cf-deposit').textContent = formatPrice(t.deposit);
    document.getElementById('cf-balance').textContent = formatPrice(t.balance);
    let list = document.getElementById('confirm-property-list');
    const grid = document.querySelector('#step-5 .confirm-grid');
    if (!list && grid) {
      list = document.createElement('div');
      list.id = 'confirm-property-list';
      list.className = 'confirm-property-list';
      grid.after(list);
    }
    if (list) list.innerHTML = `<strong>Properties included</strong>${t.properties.map(p => `<div>${propertyLine(p)}</div>`).join('')}`;
  };

  window.updatePriceSummary = function () {
    original.updatePriceSummary();
    if (state.type === 'Domestic') syncTotals();
  };

  window.handleDomesticValueChange = function () {
    original.handleDomesticValueChange();
    syncTotals();
  };

  window.handleDomesticSqmChange = function () {
    original.handleDomesticSqmChange();
    syncTotals();
  };

  injectPanel();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', injectPanel);
})();
