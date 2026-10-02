const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');

test('route calendar demo responses yield to the real staging proxy only when explicitly enabled',()=>{
  for(const relative of ['api/v3/quote.js','api/v3/availability.js']){
    const source=fs.readFileSync(path.join(root,relative),'utf8');
    assert.match(source,/VERCEL_GIT_COMMIT_REF==='codex\/staging-route-calendar'/);
    assert.match(source,/V3_STAGING_LIVE_ROUTE_ENABLED!=='true'/);
  }
});

test('the staging home page rechecks Dashboard readiness in live-route mode',()=>{
  const source=fs.readFileSync(path.join(root,'api/mobile-index.js'),'utf8');
  assert.match(source,/function routeCalendarDemo\(\)/);
  assert.match(source,/if\(!routeCalendarDemo\(\)&&!await dashboardReady\(\)\)/);
  assert.match(source,/if\(routeCalendarDemo\(\)\)res\.setHeader\('X-EPC-V3-Readiness','staging-preview'\)/);
});
