import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {splitAiText} from '../src/features/ai/services/ai-parts';
import {AI_DEFAULTS} from '../src/features/ai/services/ai-reading';
import {filterNamesForText} from '../src/features/ai/services/ai-translate';
const origin='https://thu-phong-private.pages.dev',dir='.dsh-tmp/model-retest';mkdirSync(dir,{recursive:true});
const fixture=JSON.parse(readFileSync('.dsh-tmp/model-benchmark/fixture.json','utf8')),baseline=JSON.parse(readFileSync('.dsh-tmp/model-benchmark/results.json','utf8'));
if(createHash('sha256').update(fixture.chapter.text).digest('hex')!==baseline.sourceSha256)throw Error('Source differs from baseline');
const text=splitAiText(fixture.chapter.text,fixture.names.map((n:{key:string})=>n.key))[0].text;
const models=['gemini-3.5-flash','gemini-3.6-flash','gemini-3.7-flash','gemini-3.8-flash','gemma-4-26b-a4b-it'];
const runId=randomUUID(),jobs=models.flatMap(model=>[1,2].map(round=>({model,round,id:model+'-r'+round}))),results:unknown[]=[],events:unknown[]=[];
let buffer='',active=0,maxActive=0,index=0,tailConnected=false;
const tail=spawn(process.execPath,['node_modules/wrangler/bin/wrangler.js','tail','thu-phong-ai','--config','wrangler.ai.jsonc','--format','json','--header','x-ai-retest-run:'+runId],{windowsHide:true,stdio:['ignore','pipe','pipe']});
const save=()=>writeFileSync(dir+'/results.json',JSON.stringify({runId,sourceChars:fixture.chapter.text.length,partChars:text.length,sourceSha256:baseline.sourceSha256,modelFallback:false,automaticRetries:false,maxConcurrent:maxActive,tailConnected,results,events},null,2));
tail.stdout.on('data',chunk=>{
 buffer+=chunk.toString();if(/Connected to|Successfully created tail/.test(buffer))tailConnected=true;
 while(true){const start=buffer.indexOf('{');if(start<0){buffer=buffer.slice(-2000);break;}let depth=0,quoted=false,escaped=false,end=-1;
  for(let p=start;p<buffer.length;p++){const c=buffer[p];if(quoted){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;}else if(c==='"')quoted=true;else if(c==='{')depth++;else if(c==='}'&&--depth===0){end=p+1;break;}}
  if(end<0)break;const raw=buffer.slice(start,end);buffer=buffer.slice(end);let e;try{e=JSON.parse(raw);}catch{continue;}
  const headers=e.event?.request?.headers??{},job=Object.entries(headers).find(([key])=>key.toLowerCase()==='x-ai-retest-job')?.[1];
  if(!jobs.some(j=>j.id===job))continue;
  tailConnected=true;
  const upstream=(e.logs??[]).flatMap((l:{message?:unknown[]})=>l.message?.[0]==='AI upstream HTTP'&&Number.isInteger(l.message[1])?[l.message[1]]:[]);
  events.push({job,timestamp:e.eventTimestamp,outcome:e.outcome,upstreamStatuses:upstream});save();
 }
 if(buffer.length>1048576)buffer='';
});
tail.stderr.on('data',()=>{});tail.on('error',()=>{tailConnected=false;});
try{
 // Give the live log subscription a bounded chance to connect, without sending AI probes.
 for(let n=0;n<30&&!tailConnected&&tail.exitCode===null;n++)await new Promise(r=>setTimeout(r,500));
 console.log(JSON.stringify({phase:'start',models,partChars:text.length,parallel:2,tailConnected}));
 const worker=async()=>{while(index<jobs.length){const job=jobs[index++],at=Date.now();maxActive=Math.max(maxActive,++active);let result;
  try{const response=await fetch(origin+'/api/ai/translate',{method:'POST',headers:{'Content-Type':'application/json','X-AI-Retest-Run':runId,'X-AI-Retest-Job':job.id},body:JSON.stringify({text,systemPrompt:AI_DEFAULTS.systemPrompt,userPromptTemplate:AI_DEFAULTS.userPromptTemplate,temperature:0,names:filterNamesForText(text,fixture.names),...(job.model==='gemini-3.6-flash'?{benchmarkModel:job.model}:{model:job.model})}),signal:AbortSignal.timeout(40000)});
   const data=await response.json(),ok=response.ok&&data.model===job.model&&data.finishReason==='STOP'&&typeof data.result==='string'&&data.result.trim();
   if(ok)writeFileSync(`${dir}/${job.id}.txt`,data.result);
   result={...job,start:at,end:Date.now(),ms:Date.now()-at,status:response.status,success:!!ok,error:response.ok?undefined:data.error,reason:response.headers.get('X-AI-Failure-Reason'),keyLabel:response.headers.get('X-AI-Key-Label'),requestId:response.headers.get('X-AI-Request-ID'),retryAfter:response.headers.get('Retry-After'),outputChars:ok?data.result.length:0,hanRemaining:ok?(data.result.match(/[\u3400-\u9fff]/g)||[]).length:undefined};
  }catch(error){result={...job,start:at,end:Date.now(),ms:Date.now()-at,success:false,error:(error as Error).name,status:0};}
  finally{active--;}
  results.push(result);save();console.log(JSON.stringify(result));
 }};
 await Promise.all([worker(),worker()]);await new Promise(r=>setTimeout(r,2000));save();
}finally{tail.kill();}
