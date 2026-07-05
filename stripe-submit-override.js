/* EPC Pro Booking App override file
   - Domestic bookings redirect to Stripe Checkout
   - Commercial bookings stay in review/request flow
   - Calendar display is compact and customer-facing
   - Loads the domestic multi-property booking extension
*/

(function () {
  function getFieldValue(id) {
    const el = document.getElementById(id);
    return el ? el.value.trim() : '';
  }

  function getCustomerDetails() {
    const fname = getFieldValue('fname');
    const lname = getFieldValue('lname');

    return {
      fullName: `${fname} ${lname}`.trim(),
      email: getFieldValue('email'),
      phone: getFieldValue('phone'),
      access: getFieldValue('access'),
      referral: getFieldValue('referral') || 'Website'
    };
  }

  function buildCommonBookingData(reference, jobId, routeFit) {
    const customer = getCustomerDetails();
    const squareMeterage = state.squareMeterage || getEstimatedSquareMeterageFromBandName(state.band);

    return {
      reference,
      job_id: jobId,
      client_name: customer.fullName,
      customer_name: customer.fullName,
      name: customer.fullName,
      client_email: customer.email,
      customer_email: customer.email,
      email: customer.email,
      client_phone: customer.phone,
      customer_phone: customer.phone,
      phone: customer.phone,
      property_address: state.address,
      address: state.address,
      postcode: state.postcode,
      service_type: state.type,
      epc_type: state.type,
      type: state.type,
      property_subtype: state.subtype,
      pricing_band: state.band,
      pricing_basis: state.pricingBasis,
      property_value: state.propertyValue,
      square_meterage: squareMeterage,
      duration_minutes: state.duration,
      quote_amount: state.price,
      invoice_amount: state.price,
      price: state.price,
      deposit_amount: state.deposit,
      deposit: state.deposit,
      balance_due: state.type === 'Commercial' ? state.price : state.balance,
      booking_date: state.date,
      date: state.date,
      booking_window: state.bookingWindow,
      window: state.bookingWindow,
      route_fit: routeFit.code,
      route_fit_label: routeFit.label,
      route_message: routeFit.message,
      route_review_required: routeFit.reviewRequired,
      existing_route_areas: routeFit.existingAreas || [],
      route_display_priority: isRecommendedRouteFit(routeFit) ? 'recommended' : 'less_suitable',
      access_instructions: customer.access,
      access: customer.access,
      source: customer.referral,
      referral: customer.referral,
      capacity_rule: {
        am_capacity: AM_CAPACITY,
        pm_capacity: PM_CAPACITY,
        day_capacity: DAY_CAPACITY
      },
      created_at: new Date().toISOString()
    };
  }

  async function submitBookingWithStripe() {
    if (!document.getElementById('terms').checked) {
      alert('Please confirm the booking terms before continuing.');
      return;
    }

    if (state.type === 'Domestic') {
      const ackBox = document.getElementById('evidence-ack');
      if (!ackBox || !ackBox.checked) {
        const warn = document.getElementById('evidence-warning');
        if (warn) warn.classList.add('show');
        const evidence = document.getElementById('evidence-section');
        if (evidence) evidence.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
    }

    if (!window.supabaseClient && typeof supabaseClient === 'undefined') {
      alert('The booking system cannot connect to Supabase. Please call 07831 363 622 to book.');
      return;
    }

    const submitBtn = document.getElementById('submit-btn');
    const label = document.getElementById('submit-btn-label');

    submitBtn.disabled = true;
    label.textContent = state.type === 'Domestic' ? 'Opening secure payment...' : 'Saving booking request...';

    try {
      const latestAvailability = getAvailabilityForDate(state.date);
      const stillAvailable = isBookingWindowSelectable(latestAvailability, state.bookingWindow);

      if (!stillAvailable) {
        alert('That window is no longer available. Please choose another available AM window, or PM if AM is full.');
        submitBtn.disabled = false;
        label.textContent = 'Confirm booking request';
        goToStep(3);
        await loadLiveAvailability();
        return;
      }

      const reference = generateReference();
      const jobId = generateUUID();
      const routeFit = state.selectedRouteFit || getRouteFitForDate(state.date);
      const customer = getCustomerDetails();
      const commonBookingData = buildCommonBookingData(reference, jobId, routeFit);
      const squareMeterage = state.squareMeterage || getEstimatedSquareMeterageFromBandName(state.band);

      state.reference = reference;

      if (state.type === 'Domestic') {
        if (!state.deposit || state.deposit <= 0) {
          throw new Error('Deposit amount is missing. Please go back and check the quote.');
        }

        const response = await fetch('/api/create-checkout-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(commonBookingData)
        });

        const result = await response.json().catch(() => null);

        if (!response.ok || !result || !result.ok || !result.checkout_url) {
          const message = result && result.error ? result.error : 'Stripe checkout could not be created.';
          throw new Error(message);
        }

        label.textContent = 'Redirecting to secure payment...';
        window.location.href = result.checkout_url;
        return;
      }

      const documents = {
        ...commonBookingData,
        public_reference: reference,
        zone_code: state.zone,
        zone_name: state.zoneName,
        created_from: 'booking_app_commercial_review'
      };

      const contact = await insertContact({
        name: customer.fullName,
        email: customer.email,
        phone: customer.phone,
        type: 'Client',
        client_reference: reference
      });

      const property = await insertProperty({
        contact_id: contact ? contact.id : null,
        address: state.address,
        postcode: state.postcode,
        city: 'London',
        property_value: state.propertyValue,
        square_meterage: squareMeterage
      });

      const leadStatus = 'Review required';

      const lead = await insertLead({
        contact_id: contact ? contact.id : null,
        property_id: property ? property.id : null,
        property_address: state.address,
        postcode: state.postcode,
        source: customer.referral,
        status: leadStatus,
        epc_type: state.type,
        property_value: state.propertyValue,
        square_meterage: squareMeterage,
        estimated_value: state.price,
        quoted_price: state.price,
        client_name: customer.fullName,
        client_email: customer.email,
        client_phone: customer.phone,
        customer_name: customer.fullName,
        customer_email: customer.email,
        customer_phone: customer.phone,
        notes: customer.access,
        documents
      });

      const jobPayload = {
        id: jobId,
        contact_id: contact ? contact.id : null,
        property_id: property ? property.id : null,
        lead_id: lead ? lead.id : null,
        reference,
        booking_date: state.date,
        booking_window: state.bookingWindow,
        provisional_eta: 'TBC',
        deposit_amount: 0,
        deposit_paid: false,
        invoice_issued: false,
        invoice_amount: state.price,
        balance_due: state.price,
        epc_type: state.type,
        status: leadStatus,
        source: customer.referral,
        documents,
        field_status: null,
        notes: customer.access
      };

      try {
        await insertJob(jobPayload);
      } catch (jobErr) {
        console.warn('Full job insert failed. Retrying minimal job payload:', jobErr.message);
        await insertJob({
          id: jobId,
          reference,
          booking_date: state.date,
          booking_window: state.bookingWindow,
          provisional_eta: 'TBC',
          deposit_amount: 0,
          deposit_paid: false,
          invoice_issued: false,
          invoice_amount: state.price,
          balance_due: state.price,
          epc_type: state.type,
          status: leadStatus,
          source: customer.referral,
          documents,
          field_status: null,
          notes: customer.access
        });
      }

      document.getElementById('booking-ref-num').textContent = reference;
      document.querySelectorAll('.form-step').forEach(step => step.classList.remove('active'));
      document.getElementById('step-success').classList.add('active');
      document.querySelector('.progress-wrap').style.display = 'none';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      console.error('Booking submission error:', err);
      alert('There was a problem continuing with the booking: ' + (err.message || err));
      submitBtn.disabled = false;
      label.textContent = 'Confirm booking request';
    }
  }

  function updateHeroAccreditationBadge() {
    document.querySelectorAll('.trust-badges .badge').forEach(badge => {
      const text = (badge.textContent || '').trim().toLowerCase();
      if (text === 'fully accredited dea') badge.textContent = 'Fully accredited DEA & NDEA';
    });
  }

  function injectCalendarUiStyles() {
    if (document.getElementById('epc-calendar-ui-override-style')) return;

    const style = document.createElement('style');
    style.id = 'epc-calendar-ui-override-style';
    style.textContent = `
      #step-3 .date-info,
      #step-3 #availability-status { display: none !important; }
      .calendar-compact-notice { background: var(--blue-bg); border: 1px solid var(--blue-border); color: var(--blue-text); border-radius: var(--radius-sm); padding: 12px 16px; font-size: 13px; line-height: 1.5; margin-bottom: 16px; }
      .calendar-compact-notice strong { display: block; margin-bottom: 3px; color: var(--blue-text); }
      .day-card.compact-calendar-card { padding: 14px 16px; }
      .route-pill-row { display: flex; flex-wrap: wrap; gap: 8px; margin: 10px 0 12px; }
      .route-pill, .window-rule-pill { display: inline-flex; align-items: center; border-radius: 999px; padding: 5px 10px; font-size: 12px; font-weight: 700; line-height: 1.2; }
      .route-pill.good { background: var(--success-bg); color: var(--success); border: 1px solid #bbf7d0; }
      .route-pill.open { background: var(--blue-bg); color: var(--blue-text); border: 1px solid var(--blue-border); }
      .route-pill.poor { background: var(--warning-bg); color: var(--warning-text); border: 1px solid var(--warning-border); }
      .route-pill.unknown { background: #f8fafc; color: var(--ink3); border: 1px solid var(--border); }
      .window-rule-pill { background: #f8fafc; color: var(--ink3); border: 1px solid var(--border); font-weight: 600; }
      .compact-calendar-card .day-message,
      .compact-calendar-card .route-message { display: none !important; }
      .compact-calendar-card .day-top { margin-bottom: 8px; }
      .compact-calendar-card .window-options { margin-top: 2px; }
    `;

    document.head.appendChild(style);
  }

  function getRoutePillText(routeFit) {
    if (!routeFit) return 'Route fit unknown';
    if (routeFit.code === 'good') return 'Recommended route';
    if (routeFit.code === 'open') return 'Open route day';
    if (routeFit.code === 'poor') return 'Route review needed';
    return routeFit.label || 'Route fit unknown';
  }

  function createCompactDayCard(day) {
    const availability = day.availability;
    const routeFit = day.routeFit;

    const dayCard = document.createElement('div');
    dayCard.className = `day-card compact-calendar-card ${routeFit.code || 'unknown'}${!availability.dayAvailable ? ' full' : ''}`;

    const amDisabled = !isBookingWindowSelectable(availability, 'AM');
    const pmLockedUntilMorningFull = availability.pmAvailable && availability.amAvailable;
    const pmDisabled = !isBookingWindowSelectable(availability, 'PM');
    const pmStatusText = !availability.pmAvailable ? 'PM full' : pmLockedUntilMorningFull ? 'PM opens after AM full' : availability.pmLeft + ' PM spaces left';
    const rulePill = availability.amAvailable && availability.pmAvailable ? '<span class="window-rule-pill">PM opens once AM is full</span>' : '';

    dayCard.innerHTML = `
      <div class="day-top">
        <div><div class="day-title">${day.dateStr}</div><div class="day-meta">${day.iso}</div></div>
        <div class="day-capacity">${availability.dayLeft}/${DAY_CAPACITY} spaces left<br>${availability.dayBooked} existing booking${availability.dayBooked === 1 ? '' : 's'}</div>
      </div>
      <div class="route-pill-row"><span class="route-pill ${routeFit.code || 'unknown'}">${getRoutePillText(routeFit)}</span>${rulePill}</div>
      <div class="window-options">
        <div class="window-option ${amDisabled ? 'disabled' : ''}" data-date="${day.iso}" data-datestr="${day.dateStr}" data-window="AM">
          <div class="window-name">AM window</div><div class="window-time">08:00 - 13:00</div><div class="window-left">${amDisabled ? 'AM full' : availability.amLeft + ' AM spaces left'}</div>
        </div>
        <div class="window-option ${pmDisabled ? 'disabled' : ''}" data-date="${day.iso}" data-datestr="${day.dateStr}" data-window="PM">
          <div class="window-name">PM window</div><div class="window-time">13:00 - 17:00</div><div class="window-left">${pmStatusText}</div>
        </div>
      </div>
    `;

    dayCard.querySelectorAll('.window-option').forEach(option => {
      if (!option.classList.contains('disabled')) {
        option.addEventListener('click', () => selectWindow(option, option.dataset.date, option.dataset.datestr, option.dataset.window));
      }
    });

    return dayCard;
  }

  function buildCompactDateGrid() {
    injectCalendarUiStyles();

    const grid = document.getElementById('days-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const allOptions = collectDateOptions();
    const availableOptions = allOptions.filter(day => day.dayAvailable).sort((a, b) => a.iso.localeCompare(b.iso)).slice(0, 18);
    const fullSoon = allOptions.filter(day => !day.dayAvailable).sort((a, b) => a.iso.localeCompare(b.iso)).slice(0, 4);

    const notice = document.createElement('div');
    notice.className = 'calendar-compact-notice';
    notice.innerHTML = '<strong>Choose your appointment window</strong>Recommended dates fit better with the existing route. AM spaces are offered first; PM opens when AM is full for that date.';
    grid.appendChild(notice);

    if (availableOptions.length > 0) {
      const heading = document.createElement('div');
      heading.innerHTML = '<div class="calendar-heading">Available dates</div><div class="calendar-subnote">Select an available AM or PM window below.</div>';
      grid.appendChild(heading);
      availableOptions.forEach(day => grid.appendChild(createCompactDayCard(day)));
    } else {
      const msg = document.createElement('div');
      msg.className = 'no-dates-message';
      msg.innerHTML = 'No available dates were found in the next few weeks. Please contact EPC Pro for help arranging an appointment.';
      grid.appendChild(msg);
    }

    if (fullSoon.length > 0) {
      const heading = document.createElement('div');
      heading.innerHTML = '<div class="calendar-heading">Fully booked dates</div><div class="calendar-subnote">Shown for awareness only.</div>';
      grid.appendChild(heading);
      fullSoon.forEach(day => grid.appendChild(createCompactDayCard(day)));
    }
  }

  function loadMultiPropertyExtension() {
    if (document.getElementById('epc-multi-property-extension')) return;
    const script = document.createElement('script');
    script.id = 'epc-multi-property-extension';
    script.src = '/multi-property-extension.js?v=20260705';
    script.defer = true;
    document.body.appendChild(script);
  }

  window.submitBooking = submitBookingWithStripe;
  window.createDayCard = createCompactDayCard;
  window.buildDateGrid = buildCompactDateGrid;

  injectCalendarUiStyles();
  updateHeroAccreditationBadge();
  loadMultiPropertyExtension();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      updateHeroAccreditationBadge();
      loadMultiPropertyExtension();
    });
  }
})();
