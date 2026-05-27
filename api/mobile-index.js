const fs = require('fs');
const path = require('path');

const MOBILE_CSS = `

/* EPC Pro mobile booking fixes - customer-facing layout only. */
html { -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }
body { overflow-x: hidden; }
button, input, select, textarea, .type-card, .band-option, .window-option { touch-action: manipulation; }
.field input, .field select, .field textarea { min-height: 48px; }
.btn, .type-card, .band-option, .window-option { -webkit-tap-highlight-color: rgba(224, 123, 16, 0.16); }

@media (max-width: 720px) {
  header { padding: 14px 16px; }
  .logo-mark { width: 34px; height: 34px; border-radius: 9px; }
  .logo-text { font-size: 16px; }
  .hero { padding: 26px 16px 30px; }
  .hero h1 { font-size: 31px; line-height: 1.08; }
  .hero p { font-size: 14px; line-height: 1.45; }
  .trust-badges { gap: 8px; margin-top: 16px; }
  .badge { font-size: 11px; padding: 6px 10px; }
  .progress-wrap { padding: 0 8px; overflow-x: auto; -webkit-overflow-scrolling: touch; }
  .progress-steps { min-width: 320px; max-width: none; }
  .step-tab { justify-content: center; padding: 12px 4px; gap: 4px; }
  .step-num { width: 24px; height: 24px; }
  main { padding: 14px 10px 34px; }
  .form-card { width: 100%; max-width: none; border-radius: 12px; box-shadow: 0 2px 14px rgba(17, 24, 39, 0.08); }
  .step-header { padding: 20px 16px 16px; }
  .step-header h2 { font-size: 23px; line-height: 1.12; }
  .step-header p { font-size: 13px; }
  .step-body { padding: 18px 16px; }
  .field { margin-bottom: 16px; }
  .field label, .price-band-label { font-size: 13px; }
  .field input, .field select, .field textarea { font-size: 16px; padding: 13px 12px; }
  .type-cards, .field-row, .window-options { grid-template-columns: 1fr; }
  .type-card { padding: 18px 16px; }
  .type-icon { font-size: 28px; margin-bottom: 6px; }
  .band-option { align-items: flex-start; padding: 13px 12px; gap: 10px; }
  .band-info { min-width: 0; }
  .band-range, .band-duration, .band-price { overflow-wrap: anywhere; }
  .band-price { margin-left: auto; font-size: 16px; white-space: nowrap; }
  .price-summary { padding: 16px 14px; margin-bottom: 18px; }
  .price-row { gap: 10px; }
  .price-row .label { min-width: 0; line-height: 1.25; }
  .price-row .value { white-space: normal; text-align: right; }
  .price-row.total .value { font-size: 20px; }
  .date-info, .availability-status, .route-message, .day-message, .no-dates-message { font-size: 12px; line-height: 1.42; padding: 11px 12px; }
  .days-grid { gap: 10px; }
  .day-card { padding: 14px 12px; }
  .day-top { align-items: flex-start; gap: 8px; }
  .day-capacity { min-width: 72px; font-size: 11px; }
  .window-option { min-height: 58px; padding: 13px 12px; }
  .confirm-block { padding: 15px 14px; }
  .confirm-item { flex-direction: column; gap: 2px; font-size: 13px; }
  .confirm-item .ci-label { min-width: unset; }
  .confirm-item .ci-value { overflow-wrap: anywhere; }
  .terms-check span { font-size: 12px; }
  .btn-row { position: sticky; bottom: 0; z-index: 9; background: rgba(255,255,255,0.96); backdrop-filter: blur(10px); padding: 12px 12px calc(12px + env(safe-area-inset-bottom)); gap: 10px; }
  .btn { min-height: 48px; padding: 12px 14px; font-size: 14px; justify-content: center; }
  .btn-back { flex: 0 0 auto; }
  .btn-primary, .btn-pay { flex: 1 1 auto; }
  .success-screen { padding: 36px 18px; }
  .booking-ref { display: block; width: 100%; padding: 14px 12px; }
  .booking-ref-num { font-size: 18px; letter-spacing: 1px; overflow-wrap: anywhere; }
  footer { padding: 18px 16px calc(18px + env(safe-area-inset-bottom)); }
}

@media (max-width: 380px) {
  .hero h1 { font-size: 28px; }
  .step-body, .step-header { padding-left: 14px; padding-right: 14px; }
  .btn-row { flex-wrap: wrap; }
  .btn-back, .btn-primary, .btn-pay { width: 100%; flex-basis: 100%; }
}
`;

