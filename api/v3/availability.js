function required(name){const value=String(process.env[name]||'').trim();if(!value)throw new Error('Missing '+name);return value}
module.exports=async function handler(req,res){res.setHeader('Cache-Control','no-store');if(req.method!=='GET')return res.status(405).json({ok:false,error:'Use GET.'});try{const from=String(req.query?.from||''),to=String(req.query?.to||''),postcode=String(req.query?.postcode||''),origin=String(process.env.V3_DASHBOARD_ORIGIN||(process.env.VERCEL_ENV==='preview'&&process.env.VERCEL_GIT_COMMIT_REF==='codex/v3-booking-integration'?'https://epc-dashboard-git-codex-clean-v3-platform-help-8328s-projects.vercel.app':'')).trim().replace(/\/$/,''),headers={Accept:'application/json'},bypass=String(process.env.V3_DASHBOARD_BYPASS_SECRET||'').trim();if(bypass)headers['x-vercel-protection-bypass']=bypass;const response=await fetch(`${origin}/api/v3/public/availability?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&postcode=${encodeURIComponent(postcode)}`,{headers,signal:AbortSignal.timeout(8000)}),payload=await response.json();if(response.status===400&&payload?.code==='MANUAL_BOOKING_REQUIRED')return res.status(400).json(payload);if(!response.ok||!payload?.ok||payload.architecture!=='clean-v3'||payload.source!=='epc_v3_route_capacity'||!Array.isArray(payload.dates))throw new Error('V3 route availability failed validation.');return res.status(200).json(payload)}catch(error){console.error('v3_availability_proxy_failed',{message:error.message||String(error)});return res.status(503).json({ok:false,architecture:'clean-v3',error:'Live availability is temporarily unavailable. Please call 07831 363 622.'})}};
const liveAvailabilityHandler=module.exports;
module.exports=async function routeCalendarStagingAvailability(req,res){
 if(process.env.VERCEL_ENV==='preview'&&process.env.VERCEL_GIT_COMMIT_REF==='codex/staging-route-calendar'){
  const start=new Date(String(req.query?.from||'')+'T12:00:00Z'),end=new Date(String(req.query?.to||'')+'T12:00:00Z'),dates=[];
  if(!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime()))return res.status(400).json({ok:false,error:'Valid dates are required.'});
  const times=['09:15','10:45','12:30','14:15'];let index=0;
  for(let day=new Date(start);day<=end&&dates.length<46;day.setUTCDate(day.getUTCDate()+1)){
   const weekday=day.getUTCDay();if(weekday===0||weekday===6)continue;
   dates.push({date:day.toISOString().slice(0,10),available:true,remaining_units:1,automatic_period:Number(times[index%times.length].slice(0,2))<13?'AM':'PM',suggested_time:times[index++%times.length],route_status:'verified',reason:null})
  }
  res.setHeader('Cache-Control','no-store');
  return res.status(200).json({ok:true,architecture:'clean-v3',source:'epc_v3_route_capacity',writes_enabled:false,staging_preview:true,from:String(req.query?.from||''),to:String(req.query?.to||''),dates})
 }
 return liveAvailabilityHandler(req,res)
};

