// Synthetic requests only, through a loopback Wrangler remote preview.
import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {serverConvertCases} from './lib/server-convert-cases.mjs';
const origin='http://127.0.0.1:8796';
const descriptor=await(await fetch(origin,{signal:AbortSignal.timeout(15000)})).json();
assert.match(descriptor.version,/^convert-sql-3-/);
const results=[],startedAt=new Date().toISOString();
const send=async sample=>{
 const start=performance.now(),response=await fetch(origin+'/convert',{method:'POST',headers:{'Content-Type':'application/json','X-Convert-Version':descriptor.version},body:JSON.stringify({text:sample.text,names:sample.names}),signal:AbortSignal.timeout(30000)});
 const result=await response.json();
 assert.equal(response.headers.get('X-Convert-Reads'),null);assert.equal(response.headers.get('X-Convert-Error'),null);
 if(response.ok||response.status===413)assert.equal(result.version,descriptor.version);
 const record={id:sample.id,status:response.status,error:result.error,diagnostics:result.diagnostics,roundTripMs:performance.now()-start};results.push(record);
 return {response,result};
};
try{
 const cases=serverConvertCases.map(sample=>sample.id==='candidateOverflow'?{...sample,expectedStatus:400,expectedError:'invalid_input'}:{...sample,text:sample.text.slice(0,256),expectedStatus:200,expectedError:undefined});
 for(const sample of [...cases,{id:'nameExpansion',text:'甲'.repeat(256),names:[{key:'$甲',value:'x'.repeat(256)}],expectedStatus:413,expectedError:'output_limit'}]){
  const {response,result}=await send(sample);assert.equal(response.status,sample.expectedStatus??200);
  if(sample.expectedStatus>=400){assert.equal(result.error,sample.expectedError);assert.equal(result.tokens,undefined);}
  else{assert.ok(result.tokens.length);assert.equal(result.lookups.length,result.tokens.filter(t=>t.source.trim()).length);for(const token of result.tokens)assert.equal(token.source,sample.text.slice(token.sourceStart,token.sourceEnd));}
 }
 const overlapping=await Promise.all([send(serverConvertCases[0]),send(serverConvertCases[0])]);
 // Network timing may serialize both short requests; deterministic lease
 // contention is separately exercised with a held engine in local workerd/D1.
 assert.ok(overlapping.every(r=>[200,429].includes(r.response.status)));
 assert.ok(overlapping.some(r=>r.response.status===200));
 console.log(JSON.stringify({status:'PASS',requests:results.length,startedAt,finishedAt:new Date().toISOString()}));
}finally{await writeFile('.dsh-tmp/server-convert/production-worker-smoke.json',JSON.stringify({startedAt,finishedAt:new Date().toISOString(),version:descriptor.version,syntheticOnly:true,results},null,2));}
