
(function exposeInactiveV2BookingBridge(global) {
  'use strict';

  function createIdempotencyKey() {
    if (global.crypto && typeof global.crypto.randomUUID === 'function') return `booking:${global.crypto.randomUUID()}`;
    return `booking:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  }

  async function prepareCheckout(payload, suppliedKey) {
    const idempotencyKey = suppliedKey || createIdempotencyKey();
    const response = await global.fetch('/api/v2/prepare-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Idempotency-Key': idempotencyKey },
      body: JSON.stringify({ ...payload, idempotency_key: idempotencyKey })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.checkout_url) throw new Error(result.error || 'The V2 checkout could not be prepared.');
    return { ...result, idempotency_key: idempotencyKey };
  }

  // This file is deliberately not loaded by the production booking page.
  // A separately approved cutover will connect the existing submit action to this adapter.
  global.EPCV2BookingBridge = Object.freeze({ createIdempotencyKey, prepareCheckout });
})(window);

