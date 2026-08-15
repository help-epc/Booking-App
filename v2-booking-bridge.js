
(function exposeInactiveV2BookingBridge(global) {
  'use strict';

  function createIdempotencyKey() {
    if (global.crypto && typeof global.crypto.randomUUID === 'function') return `booking:${global.crypto.randomUUID()}`;
    return `booking:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  }

  async function prepareDepositInvoice(payload, suppliedKey) {
    const idempotencyKey = suppliedKey || createIdempotencyKey();
    const response = await global.fetch('/api/v3/prepare-deposit-invoice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Idempotency-Key': idempotencyKey },
      body: JSON.stringify({ ...payload, idempotency_key: idempotencyKey })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.payment_url || result.payment_authority !== 'freeagent') {
      const error = new Error(result.error || 'The FreeAgent deposit invoice could not be prepared.');
      error.code = result.code || (response.status === 404 ? 'V3_ROUTE_DISABLED' : (response.status === 409 ? 'CAPACITY_UNAVAILABLE' : 'FREEAGENT_DEPOSIT_FAILED'));
      throw error;
    }
    return { ...result, idempotency_key: idempotencyKey };
  }

  async function prepareCheckout(payload, suppliedKey) {
    const idempotencyKey = suppliedKey || createIdempotencyKey();
    const response = await global.fetch('/api/v2/prepare-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Idempotency-Key': idempotencyKey },
      body: JSON.stringify({ ...payload, idempotency_key: idempotencyKey })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.checkout_url) {
      const error = new Error(result.error || 'The V2 checkout could not be prepared.');
      error.code = response.status === 404 ? 'V2_BRIDGE_DISABLED' : (response.status === 409 ? 'CAPACITY_UNAVAILABLE' : 'V2_CHECKOUT_FAILED');
      throw error;
    }
    return { ...result, idempotency_key: idempotencyKey };
  }

  // Both server routes remain fail-closed. V3 is selected only when its preview
  // environment is deliberately configured.
  global.EPCV2BookingBridge = Object.freeze({ createIdempotencyKey, prepareCheckout, prepareDepositInvoice });
})(window);

