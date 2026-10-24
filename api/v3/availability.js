const v3ProtectionHeaders=require('../_lib/v3-protection-headers');
function required(name){const value=String(process.env[name]||'').trim();if(!value)throw new Error('Missing '+name);return value}
module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({ok:false,error:'Use GET.'});
  try{
    const from=String(req.query?.from||''),to=String(req.query?.to||''),postcode=String(req.query?.postcode||''),origin=String(process.env.V3_DASHBOARD_ORIGIN||(process.env.VERCEL_ENV==='preview'&&process.env.VERCEL_GIT_COMMIT_REF==='codex/v3-booking-integration'?'https://epc-dashboard-git-codex-clean-v3-platform-help-8328s-projects.vercel.app':process.env.VERCEL_ENV==='preview'&&process.env.VERCEL_GIT_COMMIT_REF==='codex/unified-booking-intake'?'https://epc-dashboard-git-v3-staging-help-8328s-projects.vercel.app':'')).trim().replace(/\/$/,''),headers=v3ProtectionHeaders(req,{Accept:'application/json'});
    const response=await fetch(`${origin}/api/v3/public/availability?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&postcode=${encodeURIComponent(postcode)}`,{headers,signal:AbortSignal.timeout(8000)}),payload=await response.json();
    if(response.status===400&&payload?.code==='MANUAL_BOOKING_REQUIRED')return res.status(400).json(payload);
    if(!response.ok||!payload?.ok||payload.architecture!=='clean-v3'||payload.source!=='epc_v3_route_capacity'||!Array.isArray(payload.dates)){console.error('v3_availability_upstream_rejected',{status:response.status,ok:payload?.ok??null,architecture:payload?.architecture||null,source:payload?.source||null,dates:Array.isArray(payload?.dates),error:String(payload?.error||'').slice(0,160)});throw new Error('V3 route availability failed validation.')}
    const dates=payload.dates.map(row=>{const periods=Object.fromEntries(['AM','PM'].map(period=>{const value=row.periods?.[period]||{},remaining=Number(value.remaining_units||0);return[period,{standard_capacity:Number(value.standard_capacity||0),used_units:Number(value.used_units||0),reserved_units:Number(value.reserved_units||0),blocked_units:Number(value.blocked_units||0),remaining_units:remaining,available:Boolean(value.available)&&remaining>0}]}));return{date:row.date,available:Object.values(periods).some(period=>period.available),reason:row.reason||null,remaining_units:Object.values(periods).reduce((total,period)=>total+period.remaining_units,0),periods}});
    return res.status(200).json({ok:true,architecture:'clean-v3',dates});
  }catch(error){
    console.error('v3_availability_proxy_failed',{message:error.message||String(error)});
    return res.status(503).json({ok:false,architecture:'clean-v3',error:'Live availability is temporarily unavailable. Please call 07831 363 622.'});
  }
};
