const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');

function getRequiredEnv(name) {
  const value = process.env[name];
  if (!value || !String(value).trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return String(value).trim();
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

function getSessionMoney(session) {
  const paid = session.amount_total ? session.amount_total / 100 : 0;
  return toMoney(paid);
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

  const updatedDocuments = {
    ...currentDocuments,
    stripe_checkout_session_id: session.id,
    stripe_payment_intent_id: session.payment_intent || currentDocuments.stripe_payment_intent_id || null,
    stripe_payment_status: 'paid',
    deposit_status: 'deposit_paid',
    deposit_paid: true,
    deposit_paid_at: new Date().toISOString(),
    deposit_paid_amount: paidAmount,
    balance_due: balanceDue,
    booking_payment_stage: 'deposit_paid_balance_due'
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
    balance_due: balanceDue
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
