
const test = require('node:test');
const assert = require('node:assert/strict');
const { assertStripeTestEvent, buildDraftRequest, groupedConfirmation, idempotencyKey, requireStripeTestSecret } = require('../api/_lib/v2-bridge');

test('normalises a single domestic booking without accepting prices', () => {
  const result = buildDraftRequest({ customer_name: ' Jane  Doe ', customer_email: 'JANE@EXAMPLE.COM', booking_date: '2027-01-10', booking_window: 'am', address: '1 Test Road', postcode: 'sw1a 1aa', property_value: 999999, price: 1, deposit: 1 });
  assert.equal(result.payload.customer.email, 'jane@example.com');
  assert.equal(result.payload.properties.length, 1);
  assert.equal(result.payload.properties[0].property_value_gbp, 999999);
  assert.equal(Object.hasOwn(result.payload.properties[0], 'price'), false);
  assert.equal(result.bookingPeriod, 'AM');
});

test('normalises multiple properties independently', () => {
  const result = buildDraftRequest({ customer: { name: 'Jane', email: 'jane@example.com' }, booking_date: '2027-01-10', booking_period: 'PM', same_building: true, properties: [
    { address: 'Flat 1, Block A', postcode: 'SW1A 1AA', property_value_gbp: 999999 },
    { address: 'Flat 2, Block A', postcode: 'SW1A 1AA', property_value_gbp: 2500000 }
  ] });
  assert.equal(result.payload.properties[0].property_value_gbp, 999999);
  assert.equal(result.payload.properties[1].property_value_gbp, 2500000);
  assert.equal(result.sameBuilding, true);
});

test('requires a caller idempotency key', () => {
  assert.throws(() => idempotencyKey({ headers: {} }, {}), /idempotency/i);
  assert.equal(idempotencyKey({ headers: { 'x-idempotency-key': 'booking-1234567890' } }, {}), 'booking-1234567890');
});

test('creates one grouped confirmation listing all properties', () => {
  const message = groupedConfirmation({ group: { reference: 'V2-ABC', total_fee_pence: 14000, total_deposit_pence: 7000 }, contact: { full_name: 'Jane' }, items: [
    { fee_pence: 6000, property: { address_line_1: 'Flat 1', postcode: 'SW1A 1AA' } },
    { fee_pence: 8000, property: { address_line_1: 'Flat 2', postcode: 'SW1A 1AA' } }
  ] });
  assert.match(message.text, /Flat 1/);
  assert.match(message.text, /Flat 2/);
  assert.match(message.text, /Â£140\.00/);
  assert.match(message.html, /Deposit paid/);
});



test('fails closed before Stripe can use a live secret key or live event', () => {
  const previous = process.env.STRIPE_SECRET_KEY;
  try {
    process.env.STRIPE_SECRET_KEY = 'sk_live_forbidden';
    assert.throws(() => requireStripeTestSecret(), /test-mode secret key required/i);
    process.env.STRIPE_SECRET_KEY = 'sk_test_safe123';
    assert.equal(requireStripeTestSecret(), 'sk_test_safe123');
    assert.throws(() => assertStripeTestEvent({ livemode: true }), /live-mode events are disabled/i);
    assert.equal(assertStripeTestEvent({ livemode: false }).livemode, false);
  } finally {
    if (previous === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = previous;
  }
});
