const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');
const page=fs.readFileSync(path.join(root,'index.html'),'utf8');
const experience=fs.readFileSync(path.join(root,'v3-experience.js'),'utf8');
const multi=fs.readFileSync(path.join(root,'multi-property-extension.js'),'utf8');

test('customer journey is five-step, date-only and uses plain payment wording',()=>{
  for(const label of['Property','Details','Calendar','Contact','Confirm'])assert.ok(page.includes(label));
  assert.ok(page.includes('Choose your preferred date'));
  assert.doesNotMatch(page,/AM \/ PM booking windows/);
  for(const wording of['Preparing your secure payment link','Payment processing','Deposit confirmed','Pay securely'])assert.ok(experience.includes(wording));
  assert.doesNotMatch(experience,/create-checkout-session|\/api\/v2|STRIPE_SECRET_KEY/);
});

test('multi-property supports exact domestic area bands and one V3 availability source',()=>{
  for(const marker of['100–150 m²','151–300 m²','301–500 m²','501–10,000 m²','Unusual area — starts at £180 with review'])assert.ok(multi.includes(marker));
  assert.ok(multi.includes('class="multi-sqm"'));
  assert.ok(experience.includes("floor_area_m2:sqm"));
  assert.ok(experience.includes("window.loadLiveAvailability=async()=>{}"));
  assert.ok(experience.includes("window.isBookingWindowSelectable=()=>true"));
  assert.doesNotMatch(multi,/window\.isBookingWindowSelectable\s*=/);
});

test('review uses 45-minute visits and required customer snapshots',()=>{
  assert.ok(experience.includes("'45 minutes per property':'45 minutes'"));
  for(const field of['first_name','surname','email','phone','access_instructions','referral_source'])assert.ok(experience.includes(field));
  for(const id of['evidence-ack','terms','cf-total','cf-deposit','cf-balance'])assert.ok(experience.includes(id)||page.includes(id));
});

test('commercial bands retain their area conversion and £180 to £535 plus POA presentation',()=>{
  assert.ok(experience.includes('window.getEstimatedSquareMeterageFromBandName=areaFromBand'));
  for(const price of['£180','£215','£255','£305','£355','£410','£455','£495','£535','POA'])assert.ok(page.includes(price));
  assert.ok(page.includes('901 m² and above'));
});
