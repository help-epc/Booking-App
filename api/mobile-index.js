const fs = require('fs');
const path = require('path');

const MOBILE_CSS = `
/* EPC Pro mobile booking fixes */
html{-webkit-text-size-adjust:100%;text-size-adjust:100%}body{overflow-x:hidden}button,input,select,textarea,.type-card,.band-option,.window-option{touch-action:manipulation}.field input,.field select,.field textarea{min-height:48px}
@media(max-width:720px){header{padding:14px 16px}.logo-mark{width:34px;height:34px}.logo-text{font-size:16px}.hero{padding:26px 16px 30px}.hero h1{font-size:31px;line-height:1.08}.hero p{font-size:14px}.progress-wrap{padding:0 8px;overflow-x:auto}.progress-steps{min-width:320px;max-width:none}.step-tab{justify-content:center;padding:12px 4px}.step-num{width:24px;height:24px}main{padding:14px 10px 34px}.form-card{width:100%;max-width:none;border-radius:12px}.step-header{padding:20px 16px 16px}.step-header h2{font-size:23px}.step-body{padding:18px 16px}.field input,.field select,.field textarea{font-size:16px;padding:13px 12px}.type-cards,.field-row,.window-options{grid-template-columns:1fr}.type-card{padding:18px 16px}.band-option{align-items:flex-start;padding:13px 12px}.band-info{min-width:0}.band-range,.band-duration,.band-price{overflow-wrap:anywhere}.price-summary{padding:16px 14px}.date-info,.availability-status,.route-message,.day-message,.no-dates-message{font-size:12px;line-height:1.42;padding:11px 12px}.day-card{padding:14px 12px}.day-top{align-items:flex-start}.day-capacity{min-width:72px;font-size:11px}.window-option{min-height:58px}.confirm-item{flex-direction:column;gap:2px}.btn-row{position:sticky;bottom:0;z-index:9;background:rgba(255,255,255,.96);padding:12px 12px calc(12px + env(safe-area-inset-bottom))}.btn{min-height:48px}.success-screen{padding:36px 18px}.booking-ref{display:block;width:100%}footer{padding:18px 16px calc(18px + env(safe-area-inset-bottom))}}
`;

const BETA_GET_ZONE = `function getZone(pc) {
  const clean = String(pc || '').replace(/\\s/g, '').toUpperCase();
  const outwardMatch = clean.match(/^([A-Z]{1,2}[0-9][0-9A-Z]?)/);
  const outward = outwardMatch ? outwardMatch[1] : '';
  const areaMatch = clean.match(/^[A-Z]+/);
  const area = areaMatch ? areaMatch[0] : '';
  const allowedAreas = ['N', 'NW', 'W', 'WC', 'EN', 'HA'];
  const allowedOutwards = ['WD3', 'WD4', 'WD5', 'WD6', 'WD7', 'WD17', 'WD18', 'WD19', 'WD23', 'WD24', 'WD25', 'AL1', 'AL2', 'AL3', 'AL4', 'AL5'];
  if (!clean || clean.length < 2) return null;
  if (allowedOutwards.includes(outward)) {
    if (outward.startsWith('WD')) return { code: 'WD', name: 'Watford / nearby North West route area' };
    if (outward.startsWith('AL')) return { code: 'AL', name: 'St Albans / nearby North West route area' };
  }
  if (allowedAreas.includes(area)) {
    const names = { N: 'North London', NW: 'North West London', W: 'West London', WC: 'Central / West Central London', EN: 'North London', HA: 'North West London' };
    return { code: area, name: names[area] || 'EPC Pro online booking area' };
  }
  return null;
}`;

function patchBookingHtml(html) {
  let out = html;
  out = out.replace(/const londonPrefixes = \[[^\]]*\];/, "const londonPrefixes = ['N','NW','W','WC','EN','HA','WD','AL'];");
  out = out.replace(/function getZone\(pc\) \{[\s\S]*?\n\}/, BETA_GET_ZONE);
  out = out.replace('el.innerHTML = `✓ &nbsp;${zone.name} — we cover this area`;', 'el.innerHTML = `✓ &nbsp;${zone.name} — online booking available`;');
  out = out.replace('el.innerHTML = `✗ &nbsp;Sorry, this postcode is not currently recognised as a covered London area.`;', 'el.innerHTML = `✗ &nbsp;This postcode is outside our current online booking area. Please contact EPC Pro and we can review it manually.`;');
  out = out.replace(/<div class="error-msg" id="err-postcode">[\s\S]*?<\/div>/, '<div class="error-msg" id="err-postcode">This postcode is outside our current online booking area.</div>');
  if (!out.includes('EPC Pro mobile booking fixes')) out = out.replace('</style>', `${MOBILE_CSS}\n</style>`);
  return out;
}

module.exports = function handler(req, res) {
  try {
    const filePath = path.join(process.cwd(), 'index.html');
    const html = patchBookingHtml(fs.readFileSync(filePath, 'utf8'));
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(html);
  } catch (error) {
    console.error('mobile-index failed:', error);
    return res.status(500).send('Booking app could not load.');
  }
};
