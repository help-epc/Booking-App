const { buildDraftRequest, idempotencyKey, requiredEnv } = require('../_lib/v2-bridge');

function enabled() {
  return process.env.V3_FREEAGENT_BOOKING_ENABLED === 'true';
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!enabled()) return res.status(404).json({ ok: false, code: 'V3_ROUTE_DISABLED', error: 'The FreeAgent booking route is not active.' });
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Use POST.' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const key = idempotencyKey(req, body);
    const draft = buildDraftRequest(body);
    if (draft.payload.properties.some(property => property.service_type !== 'domestic_epc')) {
      throw new Error('Commercial bookings use the commercial approval route.');
    }

    const dashboardOrigin = requiredEnv('V3_DASHBOARD_ORIGIN').replace(/\/$/, '');
    let parsedDashboard;
    try { parsedDashboard = new URL(dashboardOrigin); } catch { throw new Error('V3_DASHBOARD_ORIGIN is invalid.'); }
    if (parsedDashboard.protocol !== 'https:') throw new Error('V3_DASHBOARD_ORIGIN must use HTTPS.');

    const response = await fetch(`${dashboardOrigin}/api/v3/booking-deposit-invoice`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${requiredEnv('V3_BOOKING_BRIDGE_SECRET')}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Idempotency-Key': key,
        'x-vercel-protection-bypass': requiredEnv('V3_DASHBOARD_BYPASS_SECRET')
      },
      body: JSON.stringify({
        payload: draft.payload,
        booking_date: draft.bookingDate,
        booking_period: draft.bookingPeriod,
        same_building: draft.sameBuilding
      })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok || !result.payment_url) {
      const detail = typeof result.error === 'string' ? result.error : 'The FreeAgent deposit invoice could not be prepared.';
      const error = new Error(detail);
      error.code = result.code || 'FREEAGENT_DEPOSIT_PREPARATION_FAILED';
      throw error;
    }

    return res.status(200).json({
      ok: true,
      booking_group_id: result.booking_group_id,
      reference: result.reference,
      item_count: result.item_count,
      amount_pence: result.amount_pence,
      payment_url: result.payment_url,
      payment_authority: 'freeagent'
    });
  } catch (error) {
    console.error('v3_prepare_deposit_invoice_failed', { code: error.code || null, message: error.message || String(error) });
    const conflict = ['P0001', '23505', 'CAPACITY_UNAVAILABLE'].includes(error.code);
    return res.status(conflict ? 409 : 400).json({
      ok: false,
      code: conflict ? 'CAPACITY_UNAVAILABLE' : (error.code || 'FREEAGENT_DEPOSIT_PREPARATION_FAILED'),
      error: conflict
        ? 'That booking can no longer be reserved. Please select another date.'
        : (error.message || 'The FreeAgent deposit invoice could not be prepared.')
    });
  }
};
