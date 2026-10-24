function v3ProtectionHeaders(req, headers = {}) {
  const oidc = String(req?.headers?.['x-vercel-oidc-token'] || '').trim();
  if (oidc) {
    headers['x-vercel-trusted-oidc-idp-token'] = oidc;
    return headers;
  }

  const bypass = String(process.env.V3_DASHBOARD_BYPASS_SECRET || process.env.V3_VERCEL_BYPASS_SECRET || '').trim();
  if (bypass) headers['x-vercel-protection-bypass'] = bypass;
  return headers;
}

module.exports = v3ProtectionHeaders;
