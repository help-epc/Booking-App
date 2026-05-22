const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

function getRequiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function createSupabaseClient() {
  return createClient(getRequiredEnv('SUPABASE_URL'), getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY'));
}

function getBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'object') return req.body;
  try { return JSON.parse(req.body); } catch { return {}; }
}

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function cleanEmail(value) {
  return cleanText(value).toLowerCase();
}

function toMoney(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : 0;
}

function toPence(value) {
  return Math.max(0, Math.round(toMoney(value) * 100));
}

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function generateReference() {
  return `EPC-${Date.now().toString(36).toUpperCase().slice(-6)}`;
}

function safeWindow(value) {
  const text = cleanText(value).toUpperCase();
  return text === 'PM' ? 'PM' : 'AM';
}

function buildBookingData(body) {
  const serviceType = cleanText(body.service_type || body.epc_type || body.type || 'Domestic');
  const isCommercial = serviceType.toLowerCase().includes('commercial');
  const invoiceAmount = toMoney(body.invoice_amount || body.quote_amount || body.price || 0);
  const requestedDeposit = toMoney(body.deposit_amount || body.deposit || 0);
  const depositAmount = isCommercial ? 0 : (requestedDeposit > 0 ? requestedDeposit : toMoney(invoiceAmount * 0.5));
  const balanceDue = isCommercial ? invoiceAmount : toMoney(invoiceAmount - depositAmount);
  const reference = cleanText(body.reference) || generateReference();
  const jobId = cleanText(body.job_id) || generateUUID();

  return {
    reference,
    jobId,
    clientName: cleanText(body.client_name || body.customer_name || body.name),
    clientEmail: cleanEmail(body.client_email || body.customer_email || body.email),
    clientPhone: cleanText(body.client_phone || body.customer_phone || body.phone),
    propertyAddress: cleanText(body.property_address || body.address),
    postcode: cleanText(body.postcode).toUpperCase(),
    propertySubtype: cleanText(body.property_subtype || body.subtype),
    bookingDate: cleanText(body.booking_date || body.date),
    bookingWindow: safeWindow(body.booking_window || body.window),
    source: cleanText(body.source || body.referral) || 'Booking app',
    accessInstructions: cleanText(body.access_instructions || body.access),
    serviceType,
    isCommercial,
    pricingBand: cleanText(body.pricing_band || body.band),
    pricingBasis: cleanText(body.pricing_basis),
    propertyValue: body.property_value ? Number(body.property_value) : null,
    squareMeterage: body.square_meterage ? Number(body.square_meterage) : null,
    durationMinutes: body.duration_minutes ? Number(body.duration_minutes) : null,
    routeFit: cleanText(body.route_fit),
    routeFitLabel: cleanText(body.route_fit_label),
    routeMessage: cleanText(body.route_message),
    routeReviewRequired: Boolean(body.route_review_required),
    existingRouteAreas: Array.isArray(body.existing_route_areas) ? body.existing_route_areas : [],
    routeDisplayPriority: cleanText(body.route_display_priority),
    invoiceAmount,
    depositAmount,
    balanceDue,
    raw: body
  };
}

async function checkCapacity(supabase, bookingDate, bookingWindow) {
  const { data, error } = await supabase
    .from('jobs')
    .select('id, booking_window, status')
    .eq('booking_date', bookingDate);

  if (error) throw error;

  const activeJobs = (data || []).filter(job => !['Completed', 'Closed', 'Cancelled', 'Lost', 'EPC served'].includes(String(job.status || '')));
  const amBooked = activeJobs.filter(job => String(job.booking_window || '').toUpperCase() === 'AM').length;
  const pmBooked = activeJobs.filter(job => String(job.booking_window || '').toUpperCase() === 'PM').length;
  const totalBooked = activeJobs.length;

  if (totalBooked >= 8) throw new Error('This date is now fully booked. Please choose another date.');
  if (bookingWindow === 'AM' && amBooked >= 5) throw new Error('This AM window is now full. Please choose another date.');
  if (bookingWindow === 'PM' && pmBooked >= 3) throw new Error('This PM window is now full. Please choose another date.');
}

