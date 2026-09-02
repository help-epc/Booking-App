const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const page=fs.readFileSync(path.join(root,'index.html'),'utf8');
const experience=fs.readFileSync(path.join(root,'v3-experience.js'),'utf8');

test('date selection has visible orange confirmation and scrolls to calendar continue',()=>{
  assert.match(page,/\.compact-calendar-card\.selected[\s\S]*?background:\s*var\(--accent\)/);
  assert.match(page,/background:\s*var\(--accent\)/);
  assert.match(experience,/✓ Date selected/);
  assert.match(experience,/setAttribute\('aria-pressed','true'\)/);
  assert.match(experience,/\$\('step-3'\)\.querySelector\('\.btn-row'\)\.scrollIntoView/);
});

test('booking page retains the restricted automatic postcode list',()=>{
  for(const marker of['WD3','WD25','AL1','AL5'])assert.ok(page.includes(marker));
  assert.doesNotMatch(page,/onlineBookingAreas = new Set\([^\n]*(?:'E'|'EC'|'SW'|'TW'|'KT'|'RM'|'SE'|'CR'|'BR'|'DA'|'UB')/);
});

test('calendar uses concise authoritative route statuses, not raw internal zones',()=>{
  assert.match(experience,/Available — route not planned yet/);
  assert.match(experience,/Good route fit for your postcode/);
  assert.doesNotMatch(experience,/Route area:/);
});
