const test = require('node:test');
const assert = require('node:assert/strict');
const { isV2CheckoutSession } = require('../api/v2/stripe-webhook');

test('only V2-owned Checkout Sessions enter V2 reconciliation', () => {
  assert.equal(isV2CheckoutSession({ metadata: { v2_booking_group_id: 'group', v2_reference: 'V2-REF' } }), true);
  assert.equal(isV2CheckoutSession({ metadata: {} }), false);
  assert.equal(isV2CheckoutSession({ metadata: { v2_reference: 'V2-REF' } }), false);
  assert.equal(isV2CheckoutSession(null), false);
});
