const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function client(fetch,storage=new Map()){
 const elements=new Map();
 const document={readyState:'loading',addEventListener(){},getElementById(id){if(!elements.has(id))elements.set(id,{});return elements.get(id)}};
 const source=fs.readFileSync(require.resolve('../v3-experience.js'),'utf8').replace('window.submitBooking=submit;','window.submitBooking=submit;window.testSendBooking=sendBooking;');
 const window={};vm.runInNewContext(source,{window,document,fetch,crypto:{randomUUID:()=>String(Math.random())},sessionStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},setTimeout:fn=>fn()});
 return window.testSendBooking;
}
test('lost response retries the exact booking once without creating a second booking',async()=>{
 const requests=[],saved=new Map();let calls=0;
 const send=client(async(url,options)=>{requests.push(options);const key=options.headers['Idempotency-Key'];if(!saved.has(key))saved.set(key,{booking_id:'one',status_url:'/status'});if(++calls===1)throw new Error('lost response');return{ok:true,json:async()=>saved.get(key)}});
 assert.equal((await send({requested_date:'2026-09-15'})).booking_id,'one');assert.equal(saved.size,1);assert.equal(requests.length,2);assert.equal(requests[0].headers['Idempotency-Key'],requests[1].headers['Idempotency-Key']);assert.equal(requests[0].body,requests[1].body);
});
test('reload preserves an uncertain request even if the form changes',async()=>{
 const storage=new Map(),requests=[];
 await assert.rejects(client(async(u,o)=>{requests.push(o);throw new Error('timeout')},storage)({requested_date:'2026-09-15'}),/not yet received confirmation/);
 const result=await client(async(u,o)=>{requests.push(o);return{ok:true,json:async()=>({booking_id:'original'})}},storage)({requested_date:'2026-09-16'});
 assert.equal(result.booking_id,'original');assert.ok(requests.every(o=>o.body===requests[0].body));assert.equal(new Set(requests.map(o=>o.headers['Idempotency-Key'])).size,1);
});
test('definitive capacity rejection allows a fresh request',async()=>{
 const storage=new Map();await assert.rejects(client(async()=>({ok:false,status:409,json:async()=>({error:'Full'})}),storage)({}),/Full/);assert.equal(storage.size,0);
});
test('proxy allows slow invoice completion and reports uncertain results honestly',async()=>{
 const source=fs.readFileSync(require.resolve('../api/v3/booking-intents.js'),'utf8');let timeout;
 const context={module:{exports:{}},process:{env:{V3_PUBLIC_BOOKING_ENABLED:'true',V3_DASHBOARD_ORIGIN:'https://example.com'}},console:{error(){}},AbortSignal:{timeout:ms=>{timeout=ms}},fetch:async()=>{throw new Error('timeout')}};
 vm.runInNewContext(source,context);const res={setHeader(){},status(n){this.code=n;return this},json(body){this.body=body;return this}};
 await context.module.exports({method:'POST',headers:{'idempotency-key':'same'},body:{}},res);
 assert.equal(timeout,55000);assert.equal(res.code,503);assert.equal(res.body.code,'V3_BOOKING_RESULT_PENDING');assert.equal(res.body.retryable,true);assert.doesNotMatch(res.body.error,/unavailable/);
});
