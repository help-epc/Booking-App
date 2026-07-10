
const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');
const { bridgeEnabled, requiredEnv } = require('../_lib/v2-bridge');

async function rawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

module.exports = async function handler(req, res) {
  if (!bridgeEnabled()) return res.status(404).json({ ok: false });
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  try {
    const stripe = new Stripe(requiredEnv('STRIPE_SECRET_KEY'));
    const event = stripe.webhooks.constructEvent(await rawBody(req), req.headers['stripe-signature'], requiredEnv('V2_STRIPE_WEBHOOK_SECRET'));
    if (!['checkout.session.completed', 'checkout.session.expired'].includes(event.type)) return res.status(200).json({ received: true, ignored: true });
    const session = event.data.object;
    const supabase = createClient(requiredEnv('SUPABASE_URL'), requiredEnv('SUPABASE_SERVICE_ROLE_KEY'));
    if (event.type === 'checkout.session.expired') {
      const groupId = session.metadata && session.metadata.v2_booking_group_id;
      if (groupId) await supabase.rpc('v2_cancel_booking_draft', { p_booking_group_id: groupId, p_reason: 'stripe_checkout_expired' });
      return res.status(200).json({ received: true });
    }
    const { data: confirmation, error } = await supabase.rpc('v2_confirm_checkout', {
      p_stripe_event_id: event.id,
      p_event_type: event.type,
      p_session_id: session.id,
      p_payment_status: session.payment_status || '',
      p_amount_total_pence: session.amount_total,
      p_safe_metadata: { reference: session.metadata && session.metadata.v2_reference }
    });
    if (error) throw error;
    if (confirmation && confirmation.rejected) throw new Error('Authoritative payment validation failed.');
    return res.status(200).json({ received: true });
  } catch (error) {
    console.error('v2_stripe_webhook_failed', { code: error.code || null, message: error.message || String(error) });
    return res.status(400).json({ received: false, error: 'Webhook verification or processing failed.' });
  }
};

module.exports.config = { api: { bodyParser: false } };