const BETA_AREA_SCRIPT = `
<script>
(function () {
  var AREA_FIX_MARKER = 'EPC Pro beta online booking area restriction';
  if (window.__epcProBetaAreaRestrictionInstalled) return;
  window.__epcProBetaAreaRestrictionInstalled = true;

  var originalGetZone = window.getZone;
  var allowWholeAreaCodes = ['N', 'NW', 'W', 'WC', 'EN', 'HA'];
  var allowOutwardCodes = ['WD3', 'WD4', 'WD5', 'WD6', 'WD7', 'WD17', 'WD18', 'WD19', 'WD23', 'WD24', 'WD25', 'AL1', 'AL2', 'AL3', 'AL4', 'AL5'];

  function normalisePostcode(value) {
    return String(value || '').replace(/\\s/g, '').toUpperCase();
  }

  function getOutwardCode(value) {
    var clean = normalisePostcode(value);
    var match = clean.match(/^([A-Z]{1,2}[0-9][0-9A-Z]?)/);
    return match ? match[1] : '';
  }

  function getAreaCode(value) {
    var clean = normalisePostcode(value);
    var match = clean.match(/^[A-Z]+/);
    return match ? match[0] : '';
  }

  function getBetaZone(value) {
    var clean = normalisePostcode(value);
    var outward = getOutwardCode(clean);
    var area = getAreaCode(clean);

    if (!clean || clean.length < 2) return null;

    if (allowOutwardCodes.indexOf(outward) !== -1) {
      if (outward.indexOf('WD') === 0) return { code: 'WD', name: 'Watford / nearby North West route area' };
      if (outward.indexOf('AL') === 0) return { code: 'AL', name: 'St Albans / nearby North West route area' };
    }

    if (allowWholeAreaCodes.indexOf(area) !== -1) {
      if (typeof originalGetZone === 'function') {
        var original = originalGetZone(clean);
        if (original) return original;
      }
      var names = {
        N: 'North London',
        NW: 'North West London',
        W: 'West London',
        WC: 'Central / West Central London',
        EN: 'North London',
        HA: 'North West London'
      };
      return { code: area, name: names[area] || 'EPC Pro online booking area' };
    }

    return null;
  }

  function getBlockedMessage(value) {
    var clean = normalisePostcode(value);
    var outward = getOutwardCode(clean);
    var area = getAreaCode(clean);

    if (['WD1', 'WD2', 'AL6', 'AL7', 'AL8', 'AL9', 'AL10'].indexOf(outward) !== -1) {
      return 'This postcode is just outside the current automatic booking area. Please call 07831 363 622 or email help@theepc.pro and we can review it manually.';
    }

    if (['SE', 'SW', 'CR', 'BR', 'SM', 'DA', 'KT', 'TW', 'IG', 'RM', 'E', 'EC', 'UB'].indexOf(area) !== -1) {
      return 'This postcode is outside the current online booking area while we beta test the booking app. Please call 07831 363 622 or email help@theepc.pro and we can review availability manually.';
    }

    return 'This postcode is outside the current online booking area. Please call 07831 363 622 or email help@theepc.pro and we can review availability manually.';
  }

  window.getZone = function (postcode) {
    return getBetaZone(postcode);
  };

  window.checkPostcode = function () {
    var input = document.getElementById('postcode');
    var el = document.getElementById('postcode-status');
    if (!input || !el) return;

    var val = input.value.toUpperCase().trim();
    if (!val || val.length < 2) {
      el.className = 'postcode-status';
      el.textContent = '';
      if (typeof state !== 'undefined') {
        state.zone = '';
        state.zoneName = '';
      }
      return;
    }

    var zone = getBetaZone(val);
    if (zone) {
      el.className = 'postcode-status zone';
      el.innerHTML = '✓ &nbsp;' + zone.name + ' — online booking available';
      if (typeof state !== 'undefined') {
        state.zone = zone.code;
        state.zoneName = zone.name;
      }
    } else {
      el.className = 'postcode-status err';
      el.innerHTML = '✗ &nbsp;' + getBlockedMessage(val);
      if (typeof state !== 'undefined') {
        state.zone = '';
        state.zoneName = '';
      }
    }
  };

  var postcodeInput = document.getElementById('postcode');
  if (postcodeInput) {
    postcodeInput.removeEventListener('input', window.checkPostcode);
    postcodeInput.addEventListener('input', window.checkPostcode);
    postcodeInput.addEventListener('blur', window.checkPostcode);
  }

  var err = document.getElementById('err-postcode');
  if (err) err.textContent = 'This postcode is outside the current online booking area.';

  console.log(AREA_FIX_MARKER + ' installed');
})();
</script>
`;

module.exports = function handler(req, res) {
  try {
    const indexPath = path.join(process.cwd(), 'index.html');
    let html = fs.readFileSync(indexPath, 'utf8');

    if (!html.includes('EPC Pro mobile booking fixes')) {
      html = html.replace('</style>', `${MOBILE_CSS}\n</style>`);
    }

    if (!html.includes('EPC Pro beta online booking area restriction')) {
      html = html.replace('</body>', `${BETA_AREA_SCRIPT}\n</body>`);
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(html);
  } catch (error) {
    console.error('mobile-index failed:', error);
    return res.status(500).send('Booking app could not load.');
  }
};
