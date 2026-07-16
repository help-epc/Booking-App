
const test = require('node:test');
const assert = require('node:assert/strict');
const { assertStripeEventMode, buildDraftRequest, groupedConfirmation, idempotencyKey, requireStripeSecret } = require('../api/_lib/v2-bridge');

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
  assert.match(message.text, /£140\.00/);
  assert.match(message.text, /£140\.00/);
  assert.match(message.text, /£140\.00/);
  assert.match(message.html, /Deposit paid/);
  assert.equal(message.subject, 'EPC Pro booking confirmed \u2014 V2-ABC');
  assert.ok(!message.subject.includes('â€”'));
  assert.ok(!message.text.includes('â€”'));
  assert.ok(!message.html.includes('â€”'));
});



test('accepts test and live Stripe keys while rejecting cross-mode webhook events', () => {
  const previous = process.env.STRIPE_SECRET_KEY;
  try {
    process.env.STRIPE_SECRET_KEY = 'sk_live_safe123';
    assert.equal(requireStripeSecret(), 'sk_live_safe123');
    assert.equal(assertStripeEventMode({ livemode: true }, 'sk_live_safe123').livemode, true);
    assert.throws(() => assertStripeEventMode({ livemode: false }, 'sk_live_safe123'), /does not match/i);
    process.env.STRIPE_SECRET_KEY = 'sk_test_safe123';
    assert.equal(requireStripeSecret(), 'sk_test_safe123');
    assert.equal(assertStripeEventMode({ livemode: false }, 'sk_test_safe123').livemode, false);
    assert.throws(() => assertStripeEventMode({ livemode: true }, 'sk_test_safe123'), /does not match/i);
  } finally {
    if (previous === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = previous;
  }
});
test('public booking flow loads V2 safely and preserves disabled fallback', () => {
  const fs = require('node:fs');
  const page = fs.readFileSync('index.html', 'utf8');
  const submit = fs.readFileSync('stripe-submit-override.js', 'utf8');
  const multi = fs.readFileSync('multi-property-extension.js', 'utf8');
  assert.ok(page.indexOf('/v2-booking-bridge.js') < page.indexOf('/stripe-submit-override.js'));
  assert.match(submit, /EPCV2BookingBridge.prepareCheckout/);
  assert.match(submit, /V2_BRIDGE_DISABLED/);
  assert.ok(multi.includes('/api/v2/prepare-checkout'));
});

test('confirmation worker supports authenticated Vercel cron delivery', () => {
  const fs = require('node:fs');
  const worker = fs.readFileSync('api/v2/process-email-outbox.js', 'utf8');
  assert.match(worker, /['GET', 'POST']/);
  assert.match(worker, /process.env.CRON_SECRET/);
});
