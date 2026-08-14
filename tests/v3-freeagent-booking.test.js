const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('domestic V3 booking starts from a FreeAgent invoice', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'stripe-submit-override.js'), 'utf8');
  assert.match(source, /prepareDepositInvoice\(commonBookingData\)/);
  assert.match(source, /payment_authority !== 'freeagent'/);
  assert.doesNotMatch(source, /create-checkout-session/);
  assert.doesNotMatch(source, /prepareCheckout\(commonBookingData\)/);
});

test('server route is fail-closed and calls the privileged Dashboard bridge', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'api', 'v3', 'prepare-deposit-invoice.js'), 'utf8');
  assert.match(source, /V3_FREEAGENT_BOOKING_ENABLED/);
  assert.match(source, /V3_BOOKING_BRIDGE_SECRET/);
  assert.match(source, /V3_DASHBOARD_ORIGIN/);
  assert.match(source, /payload: draft\.payload/);
  assert.match(source, /V3_DASHBOARD_ORIGIN must use HTTPS/);
  assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(source, /createClient/);
  assert.doesNotMatch(source, /STRIPE_SECRET_KEY/);
});
