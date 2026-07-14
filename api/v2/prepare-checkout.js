
const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');
const { bridgeEnabled, buildDraftRequest, idempotencyKey, requiredEnv, requireStripeTestSecret } = require('../_lib/v2-bridge');

module.exports = async function handler(req, res) {
  if (!bridgeEnabled()) return res.status(404).json({ ok: false, error: 'V2 booking bridge is not active.' });
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Use POST.' });
  res.setHeader('Cache-Control', 'no-store');
  let groupId = null;
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const key = idempotencyKey(req, body);
    const draft = buildDraftRequest(body);
    const supabase = createClient(requiredEnv('SUPABASE_URL'), requiredEnv('SUPABASE_SERVICE_ROLE_KEY'));
    const { data: group, error } = await supabase.rpc('v2_create_booking_draft', {
      p_payload: draft.payload,
      p_idempotency_key: key,
      p_booking_date: draft.bookingDate,
      p_period: draft.bookingPeriod,
      p_same_building: draft.sameBuilding,
      p_hold_minutes: 30
    });
    if (error) throw error;
    groupId = group.booking_group_id;
    const returnUrl = requiredEnv('V2_BOOKING_RETURN_URL').replace(/\/$/, '');
    const stripe = new Stripe(requireStripeTestSecret());
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: draft.payload.customer.email,
      client_reference_id: group.reference,
      success_url: `${returnUrl}/?v2_payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${returnUrl}/?v2_payment=cancelled`,
      line_items: [{
        price_data: {
          currency: 'gbp',
          product_data: { name: `EPC assessment deposit â€” ${group.reference}`, description: `Deposit for ${group.item_count} EPC assessment${group.item_count === 1 ? '' : 's'}` },
          unit_amount: group.total_deposit_pence
        },
        quantity: 1
      }],
      metadata: { v2_booking_group_id: groupId, v2_reference: group.reference, v2_item_count: String(group.item_count) }
    }, { idempotencyKey: `v2-checkout:${key}` });
    const { error: attachError } = await supabase.rpc('v2_attach_checkout', { p_booking_group_id: groupId, p_session_id: session.id });
    if (attachError) throw attachError;
    return res.status(200).json({ ok: true, checkout_url: session.url, reference: group.reference, item_count: group.item_count });
  } catch (error) {
    if (groupId) {
      try {
        const supabase = createClient(requiredEnv('SUPABASE_URL'), requiredEnv('SUPABASE_SERVICE_ROLE_KEY'));
        await supabase.rpc('v2_cancel_booking_draft', { p_booking_group_id: groupId, p_reason: 'checkout_creation_failed' });
      } catch (_) {}
    }
    console.error('v2_prepare_checkout_failed', { code: error.code || null, message: error.message || String(error) });
    const conflict = ['P0001', '23505'].includes(error.code);
    return res.status(conflict ? 409 : 400).json({ ok: false, error: conflict ? 'That booking can no longer be reserved. Please select another date.' : (error.message || 'The booking could not be prepared.') });
  }
};

