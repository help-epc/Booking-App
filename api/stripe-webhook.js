const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');

function getRequiredEnv(name) {
  const value = process.env[name];
  if (!value || !String(value).trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return String(value).trim();
}

function getOptionalEnv(name) {
  const value = process.env[name];
  return value && String(value).trim() ? String(value).trim() : '';
}

function getStripe() {
  return new Stripe(getRequiredEnv('STRIPE_SECRET_KEY'));
}

function getSupabase() {
  return createClient(
    getRequiredEnv('SUPABASE_URL'),
    getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY')
  );
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    req.on('data', chunk => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });

    req.on('end', () => {
      resolve(Buffer.concat(chunks));
    });

    req.on('error', reject);
  });
}

function safeDocuments(row) {
  if (!row || !row.documents) return {};
  if (typeof row.documents === 'object') return row.documents;
  try {
    return JSON.parse(row.documents);
  } catch {
    return {};
  }
}

function toMoney(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : 0;
}

function formatMoney(value) {
  return `£${toMoney(value).toFixed(2)}`;
}

function getSessionMoney(session) {
  const paid = session.amount_total ? session.amount_total / 100 : 0;
  return toMoney(paid);
}

function htmlEscape(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getWindowLabel(windowValue) {
  const value = String(windowValue || '').toUpperCase();
  return value === 'PM' ? 'PM — 13:00 to 17:00' : 'AM — 08:00 to 13:00';
}

function formatDateForEmail(dateValue) {
  if (!dateValue) return 'the selected booking date';
  const date = new Date(`${dateValue}T12:00:00`);
  if (Number.isNaN(date.getTime())) return String(dateValue);
  return date.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
}

async function findJobBySessionOrReference(supabase, session) {
  const sessionId = session.id;
  const reference = session.client_reference_id || (session.metadata && session.metadata.reference) || '';
  const jobId = session.metadata && session.metadata.job_id;

  if (jobId) {
    const { data, error } = await supabase
      .from('jobs')
      .select('*')
      .eq('id', jobId)
      .maybeSingle();

    if (error) throw error;
    if (data) return data;
  }

  if (reference) {
    const { data, error } = await supabase
      .from('jobs')
      .select('*')
      .eq('reference', reference)
      .maybeSingle();

    if (error) throw error;
    if (data) return data;
  }

  const { data, error } = await supabase
    .from('jobs')
    .select('*')
    .eq('documents->>stripe_checkout_session_id', sessionId)
    .limit(1);

  if (error) throw error;
  return data && data.length ? data[0] : null;
}

async function sendResendEmail({ to, subject, html, text }) {
  const apiKey = getOptionalEnv('RESEND_API_KEY');
  const fromEmail = getOptionalEnv('RESEND_FROM_EMAIL') || 'EPC Pro <help@theepc.pro>';
  const replyTo = getOptionalEnv('BOOKING_CONFIRMATION_REPLY_TO') || 'help@theepc.pro';

  if (!apiKey) {
    console.warn('Booking confirmation email skipped because RESEND_API_KEY is not set.');
    return { sent: false, skipped: true, reason: 'RESEND_API_KEY missing' };
  }

  if (!to) {
    console.warn('Booking confirmation email skipped because customer email is missing.');
    return { sent: false, skipped: true, reason: 'Customer email missing' };
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: fromEmail,
      to,
      reply_to: replyTo,
      subject,
      html,
      text
    })
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(`Resend email failed: ${result.message || response.statusText}`);
  }

  return { sent: true, id: result.id || null };
}

