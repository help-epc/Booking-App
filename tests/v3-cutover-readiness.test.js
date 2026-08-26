const assert=require('assert');
const fs=require('fs');
const path=require('path');

const root=path.join(__dirname,'..');
const page=fs.readFileSync(path.join(root,'api','_lib','v3-booking-page.js'),'utf8');
const home=fs.readFileSync(path.join(root,'api','mobile-index.js'),'utf8');

for(const marker of[
 'id="quote"',
 'async function refreshQuote()',
 "'/api/v3/quote'",
 'q.manual_quote_required',
 'quotedValue!==currentValue',
 'Please confirm the exact fee before booking.',
 'payload.intent?.total_pence',
 'payload.intent?.deposit_pence'
])assert.ok(page.includes(marker),`Missing quote-before-booking guard: ${marker}`);

for(const marker of[
 "payload.platform==='EPC Pro V3'",
 "payload.architecture==='clean-v3'",
 'payload.writes_enabled===true',
 'payload.online_booking_enabled===true',
 'payload.database_configured===true',
 "X-EPC-V3-Readiness','disabled'",
 "X-EPC-V3-Readiness','ready'"
])assert.ok(home.includes(marker),`Missing dual-system readiness guard: ${marker}`);

assert.ok(home.includes("return res.status(503).send(HOLDING)"));
assert.ok(home.includes("return res.status(200).send(PAGE)"));
console.log('Booking App quote and dual-system cutover gates verified');
