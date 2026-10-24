const test = require('node:test');
const assert = require('node:assert/strict');
const v3ProtectionHeaders = require('../api/_lib/v3-protection-headers');

test('forwards the Vercel OIDC token for trusted-source access', () => {
  const previousDashboard = process.env.V3_DASHBOARD_BYPASS_SECRET;
  const previousLegacy = process.env.V3_VERCEL_BYPASS_SECRET;
  delete process.env.V3_DASHBOARD_BYPASS_SECRET;
  delete process.env.V3_VERCEL_BYPASS_SECRET;
  try {
    const headers = v3ProtectionHeaders({ headers: { 'x-vercel-oidc-token': 'short-lived-token' } }, { Accept: 'application/json' });
    assert.deepEqual(headers, {
      Accept: 'application/json',
      'x-vercel-trusted-oidc-idp-token': 'short-lived-token',
    });
  } finally {
    if (previousDashboard === undefined) delete process.env.V3_DASHBOARD_BYPASS_SECRET;
    else process.env.V3_DASHBOARD_BYPASS_SECRET = previousDashboard;
    if (previousLegacy === undefined) delete process.env.V3_VERCEL_BYPASS_SECRET;
    else process.env.V3_VERCEL_BYPASS_SECRET = previousLegacy;
  }
});

test('uses an existing Vercel bypass secret only when no OIDC token is present', () => {
  const previous = process.env.V3_DASHBOARD_BYPASS_SECRET;
  process.env.V3_DASHBOARD_BYPASS_SECRET = 'legacy-secret';
  try {
    const headers = v3ProtectionHeaders({ headers: {} }, { Accept: 'application/json' });
    assert.deepEqual(headers, {
      Accept: 'application/json',
      'x-vercel-protection-bypass': 'legacy-secret',
    });
  } finally {
    if (previous === undefined) delete process.env.V3_DASHBOARD_BYPASS_SECRET;
    else process.env.V3_DASHBOARD_BYPASS_SECRET = previous;
  }
});
