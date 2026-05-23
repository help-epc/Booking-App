/*
  EPC Pro Booking App Stripe submit override
  Purpose: replace the old inline submitBooking() behaviour without rewriting the whole index.html.
  Domestic bookings are redirected to Stripe Checkout via /api/create-checkout-session.
  Commercial bookings continue to use the review/request flow.
*/

(function () {
  async function submitBookingWithStripe() {
    if (!document.getElementById('terms').checked) {
      alert('Please confirm the booking terms before continuing.');
      return;
    }

    if (!window.supabaseClient && typeof supabaseClient === 'undefined') {
      alert('The booking system cannot connect to Supabase. Please call 07831 363 622 to book.');
      return;
    }

    const activeSupabaseClient = window.supabaseClient || supabaseClient;

    const submitBtn = document.getElementById('submit-btn');
    const label = document.getElementById('submit-btn-label');

    submitBtn.disabled = true;
    label.textContent = state.type === 'Domestic'
      ? 'Opening secure payment...'
      : 'Saving booking request...';

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

      state.reference = reference;

      const fname = document.getElementById('fname').value.trim();
      const lname = document.getElementById('lname').value.trim();
      const fullName = `${fname} ${lname}`.trim();
      const email = document.getElementById('email').value.trim();
      const phone = document.getElementById('phone').value.trim();
      const access = document.getElementById('access').value.trim();
      const referral = document.getElementById('referral').value || 'Website';

      const squareMeterage = state.squareMeterage || getEstimatedSquareMeterageFromBandName(state.band);

      const commonBookingData = {
        reference,
        job_id: jobId,

        client_name: fullName,
        customer_name: fullName,
        name: fullName,

        client_email: email,
        customer_email: email,
        email,

        client_phone: phone,
        customer_phone: phone,
        phone,

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

        access_instructions: access,
        access,
        source: referral,
        referral,

        capacity_rule: {
          am_capacity: AM_CAPACITY,
          pm_capacity: PM_CAPACITY,
          day_capacity: DAY_CAPACITY
        },

        created_at: new Date().toISOString()
      };

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
          const message = result && result.error
            ? result.error
            : 'Stripe checkout could not be created.';
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
        name: fullName,
        email,
        phone,
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
        source: referral,
        status: leadStatus,
        epc_type: state.type,
        property_value: state.propertyValue,
        square_meterage: squareMeterage,
        estimated_value: state.price,
        quoted_price: state.price,
        client_name: fullName,
        client_email: email,
        client_phone: phone,
        customer_name: fullName,
        customer_email: email,
        customer_phone: phone,
        notes: access,
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
        source: referral,
        documents,
        field_status: null,
        notes: access
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
          source: referral,
          documents,
          field_status: null,
          notes: access
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

  window.submitBooking = submitBookingWithStripe;
})();
