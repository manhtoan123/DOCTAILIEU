// Actual workerd + isolated local D1; every upstream request is intercepted.
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {build} from 'esbuild';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const dir='.dsh-tmp/capcut-runtime';mkdirSync(dir,{recursive:true});
const origin='https://reader.invalid',now=Date.now(),secret=JSON.stringify({cookie:'sessionid=synthetic-runtime-only',deviceId:'123456',tdid:'web'});
const mp3=readFileSync('tests/fixtures/tts-continuous.mp3');let behavior='success';const outbound=[];
const bundle=await build({stdin:{contents:`import {onRequest as route} from './functions/api/tts.ts';import {onRequest as gate} from './functions/_middleware.ts';Date.now=()=>${now};export default {fetch(request,env){return gate({request,env,next:()=>route({request,env})})}}`,resolveDir:process.cwd(),sourcefile:'capcut-runtime-fixture.ts'},bundle:true,write:false,format:'esm',platform:'browser',target:'es2022'});
const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-01-01',d1Databases:{DB:'capcut-runtime-fixture'},resourcePersistencePath:resolve(dir,'state-'+Date.now()),bindings:{PUBLIC_LIBRARY:'1',CAPCUT_SESSION_JSON:secret},outboundService:async request=>{
 const url=new URL(request.url);outbound.push({host:url.hostname,cookie:request.headers.get('cookie')});
 if(url.origin==='https://edit-api-sg.capcut.com'){
  assert.equal(url.pathname,'/storyboard/v1/tts/multi_platform');assert.equal(request.headers.get('cookie'),'sessionid=synthetic-runtime-only');
  const body=await request.json();assert.equal(body.tts_conf.speaker,'BV074_streaming');assert.equal(body.tts_conf.resource_id,'7102355709945188865');
  if(behavior==='expired')return new Response('private upstream detail',{status:401,headers:{'Set-Cookie':'private-upstream-cookie'}});
  return Response.json({ret:0,data:{tts_materials:[{meta_data:{url:behavior==='hostile'?'https://attacker.invalid/secret':'https://audio.ibytedtos.com/fixture.mp3'}}]}});
 }
 assert.equal(url.origin,'https://audio.ibytedtos.com');assert.equal(request.headers.get('cookie'),null);return new Response(mp3,{headers:{'Content-Type':'audio/mpeg'}});
}}));
const statuses=[];
try{
 const db=await mf.getD1Database('DB');await db.exec(readFileSync('migrations/0001_auth.sql','utf8').replace(/\r?\n/g,' '));
 const call=(ip='192.0.2.1',extra={})=>mf.dispatchFetch(origin+'/api/tts',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','CF-Connecting-IP':ip,...extra},body:JSON.stringify({text:'Xin chào từ kiểm tra tổng hợp.',voice:'BV074_streaming'})});
 let response=await mf.dispatchFetch(origin+'/api/tts');assert.equal(response.status,405);statuses.push(response.status);
 response=await call('192.0.2.1',{Origin:'https://attacker.invalid'});assert.equal(response.status,403);statuses.push(response.status);
 response=await call();assert.equal(response.status,200);assert.match(response.headers.get('Content-Security-Policy'),/connect-src 'self'/);const output=await response.json();assert.deepEqual(Buffer.from(output.data,'base64'),mp3);statuses.push(response.status);
 behavior='expired';response=await call();assert.equal(response.status,401);assert.equal(response.headers.get('Set-Cookie'),null);assert.deepEqual(await response.json(),{success:false,error:'capcut_session_expired'});statuses.push(response.status);
 behavior='hostile';const before=outbound.length;response=await call();assert.equal(response.status,502);assert.equal(outbound.length-before,1);statuses.push(response.status);
 behavior='success';const minute=Math.floor(now/60000),day=Math.floor(now/86400000);
 // Seed only this isolated DB's quota counters, then exercise concurrent handlers.
 await db.prepare('UPDATE login_limits SET attempts=119 WHERE bucket=?').bind('capcut-tts:all:'+minute).run();
 const global=await Promise.all(['192.0.2.2','192.0.2.3'].map(ip=>call(ip).then(r=>r.status)));assert.deepEqual(global.sort(),[200,429]);
 await db.prepare('UPDATE login_limits SET attempts=0 WHERE bucket=?').bind('capcut-tts:all:'+minute).run();
 await db.prepare('UPDATE login_limits SET attempts=5999 WHERE bucket=?').bind('capcut-tts:day:'+day).run();
 const daily=await Promise.all(['192.0.2.4','192.0.2.5'].map(ip=>call(ip).then(r=>r.status)));assert.deepEqual(daily.sort(),[200,429]);
 const report={status:'PASS',runtime:'actual workerd + isolated local D1 + production Pages route/middleware',PUBLIC_LIBRARY:1,http:statuses,globalMinuteConcurrent:global,globalDayConcurrent:daily,exactFemaleVoice:true,cdnCredentials:false,realSession:false,realCapcutCalls:0,remoteWrites:0,clock:'fixed to invocation time for deterministic quota boundaries'};
 writeFileSync(dir+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await mf.dispose();}
