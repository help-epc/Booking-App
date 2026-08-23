const {dateRange,validateV3Availability}=require('./_lib/availability');
function required(name){const value=String(process.env[name]||'').trim();if(!value)throw new Error('Missing '+name);return value}
module.exports=async function handler(req,res){
 res.setHeader('Cache-Control','no-store');if(req.method!=='GET')return res.status(405).json({ok:false,error:'Use GET.'});
 try{const dates=dateRange(req.query?.from,req.query?.to),from=dates[0],to=dates[dates.length-1],origin=required('V3_DASHBOARD_ORIGIN').replace(/\/$/,'');const headers={Accept:'application/json'},bypass=String(process.env.V3_VERCEL_BYPASS_SECRET||'').trim();if(bypass)headers['x-vercel-protection-bypass']=bypass;
 const response=await fetch(origin+'/api/v3/public/availability?from='+encodeURIComponent(from)+'&to='+encodeURIComponent(to),{headers,signal:AbortSignal.timeout(8000)});if(!response.ok)throw new Error('V3 availability returned '+response.status);const payload=validateV3Availability(await response.json(),from,to);
 return res.status(200).json(payload);
 }catch(error){console.error('v3_booking_availability_failed',{message:error.message||String(error)});return res.status(503).json({ok:false,architecture:'clean-v3',error:'Live availability is not ready. Please call 07831 363 622 to book.'})}
};