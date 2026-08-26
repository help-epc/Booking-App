const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');
const read=(...parts)=>fs.readFileSync(path.join(root,...parts),'utf8');

test('public booking mutation is stopped locally before any Dashboard request',()=>{
  const source=read('api','v3','booking-intents.js');
  const gate=source.indexOf("V3_PUBLIC_BOOKING_ENABLED!=='true'");
  const origin=source.indexOf("const origin=");
  const request=source.indexOf("fetch(origin+'/api/v3/public/booking-intents'");
  assert.ok(gate>=0);
  assert.ok(origin>=0);
  assert.ok(gate<origin,'local booking gate must run before Dashboard configuration');
  assert.ok(gate<request,'local booking gate must run before the Dashboard mutation request');
  assert.match(source,/return res\.status\(503\).*V3_BOOKING_DISABLED/);
});

test('preview build context excludes every legacy route and publishes only clean V3 APIs',()=>{
  for(const legacy of['create-checkout-session.js','prepare-checkout.js','stripe-webhook.js','v2-booking-bridge.js']){
    assert.equal(fs.existsSync(path.join(root,'api',legacy)),false,legacy+' must not exist in the deployed build context');
  }
  assert.equal(fs.existsSync(path.join(root,'api','mobile-index.js')),true);
  for(const route of['availability.js','booking-intents.js','booking-status.js','quote.js']){
    assert.equal(fs.existsSync(path.join(root,'api','v3',route)),true,route+' must exist in the clean V3 build context');
  }
  const config=JSON.parse(read('vercel.json'));
  assert.equal(JSON.stringify(config).includes('/v2'),false);
  assert.equal(config.crons,undefined);
});