function buildConfirmationEmail(job, documents, paidAmount, balanceDue) {
  const customerName = documents.customer_name || documents.client_name || 'Customer';
  const customerEmail = documents.customer_email || documents.client_email || '';
  const reference = job.reference || documents.public_reference || documents.reference || 'EPC booking';
  const address = documents.property_address || documents.address || 'the property address provided';
  const postcode = documents.postcode || '';
  const bookingDate = documents.booking_date || job.booking_date || '';
  const bookingWindow = documents.booking_window || job.booking_window || 'AM';
  const serviceType = documents.service_type || documents.epc_type || job.epc_type || 'Domestic';
  const total = documents.invoice_amount || documents.quote_amount || job.invoice_amount || 0;

  const subject = `EPC booking confirmed - ${reference}`;

  const plainText = `Dear ${customerName},

Thank you for your booking. Your ${serviceType} EPC assessment has been confirmed.

Booking reference: ${reference}
Property: ${address}${postcode ? `, ${postcode}` : ''}
Date: ${formatDateForEmail(bookingDate)}
Appointment window: ${getWindowLabel(bookingWindow)}

Payment summary:
Total assessment fee: ${formatMoney(total)}
Deposit paid: ${formatMoney(paidAmount)}
Balance remaining: ${formatMoney(balanceDue)}

The remaining balance is due after the assessment and before the final certificate/report is released.

Questions? Please reply to this email or call 07831 363 622.

Kind Regards

Paul Morris
Domestic & Non-Domestic Energy Assessor
Accreditation No. EES/026824

T. 07831 363 622
W. theepc.pro
E. help@theepc.pro`;

  const html = `
    <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.55; max-width: 640px; margin: 0 auto;">
      <h2 style="color:#1a3d5c; margin-bottom: 8px;">Your EPC booking is confirmed</h2>
      <p>Dear ${htmlEscape(customerName)},</p>
      <p>Thank you for your booking. Your ${htmlEscape(serviceType)} EPC assessment has been confirmed.</p>

      <div style="background:#f4f6f9; border:1px solid #e2e8f0; border-radius:10px; padding:16px; margin:18px 0;">
        <p style="margin:0 0 8px;"><strong>Booking reference:</strong> ${htmlEscape(reference)}</p>
        <p style="margin:0 0 8px;"><strong>Property:</strong> ${htmlEscape(address)}${postcode ? `, ${htmlEscape(postcode)}` : ''}</p>
        <p style="margin:0 0 8px;"><strong>Date:</strong> ${htmlEscape(formatDateForEmail(bookingDate))}</p>
        <p style="margin:0;"><strong>Appointment window:</strong> ${htmlEscape(getWindowLabel(bookingWindow))}</p>
      </div>

      <div style="background:#ecfdf5; border:1px solid #bbf7d0; border-radius:10px; padding:16px; margin:18px 0;">
        <p style="margin:0 0 8px;"><strong>Total assessment fee:</strong> ${htmlEscape(formatMoney(total))}</p>
        <p style="margin:0 0 8px;"><strong>Deposit paid:</strong> ${htmlEscape(formatMoney(paidAmount))}</p>
        <p style="margin:0;"><strong>Balance remaining:</strong> ${htmlEscape(formatMoney(balanceDue))}</p>
      </div>

      <p>The remaining balance is due after the assessment and before the final certificate/report is released.</p>
      <p>Questions? Please reply to this email or call <strong>07831 363 622</strong>.</p>

      <p style="margin-top:24px;">Kind Regards</p>
      <p>
        Paul Morris<br>
        Domestic &amp; Non-Domestic Energy Assessor<br>
        Accreditation No. EES/026824<br><br>
        T. 07831 363 622<br>
        W. theepc.pro<br>
        E. help@theepc.pro
      </p>
    </div>
  `;

  return { to: customerEmail, subject, html, text: plainText };
}

async function updateLeadForPaidDeposit(supabase, job, updatedDocuments) {
  if (!job || !job.lead_id) return;

  const { data: lead, error: leadFetchError } = await supabase
    .from('leads')
    .select('id, documents')
    .eq('id', job.lead_id)
    .maybeSingle();

  if (leadFetchError) throw leadFetchError;
  if (!lead) return;

  const leadDocuments = {
    ...safeDocuments(lead),
    ...updatedDocuments
  };

  const { error: leadUpdateError } = await supabase
    .from('leads')
    .update({
      status: 'Booked - Deposit Paid',
      documents: leadDocuments
    })
    .eq('id', lead.id);

  if (leadUpdateError) throw leadUpdateError;
}

