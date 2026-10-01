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
  assert.match(experience,/appointment selected/);
  assert.match(experience,/setAttribute\('aria-pressed','true'\)/);
  assert.match(experience,/\$\('step-3'\)\.querySelector\('\.btn-row'\)\.scrollIntoView/);
});

test('booking page retains the restricted automatic postcode list',()=>{
  for(const marker of['WD3','WD25','AL1','AL5'])assert.ok(page.includes(marker));
  assert.doesNotMatch(page,/onlineBookingAreas = new Set\([^\n]*(?:'E'|'EC'|'SW'|'TW'|'KT'|'RM'|'SE'|'CR'|'BR'|'DA'|'UB')/);
});

test('calendar only presents route-verified dates with a proposed time',()=>{
  assert.match(experience,/Route and travel time verified/);
  assert.match(experience,/suggested_time/);
  assert.match(experience,/No route-safe appointment is available/);
  assert.doesNotMatch(experience,/Route area:/);
});

