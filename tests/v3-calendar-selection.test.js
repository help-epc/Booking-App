const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const page=fs.readFileSync(path.join(root,'index.html'),'utf8');
const experience=fs.readFileSync(path.join(root,'v3-experience.js'),'utf8');

test('date selection uses visible AM/PM buttons and tracks the selected state',()=>{
  assert.match(page,/\.compact-calendar-card\.selected[\s\S]*?background:\s*var\(--accent\)/);
  assert.match(page,/background:\s*var\(--accent\)/);
  assert.match(experience,/for\(const period of \['AM','PM'\]\)/);
  assert.match(experience,/setAttribute\('aria-pressed','false'\)/);
  assert.match(experience,/setAttribute\('aria-pressed',String\(selected\)\)/);
});

test('booking page retains the restricted automatic postcode list',()=>{
  for(const marker of['WD3','WD25','AL1','AL5'])assert.ok(page.includes(marker));
  assert.doesNotMatch(page,/onlineBookingAreas = new Set\([^\n]*(?:'E'|'EC'|'SW'|'TW'|'KT'|'RM'|'SE'|'CR'|'BR'|'DA'|'UB')/);
});

test('calendar presents AM/PM windows without client-facing route or clock-time details',()=>{
  assert.match(experience,/AM appointment/);
  assert.match(experience,/PM appointment/);
  assert.doesNotMatch(experience,/Route and travel time verified|suggested_time|No route-safe appointment is available|Route area:/);
  assert.match(experience,/We will confirm your appointment time 24 hours beforehand/);
  assert.doesNotMatch(experience,/Route area:/);
});