async function markDepositPaid(supabase, session) {
  const job = await findJobBySessionOrReference(supabase, session);

  if (!job) {
    console.warn('Stripe webhook could not find matching job', {
      session_id: session.id,
      reference: session.client_reference_id,
      metadata: session.metadata || {}
    });
    return { matched: false };
  }

  const paidAmount = getSessionMoney(session);
  const currentDocuments = safeDocuments(job);
  const balanceDue = toMoney(
    currentDocuments.balance_due !== undefined
      ? currentDocuments.balance_due
      : job.balance_due
  );

  let emailResult = { sent: false, skipped: true, reason: 'Already sent or not attempted' };
  const shouldSendConfirmation = !currentDocuments.confirmation_email_sent;

  if (shouldSendConfirmation) {
    try {
      const emailPayload = buildConfirmationEmail(job, currentDocuments, paidAmount, balanceDue);
      emailResult = await sendResendEmail(emailPayload);
    } catch (emailError) {
      console.error('Booking confirmation email failed:', emailError);
      emailResult = { sent: false, error: emailError.message || String(emailError) };
    }
  }

  const updatedDocuments = {
    ...currentDocuments,
    stripe_checkout_session_id: session.id,
    stripe_payment_intent_id: session.payment_intent || currentDocuments.stripe_payment_intent_id || null,
    stripe_payment_status: 'paid',
    deposit_status: 'deposit_paid',
    deposit_paid: true,
    deposit_paid_at: currentDocuments.deposit_paid_at || new Date().toISOString(),
    deposit_paid_amount: paidAmount,
    balance_due: balanceDue,
    booking_payment_stage: 'deposit_paid_balance_due',
    confirmation_email_sent: currentDocuments.confirmation_email_sent || Boolean(emailResult.sent),
    confirmation_email_sent_at: currentDocuments.confirmation_email_sent_at || (emailResult.sent ? new Date().toISOString() : null),
    confirmation_email_result: emailResult
  };

  const { error: jobUpdateError } = await supabase
    .from('jobs')
    .update({
      deposit_paid: true,
      status: 'Booked - Deposit Paid',
      documents: updatedDocuments
    })
    .eq('id', job.id);

  if (jobUpdateError) throw jobUpdateError;

  await updateLeadForPaidDeposit(supabase, job, updatedDocuments);

  return {
    matched: true,
    job_id: job.id,
    reference: job.reference,
    deposit_paid_amount: paidAmount,
    balance_due: balanceDue,
    confirmation_email: emailResult
  };
}

async function markPaymentFailedOrExpired(supabase, session, statusLabel) {
  const job = await findJobBySessionOrReference(supabase, session);

  if (!job) {
    console.warn('Stripe webhook could not find matching job for failed/expired session', {
      session_id: session.id,
      reference: session.client_reference_id,
      metadata: session.metadata || {}
    });
    return { matched: false };
  }

  const currentDocuments = safeDocuments(job);
  const updatedDocuments = {
    ...currentDocuments,
    stripe_checkout_session_id: session.id,
    stripe_payment_status: statusLabel,
    deposit_status: statusLabel,
    deposit_paid: false,
    payment_updated_at: new Date().toISOString()
  };

  const { error } = await supabase
    .from('jobs')
    .update({
      deposit_paid: false,
      status: 'Booked - Deposit Pending',
      documents: updatedDocuments
    })
    .eq('id', job.id);

  if (error) throw error;

  return {
    matched: true,
    job_id: job.id,
    reference: job.reference,
    deposit_status: statusLabel
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed. Use POST.' });
  }

  try {
    const stripe = getStripe();
    const supabase = getSupabase();
    const webhookSecret = getRequiredEnv('STRIPE_WEBHOOK_SECRET');
    const signature = req.headers['stripe-signature'];

    if (!signature) {
      return res.status(400).json({ ok: false, error: 'Missing Stripe signature header.' });
    }

    const rawBody = await readRawBody(req);
    const event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);

    let result = { handled: false };

    if (event.type === 'checkout.session.completed') {
      result = await markDepositPaid(supabase, event.data.object);
    }

    if (event.type === 'checkout.session.expired') {
      result = await markPaymentFailedOrExpired(supabase, event.data.object, 'checkout_expired');
    }

    if (event.type === 'checkout.session.async_payment_failed') {
      result = await markPaymentFailedOrExpired(supabase, event.data.object, 'payment_failed');
    }

    return res.status(200).json({
      ok: true,
      received: true,
      event_type: event.type,
      result
    });
  } catch (error) {
    console.error('Stripe webhook failed:', error);
    return res.status(400).json({ ok: false, error: error.message || String(error) });
  }
};
