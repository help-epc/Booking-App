
const crypto = require('crypto');

function text(value, maximum = 500) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim().slice(0, maximum);
}

function email(value) {
  const result = text(value, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) throw new Error('A valid customer email is required.');
  return result;
}

function date(value) {
  const result = text(value, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result)) throw new Error('A valid booking date is required.');
  return result;
}

function period(value) {
  const result = text(value, 2).toUpperCase();
  if (!['AM', 'PM'].includes(result)) throw new Error('The booking window must be AM or PM.');
  return result;
}

function positiveNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error(`${label} is invalid.`);
  return number;
}

function normaliseProperty(property, defaultServiceType) {
  const source = property && typeof property === 'object' ? property : {};
  const serviceType = text(source.service_type || defaultServiceType, 40).toLowerCase().includes('commercial')
    ? 'commercial_epc'
    : 'domestic_epc';
  const result = {
    address: text(source.address || source.property_address, 300),
    address_line_2: text(source.address_line_2, 200) || null,
    city: text(source.city, 100) || null,
    postcode: text(source.postcode, 16).toUpperCase(),
    access_notes: text(source.access_notes || source.access_instructions, 1000) || null,
    service_type: serviceType
  };
  if (!result.address || !result.postcode) throw new Error('Every property requires an address and postcode.');
  if (serviceType === 'commercial_epc') result.floor_area_m2 = positiveNumber(source.floor_area_m2 || source.square_meterage, 'Floor area');
  else result.property_value_gbp = positiveNumber(source.property_value_gbp || source.property_value, 'Property value');
  return result;
}

function buildDraftRequest(body = {}) {
  const customer = body.customer && typeof body.customer === 'object' ? body.customer : {};
  const sourceProperties = Array.isArray(body.properties) && body.properties.length
    ? body.properties
    : (Array.isArray(body.booking_properties) && body.booking_properties.length ? body.booking_properties : [body]);
  if (sourceProperties.length > 25) throw new Error('A maximum of 25 properties is allowed.');
  const defaultServiceType = body.service_type || body.epc_type || 'domestic_epc';
  return {
    payload: {
      customer: {
        name: text(customer.name || body.customer_name || body.client_name || body.name, 200),
        email: email(customer.email || body.customer_email || body.client_email || body.email),
        phone: text(customer.phone || body.customer_phone || body.client_phone || body.phone, 50) || null
      },
      service_type: text(defaultServiceType, 40),
      properties: sourceProperties.map(property => normaliseProperty(property, defaultServiceType))
    },
    bookingDate: date(body.booking_date || body.date),
    bookingPeriod: period(body.booking_period || body.booking_window || body.window),
    sameBuilding: body.same_building === true || body.same_building === 'true'
  };
}

function idempotencyKey(req, body) {
  const value = text((req.headers && req.headers['x-idempotency-key']) || body.idempotency_key, 200);
  if (!/^[A-Za-z0-9._:-]{16,200}$/.test(value)) throw new Error('A valid idempotency key is required.');
  return value;
}

function bridgeEnabled() {
  return process.env.V2_BOOKING_BRIDGE_ENABLED === 'true';
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value || !String(value).trim()) throw new Error(`Missing ${name}`);
  return String(value).trim();
}

function requireStripeTestSecret() {
  const value = requiredEnv('STRIPE_SECRET_KEY');
  if (!/^sk_test_[A-Za-z0-9]+$/.test(value)) {
    throw new Error('Stripe test-mode secret key required; live-mode Stripe is disabled for the V2 staging bridge.');
  }
  return value;
}

function assertStripeTestEvent(event) {
  if (!event || event.livemode !== false) {
    throw new Error('Stripe live-mode events are disabled for the V2 staging bridge.');
  }
  return event;
}

function timingSafeSecret(value, expected) {
  const a = Buffer.from(String(value || ''));
  const b = Buffer.from(String(expected || ''));
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
}

function money(pence) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(Number(pence || 0) / 100);
}

function escapeHtml(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
}

function groupedConfirmation({ group, contact, items }) {
  const rows = items.map((item, index) => {
    const property = item.property || {};
    return `${index + 1}. ${property.address_line_1}, ${property.postcode} â€” ${money(item.fee_pence)}`;
  });
  const subject = `EPC Pro booking confirmed â€” ${group.reference}`;
  const textBody = `Hello ${contact.full_name},\n\nYour EPC booking is confirmed.\n\nReference: ${group.reference}\n${rows.join('\n')}\n\nTotal: ${money(group.total_fee_pence)}\nDeposit paid: ${money(group.total_deposit_pence)}\nBalance due: ${money(group.total_fee_pence - group.total_deposit_pence)}\n\nEPC Pro\nhelp@theepc.pro`;
  const htmlRows = items.map(item => `<li>${escapeHtml(item.property.address_line_1)}, ${escapeHtml(item.property.postcode)} â€” <strong>${escapeHtml(money(item.fee_pence))}</strong></li>`).join('');
  const html = `<div style="font-family:Arial,sans-serif;color:#172033;line-height:1.55;max-width:680px;margin:auto"><h1 style="color:#1a3d5c;font-size:24px">Booking confirmed</h1><p>Hello ${escapeHtml(contact.full_name)},</p><p>Your EPC booking is confirmed.</p><p><strong>Reference:</strong> ${escapeHtml(group.reference)}</p><ol>${htmlRows}</ol><p><strong>Total:</strong> ${escapeHtml(money(group.total_fee_pence))}<br><strong>Deposit paid:</strong> ${escapeHtml(money(group.total_deposit_pence))}<br><strong>Balance due:</strong> ${escapeHtml(money(group.total_fee_pence - group.total_deposit_pence))}</p><p>EPC Pro<br><a href="mailto:help@theepc.pro">help@theepc.pro</a></p></div>`;
  return { subject, text: textBody, html };
}

module.exports = { assertStripeTestEvent, bridgeEnabled, buildDraftRequest, groupedConfirmation, idempotencyKey, money, requiredEnv, requireStripeTestSecret, timingSafeSecret };

