const {PAGE}=require('./_lib/v3-booking-page');
const HOLDING=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Online booking temporarily unavailable | EPC Pro</title><style>body{margin:0;background:#f4f6f9;color:#172536;font-family:Arial,sans-serif;display:grid;min-height:100vh;place-items:center}.card{width:min(650px,calc(100% - 30px));box-sizing:border-box;background:#fff;border:1px solid #e1e7ed;border-radius:18px;padding:42px;text-align:center;box-shadow:0 18px 55px rgba(21,48,71,.12)}h1{color:#17364f;font-size:37px}p{color:#627184;font-size:18px;line-height:1.55}a{display:inline-block;color:#17364f;font-size:31px;font-weight:800;margin:15px}</style></head><body><main class="card"><h1>Online booking is temporarily unavailable</h1><p>There is a technical fault with online booking. Please call and we will arrange your EPC manually.</p><a href="tel:+447831363622">07831 363 622</a></main></body></html>`;
function previewE2E(){return process.env.VERCEL_ENV==='preview'&&process.env.VERCEL_GIT_COMMIT_REF==='codex/v3-booking-integration'}
function readinessSnapshot(response,payload){return{status:response.status,ok:response.ok,payload_ok:payload?.ok===true,platform:payload?.platform||null,architecture:payload?.architecture||null,writes_enabled:payload?.writes_enabled===true,online_booking_enabled:payload?.online_booking_enabled===true,database_configured:payload?.database_configured===true}}
async function dashboardReady(){
 if(process.env.V3_PUBLIC_BOOKING_ENABLED!=='true'&&!previewE2E()){console.warn('v3_home_readiness_disabled',{reason:'public_booking_disabled'});return false}
 const previewOrigin=previewE2E()?'https://epc-dashboard-git-codex-clean-v3-platform-help-8328s-projects.vercel.app':'';
 const origin=String(process.env.V3_DASHBOARD_ORIGIN||previewOrigin).trim().replace(/\/$/,'');
 if(!origin){console.error('v3_home_readiness_failed',{reason:'missing_dashboard_origin'});return false}
 const headers={Accept:'application/json'},bypass=String(process.env.V3_DASHBOARD_BYPASS_SECRET||'').trim();
 if(bypass)headers['x-vercel-protection-bypass']=bypass;
 try{
  const response=await fetch(origin+'/api/v3/health',{headers,signal:AbortSignal.timeout(5000)});
  const contentType=String(response.headers.get('content-type')||'');
  if(!contentType.includes('application/json')){console.error('v3_home_readiness_failed',{reason:'non_json_health_response',status:response.status,has_bypass:Boolean(bypass)});return false}
  const payload=await response.json(),snapshot=readinessSnapshot(response,payload);
  const ready=response.ok&&payload?.ok===true&&payload.platform==='EPC Pro V3'&&payload.architecture==='clean-v3'&&payload.writes_enabled===true&&payload.online_booking_enabled===true&&payload.database_configured===true;
  if(!ready)console.error('v3_home_readiness_failed',{reason:'health_validation_failed',has_bypass:Boolean(bypass),...snapshot});
  return ready
 }catch(error){console.error('v3_home_readiness_failed',{reason:'health_request_failed',has_bypass:Boolean(bypass),message:error.message||String(error)});return false}
}
module.exports=async function handler(req,res){res.setHeader('Content-Type','text/html; charset=utf-8');res.setHeader('Cache-Control','no-store, no-cache, must-revalidate, max-age=0');if(!await dashboardReady()){res.setHeader('X-Robots-Tag','noindex, nofollow');res.setHeader('X-EPC-V3-Readiness','disabled');return res.status(503).send(HOLDING)}res.setHeader('X-EPC-V3-Readiness','ready');return res.status(200).send(PAGE)};
module.exports.dashboardReady=dashboardReady;
module.exports.previewE2E=previewE2E;
module.exports.readinessSnapshot=readinessSnapshot;