async function savePendingBooking(supabase, booking, sessionId) {
  const now = new Date().toISOString();
  const status = booking.isCommercial ? 'Review required' : 'Booked - deposit pending';

  const documents = {
    ...booking.raw,
    public_reference: booking.reference,
    job_id: booking.jobId,
    customer_name: booking.clientName,
    customer_email: booking.clientEmail,
    customer_phone: booking.clientPhone,
    property_address: booking.propertyAddress,
    postcode: booking.postcode,
    service_type: booking.serviceType,
    epc_type: booking.serviceType,
    property_subtype: booking.propertySubtype,
    pricing_band: booking.pricingBand,
    pricing_basis: booking.pricingBasis,
    property_value: booking.propertyValue,
    square_meterage: booking.squareMeterage,
    quote_amount: booking.invoiceAmount,
    invoice_amount: booking.invoiceAmount,
    deposit_amount: booking.depositAmount,
    balance_due: booking.balanceDue,
    duration_minutes: booking.durationMinutes,
    booking_date: booking.bookingDate,
    booking_window: booking.bookingWindow,
    booking_window_label: booking.bookingWindow === 'AM' ? '08:00 - 13:00' : '13:00 - 17:00',
    route_fit: booking.routeFit,
    route_fit_label: booking.routeFitLabel,
    route_message: booking.routeMessage,
    route_review_required: booking.routeReviewRequired,
    existing_route_areas: booking.existingRouteAreas,
    route_display_priority: booking.routeDisplayPriority,
    access_instructions: booking.accessInstructions,
    source: booking.source,
    created_from: 'booking_app_stripe_checkout',
    stripe_checkout_session_id: sessionId,
    stripe_payment_status: 'pending',
    deposit_status: booking.isCommercial ? 'commercial_review' : 'deposit_pending',
    capacity_rule: {
      am_capacity: 5,
      pm_capacity: 3,
      day_capacity: 8
    },
    created_at: now
  };

  const { data: contact } = await supabase
    .from('contacts')
    .insert({
      id: generateUUID(),
      name: booking.clientName,
      email: booking.clientEmail,
      phone: booking.clientPhone,
      type: 'Client',
      client_reference: booking.reference
    })
    .select()
    .single();

  const { data: property } = await supabase
    .from('properties')
    .insert({
      id: generateUUID(),
      contact_id: contact ? contact.id : null,
      address: booking.propertyAddress,
      postcode: booking.postcode,
      city: 'London',
      access_notes: booking.accessInstructions
    })
    .select()
    .single();

  const { data: lead } = await supabase
    .from('leads')
    .insert({
      contact_id: contact ? contact.id : null,
      property_address: booking.propertyAddress,
      postcode: booking.postcode,
      source: booking.source,
      status,
      estimated_value: booking.invoiceAmount,
      quoted_price: booking.invoiceAmount,
      epc_type: booking.serviceType,
      client_name: booking.clientName,
      client_email: booking.clientEmail,
      client_phone: booking.clientPhone,
      customer_name: booking.clientName,
      customer_email: booking.clientEmail,
      customer_phone: booking.clientPhone,
      notes: booking.accessInstructions,
      documents
    })
    .select()
    .single();

  const { data: job, error: jobError } = await supabase
    .from('jobs')
    .insert({
      id: booking.jobId,
      contact_id: contact ? contact.id : null,
      property_id: property ? property.id : null,
      reference: booking.reference,
      booking_date: booking.bookingDate,
      booking_window: booking.bookingWindow,
      provisional_eta: 'TBC',
      deposit_amount: booking.depositAmount,
      deposit_paid: false,
      invoice_issued: false,
      invoice_amount: booking.invoiceAmount,
      balance_due: booking.balanceDue,
      epc_type: booking.serviceType,
      status,
      source: booking.source,
      documents,
      field_status: null,
      notes: booking.accessInstructions
    })
    .select()
    .single();

  if (jobError) throw jobError;

  if (lead && job) {
    await supabase
      .from('leads')
      .update({
        converted_job_id: job.id,
        converted_at: now,
        documents: { ...documents, converted_job_id: job.id, converted_at: now }
      })
      .eq('id', lead.id);
  }

  return { contact, property, lead, job };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed. Use POST.' });

  try {
    const booking = buildBookingData(getBody(req));

    if (!booking.clientEmail) return res.status(400).json({ ok: false, error: 'Missing customer email.' });
    if (!booking.clientName) return res.status(400).json({ ok: false, error: 'Missing customer name.' });
    if (!booking.propertyAddress || !booking.postcode) return res.status(400).json({ ok: false, error: 'Missing property address or postcode.' });
    if (!booking.bookingDate || !booking.bookingWindow) return res.status(400).json({ ok: false, error: 'Missing booking date or window.' });
    if (!booking.isCommercial && booking.depositAmount <= 0) return res.status(400).json({ ok: false, error: 'Deposit amount must be greater than £0.' });

    const supabase = createSupabaseClient();
    await checkCapacity(supabase, booking.bookingDate, booking.bookingWindow);

    const appUrl = process.env.BOOKING_APP_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL || `https://${req.headers.host}`;

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: booking.clientEmail,
      client_reference_id: booking.reference,
      success_url: `${appUrl}/?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/?payment=cancelled`,
      line_items: [
        {
          price_data: {
            currency: 'gbp',
            product_data: {
              name: `EPC assessment deposit - ${booking.reference}`,
              description: `${booking.serviceType} EPC deposit for ${booking.propertyAddress}, ${booking.postcode}`
            },
            unit_amount: toPence(booking.depositAmount)
          },
          quantity: 1
        }
      ],
      metadata: {
        reference: booking.reference,
        job_id: booking.jobId,
        customer_name: booking.clientName,
        property_address: booking.propertyAddress,
        postcode: booking.postcode,
        booking_date: booking.bookingDate,
        booking_window: booking.bookingWindow,
        invoice_amount: String(booking.invoiceAmount),
        deposit_amount: String(booking.depositAmount),
        balance_due: String(booking.balanceDue)
      }
    });

    const saved = await savePendingBooking(supabase, booking, session.id);

    return res.status(200).json({
      ok: true,
      action: 'create_checkout_session',
      checkout_url: session.url,
      session_id: session.id,
      reference: booking.reference,
      job_id: saved.job.id
    });
  } catch (error) {
    console.error('Create checkout session failed:', error);
    return res.status(500).json({ ok: false, error: error.message || String(error) });
  }
};
